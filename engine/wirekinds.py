# -*- coding: utf-8 -*-
"""와이어프레임 상자 종류 한 벌 — engine/wire_kinds.json 을 읽는다(단일 원본, 2026-10-18).

종류 목록·이름·아이콘·기본 크기·부류는 이 JSON 한 곳에만 둔다. 서버(api/src/Deck/WireKinds.php)·화면(legacy/data/wire_kinds.json)은
바이트까지 같은 사본을 읽는다(preflight 10번). 종류마다 다른 글 읽기·그리기·높이 셈은 코드(design.py·WireLayout.php·WireSketch.tsx)에 둔다.
prompt_wire.md 의 {{WIRE_…}} 자리는 여기서 채운다 — 서버 WireKinds::prompt 와 같은 글이 나와야 한다(engine/tests/test_wire_kinds.py).
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
REG = json.load(open(os.path.join(HERE, "wire_kinds.json"), encoding="utf-8"))
BY = {x["k"]: x for x in REG["kinds"]}
KINDS = tuple(BY)
PIC = tuple(k for k in KINDS if BY[k].get("pic"))       # 그림 자리(인물·그림·화면·지도)
FORM = tuple(k for k in KINDS if BY[k].get("form"))     # 주인공 도식(형태 상자)
DATA = tuple(k for k in KINDS if BY[k].get("data"))     # 메시지·강조를 받는 데이터 그림
CHART_TYPES = tuple(t["id"] for t in REG["chart_types"])
_ALIAS = {a.lower().replace(" ", ""): t["id"] for t in REG["chart_types"] for a in t["aliases"]}
_META_KEY = {a.lower(): key for key, names in REG["meta"].items() for a in names}
META_LINE = re.compile(r"^\s*[-•]?\s*(" + "|".join(sorted(map(re.escape, _META_KEY), key=len, reverse=True)) + r")\s*[:：]\s*(.*)$", re.I)


def label(k):
    return (BY.get(k) or {}).get("label", k)


def cls(k):
    """배치 틀 칸 부류 — visual · text · band (모르는 종류는 text)"""
    return (BY.get(k) or {}).get("cls", "text")


def chart_type(s):
    """'꺾은선'·'Line' → 'line'. 모르면 빈 글"""
    return _ALIAS.get(str(s or "").strip().lower().replace(" ", ""), "")


def meta(d):
    """데이터 그림의 머리 줄(유형·단위·강조·말풍선·메시지·출처)을 떼어 낸다 → (dict, 나머지 줄)"""
    out, rest = {}, []
    for l in str(d or "").splitlines():
        m = META_LINE.match(l)
        if m:
            out[_META_KEY[m.group(1).lower()]] = m.group(2).strip()
        else:
            rest.append(l)
    return out, rest


def _table():
    rows = []
    for x in REG["kinds"]:
        if x.get("use"):
            look = f" ({x['look']})" if x.get("look") else ""
            rows.append(f"| {x['use']} | `{x['k']}`{look} | {x.get('ref') or '레퍼런스'} |")
    return "\n".join(rows)


def _formats():
    rows, seen = [], set()
    for x in REG["kinds"]:
        f = x.get("fmt") or ""
        if not f or f in seen:
            continue
        seen.add(f)
        rows.append(f"- {' · '.join(y['k'] for y in REG['kinds'] if y.get('fmt') == f)}: {f}")
    return "\n".join(rows)


def prompt(text):
    """prompt_wire.md 의 자리 채우기 — 종류 표·쓰는 법·주인공 목록·데이터 그림 목록"""
    return (str(text or "").replace("{{WIRE_KIND_TABLE}}", _table()).replace("{{WIRE_KIND_FORMATS}}", _formats())
            .replace("{{WIRE_HERO_KINDS}}", "·".join(FORM)).replace("{{WIRE_DATA_KINDS}}", "·".join(DATA)))


def read_prompt():
    with open(os.path.join(HERE, "prompt_wire.md"), encoding="utf-8") as f:
        return prompt(f.read())
