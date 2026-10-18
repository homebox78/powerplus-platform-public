# -*- coding: utf-8 -*-
"""와이어 도식 2차 16종 — 글 읽기 · 회색조 스케치(wire_png) · 시안 지시(wire_text) (2026-10-18, docs/와이어-유형-분석-컨텐츠모음.md §7).

실제 제안 장표 540장 가운데 지금 종류로 표현 못 하던 구조(구성도·조직도·추적 매핑·순서도·연계도…)를 위한 종류.
글 형식은 wire_kinds.json fmt 와 같고, 같은 규칙을 서버(api/src/Deck/WireLayout.php — 높이 셈·판정)와
화면(apps/web/app/modules/deck/legacy/wireParse.ts · WireSketch.tsx)이 따로 읽는다. 견본은 tests/wire_kind_samples.json.
design.wire_png · wire_text 는 종류 이름을 갈래로 적어 두고(시험이 대조) 실제 그리기·지시는 여기서 한다.
"""
import math
import re

KINDS = ("arch", "stepcols", "derive", "askanswer", "linkage", "org", "voices", "screenshift",
         "triad", "flowchart", "rowgrid", "timeline", "stairs", "consortium", "trace", "twinhub")

INK, SUB, LINE, PALE = (51, 65, 85), (100, 116, 139), (148, 163, 184), (241, 245, 249)
DARK, MID, EDGE, SOFT, BLUE, WHITE = (30, 41, 59), (71, 85, 105), (203, 213, 225), (226, 232, 240), (37, 99, 235), (255, 255, 255)
PIC = re.compile(r"^\s*(그림|장면|삽화|figure|scene|picture|image|illustration|photo)\s*[:：]\s*", re.I)
SRC = re.compile(r"^\s*[-•]?\s*(출처|자료|source)\s*[:：]\s*(.+)$", re.I)
ARROW = re.compile(r"\s*(?:-+>|→|=>|⇒)\s*")


# ───────────────────────── 글 읽기 ─────────────────────────
def _lines(d):
    return [l.strip() for l in str(d or "").splitlines() if l.strip() and "보강 필요" not in l]


def _cells(l):
    return [c.strip() for c in l.strip().strip("|").split("|")]


def _bul(l):
    return re.sub(r"^\s*([-•·]|\d+[.)])\s+", "", l).strip()


def _head(l, *names):
    """'방향: 가로' → '가로' (머리 줄 이름이 맞을 때만, 아니면 None)"""
    m = re.match(r"^\s*[-•]?\s*(" + "|".join(names) + r")\s*[:：]\s*(.*)$", l, re.I)
    return m.group(2).strip() if m else None


def _split(s):
    return [x.strip() for x in re.split(r"[,，、]", str(s or "")) if x.strip()]


def _colon(s):
    """'이름: 설명' → (이름, 설명)"""
    m = re.match(r"^([^:：]+)[:：]\s*(.*)$", s)
    return (m.group(1).strip(), m.group(2).strip()) if m else (s.strip(), "")


def _unq(s):
    return str(s or "").strip().strip("\"“”'‘’「」 ")


def arch(d):
    """구성도 — '[영역] 노드, DB:노드' · 'A -> B | 라벨' · '방향: 가로|세로' · '강조: 영역'"""
    o = {"dir": "가로", "hl": "", "zones": [], "links": []}
    for l in _lines(d):
        v = _head(l, "방향", "direction")
        if v is not None:
            o["dir"] = "세로" if re.search(r"세로|vertical|위", v, re.I) else "가로"
            continue
        v = _head(l, "강조", "highlight")
        if v is not None:
            o["hl"] = v
            continue
        m = re.match(r"^\s*[-•]?\s*\[([^\]]+)\]\s*(.*)$", l)
        if m:
            nodes = [{"name": re.sub(r"^DB\s*[:：]\s*", "", x, flags=re.I).strip(), "db": bool(re.match(r"^DB\s*[:：]", x, re.I))} for x in _split(m.group(2))]
            o["zones"].append({"name": m.group(1).strip(), "nodes": nodes[:8]})
            continue
        if ARROW.search(l):
            body, _, lab = l.partition("|")
            parts = [p.strip(" -•") for p in ARROW.split(body) if p.strip(" -•")]
            for a, b in zip(parts, parts[1:]):
                o["links"].append({"a": a, "b": b, "label": lab.strip()})
    o["zones"], o["links"] = o["zones"][:6], o["links"][:8]
    return o


def arch_nodes(o):
    return sum(len(z["nodes"]) for z in o["zones"])


def _zone_of(o, name):
    """연결 끝 이름 → 영역 번호(영역 이름 또는 그 안 노드 이름). 모르면 -1"""
    n = name.strip()
    for i, z in enumerate(o["zones"]):
        if z["name"] == n:
            return i
    for i, z in enumerate(o["zones"]):
        if any(x["name"] == n for x in z["nodes"]):
            return i
    for i, z in enumerate(o["zones"]):
        if n and (n in z["name"] or z["name"] in n):
            return i
    return -1


def stepcols(d):
    """단계별 세부 — '# 단계 | 기간' + '- 항목' · '결과: 한 줄'. '#' 없이 '단계: 항목, 항목' 도 읽는다"""
    steps, result, plain = [], "", []
    for l in _lines(d):
        v = _head(l, "결과", "result")
        if v is not None:
            result = v
            continue
        m = re.match(r"^\s*#+\s*(.+)$", l)
        if m:
            c = _cells(m.group(1))
            steps.append({"name": c[0], "period": c[1] if len(c) > 1 else "", "items": []})
        elif steps:
            steps[-1]["items"].append(_bul(l))
        else:
            plain.append(l)
    if not steps:
        for l in plain:
            nm, rest = _colon(_bul(l))
            steps.append({"name": nm, "period": "", "items": _split(rest)})
    return {"steps": [dict(s, items=s["items"][:6]) for s in steps[:6]], "result": result}


_DER = ((r"특성|현황|환경|배경|요구|이슈|문제|여건", 0), (r"시사점|성공\s*요인|핵심|고려|과제", 1), (r"전략|방안|추진|대응", 2))


def derive(d):
    """전략 도출 — '특성 | 항목' · '시사점 | 항목' · '전략 | 01 이름: 세부, 세부'"""
    names, cols = ["", "", ""], [[], [], []]
    for l in _lines(d):
        if "|" not in l:
            continue
        tag, rest = [x.strip() for x in _bul(l).split("|", 1)]
        for pat, i in _DER:
            if re.match(r"^(" + pat + r")", tag):
                names[i] = names[i] or tag
                cols[i].append(rest)
                break
    strats = []
    for s in cols[2]:
        m = re.match(r"^\s*(\d{1,2})[.)]?\s+(.*)$", s)
        no, body = (m.group(1).zfill(2), m.group(2)) if m else (f"{len(strats) + 1:02d}", s)
        nm, det = _colon(body)
        strats.append({"no": no, "name": nm, "items": _split(det)[:4]})
    return {"names": [names[0] or "특성", names[1] or "시사점", names[2] or "전략"], "feats": cols[0][:5], "imps": cols[1][:5], "strats": strats[:5]}


def askanswer(d):
    """질문과 답 — '그림: 가운데 화면' · '수요자 | “질문” | 답 한 줄'(1~4줄, 첫 줄 왼쪽·둘째 줄 오른쪽)"""
    pic, qa = "", []
    for l in _lines(d):
        if PIC.match(l):
            pic = PIC.sub("", l).strip()
            continue
        if "|" in l:
            c = _cells(_bul(l))
            who = "" if re.fullmatch(r"(질문|Q|q)", c[0]) else c[0]
            qa.append({"who": who, "q": _unq(c[1]) if len(c) > 1 else "", "a": c[2] if len(c) > 2 else ""})
    return {"pic": pic, "qa": qa[:4]}


def linkage(d):
    """연계도 — '왼쪽 | 기관'(또는 '왼쪽 | 묶음: 기관, 기관') · '오른쪽 | …' · '가운데 | 기능' · '방식: API | ETL' · '그림: 화면'"""
    o = {"left": [], "right": [], "center": [], "ways": ["", ""], "pic": ""}
    for l in _lines(d):
        if PIC.match(l):
            o["pic"] = PIC.sub("", l).strip()
            continue
        v = _head(l, "방식", "연계\\s*방식", "interface")
        if v is not None:
            w = _cells(v) if "|" in v else _split(v)
            o["ways"] = [w[0] if w else "", (w[1] if len(w) > 1 else (w[0] if w else ""))]
            continue
        if "|" not in l:
            continue
        tag, rest = [x.strip() for x in _bul(l).split("|", 1)]
        side = ("left" if re.match(r"^(왼쪽|좌|left)", tag, re.I) else "right" if re.match(r"^(오른쪽|우|right)", tag, re.I)
                else "center" if re.match(r"^(가운데|중앙|기능|center)", tag, re.I) else "")
        if not side:
            continue
        if side == "center":
            o["center"].append(rest)
            continue
        nm, items = _colon(rest)
        o[side].append({"name": nm, "items": _split(items)[:6]})
    o["left"], o["right"], o["center"] = o["left"][:8], o["right"][:8], o["center"][:6]
    return o


_ROOT = re.compile(r"^(총괄|총괄\s*책임자?|PM|사업\s*책임자|사업\s*관리|책임자|대표)\s*[:：]\s*(.*)$", re.I)
_SUP = re.compile(r"^(지원|지원\s*조직|자문|자문단|협력)\s*[:：]\s*(.*)$")


def org(d):
    """조직도 — '총괄: 직책 | 경력' · '팀 이름: 역할 | 인원' · '지원: 이름, 이름'"""
    root, teams, sup = None, [], []
    for l in _lines(d):
        l2 = _bul(l)
        m = _ROOT.match(l2)
        if m and root is None:
            c = _cells(m.group(2))
            root = {"name": c[0], "note": c[1] if len(c) > 1 else ""}
            continue
        m = _SUP.match(l2)
        if m:
            sup += _split(m.group(2).replace("|", ","))
            continue
        nm, rest = _colon(l2)
        c = _cells(rest) if rest else [""]
        teams.append({"name": nm, "role": c[0], "n": c[1] if len(c) > 1 else ""})
    return {"root": root, "teams": teams[:7], "sup": sup[:3]}


def voices(d):
    """현장 목소리 — '그림: 인물' · 말풍선 줄 “…”(3~6) · '출처: …'. t = 큰 질문 문구"""
    pic, says, src = "", [], ""
    for l in _lines(d):
        if PIC.match(l):
            pic = PIC.sub("", l).strip()
            continue
        m = SRC.match(l)
        if m:
            src = m.group(2).strip()
            continue
        says.append(_unq(_bul(l)))
    return {"pic": pic, "says": [s for s in says if s][:6], "src": src}


_BEFORE = re.compile(r"^(AS-?IS|기존|현행|이전|전|before)(?!\w)", re.I)
_AFTER = re.compile(r"^(TO-?BE|개선|이후|후|제안|after)(?!\w)", re.I)


def screenshift(d):
    """화면 전후 — 'AS-IS | 그림: 기존 화면 | 문제' · 'TO-BE | 그림: 개선 화면 | 효과' · '변화 | 이름 | 3단계 → 1단계'"""
    o = {"before": None, "after": None, "changes": []}
    for l in _lines(d):
        if "|" not in l:
            continue
        c = _cells(_bul(l))
        tag, rest = c[0], c[1:]
        pic = next((PIC.sub("", x).strip() for x in rest if PIC.match(x)), "")
        txt = " / ".join(x for x in rest if x and not PIC.match(x))
        if _BEFORE.match(tag):
            o["before"] = {"name": tag, "pic": pic, "note": txt}
        elif _AFTER.match(tag):
            o["after"] = {"name": tag, "pic": pic, "note": txt}
        elif re.match(r"^(변화|효과|차이|change)", tag, re.I) and rest:
            o["changes"].append({"label": rest[0] if len(rest) > 1 else "", "value": rest[-1]})
    o["changes"] = o["changes"][:3]
    return o


_TRI_HEAD = re.compile(r"(이슈|문제|현황|원인|과제|방안|해결|대응|효과|기대|결과|개선)")


def triad(d):
    """이슈·방안·효과 — 첫 줄 머리 '이슈 | 방안 | 효과'(낱말이 머리 같을 때만) · 행 '…|…|…' 3~5 · '강조: 행 첫 칸'"""
    hl, head, rows = "", [], []
    for l in _lines(d):
        v = _head(l, "강조", "highlight")
        if v is not None:
            hl = v
            continue
        if "|" not in l:
            continue
        c = (_cells(_bul(l)) + ["", "", ""])[:3]
        # 머리 줄 — 칸 머리가 이슈·방안·효과… 로 시작하는 칸이 둘 이상('효과(도입 전 → 도입 후)' 처럼 꾸밈이 붙어도). E2E 742: 머리 줄이 첫 행으로 들어갔다
        if not head and not rows and sum(1 for x in c if len(x) <= 24 and _TRI_HEAD.match(x)) >= 2:
            head = c
            continue
        if head and [re.sub(r"\s+", "", x) for x in c] == [re.sub(r"\s+", "", x) for x in head]:   # 머리를 한 번 더 적은 줄
            continue
        rows.append(c)
    return {"head": [h or dft for h, dft in zip(head or ["", "", ""], ("이슈", "방안", "효과"))], "rows": rows[:5], "hl": hl}


_YES = re.compile(r"^(예|네|yes|y|충족|통과|적합)\s*(?:→|->|:)\s*(.*)$", re.I)
_NO = re.compile(r"^(아니오|아니요|no|n|미충족|불통과|부적합|실패)\s*(?:→|->|:)\s*(.*)$", re.I)


def flowchart(d):
    """순서도 — 줄마다 단계 또는 판정 '? 조건 | 예 → 단계 | 아니오 → 단계', 끝 '◎ 완료' (4~9줄)"""
    nodes = []
    for l in _lines(d):
        l2 = _bul(l)
        if l2[:1] in ("?", "？", "◇"):
            c = _cells(l2.lstrip("?？◇ "))
            yes = no = ""
            for x in c[1:]:
                m = _YES.match(x)
                if m:
                    yes = m.group(2).strip()
                    continue
                m = _NO.match(x)
                if m:
                    no = m.group(2).strip()
            nodes.append({"type": "if", "text": c[0], "yes": yes, "no": no})
        elif l2[:1] in ("◎", "●", "■"):
            nodes.append({"type": "end", "text": l2.lstrip("◎●■ ").strip()})
        else:
            nodes.append({"type": "step", "text": l2})
    return {"nodes": nodes[:9]}


def flow_index(nodes, name):
    n = (name or "").strip()
    if not n:
        return -1
    for i, x in enumerate(nodes):
        if x["text"] == n:
            return i
    for i, x in enumerate(nodes):
        if n in x["text"] or x["text"] in n:
            return i
    return -1


def rowgrid(d):
    """행 머리 격자 — 머리(선택) '구분 | 1단계 | 2단계' · 행 '영역 | 칸 | 칸' 또는 '영역: 칩, 칩' · '강조: 열'"""
    hl, head, rows = "", [], []
    for l in _lines(d):
        v = _head(l, "강조", "highlight")
        if v is not None:
            hl = v
            continue
        l2 = _bul(l)
        if "|" in l2:
            c = _cells(l2)
            if not rows and not head and re.fullmatch(r"(구분|영역|분야|항목|관점|단계)?", c[0]):
                head = c[1:7]
                continue
            rows.append({"name": c[0], "cells": c[1:7], "chips": False})
        else:
            nm, rest = _colon(l2)
            if rest:
                rows.append({"name": nm, "cells": _split(rest)[:8], "chips": True})
    return {"head": head, "rows": rows[:6], "hl": hl}


def _per(l):
    m = re.match(r"^\s*\[([^\]]+)\]\s*(.*)$", l)
    return (m.group(1).strip(), m.group(2).strip()) if m else ("", l.strip())


def timeline(d):
    """이정표 축 — '[2024.11] 사건: 설명 | 위|아래' 3~8 · '목표: 문구'(축 끝 깃발)"""
    ev, goal, hl = [], "", ""
    for l in _lines(d):
        v = _head(l, "목표", "goal")
        if v is not None:
            goal = v
            continue
        v = _head(l, "강조", "highlight")   # 머리 줄 — 사건으로 읽지 않는다(E2E 742: '강조: 2025.12' 가 이정표 하나가 됨)
        if v is not None:
            hl = v
            continue
        p, rest = _per(_bul(l))
        c = _cells(rest)
        side = ""
        if len(c) > 1 and re.fullmatch(r"(위|아래|상|하|up|down)", c[-1], re.I):
            side = "up" if c[-1].lower() in ("위", "상", "up") else "down"
            c = c[:-1]
        t, x = _colon(" ".join(c))
        ev.append({"p": p, "t": t, "d": x, "side": side})
    return {"ev": ev[:8], "goal": goal, "hl": hl}


def stairs(d):
    """성장 계단 — '[2023] 1차: 기반 구축' 3~5단 · '인물: 오르는 사람'(선택). t = 정상 목표"""
    st, who = [], ""
    for l in _lines(d):
        v = _head(l, "인물", "person")
        if v is not None or PIC.match(l):
            who = v if v is not None else PIC.sub("", l).strip()
            continue
        p, rest = _per(_bul(l))
        t, x = _colon(rest)
        st.append({"p": p, "t": t, "d": x})
    return {"steps": st[:6], "who": who}


def consortium(d):
    """컨소시엄 — '★회사 | 지분 % | 역할 | 대표 실적'(★ 주사업자 하나) 2~4개"""
    cs = []
    for l in _lines(d):
        c = _cells(_bul(l))
        if not c[0]:
            continue
        share = next((x for x in c[1:] if re.fullmatch(r"\d+(?:\.\d+)?\s*%", x)), "")
        rest = [x for x in c[1:] if x and x != share]
        cs.append({"name": c[0].lstrip("★☆* ").strip(), "lead": c[0].startswith("★"), "share": share,
                   "role": rest[0] if rest else "", "note": rest[1] if len(rest) > 1 else ""})
    return {"cos": cs[:4]}


def shares(o):
    return [float(re.sub(r"[^\d.]", "", c["share"])) for c in o["cos"] if c["share"]]


_TR_HEAD = re.compile(r"^(기능\s*)?(요구(사항)?|요건|제약(사항)?|ID|구분|항목)$", re.I)


def trace(d):
    """추적 매핑 — 머리(선택) '요구 | 상세 | 방안' · 행 'ID | 상세 | 방안, 방안'(같은 이름 = 같은 칸, 다대다는 쉼표)"""
    head, rows = [], []
    for l in _lines(d):
        if "|" not in l:
            continue
        c = _cells(_bul(l))
        if not head and not rows and _TR_HEAD.match(c[0]):
            head = c[:3]
            continue
        if len(c) >= 3:
            rows.append((c[0], c[1], _split(c[2])))
        elif len(c) == 2:
            rows.append((c[0], "", _split(c[1])))
    left, mid, right = [], [], []
    for a, m, rs in rows:
        if a not in left:
            left.append(a)
        if m and m not in mid:
            mid.append(m)
        for r in rs:
            if r not in right:
                right.append(r)
    three = bool(mid)
    dft = ["요구사항", "상세", "방안"] if three else ["요구사항", "방안"]
    hd = (head + [""] * 3)[:3] if head else dft
    if head and not three:
        hd = [head[0], head[-1]]
    return {"head": [h or dft[i] for i, h in enumerate(hd[:len(dft)])], "rows": rows[:12], "left": left[:10], "mid": mid[:10], "right": right[:8]}


def twinhub(d):
    """허브 대비 — '현행 | 가운데: 노드, 노드' · '개선 | 가운데: 노드, 노드, 노드' (첫 줄 왼쪽 → 둘째 줄 오른쪽)"""
    hubs = []
    for l in _lines(d):
        l2 = _bul(l)
        tag, rest = ([x.strip() for x in l2.split("|", 1)] if "|" in l2 else ("", l2))
        nm, nodes = _colon(rest)
        hubs.append({"label": tag, "center": nm, "nodes": _split(nodes)[:8]})
    return {"hubs": hubs[:2]}


PARSE = {"arch": arch, "stepcols": stepcols, "derive": derive, "askanswer": askanswer, "linkage": linkage, "org": org, "voices": voices,
         "screenshift": screenshift, "triad": triad, "flowchart": flowchart, "rowgrid": rowgrid, "timeline": timeline, "stairs": stairs,
         "consortium": consortium, "trace": trace, "twinhub": twinhub}


def ok(k, t, d):
    """그릴 거리가 있는가 — 없으면 글 상자로 그린다"""
    o = PARSE[k](d)
    return {
        "arch": lambda: len(o["zones"]) >= 2 or arch_nodes(o) >= 2,
        "stepcols": lambda: len(o["steps"]) >= 2,
        "derive": lambda: bool(o["strats"]) and bool(o["feats"] or o["imps"]),
        "askanswer": lambda: any(x["q"] for x in o["qa"]),
        "linkage": lambda: bool(o["left"] or o["right"]),
        "org": lambda: bool(o["root"]) or len(o["teams"]) >= 2,
        "voices": lambda: len(o["says"]) >= 1,
        "screenshift": lambda: bool(o["before"] and o["after"]),
        "triad": lambda: bool(o["rows"]),
        "flowchart": lambda: len(o["nodes"]) >= 2,
        "rowgrid": lambda: len(o["rows"]) >= 1,
        "timeline": lambda: len(o["ev"]) >= 2,
        "stairs": lambda: len(o["steps"]) >= 2,
        "consortium": lambda: len(o["cos"]) >= 2,
        "trace": lambda: bool(o["left"] and o["right"]),
        "twinhub": lambda: len(o["hubs"]) >= 2,
    }[k]()


def check(k, t, d):
    """서버 WireLayout::check 와 같은 판정(엔진 시험용) — 문제 글 목록"""
    o = PARSE[k](d)
    out = []
    if k == "arch" and (arch_nodes(o) < 2 or not o["links"]):
        out.append("구성도는 노드 2개 이상·연결 1개 이상")
    if k == "org" and not o["root"]:
        out.append("조직도에 총괄(맨 위) 줄이 없음")
    if k == "flowchart" and not any(x["type"] == "if" for x in o["nodes"]):
        out.append("순서도에 판정(?) 줄이 없음")
    if k == "trace" and (not o["left"] or not o["right"] or any(not rs for _, _, rs in o["rows"])):
        out.append("추적 매핑은 요구·방안 양쪽이 모두 있어야 함")
    if k == "consortium":
        if len(o["cos"]) >= 2 and sum(1 for c in o["cos"] if c["lead"]) != 1:
            out.append("주사업자 ★ 는 하나")
        sh = shares(o)
        if sh and len(sh) == len(o["cos"]) and abs(sum(sh) - 100) > 1:
            out.append("지분 합이 100% 가 아님")
    return out


# ───────────────────────── 그리기(PIL) ─────────────────────────
class UI:
    """design.wire_png 가 넘기는 도구 — d(_SafeDraw)·f(_font)·lines_in·title·wrap"""
    def __init__(self, d, f, lines_in, title, wrap):
        self.d, self.f, self.lines_in, self.title, self.wrap = d, f, lines_in, title, wrap

    def ctext(self, cx, y, w, text, size, fill, bold=True, maxl=3, step=None):
        """가운데 정렬 여러 줄 — 다음 y"""
        f = self.f(size, bold)
        step = step or int(size * 1.25)
        for ln in self.wrap(text or "", f, max(10, w))[:maxl]:
            self.d.text((cx - self.d.textlength(ln, font=f) / 2, y), ln, font=f, fill=fill)
            y += step
        return y

    def mtext(self, cx, cy, w, text, size, fill, bold=True, maxl=3):
        """상자 한가운데(cx, cy)에 여러 줄"""
        f = self.f(size, bold)
        n = min(maxl, len(self.wrap(text or "", f, max(10, w))) or 1)
        return self.ctext(cx, cy - n * size * 0.62, w, text, size, fill, bold, maxl)


def _arrow(d, a, b, col=LINE, width=3, head=11):
    (x0, y0), (x1, y1) = a, b
    d.line([x0, y0, x1, y1], fill=col, width=width)
    ang = math.atan2(y1 - y0, x1 - x0)
    d.polygon([(x1, y1), (x1 - head * math.cos(ang - 0.45), y1 - head * math.sin(ang - 0.45)), (x1 - head * math.cos(ang + 0.45), y1 - head * math.sin(ang + 0.45))], fill=col)


def _poly_arrow(d, pts, col=LINE, width=3, head=11):
    if len(pts) > 2:
        d.line(pts[:-1], fill=col, width=width, joint="curve")
    _arrow(d, pts[-2], pts[-1], col, width, head)


def _dashed(d, a, b, col=LINE, width=2, dash=8):
    (x0, y0), (x1, y1) = a, b
    L = math.hypot(x1 - x0, y1 - y0) or 1
    n = int(L // (dash * 2)) + 1
    for i in range(n):
        s, e = i * 2 * dash / L, min(1.0, (i * 2 + 1) * dash / L)
        d.line([x0 + (x1 - x0) * s, y0 + (y1 - y0) * s, x0 + (x1 - x0) * e, y0 + (y1 - y0) * e], fill=col, width=width)


def _chev(d, x0, y0, x1, y1, fill, first=False, last=False):
    tip = 0 if last else min(22, (x1 - x0) * 0.14)
    notch = 0 if first else min(16, (x1 - x0) * 0.1)
    d.polygon([(x0, y0), (x1 - tip, y0), (x1, (y0 + y1) / 2), (x1 - tip, y1), (x0, y1), (x0 + notch, (y0 + y1) / 2)], fill=fill)


def _person(d, cx, cy, r, col=LINE):
    """사람 실루엣 — 머리 원 + 어깨"""
    d.ellipse([cx - r * 0.42, cy - r * 0.95, cx + r * 0.42, cy - r * 0.11], fill=col)
    d.pieslice([cx - r * 0.85, cy - r * 0.02, cx + r * 0.85, cy + r * 1.6], 180, 360, fill=col)


def _screen(d, x0, y0, x1, y1, strong=False, faint=False):
    """화면 자리 — 창 틀 + 자리 줄"""
    d.rounded_rectangle([x0, y0, x1, y1], radius=8, fill=PALE if not faint else (248, 250, 252), outline=DARK if strong else EDGE, width=4 if strong else 2)
    bh = min(24, (y1 - y0) * 0.14)
    d.rectangle([x0 + 2, y0 + 2, x1 - 2, y0 + bh], fill=SOFT)
    for i in range(3):
        d.ellipse([x0 + 8 + i * 14, y0 + bh / 2 - 3, x0 + 14 + i * 14, y0 + bh / 2 + 3], fill=LINE)
    n = 4
    for i in range(n):
        ly = y0 + bh + 12 + i * (y1 - y0 - bh - 24) / n
        d.rounded_rectangle([x0 + 14, ly, x0 + 14 + (x1 - x0 - 28) * (0.9 - 0.15 * (i % 3)), ly + max(4, min(10, (y1 - y0) * 0.04))], radius=4, fill=SOFT)


def _cyl(d, x0, y0, x1, y1, fill=WHITE, edge=MID):
    x0, x1, y0, y1 = min(x0, x1), max(x0, x1), min(y0, y1), max(y0, y1)
    eh = min(14, (y1 - y0) * 0.3)
    d.rectangle([x0, y0 + eh / 2, x1, y1 - eh / 2], fill=fill)
    d.line([x0, y0 + eh / 2, x0, y1 - eh / 2], fill=edge, width=2)
    d.line([x1, y0 + eh / 2, x1, y1 - eh / 2], fill=edge, width=2)
    d.chord([x0, y1 - eh, x1, y1], 0, 180, fill=fill, outline=edge, width=2)
    d.ellipse([x0, y0, x1, y0 + eh], fill=SOFT, outline=edge, width=2)


def _pill(ui, cx, cy, text, size=17, dark=True, pad=12):
    f = ui.f(size)
    w = ui.d.textlength(text, font=f) + pad * 2
    ui.d.rounded_rectangle([cx - w / 2, cy - size * 0.85, cx + w / 2, cy + size * 0.85], radius=size, fill=DARK if dark else PALE, outline=None if dark else EDGE)
    ui.d.text((cx - w / 2 + pad, cy - size * 0.66), text, font=f, fill=WHITE if dark else INK)
    return w


def _flag(d, x, y, h=40, col=DARK):
    d.line([x, y, x, y + h], fill=col, width=3)
    d.polygon([(x, y), (x + h * 0.7, y + h * 0.2), (x, y + h * 0.42)], fill=col)


def draw(k, b, body, box, ui):
    o = PARSE[k](body)
    globals()["_draw_" + k](b, o, box, ui)


def _draw_arch(b, o, box, ui):
    d = ui.d
    x0, y0, x1, y1 = box
    yy = ui.title(b, x0, y0, x1)
    zs = o["zones"] or [{"name": "", "nodes": []}]
    n = len(zs)
    links = [(l, _zone_of(o, l["a"]), _zone_of(o, l["b"])) for l in o["links"]]
    links = [(l, a, c) for l, a, c in links if a >= 0 and c >= 0 and a != c]
    far = [x for x in links if abs(x[1] - x[2]) > 1]
    vert = o["dir"] == "세로"
    gap = 54
    lane = 22 * len(far)
    if vert:
        zw, zh = x1 - x0 - lane, (y1 - yy - gap * (n - 1)) / n
    else:
        zw, zh = (x1 - x0 - gap * (n - 1)) / n, y1 - yy - lane
    rects = []
    for i, z in enumerate(zs):
        zx, zy = (x0, yy + i * (zh + gap)) if vert else (x0 + i * (zw + gap), yy)
        hot = bool(o["hl"]) and (o["hl"] == z["name"] or o["hl"] in z["name"])
        d.rounded_rectangle([zx, zy, zx + zw, zy + zh], radius=14, fill=PALE, outline=DARK if hot else EDGE, width=4 if hot else 2)
        f = ui.f(19)
        ui.d.text((zx + 14, zy + 9), z["name"], font=f, fill=DARK if hot else INK)
        rects.append((zx, zy, zx + zw, zy + zh))
        m = len(z["nodes"])
        if not m:
            continue
        ix0, iy0, ix1, iy1 = zx + 12, zy + 40, zx + zw - 12, zy + zh - 10
        cols = max(1, min(m, int((ix1 - ix0) // 150))) if vert else (2 if (ix1 - ix0) > 300 and m > 2 else 1)
        rows = math.ceil(m / cols)
        nw, nh = (ix1 - ix0 - 10 * (cols - 1)) / cols, min(62, (iy1 - iy0 - 8 * (rows - 1)) / rows)
        top = iy0 + max(0, (iy1 - iy0 - rows * nh - 8 * (rows - 1)) / 2)
        for j, nd in enumerate(z["nodes"]):
            nx, ny = ix0 + (j % cols) * (nw + 10), top + (j // cols) * (nh + 8)
            if nd["db"]:
                cw = min(nw, nh * 1.6)
                _cyl(d, nx + (nw - cw) / 2, ny, nx + (nw + cw) / 2, ny + nh)
                ui.mtext(nx + nw / 2, ny + nh * 0.58, nw - 8, nd["name"], 15, INK, True, 2)
            else:
                d.rounded_rectangle([nx, ny, nx + nw, ny + nh], radius=8, fill=WHITE, outline=LINE, width=2)
                ui.mtext(nx + nw / 2, ny + nh / 2, nw - 12, nd["name"], 18, INK, True, 2)
    near = {}
    for l, a, c in links:
        if abs(a - c) == 1:
            near.setdefault((min(a, c), max(a, c)), []).append((l, a, c))
    for (lo, hi), group in near.items():
        for i, (l, a, c) in enumerate(group):
            ra, rb = rects[lo], rects[hi]
            if vert:
                px = x0 + zw * (i + 1) / (len(group) + 1)
                s, e = (px, ra[3] + 4), (px, rb[1] - 4)
            else:
                py = yy + zh * (i + 1) / (len(group) + 1)
                s, e = (ra[2] + 4, py), (rb[0] - 4, py)
            if a > c:
                s, e = e, s
            _arrow(d, s, e, MID, 5, 14)
            if l["label"]:
                cx, cy = (s[0] + e[0]) / 2, (s[1] + e[1]) / 2
                f = ui.f(14)
                tw = d.textlength(l["label"], font=f) + 12
                d.rounded_rectangle([cx - tw / 2, cy - 26, cx + tw / 2, cy - 6] if not vert else [cx + 8, cy - 10, cx + 8 + tw, cy + 10], radius=8, fill=WHITE, outline=EDGE)
                d.text((cx - tw / 2 + 6, cy - 25) if not vert else (cx + 14, cy - 9), l["label"], font=f, fill=INK)
    for i, (l, a, c) in enumerate(far):
        ra, rb = rects[a], rects[c]
        if vert:
            lx = x1 - lane + 10 + i * 22
            pts = [(ra[2], (ra[1] + ra[3]) / 2), (lx, (ra[1] + ra[3]) / 2), (lx, (rb[1] + rb[3]) / 2), (rb[2] + 4, (rb[1] + rb[3]) / 2)]
        else:
            ly = y1 - lane + 10 + i * 22
            pts = [((ra[0] + ra[2]) / 2, ra[3]), ((ra[0] + ra[2]) / 2, ly), ((rb[0] + rb[2]) / 2, ly), ((rb[0] + rb[2]) / 2, rb[3] + 4)]
        _poly_arrow(d, pts, MID, 3, 11)
        if l["label"]:
            mx, my = (pts[1][0] + pts[2][0]) / 2, (pts[1][1] + pts[2][1]) / 2
            f = ui.f(13, False)
            tw = d.textlength(l["label"], font=f) + 10
            d.rectangle([mx - tw / 2, my - 9, mx + tw / 2, my + 9], fill=WHITE)
            d.text((mx - tw / 2 + 5, my - 9), l["label"], font=f, fill=SUB)


def _draw_stepcols(b, o, box, ui):
    d = ui.d
    x0, y0, x1, y1 = box
    yy = ui.title(b, x0, y0, x1)
    ss = o["steps"]
    n = len(ss)
    rw = min(200, (x1 - x0) * 0.17) if o["result"] else 0
    ax1 = x1 - (rw + 30 if rw else 0)
    gap = 10
    sw = (ax1 - x0 - gap * (n - 1)) / n
    ch = min(64, (y1 - yy) * 0.2)
    for i, s in enumerate(ss):
        sx = x0 + i * (sw + gap)
        tone = 205 - int(120 * i / max(1, n - 1))
        fg = WHITE if tone < 160 else INK
        _chev(d, sx, yy, sx + sw + (12 if i < n - 1 else 0), yy + ch, (tone, tone + 10, tone + 25), i == 0, i == n - 1)
        ty = ui.mtext(sx + sw / 2, yy + ch / 2 - (9 if s["period"] else 0), sw - 36, s["name"], 19, fg, True, 1)
        if s["period"]:
            ui.ctext(sx + sw / 2, ty - 2, sw - 36, s["period"], 14, fg, False, 1)
        cy0 = yy + ch + 12
        d.rounded_rectangle([sx, cy0, sx + sw, y1], radius=8, fill=PALE, outline=SOFT)
        ly = cy0 + 12
        for it in s["items"]:
            d.ellipse([sx + 12, ly + 9, sx + 18, ly + 15], fill=MID)
            ly = ui.lines_in(sx + 26, ly, sw - 36, y1 - 4, it, ui.f(17, False), INK, 23) + 6
    if rw:
        rx0 = x1 - rw
        _arrow(d, (ax1 + 4, (yy + y1) / 2), (rx0 - 4, (yy + y1) / 2), MID, 5, 14)
        d.rounded_rectangle([rx0, yy, x1, y1], radius=12, fill=DARK)
        ui.mtext((rx0 + x1) / 2, (yy + y1) / 2, rw - 24, o["result"], 21, WHITE, True, 4)


def _draw_derive(b, o, box, ui):
    d = ui.d
    x0, y0, x1, y1 = box
    yy = ui.title(b, x0, y0, x1)
    gap = 46
    W = x1 - x0 - gap * 2
    ws = (W * 0.29, W * 0.29, W * 0.42)
    xs = (x0, x0 + ws[0] + gap, x0 + ws[0] + ws[1] + gap * 2)
    hh = 40
    for i in range(3):
        _pill_box(ui, xs[i], yy, xs[i] + ws[i], yy + hh, o["names"][i], (LINE, MID, DARK)[i])
    by0 = yy + hh + 10
    for i, items in ((0, o["feats"]), (1, o["imps"])):
        d.rounded_rectangle([xs[i], by0, xs[i] + ws[i], y1], radius=10, fill=PALE if i == 0 else WHITE, outline=EDGE, width=2)
        ly = by0 + 14
        for it in items:
            mark = "·" if i == 0 else "✓"
            d.text((xs[i] + 12, ly), mark, font=ui.f(18), fill=MID)
            ly = ui.lines_in(xs[i] + 34, ly, ws[i] - 46, y1 - 6, it, ui.f(17, i == 1), INK, 23) + 10
    rx = xs[2]
    d.rounded_rectangle([rx, by0, rx + ws[2], y1], radius=10, fill=DARK)
    n = max(1, len(o["strats"]))
    rh = (y1 - by0 - 12) / n
    for j, s in enumerate(o["strats"]):
        ry = by0 + 6 + j * rh
        if j:
            d.line([rx + 14, ry, rx + ws[2] - 14, ry], fill=MID, width=1)
        f = ui.f(int(min(34, max(20, rh * 0.42))))
        d.text((rx + 16, ry + 8), s["no"], font=f, fill=(147, 197, 253))
        nx = rx + 24 + d.textlength(s["no"], font=f)
        ty = ui.lines_in(nx, ry + 10, ws[2] - (nx - rx) - 14, ry + rh, s["name"], ui.f(19), WHITE, 24)
        if s["items"]:
            ui.lines_in(nx, ty, ws[2] - (nx - rx) - 14, ry + rh - 2, " · ".join(s["items"]), ui.f(15, False), SOFT, 20)
    for i in range(2):
        ax = xs[i] + ws[i] + 6
        my = (by0 + y1) / 2
        d.polygon([(ax, my - 18), (ax + gap - 22, my - 18), (ax + gap - 10, my), (ax + gap - 22, my + 18), (ax, my + 18), (ax + 12, my)], fill=LINE)


def _pill_box(ui, x0, y0, x1, y1, text, fill):
    ui.d.rounded_rectangle([x0, y0, x1, y1], radius=(y1 - y0) / 2, fill=fill)
    ui.mtext((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0 - 20, text, 18, WHITE, True, 1)


def _draw_askanswer(b, o, box, ui):
    d = ui.d
    x0, y0, x1, y1 = box
    qa = o["qa"]
    sides = [qa[0::2], qa[1::2]] if len(qa) > 1 else [qa, []]
    sw = (x1 - x0) * (0.29 if sides[1] else 0.36)
    cx0 = x0 + sw + 20
    cx1 = (x1 - sw - 20) if sides[1] else x1
    for si, group in enumerate(sides):
        if not group:
            continue
        sx0 = x0 if si == 0 else x1 - sw
        gh = (y1 - y0) / len(group)
        for gi, q in enumerate(group):
            gy0, gy1 = y0 + gi * gh, y0 + (gi + 1) * gh - 8
            r = min(sw * 0.2, (gy1 - gy0) * 0.17)
            pcx, pcy = sx0 + sw / 2, gy0 + (gy1 - gy0) * 0.6
            bh = min(130, max(36, (pcy - r * 1.05) - gy0 - 14))
            gy0 = max(gy0, pcy - r * 1.05 - 14 - bh)
            d.rounded_rectangle([sx0 + 4, gy0 + 2, sx0 + sw - 4, gy0 + 2 + bh], radius=14, fill=WHITE, outline=LINE, width=2)
            d.polygon([(pcx - 10, gy0 + bh), (pcx + 10, gy0 + bh), (pcx, gy0 + bh + 14)], fill=LINE)
            ui.mtext(pcx, gy0 + 2 + bh / 2, sw - 30, f"“{q['q']}”", 18, INK, True, 3)
            _person(d, pcx, pcy, r, LINE if si == 0 else MID)
            ty = pcy + r * 1.7
            if q["who"]:
                ty = ui.ctext(pcx, ty, sw - 10, q["who"], 15, SUB, False, 1)
            if q["a"]:
                ui.ctext(pcx, ty + 2, sw - 10, q["a"], 19, DARK, True, 2)
    _screen(d, cx0, y0 + 6, cx1, y1 - 60, strong=True)
    if o["pic"]:
        ui.mtext((cx0 + cx1) / 2, (y0 + y1 - 54) / 2, cx1 - cx0 - 40, o["pic"], 18, SUB, False, 2)
    if b.get("t"):
        _pill(ui, (cx0 + cx1) / 2, y1 - 28, b["t"], 20)


def _draw_linkage(b, o, box, ui):
    d = ui.d
    x0, y0, x1, y1 = box
    W = x1 - x0
    lw, pw, g = W * 0.22, max(40, W * 0.05), 18
    has_r = bool(o["right"])
    cx0 = x0 + lw + g + pw + g
    cx1 = x1 - (lw + g + pw + g if has_r else 0)
    yy = y0
    for side, items in (("left", o["left"]), ("right", o["right"])):
        if not items:
            continue
        sx0 = x0 if side == "left" else x1 - lw
        px0 = sx0 + lw + g if side == "left" else sx0 - g - pw
        ways = o["ways"][0 if side == "left" else 1]
        d.rounded_rectangle([px0, yy, px0 + pw, y1], radius=pw / 2, fill=LINE)
        if ways:
            chars = list(ways.replace(" ", ""))[:14]
            fs_ = int(max(14, min(24, (y1 - yy - 20) / max(1, len(chars)) * 0.8)))
            f = ui.f(fs_)
            cy = (yy + y1) / 2 - len(chars) * fs_ * 0.6
            for ch in chars:
                d.text((px0 + pw / 2 - d.textlength(ch, font=f) / 2, cy), ch, font=f, fill=WHITE)
                cy += fs_ * 1.2
        rows = sum(1 + len(it["items"]) for it in items)
        rh = min(44, (y1 - yy) / max(1, rows) - 4)
        ly = yy + max(0, ((y1 - yy) - rows * (rh + 4)) / 2)
        for it in items:
            if it["items"]:
                d.rounded_rectangle([sx0, ly, sx0 + lw, ly + rh], radius=4, fill=MID)
                ui.mtext(sx0 + lw / 2, ly + rh / 2, lw - 10, it["name"], 18, WHITE, True, 1)
                gy0 = ly
                ly += rh + 4
                for x in it["items"]:
                    d.rounded_rectangle([sx0 + 10, ly, sx0 + lw - 10, ly + rh], radius=4, fill=PALE, outline=EDGE)
                    ui.mtext(sx0 + lw / 2, ly + rh / 2, lw - 26, x, 17, INK, False, 1)
                    ly += rh + 4
                my = (gy0 + ly) / 2
            else:
                d.rounded_rectangle([sx0, ly, sx0 + lw, ly + rh], radius=4, fill=PALE, outline=EDGE)
                ui.mtext(sx0 + lw / 2, ly + rh / 2, lw - 14, it["name"], 18, INK, True, 1)
                my = ly + rh / 2
                ly += rh + 4
            ex = sx0 + lw if side == "left" else sx0
            px = px0 if side == "left" else px0 + pw
            d.line([ex, my, px, my], fill=LINE, width=2)
            d.ellipse([ex - 4, my - 4, ex + 4, my + 4], fill=MID)
        mid = (yy + y1) / 2
        if side == "left":
            _arrow(d, (px0 + pw + 2, mid), (cx0 - 4, mid), MID, 4, 12)
        else:
            _arrow(d, (cx1 + 4, mid), (px0 - 2, mid), MID, 4, 12)
    hh = 46
    d.rounded_rectangle([cx0, yy, cx1, y1], radius=10, fill=WHITE, outline=EDGE, width=2)
    d.rounded_rectangle([cx0, yy, cx1, yy + hh], radius=10, fill=DARK)
    ui.mtext((cx0 + cx1) / 2, yy + hh / 2, cx1 - cx0 - 20, b.get("t") or "", 20, WHITE, True, 1)
    ly = yy + hh + 14
    sh = (y1 - ly) * (0.48 if o["center"] else 0.8) if o["pic"] or not o["center"] else 0
    for c in o["center"]:
        d.text((cx0 + 18, ly), "✓", font=ui.f(18), fill=MID)
        ly = ui.lines_in(cx0 + 44, ly, cx1 - cx0 - 60, y1 - sh - 6, c, ui.f(18, False), INK, 24) + 6
    if sh:
        _screen(d, cx0 + 24, y1 - sh, cx1 - 24, y1 - 14)
        if o["pic"]:
            ui.mtext((cx0 + cx1) / 2, y1 - sh / 2, cx1 - cx0 - 70, o["pic"], 16, LINE, False, 2)


def _draw_org(b, o, box, ui):
    d = ui.d
    x0, y0, x1, y1 = box
    yy = ui.title(b, x0, y0, x1)
    cx = (x0 + x1) / 2
    rw, rh = min(480, (x1 - x0) * 0.4), min(110, (y1 - yy) * 0.3)
    root = o["root"] or {"name": "", "note": ""}
    d.rounded_rectangle([cx - rw / 2, yy, cx + rw / 2, yy + rh], radius=10, fill=WHITE, outline=DARK, width=3)
    d.rectangle([cx - rw / 2 + 2, yy + 2, cx + rw / 2 - 2, yy + 40], fill=DARK)
    ui.mtext(cx, yy + 21, rw - 20, root["name"], 22, WHITE, True, 1)
    pr = min(26, (rh - 44) / 2)
    if pr > 8:
        d.ellipse([cx - rw / 2 + 14, yy + 42, cx - rw / 2 + 14 + pr * 2, yy + 42 + pr * 2], fill=PALE, outline=EDGE)
        _person(d, cx - rw / 2 + 14 + pr, yy + 42 + pr * 1.05, pr * 0.62, LINE)
    ui.lines_in(cx - rw / 2 + 24 + pr * 2, yy + 50, rw - pr * 2 - 40, yy + rh - 2, root["note"], ui.f(17, False), INK, 22)
    ts = o["teams"]
    n = max(1, len(ts))
    bus = yy + rh + (y1 - yy - rh) * 0.22
    ty0 = bus + 26
    g = 14
    tw = (x1 - x0 - g * (n - 1)) / n
    d.line([cx, yy + rh, cx, bus], fill=MID, width=3)
    if ts:
        d.line([x0 + tw / 2, bus, x1 - tw / 2, bus], fill=MID, width=3)
    for i, t in enumerate(ts):
        tx = x0 + i * (tw + g)
        d.line([tx + tw / 2, bus, tx + tw / 2, ty0], fill=MID, width=3)
        d.rounded_rectangle([tx, ty0, tx + tw, y1], radius=8, fill=PALE, outline=EDGE, width=2)
        d.rounded_rectangle([tx, ty0, tx + tw, ty0 + 42], radius=8, fill=MID)
        ui.mtext(tx + tw / 2, ty0 + 21, tw - 12, t["name"], 20, WHITE, True, 1)
        r = min(18, (y1 - ty0 - 50) / 4)
        yb = ty0 + 46
        if r > 6:
            d.ellipse([tx + tw / 2 - r, yb, tx + tw / 2 + r, yb + r * 2], fill=WHITE, outline=EDGE)
            _person(d, tx + tw / 2, yb + r * 1.05, r * 0.62, LINE)
            yb += r * 2 + 6
        yb = ui.ctext(tx + tw / 2, yb + 4, tw - 20, t["role"], 18, INK, False, 4, 24)
        if t["n"]:
            ui.ctext(tx + tw / 2, yb + 2, tw - 16, t["n"], 16, DARK, True, 1)
    if o["sup"]:
        sw = min(230, (x1 - x0) * 0.22)
        sx0 = x0
        sy0 = yy + 8
        sh = min(rh + 4, 34 + 26 * len(o["sup"]))
        for a, bb in (((sx0, sy0), (sx0 + sw, sy0)), ((sx0 + sw, sy0), (sx0 + sw, sy0 + sh)), ((sx0 + sw, sy0 + sh), (sx0, sy0 + sh)), ((sx0, sy0 + sh), (sx0, sy0))):
            _dashed(d, a, bb, LINE, 2, 7)
        ly = sy0 + 8
        for s in o["sup"]:
            ly = ui.ctext(sx0 + sw / 2, ly, sw - 16, s, 15, INK, True, 1, 24)
        _dashed(d, (sx0 + sw, sy0 + sh / 2), (cx - rw / 2, sy0 + sh / 2), LINE, 2, 6)


def _draw_voices(b, o, box, ui):
    d = ui.d
    x0, y0, x1, y1 = box
    qh = 56 if b.get("t") else 0
    cy = (y0 + y1 - qh) / 2
    cx = (x0 + x1) / 2
    r = min((y1 - y0 - qh) * 0.32, (x1 - x0) * 0.13)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=PALE, outline=EDGE, width=2)
    _person(d, cx, cy + r * 0.12, r * 0.62, LINE)
    if o["pic"]:
        ui.ctext(cx, cy + r + 6, r * 2.4, o["pic"], 14, LINE, False, 1)
    says = o["says"]
    left, right = says[0::2], says[1::2]
    bw = (x1 - x0) / 2 - r - 46
    for side, group in ((-1, left), (1, right)):
        n = max(1, len(group))
        gh = (y1 - y0 - qh) / n
        for i, s in enumerate(group):
            by0 = y0 + i * gh + 6
            bh = min(gh - 14, 74)
            by0 += (gh - 14 - bh) / 2
            bx0 = x0 if side < 0 else x1 - bw
            d.rounded_rectangle([bx0, by0, bx0 + bw, by0 + bh], radius=18, fill=WHITE, outline=LINE, width=2)
            tx = bx0 + bw if side < 0 else bx0
            ty = by0 + bh / 2
            d.polygon([(tx, ty - 9), (tx, ty + 9), (tx - side * 20, ty)], fill=LINE)
            ui.mtext(bx0 + bw / 2, by0 + bh / 2, bw - 28, f"“{s}”", 18, INK, True, 2)
    if b.get("t"):
        ui.mtext(cx, y1 - qh / 2, x1 - x0 - 40, b["t"], 28, DARK, True, 1)
    if o["src"]:
        f = ui.f(14, False)
        d.text((x1 - d.textlength("출처: " + o["src"], font=f) - 6, y1 - 20), "출처: " + o["src"], font=f, fill=SUB)


def _draw_screenshift(b, o, box, ui):
    d = ui.d
    x0, y0, x1, y1 = box
    yy = ui.title(b, x0, y0, x1)
    ch = 56 if o["changes"] else 0
    W = x1 - x0
    bw, aw = W * 0.31, W * 0.1
    ax0 = x0 + bw
    rx0 = ax0 + aw
    top, bot = yy + 40, y1 - ch - 44
    bh = (bot - top) * 0.62
    by0 = top + (bot - top - bh) / 2
    for side, s, (sx0, sx1, sy0, sy1) in ((0, o["before"], (x0, x0 + bw, by0, by0 + bh)), (1, o["after"], (rx0, x1, top, bot))):
        _pill(ui, (sx0 + sx1) / 2, sy0 - 22, s["name"], 17, dark=bool(side))
        _screen(d, sx0, sy0, sx1, sy1, strong=bool(side), faint=not side)
        if s["pic"]:
            ui.mtext((sx0 + sx1) / 2, (sy0 + sy1) / 2 + 10, sx1 - sx0 - 40, s["pic"], 16, LINE, False, 2)
        ui.ctext((sx0 + sx1) / 2, sy1 + 8, sx1 - sx0, s["note"], 18, DARK if side else SUB, bool(side), 1)
        if side:
            for i, (px, py) in enumerate(((0.28, 0.32), (0.7, 0.45), (0.45, 0.78))):
                cx_, cy_ = sx0 + (sx1 - sx0) * px, sy0 + (sy1 - sy0) * py
                d.ellipse([cx_ - 15, cy_ - 15, cx_ + 15, cy_ + 15], fill=DARK, outline=WHITE, width=3)
                ui.mtext(cx_, cy_, 24, str(i + 1), 16, WHITE, True, 1)
    my = (top + bot) / 2
    d.polygon([(ax0 + 14, my - 26), (ax0 + aw - 30, my - 26), (ax0 + aw - 10, my), (ax0 + aw - 30, my + 26), (ax0 + 14, my + 26), (ax0 + 30, my)], fill=LINE)
    if ch:
        n = len(o["changes"])
        cw = (W - 14 * (n - 1)) / n
        for i, c in enumerate(o["changes"]):
            cx0 = x0 + i * (cw + 14)
            d.rounded_rectangle([cx0, y1 - ch + 6, cx0 + cw, y1], radius=(ch - 6) / 2, fill=PALE, outline=EDGE)
            txt = (c["label"] + "  " if c["label"] else "") + c["value"]
            ui.mtext(cx0 + cw / 2, y1 - (ch - 6) / 2, cw - 30, txt, 18, DARK, True, 1)


def _draw_triad(b, o, box, ui):
    d = ui.d
    x0, y0, x1, y1 = box
    yy = ui.title(b, x0, y0, x1)
    gap = 40
    W = x1 - x0 - gap * 2
    ws = (W * 0.3, W * 0.36, W * 0.34)
    xs = (x0, x0 + ws[0] + gap, x0 + ws[0] + ws[1] + gap * 2)
    for i in range(3):
        _pill_box(ui, xs[i], yy, xs[i] + ws[i], yy + 38, o["head"][i], (LINE, MID, DARK)[i])
    yy += 48
    n = max(1, len(o["rows"]))
    rh = (y1 - yy) / n
    for r, row in enumerate(o["rows"]):
        ry = yy + r * rh
        hot = bool(o["hl"]) and (o["hl"] == row[0] or o["hl"] in row[0])
        fills = (PALE, WHITE, DARK)
        for i in range(3):
            d.rounded_rectangle([xs[i], ry + 4, xs[i] + ws[i], ry + rh - 4], radius=8, fill=fills[i], outline=(DARK if hot and i == 0 else EDGE) if i < 2 else None, width=3 if hot and i == 0 else 2)
            ui.mtext(xs[i] + ws[i] / 2, ry + rh / 2, ws[i] - 26, row[i], 18, WHITE if i == 2 else (INK if i == 1 or hot else SUB), i != 0 or hot, 3)
        for i in range(2):
            ax = xs[i] + ws[i] + 8
            _arrow(d, (ax, ry + rh / 2), (ax + gap - 16, ry + rh / 2), LINE, 4, 12)


def _flow_layout(nodes, box, vert):
    x0, y0, x1, y1 = box
    n = len(nodes)
    out = []
    if vert:
        cx = x0 + (x1 - x0) * 0.36
        step = (y1 - y0) / n
        nw, nh = min(300, (x1 - x0) * 0.42), min(56, step * 0.62)
        for i in range(n):
            out.append((cx, y0 + step * (i + 0.5), nw, nh))
    else:
        cy = y0 + (y1 - y0) * 0.34
        step = (x1 - x0) / n
        nw, nh = min(200, step * 0.8), min(74, (y1 - y0) * 0.26)
        for i in range(n):
            out.append((x0 + step * (i + 0.5), cy, nw, nh))
    return out


def _flow_node(ui, x, ty, cx, cy, nw, nh):
    d = ui.d
    if ty == "if":
        dw, dh = nw * 0.98, nh * 1.3
        d.polygon([(cx, cy - dh / 2), (cx + dw / 2, cy), (cx, cy + dh / 2), (cx - dw / 2, cy)], fill=MID)
        ui.mtext(cx, cy, dw * 0.6, x, 17, WHITE, True, 2)
        return dw / 2, dh / 2
    if ty == "end":
        d.rounded_rectangle([cx - nw / 2, cy - nh / 2, cx + nw / 2, cy + nh / 2], radius=nh / 2, fill=DARK)
        ui.mtext(cx, cy, nw - 24, x, 16, WHITE, True, 2)
        return nw / 2, nh / 2
    d.rounded_rectangle([cx - nw / 2, cy - nh / 2, cx + nw / 2, cy + nh / 2], radius=8, fill=WHITE, outline=MID, width=2)
    ui.mtext(cx, cy, nw - 20, x, 18, INK, True, 2)
    return nw / 2, nh / 2


def _draw_flowchart(b, o, box, ui):
    d = ui.d
    x0, y0, x1, y1 = box
    yy = ui.title(b, x0, y0, x1)
    nodes = o["nodes"]
    vert = (y1 - yy) > (x1 - x0) * 0.55
    pos = _flow_layout(nodes, (x0, yy, x1, y1), vert)
    half = []
    for nd, (cx, cy, nw, nh) in zip(nodes, pos):
        half.append(_flow_node(ui, nd["text"], nd["type"], cx, cy, nw, nh))
    f = ui.f(14)
    for i in range(len(nodes) - 1):
        (cx, cy, _, _), (nx, ny, _, _) = pos[i], pos[i + 1]
        hw, hh = half[i]
        nhw, nhh = half[i + 1]
        if vert:
            _arrow(d, (cx, cy + hh), (nx, ny - nhh - 2), MID, 3, 10)
        else:
            _arrow(d, (cx + hw, cy), (nx - nhw - 2, ny), MID, 3, 10)
        if nodes[i]["type"] == "if":
            lab = "예"
            d.text((cx + 8, cy + hh + 2) if vert else (cx + hw + 4, cy - 22), lab, font=f, fill=MID)
    lane = 0
    for i, nd in enumerate(nodes):
        if nd["type"] != "if" or not nd["no"]:
            continue
        cx, cy, nw, nh = pos[i]
        hw, hh = half[i]
        j = flow_index(nodes, nd["no"])
        lane += 1
        if j >= 0 and j != i:
            tx, ty, _, _ = pos[j]
            thw, thh = half[j]
            if vert:
                lx = cx + max(hw, thw) + 30 + lane * 26
                pts = [(cx + hw, cy), (lx, cy), (lx, ty), (tx + thw + 3, ty)]
                lp = (cx + hw + 6, cy - 22)
            else:
                ly = cy + max(hh, thh) + 26 + lane * 24
                pts = [(cx, cy + hh), (cx, ly), (tx, ly), (tx, ty + thh + 3)]
                lp = (cx + 6, cy + hh + 2)
            _poly_arrow(d, pts, (148, 163, 184), 3, 10)
        else:
            if vert:
                sx, sy = min(x1 - nw * 0.42, cx + hw + 40 + nw * 0.4), cy
                _arrow(d, (cx + hw, cy), (sx - nw * 0.4 - 3, sy), LINE, 3, 10)
                lp = (cx + hw + 6, cy - 22)
            else:
                sx, sy = cx, min(y1 - nh * 0.6, cy + hh + 40 + nh / 2)
                _arrow(d, (cx, cy + hh), (sx, sy - nh / 2 - 3), LINE, 3, 10)
                lp = (cx + 6, cy + hh + 2)
            d.rounded_rectangle([sx - nw * 0.4, sy - nh / 2, sx + nw * 0.4, sy + nh / 2], radius=8, fill=PALE, outline=LINE, width=2)
            ui.mtext(sx, sy, nw * 0.8 - 16, nd["no"], 15, INK, True, 2)
        d.text(lp, "아니오", font=f, fill=SUB)


def _draw_rowgrid(b, o, box, ui):
    d = ui.d
    x0, y0, x1, y1 = box
    yy = ui.title(b, x0, y0, x1)
    lw = (x1 - x0) * 0.18
    gx0 = x0 + lw + 12
    head = o["head"]
    nc = max([len(head)] + [len(r["cells"]) for r in o["rows"] if not r["chips"]] + [1])
    cw = (x1 - gx0) / nc
    hot = lambda h: bool(o["hl"]) and (o["hl"] == h or o["hl"] in h)   # noqa: E731
    if head:
        for j, h in enumerate(head):
            tone = 210 - int(110 * j / max(1, len(head) - 1))
            col = DARK if hot(h) else (tone, tone + 10, tone + 25)
            _chev(d, gx0 + j * cw, yy, gx0 + (j + 1) * cw + (10 if j < len(head) - 1 else 0), yy + 40, col, j == 0, j == len(head) - 1)
            ui.mtext(gx0 + (j + 0.5) * cw, yy + 20, cw - 30, h, 17, WHITE if tone < 160 or hot(h) else INK, True, 1)
        yy += 50
    n = max(1, len(o["rows"]))
    rh = (y1 - yy) / n
    for i, r in enumerate(o["rows"]):
        ry = yy + i * rh
        d.rounded_rectangle([x0, ry + 3, x0 + lw, ry + rh - 3], radius=6, fill=MID)
        ui.mtext(x0 + lw / 2, ry + rh / 2, lw - 16, r["name"], 18, WHITE, True, 2)
        if r["chips"]:
            cx, cy = gx0, ry + 8
            f = ui.f(16, False)
            ph = min(36, rh - 16)
            for c in r["cells"]:
                w = d.textlength(c, font=f) + 30
                if cx + w > x1 and cx > gx0:
                    cx, cy = gx0, cy + ph + 8
                if cy + ph > ry + rh:
                    break
                d.rounded_rectangle([cx, cy, cx + w, cy + ph], radius=ph / 2, fill=PALE, outline=EDGE, width=2)
                d.text((cx + 15, cy + ph / 2 - 11), c, font=f, fill=INK)
                cx += w + 8
        else:
            for j, c in enumerate(r["cells"]):
                on = j < len(head) and hot(head[j])
                d.rounded_rectangle([gx0 + j * cw + 4, ry + 3, gx0 + (j + 1) * cw - 4, ry + rh - 3], radius=6, fill=(219, 234, 254) if on else PALE, outline=EDGE)
                ui.mtext(gx0 + (j + 0.5) * cw, ry + rh / 2, cw - 24, c, 16, INK, on, 3)
        if i < n - 1:
            d.line([gx0, ry + rh, x1, ry + rh], fill=SOFT, width=1)


def _draw_timeline(b, o, box, ui):
    d = ui.d
    x0, y0, x1, y1 = box
    yy = ui.title(b, x0, y0, x1)
    ev = o["ev"]
    n = len(ev)
    gw = min(220, (x1 - x0) * 0.16) if o["goal"] else 0
    ax1 = x1 - gw - 10
    my = (yy + y1) / 2
    _arrow(d, (x0 + 4, my), (ax1, my), MID, 8, 22)
    sw = (ax1 - x0 - 40) / n
    stem = (y1 - yy) * 0.14
    for i, e in enumerate(ev):
        px = x0 + 20 + sw * (i + 0.5)
        up = (e["side"] == "up") if e["side"] else i % 2 == 0
        tone = 190 - int(140 * i / max(1, n - 1))
        d.ellipse([px - 11, my - 11, px + 11, my + 11], fill=(tone, tone + 10, tone + 25), outline=WHITE, width=3)
        d.line([px, my - 12 if up else my + 12, px, my - stem if up else my + stem], fill=LINE, width=2)
        cw = min(sw * 1.7, 260)
        ch = (my - stem - yy - 4) if up else (y1 - my - stem - 4)
        cy0 = (my - stem - ch) if up else my + stem
        d.rounded_rectangle([px - cw / 2, cy0, px + cw / 2, cy0 + ch], radius=8, fill=PALE, outline=EDGE)
        ty = cy0 + 8
        if e["p"]:
            ty = ui.ctext(px, ty, cw - 14, e["p"], 17, BLUE, True, 1)
        ty = ui.ctext(px, ty, cw - 14, e["t"], 17, INK, True, 2, 21)
        if e["d"] and ty < cy0 + ch - 18:
            ui.ctext(px, ty, cw - 14, e["d"], 14, SUB, False, max(1, int((cy0 + ch - ty) // 18)), 18)
    if gw:
        gx = x1 - gw
        _flag(d, gx + 10, my - 64, 56)
        ui.lines_in(gx + 10, my + 4, gw - 14, y1, o["goal"], ui.f(19), DARK, 24)


def _draw_stairs(b, o, box, ui):
    d = ui.d
    x0, y0, x1, y1 = box
    st = o["steps"]
    n = len(st)
    top = y0 + 64
    sw = (x1 - x0 - 20) / n
    sh = (y1 - top) / (n + 0.2)
    for i, s in enumerate(st):
        sx, sy = x0 + i * sw, y1 - (i + 1) * sh
        tone = 215 - int(130 * i / max(1, n - 1))
        fg = WHITE if tone < 160 else INK
        d.rectangle([sx, sy, sx + sw - 4, y1], fill=(tone, tone + 10, tone + 25))
        d.line([sx, sy, sx + sw - 4, sy], fill=MID, width=4)
        ty = sy + 10
        if s["p"]:
            ty = ui.ctext(sx + sw / 2, ty, sw - 20, s["p"], 16, BLUE if tone >= 160 else (191, 219, 254), True, 1)
        ty = ui.ctext(sx + sw / 2, ty, sw - 20, s["t"], 19, fg, True, 2, 23)
        if s["d"]:
            ui.ctext(sx + sw / 2, ty + 2, sw - 20, s["d"], 15, fg, False, 3, 19)
    lx, ly = x0 + (n - 1) * sw + sw - 30, y1 - n * sh
    _flag(d, lx, ly - 54, 50)
    if b.get("t"):
        f = ui.f(22)
        tw = min(x1 - x0 - 20, d.textlength(b["t"], font=f))
        ui.lines_in(max(x0, lx - tw - 20), y0 + 10, tw + 10, top - 4, b["t"], f, DARK, 28)
    if o["who"] and n >= 2:
        px, py = x0 + (n - 2) * sw + sw / 2, y1 - (n - 1) * sh
        _person(d, px, py - 30, 26, MID)


def _draw_consortium(b, o, box, ui):
    d = ui.d
    x0, y0, x1, y1 = box
    yy = ui.title(b, x0, y0, x1)
    cs = o["cos"]
    if cs and not any(c["lead"] for c in cs):
        cs = [dict(cs[0], lead=True)] + cs[1:]
    n = len(cs)
    pg = 50
    wts = [1.35 if c["lead"] else 1.0 for c in cs]
    unit = (x1 - x0 - pg * (n - 1)) / sum(wts)
    cx = x0
    sh = 52 if any(c["share"] for c in cs) else 0
    for i, (c, wt) in enumerate(zip(cs, wts)):
        w = unit * wt
        top = yy + sh + (0 if c["lead"] else 26)
        if c["share"]:
            ui.ctext(cx + w / 2, yy + (0 if c["lead"] else 20), w, c["share"], 40 if c["lead"] else 32, DARK if c["lead"] else SUB, True, 1)
        d.rounded_rectangle([cx, top, cx + w, y1 - (0 if c["lead"] else 26)], radius=12, fill=WHITE if not c["lead"] else PALE, outline=DARK if c["lead"] else EDGE, width=4 if c["lead"] else 2)
        d.rounded_rectangle([cx, top, cx + w, top + 46], radius=12, fill=DARK if c["lead"] else LINE)
        ui.mtext(cx + w / 2, top + 23, w - 20, ("★ " if c["lead"] else "") + c["name"], 20, WHITE, True, 1)
        ty = ui.ctext(cx + w / 2, top + 60, w - 30, c["role"], 18, INK, True, 3, 23)
        if c["note"]:
            ui.ctext(cx + w / 2, ty + 8, w - 30, c["note"], 16, SUB, False, 3, 21)
        if i < n - 1:
            px = cx + w + pg / 2
            f = ui.f(34)
            d.text((px - d.textlength("+", font=f) / 2, (top + y1) / 2 - 22), "+", font=f, fill=LINE)
        cx += w + pg


def _draw_trace(b, o, box, ui):
    d = ui.d
    x0, y0, x1, y1 = box
    yy = ui.title(b, x0, y0, x1)
    three = bool(o["mid"])
    W = x1 - x0
    if three:
        ws, xs = (W * 0.24, W * 0.31, W * 0.29), (x0, x0 + W * 0.355, x0 + W * 0.71)
        groups = (o["left"], o["mid"], o["right"])
    else:
        ws, xs = (W * 0.3, W * 0.42), (x0, x0 + W * 0.58)
        groups = (o["left"], o["right"])
    hh = 42
    for i, nm in enumerate(o["head"][:len(groups)]):
        col = DARK if i == len(groups) - 1 else (LINE if i == 0 else MID)
        d.rounded_rectangle([xs[i], yy, xs[i] + ws[i], yy + hh], radius=14, fill=col)
        ui.mtext(xs[i] + ws[i] / 2, yy + hh / 2, ws[i] - 20, nm, 18, WHITE, True, 1)
    by0 = yy + hh + 12
    centers = []
    for i, items in enumerate(groups):
        n = max(1, len(items))
        rh = (y1 - by0) / n
        bh = min(rh - 8, 64)
        cs = {}
        for j, it in enumerate(items):
            cy = by0 + rh * (j + 0.5)
            last = i == len(groups) - 1
            d.rounded_rectangle([xs[i], cy - bh / 2, xs[i] + ws[i], cy + bh / 2], radius=8, fill=WHITE, outline=DARK if last else EDGE, width=3 if last else 2)
            ui.mtext(xs[i] + ws[i] / 2, cy, ws[i] - 20, it, 18 if not last else 19, INK, True, 2)
            cs[it] = cy
        centers.append(cs)
    pairs = set()
    for a, m, rs in o["rows"]:
        if three:
            if m:
                pairs.add((0, a, m))
                for r in rs:
                    pairs.add((1, m, r))
        else:
            for r in rs:
                pairs.add((0, a, r))
    for i, a, c in sorted(pairs):
        if a in centers[i] and c in centers[i + 1]:
            s, e = (xs[i] + ws[i], centers[i][a]), (xs[i + 1], centers[i + 1][c])
            _dashed(d, s, e, (96, 165, 250), 2, 6)
            d.ellipse([s[0] - 5, s[1] - 5, s[0] + 5, s[1] + 5], fill=BLUE)
            d.ellipse([e[0] - 5, e[1] - 5, e[0] + 5, e[1] + 5], fill=MID)


def _hub(ui, cx, cy, rx, ry, center, nodes, big):
    d = ui.d
    n = max(1, len(nodes))
    nw, nh = min(170, rx * 0.95), 40 if big else 34
    for i, nd in enumerate(nodes):
        a = -math.pi / 2 + 2 * math.pi * i / n
        px, py = cx + rx * math.cos(a), cy + ry * math.sin(a)
        d.line([cx, cy, px, py], fill=LINE, width=2)
        d.rounded_rectangle([px - nw / 2, py - nh / 2, px + nw / 2, py + nh / 2], radius=nh / 2, fill=PALE, outline=EDGE, width=2)
        ui.mtext(px, py, nw - 16, nd, 16 if big else 15, INK, True, 1)
    r = min(rx * 0.34, ry * 0.5)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=DARK if big else MID)
    ui.mtext(cx, cy, r * 1.6, center, 19 if big else 17, WHITE, True, 3)


def _draw_twinhub(b, o, box, ui):
    d = ui.d
    x0, y0, x1, y1 = box
    yy = ui.title(b, x0, y0, x1)
    W = x1 - x0
    hs = o["hubs"]
    lw, aw = W * 0.38, W * 0.08
    rw = W - lw - aw
    for i, h in enumerate(hs):
        big = i == 1
        hx0 = x0 if not big else x0 + lw + aw
        w = rw if big else lw
        if h["label"]:
            _pill(ui, hx0 + w / 2, yy + 18, h["label"], 17, dark=big)
        top = yy + (44 if h["label"] else 0)
        cx, cy = hx0 + w / 2, (top + y1) / 2
        rx, ry = w * 0.38, (y1 - top) * (0.4 if big else 0.34)
        _hub(ui, cx, cy, rx, ry, h["center"], h["nodes"], big)
    ax = x0 + lw + 6
    my = (yy + y1) / 2 + 20
    d.polygon([(ax, my - 22), (ax + aw - 30, my - 22), (ax + aw - 8, my), (ax + aw - 30, my + 22), (ax, my + 22), (ax + 14, my)], fill=LINE)


# ───────────────────────── 시안 지시(영어) ─────────────────────────
def _q(s):
    return f'"{s}"'


def text(k, t, d):
    """이미지 모델에 줄 형태 지시 — '<FORM NAME>: …'. 글은 그대로 찍을 한국어(따옴표 안)"""
    o = PARSE[k](d)
    if k == "arch":
        zs = " ; ".join(f'zone [{z["name"]}]: ' + ", ".join(("DB cylinder " if n["db"] else "node ") + _q(n["name"]) for n in z["nodes"]) for z in o["zones"])
        ls = " ; ".join(f'{_q(l["a"])} → {_q(l["b"])}' + (f' labeled {_q(l["label"])}' if l["label"] else "") for l in o["links"])
        return (f'SYSTEM ARCHITECTURE DIAGRAM ({"zones stacked top to bottom" if o["dir"] == "세로" else "zones side by side left to right"}): each zone is a large rounded pale panel with its name at the top-left,'
                f' its nodes inside as small white boxes in a grid (databases drawn as cylinders); thick connector arrows between zones'
                + (f'; the zone {_q(o["hl"])} has a thick primary outline (our system)' if o["hl"] else "") + f'. Zones: {zs}' + (f'. Connections: {ls}' if ls else "")
                + ". Draw a real architecture diagram, never cards or a bullet list.")
    if k == "stepcols":
        ss = " ; ".join(f'stage {i + 1} {_q(s["name"])}' + (f' ({s["period"]})' if s["period"] else "") + ": " + " / ".join(_q(x) for x in s["items"]) for i, s in enumerate(o["steps"]))
        return (f'STAGE COLUMNS: a row of chevron headers across the top (light → dark, left to right), under each chevron an equal-width column with its own short bullet list'
                + (f'; at the right end a dark result box {_q(o["result"])} with an arrow into it' if o["result"] else "") + f': {ss}')
    if k == "derive":
        f = " / ".join(_q(x) for x in o["feats"])
        m = " / ".join(_q(x) for x in o["imps"])
        s = " ; ".join(f'{x["no"]} {_q(x["name"])}' + (": " + ", ".join(x["items"]) if x["items"] else "") for x in o["strats"])
        return (f'STRATEGY DERIVATION in three columns joined by thick right-pointing arrows: LEFT pale list headed {_q(o["names"][0])}: {f}; MIDDLE checklist headed {_q(o["names"][1])}: {m};'
                f' RIGHT dark panel headed {_q(o["names"][2])} with big numbers and strategy names (the conclusion): {s}')
    if k == "askanswer":
        qs = " ; ".join(f'{"left" if i % 2 == 0 else "right"} person' + (f' ({q["who"]})' if q["who"] else "") + f' with speech bubble "“{q["q"]}”"' + (f', answer under them in bold {_q(q["a"])}' if q["a"] else "") for i, q in enumerate(o["qa"]))
        return (f'QUESTION → ANSWER SCENE: people at the sides each asking a question in a large speech bubble; in the CENTER a large clean UI screen mock'
                + (f' of {o["pic"]}' if o["pic"] else "") + (f' with a dark pill label {_q(t)} under it (our answer)' if t else "") + f': {qs}')
    if k == "linkage":
        side = lambda xs: " / ".join(_q(x["name"]) + (": " + ", ".join(x["items"]) if x["items"] else "") for x in xs)   # noqa: E731
        return (f'INTEGRATION (LINKAGE) DIAGRAM: LEFT column list of external organizations/systems {side(o["left"])} → a tall vertical pillar'
                + (f' labeled {_q(o["ways"][0])} (vertical text)' if o["ways"][0] else "") + f' → a large CENTER system box headed {_q(t or "")}'
                + (f' with check items {" / ".join(_q(x) for x in o["center"])}' if o["center"] else "") + (f' and a screen mock of {o["pic"]}' if o["pic"] else "")
                + (f' ← a second pillar' + (f' labeled {_q(o["ways"][1])}' if o["ways"][1] else "") + f' ← RIGHT column list {side(o["right"])}' if o["right"] else "")
                + "; short connector lines from every list item to its pillar.")
    if k == "org":
        r = o["root"] or {"name": "", "note": ""}
        ts = " ; ".join(_q(x["name"]) + (f' — {x["role"]}' if x["role"] else "") + (f' ({x["n"]})' if x["n"] else "") for x in o["teams"])
        return (f'ORGANIZATION CHART: at the top center the lead box {_q(r["name"])}' + (f' with a photo circle and the line {_q(r["note"])}' if r["note"] else " with a photo circle")
                + f'; a trunk line down to a horizontal bus, branching to team boxes in one row (dark header band with the team name, a small photo circle, the role): {ts}'
                + (f'; support units in a dashed box to the side connected by a dashed line: {" / ".join(_q(x) for x in o["sup"])}' if o["sup"] else ""))
    if k == "voices":
        ss = " ; ".join(f'"“{x}”"' for x in o["says"])
        return (f'VOICES SCENE: one person in a round scene in the CENTER' + (f' ({o["pic"]})' if o["pic"] else "") + f', speech bubbles spread evenly around them (left and right): {ss}'
                + (f'; under the scene a big bold question line {_q(t)}' if t else "") + (f'; small source line "출처: {o["src"]}"' if o["src"] else ""))
    if k == "screenshift":
        be, af = o["before"] or {}, o["after"] or {}
        cs = " ; ".join((c["label"] + " " if c["label"] else "") + c["value"] for c in o["changes"])
        return (f'SCREEN BEFORE → AFTER: LEFT a small faded screenshot mock labeled {_q(be.get("name", "AS-IS"))}' + (f' ({be["pic"]})' if be.get("pic") else "")
                + (f' with the grey note {_q(be["note"])}' if be.get("note") else "") + f'; a big chevron arrow; RIGHT a larger crisp screenshot mock labeled {_q(af.get("name", "TO-BE"))}'
                + (f' ({af["pic"]})' if af.get("pic") else "") + " with 2–3 numbered callout dots" + (f' and the bold note {_q(af["note"])}' if af.get("note") else "")
                + (f'; a row of change chips under both: {cs}' if cs else ""))
    if k == "triad":
        rs = " ; ".join(f'row {i + 1}: ' + " → ".join(_q(c) for c in r) for i, r in enumerate(o["rows"]))
        return (f'ISSUE → SOLUTION → EFFECT ROWS: three column headers {" | ".join(_q(h) for h in o["head"])}; each row is three cells joined by arrows — left pale, middle white, right dark'
                + (f'; the row {_q(o["hl"])} highlighted' if o["hl"] else "") + f': {rs}')
    if k == "flowchart":
        ns = " → ".join(("decision diamond " + _q(n["text"]) + (f' (YES → {_q(n["yes"])}' if n["yes"] else " (YES ↓") + (f', NO → {_q(n["no"])})' if n["no"] else ")")) if n["type"] == "if"
                        else ("end terminal " + _q(n["text"])) if n["type"] == "end" else _q(n["text"]) for n in o["nodes"])
        return ('FLOWCHART: process boxes joined by arrows in order, decision steps drawn as DIAMONDS with "예" and "아니오" branch labels — the NO branch turns aside and loops back'
                f' to the step it names; rounded terminal at the end: {ns}')
    if k == "rowgrid":
        rs = " ; ".join(f'row {_q(r["name"])}: ' + (" , ".join(_q(c) for c in r["cells"]) + (" (rounded chips)" if r["chips"] else "")) for r in o["rows"])
        return (f'ROW-HEADER GRID: a dark header cell at the left of every row' + (f', chevron column headers across the top {" | ".join(_q(h) for h in o["head"])}' if o["head"] else "")
                + (f', the column {_q(o["hl"])} highlighted' if o["hl"] else "") + f'; cells or rounded chips to the right of each header: {rs}')
    if k == "timeline":
        es = " ; ".join((f'[{e["p"]}] ' if e["p"] else "") + _q(e["t"]) + (f' — {e["d"]}' if e["d"] else "") for e in o["ev"])
        return (f'MILESTONE TIMELINE: one thick horizontal arrow axis, dots on it (later = darker), labels alternating ABOVE and BELOW the axis on short stems, each with the period bold in the primary color'
                + (f'; a flag at the arrow end with {_q(o["goal"])}' if o["goal"] else "") + f': {es}')
    if k == "stairs":
        ss = " → ".join((f'[{s["p"]}] ' if s["p"] else "") + _q(s["t"]) + (f' ({s["d"]})' if s["d"] else "") for s in o["steps"])
        return (f'GROWTH STAIRS: steps rising from bottom-left to top-right (later = higher and darker), each step labeled, a goal flag on the top step'
                + (f' with {_q(t)}' if t else "") + (f'; a small figure ({o["who"]}) climbing the steps' if o["who"] else "") + f': {ss}')
    if k == "consortium":
        cs = " + ".join(("LEAD " if c["lead"] else "") + _q(c["name"]) + (f' {c["share"]}' if c["share"] else "") + (f' ({c["role"]})' if c["role"] else "") + (f' — {c["note"]}' if c["note"] else "") for c in o["cos"])
        return (f'CONSORTIUM: company cards side by side joined by "+" signs, the lead company card larger with a dark header and thick outline, each card with its share % large above it, role and track record inside: {cs}')
    if k == "trace":
        rs = " ; ".join(f'{_q(a)}' + (f' → {_q(m)}' if m else "") + " → " + ", ".join(_q(r) for r in rs) for a, m, rs in o["rows"])
        return (f'REQUIREMENT TRACEABILITY MAP: {len(o["head"])} columns headed {" | ".join(_q(h) for h in o["head"])}, items as boxes in each column,'
                f' thin dashed connector lines between related boxes (many-to-many), the last column ({_q(o["head"][-1])}) outlined dark: {rs}')
    if k == "twinhub":
        hs = " ; ".join((f'{_q(h["label"])}: ' if h["label"] else "") + f'center {_q(h["center"])} with nodes ' + ", ".join(_q(n) for n in h["nodes"]) for h in o["hubs"])
        return f'TWIN HUB COMPARISON: two hub-and-spoke diagrams side by side with an arrow between, the RIGHT hub larger and darker with more nodes (the improved structure): {hs}'
    return ""
