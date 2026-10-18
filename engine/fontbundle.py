# -*- coding: utf-8 -*-
"""장표에 실제로 쓰인 서체를 산출물에 함께 — pptx 를 열어 a:latin·a:ea·a:cs typeface 를 모아 판단한다(손으로 목록을 정하지 않는다).

사용자 2026-10-18 "다국어일 때 그 언어를 고르면, 그 언어의 서체가 산출물과 같이 내려받아질 수 있어야 함":
  - 가로 장표(finalize)·세로 제안서(vertical)·회사소개서(company) 세 경로가 모두 이 모듈 하나로 서체를 모은다.
  - fallback(): 한 장표에 다른 언어 글이 섞이면(한국어 장표 속 일본어 문장 등) 그 글 런의 서체에 글자가 없을 때
    그 글자를 다 가진 같은 굵기의 언어 서체(fonts.json 목록, 장표 언어 기본 → 목록 순)로 그 런만 바꾼다 → 모을 때 그 언어 서체도 들어간다.
  - bundle(): 쓰인 서체 파일 + 서체_라이선스.txt(저작권 고지·OFL 전문) + 서체_설치안내.txt + 배포처 라이선스 문서.
서버 묶음 zip(api Jobs::export · fonts.zip)은 extra 의 서체·라이선스·설치 안내를 '5_서체' 에 넣는다."""
import os, re, shutil, zipfile
import fontcover, fontlicense, fontset, osdep

A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
HERE = os.path.dirname(os.path.abspath(__file__))
FD = os.path.join(HERE, "fonts")
SKIP = re.compile(r"^(맑은 고딕|malgun|arial|calibri|times|segoe|굴림|돋움|바탕|궁서|gulim|dotum|batang|tahoma|verdana|wingdings|webdings|symbol|consolas|courier|marlett)", re.I)
LIC = {"NotoSansJP": ["NotoSansJP-OFL.txt"], "NotoSansSC": ["NotoSansSC-OFL.txt"], "Pretendard": ["Pretendard-OFL.txt"], "AstaSans": ["AstaSans-OFL.txt"],
       "HadaRound": ["HadaRound-OFL.txt"], "Freesentation": ["Freesentation-OFL.txt"], "WantedSans": ["WantedSans-OFL.txt"]}   # 서체 파일 이름 앞부분 → fonts/licenses 의 OFL 문서
GUIDE = """이 폴더의 서체를 설치하면 장표가 만든 그대로 보입니다(설치하지 않으면 PowerPoint 가 다른 서체로 바꿔 그려 줄바꿈·크기가 달라질 수 있습니다).

[Windows]
1. 서체 파일(.ttf·.otf)을 모두 고릅니다.
2. 오른쪽 클릭 → '설치'(여러 사용자가 쓰는 PC 는 '모든 사용자용으로 설치')를 누릅니다.
3. PowerPoint 를 껐다가 다시 켜고 장표를 엽니다.

[Mac]
1. 서체 파일을 두 번 누르면 '서체 관리자'가 열립니다.
2. '서체 설치'를 누릅니다(여러 개면 모두 골라 서체 관리자로 끌어 놓습니다).
3. PowerPoint 를 껐다가 다시 켭니다.

[이 장표에 쓰인 서체]
{rows}

모두 SIL Open Font License 1.1 무료 서체입니다 — 상업용으로 써도 되고 다시 나눠 줄 수 있습니다(서체만 따로 팔 수는 없음). 자세한 조건은 서체_라이선스.txt.
"""


def _face_files():
    """서체 이름(소문자) → 엔진 서체 파일 — fonts.json 목록(설치 여부와 상관없이 엔진 폴더 파일)"""
    out = {}
    for t in fontset._LIST["title"]:
        out[t["face"].lower()] = os.path.join(FD, t["file"])
    for b in fontset._LIST["body"]:
        for f, fn in zip(b["faces"], b.get("files") or []):
            out[f.lower()] = os.path.join(FD, fn)
    return out


FACE_FILES = _face_files()


def path_of(face, reg=None):
    """서체 이름 → 파일 경로들(엔진 목록 → 이 PC 설치 서체). G마켓 산스처럼 같은 가족 굵기가 여럿이면 그 이름으로 시작하는 것 전부"""
    fl = (face or "").lower()
    p = FACE_FILES.get(fl)
    if p and os.path.isfile(p):
        return [p]
    reg = osdep.installed_fonts() if reg is None else reg
    hit = [reg[n] for n in (fl, fl + " bold") if n in reg] or [p for n, p in reg.items() if n.startswith(fl + " ")]
    return [p for p in dict.fromkeys(hit) if os.path.isfile(p)]


def faces_in(pptx):
    """pptx(장·레이아웃·마스터)에 적힌 서체 이름 전부"""
    faces = set()
    with zipfile.ZipFile(pptx) as z:
        for n in z.namelist():
            if re.match(r"ppt/(slides|slideMasters|slideLayouts)/[^/]+\.xml$", n):   # 테마의 문자권별 기본 서체 목록(Microsoft Uighur 등)은 쓰인 서체가 아니다
                faces |= set(re.findall(r'typeface="([^"+][^"]*)"', z.read(n).decode("utf-8", "ignore")))
    return {f for f in faces if f.strip()}


# ───────────────────────── 섞인 언어 — 글 런마다 글자 검사
def _candidates(face):
    """같은 굵기 자리의 다른 서체들(장표 언어 기본 먼저) — [(서체 이름, 파일)]"""
    lang = fontset.LANG
    dflt = (fontset.LANG_DEFAULT.get(lang) or {})
    if face in fontset.TITLE_FACES or re.match(r"^(G마켓|Gmarket)", face, re.I):
        ids = list(dict.fromkeys([dflt.get("title")] + list(fontset.TITLES)))
        return [(fontset.TITLES[i][1], os.path.join(FD, fontset.TITLES[i][2])) for i in ids if i in fontset.TITLES]
    lv = fontset.LEVEL.get(face, 1)
    ids = list(dict.fromkeys([dflt.get("body")] + list(fontset.BODIES)))
    return [(fontset.BODIES[i][1][lv], os.path.join(FD, fontset.BODIES[i][2][lv])) for i in ids if i in fontset.BODIES and fontset.BODIES[i][2]]


def _all_letters(text):
    import unicodedata
    return {ord(c) for c in unicodedata.normalize("NFC", text) if unicodedata.category(c)[0] == "L"}


def fallback(root):
    """XML 트리(장 하나·레이아웃 등)의 글 런마다 — 서체에 없는 글자가 있으면 그 글자를 다 가진 같은 굵기 서체로 그 런만 바꾼다.
    돌려주는 값: [(옛 서체, 새 서체, 글 앞부분)]"""
    out = []
    reg = None
    for r in root.iter(A + "r"):
        t = "".join(x.text or "" for x in r.iter(A + "t"))
        need = _all_letters(t)
        if not need:
            continue
        rPr = r.find(A + "rPr")
        if rPr is None:
            continue
        el = rPr.find(A + "ea") if rPr.find(A + "ea") is not None else rPr.find(A + "latin")
        face = el.get("typeface") if el is not None else None
        if not face or SKIP.match(face) or face.startswith("+"):
            continue
        if reg is None:
            reg = osdep.installed_fonts()
        ps = path_of(face, reg)
        if not ps:
            continue
        cm = fontcover.cmap(ps[0])
        if not cm or need <= cm:
            continue
        for nf, p in _candidates(face):
            if nf != face and os.path.isfile(p) and need <= fontcover.cmap(p):
                for tag in ("latin", "ea", "cs"):
                    e = rPr.find(A + tag)
                    if e is not None:
                        e.set("typeface", nf)
                if rPr.find(A + "ea") is None:
                    e = rPr.makeelement(A + "ea", {"typeface": nf})
                    lat = rPr.find(A + "latin")
                    (lat.addnext(e) if lat is not None else rPr.append(e))
                out.append((face, nf, t[:20]))
                break
    return out


def fallback_pptx(pptx):
    """저장된 pptx 에 fallback 을 한 번 — 바꾼 곳이 있으면 다시 저장. [(옛 서체, 새 서체, 글)]"""
    from pptx import Presentation
    prs = Presentation(pptx)
    out = []
    for part in list(prs.slide_masters) + list(prs.slide_layouts) + list(prs.slides):
        out += fallback(part._element)
    if out:
        prs.save(pptx)
    return out


# ───────────────────────── 묶기
def bundle(pptx, out_dir):
    """쓰인 서체 파일을 out_dir 에 복사하고 라이선스·설치 안내를 쓴다. (넣은 파일 경로들[서체+문서], 엔진에 없는 서체, 재배포 안 되는 서체)"""
    os.makedirs(out_dir, exist_ok=True)
    reg = osdep.installed_fonts()
    got, miss, noship, rows = [], [], [], []
    for f in sorted(faces_in(pptx)):
        if SKIP.match(f):
            continue
        ps = path_of(f, reg)
        if not ps:
            miss.append(f)
            continue
        for p in ps:
            ok, why = fontlicense.shippable(p)
            if not ok:
                noship.append(f"{f}({why})")
                continue
            to = os.path.join(out_dir, os.path.basename(p))
            if to not in got:
                shutil.copy2(p, to)
                got.append(to)
                rows.append(f"- {os.path.basename(p)} — {f}")
    docs = []
    if got:
        docs = fontlicense.write_notice(got, out_dir)
        for pre, ds in LIC.items():
            if any(os.path.basename(g).startswith(pre) for g in got):
                for d in ds:
                    src = os.path.join(FD, "licenses", d)
                    if os.path.isfile(src):
                        shutil.copy2(src, os.path.join(out_dir, d))
                        docs.append(os.path.join(out_dir, d))
        g = os.path.join(out_dir, "서체_설치안내.txt")
        open(g, "w", encoding="utf-8").write(GUIDE.replace("{rows}", "\n".join(rows)))
        docs.append(g)
    return got + list(dict.fromkeys(docs)), miss, list(dict.fromkeys(noship))


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    fs, mi, ns = bundle(sys.argv[1], sys.argv[2])
    print("넣음:", ", ".join(os.path.basename(x) for x in fs) or "없음")
    if mi:
        print("엔진에 없음:", ", ".join(mi))
    if ns:
        print("재배포 안 됨:", ", ".join(ns))
