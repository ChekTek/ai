// Deep-merge a managed JSON settings file into a user-owned one.
//
// Usage:
//   node merge-json.mjs check <file>...           Validate each existing file is a JSON object.
//   node merge-json.mjs merge <source> <target>   Merge source keys into target.
//
// Objects merge recursively; arrays and scalars from source replace the target
// value. Keys only in target are preserved, so settings an app writes itself
// (model, theme, ...) survive. Keys removed from source are not removed from
// target. Target is written only when its content changes, and `merge` prints
// "created", "updated", or "unchanged".
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const [command, ...files] = process.argv.slice(2);

try {
  switch (command) {
    case "check":
      for (const file of files) if (existsSync(file)) readObject(file);
      break;
    case "merge": {
      const [source, target] = files;
      if (!source || !target) throw new Error("merge requires <source> <target>");
      const managed = readObject(source);
      const exists = existsSync(target);
      const before = exists ? readObject(target) : {};
      const after = merge(before, managed);
      const changed = !exists || JSON.stringify(before) !== JSON.stringify(after);
      if (changed) {
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, `${JSON.stringify(after, null, 2)}\n`);
      }
      console.log(exists ? (changed ? "updated" : "unchanged") : "created");
      break;
    }
    default:
      throw new Error(`unknown command: ${command ?? "(none)"}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

function readObject(file) {
  // Strip a UTF-8 BOM, which Windows editors may add.
  const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid JSON in ${file}: ${error.message}`);
  }
  if (!isObject(value)) throw new Error(`invalid JSON in ${file}: expected an object`);
  return value;
}

function merge(target, source) {
  const result = structuredClone(target);
  for (const [key, value] of Object.entries(source)) {
    result[key] = isObject(value) && isObject(result[key]) ? merge(result[key], value) : structuredClone(value);
  }
  return result;
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
