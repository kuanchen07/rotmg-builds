// sim-logic-ui.js — load after sim-logic-helpers.js
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
    'path-phase-1-artifact',
    'path-phase-2-anchor',
    'path-phase-2-artifact',
    'path-phase-2-or',
    'path-phase-2a',
    'path-phase-2b',
    'path-phase-3',
    'path-phase-3-artifact',
    'path-phase-4',
    'path-phase-4-artifact'
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
        onPathPhase2TargetsChanged();
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

/** Fill a &lt;select&gt; with the same artifact/card option groups as the main rolling augment.
 * @param {{ compactLabels?: boolean }} [opts] — if true (enchant-sim path phases only), omit dust in labels and shorten tarot names.
 */
function fillArtifactSelectOptions(selectEl, preferredValue, opts) {
  if (!selectEl) return;
  const compact = !!(opts && opts.compactLabels);
  const preserved =
    preferredValue != null ? String(preferredValue) : String(selectEl.value || 'None');
  selectEl.innerHTML = '';

  const none = document.createElement('option');
  none.value = 'None';
  none.textContent = compact ? 'None' : 'None (0 Dust)';
  none.dataset.cost = 0;
  selectEl.appendChild(none);

  const artifacts = window.__RAW_ARTS || [];
  const engravings = window.__RAW_ENVS || [];
  const isTarot = x => /tarot/i.test(x.category || '') || /^the .*tarot card$/i.test(x.name || '');
  const isPremium = x => /premium/i.test(x.category || '') || /^premium /i.test(x.name || '');
  const isArtifact = x => !isTarot(x) && !isPremium(x);

  const addGroup = (label, list) => {
    if (!list.length) return;
    const g = document.createElement('optgroup');
    g.label = `— ${label} —`;
    list.forEach(a => {
      const o = document.createElement('option');
      o.value = a.name;
      const cost = Number(a.cost || 0);
      o.dataset.cost = cost;
      o.textContent = compact
        ? shortArtifactDisplayLabel(a.name)
        : `${a.name} (${cost} Dust)`;
      g.appendChild(o);
    });
    selectEl.appendChild(g);
  };

  addGroup('Tarot Cards', artifacts.filter(isTarot));
  addGroup('Artifacts', artifacts.filter(isArtifact));
  addGroup('Premium Cards', artifacts.filter(isPremium));
  if (INCLUDE_ENGRAVINGS_IN_UI) addGroup('Engravings', engravings);

  const vals = [...selectEl.options].map(o => o.value);
  selectEl.value = vals.includes(preserved) ? preserved : 'None';
}

/** Appends augment &lt;select&gt; to a flex row (same line as Enchantment input). */
function appendPathPhaseArtifactSelect(rowEl, selectId, savedValue) {
  if (!rowEl) return;
  const sel = document.createElement('select');
  sel.id = selectId;
  sel.className = 'path-phase-artifact-select';
  sel.setAttribute('aria-label', 'Augment card for this path phase');
  fillArtifactSelectOptions(sel, savedValue != null ? savedValue : 'None', { compactLabels: true });
  sel.addEventListener('change', () => {
    clearMonteCarloPoolBaseCache();
  });
  rowEl.appendChild(sel);
}

function refreshPathPhaseArtifactDropdowns() {
  document.querySelectorAll('select.path-phase-artifact-select').forEach(sel => {
    fillArtifactSelectOptions(sel, sel.value, { compactLabels: true });
  });
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
    const altDetailsEl = document.getElementById('path-phase-2-alts-disclosure');
    if (altDetailsEl) altDetailsEl.open = true;
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
    onPathPhase2TargetsChanged();
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
/** Called when anchor or alternates change; re-builds path steps if 4-slot Auto vs manual layout must flip. */
function onPathPhase2TargetsChanged() {
  syncPathStatTradeoffDisclosure();
  if (selectedSlots < 4) return;
  const mount = document.getElementById('pathPhasesMount');
  if (!mount) return;
  const snap = readPathPhaseValues();
  const multi = pathPhase2MultiOrTargets(getPhase2RestoreState(snap));
  const key = multi ? 'multi' : 'single';
  if (mount.dataset.pathP2OrMode === key) return;
  renderPathPhaseUI(snap);
}
function renderPathPhaseUI(phaseValuesOverride) {
  const mount = document.getElementById('pathPhasesMount');
  if (!mount) return;
  const prev = phaseValuesOverride !== undefined ? phaseValuesOverride : readPathPhaseValues();
  mount.innerHTML = '';
  mount.className = 'path-row path-stepper';

  const p2 = getPhase2RestoreState(prev);
  let stepNum = 1;

  createPathStep(mount, stepNum, { title: '1st target' }, body => {
    const wrap = document.createElement('div');
    wrap.className = 'path-step__field path-step__field--flush path-phase-inline-row';
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
    appendPathPhaseArtifactSelect(wrap, 'path-phase-1-artifact', prev['path-phase-1-artifact']);
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
      const anchorRow = document.createElement('div');
      anchorRow.className = 'path-phase-inline-row';
      anchorRow.appendChild(ancWrap);
      appendPathPhaseArtifactSelect(anchorRow, 'path-phase-2-artifact', prev['path-phase-2-artifact']);
      ancBlock.appendChild(anchorRow);
      body.appendChild(ancBlock);
      if (typeof window.initEnchantTargetAutocomplete === 'function') {
        window.initEnchantTargetAutocomplete(ancInp, { excludePathSimTier12: true });
      }
      ancInp.addEventListener('input', onPathPhase2TargetsChanged);
      altDetails.id = 'path-phase-2-alts-disclosure';
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
      altContainer.addEventListener('input', onPathPhase2TargetsChanged);
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
        onPathPhase2TargetsChanged();
      };
      altInner.appendChild(addBtn);
      altDetails.appendChild(altInner);
      body.appendChild(altDetails);

      mountStatTradeoffPickerSection(body);
      updatePathStatTradeoffPickerUI();
    });
    stepNum++;
  }

  const p2MultiOr = pathPhase2MultiOrTargets(p2);
  const showAutoThirdTarget = selectedSlots >= 3;
  if (showAutoThirdTarget) {
    createPathStep(mount, stepNum, { title: '3rd target' }, body => {
      const row = document.createElement('div');
      row.className = 'path-phase-inline-row path-step__auto-inline';
      const meta = document.createElement('div');
      meta.className = 'path-step__auto-row path-step__auto-row--grow';
      const badge = document.createElement('span');
      badge.className = 'path-step__badge-auto';
      badge.textContent = 'Auto';
      const desc = document.createElement('span');
      desc.className = 'path-hint path-step__auto-desc';
      desc.textContent =
        'After phase 2: either OR the remaining alternates, or anchor-only, depending on what locked first.';
      meta.appendChild(badge);
      meta.appendChild(desc);
      row.appendChild(meta);
      appendPathPhaseArtifactSelect(row, 'path-phase-3-artifact', prev['path-phase-3-artifact']);
      body.appendChild(row);
    });
    stepNum++;
  }

  if (selectedSlots >= 4) {
    const startManual = p2MultiOr ? 4 : 3;
    const optionalManualTail = startManual === 4;
    for (let phase = startManual; phase <= selectedSlots; phase++) {
      const ph = phase;
      const manualTitle = optionalManualTail
        ? `${formatOrdinal(phase)} target (optional)`
        : `${formatOrdinal(phase)} enchant`;
      createPathStep(
        mount,
        stepNum,
        {
          title: manualTitle
        },
        body => {
        const wrap = document.createElement('div');
        wrap.className = 'path-step__field path-step__field--flush path-phase-inline-row';
        const w = document.createElement('div');
        w.className = 'target-enchant-wrap';
        const input = document.createElement('input');
        input.type = 'text';
        input.id = `path-phase-${ph}`;
        input.className = 'path-phase-input';
        input.placeholder = optionalManualTail
          ? 'Optional — leave blank to end path after phase 3'
          : 'Type enchantment…';
        input.value = prev[`path-phase-${ph}`] || '';
        w.appendChild(input);
        wrap.appendChild(w);
        appendPathPhaseArtifactSelect(
          wrap,
          `path-phase-${ph}-artifact`,
          prev[`path-phase-${ph}-artifact`]
        );
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

  if (selectedSlots >= 4) {
    mount.dataset.pathP2OrMode = p2MultiOr ? 'multi' : 'single';
  } else {
    delete mount.dataset.pathP2OrMode;
  }
}
/* ========================== UI: Augment dropdown + info ========================== */
function populateAugmentDropdown() {
  const sel = document.getElementById('artifactCard');
  fillArtifactSelectOptions(sel, sel?.value || 'None');

  sel.onchange = () => { updateAugmentInfo(); refreshEligibility(); enforceLockValidity(); updateWeightDebug(); };
  sel.addEventListener('change', () => clearMonteCarloPoolBaseCache());
  updateAugmentInfo();
  refreshPathPhaseArtifactDropdowns();
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
  if (a.minTier != null) {
    lines.push(`Min Tier: ${a.minTier}`);
    const floorMult = MIN_TIER_FLOOR_MULT[a.minTier];
    if (floorMult != null) lines.push(`Floor tier weight: ×${floorMult}`);
  }
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

/** Extra weight on the floor tier row for augment minTier (matches in-game silver/gold floor). */
const MIN_TIER_FLOOR_MULT = { 2: 2.166, 3: 4.25 };

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
    const tierNum = getTierFromLabels(labels);

    // Min tier filter (if present)
    if (aug.minTier && aug.minTier > 1 && tierNum != null && tierNum < aug.minTier) {
      return { ...e, weight: 0, _excludedByTier: true };
    }

    const minTierFloorMult =
      aug.minTier && tierNum === aug.minTier ? (MIN_TIER_FLOOR_MULT[aug.minTier] ?? 1) : 1;

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

    const finalWeight = Math.max(0, Math.floor(base * minTierFloorMult * bestStatMult * stackedMult));
    return { ...e, weight: finalWeight };
  });
}
