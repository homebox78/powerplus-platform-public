# -*- coding: utf-8 -*-
# 출처: powerPlus/tools/ppt-pipeline/guide_align.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
"""콘텐츠 가이드 맞춤 — 가운데 기준 상 6.90 / 하 8.30 / 좌우 13.00 cm (PowerPoint 안내선 표기).
렌더 PNG 로 '보이는' 콘텐츠 외곽을 재고, 그 외곽이 가이드 4선에 오도록
콘텐츠 도형(최상위)을 한 번의 선형 변환으로 옮기고 늘인다. 글자 크기는 바꾸지 않는다.

제외: 머리 띠(아래 끝 < 2.0cm)·페이지 번호(위 끝 > 18.2cm)·기획 메모(노랑 채움)·
      화면 가장자리에 닿는 장식(좌 < 0.2cm 또는 우 > 폭-0.2cm)·표지/목차/간지(SKIP).
그림은 비율을 지키고(가로·세로 배율 평균) 중심만 옮긴다. 표는 열 너비·행 높이도 같이 늘인다.
배율이 0.9~1.12 를 벗어나는 축은 건드리지 않고 보고한다.
인자: <src.pptx> <render_dir> <dst.pptx> [슬라이드번호...]
"""
import os, sys
import numpy as np
from PIL import Image
from pptx import Presentation
from pptx.util import Emu

sys.stdout.reconfigure(encoding="utf-8")
CM = 360000
SKIP = {1, 2, 3, 9, 15, 30, 36, 40, 39}   # 39 맺음말: 가운데 구성이라 늘리면 헤드라인 조각이 겹친다
NO_Y = {4}          # 노트북 삽화 — 세로를 맞추면 비율이 깨진다(보고만)
src, rdir, dst = sys.argv[1:4]
only = {int(x) for x in sys.argv[4:]}
p = Presentation(src)
W, H = p.slide_width, p.slide_height
G = dict(L=W / 2 - 13.0 * CM, R=W / 2 + 13.0 * CM, T=H / 2 - 6.9 * CM, B=H / 2 + 8.3 * CM)
MEMO = {"FFFF00", "FFFFCC", "FFFF99", "FFFF87"}


def is_memo(sh):
    try:
        if sh.fill.type == 1 and str(sh.fill.fore_color.rgb) in MEMO:
            return True
    except Exception:
        pass
    return sh.has_text_frame and sh.text_frame.text.strip() in ("애매",) and "직사각형" in sh.name


def box(sh):
    return sh.left, sh.top, sh.left + sh.width, sh.top + sh.height


def content_shapes(s):
    keep, mask = [], []
    for sh in s.shapes:
        if sh.left is None or sh.width is None:
            continue
        l, t, r, b = box(sh)
        if b < 2.0 * CM or t > 18.2 * CM:
            continue
        edge = l < 0.2 * CM or r > W - 0.2 * CM
        texty = sh.has_text_frame and sh.text_frame.text.strip()
        if is_memo(sh) or (edge and not texty):
            mask.append((l, t, r, b)); continue
        keep.append(sh)
    return keep, mask


def visual_bbox(png, keep, mask):
    a = np.asarray(Image.open(png).convert("RGB")).astype(int)
    h, w, _ = a.shape
    k = w / W
    ink = (a.max(axis=2) - a.min(axis=2) > 12) | (a.sum(axis=2) < 735)   # 옅은 회색 상자·점선까지
    lim = np.zeros_like(ink)
    for sh in keep:
        l, t, r, b = box(sh)
        lim[max(0, int(t * k) - 4):int(b * k) + 4, max(0, int(l * k) - 4):int(r * k) + 4] = True
    for l, t, r, b in mask:
        lim[max(0, int(t * k)):int(b * k) + 1, max(0, int(l * k)):int(r * k) + 1] = False
    lim[:int(2.3 * CM * k), :] = False
    lim[int(18.2 * CM * k):, :] = False
    ys, xs = np.nonzero(ink & lim)
    if len(xs) == 0:
        return None
    return xs.min() / k, ys.min() / k, (xs.max() + 1) / k, (ys.max() + 1) / k


def scale_table(sh, sx, sy):
    tbl = sh.table
    for c in tbl.columns:
        c.width = Emu(int(c.width * sx))
    for r in tbl.rows:
        r.height = Emu(int(r.height * sy))


for i, s in enumerate(p.slides, 1):
    if i in SKIP or (only and i not in only):
        continue
    keep, mask = content_shapes(s)
    vb = visual_bbox(os.path.join(rdir, f"s{i:02d}.png"), keep, mask)
    if not vb:
        continue
    L, T, R, B = vb
    dev = [(L - G["L"]) / CM, (R - G["R"]) / CM, (T - G["T"]) / CM, (B - G["B"]) / CM]
    if max(abs(d) for d in dev) < 0.03:
        print(f"s{i:02d} 이미 맞음"); continue
    sx = (G["R"] - G["L"]) / (R - L)
    sy = (G["B"] - G["T"]) / (B - T)
    note = []
    spread = set()
    if not 0.9 <= sx <= 1.12:
        note.append(f"가로배율 {sx:.3f} → 크기 유지·간격만"); spread.add('x')
    if i in NO_Y:
        note.append('세로 제외'); sy = None
    elif not 0.9 <= sy <= 1.12:
        note.append(f"세로배율 {sy:.3f} → 크기 유지·간격만"); spread.add('y')
    if 'x' in spread: sx = None
    if 'y' in spread: sy = None
    fx = (lambda x: G["L"] + (x - L) * sx) if sx else (lambda x: x)
    fy = (lambda y: G["T"] + (y - T) * sy) if sy else (lambda y: y)
    kx, ky = sx or 1.0, sy or 1.0

    def dist(v0, size, lo, hi, glo, ghi):
        """크기는 두고 위치만 — 바깥에 닿는 도형이 가이드에 오도록 간격을 편다."""
        span = hi - lo
        if span - size <= 0:
            return v0
        return glo + (v0 - lo) * ((ghi - glo) - size) / (span - size)

    for sh in keep:
        l, t, r, b = box(sh)
        if spread:
            if 'x' in spread:
                sh.left = Emu(int(dist(l, r - l, L, R, G["L"], G["R"])))
            if 'y' in spread:
                sh.top = Emu(int(dist(t, b - t, T, B, G["T"], G["B"])))
            l, t, r, b = box(sh)
            if sx is None and sy is None:
                continue
        if sh.shape_type == 13:          # 그림: 비율 유지, 중심 이동
            k = (kx + ky) / 2
            cx, cy = fx((l + r) / 2), fy((t + b) / 2)
            w, h = sh.width * k, sh.height * k
            sh.left, sh.top = Emu(int(cx - w / 2)), Emu(int(cy - h / 2))
            sh.width, sh.height = Emu(int(w)), Emu(int(h))
            continue
        nl, nt, nr, nb = fx(l), fy(t), fx(r), fy(b)
        sh.left, sh.top = Emu(int(nl)), Emu(int(nt))
        sh.width, sh.height = Emu(int(nr - nl)), Emu(int(nb - nt))
        if sh.shape_type == 19:
            scale_table(sh, kx, ky)
    print(f"s{i:02d} 좌{dev[0]:+.2f} 우{dev[1]:+.2f} 상{dev[2]:+.2f} 하{dev[3]:+.2f} cm → "
          f"배율 가로 {kx:.3f} 세로 {ky:.3f} {' '.join(note)}")
p.save(dst)
print("저장", dst)
