/**
 * Optional helper: loads `data/weapon-stats.json` relative to this file (`../data/`).
 * Class pages normally use logic inside `classes/set-checker.js`; include this script when you want the same lookups elsewhere.
 *
 * Calls `loadWeaponStats()` once — then sync `getWeaponShots(slug)` returns Ammmar `{ damage, rof }[]` rows or null.
 */
(function () {
  "use strict";

  /** @type {null | object} */
  let bundle = null;
  /** @type {Promise<object> | null} */
  let loadPromise = null;

  function statsJsonHref() {
    const cur =
      typeof document !== "undefined" &&
      /** @type {HTMLScriptElement | null} */ (document.currentScript) &&
      document.currentScript.src
        ? String(document.currentScript.src)
        : "";
    if (!cur) {
      return "";
    }
    return new URL("../data/weapon-stats.json", cur).href;
  }

  async function loadWeaponStats() {
    if (bundle) {
      return bundle;
    }
    if (!loadPromise) {
      const href = statsJsonHref() || new URL("data/weapon-stats.json", window.location.href).href;
      loadPromise = fetch(href, { cache: "force-cache", mode: "cors" })
        .then((r) => (r.ok ? r.json() : {}))
        .then((json) => {
          bundle = json && typeof json === "object" ? json : {};
          return bundle;
        })
        .catch(() => {
          bundle = {};
          return bundle;
        });
    }
    return loadPromise;
  }

  /** @returns {{ damage: number; rof: number }[] | null} */
  function getWeaponShots(/** @type {string} */ slug) {
    if (!slug || !bundle) {
      return null;
    }
    const weapons = /** @type {Record<string, { shots?: unknown }>} */ (
      bundle.weapons !== undefined ? bundle.weapons : {}
    );
    const w = weapons[slug];
    if (!w || !Array.isArray(w.shots) || w.shots.length === 0) {
      return null;
    }
    return w.shots.map((/** @type {{ damage: number; rof: number }} */ s) => ({
      damage: Number(s.damage),
      rof: Number(s.rof),
    }));
  }

  function slugFromWikiUrl(/** @type {string} */ url) {
    const m = String(url || "").match(/realmeye\.com\/wiki\/([^?#]+)/i);
    return m ? decodeURIComponent(m[1]) : null;
  }

  window.loadWeaponStats = loadWeaponStats;

  void loadWeaponStats().then(() => {
    window.getWeaponShots = getWeaponShots;
    window.slugFromWikiUrl = slugFromWikiUrl;
  });
})();
