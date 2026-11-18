import { useEffect, useState } from 'react';
import { BookOpen, Check, Plus, Search, X } from 'lucide-react';
import { api } from '../api/client';
import type { DecisionRecord, DecisionStatus, LogicalRole, Mission } from '../core/types';

interface MemoryViewProps {
  decisions: DecisionRecord[];
  selectedMission: Mission | null;
  onRefresh: () => Promise<void>;
  onNotify: (message: string, kind?: 'info' | 'error') => void;
}

const STATUS_LABELS: Record<DecisionStatus | 'ALL', string> = {
  ALL: 'Toutes',
  PROPOSED: 'Proposées',
  APPROVED: 'Approuvées',
  REJECTED: 'Rejetées',
  SUPERSEDED: 'Remplacées',
};

export function MemoryView({
  decisions,
  selectedMission,
  onRefresh,
  onNotify,
}: MemoryViewProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<DecisionStatus | 'ALL'>('ALL');
  const [rankedResults, setRankedResults] = useState<
    Array<{ record: DecisionRecord; score: number }>
  >(() => decisions.map((record) => ({ record, score: 1 })));
  const [searching, setSearching] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState('');
  const [context, setContext] = useState('');
  const [decision, setDecision] = useState('');
  const [consequences, setConsequences] = useState('');
  const [authorRole, setAuthorRole] = useState<LogicalRole | 'FOUNDER'>('FOUNDER');
  const [tagsText, setTagsText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSearching(true);
    api
      .searchDecisions(query, statusFilter)
      .then((res) => {
        if (!cancelled) {
          setRankedResults(res.results);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRankedResults(decisions.map((record) => ({ record, score: 1 })));
        }
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query, statusFilter, decisions]);

  async function handleDecisionStatus(record: DecisionRecord, nextStatus: DecisionStatus) {
    try {
      await api.updateDecisionStatus(record.id, nextStatus);
      await onRefresh();
      onNotify(`${record.code} marquée comme ${STATUS_LABELS[nextStatus]}.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erreur mise à jour ADR', 'error');
    }
  }

  async function handleCreateAdr(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !decision.trim()) {
      onNotify('Le titre et la décision sont obligatoires.', 'error');
      return;
    }
    setSaving(true);
    try {
      const tags = tagsText
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      const res = await api.createDecision({
        missionId: selectedMission?.id ?? null,
        title: title.trim(),
        context: context.trim(),
        decision: decision.trim(),
        consequences: consequences.trim(),
        authorRole,
        tags,
      });
      setTitle('');
      setContext('');
      setDecision('');
      setConsequences('');
      setTagsText('');
      setShowAddForm(false);
      await onRefresh();
      onNotify(`${res.decision.code} ajoutée au statut Proposée (en attente validation fondateur).`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erreur création ADR', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            MEMORY — Registre des décisions (ADR)
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Mémoire canonique indexée. Seules les décisions approuvées par le fondateur sont injectées aux agents.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          {showAddForm ? 'Fermer' : 'Proposer un ADR'}
        </button>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleCreateAdr}
          className="rounded-lg border border-slate-200 bg-white p-6 space-y-4"
        >
          <h2 className="text-base font-semibold text-slate-900">Nouvelle décision d’architecture</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="adr-title" className="block text-xs font-medium text-slate-700 mb-1">
                Titre de la décision
              </label>
              <input
                id="adr-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex. : Isolation des agents par Git worktree"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="adr-author" className="block text-xs font-medium text-slate-700 mb-1">
                Auteur de la proposition
              </label>
              <select
                id="adr-author"
                value={authorRole}
                onChange={(e) => setAuthorRole(e.target.value as LogicalRole | 'FOUNDER')}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="FOUNDER">Fondateur</option>
                <option value="RESEARCHER">Chercheur (Gemini)</option>
                <option value="PLANNER">Coordinateur (ChatGPT)</option>
                <option value="BUILDER">Ingénieur (Claude)</option>
                <option value="AUDITOR">Auditeur</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="adr-context" className="block text-xs font-medium text-slate-700 mb-1">
              Contexte & problème posé
            </label>
            <textarea
              id="adr-context"
              rows={2}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Contraintes techniques ou financières ayant motivé cette décision"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="adr-decision" className="block text-xs font-medium text-slate-700 mb-1">
              Décision retenue
            </label>
            <textarea
              id="adr-decision"
              rows={2}
              required
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
              placeholder="Règle claire et vérifiable à appliquer dans le projet"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="adr-conseq" className="block text-xs font-medium text-slate-700 mb-1">
                Conséquences / compromis
              </label>
              <input
                id="adr-conseq"
                type="text"
                value={consequences}
                onChange={(e) => setConsequences(e.target.value)}
                placeholder="Impacts positifs et limites acceptées"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="adr-tags" className="block text-xs font-medium text-slate-700 mb-1">
                Mots-clés (séparés par des virgules)
              </label>
              <input
                id="adr-tags"
                type="text"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="git, sandbox, proof"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer la proposition'}
            </button>
          </div>
        </form>
      )}

      {/* Search and filter toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <label htmlFor="memory-search-input" className="sr-only">
            Rechercher dans MEMORY
          </label>
          <input
            id="memory-search-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par mot-clé, code ADR, tag (ex. sqlite, relay, dlp)…"
            className="w-full rounded-md border border-slate-300 pl-9 pr-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md overflow-x-auto">
          {(['ALL', 'PROPOSED', 'APPROVED', 'REJECTED', 'SUPERSEDED'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === st
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {STATUS_LABELS[st]}
            </button>
          ))}
        </div>
      </div>

      {/* ADR list */}
      <div className="space-y-3">
        {searching && rankedResults.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Recherche dans le registre MEMORY…
          </div>
        ) : rankedResults.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Aucune décision ADR ne correspond à votre filtre.
          </div>
        ) : (
          rankedResults.map(({ record, score }) => (
            <article
              key={record.id}
              className="rounded-lg border border-slate-200 bg-white p-5 space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500 font-mono tabular-nums">
                    {record.code} · Statut :{' '}
                    <span
                      className={
                        record.status === 'APPROVED'
                          ? 'text-emerald-700 font-semibold'
                          : record.status === 'REJECTED'
                            ? 'text-red-700 font-semibold'
                            : 'text-amber-700 font-semibold'
                      }
                    >
                      {STATUS_LABELS[record.status]}
                    </span>{' '}
                    · Auteur : {record.authorRole}
                    {query.trim() ? ` · Score : ${score.toFixed(2)}` : ''}
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 mt-1 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                    {record.title}
                  </h3>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {record.status !== 'APPROVED' && (
                    <button
                      type="button"
                      onClick={() => handleDecisionStatus(record, 'APPROVED')}
                      aria-label={`Approuver ${record.code}`}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 whitespace-nowrap"
                    >
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      Approuver
                    </button>
                  )}
                  {record.status !== 'REJECTED' && (
                    <button
                      type="button"
                      onClick={() => handleDecisionStatus(record, 'REJECTED')}
                      aria-label={`Rejeter ${record.code}`}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                      Rejeter
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100 text-sm">
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-0.5">Contexte</div>
                  <p className="text-slate-700">{record.context || 'Non précisé.'}</p>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-0.5">Décision</div>
                  <p className="text-slate-900 font-medium">{record.decision}</p>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-0.5">Conséquences</div>
                  <p className="text-slate-700">{record.consequences || 'Non précisées.'}</p>
                </div>
              </div>

              {record.tags.length > 0 && (
                <div className="text-xs text-slate-500 font-mono pt-1">
                  Mots-clés : {record.tags.join(' · ')}
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
