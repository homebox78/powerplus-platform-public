# -*- coding: utf-8 -*-
"""표지·목차·간지 — 나노바나나 2 가 만든 글자 없는 배경 그림 위에 엔진이 실제 서체로 글을 얹는다.
나노바나나는 사진은 좋지만 한글을 깨뜨리고(오타·뭉개짐·지어낸 글) 지시문을 글자로 찍는다 — 글은 그림 모델에 맡기지 않는다.
글 자리: 왼쪽 7% 에서 시작(로고와 같은 선), 위·아래 로고 자리를 피해 세로 가운데. 큰 글자는 제목 서체, 자간 −1.7%, 줄 간격 ×1.18."""
import io, re
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageStat
import fontset

W, H = 2400, 1600
X0 = int(W * 0.07)


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
            x0 = W - int(W * 0.30) if pos.endswith("r") else 0
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


def _busy(im):
    """그림이 있는 곳(1/8 축소 격자) — 윤곽이 서거나 채도가 있는 칸. 밝은 회백색 바닥·옅은 홈 선은 비어 있는 것으로 본다.
    가장자리 한 줄은 뺀다(윤곽 필터가 그림 테두리를 통째로 윤곽으로 잡는다)"""
    from PIL import ImageChops
    sm = im.convert("RGB").resize((W // 8, H // 8), Image.BILINEAR)
    edge = sm.convert("L").filter(ImageFilter.FIND_EDGES).point(lambda v: 255 if v > 60 else 0)
    sat = sm.convert("HSV").split()[1].point(lambda v: 255 if v > 90 else 0)
    m = ImageChops.lighter(edge, sat)
    ImageDraw.Draw(m).rectangle([0, 0, m.width - 1, m.height - 1], outline=0, width=2)
    return m.filter(ImageFilter.MaxFilter(3))


def _clear_text(bg, text_alpha, lay, margin=0.035, min_scale=0.6):
    """글(text_alpha = 글만 그린 투명 층의 알파)이 그림에 걸리면 그림을 줄여(아래·반대쪽 기준) 글에서 떼어 낸 새 바탕을 돌려준다. 안 걸리면 None.
    판정은 글이 실제로 있는 칸마다 — 글 상자 사각형으로 재면 짧은 날짜 줄 옆 빈자리까지 글로 친다.
    빈 자리는 그림의 차분한 바탕색으로 채우고 경계는 부드럽게 녹인다"""
    g = 8
    m = _busy(bg)
    mx, my = int(W * margin), int(H * margin)
    tm = text_alpha.resize((W // g, H // g), Image.BOX).point(lambda v: 255 if v > 8 else 0)
    zone = tm.filter(ImageFilter.MaxFilter(2 * (mx // g) + 1))   # 글 둘레 여백까지
    zp, mp = zone.load(), m.load()
    cells = hit = 0
    for y in range(zone.height):
        for x in range(zone.width):
            if zp[x, y]:
                cells += 1
                hit += 1 if mp[x, y] else 0
    if not cells or hit / cells < 0.03:
        return None
    s = 1.0
    if lay == "center":   # 글이 위 가운데 — 글이 있는 열마다 그림의 가장 위쪽 끝이 글 아래 끝(+여백)보다 내려가게
        for x in range(zone.width):
            ys = [y for y in range(zone.height) if zp[x, y]]
            if not ys:
                continue
            need = (max(ys) + 1) * g
            yb = next((y * g for y in range(min(ys), m.height) if mp[x, y]), None)
            if yb is not None and yb < need:
                s = min(s, (H - need) / max(1, H - yb))
        ax, ay = 0.5, 1.0
    else:   # 글이 왼쪽(오른쪽) — 글이 있는 줄마다 그림의 글 쪽 끝이 글 끝(+여백) 너머로
        right = lay == "right"
        for y in range(zone.height):
            xs = [x for x in range(zone.width) if zp[x, y]]
            if not xs:
                continue
            if right:
                need = min(xs) * g
                xb = next((((x + 1) * g) for x in range(max(xs), -1, -1) if mp[x, y]), None)
                if xb is not None and xb > need:
                    s = min(s, need / max(1, xb))
            else:
                need = (max(xs) + 1) * g
                xb = next((x * g for x in range(min(xs), m.width) if mp[x, y]), None)
                if xb is not None and xb < need:
                    s = min(s, (W - need) / max(1, W - xb))
        ax, ay = (0.0 if right else 1.0), 1.0
    s = max(min_scale, min(1.0, s))
    if s >= 0.995:
        return None
    sw, sh = int(W * s), int(H * s)
    small = bg.convert("RGB").resize((sw, sh), Image.LANCZOS)
    px, py = int((W - sw) * ax), int((H - sh) * ay)
    cb = (W - int(W * 0.12), 0, W, int(H * 0.12)) if lay == "right" else (0, 0, int(W * 0.12), int(H * 0.12))
    col = tuple(int(v) for v in ImageStat.Stat(bg.convert("RGB").crop(cb)).median)
    out = Image.new("RGB", (W, H), col)
    fw = int(min(sw, sh) * 0.12)   # 줄인 그림 가장자리를 바탕색으로 녹인다(붙인 경계가 보이지 않게)
    ramp = [int(255 * (i / fw) ** 1.5) for i in range(fw)]
    mask = Image.new("L", (sw, sh), 255)
    gx = Image.new("L", (sw, 1), 255)
    for i in range(fw):
        if px > 0:
            gx.putpixel((i, 0), ramp[i])
        if px + sw < W:
            gx.putpixel((sw - 1 - i, 0), min(gx.getpixel((sw - 1 - i, 0)), ramp[i]))
    gy = Image.new("L", (1, sh), 255)
    for i in range(fw):
        if py > 0:
            gy.putpixel((0, i), ramp[i])
    from PIL import ImageChops
    mask = ImageChops.multiply(gx.resize((sw, sh)), gy.resize((sw, sh)))
    out.paste(small, (px, py), mask)
    return out


def layout_of(st, kind):
    """앞장 글 배치 — left(기본) | right | center. 판(panel)이 있으면 left"""
    fd = (st or {}).get("front_draw") or {}
    if kind == "cover" or (fd.get("panel") or {}).get(kind):
        return "left"
    return (fd.get("layout") or {}).get(kind, "left")


def compose(kind, bg_png, texts, st, accent, title_font=None, body_font=None, logo_pos=("tl", "bl")):
    """kind: cover|toc|div. texts: cover {title, small, tail, date} / toc {label, rows:[(no,name)], tag} / div {no, name, line, tag}.
    st = 디자인 타입(styles.json) — front_draw 로 색·판(panel)·배치(layout)·젖빛 카드(card)를 정한다. 반환: PNG 바이트(2400×1600)"""
    fd = (st or {}).get("front_draw") or {}
    tpath = fontset.title_file(title_font)
    bold, semi, reg = fontset.file(3, body_font), fontset.file(2, body_font), fontset.file(1, body_font)
    bg = _cover(Image.open(io.BytesIO(bg_png)).convert("RGB"), W, H)
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
            if not card:
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
    im = (im.convert("RGB") if panel else _calm_corners(im, logo_pos, kind, calm)).convert("RGBA")   # 판 장은 띠 없이(로고는 흰색판으로 사진 위에)
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
            px, py = H * 0.018, H * 0.010
            bh = H * 0.034 * 1.25 + py * 2
            d.rounded_rectangle([X, y, X + tw + px * 2, y + bh], radius=bh / 2, fill=acc)
            d.text((X + px, y + bh / 2), tail, font=f_tail, fill=(255, 255, 255, 255), anchor="lm")
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
            else:
                for no, name in rows:
                    d.text((X, y), f"{int(no):02d}", font=f_no, fill=key_c)
                    nx = X + f_no.getlength("00") + rs * 0.8
                    nm = name
                    while _width(nm, f_nm, rs * -0.017) > textw - (nx - X) and len(nm) > 4:
                        nm = nm[:-1]
                    _draw(d, nx, y + (rs * 1.05 - rs) * 0.5, nm, f_nm, title_c, rs * -0.017)
                    y += rs * 2.4
                y -= rs * 1.25   # 마지막 줄 아래 간격은 빼고 잰다(카드 아래 여백)

        else:   # div
            no = texts.get("no", 1)
            f_no = _font(tpath, H * 0.10)
            f_nm, tr, lines, size = _fit(texts.get("name", ""), tpath, H * 0.078, textw, 2)
            f_ln = _font(semi, H * 0.032)   # 한 단계 가늘게
            line = [w for l in str(texts.get("line") or "").split("\n") if l.strip() for w in _wrap_even(l.strip(), f_ln, 0, textw - H * 0.03)]
            gap = H * 0.3 / 19.05   # 0.3cm (장 높이 19.05cm)
            lh_ln = H * 0.032 * 1.0 + gap
            head = (H * 0.10 * 1.15 + H * 0.02) if no is not None else 0   # 엔딩·질의응답은 PART 번호 없이
            block = head + size * 1.18 * len(lines) + (H * 0.05 + lh_ln * len(line) if line else 0)
            y = top + (bottom - top - block) / 2 if lay != "center" else H * 0.10
            y_top = y
            if no is not None:
                part = f"PART {no}"
                _draw(d, xo(_width(part, f_no, H * 0.10 * -0.017)), y, part, f_no, key_c, H * 0.10 * -0.017)
            y += head
            for ln in lines:
                _draw(d, xo(_width(ln, f_nm, tr)), y, ln, f_nm, title_c, tr)
                y += size * 1.18
            if line:
                y += H * 0.05
                band = _hex(fd.get("band_dark", "1D4ED8")) if dark else _hex(fd.get("band", fd.get("key", "1D4ED8")))   # 빨강은 핵심어에만 — 띠는 파랑
                bw = max(f_ln.getlength(l) for l in line)
                px, py = H * 0.022, H * 0.016
                bx = xo(bw + px * 2)
                bh = py * 2 + H * 0.032 * 1.0 * len(line) + gap * (len(line) - 1)
                d.rectangle([bx, y, bx + bw + px * 2, y + bh], fill=band)   # 한 판 안에 줄바꿈(줄 사이 0.3cm)
                RIGHT[0] = max(RIGHT[0], bx + bw + px * 2)
                ty = y + py
                for ln in line:
                    d.text((bx + px, ty + H * 0.032 * 0.5), ln, font=f_ln, fill=(255, 255, 255, 255), anchor="lm")
                    ty += H * 0.032 * 1.0 + gap   # 글자 높이 + 0.3cm (글자 아래 끝 ~ 다음 줄 위 끝)
                y += bh
        return y_top, y

    if not panel and not card:   # 글과 그림이 겹치면 그림을 줄여 글 반대쪽으로 민다(R45) — 그림 모델이 '왼쪽을 비워라'를 어기는 일이 잦다
        probe = Image.new("RGBA", (W, H))
        body(ImageDraw.Draw(probe))
        if probe.getbbox():
            moved = _clear_text(bg, probe.split()[3], lay)
            if moved is not None:
                im, dark = prep(moved)
                im = _calm_corners(im, logo_pos, kind, calm).convert("RGBA")
                title_c = _hex(fd.get("title_dark", "FFFFFF")) if dark else _hex(fd.get("title", st.get("head_color") or "#0B2E6B"))
                key_c = _hex(fd.get("key_dark", "7DD3FC")) if dark else _hex(fd.get("key", "1D4ED8"))
                sub_c = _hex("D6E0F0") if dark else _hex("5B6475")
    if card:   # 젖빛 유리 카드 — 글 높이에 맞춰(먼저 잰다), 뒤 사진을 흐리게
        RIGHT[0] = 0
        yt, yb = body(ImageDraw.Draw(Image.new("RGBA", (W, H))))
        cx0, cx1 = int(X - W * 0.035), int(min(X + textw + W * 0.03, max(RIGHT[0], X + W * 0.18) + W * 0.035))
        cy0, cy1 = int(max(H * 0.04, yt - H * 0.06)), int(min(H * 0.96, yb + H * 0.05))
        blur = im.crop((cx0, cy0, cx1, cy1)).filter(ImageFilter.GaussianBlur(28))
        m = Image.new("L", blur.size, 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, blur.width - 1, blur.height - 1], radius=int(H * 0.03), fill=255)
        im.paste(blur, (cx0, cy0), m)
        ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
        ImageDraw.Draw(ov).rounded_rectangle([cx0, cy0, cx1, cy1], radius=int(H * 0.03), fill=(255, 255, 255, 150), outline=(255, 255, 255, 220), width=3)
        im.alpha_composite(ov)
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
