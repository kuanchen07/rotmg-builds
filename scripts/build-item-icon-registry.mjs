/**
 * Scrape classes/*.html for a[href*="realmeye.com/wiki/"] inside a.icon-link
 * with nested img.icon-inline; emit classes/item-icon-registry.json.
 *
 * Run from repo root: node scripts/build-item-icon-registry.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const classesDir = path.join(root, "classes");
const outFile = path.join(classesDir, "item-icon-registry.json");

/** Manual slug aliases: API/wiki variant -> canonical slug in `items` (same sprite). */
const MANUAL_ALIASES = {
  "divine-vest-of-abandoned-shadows": "vest-of-abandoned-shadows",
};

/**
 * @param {string} href
 * @returns {string | null}
 */
function wikiSlugFromHref(href) {
  const m = String(href).match(/\/wiki\/([^#?]+)/i);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/**
 * @param {string} html
 * @param {Record<string, { src: string; alt: string }>} acc
 */
function collectFromHtml(html, acc) {
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = anchorRe.exec(html)) !== null) {
    const attrs = m[1];
    const inner = m[2];
    if (!/\bclass="[^"]*\bicon-link\b/.test(attrs)) continue;
    const hrefM = attrs.match(/\bhref="([^"]+)"/i);
    if (!hrefM) continue;
    const href = hrefM[1];
    if (!/\/wiki\//i.test(href) || !/realmeye\.com/i.test(href)) continue;
    const slug = wikiSlugFromHref(href);
    if (!slug) continue;
    const imgM = inner.match(
      /<img\b[^>]*\bclass="[^"]*\bicon-inline\b[^"]*"[^>]*>/i
    );
    if (!imgM) continue;
    const imgTag = imgM[0];
    const srcM = imgTag.match(/\bsrc="([^"]+)"/i);
    if (!srcM) continue;
    const src = srcM[1].trim();
    const altM = imgTag.match(/\balt="([^"]*)"/i);
    const alt = altM ? altM[1].trim() : slug;
    acc[slug] = { src, alt };
  }
}

const items = {};

for (const name of fs.readdirSync(classesDir)) {
  if (!name.endsWith(".html")) continue;
  const full = path.join(classesDir, name);
  collectFromHtml(fs.readFileSync(full, "utf8"), items);
}

const payload = {
  items,
  aliases: { ...MANUAL_ALIASES },
};

fs.writeFileSync(outFile, JSON.stringify(payload, null, 2) + "\n", "utf8");
console.log(`Wrote ${Object.keys(items).length} item(s) to ${path.relative(root, outFile)}`);
