import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const api = join(root, "apps", "api", "src");
function controllersUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() && entry.name !== "generated" ? controllersUnder(path) : entry.name.endsWith(".controller.ts") ? [path] : [];
  });
}

test("static API routes are not shadowed by an earlier dynamic route", () => {
  const shadowed = [];
  for (const path of controllersUnder(api)) {
    const code = readFileSync(path, "utf8");
    const routes = [];
    for (const match of code.matchAll(/@(Get|Post|Put|Patch|Delete)\(\s*(?:(["'])(.*?)\2)?\s*\)/g)) {
      const current = { method: match[1], path: match[3] ?? "" };
      if (!current.path.includes(":")) {
        for (const previous of routes.filter((route) => route.method === current.method && route.path.includes(":"))) {
          const segments = previous.path.split("/").map((part) => part.startsWith(":") ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
          if (new RegExp(`^${segments.join("/")}$`).test(current.path)) {
            shadowed.push({ controller: relative(root, path), method: current.method, static: current.path, dynamic: previous.path });
          }
        }
      }
      routes.push(current);
    }
  }
  assert.deepEqual(shadowed, [], `API destinations unreachable through their intended handler: ${JSON.stringify(shadowed)}`);
});
