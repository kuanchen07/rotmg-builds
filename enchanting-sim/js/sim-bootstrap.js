function initEnchantSimulator() {
  if (simulatorDidInit) return Promise.resolve();
  if (simulatorInitPromise) return simulatorInitPromise;

  simulatorInitPromise = (async () => {
    renderSlotButtons();
    bindEvents();
    buildAwakenList();
    await Promise.all([loadEnchantments(), loadAugments()]);
    normalizeAllData();
    populateAugmentDropdown();
    refreshEligibility();
    updateWeightDebug();
    updateFillAwakenedEnchantButton();
    simulatorDidInit = true;
  })()
    .catch((err) => {
      simulatorInitPromise = null;
      throw err;
    });

  return simulatorInitPromise;
}

// Normalize AWAKENING_MAP keys globally
if (typeof AWAKENING_MAP !== 'undefined') {
  const fixed = {};
  for (const [k, v] of Object.entries(AWAKENING_MAP)) {
    fixed[normalizeName(k)] = v.map(x => normalizeName(x));
  }
  AWAKENING_MAP = fixed;
}

window.EnchantSim = window.EnchantSim || {};
window.EnchantSim.init = initEnchantSimulator;
window.EnchantSim.resolveDataUrl = resolveDataUrl;
window.initEnchantSimulator = initEnchantSimulator;

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", () => { initEnchantSimulator(); }, { once: true });
} else {
  initEnchantSimulator();
}
