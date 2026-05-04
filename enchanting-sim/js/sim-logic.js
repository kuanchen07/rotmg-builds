function normalizeName(s) {
  return String(s || "").replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
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
 * Map enchant labels to icons under icons/ (first matching rule wins).
 * Returns relative path e.g. enchantments/on-enchant/tier2.png, or null for ? placeholder.
 */
function resolveEnchantIconFile(labels) {
  const L = enchantLabelsUpper(labels);

  if (someLabel(L, l => l === 'AWAKENED')) return null;

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

  if (someLabel(L, l => l === 'UNIQUE' || l.endsWith('UNIQUE'))) {
    return resolveEnchantTieredRel('unique-enchant', L);
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
  const iconRel = resolveEnchantIconFile(labels);
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
    refreshEligibility(); enforceLockValidity(); updateWeightDebug();
  };
  box.addEventListener('input', () => {
    chosenAwakenItem = box.value.trim();
    updateFillAwakenedEnchantButton();
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
      const target = document.getElementById('targetEnchantInput');
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
  const cLabels = new Set(candidate.labels || []);
  const cIncompat = new Set(candidate.incompatLabels || []);
  for (const ch of chosenArray) {
    if (!ch) continue;
    const chLabels = new Set(ch.labels || []);
    const chIncompat = new Set(ch.incompatLabels || []);
    for (const x of cLabels) if (chIncompat.has(x)) return false;
    for (const x of chLabels) if (cIncompat.has(x)) return false;
    if (cLabels.has('SINGLESTAT') && chLabels.has('SINGLESTAT')) return false;
    if (cLabels.has('MANAREGEN') && chLabels.has('MANAREGEN')) return false;
  }
  return true;
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
function getPerRollDustForArtifact(artifactName) {
  const lockedCount = currentEnchantments.filter(s => s.lockBtn.classList.contains('locked')).length;
  const baseDust = BASE_DUST[selectedSlots] || 0;
  const augCost = AUGMENTS_BY_NAME[artifactName]?.cost || 0;
  return (baseDust + augCost) * Math.pow(2, lockedCount);
}
function buildMonteCarloContext({ itemType, targetName, artifactName }) {
  const targetNorm = normalizeName(targetName);
  const slotSnapshot = getSimulationSlotSnapshot();
  const pool = getPoolForArtifact(itemType, artifactName);
  const perRollDust = getPerRollDustForArtifact(artifactName);

  const entries = pool.map((e, idx) => ({
    idx,
    enchant: e,
    weight: e.weight,
    normName: normalizeName(e.name)
  }));
  const size = entries.length;

  const compatibility = Array.from({ length: size }, () => new Array(size).fill(true));
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      compatibility[i][j] = isCompatible(entries[i].enchant, [entries[j].enchant]);
    }
  }

  const lockedEnchants = slotSnapshot.filter(s => s.locked && s.enchant).map(s => s.enchant);
  const lockedPoolIndices = [];
  const lockedExternal = [];
  for (const locked of lockedEnchants) {
    const n = normalizeName(locked.name);
    const poolIdx = entries.findIndex(e => e.normName === n);
    if (poolIdx >= 0) lockedPoolIndices.push(poolIdx);
    else lockedExternal.push(locked);
  }

  const externalCompatibility = entries.map(e => isCompatible(e.enchant, lockedExternal));
  const isTargetIndex = entries.map(e => e.normName === targetNorm);
  const hasLockedTarget = lockedEnchants.some(e => normalizeName(e.name) === targetNorm);
  const hasRollableSlot = slotSnapshot.some(s => !(s.locked && s.enchant));

  const initialCandidateIndices = [];
  for (let idx = 0; idx < size; idx++) {
    if (!externalCompatibility[idx]) continue;
    let ok = true;
    for (const lockedIdx of lockedPoolIndices) {
      if (!compatibility[idx][lockedIdx]) { ok = false; break; }
    }
    if (ok) initialCandidateIndices.push(idx);
  }
  const hasCompatibleTarget = initialCandidateIndices.some(idx => isTargetIndex[idx]);

  return {
    slotSnapshot,
    entries,
    compatibility,
    lockedPoolIndices,
    externalCompatibility,
    isTargetIndex,
    hasLockedTarget,
    hasRollableSlot,
    hasCompatibleTarget,
    perRollDust,
    validSetCache: new Map(),
    samplerCache: new Map(),
    targetNorm
  };
}
function getTakenKey(indices) {
  const uniq = Array.from(new Set(indices));
  uniq.sort((a, b) => a - b);
  return uniq.join(',');
}
function getValidCandidateIndices(ctx, takenIndices) {
  const takenKey = getTakenKey(takenIndices);
  const cached = ctx.validSetCache.get(takenKey);
  if (cached) return cached;

  const valid = [];
  for (let idx = 0; idx < ctx.entries.length; idx++) {
    if (!ctx.externalCompatibility[idx]) continue;
    let ok = true;
    for (const t of takenIndices) {
      if (!ctx.compatibility[idx][t]) { ok = false; break; }
    }
    if (ok) valid.push(idx);
  }
  ctx.validSetCache.set(takenKey, valid);
  return valid;
}
function getOrBuildSampler(ctx, validIndices) {
  const key = validIndices.join(',');
  const cached = ctx.samplerCache.get(key);
  if (cached) return cached;

  const cumulative = [];
  let total = 0;
  for (const idx of validIndices) {
    total += ctx.entries[idx].weight;
    cumulative.push(total);
  }
  const sampler = { indices: validIndices, cumulative, total };
  ctx.samplerCache.set(key, sampler);
  return sampler;
}
function pickIndexFromSampler(sampler) {
  if (!sampler.indices.length || sampler.total <= 0) return null;
  let r = Math.random() * sampler.total;
  let lo = 0, hi = sampler.cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (r <= sampler.cumulative[mid]) hi = mid;
    else lo = mid + 1;
  }
  return sampler.indices[lo];
}
function simulateOneRollHitFast(ctx) {
  const taken = ctx.lockedPoolIndices.slice();
  if (ctx.hasLockedTarget) return true;
  for (const slot of ctx.slotSnapshot) {
    if (slot.locked && slot.enchant) continue;
    const validIndices = getValidCandidateIndices(ctx, taken);
    if (!validIndices.length) continue;
    const sampler = getOrBuildSampler(ctx, validIndices);
    const pickedIdx = pickIndexFromSampler(sampler);
    if (pickedIdx == null) continue;
    if (ctx.isTargetIndex[pickedIdx]) return true;
    taken.push(pickedIdx);
  }
  return false;
}
function runMonteCarloForArtifact({ itemType, targetName, artifactName, trials = MONTE_CARLO_TRIALS, chunkSize = MONTE_CARLO_CHUNK_SIZE, token, onProgress }) {
  return new Promise(resolve => {
    const ctx = buildMonteCarloContext({ itemType, targetName, artifactName });
    const t0 = performance.now();

    if (ctx.hasLockedTarget) {
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
function setProbabilityBusy(isBusy, label) {
  const ids = ['calcProbBtn', 'compareCardsMode', 'targetEnchantInput', 'itemType', 'artifactCard', 'fillAwakenedEnchantBtn'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = isBusy;
  });
  if (label) document.getElementById('calcProbBtn').textContent = label;
}
function setProbabilityButtonLabel() {
  const compare = document.getElementById('compareCardsMode')?.checked;
  document.getElementById('calcProbBtn').textContent = compare ? 'Compare Cards' : 'Calculate Probability';
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
async function calculateProbability() {
  const it = document.getElementById('itemType').value;
  const q = document.getElementById('targetEnchantInput').value.trim();
  const out = document.getElementById('probResult');
  if (!it) { out.textContent = 'Select item type first.'; return; }
  if (!q) { out.textContent = 'Type enchant name first.'; return; }

  const compareMode = document.getElementById('compareCardsMode').checked;
  const token = ++probabilityRunToken;
  setProbabilityBusy(true, compareMode ? 'Comparing...' : 'Simulating...');
  out.textContent = compareMode ? 'Running card comparison...' : 'Running Monte Carlo simulation...';

  if (compareMode) {
    const cardNames = AUGMENTS.map(a => a.name);
    if (!cardNames.length) {
      setProbabilityBusy(false);
      setProbabilityButtonLabel();
      out.textContent = 'No cards available to compare.';
      return;
    }
    const results = [];
    try {
      for (let i = 0; i < cardNames.length; i++) {
        const card = cardNames[i];
        out.textContent = `Comparing cards... ${i + 1}/${cardNames.length} (${card})`;
        const res = await runMonteCarloForArtifact({
          itemType: it,
          targetName: q,
          artifactName: card,
          token,
          onProgress: (done, total) => {
            if (token !== probabilityRunToken) return;
            if (done === total) return;
            out.textContent = `Comparing cards... ${i + 1}/${cardNames.length} (${card}) ${done}/${total}`;
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
      const lines = results.map((r, idx) => {
        if (r.impossible) {
          return `${idx + 1}. ${r.card} — 0.0000% (${r.hits}/${r.trials}), Expected Dust: Unreachable`;
        }
        return `${idx + 1}. ${r.card} — ${(r.probability * 100).toFixed(4)}% (${r.hits}/${r.trials}), Expected Dust: ${r.expectedDust.toFixed(2)}, Expected Rolls: ${r.expectedRolls.toFixed(2)}`;
      });
      out.innerHTML = `<b>Compare Cards for "${q}" (${MONTE_CARLO_TRIALS.toLocaleString()} trials each)</b><pre class="small">${lines.join('\n')}</pre>`;
    } finally {
      if (token === probabilityRunToken) {
        setProbabilityBusy(false);
        setProbabilityButtonLabel();
      }
    }
    return;
  }

  const augName = document.getElementById('artifactCard').value;
  try {
    const res = await runMonteCarloForArtifact({
      itemType: it,
      targetName: q,
      artifactName: augName,
      token,
      onProgress: (done, total) => {
        if (token !== probabilityRunToken) return;
        if (done === total) return;
        out.textContent = `Running Monte Carlo simulation... ${done}/${total}`;
      }
    });
    if (token !== probabilityRunToken || res.cancelled) return;
    if (res.impossible) {
      out.innerHTML = `<b>${q}</b><br>Chance this roll: 0.0000% (0/${res.trials})<br>Expected rolls: Unreachable<br>Expected Dust Cost: Unreachable`;
      return;
    }
    const chancePct = (res.hits / res.trials) * 100;
    out.innerHTML = `<b>${q}</b><br>Chance this roll (${res.trials.toLocaleString()} sims): ${chancePct.toFixed(4)}% (${res.hits}/${res.trials})<br>Expected rolls to hit: ${res.expectedRolls.toFixed(2)}<br>Expected Dust Cost to hit: ${res.expectedDust.toFixed(2)}`;
  } finally {
    if (token === probabilityRunToken) {
      setProbabilityBusy(false);
      setProbabilityButtonLabel();
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
  document.getElementById('itemType').onchange = () => { refreshEligibility(); enforceLockValidity(); updateWeightDebug(); };
  document.getElementById('calcProbBtn').onclick = calculateProbability;
  document.getElementById('compareCardsMode').onchange = setProbabilityButtonLabel;
  // Initialize Weight Breakdown collapsed by default
  const det = document.getElementById('weightDetails');
  det.style.display = 'none';
  document.getElementById('toggleWeightBtn').textContent = 'Show';
  setProbabilityButtonLabel();

  // Fix first-click behavior
  document.getElementById('toggleWeightBtn').onclick = () => {
    const btn = document.getElementById('toggleWeightBtn');
    const currentlyHidden = det.style.display === 'none' || det.style.display === '';
    det.style.display = currentlyHidden ? 'block' : 'none';
    btn.textContent = currentlyHidden ? 'Hide' : 'Show';
    updateWeightDebug();
  };

  syncRollButtonState();
}
function syncRollButtonState() {
  const roll = document.getElementById('rollBtn');
  if (!roll) return;
  roll.disabled = !document.getElementById('itemType').value;
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
  syncRollButtonState();
}
