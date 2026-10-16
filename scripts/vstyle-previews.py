# 세로 제안서 테마 고르기 썸네일(apps/web/public/vstyles/<id>/1~4.jpg = 표지·목차·간지·본문) 만들기.
# 가상 사업(한빛시) 기획 json 을 엔진 조립(vertical.Build)에 그대로 넣고, 배경은 엔진과 같은 고르기(backgrounds)로 고른다.
# 자산 목록·검색·원본 파일은 전부 이 PC 의 로컬 DB·storage/assets 에서 답한다 — 2026-10-16 서비스가 회원 전용이 되어
# 운영 공개 API(/assets/sets·items)가 401 을 돌려줘 배경이 전부 기본판으로 덮였다(자산은 로컬·운영 둘 다 등록하므로 목록이 같다).
# 렌더는 이 PC 의 PowerPoint(COM). AI 호출·운영 작업 생성 없음 — 나노바나나 대체 생성은 끈다(못 찾은 칸은 비워 두고 알린다).
#   python scripts/vstyle-previews.py <세로제안서_기획.json> [스타일…]      (끝나면 VerticalThemes.tsx 의 THUMB_V 를 올린다)
import io, json, os, re, subprocess, sys, tempfile, urllib.parse  # noqa: F401

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "engine"))
import design  # noqa: E402
import vertical as v  # noqa: E402
from PIL import Image  # noqa: E402

OUT = os.path.join(ROOT, "apps", "web", "public", "vstyles")

ITEMS, SETS = {}, []   # public_id → 행(엔진 목록 API 와 같은 모양 + _orig·_thumb 경로) / 세트 목록
NODE_MAP = r"""
const mysql = (await import("mysql2/promise")).default; const u = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({ host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1) });
const [items] = await db.query(`SELECT i.id, i.public_id, i.category, i.name, i.w, i.h, i.style_group, s.public_id AS set_id, s.name AS set_name,
  (SELECT f.path FROM asset_files af JOIN core_files f ON f.id = af.file_id WHERE af.item_id = i.id AND af.kind = 'original' LIMIT 1) AS orig,
  (SELECT f.path FROM asset_files af JOIN core_files f ON f.id = af.file_id WHERE af.item_id = i.id AND af.kind = 'thumb' LIMIT 1) AS thumb,
  (SELECT GROUP_CONCAT(t.tag SEPARATOR '|') FROM asset_tags t WHERE t.item_id = i.id AND t.axis = 'kw') AS tags
  FROM asset_items i LEFT JOIN asset_sets s ON s.id = i.set_id WHERE i.deleted_at IS NULL AND i.category IN ('photo','illust','icon','logo')`);
const [sets] = await db.query("SELECT public_id AS id, name, category FROM asset_sets");
console.log(JSON.stringify({ items, sets })); await db.end();
"""


def load_local():
    out = subprocess.run(["node", "--env-file=" + os.path.join(ROOT, ".env"), "--input-type=module", "-e", NODE_MAP],
                         cwd=os.path.join(ROOT, "db", "migrate-legacy"), capture_output=True, text=True, encoding="utf-8", check=True).stdout
    d = json.loads(out)
    for x in d["items"]:
        ITEMS[x["public_id"]] = {"id": x["public_id"], "category": x["category"], "name": x["name"] or "", "w": x["w"], "h": x["h"],
                                 "style_group": x["style_group"], "set": {"id": x["set_id"], "name": x["set_name"]} if x["set_name"] else None,
                                 "keywords": [t for t in (x["tags"] or "").split("|") if t], "_orig": x["orig"], "_thumb": x["thumb"]}
    SETS.extend(d["sets"])


def _hay(r):
    return (r["name"] + " " + " ".join(r["keywords"])).lower()


def _api(method, path, body=None, raw=False):
    """엔진 vertical._api 대신 — 엔진이 부르는 자산 경로만 로컬로 답한다"""
    u = urllib.parse.urlparse(path)
    q = {k: x[0] for k, x in urllib.parse.parse_qs(u.query).items()}
    m = re.match(r"/assets/items/([^/]+)/file/(original|thumb)$", u.path)
    if m:
        r = ITEMS.get(m.group(1)) or {}
        f = r.get("_orig") if m.group(2) == "original" else (r.get("_thumb") or r.get("_orig"))
        if not f:
            raise RuntimeError(f"로컬 원본 없음: {m.group(1)}")
        return open(os.path.join(ROOT, "storage", "assets", f), "rb").read()
    if method == "GET" and u.path == "/assets/sets":
        return {"data": [s for s in SETS if not q.get("category") or s["category"] == q["category"]]}
    if method == "GET" and u.path == "/assets/items":
        rows = [r for r in ITEMS.values() if (not q.get("category") or r["category"] == q["category"])
                and (not q.get("set") or (r["set"] or {}).get("id") == q["set"])]
        if q.get("q"):
            toks = [t for t in re.split(r"\s+", q["q"].lower()) if t]
            rows = sorted([r for r in rows if any(t in _hay(r) for t in toks)], key=lambda r: -sum(t in _hay(r) for t in toks))
        lim, page = int(q.get("limit") or 30), int(q.get("page") or 1)
        return {"data": [{k: x for k, x in r.items() if not k.startswith("_")} for r in rows[(page - 1) * lim: page * lim]]}
    if method == "POST" and u.path == "/assets/pick":   # 서버는 AI 로 고른다 — 미리보기는 낱말 겹침으로(같은 후보 범위)
        b = body or {}
        toks = {t.lower() for w in [b.get("text", "")] + list(b.get("queries") or []) for t in re.findall(r"[가-힣A-Za-z0-9]{2,}", str(w))}
        rows = [r for r in ITEMS.values() if r["category"] == b.get("category") and r["id"] not in set(b.get("exclude") or [])
                and (not b.get("set") or (r["set"] or {}).get("name") == b["set"] or r.get("style_group") == b["set"])]
        best = max(rows, key=lambda r: sum(t in _hay(r) for t in toks), default=None)
        n = sum(t in _hay(best) for t in toks) if best else 0
        return {"data": {"pick": best["id"] if n else None, "confidence": min(0.95, 0.3 + 0.2 * n) if n else 0, "picked": {"label": best["name"]} if best else {}}}
    raise RuntimeError(f"미리보기 로컬 응답 없음: {method} {path}")


class Job:
    id, dir = "preview", tempfile.mkdtemp()

    def event(self, msg, level="info"):
        print(f"  [{level}] {msg}")

    def push(self, *a):
        pass


def no_gen(job, art, field, kind="3d"):
    raise RuntimeError("미리보기에선 생성 안 함")


def render(pptx, dest):
    """1 표지 · 2 첫 목차 · 3 첫 간지 · 4 첫 본문 — 목차가 여러 쪽이라 번호가 아니라 장표 마스터(vertical-toc·divider·body) 이름으로 고른다"""
    import win32com.client
    app = win32com.client.Dispatch("PowerPoint.Application")
    pres = app.Presentations.Open(pptx, True, False, False)
    try:
        os.makedirs(dest, exist_ok=True)
        names = [pres.Slides(k).Design.Name for k in range(1, pres.Slides.Count + 1)]
        first = lambda w: next(k for k, nm in enumerate(names, 1) if w in nm)
        picks = [1, first("toc"), first("divider"), first("body")]
        for n, k in enumerate(picks, 1):
            tmp = os.path.join(tempfile.gettempdir(), f"vsp-{n}.png")
            pres.Slides(k).Export(tmp, "PNG", 1200, 1733)
            Image.open(tmp).convert("RGB").resize((380, 551), Image.LANCZOS).save(os.path.join(dest, f"{n}.jpg"), "JPEG", quality=86)
        # 크게 보기용 전 쪽 — p/1~N.jpg. 쪽 구성이 바뀌면 VerticalThemes.tsx 의 DECK 도 맞춘다
        os.makedirs(os.path.join(dest, "p"), exist_ok=True)
        print("  쪽 구성:", "".join({"cover": "C", "toc": "T", "divider": "D", "body": "B"}[nm.split("-")[-1]] for nm in names))
        for k in range(1, pres.Slides.Count + 1):
            tmp = os.path.join(tempfile.gettempdir(), f"vsp-p{k}.png")
            pres.Slides(k).Export(tmp, "PNG", 1200, 1733)
            Image.open(tmp).convert("RGB").resize((380, 551), Image.LANCZOS).save(os.path.join(dest, "p", f"{k}.jpg"), "JPEG", quality=86)
    finally:
        pres.Close()


def main():
    src = sys.argv[1]
    styles = sys.argv[2:] or list(v.STYLES)
    d = json.load(open(src, encoding="utf-8"))
    load_local()
    v._api, v.make_bg = _api, no_gen
    design.W["CFG"] = {"api_base": "http://local/api/v1/deck", "worker_key": "", "image_parallel": 1}
    for st in styles:
        print(f"== {st} {v.STYLES[st]['label']}")
        o = json.loads(json.dumps(d["outline"]))
        pages = {int(k): val for k, val in json.loads(json.dumps(d["pages"])).items()}
        v._STATE.set({})
        v.use_fonts(None, None)
        job = Job()
        try:
            v.resolve_assets(job, pages, v.body_kind(st))
        except Exception as e:
            print("  본문 그림 건너뜀:", str(e)[:80])
        bgs, log = v.backgrounds(job, o, st)
        print("  배경:", " · ".join(log))
        out = os.path.join(job.dir, f"{st}.pptx")
        v.Build(o, bgs, None, st, "navy").build(pages, out)
        render(out, os.path.join(OUT, st))
        print("  →", os.path.join(OUT, st))


if __name__ == "__main__":
    main()
