# -*- coding: utf-8 -*-
"""웹 서체 고르기 견본 그림(apps/web/public/fonts/<title|body>-<id>.png)을 engine/fonts/fonts.json 대로 만든다.
기존 그림(title-gmarket.png 1200×220, body-pretendard.png 1200×330)과 같은 배치·색 — 2026-10-14 서체 목록 교체 때 만듦.
실행: python scripts/font-previews.py  (서체 파일은 engine/fonts)"""
import json, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FD = os.path.join(ROOT, "engine", "fonts")
OUT = os.path.join(ROOT, "apps", "web", "public", "fonts")
L = json.load(open(os.path.join(FD, "fonts.json"), encoding="utf-8"))
TRACK = -0.015   # engine/fontset.py TITLE_TRACK
NAVY, PINK, GRAY, BLUE, INK = (11, 46, 107), (255, 42, 109), (107, 114, 128), (30, 64, 175), (31, 41, 55)
SUB = os.path.join(FD, "Pretendard-SemiBold.ttf")   # 제목 견본 아래 줄(본문 서체 자리)


def title(t):
    im = Image.new("RGB", (1200, 220), "white")
    d = ImageDraw.Draw(im)
    parts = [("심사는 빠르게, ", NAVY), ("의약품 AI", PINK), (" 심사 체계", NAVY)]
    size = round(60 * float(t.get("scale") or 1.0))   # 서체마다 덩어리감 보정(fonts.json title.scale) — 같은 크기로 보이게
    f = ImageFont.truetype(os.path.join(FD, t["file"]), size)
    w = sum(f.getlength(p) for p, _ in parts)
    tr = TRACK * size   # 제목 자간(엔진 fontset.TITLE_TRACK 과 같게) — 글자마다 간격을 줄여 찍는다
    w += tr * (sum(len(p) for p, _ in parts) - 1)
    x = (1200 - w) / 2
    for p, c in parts:
        for ch in p:
            d.text((x, 124), ch, font=f, fill=c, anchor="ls")
            x += f.getlength(ch) + tr
    d.text((42, 196), "PART 01  ·  목차  ·  사업 이해", font=ImageFont.truetype(SUB, 30), fill=GRAY, anchor="ls")
    im.save(os.path.join(OUT, f"title-{t['id']}.png"))


def body(b):
    im = Image.new("RGB", (1200, 330), "white")
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((31, 25, 1169, 305), radius=24, fill=(240, 245, 254), outline=(203, 213, 225), width=2)
    fs = [os.path.join(FD, x) for x in b["files"]]
    rows = [("추진 전략 01 · 표준 연계 허브", fs[3], 38, NAVY, 101), ("기관마다 다른 데이터를 하나의 기준으로", fs[2], 30, BLUE, 161),
            ("흩어진 관제 정보를 한 화면에서 보고 바로 대응합니다.", fs[1], 30, INK, 219), ("※ 2026년 1월 기준 · 출처: 사업계획서", fs[0], 24, GRAY, 272)]
    k = float(b.get("scale") or 1.0)   # 본문 서체 크기 보정(fonts.json body.scale)
    for t, f, s, c, y in rows:
        d.text((71, y), t, font=ImageFont.truetype(f, round(s * k)), fill=c, anchor="ls")
    im.save(os.path.join(OUT, f"body-{b['id']}.png"))


for t in L["title"]:
    title(t)
for b in L["body"]:
    body(b)
print("견본", len(L["title"]) + len(L["body"]), "장 →", OUT)
