# -*- coding: utf-8 -*-
"""한글이 되는 서체 파일 경로 — 번호 시트·컨택트시트 글자용(윈도우 C:/Windows/Fonts/malgun.ttf 대신).
윈도우면 맑은 고딕, 리눅스면 엔진이 깐 본문 서체(fontset.file) → 시스템 한글 서체(fc-match) 순.
장표 언어가 한국어가 아니면(PD_LANG, 2026-10-18 언어별 서체) 시트 글에 한글 라벨과 그 언어 글이 섞인다 —
리눅스는 fc-match 'sans:lang=<언어>'(Noto Sans CJK 한 벌이 한글·가나·한자를 다 가진다, scripts/fontconfig 가 언어마다 먼저 쓰게 한다)를 먼저 쓴다."""
import os, subprocess

_WIN = {False: "C:/Windows/Fonts/malgun.ttf", True: "C:/Windows/Fonts/malgunbd.ttf"}
FC_LANG = {"ko": "ko", "ja": "ja", "zh": "zh-cn", "en": "en", "fr": "fr", "es": "es", "de": "de", "vi": "vi"}   # fontconfig 언어 이름


def _fc(lang, bold):
    try:
        out = subprocess.run(["fc-match", "-f", "%{file}", f"sans:lang={FC_LANG.get(lang, 'ko')}" + (":bold" if bold else "")],
                             capture_output=True, text=True, timeout=10).stdout.strip()
        return out if out and os.path.isfile(out) else None
    except Exception:
        return None


def kfont(bold=False):
    p = _WIN[bool(bold)]
    if os.path.isfile(p):
        return p
    lang = os.environ.get("PD_LANG") or "ko"
    if lang != "ko":   # 한글 라벨 + 그 언어 글 — 둘 다 있는 시스템 CJK 서체
        p = _fc(lang, bold)
        if p:
            return p
    try:
        import fontset
        p = fontset.file(3 if bold else 1)
        if p and os.path.isfile(p):
            return p
    except Exception:
        pass
    p = _fc("ko", bold)
    if p:
        return p
    raise FileNotFoundError("한글 서체를 찾지 못했습니다 — 엔진 서체 설치(fonts_install.py)를 먼저 돌려 주세요")
