export const MISSION_STAGES = [
  'DRAFT',
  'APPROVED',
  'RESEARCH',
  'PLAN',
  'BUILD',
  'PROOF',
  'CROSS_AUDIT',
  'REPAIR',
  'FOUNDER_SIGN_OFF',
  'DONE',
  'REJECTED',
] as const;

export type MissionStage = (typeof MISSION_STAGES)[number];

export const LOGICAL_ROLES = [
  'RESEARCHER',
  'PLANNER',
  'BUILDER',
  'AUDITOR',
] as const;

export type LogicalRole = (typeof LOGICAL_ROLES)[number];

export const MODEL_PROVIDERS = [
  'GEMINI_API',
  'CHATGPT_RELAY',
  'CLAUDE_RELAY',
  'GEMINI_RELAY',
  'OPENAI_API',
  'ANTHROPIC_API',
] as const;

export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

export const CONFIDENTIALITY_LEVELS = ['PUBLIC', 'CONFIDENTIAL'] as const;
export type ConfidentialityLevel = (typeof CONFIDENTIALITY_LEVELS)[number];

export const DECISION_STATUSES = [
  'PROPOSED',
  'APPROVED',
  'REJECTED',
  'SUPERSEDED',
] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export const SUBTASK_STATUSES = [
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'VERIFIED',
] as const;
export type SubtaskStatus = (typeof SUBTASK_STATUSES)[number];

export interface RoleRoutingMatrix {
  RESEARCHER: ModelProvider;
  PLANNER: ModelProvider;
  BUILDER: ModelProvider;
  AUDITOR: ModelProvider;
}

export interface GovernancePolicy {
  roleRouting: RoleRoutingMatrix;
  blockConfidentialOnFreeTier: boolean;
  enableDlpRedaction: boolean;
  maxRepairsPerMission: number;
  maxBudgetPerMissionUsd: number;
  dailyBudgetUsd: number;
}

export interface Mission {
  id: string;
  code: string;
  title: string;
  objective: string;
  acceptanceCriteria: string[];
  stage: MissionStage;
  confidentiality: ConfidentialityLevel;
  repairCount: number;
  maxRepairs: number;
  estimatedCostUsd: number;
  totalTokens: number;
  founderApprovedLaunch: boolean;
  founderSignedOff: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Subtask {
  id: string;
  missionId: string;
  title: string;
  description: string;
  role: LogicalRole;
  assignedProvider: ModelProvider;
  status: SubtaskStatus;
  acceptanceCheck: string;
  orderIndex: number;
  createdAt: string;
}

export interface AgentTurn {
  id: string;
  missionId: string;
  stage: MissionStage;
  role: LogicalRole;
  provider: ModelProvider;
  mode: 'API' | 'RELAY';
  promptSummary: string;
  content: string;
  structuredVerdict?: 'PASS' | 'WARN' | 'REJECT' | 'INFO';
  tokensUsed: number;
  estimatedCostUsd: number;
  dlpFindingsCount: number;
  createdAt: string;
}

export interface DecisionRecord {
  id: string;
  code: string;
  missionId: string | null;
  title: string;
  context: string;
  decision: string;
  consequences: string;
  authorRole: LogicalRole | 'FOUNDER';
  status: DecisionStatus;
  tags: string[];
  approvedByFounder: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProofRun {
  id: string;
  missionId: string;
  language: 'typescript' | 'javascript';
  sourceCode: string;
  testCode: string;
  passed: boolean;
  dlpPassed: boolean;
  dlpFindings: DlpFinding[];
  compileErrors: string[];
  runtimeLogs: string[];
  durationMs: number;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actor: string;
  action: string;
  targetType: 'MISSION' | 'DECISION' | 'PROOF' | 'GOVERN' | 'DLP';
  targetId: string;
  details: string;
  createdAt: string;
}

export interface DlpFinding {
  ruleId: string;
  label: string;
  severity: 'HIGH' | 'MEDIUM';
  matchPreview: string;
  line: number;
}

export interface RelayPacket {
  packetId: string;
  missionId: string;
  missionCode: string;
  targetRole: LogicalRole;
  targetProvider: ModelProvider;
  stage: MissionStage;
  confidentiality: ConfidentialityLevel;
  objective: string;
  acceptanceCriteria: string[];
  relevantDecisions: Array<{ code: string; title: string; decision: string }>;
  previousDeliverableSummary: string;
  instructions: string;
  markdownPrompt: string;
  dlpScanPassed: boolean;
  dlpFindings: DlpFinding[];
}

export interface ConnectorStatus {
  geminiApiConfigured: boolean;
  openaiApiConfigured: boolean;
  anthropicApiConfigured: boolean;
  relayModeAlwaysReady: boolean;
}

export interface WorkspaceSnapshot {
  missions: Mission[];
  subtasks: Subtask[];
  turns: AgentTurn[];
  decisions: DecisionRecord[];
  proofRuns: ProofRun[];
  auditLogs: AuditLogEntry[];
  policy: GovernancePolicy;
  connectors: ConnectorStatus;
  todaySpendUsd: number;
}
