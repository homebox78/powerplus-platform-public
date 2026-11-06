# -*- coding: utf-8 -*-
"""자료 읽기·표지 글(10-27~30 전수조사 A 항목, R143·R144·R147·R145).
 ① 이름 .hwpx 인데 내용이 옛 HWP(OLE) — real_ext 가 .hwp 로 본다(음성: 이름만 보면 .hwpx)
 ② 자료를 못 읽고 글도 없으면 멈춘다 · 글이 있으면 / 자료를 안 올렸으면 멈추지 않는다
 ③ 표지 제목: 파일 이름 꼴이면 기획 제목 · 입력한 사업명이 먼저
 ④ 꼬리표: 착수보고서·가이드 · 아니면 제안설명회
 ⑤ 구조 장 판정 — 2a1c 'PART 1 표지' 꼴은 잡고, 내용 장은 안 잡는다
 ⑥ 세로 글 표시 지우기"""
import os, sys, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import datafacts, design, vertical as V

FAILS = []


def check(ok, msg):
    print(("통과 " if ok else "실패 ") + msg)
    if not ok:
        FAILS.append(msg)


d = tempfile.mkdtemp()
ole = os.path.join(d, "a.hwpx")
open(ole, "wb").write(b"\xd0\xcf\x11\xe0" + b"0" * 20)
zp = os.path.join(d, "b.hwp")
open(zp, "wb").write(b"PK\x03\x04" + b"0" * 20)
check(os.path.splitext(ole)[1] == ".hwpx" and datafacts.real_ext(ole) == ".hwp", "① 이름 .hwpx·내용 옛 HWP → .hwp 로 읽음")
check(datafacts.real_ext(zp) == ".hwpx", "① 이름 .hwp·내용 zip → .hwpx 로 읽음")


class J:
    doc_sig = "x"


def stops(*a):
    try:
        design.need_material(*a)
        return False
    except RuntimeError:
        return True


check(stops(J(), "", "", ""), "② 자료 못 읽음 + 글 없음 → 멈춤")
check(not stops(J(), "", "직접 쓴 글", ""), "② 직접 쓴 글이 있으면 진행")
check(not stops(J(), "자료 글", "", ""), "② 자료를 읽었으면 진행")
check(not stops(type("N", (), {})(), "", "", ""), "② 자료를 안 올린 작업은 묻지 않음")

plan = {"title": "2026 K-브랜드 통합 마케팅"}
check(design.cover_title("", "결과 (1)", plan) == plan["title"], "③ '결과 (1)' → 기획 제목")
check(design.cover_title("", "미래행공 3차 착수보고서_20230613_GD취합본", {}) == "미래행공 3차 착수보고서 GD취합본", "③ 기획 제목 없으면 다듬은 이름")
check(design.cover_title("입력 사업명", "결과 (1)", plan) == "입력 사업명", "③ 입력한 사업명이 먼저")
check(design.cover_title("", "범정부 통합창구 제안", plan) == "범정부 통합창구 제안", "③ 파일 이름 꼴이 아니면 작업 이름 그대로")

check(design.doc_tail("미래행공 3차 착수보고서_2023", {}, "ko", "present") == "착수보고", "④ 착수보고서 → 착수보고")
check(design.doc_tail("agijagi_design_guideline", {}, "ko", "present") == "가이드", "④ guideline → 가이드")
check(design.doc_tail("디지털지갑 구현", {}, "ko", "present") == "제안설명회", "④ 나머지는 제안설명회")

for sec, want in (("표지 · 중간보고", True), ("목차 · 보고 순서", True), ("사업개요 · 간지", True), ("마무리 · 감사", True), ("질의응답 · 마무리", True),
                  ("사업개요 · 사업범위", False), ("추진전략 · 안정성 확보", False), ("사업의 이해 · 목차 구성 원칙", False)):
    check(design.is_structure_slide({"section": sec}) is want, f"⑤ {sec} → {'구조 장' if want else '내용 장'}")

pg = V.strip_marks({"lead": ["총괄 AE가 이끄는 **전담 조직**을 제시함."], "blocks": [{"bar": "**핵심**", "_brief": {"x": "**그대로**"}}]})
check(pg["lead"][0] == "총괄 AE가 이끄는 전담 조직을 제시함." and pg["blocks"][0]["bar"] == "핵심", "⑥ 별표 지움(블록 안까지)")

# ── 2026-11-01 전체 검수 — 가짜 서버·가짜 AI 로 기획 앞머리만(실제 호출 없음) ──
class Sentinel(Exception):
    """여기까지 왔다 = 비용을 쓰는 단계에 들어갔다"""


class Job:
    def __init__(self, d, j):
        self.id, self.dir, self.j, self.doc_sig = "abcdef0123456789", d, j, ""
        self.spent, self.budget, self.cancel, self.events = 0.0, None, False, []

    def event(self, m, kind="info"):
        self.events.append((kind, m))

    def push(self, *a, **k):
        pass


def raises(fn, *a):
    """(멈춤 RuntimeError 글 | 'cost' = 비용 단계까지 감 | None)"""
    try:
        fn(*a)
    except Sentinel:
        return "cost"
    except RuntimeError as e:
        return str(e)
    return None


W_BAK = dict(design.W)
design.W.update({"req": lambda *a, **k: {"data": []}, "put_file": lambda *a, **k: {}, "download": lambda *a, **k: None, "log": lambda *a: None})
TD = tempfile.mkdtemp(prefix="mat-")


def job_of(opts=None, note="", brief="", source="text", lessons=None, purged=None):
    j = {"id": "abcdef0123456789", "kind": "design", "phase": "plan", "note": note, "brief": brief, "source_kind": source, "opts": opts or {"purpose": "present"},
         "lessons": lessons or [], "docs_purged_at": purged, "title": "사업"}
    return Job(TD, j), j


def unread(job, *_a):   # 자료를 올렸지만 못 읽음
    job.doc_sig = "d1"
    return ""


def cost(*a, **k):
    raise Sentinel()


design.load_context, _lc = unread, design.load_context
design.make_plan, design.digest_context = cost, cost
LONG = [{"text": "지난 작업에서 반복된 결함 문구입니다 " * 3, "hits": 3} for _ in range(12)]
job, j = job_of(lessons=LONG)
check(len(design.lessons_text(j)) >= 200, "⑦ 음성 입력: 자동 교훈만으로 200자를 넘는다")
check("읽지 못해" in str(raises(design._plan_phase, job, j)), "⑦ 가로 — 자동 교훈이 붙어도 자료 못 읽으면 멈춤(R165)")
job, j = job_of(note="가" * 200, lessons=LONG)
check(raises(design._plan_phase, job, j) == "cost", "⑦ 음성 대조 — 사용자가 직접 쓴 요청이 충분하면 진행")

# ⑧ pptx 로 시작한 제출용·회사소개용은 세로·회사소개 길로(R161)
import company as C, vertical as VV
seen = {}
VV.run = lambda job, j, opts, brief, note: seen.update(v=brief)
C.run, _crun = (lambda job, j, opts, brief, note: seen.update(c=brief)), C.run
design.pptx_text, _pt = (lambda p: "초안 글"), design.pptx_text
open(os.path.join(TD, "원본.pptx"), "wb").close()
job, j = job_of({"purpose": "submit"}, source="pptx")
design._plan_phase(job, j)
check(seen.get("v") == "초안 글", "⑧ pptx + 제출용 → 세로 제안서, 초안 글이 내용")
job, j = job_of({"purpose": "company"}, source="pptx")
design._plan_phase(job, j)
check(seen.get("c") == "초안 글", "⑧ pptx + 회사소개용 → 회사소개서, 초안 글이 내용")
seen.clear()
design.pptx_text = lambda p: "  "
job, j = job_of({"purpose": "submit"}, source="pptx")
check("글을 읽지 못해" in str(raises(design._plan_phase, job, j)) and "v" not in seen, "⑧ 글 없는 pptx 는 비용 전에 멈춤")
design.pptx_text = lambda p: "초안 글"
job, j = job_of({"purpose": "present"}, source="pptx")
design.need_material, _nm = (lambda *a, **k: None), design.need_material
check(raises(design._plan_phase, job, j) == "cost" and not seen, "⑧ 음성 대조 — pptx + 발표용은 그대로 기획 길")
design.need_material = _nm
design.pptx_text = _pt
C.run = _crun

# ⑨ 회사소개서도 못 읽으면 멈춘다(R162)
C.plan = cost
job, j = job_of({"purpose": "company"})
check("읽지 못해" in str(raises(C.run, job, j, j["opts"], "", "")), "⑨ 회사소개서 — 자료 못 읽음 + 글 없음 → 멈춤")
job, j = job_of({"purpose": "company"})
check(raises(C.run, job, j, j["opts"], "직접 쓴 글", "") == "cost", "⑨ 음성 대조 — 글이 있으면 진행")
job, j = job_of({"purpose": "submit"}, note="")
check("읽지 못해" in str(raises(V._ctx, job, j, "")), "⑨ 세로 — pptx 예외 없이 같은 검사(L14)")

# ⑩ 자료 목록을 못 받으면·보관 기간이 지나 지워졌으면 멈춘다(R159)
design.load_context = _lc
design.LIST_RETRY_SEC = 0
def net_down(*a, **k):
    raise OSError("연결 실패")
design.W["req"] = net_down
job, j = job_of()
check("목록을 서버에서 받지 못해" in str(raises(design.load_context, job)), "⑩ 목록 조회 실패 → 빈 자료로 넘어가지 않음")
design.W["req"] = lambda *a, **k: {"data": []}
job, j = job_of()
check(design.load_context(job) == "", "⑩ 음성 대조 — 자료 없는 작업은 그대로 빈 글")
job, j = job_of(purged="2026-10-01 00:00:00")
check("보관 기간" in str(raises(design.need_material, job, "", "", "")), "⑩ 자료가 지워진 작업 → 멈춤")
job, j = job_of(purged="2026-10-01 00:00:00")
check(raises(design.need_material, job, "", "직접 쓴 글", "") is None, "⑩ 음성 대조 — 글이 남아 있으면 진행")

# ⑪ 숫자뿐인 이름 — 표지 제목이 빈칸이 되지 않는다(R168)
check(design.clean_title("20230613") == "", "⑪ 음성 입력: 다듬으면 빈 글")
check(design.cover_title("", "20230613", {}) == "20230613", "⑪ 받은 이름 그대로")
check(design.cover_title("", "결과 (1)", {}) == "결과", "⑪ 음성 대조 — 다듬을 수 있으면 다듬음")

# ⑫ 직접 고른 색이 끝까지 간다(R163)
HEX = "#7C3AED"
got = {}
C.plan = lambda *a, **k: {"slides": [{"kind": "cover"}], "company": {}}
def stop_assets(job, deck, d, log=print, ctone="blue", ctheme="a", free=False):
    got["ctone"] = ctone
    raise Sentinel()
C.attach_assets = stop_assets
design.load_context = lambda *a, **k: ""
job, j = job_of({"purpose": "company", "ctone": HEX})
check(raises(C.run, job, j, j["opts"], "글", "") == "cost" and got.get("ctone") == HEX, f"⑫ 고른 색이 다음 단계로 간다({got.get('ctone')})")
job, j = job_of({"purpose": "company", "ctone": "javascript"})
check(raises(C.run, job, j, j["opts"], "글", "") == "cost" and got.get("ctone") == "blue", "⑫ 음성 대조 — 모르는 값은 파랑")
check(C.tone_label(HEX).endswith(HEX), "⑫ 작업 기록에 고른 색")
check("#" not in C.tone_tag(HEX) and C.tone_tag("navy") == "navy", "⑫ 그림 파일 이름에 # 없음(file:/// 주소에서 조각으로 읽힌다)")
check(C.toned("color:" + C.BLUE_KEYS[0], HEX) == "color:" + HEX, "⑫ HTML 색이 고른 색으로")
from PIL import Image
src = os.path.join(TD, "icon.png")
Image.new("RGBA", (4, 4), (31, 79, 255, 255)).save(src)
dst = C.tint_icon(src, src[:-4] + f"_{C.tone_tag(HEX)}.png", HEX)
check(os.path.isfile(dst) and "#" not in dst and Image.open(dst).convert("RGB").getpixel((0, 0)) != (31, 79, 255), "⑫ 아이콘이 고른 색조로 물든다")

design.W.clear(); design.W.update(W_BAK)
print(f"\n실패 {len(FAILS)}건" if FAILS else "\n전부 통과")
sys.exit(1 if FAILS else 0)
