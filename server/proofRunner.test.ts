import test from 'node:test';
import assert from 'node:assert/strict';
import { runProofSandbox } from './proofRunner.ts';

test('PROOF sandbox transpiles TypeScript and passes valid assertions', () => {
  const res = runProofSandbox({
    language: 'typescript',
    sourceCode: 'export function sum(a: number, b: number): number { return a + b; }',
    testCode: `test('addition works', () => { assert.equal(sum(2, 3), 5); });`,
    enforceDlp: true,
  });

  assert.equal(res.passed, true);
  assert.equal(res.dlpPassed, true);
  assert.equal(res.compileErrors.length, 0);
  assert.equal(res.runtimeLogs.some((l) => l.includes('PASS: addition works')), true);
});

test('PROOF sandbox reports failing assertions accurately', () => {
  const res = runProofSandbox({
    language: 'typescript',
    sourceCode: 'export function mul(a: number, b: number): number { return a + b; }',
    testCode: `test('multiplication works', () => { assert.equal(mul(3, 4), 12); });`,
    enforceDlp: true,
  });

  assert.equal(res.passed, false);
  assert.equal(res.runtimeLogs.some((l) => l.includes('FAIL: multiplication works')), true);
});

test('PROOF sandbox blocks execution when DLP detects secrets', () => {
  const res = runProofSandbox({
    language: 'javascript',
    sourceCode: 'const key = "sk-proj-1234567890abcdefghijklmnopqrstuv";',
    testCode: '',
    enforceDlp: true,
  });

  assert.equal(res.passed, false);
  assert.equal(res.dlpPassed, false);
  assert.equal(res.dlpFindings.length >= 1, true);
});
