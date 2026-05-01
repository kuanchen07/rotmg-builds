/**
 * Rogue set checker — compares BiS enchant lines in the page to live RealmEye player JSON only.
 * Set window.REALMEYE_LIVE_API_BASE (Vercel origin, no trailing slash). There is no local snapshot fallback.
 * Username: user enters in the panel; last choice is stored in localStorage. Optional prefill:
 * REALMEYE_SET_CHECKER_PLAYER (page default).
 *
 * Triggers: buttons with class `set-checker-trigger` and `data-bis-root` pointing to the build article id.
 * Each BiS enchant `<li>` may set `data-bis-equipment-slot` (weapon|ability|armor|ring) and `data-bis-omit-if-no-match`.
 */
(function () {
  "use strict";

  const BACKPACK_SLUG = "backpack-extender";

  const LS_USERNAME_KEY = "realmeye_set_checker_username";

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

  function usernamePrefill() {
    try {
      const s = localStorage.getItem(LS_USERNAME_KEY);
      if (s != null && String(s).trim()) {
        return String(s).trim();
      }
    } catch (_) {
      /* ignore */
    }
    const v =
      typeof window.REALMEYE_SET_CHECKER_PLAYER === "string" ? window.REALMEYE_SET_CHECKER_PLAYER.trim() : "";
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
    "percent mana regen iv": (p) => /percentage\s*mana\s*regeneration/i.test(p),
    "avalon's intellect": (p) => /avalon/.test(p) && /intellect/i.test(p),
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
   * @param {HTMLLIElement} li
   * @returns {{ slugs: string[], tokens: string[], omitIfNoMatch: boolean, equipmentSlotIndex: number | null }}
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
    return {
      slugs: [...new Set(slugs)],
      tokens,
      omitIfNoMatch: parseOmitIfNoMatch(li),
      equipmentSlotIndex: parseEquipmentSlotIndex(li),
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
      const { row, equipped, tokenResults, itemMismatch } = block;
      const slugLabel = row.slugs.join(" / ");
      const rowSectionClass = itemMismatch
        ? "set-checker-row set-checker-row--mismatch"
        : "set-checker-row";
      if (itemMismatch) {
        parts.push(`<section class="${rowSectionClass}">`);
        parts.push(`<h3 class="set-checker-row-title">BiS: ${escapeHtml(slugLabel)}</h3>`);
        parts.push(
          `<p class="set-checker-equipped-wrong"><span class="set-checker-mark" aria-hidden="true">✗</span> <strong>Equipped (RealmEye):</strong> ${escapeHtml(
            equipped.title || equipped.wiki_slug || "—"
          )}</p>`
        );
      } else {
        parts.push(`<section class="${rowSectionClass}"><h3 class="set-checker-row-title">${escapeHtml(
          equipped.title || slugLabel
        )}</h3>`);
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
  function renderRoguePicker(mount, rogues, bisRootId, liveUsername) {
    const root = document.getElementById(bisRootId);
    const rows = parseBisRowsFromRoot(root);
    const banner = sourceBannerHtml(liveUsername);
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
      renderCompare(wrap, rogues[0], compareCharacterToBis(rogues[0], rows));
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
      `<div class="set-checker-picker"><label class="set-checker-label"><span class="set-checker-label-text">Rogue</span> <select class="set-checker-select" aria-label="Choose rogue">${opts}</select></label><button type="button" class="set-checker-primary set-checker-run">Compare</button></div><div class="set-checker-results"></div>`;
    const sel = mount.querySelector("select.set-checker-select");
    const run = mount.querySelector("button.set-checker-run");
    const res = mount.querySelector(".set-checker-results");
    function runSelected() {
      const ch = rogues[Number(/** @type {HTMLSelectElement} */ (sel).value)];
      if (ch && res) {
        renderCompare(res, ch, compareCharacterToBis(ch, rows));
      }
    }
    run.addEventListener("click", runSelected);
    sel.addEventListener("change", runSelected);
    runSelected();
  }

  function init() {
    const shell = document.getElementById("vit-set-checker-shell");
    const panel = document.getElementById("vit-set-checker-panel");
    const mount = document.getElementById("vit-set-checker-mount");
    const refreshBtn = document.getElementById("vit-set-checker-refresh");
    const triggers = document.querySelectorAll("button.set-checker-trigger[data-bis-root]");
    const titleEl = document.getElementById("vit-set-checker-title");
    if (!shell || !panel || !mount || triggers.length === 0) {
      return;
    }

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
      currentLiveUsername = "";
      const safeVal = escapeHtml(usernamePrefill());
      mount.innerHTML =
        `<div class="set-checker-username-step"><div class="set-checker-username-row">` +
        `<label class="set-checker-label" for="set-checker-username-input"><span class="set-checker-label-text">RealmEye username</span></label> ` +
        `<input type="text" id="set-checker-username-input" name="realmeye_username" class="set-checker-input" autocomplete="username" value="${safeVal}" aria-required="true" spellcheck="false">` +
        `</div>` +
        `<p id="set-checker-username-error" class="set-checker-bad set-checker-username-error" hidden role="alert"></p>` +
        `<button type="button" class="set-checker-primary set-checker-load-player">Load RealmEye data</button></div>`;
      const inp = /** @type {HTMLInputElement | null} */ (mount.querySelector("#set-checker-username-input"));
      const btn = mount.querySelector(".set-checker-load-player");
      const errEl = mount.querySelector("#set-checker-username-error");
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
      mount.innerHTML = "<p class=\"set-checker-loading\">Fetching live RealmEye data…</p>";
      try {
        const meta = await loadPlayerData(name);
        if (gen !== loadGeneration) {
          return;
        }
        try {
          localStorage.setItem(LS_USERNAME_KEY, name);
        } catch (_) {
          /* ignore */
        }
        currentLiveUsername = name;
        const rogues = roguesFromPayload(meta.data);
        renderRoguePicker(mount, rogues, bisRootId, name);
      } catch (err) {
        if (gen !== loadGeneration) {
          return;
        }
        const msg = escapeHtml(String(/** @type {Error} */ (err).message || err));
        const baseForHint = getLiveApiBase();
        const detailHint = baseForHint
          ? `<p class="set-checker-hint">Request URL: <code>${escapeHtml(
              `${baseForHint}/api/main?username=${encodeURIComponent(name)}`
            )}</code>. On Vercel, set <code>CORS_ORIGIN</code> to <code>https://&lt;your-github-user&gt;.github.io</code> (GitHub project pages use that origin only—no <code>/repo</code> path), use <code>*</code>, or a comma-separated list (e.g. GitHub Pages + Vercel preview). Open the URL above in a new tab to confirm the API.</p>`
          : `<p class="set-checker-hint">Set <code>window.REALMEYE_LIVE_API_BASE</code> in this page to your Vercel API origin (HTTPS, no path). See <code>classes/rogue.html</code>.</p>`;
        mount.innerHTML = `<p class="set-checker-source set-checker-source--warn"><strong>Not fetching live data.</strong> The set checker only uses the live API—no offline snapshot.</p><p class="set-checker-bad">Could not load player data.</p><p class="set-checker-hint">${msg}</p>${detailHint}`;
      }
    }

    const closeEls = shell.querySelectorAll(".set-checker-close, .set-checker-icon-close");
    for (const el of closeEls) {
      el.addEventListener("click", () => closeShell());
    }

    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        if (currentLiveUsername) {
          void runLoad(currentLiveUsername);
        }
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
        openShell();
        renderUsernameStep();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
