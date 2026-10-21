/**
 * Settings that belong to one machine rather than to the deployment's shared files, read from the
 * environment (the container gets them from the deployment's `.env`):
 * - `CRA_POLL`: `on` (default) or `off`; off makes discovery start nothing, so the agent only
 *   reviews what it is asked for.
 * - `CRA_POSTING`: `auto` (default) or `comment`; comment posts every pull request review as a
 *   comment instead of an approval or a request for changes, whatever the project policy.
 */
export interface MachineSettings { polling: boolean; posting: 'auto' | 'comment' }

/** Reads the machine settings; throws on a value that is not one of the documented ones. */
export function machineSettings(env: NodeJS.ProcessEnv = process.env): MachineSettings {
  const poll = (env['CRA_POLL'] ?? 'on').trim().toLowerCase() || 'on';
  const posting = (env['CRA_POSTING'] ?? 'auto').trim().toLowerCase() || 'auto';
  if (poll !== 'on' && poll !== 'off') throw new Error(`CRA_POLL must be on or off, not ${poll}`);
  if (posting !== 'auto' && posting !== 'comment') throw new Error(`CRA_POSTING must be auto or comment, not ${posting}`);
  return { polling: poll === 'on', posting };
}
