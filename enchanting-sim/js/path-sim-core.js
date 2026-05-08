/**
 * Path / Monte Carlo helpers with no DOM dependencies.
 * Loaded on main (before sim-logic) and in path-batch-worker via importScripts.
 * Keep in sync with sim-logic probability helpers until refactors settle.
 */
(function pathSimCoreFactory(global) {
  "use strict";

  const BASE_DUST = { 1: 50, 2: 65, 3: 80, 4: 100 };
  const PATH_SIM_MAX_TOTAL_ROLLS = 500_000_000;

  function normalizeName(s) {
    return String(s || "")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function isCompatible(candidate, chosenArray) {
    const cLabels = new Set(candidate.labels || []);
    const cIncompat = new Set(candidate.incompatLabels || []);
    for (const ch of chosenArray) {
      if (!ch) continue;
      const chLabels = new Set(ch.labels || []);
      const chIncompat = new Set(ch.incompatLabels || []);
      for (const x of cLabels) if (chIncompat.has(x)) return false;
      for (const x of chLabels) if (cIncompat.has(x)) return false;
      if (cLabels.has("SINGLESTAT") && chLabels.has("SINGLESTAT")) return false;
      if (cLabels.has("MANAREGEN") && chLabels.has("MANAREGEN")) return false;
    }
    return true;
  }

  function revivePoolBase(base) {
    if (!base || !base.normToIndex) return base;
    if (!(base.normToIndex instanceof Map)) {
      base.normToIndex = new Map(Object.entries(base.normToIndex));
    }
    return base;
  }

  /** Worker payloads may omit compatibility (huge); build once on demand. Main-thread cache always includes it. */
  function ensurePoolCompatibilityMatrix(base) {
    revivePoolBase(base);
    const entries = base.entries;
    if (!entries || !entries.length) return base;
    const n = entries.length;
    const ok =
      base.compatibility &&
      base.compatibility.length === n &&
      (!base.compatibility[0] || base.compatibility[0].length === n);
    if (ok) {
      base.size = n;
      return base;
    }
    const compatibility = Array.from({ length: n }, () => new Array(n).fill(true));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        compatibility[i][j] = isCompatible(entries[i].enchant, [entries[j].enchant]);
      }
    }
    base.compatibility = compatibility;
    base.size = n;
    return base;
  }

  /**
   * @param {object} base - getMonteCarloPoolBase result
   * @param {object} opts
   * @param {Set<string>} opts.targetNorms
   * @param {object[]} opts.slotSnapshot
   * @param {boolean} [opts.requireNewTarget]
   * @param {number} [opts.slotCount]
   * @param {number} opts.augCost - augment card cost (numeric); same as AUGMENTS_BY_NAME[name].cost
   */
  function buildMonteCarloContextFromBase(base, { targetNorms, slotSnapshot, requireNewTarget = false, slotCount = 4, augCost = 0 }) {
    ensurePoolCompatibilityMatrix(base);
    const lockedCount = slotSnapshot.filter(s => s.locked && s.enchant).length;
    const baseDust = BASE_DUST[slotCount] || 0;
    const perRollDust = (baseDust + augCost) * Math.pow(2, lockedCount);
    const entries = base.entries;
    const compatibility = base.compatibility;
    const size = base.size;

    const lockedEnchants = slotSnapshot.filter(s => s.locked && s.enchant).map(s => s.enchant);
    const lockedPoolIndices = [];
    const lockedExternal = [];
    for (const locked of lockedEnchants) {
      const n = normalizeName(locked.name);
      const poolIdx = base.normToIndex.get(n);
      if (poolIdx != null) lockedPoolIndices.push(poolIdx);
      else lockedExternal.push(locked);
    }

    const externalCompatibility = entries.map(e => isCompatible(e.enchant, lockedExternal));
    const isTargetIndex = entries.map(e => targetNorms.has(e.normName));
    const lockedTargetNorms = new Set(
      lockedEnchants.map(e => normalizeName(e.name)).filter(n => targetNorms.has(n))
    );
    const hasLockedAnyTarget = !requireNewTarget && lockedTargetNorms.size > 0;
    const hasRollableSlot = slotSnapshot.some(s => !(s.locked && s.enchant));

    const initialCandidateIndices = [];
    for (let idx = 0; idx < size; idx++) {
      if (!externalCompatibility[idx]) continue;
      let ok = true;
      for (const lockedIdx of lockedPoolIndices) {
        if (!compatibility[idx][lockedIdx]) {
          ok = false;
          break;
        }
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
      hasLockedAnyTarget,
      lockedTargetNorms,
      requireNewTarget,
      hasRollableSlot,
      hasCompatibleTarget,
      perRollDust,
      validSetCache: new Map(),
      samplerCache: new Map()
    };
  }

  function getTakenKey(indices) {
    const uniq = Array.from(new Set(indices));
    uniq.sort((a, b) => a - b);
    return uniq.join(",");
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
        if (!ctx.compatibility[idx][t]) {
          ok = false;
          break;
        }
      }
      if (ok) valid.push(idx);
    }
    ctx.validSetCache.set(takenKey, valid);
    return valid;
  }

  function getOrBuildSampler(ctx, validIndices) {
    const key = validIndices.join(",");
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
    let lo = 0;
    let hi = sampler.cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (r <= sampler.cumulative[mid]) hi = mid;
      else lo = mid + 1;
    }
    return sampler.indices[lo];
  }

  function simulateOneRollHitFast(ctx) {
    const taken = ctx.lockedPoolIndices.slice();
    if (ctx.hasLockedAnyTarget) return true;
    for (const slot of ctx.slotSnapshot) {
      if (slot.locked && slot.enchant) continue;
      const validIndices = getValidCandidateIndices(ctx, taken);
      if (!validIndices.length) continue;
      const sampler = getOrBuildSampler(ctx, validIndices);
      const pickedIdx = pickIndexFromSampler(sampler);
      if (pickedIdx == null) continue;
      if (ctx.isTargetIndex[pickedIdx]) {
        const norm = ctx.entries[pickedIdx].normName;
        if (!ctx.requireNewTarget || !ctx.lockedTargetNorms.has(norm)) return true;
      }
      taken.push(pickedIdx);
    }
    return false;
  }

  function cloneSlotSnapshot(slotSnapshot) {
    return slotSnapshot.map(slot => ({
      locked: !!slot.locked,
      enchant: slot.enchant || null
    }));
  }

  function simulateOneRollAndCapture(ctx) {
    const taken = ctx.lockedPoolIndices.slice();
    const snapshot = cloneSlotSnapshot(ctx.slotSnapshot);
    let hit = false;
    let hitSlotIndex = -1;
    let hitNorm = null;

    for (let slotIdx = 0; slotIdx < snapshot.length; slotIdx++) {
      const slot = snapshot[slotIdx];
      if (slot.locked && slot.enchant) continue;
      const validIndices = getValidCandidateIndices(ctx, taken);
      if (!validIndices.length) {
        slot.enchant = null;
        continue;
      }
      const sampler = getOrBuildSampler(ctx, validIndices);
      const pickedIdx = pickIndexFromSampler(sampler);
      if (pickedIdx == null) {
        slot.enchant = null;
        continue;
      }
      const pickedEnchant = ctx.entries[pickedIdx].enchant;
      const pickedNorm = ctx.entries[pickedIdx].normName;
      slot.enchant = pickedEnchant;
      taken.push(pickedIdx);
      if (!hit && ctx.isTargetIndex[pickedIdx]) {
        if (!ctx.requireNewTarget || !ctx.lockedTargetNorms.has(pickedNorm)) {
          hit = true;
          hitSlotIndex = slotIdx;
          hitNorm = pickedNorm;
        }
      }
    }

    return {
      hit,
      hitSlotIndex,
      hitNorm,
      snapshot
    };
  }

  function mean(arr) {
    if (!arr.length) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function minmax(arr) {
    if (!arr.length) return { min: null, max: null };
    let lo = arr[0];
    let hi = arr[0];
    for (let i = 1; i < arr.length; i++) {
      const v = arr[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return { min: lo, max: hi };
  }

  function usesPerArtifactPathPools(fullParams) {
    const map = fullParams.poolBasesByArtifact;
    return map && typeof map === "object" && Object.keys(map).length > 0;
  }

  /** Pick augment pool/cost for this path phase ({ pathArtifactName } comes from orchestration). */
  function pickPoolForPhaseRoll(phase, fullParams) {
    if (!usesPerArtifactPathPools(fullParams)) {
      if (!fullParams.poolBase) {
        return { missing: true };
      }
      ensurePoolCompatibilityMatrix(fullParams.poolBase);
      return { poolBase: fullParams.poolBase, augCost: Number(fullParams.augCost) || 0 };
    }
    const defaultName =
      fullParams.defaultArtifactName != null && String(fullParams.defaultArtifactName).trim() !== ""
        ? String(fullParams.defaultArtifactName).trim()
        : "None";
    const raw = phase.pathArtifactName;
    const name =
      raw != null && String(raw).trim() !== "" ? String(raw).trim() : defaultName;
    const poolBase = fullParams.poolBasesByArtifact[name];
    let augCost = 0;
    if (
      fullParams.augCostByArtifact &&
      fullParams.augCostByArtifact[name] != null
    ) {
      augCost = fullParams.augCostByArtifact[name];
    }
    if (!poolBase) {
      return { missing: true };
    }
    ensurePoolCompatibilityMatrix(poolBase);
    return { poolBase, augCost };
  }

  /**
   * @param {object} params — legacy: poolBase + augCost; preferred: poolBasesByArtifact + augCostByArtifact + defaultArtifactName
   * @param {() => boolean} [params.shouldCancel] - if true, return cancelled (checked between rolls / phases)
   */
  function runPathUntilCompleteSync({
    poolBase,
    phases,
    initialSlotSnapshot,
    slotCount,
    augCost,
    poolBasesByArtifact,
    augCostByArtifact,
    defaultArtifactName,
    shouldCancel
  }) {
    const fullParams = {
      poolBase,
      phases,
      initialSlotSnapshot,
      slotCount,
      augCost,
      poolBasesByArtifact,
      augCostByArtifact,
      defaultArtifactName
    };
    if (!usesPerArtifactPathPools(fullParams)) {
      if (poolBase) ensurePoolCompatibilityMatrix(poolBase);
    }
    const start = performance.now();
    let snapshot = cloneSlotSnapshot(initialSlotSnapshot);
    let totalRolls = 0;
    let totalDust = 0;
    const cancel = typeof shouldCancel === "function" ? shouldCancel : () => false;

    for (const phase of phases) {
      if (cancel()) {
        return { cancelled: true, totalRolls, totalDust, elapsedMs: performance.now() - start };
      }
      let activePhase = phase;
      if (phase.autoComplementFromPhase2) {
        const lockedNorms = new Set(
          snapshot.filter(s => s.locked && s.enchant).map(s => normalizeName(s.enchant?.name))
        );
        const pool = phase.phase2OrNorms || [];
        const present = pool.filter(n => lockedNorms.has(n));
        if (present.length !== 1) {
          return { impossible: true, totalRolls, totalDust, elapsedMs: performance.now() - start };
        }
        const hitOr = present[0];
        let targetNormSet;
        let targetNamesArr;
        if (phase.phase2Symmetric) {
          const remaining = pool.filter(n => !lockedNorms.has(n));
          if (!remaining.length) {
            return { impossible: true, totalRolls, totalDust, elapsedMs: performance.now() - start };
          }
          targetNormSet = new Set(remaining);
          targetNamesArr = remaining.map(n => phase.phase2NameByNorm[n]);
        } else {
          const an = phase.phase2AnchorNorm;
          const alts = phase.phase2AltNorms || [];
          if (hitOr === an) {
            if (!alts.length) {
              return { impossible: true, totalRolls, totalDust, elapsedMs: performance.now() - start };
            }
            targetNormSet = new Set(alts);
            targetNamesArr = alts.map(n => phase.phase2NameByNorm[n]);
          } else {
            targetNormSet = new Set([an]);
            targetNamesArr = [phase.phase2NameByNorm[an]];
          }
        }
        activePhase = {
          phaseIndex: phase.phaseIndex,
          targetNames: targetNamesArr,
          targetNorms: targetNormSet,
          requireNewTarget: false
        };
      }
      if (!activePhase.targetNames.length) {
        return { impossible: true, totalRolls, totalDust, elapsedMs: performance.now() - start };
      }

      const rolled = pickPoolForPhaseRoll(phase, fullParams);
      if (rolled.missing) {
        return { impossible: true, totalRolls, totalDust, elapsedMs: performance.now() - start };
      }

      let phaseSolved = false;
      const pathPhaseCtx = buildMonteCarloContextFromBase(rolled.poolBase, {
        targetNorms: activePhase.targetNorms,
        slotSnapshot: snapshot,
        requireNewTarget: !!activePhase.requireNewTarget,
        slotCount,
        augCost: rolled.augCost
      });

      if (pathPhaseCtx.hasLockedAnyTarget) {
        phaseSolved = true;
      } else if (!pathPhaseCtx.hasRollableSlot || !pathPhaseCtx.hasCompatibleTarget) {
        return { impossible: true, totalRolls, totalDust, elapsedMs: performance.now() - start };
      }

      while (!phaseSolved) {
        if (cancel()) {
          return { cancelled: true, totalRolls, totalDust, elapsedMs: performance.now() - start };
        }
        if (totalRolls >= PATH_SIM_MAX_TOTAL_ROLLS) {
          return {
            rolloutLimit: true,
            totalRolls,
            totalDust,
            elapsedMs: performance.now() - start
          };
        }

        pathPhaseCtx.slotSnapshot = snapshot;

        const lockedBeforeRoll = snapshot.filter(s => s.locked && s.enchant).length;
        pathPhaseCtx.perRollDust =
          ((BASE_DUST[slotCount] || 0) + rolled.augCost) * Math.pow(2, lockedBeforeRoll);

        const rollResult = simulateOneRollAndCapture(pathPhaseCtx);
        pathPhaseCtx.validSetCache.clear();
        pathPhaseCtx.samplerCache.clear();
        totalRolls++;
        totalDust += pathPhaseCtx.perRollDust;
        snapshot = rollResult.snapshot;

        if (rollResult.hit && rollResult.hitSlotIndex >= 0) {
          snapshot[rollResult.hitSlotIndex].locked = true;
          phaseSolved = true;
        }
      }
    }

    return {
      success: true,
      totalRolls,
      totalDust,
      elapsedMs: performance.now() - start
    };
  }

  async function runPathUntilCompleteAsync({
    poolBase,
    phases,
    initialSlotSnapshot,
    slotCount,
    augCost,
    poolBasesByArtifact,
    augCostByArtifact,
    defaultArtifactName,
    checkCancel,
    onProgress,
    yieldEveryRolls = 2500
  }) {
    const fullParams = {
      poolBase,
      phases,
      initialSlotSnapshot,
      slotCount,
      augCost,
      poolBasesByArtifact,
      augCostByArtifact,
      defaultArtifactName
    };
    if (!usesPerArtifactPathPools(fullParams)) {
      if (poolBase) ensurePoolCompatibilityMatrix(poolBase);
    }
    const start = performance.now();
    let snapshot = cloneSlotSnapshot(initialSlotSnapshot);
    let totalRolls = 0;
    let totalDust = 0;
    const cancel = typeof checkCancel === "function" ? checkCancel : () => false;

    for (const phase of phases) {
      if (cancel()) {
        return { cancelled: true, totalRolls, totalDust, elapsedMs: performance.now() - start };
      }
      let activePhase = phase;
      if (phase.autoComplementFromPhase2) {
        const lockedNorms = new Set(
          snapshot.filter(s => s.locked && s.enchant).map(s => normalizeName(s.enchant?.name))
        );
        const poolOr = phase.phase2OrNorms || [];
        const present = poolOr.filter(n => lockedNorms.has(n));
        if (present.length !== 1) {
          return { impossible: true, totalRolls, totalDust, elapsedMs: performance.now() - start };
        }
        const hitOr = present[0];
        let targetNormSet;
        let targetNamesArr;
        if (phase.phase2Symmetric) {
          const remaining = poolOr.filter(n => !lockedNorms.has(n));
          if (!remaining.length) {
            return { impossible: true, totalRolls, totalDust, elapsedMs: performance.now() - start };
          }
          targetNormSet = new Set(remaining);
          targetNamesArr = remaining.map(n => phase.phase2NameByNorm[n]);
        } else {
          const an = phase.phase2AnchorNorm;
          const alts = phase.phase2AltNorms || [];
          if (hitOr === an) {
            if (!alts.length) {
              return { impossible: true, totalRolls, totalDust, elapsedMs: performance.now() - start };
            }
            targetNormSet = new Set(alts);
            targetNamesArr = alts.map(n => phase.phase2NameByNorm[n]);
          } else {
            targetNormSet = new Set([an]);
            targetNamesArr = [phase.phase2NameByNorm[an]];
          }
        }
        activePhase = {
          phaseIndex: phase.phaseIndex,
          targetNames: targetNamesArr,
          targetNorms: targetNormSet,
          requireNewTarget: false
        };
      }
      if (!activePhase.targetNames.length) {
        return { impossible: true, totalRolls, totalDust, elapsedMs: performance.now() - start };
      }

      const rolledAsync = pickPoolForPhaseRoll(phase, fullParams);
      if (rolledAsync.missing) {
        return { impossible: true, totalRolls, totalDust, elapsedMs: performance.now() - start };
      }

      let phaseSolved = false;
      const pathPhaseCtx = buildMonteCarloContextFromBase(rolledAsync.poolBase, {
        targetNorms: activePhase.targetNorms,
        slotSnapshot: snapshot,
        requireNewTarget: !!activePhase.requireNewTarget,
        slotCount,
        augCost: rolledAsync.augCost
      });

      if (pathPhaseCtx.hasLockedAnyTarget) {
        phaseSolved = true;
      } else if (!pathPhaseCtx.hasRollableSlot || !pathPhaseCtx.hasCompatibleTarget) {
        return { impossible: true, totalRolls, totalDust, elapsedMs: performance.now() - start };
      }

      while (!phaseSolved) {
        if (cancel()) {
          return { cancelled: true, totalRolls, totalDust, elapsedMs: performance.now() - start };
        }
        if (totalRolls >= PATH_SIM_MAX_TOTAL_ROLLS) {
          return {
            rolloutLimit: true,
            totalRolls,
            totalDust,
            elapsedMs: performance.now() - start
          };
        }

        pathPhaseCtx.slotSnapshot = snapshot;

        const lockedBeforeRoll = snapshot.filter(s => s.locked && s.enchant).length;
        pathPhaseCtx.perRollDust =
          ((BASE_DUST[slotCount] || 0) + rolledAsync.augCost) * Math.pow(2, lockedBeforeRoll);

        const rollResult = simulateOneRollAndCapture(pathPhaseCtx);
        pathPhaseCtx.validSetCache.clear();
        pathPhaseCtx.samplerCache.clear();
        totalRolls++;
        totalDust += pathPhaseCtx.perRollDust;
        snapshot = rollResult.snapshot;

        if (rollResult.hit && rollResult.hitSlotIndex >= 0) {
          snapshot[rollResult.hitSlotIndex].locked = true;
          phaseSolved = true;
        }

        if (yieldEveryRolls > 0 && totalRolls % yieldEveryRolls === 0) {
          if (typeof onProgress === "function") onProgress(totalRolls);
          await new Promise(r => setTimeout(r, 0));
        }
      }
    }

    return {
      success: true,
      totalRolls,
      totalDust,
      elapsedMs: performance.now() - start
    };
  }

  function runPathBatchChunk({
    poolBase,
    phases,
    initialSlotSnapshot,
    slotCount,
    augCost,
    poolBasesByArtifact,
    augCostByArtifact,
    defaultArtifactName,
    trials,
    shouldCancel
  }) {
    const successRolls = [];
    const successDust = [];
    const successPathMs = [];
    let nSuccess = 0;
    let nImpossible = 0;
    let nRolloutLimit = 0;

    for (let i = 0; i < trials; i++) {
      if (shouldCancel()) {
        return { cancelled: true, trialsDone: i, nSuccess, nImpossible, nRolloutLimit, successRolls, successDust, successPathMs };
      }
      const freshSnap = cloneSlotSnapshot(initialSlotSnapshot);
      const r = runPathUntilCompleteSync({
        poolBase,
        phases,
        initialSlotSnapshot: freshSnap,
        slotCount,
        augCost,
        poolBasesByArtifact,
        augCostByArtifact,
        defaultArtifactName,
        shouldCancel
      });
      if (r.cancelled) {
        return { cancelled: true, trialsDone: i, nSuccess, nImpossible, nRolloutLimit, successRolls, successDust, successPathMs };
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
    }

    return {
      cancelled: false,
      trialsDone: trials,
      nSuccess,
      nImpossible,
      nRolloutLimit,
      successRolls,
      successDust,
      successPathMs
    };
  }

  const PathSimCore = {
    BASE_DUST,
    PATH_SIM_MAX_TOTAL_ROLLS,
    normalizeName,
    isCompatible,
    revivePoolBase,
    ensurePoolCompatibilityMatrix,
    buildMonteCarloContextFromBase,
    getTakenKey,
    getValidCandidateIndices,
    getOrBuildSampler,
    pickIndexFromSampler,
    simulateOneRollHitFast,
    cloneSlotSnapshot,
    simulateOneRollAndCapture,
    mean,
    minmax,
    runPathUntilCompleteSync,
    runPathUntilCompleteAsync,
    runPathBatchChunk
  };

  global.PathSimCore = PathSimCore;
})(typeof self !== "undefined" ? self : globalThis);
