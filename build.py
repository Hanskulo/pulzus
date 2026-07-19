#!/usr/bin/env python3
"""Pulzus Műhely — statikus build.
Összeszereli a src/ authoring-forrásból a dist/ deploy-kimenetet:
- a 4 panel.html fragmentet beilleszti az index.html placeholderek helyére,
- a fejlécbe betölti a közös tokens.css-t (elöl), a style.css-t, majd a panel.css-eket,
- a panel.js-eket a app.js ELÉ fűzi (defer, sorrend-tartó), hogy az init-globálok
  a app.js boot előtt definiálva legyenek.
Idempotens: minden futáskor tiszta dist/-et gyárt.
"""
import os, re, shutil, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")
DIST = os.path.join(ROOT, "dist")

# Megjelenítési sorrend (ez az index.html-beli sorrend is)
PANELS = ["kata", "dezso", "pixelmano", "berci"]

def read(p):
    with open(p, encoding="utf-8") as f: return f.read()

def main():
    if os.path.isdir(DIST): shutil.rmtree(DIST)
    shutil.copytree(SRC, DIST)

    html = read(os.path.join(SRC, "index.html"))

    # 1) Panel-fragmentek beillesztése a placeholderek helyére.
    for slug in PANELS:
        frag_path = os.path.join(SRC, "panels", slug, "panel.html")
        if not os.path.exists(frag_path):
            print("FIGYELEM: hiányzó panel:", slug, file=sys.stderr); continue
        frag = read(frag_path).strip()
        pattern = re.compile(r'<section\b[^>]*id="panel-%s".*?</section>' % re.escape(slug), re.S)
        if not pattern.search(html):
            print("FIGYELEM: nem talalt placeholder:", slug, file=sys.stderr); continue
        html = pattern.sub(lambda m: frag, html, count=1)

    # 2) Fejléc: tokens.css elöl, majd style.css, majd panel.css-ek.
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

    with open(os.path.join(DIST, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)

    # Takarítás: a dist-be ne kerüljön teszt-harness / generator, ami nem kell élesben.
    for junk in ["panels/dezso/_test-harness.html"]:
        jp = os.path.join(DIST, junk)
        if os.path.exists(jp): os.remove(jp)

    # Biztonsag: a nem-web forrasfajlok (belso design-doksik + a health-generator,
    # ami szerver-metrikat/monitoring-belsoseget ir le) SOHA ne deployoljanak publikusan.
    # Csak a statikus web-reteg + a mar sanitizalt data/*.json kerul ki.
    for dirpath, _dirnames, filenames in os.walk(DIST):
        for fn in filenames:
            if fn.lower().endswith((".md", ".py", ".sh", ".pyc")):
                os.remove(os.path.join(dirpath, fn))

    print("OK: dist/ elkeszult.")
    print("  panelek:", ", ".join(PANELS))
    print("  index.html meret:", os.path.getsize(os.path.join(DIST, "index.html")), "byte")

if __name__ == "__main__":
    main()
