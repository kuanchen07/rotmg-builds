/**
 * Full Vitality Rogue — prototype set checker.
 * Live JSON: set window.REALMEYE_LIVE_API_BASE (Vercel origin, no trailing slash); failures do not use the snapshot.
 * Snapshot only when REALMEYE_LIVE_API_BASE is unset: data/realmeye_evolz.json. Player: REALMEYE_SET_CHECKER_PLAYER (default evolz).
 */
(function () {
  "use strict";

  const JSON_PATH = "data/realmeye_evolz.json";
  const BACKPACK_SLUG = "backpack-extender";

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
   * @returns {Promise<{ data: object, source: 'live' | 'snapshot' }>}
   */
  async function loadPlayerData() {
    const base = getLiveApiBase();
    const player = getCheckerPlayer();

    if (base) {
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

    try {
      const data = await loadSnapshotJson();
      return { data, source: "snapshot" };
    } catch (snapErr) {
      throw new Error(`Could not load ${JSON_PATH}: ${String(/** @type {Error} */ (snapErr).message || snapErr)}`);
    }
  }

  function sourceBannerHtml(source) {
    const player = getCheckerPlayer();
    if (source === "live") {
      return `<p class="set-checker-source set-checker-source--live">Live data from RealmEye (<code>${escapeHtml(
        player
      )}</code>).</p>`;
    }
    return `<p class="set-checker-source">Using local snapshot <code>${escapeHtml(
      JSON_PATH
    )}</code>. For live gear, set <code>window.REALMEYE_LIVE_API_BASE</code> to your Vercel origin in <code>rogue.html</code>.</p>`;
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
            pairedLine: null,
          })),
          extraEnchantLines: [],
        });
        continue;
      }
      const { pairedLines, extraLines } = pairEnchantLinesToTokens(row.tokens, equipped.enchantments);
      const tokenResults = row.tokens.map((token, i) => ({
        token,
        ok: pairedLines[i] != null,
        pairedLine: pairedLines[i],
        reason: null,
      }));
      out.push({ row, equipped, tokenResults, extraEnchantLines: extraLines });
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
          const row = built[mergeIx];
          const labelParts = [];
          const titleParts = [];
          if (row.label) {
            labelParts.push(row.label);
          }
          if (row.title) {
            titleParts.push(row.title);
          }
          for (const line of spareQueue) {
            labelParts.push(realmeyeLabelBeforeColon(line));
            titleParts.push(line);
          }
          row.label = labelParts.join(" · ");
          row.title = titleParts.join("\n");
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
   * @param {{ source: 'live' | 'snapshot' }} meta
   */
  function renderRoguePicker(mount, rogues, meta) {
    const banner = sourceBannerHtml(meta.source);
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
        const msg = escapeHtml(String(/** @type {Error} */ (err).message || err));
        const liveHint = `<p class="set-checker-hint">Tried <code>${escapeHtml(
          `${base}/api/main?username=${encodeURIComponent(getCheckerPlayer())}`
        )}</code>. On Vercel, set <code>CORS_ORIGIN</code> to this page&rsquo;s origin and check <code>ALLOWED_PLAYERS</code>. Open that URL in a new tab to confirm the API.</p>`;
        const snapHint = `<p class="set-checker-hint">Serve the site over HTTP (for example <code>python -m http.server</code>) so <code>fetch</code> can read <code>${escapeHtml(
          JSON_PATH
        )}</code>. Or set <code>window.REALMEYE_LIVE_API_BASE</code> for live data.</p>`;
        mount.innerHTML = `<p class="set-checker-bad">Could not load player data.</p><p class="set-checker-hint">${msg}</p>${
          base ? liveHint : snapHint
        }`;
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
