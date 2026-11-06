# -*- coding: utf-8 -*-
"""초안 다듬기(polish)의 결정적 단계 — AI 없이. '다듬기는 원본 글자를 가늘게·작게 만들지 않는다'를 코드로 지킨다.

2026-10-28 사례(21장 초안, 고른 서체 G마켓 산스·프리젠테이션): 다듬은 결과가 원본보다 글자가 가늘고 작아 보였다.
  재 보니(40px 에서 같은 글을 그린 잉크 양 / 글 폭) 원본 서체가 훨씬 굵고 넓다:
    a시월구일2 잉크 14.5·폭 984 · a시월구일3 17.2·985 · KoPub돋움체 Bold 11.0·888
    프리젠테이션 4 Regular 6.5·746 · 6 SemiBold 8.8·774 · 8 ExtraBold 11.2·776
  그런데 마무리(finalize --polish)는 모르는 서체를 '보통(단계 1)'으로 읽어 a시월구일2(굵음)·KoPub Bold 를 프리젠테이션 4 Regular 로,
  크기는 pt 그대로 바꿨다 → 굵기 절반 이하·글 폭 76% — "얇고 작아 가독성이 떨어진다".

  polish_prep.py fonts <src> <dst>          고른 서체로 바꾸되 원본과 같은 굵기(잉크 농도)·같은 글 폭이 되게 단계·크기를 고른다
                                            (크기는 원본의 1.0~1.2배, 상자를 넘치면 그만큼 덜 키운다). 굵게(b) 속성은 진짜 굵은 서체로.
  polish_prep.py check <원본> <결과> [--slides 8,9] [--json out.json]
                                            원본과 견준 가독성 판정 — 같은 글의 굵기·크기가 원본과 비슷한가(아니면 FAIL 줄, 끝 코드 1)
  polish_prep.py guard <원본> <결과> <dst>   check 에서 걸린 글을 원본 기준으로 다시 맞춘다(fonts 와 같은 규칙)
  polish_prep.py breaks <src> <dst>         이상한 줄바꿈 정리 — 짧은 글(뱃지·라벨)이 꺾임 · 괄호가 쪼개짐 · 괄호만 다음 줄 · 어절 끊김
                                            → 상자를 넓혀(옆 도형·장 밖을 넘지 않게) 한 줄로, 안 되면 공백에서 줄바꿈. 같은 꼴 런은 합친다
  polish_prep.py post <원본> <src> <dst>    마무리 뒤 한 번에: guard → breaks → check. 'WARN: 장|제목|설명' 줄을 낸다(worker 가 확인 목록에)
  polish_prep.py measure                    templates/polish/font_ink.json 을 이 PC 서체로 다시 잰다(손으로 고치지 말 것)

판정 기준(사용자 2026-10-28 "초안과 글자 굵기와 크기가 비슷하게 — 한마디로 다듬어지는 거야"):
  같은 글(문단 글이 같음)마다 글 폭 비율 0.92~1.25, 굵기(잉크 농도) 비율 0.88 이상. 이 밖이면 '가독성 후퇴' 로 FAIL."""
import copy, json, math, os, re, sys
sys.argv, _ARGV = sys.argv[:1], sys.argv
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vcenter as V
import textlines as T
import fontset
sys.argv = _ARGV
from pptx import Presentation
from pptx.oxml.ns import qn

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
HERE = os.path.dirname(os.path.abspath(__file__))
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
INK_JSON = os.path.join(HERE, "templates", "polish", "font_ink.json")   # fonts/ 는 .gitignore·배포가 정해진 표만 올린다 — templates 는 통째로 올라간다
SAMPLE = "공공 마이데이터 유통 시스템 행정안전부 60개 보유기관"
FAKE_BOLD = 1.18      # 가짜 굵게(b=1)는 획이 이만큼 두꺼워 보인다(PowerPoint·LibreOffice 렌더 어림)
SMAX = 1.2            # 서체가 좁아 글 폭을 맞추려 키울 때 원본 크기의 최대 배수
SMAX_TABLE = 1.1      # 표 칸은 넘침 계산을 안 하므로 덜 키운다
W_MIN, W_MAX, D_MIN = 0.80, 1.25, 0.88   # 판정: 글 폭 비율·굵기 비율 — 폭 하한 0.92 → 0.80(10-29: a시월구일 5% 작게 + 넘치면 1pt 씩 줄여 맞추기, polish_fix)
SIWOL_K = 0.95        # a시월구일은 같은 크기에서 이전 서체보다 크게 보인다 — 5% 작게(사용자 10-29)
D_PICK = 0.90         # 고를 때: 원본 굵기의 90% 밑인 단계는 벌점(판정 하한 D_MIN 보다 조금 위)
KEY_PT = 20.0         # finalize --polish 가 20pt 이상 글을 제목 서체로 바꾼다 — 같은 경계를 쓴다
MEMO = {"FFFF00", "FFFFCC", "FFFF99", "FFFF87"}


# ───────────────────────── 서체 굵기·폭 수치(40px 에서 SAMPLE 을 그린 잉크 양 · 글 폭)
def _measure_file(path):
    from PIL import Image, ImageDraw, ImageFont
    ft = ImageFont.truetype(path, 40)
    w = ft.getlength(SAMPLE)
    im = Image.new("L", (int(w) + 20, 70), 255)
    ImageDraw.Draw(im).text((5, 5), SAMPLE, font=ft, fill=0)
    ink = sum(255 - p for p in im.tobytes()) / 255 / 1000
    return {"ink": round(ink, 2), "w": round(w, 1)}


_INK = None


def _table():
    global _INK
    if _INK is None:
        try:
            _INK = {k.lower(): v for k, v in json.load(open(INK_JSON, encoding="utf-8")).get("faces", {}).items()}
        except Exception:
            _INK = {}
    return _INK


def _file_of(face):
    key = (face or "").lower()
    p = fontset.INSTALLED.get(key)
    if p and os.path.isfile(p):
        return p
    for fid, (_, f, fn) in fontset.TITLES.items():
        if f.lower() == key and os.path.isfile(os.path.join(HERE, "fonts", fn)):
            return os.path.join(HERE, "fonts", fn)
    for fid, (_, faces, files) in fontset.BODIES.items():
        for f, fn in zip(faces, files or ()):
            if f.lower() == key and os.path.isfile(os.path.join(HERE, "fonts", fn)):
                return os.path.join(HERE, "fonts", fn)
    return None


def metric(face):
    """{'ink','w','d'} — 표(font_ink.json) → 이 PC 서체 파일로 재기 → 모름(None). d = 잉크/폭(획 농도, 크기와 무관)"""
    if not face:
        return None
    t = _table()
    m = t.get(face.lower())
    if m is None:
        p = _file_of(face)
        if p:
            try:
                m = _measure_file(p)
            except Exception:
                m = None
        t[face.lower()] = m
    if not m:
        return None
    return dict(m, d=m["ink"] / max(1.0, m["w"]))


def vis(face, pt, bold):
    """눈에 보이는 (글 폭 = 서체 폭×pt, 굵기 = 획 농도×가짜 굵게). 모르는 서체는 None"""
    m = metric(face)
    if not m:
        return None
    return m["w"] / 40.0 * pt, m["d"] * (FAKE_BOLD if bold else 1.0)


# ───────────────────────── 글 런 읽기(서체·크기 물림 포함)
class Deck:
    def __init__(self, prs):
        self.prs = prs
        self.theme = {}
        try:
            from pptx.opc.constants import RELATIONSHIP_TYPE as RT
            th = prs.slide_masters[0].part.part_related_by(RT.THEME)
            from lxml import etree
            root = etree.fromstring(th.blob)
            for kind, tag in (("mj", "majorFont"), ("mn", "minorFont")):
                f = root.find(".//" + A + tag)
                if f is not None:
                    ea = f.find(A + "ea")
                    la = f.find(A + "latin")
                    self.theme[kind] = (ea.get("typeface") if ea is not None and ea.get("typeface") else None) or (la.get("typeface") if la is not None else None)
        except Exception:
            pass

    def face(self, *rprs):
        for rp in rprs:
            if rp is None:
                continue
            for tag in ("ea", "latin"):
                x = rp.find(A + tag)
                if x is not None and x.get("typeface"):
                    tf = x.get("typeface")
                    if tf.startswith("+"):
                        return self.theme.get("mj" if tf.startswith("+mj") else "mn")
                    return tf
        return self.theme.get("mn")


def _lst_def(p):
    tx = p.getparent()
    lst = tx.find(A + "lstStyle") if tx is not None else None
    ppr = p.find(A + "pPr")
    lvl = int(ppr.get("lvl", "0")) if ppr is not None else 0
    return T._defrpr(lst, lvl) if lst is not None else None


def _is_memo_shape(el):
    while el is not None and el.tag not in (qn("p:sp"), qn("p:graphicFrame")):
        el = el.getparent()
    return el is not None and el.tag == qn("p:sp") and T.is_memo(el)


def _in_table(el):
    while el is not None:
        if el.tag == A + "tc":
            return True
        el = el.getparent()
    return False


def runs_of(deck, slide):
    """[(문단, run, rPr, 서체, 크기 pt, 크기를 아는가, 굵게)] — 메모 도형은 뺀다"""
    out = []
    for p in slide._element.iter(A + "p"):
        if _is_memo_shape(p):
            continue
        end, ldef = p.find(A + "endParaRPr"), _lst_def(p)
        for r in p:
            if r.tag not in (A + "r", A + "fld"):
                continue
            rp = r.find(A + "rPr")
            known = any(x is not None and x.get("sz") for x in (rp, end, ldef))
            pt = V._sz(rp, ldef, end)   # 런은 상자 서식(lstStyle)을 물려받는다 — 문단 끝 표시(endParaRPr)는 빈 문단 자리일 뿐(17쪽 2pt, R130)
            bold = any(x is not None and x.get("b") == "1" for x in (rp,)) or (rp is None or rp.get("b") is None) and ldef is not None and ldef.get("b") == "1"
            out.append((p, r, rp, deck.face(rp, ldef, end), pt, known, bold))
    return out


def _norm(s):
    return re.sub(r"\s+", "", s or "")


def para_text(p):
    return "".join((r.findtext(A + "t") or "") for r in p if r.tag in (A + "r", A + "fld"))


# ───────────────────────── 서체 고르기 — 원본 굵기·폭에 맞는 고른 서체의 단계와 크기
def body_cands(do=None):
    """고를 수 있는 본문 단계. 가장 옅은 단계(0 — fonts.json 이 10-28 에 2 ExtraLight·200 에서 3 Light·300 으로 올렸다)는
    원본 글이 정말 옅을 때(획 농도가 단계 1 의 80% 미만)만 쓴다 — 이 초안의 본문은 거의 다 4 Regular 이상 굵기다(사용자 '200 굵기 쓰지 않음')"""
    lv = [1, 2, 3]
    m1 = metric(fontset.face(1))
    if do is not None and m1 and do < m1["d"] * 0.8:
        lv = [0] + lv
    return [(x, fontset.face(x)) for x in lv]


def _title_face(face):
    return bool(face) and (face in fontset.TITLE_FACES or bool(re.match(r"^(G마켓|Gmarket)", face, re.I)))


def plan_run(face, pt, bold, table=False, key=False):
    """(새 서체, 새 크기 배수). key=True(키메시지·앞장 큰 글 — key_set)만 제목 서체, 나머지는 본문 서체 단계 중에서.
    후보마다 '원본 글 폭에 맞추려 키울 배수'(1.0~SMAX, 본문은 20pt 밑)를 정하고, 그때의 글 폭 비율·굵기 비율이 1 에 가장 가까운 것을
    고른다(굵기는 원본의 D_PICK 이상만). 원본 서체 수치를 모르면 이름으로 단계만.
    예전에는 원본이 G마켓이면 그대로 두고 본문 후보에도 제목 서체를 넣어, 본문 곳곳이 G마켓으로 남았다(11-02 바이오 2차 1,169곳, R183)"""
    title = key
    if title and _title_face(face):
        return face, 1.0
    smax = SMAX_TABLE if table else SMAX
    mo = vis(face, pt, bold)
    if mo is None:   # 모르는 서체 — 이름의 굵기 낱말(fontset.LEVEL)로 단계, 굵게면 한 단계 위
        if title:
            return fontset.KEY_FONT, 1.0
        lv = max(1, fontset.LEVEL.get(face, 1) if face else 1)
        if bold or _title_face(face):   # 제목 서체(굵은 글자)였던 본문은 굵은 단계로
            lv = 3 if lv >= 2 or _title_face(face) else 2
        return fontset.face(lv), 1.0
    wo, do = mo
    # 역할 지도 — 원본이 굵게(b=1 또는 Bold 이름)면 본문 단계 2 이상(국문 통일 a시월구일 3·4, 사용자 10-28 "원본 bold → 강조·굵음 단계"),
    # 보통 글은 단계 1(기본) 이상. 그 안에서 원본 굵기·글 폭에 가장 가까운 단계를 고른다
    body = [(lv, f) for lv, f in body_cands(do) if not (bold and lv < 2)]
    cands = [fontset.KEY_FONT] if title else [f for _, f in body]
    best = None
    opts = [(f, False) for f in cands]   # 본문 글에 제목 서체(+굵게)는 후보가 아니다 — 키메시지 외에는 본문 서체(사용자 11-02, R183)
    for f, fb in opts:
        m = metric(f)
        if not m or not pt:
            continue
        if fb:
            m = dict(m, d=m["d"] * FAKE_BOLD)
        need = wo / (m["w"] / 40.0 * pt)
        cap = smax if title else min(smax, (KEY_PT - 0.5) / pt)
        sc = max(1.0, min(max(1.0, cap), need))
        if table:   # 표 칸은 넘침을 못 재므로 글 폭을 원본과 똑같이(넓은 서체면 그만큼 pt 를 줄이되 0.85배까지) — 칸 안 줄바꿈이 원본 그대로(16쪽 '신용보증재단중앙회')
            sc = max(0.85, min(smax, need))
        wr, dr = m["w"] / 40.0 * pt * sc / wo, m["d"] / do
        score = abs(math.log(wr)) + abs(math.log(dr)) + (0.6 if dr < D_PICK else 0.0) + (0.0 if bold or not fb else 0.15)
        if best is None or score < best[0]:
            best = (score, f, sc, fb)
    if best is None:
        return (fontset.KEY_FONT if title else fontset.face(2 if bold else 1)), 1.0
    sc = best[2] * (SIWOL_K if best[1].startswith("a시월구일") else 1.0)
    if best[3]:
        return best[1] + "|b", sc   # 굵게 유지 표시 — set_face 가 떼어 b=1 로
    return best[1], sc


def set_face(rp, face):
    """서체를 latin·ea·cs 에. 이름 끝 '|b' 표시는 '굵게 유지'(제목 서체 + b=1 — 본문 서체로는 원본 굵기에 못 미칠 때)"""
    keep_b = face.endswith("|b")
    face = face.replace("|b", "")
    if keep_b:
        rp.set("b", "1")
    else:
        rp.attrib.pop("b", None)
    before = [A + t for t in ("ln", "noFill", "solidFill", "gradFill", "blipFill", "pattFill", "grpFill", "effectLst", "effectDag", "highlight", "uLnTx", "uLn", "uFillTx", "uFill")]
    for tag in ("latin", "ea", "cs"):
        el = rp.find(A + tag)
        if el is None:
            el = rp.makeelement(A + tag, {})
            prev = [c for c in rp if c.tag in before or c.tag in (A + "latin", A + "ea")]
            if prev:
                prev[-1].addnext(el)
            else:
                rp.insert(0, el)
        el.set("typeface", face)
        for k in ("panose", "pitchFamily", "charset"):
            el.attrib.pop(k, None)


def _rpr(r):
    rp = r.find(A + "rPr")
    if rp is None:
        rp = r.makeelement(A + "rPr", {})
        r.insert(0, rp)
    return rp


def _half(x):
    return round(x * 2) / 2


FRONT_PT = 40.0   # 이만한 글이 있는 장은 앞장(간지·끝 장 큰 제목 48~60pt)


def key_set(deck, slide):
    """제목 서체(G마켓)를 써도 되는 글 런 — 요소 집합(lxml 요소는 잡아 둬야 같은 객체로 비교된다. id() 는 대리 객체가 사라지면 바뀐다).
    본문 장: 키메시지 상자 안 글만. 앞장(키메시지가 없거나 40pt 이상 큰 제목이 있는 장 — 표지·목차·간지·끝 장): 20pt 이상 글.
    나머지(머리 띠 제목·카드 제목·숫자 강조 등)는 모두 본문 서체 — 사용자 2026-11-02 "키메시지 외에는 지마켓을 안 쓰고 a시월구일"(R183)"""
    sw, shh = deck.prs.slide_width / V.EMU, deck.prs.slide_height / V.EMU
    keys = {r for b in keymsg_boxes(slide, sw, shh) for r in b.tx.iter(A + "r")}
    runs = runs_of(deck, slide)
    if not keys or any(x[4] >= FRONT_PT for x in runs):
        return {x[1] for x in runs if x[4] >= KEY_PT}
    return keys


def apply_runs(deck, slide, only=None):
    """장 하나의 글 런을 고른 서체로 — only(런 id 집합)를 주면 그 런만. 반환 {run 요소: (원래 크기 pt, 고른 배수, 아는가)}"""
    done = {}
    keys = key_set(deck, slide)
    for p, r, rp, face, pt, known, bold in runs_of(deck, slide):
        if only is not None and id(r) not in only:
            continue
        nf, s = plan_run(face, pt, bold, table=_in_table(p), key=r in keys)
        rp = _rpr(r)
        set_face(rp, nf)   # 굵기는 서체 이름으로(진짜 굵은 서체) — b 는 떼거나(마무리가 한 단계 더 올리지 않게) 제목 서체일 때만 남긴다
        if known and abs(s - 1.0) > 0.01:
            new = _half(pt * s)
            if pt < KEY_PT <= new and not nf.startswith(fontset.KEY_FONT):     # 마무리가 20pt 이상을 제목 서체로 바꾼다 — 본문은 그 밑에서 멈춘다
                new = KEY_PT - 0.5
            rp.set("sz", str(int(round(new * 100))))
        # 넘칠 때 줄여도 되는 하한 — 새 서체가 원본보다 넓으면(a시월구일은 KoPub 보다 11% 넓다) 글 폭이 원본과 같아지는 크기까지만(최소 0.85배).
        # 원본 글 폭 밑으로는 줄이지 않는다(사용자 10-28 '원본보다 작아 보이지 않게')
        mo, mn = vis(face, pt, bold), metric(nf.replace("|b", ""))
        smin = max(0.85, min(1.0, mo[0] / (mn["w"] / 40.0 * pt))) if (mo and mn and pt) else 1.0
        done[r] = (pt, s, known, smin)
    return done


def _boxes_with(slide):
    """textlines 상자 → 그 안의 run 요소들"""
    out = []
    for b in T.boxes(slide):
        rs = [r for p in b.tx.findall(A + "p") for r in p if r.tag in (A + "r", A + "fld")]
        out.append((b, rs))
    return out


def _key(el):
    return el.getroottree().getpath(el)


def _box_probs(b):
    """문제 집합 — textlines 문제 + 문단별 줄 수. 원본도 '어절' 이 있던 상자에서 줄이 늘어난 것을 놓쳤다(12쪽 띠 제목이 두 줄로)"""
    out = {(kk, pi) for kk, pi, _, _ in T.problems(b)}
    lay, _ = b.layout()
    out |= {("줄", pi, len(ls)) for pi, (pa, ls) in enumerate(lay) if pa.text.strip()}
    # 한 줄로 늘어놓은 글 폭(pt) — 계산상 원본도 꺾이던 상자(PowerPoint 는 한 줄로 그림)에서 글이 더 넓어진 것을 잡는다(12쪽 띠 제목)
    out |= {("폭", pi, round(pa.width_of(0, len(pa.chars)), 1), round(b.box_w - pa.mar, 1)) for pi, (pa, ls) in enumerate(lay) if pa.text.strip()}
    return out


def _worse(now, base):
    """새 문제가 생겼나 — textlines 문제가 새로 생기거나, 어느 문단이든 줄 수가 원본보다 늘었으면"""
    lines0 = {x[1]: x[2] for x in base if x[0] == "줄"}
    wide0 = {x[1]: x[2] for x in base if x[0] == "폭"}
    for x in now:
        if x[0] == "줄":
            if x[2] > lines0.get(x[1], x[2]):
                return True
        elif x[0] == "폭":   # 글이 원본보다 2% 넘게 넓어졌고 상자 폭의 90% 를 넘으면 — 원본에서 겨우 한 줄이던 글이 꺾일 수 있다
            w0 = wide0.get(x[1], x[2])
            if x[2] > w0 * 1.02 and x[2] > x[3] * 0.9:
                return True
        elif x not in base:
            return True
    return False


def _probs(slide, box_el):
    k = _key(box_el)
    for b in T.boxes(slide):
        if _key(b.el) == k:
            return _box_probs(b)
    return set()


def _before(slide):
    return {_key(b.el): _box_probs(b) for b in T.boxes(slide)}


def _set_lnspc(tx, pct):
    for p in tx.findall(A + "p"):
        ppr = p.find(A + "pPr")
        if ppr is None:
            ppr = p.makeelement(A + "pPr", {})
            p.insert(0, ppr)
        ls = ppr.find(A + "lnSpc")
        if ls is None:
            ls = ppr.makeelement(A + "lnSpc", {})
            ppr.insert(0, ls)
        for c in list(ls):
            ls.remove(c)
        ls.append(ls.makeelement(A + "spcPct", {"val": str(int(pct * 1000))}))


def fit_back(slide, done, before):
    """키운 글이 상자를 넘치거나 새 어절 끊김이 생기면 — 먼저 줄 간격을 좁혀 보고(95→85%, 크기·굵기는 원본 수준 그대로),
    그래도 넘치면 그 상자만 덜 키운다(키운 몫을 4단계로 줄여 본다)"""
    n = 0
    for b, rs in _boxes_with(slide):
        mine = [r for r in rs if r in done and done[r][2]]   # 서체만 바꾼 글도 — 새 서체가 넓어 넘칠 수 있다(9쪽 국가보훈부 카드 목록)
        if not mine:
            continue
        base = before.get(_key(b.el), set())
        if not _worse(_probs(slide, b.el), base):
            continue
        n += 1
        only_v = all(x[0] == "넘침" for x in _probs(slide, b.el) - base if x[0] not in ("줄", "폭"))
        old_ls = [copy.deepcopy(p.find(A + "pPr")) if p.find(A + "pPr") is not None else None for p in b.tx.findall(A + "p")]
        if only_v and not any(p.find(A + "pPr") is not None and p.find(A + "pPr").find(A + "lnSpc") is not None for p in b.tx.findall(A + "p")):
            for pct in (95, 90, 85):
                _set_lnspc(b.tx, pct)
                if not _worse(_probs(slide, b.el), base):
                    break
            if not _worse(_probs(slide, b.el), base):
                continue
            for p, o in zip(b.tx.findall(A + "p"), old_ls):   # 줄 간격으로 안 되면 되돌리고 크기로
                cur = p.find(A + "pPr")
                if cur is not None:
                    p.remove(cur)
                if o is not None:
                    p.insert(0, o)
        if not only_v:   # 가로로 넘치거나 새로 꺾이면 — 상자를 넓혀 본다(옆 글 상자·장 밖은 넘지 않게)
            sw = slide.part.package.presentation_part.presentation.slide_width / V.EMU
            others = [(o.sh.Left, o.sh.Top, o.sh.Width, o.sh.Height) for o in T.boxes(slide) if _key(o.el) != _key(b.el)]
            if widen(slide, b, sw, others, ok=lambda: not _worse(_probs(slide, b.el), base)):
                continue
        for k in (0.75, 0.5, 0.25, 0.0, -0.5, -1.0):   # 키운 몫을 줄이고, 그래도 넘치면 하한(smin)까지
            for r in mine:
                pt, s, _, smin = (done[r] + (1.0,))[:4]
                f = 1 + (s - 1) * k if k >= 0 else 1 + (smin - 1) * (-k)
                new = max(pt * smin, pt * f)
                new = round(new * 4) / 4 if new < pt else _half(new)
                if pt < KEY_PT <= new and not _is_key(r):
                    new = KEY_PT - 0.5
                _rpr(r).set("sz", str(int(round(new * 100))))
            if not _worse(_probs(slide, b.el), base):
                break
    return n


def _is_key(r):
    rp = r.find(A + "rPr")
    ea = rp.find(A + "ea") if rp is not None else None
    return ea is not None and ea.get("typeface") == fontset.KEY_FONT


def fonts_cmd(src, dst, slides=None):
    prs = Presentation(src)
    deck = Deck(prs)
    nrun = nfit = 0
    for no, slide in enumerate(prs.slides, 1):
        if slides and no not in slides:
            continue
        before = _before(slide)
        done = apply_runs(deck, slide)
        nrun += len(done)
        nfit += fit_back(slide, done, before)
    prs.save(dst)
    print(f"서체 맞춤 — 글 {nrun}곳을 {fontset.NAME}·{fontset.KEY_FONT} 로(원본 굵기·글 폭 유지), 넘쳐서 덜 키운 상자 {nfit}개")


# ───────────────────────── 판정 — 원본과 같은 글의 굵기·크기 비교
def para_vis(deck, slide):
    """{정규화한 글: [(글 폭 평균, 굵기 평균, 글자 수)]} — 같은 글이 여러 번이면 순서대로"""
    acc = {}
    rows = runs_of(deck, slide)
    by_p = {}
    for p, r, rp, face, pt, known, bold in rows:
        by_p.setdefault(p, []).append((r, face, pt, bold))
    for p, lst in by_p.items():
        key = _norm(para_text(p))
        if len(key) < 2:
            continue
        sw = sd = n = 0.0
        unknown = False
        for r, face, pt, bold in lst:
            t = _norm(r.findtext(A + "t"))
            if not t:
                continue
            v = vis(face, pt, bold)
            if v is None:
                unknown = True
                continue
            sw += v[0] * len(t)
            sd += v[1] * len(t)
            n += len(t)
        if n and not unknown:
            acc.setdefault(key, []).append((sw / n, sd / n, int(n)))
    return acc


def check(orig, result, slides=None):
    """[(장, 글, 폭 비율, 굵기 비율, 판정)] — 판정 'ok' | '얇음' | '작음' | '너무 큼'"""
    po, pr = Presentation(orig), Presentation(result)
    do, dr = Deck(po), Deck(pr)
    out = []
    for no, (so, sr) in enumerate(zip(po.slides, pr.slides), 1):
        if slides and no not in slides:
            continue
        vo, vr = para_vis(do, so), para_vis(dr, sr)
        for key, lst in vr.items():
            olst = vo.get(key)
            if not olst:
                continue
            for i, (w, d, n) in enumerate(lst):
                ow, od, _ = olst[min(i, len(olst) - 1)]
                wr, dr_ = w / ow, d / od
                verdict = "얇음" if dr_ < D_MIN else "작음" if wr < W_MIN else "너무 큼" if wr > W_MAX else "ok"
                out.append((no, key, round(wr, 3), round(dr_, 3), verdict))
    return out


def check_emphasis(orig, result, slides=None):
    """강조 지도 — 원본 한 장 안에서 굵기가 뚜렷이 다른 글(획 농도 1.12배 이상: 굵게·굵은 서체로 강조한 이름·제목)이
    결과에서도 더 굵은가. 다 같은 굵기로 뭉개지면(19쪽 조직도 이름이 본문과 같은 굵기) '강조 흐려짐'. [(장, 굵은 글, 보통 글)]"""
    po, pr = Presentation(orig), Presentation(result)
    do, dr = Deck(po), Deck(pr)
    out = []
    for no, (so, sr) in enumerate(zip(po.slides, pr.slides), 1):
        if slides and no not in slides:
            continue
        vo, vr = para_vis(do, so), para_vis(dr, sr)
        keys = [k for k in vo if k in vr]
        mk = metric(fontset.KEY_FONT)
        top = (mk["d"] if mk else 0) * 0.97   # 고른 서체의 가장 굵은 값에 닿은 글은 더 굵게 할 수 없다(포화) — 흐려짐으로 세지 않는다
        for a in keys:
            for b in keys:
                if a == b:
                    continue
                cw = vo[a][0][0] / max(1e-6, vo[b][0][0])   # 글자당 폭(=크기) 비 — 크기가 크게 다른 글(제목 vs 본문)은 크기로 위계가 산다. 굵기 위계는 비슷한 크기끼리만 본다
                if 0.77 <= cw <= 1.3 and vo[a][0][1] >= vo[b][0][1] * 1.12 and not vr[a][0][1] > vr[b][0][1] * 1.03 and vr[a][0][1] < top:
                    out.append((no, a, b))
    return out


def _level_of(face):
    for lv in range(3, -1, -1):
        if fontset.face(lv) == face:
            return lv
    return None


def emphasize(orig, result, dst):
    """강조 되살리기 — 원본에서 비슷한 크기의 다른 글보다 뚜렷이 굵던 글이 결과에서 같은 굵기로 뭉개졌으면
    그 글만 본문 단계를 한 단계 올린다(2→3→4, 제목 서체로는 바꾸지 않는다). 반환: 올린 문단 수"""
    emp = check_emphasis(orig, result)
    want = {}
    for no, x, y in emp:
        want.setdefault(no, set()).add(x)
    pr = Presentation(result)
    n = 0
    for no, slide in enumerate(pr.slides, 1):
        ks = want.get(no)
        if not ks:
            continue
        for p in slide._element.iter(A + "p"):
            if _norm(para_text(p)) not in ks or _is_memo_shape(p):
                continue
            up = False
            for r in p:
                if r.tag not in (A + "r", A + "fld"):
                    continue
                rp = _rpr(r)
                ea = rp.find(A + "ea")
                lv = _level_of(ea.get("typeface")) if ea is not None else None
                if lv is not None and lv < 3:
                    nxt = next((fontset.face(k) for k in range(lv + 1, 4) if fontset.face(k) != fontset.face(lv)), None)
                    if nxt:
                        set_face(rp, nxt)
                        up = True
            n += up
    pr.save(dst)
    return n


def check_summary(rows):
    bad = [r for r in rows if r[4] != "ok"]
    return bad, (len(rows) - len(bad), len(rows))


def guard_cmd(orig, result, dst):
    """판정에 걸린 글을 원본 런의 서체·크기 기준으로 다시 맞춘다"""
    po, pr = Presentation(orig), Presentation(result)
    do, dr = Deck(po), Deck(pr)
    nfix = 0
    for no, (so, sr) in enumerate(zip(po.slides, pr.slides), 1):
        orig_runs = {}
        for p, r, rp, face, pt, known, bold in runs_of(do, so):
            orig_runs.setdefault(_norm(para_text(p)), []).append((face, pt, bold))
        before = _before(sr)
        done = {}
        keys = key_set(dr, sr)
        vo, vr = para_vis(do, so), para_vis(dr, sr)
        for p in list(sr._element.iter(A + "p")):
            key = _norm(para_text(p))
            if key not in vo or key not in vr or _is_memo_shape(p):
                continue
            (ow, od, _), (w, d, _) = vo[key][0], vr[key][0]
            if d / od >= D_MIN and W_MIN <= w / ow <= W_MAX:
                continue
            ofs = orig_runs.get(key) or []
            if not ofs:
                continue
            face, opt, bold = max(ofs, key=lambda x: x[1])   # 문단의 대표(가장 큰) 원본 런
            nf, s = plan_run(face, opt, bold, table=_in_table(p), key=any(r in keys for r in p))
            new = _half(opt * s)
            if opt < KEY_PT <= new and not nf.startswith(fontset.KEY_FONT):
                new = KEY_PT - 0.5
            for r in p:
                if r.tag not in (A + "r", A + "fld"):
                    continue
                rp = _rpr(r)
                set_face(rp, nf)
                cur = V._sz(rp, _lst_def(p), p.find(A + "endParaRPr"))
                if cur < new:
                    rp.set("sz", str(int(round(new * 100))))
                done[r] = (cur, new / max(0.1, cur), True, 1.0)
            nfix += 1
        if done:
            fit_back(sr, done, before)
    pr.save(dst)
    return nfix


# ───────────────────────── 이상한 줄바꿈
OPEN, CLOSE = "([{〈《「『（［", ")]}〉》」』）］"
SHORT = 16     # 이 글자 수 이하의 한 문단(뱃지·라벨·장 제목 꼬리)은 한 줄이어야 한다
UNIT = re.compile(r"(\d)[  ]+(개|종|건|명|곳|회|배|억|만|천|원|년|월|일|주|위|차|%)(?![가-힣])")


def break_kinds(box):
    """[(종류, 문단 번호)] — 어절 · 괄호(괄호 안에서 끊김) · 괄호줄(괄호만 다음 줄) · 짧은글(짧은 글이 두 줄)"""
    out = []
    lay, _ = box.layout()
    for pi, (pa, ls) in enumerate(lay):
        txt = pa.text
        if not txt.strip() or len(ls) < 2:
            continue
        soft = [b for (a, b) in ls[:-1] if b not in pa.hard]
        if not soft:
            continue
        depth, d = [], 0
        for c in txt:
            if c in OPEN:
                d += 1
            elif c in CLOSE:
                d = max(0, d - 1)
            depth.append(d)
        for k, (a, b) in enumerate(ls[:-1]):
            nxt = ls[k + 1]
            if nxt[0] in pa.hard:
                continue
            if b < len(depth) and depth[max(0, b - 1)] > 0 and depth[min(len(depth) - 1, b)] > 0:
                out.append(("괄호", pi))
            line = txt[nxt[0]:nxt[1]].strip()
            if line and line[0] in OPEN and line[-1] in CLOSE and len(line) <= 10 and len(ls) == k + 2:
                out.append(("괄호줄", pi))
        if len(_norm(txt)) <= SHORT and not pa.hard:
            out.append(("짧은글", pi))
    for k, pi, _, _ in T.problems(box):
        if k == "어절":
            out.append(("어절", pi))
    return out


def _ext(el):
    sp = el.find(qn("p:spPr"))
    x = sp.find(qn("a:xfrm")) if sp is not None else None
    if x is None:
        return None, None
    return x.find(qn("a:off")), x.find(qn("a:ext"))


def _align(box):
    for p in box.tx.findall(A + "p"):
        ppr = p.find(A + "pPr")
        if ppr is not None and ppr.get("algn"):
            return ppr.get("algn")
    return "l"


def widen(slide, box, sw, others, step=0.04, most=0.4, ok=None):
    """상자를 넓혀 줄바꿈 문제를 없앤다 — 장 밖·다른 글 상자와 새로 겹치면 멈춘다. 반환: 늘린 비율(0 이면 못 함)"""
    off, ext = _ext(box.el)
    if off is None:
        return 0.0
    x0, cx0 = int(off.get("x")), int(ext.get("cx"))
    al = _align(box)
    sx = box.sh.sx if box.sh.sx else 1.0   # 자식 EMU → 장 pt 배율(EMU 기준 1/EMU·k)
    base_l, base_w = box.sh.Left, box.sh.Width
    hit0 = {i for i, o in enumerate(others) if _overlap((base_l, box.sh.Top, base_w, box.sh.Height), o)}
    f = 0.0
    while f < most - 1e-9:
        f = round(f + step, 3)
        add = int(cx0 * f)
        mid_c = abs(base_l + base_w / 2 - sw / 2) < sw * 0.02   # 장 가운데 상자(키메시지 등)는 양쪽으로 — 한쪽으로 넓히면 가운데가 틀어진다(12·16쪽)
        nx = x0 - add // 2 if (al == "ctr" or mid_c) else x0 - add if al == "r" else x0
        L = base_l + (nx - x0) * base_w / max(1, cx0)
        Wd = base_w * (cx0 + add) / max(1, cx0)
        if L < 0 or L + Wd > sw:
            break
        if any(_overlap((L, box.sh.Top, Wd, box.sh.Height), o) for i, o in enumerate(others) if i not in hit0):
            break
        off.set("x", str(nx))
        ext.set("cx", str(cx0 + add))
        nb = T.Box(V.Sh(box.el, L, box.sh.Top, Wd, box.sh.Height, box.sh.sx, box.sh.sy, box.sh.rot))
        if (ok() if ok else not break_kinds(nb)):
            return f
    off.set("x", str(x0))
    ext.set("cx", str(cx0))
    return 0.0


def _overlap(a, b, pad=1.0):
    return a[0] < b[0] + b[2] - pad and b[0] < a[0] + a[2] - pad and a[1] < b[1] + b[3] - pad and b[1] < a[1] + a[3] - pad


def merge_runs(p):
    """같은 꼴(rPr 가 같은) 이웃 런을 하나로 — 런 경계에서 렌더가 숫자·단위 사이를 띄우던 것(‘173 개’)"""
    n = 0
    rs = list(p)
    i = 0
    while i < len(rs) - 1:
        a, b = rs[i], rs[i + 1]
        if a.tag == b.tag == A + "r":
            ra, rb = a.find(A + "rPr"), b.find(A + "rPr")
            sa = b"" if ra is None else __import__("lxml.etree", fromlist=["tostring"]).tostring(ra)
            sb = b"" if rb is None else __import__("lxml.etree", fromlist=["tostring"]).tostring(rb)
            if sa == sb:
                ta, tb = a.find(A + "t"), b.find(A + "t")
                if ta is not None and tb is not None:
                    ta.text = (ta.text or "") + (tb.text or "")
                    if (ta.text or "") != (ta.text or "").strip():
                        ta.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
                    p.remove(b)
                    rs.pop(i + 1)
                    n += 1
                    continue
        i += 1
    return n


def breaks_cmd(src, dst, report=None):
    prs = Presentation(src)
    sw, shh = prs.slide_width / V.EMU, prs.slide_height / V.EMU
    log = []
    for no, slide in enumerate(prs.slides, 1):
        if center_keymsg(slide, sw, shh):
            log.append((no, "키메시지 가운데", ""))
        for p in slide._element.iter(A + "p"):
            merge_runs(p)
            for t in p.iter(A + "t"):   # 숫자와 단위 사이 공백('173 개' → '173개') — 공백만, 낱말은 그대로
                if t.text and UNIT.search(t.text):
                    t.text = UNIT.sub(r"\1\2", t.text)
                    log.append((no, "숫자 단위 붙임", t.text[:30]))
        boxes = list(T.boxes(slide))
        rects = [(b.sh.Left, b.sh.Top, b.sh.Width, b.sh.Height) for b in boxes]
        for i, b in enumerate(boxes):
            kinds = break_kinds(b)
            if not kinds:
                continue
            others = rects[:i] + rects[i + 1:]
            f = widen(slide, b, sw, others)
            txt = b.text().replace("\n", " ")[:30]
            if f:
                log.append((no, "상자 넓힘", f"{txt} +{round(f * 100)}%"))
                continue
            if any(k == "어절" for k, _ in kinds):
                keep_tx = copy.deepcopy(b.tx)
                T.fix_box(b, shrink=False)
                left = [k for k in break_kinds(T.Box(b.sh)) if k[0] != "짧은글"]
                if left:   # 공백에서 끊어도 어절이 줄보다 길다 — 줄만 늘어나니 되돌린다(14쪽 7pt 라벨이 세 줄로)
                    b.tx.getparent().replace(b.tx, keep_tx)
                log.append((no, "공백에서 줄바꿈" if not left else "남김", txt))
            else:
                log.append((no, "남김", f"{txt} — {', '.join(sorted({k for k, _ in kinds}))}"))
    prs.save(dst)
    if report:
        json.dump(log, open(report, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return log


def scan_breaks(path):
    prs = Presentation(path)
    out = []
    for no, slide in enumerate(prs.slides, 1):
        for b in T.boxes(slide):
            ks = sorted({k for k, _ in break_kinds(b)})
            if ks:
                out.append((no, b.text().replace("\n", " ")[:30], ks))
    return out


# ───────────────────────── 키메시지 가운데 맞춤(사용자 2026-10-28 12쪽 '두 줄이 장 가운데로 안 맞음')
def keymsg_boxes(slide, sw, shh):
    """키메시지 상자 — 장 위쪽 40% 안, 폭이 장의 50% 이상, 1~3 문단 15~140자, 글 14pt 이상, 장 제목('1) …'·'02. …' 머리)은 아님.
    장 가운데를 노린 상자(가운데가 장 가운데 ±15%)이거나 문단 하나라도 가운데 정렬인 것만 — 왼쪽 정렬 설명 글은 건드리지 않는다"""
    out = []
    for b in T.boxes(slide):
        txt = b.text().strip()
        paras = [p for p in b.paras if p.text.strip()]
        if not (1 <= len(paras) <= 3 and 15 <= len(_norm(txt)) <= 140):
            continue
        if b.sh.Top > shh * 0.4 or b.sh.Width < sw * 0.5 or re.match(r"^\s*(\d+\)|\d+\.\s|[IVX]+\.)", txt):
            continue
        # 머리 띠(장 맨 위 10%) 안의 장 제목('사업의 특성 / 1. 운영과 …')은 키메시지가 아니다 — 폭 72%·가운데 ±15% 조건을 통과해
        # 왼쪽 정렬·가이드(12.80)에 맞던 제목을 가운데로 옮겼다(11-02 바이오 2차 46장, R183)
        if b.sh.Top < shh * 0.1:
            continue
        if max(p.biggest()[0] for p in paras) < 14:
            continue
        mid = b.sh.Left + b.sh.Width / 2
        algs = [((p.ppr.get("algn") if p.ppr is not None else None) or "l") for p in paras]
        if abs(mid - sw / 2) > sw * 0.15 and "ctr" not in algs:
            continue
        out.append(b)
    # 보조 줄 — 키메시지 바로 아래(틈이 키메시지 높이 이하) 괄호로 시작하는 짧은 상자(16쪽 '(중앙행정기관(14), …)')도 같이 가운데로
    allb = list(T.boxes(slide))
    for k in list(out):
        for b in allb:
            if any(b.el is o.el for o in out):
                continue
            t = b.text().strip()
            gap = b.sh.Top - (k.sh.Top + k.sh.Height)
            if t[:1] in OPEN and len(_norm(t)) <= 140 and -2 <= gap <= max(12.0, k.sh.Height) and b.sh.Width >= sw * 0.3:
                out.append(b)
    return out


def keymsg_off(b, sw):
    """가운데에서 벗어난 정도 — (상자 가운데 차이 pt, 가운데 정렬 아닌 문단 수, 들여쓰기·앞 공백 문단 수)"""
    paras = [p for p in b.paras if p.text.strip()]
    nal = sum(1 for p in paras if ((p.ppr.get("algn") if p.ppr is not None else None) or "l") != "ctr")
    nin = sum(1 for p in paras if p.mar > 0.5 or abs(p.ind) > 0.5 or p.text[:1] in T.SP)
    bp = b.bp
    if bp is not None and (bp.get("lIns") or "91440") != (bp.get("rIns") or "91440"):   # 좌우 안 여백이 다르면 글 잉크가 한쪽으로 치우친다
        nin += 1
    return abs(b.sh.Left + b.sh.Width / 2 - sw / 2), nal, nin


def center_keymsg(slide, sw, shh):
    n = 0
    for b in keymsg_boxes(slide, sw, shh):
        d, nal, nin = keymsg_off(b, sw)
        if d <= sw * 0.01 and not nal and not nin:
            continue
        off, ext = _ext(b.el)
        if off is not None and abs(b.sh.sx * 1.0) > 0 and b.el.getparent().tag == qn("p:spTree"):   # 그룹 밖 상자만 옮긴다
            off.set("x", str(int((sw * V.EMU - int(ext.get("cx"))) / 2)))
        if b.bp is not None and (b.bp.get("lIns") or "91440") != (b.bp.get("rIns") or "91440"):
            m = str(min(int(b.bp.get("lIns") or 91440), int(b.bp.get("rIns") or 91440)))
            b.bp.set("lIns", m)
            b.bp.set("rIns", m)
        for p in b.tx.findall(A + "p"):
            ppr = p.find(A + "pPr")
            if ppr is None:
                ppr = p.makeelement(A + "pPr", {})
                p.insert(0, ppr)
            ppr.set("algn", "ctr")
            for k in ("marL", "indent"):
                ppr.attrib.pop(k, None)
            first = next((r for r in p if r.tag == A + "r"), None)
            t = first.find(A + "t") if first is not None else None
            if t is not None and t.text:
                t.text = t.text.lstrip("  　\t")
        n += 1
    return n


def scan_keymsg(path):
    prs = Presentation(path)
    sw, shh = prs.slide_width / V.EMU, prs.slide_height / V.EMU
    out = []
    for no, slide in enumerate(prs.slides, 1):
        for b in keymsg_boxes(slide, sw, shh):
            d, nal, nin = keymsg_off(b, sw)
            if d > sw * 0.01 or nal or nin:
                out.append((no, b.text().replace("\n", " / ")[:40], round(d, 1), nal, nin))
    return out


def measure_cmd():
    faces = {}
    keys = set(fontset.INSTALLED)
    want = re.compile(r"(kopub|시월구일|타이틀고딕|한돋움|freesentation|pretendard|gmarket|g마켓|asta|paperlogy|hada|wanted|noto sans|맑은 고딕|malgun|nanum|나눔|elice|hakgyo)", re.I)
    for k in sorted(keys):
        if want.search(k):
            try:
                faces[k] = _measure_file(fontset.INSTALLED[k])
            except Exception:
                pass
    for f in [f for _, (_, fs, _) in fontset.BODIES.items() for f in fs] + [t[1] for t in fontset.TITLES.values()]:
        if f.lower() not in faces:
            p = _file_of(f)
            if p:
                try:
                    faces[f.lower()] = _measure_file(p)
                except Exception:
                    pass
    json.dump({"_doc": "서체 굵기·폭 — polish_prep.py measure 가 40px 에서 '" + SAMPLE + "' 를 그려 잰 값(ink=잉크 양/1000, w=글 폭 px). 손으로 고치지 말 것.",
               "faces": faces}, open(INK_JSON, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(faces)}개 서체를 쟀습니다 → {INK_JSON}")


def key_only(path, dst=None):
    """제목 서체(G마켓)가 키메시지·앞장 큰 글(key_set) 밖에 있으면 본문 서체 단계로 바꾼다(크기는 그대로). 에이전트·앞 단계가 남긴 것까지 마지막에 한 번(R183).
    반환: 바꾼 글 런 수"""
    prs = Presentation(path)
    deck = Deck(prs)
    n = 0
    for slide in prs.slides:
        keys = key_set(deck, slide)
        for p, r, rp, face, pt, known, bold in runs_of(deck, slide):
            if r in keys or not _title_face(face):
                continue
            nf, _ = plan_run(face, pt, bold, table=_in_table(p), key=False)
            set_face(_rpr(r), nf)
            n += 1
    prs.save(dst or path)
    return n


def post_cmd(orig, src, dst):
    """마무리 뒤: guard → breaks → 제목 서체는 키메시지만 → check. WARN 줄을 낸다"""
    tmp = dst + ".tmp.pptx"
    nfix = guard_cmd(orig, src, tmp)
    nemp = emphasize(orig, tmp, tmp)
    log = breaks_cmd(tmp, dst)
    os.remove(tmp)
    nko = key_only(dst)
    if nko:
        print(f"제목 서체 정리 — 키메시지 밖 G마켓 글 {nko}곳을 {fontset.NAME} 로")
    if nemp:
        print(f"강조 되살림 — 원본에서 더 굵던 글 {nemp}곳을 본문 한 단계 위로")
    rows = check(orig, dst)
    bad, (ok, tot) = check_summary(rows)
    nb = sum(1 for x in log if x[1] in ("상자 넓힘", "공백에서 줄바꿈"))
    print(f"가독성 지키기 — 원본보다 얇거나 작던 글 {nfix}곳 되돌림 · 줄바꿈 {nb}곳 정리 · 판정 통과 {ok}/{tot}")
    for no, key, wr, dr_, v in bad[:20]:
        why = "고른 서체에 원본만큼 굵은 단계가 없습니다" if v == "얇음" else "상자가 좁아 원본 크기를 못 지켰습니다" if v == "작음" else "상자에 맞추다 원본보다 커졌습니다"
        print(f"WARN: {no}|원본보다 글이 {v}|'{key[:24]}' — 글 폭 {wr:.2f}배 · 굵기 {dr_:.2f}배(원본 대비). {why}")
    emp = check_emphasis(orig, dst)
    seen = set()
    for no, x, y in emp:
        if (no, x) in seen or len(seen) >= 10:
            continue
        seen.add((no, x))
        print(f"WARN: {no}|강조가 흐려짐|원본에서 굵게 강조한 '{x[:20]}' 이 결과에서 '{y[:20]}' 보다 굵지 않습니다")
    left = [x for x in log if x[1] == "남김"]
    for no, _, txt in left[:20]:
        print(f"WARN: {no}|줄바꿈을 못 고침|{txt}")
    for no, txt, d, nal, nin in scan_keymsg(dst)[:10]:
        print(f"WARN: {no}|키메시지가 장 가운데가 아님|'{txt}' — 가운데에서 {d}pt · 가운데 정렬 아닌 줄 {nal}")


def _slides_opt():
    if "--slides" in sys.argv:
        return {int(x) for x in sys.argv[sys.argv.index("--slides") + 1].split(",") if x}
    return None


def main():
    a = [x for x in sys.argv[1:] if not x.startswith("--")]
    sl = _slides_opt()
    if sl:
        a = [x for x in a if x != ",".join(map(str, sorted(sl))) and not re.fullmatch(r"[\d,]+", x)]
    cmd = a[0] if a else ""
    if cmd == "fonts":
        fonts_cmd(a[1], a[2], sl)
    elif cmd == "check":
        rows = check(a[1], a[2], sl)
        bad, (ok, tot) = check_summary(rows)
        for no, key, wr, dr_, v in bad:
            print(f"FAIL {no}쪽 '{key[:30]}' 글 폭 {wr} 굵기 {dr_} — {v}")
        emp = check_emphasis(a[1], a[2], sl)
        for no, x, y in emp[:30]:
            print(f"FAIL {no}쪽 강조 흐려짐 — 원본에서 '{x[:20]}' 이 '{y[:20]}' 보다 굵었는데 결과는 아니다")
        print(f"가독성 판정: 통과 {ok}/{tot}" + (" — 원본보다 얇거나 작은 글이 있습니다" if bad else "") + f" · 강조 흐려짐 {len(emp)}쌍")
        bad = bad or emp
        if "--json" in sys.argv:
            json.dump(rows, open(sys.argv[sys.argv.index("--json") + 1], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        sys.exit(1 if bad else 0)
    elif cmd == "guard":
        print(f"원본보다 얇거나 작던 글 {guard_cmd(a[1], a[2], a[3])}곳을 다시 맞췄습니다")
    elif cmd == "breaks":
        log = breaks_cmd(a[1], a[2], sys.argv[sys.argv.index("--report") + 1] if "--report" in sys.argv else None)
        for x in log:
            print(*x)
    elif cmd == "scan":
        for x in scan_breaks(a[1]):
            print(*x)
        for x in scan_keymsg(a[1]):
            print("키메시지", *x)
    elif cmd == "post":
        post_cmd(a[1], a[2], a[3])
    elif cmd == "keyonly":   # polish_prep.py keyonly <pptx> [<dst>] — 키메시지 밖 G마켓을 본문 서체로(R183)
        print(f"키메시지 밖 G마켓 글 {key_only(a[1], a[2] if len(a) > 2 else None)}곳을 {fontset.NAME} 로 바꿨습니다")
    elif cmd == "measure":
        measure_cmd()
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
