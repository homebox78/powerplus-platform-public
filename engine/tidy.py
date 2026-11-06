# -*- coding: utf-8 -*-
"""장표 정리 — 줄·칸·그림을 같은 자리·같은 크기감으로 맞춘다(R208~R213, 11-04 취합본 검수).

  drop_hidden_cuts  도형으로 다시 만든 도식 위에 남은 옛 조각 그림(테두리에 곧게 잘림 + 위 도형이 30% 넘게 덮음) 지우기(R208)
  sibling_pics      같은 크기 카드가 가로·세로로 나란하면 그 안 그림의 크기감(보이는 넓이)·자리를 같게(R209)
  grid_cells        표처럼 놓인 글 칸 — 같은 열은 같은 글자 크기, 칸 좌우 여백은 표 전체 같게(R210)
  chip_icons        머리 칩 안 아이콘 — 칩 높이 70% 넘거나 왼쪽에 붙으면 20% 줄이고 위아래와 같은 왼쪽 여백, 글과 10px(R211)
  badge_rows        카드 제목 줄 옆 숫자 배지 — 제목 줄과 세로 가운데 같게(R212)
  add_guides        안내선 — 본문 좌·우 끝선, 위(머리 아래)·아래(바닥 위) 끝선(R213)

  run(prs) → {이름: 고친 수}   (finalize 가 fitgroup 다음에 부른다)
"""
import io
from statistics import median

PT = 12700


def _pics(sl):
    return [s for s in sl.shapes if s.shape_type == 13 and not (s.name or "").startswith("pd_")]


def _filled(s):
    try:
        return s.shape_type == 1 and s.fill.type in (1, 3)   # 단색·그라데이션
    except Exception:
        return False


def _boxy(s):
    """네모·둥근 네모 도형인가"""
    from pptx.enum.shapes import MSO_SHAPE
    try:
        return s.auto_shape_type in (MSO_SHAPE.RECTANGLE, MSO_SHAPE.ROUNDED_RECTANGLE, MSO_SHAPE.ROUND_2_SAME_RECTANGLE,
                                     MSO_SHAPE.SNIP_1_RECTANGLE, MSO_SHAPE.ROUND_1_RECTANGLE)
    except Exception:
        return False


def _txt(s):
    return getattr(s, "has_text_frame", False) and s.has_text_frame and s.text_frame.text.strip()


def _box(s):
    return s.left, s.top, s.left + s.width, s.top + s.height


def _inside(p, c, tol=2 * PT):
    a, b = _box(p), _box(c)
    return a[0] >= b[0] - tol and a[1] >= b[1] - tol and a[2] <= b[2] + tol and a[3] <= b[3] + tol


_IMG = {}


def _img(s):
    """그림 해독 — 같은 그림은 한 번만(규칙마다 다시 풀면 장표 하나에 수십 분)"""
    from PIL import Image
    try:
        key = s.image.sha1
        if key not in _IMG:
            if len(_IMG) > 400:
                _IMG.clear()
            _IMG[key] = Image.open(io.BytesIO(s.image.blob)).convert("RGBA")
        return _IMG[key].copy()
    except Exception:
        return None


_VIS = {}


def _vis(s):
    """그림에서 실제로 보이는 범위(0~1)"""
    try:
        key = s.image.sha1
    except Exception:
        key = None
    if key in _VIS:
        return _VIS[key]
    _VIS[key] = r = _vis0(s)
    return r


def _vis0(s):
    im = _img(s)
    if im is None:
        return 0, 0, 1, 1
    bb = im.split()[3].point(lambda v: 255 if v > 40 else 0).getbbox() or (0, 0, im.width, im.height)
    return bb[0] / im.width, bb[1] / im.height, bb[2] / im.width, bb[3] / im.height


# ── R208
def drop_hidden_cuts(prs):
    import illus
    n = 0
    for sl in prs.slides:
        order = list(sl.shapes)
        for p in _pics(sl):
            if max(p.width, p.height) < 30 * PT:
                continue
            im = _img(p)
            if im is None:
                continue
            cut, _ = illus.dirty(im)
            if cut < 0.6:
                continue
            i = order.index(p)
            area = p.width * p.height
            cov = 0
            for o in order[i + 1:]:
                if not _filled(o):
                    continue
                a, b = _box(p), _box(o)
                w, h = min(a[2], b[2]) - max(a[0], b[0]), min(a[3], b[3]) - max(a[1], b[1])
                if w > 0 and h > 0:
                    cov = max(cov, w * h / area)
            if cov >= 0.3:
                p._element.getparent().remove(p._element)
                n += 1
    return n


# ── R209
def _card_of(p, cards):
    best = None
    for c in cards:
        if c.width > p.width * 1.3 and c.height > p.height * 1.15 and _inside(p, c):
            if best is None or c.width * c.height < best.width * best.height:
                best = c
    return best


def _text_ext(s):
    """글상자 안 글이 실제로 차지하는 범위 어림(왼·위·오른·아래) — 상자는 넓어도 글은 짧을 수 있다.
    한글 1자 = 글자 크기, 영문·숫자 0.55, 빈칸 0.3. 상자 안 폭을 넘으면 줄바꿈"""
    tf = s.text_frame
    ml, mr = tf.margin_left or 0, tf.margin_right or 0
    mt, mb = tf.margin_top or 0, tf.margin_bottom or 0
    ind = 0
    for p in tf.paragraphs:   # 글머리 들여쓰기(marL) — 빼면 글 끝을 짧게 잰다(38쪽 그림이 '(Tier 1~3)' 에 닿음)
        pp = p._p.pPr
        if pp is not None and pp.get("marL"):
            ind = max(ind, int(pp.get("marL")))
    ml += ind
    inner = max(1, s.width - ml - mr)
    wmax, h = 0, 0
    for p in tf.paragraphs:
        sz = max([r.font.size for r in p.runs if r.font.size] or [12 * PT])
        t = p.text
        w = sum(sz * (1.0 if ord(ch) > 0x2E80 else 0.3 if ch == " " else 0.6) for ch in t)
        lines = max(1, -(-int(w) // int(inner))) if t.strip() else 1
        wmax = max(wmax, min(w, inner))
        h += lines * sz * 1.25
    al = tf.paragraphs[0].alignment if tf.paragraphs else None
    if al == 2:      # 가운데 정렬
        l = s.left + ml + (inner - wmax) / 2
    elif al == 3:    # 오른쪽
        l = s.left + s.width - mr - wmax
    else:
        l = s.left + ml
    va = tf.vertical_anchor
    if va == 3 or (va is None and s.shape_type == 1):    # 가운데(도형 기본값)
        t = s.top + (s.height - h) / 2
    elif va == 4:
        t = s.top + s.height - mb - h
    else:
        t = s.top + mt
    return l, t, l + wmax, t + h


def _card_parts(c, sl, skip):
    """카드 c 안 → (머리 띠·칩 상자들, 본문 글이 차지하는 범위들)"""
    heads, texts = [], []
    for s in sl.shapes:
        if s is c or s.shape_id in skip or s.shape_type == 13 or not _inside(s, c):
            continue
        if _filled(s) and s.height < 0.4 * c.height:
            heads.append((s.left, s.top, s.left + s.width, s.top + s.height))
        elif _txt(s):
            texts.append(_text_ext(s))
    return heads, texts


def _below(c, x0, x1, boxes):
    """가로 x0~x1 을 가리는 상자들의 가장 아래 끝"""
    return max([c.top] + [b[3] for b in boxes if b[0] < x1 and b[2] > x0])


def sibling_pics(prs, min_pt=30):
    n = 0
    for sl in prs.slides:
        fills = [s for s in sl.shapes if _filled(s)]
        # 다른 카드를 품은 패널은 카드가 아니다 — 카드보다 조금 큰 그림을 패널 그림으로 보고 패널 구석으로 옮겼다(13쪽)
        # 패널 = 안에 높이 40% 넘는 카드가 든 것(머리 띠·칩만 든 보통 카드는 카드 — 처음 판은 6·9·28·30·34·37쪽 카드를 빼 버렸다)
        cards = [c for c in fills if not any(d is not c and d.height >= 0.4 * c.height and d.width >= 0.2 * c.width and _inside(d, c, 0) for d in fills)]
        own = {}
        for p in _pics(sl):
            if max(p.width, p.height) < min_pt * PT:
                continue
            c = _card_of(p, cards)
            if c is not None:
                own.setdefault(c.shape_id, (c, []))[1].append(p)
        items = []
        for c, ps in own.values():   # 카드마다 일러스트 하나 — 머리 아이콘이 함께 있으면 넓이 1.6배 넘는 가장 큰 그림(21·23·34·40쪽)
            ps = sorted(ps, key=lambda q: q.width * q.height, reverse=True)
            if len(ps) == 1 or ps[0].width * ps[0].height >= 1.6 * ps[1].width * ps[1].height:
                items.append((c, ps[0]))
        # 같은 크기 카드끼리 줄·열로 이어진 것을 한 묶음(격자 대각선 칸도 — 23쪽 2×3 카드 그림이 따로 놀았다)
        par = list(range(len(items)))

        def root(i):
            while par[i] != i:
                par[i] = par[par[i]]
                i = par[i]
            return i
        for i, (c, p) in enumerate(items):
            for j in range(i + 1, len(items)):
                d, q = items[j]
                same = abs(d.width - c.width) <= 0.12 * c.width and abs(d.height - c.height) <= 0.08 * c.height
                # 같은 쪽 그림끼리만 — 왼쪽 아이콘과 오른쪽 일러스트를 한 묶음으로 맞추면 서로 자리를 바꾼다(13쪽 정기 협업회의)
                side = lambda cc, pp: (pp.left + pp.width / 2 - cc.left) / cc.width > 0.35
                if same and side(c, p) == side(d, q) and (abs(d.top - c.top) <= 4 * PT or abs(d.left - c.left) <= 4 * PT):
                    par[root(j)] = root(i)
        comp = {}
        for i in range(len(items)):
            comp.setdefault(root(i), []).append(items[i])
        groups = [g for g in comp.values() if len(g) >= 2]
        for g in groups:
            vis = [_vis(p) for _, p in g]
            # 보이는 넓이의 제곱근 = 크기감. 가장 작은 것에 맞춘다(11-04 '크기가 모두 작게') — 단 가운데값의 75% 아래로는 안 줄인다
            mass = [((v[2] - v[0]) * p.width * (v[3] - v[1]) * p.height) ** 0.5 for (c, p), v in zip(g, vis)]
            m = max(min(mass), 0.75 * median(mass))
            # 카드 안 자리 — 위에서의 거리(보이는 가운데)와 좌·우 끝에서의 거리를 모두 같게
            cy = median(p.top + p.height * (v[1] + v[3]) / 2 - c.top for (c, p), v in zip(g, vis))
            # 크기 상한(11-04 사용자) — 카드 짧은 변의 45%(25쪽 69%→'20% 줄이고', 28쪽 '15% 줄이고', 9쪽 46% 는 좋음),
            # 카드 위 30% 안 제목 옆 아이콘은 30%(23쪽 36% → '조금 더 줄이고')
            short = min(min(c.width, c.height) for c, _ in g)
            top_icon = cy < 0.3 * median(c.height for c, _ in g)
            # 그림이 카드 왼쪽 35% 안이면(표 첫 열 아이콘 등 — 오른쪽엔 글) 왼쪽 여백·세로 자리를 같게(크기 상한 없음 — 13쪽 원 아이콘을 줄였다).
            # 아니면 일러스트는 카드 오른쪽 아래 구석에(28쪽 '하단 우측에'), 제목 옆 아이콘은 오른쪽 위에 — 같은 여백
            right = median(((p.left + p.width * (v[0] + v[2]) / 2) - c.left) / c.width for (c, p), v in zip(g, vis)) > 0.35
            if right:
                # 상한은 카드 크기로만(두 번 돌려도 같게): 짧은 변 55%(25쪽 69% → 20% 작게) 또는 납작한 카드면 폭의 20%(40·51쪽이 너무 작아짐)
                wide = min(c.width for c, _ in g)
                m = min(m, 0.30 * short if top_icon else max(0.55 * short, 0.2 * wide))
            pad = max(8 * PT, 0.05 * short)
            lx = median((p.left + p.width * (v[0] + v[2]) / 2) - c.left for (c, p), v in zip(g, vis))
            # 오른쪽 일러스트의 세로 자리(R229, 11-04 '카드 안 일러스트 세로 중심 정렬') — 그림 자리 위를 가리는 머리 띠·글의
            # 아래 끝부터 카드 아래까지 남은 칸의 가운데. 글 옆이면 머리 아래 본문 가운데, 글 아래면 남은 칸 가운데.
            # 묶음 안에서는 가장 낮은 끝에 맞춰 모두 같은 높이. 남은 칸에 안 들어가면 예전처럼 오른쪽 아래 구석
            mid = None
            if right and not top_icon:
                skip = {p.shape_id for _, p in g}
                gap = 6 * PT
                parts = [_card_parts(c, sl, skip) for c, _ in g]
                # 글 옆에 두면 글 끝과 6pt 넘게 떨어지도록 — 모자라면 묶음 전체를 같은 비율로 줄인다(0.8배까지)
                f = 1.0
                for ((c, p), v, ms), (hd, tx) in zip(zip(g, vis, mass), parts):
                    k = m / ms if ms else 1
                    vw = p.width * k * (v[2] - v[0])
                    hb = _below(c, c.left + c.width - pad - vw, c.left + c.width, hd)
                    body = [b for b in tx if b[3] > hb + 2 * PT]
                    tr = max([b[2] for b in body] or [c.left])
                    f = min(f, (c.left + c.width - pad - tr - gap) / vw if vw else 1)
                beside = f >= 0.8     # 20% 넘게 줄여야 들어가면 글 옆이 아니다(21·30·33쪽 그림이 너무 작아졌다) — 예전처럼 아래 구석
                if beside and f < 1:
                    m *= f
                rel, room = 0, 0
                for ((c, p), v, ms), (hd, tx) in zip(zip(g, vis, mass), parts):
                    k = m / ms if ms else 1
                    vw, vh = p.width * k * (v[2] - v[0]), p.height * k * (v[3] - v[1])
                    x0 = c.left + c.width - pad - vw
                    rel = max(rel, _below(c, x0, c.left + c.width, hd if beside else hd + tx) - c.top)
                    room = max(room, vh)
                hmin = min(c.height for c, _ in g)
                if hmin - rel - room >= 2 * 4 * PT:
                    mid = (rel + hmin) / 2
            for ((c, p), v, ms) in zip(g, vis, mass):
                k = m / ms if ms else 1
                w2, h2 = p.width * k, p.height * k
                vw, vh = w2 * (v[2] - v[0]), h2 * (v[3] - v[1])
                if right:
                    nvx = c.left + c.width - pad - vw / 2
                    nvy = c.top + cy if top_icon else (c.top + mid if mid is not None else c.top + c.height - pad - vh / 2)
                else:
                    nvx, nvy = c.left + lx, c.top + cy
                nl = nvx - w2 * (v[0] + v[2]) / 2
                nt = nvy - h2 * (v[1] + v[3]) / 2
                if abs(k - 1) > 0.03 or abs(nl - p.left) > 1.5 * PT or abs(nt - p.top) > 1.5 * PT:   # 1.5pt 안 흔들림은 그대로(두 번 돌려도 같게)
                    p.left, p.top, p.width, p.height = int(nl), int(nt), int(w2), int(h2)
                    n += 1
    return n


# ── R210
def grid_cells(prs):
    n = 0
    for sl in prs.slides:
        cells = [s for s in sl.shapes if s.shape_type == 1 and _txt(s) and len([p for p in s.text_frame.paragraphs if p.text.strip()]) == 1]
        cols = {}
        for s in cells:
            k = next((k for k in cols if abs(k[0] - s.left) <= PT and abs(k[1] - s.width) <= PT), None)
            cols.setdefault(k or (s.left, s.width), []).append(s)
        grid = [v for v in cols.values() if len(v) >= 3 and len({round(s.top / PT / 3) for s in v}) >= 3]
        if not grid:
            continue
        body = [c for v in grid for c in v if (c.text_frame.margin_left or 0) <= 20 * PT and c.text_frame.paragraphs[0].alignment in (None, 1)]
        if not body:
            continue
        ml = max(7.2 * PT, median(c.text_frame.margin_left or 0 for c in body))
        for v in grid:
            vb = [c for c in v if c in body]
            if len(vb) < 3:
                continue
            sizes = [r.font.size for c in vb for p in c.text_frame.paragraphs for r in p.runs if r.font.size]
            if not sizes:
                continue
            sz = min(sizes)
            for c in vb:
                tf = c.text_frame
                ch = False
                for p in tf.paragraphs:
                    for r in p.runs:
                        if r.font.size and r.font.size != sz:
                            r.font.size = sz
                            ch = True
                if abs((tf.margin_left or 0) - ml) > PT / 4 or abs((tf.margin_right or 0) - ml) > PT / 4:
                    tf.margin_left = tf.margin_right = int(ml)
                    ch = True
                n += ch
    return n


# ── R211
def chip_icons(prs, gap_px=10):
    gap = gap_px * 0.75 * PT
    n = 0
    for sl in prs.slides:
        chips = [s for s in sl.shapes if _filled(s) and _txt(s) and s.height <= 34 * PT and s.width >= 2.5 * s.height]
        for c in chips:
            icons = [p for p in _pics(sl) if _inside(p, c, PT) and p.left + p.width / 2 < c.left + c.width * 0.3 and max(p.width, p.height) >= 0.4 * c.height]
            if len(icons) != 1:
                continue
            p = icons[0]
            # 칩 아이콘은 모두 같은 크기 — 긴 변 = 칩 높이 58%(11-04: 68% 에서 '15% 작게'), 왼쪽 여백 = 위아래 여백, 글과 10px.
            # 이미 맞춘 칩은 그대로(두 번 돌려도 같은 결과)
            if any(s.name == p.name + "_bg" for s in sl.shapes):   # 바탕 칸이 딸린 아이콘은 칸이 크기를 정한다 — 키우면 칸이 칩 밖으로(33쪽 기대효과 띠)
                continue
            k = 0.58 * c.height / max(p.width, p.height)
            pad0 = (c.height - p.height * k) / 2
            if abs(k - 1) <= 0.02 and abs((p.left - c.left) - pad0) <= PT / 2:
                continue
            bgs = [s for s in sl.shapes if s.name == p.name + "_bg"]
            w2, h2 = p.width * k, p.height * k
            pad = (c.height - h2) / 2
            nl, nt = c.left + pad, c.top + pad
            for b in bgs:   # 아이콘 바탕 도형(split_tiles)도 같이
                b.left = int(nl + (b.left - p.left) * k); b.top = int(nt + (b.top - p.top) * k)
                b.width, b.height = int(b.width * k), int(b.height * k)
            p.left, p.top, p.width, p.height = int(nl), int(nt), int(w2), int(h2)
            c.text_frame.margin_left = int(pad + w2 + gap)
            n += 1
    return n


# ── R212
def badge_rows(prs):
    n = 0
    for sl in prs.slides:
        shs = list(sl.shapes)
        badges = [s for s in shs if _filled(s) and _txt(s) and s.height <= 26 * PT and len(s.text_frame.text.strip()) <= 8]
        for b in badges:
            heads = [h for h in shs if h is not b and _txt(h) and not _filled(h) and h.height <= 36 * PT
                     and h.top < b.top + b.height and h.top + h.height > b.top and h.left + h.width <= b.left + 2 * PT
                     and b.left - (h.left + h.width) < 160 * PT
                     and max((r.font.size or 0) for p in h.text_frame.paragraphs for r in p.runs) >= (max((r.font.size or 0) for p in b.text_frame.paragraphs for r in p.runs) or 0)]
            # 같은 카드 안 제목만 — 카드 머리 띠(예상 문제점 등)는 카드 밖에 걸쳐 있어 빠진다
            cards = [c for c in shs if _filled(c) and c is not b and c.height > 2 * b.height and _inside(b, c, 0)]
            heads = [h for h in heads if any(_inside(h, c, 0) for c in cards)]
            if not heads:
                continue
            h = min(heads, key=lambda x: b.left - (x.left + x.width))
            cy = h.top + h.height / 2
            dy = int(cy - (b.top + b.height / 2))
            if abs(dy) < PT:
                continue
            inner = [p for p in shs if p is not b and p.shape_type == 13 and _inside(p, b, PT)]
            for s in [b] + inner:
                s.top = s.top + dy
            n += 1
    return n


# ── R214
def card_bottoms(prs, near_pt=14):
    """좌우로 나란한 카드 아래 끝이 몇 pt 어긋나면 짧은 쪽을 늘려 같게 — 늘린 자리에 다른 것이 있으면 그만둔다"""
    n = 0
    for sl in prs.slides:
        shs = list(sl.shapes)
        cards = [s for s in shs if _filled(s) and s.height >= 30 * PT and s.width >= 60 * PT and _boxy(s)]   # 원·화살표는 카드가 아니다(5쪽 원을 늘렸다)
        for a in cards:
            for b in cards:
                if a is b or b.left < a.left + a.width - PT:   # b 는 a 오른쪽(겹치지 않음)
                    continue
                if b.left - (a.left + a.width) > 40 * PT:
                    continue
                if not (a.top < b.top + b.height and b.top < a.top + a.height):
                    continue
                ab, bb = a.top + a.height, b.top + b.height
                d = bb - ab
                if PT <= abs(d) <= near_pt * PT:
                    s, t = (a, bb) if d > 0 else (b, ab)
                    sb = s.top + s.height
                    # 늘릴 띠(sb~t)에 카드 밖 다른 도형이 걸리면 그만
                    hit = any(o is not s and not _inside(o, s, 0) and o.top < t and o.top + o.height > sb
                              and o.left < s.left + s.width and o.left + o.width > s.left and not _inside(s, o, 0) for o in shs)
                    if hit:
                        continue
                    s.height = int(t - s.top)
                    n += 1
    return n


# ── R215
def dangling_leads(prs):
    """끝에 아무것도 없는 이끔선(선 + 양 끝 점) 지우기 — 원본에 설명 글이 하나뿐인데 선을 칸마다 그린 경우(14쪽 피라미드)"""
    n = 0
    for sl in prs.slides:
        shs = list(sl.shapes)
        lines = [s for s in shs if s.shape_type == 9 and s.height <= PT and s.width >= 10 * PT]
        txts = [s for s in shs if _txt(s) or s.shape_type == 13]
        dots = [s for s in shs if s.shape_type == 1 and s.width <= 6 * PT and s.height <= 6 * PT]
        for ln in lines:
            x1, y = ln.left + ln.width, ln.top
            near = [t for t in txts if t.left - 14 * PT <= x1 <= t.left + 4 * PT and t.top - 8 * PT <= y <= t.top + t.height + 8 * PT]
            if near:
                continue
            ends = [d for d in dots if abs(d.top + d.height / 2 - y) <= 3 * PT and (abs(d.left + d.width / 2 - ln.left) <= 4 * PT or abs(d.left + d.width / 2 - x1) <= 4 * PT)]
            # 양 끝에 점이 달린 이끔선만 — 밑줄·구분선·표 줄은 점이 없다(처음 판은 21·26·27·44·48쪽 줄까지 지움)
            if not (any(abs(d.left + d.width / 2 - ln.left) <= 4 * PT for d in ends) and any(abs(d.left + d.width / 2 - x1) <= 4 * PT for d in ends)):
                continue
            for s in [ln] + ends:
                s._element.getparent().remove(s._element)
            n += 1
    return n


# ── R216
def round_ovals(prs, tol=0.25):
    """원이 세로·가로로 늘어난 타원(가로/세로 0.75~1.25, 2% 넘게 어긋남) → 가운데 그대로 긴 변 지름의 원.
    시안 그림에서 잰 자리를 장표 비율로 옮기며 가로·세로가 따로 늘었다(11-04 18쪽 BBP 원 0.89)"""
    from pptx.enum.shapes import MSO_SHAPE
    kinds = (MSO_SHAPE.OVAL, MSO_SHAPE.DONUT, MSO_SHAPE.BLOCK_ARC, MSO_SHAPE.ARC, MSO_SHAPE.CHORD, MSO_SHAPE.PIE)
    n = 0
    for sl in prs.slides:
        for s in sl.shapes:
            if s.shape_type != 1 or not s.height:
                continue
            try:
                if s.auto_shape_type not in kinds:
                    continue
            except Exception:
                continue
            r = s.width / s.height
            if 0.02 < abs(1 - r) <= tol:
                d = max(s.width, s.height)
                cx, cy = s.left + s.width / 2, s.top + s.height / 2
                s.left, s.top, s.width, s.height = int(cx - d / 2), int(cy - d / 2), int(d), int(d)
                n += 1
    return n


# ── R217
def panel_tint(prs, fill="F5F9FF", line_pt=1.25):
    """흰 카드에 큰 패널과 작은 카드가 함께 있고 바탕·테두리가 같으면 큰 패널만 아주 연한 파랑 바탕 + 조금 두꺼운 테두리(11-04 18쪽).
    큰 패널 = 같은 장 다른 흰 테두리 카드 넓이 가운데값의 2.5배 이상"""
    from pptx.dml.color import RGBColor
    n = 0
    for sl in prs.slides:
        whites = []
        for s in sl.shapes:
            try:
                if s.shape_type == 1 and s.fill.type == 1 and str(s.fill.fore_color.rgb) == "FFFFFF" and s.line.fill.type == 1:
                    whites.append(s)
            except Exception:
                continue
        if len(whites) < 3:
            continue
        areas = sorted(s.width * s.height for s in whites)
        small = median(areas)
        big = [s for s in whites if s.width * s.height >= 2.5 * small]
        if not big or len(big) == len(whites):
            continue
        for s in big:
            s.fill.solid()
            s.fill.fore_color.rgb = RGBColor.from_string(fill)
            s.line.width = int(line_pt * PT)
            n += 1
    return n


# ── R218
def arrow_style(prs, color="1D4ED8", tail=15, head=50, max_pt=60):
    """파란 한 방향 블록 화살표 → 조금 짙은 파랑, 꼬리는 연하게(투명도 tail%)·머리 쪽 head% 그라데이션(11-04 사용자).
    빨강 등 강조 화살표·큰 화살표(흐름 띠)는 그대로"""
    from lxml import etree
    from pptx.enum.shapes import MSO_SHAPE
    A = "http://schemas.openxmlformats.org/drawingml/2006/main"
    ang = {MSO_SHAPE.RIGHT_ARROW: 0, MSO_SHAPE.DOWN_ARROW: 5400000, MSO_SHAPE.LEFT_ARROW: 10800000, MSO_SHAPE.UP_ARROW: 16200000}
    n = 0
    for sl in prs.slides:
        for s in sl.shapes:
            if s.shape_type != 1 or max(s.width, s.height) > max_pt * PT:
                continue
            try:
                k = s.auto_shape_type
                if k not in ang or s.fill.type != 1:
                    continue
                r, g, b = s.fill.fore_color.rgb
            except Exception:
                continue
            if not (b > 150 and b > r + 60):   # 파랑만
                continue
            spPr = s._element.spPr
            for t in ("solidFill", "gradFill", "noFill", "pattFill", "blipFill"):
                for e in spPr.findall(f"{{{A}}}{t}"):
                    spPr.remove(e)
            gf = etree.Element(f"{{{A}}}gradFill", rotWithShape="1")
            gl = etree.SubElement(gf, f"{{{A}}}gsLst")
            for pos, al in ((0, tail), (100000, head)):
                gs = etree.SubElement(gl, f"{{{A}}}gs", pos=str(pos))
                c = etree.SubElement(gs, f"{{{A}}}srgbClr", val=color)
                etree.SubElement(c, f"{{{A}}}alpha", val=str(al * 1000))
            etree.SubElement(gf, f"{{{A}}}lin", ang=str(ang[k]), scaled="0")
            geom = spPr.find(f"{{{A}}}prstGeom")
            (geom if geom is not None else spPr[0]).addnext(gf)
            s.line.fill.background()
            n += 1
    return n


# ── R219
def row_text_sizes(prs):
    """같은 줄·같은 높이·비슷한 폭 글 칸(3개 넘게)이 한 가지 크기 글이면 가장 작은 크기로 통일(35·38·39쪽 0.5~1pt 차이)"""
    n = 0
    for sl in prs.slides:
        tx = [s for s in sl.shapes if _txt(s) and s.shape_type in (1, 17)]
        used = set()
        for s in tx:
            if s.shape_id in used:
                continue
            g = [t for t in tx if t.shape_id not in used and abs(t.top - s.top) <= 3 * PT and abs(t.height - s.height) <= 3 * PT
                 and abs(t.width - s.width) <= 0.08 * s.width]   # 한 칸은 한 묶음에만(두 묶음에 걸치면 돌릴 때마다 바뀜)
            if len(g) < 3:
                continue
            used.update(t.shape_id for t in g)
            one = []
            for t in g:
                sz = {r.font.size for p in t.text_frame.paragraphs for r in p.runs if r.font.size}
                if len(sz) != 1:
                    one = None
                    break
                one.append(sz.pop())
            if not one or len(set(one)) == 1:
                continue
            m = min(one)
            for t in g:
                for p in t.text_frame.paragraphs:
                    for r in p.runs:
                        if r.font.size and r.font.size != m:
                            r.font.size = m
                n += 1
    return n


# ── R220
def glyph_rims(prs, max_pt=70):
    """아이콘 그림 둘레에 남은 사각·원 테두리 조각(38쪽 목록 아이콘 왼쪽 '(', 51쪽 DB 아이콘 둘레 원) 지우기 —
    테두리에 닿고 그림 한 변의 70% 넘게 길며 속이 빈(채움 25% 미만) 덩어리, 다른 덩어리가 있을 때만"""
    from PIL import Image
    n, done = 0, {}
    for sl in prs.slides:
        for sh in _pics(sl):
            if max(sh.width, sh.height) > max_pt * PT:
                continue
            part = sh.image
            key = part.sha1
            if key in done:
                bb = done[key]
            else:
                im = _img(sh)
                if im is None:
                    continue
                w, h = im.size
                import illus
                cs = illus._blobs(im, 60)
                if len(cs) < 2:
                    done[key] = None
                    continue
                rims = []
                for c in cs:
                    xs = [q[0] for q in c]; ys = [q[1] for q in c]
                    bw, bh = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
                    # 괄호·막대 — 나란한 가장자리에 붙은 것만(세로 막대는 왼·오른 끝, 가로 막대는 위·아래 끝. 목록 아이콘의 가로 줄은 오른 끝에만 닿는다)
                    bar = (bw <= 0.15 * w and bh >= 0.7 * h and (min(xs) <= 1 or max(xs) >= w - 2)) or \
                          (bh <= 0.15 * h and bw >= 0.7 * w and (min(ys) <= 1 or max(ys) >= h - 2))
                    ring = False
                    if bw >= 0.85 * w and bh >= 0.85 * h:   # 고리 — 픽셀 90% 넘게가 바깥 15% 띠에
                        x0_, y0_ = min(xs), min(ys)
                        mx, my = 0.15 * bw, 0.15 * bh
                        rim_px = sum(1 for x, y in c if x - x0_ < mx or x0_ + bw - x <= mx or y - y0_ < my or y0_ + bh - y <= my)
                        # 닫힌 고리만 — 네 변 띠에 모두 픽셀(헤드셋 머리띠처럼 위·옆만 있는 호는 그림 일부, 9쪽에서 지웠다)
                        sides = [sum(1 for x, y in c if y - y0_ < my), sum(1 for x, y in c if y0_ + bh - y <= my),
                                 sum(1 for x, y in c if x - x0_ < mx), sum(1 for x, y in c if x0_ + bw - x <= mx)]
                        # 가는 고리만 — 두께(픽셀 수 / 둘레) 가 지름 4.5% 이하. 시계 아이콘 테두리(8~12%)는 그림이다
                        thick = len(c) / (3.1416 * (bw + bh) / 2)
                        ring = rim_px >= 0.9 * len(c) and min(sides) >= 0.1 * len(c) and thick <= 0.045 * (bw + bh) / 2
                    if bar or ring:
                        rims.append(c)
                if not rims or len(rims) == len(cs):
                    done[key] = None
                    continue
                from PIL import ImageFilter
                m = Image.new("L", im.size, 0)
                mp = m.load()
                for c in rims:
                    for x, y in c:
                        mp[x, y] = 255
                m = m.filter(ImageFilter.MaxFilter(5))   # 가장자리 반투명까지
                im.putalpha(Image.composite(Image.new("L", im.size, 0), im.split()[3], m))
                b0 = im.split()[3].point(lambda v: 255 if v > 24 else 0).getbbox() or (0, 0, w, h)
                bb = (b0[0] / w, b0[1] / h, b0[2] / w, b0[3] / h)
                buf = io.BytesIO()
                im.crop(b0).save(buf, "PNG")
                blip = sh._element.find(".//{http://schemas.openxmlformats.org/drawingml/2006/main}blip")
                sl.part.related_part(blip.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed"))._blob = buf.getvalue()
                done[key] = bb
            if not bb:
                continue
            x0, y0, x1, y1 = bb
            sh.left, sh.top = int(sh.left + sh.width * x0), int(sh.top + sh.height * y0)
            sh.width, sh.height = int(sh.width * (x1 - x0)), int(sh.height * (y1 - y0))
            n += 1
    return n


# ── R221
def equal_cards(prs, tol=0.04):
    """줄·열로 이어진 거의 같은 크기 카드(가로·세로 4% 안 차이)는 가로는 가운데값·세로는 가장 큰 값으로(23쪽 97.4·96.8·97.9pt).
    위·왼쪽은 그대로, 오른쪽·아래 끝만 움직인다"""
    n = 0
    for sl in prs.slides:
        cs = [s for s in sl.shapes if _filled(s) and _boxy(s) and s.height >= 30 * PT and s.width >= 60 * PT]
        par = list(range(len(cs)))

        def root(i):
            while par[i] != i:
                par[i] = par[par[i]]
                i = par[i]
            return i
        for i, a in enumerate(cs):
            for j in range(i + 1, len(cs)):
                b = cs[j]
                if abs(a.width - b.width) <= tol * a.width and abs(a.height - b.height) <= tol * a.height \
                        and (abs(a.top - b.top) <= 4 * PT or abs(a.left - b.left) <= 4 * PT) and not (_inside(a, b, 0) or _inside(b, a, 0)):
                    par[root(j)] = root(i)
        comp = {}
        for i, c in enumerate(cs):
            comp.setdefault(root(i), []).append(c)
        for g in comp.values():
            if len(g) < 2:
                continue
            w, h = int(median(c.width for c in g)), int(max(c.height for c in g))   # 높이는 가장 큰 것 — 늘리기만(끝선 맞추기와 같은 방향)
            for c in g:
                if abs(c.width - w) > PT / 2 or abs(c.height - h) > PT / 2:
                    c.width, c.height = w, h
                    n += 1
    return n


# ── R222
def corner_tiles(prs):
    """카드 왼쪽 위 아이콘 칸이 카드 위 끝에 붙어 있으면(위 여백 < 왼쪽 여백의 60%) 위 여백 = 왼쪽 여백으로 내리고,
    옆 제목을 그 가운데에 맞춘다 — 제목 아래 글도 같이 내리되 카드를 넘으면 그만(23쪽 현장 상주·본사 전사 지원·비상 지원 Pool)"""
    n = 0
    for sl in prs.slides:
        shs = list(sl.shapes)
        cards = [s for s in shs if _filled(s) and _boxy(s) and s.height >= 60 * PT]
        for c in cards:
            tiles = [t for t in shs if t is not c and (t.shape_type == 13 or _filled(t)) and 18 * PT <= t.width <= 50 * PT
                     and 0.8 <= t.width / max(1, t.height) <= 1.25 and _inside(t, c, PT)
                     and 2 * PT <= t.left - c.left <= 20 * PT and t.top - c.top < 0.6 * (t.left - c.left)]
            if not tiles:
                continue
            t = max(tiles, key=lambda x: x.width * x.height)
            dy = (t.left - c.left) - (t.top - c.top)
            heads = [h for h in shs if _txt(h) and not _filled(h) and t.left + t.width <= h.left <= t.left + t.width + 30 * PT
                     and h.top < t.top + t.height and h.top + h.height > t.top]
            moved = [x for x in shs if x is not c and x.top >= t.top - PT and _inside(x, t, PT)]   # 칸 + 칸 안 그림
            tcy = t.top + dy + t.height / 2
            extra = []
            if heads:
                h = heads[0]
                hd = int(tcy - (h.top + h.height / 2))
                below = [x for x in shs if _txt(x) and x is not h and _inside(x, c, PT) and x.top >= h.top + h.height - 2 * PT
                         and x.left >= t.left + t.width - 5 * PT]
                if any(x.top + x.height + hd > c.top + c.height - 2 * PT for x in below):
                    continue   # 내리면 카드를 넘는다 — 그만
                extra = [(h, hd)] + [(x, hd) for x in below]
            for x in moved:
                x.top = int(x.top + dy)
            for x, d in extra:
                x.top = int(x.top + d)
            n += 1
    return n


# ── R223
def table_center(prs, pad_pt=7.2):
    """표 칸 중 가운데 정렬 글은 좌우 여백을 같게 — 머리 칸과 아래 칸의 가운데가 어긋났다(25쪽 아래 칸 왼 18pt·오른 5.8pt)"""
    from pptx.enum.text import PP_ALIGN
    n = 0
    for sl in prs.slides:
        for s in sl.shapes:
            if not getattr(s, "has_table", False) or not s.has_table:
                continue
            for row in s.table.rows:
                for c in row.cells:
                    ps = [p for p in c.text_frame.paragraphs if p.text.strip()]
                    if not ps or any(p.alignment != PP_ALIGN.CENTER for p in ps):
                        continue
                    if abs((c.margin_left or 0) - pad_pt * PT) > PT / 4 or abs((c.margin_right or 0) - pad_pt * PT) > PT / 4:
                        c.margin_left = c.margin_right = int(pad_pt * PT)
                        n += 1
    return n


def _grad_arrow(s, ang, color="1D4ED8", tail=15, head=50):
    """도형 채움을 꼬리 연하게 → 머리 head% 그라데이션으로"""
    from lxml import etree
    A = "http://schemas.openxmlformats.org/drawingml/2006/main"
    spPr = s._element.spPr
    for t in ("solidFill", "gradFill", "noFill", "pattFill", "blipFill"):
        for e in spPr.findall(f"{{{A}}}{t}"):
            spPr.remove(e)
    gf = etree.Element(f"{{{A}}}gradFill", rotWithShape="1")
    gl = etree.SubElement(gf, f"{{{A}}}gsLst")
    for pos, al in ((0, tail), (100000, head)):
        gs = etree.SubElement(gl, f"{{{A}}}gs", pos=str(pos))
        c = etree.SubElement(gs, f"{{{A}}}srgbClr", val=color)
        etree.SubElement(c, f"{{{A}}}alpha", val=str(al * 1000))
    etree.SubElement(gf, f"{{{A}}}lin", ang=str(ang), scaled="0")
    geom = spPr.find(f"{{{A}}}prstGeom")
    (geom if geom is not None else spPr[0]).addnext(gf)
    s.line.fill.background()


# ── R224
def line_arrows(prs, thick_pt=13, min_pt=18):
    """화살촉 달린 선(연결선) → 같은 방향·길이의 면 화살표(조금 넓게, 짙은 파랑, 꼬리 흐리게·머리 50%) — 11-04 사용자(26쪽 순환 화살표)"""
    import math
    from pptx.enum.shapes import MSO_SHAPE
    A = "http://schemas.openxmlformats.org/drawingml/2006/main"
    n = 0
    for sl in prs.slides:
        for s in list(sl.shapes):
            if s.shape_type != 9:
                continue
            ln = s._element.find(f".//{{{A}}}ln")
            if ln is None:
                continue
            he, te = ln.find(f"{{{A}}}headEnd"), ln.find(f"{{{A}}}tailEnd")
            hon = he is not None and he.get("type", "none") != "none"
            ton = te is not None and te.get("type", "none") != "none"
            if hon == ton:   # 화살촉 없음·양쪽 — 그대로
                continue
            try:
                x0, y0, x1, y1 = s.begin_x, s.begin_y, s.end_x, s.end_y
            except Exception:
                continue
            if hon:   # 머리가 시작점 쪽
                x0, y0, x1, y1 = x1, y1, x0, y0
            L = math.hypot(x1 - x0, y1 - y0)
            if L < min_pt * PT:
                continue
            ang = math.degrees(math.atan2(y1 - y0, x1 - x0))
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            t = thick_pt * PT
            a = sl.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, int(cx - L / 2), int(cy - t / 2), int(L), int(t))
            a.rotation = ang
            a.adjustments[0] = 0.5    # 몸통 굵기(11-04 '조금 더 넓게')
            a.adjustments[1] = 0.9    # 머리 길이
            _grad_arrow(a, 0)
            a.name = (s.name or "arrow") + "_fill"
            s._element.addnext(a._element)
            s._element.getparent().remove(s._element)
            n += 1
    return n


# ── R225
def flow_strip(prs):
    """한 줄로 늘어선 아이콘(3개 넘게, 높이 비슷, 세로 가운데 차이 8pt 안)과 그 사이 짧은 선·점 —
    크기감 같게, 세로 가운데 같게, 간격 고르게, 아이콘 사이마다 선 하나 + 가운데 점 하나로 다시 놓는다(26쪽 띠)"""
    from pptx.enum.shapes import MSO_SHAPE
    n = 0
    for sl in prs.slides:
        shs = list(sl.shapes)
        pics = [p for p in _pics(sl) if 20 * PT <= max(p.width, p.height) <= 80 * PT]
        used = set()
        for p in pics:
            if p.shape_id in used:
                continue
            cy = p.top + p.height / 2
            row = sorted([q for q in pics if abs(q.top + q.height / 2 - cy) <= 8 * PT and 0.6 <= q.height / p.height <= 1.6], key=lambda q: q.left)
            if len(row) < 3:
                continue
            band = (min(q.top for q in row), max(q.top + q.height for q in row))
            lines = [l for l in shs if l.shape_type == 9 and l.height <= PT and band[0] <= l.top <= band[1]
                     and row[0].left < l.left < row[-1].left + row[-1].width]
            if len(lines) < len(row) - 2:   # 사이 선이 없으면 띠가 아니다
                continue
            used.update(q.shape_id for q in row)
            geo = lambda xs: [(x.left, x.top, x.width, x.height) for x in xs]
            dots = [d for d in shs if d.shape_type == 1 and d.width <= 7 * PT and d.height <= 7 * PT and band[0] <= d.top <= band[1]
                    and row[0].left < d.left < row[-1].left + row[-1].width]
            before = geo(row) + geo(lines) + geo(dots)
            vis = [_vis(q) for q in row]
            mass = [((v[2] - v[0]) * q.width * (v[3] - v[1]) * q.height) ** 0.5 for q, v in zip(row, vis)]
            m = median(mass)
            ycen = median(q.top + q.height * (v[1] + v[3]) / 2 for q, v in zip(row, vis))
            # 첫·끝 아이콘 보이는 가운데 사이를 고르게
            xs = [q.left + q.width * (v[0] + v[2]) / 2 for q, v in zip(row, vis)]
            x0, x1 = xs[0], xs[-1]
            step = (x1 - x0) / (len(row) - 1)
            edges = []
            for i, (q, v, ms) in enumerate(zip(row, vis, mass)):
                k = m / ms if ms else 1
                w2, h2 = q.width * k, q.height * k
                nx = x0 + step * i
                q.left, q.top = int(nx - w2 * (v[0] + v[2]) / 2), int(ycen - h2 * (v[1] + v[3]) / 2)
                q.width, q.height = int(w2), int(h2)
                edges.append((q.left + q.width * v[0], q.left + q.width * v[2]))
            tmpl_l, tmpl_d = lines[0], (dots[0] if dots else None)
            for l in lines[1:]:
                l._element.getparent().remove(l._element)
            for d in dots[1:]:
                d._element.getparent().remove(d._element)
            gap = 3 * PT
            import copy
            for i in range(len(row) - 1):
                a, b = edges[i][1] + gap, edges[i + 1][0] - gap
                if b - a < 4 * PT:
                    continue
                if i == 0:
                    l = tmpl_l
                else:
                    el = copy.deepcopy(tmpl_l._element); tmpl_l._element.addnext(el)
                    l = [x for x in sl.shapes if x._element is el][0]
                l.left, l.top, l.width, l.height = int(a), int(ycen), int(b - a), 0
                if tmpl_d is not None:
                    if i == 0:
                        d = tmpl_d
                    else:
                        el = copy.deepcopy(tmpl_d._element); tmpl_d._element.addnext(el)
                        d = [x for x in sl.shapes if x._element is el][0]
                    d.left, d.top = int((a + b) / 2 - d.width / 2), int(ycen - d.height / 2)
            after = geo(row) + geo([x for x in sl.shapes if x.shape_type == 9 and x.height <= PT and band[0] <= x.top <= band[1]])
            if len(after) != len(before) - len(dots) or any(abs(u - w) > PT / 2 for a_, b_ in zip(before, after) for u, w in zip(a_, b_)):
                n += 1
    return n


# ── R228
def tile_on_band(prs, max_pt=50):
    """채운 띠·칩 위에 놓인 '파란 네모째 잘린 아이콘'(34쪽 돋보기·톱니 — 반투명 네모가 띠 위 다른 색 칸으로 보이고 가장자리 잘림) →
    흰 그림만 남기고(가운데와 닿는 흰 덩어리) 바탕은 띠가 맡는다. split_tiles 는 불투명 네모만 잡아 반투명은 빠졌다"""
    from PIL import Image
    n = 0
    for sl in prs.slides:
        fills = [s for s in sl.shapes if _filled(s)]
        for sh in _pics(sl):
            if max(sh.width, sh.height) > max_pt * PT:
                continue
            base = [f for f in fills if _inside(sh, f, 3 * PT)]
            if not base:
                continue
            try:
                br, bg_, bb_ = min(base, key=lambda f: f.width * f.height).fill.fore_color.rgb
            except Exception:
                continue
            if not (bb_ > 120 and bb_ > br + 50):   # 파란 띠 위만
                continue
            im = _img(sh)
            if im is None:
                continue
            w, h = im.size
            ring = [im.getpixel((x, y)) for x in range(0, w, 3) for y in (2, h - 3)] + [im.getpixel((x, y)) for y in range(0, h, 3) for x in (2, w - 3)]
            tile = [p for p in ring if p[3] > 60 and p[2] > p[0] + 40]
            if len(tile) < 0.5 * len(ring):   # 둘레가 파란 칸이 아니면 그대로(이미 흰 그림만인 아이콘 포함)
                continue
            k = im.copy(); kp = k.load()
            for y in range(h):
                for x in range(w):
                    r, g, b, a = kp[x, y]
                    lum = min(r, g, b)
                    al = 0 if lum < 170 else (255 if lum > 225 else int(255 * (lum - 170) / 55))
                    kp[x, y] = (255, 255, 255, min(a, al))
            import illus
            cs = illus._blobs(k, 60)
            keep = [c for c in cs if any(0.25 * w <= x <= 0.75 * w and 0.25 * h <= y <= 0.75 * h for x, y in c)]
            if not keep:
                continue
            from PIL import ImageFilter
            m = Image.new("L", k.size, 0); mp = m.load()
            for c in keep:
                for x, y in c:
                    mp[x, y] = 255
            m = m.filter(ImageFilter.MaxFilter(5))
            k.putalpha(Image.composite(k.split()[3], Image.new("L", k.size, 0), m))
            b0 = k.getbbox()
            if not b0:
                continue
            buf = io.BytesIO(); k.crop(b0).save(buf, "PNG")
            blip = sh._element.find(".//{http://schemas.openxmlformats.org/drawingml/2006/main}blip")
            sl.part.related_part(blip.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed"))._blob = buf.getvalue()
            x0, y0, x1, y1 = b0[0] / w, b0[1] / h, b0[2] / w, b0[3] / h
            sh.left, sh.top = int(sh.left + sh.width * x0), int(sh.top + sh.height * y0)
            sh.width, sh.height = int(sh.width * (x1 - x0)), int(sh.height * (y1 - y0))
            n += 1
    return n


# ── R213
def add_guides(prs):
    """본문 좌우 끝선 = 장마다 가장 왼쪽·오른쪽 채운 도형의 가장 흔한 값, 위 = 키메시지 아래 첫 카드 윗선, 아래 = 바닥 띠 위"""
    from lxml import etree
    from collections import Counter
    W, H = prs.slide_width, prs.slide_height
    L, R, T, B = Counter(), Counter(), Counter(), Counter()
    for sl in prs.slides:
        fs = [s for s in sl.shapes if _filled(s) and s.width > 0.15 * W]
        if not fs:
            continue
        L[round(min(s.left for s in fs) / PT, 1)] += 1
        R[round(max(s.left + s.width for s in fs) / PT, 1)] += 1
        T[round(min(s.top for s in fs) / PT, 1)] += 1
        B[round(max(s.top + s.height for s in fs) / PT, 1)] += 1
    if not L:
        return 0
    want = [("vert", L.most_common(1)[0][0]), ("vert", R.most_common(1)[0][0]), ("horz", T.most_common(1)[0][0]), ("horz", B.most_common(1)[0][0])]
    P = "http://schemas.openxmlformats.org/presentationml/2006/main"
    P15 = "http://schemas.microsoft.com/office/powerpoint/2012/main"
    GUID = "{EFAFB233-063F-42B5-8137-9DF3F51BA10A}"
    root = prs.part._element
    ext_lst = root.find(f"{{{P}}}extLst")
    if ext_lst is None:
        ext_lst = etree.SubElement(root, f"{{{P}}}extLst")
    ext = next((e for e in ext_lst if e.get("uri") == GUID), None)
    if ext is None:
        ext = etree.SubElement(ext_lst, f"{{{P}}}ext", uri=GUID)
    lst = ext.find(f"{{{P15}}}sldGuideLst")
    if lst is None:
        lst = etree.SubElement(ext, f"{{{P15}}}sldGuideLst", nsmap={"p15": P15})
    have = {(g.get("orient", "horz"), round(int(g.get("pos", 0)) / 8, 1)) for g in lst}
    if not any(o == "vert" for o, _ in have):   # 가운데 세로·가로선(기본 안내선)도 함께
        want += [("vert", round(W / PT / 2, 1)), ("horz", round(H / PT / 2, 1))]
    nid = max([int(g.get("id", 0)) for g in lst] + [0]) + 1
    n = 0
    for o, pos in want:
        if any(oo == o and abs(pp - pos) < 1 for oo, pp in have):
            continue
        g = etree.SubElement(lst, f"{{{P15}}}guide", id=str(nid), pos=str(int(round(pos * 8))))
        if o == "vert":
            g.set("orient", "vert")
        etree.SubElement(g, f"{{{P15}}}clr").append(etree.Element(f"{{{'http://schemas.openxmlformats.org/drawingml/2006/main'}}}srgbClr", val="F26B3A"))
        have.add((o, pos))
        nid += 1
        n += 1
    return n


# ── R231
def _guides_lr(fills):
    """장의 본문 왼·오른 끝선 = 큰 카드 왼끝·오른끝 중 가장 흔한 값"""
    from collections import Counter
    big = [c for c in fills if c.width >= 80 * PT]
    if not big:
        return None, None
    gl = Counter(round(c.left / PT) for c in big).most_common(1)[0][0] * PT
    gr = Counter(round((c.left + c.width) / PT) for c in big).most_common(1)[0][0] * PT
    return gl, gr


def row_balance(prs, snap_pt=10, min_gap_pt=6):
    """가로로 나란한 카드 줄 — 간격을 같게, 양 끝은 안내선(또는 감싼 패널 안쪽 같은 여백)에 맞춘다(11-04 '가로 카드 마감 균형').
    폭이 비슷하면(12% 안) 폭도 같게. 카드 안 도형은 카드를 따라 옮기고(넓은 것은 폭도 같은 비율로), 카드 사이 화살표는 새 간격 가운데로.
    간격 안에 화살표가 있는 칸과 없는 칸이 섞인 줄, 겹친 줄은 두지 않는다"""
    n = 0
    for sl in prs.slides:
        shs = list(sl.shapes)
        fills = [s for s in shs if _filled(s) and _boxy(s) and s.width >= 50 * PT and s.height >= 25 * PT and s.top >= 60 * PT]
        # 카드 맨 위 머리 띠는 줄 카드가 아니다 — 패널을 옮기며 함께 옮겨지는데 따로 또 맞추면 폭이 어긋난다(13쪽)
        fills = [f for f in fills if not any(d is not f and _inside(f, d, PT) and abs(f.top - d.top) <= 2 * PT and f.width >= 0.9 * d.width and d.height > 1.5 * f.height for d in fills)]
        tops = [f for f in fills if not any(d is not f and _inside(f, d, 0) for d in fills)]   # 안내선은 다른 카드에 안 든 카드로(13쪽 패널이 안쪽 카드 선으로 끌림)
        rows = []
        for c in sorted(fills, key=lambda q: q.left):
            r = next((r for r in rows if abs(r[0].top - c.top) <= 3 * PT and abs(r[0].height - c.height) <= 0.15 * r[0].height
                      and not any(_inside(c, d, 0) or _inside(d, c, 0) for d in r)), None)
            (r.append(c) if r is not None else rows.append([c]))
        for r in rows:
            # 40pt 넘게 벌어진 곳에서 끊는다(따로 노는 묶음)
            subs, cur = [], [r[0]]
            for a, b in zip(r, r[1:]):
                if b.left - (a.left + a.width) > 40 * PT:
                    subs.append(cur); cur = []
                cur.append(b)
            subs.append(cur)
            for row in subs:
                if len(row) < 2:
                    continue
                gaps = [b.left - (a.left + a.width) for a, b in zip(row, row[1:])]
                if min(gaps) < -PT:
                    continue
                # 간격 안 도형(화살표 등)
                between = []
                for a, b in zip(row, row[1:]):
                    x0, x1 = a.left + a.width, b.left
                    between.append([s for s in shs if s not in row and s.left >= x0 - 2 * PT and s.left + s.width <= x1 + 2 * PT
                                    and s.top >= min(a.top, b.top) - 2 * PT and s.top + s.height <= max(a.top + a.height, b.top + b.height) + 2 * PT])
                has = [bool(x) for x in between]
                if any(has) and not all(has):
                    continue
                L0, R0 = row[0].left, row[-1].left + row[-1].width
                cont = None
                for s in fills:
                    if s in row or not all(_inside(c, s, 0) for c in row):
                        continue
                    if cont is None or s.width * s.height < cont.width * cont.height:
                        cont = s
                L, R = L0, R0
                if cont is not None:
                    pl, pr = L0 - cont.left, cont.left + cont.width - R0
                    if abs(pl - pr) > 1.5 * PT and max(pl, pr) <= 30 * PT and min(pl, pr) >= 0:
                        p_ = (pl + pr) / 2
                        L, R = cont.left + p_, cont.left + cont.width - p_
                else:
                    # 안내선은 이 줄 바깥 카드로만 — 이 줄을 넣으면 옮길 때마다 안내선이 따라 움직여 매번 바뀐다(5쪽)
                    gl, gr = _guides_lr([f for f in tops if f not in row and not any(_inside(f, c) or _inside(c, f) for c in row)])
                if cont is None and gl is not None:
                    if 1.5 * PT < abs(L0 - gl) <= snap_pt * PT:
                        L = gl
                    if 1.5 * PT < abs(R0 - gr) <= snap_pt * PT:
                        R = gr
                ws = [c.width for c in row]
                k = len(row)
                same_w = max(ws) - min(ws) <= 0.12 * max(ws)
                g = max(min_gap_pt * PT, median(gaps))
                if same_w:
                    w = (R - L - (k - 1) * g) / k
                    nw = [w] * k
                else:
                    g = (R - L - sum(ws)) / (k - 1)
                    nw = ws
                    if g < 4 * PT:
                        continue
                nl, x = [], L
                for w in nw:
                    nl.append(x); x += w + g
                if all(abs(a - c.left) <= PT and abs(b - c.width) <= PT for a, b, c in zip(nl, nw, row)):
                    continue
                if any(abs(b / c.width - 1) > 0.15 for b, c in zip(nw, row)):
                    continue     # 폭이 15% 넘게 바뀌면 안 건드린다(안 내용이 무너진다)
                # 안쪽 도형은 옮기기 전에 정해 둔다 — 옮기면서 찾으면 앞 카드에서 옮긴 그림이 다음 카드 안으로 들어가 두 번 밀린다(5·13·21쪽)
                kids = [[s for s in shs if s is not c and s not in row and s is not cont and _inside(s, c)] for c in row]
                for c, l2, w2, ks in zip(row, nl, nw, kids):
                    ol, ow = c.left, c.width
                    s_ = w2 / ow if ow else 1
                    # 한 카드 안은 모두 같은 가로 변환(x' = l2 + (x-ol)·s) — 넓은 것은 폭도, 작은 것은 가운데만(겹겹 카드도 어긋나지 않게)
                    for s in ks:
                        try:
                            keep = s.shape_type in (13, 6) or "OVAL" in str(s.auto_shape_type)   # 그림·묶음·원은 비율 유지(폭만 바꾸면 찌그러진다)
                        except Exception:
                            keep = s.shape_type in (13, 6)
                        if s.width >= 0.5 * ow and not keep:
                            s.left = int(l2 + (s.left - ol) * s_)
                            s.width = int(s.width * s_)
                        else:
                            cx = l2 + (s.left + s.width / 2 - ol) * s_
                            s.left = int(cx - s.width / 2)
                    c.left, c.width = int(l2), int(w2)
                for j, grp in enumerate(between):
                    if not grp:
                        continue
                    cx = (nl[j] + nw[j] + nl[j + 1]) / 2
                    gx = (min(s.left for s in grp) + max(s.left + s.width for s in grp)) / 2
                    for s in grp:
                        s.left = int(s.left + cx - gx)
                n += 1
    return n


# ── R232
def icon_title_gap(prs, gap_pt=6):
    """카드 왼쪽 위 아이콘(그림·원) 바로 오른쪽 글 — 아이콘과 글자 사이가 gap_pt 보다 좁으면 글상자를 오른쪽으로(폭은 줄여 오른끝 유지)(16쪽 '생산·전송')"""
    n = 0
    for sl in prs.slides:
        shs = list(sl.shapes)
        icons = []
        for s in shs:
            if s.shape_type == 13 and max(s.width, s.height) <= 40 * PT:
                v = _vis(s)
                icons.append((s, s.left + s.width * v[2], s.top + s.height * v[1], s.top + s.height * v[3]))
            elif s.shape_type == 1 and max(s.width, s.height) <= 40 * PT and not _txt(s):
                try:
                    ov = "OVAL" in str(s.auto_shape_type)
                except Exception:
                    ov = False
                if ov:
                    icons.append((s, s.left + s.width, s.top, s.top + s.height))
        for t in shs:
            if not _txt(t) or t.shape_type == 13 or _filled(t):
                continue
            tf = t.text_frame
            if tf.paragraphs[0].alignment not in (None, 1):
                continue
            x_txt = t.left + (tf.margin_left if tf.margin_left is not None else 91440)
            for ic, r, top, bot in icons:
                ty0, ty1 = t.top, t.top + t.height
                if not (top < ty1 and bot > ty0):
                    continue
                d = x_txt - r
                if -4 * PT <= d < gap_pt * PT - PT / 4 and ic.left < t.left:
                    dx = int(gap_pt * PT - d)
                    t.left += dx
                    t.width = max(int(t.width - dx), 10 * PT)
                    n += 1
                    break
    return n


# ── R233
def _disc(im):
    """그림이 원판(타원 포함)이면 보이는 범위, 아니면 None"""
    if im is None:
        return None
    key = (im.size, im.tobytes()[::997])
    if key not in _DISC:
        _DISC[key] = _disc0(im)
    return _DISC[key]


_DISC = {}


def _disc0(im):
    a = im.split()[3].point(lambda v: 255 if v > 128 else 0)
    bb = a.getbbox()
    if not bb or bb[2] - bb[0] < 20 or bb[3] - bb[1] < 20:
        return None
    px = a.crop(bb).resize((64, 64)).load()
    hit = filled = 0
    for y in range(64):
        for x in range(64):
            e = ((x + 0.5 - 32) / 32) ** 2 + ((y + 0.5 - 32) / 32) ** 2 <= 1
            f = px[x, y] > 0
            filled += f
            hit += e == f
    return bb if 0.74 <= filled / 4096 <= 0.83 and hit / 4096 >= 0.95 else None


def round_disc_pics(prs, tol=0.02, max_off=0.15):
    """원판 아이콘 그림(파란 원 바탕 등)이 화면에서 타원이면 — 원판이 정원이 되게 표시 폭·높이를 맞춘다(넓이·가운데 유지).
    원판 판정: 보이는 범위 안 채움 0.74~0.83, 네 모서리 비어 있음, 안에 접한 타원과 95% 넘게 겹침(11-04 8·35·52쪽)"""
    n = 0
    for sl in prs.slides:
        for s in _pics(sl):
            im = _img(s)
            bb = _disc(im)
            if bb is None:
                continue
            bw, bh = bb[2] - bb[0], bb[3] - bb[1]
            disp = (bw / im.width * s.width) / (bh / im.height * s.height)
            if tol < abs(disp - 1) <= max_off:
                cx, cy = s.left + s.width / 2, s.top + s.height / 2
                k = disp ** 0.5
                w2, h2 = s.width / k, s.height * k
                s.left, s.top, s.width, s.height = int(cx - w2 / 2), int(cy - h2 / 2), int(w2), int(h2)
                n += 1
    return n


def pic_aspect(prs, tol=0.02, max_off=0.15):
    """원본보다 2~15% 늘어나거나 눌린 그림 — 상자는 두고 원본 비율로 가운데를 잘라 채운다(11-04 29쪽 간지 그림 0.963)"""
    n = 0
    for sl in prs.slides:
        for s in [q for q in sl.shapes if q.shape_type == 13]:   # 앞장(pd_) 그림도 — 29쪽 간지 그림
            im = _img(s)
            if im is None or not s.height or _disc(im) is not None:   # 원판은 round_disc_pics 가 원이 되게 맞춘다
                continue
            cl, cr, ct, cb = s.crop_left, s.crop_right, s.crop_top, s.crop_bottom
            iw, ih = im.width * (1 - cl - cr), im.height * (1 - ct - cb)
            if iw <= 0 or ih <= 0:
                continue
            r = (s.width / s.height) / (iw / ih)
            if not (tol < abs(r - 1) <= max_off):
                continue
            if r < 1:     # 상자가 더 좁다 → 그림 좌우를 더 자른다
                extra = (1 - r) * (1 - cl - cr)
                s.crop_left, s.crop_right = cl + extra / 2, cr + extra / 2
            else:
                extra = (1 - 1 / r) * (1 - ct - cb)
                s.crop_top, s.crop_bottom = ct + extra / 2, cb + extra / 2
            n += 1
    return n


# ── R234
def icon_vcenter(prs, min_pt=12, tol_pt=1.5):
    """카드 안 왼쪽 아이콘(그림, 또는 원 바탕 + 그림) — 머리 띠 없는 가로 카드면 카드 세로 가운데에(11-04 '아이콘 카드 세로 중심에 오게').
    가로 카드 = 높이가 아이콘 보이는 높이의 2.6배 이하. 아이콘이 카드 왼쪽 35% 안. 원 바탕 안 그림은 함께 옮긴다"""
    n = 0
    for sl in prs.slides:
        shs = list(sl.shapes)
        cards = [s for s in shs if _filled(s) and _boxy(s) and s.width >= 60 * PT and s.top >= 60 * PT]
        ovals = []
        for s in shs:
            try:
                if s.shape_type == 1 and "OVAL" in str(s.auto_shape_type) and max(s.width, s.height) <= 50 * PT:
                    ovals.append(s)
            except Exception:
                pass
        units = []    # (움직일 도형들, 보이는 위, 보이는 아래, 가운데 x)
        used = set()
        for o in ovals:
            inner = [p for p in _pics(sl) if _inside(p, o, 2 * PT)]
            units.append(([o] + inner, o.top, o.top + o.height, o.left + o.width / 2))
            used.update(id(p) for p in inner)
        for p in _pics(sl):
            if id(p) in used or max(p.width, p.height) < min_pt * PT or max(p.width, p.height) > 60 * PT:
                continue
            v = _vis(p)
            units.append(([p], p.top + p.height * v[1], p.top + p.height * v[3], p.left + p.width * (v[0] + v[2]) / 2))
        for grp, t, b, cx in units:
            h = b - t
            best = None
            for c in cards:
                if c.left <= cx <= c.left + c.width and c.top - PT <= t and b <= c.top + c.height + PT and c.width > 2 * (grp[0].width):
                    if best is None or c.width * c.height < best.width * best.height:
                        best = c
            c = best
            # 가로 띠 카드만(높이 ≤ 아이콘 2.6배) — 더 높은 카드의 왼쪽 위 아이콘은 제목 아이콘(16·42·51쪽이 가운데로 끌려 내려갔다)
            if c is None or (cx - c.left) / c.width > 0.35 or c.height > 2.6 * h or h < min_pt * PT:
                continue
            # 머리 띠(카드 폭 60% 넘는 채운 도형)가 있으면 제목 아이콘 — 두지 않는다
            if any(s is not c and _filled(s) and _inside(s, c) and s.width >= 0.6 * c.width and s.height < 0.4 * c.height for s in shs):
                continue
            # 큰 카드 맨 위에 붙은 머리 칸이면 제목 아이콘 — corner_tiles 가 제목 글에 맞춘다(50쪽, 서로 끌어당겼다)
            if any(d is not c and _inside(c, d, PT) and d.height > 1.5 * c.height and abs(c.top - d.top) <= 4 * PT for d in cards):
                continue
            # 아이콘 아래에도 글이 있으면 제목 옆 아이콘(corner_tiles 가 제목에 맞춘다) — 서로 끌어당겨 매번 바뀌었다(50쪽)
            if any(_txt(s) and s.shape_type != 13 and _inside(s, c) and s.top >= b - 2 * PT for s in shs if s is not c):
                continue
            dy = (c.top + c.height / 2) - (t + b) / 2
            if abs(dy) > tol_pt * PT:
                for s in grp:
                    s.top = int(s.top + dy)
                n += 1
    return n


# ── R230
def accent_tint(prs, fill="EEF4FF", min_w=80, min_h=40):
    """흰 카드만으로 된 장표에 강조 카드 바탕을 아주 연한 파랑으로(11-04 '흰색 카드로만 구성해 밋밋함').
    이미 연한 색 카드가 있는 장은 두지 않는다. 강조 = ① 양옆(또는 위아래)에 화살표가 붙은 가운데 카드,
    ② 없으면 맨 위에 나란한 같은 크기 카드 묶음(2개 이상) — 단 그 묶음이 장의 흰 카드 전부면(표도 없으면) 두지 않는다"""
    from pptx.dml.color import RGBColor
    n = 0
    for sl in prs.slides:
        boxes, light = [], 0
        for s in sl.shapes:
            if s.shape_type != 1 or not _boxy(s) or s.width < min_w * PT or s.height < min_h * PT or s.top < 60 * PT:
                continue
            try:
                if s.fill.type != 1:
                    continue
                c = str(s.fill.fore_color.rgb)
            except Exception:
                continue
            r, g_, b = (int(c[i:i + 2], 16) for i in (0, 2, 4))
            if c == "FFFFFF":
                boxes.append(s)
            elif min(r, g_, b) >= 0xDC:
                light += 1
        # 다른 흰 카드를 품은 패널은 빼고 안쪽 카드만
        whites = [c for c in boxes if not any(d is not c and _inside(d, c, 0) for d in boxes)]
        if light or len(whites) < 2:
            continue
        arrows = []
        for s in sl.shapes:
            try:
                nm = str(s.auto_shape_type) if s.shape_type == 1 else ""
            except Exception:
                nm = ""
            if "ARROW" in nm or s.shape_type == 9 or (s.name or "").startswith("pd_arrow"):
                arrows.append((s.left + s.width / 2, s.top + s.height / 2))

        def flank(c, horiz):
            a = b = False
            for x, y in arrows:
                if horiz and c.top <= y <= c.top + c.height:
                    a |= c.left - 40 * PT <= x <= c.left + 2 * PT
                    b |= c.left + c.width - 2 * PT <= x <= c.left + c.width + 40 * PT
                if not horiz and c.left <= x <= c.left + c.width:
                    a |= c.top - 40 * PT <= y <= c.top + 2 * PT
                    b |= c.top + c.height - 2 * PT <= y <= c.top + c.height + 40 * PT
            return a and b
        pick = [c for c in whites if flank(c, True) or flank(c, False)]
        if not pick:
            rows = []
            for c in sorted(whites, key=lambda q: q.top):
                r_ = next((r_ for r_ in rows if abs(r_[0].top - c.top) <= 4 * PT and abs(r_[0].height - c.height) <= 0.08 * r_[0].height
                           and abs(r_[0].width - c.width) <= 0.12 * r_[0].width), None)
                (r_.append(c) if r_ is not None else rows.append([c]))
            rows = [r_ for r_ in rows if len(r_) >= 2]
            if rows:
                top = min(rows, key=lambda r_: r_[0].top)
                table = any(getattr(s, "has_table", False) and s.has_table for s in sl.shapes)
                if len(top) < len(whites) or table:
                    pick = top
        for c in pick:
            c.fill.solid()
            c.fill.fore_color.rgb = RGBColor.from_string(fill)
            n += 1
    return n


def _one_pass(prs, out):
    for name, fn in RULES:
        try:
            k = fn(prs)
            if name == "card_bottoms":   # 카드 크기 맞추기와 끝선 맞추기가 서로 되돌리지 않게 — 더 바뀌지 않을 때까지(최대 3번)
                for _ in range(3):
                    a_, b_ = equal_cards(prs), card_bottoms(prs)
                    out["equal_cards"] = out.get("equal_cards", 0) + a_
                    k += b_
                    if not (a_ or b_):
                        break
        except Exception as e:
            out[name] = f"실패: {str(e)[:120]}"
            continue
        if isinstance(out.get(name, 0), int):
            out[name] = out.get(name, 0) + k


RULES = (("hidden_cuts", drop_hidden_cuts), ("glyph_rims", glyph_rims), ("tile_on_band", tile_on_band), ("round_ovals", round_ovals),
         ("round_discs", round_disc_pics), ("pic_aspect", pic_aspect), ("equal_cards", equal_cards),
         ("chip_icons", chip_icons), ("grid_cells", grid_cells), ("badge_rows", badge_rows), ("card_bottoms", card_bottoms),
         ("row_balance", row_balance), ("corner_tiles", corner_tiles), ("icon_title_gap", icon_title_gap), ("sibling_pics", sibling_pics),
         ("icon_vcenter", icon_vcenter), ("row_text", row_text_sizes),
         ("dangling_leads", dangling_leads), ("panel_tint", panel_tint), ("accent_tint", accent_tint), ("table_center", table_center), ("flow_strip", flow_strip),
         ("line_arrows", line_arrows), ("arrows", arrow_style), ("guides", add_guides))


def run(prs, passes=3):
    """규칙을 차례로 — 앞 규칙이 옮긴 것을 뒤 규칙이 다시 맞추므로(줄 맞춤 → 카드 크기 → 그림 자리) 더 바뀌지 않을 때까지 최대 passes 번"""
    out = {}
    for _ in range(passes):
        before = {k: v for k, v in out.items()}
        _one_pass(prs, out)
        if all(out.get(k) == before.get(k, 0) for k in out if isinstance(out[k], int)):
            break
    return out
