# -*- coding: utf-8 -*-
"""LibreOffice 렌더 — 리눅스 엔진에서 PowerPoint Export 대신.
  pptx → PDF(soffice --headless) → 장별 PNG(pdftoppm, 없으면 PyMuPDF)
실행마다 따로 사용자 프로필을 써서 여러 작업이 동시에 돌려도 서로 막지 않는다.
PowerPoint 와 같게 가로 1600px(기본) · 이름 s01.png …"""
import glob, os, shutil, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor
import osdep

WORKERS = min(6, os.cpu_count() or 1)   # 장 그리기 동시 수 — 다른 작업과 나눠 쓴다


def to_pdf(pptx, workdir, fmt="pdf"):
    prof = os.path.join(workdir, "profile")
    uri = "file:///" + prof.replace("\\", "/").lstrip("/")
    r = subprocess.run([osdep.soffice(), f"-env:UserInstallation={uri}", "--headless", "--norestore", "--convert-to", fmt,
                        "--outdir", workdir, os.path.abspath(pptx)], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=900)
    pdf = os.path.join(workdir, os.path.splitext(os.path.basename(pptx))[0] + "." + fmt)
    if not os.path.isfile(pdf):
        raise RuntimeError("LibreOffice 변환 실패: " + (r.stderr or r.stdout or "").strip()[-500:])
    return pdf


def no_autospace(pptx, workdir):
    """LibreOffice 는 문단마다 '아시아·비아시아 글 사이 간격'(ParaIsCharacterDistance)을 켜 두어 한글↔숫자·영문 사이에
    빈칸만큼 벌렸다('A 사', '73 개국', '11 조원 ,' — 강조 상자가 글에서 밀려 보임, 10-29). pptx 에는 이 값을 끄는 속성이 없어
    렌더용 사본을 ODP 로 한 번 바꾸고 모든 문단 속성에 style:text-autospace="none" 을 넣는다. 실패하면 원본 경로."""
    import re, zipfile
    try:
        odp = to_pdf(pptx, workdir, "odp")
        dst = odp[:-4] + "_n.odp"
        with zipfile.ZipFile(odp) as z, zipfile.ZipFile(dst, "w") as zo:
            for it in z.infolist():
                b = z.read(it.filename)
                if it.filename in ("content.xml", "styles.xml"):
                    x = re.sub(r'style:text-autospace="[^"]*"', 'style:text-autospace="none"', b.decode("utf-8"))
                    x = re.sub(r'<style:paragraph-properties(?![^>]*text-autospace)', '<style:paragraph-properties style:text-autospace="none"', x)
                    b = x.encode("utf-8")
                zo.writestr(it, b, compress_type=zipfile.ZIP_STORED if it.filename == "mimetype" else zipfile.ZIP_DEFLATED)
        return dst
    except Exception:
        return pptx


def flat_shadows(pptx, workdir):
    """렌더용 사본에서 테마 그림자를 끊는다(flatfx.kill_theme_shadows — 마무리 단계와 같은 처리). python-pptx 기본 틀의 테마 효과 스타일은
    불투명도 35~38% 그림자라, 만든 도형이 물려받아 중간 렌더·시안 대조에서 카드마다 짙은 그림자와 글 번짐(채움 없는 글상자)이 보였다.
    최종 파일은 마무리가 끊어 깨끗해도 진행 화면·대조가 달라 보였다(11-03 사용자 '시안에 없던 그림자', R192). 실패하면 원본 경로."""
    try:
        from pptx import Presentation
        import flatfx
        prs = Presentation(pptx)
        nth, nref = flatfx.kill_theme_shadows(prs)
        if not (nth or nref):
            return pptx
        dst = os.path.join(workdir, "flat_" + os.path.basename(pptx))
        prs.save(dst)
        return dst
    except Exception:
        return pptx


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


LO_TRACK = -0.02   # 렌더용 사본에서만 글자 간격을 글자 크기의 2% 좁힌다


def condense(pptx, workdir, k=LO_TRACK):
    """LibreOffice 는 PowerPoint 보다 한글 글 폭을 2~4% 넓게 잡고 한글↔숫자·영문 사이에 자동 간격을 넣어,
    PowerPoint 에서 한 줄인 글이 썸네일에서만 꺾였다('사업명' → '사업/명', 17쪽 제목 두 줄 — 10-29, R133).
    렌더용 사본의 모든 런에 자간(spc)을 글자 크기 × k 만큼 더한다. 장표 파일은 그대로. 반환: 사본 경로(고칠 게 없으면 원본)"""
    try:
        from pptx import Presentation
        prs = Presentation(pptx)
    except Exception:
        return pptx
    A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
    n = 0
    P_ = A.replace("drawingml/2006/main", "presentationml/2006/main")
    for part in prs.part.package.iter_parts():
        el = getattr(part, "_element", None)
        if el is None:
            continue
        for sp in el.iter(P_ + "sp"):   # 줄 바꾸지 않음(wrap none) 상자 — PowerPoint 는 저장된 폭보다 긴 글도 한 줄로 그리지만 LibreOffice 는 그 폭에서 꺾는다
            body = sp.find(P_ + "txBody")
            bp = body.find(A + "bodyPr") if body is not None else None
            xf = sp.find(f"{P_}spPr/{A}xfrm")
            if bp is None or bp.get("wrap") != "none" or xf is None or xf.find(A + "ext") is None:
                continue
            need = 0
            for p in body.findall(A + "p"):
                t = "".join(x.text or "" for x in p.iter(A + "t"))
                szs = [int(r.get("sz")) for r in p.iter(A + "rPr") if r.get("sz")] or [1800]
                need = max(need, int(len(t) * max(szs) / 100 * 12700 * 1.1) + int(bp.get("lIns") or 91440) + int(bp.get("rIns") or 91440))
            ext, off = xf.find(A + "ext"), xf.find(A + "off")
            cx = int(ext.get("cx"))
            if need > cx:
                algn = next((pp.get("algn") for pp in body.iter(A + "pPr") if pp.get("algn")), "l")
                d = need - cx
                if algn == "ctr":
                    off.set("x", str(int(off.get("x")) - d // 2))
                elif algn == "r":
                    off.set("x", str(int(off.get("x")) - d))
                ext.set("cx", str(need))
                n += 1
        for p in el.iter(A + "p"):
            lst = p.getparent().find(A + "lstStyle") if p.getparent() is not None else None
            dflt = None
            if lst is not None:
                d = lst.find(f"{A}lvl1pPr/{A}defRPr")
                dflt = d.get("sz") if d is not None else None
            for r in p.findall(A + "r"):
                rp = r.find(A + "rPr")
                if rp is None:
                    rp = r.makeelement(A + "rPr", {})
                    r.insert(0, rp)
                sz = int(rp.get("sz") or dflt or 1800)
                rp.set("spc", str(int(int(rp.get("spc") or 0) + sz * k)))   # spc 는 1/100pt, sz 도 1/100pt
                n += 1
    if not n:
        return pptx
    dst = os.path.join(workdir, "c_" + os.path.basename(pptx))
    prs.save(dst)
    return dst


def _sig(pptx, width, prefix):
    import hashlib
    h = hashlib.sha256(f"{width}|{prefix}|as0".encode())   # as0 = 한글↔숫자 간격 끈 렌더(R135) — 렌더 방식이 바뀌면 꼬리를 바꾼다
    with open(pptx, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def render(pptx, outdir, picks=None, width=1600, prefix="s"):
    """장별 PNG 를 outdir/s01.png … 로. picks(1부터 장 번호)를 주면 그 장만. 반환 [(번호, 경로)]
    같은 파일(내용 지문)을 같은 폴더에 이미 렌더했고 그 장 그림이 다 있으면 LibreOffice 를 다시 돌리지 않는다
    (에이전트가 같은 판을 눈 확인용으로 거듭 렌더했다 — 20MB·21장이면 한 번에 1~3분, 10-28)"""
    os.makedirs(outdir, exist_ok=True)
    mark = os.path.join(outdir, f".lo_{prefix}.sig")
    sig = None
    try:
        sig = _sig(pptx, width, prefix)
        if os.path.isfile(mark) and open(mark, encoding="utf-8").read().split("|")[0] == sig:
            have = sorted(glob.glob(os.path.join(outdir, f"{prefix}[0-9][0-9]*.png")))
            nums = {int(os.path.basename(p)[len(prefix):-4]) for p in have if os.path.basename(p)[len(prefix):-4].isdigit()}
            total = int(open(mark, encoding="utf-8").read().split("|")[1])
            want = set(picks) if picks else set(range(1, total + 1))
            if want and want <= nums:
                return [(n, os.path.join(outdir, f"{prefix}{n:02d}.png")) for n in sorted(want)]
    except Exception:
        sig = None
    tmp = tempfile.mkdtemp(prefix="pd_lo_")
    try:
        pdf = to_pdf(no_autospace(condense(lift_badges(flat_shadows(pptx, tmp), tmp), tmp), tmp), tmp)   # 렌더용 사본만 — 테마 그림자(R192) — 뱃지 기준선·LibreOffice 꺾임(R133)·한글↔숫자 간격(R135)
        out = _pages(pdf, outdir, picks, width, prefix, tmp)
        if sig:
            try:
                open(mark, "w", encoding="utf-8").write(f"{sig}|{_page_count(pdf)}")
            except Exception:
                pass
        return out
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _pages(pdf, outdir, picks, width, prefix, tmp):
    from PIL import Image
    out = []
    pdftoppm = shutil.which("pdftoppm")
    if pdftoppm:
        n = _page_count(pdf)

        def one(i):
            base = os.path.join(tmp, f"p{i}")
            subprocess.run([pdftoppm, "-png", "-f", str(i), "-l", str(i), "-singlefile", "-scale-to-x", str(width), "-scale-to-y", "-1", pdf, base],
                           check=True, capture_output=True, timeout=300)
            return i, base + ".png"
        with ThreadPoolExecutor(WORKERS) as ex:   # 한 장씩 차례로 그리면 43쪽에 코어 하나로 오래 걸렸다(11-01 실측, 24코어 서버)
            out = list(ex.map(one, [i for i in (sorted(picks) if picks else range(1, n + 1)) if 1 <= i <= n]))
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
    h = round(width * _ratio(pdf))

    def save(x):
        i, p = x
        dst = os.path.join(outdir, f"{prefix}{i:02d}.png")
        im = Image.open(p)
        if im.size != (width, h):   # PowerPoint Export 와 같은 크기(1600×1108)
            im = im.resize((width, h), Image.LANCZOS)
        im.save(dst)
        return i, dst
    with ThreadPoolExecutor(WORKERS) as ex:
        return list(ex.map(save, out))


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
