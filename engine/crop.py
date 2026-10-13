# -*- coding: utf-8 -*-
"""시안 이미지에서 그림(아이콘·인물·일러스트)을 잘라 낸다 — 장표에 같은 자리로 넣기 위한 도구.

  crop.py <시안.png> <x%> <y%> <w%> <h%> <out.png> [--transparent] [--tol 22] [--erase x,y,w,h …]

  좌표는 이미지 전체 기준 백분율(왼쪽 위가 0,0). --transparent 는 가장자리에서 이어진 밝은 배경을 투명하게 만든다
  (가장자리 색을 배경으로 보고, 그 색과 tol 이내이며 가장자리와 연결된 픽셀만 지운다 — 그림 안쪽의 흰색은 남는다).
  --transparent 일 때는 좌표가 조금 어긋나도 그림이 잘리지 않게 둘레를 넓혀(--pad, 기본 상자 크기의 35%) 자른 뒤,
  원래 상자에 걸친 덩어리만 남긴다(옆의 다른 그림·글은 버린다). 마지막 줄에 **실제로 잘린 범위(place x% y% w% h%)**를 찍는다 —
  장표에는 이 범위로 넣어야 자리와 비율이 맞는다.
  --erase x,y,w,h (이미지 전체 기준 %, 여러 번 쓸 수 있다) 는 그림에 박힌 글자를 지운다 — 그 사각 범위 **안에서만**, 범위의 바탕색(가장 많은 색)과
  다른 픽셀을 바탕색으로 덮는다. 서류·화면·간판 위의 글자처럼 **평평한 바탕 위 글자**에 쓴다. 범위는 글자만 감싸게 좁게 잡는다(얼굴·손·아이콘을 넣지 않는다).
  그림 전체에 색 조건(빨간 픽셀을 다 바꾸기 등)을 거는 식으로 글자를 지우지 않는다 — 살색·볼·넥타이가 함께 지워진다.
"""
import sys
from collections import deque
from PIL import Image

a = sys.argv[1:]
if len(a) < 6:
    sys.exit(__doc__)
src, out = a[0], a[5]
x, y, w, h = (float(v) for v in a[1:5])
transparent = "--transparent" in a
tol = int(a[a.index("--tol") + 1]) if "--tol" in a else 22

im = Image.open(src).convert("RGBA")
W, H = im.size
box = (max(0, round(W * x / 100)), max(0, round(H * y / 100)), min(W, round(W * (x + w) / 100)), min(H, round(H * (y + h) / 100)))
inner = box
if transparent:   # 둘레를 넓혀 자른다 — 그림이 상자 밖으로 조금 나가 있어도 잘리지 않게
    pad = float(a[a.index("--pad") + 1]) / 100 if "--pad" in a else 0.35
    px_pad = max(10, round(max(box[2] - box[0], box[3] - box[1]) * pad))
    box = (max(0, box[0] - px_pad), max(0, box[1] - px_pad), min(W, box[2] + px_pad), min(H, box[3] + px_pad))
im = im.crop(box)

for k, v in enumerate(a):   # 박힌 글자 지우기 — 지정한 범위 안에서만
    if v != "--erase" or k + 1 >= len(a):
        continue
    ex, ey, ew, eh = (float(t) for t in a[k + 1].split(","))
    x0, y0 = max(0, round(W * ex / 100) - box[0]), max(0, round(H * ey / 100) - box[1])
    x1, y1 = min(im.size[0], round(W * (ex + ew) / 100) - box[0]), min(im.size[1], round(H * (ey + eh) / 100) - box[1])
    if x1 - x0 < 2 or y1 - y0 < 2:
        continue
    px = im.load()
    cnt = {}
    for j in range(y0, y1):
        for i in range(x0, x1):
            p = px[i, j]
            q = (p[0] >> 4, p[1] >> 4, p[2] >> 4)
            cnt[q] = cnt.get(q, 0) + 1
    top = max(cnt, key=cnt.get)   # 범위에서 가장 많은 색 = 바탕
    base = [px[i, j] for j in range(y0, y1) for i in range(x0, x1) if (px[i, j][0] >> 4, px[i, j][1] >> 4, px[i, j][2] >> 4) == top]
    fill = tuple(sorted(c[ch] for c in base)[len(base) // 2] for ch in range(3))
    ink = [(i, j) for j in range(y0, y1) for i in range(x0, x1) if max(abs(px[i, j][ch] - fill[ch]) for ch in range(3)) > 36]
    if len(ink) > 0.45 * (x1 - x0) * (y1 - y0):   # 범위가 글자 밖(옷·얼굴·다른 그림)까지 걸쳤다 — 덮으면 그림이 망가지므로 그만둔다
        print(f"erase {a[k + 1]} SKIPPED - {len(ink) * 100 // ((x1 - x0) * (y1 - y0))}% of the range differs from its base color: the range covers more than text. Narrow it to the text only.")
        continue
    hit = set(ink)
    for i, j in ink:   # 글자 둘레 1px(번진 가장자리)까지
        for u, v2 in ((i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)):
            if x0 <= u < x1 and y0 <= v2 < y1:
                hit.add((u, v2))
    for i, j in hit:
        px[i, j] = fill + (px[i, j][3],)
    print(f"erase {a[k + 1]} -> {len(hit)}px fill {fill}")

if transparent:
    px = im.load()
    w2, h2 = im.size
    seen = bytearray(w2 * h2)
    q = deque()
    for i in range(w2):
        q.append((i, 0)); q.append((i, h2 - 1))
    for j in range(h2):
        q.append((0, j)); q.append((w2 - 1, j))

    def light(p):  # 밝고 채도가 낮은 픽셀 = 배경(흰색·아주 옅은 하늘색)
        r, g, b = p[0], p[1], p[2]
        return min(r, g, b) >= 255 - tol * 2 and max(r, g, b) - min(r, g, b) <= tol

    while q:
        i, j = q.popleft()
        if i < 0 or j < 0 or i >= w2 or j >= h2 or seen[j * w2 + i]:
            continue
        seen[j * w2 + i] = 1
        if not light(px[i, j]):
            continue
        px[i, j] = (255, 255, 255, 0)
        q.extend(((i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)))
    # 원래 상자에 걸친 덩어리만 남긴다 — 넓힌 둘레에만 있는 것(옆 그림·글)은 지운다
    ix0, iy0, ix1, iy1 = inner[0] - box[0], inner[1] - box[1], inner[2] - box[0], inner[3] - box[1]
    lab = [0] * (w2 * h2)
    keep = set()
    n = 0
    for sy in range(h2):
        for sx in range(w2):
            if lab[sy * w2 + sx] or px[sx, sy][3] == 0:
                continue
            n += 1
            st = [(sx, sy)]
            lab[sy * w2 + sx] = n
            hit = False
            while st:
                i, j = st.pop()
                if ix0 <= i < ix1 and iy0 <= j < iy1:
                    hit = True
                for di in (-2, -1, 0, 1, 2):          # 2px 틈은 같은 덩어리로(선 아이콘의 끊긴 획)
                    for dj in (-2, -1, 0, 1, 2):
                        u, v = i + di, j + dj
                        if 0 <= u < w2 and 0 <= v < h2 and not lab[v * w2 + u] and px[u, v][3]:
                            lab[v * w2 + u] = n
                            st.append((u, v))
            if hit:
                keep.add(n)
    for j in range(h2):
        for i in range(w2):
            k = lab[j * w2 + i]
            if k and k not in keep:
                px[i, j] = (255, 255, 255, 0)
    bb = im.getbbox()  # 투명 여백 잘라 내기
    if bb:
        im = im.crop(bb)
        box = (box[0] + bb[0], box[1] + bb[1], box[0] + bb[2], box[1] + bb[3])
        print(f"trim {bb}")

if transparent and max(im.size) < 160:   # 작은 아이콘 — 장표에서 계단이 지지 않게 3배로 부드럽게 키워 저장(놓는 크기는 place 그대로)
    im = im.resize((im.size[0] * 3, im.size[1] * 3), Image.LANCZOS)
im.save(out)
print(f"ok {out} {im.size[0]}x{im.size[1]} from {box}")
print(f"place {box[0] / W * 100:.2f}% {box[1] / H * 100:.2f}% {(box[2] - box[0]) / W * 100:.2f}% {(box[3] - box[1]) / H * 100:.2f}%")
