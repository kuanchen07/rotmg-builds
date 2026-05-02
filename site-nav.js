(function () {
  if (document.getElementById("site-nav")) return;

  var path = (location.pathname || "").replace(/\\/g, "/");
  var inClasses = path.indexOf("/classes/") !== -1;

  var introHref = inClasses ? "../index.html" : "index.html";
  var buildsHref = inClasses ? "builds.html" : "classes/builds.html";
  var creditsHref = inClasses ? "credits.html" : "classes/credits.html";
  var iconSrc = inClasses ? "../icons/!menu.png" : "icons/!menu.png";

  var fileName = path.split("/").pop() || "";
  var isIntro =
    !inClasses && (fileName === "" || fileName === "index.html" || /^\/?$/.test(path));
  var isBuildsHub = /^(builds\.html)$/i.test(fileName);
  var isCredits = /^(credits\.html)$/i.test(fileName);

  var showBrand = isIntro || isBuildsHub;
  if (showBrand) {
    document.body.classList.add("site-nav-show-brand");
  }

  var introAttr = isIntro ? ' aria-current="page"' : "";
  var buildsAttr = isBuildsHub ? ' aria-current="page"' : "";
  var creditsAttr = isCredits ? ' aria-current="page"' : "";

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
      '<span class="site-brand-strip__text">ROTMG set checker - made by evolz</span>';
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
})();
