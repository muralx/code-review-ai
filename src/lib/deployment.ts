import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, copyFile, mkdir, readdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { parse } from 'yaml';
import { render, type Vars } from './render.ts';
import type { Config } from './types.ts';
import { planMcp, type McpPlan, type McpServer } from './mcp.ts';

const exec = promisify(execFile);

/**
 * Settings for `cra init`; unset optional values fall back to the defaults in
 * composeVars.
 */
export interface InitOptions {
  /** Deployment directory to create or fill. */
  dir: string;
  /** Checkout of this framework the generated files are rendered from. */
  frameworkDir: string;
  /**
   * Company guidelines repository, as a git URL or a local path; cloned or
   * linked as `company/`.
   */
  company: string;
  /** Symlink a local company path as `company/` instead of cloning it. */
  link?: boolean;
  /** agent-link workspace the coordinator joins. */
  workspace: string;
  /**
   * Short name used in the container name and the default identity; derived
   * from the company repository name when unset.
   */
  companyName?: string;
  /**
   * Name the coordinator registers under on agent-link; defaults to
   * `code-reviewer`.
   */
  name?: string;
  /** agent-link peer that receives status reports; defaults to `human`. */
  notify?: string;
  /**
   * GitHub account the bot token belongs to; defaults to
   * `<companyName>-review-bot`.
   */
  identity?: string;
  /** Minutes between polls of the configured repositories; defaults to 10. */
  pollMinutes?: number;
  /** Most runs in progress at once; defaults to 2. */
  maxConcurrent?: number;
  /**
   * Host directories local reviews may read, mounted read-only at the same
   * path.
   */
  localRoots?: string[];
  /** Host port of the agent-link hub; defaults to 8790. */
  hubPort?: number;
  /** Container image to run; defaults to `code-review-ai:latest`. */
  image?: string;
  /**
   * Host checkout of agent-link to mount at /opt/agent-link in place of the
   * image's copy.
   */
  agentLinkPath?: string;
}

/**
 * Contents of `.cra-generated.json`: what the last init or update rendered and
 * with which values.
 */
export interface Generated {
  /** Framework directory the files were rendered from. */
  framework: string;
  /** Framework HEAD at render time, or null when it is not a git checkout. */
  frameworkCommit: string | null;
  /**
   * Paths, relative to the deployment, of the files that update regenerates.
   */
  files: string[];
  /** Template values used; update starts from these. */
  vars: Record<string, string | number>;
}

const GENERATED_MARKER = '.cra-generated.json';

/** True when the path is accessible. */
async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

/**
 * True for an http(s), ssh, git or scp-style URL, or an `owner/repo` shorthand.
 */
function isGitUrl(s: string): boolean {
  return /^(https?:\/\/|git@|ssh:\/\/|git:\/\/)/.test(s) || /^[\w.-]+\/[\w.-]+$/.test(s);
}

/** HEAD commit of the framework checkout, or null when git cannot tell. */
async function frameworkCommit(frameworkDir: string): Promise<string | null> {
  try { return (await exec('git', ['-C', frameworkDir, 'rev-parse', 'HEAD'])).stdout.trim(); } catch { return null; }
}

/**
 * A local root as written into compose.yaml: a path is made absolute; an entry that references an
 * environment variable (`${REPOS_ROOT}`) is kept, and compose fills it in from `.env`.
 */
function rootPath(r: string): string {
  return r.includes('${') ? r : resolve(r);
}

/**
 * Template values for a new deployment, with defaults for every option left
 * unset. `companyRepo` is the clone URL or the linked absolute path; an
 * absolute path is also mounted into the container.
 */
function composeVars(o: Required<Pick<InitOptions, 'workspace'>> & InitOptions, companyRepo: string): Vars {
  const companyName = o.companyName ?? basename(o.company.replace(/\.git$/, '')).replace(/[^A-Za-z0-9_-]+/g, '-').toLowerCase();
  const roots = (o.localRoots ?? []).map(rootPath);
  return {
    WORKSPACE: o.workspace,
    AGENT_NAME: o.name ?? 'code-reviewer',
    NOTIFY_PEER: o.notify ?? 'human',
    DEPLOYMENT_DIR: '/deployment',
    FRAMEWORK_DIR: '/opt/code-review-ai',
    POLL_MINUTES: o.pollMinutes ?? 10,
    MAX_CONCURRENT: o.maxConcurrent ?? 2,
    COMPANY_NAME: companyName,
    COMPANY_REPO: companyRepo,
    IDENTITY: o.identity ?? `${companyName}-review-bot`,
    IMAGE: o.image ?? 'code-review-ai:latest',
    HUB_PORT: o.hubPort ?? 8790,
    LOCAL_ROOTS_YAML: roots.length ? roots.map((r) => `  - ${r}`).join('\n') : '  []',
    LOCAL_ROOT_VOLUMES: roots.map((r) => `      - ${r}:${r}:ro\n`).join(''),
    AGENT_LINK_VOLUME: o.agentLinkPath ? `      - ${resolve(o.agentLinkPath)}:/opt/agent-link:ro\n` : '',
    // A company directory that is a symlink to a host path must be visible inside the container too.
    COMPANY_VOLUME: isAbsolute(companyRepo) ? `      - ${companyRepo}:${companyRepo}:ro\n` : '',
  };
}

/** The deployment's MCP servers, from `mcp_servers` in its config.yaml. */
async function readMcp(dir: string): Promise<McpPlan> {
  const cfg = (parse(await readFile(join(dir, 'config.yaml'), 'utf8')) ?? {}) as { mcp_servers?: Record<string, McpServer> };
  return planMcp(cfg.mcp_servers);
}

/**
 * Files (re)generated from the framework. Everything else in the deployment belongs to the operator.
 * Sets HOST_PORTS and ALLOW_HOSTS in vars: the hub port and the hosts and host ports of the MCP servers.
 */
async function writeGenerated(dir: string, frameworkDir: string, vars: Vars, mcp: McpPlan): Promise<string[]> {
  vars['HOST_PORTS'] = [...new Set([Number(vars['HUB_PORT']), ...mcp.hostPorts])].join(',');
  vars['ALLOW_HOSTS'] = mcp.hosts.join(',');
  const files: string[] = [];
  const put = async (rel: string, content: string) => {
    const abs = join(dir, rel);
    await mkdir(join(abs, '..'), { recursive: true });
    await writeFile(abs, content, 'utf8');
    files.push(rel);
  };
  const tpl = (rel: string) => readFile(join(frameworkDir, rel), 'utf8');

  await put('CLAUDE.md', render(await tpl('agents/coordinator.md'), vars));
  for (const f of await readdir(join(frameworkDir, 'agents/commands'))) {
    await put(join('.claude/commands', f), render(await tpl(join('agents/commands', f)), vars));
  }
  await put('.claude/agents/specialist.md', render(await tpl('agents/specialist.md'), {
    SPECIALIST_MCP_TOOLS: mcp.specialistTools.map((t) => `, ${t}`).join(''),
    SPECIALIST_MCP_NOTES: mcp.specialistNotes,
  }));
  await put('.claude/agents/merger.md', await tpl('agents/merger.md'));
  const settings = JSON.parse(await tpl('docker/settings.json')) as Record<string, unknown>;
  if (mcp.names.length) settings['enabledMcpjsonServers'] = mcp.names;
  await put('.claude/settings.json', JSON.stringify(settings, null, 2) + '\n');
  await put('.mcp.json', mcp.mcpJson);
  await put('compose.yaml', render(await tpl('docker/compose.template.yaml'), vars));
  await put('.agent-link.json', JSON.stringify({ workspace: String(vars['WORKSPACE']) }, null, 2) + '\n');
  await put('DEPLOYMENT.md', deploymentReadme(vars));
  return files;
}

/**
 * Text of the generated DEPLOYMENT.md: which files belong to whom, first start
 * and day-to-day commands.
 */
function deploymentReadme(vars: Vars): string {
  return `# code-review-ai deployment: ${vars['COMPANY_NAME']}

Generated by \`cra init\`. Files you own: \`config.yaml\`, \`.env\`, \`company/\`, \`firewall-allow.txt\`,
\`runs/\`, \`clones/\`. Files \`cra update\` regenerates: \`CLAUDE.md\`, \`.claude/\`, \`.mcp.json\`,
\`compose.yaml\`, \`.agent-link.json\`, this file.

## First start

1. Put the bot's fine-grained PAT in \`.env\` (\`GH_TOKEN=\`). Scopes on the polled repos:
   contents:read, pull-requests:write, metadata:read.
2. List the repos to poll under \`github.repos\` in \`config.yaml\`.
3. Make the agent-link hub reachable from the Docker bridge (\`AGENT_LINK_HOST=0.0.0.0\` or the
   bridge address, port ${vars['HUB_PORT']}), and any MCP server under \`mcp_servers\` in
   \`config.yaml\` that runs on the host (\`host.docker.internal:<port>\`).
4. \`docker compose up -d\`
5. Log Claude Code in once inside the container: \`docker compose exec -u reviewer reviewer claude\`, run
   \`/login\`, finish in the browser, then \`/exit\`. The login lives in the \`claude-home\` volume.
6. Watch the coordinator: \`docker compose exec -u reviewer reviewer tmux attach -t coordinator\`
   (detach with Ctrl-b d). It registers on agent-link as \`${vars['AGENT_NAME']}\` in workspace
   \`${vars['WORKSPACE']}\` and polls every ${vars['POLL_MINUTES']} minutes.

## Operate

- Status: \`docker compose exec -u reviewer reviewer cra status\`
- Logs: \`docker compose logs -f reviewer\`
- Framework update: \`cra update --dir .\` on the host, then the window restarts itself.
- Egress: add hostnames to \`firewall-allow.txt\`, one per line, and restart the container. MCP
  servers need no entry: \`cra update\` opens their hosts and host ports.
- MCP servers: list them under \`mcp_servers\` in \`config.yaml\`, run \`cra update\`, restart.
`;
}

/**
 * Create a deployment: clone or link the company repository, write the operator
 * files that do not exist yet, render the generated files and record them in
 * the marker. Throws when the directory is already a deployment.
 */
export async function initDeployment(o: InitOptions): Promise<Generated> {
  const dir = resolve(o.dir);
  if (await exists(join(dir, GENERATED_MARKER))) throw new Error(`${dir} is already a deployment; use cra update`);
  await mkdir(join(dir, 'runs'), { recursive: true });
  await mkdir(join(dir, 'clones'), { recursive: true });

  const companyDir = join(dir, 'company');
  let companyRepo = o.company;
  if (!(await exists(companyDir))) {
    if (o.link || (!isGitUrl(o.company) && isAbsolute(resolve(o.company)) && (await exists(o.company)))) {
      await symlink(resolve(o.company), companyDir);
      companyRepo = resolve(o.company);
    } else {
      await exec('git', ['clone', '--quiet', o.company, companyDir]);
    }
  }

  const vars = composeVars(o, companyRepo);
  if (!(await exists(join(dir, 'config.yaml')))) {
    await writeFile(join(dir, 'config.yaml'), render(await readFile(join(o.frameworkDir, 'docker/config.template.yaml'), 'utf8'), vars), 'utf8');
  }
  const mcp = await readMcp(dir);
  if (!(await exists(join(dir, '.env')))) await copyFile(join(o.frameworkDir, 'docker/env.template'), join(dir, '.env'));
  if (!(await exists(join(dir, 'firewall-allow.txt')))) await writeFile(join(dir, 'firewall-allow.txt'), '# one hostname per line; the container may also reach these\n', 'utf8');
  if (!(await exists(join(dir, '.gitignore')))) await writeFile(join(dir, '.gitignore'), '.env\nruns/\nclones/\n', 'utf8');

  const files = await writeGenerated(dir, o.frameworkDir, vars, mcp);
  const generated: Generated = { framework: o.frameworkDir, frameworkCommit: await frameworkCommit(o.frameworkDir), files, vars };
  await writeFile(join(dir, GENERATED_MARKER), JSON.stringify(generated, null, 2) + '\n', 'utf8');
  return generated;
}

/** KEY=VALUE lines of the deployment's `.env`; quotes around a value are dropped. */
async function readEnvFile(dir: string): Promise<Record<string, string>> {
  let text = '';
  try { text = await readFile(join(dir, '.env'), 'utf8'); } catch { return {}; }
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

/** Replaces `${NAME}` with its value from `.env`, else from the environment; throws when neither has it. */
function expandVars(value: string, env: Record<string, string>): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, k: string) => {
    const v = env[k] ?? process.env[k];
    if (v === undefined || v === '') throw new Error(`config.yaml names \${${k}}, which neither .env nor the environment sets`);
    return v;
  });
}

/** Re-render the generated files from the current framework; operator files are never touched. */
export async function updateDeployment(dir: string, frameworkDir: string): Promise<Generated> {
  dir = resolve(dir);
  const prev = JSON.parse(await readFile(join(dir, GENERATED_MARKER), 'utf8')) as Generated;
  // Values the operator may have changed since init live in config.yaml and .agent-link.json.
  const cfg = (parse(await readFile(join(dir, 'config.yaml'), 'utf8')) ?? {}) as Config & { agent_link?: { workspace?: string; name?: string; notify?: string }; local_roots?: string[]; mcp_servers?: Record<string, McpServer> };
  const vars: Vars = { ...prev.vars };
  // agent_link values may name variables from .env (notify: ${CRA_NOTIFY}), so one shared config serves every machine.
  const env = await readEnvFile(dir);
  if (cfg.agent_link?.name) vars['AGENT_NAME'] = expandVars(cfg.agent_link.name, env);
  if (cfg.agent_link?.notify) vars['NOTIFY_PEER'] = expandVars(cfg.agent_link.notify, env);
  if (cfg.agent_link?.workspace) vars['WORKSPACE'] = expandVars(cfg.agent_link.workspace, env);
  if (cfg.github?.poll_interval_minutes) vars['POLL_MINUTES'] = cfg.github.poll_interval_minutes;
  if (cfg.limits?.max_concurrent_runs) vars['MAX_CONCURRENT'] = cfg.limits.max_concurrent_runs;
  if (Array.isArray(cfg.local_roots)) {
    const roots = cfg.local_roots.map(rootPath);
    vars['LOCAL_ROOTS_YAML'] = roots.length ? roots.map((r) => `  - ${r}`).join('\n') : '  []';
    vars['LOCAL_ROOT_VOLUMES'] = roots.map((r) => `      - ${r}:${r}:ro\n`).join('');
  }
  for (const k of ['TRACKER_URL', 'DOC_INDEX_URL']) delete vars[k]; // removed options of older deployments
  const files = await writeGenerated(dir, frameworkDir, vars, planMcp(cfg.mcp_servers));
  const generated: Generated = { framework: frameworkDir, frameworkCommit: await frameworkCommit(frameworkDir), files, vars };
  await writeFile(join(dir, GENERATED_MARKER), JSON.stringify(generated, null, 2) + '\n', 'utf8');
  return generated;
}

/**
 * Read the output of `claude update`: the versions when it updated, `updated:
 * false` when already current, and `unknown: true` when the output matches
 * neither.
 */
export function parseClaudeUpdate(output: string): { updated: boolean; from?: string; to?: string; unknown?: boolean } {
  const m = /Successfully updated from (\S+) to (?:version )?(\S+)/i.exec(output);
  if (m) return { updated: true, from: m[1]!, to: m[2]!.replace(/\.$/, '') };
  if (/(already|is) (up[- ]to[- ]date|on the latest|the latest version)/i.test(output)) return { updated: false };
  return { updated: false, unknown: true };
}
