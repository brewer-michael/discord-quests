/**
 * Logic-less templates for custom HTTP endpoints. Strings must go through
 * {{json name}} so they are always properly quoted; numbers may be inserted
 * raw. Paths like $.data[0].url pick values out of JSON responses.
 */

export type TemplateVars = Record<string, string | number | undefined>;

const TOKEN = /\{\{\s*(json\s+|url\s+)?([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

export function validateTemplate(
  template: string,
  vars: readonly string[],
  numeric: readonly string[],
  where: "body" | "url",
): string[] {
  const errors: string[] = [];
  for (const m of template.matchAll(TOKEN)) {
    const helper = (m[1] ?? "").trim();
    const name = m[2] as string;
    if (!vars.includes(name)) errors.push(`unknown variable "${name}"`);
    if (where === "body" && !helper && !numeric.includes(name))
      errors.push(`"${name}" must be written as {{json ${name}}} in a request body`);
  }
  return errors;
}

export function renderTemplate(template: string, vars: TemplateVars, where: "body" | "url"): string {
  return template.replace(TOKEN, (_all, helperRaw: string | undefined, name: string) => {
    const helper = (helperRaw ?? "").trim();
    const value = vars[name];
    if (value === undefined) throw new Error(`missing template variable "${name}"`);
    if (name === "baseUrl" && where === "url") return String(value).replace(/\/+$/, "");
    if (helper === "json") return JSON.stringify(value);
    if (helper === "url" || where === "url") return encodeURIComponent(String(value));
    if (typeof value !== "number") throw new Error(`"${name}" must use {{json ${name}}}`);
    return String(value);
  });
}

/** A tiny, safe subset of JSONPath: $.a.b[0].c */
export function getPath(obj: unknown, path: string): unknown {
  if (!/^\$(\.[A-Za-z_][A-Za-z0-9_-]*|\[\d+\])*$/.test(path)) throw new Error(`unsupported path "${path}"`);
  let cur: unknown = obj;
  for (const part of path.slice(1).match(/\.[A-Za-z_][A-Za-z0-9_-]*|\[\d+\]/g) ?? []) {
    if (cur === null || cur === undefined) return undefined;
    if (part.startsWith("[")) cur = (cur as unknown[])[Number(part.slice(1, -1))];
    else cur = (cur as Record<string, unknown>)[part.slice(1)];
  }
  return cur;
}
