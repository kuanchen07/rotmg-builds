/**
 * Set checker — compares BiS enchant lines in the page to live RealmEye player JSON only.
 * Set window.REALMEYE_LIVE_API_BASE (Vercel origin, no trailing slash). There is no local snapshot fallback.
 * Username: user enters in the panel; the last successful load is remembered for this page only (tab
 * session, no localStorage). Optional prefill when no session user: REALMEYE_SET_CHECKER_PLAYER (page default).
 * Class filter: `window.REALMEYE_SET_CHECKER_CLASS` — lowercase RealmEye class slug(s), e.g. `rogue`, `necromancer` (see page inline script).
 *
 * Triggers: buttons with class `set-checker-trigger` and `data-bis-root` pointing to the build article id.
 * Each BiS enchant `<li>` may set `data-bis-equipment-slot` (weapon|ability|armor|ring) and `data-bis-omit-if-no-match`.
 * Weapon rows show pause (⏸) beside each wiki slug opening `data/weapon-stats.json` in the sidebar; Back returns here.
 */
(function () {
  "use strict";

  const BACKPACK_SLUG = "backpack-extender";

  /** Captured synchronously — used to resolve `item-icon-registry.json` next to this script on GitHub Pages. */
  const SET_CHECKER_SCRIPT_SRC =
    typeof document !== "undefined" && /** @type {HTMLScriptElement | null} */ (document.currentScript)
      ? String(/** @type {HTMLScriptElement} */ (document.currentScript).src || "")
      : "";

  /** RealmEye character table order after filtering backpack (weapon, ability/cloak, armor, ring). */
  const EQUIPMENT_SLOT_TO_INDEX = {
    weapon: 0,
    ability: 1,
    armor: 2,
    ring: 3,
  };

  function getLiveApiBase() {
    let v = typeof window.REALMEYE_LIVE_API_BASE === "string" ? window.REALMEYE_LIVE_API_BASE.trim() : "";
    v = v.replace(/\/$/, "");
    if (!v) {
      return "";
    }
    if (!/^https?:\/\//i.test(v)) {
      const noLeadingSlash = v.replace(/^\/+/, "");
      if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/i.test(noLeadingSlash) || /\.vercel\.app$/i.test(noLeadingSlash)) {
        v = `https://${noLeadingSlash}`;
      }
    }
    return v;
  }

  /**
   * @returns {Promise<{ data: object, source: 'live' }>}
   */
  async function loadPlayerData(/** @type {string} */ username) {
    const base = getLiveApiBase();
    const player = String(username || "").trim();
    if (!player) {
      throw new Error("Enter a RealmEye username.");
    }

    if (!base) {
      throw new Error(
        "Live API base is not set. Define window.REALMEYE_LIVE_API_BASE in this class page (see classes/rogue.html)."
      );
    }

    const url = `${base}/api/main?username=${encodeURIComponent(player)}`;
    try {
      const res = await fetch(url, { cache: "no-store", mode: "cors" });
      if (res.ok) {
        const data = await res.json();
        return { data, source: "live" };
      }
      let detail = "";
      try {
        const errBody = await res.json();
        if (errBody && errBody.detail) {
          detail = String(errBody.detail);
        }
      } catch (_) {
        /* ignore */
      }
      throw new Error(`Live API returned HTTP ${res.status}${detail ? ": " + detail : ""}.`);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Live API returned HTTP")) {
        throw err;
      }
      throw new Error(`Live API failed: ${String(/** @type {Error} */ (err).message || err)}`);
    }
  }

  function sourceBannerHtml(/** @type {string} */ player) {
    const name = String(player || "").trim() || "—";
    return `<p class="set-checker-source set-checker-source--live">Live data from RealmEye (<code>${escapeHtml(
      name
    )}</code>).</p>`;
  }

  function norm(s) {
    return String(s || "")
      .replace(/\u2019|\u2018/g, "'")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  /** @returns {string} normalized slug, default rogue */
  function getSetCheckerClassSlug() {
    const raw =
      typeof window.REALMEYE_SET_CHECKER_CLASS === "string" ? window.REALMEYE_SET_CHECKER_CLASS.trim() : "";
    return norm(raw) || "rogue";
  }

  /** Display label for UI (RealmEye sends "Title Case" anyway; picker uses slug from globals). */
  function classSlugToDisplay(slug) {
    const s = norm(slug) || "rogue";
    return s.replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** @param {object} data API player JSON */
  function charactersForClassFromPayload(data, /** @type {string} */ classSlug) {
    const target = norm(classSlug) || "rogue";
    return (data.characters || []).filter((ch) => norm(ch.class) === target);
  }

  /** @type {Promise<Record<string, { src: string; alt: string }>> | null} */
  let iconRegistryLoadPromise = null;

  /** Cached `data/weapon-stats.json`. */
  /** @type {object | null} */
  let weaponStatsBundle = null;
  /** @type {Promise<object> | null} */
  let weaponStatsLoadPromise = null;

  /**
   * Loads hardcoded Bis weapon stats (DPS helper). Same-origin `../data/` from this script.
   * @returns {Promise<object>}
   */
  function ensureWeaponStatsBundle() {
    if (weaponStatsBundle) {
      return Promise.resolve(weaponStatsBundle);
    }
    if (!weaponStatsLoadPromise) {
      const url = SET_CHECKER_SCRIPT_SRC
        ? new URL("../data/weapon-stats.json", SET_CHECKER_SCRIPT_SRC).href
        : new URL("data/weapon-stats.json", window.location.href).href;
      weaponStatsLoadPromise = fetch(url, { cache: "force-cache", mode: "cors" })
        .then((r) => (r.ok ? r.json() : {}))
        .then((json) => {
          weaponStatsBundle = json && typeof json === "object" ? json : {};
          return weaponStatsBundle;
        })
        .catch(() => {
          weaponStatsBundle = {};
          return weaponStatsBundle;
        });
    }
    return weaponStatsLoadPromise;
  }

  /** @returns {{ damage: number; rof: number }[] | null} */
  function getWeaponShots(/** @type {string} */ slug) {
    if (!weaponStatsBundle || !slug || !weaponStatsBundle.weapons) {
      return null;
    }
    const w = weaponStatsBundle.weapons[slug];
    if (!w || !Array.isArray(w.shots) || !w.shots.length) {
      return null;
    }
    return w.shots.map((/** @type {{ damage: number; rof: number }} */ s) => ({
      damage: s.damage,
      rof: s.rof,
    }));
  }

  /**
   * Wiki slug → local icon `{ src, alt }` from `item-icon-registry.json` (beside this script).
   * @returns {Promise<Record<string, { src: string; alt: string }>>}
   */
  function ensureIconRegistry() {
    if (!iconRegistryLoadPromise) {
      const url = SET_CHECKER_SCRIPT_SRC
        ? new URL("item-icon-registry.json", SET_CHECKER_SCRIPT_SRC).href
        : new URL("item-icon-registry.json", window.location.href).href;
      iconRegistryLoadPromise = fetch(url, { cache: "force-cache", mode: "cors" })
        .then((r) => (r.ok ? r.json() : {}))
        .then((json) => {
          const base =
            json && typeof json.items === "object" && json.items
              ? /** @type {Record<string, { src: string; alt: string }>} */ ({ ...json.items })
              : {};
          const aliases =
            json && typeof json.aliases === "object" && json.aliases ? json.aliases : {};
          for (const [from, to] of Object.entries(aliases)) {
            if (base[from] || typeof to !== "string" || !base[to]) continue;
            base[from] = { ...base[to] };
          }
          return base;
        })
        .catch(() => ({}));
    }
    return iconRegistryLoadPromise;
  }

  function iconPlaceholderHtml(/** @type {string} */ extraClasses) {
    const ec = extraClasses ? ` ${extraClasses}` : "";
    return `<span class="set-checker-icon-placeholder${ec}" aria-hidden="true">?</span>`;
  }

  function bisIconsRowHtml(/** @type {{ src: string; alt: string }[]} */ imgs) {
    if (!imgs || !imgs.length) {
      return "";
    }
    const inner = imgs
      .map(
        (ico) =>
          `<img class="set-checker-row-icon" src="${escapeHtml(ico.src)}" alt="${escapeHtml(
            ico.alt || ""
          )}" loading="lazy" decoding="async" width="22" height="22">`
      )
      .join("");
    return `<span class="set-checker-row-icons">${inner}</span>`;
  }

  /**
   * @param {Record<string, { src: string; alt: string }>} registry
   * @param {string | null | undefined} wikiSlug
   * @param {string | null | undefined} fallbackTitle
   */
  function equippedIconHtml(registry, wikiSlug, fallbackTitle) {
    const slug = wikiSlug ? String(wikiSlug) : "";
    const ent = slug && registry[slug];
    if (ent && ent.src) {
      const alt = ent.alt || fallbackTitle || slug;
      return `<img class="set-checker-row-icon set-checker-equipped-icon" src="${escapeHtml(ent.src)}" alt="${escapeHtml(
        alt
      )}" loading="lazy" decoding="async" width="22" height="22">`;
    }
    return iconPlaceholderHtml("set-checker-equipped-icon");
  }

  function prefixBeforeColon(line) {
    const i = String(line).indexOf(":");
    return norm(i >= 0 ? line.slice(0, i) : line);
  }

  /** RealmEye display label (before first colon), original casing — not for matching. */
  function realmeyeLabelBeforeColon(line) {
    const s = String(line);
    const i = s.indexOf(":");
    return (i >= 0 ? s.slice(0, i) : s).replace(/\s+/g, " ").trim();
  }

  /**
   * Guide tokens use short names; RealmEye tooltips use longer names.
   * Keys are norm(guideToken).
   */
  const SPECIAL_PREFIX_TESTERS = {
    "mana regen iv": (p) =>
      /\biv\b/i.test(p) &&
      (/\bflat\s*mana\s*regeneration\b/i.test(p) || /\bpercentage\s*mana\s*regeneration\b/i.test(p)),
    "relative vitality iv": (p) =>
      /\brelative\s+vitality\b/.test(p) && /\biv\b/i.test(p),
    "vitality tradeoff iv": (p) =>
      /\bvitality\b/.test(p) && /\btradeoff\b/.test(p) && /\biv\b/i.test(p),
    "dexterity tradeoff iv": (p) =>
      /\bdexterity\b/.test(p) && /\btradeoff\b/.test(p) && /\biv\b/i.test(p),
    "onshoot vitality iv": (p) =>
      /\bon\s*shoot\b/.test(p) && /\bvitality\b/.test(p) && /\biv\b/i.test(p),
    "onhit vitality iv": (p) =>
      /\bon\s*hit\b/.test(p) && /\bvitality\b/.test(p) && /\biv\b/i.test(p),
    "onability vitality iv": (p) =>
      /\bon\s*ability\b/.test(p) && /\bvitality\b/.test(p) && /\biv\b/i.test(p),
    "onshoot dexterity iv": (p) =>
      /\bon\s*shoot\b/.test(p) && /\bdexterity\b/.test(p) && /\biv\b/i.test(p),
    "onhit attack iv": (p) =>
      /\bon\s*hit\b/.test(p) && /\battack\b/.test(p) && /\biv\b/i.test(p),
    "onability attack iv": (p) =>
      /\bon\s*ability\b/.test(p) && /\battack\b/.test(p) && /\biv\b/i.test(p),
    "onshoot attack iv": (p) =>
      /\bon\s*shoot\b/.test(p) && /\battack\b/.test(p) && /\biv\b/i.test(p),
    "onhit defense iv": (p) =>
      /\bon\s*hit\b/.test(p) && /\bdefense\b/.test(p) && /\biv\b/i.test(p),
    "onability defense iv": (p) =>
      /\bon\s*ability\b/.test(p) && /\bdefense\b/.test(p) && /\biv\b/i.test(p),
    "onshoot defense iv": (p) =>
      /\bon\s*shoot\b/.test(p) && /\bdefense\b/.test(p) && /\biv\b/i.test(p),
    "onhit speed iv": (p) =>
      /\bon\s*hit\b/.test(p) && /\bspeed\b/.test(p) && /\biv\b/i.test(p),
    "onability speed iv": (p) =>
      /\bon\s*ability\b/.test(p) && /\bspeed\b/.test(p) && /\biv\b/i.test(p),
    "onshoot speed iv": (p) =>
      /\bon\s*shoot\b/.test(p) && /\bspeed\b/.test(p) && /\biv\b/i.test(p),
    "mp reduction iv": (p) =>
      /\bmp\s*reduction\b/.test(p) && /\biv\b/i.test(p),
    "vitality to dexterity iv": (p) =>
      /\bvitality\b/.test(p) && /\bdexterity\b/.test(p) && /\biv\b/i.test(p),
    "onhit dexterity iv": (p) =>
      /\bon\s*hit\b/.test(p) && /\bdexterity\b/.test(p) && /\biv\b/i.test(p),
    "onability dexterity iv": (p) =>
      /\bon\s*ability\b/.test(p) && /\bdexterity\b/.test(p) && /\biv\b/i.test(p),
    "crystalline vigor": (p) => p.includes("crystalline vigor"),
    "flurry of blows": (p) => p.includes("flurry of blows"),
    "stat mod multiplier iv": (p) =>
      /\bstat\s*mod\s*multiplier\b/.test(p) && /\biv\b/i.test(p),
    "relative wisdom iv": (p) => /\brelative\s+wisdom\b/.test(p) && /\biv\b/i.test(p),
    "wisdom tradeoff iv": (p) =>
      /\bwisdom\b/.test(p) && /\btradeoff\b/.test(p) && /\biv\b/i.test(p),
    "onshoot wisdom iv": (p) =>
      /\bon\s*shoot\b/.test(p) && /\bwisdom\b/.test(p) && /\biv\b/i.test(p),
    "onhit wisdom iv": (p) =>
      /\bon\s*hit\b/.test(p) && /\bwisdom\b/.test(p) && /\biv\b/i.test(p),
    "onability wisdom iv": (p) =>
      /\bon\s*ability\b/.test(p) && /\bwisdom\b/.test(p) && /\biv\b/i.test(p),
    "wisdom to dexterity iv": (p) =>
      /\bwisdom\b/.test(p) && /\bdexterity\b/.test(p) && /\biv\b/i.test(p),
    "percent mana regen iv": (p) =>
      /\biv\b/i.test(p) && /\bpercentage\s*mana\s*regeneration\b/i.test(p),
    "percent health regen iv": (p) =>
      /\biv\b/i.test(p) && /\bpercentage\s*life\s*regeneration\b/i.test(p),
    "onability magic iv": (p) =>
      /\bon\s*ability\b/.test(p) && /\bmagic\b/.test(p) && /\biv\b/i.test(p),
    "avalon's intellect": (p) => /avalon/.test(p) && /intellect/i.test(p),
  };

  /**
   * Bare On-hit / On-ability / On-shoot fragments must not match RealmEye lines via substring (e.g. "onhit" ⊂ "onhit vitality boost i").
   * @param {string} guideNorm result of norm() on a guide variant
   */
  function isProcOnlyGuideStub(guideNorm) {
    const g = String(guideNorm || "").replace(/\s+/g, " ").trim();
    if (!g) {
      return false;
    }
    return /^(on\s*)?(hit|ability|shoot)$/.test(g) || /^on(hit|ability|shoot)$/.test(g);
  }

  /**
   * Expands guide tokens such as "Onhit/Onability Dexterity IV" or "Onhit/Onability Attack/Dexterity IV"
   * into full OR-variants (RealmEye matching uses each variant separately).
   * Roman tier is optional to support shorthand like "Onhit/Onability Attack/Dexterity".
   * @param {string} raw
   * @returns {string[]}
   */
  function expandGuideEnchantAlternations(raw) {
    const s = String(raw || "").trim();
    if (!s) {
      return [];
    }
    const onProc = "(?:on\\s*)?(?:hit|ability|shoot)";
    const headRe = new RegExp(`^(${onProc}(?:\\s*/\\s*${onProc})*)\\s+(.+)$`, "i");
    const m = s.match(headRe);
    if (!m) {
      return [s];
    }
    const procBlock = m[1];
    const tail = m[2].trim();
    let statBody = tail;
    /** @type {string} */
    let tier = "";
    const romanM = tail.match(/^(.*?)\s+(I{1,3}V?|IV)\s*$/i);
    if (romanM) {
      statBody = romanM[1].trim();
      tier = String(romanM[2] || "").toUpperCase();
    }
    const statLabels = statBody.split(/\s*\/\s*/).map((x) => x.trim()).filter(Boolean);
    const procLabels = procBlock.split(/\s*\/\s*/).map((x) => x.trim()).filter(Boolean);
    if (!statLabels.length || !procLabels.length) {
      return [s];
    }
    const tierSuffix = tier ? ` ${tier}` : "";
    /** @type {string[]} */
    const expanded = [];
    for (const proc of procLabels) {
      for (const stat of statLabels) {
        expanded.push(`${proc} ${stat}${tierSuffix}`);
      }
    }
    const uniq = [...new Set(expanded)];
    return uniq.length ? uniq : [s];
  }

  function genericLooseMatch(guideNorm, prefixNorm) {
    if (isProcOnlyGuideStub(guideNorm)) {
      return false;
    }
    if (prefixNorm.includes(guideNorm) || guideNorm.includes(prefixNorm)) {
      return true;
    }
    const pLite = prefixNorm.replace(/\bbonus\b/g, " ").replace(/\s+/g, " ").trim();
    const gLite = guideNorm.replace(/\bbonus\b/g, " ").replace(/\s+/g, " ").trim();
    return pLite.includes(gLite) || gLite.includes(pLite);
  }

  function guideVariantMatches(guideVariant, prefixList) {
    const g = norm(guideVariant);
    if (!g) {
      return false;
    }
    const tester = SPECIAL_PREFIX_TESTERS[g];
    if (tester) {
      return prefixList.some((p) => tester(p));
    }
    if (g.includes("/")) {
      return false;
    }
    return prefixList.some((p) => genericLooseMatch(g, p));
  }

  /** OR-expands On-hit/on-ability slash patterns, then matches each variant. */
  function guideTokenMatches(guideToken, prefixList) {
    const raw = String(guideToken).trim();
    if (!raw) {
      return false;
    }
    const variants = expandGuideEnchantAlternations(raw);
    return variants.some((v) => guideVariantMatches(v, prefixList));
  }

  function filterCoreEquipment(equipment) {
    return (equipment || []).filter((slot) => slot && slot.wiki_slug !== BACKPACK_SLUG);
  }

  function extractWikiSlugFromHref(href) {
    if (!href) {
      return null;
    }
    try {
      const u = new URL(href, window.location.origin);
      const m = u.pathname.match(/\/wiki\/([^/]+)/);
      return m ? decodeURIComponent(m[1]) : null;
    } catch {
      const m = String(href).match(/wiki\/([^?#]+)/);
      return m ? decodeURIComponent(m[1]) : null;
    }
  }

  /** @param {string | null | undefined} url */
  function slugFromWikiUrl(url) {
    return extractWikiSlugFromHref(url);
  }

  function parseOmitIfNoMatch(li) {
    if (!li.hasAttribute("data-bis-omit-if-no-match")) {
      return false;
    }
    const v = (li.getAttribute("data-bis-omit-if-no-match") || "").trim().toLowerCase();
    if (v === "false" || v === "0") {
      return false;
    }
    return true;
  }

  function parseEquipmentSlotIndex(li) {
    const raw = (li.getAttribute("data-bis-equipment-slot") || "").trim().toLowerCase();
    if (!raw) {
      return null;
    }
    const idx = EQUIPMENT_SLOT_TO_INDEX[raw];
    return idx === undefined ? null : idx;
  }

  /**
   * BiS decorative icons from the guide `<img class="icon-inline">` entries (public B2 URLs under `rotmg-icons/`).
   * @param {HTMLLIElement} li
   * @returns {{ src: string; alt: string }[]}
   */
  function parseBisIconImgs(li) {
    /** @type {HTMLImageElement[]} */
    let list = [...li.querySelectorAll("img.icon-inline")];
    if (!list.length) {
      list = [...li.querySelectorAll("img")];
    }
    return list.slice(0, 6).map((img) => ({
      src: (img.getAttribute("src") || "").trim(),
      alt: String(img.getAttribute("alt") || "").trim(),
    }))
      .filter((x) => x.src.length > 0);
  }

  /**
   * Human-readable item label for set-checker headings (icon alt, aria-label, or slug words).
   * @param {HTMLAnchorElement} a
   */
  function displayNameFromBisAnchor(a) {
    const img = a.querySelector("img.icon-inline") || a.querySelector("img");
    const alt = img ? String(img.getAttribute("alt") || "").trim() : "";
    if (alt) {
      return alt;
    }
    const aria = String(a.getAttribute("aria-label") || "").trim();
    const fromAria = aria.replace(/\s+on RealmEye wiki\s*$/i, "").trim();
    if (fromAria) {
      return fromAria;
    }
    const slug = extractWikiSlugFromHref(a.getAttribute("href"));
    if (!slug) {
      return "";
    }
    return slug.replace(/-/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  /**
   * @param {HTMLLIElement} li
   * @returns {{ slugs: string[], bisItemTitle: string, tokens: string[], omitIfNoMatch: boolean, equipmentSlotIndex: number | null, bisIconImgs: { src: string; alt: string }[] }}
   */
  function parseBisEnchantLi(li) {
    const anchors = [...li.querySelectorAll('a[href*="/wiki/"]')];
    const slugs = [];
    /** @type {string[]} */
    const bisItemTitleParts = [];
    for (const a of anchors) {
      const s = extractWikiSlugFromHref(a.getAttribute("href"));
      if (!s) {
        continue;
      }
      slugs.push(s);
      const label = displayNameFromBisAnchor(/** @type {HTMLAnchorElement} */ (a));
      bisItemTitleParts.push(label || s);
    }
    const bisItemTitle = bisItemTitleParts.join(" / ");
    const bisIconImgs = parseBisIconImgs(li);
    const clone = li.cloneNode(true);

    clone.querySelectorAll("a").forEach((x) => x.remove());
    const raw = clone.textContent.replace(/\s+/g, " ").trim();
    const ci = raw.indexOf(":");
    const tail = ci >= 0 ? raw.slice(ci + 1).trim() : "";
    const tokens = tail
      .split(/\s-\s/)
      .map((t) => t.trim())
      .filter(Boolean);
    return {
      slugs: [...new Set(slugs)],
      bisItemTitle,
      tokens,
      omitIfNoMatch: parseOmitIfNoMatch(li),
      equipmentSlotIndex: parseEquipmentSlotIndex(li),
      bisIconImgs,
    };
  }

  /**
   * @param {HTMLElement | null} root
   */
  function parseBisRowsFromRoot(root) {
    if (!root) {
      return [];
    }
    const ul = root.querySelector(".section-bis-enchants ul");
    if (!ul) {
      return [];
    }
    return [...ul.querySelectorAll("li")].map((li) => parseBisEnchantLi(/** @type {HTMLLIElement} */ (li)));
  }

  function findEquippedForRow(coreEq, row) {
    return (
      coreEq.find((slot) => slot.wiki_slug && row.slugs.includes(slot.wiki_slug)) ||
      null
    );
  }

  /**
   * Assign each BiS token the first unused RealmEye line whose prefix individually matches (greedy).
   * @returns {{ pairedLines: (string|null)[]; extraLines: string[] }}
   */
  function pairEnchantLinesToTokens(tokens, enchantLines) {
    const lines = enchantLines || [];
    const used = new Set();
    const pairedLines = [];
    for (const token of tokens) {
      let found = /** @type {string | null} */ (null);
      let foundIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (used.has(i)) {
          continue;
        }
        const p = prefixBeforeColon(lines[i]);
        if (guideTokenMatches(token, [p])) {
          found = lines[i];
          foundIdx = i;
          break;
        }
      }
      if (foundIdx >= 0) {
        used.add(foundIdx);
      }
      pairedLines.push(found);
    }
    const extraLines = [];
    for (let i = 0; i < lines.length; i++) {
      if (!used.has(i)) {
        extraLines.push(lines[i]);
      }
    }
    return { pairedLines, extraLines };
  }

  /**
   * @param {object} character
   * @param {ReturnType<typeof parseBisEnchantLi>[]} rows
   */
  function compareCharacterToBis(character, rows) {
    const coreEq = filterCoreEquipment(character.equipment);
    const n = Math.min(coreEq.length, 4);
    /** Indices in coreEq slug-matched by at least one row (alternate items on RealmEye occupy that slot only once). */
    const slotMatchedBySlug = new Array(n).fill(false);
    for (const row of rows) {
      const matched = findEquippedForRow(coreEq, row);
      if (matched) {
        const idx = coreEq.indexOf(matched);
        if (idx >= 0 && idx < n) {
          slotMatchedBySlug[idx] = true;
        }
      }
    }

    const out = [];
    for (const row of rows) {
      let equipped = findEquippedForRow(coreEq, row);
      let itemMismatch = false;
      if (equipped) {
        itemMismatch = false;
      } else if (row.omitIfNoMatch) {
        continue;
      } else if (row.equipmentSlotIndex != null) {
        const ix = row.equipmentSlotIndex;
        if (ix < 0 || ix >= coreEq.length) {
          continue;
        }
        if (slotMatchedBySlug[ix]) {
          continue;
        }
        equipped = coreEq[ix] || null;
        if (!equipped) {
          continue;
        }
        const slug = equipped.wiki_slug;
        itemMismatch = !slug || !row.slugs.includes(slug);
      } else {
        continue;
      }

      const { pairedLines, extraLines } = pairEnchantLinesToTokens(row.tokens, equipped.enchantments);
      const tokenResults = row.tokens.map((token, i) => ({
        token,
        ok: pairedLines[i] != null,
        pairedLine: pairedLines[i],
        reason: null,
      }));
      out.push({ row, equipped, itemMismatch, tokenResults, extraEnchantLines: extraLines });
    }
    return out;
  }

  function weaponDpsPauseButtonsHtml(/** @type {string[]} */ slugs) {
    if (!slugs || !slugs.length) {
      return "";
    }
    return slugs
      .map(
        (s) =>
          `<button type="button" class="set-checker-dps-pause" data-set-checker-dps-slug="${escapeHtml(
            s
          )}" title="Weapon DPS (placeholder)" aria-label="Open weapon DPS view for ${escapeHtml(s)}"><span class="set-checker-dps-pause-icon" aria-hidden="true">⏸</span></button>`
      )
      .join("");
  }

  /**
   * @param {HTMLElement} mount
   * @param {object} character
   * @param {ReturnType<typeof compareCharacterToBis>} results
   */
  async function renderCompare(mount, character, results) {
    /** @type {Record<string, { src: string; alt: string }>} */
    const registry = await ensureIconRegistry();
    const parts = [];
    parts.push(
      `<p class="set-checker-summary"><strong>${escapeHtml(
        character.class
      )}</strong> Lv ${escapeHtml(character.level)} — ${escapeHtml(
        character.fame
      )} fame</p>`
    );

    for (const block of results) {
      const { row, equipped, tokenResults, itemMismatch } = block;
      const bisHeadingLabel =
        (row.bisItemTitle && String(row.bisItemTitle).trim()) || row.slugs.join(" / ");
      const isWeaponRow = row.equipmentSlotIndex === EQUIPMENT_SLOT_TO_INDEX.weapon;
      const rowSectionClass = itemMismatch
        ? "set-checker-row set-checker-row--mismatch"
        : "set-checker-row";
      if (itemMismatch) {
        parts.push(`<section class="${rowSectionClass}">`);
        const pauseHtml = isWeaponRow ? weaponDpsPauseButtonsHtml(row.slugs) : "";
        const titleClass = isWeaponRow
          ? "set-checker-row-title set-checker-row-title--weapon"
          : "set-checker-row-title";
        if (isWeaponRow) {
          parts.push(
            `<h3 class="${titleClass}"><span class="set-checker-row-title-start">${bisIconsRowHtml(
              row.bisIconImgs
            )}<span class="set-checker-row-title-text">BiS: ${escapeHtml(bisHeadingLabel)}</span></span><span class="set-checker-row-dps-actions" role="group" aria-label="Weapon DPS shortcuts">${pauseHtml}</span></h3>`
          );
        } else {
          parts.push(
            `<h3 class="${titleClass}">${bisIconsRowHtml(row.bisIconImgs)}<span class="set-checker-row-title-text">BiS: ${escapeHtml(
              bisHeadingLabel
            )}</span></h3>`
          );
        }
        parts.push(
          `<p class="set-checker-equipped-wrong"><span class="set-checker-mark" aria-hidden="true">✗</span> <strong>Equipped (RealmEye):</strong> ${equippedIconHtml(
            registry,
            equipped.wiki_slug,
            equipped.title || equipped.wiki_slug
          )}<span class="set-checker-equipped-name">${escapeHtml(equipped.title || equipped.wiki_slug || "—")}</span></p>`
        );
      } else {
        const titleClass = isWeaponRow
          ? "set-checker-row-title set-checker-row-title--weapon"
          : "set-checker-row-title";
        const pauseHtml = isWeaponRow ? weaponDpsPauseButtonsHtml(row.slugs) : "";
        if (isWeaponRow) {
          parts.push(
            `<section class="${rowSectionClass}"><h3 class="${titleClass}"><span class="set-checker-row-title-start"><span class="set-checker-row-icons">${equippedIconHtml(
              registry,
              equipped.wiki_slug,
              equipped.title || bisHeadingLabel
            )}</span><span class="set-checker-row-title-text">BiS: ${escapeHtml(equipped.title || bisHeadingLabel)}</span></span><span class="set-checker-row-dps-actions" role="group" aria-label="Weapon DPS shortcuts">${pauseHtml}</span></h3>`
          );
        } else {
          parts.push(
            `<section class="${rowSectionClass}"><h3 class="${titleClass}"><span class="set-checker-row-icons">${equippedIconHtml(
              registry,
              equipped.wiki_slug,
              equipped.title || bisHeadingLabel
            )}</span><span class="set-checker-row-title-text">${escapeHtml(equipped.title || bisHeadingLabel)}</span></h3>`
          );
        }
      }
      parts.push(
        "<table class=\"set-checker-enchant-table\" aria-label=\"BiS enchants compared to RealmEye lines\">"
      );
      parts.push(
        "<thead><tr><th scope=\"col\" class=\"set-checker-enchant-col-bis\">BiS</th><th scope=\"col\" class=\"set-checker-enchant-col-real\">RealmEye</th></tr></thead><tbody>"
      );
      const spareQueue = [...(/** @type {string[]} */ (block.extraEnchantLines || []))];
      /** @type {{ cls: string; mark: string; token: string; label: string | null; title: string | null }[]} */
      const built = [];
      let lastDequeRowIx = -1;
      for (const tr of tokenResults) {
        const cls = tr.ok ? "set-checker-enchant-row set-checker-enchant-row--ok" : "set-checker-enchant-row set-checker-enchant-row--bad";
        const mark = tr.ok ? "✓" : "✗";
        let label = /** @type {string | null} */ (null);
        let title = /** @type {string | null} */ (null);
        if (tr.ok && tr.pairedLine) {
          label = realmeyeLabelBeforeColon(tr.pairedLine);
          title = tr.pairedLine;
        } else if (!tr.ok) {
          const line = spareQueue.shift();
          if (line != null) {
            label = realmeyeLabelBeforeColon(line);
            title = line;
            lastDequeRowIx = built.length;
          }
        }
        built.push({ cls, mark, token: tr.token, label, title });
      }
      if (spareQueue.length > 0) {
        const mergeIx = lastDequeRowIx >= 0 ? lastDequeRowIx : built.length - 1;
        if (mergeIx >= 0) {
          const br = built[mergeIx];
          const labelParts = [];
          const titleParts = [];
          if (br.label) {
            labelParts.push(br.label);
          }
          if (br.title) {
            titleParts.push(br.title);
          }
          for (const line of spareQueue) {
            labelParts.push(realmeyeLabelBeforeColon(line));
            titleParts.push(line);
          }
          br.label = labelParts.join(" · ");
          br.title = titleParts.join("\n");
        }
        spareQueue.length = 0;
      }
      for (const br of built) {
        parts.push(`<tr class="${br.cls}">`);
        parts.push(
          `<td class="set-checker-enchant-cell-bis"><span class="set-checker-mark" aria-hidden="true">${br.mark}</span> ${escapeHtml(
            br.token
          )}</td>`
        );
        if (br.label) {
          parts.push(
            `<td class="set-checker-enchant-cell-real"><span class="set-checker-you-line" title="${escapeHtml(
              br.title || ""
            )}">${escapeHtml(br.label)}</span></td>`
          );
        } else {
          parts.push("<td class=\"set-checker-enchant-cell-real set-checker-enchant-none\">—</td>");
        }
        parts.push("</tr>");
      }
      parts.push("</tbody></table></section>");
    }
    mount.innerHTML = parts.join("");
  }

  /**
   * @param {string} bisRootId
   */
  async function renderCharacterPicker(mount, characters, bisRootId, liveUsername) {
    const root = document.getElementById(bisRootId);
    const rows = parseBisRowsFromRoot(root);
    const banner = sourceBannerHtml(liveUsername);
    const classSlug = getSetCheckerClassSlug();
    const classLabel = classSlugToDisplay(classSlug);
    if (characters.length === 0) {
      mount.innerHTML =
        banner + `<p class="set-checker-bad">No character found.</p>`;
      return;
    }
    if (characters.length === 1) {
      mount.innerHTML = banner;
      const wrap = document.createElement("div");
      mount.appendChild(wrap);
      await renderCompare(wrap, characters[0], compareCharacterToBis(characters[0], rows));
      return;
    }
    const opts = characters
      .map(
        (ch, i) =>
          `<option value="${i}">${escapeHtml(ch.class)} Lv ${escapeHtml(ch.level)} — ${escapeHtml(ch.fame)} fame</option>`
      )
      .join("");
    const ariaChoose = escapeHtml(`Choose ${classLabel}`);
    mount.innerHTML =
      banner +
      `<div class="set-checker-picker"><label class="set-checker-label"><span class="set-checker-label-text">${escapeHtml(
        classLabel
      )}</span> <select class="set-checker-select" aria-label="${ariaChoose}">${opts}</select></label><button type="button" class="set-checker-primary set-checker-run">Compare</button></div><div class="set-checker-results"></div>`;
    const sel = mount.querySelector("select.set-checker-select");
    const run = mount.querySelector("button.set-checker-run");
    const res = mount.querySelector(".set-checker-results");
    async function runSelected() {
      const ch = characters[Number(/** @type {HTMLSelectElement} */ (sel).value)];
      if (ch && res) {
        await renderCompare(res, ch, compareCharacterToBis(ch, rows));
      }
    }
    run.addEventListener("click", () => void runSelected());
    sel.addEventListener("change", () => void runSelected());
    await runSelected();
  }

  function init() {
    const shell = document.getElementById("vit-set-checker-shell");
    const panel = document.getElementById("vit-set-checker-panel");
    const mount = document.getElementById("vit-set-checker-mount");
    const usernameBtn = document.getElementById("vit-set-checker-username");
    const triggers = document.querySelectorAll("button.set-checker-trigger[data-bis-root]");
    const titleEl = document.getElementById("vit-set-checker-title");
    if (!shell || !panel || !mount || triggers.length === 0) {
      return;
    }

    /** @type {HTMLDivElement | null} */
    let sidebarMainPane = null;
    /** @type {HTMLDivElement | null} */
    let sidebarDpsPane = null;

    function ensureSidebarPanes() {
      if (!mount || (sidebarMainPane && sidebarDpsPane)) {
        return;
      }
      mount.replaceChildren();
      sidebarMainPane = document.createElement("div");
      sidebarMainPane.className = "set-checker-main-pane";
      sidebarMainPane.id = "set-checker-main-pane";
      sidebarDpsPane = document.createElement("div");
      sidebarDpsPane.className = "set-checker-dps-pane";
      sidebarDpsPane.id = "set-checker-dps-pane";
      sidebarDpsPane.hidden = true;
      mount.appendChild(sidebarMainPane);
      mount.appendChild(sidebarDpsPane);
    }

    function hideWeaponDpsReturnMain() {
      if (!sidebarDpsPane || !sidebarMainPane) {
        return;
      }
      sidebarDpsPane.hidden = true;
      sidebarMainPane.hidden = false;
      sidebarDpsPane.replaceChildren();
    }

    async function openWeaponDpsSidebar(/** @type {string} */ rawSlug) {
      const slug = String(rawSlug || "").trim();
      if (!slug) {
        return;
      }
      ensureSidebarPanes();
      if (!sidebarMainPane || !sidebarDpsPane) {
        return;
      }
      await ensureWeaponStatsBundle();
      sidebarMainPane.hidden = true;
      sidebarDpsPane.hidden = false;
      const entry =
        weaponStatsBundle && weaponStatsBundle.weapons ? weaponStatsBundle.weapons[slug] : null;
      const friendly = /** @type {string} */ ((entry && entry.displayName) || slug.replace(/-/g, " "));
      const shotsJson = escapeHtml(JSON.stringify(getWeaponShots(slug) || [], null, 2));
      const summary = entry && entry.wikiSummary ? escapeHtml(entry.wikiSummary) : "";
      const assum = entry && entry.assumptions ? escapeHtml(entry.assumptions) : "";
      sidebarDpsPane.innerHTML =
        `<div class="set-checker-dps-inner">` +
        `<div class="set-checker-dps-toolbar">` +
        `<button type="button" class="set-checker-secondary set-checker-dps-back">← Back to set checker</button>` +
        `</div>` +
        `<h3 class="set-checker-dps-heading">DPS: ${escapeHtml(friendly)}</h3>` +
        `<p class="set-checker-dps-slug"><code>${escapeHtml(slug)}</code></p>` +
        `<p class="set-checker-muted set-checker-dps-placeholder-msg">DPS optimizer controls for this weapon — full UI coming soon. Shot rows below are from <code>data/weapon-stats.json</code> (wiki-derived, Ammmar-style <code>dmg</code> / <code>rof</code>).</p>` +
        (summary ? `<p class="set-checker-dps-wiki-lines">${summary}</p>` : "") +
        `<pre class="set-checker-dps-shots" tabindex="0">${shotsJson}</pre>` +
        (assum ? `<p class="set-checker-hint">${assum}</p>` : "") +
        `</div>`;

      const back = sidebarDpsPane.querySelector(".set-checker-dps-back");
      if (back && typeof back.focus === "function") {
        back.focus();
      }
    }

    panel.addEventListener("click", (/** @type {MouseEvent} */ e) => {
      const target = /** @type {HTMLElement | null} */ (e.target);
      if (!target) {
        return;
      }
      if (target.closest(".set-checker-dps-back")) {
        e.preventDefault();
        hideWeaponDpsReturnMain();
        return;
      }
      const opener = target.closest("[data-set-checker-dps-slug]");
      if (!opener) {
        return;
      }
      const slug = opener.getAttribute("data-set-checker-dps-slug");
      if (!slug || !slug.trim()) {
        return;
      }
      e.preventDefault();
      void openWeaponDpsSidebar(slug);
    });

    /** @type {{ bisRootId: string } | null} */
    let activeConfig = null;
    /** @type {HTMLElement | null} */
    let lastTrigger = null;
    let escapeListenerActive = false;
    /** @type {ReturnType<typeof setTimeout> | null} */
    let closeFallbackTimer = null;
    let loadGeneration = 0;
    /** @type {string} */
    let currentLiveUsername = "";
    /** Last successfully loaded RealmEye username for this tab session only (not persisted). */
    let sessionRealmeyeUsername = "";

    function pageDefaultUsername() {
      const v =
        typeof window.REALMEYE_SET_CHECKER_PLAYER === "string" ? window.REALMEYE_SET_CHECKER_PLAYER.trim() : "";
      return v;
    }

    function usernameFormPrefill() {
      return sessionRealmeyeUsername.trim() || pageDefaultUsername();
    }

    function prefersReducedMotion() {
      try {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      } catch (_) {
        return false;
      }
    }

    function onDocumentKeydown(/** @type {KeyboardEvent} */ e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeShell();
      }
    }

    function closeShell() {
      hideWeaponDpsReturnMain();
      if (!shell.classList.contains("is-open")) {
        return;
      }
      shell.classList.remove("is-open");
      document.body.classList.remove("set-checker-sidebar-open");

      let finalized = false;
      function done() {
        if (finalized) {
          return;
        }
        finalized = true;
        panel.removeEventListener("transitionend", onTransitionEnd);
        if (closeFallbackTimer !== null) {
          clearTimeout(closeFallbackTimer);
          closeFallbackTimer = null;
        }
        shell.hidden = true;
        shell.setAttribute("aria-hidden", "true");
        if (escapeListenerActive) {
          document.removeEventListener("keydown", onDocumentKeydown);
          escapeListenerActive = false;
        }
        const t = lastTrigger;
        if (t && typeof t.focus === "function") {
          t.focus();
        }
      }

      function onTransitionEnd(/** @type {TransitionEvent} */ e) {
        if (e.target !== panel || e.propertyName !== "transform") {
          return;
        }
        done();
      }

      if (prefersReducedMotion()) {
        done();
      } else {
        panel.addEventListener("transitionend", onTransitionEnd);
        closeFallbackTimer = setTimeout(done, 400);
      }
    }

    function openShell() {
      const alreadyOpen = shell.classList.contains("is-open");
      shell.hidden = false;
      shell.setAttribute("aria-hidden", "false");
      requestAnimationFrame(() => {
        shell.classList.add("is-open");
        document.body.classList.add("set-checker-sidebar-open");
      });
      if (!escapeListenerActive) {
        document.addEventListener("keydown", onDocumentKeydown);
        escapeListenerActive = true;
      }
      if (!alreadyOpen) {
        const focusClose =
          shell.querySelector("button.set-checker-icon-close.set-checker-close") ||
          shell.querySelector("button.set-checker-close");
        if (focusClose && typeof focusClose.focus === "function") {
          focusClose.focus();
        }
      }
    }

    function renderUsernameStep() {
      const bisRootId = activeConfig && activeConfig.bisRootId;
      if (!bisRootId || !mount) {
        return;
      }
      ensureSidebarPanes();
      hideWeaponDpsReturnMain();
      if (!sidebarMainPane) {
        return;
      }
      currentLiveUsername = "";
      const safeVal = escapeHtml(usernameFormPrefill());
      sidebarMainPane.innerHTML =
        `<div class="set-checker-username-step"><div class="set-checker-username-row">` +
        `<label class="set-checker-label" for="set-checker-username-input"><span class="set-checker-label-text">RealmEye username</span></label> ` +
        `<input type="text" id="set-checker-username-input" name="realmeye_username" class="set-checker-input" autocomplete="username" value="${safeVal}" aria-required="true" spellcheck="false">` +
        `<button type="button" class="set-checker-primary set-checker-load-player">Load RealmEye data</button></div>` +
        `<p id="set-checker-username-error" class="set-checker-bad set-checker-username-error" hidden role="alert"></p>` +
        `</div>`;
      const inp = /** @type {HTMLInputElement | null} */ (sidebarMainPane.querySelector("#set-checker-username-input"));
      const btn = sidebarMainPane.querySelector(".set-checker-load-player");
      const errEl = sidebarMainPane.querySelector("#set-checker-username-error");
      function submit() {
        if (!inp || !errEl) {
          return;
        }
        errEl.hidden = true;
        const u = inp.value.trim();
        if (!u) {
          errEl.textContent = "Enter a RealmEye username.";
          errEl.hidden = false;
          return;
        }
        void runLoad(u);
      }
      if (btn) {
        btn.addEventListener("click", () => submit());
      }
      if (inp) {
        inp.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        });
        queueMicrotask(() => {
          if (inp && typeof inp.focus === "function") {
            inp.focus();
          }
        });
      }
    }

    async function runLoad(/** @type {string} */ username) {
      const bisRootId = activeConfig && activeConfig.bisRootId;
      if (!bisRootId) {
        return;
      }
      const name = String(username || "").trim();
      if (!name) {
        return;
      }
      const gen = ++loadGeneration;
      ensureSidebarPanes();
      hideWeaponDpsReturnMain();
      if (!sidebarMainPane) {
        return;
      }
      sidebarMainPane.innerHTML = "<p class=\"set-checker-loading\">Fetching live RealmEye data…</p>";
      try {
        const meta = await loadPlayerData(name);
        if (gen !== loadGeneration) {
          return;
        }
        sessionRealmeyeUsername = name;
        currentLiveUsername = name;
        const characters = charactersForClassFromPayload(meta.data, getSetCheckerClassSlug());
        await renderCharacterPicker(sidebarMainPane, characters, bisRootId, name);
      } catch (err) {
        if (gen !== loadGeneration) {
          return;
        }
        const msg = escapeHtml(String(/** @type {Error} */ (err).message || err));
        sidebarMainPane.innerHTML = `<p class="set-checker-source set-checker-source--warn"><strong>Not fetching live data.</strong> The set checker only uses the live API—no offline snapshot.</p><p class="set-checker-bad">Could not load player data.</p><p class="set-checker-hint">${msg}</p>`;
      }
    }

    const closeEls = shell.querySelectorAll(".set-checker-close, .set-checker-icon-close");
    for (const el of closeEls) {
      el.addEventListener("click", () => closeShell());
    }

    if (usernameBtn) {
      usernameBtn.addEventListener("click", () => {
        ensureSidebarPanes();
        hideWeaponDpsReturnMain();
        renderUsernameStep();
      });
    }

    for (const trigger of triggers) {
      trigger.addEventListener("click", () => {
        const bisRootId = (trigger.getAttribute("data-bis-root") || "").trim();
        const dialogTitle = (trigger.getAttribute("data-bis-dialog-title") || "").trim() || "Set checker";
        lastTrigger = trigger;
        activeConfig = { bisRootId };
        if (titleEl) {
          titleEl.textContent = dialogTitle;
        }
        ensureSidebarPanes();
        hideWeaponDpsReturnMain();
        openShell();
        const sessionName = sessionRealmeyeUsername.trim();
        if (sessionName) {
          void runLoad(sessionName);
        } else {
          renderUsernameStep();
        }
      });
    }

    void ensureWeaponStatsBundle().then(() => {
      window.getWeaponShots = getWeaponShots;
      window.slugFromWikiUrl = slugFromWikiUrl;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
