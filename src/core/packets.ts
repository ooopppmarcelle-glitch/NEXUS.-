import { redactSecrets, scanForSecrets } from './dlp.ts';
import { ROLE_LABELS, STAGE_LABELS } from './orchestrator.ts';
import type {
  DecisionRecord,
  LogicalRole,
  Mission,
  ModelProvider,
  RelayPacket,
} from './types.ts';

export interface BuildRelayPacketInput {
  packetId: string;
  mission: Mission;
  targetRole: LogicalRole;
  targetProvider: ModelProvider;
  approvedDecisions: DecisionRecord[];
  previousDeliverableSummary: string;
  customInstructions?: string;
  enableDlpRedaction: boolean;
}

export function buildRelayPacket(input: BuildRelayPacketInput): RelayPacket {
  const {
    packetId,
    mission,
    targetRole,
    targetProvider,
    approvedDecisions,
    previousDeliverableSummary,
    customInstructions,
    enableDlpRedaction,
  } = input;

  const relevantDecisions = approvedDecisions.slice(0, 6).map((d) => ({
    code: d.code,
    title: d.title,
    decision: d.decision,
  }));

  const defaultInstructions =
    customInstructions?.trim() ||
    `Agis en tant que ${ROLE_LABELS[targetRole]}. Produis une réponse structurée, factuelle et vérifiable, en distinguant Faits, Hypothèses et Recommandations.`;

  const rawDraft = [
    `# NEXUS³ — PAQUET DE MISSION (${packetId})`,
    `- **Mission :** ${mission.code} — ${mission.title}`,
    `- **Étape :** ${STAGE_LABELS[mission.stage]} (${mission.stage})`,
    `- **Rôle ciblé :** ${ROLE_LABELS[targetRole]} (${targetRole})`,
    `- **Confidentialité :** ${mission.confidentiality}`,
    '',
    '## Objectif',
    mission.objective,
    '',
    '## Critères d’acceptation',
    ...(mission.acceptanceCriteria.length > 0
      ? mission.acceptanceCriteria.map((c, idx) => `${idx + 1}. ${c}`)
      : ['1. Livrable vérifiable et conforme aux règles NEXUS³.']),
    '',
    '## Décisions canoniques approuvées (MEMORY)',
    ...(relevantDecisions.length > 0
      ? relevantDecisions.map((d) => `- **${d.code} (${d.title}) :** ${d.decision}`)
      : ['- Aucune décision préalable approuvée.']),
    '',
    '## Contexte / Livrable précédent',
    previousDeliverableSummary || 'Aucun livrable antérieur pour cette mission.',
    '',
    '## Instructions & Format de réponse attendu',
    defaultInstructions,
    '',
    'Réponds idéalement avec un bloc JSON conforme au schéma ci-dessous (ou en Markdown structuré) :',
    '```json',
    JSON.stringify(
      {
        packetId,
        role: targetRole,
        verdict: 'PASS | WARN | REJECT | INFO',
        summary: 'Synthèse concise en 2-3 phrases',
        deliverable: 'Contenu technique détaillé, code ou plan',
        proposedDecisions: [
          {
            title: 'Titre court ADR optionnel',
            decision: 'Décision proposée à soumettre au fondateur',
          },
        ],
        risks: ['Risque identifié 1'],
      },
      null,
      2
    ),
    '```',
  ].join('\n');

  const findings = scanForSecrets(rawDraft);
  const finalMarkdown =
    enableDlpRedaction && findings.length > 0 ? redactSecrets(rawDraft).redacted : rawDraft;

  return {
    packetId,
    missionId: mission.id,
    missionCode: mission.code,
    targetRole,
    targetProvider,
    stage: mission.stage,
    confidentiality: mission.confidentiality,
    objective: mission.objective,
    acceptanceCriteria: mission.acceptanceCriteria,
    relevantDecisions,
    previousDeliverableSummary,
    instructions: defaultInstructions,
    markdownPrompt: finalMarkdown,
    dlpScanPassed: findings.length === 0,
    dlpFindings: findings,
  };
}

export interface ParsedRelayResponse {
  verdict: 'PASS' | 'WARN' | 'REJECT' | 'INFO';
  summary: string;
  deliverable: string;
  proposedDecisions: Array<{ title: string; decision: string }>;
  risks: string[];
  parsedFromJson: boolean;
}

export function parseRelayResponse(rawText: string): {
  ok: boolean;
  data?: ParsedRelayResponse;
  error?: string;
} {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { ok: false, error: 'La réponse importée est vide.' };
  }

  let jsonCandidate: string | null = null;
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch && fencedMatch[1]) {
    jsonCandidate = fencedMatch[1].trim();
  } else if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    jsonCandidate = trimmed;
  }

  if (jsonCandidate) {
    try {
      const parsed = JSON.parse(jsonCandidate) as Record<string, unknown>;
      const rawVerdict = typeof parsed.verdict === 'string' ? parsed.verdict.toUpperCase() : 'INFO';
      const verdict =
        rawVerdict === 'PASS' ||
        rawVerdict === 'WARN' ||
        rawVerdict === 'REJECT' ||
        rawVerdict === 'INFO'
          ? rawVerdict
          : 'INFO';

      const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
      const deliverable =
        typeof parsed.deliverable === 'string'
          ? parsed.deliverable.trim()
          : JSON.stringify(parsed, null, 2);

      const proposedDecisions = Array.isArray(parsed.proposedDecisions)
        ? parsed.proposedDecisions
            .filter(
              (item): item is { title: string; decision: string } =>
                typeof item === 'object' &&
                item !== null &&
                typeof (item as Record<string, unknown>).title === 'string' &&
                typeof (item as Record<string, unknown>).decision === 'string'
            )
            .map((item) => ({ title: item.title.trim(), decision: item.decision.trim() }))
        : [];

      const risks = Array.isArray(parsed.risks)
        ? parsed.risks.filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
        : [];

      return {
        ok: true,
        data: {
          verdict,
          summary: summary || deliverable.slice(0, 180),
          deliverable: summary && deliverable ? `${summary}\n\n${deliverable}` : deliverable || summary,
          proposedDecisions,
          risks,
          parsedFromJson: true,
        },
      };
    } catch {
      // Fallback gracefully to Markdown prose if a code fence wasn't valid JSON
    }
  }

  const firstParagraph = trimmed.split(/\n\s*\n/)[0]?.trim() || trimmed.slice(0, 180);
  return {
    ok: true,
    data: {
      verdict: 'INFO',
      summary: firstParagraph.slice(0, 200),
      deliverable: trimmed,
      proposedDecisions: [],
      risks: [],
      parsedFromJson: false,
    },
  };
}
