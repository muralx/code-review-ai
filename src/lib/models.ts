/** A model alias the Agent tool accepts. */
export type ModelAlias = 'opus' | 'sonnet' | 'haiku' | 'fable';

/**
 * Resolve a model id or alias to an Agent alias. Unset ids give the fallback
 * silently; unknown ids give the fallback with a warning.
 */
export function modelAlias(id: string | undefined, fallback: ModelAlias = 'opus'): { alias: ModelAlias; warning?: string } {
  if (!id) return { alias: fallback };
  const s = id.toLowerCase();
  if (s === 'opus' || s === 'sonnet' || s === 'haiku' || s === 'fable') return { alias: s };
  if (s.startsWith('claude-opus')) return { alias: 'opus' };
  if (s.startsWith('claude-sonnet')) return { alias: 'sonnet' };
  if (s.startsWith('claude-haiku')) return { alias: 'haiku' };
  if (s.startsWith('claude-fable') || s.startsWith('claude-mythos')) return { alias: 'fable' };
  return { alias: fallback, warning: `unknown model ${id}; using ${fallback}` };
}
