import { parse } from 'yaml';
import { REVIEW_TYPES } from './types.ts';

/** How bad a finding is, from critical down to nit. */
export type Severity = 'critical' | 'major' | 'minor' | 'nit';
/**
 * What to do about a finding: block the merge, fix now, optional, or a
 * follow-up later.
 */
export type Recommendation = 'blocks' | 'fix-now' | 'optional' | 'follow-up';

/** One entry of a review's fenced yaml findings block. */
export interface Finding {
  /** Stable id such as `security-1`, cited from the prose. */
  id: string;
  /** How bad the problem is. */
  severity: Severity;
  /**
   * What should happen to it; with critical or major, `blocks` makes the
   * verdict request-changes.
   */
  recommendation: Recommendation;
  /**
   * How the problem relates to the change: caused-by-change, adjacent or
   * pre-existing.
   */
  relation?: string;
  /** Effort to fix: trivial, moderate or involved. */
  fix_cost?: string;
  /** Blast radius of the fix: contained or rippling. */
  fix_risk?: string;
  /** One-line summary of the problem. */
  title?: string;
  /** Where the problem is, usually path:line. */
  location?: string;
  /** What shows the problem is real: a quote, a command and its output. */
  evidence?: string;
  /**
   * False when the specialist could not run the check that would confirm the
   * finding.
   */
  verified?: boolean;
  /** Specialists that reported this finding, set by the merger. */
  sources?: string[];
  /** Specialists' original finding ids folded into this merged one. */
  merged_from?: string[];
}

/** A finding from the prior review that a re-review drops. */
export interface Withdrawn { id: string; reason?: string }

/**
 * A review.md split into frontmatter, findings block and the prose after it.
 */
export interface ParsedReview {
  /** The leading YAML frontmatter, empty when there is none. */
  frontmatter: Record<string, unknown>;
  /** Validated entries of the findings block. */
  findings: Finding[];
  /** Prior findings the block lists as withdrawn; empty in list form. */
  withdrawn: Withdrawn[];
  /** Everything after the findings block, leading whitespace removed. */
  prose: string;
  /** First non-blank line of the prose, or null when the prose is empty. */
  verdictLine: string | null;
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
const BLOCK_RE = /```ya?ml\r?\n([\s\S]*?)\r?\n```/;

const SEVERITIES = ['critical', 'major', 'minor', 'nit'];
const RECOMMENDATIONS = ['blocks', 'fix-now', 'optional', 'follow-up'];

/**
 * Check a parsed findings list and return it as findings. Throws when it is not
 * a list, or an entry is not a mapping, lacks a string id, or has an unknown
 * severity or recommendation.
 */
function asFindings(v: unknown): Finding[] {
  if (!Array.isArray(v)) throw new Error('findings block: findings must be a list');
  return v.map((f, i) => {
    if (typeof f !== 'object' || f === null) throw new Error(`findings block: entry ${i} is not a mapping`);
    const o = f as Record<string, unknown>;
    if (o['id'] === undefined || o['id'] === null) throw new Error(`findings block: entry ${i} has no id`);
    if (typeof o['id'] !== 'string') throw new Error(`findings block: entry ${i} has id ${String(o['id'])}, which must be a string such as m${String(o['id'])}`);
    if (!SEVERITIES.includes(String(o['severity']))) throw new Error(`findings block: ${o['id']} has invalid severity ${String(o['severity'])}`);
    if (!RECOMMENDATIONS.includes(String(o['recommendation']))) throw new Error(`findings block: ${o['id']} has invalid recommendation ${String(o['recommendation'])}`);
    return o as unknown as Finding;
  });
}

/**
 * Parse a review.md: optional frontmatter, then the first fenced yaml block,
 * either a findings list or a mapping with `findings` and `withdrawn`. Throws
 * when the block is missing or malformed.
 */
export function parseReview(text: string): ParsedReview {
  const fm = FM_RE.exec(text);
  const frontmatter = fm ? ((parse(fm[1] ?? '') as Record<string, unknown> | null) ?? {}) : {};
  const rest = fm ? text.slice(fm[0].length) : text;
  const block = BLOCK_RE.exec(rest);
  if (!block) throw new Error('review has no fenced yaml findings block');
  const raw: unknown = parse(block[1] ?? '') ?? [];
  let findings: Finding[];
  let withdrawn: Withdrawn[] = [];
  if (Array.isArray(raw)) {
    findings = asFindings(raw);
  } else if (typeof raw === 'object' && raw !== null) {
    const o = raw as Record<string, unknown>;
    findings = asFindings(o['findings'] ?? []);
    if (o['withdrawn'] !== undefined) {
      if (!Array.isArray(o['withdrawn'])) throw new Error('findings block: withdrawn must be a list');
      withdrawn = o['withdrawn'] as Withdrawn[];
    }
  } else {
    throw new Error('findings block: must be a list or a mapping');
  }
  const prose = rest.slice(block.index + block[0].length).replace(/^\s+/, '');
  const verdictLine = prose.split('\n').find((l) => l.trim().length > 0)?.trim() ?? null;
  return { frontmatter, findings, withdrawn, prose, verdictLine };
}

/** The verdict rule: critical/major with recommendation blocks → request-changes; else approve; comment when the project forces it. */
export function computeVerdict(findings: readonly Pick<Finding, 'severity' | 'recommendation'>[], form: 'verdict' | 'comment'): 'approve' | 'request-changes' | 'comment' {
  if (form === 'comment') return 'comment';
  const blocking = findings.some((f) => (f.severity === 'critical' || f.severity === 'major') && f.recommendation === 'blocks');
  return blocking ? 'request-changes' : 'approve';
}

const ID_RE = new RegExp(`\\b(?:${REVIEW_TYPES.join('|')})-\\d+\\b`, 'g');

/** Every id a review's block accounts for: its findings, their `merged_from` ids and its withdrawn ids. */
export function blockIds(r: ParsedReview): string[] {
  return [...r.findings.map((f) => f.id), ...r.findings.flatMap((f) => f.merged_from ?? []), ...r.withdrawn.map((w) => w.id)];
}

/**
 * Finding ids mentioned in prose that exist neither in the block, nor in the withdrawn list, nor
 * among the specialists' original ids a merged finding lists in `merged_from` (a reader can still
 * trace those to the block), nor in `earlier`: the ids of the previous rounds of a re-review.
 */
export function proseIdsNotInBlock(r: ParsedReview, earlier: Iterable<string> = []): string[] {
  const known = new Set<string>([...blockIds(r), ...earlier]);
  const seen = new Set<string>();
  for (const m of r.prose.matchAll(ID_RE)) if (!known.has(m[0])) seen.add(m[0]);
  return [...seen];
}

/**
 * Whether the verdict line calls the review blocking or non-blocking
 * (case-insensitive); null when it says neither or there is no line.
 */
export function verdictLineSays(line: string | null): 'blocking' | 'non-blocking' | null {
  if (!line) return null;
  if (/non-blocking/i.test(line)) return 'non-blocking';
  if (/blocking/i.test(line)) return 'blocking';
  return null;
}
