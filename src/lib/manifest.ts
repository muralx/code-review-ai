import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import {
  DEFAULT_TYPES, isKind, isLanguage, isReviewType, KINDS, LANGUAGES, POSTING_POLICIES,
  type Manifest, type PostingPolicy, type TypeConfig,
} from './types.ts';

/**
 * A validated manifest, plus the type names it listed that are not known review
 * types (dropped, not an error).
 */
export interface LoadedManifest { manifest: Manifest; unknownTypes: string[] }

/**
 * Manifest used when no layer chose any review types: a service, auto posting,
 * every default type.
 */
export const FRAMEWORK_DEFAULTS: Manifest = {
  kind: 'service',
  posting: 'auto',
  types: Object.fromEntries(DEFAULT_TYPES.map((t) => [t, {}])) as Record<string, TypeConfig>,
};

/**
 * Returns `v` as a string list; throws naming the file and field when it is
 * anything else.
 */
function expectStringArray(v: unknown, what: string, path: string): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw new Error(`${path}: ${what} must be a list of strings`);
  return v as string[];
}

const PROMPT_RE = /^\$\{(framework|company|project)\}\/[^\s?*]+$/;

/** `prompt:` must be `${framework|company|project}/path`; the repo root may never supply a template. */
function expectPromptRef(v: unknown, path: string, what: string): string {
  if (typeof v !== 'string' || !PROMPT_RE.test(v)) throw new Error(`${path}: ${what} must be \${framework|company|project}/path.md`);
  return v;
}

/**
 * Validates one `types.<name>` entry; an empty entry means the type with no
 * overrides. Throws on a wrong-typed field.
 */
function parseTypeConfig(v: unknown, path: string, name: string): TypeConfig {
  if (v === null || v === undefined) return {};
  if (typeof v !== 'object' || Array.isArray(v)) throw new Error(`${path}: types.${name} must be a mapping`);
  const o = v as Record<string, unknown>;
  const out: TypeConfig = {};
  if (o['required'] !== undefined) {
    if (typeof o['required'] !== 'boolean') throw new Error(`${path}: types.${name}.required must be a boolean`);
    out.required = o['required'];
  }
  for (const k of ['model', 'effort'] as const) {
    if (o[k] !== undefined) {
      if (typeof o[k] !== 'string') throw new Error(`${path}: types.${name}.${k} must be a string`);
      out[k] = o[k] as string;
    }
  }
  if (o['prompt'] !== undefined) out.prompt = expectPromptRef(o['prompt'], path, `types.${name}.prompt`);
  return out;
}

/**
 * Checks parsed YAML against the manifest schema and keeps only known fields;
 * an empty document is an empty manifest. Throws, naming `path`, on the first
 * invalid field. Unknown review types are collected, not rejected.
 */
export function validateManifest(raw: unknown, path: string): LoadedManifest {
  if (raw === null || raw === undefined) return { manifest: {}, unknownTypes: [] };
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${path}: manifest must be a YAML mapping`);
  const o = raw as Record<string, unknown>;
  const m: Manifest = {};
  const unknownTypes: string[] = [];
  if (o['repo'] !== undefined) {
    if (typeof o['repo'] !== 'string') throw new Error(`${path}: repo must be a string`);
    m.repo = o['repo'];
  }
  if (o['kind'] !== undefined) {
    if (typeof o['kind'] !== 'string' || !isKind(o['kind'])) throw new Error(`${path}: kind must be one of ${KINDS.join(', ')}`);
    m.kind = o['kind'];
  }
  if (o['languages'] !== undefined) {
    const langs = expectStringArray(o['languages'], 'languages', path);
    for (const l of langs) if (!isLanguage(l)) throw new Error(`${path}: languages must be among ${LANGUAGES.join(', ')}, got ${l}`);
    m.languages = langs as Manifest['languages'];
  }
  if (o['posting'] !== undefined) {
    if (typeof o['posting'] !== 'string' || !(POSTING_POLICIES as readonly string[]).includes(o['posting'])) {
      throw new Error(`${path}: posting must be one of ${POSTING_POLICIES.join(', ')}`);
    }
    m.posting = o['posting'] as PostingPolicy;
  }
  if (o['siblings'] !== undefined) m.siblings = expectStringArray(o['siblings'], 'siblings', path);
  if (o['prompt'] !== undefined) m.prompt = expectPromptRef(o['prompt'], path, 'prompt');
  if (o['types'] !== undefined) {
    if (typeof o['types'] !== 'object' || o['types'] === null || Array.isArray(o['types'])) throw new Error(`${path}: types must be a mapping`);
    m.types = {};
    for (const [name, cfg] of Object.entries(o['types'] as Record<string, unknown>)) {
      if (!isReviewType(name)) { unknownTypes.push(name); continue; }
      m.types[name] = parseTypeConfig(cfg, path, name);
    }
  }
  return { manifest: m, unknownTypes };
}

/**
 * Reads and validates the manifest YAML at `path`; null when the file does not
 * exist.
 */
export async function loadManifest(path: string): Promise<LoadedManifest | null> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  return validateManifest(parse(text), path);
}

/**
 * A company project whose manifest matched the target: its directory name, path
 * and manifest.
 */
export interface ProjectRef { name: string; dir: string; manifest: Manifest; unknownTypes: string[] }

/**
 * The part of a run target that selects a project: the repository, or for a
 * local target its path.
 */
export interface TargetRef { kind: 'pr' | 'audit' | 'local'; repo?: string; path?: string }

/**
 * True when `path` is `prefix` or lies under it, compared by whole path
 * segments.
 */
function isPathPrefix(prefix: string, path: string): boolean {
  const p = prefix.replace(/\/+$/, '');
  return path === p || path.startsWith(p + '/');
}

/**
 * Finds the project under `<companyDir>/projects` whose manifest `repo` matches
 * the target; null when none does. A local target matches by path prefix and
 * the longest prefix wins; other targets need an exact repo match. Projects
 * without a `repo` are never matched.
 */
export async function findProject(companyDir: string, target: TargetRef): Promise<ProjectRef | null> {
  let names: string[];
  try {
    names = (await readdir(join(companyDir, 'projects'), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  let best: ProjectRef | null = null;
  for (const name of names) {
    const dir = join(companyDir, 'projects', name);
    const loaded = await loadManifest(join(dir, 'manifest.yaml'));
    if (!loaded?.manifest.repo) continue;
    const ref: ProjectRef = { name, dir, manifest: loaded.manifest, unknownTypes: loaded.unknownTypes };
    if (target.kind === 'local') {
      if (target.path && isPathPrefix(loaded.manifest.repo, target.path)) {
        if (!best || loaded.manifest.repo.length > (best.manifest.repo?.length ?? 0)) best = ref;
      }
    } else if (loaded.manifest.repo === target.repo) {
      return ref;
    }
  }
  return best;
}

/**
 * Layers a target repository's own manifest over `base`: it may only add
 * languages and new types. Everything else it sets (repo, kind, posting,
 * siblings, prompts, existing types) is listed in `ignored`.
 */
export function mergeTarget(base: Manifest, target: Manifest): { merged: Manifest; ignored: string[] } {
  const ignored: string[] = [];
  const merged: Manifest = { ...base, types: { ...(base.types ?? {}) }, languages: [...(base.languages ?? [])] };
  for (const k of ['repo', 'kind', 'posting', 'siblings', 'prompt'] as const) if (target[k] !== undefined) ignored.push(k);
  for (const l of target.languages ?? []) if (!merged.languages!.includes(l)) merged.languages!.push(l);
  for (const [name, cfg] of Object.entries(target.types ?? {})) {
    if (merged.types![name] !== undefined) { ignored.push(`types.${name}`); continue; }
    const { prompt, ...rest } = cfg;
    if (prompt !== undefined) ignored.push(`types.${name}.prompt`);
    merged.types![name] = rest;
  }
  if (merged.languages!.length === 0) delete merged.languages;
  return { merged, ignored };
}
