# -*- coding: utf-8 -*-
"""초안 다듬기 마무리 도구 2종 — PowerPoint 없는 판(리눅스 엔진). 2026-10-12 한 장 시험에서 남았던 흠.

  cardfit.py spaces <src> <dst> [--dry] [--slides 3,5]
      글 안의 이중 공백("AI  가")을 한 칸으로. 문구는 바꾸지 않는다(공백만). 기획 메모·말풍선은 건드리지 않는다.
  cardfit.py fit <src> <dst> [--dry] [--slides …] [--pad 10] [--min 18]
      카드 안 글 아래 큰 빈 공간을 없앤다. 카드 = 채운 네모(장 폭 60% 미만) 안에 글·그림이 든 것.
      같은 줄의 형제 카드(폭·높이·위 끝이 같음)끼리 한 묶음으로 보고, 묶음 안 가장 큰 내용 아래 끝 + 여백(pad)으로
      높이를 같이 줄인다 — 카드마다 따로 줄이면 높이가 제각각이 된다. 카드 아래 끝에 붙은 바닥 띠·그림이 있으면 그 카드는 건드리지 않는다.
      min 보다 작은 빈 공간은 그대로 둔다. 글 아래 끝은 vcenter 의 PowerPoint 글줄 수치표로 계산(렌더 없음).
결과는 한 줄씩 출력하고, 바꾼 수를 마지막 줄에 적는다. 확인은 렌더(lo.py)로."""
import os, re, sys
sys.argv, _ARGV = sys.argv[:1], sys.argv
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vcenter as V
import textlines as T
sys.argv = _ARGV
from pptx import Presentation
from pptx.oxml.ns import qn

sys.stdout.reconfigure(encoding="utf-8")
EMU = V.EMU
IN = 72.0


def _opt(k, d=None):
    return sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d


def _slides():
    v = _opt("--slides")
    return {int(x) for x in v.split(",") if x} if v else None


# ── 1. 이중 공백 ─────────────────────────────────────────
_DBL = re.compile(r"[ 　]{2,}")


def _memo(sh, SW, SH):
    """기획 메모·말풍선 — 노란 채움·말풍선 이름(textlines 규칙), 이름에 '메모', 장 밖에 놓인 도형"""
    if T.is_memo(sh.el) or "메모" in (sh.Name or ""):
        return True
    return sh.Left >= SW or sh.Top >= SH or sh.Left + sh.Width <= 0 or sh.Top + sh.Height <= 0


def spaces(src, dst, dry, only):
    pres = Presentation(src)
    SW, SH = pres.slide_width / EMU, pres.slide_height / EMU
    n = 0
    for sno, sl in enumerate(pres.slides, 1):
        if only and sno not in only:
            continue
        for sh in V.flat(sl.shapes._spTree):
            if sh.kind != "sp" or _memo(sh, SW, SH):
                continue
            for p in sh.el.iter(qn("a:p")):
                ts = [t for t in p.iter(qn("a:t"))]
                # 런 경계에 걸친 공백("AI " + " 가")도 한 칸으로
                for i, t in enumerate(ts):
                    s = t.text or ""
                    s2 = _DBL.sub(" ", s)
                    if i > 0 and s2.startswith(" ") and (ts[i - 1].text or "").endswith(" "):
                        s2 = s2[1:]
                    if s2 != s:
                        n += 1
                        print(f"{sno}장 {sh.Name}: {s.strip()[:30]!r} → {s2.strip()[:30]!r}")
                        if not dry:
                            t.text = s2
    if not dry:
        pres.save(dst)
    print(f"이중 공백 {n}곳 {'(미리보기)' if dry else '고침'}")


# ── 2. 카드 빈 공간 ───────────────────────────────────────

def _inside(c, g, tol=2.0):
    return g.Left >= c.Left - tol and g.Left + g.Width <= c.Left + c.Width + tol \
        and g.Top >= c.Top - tol and g.Top + g.Height <= c.Top + c.Height + tol


SAFE = 0.3   # 글 높이 계산(PowerPoint 수치표)과 실제 렌더 차이 여유 — 13줄에서 약 30pt 짧게 나온 실측


def _content(c, shs, i):
    """카드 c 안 내용 — dict(top, bot, items, body_top). 바닥에 붙은 띠·그림이 있으면 None(건드리지 않음).
    머리 띠(카드 위 끝에 붙은 폭 가득 채운 도형, 높이 35% 이하)는 내용이 아니라 본문 시작선이다."""
    top = bot = None
    body_top = c.Top
    items = []
    for j, g in enumerate(shs):
        if j == i or g is c or not _inside(c, g):
            continue
        if g.Width > c.Width * 0.98 and g.Height > c.Height * 0.98:
            continue
        gb = g.Top + g.Height
        if g.kind == "sp" and V.filled(g, 1e9, 1e9) and abs(g.Top - c.Top) < 3 \
                and g.Width >= c.Width * 0.95 and g.Height <= c.Height * 0.35:
            body_top = max(body_top, gb)      # 머리 띠
            continue
        if g.kind == "pic" or (g.kind == "sp" and V.filled(g, 1e9, 1e9) and not V._has_text(g)):
            if gb >= c.Top + c.Height - 3:     # 바닥 띠·바닥 그림 → 레이아웃 요소
                return None
            t, b = g.Top, gb
        else:
            L = V.layout(g) if g.kind == "sp" else None
            if L:
                t, b = L["ink_top"], L["ink_bot"] + (L["ink_bot"] - L["ink_top"]) * SAFE
            elif g.kind == "sp":
                t, b = g.Top, gb
            else:
                continue
        top = t if top is None else min(top, t)
        bot = b if bot is None else max(bot, b)
        items.append((j, g))
    if V._has_text(c):        # 카드 자체 글
        L = V.layout(c)
        if L:
            t, b = L["ink_top"], L["ink_bot"] + (L["ink_bot"] - L["ink_top"]) * SAFE
            top = t if top is None else min(top, t)
            bot = b if bot is None else max(bot, b)
    if bot is None:
        return None
    return {"top": top, "bot": bot, "items": items, "body_top": body_top}


def _set_h(sh, new_h):
    """장 위 pt 높이로 cy 를 바꾼다(그룹 배율 반영)"""
    g = V._xfrm(sh.el)
    if not g:
        return
    g[0].find(qn("a:ext")).set("cy", str(int(round(new_h / sh.sy * EMU))))


def _move(sh, dy):
    """장 위 pt 만큼 아래로(그룹 배율 반영)"""
    g = V._xfrm(sh.el)
    if not g:
        return
    off = g[0].find(qn("a:off"))
    off.set("y", str(int(round(int(off.get("y")) + dy / sh.sy * EMU))))


def fit(src, dst, dry, only, pad, minimum, keep=0.6):
    """카드 높이를 원래의 keep 배까지만 줄이고, 남는 빈 공간은 내용 묶음을 세로 가운데로 옮겨 나눈다."""
    pres = Presentation(src)
    SW, SH = pres.slide_width / EMU, pres.slide_height / EMU
    n = 0
    for sno, sl in enumerate(pres.slides, 1):
        if only and sno not in only:
            continue
        shs = V.flat(sl.shapes._spTree)
        cards = []
        for i, c in enumerate(shs):
            if c.kind != "sp" or (abs(c.rot) > 1 and abs(c.rot - 360) > 1):
                continue
            if not V.filled(c, SW, SH) or c.Width > SW * 0.6 or c.Height < 0.6 * IN or c.Width < 0.8 * IN:
                continue
            if not any(_inside(c, g) and g is not c for g in shs):
                continue
            ct = _content(c, shs, i)
            if ct is None:
                continue
            cards.append((c, i, ct, c.Top + c.Height - ct["bot"]))
        used = set()
        for k, (c, i, ct, gap) in enumerate(cards):
            if k in used:
                continue
            grp = [k] + [m for m, (d, _, _, _) in enumerate(cards) if m != k and m not in used
                         and abs(d.Width - c.Width) < c.Width * 0.05 and abs(d.Height - c.Height) < c.Height * 0.05
                         and abs(d.Top - c.Top) < 4]
            used.update(grp)
            g_gap = min(cards[m][3] for m in grp)
            cut = min(g_gap - pad, min(cards[m][0].Height for m in grp) * (1 - keep))
            cut = cut if cut >= minimum else 0
            # 줄인 뒤 남는 빈 공간 → 형제가 같은 거리만큼 아래로(위 끝 줄 맞춤), 가장 긴 카드가 가운데 오게
            dys = []
            for m in grp:
                d, _, ct, _ = cards[m]
                above = ct["top"] - ct["body_top"]
                below = d.Top + d.Height - cut - ct["bot"]
                dys.append((below - above) / 2)
            dy = max(0.0, min(dys))
            if cut <= 0 and dy < 6:
                continue
            names = ",".join(cards[m][0].Name for m in grp)
            msg = f"{sno}장 카드 {len(grp)}개({names}): 빈 공간 {g_gap:.0f}pt"
            msg += f" → 높이 {cut:.0f}pt 줄임" if cut > 0 else " → 높이 그대로"
            if dy >= 6:
                msg += f", 내용 {dy:.0f}pt 내려 가운데"
            body = [cards[m][0].Top + cards[m][0].Height - cut - cards[m][2]["body_top"] for m in grp]
            used_h = [cards[m][2]["bot"] - cards[m][2]["top"] for m in grp]
            fill = max(u / b for u, b in zip(used_h, body) if b > 0) if body else 1
            if fill < 0.5:
                msg += f" · 내용이 본문 {fill * 100:.0f}% 만 채움 — 글 크기 키우기·내용 보강 검토"
            print(msg)
            n += len(grp)
            if dry:
                continue
            for m in grp:
                d, di, ct, _ = cards[m]
                new_bot = d.Top + d.Height - cut
                if cut > 0:
                    _set_h(d, d.Height - cut)
                for j, g in ct["items"]:
                    if dy >= 6:
                        _move(g, dy)
                    gt = g.Top + (dy if dy >= 6 else 0)
                    if g.kind == "sp" and gt + g.Height > new_bot + 1 and gt < new_bot:   # 카드 밖으로 나가는 빈 글상자 자르기
                        _set_h(g, max(new_bot - gt, 4))
    if not dry:
        pres.save(dst)
    print(f"카드 {n}개 {'(미리보기)' if dry else '고침'}")


def main():
    a = [x for x in sys.argv[1:] if not x.startswith("--")]
    if len(a) < 3 or a[0] not in ("spaces", "fit"):
        print(__doc__)
        sys.exit(2)
    dry, only = "--dry" in sys.argv, _slides()
    src, dst = os.path.abspath(a[1]), os.path.abspath(a[2])
    if a[0] == "spaces":
        spaces(src, dst, dry, only)
    else:
        fit(src, dst, dry, only, float(_opt("--pad", 10)), float(_opt("--min", 18)))


if __name__ == "__main__":
    main()
