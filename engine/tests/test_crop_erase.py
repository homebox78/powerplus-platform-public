# -*- coding: utf-8 -*-
"""crop.py --erase — 그라데이션(계단 입체 면) 위 글자를 지운 자리에 얼룩이 남지 않는지(R137, 058d 계단 '1단계 Transmit').
가짜 그림: 가로로 색이 바뀌는 면 위에 흰 글씨 막대. 지운 뒤 그 자리 색이 원래 면 색과 거의 같아야 한다.
음성 대조: 예전 방식(범위 가장 많은 색 한 가지로 덮기)은 같은 입력에서 기준을 넘는다."""
import os, subprocess, sys, tempfile
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
CROP = os.path.join(HERE, "..", "crop.py")
W, H = 400, 200


def face(x):   # 면 색 — 왼쪽 옅은 파랑 → 오른쪽 짙은 파랑
    t = x / (W - 1)
    return (round(200 - 150 * t), round(220 - 130 * t), 253 - round(70 * t))


def worst(png, rect):
    im = Image.open(png).convert("RGB")
    x0, y0, x1, y1 = rect
    return max(max(abs(a - b) for a, b in zip(im.getpixel((i, j)), face(i))) for j in range(y0, y1) for i in range(x0, x1))


def main():
    tmp = tempfile.mkdtemp()
    src = os.path.join(tmp, "src.png")
    im = Image.new("RGB", (W, H))
    for i in range(W):
        for j in range(H):
            im.putpixel((i, j), face(i))
    d = ImageDraw.Draw(im)
    for k in range(6):   # 흰 글씨 획 흉내 — 범위 전체에 걸친 가로 막대들
        d.rectangle((60 + k * 48, 80, 76 + k * 48, 84), fill=(255, 255, 255))   # 글자 획은 범위의 일부만 차지한다
        d.rectangle((66 + k * 48, 88, 70 + k * 48, 118), fill=(250, 250, 255))
    im.save(src)
    out = os.path.join(tmp, "out.png")
    r = subprocess.run([sys.executable, CROP, src, "0", "0", "100", "100", out, "--erase", "12,35,80,30"], capture_output=True, text=True, encoding="utf-8")
    assert r.returncode == 0, r.stderr
    print(r.stdout.strip().splitlines()[0])
    rect = (56, 76, 350, 122)
    w_new = worst(out, rect)
    # 음성 대조 — 예전 방식: 범위의 가장 많은 색 하나로 글자를 덮는다
    old = Image.open(src).convert("RGB")
    fill = face(200)
    for j in range(76, 122):
        for i in range(56, 350):
            if max(abs(a - b) for a, b in zip(old.getpixel((i, j)), face(i))) > 0:
                old.putpixel((i, j), fill)
    old_p = os.path.join(tmp, "old.png"); old.save(old_p)
    w_old = worst(old_p, rect)
    print(f"지운 자리 최대 색 차이: 새 방식 {w_new} / 예전 방식 {w_old}")
    assert w_old > 30, "음성 대조 실패 — 시험 그림이 그라데이션 얼룩을 만들지 못한다"
    assert w_new <= 12, f"지운 자리에 얼룩이 남음({w_new})"
    print("통과 그라데이션 위 글자 지우기(R137)")


if __name__ == "__main__":
    main()
