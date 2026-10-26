import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Read-only checks for navigation regressions; no server, account or database changes.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const web = join(root, "apps", "web");
const app = join(web, "app");

function filesUnder(directory, extension) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path, extension) : path.endsWith(extension) ? [path] : [];
  });
}

const sources = [...filesUnder(app, ".tsx"), ...filesUnder(join(web, "components"), ".tsx")]
  .map((path) => ({ path, code: readFileSync(path, "utf8") }));
const routeFiles = new Map(filesUnder(app, "page.tsx").map((path) => {
  const directory = relative(app, dirname(path)).replaceAll("\\", "/");
  return [directory ? `/${directory}` : "/", path];
}));

function references(source) {
  // Cover literal JSX hrefs, navigation data objects and template hrefs whose
  // pathname is fixed. Dynamic values inside query strings are intentionally kept.
  return [...source.code.matchAll(/\bhref\s*(?:=|:)\s*(?:\{\s*)?(["'`])([^"'`]+)\1/g)]
    .map((match) => ({ value: match[2], file: relative(root, source.path) }));
}

const links = sources.flatMap(references);
const localLinks = links.filter(({ value }) => value.startsWith("/") && !value.startsWith("//"));
const normalizePath = (value) => value.split(/[?#]/)[0].replace(/\/$/, "") || "/";

test("every literal internal navigation destination resolves to an app route or public asset", () => {
  const broken = localLinks.filter(({ value }) => {
    const path = normalizePath(value);
    if (path.includes("${")) return false; // Runtime dynamic paths require browser coverage.
    return !routeFiles.has(path) && !existsSync(join(web, "public", path.slice(1)));
  });
  assert.deepEqual(broken, [], `Internal links without a destination: ${JSON.stringify(broken)}`);
});

test("detail links carry their required entity identifier", () => {
  const contracts = new Map([
    ["/pet/perfil", "petId"],
    ["/comunidade/publicacao", "postId"],
    ["/grupos/detalhe", "id"],
  ]);
  const broken = localLinks.filter(({ value }) => {
    const parameter = contracts.get(normalizePath(value));
    if (!parameter) return false;
    const query = value.split("?")[1]?.split("#")[0] ?? "";
    const valueMatch = query.match(new RegExp(`(?:^|&)${parameter}=([^&]+)`));
    return !valueMatch || !valueMatch[1].trim();
  });
  assert.deepEqual(broken, [], `Detail links missing an identifier: ${JSON.stringify(broken)}`);
});

test("local fragment navigation has a real target and no placeholder links", () => {
  const ids = new Set(sources.flatMap(({ code }) => [...code.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1])));
  const broken = links.filter(({ value }) => {
    if (value === "#" || value.toLowerCase().startsWith("javascript:")) return true;
    if (!value.startsWith("#") && !value.startsWith("/")) return false;
    const fragment = value.split("#")[1];
    return fragment && !fragment.includes("${") && !ids.has(fragment);
  });
  assert.deepEqual(broken, [], `Fragment links without a target: ${JSON.stringify(broken)}`);
});

test("local component and utility imports resolve after refactoring", () => {
  const broken = [];
  for (const { path, code } of sources) {
    for (const match of code.matchAll(/(?:from\s*|import\s*\()\s*["'](@\/[^"']+)["']/g)) {
      const imported = join(web, match[1].slice(2));
      const candidates = [imported, ...[".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"].map((extension) => imported + extension)];
      if (!candidates.some(existsSync)) broken.push({ file: relative(root, path), import: match[1] });
    }
  }
  assert.deepEqual(broken, [], `Imports with no file: ${JSON.stringify(broken)}`);
});

test("static accessibility relationships point to an existing labelled element", () => {
  const broken = [];
  for (const { path, code } of sources) {
    const ids = new Set([...code.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]));
    // A static scanner cannot resolve IDs returned by spread attribute builders.
    // These relationships are checked against the rendered DOM in browser-smoke.
    const generatedIds = /\bid:\s*`/.test(code) && /\{\.\.\./.test(code);
    for (const match of code.matchAll(/\b(?:htmlFor|aria-labelledby|aria-describedby|aria-controls)=["']([^"']+)["']/g)) {
      for (const id of match[1].split(/\s+/)) {
        if (!ids.has(id) && !generatedIds) broken.push({ file: relative(root, path), id });
      }
    }
  }
  assert.deepEqual(broken, [], `Accessibility references without an element: ${JSON.stringify(broken)}`);
});
