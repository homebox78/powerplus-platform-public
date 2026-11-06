# -*- coding: utf-8 -*-
"""앞장 배경 그림 기준(design.bg_look) — 사용자 배경 프롬프트 모음(docs/발표장표_배경이미지_프롬프트_모음.md)을 덱 타입에 맞게 붙이는지.
음성 대조: E(아이소메트릭 3D)의 화풍 문구에는 'illustration' 이 들어 있어, 낱말만 보면 일러스트(공통만)로 잘못 갈린다."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import design

E = {"id": "e", "front": "Clean premium LIGHT-THEME 3D ISOMETRIC ACRYLIC illustration, high-end product-render quality"}
B = {"id": "b", "body_photo": "strong", "front": "BRIGHT PHOTOREALISTIC KEY VISUAL (nano banana)"}
A = {"id": "a", "front": "Pictures on cover / contents / divider pages: a flat vector illustration with thin outlines"}
F = {"id": "f", "front": "Solid deep color block: ONE flat solid DEEP COBALT BLUE page; a thin-outline flat vector illustration"}

assert "illustration" in E["front"].lower(), "음성 대조 입력이 바뀌었다"
for st, want, name in ((E, design.BG_3D, "E 3D"), (B, design.BG_PHOTO, "B 실사")):
    got = design.bg_look(st)
    assert design.BG_COMMON in got and want in got, f"실패 {name}: 기준이 붙지 않음"
for st, name in ((A, "A 플랫"), (F, "F 딥 컬러")):
    got = design.bg_look(st)
    assert got == design.BG_COMMON, f"실패 {name}: 공통 규칙만이어야 함"
for w in ("ABSOLUTELY NO TEXT", "No purple or violet", "never $", "Korean", "never a collage"):
    assert w in design.BG_COMMON, f"실패 공통 규칙에 '{w}' 없음"
print("통과 배경 그림 기준 — 타입별 실사·3D·공통")
