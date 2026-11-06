# -*- coding: utf-8 -*-
"""PowerPoint 없이(리눅스 엔진) — ① 나란한 같은 종류 글은 같은 크기로 줄여 꼬리 줄·어절 잘림·넘침 없애기 ② 글을 덮는 그림 줄이기.

이전엔 글상자마다 따로 줄여 같은 열·같은 줄의 글 크기가 제각각이 됐고(R198), 다시 그린 그림이 틀을 꽉 채워 옆 글을 덮었다(11-03 취합본).
줄 계산은 textlines(PowerPoint 글줄 수치표 + 한국어 표시면 어절 단위, R199).

  fitgroup.py <src> <dst> [--slides 3,5]     (finalize 가 부른다 — run(prs))
"""
import os, sys
sys.argv, _ARGV = sys.argv[:1], sys.argv
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import textlines as TL
sys.argv = _ARGV
from pptx.oxml.ns import qn

BAD = ("어절", "고아", "넘침", "가로넘침")
EMU = 12700


def _bad(box):
    return any(p[0] in BAD for p in TL.problems(box))


def _sizes_all(box):
    return [TL._sizes(pa) for pa in box.paras]


def _restore_all(box, saved):
    for pa, ss in zip(box.paras, saved):
        TL._restore(pa, ss)
    for i in range(len(box.paras)):
        TL._rebuild(box, i)


def _shrink(box, delta):
    for i, pa in enumerate(box.paras):
        if pa.text.strip() and TL._size_known(pa):
            TL._set_size(pa, delta)
        TL._rebuild(box, i)


def need(box, limit=0.15):
    """이 상자가 고칠 줄이 없어지는 데 필요한 축소(pt, 0 이하). 못 풀면 0(그대로 둔다)"""
    if not _bad(box) or not all(TL._size_known(pa) for pa in box.paras if pa.text.strip()):
        return 0.0
    pt0 = max((pa.biggest()[0] for pa in box.paras if pa.text.strip()), default=0)
    saved = _sizes_all(box)
    found = 0.0
    for step in range(1, 40):
        d = -0.25 * step
        if -d > pt0 * limit or pt0 + d < 7:
            break
        _restore_all(box, saved)
        _shrink(box, d)
        if not _bad(box):
            found = d
            break
    _restore_all(box, saved)
    return found


def _rect(box):
    """글이 실제로 차지하는 사각형(pt, 장 좌표) — 정렬·세로 기준 반영"""
    lay, total = box.layout()
    sh, bp = box.sh, box.bp
    g = lambda k, d: int(bp.get(k)) / EMU if bp is not None and bp.get(k) else d
    li, ti, bi = g("lIns", 7.2), g("tIns", 3.6), g("bIns", 3.6)
    wmax, algn = 0.0, "l"
    for pa, ls in lay:
        for a, b in ls:
            wmax = max(wmax, pa.width_of(a, b))
        if pa.ppr is not None and pa.ppr.get("algn"):
            algn = pa.ppr.get("algn")
    x = sh.Left + li + (box.box_w - wmax) * {"ctr": 0.5, "r": 1.0}.get(algn, 0.0)
    anc = (bp.get("anchor") if bp is not None else None) or "t"
    y = sh.Top + ti + (box.box_h - total) * {"ctr": 0.5, "b": 1.0}.get(anc, 0.0)
    return (x, y, wmax, total)


def _hit(a, b, m=3):
    return a[0] < b[0] + b[2] - m and a[0] + a[2] > b[0] + m and a[1] < b[1] + b[3] - m and a[1] + a[3] > b[1] + m


def run(prs, only=None, log=None):
    """반환 (같이 줄인 묶음 수, 줄인 그림 수)"""
    log = log if log is not None else []
    ng = npic = 0
    for no, slide in enumerate(prs.slides, 1):
        if only and no not in only:
            continue
        if any((sh.name or "").startswith("pd_front") for sh in slide.shapes):
            continue
        bxs = list(TL.boxes(slide))
        info = []
        for b in bxs:
            pt = max((pa.biggest()[0] for pa in b.paras if pa.text.strip()), default=0)
            info.append({"b": b, "pt": round(pt * 4) / 4, "need": need(b), "g": -1})
        # 묶음 — 같은 글 크기·비슷한 폭·같은 열(왼쪽) 또는 같은 줄(위)
        g = 0
        for i, it in enumerate(info):
            if it["g"] >= 0:
                continue
            it["g"], st = g, [i]
            while st:
                a = info[st.pop()]
                for j, o in enumerate(info):
                    if o["g"] < 0 and abs(a["pt"] - o["pt"]) <= 0.3 and abs(a["b"].sh.Width - o["b"].sh.Width) <= 6 \
                            and (abs(a["b"].sh.Left - o["b"].sh.Left) <= 4 or abs(a["b"].sh.Top - o["b"].sh.Top) <= 4):
                        o["g"] = g
                        st.append(j)
            g += 1
        for k in range(g):
            mem = [it for it in info if it["g"] == k]
            d = min(it["need"] for it in mem)
            if d >= 0:
                continue
            for it in mem:
                if all(TL._size_known(pa) for pa in it["b"].paras if pa.text.strip()):
                    _shrink(it["b"], d)
            ng += 1
            log.append((no, f"같은 종류 {len(mem)}개 {d:+.2f}pt", mem[0]["b"].text()[:20]))
        # 글을 덮는 그림 — 글 반대쪽 모서리에 붙여 줄인다(최소 60%)
        rects = [_rect(b) for b in TL.boxes(slide)]
        for sh in slide.shapes:
            if sh.shape_type != 13 or (sh.name or "").startswith("pd_") or not sh.width:
                continue
            if max(sh.width, sh.height) / EMU < 32:   # 글 옆에 붙는 작은 아이콘은 그대로
                continue
            pr = lambda: (sh.left / EMU, sh.top / EMU, sh.width / EMU, sh.height / EMU)
            hits = [r for r in rects if _hit(pr(), r)]
            if not hits:
                continue
            L, T, W, H = sh.left, sh.top, sh.width, sh.height
            cx, cy = L + W / 2, T + H / 2
            tx = sum(r[0] + r[2] / 2 for r in hits) / len(hits) * EMU
            ty = sum(r[1] + r[3] / 2 for r in hits) / len(hits) * EMU
            ok = False
            for step in range(1, 9):
                s = 1 - 0.05 * step
                w, h = int(W * s), int(H * s)
                sh.width, sh.height = w, h
                sh.left = int(L + W - w) if tx < cx else L
                sh.top = int(T + H - h) if ty < cy else T
                if not any(_hit(pr(), r) for r in rects):
                    ok = True
                    break
            if ok:
                npic += 1
                log.append((no, f"그림 {s:.0%}", sh.name))
            else:
                sh.left, sh.top, sh.width, sh.height = L, T, W, H
    return ng, npic


if __name__ == "__main__":
    from pptx import Presentation
    a = [x for x in sys.argv[1:] if not x.startswith("--")]
    only = {int(x) for x in sys.argv[sys.argv.index("--slides") + 1].split(",")} if "--slides" in sys.argv else None
    prs = Presentation(a[0])
    lg = []
    print(run(prs, only, lg))
    for x in lg[:60]:
        print(*x)
    prs.save(a[1])
