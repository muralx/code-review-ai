import { extname } from 'node:path';
import type { Language } from './types.ts';

/** Language of each recognised file extension; JavaScript files count as ts. */
const EXT: Record<string, Language> = {
  '.go': 'go',
  '.py': 'python', '.pyi': 'python',
  '.ts': 'ts', '.tsx': 'ts', '.mts': 'ts', '.cts': 'ts',
  '.js': 'ts', '.jsx': 'ts', '.mjs': 'ts', '.cjs': 'ts',
  '.java': 'java',
};

/** Languages present in a file list, most files first; ties broken alphabetically. */
export function inferLanguages(files: readonly string[]): Language[] {
  const counts = new Map<Language, number>();
  for (const f of files) {
    const lang = EXT[extname(f).toLowerCase()];
    if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([lang]) => lang);
}
