import { useState } from 'react';
import { GitBranch, Plus, Sparkles } from 'lucide-react';
import { api } from '../api/client';
import { PROVIDER_LABELS, ROLE_LABELS } from '../core/orchestrator';
import type { GovernancePolicy, LogicalRole, Mission, Subtask, SubtaskStatus } from '../core/types';

interface DecomposerViewProps {
  mission: Mission | null;
  subtasks: Subtask[];
  policy: GovernancePolicy;
  geminiConfigured: boolean;
  onRefresh: () => Promise<void>;
  onNotify: (message: string, kind?: 'info' | 'error') => void;
}

const STATUS_LABELS: Record<SubtaskStatus, string> = {
  TODO: 'À faire',
  IN_PROGRESS: 'En cours',
  BLOCKED: 'Bloquée',
  VERIFIED: 'Vérifiée',
};

export function DecomposerView({
  mission,
  subtasks,
  policy,
  geminiConfigured,
  onRefresh,
  onNotify,
}: DecomposerViewProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [role, setRole] = useState<LogicalRole>('BUILDER');
  const [acceptanceCheck, setAcceptanceCheck] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [decomposing, setDecomposing] = useState(false);

  if (!mission) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Sélectionnez ou créez une mission dans l’onglet Missions pour utiliser DECOMPOSER.
      </div>
    );
  }

  const missionSubtasks = subtasks.filter((s) => s.missionId === mission.id);

  async function handleAddSubtask(e: React.FormEvent) {
    e.preventDefault();
    if (!mission || !title.trim()) {
      onNotify('Le titre de la sous-tâche est requis.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api.createSubtask(mission.id, {
        title: title.trim(),
        description: description.trim(),
        role,
        acceptanceCheck: acceptanceCheck.trim() || 'Validation par test et audit croisé.',
      });
      setTitle('');
      setDescription('');
      setAcceptanceCheck('');
      await onRefresh();
      onNotify('Sous-tâche ajoutée au graphe DECOMPOSER.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erreur création sous-tâche', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAutoDecompose() {
    if (!mission) return;
    setDecomposing(true);
    try {
      const res = await api.decomposeWithGemini(mission.id);
      await onRefresh();
      onNotify(`${res.subtasks.length} sous-tâche(s) générée(s) par Gemini DECOMPOSER.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erreur décomposition Gemini', 'error');
    } finally {
      setDecomposing(false);
    }
  }

  async function handleStatusChange(subtaskId: string, nextStatus: SubtaskStatus) {
    try {
      await api.updateSubtaskStatus(subtaskId, nextStatus);
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erreur mise à jour statut', 'error');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            DECOMPOSER — Découpage & Routage
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {mission.code} — {mission.title} · Découplage strict entre Rôle logique et Fournisseur de modèle.
          </p>
        </div>

        <button
          type="button"
          disabled={decomposing || !geminiConfigured}
          onClick={handleAutoDecompose}
          className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <Sparkles className="w-4 h-4" aria-hidden="true" />
          {decomposing ? 'Décomposition…' : 'Décomposer avec Gemini'}
        </button>
      </div>

      {/* Role-to-Provider Routing strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {(['RESEARCHER', 'PLANNER', 'BUILDER', 'AUDITOR'] as LogicalRole[]).map((r) => (
          <div key={r} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium text-slate-500">{ROLE_LABELS[r]}</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {PROVIDER_LABELS[policy.roleRouting[r]]}
            </div>
            <div className="mt-1 text-[11px] font-mono text-slate-500">Rôle : {r}</div>
          </div>
        ))}
      </div>

      {/* Subtasks table */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-slate-500" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-slate-900">Sous-tâches de la mission</h2>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {missionSubtasks.filter((s) => s.status === 'VERIFIED').length}/{missionSubtasks.length}{' '}
            vérifiée(s)
          </span>
        </div>

        {missionSubtasks.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Aucune sous-tâche pour cette mission. Utilisez « Décomposer avec Gemini » ou ajoutez-en une manuellement ci-dessous.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">#</th>
                  <th className="py-2.5 px-4">Sous-tâche & Critère</th>
                  <th className="py-2.5 px-4">Rôle</th>
                  <th className="py-2.5 px-4">Fournisseur routé</th>
                  <th className="py-2.5 px-4">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {missionSubtasks.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-500 align-top">
                      {String(s.orderIndex).padStart(2, '0')}
                    </td>
                    <td className="py-3 px-4 align-top">
                      <div className="font-medium text-slate-900">{s.title}</div>
                      {s.description && (
                        <div className="text-xs text-slate-600 mt-0.5">{s.description}</div>
                      )}
                      <div className="text-xs text-slate-500 mt-1">
                        Critère : {s.acceptanceCheck}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 align-top whitespace-nowrap">
                      {ROLE_LABELS[s.role]}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-slate-700 align-top whitespace-nowrap">
                      {PROVIDER_LABELS[s.assignedProvider]}
                    </td>
                    <td className="py-3 px-4 align-top">
                      <select
                        aria-label={`Statut pour ${s.title}`}
                        value={s.status}
                        onChange={(e) => handleStatusChange(s.id, e.target.value as SubtaskStatus)}
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none"
                      >
                        {(['TODO', 'IN_PROGRESS', 'BLOCKED', 'VERIFIED'] as SubtaskStatus[]).map(
                          (st) => (
                            <option key={st} value={st}>
                              {STATUS_LABELS[st]}
                            </option>
                          )
                        )}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add subtask form */}
      <form
        onSubmit={handleAddSubtask}
        className="rounded-lg border border-slate-200 bg-white p-6 space-y-4"
      >
        <h3 className="text-sm font-semibold text-slate-900">Ajouter une sous-tâche manuelle</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="subtask-title" className="block text-xs font-medium text-slate-700 mb-1">
              Titre
            </label>
            <input
              id="subtask-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex. : Écrire le test d'intégration du scanner DLP"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="subtask-role" className="block text-xs font-medium text-slate-700 mb-1">
              Rôle logique
            </label>
            <select
              id="subtask-role"
              value={role}
              onChange={(e) => setRole(e.target.value as LogicalRole)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            >
              {(['RESEARCHER', 'PLANNER', 'BUILDER', 'AUDITOR'] as LogicalRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]} → {PROVIDER_LABELS[policy.roleRouting[r]]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="subtask-desc" className="block text-xs font-medium text-slate-700 mb-1">
              Description
            </label>
            <input
              id="subtask-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Périmètre technique et fichiers concernés"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="subtask-check" className="block text-xs font-medium text-slate-700 mb-1">
              Critère de vérification (PROOF)
            </label>
            <input
              id="subtask-check"
              type="text"
              value={acceptanceCheck}
              onChange={(e) => setAcceptanceCheck(e.target.value)}
              placeholder="Condition objective de validation"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            {submitting ? 'Ajout…' : 'Ajouter la sous-tâche'}
          </button>
        </div>
      </form>
    </div>
  );
}
