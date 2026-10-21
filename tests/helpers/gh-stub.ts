import { chmod, mkdir, readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface GhResponse { match: string; stdout?: string; exit?: number; stderr?: string }

export interface GhStub {
  binDir: string;
  specPath: string;
  logPath: string;
  env: NodeJS.ProcessEnv;
  calls(): Promise<string[][]>;
  setResponses(responses: GhResponse[]): Promise<void>;
}

const SCRIPT = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const joined = args.join(' ');
fs.appendFileSync(process.env.GH_STUB_LOG, JSON.stringify(args) + '\\n');
const spec = JSON.parse(fs.readFileSync(process.env.GH_STUB_SPEC, 'utf8'));
const hit = (spec.responses || []).find((r) => joined.startsWith(r.match));
if (!hit) { process.stderr.write('gh-stub: no response for ' + joined + '\\n'); process.exit(1); }
if (hit.stdout) process.stdout.write(hit.stdout);
if (hit.stderr) process.stderr.write(hit.stderr);
process.exit(hit.exit || 0);
`;

export async function installGhStub(responses: GhResponse[] = []): Promise<GhStub> {
  const root = await mkdtemp(join(tmpdir(), 'gh-stub-'));
  const binDir = join(root, 'bin');
  await mkdir(binDir);
  const script = join(binDir, 'gh');
  await writeFile(script, SCRIPT, 'utf8');
  await chmod(script, 0o755);
  const specPath = join(root, 'spec.json');
  const logPath = join(root, 'calls.log');
  await writeFile(logPath, '');
  const stub: GhStub = {
    binDir, specPath, logPath,
    env: { ...process.env, PATH: `${binDir}:${process.env['PATH']}`, GH_STUB_SPEC: specPath, GH_STUB_LOG: logPath },
    async calls() {
      const text = await readFile(logPath, 'utf8');
      return text.trim() ? text.trim().split('\n').map((l) => JSON.parse(l) as string[]) : [];
    },
    async setResponses(rs) { await writeFile(specPath, JSON.stringify({ responses: rs }), 'utf8'); },
  };
  await stub.setResponses(responses);
  return stub;
}

/** Run fn with process.env temporarily replaced (the gh wrapper reads process.env). */
export async function withEnv<T>(env: NodeJS.ProcessEnv, fn: () => Promise<T>): Promise<T> {
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, env);
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}
