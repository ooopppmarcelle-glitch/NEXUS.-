import type { DecisionRecord, DecisionStatus } from './types.ts';

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

export interface SearchDecisionsOptions {
  query?: string;
  statusFilter?: DecisionStatus | 'ALL';
}

export interface RankedDecision {
  record: DecisionRecord;
  score: number;
}

export function searchDecisions(
  decisions: readonly DecisionRecord[],
  options: SearchDecisionsOptions = {}
): RankedDecision[] {
  const { query = '', statusFilter = 'ALL' } = options;
  const filtered =
    statusFilter === 'ALL'
      ? [...decisions]
      : decisions.filter((d) => d.status === statusFilter);

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return filtered
      .sort((a, b) => {
        if (a.status === 'APPROVED' && b.status !== 'APPROVED') return -1;
        if (a.status !== 'APPROVED' && b.status === 'APPROVED') return 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      })
      .map((record) => ({ record, score: 1 }));
  }

  const queryTokens = tokenize(normalizedQuery);
  const docCount = filtered.length || 1;
  const docTokensList = filtered.map((d) =>
    tokenize([d.code, d.title, d.context, d.decision, d.consequences, ...d.tags].join(' '))
  );

  // Compute IDF across filtered ADR corpus
  const df = new Map<string, number>();
  for (const tokens of docTokensList) {
    const unique = new Set(tokens);
    for (const token of unique) {
      df.set(token, (df.get(token) ?? 0) + 1);
    }
  }

  const ranked: RankedDecision[] = [];
  filtered.forEach((record, index) => {
    const tokens = docTokensList[index];
    const haystack = [record.code, record.title, record.context, record.decision, ...record.tags]
      .join(' ')
      .toLowerCase();

    let score = 0;
    if (haystack.includes(normalizedQuery)) {
      score += 4.0;
    }
    if (record.code.toLowerCase() === normalizedQuery) {
      score += 6.0;
    }

    const tf = new Map<string, number>();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) ?? 0) + 1);
    }

    for (const qt of queryTokens) {
      const freq = tf.get(qt) ?? 0;
      if (freq > 0) {
        const idf = Math.log(1 + docCount / (1 + (df.get(qt) ?? 0)));
        score += (1 + Math.log(freq)) * idf;
      } else {
        // Prefix match fallback
        for (const docToken of tf.keys()) {
          if (docToken.startsWith(qt)) {
            score += 0.6;
            break;
          }
        }
      }
    }

    if (score > 0) {
      const statusWeight =
        record.status === 'APPROVED' ? 1.25 : record.status === 'PROPOSED' ? 1.0 : 0.7;
      ranked.push({ record, score: Number((score * statusWeight).toFixed(3)) });
    }
  });

  return ranked.sort((a, b) => b.score - a.score);
}
