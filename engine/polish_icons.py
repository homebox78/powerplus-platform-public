# -*- coding: utf-8 -*-
"""초안 다듬기 — 덱 전체 아이콘·일러스트를 한 세트로(사용자 2026-10-28 11·12·13쪽 지적).

  ① 그림 목록: 장마다 그림(그룹 안 포함)을 모으고 픽셀 특성(투명 배경·색 수)과 위치·반복으로 1차 분류
  ② 이미지 모델(서버 대리 호출 kind=check, 그림을 보는 모델)이 번호 시트와 앞쪽 장 렌더를 보고 그림마다
     icon | illustration | character | photo | screenshot | logo | chart | other 와 대상(영문·한글), 덱의 화풍·컨셉을 낸다
  ③ 교체 대상 = AI 가 icon·illustration 이라 하고 + 픽셀이 '그린 그림'(투명 배경이거나 색이 적음) + 로고 규칙에 안 걸린 것만.
     실사 사진·화면 캡처·로고·캐릭터(마스코트)·차트는 **절대 손대지 않는다**. 애매하면(AI 와 픽셀이 다르면) 남긴다.
  ④ 16:9 시트로 새로 그린다 — 아이콘 4×3(최대 12) 한 장, 일러스트 2×2(최대 4) 한 장(서버 이미지 경로·사용자별 한도 그대로)
  ⑤ 칸을 잘라 흰 바탕을 투명하게 → 같은 자리·같은 가운데에 비율 맞춰 넣는다(그림 이름 pp_set_…). 같은 그림(같은 파일)은 같은 새 그림
  ⑥ 시트 생성이 실패하거나 칸이 비면 powerPlus 자산(asset_find pick)에서 같은 대상을 찾아 넣는다. 그것도 없으면 원본 그대로 + 알림
결과: _icons/set.json(지문·분류·교체 기록), _icons/cells/*.png, _icons/분류.md(에이전트가 읽는다 — 손대면 안 되는 그림 목록).
이 모듈은 AI·이미지·자산 호출을 함수로 받는다(run(..., ai=, image=, asset=)) — 시험은 가짜를 넣는다."""
import base64, hashlib, io, json, math, os, re, sys
sys.argv, _ARGV = sys.argv[:1], sys.argv
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vcenter as V
sys.argv = _ARGV
from pptx import Presentation
from pptx.oxml.ns import qn
from PIL import Image, ImageDraw

A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
KEEP = ("photo", "screenshot", "logo", "character", "chart", "other")
LOGO_NAME = re.compile(r"(로고|logo|\bCI\b|\bBI\b|심볼|symbol|emblem|엠블럼|마스코트|캐릭터|mascot|character)", re.I)
ICON_GRID, ILL_GRID = (4, 3), (2, 2)
PREFIX = "pp_set_"


# ───────────────────────── ① 그림 목록
def pixel_class(blob):
    """'drawn' | 'photo' | 'unknown' — 64×64 로 줄여 투명 비율·색 수(32단계)로"""
    try:
        im = Image.open(io.BytesIO(blob))
        im.load()
    except Exception:
        return "unknown", {}
    rgba = im.convert("RGBA")
    sm = rgba.resize((64, 64))
    px = list(sm.getdata())
    clear = sum(1 for p in px if p[3] < 20) / len(px)
    colors = len({(p[0] // 8, p[1] // 8, p[2] // 8) for p in px if p[3] >= 20})
    info = {"clear": round(clear, 3), "colors": colors, "size": list(im.size)}
    if clear >= 0.05 or colors <= 120:   # 투명 배경 아이콘·일러스트, 또는 흰 바탕의 단색 아이콘
        return "drawn", info
    if colors > 600 and clear < 0.01:     # 불투명하고 색이 많다 — 사진·화면 캡처
        return "photo", info
    return "unknown", info               # 불투명·중간 색 수(캡처일 수 있다) — 애매하면 남긴다


def collect(pptx_path):
    """[{'key','slide','name','sha','box':(L,T,W,H) pt,'area','pix','pinfo'}] — 아주 작은 그림(장 면적 0.1% 미만)은 뺀다"""
    prs = Presentation(pptx_path)
    sw, sh = prs.slide_width / V.EMU, prs.slide_height / V.EMU
    out = []
    for no, slide in enumerate(prs.slides, 1):
        for s in V.flat(slide.shapes._spTree):
            if s.kind != "pic":
                continue
            bl = s.el.find(".//" + A + "blip")
            rid = bl.get(R + "embed") if bl is not None else None
            if not rid:
                continue
            try:
                blob = slide.part.related_part(rid).blob
            except Exception:
                continue
            area = s.Width * s.Height / (sw * sh)
            if area < 0.001:
                continue
            nv = s.el.find(".//" + qn("p:cNvPr"))
            name = nv.get("name", "") if nv is not None else ""
            descr = nv.get("descr", "") if nv is not None else ""
            pc, pinfo = pixel_class(blob)
            out.append({"key": f"{no}:{nv.get('id') if nv is not None else len(out)}", "slide": no, "name": name, "descr": descr,
                        "sha": hashlib.sha1(blob).hexdigest()[:16], "box": (s.Left, s.Top, s.Width, s.Height), "area": round(area, 4),
                        "pix": pc, "pinfo": pinfo, "_blob": blob})
    rep = {}
    for x in out:
        rep.setdefault(x["sha"], set()).add(x["slide"])
    for x in out:
        L, T, W, H = x["box"]
        why = []
        if LOGO_NAME.search(x["name"] + " " + x["descr"]):
            why.append("이름이 로고·캐릭터")
        if len(rep[x["sha"]]) >= 3:
            why.append(f"같은 그림이 {len(rep[x['sha']])}장에 반복(머리·바닥 로고)")
        if W / max(1.0, H) > 2.6 and x["area"] < 0.05:
            why.append("가로로 긴 작은 그림(글자 로고)")
        if (T < sh * 0.1 or T + H > sh * 0.92) and x["area"] < 0.03:
            why.append("머리·바닥 띠의 작은 그림")
        x["rule_keep"] = why
    return out, (sw, sh)


def contact_sheet(items, cell=200, cols=6):
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, max(1, rows) * (cell + 22)), "white")
    dr = ImageDraw.Draw(sheet)
    for i, x in enumerate(items):
        try:
            t = Image.open(io.BytesIO(x["_blob"])).convert("RGBA")
            t.thumbnail((cell - 12, cell - 12))
            bg = Image.new("RGBA", t.size, (235, 235, 235, 255))
            bg.alpha_composite(t)
            cx, cy = (i % cols) * cell, (i // cols) * (cell + 22)
            sheet.paste(bg.convert("RGB"), (cx + (cell - t.width) // 2, cy + (cell - t.height) // 2))
            dr.text((cx + 4, cy + cell + 2), f"{i + 1}  ({x['slide']}쪽)", fill="red")
        except Exception:
            pass
    return sheet


def data_url(im, fmt="JPEG"):
    b = io.BytesIO()
    im.convert("RGB").save(b, fmt, quality=85)
    return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()


# ───────────────────────── ② 분석
ANALYZE = """You are the art director for a Korean public-sector proposal deck that is being polished.
Image 1 is a numbered contact sheet of every picture found in the deck (number and slide shown under each). The other images are slide renders (cover, divider, body) for context.
For EVERY number, classify the picture:
- "icon": a small generic drawn symbol (person pictogram, building, document, gear, monitor, cloud, check mark…)
- "illustration": a generic drawn scene or object (a person with a laptop, a city, devices, abstract 3D shapes) that is NOT a brand character
- "character": a mascot or brand/organization character (any cute recurring creature, cloud-like or animal figure, named character) — if a drawn person could be a brand character, say "character"
- "photo": a real photograph (people at a counter, buildings, scenery) — even if small
- "screenshot": a capture of a real screen, app, web page, document or form
- "logo": an organization, government, company or service logo / emblem / wordmark
- "chart": a chart, graph, table or diagram captured as a picture
- "other": anything else or unsure
When in doubt between a protected kind (photo, screenshot, logo, character, chart, other) and icon/illustration, choose the protected kind.
Also describe the deck: its concept (one sentence, Korean) and ONE consistent modern picture style for redrawing the generic icons and illustrations (English, concrete: rendering, line, colors from the deck's main color, lighting, background white).
Answer JSON only:
{"concept": "...", "style": "...", "items": [{"n": 1, "class": "icon", "subject_en": "a building with columns", "subject_ko": "기관 건물"}]}"""


def analyze(items, renders, ai):
    sheet = contact_sheet(items)
    content = [{"type": "text", "text": ANALYZE}, {"type": "image_url", "image_url": {"url": data_url(sheet)}}]
    for p in renders[:4]:
        try:
            im = Image.open(p)
            im.thumbnail((1000, 1000))
            content.append({"type": "image_url", "image_url": {"url": data_url(im)}})
        except Exception:
            pass
    txt = ai({"messages": [{"role": "user", "content": content}], "max_tokens": 6000})
    m = re.search(r"\{.*\}", txt or "", re.S)
    if not m:
        raise RuntimeError("그림 분석 답이 JSON 이 아닙니다")
    d = json.loads(m.group(0), strict=False)
    by = {int(x.get("n") or 0): x for x in d.get("items") or [] if isinstance(x, dict)}
    return d, by


def decide(x, a):
    """교체할까 — (True/False, 이유). 셋(AI 분류·픽셀·로고 규칙)이 모두 '그린 범용 그림'일 때만 True"""
    cls = str((a or {}).get("class") or "other").lower()
    if cls not in ("icon", "illustration"):
        return False, {"photo": "실사 사진", "screenshot": "화면 캡처", "logo": "로고", "character": "캐릭터·마스코트", "chart": "차트·표 그림"}.get(cls, "분류가 애매함")
    if x["rule_keep"]:
        return False, "로고로 보임(" + ", ".join(x["rule_keep"]) + ")"
    if x["pix"] != "drawn":
        return False, "픽셀이 그린 그림이 아님(" + ("사진처럼 색이 많음" if x["pix"] == "photo" else "판단 애매") + ")"
    return True, cls


# ───────────────────────── ④ 시트 그리기 · ⑤ 자르기
SHEET = """A 16:9 sheet of {n} {what} drawn as ONE consistent set, laid out in an exact grid of {cols} columns × {rows} rows of equal cells.
Each cell holds exactly ONE item, centered, with generous white padding (item about 70% of the cell). Pure white (#FFFFFF) background everywhere.
No text, no letters, no numbers, no labels, no borders, no grid lines, no shadows on the background. Do not draw logos or brand characters.
Style: {style}
High resolution, crisp edges, the same lighting, palette, line weight and level of detail for every item.
Items in reading order (left to right, top to bottom; leave remaining cells empty white):
{items}"""


def cells_of(png, cols, rows):
    im = Image.open(io.BytesIO(png)).convert("RGB")
    W, H = im.size
    out = []
    for r in range(rows):
        for c in range(cols):
            cell = im.crop((c * W // cols, r * H // rows, (c + 1) * W // cols, (r + 1) * H // rows))
            out.append(cutout(cell))
    return out


def cutout(cell, thr=242):
    """흰 바탕을 투명하게(가장자리에서 이어진 흰색만 — 그림 안 흰 부분은 남긴다) → 그림 둘레로 자르기. 빈 칸이면 None"""
    w, h = cell.size
    px = cell.load()
    seen = bytearray(w * h)
    stack = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    while stack:
        x, y = stack.pop()
        i = y * w + x
        if seen[i]:
            continue
        r, g, b = px[x, y]
        if min(r, g, b) < thr:
            continue
        seen[i] = 1
        if x > 0: stack.append((x - 1, y))
        if x < w - 1: stack.append((x + 1, y))
        if y > 0: stack.append((x, y - 1))
        if y < h - 1: stack.append((x, y + 1))
    rgba = cell.convert("RGBA")
    al = Image.frombytes("L", (w, h), bytes(0 if s else 255 for s in seen))
    rgba.putalpha(al)
    bb = al.getbbox()
    if not bb or (bb[2] - bb[0]) * (bb[3] - bb[1]) < w * h * 0.02:
        return None
    pad = 4
    return rgba.crop((max(0, bb[0] - pad), max(0, bb[1] - pad), min(w, bb[2] + pad), min(h, bb[3] + pad)))


# ───────────────────────── ⑥ 넣기
def place(pptx_path, out_path, repl):
    """repl = {그림 key: png 경로}. 같은 자리·같은 가운데, 새 그림 비율로 상자 안에 맞춘다. 잘라내기(srcRect)는 지운다"""
    prs = Presentation(pptx_path)
    n = 0
    for no, slide in enumerate(prs.slides, 1):
        for pic in list(slide._element.iter(qn("p:pic"))):
            nv = pic.find(".//" + qn("p:cNvPr"))
            if nv is None:
                continue
            key = f"{no}:{nv.get('id')}"
            if key not in repl or nv.get("name", "").startswith(PREFIX):
                continue
            path = repl[key]
            _, rid = slide.part.get_or_add_image_part(open(path, "rb"))
            bl = pic.find(".//" + A + "blip")
            bl.set(R + "embed", rid)
            for ext in list(bl.iter(A + "ext")):   # SVG 아이콘(svgBlip)은 PowerPoint 가 SVG 를 먼저 그린다 — 남기면 옛 그림이 그대로 보인다
                if any("svgBlip" in c.tag for c in ext):
                    ext.getparent().remove(ext)
            for t in ("srcRect",):
                e = pic.find(".//" + A + t)
                if e is not None:
                    e.getparent().remove(e)
            x = pic.find(qn("p:spPr")).find(qn("a:xfrm"))
            off, ext = x.find(qn("a:off")), x.find(qn("a:ext"))
            cx, cy, ox, oy = int(ext.get("cx")), int(ext.get("cy")), int(off.get("x")), int(off.get("y"))
            iw, ih = Image.open(path).size
            k = min(cx / iw, cy / ih)
            nx, ny = int(iw * k), int(ih * k)
            off.set("x", str(ox + (cx - nx) // 2))
            off.set("y", str(oy + (cy - ny) // 2))
            ext.set("cx", str(nx))
            ext.set("cy", str(ny))
            nv.set("name", PREFIX + (nv.get("name") or "그림")[:40])
            n += 1
    prs.save(out_path)
    return n


def run(pptx_path, out_path, work, renders=(), ai=None, image=None, asset=None, sig="", log=print):
    """반환 보고 dict — replaced·kept·assets_used·notes. AI 분석이 안 되면 아무것도 바꾸지 않는다(그림 분류를 모르고 바꾸지 않는다)"""
    os.makedirs(os.path.join(work, "cells"), exist_ok=True)
    setp = os.path.join(work, "set.json")
    try:   # 같은 원본으로 이미 만든 세트가 있으면 AI·이미지를 다시 부르지 않고 그 그림으로 넣는다(다시 돌리기·의견 반영)
        old = json.load(open(setp, encoding="utf-8")) if sig and os.path.isfile(setp) else {}
    except Exception:
        old = {}
    if old.get("sig") == sig and isinstance(old.get("map"), dict) and all(os.path.isfile(v) for v in old["map"].values()):
        old["n"] = place(pptx_path, out_path, old["map"]) if old["map"] else 0
        if not old["map"] and out_path != pptx_path:
            Presentation(pptx_path).save(out_path)
        log(f"아이콘·일러스트 — 앞 실행에서 만든 세트를 그대로 넣었습니다({old['n']}개, AI·이미지 호출 없음)")
        return old
    items, (sw, sh) = collect(pptx_path)
    rep = {"sig": sig, "replaced": [], "kept": [], "notes": [], "assets_used": []}
    if not items:
        rep["notes"].append("그림이 없습니다")
        json.dump(rep, open(setp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        if out_path != pptx_path:
            Presentation(pptx_path).save(out_path)
        return rep
    try:
        d, by = analyze(items, list(renders), ai)
    except Exception as e:
        rep["notes"].append(f"그림 분석을 못 해 아이콘·일러스트를 바꾸지 않았습니다({str(e)[:120]})")
        for x in items:
            rep["kept"].append({"slide": x["slide"], "key": x["key"], "why": "분석 실패 — 그대로"})
        json.dump(rep, open(setp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        if out_path != pptx_path:
            Presentation(pptx_path).save(out_path)
        return rep
    rep["concept"], rep["style"] = d.get("concept") or "", d.get("style") or ""
    targets = []
    for i, x in enumerate(items, 1):
        a = by.get(i) or {}
        ok, why = decide(x, a)
        x["subject_en"], x["subject_ko"] = str(a.get("subject_en") or "")[:80], str(a.get("subject_ko") or "")[:40]
        x["kind"] = "illust" if (str(a.get("class")) == "illustration" or x["area"] >= 0.06) else "icon"
        if ok:
            targets.append(x)
        else:
            rep["kept"].append({"slide": x["slide"], "key": x["key"], "why": why, "class": a.get("class")})
    # 같은 파일 = 같은 새 그림
    uniq = {}
    for x in targets:
        uniq.setdefault((x["kind"], x["sha"]), x)
    new = {}   # (kind, sha) → png 경로
    for kind, (cols, rows), what in (("icon", ICON_GRID, "icons"), ("illust", ILL_GRID, "illustrations")):
        group = [x for (k, _), x in uniq.items() if k == kind]
        if not group:
            continue
        chunk, rest = group[:cols * rows], group[cols * rows:]
        if rest:
            rep["notes"].append(f"{'아이콘' if kind == 'icon' else '일러스트'} {len(rest)}개는 시트 한 장에 다 못 넣어 powerPlus 자산에서 찾습니다")
        png = None
        if image and chunk:
            try:
                ref = contact_sheet(chunk, cell=160, cols=cols)
                prompt = SHEET.format(n=len(chunk), what=what, cols=cols, rows=rows, style=rep["style"] or "clean modern flat 3D, soft light, deck blue palette",
                                      items="\n".join(f"{i + 1}. {x['subject_en'] or 'generic icon'}" for i, x in enumerate(chunk)))
                png = image(prompt, [data_url(ref)])
                open(os.path.join(work, f"sheet_{kind}.png"), "wb").write(png)
            except Exception as e:
                rep["notes"].append(f"{'아이콘' if kind == 'icon' else '일러스트'} 시트를 못 그렸습니다({str(e)[:120]}) — powerPlus 자산에서 찾습니다")
                png = None
        cut = cells_of(png, cols, rows) if png else []
        for i, x in enumerate(group):
            im = cut[i] if i < len(cut) else None
            p = os.path.join(work, "cells", f"{kind}_{x['sha']}.png")
            if im is not None:
                if max(im.size) < 1000:   # 칸이 작으면 고해상으로 키워 둔다(장에 넣을 때 흐리지 않게 — 원본보다 작은 해상도로 넣지 않는다)
                    k = 1000 / max(im.size)
                    im = im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS)
                im.save(p)
                new[(kind, x["sha"])] = (p, "set", f"새 세트 {kind} {i + 1}")
                continue
            got = None
            if asset:
                try:
                    got = asset(kind, x["subject_ko"] or x["subject_en"], p)
                except Exception as e:
                    rep["notes"].append(f"{x['slide']}쪽 자산 찾기 실패({str(e)[:80]})")
            if got:
                new[(kind, x["sha"])] = (p, "asset", got)
            else:
                rep["notes"].append(f"{x['slide']}쪽 '{x['subject_ko'] or x['subject_en']}' — 새 그림·자산을 못 구해 원본 그대로 둠")
    repl = {}
    for x in targets:
        hit = new.get((x["kind"], x["sha"]))
        if not hit:
            rep["kept"].append({"slide": x["slide"], "key": x["key"], "why": "새 그림을 못 구함"})
            continue
        repl[x["key"]] = hit[0]
        rep["replaced"].append({"slide": x["slide"], "key": x["key"], "by": hit[1], "subject": x["subject_ko"] or x["subject_en"], "file": os.path.basename(hit[0])})
        rep["assets_used"].append({"slide": x["slide"], "id": (hit[2] if hit[1] == "asset" else "set:" + os.path.basename(hit[0])), "why": (x["subject_ko"] or x["subject_en"]) + " → " + ("powerPlus 자산" if hit[1] == "asset" else "새 세트")})
    n = place(pptx_path, out_path, repl) if repl else 0
    if not repl and out_path != pptx_path:
        Presentation(pptx_path).save(out_path)
    rep["n"] = n
    rep["map"] = repl
    json.dump(rep, open(setp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    lines = ["# 그림 분류 — 엔진이 덱 전체 아이콘·일러스트를 한 세트로 바꿨다", "",
             f"컨셉: {rep.get('concept', '')}", f"화풍: {rep.get('style', '')}", "",
             "## 손대지 말 것(실사 사진·화면 캡처·로고·캐릭터·차트 — 교체·재생성·자르기·흐림 금지)"]
    lines += [f"- {k['slide']}쪽 그림 {k['key']} — {k['why']}" for k in rep["kept"]]
    lines += ["", "## 바꾼 그림(이름 pp_set_… — 다시 바꾸지 말 것. 새로 넣을 자리는 _icons/cells 의 같은 세트에서)"]
    lines += [f"- {r['slide']}쪽 {r['subject']} ← {r['by']}" for r in rep["replaced"]]
    open(os.path.join(work, "분류.md"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
    log(f"아이콘·일러스트 한 세트로 — {n}개 교체(새 세트 {sum(1 for r in rep['replaced'] if r['by'] == 'set')} · 자산 {sum(1 for r in rep['replaced'] if r['by'] == 'asset')}) · 그대로 둔 그림 {len(rep['kept'])}개(사진·캡처·로고·캐릭터 등)")
    return rep
