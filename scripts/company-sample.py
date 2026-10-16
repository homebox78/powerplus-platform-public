# 타입 G(회사소개서) 견본 — engine/templates/company/sample-solideo.json 을 엔진 렌더(company.render → to_pptx)로 그대로 만든다.
# 그림은 powerAssets 원본(storage/legacy-powerplus/uploads/icon/<icon>), 로고는 로컬 작업의 vendor.png 에서 심볼 부분만 자른다.
# AI 호출·운영 작업 생성 없음.
#   python scripts/company-sample.py [출력 폴더]   → <출력>/결과.pptx · <출력>/html/sNN.png
#   썸네일: apps/web/public/cstyles/g/N.jpg(전 쪽, 960×540) — 바꾸면 CompanyThemes.tsx 의 THUMB_V 를 올린다
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "engine"))
import company  # noqa: E402
from PIL import Image  # noqa: E402

ICONS = os.path.join(ROOT, "storage", "legacy-powerplus", "uploads", "icon")   # 운영 platform_data/legacy-powerplus/uploads/icon 에서 견본에 쓰는 것만 받아 둔다
LOGO = os.path.join(ROOT, "storage", "deck", "jobs", "05eb7dd4f868eb37", "brand", "vendor.png")   # 'solideo S. 솔리데오 컨소시엄' — 앞 심볼만
THUMBS = os.path.join(ROOT, "apps", "web", "public", "cstyles", "g")


def main():
    out = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "storage", "tmp", "company-sample"))
    os.makedirs(out, exist_ok=True)
    deck = json.load(open(os.path.join(ROOT, "engine", "templates", "company", "sample-solideo.json"), encoding="utf-8"))
    url = lambda p: "file:///" + p.replace("\\", "/")
    logo = os.path.join(out, "logo.png")
    im = Image.open(LOGO).convert("RGBA")
    im.crop((0, 0, 222, im.height)).save(logo)   # 'solideo S.' 까지(뒤 '솔리데오 컨소시엄' 글자 떼기)
    white = company._white_logo(logo, os.path.join(out, "logo_white.png"))
    comp = deck["company"]
    for s in deck["slides"]:
        s["_company"], s["_short"] = comp["name"], comp["short"]
        s["_logo"], s["_logo_dark"] = url(logo), url(white) if white else None
        if s.get("icon"):
            s["_img"] = url(os.path.join(ICONS, s["icon"]))
        for it in s.get("items") or []:
            if isinstance(it, dict) and it.get("icon"):
                it["_img"] = url(os.path.join(ICONS, it["icon"]))
    r = company.render(deck["slides"], os.path.join(out, "html"))
    n = company.to_pptx(r, os.path.join(out, "결과.pptx"))
    os.makedirs(THUMBS, exist_ok=True)
    for i, x in enumerate(r, 1):
        Image.open(x["preview"]).convert("RGB").resize((960, 540), Image.LANCZOS).save(os.path.join(THUMBS, f"{i}.jpg"), quality=86)
    print(f"{n}장 → {out}\\결과.pptx · 썸네일 {THUMBS}")


if __name__ == "__main__":
    main()
