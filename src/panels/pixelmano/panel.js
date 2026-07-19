/* =========================================================================
   Panel: Az Élő Vászon (#panel-pixelmano) — Frontend / Pixelmanó
   KONCEPCIÓ: C) "A Betű, Ami Eltűnik".
   -------------------------------------------------------------------------
   A theme-csúszka a nyers akcent-színt állítja. A NAGY CÍM színe = az akcent;
   ha a cím kontrasztja a papírhoz alámegy az AA-nak, a cím elmosódik és
   elhalványul (beleolvad a papírba). A GOMB ezzel szemben okosan ink- vagy
   papír-feliratot vált, hogy megvédje az olvashatóságát.

   Integrációs szerződés:
     - egyetlen globális init: initPanel_pixelmano(rootEl)
     - idempotens, prefers-reduced-motion-t tiszteli, NINCS auto-futás
   ========================================================================= */
(function () {
  "use strict";

  /* ---- Szín-segédfüggvények (WCAG-kontraszt) --------------------------- */
  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    var k = function (n) { return (n + h / 30) % 12; };
    var a = s * Math.min(l, 1 - l);
    var f = function (n) {
      return l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    };
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  }
  function luminance(rgb) {
    var c = rgb.map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrastHsl(a, b) {
    var la = luminance(hslToRgb(a[0], a[1], a[2]));
    var lb = luminance(hslToRgb(b[0], b[1], b[2]));
    var hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  // Nyelv-lookup a JS-generalt fix szovegekhez (a <html lang>-bol, amit a build.py allit; fallback hu).
  function L(hu, en, de) { var l = (document.documentElement.lang || "hu").slice(0, 2); return l === "en" ? en : (l === "de" ? de : hu); }

  /* ---- Init ------------------------------------------------------------ */
  window.initPanel_pixelmano = function initPanel_pixelmano(rootEl) {
    var root = rootEl || document.getElementById("panel-pixelmano");
    if (!root || root.dataset.pmInit === "1") return; // idempotens őr
    root.dataset.pmInit = "1";

    var reduce = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) root.classList.add("ev-anim");

    // Az editorial világ referenciái (a panel.css --ev-paper / --ev-ink-jével egyezők)
    var PAPER = [38, 30, 95];
    var INK = [30, 8, 12];
    var PAPER_CSS = "hsl(38 30% 95%)";
    var INK_CSS = "hsl(30 8% 12%)";
    var DEFAULT = { h: 8, s: 80, l: 46 };

    /* ---- Kód-blokk toggle (self-documenting) ------------------------- */
    var toggles = root.querySelectorAll(".ev-code-toggle");
    Array.prototype.forEach.call(toggles, function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.getAttribute("data-code-for");
        var pre = root.querySelector('.ev-code[data-code="' + key + '"]');
        if (!pre) return;
        var open = pre.hasAttribute("hidden");
        if (open) { pre.removeAttribute("hidden"); } else { pre.setAttribute("hidden", ""); }
        btn.setAttribute("aria-expanded", String(open));
        btn.textContent = open ? L("Kód elrejtése", "Hide code", "Code verbergen")
                               : L("Kód megmutatása", "Show code", "Code zeigen");
      });
    });

    /* ---- Elemek ------------------------------------------------------ */
    var hue = root.querySelector("#ev-hue");
    var light = root.querySelector("#ev-light");
    var hueVal = root.querySelector("#ev-hue-val");
    var lightVal = root.querySelector("#ev-light-val");
    var vRatio = root.querySelector("[data-verdict-ratio]");
    var vWord = root.querySelector("[data-verdict-word]");
    var mTitle = root.querySelector('[data-contrast="title"]');
    var mBtn = root.querySelector('[data-contrast="btn"]');
    var bTitle = root.querySelector('[data-contrast-badge="title"]');
    var bBtn = root.querySelector('[data-contrast-badge="btn"]');

    function setBadge(badge, ratio, threshold) {
      if (!badge) return;
      var pass = ratio >= threshold;
      var lvl = threshold >= 4.5 ? "4,5:1" : "3:1";
      badge.setAttribute("data-state", pass ? "pass" : "fail");
      badge.textContent = pass ? "AA ✓" : "AA ✗";
      badge.setAttribute("title",
        pass ? L("Megfelel a WCAG AA-nak (>= ", "Meets WCAG AA (>= ", "Erfüllt WCAG AA (>= ") + lvl + ")"
             : L("Nem éri el a WCAG AA szintet (", "Below WCAG AA (", "Unter WCAG AA (") + lvl + ")");
    }

    function apply() {
      var h = hue ? parseInt(hue.value, 10) : DEFAULT.h;
      var l = light ? parseInt(light.value, 10) : DEFAULT.l;
      var s = DEFAULT.s;
      var accent = [h, s, l];

      // Akcent CSS-változó frissítése (a --ev-accent és minden származéka követi)
      root.style.setProperty("--ev-accent-h", String(h));
      root.style.setProperty("--ev-accent-l", String(l) + "%");
      if (hueVal) hueVal.textContent = h + "°";
      if (lightVal) lightVal.textContent = l + "%";

      // 1) A CÍM: nyers akcent-szín a papíron (large text, 3:1)
      var titleC = contrastHsl(accent, PAPER);

      // 2) A GOMB: a jobb kontrasztú felirat-szín választása (ink vagy papír)
      var cInk = contrastHsl(INK, accent);
      var cPaper = contrastHsl(PAPER, accent);
      var useInk = cInk >= cPaper;
      root.style.setProperty("--ev-btn-fg", useInk ? INK_CSS : PAPER_CSS);
      var btnC = useInk ? cInk : cPaper;

      // Az ELTŰNÉS mértéke a cím-kontrasztból (3:1 alatt kezd tűnni)
      var v = clamp((3 - titleC) / 2, 0, 1);
      root.style.setProperty("--ev-vanish-blur", (v * 14).toFixed(1) + "px");
      root.style.setProperty("--ev-vanish-opacity", (1 - v * 0.72).toFixed(3));

      // Verdikt (a cím állapota)
      var word, state;
      if (titleC >= 4.5) { word = L("ÉLES", "CRISP", "SCHARF"); state = "crisp"; }
      else if (titleC >= 3.0) { word = L("OLVASHATÓ", "READABLE", "LESBAR"); state = "large"; }
      else { word = L("ELTŰNIK", "VANISHING", "VERSCHWINDET"); state = "gone"; }
      if (vRatio) vRatio.textContent = titleC.toFixed(2) + ":1";
      if (vWord) { vWord.textContent = word; vWord.setAttribute("data-state", state); }

      // Mérők
      if (mTitle) mTitle.textContent = titleC.toFixed(2) + ":1";
      if (mBtn) mBtn.textContent = btnC.toFixed(2) + ":1";
      setBadge(bTitle, titleC, 3.0);
      setBadge(bBtn, btnC, 4.5);
    }

    if (hue) hue.addEventListener("input", apply);
    if (light) light.addEventListener("input", apply);

    /* ---- Alaphelyzet ------------------------------------------------- */
    var resetBtn = root.querySelector('[data-action="reset-theme"]');
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        if (hue) hue.value = String(DEFAULT.h);
        if (light) light.value = String(DEFAULT.l);
        apply();
      });
    }

    apply(); // első számítás
  };
})();
