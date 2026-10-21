/**
 * Values for `{{NAME}}` placeholders in the coordinator template and project
 * commands.
 */
export type Vars = Record<string, string | number>;

const PLACEHOLDER = /\{\{([A-Z0-9_]+)\}\}/g;

/**
 * Distinct `{{NAME}}` placeholder names in a template, in order of first
 * appearance.
 */
export function placeholders(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[1]!))];
}

/**
 * Replace every `{{NAME}}` in a template with its value; throws listing any
 * placeholders without one.
 */
export function render(template: string, vars: Vars): string {
  const missing = placeholders(template).filter((k) => vars[k] === undefined);
  if (missing.length) throw new Error(`template is missing values for: ${missing.join(', ')}`);
  return template.replace(PLACEHOLDER, (_, k: string) => String(vars[k]));
}
