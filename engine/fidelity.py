# -*- coding: utf-8 -*-
"""시안이 와이어프레임을 따랐는지 — 와이어 스케치와 시안 그림을 함께 보는 판정(2026-10-18 와이어 고도화 B3).

사용자: "가끔 와이어와 전혀 상관없는 이미지 시안이 나온다". 그림 모델에 와이어 스케치를 첫 참고로 넘겨도
배치를 무시할 때가 있다 — 그리고 나서 아무도 재지 않았다. 여기서는:
  layout_lock(s)   그림 모델 지시 맨 앞에 붙는 '배치 고정' 글(상자 수·읽는 순서·자리 %)
  prompt(s)        판정 모델(글+그림 보기)에 줄 지시 — 엄격한 JSON
  parse(text)      답 읽기 — 깨진 JSON·코드펜스·점수 문자열·범위 밖 값을 견딘다. 못 읽으면 None
  fix_text(r)      다시 그릴 때 덧붙이는 '고칠 것' 글
판정 호출·다시 그리기·더 나은 쪽 고르기는 design.check_mockup. 값 기준: 점수 70 미만 또는 배치 틀림이면 한 번 더.
"""
import json, re

PASS = 70          # 이 점수 밑이면 한 번 더 그린다
SKIP_KINDS = ()    # 모든 상자를 본다(그림 자리도 '자리'는 지켜야 한다)

SYSTEM = """You are a strict layout reviewer for slide mockups. You get two images:
IMAGE 1 = the approved WIREFRAME (grey sketch; every block has its position, its title and its key text/numbers).
IMAGE 2 = the generated MOCKUP that was supposed to follow it (styled, colored).
Judge ONLY whether the mockup follows the wireframe — not beauty, not colors.
Check: (1) every wireframe block exists in the mockup at roughly the same position and relative size, in the same order;
(2) each block's title text appears (Korean, small spelling differences are fine);
(3) every number in the wireframe (values, %, units) appears unchanged in the mockup and no invented numbers were added;
(4) the visual kind matches (a chart stays a chart of the same type, a table stays a table, a flow stays a flow).
If you cannot see both images, answer {"score": null, "error": "no_vision"}.
Answer with ONE JSON object only, no prose:
{"score": 0-100, "layout_ok": true|false, "numbers_ok": true|false, "missing": ["block titles not present in the mockup"], "extra": ["blocks or numbers in the mockup that are not in the wireframe"], "moved": ["block titles placed in a clearly different position"], "note": "one short sentence"}
Scoring: start at 100; -15 per missing block, -10 per moved block, -10 per wrong/missing number (max -40), -10 per extra block, -25 if the overall arrangement (columns/rows) differs."""


def _pos(b):
    x, y, w, h = (float(b.get(k, 0)) for k in ("x", "y", "w", "h"))
    return f"left {x:.0f}–{x + w:.0f}%, top {y:.0f}–{y + h:.0f}%"


def reading_order(wire):
    """상자를 읽는 순서로 — 위 줄부터(같은 줄로 볼 범위 8%), 줄 안에서는 왼쪽부터"""
    bs = [b for b in wire or [] if isinstance(b, dict)]
    return sorted(bs, key=lambda b: (round(float(b.get("y", 0)) / 8), float(b.get("x", 0))))


def box_list(wire, kind_name=None):
    """'1. CHART "연도별 민원 건수" — left 2–66%, top 14–80%' 줄들"""
    out = []
    for i, b in enumerate(reading_order(wire), 1):
        k = str(b.get("k") or "card")
        name = (kind_name(k) if kind_name else k).upper()
        t = str(b.get("t") or "").strip()
        out.append(f'{i}. {name}' + (f' "{t}"' if t else "") + f" — {_pos(b)}")
    return out


def layout_lock(wire):
    """그림 모델 지시 맨 앞 — 첫 참고 그림이 정확한 배치라는 것, 상자 수·순서·자리"""
    rows = box_list(wire)
    if not rows:
        return ""
    return ("LAYOUT LOCK (highest priority after the text rules): the FIRST reference image is the exact layout of this slide body. "
            f"It has exactly {len(rows)} blocks. Keep every block's position, size, count and reading order — style each block in the deck design, "
            "but do NOT rearrange, merge, split, drop or add blocks, and do not swap a chart/table/flow for a different kind of visual. "
            "Blocks in reading order (positions are % of the body image; kind names and positions are instructions — never print them):\n" + "\n".join(rows) + "\n\n")


def prompt(wire, numbers=None):
    """판정 모델 user 글 — 상자 목록과 꼭 있어야 할 수치(와이어 글 속)"""
    rows = box_list(wire)
    nums = sorted(set(numbers or []))[:40]
    return ("Wireframe blocks in reading order:\n" + "\n".join(rows)
            + ("\nNumbers that must appear unchanged: " + ", ".join(nums) if nums else "")
            + "\nCompare IMAGE 2 against IMAGE 1 and answer with the JSON object only.")


def wire_numbers(wire):
    """와이어 글 속 두 자리 이상 수치(1,820 · 71.4 · 95%) — 판정 모델이 시안에서 찾을 것"""
    out = set()
    for b in wire or []:
        for m in re.finditer(r"(?<![\d.])\d[\d,]*(?:\.\d+)?%?", f"{b.get('t', '')}\n{b.get('d', '')}"):
            v = m.group(0)
            if len(re.sub(r"\D", "", v)) >= 2:
                out.add(v)
    return sorted(out)


def _first_obj(text):
    s = str(text or "")
    s = re.sub(r"```(?:json)?", "", s)
    i = s.find("{")
    while i >= 0:
        depth, j = 0, i
        while j < len(s):
            if s[j] == "{":
                depth += 1
            elif s[j] == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(s[i:j + 1], strict=False)
                    except Exception:
                        break
            j += 1
        i = s.find("{", i + 1)
    return None


def _as_list(v):
    if isinstance(v, list):
        return [str(x)[:80] for x in v if str(x).strip()][:12]
    if isinstance(v, str) and v.strip():
        return [x.strip()[:80] for x in re.split(r"[,;\n]", v) if x.strip()][:12]
    return []


def _as_bool(v, default):
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        return v.strip().lower() in ("true", "yes", "1", "ok", "y")
    if isinstance(v, (int, float)):
        return bool(v)
    return default


def parse(text):
    """판정 답 → {score, layout_ok, numbers_ok, missing, extra, moved, note}. 못 읽거나 그림을 못 본 답이면 None"""
    d = _first_obj(text)
    if not isinstance(d, dict):
        m = re.search(r"score\D{0,6}(\d{1,3})", str(text or ""), re.I)
        if not m:
            return None
        d = {"score": m.group(1)}
    if d.get("error") or d.get("score") is None:
        return None
    try:
        sc = float(str(d.get("score")).strip().rstrip("%").split("/")[0])
    except ValueError:
        return None
    if 0 < sc <= 1 and "." in str(d.get("score")):   # 0.86 꼴
        sc *= 100
    sc = int(round(max(0.0, min(100.0, sc))))
    missing, extra, moved = _as_list(d.get("missing")), _as_list(d.get("extra")), _as_list(d.get("moved"))
    return {"score": sc, "layout_ok": _as_bool(d.get("layout_ok"), sc >= PASS), "numbers_ok": _as_bool(d.get("numbers_ok"), True),
            "missing": missing, "extra": extra, "moved": moved, "note": str(d.get("note") or "")[:200]}


def need_retry(r):
    return bool(r) and (r["score"] < PASS or not r["layout_ok"])


def fix_text(r):
    """다시 그릴 때 덧붙일 글 — 앞 시안이 놓친 것"""
    if not r:
        return ""
    out = ["PREVIOUS ATTEMPT DID NOT FOLLOW THE WIREFRAME (layout match " + str(r["score"]) + "/100). Follow the first reference image block by block this time."]
    if r["missing"]:
        out.append("Missing blocks that MUST appear: " + "; ".join(r["missing"]))
    if r["moved"]:
        out.append("Put these back in their wireframe position: " + "; ".join(r["moved"]))
    if r["extra"]:
        out.append("Remove what is not in the wireframe: " + "; ".join(r["extra"]))
    if not r["numbers_ok"]:
        out.append("Print every number exactly as written in the wireframe — no changed, rounded or invented numbers.")
    if r.get("note"):
        out.append("Reviewer note: " + r["note"])
    return "\n".join(out) + "\n"


def better(a, b):
    """두 판정 중 나은 쪽이 b 면 True — 점수, 같으면 배치 맞는 쪽"""
    if not b:
        return False
    if not a:
        return True
    return (b["score"], b["layout_ok"]) > (a["score"], a["layout_ok"])
