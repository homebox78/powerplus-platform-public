# -*- coding: utf-8 -*-
"""세로(A4) 제출용 제안서 자동 제작 — '제출용'(opts.purpose == 'submit') 작업을 이 모듈이 끝까지 만든다.

  1) 기획: 올린 자료(RFP·요약)에서 사업명·발주기관·제안서 목차(RFP 권고 목차가 있으면 그대로)를 뽑고,
     장마다 본문 쪽(경로·제목·요구사항·도입 2문장·띠 문구·블록[소제목·막대 제목·글머리·표])을 짠다.
  2) 배경: 표지·목차·간지 배경을 powerAssets(세트 photo-section-keyvisual)에서 먼저 고르고,
     없거나 확신이 낮으면 나노바나나로 '흰 바탕 미니멀 유리 오브젝트' 그림을 만든다.
     어느 쪽이든 우측 하단에 연하게 두고 왼쪽·위쪽은 흰색으로 날린다(사용자 기준 2026-10-14).
  3) 제작: templates/vertical/base.pptx(표지·목차·간지·본문 마스터 + 견본 4장)로
     표지 1 · 목차(장마다) · 간지(장마다) · 본문을 만든다. 쪽 번호는 장별(Ⅱ - 3), 목차 쪽 번호는 실제 쪽.
  기본 양식의 출처: design/제안서템플릿(사내 표준 세로 템플릿)을 2026-10-14 세션에서 정비한 것."""
import copy, io, json, math, os, re, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageFont
from lxml import etree
from pptx import Presentation
from pptx.oxml import parse_xml   # python-pptx 요소 클래스로 만든다 — etree.fromstring 도형은 도형 목록을 훑을 때 깨진다
from pptx.util import Cm, Pt

import design

A = "http://schemas.openxmlformats.org/drawingml/2006/main"
P = "http://schemas.openxmlformats.org/presentationml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS = {"a": A, "p": P, "r": R}
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(HERE, "templates", "vertical", "base.pptx")
PW, PH = 1500, 2167                     # 배경 그림(19.05 × 27.52cm 비율)
BG_SET = "photo-section-keyvisual"      # 표지·목차·간지 배경 세트
NAVY = "0B2A6F"
ROMAN = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ", "Ⅷ"]
BODY_BOTTOM = 25.6                       # 본문이 내려갈 수 있는 끝(cm) — 아래는 바닥 로고·쪽 번호
DEFAULT_PAGES = 30

OUTLINE_SYSTEM = """너는 공공 SI 제안서 기획자다. 올린 자료(제안요청서·요약·메모)를 읽고 A4 세로 기술제안서의 뼈대를 JSON 으로 낸다.

규칙
- 자료에 '제안서 목차(권고)'·'제안서 작성요령'이 있으면 그 장(Ⅰ, Ⅱ …)·절 이름과 순서를 그대로 쓴다. 없으면 기본 8장:
  Ⅰ 일반현황 / Ⅱ 전략 및 방법론 / Ⅲ 수행계획 / Ⅳ 수행기반 / Ⅴ 프로젝트 관리 / Ⅵ 프로젝트 지원 / Ⅶ 전문업체 참여 / Ⅷ 기타사항.
- 맨 끝에 별첨 장 하나(no 는 "※", title "별첨"): 요구사항 참조표·약어표·증빙서류 등 RFP 가 별첨으로 요구한 것.
- 장은 최대 8개 + 별첨. 절(sections) 아래 항목(items)이 본문 쪽 단위다. 항목마다 pages(1~3)를 정하고, 별첨을 뺀 pages 합이 {pages}쪽 안팎이 되게 한다.
- RFP 권고 목차의 절은 쪽 수가 적어도 합치거나 이름을 바꾸지 않는다(쪽이 모자라면 절마다 항목 1개·1쪽). 항목 제목은 22자 이내.
  배점이 큰 평가 항목(사업이해도·추진체계·기능 요구사항 등)에 쪽을 더 준다.
- item.req 에는 그 항목이 답하는 요구사항 고유번호(SFR-001 등)를 자료에서 찾아 적는다. 없으면 빈 배열.
- project.name 은 자료에 적힌 공식 사업명, client 는 발주기관 정식 명칭, year 는 사업연도(없으면 올해).
- chapter.art 는 그 장을 상징하는 '작은 사물 하나'를 영어로(예: "a glass magnifier over data cards"). 사람·장면·글자 없이.
- chapter.keywords 는 배경 그림 검색용 한국어 낱말 2~4개(예: ["사업이해", "돋보기", "분석"]).
- 자료에 없는 사실을 지어내지 않는다.

JSON 형식
{"project": {"name": "", "client": "", "year": "", "doc": "기술제안서"},
 "field": "사업 분야를 영어 한 구절로",
 "chapters": [{"no": "Ⅰ", "title": "", "art": "", "keywords": [], "sections": [{"title": "", "items": [{"title": "", "req": [], "pages": 1}]}]}]}"""

CHAPTER_SYSTEM = """너는 공공 SI 기술제안서 작성자다. 주어진 장(chapter)의 본문 쪽을 JSON 으로 쓴다. A4 세로 한 쪽은 위에서부터
경로 → 제목 → 도입 2문장 → 띠 문구(핵심 메시지 한 줄) → 블록 2~3개(소제목 · 막대 제목 · 글머리 2~4줄 · 필요하면 표) 로 짜인다.

규칙
- 항목(item) 하나에 pages 수만큼 쪽을 만든다(2쪽 이상이면 title 끝에 (1/2) 처럼 붙인다).
- title 은 '1.1 항목 이름' 꼴로 26자 이내(한 줄에 들어가게). 번호는 쓸 항목의 번호 그대로.
- lead 는 정확히 2문장. 문장마다 마침표로 끝나고 한 문장이 45자를 넘지 않는다(한 줄에 들어가게). strong 은 lead 첫 문장 안의 강조 어구(그대로 들어 있어야 한다).
- band 는 30자 안팎의 한 줄. bullets 는 문장마다 70자 이하, 개조식(~함, ~임), 앞에 기호를 붙이지 않는다.
- 블록의 table 은 꼭 필요할 때만(비교·일정·역할·지표). 열 2~4개, 행 2~6개, 칸 글은 짧게.
- '사용가능하다·할 수 있다·고려하고 있다' 같은 모호한 말을 쓰지 않는다. 셀 수 있는 것은 수치로 적는다.
- 사실·수치는 자료에 있는 것만 쓴다. 제안사 정보(회사 현황·실적·인력·지분)는 자료에 없으면 「[제안사 작성]」 자리표시로 둔다.
- req 는 그 쪽이 답하는 요구사항 고유번호를 쉼표로(없으면 빈 문자열).

JSON 형식
{"pages": [{"path": "1. 사업이해도 > 1.1 사업 배경 및 목적", "title": "1.1 사업 배경 및 목적", "req": "SFR-001, SFR-002",
  "lead": ["문장 하나.", "문장 둘."], "strong": "", "band": "",
  "blocks": [{"head": "", "small": "", "bar": "", "bullets": ["", ""], "table": {"cols": ["", ""], "rows": [["", ""]]}}]}]}"""


# ───────────────────────── 서체 — 코드는 a시월구일1~4(본문 굵기 4단계)·G마켓 산스 TTF Bold(제목)로 쓰고, 저장 직전 고른 서체로 바꾼다.
# 세로 제안서 본문은 3종만(사용자 2026-10-14), 제목 서체는 표지·목차·간지·쪽 제목의 큰 글자에만. 단계 = 1 옅음 · 2 본문 · 3 강조 · 4 굵음
VBODY = {
    "siwol": ("a시월구일", ("a시월구일1", "a시월구일2", "a시월구일3", "a시월구일4"),
              ("a시월구일1.ttf", "a시월구일2.ttf", "a시월구일3.ttf", "a시월구일4.ttf")),
    "kopub": ("KoPub돋움체", ("KoPub돋움체 Light", "KoPub돋움체 Medium", "KoPub돋움체 Bold", "KoPub돋움체 Bold"),
              ("KoPube돋움_L.ttf", "KoPube돋움_M.ttf", "KoPube돋움.ttf", "KoPube돋움.ttf")),
    "rix": ("Rix고딕", ("Rix고딕 M", "Rix고딕 M", "Rix고딕 B", "Rix고딕 EB"),
            ("RIXGOM.TTF", "RIXGOM.TTF", "RIXGOB.TTF", "RIXGOEB.TTF")),
}
TITLE0 = ("G마켓 산스", "G마켓 산스 TTF Bold", "GmarketSansTTFBold.ttf")
FONT = {"title": TITLE0, "body": VBODY["siwol"]}


def use_fonts(title=None, body=None):
    """opts.font_title · font_body → FONT. 모르는 값이면 기본(G마켓 산스 · a시월구일)"""
    t = TITLE0
    if title and title != "gmarket":
        try:
            import fontset
            if title in fontset.TITLES:
                t = fontset.TITLES[title]
        except Exception:
            pass
    FONT["title"], FONT["body"] = t, VBODY.get(str(body or ""), VBODY["siwol"])
    _FONTS.clear()


def _level(face):
    m = re.fullmatch(r"a시월구일([1-4])", face or "")
    return int(m.group(1)) - 1 if m else None


def fface(face):
    """코드 속 서체 이름 → 고른 서체 이름"""
    lv = _level(face)
    if lv is not None:
        return FONT["body"][1][lv]
    return FONT["title"][1] if face == TITLE0[1] else face


def ffile(face):
    lv = _level(face)
    if lv is not None:
        return FONT["body"][2][lv]
    return FONT["title"][2] if face == TITLE0[1] else face


def refont(prs):
    """저장 직전 — 장표·레이아웃·마스터·테마의 서체 이름을 고른 서체로"""
    if FONT["title"] == TITLE0 and FONT["body"] is VBODY["siwol"]:
        return
    sub = lambda m: f'typeface="{fface(m.group(1))}"'
    for part in prs.part.package.iter_parts():
        el = getattr(part, "_element", None)
        if el is not None:
            for e in el.iter():
                tf = e.get("typeface") if isinstance(e.tag, str) else None
                if tf and fface(tf) != tf:
                    e.set("typeface", fface(tf))
        elif "theme" in str(part.partname) and str(part.partname).endswith(".xml"):
            part._blob = re.sub(r'typeface="([^"]+)"', sub, part._blob.decode("utf-8")).encode("utf-8")


# ───────────────────────── 글자 폭(목차 점선·꼬리표 폭) — 서버에 글꼴이 없으면 글자 종류로 어림
def _font(file, size):
    for d in (os.path.join(HERE, "fonts"), os.path.join(HERE, "fonts", "private"), "C:/Windows/Fonts",
              os.path.expanduser("~/AppData/Local/Microsoft/Windows/Fonts"), os.path.expanduser("~/.local/share/fonts/powerdeck"),
              "/usr/share/fonts/truetype", os.path.expanduser("~/.fonts")):
        p = os.path.join(d, file if file.lower().endswith((".ttf", ".otf")) else file + ".ttf")
        if os.path.isfile(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return None


_FONTS = {}


def text_cm(t, pt, face="a시월구일2"):
    face = ffile(face)
    f = _FONTS.get((face, pt))
    if f is None and (face, pt) not in _FONTS:
        f = _FONTS[(face, pt)] = _font(face, pt * 10)
    if f:
        return f.getlength(t) / 10 * 0.03528
    em = pt * 0.03528
    return sum(em * (0.95 if ord(c) > 0x2E80 else 0.3 if c == " " else 0.56) for c in t)


# ───────────────────────── 기획
def _ctx(job, j, brief):
    raw = design.load_context(job, 1200000) or ""
    ctx = design.digest_context(job, raw) if raw else ""
    return ctx, raw


def outline(job, brief, note, ctx, raw, pages):
    user = (f"# 메모·요청\n{note or '(없음)'}\n\n# 사업 요약\n{ctx or '(없음)'}\n\n# 원문 발췌(제안서 목차·작성요령·평가 항목)\n"
            + design._excerpts(raw, ["제안서 목차", "작성요령", "작성지침", "평가 항목", "배점", "사업명", "발주"], 9000) + f"\n\n# 직접 쓴 글\n{brief or '(없음)'}")
    o = design._plan_call(job, OUTLINE_SYSTEM.replace("{pages}", str(pages)), user, 7000, "세로 제안서 목차")
    chs = [c for c in (o.get("chapters") or []) if c.get("title")]
    body = [c for c in chs if str(c.get("no")) != "※"][:8]
    for i, c in enumerate(body):
        c["no"] = ROMAN[i]
    att = next((c for c in chs if str(c.get("no")) == "※" or "별첨" in str(c.get("title"))), None) or {"title": "별첨", "sections": [
        {"title": "요구사항 참조표", "items": []}, {"title": "약어표", "items": []}, {"title": "증빙서류", "items": []}]}
    att.update({"no": "※", "title": "별첨"})
    o["chapters"] = body + [att]
    p = o.setdefault("project", {})
    p["name"] = str(p.get("name") or "").strip() or "사업명"
    p["client"] = str(p.get("client") or "").strip()
    p["year"] = re.sub(r"[^0-9]", "", str(p.get("year") or "")) or time.strftime("%Y")
    p["doc"] = str(p.get("doc") or "기술제안서")
    return o


def chapter_pages(job, o, ch, ctx, raw):
    items = [{"section": f"{si}. {s['title']}", "item": f"{si}.{ii} {it['title']}", "req": it.get("req") or [], "pages": int(it.get("pages") or 1)}
             for si, s in enumerate(ch.get("sections") or [], 1) for ii, it in enumerate(s.get("items") or [], 1)]
    if not items:
        return []
    keys = [ch["title"]] + [s["title"] for s in ch.get("sections") or []] + [x for it in items for x in it["req"]]
    user = (f"# 사업\n{o['project']['name']} — 발주 {o['project']['client']}\n\n# 이 장\n{ch['no']} {ch['title']}\n\n# 쓸 항목(순서대로)\n"
            + json.dumps(items, ensure_ascii=False) + f"\n\n# 사업 요약\n{ctx or '(없음)'}\n\n# 원문 발췌\n{design._excerpts(raw, keys, 9000)}")
    d = design._plan_call(job, CHAPTER_SYSTEM, user, 9000, f"{ch['no']} {ch['title']} 본문")
    return [pg for pg in (d.get("pages") or []) if pg.get("title")]


# ───────────────────────── 배경
def _api(method, path, body=None, raw=False):
    cfg = design.W["CFG"]
    root = cfg["api_base"].rstrip("/").rsplit("/deck", 1)[0]
    hdr = {"Authorization": "Bearer " + cfg["worker_key"], "X-Worker": cfg.get("name", "worker"), "User-Agent": "powerDeck"}
    data = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        hdr["Content-Type"] = "application/json"
    r = urllib.request.urlopen(urllib.request.Request(root + path, data=data, headers=hdr, method=method), timeout=90).read()
    return r if raw else json.loads(r)


def find_bg(job, text, keywords, used, kind):
    """powerAssets 배경 세트에서 고르기 — AI 확신 0.5 이상만 쓴다. 사람이 나오는 장면 키비주얼은 피한다."""
    try:
        d = _api("POST", "/assets/pick", {"category": "photo", "set": BG_SET, "text": text, "queries": keywords[:4], "exclude": list(used), "limit": 20})
        d = d.get("data", d)
    except Exception as e:
        job.event(f"powerAssets 배경 검색 실패({kind}) — 새로 만듭니다: {str(e)[:100]}", "warn")
        return None, None
    pick, conf = d.get("pick"), float(d.get("confidence") or 0)
    name = str((d.get("picked") or {}).get("label") or "")
    if not pick or conf < 0.9 or re.search(r"공무원|국민|회의|교육|고민|상담원|사람", name):
        return None, None
    try:
        used.add(pick)
        return _api("GET", f"/assets/items/{pick}/file/original", raw=True), f"powerAssets '{name}'(확신 {conf})"
    except Exception:
        return None, None


def make_bg(job, art, field):
    prompt = (f"A single small object made of clear and frosted glass with a subtle pale-blue glow: {art}. Theme of the project: {field}. "
              "Placed in the lower right of the frame on a seamless white surface. Minimal high-key product-style 3D render, soft diffused light, "
              "gentle shadow, bright light tone, white and very pale blue palette, restrained and elegant. The upper half and the left half of the frame "
              "are empty pure white. No people, no text, no letters, no numbers, no logos.")
    nb2 = str(design.W["CFG"].get("nb2_model") or design.styles.nb2_model())
    return design.gen_image(job, prompt, [], "4:3", None, model=nb2, plain=True)


def _ss(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def compose(blob, wf=1.0, hf=0.55, alpha=0.75, fx=0.7, fy=0.6, anchor=0.85):
    """우측 하단에 그림을 두고 왼쪽·위쪽으로 갈수록 흰색으로 날린다(numpy 없이 PIL 만)."""
    src = Image.open(io.BytesIO(blob)).convert("RGB")
    w, h = int(PW * wf), int(PH * hf)
    ar = w / h
    if src.width / src.height >= ar:
        cw = int(src.height * ar)
        x0 = int((src.width - cw) * anchor)
        crop = src.crop((x0, 0, x0 + cw, src.height))
    else:
        ch = int(src.width / ar)
        crop = src.crop((0, src.height - ch, src.width, src.height))
    crop = crop.resize((w, h), Image.LANCZOS)
    mx = Image.new("L", (w, 1))
    mx.putdata([int(255 * _ss(x / (w * fx))) for x in range(w)])
    my = Image.new("L", (1, h))
    my.putdata([int(255 * alpha * _ss(y / (h * fy))) for y in range(h)])
    from PIL import ImageChops
    mask = ImageChops.multiply(mx.resize((w, h)), my.resize((w, h)))
    page = Image.new("RGB", (PW, PH), (255, 255, 255))
    page.paste(crop, (PW - w, PH - h), mask)
    b = io.BytesIO()
    page.save(b, "JPEG", quality=88)
    return b.getvalue()


def backgrounds(job, o):
    """표지·목차·간지(장마다) 배경. 같은 그림을 두 번 쓰지 않는다."""
    used, out, log = set(), {}, []
    field = str(o.get("field") or o["project"]["name"])
    slots = [("cover", f"{o['project']['name']} 표지 배경", ["표지 배경"] + [o["project"]["name"][:10]], "a glass cube holding simple icons of the project's field"),
             ("toc", "목차 배경", ["목차 배경", "목차"], "a row of clear glass shelves or bars rising step by step")]
    slots += [(f"div{i}", f"{c['title']} 간지 배경", list(c.get("keywords") or [c["title"]]), str(c.get("art") or "a small glass object"))
              for i, c in enumerate(o["chapters"])]

    gen = []
    for key, text, kws, art in slots:   # 고르기는 순서대로(같은 그림 두 번 금지), 못 찾은 칸은 모아서 한꺼번에 생성
        blob, src = find_bg(job, text, kws, used, key)
        if blob is None:
            gen.append((key, art))
        else:
            out[key] = blob
            log.append(f"{key}: {src}")
    with ThreadPoolExecutor(max_workers=max(1, int(design.W["CFG"].get("image_parallel", 3)))) as ex:
        futs = {ex.submit(make_bg, job, art, field): key for key, art in gen}
        for f in futs:
            try:
                out[futs[f]] = f.result()
                log.append(f"{futs[f]}: 나노바나나 생성")
            except Exception as e:
                log.append(f"{futs[f]}: 생성 실패(기본 배경 유지) {str(e)[:60]}")
    return out, log


# ───────────────────────── 디자인 = 스타일(모양) × 톤(색) — 레퍼런스 design/ppt contents sample
#   스타일은 머리 영역·목차 머리·간지 구성이 서로 다르고(색과 무관), 톤은 색만 정한다(사용자 2026-10-14: "테마를 색상으로 나누면 안 된다").
STYLES = {
    "band":  {"label": "클래식 밴드", "desc": "꽉 찬 머리 띠 + 흰 글씨, 간지는 가운데 태그"},
    "tab":   {"label": "인덱스 탭", "desc": "왼쪽 탭 머리 + 밑선, 간지는 왼쪽 정렬"},
    "side":  {"label": "사이드 레일", "desc": "왼쪽 세로 레일에 장 번호·장 이름, 간지는 굵은 레일 + 큰 번호"},
    "split": {"label": "스플릿", "desc": "진한 블록(장) + 연한 블록(사업명) 2단 머리, 간지는 위쪽 색 블록"},
    "pill":  {"label": "플로팅 필", "desc": "여백 둔 둥근 머리 띠, 간지는 둥근 태그"},
    "line":  {"label": "미니멀 라인", "desc": "위쪽 굵은 줄 + 진한 글씨, 간지는 큰 장 번호 + 가는 선"},
}
#   톤 — dark = 진한 면·제목, mid = 경로·강조, light = 연한 면, head = 머리 색(2개면 그라데이션), badge/badge_text = 장 번호 배지,
#   proj = 진한 머리 위 사업명 글자, accent = 추천 강조색
TONES = {
    "navy":  {"label": "네이비", "dark": "0B2A6F", "mid": "2F5BD3", "light": "DCE5F7", "head": ["0B2A6F"], "badge": "FFFFFF", "badge_text": "0B2A6F", "proj": "C8D3EE", "accent": "#2F5BD3"},
    "blue":  {"label": "블루", "dark": "1537C4", "mid": "3D7BFF", "light": "DCE7FF", "head": ["1537C4", "4A86FF"], "badge": "FFFFFF", "badge_text": "1537C4", "proj": "DCE6FF", "accent": "#3D7BFF"},
    "deep":  {"label": "딥 네이비", "dark": "0A1840", "mid": "1E4FD8", "light": "D8E1F5", "head": ["07133A", "123A8C"], "badge": "22D3EE", "badge_text": "07133A", "proj": "9FB3DB", "accent": "#22B8D8"},
    "teal":  {"label": "틸", "dark": "0B5F69", "mid": "0FA3A3", "light": "D6F1EF", "head": ["0B5F69", "129C9F"], "badge": "FFFFFF", "badge_text": "0B5F69", "proj": "CFEFEE", "accent": "#0FA3A3"},
    "gray":  {"label": "차콜", "dark": "2B2F36", "mid": "2F6BFF", "light": "E3E6EB", "head": ["2B2F36"], "badge": "2F6BFF", "badge_text": "FFFFFF", "proj": "B9BEC7", "accent": "#2F6BFF"},
    "glass": {"label": "글래스 블루", "dark": "2A3F9D", "mid": "5B7CFA", "light": "E1E7FF", "head": ["3B5BDB", "7B97FF"], "badge": "FFFFFF", "badge_text": "3B5BDB", "proj": "E5EBFF", "accent": "#5B7CFA"},
}
THEMES = TONES   # 옛 이름(vtheme) 호환
# 기본 양식에 쓰인 색 → 역할(톤마다 바꿀 색). 회색·검정·안내선 주황은 그대로
ROLE = {**{c: "dark" for c in ("1D1D49", "002060", "09106D", "070C51", "0B2A6F", "223A90", "203890", "233C8D", "2C4D90", "142D7E", "324B9C", "213553", "0C1C96")},
        **{c: "mid" for c in ("0056A4", "0A41AE", "207FE8", "3975ED", "437CD9", "6B89CD", "3082DC", "5574C4", "FF3370")},
        **{c: "light" for c in ("BFD2F9",)}}
PAGE_W, PAGE_H = 19.05, 27.52


def _fill(colors, ang=0):
    if len(colors) == 1:
        return f'<a:solidFill><a:srgbClr val="{colors[0]}"/></a:solidFill>'
    return (f'<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="{colors[0]}"/></a:gs><a:gs pos="100000"><a:srgbClr val="{colors[1]}"/></a:gs>'
            f'</a:gsLst><a:lin ang="{ang}" scaled="0"/></a:gradFill>')


def _shape(tree, name, x, y, w, h, colors, geom="rect", adj=None, text=None, sz=1200, col="FFFFFF", face="G마켓 산스 TTF Bold", algn="l", ang=0, rot=0):
    ids = [int(e.get("id")) for e in tree.iter(f"{{{P}}}cNvPr")] or [1]
    av = f'<a:gd name="adj" fmla="val {adj}"/>' if adj is not None else ""
    t = (f'<a:p><a:pPr algn="{algn}"/><a:r><a:rPr lang="ko-KR" sz="{sz}"><a:solidFill><a:srgbClr val="{col}"/></a:solidFill><a:latin typeface="{face}"/><a:ea typeface="{face}"/></a:rPr><a:t>{text}</a:t></a:r></a:p>'
         if text else '<a:p><a:endParaRPr lang="ko-KR"/></a:p>')
    tree.append(parse_xml(
        f'<p:sp xmlns:p="{P}" xmlns:a="{A}"><p:nvSpPr><p:cNvPr id="{max(ids) + 1}" name="{name}"/><p:cNvSpPr/><p:nvPr userDrawn="1"/></p:nvSpPr>'
        f'<p:spPr><a:xfrm{f" rot=\"{rot}\"" if rot else ""}><a:off x="{int(Cm(x))}" y="{int(Cm(y))}"/><a:ext cx="{int(Cm(w))}" cy="{int(Cm(h))}"/></a:xfrm>'
        f'<a:prstGeom prst="{geom}"><a:avLst>{av}</a:avLst></a:prstGeom>{_fill(colors, ang) if colors else "<a:noFill/>"}<a:ln><a:noFill/></a:ln></p:spPr>'
        f'<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"/><a:lstStyle/>{t}</p:txBody></p:sp>'))


def _recolor_el(el, hexv):
    for rp in el.iter(f"{{{A}}}rPr"):
        for c in rp.findall(f"{{{A}}}solidFill") + rp.findall(f"{{{A}}}gradFill"):
            rp.remove(c)
        rp.insert(0, parse_xml(f'<a:solidFill xmlns:a="{A}"><a:srgbClr val="{hexv}"/></a:solidFill>'))


def head_geom(st, tn):
    """스타일별 머리 영역 — 띠 위치(bt,bh)·배지 x·제목 x·제목 색·사업명 색"""
    if st == "pill":
        return dict(bt=0.3, bh=1.1, bx=1.0, tx=2.1, tcol="FFFFFF", pcol=tn["proj"])
    if st == "tab":
        return dict(bt=0.0, bh=1.25, bx=0.95, tx=2.05, tcol="FFFFFF", pcol="8C8C8C")
    if st == "split":
        return dict(bt=0.0, bh=1.25, bx=0.95, tx=2.05, tcol="FFFFFF", pcol=tn["dark"])
    if st == "line":
        return dict(bt=0.32, bh=1.05, bx=0.95, tx=2.05, tcol=tn["dark"], pcol="8C8C8C")
    if st == "side":
        return dict(bt=0.0, bh=1.25, bx=0.27, tx=2.05, tcol=tn["dark"], pcol="8C8C8C")
    return dict(bt=0.0, bh=1.25, bx=0.95, tx=2.05, tcol="FFFFFF", pcol=tn["proj"])


def head_band(tree, st, tn):
    """머리 영역 도형(본문·목차 공통)"""
    W_ = PAGE_W
    if st == "pill":
        _shape(tree, "머리 띠", 0.55, 0.3, W_ - 1.1, 1.1, tn["head"], "roundRect", 50000)
    elif st == "tab":
        _shape(tree, "머리 띠", 0, 0, 10.2, 1.25, tn["head"], "snip1Rect", 28000)
        _shape(tree, "머리 밑선", 10.2, 1.2, W_ - 10.2, 0.05, [tn["head"][-1]])
    elif st == "split":
        _shape(tree, "머리 띠", 0, 0, 7.8, 1.25, tn["head"])
        _shape(tree, "머리 띠 연한", 7.8, 0, W_ - 7.8, 1.25, [tn["light"]])
        _shape(tree, "머리 밑선", 0, 1.25, W_, 0.06, [tn["mid"]])
    elif st == "line":
        _shape(tree, "머리 굵은 줄", 0, 0, W_, 0.32, tn["head"])
        _shape(tree, "머리 가는 선", 0.9, 1.42, W_ - 1.8, 0.03, [tn["light"]])
    elif st == "side":
        _shape(tree, "왼쪽 레일", 0, 0, 1.35, PAGE_H, tn["head"], ang=5400000)
        _shape(tree, "머리 가는 선", 1.95, 1.25, W_ - 2.85, 0.03, [tn["light"]])
    else:
        _shape(tree, "머리 띠", 0, 0, W_, 1.25, tn["head"])
        if tn.get("line"):
            _shape(tree, "머리 포인트 선", 0, 1.25, W_, 0.06, [tn["line"]])


def apply_theme(prs, st, tn, masters):
    """기본 양식 전체(마스터·레이아웃·견본)를 스타일 × 톤으로 — 색 지도 + 머리 영역·목차 머리·간지 구성"""
    st = st if st in STYLES else "band"
    for part in [m.part for m in prs.slide_masters] + [l.part for m in prs.slide_masters for l in m.slide_layouts] + [s.part for s in prs.slides]:
        for c in part._element.iter(f"{{{A}}}srgbClr"):
            role = ROLE.get((c.get("val") or "").upper())
            if role:
                c.set("val", tn[role])
    m_body, m_toc, m_div, m_cover = masters
    g = head_geom(st, tn)
    bt, bh = g["bt"], g["bh"]
    gh = 0.6
    gy = bt + (bh - gh) / 2 if st != "side" else 0.45

    def center(sh, x=None, w=None, top=None, h=None):
        sh.top, sh.height = Cm(bt if top is None else top), Cm(bh if h is None else h)
        if x is not None:
            sh.left = Cm(x)
        if w is not None:
            sh.width = Cm(w)
        sh.text_frame.vertical_anchor = 3
        bp = sh.text_frame._txBody.find("a:bodyPr", NS)
        for k in ("tIns", "bIns"):
            bp.set(k, "0")
        for x_ in bp.findall("a:spAutoFit", NS) + bp.findall("a:normAutofit", NS):
            bp.remove(x_)

    # ── 본문 머리
    for nm in ("머리 밑줄", "장 번호 배지"):
        for x in named(m_body.shapes, nm):
            x._element.getparent().remove(x._element)
    tree = m_body.shapes._spTree
    head_band(tree, st, tn)
    badge_bg = tn["dark"] if st in ("line",) else tn["badge"]
    badge_tx = "FFFFFF" if st in ("line",) else tn["badge_text"]
    _shape(tree, "장 번호 배지", g["bx"], gy, 0.82, gh, [badge_bg], "roundRect", 22000)
    pn = next((x for x in walk(m_body.shapes) if x.has_text_frame and x.top < Cm(1.5) and x.text_frame.text.strip()), None)
    if pn is not None:   # 사업명
        center(pn)
        _recolor_el(pn._element, g["pcol"])
        tree.remove(pn._element)
        tree.append(pn._element)
    if st == "side":   # 바닥 왼쪽 로고가 레일에 걸리지 않게
        for sh in m_body.shapes:
            if sh.top > Cm(26) and sh.left < Cm(1.5):
                sh.left = Cm(1.75)
    for lay in m_body.slide_layouts:
        for sh in lay.shapes:
            if not (sh.has_text_frame and sh.top < Cm(2)):
                continue
            if sh.name == "Rectangle 95":
                center(sh, g["bx"], 0.82, gy, gh)
                for p_ in sh.text_frame.paragraphs:
                    p_.alignment = 2
                _recolor_el(sh._element, badge_tx)
            elif st == "side":   # 장 이름을 레일 안에 세로로(위→아래)
                w_, h_ = 9.0, 1.35
                sh.rotation = 90
                sh.width, sh.height = Cm(w_), Cm(h_)
                sh.left, sh.top = Cm(1.35 / 2 - w_ / 2), Cm(1.6 + w_ / 2 - h_ / 2)
                sh.text_frame.vertical_anchor = 3
                for p_ in sh.text_frame.paragraphs:
                    p_.alignment = 1
                _recolor_el(sh._element, "FFFFFF")
            else:
                center(sh, g["tx"])
                _recolor_el(sh._element, g["tcol"])
    # ── 간지
    for x in named(m_div.shapes, "그룹 41"):
        x._element.getparent().remove(x._element)
    dt = m_div.shapes._spTree
    if st == "band":
        _shape(dt, "장 태그", (PAGE_W - 4.6) / 2, 3.62, 4.6, 0.95, tn["head"], "roundRect", 18000)
    elif st == "pill":
        _shape(dt, "장 태그", (PAGE_W - 4.6) / 2, 3.62, 4.6, 0.95, tn["head"], "roundRect", 50000)
    elif st == "tab":
        _shape(dt, "장 태그", 2.0, 3.62, 4.6, 0.95, tn["head"], "snip1Rect", 28000)
        _shape(dt, "장 밑선", 6.6, 4.52, PAGE_W - 7.6, 0.05, [tn["head"][-1]])
    elif st == "split":
        _shape(dt, "위쪽 색 블록", 0, 0, PAGE_W, 14.0, tn["head"], ang=5400000)   # 목록 4줄까지 블록 안
    elif st == "side":
        _shape(dt, "왼쪽 굵은 레일", 0, 0, 4.4, PAGE_H, tn["head"], ang=5400000)
    elif st == "line":
        _shape(dt, "가는 선", (PAGE_W - 5.0) / 2, 8.75, 5.0, 0.05, [tn["mid"]])
    for lay in m_div.slide_layouts:
        for sh in lay.shapes:
            if not sh.has_text_frame:
                continue
            t = sh.text_frame.text.strip()
            is_tag = "CHAPTER" in t or t in ("※", "*")
            if st in ("tab",):
                sh.left = Cm(2.0) if not is_tag else Cm(2.0)
                if is_tag:
                    sh.width = Cm(4.6)
                for p_ in sh.text_frame.paragraphs:
                    p_.alignment = 2 if is_tag else 1
            elif st == "side":
                if is_tag:   # 큰 장 번호(레일 안, 흰 글씨)
                    sh.left, sh.top, sh.width, sh.height = Cm(0), Cm(2.6), Cm(4.4), Cm(3.2)
                    for p_ in sh.text_frame.paragraphs:
                        p_.alignment = 2
                        for r in p_.runs:
                            r.font.size = Pt(60)
                else:
                    sh.left, sh.width = Cm(5.2), Cm(12.8)
                    for p_ in sh.text_frame.paragraphs:
                        p_.alignment = 1
            elif st == "line" and is_tag:   # 큰 장 번호(색)
                sh.left, sh.top, sh.width, sh.height = Cm(0), Cm(2.4), Cm(PAGE_W), Cm(3.6)
                for p_ in sh.text_frame.paragraphs:
                    p_.alignment = 2
                    for r in p_.runs:
                        r.font.size = Pt(72)
            if is_tag:
                _recolor_el(sh._element, tn["mid"] if st == "line" else "FFFFFF")
            elif st == "split":
                _recolor_el(sh._element, "FFFFFF")
    # ── 목차 머리
    for nm in ("그룹 2", "자유형 34"):
        for x in named(m_toc.shapes, nm):
            if x._element.getparent() is not None:
                x._element.getparent().remove(x._element)
    tt = m_toc.shapes._spTree
    head_band(tt, st, tn)
    lab_col = "FFFFFF" if st in ("band", "tab", "split", "pill") else tn["dark"]
    lx = 2.05 if st == "side" else g["bx"] + 0.1
    _shape(tt, "목차 글", lx, bt + 0.07, 2.0, bh, None, text="목차", sz=1400, col=lab_col)
    for lay in m_toc.slide_layouts:
        for sh in lay.shapes:
            if sh.has_text_frame and ("CHAPTER" in sh.text_frame.text or sh.text_frame.text.strip() in ("※", "*")):
                center(sh, lx + 2.1)
                for p_ in sh.text_frame.paragraphs:
                    p_.alignment = 1
                _recolor_el(sh._element, lab_col)
    # ── 표지·간지·목차 왼쪽 가는 세로 띠 = 톤 머리 색
    for m in (m_cover, m_div, m_toc):
        for sh in m.shapes:
            if sh.shape_type == 1 and sh.left < Cm(0.1) and sh.width < Cm(0.5) and sh.height > Cm(20):
                sp = sh._element.find("p:spPr", NS)
                for c in sp.findall("a:solidFill", NS) + sp.findall("a:gradFill", NS) + sp.findall("a:noFill", NS):
                    sp.remove(c)
                sp.find("a:prstGeom", NS).addnext(parse_xml(f'<a:solidFill xmlns:a="{A}"><a:srgbClr val="{tn["head"][0]}"/></a:solidFill>'))


# ───────────────────────── pptx 도우미
def set_bg(owner, blob):
    _, rid = owner.part.get_or_add_image_part(io.BytesIO(blob))
    csld = owner._element.find("p:cSld", NS)
    old = csld.find("p:bg", NS)
    if old is not None:
        csld.remove(old)
    csld.insert(0, parse_xml(
        f'<p:bg xmlns:p="{P}" xmlns:a="{A}" xmlns:r="{R}"><p:bgPr><a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="{rid}"/>'
        f'<a:srcRect/><a:stretch><a:fillRect/></a:stretch></a:blipFill><a:effectLst/></p:bgPr></p:bg>'))


def walk(shapes):
    for sh in shapes:
        yield sh
        if sh.shape_type == 6:
            yield from walk(sh.shapes)


def abs_box(sh):
    """그룹 안 도형의 실제 위치(cm) — 그룹 변환(off·chOff·ext·chExt)을 거슬러 올라가 계산"""
    el = sh._element
    off, ext = el.find(".//a:xfrm/a:off", NS), el.find(".//a:xfrm/a:ext", NS)
    x, y, w, h = int(off.get("x")), int(off.get("y")), int(ext.get("cx")), int(ext.get("cy"))
    par = el.getparent()
    while par is not None and par.tag == f"{{{P}}}grpSp":
        gx = par.find("p:grpSpPr/a:xfrm", NS)
        o, e, co, ce = gx.find("a:off", NS), gx.find("a:ext", NS), gx.find("a:chOff", NS), gx.find("a:chExt", NS)
        sx = int(e.get("cx")) / max(1, int(ce.get("cx")))
        sy = int(e.get("cy")) / max(1, int(ce.get("cy")))
        x = int(o.get("x")) + (x - int(co.get("x"))) * sx
        y = int(o.get("y")) + (y - int(co.get("y"))) * sy
        w, h = w * sx, h * sy
        par = par.getparent()
    return x / 360000, y / 360000, w / 360000, h / 360000


def named(shapes, name, nth=None):
    hits = [s for s in walk(shapes) if s.name == name]
    return hits if nth is None else (hits[nth] if len(hits) > nth else None)


def set_text(sh, text):
    """첫 문단 첫 런 서식을 살려 글만 바꾼다."""
    body = sh.text_frame._txBody
    ps = body.findall("a:p", NS)
    for p_ in ps[1:]:
        body.remove(p_)
    rs = ps[0].findall("a:r", NS)
    if not rs:
        r = etree.SubElement(ps[0], f"{{{A}}}r")
        etree.SubElement(r, f"{{{A}}}t")
        end = ps[0].find("a:endParaRPr", NS)
        if end is not None:
            ps[0].remove(r)
            end.addprevious(r)
        rs = [r]
    rs[0].find("a:t", NS).text = text
    for r in rs[1:]:
        ps[0].remove(r)
    for f in ps[0].findall("a:fld", NS):
        ps[0].remove(f)


def clone_slide(prs, src):
    """같은 파일 안에서 장표 복제(그림 없는 견본만 — 글·도형·선)."""
    s = prs.slides.add_slide(src.slide_layout)
    for ph in list(s.placeholders):
        ph._element.getparent().remove(ph._element)
    for el in src.shapes._spTree.iterchildren():
        if el.tag.split("}")[1] in ("sp", "grpSp", "cxnSp", "pic", "graphicFrame"):
            s.shapes._spTree.append(copy.deepcopy(el))
    return s


def master_of(prs, name):
    """PowerPoint '디자인' 이름 = 마스터 테마 이름(base.pptx 를 만들 때 vertical-body/cover/toc/divider 로 붙였다)"""
    for m in prs.slide_masters:
        th = m.part.part_related_by("http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme")
        if (parse_xml(th.blob).get("name") or "") == name:
            return m
    raise RuntimeError(f"base.pptx 에 '{name}' 마스터가 없습니다")


def layout_for(master, i):
    ls = list(master.slide_layouts)
    return ls[min(i, len(ls) - 1)]


def move_slide(prs, slide, to):
    lst = prs.slides._sldIdLst
    for sid in lst:
        if prs.part.related_part(sid.get(f"{{{R}}}id")) is slide.part:
            lst.remove(sid)
            lst.insert(to, sid)
            return


def drop_slide(prs, slide):
    lst = prs.slides._sldIdLst
    for sid in list(lst):
        rid = sid.get(f"{{{R}}}id")
        if prs.part.related_part(rid) is slide.part:
            prs.part.drop_rel(rid)
            lst.remove(sid)


# ───────────────────────── 제작
class Build:
    def __init__(self, o, bgs, logo, style="band", tone="navy"):
        self.o, self.bgs, self.logo = o, bgs, logo
        self.style = style if style in STYLES else "band"
        self.th = TONES.get(tone) or TONES["navy"]
        self.prs = Presentation(BASE)
        s = list(self.prs.slides)
        self.s_body, self.s_cover, self.s_toc, self.s_div = s[0], s[1], s[2], s[3]
        self.m_body = master_of(self.prs, "vertical-body")
        self.m_toc = master_of(self.prs, "vertical-toc")
        self.m_div = master_of(self.prs, "vertical-divider")
        self.m_cover = master_of(self.prs, "vertical-cover")
        apply_theme(self.prs, self.style, self.th, (self.m_body, self.m_toc, self.m_div, self.m_cover))
        self.pageno = {}     # (장 번호) → 쪽 수
        self.pn = {}         # 장 → 본문 레이아웃에서 떼어 낸 쪽 번호 칸

    # 공통 글: 사업명(마스터들의 머리·바닥)
    def project_text(self):
        name = self.o["project"]["name"]
        for m in (self.m_body, self.m_toc, self.m_div):
            for sh in walk(m.shapes):
                if sh.has_text_frame and re.search(r"사업|구축|○○", sh.text_frame.text) and sh.top < Cm(27):
                    set_text(sh, name)
        # 본문 바닥 왼쪽: 발주기관 로고(있으면 그림, 없으면 이름)
        x, y, h = Cm(1.75 if self.style == "side" else 1.02), Cm(26.61), Cm(0.6)
        if self.logo:
            im = Image.open(io.BytesIO(self.logo))
            self.m_body.shapes._spTree.append(self._pic_el(self.m_body, self.logo, x, y, int(h * im.width / im.height), h, "발주기관 로고"))
        elif self.o["project"]["client"]:
            self._text_el(self.m_body, self.o["project"]["client"], x, y, Cm(6), h, 900, "595959", "a시월구일3")

    def _pic_el(self, owner, blob, x, y, w, h, name):
        _, rid = owner.part.get_or_add_image_part(io.BytesIO(blob))
        ids = [int(e.get("id")) for e in owner._element.iter(f"{{{P}}}cNvPr")] or [1]
        return parse_xml(
            f'<p:pic xmlns:p="{P}" xmlns:a="{A}" xmlns:r="{R}"><p:nvPicPr><p:cNvPr id="{max(ids) + 1}" name="{name}"/>'
            f'<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr userDrawn="1"/></p:nvPicPr>'
            f'<p:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
            f'<p:spPr><a:xfrm><a:off x="{int(x)}" y="{int(y)}"/><a:ext cx="{int(w)}" cy="{int(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>')

    def _text_el(self, owner, text, x, y, w, h, sz, col, face, bold=False):
        ids = [int(e.get("id")) for e in owner._element.iter(f"{{{P}}}cNvPr")] or [1]
        t = (text or "").replace("&", "&amp;").replace("<", "&lt;")
        owner.shapes._spTree.append(parse_xml(
            f'<p:sp xmlns:p="{P}" xmlns:a="{A}"><p:nvSpPr><p:cNvPr id="{max(ids) + 1}" name="글"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>'
            f'<p:spPr><a:xfrm><a:off x="{int(x)}" y="{int(y)}"/><a:ext cx="{int(w)}" cy="{int(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>'
            f'<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"/><a:lstStyle/><a:p><a:r>'
            f'<a:rPr lang="ko-KR" sz="{sz}" b="{1 if bold else 0}"><a:solidFill><a:srgbClr val="{col}"/></a:solidFill><a:latin typeface="{face}"/><a:ea typeface="{face}"/></a:rPr>'
            f'<a:t>{t}</a:t></a:r></a:p></p:txBody></p:sp>'))

    # 표지
    def cover(self):
        s = clone_slide(self.prs, self.s_cover)
        p = self.o["project"]
        yr = named(s.shapes, "TextBox 29", 0)
        if yr is not None:
            set_text(yr, f"{p['year']}년")
        tt = named(s.shapes, "TextBox 24", 0)
        if tt is not None:
            l1, l2, small = split_title(re.sub(r"^\s*(19|20)\d{2}\s*년(도)?\s*", "", p["name"]))   # 연도는 위 줄에 따로 있다
            ps = tt.text_frame.paragraphs
            ps[0].runs[0].text, ps[1].runs[0].text = l1, l2
            if small:
                for r in ps[0].runs:
                    r.font.size = Pt(26)
                for r in ps[1].runs:
                    r.font.size = Pt(32)
        dc = named(s.shapes, "TextBox 30", 0)
        if dc is not None:
            set_text(dc, p["doc"])
        if self.bgs.get("cover"):
            set_bg(s, compose(self.bgs["cover"], 1.0, 0.62 if self.style == "split" else 0.68, 0.82, 0.6, 0.55))
        light_text = self.cover_style(s, dc)
        x, y, h = Cm(1.91), Cm(1.39), Cm(1.35)
        if self.logo:
            im = Image.open(io.BytesIO(self.logo))
            s.shapes._spTree.append(self._pic_el(s, self.logo, x, y, int(h * im.width / im.height), h, "발주기관 로고"))
        elif p["client"]:
            self._text_el(s, p["client"], x, y, Cm(10), h, 1600, "FFFFFF" if light_text else self.th["dark"], "a시월구일3")
        return s

    def cover_style(self, s, dc):
        """표지도 스타일마다 다르게 — 도형은 글 뒤(spTree 앞쪽)에. 흰 글씨로 바꿨으면 True"""
        tn, st = self.th, self.style
        shapes = []

        def add(*a, **k):   # 장표 트리에 바로 그린 뒤 맨 뒤(글 아래)로 옮긴다 — 다른 트리를 거치면 요소 클래스가 바뀐다
            tree_ = s.shapes._spTree
            _shape(tree_, *a, **k)
            shapes.append(tree_[-1])

        dxy = abs_box(dc) if dc is not None else (1.71, 10.11, 3.4, 1.03)
        if st == "band":
            add("표지 위 띠", 0, 0, PAGE_W, 0.95, tn["head"])
        elif st == "tab":
            add("표지 탭", dxy[0] - 0.35, dxy[1] - 0.12, 4.1, dxy[3] + 0.24, tn["head"], "snip1Rect", 28000)
        elif st == "pill":
            add("표지 필", dxy[0] - 0.35, dxy[1] - 0.12, 3.9, dxy[3] + 0.24, tn["head"], "roundRect", 50000)
        elif st == "side":
            add("표지 레일", 0, 0, 1.35, PAGE_H, tn["head"], ang=5400000)
        elif st == "split":
            add("표지 위 색 블록", 0, 0, PAGE_W, 12.4, tn["head"], ang=5400000)
        elif st == "line":
            add("표지 위 굵은 줄", 0, 0, PAGE_W, 0.45, tn["head"])
            add("표지 제목 밑선", dxy[0], dxy[1] + dxy[3] + 0.5, 6.0, 0.06, [tn["mid"]])
        tree = s.shapes._spTree
        for k, e in enumerate(shapes):
            tree.remove(e)
            tree.insert(2 + k, e)
        if st in ("tab", "pill") and dc is not None:
            _recolor_el(dc._element, "FFFFFF")
            for p_ in dc.text_frame.paragraphs:
                p_.alignment = 1
        if st == "split":
            for nm in ("TextBox 24", "TextBox 29", "TextBox 30"):
                for x in named(s.shapes, nm):
                    _recolor_el(x._element, "FFFFFF")
            return True
        return False

    # 간지·목차 레이아웃 글(장 번호·장 이름)
    def chapter_layouts(self):
        for i, c in enumerate(self.o["chapters"]):
            tag = "※" if c["no"] == "※" else (c["no"] if self.style in ("side", "line") else f"CHAPTER {c['no']}")   # 큰 장 번호 스타일은 번호만
            for m in (self.m_div, self.m_toc, self.m_body):
                layout_for(m, i).name = c["title"] if c["no"] == "※" else f"{c['no']} {c['title']}"
            for m in (self.m_div, self.m_toc):
                lay = layout_for(m, i)
                for sh in lay.shapes:
                    if not sh.has_text_frame or not sh.text_frame.text.strip():
                        continue
                    t = sh.text_frame.text.strip()
                    set_text(sh, tag if ("CHAPTER" in t or t in ("※", "*")) else c["title"])
            lay = layout_for(self.m_body, i)
            for sh in list(lay.shapes):
                if not sh.has_text_frame:
                    continue
                if sh.top > Cm(26):   # 쪽 번호(필드 = 전체 장 번호) → 떼어 두고 장표마다 장별 번호 글자로
                    self.pn[i] = copy.deepcopy(sh._element)
                    sh._element.getparent().remove(sh._element)
                elif sh.top < Cm(2):
                    set_text(sh, c["no"] if sh.name == "Rectangle 95" else c["title"])

    def divider(self, i, c):
        s = self.prs.slides.add_slide(layout_for(self.m_div, i))
        for ph in list(s.placeholders):
            ph._element.getparent().remove(ph._element)
        box = copy.deepcopy(self.s_div.shapes[0]._element)
        s.shapes._spTree.append(box)
        b = s.shapes[-1]
        tf = b.text_frame
        p0 = copy.deepcopy(tf.paragraphs[0]._p)
        for pp in list(tf.paragraphs):
            pp._p.getparent().remove(pp._p)
        for k, sec in enumerate(c.get("sections") or [], 1):
            e = copy.deepcopy(p0)
            rs = e.findall("a:r", NS)
            rs[0].find("a:t", NS).text = f"{k}. {sec['title']}"
            for r in rs[1:]:
                e.remove(r)
            tf._txBody.append(e)
        if self.style in ("tab", "side"):   # 왼쪽 정렬 스타일 — 장 이름과 같은 줄에서 시작
            b.left = Cm(2.0 if self.style == "tab" else 5.2)
        if self.style == "split":   # 위쪽 색 블록 위 — 흰 글씨
            for r in b._element.iter(f"{{{A}}}rPr"):
                for c_ in r.findall(f"{{{A}}}solidFill") + r.findall(f"{{{A}}}gradFill"):
                    r.remove(c_)
                r.insert(0, parse_xml(f'<a:solidFill xmlns:a="{A}"><a:srgbClr val="FFFFFF"/></a:solidFill>'))
        if self.bgs.get(f"div{i}"):
            set_bg(s, compose(self.bgs[f"div{i}"], 1.0, 0.45 if self.style == "split" else 0.5, 0.72, 0.8, 0.6))
        return s

    # 본문 — 견본 장표를 복제해 글을 채우고, 블록은 아래로 쌓는다
    def body_page(self, i, c, pg, cont=None):
        s = self.prs.slides.add_slide(layout_for(self.m_body, i))
        for ph in list(s.placeholders):
            ph._element.getparent().remove(ph._element)
        src = self.s_body
        head = [el for el in src.shapes._spTree.iterchildren() if el.tag.split("}")[1] in ("sp", "grpSp", "cxnSp")]
        block_els = []
        for el in head:
            off = el.find(".//a:off", NS)
            y = int(off.get("y")) if off is not None else 0
            (block_els if y >= int(Cm(7.3)) else []).append(el)
            if y < int(Cm(7.3)):
                s.shapes._spTree.append(copy.deepcopy(el))
        # 머리: 경로·제목·요구사항
        rect2 = sorted([x for x in s.shapes if x.name == "Rectangle 2"], key=lambda x: x.top)
        title = str(pg.get("title") or "").strip() + (f" ({cont})" if cont else "")
        if rect2:   # 경로는 AI 글을 믿지 않고 목차에서 만든다(장 이름이 섞여 목차와 어긋났다 — 운영 점검 2026-10-14). 가이드 견본은 fixed_path
            set_text(rect2[0], pg["fixed_path"] if "fixed_path" in pg else (page_path(c, title) or str(pg.get("path") or "")))
        if len(rect2) > 1:
            set_text(rect2[1], title)
            fit_one_line(rect2[1], title, 14.6)
        tag = named(s.shapes, "요구사항 꼬리표", 0)
        ids = [x.strip() for x in re.split(r"[,\s]+", str(pg.get("req") or "")) if x.strip()]
        req = ", ".join(ids[:3]) + (f" 외 {len(ids) - 3}" if len(ids) > 3 else "")   # 길면 경로 줄을 덮는다
        if tag is not None:
            if req:
                rs = tag.text_frame.paragraphs[0].runs
                if len(rs) > 1:
                    rs[1].text = "   " + req
                w = text_cm("요구사항   " + req, 8) + 0.7
                tag.left, tag.width = Cm(18.15 - w), Cm(w)
            else:
                tag._element.getparent().remove(tag._element)
        # 도입 2문장 + 강조
        lead = [x for x in s.shapes if x.name == "Rectangle 95" and x.height > Cm(1.5)]
        if lead:
            put_lead(lead[0], [str(t) for t in (pg.get("lead") or [])][:2], str(pg.get("strong") or ""))
        band = named(s.shapes, "Text Box 166", 0)
        if band is not None:
            set_text(band, str(pg.get("band") or ""))
        # 블록
        y = 7.55
        rest = []
        for bi, blk in enumerate(pg.get("blocks") or []):
            h = block_height(blk)
            if y + h > BODY_BOTTOM and bi:
                rest = (pg.get("blocks") or [])[bi:]
                break
            self.block(s, block_els, blk, y)
            y += h + 0.55
        self.page_number(s, i, c)
        return s, rest

    def block(self, s, els, blk, y):
        dy = Cm(y - 7.55)
        small = str(blk.get("small") or "").strip()
        bullets = [str(b).strip().lstrip("·•-▪ ") for b in (blk.get("bullets") or []) if str(b).strip()]
        for el in els:
            e = copy.deepcopy(el)
            nm = e.find(".//p:cNvPr", NS).get("name")
            off = e.find(".//a:off", NS)
            oy = int(off.get("y"))
            if nm in ("TextBox 19", "육각형 54") and oy < int(Cm(9.0)) and not small:
                continue   # 작은 제목이 없으면 뺀다
            shift = dy - (Cm(0.64) if (not small and oy >= int(Cm(9.0))) else 0)
            off.set("y", str(oy + int(shift)))
            s.shapes._spTree.append(e)
            sh = s.shapes[-1]
            if nm == "Rectangle 95":
                set_text(sh, str(blk.get("head") or ""))
            elif nm == "TextBox 19" and oy < int(Cm(9.0)):
                set_text(sh, small)
            elif sh.shape_type == 6:
                for c in walk(sh.shapes):
                    if c.has_text_frame and c.name == "TextBox 19":
                        set_text(c, str(blk.get("bar") or ""))
            elif nm == "AutoShape 91":
                put_bullets(sh, bullets)
                sh.height = Cm(bullet_lines(bullets) * 0.42 + 0.1)
                tb = blk.get("table")
                if isinstance(tb, dict) and tb.get("cols") and tb.get("rows"):
                    add_table(s, tb, sh.left, sh.top + sh.height + Cm(0.25), sh.width, self.th)

    def page_number(self, s, i, c):
        n = self.pageno[c["no"]] = self.pageno.get(c["no"], 0) + 1
        if self.pn.get(i) is not None:
            s.shapes._spTree.append(copy.deepcopy(self.pn[i]))
            set_text(s.shapes[-1], f"{c['no']} - {n}")
        return n

    # 목차
    def toc(self, i, c, rows_of):
        """rows_of = [(1단계 글, [(2단계 글, 쪽 글자)…])…] — 20줄이 넘으면 다음 장으로"""
        src = self.s_toc
        boxes = [x for x in src.shapes if x.has_text_frame and x.text_frame.text.strip()]
        pg_box, it_box = (boxes[0], boxes[1]) if boxes[0].left > boxes[1].left else (boxes[1], boxes[0])
        P_L1 = copy.deepcopy(it_box.text_frame.paragraphs[0]._p)
        P_L2 = copy.deepcopy(it_box.text_frame.paragraphs[1]._p)
        P_PG = copy.deepcopy(pg_box.text_frame.paragraphs[1]._p)
        line = next(x for x in src.shapes if x.name == "Line 58")._element
        pages, cur, n = [], [], 0
        for g in rows_of:
            need = 1 + len(g[1]) + (1 if cur else 0)
            if cur and n + need > 20:
                pages.append(cur)
                cur, n = [], 0
                need -= 1
            cur.append(g)
            n += need
        if cur:
            pages.append(cur)
        made = []
        for groups in pages:
            s = self.prs.slides.add_slide(layout_for(self.m_toc, i))
            for ph in list(s.placeholders):
                ph._element.getparent().remove(ph._element)
            ib = copy.deepcopy(it_box._element)
            pb = copy.deepcopy(pg_box._element)
            s.shapes._spTree.append(ib)
            s.shapes._spTree.append(pb)
            ibody, pbody = ib.find(".//p:txBody", NS), pb.find(".//p:txBody", NS)
            for x in ibody.findall("a:p", NS) + pbody.findall("a:p", NS):
                x.getparent().remove(x)
            row = 0
            for gi, (l1, l2s) in enumerate(groups):
                if gi:
                    ibody.append(_blank(P_L2))
                    pbody.append(_blank(P_PG))
                    row += 1
                ibody.append(_para(P_L1, [l1[0], l1[1]]))
                pbody.append(_blank(P_PG))
                row += 1
                for t2, pno in l2s:
                    ibody.append(_para(P_L2, ["    ", t2]))
                    pbody.append(_para(P_PG, [pno]) if pno else _blank(P_PG))
                    if pno:
                        x1 = 4.57 + 0.2 + text_cm("    " + t2, 14) + 0.25
                        e = copy.deepcopy(line)
                        e.find(".//a:off", NS).set("x", str(int(Cm(x1))))
                        e.find(".//a:off", NS).set("y", str(int(Cm(5.72 + row * 0.893))))
                        e.find(".//a:ext", NS).set("cx", str(int(Cm(max(0.3, 15.25 - x1)))))
                        e.find(".//a:ext", NS).set("cy", "0")
                        s.shapes._spTree.append(e)
                    row += 1
            made.append(s)
        return made

    def build(self, chapters_pages, out):
        self.project_text()
        self.chapter_layouts()
        if self.bgs.get("toc"):
            pic = next((x for x in walk(self.m_toc.shapes) if x.shape_type == 13 and x.width > Cm(15)), None)
            if pic is not None:
                rid = pic._element.find(".//a:blip", NS).get(f"{{{R}}}embed")
                pic.part.related_part(rid)._blob = compose(self.bgs["toc"], 0.85, 0.42, 0.5, 0.6, 0.6)
        cover = self.cover()
        order = [cover]
        toc_rows, chapter_slides, chapter_kinds = [], [], []
        for i, c in enumerate(self.o["chapters"]):
            sl = [self.divider(i, c)]
            kinds = ["div"]
            rows = []
            pages = chapters_pages.get(i) or []
            if c["no"] == "※":
                rows = [((f"{k}. ", sec["title"]), []) for k, sec in enumerate(c.get("sections") or [], 1)]
            else:
                by_sec = {}
                for pg in pages:
                    rest, cont = None, None
                    s, rest = self.body_page(i, c, pg)
                    sl.append(s)
                    kinds.append(str(pg.get("title") or ""))
                    first = f"{c['no']}-{self.pageno[c['no']]}"
                    k = 2
                    while rest:
                        s, rest2 = self.body_page(i, c, dict(pg, blocks=rest), cont=f"{k}")
                        sl.append(s)
                        kinds.append(f"{pg.get('title') or ''} ({k})")
                        rest, k = rest2, k + 1
                    item = re.sub(r"\s*\(\d+/\d+\)\s*$", "", str(pg.get("title") or "").strip())
                    m = re.match(r"(\d+)\.\d+", item)
                    k_ = int(m.group(1)) if m else 0
                    by_sec.setdefault(k_, [])
                    if item not in [x[0] for x in by_sec[k_]]:
                        by_sec[k_].append((item, first))
                for k, sec in enumerate(c.get("sections") or [], 1):
                    rows.append(((f"{k}. ", sec["title"]), by_sec.get(k, [])))
            toc_rows.append((i, c, rows))
            chapter_slides.append(sl)
            chapter_kinds.append(kinds)
        tocs = []
        for i, c, rows in toc_rows:
            tocs += self.toc(i, c, rows)
        order += tocs + [x for sl in chapter_slides for x in sl]
        # 결과 화면 캔버스용 — 쪽마다 종류·장(章)·제목(장 줄 = 표지·목차 한 줄 + 장마다 간지·본문 한 줄)
        self.pages = [{"n": 1, "kind": "cover", "ch": "표지 · 목차", "title": "표지"}]
        self.pages += [{"n": 2 + k, "kind": "toc", "ch": "표지 · 목차", "title": f"목차 {k + 1}"} for k in range(len(tocs))]
        for i, kinds in enumerate(chapter_kinds):
            c = self.o["chapters"][i]
            for t in kinds:
                self.pages.append({"n": len(self.pages) + 1, "kind": "div" if t == "div" else "body", "ch": f"{c['no']} {c['title']}",
                                   "title": f"간지 · {c['title']}" if t == "div" else t})
        for k, s in enumerate(order):
            move_slide(self.prs, s, k)
        for s in (self.s_body, self.s_cover, self.s_toc, self.s_div):
            drop_slide(self.prs, s)
        refont(self.prs)
        self.prs.save(out)
        return len(order)


def _para(tmpl, parts):
    e = copy.deepcopy(tmpl)
    rs = e.findall("a:r", NS)
    for r in rs[len(parts):]:
        e.remove(r)
    rs = e.findall("a:r", NS)
    while len(rs) < len(parts):
        n = copy.deepcopy(rs[-1])
        rs[-1].addnext(n)
        rs = e.findall("a:r", NS)
    for r, t in zip(rs, parts):
        r.find("a:t", NS).text = t
    return e


def _blank(tmpl):
    e = copy.deepcopy(tmpl)
    for r in e.findall("a:r", NS):
        e.remove(r)
    return e


def page_path(c, title):
    """'1.2 …' 제목 → '1. 절 이름 > 1.2 …' (목차 절 이름 그대로)"""
    m = re.match(r"(\d+)\.\d+", title)
    secs = c.get("sections") or []
    if not m or not (0 < int(m.group(1)) <= len(secs)):
        return ""
    k = int(m.group(1))
    item = re.sub(r"\s*\(\d+(/\d+)?\)\s*$", "", title)   # f-string 안 역슬래시는 3.12 미만에서 문법 오류 — 밖에서
    return f"{k}. {secs[k - 1]['title']} > {item}"


def fit_one_line(sh, text, width_cm, start=18, low=12):
    """제목이 한 줄에 들어가게 글자 크기를 줄인다(G마켓 산스 굵게 — 글꼴이 없으면 글자 종류로 어림)"""
    pt = start
    while pt > low and text_cm(text, pt, TITLE0[1]) * 1.04 > width_cm:
        pt -= 1
    for r in sh.text_frame.paragraphs[0].runs:
        r.font.size = Pt(pt)


def split_title(name):
    """표지 제목 두 줄 — 1줄(32pt) 14자·2줄(42pt) 11자 안. 넘치면 작은 글자로."""
    w = name.split()
    best = None
    for k in range(1, len(w)):
        a, b = " ".join(w[:k]), " ".join(w[k:])
        over = max(0, len(a) - 14) + max(0, len(b) - 11)
        if best is None or over < best[0] or (over == best[0] and abs(len(a) - len(b)) < abs(len(best[1]) - len(best[2]))):
            best = (over, a, b)
    if not best:
        return name, "", len(name) > 11
    return best[1], best[2], best[0] > 0


def put_lead(sh, sentences, strong):
    pe = sh.text_frame.paragraphs[0]._p
    rs = pe.findall("a:r", NS)
    norm = copy.deepcopy(rs[0]) if rs else None
    bold = next((copy.deepcopy(r) for r in rs if (r.find("a:rPr", NS) is not None and r.find("a:rPr", NS).get("b") == "1")), None)
    for el in pe.findall("a:r", NS) + pe.findall("a:br", NS):
        pe.remove(el)
    for p_ in sh.text_frame.paragraphs[1:]:
        p_._p.getparent().remove(p_._p)
    if norm is None:
        return
    end = pe.find("a:endParaRPr", NS)

    def add(e):
        (end.addprevious(e) if end is not None else pe.append(e))

    for k, sent in enumerate(sentences):
        if k:
            br = etree.Element(f"{{{A}}}br")
            rp = norm.find("a:rPr", NS)
            if rp is not None:
                br.append(copy.deepcopy(rp))
            add(br)
        parts = [(sent, False)]
        if k == 0 and strong and strong in sent:
            a, b = sent.split(strong, 1)
            parts = [(a, False), (strong, True), (b, False)]
        for t, is_b in parts:
            if not t:
                continue
            e = copy.deepcopy(bold if (is_b and bold is not None) else norm)
            e.find("a:t", NS).text = t
            if is_b and bold is None:
                e.find("a:rPr", NS).set("b", "1")
            add(e)


def put_bullets(sh, items):
    body = sh.text_frame._txBody
    ps = body.findall("a:p", NS)
    tmpl = copy.deepcopy(ps[0])
    for x in ps:
        body.remove(x)
    for it in items or [""]:
        e = copy.deepcopy(tmpl)
        rs = e.findall("a:r", NS)
        if rs:
            rs[0].find("a:t", NS).text = it
            for r in rs[1:]:
                e.remove(r)
        body.append(e)


def bullet_lines(items):
    return sum(max(1, math.ceil(text_cm(t, 9) / 14.6)) for t in items) or 1


def block_height(blk):
    h = 0.9 + (0.64 if str(blk.get("small") or "").strip() else 0) + 0.96
    bl = [str(b) for b in (blk.get("bullets") or []) if str(b).strip()]
    h += bullet_lines(bl) * 0.42 + 0.1
    tb = blk.get("table")
    if isinstance(tb, dict) and tb.get("rows"):
        h += 0.25 + table_height(tb, 14.9)
    return h


def col_widths(cols, rows, total):
    """열 너비 — 열마다 가장 긴 글 폭에 비례(최소 1.6cm)"""
    cols = [str(c) for c in cols][:4]
    need = [max([text_cm(str(c), 8.5)] + [text_cm(str(r[i]) if i < len(r) else "", 8.5) for r in rows]) + 0.4 for i, c in enumerate(cols)]
    need = [max(1.6, x) for x in need]
    k = total / sum(need)
    return [x * k for x in need]


def table_height(tb, total):
    cols = [str(c) for c in tb["cols"]][:4]
    rows = [[str(v) for v in r][:len(cols)] for r in tb["rows"][:8]]
    ws = col_widths(cols, rows, total)
    h = 0.62
    for r in rows:
        lines = max([1] + [math.ceil(text_cm(v, 8.5) / max(0.5, ws[i] - 0.3)) for i, v in enumerate(r)])
        h += 0.62 if lines == 1 else 0.62 + (lines - 1) * 0.36
    return h


def add_table(s, tb, x, y, w, th=None):
    th = th or THEMES["navy"]
    cols = [str(c) for c in tb["cols"]][:4]
    rows = [[str(v) for v in r][:len(cols)] + [""] * (len(cols) - len(r)) for r in tb["rows"][:8]]
    g = s.shapes.add_table(len(rows) + 1, len(cols), x, y, w, Cm(0.62 * (len(rows) + 1)))
    t = g.table
    tblPr = g._element.find(".//a:tblPr", NS)
    for k in list(tblPr.attrib):
        del tblPr.attrib[k]
    st = tblPr.find("a:tableStyleId", NS)
    if st is not None:
        tblPr.remove(st)
    widths = col_widths(cols, rows, w / 360000)
    short = [all(len(r[ci]) <= 6 for r in rows) for ci in range(len(cols))]   # 6자 이하 열은 가운데   # 글 길이에 맞춘 열 너비(cm) — 고르게 나누면 긴 칸이 줄바꿈돼 표가 길어진다
    for ci in range(len(cols)):
        t.columns[ci].width = Cm(widths[ci])
    for ri in range(len(rows) + 1):
        t.rows[ri].height = Cm(0.62)
        for ci in range(len(cols)):
            cell = t.cell(ri, ci)
            cell.text = cols[ci] if ri == 0 else rows[ri - 1][ci]
            cell.margin_left = cell.margin_right = Cm(0.15)
            cell.margin_top = cell.margin_bottom = Cm(0.05)
            cell.vertical_anchor = 3
            fill = cell.fill
            fill.solid()
            fill.fore_color.rgb = __import__("pptx").dml.color.RGBColor.from_string(th["dark"] if ri == 0 else ("FFFFFF" if ri % 2 else "F5F7FB"))
            for p_ in cell.text_frame.paragraphs:
                p_.alignment = 2 if (ri == 0 or short[ci]) else 1   # 정렬은 열 단위(사용자 표 규칙 — 칸마다 섞지 않는다)
                for r in p_.runs:
                    r.font.size = Pt(8.5)
                    r.font.color.rgb = __import__("pptx").dml.color.RGBColor.from_string("FFFFFF" if ri == 0 else "4D4D4D")
                    rp = r._r.get_or_add_rPr()
                    for tag in ("latin", "ea"):
                        e = rp.find(f"a:{tag}", NS)
                        if e is None:
                            e = etree.SubElement(rp, f"{{{A}}}{tag}")
                        e.set("typeface", "a시월구일3" if ri == 0 else "a시월구일2")


def client_logo(o):
    c = o["project"]["client"]
    if not c:
        return None
    try:
        d = _api("GET", "/assets/items?" + urllib.parse.urlencode({"category": "logo", "q": c, "limit": 5}))
        rows = d.get("data") or []
        hit = next((r for r in rows if c.replace(" ", "") in str(r.get("name") or "").replace(" ", "")), None)
        if hit:
            return _api("GET", f"/assets/items/{hit['id']}/file/original", raw=True)
    except Exception:
        pass
    return None


# ───────────────────────── 실행
def run(job, j, opts, brief, note):
    req, put_file = design.W["req"], design.W["put_file"]
    pages = int(opts.get("slides") or 0) or DEFAULT_PAGES
    job.push("기획", 4)
    job.event("세로 제안서(A4) — 자료를 읽고 RFP 권고 목차대로 장·절을 정합니다.")
    ctx, raw = _ctx(job, j, brief)
    o = outline(job, brief, note, ctx, raw, pages)
    p = o["project"]
    job.event(f"목차 완료 — {p['name']} / {len(o['chapters'])}장. 비용 ${job.spent:.3f}", "done")
    job.push("기획", 12)
    body = [(i, c) for i, c in enumerate(o["chapters"]) if c["no"] != "※"]
    chapters_pages = {}
    with ThreadPoolExecutor(max_workers=design.par(job, 2, 4)) as ex:
        futs = {ex.submit(chapter_pages, job, o, c, ctx, raw): i for i, c in body}
        for f in futs:
            i = futs[f]
            try:
                chapters_pages[i] = f.result()
                job.event(f"{o['chapters'][i]['no']} {o['chapters'][i]['title']} — 본문 {len(chapters_pages[i])}쪽", "done")
            except Exception as e:
                chapters_pages[i] = []
                job.event(f"{o['chapters'][i]['title']} 본문 실패 — 간지만 넣습니다: {str(e)[:120]}", "warn")
    try:
        d = os.path.join(job.dir, "_mockup")
        os.makedirs(d, exist_ok=True)
        pj = os.path.join(d, "vertical.json")
        json.dump({"outline": o, "pages": chapters_pages}, open(pj, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        put_file(job.id, "extra", pj, "세로제안서_기획.json")
    except Exception:
        pass
    job.push("시안 생성", 40)
    job.event("표지·목차·간지 배경 — powerAssets 에서 먼저 찾고, 없으면 나노바나나로 만듭니다.")
    bgs, bglog = backgrounds(job, o)
    job.event("배경: " + " · ".join(bglog), "done")
    logo = client_logo(o)
    job.push("시안 생성", 70)
    out = os.path.join(job.dir, "결과.pptx")
    style = str(opts.get("vstyle") or "band")
    tone = str(opts.get("vtone") or opts.get("vtheme") or "navy")
    use_fonts(opts.get("font_title"), opts.get("font_body"))
    bd = Build(o, bgs, logo, style, tone)
    n = bd.build(chapters_pages, out)
    job.event(f"서체: 제목 {FONT['title'][0]}(표지·목차·간지·쪽 제목) · 본문 {FONT['body'][0]}")
    job.event(f"디자인: {(STYLES.get(style) or STYLES['band'])['label']} · 톤 {(TONES.get(tone) or TONES['navy'])['label']}")
    job.event(f"세로 제안서 {n}장(표지·목차·간지·본문)을 만들었습니다.", "done")
    try:   # 작성 가이드 — 사용법·서식 규칙표·1~4 depth 견본(같은 스타일·톤)
        gp = os.path.join(job.dir, "세로제안서_작성가이드.pptx")
        build_guide(o["project"], style, tone, logo, gp)
        put_file(job.id, "extra", gp)
        job.event("작성 가이드(사용법·서식 규칙표·1~4 depth 견본)를 함께 넣었습니다.", "done")
    except Exception as e:
        job.event(f"작성 가이드를 만들지 못했습니다(결과 장표는 정상): {str(e)[:120]}", "warn")
    job.push("시안 정리", 96)
    try:
        design.W.get("upload_after", lambda *a, **k: None)(job, out)
    except Exception as e:
        job.event(f"장별 미리 보기 렌더 실패(결과 파일은 정상): {str(e)[:120]}", "warn")
    put_file(job.id, "result", out)
    try:
        design.W.get("text_map", lambda *a, **k: None)(job, out)
    except Exception:
        pass
    n_body = sum(len(v) for v in chapters_pages.values())
    req("POST", f"/worker/jobs/{job.id}/finish", {"status": "done", "result_name": "결과.pptx", "engine": "vertical", "report": {
        "summary": f"{p['name']} — A4 세로 제안서 {n}장(본문 {n_body}쪽, {len(o['chapters'])}장 구성)",
        "stats": [{"label": "전체 장", "value": n}, {"label": "본문 쪽", "value": n_body}, {"label": "장 구성", "value": len(o["chapters"])}],
        "pages": getattr(bd, "pages", []), "fonts": {"title": FONT["title"][0], "body": FONT["body"][0]},
        "checklist": [{"slide": 0, "title": "제안사 정보 확인", "level": "info",
                       "detail": "회사 현황·실적·인력·지분처럼 자료에 없는 제안사 정보는 「[제안사 작성]」 자리로 두었습니다."}],
        "changes": bglog}})


# ───────────────────────── 작성 가이드(결과에 함께 넣는다) — 컨소시엄 업체가 같은 규칙으로 쓰게(사용자 2026-10-14)
def guide_pages(th):
    b = lambda head, bar, bullets, small="", table=None: dict(head=head, small=small, bar=bar, bullets=bullets, **({"table": table} if table else {}))
    spec1 = {"cols": ["요소", "글꼴", "크기", "색 · 속성"], "rows": [
        ["머리 띠 장 이름", "a시월구일3", "12pt", "흰색(띠 위) · 띠 높이 가운데"],
        ["장 번호 배지", "a시월구일3", "12pt", "배지 색 위 · 가운데"],
        ["사업명(머리)", "a시월구일2", "8pt", "오른쪽 정렬"],
        ["경로 줄", "a시월구일2", "10pt", f"#{th['mid']}"],
        ["쪽 제목", "G마켓 산스 TTF Bold", "18pt", f"#{th['mid']} · 한 줄(길면 12pt까지 줄임)"],
        ["요구사항 꼬리표", "a시월구일3 / a시월구일2", "8pt", "번호 3개 + 외 N"],
        ["쪽 번호", "a시월구일1", "9pt", "장별 'Ⅱ - 3' · 아래 가운데"]]}
    spec2 = {"cols": ["요소", "글꼴", "크기", "색 · 속성"], "rows": [
        ["도입 문단", "a시월구일2 / 강조 a시월구일3", "11pt", "#686868 · 줄간격 1.25 · 2문장"],
        ["띠 문구", "a시월구일4", "13pt", "흰색 · 한 줄"],
        ["소제목", "a시월구일3", "12pt", f"#{th['dark']}"],
        ["작은 제목", "a시월구일3", "10.5pt", f"#{th['dark']}"],
        ["막대 제목", "a시월구일3", "11pt", f"#{th['dark']} · 바탕 #D9D9D9 50%"],
        ["본문 글", "a시월구일2", "9pt", "#4D4D4D · 줄간격 1.0 · 앞 점 없음"],
        ["표 머리 / 표 본문", "a시월구일3 / a시월구일2", "8.5pt", f"#{th['dark']} 바탕 흰 글씨 / #4D4D4D"]]}
    for sp in (spec1, spec2):   # 글꼴 칸 = 고른 서체 이름(사용자 2026-10-14 "고르면 작성가이드에 폰트도 같이 변경")
        for r in sp["rows"]:
            r[1] = re.sub(r"a시월구일[1-4]|G마켓 산스 TTF Bold", lambda m: fface(m.group(0)), r[1])
            fam = FONT["body"][0] + " "
            if r[1].count(fam) > 1:   # 'KoPub돋움체 Bold / KoPub돋움체 Medium' → 'KoPub돋움체 Bold / Medium' (칸이 넘쳐 옆 칸이 줄바꿈되지 않게)
                head, _, tail = r[1].partition(" / ")
                r[1] = head + " / " + tail.replace(fam, "")
    bf = FONT["body"]
    lv = "·".join(dict.fromkeys(f.replace(bf[0], "").strip() for f in bf[1]))   # 굵기 이름만(1·2·3·4 / Light·Medium·Bold)
    return [
        {"title": "1.1 구성과 쪽 추가", "fixed_path": "1. 작성 가이드", "req": "",
         "lead": ["이 제안서는 표지·목차·간지·본문 네 가지 양식으로 짜여 있습니다.", "장마다 전용 레이아웃이 있어 머리 띠와 쪽 번호가 맞습니다."],
         "strong": "네 가지 양식", "band": "같은 장 안에서는 쪽을 복제해 이어 씁니다",
         "blocks": [b("구성", "양식 네 가지", ["표지 1쪽 → 목차(장마다) → 간지(장마다) → 본문 순서로 엮음",
                                         "목차·간지·본문은 장마다 전용 레이아웃(Ⅰ 일반현황, Ⅱ 전략 및 방법론 …)을 씀",
                                         "다른 장으로 옮긴 쪽은 [홈 > 레이아웃]에서 그 장 레이아웃으로 바꿈"]),
                    b("쪽 추가·삭제", "복제해서 이어 쓰기", ["같은 장 본문 쪽을 골라 Ctrl+D 로 복제한 뒤 글만 바꿈",
                                                      "블록(소제목·막대 제목·본문)은 묶음째 복사해 아래로 이어 붙임",
                                                      "쪽 번호(Ⅱ - 3)는 글자 상자라 쪽을 넣거나 빼면 직접 고침",
                                                      "목차 쪽 번호도 함께 고침 — 평가위원이 참조표로 찾아감"])]},
        {"title": "1.2 글쓰기 규칙", "fixed_path": "1. 작성 가이드", "req": "",
         "lead": ["모든 문장은 마침표에서 줄을 바꾸고 한 줄에 들어가게 씁니다.", "모호한 표현 대신 수치로 적어 바로 확인하게 합니다."],
         "strong": "마침표에서 줄을 바꾸고", "band": "한 문장 한 줄, 수치로 말하기",
         "blocks": [b("문장", "줄바꿈과 길이", ["도입 문단은 2문장, 한 문장 45자 이내(한 줄)",
                                           "본문 글은 개조식(~함, ~임), 한 줄 70자 이내, 앞에 점(·)을 붙이지 않음",
                                           "'할 수 있다·고려하고 있다' 같은 모호한 말은 쓰지 않음"]),
                    b("글꼴", "설치해야 할 글꼴", [f"제목: {FONT['title'][1]} — 표지·목차·간지·쪽 제목의 큰 글자에만",
                                             f"본문: {bf[0]} {lv} — 굵기 4단계(옅음·본문·강조·굵음)",
                                             "글꼴이 없는 PC 에서는 다른 글꼴로 바뀌어 줄바꿈이 달라짐 — 작성 전 설치",
                                             "컨소시엄 업체는 같은 양식 파일로 작성해 합칠 때 어긋나지 않게 함"]),
                    b("색", "톤 색상", [f"진한 색 #{th['dark']} — 머리 띠·소제목·막대 제목",
                                       f"중간 색 #{th['mid']} — 쪽 제목·경로·강조", f"연한 색 #{th['light']} — 연한 면·선"])]},
        {"title": "1.3 서식 규칙표", "fixed_path": "1. 작성 가이드", "req": "",
         "lead": ["요소마다 글꼴·크기·색이 정해져 있습니다.", "새 쪽을 만들 때도 이 표의 값 그대로 씁니다."],
         "strong": "글꼴·크기·색", "band": "요소별 서식 — 이 값 그대로",
         "blocks": [b("머리·제목 영역", "머리 띠부터 쪽 번호까지", ["쪽 위쪽과 아래쪽에 늘 같은 자리로 놓이는 요소"], table=spec1),
                    b("본문 영역", "도입 문단부터 표까지", ["블록 하나 = 소제목 + (작은 제목) + 막대 제목 + 본문 글 + (표)"], table=spec2)]},
        {"title": "1 사업이해도", "fixed_path": "", "req": "SFR-001",
         "lead": ["1 depth 는 장 안의 큰 절을 여는 쪽입니다.", "경로 줄 없이 절 번호와 이름만 씁니다."],
         "strong": "큰 절을 여는 쪽", "band": "1 depth — 절의 방향을 먼저 보여 주는 쪽",
         "blocks": [b("쓰는 곳", "1 depth 예시", ["절의 첫 쪽에 써서 절 전체의 방향을 먼저 보여 줌", "제목 형식: 숫자 + 공백 + 절 이름(예: 1 사업이해도)"])]},
        {"title": "1.1 사업 배경 및 목적", "fixed_path": "1. 사업이해도", "req": "SFR-001, SFR-002",
         "lead": ["2 depth 는 절 아래 항목 하나를 설명하는 기본 쪽입니다.", "경로 줄에는 위 절 하나만 적습니다."],
         "strong": "기본 쪽", "band": "2 depth — 가장 많이 쓰는 본문 쪽",
         "blocks": [b("쓰는 곳", "2 depth 예시", ["항목마다 1~3쪽, 2쪽 이상이면 제목 끝에 (1/2)처럼 붙임", "경로: 1. 사업이해도 / 제목: 1.1 사업 배경 및 목적"], small="현행 시스템의 한계")]},
        {"title": "1.1.1 추진 배경", "fixed_path": "1. 사업이해도 > 1.1 사업 배경", "req": "SFR-001",
         "lead": ["3 depth 는 항목을 더 잘게 나눌 때 씁니다.", "경로 줄에 절과 항목을 이어 적습니다."],
         "strong": "더 잘게 나눌 때", "band": "3 depth — 항목 안의 세부 주제",
         "blocks": [b("쓰는 곳", "3 depth 예시", ["한 항목이 3쪽을 넘으면 세부 주제로 나눠 3 depth 로 씀", "경로: 1. 사업이해도 > 1.1 사업 배경 / 제목: 1.1.1 추진 배경"])]},
        {"title": "1.1.1.1 현행 시스템 현황", "fixed_path": "1. 사업이해도 > 1.1 사업 배경 > 1.1.1 추진 배경", "req": "SFR-001",
         "lead": ["4 depth 는 세부 주제 안에서 한 가지를 짚을 때만 씁니다.", "너무 깊어지면 읽기 어려우니 꼭 필요할 때만 씁니다."],
         "strong": "한 가지를 짚을 때", "band": "4 depth — 가장 깊은 단계(꼭 필요할 때만)",
         "blocks": [b("쓰는 곳", "4 depth 예시", ["경로 줄에 세 단계를 모두 적어 위치를 알려 줌", "4 depth 아래로는 더 나누지 않고 블록으로 정리함"])]},
    ]


def build_guide(project, style, tone, logo, out):
    o = {"project": dict(project), "chapters": [{"no": "Ⅰ", "title": "작성 가이드", "sections": []}]}
    b = Build(o, {}, logo, style, tone)
    b.project_text()
    b.chapter_layouts()
    c = o["chapters"][0]
    slides = []
    for pg in guide_pages(b.th):
        s, rest = b.body_page(0, c, pg)
        slides.append(s)
        k = 2
        while rest:
            s, rest = b.body_page(0, c, dict(pg, blocks=rest), cont=str(k))
            slides.append(s)
            k += 1
    for k, s in enumerate(slides):
        move_slide(b.prs, s, k)
    for s in (b.s_body, b.s_cover, b.s_toc, b.s_div):
        drop_slide(b.prs, s)
    refont(b.prs)
    b.prs.save(out)
    return len(slides)
