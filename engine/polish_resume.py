# -*- coding: utf-8 -*-
"""초안 다듬기(polish) — 진행 단계 따라 올리기 · 끊긴 뒤 이어 만들기(2026-10-28 사례: 7번 다시 시작, 화면은 내내 '준비 5%').

원인(숫자):
  ① 단계 이름 — 엔진·지시문·pd.py 는 '자산 교체', 화면(stages.ts)은 '에셋 교체'(커밋 ab754b3 '자산→에셋' 표기 바꿈). 엔진이 보낸 이름을 화면이 못 찾았다.
  ② 에이전트가 첫 줄만 `pd.py stage 준비 5` 로 보내고 나머지는 note 로만 적었다 — 엔진은 stage 줄만 단계로 읽어 '준비 5%' 에 멈췄다.
     실제로는 v0.6 재검수 판까지 만들고 있었다(137회 호출·$8.44). 화면이 멈춘 것을 보고 사용자가 4번째 실행(43회·$4.05)을 취소했다.
  ③ 다시 시작하면(엔진 배포 2번·연결 끊김) 원본 내려받기·장별 렌더(3분 30초)부터 다시, 진행 기록(progress.jsonl)을 처음부터 다시 읽어
     옛 메시지를 새 메시지처럼 또 올리고, 에이전트는 스킬 문서부터 다시 읽었다.
이 모듈:
  canon(단계)            — 별칭('자산 교체')을 화면 이름('에셋 교체')으로
  track(job)             — 작업 폴더의 판(_v0.N_<이름>.pptx)·result.json·메시지 낱말로 단계를 앞으로만 올리고, 에이전트 차례 수로 단계 안 진행률을 조금씩 올린다
  run_sig(job, j, keep)  — 이 실행의 조건 지문(원본 내용·단계·의견·요청·서체·모델)
  prepare(job, j, keep)  — 같은 조건이면 이어 하기(진행 기록 위치·단계 복원, 이어 하기 안내), 다른 조건이면 앞 판·기록을 _prev/ 로 치운다
  resume_block(info)     — 지시문에 붙일 '이어 하기' 안내"""
import glob, json, os, re, shutil, time

# 화면(apps/web/app/modules/deck/legacy/stages.ts STAGES)과 같은 이름·진행률
STAGES = ["준비", "실측", "디자인 시스템", "톤 통일", "이미지 분류", "에셋 교체", "도식 재구성", "마감", "자동 탐지", "재검수", "결과 정리"]
STAGE_PCT = [5, 10, 15, 25, 35, 45, 60, 70, 80, 88, 95, 100]
ALIAS = {"자산 교체": "에셋 교체", "자산교체": "에셋 교체", "에셋교체": "에셋 교체", "디자인시스템": "디자인 시스템", "톤통일": "톤 통일",
         "이미지분류": "이미지 분류", "도식재구성": "도식 재구성", "자동탐지": "자동 탐지", "결과정리": "결과 정리"}
STATE = "_polish.json"

# 판 이름·메시지의 낱말 → 단계(앞으로만 간다). 순서 = 뒤 단계부터 찾는다
KEYS = [("결과 정리", r"결과\s*정리|result\.json"), ("재검수", r"재검수|검수"), ("자동 탐지", r"탐지"), ("마감", r"마감|줄바꿈|줄 꺾임|고아"),
        ("도식 재구성", r"도식|재구성|다시 짜"), ("에셋 교체", r"자산|에셋|아이콘|일러스트|powerPlus|교체"), ("이미지 분류", r"분류|그림 목록|pic_sheet"),
        ("톤 통일", r"톤|서체 통일|색 통일|크기 통일"), ("디자인 시스템", r"디자인\s*시스템|결정\.md|잠긴 값"), ("실측", r"실측")]


def canon(stage):
    s = str(stage or "").strip()
    return ALIAS.get(s, ALIAS.get(s.replace(" ", ""), s))


def stage_of_text(t):
    for st, rx in KEYS:
        if re.search(rx, t or "", re.I):
            return st
    return None


def _idx(st):
    st = canon(st)
    return STAGES.index(st) if st in STAGES else -1


def advance(job, st, pct=None, why=""):
    """단계를 앞으로만. 진행률은 그 단계 범위 안에서"""
    i = _idx(st)
    if i < 0 or i < _idx(job.stage):
        return False
    moved = i > _idx(job.stage)
    job.stage = STAGES[i]
    lo, hi = STAGE_PCT[i], STAGE_PCT[i + 1] - 1
    job.pct = max(lo, min(hi, max(job.pct, int(pct) if pct is not None else lo)))
    if moved and why:
        job.event(f"{STAGES[i]} 단계 — {why}")
    return moved


def track(job):
    """다듬기 실행 중 5초마다 — 증거(판 파일·결과 파일)로 단계를 올리고, 에이전트 차례 수로 단계 안 진행률을 조금씩"""
    if list(getattr(job, "stages", STAGES)) != STAGES:   # 다듬기 단계표일 때만
        return
    best = None
    for p in glob.glob(os.path.join(job.dir, "_v*.pptx")):
        m = re.match(r"_v[\d.]+_(.+)\.pptx$", os.path.basename(p))
        st = stage_of_text(m.group(1)) if m else None
        if st and (best is None or _idx(st) > _idx(best)):
            best = st
    if os.path.isfile(os.path.join(job.dir, "result.json")):
        best = "결과 정리"
    if best and _idx(best) > _idx(job.stage):
        advance(job, best, why="작업 폴더의 판으로 확인")
    turns = int(getattr(job, "agent_turns", 0) or 0)
    i = _idx(job.stage)
    if i >= 0:   # 같은 단계에 오래 있으면 3차례마다 1%씩(다음 단계 바로 밑까지만) — 멈춘 것처럼 보이지 않게
        seen = getattr(job, "_turns_at_stage", None)
        if seen is None or seen[0] != job.stage:
            job._turns_at_stage = (job.stage, turns)
        else:
            job.pct = max(job.pct, min(STAGE_PCT[i + 1] - 1, STAGE_PCT[i] + (turns - seen[1]) // 3))


def on_message(job, d):
    """진행 기록 한 줄(pd.py) — stage 가 없거나 모르는 이름이어도 메시지 낱말로 단계를 올린다(최대 두 단계 앞까지)"""
    st = canon(d.get("stage")) if d.get("stage") else None
    if st in STAGES:
        return advance(job, st, d.get("progress"))
    guess = stage_of_text(d.get("message") or "")
    if guess and 0 <= _idx(guess) - _idx(job.stage) <= 2:
        return advance(job, guess)
    return False


# ───────────────────────── 이어 만들기
def run_sig(job, j, keep, extra=None):
    import resume
    cond = {"phase": j.get("phase") or "full", "pilot": j.get("pilot_slide") or 0, "feedback": (j.get("feedback") or "").strip(),
            "note": (j.get("note") or "").strip(), "opts": j.get("opts") if isinstance(j.get("opts"), (dict, str)) else "", "extra": extra or {}}
    return resume.sig_of(cond, [keep] if keep and os.path.isfile(keep) else [])


def load(job):
    try:
        return json.load(open(os.path.join(job.dir, STATE), encoding="utf-8"))
    except Exception:
        return {}


def save(job, **kw):
    st = load(job)
    st.update(kw, at=time.strftime("%Y-%m-%d %H:%M:%S"))
    tmp = os.path.join(job.dir, STATE + ".tmp")
    json.dump(st, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    os.replace(tmp, os.path.join(job.dir, STATE))
    return st


def drafts(job):
    return sorted(glob.glob(os.path.join(job.dir, "_v*.pptx")), key=os.path.getmtime)


def archive(job, why):
    """다른 조건의 앞 판·기록을 _prev/<시각>/ 로 — 새 실행이 옛 판을 '지금까지 만든 판' 으로 올리거나 이어 쓰지 않게"""
    moved = []
    dst = os.path.join(job.dir, "_prev", time.strftime("%Y%m%d-%H%M%S"))
    for p in drafts(job) + [os.path.join(job.dir, n) for n in ("result.json", "progress.jsonl", "_이어하기.md")] + [os.path.join(job.dir, "_render")]:
        if os.path.exists(p):
            os.makedirs(dst, exist_ok=True)
            shutil.move(p, os.path.join(dst, os.path.basename(p)))
            moved.append(os.path.basename(p))
    if moved:
        job.event(f"앞 실행({why})의 판·기록 {len(moved)}개를 _prev 로 치웠습니다 — 이번 조건으로 새로 만듭니다.")
    return moved


def replay_silent(job):
    """진행 기록을 다시 읽되 화면에 다시 올리지 않는다 — 단계·진행률만 복원하고 읽은 위치를 끝으로"""
    if not os.path.isfile(job.prog_file):
        return 0
    n = 0
    with open(job.prog_file, encoding="utf-8") as f:
        for ln in f:
            try:
                d = json.loads(ln)
            except Exception:
                continue
            on_message(job, d)
            n += 1
        job.prog_pos = f.tell()
    return n


def prepare(job, j, keep, extra=None):
    """반환 {'resume': bool, 'latest': 판 이름|None, 'notes': [최근 메시지], 'memo': _이어하기.md 내용, 'attempt': n}"""
    sig = run_sig(job, j, keep, extra)
    st = load(job)
    info = {"resume": False, "latest": None, "notes": [], "memo": "", "attempt": 1, "sig": sig}
    if st.get("sig") == sig and not st.get("done"):
        info["attempt"] = int(st.get("attempt") or 1) + 1
        notes = []
        if os.path.isfile(job.prog_file):
            for ln in open(job.prog_file, encoding="utf-8"):
                try:
                    d = json.loads(ln)
                except Exception:
                    continue
                if d.get("message"):
                    notes.append(("[" + d["stage"] + "] " if d.get("stage") else "") + str(d["message"])[:160])
        info["notes"] = notes[-15:]
        ds = drafts(job)
        info["latest"] = os.path.basename(ds[-1]) if ds else None
        mp = os.path.join(job.dir, "_이어하기.md")
        info["memo"] = open(mp, encoding="utf-8").read()[:3000] if os.path.isfile(mp) else ""
        info["resume"] = bool(info["latest"] or info["notes"])
        n = replay_silent(job)
        if info["resume"]:
            job.event(f"앞 실행이 끊긴 곳부터 이어서 합니다(시도 {info['attempt']}번째) — 마지막 판 {info['latest'] or '없음'} · 단계 {job.stage}. 지난 진행 기록 {n}줄은 다시 올리지 않습니다.")
            if getattr(job, "draft_sent", None) is None and st.get("draft_sent"):
                job.draft_sent = tuple(st["draft_sent"])
    else:
        if st.get("sig") or drafts(job) or os.path.isfile(job.prog_file):
            archive(job, "다른 조건" if st.get("sig") else "기록 없음")
        job.prog_pos = 0
    save(job, sig=sig, attempt=info["attempt"], done=False)
    return info


def finish(job):
    try:
        save(job, done=True)
    except Exception:
        pass


def resume_block(info):
    if not info.get("resume"):
        return ""
    out = ["", "## 이어 하기 — 앞 실행이 엔진 재시작·연결 끊김으로 멈췄다(같은 조건). 처음부터 다시 하지 않는다",
           f"- 마지막으로 저장한 판: `{info.get('latest') or '(없음 — 원본.pptx 에서)'}` — 이 판을 열어 이어서 고친다. 새 판 번호는 그다음부터.",
           "- 스킬 문서(SKILL.md·quality-bar·autopilot·process)를 처음부터 다시 읽지 않는다 — 필요한 절만 `grep -n` 으로 찾아 그 부분만 연다.",
           "- 실측·디자인 시스템을 다시 하지 않는다. `_이어하기.md`·`_pilot/결정.md`·`디자인시스템.md` 에 적힌 값을 그대로 쓴다.",
           "- 원본 렌더(`_before/`)·앞 실행 렌더(`_render/`)·자산(`_assets/`)은 그대로 있다 — 같은 판을 다시 렌더하지 않는다.",
           "- 첫 진행 보고는 지금 단계로: 아래 기록의 마지막 단계에서 시작한다."]
    if info.get("memo"):
        out += ["", "### 앞 실행이 남긴 _이어하기.md", "```", info["memo"].strip(), "```"]
    if info.get("notes"):
        out += ["", "### 앞 실행의 진행 기록(마지막 15줄)"] + [f"- {x}" for x in info["notes"]]
    return "\n".join(out) + "\n"
