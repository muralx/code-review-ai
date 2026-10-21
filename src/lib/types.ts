/** Review types in priority order (dropped lowest-priority first when capped). */
export const REVIEW_TYPES = [
  'security', 'testing', 'spec-compliance', 'coding-practices', 'code-structure',
  'performance', 'architecture', 'system-design', 'documentation',
] as const;
/** A specialist review type. */
export type ReviewType = (typeof REVIEW_TYPES)[number];
/** Whether a string names a known review type. */
export function isReviewType(s: string): s is ReviewType {
  return (REVIEW_TYPES as readonly string[]).includes(s);
}
/**
 * The types that run when no manifest declares any. `spec-compliance` needs a stated requirement
 * and `performance` needs a measurement budget, so both are opt-in: a manifest lists them.
 */
export const DEFAULT_TYPES: readonly ReviewType[] = [
  'security', 'testing', 'coding-practices', 'code-structure',
  'architecture', 'system-design', 'documentation',
];

/** Kinds of project. `contracts` is a shared wire-contract module; `spec` is a documents-only repository. */
export const KINDS = ['service', 'library', 'tool', 'website', 'contracts', 'spec'] as const;
/** Kind of project, which selects kind-specific guidelines. */
export type Kind = (typeof KINDS)[number];
/** Whether a string names a known project kind. */
export function isKind(s: string): s is Kind {
  return (KINDS as readonly string[]).includes(s);
}

/** Languages that have their own guidelines. */
export const LANGUAGES = ['go', 'python', 'ts', 'java'] as const;
/** A language with its own guidelines. */
export type Language = (typeof LANGUAGES)[number];
/** Whether a string names a supported language. */
export function isLanguage(s: string): s is Language {
  return (LANGUAGES as readonly string[]).includes(s);
}

/**
 * What a run can review: a pull request, a repository ref, or a local working
 * tree.
 */
export const TARGET_KINDS = ['pr', 'audit', 'local'] as const;
/**
 * What a run reviews: a pull request, a repository ref, or a local working
 * tree.
 */
export type TargetKind = (typeof TARGET_KINDS)[number];
/** Whether a string names a target kind. */
export function isTargetKind(s: string): s is TargetKind {
  return (TARGET_KINDS as readonly string[]).includes(s);
}

/**
 * Manifest values for whether a review may be posted with a verdict, only as a
 * comment, or not at all.
 */
export const POSTING_POLICIES = ['auto', 'comment-only', 'never'] as const;
/**
 * Whether a review may be posted with a verdict, only as a comment, or not at
 * all.
 */
export type PostingPolicy = (typeof POSTING_POLICIES)[number];

/** Directories an include line may name: `${framework}/…`, `${company}/…`, `${project}/…`, `${repo}/…`. */
export type RootName = 'framework' | 'company' | 'project' | 'repo';
/** Directories the root names resolve to for one run. */
export interface Roots { framework: string; company: string | null; project: string | null; repo: string | null }
/** The prompt template used when no manifest names one. */
export const DEFAULT_TEMPLATE = '${framework}/prompts/specialist.md';

/** request.json (the parts resolve-run reads). */
export interface Request {
  id: string;
  action: 'review' | 'rereview';
  target: {
    kind: TargetKind;
    repo?: string;
    number?: number;
    ref?: string;
    path?: string;
    paths?: string[];
  };
  types?: string[];
  post?: boolean;
  context?: string;
}

/** Model and reasoning effort for a specialist or the merger. */
export interface ModelSpec {
  /**
   * Model id or alias; unknown ids fall back to a default alias with a warning.
   */
  model?: string;
  /**
   * Reasoning effort level passed to the agent, such as `medium` or `xhigh`.
   */
  effort?: string;
}

/** config.yaml (the parts resolve-run reads). */
export interface Config {
  github?: { identity?: string; repos?: string[]; poll_interval_minutes?: number };
  models?: { specialist?: ModelSpec; merger?: ModelSpec };
  limits?: { max_specialists_per_run?: number; max_concurrent_runs?: number; max_tokens_per_run?: number };
}

/** Per-type settings in a manifest's `types` map. */
export interface TypeConfig extends ModelSpec {
  /**
   * In defaults.yaml, the type is added back even when a project's `types` list
   * omits it; ignored in a target manifest.
   */
  required?: boolean;
  /** `${framework|company|project}/path.md`: the prompt template for this type */
  prompt?: string;
}

/** manifest.yaml: project (company layer), defaults.yaml, or target .code-review/manifest.yaml. */
export interface Manifest {
  repo?: string;
  kind?: Kind;
  languages?: Language[];
  types?: Record<string, TypeConfig>;
  posting?: PostingPolicy;
  siblings?: string[];
  /** `${framework|company|project}/path.md`: the prompt template for every type not setting its own */
  prompt?: string;
}

/**
 * One review type selected for a run, with its resolved model, effort and
 * template.
 */
export interface PlanType extends ModelSpec {
  /** Review type. */
  name: ReviewType;
  /** Whether the type's config marked it required. */
  required: boolean;
  /** resolved template reference, `${root}/path.md` */
  prompt: string;
}

/** plan.json, written by resolve-run */
export interface Plan {
  project: { name: string | null; source: 'project' | 'defaults' | 'framework' };
  targetKind: TargetKind;
  kind: Kind;
  languages: Language[];
  languagesSource: 'manifest' | 'files';
  types: PlanType[];
  posting: {
    policy: PostingPolicy;
    post: boolean;
    form: 'verdict' | 'comment' | null;
    needsHuman: boolean;
    reason: string;
  };
  siblings: string[];
  roots: Roots;
  droppedTypes: ReviewType[];
  addedRequired: ReviewType[];
  ignoredTargetFields: string[];
  unknownTypes: string[];
}
