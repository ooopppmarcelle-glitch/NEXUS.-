import { useCallback, useEffect, useState } from 'react';
import { Menu, RefreshCw } from 'lucide-react';
import { api } from './api/client';
import { DecomposerView } from './components/DecomposerView';
import { GovernView } from './components/GovernView';
import { MemoryView } from './components/MemoryView';
import { MissionsView } from './components/MissionsView';
import { ProofRepairView } from './components/ProofRepairView';
import { Sidebar, type WorkspaceTab } from './components/Sidebar';
import type { WorkspaceSnapshot } from './core/types';

const TAB_TITLES: Record<WorkspaceTab, string> = {
  missions: 'Missions',
  decomposer: 'Decomposer',
  memory: 'Memory (ADR)',
  proof: 'Proof & Repair',
  govern: 'Govern',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('missions');
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [selectedMissionId, setSelectedMissionId] = useState<string>('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; kind: 'info' | 'error' } | null>(null);

  const notify = useCallback((message: string, kind: 'info' | 'error' = 'info') => {
    setToast({ message, kind });
    setTimeout(() => {
      setToast((curr) => (curr?.message === message ? null : curr));
    }, 4500);
  }, []);

  const fetchWorkspace = useCallback(async () => {
    try {
      const snap = await api.getWorkspace();
      setWorkspace(snap);
      setLoadError(null);
      setSelectedMissionId((prev) => {
        if (prev && snap.missions.some((m) => m.id === prev)) return prev;
        return snap.missions[0]?.id ?? '';
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Impossible de charger NEXUS³');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  const selectedMission =
    workspace?.missions.find((m) => m.id === selectedMissionId) ?? workspace?.missions[0] ?? null;

  const pendingAdrCount =
    workspace?.decisions.filter((d) => d.status === 'PROPOSED').length ?? 0;

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {workspace && (
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          missions={workspace.missions}
          selectedMissionId={selectedMission?.id ?? ''}
          onSelectMission={setSelectedMissionId}
          connectors={workspace.connectors}
          pendingAdrCount={pendingAdrCount}
          mobileOpen={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-slate-200 bg-white px-4 md:px-6 flex items-center justify-between gap-4 md:gap-8 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Ouvrir le menu de navigation"
              className="md:hidden rounded-md border border-slate-200 p-1.5 text-slate-700 hover:bg-slate-50 shrink-0"
            >
              <Menu className="w-4 h-4" aria-hidden="true" />
            </button>
            <div className="text-sm text-slate-600 truncate">
              <span className="font-semibold text-slate-900">NEXUS³</span>
              <span className="mx-2 text-slate-300">/</span>
              <span>{TAB_TITLES[activeTab]}</span>
              {selectedMission && (
                <>
                  <span className="mx-2 text-slate-300">/</span>
                  <span className="font-mono text-xs text-slate-700">{selectedMission.code}</span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={fetchWorkspace}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            Actualiser
          </button>
        </header>

        {toast && (
          <div
            role="status"
            className={`mx-4 md:mx-6 mt-4 rounded-md border px-4 py-2.5 text-sm flex items-center justify-between ${
              toast.kind === 'error'
                ? 'border-red-200 bg-red-50 text-red-900'
                : 'border-blue-200 bg-blue-50 text-blue-900'
            }`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-xs font-medium underline ml-4 shrink-0"
            >
              Fermer
            </button>
          </div>
        )}

        <main className="flex-1 p-4 md:p-6 max-w-6xl w-full mx-auto">
          {loading ? (
            <div className="space-y-4">
              <div className="h-8 w-64 bg-slate-200 rounded" />
              <div className="h-44 w-full bg-white border border-slate-200 rounded-lg" />
              <div className="h-64 w-full bg-white border border-slate-200 rounded-lg" />
            </div>
          ) : loadError || !workspace ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-6 space-y-3">
              <h2 className="text-base font-semibold text-red-900">Erreur de connexion serveur</h2>
              <p className="text-sm text-red-800">{loadError ?? 'État indisponible.'}</p>
              <button
                type="button"
                onClick={fetchWorkspace}
                className="rounded-md bg-red-800 px-4 py-2 text-xs font-medium text-white hover:bg-red-900"
              >
                Réessayer
              </button>
            </div>
          ) : (
            <>
              {activeTab === 'missions' && (
                <MissionsView
                  missions={workspace.missions}
                  selectedMission={selectedMission}
                  turns={workspace.turns}
                  policy={workspace.policy}
                  geminiConfigured={workspace.connectors.geminiApiConfigured}
                  onSelectMission={setSelectedMissionId}
                  onRefresh={fetchWorkspace}
                  onNotify={notify}
                />
              )}
              {activeTab === 'decomposer' && (
                <DecomposerView
                  mission={selectedMission}
                  subtasks={workspace.subtasks}
                  policy={workspace.policy}
                  geminiConfigured={workspace.connectors.geminiApiConfigured}
                  onRefresh={fetchWorkspace}
                  onNotify={notify}
                />
              )}
              {activeTab === 'memory' && (
                <MemoryView
                  decisions={workspace.decisions}
                  selectedMission={selectedMission}
                  onRefresh={fetchWorkspace}
                  onNotify={notify}
                />
              )}
              {activeTab === 'proof' && (
                <ProofRepairView
                  mission={selectedMission}
                  proofRuns={workspace.proofRuns}
                  geminiConfigured={workspace.connectors.geminiApiConfigured}
                  onRefresh={fetchWorkspace}
                  onNotify={notify}
                />
              )}
              {activeTab === 'govern' && (
                <GovernView
                  policy={workspace.policy}
                  connectors={workspace.connectors}
                  auditLogs={workspace.auditLogs}
                  todaySpendUsd={workspace.todaySpendUsd}
                  onRefresh={fetchWorkspace}
                  onNotify={notify}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
