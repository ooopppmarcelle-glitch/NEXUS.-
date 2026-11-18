import type {
  AgentTurn,
  ConfidentialityLevel,
  DecisionRecord,
  DecisionStatus,
  DlpFinding,
  GovernancePolicy,
  LogicalRole,
  Mission,
  MissionStage,
  ProofRun,
  RelayPacket,
  Subtask,
  SubtaskStatus,
  WorkspaceSnapshot,
} from '../core/types';

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errMsg =
      typeof data.error === 'string' && data.error.trim().length > 0
        ? data.error
        : `Erreur HTTP ${res.status}`;
    throw new Error(errMsg);
  }

  return data as T;
}

export const api = {
  getWorkspace(): Promise<WorkspaceSnapshot> {
    return requestJson<WorkspaceSnapshot>('/api/workspace');
  },

  createMission(payload: {
    title: string;
    objective: string;
    acceptanceCriteria: string[];
    confidentiality: ConfidentialityLevel;
    maxRepairs: number;
  }): Promise<{ mission: Mission }> {
    return requestJson<{ mission: Mission }>('/api/missions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  transitionMission(
    missionId: string,
    targetStage: MissionStage,
    actor: 'FOUNDER' | 'SYSTEM' = 'FOUNDER'
  ): Promise<{ mission: Mission }> {
    return requestJson<{ mission: Mission }>(`/api/missions/${missionId}/transition`, {
      method: 'POST',
      body: JSON.stringify({ targetStage, actor }),
    });
  },

  createSubtask(
    missionId: string,
    payload: {
      title: string;
      description: string;
      role: LogicalRole;
      acceptanceCheck: string;
    }
  ): Promise<{ subtask: Subtask }> {
    return requestJson<{ subtask: Subtask }>(`/api/missions/${missionId}/subtasks`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateSubtaskStatus(subtaskId: string, status: SubtaskStatus): Promise<{ ok: boolean }> {
    return requestJson<{ ok: boolean }>(`/api/subtasks/${subtaskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  decomposeWithGemini(missionId: string): Promise<{ subtasks: Subtask[] }> {
    return requestJson<{ subtasks: Subtask[] }>(`/api/missions/${missionId}/decomposer`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  runGeminiAgent(
    missionId: string,
    payload: { role: LogicalRole; customPrompt?: string }
  ): Promise<{ turn: AgentTurn; createdDecisions: DecisionRecord[] }> {
    return requestJson<{ turn: AgentTurn; createdDecisions: DecisionRecord[] }>(
      `/api/missions/${missionId}/run-agent`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  generateRelayPacket(
    missionId: string,
    payload: { role: LogicalRole; customInstructions?: string }
  ): Promise<{
    packet: RelayPacket;
    routingResolution: { blockedByConfidentiality: boolean; reason?: string };
  }> {
    return requestJson(`/api/missions/${missionId}/relay-packet`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  importRelayResponse(
    missionId: string,
    payload: {
      role: LogicalRole;
      provider: 'CHATGPT_RELAY' | 'CLAUDE_RELAY' | 'GEMINI_RELAY';
      rawResponse: string;
    }
  ): Promise<{ turn: AgentTurn; createdDecisions: DecisionRecord[]; parsedFromJson: boolean }> {
    return requestJson(`/api/missions/${missionId}/import-relay`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  runProof(
    missionId: string,
    payload: {
      language: 'typescript' | 'javascript';
      sourceCode: string;
      testCode: string;
      enforceDlp: boolean;
    }
  ): Promise<{ proofRun: ProofRun }> {
    return requestJson<{ proofRun: ProofRun }>(`/api/missions/${missionId}/proof`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  triggerRepair(
    missionId: string,
    proofRunId: string
  ): Promise<{ mission: Mission; turn: AgentTurn }> {
    return requestJson<{ mission: Mission; turn: AgentTurn }>(`/api/missions/${missionId}/repair`, {
      method: 'POST',
      body: JSON.stringify({ proofRunId }),
    });
  },

  searchDecisions(
    query: string,
    status: DecisionStatus | 'ALL'
  ): Promise<{ results: Array<{ record: DecisionRecord; score: number }> }> {
    const params = new URLSearchParams({ q: query, status });
    return requestJson(`/api/decisions?${params.toString()}`);
  },

  createDecision(payload: {
    missionId: string | null;
    title: string;
    context: string;
    decision: string;
    consequences: string;
    authorRole: LogicalRole | 'FOUNDER';
    tags: string[];
  }): Promise<{ decision: DecisionRecord }> {
    return requestJson<{ decision: DecisionRecord }>('/api/decisions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateDecisionStatus(
    decisionId: string,
    status: DecisionStatus
  ): Promise<{ decision: DecisionRecord }> {
    return requestJson<{ decision: DecisionRecord }>(`/api/decisions/${decisionId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  },

  updatePolicy(policy: GovernancePolicy): Promise<{ policy: GovernancePolicy }> {
    return requestJson<{ policy: GovernancePolicy }>('/api/govern', {
      method: 'PUT',
      body: JSON.stringify(policy),
    });
  },

  scanDlp(text: string): Promise<{ passed: boolean; findings: DlpFinding[] }> {
    return requestJson<{ passed: boolean; findings: DlpFinding[] }>('/api/dlp/scan', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  },
};
