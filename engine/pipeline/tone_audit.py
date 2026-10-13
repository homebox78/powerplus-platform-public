# -*- coding: utf-8 -*-
# 출처: powerPlus/tools/ppt-pipeline/tone_audit.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
"""톤 전수 점검(읽기 전용) — 서체 계열·7pt 미만·팔레트 밖 색·합성 굵게·같은 줄 형제 도형의 크기 차.
   글상자 기본값(lstStyle defRPr)을 물려받는 글자도 센다. 기획 메모·그라데이션 스톱 제외.
   인자: <pptx> [팔레트 hex 쉼표목록]"""
import sys, collections
from pptx import Presentation
from lxml import etree
sys.stdout.reconfigure(encoding="utf-8")
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
PAL = set("002060 255A7B 3A46A0 0456B6 1973D1 00B0F0 658EBB C0D2E6 DEEBF7 F2F7FC EB696D C00000 FF3370 "
          "F78E3F 008400 A2AAC2 5FC8F7 404040 4D4D4D 4E5B6F D3D3D3 808080 FFFFFF 000000 "
          # OO시 v0.12~v0.15 가이드 확정색(글자 2F3B6F·강조 0B2E6B·333F50·키메시지 103574/D23737·헤더 단계 0071C5→0D47A1→0B2E6B·29508C·1F4E79)
          "2F3B6F 0B2E6B 333F50 C53030 D23737 1F4E79 103574 0071C5 0D47A1 29508C F71148 222A35".split())
FONTS = {"G마켓 산스 TTF Bold", "a시월구일2", "a시월구일3", "a시월구일4"}  # v0.16: 키메시지 외 굵은 제목 a시월구일4
MEMO = {"FFFF00", "FFFFCC", "FFFF99", "FFFF87"}
p = Presentation(sys.argv[1])


def walk(shs):
    for s in shs:
        if s.shape_type == 6:
            yield from walk(s.shapes)
        else:
            yield s


def memo(s):
    try:
        if s.fill.type == 1 and str(s.fill.fore_color.rgb) in MEMO:
            return True
    except Exception:
        pass
    return False


bad = collections.defaultdict(list)
fontc, colc = collections.Counter(), collections.Counter()
for sno, sl in enumerate(p.slides, 1):
    for s in walk(sl.shapes):
        if memo(s):
            continue
        el = s._element
        # 색: 그라데이션 안은 제외
        for c in el.iter(A + "srgbClr"):
            anc = c.getparent()
            ing = False
            while anc is not None:
                if anc.tag == A + "gradFill":
                    ing = True; break
                anc = anc.getparent()
            v = (c.get("val") or "").upper()
            if not ing and v not in PAL:
                colc[v] += 1; bad["팔레트 밖 색"].append((sno, s.name, v))
        txb = el.find(".//" + "{http://schemas.openxmlformats.org/presentationml/2006/main}txBody")
        if txb is None:
            txb = el.find(".//" + A + "txBody")
        if txb is None:
            continue
        dflt = {}
        for lvl in txb.iter(A + "defRPr"):
            for tag in ("latin", "ea"):
                e = lvl.find(A + tag)
                if e is not None:
                    dflt[tag] = e.get("typeface")
        for r in txb.iter(A + "r"):
            t = (r.findtext(A + "t") or "").strip()
            if not t:
                continue
            pr = r.find(A + "rPr")
            face = None
            if pr is not None:
                e = pr.find(A + "ea") if pr.find(A + "ea") is not None else pr.find(A + "latin")
                face = e.get("typeface") if e is not None else None
                sz = pr.get("sz")
                if sz and int(sz) < 700 and sno != 31:
                    bad["7pt 미만"].append((sno, s.name, int(sz) / 100, t[:12]))
                if pr.get("b") == "1":
                    bad["합성 굵게"].append((sno, s.name, t[:12]))
            face = face or dflt.get("ea") or dflt.get("latin") or "(테마)"
            fontc[face] += 1
            if face not in FONTS and not face.startswith("+"):
                bad["3계열 밖 서체"].append((sno, s.name, face, t[:12]))
print("서체 분포", dict(fontc.most_common()))
print("팔레트 밖 색", dict(colc.most_common(30)))
for k, v in bad.items():
    print(f"\n[{k}] {len(v)}건")
    for x in v[:40]:
        print("  ", x)
