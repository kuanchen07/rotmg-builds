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
        syncSlotCount(state);
        renderKeyIcon();
        renderKeyChrome();
        renderSlots();
        renderUpgradeDisabled();
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
    }
    if (rollBtn) rollBtn.addEventListener("click", doRoll);

    function applyGradeUpgrade(pool, nextGrade) {
      state.grade = nextGrade;
      syncSlotCount(state);
      setError("");
      rollUnlockedSlots(state, pool);
      renderKeyChrome();
      renderSlots();
      renderUpgradeDisabled();
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
  }

  global.KeySim = { init: init };
})(window);
