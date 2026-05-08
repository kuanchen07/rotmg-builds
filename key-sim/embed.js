(function (global) {
  function normalizeBase(basePath) {
    return String(basePath || "key-sim").replace(/\/+$/, "");
  }

  function resolveScriptUrl(pagePath, scriptSrc) {
    var pageUrl = new URL(pagePath, window.location.href);
    return new URL(scriptSrc, pageUrl).toString();
  }

  async function mountKeySim(container, options) {
    if (!container) {
      throw new Error("mountKeySim requires a container element.");
    }

    var opts = options || {};
    var pagePath = opts.pagePath || "key-sim/main.html";
    var dataBasePath = normalizeBase(opts.dataBasePath);

    if (container.dataset.keySimMounted === "true") return;

    var response = await fetch(pagePath, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error("Unable to load key sim page: " + response.status);
    }

    var html = await response.text();
    var doc = new DOMParser().parseFromString(html, "text/html");
    var sourceShell = doc.querySelector(".key-sim-shell");
    if (!sourceShell) {
      throw new Error("Key sim shell was not found in " + pagePath);
    }

    container.innerHTML = "";
    container.appendChild(sourceShell);

    var creditEl = doc.querySelector(".key-sim__credit");
    if (creditEl) {
      container.appendChild(creditEl.cloneNode(true));
    }

    global.__KEY_SIM_DATA_BASE__ = dataBasePath;

    var scripts = Array.prototype.slice.call(doc.querySelectorAll("script"));
    for (var i = 0; i < scripts.length; i += 1) {
      var sourceScript = scripts[i];
      var scriptText = "";
      if (sourceScript.src) {
        var externalUrl = resolveScriptUrl(pagePath, sourceScript.getAttribute("src"));
        var scriptResponse = await fetch(externalUrl, { cache: "no-cache" });
        if (!scriptResponse.ok) {
          throw new Error(
            "Unable to load key sim script: " + externalUrl + " (" + scriptResponse.status + ")"
          );
        }
        scriptText = await scriptResponse.text();
      } else {
        scriptText = String(sourceScript.textContent || "");
      }
      var runtimeScript = document.createElement("script");
      runtimeScript.text = scriptText;
      document.body.appendChild(runtimeScript);
      document.body.removeChild(runtimeScript);
    }

    if (!global.KeySim || typeof global.KeySim.init !== "function") {
      throw new Error("KeySim.init is missing after embed load.");
    }

    await global.KeySim.init();
    container.dataset.keySimMounted = "true";
  }

  global.mountKeySim = mountKeySim;
})(window);
