# -*- coding: utf-8 -*-
"""발주기관·제안사 로고 크기 시험(R121) — 사용자 2026-10-28 "항상 발주기관 로고가 제안사 로고보다 15% 커야 함"(모든 덱 기본).
  고치기 전: 장표 바닥 틀(frame.py)만 지켰고, 코드로 그린 표지(frontmatter — 두 로고 높이 0.45in 같음)·시안 앞장 로고(design.save_front)·
  시안 바닥(design.compose_frame)은 면적만 1.15배라 가로로 긴 발주기관 로고가 제안사보다 낮았다. 세로 제안서는 이름이 없어 쌍을 잴 수 없었다.
  ① logosize.fit_pair — 여러 비율·상한 조합에서 발주기관 높이 ≥ 제안사 × 1.15, 상한 안
  ② 장표 바닥 틀(frame.py) — 레이아웃의 pd_frame_client_logo / vendor_logo 높이 비
  ③ 코드로 그린 표지(frontmatter.py) — 아래 양쪽 로고 높이 비
  ④ 시안 앞장 로고(design.save_front → <id>_logos.json) 높이 비
  ⑤ 시안 바닥(design.compose_frame) — 그림 속 로고 픽셀 높이 비
  ⑥ 에이전트가 놓은 앞장(frontmatter tag) — 이름 붙이기 + 안전망(제안사 로고를 줄임)
  ⑦ 세로 제안서(vertical.Build) — 본문 바닥 발주기관·제안사 로고가 이름으로 찾아지고 높이 비를 지킨다
  모든 결과 장표는 logosize.check(이름 또는 그림 sha1)로 잰다 — 허용 오차 1%.

  python -X utf8 engine/tests/test_logo_ratio.py           (전부 통과면 0)
  PD_ENGINE_DIR=<고치기 전 engine 사본> python …          음성 대조 — 고치기 전 코드는 ③④⑤⑥⑦(이름) 이 실패해야 한다
AI·서버·PowerPoint 없음."""
import glob, hashlib, io, json, os, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
NEW = os.path.dirname(HERE)
SRC = os.path.abspath(os.environ.get("PD_ENGINE_DIR") or NEW)
TMP = tempfile.mkdtemp(prefix="logoratio-")
ENG = os.path.join(TMP, "engine")
os.makedirs(ENG)
for pat in ("*.py", "*.json"):
    for f in glob.glob(os.path.join(SRC, pat)):
        shutil.copy2(f, ENG)
for d in ("templates", "fonts"):
    if os.path.isdir(os.path.join(SRC, d)):
        shutil.copytree(os.path.join(SRC, d), os.path.join(ENG, d))
    elif os.path.isdir(os.path.join(NEW, d)):
        shutil.copytree(os.path.join(NEW, d), os.path.join(ENG, d))
# 측정기(logosize.check)는 늘 새 코드 것 — 옛 코드 사본에는 없다. 엔진 사본과 섞이지 않게 따로 불러온다
import importlib.util  # noqa: E402
_sp = importlib.util.spec_from_file_location("logosize_meter", os.path.join(NEW, "logosize.py"))
M = importlib.util.module_from_spec(_sp)
_sp.loader.exec_module(M)
sys.path.insert(0, ENG)

from PIL import Image  # noqa: E402
from pptx import Presentation  # noqa: E402
from pptx.util import Inches  # noqa: E402

PY = sys.executable
FAILS = []
OLD = SRC != NEW


def check(ok, msg):
    print(("통과 " if ok else "실패 ") + msg)
    if not ok:
        FAILS.append(msg)


def logo_png(path, w, h, color):
    Image.new("RGBA", (w, h), color + (255,)).save(path)
    return path


def sha(path_or_blob):
    b = open(path_or_blob, "rb").read() if isinstance(path_or_blob, str) else path_or_blob
    return hashlib.sha1(b).hexdigest()


# 가로로 긴 발주기관(8:1) + 덜 긴 제안사(2.5:1) — 면적만 맞추면 발주기관이 더 낮다(가장 나쁜 조합)
BR = os.path.join(TMP, "_brand_src")
os.makedirs(BR)
CL = logo_png(os.path.join(BR, "client.png"), 800, 100, (220, 30, 30))
VE = logo_png(os.path.join(BR, "vendor.png"), 250, 100, (30, 160, 60))
KNOWN = {sha(CL): "client", sha(VE): "vendor"}


def judge(tag, prs, known=None, want=1):
    rows = M.check(prs, known)
    check(len(rows) >= want, f"{tag}: 로고 쌍 {len(rows)}개 찾음(최소 {want})")
    for i, ch, vh, r, ok in rows:
        check(ok, f"{tag} {i}장: 발주기관/제안사 높이 비 {r} (≥ {M.RATIO}, 허용 1%)")


def run(args, cwd=ENG):
    r = subprocess.run([PY, "-X", "utf8"] + args, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        print(r.stdout[-400:], r.stderr[-800:])
    return r.returncode == 0


def body_deck(path, n=2):
    p = Presentation()
    p.slide_width, p.slide_height = Inches(10.83), Inches(7.5)
    for _ in range(n):
        s = p.slides.add_slide(p.slide_layouts[6])
        s.shapes.add_textbox(Inches(1), Inches(2), Inches(4), Inches(1)).text_frame.text = "본문"
    p.save(path)
    return path


# ① 함수 자체(새 코드 측정기) — 비율·상한 조합
bad = []
for cw, chh in ((800, 100), (100, 100), (300, 100), (100, 300), (2000, 100)):
    for vw, vh in ((250, 100), (100, 100), (900, 100), (100, 250)):
        for lim in ((None, None), (0.39, 2.3), (0.3, 0.8), (0.2, 3.0)):
            c, v = M.fit_pair((cw, chh), (vw, vh), 0.19 * 5 ** 0.5, *lim)
            if c[1] < v[1] * M.RATIO * (1 - 1e-9) or (lim[0] and c[1] > lim[0] + 1e-9) or (lim[1] and c[0] > lim[1] + 1e-9):
                bad.append(((cw, chh), (vw, vh), lim, c, v))
check(not bad, f"① fit_pair 80 조합 — 높이 비 ≥ 1.15·상한 안 (어긋남 {len(bad)}: {bad[:2]})")
c1, v1 = M.fit_pair((800, 100), None, 1.0)
check(v1 is None and abs((c1[0] * c1[1]) ** 0.5 - M.RATIO) < 1e-9, "① 로고가 하나면 면적 맞춤만(높이 규칙 없음)")

# ② 장표 바닥 틀
src = body_deck(os.path.join(TMP, "frame.pptx"))
plan = os.path.join(TMP, "plan.json")
json.dump({"slides": [{"section": "Ⅰ. 개요 · 배경"}, {"section": "Ⅰ. 개요 · 목표"}]}, open(plan, "w", encoding="utf-8"), ensure_ascii=False)
opts = os.path.join(TMP, "frame_opts.json")
json.dump({"project": "시험 사업", "client_logo": CL, "vendor_logo": VE}, open(opts, "w", encoding="utf-8"))
if run([os.path.join(ENG, "frame.py"), src, plan, opts]):
    judge("② 바닥 틀", Presentation(src), KNOWN, 2)
else:
    check(False, "② frame.py 실행")

# ③ 코드로 그린 표지
src = body_deck(os.path.join(TMP, "front_src.pptx"))
dst = os.path.join(TMP, "front.pptx")
opts = os.path.join(TMP, "front_opts.json")
json.dump({"cover": True, "toc": False, "divider": False, "title": "시험 사업", "project": "시험 사업", "accent": "#1D4ED8",
           "client_logo": CL, "vendor_logo": VE}, open(opts, "w", encoding="utf-8"), ensure_ascii=False)
if run([os.path.join(ENG, "frontmatter.py"), src, plan, opts, dst]):
    prs = Presentation(dst)
    judge("③ 코드 표지", prs, KNOWN, 1)
    named = M.check(prs)
    check(len(named) >= 1, f"③ 코드 표지: 로고 쌍을 도형 이름으로 찾음({len(named)})")
else:
    check(False, "③ frontmatter.py 실행")


class Job:
    def __init__(self, d):
        self.dir, self.id, self.style, self.accent, self.font_body, self.font_title, self.lang = d, 0, None, "#1D4ED8", None, None, "ko"

    def event(self, *a, **k):
        pass


JD = os.path.join(TMP, "job")
os.makedirs(os.path.join(JD, "_brand"))
shutil.copy2(CL, os.path.join(JD, "_brand", "client.png"))
shutil.copy2(VE, os.path.join(JD, "_brand", "vendor.png"))
import design  # noqa: E402

# ④ 시안 앞장 로고(밝은 바탕)
b = io.BytesIO()
Image.new("RGB", (2400, 1600), (245, 248, 255)).save(b, "PNG")
for kind, fid in (("cover", "cover"), ("div", "div1")):
    try:
        design.save_front(Job(JD), fid, b.getvalue(), kind)
        info = {x["which"]: x for x in json.load(open(os.path.join(JD, "_mockup", f"{fid}_logos.json"), encoding="utf-8"))}
        hc, hv = (Image.open(os.path.join(JD, "_mockup", info[w]["file"])).height for w in ("client", "vendor"))   # 넣을 로고 파일 그대로(json 의 % 는 반올림)
        r = hc / hv
        check(r >= M.RATIO * (1 - M.TOL), f"④ 시안 {fid} 로고: 발주기관/제안사 높이 비 {r:.3f}")
    except Exception as e:
        check(False, f"④ 시안 {fid} 로고: {e!r}")

# ⑤ 시안 바닥(그림 속 로고 픽셀)
bp = os.path.join(TMP, "body.png")
Image.new("RGB", (1600, 900), (255, 255, 255)).save(bp)
try:
    im = design.compose_frame(Job(JD), bp, {"section": "Ⅰ. 개요 · 배경", "n": 3}, "시험 사업").convert("RGB")
    F = design.FRAME
    foot = im.crop((0, F["h"] - F["foot"], F["w"], F["h"]))

    def ph(col):
        m = Image.new("L", foot.size, 0)
        m.putdata([255 if abs(p[0] - col[0]) + abs(p[1] - col[1]) + abs(p[2] - col[2]) < 60 else 0 for p in (foot.get_flattened_data() if hasattr(foot, "get_flattened_data") else foot.getdata())])
        bb = m.getbbox()
        return (bb[3] - bb[1]) if bb else 0

    hc, hv = ph((220, 30, 30)), ph((30, 160, 60))
    check(hc > 0 and hv > 0 and hc / hv >= M.RATIO * (1 - M.TOL) - 1 / max(1, hv), f"⑤ 시안 바닥: 발주기관/제안사 픽셀 높이 {hc}/{hv} = {hc / max(1, hv):.3f}")
except Exception as e:
    check(False, f"⑤ 시안 바닥: {e!r}")

# ⑥ 에이전트가 놓은 앞장 → frontmatter tag
tg = os.path.join(TMP, "tag.pptx")
p = Presentation()
p.slide_width, p.slide_height = Inches(10.83), Inches(7.5)
s = p.slides.add_slide(p.slide_layouts[6])
d6 = os.path.join(TMP, "_mockup6")
os.makedirs(d6)
cl6, ve6 = shutil.copy2(CL, os.path.join(d6, "cover_logo_client.png")), shutil.copy2(VE, os.path.join(d6, "cover_logo_vendor.png"))
s.shapes.add_picture(cl6, Inches(0.76), Inches(0.5), height=Inches(0.3))     # 에이전트가 크기를 틀리게 놓은 경우(발주기관이 더 낮다)
s.shapes.add_picture(ve6, Inches(0.76), Inches(6.5), height=Inches(0.5))
s.shapes.add_textbox(Inches(1), Inches(3), Inches(5), Inches(1)).text_frame.text = "표지"
p.save(tg)
if run([os.path.join(ENG, "frontmatter.py"), "tag", tg, "1=cover"]):
    prs = Presentation(tg)
    judge("⑥ 앞장 tag", prs, KNOWN, 1)
    named = M.check(prs)
    check(len(named) >= 1, f"⑥ 앞장 tag: 로고 쌍을 도형 이름으로 찾음({len(named)})")
    kinds = [((sh.name or "")[9:].split("_")[0]) for sh in prs.slides[0].shapes]
    check(set(kinds) == {"cover"}, f"⑥ 앞장 tag: 이름에서 읽는 종류가 그대로 cover({sorted(set(kinds))})")
else:
    check(False, "⑥ frontmatter tag 실행")

# ⑦ 세로 제안서
try:
    import vertical as V
    blob = open(CL, "rb").read()
    o = {"project": {"name": "시험 사업", "client": "시험 기관", "year": "2026", "doc": "기술제안서"},
         "chapters": [{"no": "Ⅰ", "title": "개요", "sections": [{"title": "절", "items": [{"title": "항목", "pages": 1}]}]}]}
    pages = {0: [{"title": "1.1 항목", "lead": ["도입 글."], "band": "띠 글", "blocks": [{"kind": "text", "head": "소제목", "bullets": ["글 한 줄"]}]}]}
    out = os.path.join(TMP, "vertical.pptx")
    V.Build(o, {}, blob, "band", "navy").build(pages, out)
    prs = Presentation(out)
    known = dict(KNOWN)
    for m in prs.slide_masters:   # 견본의 제안사 로고(바닥 오른쪽 그림) — 옛 코드는 이름이 없어 그림으로 알아본다
        for sh in m.shapes:
            if sh.shape_type == 13 and sh.top > 26 * 360000 and sh.left > 9 * 360000:
                known[M._blob_hash(sh)] = "vendor"
    known[sha(blob)] = "client"
    judge("⑦ 세로 제안서", prs, known, 1)
    named = M.check(prs)
    check(len(named) >= 1, f"⑦ 세로 제안서: 로고 쌍을 도형 이름으로 찾음({len(named)})")
except Exception as e:
    import traceback
    traceback.print_exc()
    check(False, f"⑦ 세로 제안서: {e!r}")

shutil.rmtree(TMP, ignore_errors=True)
print(("실패 %d" % len(FAILS)) if FAILS else "전부 통과", "(엔진: %s)" % ("옛 사본" if OLD else "현재"))
sys.exit(1 if FAILS else 0)
