# -*- coding: utf-8 -*-
"""카드 바탕색·그림자를 시안대로 — 결정적 마감(AI 없이). 2026-10-28 팀장 지적
"시안과 다르게 결과 장표에서 카드에 그림자가 생기고 카드 바탕색이 회청색으로 바뀌어 촌스럽다".

원인(6개 장표 실측):
 ① 그림자 — python-pptx 기본 도형은 <p:style><a:effectRef idx="2"> 로 테마의 효과 스타일(검정 35% 그림자)을 물려받는다.
    도형에 빈 <a:effectLst/>(shadow.inherit = False)를 넣어도 LibreOffice(서버 렌더·미리보기)는 테마 그림자를 그대로 그린다.
    연결선(cxnSp)은 effectRef idx="1" 에 빈 effectLst 조차 없어 PowerPoint 에서도 그림자가 붙는다.
    → 테마 효과 스타일을 비우고(effectStyle 3개 모두 빈 effectLst) 모든 effectRef 를 idx="0" 으로. 진한 직접 그림자(불투명도 20% 초과)는 지운다.
 ② 바탕색 — finalize 의 '파랑 4단계'(snap_blues)가 밝기 0.85 이상 파랑을 전부 한 단계로 보고 덱에서 가장 많이 쓴 값 하나로 모았다.
    카드 테두리(#C9D6EA·#D6E2F3 …)가 카드마다 쓰여 가장 많으니, 시안에서 거의 흰색이던 카드 바탕(#F4F8FF 등)까지 테두리색으로 칠해졌다.
    → 같은 단계 안에서도 아주 가까운 색(채널 차 10 이하)끼리만 모은다.
    → 시안을 받으면 카드류 도형의 채움색을 시안 같은 자리의 색과 견줘 크게 다르면 시안 색으로 되돌린다(match_fills).

함수: kill_theme_shadows · drop_heavy_shadows · snap_blues · match_fills · fix_tables(표 칸 순서) · strip_memos(※ 메모 줄)
명령: python flatfx.py <in.pptx> [<out.pptx>] [--mockup <시안 폴더>]
  --mockup 이 있으면 본문 장(표지·목차·간지 제외)을 순서대로 시안 sNN_body.png(본문만) 또는 sNN.png/jpg(머리 띠·바닥 포함)와 대조한다.
  이미 만든 장표 보정에도 쓴다 — 예: python flatfx.py 결과.pptx 결과_보정.pptx --mockup <작업>/before
"""
import collections, glob, os, re, sys

from lxml import etree

A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
IN = 914400
SLIDE_W = 10.83          # 가로 장표 폭(in) — 실제 값은 prs.slide_width 로 다시 읽는다
BODY_T, BODY_B = 0.70, 7.05   # 시안 본문이 대응하는 장표 높이(prompt_design_part.md '본문 자리와 가이드')
MOCK_T, MOCK_B = 0.094, 0.06  # 머리 띠·바닥이 붙은 시안(sNN.jpg)에서 본문 위·아래 비율(같은 문서)
SHADOW_MAX_ALPHA = 20000      # 불투명도 20% 까지만 남긴다(build_checklist 9-3 '투명도 80% 이상' 과 같은 값)


# ── ① 그림자 ─────────────────────────────────────────────────────────

def _empty_effect_styles(root):
    """테마 XML 의 effectStyleLst 를 '효과 없음' 세 칸으로. 바꿨으면 True"""
    lst = root.find(f"{A}themeElements/{A}fmtScheme/{A}effectStyleLst")
    if lst is None:
        return False
    if all(len(es) == 1 and es[0].tag == A + "effectLst" and len(es[0]) == 0 for es in lst):
        return False
    for es in list(lst):
        lst.remove(es)
    for _ in range(3):   # 스키마상 effectStyle 은 3개 이상이어야 한다
        es = etree.SubElement(lst, A + "effectStyle")
        etree.SubElement(es, A + "effectLst")
    return True


def kill_theme_shadows(prs):
    """테마 그림자를 끊는다 — 테마 효과 스타일을 비우고, 장·레이아웃·마스터의 effectRef 를 idx 0 으로.
    반환: (고친 테마 수, 고친 effectRef 수)"""
    nth = nref = 0
    for part in prs.part.package.iter_parts():
        name = str(part.partname)
        if "/theme/" in name and name.endswith(".xml"):
            el = getattr(part, "_element", None)
            if el is not None:
                nth += _empty_effect_styles(el)
            else:
                root = etree.fromstring(part.blob)
                if _empty_effect_styles(root):
                    part._blob = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
                    nth += 1
            continue
        el = getattr(part, "_element", None)
        if el is None or not re.search(r"/(slides|slideLayouts|slideMasters)/", name):
            continue
        for ref in el.iter(A + "effectRef"):
            if ref.get("idx") not in (None, "0"):
                ref.set("idx", "0")
                nref += 1
    return nth, nref


def _alpha(shadow):
    a = shadow.find(f".//{A}alpha")
    try:
        return int(a.get("val")) if a is not None else 100000
    except (TypeError, ValueError):
        return 100000


def set_lang(prs, lang="ko-KR"):
    """한글이 든 글 런에 언어 표시(lang=ko-KR) — 표시가 없으면 PowerPoint 가 영어 규칙으로 아무 글자에서나 끊어
    '실\\n효성', '현\\n황' 처럼 단어가 잘리고 칩 글이 두 줄로 꺾였다(11-03 사용자, R199). 반환: 고친 런 수"""
    import re as _re
    hangul = _re.compile(r"[가-힣]")
    n = 0
    parts = list(prs.slides) + list(prs.slide_layouts) + list(prs.slide_masters)
    for part in parts:
        for p in part._element.iter(A + "p"):
            if not hangul.search("".join(t.text or "" for t in p.iter(A + "t"))):
                continue
            for r in list(p.iter(A + "r")) + list(p.iter(A + "fld")) + list(p.iter(A + "endParaRPr")):
                rpr = r if r.tag == A + "endParaRPr" else r.find(A + "rPr")
                if rpr is None:
                    rpr = r.makeelement(A + "rPr", {})
                    r.insert(0, rpr)
                if rpr.get("lang") != lang:
                    rpr.set("lang", lang)
                    rpr.set("altLang", "en-US")
                    n += 1
    return n


QUOTES = "‘’"


def fix_quotes(prs, face="Arial"):
    """’24.8 처럼 쓴 홑따옴표(‘’)를 그 글자만 라틴 서체로 — 한글 서체(a시월구일 등)는 이 글자를 전각 폭으로 그려
    PowerPoint 에서 '’ 24.8' 처럼 뒤가 벌어져 보였다(11-03 전체 시험, R196). 글자는 바꾸지 않고 런을 나눠 서체만. 반환: 고친 글자 수"""
    import copy as _copy
    n = 0
    for sl in prs.slides:
        for r in list(sl._element.iter(A + "r")):
            t = r.find(A + "t")
            if t is None or not t.text or not any(q in t.text for q in QUOTES):
                continue
            parts, cur = [], ""
            for ch in t.text:
                if ch in QUOTES:
                    if cur:
                        parts.append((cur, False))
                    parts.append((ch, True))
                    cur = ""
                else:
                    cur += ch
            if cur:
                parts.append((cur, False))
            parent, idx = r.getparent(), r.getparent().index(r)
            for k, (txt, q) in enumerate(parts):
                nr = _copy.deepcopy(r)
                nr.find(A + "t").text = txt
                if q:
                    rpr = nr.find(A + "rPr")
                    if rpr is None:
                        rpr = nr.makeelement(A + "rPr", {})
                        nr.insert(0, rpr)
                    for tag in ("latin", "ea", "cs"):
                        el = rpr.find(A + tag)
                        if el is None:
                            el = rpr.makeelement(A + tag, {})
                            rpr.append(el)
                        el.set("typeface", face)
                    n += 1
                parent.insert(idx + k, nr)
            parent.remove(r)
    return n


def drop_heavy_shadows(prs, max_alpha=SHADOW_MAX_ALPHA):
    """도형·글자에 직접 넣은 그림자 중 진한 것(불투명도 max_alpha 초과)을 지운다. 연한 그림자는 시안 표현으로 보고 둔다. 반환: 지운 수"""
    n = 0
    parts = list(prs.slides) + list(prs.slide_layouts) + list(prs.slide_masters)
    for part in parts:
        for tag in ("outerShdw", "prstShdw"):
            for sh in list(part._element.iter(A + tag)):
                if _alpha(sh) > max_alpha:
                    sh.getparent().remove(sh)
                    n += 1
    return n


# ── ② 파랑 단계 모으기 ────────────────────────────────────────────────

def hsl(h):
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    mx, mn = max(r, g, b), min(r, g, b)
    l = (mx + mn) / 2
    if mx == mn:
        return 0.0, 0.0, l
    d = mx - mn
    s = d / (2 - mx - mn) if l > 0.5 else d / (mx + mn)
    hue = ((g - b) / d % 6) if mx == r else ((b - r) / d + 2) if mx == g else ((r - g) / d + 4)
    return hue * 60, s, l


def blue_step(h):
    """파랑이면 단계(0 진한 남색 · 1 주 파랑 · 2 중간 · 3 옅은 바탕), 아니면 None"""
    hue, sat, l = hsl(h)
    if not (200 <= hue <= 245 and sat >= 0.25):
        return None
    return 0 if l < 0.30 else 1 if l < 0.55 else 2 if l < 0.85 else 3


def _diff(a, b):
    return max(abs(int(a[i:i + 2], 16) - int(b[i:i + 2], 16)) for i in (0, 2, 4))


def snap_blues(prs, accent="#FF2A6D", tol=10):
    """파랑을 단계마다 정리(장표규칙 9-1) — 같은 단계 안에서 **아주 가까운 색(채널 차 tol 이하)** 만 많이 쓴 쪽으로 모은다.
    예전에는 단계 안의 모든 색을 하나로 모아, 테두리색(#C9D6EA)이 거의 흰 카드 바탕(#F4F8FF)까지 덮어썼다(회청색 카드).
    강조색·그림은 건드리지 않는다. 반환: 바꾼 수"""
    acc = (accent or "").lstrip("#").upper()
    els, cnt = [], {}
    for slide in prs.slides:
        for el in slide._element.iter(A + "srgbClr"):
            v = (el.get("val") or "").upper()
            if len(v) != 6 or v == acc:
                continue
            st = blue_step(v)
            if st is None:
                continue
            els.append((el, st, v))
            cnt.setdefault(st, collections.Counter())[v] += 1
    rep = {}
    for st, c in cnt.items():
        heads = []
        for v, _ in c.most_common():   # 많이 쓴 색부터 대표 — 가까운 대표가 있으면 거기로
            h = next((x for x in heads if _diff(x, v) <= tol), None)
            if h is None:
                heads.append(v)
                h = v
            rep[(st, v)] = h
    n = 0
    for el, st, v in els:
        if rep[(st, v)] != v:
            el.set("val", rep[(st, v)])
            n += 1
    return n


# ── ③ 카드 채움색을 시안 같은 자리 색으로 ─────────────────────────────

def _is_front(slide):
    return any((s.name or "").startswith("pd_front") for s in slide.shapes)


FAILS = []   # 이번 실행에서 건너뛴 쪽·단계 [(쪽, 단계, 오류)…] — run 이 확인 목록(WARN 줄)으로 내보낸다(R164)


def _stype(sh):
    """shape_type — 기하도 글 상자 표시도 없는 도형에서 python-pptx 가 예외를 낸다. 모르면 None"""
    try:
        return sh.shape_type
    except Exception:
        return None


def _placed(shapes):
    """자리를 아는 도형만 — 레이아웃에 짝이 없는 자리표시자는 좌표가 None 이다"""
    return [x for x in shapes if None not in (x.left, x.top, x.width, x.height)]


def _each_slide(prs, fn, label):
    """본문 쪽마다 fn(no, slide). 한 쪽에서 예외가 나도 그 쪽만 건너뛰고 기록한다(앞장은 손대지 않는다)"""
    for no, s in enumerate(prs.slides, 1):
        if _is_front(s):
            continue
        try:
            fn(no, s)
        except Exception as e:
            FAILS.append((no, label, f"{type(e).__name__}: {str(e)[:120]}"))


def mock_files(mock_dir, count):
    """본문 장 순서대로 (그림 경로, 본문만인가). 하나라도 없으면 None"""
    out = []
    for k in range(1, count + 1):
        body = os.path.join(mock_dir, f"s{k:02d}_body.png")
        if os.path.isfile(body):
            out.append((body, True))
            continue
        full = next((p for p in (os.path.join(mock_dir, f"s{k:02d}.png"), os.path.join(mock_dir, f"s{k:02d}.jpg")) if os.path.isfile(p)), None)
        if full is None:
            return None
        out.append((full, False))
    return out


def _body_image(path, body_only):
    from PIL import Image
    im = Image.open(path).convert("RGB")
    if not body_only:   # 머리 띠·바닥을 떼고 본문만
        w, h = im.size
        im = im.crop((0, int(h * MOCK_T), w, int(h * (1 - MOCK_B))))
    return im


def _mappers(im, sw):
    """장표 인치 → 시안 본문 픽셀. 두 가지로 잰다 — 시안(가로세로 1.5·본문 1.77)과 장표(1.444·본문 1.705)의 비율이 달라
    에이전트가 가로·세로를 따로 늘렸는지(지시문 §본문 자리) 한 배율로 가운데 뒀는지(§좌표는 한 배율로) 모른다."""
    W, H = im.size
    bh = BODY_B - BODY_T
    stretch = (lambda x: x / sw * W, lambda y: (y - BODY_T) / bh * H)
    s = min(sw / W, bh / H)
    ox, oy = (sw - W * s) / 2, BODY_T + (bh - H * s) / 2
    fit = (lambda x: (x - ox) / s, lambda y: (y - oy) / s)
    return stretch, fit


def dominant(im, box):
    """상자 안 가장 많은 색(8 단위로 묶고 이웃 칸까지) → ('RRGGBB', 비율). 너무 작으면 (None, 0)"""
    W, H = im.size
    x0, y0, x1, y1 = max(0, int(box[0])), max(0, int(box[1])), min(W, int(box[2])), min(H, int(box[3]))
    if x1 - x0 < 6 or y1 - y0 < 6:
        return None, 0.0
    cr = im.crop((x0, y0, x1, y1))
    k = max(1, max(cr.size) // 60)
    cr = cr.resize((max(2, cr.size[0] // k), max(2, cr.size[1] // k)))
    px = list(cr.get_flattened_data() if hasattr(cr, "get_flattened_data") else cr.getdata())
    c = collections.Counter((r >> 3, g >> 3, b >> 3) for r, g, b in px)
    top = c.most_common(1)[0][0]
    near = [p for p in px if max(abs((p[i] >> 3) - top[i]) for i in range(3)) <= 1]
    if not near:
        return None, 0.0
    m = [round(sum(p[i] for p in near) / len(near)) for i in range(3)]
    return "%02X%02X%02X" % tuple(m), len(near) / len(px)


def _snap_white(v):
    return "FFFFFF" if all(int(v[i:i + 2], 16) >= 0xF8 for i in (0, 2, 4)) else v   # JPEG 의 흰색(FCFCFC 등)은 흰색으로


def match_fills(prs, mock_dir, min_in=0.5, inset=0.22, min_share=0.5, tol=18, log=None):
    """본문 장의 카드류 도형(밝은 단색 채움, 가로세로 0.5in 이상)의 채움색을 시안 같은 자리의 색과 견준다.
    두 좌표 대응(늘림·한 배율)에서 모두 같은 밝은 색이 상자 안쪽의 절반 이상을 차지하고, 장표 색과 채널 차가 tol 을 넘으면 시안 색으로.
    어두운 띠·쉐브론·그림 위 도형은 건드리지 않는다(자리가 조금만 어긋나도 다른 요소를 재기 때문).
    반환: [(본문 장 번호, 도형 이름, 전, 후)]"""
    body = [s for s in prs.slides if not _is_front(s)]
    files = mock_files(mock_dir, len(body)) if mock_dir and os.path.isdir(mock_dir) else None
    if not files:
        if log:
            log(f"시안 대조 건너뜀 — {mock_dir} 에 본문 {len(body)}장의 시안이 다 있지 않음")
        return []
    sw = prs.slide_width / IN
    changed = []
    for k, (slide, (path, body_only)) in enumerate(zip(body, files), 1):
        im = _body_image(path, body_only)
        maps = _mappers(im, sw)
        for sh in slide.shapes:   # 맨 위 단계만 — 묶음 안 도형은 좌표 계산이 달라 건너뛴다
            name = sh.name or ""
            if name.startswith("pd_") or name.lower().startswith("keymsg") or sh.shape_type == 13:
                continue
            spPr = sh._element.find(P + "spPr")
            sf = spPr.find(A + "solidFill") if spPr is not None else None
            clr = sf.find(A + "srgbClr") if sf is not None else None
            if clr is None or len(clr):   # 투명도·밝기 조절이 붙은 색은 건드리지 않는다
                continue
            if not sh.width or not sh.height or sh.width < min_in * IN or sh.height < min_in * IN:
                continue
            old = (clr.get("val") or "").upper()
            if len(old) != 6 or hsl(old)[2] < 0.75:
                continue
            x, y, w, h = sh.left / IN, sh.top / IN, sh.width / IN, sh.height / IN
            got = []
            for fx, fy in maps:
                box = (fx(x + inset * w), fy(y + inset * h), fx(x + (1 - inset) * w), fy(y + (1 - inset) * h))
                got.append(dominant(im, box))
            if any(c is None or share < min_share or hsl(c)[2] < 0.85 for c, share in got):
                continue
            if _diff(got[0][0], got[1][0]) > 10:   # 두 대응이 다른 것을 쟀다 — 자리가 불확실
                continue
            new = _snap_white(got[0][0])
            if _diff(new, old) <= tol:
                continue
            clr.set("val", new)
            changed.append((k, name, old, new))
    return changed


# ── 명령 ─────────────────────────────────────────────────────────────

# ── ④ 표 칸 테두리 순서 ───────────────────────────────────────────────
# 제작 에이전트 표 코드가 tcPr 에 채움을 먼저 넣고 테두리(lnL…)를 뒤에 붙였다(가로 장표 130칸 전부).
# 스키마 순서가 틀린 테두리를 PowerPoint 는 버리고 표 스타일 Table Grid(검은 격자)로 그린다 — LibreOffice·시안은 연한 선이라 썸네일로는 안 보였다(2026-10-28 분석).
TC_ORDER = ["lnL", "lnR", "lnT", "lnB", "lnTlToBr", "lnBlToTr", "cell3D",
            "noFill", "solidFill", "gradFill", "blipFill", "pattFill", "grpFill", "headers", "extLst"]
TABLE_GRID = "{5940675A-B579-460E-94D1-54222C63F5DA}"
NO_STYLE = "{2D5ABB26-0587-4C30-8999-92F81FD0307C}"   # 스타일 없음·눈금 없음 — 칸에 적은 선·채움만 그린다


def fix_tables(prs):
    """tcPr 자식을 스키마 순서로 정렬하고, Table Grid 스타일은 '스타일 없음'으로. 반환: (정렬한 칸 수, 바꾼 표 수)"""
    ncell = ntbl = 0
    rank = {t: i for i, t in enumerate(TC_ORDER)}
    for slide in prs.slides:
        for tc in slide._element.iter(A + "tcPr"):
            kids = list(tc)
            order = sorted(kids, key=lambda e: rank.get(etree.QName(e).localname, len(TC_ORDER)))
            if order != kids:
                for e in kids:
                    tc.remove(e)
                for e in order:
                    tc.append(e)
                ncell += 1
        for sid in slide._element.iter(A + "tableStyleId"):
            if (sid.text or "").strip().upper() == TABLE_GRID:
                sid.text = NO_STYLE
                ntbl += 1
    return ncell, ntbl


# ── ⑤ 기획 메모 줄 ────────────────────────────────────────────────────
# 기획(design.py)은 모자란 근거를 content 에 '※ 보강 필요: …' 로 적는다. 시안 상자는 그 줄을 빼지만
# 제작 에이전트가 plan.json 을 읽어 장표에 다시 넣었다(35ae 4쪽·291a 8쪽). 장표에서는 빼고 확인 목록으로 옮긴다.
MEMO = re.compile(r"^\s*※\s*(보강|확인)\s*필요")


def strip_memos(prs):
    """'※ 보강 필요/확인 필요' 문단을 지운다 — 도형에 그 문단밖에 없으면(카드 자체가 메모) 지우지 않고 알리기만.
    반환: [(장 번호, 글, 지웠나)]"""
    out = []
    for no, slide in enumerate(prs.slides, 1):
        for body in slide._element.iter(P + "txBody", A + "txBody"):
            paras = body.findall(A + "p")
            texts = ["".join(t.text or "" for t in p.iter(A + "t")) for p in paras]
            hits = [i for i, t in enumerate(texts) if MEMO.match(t)]
            if not hits:
                continue
            rest = [t for i, t in enumerate(texts) if i not in hits and t.strip()]
            for i in hits:
                if rest:
                    body.remove(paras[i])
                out.append((no, texts[i].strip()[:80], bool(rest)))
    return out


# ── ⑧ 글 맞춤(사용자 10-28, R126) — 강조 상자·줄바꿈 들여쓰기·아이콘 세로 중심 ─────────────
# 에이전트는 글 폭을 서체 없이 어림해 ① 강조어 뒤 상자를 따로 그리면 글과 어긋나고(d488 간지 'API [하나]로' 상자가 '하ㄴ'까지만)
# ② '· 측정: 효과성…' 처럼 기호·머리말을 글로 적어 둘째 줄이 기호 밑에서 시작하고 ③ 아이콘과 한 줄 제목의 세로 중심이 어긋났다.
# 실제 서체 파일로 재서 맞춘다(서체를 모르면 손대지 않는다).
HERE = os.path.dirname(os.path.abspath(__file__))
_FACE, _FONT = {}, {}
BULLET = re.compile(r"^((?:[·•▪◦●○■□※✓✔]|[\-–](?=\s))\s*)(?:([^\s:：]{1,10}\s*[:：]\s*))?")


def _faces():
    if not _FACE:
        try:
            import json
            fl = json.load(open(os.path.join(HERE, "fonts", "fonts.json"), encoding="utf-8"))
            for x in fl.get("title", []):
                _FACE[x["face"]] = x["file"]
            for x in fl.get("body", []):
                _FACE.update(dict(zip(x["faces"], x["files"])))
        except Exception:
            pass
    return _FACE


def _font(face, pt):
    f = _faces().get(face)
    if not f:
        return None
    k = (f, round(pt * 4))
    if k not in _FONT:
        try:
            from PIL import ImageFont
            _FONT[k] = ImageFont.truetype(os.path.join(HERE, "fonts", f), max(1, round(pt * 4)))
        except Exception:
            _FONT[k] = None
    return _FONT[k]


def _rpr_of(r, p):
    rp = r.find(f"{A}rPr")
    if rp is None or rp.get("sz") is None:
        d = p.find(f"{A}pPr/{A}defRPr")
        rp = d if d is not None else rp
    return rp


def _run_w(text, rp):
    """글 폭(in) — 서체·크기를 모르면 None"""
    if rp is None or rp.get("sz") is None:
        return None
    lat = rp.find(f"{A}ea")
    lat = lat if lat is not None and lat.get("typeface") else rp.find(f"{A}latin")
    face = lat.get("typeface") if lat is not None else None
    pt = int(rp.get("sz")) / 100
    fo = _font(face, pt)
    if fo is None:
        return None
    w = fo.getlength(text) / 4 / 72
    spc = int(rp.get("spc") or 0) / 100 / 72
    return w + spc * len(text)


def _ins(bp, k, dflt):
    return int(bp.get(k) if bp is not None and bp.get(k) is not None else dflt) / IN


def fix_highlights(prs):
    """글 없는 채운 상자가 한 줄 글 상자 안 특정 런(글자색이 다른 강조어) 뒤에 깔렸으면 그 런 폭에 맞춰 옮긴다"""
    n = 0
    for s in prs.slides:
        sps = [x for x in s.shapes._spTree if x.tag == f"{P}sp"]
        texts, boxes = [], []
        for e in sps:
            body = e.find(f"{P}txBody")
            t = "".join(x.text or "" for x in e.iter(f"{A}t")) if body is not None else ""
            off, ext = e.find(f"{P}spPr/{A}xfrm/{A}off"), e.find(f"{P}spPr/{A}xfrm/{A}ext")
            if off is None or ext is None:
                continue
            g = [int(off.get("x")), int(off.get("y")), int(ext.get("cx")), int(ext.get("cy"))]
            if t.strip():
                ps = body.findall(f"{A}p")
                if len([p for p in ps if "".join(x.text or "" for x in p.iter(f"{A}t")).strip()]) == 1:
                    texts.append((e, g, body))
            elif e.find(f"{P}spPr/{A}solidFill") is not None:
                boxes.append((e, g, off, ext))
        for e, g, body in texts:
            p = next(p for p in body.findall(f"{A}p") if "".join(x.text or "" for x in p.iter(f"{A}t")).strip())
            rs = p.findall(f"{A}r")
            if len(rs) < 2:
                continue
            cols = [(r.find(f"{A}rPr/{A}solidFill/{A}srgbClr").get("val") if r.find(f"{A}rPr/{A}solidFill/{A}srgbClr") is not None else "") for r in rs]
            wt = collections.Counter()   # 주된 색 = 글자 수가 가장 많은 색 — 런 수로 세면 '정품'(흰)·'의 매력을 각인합니다!'(남색) 두 런이 동점이라
            for r, c in zip(rs, cols):      # 흰 강조어를 본문으로 보고 상자를 나머지 글 쪽으로 옮겼다(10-29 291a 간지 3, R134)
                wt[c] += len(r.findtext(f"{A}t") or "")
            main = wt.most_common(1)[0][0]
            for bx, bg, off, ext in boxes:
                cy, bcy = g[1] + g[3] / 2, bg[1] + bg[3] / 2
                if abs(cy - bcy) > g[3] * 0.35 or bg[0] + bg[2] < g[0] or bg[0] > g[0] + g[2]:
                    continue
                if list(s.shapes._spTree).index(bx) > list(s.shapes._spTree).index(e):
                    continue   # 상자가 글 위에 있으면 강조 바탕이 아니다
                hit = [i for i, c in enumerate(cols) if c != main]
                if not hit or hit != list(range(hit[0], hit[-1] + 1)):
                    continue
                bp = body.find(f"{A}bodyPr")
                algn = (p.find(f"{A}pPr").get("algn") if p.find(f"{A}pPr") is not None else None) or "l"
                if algn != "l":
                    continue
                ws = [_run_w(r.findtext(f"{A}t") or "", _rpr_of(r, p)) for r in rs]
                if any(w is None for w in ws):
                    continue
                x0 = g[0] / IN + _ins(bp, "lIns", 91440) + sum(ws[:hit[0]])
                ww = sum(ws[hit[0]:hit[-1] + 1])
                pad = min(0.12, max(0.04, (bg[2] / IN - ww) / 2))
                nx, nw = x0 - pad, ww + 2 * pad
                if abs(nx - bg[0] / IN) > 0.02 or abs(nw - bg[2] / IN) > 0.02:
                    off.set("x", str(int(nx * IN)))
                    ext.set("cx", str(int(nw * IN)))
                    n += 1
    return n


def hang_bullets(prs):
    """글로 적은 글머리(· • - …)와 '머리말:' 뒤로 둘째 줄을 맞춘다 — marL = 머리 폭, indent = -머리 폭"""
    n = 0
    for s in prs.slides:
        for p in s.shapes._spTree.iter(f"{A}p"):
            rs = p.findall(f"{A}r")
            if not rs:
                continue
            t = "".join(r.findtext(f"{A}t") or "" for r in rs)
            m = BULLET.match(t)
            if not m:
                continue
            pp = p.find(f"{A}pPr")
            if pp is not None and (int(pp.get("indent") or 0) < 0 or pp.find(f"{A}buChar") is not None or pp.find(f"{A}buAutoNum") is not None):
                continue   # 이미 내어쓰기·진짜 글머리
            head, rest, w = m.group(0), m.group(0), 0.0
            for r in rs:   # 머리 글자가 여러 런에 걸칠 수 있다
                if not rest:
                    break
                tx = r.findtext(f"{A}t") or ""
                part = tx[:len(rest)]
                pw = _run_w(part, _rpr_of(r, p))
                if pw is None:
                    w = None
                    break
                w += pw
                rest = rest[len(part):]
            if not w or w > 2.5 or len(t) <= len(head) + 2:
                continue
            if pp is None:
                pp = etree.SubElement(p, f"{A}pPr")
                p.remove(pp)
                p.insert(0, pp)
            base = int(pp.get("marL") or 0)
            pp.set("marL", str(base + int(w * IN)))
            pp.set("indent", str(-int(w * IN)))
            n += 1
    return n


def center_icons(prs, max_in=0.65, gap_in=0.4):
    """한 줄 글 바로 왼쪽의 작은 아이콘(그림·글 없는 도형·작은 묶음)을 글 줄의 세로 가운데에 맞춘다"""
    n = 0
    for s in prs.slides:
        for tree in [s.shapes._spTree] + [g for g in s.shapes._spTree.iter(f"{P}grpSp")]:
            kids = [x for x in tree if x.tag in (f"{P}sp", f"{P}pic", f"{P}grpSp")]
            geo = {}
            for e in kids:
                xf = e.find(f"{P}spPr/{A}xfrm") if e.tag != f"{P}grpSp" else e.find(f"{P}grpSpPr/{A}xfrm")
                if xf is None or xf.find(f"{A}off") is None or xf.find(f"{A}ext") is None:
                    continue
                geo[e] = (xf.find(f"{A}off"), xf.find(f"{A}ext"))
            icons, lines = [], []
            for e, (off, ext) in geo.items():
                x, y, w, h = (int(off.get("x")) / IN, int(off.get("y")) / IN, int(ext.get("cx")) / IN, int(ext.get("cy")) / IN)
                t = "".join(z.text or "" for z in e.iter(f"{A}t")).strip()
                if not t and 0.12 < w <= max_in and 0.12 < h <= max_in and 0.7 < w / h < 1.43:
                    icons.append((e, off, x, y, w, h))
                elif t and e.tag == f"{P}sp":
                    body = e.find(f"{P}txBody")
                    ps = [p for p in body.findall(f"{A}p") if "".join(z.text or "" for z in p.iter(f"{A}t")).strip()]
                    if len(ps) != 1:
                        continue
                    rs = ps[0].findall(f"{A}r")
                    rps = [_rpr_of(r, ps[0]) for r in rs]
                    ws = [_run_w(r.findtext(f"{A}t") or "", rp) for r, rp in zip(rs, rps)]
                    if not rs or any(v is None for v in ws):
                        continue
                    bp = body.find(f"{A}bodyPr")
                    li, ri, ti, bi = (_ins(bp, "lIns", 91440), _ins(bp, "rIns", 91440), _ins(bp, "tIns", 45720), _ins(bp, "bIns", 45720))
                    if sum(ws) > w - li - ri + 0.02 and (bp is None or bp.get("wrap") != "none"):
                        continue   # 두 줄 이상
                    pt = max(int(rp.get("sz")) for rp in rps) / 100
                    lh = pt * 1.2 / 72
                    anc = (bp.get("anchor") if bp is not None else None) or "t"
                    cy = (y + ti + lh / 2) if anc == "t" else (y + h - bi - lh / 2) if anc == "b" else (y + ti + (h - ti - bi) / 2)
                    lines.append((x + li, cy, y, h))
            for e, off, x, y, w, h in icons:
                best = None
                for tx, cy, ty, th in lines:
                    gap = tx - (x + w)
                    if -0.05 <= gap <= gap_in and ty - h < y + h / 2 < ty + th + h:
                        if best is None or gap < best[0]:
                            best = (gap, cy)
                if best is None:
                    continue
                d = best[1] - (y + h / 2)
                if 0.015 < abs(d) < h * 0.8:
                    off.set("y", str(int((y + d) * IN)))
                    n += 1
    return n


def _y(h):
    h = h.lstrip("#")
    return 0.299 * int(h[0:2], 16) + 0.587 * int(h[2:4], 16) + 0.114 * int(h[4:6], 16)


def _sat(h):
    r, g, b = (int(h.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))
    return max(r, g, b) - min(r, g, b)


def fix_label_text(prs, cap_pt=10.0, min_pt=9.0):
    """채운 도형 안 글(라벨·화살표·알약) — ① 글자색 대비: 중간·짙은 바탕(밝기 165 미만)의 먹색 글 → 흰색, 밝은 바탕(200 초과)의 흰 글 → 먹색
    ② 한 줄 라벨이 9pt 밑으로 줄었으면 안쪽 여백을 줄이고 폭에 맞는 데까지 키운다(최대 10pt) ③ 띄어쓰기 없는 짧은 라벨('AS-IS')이 꺾이면 가운데 고정으로 상자를 넓힌다.
    정부24 사본 10쪽(10-28 사용자): '로그인·주소 확인' #6A9BE8 바탕에 #1F2937 글, 화살표 글 7pt, 'AS-' / 'IS'"""
    n = [0, 0, 0]
    INK = "1F2937"
    for s in prs.slides:
        for e in s.shapes._spTree.iter(f"{P}sp"):
            fill = e.find(f"{P}spPr/{A}solidFill/{A}srgbClr")
            body = e.find(f"{P}txBody")
            if fill is None or body is None:
                continue
            ps = [p for p in body.findall(f"{A}p") if "".join(x.text or "" for x in p.iter(f"{A}t")).strip()]
            if not ps:
                continue
            fy = _y(fill.get("val"))
            for c in body.iter(f"{A}srgbClr"):
                if not any(a.tag == f"{A}rPr" for a in c.iterancestors()):
                    continue
                v = c.get("val").upper()
                if fy < 165 and _y(v) < 90 and _sat(v) < 90:
                    c.set("val", "FFFFFF")
                    n[0] += 1
                elif fy > 200 and v == "FFFFFF":
                    c.set("val", INK)
                    n[0] += 1
            if len(ps) != 1:
                continue
            p = ps[0]
            rs = p.findall(f"{A}r")
            rps = [_rpr_of(r, p) for r in rs]
            ws = [_run_w(r.findtext(f"{A}t") or "", rp) for r, rp in zip(rs, rps)]
            if not rs or any(v is None for v in ws):
                continue
            off, ext = e.find(f"{P}spPr/{A}xfrm/{A}off"), e.find(f"{P}spPr/{A}xfrm/{A}ext")
            geom = e.find(f"{P}spPr/{A}prstGeom")
            if off is None or ext is None:
                continue
            w, h = int(ext.get("cx")) / IN, int(ext.get("cy")) / IN
            prst = geom.get("prst") if geom is not None else "rect"
            tip = {"chevron": h * 0.5, "homePlate": h * 0.25}.get(prst, 0.0)   # 화살표 끝·꺾임이 먹는 폭
            bp = body.find(f"{A}bodyPr")
            li, ri = _ins(bp, "lIns", 91440), _ins(bp, "rIns", 91440)
            room = w - li - ri - tip
            text = "".join(r.findtext(f"{A}t") or "" for r in rs)
            pt = max(int(rp.get("sz")) for rp in rps) / 100
            if pt < min_pt and len(text) <= 16:
                room2 = w - 0.06 - tip
                k = min(cap_pt / pt, room2 / max(1e-6, sum(ws)) * 0.97)
                if k * pt >= pt + 0.5:
                    for rp in rps:
                        rp.set("sz", str(int(round(int(rp.get("sz")) * k / 50.0) * 50)))
                    bp.set("lIns", str(int(0.03 * IN)))
                    bp.set("rIns", str(int(0.03 * IN)))
                    n[1] += 1
            elif " " not in text.strip() and len(text) <= 10:
                if bp is not None and bp.get("wrap") != "none":   # LibreOffice 는 'AS-IS' 를 하이픈에서 꺾는다 — 낱말 하나짜리 라벨은 줄을 바꾸지 않는다
                    bp.set("wrap", "none")
                    n[2] += 1
                if sum(ws) > room + 0.005:
                    need = sum(ws) + li + ri + tip + 0.04
                    x = int(off.get("x")) / IN
                    off.set("x", str(int((x - (need - w) / 2) * IN)))
                    ext.set("cx", str(int(need * IN)))
                    n[2] += 1
    return n


def bleed_fronts(prs, near_in=0.35):
    """앞장(표지·목차·간지·끝장) 그림이 쪽 가장자리 가까이(near_in 안)에서 멈췄으면 그 가장자리까지 붙인다 — 비율 유지, 반대쪽 모서리 고정.
    a219 표지: 그림이 아래 끝 0.18in 위에서 끝나 옅은 판이 뚝 끊겨 '마무리가 되다 만' 것처럼 보였다(사용자 10-28)"""
    W, H = prs.slide_width, prs.slide_height
    n = 0
    for s in prs.slides:
        if not _is_front(s):
            continue
        for sh in s.shapes:
            if sh.shape_type != 13 or "logo" in sh.name or sh.width < W * 0.25:
                continue
            x, y, w, h = sh.left, sh.top, sh.width, sh.height
            near = near_in * IN
            gaps = {"l": x, "t": y, "r": W - (x + w), "b": H - (y + h)}
            fix = {k: v for k, v in gaps.items() if 0 < v <= near}
            if not fix or not any(v <= 0 for v in gaps.values()):
                continue   # 적어도 한 변은 이미 가장자리에 닿은 그림만(가운데 떠 있는 그림은 의도)
            k = max([1.0] + [(w + v) / w if c in "lr" else (h + v) / h for c, v in fix.items()])
            nw, nh = int(w * k), int(h * k)
            # 고정할 모서리 — 양쪽이 다 가장자리에 닿아 있으면 가운데를 고정(3:2 시안을 쪽 폭에 맞춰 아래 0.28in 가 빈 경우 좌우로 0.21in 씩 넘친다)
            if gaps["l"] <= 0 and gaps["r"] <= 0:
                nx = x - (nw - w) // 2
            else:
                nx = x - (nw - w) if (gaps["r"] <= 0 or "l" in fix) else x
            if gaps["t"] <= 0 and gaps["b"] <= 0:
                ny = y - (nh - h) // 2
            else:
                ny = y - (nh - h) if (gaps["b"] <= 0 or "t" in fix) else y
            sh.left, sh.top, sh.width, sh.height = int(nx), int(ny), nw, nh
            n += 1
    return n


def _text_sps(slide):
    """글이 있는 도형 전부(묶음 안까지)"""
    for sp in slide.shapes._spTree.iter(f"{P}sp"):
        body = sp.find(f"{P}txBody")
        if body is not None and "".join(t.text or "" for t in body.iter(f"{A}t")).strip():
            yield sp, body


def _sz_runs(body):
    out = []
    for p in body.findall(f"{A}p"):
        for r in p.findall(f"{A}r"):
            rp = r.find(f"{A}rPr")
            if rp is not None and rp.get("sz") and (r.findtext(f"{A}t") or "").strip():
                out.append(rp)
    return out


def _para_lines(body, inner_w):
    """글 줄 수 어림 — 문단마다 글 폭 ÷ 안쪽 폭. 폭을 못 재면 None"""
    n, lh = 0, 0.0
    for p in body.findall(f"{A}p"):
        w = 0.0
        pt = 0.0
        for r in p.findall(f"{A}r"):
            rp = _rpr_of(r, p)
            v = _run_w(r.findtext(f"{A}t") or "", rp)
            if v is None:
                return None, None
            w += v
            pt = max(pt, int(rp.get("sz")) / 100)
        n += max(1, int(w / max(0.1, inner_w) + 0.999))
        lh = max(lh, pt * 1.2 / 72)
    return n, lh


def clamp_right(prs, margin_in=0.3):
    """쪽 밖으로 나간 글 상자 — 글이 들어가면 폭을 쪽 안으로 줄인다(77850 7쪽 상자 오른쪽 끝 11.47in, 쪽 폭 10.83in, R148). 묶음 안은 좌표계가 달라 맨 위 도형만"""
    n = 0
    W = prs.slide_width
    for s in prs.slides:
        if _is_front(s):
            continue
        for sp in s.shapes._spTree.findall(f"{P}sp"):
            body = sp.find(f"{P}txBody")
            xf = sp.find(f"{P}spPr/{A}xfrm")
            if body is None or xf is None or xf.find(f"{A}off") is None or xf.find(f"{A}ext") is None:
                continue
            x, cx = int(xf.find(f"{A}off").get("x")), int(xf.find(f"{A}ext").get("cx"))
            cy = int(xf.find(f"{A}ext").get("cy"))
            if x + cx <= W or x >= W - IN or not "".join(t.text or "" for t in body.iter(f"{A}t")).strip():
                continue
            new = W - int(margin_in * IN) - x
            bp = body.find(f"{A}bodyPr")
            lines, lh = _para_lines(body, new / IN - _ins(bp, "lIns", 91440) - _ins(bp, "rIns", 91440))
            if lines is None or lines * lh > cy / IN + 0.02 + 0.1:
                continue
            xf.find(f"{A}ext").set("cx", str(new))
            n += 1
    return n


def unify_siblings(prs):
    """같은 줄기 글 상자(왼쪽 끝·폭이 같은 3개 이상)에서 혼자 큰 글을 많은 쪽 크기로 줄인다 — 표 칸처럼 나란한 글이 칸마다 제각각이었다
    (490aac 6쪽 전략 칸 ⑤⑥, 사용자 의견 '크기가 안 맞음', R148). 맨 위 칸(머리글)은 커도 둔다. 키우지는 않는다 — 넘칠 수 있다. 3pt 넘게 큰 것은 일부러 큰 수치로 보고 둔다"""
    n = 0
    for s in prs.slides:
        if _is_front(s):
            continue
        for tree in [s.shapes._spTree] + list(s.shapes._spTree.iter(f"{P}grpSp")):
            rows = []
            for sp in tree.findall(f"{P}sp"):
                body = sp.find(f"{P}txBody")
                xf = sp.find(f"{P}spPr/{A}xfrm")
                if body is None or xf is None or xf.find(f"{A}off") is None or xf.find(f"{A}ext") is None:
                    continue
                if sp.find(f"{P}nvSpPr/{P}cNvPr").get("name", "").startswith("pd_frame"):
                    continue
                t = "".join(z.text or "" for z in body.iter(f"{A}t")).strip()
                rps = _sz_runs(body)
                if len(t) < 4 or not rps:
                    continue
                rows.append((int(xf.find(f"{A}off").get("x")), int(xf.find(f"{A}off").get("y")), int(xf.find(f"{A}ext").get("cx")), rps))
            used = set()
            for i, a in enumerate(rows):
                if i in used:
                    continue
                g = [j for j, b in enumerate(rows) if abs(b[0] - a[0]) <= 0.06 * IN and abs(b[2] - a[2]) <= max(0.08 * a[2], 0.06 * IN)]
                used.update(g)
                if len(g) < 3:
                    continue
                g.sort(key=lambda j: rows[j][1])
                sizes = [max(int(rp.get("sz")) for rp in rows[j][3]) for j in g[1:]]   # 맨 위(머리글)는 셈에서 뺀다
                mode = max(set(sizes), key=sizes.count)
                if sizes.count(mode) * 2 <= len(sizes):
                    continue
                for j in g[1:]:
                    big = max(int(rp.get("sz")) for rp in rows[j][3])
                    if mode < big <= mode + 300:
                        for rp in rows[j][3]:
                            rp.set("sz", str(min(int(rp.get("sz")), mode)))
                        n += 1
    return n


def lift_tiny(prs, floor=7.0):
    """7pt 아래 글 — 상자에 들어가면 7pt 로 키운다(5~6pt 가 쪽마다 있었다, R148). 안 들어가면 두고 개수를 돌려준다(확인 목록으로). 반환 (키움, 남음)"""
    up = left = 0
    fz = int(floor * 100)
    for s in prs.slides:
        if _is_front(s):
            continue
        for sp, body in _text_sps(s):
            rps = [rp for rp in _sz_runs(body) if int(rp.get("sz")) < fz]
            if not rps:
                continue
            xf = sp.find(f"{P}spPr/{A}xfrm")
            ok = False
            if xf is not None and xf.find(f"{A}ext") is not None:
                old = [rp.get("sz") for rp in rps]
                for rp in rps:
                    rp.set("sz", str(fz))
                bp = body.find(f"{A}bodyPr")
                w = int(xf.find(f"{A}ext").get("cx")) / IN
                h = int(xf.find(f"{A}ext").get("cy")) / IN
                lines, lh = _para_lines(body, w - _ins(bp, "lIns", 91440) - _ins(bp, "rIns", 91440))
                ok = lines is not None and lines * lh <= h - _ins(bp, "tIns", 45720) - _ins(bp, "bIns", 45720) + 0.03
                if not ok and bp is not None and bp.get("wrap") == "none":
                    ok = True   # 줄을 안 바꾸는 상자 — 높이만 보면 된다
                if not ok:
                    for rp, v in zip(rps, old):
                        rp.set("sz", v)
            if ok:
                up += 1
            else:
                left += 1
    return up, left


LEFTOVER = re.compile(r"\d{4}\.00\.00|0000\.00|보강 필요|확정 후 기재|작성 예정|추후 기재|○○|OO기관|XXX|lorem ipsum|입력하세요|디자인 필요|내용 조사 필요|참고해 ?주세요", re.I)


def leftovers(slide):
    """빈칸·작성자 메모로 남은 글 — 2026.00.00·확정 후 기재·디자인 필요 가 경고 없이 결과에 남았다(2a1c·d4fd·c7ad, R149). 고치지 않고 알린다. 반환 [글…]"""
    out = []
    for sp, body in _text_sps(slide):
        t = " ".join("".join(z.text or "" for z in p.iter(f"{A}t")) for p in body.findall(f"{A}p")).strip()
        if LEFTOVER.search(t):
            out.append(t[:40])
    return out


def _ink(sh):
    """글이 실제로 찍히는 자리(in) (x0, y0, x1, y1) — 상자가 아니라 글 자체. 상자는 글보다 훨씬 넓어 겹침 판정이 틀린다. 서체를 모르면 None"""
    body = sh._element.find(f"{P}txBody")
    if body is None or sh.left is None or not "".join(t.text or "" for t in body.iter(f"{A}t")).strip():
        return None
    bp = body.find(f"{A}bodyPr")
    # 돌리거나 세로로 쓴 글은 가로 상자 안에 찍히지 않는다 — 모르는 값으로 재서 칸을 넓히지 않게(R168)
    if getattr(sh, "rotation", 0) or (bp is not None and (bp.get("vert") not in (None, "horz") or int(bp.get("rot") or 0))):
        return None
    left = sh.left / IN + _ins(bp, "lIns", 91440)
    right = (sh.left + sh.width) / IN - _ins(bp, "rIns", 91440)
    inner = max(0.1, right - left)
    nowrap = bp is not None and bp.get("wrap") == "none"
    x0, x1, total, last = None, None, 0.0, 0.0
    for p in body.findall(f"{A}p"):
        segs, pt = [0.0], 0.0   # 강제 줄바꿈(a:br) 마다 한 토막
        for c in p:
            if c.tag == f"{A}br":
                segs.append(0.0)
            elif c.tag in (f"{A}r", f"{A}fld"):
                rp = _rpr_of(c, p)
                v = _run_w(c.findtext(f"{A}t") or "", rp)
                if v is None:
                    if c.tag == f"{A}fld":   # 쪽 번호 칸은 크기를 안 적는 일이 많다 — 글 자리를 통째로 포기하지 않는다
                        continue
                    return None
                segs[-1] += v
                pt = max(pt, int(rp.get("sz")) / 100)
        lh = pt * 1.2 / 72 if pt else last
        last = lh
        total += lh * sum(1 if nowrap else max(1, int(v / inner + 0.999)) for v in segs)
        w = max(segs)
        if not w:
            continue
        w = w if nowrap else min(w, inner)
        pp = p.find(f"{A}pPr")
        al = pp.get("algn") if pp is not None else None
        a = right - w if al == "r" else (left + right - w) / 2 if al == "ctr" else left
        x0 = a if x0 is None else min(x0, a)
        x1 = a + w if x1 is None else max(x1, a + w)
    if x0 is None:
        return None
    top = sh.top / IN + _ins(bp, "tIns", 45720)
    bot = (sh.top + sh.height) / IN - _ins(bp, "bIns", 45720)
    an = bp.get("anchor") if bp is not None else None
    y0 = bot - total if an == "b" else (top + bot - total) / 2 if an == "ctr" else top
    return x0, y0, x1, y0 + total


def _box(sh):
    return sh.left / IN, sh.top / IN, (sh.left + sh.width) / IN, (sh.top + sh.height) / IN


def _meets(a, b, mx=0.05, my=0.02):
    """두 사각형이 눈에 띄게 겹치나"""
    return min(a[2], b[2]) - max(a[0], b[0]) > mx and min(a[3], b[3]) - max(a[1], b[1]) > my


def covered_text(slide):
    """다른 글을 덮은 채운 글 상자 — 490aac 6쪽 알약이 6행 글 아랫부분을 덮었다(R149). 맨 위 도형끼리, 나중에 놓인(위에 그려지는) 채운 상자가 앞 글 자체에 걸릴 때.
    글 자리를 못 재면 상자 면적의 25% 로 본다. 반환 [(덮는 글, 덮인 글)…]"""
    rows = []
    for sh in slide.shapes:
        if getattr(sh, "has_text_frame", False) and sh.has_text_frame and sh.text_frame.text.strip() and sh.left is not None and not sh.name.startswith("pd_"):
            try:
                solid = sh.fill.type == 1
            except Exception:
                solid = False
            rows.append((sh, solid))
    out = []
    for i, (a, _) in enumerate(rows):
        ink = _ink(a)
        for b, solid in rows[i + 1:]:
            geo = b._element.find(f"{P}spPr/{A}prstGeom")
            if not solid or (geo is not None and geo.get("prst") == "ellipse" and b.width < int(0.5 * IN)):
                continue   # 글 앞 번호 동그라미는 일부러 붙인 것
            if ink is not None:
                hit = _meets(ink, _box(b))
            else:
                ix = min(a.left + a.width, b.left + b.width) - max(a.left, b.left)
                iy = min(a.top + a.height, b.top + b.height) - max(a.top, b.top)
                hit = ix > 0 and iy > 0 and ix * iy > 0.25 * a.width * a.height and a.width * a.height < b.width * b.height * 4
            if hit:
                out.append((b.text_frame.text.strip()[:20], a.text_frame.text.strip()[:20]))
    return out


def _solid(sh):
    try:
        return sh.fill.type == 1
    except Exception:
        return False


def _light_card(sh):
    """글 없는 옅은 칸 — 사각형·둥근 사각형만"""
    el = sh._element
    if not el.tag.endswith("}sp") or sh.name.startswith("pd_") or sh.width < int(0.5 * IN) or sh.height < int(0.4 * IN):
        return False
    if sh.has_text_frame and sh.text_frame.text.strip():
        return False
    pr = el.find(f"{P}spPr")
    geo = pr.find(f"{A}prstGeom") if pr is not None else None
    clr = pr.find(f"{A}solidFill/{A}srgbClr") if pr is not None else None
    return geo is not None and geo.get("prst") in ("rect", "roundRect") and clr is not None and _y(clr.get("val")) >= 200


def wrap_cards(prs, pad=0.12, near=0.25):
    """내용보다 좁게 잡힌 칸을 내용을 감싸게 넓힌다 — 시안의 넓은 칸이 좁게 옮겨져 글이 칸 밖으로 삐져나왔다(77850f 4쪽 '11조원', R150).
    글 자체가 칸의 왼쪽·오른쪽 끝선을 가로지를 때만. 같은 줄기 다른 칸의 끝선에 가까우면 거기에 맞춘다. 넓히면 다른 칸·글에 부딪히거나 아래 도형을 덮으면 그대로 둔다. 반환 [(쪽, 칸 이름)…]"""
    done = []
    if prs.slide_width <= prs.slide_height:
        return done
    W = prs.slide_width / IN

    def one(no, s):
        shapes = [x for x in _placed(s.shapes) if not x.name.startswith("pd_frame")]
        inks = {id(x): _ink(x) for x in shapes}
        cards = [x for x in shapes if _light_card(x)]
        for c in cards:
            g = list(_box(c))
            hit = [i for i in inks.values() if i is not None and g[1] <= (i[1] + i[3]) / 2 <= g[3] and (i[0] < g[0] - 0.05 < g[0] + 0.05 < i[2] or i[0] < g[2] - 0.05 < g[2] + 0.05 < i[2])]
            if not hit:
                continue
            for i in hit:
                g = [min(g[0], i[0] - pad), min(g[1], i[1]), max(g[2], i[2] + pad), max(g[3], i[3])]
            for _ in range(3):   # 넓힌 자리에 걸친 글·그림도 함께 감싼다
                for x in shapes:
                    if x is c or x in cards or x.name == "keymsg":
                        continue
                    b = inks[id(x)] or (_box(x) if _stype(x) == 13 else None)
                    if b is not None and _meets(g, b, 0.01, 0.01):
                        g = [min(g[0], b[0] - pad), min(g[1], b[1]), max(g[2], b[2] + pad), max(g[3], b[3])]
            old = _box(c)
            if any(_solid(x) and _meets(g, _box(x), 0.01, 0.01) and not (old[0] <= _box(x)[0] and old[1] <= _box(x)[1] and _box(x)[2] <= old[2] and _box(x)[3] <= old[3]) for x in shapes if x is not c and x not in cards and x.width > int(0.02 * IN) and x.height > int(0.02 * IN)):
                continue   # 칸 밖의 채운 도형(가운데 동그라미 등)을 삼키게 되면 그대로 둔다
            inner = g[0] + pad, g[2] - pad
            for o in cards:
                if o is c:
                    continue
                ob = _box(o)
                if abs(ob[0] - g[0]) < near and ob[0] <= inner[0]:
                    g[0] = ob[0]
                if abs(ob[2] - g[2]) < near and ob[2] >= inner[1]:
                    g[2] = ob[2]
            ok = g[0] >= 0 and g[2] <= W and not any(_meets(g, _box(o), 0.01, 0.01) for o in cards if o is not c)
            z = shapes.index(c)
            ok = ok and not any(_meets(g, _box(x), 0.01, 0.01) for x in shapes[:z] if x.name != "keymsg")   # 먼저 그려진 도형은 넓힌 칸에 가려진다
            if not ok:
                continue
            c.left, c.top = int(g[0] * IN), int(g[1] * IN)
            c.width, c.height = int((g[2] - g[0]) * IN), int((g[3] - g[1]) * IN)
            done.append((no, c.name))
    _each_slide(prs, one, "좁은 칸 넓히기")
    return done


def clear_pills(prs, gap=0.02, touch=0.04):
    """글을 덮거나 맞닿은 알약을 푼다 — 글이 칸 가운데 있어 칸 아래쪽 알약에 붙었다(490aac 6쪽 ⑥행, R150). 시안처럼 글을 알약 위 빈자리로 올리고, 자리가 없으면 알약을 글 아래로 내린다.
    알약은 덮인 글 칸보다 작은 낮고 긴 상자(0.45in 이하, 폭 ≥ 높이×3)로, 글 아래쪽에 걸린 것만 — 글 위쪽 머리 라벨을 글 아래로 내렸다(R164).
    다른 글·그림·칸에 부딪히면 그대로 두고 확인 목록에 맡긴다. 반환 [(쪽, 덮인 글)…]"""
    done = []
    if prs.slide_width <= prs.slide_height:
        return done

    def blocked(nb, old, others, pill):
        """옮긴 자리가 그림·칸에 걸리나 — 옮기기 전 알약을 감싸던 칸은 벗어나면 안 되고, 다른 그림·칸은 걸치면 안 된다"""
        for x in others:
            if x is pill or not (_stype(x) == 13 or _solid(x) or _light_card(x)):
                continue
            bx = _box(x)
            if bx[0] <= old[0] and bx[1] <= old[1] and old[2] <= bx[2] and old[3] <= bx[3]:
                if not (bx[0] <= nb[0] and bx[1] <= nb[1] and nb[2] <= bx[2] and nb[3] <= bx[3]):
                    return True
            elif _meets(nb, bx, 0.01, 0.01):
                return True
        return False

    def one(no, s):
        shapes = [x for x in _placed(s.shapes) if not x.name.startswith("pd_")]
        texts =[x for x in shapes if getattr(x, "has_text_frame", False) and x.has_text_frame and x.text_frame.text.strip()]
        for i, a in enumerate(texts):
            ink = _ink(a)
            if ink is None:
                continue
            for b in texts[i + 1:]:
                geo = b._element.find(f"{P}spPr/{A}prstGeom")
                if not _solid(b) or geo is None or geo.get("prst") not in ("rect", "roundRect") or b.width < 3 * b.height:
                    continue   # 번호 동그라미는 글 앞에 일부러 붙인 것
                if b.height > int(0.45 * IN) or b.height >= a.height or not _meets((ink[0], ink[1], ink[2], ink[3] + touch), _box(b)):
                    continue
                if b.top / IN <= ink[1] or (b.top + b.height / 2) / IN < (ink[1] + ink[3]) / 2:
                    continue   # 글 위쪽에 걸린 라벨·머리 띠 — 내리지 않는다. 덮임은 covered_text 가 알린다
                inkh = ink[3] - ink[1]
                room = (b.top - a.top) / IN
                body = a._element.find(f"{P}txBody")
                bp = body.find(f"{A}bodyPr")
                if bp is not None and inkh + gap <= room:
                    bp.set("anchor", "t")
                    bp.set("tIns", str(int((room - inkh) / 2 * IN)))
                    bp.set("bIns", "0")
                    # 줄여 둔 글(fontScale)의 자동 맞춤은 남긴다 — 지우면 글이 원래 크기로 커져 넘친다(R168)
                    for af in [x for x in bp.findall(f"{A}normAutofit") if not x.get("fontScale")] + bp.findall(f"{A}spAutoFit"):
                        bp.remove(af)
                    done.append((no, a.text_frame.text.strip()[:20]))
                    break
                new = int((ink[3] + gap) * IN)
                nb = (b.left / IN, new / IN, (b.left + b.width) / IN, (new + b.height) / IN)
                others = [_ink(x) for x in texts if x is not a and x is not b]
                if not any(o is not None and _meets(nb, o) for o in others) and nb[3] < prs.slide_height / IN and not blocked(nb, _box(b), shapes, b):
                    b.top = new
                    done.append((no, a.text_frame.text.strip()[:20]))
                    break
    _each_slide(prs, one, "글 덮은 알약 풀기")
    return done


def move_dividers(prs):
    """글을 가로지르는 세로 구분선을 두 줄기 글 사이로 옮긴다 — 칸 폭을 잘못 잡아 선이 '수출액 대비 비중' 글자를 뚫었다(77850f 4쪽, R150). 사이가 0.1in 못 되면 그대로 둔다. 반환 [(쪽, 옮긴 거리)…]"""
    done = []
    if prs.slide_width <= prs.slide_height:
        return done

    def one(no, s):
        shapes = _placed(s.shapes)
        inks = [(z, i) for z, i in ((z, _ink(x)) for z, x in enumerate(shapes) if not x.name.startswith("pd_")) if i is not None]
        for lz, ln in enumerate(shapes):
            if ln.width > int(0.005 * IN) or ln.height < int(0.3 * IN) or not ln._element.tag.endswith("}cxnSp"):
                continue   # 흐름 선(69fd 7쪽 허브 선)은 조금이라도 기울고 칸 아래로 지난다 — 곧은 선이 글 위에 그려질 때만
            x, y0, y1 = ln.left / IN, ln.top / IN, (ln.top + ln.height) / IN
            band = [i for _, i in inks if min(i[3], y1) - max(i[1], y0) > 0.5 * (i[3] - i[1])]
            cross = [i for z, i in inks if z < lz and i in band and i[0] + 0.02 < x < i[2] - 0.02]
            if not cross:
                continue
            lo = max((i[2] for i in band if i[2] <= min(c[0] for c in cross) + 0.02), default=None)
            hi = min(c[0] for c in cross)
            if lo is None or hi - lo < 0.1:
                continue
            ln.left = int((lo + hi) / 2 * IN)
            done.append((no, round(abs(x - (lo + hi) / 2), 2)))
    _each_slide(prs, one, "글 뚫은 구분선 옮기기")
    return done


BODY_BOTTOM = 6.95   # 본문이 내려와야 할 바닥(in) — 잘 맞은 쪽의 결론 띠 끝. 쪽 번호·로고는 이 아래(10.83×7.5in 장표)


def _band_of(slide, W, H):
    """결론 띠 — 아래쪽의 쪽 폭에 가까운 글 띠"""
    best = None
    for sh in _placed(slide.shapes):
        if sh.name.startswith("pd_frame") or not getattr(sh, "has_text_frame", False) or not sh.text_frame.text.strip():
            continue
        if sh.width > W * 0.6 and sh.height < int(0.85 * IN) and sh.top > H * 0.5 and (best is None or sh.top > best.top):
            best = sh
    return best


def unify_bands(prs):
    """결론 띠 글 크기를 덱 전체에서 하나로 — 같은 덱에서 13pt·15pt 가 섞였다(7b6e·77850, R148). 줄이기만 한다"""
    if prs.slide_width <= prs.slide_height:
        return 0
    bands = []
    for s in prs.slides:
        if _is_front(s):
            continue
        b = _band_of(s, prs.slide_width, prs.slide_height)
        if b is not None:
            rps = _sz_runs(b._element.find(f"{P}txBody"))
            if rps:
                bands.append(rps)
    if len(bands) < 2:
        return 0
    sizes = [max(int(rp.get("sz")) for rp in r) for r in bands]
    low = min(sizes)
    if max(sizes) - low > 400:   # 차이가 크면 일부러 다르게 둔 장
        return 0
    n = 0
    for r, v in zip(bands, sizes):
        if v > low:
            for rp in r:
                rp.set("sz", str(min(int(rp.get("sz")), low)))
            n += 1
    return n


def fill_height(prs, target=BODY_BOTTOM, min_gap=0.12, max_k=1.25):
    """본문 아래가 비면 세로로 늘려 바닥까지 채운다 — 시안 비율대로 옮기면 결론 띠가 쪽마다 6.0~6.95in 에서 끝나 그 아래가 비었다(쪽 높이의 6~12%, R148).
    keymsg·머리 틀은 그대로, 본문 위 끝 T 를 기준으로 y → T + (y-T)·k. 칸·글 상자·표는 함께 늘리고, 그림·묶음·작은 아이콘은 비율을 지키려 크기는 두고 가운데만 옮긴다"""
    if prs.slide_width <= prs.slide_height:
        return 0
    filled = []
    tgt = int(target * IN)

    def one(no, s):
        items = [sh for sh in _placed(s.shapes) if not sh.name.startswith("pd_frame") and sh.name != "keymsg"
                 and sh.top < tgt and sh.top > int(0.75 * IN) and not (sh.width > prs.slide_width * 0.9 and sh.height > prs.slide_height * 0.8)]
        if len(items) < 3:
            return
        top = min(sh.top for sh in items)
        low = max(sh.top + sh.height for sh in items)
        gap = tgt - low
        if gap < int(min_gap * IN) or low <= top:
            return
        k = (tgt - top) / (low - top)
        if k > max_k:
            return   # 내용이 아주 적은 쪽 — 늘리면 어색하다
        for sh in items:
            y, h = sh.top, sh.height
            small = sh.width < int(0.75 * IN) and h < int(0.75 * IN)
            keep = _stype(sh) in (6, 13) or small or (getattr(sh, "has_chart", False) and False)
            if keep:
                sh.top = int(top + (y + h / 2 - top) * k - h / 2)
                continue
            sh.top = int(top + (y - top) * k)
            if getattr(sh, "has_table", False) and sh.has_table:
                for row in sh.table.rows:
                    row.height = int(row.height * k)
            sh.height = int(h * k)
        filled.append(no)
    _each_slide(prs, one, "본문 바닥까지 채우기")
    return len(filled)


def run(src, dst=None, mock_dir=None, log=print):
    from pptx import Presentation
    prs = Presentation(src)
    FAILS.clear()
    out = []

    def step(label, fn, dflt, *a, **k):
        """단계 하나 — 예외가 나도 나머지 단계와 저장은 그대로. 건너뛴 단계는 WARN 줄로 확인 목록에 올린다(R164). 예전엔 도형 하나의 예외로 저장 전에 죽어 마감 전체가 빠졌다"""
        try:
            return fn(*a, **k)
        except Exception as e:
            FAILS.append((0, label, f"{type(e).__name__}: {str(e)[:120]}"))
            return dflt

    if mock_dir:
        ch = step("카드 바탕색 대조", match_fills, [], prs, mock_dir, log=log)
        out.append(f"카드 바탕색 시안대로 {len(ch)}곳")
        for k, nm, a, b in ch[:40]:
            log(f"  {k}쪽 {nm}: #{a} → #{b}")
    nth, nref = step("테마 그림자 끊기", kill_theme_shadows, (0, 0), prs)
    nsh = step("진한 그림자 지우기", drop_heavy_shadows, 0, prs)
    out.append(f"테마 그림자 끊음(테마 {nth} · 도형 {nref}) · 진한 그림자 {nsh}개 지움")
    ncell, ntbl = step("표 칸 정리", fix_tables, (0, 0), prs)
    out.append(f"표 칸 순서 {ncell}칸 · 검은 격자 스타일 {ntbl}표")
    memos = step("메모 줄 지우기", strip_memos, [], prs)
    out.append(f"메모 줄 {sum(1 for m in memos if m[2])}개 지움")
    for no, t, cut in memos:
        log(f"  {no}쪽 메모{'' if cut else '(도형 전체가 메모 — 그대로, 손으로)'}: {t}")
    out.append(f"강조 상자 {step('강조 상자', fix_highlights, 0, prs)}개 · 줄바꿈 내어쓰기 {step('내어쓰기', hang_bullets, 0, prs)}문단 · 아이콘 세로 가운데 {step('아이콘 가운데', center_icons, 0, prs)}개 · 앞장 그림 가장자리 {step('앞장 그림 가장자리', bleed_fronts, 0, prs)}개")
    lt = step("라벨 글", fix_label_text, (0, 0, 0), prs)
    out.append(f"라벨 글자색 대비 {lt[0]}곳 · 줄어든 라벨 글 키움 {lt[1]}개 · 꺾인 짧은 라벨 넓힘 {lt[2]}개")
    tiny = step("7pt 아래 글", lift_tiny, (0, 0), prs)
    out.append(f"쪽 밖 상자 {step('쪽 밖 상자', clamp_right, 0, prs)}개 · 같은 칸 글 크기 {step('같은 칸 글 크기', unify_siblings, 0, prs)}곳 · 7pt 아래 글 키움 {tiny[0]}개(남음 {tiny[1]}) · 결론 띠 글 {step('결론 띠 글', unify_bands, 0, prs)}곳 · 본문 바닥까지 채움 {step('바닥 채우기', fill_height, 0, prs)}쪽")
    out.append(f"좁은 칸 넓힘 {len(step('좁은 칸 넓히기', wrap_cards, [], prs))}곳 · 글 덮은 알약 풂 {len(step('알약 풀기', clear_pills, [], prs))}곳 · 글 뚫은 구분선 옮김 {len(step('구분선 옮기기', move_dividers, [], prs))}개")   # 바닥 채우기 뒤 — 최종 자리로 잰다
    prs.save(dst or src)
    for no, label, err in FAILS:
        log(f"WARN: {no}|마감 단계 건너뜀|{label} — {err}")
    log(" · ".join(out))
    return out


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    args = [a for a in sys.argv[1:]]
    mock = args[args.index("--mockup") + 1] if "--mockup" in args else None
    pos = [a for i, a in enumerate(args) if not a.startswith("--") and (i == 0 or args[i - 1] != "--mockup")]
    if not pos:
        sys.exit(__doc__)
    run(pos[0], pos[1] if len(pos) > 1 else None, mock)
