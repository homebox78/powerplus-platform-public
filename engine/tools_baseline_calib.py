# -*- coding: utf-8 -*-
"""세로 제안서 뱃지 글 가운데 맞춤용 — 서체마다 PowerPoint 가 줄 상자 안에 기준선을 놓는 자리를 실측해 표로 남긴다.
PowerPoint 가 있는 윈도우 PC 에서만 돌린다(엔진 서버는 이 표만 읽는다).
  python engine/tools_baseline_calib.py  →  engine/templates/vertical/baseline.json
배경(2026-10-14): 서체 수치(win/hhea/typo)로 계산한 세로 가운데가 실측과 0.01~0.04cm 달라 영문 뱃지 글이 위로 붙어 보였다.
측정: 서체마다 가운데 정렬·안쪽 여백 0 글 상자에 'CHAPTER 기술' 을 20pt 로 놓고 2280px 로 렌더 → 잉크 가운데 y 를 글 상자 가운데와 비교,
같은 글을 PIL 로 그린 잉크(기준선 기준)와 맞춰 '글 상자 가운데 → 기준선' 거리(em)와 크기 비율을 구한다."""
import json, os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont
from pptx import Presentation
from pptx.util import Cm, Pt

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import vertical as V
import fontset

TEXT, PT, BOX_W, BOX_H, PX_CM = "CHAPTER 기술", 20, 12.0, 1.8, 2280 / V.PAGE_W


def faces():
    out = {}
    for _, fs, files in V.VBODY.values():
        for f, fl in zip(fs, files):
            out[f] = fl
    for _, f, fl in fontset.TITLES.values():
        out[f] = fl
    return out


def font_path(fl):
    for d in (os.path.join(HERE, "fonts"), os.path.join(HERE, "fonts", "private"), "C:/Windows/Fonts",
              os.path.expanduser("~/AppData/Local/Microsoft/Windows/Fonts")):
        p = os.path.join(d, fl)
        if os.path.isfile(p):
            return p
    return None


def pil_ink(path, text, pt):
    """PIL 로 그린 잉크 — (진행 폭, 잉크 위·아래 y(기준선 0, 아래가 +)) px@pt*10"""
    f = ImageFont.truetype(path, pt * 10)
    W, H = int(f.getlength(text)) + 400, pt * 40
    im = Image.new("L", (W, H), 0)
    ImageDraw.Draw(im).text((200, H * 2 // 3), text, font=f, fill=255, anchor="ls")
    x0, y0, x1, y1 = im.getbbox()
    return y0 - H * 2 // 3, y1 - H * 2 // 3


def main():
    fc = faces()
    prs = Presentation()
    prs.slide_width, prs.slide_height = Cm(V.PAGE_W), Cm(V.PAGE_H)
    PER = int((V.PAGE_H - 1.6) // (BOX_H + 0.1))   # 한 쪽에 놓을 줄 수 — 넘으면 다음 쪽(20종 중 15번째부터 쪽 밖에 놓여 값이 틀렸다, 2026-10-14)
    rows = []
    for i, (face, fl) in enumerate(sorted(fc.items())):
        if i % PER == 0:
            s = prs.slides.add_slide(prs.slide_layouts[6])
        x, y = (V.PAGE_W - BOX_W) / 2, 0.8 + (i % PER) * (BOX_H + 0.1)
        tb = s.shapes.add_textbox(Cm(x), Cm(y), Cm(BOX_W), Cm(BOX_H))
        bp = tb.text_frame._txBody.find("a:bodyPr", V.NS)
        for k in ("lIns", "rIns", "tIns", "bIns"):
            bp.set(k, "0")
        bp.set("anchor", "ctr")
        bp.set("wrap", "none")
        p = tb.text_frame.paragraphs[0]
        p.alignment = 2
        r = p.add_run()
        r.text = TEXT
        r.font.size = Pt(PT)
        rp = r._r.get_or_add_rPr()
        for tag in ("latin", "ea"):
            e = rp.makeelement(f"{{{V.A}}}{tag}", {"typeface": face})
            rp.append(e)
        rows.append((face, fl, y, i // PER + 1))
    d = tempfile.mkdtemp()
    pp = os.path.join(d, "calib.pptx")
    prs.save(pp)
    n = len(prs.slides)
    ps = (f"$pp=New-Object -ComObject PowerPoint.Application; $p=$pp.Presentations.Open('{pp}',$true,$false,$false); "
          f"1..{n} | % {{ $p.Slides.Item($_).Export((Join-Path '{d}' ('calib' + $_ + '.png')),'PNG',2280,{int(2280 * V.PAGE_H / V.PAGE_W)}) }}; $p.Close(); $pp.Quit()")
    subprocess.run(["powershell", "-NoProfile", "-Command", ps], check=True)
    ims = {k: Image.open(os.path.join(d, f"calib{k}.png")).convert("L") for k in range(1, n + 1)}
    out = {}
    for face, fl, y, k in rows:
        im = ims[k]
        path = font_path(fl)
        if not path:
            print("서체 파일 없음:", face)
            continue
        top, bot = int(y * PX_CM), int((y + BOX_H) * PX_CM)
        band = im.crop((0, top, im.width, bot)).point(lambda v: 255 if v < 128 else 0)
        bb = band.getbbox()
        if not bb:
            print("잉크 없음:", face)
            continue
        ink_c = (bb[1] + bb[3]) / 2 - (bot - top) / 2             # 글 상자 가운데 대비 잉크 가운데(px, 아래 +)
        py0, py1 = pil_ink(path, TEXT, PT)                        # PIL 잉크(기준선 0)
        scale = (bb[3] - bb[1]) / PX_CM / ((py1 - py0) / 10 * 0.03528)   # PowerPoint/PIL 크기 비율
        em = PT * 0.03528
        base = ink_c / PX_CM - (py0 + py1) / 2 / 10 * 0.03528 * scale   # 글 상자 가운데 → 기준선(cm, 아래 +)
        out[face] = {"base_em": round(base / em, 4), "scale": round(scale, 4)}
        print(f"{face:24} 기준선 {base / em:+.3f}em  크기 {scale:.3f}")
    dst = os.path.join(HERE, "templates", "vertical", "baseline.json")
    json.dump(out, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("→", dst, len(out))


if __name__ == "__main__":
    main()
