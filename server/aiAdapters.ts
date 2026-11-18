import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { redactSecrets, scanForSecrets } from '../src/core/dlp.ts';
import { ROLE_LABELS, STAGE_LABELS } from '../src/core/orchestrator.ts';
import type {
  ConnectorStatus,
  DecisionRecord,
  LogicalRole,
  Mission,
} from '../src/core/types.ts';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim().length === 0) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function getConnectorStatus(): ConnectorStatus {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  return {
    geminiApiConfigured: Boolean(
      geminiKey && geminiKey !== 'MY_GEMINI_API_KEY' && geminiKey.trim().length > 0
    ),
    openaiApiConfigured: Boolean(openaiKey && openaiKey.trim().length > 0),
    anthropicApiConfigured: Boolean(anthropicKey && anthropicKey.trim().length > 0),
    relayModeAlwaysReady: true,
  };
}

export interface AgentExecutionOutput {
  content: string;
  verdict: 'PASS' | 'WARN' | 'REJECT' | 'INFO';
  tokensUsed: number;
  estimatedCostUsd: number;
  dlpFindingsCount: number;
  proposedDecisions: Array<{ title: string; decision: string; context: string }>;
}

export async function executeGeminiAgentTurn(input: {
  mission: Mission;
  role: LogicalRole;
  approvedDecisions: DecisionRecord[];
  previousDeliverable: string;
  customPrompt?: string;
  enableDlpRedaction: boolean;
}): Promise<AgentExecutionOutput> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error(
      'GEMINI_API_KEY non configurée côté serveur. Vérifiez Settings > Secrets ou utilisez le mode Relay Packet (0 €).'
    );
  }

  const rawContext = [
    `Mission : ${input.mission.code} — ${input.mission.title}`,
    `Étape courante : ${STAGE_LABELS[input.mission.stage]} (${input.mission.stage})`,
    `Objectif : ${input.mission.objective}`,
    `Critères d'acceptation : ${input.mission.acceptanceCriteria.join(' | ')}`,
    'Décisions canoniques approuvées (MEMORY) :',
    ...(input.approvedDecisions.length > 0
      ? input.approvedDecisions.slice(0, 6).map((d) => `- ${d.code} (${d.title}): ${d.decision}`)
      : ['- Aucune décision préalable']),
    'Livrable précédent :',
    input.previousDeliverable || 'Aucun livrable antérieur.',
    input.customPrompt ? `Consigne spécifique du fondateur : ${input.customPrompt}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const findings = scanForSecrets(rawContext);
  const safePrompt =
    input.enableDlpRedaction && findings.length > 0
      ? redactSecrets(rawContext).redacted
      : rawContext;

  const systemInstruction = [
    `Tu es l'agent ${ROLE_LABELS[input.role]} au sein de la plateforme multi-IA NEXUS³.`,
    'Règles strictes :',
    '- Réponds en français clair, structuré et techniquement rigoureux.',
    '- Distingue explicitement les Faits, les Hypothèses et les Recommandations.',
    '- Ne prétends jamais qu’une fonctionnalité non exécutée est terminée.',
    '- Conserve ton indépendance critique : signale les risques, angles morts et points de blocage.',
  ].join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: safePrompt,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          verdict: {
            type: Type.STRING,
            description: 'PASS, WARN, REJECT, ou INFO',
          },
          summary: {
            type: Type.STRING,
            description: 'Synthèse claire en 2 à 3 phrases.',
          },
          analysisMarkdown: {
            type: Type.STRING,
            description:
              'Analyse détaillée structurée en Markdown (Faits, Hypothèses, Recommandations, Risques).',
          },
          proposedDecisions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                context: { type: Type.STRING },
                decision: { type: Type.STRING },
              },
              required: ['title', 'context', 'decision'],
            },
          },
        },
        required: ['verdict', 'summary', 'analysisMarkdown', 'proposedDecisions'],
      },
    },
  });

  const rawJson = (response.text ?? '{}').trim();
  let parsed: {
    verdict?: string;
    summary?: string;
    analysisMarkdown?: string;
    proposedDecisions?: Array<{ title: string; context: string; decision: string }>;
  } = {};

  try {
    parsed = JSON.parse(rawJson);
  } catch {
    parsed = {
      verdict: 'INFO',
      summary: rawJson.slice(0, 180),
      analysisMarkdown: rawJson,
      proposedDecisions: [],
    };
  }

  const rawV = (parsed.verdict ?? 'INFO').toUpperCase();
  const verdict =
    rawV === 'PASS' || rawV === 'WARN' || rawV === 'REJECT' || rawV === 'INFO' ? rawV : 'INFO';

  const usage = response.usageMetadata;
  const totalTokens = Number(usage?.totalTokenCount ?? 0);
  // Free tier / Flash baseline cost estimate (0 on free tier, micro-estimate shown if scaled)
  const estimatedCostUsd = Number(((totalTokens / 1_000_000) * 0.15).toFixed(6));

  return {
    content: `${parsed.summary ? `${parsed.summary}\n\n` : ''}${parsed.analysisMarkdown ?? rawJson}`,
    verdict,
    tokensUsed: totalTokens,
    estimatedCostUsd,
    dlpFindingsCount: findings.length,
    proposedDecisions: Array.isArray(parsed.proposedDecisions) ? parsed.proposedDecisions : [],
  };
}

export async function decomposeMissionWithGemini(input: {
  mission: Mission;
  approvedDecisions: DecisionRecord[];
}): Promise<
  Array<{
    title: string;
    description: string;
    role: LogicalRole;
    acceptanceCheck: string;
  }>
> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error(
      'GEMINI_API_KEY non configurée côté serveur. Ajoutez les sous-tâches manuellement ou configurez la clé dans Settings > Secrets.'
    );
  }

  const prompt = [
    `Décompose la mission NEXUS³ suivante en 3 à 5 sous-tâches atomiques et vérifiables :`,
    `Code : ${input.mission.code}`,
    `Titre : ${input.mission.title}`,
    `Objectif : ${input.mission.objective}`,
    `Critères d'acceptation : ${input.mission.acceptanceCriteria.join(' | ')}`,
    `Décisions ADR déjà approuvées : ${
      input.approvedDecisions.map((d) => `${d.code}: ${d.title}`).join(', ') || 'Aucune'
    }`,
    `Assigne à chaque sous-tâche un rôle logique parmi : RESEARCHER, PLANNER, BUILDER, AUDITOR.`,
  ].join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'Tu es le module DECOMPOSER de NEXUS³. Produis des sous-tâches concrètes, courtes et testables.',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            role: {
              type: Type.STRING,
              description: 'RESEARCHER, PLANNER, BUILDER, ou AUDITOR',
            },
            acceptanceCheck: { type: Type.STRING },
          },
          required: ['title', 'description', 'role', 'acceptanceCheck'],
        },
      },
    },
  });

  const items = JSON.parse((response.text ?? '[]').trim()) as Array<{
    title: string;
    description: string;
    role: string;
    acceptanceCheck: string;
  }>;

  const validRoles: readonly LogicalRole[] = ['RESEARCHER', 'PLANNER', 'BUILDER', 'AUDITOR'];

  return items.slice(0, 6).map((item) => ({
    title: item.title,
    description: item.description,
    role: validRoles.includes(item.role.toUpperCase() as LogicalRole)
      ? (item.role.toUpperCase() as LogicalRole)
      : 'BUILDER',
    acceptanceCheck: item.acceptanceCheck,
  }));
}
