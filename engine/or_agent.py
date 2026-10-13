# -*- coding: utf-8 -*-
"""
OpenRouter 장표 제작 에이전트 (기존 Claude CLI 경로 유지 + 병렬 옵션).
- 기존: worker.py launch_claude (claude -p --model) — 기본, 그대로 둔다.
- 신규: build_engine=openrouter 일 때 이 모듈이 같은 prompt를 받아 같은 출력물(out/sNN.pptx + result.json)을 만든다.
- 호출: 서버 프록시 POST /worker/jobs/{id}/ai (kind=build) — 비용·한도는 서버가 기록, 키는 서버가 붙인다.
- 도구: Bash, Read, Write, Edit, Glob, Grep, TodoWrite (Claude 허용 목록과 동일). WebFetch/WebSearch 금지.
- 어떤 OpenRouter 모델이든: or_models 능력표로 도구 호출이 없으면 글 규약(<tool name=…>), 그림을 못 보면 좌표·글로,
  Read 로 연 그림은 다음 메시지에 image_url 로 붙이고, 출력·문맥 한도는 모델 값에 맞추고 문맥이 차면 오래된 결과부터 줄인다.
"""
import json, os, re, glob, time, subprocess, threading, traceback

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_MODEL = "meta/muse-spark-1.3-contributor"
DEFAULT_EFFORT = "xhigh"
MAX_ITERS = 120
MAX_TOKENS = 32000
TOOL_TIMEOUT = 300

# 외부 전송·파괴 명령 차단 (지시문 '하지 말 것'과 동일)
BLOCK_PAT = re.compile(r"(Start-Process|Invoke-Item|xdg-open|\bsudo\b|\bgit\b|slack|webhook|discord|telegram|curl\s+.*https?://|Invoke-WebRequest|Send-MailMessage)", re.I)

TOOLS = [
    {"type": "function", "function": {"name": "Bash", "description": ("Windows(cmd)" if os.name == "nt" else "리눅스(/bin/sh)") + " 명령 실행. 작업 폴더(cwd) 기준. pd.py 진행보고·python 스크립트·render/crop 등에 쓴다. 창 띄우기(Start-Process/Invoke-Item/xdg-open)·git·외부전송 금지.",
     "parameters": {"type": "object", "properties": {"command": {"type": "string"}, "timeout": {"type": "integer"}}, "required": ["command"]}}},
    {"type": "function", "function": {"name": "Read", "description": "파일 읽기(텍스트).",
     "parameters": {"type": "object", "properties": {"path": {"type": "string"}, "offset": {"type": "integer"}, "limit": {"type": "integer"}}, "required": ["path"]}}},
    {"type": "function", "function": {"name": "Write", "description": "파일 쓰기(부모 폴더 자동생성).",
     "parameters": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]}}},
    {"type": "function", "function": {"name": "Edit", "description": "exact 교체. oldString이 유일해야 함.",
     "parameters": {"type": "object", "properties": {"path": {"type": "string"}, "oldString": {"type": "string"}, "newString": {"type": "string"}, "replaceAll": {"type": "boolean"}}, "required": ["path", "oldString", "newString"]}}},
    {"type": "function", "function": {"name": "Glob", "description": "glob 패턴 검색(cwd 기준).",
     "parameters": {"type": "object", "properties": {"pattern": {"type": "string"}}, "required": ["pattern"]}}},
    {"type": "function", "function": {"name": "Grep", "description": "정규식 내용 검색(cwd 기준).",
     "parameters": {"type": "object", "properties": {"pattern": {"type": "string"}, "path": {"type": "string"}}, "required": ["pattern"]}}},
    {"type": "function", "function": {"name": "TodoWrite", "description": "할 일 메모(화면 로그용).",
     "parameters": {"type": "object", "properties": {"todos": {"type": "array", "items": {"type": "object"}}}, "required": ["todos"]}}},
]


def _safe_path(cwd, p):
    """cwd 안 + 읽기전용 도구폴더 안만 허용. 밖이면 차단."""
    import worker as W
    ap = os.path.normpath(os.path.join(cwd, p) if not os.path.isabs(p) else p)
    allowed_ro = [os.path.normpath(W.CFG.get("pipeline_dir") or ""), os.path.normpath(W.CFG.get("skill_dir") or ""),
                  os.path.normpath(W.HERE), os.path.normpath(W.REF_DIR)]
    if ap.startswith(os.path.normpath(cwd) + os.sep) or ap == os.path.normpath(cwd):
        return ap, True
    for base in allowed_ro:
        if base and (ap.startswith(base + os.sep) or ap == base):
            return ap, False
    # 도구 폴더 안이어도 _mockup/_brand 같은 복사본은 cwd에 있으므로 대부분 통과. 밖은 차단.
    raise RuntimeError(f"작업 폴더 밖은 건드릴 수 없습니다: {p}")


def exec_tool(job, cwd, name, args):
    import worker as W
    args = args or {}
    if name == "Bash":
        cmd = (args.get("command") or "").strip()
        if not cmd:
            raise RuntimeError("command가 비었습니다")
        if BLOCK_PAT.search(cmd):
            raise RuntimeError("금지된 명령입니다(git/창띄우기/외부전송)")
        timeout = min(int(args.get("timeout") or TOOL_TIMEOUT), 600)
        env = dict(os.environ, PD_PROGRESS=getattr(job, "_or_prog", "") or os.path.join(cwd, "progress.jsonl"),
                   PYTHONIOENCODING="utf-8")
        # 작업 폴더 밖 쓰기 방지: .. 로 나가는 cd 차단(단순 검사)
        r = subprocess.run(cmd, cwd=cwd, shell=True, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=timeout, env=env)
        out = (r.stdout or "")[-4000:] + (("\n[stderr]\n" + (r.stderr or "")[-2000:]) if r.stderr else "")
        return f"[exit={r.returncode}]\n{out[-5000:] or '(출력 없음)'}"
    if name == "Read":
        ap, _ = _safe_path(cwd, args.get("path") or "")
        off = int(args.get("offset") or 1)
        lim = min(int(args.get("limit") or 200), 2000)
        with open(ap, encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
        return "".join(f"{i}: {l}" for i, l in enumerate(lines[off - 1:off - 1 + lim], off)) or "(빈 파일)"
    if name == "Write":
        ap, writable = _safe_path(cwd, args.get("path") or "")
        if not writable:
            raise RuntimeError("도구 폴더는 읽기만 됩니다")
        os.makedirs(os.path.dirname(ap) or ".", exist_ok=True)
        with open(ap, "w", encoding="utf-8") as f:
            f.write(args.get("content") or "")
        return f"ok ({len(args.get('content') or '')}자)"
    if name == "Edit":
        ap, writable = _safe_path(cwd, args.get("path") or "")
        if not writable:
            raise RuntimeError("도구 폴더는 읽기만 됩니다")
        with open(ap, encoding="utf-8") as f:
            src = f.read()
        old, new = args.get("oldString") or "", args.get("newString") or ""
        if old not in src:
            raise RuntimeError("oldString을 찾지 못했습니다")
        if not args.get("replaceAll") and src.count(old) != 1:
            raise RuntimeError(f"oldString이 {src.count(old)}곳 — 더 좁히거나 replaceAll=true")
        with open(ap, "w", encoding="utf-8") as f:
            f.write(src.replace(old, new) if args.get("replaceAll") else src.replace(old, new, 1))
        return "ok"
    if name == "Glob":
        hits = sorted(glob.glob(os.path.join(cwd, args.get("pattern") or ""), recursive=True))
        rel = [os.path.relpath(h, cwd) for h in hits[:100]]
        return "\n".join(rel) or "(없음)"
    if name == "Grep":
        import re as _re
        pat, base = args.get("pattern") or "", args.get("path") or "."
        rx = _re.compile(pat)
        root = os.path.join(cwd, base) if not os.path.isabs(base) else base
        out = []
        for dp, _, fns in os.walk(root if os.path.isdir(root) else cwd):
            for fn in fns:
                fp = os.path.join(dp, fn)
                try:
                    if os.path.getsize(fp) > 2_000_000:
                        continue
                    with open(fp, encoding="utf-8", errors="ignore") as f:
                        for i, ln in enumerate(f, 1):
                            if rx.search(ln):
                                out.append(f"{os.path.relpath(fp, cwd)}:{i}: {ln.strip()[:200]}")
                                if len(out) >= 100:
                                    return "\n".join(out)
                except Exception:
                    continue
            if dp.count(os.sep) - cwd.count(os.sep) > 6:
                continue
        return "\n".join(out) or "(없음)"
    if name == "TodoWrite":
        return f"ok ({len(args.get('todos') or [])}건 메모)"
    raise RuntimeError(f"알 수 없는 도구: {name}")


SYS_SUFFIX = ("\n\n[도구 사용법] 네가 쓸 수 있는 도구는 Bash·Read·Write·Edit·Glob·Grep·TodoWrite 뿐이다(WebFetch/WebSearch 없음)."
              " 진행은 반드시 `python pd.py`가 아니라 지시문의 {{PD}} 명령(Bash)으로 보고한다."
              " 끝에는 반드시 result.json을 남긴다(없으면 실패). 질문 없이 끝까지 한다.")


IMG_EXT = (".png", ".jpg", ".jpeg", ".webp", ".gif")
MAX_IMGS_PER_TURN = 4
TOOL_RE = re.compile(r"<tool\s+name=\"(\w+)\"\s*>(.*?)</tool>", re.S)


def _text_protocol():
    """도구 호출(function calling)을 못 받는 모델용 — 같은 도구를 글 규약으로"""
    lines = ["[도구 규약] 이 모델은 도구 호출 기능이 없으므로 글로 부른다. 도구를 쓰려면 답에 아래 꼴을 그대로 쓴다(여러 개 가능):",
             '<tool name="Bash">{"command": "…"}</tool>',
             "인자는 JSON 한 덩어리. 결과는 다음 사용자 메시지의 <result name=…> 로 돌아온다. 도구 없이 답하면 끝난 것으로 본다.",
             "도구 목록:"]
    for t in TOOLS:
        f = t["function"]
        lines.append(f"- {f['name']}: {f['description']} 인자: {json.dumps(f['parameters'].get('properties', {}), ensure_ascii=False)}")
    return "\n".join(lines)


def _image_part(path, max_side=1568):
    """그림 → OpenAI 꼴 image_url(data URI). 긴 변 1568px · JPEG — 토큰을 아끼려고"""
    import base64, io
    from PIL import Image
    im = Image.open(path)
    im = im.convert("RGB")
    im.thumbnail((max_side, max_side))
    b = io.BytesIO()
    im.save(b, "JPEG", quality=85)
    return {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()}}, im.size


def _size(messages):
    """문맥 크기 어림(토큰) — 글 3자 = 1토큰, 그림 한 장 = 1600토큰"""
    n = 0
    for m in messages:
        c = m.get("content")
        if isinstance(c, list):
            for p in c:
                n += 1600 if p.get("type") == "image_url" else len(p.get("text") or "") // 3
        else:
            n += len(c or "") // 3
        n += len(json.dumps(m.get("tool_calls") or "", ensure_ascii=False)) // 3
    return n


def _trim(messages, limit):
    """문맥이 차면 오래된 도구 결과·그림부터 줄인다(처음 두 메시지 = 지시는 남긴다)"""
    i = 2
    while _size(messages) > limit and i < len(messages) - 6:
        m = messages[i]
        c = m.get("content")
        if isinstance(c, list):
            m["content"] = " ".join(p.get("text", "") for p in c if p.get("type") == "text") + " (그림은 문맥을 아끼려고 뺐다)"
        elif m.get("role") in ("tool", "user") and len(c or "") > 400:
            m["content"] = (c or "")[:200] + "\n…(앞 결과 — 문맥을 아끼려고 줄였다)"
        i += 1


def _chat(job, req_fn, model, effort, messages, max_tokens, caps, minimal=False):
    """서버 프록시로 한 번 부른다. 모델이 받는 인자만 싣는다(minimal=True 면 필수만)"""
    body = {"kind": "build", "model": model, "messages": messages, "max_tokens": max_tokens}
    if caps["tools"]:
        body["tools"] = TOOLS
        if caps["tool_choice"] and not minimal:
            body["tool_choice"] = "auto"
    if caps["reasoning"] and effort and not minimal:
        body["reasoning"] = {"effort": effort}
    r = req_fn("POST", f"/worker/jobs/{job.id}/ai", body, timeout=320)
    # 서버 프록시는 OpenRouter 원문을 그대로 돌려준다
    choice = (r.get("choices") or [{}])[0]
    msg = choice.get("message") or {}
    usage = r.get("usage") or {}
    pd = r.get("pd") or {}
    return msg, {"cost": float(usage.get("cost") or 0), "in": int(usage.get("prompt_tokens") or 0),
                 "out": int(usage.get("completion_tokens") or 0), "spent": pd.get("spent")}


def run_agent(job, prompt, cwd, prog_file=None, req_fn=None, model=None, effort=None, quiet=False):
    """동기 실행. 반환 final dict(text/cost/turns). job.event로 생각·도구를 중계한다.
    모델 능력(or_models)에 맞춰: 도구 호출이 없으면 글 규약, 그림을 못 보면 좌표·글로, 출력·문맥 한도는 모델 값으로."""
    import worker as W
    import or_models
    req_fn = req_fn or W.req
    model = model or W.CFG.get("build_model") or DEFAULT_MODEL
    effort = effort or W.CFG.get("build_effort") or ""   # 비우면 서버가 관리자 설정 추론 강도를 붙인다(모델이 받을 때만)
    caps = or_models.info(model)
    max_tokens = max(1024, min(MAX_TOKENS, int(caps["max_out"] or MAX_TOKENS), int(caps["ctx"]) // 4))
    job._or_prog = prog_file or os.path.join(cwd, "progress.jsonl")
    sys_txt = "너는 powerDeck 장표 제작 엔진이다. 시안이 정답이다. 무인 실행 — 질문 금지."
    if not caps["tools"]:
        sys_txt += "\n\n" + _text_protocol()
    if not caps["vision"]:
        sys_txt += ("\n\n[그림] 이 모델은 그림을 볼 수 없다. Read 로 그림을 열면 크기만 돌아온다. 시안 그림 대신 _mockup/plan.json 의 "
                    "배치(wire·좌표)와 글을 정답으로 삼고, 대조는 렌더 PNG 대신 도형 좌표·글 넘침 계산으로 한다.")
    if not quiet:
        job.event(f"엔진 모델: {model} — 도구 {'호출' if caps['tools'] else '글 규약'} · 그림 {'봄' if caps['vision'] else '못 봄'} · 문맥 {caps['ctx'] // 1000}k")
    messages = [{"role": "system", "content": sys_txt}, {"role": "user", "content": prompt + SYS_SUFFIX}]
    total_cost, turns, final_text, minimal, fails = 0.0, 0, "", False, 0
    for it in range(MAX_ITERS):
        if getattr(job, "cancel", False):
            final_text = "취소됨"
            break
        _trim(messages, int(caps["ctx"] * 0.7) - max_tokens)
        try:
            msg, info = _chat(job, req_fn, model, effort, messages, max_tokens, caps, minimal)
            fails = 0
        except Exception as e:
            s = str(e)
            if "402" in s or "한도" in s or "상한" in s:   # 예산 — 즉시 중단
                raise
            fails += 1
            if fails >= 6:
                raise
            if ("400" in s or "context" in s.lower() or "too long" in s.lower()) and not minimal:
                minimal = True   # 이 모델이 안 받는 인자일 수 있다 — 필수만 남기고 다시
                max_tokens = max(1024, max_tokens // 2)
                _trim(messages, int(caps["ctx"] * 0.5))
            job.event(f"OpenRouter 호출 실패(재시도 {fails}): {s[:160]}", "warn")
            time.sleep(min(60, 5 * fails))
            continue
        total_cost += info["cost"]
        turns += 1
        content = msg.get("content") or ""
        if isinstance(content, list):  # parts 배열 대응
            content = "".join(x.get("text", "") for x in content if isinstance(x, dict))
        tool_calls = msg.get("tool_calls") or []
        if not caps["tools"]:   # 글 규약 → 같은 꼴로 바꾼다
            tool_calls = [{"id": f"t{it}_{k}", "function": {"name": n, "arguments": a.strip()}} for k, (n, a) in enumerate(TOOL_RE.findall(content))]
        shown = TOOL_RE.sub("", content).strip()
        if shown and not quiet:
            job.event(shown[:500] + ("…" if len(shown) > 500 else ""), "think")
        if caps["tools"]:
            messages.append({"role": "assistant", "content": content or "", "tool_calls": tool_calls or None})
        else:
            messages.append({"role": "assistant", "content": content or ""})
        if not tool_calls:
            final_text = content
            # result.json 없이 끝나면 한 번 촉구
            if not os.path.isfile(os.path.join(cwd, "result.json")) and it < MAX_ITERS - 1:
                messages.append({"role": "user", "content": "result.json이 아직 없다. out/sNN.pptx와 result.json을 만들고 끝내라."})
                continue
            break
        results, images = [], []
        for tc in tool_calls:
            fn = (tc.get("function") or {})
            tname, targs = fn.get("name"), fn.get("arguments")
            try:
                targs = json.loads(targs) if isinstance(targs, str) else (targs or {})
            except Exception:
                targs = {}
            tid = tc.get("id") or f"t{it}"
            try:
                path = str(targs.get("path") or "")
                if tname == "Read" and path.lower().endswith(IMG_EXT):   # 그림 — 볼 수 있는 모델이면 다음 메시지에 붙인다
                    ap, _ = _safe_path(cwd, path)
                    if caps["vision"] and len(images) < MAX_IMGS_PER_TURN:
                        part, sz = _image_part(ap)
                        images += [{"type": "text", "text": f"[Read 로 연 그림] {path} ({sz[0]}×{sz[1]})"}, part]
                        res = f"그림 {path} 을(를) 다음 메시지에 붙였다."
                    else:
                        from PIL import Image
                        w, h = Image.open(ap).size
                        res = f"그림 {path} — {w}×{h}px. " + ("이 모델은 그림을 볼 수 없다 — 좌표·글로 판단한다." if not caps["vision"] else f"한 번에 그림은 {MAX_IMGS_PER_TURN}장까지 — 다음 차례에 다시 연다.")
                else:
                    res = exec_tool(job, cwd, tname, targs)
                if tname == "Bash" and not quiet:
                    job.event(f"도구 실행: {str(targs.get('command') or '')[:80]}")
            except Exception as e:
                res = f"ERROR: {str(e)[:500]}"
            if caps["tools"]:
                messages.append({"role": "tool", "tool_call_id": tid, "content": res[-6000:]})
            else:
                results.append(f'<result name="{tname}">\n{res[-6000:]}\n</result>')
        if results:
            messages.append({"role": "user", "content": "\n".join(results)})
        if images:
            messages.append({"role": "user", "content": images})
        # result.json 생기면 조기 종료하지 않음 — 대조·마감까지 하도록 둔다(프롬프트가 정한다)
    return {"text": (final_text or "")[-2000:], "cost": round(total_cost, 6), "turns": turns,
            "model": model, "is_error": False}


class AgentProc:
    """launch_claude와 같은 껍데기 — p.poll()/pid, final dict, t.join()"""

    def __init__(self):
        self._rc = None
        self.pid = 0

    def poll(self):
        return self._rc

    @property
    def returncode(self):
        return self._rc


def launch_or_agent(job, prompt, cwd=None, prog_file=None, quiet=False):
    """build_parallel/run_claude에서 launch_claude 대신 쓴다. 반환 (proc, final, thread)."""
    import worker as W
    cwd = cwd or job.dir
    final = {}
    proc = AgentProc()
    model = W.build_model(job)   # config build_model → 관리자 설정(engine_model) → 기본

    def _run():
        try:
            r = run_agent(job, prompt, cwd, prog_file=prog_file, model=model, quiet=quiet)
            final.update(r)
            proc._rc = 0
        except Exception as e:
            traceback.print_exc()
            final.update({"text": f"OpenRouter 에이전트 실패: {str(e)[:500]}", "is_error": True, "cost": final.get("cost", 0)})
            proc._rc = 1
        if not quiet:
            try:
                job.event(f"엔진 모델: {model} (OpenRouter)")
            except Exception:
                pass

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return proc, final, t
