/**
 * MCP servers of one deployment, declared under `mcp_servers` in its config.yaml. Everything the
 * container needs follows from that list: `.mcp.json`, the servers enabled in
 * `.claude/settings.json`, the tools specialists may call, and what the egress firewall opens.
 */

/** One entry of `mcp_servers`: an HTTP server (`url`) or a command run in the container. */
export interface McpServer {
  /** HTTP endpoint as seen from the container; a host service is `host.docker.internal:<port>`. */
  url?: string;
  /** HTTP headers; a value may reference `.env` as `${VAR}`, which Claude Code expands. */
  headers?: Record<string, string>;
  /** Command started in the container, for a stdio server (for example `npx`). */
  command?: string;
  /** Arguments of `command`. */
  args?: string[];
  /** Environment of `command`; values may reference `.env` as `${VAR}`. */
  env?: Record<string, string>;
  /** Tools of this server the specialists may call, by tool name; the coordinator gets them all. */
  specialist_tools?: string[];
  /** One line telling specialists what the server is for; rendered into their definition. */
  note?: string;
}

/** What the deployment files are rendered from. */
export interface McpPlan {
  /** Contents of `.mcp.json`. */
  mcpJson: string;
  /** Server names, enabled in `.claude/settings.json`. */
  names: string[];
  /** `mcp__<server>__<tool>` names added to the specialist's tools. */
  specialistTools: string[];
  /** Markdown for the specialist definition naming its MCP tools, or empty. */
  specialistNotes: string;
  /** Hostnames the firewall opens for HTTP servers outside the host. */
  hosts: string[];
  /** Host ports the firewall opens for servers at `host.docker.internal`. */
  hostPorts: number[];
}

const NAME = /^[A-Za-z0-9_-]+$/;
const HOST_GATEWAY = 'host.docker.internal';

/** Validates `mcp_servers` and derives the plan; throws naming the first bad entry. */
export function planMcp(servers: Record<string, McpServer> | null | undefined): McpPlan {
  const mcpServers: Record<string, Record<string, unknown>> = {};
  const specialistTools: string[] = [];
  const notes: string[] = [];
  const hosts = new Set<string>();
  const hostPorts = new Set<number>();
  for (const [name, s] of Object.entries(servers ?? {})) {
    const where = `mcp_servers.${name}`;
    if (!NAME.test(name)) throw new Error(`${where}: a server name is letters, digits, - and _`);
    if (!s || typeof s !== 'object') throw new Error(`${where}: expected a mapping`);
    if (Boolean(s.url) === Boolean(s.command)) throw new Error(`${where}: set exactly one of url and command`);
    if (s.url) {
      let u: URL;
      try { u = new URL(s.url); } catch { throw new Error(`${where}: url is not a URL: ${s.url}`); }
      if (!/^https?:$/.test(u.protocol)) throw new Error(`${where}: url must be http or https`);
      if (['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) {
        throw new Error(`${where}: ${u.hostname} is the container itself; a host service is ${HOST_GATEWAY}:<port>`);
      }
      if (u.hostname === HOST_GATEWAY) hostPorts.add(Number(u.port || (u.protocol === 'https:' ? 443 : 80)));
      else hosts.add(u.hostname);
      mcpServers[name] = { type: 'http', url: s.url, ...(s.headers ? { headers: s.headers } : {}) };
    } else {
      mcpServers[name] = { type: 'stdio', command: s.command, ...(s.args ? { args: s.args } : {}), ...(s.env ? { env: s.env } : {}) };
    }
    const tools = s.specialist_tools ?? [];
    if (!Array.isArray(tools) || !tools.every((t) => typeof t === 'string' && NAME.test(t))) {
      throw new Error(`${where}: specialist_tools is a list of tool names`);
    }
    const full = tools.map((t) => `mcp__${name}__${t}`);
    specialistTools.push(...full);
    if (full.length) notes.push(`- \`${name}\`${s.note ? `: ${s.note}` : ''} Tools: ${full.map((t) => `\`${t}\``).join(', ')}.`);
  }
  const specialistNotes = notes.length
    ? `\nThis deployment also gives you these MCP tools. They are for reading; use them when the prompt\nfile's task needs what they hold.\n\n${notes.join('\n')}\n`
    : '';
  return {
    mcpJson: JSON.stringify({ mcpServers }, null, 2) + '\n',
    names: Object.keys(mcpServers),
    specialistTools,
    specialistNotes,
    hosts: [...hosts].sort(),
    hostPorts: [...hostPorts].sort((a, b) => a - b),
  };
}
