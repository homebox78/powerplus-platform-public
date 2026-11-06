# -*- coding: utf-8 -*-
"""초안 다듬기(polish) 진행·이어 만들기·과금 시험 — 2026-10-28 사례(7번 다시 시작 · 화면 내내 '준비 5%' · $8.44 + 겹쳐 센 $2.12).
  ① 단계 이름이 화면(stages.ts STAGES)과 같다 — 엔진 STAGES·pd.py·지시문. pd.py 에 옛 이름 '자산 교체'를 줘도 '에셋 교체'로 적는다
  ② 에이전트가 note 만 적고 판(_v0.3_자산교체·_v0.6_재검수)만 저장해도 서버로 가는 단계가 '준비' 를 넘어 오른다(화면 이름으로)
  ③ 끊긴 뒤 다시 시작하면 이어 받는다: 원본 내려받기·원본 렌더·서체 맞춤을 다시 하지 않고, 지시문에 '이어 하기'(마지막 판)가 들어가고,
     지난 진행 기록을 새 메시지로 다시 올리지 않는다
  ④ 에이전트가 끝낸 뒤(마무리·올리기에서) 끊기면 다시 돌릴 때 에이전트를 부르지 않는다 · 끝까지 성공한 뒤 다시 돌리면 새로 만든다(앞 판은 _prev 로)
  ⑤ openrouter 경로의 끝 보고(engine)는 비용 0 — 서버가 호출마다 이미 기록했다(두 번 세지 않기)
  ⑥ 문맥 줄이기 — 직전 입력이 기준을 넘으면 오래된 도구 결과·그림·긴 명령을 줄이고 마지막 메시지는 그대로
  ⑦ 엔진이 켜질 때 서버에 '다시 켜짐' 을 알린다(/worker/restarted — 15분 기다리지 않고 바로 이어 하기)

  python -X utf8 engine/tests/test_polish_resume.py         (전부 통과면 0)
  PD_ENGINE_DIR=<고치기 전 engine 사본> python …           음성 대조 — 고치기 전 코드는 ①~⑦ 이 실패해야 한다
가짜 서버(req)·가짜 에이전트(launch_engine)만 쓴다. 실제 AI·운영 서버·LibreOffice 없음."""
import glob, io, json, os, re, shutil, sys, tempfile, threading, time, types

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(os.environ.get("PD_ENGINE_DIR") or os.path.dirname(HERE))
REPO = os.path.dirname(os.path.dirname(HERE))
TMP = tempfile.mkdtemp(prefix="polres-")
ENG = os.path.join(TMP, "engine")
os.makedirs(ENG)
for pat in ("*.py", "*.json", "*.md"):
    for f in glob.glob(os.path.join(SRC, pat)):
        shutil.copy2(f, ENG)
os.makedirs(os.path.join(ENG, "fonts"))
for f in glob.glob(os.path.join(SRC, "fonts", "*.json")) or glob.glob(os.path.join(os.path.dirname(HERE), "fonts", "*.json")):
    shutil.copy2(f, os.path.join(ENG, "fonts"))
for d in ("templates", "skill", "pipeline"):
    if os.path.isdir(os.path.join(SRC, d)) and d == "templates":
        shutil.copytree(os.path.join(SRC, d), os.path.join(ENG, d))
JOBS = os.path.join(TMP, "jobs")
json.dump({"api_base": "http://127.0.0.1:9/api/v1/deck", "worker_key": "test", "name": "test", "jobs_dir": JOBS, "ai": "openrouter",
           "build_parallel": 0, "max_minutes": 2, "polish_icon_set": False}, open(os.path.join(ENG, "config.json"), "w", encoding="utf-8"))
sys.path.insert(0, ENG)
os.chdir(TMP)

import worker as WK  # noqa: E402
import or_agent as OA  # noqa: E402
from pptx import Presentation  # noqa: E402
from pptx.util import Inches, Pt  # noqa: E402

WEB_STAGES = re.findall(r'\{ name: "([^"]+)"', open(os.path.join(REPO, "apps", "web", "app", "modules", "deck", "legacy", "stages.ts"), encoding="utf-8").read()
                        .split("const STAGE_PCT")[0])


class Server:
    def __init__(self):
        self.events, self.stages, self.finish, self.downloads, self.calls = [], [], [], 0, []

    def req(self, method, path, body=None, raw=None, timeout=60):
        self.calls.append(path)
        if path.endswith("/progress"):
            self.stages.append((body or {}).get("stage"))
            self.events += [e.get("message") for e in (body or {}).get("events") or []]
        if path.endswith("/finish"):
            self.finish.append(body)
        return {}

    def download(self, path, dest):
        if path.endswith("/source"):
            self.downloads += 1
            make_deck(dest)
            return
        raise RuntimeError("404")


def make_deck(path):
    prs = Presentation()
    for i in range(2):
        s = prs.slides.add_slide(prs.slide_layouts[6])
        tb = s.shapes.add_textbox(Inches(1), Inches(1), Inches(6), Inches(1))
        r = tb.text_frame.paragraphs[0].add_run()
        r.text = f"{i + 1}쪽 본문 글 — 공공 마이데이터"
        r.font.size = Pt(14)
        r.font.name = "KoPub돋움체 Bold"
    prs.save(path)
    return path


RENDERS = []


def fake_render(pptx, outdir, picks=None):
    RENDERS.append(pptx)
    os.makedirs(outdir, exist_ok=True)
    from PIL import Image
    out = []
    for n in (1, 2):
        p = os.path.join(outdir, f"s{n:02d}.jpg")
        Image.new("RGB", (32, 24), "white").save(p)
        out.append((n, p))
    return out


def fake_agent(behave, prompts):
    """behave(job) 가 작업 폴더에 판·기록을 쓴다. 'kill' 을 돌려주면 result.json 없이 끝난다(끊긴 것과 같다)"""
    def launch(job, prompt, cwd=None, prog_file=None, quiet=False):
        prompts.append(prompt)
        proc = OA.AgentProc()
        final = {"turns": 0, "cost": 1.234}

        def go():
            behave(job)
            final["turns"] = 5
            proc._rc = 0
        t = threading.Thread(target=go, daemon=True)
        t.start()
        return proc, final, t
    return launch


def pd_line(job, **d):
    with open(job.prog_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(dict(d, ts=time.time()), ensure_ascii=False) + "\n")


def setup(sv, prompts, behave, fail_upload=None):
    WK.req, WK.download, WK.put_file = sv.req, sv.download, (lambda *a, **k: {})
    WK.render = fake_render
    WK.launch_engine = fake_agent(behave, prompts)
    WK.text_map = lambda *a, **k: None

    def up(job, out, only=None):
        if fail_upload and fail_upload[0]:
            fail_upload[0] = False
            raise RuntimeError("결과 렌더 실패(가짜)")
    WK.upload_after = up
    import design as D
    D.W.update({"req": sv.req, "put_file": lambda *a, **k: {}, "download": sv.download, "log": lambda *a: None})
    D.lessons_text = lambda j: ""
    # run_claude 의 5초 대기를 짧게
    WK.time = types.SimpleNamespace(**{k: getattr(time, k) for k in dir(time) if not k.startswith("_")})
    WK.time.sleep = lambda s: time.sleep(min(s, 0.3))


def job_of(jid, size):
    return {"id": jid, "kind": "polish", "phase": "full", "status": "running", "title": "T", "note": "사업개요는 비주얼을", "size": size, "opts": "{}"}


def _size():
    p = os.path.join(TMP, "probe.pptx")
    make_deck(p)
    return os.path.getsize(p)


# ───────── ①
def test_stage_names_match_web():
    assert WEB_STAGES[:11] == ["준비", "실측", "디자인 시스템", "톤 통일", "이미지 분류", "에셋 교체", "도식 재구성", "마감", "자동 탐지", "재검수", "결과 정리"], WEB_STAGES[:11]
    assert WK.STAGES == WEB_STAGES[:11], f"엔진 STAGES 가 화면과 다르다: {set(WK.STAGES) ^ set(WEB_STAGES[:11])}"
    for f in ("prompt_polish_linux.md", "prompt.md"):
        t = open(os.path.join(ENG, f), encoding="utf-8").read()
        assert "`에셋 교체`" in t and "`자산 교체`" not in t, f"{f} 의 단계 이름이 화면과 다르다"
    pf = os.path.join(TMP, "pd_test.jsonl")
    import subprocess
    r = subprocess.run([sys.executable, os.path.join(ENG, "pd.py"), "stage", "자산 교체", "45", "x"], env=dict(os.environ, PD_PROGRESS=pf),
                       capture_output=True, text=True, encoding="utf-8")
    assert r.returncode == 0, f"pd.py 가 '자산 교체' 를 거절: {r.stdout}{r.stderr}"
    assert json.loads(open(pf, encoding="utf-8").read().splitlines()[-1])["stage"] == "에셋 교체", "pd.py 가 화면 이름으로 적지 않음"


# ───────── ②
def test_stage_follows_work_without_stage_lines():
    sv, prompts = Server(), []

    def behave(job):
        pd_line(job, stage="준비", progress=5, message="원본 보관 확인, 스킬 문서 읽기 시작")
        time.sleep(0.4)
        pd_line(job, message="21장 실측 — 시안 장은 3쪽")
        pd_line(job, message="3쪽 체크 아이콘 6개 → powerPlus 3D 아이콘 6개")
        make_deck(os.path.join(job.dir, "_v0.3_자산교체.pptx"))
        time.sleep(0.8)
        make_deck(os.path.join(job.dir, "_v0.6_재검수.pptx"))
        time.sleep(0.8)
        out = os.path.join(job.dir, "_v0.6_재검수.pptx")
        json.dump({"result": os.path.basename(out), "summary": "s", "checklist": [], "assets_used": [{"slide": 1, "id": "icon_1"}]},
                  open(os.path.join(job.dir, "result.json"), "w", encoding="utf-8"))
    setup(sv, prompts, behave)
    WK.process(job_of("a1aaaaaaaaaaaaaa", _size()))
    seen = [s for s in sv.stages if s]
    bad = sorted({s for s in seen if s not in WEB_STAGES})
    assert not bad, f"화면이 모르는 단계 이름을 보냈다: {bad}"
    mid = [s for s in seen[:-1] if s not in ("준비", "결과 정리")]
    assert "재검수" in seen or "에셋 교체" in mid, f"note·판만 있는 동안 단계가 '준비' 에 멈췄다: {sorted(set(seen))}"
    assert sv.finish and sv.finish[-1]["status"] == "done", f"끝 보고: {sv.finish[-1] if sv.finish else None}"


# ───────── ③ ④
def test_resume_after_kill_and_after_agent():
    sv, prompts = Server(), []
    jid = "b2bbbbbbbbbbbbbb"
    step = {"n": 0}

    def behave(job):
        step["n"] += 1
        if step["n"] == 1:   # 첫 실행 — 판 두 개를 만들고 끊김(result.json 없음)
            pd_line(job, stage="실측", progress=10, message="첫 실행 실측 끝")
            make_deck(os.path.join(job.dir, "_v0.2_톤통일.pptx"))
            open(os.path.join(job.dir, "_이어하기.md"), "w", encoding="utf-8").write("단계: 톤 통일 · 마지막 판 _v0.2_톤통일.pptx")
            return
        pd_line(job, stage="재검수", progress=88, message="둘째 실행 재검수")
        make_deck(os.path.join(job.dir, "_v0.5_재검수.pptx"))
        json.dump({"result": "_v0.5_재검수.pptx", "summary": "s", "checklist": [], "assets_used": [{"slide": 1, "id": "icon_1"}]},
                  open(os.path.join(job.dir, "result.json"), "w", encoding="utf-8"))
    setup(sv, prompts, behave, fail_upload=[False])
    j = job_of(jid, _size())
    RENDERS.clear()
    WK.process(j)
    assert sv.finish[-1]["status"] == "failed", "첫 실행은 끊긴(result.json 없음) 것이어야 함"
    d0, r0, ev0 = sv.downloads, len(RENDERS), len(sv.events)
    fail = [True]
    setup(sv, prompts, behave, fail_upload=fail)   # 둘째 실행: 에이전트는 끝내지만 결과 렌더에서 실패
    WK.process(j)
    assert sv.downloads == d0, f"다시 시작했더니 원본을 또 내려받았다({sv.downloads - d0}번)"
    before_renders = [p for p in RENDERS[r0:] if p.endswith("_원본보관.pptx") or p.endswith("원본.pptx")]
    assert not before_renders, f"다시 시작했더니 원본 장별 렌더를 또 했다: {before_renders}"
    assert "## 이어 하기 —" in prompts[-1] and "_v0.2_톤통일.pptx" in prompts[-1], "둘째 지시문에 '이어 하기'·마지막 판이 없다"
    assert "단계: 톤 통일" in prompts[-1], "둘째 지시문에 _이어하기.md 메모가 없다"
    again = [m for m in sv.events[ev0:] if m == "첫 실행 실측 끝"]
    assert not again, "지난 진행 기록을 새 메시지로 다시 올렸다"
    assert sv.finish[-1]["status"] == "failed", "둘째 실행은 결과 렌더 실패여야 함"
    n_prompts = len(prompts)
    setup(sv, prompts, behave, fail_upload=[False])   # 셋째: 에이전트 결과가 있으니 부르지 않고 마무리부터
    WK.process(j)
    assert len(prompts) == n_prompts, f"에이전트가 끝낸 뒤 끊긴 작업을 다시 돌렸더니 에이전트를 또 불렀다({len(prompts) - n_prompts}번)"
    assert sv.finish[-1]["status"] == "done", f"셋째 실행: {sv.finish[-1].get('status')} {str(sv.finish[-1].get('error'))[:200]}"
    eng = sv.finish[-1].get("engine") or {}
    assert not eng.get("cost"), f"이어 쓴 실행이 비용을 보고했다: {eng}"
    step["n"] = 1   # 넷째: 끝까지 성공한 작업을 다시 돌림 = 새로 만들어 달라는 뜻
    WK.process(j)
    assert len(prompts) == n_prompts + 1, "성공 뒤 다시 돌리기는 에이전트를 새로 불러야 함"
    assert "## 이어 하기 —" not in prompts[-1], "성공 뒤 다시 돌리기가 앞 판을 이어 받았다"
    assert glob.glob(os.path.join(JOBS, jid, "_prev", "*", "_v0.5_재검수.pptx")), "앞 실행 판을 _prev 로 치우지 않았다"


# ───────── ⑤
def test_engine_cost_not_double_counted():
    sv, prompts = Server(), []

    def behave(job):
        make_deck(os.path.join(job.dir, "_v0.9_재검수.pptx"))
        json.dump({"result": "_v0.9_재검수.pptx", "summary": "s", "checklist": [], "assets_used": [{"slide": 1, "id": "icon_1"}]},
                  open(os.path.join(job.dir, "result.json"), "w", encoding="utf-8"))
    setup(sv, prompts, behave)
    WK.process(job_of("c3cccccccccccccc", _size()))
    eng = sv.finish[-1].get("engine") or {}
    assert sv.finish[-1]["status"] == "done", sv.finish[-1]
    assert float(eng.get("cost") or 0) == 0.0, f"openrouter 경로가 끝에 비용 {eng.get('cost')} 을 또 보고 — 서버가 호출마다 이미 기록했다"


# ───────── ⑥
def test_compact_context():
    assert hasattr(OA, "compact"), "문맥 줄이기(compact)가 없다"
    msgs = [{"role": "system", "content": "s"}, {"role": "user", "content": "지시" * 10}]
    for i in range(30):
        msgs.append({"role": "assistant", "content": "", "tool_calls": [{"id": f"t{i}", "function": {"name": "Bash", "arguments": json.dumps({"command": "cat > a.py <<E\n" + "x = 1\n" * 400})}}]})
        msgs.append({"role": "tool", "tool_call_id": f"t{i}", "content": "결과 " * 2000})
    msgs.append({"role": "user", "content": [{"type": "text", "text": "그림"}, {"type": "image_url", "image_url": {"url": "data:x"}}]})
    mid0 = len(json.dumps(msgs[2:-16], ensure_ascii=False))
    tail0 = json.dumps(msgs[-16:], ensure_ascii=False)
    k = OA.compact(msgs)
    mid1 = len(json.dumps(msgs[2:-16], ensure_ascii=False))
    assert k > 0 and mid1 < mid0 * 0.15, f"오래된 부분이 충분히 줄지 않음: {mid0} → {mid1}"
    assert json.dumps(msgs[-16:], ensure_ascii=False) == tail0, "마지막 메시지까지 줄였다"
    assert msgs[1]["content"] == "지시" * 10, "지시문을 줄였다"
    for m in msgs:
        for tc in m.get("tool_calls") or []:
            json.loads(tc["function"]["arguments"])   # 줄인 뒤에도 JSON 이어야 한다


# ───────── ⑦
def test_worker_announces_restart():
    src = open(os.path.join(ENG, "worker.py"), encoding="utf-8").read()
    assert '"/worker/restarted"' in src, "엔진이 켜질 때 서버에 다시 켜짐을 알리지 않는다"
    php = open(os.path.join(REPO, "api", "src", "Deck", "Jobs.php"), encoding="utf-8").read()
    assert "function workerRestarted" in php and "/deck/worker/restarted" in open(os.path.join(REPO, "api", "routes", "deck.php"), encoding="utf-8").read(), "서버에 재시작 받는 곳이 없다"


def main():
    tests = [(k, v) for k, v in globals().items() if k.startswith("test_") and callable(v)]
    bad = 0
    for k, fn in tests:
        try:
            fn()
            print(f"통과  {k}")
        except Exception as e:      # noqa: BLE001
            bad += 1
            print(f"실패  {k}: {type(e).__name__}: {e}")
    print(f"{len(tests) - bad}/{len(tests)} 통과  (엔진 코드: {SRC})")
    return 1 if bad else 0


if __name__ == "__main__":
    rc = main()
    os.chdir(HERE)
    shutil.rmtree(TMP, ignore_errors=True)
    sys.exit(rc)
