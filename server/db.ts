import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  AgentTurn,
  AuditLogEntry,
  ConfidentialityLevel,
  DecisionRecord,
  DecisionStatus,
  DlpFinding,
  GovernancePolicy,
  LogicalRole,
  Mission,
  MissionStage,
  ModelProvider,
  ProofRun,
  Subtask,
  SubtaskStatus,
} from '../src/core/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'nexus.db');

let dbInstance: DatabaseSync | null = null;

export const DEFAULT_POLICY: GovernancePolicy = {
  roleRouting: {
    RESEARCHER: 'GEMINI_API',
    PLANNER: 'CHATGPT_RELAY',
    BUILDER: 'CLAUDE_RELAY',
    AUDITOR: 'GEMINI_API',
  },
  blockConfidentialOnFreeTier: true,
  enableDlpRedaction: true,
  maxRepairsPerMission: 2,
  maxBudgetPerMissionUsd: 1.5,
  dailyBudgetUsd: 5.0,
};

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS missions (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      objective TEXT NOT NULL,
      acceptance_criteria_json TEXT NOT NULL,
      stage TEXT NOT NULL,
      confidentiality TEXT NOT NULL,
      repair_count INTEGER NOT NULL DEFAULT 0,
      max_repairs INTEGER NOT NULL DEFAULT 2,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      founder_approved_launch INTEGER NOT NULL DEFAULT 0,
      founder_signed_off INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subtasks (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      role TEXT NOT NULL,
      assigned_provider TEXT NOT NULL,
      status TEXT NOT NULL,
      acceptance_check TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_turns (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
      stage TEXT NOT NULL,
      role TEXT NOT NULL,
      provider TEXT NOT NULL,
      mode TEXT NOT NULL,
      prompt_summary TEXT NOT NULL,
      content TEXT NOT NULL,
      structured_verdict TEXT,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      dlp_findings_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      mission_id TEXT REFERENCES missions(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      context TEXT NOT NULL,
      decision TEXT NOT NULL,
      consequences TEXT NOT NULL,
      author_role TEXT NOT NULL,
      status TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      approved_by_founder INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS proof_runs (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
      language TEXT NOT NULL,
      source_code TEXT NOT NULL,
      test_code TEXT NOT NULL,
      passed INTEGER NOT NULL,
      dlp_passed INTEGER NOT NULL,
      dlp_findings_json TEXT NOT NULL,
      compile_errors_json TEXT NOT NULL,
      runtime_logs_json TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS governance_config (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  dbInstance = db;
  seedInitialData(db);
  return db;
}

function seedInitialData(db: DatabaseSync): void {
  const row = db.prepare('SELECT COUNT(*) as count FROM missions').get() as { count: number };
  if (row.count > 0) return;

  const now = new Date().toISOString();
  const missionId = 'mission-001';

  db.prepare(`
    INSERT INTO governance_config (key, value_json, updated_at)
    VALUES ('policy', ?, ?)
  `).run(JSON.stringify(DEFAULT_POLICY), now);

  db.prepare(`
    INSERT INTO missions (
      id, code, title, objective, acceptance_criteria_json, stage, confidentiality,
      repair_count, max_repairs, estimated_cost_usd, total_tokens,
      founder_approved_launch, founder_signed_off, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    missionId,
    'NEX-001',
    'Fondations techniques de NEXUS³',
    'Construire le noyau d’orchestration multi-IA (ChatGPT, Gemini, Claude) avec mémoire décisionnelle ADR, bac à sable de preuves exécutables (PROOF) et gouvernance humaine (GOVERN) fonctionnant dès 0 €.',
    JSON.stringify([
      'Machine à états bornée avec portes de validation humaine obligatoires',
      'Adaptateur hybride API directe + Paquets de Mission Relay à 0 €',
      'Scanner DLP bloquant la fuite de secrets avant tout appel externe',
      'Exécution réelle de tests TypeScript/JS dans PROOF',
    ]),
    'RESEARCH',
    'PUBLIC',
    0,
    2,
    0,
    0,
    1,
    0,
    now,
    now
  );

  const subtasks: Array<Omit<Subtask, 'createdAt'>> = [
    {
      id: 'sub-001',
      missionId,
      title: 'Étude architecturale indépendante (Volet A–J)',
      description: 'Analyser les API Gemini/OpenAI/Anthropic, protocoles MCP/A2A et risques à budget nul.',
      role: 'RESEARCHER',
      assignedProvider: 'GEMINI_API',
      status: 'VERIFIED',
      acceptanceCheck: 'Rapport 10 points validé avec distinction Faits / Hypothèses / Recommandations.',
      orderIndex: 1,
    },
    {
      id: 'sub-002',
      missionId,
      title: 'Spécification d’arbitrage et découpage DECOMPOSER',
      description: 'Définir la grille d’arbitrage des désaccords entre Gemini et Claude.',
      role: 'PLANNER',
      assignedProvider: 'CHATGPT_RELAY',
      status: 'IN_PROGRESS',
      acceptanceCheck: 'Paquet de Mission Relay généré et réponse structurée importée.',
      orderIndex: 2,
    },
    {
      id: 'sub-003',
      missionId,
      title: 'Audit du bac à sable PROOF & schéma SQLite',
      description: 'Vérifier la robustesse de la sandbox Node VM et des contraintes de réversibilité.',
      role: 'BUILDER',
      assignedProvider: 'CLAUDE_RELAY',
      status: 'TODO',
      acceptanceCheck: 'Tests d’isolation et diagnostic TypeScript passants dans PROOF.',
      orderIndex: 3,
    },
  ];

  const insertSub = db.prepare(`
    INSERT INTO subtasks (
      id, mission_id, title, description, role, assigned_provider, status, acceptance_check, order_index, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const s of subtasks) {
    insertSub.run(
      s.id,
      s.missionId,
      s.title,
      s.description,
      s.role,
      s.assignedProvider,
      s.status,
      s.acceptanceCheck,
      s.orderIndex,
      now
    );
  }

  db.prepare(`
    INSERT INTO agent_turns (
      id, mission_id, stage, role, provider, mode, prompt_summary, content, structured_verdict,
      tokens_used, estimated_cost_usd, dlp_findings_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'turn-001',
    missionId,
    'RESEARCH',
    'RESEARCHER',
    'GEMINI_API',
    'RELAY',
    'Étude d’architecture initiale NEXUS³ — Mission N°001',
    'Rapport indépendant Mission N°001 validé : architecture Local-First (TypeScript, Node, SQLite, Git), séparation stricte entre Rôle logique et Fournisseur, et mode hybride API + Relay Packet pour fonctionner dès 0 € malgré l’absence de Free Tier API chez OpenAI et Anthropic.',
    'PASS',
    0,
    0,
    0,
    now
  );

  const decisions: Array<{
    id: string;
    code: string;
    title: string;
    context: string;
    decision: string;
    consequences: string;
    authorRole: LogicalRole | 'FOUNDER';
    status: DecisionStatus;
    tags: string[];
    approved: boolean;
  }> = [
    {
      id: 'adr-001',
      code: 'ADR-001',
      title: 'Stockage local SQLite sans serveur externe',
      context: 'Le démarrage à budget nul interdit les coûts fixes de bases managées.',
      decision: 'Utiliser SQLite (node:sqlite) pour les missions, ADR et journaux, avec recherche lexicale/TF-IDF locale.',
      consequences: 'Coût 0 €, portabilité totale ; migration ultérieure possible vers PostgreSQL + pgvector.',
      authorRole: 'RESEARCHER',
      status: 'APPROVED',
      tags: ['sqlite', 'memory', 'budget-zero'],
      approved: true,
    },
    {
      id: 'adr-002',
      code: 'ADR-002',
      title: 'Mode hybride API directe + Relay Packet (0 €)',
      context: 'OpenAI et Anthropic facturent leurs API dès le premier crédit (aucun Free Tier permanent) et séparent leurs abonnements web.',
      decision: 'Supporter simultanément les appels API serveur (Gemini) et les Paquets de Mission Relay structurés (copier/importer) pour ChatGPT et Claude.',
      consequences: 'Collaboration réelle à 3 IA dès le premier jour sans dépense obligatoire.',
      authorRole: 'RESEARCHER',
      status: 'APPROVED',
      tags: ['api', 'relay', 'chatgpt', 'claude', 'gemini'],
      approved: true,
    },
    {
      id: 'adr-003',
      code: 'ADR-003',
      title: 'Protection DLP et blocage confidentiel sur Free Tier',
      context: 'Les requêtes sur le Free Tier Gemini API peuvent être utilisées pour l’entraînement produit.',
      decision: 'Bloquer l’envoi de missions marquées CONFIDENTIAL vers le Free Tier et exécuter un scanner DLP avant chaque paquet.',
      consequences: 'Réduction du risque de fuite de secrets ; nécessite un routage alternatif pour les missions sensibles.',
      authorRole: 'FOUNDER',
      status: 'APPROVED',
      tags: ['security', 'dlp', 'govern', 'privacy'],
      approved: true,
    },
    {
      id: 'adr-004',
      code: 'ADR-004',
      title: 'Adoption progressive des standards MCP et A2A',
      context: 'Éviter l’enfermement dans un format propriétaire de communication inter-agents.',
      decision: 'Aligner les enveloppes de mission sur le modèle de tâches A2A et isoler les outils derrière des contrats inspirés de MCP.',
      consequences: 'Interopérabilité future avec des agents externes.',
      authorRole: 'PLANNER',
      status: 'PROPOSED',
      tags: ['mcp', 'a2a', 'interop'],
      approved: false,
    },
  ];

  const insertAdr = db.prepare(`
    INSERT INTO decisions (
      id, code, mission_id, title, context, decision, consequences, author_role, status,
      tags_json, approved_by_founder, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const d of decisions) {
    insertAdr.run(
      d.id,
      d.code,
      missionId,
      d.title,
      d.context,
      d.decision,
      d.consequences,
      d.authorRole,
      d.status,
      JSON.stringify(d.tags),
      d.approved ? 1 : 0,
      now,
      now
    );
  }

  db.prepare(`
    INSERT INTO audit_logs (id, actor, action, target_type, target_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    'audit-001',
    'FOUNDER',
    'MISSION_LAUNCH_APPROVED',
    'MISSION',
    missionId,
    'Initialisation de NEXUS³ avec Mission N°001 et gouvernance active.',
    now
  );
}

export function getPolicy(): GovernancePolicy {
  const db = getDb();
  const row = db
    .prepare("SELECT value_json FROM governance_config WHERE key = 'policy'")
    .get() as { value_json: string } | undefined;
  if (!row) return DEFAULT_POLICY;
  try {
    return { ...DEFAULT_POLICY, ...(JSON.parse(row.value_json) as Partial<GovernancePolicy>) };
  } catch {
    return DEFAULT_POLICY;
  }
}

export function savePolicy(policy: GovernancePolicy): GovernancePolicy {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO governance_config (key, value_json, updated_at)
    VALUES ('policy', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `).run(JSON.stringify(policy), now);
  return policy;
}

export function listMissions(): Mission[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM missions ORDER BY created_at DESC').all() as Array<
    Record<string, unknown>
  >;
  return rows.map(mapMissionRow);
}

export function getMissionById(id: string): Mission | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM missions WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapMissionRow(row) : null;
}

function mapMissionRow(r: Record<string, unknown>): Mission {
  return {
    id: String(r.id),
    code: String(r.code),
    title: String(r.title),
    objective: String(r.objective),
    acceptanceCriteria: JSON.parse(String(r.acceptance_criteria_json || '[]')) as string[],
    stage: String(r.stage) as MissionStage,
    confidentiality: String(r.confidentiality) as ConfidentialityLevel,
    repairCount: Number(r.repair_count),
    maxRepairs: Number(r.max_repairs),
    estimatedCostUsd: Number(r.estimated_cost_usd),
    totalTokens: Number(r.total_tokens),
    founderApprovedLaunch: Boolean(r.founder_approved_launch),
    founderSignedOff: Boolean(r.founder_signed_off),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function createMission(input: {
  title: string;
  objective: string;
  acceptanceCriteria: string[];
  confidentiality: ConfidentialityLevel;
  maxRepairs: number;
}): Mission {
  const db = getDb();
  const countRow = db.prepare('SELECT COUNT(*) as count FROM missions').get() as { count: number };
  const nextNum = String(countRow.count + 1).padStart(3, '0');
  const now = new Date().toISOString();
  const id = `mission-${crypto.randomUUID().slice(0, 8)}`;
  const code = `NEX-${nextNum}`;

  db.prepare(`
    INSERT INTO missions (
      id, code, title, objective, acceptance_criteria_json, stage, confidentiality,
      repair_count, max_repairs, estimated_cost_usd, total_tokens,
      founder_approved_launch, founder_signed_off, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, 0, ?, 0, 0, 0, 0, ?, ?)
  `).run(
    id,
    code,
    input.title.trim(),
    input.objective.trim(),
    JSON.stringify(input.acceptanceCriteria),
    input.confidentiality,
    input.maxRepairs,
    now,
    now
  );

  addAuditLog('FOUNDER', 'MISSION_CREATED', 'MISSION', id, `Mission ${code} créée : ${input.title}`);
  return getMissionById(id)!;
}

export function updateMissionStage(
  id: string,
  stage: MissionStage,
  opts: {
    incrementRepair?: boolean;
    founderApprovedLaunch?: boolean;
    founderSignedOff?: boolean;
  } = {}
): Mission {
  const db = getDb();
  const current = getMissionById(id);
  if (!current) throw new Error('Mission introuvable.');

  const now = new Date().toISOString();
  const repairCount = opts.incrementRepair ? current.repairCount + 1 : current.repairCount;
  const approvedLaunch =
    opts.founderApprovedLaunch !== undefined
      ? opts.founderApprovedLaunch
      : current.founderApprovedLaunch;
  const signedOff =
    opts.founderSignedOff !== undefined ? opts.founderSignedOff : current.founderSignedOff;

  db.prepare(`
    UPDATE missions
    SET stage = ?, repair_count = ?, founder_approved_launch = ?, founder_signed_off = ?, updated_at = ?
    WHERE id = ?
  `).run(stage, repairCount, approvedLaunch ? 1 : 0, signedOff ? 1 : 0, now, id);

  return getMissionById(id)!;
}

export function addMissionUsage(id: string, tokensDelta: number, costDeltaUsd: number): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE missions
    SET total_tokens = total_tokens + ?, estimated_cost_usd = estimated_cost_usd + ?, updated_at = ?
    WHERE id = ?
  `).run(tokensDelta, costDeltaUsd, now, id);
}

export function listSubtasks(missionId?: string): Subtask[] {
  const db = getDb();
  const rows = missionId
    ? (db
        .prepare('SELECT * FROM subtasks WHERE mission_id = ? ORDER BY order_index ASC, created_at ASC')
        .all(missionId) as Array<Record<string, unknown>>)
    : (db
        .prepare('SELECT * FROM subtasks ORDER BY order_index ASC, created_at ASC')
        .all() as Array<Record<string, unknown>>);

  return rows.map((r) => ({
    id: String(r.id),
    missionId: String(r.mission_id),
    title: String(r.title),
    description: String(r.description),
    role: String(r.role) as LogicalRole,
    assignedProvider: String(r.assigned_provider) as ModelProvider,
    status: String(r.status) as SubtaskStatus,
    acceptanceCheck: String(r.acceptance_check),
    orderIndex: Number(r.order_index),
    createdAt: String(r.created_at),
  }));
}

export function createSubtask(input: {
  missionId: string;
  title: string;
  description: string;
  role: LogicalRole;
  assignedProvider: ModelProvider;
  acceptanceCheck: string;
}): Subtask {
  const db = getDb();
  const countRow = db
    .prepare('SELECT COUNT(*) as count FROM subtasks WHERE mission_id = ?')
    .get(input.missionId) as { count: number };
  const id = `sub-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const orderIndex = countRow.count + 1;

  db.prepare(`
    INSERT INTO subtasks (
      id, mission_id, title, description, role, assigned_provider, status, acceptance_check, order_index, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'TODO', ?, ?, ?)
  `).run(
    id,
    input.missionId,
    input.title.trim(),
    input.description.trim(),
    input.role,
    input.assignedProvider,
    input.acceptanceCheck.trim(),
    orderIndex,
    now
  );

  return {
    id,
    missionId: input.missionId,
    title: input.title.trim(),
    description: input.description.trim(),
    role: input.role,
    assignedProvider: input.assignedProvider,
    status: 'TODO',
    acceptanceCheck: input.acceptanceCheck.trim(),
    orderIndex,
    createdAt: now,
  };
}

export function updateSubtaskStatus(id: string, status: SubtaskStatus): void {
  const db = getDb();
  db.prepare('UPDATE subtasks SET status = ? WHERE id = ?').run(status, id);
}

export function listTurns(missionId?: string): AgentTurn[] {
  const db = getDb();
  const rows = missionId
    ? (db
        .prepare('SELECT * FROM agent_turns WHERE mission_id = ? ORDER BY created_at DESC')
        .all(missionId) as Array<Record<string, unknown>>)
    : (db
        .prepare('SELECT * FROM agent_turns ORDER BY created_at DESC')
        .all() as Array<Record<string, unknown>>);

  return rows.map((r) => ({
    id: String(r.id),
    missionId: String(r.mission_id),
    stage: String(r.stage) as MissionStage,
    role: String(r.role) as LogicalRole,
    provider: String(r.provider) as ModelProvider,
    mode: String(r.mode) as 'API' | 'RELAY',
    promptSummary: String(r.prompt_summary),
    content: String(r.content),
    structuredVerdict: r.structured_verdict
      ? (String(r.structured_verdict) as 'PASS' | 'WARN' | 'REJECT' | 'INFO')
      : undefined,
    tokensUsed: Number(r.tokens_used),
    estimatedCostUsd: Number(r.estimated_cost_usd),
    dlpFindingsCount: Number(r.dlp_findings_count),
    createdAt: String(r.created_at),
  }));
}

export function createTurn(input: Omit<AgentTurn, 'id' | 'createdAt'>): AgentTurn {
  const db = getDb();
  const id = `turn-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO agent_turns (
      id, mission_id, stage, role, provider, mode, prompt_summary, content,
      structured_verdict, tokens_used, estimated_cost_usd, dlp_findings_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.missionId,
    input.stage,
    input.role,
    input.provider,
    input.mode,
    input.promptSummary,
    input.content,
    input.structuredVerdict ?? 'INFO',
    input.tokensUsed,
    input.estimatedCostUsd,
    input.dlpFindingsCount,
    now
  );

  if (input.tokensUsed > 0 || input.estimatedCostUsd > 0) {
    addMissionUsage(input.missionId, input.tokensUsed, input.estimatedCostUsd);
  }

  return {
    ...input,
    id,
    createdAt: now,
  };
}

export function listDecisions(): DecisionRecord[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM decisions ORDER BY updated_at DESC')
    .all() as Array<Record<string, unknown>>;
  return rows.map(mapDecisionRow);
}

function mapDecisionRow(r: Record<string, unknown>): DecisionRecord {
  return {
    id: String(r.id),
    code: String(r.code),
    missionId: r.mission_id ? String(r.mission_id) : null,
    title: String(r.title),
    context: String(r.context),
    decision: String(r.decision),
    consequences: String(r.consequences),
    authorRole: String(r.author_role) as LogicalRole | 'FOUNDER',
    status: String(r.status) as DecisionStatus,
    tags: JSON.parse(String(r.tags_json || '[]')) as string[],
    approvedByFounder: Boolean(r.approved_by_founder),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function createDecision(input: {
  missionId: string | null;
  title: string;
  context: string;
  decision: string;
  consequences: string;
  authorRole: LogicalRole | 'FOUNDER';
  tags: string[];
}): DecisionRecord {
  const db = getDb();
  const countRow = db.prepare('SELECT COUNT(*) as count FROM decisions').get() as { count: number };
  const nextNum = String(countRow.count + 1).padStart(3, '0');
  const id = `adr-${crypto.randomUUID().slice(0, 8)}`;
  const code = `ADR-${nextNum}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO decisions (
      id, code, mission_id, title, context, decision, consequences, author_role,
      status, tags_json, approved_by_founder, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PROPOSED', ?, 0, ?, ?)
  `).run(
    id,
    code,
    input.missionId,
    input.title.trim(),
    input.context.trim(),
    input.decision.trim(),
    input.consequences.trim(),
    input.authorRole,
    JSON.stringify(input.tags),
    now,
    now
  );

  addAuditLog(
    input.authorRole,
    'DECISION_PROPOSED',
    'DECISION',
    id,
    `Proposition ${code} : ${input.title}`
  );

  const row = db.prepare('SELECT * FROM decisions WHERE id = ?').get(id) as Record<string, unknown>;
  return mapDecisionRow(row);
}

export function updateDecisionStatus(id: string, status: DecisionStatus): DecisionRecord {
  const db = getDb();
  const now = new Date().toISOString();
  const approvedByFounder = status === 'APPROVED' ? 1 : 0;

  db.prepare(`
    UPDATE decisions SET status = ?, approved_by_founder = ?, updated_at = ? WHERE id = ?
  `).run(status, approvedByFounder, now, id);

  const row = db.prepare('SELECT * FROM decisions WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new Error('Décision introuvable.');

  addAuditLog('FOUNDER', `DECISION_${status}`, 'DECISION', id, `Décision ${String(row.code)} -> ${status}`);
  return mapDecisionRow(row);
}

export function listProofRuns(missionId?: string): ProofRun[] {
  const db = getDb();
  const rows = missionId
    ? (db
        .prepare('SELECT * FROM proof_runs WHERE mission_id = ? ORDER BY created_at DESC')
        .all(missionId) as Array<Record<string, unknown>>)
    : (db
        .prepare('SELECT * FROM proof_runs ORDER BY created_at DESC')
        .all() as Array<Record<string, unknown>>);

  return rows.map((r) => ({
    id: String(r.id),
    missionId: String(r.mission_id),
    language: String(r.language) as 'typescript' | 'javascript',
    sourceCode: String(r.source_code),
    testCode: String(r.test_code),
    passed: Boolean(r.passed),
    dlpPassed: Boolean(r.dlp_passed),
    dlpFindings: JSON.parse(String(r.dlp_findings_json || '[]')) as DlpFinding[],
    compileErrors: JSON.parse(String(r.compile_errors_json || '[]')) as string[],
    runtimeLogs: JSON.parse(String(r.runtime_logs_json || '[]')) as string[],
    durationMs: Number(r.duration_ms),
    createdAt: String(r.created_at),
  }));
}

export function saveProofRun(run: Omit<ProofRun, 'id' | 'createdAt'>): ProofRun {
  const db = getDb();
  const id = `proof-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO proof_runs (
      id, mission_id, language, source_code, test_code, passed, dlp_passed,
      dlp_findings_json, compile_errors_json, runtime_logs_json, duration_ms, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    run.missionId,
    run.language,
    run.sourceCode,
    run.testCode,
    run.passed ? 1 : 0,
    run.dlpPassed ? 1 : 0,
    JSON.stringify(run.dlpFindings),
    JSON.stringify(run.compileErrors),
    JSON.stringify(run.runtimeLogs),
    run.durationMs,
    now
  );

  addAuditLog(
    'PROOF_SANDBOX',
    run.passed ? 'PROOF_PASSED' : 'PROOF_FAILED',
    'PROOF',
    id,
    `Mission ${run.missionId} (${run.language}) — ${run.passed ? 'SUCCÈS' : 'ÉCHEC'} en ${run.durationMs}ms`
  );

  return { ...run, id, createdAt: now };
}

export function listAuditLogs(limit = 60): AuditLogEntry[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: String(r.id),
    actor: String(r.actor),
    action: String(r.action),
    targetType: String(r.target_type) as AuditLogEntry['targetType'],
    targetId: String(r.target_id),
    details: String(r.details),
    createdAt: String(r.created_at),
  }));
}

export function addAuditLog(
  actor: string,
  action: string,
  targetType: AuditLogEntry['targetType'],
  targetId: string,
  details: string
): void {
  const db = getDb();
  const id = `audit-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO audit_logs (id, actor, action, target_type, target_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, actor, action, targetType, targetId, details, now);
}

export function getTodaySpendUsd(): number {
  const db = getDb();
  const todayPrefix = new Date().toISOString().slice(0, 10);
  const row = db
    .prepare('SELECT COALESCE(SUM(estimated_cost_usd), 0) as total FROM agent_turns WHERE created_at LIKE ?')
    .get(`${todayPrefix}%`) as { total: number };
  return Number(row.total || 0);
}
