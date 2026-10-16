# 세로 제안서 테마 고르기 썸네일(apps/web/public/vstyles/<id>/1~4.jpg = 표지·목차·간지·본문) 만들기.
# 가상 사업(한빛시) 기획 json 을 엔진 조립(vertical.Build)에 그대로 넣고, 배경은 엔진과 같은 고르기(backgrounds)로 운영 powerAssets 공개 API 에서,
# 그림 파일은 이 PC 의 로컬 원본(storage/assets — 로컬 DB 에서 이름·크기로 맞춤. 로그인 없이 받은 원본엔 powerPlus 워터마크가 찍힌다),
# 렌더는 이 PC 의 PowerPoint(COM). AI 호출·운영 작업 생성 없음 — 나노바나나 대체 생성은 끈다(못 찾은 칸은 비워 두고 알린다).
#   python scripts/vstyle-previews.py <세로제안서_기획.json> [스타일…]      (끝나면 VerticalThemes.tsx 의 THUMB_V 를 올린다)
import io, json, os, re, subprocess, sys, tempfile, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "engine"))
import design  # noqa: E402
import vertical as v  # noqa: E402
from PIL import Image  # noqa: E402

API = os.environ.get("PP_API", "https://powerplus.hom2box.com/api/v1")
OUT = os.path.join(ROOT, "apps", "web", "public", "vstyles")


ROWS, LOCAL = {}, {}
NODE_MAP = r"""
const mysql = (await import("mysql2/promise")).default; const u = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({ host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1) });
const [r] = await db.query("SELECT i.name, i.w, i.h, f.path FROM asset_items i JOIN asset_files af ON af.item_id = i.id AND af.kind = 'original' JOIN core_files f ON f.id = af.file_id WHERE i.deleted_at IS NULL AND i.category IN ('photo','illust')");
const m = {}; for (const x of r) m[`${x.name}|${x.w}|${x.h}`] = x.path; console.log(JSON.stringify(m)); await db.end();
"""


def local_map():
    out = subprocess.run(["node", "--env-file=" + os.path.join(ROOT, ".env"), "--input-type=module", "-e", NODE_MAP],
                         cwd=os.path.join(ROOT, "db", "migrate-legacy"), capture_output=True, text=True, encoding="utf-8", check=True).stdout
    return json.loads(out)


def _api(method, path, body=None, raw=False):   # 목록은 운영 공개 API, 원본 파일은 로컬 원본
    if method != "GET":
        raise RuntimeError("미리보기는 읽기만")
    m = re.match(r"/assets/items/([^/]+)/file/original$", path)
    if m and m.group(1) in ROWS and ROWS[m.group(1)] in LOCAL:
        return open(os.path.join(ROOT, "storage", "assets", LOCAL[ROWS[m.group(1)]]), "rb").read()
    if m:
        print(f"  [warn] 로컬 원본 없음 — 워터마크 판을 씁니다: {m.group(1)}")
    r = urllib.request.urlopen(urllib.request.Request(API + path, headers={"User-Agent": "powerDeck-preview"}), timeout=90).read()
    if raw:
        return r
    d = json.loads(r)
    for row in (d.get("data") if isinstance(d, dict) else None) or []:
        if isinstance(row, dict) and row.get("id") and row.get("name"):
            ROWS[row["id"]] = f"{row['name']}|{row.get('w')}|{row.get('h')}"
    return d


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
    LOCAL.update(local_map())
    v._api, v.make_bg = _api, no_gen
    design.W["CFG"] = {"api_base": API + "/deck", "worker_key": "", "image_parallel": 1}
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
