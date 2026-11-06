# -*- coding: utf-8 -*-
"""초안 다듬기 마감 규칙(AI 없이) — 사용자 10-29 지적(7f9b 결과, R130).

 ① 그림은 원본 그대로 — 새로 넣은 그림은 지우고, 바뀌거나 빠진 원본 그림·장 배경은 되살린다(위치·크기를 옮긴 것은 둔다).
    "건들였더니 많이 깨지고 엉망", "11·12쪽은 수정 전 배경이 낫다", "애매하면 원본에 그림을 넣지 않기"
 ② 쉼표 목록('성명, 주민번호, 세대원 사항, …')은 항목 안에서 줄이 꺾이지 않게 — 항목 안 띄어쓰기를 줄 안 바뀜 공백으로
 ③ 카드 안 글 — 글 상자가 카드 밖으로 나가 있으면 카드 안쪽 여백선까지 좁히고, 줄바꿈이 이상하거나(어절·괄호·짧은 글 두 줄)
    넘치거나 좌우 여백이 모자라면 글자를 1pt 씩 줄인다(원본의 80%·7pt 까지)
 ④ 작은 아이콘(전구 등)이 글을 가리면 글 시작을 아이콘 뒤로
 ⑤ 글이 일러스트(인물 얼굴 등)를 가리면 글을 조금 위로, 자리가 없으면 그림을 조금 줄인다(최대 20%)
 ⑥ 도넛 차트 라벨이 고리 밖으로 잘리면 라벨 글을 고리 두께에 맞게 줄이고 구멍을 조금 줄인다
 ⑦ 한 줄 글 옆 아이콘 세로 가운데(flatfx.center_icons)

명령: python polish_fix.py <원본.pptx> <결과.pptx> <출력.pptx>   — 줄마다 한 가지 결과, 'WARN: 장|제목|내용' 은 확인 목록으로
"""
import copy, hashlib, io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from pptx import Presentation  # noqa: E402
from pptx.oxml.ns import qn  # noqa: E402

import vcenter as V  # noqa: E402
import textlines as T  # noqa: E402

A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
EMU = V.EMU   # 1pt
PAD = 5.0     # 카드 안쪽 여백(pt) 하한
NBSP = " "


# ───────── ① 그림 되돌림
def _blob(part, el):
    """그림의 모든 관계(PNG blip + svg 확장 svgBlip) 내용을 이어 붙인 것 — PNG 대체본은 같고 svg 만 바뀐 그림도 다르게 본다(4쪽 건물)"""
    out = b""
    for x in el.iter():
        rid = x.get(R + "embed")
        if rid:
            try:
                out += part.related_part(rid).blob
            except Exception:
                pass
    return out or None


def _sha(b):
    return hashlib.sha1(b).hexdigest() if b else None


def _pics(slide):
    return [e for e in slide.shapes._spTree.iter(P + "pic")]


def _rebind(src_part, dst_part, el):
    """el 안 그림 관계(r:embed — PNG 와 svg 확장 svgBlip 둘 다)를 결과 장 부품으로 옮긴다.
    svg 를 떼고 PNG 대체본만 두면 PowerPoint 에서 원본과 다른(옅은) 그림이 보였다(4쪽 건물)"""
    from pptx.opc.package import Part
    from pptx.opc.constants import RELATIONSHIP_TYPE as RT
    for b in list(el.iter()):
        rid = b.get(R + "embed")
        if not rid:
            continue
        try:
            sp = src_part.related_part(rid)
            if sp.content_type == "image/svg+xml":
                np_ = Part(dst_part.package.next_image_partname("svg"), "image/svg+xml", dst_part.package, sp.blob)
                nrid = dst_part.relate_to(np_, RT.IMAGE)
            else:
                _, nrid = dst_part.get_or_add_image_part(io.BytesIO(sp.blob))
            b.set(R + "embed", nrid)
        except Exception:
            for ext in el.findall(".//" + A + "blip/" + A + "extLst"):   # svg 를 못 옮기면 PNG 대체본이라도
                ext.getparent().remove(ext)
            if b.tag == A + "blip":
                return False
    return True


def restore_images(orig, prs):
    """장 수가 같을 때만. 반환 (지운 새 그림, 되살린 그림, 되살린 배경)"""
    if len(orig.slides) != len(prs.slides):
        return 0, 0, 0
    n_del = n_add = n_bg = 0
    for so, sr in zip(orig.slides, prs.slides):
        o_pics = [(e, _sha(_blob(so.part, e))) for e in _pics(so)]
        r_pics = [(e, _sha(_blob(sr.part, e))) for e in _pics(sr)]
        o_set = {h for _, h in o_pics if h}
        r_set = {h for _, h in r_pics if h}
        o_names = {(x.get("name") or "") for x in so._element.iter(P + "cNvPr")}
        r_geo = {id(x.el): x for x in V.flat(sr.shapes._spTree)}
        o_geo = {id(x.el): x for x in V.flat(so.shapes._spTree)}
        nm_of = lambda el: (el.find(".//" + P + "cNvPr").get("name") or "") if el.find(".//" + P + "cNvPr") is not None else ""
        missing = [(e, h) for e, h in o_pics if h and h not in r_set]
        for i, (e, h) in enumerate(r_pics):   # 바뀐 그림 — 짝(이름에서 pp_set_ 을 뗀 같은 이름, 없으면 가장 많이 겹치는 자리)을 그 자리에서 원본으로 바꿔 끼운다(그룹·쌓임 순서 유지 — 4쪽 건물)
            if not h or h in o_set or e.getparent() is None:
                continue
            base = re.sub(r"^pp_set_", "", nm_of(e))
            g = r_geo.get(id(e))
            def iou(oe):
                og = o_geo.get(id(oe))
                if g is None or og is None:
                    return 0.0
                ix = max(0.0, min(g.Left + g.Width, og.Left + og.Width) - max(g.Left, og.Left))
                iy = max(0.0, min(g.Top + g.Height, og.Top + og.Height) - max(g.Top, og.Top))
                return ix * iy / max(1.0, g.Width * g.Height + og.Width * og.Height - ix * iy)
            mate = next((m for m in missing if nm_of(m[0]) == base), None) or max(missing, key=lambda m: iou(m[0]), default=None)
            if mate is None or (nm_of(mate[0]) != base and iou(mate[0]) < 0.4):
                continue
            new = copy.deepcopy(mate[0])
            if not _rebind(so.part, sr.part, new):
                continue
            e.getparent().replace(e, new)
            missing.remove(mate)
            r_set.add(mate[1])
            r_pics[i] = (new, mate[1])
            n_add += 1
        for e, h in r_pics:
            if h and h not in o_set and e.getparent() is not None:
                g = r_geo.get(id(e))
                if g is not None:   # 그 그림을 받치던 새 장식(흰 동그라미 등 — 원본에 없던 이름·글 없는 작은 도형)도 함께(18쪽)
                    cx, cy = g.Left + g.Width / 2, g.Top + g.Height / 2
                    for x in list(r_geo.values()):
                        nm = (x.el.find(".//" + P + "cNvPr").get("name") or "") if x.el.find(".//" + P + "cNvPr") is not None else ""
                        if x.kind == "sp" and nm not in o_names and not "".join(t.text or "" for t in x.el.iter(A + "t")).strip() \
                                and x.Left <= cx <= x.Left + x.Width and x.Top <= cy <= x.Top + x.Height \
                                and x.Width * x.Height <= g.Width * g.Height * 4 and x.el.getparent() is not None:
                            x.el.getparent().remove(x.el)
                if e.getparent() is not None:
                    e.getparent().remove(e)
                n_del += 1
        tree = sr.shapes._spTree
        o_top = [x for x in so.shapes._spTree if x.tag.startswith(P)]
        geo = {id(s.el): s for s in V.flat(so.shapes._spTree)}
        for e, h in o_pics:
            if not h or h in r_set:
                continue
            new = copy.deepcopy(e)
            if not _rebind(so.part, sr.part, new):
                continue
            if e.getparent() is not so.shapes._spTree and id(e) in geo:   # 그룹 안 그림 — 장 위 절대 좌표로
                s = geo[id(e)]
                xf = new.find(P + "spPr/" + A + "xfrm")
                xf.find(A + "off").set("x", str(int(s.Left * EMU)))
                xf.find(A + "off").set("y", str(int(s.Top * EMU)))
                xf.find(A + "ext").set("cx", str(int(s.Width * EMU)))
                xf.find(A + "ext").set("cy", str(int(s.Height * EMU)))
                at = len(tree)
            else:
                k = o_top.index(e) if e in o_top else len(tree)
                at = min(len(tree), max(2, k))
            tree.insert(at, new)
            r_set.add(h)
            n_add += 1
        ob = so._element.find(P + "cSld/" + P + "bg")
        rb = sr._element.find(P + "cSld/" + P + "bg")
        os_ = lambda x: re.sub(rb'r:embed="[^"]*"', b"", __import__("lxml.etree", fromlist=["tostring"]).tostring(x)) if x is not None else b""
        if os_(ob) != os_(rb) or (ob is not None and rb is not None and _sha(_blob(so.part, ob)) != _sha(_blob(sr.part, rb))):
            csld = sr._element.find(P + "cSld")
            if rb is not None:
                csld.remove(rb)
            if ob is not None:
                nb = copy.deepcopy(ob)
                if _rebind(so.part, sr.part, nb):
                    csld.insert(0, nb)
            n_bg += 1
    return n_del, n_add, n_bg


# ───────── ①-2 쪽 밖으로 나간 글 상자 · 아주 작아진 글(7f9b 10쪽 키메시지 465→1030pt, 17쪽 제목 20→2pt)
def _key(t):
    return re.sub(r"\s+", "", t or "")


def restore_boxes(orig, prs):
    """장 폭 밖으로 나간 글 상자 → 원본에 같은 글 상자가 있으면 그 가로 위치·폭으로, 없으면 장 안으로. 반환 고친 수"""
    if len(orig.slides) != len(prs.slides):
        return 0
    SW = prs.slide_width
    n = 0
    for so, sr in zip(orig.slides, prs.slides):
        o_by = {}
        for sh in so.shapes:
            if sh.has_text_frame and sh.text_frame.text.strip():
                o_by.setdefault(_key(sh.text_frame.text), sh)
        for sh in sr.shapes:
            if not sh.has_text_frame or sh.left is None or not sh.text_frame.text.strip():
                continue
            if sh.left >= -12700 and sh.left + sh.width <= SW + 12700:
                continue
            o = o_by.get(_key(sh.text_frame.text))
            if o is not None and o.left >= 0 and o.left + o.width <= SW:
                sh.left, sh.width = o.left, o.width
            else:
                l_ = max(0, sh.left)
                sh.left, sh.width = l_, min(sh.width, SW - l_)
            n += 1
    return n


def tiny_runs(orig, prs, low=5.0, was=8.0):
    """결과에서 low pt 밑인 런 — 원본의 같은 글이 was pt 이상이었으면 원본 크기로. 반환 고친 수"""
    if len(orig.slides) != len(prs.slides):
        return 0
    n = 0
    for so, sr in zip(orig.slides, prs.slides):
        size = {}
        for p in so._element.iter(A + "p"):
            end = p.find(A + "endParaRPr")
            tx = p.getparent()
            lst = tx.find(A + "lstStyle") if tx is not None else None
            ppr = p.find(A + "pPr")
            ldef = T._defrpr(lst, int(ppr.get("lvl", "0")) if ppr is not None else 0) if lst is not None else None
            for r in p.findall(A + "r"):
                k = _key(r.findtext(A + "t"))
                if k:
                    size.setdefault(k, V._sz(r.find(A + "rPr"), ldef, end))
        for r in sr._element.iter(A + "r"):
            rp = r.find(A + "rPr")
            if rp is None or not rp.get("sz") or int(rp.get("sz")) / 100 >= low:
                continue
            k = _key(r.findtext(A + "t"))
            if len(k) >= 2 and size.get(k, 0) >= was:
                rp.set("sz", str(int(size[k] * 100)))
                n += 1
    return n


# ───────── ② 쉼표 목록
def comma_lists(prs):
    n = 0
    for s in prs.slides:
        for p in s._element.iter(A + "p"):
            ts = list(p.iter(A + "t"))
            txt = "".join(t.text or "" for t in ts)
            if txt.count(",") + txt.count("，") < 2 or len(txt) < 16:
                continue
            items = re.split(r"[,，]", txt)
            if sum(1 for it in items if " " in it.strip()) == 0:
                continue
            for t in ts:   # 쉼표 뒤 공백은 두고(거기서 꺾이게), 항목 안 공백만 줄 안 바뀜으로 — 글자는 그대로
                if t.text:
                    t.text = re.sub(r"(?<![,，\s])[ ](?=\S)", NBSP, t.text)
            n += 1
    return n


# ───────── ③ 카드 안 글 맞춤
def _issues(b):
    import polish_prep as PP
    ks = {k for k, _, _, _ in T.problems(b) if k in ("가로넘침", "넘침")}
    ks |= {k for k, _ in PP.break_kinds(b) if k in ("어절", "괄호", "짧은글")}
    lay, _ = b.layout()   # 짧은 한 줄 글이 상자 폭의 92% 를 넘으면 — 계산은 한 줄인데 PowerPoint 는 꺾었다(10쪽 '보유기관 (249종 연계)')
    for pa, ls in lay:
        t = pa.text.strip()
        if t and len(t) <= 16 and len(ls) == 1 and not pa.hard and b.wrap and pa.width_of(0, len(pa.chars)) > (b.box_w - pa.mar) * 0.92:
            ks.add("빠듯")
    return ks


def _extent(b):
    """글이 실제로 그려지는 범위(장 pt) — (왼쪽, 오른쪽, 위, 아래)"""
    lay, th = b.layout()
    bp = b.bp
    g = lambda k, d: int(bp.get(k)) / EMU if bp is not None and bp.get(k) else d
    li, ti, bi = g("lIns", 7.2), g("tIns", 3.6), g("bIns", 3.6)
    lw = max([pa.width_of(*l) + pa.mar for pa, ls in lay for l in ls] or [0])
    al = "l"
    for pa, _ in lay:
        if pa.ppr is not None and pa.ppr.get("algn"):
            al = pa.ppr.get("algn")
            break
    x0 = b.sh.Left + li + (0 if al not in ("ctr", "r") else (b.box_w - lw) / (2 if al == "ctr" else 1))
    anc = bp.get("anchor") if bp is not None else "t"
    top = b.sh.Top + ti
    y0 = top if anc in (None, "t") else top + (b.box_h - th) / (2 if anc == "ctr" else 1)
    return x0, x0 + lw, y0, y0 + th


def _visible(s, SW, SH):
    """면이나 테두리가 보이는 도형 — V.filled 는 옅은 테두리(0.5pt 미만)·반투명 면을 빼서 '보유기관' 칸 테두리를 못 잡았다"""
    if V.filled(s, SW, SH):
        return True
    if s.kind != "sp" or s.Width <= 4 or s.Height <= 4 or (s.Width > SW * 0.9 and s.Height > SH * 0.4):
        return False
    pr = s.el.find(P + "spPr")
    if pr is None:
        return False
    ln = pr.find(A + "ln")
    return pr.find(A + "solidFill") is not None or pr.find(A + "gradFill") is not None or \
        (ln is not None and ln.find(A + "noFill") is None and (ln.find(A + "solidFill") is not None or ln.find(A + "gradFill") is not None))


def _card(b, shapes, SW, SH):
    cx, cy = b.sh.Left + b.sh.Width / 2, b.sh.Top + b.sh.Height / 2
    best = None
    for s in shapes:
        if s.el is b.el or not _visible(s, SW, SH):
            continue
        if s.Left <= cx <= s.Left + s.Width and s.Top <= cy <= s.Top + s.Height and s.Width * s.Height > b.sh.Width * b.sh.Height * 0.6:
            if best is None or s.Width * s.Height < best.Width * best.Height:
                best = s
    return best


def _shrink(b, k):
    for pa in b.paras:
        T._set_size(pa, -k)


def fit_text(prs, log):
    n = 0
    SW, SH = prs.slide_width / EMU, prs.slide_height / EMU
    for no, s in enumerate(prs.slides, 1):
        shapes = V.flat(s.shapes._spTree)
        for b in list(T.boxes(s)):
            card = None if V.filled(b.sh, SW, SH) else _card(b, shapes, SW, SH)   # 면 있는 상자 안 글은 상자 안쪽 여백이 곧 여백
            if card is not None and b.el.getparent() is s.shapes._spTree:   # 글 상자가 카드 안쪽 여백선 밖으로 — 상자를 좁힌다
                xf = b.el.find(P + "spPr/" + A + "xfrm")
                L, Rr = card.Left, card.Left + card.Width   # 상자는 카드 경계까지만 — 여백은 상자 안쪽 여백 + 아래 '여백' 판정(글 범위)으로
                if xf is not None and (b.sh.Left < L - 1 or b.sh.Left + b.sh.Width > Rr + 1):
                    nl, nr = max(b.sh.Left, L), min(b.sh.Left + b.sh.Width, Rr)
                    if nr - nl > 20:
                        xf.find(A + "off").set("x", str(int(nl * EMU)))
                        xf.find(A + "ext").set("cx", str(int((nr - nl) * EMU)))
                        b = T.Box(V.Sh(b.el, nl, b.sh.Top, nr - nl, b.sh.Height, b.sh.sx, b.sh.sy, b.sh.rot))
            def bad(bx):
                ks = _issues(bx)
                if card is not None:   # 좌우 여백 — 카드 폭의 8%(5~14pt). '보유기관' 칸 104pt 에서 글이 테두리에 붙었다(10쪽)
                    x0, x1, _, _ = _extent(bx)
                    x0, x1 = x0 - (x1 - x0) * 0.02, x1 + (x1 - x0) * 0.02   # PowerPoint 는 계산보다 2~4% 넓게 그린다
                    pad = min(14.0, max(PAD, card.Width * 0.08))   # 8% — 6% 로는 10쪽 '국가유공자(유족)확인서' 가 여전히 테두리에 붙어 보였다
                    if x0 < card.Left + pad - 0.5 or x1 > card.Left + card.Width - pad + 0.5:
                        ks.add("여백")
                return ks
            ks0 = bad(b)
            if not ks0:
                continue
            pt0 = max(pa.biggest()[0] for pa in b.paras if pa.text.strip())
            floor = max(7.0, pt0 * 0.8)
            keep = copy.deepcopy(b.tx)
            best, k = (len(ks0), 0), 0
            while pt0 - (k + 1) >= floor - 1e-6:
                k += 1
                _shrink(T.Box(b.sh), 1)
                ks = bad(T.Box(b.sh))
                if len(ks) < best[0]:
                    best = (len(ks), k)
                if not ks:
                    break
            if best[1] == 0:
                b.tx.getparent().replace(T.Box(b.sh).tx, keep)
                continue
            if best[1] != k:   # 가장 나았던 단계로
                b.tx.getparent().replace(T.Box(b.sh).tx, keep)
                _shrink(T.Box(b.sh), best[1])
            n += 1
            log(f"{no}쪽 글 {best[1]}pt 줄임 — {b.text()[:20]!r} ({', '.join(sorted(ks0))})")
    return n


# ───────── ④ 작은 아이콘이 글을 가림
def _icon_hits(prs, max_pt):
    """[(장, 상자, 글 범위, 아이콘)] — 글 왼쪽 끝을 덮는 작은 그림"""
    out = []
    for no, s in enumerate(prs.slides, 1):
        notext = lambda x: not "".join(t.text or "" for t in x.el.iter(A + "t")).strip()
        icons = [x for x in V.flat(s.shapes._spTree) if (x.kind == "pic" or (x.kind == "sp" and notext(x))) and 6 < x.Width <= max_pt and 6 < x.Height <= max_pt
                 and 0.6 < x.Width / x.Height < 1.6]   # 그림 아이콘·체크 동그라미(3쪽 '타원 40')
        for b in T.boxes(s):
            x0, x1, y0, y1 = _extent(b)
            for ic in icons:
                ox = min(x1, ic.Left + ic.Width) - max(x0, ic.Left)
                oy = min(y1, ic.Top + ic.Height) - max(y0, ic.Top)
                if ox > -2 and oy > 2 and ic.Left + ic.Width / 2 <= x0 + (x1 - x0) / 2:   # 겹치거나 2pt 안으로 붙음
                    out.append((no, s, b, (x0, x1, y0, y1), ic))
    return out


def icon_over_text(prs, log, max_pt=50.0, orig=None):
    """원본에서도 겹쳐 있던 글(설계된 배치 — 'QR 그림 위 이용처')은 두고, 다듬으며 새로 생긴 겹침만(서체가 넓어져 전구가 글을 덮음)"""
    n = 0
    was = {(no, re.sub(r"\s+", "", b.text())) for no, _, b, _, _ in _icon_hits(orig, max_pt)} if orig is not None else set()
    for no, s, b, (x0, x1, y0, y1), ic in _icon_hits(prs, max_pt):
        if (no, re.sub(r"\s+", "", b.text())) in was:
            continue
        need = ic.Left + ic.Width + 3 - x0
        bp = b.bp
        if bp is None:
            continue
        al = next((pa.ppr.get("algn") for pa in b.paras if pa.ppr is not None and pa.ppr.get("algn")), "l")
        before = _issues(b)
        li = int(bp.get("lIns") or 91440)
        bp.set("lIns", str(int(li + need * EMU * (2 if al == "ctr" else 1))))
        if _issues(T.Box(b.sh)) - before:
            bp.set("lIns", str(li))   # 글이 새로 꺾이면 아이콘을 왼쪽으로
            xf = ic.el.find(P + "spPr/" + A + "xfrm")
            if xf is not None and ic.el.getparent() is s.shapes._spTree and ic.Left - need >= 0:
                xf.find(A + "off").set("x", str(int((ic.Left - need) * EMU)))
            else:
                log(f"WARN: {no}|아이콘이 글을 가림|'{b.text()[:20]}' — 옮길 자리가 없습니다")
                continue
        n += 1
        log(f"{no}쪽 아이콘과 겹친 글 풀기 — {b.text()[:20]!r}")
    return n


# ───────── ④-2 아이콘 목록 — 글 왼쪽 정렬·아이콘과 글 간격 일정(사용자 10-29 3쪽 '✓ 사 업 명 / ✓사업기간 …')
def align_icon_lists(prs, log, gap=6.0, max_pt=50.0):
    """같은 세로줄(아이콘 왼쪽 ±3pt)에 아이콘+짧은 글 줄이 3개 이상이면 — 글을 모두 왼쪽 정렬, 글 시작 = 가장 오른쪽 아이콘 끝 + gap"""
    n = 0
    for no, s in enumerate(prs.slides, 1):
        flat = V.flat(s.shapes._spTree)
        notext = lambda x: not "".join(t.text or "" for t in x.el.iter(A + "t")).strip()
        icons = [x for x in flat if (x.kind == "pic" or (x.kind == "sp" and notext(x))) and 6 < x.Width <= max_pt and 6 < x.Height <= max_pt
                 and 0.6 < x.Width / x.Height < 1.6]
        rows = []
        for b in T.boxes(s):
            t = b.text().strip()
            if not t or len(t) > 14 or "\n" in t:
                continue
            x0, x1, y0, y1 = _extent(b)
            cy = (y0 + y1) / 2
            ic = min((i for i in icons if abs(i.Top + i.Height / 2 - cy) < max(6.0, i.Height * 0.5) and -4 < x0 - (i.Left + i.Width) < 60
                      and i.Left < x0), key=lambda i: abs(x0 - (i.Left + i.Width)), default=None)
            if ic is not None:
                rows.append((ic, b, x0, x1))
        used = set()
        for ic, b, _, _ in rows:
            if id(ic) in used:
                continue
            grp = [r for r in rows if abs(r[0].Left - ic.Left) <= 3 and id(r[0]) not in used]
            if len(grp) < 3:
                continue
            for r in grp:
                used.add(id(r[0]))
            target = max(r[0].Left + r[0].Width for r in grp) + gap
            for ic_, bx, x0, x1 in grp:
                bp = bx.bp
                if bp is None:
                    continue
                for pa in bx.paras:
                    ppr = pa.p.find(A + "pPr")
                    if ppr is None:
                        ppr = pa.p.makeelement(A + "pPr", {})
                        pa.p.insert(0, ppr)
                    ppr.set("algn", "l")
                    ppr.attrib.pop("indent", None)
                    ppr.attrib.pop("marL", None)
                li = target - bx.sh.Left
                if li < 0:   # 상자가 목표선보다 오른쪽에서 시작 — 상자를 왼쪽으로(그룹이면 배율 환산)
                    xf = bx.el.find(P + "spPr/" + A + "xfrm")
                    if xf is None:
                        continue
                    off, ext = xf.find(A + "off"), xf.find(A + "ext")
                    d = -li
                    off.set("x", str(int(int(off.get("x")) - d * EMU / bx.sh.sx)))
                    ext.set("cx", str(int(int(ext.get("cx")) + d * EMU / bx.sh.sx)))
                    li = 0.0
                bp.set("lIns", str(int(li * EMU)))
                n += 1
            log(f"{no}쪽 아이콘 목록 {len(grp)}줄 — 글 왼쪽 정렬·아이콘과 글 간격 {gap:g}pt")
    return n


# ───────── ⑤ 글이 일러스트를 가림
def _opaque_share(pic_el, part, sh, rect):
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(_blob(part, pic_el))).convert("RGBA")
    except Exception:
        return 0.0
    W, H = im.size
    l = int((rect[0] - sh.Left) / sh.Width * W); r = int((rect[1] - sh.Left) / sh.Width * W)
    t = int((rect[2] - sh.Top) / sh.Height * H); bt = int((rect[3] - sh.Top) / sh.Height * H)
    l, r, t, bt = max(0, l), min(W, r), max(0, t), min(H, bt)
    if r - l < 2 or bt - t < 2:
        return 0.0
    c = im.crop((l, t, r, bt)).resize((max(1, (r - l) // 4), max(1, (bt - t) // 4)))
    px = list(c.get_flattened_data()) if hasattr(c, "get_flattened_data") else list(c.getdata())
    hit = sum(1 for (R_, G, B, A_) in px if A_ > 128 and min(R_, G, B) < 225)
    return hit / max(1, len(px))


def text_over_pictures(prs, log):
    n = 0
    SW, SH = prs.slide_width / EMU, prs.slide_height / EMU
    for no, s in enumerate(prs.slides, 1):
        shapes = V.flat(s.shapes._spTree)
        pics = [x for x in shapes if x.kind == "pic" and x.Width * x.Height > 72 * 72 * 1.2 and not (x.Width > SW * 0.7 and x.Height > SH * 0.7)]
        boxes = list(T.boxes(s))
        for b in boxes:
            x0, x1, y0, y1 = _extent(b)
            for pc in pics:
                rect = (max(x0, pc.Left), min(x1, pc.Left + pc.Width), max(y0, pc.Top), min(y1, pc.Top + pc.Height))
                if rect[1] - rect[0] < 4 or rect[3] - rect[2] < 4:
                    continue
                if list(s.shapes._spTree.iter()).index(b.el) < list(s.shapes._spTree.iter()).index(pc.el):
                    continue   # 그림이 글 위 — 글이 그림을 가리지 않는다
                if x0 >= pc.Left - 1 and x1 <= pc.Left + pc.Width + 1 and y0 >= pc.Top - 1 and y1 <= pc.Top + pc.Height + 1:
                    continue   # 그림 안에 일부러 얹은 글(화면 그림 위 이름·배너 글) — 원본 7f9b 13쪽 '홍길동님'
                if not 0.5 <= pc.Width / max(1, pc.Height) <= 2.0:
                    continue   # 띠·배너 그림
                op = _opaque_share(pc.el, s.part, pc, rect)
                if not 0.15 <= op <= 0.8:
                    continue   # 0.8 넘게 꽉 찬 곳은 글 바탕(뱃지·띠) — 일러스트(인물 등)는 빈 곳이 섞여 있다(4쪽 '정보주체' 0.35)
                # 글이 그림 위쪽에 걸쳤으면 위로, 아래쪽이면 아래로(그룹 안이면 그룹 배율로 환산)
                down = (y0 + y1) / 2 > pc.Top + pc.Height / 2
                d = (pc.Top + pc.Height - y0 + 3) if down else -(y1 - pc.Top + 3)
                others = [(o.sh.Left, o.sh.Top, o.sh.Width, o.sh.Height) for o in boxes if o is not b]
                xf = b.el.find(P + "spPr/" + A + "xfrm")
                nt = b.sh.Top + d
                free = not any(o[0] < b.sh.Left + b.sh.Width and b.sh.Left < o[0] + o[2] and o[1] < nt + b.sh.Height and nt < o[1] + o[3]
                               and not (o[1] < b.sh.Top + b.sh.Height and b.sh.Top < o[1] + o[3]) for o in others)
                if abs(d) <= 30 and xf is not None and 0 <= nt and nt + b.sh.Height <= SH and free:
                    off = xf.find(A + "off")
                    off.set("y", str(int(int(off.get("y")) + d * EMU / b.sh.sy)))
                    log(f"{no}쪽 그림을 가리던 글을 {abs(d):.0f}pt {'아래' if down else '위'}로 — {b.text()[:20]!r}")
                    n += 1
                    break
                pf = pc.el.find(P + "spPr/" + A + "xfrm")
                if pf is None:
                    log(f"WARN: {no}|글이 그림을 가림|'{b.text()[:20]}' — 옮길 자리가 없습니다")
                    break
                k = max(0.8, 1 - (rect[3] - rect[2] + 4) / pc.Height)   # 글 반대쪽 모서리를 고정하고 줄인다
                o_, e_ = pf.find(A + "off"), pf.find(A + "ext")
                cx, cy = int(e_.get("cx")), int(e_.get("cy"))
                ncx, ncy = int(cx * k), int(cy * k)
                o_.set("x", str(int(o_.get("x")) + (cx - ncx) // 2))
                if not down:   # 글이 위 — 아래 모서리 고정
                    o_.set("y", str(int(o_.get("y")) + (cy - ncy)))
                e_.set("cx", str(ncx)); e_.set("cy", str(ncy))
                log(f"{no}쪽 글에 가리던 그림을 {round((1 - k) * 100)}% 줄임 — {b.text()[:20]!r}")
                n += 1
                break
    return n


# ───────── ⑥ 도넛 라벨
def donut_labels(prs, log):
    import flatfx
    n = 0
    C = "{http://schemas.openxmlformats.org/drawingml/2006/chart}"
    for no, s in enumerate(prs.slides, 1):
        for sh in s.shapes:
            if not getattr(sh, "has_chart", False) or not sh.has_chart:
                continue
            cs = sh.chart._chartSpace
            dn = cs.find(".//" + C + "doughnutChart")
            if dn is None:
                continue
            hole_el = dn.find(C + "holeSize")
            hole = int(hole_el.get("val")) if hole_el is not None else 50
            ring = min(sh.width, sh.height) / 12700 / 2 * 0.78 * (1 - hole / 100)
            texts = [v.text or "" for v in cs.iter(C + "v")] + [t.text or "" for t in cs.iter(A + "t")]
            cats = [t for t in texts if t and not re.fullmatch(r"[\d.]+", t)]
            longest = max([len(t) for t in cats] + [4])
            szs = [e for dl in cs.iter(C + "dLbls") for e in dl.iter() if e.tag in (A + "defRPr", A + "rPr") and e.get("sz")]   # 라벨 글만(차트 제목·범례는 그대로)
            if not szs:
                continue
            cur = max(int(e.get("sz")) for e in szs) / 100
            fo = flatfx._font("a시월구일2", 10)
            em = (fo.getlength("가" * longest) / 4 / 72 * 72 / 10) / longest if fo else 0.95
            fit = ring * 1.1 / max(1, longest * em)
            if fit >= cur - 0.25:
                continue
            if fit < 7 and hole_el is not None and hole > 15:   # 글이 너무 작아지면 구멍을 줄여 고리를 두껍게
                hole_el.set("val", str(max(15, hole - 15)))
                ring = min(sh.width, sh.height) / 12700 / 2 * 0.78 * (1 - int(hole_el.get("val")) / 100)
                fit = ring * 1.1 / max(1, longest * em)
            new = max(6.0, round(fit * 2) / 2)
            for e in szs:
                e.set("sz", str(int(new * 100)))
            n += 1
            log(f"{no}쪽 도넛 라벨 {cur:g}pt → {new:g}pt (구멍 {hole}% → {hole_el.get('val') if hole_el is not None else hole}%)")
    return n


def run(orig_path, src, dst, log=print):
    import flatfx
    orig, prs = Presentation(orig_path), Presentation(src)
    d, a, bg = restore_images(orig, prs)
    out = [f"그림 원본대로 — 새 그림 {d}개 뺌 · 원본 그림 {a}개 · 배경 {bg}장 되살림"]
    out.append(f"쪽 밖 글 상자 {restore_boxes(orig, prs)}개 · 아주 작아진 글 {tiny_runs(orig, prs)}곳 되돌림")
    out.append(f"쉼표 목록 {comma_lists(prs)}문단")
    out.append(f"글 맞춤 {fit_text(prs, log)}상자")
    out.append(f"아이콘·글 겹침 {icon_over_text(prs, log, orig=orig)}곳")
    out.append(f"아이콘 목록 정렬 {align_icon_lists(prs, log)}줄")
    out.append(f"글·그림 겹침 {text_over_pictures(prs, log)}곳")
    out.append(f"도넛 라벨 {donut_labels(prs, log)}개")
    out.append(f"아이콘 세로 가운데 {flatfx.center_icons(prs)}개 · 줄바꿈 내어쓰기 {flatfx.hang_bullets(prs)}문단")
    prs.save(dst)
    log("다듬기 마감 — " + " · ".join(out))
    return out


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    run(sys.argv[1], sys.argv[2], sys.argv[3])
