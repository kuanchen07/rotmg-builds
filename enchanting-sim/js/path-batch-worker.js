/* global importScripts, postMessage, onmessage */
importScripts("path-sim-core.js");

let cancelRequested = false;

onmessage = function (e) {
  const d = e.data || {};
  if (d.type === "cancel") {
    cancelRequested = true;
    return;
  }
  if (d.type !== "run") return;

  cancelRequested = false;
  const {
    runId,
    trials,
    poolBase,
    poolBasesByArtifact,
    augCostByArtifact,
    defaultArtifactName,
    phases,
    initialSlotSnapshot,
    slotCount,
    augCost
  } = d;

  const result = PathSimCore.runPathBatchChunk({
    poolBase,
    poolBasesByArtifact,
    augCostByArtifact,
    defaultArtifactName,
    phases,
    initialSlotSnapshot,
    slotCount,
    augCost,
    trials,
    shouldCancel: () => cancelRequested
  });

  postMessage({ runId, clientToken: d.clientToken, ...result });
};
