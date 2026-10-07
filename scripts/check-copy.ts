import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const skip = new Set(["node_modules", "dist", ".git"]);
const emdash = "\u2014";
const endash = "\u2013";
const hits: string[] = [];

function walk(dir: string): void {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full);
      continue;
    }
    if (name === "package-lock.json") continue;
    const text = readFileSync(full, "utf8");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      const entityDash = "&" + "mdash;";
      const entityEn = "&" + "ndash;";
      if (line.includes(emdash) || line.includes(endash) || line.includes(entityDash) || line.includes(entityEn)) {
        hits.push(`${path.relative(root, full)}:${i + 1}`);
      }
    }
  }
}

walk(root);
if (hits.length > 0) {
  console.error("Em dash or en dash found:");
  for (const hit of hits) console.error(hit);
  process.exit(1);
}
console.log("copy ok");
