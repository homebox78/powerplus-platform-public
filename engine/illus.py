# -*- coding: utf-8 -*-
"""시안에서 잘라 넣은 그림(아이콘·일러스트)을 따로 크게 다시 그려 장표 속 그림과 바꿔 끼운다(R197).

시안 본문은 1536×864 안팎이라 잘라 낸 아이콘이 50~80px — 장표에서 흐릿하고, 밝은 바탕 위 흰 받침판은 색만으로 바탕과 가를 수 없어
투명 처리하면 깨졌다(11-03 사용자). 사용자 제안: 그림만 모아 따로 그리고, 바탕을 날려 넣는다.

  1. crop.py 가 남긴 옆 기록(<그림>.png.json: 원본 시안·자른 범위)을 모은다 — 장표에 실제로 쓰인 그림만(그림 파일 지문으로 대조)
  2. 6개씩 16:9 한 장(3×2 칸)에 순수 초록(#00FF00) 바탕으로 놓고, 그림 모델에 '칸마다 같은 그림을 고해상도로, 바탕은 초록 그대로' 다시 그리게 한다
  3. 칸대로 잘라 초록을 빼고(가장자리 반투명·초록 번짐 제거), 원래 그림과 너무 다르면 그 그림은 원래 것을 둔다
  4. 장표 속 같은 그림 파일을 새 그림으로 갈아 끼운다 — 자리는 그대로, 크기는 원래 틀 안에 비율 맞춰 가운데

  python illus.py <job_id> <pptx> [--dry]      (엔진 서버에서 — worker 설정으로 그림 모델을 부른다)
"""
import base64, glob, hashlib, io, json, os, sys

GREEN = (0, 255, 0)
COLS, ROWS = 3, 2
SHEET = (1536, 864)


def sha1(b):
    return hashlib.sha1(b).hexdigest()


def collect(job_dir):
    """옆 기록 → {그림 지문: {out, src, box}}"""
    got = {}
    for js in glob.glob(os.path.join(job_dir, "**", "*.png.json"), recursive=True):
        out = js[:-5]
        try:
            meta = json.load(open(js, encoding="utf-8"))
            src = meta["src"] if os.path.isabs(meta["src"]) else os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(out))), meta["src"])
            if not (os.path.isfile(out) and os.path.isfile(src)):
                continue
            got[sha1(open(out, "rb").read())] = {"out": out, "src": src, "box": meta["box"]}
        except Exception:
            continue
    return got


def used_images(pptx):
    """장표 속 그림 → [(쪽 번호, 그림 도형, 그림 part)]"""
    from pptx import Presentation
    prs = Presentation(pptx)
    R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed"
    out = []
    for sl in prs.slides:
        for sh in sl.shapes:
            if sh.shape_type != 13:
                continue
            blip = sh._element.find(".//{http://schemas.openxmlformats.org/drawingml/2006/main}blip")
            if blip is None or not blip.get(R):
                continue
            out.append((sl, sh, sl.part.related_part(blip.get(R))))
    return prs, out


def piece(meta):
    """원래 시안에서 그 범위(바탕 포함, 둘레 8%)를 불투명으로 — 다시 그릴 견본. meta 에 piece(이미 자른 조각 파일)가 있으면 그것"""
    from PIL import Image
    if meta.get("piece"):
        return Image.open(meta["piece"]).convert("RGB")
    im = Image.open(meta["src"]).convert("RGB")
    x0, y0, x1, y1 = meta["box"]
    p = round(max(x1 - x0, y1 - y0) * 0.08)
    return im.crop((max(0, x0 - p), max(0, y0 - p), min(im.width, x1 + p), min(im.height, y1 + p)))


def make_sheet(pieces):
    from PIL import Image
    W, H = SHEET
    cw, ch = W // COLS, H // ROWS
    sheet = Image.new("RGB", SHEET, GREEN)
    for k, pc in enumerate(pieces):
        cx, cy = (k % COLS) * cw, (k // COLS) * ch
        r = min(cw * 0.78 / pc.width, ch * 0.78 / pc.height)
        im = pc.resize((max(1, round(pc.width * r)), max(1, round(pc.height * r))), Image.LANCZOS)
        sheet.paste(im, (cx + (cw - im.width) // 2, cy + (ch - im.height) // 2))
    return sheet


PROMPT = ("This is a sheet of {n} separate illustrations and icons on a flat pure green (#00FF00) background, arranged in a {cols} x {rows} grid "
          "(one item centered in each grid cell; empty cells stay plain green). They are low-resolution cut-outs from a slide.\n"
          "Redraw the WHOLE SHEET at high quality: every item stays exactly the same object, the same shape, the same colors, the same viewing angle and the same "
          "size and position in its cell — only sharper, cleaner and more detailed (crisp edges, clean glossy 3D surfaces, no blur, no noise). "
          "Remove the pale slide background that is still visible around each item inside the cutout: each item stands alone on the green.\n"
          "The background must be ONE flat pure green #00FF00 everywhere around and between the items — no gradient, no floor, no shadow on the background, "
          "no glow. Never use green on the items themselves. No text, no letters, no numbers, no labels, no new objects, no grid lines, no frames.")


# 한 칸씩 다시 그리기(R207) — 6칸 판에서 빠진 그림. 옆 그림 조각·잘린 가장자리째 오린 조각이라 '그대로 다시' 그리면 조각도 따라 그려졌다
PROMPT_ONE = ("This is ONE low-resolution illustration cut out of a slide, on a flat pure green (#00FF00) background.\n"
              "Redraw the MAIN object at high quality, centered, about 78% of the image: the same object, the same shape, the same colors and the same "
              "viewing angle — only sharper, cleaner and more detailed (crisp edges, clean glossy 3D surfaces).\n"
              "If the main object is cut off by the frame edge, draw it COMPLETE (the whole pedestal, the whole gear, the whole object). "
              "Leave out every piece that belongs to a neighbouring item: half-visible icons, badges, buttons, card edges, lines or letters at the edges of the cutout — "
              "also small round badges stuck on the object's corner (a question mark, an exclamation or warning badge): those are separate slide icons, draw the object without them. "
              "Loose floating lines and bars around the object are not part of it either. If the object stands on a cut-off piece of a bar, stair or chart block, "
              "leave that piece out and give the object its own small rounded white base like the other icons.\n"
              "The background must be ONE flat pure green #00FF00 everywhere — no gradient, no floor, no shadow on the background, no glow. "
              "Never use green on the object. No text, no letters, no numbers, no frames.")


def dirty(im):
    """옛 조각이 그대로 쓰이면 안 되는 모양인가(R207) — (잘림, 조각).
    잘림 = 물체가 그림 테두리에 곧게 잘린 길이(한 변 비율, 0.22 넘으면 잘림 — 둥근 물체는 테두리에 점으로만 닿는다).
    조각 = 큰 물체와 떨어져 테두리에 닿은 다른 덩어리의 크기(큰 물체 대비, 0.03 넘는 것 중 가장 큰 것)"""
    from PIL import Image
    k = keyout(im.convert("RGBA"))
    t = k.copy()
    t.thumbnail((160, 160))
    w, h = t.size
    al = t.split()[3].point(lambda v: 255 if v > 150 else 0).load()

    def run(seq):
        b = c = 0
        for v in seq:
            c = c + 1 if v else 0
            b = max(b, c)
        return b
    cut = max(run([al[x, 0] for x in range(w)]) / w, run([al[x, h - 1] for x in range(w)]) / w,
              run([al[0, y] for y in range(h)]) / h, run([al[w - 1, y] for y in range(h)]) / h)
    cs = _blobs(t, 150)
    frag = 0.0
    for c in cs[1:]:
        if len(c) < 0.03 * len(cs[0]):
            break
        xs = [q[0] for q in c]
        ys = [q[1] for q in c]
        if min(xs) <= 1 or min(ys) <= 1 or max(xs) >= w - 2 or max(ys) >= h - 2:
            frag = max(frag, len(c) / len(cs[0]))
    return cut, frag


def main_only(im):
    """가장 큰 덩어리(+그와 이어진 것)만 남긴 조각 — 옆 그림 조각을 견본에서 빼고 다시 그리게(R207)"""
    from PIL import Image
    k = keyout(im.convert("RGBA"))
    cs = _blobs(k, 60)
    if len(cs) < 2:
        return k
    keep = set(cs[0])
    for c in cs[1:]:   # 작은 점(주황 공 등)은 물체 일부 — 테두리에 닿은 큰 덩어리만 뺀다
        xs = [q[0] for q in c]; ys = [q[1] for q in c]
        edge = min(xs) <= 1 or min(ys) <= 1 or max(xs) >= k.width - 2 or max(ys) >= k.height - 2
        if not (edge and len(c) >= 0.03 * len(cs[0])):
            keep.update(c)
    out = Image.new("RGBA", k.size, (0, 0, 0, 0))
    src, po = k.load(), out.load()
    for x, y in keep:
        po[x, y] = src[x, y]
    # 덩어리 판정이 깎은 가장자리 반투명 픽셀을 살리려 한 칸 넓혀 원본 알파로
    from PIL import ImageFilter
    m = out.split()[3].point(lambda v: 255 if v else 0).filter(ImageFilter.MaxFilter(5))
    res = Image.composite(k, Image.new("RGBA", k.size, (0, 0, 0, 0)), m)
    bb = res.getbbox()
    return res.crop(bb) if bb else k


def key(cell):
    """초록 바탕 빼기 — 초록 정도로 투명도, 가장자리 초록 번짐 제거, 가장 큰 덩어리 둘레로 자르기"""
    from PIL import Image
    im = cell.convert("RGB")
    px = im.load()
    out = Image.new("RGBA", im.size)
    po = out.load()
    for j in range(im.height):
        for i in range(im.width):
            r, g, b = px[i, j]
            gr = g - max(r, b)
            if gr >= 90 and g >= 140:
                po[i, j] = (0, 0, 0, 0)
                continue
            a = 255 if gr <= 25 else round(255 * (90 - gr) / 65)
            if gr > 0:
                g = max(r, b) + min(gr, 8)   # 초록 번짐 빼기
            po[i, j] = (r, g, b, max(0, min(255, a)))
    bb = out.getbbox()
    return out.crop(bb) if bb else None


def _peel(im, tol=40):
    """테두리에서 이어진 고른 바탕 한 겹만 빼기 — 테두리가 고르지 않으면 None.
    색이 같아도 테두리와 이어지지 않은 안쪽(흰 받침판 등)은 남긴다(전체 색 빼기는 흰 그림을 깎았다, R205)"""
    from collections import deque
    w, h = im.size
    px = im.load()
    ring = [(i, j) for i in range(w) for j in (0, h - 1)] + [(i, j) for j in range(h) for i in (0, w - 1)]
    op = [px[p] for p in ring if px[p][3] > 200]
    if len(op) < 0.8 * len(ring):
        return None
    bg = tuple(sorted(p[c] for p in op)[len(op) // 2] for c in range(3))
    near = lambda v: v[3] > 0 and max(abs(v[c] - bg[c]) for c in range(3)) <= tol
    if sum(1 for p in op if near(p)) < 0.7 * len(op):
        return None
    out = im.copy()
    po = out.load()
    seen = {p for p in ring if near(px[p])}
    q = deque(seen)
    while q:
        i, j = q.popleft()
        po[i, j] = (0, 0, 0, 0)
        for a, b in ((i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)):
            if 0 <= a < w and 0 <= b < h and (a, b) not in seen and near(px[a, b]):
                seen.add((a, b))
                q.append((a, b))
    bb = out.getbbox()
    return out.crop(bb) if bb else None


def _blobs(im, thr=60):
    """불투명 덩어리들(큰 것부터) — 가는 선(카드 테두리 흔적)은 깎았다 불려 먼저 지운다"""
    from PIL import ImageFilter
    w, h = im.size
    a = im.split()[3].point(lambda v: 255 if v > thr else 0).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3)).load()
    seen, out = set(), []
    for j in range(h):
        for i in range(w):
            if a[i, j] and (i, j) not in seen:
                st, pts = [(i, j)], []
                seen.add((i, j))
                while st:
                    x, y = st.pop()
                    pts.append((x, y))
                    for u, v in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                        if 0 <= u < w and 0 <= v < h and (u, v) not in seen and a[u, v]:
                            seen.add((u, v))
                            st.append((u, v))
                out.append(pts)
    return sorted(out, key=len, reverse=True)


def _views(im, size=96):
    """비교 후보 — 그대로 / 큰 덩어리들 / 가장 큰 덩어리 / 바탕을 한 겹씩 벗긴 것(최대 3겹).
    옛 그림은 카드·띠·글자 조각째 잘린 것이 많아(R205) 어느 단계가 '물체'인지 미리 못 정한다 — 단계마다 대 보고 가장 가까운 쌍을 쓴다"""
    from PIL import Image
    im = im.convert("RGBA")
    bb = im.getbbox()
    im = im.crop(bb) if bb else im
    s = size / max(im.size)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)

    def box(src, cs):
        xs = [p[0] for c in cs for p in c]
        ys = [p[1] for c in cs for p in c]
        return src.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1))
    out = [im]
    cs = _blobs(im)
    if cs:
        out.append(box(im, [c for c in cs if len(c) >= 0.15 * len(cs[0])]))
        out.append(box(im, cs[:1]))
    cur = out[-1]
    for _ in range(3):
        n = _peel(cur)
        if n is None or min(n.size) < 0.25 * min(im.size):
            break
        cs = _blobs(n)
        cur = box(n, cs[:1]) if cs else n
        out.append(cur)
    return [v for v in out if min(v.size) >= 4]


def _diff(a, b, n=32, thr=60):
    """두 그림을 n칸에 비율대로 맞춰 둘 다 물체인 칸만 색 차이 — 흰 여백으로 희석되지 않게(R205).
    겹치는 칸이 합친 칸의 40% 아래면 비교 불가(255)"""
    from PIL import Image

    def grid(im):
        s = n / max(im.size)
        w, h = max(1, round(im.width * s)), max(1, round(im.height * s))
        c = Image.new("RGBA", (n, n), (0, 0, 0, 0))
        c.paste(im.resize((w, h), Image.BILINEAR), ((n - w) // 2, (n - h) // 2))
        return list(c.getdata())
    ga, gb = grid(a), grid(b)
    both = [(x, y) for x, y in zip(ga, gb) if x[3] > thr and y[3] > thr]
    uni = sum(1 for x, y in zip(ga, gb) if x[3] > thr or y[3] > thr)
    if len(both) < 0.4 * max(1, uni):
        return 255.0
    return sum(abs(x[c] - y[c]) for x, y in both for c in range(3)) / (3 * len(both))


def _score(va, vb):
    """비교 후보 목록끼리 — 비율이 맞는 쌍의 가장 작은 색 차이(255 = 맞는 쌍 없음)"""
    best = 255.0
    for a in va:
        for b in vb:
            if 0.6 < (a.height / a.width) / (b.height / b.width) < 1.65:
                best = min(best, _diff(a, b))
    return best


def similar(new, orig, others=()):
    """다시 그린 그림이 원래와 같은 물체인가 — 양쪽 비교 후보 중 비율이 맞는 쌍의 가장 작은 색 차이.
    기준 36: 이 장표 492쌍 시험에서 엇갈린 쌍(다른 그림) 통과 25%→1.7%, 버렸다 눈으로 살린 그림 48→59/87(R205).
    색으로는 '같은 양식에 문양만 다른 그림'(파란 원 속 사람 ↔ 학사모)을 못 가른다 — 그림 모델이 옆 칸 것을 그리는 실수가
    바로 그 모양이라, others(같은 장 다른 칸의 옛 그림 비교 후보)가 오면 제 칸보다 더 가까운 칸이 있을 때 버린다
    (시험: 칸 바뀐 오판 24/32 더 잡고 바른 그림 손해 2/133)"""
    if new is None:
        return False, "빈 칸"
    vn = _views(new)
    vo = orig if isinstance(orig, list) else _views(orig)
    own = _score(vn, vo)
    if own >= 255:
        return False, "비율·윤곽이 안 맞음"
    if own >= float(os.environ.get("ILLUS_MAXDIFF", "36")):
        return False, f"색 차이 {own:.0f}"
    for vx in others:
        d = _score(vn, vx)
        if d < own - 2:
            return False, f"다른 칸 그림에 더 가까움({own:.0f}>{d:.0f})"
    return True, f"색 차이 {own:.0f}"


def redraw(job, items, workers=4, retry=True, solo=False):
    """items = [(이름, meta)] → {이름: 새 PNG 바이트}. 6개씩 한 장(동시 workers 장), 원래와 다르면 빼기"""
    import design
    from PIL import Image
    from concurrent.futures import ThreadPoolExecutor
    res = {}
    groups = [] if solo else [items[k:k + COLS * ROWS] for k in range(0, len(items), COLS * ROWS)]

    def one(gi, grp):
        sheet = make_sheet([piece(m) for _, m in grp])
        buf = io.BytesIO()
        sheet.save(buf, "PNG")
        try:
            png = design.gen_image(job, PROMPT.format(n=len(grp), cols=COLS, rows=ROWS), [], "16:9",
                                   ["data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()], plain=True)
        except (design.Cancelled, design.Budget):
            raise
        except Exception as e:
            job.event(f"그림 다시 그리기 {gi + 1}장 실패 — 원래 그림을 둡니다: {str(e)[:120]}", "warn")
            return {}
        got = Image.open(io.BytesIO(png)).convert("RGB").resize(SHEET, Image.LANCZOS)
        cw, ch = SHEET[0] // COLS, SHEET[1] // ROWS
        out = {}
        olds = [_views(Image.open(m["out"])) for _, m in grp]   # 칸마다 한 번 — 옆 칸 대조에 다시 쓴다
        for i, (name, m) in enumerate(grp):
            cx, cy = (i % COLS) * cw, (i // COLS) * ch
            new = key(got.crop((cx + 4, cy + 4, cx + cw - 4, cy + ch - 4)))
            ok, why = similar(new, olds[i], [v for k, v in enumerate(olds) if k != i])
            if not ok:
                job.event(f"그림 {os.path.basename(m['out'])} — 다시 그린 것이 원래와 달라({why}) 원래 그림을 둡니다", "warn")
                continue
            b = io.BytesIO()
            new.save(b, "PNG")
            out[name] = b.getvalue()
        return out
    with ThreadPoolExecutor(max(1, workers)) as ex:
        for r in ex.map(lambda a: one(*a), list(enumerate(groups))):
            res.update(r)
    left = [(n, m) for n, m in items if n not in res]
    if left and retry:   # 빠진 그림은 한 장에 하나씩 — 옆 칸과 바뀔 일이 없고, 옆 조각을 뺀 견본으로(R207)
        def solo(it):
            name, m = it
            pc = main_only(Image.open(m.get("piece") or m["out"]))
            bg = Image.new("RGB", pc.size, GREEN)
            bg.paste(pc, (0, 0), pc)
            buf = io.BytesIO()
            make_one(bg).save(buf, "PNG")
            try:
                png = design.gen_image(job, PROMPT_ONE, [], "1:1", ["data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()], plain=True)
            except (design.Cancelled, design.Budget):
                raise
            except Exception as e:
                job.event(f"그림 {os.path.basename(m['out'])} 한 칸 다시 그리기 실패: {str(e)[:100]}", "warn")
                return name, None
            got = Image.open(io.BytesIO(png)).convert("RGB")
            new = key(got.crop((4, 4, got.width - 4, got.height - 4)))
            ok, why = similar(new, _views(pc))   # 한 칸이라 옆 칸 대조는 없다 — 옆 조각을 뺀 견본과 비교
            if not ok:
                job.event(f"그림 {os.path.basename(m['out'])} — 한 칸으로 다시 그려도 달라({why}) 원래 그림을 둡니다", "warn")
                return name, None
            b = io.BytesIO()
            new.save(b, "PNG")
            return name, b.getvalue()
        with ThreadPoolExecutor(max(1, workers)) as ex:
            for name, data in ex.map(solo, left):
                if data:
                    res[name] = data
    return res


def make_one(pc, size=1024):
    """한 그림 견본 — 정사각 초록 판 가운데 78%"""
    from PIL import Image
    sheet = Image.new("RGB", (size, size), GREEN)
    r = size * 0.78 / max(pc.size)
    im = pc.resize((max(1, round(pc.width * r)), max(1, round(pc.height * r))), Image.LANCZOS)
    sheet.paste(im, ((size - im.width) // 2, (size - im.height) // 2))
    return sheet


def place(sh, part, data):
    """그림 part 를 새 그림으로 — 원래 틀 안에 비율 맞춰 가운데"""
    from PIL import Image
    part._blob = data
    new = Image.open(io.BytesIO(data))
    fw, fh = sh.width, sh.height
    ar = new.height / new.width
    w2, h2 = (fw, round(fw * ar)) if fw * ar <= fh * 1.08 else (round(fh / ar), fh)
    sh.left, sh.top = sh.left + (fw - w2) // 2, sh.top + (fh - h2) // 2
    sh.width, sh.height = w2, h2


def keyout(im):
    """다시 그리기에서 빠진 그림 — 네모 바탕째 잘렸으면 둘레 바탕색을 빼고(경계 반투명) 물체만. keyout.bb = 원래 그림 안 물체 자리(0~1)"""
    from collections import deque
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    ring = [px[i, j] for i in range(w) for j in (0, h - 1)] + [px[i, j] for j in range(h) for i in (0, w - 1)]
    if sum(1 for p in ring if p[3] > 200) < 0.6 * len(ring):
        keyout.bb = (0, 0, 1, 1)
        return im   # 이미 투명 바탕
    op = [p for p in ring if p[3] > 200]
    bg = tuple(sorted(p[c] for p in op)[len(op) // 2] for c in range(3))
    d = lambda p: max(abs(p[0] - bg[0]), abs(p[1] - bg[1]), abs(p[2] - bg[2]))
    gone = bytearray(w * h)
    q = deque([(i, j) for i in range(w) for j in (0, h - 1)] + [(i, j) for j in range(h) for i in (0, w - 1)])
    seen = bytearray(w * h)
    while q:
        i, j = q.popleft()
        if i < 0 or j < 0 or i >= w or j >= h or seen[j * w + i]:
            continue
        seen[j * w + i] = 1
        if px[i, j][3] > 200 and d(px[i, j]) > 40:
            continue
        gone[j * w + i] = 1
        q.extend(((i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)))
    for j in range(h):
        for i in range(w):
            p = px[i, j]
            if gone[j * w + i]:
                px[i, j] = bg + (0,)
            elif d(p) < 110:   # 경계 — 바탕과 섞인 만큼 반투명, 색은 바탕을 빼서
                a = max(0.12, d(p) / 110)
                px[i, j] = tuple(max(0, min(255, round(bg[c] + (p[c] - bg[c]) / a))) for c in range(3)) + (round(255 * a * p[3] / 255),)
    bb = im.getbbox() or (0, 0, w, h)
    keyout.bb = (bb[0] / w, bb[1] / h, bb[2] / w, bb[3] / h)
    return im.crop(bb)



def split_tiles(prs):
    """색 네모·원째 그려진 아이콘 → 바탕은 PowerPoint 도형(같은 색·둥근 모서리), 그 위 흰 그림만 이미지(R201).
    바탕은 도형이 맡는다는 원칙(11-03 사용자) — 진한 둘레가 70% 넘는 그림만. 반환: 나눈 수"""
    from collections import Counter
    from PIL import Image
    from pptx.enum.shapes import MSO_SHAPE
    from pptx.dml.color import RGBColor
    import sys as _s
    illus = _s.modules[__name__]
    R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed"
    A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
    n = 0
    for sno, sl in enumerate(prs.slides, 1):
        for sh in list(sl.shapes):
            if sh.shape_type != 13 or sh.name.startswith("pd_"):
                continue
            part = sl.part.related_part(sh._element.find(".//" + A + "blip").get(R))
            im = Image.open(io.BytesIO(part.blob)).convert("RGBA")
            w, h = im.size
            al = im.split()[3]
            # 안쪽 8% 둘레가 불투명하고 진한 단색이면 '바탕째 그림'
            ix, iy = max(2, w * 8 // 100), max(2, h * 8 // 100)
            inner = [(x, iy) for x in range(ix, w - ix, 3)] + [(x, h - 1 - iy) for x in range(ix, w - ix, 3)] + [(ix, y) for y in range(iy, h - iy, 3)] + [(w - 1 - ix, y) for y in range(iy, h - iy, 3)]
            ip = [im.getpixel(p) for p in inner if al.getpixel(p) > 200]
            if len(ip) < 0.8 * len(inner):
                continue
            dark = [p for p in ip if sum(p[:3]) < 450]
            if len(dark) < 0.7 * len(ip):
                continue
            tile = tuple(sorted(p[ch] for p in dark)[len(dark) // 2] for ch in range(3))   # 그라데이션 네모도 — 진한 둘레 가운데값
            if sum(tile) > 600:     # 밝은 바탕(흰 카드 조각)은 건드리지 않는다
                continue
            # 모양: 네 모서리가 투명하면 둥근 네모/원
            corner = sum(1 for p in ((1, 1), (w - 2, 1), (1, h - 2), (w - 2, h - 2)) if al.getpixel(p) < 100)
            round_ = abs(w - h) < 0.12 * max(w, h) and al.getpixel((w // 7, h // 7)) < 100
            kind = MSO_SHAPE.OVAL if round_ else (MSO_SHAPE.ROUNDED_RECTANGLE if corner >= 3 else MSO_SHAPE.RECTANGLE)
            # 바탕 도형 — 그림 불투명 범위 그대로
            bb = al.point(lambda v: 255 if v > 128 else 0).getbbox() or (0, 0, w, h)
            L = sh.left + sh.width * bb[0] / w; T = sh.top + sh.height * bb[1] / h
            W_ = sh.width * (bb[2] - bb[0]) / w; H_ = sh.height * (bb[3] - bb[1]) / h
            bg = sl.shapes.add_shape(kind, int(L), int(T), int(W_), int(H_))
            bg.fill.solid(); bg.fill.fore_color.rgb = RGBColor(*tile)
            bg.line.fill.background(); bg.shadow.inherit = False
            if kind == MSO_SHAPE.ROUNDED_RECTANGLE:
                bg.adjustments[0] = 0.18
            bg.name = sh.name + "_bg"
            # 그림 바로 뒤로
            sh._element.addprevious(bg._element)
            # 흰 그림만 — 바탕색과 먼 픽셀
            # 흰 그림만 — 밝은 픽셀(그라데이션 바탕과 무관하게)
            k = im.copy(); kp = k.load()
            for yy in range(h):
                for xx in range(w):
                    q = kp[xx, yy]
                    lum = min(q[0], q[1], q[2])
                    a_ = 0 if lum < 150 else (255 if lum > 215 else round(255 * (lum - 150) / 65))
                    kp[xx, yy] = (255, 255, 255, min(q[3], a_))
            # 가장자리 흰 조각(네모 테두리 빛·옆 글자) 빼기 — 가운데 50% 와 닿는 덩어리만
            ka = k.split()[3].load(); lab = [0] * (w * h); keepl = set(); nl = 0
            for sy in range(h):
                for sx in range(w):
                    if lab[sy * w + sx] or ka[sx, sy] < 60:
                        continue
                    nl += 1; st = [(sx, sy)]; lab[sy * w + sx] = nl; hit = False
                    while st:
                        i, j = st.pop()
                        if 0.25 * w <= i <= 0.75 * w and 0.25 * h <= j <= 0.75 * h:
                            hit = True
                        for di in (-2, -1, 0, 1, 2):
                            for dj in (-2, -1, 0, 1, 2):
                                u, v = i + di, j + dj
                                if 0 <= u < w and 0 <= v < h and not lab[v * w + u] and ka[u, v] >= 60:
                                    lab[v * w + u] = nl; st.append((u, v))
                    if hit:
                        keepl.add(nl)
            for yy in range(h):
                for xx in range(w):
                    if kp[xx, yy][3] and lab[yy * w + xx] not in keepl:
                        kp[xx, yy] = (255, 255, 255, 0)
            bbk = k.getbbox() or (0, 0, w, h)
            illus.keyout.bb = (bbk[0] / w, bbk[1] / h, bbk[2] / w, bbk[3] / h)
            k = k.crop(bbk)
            x0, y0, x1, y1 = illus.keyout.bb
            need = 450 * (sh.width / 914400) * (x1 - x0)
            if k.width < need:
                r = need / k.width
                k = k.resize((round(k.width * r), round(k.height * r)), Image.LANCZOS)
            b = io.BytesIO(); k.save(b, "PNG"); part._blob = b.getvalue()
            Lg, Tg, Wg, Hg = sh.left + sh.width * x0, sh.top + sh.height * y0, sh.width * (x1 - x0), sh.height * (y1 - y0)
            ar = k.height / k.width
            w2, h2 = (Wg, Wg * ar) if Wg * ar <= Hg else (Hg / ar, Hg)
            sh.left, sh.top, sh.width, sh.height = int(Lg + (Wg - w2) / 2), int(Tg + (Hg - h2) / 2), int(w2), int(h2)
            n += 1
            pass  # print(sno, sh.name, "바탕", "#%02X%02X%02X" % tile, {MSO_SHAPE.OVAL: "원", MSO_SHAPE.ROUNDED_RECTANGLE: "둥근네모", MSO_SHAPE.RECTANGLE: "네모"}[kind])
    return n


def _frag_boxes(im, size=160):
    """그림 가장자리 18% 띠에만 있는, 큰 물체와 떨어진 작은 덩어리(옆 글자 첫 획·카드 테두리 조각)의 범위(0~1) 목록"""
    t = im.convert("RGBA").copy()
    t.thumbnail((size, size))
    w, h = t.size
    a = t.split()[3].load()
    lab = [0] * (w * h)
    comps = []
    for s in range(w * h):
        if lab[s] or a[s % w, s // w] <= 100:
            continue
        lab[s] = len(comps) + 1
        st, pix = [s], []
        while st:
            i = st.pop()
            pix.append(i)
            x, y = i % w, i // w
            for u, v in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= u < w and 0 <= v < h and not lab[v * w + u] and a[u, v] > 100:
                    lab[v * w + u] = lab[s]
                    st.append(v * w + u)
        xs = [i % w for i in pix]; ys = [i // w for i in pix]
        comps.append((len(pix), min(xs), min(ys), max(xs), max(ys)))
    if len(comps) < 2:
        return []
    comps.sort(reverse=True)
    big, L0, T0, R0, B0 = comps[0]
    out = []
    for n, x0, y0, x1, y1 in comps[1:]:
        if n <= 6 or n >= big * 0.25:
            continue
        apart = x0 > R0 + 2 or x1 < L0 - 2 or y0 > B0 + 2 or y1 < T0 - 2
        # 좌우 띠만 — 옆 글자는 좌우에 붙는다. 위아래 떨어진 덩어리는 와이파이 물결·경광등 빛줄기·종 받침선처럼 물체 일부였다
        edge = x0 > w * .82 or x1 < w * .18
        if apart and edge:
            out.append(((x0 - 1) / w, (y0 - 1) / h, (x1 + 2) / w, (y1 + 2) / h))
    return out


def edge_frags(prs, max_pt=70):
    """시안에서 오린 작은 아이콘 그림 가장자리에 붙어 온 옆 글자 첫 획·테두리 조각을 지우고 물체 범위로 다시 맞춘다(R202).
    11-03 검수: '1 10만 샘플', '통합 관제' 앞 '통', '원인 분석' 앞 'ㅇ' 처럼 글 옆에 글자 조각이 보였다. 반환: 고친 그림 수"""
    from PIL import Image
    R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed"
    A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
    n, done = 0, {}
    for sl in prs.slides:
        for sh in sl.shapes:
            if sh.shape_type != 13 or (sh.name or "").startswith("pd_") or not sh.width or max(sh.width, sh.height) / 12700 > max_pt:
                continue
            blip = sh._element.find(".//" + A + "blip")
            if blip is None or not blip.get(R):
                continue
            part = sl.part.related_part(blip.get(R))
            if id(part) in done:   # 같은 그림을 여러 곳이 쓰면 한 번만 고치고 자리만 같은 비율로
                bb = done[id(part)]
            else:
                try:
                    im = Image.open(io.BytesIO(part.blob)).convert("RGBA")
                except Exception:
                    continue
                boxes = _frag_boxes(im)
                if not boxes:
                    continue
                w, h = im.size
                px = im.load()
                for x0, y0, x1, y1 in boxes:
                    for y in range(max(0, int(y0 * h)), min(h, int(y1 * h) + 1)):
                        for x in range(max(0, int(x0 * w)), min(w, int(x1 * w) + 1)):
                            px[x, y] = (0, 0, 0, 0)
                b0 = im.split()[3].point(lambda v: 255 if v > 24 else 0).getbbox() or (0, 0, w, h)
                bb = (b0[0] / w, b0[1] / h, b0[2] / w, b0[3] / h)
                b = io.BytesIO()
                im.crop(b0).save(b, "PNG")
                part._blob = b.getvalue()
                done[id(part)] = bb
            x0, y0, x1, y1 = bb
            sh.left, sh.top = int(sh.left + sh.width * x0), int(sh.top + sh.height * y0)
            sh.width, sh.height = int(sh.width * (x1 - x0)), int(sh.height * (y1 - y0))
            n += 1
    return n


def upscale_small(prs, min_dpi=300, target=450):
    """장표 속 그림 중 해상도가 낮은 것(놓인 크기 기준 min_dpi 미만)을 부드럽게(LANCZOS) target dpi 로 키운다 — 30~60px 아이콘을
    PowerPoint 가 그대로 늘려 확대하면 지글지글 깨져 보였다(11-03 사용자, R200). 같은 그림 part 는 한 번만. 반환: 키운 그림 수"""
    from PIL import Image
    R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed"
    A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
    seen, n = {}, 0
    for sl in prs.slides:
        for sh in sl.shapes:
            if sh.shape_type != 13 or not sh.width:
                continue
            blip = sh._element.find(".//" + A + "blip")
            if blip is None or not blip.get(R):
                continue
            part = sl.part.related_part(blip.get(R))
            need = target * sh.width / 914400
            if id(part) in seen:
                continue
            try:
                im = Image.open(io.BytesIO(part.blob))
            except Exception:
                continue
            seen[id(part)] = True
            if im.width >= min_dpi * sh.width / 914400 or im.width < 4:
                continue
            k = need / im.width
            big = im.convert("RGBA").resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
            b = io.BytesIO()
            big.save(b, "PNG")
            part._blob = b.getvalue()
            n += 1
    return n


def run(job, pptx, dry=False):
    """장표의 그림을 다시 그려 바꿔 끼운다. 반환 (바꾼 곳 수, 그림 수)"""
    metas = collect(job.dir)
    prs, pics = used_images(pptx)
    want = {}
    for sl, sh, part in pics:
        h = sha1(part.blob)
        if h in metas:
            want.setdefault(h, []).append((sh, part))
    keys = sorted(want)
    job.event(f"그림 다시 그리기 — 시안에서 잘라 넣은 그림 {len(keys)}개를 {-(-len(keys) // (COLS * ROWS))}장에 모아 크게 다시 그립니다")
    if dry or not keys:
        return 0, len(keys)
    res = redraw(job, [(h, metas[h]) for h in keys])
    done = kept = 0
    for h, data in res.items():
        for sh, part in want[h]:
            place(sh, part, data)
            done += 1
    from PIL import Image
    for h in keys:   # 빠진 그림 — 네모 바탕을 빼고 원래 물체 자리에(바탕은 장표의 도형이 맡는다, 11-03 사용자)
        if h in res:
            continue
        cut, frag = dirty(Image.open(metas[h]["out"]))
        if cut > 0.22 or frag > 0.1:   # 잘림·옆 조각째 남는 그림 — 확인 목록에 올린다(R207)
            job.event(f"그림 {os.path.basename(metas[h]['out'])} — 다시 그리지 못해 잘린/옆 조각 붙은 옛 그림이 남음, 손으로 바꿔 주세요", "warn")
        k = keyout(Image.open(metas[h]["out"]))
        x0, y0, x1, y1 = keyout.bb
        b = io.BytesIO()
        k.save(b, "PNG")
        for sh, part in want[h]:
            L, T, W, H = sh.left + sh.width * x0, sh.top + sh.height * y0, sh.width * (x1 - x0), sh.height * (y1 - y0)
            part._blob = b.getvalue()
            ar = k.height / k.width
            w2, h2 = (W, W * ar) if W * ar <= H else (H / ar, H)
            sh.left, sh.top, sh.width, sh.height = int(L + (W - w2) / 2), int(T + (H - h2) / 2), int(w2), int(h2)
            kept += 1
    nsp = split_tiles(prs)
    nfr = edge_frags(prs)
    nup = upscale_small(prs)
    prs.save(pptx)
    job.event(f"그림 다시 그리기 — {done}곳을 고해상도 그림으로 바꿨습니다" + (f" · 글자 조각 붙은 아이콘 {nfr}개 정리" if nfr else "")
              + (f" · 해상도 낮은 그림 {nup}개 부드럽게 키움" if nup else ""), "done")
    return done, len(keys)


if __name__ == "__main__":
    # python illus.py <job_id> <pptx> [--dry]   /   python illus.py <job_id> --dir <폴더> --export <내보낼 폴더>(그림 이름.png 로)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import worker, styles
    job = worker.Job({"id": sys.argv[1], "kind": "design", "opts": {}})
    job.style = styles.get("e")
    stop_hb = worker.heartbeat(job)   # 서버가 끊긴 작업으로 보고 대기열로 돌리지 않게
    if "--pieces" in sys.argv:   # 이미 자른 조각 폴더(index.json: [{h}], <h>_piece.png·<h>_old.png) → <h>.png
        d, ex = sys.argv[sys.argv.index("--pieces") + 1], sys.argv[sys.argv.index("--export") + 1]
        ix = json.load(open(os.path.join(d, "index.json"), encoding="utf-8"))
        items = [(x["h"], {"piece": os.path.join(d, x["h"] + "_piece.png"), "out": os.path.join(d, x["h"] + "_old.png")}) for x in ix]
        os.makedirs(ex, exist_ok=True)
        res = redraw(job, items, solo="--solo" in sys.argv)   # --solo: 잘린·조각 붙은 그림을 한 칸씩(R207)
        for name, data in res.items():
            open(os.path.join(ex, name + ".png"), "wb").write(data)
        print("다시 그림", len(res), "/", len(items), "· 비용", round(job.spent, 3))
    elif "--dir" in sys.argv:
        d, ex = sys.argv[sys.argv.index("--dir") + 1], sys.argv[sys.argv.index("--export") + 1]
        ms = collect(d)
        items = sorted(((os.path.basename(m["out"]), m) for m in ms.values()), key=lambda x: x[0])
        os.makedirs(ex, exist_ok=True)
        res = redraw(job, items)
        for name, data in res.items():
            open(os.path.join(ex, name), "wb").write(data)
        print("다시 그림", len(res), "/", len(items), "· 비용", round(job.spent, 3))
    else:
        print(run(job, sys.argv[2], "--dry" in sys.argv))
    stop_hb()
    job.push()
