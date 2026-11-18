import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { scanForSecrets } from './src/core/dlp.ts';
import { searchDecisions } from './src/core/memorySearch.ts';
import {
  canTransitionStage,
  checkBudgetGuard,
  defaultRoleForStage,
  resolveProviderForRole,
  STAGE_LABELS,
} from './src/core/orchestrator.ts';
import { buildRelayPacket, parseRelayResponse } from './src/core/packets.ts';
import type {
  ConfidentialityLevel,
  DecisionStatus,
  GovernancePolicy,
  LogicalRole,
  MissionStage,
  SubtaskStatus,
} from './src/core/types.ts';
import {
  decomposeMissionWithGemini,
  executeGeminiAgentTurn,
  getConnectorStatus,
} from './server/aiAdapters.ts';
import {
  addAuditLog,
  createDecision,
  createMission,
  createSubtask,
  createTurn,
  getDb,
  getMissionById,
  getPolicy,
  getTodaySpendUsd,
  listAuditLogs,
  listDecisions,
  listMissions,
  listProofRuns,
  listSubtasks,
  listTurns,
  savePolicy,
  saveProofRun,
  updateDecisionStatus,
  updateMissionStage,
  updateSubtaskStatus,
} from './server/db.ts';
import { runProofSandbox } from './server/proofRunner.ts';

dotenv.config();

const PORT = 3000;

async function startServer() {
  // Initialize SQLite DB & seed data before accepting requests
  getDb();

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, connectors: getConnectorStatus() });
  });

  // Full workspace snapshot
  app.get('/api/workspace', (_req, res) => {
    res.json({
      missions: listMissions(),
      subtasks: listSubtasks(),
      turns: listTurns(),
      decisions: listDecisions(),
      proofRuns: listProofRuns(),
      auditLogs: listAuditLogs(80),
      policy: getPolicy(),
      connectors: getConnectorStatus(),
      todaySpendUsd: getTodaySpendUsd(),
    });
  });

  // Create mission
  app.post('/api/missions', (req, res) => {
    try {
      const { title, objective, acceptanceCriteria, confidentiality, maxRepairs } = req.body as {
        title?: string;
        objective?: string;
        acceptanceCriteria?: string[];
        confidentiality?: ConfidentialityLevel;
        maxRepairs?: number;
      };

      if (!title || title.trim().length < 3) {
        res.status(400).json({ error: 'Le titre de la mission doit contenir au moins 3 caractères.' });
        return;
      }
      if (!objective || objective.trim().length < 10) {
        res.status(400).json({ error: 'L’objectif doit contenir au moins 10 caractères.' });
        return;
      }

      const policy = getPolicy();
      const mission = createMission({
        title,
        objective,
        acceptanceCriteria: Array.isArray(acceptanceCriteria)
          ? acceptanceCriteria.filter((c) => typeof c === 'string' && c.trim().length > 0)
          : [],
        confidentiality: confidentiality === 'CONFIDENTIAL' ? 'CONFIDENTIAL' : 'PUBLIC',
        maxRepairs:
          typeof maxRepairs === 'number' && maxRepairs >= 0 && maxRepairs <= 5
            ? maxRepairs
            : policy.maxRepairsPerMission,
      });

      res.status(201).json({ mission });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Erreur serveur' });
    }
  });

  // Transition mission stage (enforces GOVERN gates & state machine)
  app.post('/api/missions/:id/transition', (req, res) => {
    try {
      const mission = getMissionById(req.params.id);
      if (!mission) {
        res.status(404).json({ error: 'Mission introuvable.' });
        return;
      }

      const { targetStage, actor } = req.body as {
        targetStage?: MissionStage;
        actor?: 'FOUNDER' | 'SYSTEM';
      };

      if (!targetStage) {
        res.status(400).json({ error: 'targetStage requis.' });
        return;
      }

      const check = canTransitionStage(mission, targetStage, actor === 'SYSTEM' ? 'SYSTEM' : 'FOUNDER');
      if (!check.allowed) {
        res.status(409).json({ error: check.reason, requiresFounderGate: check.requiresFounderGate });
        return;
      }

      const updated = updateMissionStage(mission.id, targetStage, {
        incrementRepair: targetStage === 'REPAIR',
        founderApprovedLaunch: targetStage === 'APPROVED' ? true : undefined,
        founderSignedOff: targetStage === 'DONE' ? true : undefined,
      });

      addAuditLog(
        actor === 'SYSTEM' ? 'ORCHESTRATOR' : 'FOUNDER',
        `STAGE_${targetStage}`,
        'MISSION',
        mission.id,
        `${mission.code} : ${STAGE_LABELS[mission.stage]} -> ${STAGE_LABELS[targetStage]}`
      );

      res.json({ mission: updated });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Erreur transition' });
    }
  });

  // Create manual subtask (DECOMPOSER)
  app.post('/api/missions/:id/subtasks', (req, res) => {
    try {
      const mission = getMissionById(req.params.id);
      if (!mission) {
        res.status(404).json({ error: 'Mission introuvable.' });
        return;
      }

      const { title, description, role, acceptanceCheck } = req.body as {
        title?: string;
        description?: string;
        role?: LogicalRole;
        acceptanceCheck?: string;
      };

      if (!title || !title.trim()) {
        res.status(400).json({ error: 'Le titre de la sous-tâche est requis.' });
        return;
      }

      const validRole: LogicalRole =
        role === 'RESEARCHER' || role === 'PLANNER' || role === 'BUILDER' || role === 'AUDITOR'
          ? role
          : 'BUILDER';
      const policy = getPolicy();
      const assignedProvider = policy.roleRouting[validRole];

      const subtask = createSubtask({
        missionId: mission.id,
        title,
        description: description ?? '',
        role: validRole,
        assignedProvider,
        acceptanceCheck: acceptanceCheck ?? 'Validation par test et revue croisée.',
      });

      res.status(201).json({ subtask });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Erreur sous-tâche' });
    }
  });

  // Update subtask status
  app.patch('/api/subtasks/:id', (req, res) => {
    try {
      const { status } = req.body as { status?: SubtaskStatus };
      if (!status || !['TODO', 'IN_PROGRESS', 'BLOCKED', 'VERIFIED'].includes(status)) {
        res.status(400).json({ error: 'Statut de sous-tâche invalide.' });
        return;
      }
      updateSubtaskStatus(req.params.id, status);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Erreur mise à jour' });
    }
  });

  // AI-assisted DECOMPOSER via Gemini
  app.post('/api/missions/:id/decomposer', async (req, res) => {
    try {
      const mission = getMissionById(req.params.id);
      if (!mission) {
        res.status(404).json({ error: 'Mission introuvable.' });
        return;
      }

      const policy = getPolicy();
      const providerCheck = resolveProviderForRole('PLANNER', mission.confidentiality, policy);
      if (
        mission.confidentiality === 'CONFIDENTIAL' &&
        policy.blockConfidentialOnFreeTier
      ) {
        res.status(403).json({
          error:
            'Politique GOVERN : la décomposition automatique via Gemini Free Tier est bloquée pour les missions CONFIDENTIELLES. Ajoutez vos sous-tâches manuellement ou via Relay Packet.',
        });
        return;
      }
      void providerCheck;

      const approvedDecisions = listDecisions().filter((d) => d.status === 'APPROVED');
      const items = await decomposeMissionWithGemini({ mission, approvedDecisions });

      const created = items.map((item) =>
        createSubtask({
          missionId: mission.id,
          title: item.title,
          description: item.description,
          role: item.role,
          assignedProvider: policy.roleRouting[item.role],
          acceptanceCheck: item.acceptanceCheck,
        })
      );

      addAuditLog(
        'DECOMPOSER_GEMINI',
        'MISSION_DECOMPOSED',
        'MISSION',
        mission.id,
        `${created.length} sous-tâches générées pour ${mission.code}`
      );

      res.json({ subtasks: created });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Erreur DECOMPOSER Gemini' });
    }
  });

  // Run live Gemini API agent turn for mission
  app.post('/api/missions/:id/run-agent', async (req, res) => {
    try {
      const mission = getMissionById(req.params.id);
      if (!mission) {
        res.status(404).json({ error: 'Mission introuvable.' });
        return;
      }
      if (!mission.founderApprovedLaunch) {
        res.status(409).json({
          error: 'Le lancement de la mission doit d’abord être approuvé par le fondateur (GOVERN).',
        });
        return;
      }

      const { role: requestedRole, customPrompt } = req.body as {
        role?: LogicalRole;
        customPrompt?: string;
      };
      const role = requestedRole ?? defaultRoleForStage(mission.stage);
      const policy = getPolicy();

      if (mission.confidentiality === 'CONFIDENTIAL' && policy.blockConfidentialOnFreeTier) {
        res.status(403).json({
          error:
            'Politique GOVERN : envoi bloqué vers le Free Tier Gemini API pour une mission CONFIDENTIELLE. Utilisez le mode Relay Packet contrôlé.',
        });
        return;
      }

      const todaySpend = getTodaySpendUsd();
      const budgetCheck = checkBudgetGuard(mission, todaySpend, 0.01, policy);
      if (!budgetCheck.allowed) {
        res.status(402).json({ error: budgetCheck.reason });
        return;
      }

      const approvedDecisions = listDecisions().filter((d) => d.status === 'APPROVED');
      const prevTurns = listTurns(mission.id);
      const previousDeliverable = prevTurns[0]?.content ?? '';

      const output = await executeGeminiAgentTurn({
        mission,
        role,
        approvedDecisions,
        previousDeliverable,
        customPrompt,
        enableDlpRedaction: policy.enableDlpRedaction,
      });

      const turn = createTurn({
        missionId: mission.id,
        stage: mission.stage,
        role,
        provider: 'GEMINI_API',
        mode: 'API',
        promptSummary: customPrompt?.trim() || `Exécution ${role} (${mission.stage})`,
        content: output.content,
        structuredVerdict: output.verdict,
        tokensUsed: output.tokensUsed,
        estimatedCostUsd: output.estimatedCostUsd,
        dlpFindingsCount: output.dlpFindingsCount,
      });

      const createdDecisions = output.proposedDecisions.slice(0, 2).map((d) =>
        createDecision({
          missionId: mission.id,
          title: d.title,
          context: d.context,
          decision: d.decision,
          consequences: `Proposition issue de l'étape ${STAGE_LABELS[mission.stage]} (${mission.code}).`,
          authorRole: role,
          tags: [mission.code.toLowerCase(), role.toLowerCase()],
        })
      );

      addAuditLog(
        `GEMINI_${role}`,
        'AGENT_TURN_EXECUTED',
        'MISSION',
        mission.id,
        `${mission.code} (${role}) — ${output.tokensUsed} tokens, verdict ${output.verdict}`
      );

      res.json({ turn, createdDecisions });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Erreur Gemini API' });
    }
  });

  // Generate Relay Mission Packet ($0 mode for ChatGPT / Claude / Gemini Web)
  app.post('/api/missions/:id/relay-packet', (req, res) => {
    try {
      const mission = getMissionById(req.params.id);
      if (!mission) {
        res.status(404).json({ error: 'Mission introuvable.' });
        return;
      }

      const { role: requestedRole, customInstructions } = req.body as {
        role?: LogicalRole;
        customInstructions?: string;
      };
      const role = requestedRole ?? defaultRoleForStage(mission.stage);
      const policy = getPolicy();
      const resolution = resolveProviderForRole(role, mission.confidentiality, policy);

      const approvedDecisions = listDecisions().filter((d) => d.status === 'APPROVED');
      const prevTurns = listTurns(mission.id);
      const previousDeliverableSummary = prevTurns[0]?.content ?? '';

      const packet = buildRelayPacket({
        packetId: `PKT-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
        mission,
        targetRole: role,
        targetProvider: resolution.provider,
        approvedDecisions,
        previousDeliverableSummary,
        customInstructions,
        enableDlpRedaction: policy.enableDlpRedaction,
      });

      if (!packet.dlpScanPassed) {
        addAuditLog(
          'GOVERN_DLP',
          'RELAY_PACKET_REDACTED',
          'DLP',
          mission.id,
          `${packet.dlpFindings.length} secret(s) détecté(s) et masqué(s) dans le paquet ${packet.packetId}.`
        );
      }

      res.json({ packet, routingResolution: resolution });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Erreur Relay Packet' });
    }
  });

  // Import structured response from Relay Packet ($0 collaboration)
  app.post('/api/missions/:id/import-relay', (req, res) => {
    try {
      const mission = getMissionById(req.params.id);
      if (!mission) {
        res.status(404).json({ error: 'Mission introuvable.' });
        return;
      }

      const { role, provider, rawResponse } = req.body as {
        role?: LogicalRole;
        provider?: 'CHATGPT_RELAY' | 'CLAUDE_RELAY' | 'GEMINI_RELAY';
        rawResponse?: string;
      };

      const parsed = parseRelayResponse(rawResponse ?? '');
      if (!parsed.ok || !parsed.data) {
        res.status(400).json({ error: parsed.error ?? 'Réponse invalide.' });
        return;
      }

      const dlpFindings = scanForSecrets(parsed.data.deliverable);
      const validRole: LogicalRole =
        role === 'RESEARCHER' || role === 'PLANNER' || role === 'BUILDER' || role === 'AUDITOR'
          ? role
          : defaultRoleForStage(mission.stage);

      const turn = createTurn({
        missionId: mission.id,
        stage: mission.stage,
        role: validRole,
        provider: provider ?? 'CHATGPT_RELAY',
        mode: 'RELAY',
        promptSummary: `Import Relay Packet (${validRole})`,
        content: parsed.data.deliverable,
        structuredVerdict: parsed.data.verdict,
        tokensUsed: 0,
        estimatedCostUsd: 0,
        dlpFindingsCount: dlpFindings.length,
      });

      const createdDecisions = parsed.data.proposedDecisions.slice(0, 3).map((d) =>
        createDecision({
          missionId: mission.id,
          title: d.title,
          context: `Proposition importée via Relay (${provider ?? 'CHATGPT_RELAY'}) sur ${mission.code}.`,
          decision: d.decision,
          consequences:
            parsed.data?.risks && parsed.data.risks.length > 0
              ? `Risques associés : ${parsed.data.risks.join('; ')}`
              : 'À évaluer par le fondateur.',
          authorRole: validRole,
          tags: [mission.code.toLowerCase(), 'relay'],
        })
      );

      addAuditLog(
        provider ?? 'RELAY',
        'RELAY_RESPONSE_IMPORTED',
        'MISSION',
        mission.id,
        `Réponse importée (${validRole}, verdict ${parsed.data.verdict}, JSON=${parsed.data.parsedFromJson})`
      );

      res.status(201).json({
        turn,
        createdDecisions,
        parsedFromJson: parsed.data.parsedFromJson,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Erreur import Relay' });
    }
  });

  // Execute real PROOF sandbox (TypeScript/JS compile + DLP + VM assertion execution)
  app.post('/api/missions/:id/proof', (req, res) => {
    try {
      const mission = getMissionById(req.params.id);
      if (!mission) {
        res.status(404).json({ error: 'Mission introuvable.' });
        return;
      }

      const { language, sourceCode, testCode, enforceDlp } = req.body as {
        language?: 'typescript' | 'javascript';
        sourceCode?: string;
        testCode?: string;
        enforceDlp?: boolean;
      };

      if (!sourceCode || !sourceCode.trim()) {
        res.status(400).json({ error: 'Le code source à vérifier est requis.' });
        return;
      }

      const result = runProofSandbox({
        language: language === 'javascript' ? 'javascript' : 'typescript',
        sourceCode,
        testCode: testCode ?? '',
        enforceDlp: enforceDlp !== false,
      });

      const proofRun = saveProofRun({
        missionId: mission.id,
        language: language === 'javascript' ? 'javascript' : 'typescript',
        sourceCode,
        testCode: testCode ?? '',
        ...result,
      });

      res.status(201).json({ proofRun });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Erreur PROOF' });
    }
  });

  // Trigger REPAIR analysis using Gemini on a failed proof run
  app.post('/api/missions/:id/repair', async (req, res) => {
    try {
      const mission = getMissionById(req.params.id);
      if (!mission) {
        res.status(404).json({ error: 'Mission introuvable.' });
        return;
      }
      if (mission.repairCount >= mission.maxRepairs) {
        res.status(409).json({
          error: `Plafond de réparations atteint (${mission.repairCount}/${mission.maxRepairs}). Escalade obligatoire au fondateur.`,
        });
        return;
      }

      const policy = getPolicy();
      if (mission.confidentiality === 'CONFIDENTIAL' && policy.blockConfidentialOnFreeTier) {
        res.status(403).json({
          error:
            'Politique GOVERN : analyse REPAIR Gemini API bloquée pour une mission CONFIDENTIELLE.',
        });
        return;
      }

      const { proofRunId } = req.body as { proofRunId?: string };
      const runs = listProofRuns(mission.id);
      const targetRun = proofRunId ? runs.find((r) => r.id === proofRunId) : runs[0];
      if (!targetRun) {
        res.status(404).json({ error: 'Aucune exécution PROOF trouvée pour cette mission.' });
        return;
      }

      const approvedDecisions = listDecisions().filter((d) => d.status === 'APPROVED');
      const failureSummary = [
        `Code source (${targetRun.language}) :\n${targetRun.sourceCode}`,
        `Tests :\n${targetRun.testCode}`,
        `Erreurs de compilation : ${targetRun.compileErrors.join(' | ') || 'Aucune'}`,
        `Journaux sandbox : ${targetRun.runtimeLogs.join(' | ')}`,
      ].join('\n\n');

      const output = await executeGeminiAgentTurn({
        mission,
        role: 'BUILDER',
        approvedDecisions,
        previousDeliverable: failureSummary,
        customPrompt:
          'Analyse la cause racine de cet échec PROOF et propose un correctif minimal et testable.',
        enableDlpRedaction: policy.enableDlpRedaction,
      });

      const updatedMission = updateMissionStage(mission.id, 'REPAIR', { incrementRepair: true });
      const turn = createTurn({
        missionId: mission.id,
        stage: 'REPAIR',
        role: 'BUILDER',
        provider: 'GEMINI_API',
        mode: 'API',
        promptSummary: `Analyse REPAIR sur ${targetRun.id}`,
        content: output.content,
        structuredVerdict: output.verdict,
        tokensUsed: output.tokensUsed,
        estimatedCostUsd: output.estimatedCostUsd,
        dlpFindingsCount: output.dlpFindingsCount,
      });

      addAuditLog(
        'REPAIR_ENGINE',
        'REPAIR_TRIGGERED',
        'MISSION',
        mission.id,
        `Boucle REPAIR ${updatedMission.repairCount}/${updatedMission.maxRepairs} déclenchée.`
      );

      res.json({ mission: updatedMission, turn });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Erreur REPAIR' });
    }
  });

  // MEMORY: Search & create ADRs
  app.get('/api/decisions', (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    const status = (typeof req.query.status === 'string' ? req.query.status : 'ALL') as
      | DecisionStatus
      | 'ALL';
    const results = searchDecisions(listDecisions(), { query, statusFilter: status });
    res.json({ results });
  });

  app.post('/api/decisions', (req, res) => {
    try {
      const { missionId, title, context, decision, consequences, authorRole, tags } = req.body as {
        missionId?: string | null;
        title?: string;
        context?: string;
        decision?: string;
        consequences?: string;
        authorRole?: LogicalRole | 'FOUNDER';
        tags?: string[];
      };

      if (!title || !title.trim() || !decision || !decision.trim()) {
        res.status(400).json({ error: 'Le titre et la décision sont obligatoires.' });
        return;
      }

      const record = createDecision({
        missionId: missionId ?? null,
        title,
        context: context ?? '',
        decision,
        consequences: consequences ?? '',
        authorRole: authorRole ?? 'FOUNDER',
        tags: Array.isArray(tags) ? tags : [],
      });

      res.status(201).json({ decision: record });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Erreur création ADR' });
    }
  });

  app.post('/api/decisions/:id/status', (req, res) => {
    try {
      const { status } = req.body as { status?: DecisionStatus };
      if (!status || !['PROPOSED', 'APPROVED', 'REJECTED', 'SUPERSEDED'].includes(status)) {
        res.status(400).json({ error: 'Statut ADR invalide.' });
        return;
      }
      const updated = updateDecisionStatus(req.params.id, status);
      res.json({ decision: updated });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'ADR introuvable' });
    }
  });

  // GOVERN: Update policy & run live DLP test
  app.put('/api/govern', (req, res) => {
    try {
      const nextPolicy = req.body as GovernancePolicy;
      const saved = savePolicy(nextPolicy);
      addAuditLog(
        'FOUNDER',
        'POLICY_UPDATED',
        'GOVERN',
        'policy',
        `Routage mis à jour : Chercheur=${saved.roleRouting.RESEARCHER}, Plan=${saved.roleRouting.PLANNER}, Ingénieur=${saved.roleRouting.BUILDER}, Auditeur=${saved.roleRouting.AUDITOR}`
      );
      res.json({ policy: saved });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Politique invalide' });
    }
  });

  app.post('/api/dlp/scan', (req, res) => {
    const { text } = req.body as { text?: string };
    const findings = scanForSecrets(text ?? '');
    res.json({ passed: findings.length === 0, findings });
  });

  // Serve Vite middleware in dev, or built dist/ in production
  const isProd = process.env.NODE_ENV === 'production' || fs.existsSync(path.resolve('dist/index.html')) && process.env.npm_lifecycle_event === 'start';
  if (isProd) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NEXUS³ server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start NEXUS³ server:', err);
  process.exit(1);
});
