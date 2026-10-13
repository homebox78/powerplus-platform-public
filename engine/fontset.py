# -*- coding: utf-8 -*-
"""장표 서체 — 제목용 한 가지(키메시지·표지 사업명·목차·간지 큰 글자) + 본문용 한 벌(굵기 4단계).
새 변환에서 고른다(opts.font_title · opts.font_body). 워커는 하위 도구(마무리·틀·표지)에 환경변수 PD_FONT_TITLE · PD_FONT_BODY 로 넘기고,
이 모듈은 그 값을 읽어 KEY_FONT·LIGHT·BODY·SEMI·BOLD 를 정한다.
본문 규칙(공용디자인가이드 §2 서체): 1 옅은 설명 · 2 본문 · 3 강조·소제목 · 4 굵은 제목·띠·표 머리·숫자.
굵기는 bold 속성이 아니라 서체 이름으로 가른다(굵기마다 서체가 따로다).
a시월구일(회사 서체)이 이 PC 에 없으면 같은 굵기의 Asta Sans(오픈 소스)로 대신한다. 서체 파일은 worker/fonts — 출처·라이선스는 fonts/licenses/README.md"""
import json, os
import osdep

# 목록은 fonts/fonts.json(웹의 서체 고르기도 같은 파일을 읽는다) — 첫 줄이 기본
_LIST = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts", "fonts.json"), encoding="utf-8"))
TITLES = {x["id"]: (x["name"], x["face"], x["file"]) for x in _LIST["title"]}            # id: (보이는 이름, 서체 이름, 파일)
BODIES = {x["id"]: (x["name"], tuple(x["faces"]), tuple(x["files"]) if x.get("files") else None) for x in _LIST["body"]}   # id: (보이는 이름, 4단계, 파일들)
DEFAULT_TITLE, DEFAULT_BODY = _LIST["title"][0]["id"], _LIST["body"][0]["id"]
ASTA = ("Asta Sans Light", "Asta Sans Medium", "Asta Sans SemiBold", "Asta Sans ExtraBold")
ASTA_FILES = ("AstaSans-Light.ttf", "AstaSans-Medium.ttf", "AstaSans-SemiBold.ttf", "AstaSans-ExtraBold.ttf")
SIWOL = ("a시월구일1", "a시월구일2", "a시월구일3", "a시월구일4")
HERE = os.path.dirname(os.path.abspath(__file__))

# 굵기 이름 → 단계(0~3). 어느 본문 서체로 적혀 있든 같은 단계로 읽는다(마무리가 고른 서체로 바꿀 때 쓴다)
LEVEL = {"Asta Sans": 1, "Asta Sans Regular": 1, "Asta Sans Bold": 3, "맑은 고딕": 1, "Malgun Gothic": 1, "Pretendard Regular": 1, "Pretendard Medium": 1,
         "Pretendard Bold": 3, "Wanted Sans Regular": 1, "Wanted Sans Medium": 1, "Wanted Sans Bold": 3}
for _f in [ASTA] + [b[1] for b in BODIES.values()]:
    for _i, _n in enumerate(_f):
        LEVEL.setdefault(_n, _i)
TITLE_FACES = {t[1] for t in TITLES.values()}   # 마무리가 본문 서체로 바꾸지 않는 제목 서체


INSTALLED = osdep.installed_fonts()   # 설치된 서체 {이름(소문자): 파일 경로}
HAS_SIWOL = all(f.lower() in INSTALLED for f in SIWOL)


def pick(title=None, body=None):
    """(제목 id, 본문 id, 제목 서체, 본문 4단계, 본문 이름) — 모르는 값이면 기본(G마켓 산스 · a시월구일)"""
    t = title if title in TITLES else DEFAULT_TITLE
    b = body if body in BODIES else DEFAULT_BODY
    faces, name = BODIES[b][1], BODIES[b][0]
    if faces == SIWOL and not HAS_SIWOL:
        faces, name = ASTA, "Asta Sans"
    return t, b, TITLES[t][1], faces, name


TITLE_ID, BODY_ID, KEY_FONT, FACES, NAME = pick(os.environ.get("PD_FONT_TITLE"), os.environ.get("PD_FONT_BODY"))
LIGHT, BODY, SEMI, BOLD = FACES


def env(title, body):
    """하위 도구에 넘길 환경변수"""
    return dict(os.environ, PD_FONT_TITLE=title or DEFAULT_TITLE, PD_FONT_BODY=body or DEFAULT_BODY)


def face(level):
    return FACES[max(0, min(3, int(level)))]


def file(level, body=None):
    """PIL 로 시안 틀을 그릴 때 쓰는 서체 파일 — 본문 서체의 그 굵기(설치된 것 → worker/fonts → Asta Sans)"""
    lv = max(0, min(3, int(level)))
    _, b, _, faces, _ = pick(None, body or BODY_ID)
    p = INSTALLED.get(faces[lv].lower())
    if p and os.path.isfile(p):
        return p
    fs = BODIES[b][2]
    if fs and os.path.isfile(os.path.join(HERE, "fonts", fs[lv])):
        return os.path.join(HERE, "fonts", fs[lv])
    return os.path.join(HERE, "fonts", ASTA_FILES[lv])


def title_file(title=None):
    t = title if title in TITLES else TITLE_ID
    return os.path.join(HERE, "fonts", TITLES[t][2])


def rule(title=None, body=None):
    """제작 지시문에 넣는 서체 규칙 한 덩어리"""
    _, _, key, (lt, bd, sb, bo), _ = pick(title or TITLE_ID, body or BODY_ID)
    return (f"`{bd}` = 본문·목록·표 본문 / `{sb}` = 강조 낱말·소제목·카드 제목·라벨 / `{bo}` = 굵은 제목·패널 띠·표 머리·큰 숫자 / "
            f"`{lt}` = 옅은 보조 설명·주석. 굵기는 **서체 이름으로만** 가른다(`font.bold` 를 쓰지 않는다 — 굵기마다 서체가 따로다). "
            f"키메시지와 표지·목차·간지의 큰 글자는 `{key}`.")


def files_hint(title=None, body=None):
    """지시문에 넣는 서체 파일 경로 — 에이전트가 글 폭을 잴 때(리눅스에는 Windows 서체 폴더가 없다)"""
    _, b, key, faces, _ = pick(title or TITLE_ID, body or BODY_ID)
    out = []
    for lv, f in enumerate(faces):
        p = INSTALLED.get(f.lower()) or file(lv, b)
        out.append(f"`{f}` = `{p}`")
    out.append(f"`{key}` = `{INSTALLED.get(key.lower()) or title_file(title)}`")
    return " · ".join(out)
