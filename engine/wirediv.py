# -*- coding: utf-8 -*-
"""덱 전체 와이어의 다양성 점검 — '똑같은 것만 찍어 내는 공장형' 을 숫자로 잡는다(2026-10-18 와이어 고도화 B2).

장마다 서명(signature)을 만든다: 칸 나눔(상자마다 12칸 격자의 시작·폭) + 종류 묶음 + 주 시각물.
걸리는 것:
  ① 앞 장과 같은 칸 나눔 / 같은 종류 조합(주 시각물까지 같음)
  ② 같은 주 시각물이 덱에서 3번 넘게, 또는 본문의 40% 넘게(그래프는 유형까지 — line·donut 은 다른 그림)
  ③ 자료의 표·시계열이 붙은 장인데 수치 그림(chart·kpi·table·gauge·progress…)이 없음
  ④ 서버 배치 검사(wire_checks)의 데이터 규칙 위반(수치 2개 미만 그래프·% 합·달성률·글 상자만…)
걸린 장 가운데 덱의 30%(최대 6장)만 다시 짠다 — design.diversify_wires. AI 없음(시험: tests/test_datafacts.py).
"""
import re
import wirekinds as K

DATA_RULE = re.compile(r"(그래프에 수치가|도넛의 % 합|비율\(%\)의 합|달성률|깔때기 수치|수치가 \d+개입니다 — 큰 수치|글 상자로만 짰습니다|기획의 수치가 와이어프레임에 없습니다|같은 꼴 수치 카드|두 계열을 그래프 \d개로)")
NUMS = re.compile(r"\d[\d,]*(?:\.\d+)?")
NUM_FORMS = ("triad", "consortium", "timeline", "stairs", "rowgrid", "screenshift")   # 수치를 칸에 담는 2차 도식


def same_cards(wire):
    """같은 꼴 수치 카드 — 글이 숫자만 다르고 모양이 같은 card·panel·text 가 3개 이상이면 [제목…] (E2E 742 4쪽: 기관마다 '인력 N명·일평균 N건' 카드 4개).
    서버 WireLayout::check 와 같은 규칙. 이런 병렬 수치는 표나 그래프 하나로 짜야 비교가 된다"""
    groups = {}
    for b in _boxes(wire):
        if b["k"] not in ("card", "panel", "text"):
            continue
        ls = [l.strip() for l in str(b.get("d") or "").splitlines() if l.strip()]
        if not ls or not any(NUMS.search(l) for l in ls):
            continue
        groups.setdefault(tuple(NUMS.sub("#", l) for l in ls), []).append(str(b.get("t") or ""))
    best = max(groups.values(), key=len, default=[])
    return best if len(best) >= 3 else []


def chart_labels(d):
    """chart 글의 데이터 줄 라벨(계열 하나짜리만) — 머리 줄·계열 머리 제외. 계열이 둘 이상이면 None"""
    labs = []
    for l in K.meta(d)[1]:
        c = [x.strip() for x in l.strip().strip("|").split("|")] if "|" in l else []
        if len(c) < 2 or not NUMS.match(c[1]):
            if len(c) >= 3 and labs == []:
                return None   # '구분 | 전화 | 온라인' — 이미 계열 여럿
            continue
        if len(c) > 2 and NUMS.match(c[2] or ""):
            return None
        labs.append(c[0])
    return labs


def split_series(wire):
    """같은 범주(같은 해·같은 항목)를 계열 하나짜리 그래프 둘로 쪼갰는가 → (그래프 수, 겹친 라벨) 또는 None (E2E 742 3쪽: 2021~2025 전화·온라인 막대 2개)"""
    cs = [(b, chart_labels(b.get("d"))) for b in _boxes(wire) if b["k"] == "chart"]
    cs = [(b, set(l)) for b, l in cs if l]
    for i in range(len(cs)):
        same = [cs[i]] + [x for x in cs[i + 1:] if len(cs[i][1] & x[1]) >= 3 and len(cs[i][1] & x[1]) >= 0.6 * min(len(cs[i][1]), len(x[1]))]
        if len(same) >= 2:
            return len(same), sorted(cs[i][1] & same[1][1])
    return None
SKIP = ("band", "text")


def _boxes(wire):
    return [b for b in wire or [] if isinstance(b, dict) and b.get("k")]


def _area(b):
    try:
        return float(b.get("w", 0)) * float(b.get("h", 0))
    except (TypeError, ValueError):
        return 0.0


def main_key(wire):
    """주 시각물 — 가장 넓은 주인공 도식(form), 없으면 가장 넓은 그림 자리, 그것도 없으면 가장 넓은 글 상자. 그래프는 'chart:line' 처럼 유형까지"""
    bs = [b for b in _boxes(wire) if b["k"] not in SKIP]
    if not bs:
        return ""
    for pool in ([b for b in bs if b["k"] in K.FORM], [b for b in bs if b["k"] in K.PIC], bs):
        if pool:
            b = max(pool, key=_area)
            if b["k"] == "chart":
                t = K.chart_type(K.meta(b.get("d"))[0].get("type", "")) or "bar"
                return "chart:" + t
            return b["k"]
    return ""


def geom(wire):
    """칸 나눔 — 상자마다 (12칸 격자 시작, 폭). 결론 띠는 따로 표시. 같은 배치 틀이면 높이가 글 양으로 달라도 같게 나온다"""
    cols = []
    band = False
    for b in _boxes(wire):
        if b["k"] == "band":
            band = True
            continue
        try:
            cols.append((round(float(b["x"]) * 12 / 100), max(1, round(float(b["w"]) * 12 / 100))))
        except (KeyError, TypeError, ValueError):
            continue
    return tuple(sorted(cols)) + (("band",) if band else ())


def kinds(wire):
    return frozenset(b["k"] for b in _boxes(wire) if b["k"] not in SKIP)


def describe(wire):
    """다시 짤 때 이웃 장을 알려 주는 한 줄 — '주인공 chart:line · 칸 0+8 / 8+4'"""
    g = [f"{x}+{w}" for x, w in (c for c in geom(wire) if c != "band")]
    return f"주인공 {main_key(wire) or '없음'} · 칸 {' / '.join(g)}" + (" · 결론 띠" if "band" in geom(wire) else "")


def _label(key):
    k, _, t = key.partition(":")
    return K.label(k) + (f"({t})" if t else "")


def flag(slides, has_data=None):
    """{쪽: [문제 글]} — 문제 없는 장은 빠진다. has_data(s) → 이 장에 붙은 자료 데이터셋이 있는가(없으면 s['data'] 로 본다)"""
    has_data = has_data or (lambda s: bool([x for x in (s.get("data") or []) if str(x).upper().startswith("D")]))
    body = [s for s in slides if _boxes(s.get("wire"))]
    out = {}
    if not body:
        return out
    add = lambda n, t: None if t in out.get(n, []) else out.setdefault(n, []).append(t)   # noqa: E731
    for s in body:   # 장 하나 안의 짜임 — 같은 꼴 수치 카드 나열 · 같은 범주 두 계열을 그래프 둘로(E2E 742, 서버 check 와 같은 글)
        sc = same_cards(s["wire"])
        if sc:
            add(s["n"], f"같은 꼴 수치 카드 {len(sc)}개({', '.join(t for t in sc if t)[:40]}) — 표(table)나 그래프(chart) 하나로 묶어 비교하세요")
        sp = split_series(s["wire"])
        if sp:
            add(s["n"], f"같은 범주({sp[1][0]}~{sp[1][-1]})의 두 계열을 그래프 {sp[0]}개로 쪼갰습니다 — 계열 {sp[0]}개짜리 한 그래프(line 또는 묶음 막대)로")
    for prev, cur in zip(body, body[1:]):
        gp, gc = geom(prev["wire"]), geom(cur["wire"])
        if gp == gc and len(gc) > 1:
            add(cur["n"], f"앞 장({prev['n']}쪽)과 같은 배치(칸 {' / '.join(f'{x}+{w}' for x, w in (c for c in gc if c != 'band'))})입니다 — 주 시각물의 자리·칸 비율을 바꾼다")
        elif kinds(prev["wire"]) == kinds(cur["wire"]) and main_key(prev["wire"]) == main_key(cur["wire"]):
            add(cur["n"], f"앞 장({prev['n']}쪽)과 같은 종류 조합({', '.join(sorted(kinds(cur['wire'])))})입니다 — 이 장의 관계에 맞는 다른 주 시각물로")
    mains = {}
    for s in body:
        mains.setdefault(main_key(s["wire"]), []).append(s["n"])
    for key, ns in mains.items():
        c = len(ns)
        if key and c >= 3 and (c > 3 or c > 0.4 * len(body)):
            for n in ns[2:]:   # 처음 두 장은 두고 그 뒤부터
                add(n, f"주 시각물 {_label(key)} 이 덱에서 {c}번 나옵니다 — 이 장의 관계(추이·비교·구성·절차…)에 맞는 다른 종류로")
    for s in body:
        # 수치를 담은 2차 도식(이슈·방안·효과의 '12.4분 → 2.1분', 컨소시엄 지분, 이정표 수치…)도 수치 그림으로 본다(E2E 742 9쪽)
        if has_data(s) and not any(b["k"] in K.DATA or (b["k"] in NUM_FORMS and NUMS.search(str(b.get("d") or ""))) for b in _boxes(s["wire"])):
            refs = ", ".join(str(x) for x in (s.get("data") or []) if str(x).upper().startswith("D")) or "자료 표"
            add(s["n"], f"이 장에는 자료의 표·시계열({refs})이 있는데 수치 그림이 없습니다 — 그 값으로 chart·kpi·table·progress 가운데 맞는 것을 주 시각물로")
        for c in s.get("wire_checks") or []:
            if DATA_RULE.search(str(c)):
                add(s["n"], str(c))
    return out


def pick(flags, total, cap_ratio=0.3, cap_max=6):
    """다시 짤 장 — 데이터 문제가 있는 장 먼저, 문제가 많은 장 먼저. 덱의 30%(최대 6장)까지"""
    cap = min(cap_max, max(1, int(total * cap_ratio)))
    data_first = lambda n: any(("수치 그림" in t or DATA_RULE.search(t)) for t in flags[n])   # noqa: E731
    order = sorted(flags, key=lambda n: (not data_first(n), -len(flags[n]), n))
    return sorted(order[:cap])


def score(slides, n, wire, checks, has_data=None):
    """한 장의 점수(낮을수록 좋다) — 배치 검사 수 + 그 장을 이 wire 로 바꿨을 때 다양성 문제 수"""
    trial = [dict(s, wire=wire, wire_checks=checks) if s.get("n") == n else s for s in slides]
    return len(checks or []) + len(flag(trial, has_data).get(n, []))
