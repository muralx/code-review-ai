import { parse } from 'yaml';
import { isTargetKind, type TargetKind } from './types.ts';

/** Only `applies_to` is meaningful; other keys (including the old `mode`) are ignored. */
export interface Frontmatter {
  applies_to?: TargetKind[];
}

/** A markdown file split into its validated frontmatter and the rest. */
export interface ParsedMarkdown {
  /** The recognised frontmatter keys; empty when the file has none. */
  frontmatter: Frontmatter;
  /** The text after the frontmatter, or the whole text when there is none. */
  body: string;
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/**
 * Split leading YAML frontmatter from a markdown text. Throws, naming `path`,
 * when the frontmatter is not a mapping or `applies_to` is not a list of target
 * kinds.
 */
export function parseMarkdown(text: string, path = '<memory>'): ParsedMarkdown {
  const m = FM_RE.exec(text);
  if (!m) return { frontmatter: {}, body: text };
  const raw: unknown = parse(m[1] ?? '') ?? {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`${path}: frontmatter must be a YAML mapping`);
  }
  const fm = raw as Record<string, unknown>;
  const out: Frontmatter = {};
  if (fm['applies_to'] !== undefined) {
    const a = fm['applies_to'];
    if (!Array.isArray(a) || !a.every((k) => typeof k === 'string' && isTargetKind(k))) {
      throw new Error(`${path}: applies_to must be a list of pr | audit | local`);
    }
    out.applies_to = a as TargetKind[];
  }
  return { frontmatter: out, body: text.slice(m[0].length) };
}
