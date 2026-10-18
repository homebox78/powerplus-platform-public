# -*- coding: utf-8 -*-
"""서체 언어 지원율 — 서체 파일의 cmap(글자표)을 직접 읽어 언어마다 대표 글자 집합 중 몇 %가 있는지 잰다(손으로 적지 않는다).

사용자 2026-10-18 "언어별 서체"(니 추천대로 · 다른 언어도 마찬가지): 장표 언어 8개(ko·en·ja·zh·fr·es·de·vi)를 받는데 서체는 한글 서체뿐이라
일본어 장표(94a16d8dee7e9c8a, 제목 G마켓·본문 프리젠테이션)의 가나가 안 그려졌다. 이 표로 엔진(fontset.for_lang)과 웹 서체 고르기가 같은 판단을 한다.

  - 언어 지원율 = 그 언어 글자 묶음(예: 일본어 = 히라가나·가타카나·한자·문장부호)마다 잰 % 중 **가장 낮은 값**.
    가나가 0 이고 한자만 있는 서체(프리젠테이션)가 평균으로는 높게 나오지 않게 묶음별 최솟값으로 잡는다.
  - 대표 글자: 한국어 KS X 1001 한글 2,350자 / 일본어 가나 + JIS 1수준 한자 2,965자 / 중국어 GB2312 1급 간체 3,755자 /
    베트남어 성조 모음 144자 + Đđ / 프랑스·스페인·독일어 악센트 글자(ẞ 제외) / 공통 기본 라틴 A–Z·a–z. 모두 표준 문자 코드표에서 만든다.
  - 쓰기: engine/fonts/font_cover.json(엔진이 읽음 — 배포가 올린다, R12) + apps/web/.../data/font_cover.json(웹 서체 고르기). 두 파일은 같은 내용.
fontTools 없이 표준 OpenType cmap(형식 4·12)만 읽는다(엔진 서버에 fontTools 가 없다 — fontlicense.py 와 같은 방식).
실행: python fontcover.py            → 두 JSON 다시 씀
      python fontcover.py --check    → 지금 서체 파일로 다시 재서 JSON 과 다르면 1(배포 전 시험)
      python fontcover.py <서체파일…> → 그 파일들의 언어별 지원율 출력"""
import json, os, struct, sys, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(HERE, "fonts")
OUT = os.path.join(FONT_DIR, "font_cover.json")
WEB_OUT = os.path.join(os.path.dirname(HERE), "apps", "web", "app", "modules", "deck", "legacy", "data", "font_cover.json")
MIN = 95   # 이 % 미만이면 그 언어에 못 쓰는 서체(엔진은 바꾸고, 웹은 흐리게)

LANG_NAME = {"ko": "한국어", "en": "영어", "ja": "일본어", "zh": "중국어", "fr": "프랑스어", "es": "스페인어", "de": "독일어", "vi": "베트남어"}
LANG_TAG = {"ko": "ko-KR", "en": "en-US", "ja": "ja-JP", "zh": "zh-CN", "fr": "fr-FR", "es": "es-ES", "de": "de-DE", "vi": "vi-VN"}


# ───────────────────────── cmap 읽기
_CMAP = {}


def cmap(path):
    """서체 파일이 가진 글자(코드 포인트) 집합. ttc 는 첫 서체. 못 읽으면 빈 집합"""
    if path in _CMAP:
        return _CMAP[path]
    out = set()
    try:
        with open(path, "rb") as f:
            data = f.read()
        base = struct.unpack(">I", data[12:16])[0] if data[:4] == b"ttcf" else 0
        n = struct.unpack(">H", data[base + 4:base + 6])[0]
        toff = None
        for i in range(n):
            tag, _, off, _ = struct.unpack(">4sIII", data[base + 12 + 16 * i: base + 28 + 16 * i])
            if tag == b"cmap":
                toff = off
        if toff is not None:
            cnt = struct.unpack(">H", data[toff + 2:toff + 4])[0]
            subs = []
            for i in range(cnt):
                pid, eid, so = struct.unpack(">HHI", data[toff + 4 + 8 * i: toff + 12 + 8 * i])
                fmt = struct.unpack(">H", data[toff + so: toff + so + 2])[0]
                if (pid, eid) in ((3, 10), (0, 4), (0, 6)) and fmt == 12:
                    subs.insert(0, (fmt, toff + so))
                elif (pid, eid) in ((3, 1), (0, 3), (0, 1), (0, 0)) and fmt == 4:
                    subs.append((fmt, toff + so))
            for fmt, o in subs[:1] + [s for s in subs[1:] if s[0] == 4][:1]:   # 형식 12(전체) 하나 + 형식 4(BMP) 하나를 합친다
                out |= _fmt12(data, o) if fmt == 12 else _fmt4(data, o)
    except Exception:
        pass
    _CMAP[path] = out
    return out


def _fmt4(d, o):
    seg = struct.unpack(">H", d[o + 6:o + 8])[0] // 2
    ends = struct.unpack(f">{seg}H", d[o + 14:o + 14 + 2 * seg])
    st = o + 16 + 2 * seg
    starts = struct.unpack(f">{seg}H", d[st:st + 2 * seg])
    deltas = struct.unpack(f">{seg}h", d[st + 2 * seg:st + 4 * seg])
    ro = st + 4 * seg
    ranges = struct.unpack(f">{seg}H", d[ro:ro + 2 * seg])
    out = set()
    for i in range(seg):
        for c in range(starts[i], ends[i] + 1):
            if c == 0xFFFF:
                continue
            if ranges[i] == 0:
                g = (c + deltas[i]) & 0xFFFF
            else:
                p = ro + 2 * i + ranges[i] + 2 * (c - starts[i])
                g = struct.unpack(">H", d[p:p + 2])[0]
                g = (g + deltas[i]) & 0xFFFF if g else 0
            if g:
                out.add(c)
    return out


def _fmt12(d, o):
    n = struct.unpack(">I", d[o + 12:o + 16])[0]
    out = set()
    for i in range(n):
        a, b, g = struct.unpack(">III", d[o + 16 + 12 * i: o + 28 + 12 * i])
        out.update(range(a, b + 1)) if g else out.update(range(a + 1, b + 1))   # 글리프 0(.notdef)으로 가는 첫 글자는 없는 것
    return out


# ───────────────────────── 언어별 대표 글자(표준 문자 코드표에서 만든다)
def _decode(enc, hi, lo, skip=()):
    out = []
    for a in hi:
        for b in lo:
            if (a, b) in skip:
                continue
            try:
                ch = bytes([a, b]).decode(enc)
            except UnicodeDecodeError:
                continue
            if len(ch) == 1:
                out.append(ch)
    return out


def _latin():
    return [chr(c) for c in range(0x41, 0x5B)] + [chr(c) for c in range(0x61, 0x7B)]


def _upper(s):
    return s + s.upper()


def _vi():
    base = "aăâeêioôơuưy"
    tones = ["", "̀", "́", "̉", "̃", "̣"]   # 없음·huyền·sắc·hỏi·ngã·nặng
    out = [unicodedata.normalize("NFC", v + t) for v in base for t in tones]
    out = [c for c in out if len(c) == 1]
    return [c for c in out] + [c.upper() for c in out] + ["đ", "Đ"]


def _jis1():   # JIS X 0208 1수준 한자(Shift_JIS 0x889F~0x9872)
    out = []
    for a in range(0x88, 0x99):
        for b in list(range(0x40, 0x7F)) + list(range(0x80, 0xFD)):
            if (a == 0x88 and b < 0x9F) or (a == 0x98 and b > 0x72):
                continue
            try:
                ch = bytes([a, b]).decode("shift_jis")
            except UnicodeDecodeError:
                continue
            if len(ch) == 1 and unicodedata.category(ch) == "Lo":
                out.append(ch)
    return out


def groups():
    """{언어: {묶음 이름: [글자…]}}"""
    lat = _latin()
    return {
        "ko": {"한글(KS X 1001 2,350자)": _decode("euc-kr", range(0xB0, 0xC9), range(0xA1, 0xFF)), "기본 라틴": lat},
        "ja": {"히라가나": [chr(c) for c in range(0x3041, 0x3097)], "가타카나": [chr(c) for c in range(0x30A1, 0x30FB)] + ["ー"],
               "한자(JIS 1수준)": _jis1(), "문장부호": list("、。「」『』・〜！？（）"), "기본 라틴": lat},
        "zh": {"간체(GB2312 1급)": _decode("gb2312", range(0xB0, 0xD8), range(0xA1, 0xFF), skip={(0xD7, b) for b in range(0xFA, 0xFF)}),
               "문장부호": list("，。、；：？！“”‘’（）《》【】—…·"), "기본 라틴": lat},
        "vi": {"성조 글자": _vi(), "기본 라틴": lat},
        "fr": {"악센트": list(_upper("àâæçéèêëîïôœùûüÿ")) + ["«", "»", "’"], "기본 라틴": lat},
        "es": {"악센트": list(_upper("áéíóúüñ")) + ["¿", "¡"], "기본 라틴": lat},
        "de": {"악센트": list(_upper("äöü")) + ["ß", "„", "“"], "기본 라틴": lat},
        "en": {"기본 라틴": lat, "문장부호": list("‘’“”–—…")},
    }


_G = None


def _groups():
    global _G
    if _G is None:
        _G = groups()
    return _G


def cover_files(paths):
    """서체 파일들(한 벌이면 굵기 전부)의 언어별 지원율 — {언어: {"pct": 최솟값, "groups": {묶음: %}}}. 파일이 여럿이면 묶음마다 가장 낮은 파일 기준"""
    cms = [cmap(p) for p in paths]
    out = {}
    for lg, gs in _groups().items():
        gp = {}
        for name, chars in gs.items():
            cps = {ord(c) for c in chars}
            gp[name] = min(round(100 * len(cps & cm) / len(cps), 1) if cm else 0.0 for cm in cms) if cms else 0.0
        out[lg] = {"pct": min(gp.values()), "groups": gp}
    return out


# ───────────────────────── 실제 글 검사(엔진이 장표를 만들기 전에)
def _script_ok(lang, cp):
    """그 언어 장표에서 서체가 꼭 가져야 할 글자인가 — 그 언어 문자(+ 라틴 글자). 다른 문자(한국어 글 속 한자 등)는 PowerPoint 대체 서체에 맡긴다"""
    latin = cp < 0x250 or 0x1E00 <= cp <= 0x1EFF
    if lang == "ko":   # 한국어 장표 속 악센트 낱말(café)·한자는 서체 전체를 바꾸지 않는다 — 그 글 런만 fontbundle.fallback 이 바꾼다
        return cp < 0x80 or 0xAC00 <= cp <= 0xD7A3 or 0x1100 <= cp <= 0x11FF or 0x3130 <= cp <= 0x318F
    if lang == "ja":
        return latin or 0x3040 <= cp <= 0x30FF or 0x4E00 <= cp <= 0x9FFF or 0x3400 <= cp <= 0x4DBF or 0x31F0 <= cp <= 0x31FF
    if lang == "zh":
        return latin or 0x4E00 <= cp <= 0x9FFF or 0x3400 <= cp <= 0x4DBF
    return latin


def letters(text, lang):
    """글에서 서체가 가져야 할 글자(문자 범주 L — 숫자·문장부호·기호는 빼고)"""
    out = set()
    for ch in unicodedata.normalize("NFC", text or ""):
        cp = ord(ch)
        if unicodedata.category(ch)[0] == "L" and _script_ok(lang, cp):
            out.add(cp)
    return out


def missing(paths, text, lang):
    """서체 파일들 중 하나라도 없는 글자(문자열, 코드 순)"""
    need = letters(text, lang)
    if not need:
        return ""
    lack = set()
    for p in paths:
        lack |= need - cmap(p)
    return "".join(chr(c) for c in sorted(lack))


# ───────────────────────── 표 만들기
def build():
    fl = json.load(open(os.path.join(FONT_DIR, "fonts.json"), encoding="utf-8"))
    out = {"_doc": "서체 언어 지원율(%) — engine/fontcover.py 가 서체 파일 cmap 으로 잰 값(손으로 고치지 말 것). pct = 그 언어 글자 묶음별 % 중 최솟값. "
                   f"min({MIN}) 미만이면 그 언어에 못 쓴다(엔진 fontset.for_lang 이 바꾸고, 웹 서체 고르기는 흐리게).",
           "min": MIN, "langs": {k: {"name": LANG_NAME[k], "tag": LANG_TAG[k], "groups": {g: len(c) for g, c in v.items()}} for k, v in _groups().items()},
           "title": {}, "body": {}}
    for t in fl["title"]:
        c = cover_files([os.path.join(FONT_DIR, t["file"])])
        out["title"][t["id"]] = {k: v["pct"] for k, v in c.items()}
        out["title"][t["id"]]["_groups"] = {k: v["groups"] for k, v in c.items()}
    for b in fl["body"]:
        c = cover_files([os.path.join(FONT_DIR, f) for f in b["files"]])
        out["body"][b["id"]] = {k: v["pct"] for k, v in c.items()}
        out["body"][b["id"]]["_groups"] = {k: v["groups"] for k, v in c.items()}
    return out


def _dump(d):
    return json.dumps(d, ensure_ascii=False, indent=1) + "\n"


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if args:
        for p in args:
            c = cover_files([p])
            print(os.path.basename(p), " · ".join(f"{k} {v['pct']:g}" for k, v in c.items()))
        sys.exit(0)
    d = build()
    if "--check" in sys.argv:
        bad = [p for p in (OUT, WEB_OUT) if not os.path.isfile(p) or open(p, encoding="utf-8").read() != _dump(d)]
        if bad:
            print("서체 지원율 표가 서체 파일과 다릅니다 — python engine/fontcover.py 로 다시 쓰세요:", ", ".join(bad))
            sys.exit(1)
        print("서체 지원율 표 = 서체 파일 실측과 같음")
        sys.exit(0)
    for p in (OUT, WEB_OUT):
        open(p, "w", encoding="utf-8", newline="\n").write(_dump(d))
    w = max(len(i) for i in list(d["title"]) + list(d["body"]))
    print(f"{'':{w + 7}}" + " ".join(f"{k:>5}" for k in LANG_NAME))
    for kind in ("title", "body"):
        for i, v in d[kind].items():
            print(f"{kind:5} {i:{w}}  " + " ".join(f"{v[k]:5g}" for k in LANG_NAME))
    print("→", OUT, "/", WEB_OUT)
