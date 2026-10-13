# -*- coding: utf-8 -*-
"""본문 그림 칸 — GPT 가 비워 둔 그림 칸(옅은 단색 둥근 사각형)을 시안에서 찾아, 나노바나나 2 로 따로 만든 그림을 끼워 넣는다.
GPT 는 실사·3D 그림에서 얼룩이 생기고, 나노바나나는 글자를 깨뜨린다 — 글·카드는 GPT, 그림은 나노바나나로 나눈다."""
import io, math
from PIL import Image, ImageDraw

ASPECTS = {"1:1": 1.0, "4:3": 4 / 3, "3:4": 3 / 4, "16:9": 16 / 9, "9:16": 9 / 16, "3:2": 3 / 2, "2:3": 2 / 3, "21:9": 21 / 9}


def aspect_of(w, h):
    r = w / max(1e-6, h)
    return min(ASPECTS, key=lambda k: abs(math.log(ASPECTS[k] / r)))


def _near(a, b, tol):
    return abs(a[0] - b[0]) <= tol and abs(a[1] - b[1]) <= tol and abs(a[2] - b[2]) <= tol


def find_slot(im, rect, tol=14):
    """rect = 와이어 상자(px, x0,y0,x1,y1). 그 안 가운데 색과 같은 색으로 이어진 영역의 경계를 여러 줄로 재서 중앙값 — 못 찾으면 rect"""
    px = im.load()
    W, H = im.size
    x0, y0, x1, y1 = [int(v) for v in rect]
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    samp = [px[min(W - 1, max(0, cx + dx)), min(H - 1, max(0, cy + dy))] for dx in (-6, 0, 6) for dy in (-6, 0, 6)]
    col = tuple(sorted(c[i] for c in samp)[4] for i in range(3))
    padx, pady = int((x1 - x0) * 0.12), int((y1 - y0) * 0.12)
    lefts, rights, tops, bots = [], [], [], []
    for f in (0.3, 0.42, 0.5, 0.58, 0.7):
        y = int(y0 + (y1 - y0) * f)
        x = cx
        while x > max(0, x0 - padx) and _near(px[x - 1, y], col, tol):
            x -= 1
        lefts.append(x)
        x = cx
        while x < min(W - 1, x1 + padx) and _near(px[x + 1, y], col, tol):
            x += 1
        rights.append(x)
        x = int(x0 + (x1 - x0) * f)
        y = cy
        while y > max(0, y0 - pady) and _near(px[x, y - 1], col, tol):
            y -= 1
        tops.append(y)
        y = cy
        while y < min(H - 1, y1 + pady) and _near(px[x, y + 1], col, tol):
            y += 1
        bots.append(y)
    med = lambda v: sorted(v)[len(v) // 2]
    box = (med(lefts), med(tops), med(rights), med(bots))
    area = (box[2] - box[0]) * (box[3] - box[1])
    if area < 0.45 * (x1 - x0) * (y1 - y0) or area > 1.6 * (x1 - x0) * (y1 - y0) or min(box[2] - box[0], box[3] - box[1]) < 40:
        return (x0, y0, x1, y1), False
    return box, True


def gray_slots(im, step=4):
    """시안 전체에서 중립 회색(#D9D9D9 근처) 덩어리들의 경계 상자 — 작게 줄여 이어진 영역을 찾는다"""
    w, h = im.width // step, im.height // step
    sm = im.resize((w, h), Image.NEAREST).load()
    mask = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            r, g, b = sm[x, y][:3]
            mask[y][x] = 200 <= r <= 228 and abs(r - g) <= 6 and abs(g - b) <= 6 and abs(r - b) <= 6
    seen = [[False] * w for _ in range(h)]
    out = []
    for y in range(h):
        for x in range(w):
            if mask[y][x] and not seen[y][x]:
                st, seen[y][x] = [(x, y)], True
                x0 = x1 = x
                y0 = y1 = y
                cnt = 0
                while st:
                    cx, cy = st.pop()
                    cnt += 1
                    x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            st.append((nx, ny))
                bw, bh = x1 - x0 + 1, y1 - y0 + 1
                if cnt > 0.003 * w * h and cnt > 0.6 * bw * bh:   # 큰, 꽉 찬 사각 덩어리만
                    out.append((x0 * step, y0 * step, (x1 + 1) * step, (y1 + 1) * step))
    return out


def best_slot(slots, rect):
    def ov(a, b):
        return max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))
    if not slots:
        return None
    best = max(slots, key=lambda sl: ov(sl, rect))
    if ov(best, rect) > 0:
        return best
    cx, cy = (rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2   # GPT 가 칸을 옮겨 그렸으면 가장 가까운 회색 칸
    return min(slots, key=lambda sl: ((sl[0] + sl[2]) / 2 - cx) ** 2 + ((sl[1] + sl[3]) / 2 - cy) ** 2)


def photo_region(im, rect, cell=8):
    """와이어 상자 근처에서 '사진'(질감이 빈틈없이 이어진 덩어리)의 경계 — 글 카드는 줄 사이 빈 여백으로 끊겨 덩어리가 되지 않는다"""
    from PIL import ImageStat
    W, H = im.size
    sc = 900 / W
    sm = im.resize((900, int(H * sc))).convert("L")
    gw, gh = sm.width // cell, sm.height // cell
    tex = [[ImageStat.Stat(sm.crop((x * cell, y * cell, x * cell + cell, y * cell + cell))).stddev[0] > 6 for x in range(gw)] for y in range(gh)]
    # 빈 칸 하나쯤은 메운다(사진 속 하늘·벽 같은 고른 곳)
    fill = [[tex[y][x] or (0 < x < gw - 1 and 0 < y < gh - 1 and sum(tex[y + dy][x + dx] for dx in (-1, 0, 1) for dy in (-1, 0, 1)) >= 6) for x in range(gw)] for y in range(gh)]
    rx0, ry0, rx1, ry1 = [int(v * sc / cell) for v in rect]
    cx, cy = (rx0 + rx1) // 2, (ry0 + ry1) // 2
    best = None
    seen = set()
    for sy in range(max(0, ry0), min(gh, ry1 + 1)):
        for sx in range(max(0, rx0), min(gw, rx1 + 1)):
            if not fill[sy][sx] or (sx, sy) in seen:
                continue
            st, comp = [(sx, sy)], []
            seen.add((sx, sy))
            while st:
                x, y = st.pop()
                comp.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < gw and 0 <= ny < gh and fill[ny][nx] and (nx, ny) not in seen:
                        seen.add((nx, ny))
                        st.append((nx, ny))
            if best is None or len(comp) > len(best):
                best = comp
    if not best:
        return None
    xs, ys = [c[0] for c in best], [c[1] for c in best]
    box = (min(xs), min(ys), max(xs) + 1, max(ys) + 1)
    bw, bh = box[2] - box[0], box[3] - box[1]
    if len(best) < 0.7 * bw * bh:   # 사각형으로 꽉 차지 않으면 사진 한 장이 아니다(글 덩어리와 이어짐)
        return None
    area, rarea = bw * bh, max(1, (rx1 - rx0) * (ry1 - ry0))
    if not (0.3 * rarea <= area <= 2.2 * rarea):
        return None
    k = cell / sc
    return (int(box[0] * k) + 3, int(box[1] * k) + 3, int(box[2] * k) - 3, int(box[3] * k) - 3)


def paste(body_png, pics):
    """pics = [(rect_px, png_bytes)] → 끼워 넣은 PNG 바이트, 실제 넣은 자리 목록"""
    im = Image.open(io.BytesIO(body_png)).convert("RGB")
    placed = []
    slots = gray_slots(im)
    for rect, png in pics:
        box = best_slot(slots, rect)
        found = box is not None
        if box is not None:
            slots.remove(box)
            box = (box[0] + 2, box[1] + 2, box[2] - 2, box[3] - 2)
        else:   # 빈 칸 대신 GPT 가 그림을 그렸으면 — 그 그림 덩어리를 찾아 바꾼다
            box = photo_region(im, rect)
            found = box is not None
            if box is None:
                box, found = find_slot(im, rect)
        bw, bh = box[2] - box[0], box[3] - box[1]
        if bw < 8 or bh < 8:
            continue
        pic = Image.open(io.BytesIO(png)).convert("RGB")
        r = max(bw / pic.width, bh / pic.height)
        pic = pic.resize((max(1, int(pic.width * r + 0.5)), max(1, int(pic.height * r + 0.5))), Image.LANCZOS)
        ox, oy = (pic.width - bw) // 2, (pic.height - bh) // 2
        pic = pic.crop((ox, oy, ox + bw, oy + bh))
        m = Image.new("L", (bw, bh), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, bw - 1, bh - 1], radius=int(min(bw, bh) * 0.05), fill=255)
        im.paste(pic, (box[0], box[1]), m)
        placed.append((box, found))
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue(), placed
