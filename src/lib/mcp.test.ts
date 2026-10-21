import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planMcp } from './mcp.ts';

test('no servers: an empty .mcp.json and nothing opened', () => {
  const p = planMcp(undefined);
  assert.deepEqual(JSON.parse(p.mcpJson), { mcpServers: {} });
  assert.deepEqual([p.names, p.specialistTools, p.hosts, p.hostPorts, p.specialistNotes], [[], [], [], [], '']);
});

test('http and stdio servers: .mcp.json, specialist tools, firewall hosts and host ports', () => {
  const p = planMcp({
    tickets: { url: 'https://mcp.example.com/mcp', headers: { Authorization: 'Bearer ${TICKETS_TOKEN}' }, specialist_tools: ['get_issue'], note: 'the issue tracker.' },
    local: { url: 'http://host.docker.internal:8789/mcp' },
    docs: { command: 'npx', args: ['-y', '@example/docs-mcp'], specialist_tools: ['search'] },
  });
  assert.deepEqual(JSON.parse(p.mcpJson).mcpServers, {
    tickets: { type: 'http', url: 'https://mcp.example.com/mcp', headers: { Authorization: 'Bearer ${TICKETS_TOKEN}' } },
    local: { type: 'http', url: 'http://host.docker.internal:8789/mcp' },
    docs: { type: 'stdio', command: 'npx', args: ['-y', '@example/docs-mcp'] },
  });
  assert.deepEqual(p.names, ['tickets', 'local', 'docs']);
  assert.deepEqual(p.specialistTools, ['mcp__tickets__get_issue', 'mcp__docs__search']);
  assert.deepEqual(p.hosts, ['mcp.example.com']);
  assert.deepEqual(p.hostPorts, [8789]);
  assert.match(p.specialistNotes, /`tickets`: the issue tracker\. Tools: `mcp__tickets__get_issue`\./);
  assert.doesNotMatch(p.specialistNotes, /`local`/);
});

test('bad entries are refused with the server named', () => {
  assert.throws(() => planMcp({ a: {} }), /mcp_servers\.a: set exactly one of url and command/);
  assert.throws(() => planMcp({ a: { url: 'http://localhost:9000/mcp' } }), /mcp_servers\.a: localhost is the container itself/);
  assert.throws(() => planMcp({ a: { url: 'ftp://x/y' } }), /http or https/);
  assert.throws(() => planMcp({ 'a b': { command: 'x' } }), /server name/);
  assert.throws(() => planMcp({ a: { command: 'x', specialist_tools: ['*'] } }), /specialist_tools/);
});
