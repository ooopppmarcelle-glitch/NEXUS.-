import { useState } from 'react';
import { Save, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import { PROVIDER_LABELS, ROLE_LABELS } from '../core/orchestrator';
import type {
  AuditLogEntry,
  ConnectorStatus,
  DlpFinding,
  GovernancePolicy,
  LogicalRole,
  ModelProvider,
} from '../core/types';

interface GovernViewProps {
  policy: GovernancePolicy;
  connectors: ConnectorStatus;
  auditLogs: AuditLogEntry[];
  todaySpendUsd: number;
  onRefresh: () => Promise<void>;
  onNotify: (message: string, kind?: 'info' | 'error') => void;
}

const PROVIDER_OPTIONS: ModelProvider[] = [
  'GEMINI_API',
  'CHATGPT_RELAY',
  'CLAUDE_RELAY',
  'GEMINI_RELAY',
  'OPENAI_API',
  'ANTHROPIC_API',
];

export function GovernView({
  policy,
  connectors,
  auditLogs,
  todaySpendUsd,
  onRefresh,
  onNotify,
}: GovernViewProps) {
  const [draftPolicy, setDraftPolicy] = useState<GovernancePolicy>(policy);
  const [saving, setSaving] = useState(false);

  const [dlpTestInput, setDlpTestInput] = useState(
    'Exemple de test : OPENAI_KEY=sk-proj-1234567890abcdefghijklmnop'
  );
  const [dlpScanResult, setDlpScanResult] = useState<{
    passed: boolean;
    findings: DlpFinding[];
  } | null>(null);

  async function handleSavePolicy(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updatePolicy(draftPolicy);
      await onRefresh();
      onNotify('Politique GOVERN enregistrée et appliquée.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erreur sauvegarde GOVERN', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestDlp() {
    try {
      const res = await api.scanDlp(dlpTestInput);
      setDlpScanResult(res);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erreur test DLP', 'error');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          GOVERN — Sécurité, Routage & Audit
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Contrôle humain des permissions, plafonds financiers, confidentialité Free Tier et journal d’audit immuable.
        </p>
      </div>

      {/* Server connectors status (read-only, no key inputs) */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-900">
          État des connecteurs serveur (variables d’environnement)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div className="rounded-md border border-slate-200 p-4">
            <div className="text-xs text-slate-500">Gemini API (Serveur)</div>
            <div className="mt-1 font-semibold text-slate-900">
              {connectors.geminiApiConfigured ? 'Connecté (GEMINI_API_KEY)' : 'Non configuré'}
            </div>
            <div className="mt-1 text-xs text-slate-500">Modèle : gemini-4-hydrogen</div>
          </div>
          <div className="rounded-md border border-slate-200 p-4">
            <div className="text-xs text-slate-500">Relay Packet (0 €)</div>
            <div className="mt-1 font-semibold text-emerald-700">Toujours actif</div>
            <div className="mt-1 text-xs text-slate-500">ChatGPT · Claude · Gemini Web</div>
          </div>
          <div className="rounded-md border border-slate-200 p-4">
            <div className="text-xs text-slate-500">OpenAI API (Optionnel)</div>
            <div className="mt-1 font-semibold text-slate-900">
              {connectors.openaiApiConfigured ? 'Clé détectée' : 'Mode Relay actif'}
            </div>
            <div className="mt-1 text-xs text-slate-500">Géré via Secrets serveur</div>
          </div>
          <div className="rounded-md border border-slate-200 p-4">
            <div className="text-xs text-slate-500">Dépense estimée du jour</div>
            <div className="mt-1 font-semibold font-mono tabular-nums text-slate-900">
              ${todaySpendUsd.toFixed(4)} / ${policy.dailyBudgetUsd.toFixed(2)}
            </div>
            <div className="mt-1 text-xs text-slate-500">Coupe-circuit automatique</div>
          </div>
        </div>
      </section>

      {/* Policy editor */}
      <form onSubmit={handleSavePolicy} className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-slate-600" aria-hidden="true" />
            <h2 className="text-base font-semibold text-slate-900">
              Matrice de découplage Rôle ↔ Fournisseur & Garde-fous
            </h2>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <Save className="w-4 h-4" aria-hidden="true" />
            {saving ? 'Enregistrement…' : 'Enregistrer la politique'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {(['RESEARCHER', 'PLANNER', 'BUILDER', 'AUDITOR'] as LogicalRole[]).map((role) => (
            <div key={role}>
              <label
                htmlFor={`govern-role-${role}`}
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                {ROLE_LABELS[role]}
              </label>
              <select
                id={`govern-role-${role}`}
                value={draftPolicy.roleRouting[role]}
                onChange={(e) =>
                  setDraftPolicy({
                    ...draftPolicy,
                    roleRouting: {
                      ...draftPolicy.roleRouting,
                      [role]: e.target.value as ModelProvider,
                    },
                  })
                }
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                {PROVIDER_OPTIONS.map((prov) => (
                  <option key={prov} value={prov}>
                    {PROVIDER_LABELS[prov]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-200">
          <div>
            <label htmlFor="govern-max-repairs" className="block text-xs font-medium text-slate-700 mb-1">
              Plafond boucles REPAIR / mission
            </label>
            <input
              id="govern-max-repairs"
              type="number"
              min={0}
              max={5}
              value={draftPolicy.maxRepairsPerMission}
              onChange={(e) =>
                setDraftPolicy({ ...draftPolicy, maxRepairsPerMission: Number(e.target.value) })
              }
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="govern-mission-cap" className="block text-xs font-medium text-slate-700 mb-1">
              Plafond coût / mission ($)
            </label>
            <input
              id="govern-mission-cap"
              type="number"
              step="0.1"
              min={0}
              value={draftPolicy.maxBudgetPerMissionUsd}
              onChange={(e) =>
                setDraftPolicy({ ...draftPolicy, maxBudgetPerMissionUsd: Number(e.target.value) })
              }
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="govern-daily-cap" className="block text-xs font-medium text-slate-700 mb-1">
              Plafond coût journalier ($)
            </label>
            <input
              id="govern-daily-cap"
              type="number"
              step="0.5"
              min={0}
              value={draftPolicy.dailyBudgetUsd}
              onChange={(e) =>
                setDraftPolicy({ ...draftPolicy, dailyBudgetUsd: Number(e.target.value) })
              }
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-6 pt-2">
          <label className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={draftPolicy.blockConfidentialOnFreeTier}
              onChange={(e) =>
                setDraftPolicy({ ...draftPolicy, blockConfidentialOnFreeTier: e.target.checked })
              }
              className="rounded border-slate-300"
            />
            Bloquer l’envoi de missions CONFIDENTIELLES vers le Free Tier Gemini API
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={draftPolicy.enableDlpRedaction}
              onChange={(e) =>
                setDraftPolicy({ ...draftPolicy, enableDlpRedaction: e.target.checked })
              }
              className="rounded border-slate-300"
            />
            Activer le masquage automatique des secrets (DLP)
          </label>
        </div>
      </form>

      {/* Live DLP Scanner Tester */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Testeur DLP anti-fuites de secrets</h2>
        <p className="text-xs text-slate-600">
          Vérifiez qu’un texte ou extrait de code ne contient ni clé API, ni jeton JWT, ni variable d’environnement sensible avant partage externe.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <label htmlFor="dlp-test-input" className="sr-only">
            Texte à analyser par DLP
          </label>
          <input
            id="dlp-test-input"
            type="text"
            value={dlpTestInput}
            onChange={(e) => setDlpTestInput(e.target.value)}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleTestDlp}
            className="rounded-md border border-slate-300 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0"
          >
            Analyser le texte
          </button>
        </div>

        {dlpScanResult && (
          <div
            className={`rounded-md border p-3 text-xs ${
              dlpScanResult.passed
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-900'
            }`}
          >
            {dlpScanResult.passed ? (
              <span>Aucun secret détecté.</span>
            ) : (
              <div className="space-y-1">
                <div className="font-semibold">
                  {dlpScanResult.findings.length} alerte(s) DLP détectée(s) :
                </div>
                {dlpScanResult.findings.map((f, idx) => (
                  <div key={idx} className="font-mono">
                    [{f.severity}] {f.label} — {f.matchPreview} (ligne {f.line})
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Audit Log */}
      <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Journal d’audit immuable</h2>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {auditLogs.length} événement(s)
          </span>
        </div>
        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-4">Horodatage</th>
                <th className="py-2.5 px-4">Acteur</th>
                <th className="py-2.5 px-4">Action</th>
                <th className="py-2.5 px-4">Détails</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="py-2 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                    {log.createdAt.replace('T', ' ').slice(0, 19)}
                  </td>
                  <td className="py-2 px-4 font-mono text-slate-800 whitespace-nowrap">
                    {log.actor}
                  </td>
                  <td className="py-2 px-4 font-mono text-slate-700 whitespace-nowrap">
                    {log.action}
                  </td>
                  <td className="py-2 px-4 text-slate-700">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
