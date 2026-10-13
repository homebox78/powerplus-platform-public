# -*- coding: utf-8 -*-
"""운영체제마다 다른 것을 한곳에 — 엔진은 Windows(PowerPoint) 와 리눅스(LibreOffice) 어디서나 돈다.
  서체 목록·설치 · 프로세스 묶음 끊기 · claude 실행 파일 · soffice 위치
리눅스는 PowerPoint 대신 merge.py(python-pptx)·render_one.py / render_all.py / vcenter.py(LibreOffice)를 쓴다."""
import glob, os, re, shutil, signal, subprocess

IS_WIN = os.name == "nt"
HERE = os.path.dirname(os.path.abspath(__file__))
_KEY = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts"
LX_FONT_DIR = os.path.expanduser("~/.local/share/fonts/powerdeck")


def installed_fonts():
    """설치된 서체 {이름(소문자): 파일 경로} — Windows 는 레지스트리, 리눅스는 fontconfig(fc-list)"""
    return _win_fonts() if IS_WIN else _fc_fonts()


def _win_fonts():
    import winreg
    out = {}
    for root in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
        try:
            k = winreg.OpenKey(root, _KEY)
        except OSError:
            continue
        i = 0
        while True:
            try:
                name, val, _ = winreg.EnumValue(k, i)
            except OSError:
                break
            i += 1
            path = val if os.path.isabs(val) else os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", val)
            out[re.sub(r"\s*\((TrueType|OpenType)\)$", "", name).strip().lower()] = path
    return out


def _fc_fonts():
    """fc-list 의 모든 이름(언어별 가족 이름·전체 이름·가족+굵기)을 열쇠로. 같은 이름이면 먼저 나온 파일"""
    try:
        r = subprocess.run(["fc-list", "-f", "%{family}\t%{style}\t%{fullname}\t%{file}\n"], capture_output=True, text=True, encoding="utf-8", timeout=60)
    except (OSError, subprocess.TimeoutExpired):
        return {}
    out = {}
    for ln in r.stdout.splitlines():
        p = ln.split("\t")
        if len(p) != 4:
            continue
        fams, styles, fulls, path = p[0].split(","), p[1].split(","), p[2].split(","), p[3]
        names = [n.strip() for n in fulls if n.strip()]
        for f in (x.strip() for x in fams if x.strip()):
            for s in (x.strip() for x in styles if x.strip()):
                names.append(f if s.lower() in ("regular", "normal", "book") else f"{f} {s}")
            names.append(f)
        for n in names:
            out.setdefault(n.lower(), path)
    for alias, fn in ALIASES.items():   # 장표가 쓰는 한글 이름 → 실제 파일(fontconfig 별칭과 같은 짝)
        p = os.path.join(LX_FONT_DIR, fn)
        if os.path.isfile(p):
            out.setdefault(alias.lower(), p)
    return out


# 장표가 이 이름으로 부르지만 서체 파일 안 이름과 다른 것 — Windows 는 레지스트리 이름, 리눅스는 fontconfig 별칭으로 맞춘다
ALIASES = {"G마켓 산스 TTF Bold": "GmarketSansTTFBold.ttf", "G마켓 산스 TTF Medium": "GmarketSansTTFMedium.ttf",
           "G마켓 산스 TTF Light": "GmarketSansTTFLight.ttf"}
# 리눅스에 없는 MS 서체 → 비슷한 오픈 서체(fonts-noto-cjk / fonts-nanum). 원본 장표의 맑은 고딕 등
SUBST = {"맑은 고딕": "Noto Sans CJK KR", "Malgun Gothic": "Noto Sans CJK KR", "굴림": "NanumGothic", "Gulim": "NanumGothic",
         "돋움": "NanumGothic", "Dotum": "NanumGothic", "바탕": "NanumMyeongjo", "Batang": "NanumMyeongjo",
         "궁서": "NanumMyeongjo", "Arial": "Liberation Sans", "Calibri": "Carlito", "Cambria": "Caladea",
         "Times New Roman": "Liberation Serif", "Courier New": "Liberation Mono", "Segoe UI": "Noto Sans"}


def install_fonts_linux(files):
    """서체 파일을 ~/.local/share/fonts/powerdeck 에 두고, 한글 이름 별칭·MS 서체 대체를 fontconfig 에 적은 뒤 fc-cache.
    고친 것이 있으면 이름 목록을 돌려준다"""
    os.makedirs(LX_FONT_DIR, exist_ok=True)
    done = []
    for src in files:
        to = os.path.join(LX_FONT_DIR, os.path.basename(src))
        if not (os.path.isfile(to) and os.path.getsize(to) == os.path.getsize(src)):
            shutil.copy2(src, to)
            done.append(os.path.basename(src))
    conf_dir = os.path.expanduser("~/.config/fontconfig/conf.d")
    os.makedirs(conf_dir, exist_ok=True)
    conf = os.path.join(conf_dir, "60-powerdeck.conf")
    xml = _fontconfig_xml()
    if not os.path.isfile(conf) or open(conf, encoding="utf-8").read() != xml:
        open(conf, "w", encoding="utf-8").write(xml)
        done.append("fontconfig 별칭")
    if done:
        subprocess.run(["fc-cache", "-f"], capture_output=True, timeout=300)
    return done


def _fontconfig_xml():
    from xml.sax.saxutils import escape as e
    rows = []
    for alias, fn in ALIASES.items():   # 파일에 그 이름이 이미 있으면(G마켓 산스 TTF 는 있다) 별칭을 걸지 않는다 — 걸면 굵기를 잃는다
        fams = _families_of(os.path.join(LX_FONT_DIR, fn))
        if fams and alias not in fams:
            rows.append(f'  <match target="pattern"><test name="family"><string>{e(alias)}</string></test>'
                        f'<edit name="family" mode="assign" binding="same"><string>{e(fams[-1])}</string></edit></match>')
    for ms, sub in SUBST.items():
        rows.append(f'  <alias binding="same"><family>{e(ms)}</family><prefer><family>{e(sub)}</family></prefer></alias>')
    return '<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n' + "\n".join(rows) + "\n</fontconfig>\n"


def _families_of(path):
    """서체 파일의 가족 이름들(언어별·굵기 붙은 옛 이름 포함) — 마지막이 가장 구체적인 이름"""
    try:
        r = subprocess.run(["fc-scan", "--format", "%{family}", path], capture_output=True, text=True, encoding="utf-8", timeout=30)
        return [x.strip() for x in r.stdout.split(",") if x.strip()]
    except (OSError, subprocess.TimeoutExpired):
        return []


def popen_group():
    """자식까지 한 묶음으로 끊을 수 있게 새 프로세스 묶음으로 띄우는 Popen 인자"""
    return {"creationflags": getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)} if IS_WIN else {"start_new_session": True}


def kill_tree(pid):
    """프로세스와 그 자식(claude 가 띄운 python·soffice 등)을 모두 끊는다"""
    if IS_WIN:
        subprocess.run(["taskkill", "/T", "/F", "/PID", str(pid)], capture_output=True)
        return
    try:
        os.killpg(os.getpgid(pid), signal.SIGTERM)
    except (ProcessLookupError, PermissionError, OSError):
        return
    for _ in range(20):   # 2초 기다렸다가 남은 것은 강제로
        try:
            os.killpg(os.getpgid(pid), 0)
        except (ProcessLookupError, OSError):
            return
        import time
        time.sleep(0.1)
    try:
        os.killpg(os.getpgid(pid), signal.SIGKILL)
    except (ProcessLookupError, OSError):
        pass


def claude_fallbacks():
    """PATH 에서 못 찾을 때 볼 claude 실행 파일 자리"""
    h = os.path.expanduser("~")
    if IS_WIN:
        return [os.path.join(h, ".local", "bin", "claude.exe"),
                os.path.join(os.environ.get("APPDATA", ""), "npm", "claude.cmd"),
                os.path.join(h, "AppData", "Roaming", "npm", "claude.cmd")]
    return [os.path.join(h, ".local", "bin", "claude"), os.path.join(h, ".claude", "local", "claude"),
            "/usr/local/bin/claude", "/usr/bin/claude"] + sorted(glob.glob(os.path.join(h, ".nvm", "versions", "node", "*", "bin", "claude")))


def soffice():
    """LibreOffice 실행 파일 — 환경변수 SOFFICE → PATH → 흔한 자리"""
    for c in (os.environ.get("SOFFICE"), shutil.which("soffice"), shutil.which("libreoffice"),
              "/usr/bin/soffice", "/usr/lib/libreoffice/program/soffice", "/opt/libreoffice/program/soffice",
              r"C:\Program Files\LibreOffice\program\soffice.exe", r"C:\lo_test\app\program\soffice.exe"):
        if c and os.path.isfile(c):
            return c
    raise RuntimeError("LibreOffice(soffice)를 찾지 못했습니다 — 리눅스: sudo apt install libreoffice-impress")
