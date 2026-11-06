# -*- coding: utf-8 -*-
"""엔진 작업 흐름(2026-11-01 전체 검수 H2·L5·H5, R152·R161·R168) — 가짜 서버로. 실제 AI·운영 서버 없음.
 ① 글 고치기 실패 → finish 에 failed:true, 성공 → failed:false(음성 대조)
 ② 글꼴 준비 예외가 나도 실패로 보고하고 하트비트가 멈춘다(영원히 '진행 중'이 안 된다)
 ③ 마지막 진행 보고가 터져도 실패 보고는 나간다
 ④ 제출용·회사소개용은 pptx 로 시작해도 무거운 작업(서버 claim 과 같은 판정)

  python -X utf8 engine/tests/test_deck_flow.py
  PD_ENGINE_DIR=<고치기 전 engine 사본> python …     음성 대조 — 고치기 전 코드는 실패해야 한다"""
import glob, json, os, re, shutil, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(os.environ.get("PD_ENGINE_DIR") or os.path.dirname(HERE))
TMP = tempfile.mkdtemp(prefix="deckflow-")
ENG = os.path.join(TMP, "engine")
os.makedirs(ENG)
for pat in ("*.py", "*.json", "*.md"):
    for f in glob.glob(os.path.join(SRC, pat)):
        shutil.copy2(f, ENG)
os.makedirs(os.path.join(ENG, "fonts"))
for f in glob.glob(os.path.join(SRC, "fonts", "*.json")):
    shutil.copy2(f, os.path.join(ENG, "fonts"))
json.dump({"api_base": "http://127.0.0.1:9/api/v1/deck", "worker_key": "test", "name": "test", "jobs_dir": os.path.join(TMP, "jobs"), "ai": "openrouter"},
          open(os.path.join(ENG, "config.json"), "w", encoding="utf-8"))
sys.path.insert(0, ENG)
os.chdir(TMP)

import worker as WK  # noqa: E402

FAILS = []


def check(ok, msg):
    print(("통과 " if ok else "실패 ") + msg)
    if not ok:
        FAILS.append(msg)


class Server:
    def __init__(self):
        self.calls, self.finish = [], []

    def req(self, method, path, body=None, raw=None, timeout=60):
        self.calls.append(path)
        if path.endswith("/finish"):
            self.finish.append(body)
        return {}


def job_row(**over):
    return dict({"id": "abcdef0123456789", "kind": "design", "phase": "edit", "status": "running", "opts": "{}", "plan": None, "title": "t", "note": "", "result_file": "결과.pptx", "review": json.dumps({"edits": []})}, **over)


# ① 글 고치기
sv = Server()
WK.req = sv.req
def no_download(path, dest):
    raise OSError("받기 실패")
WK.download = no_download
WK.run_edit(WK.Job(job_row()), job_row())
f = sv.finish[-1] if sv.finish else {}
check(f.get("failed") is True and f.get("status") == "done" and "실패" in str(f.get("message")), f"① 실패 → failed:true ({f.get('failed')})")

sv = Server()
WK.req = sv.req
def ok_download(path, dest):
    open(dest, "wb").write(b"x" * 20)
WK.download = ok_download
WK.text_map = lambda *a, **k: None
WK.run_edit(WK.Job(job_row()), job_row())
f = sv.finish[-1] if sv.finish else {}
check(not f.get("failed") and "읽었습니다" in str(f.get("message")), f"① 음성 대조 — 성공이면 실패 표시 없음 ({f.get('failed')})")

# ② 글꼴 준비 예외
sv = Server()
WK.req = sv.req
_fe = WK.font_env
def bad_font(j):
    raise ValueError("글꼴 표를 못 읽음")
WK.font_env = bad_font
stops = []
_hb = WK.heartbeat
def spy_hb(job, every=60):
    stop = _hb(job, every)
    def wrapped():
        stops.append(1)
        stop()
    return wrapped
WK.heartbeat = spy_hb
err = None
try:
    WK.process(job_row(phase="plan"))
except Exception as e:   # noqa: BLE001 — 고치기 전 코드는 여기로 샌다
    err = e
check(err is None, f"② 예외가 작업 스레드 밖으로 안 샌다 ({err})")
check(any(x.get("status") == "failed" and "글꼴" in str(x.get("error")) for x in sv.finish), "② 실패로 보고")
check(stops == [1], "② 하트비트가 멈춘다 — 안 멈추면 서버에 '진행 중'이 영원히 이어진다")
WK.font_env = _fe
WK.heartbeat = _hb

# ③ 마지막 진행 보고가 터져도 실패 보고
sv = Server()
WK.req = sv.req
_rp = WK.Job.read_progress
def bad_rp(self):
    raise ValueError("진행 글 깨짐")
WK.Job.read_progress = bad_rp
def boom_plan(job, j):
    raise RuntimeError("기획 실패")
_pp = WK.design.run_plan_phase
WK.design.run_plan_phase = boom_plan
err = None
try:
    WK.process(job_row(phase="plan"))
except Exception as e:   # noqa: BLE001
    err = e
check(err is None and any(x.get("status") == "failed" and "기획 실패" in str(x.get("error")) for x in sv.finish), f"③ 실패 보고가 나간다 ({err})")
WK.Job.read_progress = _rp
WK.design.run_plan_phase = _pp

# ④ 무거운 작업 판정 — main() 안의 지역 함수라 글로 대조한다. 서버 claim 도 같은 판정
src = open(os.path.join(ENG, "worker.py"), encoding="utf-8").read()
m = re.search(r'def is_heavy\(j\):.*?str\(o\.get\("purpose"\) or ""\) in \("submit", "company"\)([^\n]*)', src, re.S)
check(bool(m) and "!= \"pptx\"" not in m.group(1), "④ 제출용·회사소개용은 pptx 예외 없이 무거운 작업")

shutil.rmtree(TMP, ignore_errors=True)
print(f"\n실패 {len(FAILS)}건" if FAILS else "\n전부 통과")
sys.exit(1 if FAILS else 0)
