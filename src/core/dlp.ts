import type { DlpFinding } from './types.ts';

interface DlpRule {
  id: string;
  label: string;
  severity: 'HIGH' | 'MEDIUM';
  pattern: RegExp;
}

const DLP_RULES: readonly DlpRule[] = [
  {
    id: 'OPENAI_KEY',
    label: 'Clé API OpenAI détectée',
    severity: 'HIGH',
    pattern: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    id: 'ANTHROPIC_KEY',
    label: 'Clé API Anthropic détectée',
    severity: 'HIGH',
    pattern: /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g,
  },
  {
    id: 'GOOGLE_API_KEY',
    label: 'Clé API Google / Gemini détectée',
    severity: 'HIGH',
    pattern: /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  },
  {
    id: 'GITHUB_TOKEN',
    label: 'Jeton GitHub détecté',
    severity: 'HIGH',
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  },
  {
    id: 'AWS_ACCESS_KEY',
    label: 'Clé d’accès AWS détectée',
    severity: 'HIGH',
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    id: 'PRIVATE_KEY_PEM',
    label: 'Clé privée cryptographique PEM détectée',
    severity: 'HIGH',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
  },
  {
    id: 'JWT_TOKEN',
    label: 'Jeton JWT détecté',
    severity: 'MEDIUM',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  {
    id: 'ENV_SECRET_ASSIGNMENT',
    label: 'Affectation de secret ou mot de passe (.env)',
    severity: 'MEDIUM',
    pattern: /\b(?:API_KEY|SECRET_KEY|DB_PASSWORD|DATABASE_URL|AUTH_TOKEN|PRIVATE_KEY)\s*=\s*["']?[A-Za-z0-9_/:+.-]{8,}["']?/g,
  },
];

function maskMatch(raw: string): string {
  if (raw.length <= 8) return '****';
  return `${raw.slice(0, 4)}…${raw.slice(-4)}`;
}

export function scanForSecrets(text: string): DlpFinding[] {
  if (!text) return [];
  const findings: DlpFinding[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((lineText, idx) => {
    for (const rule of DLP_RULES) {
      const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
      let match: RegExpExecArray | null = regex.exec(lineText);
      while (match !== null) {
        findings.push({
          ruleId: rule.id,
          label: rule.label,
          severity: rule.severity,
          matchPreview: maskMatch(match[0]),
          line: idx + 1,
        });
        if (match[0].length === 0) break;
        match = regex.exec(lineText);
      }
    }
  });

  return findings;
}

export function redactSecrets(text: string): { redacted: string; findings: DlpFinding[] } {
  const findings = scanForSecrets(text);
  if (findings.length === 0) {
    return { redacted: text, findings: [] };
  }

  let redacted = text;
  for (const rule of DLP_RULES) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    redacted = redacted.replace(regex, (matched) => `[REDACTED:${rule.id}:${maskMatch(matched)}]`);
  }

  return { redacted, findings };
}
