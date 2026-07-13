import { describe, expect, it } from "vitest";
import en from "./locales/en";
import de from "./locales/de";
import fr from "./locales/fr";
import itLocale from "./locales/it";

/**
 * Collect dot-paths to string leaves for parity with English baseline.
 */
function collectStringLeafPaths(obj: unknown, prefix = ""): Set<string> {
  const out = new Set<string>();
  function walk(o: unknown, p: string) {
    if (o === null || o === undefined) return;
    if (typeof o === "string") {
      if (p) out.add(p);
      return;
    }
    if (typeof o === "number" || typeof o === "boolean") {
      if (p) out.add(p);
      return;
    }
    if (Array.isArray(o)) {
      o.forEach((item, i) => walk(item, `${p}[${i}]`));
      return;
    }
    if (typeof o === "object") {
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        const next = p ? `${p}.${k}` : k;
        walk(v, next);
      }
    }
  }
  walk(obj, prefix);
  return out;
}

describe("locale key parity (vs en)", () => {
  const baseline = collectStringLeafPaths(en);

  for (const [name, mod] of [
    ["de", de],
    ["fr", fr],
    ["it", itLocale],
  ] as const) {
    it(`${name} has no missing string keys vs en`, () => {
      const paths = collectStringLeafPaths(mod);
      const missing = [...baseline].filter((k) => !paths.has(k));
      expect(missing, `Missing in ${name}: ${missing.join(", ")}`).toEqual([]);
    });
  }

  for (const [name, mod] of [
    ["de", de],
    ["fr", fr],
    ["it", itLocale],
  ] as const) {
    it(`${name} has no extra string keys vs en (stricter symmetry)`, () => {
      const paths = collectStringLeafPaths(mod);
      const extra = [...paths].filter((k) => !baseline.has(k));
      expect(extra, `Extra in ${name} not in en: ${extra.join(", ")}`).toEqual([]);
    });
  }
});
