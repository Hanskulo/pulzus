/* ============================================================
   Látogató-számláló widget  |  Kódoló Kata
   Semleges alap-logika (Pixelmanó csiszolja a vizuált).
   A HUMAN-beacont küldi (POST /hit) és megjeleníti a számokat.
   A BOT/AI-számot a statikus <img ...px> pixel gyűjti (lásd snippet.html),
   ezt a widget JS NEM kezeli -- a bot a JS-t úgysem futtatja.
   Idempotens: egy session egy oldalon csak egyszer küld human-beacont.
   ============================================================ */
(function () {
  "use strict";
  var el = document.querySelector(".vc[data-vc-site]");
  if (!el) return;
  var site = el.getAttribute("data-vc-site");
  var api = (el.getAttribute("data-vc-api") || "").replace(/\/+$/, "");
  if (!site || !api) return;

  // stabil session-azonosító (a reload-dedup alapja a szerveren)
  var sid = "";
  try {
    sid = sessionStorage.getItem("vc_sid");
    if (!sid) { sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 10); sessionStorage.setItem("vc_sid", sid); }
  } catch (e) { /* privát mód: sid marad "" -> a szerver nem dedupál, de nem is dől el */ }

  function render(d) {
    if (!d || typeof d !== "object") return;
    var h = el.querySelector('[data-vc="human"]');
    var b = el.querySelector('[data-vc="bot"]');
    if (h && typeof d.human === "number") h.textContent = d.human.toLocaleString();
    if (b && typeof d.bot === "number") b.textContent = d.bot.toLocaleString();
    el.setAttribute("data-vc-ready", "1");
  }

  function fetchCount() {
    fetch(api + "/count?site=" + encodeURIComponent(site), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(render)
      .catch(function () { /* néma: a számláló hiánya ne törje az oldalt */ });
  }

  var hitKey = "vc_hit_" + site;
  var already = false;
  try { already = sessionStorage.getItem(hitKey) === "1"; } catch (e) {}

  if (already) {
    fetchCount();
  } else {
    fetch(api + "/hit?site=" + encodeURIComponent(site), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sid: sid }),
      keepalive: true
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { try { sessionStorage.setItem(hitKey, "1"); } catch (e) {} render(d); })
      .catch(fetchCount);
  }
})();
