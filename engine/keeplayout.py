"""기존 구성 그대로(발표용 옵션 keep, 2026-11-03)
올린 장표 pptx 를 기획 AI 없이 그대로 기획으로 옮긴다 — 장 순서·머리 띠·키메시지·본문 상자 자리·글은 원본 그대로, 디자인만 시안이 새로 그린다.

  원본 pptx → 장마다 (간지 | 본문) 가르기
    본문: 머리 띠(작은 글·큰 글·오른쪽 꼬리표) · 키메시지(강조어 = 다른 색 글) · 본문 도형(본문 그림 기준 % 자리·글)
    → AI 는 도형을 상자로 묶고 상자 종류만 고른다. 상자 자리는 엔진이 묶인 도형들의 테두리로 잰다(AI 가 자리를 짓지 않는다)
    → 원본 글이 빠지거나 원본에 없는 말이 들어가면 엔진이 잡아 한 번 다시, 그래도 빠진 글은 '글' 상자로 붙인다
  간지: 장 이름 + 한 줄 → 기획 chapters·div_lines(간지 시안이 그 글을 쓴다)
"""
import re

EMU_PT = 12700
HEAD_BAND = 0.14      # 머리 띠 — 위쪽 14% 안에서 시작하는 글
KEY_ZONE = (0.12, 0.27)   # 키메시지 — 머리 띠 바로 아래 넓은 한 줄
FOOT_CUT = 0.955      # 이보다 아래에서 시작하는 도형은 바닥(쪽번호·로고)
BODY_Y = (13.0, 97.0)   # 본문 그림 % — 위 11% 는 키메시지 띠(design.HEAD_STRIP)
BODY_X = (2.0, 98.0)


def _rgb(run):
    try:
        c = run.font.color
        if c is None or c.type is None:
            return None
        if c.type == 1:   # RGB
            return str(c.rgb)
        return f"theme{c.theme_color}"
    except Exception:
        return None


def _size(run, para=None):
    try:
        if run.font.size:
            return run.font.size.pt
    except Exception:
        pass
    return None


def _walk(shapes, xf=None):
    """묶음 안 도형까지 절대 자리(EMU)로. xf = 묶음 좌표 → 장 좌표 변환"""
    for sh in shapes:
        try:
            x, y, w, h = int(sh.left or 0), int(sh.top or 0), int(sh.width or 0), int(sh.height or 0)
        except Exception:
            continue
        if xf:
            x, y, w, h = xf(x, y, w, h)
        if sh.shape_type == 6:   # GROUP
            try:
                xfrm = sh._element.grpSpPr.find("{http://schemas.openxmlformats.org/drawingml/2006/main}xfrm")
                ch_off = xfrm.find("{http://schemas.openxmlformats.org/drawingml/2006/main}chOff")
                ch_ext = xfrm.find("{http://schemas.openxmlformats.org/drawingml/2006/main}chExt")
                cx, cy = int(ch_off.get("x")), int(ch_off.get("y"))
                cw, chh = max(1, int(ch_ext.get("cx"))), max(1, int(ch_ext.get("cy")))
                sx, sy = w / cw, h / chh

                def sub(a, b, c, d, x=x, y=y, cx=cx, cy=cy, sx=sx, sy=sy):
                    return x + (a - cx) * sx, y + (b - cy) * sy, c * sx, d * sy
            except Exception:
                sub = None
            yield from _walk(sh.shapes, sub)
            continue
        yield sh, x, y, w, h


def _text(sh):
    lines, runs = [], []
    if getattr(sh, "has_text_frame", False) and sh.has_text_frame:
        for p in sh.text_frame.paragraphs:
            t = "".join(r.text for r in p.runs)
            t = re.sub(r"[ \t ]+", " ", t).strip()
            if t:
                lines.append(t)
            runs += [r for r in p.runs if r.text.strip()]
    if getattr(sh, "has_table", False) and sh.has_table:
        for row in sh.table.rows:
            lines.append(" | ".join(c.text.replace("\n", " ").strip() for c in row.cells))
    return lines, runs


def _kind(sh):
    try:
        if sh.shape_type == 13:
            return "picture"
        if getattr(sh, "has_table", False) and sh.has_table:
            return "table"
        if getattr(sh, "has_chart", False) and sh.has_chart:
            return "chart"
        return str(sh.auto_shape_type).split(".")[-1].split(" ")[0].lower()
    except Exception:
        return "shape"


def _fill(sh):
    try:
        f = sh.fill
        if f.type == 1:
            c = f.fore_color
            return str(c.rgb) if c.type == 1 else f"theme{c.theme_color}"
    except Exception:
        pass
    return ""


def _line(sh):
    """테두리 색(채움 없는 칩은 테두리로 구분한다)"""
    try:
        ln = sh.line
        if ln.fill.type == 1 and ln.color.type == 1:
            return str(ln.color.rgb)
    except Exception:
        pass
    return ""


def _tcolor(runs):
    """글자 수로 가장 많은 글자 색"""
    cnt = {}
    for r in runs:
        c = _rgb(r)
        if c and re.fullmatch(r"[0-9A-Fa-f]{6}", c):
            cnt[c.upper()] = cnt.get(c.upper(), 0) + len(r.text.strip())
    return max(cnt, key=cnt.get) if cnt else ""


def keywords(runs, with_color=False, base=None):
    """다른 색으로 칠한 낱말 = 강조어. 글자 수로 가장 많은 색이 바탕색.
    with_color 면 [(낱말, 색 hex)] — 노랑 강조·남색 큰 숫자를 모두 '강조색'으로 칠하던 것(11-03 7차 시험)을 원본 색대로 넘기려고"""
    cnt = {}
    for r in runs:
        cnt[_rgb(r)] = cnt.get(_rgb(r), 0) + len(r.text.strip())
    if len(cnt) < 2:
        return []
    if isinstance(base, tuple) and base and base[0] == "hue":   # 덱 주색과 색상이 가까운(또는 무채색) 색이 바탕
        mh = _hue(base[1])[0]

        def far(c):
            c = _hex(str(c or "").upper())
            if not c:
                return 0.0   # 기본색(지정 없음) = 바탕 쪽
            h, sat = _hue(c)
            return 0.0 if sat < 0.15 else min(abs(h - mh), 360 - abs(h - mh))
        base = min(cnt, key=lambda c: (far(c), -cnt[c]))
    elif isinstance(base, list):
        base = next((c for c in base if c in cnt), None)
    base = base if base in cnt else max(cnt, key=cnt.get)
    out, cur, cc = [], "", ""
    for r in runs:
        if _rgb(r) != base and (not cur or _rgb(r) == cc):
            cur, cc = cur + r.text, _rgb(r)
            continue
        if cur:
            out.append((cur.strip(), cc))
            cur, cc = "", ""
        if _rgb(r) != base:
            cur, cc = r.text, _rgb(r)
    if cur:
        out.append((cur.strip(), cc))
    out = [(k, c) for k, c in dict.fromkeys(out) if len(k.replace(" ", "")) >= 2]
    if with_color:
        return [(k, (c or "").upper() if re.fullmatch(r"[0-9A-Fa-f]{6}", c or "") else "") for k, c in out]
    return list(dict.fromkeys(k for k, _ in out))


def _key_base(prs, W, H):
    """키메시지 바탕 글자색을 고를 기준 — 덱 주색(진한 채움 중 가장 많은 색). 키메시지 줄의 색 중 주색과 색상이 가깝거나 무채색(검정·회색)이 바탕,
    색상이 먼 것(빨강)이 강조어. 글자 수로 세면 빨강 키메시지가 많은 덱에서 빨강(191자)이 남색(174자)을 넘어 강조가 뒤집혔다(11-03 13차 시험)"""
    cnt, chars = {}, {}
    for slide in prs.slides:
        for sh, x, y, w, h in _walk(slide.shapes):
            c = _hex(_fill(sh)) if hasattr(sh, "fill") else ""
            if c and _lum(c) < 0.55 and _hue(c)[1] >= 0.15:
                cnt[c] = cnt.get(c, 0) + 1
            for r in _text(sh)[1]:
                chars[_rgb(r)] = chars.get(_rgb(r), 0) + len(r.text.strip())
    if cnt:
        return ("hue", max(cnt, key=cnt.get))
    return sorted(chars, key=lambda c: -chars[c])   # 진한 채움이 없는 덱 — 덱 글 전체 글자 수 순서


def _rows(items, W):
    """간지 목록 글상자들 → 읽는 순서의 줄 목록. 같은 줄에 붙은 칩과 글('전략 1' + 문장)은 한 줄로 잇고,
    여러 줄 글상자는 줄마다 하나씩, 단(왼쪽 → 오른쪽) 순서로(R206)"""
    rows = []
    for it in sorted(items, key=lambda it: (it["y"], it["x"])):
        # 잇는 것은 짧은 꼬리표(8자 이하, '전략 1') 하나 + 그 오른쪽 글 하나까지 — 옆 단 칩까지 이으면 두 줄이 한 줄로 붙는다
        # 칩이 글보다 살짝 아래면 글이 먼저 온다 — 꼬리표가 왼쪽이든 오른쪽이든 꼬리표 먼저
        def pair(r):
            if r["n"] != 1 or len(r["lines"]) != 1 or len(it["lines"]) != 1:
                return 0
            if abs((r["y"] + r["h"] / 2) - (it["y"] + it["h"] / 2)) >= 0.6 * min(r["h"], it["h"]):
                return 0
            if len(r["lines"][0].strip()) <= 8 and 0 <= it["x"] - r["x1"] < W * 0.05:
                return 1   # 꼬리표(r) 오른쪽에 글(it)
            if len(it["lines"][0].strip()) <= 8 and 0 <= r["x"] - (it["x"] + it["w"]) < W * 0.05:
                return -1   # 글(r) 왼쪽에 꼬리표(it)
            return 0
        r = next((r for r in rows if pair(r)), None)
        if r:
            if pair(r) == 1:
                r["lines"], r["x1"] = [r["lines"][0] + " " + it["lines"][0]], it["x"] + it["w"]
            else:
                r["lines"], r["x"] = [it["lines"][0] + " " + r["lines"][0]], it["x"]
            r["n"] = 2
        else:
            rows.append({"x": it["x"], "y": it["y"], "h": it["h"], "x1": it["x"] + it["w"], "lines": list(it["lines"]), "n": 1})
    rows.sort(key=lambda r: (round(r["x"] / (W * 0.2)), r["y"]))
    return [l for r in rows for l in r["lines"] if l.strip()]


def _cover_texts(items, H):
    """원본 표지 → {title, slogan, tail}. 가장 큰 글(85% 이상) = 사업명, 그 위 작은 글 = 키메시지, 그 아래 글 = 꼬리표(날짜·쪽 번호는 빼고).
    기존 구성 그대로인데 표지를 파일 이름으로 다시 짓고 원본 머리 문구·'제안설명회'를 버렸다(11-04 점검, R206)"""
    t = [it for it in items if it["lines"] and it["y"] < H * 0.9]
    if not t:
        return {}
    big = max(it["size"] or 0 for it in t)
    title = sorted([it for it in t if (it["size"] or 0) >= big * 0.85], key=lambda it: it["y"])
    top, bot = title[0]["y"], max(it["y"] + it["h"] for it in title)
    date = re.compile(r"^\s*(\d{4}\s*[.\-년]|\d{1,3}\s*$)")
    mid = lambda it: it["y"] + it["h"] / 2   # 가운데로 가른다 — 꼬리표 윗변이 사업명 아랫변에 딱 붙어 경계 비교에서 빠졌다
    above = [l for it in sorted(t, key=lambda it: it["y"]) if it not in title and mid(it) < top for l in it["lines"]]
    below = [l for it in sorted(t, key=lambda it: it["y"]) if it not in title and mid(it) > bot for l in it["lines"] if not date.match(l)]
    return {"title": "\n".join(l for it in title for l in it["lines"]), "slogan": " ".join(above).strip(), "tail": " ".join(below).strip()}


def read_deck(path):
    """원본 장마다 {no, kind: div|body|other, head_small, head_big, head_right, key, key_words, shapes:[…], name, line}"""
    from pptx import Presentation
    prs = Presentation(path)
    W, H = prs.slide_width, prs.slide_height
    key_base = _key_base(prs, W, H)
    out = []
    for no, slide in enumerate(prs.slides, 1):
        items = []
        for sh, x, y, w, h in _walk(slide.shapes):
            lines, runs = _text(sh)
            items.append({"sh": sh, "x": x, "y": y, "w": w, "h": h, "lines": lines, "runs": runs,
                          "size": max([_size(r) or 0 for r in runs] or [0]), "kind": _kind(sh)})
        texts = [it for it in items if it["lines"]]
        d = {"no": no, "kind": "other", "head_small": "", "head_big": "", "head_right": "", "key": "", "key_words": [], "shapes": [], "H": H}
        head = [it for it in texts if it["y"] < H * HEAD_BAND and it["y"] + it["h"] < H * 0.2]
        head_l = sorted([it for it in head if it["x"] < W * 0.5], key=lambda it: (it["y"], it["x"]))
        head_r = [it for it in head if it["x"] >= W * 0.5]
        big = max((it["size"] for it in texts), default=0)
        if not head_l and big >= 32:   # 간지 — 머리 띠 없이 큰 글
            d["kind"] = "div"
            body = sorted([it for it in texts if not (it["y"] < H * 0.1 and it["x"] > W * 0.5)], key=lambda it: (it["y"], it["x"]))
            name = max(body, key=lambda it: it["size"]) if body else None
            d["name"] = " ".join(name["lines"]) if name else ""
            rest = [l for it in body if it is not name for l in it["lines"]]
            d["lines"] = rest
            # 간지 한 줄 = 강조색(이름 다음으로 큰 글) 줄. 그 위는 설명 문장, 그 아래는 목록(전략 1~8·세부 방안 16개).
            # 예전엔 나머지를 설명 문장 하나로 이어 붙여 두 줄만 그려서 목록이 사라지고 목록 첫 줄이 문장 사이에 끼었다(11-04 점검, R206)
            sub = sorted([it for it in body if it is not name], key=lambda it: -it["size"])
            key_it = sub[0] if sub else None
            d["line"] = " ".join(key_it["lines"]) if key_it else ""
            cut = key_it["y"] + key_it["h"] if key_it else 0
            rest_it = [it for it in body if it is not name and it is not key_it]
            d["lead"] = " ".join(l for it in rest_it if it["y"] < cut for l in it["lines"])
            d["list"] = _rows([it for it in rest_it if it["y"] >= cut], W)
            d["tag"] = " ".join(l for it in texts if it["y"] < H * 0.1 and it["x"] > W * 0.5 for l in it["lines"])
            out.append(d)
            continue
        if not head_l:
            d["shapes"] = items
            out.append(d)
            continue
        d["kind"] = "body"
        hl = [l for it in head_l for l in it["lines"]]
        d["head_small"], d["head_big"] = (hl[0], " ".join(hl[1:])) if len(hl) > 1 else ("", hl[0])
        d["head_right"] = "\n".join(l for it in head_r for l in it["lines"])   # 두 줄 꼬리표(추진전략 | 5점 / 적용기술 | 5점)는 두 줄 그대로
        hb = max([it["y"] + it["h"] for it in head] or [0])
        # 폭이 좁은 글상자에 큰 글로 쓴 키메시지(52쪽 — 폭 50%, 24pt)도 키메시지. 그중 글이 가장 큰 것(같으면 위쪽) — 표 머리 띠를 키메시지로 잡았다(11-03 전체 시험)
        keys = [it for it in texts if it not in head and H * KEY_ZONE[0] <= it["y"] <= H * KEY_ZONE[1] and (it["w"] >= W * 0.6 or (it["size"] or 0) >= 20) and it["h"] < H * 0.12]
        top0 = hb
        if keys:
            k = max(keys, key=lambda it: ((it["size"] or 0), -it["y"]))
            d["key"] = " ".join(k["lines"])
            d["key_words"] = keywords(k["runs"], base=key_base)
            top0 = k["y"] + k["h"]
        else:
            k = None
        body = [it for it in items if it not in head and it is not k and it["y"] < H * FOOT_CUT and it["w"] > 0 and it["h"] > 0]
        # 머리 띠 뒤 장식(띠 그림·바탕 사각형) — 머리 띠 안에서 시작하는 글 없는 도형
        body = [it for it in body if not (it["y"] < hb and not it["lines"])]
        # 장 전체를 덮는 바탕(배경 그림·흰 판)은 상자가 아니다
        body = [it for it in body if not (it["w"] > W * 0.95 and it["h"] > H * 0.6)]
        if body:
            l0 = min(it["x"] for it in body)
            r0 = max(it["x"] + it["w"] for it in body)
            t0 = min(min(it["y"] for it in body), top0)
            b0 = max(it["y"] + it["h"] for it in body)
            sx = (BODY_X[1] - BODY_X[0]) / max(1, r0 - l0)
            sy = (BODY_Y[1] - BODY_Y[0]) / max(1, b0 - t0)
            for i, it in enumerate(sorted(body, key=lambda it: (round(it["y"] / (H * 0.02)), it["x"])), 1):
                d["shapes"].append({"id": f"s{i}", "kind": it["kind"], "fill": _fill(it["sh"]), "line": _line(it["sh"]), "tcolor": _tcolor(it["runs"]),
                                    "x": round(BODY_X[0] + (it["x"] - l0) * sx, 1), "y": round(BODY_Y[0] + (it["y"] - t0) * sy, 1),
                                    "w": round(it["w"] * sx, 1), "h": round(it["h"] * sy, 1),
                                    "text": "\n".join(it["lines"]), "size": it["size"], "words": keywords(it["runs"]),
                                    "wcolors": keywords(it["runs"], True),
                                    # 글이 실제로 차지하는 높이(본문 %) — 줄 수 × 글 크기 × 1.3. 빈 카드 찾기(그림 넣을 곳)
                                    "ink": round(len(it["lines"]) * (it["size"] or 12) * 1.3 * 12700 * sy, 1)})
        out.append(d)
    return out


# ── 상자 묶기(AI) + 원본 대조 ───────────────────────────────────────

def norm(s):
    return re.sub(r"[\s\-–—•·▪■□◆●○✓✔※/|:;,.()\[\]{}<>\"'“”‘’「」『』*→⇒]+", "", str(s or "")).lower()


def check(wire, shapes):
    """(빠진 원본 글 줄, 원본에 없는 말 조각, 어느 상자에도 안 든 글 도형 id)"""
    allw = norm(" ".join(f"{b.get('t', '')} {b.get('d', '')}" for b in wire))
    orig = norm(" ".join(s["text"] for s in shapes))
    missing = [l for s in shapes for l in s["text"].splitlines() if norm(l) and norm(l) not in allw]
    invented = []
    for b in wire:
        for ln in f"{b.get('t', '')}\n{b.get('d', '')}".splitlines():
            ln = re.sub(r"^\s*(-|\d+[.)]|그림:)\s*", "", ln)
            for piece in re.split(r"[|:→,]", ln):
                p = norm(piece)
                if len(p) >= 2 and p not in orig:
                    invented.append(piece.strip())
    ids = {i for b in wire for i in (b.get("ids") or [])}
    orphan = [s["id"] for s in shapes if s["text"].strip() and s["id"] not in ids]
    return missing, invented, orphan


def bounds(ids, by_id):
    xs = [by_id[i] for i in ids if i in by_id]
    if not xs:
        return None
    x0, y0 = min(s["x"] for s in xs), min(s["y"] for s in xs)
    x1, y1 = max(s["x"] + s["w"] for s in xs), max(s["y"] + s["h"] for s in xs)
    return {"x": round(x0, 1), "y": round(y0, 1), "w": round(max(3.0, x1 - x0), 1), "h": round(max(3.0, y1 - y0), 1)}


def kinds_text():
    import wirekinds
    rows = []
    for k in wirekinds.ALL if hasattr(wirekinds, "ALL") else []:
        rows.append(f"- {k['k']} ({k.get('label', '')}): {k.get('hint', '')}. 글 형식: {k.get('fmt', '')}")
    if not rows:
        import json, os
        d = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "wire_kinds.json"), encoding="utf-8"))
        rows = [f"- {k['k']} ({k.get('label', '')}): {k.get('hint', '')}. 글 형식: {k.get('fmt', '')}" for k in d["kinds"]]
    return "\n".join(rows)


SYSTEM = """너는 발표 장표의 도형 목록을 와이어프레임 상자로 옮겨 적는 사람이다. 장표를 새로 기획하지 않는다.
원본 한 장의 도형(자리 = 본문 그림 기준 %, 글, 모양, 채움색)을 보고, 사람이 볼 때 한 덩어리인 도형들을 상자 하나로 묶는다.

지킬 것
1. 묶음은 원본의 눈에 보이는 덩어리 그대로 — 머리 띠가 달린 패널·카드·단계 화살표 줄·결론 띠·각주 같은 단위. 덩어리를 합치거나 쪼개지 않는다.
2. 글이 있는 도형은 하나도 빠짐없이 어느 한 상자의 ids 에 넣는다. 글 없는 장식(아이콘 그림·바탕 판·화살표)은 그것이 속한 덩어리에 넣는다.
3. 상자 글(t·d)은 원본 글만 쓴다 — 낱말을 바꾸거나 줄이거나 보태지 않는다. 줄을 상자 종류의 글 형식에 맞게 배열만 한다(예: "- 항목").
   그림 상자(image·person·screen)의 d 첫 줄 "그림: …" 만 예외로 원본에 없는 말을 쓸 수 있다.
4. 상자 종류(k)는 원본 모양에 가장 가까운 것 — 쉐브론·오각형 화살표 줄 = flow, 머리 띠 + 목록 = panel, 작은 둥근 칩 여러 개를 담은 덩어리 = card(칩 글은 d 에 줄마다 "- 칩"),
   큰 숫자 원 = badge, 아래 짙은 한 줄 결론 = band, 테두리 없는 글·각주 = text, 표 = table.
5. 덩어리 안에 작은 덩어리(번호 카드·기관 카드·칩 묶음·큰 숫자 원·'연계' 같은 화살표 표시)가 둘 이상 있으면 겹쳐 낸다:
   바깥 덩어리는 머리 글만 가진 panel 상자(t = 머리 띠 글, d 는 비움, ids = 바깥 판·머리 띠·그 아이콘),
   안쪽 덩어리는 각자 상자(ids = 그 카드의 판·제목·칩·아이콘). 안쪽 상자의 글은 바깥 상자에 다시 쓰지 않는다.
   그래서 원본의 칩 격자·카드 줄·번호 카드가 시안에서도 같은 자리, 같은 모양으로 남는다. 상자는 장마다 25개까지.
6. 상자 자리는 쓰지 않는다 — 엔진이 ids 의 테두리로 잰다.

출력은 JSON 하나: {"boxes": [{"k": "panel", "ids": ["s1", "s2"], "t": "…", "d": "- …\\n- …"}]}"""


def shape_rows(shapes):
    rows = []
    for s in shapes:
        t = s["text"].replace("\n", " / ")
        rows.append(f'{s["id"]} [{s["kind"]}{" " + s["fill"] if s["fill"] else ""}] x{s["x"]} y{s["y"]} w{s["w"]} h{s["h"]}'
                    + (f' {int(s["size"])}pt' if s["size"] else "") + (f' 글: "{t}"' if t else ""))
    return "\n".join(rows)


def wire_of(job, d, call):
    """본문 장 하나의 와이어. call(system, user) → JSON. 실패·검사 탈락이면 한 번 더, 그래도 빠진 글은 '글' 상자로"""
    shapes = d["shapes"]
    by_id = {s["id"]: s for s in shapes}
    if not any(s["text"].strip() for s in shapes):
        return [], []
    user = (f"# 상자 종류\n{kinds_text()}\n\n# 원본 {d['no']}쪽 — 키메시지: {d.get('key') or '(없음)'}\n도형 {len(shapes)}개 (읽는 순서):\n{shape_rows(shapes)}\n\n"
            "위 도형을 덩어리마다 상자로 묶어 JSON 으로.")
    best, notes = None, []
    for attempt in range(2):
        o = call(SYSTEM, user)
        boxes = [b for b in (o or {}).get("boxes") or [] if isinstance(b, dict)]
        wire = []
        for i, b in enumerate(boxes, 1):
            ids = [str(x) for x in (b.get("ids") or []) if str(x) in by_id]
            bb = bounds(ids, by_id)
            if not bb:
                continue
            wire.append(dict(bb, id=f"w{i}", k=str(b.get("k") or "card"), t=str(b.get("t") or "").strip(), d=str(b.get("d") or "").strip(), ids=ids))
        missing, invented, orphan = check(wire, shapes)
        score = len(missing) * 3 + len(invented) + len(orphan) * 2
        if best is None or score < best[0]:
            best = (score, wire, missing, invented, orphan)
        if not score:
            break
        user += ("\n\n# 앞 답의 문제 — 고쳐서 다시 전부 출력\n"
                 + (f"빠진 원본 글: {missing[:20]}\n" if missing else "")
                 + (f"원본에 없는 말(지우거나 원본 낱말로): {invented[:20]}\n" if invented else "")
                 + (f"어느 상자에도 안 든 글 도형: {orphan[:30]}\n" if orphan else ""))
    _, wire, missing, invented, orphan = best
    # 바깥 패널을 먼저 — 와이어 그림은 목록 순서로 그린다(안쪽 카드가 바깥 판 위에). 읽는 순서는 fidelity.reading_order 가 따로 잡는다
    wire.sort(key=lambda b: -(b["w"] * b["h"]))
    for i, b in enumerate(wire, 1):
        b["id"] = f"w{i}"
    for sid in orphan:   # 끝까지 안 묶인 글 — 원본 자리에 글 상자로
        s = by_id[sid]
        wire.append({"id": f"w{len(wire) + 1}", "k": "text", "x": s["x"], "y": s["y"], "w": max(3.0, s["w"]), "h": max(3.0, s["h"]),
                     "t": s["text"].splitlines()[0], "d": "\n".join(s["text"].splitlines()[1:]), "ids": [sid]})
    if orphan:
        notes.append(f"묶이지 않은 글 {len(orphan)}개를 원본 자리에 글 상자로 붙였습니다")
    # 도형 목록은 줄바꿈을 ' / ' 로 보여 준다 — AI 가 그대로 옮기면 시안에 원본에 없는 '/'가 찍혔다('공공의료 / 데이터', 11-03 7차 시험). 띄어쓰기로 되돌린다
    for s in shapes:
        tx = s["text"].strip()
        if "\n" not in tx:
            continue
        joined, spaced = tx.replace("\n", " / "), re.sub(r"\s*\n\s*", " ", tx)
        for b in wire:
            for k in ("t", "d"):
                if joined in b.get(k, ""):
                    b[k] = b[k].replace(joined, spaced)
    missing, invented, _ = check(wire, shapes)
    if missing:
        notes.append(f"원본 글 {len(missing)}줄이 와이어에 없습니다: {' / '.join(missing[:4])}")
    if invented:
        notes.append(f"원본에 없는 말 {len(invented)}곳: {' / '.join(invented[:4])}")
    return wire, notes


def _pos(s):
    return f"x{s['x']:.0f}–{s['x'] + s['w']:.0f}% y{s['y']:.0f}–{s['y'] + s['h']:.0f}%"


def details(wire, shapes):
    """원본 도형에서 읽은 세부 모양 — 시안 모델이 칩·번호 원·큰 숫자 원·화살표 방향·강조 칩을 잃지 않게(11-03 2차 검수: 칩 격자가 글머리로, 번호 원이 빠짐)"""
    by = {s["id"]: s for s in shapes}
    out, used = [], set()
    for b in wire:
        ms = [by[i] for i in b.get("ids") or [] if i in by]
        used |= {m["id"] for m in ms}
        name = (b.get("t") or b.get("d") or "").splitlines()[0][:30] if (b.get("t") or b.get("d")) else b.get("id")
        bits = []
        # 두 줄 칩('공공의료\n데이터')도 칩 — 한 줄만 보던 때는 참여자관리시스템 칩 4개가 글머리로 갔다(11-03 7차 시험)
        chips = [m for m in ms if m["text"] and m["text"].strip().count("\n") <= 1 and m["h"] <= (7 if "\n" not in m["text"].strip() else 11)
                 and m["fill"] and m["kind"] in ("rounded_rectangle", "rectangle", "round_2_same_rectangle", "round_1_rectangle", "snip_1_rectangle")
                 and not re.fullmatch(r"\d{1,2}", m["text"].strip())]
        items = [l for l in str(b.get("d") or "").splitlines() if l.strip()]
        # 칩 3개 이상, 또는 항목이 모두 칩(기관 카드의 칩 1~2개 — 2개짜리를 놓쳐 글머리로 그렸다, 11-03 3차 검수)
        if len(chips) >= 3 or (chips and len(chips) >= len(items) > 0):
            cols = len({round(m["x"]) for m in chips})
            fills = {}
            for m in chips:
                fills[m["fill"]] = fills.get(m["fill"], 0) + 1
            base = max(fills, key=fills.get)
            one = lambda t: re.sub(r"\s*\n\s*", " ", t.strip())
            hi = [one(m["text"]) for m in chips if m["fill"] != base and m["fill"] not in ("FFFFFF",)]
            outline = [one(m["text"]) for m in chips if m["fill"] == "FFFFFF"]
            # 상자에 칩 표시 — 시안 글 목록(design.keep_content)이 항목을 '- 글머리'가 아니라 [칩]으로 넘긴다
            b["chips"] = {"cols": cols, "hi": hi, "outline": outline if len(outline) < len(chips) else []}
            bits.append(f"{len(chips)} items drawn as rounded pill chips in a grid of {cols} column{'s' if cols > 1 else ''} (not a bullet list)"
                        + (f"; highlighted chips in a light accent tint with accent text: {', '.join(hi)}" if hi else "")
                        + (f"; outlined (white) chips: {', '.join(outline)}" if outline and len(outline) < len(chips) else ""))
        # 상자 바탕 — 남색 화면 판(27쪽 대시보드)·분홍 문제 카드·왼쪽 색 막대를 흰 카드로 그렸다(10차 시험)
        big = max([m for m in ms if not m["text"].strip() and m["kind"] not in ("picture", "oval") and _hex(m["fill"])], key=lambda m: m["w"] * m["h"], default=None)
        if big is not None and big["w"] * big["h"] >= 0.5 * b["w"] * b["h"]:
            # 바탕 도형 모양 — 육각형 5개(42쪽 5대 유지관리)가 네모 카드로 바뀌었다(11-03 전체 시험)
            if big["kind"] in ("hexagon", "octagon", "triangle", "isosceles_triangle", "pentagon", "chevron", "diamond", "trapezoid", "parallelogram", "flowchart_decision"):
                bits.append(f"the block itself is drawn as a {big['kind'].replace('_', ' ')} shape — keep that shape, not a rectangle card")
            c = _hex(big["fill"])
            if _lum(c) < 0.3:
                bits.append(f"the whole block is a DARK filled panel #{c} ({cname(c)}) with light text inside — keep it dark, never a white card")
            elif c != "FFFFFF" and cname(c) not in ("white", "gray", "black"):
                bits.append(f"the block background is tinted #{c} ({cname(c)})" + (f" with a #{_hex(big['line'])} border" if _hex(big.get("line")) else ""))
        for m in ms:
            if not m["text"].strip() and _hex(m["fill"]) and m["w"] <= 1.2 and m["h"] >= 0.5 * b["h"]:
                bits.append(f"a thin vertical #{_hex(m['fill'])} ({cname(m['fill'])}) accent bar on its left edge")
                break
        # 막대그래프 — 글 없는 가는 가로 막대(트랙보다 짧은 것)는 색·길이를 그대로(노랑 '주의' 막대가 파랑이 됐다)
        bars = [m for m in ms if not m["text"].strip() and _hex(m["fill"]) and m["h"] <= 3.5 and m["w"] >= 4 and m["w"] >= 2.5 * m["h"]]
        if len(bars) >= 2:
            track = max(m["w"] for m in bars)
            for m in bars:
                if m["w"] < track * 0.97:
                    bits.append(f"a progress bar filled #{_hex(m['fill'])} ({cname(m['fill'])}) to about {round(100 * m['w'] / track)}% of its track at {_pos(m)}")
        for m in ms:
            t = m["text"].strip()
            if m["kind"] == "oval" and not t and m["w"] >= 6 and _hex(m["fill"]):   # 단계마다 큰 색 원(15쪽) — 카드로 바꾸고 그림을 붙였다
                bits.append(f"a big filled circle #{_hex(m['fill'])} ({cname(m['fill'])}) holding the block's icon at {_pos(m)} — keep it a big colored circle")
                continue
            if m["kind"] == "oval" and re.fullmatch(r"\d{1,2}", t):
                bits.append(f"a small filled numbered circle '{t}' before its title")
            elif m["kind"] == "oval" and t and m["w"] >= 8:
                first = t.splitlines()[0]
                bits.append(f"a big filled circle with '{first}' as a large number and the rest as a small caption inside")
            elif m["kind"] == "chevron" and not t:   # 칸 사이 '›' — 패널에 묶이면 빠졌다(11-03 7차 시험)
                bits.append(f"a small chevron arrow pointing right at {_pos(m)} (connector to the next block)")
            elif "arrow" in m["kind"]:
                bits.append({"up_down_arrow": "a vertical two-way arrow (up and down)", "left_right_arrow": "a horizontal two-way arrow (left and right)"}.get(m["kind"], f"an arrow ({m['kind']})")
                            + (f" in #{_hex(m['fill'])} ({cname(m['fill'])})" if _hex(m["fill"]) else "")
                            + (" — a BIG bold arrow, one of the main visual elements, must stay" if m["w"] * m["h"] >= 20 else "")   # 13쪽 가운데 큰 빨강 화살표가 빠졌다(11차 시험)   # 큰 빨강 화살표가 파랑이 됐다(13쪽)
                            + (f" with the label '{t}'" if t else "") + f" at {_pos(m)}")
            if m.get("wcolors") and not (m["kind"] == "oval"):   # 강조어는 원본 색대로(노랑·남색 숫자를 모두 강조색으로 칠했다, 11-03 7차 시험)
                byc = {}
                for w, c in m["wcolors"]:
                    byc.setdefault(c, []).append(w)
                for c, ws in byc.items():
                    bits.append(f"in '{t[:40]}' the words {', '.join(repr(w) for w in ws)} are set in " + (f"#{c} ({cname(c)})" if c else "a different color"))
            elif m["words"] and not (m["kind"] == "oval"):
                bits.append(f"in '{t[:40]}' the words {', '.join(repr(w) for w in m['words'])} are highlighted in the accent color")
        if any(m["kind"] == "picture" for m in ms) and not any("icon" in x for x in bits):
            bits.append("has one small icon at its title")
        if bits:
            out.append(f"- block '{name}': " + "; ".join(dict.fromkeys(bits)))
    # 어느 상자에도 안 든 화살표·쉐브론(덩어리 사이 연결)
    for s in shapes:
        if s["id"] in used or s["text"].strip():
            continue
        if "arrow" in s["kind"] or s["kind"] in ("chevron", "pentagon"):
            what = {"up_down_arrow": "vertical two-way arrow", "left_right_arrow": "horizontal two-way arrow", "chevron": "small chevron arrow pointing right"}.get(s["kind"], s["kind"])
            out.append(f"- connector: a {what} at {_pos(s)} (between the blocks around it)")
    return out


def cname(c):
    """hex → 쉬운 색 이름(시안 모델이 노랑을 강조색 빨강으로 바꾸지 않게)"""
    c = _hex(c)
    if not c:
        return "other color"
    h, s = _hue(c)
    l = _lum(c)
    rgb = [int(c[i:i + 2], 16) for i in (0, 2, 4)]
    if s < 0.15 or max(rgb) - min(rgb) < 8:   # 거의 흰 회색(#F4F5F7)을 '옅은 파랑'으로 불렀다
        return "white" if l > 0.9 else "gray" if l > 0.25 else "black"
    name = ("red" if h < 15 or h >= 330 else "orange" if h < 40 else "yellow" if h < 70 else "green" if h < 160
            else "sky blue" if h < 200 else "blue" if h < 250 else "purple" if h < 290 else "magenta")
    return ("dark navy" if name == "blue" and l < 0.12 else ("light " + name) if l > 0.75 else ("deep " + name) if l < 0.12 else name)


def _hex(c):
    return c.upper() if re.fullmatch(r"[0-9A-Fa-f]{6}", c or "") else ""


def _lum(c):
    r, g, b = (int(c[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _hue(c):
    import colorsys
    r, g, b = (int(c[i:i + 2], 16) / 255 for i in (0, 2, 4))
    h, _, s = colorsys.rgb_to_hls(r, g, b)
    return h * 360, s


def colors(wire, shapes, main=None):
    """원본이 색으로 나눈 역할 — 진한 채움(머리 띠·원·화살표)의 색마다 어디에 썼는지, 다른 색상(hue)은 강조색으로.
    시안이 이것 없이 한 톤으로 칠했다(11-03 사용자 '강조하는 곳과 아닌 곳, 색상으로 구분해야 하는 곳이 나뉘어야 하는데 한 톤으로 밋밋')"""
    blk = {}
    for b in wire:
        nm = (b.get("t") or str(b.get("d") or "").split("\n")[0] or b.get("id") or "")[:30]
        for i in b.get("ids") or []:
            blk.setdefault(i, nm)
    texts = [s for s in shapes if s["text"].strip()]

    def label(s):
        t = s["text"].strip()
        if t:
            return t.splitlines()[0][:30]
        cx0, cy0, cx1, cy1 = s["x"], s["y"], s["x"] + s["w"], s["y"] + s["h"]
        inner = [o for o in texts if o is not s and cx0 <= o["x"] + o["w"] / 2 <= cx1 and cy0 <= o["y"] + o["h"] / 2 <= cy1 and o["w"] * o["h"] <= s["w"] * s["h"]]
        return inner[0]["text"].strip().splitlines()[0][:30] if inner else ""

    strong, seen = {}, set()
    for s in shapes:
        c = _hex(s["fill"])
        if not c or _lum(c) >= 0.55:
            continue
        t, k = s["text"].strip(), s["kind"]
        lb = label(s)
        if k == "oval" and re.fullmatch(r"\d{1,2}", t):
            what = f"numbered circle '{t}'"
        elif k == "oval" and t:
            what = f"big circle '{lb}'"
        elif k == "oval":
            what = f"icon circle of block '{blk.get(s['id'], '')}'"
        elif "arrow" in k:
            what = f"{k.replace('_', ' ')}" + (f" '{t}'" if t else "")
        elif k in ("chevron", "pentagon"):
            what = f"chevron step '{lb}'" if lb else "chevron connectors between the panels"
        elif s["h"] <= 7:
            what = f"header band '{lb}'" if lb else "header band"
        else:
            what = f"filled box '{lb}'" if lb else "filled box"
        if (c, what) in seen:
            continue
        seen.add((c, what))
        strong.setdefault(c, []).append(what)
    if not strong and not any(s.get("wcolors") for s in shapes):
        return []
    # 가장 많이 쓴 진한 색의 색상(hue)에서 40도 넘게 벗어나면 강조색
    # 주색 = 덱 전체에서 가장 많이 쓴 진한 색(main) — 장 하나로 세면 빨강 아이콘이 많은 장(13쪽)에서 빨강이 주색, 남색이 '강조색'으로 뒤집혔다(10차 시험)
    main = (main if main else max(strong, key=lambda c: len(strong[c]))) if strong else ""
    mh = _hue(main)[0] if main else 0
    out = []
    shades = sorted([c for c in strong if _hue(c)[1] >= 0.15 and min(abs(_hue(c)[0] - mh), 360 - abs(_hue(c)[0] - mh)) <= 40], key=_lum)
    names = ["darkest", "dark", "medium", "bright", "lighter", "lightest"]
    for i, c in enumerate(shades):
        nm = names[min(len(names) - 1, round(i * (len(names) - 1) / max(1, len(shades) - 1)))] if len(shades) > 1 else "main"
        w = strong[c]
        out.append(f"- #{c} ({nm} shade of the main color): " + ", ".join(w[:8]) + (f" (+{len(w) - 8} more)" if len(w) > 8 else ""))
    for c in strong:
        if c in shades:
            continue
        role = "GRAY — neutral, de-emphasized" if _hue(c)[1] < 0.15 else "ACCENT — a different hue that marks the emphasis"
        out.append(f"- #{c} ({role}): " + ", ".join(strong[c][:8]))
    # 옅은 채움 칩 — 바탕 칩과 다른 색(강조 칩)·테두리만 있는 칩
    chips = [s for s in shapes if s["text"].strip() and "\n" not in s["text"].strip() and s["h"] <= 7 and _hex(s["fill"]) and _lum(_hex(s["fill"])) >= 0.55
             and s["kind"] in ("rounded_rectangle", "rectangle", "round_2_same_rectangle")]
    if chips:
        cnt = {}
        for s in chips:
            cnt[_hex(s["fill"])] = cnt.get(_hex(s["fill"]), 0) + 1
        base = max(cnt, key=cnt.get)
        bt = {_hex(s["tcolor"]) for s in chips if _hex(s["fill"]) == base and _hex(s["tcolor"])}
        out.append(f"- #{base}: normal chip fill" + (f" with #{sorted(bt)[0]} text" if len(bt) == 1 else ""))
        for c in cnt:
            if c == base:
                continue
            grp = [s for s in chips if _hex(s["fill"]) == c]
            tc = {_hex(s["tcolor"]) for s in grp if _hex(s["tcolor"])}
            ln = {_hex(s["line"]) for s in grp if _hex(s["line"])}
            how = ("outlined chips (white fill" + (f", #{sorted(ln)[0]} border" if ln else ", colored border") + ")") if c == "FFFFFF" else f"highlighted chips (#{c} fill)"
            out.append(f"- {how}" + (f" with #{sorted(tc)[0]} text" if len(tc) == 1 else "") + ": " + ", ".join(f"'{s['text'].strip()[:24]}'" for s in grp[:8]))
    # 글자색 강조 — 결론 띠의 노랑 강조어·카드의 남색 큰 숫자를 시안이 모두 강조색 빨강으로 칠했다(11-03 7차 시험). 색마다 어떤 낱말인지
    words = {}
    for s in shapes:
        if s["kind"] == "oval":
            continue
        for w, c in s.get("wcolors") or []:
            if c:
                words.setdefault(c, [])
                if w not in words[c]:
                    words[c].append(w)
    for c, ws in words.items():
        out.append(f"- words set in #{c} ({cname(c)}) — keep this text color, do not recolor them: " + ", ".join(f"'{w[:24]}'" for w in ws[:10]))
    return out


def main_color(deck):
    """덱 본문 장 전체에서 진한 채움(머리 띠·원·화살표)으로 가장 많이 쓴 색 — 장마다 주색·강조색을 이것 기준으로 가른다"""
    from collections import Counter
    n = Counter(_hex(s["fill"]) for d in deck if d.get("kind") == "body" for s in d.get("shapes") or []
                if _hex(s["fill"]) and _lum(_hex(s["fill"])) < 0.55 and _hue(_hex(s["fill"]))[1] >= 0.15)
    return n.most_common(1)[0][0] if n else None


def empty_blocks(wire, shapes, ratio=0.5):
    """그림을 넣을 빈 카드 — 글이 차지하는 높이(ink)와 안쪽 상자 높이를 더해도 카드 높이의 절반이 안 되는 카드·패널 제목.
    엔진이 고르지 않으면 시안이 거의 모든 카드에 3D 그림을 붙였다(11-03 7차 시험)"""
    by = {s["id"]: s for s in shapes}
    out = []
    for b in wire:
        # 키 작은 카드(13쪽 문제·실행 카드 14%)와 안에 카드를 품은 패널은 빈 칸이 아니다 — 15쪽은 11곳을 빈 칸으로 잡아 단계 원까지 그림 카드가 됐다(10차 시험)
        if b.get("k") not in ("card", "panel") or b["h"] < 18 or b["w"] < 10:
            continue
        if any(o is not b and b["x"] - 0.5 <= o["x"] and o["x"] + o["w"] <= b["x"] + b["w"] + 0.5 and b["y"] - 0.5 <= o["y"] and o["y"] + o["h"] <= b["y"] + b["h"] + 0.5
               for o in wire):
            continue
        ms = [by[i] for i in b.get("ids") or [] if i in by]
        ink = sum(m.get("ink") or 0 for m in ms if m["text"].strip())
        ink += sum(m["h"] for m in ms if m["kind"] == "oval" and not m["text"].strip() and m["w"] >= 6)   # 큰 색 원이 차지한 높이
        if ink < b["h"] * ratio:
            out.append(str(b.get("t") or b.get("d") or b["id"]).splitlines()[0][:30])
    return out


def plan_from(job, path, call, title=""):
    """원본 pptx → 기획(plan). 본문 장만 slides 로, 간지는 chapters·div_lines 로"""
    deck = read_deck(path)
    slides, chapters, div_lines = [], [], {}
    chapter = ""
    # 표지·목차·끝인사는 간지가 아니다 — 목차('제안발표 목차')·'감사합니다.'를 간지 장으로 만들고, 표지·목차 켜짐을 못 읽어
    # 엔진이 기본값으로 표지·목차·엔딩·질의응답을 더 넣었다(11-03 전체 시험). 원본에 없는 질의응답은 넣지 않는다(qna)
    front = {"cover": False, "toc": False, "divider": False, "ending": False, "qna": False}
    keep_txt = {}   # 앞장에 옮길 원본 글 — 표지 사업명·키메시지·꼬리표, 목차 제목, 끝인사 문장(R206)
    deck_main = main_color(deck)
    for i, d in enumerate(deck):
        nm = re.sub(r"\s+", "", str(d.get("name") or ""))
        if d["kind"] == "div" and re.search(r"(?i)목차|contents|차례", nm):
            front["toc"] = True
            keep_txt["toc"] = {"heading": str(d.get("name") or "").strip()}
            job.event(f"원본 {d['no']}쪽 — 목차")
            continue
        if d["kind"] == "div" and re.search(r"(?i)감사합니다|thankyou|q&a|질의응답", nm):
            front["ending"] = True
            front["qna"] = front["qna"] or bool(re.search(r"(?i)q&a|질의응답", nm))
            if not re.search(r"(?i)q&a|질의응답", nm):
                keep_txt["end"] = {"title": str(d.get("name") or "").strip(), "lead": "\n".join(l for l in (d.get("lines") or []) if l.strip())}
            job.event(f"원본 {d['no']}쪽 — 끝인사")
            continue
        if i == 0 and d["kind"] == "other":   # 첫 장이 간지면 간지로 둔다
            front["cover"] = True
            keep_txt["cover"] = _cover_texts(d.get("shapes") or [], d["H"])
            job.event(f"원본 {d['no']}쪽 — 표지")
            continue
        if d["kind"] == "div":
            chapter = d["name"]
            front["divider"] = True
            line = d.get("line") or ""
            chapters.append({"name": chapter, "promise": line, "lead": d.get("lead") or "", "list": d.get("list") or [], "tag": d.get("tag") or "", "src": d["no"]})
            if line:
                div_lines[chapter] = line
            job.event(f"원본 {d['no']}쪽 — 간지 '{chapter}'" + (f" · {line}" if line else ""))
            continue
        if d["kind"] != "body":
            job.event(f"원본 {d['no']}쪽 — 머리 띠·간지 모양이 아니라 건너뜁니다(표지·목차·그림 장일 수 있음)", "warn")
            continue
        wire, notes = wire_of(job, d, call)
        sec = f"{d['head_small']} · {d['head_big']}" if d["head_small"] else d["head_big"]
        title_ = d["key"] or d["head_big"]
        content = "\n".join(f"- {s['text'].replace(chr(10), ' / ')}" for s in d["shapes"] if s["text"].strip())
        s = {"n": len(slides) + 1, "src": d["no"], "keep": True, "section": sec, "chapter": chapter or d["head_small"] or d["head_big"],
             "title": title_, "keyword": ", ".join(d["key_words"]), "message": title_, "content": content,
             "layout": "원본 장표 구성 그대로 — 상자 자리·크기·순서·글은 와이어 그대로, 디자인만 새로", "mood": "",
             "scene": "(none — no scene, no people, no characters; this slide keeps the original slide's blocks)", "image_prompt": "",
             "device": "the original slide's own structure, exactly as the wireframe and the original slide image show", "ref": [], "wire": [{k: v for k, v in b.items() if k != "ids"} for b in wire]}
        if d["head_right"]:
            s["head_right"] = d["head_right"]
        # 원본 머리 띠 두 줄 그대로 — 간지 이름(장)과 섞으면 '운영 및 유지관리 방안 > Ⅰ.시스템 운영 · 1. …'처럼 한 줄에 붙었다(11-03 전체 시험)
        s["head_small"], s["head_big"] = d["head_small"], d["head_big"]
        dt = details(wire, d["shapes"])
        if dt:
            s["keep_detail"] = "\n".join(dt)[:3000]
        s["wire"] = [{k: v for k, v in b.items() if k != "ids"} for b in wire]   # details 가 붙인 칩 표시까지
        emp = empty_blocks(wire, d["shapes"])
        if emp:
            s["keep_empty"] = emp
        cl = colors(wire, d["shapes"], deck_main)
        if cl:
            s["keep_colors"] = "\n".join(cl)[:2000]
        if notes:
            s["keep_note"] = "; ".join(notes)[:400]
        job.event(f"원본 {d['no']}쪽 → {s['n']}장 — 상자 {len(wire)}개" + (f" ({s['keep_note']})" if notes else ""), "warn" if notes else "done")
        slides.append(s)
    if not slides:
        raise RuntimeError("올린 PowerPoint 에서 본문 장(머리 띠 + 내용)을 찾지 못했습니다. '기존 구성 그대로'는 머리 띠가 있는 본문 장을 옮깁니다.")
    out = {"title": title, "keep": True, "keep_front": front, "chapters": chapters, "div_lines": div_lines, "slides": slides}
    if keep_txt:
        out["keep_text"] = keep_txt
    if (keep_txt.get("cover") or {}).get("slogan"):   # 표지 키메시지는 원본 것 — 없을 때만 엔진이 짓는다
        out["slogan"] = keep_txt["cover"]["slogan"]
    acc = accent_of(slides)
    if acc:
        out["keep_accent"] = acc
    return out


def accent_of(slides):
    """원본이 강조색(ACCENT)으로 가장 많이 쓴 색 — 화면에서 강조색을 고르지 않게(11-03 사용자 '추천 강조색이 자동으로'). 없으면 None"""
    from collections import Counter
    n = Counter(h.upper() for s in slides for h in re.findall(r"#([0-9A-Fa-f]{6}) \(ACCENT", str(s.get("keep_colors") or "")))
    return "#" + n.most_common(1)[0][0] if n else None
