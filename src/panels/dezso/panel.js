/* panel-dezso -- "A Szerver Szívverése"  (koncepcio: SZEIZMOGRAF, analog muszer)
 * Egyetlen belepesi pont: initPanel_dezso(rootEl). Idempotens, NINCS auto-futas.
 * prefers-reduced-motion: a tuk BEALLNAK az ertekre (nincs tullendules, CSS kezeli),
 * a szeizmograf-vonal statikus (nem animal). Defenziv: ha nincs health-snapshot,
 * a nyers HTML kezdoertekek maradnak.
 */
(function () {
  "use strict";

  // statusz -> szeizmikus jelleg (amplitudo-szorzo, scroll-sebesseg, tuske-eroossseg)
  var SIG = {
    green:   { amp: 0.16, speed: 34, spike: 0.55, label: "STABIL ÜZEM" },
    amber:   { amp: 0.30, speed: 52, spike: 1.0,  label: "FIGYELMEZTETÉS" },
    red:     { amp: 0.52, speed: 78, spike: 1.8,  label: "INCIDENS -- RIASZTÁS KIMENT" },
    unknown: { amp: 0.10, speed: 20, spike: 0.2,  label: "NINCS REGISZTRÁLT JEL" }
  };

  // muszer-skalak (ertek -> a mutato tartomanya)
  var GAUGE = {
    latency: { max: 400, unit: "ms" },   // 0..400 ms -> -90..+90 fok
    disk:    { max: 100, unit: "%" }      // 0..100 %  -> -90..+90 fok
  };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function cssVar(el, n, f) { var v = getComputedStyle(el).getPropertyValue(n); return (v && v.trim()) || f; }

  function relTime(iso) {
    if (!iso) return "élő";
    var t = Date.parse(iso); if (isNaN(t)) return "élő";
    var s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return s + " mp-e";
    if (s < 3600) return Math.round(s / 60) + " perce";
    if (s < 86400) return Math.round(s / 3600) + " órája";
    return Math.round(s / 86400) + " napja";
  }

  // --- muszer-skalajeloek egyszeri kirajzolasa (SVG tick-ek) ---
  function buildTicks(gaugeEl) {
    var g = gaugeEl.querySelector(".pd-gauge-ticks");
    if (!g || g.childNodes.length) return;             // idempotens
    var cx = 60, cy = 88, rOut = 54, rMaj = 44, rMin = 48;
    for (var i = 0; i <= 6; i++) {
      var ang = (-90 + i * 30) * Math.PI / 180;         // -90..+90, 30 fokonkent
      var maj = (i % 3 === 0);
      var ri = maj ? rMaj : rMin;
      var x1 = cx + ri * Math.sin(ang), y1 = cy - ri * Math.cos(ang);
      var x2 = cx + rOut * Math.sin(ang), y2 = cy - rOut * Math.cos(ang);
      var ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
      ln.setAttribute("x1", x1.toFixed(1)); ln.setAttribute("y1", y1.toFixed(1));
      ln.setAttribute("x2", x2.toFixed(1)); ln.setAttribute("y2", y2.toFixed(1));
      if (maj) ln.setAttribute("class", "maj");
      g.appendChild(ln);
    }
  }

  function setNeedle(rootEl, role, value, max) {
    var gauge = rootEl.querySelector('[data-role="gauge-' + role + '"]');
    if (!gauge) return;
    var frac = clamp(value / max, 0, 1);
    var deg = -90 + frac * 180;                         // -90..+90
    gauge.style.setProperty("--pd-needle", deg.toFixed(1) + "deg");
  }

  // --- render a snapshotbol (defenziv) ---
  function render(rootEl, data) {
    if (!data || typeof data !== "object") return;
    var status = ["green", "amber", "red"].indexOf(data.status) >= 0 ? data.status : "unknown";
    var sig = SIG[status] || SIG.unknown;
    rootEl.setAttribute("data-status", status === "unknown" ? "amber" : status);
    rootEl._pdSig = sig;

    var stTxt = rootEl.querySelector('[data-role="status-text"]');
    if (stTxt) stTxt.textContent = sig.label;
    var gen = rootEl.querySelector('[data-role="generated"]');
    if (gen) gen.textContent = "regisztrálva: " + relTime(data.generated_at);

    var setNum = function (role, val) {
      var el = rootEl.querySelector('[data-role="' + role + '"]');
      if (el && val !== null && val !== undefined) el.textContent = val;
    };
    if (data.worst_latency_ms != null) { setNum("latency", data.worst_latency_ms); setNeedle(rootEl, "latency", data.worst_latency_ms, GAUGE.latency.max); }
    if (data.disk_pct != null) { setNum("disk", data.disk_pct); setNeedle(rootEl, "disk", data.disk_pct, GAUGE.disk.max); }
    if (data.services && data.services.up != null && data.services.total != null) setNum("services", data.services.up + "/" + data.services.total);
    if (Array.isArray(data.certs) && data.certs.length && data.certs[0].days_left != null) setNum("cert", data.certs[0].days_left);

    if (Array.isArray(data.targets)) {
      var ul = rootEl.querySelector('[data-role="targets"]');
      if (ul) {
        ul.textContent = "";
        data.targets.forEach(function (t) {
          var li = document.createElement("li");
          li.className = "pd-log-row " + (t.up ? "is-up" : "is-down");
          var name = document.createElement("span");
          name.className = "pd-log-name"; name.textContent = t.label || "ismeretlen";
          var dots = document.createElement("span"); dots.className = "pd-log-dots"; dots.setAttribute("aria-hidden", "true");
          var val = document.createElement("span"); val.className = "pd-log-val";
          val.textContent = t.up ? ((t.latency_ms != null ? t.latency_ms : "?") + " ms") : "NINCS JEL";
          li.appendChild(name); li.appendChild(dots); li.appendChild(val);
          ul.appendChild(li);
        });
      }
    }
  }

  function findHealthSrc(rootEl) {
    if (rootEl.dataset.healthSrc) return [rootEl.dataset.healthSrc];
    return ["panels/dezso/data/health.json", "./data/health.json", "data/health.json"];
  }
  function fetchHealth(rootEl) {
    var srcs = findHealthSrc(rootEl);
    function tryNext(i) {
      if (i >= srcs.length) return Promise.reject(new Error("no health source"));
      return fetch(srcs[i], { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .catch(function () { return tryNext(i + 1); });
    }
    return tryNext(0);
  }

  // --- szeizmikus jel: determinisztikus zaj + periodikus tuske ---
  function seismo(t, sig) {
    var base = 0.35 * Math.sin(t * 1.7) + 0.22 * Math.sin(t * 3.9 + 1.1) + 0.13 * Math.sin(t * 8.3 + 2.3);
    // periodikus eles tuske (a "pulzus" a papiron)
    var ph = (t % (Math.PI * 2)) / (Math.PI * 2);
    var spike = Math.exp(-Math.pow((ph - 0.5) * 12, 2)) * sig.spike;
    return base * 0.5 + spike;
  }

  // --- papirtekercs animator (scrollozo tinta-vonal, teljes ujrarajzolas/frame) ---
  function startSeismo(rootEl, animate) {
    var canvas = rootEl.querySelector(".pd-seismo-canvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d"); if (!ctx) return;

    var W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    function resize() {
      var r = canvas.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
      canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    var scroll = 0, last = null;
    function draw(dt) {
      var sig = rootEl._pdSig || SIG.green;
      var color = cssVar(rootEl, "--p-signal", "#1e4d74");
      scroll += sig.speed * dt;
      var mid = H / 2, amp = H * sig.amp;
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 1.8; ctx.strokeStyle = color; ctx.lineJoin = "round"; ctx.globalAlpha = .92;
      ctx.beginPath();
      for (var xx = 0; xx <= W; xx += 2) {
        var t = (xx + scroll) * 0.045;
        var y = mid - seismo(t, sig) * amp;
        if (xx === 0) ctx.moveTo(xx, y); else ctx.lineTo(xx, y);
      }
      ctx.stroke(); ctx.globalAlpha = 1;
      // a "toll" a jobb szelen
      var tt = (W + scroll) * 0.045, hy = mid - seismo(tt, sig) * amp;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(W - 1, hy, 2.4, 0, Math.PI * 2); ctx.fill();
    }

    draw(0);                                            // azonnali teljes kep
    if (!animate) return;                               // reduced-motion: statikus marad
    function frame(ts) {
      if (rootEl._pdRaf == null) return;
      if (last == null) last = ts;
      var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
      draw(dt);
      rootEl._pdRaf = requestAnimationFrame(frame);
    }
    if (!rootEl._pdResize) {
      rootEl._pdResize = function () { resize(); draw(0); };
      window.addEventListener("resize", rootEl._pdResize, { passive: true });
    }
    rootEl._pdRaf = requestAnimationFrame(frame);
  }

  // --- belepesi pont ---
  window.initPanel_dezso = function initPanel_dezso(rootEl) {
    rootEl = rootEl || document.getElementById("panel-dezso");
    if (!rootEl) return;
    if (rootEl.dataset.pdInited === "1") {
      fetchHealth(rootEl).then(function (d) { render(rootEl, d); }).catch(function () {});
      return;
    }
    rootEl.dataset.pdInited = "1";

    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // muszer-skalajeloek
    Array.prototype.forEach.call(rootEl.querySelectorAll(".pd-gauge"), buildTicks);
    // kezdo-mutatoallas a nyers HTML data-value-bol (hogy reduced-motion/no-fetch is helyes legyen)
    var initNeedle = function (role, max) {
      var el = rootEl.querySelector('[data-role="' + role + '"]');
      var v = el ? parseFloat(el.dataset.value) : NaN;
      if (!isNaN(v)) setNeedle(rootEl, role, v, max);
    };
    initNeedle("latency", GAUGE.latency.max);
    initNeedle("disk", GAUGE.disk.max);

    rootEl._pdSig = SIG.green;
    startSeismo(rootEl, !reduce);

    fetchHealth(rootEl).then(function (d) { render(rootEl, d); }).catch(function () {});

    if (!rootEl._pdPoll) {
      rootEl._pdPoll = setInterval(function () {
        if (document.hidden) return;
        fetchHealth(rootEl).then(function (d) { render(rootEl, d); }).catch(function () {});
      }, 30000);
    }
    rootEl._pdDestroy = function () {
      if (rootEl._pdRaf != null) { cancelAnimationFrame(rootEl._pdRaf); rootEl._pdRaf = null; }
      if (rootEl._pdPoll) { clearInterval(rootEl._pdPoll); rootEl._pdPoll = null; }
      if (rootEl._pdResize) { window.removeEventListener("resize", rootEl._pdResize); rootEl._pdResize = null; }
    };
  };
})();
