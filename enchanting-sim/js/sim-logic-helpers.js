// sim-logic-helpers.js — load after sim-globals.js + path-sim-core.js
function normalizeName(s) {
  return PathSimCore.normalizeName(s);
}
function awakenBaseDisplayName(normalizedBaseName) {
  const norm = normalizeName(normalizedBaseName);
  for (const key of Object.keys(AWAKEN_ITEM_TYPE || {})) {
    if (normalizeName(key) === norm) return key;
  }
  return normalizedBaseName;
}
function nameMultiplierLookup(dict, enchantName) {
  if (!dict) return null;
  const direct = dict[enchantName]; if (typeof direct === 'number') return direct;
  const nTarget = normalizeName(enchantName);
  for (const [k, v] of Object.entries(dict)) { if (normalizeName(k) === nTarget) return v; }
  return null;
}
function prettyStat(s) { return s.charAt(0) + s.slice(1).toLowerCase(); }
function parseTargetList(raw) {
  const seen = new Set();
  const targetNames = [];
  for (const part of String(raw || '').split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const norm = normalizeName(trimmed);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    targetNames.push(trimmed);
  }
  return {
    targetNames,
    targetNorms: new Set(targetNames.map(normalizeName))
  };
}
/** Tier I/II (Roman suffix after space). Path simulation disallows these targets. */
function isPathSimDisallowedTierName(name) {
  if (typeof name !== 'string') return false;
  return /(?:^| )(?:II|I)$/.test(name.trim());
}
function getTargetDisplayLabel(targetNames) {
  return (targetNames || []).join(', ');
}
/** Short label for enchant-simulation UI only (path-phase selects, compare table, path summaries): strips leading "The " from `The … Tarot Card` names. Main artifact picker keeps full names + dust. */
function shortArtifactDisplayLabel(name) {
  const n = String(name || '').trim();
  if (!n) return n;
  if (/^the .+tarot card$/i.test(n)) return n.replace(/^the /i, '');
  return n;
}
/** RealmEye-style stat names for `{gain} -{loss} Tradeoff {tier}` (alphabetical). */
const STAT_TRADEOFF_STATS = ['Attack', 'Defense', 'Dexterity', 'Life', 'Mana', 'Speed', 'Vitality', 'Wisdom'];
function statTradeoffMinusStatsForGain(gainStat) {
  return STAT_TRADEOFF_STATS.filter(s => s !== gainStat);
}
function statTradeoffEnchantName(gainLabel, lossLabel, tierRoman) {
  return `${gainLabel} -${lossLabel} Tradeoff ${tierRoman}`;
}
let statTradeoffAltTailHintRe = null;
function statTradeoffAltTailHintRegex() {
  if (!statTradeoffAltTailHintRe) {
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    statTradeoffAltTailHintRe = new RegExp(
      `^(${STAT_TRADEOFF_STATS.map(esc).join('|')})\\s*-\\s*`,
      'i'
    );
  }
  return statTradeoffAltTailHintRe;
}
/** Tail after last comma — same rule as alternate-row autocomplete. */
function getAlternateInputTailForHint(raw) {
  const full = String(raw || '');
  const commaIndex = full.lastIndexOf(',');
  const tail = commaIndex >= 0 ? full.slice(commaIndex + 1).trim() : full.trim();
  return tail;
}
function alternateRowHintsStatTradeoff(raw) {
  const tail = getAlternateInputTailForHint(raw);
  if (!tail) return false;
  return statTradeoffAltTailHintRegex().test(tail);
}
function syncPathStatTradeoffDisclosure() {
  const disclosure = document.getElementById('path-stat-tradeoff-disclosure');
  if (!disclosure) return;
  const container = document.getElementById('path-phase-2-alts');
  let expand = false;
  if (container) {
    container.querySelectorAll('.path-phase-2-alt-input').forEach(inp => {
      if (alternateRowHintsStatTradeoff(inp.value)) expand = true;
    });
  }
  disclosure.open = expand;
}
/** Max alternate rows for path phase 2 (`path-phase-2-alt-*`). */
const PATH_PHASE_2_ALT_MAX = 12;
/**
 * True when phase 2 lists more than one OR target ({@link collectPathPhase2FromDom} / restore state semantics).
 * Matches `displayNames.length > 1` in `buildPathPhasesFromInputs` before duplicate validation.
 */
function pathPhase2MultiOrTargets(p2) {
  const anchor = ((p2 && p2.anchor) || '').trim();
  const alts = ((p2 && p2.alts) || []).map(a => String(a).trim()).filter(Boolean);
  const asymmetric = !!anchor;
  const displayNames = asymmetric ? [anchor, ...alts] : alts;
  return displayNames.length > 1;
}
const monteCarloPoolBaseCache = new Map();
function clearMonteCarloPoolBaseCache() {
  monteCarloPoolBaseCache.clear();
}

function resolveAwakenedEnchantDisplayName(baseTrimmed) {
  const chosenNorm = normalizeName(baseTrimmed);
  if (!chosenNorm || !ENCHANTS.length) return null;
  const matches = [];
  for (const [awakenNorm, bases] of Object.entries(AWAKENING_MAP)) {
    if ((bases || []).some(b => b === chosenNorm)) matches.push(awakenNorm);
  }
  if (!matches.length) return null;
  let awakenNorm = matches[0];
  if (matches.length > 1) {
    const sorted = [...matches].sort((a, b) => {
      const na = ENCHANTS.find(x => normalizeName(x.name) === a)?.name || a;
      const nb = ENCHANTS.find(x => normalizeName(x.name) === b)?.name || b;
      return na.localeCompare(nb);
    });
    awakenNorm = sorted[0];
  }
  const e = ENCHANTS.find(x => normalizeName(x.name) === awakenNorm);
  return e ? e.name : null;
}
function updateFillAwakenedEnchantButton() {
  const btn = document.getElementById('fillAwakenedEnchantBtn');
  const chk = document.getElementById('canAwaken');
  const box = document.getElementById('awakenItem');
  if (!btn || !chk || !box) return;
  if (!chk.checked) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = 'inline-block';
  const base = (box.value || '').trim();
  const resolved = base ? resolveAwakenedEnchantDisplayName(base) : null;
  btn.disabled = !resolved;
}

/* ========================== Init ========================== */
function resolveDataUrl(fileName) {
  const base = String(window.__ENCHANT_SIM_DATA_BASE__ || "").replace(/\/+$/, "");
  return base ? `${base}/${fileName}` : fileName;
}

function resolveEnchantIconUrl(fileName) {
  const path = String(window.location.pathname || "");
  const inSimDir = /\/enchanting-sim(\/|$)/i.test(path);
  return (inSimDir ? "../icons/" : "icons/") + fileName;
}

/** Uppercase enchant labels (matches normalizeAllData). */
function enchantLabelsUpper(labels) {
  return (labels || []).map(l => String(l).toUpperCase());
}

function someLabel(labelsUpper, pred) {
  for (const lab of labelsUpper) {
    if (pred(lab)) return true;
  }
  return false;
}

/** Returns 1–4 from TIER1…TIER4 on labels, or null if absent. */
function tierFromEnchantLabels(labelsUpper) {
  for (const lab of labelsUpper) {
    if (lab === 'TIER1') return 1;
    if (lab === 'TIER2') return 2;
    if (lab === 'TIER3') return 3;
    if (lab === 'TIER4') return 4;
  }
  return null;
}

/** Folder basename under icons/enchantments/<stem>/tierN.png (matches extracted assets). */
function resolveEnchantTieredRel(folderStem, labelsUpper) {
  const t = tierFromEnchantLabels(labelsUpper) ?? 1;
  return `enchantments/${folderStem}/tier${t}.png`;
}

/**
 * Relative path under icons/ for awakened enchants (enchantments/awakened/<slug>.png).
 * Slug matches `icons/enchantments/awakened/` filenames: strip apostrophes, kebab-case.
 */
function awakenedEnchantIconRel(displayName) {
  let s = String(displayName || "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!s) return null;
  const slug = s.replace(/\s+/g, "-");
  return `enchantments/awakened/${slug}.png`;
}

/**
 * Map enchant labels to icons under icons/ (first matching rule wins).
 * Returns relative path e.g. enchantments/on-enchant/tier2.png, or null for ? placeholder.
 * @param {string[]|null} labels
 * @param {string} [enchantDisplayName] — required for AWAKENED icons
 */
function resolveEnchantIconFile(labels, enchantDisplayName) {
  const L = enchantLabelsUpper(labels);

  if (someLabel(L, l => l === 'AWAKENED')) return awakenedEnchantIconRel(enchantDisplayName);

  if (someLabel(L, l => l === 'UNIQUE' || l.endsWith('UNIQUE'))) {
    return 'enchantments/unique-enchant.png';
  }

  if (someLabel(L, l => l === 'ONABILITY' || l.startsWith('ONABILITY'))) {
    return resolveEnchantTieredRel('on-enchant', L);
  }
  if (someLabel(L, l => l === 'ONSHOOT' || l.startsWith('ONSHOOT'))) {
    return resolveEnchantTieredRel('on-enchant', L);
  }
  if (someLabel(L, l => l === 'ONHIT' || l.startsWith('ONHIT'))) {
    return resolveEnchantTieredRel('on-enchant', L);
  }

  if (someLabel(L, l => l === 'SINGLESTAT')) {
    return resolveEnchantTieredRel('single-stat-enchant', L);
  }
  if (someLabel(L, l => l === 'DUALSTAT')) {
    return resolveEnchantTieredRel('dual-stat-enchant', L);
  }

  if (someLabel(L, l => l === 'LIFEREGEN' || l.includes('LIFEREGEN'))) {
    return resolveEnchantTieredRel('life-regen-enchant', L);
  }
  if (someLabel(L, l => l === 'MANAREGEN' || l.includes('MANAREGEN'))) {
    return resolveEnchantTieredRel('mana-regen-enchant', L);
  }

  if (someLabel(L, l => l.includes('WEAPONRANGE'))) {
    return resolveEnchantTieredRel('range-wep-enchant', L);
  }
  if (someLabel(L, l => l === 'WEAPON' || l.includes('WEAPONDAMAGE') || l.includes('WEAPONFIRERATE'))) {
    return resolveEnchantTieredRel('melee-wep-enchant', L);
  }

  if (someLabel(L, l => l.includes('DAMAGERESISTANCE'))) {
    return resolveEnchantTieredRel('dmg-res-enchant', L);
  }

  if (someLabel(L, l => l.includes('CASTING'))) {
    return resolveEnchantTieredRel('ability-enchant', L);
  }

  if (someLabel(L, l => l === 'RING')) return resolveEnchantTieredRel('ring-enchant', L);

  if (someLabel(L, l => l === 'REWARD' || l.includes('REWARDBONUS'))) {
    return resolveEnchantTieredRel('reward-enchant', L);
  }

  return null;
}

function escapeEnchantHtml(s) {
  return String(s || "")
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildEnchantTitleRow(name, labels) {
  const safeName = escapeEnchantHtml(name);
  const iconRel = resolveEnchantIconFile(labels, name);
  if (iconRel) {
    const src = resolveEnchantIconUrl(iconRel);
    return (
      '<span class="slot__title-row">' +
      `<img class="slot__enchant-icon" src="${escapeEnchantHtml(src)}" alt="" width="32" height="32" decoding="async" loading="lazy" />` +
      `<span class="slot__title">${safeName}</span>` +
      '</span>'
    );
  }
  return (
    '<span class="slot__title-row">' +
    '<span class="slot__icon-placeholder" aria-hidden="true">?</span>' +
    `<span class="slot__title">${safeName}</span>` +
    '</span>'
  );
}

function syncLockToggleVisual(lockBtn) {
  const img = lockBtn.querySelector("img");
  if (!img) return;
  const locked = lockBtn.classList.contains("locked");
  img.src = resolveEnchantIconUrl(locked ? "lock.png" : "unlock.png");
  img.alt = locked ? "Slot locked" : "Slot unlocked";
  lockBtn.setAttribute("aria-pressed", locked ? "true" : "false");
}

/** Lock control for slot cells. When disabled, stays on unlock visually (inactive grid cell). */
function makeLockToggleButton(disabled) {
  const lock = document.createElement('button');
  lock.type = 'button';
  lock.className = 'lock-toggle';
  const lockImg = document.createElement('img');
  lock.appendChild(lockImg);
  if (disabled) {
    lock.disabled = true;
    lock.setAttribute('aria-disabled', 'true');
    lock.setAttribute('aria-label', 'Inactive slot');
    lockImg.src = resolveEnchantIconUrl('unlock.png');
    lockImg.alt = 'Slot unlocked (inactive)';
    lock.removeAttribute('aria-pressed');
  } else {
    lock.setAttribute('aria-label', 'Toggle slot lock');
    syncLockToggleVisual(lock);
    lock.onclick = () => {
      lock.classList.toggle('locked');
      syncLockToggleVisual(lock);
    };
  }
  return lock;
}

function setEnchantSlotEmpty(slotBodyEl) {
  slotBodyEl.innerHTML =
    '<span class="slot__title-row slot__title-row--empty"><span class="slot__title">Empty Slot</span></span>';
}

function setEnchantSlotContent(slotBodyEl, name, description, enchantOrLabels) {
  const labels =
    enchantOrLabels && Array.isArray(enchantOrLabels.labels) ?
      enchantOrLabels.labels
      : Array.isArray(enchantOrLabels) ?
        enchantOrLabels
        : null;
  const desc =
    description != null && String(description).trim() !== ''
      ? `<span class="slot__desc muted">${escapeEnchantHtml(description)}</span>`
      : '';
  const titleRow = buildEnchantTitleRow(name, labels);
  slotBodyEl.innerHTML = `${titleRow}${desc}`;
}
