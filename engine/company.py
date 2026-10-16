# -*- coding: utf-8 -*-
"""타입 G — 회사소개서 덱(16:9). 제안서 발표 장표가 아니라 회사를 소개하는 덱 — 글·숫자를 크고 과감하게 쓴다(사용자 2026-10-16).
흐름: 자료 → AI 가 정해진 레이아웃 카탈로그(LAYOUTS)에 글만 채운다 → 코드로 짠 HTML(1920×1080)로 렌더 → 같은 DOM 을 재서 PPTX 로 옮긴다.
  - 글(data-x=t)·카드(data-x=r)·그림(data-x=i)은 PowerPoint 진짜 글상자·도형·그림으로 — 받은 사람이 고칠 수 있다.
    글은 브라우저가 줄을 바꾼 자리에서 그대로 줄을 나눠 넣는다(줄바꿈이 PowerPoint 에서 달라지지 않게).
  - 빛·그라데이션·격자·큰 바탕 글자 같은 꾸밈은 위 요소를 숨기고 찍은 배경 그림으로 굳힌다 — 화면은 HTML 그대로.
그림 모델로 쪽 시안을 그리지 않는다(세로 제안서처럼 시안 확인 없이 PPT 를 바로 만든다). 그림은 powerAssets(아이콘 세트)에서 고른다.
참고: design/type g sample(evolve·trialo 웹 덱 — HTML 덱을 PDF 로 뽑던 방식), design/ppt sample/ref_025·042·058·204(파랑 기업 덱)."""
import base64, html, io, json, os, re, time

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(HERE, "fonts")
W_PX, H_PX = 1920, 1080
EMU = 12192000 // W_PX   # 1px = 6350 EMU (13.333in 폭)
PT = 0.5                 # 1px = 0.5pt
# 굵기 → 서체 이름(굵기마다 서체가 따로다 — PowerPoint 는 bold 속성 하나뿐이라 이름으로 가른다). HTML 도 같은 파일을 쓴다
FACES = {200: ("Pretendard ExtraLight", "Pretendard-ExtraLight.ttf"), 400: ("Pretendard", "Pretendard-Regular.ttf"),
         600: ("Pretendard SemiBold", "Pretendard-SemiBold.ttf"), 800: ("Pretendard ExtraBold", "Pretendard-ExtraBold.ttf"),
         900: ("Pretendard Black", "Pretendard-Black.ttf")}
ICON_SET = "icon-flat-blue-glass"   # 세로 제안서 본문과 같은 세트 — 파랑 유리 아이콘(투명 배경)

# ───────────────────────── 테마(파랑 기업 덱) — 색은 여기 한 곳
THEME = {"blue": "#1F4FFF", "blue2": "#3D7BFF", "sky": "#DCE6FF", "navy": "#050B24", "navy2": "#0B1A4A",
         "ink": "#0B1324", "body": "#3E4A60", "muted": "#7A8499", "line": "#E2E7F1", "paper": "#F3F6FC"}

# ───────────────────────── 레이아웃 카탈로그 — AI 가 고르는 칸(글자 수 한도는 화면에 들어가는 길이)
LAYOUTS = {
    "cover": "표지(어두운 바탕). eyebrow(영문 대문자 20자) · title(2~3줄, 줄마다 12자 이내, 과감한 한 문장 — 회사의 약속) · sub(40자) · date(예 2026.10)",
    "contents": "목차. items: 장 이름 4~6개(각 12자) — 뒤에 오는 section 쪽과 같은 이름·순서",
    "statement": "한 문장 선언(밝은 바탕). eyebrow · headline(2줄, 줄마다 18자, 강조 1곳 **…**) · sub(2문장, 각 45자) · word(바탕에 크게 까는 영문 한 단어, 예 WHO WE ARE)",
    "stats": "숫자가 주인공. eyebrow · headline(1줄 24자, 강조 1곳) · items 3~4개: value(숫자만, 예 1998·700·300) · unit(년·억·명·%) · label(10자) · note(18자)",
    "pillars": "핵심 역량 카드. eyebrow · headline(1줄 24자, 강조 1곳) · sub(45자) · items 3~4개: title(12자) · desc(2줄, 줄마다 22자) · icon(아이콘 검색어 한국어 1~2낱말)",
    "history": "연혁 가로 타임라인. eyebrow · headline(1줄 24자, 강조 1곳) · items 5~7개(오래된 것부터): year(4자리) · text(2줄, 줄마다 14자)",
    "section": "간지(어두운 바탕). no(01·02…) · title(10자) · sub(32자) · icon(검색어)",
    "services": "사업·제품 카드. eyebrow · headline(1줄 24자, 강조 1곳) · items 2~4개: tag(영문 12자) · name(10자) · desc(2줄, 줄마다 22자) · points 3개(각 12자)",
    "showcase": "대표 사례·제품 한 개. eyebrow · name(8자, 크게) · tagline(22자) · desc(2문장, 각 40자) · url · items 3~4개: title(12자) · desc(16자)",
    "clients": "고객·서비스 이름 그리드. eyebrow · headline(1줄 24자, 강조 1곳) · sub(45자) · items 8~24개(이름만, 각 10자)",
    "awards": "수상·인증 목록. eyebrow · headline(1줄 24자, 강조 1곳) · items 6~12개: year · text(30자)",
    "vision": "비전 한 문장(파랑 바탕). eyebrow · quote(2~3줄, 줄마다 16자, 강조 1곳) · by(20자)",
    "contact": "연락처(어두운 바탕). headline(2줄, 줄마다 16자) · company · rows: label·value 3~5개(주소·대표전화·이메일·웹사이트) · offices 0~4개: name · addr(30자)",
}

PLAN_SYSTEM = """너는 국내 IT·SI 기업의 회사소개서를 만드는 카피라이터 겸 아트디렉터다. 제안서가 아니라 '회사를 처음 보는 사람에게 소개하는' 덱이다.
쪽마다 아래 레이아웃 중 하나를 고르고 칸에 글만 채운다. 디자인은 코드가 한다 — 너는 글의 힘과 순서만 책임진다.

# 레이아웃(kind)과 칸
{layouts}

# 글쓰기
- 과감하게: 머리글은 짧고 단정하게 끝낸다(“~합니다”보다 “~한다.”·명사형·숫자 앞세우기). 형용사 나열 금지, 숫자와 고유명사로 말한다.
- 강조는 머리글마다 한 곳만 **…** 로 감싼다(색이 바뀐다). 나머지 칸에는 ** 를 쓰지 않는다.
- 칸마다 적힌 글자 수를 넘기지 않는다 — 넘치면 화면에서 잘린다. 줄 수가 정해진 칸은 줄을 \\n 으로 나눈다(마침표에서 줄을 바꾸고, 낱말 중간에서 끊지 않는다).
- 자료에 없는 숫자·수상·고객을 지어내지 않는다. 모르면 그 쪽을 빼거나 숫자 없는 레이아웃을 고른다.
- eyebrow 는 영문 대문자 짧은 꼬리표(예 ABOUT US · BY THE NUMBERS · HISTORY · CORE WORKS · CONTACT).

# 구성
- 전체 {pages}쪽 안팎. 첫 쪽 cover, 둘째 쪽 contents, 마지막 쪽 contact.
- 장마다 section 간지로 연다(contents 의 이름과 같게). 같은 레이아웃을 세 번 연달아 쓰지 않는다.
- 회사 이야기 순서: 우리는 누구인가(statement·stats) → 무엇을 잘하나(pillars·services) → 해 온 일(showcase·clients·history·awards) → 비전(vision) → contact.

# 출력 — JSON 하나
{"company": {"name": "회사 이름(예 ㈜솔리데오)", "short": "영문 짧은 이름", "website": "", "tagline": "회사 한 줄 소개 30자"},
 "slides": [{"kind": "cover", ...칸}, ...]}"""


# ───────────────────────── HTML
def _font_css():
    out = []
    for w, (_, f) in FACES.items():
        p = os.path.join(FONT_DIR, f).replace("\\", "/")
        out.append(f"@font-face{{font-family:'PD';src:url('file:///{p}');font-weight:{w};font-display:block}}")
    return "\n".join(out)


CSS = """
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1920px;height:1080px;overflow:hidden;background:#fff}
.s{position:relative;width:1920px;height:1080px;overflow:hidden;font-family:'PD',sans-serif;color:var(--ink);background:#fff;word-break:keep-all;overflow-wrap:break-word;letter-spacing:-0.02em}
.s.dark{background:var(--navy);color:#fff}
.s.blue{background:var(--blue);color:#fff}
.deco{position:absolute;inset:0;pointer-events:none}
.abs{position:absolute}
.eb{font-size:22px;font-weight:800;letter-spacing:.16em;color:var(--blue);text-transform:uppercase}
.dark .eb,.blue .eb{color:var(--blue2)}
.blue .eb{color:#BFD0FF}
.h{font-size:64px;font-weight:900;line-height:1.18;letter-spacing:-0.045em;color:var(--ink)}
.dark .h,.blue .h{color:#fff}
em{font-style:normal;color:var(--blue)}
.dark em{color:var(--blue2)}
.blue em{color:#9FE0FF}
.sub{font-size:27px;font-weight:400;line-height:1.55;color:var(--body);letter-spacing:-0.02em}
.dark .sub,.blue .sub{color:rgba(255,255,255,.72)}
.card{position:absolute;background:#fff;border:2px solid var(--line);border-radius:28px;box-shadow:0 18px 40px -22px rgba(15,35,95,.28)}
.chip{position:absolute;background:#fff;border:2px solid var(--line);border-radius:18px}
/* 머리·바닥(장 꼬리표·쪽 번호·로고) */
.logo{position:absolute;left:120px;top:56px;height:44px}
.wm{position:absolute;left:120px;top:58px;font-size:26px;font-weight:900;letter-spacing:-0.03em;color:var(--ink)}
.dark .wm,.blue .wm{color:#fff}
.tag{position:absolute;right:120px;top:64px;font-size:19px;font-weight:600;letter-spacing:.14em;color:var(--muted);text-transform:uppercase;text-align:right}
.dark .tag,.blue .tag{color:rgba(255,255,255,.55)}
.pg{position:absolute;right:120px;bottom:52px;font-size:19px;font-weight:800;color:var(--muted);letter-spacing:.08em}
.dark .pg,.blue .pg{color:rgba(255,255,255,.55)}
"""


def _vars():
    return ":root{" + ";".join(f"--{k}:{v}" for k, v in THEME.items()) + "}"


def _rich(s):
    """**강조** → <em>, 줄바꿈 \\n → <br>. 나머지는 이스케이프"""
    s = html.escape(str(s or "")).replace("\\n", "\n")
    s = re.sub(r"\*\*(.+?)\*\*", r"<em>\1</em>", s)
    return s.replace("*", "").replace("\n", "<br>")


def _plain(s):
    return html.escape(re.sub(r"\*\*", "", str(s or "")).replace("\\n", "\n")).replace("\n", "<br>")


def T(text, cls="", style="", rich=True, fit=False, raw=False):
    """글 요소 — data-x=t 는 PPT 글상자가 된다. fit 이면 상자를 넘칠 때 글자를 줄인다(높이·폭이 정해진 상자). raw = 이미 만든 HTML(이스케이프 끝난 것)"""
    body = text if raw else (_rich(text) if rich else _plain(text))
    return f'<div data-x="t"{" data-fit=1" if fit else ""} class="abs {cls}" style="{style}">{body}</div>'


def R(style, cls="card"):
    return f'<div data-x="r" class="{cls}" style="{style}"></div>'


def I(src, style):
    return f'<img data-x="i" class="abs" src="{html.escape(src)}" style="object-fit:contain;{style}">' if src else ""


def _chrome(d, n, total, tag):
    logo = d.get("_logo_dark" if d.get("_tone") in ("dark", "blue") else "_logo")
    head = (f'<img data-x="i" class="logo" src="{html.escape(logo)}" style="object-fit:contain;width:260px;object-position:left center">' if logo
            else T(d.get("_short") or d.get("_company") or "", "wm"))
    return head + (T(tag, "tag") if tag else "") + T(f"{n:02d}", "pg")


GLOW_DARK = ("<div class='deco' style=\"background:radial-gradient(1100px 760px at 78% 46%,rgba(31,79,255,.55),transparent 62%),"
             "radial-gradient(700px 520px at 104% 100%,rgba(61,123,255,.45),transparent 60%),"
             "radial-gradient(900px 600px at -6% 110%,rgba(31,79,255,.22),transparent 60%),linear-gradient(160deg,#0A1440 0%,#050B24 55%,#040817 100%)\"></div>"
             "<div class='deco' style=\"opacity:.10;background-image:linear-gradient(rgba(255,255,255,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.6) 1px,transparent 1px);"
             "background-size:96px 96px;mask-image:radial-gradient(900px 700px at 75% 45%,#000,transparent 75%)\"></div>")
GLOW_LIGHT = ("<div class='deco' style=\"background:radial-gradient(900px 620px at 100% 0%,rgba(61,123,255,.16),transparent 65%),"
              "radial-gradient(700px 520px at 0% 100%,rgba(31,79,255,.07),transparent 60%),#fff\"></div>")
GLOW_BLUE = ("<div class='deco' style=\"background:radial-gradient(1000px 700px at 85% 20%,rgba(120,170,255,.65),transparent 60%),"
             "radial-gradient(900px 700px at 0% 100%,rgba(5,20,120,.55),transparent 60%),linear-gradient(135deg,#2A5BFF,#1436D8)\"></div>")


def _hero(src, x, y, size):
    """아이콘 그림을 크게 + 뒤에 빛(꾸밈은 배경으로 굳는다)"""
    if not src:
        return ""
    glow = (f"<div class='deco' style=\"left:{x - size * .35}px;top:{y - size * .35}px;width:{size * 1.7}px;height:{size * 1.7}px;right:auto;bottom:auto;"
            f"background:radial-gradient(closest-side,rgba(61,123,255,.55),transparent);filter:blur(10px)\"></div>")
    return glow + I(src, f"left:{x}px;top:{y}px;width:{size}px;height:{size}px")


def _bigword(word, dark=False):
    if not word:
        return ""
    c = "rgba(255,255,255,.06)" if dark else "rgba(31,79,255,.055)"
    return (f"<div class='deco' style=\"top:auto;bottom:-70px;left:90px;font-size:300px;font-weight:900;letter-spacing:-0.05em;line-height:1;color:{c};"
            f"white-space:nowrap\">{html.escape(str(word).upper())}</div>")


# 레이아웃 함수 — (톤, 몸통 HTML). 좌표는 1920×1080 기준 절대 위치(넘침은 data-fit 이 줄인다)
def L_cover(d):
    t = (T(d.get("eyebrow") or "COMPANY PROFILE", "eb", "left:120px;top:300px")
         + T(d.get("title"), "h", "left:120px;top:350px;width:1050px;height:440px;font-size:132px;line-height:1.04;letter-spacing:-0.055em", fit=True)
         + T(d.get("sub"), "sub", "left:124px;top:806px;width:980px;font-size:32px", rich=False)
         + R("left:124px;top:930px;width:64px;height:4px;background:var(--blue2);border:0;border-radius:2px;box-shadow:none")
         + T(d.get("date") or time.strftime("%Y.%m"), "", "left:212px;top:912px;font-size:26px;font-weight:600;color:rgba(255,255,255,.7);letter-spacing:.06em", rich=False))
    return "dark", GLOW_DARK + _hero(d.get("_img"), 1180, 230, 620) + t


def L_contents(d):
    items = [x for x in (d.get("items") or []) if str(x).strip()][:6]
    out = T("CONTENTS", "h", "left:120px;top:200px;font-size:120px;line-height:1;letter-spacing:-0.05em", rich=False)
    out += T(d.get("sub") or "", "sub", "left:124px;top:350px;width:560px", rich=False)
    n = max(1, len(items))
    gap = min(130, 640 // n)
    for i, it in enumerate(items):
        y = 230 + i * gap
        out += T(f"{i + 1:02d}", "", f"left:860px;top:{y}px;font-size:56px;font-weight:900;color:var(--blue);letter-spacing:-0.03em;line-height:1", rich=False)
        out += T(it, "", f"left:1000px;top:{y + 4}px;width:800px;font-size:46px;font-weight:800;line-height:1.1;letter-spacing:-0.04em", rich=False)
        if i < n - 1:
            out += R(f"left:860px;top:{y + gap - 30}px;width:940px;height:2px;background:var(--line);border:0;border-radius:0;box-shadow:none")
    return "light", GLOW_LIGHT + out


def L_statement(d):
    return "light", (GLOW_LIGHT + _bigword(d.get("word"))
                     + T(d.get("eyebrow"), "eb", "left:120px;top:250px", rich=False)
                     + T(d.get("headline"), "h", "left:120px;top:300px;width:1680px;height:270px;font-size:96px;line-height:1.16;letter-spacing:-0.05em", fit=True)
                     + R("left:124px;top:610px;width:120px;height:8px;background:var(--blue);border:0;border-radius:4px;box-shadow:none")
                     + T(d.get("sub"), "sub", "left:124px;top:660px;width:1300px;height:150px;font-size:31px", rich=False, fit=True))


def _head(d, top=170, width=1680):
    return (T(d.get("eyebrow"), "eb", f"left:120px;top:{top}px", rich=False)
            + T(d.get("headline"), "h", f"left:120px;top:{top + 44}px;width:{width}px;height:84px;white-space:nowrap", fit=True))


def L_stats(d):
    items = (d.get("items") or [])[:4]
    n = max(1, len(items))
    cw = 1680 // n
    out = GLOW_LIGHT + _head(d, 200)
    for i, it in enumerate(items):
        x = 120 + i * cw
        if i:
            out += R(f"left:{x}px;top:480px;width:2px;height:330px;background:var(--line);border:0;border-radius:0;box-shadow:none")
        px = x + (0 if not i else 56)
        out += T(it.get("label"), "", f"left:{px}px;top:470px;width:{cw - 70}px;font-size:28px;font-weight:800;color:var(--ink)", rich=False)
        val = html.escape(str(it.get("value") or "")) + (f"<span style='font-size:52px;letter-spacing:-0.02em'> {html.escape(str(it.get('unit')))}</span>" if it.get("unit") else "")
        out += T(val, "", f"left:{px - 4}px;top:540px;width:{cw - 60}px;height:170px;font-size:150px;font-weight:900;line-height:1.1;color:var(--blue);letter-spacing:-0.06em;white-space:nowrap", fit=True, raw=True)
        out += T(it.get("note"), "", f"left:{px}px;top:740px;width:{cw - 80}px;font-size:23px;line-height:1.5;color:var(--muted)", rich=False)
    return "light", out


def L_pillars(d):
    items = (d.get("items") or [])[:4]
    n = max(1, len(items))
    gap = 32
    cw = (1680 - gap * (n - 1)) // n
    out = GLOW_LIGHT + _head(d, 150)
    out += T(d.get("sub"), "sub", "left:120px;top:290px;width:1500px", rich=False)
    for i, it in enumerate(items):
        x = 120 + i * (cw + gap)
        out += R(f"left:{x}px;top:410px;width:{cw}px;height:540px")
        out += T(f"{i + 1:02d}", "", f"left:{x + 44}px;top:456px;font-size:30px;font-weight:900;color:var(--blue);letter-spacing:.02em", rich=False)
        out += I(it.get("_img"), f"left:{x + cw - 44 - 150}px;top:440px;width:150px;height:150px")
        out += T(it.get("title"), "", f"left:{x + 44}px;top:640px;width:{cw - 88}px;height:100px;font-size:40px;font-weight:900;line-height:1.2;letter-spacing:-0.04em", rich=False, fit=True)
        out += T(it.get("desc"), "", f"left:{x + 44}px;top:770px;width:{cw - 88}px;height:150px;font-size:24px;line-height:1.55;color:var(--body)", rich=False, fit=True)
    return "light", out


def L_history(d):
    items = (d.get("items") or [])[:7]
    n = max(1, len(items))
    cw = 1680 // n
    out = GLOW_LIGHT + _head(d, 170)
    out += R("left:120px;top:560px;width:1680px;height:4px;background:var(--sky);border:0;border-radius:2px;box-shadow:none")
    for i, it in enumerate(items):
        x = 120 + i * cw
        last = i == n - 1
        out += R(f"left:{x}px;top:{551}px;width:22px;height:22px;background:{'var(--blue)' if last else '#fff'};border:5px solid var(--blue);border-radius:11px;box-shadow:none")
        out += T(it.get("year"), "", f"left:{x}px;top:430px;font-size:{64 if last else 52}px;font-weight:900;letter-spacing:-0.04em;color:{'var(--blue)' if last else 'var(--ink)'}", rich=False)
        out += T(it.get("text"), "", f"left:{x}px;top:620px;width:{cw - 30}px;height:220px;font-size:24px;line-height:1.5;color:var(--body)", rich=False, fit=True)
    return "light", out


def L_section(d):
    return "dark", (GLOW_DARK + _hero(d.get("_img"), 1220, 260, 560)
                    + T(d.get("no") or "", "", "left:116px;top:250px;font-size:220px;font-weight:900;line-height:1;letter-spacing:-0.06em;color:var(--blue2)", rich=False)
                    + T(d.get("title"), "h", "left:120px;top:520px;width:1000px;height:130px;font-size:110px;line-height:1.1;letter-spacing:-0.05em", rich=False, fit=True)
                    + T(d.get("sub"), "sub", "left:124px;top:690px;width:900px;font-size:32px", rich=False))


def L_services(d):
    items = (d.get("items") or [])[:4]
    n = max(1, len(items))
    gap = 32
    cols = 2 if n == 4 else n
    rows = 2 if n == 4 else 1
    cw = (1680 - gap * (cols - 1)) // cols
    ch = 300 if rows == 2 else 600
    out = GLOW_LIGHT + _head(d, 150)
    for i, it in enumerate(items):
        x = 120 + (i % cols) * (cw + gap)
        y = 330 + (i // cols) * (ch + gap)
        out += R(f"left:{x}px;top:{y}px;width:{cw}px;height:{ch}px")
        out += R(f"left:{x + 44}px;top:{y + 40}px;width:{max(120, 16 * len(str(it.get('tag') or '')) + 48)}px;height:44px;background:var(--sky);border:0;border-radius:22px;box-shadow:none", "chip")
        out += T(it.get("tag"), "", f"left:{x + 68}px;top:{y + 48}px;font-size:19px;font-weight:800;letter-spacing:.1em;color:var(--blue);text-transform:uppercase", rich=False)
        out += T(it.get("name"), "", f"left:{x + 44}px;top:{y + 108}px;width:{cw - 88}px;height:64px;font-size:50px;font-weight:900;letter-spacing:-0.045em;white-space:nowrap", rich=False, fit=True)
        out += T(it.get("desc"), "", f"left:{x + 44}px;top:{y + 186}px;width:{cw - 88 if rows == 2 else cw - 88}px;height:{80 if rows == 2 else 120}px;font-size:24px;line-height:1.55;color:var(--body)", rich=False, fit=True)
        pts = [p for p in (it.get("points") or []) if str(p).strip()][:3]
        if rows == 1:
            for k, p in enumerate(pts):
                py = y + 340 + k * 70
                out += R(f"left:{x + 44}px;top:{py - 18}px;width:{cw - 88}px;height:2px;background:var(--line);border:0;border-radius:0;box-shadow:none")
                out += R(f"left:{x + 44}px;top:{py + 14}px;width:12px;height:12px;background:var(--blue);border:0;border-radius:3px;box-shadow:none")
                out += T(p, "", f"left:{x + 74}px;top:{py}px;width:{cw - 130}px;font-size:25px;font-weight:600;white-space:nowrap", rich=False)
    return "light", out


def L_showcase(d):
    items = (d.get("items") or [])[:4]
    out = (GLOW_LIGHT + T(d.get("eyebrow") or "CORE WORKS", "eb", "left:120px;top:190px", rich=False)
           + T(d.get("name"), "h", "left:116px;top:236px;width:820px;height:150px;font-size:128px;line-height:1.1;letter-spacing:-0.06em;white-space:nowrap", rich=False, fit=True)
           + T(d.get("tagline"), "", "left:120px;top:410px;width:820px;font-size:38px;font-weight:800;color:var(--blue);letter-spacing:-0.035em", rich=False)
           + T(d.get("desc"), "sub", "left:120px;top:490px;width:780px;height:220px", rich=False, fit=True)
           + T(d.get("url") or "", "", "left:120px;top:760px;font-size:24px;font-weight:600;color:var(--muted);letter-spacing:.02em", rich=False))
    gap = 28
    cw, chh = (820 - gap) // 2, (640 - gap) // 2
    for i, it in enumerate(items):
        x = 980 + (i % 2) * (cw + gap)
        y = 200 + (i // 2) * (chh + gap)
        first = i == 0
        out += R(f"left:{x}px;top:{y}px;width:{cw}px;height:{chh}px" + (";background:var(--blue);border-color:var(--blue);box-shadow:0 30px 60px -30px rgba(31,79,255,.6)" if first else ""))
        out += T(f"{i + 1:02d}", "", f"left:{x + 40}px;top:{y + 40}px;font-size:26px;font-weight:900;color:{'#BFD0FF' if first else 'var(--blue)'}", rich=False)
        out += T(it.get("title"), "", f"left:{x + 40}px;top:{y + chh - 176}px;width:{cw - 80}px;height:96px;font-size:38px;font-weight:900;line-height:1.2;letter-spacing:-0.04em;color:{'#fff' if first else 'var(--ink)'}", rich=False, fit=True)
        out += T(it.get("desc"), "", f"left:{x + 40}px;top:{y + chh - 68}px;width:{cw - 80}px;height:34px;font-size:22px;line-height:1.45;color:{'rgba(255,255,255,.8)' if first else 'var(--muted)'};white-space:nowrap", rich=False, fit=True)
    return "light", out


def L_clients(d):
    items = [str(x) for x in (d.get("items") or []) if str(x).strip()][:24]
    n = max(1, len(items))
    cols = 6 if n > 12 else 4
    rows = (n + cols - 1) // cols
    gap = 20
    cw = (1680 - gap * (cols - 1)) // cols
    chh = min(120, (560 - gap * (rows - 1)) // max(1, rows))
    out = GLOW_LIGHT + _head(d, 150) + T(d.get("sub"), "sub", "left:120px;top:290px;width:1500px", rich=False)
    for i, it in enumerate(items):
        x = 120 + (i % cols) * (cw + gap)
        y = 400 + (i // cols) * (chh + gap)
        out += R(f"left:{x}px;top:{y}px;width:{cw}px;height:{chh}px", "chip")
        out += T(it, "", f"left:{x + 16}px;top:{y + chh / 2 - 19}px;width:{cw - 32}px;height:40px;font-size:28px;font-weight:800;text-align:center;letter-spacing:-0.03em;white-space:nowrap", rich=False, fit=True)
    return "light", out


def L_awards(d):
    items = (d.get("items") or [])[:12]
    half = (len(items) + 1) // 2
    out = GLOW_LIGHT + _head(d, 150)
    for i, it in enumerate(items):
        col, row = (0, i) if i < half else (1, i - half)
        x = 120 + col * 860
        y = 330 + row * min(100, 600 // max(1, half))
        out += R(f"left:{x}px;top:{y - 18}px;width:800px;height:2px;background:var(--line);border:0;border-radius:0;box-shadow:none")
        out += T(it.get("year"), "", f"left:{x}px;top:{y + 4}px;font-size:30px;font-weight:900;color:var(--blue);letter-spacing:-0.02em", rich=False)
        out += T(it.get("text"), "", f"left:{x + 130}px;top:{y + 6}px;width:670px;height:40px;font-size:26px;font-weight:600;white-space:nowrap", rich=False, fit=True)
    return "light", out


def L_vision(d):
    return "blue", (GLOW_BLUE + _bigword(d.get("word") or "VISION", dark=True)
                    + T(d.get("eyebrow") or "VISION", "eb", "left:120px;top:270px", rich=False)
                    + T(d.get("quote"), "h", "left:120px;top:320px;width:1680px;height:390px;font-size:104px;line-height:1.16;letter-spacing:-0.055em", fit=True)
                    + T(d.get("by"), "", "left:124px;top:760px;font-size:28px;font-weight:600;color:rgba(255,255,255,.75)", rich=False))


def L_contact(d):
    rows = (d.get("rows") or [])[:5]
    offs = (d.get("offices") or [])[:4]
    out = GLOW_DARK + T(d.get("eyebrow") or "CONTACT", "eb", "left:120px;top:200px", rich=False)
    out += T(d.get("headline"), "h", "left:120px;top:246px;width:900px;height:240px;font-size:84px;line-height:1.16", fit=True)
    out += T(d.get("company") or d.get("_company") or "", "", "left:1060px;top:250px;font-size:40px;font-weight:900;letter-spacing:-0.03em", rich=False)
    for i, r in enumerate(rows):
        y = 330 + i * 62
        out += T(r.get("label"), "", f"left:1060px;top:{y}px;width:180px;font-size:24px;font-weight:800;color:var(--blue2);letter-spacing:.04em", rich=False)
        out += T(r.get("value"), "", f"left:1240px;top:{y}px;width:600px;font-size:26px;color:rgba(255,255,255,.85);white-space:nowrap", rich=False)
    if offs:
        cw = (1680 - 24 * (len(offs) - 1)) // len(offs)
        for i, o in enumerate(offs):
            x = 120 + i * (cw + 24)
            out += R(f"left:{x}px;top:780px;width:{cw}px;height:170px;background:rgba(255,255,255,.06);border:2px solid rgba(255,255,255,.14);border-radius:24px;box-shadow:none")
            out += T(o.get("name"), "", f"left:{x + 32}px;top:810px;font-size:26px;font-weight:900;color:#fff", rich=False)
            out += T(o.get("addr"), "", f"left:{x + 32}px;top:860px;width:{cw - 64}px;height:72px;font-size:21px;line-height:1.5;color:rgba(255,255,255,.7)", rich=False, fit=True)
    return "dark", out


LAYOUT_FN = {k[2:]: v for k, v in globals().items() if k.startswith("L_")}
TAGS = {"cover": "", "contents": "CONTENTS", "section": "", "contact": "CONTACT"}


ITEM_KEY = {"stats": "label", "pillars": "title", "history": "text", "services": "name", "showcase": "title", "awards": "text"}


def clean(d):
    """AI 가 준 칸을 레이아웃이 기대하는 모양으로 — 항목이 글자뿐이면 대표 칸으로, 목록 칸이 아니면 빈 목록, 글자 칸은 문자열"""
    k = d.get("kind")
    items = d.get("items")
    if not isinstance(items, list):
        items = []
    if k in ITEM_KEY:
        items = [x if isinstance(x, dict) else {ITEM_KEY[k]: str(x)} for x in items if x]
    elif k in ("contents", "clients"):
        items = [str(x.get("name") or x.get("title") or "") if isinstance(x, dict) else str(x) for x in items if x]
    d["items"] = items
    for key in ("rows", "offices"):
        if key in d and not isinstance(d[key], list):
            d[key] = []
    for key, v in list(d.items()):
        if not key.startswith("_") and isinstance(v, (int, float)):
            d[key] = str(v)
    return d


def slide_html(d, n, total):
    fn = LAYOUT_FN.get(d.get("kind")) or L_statement
    try:
        tone, body = fn(clean(d))
    except Exception:   # 칸이 크게 어긋난 쪽은 한 문장 선언으로 — 덱 전체를 멈추지 않는다
        d = {**{k: v for k, v in d.items() if k.startswith("_")}, "kind": "statement", "eyebrow": d.get("eyebrow") or "",
             "headline": d.get("headline") or d.get("title") or d.get("name") or "", "sub": d.get("sub") or d.get("desc") or ""}
        tone, body = L_statement(d)
    d["_tone"] = tone
    tag = TAGS.get(d.get("kind"), d.get("eyebrow") or "")
    chrome = _chrome(d, n, total, tag) if d.get("kind") != "cover" else _chrome(d, n, total, "")
    return (f"<!doctype html><html><head><meta charset='utf-8'><style>{_font_css()}{_vars()}{CSS}</style></head>"
            f"<body><div class='s {tone if tone != 'light' else ''}'>{body}{chrome}</div></body></html>")


# ───────────────────────── 렌더 + DOM 재기
MEASURE_JS = r"""
() => {
  // 넘치는 글은 줄인다(상자 높이·폭 안으로, 최소 60%)
  for (const el of document.querySelectorAll('[data-fit]')) {
    const cs = getComputedStyle(el); let fs = parseFloat(cs.fontSize); const min = fs * 0.6;
    const over = () => (el.style.height && el.scrollHeight > el.clientHeight + 1) || (el.style.width && el.scrollWidth > el.clientWidth + 1);
    let guard = 0;
    while (over() && fs > min && guard++ < 60) { fs *= 0.96; el.style.fontSize = fs + 'px';
      for (const c of el.querySelectorAll('span')) { if (c.style.fontSize) c.style.fontSize = (parseFloat(c.style.fontSize) * 0.96) + 'px'; } }
  }
  const rgba = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(x => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const out = [];
  for (const el of document.querySelectorAll('[data-x]')) {
    const k = el.dataset.x, b = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (b.width < 1 || b.height < 1) continue;
    const box = { k, x: b.left, y: b.top, w: b.width, h: b.height };
    if (k === 'r') {
      Object.assign(box, { fill: rgba(cs.backgroundColor), bw: parseFloat(cs.borderTopWidth) || 0, bc: rgba(cs.borderTopColor),
        rad: parseFloat(cs.borderTopLeftRadius) || 0 });
    } else if (k === 'i') {
      // object-fit: contain — 실제로 그려진 그림 상자
      const nw = el.naturalWidth, nh = el.naturalHeight; if (!nw || !nh) continue;
      const s = Math.min(b.width / nw, b.height / nh); const w = nw * s, h = nh * s;
      const pos = cs.objectPosition.split(' '); const fx = pos[0] === 'left' || pos[0] === '0%' ? 0 : 0.5;
      Object.assign(box, { src: el.currentSrc || el.src, x: b.left + (b.width - w) * fx, y: b.top + (b.height - h) / 2, w, h });
    } else {
      // 글 — 글자마다 줄(top)을 재서 브라우저가 바꾼 줄 그대로 나눈다. 같은 줄 안에서는 모양이 같은 글자를 한 덩이(run)로
      const lines = []; let cur = null, brk = true;
      const blh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
      const walk = (node) => {
        for (const ch of node.childNodes) {
          if (ch.nodeType === 3) {
            const pcs = getComputedStyle(ch.parentElement);
            const st = { color: rgba(pcs.color), w: parseInt(pcs.fontWeight), size: parseFloat(pcs.fontSize), ls: parseFloat(pcs.letterSpacing) || 0 };
            const t = ch.data;
            for (let i = 0; i < t.length; i++) {
              const r = document.createRange(); r.setStart(ch, i); r.setEnd(ch, i + 1);
              const rs = r.getClientRects(); if (!rs.length) continue;
              const top = rs[0].top, bot = rs[0].bottom, c = t[i];
              // 새 줄 = <br> 뒤이거나, 글자 바닥(bottom)이 앞 줄보다 블록 줄 높이의 60% 넘게 내려갔을 때.
              // 바닥으로 재야 숫자 옆 작은 단위(같은 기준선, top 만 낮다)가 같은 줄로 남는다. 줄 높이가 촘촘한 큰 제목은 글자 상자끼리 겹쳐서 '겹침'으로는 못 가른다(10-16)
              if (brk || cur === null || bot - cur.bottom > blh * 0.6) { cur = { runs: [], top, bottom: bot }; lines.push(cur); brk = false; if (/\s/.test(c)) continue; }
              const last = cur.runs[cur.runs.length - 1];
              const same = last && last.st.w === st.w && last.st.size === st.size && JSON.stringify(last.st.color) === JSON.stringify(st.color) && last.st.ls === st.ls;
              if (same) last.text += c; else cur.runs.push({ text: c, st });
            }
          } else if (ch.nodeType === 1 && ch.tagName === 'BR') brk = true;
          else if (ch.nodeType === 1) walk(ch);
        }
      };
      walk(el);
      for (const l of lines) { const lr = l.runs[l.runs.length - 1]; if (lr) lr.text = lr.text.replace(/\s+$/, ''); }
      Object.assign(box, { lines: lines.filter(l => l.runs.some(r => r.text.trim())).map(l => ({ top: l.top, runs: l.runs })),
        align: cs.textAlign, lh: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2, size: parseFloat(cs.fontSize),
        tt: cs.textTransform });
    }
    out.push(box);
  }
  return out;
}
"""
BAKE_CSS = """[data-x=t]{color:transparent!important}[data-x=t] *{color:transparent!important}
[data-x=i]{visibility:hidden!important}
[data-x=r]{background:transparent!important;border-color:transparent!important}"""


def render(slides, out_dir, log=print):
    """쪽마다 HTML → (미리보기 PNG, 배경 PNG, 잰 요소). 반환: [{html, preview, bg, boxes}]"""
    from playwright.sync_api import sync_playwright
    os.makedirs(out_dir, exist_ok=True)
    res = []
    with sync_playwright() as p:
        br = p.chromium.launch(args=["--force-color-profile=srgb", "--font-render-hinting=none", "--allow-file-access-from-files"])
        pg = br.new_page(viewport={"width": W_PX, "height": H_PX}, device_scale_factor=1)
        total = len(slides)
        for i, d in enumerate(slides, 1):
            hp = os.path.join(out_dir, f"s{i:02d}.html")
            open(hp, "w", encoding="utf-8").write(slide_html(d, i, total))
            pg.goto("file:///" + hp.replace("\\", "/"))
            pg.evaluate("document.fonts.ready")
            pg.wait_for_load_state("networkidle")
            boxes = pg.evaluate(MEASURE_JS)
            prev = os.path.join(out_dir, f"s{i:02d}.png")
            pg.screenshot(path=prev)
            pg.add_style_tag(content=BAKE_CSS)
            bg = os.path.join(out_dir, f"s{i:02d}_bg.png")
            pg.screenshot(path=bg)
            res.append({"html": hp, "preview": prev, "bg": bg, "boxes": boxes, "tone": d.get("_tone")})
            log(f"  {i:02d} {d.get('kind')} — 글 {sum(1 for b in boxes if b['k'] == 't')} · 도형 {sum(1 for b in boxes if b['k'] == 'r')} · 그림 {sum(1 for b in boxes if b['k'] == 'i')}")
        br.close()
    return res


# ───────────────────────── PPTX
def _hex(c, base=(255, 255, 255)):
    """rgba → (RRGGBB, 알파 0~1). 글자는 알파를 바탕색과 섞는다(PowerPoint 글자 투명도는 편집 때 헷갈린다)"""
    if not c:
        return None, 0
    return "%02X%02X%02X" % (round(c["r"]), round(c["g"]), round(c["b"])), float(c.get("a", 1))


def _mix(c, base):
    a = float(c.get("a", 1))
    return "%02X%02X%02X" % tuple(round(c[k] * a + base[i] * (1 - a)) for i, k in enumerate("rgb"))


def _face(w):
    w = int(w or 400)
    k = min(FACES, key=lambda x: abs(x - w) + (0.5 if x < w else 0))   # 같은 거리면 굵은 쪽
    return FACES[k][0]


def _set_font(run, face, size_px, color, ls_px):
    from pptx.util import Pt
    from pptx.dml.color import RGBColor
    from pptx.oxml.ns import qn
    f = run.font
    f.name = face
    f.size = Pt(round(size_px * PT * 2) / 2)
    f.bold = False
    f.color.rgb = RGBColor.from_string(color)
    rpr = run._r.get_or_add_rPr()
    for tag in ("a:ea", "a:cs"):
        el = rpr.find(qn(tag))
        if el is None:
            el = rpr.makeelement(qn(tag), {})
            rpr.append(el)
        el.set("typeface", face)
    if ls_px:
        rpr.set("spc", str(int(round(ls_px * PT * 100))))


def _alpha(fill_el, a):
    from pptx.oxml.ns import qn
    if a >= 0.999:
        return
    clr = fill_el.find(".//" + qn("a:srgbClr"))
    if clr is not None:
        al = clr.makeelement(qn("a:alpha"), {"val": str(int(a * 100000))})
        clr.append(al)


# PowerPoint 는 '줄 간격 고정'에서 줄 높이의 남는 공간을 글자 위에 몰아 둔다(브라우저는 위아래 반씩) — 그만큼 글상자를 위로 올린다.
# 실측(PowerPoint 렌더 대조, company_calib)으로 맞춘 비율
PPT_LEAD_UP = 0.5


def to_pptx(rendered, out, base_tone=None):
    from pptx import Presentation
    from pptx.util import Emu
    from pptx.enum.shapes import MSO_SHAPE
    from pptx.enum.text import PP_ALIGN, MSO_AUTO_SIZE, MSO_ANCHOR
    from pptx.dml.color import RGBColor
    import vertical
    prs = Presentation()
    prs.slide_width, prs.slide_height = Emu(W_PX * EMU), Emu(H_PX * EMU)
    blank = prs.slide_layouts[6]
    E = lambda v: Emu(int(round(v * EMU)))
    for r in rendered:
        s = prs.slides.add_slide(blank)
        vertical.set_bg(s, open(r["bg"], "rb").read())
        base = {"dark": (5, 11, 36), "blue": (31, 79, 255)}.get(r.get("tone"), (255, 255, 255))
        for b in r["boxes"]:
            if b["k"] == "r":
                rad = min(b["rad"], b["w"] / 2, b["h"] / 2)
                sh = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if rad > 0.5 else MSO_SHAPE.RECTANGLE, E(b["x"]), E(b["y"]), E(b["w"]), E(b["h"]))
                if rad > 0.5:
                    sh.adjustments[0] = rad / min(b["w"], b["h"])
                f = b.get("fill")
                if f and f.get("a", 1) > 0.01:
                    sh.fill.solid()
                    sh.fill.fore_color.rgb = RGBColor.from_string(_hex(f)[0])
                    _alpha(sh.fill._xPr, f.get("a", 1))
                else:
                    sh.fill.background()
                bc = b.get("bc")
                if b.get("bw", 0) >= 0.5 and bc and bc.get("a", 1) > 0.01:
                    sh.line.color.rgb = RGBColor.from_string(_hex(bc)[0])
                    sh.line.width = E(b["bw"])
                    _alpha(sh.line._get_or_add_ln(), bc.get("a", 1))
                else:
                    sh.line.fill.background()
                sh.shadow.inherit = False
                sh.text_frame.text = ""
            elif b["k"] == "i":
                src = b["src"]
                if src.startswith("file:///"):
                    src = urllib_unquote(src[8:])
                elif src.startswith("data:"):
                    src = io.BytesIO(base64.b64decode(src.split(",", 1)[1]))
                try:
                    s.shapes.add_picture(src, E(b["x"]), E(b["y"]), E(b["w"]), E(b["h"]))
                except Exception:
                    pass
            else:
                lines = b.get("lines") or []
                if not lines:
                    continue
                lh = b["lh"]
                up = (lh - b["size"]) * PPT_LEAD_UP if lh > b["size"] else 0
                tb = s.shapes.add_textbox(E(b["x"]), E(b["y"] - up), E(b["w"] + 4), E(max(b["h"], lh * len(lines))))
                tf = tb.text_frame
                tf.word_wrap = False
                tf.auto_size = MSO_AUTO_SIZE.NONE
                tf.vertical_anchor = MSO_ANCHOR.TOP
                tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
                al = {"center": PP_ALIGN.CENTER, "right": PP_ALIGN.RIGHT, "end": PP_ALIGN.RIGHT}.get(b.get("align"), PP_ALIGN.LEFT)
                from pptx.util import Pt
                for li, ln in enumerate(lines):
                    p = tf.paragraphs[0] if li == 0 else tf.add_paragraph()
                    p.alignment = al
                    p.line_spacing = Pt(lh * PT)
                    p.space_before = p.space_after = Pt(0)
                    for rn in ln["runs"]:
                        t = rn["text"]
                        if b.get("tt") == "uppercase":
                            t = t.upper()
                        if not t:
                            continue
                        run = p.add_run()
                        run.text = t
                        st = rn["st"]
                        _set_font(run, _face(st["w"]), st["size"], _mix(st["color"], base), st["ls"])
    prs.save(out)
    return len(prs.slides)


def urllib_unquote(s):
    import urllib.parse
    return urllib.parse.unquote(s)


# ───────────────────────── 기획(AI) · 그림 · 작업 실행
def plan(job, brief, note, ctx, pages):
    import design
    user = (f"# 메모·요청\n{note or '(없음)'}\n\n# 회사 자료 요약\n{ctx or '(없음)'}\n\n# 직접 쓴 글\n{brief or '(없음)'}")
    sysmsg = PLAN_SYSTEM.replace("{layouts}", "\n".join(f"- {k}: {v}" for k, v in LAYOUTS.items())).replace("{pages}", str(pages))
    d = design._plan_call(job, sysmsg, user, 12000, "회사소개서 구성")
    sl = [x for x in (d.get("slides") or []) if isinstance(x, dict) and x.get("kind") in LAYOUTS]
    if not sl or sl[0]["kind"] != "cover":
        sl.insert(0, {"kind": "cover", "title": (d.get("company") or {}).get("tagline") or "회사 소개"})
    d["slides"] = sl
    return d


def _icon_file(job, query, used, d):
    """powerAssets 아이콘 세트에서 검색어로 하나 — 받은 원본 경로(없으면 None)"""
    import vertical
    try:
        pid, conf = vertical._pick("icon", query, [query], used, set_=ICON_SET)
    except Exception:
        return None
    if not pid or conf < 0.3:
        return None
    used.add(pid)
    try:
        blob = vertical._api("GET", f"/assets/items/{pid}/file/original", raw=True)
    except Exception:
        return None
    p = os.path.join(d, f"icon_{pid}.png")
    open(p, "wb").write(blob)
    return p


def _white_logo(src, dst):
    from PIL import Image
    im = Image.open(src).convert("RGBA")
    a = im.split()[3]
    if a.getextrema()[0] > 250:   # 투명 배경이 아니면 흰색으로 바꾸지 않는다
        return None
    w = Image.new("RGBA", im.size, (255, 255, 255, 0))
    w.putalpha(a)
    w.save(dst)
    return dst


def attach_assets(job, deck, d, log=print):
    """그림 칸(_img) 채우기 — 표지·간지 큰 그림, 카드 아이콘. 로고(제안사 = 우리 회사)는 작업에 올린 vendor 로고"""
    import design
    used = set()
    comp = deck.get("company") or {}
    hero_q = ["데이터", "클라우드", "인공지능", "플랫폼", "네트워크", "보안", "서버"]
    for k, s in enumerate(deck["slides"]):
        if s["kind"] in ("cover", "section"):
            q = s.get("icon") or (hero_q[k % len(hero_q)] if s["kind"] == "section" else "데이터 플랫폼")
            s["_img"] = _icon_file(job, q, used, d)
        for it in s.get("items") or []:
            if isinstance(it, dict) and it.get("icon"):
                it["_img"] = _icon_file(job, it["icon"], used, d)
    lg = design.brand_logo(job, "vendor")
    logo = logo_dark = None
    if lg is not None:
        logo = os.path.join(d, "logo.png")
        lg.save(logo)
        logo_dark = _white_logo(logo, os.path.join(d, "logo_white.png"))
    for s in deck["slides"]:
        s["_company"], s["_short"] = comp.get("name") or "", comp.get("short") or comp.get("name") or ""
        if logo:
            s["_logo"], s["_logo_dark"] = "file:///" + logo.replace("\\", "/"), ("file:///" + logo_dark.replace("\\", "/")) if logo_dark else None
        if s.get("_img"):
            s["_img"] = "file:///" + s["_img"].replace("\\", "/")
        for it in s.get("items") or []:
            if isinstance(it, dict) and it.get("_img"):
                it["_img"] = "file:///" + it["_img"].replace("\\", "/")


def run(job, j, opts, brief, note):
    import design
    req, put_file = design.W["req"], design.W["put_file"]
    pages = int(opts.get("slides") or 0) or 14
    job.push("기획", 4)
    job.event("회사소개서(타입 G) — 자료를 읽고 레이아웃 카탈로그에 맞춰 쪽을 구성합니다.")
    raw = design.load_context(job, 400000) or ""
    ctx = design.digest_context(job, raw) if raw else ""
    deck = plan(job, brief, note, ctx, pages)
    kinds = [s["kind"] for s in deck["slides"]]
    job.event(f"구성 완료 — {len(kinds)}쪽: " + " · ".join(kinds) + f". 비용 ${job.spent:.3f}", "done")
    d = os.path.join(job.dir, "_company")
    os.makedirs(d, exist_ok=True)
    job.push("기획", 30)
    attach_assets(job, deck, d)
    json.dump(deck, open(os.path.join(d, "deck.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    try:
        put_file(job.id, "extra", os.path.join(d, "deck.json"), "회사소개서_구성.json")
    except Exception:
        pass
    job.push("시안 생성", 50)
    job.event("HTML 로 쪽을 그리고, 글·도형·그림을 재서 PPT 로 옮깁니다.")
    rendered = render(deck["slides"], os.path.join(d, "html"), log=lambda m: None)
    out = os.path.join(job.dir, "결과.pptx")
    n = to_pptx(rendered, out)
    job.event(f"회사소개서 {n}장을 만들었습니다(글·카드는 편집 가능, 빛·그라데이션은 배경 그림).", "done")
    try:   # 쓴 서체(Pretendard 5굵기, OFL) — 산출물 '5_서체'. 받는 PC 에 없으면 줄바꿈이 달라진다(세로 제안서와 같은 규칙)
        import fontlicense
        fp = [os.path.join(FONT_DIR, f) for _, f in FACES.values() if os.path.isfile(os.path.join(FONT_DIR, f))]
        for f in fp:
            put_file(job.id, "extra", f)
        for f in fontlicense.write_notice(fp, os.path.join(job.dir, "_fonts_notice")):
            put_file(job.id, "extra", f)
        job.event(f"서체 파일 {len(fp)}개(Pretendard)를 산출물에 넣었습니다.", "done")
    except Exception as e:
        job.event(f"서체 파일을 산출물에 넣지 못했습니다: {str(e)[:100]}", "warn")
    job.push("시안 정리", 92)
    try:
        design.W.get("upload_after", lambda *a, **k: None)(job, out)
    except Exception as e:
        job.event(f"장별 미리 보기 렌더 실패(결과 파일은 정상): {str(e)[:120]}", "warn")
    put_file(job.id, "result", out)
    try:
        design.W.get("text_map", lambda *a, **k: None)(job, out)
    except Exception:
        pass
    comp = deck.get("company") or {}
    req("POST", f"/worker/jobs/{job.id}/finish", {"status": "done", "result_name": "결과.pptx", "engine": "company", "report": {
        "summary": f"{comp.get('name') or '회사'} 회사소개서 {n}장(타입 G)",
        "stats": [{"label": "전체 장", "value": n}, {"label": "레이아웃", "value": len(set(kinds))}],
        "checklist": [{"slide": 0, "title": "사실 확인", "level": "info", "detail": "숫자·연혁·고객 이름은 자료에서 옮겼습니다. 보내기 전에 최신 값인지 확인해 주세요."}],
        "changes": []}})
