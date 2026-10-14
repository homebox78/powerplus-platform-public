# -*- coding: utf-8 -*-
"""디자인 타입별 '디자인 시스템 엔진' — 시안 이미지 지시문에 넣는 수치 규격.

왜: 예전 지시문은 색(남색 #1E3A8A / #0B2E6B~#1E40AF, 코발트 #3B6FD8 / #3B82F6)·안쪽 여백(4% / 3%)이 두 벌로 섞여 있고,
선 두께·모서리·글자 단계·아이콘 크기는 범위만 있어 장마다 다르게 나왔다. 여기서 타입마다 한 벌의 수치를 정하고
모든 장이 같은 값을 쓰게 한다. 수치는 16:9 본문 캔버스 1600×900 기준(px)이다 — 모델이 비율로 옮겨 그린다.

구성: BASE(모든 타입 공통 격자·글자·부품) + TYPES[id](색 역할·카드·아이콘·그림 화풍·금지) → spec_text(id, accent).
"""

BASE = {
    "grid": [
        "Canvas reference 1600×900 px (scale proportionally). Top 11% (≈100 px) stays EMPTY plain background — the headline is set later.",
        "12-column grid: outer side margins 48 px, gutter 20 px. Every block starts and ends on a column edge; blocks in one row share the same top edge and the same height unless the layout says otherwise.",
        "Vertical rhythm: 20 px between rows of blocks, 32 px empty at the very bottom. No block touches the image edge.",
    ],
    "type": [
        "ONE sans-serif Korean typeface (Gothic) for everything. Exactly two weights: BOLD for titles, labels, numbers, emphasized words; REGULAR for descriptions and list items.",
        "Type scale (px, at 1600×900): card/panel title 26 bold · body 18 regular · caption/source 14 regular · table text 16 · key number (KPI) 60–72 extra-bold · conclusion band text 24 bold · chip/badge label 15 bold.",
        "Every card title of the same kind is the SAME size and starts at the SAME x-offset inside its card. Line height 1.45. Lists use one bullet style (small round dot) with the same indent everywhere.",
        "No text shadow, glow, outline or gradient text. No ALL-CAPS English decoration words.",
    ],
    "shape": [
        "Strokes: card/panel border 1.5 px; inner dividers and table rules 1 px; connector arrows 3 px with a solid triangular head (identical heads everywhere); dashed lines 2 px, 6 px dash; chart axes 1 px.",
        "Corner radius: cards/panels 14 px · inner boxes/table outer 10 px · chips/badges fully rounded (pill) · picture slots 14 px. The same radius for the same kind of element on every slide.",
        "Padding: 24 px on all four sides inside every card/panel (identical left/right and top/bottom); 12 px between an icon and its text; 8 px between a title and its first line of text.",
        "Panel header band (44 px, text 20 bold, 24 px left padding) is used on AT MOST ONE key panel per slide. Every other block is separated by a pale tint fill, a thin rule, a bold title line or white space — NOT by its own colored header band.",
    ],
    "form": [
        "FORM FOLLOWS CONTENT: draw each block as the shape its content is, never as 'a box with a header band and a bullet list'. A schedule is a Gantt grid, stages are a rising staircase, a process is chevrons, results are big numbers, trends are a chart, current-vs-proposed is a small grey side against a large navy side.",
        "ONE HERO: the wireframe's widest form block (gantt / phase / flow / kpi / chart / table / fishbone / hub / pyramid / matrix / funnel / cycle / venn / roadmap / isostack / gauge / proportion / converge / ridge / petal / stage / screen) is the hero — it is the largest and darkest thing on the slide; the blocks beside it are lighter, smaller and quieter (Big–Middle–Small).",
        "READING FLOW: left = situation/evidence, center = our device (the hero), right = result/effect — or top → bottom. Make the flow visible with one or two large arrows or a progression of tone, not with many small arrows.",
        "Bullet lists stay short (2–5 lines) and live inside a block that already has a visual form; a slide must not be a grid of bullet boxes.",
        "NO EMPTY OR FILLER BOXES: draw only the blocks in the wireframe. Never add a box that holds only a title or one word, and never leave a box without its content.",
    ],
    "parts": [
        "CARD: {card}",
        "ICONS: {icon} Icon glyph 32 px; every icon in the deck is the same size, the same stroke weight and the same family. Use icons only where they label a block — not a circle icon on every card.",
        "KEY NUMBER (KPI): the number is the largest text in its block, the unit is 50% of the number size, a 1-line caption below in 15 px; numbers line up on their baseline when side by side.",
        "TABLE: header row filled with {tint_strong}, header text bold centered; body rows white with 1 px {line} rules, zebra not used; long text cells left-aligned, short uniform values centered, amounts/percentages right-aligned; 12 px cell padding.",
        "FLOW / STEPS: equal-width chevrons in one row, numbered 1·2·3 in small circles; steps go light→dark within the blue family (later = darker); a short description under each chevron; one arrow style only.",
        "GANTT: a real schedule grid — a {primary} header row of period cells (M, M+1 …), activity names in a left column (about 25% width), and for each activity a rounded horizontal bar spanning exactly its periods (blue family, light→dark by phase) with the bar text inside; milestones are small accent-colored diamond pins with a label above; 1 px {line} column rules. Never draw a schedule as cards or a bullet list.",
        "PHASE (staged scope): 2–5 adjacent columns or a semicircle that grow in height and in darkness from left to right (tint → secondary → {primary}); each stage shows its period (e.g. [2026]) large, its name bold and 1–3 short items; a thin rising arrow or baseline ties them together.",
        "KPI ROW: 2–4 big numbers side by side, each the largest text in its cell (60–72 px extra-bold, unit at 50%), a 1-line caption below; up/down arrows only when the content says increase/decrease; cells separated by thin vertical rules, not boxed cards.",
        "CONCLUSION BAND (only when the content has one): full width of the content area, 64 px high, {primary} fill, white 24 px bold text, centered. The band shows its WHOLE sentence on ONE line — if it is long, set the text smaller (down to 20 px) or make the band two lines tall; never cut, shorten or end it with '…'.",
        "CHARTS: flat bars/lines in the blue family, value labels on the bars, 1 px light grid, no 3D, no gradients on bars.",
        # 2026-10-12 PPT 레퍼런스 학습(docs/ppt-레퍼런스-디자인-학습-2026-10-12.md) — 사람이 만든 좋은 장표에서 반복된 표현
        "BEFORE/AFTER BARS: when a chart compares before and after, each category gets a pair of bars — the 'before' bar in light grey (#CBD5E1), the 'after' bar in {primary}; value labels on both, a two-item legend, the source line under the chart.",
        "OUR-COLUMN TABLE: when a comparison table has our column, only that column is emphasized — a 2 px {primary} outline around the whole column, its header filled {primary} with white bold text, its cells bold; the other columns stay plain grey text. Never color every column.",
        "KPI WITH SOURCE: a small outlined pill chip (category) above each big number when given, and ONE source line (caption 14 px, text_sub) under the KPI row — numbers without a source look invented.",
        "FISHBONE: one horizontal spine ending in an arrow at a dark {primary} head box on the RIGHT (the effect/problem); 4–6 slanted bones alternating above/below, each bone's category bold at its tip and 1–3 short causes beside it (not on the line).",
        "HUB: one dark {primary} circle in the center (our platform), 4–8 satellite nodes evenly around it on thin 1.5 px connectors; each node = small rounded box, bold name + one short line. No arrows between satellites.",
        "PYRAMID: 3–5 stacked trapezoid layers, the top narrowest and darkest ({primary}), lighter going down; layer name centered inside; one-line descriptions to the right on thin leader lines, all left-aligned on one x.",
        "2×2 MATRIX: an L-shaped axis with the axis names in plain text (horizontal name at bottom-right with '→', vertical name above the top-left with '↑'); the top-right quadrant is the target — filled {primary} with white text, the other three pale tint.",
        # 2026-10-14 원본 대조 보강(본문 228장·해외 레퍼런스 80장 원본 확인) — 반복 확인된 표현
        "KEY MESSAGE LINE: directly under the header band, one centered key-message sentence (optionally in 「 」 or [ ]) where only the key phrase takes {accent}; it is the slide's thesis, not a second title.",
        "CURRENT vs SOLUTION CARDS: for problem→solution, a left card with a grey-blue head (#64748B, '현황/AS-IS') and a right card with a {primary} head ('개선/TO-BE'), joined by one wedge arrow; the right card is slightly larger.",
        "SORTED BARS: a ranking chart sorts bars by value (largest first); the largest bars are darkest {primary}, smaller ones lighter tint, irrelevant 'others' in grey; one callout pill points at the bar the conclusion is about.",
        "FUNNEL WITH ROWS: each funnel layer lines up with a row — a short description on the left and the layer's number on the right at exactly the same height; only the one layer the message is about gets an {accent} band.",
        "HUB WITH TOTAL: when the parts add up to a total, the center circle shows the total number and each satellite shows its share as a small '+N%' pill.",
        "ISOSTACK FOCUS: when the slide explains one layer, that layer is solid {primary} and the other layers are pale/semi-transparent — never every layer at full color.",
        "CONVERGE-DIVERGE: 2–4 problem cards on the left (grey) whose curved lines meet in ONE {primary} circle (our answer), then a soft light fan opens to 2–4 solution cards on the right (tint heads); the circle is the darkest thing.",
        "RIDGE TIMELINE: a pale ridge silhouette rising left→right, a dot on each peak (later = darker {primary}), the year in {primary} bold on a small card above, the achievement in a small pill on the baseline below.",
        "NUMBER PETALS: a big {primary} center circle with the key number/phrase, 3–6 rounded petals numbered 01… around it (tint → {primary}), thin dotted leaders to short description cards in left/right columns.",
        "PLATFORM STAGE: a wide flat dark cylinder base (the platform name on it), a thin glowing ring above, 2–5 service circles floating over the ring at slightly different heights with an icon, bold name and one line each.",
    ],
    "quality": [
        "Pixel-precise alignment: left edges of stacked items line up; same-kind gaps are identical; nothing is crooked, overlapping or clipped.",
        "Generous white space: content fills about 80% of the body area (real proposals keep ~19% white, 2026-10-14 원본 확인), never cramped to the edges and never with large empty holes. "
        "Spread that white space as even margins and gaps between the blocks — the content spans the body area from just under the header to just above the footer line, "
        "so the last block (usually the key message band) ends close to the footer; never leave a blank band taller than about 5% of the body height below it.",
        "Big–Middle–Small: one dominant element, two or three secondary, the rest small text — never a grid of equal boxes with equal weight.",
        "Every Korean string is spelled exactly as given, sharp and evenly kerned; no broken syllables, no invented filler text, no lorem ipsum, no English labels.",
        "NO TEXT THAT IS NOT IN THE CONTENT: no invented speech bubbles, thought bubbles, questions, quotes, captions, slogans or labels — characters and pictures carry no words; a speech bubble appears only when the content gives its exact words.",
        "Every sentence is complete: no text is cut off at a box edge or shortened with '…' — shrink the text or widen the box instead.",
    ],
    "check": [
        "colors used = only the DESIGN SYSTEM palette (count them)",
        "each form block is drawn as its form (Gantt grid, staircase, chevrons, big numbers, chart) — not as a header-band box with bullets",
        "at most one panel header band on the slide; no empty or one-word boxes",
        "all cards: same border, radius, padding",
        "all icons: same family, size and stroke",
        "type sizes follow the scale; exactly two weights",
        "no text touches a card edge or a picture",
        "the wireframe's blocks, order and text are all present",
        "every string on the slide is in the given content (no invented bubble/question/caption) and none is cut off",
    ],
}

# 타입별 — 색은 역할로 정한다(1 가장 중요 → 4 가장 덜 중요). 같은 역할은 덱 전체에서 같은 값
TYPES = {
    "a": {   # 플랫 일러스트 — 흰 바탕, 코발트 계열, 부드러운 채색 2D 인물(2026-10-05 사용자 견본 15장)
        "name": "Flat illustration (soft painted 2D people)",
        "palette": [("primary (level 1: key panel header, KPI numbers, conclusion band, numbered badges)", "#1E3A8A"),
                    ("secondary (level 2: other panel headers, card titles, icons, connectors)", "#2F6FE0"),
                    ("tint_strong (table header, step 1 fill, icon circle)", "#DCE8FC"),
                    ("tint (card fill, large background shapes)", "#F4F8FF"),
                    ("line (borders, rules)", "#D5DEEC"),
                    ("picture_green (ONLY inside illustrations: check marks, OK states, a highlighted item, ties/lanyards)", "#3DBE8B"),
                    ("text", "#1F2937"), ("text_sub (descriptions)", "#4B5563"), ("caption", "#6B7280")],
        "card": "white fill, 1.5 px #D5DEEC border, 14 px radius, a very soft shadow (0 2px 8px rgba(30,58,138,0.06)); the one key panel may get a 44 px #1E3A8A header band; other blocks have no band (a bold #2F6FE0 title line instead).",
        "icon": "soft FLAT icons with a gentle painted gradient in cobalt/periwinkle (green #3DBE8B only for check/OK), on a pale #DCE8FC circle — same style as the people.",
        "picture": "soft flat 2D illustration with gentle painted shading (no outlines, no 3D, no clay): young Korean office workers with dot eyes, pink blush and calm smiles, navy/cobalt/periwinkle clothes, "
                   "people on the left facing a device or a pale frosted UI panel (placeholder bars, green check) on the right, on white with a pale blue desk shape — no text inside pictures.",
        "never": ["3D, clay or glossy renders", "thick black outlines", "dark backgrounds", "neon colors", "readable text inside pictures"],
    },
    "b": {   # 데이터 실사 합성 — 실사 + 시안 데이터 빛
        "name": "Photoreal data composite",
        "palette": [("primary (key panel header, KPI, conclusion band)", "#0B3A8C"), ("secondary (panel headers, titles, icons, connectors)", "#1D6FE0"),
                    ("glow (ONLY inside photographs: data lines, rings, chart light)", "#22D3EE"),
                    ("tint_strong (table header, icon circle)", "#DDEAFE"), ("tint (card fill)", "#F3F7FF"), ("line", "#D2DCEB"),
                    ("text", "#111827"), ("text_sub", "#4B5563"), ("caption", "#6B7280")],
        "card": "crisp white fill, 1.5 px #D2DCEB border, 14 px radius, soft shadow (0 4px 14px rgba(11,58,140,0.08)); the one key panel may get a #0B3A8C header band; other blocks have no band (a bold #1D6FE0 title line instead).",
        "icon": "clean cobalt LINE icons, 2 px stroke, on a pale #DDEAFE circle — NOT clay, NOT 3D.",
        "picture": "crisp real photographs of the project's field with glowing cyan holographic data graphics composited in, cool deep-blue grading, inside rounded 14 px frames.",
        "never": ["cyan glow on cards, text or bands (glow lives only inside photos)", "warm/beige tones", "clay or cartoon characters"],
    },
    "c": {   # 헥사곤 포토
        "name": "Hexagon photo",
        "palette": [("primary", "#1E3A8A"), ("secondary", "#2563EB"), ("tint_strong", "#DCE8FC"), ("tint", "#F4F8FF"), ("line", "#D5DEEC"),
                    ("text", "#1F2937"), ("text_sub", "#4B5563"), ("caption", "#6B7280")],
        "card": "white fill, 1.5 px #D5DEEC border, 14 px radius, very soft shadow; the one key panel may get a #1E3A8A header band; other blocks have no band (a bold #2563EB title line instead).",
        "icon": "cobalt LINE icons, 2 px stroke, inside small flat HEXAGON badges (#DCE8FC fill) — the hexagon is the deck's signature shape.",
        "picture": "real photographs cropped into flat-top HEXAGON frames of equal size, arranged with equal 12 px gaps; photo grading bright and cool.",
        "never": ["circles for icon badges (use hexagons)", "illustrations or clay", "hexagons of different sizes in one cluster"],
    },
    "d": {   # 스튜디오 포토 — 페리윙클 단색조, 젖빛 유리 카드
        "name": "Studio photo (periwinkle monochrome, frosted glass)",
        "palette": [("primary", "#1E2A5A"), ("secondary", "#4F6BD8"), ("tint_strong", "#DDE3F6"), ("tint (page/card tint)", "#EEF1F9"), ("line", "#D6DCEC"),
                    ("text", "#1E2A5A"), ("text_sub", "#4A5378"), ("caption", "#6B7290")],
        "card": "white FROSTED-GLASS cards (white at 85% over the #EEF1F9 tint), 1 px #D6DCEC border, 16 px radius, soft diffuse shadow (0 8px 24px rgba(30,42,90,0.08)); header text #1E2A5A without solid color bands (a thin 3 px #4F6BD8 top rule instead).",
        "icon": "minimal periwinkle LINE icons, 2 px stroke, on a #DDE3F6 circle.",
        "picture": "soft studio photographs: white miniature models and real props on a white desk, pale periwinkle light with soft window shadows.",
        "never": ["saturated blue bands", "pure black text", "busy backgrounds behind cards"],
    },
    "e": {   # 아이소메트릭 3D
        "name": "Isometric 3D",
        "palette": [("primary", "#1E3A8A"), ("secondary", "#1D4ED8"), ("glow (ONLY inside 3D renders: light lines)", "#60A5FA"),
                    ("tint_strong", "#DCE6FD"), ("tint", "#F2F6FF"), ("line", "#D3DCEE"),
                    ("text", "#1F2937"), ("text_sub", "#4B5563"), ("caption", "#6B7280")],
        "card": "white fill, 1.5 px #D3DCEE border, 14 px radius, soft shadow (0 4px 12px rgba(29,78,216,0.07)); the one key panel may get a #1E3A8A header band; other blocks have no band (a bold #1D4ED8 title line instead).",
        "icon": "small ISOMETRIC 3D icons (glossy white with electric-blue accents) of identical size and identical 30° iso angle.",
        "picture": "isometric 3D miniatures on glossy white rounded platforms, glowing electric-blue light lines, soft studio light, all at the same iso angle and scale.",
        "never": ["mixing iso angles or perspective views", "flat clay characters", "dark scenes"],
    },
    "f": {   # 딥 컬러 선화 — 가는 외곽선 플랫
        "name": "Deep color line art (thin-outline flat)",
        "palette": [("primary", "#1E2A5A"), ("secondary", "{accent}"), ("tint_strong", "#DCE7F7"), ("tint", "#F3F7FC"), ("line", "#D2DAE6"),
                    ("text", "#1E2A5A"), ("text_sub", "#4A5568"), ("caption", "#6B7280")],
        "card": "white fill, 1.5 px #D2DAE6 border, 12 px radius, NO shadow (flat); the one key panel may get a #1E2A5A header band; other blocks are white with a 3 px accent left rule.",
        "icon": "THIN-OUTLINE flat icons, 2 px #1E2A5A outline with one flat fill (accent or pale sky), on no background.",
        "picture": "thin-outline flat vector illustrations (2 px dark outlines, 2–3 flat colors: accent, navy, pale sky), small simple figures, same line weight as the icons.",
        "never": ["gradients", "3D or clay", "outlines thicker or thinner than 2 px"],
    },
}


def spec_text(type_id, accent="#FF2A6D"):
    """시안 지시문에 넣을 디자인 시스템 — 이 타입 한 벌의 수치. 모든 장이 같은 글을 받는다(일관성)"""
    t = TYPES.get(str(type_id or "a"), TYPES["a"])
    acc = accent or "#FF2A6D"
    pal = dict((k.split(" ")[0], v.replace("{accent}", acc)) for k, v in t["palette"])
    fill = {"card": t["card"], "icon": t["icon"], "primary": pal.get("primary", "#1E3A8A"),
            "tint_strong": pal.get("tint_strong", "#DCE8FC"), "line": pal.get("line", "#D5DEEC"),
            "accent": acc}   # 규칙 글의 {accent} — 빠져 있어 10-14 표현 규칙 추가 뒤 시안이 KeyError 'accent' 로 멈췄다
    L = [f"DESIGN SYSTEM — {t['name']} (follow these exact values on every slide of this deck; they override any other color or size mentioned elsewhere)"]
    L.append("PALETTE (use ONLY these colors, by role):")
    L += [f"- {k}: {v.replace('{accent}', acc)}" for k, v in t["palette"]]
    L.append(f"- accent: {acc} — ONLY for 1–3 key words and at most one warning/differentiator badge; never as a fill for cards or bands")
    for sec, head in (("form", "LAYOUT LOGIC"), ("grid", "GRID & SPACING"), ("type", "TYPOGRAPHY"), ("shape", "STROKES, RADII, PADDING"), ("parts", "COMPONENTS")):
        L.append(head + ":")
        L += ["- " + x.format(**fill) for x in BASE[sec]]
    L.append("PICTURE STYLE: " + t["picture"] + " Pictures support the message and stay within about 35% of the body.")
    L.append("QUALITY BAR:")
    L += ["- " + x for x in BASE["quality"]]
    L.append("NEVER: " + "; ".join(t["never"]) + ".")
    return "\n".join(L)


def final_check():
    """지시문 맨 끝에 — 마지막에 읽은 것을 가장 잘 지킨다"""
    return "FINAL SELF-CHECK before you output the image — fix anything that fails: " + "; ".join(BASE["check"]) + "."
