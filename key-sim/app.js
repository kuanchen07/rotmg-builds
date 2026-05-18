(function (global) {
  "use strict";

  /** Repo-relative icons root (`icons/` from site root, `../icons/` for standalone key-sim/main.html). */
  function keyIconAssetPrefix() {
    var path = String(window.location.pathname || "").replace(/\\/g, "/");
    return path.indexOf("/key-sim/") !== -1 ? "../icons/" : "icons/";
  }

  /** Public B2 URL prefix; object keys match paths like keys/standard/foo-key.png. */
  var KEYS_CDN_BASE = "https://f005.backblazeb2.com/file/rotmg-icons/";

  function keyIconUrl(iconRel) {
    var path = String(iconRel || "").replace(/^\/+/g, "");
    if (/^https?:\/\//i.test(path)) return path;
    if (path === "keys/xp.png" || path === "keys/dust.png" || path === "keys/loot.png") {
      return keyIconAssetPrefix() + path;
    }
    if (path.indexOf("keys/grade/") === 0) {
      return keyIconAssetPrefix() + path;
    }
    if (path.indexOf("keys/") === 0) {
      return KEYS_CDN_BASE + path;
    }
    return keyIconAssetPrefix() + path;
  }

  function dungeonVisible(d) {
    return d && !d.hiddenFromPicker;
  }

  var GRADE_ORDER = ["D", "C", "B", "A", "S"];
  var SLOTS_BY_GRADE = { D: 1, C: 1, B: 2, A: 3, S: 4 };
  var GRADE_GREY_ICON_REL = "keys/grade/grey-grade.jpg";
  var GRADE_PIP_ICON_BY_LETTER = {
    D: "keys/grade/green-grade.jpg",
    C: "keys/grade/blue-grade.jpg",
    B: "keys/grade/purple-grade.jpg",
    A: "keys/grade/gold-grade.jpg",
    S: "keys/grade/red-grade.jpg"
  };

  /** @returns {string} relative path under icons/ for keyIconUrl */
  function gradePipIconRel(grade, slotIndex) {
    if (grade == null) return GRADE_GREY_ICON_REL;
    var n = GRADE_ORDER.indexOf(grade) + 1;
    if (n <= 0 || slotIndex < 0) return GRADE_GREY_ICON_REL;
    var colorRel = GRADE_PIP_ICON_BY_LETTER[grade];
    if (!colorRel) return GRADE_GREY_ICON_REL;
    return slotIndex < n ? colorRel : GRADE_GREY_ICON_REL;
  }

  function gradeFlowBadgeIconRel(displayLetter) {
    var c = String(displayLetter || "").trim();
    if (c === "\u2014" || c === "-" || c === "") return GRADE_GREY_ICON_REL;
    var rel = GRADE_PIP_ICON_BY_LETTER[c];
    return rel || GRADE_GREY_ICON_REL;
  }

  function setGradeFlowBadgeBackground(el, displayLetter) {
    if (!el) return;
    var url = keyIconUrl(gradeFlowBadgeIconRel(displayLetter));
    el.style.backgroundImage = "url(" + JSON.stringify(url) + ")";
  }

  function isCompatible(candidate, chosenArray) {
    var cLabels = new Set(candidate.labels || []);
    var cIncompat = new Set(candidate.incompatLabels || []);
    for (var i = 0; i < chosenArray.length; i += 1) {
      var ch = chosenArray[i];
      if (!ch) continue;
      var chLabels = new Set(ch.labels || []);
      var chIncompat = new Set(ch.incompatLabels || []);
      for (var cIt = cLabels.values(), cEl = cIt.next(); !cEl.done; cEl = cIt.next()) {
        var x = cEl.value;
        if (chIncompat.has(x)) return false;
      }
      for (var chIt = chLabels.values(), hEl = chIt.next(); !hEl.done; hEl = chIt.next()) {
        var y = hEl.value;
        if (cIncompat.has(y)) return false;
      }
      if (cLabels.has("SINGLESTAT") && chLabels.has("SINGLESTAT")) return false;
      if (cLabels.has("MANAREGEN") && chLabels.has("MANAREGEN")) return false;
    }
    return true;
  }

  function weightedPick(list) {
    var total = list.reduce(function (a, b) {
      return a + (Number(b.weight) || 0);
    }, 0);
    if (total <= 0 || !list.length) return null;
    var r = Math.random() * total;
    for (var i = 0; i < list.length; i += 1) {
      r -= Number(list[i].weight) || 0;
      if (r <= 0) return list[i];
    }
    return list[list.length - 1];
  }

  function getTierNums(labels) {
    var nums = [];
    (labels || []).forEach(function (L) {
      var m = /^TIER(\d+)$/.exec(L);
      if (m) nums.push(Number(m[1]));
    });
    return nums;
  }

  function tierAllowedSet(grade) {
    if (grade == null) return new Set();
    if (grade === "D") return new Set([1]);
    if (grade === "C") return new Set([1, 2]);
    if (grade === "B" || grade === "A") return new Set([1, 2, 3, 4]);
    if (grade === "S") return new Set([2, 3, 4]);
    return new Set([1, 2, 3, 4]);
  }

  function passesTierFilter(grade, mod) {
    var tiers = getTierNums(mod.labels || []);
    if (tiers.length === 0) return true;
    var allowed = tierAllowedSet(grade);
    return tiers.some(function (t) {
      return allowed.has(t);
    });
  }

  function modMatchesDungeon(mod, dungeon) {
    var labels = mod.labels || [];
    if (labels.indexOf("ANY") !== -1) return true;
    var tags = dungeon.modTags || [];
    if (!tags.length) return false;
    for (var i = 0; i < tags.length; i += 1) {
      if (labels.indexOf(tags[i]) !== -1) return true;
    }
    return false;
  }

  function passesHeroic(mod, dungeon) {
    var labels = mod.labels || [];
    if (labels.indexOf("HEROIC") !== -1 && !dungeon.heroic) return false;
    return true;
  }

  function modKind(mod) {
    var labels = mod.labels || [];
    if (labels.indexOf("UNIQUE") !== -1) return "unique";
    if (labels.indexOf("REWARD") !== -1) return "reward";
    if (labels.indexOf("ANY") === -1) return "special";
    return "normal";
  }

  function buildBasePool(mods, dungeon, grade) {
    return mods.filter(function (m) {
      if (!m.rollable) return false;
      if ((Number(m.weight) || 0) <= 0) return false;
      if (!modMatchesDungeon(m, dungeon)) return false;
      if (!passesHeroic(m, dungeon)) return false;
      if (!passesTierFilter(grade, m)) return false;
      return true;
    });
  }

  function rollUnlockedSlots(state, basePool) {
    var taken = [];
    for (var i = 0; i < state.slots.length; i += 1) {
      if (state.slots[i].locked && state.slots[i].mod) taken.push(state.slots[i].mod);
    }
    for (var j = 0; j < state.slots.length; j += 1) {
      if (state.slots[j].locked) continue;
      var valid = basePool.filter(function (e) {
        return isCompatible(e, taken);
      });
      if (!valid.length) {
        state.slots[j].mod = null;
        continue;
      }
      var pick = weightedPick(valid);
      state.slots[j].mod = pick;
      taken.push(pick);
    }
  }

  function syncSlotCount(state) {
    var n = state.grade == null ? 0 : SLOTS_BY_GRADE[state.grade];
    if (n == null || isNaN(n)) n = 0;
    while (state.slots.length < n) {
      state.slots.push({ mod: null, locked: false });
    }
    while (state.slots.length > n) {
      state.slots.pop();
    }
  }

  /** Percent bonus from multiplier, rounded for display. */
  function pctFromMultiplier(mult) {
    if (mult == null) return null;
    var x = Number(mult);
    if (isNaN(x)) return null;
    return Math.round((x - 1) * 100);
  }

  var REWARD_ICON_REL = { xp: "keys/xp.png", dust: "keys/dust.png", loot: "keys/loot.png" };
  var REWARD_KIND_ALT = { xp: "XP", dust: "Dust", loot: "Loot" };

  /** @returns {{ kind: 'xp'|'dust'|'loot', pct: number }[]} */
  function modRewardSegments(mod) {
    if (!mod) return [];
    var segs = [];
    var xp = pctFromMultiplier(mod.xpBonus);
    var dust = pctFromMultiplier(mod.dustBonus);
    var loot = pctFromMultiplier(mod.lootBonus);
    if (xp != null) segs.push({ kind: "xp", pct: xp });
    if (dust != null) segs.push({ kind: "dust", pct: dust });
    if (loot != null) segs.push({ kind: "loot", pct: loot });
    return segs;
  }

  /** Space-separated plain text (for aria-labels). */
  function modRewardTagLine(mod) {
    if (!mod) return "";
    var parts = [];
    var xp = pctFromMultiplier(mod.xpBonus);
    var dust = pctFromMultiplier(mod.dustBonus);
    var loot = pctFromMultiplier(mod.lootBonus);
    if (xp != null) parts.push("XP+" + xp + "%");
    if (dust != null) parts.push("Dust+" + dust + "%");
    if (loot != null) parts.push("Loot+" + loot + "%");
    return parts.join(" ");
  }

  /** Additive XP / Dust / Loot totals (percent points); skips falsy mods. */
  function rewardTotalsPctFromMods(modArr) {
    var tx = 0;
    var td = 0;
    var tl = 0;
    for (var i = 0; i < modArr.length; i += 1) {
      var m = modArr[i];
      if (!m) continue;
      var x = pctFromMultiplier(m.xpBonus);
      var d = pctFromMultiplier(m.dustBonus);
      var l = pctFromMultiplier(m.lootBonus);
      if (x != null) tx += x;
      if (d != null) td += d;
      if (l != null) tl += l;
    }
    return { xp: tx, dust: td, loot: tl };
  }

  /** Additive XP / Dust / Loot totals (percent points), including zeros omitted from rewardSummarySegments. */
  function rewardTotalsPct(slots) {
    var arr = [];
    for (var i = 0; i < slots.length; i += 1) {
      arr.push(slots[i].mod);
    }
    return rewardTotalsPctFromMods(arr);
  }

  /** Additive totals across slots (nonzero only, same order as single-mod). */
  function rewardSummarySegments(slots) {
    var tx = 0;
    var td = 0;
    var tl = 0;
    for (var i = 0; i < slots.length; i += 1) {
      var m = slots[i].mod;
      if (!m) continue;
      var x = pctFromMultiplier(m.xpBonus);
      var d = pctFromMultiplier(m.dustBonus);
      var l = pctFromMultiplier(m.lootBonus);
      if (x != null) tx += x;
      if (d != null) td += d;
      if (l != null) tl += l;
    }
    var segs = [];
    if (tx) segs.push({ kind: "xp", pct: tx });
    if (td) segs.push({ kind: "dust", pct: td });
    if (tl) segs.push({ kind: "loot", pct: tl });
    return segs;
  }

  /**
   * @param {HTMLElement} el
   * @param {{ kind: 'xp'|'dust'|'loot', pct: number }[]} segments
   * @param {string} [emptyFallbackText]
   */
  function fillRewardChips(el, segments, emptyFallbackText) {
    if (!el) return;
    el.textContent = "";
    if (!segments || !segments.length) {
      if (emptyFallbackText != null && emptyFallbackText !== "") {
        el.textContent = emptyFallbackText;
      }
      return;
    }
    for (var i = 0; i < segments.length; i += 1) {
      var chip = document.createElement("span");
      chip.className = "key-sim__reward-chip";
      var seg = segments[i];
      var img = document.createElement("img");
      img.className = "key-sim__reward-chip-icon";
      img.src = keyIconUrl(REWARD_ICON_REL[seg.kind]);
      img.alt = REWARD_KIND_ALT[seg.kind];
      img.width = 14;
      img.height = 14;
      img.decoding = "async";
      var pctSpan = document.createElement("span");
      pctSpan.className = "key-sim__reward-chip-pct";
      pctSpan.textContent = "+" + seg.pct + "%";
      chip.appendChild(img);
      chip.appendChild(pctSpan);
      el.appendChild(chip);
    }
  }

  var state = {
    mods: [],
    dungeons: [],
    visibleDungeonIndices: [],
    dungeonIndex: 0,
    grade: null,
    slots: []
  };

  /** Snapshots of { grade, slots } before each reroll / upgrade (dungeon change clears). */
  var undoStack = [];

  var simRunning = false;
  var simSidebarOpen = false;
  var simCancelRequested = false;
  /** Refreshes mod checks + simulator min widgets when sidebar is open. */
  var refreshSimSidebarIfOpen = function () {};
  var SIM_MAX_ROLLS = 8000000;
  var SIM_CHUNK = 5000;
  /** Hard cap for simulator minimum +% sliders and number boxes. */
  var SIM_MIN_BONUS_CAP_PCT = 100;

  function pushUndoSnapshot() {
    undoStack.push({
      grade: state.grade,
      slots: state.slots.map(function (s) {
        return { mod: s.mod, locked: !!s.locked };
      })
    });
    renderUndoControl();
  }

  function clearUndoStack() {
    undoStack.length = 0;
    renderUndoControl();
  }

  function renderUndoControl() {
    var undoBtn = document.getElementById("keySimUndo");
    if (undoBtn) {
      undoBtn.hidden = state.grade == null;
      undoBtn.disabled = undoStack.length === 0;
    }
    var diceBtn = document.getElementById("keySimDice");
    if (diceBtn) {
      diceBtn.hidden = state.grade == null;
      diceBtn.disabled = state.grade == null || simRunning;
    }
  }

  function popUndo() {
    if (!undoStack.length) return;
    var snap = undoStack.pop();
    state.grade = snap.grade;
    state.slots = snap.slots.map(function (s) {
      return { mod: s.mod, locked: !!s.locked };
    });
    syncSlotCount(state);
    setError("");
    renderKeyChrome();
    renderSlots();
    renderUpgradeDisabled();
    refreshSimSidebarIfOpen();
  }

  function currentDungeon() {
    return state.dungeons[state.dungeonIndex] || state.dungeons[0];
  }

  function setError(msg) {
    var el = document.getElementById("keySimErr");
    if (!el) return;
    if (msg) {
      el.hidden = false;
      el.textContent = msg;
    } else {
      el.hidden = true;
      el.textContent = "";
    }
  }

  function renderRefineTitle() {
    var sp = document.getElementById("keySimRefineTitleName");
    if (!sp) return;
    var d = currentDungeon();
    sp.textContent = d && d.name ? d.name : "—";
  }

  function renderKeyChrome() {
    var g = state.grade;
    var keyCard = document.querySelector(".key-sim__key-card");
    if (keyCard) {
      keyCard.classList.remove(
        "key-sim__key-card--grade-d",
        "key-sim__key-card--grade-c",
        "key-sim__key-card--grade-b",
        "key-sim__key-card--grade-a",
        "key-sim__key-card--grade-s"
      );
      if (g === "D") keyCard.classList.add("key-sim__key-card--grade-d");
      else if (g === "C") keyCard.classList.add("key-sim__key-card--grade-c");
      else if (g === "B") keyCard.classList.add("key-sim__key-card--grade-b");
      else if (g === "A") keyCard.classList.add("key-sim__key-card--grade-a");
      else if (g === "S") keyCard.classList.add("key-sim__key-card--grade-s");
    }

    var shell = document.querySelector(".key-sim-shell");
    if (shell) {
      shell.classList.remove(
        "key-sim-shell--grade-d",
        "key-sim-shell--grade-c",
        "key-sim-shell--grade-b",
        "key-sim-shell--grade-a",
        "key-sim-shell--grade-s"
      );
      if (g === "D") shell.classList.add("key-sim-shell--grade-d");
      else if (g === "C") shell.classList.add("key-sim-shell--grade-c");
      else if (g === "B") shell.classList.add("key-sim-shell--grade-b");
      else if (g === "A") shell.classList.add("key-sim-shell--grade-a");
      else if (g === "S") shell.classList.add("key-sim-shell--grade-s");
    }

    var cardG = document.getElementById("keySimCardGrade");
    if (cardG) cardG.textContent = g == null ? "No Grade" : "Grade " + g;

    var gradeFlow = document.getElementById("keySimGradeFlow");
    if (gradeFlow) {
      gradeFlow.hidden = g === "S";
      if (g == null) {
        gradeFlow.setAttribute("aria-label", "No grade. Upgrade to reach Grade D.");
      } else {
        gradeFlow.removeAttribute("aria-label");
      }
    }

    var prefixEl = document.getElementById("keySimGradeFlowPrefix");
    var diamondEl = document.getElementById("keySimGradeDiamond");
    if (prefixEl) prefixEl.hidden = g == null;
    if (diamondEl) {
      diamondEl.hidden = g != null;
      diamondEl.src = keyIconUrl(GRADE_GREY_ICON_REL);
    }

    var gFrom = document.getElementById("keySimGradeFrom");
    var gTo = document.getElementById("keySimGradeTo");
    if (gFrom) {
      if (g != null) {
        gFrom.textContent = g;
        setGradeFlowBadgeBackground(gFrom, g);
      } else {
        gFrom.style.backgroundImage = "";
      }
    }
    if (gTo) {
      if (g == null) {
        gTo.textContent = "D";
      } else {
        var ix = GRADE_ORDER.indexOf(g);
        if (ix < 0 || ix >= GRADE_ORDER.length - 1) {
          gTo.textContent = "\u2014";
        } else {
          gTo.textContent = GRADE_ORDER[ix + 1];
        }
      }
      gTo.classList.toggle("key-sim__grade-badge--tier-d", g == null);
      setGradeFlowBadgeBackground(gTo, gTo.textContent);
    }

    var pipsRoot = document.getElementById("keySimPips");
    if (pipsRoot) {
      pipsRoot.innerHTML = "";
      for (var p = 0; p < 5; p += 1) {
        var pip = document.createElement("img");
        pip.className = "key-sim__pip";
        pip.src = keyIconUrl(gradePipIconRel(g, p));
        pip.alt = "";
        pip.width = 12;
        pip.height = 12;
        pip.decoding = "async";
        pipsRoot.appendChild(pip);
      }
    }

    renderRefineTitle();
    renderUndoControl();
  }

  function renderSlots() {
    var root = document.getElementById("keySimSlots");
    if (!root) return;
    root.innerHTML = "";
    for (var i = 0; i < state.slots.length; i += 1) {
      var s = state.slots[i];
      var kind = s.mod ? modKind(s.mod) : "empty";
      var row = document.createElement("div");
      row.className =
        "key-sim__slot-row key-sim__slot key-sim__slot--" +
        (s.mod ? kind : "empty");

      var card = document.createElement("div");
      card.className = "key-sim__slot-card" + (s.mod ? "" : " key-sim__slot-card--empty");
      var top = document.createElement("div");
      top.className = "key-sim__slot-top";
      var name = document.createElement("div");
      name.className = "key-sim__slot-name";
      name.textContent = s.mod ? s.mod.name : "— empty —";
      top.appendChild(name);
      if (s.mod) {
        var tags = document.createElement("div");
        tags.className = "key-sim__slot-tags";
        var aria = modRewardTagLine(s.mod);
        if (aria) tags.setAttribute("aria-label", aria);
        fillRewardChips(tags, modRewardSegments(s.mod));
        top.appendChild(tags);
      }
      card.appendChild(top);
      if (s.mod && s.mod.description) {
        var desc = document.createElement("div");
        desc.className = "key-sim__slot-desc";
        desc.textContent = s.mod.description;
        card.appendChild(desc);
      }
      row.appendChild(card);

      var lockBtn = document.createElement("button");
      lockBtn.type = "button";
      lockBtn.className = "key-sim__slot-lock";
      lockBtn.setAttribute("aria-label", s.locked ? "Locked — click to unlock" : "Unlocked — click to lock");
      lockBtn.setAttribute("aria-pressed", s.locked ? "true" : "false");
      lockBtn.textContent = s.locked ? "🔒" : "🔓";
      lockBtn.addEventListener(
        "click",
        function (slotRef, btn) {
          return function () {
            slotRef.locked = !slotRef.locked;
            btn.setAttribute("aria-pressed", slotRef.locked ? "true" : "false");
            btn.setAttribute(
              "aria-label",
              slotRef.locked ? "Locked — click to unlock" : "Unlocked — click to lock"
            );
            btn.textContent = slotRef.locked ? "🔒" : "🔓";
          };
        }(s, lockBtn)
      );
      row.appendChild(lockBtn);

      root.appendChild(row);
    }
    var rew = document.getElementById("keySimRewards");
    if (rew) fillRewardChips(rew, rewardSummarySegments(state.slots), "No bonus modifiers.");
  }

  function renderKeyIcon() {
    var d = currentDungeon();
    var img = document.getElementById("keySimIcon");
    if (!img || !d) return;
    var fallback = keyIconUrl("keys/mystery/common-mystery-key.png");
    img.onerror = function () {
      img.onerror = null;
      img.src = fallback;
    };
    img.src = keyIconUrl(d.icon);
    img.alt = d.name + " key";
    img.hidden = false;
  }

  function renderUpgradeDisabled() {
    var btn = document.getElementById("keySimUpgrade");
    if (btn) btn.disabled = state.grade === "S";
  }

  function cloneSlotsDeep(slots) {
    return slots.map(function (s) {
      return { mod: s.mod, locked: !!s.locked };
    });
  }

  function clampSimMinBonusPct(raw) {
    var n = Math.floor(Number(raw));
    if (isNaN(n) || n < 0) return 0;
    if (n > SIM_MIN_BONUS_CAP_PCT) return SIM_MIN_BONUS_CAP_PCT;
    return n;
  }

  /** Canonical value lives on the range input (kept in sync with the number box). */
  function parseSimRewardMin(rangeId) {
    var el = document.getElementById(rangeId);
    if (!el || el.disabled) return null;
    var n = clampSimMinBonusPct(el.value);
    if (n < 1) return null;
    return n;
  }

  function simParseMins() {
    return {
      xp: parseSimRewardMin("keySimSimMinXp"),
      dust: parseSimRewardMin("keySimSimMinDust"),
      loot: parseSimRewardMin("keySimSimMinLoot")
    };
  }

  function simThresholdsMet(slots, mins) {
    var hasAny = mins.xp != null || mins.dust != null || mins.loot != null;
    if (!hasAny) return false;
    var t = rewardTotalsPct(slots);
    if (mins.xp != null && t.xp < mins.xp) return false;
    if (mins.dust != null && t.dust < mins.dust) return false;
    if (mins.loot != null && t.loot < mins.loot) return false;
    return true;
  }

  function simStopModsMet(slots, nameSet) {
    if (!nameSet || !nameSet.size) return false;
    for (var i = 0; i < slots.length; i += 1) {
      var m = slots[i].mod;
      if (m && m.name && nameSet.has(m.name)) return true;
    }
    return false;
  }

  function simCriteriaMet(slots, mins, nameSet) {
    return simThresholdsMet(slots, mins) || simStopModsMet(slots, nameSet);
  }

  function simCollectCheckedNames(modsRootEl) {
    var set = new Set();
    if (!modsRootEl) return set;
    var boxes = modsRootEl.querySelectorAll("input[type=\"checkbox\"][data-key-sim-stop-mod]");
    for (var i = 0; i < boxes.length; i += 1) {
      var b = boxes[i];
      if (b.checked && b.getAttribute("data-key-sim-stop-mod")) {
        set.add(b.getAttribute("data-key-sim-stop-mod"));
      }
    }
    return set;
  }

  function simHasStopCriteria(mins, nameSet) {
    var hasMin = mins.xp != null || mins.dust != null || mins.loot != null;
    return hasMin || (nameSet && nameSet.size > 0);
  }

  function populateSimModCheckboxes() {
    var root = document.getElementById("keySimSimMods");
    if (!root) return;
    root.textContent = "";
    var d = currentDungeon();
    if (!d || state.grade == null) {
      var hint = document.createElement("p");
      hint.className = "key-sim-sim__mods-empty muted";
      hint.textContent = "Upgrade to roll mods to see the mod list.";
      root.appendChild(hint);
      return;
    }
    var pool = buildBasePool(state.mods, d, state.grade);
    if (!pool.length) {
      var empty = document.createElement("p");
      empty.className = "key-sim-sim__mods-empty muted";
      empty.textContent = "No rollable mods for this key and grade.";
      root.appendChild(empty);
      return;
    }
    var names = [];
    var seen = new Set();
    for (var i = 0; i < pool.length; i += 1) {
      var nm = pool[i].name;
      if (!nm || seen.has(nm)) continue;
      var nmLower = nm.toLowerCase();
      if (!nmLower.includes("generous") && !nmLower.includes("exalted banner")) continue;
      seen.add(nm);
      names.push(nm);
    }
    names.sort(function (a, b) {
      return String(a).localeCompare(String(b));
    });
    for (var j = 0; j < names.length; j += 1) {
      var lab = document.createElement("label");
      lab.className = "key-sim-sim__mod-row";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.setAttribute("data-key-sim-stop-mod", names[j]);
      lab.appendChild(cb);
      var sp = document.createElement("span");
      sp.textContent = names[j];
      lab.appendChild(sp);
      root.appendChild(lab);
    }
  }

  function yieldToBrowser() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        resolve();
      });
    });
  }

  async function init() {
    var base = String(global.__KEY_SIM_DATA_BASE__ || "key-sim").replace(/\/+$/, "");
    setError("");
    try {
      var r1 = await fetch(base + "/mods.json", { cache: "no-cache" });
      var r2 = await fetch(base + "/dungeons.json", { cache: "no-cache" });
      if (!r1.ok) throw new Error("mods.json: " + r1.status);
      if (!r2.ok) throw new Error("dungeons.json: " + r2.status);
      state.mods = await r1.json();
      state.dungeons = await r2.json();
    } catch (e) {
      setError(String(e && e.message ? e.message : e));
      return;
    }

    var visibleIndices = [];
    for (var di = 0; di < state.dungeons.length; di += 1) {
      if (dungeonVisible(state.dungeons[di])) visibleIndices.push(di);
    }
    state.visibleDungeonIndices = visibleIndices;

    var sel = document.getElementById("keySimDungeon");
    if (sel) {
      sel.innerHTML = "";
      for (var k = 0; k < visibleIndices.length; k += 1) {
        var opt = document.createElement("option");
        opt.value = String(k);
        opt.textContent = state.dungeons[visibleIndices[k]].name;
        sel.appendChild(opt);
      }
      state.dungeonIndex = visibleIndices.length ? visibleIndices[0] : 0;
      sel.value = "0";
      sel.addEventListener("change", function () {
        var visPick = Number(sel.value);
        if (isNaN(visPick) || visPick < 0) visPick = 0;
        var vis = state.visibleDungeonIndices || [];
        state.dungeonIndex = vis.length && vis[visPick] != null ? vis[visPick] : 0;
        state.grade = null;
        clearUndoStack();
        syncSlotCount(state);
        renderKeyIcon();
        renderKeyChrome();
        renderSlots();
        renderUpgradeDisabled();
        refreshSimSidebarIfOpen();
      });
    }

    var rollBtn = document.getElementById("keySimRoll");
    function tryRollForGrade(grade) {
      var d = currentDungeon();
      if (!d || !state.mods.length) {
        setError("Select a dungeon.");
        return false;
      }
      var pool = buildBasePool(state.mods, d, grade);
      if (!pool.length) {
        setError("No rollable mods match this dungeon and grade (check filters).");
        renderSlots();
        return false;
      }
      pushUndoSnapshot();
      setError("");
      rollUnlockedSlots(state, pool);
      renderSlots();
      return true;
    }
    function doRoll() {
      if (state.grade == null) {
        setError("Upgrade to Grade D to roll mods.");
        return;
      }
      tryRollForGrade(state.grade);
      refreshSimSidebarIfOpen();
    }
    if (rollBtn) rollBtn.addEventListener("click", doRoll);

    var undoBtn = document.getElementById("keySimUndo");
    var undoIcon = document.getElementById("keySimUndoIcon");
    if (undoIcon) undoIcon.src = keyIconUrl("undo.png");
    if (undoBtn) undoBtn.addEventListener("click", popUndo);

    var diceIcon = document.getElementById("keySimDiceIcon");
    if (diceIcon) diceIcon.src = keyIconUrl("dice.png");

    var simBackdrop = document.getElementById("keySimSimBackdrop");
    var simPanel = document.getElementById("keySimSimPanel");
    var simClose = document.getElementById("keySimSimClose");
    var simRun = document.getElementById("keySimSimRun");
    var simCancel = document.getElementById("keySimSimCancel");
    var simProgress = document.getElementById("keySimSimProgress");
    var simResult = document.getElementById("keySimSimResult");
    var simModsRoot = document.getElementById("keySimSimMods");

    var simRewardPairs = [
      { range: "keySimSimMinXp", text: "keySimSimMinXpTxt" },
      { range: "keySimSimMinDust", text: "keySimSimMinDustTxt" },
      { range: "keySimSimMinLoot", text: "keySimSimMinLootTxt" }
    ];

    function syncRewardPairFromRange(rangeEl, textEl) {
      if (!rangeEl || !textEl) return;
      var c = clampSimMinBonusPct(rangeEl.value);
      rangeEl.value = String(c);
      textEl.value = String(c);
      rangeEl.setAttribute("aria-valuenow", String(c));
      rangeEl.setAttribute("aria-valuemax", String(SIM_MIN_BONUS_CAP_PCT));
    }

    function syncRewardPairFromText(textEl, rangeEl) {
      if (!rangeEl || !textEl) return;
      var c = clampSimMinBonusPct(textEl.value);
      rangeEl.value = String(c);
      textEl.value = String(c);
      rangeEl.setAttribute("aria-valuenow", String(c));
      rangeEl.setAttribute("aria-valuemax", String(SIM_MIN_BONUS_CAP_PCT));
    }

    function configureSimRewardMinControls() {
      var d = currentDungeon();
      var poolOk =
        d &&
        state.grade != null &&
        state.mods.length > 0 &&
        buildBasePool(state.mods, d, state.grade).length > 0;
      var dis = !poolOk;
      for (var pi = 0; pi < simRewardPairs.length; pi += 1) {
        var pair = simRewardPairs[pi];
        var rEl = document.getElementById(pair.range);
        var tEl = document.getElementById(pair.text);
        if (!rEl || !tEl) continue;
        rEl.min = "0";
        rEl.max = String(SIM_MIN_BONUS_CAP_PCT);
        rEl.step = "1";
        tEl.min = "0";
        tEl.max = String(SIM_MIN_BONUS_CAP_PCT);
        tEl.step = "1";
        rEl.disabled = dis;
        tEl.disabled = dis;
        var cur = dis ? 0 : clampSimMinBonusPct(rEl.value);
        rEl.value = String(cur);
        tEl.value = String(cur);
        syncRewardPairFromRange(rEl, tEl);
      }
    }

    function updateSimRunDisabled() {
      if (!simRun) return;
      if (simRunning) {
        simRun.disabled = true;
        return;
      }
      var d = currentDungeon();
      var poolOk =
        d &&
        state.grade != null &&
        buildBasePool(state.mods, d, state.grade).length > 0;
      var mins = simParseMins();
      var names = simCollectCheckedNames(simModsRoot);
      simRun.disabled = !poolOk || state.grade == null || !simHasStopCriteria(mins, names);
    }

    function clearSimProgress() {
      if (simProgress) simProgress.textContent = "";
    }

    function renderSimSuccess(rolls, slots) {
      if (!simResult) return;
      simResult.textContent = "";
      var summary = document.createElement("p");
      summary.className = "key-sim-sim__result-line";
      summary.textContent = "Stopped after " + rolls.toLocaleString() + " roll(s).";
      simResult.appendChild(summary);
      var bonusLabel = document.createElement("p");
      bonusLabel.className = "key-sim-sim__result-line muted";
      bonusLabel.textContent = "Bonus totals:";
      simResult.appendChild(bonusLabel);
      var chips = document.createElement("div");
      chips.className = "key-sim-sim__result-chips";
      fillRewardChips(chips, rewardSummarySegments(slots), "None.");
      simResult.appendChild(chips);
      var modsLabel = document.createElement("p");
      modsLabel.className = "key-sim-sim__result-line muted";
      modsLabel.style.marginTop = "0.35rem";
      modsLabel.textContent = "Mods:";
      simResult.appendChild(modsLabel);
      var modLine = document.createElement("p");
      modLine.className = "key-sim-sim__result-line";
      var parts = [];
      for (var si = 0; si < slots.length; si += 1) {
        parts.push(slots[si].mod ? slots[si].mod.name : "(empty)");
      }
      modLine.textContent = parts.join(", ");
      simResult.appendChild(modLine);
    }

    function closeSimSidebar() {
      if (!simPanel || !simBackdrop) return;
      simCancelRequested = true;
      simSidebarOpen = false;
      simPanel.classList.remove("key-sim-sim--open");
      simBackdrop.setAttribute("aria-hidden", "true");
      document.body.classList.remove("key-sim-sim-active");
      window.setTimeout(function () {
        simPanel.hidden = true;
        simBackdrop.hidden = true;
      }, 200);
    }

    function openSimSidebar() {
      if (!simPanel || !simBackdrop || state.grade == null) return;
      simSidebarOpen = true;
      if (simResult) simResult.textContent = "";
      clearSimProgress();
      populateSimModCheckboxes();
      configureSimRewardMinControls();
      updateSimRunDisabled();
      simBackdrop.hidden = false;
      simPanel.hidden = false;
      simBackdrop.setAttribute("aria-hidden", "false");
      document.body.classList.add("key-sim-sim-active");
      requestAnimationFrame(function () {
        simPanel.classList.add("key-sim-sim--open");
      });
    }

    refreshSimSidebarIfOpen = function () {
      if (!simSidebarOpen) return;
      populateSimModCheckboxes();
      configureSimRewardMinControls();
      updateSimRunDisabled();
    };

    async function runSimulation() {
      var d = currentDungeon();
      if (!d || state.grade == null) return;
      var pool = buildBasePool(state.mods, d, state.grade);
      if (!pool.length) {
        if (simProgress) simProgress.textContent = "No rollable mods for this key and grade.";
        return;
      }
      var mins = simParseMins();
      var nameSet = simCollectCheckedNames(simModsRoot);
      if (!simHasStopCriteria(mins, nameSet)) {
        if (simProgress) simProgress.textContent = "Set min above 0 (slider or %) or check a mod.";
        updateSimRunDisabled();
        return;
      }
      simRunning = true;
      simCancelRequested = false;
      renderUndoControl();
      if (simResult) simResult.textContent = "";
      if (simProgress) simProgress.textContent = "Rolling…";
      if (simRun) simRun.hidden = true;
      if (simCancel) simCancel.hidden = false;

      var work = { slots: cloneSlotsDeep(state.slots) };
      var rolls = 0;

      try {
        while (rolls < SIM_MAX_ROLLS && !simCancelRequested) {
          var chunkTarget = Math.min(SIM_CHUNK, SIM_MAX_ROLLS - rolls);
          for (var c = 0; c < chunkTarget; c += 1) {
            rollUnlockedSlots(work, pool);
            rolls += 1;
            if (simCriteriaMet(work.slots, mins, nameSet)) {
              pushUndoSnapshot();
              state.slots = cloneSlotsDeep(work.slots);
              setError("");
              renderSlots();
              renderUndoControl();
              clearSimProgress();
              renderSimSuccess(rolls, state.slots);
              refreshSimSidebarIfOpen();
              return;
            }
          }
          if (simProgress) simProgress.textContent = rolls.toLocaleString() + " rolls…";
          await yieldToBrowser();
        }

        if (simCancelRequested) {
          if (simProgress) simProgress.textContent = "Canceled.";
        } else if (simProgress) {
          simProgress.textContent =
            "No match within " + SIM_MAX_ROLLS.toLocaleString() + " rolls. Try looser criteria.";
        }
      } finally {
        simRunning = false;
        if (simRun) simRun.hidden = false;
        if (simCancel) simCancel.hidden = true;
        renderUndoControl();
        updateSimRunDisabled();
      }
    }

    var diceBtn = document.getElementById("keySimDice");
    if (diceBtn) {
      diceBtn.addEventListener("click", function () {
        if (simSidebarOpen) closeSimSidebar();
        else openSimSidebar();
      });
    }

    if (simBackdrop) {
      simBackdrop.addEventListener("click", function () {
        closeSimSidebar();
      });
    }
    if (simClose) {
      simClose.addEventListener("click", function () {
        closeSimSidebar();
      });
    }
    if (simCancel) {
      simCancel.addEventListener("click", function () {
        simCancelRequested = true;
      });
    }
    if (simRun) {
      simRun.addEventListener("click", function () {
        runSimulation();
      });
    }

    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      if (!simSidebarOpen) return;
      closeSimSidebar();
    });

    simRewardPairs.forEach(function (pair) {
      var rangeEl = document.getElementById(pair.range);
      var textEl = document.getElementById(pair.text);
      if (!rangeEl || !textEl) return;
      rangeEl.addEventListener("input", function () {
        syncRewardPairFromRange(rangeEl, textEl);
        updateSimRunDisabled();
      });
      textEl.addEventListener("input", function () {
        syncRewardPairFromText(textEl, rangeEl);
        updateSimRunDisabled();
      });
      textEl.addEventListener("change", function () {
        syncRewardPairFromText(textEl, rangeEl);
        updateSimRunDisabled();
      });
      textEl.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          syncRewardPairFromText(textEl, rangeEl);
          updateSimRunDisabled();
        }
      });
    });

    if (simModsRoot) {
      simModsRoot.addEventListener("change", function (ev) {
        var t = ev.target;
        if (t && t.matches && t.matches("input[type=\"checkbox\"]")) updateSimRunDisabled();
      });
    }

    function applyGradeUpgrade(pool, nextGrade) {
      pushUndoSnapshot();
      state.grade = nextGrade;
      syncSlotCount(state);
      setError("");
      rollUnlockedSlots(state, pool);
      renderKeyChrome();
      renderSlots();
      renderUpgradeDisabled();
      refreshSimSidebarIfOpen();
    }

    var up = document.getElementById("keySimUpgrade");
    if (up) {
      up.addEventListener("click", function () {
        var d = currentDungeon();
        if (!d || !state.mods.length) {
          setError("Select a dungeon.");
          return;
        }
        var nextGrade;
        if (state.grade == null) {
          nextGrade = "D";
        } else {
          var ix = GRADE_ORDER.indexOf(state.grade);
          if (ix < 0 || ix >= GRADE_ORDER.length - 1) return;
          nextGrade = GRADE_ORDER[ix + 1];
        }
        var pool = buildBasePool(state.mods, d, nextGrade);
        if (!pool.length) {
          setError("No rollable mods match this dungeon and grade (check filters).");
          renderSlots();
          return;
        }
        applyGradeUpgrade(pool, nextGrade);
      });
    }

    syncSlotCount(state);
    renderKeyChrome();
    renderKeyIcon();
    renderSlots();
    renderUpgradeDisabled();
    renderUndoControl();
    configureSimRewardMinControls();
  }

  global.KeySim = { init: init };
})(window);
