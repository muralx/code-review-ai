import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { makeTree, removeTree } from '../../tests/helpers/tmp.ts';
import { initDeployment, parseClaudeUpdate, updateDeployment } from './deployment.ts';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const COMPANY = join(ROOT, 'tests/fixtures/company-acme');

test('init renders a complete deployment from a linked company path', async () => {
  const tmp = await makeTree({});
  const dir = join(tmp, 'acme');
  const g = await initDeployment({ dir, frameworkDir: ROOT, company: COMPANY, link: true, workspace: 'acme-dev', localRoots: [join(tmp, 'dev')], agentLinkPath: '/home/you/dev/agent-link' });
  for (const f of ['CLAUDE.md', 'compose.yaml', 'config.yaml', '.env', '.agent-link.json', '.mcp.json', '.claude/settings.json', '.claude/agents/specialist.md', '.claude/agents/merger.md', '.claude/commands/boot.md', '.claude/commands/poll.md', '.claude/commands/run.md', '.claude/commands/status.md', 'DEPLOYMENT.md', 'firewall-allow.txt', '.cra-generated.json', 'company/defaults.yaml']) {
    await access(join(dir, f));
  }
  const claudeMd = await readFile(join(dir, 'CLAUDE.md'), 'utf8');
  assert.doesNotMatch(claudeMd, /\{\{/);
  assert.match(claudeMd, /workspace `acme-dev` under the name `code-reviewer`/);
  const compose = parse(await readFile(join(dir, 'compose.yaml'), 'utf8')) as { services: { reviewer: { volumes: string[]; cap_add: string[] } } };
  assert.ok(compose.services.reviewer.volumes.includes(`${join(tmp, 'dev')}:${join(tmp, 'dev')}:ro`));
  assert.ok(compose.services.reviewer.volumes.includes('/home/you/dev/agent-link:/opt/agent-link:ro'));
  assert.ok(compose.services.reviewer.volumes.includes(`${COMPANY}:${COMPANY}:ro`), 'linked company path is mounted');
  assert.deepEqual(compose.services.reviewer.cap_add, ['NET_ADMIN']);
  const cfg = parse(await readFile(join(dir, 'config.yaml'), 'utf8')) as { agent_link: { workspace: string }; local_roots: string[]; github: { poll_interval_minutes: number } };
  assert.equal(cfg.agent_link.workspace, 'acme-dev');
  assert.deepEqual(cfg.local_roots, [join(tmp, 'dev')]);
  assert.deepEqual(JSON.parse(await readFile(join(dir, '.agent-link.json'), 'utf8')), { workspace: 'acme-dev' });
  assert.ok(g.files.includes('CLAUDE.md'));
  await assert.rejects(initDeployment({ dir, frameworkDir: ROOT, company: COMPANY, link: true, workspace: 'x' }), /already a deployment/);
  await removeTree(tmp);
});

test('update re-renders generated files from config changes and leaves operator files alone', async () => {
  const tmp = await makeTree({});
  const dir = join(tmp, 'acme');
  await initDeployment({ dir, frameworkDir: ROOT, company: COMPANY, link: true, workspace: 'acme-dev' });
  const cfgPath = join(dir, 'config.yaml');
  let cfg = await readFile(cfgPath, 'utf8');
  cfg = cfg.replace('name: code-reviewer', 'name: reviewer-two').replace('poll_interval_minutes: 10', 'poll_interval_minutes: 7');
  await writeFile(cfgPath, cfg, 'utf8');
  await writeFile(join(dir, '.env'), 'GH_TOKEN=secret\n', 'utf8');
  await writeFile(join(dir, 'CLAUDE.md'), 'hand edit\n', 'utf8');
  await updateDeployment(dir, ROOT);
  const claudeMd = await readFile(join(dir, 'CLAUDE.md'), 'utf8');
  assert.match(claudeMd, /`reviewer-two`/);
  assert.match(claudeMd, /\*\/7 \* \* \* \*/);
  assert.equal(await readFile(join(dir, '.env'), 'utf8'), 'GH_TOKEN=secret\n');
  assert.equal(await readFile(cfgPath, 'utf8'), cfg);
  await removeTree(tmp);
});

test('mcp_servers in config.yaml render .mcp.json, settings, specialist tools and firewall values', async () => {
  const tmp = await makeTree({});
  const dir = join(tmp, 'acme');
  await initDeployment({ dir, frameworkDir: ROOT, company: COMPANY, link: true, workspace: 'acme-dev' });
  assert.deepEqual(JSON.parse(await readFile(join(dir, '.mcp.json'), 'utf8')), { mcpServers: {} });
  assert.equal(JSON.parse(await readFile(join(dir, '.claude/settings.json'), 'utf8')).enabledMcpjsonServers, undefined);
  assert.match(await readFile(join(dir, '.claude/agents/specialist.md'), 'utf8'), /^tools: Read, Grep, Glob, Bash, Write$/m);
  const cfgPath = join(dir, 'config.yaml');
  await writeFile(cfgPath, (await readFile(cfgPath, 'utf8')).replace('mcp_servers: {}', [
    'mcp_servers:',
    '  tickets:',
    '    url: https://mcp.example.com/mcp',
    '    specialist_tools: [get_issue]',
    '  local:',
    '    url: http://host.docker.internal:8789/mcp',
  ].join('\n')), 'utf8');
  await updateDeployment(dir, ROOT);
  assert.deepEqual(Object.keys(JSON.parse(await readFile(join(dir, '.mcp.json'), 'utf8')).mcpServers), ['tickets', 'local']);
  const settings = JSON.parse(await readFile(join(dir, '.claude/settings.json'), 'utf8'));
  assert.deepEqual(settings.enabledMcpjsonServers, ['tickets', 'local']);
  assert.ok(settings.permissions.deny.length > 0, 'the deny list is kept');
  const specialist = await readFile(join(dir, '.claude/agents/specialist.md'), 'utf8');
  assert.match(specialist, /^tools: Read, Grep, Glob, Bash, Write, mcp__tickets__get_issue$/m);
  assert.doesNotMatch(specialist, /\{\{/);
  const env = (parse(await readFile(join(dir, 'compose.yaml'), 'utf8')) as { services: { reviewer: { environment: Record<string, string> } } }).services.reviewer.environment;
  assert.equal(env['CRA_HOST_PORTS'], '8790,8789');
  assert.equal(env['CRA_ALLOW_HOSTS'], 'mcp.example.com');
  await removeTree(tmp);
});

test('parseClaudeUpdate recognises the three outcomes', () => {
  assert.deepEqual(parseClaudeUpdate('Checking…\nSuccessfully updated from 2.1.296 to version 2.1.300.'), { updated: true, from: '2.1.296', to: '2.1.300' });
  assert.deepEqual(parseClaudeUpdate('Claude Code is already up to date (2.1.296)'), { updated: false });
  assert.deepEqual(parseClaudeUpdate('network error'), { updated: false, unknown: true });
});
