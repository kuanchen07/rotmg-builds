/**
 * Full Vitality Rogue — prototype set checker.
 * Optional live JSON: set window.REALMEYE_LIVE_API_BASE (Vercel origin, no trailing slash).
 * Falls back to data/realmeye_evolz.json. Player: window.REALMEYE_SET_CHECKER_PLAYER (default evolz).
 */
(function () {
  "use strict";

  const JSON_PATH = "data/realmeye_evolz.json";
  const BACKPACK_SLUG = "backpack-extender";

  function getLiveApiBase() {
    const v = typeof window.REALMEYE_LIVE_API_BASE === "string" ? window.REALMEYE_LIVE_API_BASE.trim() : "";
    return v.replace(/\/$/, "");
  }

  function getCheckerPlayer() {
    const v =
      typeof window.REALMEYE_SET_CHECKER_PLAYER === "string" ? window.REALMEYE_SET_CHECKER_PLAYER.trim() : "";
    return v || "evolz";
  }

  async function loadSnapshotJson() {
    const res = await fetch(JSON_PATH, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} loading ${JSON_PATH}`);
    }
    return res.json();
  }

  /**
   * @returns {Promise<{ data: object, source: 'live' | 'snapshot' | 'snapshot_fallback', fallbackNote: string | null }>}
   */
  async function loadPlayerData() {
    const base = getLiveApiBase();
    const player = getCheckerPlayer();
    /** @type {string | null} */
    let fallbackNote = null;

    if (base) {
      const url = `${base}/api/main?username=${encodeURIComponent(player)}`;
      try {
        const res = await fetch(url, { cache: "no-store", mode: "cors" });
        if (res.ok) {
          const data = await res.json();
          return { data, source: "live", fallbackNote: null };
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
        fallbackNote = `Live API returned HTTP ${res.status}${detail ? ": " + detail : ""}.`;
      } catch (err) {
        fallbackNote = `Live API failed: ${String(/** @type {Error} */ (err).message || err)}.`;
      }
    }

    try {
      const data = await loadSnapshotJson();
      return {
        data,
        source: base ? "snapshot_fallback" : "snapshot",
        fallbackNote: base ? fallbackNote : null,
      };
    } catch (snapErr) {
      const extra = base && fallbackNote ? `${fallbackNote} ` : "";
      throw new Error(
        `${extra}Could not load ${JSON_PATH}: ${String(/** @type {Error} */ (snapErr).message || snapErr)}`
      );
    }
  }

  function sourceBannerHtml(source, fallbackNote) {
    const player = getCheckerPlayer();
    if (source === "live") {
      return `<p class="set-checker-source set-checker-source--live">Live data from RealmEye (<code>${escapeHtml(
        player
      )}</code>).</p>`;
    }
    if (source === "snapshot_fallback" && fallbackNote) {
      return `<p class="set-checker-source set-checker-source--warn">${escapeHtml(
        fallbackNote
      )} Using local snapshot <code>${escapeHtml(JSON_PATH)}</code>.</p>`;
    }
    return `<p class="set-checker-source">Using local snapshot <code>${escapeHtml(
      JSON_PATH
    )}</code>. For live gear on GitHub Pages, deploy the Vercel API in this repo and set <code>window.REALMEYE_LIVE_API_BASE</code> in <code>rogue.html</code>.</p>`;
  }

  function norm(s) {
    return String(s || "")
      .replace(/\u2019|\u2018/g, "'")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function prefixBeforeColon(line) {
    const i = String(line).indexOf(":");
    return norm(i >= 0 ? line.slice(0, i) : line);
  }

  /**
   * Guide tokens use short names; RealmEye tooltips use longer names.
   * Keys are norm(guideToken).
   */
  const SPECIAL_PREFIX_TESTERS = {
    "mana regen iv": (p) => /percentage\s*mana\s*regeneration/i.test(p),
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
  };

  function genericLooseMatch(guideNorm, prefixNorm) {
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

  /** "Onhit/Onability Dexterity IV" → OR of two variants */
  function guideTokenMatches(guideToken, prefixList) {
    const raw = String(guideToken).trim();
    if (!raw) {
      return false;
    }
    const parts = raw.split(/\s*\/\s*/).map((x) => x.trim()).filter(Boolean);
    if (parts.length > 1) {
      return parts.some((p) => guideVariantMatches(p, prefixList));
    }
    return guideVariantMatches(raw, prefixList);
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

  /**
   * @param {HTMLLIElement} li
   * @returns {{ slugs: string[], tokens: string[] }}
   */
  function parseBisEnchantLi(li) {
    const anchors = [...li.querySelectorAll('a[href*="/wiki/"]')];
    const slugs = [];
    for (const a of anchors) {
      const s = extractWikiSlugFromHref(a.getAttribute("href"));
      if (s) {
        slugs.push(s);
      }
    }
    const clone = li.cloneNode(true);
    clone.querySelectorAll("a").forEach((x) => x.remove());
    const raw = clone.textContent.replace(/\s+/g, " ").trim();
    const ci = raw.indexOf(":");
    const tail = ci >= 0 ? raw.slice(ci + 1).trim() : "";
    const tokens = tail
      .split(/\s-\s/)
      .map((t) => t.trim())
      .filter(Boolean);
    return { slugs: [...new Set(slugs)], tokens };
  }

  function parseVitBisRows() {
    const root = document.getElementById("vitality-build");
    if (!root) {
      return [];
    }
    const ul = root.querySelector(".section-bis-enchants ul");
    if (!ul) {
      return [];
    }
    return [...ul.querySelectorAll("li")].map((li) => parseBisEnchantLi(li));
  }

  function findEquippedForRow(coreEq, row) {
    return (
      coreEq.find((slot) => slot.wiki_slug && row.slugs.includes(slot.wiki_slug)) ||
      null
    );
  }

  function compareCharacterToVitBis(character) {
    const coreEq = filterCoreEquipment(character.equipment);
    const rows = parseVitBisRows();
    const out = [];
    for (const row of rows) {
      const equipped = findEquippedForRow(coreEq, row);
      if (!equipped) {
        out.push({
          row,
          equipped: null,
          tokenResults: row.tokens.map((t) => ({
            token: t,
            ok: false,
            reason: "wrong_or_missing_item",
          })),
        });
        continue;
      }
      const prefixList = (equipped.enchantments || []).map(prefixBeforeColon);
      const tokenResults = row.tokens.map((token) => ({
        token,
        ok: guideTokenMatches(token, prefixList),
        reason: null,
      }));
      out.push({ row, equipped, tokenResults });
    }
    return out;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function roguesFromPayload(data) {
    return (data.characters || []).filter((ch) => norm(ch.class) === "rogue");
  }

  function renderCompare(mount, character, results) {
    const parts = [];
    parts.push(
      `<p class="set-checker-summary"><strong>${escapeHtml(
        character.class
      )}</strong> Lv ${escapeHtml(character.level)} — ${escapeHtml(
        character.fame
      )} fame</p>`
    );

    for (const block of results) {
      const { row, equipped, tokenResults } = block;
      const slugLabel = row.slugs.join(" / ");
      if (!equipped) {
        parts.push(
          `<section class="set-checker-row set-checker-row--mismatch"><h3 class="set-checker-row-title">Item: ${escapeHtml(
            slugLabel
          )}</h3><p class="set-checker-bad">Not equipped (or wrong item). Skipping enchant checks for this row.</p></section>`
        );
        continue;
      }
      parts.push(`<section class="set-checker-row"><h3 class="set-checker-row-title">${escapeHtml(
        equipped.title || slugLabel
      )}</h3>`);
      parts.push("<ul class=\"set-checker-token-list\">");
      for (const tr of tokenResults) {
        const cls = tr.ok ? "set-checker-ok" : "set-checker-bad";
        const mark = tr.ok ? "✓" : "✗";
        parts.push(
          `<li class="${cls}"><span class="set-checker-mark" aria-hidden="true">${mark}</span> ${escapeHtml(
            tr.token
          )}</li>`
        );
      }
      parts.push("</ul>");
      parts.push("<details class=\"set-checker-yours\"><summary>Your enchant lines (RealmEye)</summary><ul>");
      for (const line of equipped.enchantments || []) {
        parts.push(`<li><code>${escapeHtml(line)}</code></li>`);
      }
      parts.push("</ul></details></section>");
    }
    mount.innerHTML = parts.join("");
  }

  /**
   * @param {{ source: string, fallbackNote: string | null }} meta
   */
  function renderRoguePicker(mount, rogues, meta) {
    const banner = sourceBannerHtml(meta.source, meta.fallbackNote);
    if (rogues.length === 0) {
      mount.innerHTML =
        banner +
        "<p class=\"set-checker-bad\">No Rogue characters found in this data.</p>";
      return;
    }
    if (rogues.length === 1) {
      mount.innerHTML = banner;
      const wrap = document.createElement("div");
      mount.appendChild(wrap);
      renderCompare(wrap, rogues[0], compareCharacterToVitBis(rogues[0]));
      return;
    }
    const opts = rogues
      .map(
        (ch, i) =>
          `<option value="${i}">${escapeHtml(ch.class)} Lv ${escapeHtml(
            ch.level
          )} — ${escapeHtml(ch.fame)} fame</option>`
      )
      .join("");
    mount.innerHTML =
      banner +
      `<div class="set-checker-picker"><label class="set-checker-label" for="vit-set-checker-select">Rogue</label><select id="vit-set-checker-select" class="set-checker-select">${opts}</select><button type="button" class="set-checker-primary" id="vit-set-checker-run">Compare</button></div><div id="vit-set-checker-results"></div>`;
    const sel = /** @type {HTMLSelectElement} */ (document.getElementById("vit-set-checker-select"));
    const run = document.getElementById("vit-set-checker-run");
    const res = document.getElementById("vit-set-checker-results");
    function runSelected() {
      const ch = rogues[Number(sel.value)];
      if (ch && res) {
        renderCompare(res, ch, compareCharacterToVitBis(ch));
      }
    }
    run.addEventListener("click", runSelected);
    sel.addEventListener("change", runSelected);
    runSelected();
  }

  function init() {
    const dialog = document.getElementById("vit-set-checker-dialog");
    const trigger = document.querySelector(".vit-set-checker-trigger");
    const mount = document.getElementById("vit-set-checker-mount");
    const refreshBtn = document.getElementById("vit-set-checker-refresh");
    if (!dialog || !trigger || !mount) {
      return;
    }

    async function runLoad() {
      const base = getLiveApiBase();
      mount.innerHTML = base
        ? "<p class=\"set-checker-loading\">Fetching RealmEye…</p>"
        : "<p class=\"set-checker-loading\">Loading snapshot…</p>";
      try {
        const meta = await loadPlayerData();
        const rogues = roguesFromPayload(meta.data);
        renderRoguePicker(mount, rogues, meta);
      } catch (err) {
        mount.innerHTML = `<p class="set-checker-bad">Could not load player data.</p><p class="set-checker-hint">${escapeHtml(
          String(/** @type {Error} */ (err).message || err)
        )}</p><p class="set-checker-hint">Serve the site over HTTP (for example <code>python -m http.server</code>) so <code>fetch</code> can read the snapshot. Check <code>window.REALMEYE_LIVE_API_BASE</code> if using the live API.</p>`;
      }
    }

    const closeEls = dialog.querySelectorAll(".set-checker-close, .set-checker-icon-close");
    for (const el of closeEls) {
      el.addEventListener("click", () => dialog.close());
    }
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) {
        dialog.close();
      }
    });

    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        void runLoad();
      });
    }

    trigger.addEventListener("click", async () => {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
      await runLoad();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
