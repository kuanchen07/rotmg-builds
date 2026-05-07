// sim-logic-simulation.js — load after sim-logic-ui.js
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
