import { readdir, readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, sep } from 'node:path';
import { parseMarkdown } from './frontmatter.ts';
import { renderTaskBlock, type TaskInput } from './task-block.ts';
import { type Kind, type Language, type ReviewType, type RootName, type Roots, type TargetKind } from './types.ts';

/**
 * Prompt composition by template expansion.
 *
 * A template is markdown. A line that is exactly `${root}/relative/path.md` (optionally ending
 * in `?`) is an include: the file is read, its own include lines expanded, and the result put
 * in place of the line. `${root}` is one of framework, company, project or repo. `?` makes an
 * absent file acceptable; without it a missing file is an error. The last path segment may
 * contain `*`, which includes every matching file in name order (and never errors). A line
 * that is exactly `${task}` becomes the task block. `${type}`, `${kind}` and `${languages}`
 * are substituted everywhere; a line containing `${lang}` is repeated once per language.
 * After expansion a heading that has no content before the next heading of equal or higher
 * level is dropped.
 */

export { DEFAULT_TEMPLATE } from './types.ts';
const MAX_DEPTH = 8;

/**
 * What one prompt is composed from: the template, the run's root directories
 * and the values substituted into it.
 */
export interface ComposeInput {
  /** `${root}/path` of the template; the root must be framework, company or project */
  template: string;
  /**
   * Directories the `${framework}`, `${company}`, `${project}` and `${repo}`
   * includes resolve against; a null root is absent in this run.
   */
  roots: Roots;
  /** Review type substituted for `${type}`. */
  type: ReviewType | string;
  /** Project kind substituted for `${kind}`. */
  kind: Kind | string;
  /**
   * Languages joined into `${languages}`; a line containing `${lang}` is
   * repeated once for each.
   */
  languages: readonly (Language | string)[];
  /**
   * Kind of review target, matched against an included file's `applies_to`
   * frontmatter.
   */
  targetKind: TargetKind;
  /**
   * Rendered into the task block where a template line is exactly `${task}`.
   */
  task: TaskInput;
}

/**
 * One include encountered while composing, whether or not its content made it
 * into the prompt.
 */
export interface FileRecord {
  /** the include as written after variable substitution, e.g. `${company}/security.md` */
  ref: string;
  /** Root the include names. */
  root: RootName;
  /** Absolute path of the file; empty when the root is absent in this run. */
  path: string;
  /** `${root}/path` of the file whose include line produced this record */
  includedBy: string | null;
  /** True when the file's content went into the prompt. */
  used: boolean;
  /** True when the include ended in `?` or came from a glob. */
  optional: boolean;
  /**
   * Why the file was not used: missing, its root is absent in this run, or its
   * `applies_to` excludes the target kind.
   */
  reason?: 'absent' | 'no-root' | 'applies_to';
  /** Hex SHA-256 of the file's raw content; set whenever the file was read. */
  sha256?: string;
}

/**
 * Record of how a prompt was composed: the inputs, every include encountered
 * and the hash of the output.
 */
export interface Resolution {
  /** `${root}/path` of the template the prompt was composed from. */
  template: string;
  /** Review type substituted into the template. */
  type: string;
  /** Project kind substituted into the template. */
  kind: string;
  /** Languages substituted into the template. */
  languages: string[];
  /** Target kind that `applies_to` frontmatter was checked against. */
  targetKind: TargetKind;
  /** Root directories the includes resolved against. */
  roots: Roots;
  /**
   * Template first, then every include in the order it was encountered, used or
   * not.
   */
  files: FileRecord[];
  /** Hex SHA-256 of the composed prompt. */
  output: { sha256: string };
}

/** A composed prompt and the record of how it was built. */
export interface ComposeResult {
  /** Expanded and tidied prompt text, ending in a newline. */
  prompt: string;
  /** How the prompt was composed; written next to it as `.resolution.json`. */
  resolution: Resolution;
}

/**
 * A template or include that cannot be expanded: missing file, absent root,
 * path escaping its root, cycle or nesting too deep.
 */
export class ComposeError extends Error {}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const INCLUDE_RE = /^\$\{(framework|company|project|repo)\}\/(\S+?)(\?)?$/;
const HEADING_RE = /^(#{1,6})\s/;

/**
 * An include line split into its root, the path relative to that root, and
 * whether a trailing `?` made it optional.
 */
export interface ParsedRef { root: RootName; rel: string; optional: boolean }

/** Parse `${root}/path[?]`; null when the text is not an include. */
export function parseRef(text: string): ParsedRef | null {
  const m = INCLUDE_RE.exec(text.trim());
  if (!m) return null;
  return { root: m[1] as RootName, rel: m[2]!, optional: m[3] === '?' };
}

/** True when the include path contains `*`. */
function isGlob(rel: string): boolean {
  return rel.includes('*');
}

/**
 * Anchored pattern for a file name in which `*` matches any run of characters
 * and everything else is literal.
 */
function globToRegExp(name: string): RegExp {
  return new RegExp('^' + name.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
}

/**
 * File content as UTF-8, or null when the file or a parent directory does not
 * exist; other errors are rethrown.
 */
async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT' || (err as NodeJS.ErrnoException).code === 'ENOTDIR') return null;
    throw err;
  }
}

/** An include may only reach files under its own root, symlinks included. */
async function confine(rootDir: string, rel: string, ref: string): Promise<string> {
  const abs = resolve(rootDir, rel);
  const rootReal = await realpath(rootDir).catch(() => resolve(rootDir));
  const inside = (p: string) => p === rootReal || p.startsWith(rootReal + sep);
  if (!inside(resolve(rootReal, rel))) throw new ComposeError(`${ref}: path escapes its root`);
  const real = await realpath(abs).catch(() => null);
  if (real !== null && !inside(real)) throw new ComposeError(`${ref}: path escapes its root`);
  return abs;
}

/**
 * State shared across one composition: the input, the include records collected
 * so far, substitution values and the stack of files being expanded.
 */
interface Ctx {
  input: ComposeInput;
  files: FileRecord[];
  vars: Record<string, string>;
  stack: string[];
}

/** Replace `${type}`, `${kind}` and `${languages}` in a line. */
function substitute(text: string, vars: Record<string, string>): string {
  return text.replace(/\$\{(type|kind|languages)\}/g, (_, k: string) => vars[k]!);
}

/**
 * Expand one file's body, frontmatter dropped, line by line: the task block,
 * per-language repetition, substitution and nested includes. Throws
 * ComposeError on an include cycle or nesting deeper than MAX_DEPTH.
 */
async function expandFile(ctx: Ctx, ref: string, path: string, raw: string, depth: number): Promise<string[]> {
  if (depth > MAX_DEPTH) throw new ComposeError(`${ref}: includes nested deeper than ${MAX_DEPTH}`);
  if (ctx.stack.includes(ref)) throw new ComposeError(`${ref}: include cycle through ${ctx.stack.join(' -> ')}`);
  ctx.stack.push(ref);
  const { body } = parseMarkdown(raw, path);
  const out: string[] = [];
  for (const line of body.split('\n')) {
    if (line.trim() === '${task}') { out.push(...renderTaskBlock(ctx.input.task).split('\n')); continue; }
    const perLang = line.includes('${lang}') ? ctx.input.languages.map((l) => line.replaceAll('${lang}', String(l))) : [line];
    for (const variant of perLang) {
      const text = substitute(variant, ctx.vars);
      const inc = parseRef(text);
      if (!inc) { out.push(text); continue; }
      out.push(...(await include(ctx, inc, ref, depth + 1)));
    }
  }
  ctx.stack.pop();
  return out;
}

/**
 * Expand one include, recording it in the context. A glob includes each
 * matching file in name order and never fails on absence; a missing file or
 * root returns nothing when optional and throws ComposeError otherwise. A used
 * file comes back headed by its ref in italics.
 */
async function include(ctx: Ctx, inc: ParsedRef, includedBy: string, depth: number): Promise<string[]> {
  const ref = `\${${inc.root}}/${inc.rel}`;
  const rootDir = ctx.input.roots[inc.root];
  const record = (extra: Partial<FileRecord>): FileRecord => {
    const r: FileRecord = { ref, root: inc.root, path: rootDir ? resolve(rootDir, inc.rel) : '', includedBy, used: false, optional: inc.optional, ...extra };
    ctx.files.push(r);
    return r;
  };
  if (rootDir === null) {
    if (!inc.optional && !isGlob(inc.rel)) throw new ComposeError(`${ref} (in ${includedBy}): no ${inc.root} directory in this run; add ? to make it optional`);
    record({ reason: 'no-root' });
    return [];
  }
  if (isGlob(inc.rel)) {
    const dir = dirname(inc.rel);
    if (isGlob(dir)) throw new ComposeError(`${ref}: * is only allowed in the last path segment`);
    const pattern = globToRegExp(dir === '.' ? inc.rel : inc.rel.slice(dir.length + 1));
    const dirAbs = await confine(rootDir, dir, ref);
    let names: string[] = [];
    try { names = (await readdir(dirAbs, { withFileTypes: true })).filter((d) => d.isFile() || d.isSymbolicLink()).map((d) => d.name); } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT' && (err as NodeJS.ErrnoException).code !== 'ENOTDIR') throw err;
    }
    const out: string[] = [];
    for (const name of names.filter((n) => pattern.test(n)).sort()) {
      const rel = dir === '.' ? name : `${dir}/${name}`;
      out.push(...(await include(ctx, { root: inc.root, rel, optional: true }, includedBy, depth)));
    }
    return out;
  }
  const path = await confine(rootDir, inc.rel, ref);
  const raw = await readIfExists(path);
  if (raw === null) {
    if (!inc.optional) throw new ComposeError(`${ref} (in ${includedBy}): file not found; add ? to make it optional`);
    record({ reason: 'absent' });
    return [];
  }
  const rec = record({ sha256: sha(raw) });
  const { frontmatter } = parseMarkdown(raw, path);
  if (frontmatter.applies_to && !frontmatter.applies_to.includes(ctx.input.targetKind)) { rec.reason = 'applies_to'; return []; }
  rec.used = true;
  const lines = await expandFile(ctx, ref, path, raw, depth);
  return [`*${ref}*`, '', ...trimBlank(lines), ''];
}

/** Lines with leading and trailing blank lines removed. */
function trimBlank(lines: string[]): string[] {
  let a = 0; let b = lines.length;
  while (a < b && lines[a]!.trim() === '') a++;
  while (b > a && lines[b - 1]!.trim() === '') b--;
  return lines.slice(a, b);
}

/** Drop headings with nothing under them, then collapse runs of blank lines. */
export function tidy(lines: string[]): string {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const h = HEADING_RE.exec(lines[i]!);
    if (h) {
      const level = h[1]!.length;
      let j = i + 1; let hasContent = false;
      for (; j < lines.length; j++) {
        const n = HEADING_RE.exec(lines[j]!);
        if (n) { if (n[1]!.length <= level) break; continue; }
        if (lines[j]!.trim() !== '') { hasContent = true; break; }
      }
      if (!hasContent) { i = j - 1; continue; }
    }
    out.push(lines[i]!);
  }
  const collapsed: string[] = [];
  for (const l of out) {
    if (l.trim() === '' && (collapsed.length === 0 || collapsed[collapsed.length - 1] === '')) continue;
    collapsed.push(l.trim() === '' ? '' : l);
  }
  while (collapsed.length && collapsed[collapsed.length - 1] === '') collapsed.pop();
  return collapsed.join('\n') + '\n';
}

/**
 * Expand a template into a prompt and record every file it touched. The
 * template must live under the framework, company or project root; a missing
 * template or required include throws ComposeError.
 */
export async function compose(input: ComposeInput): Promise<ComposeResult> {
  const tpl = parseRef(input.template);
  if (!tpl || tpl.root === 'repo') throw new ComposeError(`template must be \${framework|company|project}/path, got ${input.template}`);
  const rootDir = input.roots[tpl.root];
  if (!rootDir) throw new ComposeError(`template ${input.template}: no ${tpl.root} directory in this run`);
  const path = await confine(rootDir, tpl.rel, input.template);
  const raw = await readIfExists(path);
  if (raw === null) throw new ComposeError(`template ${input.template}: file not found`);

  const ctx: Ctx = {
    input, files: [], stack: [],
    vars: { type: String(input.type), kind: String(input.kind), languages: input.languages.join(', ') },
  };
  ctx.files.push({ ref: input.template, root: tpl.root, path, includedBy: null, used: true, optional: false, sha256: sha(raw) });
  const lines = await expandFile(ctx, input.template, path, raw, 0);
  const prompt = tidy(lines);
  return {
    prompt,
    resolution: {
      template: input.template, type: String(input.type), kind: String(input.kind), languages: input.languages.map(String),
      targetKind: input.targetKind, roots: input.roots, files: ctx.files, output: { sha256: sha(prompt) },
    },
  };
}
