import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeTree, removeTree } from '../../tests/helpers/tmp.ts';
import { appendIndex, latestRunsByPr, listRuns, readRun, writeRun, type RunRecord } from './runs.ts';

function rec(id: string, extra: Partial<RunRecord> = {}): RunRecord {
  return {
    id, action: 'review', status: 'done', attempts: 1,
    target: { kind: 'pr', repo: 'acme/widgets', number: 7, head_sha: 'aaa' },
    source: { intake: 'poll' }, created_at: `2026-10-11T10:00:0${id.length % 10}Z`, updated_at: '2026-10-11T10:05:00Z',
    ...extra,
  };
}

test('write/read round trip and listRuns ignores non-run dirs', async () => {
  const runs = await makeTree({ 'junk.txt': 'x', 'notarun/README': 'y' });
  await writeRun(runs, rec('r1'));
  await writeRun(runs, rec('r2', { status: 'failed' }));
  const back = await readRun(join(runs, 'r1'));
  assert.equal(back.id, 'r1');
  const all = await listRuns(runs);
  assert.deepEqual(all.map((r) => r.id).sort(), ['r1', 'r2']);
  await removeTree(runs);
});

test('latestRunsByPr picks the newest by created_at for each (repo, number)', async () => {
  const runs = await makeTree({});
  await writeRun(runs, rec('a', { created_at: '2026-10-11T10:00:00Z', target: { kind: 'pr', repo: 'acme/widgets', number: 7, head_sha: 'old' } }));
  await writeRun(runs, rec('b', { created_at: '2026-10-11T11:00:00Z', target: { kind: 'pr', repo: 'acme/widgets', number: 7, head_sha: 'new' } }));
  await writeRun(runs, rec('c', { target: { kind: 'pr', repo: 'acme/widgets', number: 8, head_sha: 'x' } }));
  await writeRun(runs, rec('d', { target: { kind: 'local', path: '/p', ref: 'main' } }));
  const latest = await latestRunsByPr(runs);
  assert.equal(latest.get('acme/widgets#7')?.id, 'b');
  assert.equal(latest.get('acme/widgets#8')?.id, 'c');
  assert.equal(latest.size, 2);
  await removeTree(runs);
});

test('appendIndex appends one JSON line', async () => {
  const runs = await makeTree({});
  await appendIndex(runs, { run: 'r1', status: 'queued' });
  await appendIndex(runs, { run: 'r1', status: 'done' });
  const lines = (await readFile(join(runs, 'index.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 2);
  assert.equal(lines[1].status, 'done');
  assert.ok(lines[1].ts);
  await removeTree(runs);
});
