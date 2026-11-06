"""기존 구성 그대로 — 표지·목차·간지·맺음말·질의응답을 엔진이 그리지 않고 사람이 만든 장으로(R238)

11-05 사용자가 엔진이 그린 앞장을 손으로 사업 전용 디자인 장으로 모두 갈아 끼웠다. 그래서:
  · 앞장 템플릿(.pptx)을 함께 올리면 — 템플릿 앞장 디자인에 올린 장표의 앞장 글을 바꿔 넣는다(글 크기 순위·읽는 순서로 짝)
  · 템플릿이 없으면 — 올린 장표의 앞장을 디자인·그림·글 그대로 쓴다
PowerPoint 로 장을 끼우면(InsertFromFile) 받는 쪽 디자인을 따라가 레이아웃 그림·배경·테마 색·테마 서체가 사라진다.
그래서 끼우기 전에 레이아웃(·마스터) 도형과 배경을 장 위로 옮겨 굳히고, 테마 색·서체 참조를 실제 값으로 박은 한 장짜리 파일을 만든다.

실행: python keepfront.py prepare <올린 장표.pptx> <출력 폴더> [앞장 템플릿.pptx]
  → 마지막 줄에 {"cover": 경로, "toc": …, "div1": …, "end": …, "qna": …} JSON. 확인할 것은 'WARN: 0|제목|내용' 줄
"""
import copy, json, os, re, sys
from lxml import etree
from pptx import Presentation
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
import keeplayout as K

A = "http://schemas.openxmlformats.org/drawingml/2006/main"
P = "http://schemas.openxmlformats.org/presentationml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NUM = re.compile(r"^\s*(\d{1,2}|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+|[IVX]{1,4})\s*[.)]?\s*$")   # 목차 번호(01·Ⅰ.) — 디자인이라 바꾸지 않는다
LAYOUT_HINT = (("qna", r"질의|q&a|qna"), ("end", r"맺음|엔딩|ending|감사"), ("toc", r"목차|contents|차례"), ("div", r"간지|divider|section"), ("cover", r"표지|cover|title"))


def q(ns, tag):
    return f"{{{ns}}}{tag}"


# ── 앞장 찾기 ────────────────────────────────────────────

def classify(path, use_layout=False):
    """장표의 앞장 → {"cover": [i], "toc": [i], "div": [i, …], "end": [i], "qna": [i]} (0부터). keeplayout.plan_from 과 같은 규칙.
    use_layout — 템플릿은 레이아웃 이름(표지_라이트·간지2·맺음말…)을 먼저 본다"""
    deck = K.read_deck(path)
    names = []
    if use_layout:
        prs = Presentation(path)
        names = [(s.slide_layout.name or "") for s in prs.slides]
    out = {"cover": [], "toc": [], "div": [], "end": [], "qna": []}
    for i, d in enumerate(deck):
        nm = re.sub(r"\s+", "", str(d.get("name") or ""))
        k = None
        if use_layout and i < len(names):
            k = next((kk for kk, pat in LAYOUT_HINT if re.search(pat, names[i], re.I)), None)
        if not k:
            if d["kind"] == "div" and re.search(r"(?i)목차|contents|차례", nm):
                k = "toc"
            elif d["kind"] == "div" and re.search(r"(?i)q&a|질의응답", nm):
                k = "qna"
            elif d["kind"] == "div" and re.search(r"(?i)감사합니다|thankyou", nm):
                k = "end"
            elif i == 0 and d["kind"] == "other":
                k = "cover"
            elif d["kind"] == "div":
                k = "div"
        if k:
            out[k].append(i)
    return out


# ── 글 바꾸기(템플릿) ─────────────────────────────────────

HEADING = re.compile(r"목차|contents|차례", re.I)
ENUM = re.compile(r"^\s*(\d{1,2}|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+)\s*[.)]\s*")


def paras(slide):
    """글이 있는 문단을 짝지을 차례로 — 가장 큰 글(제목) 묶음 → 목차 머리 → 나머지는 상자 읽는 순서(위→아래, 왼→오른, 상자 안 문단 순서).
    글 크기 순위로만 짝지으면 표지 키메시지·꼬리표가 뒤바뀌고 목차 항목이 밀렸다(11-05 시험). 반환 [(a:p, 글)], 번호 동그라미 유무"""
    H = 6858000
    items, n, nums = [], 0, 0
    for sh, x, y, w, h in K._walk(slide.shapes):
        if not (getattr(sh, "has_text_frame", False) and sh.has_text_frame):
            continue
        for p in sh.text_frame.paragraphs:
            t = "".join(r.text for r in p.runs).strip()
            if not t:
                continue
            if NUM.match(t):
                nums += 1
                continue
            size = max([K._size(r, p) or 0 for r in p.runs] or [0])
            items.append({"size": size, "row": round(y / (H * 0.03)), "x": x, "n": n, "p": p._p, "t": t})
            n += 1
    if not items:
        return [], False
    order = lambda a: (a["row"], a["x"], a["n"])
    big = max(a["size"] for a in items)
    head = [a for a in items if HEADING.search(a["t"]) and len(a["t"]) <= 20]
    title = [a for a in items if a not in head and a["size"] >= big * 0.85] if not head else []   # 목차 장은 머리가 제목
    if len(title) == len(items) - len(head):   # 글 크기가 하나뿐이면(목차 항목만) 제목 묶음이 아니다
        title = []
    rest = [a for a in items if a not in head and a not in title]
    out = {"title": sorted(title, key=order), "head": sorted(head, key=order), "rest": sorted(rest, key=order)}
    return {k: [(a["p"], a["t"]) for a in v] for k, v in out.items()}, nums > 0


def _set_text(p_el, text):
    runs = p_el.findall(q(A, "r"))
    if not runs:
        return False
    for el in list(p_el):
        if el.tag in (q(A, "br"), q(A, "fld")) or (el.tag == q(A, "r") and el is not runs[0]):
            p_el.remove(el)
    runs[0].find(q(A, "t")).text = text
    return True


def _drop_para(p_el):
    body = p_el.getparent()
    if len(body.findall(q(A, "p"))) > 1:
        body.remove(p_el)
    else:
        for r in p_el.findall(q(A, "r")) + p_el.findall(q(A, "br")):
            p_el.remove(r)


def swap_text(tslide, sslide):
    """템플릿 장 글을 원본 장 글로 — 큰 글부터, 같은 크기는 읽는 순서대로 짝. 반환 (바꾼 수, 못 넣은 원본 글)"""
    tg, tnum = paras(tslide)
    sg, _ = paras(sslide)
    if tg["title"] or tg["rest"]:   # 템플릿에 목차 머리 글상자가 없으면(레이아웃에 박힌 '제안발표 목차') 원본 머리는 넣지 않는다
        sg["head"] = sg["head"][:len(tg["head"])]
    n, left = 0, []
    for g in ("title", "head", "rest"):   # 제목은 제목끼리·머리는 머리끼리·나머지는 읽는 순서끼리 — 한 묶음이 모자라도 다음 묶음이 밀리지 않게
        tp, sp = tg[g], sg[g]
        for i, (p, _t) in enumerate(tp):
            if i < len(sp):
                txt = sp[i][1]
                if tnum and g != "head":   # 템플릿에 번호 동그라미(01)가 있으면 원본 항목 앞 번호(1.)는 뗀다
                    txt = ENUM.sub("", txt)
                n += _set_text(p, txt)
            elif g != "head":   # 원본에 머리가 없으면 템플릿 머리('목차')는 그대로
                _drop_para(p)
        left += [b[1] for b in sp[len(tp):]]
    return n, left


# ── 굳히기 ────────────────────────────────────────────────

def _remap(el, src_part, dst_part):
    """복사한 도형의 관계(그림 r:embed 등)를 장 파트로 옮긴다"""
    for node in el.iter():
        for k, v in list(node.attrib.items()):
            if not k.startswith("{%s}" % R) or v not in src_part.rels:
                continue
            rel = src_part.rels[v]
            if rel.is_external:
                node.set(k, dst_part.relate_to(rel.target_ref, rel.reltype, is_external=True))
            else:
                node.set(k, dst_part.relate_to(rel.target_part, rel.reltype))


def _bg_shape(bg, W, H):
    """p:bg → 장 전체 사각형(같은 채움). 채움을 못 읽으면 None"""
    pr = bg.find(q(P, "bgPr"))
    fill = None
    if pr is not None:
        fill = next((c for c in pr if c.tag in (q(A, "solidFill"), q(A, "gradFill"), q(A, "blipFill"), q(A, "pattFill"))), None)
    else:
        ref = bg.find(q(P, "bgRef"))
        clr = next(iter(ref), None) if ref is not None else None
        if clr is not None:
            fill = etree.Element(q(A, "solidFill"))
            fill.append(copy.deepcopy(clr))
    if fill is None:
        return None
    sp = etree.fromstring(
        f'<p:sp xmlns:p="{P}" xmlns:a="{A}"><p:nvSpPr><p:cNvPr id="9990" name="pd_keepfront_bg"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
        f'<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{W}" cy="{H}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:sp>')
    f = copy.deepcopy(fill)
    if f.tag == q(A, "blipFill") and f.find(q(A, "stretch")) is None and f.find(q(A, "tile")) is None:
        etree.SubElement(f, q(A, "stretch")).append(etree.Element(q(A, "fillRect")))
    sp.find(q(P, "spPr")).append(f)
    ln = etree.SubElement(sp.find(q(P, "spPr")), q(A, "ln"))
    etree.SubElement(ln, q(A, "noFill"))
    return sp


def _theme(master):
    th = master.part.part_related_by(RT.THEME)
    root = etree.fromstring(th.blob)
    clr = {}
    for c in root.iter(q(A, "clrScheme")):
        for e in c:
            v = e.find(q(A, "srgbClr"))
            s = e.find(q(A, "sysClr"))
            clr[etree.QName(e).localname] = v.get("val") if v is not None else (s.get("lastClr") if s is not None else None)
        break
    fonts = {}
    for kind, tag in (("mj", "majorFont"), ("mn", "minorFont")):
        f = next(root.iter(q(A, tag)), None)
        if f is not None:
            for s in ("latin", "ea", "cs"):
                e = f.find(q(A, s))
                fonts[f"+{kind}-{'lt' if s == 'latin' else s}"] = e.get("typeface") if e is not None else ""
    cmap = {"bg1": "lt1", "tx1": "dk1", "bg2": "lt2", "tx2": "dk2"}
    m = master._element.find(q(P, "clrMap"))
    if m is not None:
        cmap.update({k: v for k, v in m.attrib.items()})
    return clr, fonts, cmap


def pin_theme(el, master):
    """테마 색(schemeClr)·테마 서체(+mj-lt 등)를 실제 값으로 — 다른 장표에 끼워도 같은 색·서체(phClr 는 둔다)"""
    clr, fonts, cmap = _theme(master)
    for sc in list(el.iter(q(A, "schemeClr"))):
        v = sc.get("val")
        hexv = clr.get(cmap.get(v, v))
        if not hexv:
            continue
        new = etree.Element(q(A, "srgbClr"), val=hexv)
        for c in sc:
            new.append(c)
        sc.getparent().replace(sc, new)
    for tag in ("latin", "ea", "cs"):
        for f in el.iter(q(A, tag)):
            t = f.get("typeface") or ""
            if t.startswith("+") and fonts.get(t):
                f.set("typeface", fonts[t])
    # 서체를 적지 않은 글 — 받는 장표의 테마 서체로 바뀌지 않게 이 장표의 본문 서체를 적는다
    lt, ea = fonts.get("+mn-lt"), fonts.get("+mn-ea")
    tail = {q(A, t) for t in ("cs", "sym", "hlinkClick", "hlinkMouseOver", "rtl", "extLst")}
    for r in el.iter(q(A, "r")):
        rpr = r.find(q(A, "rPr"))
        if rpr is None:
            rpr = etree.Element(q(A, "rPr"))
            r.insert(0, rpr)
        at = next((i for i, c in enumerate(rpr) if c.tag in tail), len(rpr))
        if ea and rpr.find(q(A, "ea")) is None:
            rpr.insert(at, etree.Element(q(A, "ea"), typeface=ea))
        if lt and rpr.find(q(A, "latin")) is None:
            rpr.insert(at, etree.Element(q(A, "latin"), typeface=lt))


def flatten(prs, slide):
    """레이아웃(·마스터) 도형과 배경을 장 위로 옮기고 테마 참조를 값으로 — 어느 장표에 끼워도 같은 모양"""
    W, H = prs.slide_width, prs.slide_height
    layout = slide.slide_layout
    master = layout.slide_master
    tree = slide.shapes._spTree
    layers = []
    if layout._element.get("showMasterSp") != "0" and slide._element.get("showMasterSp") != "0":
        layers.append((master.part, master.shapes))
    if slide._element.get("showMasterSp") != "0":
        layers.append((layout.part, layout.shapes))
    # 장 자리표시자 → 보통 도형(자리를 적어 두고 ph 를 뗀다 — 받는 장표의 레이아웃 자리로 끌려가지 않게)
    for sh in list(slide.shapes):
        if not sh.is_placeholder:
            continue
        el = sh._element
        try:
            x, y, w, h = sh.left, sh.top, sh.width, sh.height
        except Exception:
            x = None
        ph = el.find(".//" + q(P, "ph"))
        if ph is not None:
            ph.getparent().remove(ph)
        sppr = el.find(q(P, "spPr"))
        if x is not None and sppr is not None and sppr.find(q(A, "xfrm")) is None:
            xf = etree.Element(q(A, "xfrm"))
            etree.SubElement(xf, q(A, "off"), x=str(int(x)), y=str(int(y)))
            etree.SubElement(xf, q(A, "ext"), cx=str(int(w)), cy=str(int(h)))
            sppr.insert(0, xf)
    at = 2   # nvGrpSpPr·grpSpPr 다음 = 가장 뒤
    bg = slide._element.find(f"{q(P, 'cSld')}/{q(P, 'bg')}")
    bg_part = slide.part
    if bg is None:
        for part, el in ((layout.part, layout._element), (master.part, master._element)):
            bg = el.find(f"{q(P, 'cSld')}/{q(P, 'bg')}")
            if bg is not None:
                bg_part = part
                break
    if bg is not None:
        sp = _bg_shape(bg, W, H)
        if sp is not None:
            _remap(sp, bg_part, slide.part)
            tree.insert(at, sp)
            at += 1
    added = list(tree)[2:at]
    for part, shapes in layers:
        for sh in shapes:
            if sh.is_placeholder:
                continue
            el = copy.deepcopy(sh._element)
            _remap(el, part, slide.part)
            tree.insert(at, el)
            added.append(el)
            at += 1
    # 옮겨 붙인 도형만 새 id(장 도형 id 와 겹치지 않게 — 장 도형의 연결선 참조는 그대로)
    nid = 1 + max([int(c.get("id") or 0) for c in tree.iter(q(P, "cNvPr")) if not any(c in set(a.iter()) for a in added)] or [0])
    for a in added:
        for c in a.iter(q(P, "cNvPr")):
            c.set("id", str(nid))
            nid += 1
    pin_theme(slide._element, master)
    slide._element.set("showMasterSp", "0")


def _only(prs, keep):
    """keep 장만 남기고 노트도 뗀다(템플릿·원본 노트가 발표 스크립트 자리를 차지하지 않게 — R237 이 원본 노트를 넣는다)"""
    lst = prs.slides._sldIdLst
    for sid, s in list(zip(list(lst), list(prs.slides))):
        if s is not keep:
            prs.part.drop_rel(sid.rId)
            lst.remove(sid)
    for rId, rel in list(keep.part.rels.items()):
        if rel.reltype == RT.NOTES_SLIDE:
            keep.part.drop_rel(rId)


def one(path, idx, out, text_from=None):
    """path 의 idx 장을 굳혀 out 한 장짜리로. text_from=(원본 경로, 장) 이면 글을 원본 것으로 바꾼다. 반환 못 넣은 원본 글"""
    prs = Presentation(path)
    s = list(prs.slides)[idx]
    left = []
    if text_from:
        src = list(Presentation(text_from[0]).slides)[text_from[1]]
        _, left = swap_text(s, src)
    flatten(prs, s)
    _only(prs, s)
    prs.save(out)
    return left


def prepare(src, outdir, template=None):
    """앞장 종류별 한 장짜리 파일 → {fid: 경로}. fid = cover·toc·div1…·end·qna (worker.front_matter 와 같은 이름)"""
    os.makedirs(outdir, exist_ok=True)
    have = classify(src)
    deck = K.read_deck(src)
    names = {f"div{n}": str(deck[si].get("name") or "") for n, si in enumerate(have["div"], 1)}   # 간지는 차례가 아니라 장 이름으로 짝(worker)
    tpl = classify(template, use_layout=True) if template else None
    out, warns = {}, []
    for k in ("cover", "toc", "div", "end", "qna"):
        for n, si in enumerate(have[k], 1):
            fid = f"div{n}" if k == "div" else k
            fp = os.path.join(outdir, fid + ".pptx")
            try:
                if tpl and tpl[k]:
                    ti = tpl[k][(n - 1) % len(tpl[k])]   # 템플릿 간지가 원본보다 적으면 돌려 쓴다
                    left = one(template, ti, fp, (src, si))
                    if left:
                        warns.append((k, f"템플릿 {ti + 1}쪽({fid})에 자리가 모자라 원본 글 {len(left)}줄을 넣지 못했습니다: " + " / ".join(left[:4])))
                else:
                    if tpl is not None:
                        warns.append((k, f"앞장 템플릿에 {fid} 모양이 없어 올린 장표의 {si + 1}쪽을 그대로 씁니다"))
                    one(src, si, fp)
                out[fid] = fp
            except Exception as e:
                warns.append((k, f"{fid} 앞장을 만들지 못해 엔진 기본 모양으로 둡니다 ({type(e).__name__}: {str(e)[:120]})"))
    # 원본에 없는 질의응답 — 템플릿에 있으면 넣는다(11-05 사용자가 v11 끝에 템플릿 질의응답을 붙임). 글은 템플릿 그대로
    if tpl and tpl["qna"] and not have["qna"]:
        fp = os.path.join(outdir, "qna.pptx")
        try:
            one(template, tpl["qna"][0], fp)
            out["qna"] = fp
        except Exception as e:
            warns.append(("qna", f"템플릿 질의응답을 만들지 못했습니다 ({type(e).__name__}: {str(e)[:120]})"))
    out["_names"] = {k: v for k, v in names.items() if k in out}
    return out, warns


def pick_div(names, text, used):
    """엔진이 넣은 간지 장 글(text)에 이름이 들어 있는 간지 fid — 띄어쓰기 무시. 없으면 None"""
    t = re.sub(r"\s+", "", text or "")
    for fid, nm in names.items():
        n = re.sub(r"\s+", "", nm or "")
        if n and fid not in used and n in t:
            return fid
    return None


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if sys.argv[1] == "prepare":
        got, warns = prepare(sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] else None)
        for k, w in warns:
            print(f"WARN: 0|앞장 확인 필요|{w}")
        print(json.dumps(got, ensure_ascii=False))
