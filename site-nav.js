(function () {
  if (document.getElementById("site-nav")) return;

  var path = (location.pathname || "").replace(/\\/g, "/");
  var inClasses = path.indexOf("/classes/") !== -1;

  var introHref = inClasses ? "../index.html" : "index.html";
  var buildsHref = inClasses ? "builds.html" : "classes/builds.html";
  var creditsHref = inClasses ? "credits.html" : "classes/credits.html";
  var enchantHref = inClasses
    ? "../index.html?view=enchant-sim"
    : "index.html?view=enchant-sim";
  var keySimHref = inClasses
    ? "../index.html?view=key-sim"
    : "index.html?view=key-sim";
  /* Local UI asset only; item sprites use scripts/lib/icon-cdn-base.cjs (B2). */
  var iconSrc = inClasses ? "../icons/menu.png" : "icons/menu.png";

  var fileName = path.split("/").pop() || "";
  var query = new URLSearchParams(location.search || "");
  var requestedView = query.get("view");
  var isEnchantRoute = path.indexOf("/enchanting-sim/") !== -1;
  var isKeySimRoute = path.indexOf("/key-sim/") !== -1;
  var isEnchantSim = requestedView === "enchant-sim" || isEnchantRoute;
  var isKeySim = requestedView === "key-sim" || isKeySimRoute;
  var isIntro =
    !inClasses &&
    !isEnchantSim &&
    !isKeySim &&
    (fileName === "" || fileName === "index.html" || /^\/?$/.test(path));
  var isBuildsHub = /^(builds\.html)$/i.test(fileName);
  var isCredits = /^(credits\.html)$/i.test(fileName);

  var showBrand = isIntro || isBuildsHub || isEnchantSim || isKeySim;
  if (showBrand) {
    document.body.classList.add("site-nav-show-brand");
  }

  var introAttr = isIntro ? ' aria-current="page"' : "";
  var buildsAttr = isBuildsHub ? ' aria-current="page"' : "";
  var creditsAttr = isCredits ? ' aria-current="page"' : "";
  var enchantAttr = isEnchantSim ? ' aria-current="page"' : "";
  var keySimAttr = isKeySim ? ' aria-current="page"' : "";

  var aside = document.createElement("aside");
  aside.id = "site-nav";
  aside.className = "site-nav";
  aside.innerHTML =
    '<details class="site-nav__panel">' +
    '<summary class="site-nav__summary" aria-label="Toggle site navigation">' +
    '<img class="site-nav__icon" src="' +
    iconSrc +
    '" alt="" width="36" height="36" decoding="async">' +
    "</summary>" +
    '<nav class="site-nav__links" aria-label="Site">' +
    '<a class="site-nav__link" href="' +
    introHref +
    '"' +
    introAttr +
    ">Intro</a>" +
    '<a class="site-nav__link" href="' +
    buildsHref +
    '"' +
    buildsAttr +
    ">Builds</a>" +
    '<a class="site-nav__link" href="' +
    enchantHref +
    '"' +
    enchantAttr +
    ">Enchant Sim</a>" +
    '<a class="site-nav__link" href="' +
    keySimHref +
    '"' +
    keySimAttr +
    ">Key Sim</a>" +
    '<a class="site-nav__link" href="' +
    creditsHref +
    '"' +
    creditsAttr +
    ">Credits</a>" +
    "</nav>" +
    "</details>";

  var brandStrip = null;
  if (showBrand) {
    brandStrip = document.createElement("header");
    brandStrip.className = "site-brand-strip";
    brandStrip.setAttribute("aria-label", "ROTMG set checker");
    brandStrip.innerHTML =
      '<span class="site-brand-strip__text">ROTMG tools - by evolz</span>';
  }

  var main = document.querySelector("main");
  if (main) {
    main.parentNode.insertBefore(aside, main);
    if (brandStrip) {
      aside.insertAdjacentElement("afterend", brandStrip);
    }
  } else {
    document.body.insertAdjacentElement("afterbegin", aside);
    if (brandStrip) {
      aside.insertAdjacentElement("afterend", brandStrip);
    }
  }

  if (brandStrip) {
    function brandZoneBottomPx() {
      var stripTop = brandStrip.getBoundingClientRect().top;
      var root = document.documentElement;
      var fs = parseFloat(getComputedStyle(root).fontSize) || 16;
      var rowRem =
        parseFloat(
          getComputedStyle(root).getPropertyValue("--site-brand-row-height")
        ) || 3;
      return stripTop + rowRem * fs;
    }

    function syncBrandStripScroll() {
      var h1 =
        document.querySelector(".home-intro__prose > h1") ||
        document.querySelector("main > h1");
      if (!h1) {
        document.body.classList.remove("site-brand-scroll-collapsed");
        return;
      }
      var zoneBottom = brandZoneBottomPx();
      var titleBottom = h1.getBoundingClientRect().bottom;
      var collapsed = titleBottom < zoneBottom;
      document.body.classList.toggle("site-brand-scroll-collapsed", collapsed);
    }

    var rafPending = false;
    function onScrollOrResize() {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(function () {
        rafPending = false;
        syncBrandStripScroll();
      });
    }

    function attachBrandStripScroll() {
      syncBrandStripScroll();
      window.addEventListener("scroll", onScrollOrResize, { passive: true });
      window.addEventListener("resize", onScrollOrResize);
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", attachBrandStripScroll);
    } else {
      attachBrandStripScroll();
    }
  }
})();
