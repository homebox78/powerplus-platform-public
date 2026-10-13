# -*- coding: utf-8 -*-
"""기관·회사 로고를 파워플러스 로고 모음에서 찾아 투명 PNG 로 받는다 — 장표에 로고를 시안에서 잘라 넣지 않기 위해.

  logo_find.py "<기관 이름>" <out.png> [--white]

이름이 들어간 로고 가운데 가장 짧은 이름(정식 로고)을 받는다. --white 면 '흰색' 판을 고른다(없으면 기본 로고를 흰색으로 칠해 저장).
찾으면 마지막 줄에 `ok <out.png> <로고 이름>`, 못 찾으면 `none` (그때는 그 로고를 넣지 않고 checklist 에 적는다)."""
import io, json, os, sys, urllib.parse, urllib.request
from PIL import Image

# 2026-10-07: 옛 powerPlus 공개 API 대신 플랫폼 powerAssets(엔진 키로 원본)
HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, "config.json"), encoding="utf-8"))
ROOT = CFG["api_base"].rstrip("/").rsplit("/deck", 1)[0]
HDR = {"Authorization": "Bearer " + CFG["worker_key"], "X-Worker": CFG.get("name", "worker"), "User-Agent": "powerDeck"}
a = sys.argv[1:]
if len(a) < 2:
    sys.exit(__doc__)
name, out, white = a[0].strip(), a[1], "--white" in a


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=HDR), timeout=30).read()


try:
    d = json.loads(get(f"{ROOT}/assets/items?" + urllib.parse.urlencode({"category": "logo", "limit": 60, "q": name})))
except Exception as e:
    print("none", e)
    sys.exit(0)
rows = [r for r in d.get("data") or [] if name.replace(" ", "") in (r.get("name") or "").replace(" ", "") or name.replace(" ", "") in (r.get("alt") or "").replace(" ", "")]
if not rows:
    print("none")
    sys.exit(0)
wh = [r for r in rows if "흰색" in (r.get("name") or "")]
base = [r for r in rows if "흰색" not in (r.get("name") or "")]
pick = (wh or base) if white else (base or rows)
pick = sorted(pick, key=lambda r: len(r.get("name") or ""))[0]
im = Image.open(io.BytesIO(get(f"{ROOT}/assets/items/{pick['id']}/file/original"))).convert("RGBA")
px = im.load()
if im.getextrema()[3][0] == 255:   # 투명한 곳이 없으면 흰 바탕을 비운다
    for j in range(im.height):
        for i in range(im.width):
            r, g, b, al = px[i, j]
            if min(r, g, b) > 238:
                px[i, j] = (r, g, b, 0)
if white and "흰색" not in (pick.get("name") or ""):
    for j in range(im.height):
        for i in range(im.width):
            if px[i, j][3]:
                px[i, j] = (255, 255, 255, px[i, j][3])
bb = im.getbbox()
if bb:
    im = im.crop(bb)
im.save(out)
print("ok", out, pick.get("name"))
