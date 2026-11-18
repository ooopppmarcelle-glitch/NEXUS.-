import {
  BookOpen,
  FlaskConical,
  GitBranch,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import type { ConnectorStatus, Mission } from '../core/types';

export type WorkspaceTab = 'missions' | 'decomposer' | 'memory' | 'proof' | 'govern';

interface SidebarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  missions: Mission[];
  selectedMissionId: string;
  onSelectMission: (missionId: string) => void;
  connectors: ConnectorStatus;
  pendingAdrCount: number;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

const NAV_ITEMS: Array<{
  id: WorkspaceTab;
  label: string;
  subtitle: string;
  icon: typeof Layers;
}> = [
  { id: 'missions', label: 'Missions', subtitle: 'Orchestration & Relay', icon: Layers },
  { id: 'decomposer', label: 'Decomposer', subtitle: 'Sous-tâches & Rôles', icon: GitBranch },
  { id: 'memory', label: 'Memory', subtitle: 'Registre ADR', icon: BookOpen },
  { id: 'proof', label: 'Proof & Repair', subtitle: 'Sandbox & Tests', icon: FlaskConical },
  { id: 'govern', label: 'Govern', subtitle: 'Sécurité & Règles', icon: ShieldCheck },
];

export function Sidebar({
  activeTab,
  onSelectTab,
  missions,
  selectedMissionId,
  onSelectMission,
  connectors,
  pendingAdrCount,
  mobileOpen = false,
  onCloseMobile,
}: SidebarProps) {
  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside
        className={`${
          mobileOpen ? 'fixed inset-y-0 left-0 z-40 flex' : 'hidden md:flex'
        } w-64 shrink-0 border-r border-slate-200 bg-white flex-col justify-between min-h-screen`}
      >
        <div>
          <div className="px-5 py-5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <div className="text-lg font-bold tracking-tight text-slate-900">NEXUS³</div>
              <p className="mt-1 text-xs text-slate-500">
                Trois intelligences · Contrôle fondateur
              </p>
            </div>
            {mobileOpen && onCloseMobile && (
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Fermer le menu"
                className="md:hidden rounded border border-slate-200 px-2 py-1 text-xs text-slate-600"
              >
                Fermer
              </button>
            )}
          </div>

          <div className="px-4 py-4 border-b border-slate-200">
            <label
              htmlFor="sidebar-mission-select"
              className="block text-xs font-medium text-slate-500 mb-1.5"
            >
              Mission active
            </label>
            <select
              id="sidebar-mission-select"
              value={selectedMissionId}
              onChange={(e) => onSelectMission(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-slate-50 pl-2.5 pr-6 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none truncate"
            >
              {missions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} — {m.title}
                </option>
              ))}
            </select>
          </div>

          <nav aria-label="Modules NEXUS³" className="px-3 py-4 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectTab(item.id);
                    onCloseMobile?.();
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-left transition-colors ${
                    isActive
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">
                      <span className="block text-sm font-medium leading-tight whitespace-nowrap">
                        {item.label}
                      </span>
                      <span
                        className={`block text-[11px] leading-tight mt-0.5 truncate ${
                          isActive ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        {item.subtitle}
                      </span>
                    </span>
                  </span>
                  {item.id === 'memory' && pendingAdrCount > 0 && (
                    <span
                      className={`text-xs font-mono tabular-nums shrink-0 ml-2 ${
                        isActive ? 'text-amber-300' : 'text-amber-700'
                      }`}
                    >
                      {pendingAdrCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="px-5 py-4 border-t border-slate-200 space-y-1.5 text-xs text-slate-600">
          <div className="font-medium text-slate-900">Connecteurs serveur</div>
          <div className="flex items-center justify-between">
            <span>Gemini API</span>
            <span className="font-mono text-[11px] text-slate-700">
              {connectors.geminiApiConfigured ? 'Actif' : 'Non configuré'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Mode Relay (0 €)</span>
            <span className="font-mono text-[11px] text-emerald-700">Prêt</span>
          </div>
        </div>
      </aside>
    </>
  );
}
