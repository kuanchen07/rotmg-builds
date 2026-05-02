(function () {

  function init() {

    var main = document.querySelector("main");

    if (!main) return;



    var headingNodes = main.querySelectorAll("h2.archetype-heading");

    if (headingNodes.length <= 1) return;



    var warnedMissingId = false;

    var headingList = [];

    for (var ni = 0; ni < headingNodes.length; ni++) {

      var node = headingNodes[ni];

      if (!node.id) {

        if (!warnedMissingId) {

          console.warn("[build-variant-nav] Skipping archetype heading(s) without id");

          warnedMissingId = true;

        }

        continue;

      }

      headingList.push(node);

    }

    if (headingList.length <= 1) return;



    var ratios = new WeakMap();

    for (var ri = 0; ri < headingList.length; ri++) {

      ratios.set(headingList[ri], 0);

    }



    function findHeadingByHash(hash) {

      if (!hash) return null;

      var id = hash.replace(/^#/, "");

      try {

        id = decodeURIComponent(id);

      } catch (e) {}

      for (var fi = 0; fi < headingList.length; fi++) {

        if (headingList[fi].id === id) return headingList[fi];

      }

      return null;

    }



    function nearBottom() {

      var docEl = document.documentElement;

      return window.innerHeight + window.scrollY >= docEl.scrollHeight - 40;

    }



    var nav = document.createElement("nav");

    nav.className = "build-variant-nav";

    nav.setAttribute("aria-label", "Current build variant");



    var details = document.createElement("details");

    details.className = "build-variant-nav__details";



    var summary = document.createElement("summary");

    summary.className = "build-variant-nav__summary";



    var caret = document.createElement("span");

    caret.className = "build-variant-nav__caret";

    caret.setAttribute("aria-hidden", "true");



    var currentSpan = document.createElement("span");

    currentSpan.className = "build-variant-nav__current";

    currentSpan.setAttribute("aria-live", "polite");



    summary.appendChild(caret);

    summary.appendChild(currentSpan);



    var menu = document.createElement("ul");

    menu.className = "build-variant-nav__menu";

    menu.setAttribute("role", "list");



    for (var mi = 0; mi < headingList.length; mi++) {

      var h = headingList[mi];

      var hid = h.id;

      var li = document.createElement("li");

      li.className = "build-variant-nav__item";



      var a = document.createElement("a");

      a.className = "build-variant-nav__link";

      a.href = "#" + hid;



      var label = (h.textContent || "").trim();

      a.textContent = label || hid;



      li.appendChild(a);

      menu.appendChild(li);

    }



    details.appendChild(summary);

    details.appendChild(menu);

    nav.appendChild(details);

    document.body.appendChild(nav);

    document.body.classList.add("has-build-variant-nav");



    function measureReservedWidthFromHeadingLabels() {

      var wasOpen = details.open;

      details.open = false;

      var maxW = 0;

      for (var i = 0; i < headingList.length; i++) {

        var head = headingList[i];

        var lbl = (head.textContent || "").trim() || head.id;

        currentSpan.textContent = lbl;

        var w = nav.getBoundingClientRect().width;

        if (w > maxW) maxW = w;

      }

      maxW = Math.ceil(maxW);

      if (maxW > 0) {

        document.documentElement.style.setProperty(

          "--build-variant-nav-chip-width",

          maxW + "px"

        );

      }

      details.open = wasOpen;

    }



    var remeasureQueued = false;

    function scheduleRemeasureReservedWidth() {

      if (remeasureQueued) return;

      remeasureQueued = true;

      window.requestAnimationFrame(function () {

        remeasureQueued = false;

        measureReservedWidthFromHeadingLabels();

        applyActiveFromRatios();

      });

    }



    function setActiveHeading(el) {

      var sid = el.id;

      var lbl = (el.textContent || "").trim() || sid;

      currentSpan.textContent = lbl;



      var links = menu.querySelectorAll("a.build-variant-nav__link");

      for (var lix = 0; lix < links.length; lix++) {

        var link = links[lix];

        var hrefRaw = link.getAttribute("href") || "";

        var hrefId = hrefRaw.charAt(0) === "#" ? hrefRaw.slice(1) : hrefRaw;

        if (hrefId === sid) {

          link.setAttribute("aria-current", "location");

        } else {

          link.removeAttribute("aria-current");

        }

      }

    }



    function applyActiveFromRatios() {

      if (nearBottom()) {

        setActiveHeading(headingList[headingList.length - 1]);

        return;

      }

      var active = headingList[0];

      for (var ai = 0; ai < headingList.length; ai++) {

        var head = headingList[ai];

        var r = ratios.get(head);

        if (r != null && r > 0) active = head;

      }

      setActiveHeading(active);

    }



    measureReservedWidthFromHeadingLabels();



    function syncFromHash() {

      var match = findHeadingByHash(location.hash);

      if (!match) return false;

      setActiveHeading(match);

      return true;

    }



    menu.addEventListener("click", function (e) {

      var a = e.target && e.target.closest ? e.target.closest("a") : null;

      if (!a || !menu.contains(a)) return;

      details.open = false;

    });



    var thresholds = [];

    for (var ti = 0; ti <= 20; ti++) {

      thresholds.push(ti * 0.05);

    }



    var observer = new IntersectionObserver(function (entries) {

      for (var ei = 0; ei < entries.length; ei++) {

        var entry = entries[ei];

        ratios.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0);

      }

      applyActiveFromRatios();

    }, {

      root: null,

      rootMargin: "-96px 0px -52% 0px",

      threshold: thresholds

    });



    for (var oi = 0; oi < headingList.length; oi++) {

      observer.observe(headingList[oi]);

    }



    window.addEventListener("resize", scheduleRemeasureReservedWidth);

    if (window.visualViewport && window.visualViewport.addEventListener) {

      window.visualViewport.addEventListener("resize", scheduleRemeasureReservedWidth);

    }



    window.addEventListener("hashchange", function () {

      if (!syncFromHash()) applyActiveFromRatios();

    });



    requestAnimationFrame(function () {

      requestAnimationFrame(function () {

        if (!syncFromHash()) applyActiveFromRatios();

      });

    });

  }



  if (document.readyState === "loading") {

    document.addEventListener("DOMContentLoaded", init);

  } else {

    init();

  }

})();

