# -*- coding: utf-8 -*-
"""표지·목차·간지 배경의 '곧은 경계 녹이기' 시험(R109) — 물체 테두리를 녹여 가로로 번지게 하지 않는가.
  10-28 'PART 4' 간지: 휴대폰의 곧은 테두리를 그림 모델이 남긴 판 경계로 잡아, 둘레 띠(쪽 너비 12%)를 줄마다 양 끝 색을 잇는
  그라데이션으로 덮었다 → 앞에 선 사람·말풍선이 가로로 끌린 결이 됐다.
  ① 물체 테두리(한쪽에 말풍선·사람) — 하나도 바뀌지 않는다
  ② 양쪽이 평평한 판 경계(흰 판 | 하늘색 판) — 여전히 녹인다(본래 할 일)
  ③ 양쪽이 완만한 그라데이션인 판 경계 — 여전히 녹인다

  python -X utf8 engine/tests/test_front_seams.py
  PD_ENGINE_DIR=<고치기 전 engine 사본> python …     음성 대조 — 고치기 전 코드는 ① 이 실패해야 한다"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(os.environ.get("PD_ENGINE_DIR") or os.path.dirname(HERE))
sys.path.insert(0, SRC)

from PIL import Image, ImageChops, ImageDraw  # noqa: E402
import frontdraw as F  # noqa: E402

W, H = F.W, F.H
FAILS = []


def check(ok, msg):
    print(("통과 " if ok else "실패 ") + msg)
    if not ok:
        FAILS.append(msg)


def changed(a, b, thr=12):
    d = ImageChops.difference(a, b).convert("L").point(lambda v: 255 if v > thr else 0)
    return d.histogram()[255]


def phone_scene():
    im = Image.new("RGB", (W, H), (236, 242, 252))
    d = ImageDraw.Draw(im)
    x0 = int(W * 0.62)
    d.rectangle((x0, int(H * 0.38), x0 + int(W * 0.17), int(H * 0.83)), fill=(250, 252, 255), outline=(30, 70, 170), width=10)
    for k in range(9):
        y = int(H * 0.42) + k * int(H * 0.045)
        d.rounded_rectangle((x0 - int(W * 0.05) if k % 2 else x0 + 30, y, x0 + int(W * 0.14), y + int(H * 0.03)), 12, fill=(120 + k * 10, 160, 230))
    d.ellipse((x0 - 80, int(H * 0.55), x0 + 10, int(H * 0.64)), fill=(40, 60, 110))
    d.rectangle((x0 - 90, int(H * 0.64), x0 + 15, int(H * 0.90)), fill=(90, 130, 210))
    return im


def flat_panels():
    im = Image.new("RGB", (W, H), (255, 255, 255))
    ImageDraw.Draw(im).rectangle((int(W * 0.55), 0, W, H), fill=(214, 228, 248))
    return im


def gradient_panels():
    g = Image.new("RGB", (1, H))
    g.putdata([(200 + int(40 * y / H), 220 + int(25 * y / H), 250) for y in range(H)])
    im = Image.new("RGB", (W, H), (250, 251, 253))
    im.paste(g.resize((int(W * 0.45), H)), (int(W * 0.55), 0))
    return im


a = phone_scene()
check(bool(F._seams(a, "v")), "시험 그림의 휴대폰 테두리가 곧은 경계로 잡힌다(시험 전제)")
n = changed(a, F._soften_seams(a.copy()))
check(n == 0, f"① 물체 테두리 둘레가 바뀌지 않는다(바뀐 픽셀 {n}, 0 이어야)")
b = flat_panels()
n = changed(b, F._soften_seams(b.copy()), 4)
check(n > 0, f"② 평평한 판 경계는 녹인다(바뀐 픽셀 {n}, 0 보다 커야)")
c = gradient_panels()
n = changed(c, F._soften_seams(c.copy()), 4)
check(n > 0, f"③ 그라데이션 판 경계도 녹인다(바뀐 픽셀 {n}, 0 보다 커야)")

print("\n전부 통과" if not FAILS else f"\n실패 {len(FAILS)}건")
sys.exit(1 if FAILS else 0)
