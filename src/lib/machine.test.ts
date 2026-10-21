import { test } from 'node:test';
import assert from 'node:assert/strict';
import { machineSettings } from './machine.ts';

test('machine settings default to polling on and automatic posting, and refuse unknown values', () => {
  assert.deepEqual(machineSettings({}), { polling: true, posting: 'auto' });
  assert.deepEqual(machineSettings({ CRA_POLL: 'OFF', CRA_POSTING: 'comment' }), { polling: false, posting: 'comment' });
  assert.throws(() => machineSettings({ CRA_POLL: 'no' }), /CRA_POLL must be on or off/);
  assert.throws(() => machineSettings({ CRA_POSTING: 'never' }), /CRA_POSTING must be auto or comment/);
});
