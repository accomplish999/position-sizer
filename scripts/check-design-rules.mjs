#!/usr/bin/env node
// Design rule guard. Fails on divider lines and boxed prose. See DESIGN-RULES.md.
//
// Lines are allowed only on real data tables, sheets, form controls, buttons,
// dialogs, and charts. Everything else separates with whitespace.
// A rule that genuinely needs a line can carry the comment
//   /* design-rules: allow <reason> */
// inside its block. Markup lines can carry "design-rules: allow" on the same line.

import fs from "node:fs";
import path from "node:path";

const CONFIG = /*CONFIG*/ {
  roots: ["web"],
  ignore: ["node_modules", ".git"],
  // Selector patterns (regex source) that may draw lines. The price ruler is a chart axis.
  allow: ["^\\.ruler$"],
}; /*END CONFIG*/

// Elements that may draw lines anywhere in the selector chain.
const ELEMENT_ALLOW =
  /(^|[\s,>+~(])(table|thead|tbody|tfoot|tr|th|td|caption|input|select|textarea|button|dialog|pre|canvas|svg|img)(?![\w-])/;

const CSS_EXT = new Set([".css", ".scss"]);
const MARKUP_EXT = new Set([".tsx", ".jsx", ".html", ".mdx", ".md"]);
const BORDER_PROP =
  /^border(-(top|bottom|left|right|block|inline|block-start|block-end|inline-start|inline-end))?(-width|-style)?$/;
const INVISIBLE = /^(0|0px|none|hidden|initial|unset|inherit|revert)\b|(^|\s)(transparent|0px\s+solid|none)(\s|$)/;
const ALLOW_MARK = "design-rules: allow";

const root = process.cwd();
const ignored = (rel) => CONFIG.ignore.some((p) => rel === p || rel.startsWith(p + "/") || rel.split("/").includes(p));

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(root, abs).split(path.sep).join("/");
    if (ignored(rel)) continue;
    if (entry.isDirectory()) walk(abs, out);
    else out.push(rel);
  }
  return out;
}

const userAllow = CONFIG.allow.map((s) => new RegExp(s));
function selectorAllowed(chain) {
  // Every comma separated selector in the innermost rule must be allowed.
  const parts = chain
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.every((part) => ELEMENT_ALLOW.test(" " + part) || userAllow.some((re) => re.test(part)));
}

function parseCss(src) {
  const rules = [];
  const stack = [];
  let buf = "";
  let line = 1;
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const body = src.slice(i, end === -1 ? src.length : end + 2);
      if (body.includes(ALLOW_MARK) && stack.length) stack[stack.length - 1].allowed = true;
      line += (body.match(/\n/g) || []).length;
      i += body.length;
      continue;
    }
    if (ch === "\n") line++;
    if (ch === "{") {
      stack.push({ sel: buf.trim(), decls: [], line, allowed: false });
      buf = "";
    } else if (ch === "}") {
      const top = stack.pop();
      if (top) {
        if (buf.trim()) top.decls.push({ text: buf.trim(), line });
        top.parents = stack.map((r) => r.sel);
        rules.push(top);
      }
      buf = "";
    } else if (ch === ";") {
      if (stack.length) stack[stack.length - 1].decls.push({ text: buf.trim(), line });
      buf = "";
    } else {
      buf += ch;
    }
    i++;
  }
  return rules;
}

const problems = [];

function checkCss(rel) {
  const src = fs.readFileSync(path.join(root, rel), "utf8");
  for (const rule of parseCss(src)) {
    if (!rule.sel || rule.sel.startsWith("@") || /^(from|to|\d+%)/.test(rule.sel)) continue;
    if (/^:root$|^\.dark$|^@theme/.test(rule.sel)) continue;
    const chain = [...rule.parents.filter((p) => !p.startsWith("@")), rule.sel].join(" ");
    if (/(^|[\s,])hr(?![\w-])/.test(rule.sel)) {
      problems.push(`${rel}:${rule.line}  ${rule.sel}  styles an <hr>. Divider rules are banned.`);
    }
    for (const d of rule.decls) {
      const m = d.text.match(/^([a-z-]+)\s*:\s*([\s\S]+)$/i);
      if (!m) continue;
      const prop = m[1].toLowerCase();
      const value = m[2]
        .replace(/!important/, "")
        .trim()
        .toLowerCase();
      let kind = null;
      if (BORDER_PROP.test(prop) && !INVISIBLE.test(value)) {
        kind = /^border(-width|-style)?$/.test(prop) ? "boxed container" : "divider line";
      } else if (prop === "box-shadow" && /inset/.test(value) && /\b0(px)?\s+-?[12]px\s+0(px)?\b/.test(value)) {
        kind = "hairline drawn with box-shadow";
      }
      if (!kind) continue;
      if (rule.allowed || selectorAllowed(chain)) continue;
      problems.push(`${rel}:${d.line}  ${rule.sel}  ${prop}: ${value}  (${kind})`);
    }
  }
}

const CLASS_ATTR = /class(?:Name)?=\{?\s*["'`]([^"'`]*)["'`]/g;
const TW_LINE = /^(?:[a-z0-9-]+:)*!?(border(?:-[trblxy])?(?:-(?:[1-9]\d*|px))?|divide-[xy](?:-(?:[1-9]\d*|px))?)$/;

function checkMarkup(rel) {
  const lines = fs.readFileSync(path.join(root, rel), "utf8").split("\n");
  lines.forEach((text, idx) => {
    if (text.includes(ALLOW_MARK)) return;
    if (/<hr[\s/>]/i.test(text)) problems.push(`${rel}:${idx + 1}  <hr>  (divider line)`);
    if (/<Separator[\s/>]/.test(text)) problems.push(`${rel}:${idx + 1}  <Separator>  (divider line)`);
    if (rel.endsWith(".md")) return;
    for (const m of text.matchAll(CLASS_ATTR)) {
      const bad = m[1].split(/\s+/).filter((c) => TW_LINE.test(c));
      if (bad.length) problems.push(`${rel}:${idx + 1}  class "${bad.join(" ")}"  (utility border, use spacing)`);
    }
  });
}

for (const r of CONFIG.roots) {
  const abs = path.join(root, r);
  if (!fs.existsSync(abs)) continue;
  const files = fs.statSync(abs).isDirectory() ? walk(abs, []) : [r];
  for (const rel of files) {
    const ext = path.extname(rel);
    if (CSS_EXT.has(ext)) checkCss(rel);
    else if (MARKUP_EXT.has(ext)) checkMarkup(rel);
  }
}

if (problems.length) {
  console.error(`design rules: ${problems.length} problem(s). Separate with whitespace, not lines or boxes.`);
  console.error(
    "Lines belong only on data tables, sheets, inputs, buttons, dialogs and charts. See DESIGN-RULES.md.\n",
  );
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log("design rules: ok (no divider lines, no boxed prose)");
