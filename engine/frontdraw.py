# -*- coding: utf-8 -*-
"""표지·목차·간지 — 나노바나나 2 가 만든 글자 없는 배경 그림 위에 엔진이 실제 서체로 글을 얹는다.
나노바나나는 사진은 좋지만 한글을 깨뜨리고(오타·뭉개짐·지어낸 글) 지시문을 글자로 찍는다 — 글은 그림 모델에 맡기지 않는다.
글 자리: 왼쪽 7% 에서 시작(로고와 같은 선), 위·아래 로고 자리를 피해 세로 가운데. 큰 글자는 제목 서체, 자간 −1.7%, 줄 간격 ×1.18."""
import io, re
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageStat
import fontset

W, H = 2400, 1600
X0 = 168   # 표지·목차·간지 좌우 가이드 = 본문 틀 여백(56px)의 3배, 여섯 타입 공통(10-15 사용자 "컨텐츠보다 3배 정도, 모든 테마 통일")


def _hex(c, a=255):
    c = str(c).lstrip("#")
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), a)


def _font(path, size):
    try:
        return ImageFont.truetype(path, int(size))
    except OSError:
        return ImageFont.truetype(fontset.file(3), int(size))


def _cover(im, w, h, anchor="center"):
    r = max(w / im.width, h / im.height)
    im = im.resize((max(1, int(im.width * r + 0.5)), max(1, int(im.height * r + 0.5))), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    if anchor == "right":   # 오른쪽 기준 — 그림 모델이 왼쪽을 비워 둔(바랜) 경우가 많다
        x = im.width - w
    return im.crop((x, y, x + w, y + h))


def _width(text, font, track):
    return sum(font.getlength(ch) for ch in text) + track * max(0, len(text) - 1)


RIGHT = [0]   # 마지막으로 그린 글의 오른쪽 끝(카드 폭 재기)


def _draw(d, x, y, text, font, fill, track=0.0):
    """자간(track px)을 준 글 — 글자마다 놓는다"""
    for ch in text:
        d.text((x, y), ch, font=font, fill=fill)
        x += font.getlength(ch) + track
    RIGHT[0] = max(RIGHT[0], x)
    return x


def _wrap(text, font, track, maxw):
    lines = []
    for para in str(text).split("\n"):
        cur = ""
        for w in para.split(" "):
            t = (cur + " " + w).strip()
            if cur and _width(t, font, track) > maxw:
                lines.append(cur)
                cur = w
            else:
                cur = t
        if cur:
            lines.append(cur)
    return lines


def _wrap_even(text, font, track, maxw):
    """폭 안에서 줄 수는 그대로, 줄 길이는 고르게 — 마지막 줄에 낱말 하나만 남지 않게"""
    lines = _wrap(text, font, track, maxw)
    if len(lines) < 2:
        return lines
    words = text.split(" ")
    best, bw = lines, max(_width(l, font, track) for l in lines)
    if len(lines) == 2:
        for k in range(1, len(words)):
            a, b = " ".join(words[:k]), " ".join(words[k:])
            w = max(_width(a, font, track), _width(b, font, track))
            if w <= maxw and w < bw:
                best, bw = [a, b], w
    return best


def _fit(text, path, size, maxw, max_lines, track_ratio=-0.017):
    """큰 글자 — 폭에 맞춰 줄을 나누고, 줄 수가 넘치면 크기를 줄인다"""
    while True:
        f = _font(path, size)
        tr = size * track_ratio
        ls = _wrap(text, f, tr, maxw)
        if len(ls) <= max_lines or size < 30:
            return f, tr, ls, size
        size *= 0.92


def _lum(im, box):
    return sum(ImageStat.Stat(im.crop(box).convert("L")).mean)


def _veil(im, dark, width_ratio=0.62, strength=0.78):
    """글 자리(왼쪽)에 부드러운 그라데이션 — 사진 위 글이 읽히게. 어두우면 남색, 밝으면 흰색"""
    col = (8, 24, 64) if dark else (255, 255, 255)
    g = Image.new("L", (W, 1))
    edge = int(W * width_ratio)
    for x in range(W):
        t = min(1.0, x / edge)
        a = 1 - t * t * (3 - 2 * t)   # smoothstep — 끝이 급하게 끊기지 않고 넓게 사라진다
        g.putpixel((x, 0), int(255 * strength * min(1.0, a * 1.15)))
    mask = g.resize((W, H))
    layer = Image.new("RGBA", (W, H), col + (255,))
    im.paste(layer, (0, 0), mask)
    return im


def _veil_dir(im, dark, side, ratio, strength):
    """side: left|right|top — 글이 놓이는 쪽에 그라데이션"""
    if side == "right":
        return _veil(im.transpose(Image.FLIP_LEFT_RIGHT), dark, ratio, strength).transpose(Image.FLIP_LEFT_RIGHT)
    if side == "top":
        col = (8, 24, 64) if dark else (255, 255, 255)
        g = Image.new("L", (1, H))
        edge = int(H * ratio)
        for y in range(H):
            a = 0 if y >= edge else (1 - y / edge) ** 1.2
            g.putpixel((0, y), int(255 * strength * min(1.0, a * 1.3)))
        im.paste(Image.new("RGBA", (W, H), col + (255,)), (0, 0), g.resize((W, H)))
        return im
    return _veil(im, dark, ratio, strength)


def _calm_corners(im, logo_pos, kind, calm_box, solid=False):
    """로고 자리(tl·tr·bl·br)가 그림으로 붐비면 그 쪽(위·아래)에 페이지 폭 차분한 띠를 깐다.
    띠 색은 글 자리(차분한 곳)의 바탕색, 띠 위쪽(또는 아래쪽) 가장자리는 부드럽게 사라진다"""
    im = im.convert("RGB")
    bh = int(H * (0.16 if kind == "cover" else 0.14))
    col = tuple(int(v) for v in ImageStat.Stat(im.crop(calm_box)).median)
    for side in ("t", "b"):
        ps = [p for p in (logo_pos or []) if p and p.startswith(side)]
        if not ps:
            continue
        busy = False
        for pos in ps:
            x0 = W - X0 - int(W * 0.30) if pos.endswith("r") else X0   # 로고가 실제로 붙는 자리(logo_boxes 와 같다) — 넓게 재면 비켜 놓은 그림 끝에 걸려 띠가 그림을 덮었다
            y0 = 0 if side == "t" else H - bh
            if ImageStat.Stat(im.crop((x0, y0, x0 + int(W * 0.30), y0 + bh)).convert("L")).stddev[0] > 14:
                busy = True
        if not busy:
            continue
        fade = 0 if solid else int(H * 0.09)
        ya = H - bh - fade - 24 if side == 'b' else bh + fade + 4   # 띠 색 = 띠 바로 바깥(차분한 쪽)의 바탕색 — 경계가 보이지 않게
        col = tuple(int(v) for v in ImageStat.Stat(im.crop((calm_box[0], ya, calm_box[2], ya + 20))).median)
        g = Image.new("L", (1, bh + fade))
        for y in range(bh + fade):
            t = 1.0 if not fade else (y / fade if side == "b" else (bh + fade - 1 - y) / fade)
            g.putpixel((0, y), int(255 * min(1.0, max(0.0, t))))
        g = g.resize((W, bh + fade))
        y0 = H - bh - fade if side == "b" else 0
        im.paste(Image.new("RGB", (W, bh + fade), col), (0, y0), g)
    return im


def _busy(im, side="left"):
    """그림이 있는 곳(1/8 축소 격자) — 윤곽이 서거나 바탕색과 색이 크게 다른 칸. 밝은 회백색 바닥·옅은 홈 선은 비어 있는 것으로 본다.
    바탕색 = 글 쪽 가장자리 띠의 중앙값(채도로 재면 짙은 코발트 단색 바탕 전체가 그림으로 잡혔다 — 10-15 F 표지).
    가장자리 한 줄은 뺀다(윤곽 필터가 그림 테두리를 통째로 윤곽으로 잡는다)"""
    from PIL import ImageChops
    sm = im.convert("RGB").resize((W // 8, H // 8), Image.BILINEAR)
    edge = sm.convert("L").filter(ImageFilter.FIND_EDGES).point(lambda v: 255 if v > 60 else 0)
    bw = max(2, sm.width // 12)
    strip = (sm.width - bw, 0, sm.width, sm.height) if side == "right" else (0, 0, bw, sm.height)
    base = tuple(int(v) for v in ImageStat.Stat(sm.crop(strip)).median)
    diff = ImageChops.difference(sm, Image.new("RGB", sm.size, base)).convert("L").point(lambda v: 255 if v > 45 else 0)
    m = ImageChops.lighter(edge, diff)
    ImageDraw.Draw(m).rectangle([0, 0, m.width - 1, m.height - 1], outline=0, width=2)
    return m.filter(ImageFilter.MaxFilter(3))


def _seams(im, axis="v"):
    """그림 모델이 남긴 곧은 경계선(판·액자 끝) — 한 줄(열)이 긴 길이로 밝기가 같은 쪽으로 툭 바뀌는 곳.
    반환: [(위치 px, 시작 px, 끝 px)] (axis v = 세로선 x, h = 가로선 y)"""
    from PIL import ImageChops
    g = 4
    sm = im.convert("L").resize((W // g, H // g), Image.BILINEAR)
    if axis == "h":
        sm = sm.transpose(Image.TRANSPOSE)
    w, h = sm.size
    a = sm.crop((0, 0, w - 1, h))
    b = sm.crop((1, 0, w, h))
    d = ImageChops.subtract(b, a).point(lambda v: 255 if v > 5 else 0)   # 오른쪽(아래)이 밝아지는 곳
    e = ImageChops.subtract(a, b).point(lambda v: 255 if v > 5 else 0)   # 어두워지는 곳
    out = []
    for m in (d, e):
        px = m.load()
        cols = []
        for x in range(m.width):
            run = best = 0
            st = bst = 0
            for y in range(m.height):
                if px[x, y]:
                    if not run:
                        st = y
                    run += 1
                    if run > best:
                        best, bst = run, st
                else:
                    run = 0
            cols.append((best, bst))
        for x in range(int(m.width * 0.04), int(m.width * 0.96)):
            best, bst = cols[x]
            near = max(cols[i][0] for i in range(max(0, x - 6), min(m.width, x + 7)) if abs(i - x) > 2)
            if best >= h * 0.30 and best >= near * 2.5:   # 길게 곧은 선, 둘레보다 뚜렷이
                out.append(((x + 1) * g, bst * g, (bst + best) * g))
    return out


def _soften_seams(im):
    """곧은 경계선 둘레를 양쪽 색을 잇는 그라데이션으로 덮어 녹인다(흰 알파 그라데이션 레이어 효과). 경계가 없으면 그대로"""
    im = im.convert("RGB")
    bw = int(W * 0.06)
    for axis in ("v", "h"):
        for pos, a, b in _seams(im, axis):
            if axis == "h":
                im = im.transpose(Image.TRANSPOSE)
            x0, x1 = max(0, pos - bw), min(im.width, pos + bw)
            y0, y1 = max(0, a - bw), min(im.height, b + bw)
            band = im.crop((x0, y0, x1, y1))
            ends = Image.new("RGB", (2, band.height))
            ends.paste(band.crop((0, 0, 1, band.height)), (0, 0))
            ends.paste(band.crop((band.width - 1, 0, band.width, band.height)), (1, 0))
            lin = ends.resize((band.width, band.height), Image.BILINEAR)   # 줄마다 양 끝 색을 잇는 그라데이션
            mx = Image.new("L", (band.width, 1))
            for i in range(band.width):
                t = 1 - abs(i - (pos - x0)) / max(1, bw)
                mx.putpixel((i, 0), int(255 * max(0.0, t) ** 0.8))
            my = Image.new("L", (1, band.height))
            for j in range(band.height):
                t = min(1.0, (j + 1) / max(1, (a - y0) or 1), (band.height - j) / max(1, (y1 - b) or 1))
                my.putpixel((0, j), int(255 * max(0.0, t)))
            from PIL import ImageChops
            mask = ImageChops.multiply(mx.resize(band.size), my.resize(band.size))
            band.paste(lin, (0, 0), mask)
            im.paste(band, (x0, y0))
            if axis == "h":
                im = im.transpose(Image.TRANSPOSE)
    return im


def _sink(bg, lay, low=0.84, to=0.92):
    """그림이 위에 떠 있으면(그림 쪽 내용의 아래 끝이 low 보다 위) 아래 끝이 to 에 오도록 배경째 내린다. 안 내리면 None.
    위에 생긴 빈 곳은 맨 위 줄 바탕색을 늘여 잇는다(10-15 사용자 "이미지들이 아래쪽으로 더 내려와야")"""
    if lay == "center":
        return None
    m = _busy(bg, "right" if lay == "right" else "left")
    x0, x1 = (0, int(m.width * 0.5)) if lay == "right" else (int(m.width * 0.45), m.width)
    px = m.load()
    rows = [y for y in range(m.height) if sum(1 for x in range(x0, x1) if px[x, y]) > (x1 - x0) * 0.08]   # 옅은 점 무늬 줄은 빼고 그림 덩어리만
    if not rows:
        return None
    bottom = (rows[-1] + 1) * 8
    if bottom >= H * low:
        return None
    dy = int(min(H * to - bottom, rows[0] * 8 - H * 0.04))   # 내용 위 끝이 화면 밖으로 나가지 않게
    if dy < H * 0.03:
        return None
    out = Image.new("RGB", (W, H))
    out.paste(bg.convert("RGB").crop((0, 0, W, 1)).resize((W, dy)), (0, 0))
    out.paste(bg.convert("RGB").crop((0, 0, W, H - dy)), (0, dy))
    return out


def logo_boxes(logo_pos, kind):
    """앞장 로고가 놓이는 대략의 자리(2400×1600 기준) — design.make_front_mockup 이 로고를 붙이는 자리와 같은 모서리.
    그림을 밀어낼 때 글과 함께 비워 둘 곳"""
    out = []
    bw, bh = int(W * 0.30), int(H * (0.16 if kind == "cover" else 0.14))   # _calm_corners 가 띠를 깔지 재는 자리와 같은 크기
    for pos in (logo_pos or []):
        if not pos or len(pos) < 2:
            continue
        x0 = W - X0 - bw if pos.endswith("r") else (X0 if pos.endswith("l") else (W - bw) // 2)
        y0 = 0 if pos.startswith("t") else H - bh
        out.append((x0, y0, x0 + bw, y0 + bh))
    return out


def _clear_text(bg, text_alpha, lay, margin=0.05, min_scale=0.6, logo_alpha=None):
    """글(+로고 자리)(text_alpha = 그 자리만 칠한 알파)이 그림에 걸리면 그림을 줄여 비켜 놓은 새 바탕을 돌려준다. 안 걸리면 None.
    판정은 글이 실제로 있는 칸마다 — 글 상자 사각형으로 재면 짧은 날짜 줄 옆 빈자리까지 글로 친다.
    줄이는 기준점은 글 반대쪽의 아래·가운데·위를 차례로 시험해, 가장 덜 줄이고 비켜지는 것을 고른다(로고가 아래 모서리에 있으면 위로 붙인다).
    빈 자리는 그림의 차분한 바탕색으로 채우고 경계는 부드럽게 녹인다"""
    from PIL import ImageChops
    g = 8
    m = _busy(bg, "right" if lay == "right" else "left")
    mx = int(W * margin)
    tm = text_alpha.resize((W // g, H // g), Image.BOX).point(lambda v: 255 if v > 8 else 0)
    zone = tm.filter(ImageFilter.MaxFilter(2 * (mx // g) + 1))   # 글 둘레 여백까지
    cells = sum(zone.histogram()[128:])
    if not cells:
        return None

    def overlap(mask):
        return sum(ImageChops.multiply(mask, zone).histogram()[128:]) / cells

    lz = None
    if logo_alpha is not None:   # 로고 자리는 따로, 더 엄격하게 — 글+로고 합친 면적으로 재면 로고 자리에 조금 걸린 그림을 놓쳐 띠가 그림 아래를 덮었다(10-15 B 간지)
        lz = logo_alpha.resize((W // g, H // g), Image.BOX).point(lambda v: 255 if v > 8 else 0)
        lcells = sum(lz.histogram()[128:])
    def logo_hit(mask):
        return sum(ImageChops.multiply(mask, lz).histogram()[128:]) / lcells if lz is not None and lcells else 0.0
    if overlap(m) < 0.03 and logo_hit(m) < 0.02:
        return None
    # 그림은 오른쪽(왼쪽) 아래 자리가 기본(제안서 표지 규칙) — 아래 기준으로 75% 이상 크기에서 비켜지면 그것을 쓰고, 안 될 때만 가운데·위 기준을 본다
    anchors = {"center": [(0.5, 1.0)], "right": [(0.0, 1.0), (0.0, 0.5), (0.0, 0.0)]}.get(lay, [(1.0, 1.0), (1.0, 0.5), (1.0, 0.0)])
    best = None
    for ax, ay in anchors:
        s = 1.0
        while s >= min_scale - 1e-6:
            sw, sh = max(1, int(m.width * s)), max(1, int(m.height * s))
            mm = Image.new("L", m.size, 0)
            mm.paste(m.resize((sw, sh), Image.NEAREST), (int((m.width - sw) * ax), int((m.height - sh) * ay)))
            if overlap(mm) < 0.002:   # 거의 0 — 조금이라도 남으면 로고 띠(위로 페이드)가 다시 깔려 그림 아래를 덮는다(10-15 F 표지)
                break
            s -= 0.025
        cleared = s >= min_scale - 1e-6
        s = max(min_scale, s)
        if cleared and s >= 0.75:   # 아래 기준이 먼저 — 충분히 크면 바로 쓴다
            best = (s, ax, ay)
            break
        if best is None or s > best[0] + 1e-6:
            best = (s, ax, ay)
    s, ax, ay = best
    if s >= 0.995:
        return None
    sw, sh = int(W * s), int(H * s)
    small = bg.convert("RGB").resize((sw, sh), Image.LANCZOS)
    px, py = int((W - sw) * ax), int((H - sh) * ay)
    cb = (W - int(W * 0.12), 0, W, int(H * 0.12)) if lay == "right" else (0, int(H * 0.3), int(W * 0.12), int(H * 0.5))
    col = tuple(int(v) for v in ImageStat.Stat(bg.convert("RGB").crop(cb)).median)
    out = Image.new("RGB", (W, H), col)
    # 가장자리 녹임 — 글 쪽을 향한 끝은 넓게(바탕색으로 자연스럽게 사라지게, 10-15 C 목차 '잘린 듯'), 바깥쪽 끝은 좁게(넓히면 그림이 흐려져 잘려 보인다, F 표지)
    wide, thin = max(1, int(sw * 0.18)), max(1, int(min(sw, sh) * 0.05))
    face = {"left": "l", "right": "r", "center": "t"}.get(lay, "l")
    def ramp(n):
        return [int(255 * (i / n) ** 1.6) for i in range(n)]
    gx = Image.new("L", (sw, 1), 255)
    gy = Image.new("L", (1, sh), 255)
    for side, on in (("l", px > 0), ("r", px + sw < W), ("t", py > 0), ("b", py + sh < H)):
        if not on:
            continue
        n = min(wide if side == face else thin, (sw if side in "lr" else sh) // 2)
        for i, v in enumerate(ramp(n)):
            if side == "l":
                gx.putpixel((i, 0), min(gx.getpixel((i, 0)), v))
            elif side == "r":
                gx.putpixel((sw - 1 - i, 0), min(gx.getpixel((sw - 1 - i, 0)), v))
            elif side == "t":
                gy.putpixel((0, i), min(gy.getpixel((0, i)), v))
            else:
                gy.putpixel((0, sh - 1 - i), min(gy.getpixel((0, sh - 1 - i)), v))
    mask = ImageChops.multiply(gx.resize((sw, sh)), gy.resize((sw, sh)))
    out.paste(small, (px, py), mask)
    return out


def layout_of(st, kind):
    """앞장 글 배치 — left(기본) | right | center. 판(panel)이 있으면 left"""
    fd = (st or {}).get("front_draw") or {}
    if kind == "cover" or (fd.get("panel") or {}).get(kind):
        return "left"
    return (fd.get("layout") or {}).get(kind, "left")


def compose(kind, bg_png, texts, st, accent, title_font=None, body_font=None, logo_pos=("tl", "bl"), save_bg=None):
    """kind: cover|toc|div. texts: cover {title, small, tail, date} / toc {label, rows:[(no,name)], tag} / div {no, name, line, tag}.
    st = 디자인 타입(styles.json) — front_draw 로 색·판(panel)·배치(layout)·젖빛 카드(card)를 정한다. 반환: PNG 바이트(2400×1600)"""
    fd = (st or {}).get("front_draw") or {}
    tpath = fontset.title_file(title_font)
    bold, semi, reg = fontset.file(3, body_font), fontset.file(2, body_font), fontset.file(1, body_font)
    bg = _soften_seams(_cover(Image.open(io.BytesIO(bg_png)).convert("RGB"), W, H))   # 그림 모델이 남긴 곧은 판·액자 경계를 녹인다(10-15 C 목차·D 표지 '잘린 듯')
    panel = (fd.get("panel") or {}).get(kind)   # 판: 글 쪽을 단색 면으로(사진은 나머지 쪽에)
    lay = layout_of(st, kind)
    card = bool((fd.get("card") or {}).get(kind))
    frac = 0.62 if kind == "div" else 0.45
    if panel:
        im = Image.new("RGB", (W, H), _hex(panel)[:3])
        ph = _cover(Image.open(io.BytesIO(bg_png)).convert("RGB"), W - int(W * frac), H, "right")
        im.paste(ph, (int(W * frac), 0))
        fw = int(W * 0.22)   # 판과 사진 사이 — 판 색으로 부드럽게 녹인다(딱딱한 경계·바랜 가장자리가 보이지 않게)
        g = Image.new('L', (fw, 1))
        for x in range(fw):
            t = x / fw
            g.putpixel((x, 0), int(255 * (1 - t * t * (3 - 2 * t))))
        im.paste(Image.new('RGB', (fw, H), _hex(panel)[:3]), (int(W * frac), 0), g.resize((fw, H)))
        dark = _lum(im, (0, 0, 40, 40)) < 120
        X, textw = X0, int(W * frac) - X0 - int(W * 0.04)
    else:
        def prep(src):   # 글 쪽 덮개 — 그림을 밀어낸 뒤 다시 부르므로 함수로
            zone = {"left": (0, int(H * 0.2), int(W * 0.45), int(H * 0.8)), "right": (int(W * 0.55), int(H * 0.2), W, int(H * 0.8)),
                    "center": (int(W * 0.2), int(H * 0.05), int(W * 0.8), int(H * 0.45))}[lay]
            dk = _lum(src, zone) < 120
            out = src
            calm_dark = dk and ImageStat.Stat(src.crop(zone).convert("L")).stddev[0] < 12   # 어두운 단색 바탕(F 표지) — 덮개를 깔면 남색·바탕색으로 갈라진다
            if not card and not calm_dark:
                out = _veil_dir(src.convert("RGB"), dk, lay if lay != "center" else "top", (0.92 if kind == "cover" else 0.80) if lay != "center" else 0.62, ((0.88 if kind == "cover" else 0.74) if dk else 0.82) if lay != "center" else 0.93)
            return out, dk
        im, dark = prep(bg)
        if lay == "right":
            X, textw = int(W * 0.54), int(W * 0.39)
        elif lay == "center":
            X, textw = int(W * 0.15), int(W * 0.70)
        else:
            X, textw = X0, int(W * (0.46 if kind == "cover" else 0.46))
    calm = (0, int(H * 0.3), int(W * 0.3), int(H * 0.7)) if (panel or lay == "left") else ((int(W * 0.7), int(H * 0.3), W, int(H * 0.7)) if lay == "right" else (int(W * 0.3), int(H * 0.02), int(W * 0.7), int(H * 0.12)))
    im = im.convert("RGBA")   # 로고 자리에 띠를 깔지 않는다 — 로고는 그대로 올린다(띠가 그림 아래를 잘린 듯 가렸다, 10-15 사용자). 그림은 _clear_text 가 로고 자리에서 비킨다
    if card:
        dark = False
    d = ImageDraw.Draw(im)
    title_c = _hex(fd.get("title_dark", "FFFFFF")) if dark else _hex(fd.get("title", st.get("head_color") or "#0B2E6B"))
    key_c = _hex(fd.get("key_dark", "7DD3FC")) if dark else _hex(fd.get("key", "1D4ED8"))
    sub_c = _hex("D6E0F0") if dark else _hex("5B6475")
    acc = _hex(accent or "#FF2A6D")
    top = H * (0.17 if lay == "left" and "t" in "".join(p or "" for p in logo_pos)[:1] else 0.12)
    bottom = H * (0.86 if lay != "center" else 0.50)

    def xo(width):   # 가운데 배치면 줄마다 가운데로
        return X + (textw - width) / 2 if lay == "center" else X

    def body(d):
        if kind == "cover":
            f_t, tr, lines, size = _fit(texts.get("title", ""), tpath, H * 0.07, textw, 2)   # 사업명은 두 줄 — 넘치면 글자를 줄인다
            lh = size * 1.18
            f_s = _font(semi, H * 0.03)   # 사업명 위 키메시지 — 제목의 약 40%, 제목과 같은 색(A 타입 표지 기준)
            f_tail = _font(bold, H * 0.034)
            f_date = _font(semi, H * 0.028)
            small = texts.get("small") or ""
            hs = (H * 0.03 * 1.45 + H * 0.012) if small else 0
            block = hs + lh * len(lines) + H * 0.055 + H * 0.06 + H * 0.03 + H * 0.04
            y = top + (bottom - top - block) / 2
            y_top = y
            if small:
                d.text((X, y), small, font=f_s, fill=title_c)
                y += hs
            for ln in lines:
                _draw(d, X, y, ln, f_t, title_c, tr)
                y += lh
            y += H * 0.055 - (lh - size)   # 사업명 끝에서 1cm 아래
            tail = texts.get("tail") or "제안설명회"
            tw = f_tail.getlength(tail)
            ib = f_tail.getbbox(tail)   # 잉크 상자 — 뱃지 여백은 글자 칸이 아니라 잉크로 잰다(R29·R30)
            ink_w, ink_h = ib[2] - ib[0], ib[3] - ib[1]
            pv = ink_h * 0.55   # 상하 여백
            ph = pv * 4.5   # 좌우 = 상하 × 4.5 — 뱃지는 좌우를 넉넉히(R30 과 같은 비율, 사용자 반복 지적)
            bh = ink_h + pv * 2
            bstyle = fd.get("badge", "pill")   # 타입마다 다르게(10-15 사용자 "다 똑같이 하지 말고") — pill 알약 · tab 각진 탭 · outline 테두리 · text 뱃지 없이 글자만
            if bstyle == "text":   # 뱃지 없이 — 강조색 굵은 글자 + 앞에 짧은 세로 막대
                bar = max(4, int(ink_h * 0.16))
                d.rectangle([X, y + pv * 0.5, X + bar, y + bh - pv * 0.5], fill=acc)
                d.text((X + bar + ink_h * 0.55 - ib[0], y + pv - ib[1]), tail, font=f_tail, fill=title_c)   # 글자는 제목 색(어두운 바탕이면 흰색), 막대만 강조색
            elif bstyle == "outline":
                d.rounded_rectangle([X, y, X + ink_w + ph * 2, y + bh], radius=bh / 2, outline=acc, width=max(3, int(ink_h * 0.09)))
                d.text((X + ph - ib[0], y + pv - ib[1]), tail, font=f_tail, fill=acc)
            else:
                d.rounded_rectangle([X, y, X + ink_w + ph * 2, y + bh], radius=(bh / 2 if bstyle == "pill" else max(4, int(bh * 0.12))), fill=acc)
                d.text((X + ph - ib[0], y + pv - ib[1]), tail, font=f_tail, fill=(255, 255, 255, 255))
            y += bh + H * 0.03
            d.text((X, y), texts.get("date", ""), font=f_date, fill=sub_c)
            y += H * 0.04

        elif kind == "toc":
            rows = texts.get("rows") or []
            f_lab = _font(tpath, H * 0.088)
            f_en = _font(semi, H * 0.022)
            n = max(1, len(rows))
            rs = min(H * 0.046, (H * 0.74 - H * 0.24) / n / 2.4)
            f_no, f_nm = _font(tpath, rs * 1.05), _font(tpath, rs)
            head_h = H * 0.088 * 1.1 + H * 0.022 * 1.6 + H * 0.07
            y = H * 0.12 if lay == "center" else top + (bottom - top - head_h - rs * 2.4 * n) / 2
            y_top = y
            lab = texts.get("label", "목차")
            _draw(d, xo(_width(lab, f_lab, H * 0.088 * -0.017)), y, lab, f_lab, title_c, H * 0.088 * -0.017)
            y += H * 0.088 * 1.12
            d.text((xo(f_en.getlength("CONTENTS")), y), "CONTENTS", font=f_en, fill=key_c)
            y += H * 0.022 * 1.6
            lx = xo(W * 0.05)
            d.line([lx, y + H * 0.01, lx + W * 0.05, y + H * 0.01], fill=key_c, width=4)
            y += H * 0.07
            if lay == "center":   # 장들을 한 줄에 나란히 — 번호 위, 이름 아래
                colw = min(W * 0.22, textw / n)
                x = X + (textw - colw * n) / 2
                for no, name in rows:
                    d.text((x + colw / 2, y), f"{int(no):02d}", font=f_no, fill=key_c, anchor="ma")
                    nm = name
                    while _width(nm, f_nm, rs * -0.017) > colw * 0.92 and len(nm) > 4:
                        nm = nm[:-1]
                    _draw(d, x + (colw - _width(nm, f_nm, rs * -0.017)) / 2, y + rs * 1.5, nm, f_nm, title_c, rs * -0.017)
                    x += colw
            else:   # 번호 01~ · 굵은 장 이름(자르지 않는다 — 줄이고, 그래도 넘치면 두 줄) · 그 아래 절 이름 작은 회색(학습-표지목차간지: 4~5장 보통, 6장 넘으면 두 열)
                cols = 2 if n > 6 else 1
                per = (n + cols - 1) // cols
                colw = textw / cols
                sub_c2 = _hex("6B7280") if not dark else _hex("C7D2E6")
                has_sub = any(len(r) > 2 and r[2] for r in rows)
                unit = 1.25 + (0.62 if has_sub else 0) + 0.75   # 줄 높이(rs 배수): 이름 + 절 + 사이
                rs = min(H * 0.046, (H * 0.86 - y) / max(1, per) / unit)
                f_no = _font(tpath, rs * 1.05)
                y0 = y
                for i, r in enumerate(rows):
                    no, name = r[0], r[1]
                    subs = [str(t).replace("**", "") for t in (r[2] if len(r) > 2 else []) if str(t).strip()]
                    cx = X + (i // per) * colw
                    yy = y0 + (i % per) * rs * unit
                    d.text((cx, yy), f"{int(no):02d}", font=f_no, fill=key_c)
                    nx = cx + f_no.getlength("00") + rs * 0.7
                    room = colw - (nx - cx) - W * 0.01
                    ns = rs
                    while ns > rs * 0.72 and _width(name, _font(tpath, ns), ns * -0.017) > room:
                        ns -= rs * 0.02
                    f_nm2 = _font(tpath, ns)
                    nl = [name] if _width(name, f_nm2, ns * -0.017) <= room else _wrap_even(name, f_nm2, ns * -0.017, room)[:2]
                    for k, ln in enumerate(nl):
                        _draw(d, nx, yy + (rs * 1.05 - ns) * 0.5 + k * ns * 1.1, ln, f_nm2, title_c, ns * -0.017)
                    if subs:
                        sy = yy + rs * 1.25 + (len(nl) - 1) * ns * 1.1
                        ss = rs * 0.5
                        f_sub = _font(semi, ss)
                        shown = list(subs)
                        txt = " · ".join(shown)
                        while len(shown) > 1 and f_sub.getlength(txt) > room:   # 말줄임 없이 — 들어가는 만큼, 남으면 '외 N'
                            shown.pop()
                            txt = " · ".join(shown) + f" 외 {len(subs) - len(shown)}"
                        d.text((nx, sy), txt, font=f_sub, fill=sub_c2)
                y = y0 + per * rs * unit - rs * 0.75   # 마지막 줄 아래 간격은 빼고 잰다(카드 아래 여백)

        else:   # div
            no = texts.get("no", 1)
            f_no = _font(tpath, H * 0.10)
            f_nm, tr, lines, size = _fit(texts.get("name", ""), tpath, H * 0.078, textw, 2)
            # 한 줄 문장 — 장 이름의 약 60% 크기, 한 줄, 핵심어(**…**)만 색 띠 + 흰 글자(표지템플릿 T015~T037 문법, 10-15 사용자)
            raw = re.sub(r"\s+", " ", str(texts.get("line") or "").replace("\n", " ")).strip()
            segs = [(t, i % 2 == 1) for i, t in enumerate(raw.split("**")) if t]
            plain = "".join(t for t, _ in segs)
            ls = H * 0.046
            while plain and ls > H * 0.03 and _font(bold, ls).getlength(plain) + ls * 0.6 > textw:
                ls -= H * 0.002
            f_ln = _font(bold, ls)
            head = (H * 0.10 * 1.15 + H * 0.02) if no is not None else 0   # 엔딩·질의응답은 PART 번호 없이
            block = head + size * 1.18 * len(lines) + ((H * 0.045 + ls * 1.5) if plain else 0)
            if no is not None and lay != "center":   # 간지는 왼쪽 위 — 템플릿처럼 글 덩어리가 화면 위쪽 1/3 에서 시작
                y = H * 0.17
            else:
                y = top + (bottom - top - block) / 2 if lay != "center" else H * 0.10
            y_top = y
            if no is not None:
                part = f"PART {no}"
                _draw(d, xo(_width(part, f_no, H * 0.10 * -0.017)), y, part, f_no, key_c, H * 0.10 * -0.017)
            y += head
            for ln in lines:
                _draw(d, xo(_width(ln, f_nm, tr)), y, ln, f_nm, title_c, tr)
                y += size * 1.18
            if plain:
                y += H * 0.045
                band = _hex(fd.get("band_dark", "1D4ED8")) if dark else _hex(fd.get("band", fd.get("key", "1D4ED8")))   # 빨강은 핵심어에만 — 띠는 파랑
                total = sum(f_ln.getlength(t) for t, _ in segs) + sum(ls * 0.3 for _, k in segs if k)
                x = xo(total)
                ib = f_ln.getbbox("가")
                for t, key in segs:
                    w = f_ln.getlength(t)
                    if key:   # 핵심어 — 글자보다 조금 큰 색 띠, 흰 글자
                        pad = ls * 0.15
                        d.rectangle([x, y + ib[1] - pad, x + w + pad * 2, y + ib[3] + pad], fill=band)
                        d.text((x + pad, y), t, font=f_ln, fill=(255, 255, 255, 255))
                        x += w + pad * 2
                    else:
                        d.text((x, y), t, font=f_ln, fill=title_c)
                        x += w
                RIGHT[0] = max(RIGHT[0], x)
                y += ls * 1.5
        return y_top, y

    if not panel and not card:   # 글과 그림이 겹치면 그림을 줄여 글 반대쪽으로 민다(R45) — 그림 모델이 '왼쪽을 비워라'를 어기는 일이 잦다
        probe = Image.new("RGBA", (W, H))
        pd = ImageDraw.Draw(probe)
        body(pd)
        # 로고 자리는 비키지 않는다 — 로고는 그림 위에 그대로 올린다(사용자 10-15). 로고를 피하느라 그림을 위로 올리면 그림이 떠 보였다
        if probe.getbbox():
            moved = _clear_text(bg, probe.split()[3], lay)
            sunk = _sink(moved if moved is not None else bg, lay)
            if sunk is not None:
                moved = sunk
            if moved is not None:
                im, dark = prep(moved)
                im = im.convert("RGBA")   # 띠 없이 — 로고는 그대로 올린다
                title_c = _hex(fd.get("title_dark", "FFFFFF")) if dark else _hex(fd.get("title", st.get("head_color") or "#0B2E6B"))
                key_c = _hex(fd.get("key_dark", "7DD3FC")) if dark else _hex(fd.get("key", "1D4ED8"))
                sub_c = _hex("D6E0F0") if dark else _hex("5B6475")
    if card:   # 젖빛 유리 카드 — 글 높이에 맞춰(먼저 잰다), 뒤 사진을 흐리게
        RIGHT[0] = 0
        yt, yb = body(ImageDraw.Draw(Image.new("RGBA", (W, H))))
        cx0, cx1 = int(X - W * 0.035), int(min(X + textw + W * 0.03, max(RIGHT[0], X + W * 0.18) + W * 0.035))
        cy0, cy1 = int(max(H * 0.04, yt - H * 0.06)), int(min(H * 0.96, yb + H * 0.05))
        blur = im.crop((cx0, cy0, cx1, cy1)).filter(ImageFilter.GaussianBlur(46))   # 파랑 유리 — 뒤 그림은 아주 연하게만(10-15 사용자)
        m = Image.new("L", blur.size, 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, blur.width - 1, blur.height - 1], radius=int(H * 0.03), fill=255)
        im.paste(blur, (cx0, cy0), m)
        ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
        gl = _hex(fd.get("glass", "#DCE4FA"))[:3]
        ImageDraw.Draw(ov).rounded_rectangle([cx0, cy0, cx1, cy1], radius=int(H * 0.03), fill=gl + (205,), outline=(255, 255, 255, 230), width=3)
        im.alpha_composite(ov)
    if save_bg:   # 글만 빠진 손본 배경(그림 비키기·경계 녹이기·덮개 반영) — 최종 장표가 이것을 깔고 글을 얹는다(원본을 깔면 글이 그림과 다시 겹친다)
        im.convert("RGB").save(save_bg)
    d = ImageDraw.Draw(im)
    body(d)

    tag = texts.get("tag")
    if tag and kind != "cover":   # 작은 사업명 — 글 단 쪽 위에(그림을 덮지 않게)
        f_tag = _font(semi, H * 0.021)
        tw = f_tag.getlength(tag)
        if panel:
            tx = int(W * frac) - int(W * 0.04)
        else:   # 오른쪽 위 끝에 — 글 단 끝에 맞추면 화면 가운데에 떠 보인다(사용자 2026-10-15)
            tx = W - X0
        box = (int(tx - tw), int(H * 0.03), int(tx), int(H * 0.08))
        tc = (255, 255, 255, 230) if _lum(im, box) < 120 else _hex("5B6475")
        d.text((tx, H * 0.042), tag, font=f_tag, fill=tc, anchor="ra")
    buf = io.BytesIO()
    im.convert("RGB").save(buf, "PNG")
    return buf.getvalue()
