import assert from 'node:assert/strict';
import vm from 'node:vm';
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

export function runProofSandbox(input: {
  language: 'typescript' | 'javascript';
  sourceCode: string;
  testCode: string;
  enforceDlp: boolean;
}): ProofExecutionResult {
  const start = Date.now();
  const runtimeLogs: string[] = [];

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
        `GOVERN DLP : exécution bloquée — ${dlpFindings.length} secret(s) potentiel(s) détecté(s) dans le code.`,
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
      runtimeLogs: ['Compilation échouée : corrigez les diagnostics avant exécution.'],
      durationMs: Date.now() - start,
    };
  }

  const exportsObj: Record<string, unknown> = {};
  const moduleObj = { exports: exportsObj };

  const sandboxConsole = {
    log: (...args: unknown[]) => {
      runtimeLogs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    },
    warn: (...args: unknown[]) => {
      runtimeLogs.push('[WARN] ' + args.map((a) => String(a)).join(' '));
    },
    error: (...args: unknown[]) => {
      runtimeLogs.push('[ERR] ' + args.map((a) => String(a)).join(' '));
    },
  };

  let testCount = 0;
  let testFailures = 0;

  const sandboxTest = (name: string, fn: () => void) => {
    testCount += 1;
    try {
      fn();
      runtimeLogs.push(`PASS: ${name}`);
    } catch (err) {
      testFailures += 1;
      const msg = err instanceof Error ? err.message : String(err);
      runtimeLogs.push(`FAIL: ${name} -> ${msg}`);
    }
  };

  const context = vm.createContext({
    exports: exportsObj,
    module: moduleObj,
    console: sandboxConsole,
    assert,
    test: sandboxTest,
    Math,
    JSON,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    Error,
    TypeError,
    RangeError,
  });

  try {
    const srcScript = new vm.Script(sourceTranspiled.jsText, { filename: `module.${ext}` });
    srcScript.runInContext(context, { timeout: 1000 });

    const exportedEntries = Object.entries(moduleObj.exports as Record<string, unknown>);
    for (const [key, val] of exportedEntries) {
      if (!(key in context)) {
        (context as Record<string, unknown>)[key] = val;
      }
    }

    if (input.testCode.trim().length > 0) {
      const testScript = new vm.Script(testTranspiled.jsText, { filename: `module.test.${ext}` });
      testScript.runInContext(context, { timeout: 1000 });
    }

    const passed = testFailures === 0;
    if (testCount > 0) {
      runtimeLogs.push(`Résumé PROOF : ${testCount - testFailures}/${testCount} test(s) réussi(s).`);
    } else {
      runtimeLogs.push('Compilation et exécution sandbox terminées sans erreur.');
    }

    return {
      passed,
      dlpPassed,
      dlpFindings,
      compileErrors: [],
      runtimeLogs,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtimeLogs.push(`Erreur d'exécution sandbox : ${msg}`);
    return {
      passed: false,
      dlpPassed,
      dlpFindings,
      compileErrors: [],
      runtimeLogs,
      durationMs: Date.now() - start,
    };
  }
}
