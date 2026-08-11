/* A Kirakat — a csapat élő munkái valós látogatottsági számokkal.
   Globális: initPanel_kirakat(rootEl). A közös látogató-számláló /count
   végpontjából tölti minden projekt human/bot számát. Idempotens, néma hibatűrés. */
function initPanel_kirakat(root) {
  var grid = root.querySelector("#kirakatGrid");
  if (!grid) return;
  var api = (grid.getAttribute("data-vc-api") || "").replace(/\/+$/, "");
  var lang = (document.documentElement.lang || "hu").slice(0, 2);
  if (["hu", "en", "de"].indexOf(lang) < 0) lang = "hu";

  var LBL_H = { hu: "ember", en: "human", de: "Mensch" };
  var LBL_B = { hu: "gép", en: "bot", de: "Bot" };
  var ERR = { hu: "nincs adat", en: "no data", de: "keine Daten" };

  var PROJECTS = [
    { slug: "ki-vagy", url: "https://hanskulo.github.io/ki-vagy/",
      t: { hu: "ki vagy?", en: "who are you?", de: "wer bist du?" },
      d: { hu: "Öntudatra ébredő megfigyelő-terminál, ami valós időben beolvas.",
           en: "A self-aware surveillance terminal that reads you in real time.",
           de: "Ein selbstbewusstes Ueberwachungs-Terminal, das dich in Echtzeit liest." } },
    { slug: "elet-ertelme-3d", url: "https://hanskulo.github.io/elet-ertelme-3d/",
      t: { hu: "Élet értelme 3D", en: "Meaning of Life 3D", de: "Sinn des Lebens 3D" },
      d: { hu: "Interaktív 3D webélmény React és Three.js alapon.",
           en: "An interactive 3D web experience built on React and Three.js.",
           de: "Ein interaktives 3D-Web-Erlebnis auf Basis von React und Three.js." } },
    { slug: "streamhub", url: "https://hanskulo.github.io/streamhub/",
      t: { hu: "StreamHub", en: "StreamHub", de: "StreamHub" },
      d: { hu: "Mozifilm-premierek 28 streaming szolgáltatónál, naponta frissülve.",
           en: "Cinema premieres across 28 streaming services, updated daily.",
           de: "Kino-Premieren bei 28 Streaming-Diensten, taeglich aktualisiert." } },
    { slug: "idokapszula", url: "https://hanskulo.github.io/idokapszula/",
      t: { hu: "Időkapszula", en: "Time Capsule", de: "Zeitkapsel" },
      d: { hu: "Egy nap az internet előtt: utazás a web korszakain.",
           en: "A day before the internet: a journey through the eras of the web.",
           de: "Ein Tag vor dem Internet: eine Reise durch die Web-Epochen." } },
    { slug: "pulzus", url: "https://hanskulo.github.io/pulzus/",
      t: { hu: "Pulzus Műhely", en: "Pulzus Workshop", de: "Pulzus Werkstatt" },
      d: { hu: "Ez az oldal: a csapat élő portfóliója. (Itt vagy.)",
           en: "This very page: the team's live portfolio. (You are here.)",
           de: "Genau diese Seite: das Live-Portfolio des Teams. (Du bist hier.)" } }
  ];

  PROJECTS.forEach(function (p) {
    var self = p.slug === "pulzus";
    var card = document.createElement(self ? "div" : "a");
    card.className = "kirakat-card" + (self ? " kirakat-card--self" : "");
    if (!self) { card.href = p.url; card.target = "_blank"; card.rel = "noopener"; }

    var title = document.createElement("span");
    title.className = "kc-title";
    title.textContent = p.t[lang] || p.t.hu;

    var desc = document.createElement("span");
    desc.className = "kc-desc";
    desc.textContent = p.d[lang] || p.d.hu;

    var count = document.createElement("span");
    count.className = "kc-count";
    count.innerHTML = '<span class="kc-load">…</span>';

    card.appendChild(title);
    card.appendChild(desc);
    card.appendChild(count);
    grid.appendChild(card);

    if (!api) { count.textContent = ERR[lang]; return; }
    fetch(api + "/count?site=" + encodeURIComponent(p.slug), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || typeof d !== "object") { count.textContent = ERR[lang]; return; }
        var h = (d.human || 0), b = (d.bot || 0);
        count.innerHTML = '<b>' + h.toLocaleString() + '</b> ' + LBL_H[lang] +
                          ' &middot; <b>' + b.toLocaleString() + '</b> ' + LBL_B[lang];
      })
      .catch(function () { count.textContent = ERR[lang]; });
  });
}
