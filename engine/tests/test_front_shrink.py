# -*- coding: utf-8 -*-
"""앞장 그림 비키기(frontdraw._clear_text) — 그림 자체 바탕(옅은 판)이 있는 그림을 줄여 옮길 때 윗변이 '흰 막'처럼 끊기지 않는가(R140).
  10-29 058d 표지: 옅은 대각선 판이 있는 그림을 줄이자 판이 쪽 안에서 끝나고, 좁은(5%) 윗변 녹임 때문에 그 경계가 톱니를 가르는 흰 막으로 보였다.
  기준: 판 위 세로줄에서 윗변 둘레 밝기 변화가 한 줄당 0.8 을 넘지 않는다(넓게 녹아 있다).
  음성 대조: 고치기 전 코드는 같은 입력에서 이 기준을 넘는다(PD_ENGINE_DIR=<옛 engine> 로 돌려 확인)."""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.environ.get("PD_ENGINE_DIR") or os.path.join(HERE, "..")))
from PIL import Image, ImageDraw
import frontdraw as F

W, H = F.W, F.H
bg = Image.new("RGB", (W, H), (255, 255, 255))
d = ImageDraw.Draw(bg)
d.polygon([(int(W * 0.35), 0), (W, 0), (W, H), (int(W * 0.05), H)], fill=(205, 218, 250))   # 쪽 위·오른쪽 끝에 닿는 옅은 대각선 판
for k in range(6):   # 물체 — 글 자리(왼쪽 위)까지 걸쳐 있어 비키기가 돌게
    x, y = int(W * (0.30 + 0.1 * k)), int(H * (0.35 + 0.08 * (k % 3)))
    d.rectangle([x, y, x + int(W * 0.06), y + int(H * 0.12)], fill=(30, 70, 200))
text = Image.new("L", (W, H), 0)
ImageDraw.Draw(text).rectangle([int(W * 0.04), int(H * 0.30), int(W * 0.50), int(H * 0.55)], fill=255)

out = F._clear_text(bg, text, "left")
assert out is not None, "시험 입력이 비키기를 일으키지 못했다"
g = out.convert("L")
first = next(y for y in range(H) if g.crop((0, y, W, y + 1)).getextrema()[0] < 150)   # 맨 위 물체 — 그 위는 판·바탕만
xs = [int(W * f) for f in (0.70, 0.80, 0.90, 0.97)]
worst = 0.0
for x in xs:
    col = [g.getpixel((x, y)) for y in range(max(5, first - 10))]
    worst = max(worst, max(abs(col[y + 4] - col[y]) / 4 for y in range(len(col) - 4)))
print(f"판 윗변 둘레 밝기 변화 최대 {worst:.2f}/줄")
if worst > 0.8:
    print("실패 줄인 그림의 판 윗변이 흰 막처럼 끊김(R140)")
    sys.exit(1)
print("통과 줄인 그림 윗변이 넓게 녹음(R140)")
