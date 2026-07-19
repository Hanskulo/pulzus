/* A Karmester — Berci panel init. Globális: initPanel_berci(rootEl).
   GYÖKÉRZET/MICÉLIUM: a mag (Berci) a középen, három ívelt inda fut a muzsikusokhoz
   (Kata/Pixelmanó/Dezső). A biolumineszcens jel a magból utazik kifelé, indánként
   staggerelve = orkesztráció. Reduced-motion: statikus, derengő gyökérzet.
   Idempotens, nincs auto-futás import-kor. */
function initPanel_berci(root) {
  var cv = root.querySelector("#berciConductor");
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext("2d");
  var reduced = (window.PulzusMuhely && window.PulzusMuhely.reducedMotion) || false;

  // Biolumineszcens paletta (a panel egyedi identitása).
  var C_SEED  = "#7dffcf";  // mag magja (zöld biolumineszcencia)
  var C_SEED2 = "#b79cff";  // viola halo
  var C_NODE  = "#dcf3ea";  // muzsikus-csomópont
  var C_SIG   = "#8affd4";  // utazó jel

  var W = 440, H = 260;
  function resize() {
    var ratio = window.devicePixelRatio || 1;
    var w = cv.clientWidth || W;
    var scale = w / W;
    cv.width = Math.round(w * ratio);
    cv.height = Math.round(H * scale * ratio);
    ctx.setTransform(ratio * scale, 0, 0, ratio * scale, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize, { passive: true });

  var seed = { x: W / 2, y: H / 2 + 12, r: 21 };
  // A három inda: célpont + görbületi kontrollpont (perpendikuláris offset = organikus ív).
  var nodes = [
    { x: W / 2,     y: 40,     label: "Kata",      bend: 46,  fil: 1 },
    { x: 58,        y: H - 42, label: "Pixelmanó", bend: -52, fil: -1 },
    { x: W - 58,    y: H - 42, label: "Dezső",     bend: 52,  fil: 1 }
  ];

  // Kvadratikus Bezier kontrollpont: a szakasz felezőpontja + merőleges eltolás.
  function control(a, b, bend) {
    var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    // merőleges egységvektor
    var nx = -dy / len, ny = dx / len;
    return { x: mx + nx * bend, y: my + ny * bend };
  }
  function bez(a, c, b, t) {
    var u = 1 - t;
    return {
      x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * c.y + t * t * b.y
    };
  }

  // előre kiszámolt kontrollpontok + rövid oldalági filamentumok (organikus dúsítás)
  nodes.forEach(function (n) {
    n.c = control(seed, n, n.bend);
    // két apró leágazás az inda mentén
    var p1 = bez(seed, n.c, n, 0.42), p2 = bez(seed, n.c, n, 0.68);
    var ang = Math.atan2(n.y - seed.y, n.x - seed.x) + (n.fil * 0.9);
    n.filaments = [
      { x: p1.x, y: p1.y, ex: p1.x + Math.cos(ang) * 16, ey: p1.y + Math.sin(ang) * 16 },
      { x: p2.x, y: p2.y, ex: p2.x + Math.cos(ang + 0.5) * 12, ey: p2.y + Math.sin(ang + 0.5) * 12 }
    ];
  });

  function drawTendril(n) {
    // fő inda
    ctx.beginPath();
    ctx.moveTo(seed.x, seed.y);
    ctx.quadraticCurveTo(n.c.x, n.c.y, n.x, n.y);
    ctx.strokeStyle = "rgba(111,240,192,0.22)";
    ctx.lineWidth = 2.2; ctx.lineCap = "round";
    ctx.stroke();
    // filamentumok
    ctx.strokeStyle = "rgba(183,156,255,0.18)";
    ctx.lineWidth = 1.1;
    n.filaments.forEach(function (f) {
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.ex, f.ey); ctx.stroke();
    });
  }

  function glowDot(x, y, r, color, blur) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(125,255,207,0)");
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    if (blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
  }

  function drawNode(n) {
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(n.x, n.y, 14, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(10,20,17,0.92)"; ctx.fill();
    ctx.lineWidth = 1.6; ctx.strokeStyle = "rgba(125,255,207,0.65)";
    ctx.shadowColor = C_SEED; ctx.shadowBlur = 10; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle = C_NODE; ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(n.label.charAt(0), n.x, n.y);
  }

  function drawSeed(pulse) {
    // lélegző halo
    var haloR = seed.r + 10 + pulse * 8;
    glowDot(seed.x, seed.y, haloR, "rgba(183,156,255,0.5)", 0);
    glowDot(seed.x, seed.y, seed.r + pulse * 4, "rgba(125,255,207,0.9)", 0);
    // mag
    ctx.beginPath(); ctx.arc(seed.x, seed.y, seed.r * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = "#eafff7"; ctx.shadowColor = C_SEED; ctx.shadowBlur = 18;
    ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = "#06120e"; ctx.font = "700 11px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("B", seed.x, seed.y);
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    nodes.forEach(drawTendril);

    if (!reduced) {
      // utazó biolumineszcens jelek a magból kifelé, indánként staggerelve
      ctx.globalCompositeOperation = "lighter";
      nodes.forEach(function (n, i) {
        var phase = (t + i / nodes.length) % 1;
        var p = bez(seed, n.c, n, phase);
        glowDot(p.x, p.y, 9 - phase * 3, C_SIG, 0);
      });
      ctx.globalCompositeOperation = "source-over";
    }

    nodes.forEach(drawNode);
    // a mag akkor lüktet legerősebben, amikor a jel épp indul (ciklus eleje)
    var pulse = reduced ? 0.5 : Math.max(0, 1 - (t % 1) / 0.35);
    drawSeed(pulse);
  }

  if (reduced) { draw(0); return; }

  var start = null;
  function frame(ts) {
    if (start === null) start = ts;
    var rate = 2600; // igazodik a kollektív pulzushoz
    var t = ((ts - start) % rate) / rate;
    draw(t);
    window.requestAnimationFrame(frame);
  }
  window.requestAnimationFrame(frame);
}
