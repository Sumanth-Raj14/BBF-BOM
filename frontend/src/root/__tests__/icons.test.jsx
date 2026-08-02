/**
 * Regression test for audit finding A3 — icons referenced but never defined.
 *
 * GlobalSearchModal used Icon.Package / Icon.Shield / Icon.Alert, none of which
 * existed in icons.jsx. React renders an undefined component as
 * "Element type is invalid", so the whole modal crashed at render time. Nothing
 * catches that statically — the reference is a plain property lookup.
 *
 * Rather than pinning those three names, scan every source file for `Icon.<Name>`
 * and assert the icons module actually exports each one. This also catches the
 * next missing icon, which is the point.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { Icon } from "../icons.jsx";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "../..");
const SELF = resolve(HERE, "icons.test.jsx");
const CODE = /\.(jsx?|tsx?)$/;
const USAGE = /\bIcon\.([A-Za-z_$][\w$]*)/g;
const COMMENT = /\/\*[\s\S]*?\*\/|\/\/.*/g;

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : sourceFiles(p);
    return CODE.test(e.name) && p !== SELF ? [p] : [];
  });
}

describe("Icon module completeness", () => {
  const files = sourceFiles(SRC);

  it("scans a meaningful number of source files", () => {
    // Guards the test itself: a broken walk would make everything below vacuous.
    expect(files.length).toBeGreaterThan(50);
  });

  it("defines every icon referenced anywhere under src/", () => {
    const missing = new Map();
    for (const file of files) {
      // Comments name icons too (including ones deliberately removed) — strip
      // them so prose can never fail the build.
      const text = readFileSync(file, "utf8").replace(COMMENT, "");
      for (const [, name] of text.matchAll(USAGE)) {
        if (name in Icon) continue;
        if (!missing.has(name)) missing.set(name, new Set());
        missing.get(name).add(file.slice(SRC.length + 1).replace(/\\/g, "/"));
      }
    }

    const report = [...missing].map(([n, f]) => `Icon.${n} (${[...f].join(", ")})`);
    expect(report, "icons referenced but not exported by root/icons.jsx").toEqual([]);
  });

  it("finds the icons that motivated this test", () => {
    // Sanity check that the scan reaches the file A3 was found in.
    for (const name of ["Package", "Shield", "Alert"]) {
      expect(Icon).toHaveProperty(name);
      expect(typeof Icon[name]).toBe("function");
    }
  });
});
