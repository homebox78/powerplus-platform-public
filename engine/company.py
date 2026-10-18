# -*- coding: utf-8 -*-
"""회사소개서 덱(16:9, 용도 '회사소개용') — 테마 A 다크 임팩트 · B 라이트 에디토리얼 × 톤 5종. 제안서 발표 장표가 아니라 회사를 소개하는 덱 — 글·숫자를 크고 과감하게 쓴다(사용자 2026-10-16).
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
         "ink": "#0B1324", "body": "#3E4A60", "muted": "#7A8499", "line": "#DCE6FF", "paper": "#F3F6FC"}   # line = 톤 옅은색(BLUE_KEYS 라 toned 로 바뀜) — 구분선이 바탕 계열이어야(사용자 2026-10-16, 4테마 공통)

# 톤 — 세로 제안서처럼 색만 고른다(opts.ctone, 사용자 2026-10-16 "세로제안서처럼 톤을 선택할 수 있게").
# 디자인은 파랑(blue)으로 짜 두고, 그 색 값들을 톤 색으로 바꿔 끼운다(BLUE_KEYS 순서 = 각 톤 값 순서).
#   a 주색 · a2 밝은 주색 · sky 옅은 면 · navy 어두운 바탕 · navy2 · dk1·dk2 어두운 그라데이션 끝 · lt 비전 쪽 빛 · deep 비전 쪽 그늘 · vg1·vg2 비전 바탕 · eb·em 어두운 쪽 꼬리표·강조
BLUE_KEYS = ["#1F4FFF", "#3D7BFF", "#DCE6FF", "#050B24", "#0B1A4A", "#0A1440", "#040817", "#78AAFF", "#051478", "#2A5BFF", "#1436D8", "#BFD0FF", "#9FE0FF"]
TONES = {   # 파랑 계열 3 · 빨강 2 · 초록 2 · 보라 2 · 주황 2 — "파랑으로만 도배하지 말고 트렌디한 톤"(사용자 2026-10-16). 직접 고른 색(#RRGGBB)은 tone_palette 가 만든다
    "blue":     {"label": "코발트 블루", "c": BLUE_KEYS},
    "navy":     {"label": "딥 네이비", "c": ["#1B3A8A", "#3A63C9", "#DCE4F5", "#060B1C", "#0E1A3C", "#0C1735", "#040716", "#8FAEE8", "#0A1C4F", "#2A4DA8", "#152E70", "#C3D1EE", "#9FE0FF"]},
    "sky":      {"label": "스카이", "c": ["#0EA5E9", "#38BDF8", "#DCF3FF", "#06202E", "#0B3A52", "#0A3448", "#031620", "#8DDCFF", "#064A6B", "#1FB2F0", "#0A86C2", "#BFEAFF", "#FFE27A"]},
    "crimson":  {"label": "크림슨", "c": ["#D7263D", "#FF4D61", "#FFE0E4", "#1A0509", "#3A0A13", "#3A0A14", "#0E0205", "#FF9AA6", "#6E0A18", "#E33349", "#B0162B", "#FFC9D0", "#FFE27A"]},
    "coral":    {"label": "코랄", "c": ["#FF5A4E", "#FF7B70", "#FFE4E1", "#1F0C0A", "#3F1512", "#3A1310", "#120605", "#FFB3AC", "#7A1F17", "#FF6A5E", "#D8463B", "#FFD2CD", "#FFF1A8"]},
    "emerald":  {"label": "에메랄드", "c": ["#0F9D58", "#2EBF78", "#D9F5E6", "#03170C", "#07331A", "#063018", "#020F08", "#8FE6B8", "#06502A", "#16AE66", "#0B7E44", "#BFEFD4", "#FFE27A"]},
    "teal":     {"label": "틸", "c": ["#0E9F8E", "#22C7B2", "#D3F2EE", "#03191A", "#08332F", "#06302C", "#020F10", "#7FE6D6", "#04463F", "#12B3A0", "#0A7F72", "#B5F0E7", "#FFE27A"]},
    "violet":   {"label": "바이올렛", "c": ["#6A3BFF", "#8E6BFF", "#E6DEFF", "#0D0727", "#22114F", "#1E0E4A", "#07041A", "#B49CFF", "#2A0C80", "#7B4DFF", "#4F22D8", "#D6C9FF", "#9FE0FF"]},
    "lavender": {"label": "라벤더", "c": ["#5F0080", "#8A2BBE", "#F1E4FA", "#140420", "#2C0D45", "#280B40", "#0C0214", "#CDA3EA", "#3F0A5C", "#7A1FA8", "#4E0A6E", "#E6CFF4", "#FFE27A"]},
    "carrot":   {"label": "당근 오렌지", "c": ["#FF6F0F", "#FF8C3A", "#FFEEDF", "#1C0F05", "#3B1E0A", "#361B09", "#120903", "#FFC08A", "#6E2F06", "#FF7A22", "#D85A0A", "#FFDCBF", "#FFF1A8"]},
    "orange":   {"label": "차콜 오렌지", "c": ["#F26A1B", "#FF8A3D", "#FFE7D6", "#121316", "#24262C", "#22242A", "#0B0C0E", "#FFB27F", "#5A2508", "#F47A2E", "#C9500E", "#FFD7BC", "#FFF1A8"]},
}
_rgb = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def _hsl(h, s_, l):
    import colorsys
    r, g, b = colorsys.hls_to_rgb(h, max(0, min(1, l)), max(0, min(1, s_)))
    return "#%02X%02X%02X" % (round(r * 255), round(g * 255), round(b * 255))


def tone_palette(tone):
    """톤 id 또는 직접 고른 색(#RRGGBB) → BLUE_KEYS 순서의 13색. 직접 고른 색은 그 색을 주색으로 밝기·채도만 바꿔 한 벌을 만든다"""
    import colorsys
    t = TONES.get(tone or "blue")
    if t:
        return t["c"]
    if not re.fullmatch(r"#[0-9A-Fa-f]{6}", str(tone or "")):
        return BLUE_KEYS
    r, g, b = (x / 255 for x in _rgb(tone.upper()))
    h, l, s_ = colorsys.rgb_to_hls(r, g, b)
    s_ = max(s_, 0.45)
    return [tone.upper(), _hsl(h, s_, min(0.78, l + 0.12)), _hsl(h, min(1, s_ + .1), 0.92), _hsl(h, 0.6, 0.07), _hsl(h, 0.6, 0.15), _hsl(h, 0.6, 0.13), _hsl(h, 0.6, 0.04),
            _hsl(h, s_, 0.75), _hsl(h, 0.85, 0.24), _hsl(h, s_, max(0.4, l)), _hsl(h, s_, max(0.3, l - 0.14)), _hsl(h, s_, 0.86), _hsl((h + 0.12) % 1, 0.9, 0.8)]


def tone_label(tone):
    t = TONES.get(tone or "blue")
    return t["label"] if t else f"직접 고른 색 {str(tone).upper()}"


def toned(s, tone):
    """파랑으로 짠 HTML·CSS 의 색(#RRGGBB 와 rgba(r,g,b,…))을 톤 색으로"""
    pal = tone_palette(tone)
    if pal is BLUE_KEYS:
        return s
    for src, dst in zip(BLUE_KEYS, pal):
        s = re.sub(re.escape(src), dst, s, flags=re.I)
        (r, g, b), (r2, g2, b2) = _rgb(src), _rgb(dst)
        s = s.replace(f"rgba({r},{g},{b},", f"rgba({r2},{g2},{b2},")
    return s


def tone_base(tone):
    """어두운 쪽·주색 쪽 바탕색(글자 알파를 섞을 때)"""
    c = tone_palette(tone)
    return {"dark": _rgb(c[3]), "blue": _rgb(c[0])}


def tint_icon(src, dst, tone):
    """파랑 유리 아이콘을 톤 색으로 — 색조만 돌린다(밝기·투명도 그대로). 블루면 그대로"""
    pal = tone_palette(tone)
    if pal is BLUE_KEYS:
        return src
    import colorsys
    from PIL import Image
    im = Image.open(src).convert("RGBA")
    a = im.split()[3]
    hsv = im.convert("RGB").convert("HSV")
    h0 = colorsys.rgb_to_hsv(*[x / 255 for x in _rgb(BLUE_KEYS[0])])[0]
    h1, s1, _ = colorsys.rgb_to_hsv(*[x / 255 for x in _rgb(pal[0])])
    dh = int(round((h1 - h0) * 255)) % 256
    h, s, v = hsv.split()
    h = h.point(lambda x: (x + dh) % 256)
    out = Image.merge("HSV", (h, s, v)).convert("RGB")
    out.putalpha(a)
    out.save(dst)
    return dst


def duo_tint(src, dst, tone):
    """여러 색 파스텔 배경(cp-bg-general)을 톤 한 색으로 — 흑백으로 바꾼 뒤 밝은 곳 흰색·중간 주색·어두운 곳 짙은 주색. 블루여도 돌린다(원본이 민트·베이지라서)"""
    from PIL import Image, ImageOps
    pal = tone_palette(tone)
    im = Image.open(src).convert("L")
    ImageOps.colorize(im, black=_rgb(pal[8]), mid=_rgb(pal[0]), white=(255, 255, 255), blackpoint=0, midpoint=150, whitepoint=255).save(dst)
    return dst


def tint_bg(src, dst, tone, mode="hue"):
    return duo_tint(src, dst, tone) if mode == "duo" else tint_icon(src, dst, tone)


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
# 테마 B — 라이트 에디토리얼(ref_042·058): 표지·간지·연락처도 밝은 바탕, 꼬리표는 검정 알약, 카드는 테두리 없는 옅은 면
CSS_B = """
.card{border:0;background:var(--paper);box-shadow:none;border-radius:32px}
.chip{border:0;background:var(--paper);border-radius:999px}
.eb{background:var(--ink);color:#fff;padding:7px 18px 6px;border-radius:999px;font-size:18px;letter-spacing:.12em}
.blue .eb{background:#fff;color:var(--blue)}
.h{letter-spacing:-0.052em}
"""
GLOW_B = ("<div class='deco' style=\"background:radial-gradient(1300px 900px at 105% -10%,rgba(61,123,255,.16),transparent 62%),"
          "radial-gradient(900px 700px at -5% 110%,rgba(31,79,255,.07),transparent 60%),#F7F9FE\"></div>")
# 테마 C — 솔리드 컬러(당근 소개서 결, 사용자 2026-10-16 "단색 바탕에 흰색 글씨" + 당근 pdf 참조): 표지·간지·비전·연락처는 주색 전면 + 흰 글자,
# 본문은 흰 바탕에 주색을 옅게 희석한 크림 면(#FFF7E5 결 = sky 를 더 옅게)·둥근 알약·굵은 주색 세로 바 머리글. 카드는 흰색, 선은 옅은 주색
CSS_C = """
.card{border:0;background:#fff;box-shadow:0 6px 24px -14px rgba(31,79,255,.25);border-radius:14px}
.chip{border:1px solid #DCE6FF;background:#fff;border-radius:10px}
.eb{background:var(--blue);color:#fff;padding:7px 16px 6px;border-radius:6px;font-size:18px;letter-spacing:.06em}
.h{letter-spacing:-0.045em;padding-left:28px;position:relative}   /* 세로 바는 렌더 때 글 줄 실측 범위로(C_BAR_JS) */
.blue .eb{background:#fff;color:var(--blue)}
.blue .h{color:#fff}
.blue em{color:#fff;opacity:.75}
.blue .sub{color:rgba(255,255,255,.8)}
.blue .tag,.blue .pg{color:rgba(255,255,255,.6)}
"""
GLOW_C = ("<div class='deco' style=\"background:#1F4FFF\"></div>")   # 단색 전면
GLOW_C_LIGHT = "<div class='deco' style=\"background:#fff\"></div>"


# 면 규칙(사용자 2026-10-16 "여백은 규칙으로 정해 일정하게"): 안쪽 여백 PAD 네 방향 같음 · 모서리 PAD_R · 색·투명도 하나. 면의 크기는 손으로 적지 않고
# 구역(data-zone) 요소들의 실측 외곽으로 렌더 때 잰다(c_pad_js) — 그래서 어떤 레이아웃이든 여백이 정확히 같다
PAD, PAD_R = 40, 24
# 카드 안 글 세로 중심 검사 — .card-v 카드마다 안에 든 글 요소 외곽의 위·아래 여백 차(px). 2 넘으면 어긋남
CARD_FIX_JS = """
() => {
  for (const c of document.querySelectorAll('.card-v')) {
    const cb = c.getBoundingClientRect(); const els = []; let t = 1e9, b = -1e9;
    for (const el of document.querySelectorAll('[data-x=t]')) { const r = el.getBoundingClientRect();
      if (r.left >= cb.left && r.right <= cb.right && r.top >= cb.top && r.bottom <= cb.bottom) {
        const rg = document.createRange(); rg.selectNodeContents(el); const rs = [...rg.getClientRects()]; if (!rs.length) continue;
        els.push(el); t = Math.min(t, ...rs.map(x => x.top)); b = Math.max(b, ...rs.map(x => x.bottom)); } }
    if (!els.length) continue;
    const dy = ((cb.top + cb.bottom) / 2) - ((t + b) / 2);
    for (const el of els) el.style.top = (parseFloat(el.style.top) + dy) + 'px';
  }
}
"""
CARD_JS = """
() => {
  const out = [];
  for (const c of document.querySelectorAll('.card-v')) {
    const cb = c.getBoundingClientRect(); let t = 1e9, b = -1e9;
    for (const el of document.querySelectorAll('[data-x=t]')) { const r = el.getBoundingClientRect();
      if (r.left >= cb.left && r.right <= cb.right && r.top >= cb.top && r.bottom <= cb.bottom) {
        const rg = document.createRange(); rg.selectNodeContents(el); const rs = [...rg.getClientRects()]; if (!rs.length) continue;
        t = Math.min(t, ...rs.map(x => x.top)); b = Math.max(b, ...rs.map(x => x.bottom)); } }
    if (t < 1e9) out.push(Math.round(((t - cb.top) - (cb.bottom - b)) * 10) / 10);
  }
  return out;
}
"""
BAR_W = 10   # 테마 C 제목 세로 바 두께 — 높이는 글 줄 실측(첫 줄 위 ~ 마지막 줄 아래), 사용자 2026-10-16 "라인 높이가 글 높이와 같아야"
C_BAR_JS = """
(w) => {
  for (const h of document.querySelectorAll('.h')) {
    const r = document.createRange(); r.selectNodeContents(h);
    const rects = [...r.getClientRects()].filter(x => x.width > 0 && x.height > 0); if (!rects.length) continue;
    const fs = parseFloat(getComputedStyle(h).fontSize), lh = parseFloat(getComputedStyle(h).lineHeight) || fs * 1.2;
    const trim = (lh - fs) / 2 + fs * 0.08;   // 줄 상자에서 글리프 위·아래 빈 띠를 뺀다
    const top = Math.min(...rects.map(x => x.top)) + trim, bot = Math.max(...rects.map(x => x.bottom)) - trim;
    const hb = h.getBoundingClientRect(), bg = getComputedStyle(h).color;
    const d = document.createElement('div'); d.className = 'deco';
    d.style.cssText = `left:${hb.left}px;top:${top}px;width:${w}px;height:${bot - top}px;right:auto;bottom:auto;border-radius:2px;background:${h.closest('.blue') ? '#fff' : 'var(--blue)'}`;
    h.parentElement.appendChild(d);
  }
}
"""
C_PAD_JS = """
({ pad, r }) => {
  const els = [...document.querySelectorAll('[data-zone]')]; if (!els.length) return null;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const el of els) { const b = el.getBoundingClientRect(); x0 = Math.min(x0, b.left); y0 = Math.min(y0, b.top); x1 = Math.max(x1, b.right); y1 = Math.max(y1, b.bottom); }
  const d = document.createElement('div'); d.className = 'deco';
  d.style.cssText = `left:${x0 - pad}px;top:${y0 - pad}px;width:${x1 - x0 + 2 * pad}px;height:${y1 - y0 + 2 * pad}px;right:auto;bottom:auto;border-radius:${r}px;background:#DCE6FF;opacity:.45`;
  const glow = document.querySelector('.s > .deco'); glow.insertAdjacentElement('afterend', d);
  return [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad];
}
"""


C_LINE = [("background:var(--line)", "background:#BFD0FF")]   # 크림 면 위 구분선 — 면 색(#DCE6FF .45)과 같은 계열 한 단계 진하게(BLUE_KEYS 색이라 toned 로 톤 색이 된다)
C_INK = [("color:var(--blue2)", "color:rgba(255,255,255,.45)"), ("color:var(--blue)", "color:#fff"), ("color:var(--ink)", "color:#fff"),
         ("color:var(--body)", "color:rgba(255,255,255,.82)"), ("color:var(--muted)", "color:rgba(255,255,255,.6)"), ("color:#BFD0FF", "color:rgba(255,255,255,.7)"),
         ("background:var(--line)", "background:rgba(255,255,255,.3)"), ("background:var(--blue2)", "background:rgba(255,255,255,.7)"),
         ("background:#fff;border:2px solid rgba(255,255,255,.14)", "background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.3)")]
# 테마 D — 프렌들리 라운드(당근 회사소개서 결): 흰 바탕에 파스텔 둥근 면, 아주 둥근 파스텔 카드, 파스텔 칩 꼬리표, 친근한 굵은 제목. 간지는 주색 전면
CSS_D = """
.card{border:0;background:#fff;box-shadow:0 14px 40px -18px rgba(31,79,255,.35);border-radius:36px}
.chip{border:0;background:#fff;box-shadow:0 8px 24px -14px rgba(31,79,255,.35);border-radius:999px}
.eb{background:var(--sky);color:var(--blue);padding:8px 18px 7px;border-radius:999px;font-size:19px;letter-spacing:.08em}
.blue .eb{background:rgba(255,255,255,.22);color:#fff}
.h{font-weight:900;letter-spacing:-0.04em;line-height:1.14}
"""
GLOW_D = ("<div class='deco' style=\"background:#fff\"></div>"
          "<div class='deco' style=\"left:-200px;top:820px;width:2320px;height:900px;right:auto;bottom:auto;border-radius:50% 50% 0 0 / 60% 60% 0 0;"
          "background:linear-gradient(180deg,#78AAFF 0%,#1F4FFF 70%);opacity:.9\"></div>"
          "<div class='deco' style=\"left:900px;top:900px;width:1400px;height:700px;right:auto;bottom:auto;border-radius:50% 50% 0 0 / 70% 70% 0 0;"
          "background:#3D7BFF;opacity:.55;mix-blend-mode:multiply\"></div>")   # 아래 주색 언덕 두 겹(겹친 자리 색 섞임)
COMPANY_THEMES = {"a": "다크 임팩트", "b": "라이트 에디토리얼", "c": "솔리드 컬러", "d": "프렌들리 라운드",
                  "e": "포토 에디토리얼", "f": "라인 미니멀", "g": "소프트 3D", "h": "기하 곡선"}
THEME_DEFAULT_TONE = {"a": "blue", "b": "navy", "c": "carrot", "d": "coral", "e": "navy", "f": "blue", "g": "sky", "h": "violet"}
# 테마 E~H(2026-10-18, 배경 묶음 추가로) — 쪽 짜임은 바탕 테마(A·B·D)를 그대로 쓰고 표지·간지·마무리 배경 묶음만 바꾼다
THEME_BASE = {"e": "a", "f": "b", "g": "b", "h": "d"}
# (powerAssets 세트, 이름에 들어간 낱말 — | 로 여럿, 색 입히기) — hue = tint_icon 색조 돌리기(파랑으로 만든 그림), duo = 흑백으로 바꿔 톤 한 색으로(파스텔 여러 색)
THEME_BG = {"e": ("cp-photo-editorial", "", "hue"), "f": ("cp-bg-general", "라인아트", "duo"),
            "g": ("cp-bg-general", "소프트3D", "duo"), "h": ("cp-bg-general", "기하도형|큰원곡선", "duo")}
SET_TINT = {"cp-bg-general": "duo"}   # 세트별 색 입히기(없으면 hue) — 자유도 모드에서 여러 세트가 섞일 때


def base_theme(t):
    return THEME_BASE.get(t, t)
LIGHT_GLOW = {"b": GLOW_B, "d": GLOW_D}   # C 는 전 쪽이 주색 전면(slide_html 에서 따로)   # 밝은 표지·간지·연락처를 쓰는 테마의 바탕
THEME_CSS = {"b": CSS_B, "c": CSS_C, "d": CSS_D}


def _vars():
    return ":root{" + ";".join(f"--{k}:{v}" for k, v in THEME.items()) + "}"


def _rich(s):
    """**강조** → <em>, 줄바꿈 \\n → <br>. 나머지는 이스케이프"""
    s = html.escape(str(s or "")).replace("\\n", "\n")
    s = re.sub(r"\*\*(.+?)\*\*", r"<em>\1</em>", s)
    return s.replace("*", "").replace("\n", "<br>")


def _plain(s):
    return html.escape(re.sub(r"\*\*", "", str(s or "")).replace("\\n", "\n")).replace("\n", "<br>")


def T(text, cls="", style="", rich=True, fit=False, raw=False, zone=False):
    """글 요소 — data-x=t 는 PPT 글상자가 된다. fit 이면 상자를 넘칠 때 글자를 줄인다(높이·폭이 정해진 상자). raw = 이미 만든 HTML(이스케이프 끝난 것).
    zone = 테마 C 크림 면 구역에 든다(면은 구역 요소들의 외곽 + PAD)"""
    body = text if raw else (_rich(text) if rich else _plain(text))
    return f'<div data-x="t"{" data-fit=1" if fit else ""}{" data-zone=1" if zone else ""} class="abs {cls}" style="{style}">{body}</div>'


def R(style, cls="card", zone=False):
    return f'<div data-x="r"{" data-zone=1" if zone else ""} class="{cls if cls != "card-v" else "card card-v"}" style="{style}"></div>'


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


# ───────────────────────── 장식(SVG) — 허전한 자리에 포인트 하나(사용자 2026-10-16 견본 8장: 선 부채 · 꼬인 리본 선 · 원 곡선 네트워크 · 어두운 광택 리본 ·
# 3D 메시 파형 · 점선 네트워크 지구 · 지오데식 와이어 구 2종 — "많이는 말고 허전한 곳에 포인트로 SVG"). 렌더 때 배경 그림으로 굳어 PPT 에도 그대로.
# 색은 파랑 값(#1F4FFF·#3D7BFF·#78AAFF·#BFD0FF·#DCE6FF·#051478)으로 쓰고 toned() 가 톤 색으로 바꾼다. 쪽마다 하나(PROFILE '조잡하다 = 효과가 겹친다').
# 모양은 쪽 번호로 정한 씨앗(random.Random)이라 같은 덱은 다시 만들어도 같다.
import math
import random

_SVG_N = [0]


def _svg(x, y, w, h, body, defs="", op=1.0):
    return (f"<svg class='deco' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {w:.0f} {h:.0f}' "
            f"style='left:{x:.0f}px;top:{y:.0f}px;width:{w:.0f}px;height:{h:.0f}px;right:auto;bottom:auto;opacity:{op};overflow:visible'><defs>{defs}</defs>{body}</svg>")


def _gid(p):
    _SVG_N[0] += 1
    return f"{p}{_SVG_N[0]}"


def _lg(gid, stops, x2=1, y2=0):
    return (f"<linearGradient id='{gid}' x1='0' y1='0' x2='{x2}' y2='{y2}'>"
            + "".join(f"<stop offset='{o}' stop-color='{c}' stop-opacity='{a}'/>" for o, c, a in stops) + "</linearGradient>")


def D_fan(x, y, w, h, corner="tr", n=30, dark=False, op=1.0):
    """선 부채(견본 1) — 한 모서리 점에서 곡선 n 개가 반대편 가장자리로 고르게 퍼진다"""
    g = _gid("fn")
    defs = _lg(g, [(0, "#78AAFF", .9), (1, "#BFD0FF", .5)] if dark else [(0, "#1F4FFF", .85), (1, "#78AAFF", .45)], 1, 1)
    ox, oy = (w, 0) if corner == "tr" else (0, h) if corner == "bl" else (w, h) if corner == "br" else (0, 0)
    tx = 0 if ox else w
    body = []
    for i in range(n):
        t = i / (n - 1)
        ey = t * h
        cx1, cy1 = (ox + tx) / 2, oy + (ey - oy) * 0.15
        body.append(f"<path d='M{ox:.1f},{oy:.1f} Q{cx1:.1f},{cy1 + (h * .55 if oy == 0 else -h * .55) * (1 - t):.1f} {tx:.1f},{ey:.1f}' fill='none' stroke='url(#{g})' stroke-width='1.2'/>")
    return _svg(x, y, w, h, "".join(body), defs, op)


def D_ribbon(x, y, w, h, n=34, dark=False, op=1.0):
    """꼬인 리본 선 다발(견본 2) — 두 S 곡선 사이를 선 n 개로 메워 비틀린 띠처럼"""
    g = _gid("rb")
    defs = _lg(g, [(0, "#BFD0FF", .25), (.5, "#78AAFF", .8), (1, "#3D7BFF", .9)] if dark else [(0, "#78AAFF", .35), (.5, "#3D7BFF", .85), (1, "#1F4FFF", .95)], 0, 1)
    A = [(w * .98, 0), (w * .10, h * .32), (w * .40, h * .72), (w * .02, h * .98)]
    B = [(w * .98, h * .06), (w * .95, h * .45), (w * .00, h * .55), (w * .98, h * .94)]
    body = []
    for i in range(n):
        t = i / (n - 1)
        p = [(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) for a, b in zip(A, B)]
        body.append(f"<path d='M{p[0][0]:.1f},{p[0][1]:.1f} C{p[1][0]:.1f},{p[1][1]:.1f} {p[2][0]:.1f},{p[2][1]:.1f} {p[3][0]:.1f},{p[3][1]:.1f}' "
                    f"fill='none' stroke='url(#{g})' stroke-width='1.1' stroke-opacity='{.35 + .55 * math.sin(t * math.pi):.2f}'/>")
    return _svg(x, y, w, h, "".join(body), defs, op)


def D_arcs(cx, cy, r, seed=1, n=70, dark=False, op=1.0):
    """원 둘레를 잇는 곡선 네트워크(견본 3) — 둘레의 두 점을 안쪽으로 휜 곡선으로, 끝에 점"""
    rnd = random.Random(seed)
    g = _gid("ac")
    c1, c2 = ("#78AAFF", "#BFD0FF") if dark else ("#1F4FFF", "#78AAFF")
    defs = _lg(g, [(0, c1, .9), (1, c2, .9)], 1, 1)
    body = [f"<circle cx='{r}' cy='{r}' r='{r}' fill='none' stroke='url(#{g})' stroke-opacity='.35' stroke-width='1.2'/>"]
    for _ in range(n):
        a1 = rnd.uniform(0, 2 * math.pi)
        a2 = a1 + rnd.uniform(0.5, 2.6) * rnd.choice((1, -1))
        p1 = (r + r * math.cos(a1), r + r * math.sin(a1))
        k = rnd.uniform(.35, 1.0)
        p2 = (r + r * k * math.cos(a2), r + r * k * math.sin(a2))
        m = ((p1[0] + p2[0]) / 2 * .7 + r * .3, (p1[1] + p2[1]) / 2 * .7 + r * .3)
        body.append(f"<path d='M{p1[0]:.1f},{p1[1]:.1f} Q{m[0]:.1f},{m[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}' fill='none' stroke='url(#{g})' stroke-width='1' stroke-opacity='.55'/>"
                    f"<circle cx='{p1[0]:.1f}' cy='{p1[1]:.1f}' r='3' fill='{c1}' fill-opacity='.8'/><circle cx='{p2[0]:.1f}' cy='{p2[1]:.1f}' r='2.6' fill='{c2}'/>")
    return _svg(cx - r, cy - r, 2 * r, 2 * r, "".join(body), defs, op)


def D_silk(x, y, w, h, op=1.0):
    """어두운 광택 리본(견본 4) — 겹친 넓은 곡면 셋, 가장자리에만 빛. 어두운 쪽 바탕용"""
    body, defs = "", ""
    for k, (s, a) in enumerate(((1.0, .10), (.62, .14), (.30, .18))):
        g = _gid("sk")
        defs += _lg(g, [(0, "#FFFFFF", 0), (.55, "#FFFFFF", a), (1, "#FFFFFF", 0)], 1, 1)
        x0, y0 = w * (1 - s), h * 0.05
        body += (f"<path d='M{x0:.1f},{h:.1f} C{x0 - w * .12 * s:.1f},{h * .45:.1f} {x0 + w * .05:.1f},{y0:.1f} {w:.1f},{y0 + h * .02:.1f} "
                 f"L{w:.1f},{h * (.55 + .2 * k):.1f} C{x0 + w * .3 * s:.1f},{h * (.55 + .15 * k):.1f} {x0 + w * .02:.1f},{h * .6:.1f} {x0 + w * .1 * s:.1f},{h:.1f} Z' fill='url(#{g})'/>"
                 f"<path d='M{x0:.1f},{h:.1f} C{x0 - w * .12 * s:.1f},{h * .45:.1f} {x0 + w * .05:.1f},{y0:.1f} {w:.1f},{y0 + h * .02:.1f}' fill='none' stroke='#FFFFFF' stroke-opacity='{a * 1.6:.2f}' stroke-width='2.5'/>")
    return _svg(x, y, w, h, body, defs, op)


def D_mesh(x, y, w, h, seed=2, n=90, dark=False, op=1.0):
    """3D 메시 파형(견본 5) — 봉우리 몇 개를 겹친 곡선 n 개가 깊이마다 조금씩 어긋나 그물 띠처럼"""
    rnd = random.Random(seed)
    peaks = [(rnd.uniform(.1, .9), rnd.uniform(.15, .45) * (1 if k % 2 else -1), rnd.uniform(.04, .09)) for k in range(6)]
    g = _gid("ms")
    m1, m2 = ("#78AAFF", "#BFD0FF") if dark else ("#1F4FFF", "#78AAFF")
    defs = _lg(g, [(0, m1, 0), (.15, m1, .8), (.5, m2, .9), (.85, m1, .8), (1, m1, 0)])
    body = []
    for i in range(n):
        t = i / (n - 1)
        pts = []
        for k in range(161):
            u = k / 160
            v = sum(a * (0.55 + 0.45 * math.cos(t * math.pi * 2 + c * 9)) * math.exp(-((u - c) ** 2) / (2 * s * s)) for c, a, s in peaks)
            v += 0.05 * math.sin(u * 14 + t * 6)
            pts.append(f"{u * w:.1f},{h / 2 - v * h + (t - .5) * h * .12:.1f}")
        body.append(f"<polyline points='{' '.join(pts)}' fill='none' stroke='url(#{g})' stroke-width='.8' stroke-opacity='{.25 + .5 * math.sin(t * math.pi):.2f}'/>")
    return _svg(x, y, w, h, "".join(body), defs, op)


def D_netglobe(cx, cy, r, seed=3, n=110, dark=False, op=1.0):
    """점선 네트워크 지구(견본 6) — 원 안 점들을 가까운 이웃끼리 잇고 몇은 점선, 크기가 다른 점"""
    rnd = random.Random(seed)
    c = "#FFFFFF" if dark else "#0B1324"
    pts = []
    while len(pts) < n:
        px, py = rnd.uniform(-1, 1), rnd.uniform(-1, 1)
        if px * px + py * py < 0.96 and not (0.1 < px < 0.6 and -0.5 < py < -0.1 and rnd.random() < .8):   # 빈 땅 한 곳
            pts.append((px, py))
    body = [f"<circle cx='{r}' cy='{r}' r='{r}' fill='none' stroke='{c}' stroke-opacity='.12' stroke-width='1'/>"]
    for i, (px, py) in enumerate(pts):
        near = sorted(range(n), key=lambda j: (pts[j][0] - px) ** 2 + (pts[j][1] - py) ** 2)[1:4]
        for j in near:
            if j < i:
                continue
            dash = " stroke-dasharray='3 4'" if (i + j) % 3 == 0 else ""
            body.append(f"<line x1='{r + px * r:.1f}' y1='{r + py * r:.1f}' x2='{r + pts[j][0] * r:.1f}' y2='{r + pts[j][1] * r:.1f}' stroke='{c}' stroke-opacity='.28' stroke-width='1'{dash}/>")
    for i, (px, py) in enumerate(pts):
        rr = (2.2, 3.2, 4.5, 7)[i % 4 if i % 7 else 3]
        body.append(f"<circle cx='{r + px * r:.1f}' cy='{r + py * r:.1f}' r='{rr}' fill='{'#78AAFF' if i % 9 == 0 else c}' fill-opacity='{.25 if rr > 6 else .55}'/>")
    return _svg(cx - r, cy - r, 2 * r, 2 * r, "".join(body), "", op)


def _icosphere():
    t = (1 + 5 ** 0.5) / 2
    v = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t), (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    f = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
         (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    norm = lambda p: tuple(c / math.sqrt(sum(x * x for x in p)) for c in p)
    v = [norm(p) for p in v]
    cache, nf = {}, []
    def mid(a, b):
        k = (min(a, b), max(a, b))
        if k not in cache:
            cache[k] = len(v)
            v.append(norm(tuple((v[a][i] + v[b][i]) / 2 for i in range(3))))
        return cache[k]
    for a, b, c in f:
        ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
        nf += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
    edges = {(min(a, b), max(a, b)) for tri in nf for a, b in ((tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0]))}
    return v, edges


def D_geo(cx, cy, r, mono=False, dark=False, op=1.0):
    """지오데식 와이어 구(견본 7·8) — 정이십면체를 한 번 나눈 42점, 앞면은 진하게 뒷면은 옅게. mono = 흑백판"""
    v, edges = _icosphere()
    ry, rx = 0.5, 0.35
    P = []
    for X, Y, Z in v:
        X, Z = X * math.cos(ry) - Z * math.sin(ry), X * math.sin(ry) + Z * math.cos(ry)
        Y, Z = Y * math.cos(rx) - Z * math.sin(rx), Y * math.sin(rx) + Z * math.cos(rx)
        P.append((r + X * r, r + Y * r, Z))
    front = "#FFFFFF" if dark else ("#0B1324" if mono else "#1F4FFF")
    back = "#FFFFFF" if dark else ("#9AA3B2" if mono else "#BFD0FF")
    lines = sorted(edges, key=lambda e: P[e[0]][2] + P[e[1]][2])
    body = []
    for a, b in lines:
        z = (P[a][2] + P[b][2]) / 2
        f = z > 0
        body.append(f"<line x1='{P[a][0]:.1f}' y1='{P[a][1]:.1f}' x2='{P[b][0]:.1f}' y2='{P[b][1]:.1f}' stroke='{front if f else back}' "
                    f"stroke-opacity='{(.8 if f else .55) * (.5 if dark else 1):.2f}' stroke-width='{1.4 if f else 1.6}'/>")
    for X, Y, Z in sorted(P, key=lambda p: p[2]):
        f = Z > 0
        body.append(f"<circle cx='{X:.1f}' cy='{Y:.1f}' r='{5 if f else 7}' fill='{front if f else back}' fill-opacity='{(.95 if f else .6) * (.6 if dark else 1):.2f}'/>")
    return _svg(cx - r, cy - r, 2 * r, 2 * r, "".join(body), "", op)


def decor(kind, n, has_img=False, theme="a"):
    """레이아웃마다 허전한 자리에 포인트 하나 — 많이 넣지 않는다(사용자 2026-10-16 "많이는 말고 허전한 곳에 포인트로").
    n = 쪽 번호(같은 레이아웃이 반복되면 모양·씨앗을 바꿔 단조롭지 않게). 바탕 큰 글자(_bigword)가 있는 선언 쪽은 그것이 포인트라 더하지 않는다.
    밝은 바탕은 진한 파랑, 어두운 바탕은 밝은 파랑(dark=True). 테마 B 는 표지·간지·연락처도 밝은 바탕"""
    alt = n % 3
    if theme == "c":   # 솔리드 컬러 — 흰색 선·점만 옅게(dark=True 계열이 toned 로 톤의 밝은 색이 된다)
        if kind == "cover":
            return D_geo(1440, 540, 330, dark=True, op=.45)   # 오른쪽 빈 자리에 흰 와이어 구 하나(사용자 2026-10-16 "표지 우측에 뭐라도")
        if kind == "section":
            return [D_geo(1500, 540, 300, dark=True, op=.45), D_arcs(1500, 540, 330, seed=n, dark=True, op=.4), D_netglobe(1500, 540, 300, seed=n, dark=True, op=.4)][alt]
        if kind == "contact":
            return D_mesh(0, 820, 1920, 260, seed=n, dark=True, op=.35)
        if kind in ("contents", "stats", "pillars", "history", "showcase", "clients", "awards", "vision"):
            return ""   # 본문은 글만 — 단색 소개서 결
    if theme == "d" and kind in ("contents", "stats", "pillars", "history", "showcase", "clients", "awards", "services"):
        return ""   # 본문은 바탕의 주색 언덕이 꾸밈(당근박스 덱 결)
    if theme == "d":   # 프렌들리 라운드 — 표지는 큰 주색 원, 간지(주색 전면)는 흰 네트워크, 연락처는 파스텔 원
        if kind == "cover":
            # 원은 반투명 + 곱하기 혼합 — 겹치는 자리에 색이 섞인다(사용자 2026-10-16 "약간 투명하게 해서 겹치는 부분의 색상이 겹치는 센스")
            return ("<div class='deco' style=\"left:1140px;top:160px;width:760px;height:760px;right:auto;bottom:auto;border-radius:50%;background:#1F4FFF;opacity:.88;mix-blend-mode:multiply\"></div>"
                    "<div class='deco' style=\"left:1000px;top:640px;width:340px;height:340px;right:auto;bottom:auto;border-radius:50%;background:#78AAFF;opacity:.75;mix-blend-mode:multiply\"></div>"
                    "<div class='deco' style=\"left:1640px;top:60px;width:220px;height:220px;right:auto;bottom:auto;border-radius:50%;background:#3D7BFF;opacity:.7;mix-blend-mode:multiply\"></div>")
        if kind == "section":
            return D_netglobe(1500, 540, 320, seed=n, dark=True, op=.5) if has_img else [D_geo(1500, 540, 300, dark=True, op=.6), D_arcs(1500, 540, 330, seed=n, dark=True, op=.55), D_mesh(900, 360, 1020, 380, seed=n, dark=True, op=.6)][alt]
        if kind == "contact":
            return ("<div class='deco' style=\"left:1620px;top:-80px;width:340px;height:340px;right:auto;bottom:auto;border-radius:50%;background:#BFD0FF;opacity:.8;mix-blend-mode:multiply\"></div>"
                    "<div class='deco' style=\"left:1540px;top:140px;width:160px;height:160px;right:auto;bottom:auto;border-radius:50%;background:#78AAFF;opacity:.6;mix-blend-mode:multiply\"></div>")
    if theme == "b":
        if kind == "cover":
            return D_ribbon(1240, 0, 640, 1080, op=.85)
        if kind == "section":
            return D_arcs(1500, 540, 330, seed=n, op=.55) if has_img else [D_geo(1500, 540, 300, op=.7), D_fan(1020, 0, 900, 700, op=.6), D_netglobe(1500, 540, 300, seed=n, op=.7)][alt]
        if kind == "contact":
            return D_fan(1100, 0, 820, 560, op=.45)
    if kind == "cover":
        return D_geo(1490, 540, 400, dark=True, op=.45) if has_img else D_silk(700, 0, 1220, 1080, op=1)
    if kind == "section":
        return D_arcs(1500, 540, 360, seed=n, dark=True, op=.55) if has_img else [D_geo(1500, 540, 300, dark=True, op=.6), D_mesh(900, 360, 1020, 380, seed=n, dark=True, op=.7), D_netglobe(1500, 540, 300, seed=n, dark=True, op=.6)][alt]
    if kind == "contents":
        return D_fan(0, 600, 720, 480, corner="bl", op=.5)
    if kind == "stats":
        return D_mesh(0, 860, 1920, 220, seed=n, op=.4)
    if kind == "pillars":
        return D_geo(1660, 250, 100, op=.6)   # 오른쪽 위 꼬리표(y 64) 아래로
    if kind == "history":
        return [D_netglobe(1690, 250, 160, seed=n, op=.55), D_mesh(0, 860, 1920, 220, seed=n, op=.4), D_geo(1690, 250, 140, mono=True, op=.45)][alt]
    if kind == "showcase":
        return D_fan(0, 830, 880, 250, corner="bl", op=.4)
    if kind == "clients":
        return D_arcs(1660, 250, 110, seed=n, op=.6)
    if kind == "awards":
        return D_geo(1690, 860, 150, op=.5)
    if kind == "vision":
        return D_netglobe(1560, 470, 300, seed=n, dark=True, op=.5)
    if kind == "contact":
        return D_silk(900, 0, 1020, 760, op=.9)
    return ""


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
        out += T(f"{i + 1:02d}", "", f"left:860px;top:{y}px;font-size:56px;font-weight:900;color:var(--blue);letter-spacing:-0.03em;line-height:1", rich=False, zone=True)
        out += T(it, "", f"left:1000px;top:{y + 4}px;width:800px;font-size:46px;font-weight:800;line-height:1.1;letter-spacing:-0.04em", rich=False, zone=True)
        if i < n - 1:
            out += R(f"left:860px;top:{y + gap - 30}px;width:940px;height:2px;background:var(--line);border:0;border-radius:0;box-shadow:none", zone=True)
    return "light", GLOW_LIGHT + out


def L_statement(d):
    return "light", (GLOW_LIGHT + _bigword(d.get("word"))
                     + T(d.get("eyebrow"), "eb", "left:120px;top:250px", rich=False)
                     + T(d.get("headline"), "h", "left:120px;top:300px;width:1680px;height:270px;font-size:96px;line-height:1.16;letter-spacing:-0.05em", fit=True)
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
        out += R(f"left:{x}px;top:{y}px;width:{cw}px;height:{ch}px", zone=True)
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
    # 칸 자리 — 4개면 2×2, 3개면 첫 칸을 왼쪽 세로로 길게 + 오른쪽 둘(빈 칸이 남지 않게, 10-16 시험 작업), 2개 이하면 위아래로
    if len(items) == 3:
        slots = [(980, 200, cw, 640), (980 + cw + gap, 200, cw, chh), (980 + cw + gap, 200 + chh + gap, cw, chh)]
    elif len(items) <= 2:
        slots = [(980, 200 + k * (chh + gap), 820, chh) for k in range(len(items))]
    else:
        slots = [(980 + (k % 2) * (cw + gap), 200 + (k // 2) * (chh + gap), cw, chh) for k in range(len(items))]
    for i, it in enumerate(items):
        x, y, cw, chh = slots[i]
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
        out += T(it, "", f"left:{x + 16}px;top:{y}px;width:{cw - 32}px;height:{chh}px;line-height:{chh + 2}px;font-size:28px;font-weight:800;text-align:center;letter-spacing:-0.03em;white-space:nowrap", rich=False)
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
            # 카드 안 글 묶음(이름 31 + 간격 12 + 주소 1줄 32 = 75)은 카드 세로 중심에 — 위·아래 여백 같게(사용자 2026-10-16 "카드 내 세로 중심", 검사 CARD_JS)
            out += R(f"left:{x}px;top:780px;width:{cw}px;height:170px;background:rgba(255,255,255,.06);border:2px solid rgba(255,255,255,.14);border-radius:24px;box-shadow:none", cls="card-v")
            out += T(o.get("name"), "", f"left:{x + 32}px;top:{780 + (170 - 107) / 2:.0f}px;font-size:26px;line-height:31px;font-weight:900;color:#fff", rich=False)
            out += T(o.get("addr"), "", f"left:{x + 32}px;top:{780 + (170 - 107) / 2 + 43:.0f}px;width:{cw - 64}px;height:64px;font-size:21px;line-height:32px;color:rgba(255,255,255,.7)", rich=False, fit=True)
    return "dark", out


# ───────────────────────── 테마별 본문 변형 — 네 테마가 같은 뼈대로 "공장에서 찍어낸 듯" 보이지 않게(사용자 2026-10-16, design/ppt sample 구성 참고:
# 숫자 타일·세로 타임라인·번호 목록·반쪽 색 면·둥근 알약). 테마 C(매거진)는 편집 디자인, D(프렌들리)는 둥근 파스텔 면, B 는 편집 변형 일부
def V_stats_tiles(d):
    """숫자 2×2 타일(오른쪽) + 왼쪽 큰 머리글 — ref_058·IR 덱의 숫자 타일"""
    items = (d.get("items") or [])[:4]
    out = GLOW_LIGHT + T(d.get("eyebrow"), "eb", "left:120px;top:200px", rich=False)
    out += T(d.get("headline"), "h", "left:120px;top:250px;width:700px;height:300px;font-size:72px;line-height:1.16", fit=True)
    out += T(d.get("sub") or "", "sub", "left:124px;top:600px;width:640px;height:120px", rich=False, fit=True)
    gap, cw, ch = 24, 388, 300
    for i, it in enumerate(items):
        x, y = 980 + (i % 2) * (cw + gap), 200 + (i // 2) * (ch + gap)
        out += R(f"left:{x}px;top:{y}px;width:{cw}px;height:{ch}px")
        out += T(it.get("label"), "", f"left:{x + 36}px;top:{y + 36}px;width:{cw - 72}px;font-size:24px;font-weight:700;color:var(--muted)", rich=False)
        val = html.escape(str(it.get("value") or "")) + (f"<span style='font-size:34px;letter-spacing:-0.02em'> {html.escape(str(it.get('unit')))}</span>" if it.get("unit") else "")
        out += T(val, "", f"left:{x + 32}px;top:{y + 100}px;width:{cw - 64}px;height:120px;font-size:104px;font-weight:900;line-height:1.1;color:var(--blue);letter-spacing:-0.06em;white-space:nowrap", fit=True, raw=True)
        out += T(it.get("note"), "", f"left:{x + 36}px;top:{y + ch - 60}px;width:{cw - 72}px;font-size:20px;color:var(--muted);white-space:nowrap", rich=False)
    return "light", out


def V_stats_band(d):
    """주색 둥근 띠 위 숫자 한 줄 + 위 머리글 — 당근풍"""
    items = (d.get("items") or [])[:4]
    n = max(1, len(items))
    out = GLOW_LIGHT + _head(d, 190)
    out += T(d.get("sub") or "", "sub", "left:120px;top:330px;width:1200px", rich=False)
    out += R("left:120px;top:460px;width:1680px;height:440px;background:var(--blue);border:0;border-radius:56px;box-shadow:none")
    cw = 1680 // n
    for i, it in enumerate(items):
        x = 120 + i * cw
        if i:
            out += R(f"left:{x}px;top:540px;width:2px;height:280px;background:rgba(255,255,255,.25);border:0;border-radius:0;box-shadow:none")
        out += T(it.get("label"), "", f"left:{x + 56}px;top:530px;width:{cw - 100}px;font-size:26px;font-weight:700;color:rgba(255,255,255,.8)", rich=False)
        val = html.escape(str(it.get("value") or "")) + (f"<span style='font-size:40px;letter-spacing:-0.02em'> {html.escape(str(it.get('unit')))}</span>" if it.get("unit") else "")
        out += T(val, "", f"left:{x + 52}px;top:600px;width:{cw - 90}px;height:150px;font-size:120px;font-weight:900;line-height:1.1;color:#fff;letter-spacing:-0.06em;white-space:nowrap", fit=True, raw=True)
        out += T(it.get("note"), "", f"left:{x + 56}px;top:790px;width:{cw - 100}px;font-size:21px;color:rgba(255,255,255,.75);white-space:nowrap", rich=False)
    return "light", out


def V_pillars_list(d):
    """번호 목록(헤어라인) — 편집 디자인: 왼쪽 머리글, 오른쪽 01~04 행마다 제목·설명·아이콘"""
    items = (d.get("items") or [])[:4]
    out = GLOW_LIGHT + T(d.get("eyebrow"), "eb", "left:120px;top:200px", rich=False)
    out += T(d.get("headline"), "h", "left:120px;top:250px;width:620px;height:300px;font-size:68px;line-height:1.18", fit=True)
    out += T(d.get("sub") or "", "sub", "left:124px;top:600px;width:560px;height:120px", rich=False, fit=True)
    rh = 170
    for i, it in enumerate(items):
        y = 200 + i * rh
        if i:
            out += R(f"left:860px;top:{y}px;width:940px;height:1px;background:var(--line);border:0;border-radius:0;box-shadow:none")
        out += T(f"{i + 1:02d}", "", f"left:860px;top:{y + 30}px;font-size:26px;font-weight:800;color:var(--blue)", rich=False)
        out += T(it.get("title"), "", f"left:960px;top:{y + 24}px;width:480px;height:80px;font-size:34px;font-weight:800;line-height:1.2;letter-spacing:-0.035em", rich=False, fit=True)
        out += T(it.get("desc"), "", f"left:960px;top:{y + 100}px;width:560px;height:56px;font-size:21px;line-height:1.5;color:var(--body)", rich=False, fit=True)
        out += I(it.get("_img"), f"left:1680px;top:{y + 30}px;width:110px;height:110px")
    return "light", out


def V_pillars_blocks(d):
    """2×2 파스텔 둥근 면, 아이콘 크게 — 당근풍"""
    items = (d.get("items") or [])[:4]
    out = GLOW_LIGHT + _head(d, 150)
    out += T(d.get("sub") or "", "sub", "left:120px;top:290px;width:1500px", rich=False)
    gap, cw, ch = 24, 828, 270
    for i, it in enumerate(items):
        x, y = 120 + (i % 2) * (cw + gap), 390 + (i // 2) * (ch + gap)
        out += R(f"left:{x}px;top:{y}px;width:{cw}px;height:{ch}px", zone=True)
        out += I(it.get("_img"), f"left:{x + 40}px;top:{y + 45}px;width:180px;height:180px")
        out += T(f"{i + 1:02d}", "", f"left:{x + 270}px;top:{y + 44}px;font-size:22px;font-weight:900;color:var(--blue);letter-spacing:.04em", rich=False)
        out += T(it.get("title"), "", f"left:{x + 270}px;top:{y + 82}px;width:{cw - 310}px;height:84px;font-size:38px;font-weight:900;line-height:1.15;letter-spacing:-0.04em", rich=False, fit=True)
        out += T(it.get("desc"), "", f"left:{x + 270}px;top:{y + 172}px;width:{cw - 310}px;height:70px;font-size:22px;line-height:1.5;color:var(--body)", rich=False, fit=True)
    return "light", out


def V_history_vertical(d):
    """세로 타임라인 두 열 — 편집 디자인(연도 크게, 가는 세로선)"""
    items = (d.get("items") or [])[:8]
    out = GLOW_LIGHT + _head(d, 150)
    half = (len(items) + 1) // 2
    rh = min(150, 600 // max(1, half))
    for i, it in enumerate(items):
        col, row = (0, i) if i < half else (1, i - half)
        x, y = 120 + col * 860, 330 + row * rh
        out += R(f"left:{x + 200}px;top:{y}px;width:1px;height:{rh}px;background:var(--line);border:0;border-radius:0;box-shadow:none")
        out += R(f"left:{x + 194}px;top:{y + 14}px;width:13px;height:13px;background:var(--blue);border:0;border-radius:7px;box-shadow:none")
        out += T(it.get("year"), "", f"left:{x}px;top:{y}px;width:170px;font-size:40px;font-weight:900;letter-spacing:-0.03em;color:var(--blue);text-align:right", rich=False)
        out += T(it.get("text"), "", f"left:{x + 240}px;top:{y + 6}px;width:560px;height:90px;font-size:24px;line-height:1.45;color:var(--body)", rich=False, fit=True)
    return "light", out


def V_history_pills(d):
    """연도 알약 한 줄 + 아래 글 — 당근풍"""
    items = (d.get("items") or [])[:7]
    n = max(1, len(items))
    out = GLOW_LIGHT + _head(d, 170)
    cw = 1680 // n
    pw = min(cw - 20, 150)
    out += R("left:120px;top:520px;width:1680px;height:6px;background:var(--sky);border:0;border-radius:3px;box-shadow:none", zone=True)
    for i, it in enumerate(items):
        x = 120 + i * cw
        last = i == n - 1
        out += R(f"left:{x}px;top:470px;width:{pw}px;height:106px;background:{'var(--blue)' if last else 'var(--sky)'};border:0;border-radius:53px;box-shadow:none", zone=True)
        out += T(it.get("year"), "", f"left:{x}px;top:496px;width:{pw}px;font-size:40px;font-weight:900;letter-spacing:-0.03em;text-align:center;color:{'#fff' if last else 'var(--blue)'}", rich=False)
        out += T(it.get("text"), "", f"left:{x + 6}px;top:620px;width:{cw - 30}px;height:200px;font-size:23px;line-height:1.5;color:var(--body)", rich=False, fit=True, zone=True)
    return "light", out


def V_clients_text(d):
    """이름 글자만 3열, 헤어라인 — 편집 디자인(칩 없음)"""
    items = [str(x) for x in (d.get("items") or []) if str(x).strip()][:24]
    out = GLOW_LIGHT + _head(d, 150) + T(d.get("sub"), "sub", "left:120px;top:290px;width:1500px", rich=False)
    cols = 3
    rows = (len(items) + cols - 1) // cols
    rh = min(72, 600 // max(1, rows))
    cw = 1680 // cols
    for i, it in enumerate(items):
        x, y = 120 + (i % cols) * cw, 400 + (i // cols) * rh
        out += R(f"left:{x}px;top:{y + rh - 1}px;width:{cw - 40}px;height:1px;background:var(--line);border:0;border-radius:0;box-shadow:none")
        out += T(it, "", f"left:{x}px;top:{y + rh / 2 - 17}px;width:{cw - 40}px;height:34px;font-size:26px;font-weight:700;letter-spacing:-0.02em;white-space:nowrap", rich=False, fit=True)
    return "light", out


def V_clients_pills(d):
    """둥근 알약 그리드 — 당근풍(파스텔, 주색 글자)"""
    items = [str(x) for x in (d.get("items") or []) if str(x).strip()][:24]
    cols = 6 if len(items) > 12 else 4
    rows = (len(items) + cols - 1) // cols
    gap, cw = 16, (1680 - 16 * (cols - 1)) // cols
    chh = min(96, (560 - gap * (rows - 1)) // max(1, rows))
    out = GLOW_LIGHT + _head(d, 150) + T(d.get("sub"), "sub", "left:120px;top:290px;width:1500px", rich=False)
    for i, it in enumerate(items):
        x, y = 120 + (i % cols) * (cw + gap), 400 + (i // cols) * (chh + gap)
        out += R(f"left:{x}px;top:{y}px;width:{cw}px;height:{chh}px;border-radius:{chh // 2}px", "chip", zone=True)
        out += T(it, "", f"left:{x + 16}px;top:{y}px;width:{cw - 32}px;height:{chh}px;line-height:{chh + 2}px;font-size:26px;font-weight:800;text-align:center;color:var(--blue);letter-spacing:-0.03em;white-space:nowrap", rich=False)
    return "light", out


def V_awards_big(d):
    """연도 크게 한 열 — 편집 디자인"""
    items = (d.get("items") or [])[:8]
    out = GLOW_LIGHT + T(d.get("eyebrow"), "eb", "left:120px;top:200px", rich=False)
    out += T(d.get("headline"), "h", "left:120px;top:250px;width:620px;height:300px;font-size:68px;line-height:1.18", fit=True)
    rh = min(88, 680 // max(1, len(items)))
    for i, it in enumerate(items):
        y = 200 + i * rh
        if i < len(items) - 1:   # 구분선은 행 사이에만(사용자 2026-10-16 "마지막 행 아래 라인 없어야")
            out += R(f"left:860px;top:{y + rh - 1}px;width:940px;height:1px;background:var(--line);border:0;border-radius:0;box-shadow:none", zone=True)
        out += T(it.get("year"), "", f"left:860px;top:{y + rh / 2 - 24}px;font-size:40px;font-weight:900;color:var(--blue);letter-spacing:-0.03em", rich=False, zone=True)
        out += T(it.get("text"), "", f"left:1010px;top:{y + rh / 2 - 17}px;width:790px;height:34px;font-size:25px;font-weight:600;white-space:nowrap", rich=False, fit=True, zone=True)
    return "light", out


def V_showcase_panel(d):
    """왼쪽 주색 큰 면(사진 자리 느낌) 안에 이름·태그라인, 오른쪽 번호 목록 — 반쪽 색 면 구성"""
    items = (d.get("items") or [])[:4]
    out = GLOW_LIGHT + R("left:120px;top:170px;width:780px;height:760px;background:var(--blue);border:0;border-radius:32px;box-shadow:none")
    out += T(d.get("eyebrow") or "CORE WORKS", "", "left:180px;top:230px;font-size:20px;font-weight:800;letter-spacing:.16em;color:rgba(255,255,255,.7);text-transform:uppercase", rich=False)
    out += T(d.get("name"), "", "left:176px;top:300px;width:680px;height:150px;font-size:116px;font-weight:900;line-height:1.1;letter-spacing:-0.06em;color:#fff;white-space:nowrap", rich=False, fit=True)
    out += T(d.get("tagline"), "", "left:180px;top:480px;width:660px;font-size:34px;font-weight:800;color:rgba(255,255,255,.9);letter-spacing:-0.03em", rich=False)
    out += T(d.get("desc"), "", "left:180px;top:560px;width:640px;height:200px;font-size:25px;line-height:1.55;color:rgba(255,255,255,.8)", rich=False, fit=True)
    out += T(d.get("url") or "", "", "left:180px;top:840px;font-size:22px;font-weight:600;color:rgba(255,255,255,.6)", rich=False)
    rh = min(180, 740 // max(1, len(items)))
    for i, it in enumerate(items):
        y = 180 + i * rh
        if i < len(items) - 1:
            out += R(f"left:980px;top:{y + rh - 1}px;width:820px;height:1px;background:var(--line);border:0;border-radius:0;box-shadow:none", zone=True)
        out += T(f"{i + 1:02d}", "", f"left:980px;top:{y + 30}px;font-size:26px;font-weight:900;color:var(--blue)", rich=False, zone=True)
        out += T(it.get("title"), "", f"left:1070px;top:{y + 24}px;width:700px;height:80px;font-size:36px;font-weight:900;line-height:1.2;letter-spacing:-0.04em", rich=False, fit=True, zone=True)
        out += T(it.get("desc"), "", f"left:1070px;top:{y + 106}px;width:700px;height:34px;font-size:22px;color:var(--muted);white-space:nowrap", rich=False, fit=True, zone=True)
    return "light", out


# 테마 → 레이아웃 변형. 없는 것은 기본(A 뼈대)
VARIANTS = {
    "b": {"stats": V_stats_tiles, "history": V_history_vertical, "awards": V_awards_big},
    "c": {"stats": V_stats_band, "pillars": V_pillars_blocks, "history": V_history_pills, "clients": V_clients_pills, "awards": V_awards_big, "showcase": V_showcase_panel},
    "d": {"stats": V_stats_band, "pillars": V_pillars_blocks, "history": V_history_pills, "clients": V_clients_pills, "showcase": V_showcase_panel},
}


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


def slide_html(d, n, total, ctone="blue", ctheme="a"):
    ctheme = base_theme(ctheme)   # E~H 는 바탕 테마의 짜임 그대로(배경 묶음만 다름)
    fn =VARIANTS.get(ctheme, {}).get(d.get("kind")) or LAYOUT_FN.get(d.get("kind")) or L_statement
    if ctheme == "b" and d.get("kind") == "cover":   # 테마 B 표지는 큰 아이콘 없이 글과 선 다발로(ref_042)
        d["_img"] = None
    try:
        tone, body = fn(clean(d))
    except Exception:   # 칸이 크게 어긋난 쪽은 한 문장 선언으로 — 덱 전체를 멈추지 않는다
        d = {**{k: v for k, v in d.items() if k.startswith("_")}, "kind": "statement", "eyebrow": d.get("eyebrow") or "",
             "headline": d.get("headline") or d.get("title") or d.get("name") or "", "sub": d.get("sub") or d.get("desc") or ""}
        tone, body = L_statement(d)
    if ctheme == "c" and tone in ("dark", "blue"):   # 테마 C — 표지·간지·비전·연락처는 주색 전면 + 흰 글자(당근 소개서 결)
        body = body.replace(GLOW_DARK, GLOW_C, 1).replace(GLOW_BLUE, GLOW_C, 1)
        for x, y in C_INK:
            body = body.replace(x, y)
        tone = "blue"
    elif ctheme == "c":   # 본문 — 흰 바탕 + 내용 범위에만 옅은 크림 면(당근 본문). 면 위 선은 면 색보다 한 단계 진하게(공통 선 색은 면과 같아 안 보인다)
        body = body.replace(GLOW_LIGHT, GLOW_C_LIGHT, 1)
        for x, y in C_LINE:
            body = body.replace(x, y)
    elif ctheme == "d" and tone == "dark" and d.get("kind") == "section":   # 테마 D 간지는 주색 전면(흰 글자 그대로)
        body = body.replace(GLOW_DARK, GLOW_BLUE, 1).replace("color:var(--blue2)", "color:rgba(255,255,255,.38)")   # 큰 장 번호가 주색 바탕에 묻히지 않게
        tone = "blue"
    elif ctheme in LIGHT_GLOW and tone == "dark":   # 테마 B·C·D — 어두운 쪽(표지·간지·연락처)을 밝은 바탕으로: 흰 글자는 먹색으로
        body = body.replace(GLOW_DARK, LIGHT_GLOW[ctheme], 1).replace("rgba(255,255,255,", "rgba(11,19,36,").replace("color:#fff", "color:var(--ink)")
        tone = "light"
    elif ctheme in LIGHT_GLOW and tone == "light":
        body = body.replace(GLOW_LIGHT, LIGHT_GLOW[ctheme], 1)
    d["_tone"] = tone
    if d.get("_bg"):   # 테마 배경 그림(cp-bg-theme) — 바탕 전면에 깔고, 글 쪽(왼쪽)만 덮어 글이 읽히게. 장식은 더하지 않는다
        # 글자색은 배경 밝기로(사용자 2026-10-16 "글씨가 잘 안 보임" — 밝은 배경 위 흰 글자): 글 자리(왼쪽 절반) 평균 밝기 ≥150 이면 먹색 글자 + 흰 덮개
        light_bg = d.get("_bg_light")
        glow = next((g for g in (GLOW_DARK, GLOW_LIGHT, GLOW_BLUE, GLOW_B, GLOW_C, GLOW_C_LIGHT, GLOW_D) if body.startswith(g)), "")
        body = body[len(glow):]   # 바탕 빛은 배경 그림으로 바뀐다 — 아래 글자색 치환이 빛 코드까지 바꿔 자리를 못 찾던 것(밝은 배경 + 어두운 쪽, 2026-10-18 테마 E)
        if light_bg and tone in ("dark", "blue"):
            body = body.replace("rgba(255,255,255,", "rgba(11,19,36,").replace("color:#fff", "color:var(--ink)")
            for x, y in (("color:rgba(11,19,36,.45)", "color:var(--blue2)"), ("color:var(--blue2)", "color:var(--blue)"),
                         ("color:rgba(11,19,36,.38)", "color:var(--blue)")):   # 테마 D 간지 큰 장 번호(주색 전면용 흰 .38) → 밝은 배경에선 주색
                body = body.replace(x, y)
            # 연락처 사업장 카드(흰 반투명 면)는 밝은 배경에서 묻힌다 → 흰 카드 + 톤 옅은 테두리
            body = body.replace("background:rgba(11,19,36,.06);border:2px solid rgba(11,19,36,.14)", "background:#fff;border:2px solid var(--line)")
            tone = "light"
            d["_tone"] = tone   # 로고 흰색판·꼬리표·쪽번호도 밝은 바탕용으로
        veil = ("linear-gradient(90deg,rgba(5,11,36,.55) 0%,rgba(5,11,36,.25) 45%,rgba(5,11,36,0) 70%)" if tone == "dark"
                else "linear-gradient(90deg,rgba(31,79,255,.35) 0%,rgba(31,79,255,.1) 45%,rgba(31,79,255,0) 70%)" if tone == "blue"
                else "linear-gradient(90deg,rgba(255,255,255,.72) 0%,rgba(255,255,255,.4) 45%,rgba(255,255,255,0) 70%)")
        bgimg = (f"<div class='deco' style=\"background:url('{html.escape(d['_bg'])}') center/cover no-repeat\"></div>"
                 f"<div class='deco' style=\"background:{veil}\"></div>")
        body = (bgimg + body) if glow else body
        body = re.sub(r"<img data-x=\"i\" class=\"abs\" src=\"[^\"]*\" style=\"object-fit:contain;left:1[12]\d0px;top:2[36]0px;width:\d+px;height:\d+px\">", "", body)   # 표지·간지 큰 아이콘은 뺀다
        dec = ""
    else:
        try:   # 장식은 바탕 빛(GLOW) 바로 위·내용 아래에 — 바탕이 불투명이라 앞에 두면 가려진다
            dec = decor(d.get("kind"), n, bool(d.get("_img")), ctheme)
        except Exception:
            dec = ""
    for g in (GLOW_DARK, GLOW_LIGHT, GLOW_BLUE, GLOW_B, GLOW_C, GLOW_C_LIGHT, GLOW_D):
        if dec and body.startswith(g):
            body = g + dec + body[len(g):]
            break
    tag = TAGS.get(d.get("kind"), d.get("eyebrow") or "")
    chrome = _chrome(d, n, total, tag) if d.get("kind") != "cover" else _chrome(d, n, total, "")
    return (f"<!doctype html><html><head><meta charset='utf-8'><style>{_font_css()}{toned(_vars() + CSS + THEME_CSS.get(ctheme, ''), ctone)}</style></head>"
            f"<body><div class='s {tone if tone != 'light' else ''}'>{toned(body + chrome, ctone)}</div></body></html>")


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
      // 안쪽 여백(테마 B 의 알약 꼬리표)은 빼고 글이 놓이는 자리로 — 여백 자리의 바탕은 배경 그림에 남는다
      const pl = parseFloat(cs.paddingLeft) || 0, pt = parseFloat(cs.paddingTop) || 0, pr = parseFloat(cs.paddingRight) || 0, pb = parseFloat(cs.paddingBottom) || 0;
      Object.assign(box, { x: b.left + pl, y: b.top + pt, w: b.width - pl - pr, h: b.height - pt - pb });
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


def render(slides, out_dir, log=print, ctone="blue", ctheme="a"):
    """쪽마다 HTML → (미리보기 PNG, 배경 PNG, 잰 요소). 반환: [{html, preview, bg, boxes}]. ctone = 톤(TONES)"""
    from playwright.sync_api import sync_playwright
    os.makedirs(out_dir, exist_ok=True)
    res = []
    ctheme = base_theme(ctheme)
    with sync_playwright() as p:
        br = p.chromium.launch(args=["--force-color-profile=srgb", "--font-render-hinting=none", "--allow-file-access-from-files"])
        pg = br.new_page(viewport={"width": W_PX, "height": H_PX}, device_scale_factor=1)
        total = len(slides)
        for i, d in enumerate(slides, 1):
            hp = os.path.join(out_dir, f"s{i:02d}.html")
            open(hp, "w", encoding="utf-8").write(slide_html(d, i, total, ctone, ctheme))
            pg.goto("file:///" + hp.replace("\\", "/"))
            pg.evaluate("document.fonts.ready")
            pg.wait_for_load_state("networkidle")
            pg.evaluate(CARD_FIX_JS)   # 카드 안 글 묶음을 실측해 세로 중심으로(모든 테마)
            if ctheme == "c":
                pg.evaluate(C_BAR_JS, BAR_W)
                if d.get("_tone") == "light":
                    d["_padbox"] = pg.evaluate(C_PAD_JS, {"pad": PAD, "r": PAD_R})
            boxes = pg.evaluate(MEASURE_JS)
            prev = os.path.join(out_dir, f"s{i:02d}.png")
            pg.screenshot(path=prev)
            pg.add_style_tag(content=BAKE_CSS)
            bg = os.path.join(out_dir, f"s{i:02d}_bg.png")
            pg.screenshot(path=bg)
            res.append({"html": hp, "preview": prev, "bg": bg, "boxes": boxes, "tone": d.get("_tone"), "base": tone_base(ctone)})
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
        base = (r.get("base") or tone_base("blue")).get(r.get("tone"), (255, 255, 255))
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


# 테마별 배경(powerAssets cp-bg-theme 세트, 힉스필드 나노바나나 2.1 20장 — 사용자 2026-10-16 "힉스필드로 배경 만들어 파워에셋에 올리고 불러 쓰기").
# 파랑 계열로 만들어 두고 tint_icon 으로 톤 색조를 돌린다. 글자는 엔진 레이어가 얹는다(그림엔 글자 없음)
BG_SET = "cp-bg-theme"
BG_THEME_WORD = {"a": "다크", "b": "라이트", "c": "솔리드", "d": "프렌들리"}
BG_ROLE_WORD = {"cover": "표지", "section": "간지", "vision": "마무리", "contact": "마무리"}
BG_SECTION_WORDS = [["회사소개", "회사", "소개", "우리"], ["기술", "역량", "서비스", "데이터", "AI"], ["성장", "성과", "사업", "연혁", "수상", "고객"]]


def bg_is_light(path):
    """배경 그림의 글 자리(왼쪽 절반) 평균 밝기가 150 이상이면 밝은 배경 — 글자를 먹색으로"""
    from PIL import Image, ImageStat
    try:
        im = Image.open(path).convert("L")
        return ImageStat.Stat(im.crop((0, 0, im.width // 2, im.height))).mean[0] >= 150
    except Exception:
        return False


def _bg_file(job, theme, kind, title, k, used, d):
    """테마·역할·장 이름으로 배경 한 장 → (경로, 색 입히기 hue|duo) 또는 None.
    A~D: cp-bg-theme 에서 이름의 '역할 테마' 로 거르고, 간지는 장 이름 낱말로 회사/기술/성장 중. E~H: THEME_BG 묶음에서"""
    rows = _bg_candidates(theme, kind, title, k)
    if not rows:
        return None
    # 후보 중 하나를 작업 id 로 고른다 — 늘 첫 줄이면 같은 테마 작업이 모두 같은 표지(2026-10-18 배경 26장 추가 뒤). 같은 작업은 다시 돌려도 같은 그림
    rows = [x for x in rows if x["id"] not in used] or rows
    seed = int(__import__("hashlib").md5(f"{getattr(job, 'id', '')}:{kind}".encode()).hexdigest()[:8], 16)
    r = rows[seed % len(rows)]
    used.add(r["id"])
    p_ = _fetch_asset(r, d)
    return (p_, SET_TINT.get(_set_of(r), "hue")) if p_ else None


def _set_of(r):
    return (r.get("set") or {}).get("name") or r.get("set_name") or r.get("style_group") or ""


def _asset_rows(q, category, limit=40):
    import vertical
    try:
        return vertical._api("GET", "/assets/items?" + __import__("urllib.parse").parse.urlencode({"q": q, "category": category, "limit": limit})).get("data") or []
    except Exception:
        return []


def _fetch_asset(r, d):
    import vertical
    try:
        blob = vertical._api("GET", f"/assets/items/{r['id']}/file/original", raw=True)
    except Exception:
        return None
    p_ = os.path.join(d, f"bg_{r['id']}.jpg")
    open(p_, "wb").write(blob)
    return p_


def _bg_candidates(theme, kind, title, k):
    if theme in THEME_BG:   # E~H — 역할 구분 없는 묶음(쪽마다 다른 그림은 used 로)
        sset, word, _ = THEME_BG[theme]
        cat = "photo" if sset == "cp-photo-editorial" else "illust"
        rows, seen = [], set()
        for w in (word.split("|") if word else [""]):
            for r in _asset_rows(("회사소개서 실사" if cat == "photo" else "회사소개서 배경") + (f" {w}" if w else ""), cat, 60):
                if r["id"] not in seen and _set_of(r) == sset and (not w or w in str(r.get("name") or "")):
                    seen.add(r["id"])
                    rows.append(r)
        return rows
    tw, rw = BG_THEME_WORD.get(theme, "다크"), BG_ROLE_WORD.get(kind, "표지")
    q = f"{rw} {tw} 회사소개서 배경"
    grp = None
    if kind == "section":
        grp = next((i for i, ws in enumerate(BG_SECTION_WORDS) if any(w in str(title or "") for w in ws)), k % 3)
        q += " " + " ".join(BG_SECTION_WORDS[grp][:2])
    rows = [r for r in _asset_rows(q, "illust") if _set_of(r) == BG_SET and tw in str(r.get("name") or "") and rw in str(r.get("name") or "")]
    if grp is not None and rows:
        rows = [r for r in rows if any(w in str(r.get("name") or "") for w in BG_SECTION_WORDS[grp][:2])] or rows
    return rows


# 자유도 모드(2026-10-18 사용자 "테마 이미지로만이 아니라 파워에셋에서 적당한 걸 찾아 자유롭게") — 톤 색을 입힐 수 있는 세트만(파랑으로 만든 것·파스텔)
FREE_SETS = {"cp-bg-theme": "illust", "cp-bg-general": "illust", "cp-photo-editorial": "photo", "illust-keyvisual-glass": "illust"}
FREE_ROLE = {"cover": "표지", "section": "간지", "vision": "마무리", "contact": "마무리"}


def _free_bgs(job, deck, theme, d, used, log):
    """표지·간지·마무리 배경을 AI 가 파워에셋 후보에서 고른다 → {쪽 번호: (경로, 색 입히기)}.
    AI = 서버 kind 'build' — Claude 키가 있으면 Claude Opus 5.5, 없거나 소진이면 OpenRouter 글 모델(Muse). 실패하면 빈 dict(테마 배경으로)"""
    import design
    slots = [(k, s) for k, s in enumerate(deck["slides"]) if s["kind"] in FREE_ROLE]
    if not slots:
        return {}
    pool, cand = {}, {}
    comp = deck.get("company") or {}
    for k, s in slots:
        title = " ".join(str(s.get(x) or "") for x in ("title", "headline", "name")).replace("**", "").strip()
        qs = [x for x in [title, f"{FREE_ROLE[s['kind']]} 회사소개서 배경", "회사소개서 배경"] if x]
        ids = []
        for r in _bg_candidates(theme, s["kind"], title, k):   # 테마 기본 후보는 늘 넣는다
            pool[r["id"]] = r
            ids.append(r["id"])
        for q in qs:
            for sset_cat in sorted(set(FREE_SETS.values())):
                for r in _asset_rows(q, sset_cat, 30):
                    if _set_of(r) in FREE_SETS and r["id"] not in ids and len(ids) < 16:
                        pool[r["id"]] = r
                        ids.append(r["id"])
        cand[k] = ids
    light = base_theme(theme) != "a"
    lines = []
    for k, s in slots:
        title = " ".join(str(s.get(x) or "") for x in ("title", "headline", "name")).replace("**", "").strip()
        opts = "; ".join(f"{i}={pool[i].get('name')} [{_set_of(pool[i])}]" for i in cand[k])
        lines.append(f"- 쪽 {k} ({FREE_ROLE[s['kind']]}) 「{title[:60]}」 후보: {opts}")
    system = ("너는 회사소개서 장표의 아트 디렉터다. 표지·간지·마무리 쪽마다 배경 그림을 후보 중 하나씩 고른다.\n"
              "규칙: ① 쪽 내용과 어울리는 그림 ② 한 덱 안에서 결이 맞게 — 세트(대괄호)는 두 가지 이내로 묶는다 ③ 같은 그림을 두 번 쓰지 않는다 "
              f"④ 이 테마는 {'밝은' if light else '어두운'} 표지 계열 — 이름에 다크/라이트가 있으면 맞춘다 ⑤ 글은 왼쪽에 앉는다. "
              '출력은 JSON 하나만: {"picks":[{"k":쪽번호,"id":"후보 id"}],"why":"한 줄 이유"}')
    user = f"회사: {comp.get('name') or ''}\n테마: {COMPANY_THEMES.get(theme, '')}\n" + "\n".join(lines)
    try:
        r = design.ai(job, "build", {"messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                                     "max_tokens": 1500, "temperature": 0.2}, timeout=240)
        out = design.parse_json(design.text_of(r))
    except design.Budget:
        raise
    except Exception as e:
        log(f"자유도 — AI 배경 고르기가 실패해 테마 배경을 씁니다: {str(e)[:120]}", "warn")
        return {}
    res = {}
    for p in (out.get("picks") or []) if isinstance(out, dict) else []:
        try:
            k, i = int(p.get("k")), str(p.get("id"))
        except Exception:
            continue
        if k not in cand or k in res or i not in cand[k] or i in used:   # 같은 쪽을 두 번 고르면 첫 선택만
            continue
        f = _fetch_asset(pool[i], d)
        if f:
            used.add(i)
            res[k] = (f, SET_TINT.get(_set_of(pool[i]), "hue"))
    model = str(((r.get("pd") or {}).get("model")) or r.get("model") or "")
    log(f"자유도 — AI{f'({model})' if model else ''}가 파워에셋 후보 {len(pool)}장에서 배경 {len(res)}/{len(slots)}쪽을 골랐습니다. {str(out.get('why') or '')[:120]}", "done")
    return res


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


def attach_assets(job, deck, d, log=print, ctone="blue", ctheme="a", free=False):
    """그림 칸(_img) 채우기 — 표지·간지 큰 그림, 카드 아이콘(톤 색으로 색조를 돌린다). 로고(제안사 = 우리 회사)는 작업에 올린 vendor 로고.
    free = 자유도 — 표지·간지·마무리 배경을 테마 묶음에 묶지 않고 AI 가 파워에셋 후보에서 고른다"""
    import design
    used = set()
    comp = deck.get("company") or {}
    hero_q = ["데이터", "클라우드", "인공지능", "플랫폼", "네트워크", "보안", "서버"]
    bgused = set()
    freebg = _free_bgs(job, deck, ctheme, d, bgused, log) if free else {}
    for k, s in enumerate(deck["slides"]):
        if s["kind"] in ("cover", "section", "vision", "contact"):   # 테마 배경(A~D cp-bg-theme 46장 · E~H THEME_BG) — 톤은 hue(색조 돌리기)·duo(톤 한 색)로
            bg = freebg.get(k) or _bg_file(job, ctheme, s["kind"], s.get("title"), k, bgused, d)
            if bg:
                s["_bg"], s["_bgmode"] = bg
        if s["kind"] in ("cover", "section") and not s.get("_bg"):
            # 표지·간지의 큰 그림은 비면 쪽이 허전하다 — AI 검색어로 못 찾으면 기본 낱말을 차례로(10-16 시험 작업에서 표지 그림이 빔)
            qs = [s.get("icon")] if s.get("icon") else []
            qs += ["데이터베이스 클라우드", "클라우드 서버"] if s["kind"] == "cover" else []
            qs += hero_q[k % len(hero_q):] + hero_q[:k % len(hero_q)]
            for q in [x for x in qs if x]:
                s["_img"] = _icon_file(job, q, used, d)
                if s["_img"]:
                    break
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
        if s.get("_bg"):
            s["_bg_light"] = bg_is_light(s["_bg"])
            mode = s.pop("_bgmode", "hue")
            s["_bg"] = "file:///" + tint_bg(s["_bg"], s["_bg"][:-4] + f"_{ctone}.png", ctone, mode).replace("\\", "/")
            if mode == "duo":   # 톤 한 색으로 바꾼 뒤 밝기가 달라진다 — 글자색 판정은 바꾼 그림으로
                s["_bg_light"] = bg_is_light(s["_bg"][8:])
        if s.get("_img"):
            s["_img"] = "file:///" + tint_icon(s["_img"], s["_img"][:-4] + f"_{ctone}.png", ctone).replace("\\", "/")
        for it in s.get("items") or []:
            if isinstance(it, dict) and it.get("_img"):
                it["_img"] = "file:///" + tint_icon(it["_img"], it["_img"][:-4] + f"_{ctone}.png", ctone).replace("\\", "/")


def run(job, j, opts, brief, note):
    import design
    req, put_file = design.W["req"], design.W["put_file"]
    pages = int(opts.get("slides") or 0) or 14
    job.push("기획", 4)
    job.event("회사소개서 — 자료를 읽고 레이아웃 카탈로그에 맞춰 쪽을 구성합니다.")
    raw = design.load_context(job, 400000) or ""
    ctx = design.digest_context(job, raw) if raw else ""
    deck = plan(job, brief, note, ctx, pages)
    kinds = [s["kind"] for s in deck["slides"]]
    job.event(f"구성 완료 — {len(kinds)}쪽: " + " · ".join(kinds) + f". 비용 ${job.spent:.3f}", "done")
    d = os.path.join(job.dir, "_company")
    os.makedirs(d, exist_ok=True)
    job.push("기획", 30)
    ctone = str(opts.get("ctone") or "blue")
    ctone = ctone if (ctone in TONES or re.fullmatch(r"#[0-9A-Fa-f]{6}", ctone)) else "blue"
    ctheme = str(opts.get("ctheme") or "a")
    ctheme = ctheme if ctheme in COMPANY_THEMES else "a"
    ctone = ctone if ctone in TONES else "blue"
    free = bool(opts.get("cfree"))
    job.event(f"테마 {ctheme.upper()} {COMPANY_THEMES[ctheme]} · 톤 {tone_label(ctone)}" + (" · 자유도(파워에셋에서 배경을 AI 가 고름)" if free else ""))
    attach_assets(job, deck, d, log=job.event, ctone=ctone, ctheme=ctheme, free=free)
    json.dump(deck, open(os.path.join(d, "deck.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    try:
        put_file(job.id, "extra", os.path.join(d, "deck.json"), "회사소개서_구성.json")
    except Exception:
        pass
    job.push("시안 생성", 50)
    job.event("HTML 로 쪽을 그리고, 글·도형·그림을 재서 PPT 로 옮깁니다.")
    rendered = render(deck["slides"], os.path.join(d, "html"), log=lambda m: None, ctone=ctone, ctheme=ctheme)
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
        "summary": f"{comp.get('name') or '회사'} 회사소개서 {n}장(테마 {ctheme.upper()} {COMPANY_THEMES[ctheme]})",
        "stats": [{"label": "전체 장", "value": n}, {"label": "레이아웃", "value": len(set(kinds))}],
        "checklist": [{"slide": 0, "title": "사실 확인", "level": "info", "detail": "숫자·연혁·고객 이름은 자료에서 옮겼습니다. 보내기 전에 최신 값인지 확인해 주세요."}],
        "changes": []}})
