import * as esbuild from 'esbuild';
import { scanForSecrets } from '../src/core/dlp.ts';
import type { DlpFinding } from '../src/core/types.ts';

export interface ProofExecutionResult {
  passed: boolean;
  dlpPassed: boolean;
  dlpFindings: DlpFinding[];
  compileErrors: string[];
  runtimeLogs: string[];
  durationMs: number;
}

function transpileAndCheck(
  code: string,
  fileName: string,
  language: 'typescript' | 'javascript'
): { jsText: string; errors: string[] } {
  try {
    const result = esbuild.transformSync(code, {
      loader: language === 'typescript' ? 'ts' : 'js',
      format: 'cjs',
      target: 'es2022',
      sourcefile: fileName,
    });
    return {
      jsText: result.code,
      errors: result.warnings.map((w) => `${fileName}:${w.location?.line ?? 1} — ${w.text}`),
    };
  } catch (err) {
    const errors: string[] = [];
    const failure = err as {
      errors?: Array<{ text: string; location?: { line: number; column: number } | null }>;
    };
    if (Array.isArray(failure.errors) && failure.errors.length > 0) {
      for (const e of failure.errors) {
        const loc = e.location ? `:${e.location.line}:${e.location.column}` : '';
        errors.push(`${fileName}${loc} — ${e.text}`);
      }
    } else {
      errors.push(`${fileName} — ${err instanceof Error ? err.message : String(err)}`);
    }
    return { jsText: '', errors };
  }
}

/**
 * PROOF currently performs static transpilation and DLP checks only.
 *
 * IMPORTANT: Do not execute submitted source or test code in this Node process.
 * Node's vm module is not a security boundary. Runtime execution must remain
 * disabled until it is moved into a separately isolated, disposable worker
 * with no application secrets, restricted filesystem/network access, and
 * enforceable CPU, memory, and wall-clock limits.
 */
export function runProofSandbox(input: {
  language: 'typescript' | 'javascript';
  sourceCode: string;
  testCode: string;
  enforceDlp: boolean;
}): ProofExecutionResult {
  const start = Date.now();
  const combinedText = `${input.sourceCode}\n${input.testCode}`;
  const dlpFindings = scanForSecrets(combinedText);
  const dlpPassed = dlpFindings.length === 0;

  if (input.enforceDlp && !dlpPassed) {
    return {
      passed: false,
      dlpPassed: false,
      dlpFindings,
      compileErrors: [],
      runtimeLogs: [
        `GOVERN DLP : analyse bloquée — ${dlpFindings.length} secret(s) potentiel(s) détecté(s).`,
      ],
      durationMs: Date.now() - start,
    };
  }

  const ext = input.language === 'typescript' ? 'ts' : 'js';
  const sourceTranspiled = transpileAndCheck(input.sourceCode, `module.${ext}`, input.language);
  const testTranspiled = transpileAndCheck(input.testCode, `module.test.${ext}`, input.language);
  const compileErrors = [...sourceTranspiled.errors, ...testTranspiled.errors];

  if (compileErrors.length > 0) {
    return {
      passed: false,
      dlpPassed,
      dlpFindings,
      compileErrors,
      runtimeLogs: ['Analyse statique échouée : corrigez les diagnostics avant toute validation.'],
      durationMs: Date.now() - start,
    };
  }

  return {
    // A successful transpilation is not a successful test run.
    passed: false,
    dlpPassed,
    dlpFindings,
    compileErrors: [],
    runtimeLogs: [
      'Analyse statique réussie : TypeScript/JavaScript transpile sans erreur.',
      'Exécution PROOF désactivée par sécurité : aucun code fourni n’a été exécuté.',
      'Les tests ne peuvent être déclarés PASS qu’après mise en place d’un exécuteur réellement isolé.',
    ],
    durationMs: Date.now() - start,
  };
}
