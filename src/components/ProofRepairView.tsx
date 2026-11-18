import { useState } from 'react';
import { FlaskConical, Play, ShieldAlert, Wrench } from 'lucide-react';
import { api } from '../api/client';
import type { Mission, ProofRun } from '../core/types';

interface ProofRepairViewProps {
  mission: Mission | null;
  proofRuns: ProofRun[];
  geminiConfigured: boolean;
  onRefresh: () => Promise<void>;
  onNotify: (message: string, kind?: 'info' | 'error') => void;
}

const DEFAULT_TS_SOURCE = `export interface BudgetCheckInput {
  currentCost: number;
  nextCallCost: number;
  hardCap: number;
}

export function canSpend(input: BudgetCheckInput): boolean {
  if (input.hardCap <= 0) return false;
  return input.currentCost + input.nextCallCost <= input.hardCap;
}`;

const DEFAULT_TS_TESTS = `test('autorise une dépense sous le plafond', () => {
  assert.equal(canSpend({ currentCost: 0.4, nextCallCost: 0.2, hardCap: 1.0 }), true);
});

test('bloque le dépassement budgétaire', () => {
  assert.equal(canSpend({ currentCost: 0.9, nextCallCost: 0.2, hardCap: 1.0 }), false);
});`;

export function ProofRepairView({
  mission,
  proofRuns,
  geminiConfigured,
  onRefresh,
  onNotify,
}: ProofRepairViewProps) {
  const [language, setLanguage] = useState<'typescript' | 'javascript'>('typescript');
  const [sourceCode, setSourceCode] = useState(DEFAULT_TS_SOURCE);
  const [testCode, setTestCode] = useState(DEFAULT_TS_TESTS);
  const [enforceDlp, setEnforceDlp] = useState(true);
  const [runningProof, setRunningProof] = useState(false);
  const [repairingId, setRepairingId] = useState<string | null>(null);
  const [latestRun, setLatestRun] = useState<ProofRun | null>(null);

  if (!mission) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Sélectionnez une mission pour exécuter des vérifications dans PROOF.
      </div>
    );
  }

  const missionRuns = proofRuns.filter((r) => r.missionId === mission.id);
  const displayedRun = latestRun && latestRun.missionId === mission.id ? latestRun : missionRuns[0] ?? null;

  async function handleRunProof(e: React.FormEvent) {
    e.preventDefault();
    if (!mission || !sourceCode.trim()) {
      onNotify('Le code source à tester est requis.', 'error');
      return;
    }
    setRunningProof(true);
    try {
      const res = await api.runProof(mission.id, {
        language,
        sourceCode,
        testCode,
        enforceDlp,
      });
      setLatestRun(res.proofRun);
      await onRefresh();
      onNotify(
        res.proofRun.passed
          ? `PROOF réussi en ${res.proofRun.durationMs} ms.`
          : 'PROOF a détecté un échec — consultez les diagnostics ci-dessous.',
        res.proofRun.passed ? 'info' : 'error'
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erreur exécution PROOF', 'error');
    } finally {
      setRunningProof(false);
    }
  }

  async function handleTriggerRepair(proofRunId: string) {
    if (!mission) return;
    setRepairingId(proofRunId);
    try {
      const res = await api.triggerRepair(mission.id, proofRunId);
      await onRefresh();
      onNotify(
        `Analyse REPAIR ${res.mission.repairCount}/${res.mission.maxRepairs} générée dans le journal de la mission.`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erreur REPAIR', 'error');
    } finally {
      setRepairingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            PROOF & REPAIR — Bac à sable exécutable
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {mission.code} · Transpilation TypeScript/JS, scan DLP anti-secrets et exécution isolée en Node VM (réparations :{' '}
            <span className="font-mono tabular-nums">
              {mission.repairCount}/{mission.maxRepairs}
            </span>
            ).
          </p>
        </div>
      </div>

      <form onSubmit={handleRunProof} className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <label htmlFor="proof-lang" className="block text-xs font-medium text-slate-700 mb-1">
                Langage
              </label>
              <select
                id="proof-lang"
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'typescript' | 'javascript')}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="typescript">TypeScript</option>
                <option value="javascript">JavaScript</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 pt-4 cursor-pointer">
              <input
                type="checkbox"
                checked={enforceDlp}
                onChange={(e) => setEnforceDlp(e.target.checked)}
                className="rounded border-slate-300"
              />
              Bloquer l’exécution si un secret est détecté (DLP)
            </label>
          </div>

          <button
            type="submit"
            disabled={runningProof}
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Play className="w-4 h-4" aria-hidden="true" />
            {runningProof ? 'Exécution sandbox…' : 'Exécuter Proof'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label htmlFor="proof-source" className="block text-xs font-medium text-slate-700 mb-1">
              Module source à vérifier
            </label>
            <textarea
              id="proof-source"
              rows={11}
              value={sourceCode}
              onChange={(e) => setSourceCode(e.target.value)}
              spellCheck={false}
              className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="proof-tests" className="block text-xs font-medium text-slate-700 mb-1">
              Assertions unitaires (`test(nom, fn)` & `assert`)
            </label>
            <textarea
              id="proof-tests"
              rows={11}
              value={testCode}
              onChange={(e) => setTestCode(e.target.value)}
              spellCheck={false}
              className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>
      </form>

      {displayedRun && (
        <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-slate-600" aria-hidden="true" />
              <h2 className="text-base font-semibold text-slate-900">
                Résultat de vérification —{' '}
                <span className={displayedRun.passed ? 'text-emerald-700' : 'text-red-700'}>
                  {displayedRun.passed ? 'SUCCÈS' : 'ÉCHEC'}
                </span>
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono tabular-nums text-slate-500">
                Durée : {displayedRun.durationMs} ms · DLP :{' '}
                {displayedRun.dlpPassed ? 'OK' : 'BLOQUÉ'}
              </span>
              {!displayedRun.passed && (
                <button
                  type="button"
                  disabled={
                    repairingId === displayedRun.id ||
                    !geminiConfigured ||
                    mission.repairCount >= mission.maxRepairs
                  }
                  onClick={() => handleTriggerRepair(displayedRun.id)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap"
                >
                  <Wrench className="w-3.5 h-3.5" aria-hidden="true" />
                  {repairingId === displayedRun.id
                    ? 'Analyse REPAIR…'
                    : `Analyser l'échec (REPAIR ${mission.repairCount}/${mission.maxRepairs})`}
                </button>
              )}
            </div>
          </div>

          {displayedRun.dlpFindings.length > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3.5 space-y-1">
              <div className="text-xs font-semibold text-red-900 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4" aria-hidden="true" />
                Alertes DLP détectées
              </div>
              {displayedRun.dlpFindings.map((f, idx) => (
                <div key={idx} className="text-xs font-mono text-red-800">
                  Ligne {f.line} · {f.label} ({f.matchPreview})
                </div>
              ))}
            </div>
          )}

          {displayedRun.compileErrors.length > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3.5 space-y-1">
              <div className="text-xs font-semibold text-red-900">Erreurs de compilation</div>
              {displayedRun.compileErrors.map((err, idx) => (
                <div key={idx} className="text-xs font-mono text-red-800">
                  {err}
                </div>
              ))}
            </div>
          )}

          <div>
            <div className="text-xs font-medium text-slate-500 mb-1.5">Journal d’exécution sandbox</div>
            <pre className="rounded-md border border-slate-200 bg-slate-900 p-4 text-xs font-mono text-slate-100 overflow-x-auto whitespace-pre-wrap">
              {displayedRun.runtimeLogs.join('\n') || 'Aucune sortie.'}
            </pre>
          </div>
        </section>
      )}

      {missionRuns.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Historique des exécutions PROOF</h3>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {missionRuns.length} exécution(s)
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">ID</th>
                  <th className="py-2.5 px-4">Langage</th>
                  <th className="py-2.5 px-4">Verdict</th>
                  <th className="py-2.5 px-4">DLP</th>
                  <th className="py-2.5 px-4 text-right">Durée</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {missionRuns.map((run) => (
                  <tr key={run.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono text-slate-700">
                      <button
                        type="button"
                        onClick={() => setLatestRun(run)}
                        className="hover:text-blue-700 underline decoration-slate-300"
                      >
                        {run.id}
                      </button>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-600">{run.language}</td>
                    <td className="py-2.5 px-4 font-semibold">
                      <span className={run.passed ? 'text-emerald-700' : 'text-red-700'}>
                        {run.passed ? 'SUCCÈS' : 'ÉCHEC'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-700">
                      {run.dlpPassed ? 'OK' : `${run.dlpFindings.length} alerte(s)`}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {run.durationMs} ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
