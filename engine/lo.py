# -*- coding: utf-8 -*-
"""LibreOffice 렌더 — 리눅스 엔진에서 PowerPoint Export 대신.
  pptx → PDF(soffice --headless) → 장별 PNG(pdftoppm, 없으면 PyMuPDF)
실행마다 따로 사용자 프로필을 써서 여러 작업이 동시에 돌려도 서로 막지 않는다.
PowerPoint 와 같게 가로 1600px(기본) · 이름 s01.png …"""
import glob, os, shutil, subprocess, sys, tempfile
import osdep


def to_pdf(pptx, workdir):
    prof = os.path.join(workdir, "profile")
    uri = "file:///" + prof.replace("\\", "/").lstrip("/")
    r = subprocess.run([osdep.soffice(), f"-env:UserInstallation={uri}", "--headless", "--norestore", "--convert-to", "pdf",
                        "--outdir", workdir, os.path.abspath(pptx)], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=900)
    pdf = os.path.join(workdir, os.path.splitext(os.path.basename(pptx))[0] + ".pdf")
    if not os.path.isfile(pdf):
        raise RuntimeError("LibreOffice 변환 실패: " + (r.stderr or r.stdout or "").strip()[-500:])
    return pdf


_LO_EM = None


def lift_badges(pptx, workdir):
    """뱃지 글(세로 제안서 fit_badge — 자간 0 명시 + 세로 가운데)을 LibreOffice 렌더용 사본에서만 위로 올린다.
    LibreOffice 는 PowerPoint 보다 기준선을 서체마다 0.1~0.2em 아래에 놓아, PowerPoint 에 맞춘 뱃지 글이 캡처에서 아래로 치우쳤다
    (사용자 2026-10-14 "영문이 아래로 치우침"). 양은 templates/vertical/baseline.json 의 lo_em(tools_baseline_calib.py --lo 실측).
    장표 파일은 그대로 — 캡처만 맞춘다. 고칠 게 없으면 원본 경로를 돌려준다."""
    global _LO_EM
    if _LO_EM is None:
        try:
            import json
            bl = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates", "vertical", "baseline.json"), encoding="utf-8"))
            _LO_EM = {k: v["lo_em"] for k, v in bl.items() if v.get("lo_em")}
        except Exception:
            _LO_EM = {}
    if not _LO_EM:
        return pptx
    try:
        from pptx import Presentation
        prs = Presentation(pptx)
    except Exception:
        return pptx
    A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
    n = 0
    for part in prs.part.package.iter_parts():   # 장·레이아웃·마스터 전부 — 간지 뱃지는 레이아웃에 있다
        el = getattr(part, "_element", None)
        if el is None:
            continue
        for body in el.iter(A.replace("drawingml/2006/main", "presentationml/2006/main") + "txBody"):
            bp = body.find(A + "bodyPr")
            runs = body.findall(f"{A}p/{A}r/{A}rPr")
            if bp is None or bp.get("anchor") != "ctr" or not runs or any(r.get("spc") != "0" for r in runs):
                continue
            rp = runs[0]
            f = next((e.get("typeface") for e in (rp.find(A + "latin"), rp.find(A + "ea")) if e is not None and e.get("typeface") in _LO_EM), None)
            if not f or not rp.get("sz"):
                continue
            d = int(_LO_EM[f] * int(rp.get("sz")) / 100 * 12700)   # em → EMU(1pt = 12700)
            if d <= 0:
                continue
            bp.set("bIns", str(int(bp.get("bIns") or 45720) + 2 * d))   # 아래 여백을 늘리면 가운데 정렬 글이 그 절반만큼 올라간다
            n += 1
    if not n:
        return pptx
    dst = os.path.join(workdir, os.path.basename(pptx))
    prs.save(dst)
    return dst


def render(pptx, outdir, picks=None, width=1600, prefix="s"):
    """장별 PNG 를 outdir/s01.png … 로. picks(1부터 장 번호)를 주면 그 장만. 반환 [(번호, 경로)]"""
    os.makedirs(outdir, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="pd_lo_")
    try:
        pdf = to_pdf(lift_badges(pptx, tmp), tmp)
        return _pages(pdf, outdir, picks, width, prefix, tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _pages(pdf, outdir, picks, width, prefix, tmp):
    from PIL import Image
    out = []
    pdftoppm = shutil.which("pdftoppm")
    if pdftoppm:
        n = _page_count(pdf)
        for i in (sorted(picks) if picks else range(1, n + 1)):
            if i < 1 or i > n:
                continue
            base = os.path.join(tmp, f"p{i}")
            subprocess.run([pdftoppm, "-png", "-f", str(i), "-l", str(i), "-singlefile", "-scale-to-x", str(width), "-scale-to-y", "-1", pdf, base],
                           check=True, capture_output=True, timeout=300)
            out.append((i, base + ".png"))
    else:
        import fitz   # PyMuPDF
        doc = fitz.open(pdf)
        for i in (sorted(picks) if picks else range(1, len(doc) + 1)):
            if i < 1 or i > len(doc):
                continue
            pg = doc[i - 1]
            z = width / pg.rect.width
            p = os.path.join(tmp, f"p{i}.png")
            pg.get_pixmap(matrix=fitz.Matrix(z, z)).save(p)
            out.append((i, p))
    res = []
    for i, p in out:
        dst = os.path.join(outdir, f"{prefix}{i:02d}.png")
        im = Image.open(p)
        h = round(width * _ratio(pdf))
        if im.size != (width, h):   # PowerPoint Export 와 같은 크기(1600×1108)
            im = im.resize((width, h), Image.LANCZOS)
        im.save(dst)
        res.append((i, dst))
    return res


_RATIO = {}


def _ratio(pdf):
    if pdf not in _RATIO:
        try:
            from pypdf import PdfReader
            b = PdfReader(pdf).pages[0].mediabox
            _RATIO[pdf] = float(b.height) / float(b.width)
        except Exception:
            _RATIO[pdf] = 7.5 / 10.83
    return _RATIO[pdf]


def _page_count(pdf):
    try:
        from pypdf import PdfReader
        return len(PdfReader(pdf).pages)
    except Exception:
        r = subprocess.run(["pdfinfo", pdf], capture_output=True, text=True, timeout=60)
        for ln in r.stdout.splitlines():
            if ln.startswith("Pages:"):
                return int(ln.split()[1])
        return 0


if __name__ == "__main__":
    # lo.py <pptx> <outdir> [장 번호…] — 모든 장(또는 고른 장)을 outdir/sNN.png 로
    sys.stdout.reconfigure(encoding="utf-8")
    for n, p in render(sys.argv[1], sys.argv[2], [int(x) for x in sys.argv[3:]] or None):
        print(p)
