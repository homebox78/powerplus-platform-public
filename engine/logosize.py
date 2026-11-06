# -*- coding: utf-8 -*-
"""발주기관·제안사 로고 크기 — 모든 덱 공통 규칙(사용자 2026-10-28): "항상 발주기관 로고가 제안사 로고보다 15% 커야 함."
frame.py 의 바닥 로고(DCK-206) 알고리즘을 뽑아 앞장(코드 표지·시안 앞장)·시안 바닥·세로 제안서가 같이 쓴다(R121).

  fit_pair(client, vendor, side, lim_h, lim_w)   두 그림 크기 → (발주기관 w,h), (제안사 w,h)
    ① 면적으로 맞춘다 — √(가로×세로) = side(제안사), side×1.15(발주기관). 가로형·세로형 로고가 같은 무게로 보이게
    ② 틀 상한(높이 lim_h → 폭 lim_w 순)으로 줄인다
    ③ 높이로도 1.15배 — 면적만 맞추면 가로로 긴 제안사 로고가 더 커 보인다. 발주기관 로고를 상한까지 키우고, 그래도 모자라면 제안사 로고를 줄인다
  enforce_height(c, v, lim_h, lim_w)             ③ 만 — 크기가 이미 정해진 자리(세로 제안서 견본·에이전트가 놓은 앞장 로고)
  role(shape) / pairs(prs) / check(prs)          장표에서 로고 쌍을 찾아 높이 비를 잰다(마무리 검사·시험)

도형 이름 규칙: 발주기관 = 이름이 'client_logo' 로 끝남(pd_frame_client_logo · pd_front_cover_3_client_logo) 또는 '발주기관 로고',
제안사 = 'vendor_logo' 로 끝남 또는 '제안사 로고'. 이름이 없으면 그림 설명(descr — python-pptx 는 파일 이름)으로
'<id>_logo_client.png'·'client.png'·'client_h.png'·'client_white.png' 를 알아본다."""
import hashlib, os, re

RATIO = 1.15
TOL = 0.01   # 검사 허용 오차(1%) — EMU·픽셀 반올림


def _scale(wh, k):
    return (wh[0] * k, wh[1] * k)


def enforce_height(c, v, lim_h=None, lim_w=None, ratio=RATIO):
    """c·v = (w, h). 발주기관 높이 ≥ 제안사 높이 × ratio 가 되게 — 발주기관을 상한(lim_h·lim_w)까지 키우고, 모자라면 제안사를 줄인다"""
    if c is None or v is None or c[1] <= 0 or v[1] <= 0:
        return c, v
    if c[1] < v[1] * ratio:
        want = v[1] * ratio
        k = want / c[1]
        if lim_h:
            k = min(k, lim_h / c[1])
        if lim_w:
            k = min(k, lim_w / c[0])
        if k > 1:
            c = _scale(c, k)
        if c[1] < v[1] * ratio:
            v = _scale(v, c[1] / (v[1] * ratio))
    return c, v


def _clamp(wh, lim_h, lim_w):
    if lim_h and wh[1] > lim_h:
        wh = _scale(wh, lim_h / wh[1])
    if lim_w and wh[0] > lim_w:   # 가로로 긴 로고는 폭을 막는다
        wh = _scale(wh, lim_w / wh[0])
    return wh


def fit_pair(client, vendor, side, lim_h=None, lim_w=None, ratio=RATIO):
    """client·vendor = 그림 크기 (w, h)(단위 아무거나 — 비율만 쓴다) 또는 None. side = 제안사 로고의 √(가로×세로) 목표(돌려줄 단위).
    반환 ((cw, ch) | None, (vw, vh) | None) — 소수. 로고가 하나뿐이면 면적·상한만(높이 규칙 없음)"""
    out = []
    for wh, k in ((client, ratio), (vendor, 1.0)):
        if not wh or wh[0] <= 0 or wh[1] <= 0:
            out.append(None)
            continue
        r = side * k / (wh[0] * wh[1]) ** 0.5
        out.append(_clamp((wh[0] * r, wh[1] * r), lim_h, lim_w))
    return enforce_height(out[0], out[1], lim_h, lim_w, ratio)


def ints(wh):
    """정수 크기(EMU·픽셀) — 높이 비가 반올림으로 1.15 아래로 내려가지 않게 내림이 아니라 반올림, 최소 1"""
    return None if wh is None else (max(1, int(round(wh[0]))), max(1, int(round(wh[1]))))


def ints_pair(c, v, ratio=RATIO):
    """fit_pair 결과를 정수로 — 반올림으로 제안사가 1px 커져 비가 1.15 아래로 내려가지 않게, 제안사 높이는 발주기관 ÷ 1.15 이하로 내린다"""
    ci, vi = ints(c), ints(v)
    if ci and vi and ci[1] < vi[1] * ratio:
        nh = max(1, int(ci[1] / ratio))
        vi = (max(1, int(round(v[0] * nh / v[1]))), nh)
    return ci, vi


# ───────────────────────── 장표에서 로고 쌍 찾기·재기
P_NS = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
A_NS = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
R_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
_DESCR = {"client": re.compile(r"(^|[_\-/\\])(logo_client|client(_h|_white)?)\.(png|jpe?g|webp)$", re.I),
          "vendor": re.compile(r"(^|[_\-/\\])(logo_vendor|vendor(_h|_white)?)\.(png|jpe?g|webp)$", re.I)}


def _descr(sh):
    el = sh._element.find(f".//{P_NS}cNvPr")
    return (el.get("descr") or "") if el is not None else ""


def _blob_hash(sh):
    try:
        blip = sh._element.find(f".//{A_NS}blip")
        return hashlib.sha1(sh.part.related_part(blip.get(f"{R_NS}embed")).blob).hexdigest()
    except Exception:
        return None


def role(sh, known=None):
    """'client' | 'vendor' | None. known = {그림 sha1: 역할} — 이름이 붙기 전(옛 코드) 장표를 재는 시험용"""
    nm = sh.name or ""
    if nm.endswith("client_logo") or nm == "발주기관 로고":
        return "client"
    if nm.endswith("vendor_logo") or nm == "제안사 로고":
        return "vendor"
    if getattr(sh, "shape_type", None) != 13:   # 그림만
        return None
    d = os.path.basename(_descr(sh).replace("\\", "/"))
    for k, rx in _DESCR.items():
        if rx.search(d):
            return k
    if known:
        return known.get(_blob_hash(sh))
    return None


def _visible(slide):
    """장에 보이는 도형 — 장 + (showMasterSp 가 0 이 아니면) 레이아웃 + (레이아웃도 0 이 아니면) 마스터"""
    out = list(slide.shapes)
    if slide._element.get("showMasterSp") != "0":
        lay = slide.slide_layout
        out += list(lay.shapes)
        if lay._element.get("showMasterSp") != "0":
            out += list(lay.slide_master.shapes)
    return out


def pairs(prs, known=None):
    """장마다 [(장 번호, 발주기관 도형 | None, 제안사 도형 | None)] — 한 장에 같은 역할이 여럿이면 가장 큰 것"""
    rows = []
    for i, s in enumerate(prs.slides, 1):
        got = {}
        for sh in _visible(s):
            r = role(sh, known)
            if r and (r not in got or (sh.height or 0) > (got[r].height or 0)):
                got[r] = sh
        rows.append((i, got.get("client"), got.get("vendor")))
    return rows


def check(prs, known=None, ratio=RATIO, tol=TOL):
    """두 로고가 함께 보이는 장마다 (장 번호, 발주기관 높이, 제안사 높이, 비, 통과). 로고가 하나뿐인 장은 빼고 돌려준다"""
    out = []
    for i, c, v in pairs(prs, known):
        if c is None or v is None or not v.height:
            continue
        r = (c.height or 0) / v.height
        out.append((i, c.height, v.height, round(r, 4), r >= ratio * (1 - tol)))
    return out


def enforce_slide(slide):
    """에이전트가 놓은 앞장 로고(장 위 그림)의 안전망 — 발주기관 로고는 그대로 두고(키우면 글·그림과 겹칠 수 있다),
    모자라면 제안사 로고만 줄인다. 제안사 로고는 가까운 가장자리(왼쪽·오른쪽)와 세로 가운데를 지킨다. 고쳤으면 True"""
    got = {}
    for sh in slide.shapes:
        r = role(sh)
        if r and r not in got:
            got[r] = sh
    c, v = got.get("client"), got.get("vendor")
    if c is None or v is None or not c.height or not v.height:
        return False
    if c.height >= v.height * RATIO:
        return False
    nc, nv = enforce_height((c.width, c.height), (v.width, v.height), c.height, c.width)
    nw, nh = ints_pair(nc, nv)[1]
    cx, cy, right = v.left + v.width / 2, v.top + v.height / 2, v.left + v.width
    sw = slide.part.package.presentation_part.presentation.slide_width
    keep_right = (sw - right) < v.left   # 오른쪽 가장자리에 더 가까우면 오른쪽 끝을 지킨다
    v.width, v.height = nw, nh
    v.top = int(cy - nh / 2)
    v.left = int(right - nw) if keep_right else int(cx - nw / 2) if abs(cx - sw / 2) < sw * 0.1 else v.left
    return True
