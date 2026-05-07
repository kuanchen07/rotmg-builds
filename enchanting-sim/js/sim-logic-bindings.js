// sim-logic-bindings.js — load after sim-logic-simulation.js
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
