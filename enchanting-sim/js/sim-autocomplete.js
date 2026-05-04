/* ---------- IMPROVED AUTOCOMPLETE FOR TARGET ENCHANT INPUT ---------- */
(function enableEnchantAutocomplete() {
  const input = document.getElementById('targetEnchantInput');

  // Create suggestions container (properly positioned below the input)
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

  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    suggestionsBox.innerHTML = '';
    activeIndex = -1;
    if (!query || !ENCHANTS.length) return;

    const itemType = document.getElementById('itemType').value;
    const eligible = eligiblePool(itemType);

    // Split search terms into words, match if all appear in enchant name (order-insensitive)
    const terms = query.split(/\s+/).filter(Boolean);
    const matches = eligible.filter(e => {
      const name = e.name.toLowerCase();
      return terms.every(t => name.includes(t));
    }).slice(0, 15);

    if (!matches.length) return;

    matches.forEach(e => {
      const div = document.createElement('div');
      div.className = 'suggest-item';
      div.innerHTML = highlightMatch(e.name, terms);
      div.onclick = () => {
        input.value = e.name;
        suggestionsBox.innerHTML = '';
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
      input.value = items[activeIndex].textContent;
      suggestionsBox.innerHTML = '';
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
      const regex = new RegExp(`(${t})`, 'ig');
      result = result.replace(regex, '<b>$1</b>');
    });
    return result;
  }
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

  input.addEventListener('input', () => {
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
