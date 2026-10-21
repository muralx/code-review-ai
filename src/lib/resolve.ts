import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { inferLanguages } from './languages.ts';
import { FRAMEWORK_DEFAULTS, findProject, loadManifest, mergeTarget } from './manifest.ts';
import {
  DEFAULT_TEMPLATE, REVIEW_TYPES, isReviewType,
  type Config, type Manifest, type Plan, type PlanType, type Request, type ReviewType, type TypeConfig,
} from './types.ts';

/** Everything resolveRun needs to plan a run. */
export interface ResolveInput {
  /** The review request being planned. */
  request: Request;
  /** Deployment config; supplies the specialist cap and default models. */
  config: Config;
  /** This machine's posting mode (CRA_POSTING); `comment` turns every posted review into a comment. */
  postingMode?: 'auto' | 'comment';
  /** Framework checkout; the `${framework}` root of the plan. */
  frameworkDir: string;
  /**
   * Company guidelines directory, or null to plan from framework defaults
   * alone.
   */
  companyDir: string | null;
  /** meta/target-guidelines from prep-target, or null */
  targetGuidelinesDir: string | null;
  /** paths from meta/files.json; consulted only when the manifest names no languages */
  files: readonly string[];
}

/** True when the path is accessible. */
async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

/**
 * Field-by-field merge; later arguments are more specific. Lists are replaced,
 * not concatenated; `types` entries merge by name, field by field.
 */
function layerManifests(...ms: Manifest[]): Manifest {
  const out: Manifest = { types: {} };
  for (const m of ms) {
    if (m.kind !== undefined) out.kind = m.kind;
    if (m.languages !== undefined) out.languages = [...m.languages];
    if (m.posting !== undefined) out.posting = m.posting;
    if (m.siblings !== undefined) out.siblings = [...m.siblings];
    if (m.repo !== undefined) out.repo = m.repo;
    if (m.prompt !== undefined) out.prompt = m.prompt;
    for (const [name, cfg] of Object.entries(m.types ?? {})) out.types![name] = { ...(out.types![name] ?? {}), ...cfg };
  }
  return out;
}

/**
 * Choose the specialists to run: the manifest's types in canonical order,
 * narrowed to those the request asks for plus required ones, then capped by
 * `max_specialists_per_run` keeping required types first. Also reports what was
 * added, dropped or unknown.
 */
function selectTypes(manifest: Manifest, request: Request, config: Config): Pick<Plan, 'types' | 'addedRequired' | 'droppedTypes' | 'unknownTypes'> {
  const configured = manifest.types ?? {};
  const inOrder = REVIEW_TYPES.filter((t) => configured[t] !== undefined);
  const unknownTypes: string[] = [];
  const addedRequired: ReviewType[] = [];
  let chosen: ReviewType[] = inOrder;
  if (request.types) {
    const wanted = new Set<string>();
    for (const t of request.types) {
      if (isReviewType(t)) wanted.add(t); else unknownTypes.push(t);
    }
    chosen = inOrder.filter((t) => {
      if (wanted.has(t)) return true;
      if (configured[t]?.required) { addedRequired.push(t); return true; }
      return false;
    });
  }
  const cap = config.limits?.max_specialists_per_run;
  const droppedTypes: ReviewType[] = [];
  if (cap !== undefined && chosen.length > cap) {
    const keep: ReviewType[] = [];
    for (const t of chosen) {
      if (configured[t]?.required) keep.push(t);
    }
    for (const t of chosen) {
      if (configured[t]?.required) continue;
      if (keep.length < cap) keep.push(t); else droppedTypes.push(t);
    }
    chosen = REVIEW_TYPES.filter((t) => keep.includes(t));
  }
  const defaults = config.models?.specialist ?? {};
  const types: PlanType[] = chosen.map((name) => {
    const cfg: TypeConfig = configured[name] ?? {};
    const t: PlanType = { name, required: cfg.required === true, prompt: cfg.prompt ?? manifest.prompt ?? DEFAULT_TEMPLATE };
    const model = cfg.model ?? defaults.model;
    const effort = cfg.effort ?? defaults.effort;
    if (model !== undefined) t.model = model;
    if (effort !== undefined) t.effort = effort;
    return t;
  });
  return { types, addedRequired, droppedTypes, unknownTypes };
}

/**
 * Whether and how to post the review. Only pull requests are posted; a request
 * to post under a `never` policy needs a human.
 */
function decidePosting(manifest: Manifest, request: Request, mode: 'auto' | 'comment' = 'auto'): Plan['posting'] {
  const policy = manifest.posting ?? 'auto';
  if (request.target.kind !== 'pr') return { policy, post: false, form: null, needsHuman: false, reason: 'not a pull request' };
  if (policy === 'never') {
    if (request.post === true) return { policy, post: false, form: null, needsHuman: true, reason: 'request asked to post but project policy is never' };
    return { policy, post: false, form: null, needsHuman: false, reason: 'project policy never' };
  }
  const post = request.post ?? true;
  if (mode === 'comment' && policy === 'auto') return { policy, post, form: 'comment', needsHuman: false, reason: 'project policy auto; this machine posts comments (CRA_POSTING=comment)' };
  return { policy, post, form: policy === 'comment-only' ? 'comment' : 'verdict', needsHuman: false, reason: `project policy ${policy}` };
}

/**
 * Build a run's plan by layering company defaults, the matching project
 * manifest and the target's own guidelines, falling back to framework defaults
 * when no types are declared. Languages come from the manifest, else from the
 * files.
 */
export async function resolveRun(input: ResolveInput): Promise<Plan> {
  const { request, config } = input;
  // The framework defaults are a fallback, not a base layer: a company that declares types
  // chooses its own set, and only an empty set falls back to all seven.
  let base: Manifest = {};
  let source: Plan['project']['source'] = 'framework';
  let projectName: string | null = null;
  let projectDir: string | null = null;
  const unknownFromManifests: string[] = [];
  const requiredByCompany: ReviewType[] = [];

  if (input.companyDir) {
    const defaults = await loadManifest(join(input.companyDir, 'defaults.yaml'));
    if (defaults) { base = layerManifests(defaults.manifest); source = 'defaults'; unknownFromManifests.push(...defaults.unknownTypes); }
    const project = await findProject(input.companyDir, { kind: request.target.kind, repo: request.target.repo, path: request.target.path });
    if (project) {
      const companyRequired = Object.entries(base.types ?? {}).filter(([, c]) => c.required).map(([n]) => n);
      base = layerManifests(base, project.manifest);
      // A project's own `types` list decides membership; company-required types always come back.
      if (project.manifest.types) {
        const declared = new Set(Object.keys(project.manifest.types));
        for (const name of Object.keys(base.types ?? {})) {
          if (declared.has(name)) continue;
          if (companyRequired.includes(name)) { if (isReviewType(name)) requiredByCompany.push(name); continue; }
          delete base.types![name];
        }
      }
      source = 'project';
      projectName = project.name;
      projectDir = project.dir;
      unknownFromManifests.push(...project.unknownTypes);
    }
  }
  if (!base.types || Object.keys(base.types).length === 0) base = layerManifests(FRAMEWORK_DEFAULTS, base);

  let ignoredTargetFields: string[] = [];
  let targetLayer: string | null = null;
  if (input.targetGuidelinesDir && (await exists(input.targetGuidelinesDir))) {
    targetLayer = input.targetGuidelinesDir;
    const tm = await loadManifest(join(input.targetGuidelinesDir, 'manifest.yaml'));
    if (tm) {
      const { merged, ignored } = mergeTarget(base, tm.manifest);
      base = merged;
      ignoredTargetFields = ignored;
      unknownFromManifests.push(...tm.unknownTypes);
    }
  }

  const languages = base.languages?.length ? [...base.languages] : inferLanguages(input.files);
  const sel = selectTypes(base, request, config);
  return {
    project: { name: projectName, source },
    targetKind: request.target.kind,
    kind: base.kind ?? 'service',
    languages,
    languagesSource: base.languages?.length ? 'manifest' : 'files',
    types: sel.types,
    posting: decidePosting(base, request, input.postingMode),
    siblings: [...(base.siblings ?? [])],
    roots: { framework: input.frameworkDir, company: input.companyDir, project: projectDir, repo: targetLayer },
    droppedTypes: sel.droppedTypes,
    addedRequired: [...requiredByCompany, ...sel.addedRequired.filter((t) => !requiredByCompany.includes(t))],
    ignoredTargetFields,
    unknownTypes: [...unknownFromManifests, ...sel.unknownTypes],
  };
}
