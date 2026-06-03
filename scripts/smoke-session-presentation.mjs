import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import ts from 'typescript';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const sourcePath = path.join(root, 'lib/patterns/sessionPresentation.ts');
const typesPath = path.join(root, 'lib/types/index.ts');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-session-presentation-'));
const compiledTypesPath = path.join(tempDir, 'types.cjs');
const compiledSourcePath = path.join(tempDir, 'sessionPresentation.cjs');

const compile = (inputPath, outputPath, extraReplacements = []) => {
  let source = fs.readFileSync(inputPath, 'utf8');
  for (const [from, to] of extraReplacements) source = source.replace(from, to);
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: inputPath,
  });
  fs.writeFileSync(outputPath, output.outputText, 'utf8');
};

compile(typesPath, compiledTypesPath);
compile(sourcePath, compiledSourcePath, [[/\.\.\/types/g, './types.cjs']]);

const { deriveSessionDisplayLabel, isSessionActive } = await import(`file://${compiledSourcePath}`);

assert.equal(
  deriveSessionDisplayLabel({
    session_id: 'agent:ops:subagent:12345678-abcd-ef01-2345-6789abcdef01',
    label: 'SubAgent 123456',
    lineage_label: null,
    task_preview: 'Fix active-only filter and task-based subagent names',
  }),
  'Fix active-only filter and task-based subagen…',
);

assert.equal(
  deriveSessionDisplayLabel({
    session_id: 'agent:ops:subagent:12345678-abcd-ef01-2345-6789abcdef01',
    label: null,
    lineage_label: null,
    task_preview: '[Subagent Task]\n1) Ripulisci il task_preview e usa un nome leggibile',
  }),
  'Ripulisci il task_preview e usa un nome leggi…',
);

assert.equal(isSessionActive({ status: 'completed' }), false);
assert.equal(isSessionActive({ status: 'working' }), true);


console.log('smoke-session-presentation: ok');
