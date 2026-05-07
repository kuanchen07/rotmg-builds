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

/* ========================== Loaders & Normalizers ========================== */
async function loadEnchantments() {
  try {
    const r = await fetch(resolveDataUrl('enchants.json')); if (!r.ok) throw new Error('enchants.json load failed');
    ENCHANTS = await r.json();
  } catch (e) { console.error(e); document.getElementById('eligibilityText').textContent = '⚠ Could not load enchants.json.'; }
}
async function loadAugments() {
  try {
    const [aRes, eRes] = await Promise.all([
      fetch(resolveDataUrl('artifacts.json')),
      fetch(resolveDataUrl('engravings.json'))
    ]);
    const artifacts = await aRes.json();
    const engravings = await eRes.json();
    AUGMENTS = INCLUDE_ENGRAVINGS_IN_UI ? [...artifacts, ...engravings] : [...artifacts];
    AUGMENTS_BY_NAME = {}; AUGMENTS.forEach(x => AUGMENTS_BY_NAME[x.name] = x);
    window.__RAW_ARTS = artifacts; window.__RAW_ENVS = engravings;
  } catch (e) { console.error(e); AUGMENTS = []; AUGMENTS_BY_NAME = {}; }
}
function normalizeAllData() {
  const up = a => (a || []).map(x => String(x).toUpperCase());
  ENCHANTS = ENCHANTS.map(e => ({
    ...e,
    name: String(e.name || '').trim(),
    description: String(e.description || ''),
    weight: Number(e.weight) || 0,
    itemLabels: up(e.itemLabels),
    incompatItemLabels: up(e.incompatItemLabels),
    labels: up(e.labels),
    incompatLabels: up(e.incompatLabels),
    rollable: !!e.rollable,
    requiresEngraving: !!e.requiresEngraving
  }));
  const normMult = obj => { if (!obj) return {}; const o = {}; for (const [k, v] of Object.entries(obj)) { o[String(k).toUpperCase()] = v; } return o; };
  AUGMENTS = AUGMENTS.map(a => ({
    ...a,
    category: String(a.category || '').toLowerCase(),
    cost: Number(a.cost || 0),
    multipliers: normMult(a.multipliers),
    unique: a.unique || {},
    awakened: a.awakened || {},
    uniqueMultiplier: a.uniqueMultiplier || null,
    awakenedMultiplier: a.awakenedMultiplier || null,
    minTier: (a.minTier == null ? null : Number(a.minTier)),
    guaranteedMods: a.guaranteedMods || []
  }));
  AUGMENTS_BY_NAME = {}; AUGMENTS.forEach(x => AUGMENTS_BY_NAME[x.name] = x);
  clearMonteCarloPoolBaseCache();
}

/* ========================== UI: Awakenable items ========================== */
function buildAwakenList() {
  const set = new Set();
  for (const arr of Object.values(AWAKENING_MAP)) { (arr || []).forEach(n => set.add(awakenBaseDisplayName(n))); }
  AWAKENABLE_ITEMS = Array.from(set).sort();
  const chk = document.getElementById('canAwaken');
  const box = document.getElementById('awakenItem');
  const fillAwakenBtn = document.getElementById('fillAwakenedEnchantBtn');
  chk.onchange = () => {
    if (chk.checked) { box.style.display = 'block'; }
    else { box.style.display = 'none'; box.value = ''; chosenAwakenItem = ''; }
    updateFillAwakenedEnchantButton();
    clearMonteCarloPoolBaseCache();
    refreshEligibility(); enforceLockValidity(); updateWeightDebug();
  };
  box.addEventListener('input', () => {
    chosenAwakenItem = box.value.trim();
    updateFillAwakenedEnchantButton();
    clearMonteCarloPoolBaseCache();
    const canonicalBaseName = Object.keys(AWAKEN_ITEM_TYPE).find(
      k => normalizeName(k) === normalizeName(chosenAwakenItem)
    ) || chosenAwakenItem;
    const type = AWAKEN_ITEM_TYPE[canonicalBaseName];
    if (type) {
      const sel = document.getElementById('itemType');
      if (sel.value !== type) { sel.value = type; sel.dispatchEvent(new Event('change')); return; }
    }
    refreshEligibility(); enforceLockValidity(); updateWeightDebug();
  });
  if (fillAwakenBtn) {
    fillAwakenBtn.onclick = () => {
      const target = document.getElementById('path-phase-1');
      const name = resolveAwakenedEnchantDisplayName((box.value || '').trim());
      if (!target || !name) return;
      target.value = name;
      target.dispatchEvent(new Event('input', { bubbles: true }));
    };
  }
  updateFillAwakenedEnchantButton();
}

/* ========================== UI: Slots ========================== */
function renderSlotButtons() {
  const div = document.getElementById('slotSelector'); div.innerHTML = '';
  const setActive = (btn, slots) => {
    document.querySelectorAll('.slot-btn').forEach(x => {
      x.classList.remove('active');
      x.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    selectedSlots = slots;
    renderSlots();
    renderPathPhaseUI();
    refreshEligibility();
    enforceLockValidity();
    updateWeightDebug();
  };
  for (let i = 1; i <= 4; i++) {
    const b = document.createElement('div');
    b.className = `slot-btn slot-btn--slots-${i}`;
    b.setAttribute('role', 'button');
    b.tabIndex = 0;
    b.dataset.slots = String(i);
    b.setAttribute('aria-label', `${i} slot${i === 1 ? '' : 's'}`);
    b.setAttribute('aria-pressed', 'false');
    const crystal = document.createElement('span');
    crystal.className = 'slot-btn__face';
    crystal.setAttribute('aria-hidden', 'true');
    const count = document.createElement('span');
    count.className = 'slot-btn__count';
    count.textContent = String(i);
    b.appendChild(crystal);
    b.appendChild(count);
    b.onclick = () => setActive(b, i);
    b.onkeydown = (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        setActive(b, i);
      }
    };
    div.appendChild(b);
  }
  const first = div.querySelector('[data-slots="1"]');
  if (first) setActive(first, 1);
}
function renderSlots() {
  const c = document.getElementById('slotsContainer'); c.innerHTML = '';
  currentEnchantments = [];
  for (let position = 1; position <= ENCHANT_SLOT_GRID_COUNT; position++) {
    const d = document.createElement('div');
    d.className = 'slot slot--grid-' + position;
    const active = position <= selectedSlots;
    const info = document.createElement('div');

    const lockToggle = makeLockToggleButton(!active);

    if (!active) {
      d.classList.add('slot--placeholder');
      info.className = 'slot__body';
      info.innerHTML = '<span class="slot__title-row slot__title-row--inactive"><span class="slot__title muted">—</span></span>';
    } else {
      info.className = 'slot__body';
      setEnchantSlotEmpty(info);
      currentEnchantments.push({ enchant: null, element: info, lockBtn: lockToggle });
    }

    d.appendChild(lockToggle);
    d.appendChild(info);
    c.appendChild(d);
  }
}
function readPathPhaseValues() {
  const ids = [
    'path-phase-1',
    'path-phase-2-anchor',
    'path-phase-2-or',
    'path-phase-2a',
    'path-phase-2b',
    'path-phase-3',
    'path-phase-4'
  ];
  const out = {};
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) out[id] = el.value;
  }
  for (let i = 0; i < PATH_PHASE_2_ALT_MAX; i++) {
    const el = document.getElementById(`path-phase-2-alt-${i}`);
    if (el) out[`path-phase-2-alt-${i}`] = el.value;
  }
  return out;
}
function getRestoredPhase2OrValue(prev) {
  const combined = (prev['path-phase-2-or'] || '').trim();
  if (combined) return prev['path-phase-2-or'];
  const a = (prev['path-phase-2a'] || '').trim();
  const b = (prev['path-phase-2b'] || '').trim();
  if (a && b) return `${a}, ${b}`;
  if (a) return a;
  if (b) return b;
  return '';
}
function getPhase2RestoreState(prev) {
  let anchor = (prev['path-phase-2-anchor'] || '').trim();
  const alts = [];
  for (let i = 0; i < PATH_PHASE_2_ALT_MAX; i++) {
    const v = (prev[`path-phase-2-alt-${i}`] || '').trim();
    if (v) alts.push(v);
  }
  if (!anchor && alts.length === 0) {
    const legacy = getRestoredPhase2OrValue(prev);
    if (legacy) {
      const p = parseTargetList(legacy);
      if (p.targetNames.length >= 2) {
        return { anchor: '', alts: [...p.targetNames] };
      }
    }
    const a = (prev['path-phase-2a'] || '').trim();
    const b = (prev['path-phase-2b'] || '').trim();
    if (a && b) return { anchor: '', alts: [a, b] };
  }
  return { anchor, alts };
}
function renderPathPhase2AltRowsContent(container, values) {
  const n = Math.max(1, values.length);
  container.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const row = document.createElement('div');
    row.className = 'path-phase-2-alt-row';
    const lbl = document.createElement('label');
    lbl.className = 'path-phase-2-alt-label';
    lbl.setAttribute('for', `path-phase-2-alt-${i}`);
    lbl.textContent = i === 0 ? 'Alternate' : `Alternate ${i + 1}`;
    const inpWrap = document.createElement('div');
    inpWrap.className = 'target-enchant-wrap path-phase-2-alt-wrap';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.id = `path-phase-2-alt-${i}`;
    inp.className = 'path-phase-input path-phase-2-alt-input';
    inp.placeholder = 'OR option';
    inp.value = values[i] || '';
    inpWrap.appendChild(inp);
    row.appendChild(lbl);
    row.appendChild(inpWrap);
    if (n > 1) {
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'small path-phase-2-alt-remove';
      rm.textContent = 'Remove';
      const removeIndex = i;
      rm.onclick = () => {
        const c = document.getElementById('path-phase-2-alts');
        if (!c) return;
        const v = [...c.querySelectorAll('.path-phase-2-alt-input')].map(x => x.value.trim());
        v.splice(removeIndex, 1);
        renderPathPhase2AltRowsContent(c, v.length ? v : ['']);
        updatePathStatTradeoffPickerUI();
      };
      row.appendChild(rm);
    }
    container.appendChild(row);
    if (typeof window.initEnchantTargetAutocomplete === 'function') {
      window.initEnchantTargetAutocomplete(inp, { excludePathSimTier12: true });
    }
  }
  syncPathStatTradeoffDisclosure();
}
function collectPathPhase2FromDom() {
  const anchor = (document.getElementById('path-phase-2-anchor')?.value || '').trim();
  const alts = [];
  const container = document.getElementById('path-phase-2-alts');
  if (container) {
    container.querySelectorAll('.path-phase-2-alt-input').forEach(inp => {
      const t = inp.value.trim();
      if (t) alts.push(t);
    });
  }
  return { anchor, alts };
}
function createPathStep(stepper, stepNum, { title }, contentFn) {
  const step = document.createElement('div');
  step.className = 'path-step';
  const track = document.createElement('div');
  track.className = 'path-step__track';
  const pill = document.createElement('div');
  pill.className = 'path-step__pill';
  pill.textContent = String(stepNum);
  track.appendChild(pill);
  const body = document.createElement('div');
  body.className = 'path-step__body';
  if (title) {
    const h = document.createElement('div');
    h.className = 'path-step__heading';
    h.textContent = title;
    body.appendChild(h);
  }
  contentFn(body);
  step.appendChild(track);
  step.appendChild(body);
  stepper.appendChild(step);
}
function formatOrdinal(n) {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}
function rebuildStatTradeoffMinusCheckboxGrid(cbWrapEl, gainStat) {
  cbWrapEl.innerHTML = '';
  const onCbChange = () => {
    const feedbackEl = document.getElementById('path-stat-tradeoff-apply-feedback');
    if (feedbackEl) feedbackEl.textContent = '';
    updatePathStatTradeoffPickerUI();
  };
  for (const stat of statTradeoffMinusStatsForGain(gainStat)) {
    const lab = document.createElement('label');
    lab.className = 'path-stat-tradeoff-cb';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.tradeoffMinus = stat;
    cb.addEventListener('change', onCbChange);
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(`−${stat}`));
    cbWrapEl.appendChild(lab);
  }
}
function computeStatTradeoffPickerSelectionForTier(tierRoman) {
  const it = document.getElementById('itemType')?.value;
  const mount = document.getElementById('path-stat-tradeoff-picker');
  const gainStat = document.getElementById('path-stat-tradeoff-plus')?.value;
  if (!it || !mount || !gainStat) {
    return { appliedNames: [], skippedParts: [], checkedStats: [] };
  }
  const pool = eligiblePool(it);
  const poolNorms = new Set(pool.map(e => normalizeName(e.name)));
  const checkboxes = mount.querySelectorAll('input[type="checkbox"][data-tradeoff-minus]');
  const checkedStats = [];
  checkboxes.forEach(cb => {
    if (cb.checked) checkedStats.push(cb.dataset.tradeoffMinus);
  });
  checkedStats.sort();
  const appliedNames = [];
  const skippedParts = [];
  for (const loseStat of checkedStats) {
    const rawName = statTradeoffEnchantName(gainStat, loseStat, tierRoman);
    const match = ENCHANTS.find(e => normalizeName(e.name) === normalizeName(rawName));
    const canonical = match ? match.name : rawName;
    if (poolNorms.has(normalizeName(canonical))) {
      appliedNames.push(canonical);
    } else {
      const label = `−${loseStat}`;
      skippedParts.push(match ? `${label} (not in pool)` : `${label} (unknown)`);
    }
  }
  return { appliedNames, skippedParts, checkedStats };
}
function updatePathStatTradeoffPickerUI() {
  const mount = document.getElementById('path-stat-tradeoff-picker');
  if (!mount) return;
  const hintEl = document.getElementById('path-stat-tradeoff-picker-hint');
  const applyBtn = document.getElementById('path-stat-tradeoff-apply');
  const it = document.getElementById('itemType')?.value;
  const tier = document.getElementById('path-stat-tradeoff-tier')?.value || 'IV';
  if (!it) {
    if (applyBtn) applyBtn.disabled = true;
    if (hintEl) hintEl.textContent = 'Select an item type to use the quick picker.';
    return;
  }
  const { appliedNames, skippedParts, checkedStats } = computeStatTradeoffPickerSelectionForTier(tier);
  if (!checkedStats.length) {
    if (applyBtn) applyBtn.disabled = true;
    if (hintEl) hintEl.textContent = 'Check loss stats to preview; Apply fills alternate OR rows.';
    return;
  }
  if (!appliedNames.length) {
    if (applyBtn) applyBtn.disabled = true;
    if (hintEl) {
      hintEl.textContent = 'No matching enchants for the selected item type (and filters). Change item type or tier, or pick different stats.';
    }
    return;
  }
  if (applyBtn) applyBtn.disabled = false;
  if (hintEl) {
    if (skippedParts.length) {
      hintEl.textContent = `Ready: ${appliedNames.length} of ${checkedStats.length} in pool. Skipped: ${skippedParts.join(', ')}.`;
    } else {
      hintEl.textContent = `All ${appliedNames.length} selected pair(s) are in the pool.`;
    }
  }
}
function mountStatTradeoffPickerSection(mount) {
  const disclosure = document.createElement('details');
  disclosure.id = 'path-stat-tradeoff-disclosure';
  disclosure.className = 'path-stat-tradeoff-disclosure';

  const disclosureSummary = document.createElement('summary');
  disclosureSummary.className = 'path-stat-tradeoff-picker__summary';
  disclosureSummary.textContent = 'Quick pick: stat −stat tradeoff';

  const wrap = document.createElement('div');
  wrap.id = 'path-stat-tradeoff-picker';
  wrap.className = 'path-stat-tradeoff-picker';

  const tierRow = document.createElement('div');
  tierRow.className = 'path-stat-tradeoff-picker__tier';
  const tierLab = document.createElement('span');
  tierLab.textContent = 'Tier';
  const tierSel = document.createElement('select');
  tierSel.id = 'path-stat-tradeoff-tier';
  tierSel.className = 'path-stat-tradeoff-tier-select';
  for (const r of ['III', 'IV']) {
    const o = document.createElement('option');
    o.value = r;
    o.textContent = r;
    tierSel.appendChild(o);
  }
  tierSel.value = 'IV';

  const gainRow = document.createElement('div');
  gainRow.className = 'path-stat-tradeoff-picker__gain';
  const gainLab = document.createElement('span');
  gainLab.textContent = 'Gain';
  const gainSel = document.createElement('select');
  gainSel.id = 'path-stat-tradeoff-plus';
  gainSel.className = 'path-stat-tradeoff-plus-select';
  for (const s of STAT_TRADEOFF_STATS) {
    const o = document.createElement('option');
    o.value = s;
    o.textContent = s;
    gainSel.appendChild(o);
  }
  gainSel.value = 'Wisdom';

  const loseLab = document.createElement('div');
  loseLab.className = 'path-stat-tradeoff-lose-label';
  loseLab.textContent = 'Lose';

  const cbWrap = document.createElement('div');
  cbWrap.className = 'path-stat-tradeoff-stats';
  rebuildStatTradeoffMinusCheckboxGrid(cbWrap, gainSel.value);

  const clearStatTradeoffFeedback = () => {
    const feedbackEl = document.getElementById('path-stat-tradeoff-apply-feedback');
    if (feedbackEl) feedbackEl.textContent = '';
  };

  gainSel.addEventListener('change', () => {
    clearStatTradeoffFeedback();
    rebuildStatTradeoffMinusCheckboxGrid(cbWrap, gainSel.value);
    updatePathStatTradeoffPickerUI();
  });

  tierSel.addEventListener('change', () => {
    clearStatTradeoffFeedback();
    updatePathStatTradeoffPickerUI();
  });

  gainRow.appendChild(gainLab);
  gainRow.appendChild(gainSel);

  const appendRow = document.createElement('label');
  appendRow.className = 'path-stat-tradeoff-append';
  const appendCb = document.createElement('input');
  appendCb.type = 'checkbox';
  appendCb.id = 'path-stat-tradeoff-append';
  appendRow.appendChild(appendCb);
  appendRow.appendChild(document.createTextNode(' Append to alternates (keep existing rows; dedupe)'));

  const applyRow = document.createElement('div');
  applyRow.className = 'path-stat-tradeoff-apply-row';
  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.id = 'path-stat-tradeoff-apply';
  applyBtn.className = 'path-stat-tradeoff-apply-btn';
  applyBtn.textContent = 'Apply to alternates';
  applyBtn.onclick = () => {
    const tierNow = document.getElementById('path-stat-tradeoff-tier')?.value || 'IV';
    const { appliedNames, skippedParts, checkedStats } = computeStatTradeoffPickerSelectionForTier(tierNow);
    const container = document.getElementById('path-phase-2-alts');
    const feedbackEl = document.getElementById('path-stat-tradeoff-apply-feedback');
    const append = document.getElementById('path-stat-tradeoff-append')?.checked;
    if (!container || !appliedNames.length) return;
    let rows = [...appliedNames];
    if (append) {
      const existing = [...container.querySelectorAll('.path-phase-2-alt-input')]
        .map(x => x.value.trim())
        .filter(Boolean);
      const seen = new Set(existing.map(n => normalizeName(n)));
      for (const name of appliedNames) {
        const nn = normalizeName(name);
        if (!seen.has(nn)) {
          existing.push(name);
          seen.add(nn);
        }
      }
      rows = existing.length ? existing : [''];
    }
    renderPathPhase2AltRowsContent(container, rows);
    updatePathStatTradeoffPickerUI();
    let msg = '';
    if (skippedParts.length) {
      msg = `Applied ${appliedNames.length} of ${checkedStats.length} to alternates: skipped ${skippedParts.join(', ')}.`;
    } else {
      msg = `Applied ${appliedNames.length} enchant(s) to alternate rows.`;
    }
    const { anchor, alts } = collectPathPhase2FromDom();
    if (!anchor && !alts.length) {
      msg += ' Add at least one anchor or alternate for 2nd phase.';
    }
    if (feedbackEl) feedbackEl.textContent = msg;
  };

  const feedback = document.createElement('div');
  feedback.id = 'path-stat-tradeoff-apply-feedback';
  feedback.className = 'path-stat-tradeoff-apply-feedback';

  const hint = document.createElement('div');
  hint.id = 'path-stat-tradeoff-picker-hint';
  hint.className = 'path-stat-tradeoff-picker-hint';

  tierRow.appendChild(tierLab);
  tierRow.appendChild(tierSel);

  wrap.appendChild(tierRow);
  wrap.appendChild(gainRow);
  wrap.appendChild(loseLab);
  wrap.appendChild(cbWrap);
  wrap.appendChild(appendRow);
  applyRow.appendChild(applyBtn);
  wrap.appendChild(applyRow);
  wrap.appendChild(hint);
  wrap.appendChild(feedback);
  disclosure.appendChild(disclosureSummary);
  disclosure.appendChild(wrap);
  mount.appendChild(disclosure);
}
function renderPathPhaseUI() {
  const mount = document.getElementById('pathPhasesMount');
  if (!mount) return;
  const prev = readPathPhaseValues();
  mount.innerHTML = '';
  mount.className = 'path-row path-stepper';

  const p2 = getPhase2RestoreState(prev);
  let stepNum = 1;

  createPathStep(mount, stepNum, { title: '1st target' }, body => {
    const wrap = document.createElement('div');
    wrap.className = 'path-step__field path-step__field--flush';
    const w = document.createElement('div');
    w.className = 'target-enchant-wrap';
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'path-phase-1';
    input.className = 'path-phase-input';
    input.placeholder = 'Enchantment name';
    input.value = prev['path-phase-1'] || '';
    w.appendChild(input);
    wrap.appendChild(w);
    body.appendChild(wrap);
    if (typeof window.initEnchantTargetAutocomplete === 'function') {
      window.initEnchantTargetAutocomplete(input, { excludePathSimTier12: true });
    }
  });
  stepNum++;

  if (selectedSlots >= 2) {
    createPathStep(mount, stepNum, { title: '2nd target (OR pool)' }, body => {
      const ancBlock = document.createElement('div');
      ancBlock.className = 'path-phase-2-anchor-block';
      const ancLabel = document.createElement('label');
      ancLabel.className = 'path-phase-sublabel';
      ancLabel.setAttribute('for', 'path-phase-2-anchor');
      ancLabel.textContent = 'Anchor (optional)';
      const ancWrap = document.createElement('div');
      ancWrap.className = 'target-enchant-wrap';
      const ancInp = document.createElement('input');
      ancInp.type = 'text';
      ancInp.id = 'path-phase-2-anchor';
      ancInp.className = 'path-phase-input';
      ancInp.placeholder =
        'e.g. Relative Wisdom Bonus IV — locks in phase 3 if an alternate hits phase 2 first';
      ancInp.value = p2.anchor || '';
      ancWrap.appendChild(ancInp);
      ancBlock.appendChild(ancLabel);
      ancBlock.appendChild(ancWrap);
      body.appendChild(ancBlock);
      if (typeof window.initEnchantTargetAutocomplete === 'function') {
        window.initEnchantTargetAutocomplete(ancInp, { excludePathSimTier12: true });
      }

      const altDetails = document.createElement('details');
      altDetails.className = 'path-phase-2-alts-disclosure';

      const altSummary = document.createElement('summary');
      altSummary.className = 'path-phase-2-alts-summary';
      altSummary.textContent = 'Alternates (OR)';
      altDetails.appendChild(altSummary);

      const altInner = document.createElement('div');
      altInner.className = 'path-phase-2-alts-inner';

      const altContainer = document.createElement('div');
      altContainer.id = 'path-phase-2-alts';
      altContainer.className = 'path-phase-2-alts';
      const altVals = p2.alts.length ? p2.alts : [''];
      renderPathPhase2AltRowsContent(altContainer, altVals);
      altContainer.addEventListener('input', syncPathStatTradeoffDisclosure);
      altInner.appendChild(altContainer);

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'small path-phase-2-add-alt';
      addBtn.textContent = '+ Add alternate';
      addBtn.onclick = () => {
        const c = document.getElementById('path-phase-2-alts');
        if (!c) return;
        const v = [...c.querySelectorAll('.path-phase-2-alt-input')].map(x => x.value.trim());
        if (v.length >= PATH_PHASE_2_ALT_MAX) return;
        v.push('');
        renderPathPhase2AltRowsContent(c, v);
        updatePathStatTradeoffPickerUI();
      };
      altInner.appendChild(addBtn);
      altDetails.appendChild(altInner);
      body.appendChild(altDetails);

      mountStatTradeoffPickerSection(body);
      updatePathStatTradeoffPickerUI();
    });
    stepNum++;
  }

  if (selectedSlots === 3) {
    createPathStep(mount, stepNum, { title: '3rd target' }, body => {
      const badgeRow = document.createElement('div');
      badgeRow.className = 'path-step__auto-row';
      const badge = document.createElement('span');
      badge.className = 'path-step__badge-auto';
      badge.textContent = 'Auto';
      const desc = document.createElement('span');
      desc.className = 'path-hint path-step__auto-desc';
      desc.textContent =
        'After phase 2: either OR the remaining alternates, or anchor-only, depending on what locked first.';
      badgeRow.appendChild(badge);
      badgeRow.appendChild(desc);
      body.appendChild(badgeRow);
    });
    stepNum++;
  }

  if (selectedSlots >= 4) {
    for (let phase = 3; phase <= selectedSlots; phase++) {
      const ph = phase;
      createPathStep(mount, stepNum, { title: `${formatOrdinal(phase)} target` }, body => {
        const wrap = document.createElement('div');
        wrap.className = 'path-step__field path-step__field--flush';
        const w = document.createElement('div');
        w.className = 'target-enchant-wrap';
        const input = document.createElement('input');
        input.type = 'text';
        input.id = `path-phase-${ph}`;
        input.className = 'path-phase-input';
        input.placeholder = 'Type enchantment…';
        input.value = prev[`path-phase-${ph}`] || '';
        w.appendChild(input);
        wrap.appendChild(w);
        body.appendChild(wrap);
        if (typeof window.initEnchantTargetAutocomplete === 'function') {
          window.initEnchantTargetAutocomplete(input, { excludePathSimTier12: true });
        }
      });
      stepNum++;
    }
  }

  mount.querySelectorAll('.path-step').forEach((el, i, arr) => {
    if (i === arr.length - 1) el.classList.add('path-step--last');
  });
}
/* ========================== UI: Augment dropdown + info ========================== */
function populateAugmentDropdown() {
  const sel = document.getElementById('artifactCard'); sel.innerHTML = '';
  const none = document.createElement('option');
  none.value = 'None'; none.textContent = 'None (0 Dust)'; none.dataset.cost = 0; sel.appendChild(none);

  const artifacts = window.__RAW_ARTS || [];
  const engravings = window.__RAW_ENVS || [];
  const isTarot = x => /tarot/i.test(x.category || '') || /^the .*tarot card$/i.test(x.name || '');
  const isPremium = x => /premium/i.test(x.category || '') || /^premium /i.test(x.name || '');
  const isArtifact = x => (!isTarot(x) && !isPremium(x));

  const addGroup = (label, list) => {
    if (!list.length) return;
    const g = document.createElement('optgroup'); g.label = `— ${label} —`;
    list.forEach(a => {
      const o = document.createElement('option');
      o.value = a.name;
      const cost = Number(a.cost || 0);
      o.dataset.cost = cost;
      o.textContent = `${a.name} (${cost} Dust)`;
      g.appendChild(o);
    });
    sel.appendChild(g);
  };
  addGroup('Tarot Cards', artifacts.filter(isTarot));
  addGroup('Artifacts', artifacts.filter(isArtifact));
  addGroup('Premium Cards', artifacts.filter(isPremium));
  if (INCLUDE_ENGRAVINGS_IN_UI) addGroup('Engravings', engravings);

  sel.onchange = () => { updateAugmentInfo(); refreshEligibility(); enforceLockValidity(); updateWeightDebug(); };
  sel.addEventListener('change', () => clearMonteCarloPoolBaseCache());
  updateAugmentInfo();
}
function updateAugmentInfo() {
  const selName = document.getElementById('artifactCard').value;
  const box = document.getElementById('augmentInfo');
  if (!selName || selName === 'None') { box.style.display = 'none'; box.textContent = ''; return; }
  const a = AUGMENTS_BY_NAME[selName]; if (!a) { box.style.display = 'none'; return; }
  const lines = [];
  const cost = Number(a.cost || 0);
  lines.push(`${a.name}  •  ${cost} Dust`);
  if (a.multipliers && Object.keys(a.multipliers).length) {
    const pretty = Object.entries(a.multipliers).map(([k, v]) => `${prettyStat(k)} ×${v}`).join(', ');
    lines.push(`Multipliers: ${pretty}`);
  }
  if (a.unique && Object.keys(a.unique).length) {
    for (const [n, m] of Object.entries(a.unique)) { lines.push(`${n} ×${m}`); }
  }
  if (a.awakened && Object.keys(a.awakened).length) {
    for (const [n, m] of Object.entries(a.awakened)) { lines.push(`${n} ×${m}`); }
  }
  if (a.uniqueMultiplier) lines.push(`Unique ×${a.uniqueMultiplier}`);
  if (a.awakenedMultiplier) lines.push(`Awakened ×${a.awakenedMultiplier}`);
  if (a.minTier != null) lines.push(`Min Tier: ${a.minTier}`);
  if (a.guaranteedMods && a.guaranteedMods.length) lines.push(`Guarantees: ${a.guaranteedMods.join(', ')} (when eligible)`);
  lines.push(`Affected Enchants: ${countAffectedEnchants(a)}`);
  box.textContent = lines.join('\n');
  box.style.display = 'block';
  updateWeightDebug(); // ensure panel is always current
}
function countAffectedEnchants(aug) {
  const type = document.getElementById('itemType').value;
  if (!type) return 0;
  const base = eligiblePool(type, { skipAugment: true });
  const lm = new Set(Object.keys(aug.multipliers || {}).map(x => String(x).toUpperCase()));
  let count = 0;
  for (const e of base) {
    const hasLabel = (e.labels || []).some(L => lm.has(String(L).toUpperCase()));
    const byName = !!(nameMultiplierLookup(aug.unique, e.name) || nameMultiplierLookup(aug.awakened, e.name));
    const blanket = (aug.uniqueMultiplier && (e.labels || []).includes('UNIQUE')) ||
      (aug.awakenedMultiplier && (e.labels || []).includes('AWAKENED'));
    if (hasLabel || byName || blanket) count++;
  }
  return count;
}

/* ========================== Eligibility & Multipliers ========================== */
function eligiblePool(itemType) {
  if (!itemType) return [];
  const IT = itemType.toUpperCase();

  return ENCHANTS.filter(e => {
    if (!e.rollable) {
      const sel = document.getElementById('artifactCard').value;
      const aug = AUGMENTS_BY_NAME[sel];
      const guaranteed = !!(aug && aug.guaranteedMods && aug.guaranteedMods.includes(e.name));
      if (!guaranteed) return false;
    }

    if (e.incompatItemLabels && e.incompatItemLabels.includes(IT)) return false;
    const hasItem = (e.itemLabels || []).includes('EQUIPMENT') || (e.itemLabels || []).includes(IT);
    if (!hasItem) return false;

    if ((e.labels || []).includes('AWAKENED')) {
      const chosen = (document.getElementById('awakenItem')?.value || '').trim();
      if (!chosen) return false;
      const awakenTargets = AWAKENING_MAP[normalizeName(e.name)] || [];
      const chosenNorm = normalizeName(chosen);
      if (!awakenTargets.some(x => x === chosenNorm)) return false;
    }

    return true;
  });
}

function getCurrentPool(itemType, withAugment = true) {
  const base = eligiblePool(itemType);
  return withAugment ? applyAugmentMultipliers(base) : base;
}
function getTierFromLabels(labs) {
  // expects labels like TIER1, TIER2...
  for (const L of labs || []) {
    const m = /TIER(\d+)/i.exec(L);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}
function applyAugmentMultipliers(pool) {
  const sel = document.getElementById('artifactCard')?.value || 'None';
  const aug = AUGMENTS_BY_NAME?.[sel];
  if (!aug) {
    return pool.map(e => ({ ...e, weight: e.weight }));
  }

  // Families: stat labels get "max one", everything else stacks
  const STAT_KEYS = new Set(["ATTACK", "DEXTERITY", "WISDOM", "SPEED", "VITALITY", "DEFENSE", "LIFE", "MANA"]);
  // These labels stack multiplicatively with the chosen stat-family multiplier
  const STACK_KEYS = new Set(["STAT", "TRADEOFF", "DUALSTAT", "REWARD", "SUMMON", "DAMAGE", "DURABILITY", "RECOVERY", "CASTING", "UNIQUE", "AWAKENED"]);

  return pool.map(e => {
    const labels = e.labels || [];
    let base = e.weight;

    // Min tier filter (if present)
    if (aug.minTier && aug.minTier > 1) {
      // Find a TIERN label (e.g., TIER1, TIER2)
      const tierTag = labels.find(l => /^TIER(\d+)$/.test(l));
      if (tierTag) {
        const t = parseInt(tierTag.match(/^TIER(\d+)$/)[1], 10);
        if (t < aug.minTier) {
          // Exclude by tier
          return { ...e, weight: 0, _excludedByTier: true };
        }
      }
    }

    // Multipliers from label keys
    let bestStatMult = 1;     // take the max among stat-family keys
    let stackedMult = 1;      // multiply all from STACK_KEYS and other non-stat keys

    if (aug.multipliers) {
      for (const [key, val] of Object.entries(aug.multipliers)) {
        if (!val || typeof val !== 'number') continue;

        if (labels.includes(key)) {
          if (STAT_KEYS.has(key)) {
            // Only keep the strongest stat multiplier
            if (val > bestStatMult) bestStatMult = val;
          } else if (STACK_KEYS.has(key)) {
            // These stack with stat-family
            stackedMult *= val;
          } else {
            // Any other keys: treat as stackable too
            stackedMult *= val;
          }
        }

        // Blanket category boosts (premium cards): UNIQUE / AWAKENED
        if (key === "UNIQUE" && labels.includes("UNIQUE")) stackedMult *= val;
        if (key === "AWAKENED" && labels.includes("AWAKENED")) stackedMult *= val;
      }
    }

    // Name-specific boosts (unique / awakened by exact enchant name)
    // NOTE: If you also run normalization helpers elsewhere, they will still play nice with this:
    if (aug.unique && aug.unique[e.name]) {
      stackedMult *= aug.unique[e.name];
    }
    if (aug.awakened && aug.awakened[e.name]) {
      stackedMult *= aug.awakened[e.name];
    }

    const finalWeight = Math.max(0, Math.floor(base * bestStatMult * stackedMult));
    return { ...e, weight: finalWeight };
  });
}


/* ========================== Rolling & Probabilities ========================== */
function isCompatible(candidate, chosenArray) {
  return PathSimCore.isCompatible(candidate, chosenArray);
}
function weightedPick(list) {
  const total = list.reduce((a, b) => a + b.weight, 0);
  let r = Math.random() * total;
  for (const e of list) { r -= e.weight; if (r <= 0) return e; }
  return list[list.length - 1];
}
function getSimulationSlotSnapshot() {
  return currentEnchantments.map(slot => ({
    locked: slot.lockBtn.classList.contains('locked'),
    enchant: slot.enchant || null
  }));
}
function withArtifactCardSelection(tempName, fn) {
  const sel = document.getElementById('artifactCard');
  const original = sel.value;
  sel.value = tempName || 'None';
  try {
    return fn();
  } finally {
    sel.value = original;
  }
}
function getPoolForArtifact(itemType, artifactName) {
  return withArtifactCardSelection(artifactName, () => getCurrentPool(itemType, true));
}
function getMonteCarloPoolBase(itemType, artifactName) {
  const key = `${String(itemType || '')}\0${String(artifactName || '')}`;
  const cached = monteCarloPoolBaseCache.get(key);
  if (cached) return cached;

  const pool = getPoolForArtifact(itemType, artifactName);
  const entries = pool.map((e, idx) => ({
    idx,
    enchant: e,
    weight: e.weight,
    normName: normalizeName(e.name)
  }));
  const normToIndex = new Map();
  for (const entry of entries) {
    if (!normToIndex.has(entry.normName)) normToIndex.set(entry.normName, entry.idx);
  }
  const size = entries.length;
  const compatibility = Array.from({ length: size }, () => new Array(size).fill(true));
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      compatibility[i][j] = isCompatible(entries[i].enchant, [entries[j].enchant]);
    }
  }

  const base = { key, entries, compatibility, size, normToIndex };
  monteCarloPoolBaseCache.set(key, base);
  return base;
}
function getPerRollDustForArtifact(artifactName) {
  const lockedCount = currentEnchantments.filter(s => s.lockBtn.classList.contains('locked')).length;
  return getPerRollDustForArtifactWithLockCount(artifactName, lockedCount, selectedSlots);
}
function getPerRollDustForArtifactWithLockCount(artifactName, lockedCount, slotCount = selectedSlots) {
  const baseDust = BASE_DUST[slotCount] || 0;
  const augCost = AUGMENTS_BY_NAME[artifactName]?.cost || 0;
  return (baseDust + augCost) * Math.pow(2, lockedCount);
}
function buildMonteCarloContextFromBase(base, { targetNorms, artifactName, slotSnapshot, requireNewTarget = false, slotCount = selectedSlots }) {
  const augCost = AUGMENTS_BY_NAME[artifactName]?.cost || 0;
  return PathSimCore.buildMonteCarloContextFromBase(base, {
    targetNorms,
    slotSnapshot,
    requireNewTarget,
    slotCount,
    augCost
  });
}
function buildMonteCarloContextFromSnapshot({ itemType, targetNorms, artifactName, slotSnapshot, requireNewTarget = false, slotCount = selectedSlots }) {
  const base = getMonteCarloPoolBase(itemType, artifactName);
  return buildMonteCarloContextFromBase(base, {
    targetNorms,
    artifactName,
    slotSnapshot,
    requireNewTarget,
    slotCount
  });
}
function buildMonteCarloContext({ itemType, targetName, artifactName, targetNames, slotSnapshot = getSimulationSlotSnapshot(), requireNewTarget = false, slotCount = selectedSlots }) {
  const parsed = Array.isArray(targetNames) && targetNames.length
    ? { targetNames, targetNorms: new Set(targetNames.map(normalizeName)) }
    : parseTargetList(targetName);
  return buildMonteCarloContextFromSnapshot({
    itemType,
    artifactName,
    slotSnapshot,
    targetNorms: parsed.targetNorms,
    requireNewTarget,
    slotCount
  });
}
function getTakenKey(indices) {
  return PathSimCore.getTakenKey(indices);
}
function getValidCandidateIndices(ctx, takenIndices) {
  return PathSimCore.getValidCandidateIndices(ctx, takenIndices);
}
function getOrBuildSampler(ctx, validIndices) {
  return PathSimCore.getOrBuildSampler(ctx, validIndices);
}
function pickIndexFromSampler(sampler) {
  return PathSimCore.pickIndexFromSampler(sampler);
}
function simulateOneRollHitFast(ctx) {
  return PathSimCore.simulateOneRollHitFast(ctx);
}
function cloneSlotSnapshot(slotSnapshot) {
  return PathSimCore.cloneSlotSnapshot(slotSnapshot);
}
function simulateOneRollAndCapture(ctx) {
  return PathSimCore.simulateOneRollAndCapture(ctx);
}
function runMonteCarloForArtifact({ itemType, targetName, targetNames, artifactName, trials = MONTE_CARLO_TRIALS, chunkSize = MONTE_CARLO_CHUNK_SIZE, token, onProgress }) {
  return new Promise(resolve => {
    const ctx = buildMonteCarloContext({ itemType, targetName, targetNames, artifactName });
    const t0 = performance.now();

    if (ctx.hasLockedAnyTarget) {
      return resolve({
        hits: trials,
        trials,
        expectedRolls: 0,
        expectedDust: 0,
        perRollDust: ctx.perRollDust
      });
    }

    if (!ctx.hasRollableSlot || !ctx.hasCompatibleTarget) {
      return resolve({
        hits: 0,
        trials,
        expectedRolls: Infinity,
        expectedDust: Infinity,
        perRollDust: ctx.perRollDust,
        impossible: true
      });
    }

    let done = 0;
    let hits = 0;
    const frameBudgetMs = 12;

    const step = () => {
      if (token !== probabilityRunToken) {
        resolve({ cancelled: true });
        return;
      }
      const stepStart = performance.now();
      let processed = 0;
      while (done < trials && processed < chunkSize) {
        if (simulateOneRollHitFast(ctx)) hits++;
        done++;
        processed++;
        if (processed % 50 === 0 && (performance.now() - stepStart) > frameBudgetMs) break;
      }
      if (typeof onProgress === 'function') onProgress(done, trials);
      if (done < trials) {
        setTimeout(step, 0);
        return;
      }
      const p = hits / trials;
      const expectedRolls = p > 0 ? (1 / p) : Infinity;
      const expectedDust = Number.isFinite(expectedRolls) ? expectedRolls * ctx.perRollDust : Infinity;
      resolve({
        hits,
        trials,
        expectedRolls,
        expectedDust,
        perRollDust: ctx.perRollDust,
        profile: {
          elapsedMs: performance.now() - t0,
          samplerCacheSize: ctx.samplerCache.size,
          validSetCacheSize: ctx.validSetCache.size
        }
      });
    };
    step();
  });
}
/** Parses #path-phase-1; returns `{ phase1 }` or `{ error }`. */
function parsePathPhase1OrError() {
  const phase1Raw = document.getElementById('path-phase-1')?.value || '';
  const phase1 = parseTargetList(phase1Raw);
  if (phase1.targetNames.length < 1) {
    return { error: '1st target must contain at least one enchant.' };
  }
  for (const tName of phase1.targetNames) {
    if (isPathSimDisallowedTierName(tName)) {
      return { error: '1st target: tier I/II enchants cannot be used in path simulation.' };
    }
  }
  return { phase1 };
}
function isPathConfiguredFirstTargetOnly(slotCount) {
  if (slotCount < 2) return false;
  const { anchor, alts } = collectPathPhase2FromDom();
  if (anchor || alts.length > 0) return false;
  for (let phaseNum = 3; phaseNum <= slotCount; phaseNum++) {
    const parsed = parseTargetList(document.getElementById(`path-phase-${phaseNum}`)?.value || '');
    if (parsed.targetNames.length > 0) return false;
  }
  return true;
}
function buildPathPhasesFromInputs(slotCount) {
  const p1r = parsePathPhase1OrError();
  if (p1r.error) return { error: p1r.error };
  const phase1 = p1r.phase1;

  if (slotCount >= 2 && isPathConfiguredFirstTargetOnly(slotCount)) {
    return {
      phases: [{
        phaseIndex: 1,
        targetNames: phase1.targetNames,
        targetNorms: phase1.targetNorms,
        requireNewTarget: false
      }]
    };
  }

  const phases = [{
    phaseIndex: 1,
    targetNames: phase1.targetNames,
    targetNorms: phase1.targetNorms,
    requireNewTarget: false
  }];

  if (slotCount >= 2) {
    const { anchor, alts } = collectPathPhase2FromDom();
    const asymmetric = !!anchor;
    const displayNames = asymmetric ? [anchor, ...alts] : [...alts];
    if (displayNames.length < 1) {
      return { error: '2nd phase: add at least one enchant (anchor and/or alternate row).' };
    }
    const seen = new Set();
    const nameByNorm = {};
    for (const raw of displayNames) {
      if (isPathSimDisallowedTierName(raw)) {
        return { error: '2nd phase: tier I/II enchants cannot be used in path simulation.' };
      }
      const n = normalizeName(raw);
      if (!n) {
        return { error: '2nd phase: every OR target needs a non-empty enchant name.' };
      }
      if (seen.has(n)) {
        return { error: '2nd phase: all OR targets must be different enchants.' };
      }
      seen.add(n);
      nameByNorm[n] = raw.trim();
    }
    const anchorNorm = asymmetric ? normalizeName(anchor) : null;
    const altNorms = alts.map(a => normalizeName(a));
    const allNormsOrdered = asymmetric ? [anchorNorm, ...altNorms] : altNorms;
    const phase2TargetNorms = new Set(allNormsOrdered);
    const requireNewTarget = displayNames.some(name => phase1.targetNorms.has(normalizeName(name)));
    const phase3SummaryLine = asymmetric
      ? 'Auto: OR alternates if anchor locked in phase 2; anchor if an alternate locked first'
      : 'Auto: OR of remaining alternates after phase 2';

    phases.push({
      phaseIndex: 2,
      targetNames: displayNames,
      targetNorms: phase2TargetNorms,
      requireNewTarget,
      phase2Symmetric: !asymmetric,
      phase2AnchorNorm: anchorNorm,
      phase2AltNorms: altNorms,
      phase2OrNorms: allNormsOrdered,
      phase2NameByNorm: nameByNorm
    });

    if (slotCount === 3 && displayNames.length > 1) {
      phases.push({
        phaseIndex: 3,
        autoComplementFromPhase2: true,
        requireNewTarget: false,
        phase2Symmetric: !asymmetric,
        phase2AnchorNorm: anchorNorm,
        phase2AltNorms: altNorms,
        phase2OrNorms: allNormsOrdered,
        phase2NameByNorm: nameByNorm,
        phase3SummaryLine,
        targetNames: [phase3SummaryLine]
      });
    }
  }

  if (slotCount >= 4) {
    for (let phaseNum = 3; phaseNum <= slotCount; phaseNum++) {
      const parsed = parseTargetList(document.getElementById(`path-phase-${phaseNum}`)?.value || '');
      if (!parsed.targetNames.length) {
        return { error: `${formatOrdinal(phaseNum)} target must include at least one enchant.` };
      }
      for (const tName of parsed.targetNames) {
        if (isPathSimDisallowedTierName(tName)) {
          return {
            error: `${formatOrdinal(phaseNum)} target: tier I/II enchants cannot be used in path simulation.`
          };
        }
      }
      phases.push({
        phaseIndex: phaseNum,
        targetNames: parsed.targetNames,
        targetNorms: parsed.targetNorms,
        requireNewTarget: false
      });
    }
  }

  return { phases };
}
/** Abort extremely long runs (bug or absurd odds) without freezing the tab indefinitely. */
async function runPathUntilComplete({
  itemType,
  artifactName,
  initialSlotSnapshot,
  phases,
  slotCount,
  token,
  onProgress,
  yieldEveryRolls = 2500
}) {
  const poolBase = getMonteCarloPoolBase(itemType, artifactName);
  const augCost = AUGMENTS_BY_NAME[artifactName]?.cost || 0;
  return PathSimCore.runPathUntilCompleteAsync({
    poolBase,
    phases,
    initialSlotSnapshot,
    slotCount,
    augCost,
    checkCancel: () => token !== probabilityRunToken,
    onProgress,
    yieldEveryRolls
  });
}

function mean(arr) {
  return PathSimCore.mean(arr);
}
function minmax(arr) {
  return PathSimCore.minmax(arr);
}

/** Strip pool to fields used by path-sim-core only — much cheaper to structured-clone per worker. */
function slimPoolBaseForWorker(base) {
  const normToIndex =
    base.normToIndex instanceof Map
      ? Object.fromEntries(base.normToIndex)
      : { ...base.normToIndex };
  return {
    key: base.key,
    size: base.size,
    normToIndex,
    entries: base.entries.map(en => ({
      idx: en.idx,
      normName: en.normName,
      weight: en.weight,
      enchant: {
        name: en.enchant.name,
        labels: en.enchant.labels,
        incompatLabels: en.enchant.incompatLabels
      }
    }))
  };
}

/** Upper bound on parallel path-batch workers (balances structured-clone/postMessage cost vs throughput). */
const PATH_BATCH_MAX_PARALLEL = 16;

/** Lazily created; not terminated each batch (reused via one-shot listeners). */
const pathBatchWorkerCache = [];

function pathBatchWorkerHref() {
  return typeof window.__ENCHANT_PATH_BATCH_WORKER_HREF__ === 'string' &&
    window.__ENCHANT_PATH_BATCH_WORKER_HREF__
    ? window.__ENCHANT_PATH_BATCH_WORKER_HREF__
    : new URL('js/path-batch-worker.js', window.location.href).href;
}

function getOrCreatePathBatchWorker(slotIndex) {
  let w = pathBatchWorkerCache[slotIndex];
  if (w) return w;
  w = new Worker(pathBatchWorkerHref());
  pathBatchWorkerCache[slotIndex] = w;
  return w;
}

function resetPathBatchWorkerSlot(slotIndex) {
  const w = pathBatchWorkerCache[slotIndex];
  if (w) {
    try {
      w.terminate();
    } catch (e) {
      /* ignore */
    }
    pathBatchWorkerCache[slotIndex] = undefined;
  }
}

/** Why workers may be off; use for console diagnostics only. */
function pathBatchWorkerAvailabilityDetails() {
  const reasons = [];
  if (typeof Worker === 'undefined') reasons.push('Worker global missing');
  if (typeof PathSimCore === 'undefined') reasons.push('PathSimCore not loaded');
  return {
    ok: reasons.length === 0,
    reasons,
    protocol: typeof window !== 'undefined' && window.location ? window.location.protocol : '(n/a)',
    hardwareConcurrency:
      typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
        ? navigator.hardwareConcurrency
        : undefined
  };
}

function pathBatchWorkersAvailable() {
  return pathBatchWorkerAvailabilityDetails().ok;
}

function mergePathWorkerPartialResults(workerResults, trials) {
  const successRolls = [];
  const successDust = [];
  const successPathMs = [];
  let nSuccess = 0;
  let nImpossible = 0;
  let nRolloutLimit = 0;
  for (const r of workerResults) {
    nSuccess += r.nSuccess || 0;
    nImpossible += r.nImpossible || 0;
    nRolloutLimit += r.nRolloutLimit || 0;
    if (Array.isArray(r.successRolls) && r.successRolls.length) {
      for (let i = 0; i < r.successRolls.length; i++) {
        successRolls.push(r.successRolls[i]);
        successDust.push(r.successDust[i]);
        successPathMs.push(r.successPathMs[i]);
      }
    }
  }
  const rollsMM = minmax(successRolls);
  const dustMM = minmax(successDust);
  return {
    trials,
    nSuccess,
    nImpossible,
    nRolloutLimit,
    avgRolls: mean(successRolls),
    avgDust: mean(successDust),
    avgPathMs: mean(successPathMs),
    minRolls: rollsMM.min,
    maxRolls: rollsMM.max,
    minDust: dustMM.min,
    maxDust: dustMM.max
  };
}

async function runPathBatchMonteCarloWorkers({
  itemType,
  artifactName,
  initialSlotSnapshot,
  phases,
  slotCount,
  token,
  trials,
  onTrialProgress
}) {
  const tWall = performance.now();
  const poolBase = getMonteCarloPoolBase(itemType, artifactName);
  const slimPool = slimPoolBaseForWorker(poolBase);
  const augCost = AUGMENTS_BY_NAME[artifactName]?.cost || 0;

  const hc =
    typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency >= 1
      ? navigator.hardwareConcurrency
      : 4;
  const nWorkers = Math.min(PATH_BATCH_MAX_PARALLEL, hc, trials);
  const counts = [];
  {
    const base = Math.floor(trials / nWorkers);
    const rem = trials % nWorkers;
    for (let i = 0; i < nWorkers; i++) {
      counts.push(base + (i < rem ? 1 : 0));
    }
  }

  console.info('[enchant path-batch]', 'parallel batch start', {
    trials,
    nWorkers,
    hardwareConcurrency: hc,
    pathBatchMaxParallel: PATH_BATCH_MAX_PARALLEL,
    trialsPerWorker: counts,
    workerScriptHref: pathBatchWorkerHref(),
    slimPoolSize: slimPool && slimPool.size,
    slimPoolEntryCount: Array.isArray(slimPool.entries) ? slimPool.entries.length : undefined
  });

  const activeWorkers = [];
  let progressReported = 0;

  const runChunk = (count, idx) =>
    new Promise((resolve, reject) => {
      if (count === 0) {
        resolve({
          cancelled: false,
          trialsDone: 0,
          nSuccess: 0,
          nImpossible: 0,
          nRolloutLimit: 0,
          successRolls: [],
          successDust: [],
          successPathMs: []
        });
        return;
      }
      let w;
      try {
        w = getOrCreatePathBatchWorker(idx);
      } catch (e) {
        reject(e);
        return;
      }
      activeWorkers.push(w);
      const onMsg = ev => {
        const d = ev.data || {};
        if (d.clientToken !== token) {
          resolve({
            cancelled: false,
            trialsDone: 0,
            nSuccess: 0,
            nImpossible: 0,
            nRolloutLimit: 0,
            successRolls: [],
            successDust: [],
            successPathMs: [],
            stale: true
          });
          return;
        }
        const done = d.trialsDone != null ? d.trialsDone : count;
        progressReported += done;
        if (typeof onTrialProgress === 'function') {
          onTrialProgress(progressReported, trials, d);
        }
        resolve(d);
      };
      const onErr = err => {
        resetPathBatchWorkerSlot(idx);
        reject(err);
      };
      w.addEventListener('message', onMsg, { once: true });
      w.addEventListener('error', onErr, { once: true });
      w.postMessage({
        type: 'run',
        runId: idx,
        clientToken: token,
        trials: count,
        poolBase: slimPool,
        phases,
        initialSlotSnapshot,
        slotCount,
        augCost
      });
    });

  const cancelInterval = setInterval(() => {
    if (token !== probabilityRunToken) {
      for (const w of activeWorkers) {
        try {
          w.postMessage({ type: 'cancel' });
        } catch (e) {
          /* ignore */
        }
      }
    }
  }, 120);

  try {
    const workerResults = await Promise.all(counts.map((c, i) => runChunk(c, i)));
    clearInterval(cancelInterval);
    if (token !== probabilityRunToken) {
      return { cancelled: true, trialsDone: progressReported, elapsedMs: performance.now() - tWall };
    }
    const staleChunks = workerResults.filter(r => r && r.stale).length;
    if (staleChunks) {
      console.warn('[enchant path-batch]', 'stale worker replies (token mismatch)', { staleChunks });
    }
    const merged = mergePathWorkerPartialResults(workerResults, trials);
    console.info('[enchant path-batch]', 'parallel batch done', {
      elapsedMs: Math.round(performance.now() - tWall),
      nSuccess: merged.nSuccess,
      nImpossible: merged.nImpossible,
      nRolloutLimit: merged.nRolloutLimit
    });
    return {
      ...merged,
      elapsedMs: performance.now() - tWall
    };
  } catch (e) {
    clearInterval(cancelInterval);
    console.error('[enchant path-batch]', 'parallel batch threw', e);
    throw e;
  }
}

/**
 Run many independent path completions from the same starting snapshot; aggregate rolls/dust over successes.
 */
async function runPathBatchMonteCarlo({
  itemType,
  artifactName,
  initialSlotSnapshot,
  phases,
  slotCount,
  token,
  trials,
  onTrialProgress
}) {
  const tWall = performance.now();
  const successRolls = [];
  const successDust = [];
  const successPathMs = [];
  let nSuccess = 0;
  let nImpossible = 0;
  let nRolloutLimit = 0;
  /** Less frequent yields for large batches; keeps the tab responsive without hundreds of microtasks. */
  const uiYieldEvery = trials >= 5000 ? 200 : trials >= 1000 ? 100 : 25;

  for (let i = 0; i < trials; i++) {
    if (token !== probabilityRunToken) {
      return { cancelled: true, trialsDone: i, elapsedMs: performance.now() - tWall };
    }
    const freshSnap = cloneSlotSnapshot(initialSlotSnapshot);
    const r = await runPathUntilComplete({
      itemType,
      artifactName,
      initialSlotSnapshot: freshSnap,
      phases,
      slotCount,
      token,
      onProgress: undefined,
      yieldEveryRolls: 0
    });
    if (r.cancelled) {
      return { cancelled: true, trialsDone: i, elapsedMs: performance.now() - tWall };
    }
    if (r.success) {
      nSuccess++;
      successRolls.push(r.totalRolls);
      successDust.push(r.totalDust);
      successPathMs.push(r.elapsedMs);
    } else if (r.rolloutLimit) {
      nRolloutLimit++;
    } else if (r.impossible) {
      nImpossible++;
    }

    if (typeof onTrialProgress === 'function') {
      onTrialProgress(i + 1, trials, r);
    }
    if (i % uiYieldEvery === 0 || i === trials - 1) {
      await new Promise(res => setTimeout(res, 0));
    }
  }

  const rollsMM = minmax(successRolls);
  const dustMM = minmax(successDust);
  return {
    trials,
    nSuccess,
    nImpossible,
    nRolloutLimit,
    avgRolls: mean(successRolls),
    avgDust: mean(successDust),
    avgPathMs: mean(successPathMs),
    minRolls: rollsMM.min,
    maxRolls: rollsMM.max,
    minDust: dustMM.min,
    maxDust: dustMM.max,
    elapsedMs: performance.now() - tWall
  };
}
function peekPathBatchTrialsFromInput() {
  const el = document.getElementById('pathBatchTrialsInput');
  const raw = String(el?.value ?? '').trim();
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return PATH_SIM_BATCH_TRIALS_DEFAULT;
  return Math.min(PATH_SIM_BATCH_TRIALS_MAX, Math.max(PATH_SIM_BATCH_TRIALS_MIN, n));
}
function commitPathBatchTrialsInput() {
  const el = document.getElementById('pathBatchTrialsInput');
  if (!el) return PATH_SIM_BATCH_TRIALS_DEFAULT;
  const n = peekPathBatchTrialsFromInput();
  el.value = String(n);
  return n;
}
function updatePathBatchRunButtonLabel() {
  const pathBtn = document.getElementById('calcPathBtn');
  if (!pathBtn) return;
  const n = peekPathBatchTrialsFromInput();
  pathBtn.textContent = `Run ${n.toLocaleString()} paths`;
}
function setProbabilityBusy(isBusy) {
  const ids = ['compareCardsBtn', 'compareCardsTargetInput', 'path-phase-1', 'itemType', 'artifactCard', 'fillAwakenedEnchantBtn', 'calcPathBtn', 'pathBatchTrialsInput'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = isBusy;
  });
  const pathFieldset = document.getElementById('pathPhasesFieldset');
  if (pathFieldset) pathFieldset.disabled = isBusy;
}
function renderQuickEstimateOutput(out, targetLabel, res, elapsedMs) {
  if (!out) return;
  const wall = `<br><br>Wall clock: ${(elapsedMs / 1000).toFixed(2)} s`;
  if (res.impossible) {
    out.innerHTML = `<b>${targetLabel}</b><br>Chance this roll: 0.0000% (0/${res.trials})<br>Expected rolls: Unreachable<br>Expected Dust Cost: Unreachable${wall}`;
    return;
  }
  const chancePct = (res.hits / res.trials) * 100;
  out.innerHTML = `<b>${targetLabel}</b><br>Chance this roll (${res.trials.toLocaleString()} sims): ${chancePct.toFixed(4)}% (${res.hits}/${res.trials})<br>Expected rolls to hit: ${res.expectedRolls.toFixed(2)}<br>Expected Dust Cost to hit: ${res.expectedDust.toFixed(2)}${wall}`;
}
async function runQuickEstimateSimulation({ itemType, targetNames, artifactName, token, out, trials }) {
  if (!out) return;
  const targetLabel = getTargetDisplayLabel(targetNames);
  out.textContent = 'Running Monte Carlo simulation...';
  const tWall = performance.now();
  const res = await runMonteCarloForArtifact({
    itemType,
    targetNames,
    artifactName,
    trials,
    token,
    onProgress: (done, total) => {
      if (token !== probabilityRunToken) return;
      if (done === total) return;
      out.textContent = `Running Monte Carlo simulation... ${done}/${total}`;
    }
  });
  const elapsedMs = performance.now() - tWall;
  if (token !== probabilityRunToken || res.cancelled) return;
  renderQuickEstimateOutput(out, targetLabel, res, elapsedMs);
}
function rollEnchantments() {
  const it = document.getElementById('itemType').value;
  if (!it) { alert('Select an item type first'); return; }
  let pool = getCurrentPool(it, true);


  // Dust
  const lockedCount = currentEnchantments.filter(s => s.lockBtn.classList.contains('locked')).length;
  const baseDust = BASE_DUST[selectedSlots] || 0;
  const augName = document.getElementById('artifactCard').value;
  const augCost = AUGMENTS_BY_NAME[augName]?.cost || 0;
  const dust = (baseDust + augCost) * Math.pow(2, lockedCount);
  totalDustUsed += dust;
  updateDustDisplay(`+${dust} dust this roll`);

  // Roll unlocked slots respecting incompatibilities
  const taken = currentEnchantments.filter(s => s.lockBtn.classList.contains('locked') && s.enchant).map(s => s.enchant);
  for (const slot of currentEnchantments) {
    if (slot.lockBtn.classList.contains('locked') && slot.enchant) continue;
    const valid = pool.filter(e => isCompatible(e, taken));
    if (!valid.length) { slot.enchant = null; setEnchantSlotEmpty(slot.element); continue; }
    const pick = weightedPick(valid);
    slot.enchant = pick;
    setEnchantSlotContent(slot.element, pick.name, pick.description || '', pick);
    taken.push(pick);
  }
  enforceLockValidity();
  updateWeightDebug();
}
function renderCompareCardsTableRows(results) {
  const body = document.getElementById('compareCardsTableBody');
  if (!body) return;
  body.innerHTML = '';
  const rows = (results || []).map((r, idx) => {
    const tr = document.createElement('tr');
    const note = r.impossible ? 'Unreachable' : 'Reachable';
    const probabilityText = r.impossible ? '0.0000%' : `${(r.probability * 100).toFixed(4)}%`;
    const expectedDustText = r.impossible ? 'Unreachable' : r.expectedDust.toFixed(2);
    const expectedRollsText = r.impossible ? 'Unreachable' : r.expectedRolls.toFixed(2);
    const cells = [
      String(idx + 1),
      r.card,
      probabilityText,
      `${r.hits}/${r.trials}`,
      expectedDustText,
      expectedRollsText,
      note
    ];
    cells.forEach(text => {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    });
    return tr;
  });
  rows.forEach(row => body.appendChild(row));
}
async function compareAllCards() {
  const it = document.getElementById('itemType').value;
  const q = (document.getElementById('compareCardsTargetInput')?.value || '').trim();
  const parsedTargets = parseTargetList(q);
  const status = document.getElementById('compareCardsResult');
  const compareBtn = document.getElementById('compareCardsBtn');
  if (!it) {
    if (status) status.textContent = 'Select item type first.';
    return;
  }
  if (!parsedTargets.targetNames.length) {
    if (status) status.textContent = 'Type enchant name first.';
    return;
  }
  const cardNames = AUGMENTS.map(a => a.name);
  if (!cardNames.length) {
    renderCompareCardsTableRows([]);
    if (status) status.textContent = 'No cards available to compare.';
    return;
  }

  const token = ++probabilityRunToken;
  if (compareBtn) compareBtn.textContent = 'Comparing...';
  setProbabilityBusy(true);
  if (status) status.textContent = 'Running card comparison...';

  const results = [];
  try {
    for (let i = 0; i < cardNames.length; i++) {
      const card = cardNames[i];
      if (status) status.textContent = `Comparing cards... ${i + 1}/${cardNames.length} (${card})`;
      const res = await runMonteCarloForArtifact({
        itemType: it,
        targetNames: parsedTargets.targetNames,
        artifactName: card,
        token,
        onProgress: (done, total) => {
          if (token !== probabilityRunToken) return;
          if (done === total) return;
          if (status) status.textContent = `Comparing cards... ${i + 1}/${cardNames.length} (${card}) ${done}/${total}`;
        }
      });
      if (token !== probabilityRunToken || res.cancelled) return;
      results.push({
        card,
        hits: res.hits,
        trials: res.trials,
        probability: res.hits / res.trials,
        expectedDust: res.expectedDust,
        expectedRolls: res.expectedRolls,
        impossible: !!res.impossible
      });
    }

    results.sort((a, b) => {
      if (b.probability !== a.probability) return b.probability - a.probability;
      if (a.expectedDust !== b.expectedDust) return a.expectedDust - b.expectedDust;
      return a.card.localeCompare(b.card);
    });
    renderCompareCardsTableRows(results);
    const targetLabel = getTargetDisplayLabel(parsedTargets.targetNames);
    if (status) {
      status.textContent = `Compared ${results.length} cards for "${targetLabel}" (${MONTE_CARLO_TRIALS.toLocaleString()} trials each).`;
    }
  } finally {
    if (compareBtn) compareBtn.textContent = 'Compare All Cards';
    if (token === probabilityRunToken) {
      setProbabilityBusy(false);
    }
  }
}
async function calculatePathProbability() {
  const it = document.getElementById('itemType').value;
  const out = document.getElementById('pathResult');
  const quickOut = document.getElementById('probResult');
  if (!out) return;
  if (!it) { out.textContent = 'Select item type first.'; return; }

  const pathBatchN = commitPathBatchTrialsInput();
  const pathRunBtn = document.getElementById('calcPathBtn');
  const artifactName = document.getElementById('artifactCard').value;
  const quickRaw = (document.getElementById('path-phase-1')?.value || '').trim();
  const quickParsedTargets = parseTargetList(quickRaw);
  const token = ++probabilityRunToken;
  const quickMonteCarloTrials = pathBatchN * QUICK_ESTIMATE_PATH_MULTIPLIER;

  const quickEstimatePromise = (async () => {
    if (!quickOut) return;
    if (!quickParsedTargets.targetNames.length) {
      quickOut.textContent = 'Type enchant name first.';
      return;
    }
    await runQuickEstimateSimulation({
      itemType: it,
      targetNames: quickParsedTargets.targetNames,
      artifactName,
      token,
      out: quickOut,
      trials: quickMonteCarloTrials
    });
  })().catch((err) => {
    console.warn('[enchant quick-estimate]', 'failed during path run', err);
    if (token === probabilityRunToken && quickOut) quickOut.textContent = 'Quick estimate failed.';
  });

  const phaseConfig = buildPathPhasesFromInputs(selectedSlots);
  if (phaseConfig.error) {
    out.textContent = phaseConfig.error;
    return;
  }
  const phases = phaseConfig.phases || [];
  const phaseCount = phases.length;

  const initialSlotSnapshot = getSimulationSlotSnapshot();
  setProbabilityBusy(true);
  if (pathRunBtn) pathRunBtn.textContent = 'Simulating...';
  out.textContent = `Running ${pathBatchN.toLocaleString()} path simulations…`;

  try {
    const avail = pathBatchWorkerAvailabilityDetails();
    console.info('[enchant path-batch]', 'run mode decision', {
      workersOk: avail.ok,
      availabilityReasons: avail.reasons,
      protocol: avail.protocol,
      hardwareConcurrency: avail.hardwareConcurrency,
      batchTrials: pathBatchN
    });
    if (avail.protocol === 'file:') {
      console.info(
        '[enchant path-batch]',
        'file: origin — attempting workers; if they fail to load, serve the page over http(s) for best compatibility.'
      );
    }

    let batch;
    if (pathBatchWorkersAvailable()) {
      try {
        batch = await runPathBatchMonteCarloWorkers({
          itemType: it,
          artifactName,
          initialSlotSnapshot,
          phases,
          slotCount: selectedSlots,
          token,
          trials: pathBatchN,
          onTrialProgress: (done, total) => {
            if (token !== probabilityRunToken) return;
            out.textContent = `Path batch ${done.toLocaleString()} / ${total.toLocaleString()}…`;
          }
        });
      } catch (workerErr) {
        console.warn('[enchant path-batch]', 'workers failed; falling back to main-thread loop', workerErr);
        batch = await runPathBatchMonteCarlo({
          itemType: it,
          artifactName,
          initialSlotSnapshot,
          phases,
          slotCount: selectedSlots,
          token,
          trials: pathBatchN,
          onTrialProgress: (done, total) => {
            if (token !== probabilityRunToken) return;
            out.textContent = `Path batch ${done.toLocaleString()} / ${total.toLocaleString()}…`;
          }
        });
      }
    } else {
      console.info('[enchant path-batch]', 'using main-thread loop only', {
        becauseWorkersUnavailable: !avail.ok
      });
      batch = await runPathBatchMonteCarlo({
        itemType: it,
        artifactName,
        initialSlotSnapshot,
        phases,
        slotCount: selectedSlots,
        token,
        trials: pathBatchN,
        onTrialProgress: (done, total) => {
          if (token !== probabilityRunToken) return;
          out.textContent = `Path batch ${done.toLocaleString()} / ${total.toLocaleString()}…`;
        }
      });
    }
    if (token !== probabilityRunToken || batch.cancelled) return;

    const phaseLines = phases.map((phase, idx) => {
      const prefix = phase.requireNewTarget ? 'new: ' : '';
      const label = phase.autoComplementFromPhase2
        ? phase.phase3SummaryLine || 'Automatic complement of 2nd target'
        : getTargetDisplayLabel(phase.targetNames);
      return `${idx + 1}. ${prefix}${label}`;
    });

    const summaryLines = [];
    if (batch.nSuccess > 0) {
      summaryLines.push(`Average rolls: ${batch.avgRolls.toFixed(2)}`);
      summaryLines.push(`Average dust: ${batch.avgDust.toFixed(2)}`);
      summaryLines.push(
        `Rolls min / max: ${batch.minRolls.toLocaleString()} / ${batch.maxRolls.toLocaleString()}`
      );
      summaryLines.push(
        `Dust min / max: ${batch.minDust.toFixed(2)} / ${batch.maxDust.toFixed(2)}`
      );
      summaryLines.push(`Average simulated path time: ${batch.avgPathMs.toFixed(1)} ms`);
      summaryLines.push('');
    }
    summaryLines.push(`<b>Path batch: ${batch.trials.toLocaleString()} trials</b>`);
    summaryLines.push(`Successful completions: ${batch.nSuccess.toLocaleString()}`);
    summaryLines.push(`Unreachable (pool / locks): ${batch.nImpossible.toLocaleString()}`);
    summaryLines.push(`Per-path roll safety cap hit: ${batch.nRolloutLimit.toLocaleString()}`);
    summaryLines.push(`Phases in path: ${phaseCount} (slots: ${selectedSlots})`);
    if (batch.nSuccess === 0) {
      summaryLines.push('');
      summaryLines.push('<b>No successful completions</b> — check path config, item type, or locks.');
    }
    summaryLines.push('');
    summaryLines.push(`Wall clock: ${(batch.elapsedMs / 1000).toFixed(2)} s`);

    out.innerHTML =
      summaryLines.join('<br>') + `<pre class="small">${phaseLines.join('\n')}</pre>`;
  } finally {
    await quickEstimatePromise;
    if (pathRunBtn) updatePathBatchRunButtonLabel();
    if (token === probabilityRunToken) {
      setProbabilityBusy(false);
    }
  }
}

/* ========================== Validity, Dust & Breakdown ========================== */
function enforceLockValidity() {
  const it = document.getElementById('itemType').value;
  const pool = getCurrentPool(it, true);
  const validNames = new Set(pool.map(e => e.name));
  for (const s of currentEnchantments) {
    if (s.enchant && !validNames.has(s.enchant.name)) {
      s.enchant = null; setEnchantSlotEmpty(s.element);
      s.lockBtn.classList.remove('locked');
      syncLockToggleVisual(s.lockBtn);
    }
  }
}
function updateDustDisplay(msg) {
  document.getElementById('dustDisplay').textContent = `Total Dust Used: ${totalDustUsed}`;
  const d = document.getElementById('rollDelta');
  if (msg) { d.textContent = msg; d.classList.add('show'); setTimeout(() => d.classList.remove('show'), 1500); }
}
function updateWeightDebug() {
  const det = document.getElementById('weightDetails');
  const it = document.getElementById('itemType').value;
  if (!it) { det.textContent = 'Select an item type.'; return; }

  // Always compute (even when hidden) so it’s up-to-date when shown
  const base = getCurrentPool(it, false);
  const aug = getSelectedAugment();
  const finalPool = applyAugmentMultipliers(base);

  const hasMul = aug && aug.name !== 'None' && (
    (aug.multipliers && Object.keys(aug.multipliers).length) ||
    (aug.unique && Object.keys(aug.unique).length) ||
    (aug.awakened && Object.keys(aug.awakened).length) ||
    aug.uniqueMultiplier || aug.awakenedMultiplier || (aug.minTier != null)
  );

  const overall = finalPool.reduce((a, b) => a + b.weight, 0);
  if (!hasMul) {
    det.innerHTML = `No multipliers currently affecting this item.\nTotal weights (after filters): ${Math.round(overall).toLocaleString()}`;
    return;
  }

  const lm = new Set(Object.keys((aug && aug.multipliers) || {}).map(s => String(s).toUpperCase()));
  const affected = finalPool.filter(e => {
    let a = false;
    if ((e.labels || []).some(L => lm.has(String(L).toUpperCase()))) a = true;
    if (!a && nameMultiplierLookup(aug.unique, e.name)) a = true;
    if (!a && nameMultiplierLookup(aug.awakened, e.name)) a = true;
    if (!a && aug.uniqueMultiplier && (e.labels || []).includes('UNIQUE')) a = true;
    if (!a && aug.awakenedMultiplier && (e.labels || []).includes('AWAKENED')) a = true;
    return a;
  });

  const sumAff = affected.reduce((a, b) => a + b.weight, 0);
  if (!affected.length) {
    det.innerHTML = `No affected enchantments.\nTotal weights (after filters): ${Math.round(overall).toLocaleString()}`;
    return;
  }

  affected.sort((a, b) => b.weight - a.weight);
  const top = affected.slice(0, 25);
  const lines = top.map(e => `${e.name} — ${Math.round(e.weight).toLocaleString()}`);
  if (affected.length > top.length) lines.push(`… and ${affected.length - top.length} more`);
  lines.push('-----------------------------');
  lines.push(`Affected Total: ${Math.round(sumAff).toLocaleString()}`);
  lines.push(`Overall Total: ${Math.round(overall).toLocaleString()}`);
  det.innerHTML = `<pre class="small">${lines.join('\n')}</pre>`;
}

/* ========================== Helpers & Events ========================== */
function getSelectedAugment() {
  const name = document.getElementById('artifactCard').value;
  return AUGMENTS_BY_NAME[name] || null;
}
function bindEvents() {
  document.getElementById('rollBtn').onclick = rollEnchantments;
  document.getElementById('resetDust').onclick = () => { totalDustUsed = 0; updateDustDisplay(); };
  document.getElementById('itemType').onchange = () => { clearMonteCarloPoolBaseCache(); refreshEligibility(); enforceLockValidity(); updateWeightDebug(); };
  const compareBtn = document.getElementById('compareCardsBtn');
  const pathBtn = document.getElementById('calcPathBtn');
  const pathBatchInput = document.getElementById('pathBatchTrialsInput');
  if (compareBtn) compareBtn.onclick = compareAllCards;
  if (pathBtn) {
    pathBtn.onclick = calculatePathProbability;
    updatePathBatchRunButtonLabel();
  }
  if (pathBatchInput) {
    pathBatchInput.min = String(PATH_SIM_BATCH_TRIALS_MIN);
    pathBatchInput.max = String(PATH_SIM_BATCH_TRIALS_MAX);
    commitPathBatchTrialsInput();
    pathBatchInput.addEventListener('input', updatePathBatchRunButtonLabel);
  }
  // Initialize Weight Breakdown collapsed by default
  const det = document.getElementById('weightDetails');
  det.style.display = 'none';
  document.getElementById('toggleWeightBtn').textContent = 'Show';

  // Fix first-click behavior
  document.getElementById('toggleWeightBtn').onclick = () => {
    const btn = document.getElementById('toggleWeightBtn');
    const currentlyHidden = det.style.display === 'none' || det.style.display === '';
    det.style.display = currentlyHidden ? 'block' : 'none';
    btn.textContent = currentlyHidden ? 'Hide' : 'Show';
    updateWeightDebug();
  };

  renderPathPhaseUI();
}

function refreshEligibility() {
  const sel = document.getElementById('itemType');
  const labelEl = document.getElementById('eligibilityText');
  const it = sel.value;
  if (!it) {
    labelEl.textContent = '';
  } else {
    const label = sel.options[sel.selectedIndex]?.text?.trim() || it;
    const p = getCurrentPool(it, false);
    labelEl.textContent = `Eligible Enchantments for ${label}: ${p.length}`;
  }
  updatePathStatTradeoffPickerUI();
}
