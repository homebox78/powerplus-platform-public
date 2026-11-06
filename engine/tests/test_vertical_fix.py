# -*- coding: utf-8 -*-
"""세로 제안서 고쳐 쓰기 시험(R107) — 규칙 검사 고쳐 쓰기가 장 전체를 한 요청으로 다시 쓰지 않는가.
  10-28 15:30: II 장(항목 31·41쪽) 위반 31건 중 '(장 전체)' 위반 때문에 41쪽 전부를 답 16k 한 요청에 → '최대 토큰' 으로 잘림.
  ① 고쳐 쓰기 요청 하나에 든 '먼저 쓴 쪽' 은 6쪽 이하, 항목은 4개 이하
  ② 장 전체 위반(사진 없음·2단 부족·글 블록 과다·구성 과다)은 쪽 위반으로 바뀌거나 엔진이 바로 고친다(사진 블록)
  ③ 같은 작업을 다시 돌리면 첫 쓰기·고쳐 쓰기 모두 AI 호출 0(조각 보관)
  ④ 진행률이 첫 쓰기 12→34, 고쳐 쓰기 34→38 사이에서 오른다

  python -X utf8 engine/tests/test_vertical_fix.py
  PD_ENGINE_DIR=<고치기 전 engine 사본> python …     음성 대조 — 고치기 전 코드는 ① 이 실패해야 한다
가짜 AI 만 쓴다(_plan_call 바꿔치기). 서버·실제 AI 없음."""
import glob, json, os, re, shutil, sys, tempfile, threading

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(os.environ.get("PD_ENGINE_DIR") or os.path.dirname(HERE))
TMP = tempfile.mkdtemp(prefix="vfix-")
ENG = os.path.join(TMP, "engine")
os.makedirs(ENG)
for pat in ("*.py", "*.json"):
    for f in glob.glob(os.path.join(SRC, pat)):
        shutil.copy2(f, ENG)
for d in ("templates", "fonts"):
    s = os.path.join(SRC, d) if os.path.isdir(os.path.join(SRC, d)) else os.path.join(os.path.dirname(HERE), d)
    if os.path.isdir(s):
        shutil.copytree(s, os.path.join(ENG, d))
sys.path.insert(0, ENG)

import design  # noqa: E402
import vertical as V  # noqa: E402

FAILS = []
CALLS = []


def check(ok, msg):
    print(("통과 " if ok else "실패 ") + msg)
    if not ok:
        FAILS.append(msg)


def _list_after(user, head):
    if head not in user:
        return None
    s = user.split(head, 1)[1]
    try:
        return json.JSONDecoder().raw_decode(s.lstrip())[0]
    except Exception:   # noqa: BLE001
        return None


def fake(job, system, user, tokens, what="", **k):
    """첫 쓰기: 항목마다 글 블록 하나짜리 쪽(덜 차고·글만·사진 없음 — 일부러 규칙 위반)
    고쳐 쓰기: 받은 쪽마다 카드+절차 블록으로 다시(제목 그대로)"""
    redo = _list_after(user, "# 먼저 쓴 쪽(이 중 고칠 것)\n")
    items = _list_after(user, "# 쓸 항목(순서대로)\n") or []
    CALLS.append({"what": what, "tokens": tokens, "redo": len(redo) if redo is not None else None, "items": len(items)})
    if redo is not None:
        return {"pages": [{"title": pg["title"], "lead": ["도입."], "band": "띠", "blocks": [
            {"kind": "cards", "head": "구성", "half": True, "fig": {"cards": [{"title": "가", "items": ["한 줄"]}, {"title": "나", "items": ["한 줄"]}]}},
            {"kind": "process", "head": "절차", "half": True, "fig": {"steps": [{"title": "하나", "items": ["한 줄"]}, {"title": "둘", "items": ["한 줄"]}, {"title": "셋", "items": ["한 줄"]}]}}]}
            for pg in redo]}
    return {"pages": [{"title": it["item"], "lead": ["도입."], "band": "띠", "blocks": [{"kind": "text", "head": "소제목", "bullets": ["글 한 줄"]}]}
                      for it in items]}


design._plan_call = fake
design.W["put_file"] = lambda *a, **k: None
design.W["log"] = lambda *a, **k: None


class Job:
    def __init__(self, d):
        self.dir, self.id, self.ev, self.pct, self.cancel = d, "t", [], [], False

    def event(self, m, kind="info"):
        self.ev.append(m)

    def push(self, stage=None, pct=None):
        self.pct.append(pct)


ch = {"no": "Ⅱ", "title": "기술부문(운영관리)", "sections": [
    {"title": f"절 {s + 1}", "items": [{"title": f"항목 {s + 1}-{i + 1}", "pages": 1} for i in range(n)]} for s, n in enumerate((9, 6, 6, 5, 5))]}   # 항목 31
o = {"project": {"name": "시험 사업", "client": "시험 기관"}}
jd = os.path.join(TMP, "job")
os.makedirs(jd)

runs = []
for run in (1, 2):
    CALLS.clear()
    job = Job(jd)
    job._vp = {"lock": threading.RLock(), "done": 0, "total": 31, "pages_total": 31}
    try:
        pages = V.chapter_pages(job, o, ch, "요약", "원문")
        err = None
    except Exception as e:   # noqa: BLE001
        pages, err = [], e
    runs.append((list(CALLS), job, pages, err))

calls, job, pages, err = runs[0]
check(err is None, f"1차 실행 오류 없음({err})")
fix = [c for c in calls if c["redo"] is not None]
first = [c for c in calls if c["redo"] is None]
mx = max([c["redo"] for c in fix] or [0])
check(bool(fix), f"고쳐 쓰기 요청이 있었다({len(fix)}개) — 일부러 규칙을 어긴 첫 쓰기")
check(mx <= 6, f"고쳐 쓰기 요청 하나의 '먼저 쓴 쪽' 최대 {mx}쪽(6쪽 이하여야)")
check(max([c["items"] for c in fix] or [0]) <= 4, f"고쳐 쓰기 요청 하나의 항목 최대 {max([c['items'] for c in fix] or [0])}개(4개 이하여야)")
check(len(pages) == 31, f"쪽 {len(pages)}개(31개여야 — 항목이 빠지지 않음)")
ev = " / ".join(job.ev)
check("장 전체" not in " ".join(c["what"] for c in fix), "장 전체를 다시 쓰는 요청이 없다")
check(any("사진 블록 넣음" in e or "엔진이 바로 고침" in e for e in job.ev), "사진 없음은 엔진이 바로 고쳤다(사진 블록)")
pc = [p for p in job.pct if p is not None]
check(pc and max(pc) <= 38 and any(34 < p <= 38 for p in pc), f"진행률 {pc[:3]}…{pc[-3:]} — 고쳐 쓰기에서 34~38%")
calls2, job2, pages2, err2 = runs[1]
check(err2 is None and len(calls2) == 0, f"다시 돌리면 AI 호출 {len(calls2)}번(0이어야 — 조각 보관)")

shutil.rmtree(TMP, ignore_errors=True)
print("\n전부 통과" if not FAILS else f"\n실패 {len(FAILS)}건")
sys.exit(1 if FAILS else 0)
