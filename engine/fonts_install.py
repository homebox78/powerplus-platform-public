# -*- coding: utf-8 -*-
"""worker/fonts 의 서체(제목: G마켓 산스·페이퍼로지·플라이트 산스·하나서체 / 본문: 프리텐다드·에스코어드림·원티드 산스, 대체 Asta Sans)를
이 PC 사용자 계정에 설치한다. 이미 있으면 건너뛴다. 출처·라이선스는 fonts/licenses/README.md
리눅스는 ~/.local/share/fonts/powerdeck + fontconfig 별칭(한글 이름·맑은 고딕 대체) — osdep.install_fonts_linux
워커가 시작할 때 한 번 부른다. 직접 실행: python fonts_install.py"""
import glob, os, shutil, sys
import osdep

HERE = os.path.dirname(os.path.abspath(__file__))
KEY = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts"


# 한글 이름으로 등록해야 하는 서체 — 장표와 마무리 도구가 이 이름으로 찾는다
NAMES = {fn: name for name, fn in osdep.ALIASES.items()}


def face(path):
    """서체 파일의 전체 이름(name ID 4) — 레지스트리 표시 이름으로 쓴다"""
    if os.path.basename(path) in NAMES:
        return NAMES[os.path.basename(path)]
    try:
        from PIL import ImageFont
        fam, style = ImageFont.truetype(path, 12).getname()
        return fam if style in ("Regular", "") or fam.endswith(style) else f"{fam} {style}"
    except Exception:
        return os.path.splitext(os.path.basename(path))[0]


def ensure():
    files = sorted(glob.glob(os.path.join(HERE, "fonts", "*.ttf")) + glob.glob(os.path.join(HERE, "fonts", "*.otf")))
    if not osdep.IS_WIN:
        return osdep.install_fonts_linux(files)
    import ctypes, winreg
    dst = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Windows", "Fonts")
    os.makedirs(dst, exist_ok=True)
    done = []
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, KEY) as k:
        for src in files:
            name, to = face(src) + (" (OpenType)" if src.lower().endswith(".otf") else " (TrueType)"), os.path.join(dst, os.path.basename(src))
            if os.path.isfile(to) and os.path.getsize(to) != os.path.getsize(src):   # 같은 파일 이름의 다른 서체(다른 판)가 이미 있다 — 따로 둔다
                to = os.path.join(dst, "pd_" + os.path.basename(src))
            try:
                if winreg.QueryValueEx(k, name)[0] == to and os.path.isfile(to):
                    continue
            except OSError:
                pass
            if not os.path.isfile(to):
                shutil.copy2(src, to)
            winreg.SetValueEx(k, name, 0, winreg.REG_SZ, to)
            ctypes.windll.gdi32.AddFontResourceW(to)
            done.append(name)
    if done:
        ctypes.windll.user32.SendMessageTimeoutW(0xFFFF, 0x001D, 0, 0, 2, 1000, None)   # WM_FONTCHANGE
    return done


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    print("설치:", ensure() or "이미 설치됨")
