(function (global) {
  function normalizeBase(basePath) {
    return String(basePath || "enchanting-sim").replace(/\/+$/, "");
  }

  async function mountEnchantingSim(container, options) {
    if (!container) {
      throw new Error("mountEnchantingSim requires a container element.");
    }

    var opts = options || {};
    var pagePath = opts.pagePath || "enchanting-sim/main.html";
    var dataBasePath = normalizeBase(opts.dataBasePath);

    if (container.dataset.enchantMounted === "true") return;

    var response = await fetch(pagePath, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error("Unable to load simulator page: " + response.status);
    }

    var html = await response.text();
    var doc = new DOMParser().parseFromString(html, "text/html");
    var sourceShell = doc.querySelector(".enchant-sim-shell");
    if (!sourceShell) {
      throw new Error("Simulator shell was not found in " + pagePath);
    }

    container.innerHTML = "";
    container.appendChild(sourceShell);

    global.__ENCHANT_SIM_DATA_BASE__ = dataBasePath;

    var scripts = Array.prototype.slice.call(doc.querySelectorAll("script"));
    for (var i = 0; i < scripts.length; i += 1) {
      var sourceScript = scripts[i];
      if (sourceScript.src) continue;
      var runtimeScript = document.createElement("script");
      runtimeScript.text = String(sourceScript.textContent || "");
      document.body.appendChild(runtimeScript);
      document.body.removeChild(runtimeScript);
    }

    if (!global.EnchantSim || typeof global.EnchantSim.init !== "function") {
      throw new Error("Enchant simulator init export is missing after embed script load.");
    }

    await global.EnchantSim.init();
    container.dataset.enchantMounted = "true";
  }

  global.mountEnchantingSim = mountEnchantingSim;
})(window);
