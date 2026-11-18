import type {
  ConfidentialityLevel,
  GovernancePolicy,
  LogicalRole,
  Mission,
  MissionStage,
  ModelProvider,
} from './types.ts';

const ALLOWED_TRANSITIONS: Record<MissionStage, readonly MissionStage[]> = {
  DRAFT: ['APPROVED', 'REJECTED'],
  APPROVED: ['RESEARCH', 'PLAN', 'BUILD', 'REJECTED'],
  RESEARCH: ['PLAN', 'APPROVED', 'REJECTED'],
  PLAN: ['BUILD', 'RESEARCH', 'REJECTED'],
  BUILD: ['PROOF', 'PLAN', 'REJECTED'],
  PROOF: ['CROSS_AUDIT', 'REPAIR', 'BUILD', 'REJECTED'],
  CROSS_AUDIT: ['FOUNDER_SIGN_OFF', 'REPAIR', 'PLAN', 'REJECTED'],
  REPAIR: ['PROOF', 'FOUNDER_SIGN_OFF', 'REJECTED'],
  FOUNDER_SIGN_OFF: ['DONE', 'REPAIR', 'REJECTED'],
  DONE: [],
  REJECTED: ['DRAFT'],
};

export const STAGE_LABELS: Record<MissionStage, string> = {
  DRAFT: 'Brouillon',
  APPROVED: 'Approuvée (Lancement)',
  RESEARCH: 'Recherche',
  PLAN: 'Planification',
  BUILD: 'Ingénierie',
  PROOF: 'Vérification (Proof)',
  CROSS_AUDIT: 'Audit croisé',
  REPAIR: 'Réparation',
  FOUNDER_SIGN_OFF: 'Validation finale',
  DONE: 'Terminée',
  REJECTED: 'Rejetée',
};

export const ROLE_LABELS: Record<LogicalRole, string> = {
  RESEARCHER: 'Chercheur stratégique',
  PLANNER: 'Coordinateur & Plan',
  BUILDER: 'Ingénieur logiciel',
  AUDITOR: 'Auditeur indépendant',
};

export const PROVIDER_LABELS: Record<ModelProvider, string> = {
  GEMINI_API: 'Gemini API (Live)',
  CHATGPT_RELAY: 'ChatGPT (Relay 0 €)',
  CLAUDE_RELAY: 'Claude (Relay 0 €)',
  GEMINI_RELAY: 'Gemini Web (Relay 0 €)',
  OPENAI_API: 'OpenAI API',
  ANTHROPIC_API: 'Anthropic API',
};

export interface TransitionResult {
  allowed: boolean;
  reason?: string;
  requiresFounderGate: boolean;
}

export function canTransitionStage(
  mission: Pick<Mission, 'stage' | 'repairCount' | 'maxRepairs' | 'founderApprovedLaunch'>,
  targetStage: MissionStage,
  actor: 'FOUNDER' | 'SYSTEM'
): TransitionResult {
  if (mission.stage === targetStage) {
    return {
      allowed: false,
      reason: `La mission est déjà à l'étape ${STAGE_LABELS[targetStage]}.`,
      requiresFounderGate: false,
    };
  }

  const validTargets = ALLOWED_TRANSITIONS[mission.stage];
  if (!validTargets.includes(targetStage)) {
    return {
      allowed: false,
      reason: `Transition interdite : ${STAGE_LABELS[mission.stage]} -> ${STAGE_LABELS[targetStage]}.`,
      requiresFounderGate: false,
    };
  }

  const founderOnlyTargets: readonly MissionStage[] = ['APPROVED', 'DONE', 'REJECTED'];
  const requiresFounderGate =
    founderOnlyTargets.includes(targetStage) ||
    (mission.stage === 'FOUNDER_SIGN_OFF' && targetStage !== 'REPAIR') ||
    (mission.stage === 'REJECTED' && targetStage === 'DRAFT');

  if (requiresFounderGate && actor !== 'FOUNDER') {
    return {
      allowed: false,
      reason: `L'étape ${STAGE_LABELS[targetStage]} exige la validation explicite du fondateur (GOVERN).`,
      requiresFounderGate: true,
    };
  }

  if (targetStage !== 'DRAFT' && targetStage !== 'APPROVED' && targetStage !== 'REJECTED') {
    if (!mission.founderApprovedLaunch) {
      return {
        allowed: false,
        reason: 'Le lancement de la mission doit d’abord être approuvé par le fondateur.',
        requiresFounderGate: true,
      };
    }
  }

  if (targetStage === 'REPAIR' && mission.repairCount >= mission.maxRepairs) {
    return {
      allowed: false,
      reason: `Plafond de réparations atteint (${mission.repairCount}/${mission.maxRepairs}). Escalade requise au fondateur.`,
      requiresFounderGate: false,
    };
  }

  return {
    allowed: true,
    requiresFounderGate,
  };
}

export function getAllowedNextStages(stage: MissionStage): readonly MissionStage[] {
  return ALLOWED_TRANSITIONS[stage];
}

export function defaultRoleForStage(stage: MissionStage): LogicalRole {
  switch (stage) {
    case 'RESEARCH':
      return 'RESEARCHER';
    case 'PLAN':
    case 'APPROVED':
      return 'PLANNER';
    case 'BUILD':
    case 'REPAIR':
      return 'BUILDER';
    case 'CROSS_AUDIT':
    case 'PROOF':
    case 'FOUNDER_SIGN_OFF':
      return 'AUDITOR';
    default:
      return 'RESEARCHER';
  }
}

export interface ProviderResolution {
  provider: ModelProvider;
  blockedByConfidentiality: boolean;
  reason?: string;
}

export function resolveProviderForRole(
  role: LogicalRole,
  confidentiality: ConfidentialityLevel,
  policy: GovernancePolicy
): ProviderResolution {
  const configuredProvider = policy.roleRouting[role];

  if (
    confidentiality === 'CONFIDENTIAL' &&
    policy.blockConfidentialOnFreeTier &&
    configuredProvider === 'GEMINI_API'
  ) {
    return {
      provider: configuredProvider,
      blockedByConfidentiality: true,
      reason:
        'Politique GOVERN : les missions CONFIDENTIELLES ne peuvent pas être envoyées au Free Tier Gemini API (susceptible de servir à l’entraînement). Passez en mode Relay contrôlé ou modifiez la matrice GOVERN.',
    };
  }

  return {
    provider: configuredProvider,
    blockedByConfidentiality: false,
  };
}

export function checkBudgetGuard(
  mission: Pick<Mission, 'estimatedCostUsd'>,
  todaySpendUsd: number,
  nextCallEstimatedUsd: number,
  policy: GovernancePolicy
): { allowed: boolean; reason?: string } {
  if (mission.estimatedCostUsd + nextCallEstimatedUsd > policy.maxBudgetPerMissionUsd) {
    return {
      allowed: false,
      reason: `Plafond budgétaire par mission dépassé (${(
        mission.estimatedCostUsd + nextCallEstimatedUsd
      ).toFixed(4)} $ > ${policy.maxBudgetPerMissionUsd.toFixed(2)} $).`,
    };
  }

  if (todaySpendUsd + nextCallEstimatedUsd > policy.dailyBudgetUsd) {
    return {
      allowed: false,
      reason: `Plafond budgétaire journalier dépassé (${(
        todaySpendUsd + nextCallEstimatedUsd
      ).toFixed(4)} $ > ${policy.dailyBudgetUsd.toFixed(2)} $).`,
    };
  }

  return { allowed: true };
}
