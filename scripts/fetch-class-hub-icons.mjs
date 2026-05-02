/**
 * Download class portrait sprites from RealmEye wiki pages into icons/class_<slug>.png
 *
 * Run from repo root: node scripts/fetch-class-hub-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const iconsDir = path.join(root, "icons");

/** Wiki slug + display name (must match first portrait img alt/title on wiki) */
const CLASSES = [
  { slug: "rogue", name: "Rogue" },
  { slug: "archer", name: "Archer" },
  { slug: "wizard", name: "Wizard" },
  { slug: "priest", name: "Priest" },
  { slug: "warrior", name: "Warrior" },
  { slug: "knight", name: "Knight" },
  { slug: "paladin", name: "Paladin" },
  { slug: "assassin", name: "Assassin" },
  { slug: "necromancer", name: "Necromancer" },
  { slug: "mystic", name: "Mystic" },
  { slug: "ninja", name: "Ninja" },
  { slug: "samurai", name: "Samurai" },
  { slug: "bard", name: "Bard" },
  { slug: "summoner", name: "Summoner" },
  { slug: "kensei", name: "Kensei" },
  { slug: "druid", name: "Druid" },
];

const UA = "Mozilla/5.0 (compatible; ROTMG-builds-icon-fetch/1.0)";

/**
 * @param {string} html
 * @param {string} name
 */
function portraitSrc(html, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<img\\s+[^>]*alt="${esc}"[^>]*src="([^"]+)"[^>]*>`,
    "i"
  );
  let m = html.match(re);
  if (m) return m[1];
  const re2 = new RegExp(
    `<img\\s+[^>]*src="([^"]+)"[^>]*alt="${esc}"[^>]*>`,
    "i"
  );
  m = html.match(re2);
  return m ? m[1] : null;
}

async function main() {
  if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

  for (const { slug, name } of CLASSES) {
    const url = `https://www.realmeye.com/wiki/${slug}`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`${slug}: HTTP ${res.status}`);
    const html = await res.text();
    let src = portraitSrc(html, name);
    if (!src) throw new Error(`${slug}: could not find portrait img for "${name}"`);

    if (src.startsWith("/")) src = `https://www.realmeye.com${src}`;
    const imgRes = await fetch(src, { headers: { "User-Agent": UA } });
    if (!imgRes.ok) throw new Error(`${slug}: image HTTP ${imgRes.status}`);
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const out = path.join(iconsDir, `class_${slug}.png`);
    fs.writeFileSync(out, buf);
    console.log(`OK ${slug} -> ${path.relative(root, out)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
