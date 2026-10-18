# 회사소개서(용도 회사소개용, 테마 A·B) 견본 — engine/templates/company/sample-solideo.json 을 엔진 렌더(company.render → to_pptx)로 그대로 만든다.
# 그림은 powerAssets 원본(storage/legacy-powerplus/uploads/icon/<icon>), 로고는 로컬 작업의 vendor.png 에서 심볼 부분만 자른다.
# 테마(company.COMPANY_THEMES: a·b) × 톤(company.TONES)마다 한 벌씩. AI 호출·운영 작업 생성 없음.
#   python scripts/company-sample.py [테마/톤 …]   → storage/tmp/company-sample/<테마>/<톤>/결과.pptx · html/sNN.png   (예: a/blue b/teal, 비우면 전부)
#   썸네일: apps/web/public/cstyles/<테마>/<톤>/N.jpg(전 쪽, 960×540) — 바꾸면 CompanyThemes.tsx 의 THUMB_V 를 올린다
import copy, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "engine"))
import company  # noqa: E402
from PIL import Image  # noqa: E402

ICONS = os.path.join(ROOT, "storage", "legacy-powerplus", "uploads", "icon")   # 운영 platform_data/legacy-powerplus/uploads/icon 에서 견본에 쓰는 것만 받아 둔다
LOGO = os.path.join(ROOT, "storage", "deck", "jobs", "05eb7dd4f868eb37", "brand", "vendor.png")   # 'solideo S. 솔리데오 컨소시엄' — 앞 심볼만
THUMBS = os.path.join(ROOT, "apps", "web", "public", "cstyles")
OUT = os.path.join(ROOT, "storage", "tmp", "company-sample")
# 테마 E~H 견본 배경(engine THEME_BG 묶음에서 쪽 역할별 한 장 — 실제 작업은 엔진이 작업마다 돌려 고른다)
SAMPLE_BG = {
    "e": {"cover": "cpphoto-CP1-P03.jpg", "div1": "cpphoto-CP1-P01.jpg", "div2": "cpphoto-CP1-P12.jpg", "div3": "cpphoto-CP1-P10.jpg", "end": "cpphoto-CP1-P06.jpg"},
    "f": {"cover": "cbbg-CB1-C01.jpg", "div1": "cbbg-CB1-C04.jpg", "div2": "cbbg-CB1-C08.jpg", "div3": "cbbg-CB1-C05.jpg", "end": "cbbg-CB1-C07.jpg"},
    "g": {"cover": "cbbg-CB1-A02.jpg", "div1": "cbbg-CB1-A04.jpg", "div2": "cbbg-CB1-A05.jpg", "div3": "cbbg-CB1-A09.jpg", "end": "cbbg-CB1-A08.jpg"},
    "h": {"cover": "cbbg-CB1-D03.jpg", "div1": "cbbg-CB1-B04.jpg", "div2": "cbbg-CB1-D06.jpg", "div3": "cbbg-CB1-B06.jpg", "end": "cbbg-CB1-D05.jpg"},
}


def one(theme, tone, src):
    out = os.path.join(OUT, theme, tone)
    os.makedirs(out, exist_ok=True)
    deck = copy.deepcopy(src)
    url = lambda p: "file:///" + p.replace("\\", "/")
    logo = os.path.join(out, "logo.png")
    im = Image.open(LOGO).convert("RGBA")
    im.crop((0, 0, 222, im.height)).save(logo)   # 'solideo S.' 까지(뒤 '솔리데오 컨소시엄' 글자 떼기)
    white = company._white_logo(logo, os.path.join(out, "logo_white.png"))
    icon = lambda f: url(company.tint_icon(os.path.join(ICONS, f), os.path.join(out, f[:-4] + f"_{tone}.png"), tone))
    comp = deck["company"]
    BG = os.path.join(ROOT, "storage", "assets", "photos-doc")   # 테마 배경(cp-bg-theme) 로컬 원본 — cpbg-CP1-<테마>-<역할>.jpg
    sec_words = [["회사", "소개"], ["기술", "역량", "데이터"], ["성장", "사업", "연혁", "수상"]]
    kk = 0
    for s in deck["slides"]:
        s["_company"], s["_short"] = comp["name"], comp["short"]
        role = {"cover": "cover", "vision": "end", "contact": "end"}.get(s["kind"])
        if s["kind"] == "section":
            g = next((i for i, ws in enumerate(sec_words) if any(w in str(s.get("title") or "") for w in ws)), kk % 3); kk += 1
            role = f"div{g + 1}"
        if role:
            f = os.path.join(BG, SAMPLE_BG[theme][role] if theme in SAMPLE_BG else f"cpbg-CP1-{theme}-{role}.jpg")
            if os.path.isfile(f):
                mode = company.THEME_BG[theme][2] if theme in company.THEME_BG else "hue"
                t = company.tint_bg(f, os.path.join(out, f"bg-{role}_{tone}.png"), tone, mode)
                s["_bg_light"] = company.bg_is_light(t if mode == "duo" else f)
                s["_bg"] = url(t)
        s["_logo"], s["_logo_dark"] = url(logo), url(white) if white else None
        if s.get("icon"):
            s["_img"] = icon(s["icon"])
        for it in s.get("items") or []:
            if isinstance(it, dict) and it.get("icon"):
                it["_img"] = icon(it["icon"])
    r = company.render(deck["slides"], os.path.join(out, "html"), log=lambda m: None, ctone=tone, ctheme=theme)
    n = company.to_pptx(r, os.path.join(out, "결과.pptx"))
    td = os.path.join(THUMBS, theme, tone)
    os.makedirs(td, exist_ok=True)
    for i, x in enumerate(r, 1):
        Image.open(x["preview"]).convert("RGB").resize((640, 360), Image.LANCZOS).save(os.path.join(td, f"{i}.jpg"), quality=82)   # 4테마×11톤×16쪽 = 704장이라 작게
    print(f"{theme}/{tone}: {n}장 → {out}\\결과.pptx · 썸네일 {td}")


def main():
    src = json.load(open(os.path.join(ROOT, "engine", "templates", "company", "sample-solideo.json"), encoding="utf-8"))
    for tt in sys.argv[1:] or [f"{a}/{b}" for a in company.COMPANY_THEMES for b in company.TONES]:
        one(*tt.split("/"), src)


if __name__ == "__main__":
    main()
