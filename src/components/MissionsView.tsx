import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Play,
  Plus,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../api/client';
import {
  defaultRoleForStage,
  getAllowedNextStages,
  PROVIDER_LABELS,
  ROLE_LABELS,
  STAGE_LABELS,
} from '../core/orchestrator';
import type {
  AgentTurn,
  ConfidentialityLevel,
  GovernancePolicy,
  LogicalRole,
  Mission,
  MissionStage,
  RelayPacket,
} from '../core/types';

interface MissionsViewProps {
  missions: Mission[];
  selectedMission: Mission | null;
  turns: AgentTurn[];
  policy: GovernancePolicy;
  geminiConfigured: boolean;
  onSelectMission: (id: string) => void;
  onRefresh: () => Promise<void>;
  onNotify: (message: string, kind?: 'info' | 'error') => void;
}

const PIPELINE_STEPS: MissionStage[] = [
  'DRAFT',
  'APPROVED',
  'RESEARCH',
  'PLAN',
  'BUILD',
  'PROOF',
  'CROSS_AUDIT',
  'FOUNDER_SIGN_OFF',
  'DONE',
];

export function MissionsView({
  missions,
  selectedMission,
  turns,
  policy,
  geminiConfigured,
  onSelectMission,
  onRefresh,
  onNotify,
}: MissionsViewProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newObjective, setNewObjective] = useState('');
  const [newCriteria, setNewCriteria] = useState('');
  const [newConfidentiality, setNewConfidentiality] = useState<ConfidentialityLevel>('PUBLIC');
  const [creating, setCreating] = useState(false);

  const [agentMode, setAgentMode] = useState<'API' | 'RELAY'>('API');
  const [selectedRole, setSelectedRole] = useState<LogicalRole>('RESEARCHER');
  const [customPrompt, setCustomPrompt] = useState('');
  const [runningGemini, setRunningGemini] = useState(false);

  const [relayProvider, setRelayProvider] = useState<
    'CHATGPT_RELAY' | 'CLAUDE_RELAY' | 'GEMINI_RELAY'
  >('CHATGPT_RELAY');
  const [activePacket, setActivePacket] = useState<RelayPacket | null>(null);
  const [copiedPacket, setCopiedPacket] = useState(false);
  const [relayResponseInput, setRelayResponseInput] = useState('');
  const [importingRelay, setImportingRelay] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const missionTurns = selectedMission
    ? turns.filter((t) => t.missionId === selectedMission.id)
    : [];

  async function handleCreateMission(e: React.FormEvent) {
    e.preventDefault();
    if (newTitle.trim().length < 3) {
      onNotify('Le titre doit contenir au moins 3 caractères.', 'error');
      return;
    }
    if (newObjective.trim().length < 10) {
      onNotify("L'objectif doit contenir au moins 10 caractères.", 'error');
      return;
    }

    setCreating(true);
    try {
      const criteriaList = newCriteria
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const { mission } = await api.createMission({
        title: newTitle.trim(),
        objective: newObjective.trim(),
        acceptanceCriteria: criteriaList,
        confidentiality: newConfidentiality,
        maxRepairs: policy.maxRepairsPerMission,
      });
      setNewTitle('');
      setNewObjective('');
      setNewCriteria('');
      setShowCreateForm(false);
      onSelectMission(mission.id);
      await onRefresh();
      onNotify(`Mission ${mission.code} créée en brouillon (attente approbation fondateur).`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erreur création mission', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleTransition(targetStage: MissionStage) {
    if (!selectedMission) return;
    setTransitioning(true);
    try {
      await api.transitionMission(selectedMission.id, targetStage, 'FOUNDER');
      setSelectedRole(defaultRoleForStage(targetStage));
      await onRefresh();
      onNotify(`Mission passée à l'étape : ${STAGE_LABELS[targetStage]}.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Transition refusée', 'error');
    } finally {
      setTransitioning(false);
    }
  }

  async function handleRunGemini() {
    if (!selectedMission) return;
    setRunningGemini(true);
    try {
      const res = await api.runGeminiAgent(selectedMission.id, {
        role: selectedRole,
        customPrompt: customPrompt.trim() || undefined,
      });
      setCustomPrompt('');
      await onRefresh();
      const adrNote =
        res.createdDecisions.length > 0
          ? ` (${res.createdDecisions.length} proposition(s) ADR enregistrée(s) dans MEMORY)`
          : '';
      onNotify(`Exécution Gemini terminée — Verdict ${res.turn.structuredVerdict}${adrNote}.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erreur Gemini API', 'error');
    } finally {
      setRunningGemini(false);
    }
  }

  async function handleGeneratePacket() {
    if (!selectedMission) return;
    try {
      const res = await api.generateRelayPacket(selectedMission.id, {
        role: selectedRole,
        customInstructions: customPrompt.trim() || undefined,
      });
      setActivePacket(res.packet);
      setCopiedPacket(false);
      onNotify(`Paquet ${res.packet.packetId} prêt pour ${PROVIDER_LABELS[relayProvider]}.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erreur génération paquet', 'error');
    }
  }

  async function handleCopyPacket() {
    if (!activePacket) return;
    try {
      await navigator.clipboard.writeText(activePacket.markdownPrompt);
      setCopiedPacket(true);
      setTimeout(() => setCopiedPacket(false), 2000);
    } catch {
      onNotify('Copie presse-papiers impossible dans ce contexte ; sélectionnez le texte manuellement.', 'error');
    }
  }

  async function handleImportRelay(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMission || !relayResponseInput.trim()) {
      onNotify('Collez la réponse de ChatGPT, Claude ou Gemini avant d’importer.', 'error');
      return;
    }
    setImportingRelay(true);
    try {
      const res = await api.importRelayResponse(selectedMission.id, {
        role: selectedRole,
        provider: relayProvider,
        rawResponse: relayResponseInput,
      });
      setRelayResponseInput('');
      await onRefresh();
      onNotify(
        `Réponse ${PROVIDER_LABELS[relayProvider]} importée (${
          res.parsedFromJson ? 'JSON structuré' : 'Markdown'
        }).`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erreur import Relay', 'error');
    } finally {
      setImportingRelay(false);
    }
  }

  const allowedNext = selectedMission ? getAllowedNextStages(selectedMission.stage) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Orchestration des missions
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Pipeline à états bornés avec validation humaine et collaboration hybride API / Relay 0 €.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          {showCreateForm ? 'Fermer le formulaire' : 'Nouvelle mission'}
        </button>
      </div>

      {showCreateForm && (
        <form
          onSubmit={handleCreateMission}
          className="rounded-lg border border-slate-200 bg-white p-6 space-y-4"
        >
          <h2 className="text-base font-semibold text-slate-900">Créer une nouvelle mission</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="mission-title" className="block text-xs font-medium text-slate-700 mb-1">
                Titre de la mission
              </label>
              <input
                id="mission-title"
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ex. : Passerelle MCP pour dépôts Git locaux"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="mission-confidentiality"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Niveau de confidentialité (GOVERN)
              </label>
              <select
                id="mission-confidentiality"
                value={newConfidentiality}
                onChange={(e) => setNewConfidentiality(e.target.value as ConfidentialityLevel)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="PUBLIC">PUBLIC (Free Tier Gemini autorisé)</option>
                <option value="CONFIDENTIAL">
                  CONFIDENTIAL (Bloqué sur Free Tier Gemini — Relay / Payant uniquement)
                </option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="mission-objective" className="block text-xs font-medium text-slate-700 mb-1">
              Objectif détaillé
            </label>
            <textarea
              id="mission-objective"
              rows={3}
              required
              value={newObjective}
              onChange={(e) => setNewObjective(e.target.value)}
              placeholder="Décrivez le résultat technique attendu, les contraintes et le périmètre."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="mission-criteria" className="block text-xs font-medium text-slate-700 mb-1">
              Critères d’acceptation (un par ligne)
            </label>
            <textarea
              id="mission-criteria"
              rows={2}
              value={newCriteria}
              onChange={(e) => setNewCriteria(e.target.value)}
              placeholder={'Tests unitaires passants dans PROOF\nZéro secret détecté par DLP'}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={creating}
              className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {creating ? 'Création…' : 'Créer en brouillon'}
            </button>
          </div>
        </form>
      )}

      {/* Mission table */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Portefeuille des missions</h2>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {missions.length} mission(s)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-4">Code</th>
                <th className="py-2.5 px-4">Titre</th>
                <th className="py-2.5 px-4">Étape</th>
                <th className="py-2.5 px-4">Confidentialité</th>
                <th className="py-2.5 px-4 text-right">Réparations</th>
                <th className="py-2.5 px-4 text-right">Tokens</th>
                <th className="py-2.5 px-4 text-right">Coût est.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {missions.map((m) => {
                const isSelected = selectedMission?.id === m.id;
                return (
                  <tr
                    key={m.id}
                    className={`transition-colors ${
                      isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                      {m.code}
                    </td>
                    <td className="py-2.5 px-4">
                      <button
                        type="button"
                        onClick={() => onSelectMission(m.id)}
                        className="font-medium text-slate-900 hover:text-blue-700 text-left"
                      >
                        {m.title}
                      </button>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-700 whitespace-nowrap">
                      {STAGE_LABELS[m.stage]}
                    </td>
                    <td className="py-2.5 px-4 text-xs font-mono text-slate-600 whitespace-nowrap">
                      {m.confidentiality}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums text-slate-700">
                      {m.repairCount}/{m.maxRepairs}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums text-slate-700">
                      {m.totalTokens.toLocaleString('fr-FR')}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums text-slate-700">
                      ${m.estimatedCostUsd.toFixed(4)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedMission && (
        <div className="space-y-6">
          {/* Mission Workbench Header & State Machine */}
          <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1 max-w-3xl">
                <div className="text-xs text-slate-500 font-mono tabular-nums">
                  {selectedMission.code} · {selectedMission.confidentiality} · Réparations{' '}
                  {selectedMission.repairCount}/{selectedMission.maxRepairs}
                </div>
                <h2 className="text-xl font-semibold text-slate-900">{selectedMission.title}</h2>
                <p className="text-sm text-slate-700 leading-relaxed">{selectedMission.objective}</p>
              </div>
              <div className="text-right text-xs text-slate-600 space-y-1">
                <div>
                  Étape actuelle :{' '}
                  <strong className="text-slate-900">{STAGE_LABELS[selectedMission.stage]}</strong>
                </div>
                <div>
                  Lancement fondateur :{' '}
                  <strong className={selectedMission.founderApprovedLaunch ? 'text-emerald-700' : 'text-amber-700'}>
                    {selectedMission.founderApprovedLaunch ? 'Approuvé' : 'En attente'}
                  </strong>
                </div>
              </div>
            </div>

            {selectedMission.acceptanceCriteria.length > 0 && (
              <div className="pt-3 border-t border-slate-200">
                <div className="text-xs font-medium text-slate-500 mb-2">Critères d’acceptation</div>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-sm text-slate-700">
                  {selectedMission.acceptanceCriteria.map((c, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="font-mono text-xs text-slate-400 mt-0.5">
                        {String(idx + 1).padStart(2, '0')}.
                      </span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Pipeline progress */}
            <div className="pt-3 border-t border-slate-200">
              <div className="flex flex-wrap items-center gap-1.5">
                {PIPELINE_STEPS.map((step, i) => {
                  const currentIdx = PIPELINE_STEPS.indexOf(selectedMission.stage);
                  const isCurrent = selectedMission.stage === step;
                  const isPast = currentIdx > i;
                  return (
                    <div key={step} className="flex items-center">
                      <div
                        className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap ${
                          isCurrent
                            ? 'bg-blue-700 text-white'
                            : isPast
                              ? 'bg-slate-200 text-slate-800'
                              : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {STAGE_LABELS[step]}
                      </div>
                      {i < PIPELINE_STEPS.length - 1 && (
                        <span className="ml-1.5 text-slate-300 text-xs" aria-hidden="true">→</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Founder Transition Controls */}
            <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-600">
                Contrôle fondateur (GOVERN) — transitions autorisées depuis cette étape :
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {allowedNext.length === 0 ? (
                  <span className="text-xs text-slate-500">Mission clôturée.</span>
                ) : (
                  allowedNext.map((target) => {
                    const isDanger = target === 'REJECTED';
                    const isPrimary =
                      target === 'APPROVED' ||
                      target === 'DONE' ||
                      (selectedMission.stage === 'APPROVED' && target === 'RESEARCH');
                    return (
                      <button
                        key={target}
                        type="button"
                        disabled={transitioning}
                        onClick={() => handleTransition(target)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          isDanger
                            ? 'border border-red-200 text-red-700 hover:bg-red-50'
                            : isPrimary
                              ? 'bg-slate-900 text-white hover:bg-slate-800'
                              : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        Passer à : {STAGE_LABELS[target]}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </section>

          {/* Collaboration Runner: Direct Gemini API vs Relay Packet ($0) */}
          <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Exécution d’un tour d’agent
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Choisissez l’exécution directe via Gemini API ou générez un Paquet Relay à 0 € pour ChatGPT / Claude.
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
                <button
                  type="button"
                  onClick={() => setAgentMode('API')}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    agentMode === 'API'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Gemini API (Live)
                </button>
                <button
                  type="button"
                  onClick={() => setAgentMode('RELAY')}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    agentMode === 'RELAY'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Relay Packet (0 €)
                </button>
              </div>
            </div>

            {!selectedMission.founderApprovedLaunch && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  Cette mission est encore au statut Brouillon. Approuvez son lancement ci-dessus avant d’exécuter un agent.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="turn-role" className="block text-xs font-medium text-slate-700 mb-1">
                  Rôle logique sollicité
                </label>
                <select
                  id="turn-role"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as LogicalRole)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  {(['RESEARCHER', 'PLANNER', 'BUILDER', 'AUDITOR'] as LogicalRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]} ({r})
                    </option>
                  ))}
                </select>
              </div>

              {agentMode === 'RELAY' && (
                <div>
                  <label htmlFor="relay-provider" className="block text-xs font-medium text-slate-700 mb-1">
                    Fournisseur cible (interface web / 0 €)
                  </label>
                  <select
                    id="relay-provider"
                    value={relayProvider}
                    onChange={(e) =>
                      setRelayProvider(
                        e.target.value as 'CHATGPT_RELAY' | 'CLAUDE_RELAY' | 'GEMINI_RELAY'
                      )
                    }
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    <option value="CHATGPT_RELAY">ChatGPT Web (Relay 0 €)</option>
                    <option value="CLAUDE_RELAY">Claude Web (Relay 0 €)</option>
                    <option value="GEMINI_RELAY">Gemini Web (Relay 0 €)</option>
                  </select>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="turn-prompt" className="block text-xs font-medium text-slate-700 mb-1">
                Consigne complémentaire du fondateur (optionnelle)
              </label>
              <textarea
                id="turn-prompt"
                rows={2}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Ex. : Audite les failles de sécurité de la proposition précédente et propose un test unitaire."
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            {agentMode === 'API' ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  {!geminiConfigured ? (
                    <span className="text-amber-700">
                      Clé Gemini non détectée côté serveur — utilisez le mode Relay Packet (0 €) ou configurez GEMINI_API_KEY.
                    </span>
                  ) : selectedMission.confidentiality === 'CONFIDENTIAL' &&
                    policy.blockConfidentialOnFreeTier ? (
                    <span className="text-red-700 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
                      Bloqué par GOVERN : mission CONFIDENTIELLE interdite sur Free Tier Gemini API.
                    </span>
                  ) : (
                    <span>Exécution serveur via @google/genai (gemini-4-hydrogen) avec filtre DLP actif.</span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={
                    runningGemini ||
                    !selectedMission.founderApprovedLaunch ||
                    !geminiConfigured ||
                    (selectedMission.confidentiality === 'CONFIDENTIAL' &&
                      policy.blockConfidentialOnFreeTier)
                  }
                  onClick={handleRunGemini}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Play className="w-4 h-4" aria-hidden="true" />
                  {runningGemini ? 'Analyse Gemini en cours…' : 'Exécuter via Gemini API'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-600">
                    Étape 1 : Générez un Paquet de Mission nettoyé par DLP, puis copiez-le dans ChatGPT ou Claude.
                  </span>
                  <button
                    type="button"
                    onClick={handleGeneratePacket}
                    className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    <Send className="w-4 h-4" aria-hidden="true" />
                    Générer Paquet de Mission
                  </button>
                </div>

                {activePacket && (
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-mono text-slate-700">
                        {activePacket.packetId} · DLP :{' '}
                        {activePacket.dlpScanPassed ? 'Aucun secret détecté' : 'Secrets masqués'}
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyPacket}
                        className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        {copiedPacket ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                            Copié
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                            Copier le paquet
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="max-h-56 overflow-auto rounded border border-slate-200 bg-white p-3 text-xs font-mono text-slate-800 whitespace-pre-wrap">
                      {activePacket.markdownPrompt}
                    </pre>
                  </div>
                )}

                <form onSubmit={handleImportRelay} className="space-y-2 pt-2 border-t border-slate-200">
                  <label
                    htmlFor="relay-response-input"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Étape 2 : Collez la réponse reçue de {PROVIDER_LABELS[relayProvider]} (JSON ou Markdown)
                  </label>
                  <textarea
                    id="relay-response-input"
                    rows={4}
                    value={relayResponseInput}
                    onChange={(e) => setRelayResponseInput(e.target.value)}
                    placeholder='Collez ici le bloc JSON ou la réponse Markdown structurée…'
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={importingRelay}
                      className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                    >
                      {importingRelay ? 'Importation…' : 'Importer et enregistrer la réponse'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </section>

          {/* Timeline of turns */}
          <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                Journal des échanges inter-IA
              </h3>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {missionTurns.length} contribution(s)
              </span>
            </div>

            {missionTurns.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">
                Aucune contribution enregistrée pour cette mission. Lancez Gemini API ou importez un Paquet Relay.
              </p>
            ) : (
              <div className="divide-y divide-slate-200">
                {missionTurns.map((t) => (
                  <article key={t.id} className="py-4 first:pt-0 last:pb-0 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <div className="font-medium text-slate-800">
                        {ROLE_LABELS[t.role]} · {PROVIDER_LABELS[t.provider]} ·{' '}
                        <span className="font-mono">{STAGE_LABELS[t.stage]}</span>
                      </div>
                      <div className="font-mono tabular-nums">
                        Verdict : {t.structuredVerdict ?? 'INFO'} · {t.tokensUsed} tokens · $
                        {t.estimatedCostUsd.toFixed(4)}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">{t.promptSummary}</div>
                    <div className="rounded-md bg-slate-50 border border-slate-200 p-3.5 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                      {t.content}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
