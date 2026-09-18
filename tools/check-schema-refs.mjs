import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve("protocol/schemas");

function filesBelow(path) {
  const result = [];
  for (const entry of readdirSync(path)) {
    const absolute = join(path, entry);
    if (statSync(absolute).isDirectory()) result.push(...filesBelow(absolute));
    else if (entry.endsWith(".json")) result.push(absolute);
  }
  return result;
}

function collectRefs(value, refs = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, refs);
    return refs;
  }
  if (!value || typeof value !== "object") return refs;
  for (const [key, item] of Object.entries(value)) {
    if (key === "$ref" && typeof item === "string") refs.push(item);
    else collectRefs(item, refs);
  }
  return refs;
}

let failed = false;
let schemaCount = 0;
let localRefCount = 0;

for (const file of filesBelow(root)) {
  schemaCount += 1;
  let schema;
  try {
    schema = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    failed = true;
    console.error(`Invalid JSON: ${file}: ${error.message}`);
    continue;
  }

  for (const ref of collectRefs(schema)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith("#")) continue;
    localRefCount += 1;
    const pathPart = ref.split("#", 1)[0];
    const target = resolve(dirname(file), pathPart);
    if (!existsSync(target)) {
      failed = true;
      console.error(`Unresolved $ref: ${file} -> ${ref}`);
    }
  }
}

if (failed) process.exit(1);
console.log(`Schema reference check passed: ${schemaCount} schemas, ${localRefCount} local references.`);
