# -*- coding: utf-8 -*-
"""powerAssets(플랫폼)에서 아이콘·일러스트를 찾고 원본을 받는다 — 옛 powerPlus 공개 API(hom2box.com/powerPlus) 대체(2026-10-07).

  asset_find.py search <icon|illust|diagram|photo> <out_dir> 검색어 [검색어…]
      → out_dir 에 후보 썸네일 + 번호 시트(sheet.png)를 만들고, 줄마다 `번호 id 이름` 을 찍는다. 시트를 눈으로 보고 고른다.
  asset_find.py pick <icon|illust|diagram|photo> <out_dir> --text "자리 옆 글" [--exclude id,id] [--set 세트id] [검색어…]
      → 서버(Jev)가 문맥에 맞는 후보를 하나 고른다. 첫 줄 `pick <id> <ai|rule> <확신도>`, 이어서 후보 번호 시트(고른 것은 빨간 테두리).
        검색어를 비우면 서버가 글에서 실제 태그에 있는 낱말을 뽑는다. 고른 것이 그림과 안 맞으면 시트에서 다른 번호를 고른다.
  asset_find.py get <id> <out.png>
      → 원본(고해상)을 받는다. 마지막 줄 `ok <out.png>`.

인증은 엔진 키(config.json 의 worker_key) — 워커는 회원으로 처리돼 워터마크 없는 원본을 받는다."""
import io, json, os, sys, urllib.parse, urllib.request
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, "config.json"), encoding="utf-8"))
API = CFG["api_base"].rstrip("/")            # …/api/v1/deck
ROOT = API.rsplit("/deck", 1)[0]               # …/api/v1
HDR = {"Authorization": "Bearer " + CFG["worker_key"], "X-Worker": CFG.get("name", "worker"), "User-Agent": "powerDeck"}


def get(path):
    url = path if path.startswith("http") else ROOT + path.replace("/api/v1", "", 1)
    return urllib.request.urlopen(urllib.request.Request(url, headers=HDR), timeout=60).read()


def search(cat, q, limit=24):
    d = json.loads(get("/assets/items?" + urllib.parse.urlencode({"category": cat, "q": q, "limit": limit})))
    return d.get("data") or []


def post(path, body):
    req = urllib.request.Request(ROOT + path, data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
                                 headers=dict(HDR, **{"Content-Type": "application/json"}), method="POST")
    return json.loads(urllib.request.urlopen(req, timeout=60).read())


def pick(a):
    """pick <cat> <out_dir> --text 글 [--exclude id,id] [--set 세트id] [검색어…]"""
    cat, out, rest = a[1], a[2], a[3:]
    body, qs, i = {"category": cat}, [], 0
    while i < len(rest):
        if rest[i] in ("--text", "--exclude", "--set") and i + 1 < len(rest):
            k, v = rest[i][2:], rest[i + 1]
            body[k] = [x for x in v.split(",") if x] if k == "exclude" else v
            i += 2
        else:
            qs.append(rest[i])
            i += 1
    if qs:
        body["queries"] = qs
    d = post("/assets/pick", body)
    d = d.get("data", d)
    rows = d.get("candidates") or []
    if not rows:
        print("none")
        return
    os.makedirs(out, exist_ok=True)
    print("pick", d.get("pick"), d.get("by"), d.get("confidence"))
    print("queries", " ".join(d.get("queries") or []))
    cell, cols = 160, 8
    sheet = Image.new("RGB", (cols * cell, ((len(rows) + cols - 1) // cols) * (cell + 18)), "white")
    dr = ImageDraw.Draw(sheet)
    for n, r in enumerate(rows):
        x, y = (n % cols) * cell, (n // cols) * (cell + 18)
        try:
            t = Image.open(io.BytesIO(get(r["thumb_url"]))).convert("RGBA")
            t.thumbnail((cell - 10, cell - 10))
            t.save(os.path.join(out, f"{n + 1:02d}_{r['id']}.png"))
            sheet.paste(t, (x + (cell - t.width) // 2, y + (cell - t.height) // 2), t)
            dr.text((x + 4, y + cell), f"{n + 1}", fill="red")
            if r["id"] == d.get("pick"):
                dr.rectangle([x + 1, y + 1, x + cell - 2, y + cell - 2], outline="red", width=3)
        except Exception as e:
            print("skip", r["id"], e)
        print(n + 1, r["id"], r.get("name") or "", ",".join(r.get("keywords") or []))
    sheet.save(os.path.join(out, "sheet.png"))
    print("sheet", os.path.join(out, "sheet.png"))


def main(a):
    if len(a) >= 3 and a[0] == "pick":
        pick(a)
        return
    if len(a) >= 3 and a[0] == "get":
        im = Image.open(io.BytesIO(get(f"/assets/items/{a[1]}/file/original"))).convert("RGBA")
        im.save(a[2])
        print("ok", a[2])
        return
    if len(a) < 4 or a[0] != "search":
        sys.exit(__doc__)
    cat, out = a[1], a[2]
    os.makedirs(out, exist_ok=True)
    seen, rows = set(), []
    for q in a[3:]:
        for r in search(cat, q):
            if r["id"] not in seen:
                seen.add(r["id"])
                rows.append(r)
    rows = rows[:48]
    if not rows:
        print("none")
        return
    cell, cols = 160, 8
    sheet = Image.new("RGB", (cols * cell, ((len(rows) + cols - 1) // cols) * (cell + 18)), "white")
    dr = ImageDraw.Draw(sheet)
    for i, r in enumerate(rows):
        try:
            t = Image.open(io.BytesIO(get(r["thumb_url"]))).convert("RGBA")
            t.thumbnail((cell - 10, cell - 10))
            t.save(os.path.join(out, f"{i + 1:02d}_{r['id']}.png"))
            x, y = (i % cols) * cell, (i // cols) * (cell + 18)
            sheet.paste(t, (x + (cell - t.width) // 2, y + (cell - t.height) // 2), t)
            dr.text((x + 4, y + cell), f"{i + 1}", fill="red")
        except Exception as e:
            print("skip", r["id"], e)
        print(i + 1, r["id"], r.get("name") or "")
    sheet.save(os.path.join(out, "sheet.png"))
    print("sheet", os.path.join(out, "sheet.png"))


if __name__ == "__main__":
    main(sys.argv[1:])
