# -*- coding: utf-8 -*-
"""한글이 되는 서체 파일 경로 — 번호 시트·컨택트시트 글자용(윈도우 C:/Windows/Fonts/malgun.ttf 대신).
윈도우면 맑은 고딕, 리눅스면 엔진이 깐 본문 서체(fontset.file) → 시스템 한글 서체(fc-match) 순."""
import os, subprocess

_WIN = {False: "C:/Windows/Fonts/malgun.ttf", True: "C:/Windows/Fonts/malgunbd.ttf"}


def kfont(bold=False):
    p = _WIN[bool(bold)]
    if os.path.isfile(p):
        return p
    try:
        import fontset
        p = fontset.file(3 if bold else 1)
        if p and os.path.isfile(p):
            return p
    except Exception:
        pass
    try:
        out = subprocess.run(["fc-match", "-f", "%{file}", "sans:lang=ko" + (":bold" if bold else "")],
                             capture_output=True, text=True, timeout=10).stdout.strip()
        if out and os.path.isfile(out):
            return out
    except Exception:
        pass
    raise FileNotFoundError("한글 서체를 찾지 못했습니다 — 엔진 서체 설치(fonts_install.py)를 먼저 돌려 주세요")
