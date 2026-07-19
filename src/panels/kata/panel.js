/* ============================================================
   Az Adatszív -- Kódoló Kata backend panel. "ÉLŐ BOLYGÓ".
   Élő adat-aggregátor: 3 kulcs nélküli publikus forrás -> geo-villanások
   egy absztrakt planiszférán (equirectangular projekció).
   Szerződés: egyetlen globális init (initPanel_kata), idempotens,
   prefers-reduced-motion-t tisztelő, NINCS auto-futás. Defenzív parszolás,
   forrásonkénti hibatűrés. (Az adat-adapterek a korábbi verzióból örökölve.)
   ============================================================ */
(function () {
  "use strict";

  var SOURCES = {
    wikipedia: {
      label: "Wikipedia", kind: "sse",
      url: "https://stream.wikimedia.org/v2/stream/recentchange",
      silenceMs: 6000, minEventGapMs: 260, color: "--pk-cyan"
    },
    usgs: {
      label: "USGS", kind: "poll",
      url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson",
      pollMs: 60000, silenceMs: null, color: "--pk-coral"
    },
    hackernews: {
      label: "Hacker News", kind: "poll",
      url: "https://hacker-news.firebaseio.com/v0/newstories.json",
      pollMs: 30000, silenceMs: null, color: "--pk-violet"
    }
  };

  // Nyelv -> reprezentatív [lon, lat] a Wikipedia-szerkesztésekhez.
  // (A wiki nyelvéből becsült ország; ismeretlen -> nincs villanás, csak számláló.)
  var LANG_GEO = {
    en: [-77, 39], simple: [-77, 39], de: [10.4, 51.2], fr: [2.3, 48.9],
    es: [-3.7, 40.4], ru: [37.6, 55.7], ja: [139.7, 35.7], zh: [116.4, 39.9],
    it: [12.5, 41.9], pt: [-47.9, -15.8], nl: [4.9, 52.4], pl: [21.0, 52.2],
    ar: [45.0, 24.0], fa: [51.4, 35.7], uk: [30.5, 50.5], sv: [18.0, 59.3],
    vi: [105.8, 21.0], ceb: [123.9, 10.3], war: [125.0, 11.5], he: [34.8, 32.1],
    hu: [19.0, 47.5], ko: [127.0, 37.5], tr: [32.9, 39.9], id: [106.8, -6.2],
    cs: [14.4, 50.1], fi: [24.9, 60.2], ro: [26.1, 44.4], no: [10.7, 59.9],
    nb: [10.7, 59.9], da: [12.6, 55.7], ca: [2.2, 41.4], sr: [20.5, 44.8],
    el: [23.7, 38.0], th: [100.5, 13.7], bg: [23.3, 42.7], hi: [77.2, 28.6],
    bn: [90.4, 23.8], ms: [101.7, 3.1], et: [24.8, 59.4], sk: [17.1, 48.1],
    lt: [25.3, 54.7], lv: [24.1, 56.9], sl: [14.5, 46.1], hr: [15.9, 45.8],
    az: [49.9, 40.4], ka: [44.8, 41.7], hy: [44.5, 40.2], eu: [-2.9, 43.3],
    gl: [-8.4, 42.9], is: [-21.9, 64.1], ga: [-6.3, 53.3], cy: [-3.2, 52.1],
    ta: [80.2, 13.1], te: [78.5, 17.4], ml: [76.3, 9.9], kk: [71.4, 51.2],
    uz: [69.2, 41.3], sw: [39.3, -6.8], af: [28.0, -26.2]
  };
  var HN_GEO = [-122.0, 37.4]; // Szilícium-völgy

  // Alacsony felbontású szárazföld-maszk (64 x 24, equirectangular).
  // '#' = szárazföld, ' ' = víz. Durva, de felismerhető kontinensek adják a
  // planiszféra alakját, hogy a geo-villanások egy VALÓDI Föld fölött üljenek.
  // Külső tile/asset NÉLKÜL (GEO/perf-barát).
  var LAND = [
    "                                                                ",
    "                #########     ####            #############     ",
    "        #####  ################ ######## ######################  ",
    "      #######################  ################################ ",
    "      ######################  ## ##############################  ",
    "        ####################  ############################# ",
    "        ###################   ###########################   ##  ",
    "         ##################   ############################### ",
    "           #########          ############################# ",
    "              #######         #################  ####  ##### ",
    "                 #####         ###############        ###### ",
    "                    #######      #############        ####### ",
    "                     ########     ###########          ####### ",
    "                      ########     #########            ####### ",
    "                      #########     #######             ###### ",
    "                       #######       #####             ######## ",
    "                        #####         ###               ######  ",
    "                        ####                              ##    ",
    "                         ##                                     ",
    "                                                                ",
    "                                                                ",
    "                                                                ",
    "                                                                ",
    "                                                                "
  ];
  var LAND_COLS = 64, LAND_ROWS = 24;
  function pad64(row) { row = String(row || ""); while (row.length < LAND_COLS) row += " "; return row.slice(0, LAND_COLS); }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function cssVar(el, name, fb) {
    try { var v = getComputedStyle(el).getPropertyValue(name); return (v && v.trim()) || fb; }
    catch (e) { return fb; }
  }
  function truncate(s, n) { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function langOf(server) {
    if (!server) return null;
    var m = String(server).split(".");
    var code = m[0];
    if (["www", "wikidata", "commons", "meta", "species", "mediawiki", "incubator", "wikisource"].indexOf(code) >= 0) return null;
    return code;
  }

  // --- Térkép-kontroller: planiszféra pontháló + geo-villanások ---
  function WorldMap(root, canvas, reduced) {
    this.root = root; this.canvas = canvas; this.reduced = reduced;
    this.ctx = canvas.getContext("2d");
    this.dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    this.W = 0; this.H = 0;
    this.events = [];       // {x,y,color,mag,t0}
    this.colors = {
      wikipedia: cssVar(root, "--pk-cyan", "#4fd6e8"),
      usgs: cssVar(root, "--pk-coral", "#ff7a63"),
      hackernews: cssVar(root, "--pk-violet", "#9d8cff")
    };
    this.grid = cssVar(root, "--pk-grid", "rgba(120,200,220,0.16)");
  }
  WorldMap.prototype.resize = function () {
    var r = this.canvas.getBoundingClientRect();
    this.W = Math.max(2, Math.round(r.width)); this.H = Math.max(2, Math.round(r.height));
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  };
  WorldMap.prototype.project = function (lon, lat) {
    return { x: (lon + 180) / 360 * this.W, y: (90 - lat) / 180 * this.H };
  };
  WorldMap.prototype.add = function (slug, lon, lat, mag) {
    if (lon == null || lat == null || isNaN(lon) || isNaN(lat)) return;
    var p = this.project(clamp(lon, -180, 180), clamp(lat, -90, 90));
    this.events.push({ x: p.x, y: p.y, color: this.colors[slug] || "#4fd6e8", mag: clamp(mag || 0.6, 0.3, 1.5), t0: (window.performance ? performance.now() : Date.now()) });
    if (this.events.length > 80) this.events.shift();
    if (this.reduced) this.render(0); // statikus mód: azonnali újrarajz
  };
  WorldMap.prototype.drawBase = function () {
    var ctx = this.ctx, W = this.W, H = this.H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = this.grid;

    // 1) nagyon halvány óceán-háló + egyenlítő/kezdő-délkör: a "planiszféra rács"
    var stepX = W / 60, stepY = H / 30;
    for (var gy = 0; gy <= 30; gy++) {
      for (var gx = 0; gx <= 60; gx++) {
        var eq = (gy === 15), pm = (gx === 30);
        ctx.globalAlpha = (eq || pm) ? 0.22 : 0.08;
        ctx.beginPath(); ctx.arc(gx * stepX, gy * stepY, (eq || pm) ? 1.0 : 0.6, 0, Math.PI * 2); ctx.fill();
      }
    }

    // 2) fényesebb szárazföld-pontok a maszkból: ettől lesz felismerhető a Föld
    ctx.globalAlpha = 0.85;
    for (var r = 0; r < LAND_ROWS; r++) {
      var row = pad64(LAND[r]);
      for (var c = 0; c < LAND_COLS; c++) {
        if (row.charAt(c) !== " ") {
          var x = (c + 0.5) / LAND_COLS * W;
          var y = (r + 0.5) / LAND_ROWS * H;
          ctx.beginPath(); ctx.arc(x, y, 0.9, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  };
  WorldMap.prototype.render = function (now) {
    this.drawBase();
    var ctx = this.ctx;
    var life = 8000; // egy villanás élettartama (ms)
    ctx.globalCompositeOperation = "lighter";
    for (var i = this.events.length - 1; i >= 0; i--) {
      var e = this.events[i];
      var age = (now || (window.performance ? performance.now() : Date.now())) - e.t0;
      if (age > life) { this.events.splice(i, 1); continue; }
      var k = age / life;                       // 0..1
      var fade = 1 - k;
      var baseR = 3 + e.mag * 3;
      // maradó fény-pont
      var g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, baseR + 5);
      g.addColorStop(0, e.color); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 0.25 + 0.6 * fade;
      ctx.beginPath(); ctx.arc(e.x, e.y, baseR, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      // fodrozódó gyűrű (az első ~1.4s-ban), reduced módban kihagyva
      if (!this.reduced && age < 1400) {
        var rk = age / 1400;
        ctx.globalAlpha = (1 - rk) * 0.7;
        ctx.strokeStyle = e.color; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(e.x, e.y, baseR + rk * (14 + e.mag * 18), 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  };

  // --- Forrás-állapot (legenda dot + számláló + napló) ---
  function Source(root, slug, cfg) {
    this.root = root; this.slug = slug; this.cfg = cfg;
    this.li = root.querySelector('.pk-source[data-src="' + slug + '"]');
    this.numEl = root.querySelector('.pk-num[data-stat="' + slug + '"]');
    this.logEl = root.querySelector(".pk-log");
    this.count = 0; this.lastEventAt = 0; this.status = "connecting";
  }
  Source.prototype.setStatus = function (s) {
    this.status = s;
    if (this.li) {
      this.li.classList.toggle("is-live", s === "live");
      this.li.classList.toggle("is-silent", s === "silent" || s === "error");
    }
  };
  Source.prototype.event = function (now, geoLabel, text) {
    this.count += 1;
    if (this.numEl) this.numEl.textContent = String(this.count);
    this.lastEventAt = now;
    if (this.status !== "live") this.setStatus("live");
    if (this.logEl && text) {
      var li = document.createElement("li");
      li.setAttribute("data-src", this.slug);
      li.setAttribute("data-geo", geoLabel || "··");
      li.textContent = truncate(text, 88);
      this.logEl.insertBefore(li, this.logEl.firstChild);
      while (this.logEl.children.length > 5) this.logEl.removeChild(this.logEl.lastChild);
    }
  };
  Source.prototype.tickSilence = function (now) {
    if (this.status === "error") return;
    if (this.cfg.silenceMs != null && this.lastEventAt > 0 && now - this.lastEventAt > this.cfg.silenceMs) {
      if (this.status !== "silent") this.setStatus("silent");
    }
  };

  // --- Adapterek (izoláltak, defenzívek) ---
  function startSSE(src, map, signal) {
    var es, lastGap = 0;
    try { es = new EventSource(src.cfg.url); }
    catch (e) { src.setStatus("error"); return function () {}; }
    src.setStatus("connecting");
    es.onopen = function () { src.setStatus("live"); src.lastEventAt = Date.now(); };
    es.onmessage = function (ev) {
      var now = Date.now();
      if (now - lastGap < src.cfg.minEventGapMs) { // ritkítás, hogy olvasható maradjon
        try { var q = JSON.parse(ev.data); if (q && q.type === "categorize") return; } catch (e) {}
        // számoljuk, de ne minden eseményt villantsunk/naplózzunk
      }
      var title = null, lon = null, lat = null, cc = "··";
      try {
        var d = JSON.parse(ev.data);
        if (d && d.type === "categorize") return;
        var server = d && (d.server_name || (d.meta && d.meta.domain));
        var lang = langOf(server);
        if (lang && LANG_GEO[lang]) { lon = LANG_GEO[lang][0]; lat = LANG_GEO[lang][1]; cc = lang.slice(0, 3).toUpperCase(); }
        if (d && d.title) title = (server ? server.replace(".org", "") : "wiki") + ": " + d.title;
      } catch (e) { /* rossz JSON -> csak számláló */ }
      var throttled = (now - lastGap < src.cfg.minEventGapMs);
      src.event(now, cc, throttled ? null : title);
      if (!throttled) { lastGap = now; map.add("wikipedia", lon, lat, 0.55); }
    };
    es.onerror = function () {
      if (es.readyState === 2) src.setStatus("error");
      else src.setStatus("silent");
    };
    return function () { try { es.close(); } catch (e) {} };
  }

  function startUSGS(src, map, signal) {
    var seen = Object.create(null), primed = false;
    function tick() {
      fetch(src.cfg.url, { signal: signal, cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (data) {
          var feats = (data && Array.isArray(data.features)) ? data.features : [];
          if (src.status !== "live") src.setStatus("live");
          var fresh = [];
          for (var i = 0; i < feats.length; i++) {
            var f = feats[i], id = f && f.id;
            if (!id || seen[id]) continue; seen[id] = 1; fresh.push(f);
          }
          if (!primed) { primed = true; return; }
          fresh.sort(function (a, b) { return ((a.properties && a.properties.time) || 0) - ((b.properties && b.properties.time) || 0); });
          fresh.forEach(function (f) {
            var p = f.properties || {}, g = f.geometry || {};
            var coords = Array.isArray(g.coordinates) ? g.coordinates : [];
            var lon = coords.length ? coords[0] : null, lat = coords.length ? coords[1] : null;
            var mag = typeof p.mag === "number" ? p.mag : 1;
            src.event(Date.now(), "M" + mag.toFixed(1), "M" + mag.toFixed(1) + " · " + (p.place || "ismeretlen hely"));
            map.add("usgs", lon, lat, clamp(mag / 4, 0.4, 1.5));
          });
        })
        .catch(function () { if (!(signal && signal.aborted)) src.setStatus("error"); });
    }
    tick(); var iv = setInterval(tick, src.cfg.pollMs);
    return function () { clearInterval(iv); };
  }

  function startHN(src, map, signal) {
    var seenMax = 0, primed = false;
    function tick() {
      fetch(src.cfg.url, { signal: signal, cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (ids) {
          if (!Array.isArray(ids) || !ids.length) throw new Error("üres");
          if (src.status !== "live") src.setStatus("live");
          var maxId = ids[0];
          if (!primed) { seenMax = maxId; primed = true; return; }
          var fresh = ids.filter(function (id) { return id > seenMax; }).sort(function (a, b) { return a - b; });
          seenMax = Math.max(seenMax, maxId);
          fresh.slice(-5).forEach(function (id) {
            fetch("https://hacker-news.firebaseio.com/v0/item/" + id + ".json", { signal: signal, cache: "no-store" })
              .then(function (r) { return r.ok ? r.json() : null; })
              .then(function (item) {
                src.event(Date.now(), "HN", (item && item.title) ? item.title : "új történet");
                map.add("hackernews", HN_GEO[0], HN_GEO[1], 0.6);
              })
              .catch(function () { src.event(Date.now(), "HN", "új történet"); map.add("hackernews", HN_GEO[0], HN_GEO[1], 0.5); });
          });
        })
        .catch(function () { if (!(signal && signal.aborted)) src.setStatus("error"); });
    }
    tick(); var iv = setInterval(tick, src.cfg.pollMs);
    return function () { clearInterval(iv); };
  }

  // --- Fő init ---
  function initPanel_kata(root) {
    if (!root) return;
    if (root._kataInstance && typeof root._kataInstance.stop === "function") root._kataInstance.stop();

    var reduced = false;
    try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

    var canvas = root.querySelector(".pk-globe");
    if (!canvas || !canvas.getContext) return;
    var map = new WorldMap(root, canvas, reduced);
    map.resize(); map.render(0);

    var slugs = ["wikipedia", "usgs", "hackernews"];
    var sources = {};
    slugs.forEach(function (s) { sources[s] = new Source(root, s, SOURCES[s]); });

    var ac = ("AbortController" in window) ? new AbortController() : null;
    var signal = ac ? ac.signal : undefined;
    var stoppers = [], running = true;

    var ro = null;
    function onResize() { map.resize(); map.render(0); }
    if ("ResizeObserver" in window) { ro = new ResizeObserver(onResize); ro.observe(canvas); }
    else window.addEventListener("resize", onResize);

    try { stoppers.push(startSSE(sources.wikipedia, map, signal)); } catch (e) { sources.wikipedia.setStatus("error"); }
    try { stoppers.push(startUSGS(sources.usgs, map, signal)); } catch (e) { sources.usgs.setStatus("error"); }
    try { stoppers.push(startHN(sources.hackernews, map, signal)); } catch (e) { sources.hackernews.setStatus("error"); }

    var rafId = null, silenceIv = null;
    if (!reduced) {
      var loop = function () {
        if (!running) return;
        rafId = window.requestAnimationFrame(loop);
        var now = window.performance ? performance.now() : Date.now();
        var wall = Date.now();
        slugs.forEach(function (s) { sources[s].tickSilence(wall); });
        map.render(now);
      };
      rafId = window.requestAnimationFrame(loop);
    } else {
      silenceIv = setInterval(function () {
        var wall = Date.now();
        slugs.forEach(function (s) { sources[s].tickSilence(wall); });
      }, 2000);
    }

    var instance = {
      stop: function () {
        running = false;
        if (rafId) window.cancelAnimationFrame(rafId);
        if (silenceIv) clearInterval(silenceIv);
        stoppers.forEach(function (fn) { try { fn(); } catch (e) {} });
        if (ac) { try { ac.abort(); } catch (e) {} }
        if (ro) { try { ro.disconnect(); } catch (e) {} } else window.removeEventListener("resize", onResize);
        if (root._kataInstance === instance) root._kataInstance = null;
      }
    };
    root._kataInstance = instance;
    return instance;
  }

  window.initPanel_kata = initPanel_kata;
})();
