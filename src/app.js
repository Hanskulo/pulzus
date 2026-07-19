/* Pulzus Műhely — orkesztráció.
   1) Kollektív pulzus-EKG a hero-ban (reduced-motion-t tisztelő).
   2) Panel-init diszpécser: minden [data-init] elemre meghívja a globális
      initPanel_<slug>(rootEl) függvényt, ha a panel.js betöltötte.
   Vanilla, keretrendszer nélkül. Defenzív: egy panel hibája nem viszi el a többit. */
(function () {
  "use strict";
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Panel-init diszpécser ---- */
  function initPanels() {
    var nodes = document.querySelectorAll("[data-init]");
    Array.prototype.forEach.call(nodes, function (el) {
      var fn = el.getAttribute("data-init");
      try {
        if (fn && typeof window[fn] === "function") {
          window[fn](el);
          el.classList.remove("panel--placeholder");
        }
      } catch (e) {
        // Egy panel elszállása ne dontse le az oldalt.
        if (window.console) console.warn("Panel init hiba:", fn, e);
      }
    });
  }

  /* ---- Kollektív pulzus-EKG ---- */
  function heartbeatWave(x, phase) {
    // x: 0..1 pozíció egy szívveréscikluson belül; visszaad egy -1..1 amplitúdót.
    // Egyszerű, stilizált EKG (P-QRS-T).
    var t = (x + phase) % 1;
    if (t < 0.10) return Math.sin(t / 0.10 * Math.PI) * 0.12;          // P
    if (t < 0.16) return -0.18;                                         // Q
    if (t < 0.20) return 1.0;                                           // R
    if (t < 0.26) return -0.35;                                         // S
    if (t < 0.45) return Math.sin((t - 0.26) / 0.19 * Math.PI) * 0.28;  // T
    return 0;                                                           // alapvonal
  }

  function initCollectivePulse() {
    var cv = document.getElementById("collectivePulse");
    if (!cv || !cv.getContext) return;
    var ctx = cv.getContext("2d");

    function resize() {
      var ratio = window.devicePixelRatio || 1;
      var w = cv.clientWidth || 1200;
      cv.width = Math.round(w * ratio);
      cv.height = Math.round(200 * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize, { passive: true });

    function draw(phase) {
      var w = cv.clientWidth || 1200, h = 200, mid = h / 2;
      ctx.clearRect(0, 0, w, h);
      // háló-alapvonal
      ctx.strokeStyle = "rgba(100,116,139,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();

      // pulzus vonal
      var grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, "rgba(53,224,200,0)");
      grad.addColorStop(0.5, "rgba(53,224,200,0.95)");
      grad.addColorStop(1, "rgba(89,167,255,0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.shadowColor = "rgba(53,224,200,0.5)";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      var cycles = 4; // hány szívverés férjen ki
      for (var px = 0; px <= w; px += 2) {
        var xx = px / w * cycles;
        var y = mid - heartbeatWave(xx % 1, phase * cycles) * (h * 0.34);
        if (px === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    if (reduced) { draw(0.0); return; }

    var start = null;
    function frame(ts) {
      if (start === null) start = ts;
      var rate = 2600; // ms / szívverés (nyugalmi) — a paneleK később modulálhatják
      var phase = ((ts - start) % rate) / rate;
      draw(phase);
      window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame(frame);
  }

  function boot() {
    initCollectivePulse();
    initPanels();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // Globális segéd a panelek számára (közös pulzus-fázis lekérdezés, ha kell).
  window.PulzusMuhely = { reducedMotion: reduced, heartbeatWave: heartbeatWave };
})();
