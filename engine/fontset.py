# -*- coding: utf-8 -*-
"""장표 서체 — 제목용 한 가지(키메시지·표지 사업명·목차·간지 큰 글자) + 본문용 한 벌(굵기 4단계).
새 변환에서 고른다(opts.font_title · opts.font_body). 워커는 하위 도구(마무리·틀·표지)에 환경변수 PD_FONT_TITLE · PD_FONT_BODY 로 넘기고,
이 모듈은 그 값을 읽어 KEY_FONT·LIGHT·BODY·SEMI·BOLD 를 정한다.
본문 규칙(공용디자인가이드 §2 서체): 1 옅은 설명 · 2 본문 · 3 강조·소제목 · 4 굵은 제목·띠·표 머리·숫자.
굵기는 bold 속성이 아니라 서체 이름으로 가른다(굵기마다 서체가 따로다).
a시월구일(회사 서체)이 이 PC 에 없으면 같은 굵기의 Asta Sans(오픈 소스)로 대신한다. 서체 파일은 worker/fonts — 출처·라이선스는 fonts/licenses/README.md"""
import json, os, re
import osdep

# 목록은 fonts/fonts.json(웹의 서체 고르기도 같은 파일을 읽는다) — 첫 줄이 기본
_LIST = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts", "fonts.json"), encoding="utf-8"))
TITLES = {x["id"]: (x["name"], x["face"], x["file"]) for x in _LIST["title"]}            # id: (보이는 이름, 서체 이름, 파일)
TITLE_BOLD = {x["id"]: bool(x.get("bold")) for x in _LIST["title"]}   # 가족 이름 + 굵게 속성으로 고르는 제목 서체(엘리스 DX널리체)
TITLE_SCALE = {x["id"]: float(x.get("scale") or 1.0) for x in _LIST["title"]}   # 제목 서체 크기 보정(덩어리감 맞춤)
BODY_SCALE = {x["id"]: float(x.get("scale") or 1.0) for x in _LIST["body"]}   # 본문 서체 크기 보정(덩어리감 맞춤)
BODY_TRACK = -0.015   # 본문 서체를 굵게(강조·굵음) 크게(11pt 이상) 쓴 글자의 자간 — 사용자 2026-10-14 "본문도 볼드로 크게 사용된 폰트는 자간을 조금"
BODY_TRACK_MIN = 1100
BODIES = {x["id"]: (x["name"], tuple(x["faces"]), tuple(x["files"]) if x.get("files") else None) for x in _LIST["body"]}   # id: (보이는 이름, 4단계, 파일들)
DEFAULT_TITLE, DEFAULT_BODY = _LIST["title"][0]["id"], _LIST["body"][0]["id"]
ASTA = ("Asta Sans Light", "Asta Sans Medium", "Asta Sans SemiBold", "Asta Sans ExtraBold")
ASTA_FILES = ("AstaSans-Light.ttf", "AstaSans-Medium.ttf", "AstaSans-SemiBold.ttf", "AstaSans-ExtraBold.ttf")
SIWOL = ("a시월구일1", "a시월구일2", "a시월구일3", "a시월구일4")
HERE = os.path.dirname(os.path.abspath(__file__))

# 굵기 이름 → 단계(0~3). 어느 본문 서체로 적혀 있든 같은 단계로 읽는다(마무리가 고른 서체로 바꿀 때 쓴다)
LEVEL = {"Asta Sans": 1, "Asta Sans Regular": 1, "Asta Sans Bold": 3, "맑은 고딕": 1, "Malgun Gothic": 1, "Pretendard Regular": 1, "Pretendard Medium": 1,
         "Pretendard Bold": 3, "Wanted Sans Regular": 1, "Wanted Sans Medium": 1, "Wanted Sans Bold": 3}
for _f in [ASTA, SIWOL] + [b[1] for b in BODIES.values()]:   # 양식(base pptx)은 a시월구일1~4 이름으로 짜여 있다
    for _i, _n in enumerate(_f):
        LEVEL.setdefault(_n, _i)
TITLE_FACES = {t[1] for t in TITLES.values()}   # 마무리가 본문 서체로 바꾸지 않는 제목 서체


TITLE_TRACK = -0.015   # 제목 서체 자간 — 지금 자간에 글자 크기의 -1.5% 를 더 줄인다(사용자 2026-10-14 "제목서체는 자간을 아주 조금 더 좁게"). 가로·세로 공통
INSTALLED = osdep.installed_fonts()   # 설치된 서체 {이름(소문자): 파일 경로}
HAS_SIWOL = all(f.lower() in INSTALLED for f in SIWOL)


def pick(title=None, body=None):
    """(제목 id, 본문 id, 제목 서체, 본문 4단계, 본문 이름) — 모르는 값이면 기본(목록 첫 줄). 옛 작업의 'siwol' 등도 기본으로"""
    t = title if title in TITLES else DEFAULT_TITLE
    b = body if body in BODIES else DEFAULT_BODY
    faces, name = BODIES[b][1], BODIES[b][0]
    if faces == SIWOL and not HAS_SIWOL:
        faces, name = ASTA, "Asta Sans"
    return t, b, TITLES[t][1], faces, name


TITLE_ID, BODY_ID, KEY_FONT, FACES, NAME = pick(os.environ.get("PD_FONT_TITLE"), os.environ.get("PD_FONT_BODY"))
LIGHT, BODY, SEMI, BOLD = FACES
KEY_BOLD = TITLE_BOLD.get(TITLE_ID, False)   # 제목 서체를 입힐 때 굵게도 켠다
KEY_SCALE = TITLE_SCALE.get(TITLE_ID, 1.0)


# ───────────────────────── 언어별 서체(2026-10-18 사용자 "니 추천대로"·"다른 언어도 마찬가지")
# 장표 언어가 고른 서체에 없는 글자를 쓰면(일본어 + G마켓 산스 → 가나가 빈칸) 그 언어 기본 서체로 바꾼다. 판단은 여기 하나 —
# 기획·시안 그림(design)·와이어·앞장(frontdraw·frontmatter)·장표 제작 지시·마무리(finalize)·세로 제안서·회사소개서가 모두 이 결과를 쓴다.
# 지원율 표 = fonts/font_cover.json(fontcover.py 가 서체 파일 cmap 으로 잰 값). 실제 글(기획)의 글자도 서체 파일에서 하나하나 찾는다.
import fontcover

LANG_DEFAULT = _LIST.get("lang_default") or {}
AVOID = {(k, x["id"]): x.get("avoid") or {} for k in ("title", "body") for x in _LIST[k]}
try:
    COVER = json.load(open(os.path.join(HERE, "fonts", "font_cover.json"), encoding="utf-8"))
except (OSError, ValueError):
    COVER = {}
MIN_COVER = float(COVER.get("min") or fontcover.MIN)


def lang_ok(code):
    return code if code in fontcover.LANG_TAG else "ko"


def cover(kind, fid, lang):
    """서체(kind=title|body, id)의 그 언어 지원율(%). 표에 없으면(새 서체를 표 갱신 전에 넣음) 파일로 바로 잰다"""
    v = ((COVER.get(kind) or {}).get(fid) or {}).get(lang)
    if v is None:
        v = fontcover.cover_files(_paths(kind, fid)).get(lang, {}).get("pct", 0.0)
    return float(v)


def _paths(kind, fid):
    if kind == "title":
        return [os.path.join(HERE, "fonts", TITLES[fid][2])] if fid in TITLES else []
    fs = BODIES[fid][2] if fid in BODIES else None
    return [os.path.join(HERE, "fonts", f) for f in fs] if fs else []


def _name(kind, fid):
    return (TITLES if kind == "title" else BODIES).get(fid, ("",))[0]


def _josa(word, pair):
    """받침에 맞는 조사 — pair = ('은', '는') 또는 ('으로', '로'). 한글이 아니면 받침 없음으로 본다"""
    c = (word or " ")[-1]
    jong = (ord(c) - 0xAC00) % 28 if 0xAC00 <= ord(c) <= 0xD7A3 else 0
    if pair[1] == "로" and jong == 8:   # ㄹ 받침 + 로
        return word + "로"
    return word + (pair[0] if jong else pair[1])


def usable(kind, fid, lang, text=""):
    """(쓸 수 있나, 이유) — 지원율 MIN_COVER% 이상 · avoid 아님 · 실제 글자 전부 있음"""
    lang = lang_ok(lang)
    ln = fontcover.LANG_NAME[lang]
    why = AVOID.get((kind, fid), {}).get(lang)
    if why:
        return False, f"{ln}에 맞지 않는 서체({why})"
    pc = cover(kind, fid, lang)
    if pc < MIN_COVER:
        return False, f"{ln} 글자가 없는 서체(지원율 {pc:g}%)"
    lack = fontcover.missing(_paths(kind, fid), text, lang) if text else ""
    if lack:
        return False, f"글에 쓴 '{lack[:12]}{'…' if len(lack) > 12 else ''}' 글자가 없는 서체"
    return True, ""


def for_lang(title=None, body=None, lang="ko", text=""):
    """장표 언어·글에 맞는 (제목 id, 본문 id, 알림 목록). 고른 서체가 맞으면 그대로(한국어 + G마켓 산스는 그대로),
    아니면 그 언어 기본 서체(lang_default) → 같은 종류의 다른 서체(목록 순) 중 처음 맞는 것. 아무것도 맞지 않으면 고른 서체를 두고 빠진 글자를 알린다.
    알림 예: '제목 서체 G마켓 산스는 일본어 글자가 없는 서체(지원율 0%)라 Noto Sans JP 로 바꿨습니다'"""
    lang = lang_ok(lang)
    notes, out = [], {}
    for kind, given, table in (("title", title, TITLES), ("body", body, BODIES)):
        dflt = (LANG_DEFAULT.get(lang) or {}).get(kind)
        dflt = dflt if dflt in table else (DEFAULT_TITLE if kind == "title" else DEFAULT_BODY)
        cur = given if given in table else dflt   # 안 골랐거나 모르는 값 — 그 언어 기본
        ok, why = usable(kind, cur, lang, text)
        if ok:
            out[kind] = cur
            continue
        pick_ = next((c for c in dict.fromkeys([dflt] + list(table)) if c != cur and usable(kind, c, lang, text)[0]), None)
        label = "제목" if kind == "title" else "본문"
        if pick_:
            out[kind] = pick_
            notes.append(f"{label} 서체 {_josa(_name(kind, cur), ('은', '는'))} {why}라 {_josa(_name(kind, pick_), ('으로', '로'))} 바꿨습니다")
        else:
            out[kind] = cur
            lack = fontcover.missing(_paths(kind, cur), text, lang)
            notes.append(f"{label} 서체 {_name(kind, cur)}에 없는 글자 '{lack[:20]}' — 맞는 서체가 없어 그대로 두었습니다(PowerPoint 가 다른 서체로 그립니다)")
    return out["title"], out["body"], notes


def text_of(plan):
    """기획(dict·list·문자열)에 든 글 전부 — 서체 글자 검사용"""
    if isinstance(plan, str):
        try:
            plan = json.loads(plan)
        except ValueError:
            return plan
    acc = []

    def walk(v):
        if isinstance(v, str):
            acc.append(v)
        elif isinstance(v, dict):
            for x in v.values():
                walk(x)
        elif isinstance(v, (list, tuple)):
            for x in v:
                walk(x)
    walk(plan)
    return "\n".join(acc)


LANG = lang_ok(os.environ.get("PD_LANG") or "ko")
LANG_TAG = fontcover.LANG_TAG[LANG]   # pptx 글 런의 lang 속성(ja-JP·zh-CN …) — 마무리가 넣는다


def face_usable(face, lang=None):
    """pptx 에 적힌 제목 서체 이름이 장표 언어에 쓸 수 있는가(모르는 서체는 True). G마켓 산스 굵기 이름들은 G마켓 산스로 본다"""
    fid = next((k for k, v in TITLES.items() if v[1] == face), None)
    if fid is None and re.match(r"^(G마켓|Gmarket)", face or "", re.I):
        fid = "gmarket" if "gmarket" in TITLES else None
    return True if fid is None else usable("title", fid, lang or LANG)[0]


def env(title, body, lang=None, text=""):
    """하위 도구에 넘길 환경변수 — lang 을 주면 그 언어·글에 맞게 고친 서체를 넘긴다(for_lang)"""
    if lang:
        title, body, _ = for_lang(title, body, lang, text)
    return dict(os.environ, PD_FONT_TITLE=title or DEFAULT_TITLE, PD_FONT_BODY=body or DEFAULT_BODY, PD_LANG=lang_ok(lang or "ko"))


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
    _, b, key, (lt, bd, sb, bo), _ = pick(title or TITLE_ID, body or BODY_ID)
    return (f"`{bd}` = 본문·목록·표 본문 / `{sb}` = 강조 낱말·소제목·카드 제목·라벨 / `{bo}` = 굵은 제목·패널 띠·표 머리·큰 숫자 / "
            f"`{lt}` = 옅은 보조 설명·주석. 굵기는 **서체 이름으로만** 가른다(`font.bold` 를 쓰지 않는다 — 굵기마다 서체가 따로다). "
            f"키메시지와 표지·목차·간지의 큰 글자는 `{key}`." + size_rule(b))


def size_rule(body):
    """본문 서체 크기 보정을 제작 지시로 — 가로 장표는 에이전트가 크기를 정하고 실제 서체로 글 폭을 재어 맞추므로,
    마무리에서 나중에 곱하면 맞춘 글이 넘친다. 그래서 처음부터 보정한 크기로 짜게 한다(사용자 2026-10-14 "본문서체 중 첫번째랑 나머지가 크기가 다르다")"""
    k = BODY_SCALE.get(body, 1.0)
    if abs(k - 1.0) < 0.03:
        return ""
    ex = " · ".join(f"{p}pt → {round(p * k * 2) / 2:g}pt" for p in (6.5, 7, 8, 9, 10, 12))
    return (f" 이 본문 서체는 같은 pt 에서 다른 본문 서체보다 {'작게' if k > 1 else '크게'} 보인다 — 규칙·참고 문서에 적힌 본문 서체 크기에 "
            f"×{k:g} 해서 쓴다({ex}). 제목 서체로 쓰는 키메시지·표지·간지 큰 글자는 그대로.")


def files_hint(title=None, body=None):
    """지시문에 넣는 서체 파일 경로 — 에이전트가 글 폭을 잴 때(리눅스에는 Windows 서체 폴더가 없다)"""
    _, b, key, faces, _ = pick(title or TITLE_ID, body or BODY_ID)
    out = []
    for lv, f in enumerate(faces):
        p = INSTALLED.get(f.lower()) or file(lv, b)
        out.append(f"`{f}` = `{p}`")
    out.append(f"`{key}` = `{INSTALLED.get(key.lower()) or title_file(title)}`")
    return " · ".join(out)
