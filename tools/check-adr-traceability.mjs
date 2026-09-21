import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([
  ".git", ".gradle", ".idea", "build", "dist", "node_modules", "out",
]);
const sourceExtensions = new Set([
  ".c", ".cc", ".cpp", ".h", ".hpp", ".java", ".kt", ".kts",
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".py", ".sh", ".yaml", ".yml",
]);

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else files.push(absolute);
  }
  return files;
}

const errors = [];
const allFiles = await walk(root);
const sourceFiles = allFiles.filter((file) => sourceExtensions.has(path.extname(file)));
const codeRefPattern =
  /ADR:\s*(docs\/adr\/(?:bridge|app|contracts)\/\d{4}-[a-z0-9][a-z0-9._-]*\.md)/gi;

for (const file of sourceFiles) {
  const content = await readFile(file, "utf8");
  for (const match of content.matchAll(codeRefPattern)) {
    const adrPath = match[1];
    if (!await exists(adrPath)) {
      errors.push(`${path.relative(root, file)} references missing ADR ${adrPath}`);
    }
  }
}

const adrFiles = allFiles.filter((file) => {
  const relative = path.relative(root, file).replaceAll(path.sep, "/");
  return /^docs\/adr\/(bridge|app|contracts)\/\d{4}-.*\.md$/.test(relative);
});

for (const file of adrFiles) {
  const content = await readFile(file, "utf8");
  const section = content.match(
    /## Implementation anchors\s*\n([\s\S]*?)(?=\n##\s|\s*$)/,
  );
  if (!section) continue;

  const anchorPattern = /^\s*-\s+`([^`]+)`/gm;
  for (const match of section[1].matchAll(anchorPattern)) {
    const implementationPath = match[1];
    if (!await exists(implementationPath)) {
      errors.push(
        `${path.relative(root, file)} lists missing implementation anchor ${implementationPath}`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error("ADR traceability check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("ADR traceability check passed.");
