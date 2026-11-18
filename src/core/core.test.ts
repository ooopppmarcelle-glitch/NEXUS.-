import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransitionStage,
  checkBudgetGuard,
  resolveProviderForRole,
} from './orchestrator.ts';
import { redactSecrets, scanForSecrets } from './dlp.ts';
import { buildRelayPacket, parseRelayResponse } from './packets.ts';
import { searchDecisions } from './memorySearch.ts';
import type { DecisionRecord, GovernancePolicy, Mission } from './types.ts';

const basePolicy: GovernancePolicy = {
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

const sampleMission: Mission = {
  id: 'm1',
  code: 'NEX-001',
  title: 'Fondations NEXUS³',
  objective: 'Construire le noyau d’orchestration',
  acceptanceCriteria: ['Tests unitaires passants', 'Validation humaine active'],
  stage: 'DRAFT',
  confidentiality: 'PUBLIC',
  repairCount: 0,
  maxRepairs: 2,
  estimatedCostUsd: 0.1,
  totalTokens: 1200,
  founderApprovedLaunch: false,
  founderSignedOff: false,
  createdAt: '2026-11-18T09:00:00Z',
  updatedAt: '2026-11-18T09:00:00Z',
};

test('orchestrator blocks non-founder from approving launch or finalizing', () => {
  const res = canTransitionStage(sampleMission, 'APPROVED', 'SYSTEM');
  assert.equal(res.allowed, false);
  assert.equal(res.requiresFounderGate, true);

  const founderRes = canTransitionStage(sampleMission, 'APPROVED', 'FOUNDER');
  assert.equal(founderRes.allowed, true);
});

test('orchestrator enforces maxRepairs ceiling and launch approval', () => {
  const unapprovedResearch = canTransitionStage(sampleMission, 'RESEARCH', 'SYSTEM');
  assert.equal(unapprovedResearch.allowed, false);

  const maxedMission: Mission = {
    ...sampleMission,
    stage: 'PROOF',
    founderApprovedLaunch: true,
    repairCount: 2,
    maxRepairs: 2,
  };
  const repairAttempt = canTransitionStage(maxedMission, 'REPAIR', 'SYSTEM');
  assert.equal(repairAttempt.allowed, false);
});

test('confidentiality guard blocks CONFIDENTIAL mission on GEMINI_API free tier', () => {
  const publicRes = resolveProviderForRole('RESEARCHER', 'PUBLIC', basePolicy);
  assert.equal(publicRes.blockedByConfidentiality, false);

  const confRes = resolveProviderForRole('RESEARCHER', 'CONFIDENTIAL', basePolicy);
  assert.equal(confRes.blockedByConfidentiality, true);

  const relayRes = resolveProviderForRole('PLANNER', 'CONFIDENTIAL', basePolicy);
  assert.equal(relayRes.blockedByConfidentiality, false);
});

test('budget guard blocks mission when mission or daily cap is exceeded', () => {
  assert.equal(checkBudgetGuard(sampleMission, 1.0, 0.2, basePolicy).allowed, true);
  assert.equal(checkBudgetGuard(sampleMission, 1.0, 1.45, basePolicy).allowed, false);
  assert.equal(checkBudgetGuard(sampleMission, 4.9, 0.2, basePolicy).allowed, false);
});

test('DLP scanner detects and redacts API keys and env secrets', () => {
  const text = 'Voici une clé OpenAI sk-proj-1234567890abcdefghijklmno et API_KEY=super_secret_token_99';
  const findings = scanForSecrets(text);
  assert.equal(findings.length >= 2, true);
  const { redacted } = redactSecrets(text);
  assert.equal(redacted.includes('1234567890abcdefghijklmno'), false);
  assert.equal(redacted.includes('[REDACTED:OPENAI_KEY:'), true);
});

test('Relay packet builder redacts secrets and parser extracts fenced JSON', () => {
  const packet = buildRelayPacket({
    packetId: 'PKT-01',
    mission: { ...sampleMission, stage: 'PLAN', founderApprovedLaunch: true },
    targetRole: 'PLANNER',
    targetProvider: 'CHATGPT_RELAY',
    approvedDecisions: [],
    previousDeliverableSummary: 'Token accidentel sk-ant-secretvalue123456789012',
    enableDlpRedaction: true,
  });
  assert.equal(packet.dlpScanPassed, false);
  assert.equal(packet.markdownPrompt.includes('secretvalue123456789012'), false);

  const responseText = [
    'Voici ma proposition :',
    '```json',
    JSON.stringify({
      verdict: 'PASS',
      summary: 'Architecture validée.',
      deliverable: 'Utiliser SQLite + Git worktrees.',
      proposedDecisions: [{ title: 'ADR SQLite', decision: 'Stocker l’état local dans SQLite.' }],
      risks: ['Verrouillage concurrence'],
    }),
    '```',
  ].join('\n');

  const parsed = parseRelayResponse(responseText);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data?.verdict, 'PASS');
  assert.equal(parsed.data?.parsedFromJson, true);
  assert.equal(parsed.data?.proposedDecisions.length, 1);
});

test('Memory search ranks approved matching ADRs above proposed ones', () => {
  const decisions: DecisionRecord[] = [
    {
      id: 'd1',
      code: 'ADR-001',
      missionId: 'm1',
      title: 'Mémoire locale SQLite',
      context: 'Budget initial nul',
      decision: 'Utiliser SQLite et FTS5 pour stocker les décisions.',
      consequences: 'Zéro coût serveur',
      authorRole: 'RESEARCHER',
      status: 'PROPOSED',
      tags: ['sqlite', 'memory'],
      approvedByFounder: false,
      createdAt: '2026-11-18T08:00:00Z',
      updatedAt: '2026-11-18T08:00:00Z',
    },
    {
      id: 'd2',
      code: 'ADR-002',
      missionId: 'm1',
      title: 'Architecture SQLite + Git',
      context: 'Traçabilité',
      decision: 'SQLite pour les index et Git pour les artefacts.',
      consequences: 'Réversibilité totale',
      authorRole: 'PLANNER',
      status: 'APPROVED',
      tags: ['sqlite', 'git'],
      approvedByFounder: true,
      createdAt: '2026-11-18T08:30:00Z',
      updatedAt: '2026-11-18T08:30:00Z',
    },
  ];

  const results = searchDecisions(decisions, { query: 'sqlite' });
  assert.equal(results.length, 2);
  assert.equal(results[0].record.code, 'ADR-002');
});
