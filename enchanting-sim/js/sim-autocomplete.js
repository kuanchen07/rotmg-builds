/* ---------- IMPROVED AUTOCOMPLETE FOR TARGET ENCHANT INPUT ---------- */

const enchantHaystackCache = new Map();

function romanToInt(token) {
  if (!token || typeof token !== 'string') return 0;
  const upper = token.trim().toUpperCase();
  if (!/^[IVXLCDM]+$/.test(upper)) return 0;
  const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < upper.length; i++) {
    const cur = map[upper[i]];
    const next = map[upper[i + 1]];
    if (cur == null) return 0;
    if (next != null && cur < next) total -= cur;
    else total += cur;
  }
  return total > 0 && total <= 39 ? total : 0;
}

function trailingRomanTier(name) {
  const parts = String(name || '').trim().split(/\s+/);
  if (!parts.length) return null;
  const n = romanToInt(parts[parts.length - 1]);
  return n > 0 ? n : null;
}

function enchantAutocompleteHaystack(name) {
  if (enchantHaystackCache.has(name)) return enchantHaystackCache.get(name);
  const lower = String(name || '').toLowerCase();
  let extra = '';
  const tier = trailingRomanTier(name);
  if (tier != null) extra += ` ${tier}`;
  const abbrevs = [
    ['relative', 'rel'],
    ['attack', 'atk'],
    ['defense', 'def'],
    ['dexterity', 'dex'],
    ['vitality', 'vit'],
    ['speed', 'spd'],
    ['wisdom', 'wis'],
  ];
  for (const [word, abbr] of abbrevs) {
    if (lower.includes(word)) extra += ` ${abbr}`;
  }
  const haystack = lower + extra;
  enchantHaystackCache.set(name, haystack);
  return haystack;
}

function escapeRegexChars(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function initEnchantTargetAutocomplete(input, options = {}) {
  if (!input || input.dataset.enchantAutocompleteInitialized === '1') return;
  input.dataset.enchantAutocompleteInitialized = '1';

  const wrapper = document.createElement('div');
  wrapper.className = 'target-enchant-wrap';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  const suggestionsBox = document.createElement('div');
  suggestionsBox.className = 'suggest-box';
  suggestionsBox.style.position = 'absolute';
  suggestionsBox.style.top = '100%';
  suggestionsBox.style.left = '0';
  suggestionsBox.style.right = '0';
  suggestionsBox.style.zIndex = '999';
  wrapper.appendChild(suggestionsBox);

  let activeIndex = -1;
  /** After picking a suggestion we dispatch `input`; without this the handler would rebuild the list because the chosen name still matches. */
  let suppressSuggestionsOnce = false;

  input.addEventListener('input', () => {
    if (suppressSuggestionsOnce) {
      suppressSuggestionsOnce = false;
      suggestionsBox.innerHTML = '';
      activeIndex = -1;
      return;
    }
    const full = input.value || '';
    const commaIndex = full.lastIndexOf(',');
    const prefix = commaIndex >= 0 ? full.slice(0, commaIndex + 1) : '';
    const queryRaw = commaIndex >= 0 ? full.slice(commaIndex + 1) : full;
    const query = queryRaw.trim().toLowerCase();
    suggestionsBox.innerHTML = '';
    activeIndex = -1;
    if (!query || !ENCHANTS.length) return;

    const itemType = document.getElementById('itemType').value;
    let eligible = eligiblePool(itemType);
    if (
      options.excludePathSimTier12 &&
      typeof isPathSimDisallowedTierName === 'function'
    ) {
      eligible = eligible.filter(e => !isPathSimDisallowedTierName(e.name));
    }
    const terms = query.split(/\s+/).filter(Boolean);
    const matches = eligible.filter(e => {
      const haystack = enchantAutocompleteHaystack(e.name);
      return terms.every(t => haystack.includes(t));
    }).slice(0, 15);
    if (!matches.length) return;

    matches.forEach(e => {
      const div = document.createElement('div');
      div.className = 'suggest-item';
      div.innerHTML = highlightMatch(e.name, terms);
      div.onclick = () => {
        suppressSuggestionsOnce = true;
        input.value = prefix ? `${prefix} ${e.name}` : e.name;
        suggestionsBox.innerHTML = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      suggestionsBox.appendChild(div);
    });
  });

  input.addEventListener('keydown', e => {
    const items = Array.from(suggestionsBox.children);
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      activeIndex = (activeIndex + 1) % items.length;
      updateActive(items);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      updateActive(items);
      e.preventDefault();
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      suppressSuggestionsOnce = true;
      const full = input.value || '';
      const commaIndex = full.lastIndexOf(',');
      const prefix = commaIndex >= 0 ? full.slice(0, commaIndex + 1) : '';
      input.value = prefix ? `${prefix} ${items[activeIndex].textContent}` : items[activeIndex].textContent;
      suggestionsBox.innerHTML = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  document.addEventListener('click', e => {
    if (!wrapper.contains(e.target)) suggestionsBox.innerHTML = '';
  });

  function updateActive(items) {
    items.forEach((el, i) => {
      el.classList.toggle('is-active', i === activeIndex);
    });
  }
  function highlightMatch(name, terms) {
    let result = name;
    terms.forEach(t => {
      const escaped = escapeRegexChars(t);
      const regex = new RegExp(`(${escaped})`, 'ig');
      result = result.replace(regex, '<b>$1</b>');
    });
    return result;
  }
}
window.initEnchantTargetAutocomplete = initEnchantTargetAutocomplete;

(function enableEnchantAutocomplete() {
  initEnchantTargetAutocomplete(document.getElementById('path-phase-1'), { excludePathSimTier12: true });
  initEnchantTargetAutocomplete(document.getElementById('compareCardsTargetInput'), { excludePathSimTier12: true });
})();

(function enableAwakenAutocompleteV12() {
  const checkbox = document.getElementById('canAwaken');
  const input = document.getElementById('awakenItem');
  if (!checkbox || !input) return;
  let suggestionsBox = null;

  // Ensure visibility toggles are controlled here (no inline styles)
  const toggle = () => {
    input.style.display = checkbox.checked ? 'inline-block' : 'none';
    if (!checkbox.checked) {
      input.value = '';
      if (suggestionsBox) suggestionsBox.innerHTML = '';
    }
  };
  toggle();
  checkbox.addEventListener('change', toggle);

  // Build wrapper + suggestions (match "Target Enchantment Probability" behaviour)
  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  suggestionsBox = document.createElement('div');
  suggestionsBox.className = 'suggest-box'; // reuse same styling
  suggestionsBox.style.position = 'absolute';
  suggestionsBox.style.top = '100%';
  suggestionsBox.style.left = '0';
  suggestionsBox.style.right = '0';
  suggestionsBox.style.zIndex = '999';
  wrapper.appendChild(suggestionsBox);

  let activeIndex = -1;
  let suppressSuggestionsOnce = false;

  input.addEventListener('input', () => {
    if (suppressSuggestionsOnce) {
      suppressSuggestionsOnce = false;
      suggestionsBox.innerHTML = '';
      activeIndex = -1;
      return;
    }
    const q = (input.value || '').trim().toLowerCase();
    suggestionsBox.innerHTML = '';
    activeIndex = -1;

    if (!q) return;

    const list = AWAKENABLE_ITEMS;
    const matches = list.filter(name => name.toLowerCase().includes(q)).slice(0, 15);
    if (!matches.length) return;

    matches.forEach(name => {
      const div = document.createElement('div');
      div.className = 'suggest-item';
      // simple highlight like probability box
      const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
      div.innerHTML = name.replace(re, '<b>$1</b>');
      div.onclick = () => {
        suppressSuggestionsOnce = true;
        input.value = name;
        suggestionsBox.innerHTML = '';
        // Trigger existing listeners in buildAwakenList()
        input.dispatchEvent(new Event('input'));
      };
      suggestionsBox.appendChild(div);
    });
  });

  input.addEventListener('keydown', e => {
    const items = Array.from(suggestionsBox.children);
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      activeIndex = (activeIndex + 1) % items.length;
      updateActive(items);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      updateActive(items);
      e.preventDefault();
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      items[activeIndex].click();
    }
  });

  document.addEventListener('click', (ev) => {
    if (!wrapper.contains(ev.target)) {
      suggestionsBox.innerHTML = '';
    }
  });

  function updateActive(items) {
    items.forEach((el, i) => {
      el.classList.toggle('is-active', i === activeIndex);
    });
  }
})();
