#!/usr/bin/env python3
"""Pulzus Műhely — statikus, TÖBBNYELVŰ build (HU/EN/DE).
Összeszereli a src/ authoring-forrásból a dist/ deploy-kimenetet, nyelvenként:
- a 4 panel.html fragmentet beilleszti az index.html placeholderek helyére
  (nyelvenként panel.<lang>.html, ha van; különben panel.html = HU fallback),
- a fejlécbe betölti a közös tokens.css-t (elöl), a style.css-t, majd a panel.css-eket,
- a panel.js-eket a app.js ELÉ fűzi (defer, sorrend-tartó),
- a shell {{token}}-jeit az src/i18n/<lang>.json-ból tölti,
- hreflang alternate linkek + látható nyelvváltó + <html lang> + canonical nyelvenként.
Kimenet: HU -> dist/index.html, EN -> dist/en.html, DE -> dist/de.html.
Gyökér-szintű nyelvi fájlok EGY közös asset-készlettel -> minden relatív út
(CSS/JS/health.json fetch/#anchor) törés nélkül működik mindhárom nyelven,
és a refresh-timer egyetlen health.json-ját mindhárom nyelv használja.
Idempotens: minden futáskor tiszta dist/-et gyárt.
"""
import os, re, json, shutil, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")
DIST = os.path.join(ROOT, "dist")

SITE_URL = "https://hanskulo.github.io/pulzus/"
PANELS = ["kata", "dezso", "pixelmano", "berci"]   # megjelenítési sorrend
LANGS = ["hu", "en", "de"]
DEFAULT = "hu"
# lang -> kimeneti fájlnév és publikus URL
OUTFILE = {"hu": "index.html", "en": "en.html", "de": "de.html"}
LANGURL = {l: (SITE_URL if l == DEFAULT else SITE_URL + OUTFILE[l]) for l in LANGS}
LANGLABEL = {"hu": "HU", "en": "EN", "de": "DE"}

def read(p):
    with open(p, encoding="utf-8") as f: return f.read()

def load_i18n():
    out = {}
    for l in LANGS:
        out[l] = json.loads(read(os.path.join(SRC, "i18n", l + ".json")))
    return out

def panel_fragment(slug, lang):
    """panel.<lang>.html, ha létezik; különben panel.html (HU fallback)."""
    base = os.path.join(SRC, "panels", slug)
    cand = os.path.join(base, "panel.%s.html" % lang)
    if lang != DEFAULT and os.path.exists(cand):
        return read(cand).strip()
    p = os.path.join(base, "panel.html")
    return read(p).strip() if os.path.exists(p) else None

def hreflang_block():
    lines = ['<link rel="alternate" hreflang="%s" href="%s">' % (l, LANGURL[l]) for l in LANGS]
    lines.append('<link rel="alternate" hreflang="x-default" href="%s">' % SITE_URL)
    return "\n  ".join(lines)

def langbar(current, label):
    items = []
    for l in LANGS:
        rel = OUTFILE[l]
        cur = ' aria-current="page"' if l == current else ""
        items.append('<a href="%s" hreflang="%s"%s>%s</a>' % (rel, l, cur, LANGLABEL[l]))
    return ('<nav class="langbar" aria-label="%s">\n    %s\n  </nav>'
            % (label, "\n    ".join(items)))

def build_lang(template, lang, strings):
    html = template

    # 1) Panel-fragmentek (nyelvenként, HU fallback) a placeholderek helyére.
    for slug in PANELS:
        frag = panel_fragment(slug, lang)
        if frag is None:
            print("FIGYELEM: hiányzó panel:", slug, file=sys.stderr); continue
        pattern = re.compile(r'<section\b[^>]*id="panel-%s".*?</section>' % re.escape(slug), re.S)
        if not pattern.search(html):
            print("FIGYELEM: nem talalt placeholder:", slug, file=sys.stderr); continue
        html = pattern.sub(lambda m: frag, html, count=1)

    # 2) CSS: tokens.css elöl, majd style.css, majd panel.css-ek.
    css_links = ['<link rel="stylesheet" href="panels/pixelmano/tokens.css">',
                 '<link rel="stylesheet" href="style.css">']
    for slug in PANELS:
        if os.path.exists(os.path.join(SRC, "panels", slug, "panel.css")):
            css_links.append('<link rel="stylesheet" href="panels/%s/panel.css">' % slug)
    html = html.replace('<link rel="stylesheet" href="style.css">', "\n  ".join(css_links), 1)

    # 3) Scriptek: panel.js-ek (sorrendben) a app.js ELE, mind defer.
    scripts = []
    for slug in PANELS:
        if os.path.exists(os.path.join(SRC, "panels", slug, "panel.js")):
            scripts.append('<script defer src="panels/%s/panel.js"></script>' % slug)
    scripts.append('<script defer src="app.js"></script>')
    html = html.replace('<script defer src="app.js"></script>', "\n  ".join(scripts), 1)

    # 4) Fej-markerek: hreflang + nyelvváltó.
    html = html.replace("<!--HREFLANG-->", hreflang_block(), 1)
    html = html.replace("<!--LANG_SWITCH-->", langbar(lang, strings.get("lang_switch_label", "Language")), 1)

    # 5) Számított tokenek + i18n szótár behelyettesítése.
    subs = dict(strings)
    subs["canonical"] = LANGURL[lang]
    for k, v in subs.items():
        html = html.replace("{{%s}}" % k, str(v))
    # maradék tokenek védőhálója (ha egy kulcs hiányozna, ne maradjon nyers {{...}})
    leftover = re.findall(r"\{\{([a-z_]+)\}\}", html)
    if leftover:
        print("FIGYELEM: kitöltetlen token(ek) [%s]: %s" % (lang, ", ".join(sorted(set(leftover)))), file=sys.stderr)
    return html

def main():
    if os.path.isdir(DIST): shutil.rmtree(DIST)
    shutil.copytree(SRC, DIST)

    i18n = load_i18n()
    template = read(os.path.join(SRC, "index.html"))

    for lang in LANGS:
        html = build_lang(template, lang, i18n[lang])
        with open(os.path.join(DIST, OUTFILE[lang]), "w", encoding="utf-8") as f:
            f.write(html)

    # A build-idejű forrás nem kell a deploy-ba: i18n/ szótárak.
    if os.path.isdir(os.path.join(DIST, "i18n")):
        shutil.rmtree(os.path.join(DIST, "i18n"))

    # Takarítás: teszt-harness.
    for junk in ["panels/dezso/_test-harness.html"]:
        jp = os.path.join(DIST, junk)
        if os.path.exists(jp): os.remove(jp)

    # Biztonság: nem-web forrásfájlok (belső doksik + health-generator, ami
    # monitoring-belsőséget ír le) SOHA ne deployoljanak publikusan.
    for dirpath, _dirnames, filenames in os.walk(DIST):
        for fn in filenames:
            if fn.lower().endswith((".md", ".py", ".sh", ".pyc")):
                os.remove(os.path.join(dirpath, fn))

    print("OK: dist/ elkeszult.")
    print("  nyelvek:", ", ".join("%s->%s" % (l, OUTFILE[l]) for l in LANGS))
    print("  panelek:", ", ".join(PANELS))
    for l in LANGS:
        print("  %s meret: %d byte" % (OUTFILE[l], os.path.getsize(os.path.join(DIST, OUTFILE[l]))))

if __name__ == "__main__":
    main()
