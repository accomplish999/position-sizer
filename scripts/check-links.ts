import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const skip = new Set(["node_modules", "dist", ".git"]);
const linkRe = /\[[^\]]*\]\(([^)\s]+)\)/g;
const problems: string[] = [];

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) found.push(...walk(full));
    else if (name.endsWith(".md")) found.push(full);
  }
  return found;
}

function slug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

function headings(file: string): Set<string> {
  const text = readFileSync(file, "utf8");
  const set = new Set<string>();
  for (const line of text.split("\n")) {
    const match = /^(#{1,6})\s+(.+)$/.exec(line);
    if (match?.[2]) set.add(slug(match[2]));
  }
  return set;
}

for (const file of walk(root)) {
  const text = readFileSync(file, "utf8");
  const dir = path.dirname(file);
  for (const match of text.matchAll(linkRe)) {
    const raw = match[1];
    if (raw === undefined) continue;
    if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("mailto:")) continue;
    const [pathname, hash] = raw.split("#");
    const targetPath = pathname && pathname.length > 0 ? pathname : file;
    const resolved = path.resolve(dir, targetPath);
    if (!statExists(resolved)) {
      problems.push(`${path.relative(root, file)} -> ${raw}`);
      continue;
    }
    if (hash && resolved.endsWith(".md")) {
      const set = headings(resolved);
      if (!set.has(hash.toLowerCase())) {
        problems.push(`${path.relative(root, file)} -> ${raw} (missing heading)`);
      }
    }
  }
}

function statExists(file: string): boolean {
  try {
    statSync(file);
    return true;
  } catch {
    return false;
  }
}

if (problems.length > 0) {
  console.error("Broken relative links:");
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.log("links ok");
