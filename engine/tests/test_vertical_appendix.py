# -*- coding: utf-8 -*-
"""세로 제안서 별첨·넘침·(계속) 쪽·목차 글 폭 시험(R117·R119·R120).
  10-28 운영 4d58·e25 점검: ① 별첨 장(※)에 본문 쪽이 하나도 없었다(간지 목록 줄만 — 요구사항 비교표·약어표·증빙 등)
  ② trim_overflow 가 넘친 행을 같은 항목 다음 쪽이 없으면 한 쪽에 2행까지 조용히 지웠다(4d58 37행)
  ③ 반쯤 빈 '(계속)' 쪽(38~47%)  ④ 목차 썸네일(LibreOffice)에서 장 줄 '이해' 가 꺾여 아래 줄과 겹쳤다
  검사
  ① 별첨 항목마다 표가 있는 쪽 · 요구사항 대응표에 요구사항 번호 전부 · 약어표에 본문 약어와 풀이 · 목차에 별첨 항목 이름 전부
  ② 덜어 낸 행 0 · 넘친 쪽의 표·구분 행 글이 결과 장표에 전부 있다 · '(계속)' 쪽이 생겼다
  ③ '(계속)' 쪽 채움(본문 아래 끝 / 쪽 높이) 60% 이상 — 일부러 1.3쪽 분량을 한 쪽에 몰아 넣는다
  ④ 목차·간지 쪽(레이아웃 글 포함) 모든 문단이 상자 안쪽 폭에 든다(서체 파일로 잰 폭 × 1.03 — LibreOffice 는 상자 폭에서 줄을 바꾼다)
     · 목차 같은 줄의 항목 상자와 쪽 번호 상자가 겹치지 않는다
  ⑤ 간지 절 목록(6개) 글 아래 끝 + 0.3cm ≤ 배경 그림 위 끝 — 테마 5가지, 검사기 음성 대조(글 끝을 모르는 옛 카드 깔기는 겹침으로 잡힘)
  ⑥ 면·테두리 있는 도식 상자(조직도·카드 등) 좌우 안쪽 여백 0.15cm 이상 · 글(줄바꿈 포함)이 상자 높이 안
  ⑦ 무관한 파워에셋 그림은 뽑히지 않는다 — '자막 검수 현장' 칸에 군용 로켓 차량·일반어('현장')만 겹친 사진 X, 바이오 빅데이터 간지에 식품 그림 X

  python -X utf8 engine/tests/test_vertical_appendix.py              (전부 통과면 0)
  python -X utf8 engine/tests/test_vertical_appendix.py <결과.pptx>   ④ 만 그 파일에 — 운영 결과 검사용
  PD_ENGINE_DIR=<고치기 전 engine 사본> python …                       음성 대조 — 고치기 전 코드는 ①②③ 이 실패해야 한다
가짜 기획(AI 없음)으로 실제 조립(Build)을 돌린다. 서버·PowerPoint·LibreOffice 없음."""
import glob, json, os, re, shutil, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(os.environ.get("PD_ENGINE_DIR") or os.path.dirname(HERE))
TMP = tempfile.mkdtemp(prefix="vapx-")
ENG = os.path.join(TMP, "engine")
os.makedirs(ENG)
for pat in ("*.py", "*.json"):
    for f in glob.glob(os.path.join(SRC, pat)):
        shutil.copy2(f, ENG)
for d in ("templates", "fonts"):
    s = os.path.join(SRC, d) if os.path.isdir(os.path.join(SRC, d)) else os.path.join(os.path.dirname(HERE), d)
    if os.path.isdir(s):
        shutil.copytree(s, os.path.join(ENG, d))
sys.path.insert(0, ENG)

from PIL import ImageFont  # noqa: E402
from pptx import Presentation  # noqa: E402
import vertical as V  # noqa: E402

FAILS = []


def check(ok, msg):
    print(("통과 " if ok else "실패 ") + msg)
    if not ok:
        FAILS.append(msg)


# ───────── ④ 글 폭 검사(결과 pptx 하나에 — 운영 결과에도 쓴다)
def _face_files():
    fl = json.load(open(os.path.join(ENG, "fonts", "fonts.json"), encoding="utf-8"))
    m = {}
    for x in fl["body"]:
        m.update(dict(zip(x["faces"], x["files"])))
    for x in fl["title"]:
        m[x["face"]] = x["file"]
    return m


_FF, _PIL = _face_files(), {}


def text_w(t, pt, face):
    """서체 파일로 잰 글 폭(cm) — 'Ⅰ' 같은 서체에 없는 글자는 라틴 I + 대체 글꼴 여백(엔진 목차와 같은 셈)"""
    f = _FF.get(face) or face
    p = os.path.join(ENG, "fonts", f) if f else ""
    key = (p, pt)
    if key not in _PIL:
        _PIL[key] = ImageFont.truetype(p, int(pt * 10)) if os.path.isfile(p) else None
    tt = t.translate(V.ROMAN_LATIN)
    extra = 0.15 if tt != t else 0
    if _PIL[key] is None:
        return V.text_cm(tt, pt) + extra
    return _PIL[key].getlength(tt) / 10 * 0.03528 + extra


def _boxes(shapes):
    for sh in shapes:
        if sh.has_text_frame and sh.text_frame.text.strip():
            yield sh


def _paras(sh):
    A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
    for p in sh.text_frame._txBody.findall(f"{A}p"):
        txt = "".join(t.text or "" for t in p.iter(f"{A}t"))
        if not txt.strip():
            continue
        sz = next((int(r.get("sz")) / 100 for r in p.iter() if r.tag in (f"{A}rPr", f"{A}endParaRPr") and r.get("sz")), 18.0)
        face = next((e.get("typeface") for e in p.iter(f"{A}latin") if e.get("typeface")), "")
        yield txt, sz, face


def fit_problems(path):
    """목차·간지 쪽(쪽 + 레이아웃)의 글 상자 — 문단 폭이 안쪽 폭을 넘거나, 목차 같은 줄 상자끼리 겹치면 문제"""
    prs = Presentation(path)
    out = []
    from pptx.oxml import parse_xml
    rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme"
    for n, s in enumerate(prs.slides, 1):
        lay = s.slide_layout
        theme = parse_xml(lay.slide_master.part.part_related_by(rel).blob).get("name") or ""   # base.pptx 마스터 테마 이름
        is_toc, is_div = theme == "vertical-toc", theme == "vertical-divider"
        if not (is_toc or is_div):
            continue
        boxes = list(_boxes(s.shapes)) + list(_boxes(lay.shapes))
        for sh in boxes:
            bp = sh.text_frame._txBody.bodyPr
            li = int(bp.get("lIns") if bp.get("lIns") is not None else 91440) / 360000
            ri = int(bp.get("rIns") if bp.get("rIns") is not None else 91440) / 360000
            inner = sh.width / 360000 - li - ri
            for txt, sz, face in _paras(sh):
                w = text_w(txt, sz, face)
                if w * 1.03 > inner:
                    out.append(f"{n}쪽 '{txt.strip()[:24]}' 글 {w:.2f}cm > 안쪽 폭 {inner:.2f}cm(꺾임)")
        if is_toc:   # 같은 줄(세로 가운데가 같은) 상자끼리 가로로 겹치지 않는다
            row = sorted([sh for sh in _boxes(s.shapes)], key=lambda x: (round((x.top + x.height / 2) / 36000), x.left))
            for a, b in zip(row, row[1:]):
                if abs((a.top + a.height / 2) - (b.top + b.height / 2)) < 36000 and a.left + a.width > b.left + 1800:
                    out.append(f"{n}쪽 '{a.text_frame.text.strip()[:20]}' 상자가 '{b.text_frame.text.strip()[:10]}' 와 겹침")
    return out


if len(sys.argv) > 1:   # 운영 결과 검사
    probs = fit_problems(sys.argv[1])
    print(f"목차·간지 글 폭 문제 {len(probs)}건")
    for p in probs:
        print("  ", p)
    shutil.rmtree(TMP, ignore_errors=True)
    sys.exit(1 if probs else 0)


# ───────── 가짜 기획 — 본문 1장(요구사항 번호·약어) + 별첨(4d58 과 같은 5항목, 증빙은 항목 이름이 절과 다르다)
REQ = [f"SFR-{k:03d}" for k in range(1, 13)] + [f"OMR-{k:03d}" for k in range(1, 9)]
o = {"project": {"name": "시험 정보시스템 위탁운영 사업", "client": "시험 기관", "year": "2026", "doc": "기술제안서"},
     "_reqs": len(REQ), "_req_list": [{"id": r, "name": f"요구 {r}"} for r in REQ],
     "chapters": [
         {"no": "Ⅰ", "title": "사업에 대한 이해와 추진 전략", "sections": [
             {"title": "사업에 대한 이해", "items": [{"title": "BBP 구성과 구축 범위", "req": ["SFR-001", "SFR-002"]},
                                                  {"title": "사업의 특징과 운영 원칙", "req": ["SFR-003"]}]},
             {"title": "위탁운영 및 유지관리 방안", "items": [{"title": "운영 지원 체계와 점검", "req": ["OMR-001", "OMR-002"]}]}]},
         {"no": "※", "title": "별첨", "sections": [
             {"title": "요구사항 수용여부 비교표", "items": [{"title": "요구사항 수용여부 비교표"}]},
             {"title": "평가항목 조견표", "items": [{"title": "평가항목 조견표"}]},
             {"title": "약어표", "items": [{"title": "약어표"}]},
             {"title": "기술적용계획표", "items": [{"title": "기술적용계획표", "req": ["SFR-010"]}]},
             {"title": "증빙서류", "items": [{"title": "핵심인력 경력·재직 증빙", "req": ["OMR-007"]}]}]}]}

ROWS8 = [[f"점검표행{k}", f"VPN·VDI 접속 점검 내용 {k}", "월 1회"] for k in range(1, 9)]
RROWS = [{"label": f"구분행{k}", "items": [f"SLA 기준에 따른 세부 방안 {k}", "보고와 환류"]} for k in range(1, 7)]
STEPS = [{"title": f"단계{k}", "items": ["접수와 분류", "처리 결과 보고"]} for k in range(1, 7)]
pages = {0: [
    {"title": "1.1 BBP 구성과 구축 범위", "req": "SFR-001, SFR-002", "lead": ["서비스 수준 협약(SLA)을 기준으로 운영합니다.", "VPN 접속과 CR 처리를 관리합니다."],
     "band": "넘치는 쪽", "blocks": [   # 1.3쪽 분량 — 같은 항목 다음 쪽 없음(예전엔 끝 행을 지웠다)
         {"kind": "process", "head": "처리 절차", "fig": {"steps": STEPS}},
         {"kind": "table", "head": "점검 항목", "table": {"cols": ["항목", "내용", "주기"], "rows": [list(r) for r in ROWS8]}},
         {"kind": "rows", "head": "구분별 방안", "fig": {"rows": [dict(r) for r in RROWS]}}]},
    {"title": "1.2 사업의 특징과 운영 원칙", "req": "SFR-003", "lead": ["운영 원칙을 정리합니다.", "ITSM 기반으로 관리합니다."], "band": "띠",
     "blocks": [{"kind": "cards", "head": "특징", "fig": {"cards": [{"title": "가", "items": ["WAS·DB 이중화"]}, {"title": "나", "items": ["BBP 표준"]}]}},
                {"kind": "text", "head": "원칙", "bullets": ["품질 보증(QA) 절차를 지킨다", "PMO 와 협의한다"]}]},
    {"title": "2.1 운영 지원 체계와 점검", "req": "OMR-001, OMR-002", "lead": ["점검 체계를 세웁니다.", "주기를 정합니다."], "band": "띠",
     "blocks": [{"kind": "kpi", "head": "목표", "fig": {"items": [{"value": "99.9%", "label": "가용성"}, {"value": "4시간", "label": "복구"}]}},
                {"kind": "text", "head": "점검", "bullets": ["일일 점검", "주간 보고"]}]}]}

V._STATE.set({})
V.use_fonts(None, None, "ko")
bd = V.Build(o, {}, None, "band", "navy")
out = os.path.join(TMP, "결과.pptx")
try:
    bd.build({k: [json.loads(json.dumps(p)) for p in v] for k, v in pages.items()}, out)
    err = None
except Exception as e:   # noqa: BLE001
    err = e
check(err is None, f"조립 오류 없음({err})")
prs = Presentation(out) if err is None else None
H = prs.slide_height if prs else 1
slides = []
for s in (prs.slides if prs else []):
    t = " ".join(sh.text_frame.text for sh in s.shapes if sh.has_text_frame)
    tb = [[c.text for c in r.cells] for sh in s.shapes if sh.has_table for r in sh.table.rows]
    slides.append((re.sub(r"\s+", " ", t), tb, s))
alltext = " ".join(t + " " + " ".join(" ".join(r) for r in tb) for t, tb, _ in slides)

# ① 별첨
toc = " ".join(t for t, _, s in slides[1:4])
for sec in o["chapters"][1]["sections"]:
    for it in sec["items"]:
        hit = [(t, tb) for t, tb, _ in slides if it["title"] in t and tb and re.search(r"※\s*-\s*\d", t)]
        check(bool(hit), f"별첨 '{it['title']}' 쪽(표 있음) {len(hit)}개")
        check(it["title"] in toc, f"목차에 별첨 '{it['title']}'")
req_cells = [r[0] for t, tb, _ in slides if "요구사항 수용여부 비교표" in t for r in tb]
check(all(r in req_cells for r in REQ), f"요구사항 대응표에 요구사항 {sum(1 for r in REQ if r in req_cells)}/{len(REQ)}건")
pg_of = {r[0]: r[2] for t, tb, _ in slides if "요구사항 수용여부 비교표" in t for r in tb if len(r) > 2}
check(pg_of.get("SFR-001", "").startswith("Ⅰ-") and pg_of.get("OMR-005") == "-", f"대응 쪽 SFR-001={pg_of.get('SFR-001')} · 본문에 없는 OMR-005={pg_of.get('OMR-005')}")
abbr = {r[0]: r[1] for t, tb, _ in slides if "약어표" in t for r in tb if len(r) > 1}
check("SLA" in abbr and "서비스 수준 협약" in abbr.get("SLA", ""), f"약어표 SLA → {abbr.get('SLA')}")
check(all(a in abbr for a in ("VPN", "CR", "ITSM", "BBP", "QA", "PMO")) and "SFR" not in abbr and "II" not in abbr,
      f"약어표 {len(abbr) - 1}개(본문 약어 VPN·CR·ITSM·BBP·QA·PMO 있음 · 요구사항 접두 SFR·로마 숫자 없음)")
check(abbr.get("BBP") == "[제안사 작성]", f"뜻 모르는 약어는 [제안사 작성] — BBP → {abbr.get('BBP')}")

# ② 지우지 않는다
check(not bd.trimmed, f"덜어 낸 행 {len(bd.trimmed)}개(0이어야) {bd.trimmed[:2]}")
lost = [r[0] for r in ROWS8 if r[0] not in alltext] + [r["label"] for r in RROWS if r["label"] not in alltext] + [s["title"] for s in STEPS if s["title"] not in alltext]
check(not lost, f"넘친 쪽의 행이 결과에 전부 있다(빠진 것 {lost})")
conts = [(i + 1, s) for i, (t, _, s) in enumerate(slides) if "1.1 BBP 구성과 구축 범위 (계속)" in t]
check(bool(conts), f"'(계속)' 쪽 {len(conts)}개")

# ③ (계속) 쪽 채움 — 바닥 꼬리(아래 6%)·쪽 전체 그림 빼고 가장 아래 끝 / 쪽 높이(분석 스크립트 vertical_fill 과 같은 셈)
for n, s in conts:
    bot = max([(sh.top + sh.height) for sh in s.shapes if sh.top is not None and sh.top + sh.height < H * 0.94 and sh.height < H * 0.9] or [0])
    check(bot / H >= 0.6, f"{n}쪽 '(계속)' 채움 {bot / H * 100:.0f}%(60% 이상)")

# ④ 목차·간지 글 폭
probs = fit_problems(out) if err is None else ["조립 실패"]
check(not probs, f"목차·간지 글이 상자 안쪽 폭에 든다·겹치지 않는다(문제 {len(probs)}건) {probs[:3]}")

# ───────── ⑤ 간지 절 목록 ↔ 배경 그림(R107·R120) — 목록 글 아래 끝(서체 줄 높이로 잼, LibreOffice 여유 ×1.05) + 0.3cm < 그림 위 끝
import io  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402


def scene():
    im = Image.new("RGB", (900, 1300), (225, 236, 252))
    d = ImageDraw.Draw(im)
    for k in range(8):
        d.rectangle((60 + k * 100, 40 + k * 20, 160 + k * 100, 1280), fill=(40, 90, 200))
    b = io.BytesIO()
    im.save(b, "JPEG")
    return b.getvalue()


def pic_top(blob, from_cm):
    """배경 그림에서 from_cm 아래로 처음 그림이 보이는 높이(cm) — 한 줄의 5% 넘는 점이 흰색(225)보다 어두우면"""
    im = Image.open(io.BytesIO(blob)).convert("L")
    w, h = im.size
    px = im.load()
    for y in range(int(h * from_cm / V.PAGE_H), h):
        if sum(1 for x in range(0, w, 4) if px[x, y] < 225) > 0.05 * (w / 4):
            return y * V.PAGE_H / h
    return V.PAGE_H


def list_bottom(box):
    A_ = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
    bp = box.text_frame._txBody.bodyPr
    tins = int(bp.get("tIns") if bp.get("tIns") is not None else 45720) / 360000
    total = 0.0
    for p in box.text_frame._txBody.findall(f"{A_}p"):
        if not "".join(t.text or "" for t in p.iter(f"{A_}t")).strip():
            continue
        sz = next((int(r.get("sz")) / 100 for r in p.iter(f"{A_}rPr") if r.get("sz")), 16.0)
        ln = p.find(f"{A_}pPr/{A_}lnSpc/{A_}spcPct")
        total += sz * 0.03528 * 1.2 * (int(ln.get("val")) / 100000 if ln is not None else 1.0) * 1.05
    return box.top / 360000 + tins + total


NSA_, NSR_, NSP_ = ("{http://schemas.openxmlformats.org/drawingml/2006/main}", "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}",
                    "{http://schemas.openxmlformats.org/presentationml/2006/main}")


def slide_bg(s):
    bg = s._element.find(f"{NSP_}cSld/{NSP_}bg")
    blip = bg.find(f".//{NSA_}blip") if bg is not None else None
    return s.part.related_part(blip.get(f"{NSR_}embed")).blob if blip is not None else None


# 검사기 음성 대조 — 글 끝을 모르는 옛 깔기(text_bottom=None, 카드 위 끝 0.52 쪽)는 절 6개 목록과 겹친다고 나와야 한다
_old = V.style_bg(scene(), "pill", "div", "2F5BD3", None)
_fake_bottom = 9.86 + 0.13 + 6 * 0.95
check(pic_top(_old, 9.0) < _fake_bottom + 0.3, f"검사기 음성 대조: 글 끝을 모르는 카드 깔기는 그림 위 끝 {pic_top(_old, 9.0):.1f}cm 가 목록 끝 {_fake_bottom:.1f}cm 위 — 겹침으로 잡힌다")
o6 = {"project": dict(o["project"]), "chapters": [
    {"no": "Ⅰ", "title": "기술부문(운영관리)", "sections": [{"title": t, "items": [{"title": "항목"}]} for t in
                                                         ("위탁운영 및 유지관리 방안", "시스템 운영 관리", "시스템 유지 관리", "예방 및 점검", "장애대응 및 복구", "공통사항")]},
    {"no": "※", "title": "별첨", "sections": []}]}
for st in ("pill", "band", "tab", "side", "line"):
    V._STATE.set({})
    V.use_fonts(None, None, "ko")
    p6 = os.path.join(TMP, f"div_{st}.pptx")
    V.Build(json.loads(json.dumps(o6)), {"cover": scene(), "toc": scene(), "div0": scene()}, None, st, "navy").build(
        {0: [{"title": "1.1 항목", "lead": ["가.", "나."], "band": "띠", "blocks": [{"kind": "text", "head": "소제목", "bullets": ["글"]}]}]}, p6)
    pr6 = Presentation(p6)
    div = next(s for s in pr6.slides if s.slide_layout.name.startswith("Ⅰ") and slide_bg(s) is not None
               and any(sh.has_text_frame and "6. 공통사항" in sh.text_frame.text for sh in s.shapes))
    box = next(sh for sh in div.shapes if sh.has_text_frame and "6. 공통사항" in sh.text_frame.text)
    lb = list_bottom(box)
    pt_ = pic_top(slide_bg(div), box.top / 360000)
    check(lb + 0.3 <= pt_, f"{st} 간지: 절 6개 목록 끝 {lb:.2f}cm + 0.3 ≤ 그림 위 끝 {pt_:.2f}cm")

# ───────── ⑥ 상자 안쪽 여백·글 높이(R120) — 면·테두리 있는 도식 상자: 좌우 여백 0.15cm 이상, 글(줄바꿈 포함)이 상자 높이 안
V._STATE.set({})
V.use_fonts(None, None, "ko")
o7 = {"project": dict(o["project"]), "chapters": [{"no": "Ⅰ", "title": "수행 조직", "sections": [{"title": "조직", "items": [{"title": "조직 구성"}]}]},
                                                 {"no": "※", "title": "별첨", "sections": []}]}
pg7 = {"title": "1.1 조직 구성", "lead": ["가.", "나."], "band": "띠", "blocks": [
    {"kind": "org", "head": "수행 조직", "fig": {"top": "사업책임자(PM)", "top_note": "통합운영실장 100% 상주", "side": ["품질보증(QA)"],
                                              "teams": [{"title": "운영지원팀", "items": ["헬프데스크 SR·CR 접수와 처리", "정기 점검"]},
                                                        {"title": "시스템관리팀", "items": ["서버·DB 운영", "백업과 복구 훈련"]}]}},
    {"kind": "cards", "head": "역할", "fig": {"cards": [{"title": "통합운영실 총괄 관리", "items": ["일·주·월 보고와 이슈 관리 체계 운영"]},
                                                     {"title": "보안", "items": ["취약점 점검"]}]}}]}
p7 = os.path.join(TMP, "box.pptx")
V.Build(o7, {}, None, "band", "navy").build({0: [pg7]}, p7)
bad = []
for n, s in enumerate(Presentation(p7).slides, 1):
    for sh in s.shapes:
        if sh.name not in V.FIG_NAMES or not sh.has_text_frame or not sh.text_frame.text.strip():
            continue
        sp = sh._element.find(f"{NSP_}spPr")
        if sp is None or (sp.find(f"{NSA_}solidFill") is None and (sp.find(f"{NSA_}ln/{NSA_}solidFill") is None)):
            continue
        geom = sp.find(f"{NSA_}prstGeom")
        if geom is not None and geom.get("prst") in ("ellipse", "rightArrow", "diamond", "chevron", "homePlate") or sh.width / 360000 < 1.2:
            continue
        bp = sh.text_frame._txBody.bodyPr
        ins = [int(bp.get(k) if bp.get(k) is not None else 91440) / 360000 for k in ("lIns", "tIns", "rIns", "bIns")]
        if min(ins[0], ins[2]) < 0.15 - 1e-3:
            bad.append(f"{n}쪽 '{sh.name}' 좌우 여백 {ins[0]:.2f}/{ins[2]:.2f}cm")
        inner = sh.width / 360000 - ins[0] - ins[2]
        hh = 0.0
        for txt, sz, face in _paras(sh):
            w = text_w(txt, sz, face)
            hh += max(1, -(-w * 1.03 // max(0.3, inner))) * sz * 0.03528 * 1.2
        if hh > sh.height / 360000 - ins[1] - ins[3] + 0.05:
            bad.append(f"{n}쪽 '{sh.name}' 글 높이 {hh:.2f}cm > 상자 안 {sh.height / 360000 - ins[1] - ins[3]:.2f}cm ('{sh.text_frame.text[:14]}')")
check(not bad, f"도식 상자 여백·글 높이 문제 {len(bad)}건 {bad[:4]}")

# ───────── ⑦ 그림 주제(R120) — 무관한 자산은 뽑히지 않는다(가짜 파워에셋)
ROCKET = {"id": "a1", "name": "다연장 로켓 발사 차량 — 군사 현장", "keywords": ["현장", "차량", "발사"], "set": {"name": "photo-doc-business"}}
SITE = {"id": "a2", "name": "공사 현장 크레인", "keywords": ["현장"], "set": {"name": "photo-doc-business"}}
EDIT = {"id": "a3", "name": "자막 편집 모니터 — 영상 제작 작업실", "keywords": ["자막", "영상", "편집"], "set": {"name": "photo-doc-business"}}
FOOD = {"id": "b1", "name": "곡물·채소·고기·생선 받침과 차트 — 식품 데이터 수집 — 세로 제안서 키비주얼", "set": {"name": V.VP_SETS["glass"]}}
CLOUD = {"id": "b2", "name": "구름과 이어진 서버 — 클라우드 — 세로 제안서 키비주얼", "set": {"name": V.VP_SETS["glass"]}}


def fake_api(rows):
    def f(method, path, body=None, raw=False):
        if raw:
            return b"IMG"
        if path.startswith("/assets/items?"):
            return {"data": list(rows)}
        return {"data": {"pick": None, "confidence": 0}}
    return f


slot = "자막 제작·검수 현장 — 자막 검수 — 다국어 자막 제작과 검수"
V._api = fake_api([ROCKET, SITE])
pid = V.photo_pick(slot, ["자막 검수 현장", "제작 현장"], set(), "photo")[0]
check(pid is None, f"'자막 검수 현장' 칸에 군용 로켓 차량·공사 현장 사진이 뽑히지 않는다(뽑힌 것 {pid})")
V._api = fake_api([ROCKET, SITE, EDIT])
pid = V.photo_pick(slot, ["자막 검수 현장", "제작 현장"], set(), "photo")[0]
check(pid == "a3", f"관련 있는 '자막 편집 모니터' 는 뽑힌다(뽑힌 것 {pid})")
V._api = fake_api([])
kw = {"topic": "바이오 빅데이터 플랫폼 통합운영실 위탁운영"} if "topic" in V.pick_portrait.__code__.co_varnames else {}
blob, src = V.pick_portrait([FOOD, CLOUD], "div5", ["제안업체 일반 간지 배경", "제안업체", "일반"], set(), "glass", None, **kw)
check("곡물" not in str(src), f"바이오 빅데이터 '제안업체 일반' 간지에 식품 그림이 뽑히지 않는다 — 맞는 게 없으면 None(생성으로, 10-29)(뽑힌 것 {src})")

shutil.rmtree(TMP, ignore_errors=True)
print("\n전부 통과" if not FAILS else f"\n실패 {len(FAILS)}건")
sys.exit(1 if FAILS else 0)
