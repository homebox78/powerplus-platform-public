# -*- coding: utf-8 -*-
"""디자인 타입(reference/styles/styles.json) — 새 변환에서 고른 타입(opts.style)에 따라
시안 이미지 지시·표지 지시·머리 띠 틀·장표 제작 규칙·참고 그림을 고른다. 모르는 타입이면 a(공공 제안 클레이)."""
import glob, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.normpath(os.path.join(HERE, "..", "reference", "styles"))


def all_styles():
    try:
        return json.load(open(os.path.join(REF, "styles.json"), encoding="utf-8")).get("styles") or []
    except Exception:
        return []


def get(sid):
    ss = all_styles()
    return next((s for s in ss if s.get("id") == sid), None) or next((s for s in ss if s.get("id") == "a"), None) or {"id": "a"}


def of_job(j):
    """작업 옵션의 타입 id"""
    o = j.get("opts") if isinstance(j, dict) else None
    if isinstance(o, str):
        try:
            o = json.loads(o)
        except Exception:
            o = None
    return str((o or {}).get("style") or "a")


def frame(st, accent):
    """타입의 틀 값 — '{accent}' 는 작업 강조색으로 바꾼다(F 타입의 강조색 띠)"""
    acc = (accent or "#FF2A6D").lstrip("#")[:6].upper()
    fr = json.loads(json.dumps(st.get("frame") or {}))
    for k, v in list(fr.items()):
        if isinstance(v, list):
            fr[k] = [acc if x == "{accent}" else x for x in v]
        elif v == "{accent}":
            fr[k] = acc
    return fr


def nb2_model():
    """나노바나나 2 의 모델 이름(styles.json 의 nb2_model)"""
    try:
        return json.load(open(os.path.join(REF, "styles.json"), encoding="utf-8")).get("nb2_model") or "google/gemini-3.1-flash-image"
    except Exception:
        return "google/gemini-3.1-flash-image"


def guide(sid, limit=7000):
    """그 타입의 가이드(reference/styles/<id>/guide.md) — 조사 보고서의 타입 분석 + SI 제안서에 쓰는 법. 없으면 빈 글"""
    try:
        return open(os.path.join(REF, sid, "guide.md"), encoding="utf-8").read()[:limit]
    except Exception:
        return ""


def catalog_text(sid):
    """본문 참고 장 목록을 글로 — 기획이 장마다 하나(sref)를 고른다"""
    return chr(10).join(f"- {c['n']}: {c.get('what', '')} — 쓰임: {c.get('use', '')}" for c in (get(sid).get("catalog") or []))


def ref_file(sid, n):
    """참고 장 번호 → 파일(없으면 None)"""
    fs = sorted(glob.glob(os.path.join(REF, sid, "refs", "*.jpg")) + glob.glob(os.path.join(REF, sid, "refs", "*.png")))
    try:
        n = int(n)
    except (TypeError, ValueError):
        return None
    return fs[n - 1] if 1 <= n <= len(fs) else None


def refs(sid, n=3):
    """그 타입의 참고 그림 파일(reference/styles/<id>/refs) — 시안 이미지 모델에 화풍 기준으로 넘긴다.
    본문 시안에는 본문 장을 줘야 한다: styles.json 의 body_refs(1부터 세는 번호) 순서로 고른다.
    없으면 앞에서부터(대개 표지·간지·목차라 본문 느낌이 안 난다 — body_refs 를 적어 둘 것)."""
    fs = sorted(glob.glob(os.path.join(REF, sid, "refs", "*.jpg")) + glob.glob(os.path.join(REF, sid, "refs", "*.png")))
    pick = [fs[i - 1] for i in (get(sid).get("body_refs") or []) if isinstance(i, int) and 1 <= i <= len(fs)]
    return (pick or fs)[:n]
