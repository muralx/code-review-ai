import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { installGhStub, withEnv } from './gh-stub.ts';
import { gh, ghJson } from '../../src/lib/gh.ts';

const run = promisify(execFile);

test('stub answers matched calls, logs them, and fails unmatched ones', async () => {
  const stub = await installGhStub([{ match: 'pr view 7', stdout: '{"number":7}' }]);
  const r = await run('gh', ['pr', 'view', '7', '--repo', 'acme/w'], { env: stub.env });
  assert.equal(r.stdout, '{"number":7}');
  await assert.rejects(run('gh', ['pr', 'list'], { env: stub.env }), /no response for pr list/);
  assert.deepEqual(await stub.calls(), [['pr', 'view', '7', '--repo', 'acme/w'], ['pr', 'list']]);
});

test('gh wrapper goes through the stub under withEnv', async () => {
  const stub = await installGhStub([{ match: 'pr view 7', stdout: '{"number":7}' }]);
  await withEnv(stub.env, async () => {
    assert.deepEqual(await ghJson<{ number: number }>(['pr', 'view', '7']), { number: 7 });
    await assert.rejects(gh(['pr', 'list']), /gh pr list failed/);
  });
});
