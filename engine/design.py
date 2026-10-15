# -*- coding: utf-8 -*-
"""
design 작업의 기획·시안 단계(phase=plan).
  1) 내용(brief: 글·md, 또는 초안 pptx 의 글)을 읽는다
  2) 기획 모델(Claude Sonnet)로 장별 기획 JSON 을 만든다 — 장 제목·내용·레이아웃 유형·참고할 기준 시안 번호·이미지 프롬프트
  3) 장마다 시안 이미지 모델(GPT Image)로 시안을 만든다 — 기준 시안(reference/mockups/AI시안) 1~2장을 참고 이미지로 함께 넘긴다
  4) 시안·plan.json 을 서버에 올리고 '시안 확인' 상태로 넘긴다
OpenRouter 호출은 서버(/worker/jobs/{id}/ai)가 작업 주인의 키로 대신 보내고 비용을 작업에 적립한다. 한도를 넘으면 402.
"""
import base64, glob, io, json, os, re, time, traceback, urllib.error, urllib.parse
import styles

W = {}  # worker.py 가 setup() 으로 넘겨주는 함수·설정



# ── 제작 언어(opts.lang) — 장표에 들어가는 글(기획·와이어·시안·앞장)을 이 언어로. 자료 요약(digest)은 한국어 그대로(내부용)
LANGS = {"ko": ("한국어", "Korean"), "en": ("영어", "English"), "ja": ("일본어", "Japanese"), "zh": ("중국어(간체)", "Simplified Chinese"),
         "fr": ("프랑스어", "French"), "es": ("스페인어", "Spanish"), "de": ("독일어", "German"), "vi": ("베트남어", "Vietnamese")}
FRONT_WORDS = {   # 엔진이 직접 쓰는 앞장 낱말 — 표지 꼬리 글(발표용·제출용)·목차·감사합니다·질의응답·본문
    "en": {"present": "Proposal Presentation", "submit": "Proposal", "toc": "Contents", "end": "Thank you", "qna": "Q&A", "body": "Overview"},
    "ja": {"present": "提案説明会", "submit": "提案書", "toc": "目次", "end": "ありがとうございました", "qna": "質疑応答", "body": "本文"},
    "zh": {"present": "方案说明会", "submit": "方案书", "toc": "目录", "end": "谢谢", "qna": "问答", "body": "正文"},
    "fr": {"present": "Présentation de la proposition", "submit": "Proposition", "toc": "Sommaire", "end": "Merci", "qna": "Questions", "body": "Contenu"},
    "es": {"present": "Presentación de la propuesta", "submit": "Propuesta", "toc": "Índice", "end": "Gracias", "qna": "Preguntas", "body": "Contenido"},
    "de": {"present": "Angebotspräsentation", "submit": "Angebot", "toc": "Inhalt", "end": "Vielen Dank", "qna": "Fragen", "body": "Inhalt"},
    "vi": {"present": "Thuyết trình đề xuất", "submit": "Hồ sơ đề xuất", "toc": "Mục lục", "end": "Xin cảm ơn", "qna": "Hỏi đáp", "body": "Nội dung"},
}


def lang_of(j):
    o = j.get("opts") if isinstance(j, dict) else None
    if isinstance(o, str):
        try:
            o = json.loads(o)
        except Exception:
            o = None
    c = str((o or {}).get("lang") or "ko")
    return c if c in LANGS else "ko"


def front_word(code, key, ko):
    return (FRONT_WORDS.get(code) or {}).get(key) or ko


JSON_RULE = """

# JSON 출력 규칙(반드시)
- 설명·인사·코드 울타리 없이 JSON 하나만 출력한다.
- 문자열 안에서 큰따옴표(")를 쓰지 않는다 — 인용·강조는 「」나 ‘’로. 꼭 써야 하면 \\" 로 이스케이프한다.
- 문자열 안 줄바꿈·탭은 \\n·\\t 로 쓴다.
- 배열·객체의 항목 사이 쉼표를 빠뜨리지 않고, 마지막 항목 뒤에는 쉼표를 두지 않는다."""


def lang_rule(code):
    """글 AI(기획·와이어) 지시문 끝에 붙일 언어 규칙. 한국어면 빈 글"""
    if code == "ko":
        return ""
    ko, en = LANGS[code]
    return (f"\n\n# 제작 언어 = {ko}({en}) — 반드시 지킨다\n"
            f"장표 화면에 나가는 글(장 제목·헤드라인·본문·표·도식 칸 글·수치 라벨·장 이름·목차 항목·발표 메모)은 전부 {ko}로 쓴다. "
            "자료가 한국어여도 그 뜻을 옮겨 쓰고, 한국어 문장을 섞지 않는다. 고유명사(기관·제품·사업명)는 자료 표기를 따르되 처음 나올 때 그 언어 표기를 함께 쓸 수 있다. "
            "JSON 키 이름과 형식은 위 지시 그대로(키는 번역하지 않는다). 숫자·단위·날짜는 그 언어의 관례대로.")


def lang_build_rule(code):
    """장표 제작(pptx) 에이전트 지시문 끝 — 앞장·라벨·쪽 글까지 같은 언어"""
    if code == "ko":
        return ""
    ko, en = LANGS[code]
    return (f"\n\n# 제작 언어 = {ko}({en})\n"
            f"이 장표는 {ko}로 만든다. 확정 시안·기획의 글을 그대로 옮기고, 직접 넣는 글(목차 제목·PART 표시·표 머리·라벨·쪽 아래 글·엔딩)도 {ko}로 쓴다. "
            f"한국어 문장을 새로 넣지 않는다. 서체는 {ko} 글자가 모두 있는 것을 쓰고, 글자가 빠지면(네모) 그 언어용 서체로 바꾼다.")


def lang_image_override(code):
    """시안 이미지 지시문 끝 — 위의 'Korean only' 규칙을 이 언어로 바꿔 읽게 한다"""
    if code == "ko":
        return ""
    en = LANGS[code][1]
    return (f"\n\nLANGUAGE OVERRIDE (wins over every line above): this deck is written in {en}. Wherever the instructions above say Korean, Hangul or "
            f"'Korean text only', read it as {en}: print the given {en} strings exactly as given, character by character, in a clean sans-serif typeface suited to {en}. "
            f"Never translate them into Korean, never add Hangul. Labels such as the contents title, PART/chapter marks and captions are also in {en}.")

def setup(ctx):
    W.update(ctx)


MEMO_TONE = re.compile(r"(보인다|보여\s*준다|준다|박는다|증명한다|남긴다|짚는다|강조한다|어필한다|설득한다|각인한다|전달한다|끝낸다|약속한다)[.!]?$|심사위원|평가위원")


def divider_line(ch):
    """간지 장 이름 아래 한 줄 — 개요의 약속(promise). 없으면 goal 을 쓰되 기획 메모 말투면 버린다(빈 값이면 장 첫 키메시지로)."""
    for k in ("promise", "goal"):
        t = str((ch or {}).get(k) or "").strip()
        if t and not MEMO_TONE.search(t.replace("**", "")):
            return t
    return ""


def ref_dir():
    return W["CFG"].get("reference_dir") or os.path.normpath(os.path.join(W["HERE"], "..", "reference"))


def read(p, limit=None):
    try:
        with open(p, encoding="utf-8") as f:
            s = f.read()
        return s[:limit] if limit else s
    except OSError:
        return ""


class Budget(Exception):
    """비용 한도 도달 — 그 자리에서 멈추고 지금까지 만든 것으로 확인 단계로 넘긴다"""


class Cancelled(Exception):
    """사용자가 취소 — 감시 스레드가 이미 서버에 '취소됨'으로 보고했다"""


def watch(job):
    """기획·시안 단계 동안 5초마다 서버에 진행을 알리고 취소를 확인한다. AI 호출이 몇 분 걸려도 취소는 바로 먹는다."""
    import threading, time

    def run():
        while not job.plan_done:
            time.sleep(5)
            if job.plan_done:
                return
            job.push()
            if job.cancel:
                try:
                    W["req"]("POST", f"/worker/jobs/{job.id}/finish", {"status": "canceled"})
                except Exception as e:
                    W["log"]("취소 보고 실패:", e)
                job.plan_done = True
                W["log"](f"[{job.id}] 취소됨 — 진행 중이던 호출 결과는 버립니다")
                return
    job.plan_done = False
    threading.Thread(target=run, daemon=True).start()


CLI_MODEL = {"digest": "claude-sonnet-5-5"}   # 자료 요약은 Sonnet(빠름), 나머지 글 작업은 엔진 모델(기본 Opus 5.5 — DEFAULT_CLI_MODEL). 그림만 OpenRouter
DEFAULT_CLI_MODEL = "claude-opus-5-5"
CLI_BUSY = {"n": 0}   # 지금 돌고 있는 Claude 구독 호출 수 — 많으면 OpenRouter 로 돌린다(과부하)


def no_mcp():
    """Claude Code 를 MCP 서버 없이 띄우는 인자 — 이 PC 에 깔린 MCP(피그마·브라우저…)를 매번 불러오느라 호출마다 3초쯤 늦던 것"""
    p = os.path.join(W["HERE"], "_no_mcp.json")
    if not os.path.isfile(p):
        with open(p, "w", encoding="utf-8") as f:
            f.write('{"mcpServers": {}}')
    return ["--strict-mcp-config", "--mcp-config", p]


def cli_text(job, kind, body, timeout=900):
    """글 작업(기획·자료 요약)을 이 PC 의 Claude Code(구독)로 — OpenRouter 를 쓰지 않는다. 도구 없이 글만 받는다.
    돌려주는 모양은 OpenRouter 응답과 같게({choices:[{message:{content}}]}) 해서 부르는 쪽이 그대로 쓴다."""
    import subprocess, threading, time
    msgs = body.get("messages") or []
    system = "\n\n".join(m["content"] for m in msgs if m.get("role") == "system")
    user = "\n\n".join(m["content"] for m in msgs if m.get("role") != "system")
    prompt = (system + "\n\n────────\n아래가 입력이다. 도구를 쓰지 말고, 위 지시가 요구한 결과물만 출력한다(설명·인사 없이).\n────────\n\n" + user) if system else user
    model = CLI_MODEL.get(kind) or W["CFG"].get("model") or getattr(job, "engine_model", "") or DEFAULT_CLI_MODEL
    cmd = [W["claude_exe"](), "-p", "--output-format", "json", "--disallowedTools", "Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch,TodoWrite,Task"] + no_mcp()
    if model:
        cmd += ["--model", model]
    cwd = os.path.join(job.dir, "_cli")   # 빈 폴더에서 — 작업 폴더의 파일·지시문이 섞이지 않게
    os.makedirs(cwd, exist_ok=True)
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    if W["CFG"].get("anthropic_api_key"):
        env["ANTHROPIC_API_KEY"] = W["CFG"]["anthropic_api_key"]
    t0 = time.time()
    CLI_BUSY["n"] += 1
    try:
        return _cli_run(job, kind, cmd, cwd, env, prompt, model, t0, timeout)
    finally:
        CLI_BUSY["n"] -= 1


def _cli_run(job, kind, cmd, cwd, env, prompt, model, t0, timeout):
    import subprocess, threading, time
    import osdep
    p = subprocess.Popen(cmd, cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, **osdep.popen_group())
    box = {}
    th = threading.Thread(target=lambda: box.update(zip(("out", "err"), p.communicate(prompt.encode("utf-8")))), daemon=True)
    th.start()
    while th.is_alive():
        th.join(2)
        if job.cancel:
            osdep.kill_tree(p.pid)   # claude 가 띄운 자식까지
            raise Cancelled()
        if time.time() - t0 > timeout:
            osdep.kill_tree(p.pid)
            raise RuntimeError("Claude Code 응답이 너무 오래 걸립니다")
    try:
        d = json.loads((box.get("out") or b"").decode("utf-8", "replace"))
    except Exception:
        raise RuntimeError("Claude Code 출력 해석 실패: " + ((box.get("err") or box.get("out") or b"").decode("utf-8", "replace")[-300:]))
    if d.get("is_error") or not (d.get("result") or "").strip():
        raise RuntimeError("Claude Code 오류: " + str(d.get("result") or d.get("subtype") or "")[:300])
    try:   # 구독 사용분 — 실제 청구는 없고 API 환산액으로 기록(정산서의 '구독 사용' 줄)
        W["req"]("POST", f"/worker/jobs/{job.id}/usage", {"kind": "e" + kind, "model": model or "claude (CLI 기본)", "cost": d.get("total_cost_usd") or 0,
                                                          "turns": d.get("num_turns") or 1, "seconds": int(time.time() - t0)})
    except Exception as e:
        W["log"]("구독 사용 기록 실패(무시):", e)
    return {"choices": [{"message": {"content": d["result"]}}], "pd": {}}


def ai(job, kind, body, timeout=320):
    """서버 대리 호출. 402 → Budget. 응답 JSON 의 pd 에 누적 비용이 온다.
    글 작업(plan·digest)은 관리자 설정이 '구독(CLI)'이면 이 PC 의 Claude Code 로 돌리고, 실패하면 OpenRouter 로 넘어간다."""
    if job.cancel:
        raise Cancelled()
    if kind == "plan":   # 모든 기획 호출에 JSON 쓰기 규칙 — 글 속 따옴표·빠진 쉼표로 40장 개요가 두 번 다 실패했다(2026-10-13)
        msgs = [dict(m) for m in (body.get("messages") or [])]
        if not any(JSON_RULE.strip() in str(m.get("content")) for m in msgs):
            sys_m = next((m for m in msgs if m.get("role") == "system"), None)
            if sys_m:
                sys_m["content"] = str(sys_m.get("content") or "") + JSON_RULE
            else:
                msgs.insert(0, {"role": "system", "content": JSON_RULE.strip()})
            body = dict(body, messages=msgs)
    if kind == "plan" and getattr(job, "lang", "ko") != "ko":   # 제작 언어 — 기획·와이어 글(CLI·OpenRouter 둘 다)
        rule = lang_rule(job.lang)
        msgs = [dict(m) for m in (body.get("messages") or [])]
        if not any(rule.strip() in str(m.get("content")) for m in msgs):
            sys_m = next((m for m in msgs if m.get("role") == "system"), None)
            if sys_m:
                sys_m["content"] = str(sys_m.get("content") or "") + rule
            else:
                msgs.insert(0, {"role": "system", "content": rule.strip()})
            body = dict(body, messages=msgs)
    if kind in ("plan", "digest") and getattr(job, "text_engine", "cli") == "cli" and CLI_BUSY["n"] >= int(W["CFG"].get("cli_max", 4)):
        job.event(f"엔진 PC 의 Claude 가 바빠서(동시 {CLI_BUSY['n']}건) 이번 글 작업은 OpenRouter 로 돌립니다.", "warn")
    elif kind in ("plan", "digest") and getattr(job, "text_engine", "cli") == "cli":
        try:
            job.event("기획을 짜는 중입니다" if kind == "plan" else "자료를 읽고 요약하는 중입니다")
            return cli_text(job, kind, body)
        except Cancelled:
            raise
        except Exception as e:
            job.event(f"Claude 구독 호출이 실패해 OpenRouter 로 넘어갑니다: {str(e)[:160]}", "warn")
    body = dict(body, kind=kind)
    if timeout < 320:   # 서버가 OpenRouter 를 이만큼만 기다린다(기본 300초) — 선택 단계는 짧게 끊는다
        body["_timeout"] = max(60, timeout - 20)
    try:
        r = W["req"]("POST", f"/worker/jobs/{job.id}/ai", body, timeout=timeout)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            msg = json.loads(raw).get("error") or raw[:300].decode("utf-8", "replace")
        except Exception:
            msg = raw[:300].decode("utf-8", "replace")
        if e.code == 402:
            raise Budget(msg)
        raise RuntimeError(f"AI 호출 실패({e.code}): {msg}")
    pd = r.get("pd") or {}
    if pd:
        job.spent = pd.get("spent", job.spent)
        job.budget = pd.get("budget", job.budget)
        if not pd.get("cost_known") and not getattr(job, "_cost_warned", False):
            job._cost_warned = True
            job.event("이 모델은 응답에 비용을 알려주지 않아 한도 계산에서 빠집니다. OpenRouter 사용량 화면으로 확인하세요.", "warn")
    return r


def text_of(r):
    m = (r.get("choices") or [{}])[0].get("message") or {}
    c = m.get("content")
    if isinstance(c, list):
        c = "".join(x.get("text", "") for x in c if isinstance(x, dict))
    return c or ""


def image_of(r):
    """OpenRouter 이미지 응답 → PNG 바이트. message.images[].image_url.url (data URL) 또는 b64_json"""
    m = (r.get("choices") or [{}])[0].get("message") or {}
    for im in m.get("images") or []:
        u = (im.get("image_url") or {}).get("url") or im.get("b64_json") or ""
        if u.startswith("data:"):
            u = u.split(",", 1)[1]
        if u:
            return base64.b64decode(u)
    for d in r.get("data") or []:
        if d.get("b64_json"):
            return base64.b64decode(d["b64_json"])
    return None


def _loads(t):
    """json.loads(strict=False) — 'Extra data'(완성된 객체 뒤에 객체가 더 붙음: 묶음을 장마다 따로 낸 B안)면
    이어진 객체를 모두 읽어 하나로 합친다. slides 는 이어 붙이고 나머지 열쇠는 앞 객체 우선(2026-10-13)"""
    try:
        return json.loads(t, strict=False)
    except json.JSONDecodeError as e:
        if not str(e).startswith("Extra data"):
            raise
    dec, objs, p, n = json.JSONDecoder(strict=False), [], 0, len(t)
    while p < n:
        q = t.find("{", p)
        if q < 0:
            break
        try:
            o, p = dec.raw_decode(t, q)
        except json.JSONDecodeError:
            p = q + 1
            continue
        if isinstance(o, dict):
            objs.append(o)
    if not objs:
        raise json.JSONDecodeError("이어진 JSON 객체를 읽지 못함", t, 0)
    out, slides = {}, []
    for o in objs:
        if isinstance(o.get("slides"), list):
            slides += o["slides"]
        elif "n" in o:   # 장 하나를 객체 하나로 낸 경우
            slides.append(o)
            continue
        for k, v in o.items():
            if k != "slides":
                out.setdefault(k, v)
    if slides:
        out["slides"] = slides
    return out


def parse_json(s):
    s = s.strip()
    s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s, flags=re.S)
    i, j = s.find("{"), s.rfind("}")
    try:
        # 추론 모델(Spark 등)이 문자열 안에 실제 줄바꿈·탭을 넣으면 관대하게 받는다
        return _loads(s[i:j + 1])
    except json.JSONDecodeError:
        # 잘못된 역슬래시(\u 뒤 16진수 4자리 아님, \x·\( 처럼 JSON 에 없는 이스케이프)는 글자 그대로로 — 와이어 한 묶음이 이것 하나로 버려졌다(2026-10-07)
        t = re.sub(r'\\u(?![0-9a-fA-F]{4})', r'\\\\u', s[i:j + 1])
        t = re.sub(r'\\(?![\\"/bfnrtu])', r'\\\\', t)
        try:
            return _loads(t)
        except json.JSONDecodeError:
            # 문자열 안 이스케이프 안 된 따옴표("식품안전나라 "통합" 구축")·항목 사이 빠진 쉼표 — 개요 40장이 이것으로 두 번 다 실패했다(2026-10-13)
            q = _repair_quotes(t)
            try:
                return _loads(q)
            except json.JSONDecodeError:
                # 괄호 짝 — 표 블록 끝 '…]]}}}, {' 처럼 닫는 괄호가 하나 더 붙음(세로 제안서 장 통째 누락, 2026-10-14)
                return _loads(_repair_brackets(q))


def _repair_brackets(s):
    """문자열 밖 괄호 짝 맞추기 — 열린 것과 안 맞는 닫는 괄호는 버리고, 끝에 모자란 닫는 괄호는 채운다"""
    out, st, ins, k, n = [], [], False, 0, len(s)
    while k < n:
        c = s[k]
        if ins:
            out.append(c)
            if c == "\\" and k + 1 < n:
                out.append(s[k + 1])
                k += 2
                continue
            if c == '"':
                ins = False
        elif c == '"':
            ins = True
            out.append(c)
        elif c in "{[":
            st.append(c)
            out.append(c)
        elif c in "}]":
            if st and st[-1] == ("{" if c == "}" else "["):
                st.pop()
                out.append(c)
            # 짝이 안 맞는 닫는 괄호는 버린다(앞 쉼표가 남으면 아래에서 지운다)
        else:
            out.append(c)
        k += 1
    out += ["}" if c == "{" else "]" for c in reversed(st)]
    return re.sub(r",(\s*[}\]])", r"\1", "".join(out))


def _repair_quotes(s):
    """JSON 글을 한 글자씩 읽으며 ① 문자열 안 따옴표 중 뒤가 JSON 구분자(, } ] :)가 아닌 것은 글자로(\\") ② 값 뒤에 쉼표 없이 다음 값이 오면 쉼표를 넣는다"""
    out, n, k, ins = [], len(s), 0, False

    def nxt(p):
        while p < n and s[p] in " \t\r\n":
            p += 1
        return p

    while k < n:
        c = s[k]
        if ins:
            if c == "\\" and k + 1 < n:
                out.append(s[k:k + 2])
                k += 2
                continue
            if c == '"':
                p = nxt(k + 1)
                ch = s[p] if p < n else ""
                close = ch in ("}", "]", ":", "")
                if ch == ",":
                    q = nxt(p + 1)
                    close = q >= n or s[q] in '"{[-0123456789tfn}]'
                elif ch == '"':
                    # 바로 다음에 "열쇠": 꼴이 오면 닫는 따옴표인데 쉼표가 빠진 것("a": "x" "b": 1) — 아니면 글 속 따옴표
                    q = p + 1
                    while q < n and s[q] != '"':
                        q += 2 if s[q] == "\\" else 1
                    close = q < n and nxt(q + 1) < n and s[nxt(q + 1)] == ":"
                    if close:
                        out.append(c)
                        out.append(",")
                        ins = False
                        k += 1
                        continue
                if close:
                    ins = False
                    out.append(c)
                else:
                    out.append('\\"')
                k += 1
                continue
            out.append(c)
            k += 1
            continue
        if c == '"':
            ins = True
        out.append(c)
        if c in '"}]' and not ins:
            p = nxt(k + 1)
            if p < n and s[p] in '"{[':
                out.append(",")
        k += 1
    return "".join(out)


def pptx_text(path):
    """초안 pptx 의 장별 글(글상자·표)을 마크다운으로"""
    from pptx import Presentation
    prs = Presentation(path)
    out = []
    for i, s in enumerate(prs.slides, 1):
        lines = []
        for sh in s.shapes:
            if sh.has_text_frame:
                for p in sh.text_frame.paragraphs:
                    t = "".join(r.text for r in p.runs).strip()
                    if t:
                        lines.append(("  " * min(p.level, 3)) + "- " + t)
            if getattr(sh, "has_table", False) and sh.has_table:
                for row in sh.table.rows:
                    lines.append("| " + " | ".join(c.text.strip().replace("\n", " ") for c in row.cells) + " |")
        out.append(f"## {i}쪽\n" + ("\n".join(lines) if lines else "(글 없음)"))
    return "\n\n".join(out)


REF_DECKS = {"A": "AI시안", "B": "완성장표-기후플랫폼", "C": "완성장표", "D": "컨텐츠모음"}   # D = 실제 제안설명회 장표 540장(260116 컨텐츠 모음), 세 자리 번호


def fmt_ref(d, n):
    return f"{d}{n:03d}" if d == "D" else f"{d}{n:02d}"


def parse_ref(x):
    """'B07' / 'A8' / 8 → ('B', 7). 숫자만이면 A 덱"""
    s = str(x).strip().upper()
    m = re.match(r"^([ABCD])?\s*(\d{1,3})$", s)
    if not m:
        return None
    return (m.group(1) or "A", int(m.group(2)))


def ref_image_b64(ref, max_w=1280):
    """기준 장(덱/NN_*.png) 한 장을 작게 줄여 base64 JPEG 로"""
    from PIL import Image
    p = parse_ref(ref)
    if not p:
        return None
    deck, n = p
    d = os.path.join(ref_dir(), "mockups", REF_DECKS[deck])
    fs = glob.glob(os.path.join(d, f"{n:02d}_*.png")) + glob.glob(os.path.join(d, f"{n:03d}_*.jpg")) + glob.glob(os.path.join(d, f"{n:02d}_*.jpg"))
    if not fs:
        return None
    im = Image.open(fs[0]).convert("RGB")
    im.thumbnail((max_w, max_w))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=80)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


PLAN_SYSTEM = """너는 공공 SI 제안서의 장표 기획자다. 사용자가 준 내용을 장표 단위로 나누고, 장마다 **무엇을 전달할지**를 먼저 정한 뒤 어떤 장면·구성으로 그릴지 정한다.
반드시 아래 JSON 하나만 출력한다(설명·코드펜스 없이).

{"title": "장표 묶음 제목", "slogan": "표지 사업명 바로 위에 작게 찍는 키메시지 한 줄 — 공백 포함 12~22자, 사업이 지향하는 모습을 '…을 위한'·'…으로' 꼴로(예: '스마트한 도시, 더 안전한 내일을 위한'). 사업명 낱말을 되풀이하지 않는다", "core": "이 제안 전체를 한 문장으로 — 발주기관이 왜 우리에게 맡겨야 하는지(모든 장의 message 가 이 문장으로 이어진다)", "slides": [
  {"n": 1, "section": "장 이름 · 절 이름 (예: 사업 이해 · 추진 배경) — 장(章) 이름은 덱 전체에 4~6개만, 같은 장의 장표는 이어 붙인다", "title": "장 제목(헤드라인, 한 문장 — 한 줄에 들어가게 공백 포함 31자 안팎)", "keyword": "title 안에서 강조색으로 칠할 핵심어 1~2개 — title 에 글자 그대로 있는 말, 여럿이면 쉼표로. 예: '의약품 AI'", "type": "내용 유형(카탈로그 표의 이름)",
   "message": "이 장이 심사위원에게 전달할 한 문장 — 예: '정보가 기관마다 흩어져 있어 이용자는 어디서 무엇을 봐야 할지 모른다'",
   "mood": "문제 제기 | 배경·현황 | 해결·제안 | 절차·방법 | 성과·증명 | 조직·인력 | 마무리 중 하나",
   "device": "이 장의 메시지 장치 — 학습 가이드 '메시지가 드러나는 장치 모음' 표의 장치 이름 하나(이 장의 내용·유형에 맞는 것)",
   "scene": "그림으로 보여줄 장면 — 이 사업 자료에만 있는 대상(시설·현장·시스템·데이터·사용자 이름)으로 짠 인물의 상황, 사물의 배치, 은유",
   "ref": ["참고 번호 1~2개 — 덱 글자+번호 문자열, 예: \\"D267\\", \\"B18\\". D 덱(실제 장표 540장)·B·C 덱 가운데 이 장과 유형·헤드라인·내용이 가장 닮고, 고른 device 를 실제로 쓴 장. 참고 가치 (5)·(4) 를 먼저"], "layout": "칸 나눔·흐름을 한두 문장으로 (장면과 글이 어떻게 자리를 나누는지)",
   "content": "이 장에 들어갈 글 전부 — 마크다운. 소제목/목록/표. 원문의 항목·수치·이름·단계는 하나도 빼지 않는다",
   "image_prompt": "시안 이미지 모델에 줄 영문 지시 2~3문장(한국어 문구는 그대로 인용). 장면(scene)을 먼저, 그 다음 글이 들어갈 자리·부품을 어디에 두는지 — 길게 쓰지 않는다(출력은 content 에 쓴다)"}
]}

가장 중요한 규칙 — 내용을 그대로 카드로 늘어놓지 않는다:
- 표·목록은 '데이터'다. 장은 그 데이터로 **무엇을 말하려는가**를 보여줘야 한다. 문제 제기 장이면 그 사업의 문제가(늘어남·흩어짐·늦어짐·새어 나감·불편…) 그림에 보여야 하고, 해결 장이면 질서·흐름·연결이 보여야 한다.
- 예: "5개 기관의 정보가 각각 있다"는 표 → 번호 카드 5개로 그리면 실패. 그 데이터가 말하는 것(흩어짐·늘어남·늦어짐·새어 나감…)을 장치로 보여 준다.

장면·구성은 학습한 실제 장표에서 고른다 — 손에 익은 한 가지 틀을 모든 사업에 쓰지 않는다:
- 장마다 먼저 이 장의 유형을 정하고, 학습 가이드 '유형별 레이아웃 문법'에서 그 유형의 문법 가운데 이 사업의 내용(수치가 있는가, 현장·지도가 있는가, 단계가 있는가, 화면이 있는가, 사람·역할이 주인공인가)에 가장 맞는 것을 고른다.
- device 는 '메시지가 드러나는 장치 모음' 표에서, ref 는 D 덱 목록에서 같은 유형·같은 장치를 쓴 장으로 고른다. 같은 유형이라도 장치는 여러 개다 — 내용이 다르면 고르는 장치도 달라야 한다.
- 한 덱 안에서는 장마다 장치가 달라야 흐름이 산다(실제 장표도 그렇다). 같은 장치가 필요하면 연속 장 (1/2)(2/2) 로 묶는다.
- 첫 장도 예외가 아니다 — 이 사업 자료가 가장 잘 보여 주는 것(늘어나는 수치, 넓은 현장, 복잡한 절차, 여러 이용자…)에서 장치를 고른다.
- 글은 작고 촘촘하게(기준 완성장표 밀도). 헤드라인(title)은 한 줄 — 완성 장표의 키메시지가 25pt 한 줄이다.
- keyword 는 시안과 완성 장표 양쪽에서 강조색으로 칠해진다. title 에 글자 그대로 들어 있어야 한다.

구성(layout) — 와이어프레임은 기획 뒤에 따로 짠다. layout 에는 칸 나눔과 비율(학습 가이드의 25:50:25, 30:40:30, 40:60 — 주인공 덩어리가 가장 넓다)을 분명히 적는다.
**그림이 주인공이 아니다.** 장의 주인공은 전달할 메시지 — 그 장의 맥락과 내용(현황·문제·수치·근거·결론)이다. 인물·사진·일러스트 상자(person·image)는 메시지를 돕는 보조로, 합쳐서 본문 면적의 35% 이하. 그 장의 글은 모두 글 상자(card·panel·table·badge·band)에 담는다 — 그림 속 말풍선·라벨로 내용을 대신하지 않는다. scene 은 그 보조 그림 하나만 적는다(장 전체를 한 장면으로 그리지 않는다).

용도 — {purpose}

줄거리 — 평가위원은 꼼꼼히 읽지 않고 장 제목만 넘겨 본다:
- 장 제목(title)만 차례로 읽어도 이야기가 이어지게 쓴다. 제목은 절 이름("2. 품질관리")이 아니라 그 장의 주장·약속 한 문장이다. 한 장에 메시지는 하나.
- 장의 순서는 정해진 목차를 채우는 것이 아니라, 평가위원이 궁금해할 순서(평가 항목·배점이 큰 것, 이 사업의 위험이 큰 것)를 따른다. 사업 요약의 'RFP 해독'이 있으면 배점 비중대로 장 수를 나누고(배점 상위 3개 항목은 2장 이상, 평가요소 문구는 제목에 그대로), 사업 요약의 '발표 규정'이 금지한 요소는 넣지 않으며,발주처가 반복해 걱정하는 것에는 구체적인 대응 장을 둔다. 약점·위험은 숨기지 말고 극복 방안과 함께 보인다. 덱의 core 를 먼저 세우고 장마다 그 core 의 어느 부분을 증명하는지 정한다.
- 이해의 순서: 기술·구조를 말하기 전에 그것이 필요한 상황(현장·사용자·업무의 어려움)을 먼저 보여 주고, 그다음 기술, 그다음 효과. 전문용어는 처음 나올 때 짧게 풀어 쓴다. 어려운 기술을 가볍게 줄이지 말고, 왜 중요한지 이해되는 순서로 놓는다.
- 서로 반대처럼 보이는 내용(예: 안정 운영과 신규 개발)은 나열하지 말고 더 높은 하나의 목적으로 묶어 설명한다.
- 비교 장은 판단 기준을 먼저 밝히고, 비교 대상(기존 방식·주요 대안)을 빠뜨리지 않는다 — 불리한 대상을 빼면 신뢰를 잃는다.
- 같은 수치·이름은 덱 전체에서 같은 값·같은 표기로 쓴다(장마다 다르면 신뢰가 무너진다).

사실·근거 — 제작 대행이 고객사를 뼛속까지 알 수 없듯 너도 자료 밖은 모른다. 그래서 자료에 있는 것만 쓴다:
- 수치(금액·비율·기간·건수·점수)·고객사·인증·실적·기술 이름은 '장표에 담을 내용'과 '맥락 자료'에 있는 것만 쓴다. 없는 수치를 만들거나 반올림·환산·추정하지 않는다. 필요한데 없으면 그 자리에 '※ 보강 필요: 무엇' 으로 적는다.
- 사업의 정체성을 넓히지 않는다 — 자료에 없는 사업 영역·기술 유행어(AI·플랫폼·ESG·빅데이터 등)를 덧붙여 커 보이게 하지 않는다. 할 수 있는 것·할 것·하고 싶은 것을 섞어 현재형으로 쓰지 않는다(계획은 '~하겠습니다').
- 과장 카피(최초·유일·최고·혁신·패러다임·완벽)는 자료에 근거가 있을 때만, 그리고 입증할 수 있는 구체적인 꼴로("국내 최초" → "○○ 기관 최초 적용 사례(2024)"처럼 범위·출처·시점을 붙여).
- 약속은 산출물·기한·수치로 쓴다 — "체계적으로 수행하겠습니다" 대신 "착수 2주 내 현황 분석 보고서, 6주 내 실행계획 제출", "기대효과" 대신 "민원 처리 시간 ○○% 단축(근거: …)". 수치가 자료에 없으면 '※ 보강 필요'로.
- title·message·content 에는 장표에 실제로 들어갈 글만 쓴다. "이 장표는 3개 기둥으로 도식화하면 좋다" 같은 만드는 사람을 위한 설명은 layout·scene 에만 쓴다.

분량 — 장 사이 밀도를 고르게(완성 장표는 거의 모든 본문 장이 '촘촘'하다. 어떤 장은 비고 어떤 장은 넘치면 실패):
- content 글자 수(공백 포함) 기준: 문제 제기·배경·현황 220~350자 / 전략·구성도·방법 350~550자 / 수행·관리·지원·일정 400~600자 / 마무리 150~300자.
- 600자를 넘으면 (1/2)(2/2) 로 나눈다. 기준보다 얇으면 자료에서 근거(항목·수치·이름·단계·산출물)를 더 찾아 채운다 — 그래도 없을 때만 '※ 보강 필요'.
- 한 장의 '※ 보강 필요'는 2개까지. 더 많으면 그 장의 구성(표·비교)을 아는 항목만으로 다시 짠다 — 칸 대부분이 빈 표는 만들지 않는다.

그 외 규칙:
- 장 수는 내용 분량에 맞춘다. 한 장에 글이 너무 많으면 (1/2)(2/2)로 나눈다. 표지·목차·간지는 사용자가 요청할 때만 넣는다.
- 문장은 짧게 줄여도 되지만 항목·수치·이름·단계를 빼면 안 된다.
- 연번·단계 표기는 1·2·3 (01·02 같은 앞자리 0 금지) — 앞자리 0은 근거 점검에서 오탐이 난다.
- type 은 카탈로그·D 덱 목록의 유형 이름에서, ref 는 D·B·C 덱에서 고른다(위 '장면·구성' 규칙대로 — 특정 장을 기본값으로 쓰지 않는다).
- 입력이 '## N쪽' 으로 나뉜 초안이면 그 장 구분을 따른다(합치거나 나눌 수도 있다).
- title·message·scene·layout 에는 마크다운 기호(**, #)를 쓰지 않는다. 강조할 단어는 그냥 쓴다.
- 참고 장의 장면을 그대로 복사하지 않는다. 이 장의 message 에 맞는 장면을 새로 짠다(참고는 문법만). 카탈로그·가이드에 적힌 예시는 여러 선택지 가운데 하나일 뿐, 정답 틀이 아니다.
- 모든 글은 한국어."""

IMAGE_TEMPLATE = """Body content area of a professional Korean public-sector SI proposal slide, 16:9, dense and precise. Korean language only; all text must be legible and use exactly these Korean strings (do not translate, do not invent extra text).

IMPORTANT — draw ONLY the body. Do NOT draw any top title band, header bar, breadcrumb, footer line, logos, page number or slide border: those are added afterwards at fixed positions. The reference image(s) may contain a header and footer — ignore those parts. There is NO headline in this image: keep the top 11% as empty plain background, then the content blocks start, on {style_bg} that reaches all four edges.

DECK TONE — this body slide belongs to the same deck as its cover, contents and divider pages: {deck_tone}. No night scenes, no dark rooms, no heavy saturated photos; callouts and speech bubbles (only when the content gives their exact words) use the accent color {accent} (never another pink or red).

{spec}

HEADLINE AREA: leave the TOP 11% of the image completely EMPTY — plain background only, no headline, no text, no shapes, no picture there. The headline is set afterwards in the real font at one fixed size on every slide. Start the content right below that strip.

MESSAGE FIRST — this is a message slide, not a picture: the main thing is the content below (situation, problems, numbers, evidence, conclusion) laid out as real text in cards, panels, tables, badges and bands. Pictures (people, photos, illustrations) only SUPPORT the message and together take no more than about 35% of the body area. Every text block of the content / wireframe must appear as readable text — never replace content with a picture or a speech bubble, never let a picture spread over the whole slide.

PURPOSE OF THIS SLIDE (guidance only — never print this sentence): {message}
Mood: {mood}
Scene (draw this — it is the point of the slide, not decoration): {scene}
Message device (the visual structure of this slide — build the slide around it, not around the reference's structure): {device}

{style_image}

CONTENT RULES (the DESIGN SYSTEM above sets every color, size, stroke, radius and spacing — do not invent other values): (the headline is NOT drawn — keep the top 11% empty). Never add numbers, times, durations or percentages that are not in the given text. Big–Middle–Small balance: one dominant element, a few secondary ones, small text — not many equal-weight boxes. Color levels: level 1 (primary) only for the single most important block, key numbers and the conclusion band; level 2 (secondary) for other headers, titles, icons and connectors; tints for large fills; grays for descriptions and borders — every slide shows these levels so the eye goes to level 1 first. Steps, phases and years go light → dark of the same blue (later = darker). Current/AS-IS sits in a smaller gray-headed panel (about 35% width), the proposed/TO-BE in a larger primary-headed panel (about 60%), joined by one big secondary-color arrow; the gap is called out once in the accent color. Evidence screens are real-looking generic UI screenshots in a device or window frame (a small red round '예시' badge when it is a draft screen). At most 5 columns; never cram a dense swimlane or document so small that text cannot be read. Inside cards that have an icon, the icon sits on the left and the title and description are left-aligned in one column next to it.

PICTURES ARE CUT OUT LATER — every illustration, icon, person, device or photo is cropped from this image and placed on the real slide, so: (1) text never overlaps a picture and a picture never covers text — keep a clear empty gap (at least 1.5% of the image width) between any picture and any text, label or caption; put labels beside or below a picture, not on top of it (a short label INSIDE a drawn screen or sign is fine); (2) pictures do not touch or cross card borders, other pictures, or the image edge — each one sits whole inside its own clear area; (3) small icons are simple, complete, and drawn large enough to stay sharp (no hairline strokes, nothing clipped); (4) a scene is built from SEPARATE objects (person, server, cloud, calendar, device…) standing apart with visible gaps so each can be cut out on its own — avoid one fused collage where objects overlap each other; connectors (arrows, dashed lines) run through the gaps, not across objects. Icon and its label sit on one row with their vertical centers aligned.
PICTURE FOCUS: in a scene the person and what they are doing is the clear main subject (largest, sharpest, best lit); devices and screens are few (at most two), smaller, softer and calmer in color so they do not compete — no walls of glowing monitors, no busy hologram clutter.
PEOPLE: correct anatomy — each person has exactly two arms and two hands; count them. If a person holds something with both hands, no third hand may appear on the head, face or anywhere else.

EVIDENCE: do not invent proof. No real company/agency logos, certificate or award images, signatures, stamps, news screenshots or app screenshots that look like real evidence unless the text below names them; where a screen is needed draw a clearly generic UI. No watermarks, no tool names, no captions about how the slide was made.

(The slide headline is added later by the layout engine — never write any headline, title sentence or summary sentence at the top.)
Layout: {layout}
{image_prompt}

Text content to place (Korean, keep every item, keep it compact):
{content}
"""


# ── 틀(머리 띠·바닥) — 모든 장에서 같은 위치·크기. 이미지 모델이 아니라 코드로 그린다 ──
# 캔버스 2400×1600 (3:2, 최종 장표 10.83×7.5in 에 맞춤). 장표 제작(prompt_design.md)의 치수와 같은 비율이다.
FRAME = {"w": 2400, "h": 1600, "head": 150, "foot": 96, "pad": 56}


def _font(size, bold=True, body=None):
    from PIL import ImageFont
    import fontset   # 장표와 같은 본문 서체(고른 서체의 4·2 단계)
    win = os.path.join(os.environ.get("WINDIR", "C:/Windows"), "Fonts")
    cjk = [fontset.INSTALLED.get(n) for n in (("noto sans cjk kr bold", "nanumgothic bold") if bold else ("noto sans cjk kr", "nanumgothic"))]   # 리눅스 대체
    for f in ((fontset.file(3, body), os.path.join(win, "malgunbd.ttf"), *cjk) if bold else (fontset.file(1, body), os.path.join(win, "malgun.ttf"), *cjk)):
        if not f:
            continue
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            continue
    return ImageFont.load_default()


def brand_logo(job, which):
    """작업에 올린 로고(client|vendor)를 받아 연다. 없으면 None"""
    from PIL import Image
    d = os.path.join(job.dir, "_brand")
    os.makedirs(d, exist_ok=True)
    for ext in (".png", ".jpg"):
        p = os.path.join(d, which + ext)
        if not os.path.isfile(p):
            try:
                W["download"](f"/worker/jobs/{job.id}/files/brand/{which}{ext}", p)
            except Exception:
                continue
        try:
            return Image.open(p).convert("RGBA")
        except Exception:
            pass
    return None


def compose_frame(job, body_png_path, s, project=""):
    """본문 이미지에 고정 머리 띠·바닥을 입혀 한 장으로. 반환: PIL.Image (RGB)"""
    from PIL import Image, ImageDraw
    F = FRAME
    fr = styles.frame(getattr(job, "style", None) or {}, getattr(job, "accent", ""))
    hx = lambda h: tuple(int(str(h)[i:i + 2], 16) for i in (0, 2, 4))
    cv = Image.new("RGB", (F["w"], F["h"]), hx(fr.get("bg", "FFFFFF")))   # 어두운 타입(C)은 바탕까지 그 색
    d = ImageDraw.Draw(cv)
    # 머리 띠 — 코발트 가로 그라데이션 (기준 덱 B 양식)
    fill = fr.get("fill") or ["1D4ED8", "3B82F6"]
    c1, c2 = hx(fill[0]), hx(fill[-1])
    if fr.get("head", "band") == "band":   # 꽉 찬 띠(가로 그라데이션)
        for x in range(F["w"]):
            t = x / F["w"]
            d.line([(x, 0), (x, F["head"])], fill=tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3)))
    else:   # 'line' — 흰 바탕 + 아래 가는 선(제목 글자는 타입 색)
        d.rectangle([0, F["head"] - 6, F["w"], F["head"]], fill=c1)
    sec = str(s.get("section") or "").strip()
    ch = str(s.get("chapter") or "").strip()
    if ch and sec.startswith(ch):   # 장 이름에 '·'가 있어도 장 이름째로(DCK-106)
        rest = section_sub(sec, ch)
        small, big = (ch, rest) if rest else ("", ch)
    else:
        parts = [p.strip() for p in re.split(r"\s+[·/|>]\s+", sec, 1)] if sec else [""]
        small, big = (parts[0], parts[1]) if len(parts) > 1 and parts[1] else ("", parts[0])
    if small:
        d.text((F["pad"], 26), small, font=_font(30, False, getattr(job, "font_body", None)), fill=hx(fr.get("small", "BFDBFE")))
    d.text((F["pad"], 66 if small else 46), big, font=_font(46, True, getattr(job, "font_body", None)), fill=hx(fr.get("title", "FFFFFF")))
    if project:
        f = _font(28, False, getattr(job, "font_body", None))
        d.text((F["w"] - F["pad"] - d.textlength(project, font=f), 60), project, font=f, fill=hx(fr.get("project", "DBEAFE")))
    # 본문 — 머리와 바닥 사이에 폭 맞춰 넣는다 (16:9 본문이 거의 딱 맞는다)
    body = Image.open(body_png_path).convert("RGB")
    bh = F["h"] - F["head"] - F["foot"]
    r = min(F["w"] / body.width, bh / body.height)
    body = body.resize((int(body.width * r), int(body.height * r)), Image.LANCZOS)
    cv.paste(body, ((F["w"] - body.width) // 2, F["head"] + (bh - body.height) // 2))
    # 바닥 — 얇은 선, 왼쪽 발주기관 로고, 가운데 쪽번호, 오른쪽 제안사 로고
    y0 = F["h"] - F["foot"]
    d.line([(F["pad"], y0), (F["w"] - F["pad"], y0)], fill=hx(fr.get("foot_line", "E5E7EB")), width=2)
    lh = 52
    for which, right in (("client", False), ("vendor", True)):
        lg = brand_logo(job, which)
        if lg is None:
            continue
        bb = lg.getbbox()
        if bb:
            lg = lg.crop(bb)
        lg = logo_horizontal(lg)   # 심볼 위·글자 아래 로고는 심볼 왼쪽·글자 오른쪽으로
        # 면적으로 맞춘다(가로형 5:1 로고면 높이 lh) — 발주기관 로고는 제안사 로고보다 15% 크게
        side = lh * 5 ** 0.5 * (1.15 if which == "client" else 1.0)
        r = side / (lg.width * lg.height) ** 0.5
        lg = lg.resize((max(1, int(lg.width * r)), max(1, int(lg.height * r))), Image.LANCZOS)
        if lg.height > F["foot"] - 16:
            lg = lg.resize((max(1, int(lg.width * (F["foot"] - 16) / lg.height)), F["foot"] - 16), Image.LANCZOS)
        if lg.width > 560:
            lg = lg.resize((560, max(1, int(lg.height * 560 / lg.width))), Image.LANCZOS)
        x = F["w"] - F["pad"] - lg.width if right else F["pad"]
        cv.paste(lg, (x, y0 + (F["foot"] - lg.height) // 2 + 2), lg)
    f = _font(26, False, getattr(job, "font_body", None))
    n = str(s.get("n", ""))
    d.text(((F["w"] - d.textlength(n, font=f)) / 2, y0 + 34), n, font=f, fill=hx(fr.get("page", "6B7280")))
    return cv


def doc_text(path):
    """맥락 자료(pdf·docx·hwpx·xlsx·pptx·md·txt)에서 글만 뽑는다. 실패하면 빈 문자열"""
    ext = os.path.splitext(path)[1].lower()
    try:
        if ext in (".md", ".txt", ".markdown", ".csv"):
            return open(path, encoding="utf-8", errors="replace").read()
        if ext == ".pdf":
            from pypdf import PdfReader
            return "\n".join((p.extract_text() or "") for p in PdfReader(path).pages)
        if ext == ".docx":
            import docx
            d = docx.Document(path)
            out = [p.text for p in d.paragraphs]
            for t in d.tables:
                for row in t.rows:
                    out.append(" | ".join(c.text.strip() for c in row.cells))
            return "\n".join(out)
        if ext == ".hwp":  # 구형 한글(5.x) — OLE 묶음 안 BodyText/Section* 의 문단 글(레코드 67)만. 한컴오피스 없이 읽는다
            import olefile, struct, zlib
            out = []
            with olefile.OleFileIO(path) as ole:
                packed = ole.openstream("FileHeader").read()[36] & 1
                secs = sorted((e for e in ole.listdir() if e[0] == "BodyText"), key=lambda e: int(re.sub(r"\D", "", e[1]) or 0))
                for e in secs:
                    data = ole.openstream(e).read()
                    if packed:
                        data = zlib.decompress(data, -15)
                    i = 0
                    while i + 4 <= len(data):
                        h = struct.unpack_from("<I", data, i)[0]
                        tag, size = h & 0x3FF, (h >> 20) & 0xFFF
                        i += 4
                        if size == 0xFFF:
                            size = struct.unpack_from("<I", data, i)[0]
                            i += 4
                        if tag == 67:
                            raw, t, k = data[i:i + size], [], 0
                            while k + 2 <= len(raw):
                                c = struct.unpack_from("<H", raw, k)[0]
                                if c in (1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23) or 4 <= c <= 9:   # 16바이트짜리 제어 문자
                                    k += 16
                                    continue
                                k += 2
                                if c >= 32:
                                    t.append(chr(c))
                                elif c in (10, 13):
                                    t.append("\n")
                                elif c == 9:
                                    t.append(" ")
                            # UTF-16 서러게이트 쌍은 한 글자로 합치고 짝 없는 조각은 버린다(그대로 두면 요청 글을 UTF-8 로 못 보낸다)
                            out.append("".join(t).encode("utf-16-le", "surrogatepass").decode("utf-16-le", "ignore"))
                        i += size
            return "\n".join(x for x in out if x.strip())
        if ext == ".hwpx":  # 한글 — zip 안의 section XML 에서 글만
            import zipfile
            from xml.etree import ElementTree as ET
            out = []
            with zipfile.ZipFile(path) as z:
                for n in sorted(x for x in z.namelist() if re.match(r"Contents/section\d+\.xml$", x)):
                    for el in ET.fromstring(z.read(n)).iter():
                        if el.tag.endswith("}t") and el.text:
                            out.append(el.text)
            return "\n".join(out)
        if ext == ".xlsx":
            import openpyxl
            wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
            out = []
            for ws in wb.worksheets:
                out.append(f"## 시트 {ws.title}")
                for row in ws.iter_rows(values_only=True):
                    cells = [str(c) for c in row if c is not None]
                    if cells:
                        out.append(" | ".join(cells))
            return "\n".join(out)
        if ext == ".pptx":
            return pptx_text(path)
    except Exception as e:
        W["log"]("자료 읽기 실패:", path, e)
    return ""


def load_context(job, limit=160000):
    """작업에 붙은 맥락 자료를 받아 글로 합친다. 너무 길면 자료별로 고르게 잘라 limit 안으로"""
    req, download = W["req"], W["download"]
    try:
        docs = req("GET", f"/worker/jobs/{job.id}/docs").get("data") or []
    except Exception as e:
        W["log"]("자료 목록 실패:", e)
        return ""
    if not docs:
        return ""
    job.doc_sig = ",".join(sorted(str(x["id"]) for x in docs))   # digest_context 가 이 PC 의 요약 사본이 지금 자료로 만든 것인지 본다
    d = os.path.join(job.dir, "_docs")
    os.makedirs(d, exist_ok=True)
    parts = []
    for doc in docs:
        p = os.path.join(d, doc["id"] + "_" + doc["name"])
        if not os.path.isfile(p):
            try:
                download(f"/worker/jobs/{job.id}/docs/{doc['id']}", p)
            except Exception as e:
                job.event(f"자료를 받지 못했습니다: {doc['name']} ({e})", "warn")
                continue
        t = re.sub(r"\n{3,}", "\n\n", doc_text(p)).strip()
        t = t.encode("utf-8", "ignore").decode("utf-8")   # 짝 없는 서러게이트 등 보낼 수 없는 글자 걸러내기(구형 hwp·깨진 pdf)
        if not t:
            job.event(f"자료에서 글을 읽지 못했습니다(스캔 PDF 이거나 지원하지 않는 형식): {doc['name']}", "warn")
            continue
        parts.append((doc["name"], t))
        job.event(f"맥락 자료 읽음 — {doc['name']} ({len(t):,}자)")
    if not parts:
        return ""
    per = max(8000, limit // len(parts))
    return "\n\n".join(f"## 자료: {n}\n{t[:per]}" + ("\n…(이하 생략)" if len(t) > per else "") for n, t in parts)


DIGEST_SYSTEM = """너는 공공 SI 제안 준비를 돕는 분석가다. 아래 자료(제안요청서·과업지시서·공고문·평가기준·회사소개·이전 제안서 등)를 읽고,
장표 기획자가 배경으로 쓸 **사업 요약**을 한국어 마크다운으로 만든다. 지어내지 말고 자료에 있는 것만. 수치·이름·기간·금액은 원문 그대로.

# 사업 개요 — 사업명, 발주기관, 기간, 예산, 대상 시스템·규모(사용자 수·연계 수 등)
# 배경과 문제 — 왜 이 사업을 하는가, 현재의 어려움
# 과업 범위·요구사항 — 요구사항 분류별 개수와 핵심 항목(번호·이름)
# 핵심 수치 — 발주처가 배경·현황·목표로 적은 수치 3~8개를 원문 문장 그대로(쪽수 있으면 함께). 발표 첫 장표가 이 수치를 되돌려준다
# 평가 기준 — 평가 항목·배점 표 (있으면 빠짐없이). 정량/정성 구분, 배점이 큰 순서. 배점 10점 이상 항목은 세부 '평가요소' 문구를 원문 그대로 적는다(목차 소제목으로 쓴다)
# 발표 규정 — 자료에 있는 것만, 없으면 '규정 없음(공고문 확인 필요)':
  - 발표 시간(발표·질의 분), 발표자(PM 직접 발표 의무 여부), 발표자료 분량 상한(장·쪽), 판형
  - 발표자료와 제안서의 관계(제안서 요약만 허용 / 제안서에 없는 내용 금지 / 효력 순위)
  - 금지 요소: 동영상·애니메이션, 회사명·로고(블라인드 평가), 회사 홍보·임원 인사
  - 작성 규정의 표현 제한(예: '할 수 있다'·'고려'·'검토' 같은 표현은 이행 불가로 간주)
# 사업 유형 — 다음 중 하나로 판정하고 근거 한 줄(요구사항 ID 분포·과업 내용으로): 정보시스템 구축 / 운영·유지관리 / 연구·용역·컨설팅 / 행사·홍보 / 물품·장비 / 소규모·단일 과업
# RFP 해독 — 장표 기획의 방향을 정하는 절. 자료에 근거가 있는 것만:
  - 배점 구조로 본 우선순위: 지면(장 수)을 어디에 가장 많이 써야 하는가 — 항목별 권장 비중(%)
  - 필수 요구사항(못 맞추면 탈락: 인증·실적·인력·제출 형식 등) 체크리스트 / 평가 요구사항(얼마나 잘하느냐로 점수가 갈리는 것)
  - 여러 곳에 반복해서 나오는 요구·키워드 → 발주처가 걱정하는 것(이전 사업에서 문제가 됐을 가능성)
  - 가점·감점 조건, 평가위원 구성 추정(기술 전문가 중심인가 관리자 중심인가)
  - 세 가지 답: ① 이 사업이 성공했을 때 발주처가 되고 싶은 상태 ② 배점이 큰 항목 가운데 제안사가 가장 강한 곳 ③ 대부분의 제안서가 형식적으로 다룰 것 같은 차별화 기회
# 제약·필수 조건 — 인력·보안·일정·산출물 등
# 제안사 정보 — 회사·컨소시엄·실적·인력·인증 (자료에 있으면)
# 이전 제안서의 흐름 — 장 구성과 각 장의 핵심 메시지·전략 이름, 그리고 장마다 항목명·수치·표(공정관리·성능 실측·장단점 비교 등)까지 (자료에 있으면)
# 용어 — 시스템·방법론 고유 명칭
# 확인 필요 — 자료 안에서 값이 서로 다른 곳(엄격한 쪽을 적고 둘 다 표기), 다른 사업에서 옮겨 온 흔적(다른 기관명·사업 유형과 맞지 않는 평가표), 판본이 여럿이면 어느 판을 기준으로 했는지

분량은 6,000~12,000자(넘기면 덜 중요한 절부터 줄여 맞춘다). 표가 맞으면 표로."""


def digest_context(job, raw):
    """긴 맥락 자료를 싼 모델로 한 번 요약한다. 요약본은 서버에 올려 두고 다시 쓴다(재기획·다시 만들기 때 또 돈 내지 않게)."""
    download, put_file = W["download"], W["put_file"]
    if len(raw) < 12000:  # 짧으면 그대로
        return raw
    p = os.path.join(job.dir, "_docs", "context.md")
    # 이 PC 사본은 만든 때의 자료 목록(context.sig)과 지금 목록이 같을 때만 쓴다 — 기획을 멈추고 회사소개서를 더했는데
    # 옛 요약을 그대로 써서 새 자료가 기획에 안 들어가던 것(2026-10-14). 서버 사본은 자료가 바뀔 때 서버가 지운다
    sig_p, sig = p + ".sig", getattr(job, "doc_sig", "")
    if os.path.isfile(p) and (not os.path.isfile(sig_p) or read(sig_p).strip() != sig):
        os.remove(p)
    if not os.path.isfile(p):
        try:
            download(f"/worker/jobs/{job.id}/files/mockup/context.md", p)
        except Exception:
            pass
    if os.path.isfile(p) and os.path.getsize(p) > 500:
        with open(sig_p, "w", encoding="utf-8") as f:
            f.write(sig)
        job.event("저장된 사업 요약을 씁니다 (자료를 다시 읽지 않음).")
        return read(p)
    before = job.spent
    job.event(f"맥락 자료 {len(raw):,}자를 요약하는 중")
    # 분량 — 원문이 클수록 넉넉히(17만 자를 1만 자로 줄이면 40장 기획이 요약 분량만큼만 채워진다)
    lo, hi = (6000, 12000) if len(raw) < 60000 else (12000, 24000) if len(raw) < 200000 else (18000, 32000)
    system = DIGEST_SYSTEM.replace("분량은 6,000~12,000자", f"분량은 {lo:,}~{hi:,}자")
    r = ai(job, "digest", {"messages": [{"role": "system", "content": system}, {"role": "user", "content": raw}],
                           "max_tokens": 20000 if hi <= 12000 else 45000, "temperature": 0.1})   # xhigh 추론 토큰까지 max_tokens를 먹으므로 여유
    text = text_of(r).strip()
    if len(text) < 500:
        raise RuntimeError("자료 요약이 비어 있습니다: " + text[:200])
    with open(p, "w", encoding="utf-8") as f:
        f.write(text)
    with open(p + ".sig", "w", encoding="utf-8") as f:
        f.write(getattr(job, "doc_sig", ""))
    put_file(job.id, "mockup", p, "context.md")
    job.event(f"사업 요약 완성 — {len(text):,}자, 비용 ${job.spent - before:.3f}. 기획에는 이 요약만 넣습니다.", "done")
    return text


def parse_plan_md(md):
    """powerDeck 이 내려준 '기획 (.md)' 형식이면 AI 없이 그대로 기획으로 읽는다. 아니면 None.
    형식:  # 덱 제목 / ## N. 장 제목 / - **장**: … · **유형**: … · **분위기**: … · **참고**: B07, C08
           - **전달할 것**: … / - **장면**: … / - **구성**: … / - **강조**: … / ### 내용 / (글) / ### 의견 (무시)"""
    heads = list(re.finditer(r"^##\s+(\d+)\.\s+(.+?)\s*$", md, re.M))
    if not heads or "### 내용" not in md:
        return None
    t = re.search(r"^#\s+(.+?)\s*$", md, re.M)
    slides = []
    for i, h in enumerate(heads):
        block = md[h.end():heads[i + 1].start() if i + 1 < len(heads) else len(md)]
        def field(name):
            m = re.search(r"\*\*" + name + r"\*\*\s*:\s*(.+?)(?=\s+·\s+\*\*|\s*$)", block, re.M)
            return m.group(1).strip() if m else ""
        cm = re.search(r"^###\s*내용\s*$(.*?)(?=^###\s|\Z)", block, re.M | re.S)
        content = (cm.group(1) if cm else "").strip()
        if not content:
            continue
        ref = [fmt_ref(d, n) for d, n in (parse_ref(x) for x in re.split(r"[,\s]+", field("참고"))) if d] if field("참고") else []
        wire = []   # ### 배치 — '- 종류 x,y,w,h | 제목 | 글1 / 글2'
        wm = re.search(r"^###\s*배치\s*$(.*?)(?=^###\s|\Z)", block, re.M | re.S)
        for ln in (wm.group(1).splitlines() if wm else []):
            mm = re.match(r"^\s*-\s*(\w+)\s+([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\|\s*([^|]*?)\s*(?:\|\s*(.*))?$", ln)
            if mm:
                wire.append({"k": mm.group(1), "x": mm.group(2), "y": mm.group(3), "w": mm.group(4), "h": mm.group(5), "t": mm.group(6),
                             "d": "\n".join(x.strip() for x in (mm.group(7) or "").split(" / ") if x.strip())})
        dash = lambda v: "" if v in ("—", "-") else v
        slides.append({"n": len(slides) + 1, "title": h.group(2).strip(), "keyword": dash(field("강조")), "device": dash(field("장치")), "section": dash(field("장")), "type": dash(field("유형")), "mood": dash(field("분위기")),
                       "ref": ref[:2], "message": field("전달할 것"), "scene": field("장면"), "layout": field("구성"), "content": content, "image_prompt": "", "wire": wire})
    if not slides:
        return None
    return {"title": t.group(1).strip() if t else "", "slides": slides}


OUTLINE_SYSTEM = """너는 공공 SI 제안서의 총괄 기획자다. 장표가 많은 덱의 **개요**만 먼저 짠다 — 장(章) 구성, 장마다 장표 수와 각 장표가 말할 것.
반드시 아래 JSON 하나만 출력한다(설명·코드펜스 없이).

{"title": "덱 제목", "slogan": "표지 사업명 바로 위에 작게 찍는 키메시지 한 줄 — 공백 포함 12~22자, 사업이 지향하는 모습을 '…을 위한'·'…으로' 꼴로(예: '스마트한 도시, 더 안전한 내일을 위한'). 사업명 낱말을 되풀이하지 않는다", "core": "이 제안 전체를 한 문장으로", "chapters": [
  {"no": 1, "name": "장 이름(짧게, 예: 사업 이해)", "eval": "이 장이 답하는 평가 항목과 배점(자료에 있으면)", "goal": "이 장이 심사위원에게 남길 한 문장(기획 메모 — 화면에 안 나감)", "promise": "간지에 찍히는 약속 한 줄(아래 간지 규칙)",
   "slides": [{"title": "헤드라인 초안 — 주장 한 문장", "message": "전달할 것 한 문장", "mood": "문제 제기 | 배경·현황 | 해결·제안 | 절차·방법 | 성과·증명 | 조직·인력 | 마무리",
               "density": "보통 | 촘촘", "sources": "자료에서 이 장에 쓸 근거 키워드 3~6개(항목명·수치·시스템 이름, 쉼표로)"}]}
]}

실제 제안 장표(30장 이상 덱)에서 배운 구성 규칙:
- 장(章)은 4~6개(아무리 많아도 7개). 예: Ⅰ 사업 이해 → Ⅱ 추진 전략 → Ⅲ 기술·기능 방안(가장 큼) → Ⅳ 사업 관리 → Ⅴ 지원 방안 → 맺음. 시스템·포털이 여럿이어도 한 장 안의 절로 묶는다.
- 장마다 장표 수는 평가 배점 비중대로 나눈다(배점이 큰 장이 가장 길다). 사업 이해는 전체의 15% 안팎 — 배점이 작은데 길게 쓰지 않는다. 배점 항목(품질보증·보안·비상대책·하도급·상생협력 등)이 있으면 빠짐없이 어느 장엔가 장표를 둔다.
- 배점 상위 3개 항목에는 각각 장표 2장 이상. 배점 10점 이상 항목은 사업 요약의 '평가요소' 문구를 장표 제목·절 이름에 그대로 살려, 위원이 채점표와 장표를 1:1로 맞춰 볼 수 있게 한다(장 이름·순서는 평가 항목 순서를 따른다).
- 첫 장(사업 이해)의 첫 장표는 발주처가 자료에 적은 '핵심 수치' 3~4개를 그대로 되돌려주며 문제를 짚는다. 그다음 장표가 문제 → 개선 방향 → 목표 모습(구성도)을 보인다.
- 사업 요약의 '사업 유형'에 맞춰 중심을 둔다: 구축 = 목표 시스템 구성·기능·데이터·이행 / 운영·유지관리 = 현행 진단·SLA·장애 대응·인력 / 연구·용역 = 연구 방법·추진 절차·성과 활용 / 행사·홍보 = 콘셉트·프로그램·홍보·운영 / 물품 = 규격 충족·납품·설치·하자 보수.
- 같은 장 이름은 한 번만 — 같은 주제는 한 장 안에 이어 붙인다(떨어뜨리지 않는다).
- 장의 첫 장표는 그 장의 핵심 주장(전략 장이면 '고민 → 핵심 성공 요소 → 전략'), 이후 장표가 그것을 증명한다. 무거운 주제는 (1/2)(2/2) 연속 장으로 나눠 1/2 는 구조·도식, 2/2 는 실제 화면·절차.
- 이야기 순서: 상황·문제 → 목표·전략 → 기술·기능 → 관리·지원 → 약속. 장표 제목만 넘겨 읽어도 이어져야 한다.
- 장표마다 분량이 고르게 — 근거가 모자란 주제는 장표를 따로 만들지 말고 가까운 장표에 합친다(빈 장표를 만들지 않는다).
- 수치·이름은 자료에 있는 것만. 지어내지 않는다.
- promise = 그 장 간지(장 표지)에 장 이름 아래 그대로 찍히는 **약속 한 줄**이다. 회사 발표자료 템플릿의 문법: "사업의 이해 — 정확하게 알고 있습니다!", "수행 전략 — 치밀하게 준비했습니다!", "끝까지 책임을 다하겠습니다". 제안사가 위원에게 말하는 1인칭 존댓말(~습니다! / ~하겠습니다), 8~20자, 한 줄, 그 장의 핵심어 하나를 **이렇게** 강조. 수치를 늘어놓거나 '~을 보인다·~을 준다·~을 못 박는다·~을 증명한다'처럼 기획자가 자기에게 쓴 메모 말투는 금지(goal 과 다르게 쓴다)."""

OUTLINE_TASK = """# 이번 요청 — 개요만
위 내용·자료로 본문 {want}의 개요를 짠다. 장(章) 4~6개, 장마다 장표 목록(title·message·mood·density·sources). 상세 글(content)은 다음 단계에서 쓴다."""


def par(job, cli, api):
    """동시에 돌릴 AI 호출 수 — 구독(CLI)은 PC 의 Claude 개수(cli_max)에 묶이고, OpenRouter 는 넓게(설정 api_parallel 로 바꿀 수 있다)"""
    if getattr(job, "text_engine", "cli") == "cli":
        return cli
    return max(1, int(W["CFG"].get("api_parallel", api)))


def _plan_call(job, system, user, tokens, what="기획", timeout=320, retry_timeout=True):
    """기획 AI 한 번 — JSON 이 깨지거나 길이 초과면 지시를 덧붙이고 토큰을 늘려 한 번 더.
    OpenRouter 가 시간 안에 답을 못 하면(502·timed out) 한 번 더 — 대개 그 한 번이 걸린 것이다(retry_timeout)"""
    for attempt in range(2):
        try:
            r = ai(job, "plan", {"messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                                 "max_tokens": tokens, "temperature": 0.3}, timeout=timeout)
        except (RuntimeError, OSError) as e:   # OSError = 엔진↔서버 연결 시간 초과
            if attempt or not retry_timeout or not re.search(r"\(50[234]\)|timed out|timeout", str(e), re.I):
                raise
            job.event(f"{what} — AI 가 시간 안에 답하지 않아 한 번 더 요청합니다", "warn")
            continue
        try:
            if (r.get("choices") or [{}])[0].get("finish_reason") == "length":
                raise RuntimeError("최대 토큰을 다 써서 응답이 잘렸다")
            return parse_json(text_of(r))
        except Exception as e:
            job.event(f"{what} 요청 실패(다시 요청합니다): {str(e)[:120]}", "warn")
            try:   # 깨진 응답 원문을 남긴다 — 어디서 깨졌는지 봐야 복구 규칙을 더한다(세로 제안서 장 2개가 통째로 빠짐, 2026-10-14)
                d = os.path.join(job.dir, "_mockup")
                os.makedirs(d, exist_ok=True)
                open(os.path.join(d, f"fail-{re.sub(r'[^0-9A-Za-z가-힣]+', '_', what)[:40]}-{attempt}.txt"), "w", encoding="utf-8").write(
                    f"{e}\n\n" + text_of(r))
            except Exception:
                pass
            if attempt:
                raise
            tokens = int(tokens * 1.5)
            user += "\n\n# 앞 응답은 실패했다(JSON 파싱 실패 또는 길이 초과). JSON 문자열 안에는 실제 줄바꿈·탭·제어문자를 쓰지 말고 \\n·\\t 로 이스케이프하고, 글 속 따옴표는 큰따옴표 대신 「」나 ‘’를 쓰고, 항목 사이 쉼표를 빠뜨리지 말고, 설명 없이 JSON 만 출력한다."


def _excerpts(raw, keys, limit=7000):
    """원문에서 키워드 둘레만 잘라 붙인다 — 요약에서 빠진 근거(표·수치·절차)를 상세 기획이 다시 볼 수 있게"""
    if not raw or not keys:
        return ""
    out, seen, used = [], set(), 0
    for k in keys:
        k = k.strip()
        if len(k) < 2:
            continue
        for m in list(re.finditer(re.escape(k), raw))[:2]:
            a = max(0, m.start() - 350)
            if any(abs(a - x) < 500 for x in seen):
                continue
            seen.add(a)
            seg = raw[a:m.end() + 450].replace("\n\n", "\n")
            out.append(f"…{seg}…")
            used += len(seg)
            if used > limit:
                return "\n---\n".join(out)
    return "\n---\n".join(out)


def _eff_len(s):
    """시안에 실제로 찍히는 content 분량 — '※ 보강 필요' 줄을 뺀 글자 수와 보강 줄 수"""
    lines = str(s.get("content") or "").splitlines()
    bg = sum(1 for l in lines if "보강 필요" in l)
    return sum(len(l.strip()) for l in lines if l.strip() and "보강 필요" not in l), bg


def section_sub(sec, ch):
    """절 이름에서 장(章) 이름을 떼고 남은 꼬리만. 장 이름 자체에 '·'가 들어 있어도(예: '기술·기능 방안')
    중복으로 붙지 않게 — 앞에 붙은 장 이름은 몇 번이 겹쳐 있든 모두 뗀다(DCK-106, 2026-10-10)."""
    sec, ch = str(sec or "").strip(), str(ch or "").strip()
    if not sec:
        return ""
    if ch:
        while sec.startswith(ch):
            rest = sec[len(ch):]
            if rest and not re.match(r"^\s*[·:|\-–—]", rest):
                break                      # '기술·기능 방안가' 같은 다른 낱말이면 떼지 않는다
            sec = re.sub(r"^\s*[·:|\-–—]?\s*", "", rest)
        # 띄어 쓴 구분자(' · ')로 나뉜 조각 중 장 이름과 같은 조각도 버린다
        parts = [p.strip() for p in re.split(r"\s+·\s+", sec) if p.strip() and p.strip() != ch]
        sec = " · ".join(parts)
    return sec


def plan_in_stages(job, system, base_user, slide_count, raw):
    """장표가 많은 덱 — ① 개요(장 4~6개·장별 장표 수·장표마다 말할 것)를 짜서 코드로 검증 → ② 8장씩 묶어 동시에 상세 기획
    (묶음마다 개요 전체 + 그 장표들에 관련된 원문 발췌) → ③ 얇거나 '보강 필요'가 많은 장만 원문 발췌를 붙여 다시"""
    from concurrent.futures import ThreadPoolExecutor
    NL = chr(10)
    want = f"{slide_count}장" if slide_count else "내용 분량에 맞는 장 수(자료가 많으면 30~40장)"
    ou = base_user + NL * 2 + OUTLINE_TASK.replace("{want}", want)
    job.event(f"기획 1단계 — 개요(장 구성·장별 배분)를 먼저 짭니다 · 본문 {want}")
    outline, chs = None, []
    for attempt in range(3):
        o = _plan_call(job, OUTLINE_SYSTEM, ou, 14000, "개요")
        chs = [c for c in (o.get("chapters") or []) if isinstance(c, dict) and [x for x in (c.get("slides") or []) if isinstance(x, dict)]]
        names = [str(c.get("name") or "").strip() for c in chs]
        total = sum(len(c["slides"]) for c in chs)
        bad = []
        if not 3 <= len(chs) <= 7:
            bad.append(f"장(章)이 {len(chs)}개다 — 4~6개로 묶는다")
        if len(set(names)) != len(names):
            bad.append("같은 장 이름이 두 번 나온다 — 한 장으로 이어 붙인다")
        if slide_count and abs(total - slide_count) > max(2, slide_count // 10):
            bad.append(f"본문이 {total}장이다 — {slide_count}장에 맞춘다")
        outline = o
        if not bad:
            break
        job.event("개요를 다시 짭니다 — " + " / ".join(bad), "warn")
        ou += NL * 2 + "# 앞 개요의 문제 — 고쳐서 다시: " + " / ".join(bad)
    if not chs:
        raise RuntimeError("기획 개요에 장이 없습니다.")
    rows = []   # (쪽, 장 이름, 개요 한 장)
    for c in chs:
        for x in c["slides"]:
            if isinstance(x, dict):
                rows.append((len(rows) + 1, str(c.get("name") or "본문").strip(), x))
    job.event("개요 완료 — 장 " + str(len(chs)) + "개 · 본문 " + str(len(rows)) + "장: " + ", ".join(f"{c.get('name')} {len(c['slides'])}장" for c in chs), "done")
    otext = "# 확정된 개요 — 장 구성과 장표 순서는 이대로(바꾸지 않는다)" + NL + f"core: {outline.get('core', '')}" + NL + NL.join(
        (f"## {c.get('no', i + 1)}. {c.get('name')} — {c.get('goal', '')} (평가: {c.get('eval', '')})" + NL +
         NL.join(f"- {n}쪽: {x.get('title', '')} — {x.get('message', '')} [{x.get('mood', '')}·{x.get('density', '')}]" for n, ch, x in rows if ch == str(c.get('name') or '본문').strip()))
        for i, c in enumerate(chs))
    by_n = {n: (ch, x) for n, ch, x in rows}

    def detail(ns, extra="", timeout=320, retry=True):
        keys = [k for n in ns for k in re.split(r"[,，·/]", str(by_n[n][1].get("sources") or ""))]
        ex = _excerpts(raw, keys)
        task = (f"# 이번 요청 — 위 개요의 {ns[0]}~{ns[-1]}쪽({len(ns)}장)만 상세 기획한다\n"
                f"- n 은 개요의 쪽 번호 그대로. section 은 '장 이름 · 절 이름' — 장 이름은 개요 그대로(" + ", ".join(sorted({by_n[n][0] for n in ns})) + ").\n"
                "- title·message 는 개요를 다듬어 쓴다(주장은 바꾸지 않는다). 앞뒤 장과 겹치지 않게, 분량 기준(문제 제기 220~350자 · 전략·방법 350~550자 · 수행·관리 400~600자)을 지킨다.\n"
                "- 근거는 맥락 자료와 아래 원문 발췌에서 찾는다. 장마다 장치(device)를 서로 다르게.\n" + extra)
        u = base_user + NL * 2 + otext + NL * 2 + task + (NL + "# 원문 발췌 — 요약에서 빠졌을 수 있는 근거\n" + ex if ex else "")
        got = _plan_call(job, system, u, 3000 + 1700 * len(ns), f"{ns[0]}~{ns[-1]}쪽 상세 기획", timeout=timeout, retry_timeout=retry)
        return {int(x.get("n") or 0): x for x in (got.get("slides") or []) if isinstance(x, dict)}

    groups = [list(range(i, min(i + 8, len(rows) + 1))) for i in range(1, len(rows) + 1, 8)]
    job.event(f"기획 2단계 — {len(rows)}장을 {len(groups)}묶음(8장씩)으로 동시에 상세 기획합니다")
    det = {}
    with ThreadPoolExecutor(max_workers=min(par(job, 3, 6), len(groups))) as ex:   # OpenRouter 면 묶음 전부 동시에(37장 = 5묶음이 3개씩 2바퀴였다)
        for g, f in [(g, ex.submit(detail, g)) for g in groups]:
            try:
                det.update(f.result())
            except Cancelled:
                raise
            except Exception as e:
                job.event(f"{g[0]}~{g[-1]}쪽 상세 기획 실패 — 한 번 더: {str(e)[:100]}", "warn")
                det.update(detail(g))
    slides = []
    for n, ch, x in rows:
        s = det.get(n) or {"title": x.get("title", ""), "message": x.get("message", ""), "mood": x.get("mood", ""),
                           "content": "※ 보강 필요: 이 장의 상세 기획이 비었습니다 — 시안 확인에서 내용을 채워 주세요", "type": "", "device": "", "scene": "", "layout": ""}
        sub = section_sub(s.get("section"), ch)
        s["chapter"], s["section"] = ch, f"{ch} · {sub}" if sub else ch
        s["n"] = n
        slides.append(s)
    # ③ 얇은 장·'보강 필요'가 많은 장 — 원문 발췌를 붙여 그 장만 다시
    effs = sorted(_eff_len(s)[0] for s in slides)
    med = effs[len(effs) // 2] if effs else 0
    weak = [s["n"] for s in slides if _eff_len(s)[0] < med * 0.6 or _eff_len(s)[1] >= 4][:10]
    if weak:
        job.event(f"기획 3단계 — 얇거나 보강이 많은 {len(weak)}장({', '.join(str(n) + '쪽' for n in weak)})을 원문에서 근거를 찾아 다시 씁니다")
        try:
            again = detail(weak, f"- 이 장들은 앞 기획에서 content 가 얇거나 '※ 보강 필요'가 많았다(중앙값 {med}자). 원문 발췌에서 근거를 찾아 분량 기준까지 채운다. "
                                 "끝내 근거가 없으면 표·비교 대신 아는 항목만으로 구성을 바꾸고, 보강 필요는 장마다 2개까지.\n",
                           timeout=170, retry=False)   # 선택 단계 — 2분 반 안에 못 오면 앞 기획 그대로(예전엔 5분 기다렸다 실패, 2026-10-07)
            for s in slides:
                y = again.get(s["n"])
                if y and _eff_len(y)[0] > _eff_len(s)[0]:
                    y["chapter"], y["section"], y["n"] = s["chapter"], s["section"], s["n"]
                    slides[s["n"] - 1] = y
        except Cancelled:
            raise
        except Exception as e:
            job.event(f"얇은 장 다시 쓰기 실패 — 앞 기획을 그대로 씁니다: {str(e)[:100]}", "warn")
    # 장(章)마다 핵심 한 줄 — 간지의 설명 문구가 된다(장표 제목을 늘어놓지 않는다)
    chapters = [{"name": str(c.get("name") or "본문").strip(), "goal": str(c.get("goal") or "").strip(), "promise": str(c.get("promise") or "").strip()} for c in chs]
    return {"title": outline.get("title") or "", "slogan": str(outline.get("slogan") or "").strip(), "core": outline.get("core") or "", "chapters": chapters, "slides": slides}


PURPOSE = {
    "submit": "제출용 — 평가위원이 혼자 읽고 점수를 매기는 자료다. RFP 과업 순서를 따라 평가 항목마다 빠짐없이 답하고, 근거(표·수치·산출물)를 촘촘히 담는다.",
    "present": ("발표용 — 제한된 시간에 '왜 우리를 골라야 하는지'를 남기는 자료다. 제출용의 요약본이 아니다. 듣는 흐름(과업 이해 → 발주처의 진짜 고민 → 해결 방식 → 왜 우리인가)으로 다시 짜고, "
                "한 장에 메시지 하나, 긴 설명은 짧은 리드 메시지로, 표는 도식(로드맵·역할 구조도·Before/After)으로 바꾼다. 세부 설명은 발표자의 말(발표 대본)로 넘기고 화면에는 핵심 메시지와 근거만. "
                "장 수는 한 장에 60~80초 — 발표 10분 8~10장, 15분 12~15장, 20분 15~18장, 25~30분 18~24장 안팎. 사업 요약의 '발표 규정'에 분량 상한이 있으면 그 값을 넘지 않는다. "
                "발표 규정이 금지한 요소(동영상, 블라인드 평가의 회사명·로고, 회사 홍보)는 넣지 않고, 제안서에 없는 새 내용을 만들지 않는다."),
}


def make_plan(job, brief, note, context="", slide_count=0, purpose="present", raw=""):
    if slide_count:
        note = (note + "\n" if note else "") + f"장 수: 정확히 {slide_count}장으로 만든다."
    cat = read(os.path.join(ref_dir(), "mockups", "CATALOG.md"), 40000)
    cat += "\n\n" + read(os.path.join(ref_dir(), "mockups", "CATALOG-D.md"), 24000)   # D 덱 — 실제 장표 540장의 유형별 헤드라인 목록
    guide = read(os.path.join(ref_dir(), "guide", "공용디자인가이드.md"), 20000)
    learned = read(os.path.join(ref_dir(), "guide", "학습-컨텐츠모음.md"), 20000)   # 실제 장표 540장을 보고 배운 규칙(learn_refs.py)
    if learned:
        guide += "\n\n# 실제 장표 540장에서 배운 것 — 헤드라인·레이아웃 문법·메시지 장치는 이것을 따른다\n" + learned
    ctx = ""
    if context:
        ctx = ("# 맥락 자료 (제안요청서·과업지시서·평가기준·회사소개 등 — 장표에 그대로 넣는 글이 아니라 배경이다)\n"
               "여기서 사업명·발주기관·핵심 요구사항·평가 항목과 배점·용어·제약을 파악해 장의 메시지와 강조점을 정한다. "
               "장마다 답하는 평가 항목명 원문(배점표의 이름 그대로)을 그 장의 title 이나 section 에 쓴다 — 위원이 채점표와 장표를 1:1 로 맞춰 본다. "
               "message 는 '…평가에 답합니다'·'…요구에 부응합니다' 같은 되받기로 끝내지 말고 산출물·수치·기한으로 끝낸다. "
               "첫 본문 장은 발주처가 쓴 핵심 수치 2개 이상(예산·대상 규모·처리 건수 등)을 원문 그대로 되돌려 준다. 내용에 없는데 자료상 꼭 필요한 항목이 있으면 그 장의 content 끝에 "
               "'※ 보강 필요: …' 로 적는다(지어내지 않는다).\n\n" + context + "\n\n")
    if len(brief.strip()) < 20:
        if not context:
            raise RuntimeError("장표에 담을 내용도 맥락 자료도 없습니다.")
        brief = ("(사용자가 내용을 주지 않았다. 맥락 자료만 보고 이 제안의 핵심을 보여줄 장을 네가 잡아라 — 요청 사항에 장 수가 없으면 5장: "
                 "문제 제기 1~2장 → 목표·방향 1장 → 핵심 전략 1~2장 → 수행·관리 1장. 내용은 자료에서만 가져오고, 자료에 없는 수치·이름은 만들지 않는다. "
                 "이 결과는 사용자가 보고 내용을 다듬어 본 작업을 시작하기 위한 '초안 제안'이다.)")
    st = getattr(job, "style", None) or {}
    type_rule = (f"# 덱의 톤 — 본문은 표지·목차·간지와 한 덱\n이 작업의 강조색은 {getattr(job, 'accent', '') or '#FF2A6D'} 이다. scene·layout·image_prompt 에 색을 적을 때는 '강조색'이라고만 쓰고 분홍·빨강 같은 다른 색 이름을 짓지 않는다. "
                 "본문 장면의 밝기·색감은 표지·목차·간지와 같게 — 밝고 맑은 낮 톤, 흰 바탕에 코발트·스카이. 야간·어두운 실내·짙은 사진 장면을 적지 않는다.\n\n")
    if st.get("body_point"):   # 본문은 A 타입 공통 — 컨셉마다 작은 포인트 하나만
        type_rule += f"# 디자인 컨셉 포인트 — {st.get('name', '')}\n본문은 위 가이드(공통) 그대로 기획한다. 다만 이 포인트 하나를 어울리는 장에만 가볍게 반영한다(모든 장에 억지로 넣지 않는다): {st['body_point']}\n\n"
    if st.get("plan"):   # 타입 A 가 아닌 디자인 타입 — 장면·구성·장치를 그 타입답게(학습 가이드의 클레이 인물 장면을 그대로 쓰지 않는다)
        cat_t = styles.catalog_text(st["id"])
        type_rule += (f"# 디자인 타입 — {st.get('name', '')} (이 규칙이 학습 가이드의 장면·장치보다 먼저다)\n{st['plan']}\n\n"
                     + (f"## 타입 가이드 — 실제 장표를 재서 정리한 문법. 바탕은 공공 SI 제안서 그대로, 표현만 이 문법으로\n{styles.guide(st['id'])}\n\n" if styles.guide(st["id"]) else "")
                     + (f"## 이 타입의 본문 참고 장 — 장마다 가장 가까운 것 하나를 골라 그 번호를 slide 의 \"sref\" 에 숫자로 적는다(ref 는 빈 배열 []). "
                        f"layout·scene·image_prompt 도 고른 장의 구성을 바탕으로 쓴다. 같은 번호만 되풀이하지 말고 장의 내용에 맞게 고른다.\n{cat_t}\n\n" if cat_t else "")
                     +
                     f"이 작업의 강조색은 {getattr(job, 'accent', '') or '#FF2A6D'} 이다. scene·layout·image_prompt 에 색을 적을 때는 '강조색'이라고만 쓰고, 코발트·파랑 같은 다른 색 이름을 지어내지 않는다"
                     + ("(이 타입은 색을 쓰는 곳이 모두 강조색 한 가지다 — 다른 원색을 더하지 않는다).\n" if st.get("accent_main") else ".\n") +
                     "device·scene·layout·image_prompt 를 이 타입의 표현으로 쓴다. 학습 가이드의 '고민하는 인물 + 말풍선' 같은 클레이 인물 장치는 이 타입에 맞는 장치(수치·도식·사진·색 면)로 바꾼다.\n\n")
    user = (f"# 디자인 가이드\n{guide}\n\n# 기준 시안 카탈로그\n{cat}\n\n{ctx}{type_rule}"
            f"# 사용자 요청 사항\n{note or '(없음)'}\n\n# 장표에 담을 내용\n{brief}\n\n"
            "# 다시 — 장마다 message·mood·device·scene 을 먼저 정하고, 내용을 카드로 늘어놓는 구성은 쓰지 않는다. "
            "장치·참고 장은 학습한 실제 장표(D 덱·학습 가이드)에서 이 장의 내용에 맞게 고르고, 장마다 다르게.")
    system = PLAN_SYSTEM.replace("{purpose}", PURPOSE.get(purpose, PURPOSE["present"]))
    # 장표가 많으면(13장 이상, 또는 '알아서'인데 자료가 많으면) 개요 → 8장씩 상세 → 얇은 장 다시. 한 번에 40장을 쓰면 뒤로 갈수록 얇아지고 장 구성이 흐트러진다
    big = slide_count >= 13 or (not slide_count and len(brief) + len(context or "") > 15000)
    if big:
        plan = plan_in_stages(job, system, user, slide_count, raw or context or "")
    else:
        plan = _plan_call(job, system, user, 16000)
    slides = []
    for i, s in enumerate(plan.get("slides") or [], 1):
        s["n"] = i
        s.setdefault("ref", [])
        s["ref"] = [fmt_ref(d, n) for d, n in (parse_ref(x) for x in (s["ref"] or [])) if d][:2]
        slides.append(s)
    if not slides:
        raise RuntimeError("기획 결과에 장이 없습니다.")
    for s in slides:
        s["wire"] = clean_wire(s.get("wire"))
    seen_ch, prev_ch, split_ch = set(), None, set()
    for s in slides:   # 같은 장(章)이 떨어져 나오면 목차·간지가 둘로 갈린다
        ch = str(s.get("chapter") or str(s.get("section") or "").split(" · ")[0]).strip()
        if ch != prev_ch and ch in seen_ch:
            split_ch.add(ch)
        seen_ch.add(ch)
        prev_ch = ch
    if split_ch:
        job.event(f"같은 장(章)이 떨어져 있습니다: {', '.join(sorted(split_ch))} — 목차·간지가 둘로 나뉩니다. 시안 확인에서 장 순서를 확인해 주세요.", "warn")
    devs = [str(s.get("device") or "").strip() for s in slides]
    dup = sorted({d for d in devs if d and devs.count(d) > 1})
    if dup:
        job.event(f"기획에서 같은 메시지 장치를 여러 장에 썼습니다: {', '.join(dup)} — 시안 확인에서 구성을 바꿔 다시 만들 수 있습니다.", "warn")
    plan["slides"] = slides
    return plan


WIRE_KINDS = ("panel", "card", "person", "image", "screen", "chart", "table", "flow", "map", "badge", "band", "text", "gantt", "phase", "kpi",
              "fishbone", "hub", "pyramid", "matrix", "funnel", "cycle", "venn", "roadmap", "isostack", "gauge", "proportion",
              "converge", "ridge", "petal", "stage")   # 2026-10-14 원본 대조 확장 — 수렴-확산·능선 연혁·꽃잎 전략·플랫폼 무대
# 서버가 직접 그리는 도식 틀(2026-10-12 PPT 레퍼런스 학습) — 피시본·허브·피라미드·2×2, 이어서 퍼널·순환·벤·로드맵·층 쌓기·게이지·비율 막대.
# 글 형식은 prompt_wire.md 와 같다. 오르는 계단은 phase 가 이미 그린다(따로 두지 않음)


def _cells(l):
    return [c.strip() for c in l.strip().strip("|").split("|")]


def wire_gantt(d):
    """gantt 글 → (기간 머리, [(활동, 시작, 끝, 막대 글)], [(마일스톤, 칸)]) — 칸은 0부터. 첫 줄 '구분 | M | M+1 …'"""
    lines = [l for l in str(d or "").splitlines() if l.strip()]
    if not lines:
        return [], [], []
    head = _cells(lines[0])[1:]
    rows, pins = [], []
    for l in lines[1:]:
        c = _cells(l)
        m = re.match(r"^\s*(\d+)\s*(?:[-~–]\s*(\d+))?\s*$", c[1]) if len(c) > 1 else None
        if not m:
            continue
        a = int(m.group(1)) - 1
        b = int(m.group(2) or m.group(1)) - 1
        if c[0].startswith("◆"):
            pins.append((c[0].lstrip("◆ ").strip(), a))
        else:
            rows.append((c[0], a, max(a, b), c[2] if len(c) > 2 else ""))
    return head, rows, pins


# 그림 지시 줄 — 무엇을 그릴지(이미지 모델용). 장 위에 글로 찍지 않는다. 영어 작업은 Figure:·Scene:·Picture: 로 온다,
# 말풍선 문구(말풍선:·Bubble:)도 그림의 일부라 글 줄에서 뺀다
PIC_LINE = re.compile(r"^\s*(그림|장면|삽화|말풍선|figure|scene|picture|image|illustration|photo|drawing|bubble|speech bubble)\s*[:：]\s*", re.I)


def wire_steps(d):
    """flow·phase 글 → [(단계, 설명)] — 줄마다 '단계: 설명'"""
    out = []
    for l in str(d or "").splitlines():
        l = re.sub(r"^\s*([-•]|\d+[.)])\s*", "", l).strip()
        if l:
            t, _, x = l.partition(":") if ":" in l else l.partition("：")
            out.append((t.strip(), x.strip()))
    return out


SOURCE_LINE = re.compile(r"^\s*[-•]?\s*(출처|자료)\s*[:：]\s*(.+)$")


def wire_kpis(d):
    """kpi 글 → [(수치, 설명, 칩)] — 줄마다 '수치 | 설명 | 칩(선택)'. '출처: …' 줄은 빼고 wire_source 로"""
    out = []
    for l in str(d or "").splitlines():
        if SOURCE_LINE.match(l):
            continue
        c = _cells(re.sub(r"^\s*[-•]\s*", "", l))
        if c and c[0]:
            out.append((c[0], c[1] if len(c) > 1 else "", c[2] if len(c) > 2 else ""))
    return out


def wire_source(d):
    """'출처: …' 줄(마지막 것) — 큰 수치·차트 아래 작은 출처 줄"""
    src = ""
    for l in str(d or "").splitlines():
        m = SOURCE_LINE.match(l)
        if m:
            src = m.group(2).strip()
    return src


def wire_bars(d):
    """chart 글 → (머리[이전,지금] 또는 [], [(라벨, 값, 이전값|None)]) — 줄마다 '라벨 | 값' 또는 '라벨 | 이전 | 지금'.
    첫 줄이 '구분 | 도입 전 | 도입 후' 처럼 숫자가 없으면 두 막대의 이름"""
    head, out = [], []
    for l in str(d or "").splitlines():
        if not l.strip() or SOURCE_LINE.match(l):
            continue
        l = re.sub(r"^\s*[-•]\s*", "", l)
        c = _cells(l) if "|" in l else [p.strip() for p in re.split(r"[:：]", l, maxsplit=1)]
        nums = []
        for x in c[1:3]:
            m = re.match(r"^\s*(-?[\d,]*\.?\d+)", x)
            nums.append(float(m.group(1).replace(",", "")) if m else None)
        if len(c) >= 3 and nums[0] is None and nums[1] is None and not out:
            head = [c[1], c[2]]
            continue
        if len(c) >= 3 and nums[0] is not None and nums[1] is not None:
            out.append((c[0], nums[1], nums[0]))
        elif len(c) >= 2 and nums and nums[0] is not None:
            out.append((c[0], nums[0], None))
    return head, out


def wire_table(d):
    """table 글 → (칸 목록 [[…]], 강조할 열 번호 또는 -1) — 머리 칸 앞 '★' 가 '우리' 열"""
    cells = [_cells(l) for l in str(d or "").splitlines() if "|" in l and not re.fullmatch(r"[\s|:-]+", l)]
    star = -1
    if cells:
        for i, c in enumerate(cells[0]):
            if c.startswith("★"):
                star = i
                cells[0][i] = c.lstrip("★ ").strip()
                break
    return cells, star


def wire_matrix(d):
    """matrix 글 → ((가로축, 세로축), [(이름, 설명)×최대 4: 좌상·우상·좌하·우하]) — 첫 줄 '축: 가로 | 세로'"""
    axes, quads = ("", ""), []
    for t, x in wire_steps(d):
        if t.strip().lower() in ("축", "기준", "axis", "axes") and not axes[0]:
            c = _cells(x)
            axes = (c[0], c[1] if len(c) > 1 else "")
        else:
            quads.append((t, x))
    return axes, quads[:4]


def _num(x):
    """'72%'·'1,200건' → 72.0·1200.0, 숫자가 없으면 None"""
    m = re.search(r"-?[\d,]*\.?\d+", str(x or ""))
    try:
        return float(m.group(0).replace(",", "")) if m else None
    except ValueError:
        return None


def wire_funnel(d):
    """funnel 글 → [(단계, 설명, 수치)] — 줄마다 '단계: 설명 | 수치'(수치 없어도 됨). 위가 가장 넓다"""
    out = []
    for t, x in wire_steps(d):
        if SOURCE_LINE.match(f"{t}: {x}"):
            continue
        c = _cells(x) if "|" in x else [x]
        out.append((t, c[0], c[1] if len(c) > 1 else ""))
    return out


def wire_road(d):
    """roadmap 글 → [(기간, 이름, 설명)] — 줄마다 '[기간] 이름: 설명'"""
    out = []
    for t, x in wire_steps(d):
        m = re.match(r"^\s*\[([^\]]+)\]\s*(.*)$", t)
        out.append(((m.group(1).strip(), m.group(2).strip(), x) if m else ("", t, x)))
    return out


def wire_conv(d):
    """converge 글 → (문제[(이름, 설명)], 해결[(이름, 설명)]) — 줄마다 '문제 | 이름: 설명' / '해결 | 이름: 설명'.
    머리말이 없으면 앞 절반을 문제, 뒤 절반을 해결로 본다"""
    pr, so, plain = [], [], []
    for l in str(d or "").splitlines():
        if not l.strip() or SOURCE_LINE.match(l):
            continue
        l = re.sub(r"^\s*[-•]\s*", "", l).strip()
        tag, _, rest = l.partition("|")
        tag = tag.strip()
        if rest and re.match(r"^(문제|현황|원인|AS-?IS|before)", tag, re.I):
            pr.extend(wire_steps(rest))
        elif rest and re.match(r"^(해결|개선|효과|TO-?BE|after)", tag, re.I):
            so.extend(wire_steps(rest))
        else:
            plain.extend(wire_steps(l))
    if not pr and not so and plain:
        h = (len(plain) + 1) // 2
        pr, so = plain[:h], plain[h:]
    return pr[:4], so[:4]


def wire_parts(d):
    """proportion 글 → [(이름, 값)] — 줄마다 '이름 | 값'. 값이 숫자가 아닌 줄은 뺀다"""
    out = []
    for l in str(d or "").splitlines():
        if not l.strip() or SOURCE_LINE.match(l):
            continue
        l = re.sub(r"^\s*[-•]\s*", "", l)
        c = _cells(l) if "|" in l else [p.strip() for p in re.split(r"[:：]", l, maxsplit=1)]
        v = _num(c[1]) if len(c) > 1 else None
        if c[0] and v is not None and v > 0:
            out.append((c[0], v))
    return out


def clean_wire(w):
    """기획 AI 가 낸 와이어프레임을 다듬는다(서버 Jobs::wire 와 같은 규칙). 없거나 깨졌으면 빈 목록"""
    out = []
    for i, b in enumerate(w if isinstance(w, list) else []):
        if not isinstance(b, dict):
            continue
        try:
            x, y = max(0.0, min(97.0, float(b.get("x", 0)))), max(0.0, min(97.0, float(b.get("y", 0))))
            o = {"id": str(b.get("id") or f"w{i + 1}")[:12], "k": b.get("k") if b.get("k") in WIRE_KINDS else "card", "x": round(x, 1), "y": round(y, 1),
                 "w": round(max(3.0, min(100 - x, float(b.get("w", 20)))), 1), "h": round(max(3.0, min(100 - y, float(b.get("h", 20)))), 1),
                 "t": str(b.get("t") or "")[:200]}
        except (TypeError, ValueError):
            continue
        if str(b.get("d") or "").strip():
            o["d"] = str(b["d"])[:1500]
        if o["t"].strip() in WIRE_PLACEHOLDER:   # '결론 띠'·'상황·입력' 같은 자리표시 — 글이 있으면 그 첫 줄을 제목으로, 없으면 버린다
            d = o.pop("d", "").strip()
            if not d:
                continue
            o["t"], rest = (d.split(chr(10), 1) + [""])[:2]
            if rest.strip():
                o["d"] = rest.strip()
        out.append(o)
    return out[:60]


def wire_shape(x):
    """AI 가 낸 장 하나의 배치 요약 — 'tpl c84' 또는 줄마다 칸 '[panel 3 · person 6 · stack 3] / [band 12]'. B안에 'A안과 다르게'로 넘긴다"""
    if x.get("tpl"):
        return f"배치 틀 {x['tpl']}"
    rows = []
    for r in x.get("rows") or []:
        if isinstance(r, dict):
            rows.append("[" + " · ".join(f"{c.get('k') or 'stack'} {c.get('span', '')}" for c in (r.get("cols") or []) if isinstance(c, dict)) + "]")
    return " / ".join(rows)


WIRE_PLACEHOLDER = {"결론 띠", "한 줄 결론", "결론", "상황·입력", "결과·전략", "우리의 장치(플랫폼·절차·화면)", "제목", "내용", "항목", "상자 제목"}
WIRE_BATCH = 3   # 작은 묶음을 여러 개 동시에 — 출력 길이가 곧 걸리는 시간이라 묶음이 작을수록 빨리 끝난다


def make_wires(job, plan, only_empty=False):
    """와이어프레임 — 기획이 끝난 뒤 장 묶음(5장)마다 따로 짠다. 디자인만 빠진 완성 목업: 상자마다 장표에 찍힐 실제 글·수치.
    기획 한 번에 넣으면 출력이 길어 잘리므로 나눈다. 실패한 묶음은 비워 두고(화면이 기획 내용으로 자동 배치) 계속한다.
    규칙은 prompt_wire.md — 서버(api/src/prompt_wire.md, 'AI 로 다시 짜기')와 같은 글이다."""
    from concurrent.futures import ThreadPoolExecutor
    system = read(os.path.join(W["HERE"], "prompt_wire.md"))
    todo = [s for s in plan["slides"] if not (only_empty and s.get("wire"))]
    if not system or not todo:
        return
    groups = [todo[i:i + WIRE_BATCH] for i in range(0, len(todo), WIRE_BATCH)]
    job.event(f"와이어프레임 — {len(todo)}장을 {len(groups)}묶음으로 짭니다(기획의 글·수치를 상자에 그대로, 장마다 A·B 두 안)")
    NL = chr(10)

    def one(g, shape_a=None):
        """shape_a: 쪽 → A안 배치 요약. 주면 B안 — 같은 글·수치를 A안과 다른 배치로 짠다"""
        src = []
        for s in g:
            b_note = ([f"[B안] A안 배치: {shape_a[s['n']]} — 이 장은 A안과 다른 배치 틀·칸 나눔으로 짠다(주인공 덩어리의 위치·비율, 그림 자리를 바꾼다). "
                       "글·수치는 A안처럼 빠짐없이 같게."] if shape_a and shape_a.get(s["n"]) else [])
            src.append(NL.join([f"## {s['n']}쪽 — {s.get('title', '')}", *b_note, f"전달할 것: {s.get('message', '')}",
                                f"유형: {s.get('type', '')} · 장치: {s.get('device', '')}", f"구성: {s.get('layout', '')}",
                                f"장면: {s.get('scene', '')}", "내용:", str(s.get("content", ""))[:5000]]))
        st = getattr(job, "style", None) or {}
        tr = (f"디자인 타입 — {st.get('name', '')}: {st['plan']}{NL}(인물 상자 person 은 이 타입이 인물을 쓸 때만. 아니면 image·chart·badge·table 로 짠다){NL}"
              f"타입 가이드(레이아웃·밀도·SI 제안서에 쓰는 법을 따른다):{NL}{styles.guide(st['id'], 5000)}{NL}{NL}") if st.get("plan") else ""
        user = f"덱 제목: {plan.get('title', '')}{NL}{NL}{tr}아래 {len(g)}장의 와이어프레임을 짠다(n 은 쪽 번호 그대로).{NL}{NL}" + (NL + NL).join(src)
        if shape_a:
            user += f"{NL}{NL}(이번에는 B안이다 — 장마다 적힌 A안 배치와 겹치지 않는 배치로. 같은 틀(tpl)을 다시 쓰지 않는다)"
        r = ai(job, "plan", {"messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                             "max_tokens": 1600 * len(g) + 600, "temperature": 0.5 if shape_a else 0.2})
        raw = [x for x in (parse_json(text_of(r)).get("slides") or []) if isinstance(x, dict)]
        # AI 는 줄·칸만 정한다 — 좌표 계산과 합격 기준 검사(겹침·넘침·빠진 수치)는 서버 한 곳에서(api/src/WireLayout.php)
        by = {s["n"]: s for s in g}
        send = [dict(x, content=str(by.get(int(x.get("n", 0)), {}).get("content", "")), title=str(by.get(int(x.get("n", 0)), {}).get("title", ""))) for x in raw]
        laid = W["req"]("POST", "/worker/wire/layout", {"slides": send}, timeout=60).get("slides") or []
        shape = {int(x.get("n", 0)): wire_shape(x) for x in raw}
        return {int(x.get("n", 0)): (clean_wire(x.get("wire")), [str(c) for c in (x.get("wire_checks") or [])], shape.get(int(x.get("n", 0)), "")) for x in laid}

    def ab(g):
        """한 묶음 — A안을 짜고 바로 그 묶음의 B안(A안 배치를 알려 주고 다른 배치로). 묶음끼리는 동시에 돈다"""
        a = one(g)
        shape = {k: v[2] or "상자 " + ", ".join(b["k"] for b in v[0]) for k, v in a.items() if v[0]}
        try:
            try:
                b = one(g, shape) if shape else {}
            except ValueError:   # JSON 이 깨진 응답 — 같은 요청을 한 번 더(B안은 온도 0.5 라 다시 받으면 대개 멀쩡하다)
                b = one(g, shape)
        except Cancelled:
            raise
        except Exception as e:
            job.event(f"와이어프레임 B안 한 묶음을 짜지 못했습니다 — 그 장은 A안만 둡니다: {str(e)[:120]}", "warn")
            b = {}
        return a, b

    got, got_b, bad = {}, {}, 0
    with ThreadPoolExecutor(max_workers=min(par(job, 4, 8), len(groups))) as ex:   # 구독(CLI)은 cli_max(4), OpenRouter 는 8 — 37장 13묶음이 4개씩 돌아 12분 걸렸다(2026-10-07)
        for f in [ex.submit(ab, g) for g in groups]:
            try:
                a, b = f.result()
                got.update(a)
                got_b.update(b)
            except Cancelled:
                raise
            except Exception as e:
                bad += 1
                job.event(f"와이어프레임 한 묶음을 짜지 못했습니다 — 그 장은 기획 내용으로 자동 배치됩니다: {str(e)[:120]}", "warn")
    n = nb = 0
    for s in todo:
        w, chk, _ = got.get(s["n"]) or ([], [], "")
        if w:
            s["wire"], s["wire_ai"], s["wire_checks"] = w, w, chk   # wire_ai: AI 가 짠 그대로(사람이 고친 것과 견줘 배운다)
            s.pop("wire_alt", None); s.pop("wire_pick", None)
            n += 1
            # B안 — 사용자가 시안 확인에서 A·B 중 하나를 확정하면 그것이 wire 가 된다(서버 Jobs::patch wire_pick)
            wb = (got_b.get(s["n"]) or ([],))[0]
            if wb and wb != w:
                s["wire_alt"] = {"a": w, "b": wb}
                nb += 1
    left = sum(1 for s in todo if s.get("wire_checks"))
    job.event(f"와이어프레임 완료 — {n}/{len(todo)}장" + (f" · B안 {nb}장" if nb else "") + (f" ({bad}묶음 실패)" if bad else "") + (f" · 확인이 필요한 장 {left}장" if left else ""), "done" if not bad else "warn")


def wire_boxes(s):
    """시안에 넘길 상자 — '※ 보강 필요' 메모를 빼고 나서 글이 하나도 없는 상자(그림 상자 제외)는 버린다"""
    out = []
    for b in s.get("wire") or []:
        t = "" if "보강 필요" in str(b.get("t") or "") else str(b.get("t") or "")
        d = "\n".join(l for l in str(b.get("d") or "").splitlines() if l.strip() and "보강 필요" not in l)
        if b.get("k") not in ("person", "image", "screen", "map", "band") and not t.strip() and not d.strip():
            continue
        out.append(dict(b, t=t, d=d))
    return out


def _wrap(d, text, font, width):
    """text 를 width(px) 안에서 줄을 나눈다 — 띄어쓰기 단위로, 한 낱말이 넘치면 글자 단위로"""
    out, cur = [], ""
    for w in str(text).split(" "):
        nxt = (cur + " " + w) if cur else w
        if d.textlength(nxt, font=font) <= width:
            cur = nxt
            continue
        if cur:
            out.append(cur)
        cur = ""
        for ch in w:
            if cur and d.textlength(cur + ch, font=font) > width:
                out.append(cur)
                cur = ""
            cur += ch
    if cur:
        out.append(cur)
    return out


def wire_png(s, size=(1600, 900)):
    """와이어프레임을 본문(16:9) 그림으로 — 시안 이미지 모델에 '이 배치대로' 첫 참고로 넘긴다. 회색 상자 + 종류·제목"""
    from PIL import Image, ImageDraw
    wire = wire_boxes(s)
    if not wire:
        return None
    W_, H_ = size
    im = Image.new("RGB", size, "white")
    d = ImageDraw.Draw(im)
    f_t, f_d = _font(26), _font(18, False)
    INK, SUB, LINE, PALE = (51, 65, 85), (100, 116, 139), (148, 163, 184), (241, 245, 249)
    # 상자마다 그 '형태'를 회색조 스케치로 — 예전엔 모든 상자를 '회색 상자 + 하늘색 머리 띠 + 글 줄'로 그려서
    # 이미지 모델이 그대로 베껴 모든 장이 머리 띠 상자 + 글머리 목록이 됐다. 머리 띠는 그리지 않는다(디자인 시스템이 정한다)
    # (종류 이름 PANEL·CARD… 은 찍지 않는다 — 이미지 모델이 글자로 베낀다. 종류는 wire_text 로 넘긴다)
    # 글은 상자 폭에서 줄을 바꾼다 — 글자 수로 자르면(예전 40·48자) 이미지 모델이 잘린 글('…을 나')을 그대로 베낀다
    d.rectangle([W_ * 0.06, H_ * 0.025, W_ * 0.94, H_ * 0.11], outline=(203, 213, 225), width=2)

    def lines_in(x, y, w, ymax, text, font, fill, step):
        for raw in str(text).splitlines():
            for ln in _wrap(d, raw, font, w):
                if y > ymax - step + 4:
                    return y
                d.text((x, y), ln, font=font, fill=fill)
                y += step
        return y

    def title(b, x0, y0, x1):
        return lines_in(x0 + 10, y0 + 10, x1 - x0 - 20, y0 + 80, b.get("t") or "", f_t, INK, 32) + 6 if b.get("t") else y0 + 10

    for b in wire:
        k = b["k"]
        x0, y0 = b["x"] / 100 * W_, b["y"] / 100 * H_
        x1, y1 = x0 + b["w"] / 100 * W_, y0 + b["h"] / 100 * H_
        body = "\n".join(l for l in str(b.get("d") or "").splitlines() if "보강 필요" not in l and not PIC_LINE.match(l))   # 그림 지시 줄은 찍지 않는다
        if k == "band":
            d.rounded_rectangle([x0, y0, x1, y1], radius=10, fill=(30, 58, 138))
            lines_in(x0 + 14, y0 + (y1 - y0) / 2 - 16, x1 - x0 - 28, y1, b.get("t") or "", f_t, (255, 255, 255), 32)
            continue
        if k == "gantt" and wire_gantt(body)[0]:
            head, rows, pins = wire_gantt(body)
            yy = title(b, x0, y0, x1)
            lw = (x1 - x0) * 0.24
            cw = (x1 - x0 - lw) / max(1, len(head))
            d.rectangle([x0, yy, x1, yy + 30], fill=(203, 213, 225))
            for i, h in enumerate(head):
                cx = x0 + lw + i * cw
                d.line([cx, yy, cx, y1], fill=(226, 232, 240), width=1)
                d.text((cx + 6, yy + 5), h, font=f_d, fill=INK)
            rh = (y1 - yy - 30) / max(1, len(rows) + (1 if pins else 0))
            for r, (nm, a, e, lab) in enumerate(rows):
                ry = yy + 30 + r * rh
                lines_in(x0 + 6, ry + rh / 2 - 11, lw - 12, ry + rh, nm, f_d, INK, 22)
                tone = 200 - int(90 * r / max(1, len(rows) - 1))
                d.rounded_rectangle([x0 + lw + a * cw + 4, ry + rh * 0.25, x0 + lw + (e + 1) * cw - 4, ry + rh * 0.75], radius=8, fill=(tone, tone + 10, tone + 25))
                if lab:
                    lines_in(x0 + lw + a * cw + 10, ry + rh / 2 - 11, (e - a + 1) * cw - 20, ry + rh, lab, f_d, (15, 23, 42), 22)
            for nm, a in pins:
                px, py = x0 + lw + (a + 0.5) * cw, y1 - rh / 2
                d.polygon([(px, py - 9), (px + 9, py), (px, py + 9), (px - 9, py)], fill=(71, 85, 105))
                d.text((px + 12, py - 11), nm, font=f_d, fill=INK)
            continue
        if k in ("phase", "flow") and len(wire_steps(body)) >= 2:
            ss = wire_steps(body)[:6]
            yy = title(b, x0, y0, x1)
            n, gap = len(ss), 8
            sw = (x1 - x0 - gap * (n - 1)) / n
            for i, (st, ds) in enumerate(ss):
                sx = x0 + i * (sw + gap)
                tone = 215 - int(110 * i / max(1, n - 1))   # 오른쪽일수록 진하게
                fg = (255, 255, 255) if tone < 160 else INK
                if k == "phase":   # 오른쪽일수록 높은 계단
                    top = y1 - (y1 - yy) * (0.55 + 0.45 * i / max(1, n - 1))
                    d.rounded_rectangle([sx, top, sx + sw, y1], radius=10, fill=(tone, tone + 10, tone + 25))
                    ty = lines_in(sx + 10, top + 10, sw - 20, y1, st, f_t, fg, 30)
                    lines_in(sx + 10, ty + 4, sw - 20, y1 - 6, ds, f_d, fg, 23)
                else:   # 쉐브론 + 아래 설명
                    ch = min(64, (y1 - yy) * 0.4)
                    tip = 0 if i == n - 1 else min(22, sw * 0.12)
                    d.polygon([(sx, yy), (sx + sw - tip, yy), (sx + sw, yy + ch / 2), (sx + sw - tip, yy + ch), (sx, yy + ch)], fill=(tone, tone + 10, tone + 25))
                    lines_in(sx + 10, yy + ch / 2 - 13, sw - tip - 14, yy + ch, st, f_d, fg, 22)
                    lines_in(sx + 4, yy + ch + 10, sw - 8, y1, ds, f_d, SUB, 23)
            continue
        if k == "kpi" and wire_kpis(body):
            ks = wire_kpis(body)[:4]
            src = wire_source(body)
            yy = title(b, x0, y0, x1)
            ybot = y1 - (26 if src else 0)
            kw = (x1 - x0) / len(ks)
            chip = any(c for _, _, c in ks)
            f_n = _font(int(min(72, max(36, (ybot - yy) * (0.34 if chip else 0.42)))))
            f_c = _font(16)
            for i, (num, cap, ch) in enumerate(ks):
                kx = x0 + i * kw
                if i:
                    d.line([kx, yy + 10, kx, ybot - 10], fill=LINE, width=1)
                ty = yy + 8
                if ch:   # 라벨 칩 — 수치 위 작은 알약
                    cw = d.textlength(ch, font=f_c) + 24
                    d.rounded_rectangle([kx + (kw - cw) / 2, ty, kx + (kw + cw) / 2, ty + 26], radius=13, outline=(30, 41, 59), width=2)
                    d.text((kx + (kw - cw) / 2 + 12, ty + 3), ch, font=f_c, fill=(30, 41, 59))
                    ty += 36
                nw = d.textlength(num, font=f_n)
                d.text((kx + (kw - nw) / 2, ty), num, font=f_n, fill=(30, 41, 59))
                lines_in(kx + 12, d.textbbox((0, ty), num, font=f_n)[3] + 12, kw - 24, ybot, cap, f_d, SUB, 23)
            if src:
                d.text((x0 + 10, y1 - 22), "출처: " + src, font=_font(15, False), fill=SUB)
            continue
        if k == "chart":
            names, vals = wire_bars(body)
            src = wire_source(body)
            if len(vals) >= 2:
                yy = title(b, x0, y0, x1)
                pair = sum(1 for v in vals if v[2] is not None) >= max(1, len(vals) // 2)
                top = max(max(v, p or 0) for _, v, p in vals) or 1
                bw = (x1 - x0 - 20) / len(vals)
                base = y1 - 30 - (24 if src else 0) - (28 if pair else 0)
                d.line([x0 + 10, base, x1 - 10, base], fill=LINE, width=1)
                GREY, BLUE = (203, 213, 225), (37, 99, 235)
                for i, (lab, v, p) in enumerate(vals):
                    bx = x0 + 10 + i * bw
                    if pair:   # 이전은 회색, 지금은 파랑 — 두 막대 나란히
                        for j, (val, col) in enumerate(((p, GREY), (v, BLUE))):
                            if val is None:
                                continue
                            h = max(4, (base - yy - 30) * val / top)
                            cx0 = bx + bw * (0.14 + 0.37 * j)
                            d.rectangle([cx0, base - h, cx0 + bw * 0.33, base], fill=col)
                            d.text((cx0, base - h - 22), f"{val:g}", font=_font(16, j == 1), fill=INK if j else SUB)
                    else:
                        h = max(4, (base - yy - 30) * v / top)
                        d.rectangle([bx + bw * 0.2, base - h, bx + bw * 0.8, base], fill=(148, 163, 184) if i < len(vals) - 1 else (71, 85, 105))
                        d.text((bx + bw * 0.2, base - h - 24), f"{v:g}", font=f_d, fill=INK)
                    lines_in(bx + bw * 0.1, base + 6, bw * 0.8, base + 30, lab, f_d, SUB, 22)
                ly = base + 32
                if pair:   # 범례
                    lx = x0 + 10
                    for nm, col in (((names[0] if names else "이전"), GREY), ((names[1] if names else "지금"), BLUE)):
                        d.rectangle([lx, ly + 4, lx + 14, ly + 18], fill=col)
                        d.text((lx + 20, ly), nm, font=_font(16, False), fill=SUB)
                        lx += 40 + d.textlength(nm, font=_font(16, False))
                if src:
                    d.text((x0 + 10, y1 - 22), "출처: " + src, font=_font(15, False), fill=SUB)
                continue
        if k == "table" and wire_table(body)[0]:
            cells, star = wire_table(body)
            cells = cells[:9]
            yy = title(b, x0, y0, x1)
            nc = max(len(r) for r in cells)
            rh = min(48, (y1 - yy - 4) / len(cells))
            cw = (x1 - x0) / nc
            for r, row in enumerate(cells):
                ry = yy + r * rh
                if r == 0:
                    d.rectangle([x0, ry, x1, ry + rh], fill=(226, 232, 240))
                d.line([x0, ry + rh, x1, ry + rh], fill=(203, 213, 225), width=1)
                for c in range(nc):
                    tx = row[c] if c < len(row) else ""
                    f = _font(18, r == 0 or c == star)
                    lines_in(x0 + c * cw + 8, ry + rh / 2 - 11, cw - 16, ry + rh, tx, f, (30, 41, 59) if (r == 0 or c == star) else SUB, 22)
            if 0 <= star < nc:   # 우리 열 — 굵은 테두리로 감싼다(색은 디자인 시스템이)
                d.rectangle([x0 + star * cw, yy - 4, x0 + (star + 1) * cw, yy + len(cells) * rh + 4], outline=(30, 41, 59), width=4)
            continue
        if k == "fishbone" and len(wire_steps(body)) >= 2:
            ss = wire_steps(body)[:6]
            yy = y0 + 6   # 제목(t)은 오른쪽 머리 = 결과·문제
            hw = min(260, (x1 - x0) * 0.24)   # 오른쪽 머리(결과)
            hx = x1 - hw
            my = (yy + y1) / 2
            d.line([x0 + 10, my, hx, my], fill=INK, width=4)
            d.polygon([(hx, my - 14), (hx + 18, my), (hx, my + 14)], fill=INK)
            d.rounded_rectangle([hx + 22, my - 46, x1 - 4, my + 46], radius=10, fill=(30, 41, 59))
            lines_in(hx + 34, my - 30, hw - 46, my + 44, b.get("t") or "", f_t, (255, 255, 255), 30)
            top = [s for i, s in enumerate(ss) if i % 2 == 0]
            bot = [s for i, s in enumerate(ss) if i % 2 == 1]
            for side, group in ((-1, top), (1, bot)):
                n = max(1, len(group))
                seg = (hx - x0 - 20) / n
                for i, (cat, causes) in enumerate(group):
                    bx = x0 + 20 + seg * (i + 0.65)
                    ey = yy + 8 if side < 0 else y1 - 8
                    sx = bx - seg * 0.35
                    d.line([bx, my, sx, ey + (34 if side < 0 else -34)], fill=LINE, width=3)
                    ty = ey if side < 0 else ey - 30
                    d.text((sx - 10, ty), cat, font=_font(20), fill=INK)
                    cy = (my + ey) / 2
                    lines_in((bx + sx) / 2 + 16, cy - (10 if side < 0 else 30), seg * 0.6, cy + 60, causes.replace(",", "\n").replace("，", "\n"), _font(16, False), SUB, 20)
            continue
        if k == "hub" and len(wire_steps(body)) >= 3:
            ss = wire_steps(body)[:8]
            import math
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            r = min(x1 - x0, y1 - y0) * 0.16
            ring = min((x1 - x0) * 0.36, (y1 - y0) * 0.38)
            n = len(ss)
            nw = min(230, (x1 - x0) * 0.26)
            for i, (st, ds) in enumerate(ss):
                a = -math.pi / 2 + 2 * math.pi * i / n
                px, py = cx + ring * math.cos(a) * 1.25, cy + ring * math.sin(a)
                d.line([cx, cy, px, py], fill=LINE, width=3)
                d.rounded_rectangle([px - nw / 2, py - 30, px + nw / 2, py + 30], radius=12, fill=PALE, outline=(203, 213, 225), width=2)
                ty = lines_in(px - nw / 2 + 10, py - 24, nw - 20, py + 4, st, _font(19), INK, 22)
                lines_in(px - nw / 2 + 10, ty, nw - 20, py + 30, ds, _font(15, False), SUB, 18)
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(30, 41, 59))
            lines_in(cx - r + 14, cy - 18, 2 * r - 28, cy + r, b.get("t") or "", f_t, (255, 255, 255), 30)
            continue
        if k == "pyramid" and len(wire_steps(body)) >= 2:
            ss = wire_steps(body)[:5]
            yy = title(b, x0, y0, x1)
            n = len(ss)
            pw = (x1 - x0) * 0.5   # 왼쪽 반 = 피라미드, 오른쪽 반 = 설명
            lh = (y1 - yy) / n
            for i, (st, ds) in enumerate(ss):
                t0, t1 = i / n, (i + 1) / n
                ry = yy + i * lh
                tone = 90 + int(120 * i / max(1, n - 1))   # 꼭대기가 가장 진함
                pc = x0 + pw / 2
                d.polygon([(pc - pw / 2 * t0, ry + 2), (pc + pw / 2 * t0, ry + 2), (pc + pw / 2 * t1, ry + lh - 2), (pc - pw / 2 * t1, ry + lh - 2)], fill=(tone - 40, tone - 25, tone))
                fg = (255, 255, 255) if tone < 170 else INK
                tw = d.textlength(st, font=_font(20))
                d.text((pc - tw / 2, ry + lh * (0.55 if i == 0 else 0.35)), st, font=_font(20), fill=fg)
                d.line([pc + pw / 2 * (t0 + t1) / 2 + 8, ry + lh / 2, x0 + pw + 20, ry + lh / 2], fill=LINE, width=1)
                lines_in(x0 + pw + 28, ry + lh / 2 - 11, x1 - x0 - pw - 36, ry + lh, ds, f_d, SUB, 23)
            continue
        if k == "matrix" and len(wire_matrix(body)[1]) >= 2:
            (ax, ay), qs = wire_matrix(body)
            yy = title(b, x0, y0, x1)
            if ay:   # 세로축 이름은 사분면 위 한 줄 — 돌려 쓰면 한글이 깨져 보여 가로로
                d.text((x0 + 34, yy), "↑ " + ay, font=f_d, fill=INK)
                yy += 30
            gx0, gy1 = x0 + 34, y1 - 30
            gw, gh = (x1 - gx0 - 6) / 2, (gy1 - yy) / 2
            for i, (st, ds) in enumerate(qs):
                qx, qy = gx0 + (i % 2) * gw, yy + (i // 2) * gh
                hot = i == 1   # 우상 = 목표 칸
                d.rectangle([qx + 3, qy + 3, qx + gw - 3, qy + gh - 3], fill=(30, 41, 59) if hot else PALE)
                fg = (255, 255, 255) if hot else INK
                ty = lines_in(qx + 14, qy + 12, gw - 28, qy + gh, st, _font(21), fg, 26)
                lines_in(qx + 14, ty + 2, gw - 28, qy + gh - 6, ds, f_d, (226, 232, 240) if hot else SUB, 22)
            d.line([gx0, gy1 + 2, x1, gy1 + 2], fill=INK, width=3)
            d.line([gx0 - 2, yy, gx0 - 2, gy1], fill=INK, width=3)
            if ax:
                tw = d.textlength(ax + " →", font=f_d)
                d.text((x1 - tw, gy1 + 6), ax + " →", font=f_d, fill=INK)
            continue
        if k == "funnel" and len(wire_funnel(body)) >= 2:
            ss = wire_funnel(body)[:6]
            yy = title(b, x0, y0, x1)
            n = len(ss)
            fw = (x1 - x0) * 0.56   # 왼쪽 = 깔때기, 오른쪽 = 설명
            lh = (y1 - yy) / n
            for i, (st, ds, num) in enumerate(ss):
                ry = yy + i * lh
                w0 = fw * (1 - 0.5 * i / n)
                w1 = fw * (1 - 0.5 * (i + 1) / n)
                cx = x0 + fw / 2
                tone = 215 - int(130 * i / max(1, n - 1))   # 아래(결과)일수록 진하게
                d.polygon([(cx - w0 / 2, ry + 2), (cx + w0 / 2, ry + 2), (cx + w1 / 2, ry + lh - 2), (cx - w1 / 2, ry + lh - 2)], fill=(tone, tone + 10, tone + 25))
                fg = (255, 255, 255) if tone < 160 else INK
                lab = st + (f"  {num}" if num else "")
                tw = d.textlength(lab, font=_font(20))
                d.text((cx - tw / 2, ry + lh / 2 - 13), lab, font=_font(20), fill=fg)
                if ds:
                    d.line([cx + (w0 + w1) / 4 + 8, ry + lh / 2, x0 + fw + 18, ry + lh / 2], fill=LINE, width=1)
                    lines_in(x0 + fw + 26, ry + lh / 2 - 11, x1 - x0 - fw - 30, ry + lh, ds, f_d, SUB, 23)
            continue
        if k == "cycle" and len(wire_steps(body)) >= 3:
            import math
            ss = wire_steps(body)[:6]
            n = len(ss)
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            rx, ry_ = (x1 - x0) * 0.32, (y1 - y0) * 0.30
            nw, nh = min(240, (x1 - x0) * 0.28), 64
            d.ellipse([cx - rx, cy - ry_, cx + rx, cy + ry_], outline=LINE, width=4)
            for i in range(n):   # 노드 사이 고리 위 화살촉(시계 방향)
                a = -math.pi / 2 + 2 * math.pi * (i + 0.5) / n
                px, py = cx + rx * math.cos(a), cy + ry_ * math.sin(a)
                tx, ty = -rx * math.sin(a), ry_ * math.cos(a)   # 접선 방향
                ln = math.hypot(tx, ty) or 1
                ux, uy = tx / ln, ty / ln
                d.polygon([(px + ux * 14, py + uy * 14), (px - ux * 8 - uy * 10, py - uy * 8 + ux * 10), (px - ux * 8 + uy * 10, py - uy * 8 - ux * 10)], fill=INK)
            for i, (st, ds) in enumerate(ss):
                a = -math.pi / 2 + 2 * math.pi * i / n
                px, py = cx + rx * math.cos(a), cy + ry_ * math.sin(a)
                tone = 215 - int(110 * i / max(1, n - 1))
                fg = (255, 255, 255) if tone < 160 else INK
                d.rounded_rectangle([px - nw / 2, py - nh / 2, px + nw / 2, py + nh / 2], radius=12, fill=(tone, tone + 10, tone + 25))
                ty = lines_in(px - nw / 2 + 12, py - nh / 2 + 7, nw - 24, py + 6, f"{i + 1}. {st}", _font(19), fg, 22)
                lines_in(px - nw / 2 + 12, ty, nw - 24, py + nh / 2 - 2, ds, _font(15, False), fg if tone < 160 else SUB, 18)
            if b.get("t"):
                lines_in(cx - rx * 0.5, cy - 16, rx, cy + 40, b["t"], f_t, INK, 30)
            continue
        if k == "venn" and 2 <= len(wire_steps(body)):
            ss = wire_steps(body)[:3]
            n = len(ss)
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2 + (8 if n == 3 else 0)
            r = min((x1 - x0) / (3.4 if n == 2 else 3.6), (y1 - y0) / (2.3 if n == 2 else 3.4))
            off = r * 0.62
            cs = [(cx - off, cy), (cx + off, cy)] if n == 2 else [(cx - off, cy + off * 0.55), (cx + off, cy + off * 0.55), (cx, cy - off * 0.6)]
            ov = Image.new("RGBA", size, (0, 0, 0, 0))
            od = ImageDraw.Draw(ov)
            for i, (px, py) in enumerate(cs):
                tone = 120 + 40 * i
                od.ellipse([px - r, py - r, px + r, py + r], fill=(tone - 60, tone - 40, tone, 70), outline=(71, 85, 105, 255), width=3)
            im.paste(ov, (0, 0), ov)
            d = ImageDraw.Draw(im)
            for i, ((px, py), (st, ds)) in enumerate(zip(cs, ss)):
                dx = (px - cx) * 0.75
                dy = (py - cy) * 0.75 + (-r * 0.15 if n == 3 and i == 2 else 0)
                tx0 = px + dx - r * 0.42
                ty = lines_in(tx0, py + dy - 22, r * 0.84, py + dy + 60, st, _font(20), INK, 24)
                lines_in(tx0, ty, r * 0.84, py + dy + 70, ds, _font(15, False), SUB, 18)
            if b.get("t"):   # 겹친 가운데 = 교집합 이름
                tw = d.textlength(b["t"], font=_font(20))
                pw = tw + 24
                d.rounded_rectangle([cx - pw / 2, cy - 18, cx + pw / 2, cy + 18], radius=18, fill=(30, 41, 59))
                d.text((cx - tw / 2, cy - 13), b["t"], font=_font(20), fill=(255, 255, 255))
            continue
        if k == "roadmap" and len(wire_road(body)) >= 2:
            import math
            ss = wire_road(body)[:6]
            yy = title(b, x0, y0, x1)
            n = len(ss)
            my = (yy + y1) / 2
            amp = (y1 - yy) * 0.12
            pts = [(x0 + 20 + (x1 - x0 - 40) * t / 60, my + amp * math.sin(t / 60 * math.pi * 2.0)) for t in range(61)]
            d.line(pts, fill=(203, 213, 225), width=26, joint="curve")   # 길(굵은 띠)
            d.line(pts, fill=(255, 255, 255), width=2)
            sw = (x1 - x0 - 40) / n
            for i, (per, st, ds) in enumerate(ss):
                t = (i + 0.5) / n
                px = x0 + 20 + (x1 - x0 - 40) * t
                py = my + amp * math.sin(t * math.pi * 2.0)
                tone = 200 - int(120 * i / max(1, n - 1))
                d.ellipse([px - 13, py - 13, px + 13, py + 13], fill=(tone, tone + 10, tone + 25), outline=(255, 255, 255), width=3)
                up = i % 2 == 0
                bx0 = px - sw / 2 + 6
                if up:
                    top, bot = yy + 4, py - 24
                else:
                    top, bot = py + 24, y1 - 4
                d.line([px, py - 14 if up else py + 14, px, bot if up else top], fill=LINE, width=1)
                ty = (top if not up else max(top, bot - 92))
                if per:
                    ty = lines_in(bx0, ty, sw - 12, bot if up else y1, per, _font(18), (37, 99, 235), 22)
                ty = lines_in(bx0, ty, sw - 12, bot if up else y1, st, _font(20), INK, 24)
                lines_in(bx0, ty, sw - 12, bot if up else y1, ds, _font(15, False), SUB, 19)
            continue
        if k == "isostack" and len(wire_steps(body)) >= 2:
            ss = wire_steps(body)[:5]
            yy = title(b, x0, y0, x1)
            n = len(ss)
            sw = (x1 - x0) * 0.42   # 왼쪽 = 비스듬한 판, 오른쪽 = 층 설명
            lh = (y1 - yy) / n
            th = min(lh * 0.62, 70)   # 판 윗면 높이
            for i, (st, ds) in enumerate(ss):   # 위(사용자) → 아래(기반)
                py = yy + i * lh + lh * 0.12
                cx = x0 + sw / 2 + 10
                tone = 200 - int(120 * i / max(1, n - 1))   # 아래(기반)일수록 진하게
                topc = (tone, tone + 10, tone + 25)
                side = (max(0, tone - 35), max(0, tone - 25), max(0, tone - 10))
                top_ = [(cx - sw / 2, py + th / 2), (cx, py), (cx + sw / 2, py + th / 2), (cx, py + th)]
                d.polygon([(cx - sw / 2, py + th / 2), (cx, py + th), (cx, py + th + 14), (cx - sw / 2, py + th / 2 + 14)], fill=side)
                d.polygon([(cx + sw / 2, py + th / 2), (cx, py + th), (cx, py + th + 14), (cx + sw / 2, py + th / 2 + 14)], fill=side)
                d.polygon(top_, fill=topc)
                fg = (255, 255, 255) if tone < 160 else INK
                tw = d.textlength(st, font=_font(19))
                d.text((cx - tw / 2, py + th / 2 - 12), st, font=_font(19), fill=fg)
                d.line([cx + sw / 2 + 6, py + th / 2, x0 + sw + 40, py + th / 2], fill=LINE, width=1)
                lines_in(x0 + sw + 48, py + th / 2 - 11, x1 - x0 - sw - 52, py + lh, ds, f_d, SUB, 23)
            continue
        if k == "gauge" and wire_kpis(body):
            ks = [(n_, c_, ch) for n_, c_, ch in wire_kpis(body) if _num(n_) is not None][:4]
            if ks:
                src = wire_source(body)
                yy = title(b, x0, y0, x1)
                ybot = y1 - (26 if src else 0)
                kw = (x1 - x0) / len(ks)
                for i, (num, cap, _) in enumerate(ks):
                    kx = x0 + i * kw
                    r = min(kw * 0.34, (ybot - yy) * 0.30)
                    cx, cy = kx + kw / 2, yy + 14 + r
                    pct = max(0.0, min(100.0, _num(num) if "%" in num or _num(num) <= 100 else 100.0))
                    w_ = max(10, int(r * 0.26))
                    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(226, 232, 240), width=w_)
                    if pct > 0:
                        d.arc([cx - r, cy - r, cx + r, cy + r], -90, -90 + 360 * pct / 100, fill=(30, 41, 59), width=w_)
                    f_n = _font(int(max(20, min(40, r * 0.32))))
                    nw = d.textlength(num, font=f_n)
                    d.text((cx - nw / 2, cy - f_n.size * 0.62), num, font=f_n, fill=(30, 41, 59))
                    cw = d.textlength(cap, font=f_d)   # 한 줄이면 가운데, 길면 칸 폭에 맞춰 줄바꿈
                    if cw <= kw - 24:
                        d.text((cx - cw / 2, cy + r + 12), cap, font=f_d, fill=SUB)
                    else:
                        lines_in(kx + 12, cy + r + 12, kw - 24, ybot, cap, f_d, SUB, 23)
                if src:
                    d.text((x0 + 10, y1 - 22), "출처: " + src, font=_font(15, False), fill=SUB)
                continue
        if k == "proportion" and len(wire_parts(body)) >= 2:
            ps = wire_parts(body)[:6]
            src = wire_source(body)
            yy = title(b, x0, y0, x1)
            tot = sum(v for _, v in ps) or 1
            bh = min(70, (y1 - yy) * 0.36)
            by = yy + 10
            bx = x0 + 10
            bw = x1 - x0 - 20
            cx_ = bx
            for i, (nm, v) in enumerate(ps):
                w_ = bw * v / tot
                tone = 60 + int(150 * i / max(1, len(ps) - 1))   # 가장 큰 몫(첫 줄)이 가장 진함
                d.rectangle([cx_, by, cx_ + w_ - (2 if i < len(ps) - 1 else 0), by + bh], fill=(tone - 30, tone - 15, tone + 10))
                pct = f"{v / tot * 100:.0f}%"
                fg = (255, 255, 255) if tone < 150 else INK
                if d.textlength(pct, font=_font(20)) < w_ - 12:
                    d.text((cx_ + 8, by + bh / 2 - 13), pct, font=_font(20), fill=fg)
                lines_in(cx_ + 4, by + bh + 10, max(60, w_ - 8), y1 - (26 if src else 0), f"{nm}\n{v:g}", f_d, INK if i == 0 else SUB, 22)
                cx_ += w_
            if src:
                d.text((x0 + 10, y1 - 22), "출처: " + src, font=_font(15, False), fill=SUB)
            continue
        # 2026-10-14 원본 대조 확장 4종(해외 레퍼런스 refc 262·234·254·152·71)
        if k == "converge" and all(wire_conv(body)):
            pr, so = wire_conv(body)
            yy = title(b, x0, y0, x1)
            cw = (x1 - x0) * 0.28
            cx, cy = (x0 + x1) / 2, (yy + y1) / 2
            r = min((x1 - x0) * 0.11, (y1 - yy) * 0.26)
            for side, items in ((-1, pr), (1, so)):
                n = len(items)
                ch = (y1 - yy) / n
                for i, (st, ds) in enumerate(items):
                    cy0 = yy + i * ch + 4
                    bx0 = x0 if side < 0 else x1 - cw
                    d.rounded_rectangle([bx0, cy0, bx0 + cw, cy0 + ch - 8], radius=10, fill=PALE if side < 0 else (219, 234, 254), outline=(203, 213, 225), width=2)
                    ty = lines_in(bx0 + 12, cy0 + 8, cw - 24, cy0 + ch - 8, st, _font(19), INK, 23)
                    lines_in(bx0 + 12, ty, cw - 24, cy0 + ch - 10, ds, _font(15, False), SUB, 18)
                    ex = bx0 + cw if side < 0 else bx0   # 카드 가장자리 → 가운데 원(곡선은 꺾은선 두 마디로)
                    my = cy0 + (ch - 8) / 2
                    mx = (ex + cx + side * r) / 2
                    d.line([(ex, my), (mx, my), (cx + side * r, cy)], fill=LINE if side < 0 else (96, 165, 250), width=3, joint="curve")
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(30, 41, 59))
            ls = _wrap(d, b.get("t") or "", _font(20), 2 * r - 30)[:3]   # 원 안 가운데 정렬
            for li, ln in enumerate(ls):
                d.text((cx - d.textlength(ln, font=_font(20)) / 2, cy - len(ls) * 12 + li * 24), ln, font=_font(20), fill=(255, 255, 255))
            continue
        if k == "ridge" and len(wire_road(body)) >= 2:
            ss = wire_road(body)[:6]
            yy = title(b, x0, y0, x1)
            n = len(ss)
            base = y1 - 46   # 아래 46px = 성과 알약 줄
            top = yy + 96    # 위 96px = 가장 높은 연도 카드 자리
            pts = []
            for i in range(n):
                px = x0 + 40 + (x1 - x0 - 80) * (i + 0.5) / n
                py = base - (base - top) * (0.25 + 0.75 * (i + 1) / n)
                pts.append((px, py))
            d.polygon([(x0, base)] + pts + [(x1, pts[-1][1]), (x1, base)], fill=(226, 232, 240))   # 마지막 봉우리 뒤는 그 높이로 오른쪽 끝까지
            d.line([(x0, base - (base - top) * 0.18)] + pts, fill=(71, 85, 105), width=4, joint="curve")
            sw = (x1 - x0 - 80) / n
            for i, ((px, py), (per, st, ds)) in enumerate(zip(pts, ss)):
                tone = 200 - int(130 * i / max(1, n - 1))
                d.ellipse([px - 11, py - 11, px + 11, py + 11], fill=(tone, tone + 10, tone + 25), outline=(255, 255, 255), width=3)
                cy0 = max(yy, py - 92)
                ty = lines_in(px - sw / 2 + 6, cy0, sw - 12, py - 14, per, _font(18), (37, 99, 235), 22) if per else cy0
                lines_in(px - sw / 2 + 6, ty, sw - 12, py - 14, st, _font(18), INK, 22)
                if ds:
                    pw = min(sw - 10, d.textlength(ds, font=_font(14, False)) + 22)
                    d.rounded_rectangle([px - pw / 2, base + 8, px + pw / 2, base + 38], radius=15, fill=PALE, outline=(203, 213, 225))
                    lines_in(px - pw / 2 + 11, base + 14, pw - 18, base + 38, ds, _font(14, False), SUB, 18)
            continue
        if k == "petal" and len(wire_steps(body)) >= 3:
            import math
            ss = wire_steps(body)[:6]
            n = len(ss)
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            r = min((x1 - x0) * 0.09, (y1 - y0) * 0.17)
            pr_ = r * 0.62
            colw = (x1 - x0) * 0.27
            for i, (st, ds) in enumerate(ss):
                a = -math.pi / 2 + 2 * math.pi * i / n
                px, py = cx + r * 1.45 * math.cos(a), cy + r * 1.45 * math.sin(a)
                tone = 205 - int(100 * i / max(1, n - 1))
                d.ellipse([px - pr_, py - pr_, px + pr_, py + pr_], fill=(tone, tone + 10, tone + 25), outline=(255, 255, 255), width=3)
                no = f"{i + 1:02d}"
                tw = d.textlength(no, font=_font(20))
                d.text((px - tw / 2, py - 13), no, font=_font(20), fill=(255, 255, 255) if tone < 160 else INK)
                rows_ = (n + 1) // 2   # 시계 방향 앞 절반 = 오른쪽 열(위→아래), 뒤 절반 = 왼쪽 열(위→아래)
                left = i >= rows_
                j = (n - 1 - i) if left else i
                tx0 = x0 if left else x1 - colw
                ty0 = y0 + 10 + j * (y1 - y0 - 20) / rows_
                d.line([(px + (-pr_ if left else pr_), py), (tx0 + (colw if left else 0), ty0 + 14)], fill=LINE, width=1)
                ty = lines_in(tx0, ty0, colw, ty0 + 60, f"{no} {st}", _font(18), INK, 22)
                lines_in(tx0, ty, colw, ty0 + (y1 - y0 - 20) / rows_, ds, _font(15, False), SUB, 18)
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(30, 41, 59))
            ls = _wrap(d, b.get("t") or "", _font(22), 2 * r - 24)[:3]   # 원 안 가운데 정렬
            for li, ln in enumerate(ls):
                d.text((cx - d.textlength(ln, font=_font(22)) / 2, cy - len(ls) * 13 + li * 26), ln, font=_font(22), fill=(255, 255, 255))
            continue
        if k == "stage" and len(wire_steps(body)) >= 2:
            ss = wire_steps(body)[:5]
            yy = title(b, x0, y0, x1)
            n = len(ss)
            cx = (x0 + x1) / 2
            bw = (x1 - x0) * 0.78
            bh = min(56, (y1 - yy) * 0.14)   # 기단 옆면 높이
            eh = min(46, (y1 - yy) * 0.12)   # 타원 윗면 높이
            by1 = y1 - 6
            by0 = by1 - bh - eh / 2
            d.ellipse([cx - bw / 2, by1 - eh, cx + bw / 2, by1], fill=(51, 65, 85))
            d.rectangle([cx - bw / 2, by0, cx + bw / 2, by1 - eh / 2], fill=(51, 65, 85))
            d.ellipse([cx - bw / 2, by0 - eh / 2, cx + bw / 2, by0 + eh / 2], fill=(100, 116, 139))
            tw = d.textlength(b.get("t") or "", font=_font(20))
            d.text((cx - tw / 2, by0 + eh / 2 + 4), b.get("t") or "", font=_font(20), fill=(255, 255, 255))
            ring_y = by0 - eh * 1.6
            d.ellipse([cx - bw * 0.42, ring_y - eh * 0.55, cx + bw * 0.42, ring_y + eh * 0.55], outline=(96, 165, 250), width=3)
            cr = min(bw * 0.76 / n * 0.42, (ring_y - yy) * 0.28)   # 원끼리 겹치지 않게 간격의 84% 지름
            for i, (st, ds) in enumerate(ss):
                px = cx - bw * 0.38 + bw * 0.76 * (i + 0.5) / n
                py = yy + cr + 6 + (cr * 0.5 if i % 2 else 0)
                d.line([px, py + cr, px, ring_y], fill=LINE, width=1)
                d.ellipse([px - cr, py - cr, px + cr, py + cr], fill=PALE, outline=(147, 197, 253), width=3)
                ty = lines_in(px - cr * 0.8, py - 16, cr * 1.6, py + cr, st, _font(17), INK, 20)
                lines_in(px - cr * 0.8, ty, cr * 1.6, py + cr, ds, _font(13, False), SUB, 16)
            continue
        if k == "badge":
            f_n = _font(int(min(64, max(30, (y1 - y0) * 0.35))))
            tw = d.textlength(b.get("t") or "", font=f_n)
            d.text((x0 + max(8, (x1 - x0 - tw) / 2), y0 + 12), b.get("t") or "", font=f_n, fill=(30, 41, 59))
            lines_in(x0 + 12, y0 + 24 + f_n.size, x1 - x0 - 24, y1, body, f_d, SUB, 23)
            continue
        # 글 상자·표·그림 자리 — 옅은 면 하나(머리 띠 없음)
        d.rounded_rectangle([x0, y0, x1, y1], radius=10, fill=None if k == "text" else PALE, outline=(203, 213, 225) if k != "text" else None, width=2)
        if k in ("person", "image", "screen", "map"):
            d.line([x0, y0, x1, y1], fill=(226, 232, 240), width=2)
            d.line([x0, y1, x1, y0], fill=(226, 232, 240), width=2)
        yy = title(b, x0, y0, x1)
        lines_in(x0 + 10, max(yy, y0 + 46) if b.get("t") else yy, x1 - x0 - 20, y1 - 4, body.replace("|", "   "), f_d, SUB, 24)
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def wire_text(s):
    """와이어프레임을 글로 — 이미지 모델이 그림과 함께 읽는다"""
    rows = []
    for b in wire_boxes(s):
        head = f'- {b["k"]} at x {b["x"]}%, y {b["y"]}%, size {b["w"]}% x {b["h"]}% of the body'
        lines = [l.strip() for l in str(b.get("d") or "").splitlines() if l.strip() and "보강 필요" not in l]
        if b["k"] in ("person", "image", "screen", "map"):
            # 그림 자리 — '그림:' 줄은 무엇을 그릴지(화면에 글로 찍지 않는다), 나머지 줄만 그림 위에 찍는 글
            draw = [PIC_LINE.sub("", l) for l in lines if PIC_LINE.match(l)]
            say = [l for l in lines if not PIC_LINE.match(l)]
            row = head + (f' — DRAW (a picture instruction, never print these words): {" / ".join(draw)}' if draw else "")
            if say or b.get("t"):
                row += f' — text printed on/under the picture: {" / ".join(([b["t"]] if b.get("t") else []) + say[:6])}'
            rows.append(row)
        elif b["k"] == "table" and any("|" in l for l in lines):
            cells, star = wire_table(b.get("d"))
            desc = " ; ".join("row " + str(i + 1) + ": " + " / ".join(f"[{c}]" for c in r) for i, r in enumerate(cells[:10]))
            hi = (f' — HIGHLIGHT OUR COLUMN: column {star + 1} ("{cells[0][star]}") is our proposal — wrap that whole column in a thick primary-color outline'
                  ' with a pale primary fill and bold text; every other column stays neutral grey (one accent only)') if star >= 0 else ""
            rows.append(head + f': "{b.get("t", "")}" — a TABLE (header row first). Each [ ] is one cell; draw real table cells, never print the brackets, any "|" or "★" character: {desc}'
                        ' — ALIGNMENT: header cells centered; text columns left-aligned; short uniform values (numbers, years, scores) centered; amounts, % and comparable figures right-aligned' + hi)
        elif b["k"] == "chart" and len(wire_bars(b.get("d"))[1]) >= 2:
            names, vals = wire_bars(b.get("d"))
            src = wire_source(b.get("d"))
            if sum(1 for v in vals if v[2] is not None) >= max(1, len(vals) // 2):
                bn, an = (names + ["before", "after"])[:2] if names else ("before", "after")
                desc = " ; ".join(f'[{lab}] {bn} {p:g} → {an} {v:g}' if p is not None else f'[{lab}] {v:g}' for lab, v, p in vals)
                rows.append(head + f': "{b.get("t", "")}" — BEFORE/AFTER BAR CHART: paired bars per category, the "{bn}" bar in light grey and the "{an}" bar in the primary blue,'
                            f' value labels on top, small legend: {desc}' + (f'; small source line under the chart: "출처: {src}"' if src else ""))
            else:
                desc = " ; ".join(f'[{lab}] {v:g}' for lab, v, _ in vals)
                rows.append(head + f': "{b.get("t", "")}" — BAR CHART, value labels on top, the last/most important bar in the primary color: {desc}'
                            + (f'; small source line: "출처: {src}"' if src else ""))
        elif b["k"] == "fishbone" and len(wire_steps(b.get("d"))) >= 2:
            ss = " ; ".join(f'[{t}] causes: {x}' for t, x in wire_steps(b.get("d")))
            rows.append(head + f': "{b.get("t", "")}" — FISHBONE (cause-and-effect) DIAGRAM: one horizontal spine ending in an arrow at a dark head box on the RIGHT holding'
                        f' the effect "{b.get("t", "")}"; slanted category bones above and below the spine, each with its cause words beside it: {ss}')
        elif b["k"] == "hub" and len(wire_steps(b.get("d"))) >= 3:
            ss = " ; ".join(f'[{t}]' + (f" ({x})" if x else "") for t, x in wire_steps(b.get("d")))
            rows.append(head + f': "{b.get("t", "")}" — HUB-AND-SPOKE DIAGRAM: a dark circle in the CENTER labeled "{b.get("t", "")}", thin connector lines radiating to'
                        f' satellite nodes evenly placed around it (each node: an icon, a bold name, one short line): {ss}')
        elif b["k"] == "pyramid" and len(wire_steps(b.get("d"))) >= 2:
            ss = " ; ".join(f'level {i + 1} [{t}]' + (f" — {x}" if x else "") for i, (t, x) in enumerate(wire_steps(b.get("d"))))
            rows.append(head + f': "{b.get("t", "")}" — PYRAMID: stacked trapezoid layers, the TOP layer is the narrowest and darkest (the goal), wider and lighter going down;'
                        f' layer names inside, one-line descriptions to the RIGHT connected by thin leader lines: {ss}')
        elif b["k"] == "matrix" and len(wire_matrix(b.get("d"))[1]) >= 2:
            (ax, ay), qs = wire_matrix(b.get("d"))
            pos = ["top-left", "top-right", "bottom-left", "bottom-right"]
            ss = " ; ".join(f'{pos[i]} [{t}]' + (f" — {x}" if x else "") for i, (t, x) in enumerate(qs))
            rows.append(head + f': "{b.get("t", "")}" — 2×2 MATRIX: four quadrant boxes with an L-shaped axis'
                        + (f', horizontal axis "{ax} →"' if ax else "") + (f', vertical axis "{ay} ↑"' if ay else "")
                        + f'; the TOP-RIGHT quadrant is our target — fill it with the primary color, the other three stay pale: {ss}')
        elif b["k"] == "gantt" and wire_gantt(b.get("d"))[0]:
            hd, gr, pins = wire_gantt(b.get("d"))
            desc = " ; ".join(f'[{nm}] bar from {hd[a] if a < len(hd) else a + 1} to {hd[e] if e < len(hd) else e + 1}' + (f' labeled "{lab}"' if lab else "") for nm, a, e, lab in gr)
            pin = " ; ".join(f'"{nm}" at {hd[a] if a < len(hd) else a + 1}' for nm, a in pins)
            rows.append(head + f': "{b.get("t", "")}" — a GANTT SCHEDULE GRID (the hero of the slide): period header cells {" | ".join(hd)}; activity rows with horizontal bars: {desc}'
                        + (f"; milestone diamond pins: {pin}" if pin else "") + ". Draw it as a real Gantt chart, never as cards or a list.")
        elif b["k"] in ("phase", "flow") and len(wire_steps(b.get("d"))) >= 2:
            ss = " → ".join(f'[{t}]' + (f" ({x})" if x else "") for t, x in wire_steps(b.get("d")))
            form = ("STAGED SCOPE: adjacent stages that grow taller and darker from left to right (later = deeper/wider scope)" if b["k"] == "phase"
                    else "PROCESS CHEVRONS in one row, light → dark, short description under each")
            rows.append(head + f': "{b.get("t", "")}" — {form}: {ss}')
        elif b["k"] == "kpi" and wire_kpis(b.get("d")):
            ks = " ; ".join((f'small outlined label chip "{ch}" above ' if ch else "") + f'big number "{n}"' + (f' with caption "{c}"' if c else "") for n, c, ch in wire_kpis(b.get("d")))
            src = wire_source(b.get("d"))
            rows.append(head + f': "{b.get("t", "")}" — KPI ROW of big numbers side by side, separated by thin rules (no boxed cards): {ks}'
                        + (f'; one small grey source line under the row: "출처: {src}"' if src else ""))
        elif b["k"] == "funnel" and len(wire_funnel(b.get("d"))) >= 2:
            ss = " ; ".join(f'stage {i + 1} [{t}]' + (f' value "{n}"' if n else "") + (f" — {x}" if x else "") for i, (t, x, n) in enumerate(wire_funnel(b.get("d"))))
            rows.append(head + f': "{b.get("t", "")}" — FUNNEL: horizontal trapezoid layers stacked top to bottom, the TOP is the widest (the start) and each layer narrower;'
                        f' later = darker blue; stage name and its number inside each layer, a one-line description to the right on a thin leader line: {ss}')
        elif b["k"] == "cycle" and len(wire_steps(b.get("d"))) >= 3:
            ss = " → ".join(f'[{t}]' + (f" ({x})" if x else "") for t, x in wire_steps(b.get("d")))
            rows.append(head + f': "{b.get("t", "")}" — CYCLE DIAGRAM: the steps placed evenly on a circle, numbered 1·2·3…, joined CLOCKWISE by curved arrows'
                        f' (the last step loops back to the first)' + (f', the cycle name "{b["t"]}" in the center' if b.get("t") else "") + f': {ss}')
        elif b["k"] == "venn" and len(wire_steps(b.get("d"))) >= 2:
            ss = " ; ".join(f'circle [{t}]' + (f" — {x}" if x else "") for t, x in wire_steps(b.get("d"))[:3])
            rows.append(head + f': "{b.get("t", "")}" — VENN DIAGRAM: {min(3, len(wire_steps(b.get("d"))))} overlapping translucent circles in the blue family, each name bold inside its own part;'
                        + (f' the shared center is a small dark pill labeled "{b["t"]}" (our answer)' if b.get("t") else "") + f': {ss}')
        elif b["k"] == "roadmap" and len(wire_road(b.get("d"))) >= 2:
            ss = " → ".join((f'[{p}] ' if p else "") + f'"{t}"' + (f" ({x})" if x else "") for p, t, x in wire_road(b.get("d")))
            rows.append(head + f': "{b.get("t", "")}" — ROADMAP: one gently winding road/ribbon from left to right with milestone dots on it (later = darker);'
                        f' milestone labels alternate above and below the road, each with its period bold in the primary color, the name, one short line: {ss}')
        elif b["k"] == "isostack" and len(wire_steps(b.get("d"))) >= 2:
            ss = " ; ".join(f'layer {i + 1} [{t}]' + (f" — {x}" if x else "") for i, (t, x) in enumerate(wire_steps(b.get("d"))))
            rows.append(head + f': "{b.get("t", "")}" — ISOMETRIC LAYER STACK: flat isometric slabs stacked vertically (top layer first = closest to the user,'
                        f' bottom = the foundation, darkest); layer name on each slab, one-line description to the right on a thin leader line: {ss}')
        elif b["k"] == "gauge" and wire_kpis(b.get("d")):
            ks = " ; ".join(f'donut "{n}"' + (f' with caption "{c}"' if c else "") for n, c, _ in wire_kpis(b.get("d")))
            src = wire_source(b.get("d"))
            rows.append(head + f': "{b.get("t", "")}" — DONUT GAUGES side by side: each a thick ring filled clockwise from 12 o\'clock to its percentage in the primary color'
                        f' (rest pale grey), the number large in the center, caption below: {ks}' + (f'; small source line: "출처: {src}"' if src else ""))
        elif b["k"] == "proportion" and len(wire_parts(b.get("d"))) >= 2:
            ps = wire_parts(b.get("d"))
            tot = sum(v for _, v in ps) or 1
            ss = " ; ".join(f'[{nm}] {v:g} ({v / tot * 100:.0f}%)' for nm, v in ps)
            src = wire_source(b.get("d"))
            rows.append(head + f': "{b.get("t", "")}" — PROPORTION BAR: ONE horizontal bar split into segments whose widths are exactly proportional to the values,'
                        f' the largest segment darkest, the % inside each segment, names and values under it: {ss}' + (f'; small source line: "출처: {src}"' if src else ""))
        elif b["k"] == "converge" and all(wire_conv(b.get("d"))):
            pr, so = wire_conv(b.get("d"))
            ps = " ; ".join(f'[{t}]' + (f" ({x})" if x else "") for t, x in pr)
            qs = " ; ".join(f'[{t}]' + (f" ({x})" if x else "") for t, x in so)
            rows.append(head + f': "{b.get("t", "")}" — CONVERGE-DIVERGE DIAGRAM: problem cards stacked on the LEFT (pale grey) send smooth curved lines that converge into ONE dark circle'
                        f' in the CENTER labeled "{b.get("t", "")}"; from the circle a soft fan of light opens to solution cards stacked on the RIGHT (light blue heads). Problems: {ps}. Solutions: {qs}')
        elif b["k"] == "ridge" and len(wire_road(b.get("d"))) >= 2:
            ss = " → ".join((f'[{p}] ' if p else "") + f'"{t}"' + (f" ({x})" if x else "") for p, t, x in wire_road(b.get("d")))
            rows.append(head + f': "{b.get("t", "")}" — RIDGE TIMELINE: a soft mountain-ridge silhouette rising from left to right; on each rising point a dot (later = darker),'
                        f' above it a small card with the year bold in the primary color and the name, below on the baseline a small pill with the achievement: {ss}')
        elif b["k"] == "petal" and len(wire_steps(b.get("d"))) >= 3:
            ss = " ; ".join(f'petal {i + 1:02d} [{t}]' + (f" — {x}" if x else "") for i, (t, x) in enumerate(wire_steps(b.get("d"))))
            rows.append(head + f': "{b.get("t", "")}" — NUMBER PETALS: one big dark circle in the CENTER with "{b.get("t", "")}" in large type, ringed by rounded petals numbered 01·02…'
                        f' (blue family, light → dark); each petal joined by a thin dotted line to its description card in a left or right column: {ss}')
        elif b["k"] == "stage" and len(wire_steps(b.get("d"))) >= 2:
            ss = " ; ".join(f'[{t}]' + (f" ({x})" if x else "") for t, x in wire_steps(b.get("d")))
            rows.append(head + f': "{b.get("t", "")}" — PLATFORM STAGE: a wide flat cylinder base at the bottom labeled "{b.get("t", "")}" (dark), a thin glowing ellipse ring above it,'
                        f' and service circles floating above the ring at slightly different heights, each with a small icon, a bold name and one short line: {ss}')
        else:
            rows.append(head + f': "{b.get("t", "")}"' + (f' — contents: {" / ".join(lines[:8])}' if lines else ""))
    return "\n".join(rows)


# 메타 문구(만드는 사람을 위한 설명이 장표 글로 새는 것) · 과장 표현 · 워터마크
META = re.compile(r"(도식화하면|도식화 하면|이 장표는|이 슬라이드|여기에 (?:넣|들어)|예시 이미지|화살표가 중요|하면 딱|placeholder|lorem|TBD|TODO|\[(?:이미지|그림|사진|표) ?(?:삽입|자리)\])", re.I)
VAGUE = re.compile(r"(체계적(으로|인)|효율적(으로|인)|최선을 다|적극적(으로|인)|원활(하게|한)|안정적(으로|인) 수행|만전을 기|차질\s*없|다양한 방안|최적의|성공적(으로|인) 수행|극대화)")
# 장 끝을 평가 항목 되받기로 닫는 꼬리("…평가에 답합니다") — 위원에게 남는 정보가 없다. 산출물·수치·기한으로 끝낸다
ECHO_TAIL = re.compile(r"(평가\s*(?:항목|요소|기준)?\s*(?:에|을)\s*(?:답|응답|부응)(?:합니다|하겠습니다|한다|드립니다)|요구(?:사항)?에\s*답(?:합니다|하겠습니다))\s*[.!]?\s*$", re.M)
HYPE = ["최초", "유일", "최고", "혁신적", "혁명", "패러다임", "완벽", "압도적", "세계 최", "국내 1호", "No.1", "넘버원"]
WATERMARK = re.compile(r"(NotebookLM|Made with|Generated by|Gamma|Beautiful\.ai|Canva|ChatGPT|Gemini|Midjourney|DALL.?E|Copilot)", re.I)
# 수치 + 단위. 단위는 알려진 것만, 붙은 단위 뒤에는 조사·끝만(‘24 위에서’·‘2019 건축’ 처럼 뒤 낱말을 단위로 잡지 않는다) — api Kit::nums 와 같은 규칙
_U = r"(?:%|퍼센트|(?:천|만|억|조)+(?:원|명|건|개)?|원|명|건|개월|개소|개|곳|종|년|월|일|시간|분|배|점|위|회|장|MB|GB|TB|km|㎡)"
_P = r"(?:이상|이하|미만|초과|이내|까지|부터|에서|로서|로써|으로|이|가|을|를|은|는|의|에|로|와|과|도|씩|당|내|간|째|차)"
NUM = re.compile(r"\d[\d,]*(?:\.\d+)?(?:" + _U + r"(?=" + _P + r"?(?![가-힣]))|\s+" + _U + r"(?![가-힣A-Za-z]))?")


def _norm_num(t):
    return re.sub(r"[\s,*]", "", t)


def _glued(text, m):
    """글자에 붙은 숫자(소상공인24·정부24·제2)이고 붙은 단위가 없으면 이름·번호다 — api Kit::nums 와 같은 규칙(O-17, 2026-10-15)"""
    raw = m.group(0).strip()
    pre = text[m.start() - 1:m.start()] if m.start() > 0 else ""
    return bool(re.match(r"[가-힣A-Za-z]", pre)) and (not re.search(r"\D$", raw) or bool(re.match(r"\d[\d,]*(?:\.\d+)?\s", raw)))


def present_minutes(src):
    """원자료의 '발표 규정'에서 발표 시간(분). 없으면 0 — api Kit::presentMinutes 와 같은 규칙"""
    m = re.search(r"발표\s*(?:시간)?\s*[:|：]?\s*\**\s*(?:은|는)?\s*(\d{1,3})\s*분", src or "")
    v = int(m.group(1)) if m else 0
    return v if 3 <= v <= 120 else 0


def slide_cap(src):
    """분량 상한(○장 이내). 없으면 0"""
    m = re.search(r"(?:분량|발표\s*자료|매수|장\s*수|슬라이드)[^\n]{0,30}?(\d{1,3})\s*(?:장|쪽|매|페이지|p)\s*(?:이내|이하)", src or "")
    v = int(m.group(1)) if m else 0
    return v if 3 <= v <= 60 else 0


def pace_range(m):
    """발표 분 → 알맞은 장 수(한 장 60~80초)"""
    if m <= 10:
        return max(2, round(m * 0.8)), max(3, round(m))
    if m <= 15:
        return round(12 * m / 15), round(m)
    if m <= 20:
        return 15, 18
    if m <= 30:
        return 18, 24
    return round(m * 0.6), round(m * 0.8)


_EVAL_SKIP = re.compile(r"(기술\s*(?:능력)?\s*평가|가격\s*평가|입찰\s*가격|정량|정성|합계|소계|총점|신용|경영\s*상태|평점|등급|계량|배점|평가\s*(?:부문|항목|방식|분야)|^구분$|^항목$|^부문$|가점|감점)")


def _eval_name(c):
    n = re.sub(r"\s+", " ", re.sub(r"\s*\([^)]*\)\s*", " ", re.sub(r"^[\s•·\-–]+", "", c.replace("*", "")))).strip()
    n = re.sub(r"^(?:[IVX]{1,4}|\d{1,2}[.)]?|[가나다라마바사아자차카타파하][.)])\s+", "", n).strip()
    if not n or not re.search(r"[가-힣]{2}", n) or _EVAL_SKIP.search(n):
        return None
    if re.search(r"^(?:과|와|및|의|을|를|은|는)\s|\+|기준으로|자료로|보면|비추어|에\s*따라|대한|이전", n):
        return None
    if len(n) > 24 or len(n.split()) > 5:
        return None
    return n


def eval_items(src):
    """평가 항목명 → 배점(큰 순). 배점 표(머리에 '배점' 칸)와 '항목명(10점)' 꼴 — api Kit::evalItems 와 같은 규칙"""
    out, in_table = {}, False
    for ln in (src or "").splitlines():
        t = ln.strip()
        if not t.startswith("|"):
            in_table = False
            for m in re.finditer(r"([가-힣][가-힣A-Za-z·\s]{1,28}?)\s*\(\s*(\d{1,2})\s*점\s*\)", t.replace("*", "")):
                n = _eval_name(m.group(1))
                if n:
                    out[n] = max(out.get(n, 0), float(m.group(2)))
            continue
        cells = [c.strip() for c in t.strip("|").split("|")]
        if not in_table:
            in_table = any("배점" in c for c in cells)
            continue
        if re.fullmatch(r"[\s:\-|]+", t):
            continue
        for i in range(len(cells) - 1, 0, -1):
            pm = re.fullmatch(r"\(?\s*(\d{1,2}(?:\.\d)?)\s*점?\s*\)?", cells[i].replace("*", ""))
            if not pm:
                continue
            for j in range(i - 1, -1, -1):
                n = _eval_name(cells[j])
                if n:
                    out[n] = max(out.get(n, 0), float(pm.group(1)))
                    break
            break
    return dict(sorted(((k, v) for k, v in out.items() if 2 <= v <= 40), key=lambda kv: -kv[1]))


def _loose(t):
    return re.sub(r"(?:및|·|ㆍ|,|&|\s|\*)", "", t or "")


def deck_check(plan, sources):
    """덱 전체를 자료와 맞대 본다(AI 없이) — 발표 시간 대비 장 수, 평가 항목명이 장 제목·절에 있는지, 첫 장이 발주처 수치를 되돌려 주는지."""
    out = []
    slides = plan.get("slides") or []
    if not slides or not sources:
        return out
    mins, cap = present_minutes(sources), slide_cap(sources)
    if mins or cap:
        lo, hi = pace_range(mins) if mins else (1, cap)
        if cap:
            hi = min(hi, cap)
            lo = min(lo, hi)
        why = (f"발표 {mins}분" if mins else "") + ((", " if mins else "") + f"분량 상한 {cap}장" if cap else "")
        if len(slides) > hi:
            out.append(f"장 수 {len(slides)}장 — {why} 기준({lo}~{hi}장)보다 많습니다. 덜 중요한 장을 합치거나 빼 주세요")
        elif len(slides) < lo:
            out.append(f"장 수 {len(slides)}장 — {why} 기준({lo}~{hi}장)보다 적습니다. 배점 상위 항목을 2장으로 나눠 근거를 더해 주세요")
    items = eval_items(sources)
    if len(items) >= 3:
        heads = [_loose(f'{s.get("title", "")}|{s.get("section", "")}|{s.get("chapter", "")}') for s in slides]
        hit = [n for n in items if any(_loose(n) in h for h in heads)]
        top = [n for n in list(items)[:3] if n not in hit]
        if not hit:
            out.append(f"평가 항목명({len(items)}개)이 장 제목·절 이름에 하나도 없습니다 — 배점 큰 항목부터 원문(예: '{next(iter(items))}')을 그 장의 제목이나 절 이름에 그대로 써 주세요")
        elif top:
            out.append("배점 상위 항목이 장 제목·절 이름에 없습니다: " + ", ".join(top))
    src_keys = set()
    for m in NUM.finditer(sources):
        raw = m.group(0).strip()
        if re.search(r"\D$", raw) and not _glued(sources, m):   # 단위 있는 수치만(소상공인24 위 같은 이름 빼고)
            src_keys.add(_norm_num(raw))
    s0 = slides[0]
    have = {_norm_num(m.group(0).strip()) for m in NUM.finditer("\n".join(str(s0.get(k) or "") for k in ("title", "message", "content")))} & src_keys
    if src_keys and len(have) < 2:
        out.append(f"첫 장에 발주처 자료의 수치가 {len(have)}개뿐입니다 — 예산·대상 규모·처리 건수 같은 발주처 수치 2개 이상을 원문 그대로 되돌려 주세요")
    return out


def fact_check(plan, sources):
    """기획을 자료와 맞대 본다(AI 없이). 장마다 checks 에 '확인할 것'을 적는다:
    자료에 없는 수치 · 메타 문구 · 근거 없는 과장 표현. 사람이 시안 전에 보고 고치거나 그대로 둔다."""
    src = _norm_num(sources or "")
    src_txt = sources or ""
    total = 0
    for s in plan.get("slides") or []:
        txt = "\n".join(str(s.get(k) or "") for k in ("title", "message", "content")) + "\n" + "\n".join(
            f'{b.get("t", "")}\n{b.get("d", "")}' for b in s.get("wire") or [])
        checks = []
        if src:
            seen = set()
            for m in NUM.finditer(txt):
                raw = m.group(0).strip()
                core = re.match(r"\d[\d,]*(?:\.\d+)?", raw).group(0)
                if len(_norm_num(core)) < 2 and not raw.endswith("%"):   # 한 자리 수(1단계·3개 등)는 넘어간다
                    continue
                if re.match(r"0\d", core):   # 01·02 — 기획이 붙인 연번·단계 표기(앞자리 0)는 근거가 아니라 번호다
                    continue
                if _glued(txt, m):
                    continue
                if raw in seen or _norm_num(raw) in src or (_norm_num(core) in src and not raw.endswith("%")):
                    continue
                seen.add(raw)
                checks.append(f"수치 '{raw}' 가 올린 자료에서 보이지 않습니다 — 근거를 확인하거나 '※ 보강 필요'로 바꿔 주세요")
            for h in HYPE:
                if h in txt and h not in src_txt:
                    checks.append(f"'{h}' 같은 강한 표현의 근거가 자료에 없습니다")
        for ln in re.split(r"[\n.]", txt):
            if VAGUE.search(ln) and not re.search(r"\d", ln):
                checks.append(f"추상적인 약속: '{ln.strip()[:40]}' — 산출물·기한·수치로 바꿔 주세요(예: 착수 2주 내 ○○ 보고서)")
                break
        tail = ECHO_TAIL.search(chr(10).join(str(s.get(k) or "") for k in ("message", "content")))
        if tail:
            checks.append(f"평가 항목을 되받는 꼬리로 끝납니다: '{tail.group(0).strip()}' — 산출물·수치·기한으로 끝내 주세요")
        for m in META.finditer(txt):
            checks.append(f"만드는 사람을 위한 설명이 장표 글에 들어가 있습니다: '{m.group(0)}'")
        for m in WATERMARK.finditer(txt):
            checks.append(f"도구 이름·워터마크로 보이는 글: '{m.group(0)}'")
        s["checks"] = checks[:12]
        total += len(s["checks"])
    # 덱 안 일관성 — 같은 항목(앞 낱말 + 단위)에 장마다 다른 수치
    seen = {}
    for s in plan.get("slides") or []:
        txt = "\n".join(str(s.get(k) or "") for k in ("title", "message", "content"))
        for m in re.finditer(r"([가-힣A-Za-z]{2,12})\s*(?:은|는|이|가|:)?\s*(\d[\d,]*(?:\.\d+)?)\s*(%|억|조|만|원|명|건|개|곳|종|개월|일|시간|배|점|회)", txt):
            key, val = (m.group(1), m.group(3)), m.group(2).replace(",", "")
            seen.setdefault(key, {}).setdefault(val, set()).add(s.get("n"))
    for (word, unit), vals in seen.items():
        if len(vals) > 1:
            where_ = " / ".join(f"{v}{unit}({', '.join(str(n) + '쪽' for n in sorted(ns))})" for v, ns in vals.items())
            for s in plan.get("slides") or []:
                if any(s.get("n") in ns for ns in vals.values()):
                    s["checks"] = (s.get("checks") or []) + [f"'{word}' 수치가 장마다 다릅니다: {where_} — 하나로 맞추거나 서로 다른 항목임을 밝혀 주세요"]
                    total += 1
    plan["deck_checks"] = deck_check(plan, sources)   # 덱 전체(장 수·평가 항목명·첫 장 수치) — 기획 확인 화면 맨 위에 보인다
    return total + len(plan["deck_checks"])


def make_mockup(job, s, feedback="", accent="#FF2A6D", anchor=None):
    title = str(s.get("title", ""))
    kw = ", ".join(keywords_of(s)) or "(none)"
    content = "\n".join(l for l in str(s.get("content", "")).splitlines() if "보강 필요" not in l)   # '※ 보강 필요' 는 사용자 메모 — 시안에 찍지 않는다
    if s.get("wire"):   # 사용자가 고친 와이어프레임 — 화면에 넣을 글의 정답. 기획 내용은 사실 확인용 참고로만
        content = ("[화면에 넣을 글 — 사용자가 와이어프레임에서 고친 최종본. 상자마다 이 글만 넣는다]\n" + wire_text(s)
                   + "\n\n[참고 — 기획 원문. 수치·이름 확인용일 뿐, 와이어프레임에 없는 항목을 여기서 가져와 더하지 않는다. 둘이 다르면 와이어프레임을 따른다]\n" + "\n".join(l for l in str(s.get("content", "")).splitlines() if "보강 필요" not in l)[:4000])
    prompt = IMAGE_TEMPLATE.format(section=s.get("section", ""), title=title.replace("**", ""), layout=s.get("layout", ""),
                                   image_prompt=s.get("image_prompt", ""), content=content,
                                   message=s.get("message") or title, mood=s.get("mood", ""), scene=s.get("scene", ""),
                                   accent=accent or "#FF2A6D", keyword=kw, device=s.get("device") or "(choose what fits the message)",
                                   **style_fields(job, accent))
    wp = wire_png(s)
    if wp:   # 사람이 확정한 와이어프레임 — 배치는 이것이 정답
        prompt += ("\nAPPROVED WIREFRAME — the FIRST reference image is the user-edited layout of this slide. Keep every block at the same position, size "
                   "and proportion, in the same order, with exactly the text written in each block (the user may have moved, edited, deleted or added items — "
                   "follow the wireframe, do not restore deleted items from the plan). The gray boxes and English kind labels are placeholders only: draw real slide "
                   "content (cards, people, charts, screens…) in the deck style there — never draw gray boxes, block-type names (PANEL, CARD, KEY NUMBER, BAND …) or bracketed labels. "
                   "If the wireframe has a dark full-width bar at the bottom, it is the CONCLUSION BAND: draw it as a full-width deep-navy bar with its text in white — never drop it.\n")
    st = getattr(job, "style", None) or {}
    if st.get("scene"):   # 타입 A 가 아닌 디자인 타입 — 기획의 장면(인물 연기)을 그 타입의 표현으로 바꿔 그린다
        prompt += ("\nDESIGN TYPE OVERRIDES THE SCENE (highest priority after the text content): " + str(st["scene"]).replace("{accent}", accent or "#FF2A6D")
                   + " The wireframe's PERSON / ILLUSTRATION placeholders mean 'key visual of this design type here', not a cartoon character."
                   + f" COLOR: the only emphasis color is the accent {accent or '#FF2A6D'} — if the Scene / Layout / Visual text names another vivid color (cobalt, blue …) for blocks, bands, numbers or highlighted words, use the accent instead.\n")
    if st.get("body_point_en"):   # 본문은 A 공통 — 컨셉 포인트 하나만 가볍게
        prompt += "\nCONCEPT POINT (a light touch only — everything else stays as described above): " + str(st["body_point_en"]) + "\n"
    if feedback:
        prompt += f"\nRevision request from the user (must apply): {feedback}\n"
    if anchor:   # 이 덱에서 먼저 만든 시안 — 색·선·모서리·아이콘·글자 크기를 그대로(배치·글은 따르지 않는다)
        prompt += ("\nDECK STYLE ANCHOR — the reference image " + ("right after the wireframe" if wp else "given FIRST") + " is an already-made slide of THIS SAME deck. "
                   "Match it exactly in color values, border and line weights, corner radius, header band style, icon family and size, type sizes and weights, card padding and shadow — "
                   "so the two slides look like pages of one deck. Do NOT copy its layout, its pictures or its text; this slide's layout comes from the wireframe and content.\n")
    import design_spec
    prompt += "\n" + design_spec.final_check() + "\n"
    # 본문만 16:9 로 만든다 — 머리 띠·바닥은 compose_frame 이 고정 위치로 입혀 3:2 한 장이 된다
    pics = [b for b in (s.get("wire") or []) if b.get("k") in ("person", "image", "screen", "map")]
    if st.get("body_split") and pics:   # (실험) 그림 칸만 나노바나나 2 — GPT 가 빈 칸 지시를 따르지 않아 자리를 못 찾는다. 본문은 GPT(사용자 결정 2026-10-04)   # 글·카드는 GPT, 그림 칸은 나노바나나 2 — 나노바나나는 글을 깨뜨리고 GPT 는 실사에서 얼룩진다
        return split_body(job, s, prompt, pics, wp, accent)
    if False:   # (본문 전체를 나노바나나로 그리지 않는다 — 글이 깨진다. 사용자 결정 2026-10-04)(GPT 는 실사에서 얼룩이 심하다). 실패하면 기본 모델
        nb2 = str(W["CFG"].get("nb2_model") or styles.nb2_model())
        try:
            return gen_image(job, prompt, list(s.get("ref") or []), "16:9", [wp] if wp else None, sref=s.get("sref"), model=nb2)
        except (Cancelled, Budget):
            raise
        except Exception as e:
            job.event(f"{s.get('n', '')}번 장 — 나노바나나 2 호출이 실패해 기본 시안 모델로 만듭니다: {str(e)[:160]}", "warn")
    return gen_image(job, prompt, list(s.get("ref") or []), "16:9", ([wp] if wp else []) + ([anchor] if anchor else []) or None, sref=s.get("sref"))


SLOT_NOTE = ("EMPTY PICTURE SLOTS (strict — overrides every picture instruction): every PERSON / ILLUSTRATION / SCREEN / MAP block of the wireframe is drawn ONLY as an EMPTY slot — "
             "one flat, plain, NEUTRAL LIGHT GRAY (#D9D9D9, exactly this gray, no blue tint) rounded rectangle exactly at that block's position and size, completely empty inside: no picture, no photo, no person, no icon, "
             "no text, no gradient, no border. A real picture is inserted there afterwards. Text that belongs to such a block (labels, speech-bubble lines) goes just OUTSIDE the slot "
             "(above or below it, or as a small callout touching its edge), never inside. Everything else (headline, cards, numbers, icons, conclusion band) is drawn normally.\n\n")


def split_body(job, s, prompt, pics, wp, accent):
    """본문 한 장 — GPT 가 글·카드와 빈 그림 칸을, 나노바나나 2 가 그림 칸 그림을. 그림 원본은 _mockup/sNN_pic_<id>.png 로 남긴다(장표로 옮길 때 잘라 쓰지 않고 이 파일을)"""
    import picslot
    from concurrent.futures import ThreadPoolExecutor
    st = getattr(job, "style", None) or {}
    nb2 = str(W["CFG"].get("nb2_model") or styles.nb2_model())
    n = int(s.get("n") or 0)
    d = os.path.join(job.dir, "_mockup")
    os.makedirs(d, exist_ok=True)
    body = gen_image(job, SLOT_NOTE + prompt + "\n" + SLOT_NOTE, list(s.get("ref") or []), "16:9", [wp] if wp else None, sref=s.get("sref"))
    with open(os.path.join(d, f"s{n:02d}_slots.png"), "wb") as fp:   # 그림을 끼우기 전 시안(빈 칸) — 확인용
        fp.write(body)
    from PIL import Image
    BW, BH = Image.open(io.BytesIO(body)).size
    sample = None
    for fn in ("cover_bg.png", "cover_plain.png"):
        if os.path.isfile(os.path.join(d, fn)):
            sample = file_b64(os.path.join(d, fn))
            break
    style = st.get("body_style_en") or "REAL PHOTOGRAPHS (editorial photography, natural light)"
    tone = st.get("body_tone_en") or "bright, clean, cobalt and sky-blue tone"

    def one(b):
        lines = [l.strip() for l in str(b.get("d") or "").splitlines() if l.strip()]
        what = " / ".join(PIC_LINE.sub("", l) for l in lines if PIC_LINE.match(l)) or (b.get("t") or s.get("scene") or "")
        asp = picslot.aspect_of(b["w"] * BW, b["h"] * BH)
        pp = (f"Picture style: {style}.\nWhat the picture shows (describe it visually): {what}\n"
              f"Project field: {s.get('section', '')} — {str(s.get('scene') or '')[:300]}\nColor and light: {tone}.\n"
              "One clear subject, simple calm composition with a little breathing room at the edges, soft even background that sits well on a light slide. "
              "Korean people only if people appear, seen from behind, from the side or as hands at work.")
        if sample:
            pp += "\nThe reference image is this deck's cover picture — match its rendering style, color grading and light exactly (not its subject or layout)."
        png = gen_image(job, pp, [], asp, [sample] if sample else None, model=nb2, plain=True)
        with open(os.path.join(d, f"s{n:02d}_pic_{b.get('id', 'x')}.png"), "wb") as fp:
            fp.write(png)
        rect = (b["x"] / 100 * BW, b["y"] / 100 * BH, (b["x"] + b["w"]) / 100 * BW, (b["y"] + b["h"]) / 100 * BH)
        return rect, png

    with ThreadPoolExecutor(max_workers=3) as ex:
        got = list(ex.map(one, pics))
    out, placed = picslot.paste(body, got)
    miss = sum(1 for _, ok in placed if not ok)
    if miss:
        job.event(f"{n}번 장 — 그림 칸 {miss}곳을 시안에서 정확히 찾지 못해 와이어프레임 자리에 넣었습니다.", "warn")
    return out


def style_fields(job, accent):
    """디자인 타입(job.style)의 시안 지시 조각"""
    st = getattr(job, "style", None) or styles.get("a")
    img = str(st.get("image") or "")
    if st.get("body_photo") or st.get("body_render") in ("line_flat", "iso3d") or st.get("body_style_en"):   # 실사·선화·3D 타입 — 클레이 인물 문구를 남기면 주인공만 3D 만화 얼굴이 된다
        how = ("REAL PHOTOGRAPHS (editorial photography, natural light). People are real photographed Korean professionals in their late 20s to 40s, "
               "natural faces, mostly seen from behind, from the side or as hands at work — never 3D, clay, cartoon or animation characters"
               if st.get("body_photo") else
               "THIN-OUTLINE FLAT VECTOR ILLUSTRATION like the deck's cover (thin dark outlines, 2-3 flat colors). People are simple flat figures with minimal faces "
               "(small dot eyes or no facial features) — never 3D, clay or Disney-like characters")
        how = st.get("body_style_en") or how
        img = re.sub(r"PEOPLE / ILLUSTRATION STYLE.*?(?=\n\nColors:|$)", "PEOPLE / PICTURE STYLE (strict): " + how + ".", img, count=1, flags=re.S)
        img = img.replace("PEOPLE / ILLUSTRATION STYLE above", "PEOPLE / PICTURE STYLE above")
        img = img.replace("same 3D clay icon and character style", "same picture style as described below").replace("90% soft 3D clay icons + 10% flat icons", "icons in the same picture style")
    deck_tone = st.get("body_tone_en") or ("same palette as the cover — the accent color " + (accent or "#FF2A6D") + " with white and its light tints only, flat calm look"
                 if st.get("accent_main") else "bright, airy daylight look, white background, cobalt and sky-blue palette, soft light color grading")
    import design_spec
    img = re.sub(r"\n\nColors:.*$", "", img, flags=re.S)   # 타입 설명의 색 문단은 디자인 시스템(design_spec)이 대신한다 — 두 벌이면 장마다 다른 쪽을 고른다
    return {"style_image": img.replace("{accent}", accent or "#FF2A6D"), "deck_tone": deck_tone,
            "spec": design_spec.spec_text(st.get("id", "a"), accent or "#FF2A6D"),
            "style_bg": st.get("bg") or "a clean white background", "head_color": st.get("head_color") or "#0B2E6B",
            # 헤드라인 정렬 — 디자인 타입(frame.key_align). 완성 장표도 같은 정렬로 맞춘다
            "key_align": ("left-aligned (it starts at the left margin, on the same vertical line as the left edge of the content below)"
                          if (st.get("frame") or {}).get("key_align") == "left" else "centered")}


def keywords_of(s):
    """기획의 강조어 — keyword('A, B') + title 의 **강조** (finalize.keywords 와 같은 규칙)"""
    ks = [k.strip() for k in re.split(r"[,，/·]", str(s.get("keyword") or "")) if k.strip()]
    ks += re.findall(r"\*\*(.+?)\*\*", str(s.get("title") or ""))
    return list(dict.fromkeys(ks))


STYLE_REF = ""   # 예전엔 B08 을 늘 붙였는데 이미지 모델이 그 구성(가운데 노트북·양옆 인물·말풍선)까지 따라 그려 뺐다. 화풍은 reference/style 만


def style_refs():
    """reference/style/ 의 화풍 기준 그림(git 에 있음) — 시안마다 함께 보내 인물·일러스트 느낌을 고정한다"""
    out = []
    for p in sorted(glob.glob(os.path.join(ref_dir(), "style", "*.png")) + glob.glob(os.path.join(ref_dir(), "style", "*.jpg")))[:2]:
        b = file_b64(p)
        if b:
            out.append(b)
    return out


def file_b64(p, max_w=1280):
    from PIL import Image
    try:
        im = Image.open(p).convert("RGB")
    except Exception:
        return None
    im.thumbnail((max_w, max_w))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=85)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


HF_STATE = {}   # Higgsfield 상태 — no_credits(소진을 알아챈 때), reported(서버에 마지막으로 알린 상태)


def hf_report(state, msg=""):
    """Higgsfield 크레딧 상태를 서버에 알린다(설정 화면 표시, 작업 버튼 경고)"""
    HF_STATE["reported"] = state
    try:
        W["req"]("POST", "/worker/hf_status", {"state": state, "message": msg[:300]})
    except Exception:
        pass


NB2_QUALITY = ("\n\nPHOTO QUALITY (this image is made with a photo model — keep it clean): professional editorial photography, shot on a full-frame camera with a 35-50mm lens, "
               "soft even natural light, clean consistent color grading, crisp focus on the subject with smooth natural background blur, smooth gradients in sky, walls and veils. "
               "NO blotches, smudges, stains, mottled patches, painterly or watercolor texture, grain, noise, banding, JPEG artifacts, melted or warped screens, hands or faces. "
               "Screens show clean abstract data visuals. Any overlay or veil is a smooth even gradient, never patchy. All Korean text is sharp, correctly spelled and evenly rendered. Text has NO drop shadow, glow or outline — at most a barely visible very soft shadow; heavy text shadows look cheap.\n"
               "KOREAN TEXT (strict): print each quoted Korean string exactly as given, character by character, in a clean bold Korean sans-serif (Gothic) typeface — "
               "never invent, merge, drop or substitute syllables, never add any other text. Small lines (slogan, date, labels) are set at a clearly readable size, not tiny.")


NB2_HEAD = ("READ THIS FIRST: everything in this message is a drawing instruction, not text for the image. Print ONLY the Korean strings given as slide text "
            "(the headline, the wireframe/content text, labels in quotes) — exactly as written, word for word. Never print any instruction sentence or English phrase from this message "
            "(such as the page description, '16:9', 'SI', 'body', color codes, block names). Never invent numbers, durations, percentages or claims that are not in the given text. All text is Korean Hangul exactly as given — never translate it into Japanese, Chinese characters or English.\n\n")


NB2_PLAIN = ("A PICTURE WITH NO TEXT AT ALL. This message describes a photograph; none of its words may appear in the image. "
             "The image contains no letters, words, numbers, captions, titles, headlines, labels, signs or watermarks in any language — "
             "screens, papers and panels show only abstract shapes, lines and charts without characters.\n\n")


def is_nb2(model):
    return bool(model) and ("gemini" in str(model) or "nano" in str(model).lower())


def gen_image(job, prompt, refs, aspect, extra_imgs=None, sref=None, front=False, model=None, plain=False):
    """이미지 모델 호출. refs = 카탈로그 번호('B07'…), extra_imgs = 이미 만든 data URL(표지 참고 그림 등).
    화풍 기준(reference/style + B08)을 늘 붙인다. 참고 그림이 이 PC 에 없으면 한 번 알린다(그림 느낌이 크게 달라진다)."""
    if is_nb2(model) and "PHOTO QUALITY (this image" not in prompt:   # 나노바나나는 지시문 첫 줄·영문 지시를 글자로 찍고, 숫자를 지어낸다
        if plain:   # 글자 없는 그림(배경·그림 칸) — 글을 하나도 넣지 않는다
            prompt = NB2_PLAIN + prompt + NB2_QUALITY.split("All Korean text")[0]
        else:
            prompt = NB2_HEAD + prompt + NB2_QUALITY
    if not plain:
        prompt += lang_image_override(getattr(job, "lang", "ko"))
    got = [b for b in (ref_image_b64(n) for n in refs) if b]
    if refs and len(got) < len(refs) and not getattr(job, "_ref_warned", False):
        job._ref_warned = True
        job.event("참고 시안 그림이 이 엔진 PC 에 없어 글 지시만으로 그립니다 — 인물·일러스트 느낌이 기준과 달라질 수 있습니다. "
                  "엔진을 다시 띄우면 서버에서 참조 묶음을 받습니다.", "warn")
    imgs = list(extra_imgs or [])
    st = getattr(job, "style", None) or {}
    other = bool(st.get("body_refs")) or plain
    if plain:   # 글 지시만으로 — 타입 참고 그림·화풍 견본을 붙이지 않는다(글 없는 배경 그림)
        pass
    elif other and front:   # 표지·목차·간지 — 그 타입의 실제 표지·목차·간지 장만 넘긴다(본문 장을 넘기면 본문처럼 그린다)
        prompt += ("\n\nDESIGN TYPE '" + str(st.get("name", "")) + "': the reference page(s) are REAL cover / contents / divider pages from the company's proposal decks — "
                   "follow their composition, picture device, typography scale and where the text sits; colors and background follow the RULES above. Do not copy their text, logos or exact picture.")
    elif other:   # 다른 디자인 타입 — 그 타입의 실제 본문 장이 화풍 기준. 카탈로그(타입 A) 그림은 넘기지 않는다(넘기면 색만 다른 A 가 된다)
        if str(sref) not in [str(c.get("n")) for c in (st.get("catalog") or [])]:
            sref = None   # 목록에 없는 번호(확인 단계에서 타입을 바꾼 경우 등)는 버린다
        first = styles.ref_file(st["id"], sref)   # 기획이 이 장에 고른 참고 장 — 맨 먼저 넘긴다(배치·구성의 본보기)
        files = ([first] if first else []) + [f for f in styles.refs(st["id"], 3) if f != first]
        imgs += [b for b in (file_b64(f) for f in files[:3]) if b]
        if first:
            what = next((c.get("what", "") for c in (st.get("catalog") or []) if str(c.get("n")) == str(sref)), "")
            prompt += ("\n\nCLOSEST MODEL for this slide: the first design-type reference photo" + (f" ({what})" if what else "")
                       + " — build this slide with the same kind of structure and visual treatment, with our own content.")
        prompt += ("\n\nDESIGN TYPE '" + str(st.get("name", "")) + "': the reference photos (after the wireframe, if any) are REAL BODY SLIDES of this design type — "
                   "follow their colors, typography, header treatment, density, and card/photo/illustration style exactly. Do not copy their content.")
    elif front:   # 타입 A 의 표지·목차·간지 — 클레이 화풍 견본을 붙이지 않는다(앞장은 실사·3D 기기·플랫 일러스트)
        imgs += got
    elif st.get("body_render") in ("line_flat", "iso3d"):   # 타입 F(선화)·E(아이소 3D) — 본문 그림도 앞장과 같은 가는 선 플랫 일러스트(클레이 견본·클레이 시안 그림을 붙이지 않는다 — 붙이면 그 화풍을 따라 그린다)
        own_cover = os.path.join(job.dir, "_mockup", "cover_plain.png")   # 이 덱의 표지(로고 입히기 전) — 있으면 그것이 견본(한 덱 안에서 그림이 같아 보이게)
        if os.path.isfile(own_cover):
            sample = file_b64(own_cover)
        else:
            tset = front_set(job, {}) or {}
            n0 = (tset.get("cover") or [3])[0]
            sample = file_b64(os.path.join(ref_dir(), "mockups", "표지템플릿", f"{int(n0):03d}_템플릿.jpg"))
        if sample:   # 그림 화풍만 본뜬다
            imgs.append(sample)
            prompt += ("\n\nTHE LAST REFERENCE IMAGE IS THIS DECK'S COVER — use it as the DRAWING-STYLE SAMPLE: draw every picture, person, device and icon on this slide "
                       "in exactly the same rendering style as the cover's picture (same line or render treatment, same palette, same kind of figures, "
                       "same way screens and buildings are drawn), so the cover and this slide clearly belong to one deck. "
                       "Do NOT copy the cover's layout, background color, title text or logos — only its drawing style.")
        prompt += ("\n\nRENDERING OVERRIDE: wherever the text above says 3D clay, clay characters or soft clay icons, draw them instead as "
                   + (st.get("body_style_en") or "thin-outline flat vector illustrations (thin dark outlines, limited palette of 2-3 colors, small figures at work). No 3D, no photographs")
                   + ", the same style as the deck's cover and dividers. "
                   "The reference images show layout only — do not copy their rendering style.")
    elif st.get("body_photo"):   # 본문은 A 공통이지만 그림은 실사 쪽(C·D) — 클레이 견본·클레이 시안 그림 대신 이 덱의 표지를 그림 견본으로
        own_cover = os.path.join(job.dir, "_mockup", "cover_plain.png")
        sample = file_b64(own_cover) if os.path.isfile(own_cover) else None
        if sample:
            imgs.append(sample)
            prompt += ("\n\nTHE LAST REFERENCE IMAGE IS THIS DECK'S COVER — use it as the PICTURE-STYLE SAMPLE: the photographs on this slide must look like the cover's "
                       "(same realistic photography, same color grading and light, same framing device such as hexagon crops or data overlays), so the cover and this slide clearly belong to one deck. "
                       "Do NOT copy the cover's layout, background, title text or logos, and do not make this slide a full photograph like the cover — photos only inside this slide's picture blocks.")
        how = ("REAL PHOTOGRAPHS (editorial photography, natural light, real materials) in rounded photo cards; no illustration, no clay, no cartoon"
               if st["body_photo"] == "strong" else
               "semi-realistic 3D / subtle photoreal (real materials, soft photographic lighting, gentle depth of field)")
        prompt += ("\n\nRENDERING OVERRIDE: wherever the text above says 3D clay, clay characters or soft clay icons, render them instead as " + how
                   + ". People are realistic Korean professionals shown from behind, from the side or as hands at work — no large frontal faces. "
                   "The reference images show layout only — do not copy their rendering style.")
    else:
        imgs += got
        if STYLE_REF and STYLE_REF not in refs:
            b = ref_image_b64(STYLE_REF)
            if b:
                imgs.append(b)
        imgs += style_refs()
    if imgs and not other and not front and st.get("body_render") == "glass_light":   # 타입 E — 클레이 견본은 그대로, 유리 질감만 살짝
        prompt += ("\n\nRENDERING NOTE: keep the clay character style of the sample, but give devices, system objects and icons a light translucent blue-glass touch "
                   "(soft highlights) — subtle, so the slide stays easy to read.")
    if imgs and not other and not front and not st.get("body_photo") and st.get("body_render") not in ("line_flat", "iso3d"):   # 타입 A 본문만 — 마지막 그림은 클레이 인물 화풍 견본
        prompt += ("\n\nReference images: the first one(s) show the layout to follow (an approved wireframe if given, otherwise layout grammar only — never copy a reference's scene). The last one is ONLY a "
                   "CHARACTER RENDERING STYLE sample (soft flat painted look, dot-eyed face, clothes, colors): do NOT copy its pose, gesture, expression or composition — "
                   "people act exactly as the Scene above says (no head-holding or thinking pose unless the Scene asks for it).")
    if not front and not plain and (st.get("body_photo") or st.get("body_render") in ("line_flat", "iso3d")):   # 화풍 지시를 맨 앞에 — 뒤에만 두면 앞의 '3D clay' 지시에 진다
        style_now = st.get("body_style_en") or ("REAL PHOTOGRAPHS (editorial photography, natural light) — including every person: the main character of the scene is also a real photographed Korean professional seen from behind or from the side, never a cartoon or 3D character" if st.get("body_photo") == "strong" else
                     "semi-realistic 3D with real materials and soft photographic lighting" if st.get("body_photo") else
                     "THIN-OUTLINE FLAT VECTOR ILLUSTRATION (thin dark outlines, 2-3 flat colors, small figures)")
        prompt = ("PICTURE STYLE FOR THIS SLIDE (overrides any 3D clay wording below): every picture, person and icon is drawn as "
                  + style_now + ". No soft clay characters, no clay icons. The style changes HOW pictures look, not how much space they take: "
                  "the slide is still a message slide — text cards, numbers and the conclusion band stay as the main content and pictures stay inside their picture blocks (about 35% of the body at most); "
                  "never turn the slide into a photo collage or a full-bleed photograph.\n\n" + prompt)
    if getattr(job, "image_provider", "openrouter") == "higgsfield" and not HF_STATE.get("no_credits"):   # 관리자 설정 — Higgsfield 로(실패하면 OpenRouter 로)
        import higgsfield, higgsfield_mcp
        try:
            if higgsfield_mcp.connected():   # 엔진 PC 가 Higgsfield MCP 에 로그인해 있으면 구독 크레딧으로(API 키·API 크레딧 불필요)
                try:
                    png = higgsfield_mcp.image(job, prompt, imgs[:5], aspect, photo=bool(model and "gemini" in str(model)))
                except higgsfield_mcp.NoCredits as e:
                    raise higgsfield.NoCredits(str(e))
                u = getattr(job, "_hf_last", None) or {}
                try:   # 크레딧 사용을 작업 이력에(구독 크레딧 — OpenRouter 비용에는 넣지 않는다)
                    cr = float(u.get("credits") or 0)
                    W["req"]("POST", f"/worker/jobs/{job.id}/usage", {"kind": "hf", "model": "higgsfield:" + str(u.get("model") or "") + f" {cr:g}cr",
                                                                     "cost": round(cr * float(W["CFG"].get("hf_usd_per_credit", 0.04)), 4), "turns": int(round(cr * 100))})
                except Exception:
                    pass
            else:
                png = higgsfield.image(job, prompt, imgs[:5], aspect, photo=bool(model and "gemini" in str(model)), cfg=W["CFG"])
            if HF_STATE.get("reported") != "ok":
                hf_report("ok")
            return png
        except (Cancelled, Budget):
            raise
        except higgsfield.NoCredits as e:   # 크레딧 소진 — 서버에 알리고(설정 화면·버튼 경고), 이 엔진은 OpenRouter 로
            HF_STATE["no_credits"] = time.time()
            hf_report("no_credits", str(e))
            job.event("Higgsfield 크레딧이 소진되어 이번 그림부터 OpenRouter 로 만듭니다. Higgsfield 콘솔에서 충전해 주세요.", "warn")
        except Exception as e:
            if not getattr(job, "_hf_warned", False):
                job._hf_warned = True
                job.event(f"Higgsfield 로 그림을 만들지 못해 OpenRouter 로 만듭니다: {str(e)[:200]}", "warn")
    # OpenRouter 이미지 API: prompt + aspect_ratio + quality + input_references(참고 시안) → data[].b64_json
    refs = [{"type": "image_url", "image_url": {"url": b}} for b in imgs[:5]]
    body = {"prompt": prompt, "aspect_ratio": aspect, "quality": W["CFG"].get("image_quality", "high"), "n": 1}
    if model:   # 이 그림만 다른 모델로(표지·간지 배경의 나노바나나 2 등). 비우면 설정한 시안 모델
        body["model"] = model
    if refs:
        body["input_references"] = refs
    # 모델마다 받는 값이 다르다 — 모르는 값(unknown parameter `x`)이라고 거절하면 그 값을 빼고 다시,
    # 참고 이미지를 못 받는 모델이면 참고 이미지를 빼고 다시 (최대 4번)
    for _ in range(4):
        try:
            r = ai(job, "image", body)
            break
        except RuntimeError as e:
            msg = str(e)
            if "400" not in msg:
                raise
            m = re.search(r"unknown parameter [`'\"]?(\w+)", msg)
            if m and m.group(1) in body and m.group(1) != "prompt":
                body.pop(m.group(1))
                job.event(f"이 이미지 모델은 `{m.group(1)}` 값을 받지 않아 빼고 다시 만듭니다.")
            elif "input_references" in body:
                body.pop("input_references")
                job.event("참고 이미지를 받지 않는 모델이라 글 지시만으로 만듭니다.", "warn")
            else:
                raise
    else:
        raise RuntimeError("이미지 모델이 요청 형식을 받지 않습니다.")
    png = image_of(r)
    if not png:
        raise RuntimeError("이미지 모델이 그림을 돌려주지 않았습니다: " + text_of(r)[:200])
    return png


# ── 표지·목차·간지 시안 — 본문처럼 이미지 모델이 그리고, 확정하면 엔진이 장표로 옮긴다 ──
# 참고 그림: reference/front/<표지|목차|간지>/ 에 올린 것을 먼저, 없으면 카탈로그의 완성 장표
FRONT = {"cover": ("표지", ["B01", "C01"]), "toc": ("목차", ["B03", "C02"]), "div": ("간지", ["B04", "C03"])}

FRONT_TEMPLATE = """The {what} of a professional Korean public-sector SI proposal deck. FULL SLIDE, landscape, edge to edge. Text has no heavy drop shadow, glow or outline (at most a barely visible soft shadow). Korean text only; all text must be legible and use exactly these Korean strings (do not translate, do not invent extra text).

Follow the composition grammar of the first reference image(s) — a real {what} of this design type: big confident typography and generous empty space. Do NOT copy their text, logos or their exact picture. No page number, no header bar, no slide border.

{detail}

{style_front}

RULES FOR THIS PAGE in this design type (Korean — follow every line; they decide where the text, the logos and the picture go and what the background is):
{rules}

Typography: the big title, chapter titles, "PART"/chapter numbers and the word 목차 use a heavy Korean sans; small items use a clean regular sans. Two clearly different weights. The big type (project name, chapter titles, 목차) is set TIGHT and solid: letter-spacing slightly tight (about -2%) and line height about 1.18× the font size (lines close together, no airy gaps). The picture (if the rules allow one) expresses the theme: {theme}.
"""

CORNER = {"tl": "TOP-LEFT corner", "tr": "TOP-RIGHT corner", "bl": "BOTTOM-LEFT corner", "br": "BOTTOM-RIGHT corner", "bc": "BOTTOM-LEFT corner"}
_TPL = {}


def front_templates():
    """reference/front/templates.json — 발표자료 템플릿 72장의 분류와 표지·목차·간지 한 벌(sets)"""
    if "d" not in _TPL:
        try:
            _TPL["d"] = json.load(open(os.path.join(ref_dir(), "front", "templates.json"), encoding="utf-8"))
        except Exception:
            _TPL["d"] = {}
    return _TPL["d"]


def front_set(job, plan):
    """타입 A — 이 작업이 쓸 템플릿 한 벌. 작업 id 로 고정해 표지·목차·간지가 같은 덱으로 보이고, 다시 만들어도 같은 벌이다"""
    sets = front_templates().get("sets") or []
    if not sets:
        return None
    sid = str(((getattr(job, "style", None) or {}).get("front_set")) or plan.get("front_set") or "")   # 타입마다 고정한 벌이 먼저
    hit = next((x for x in sets if x.get("id") == sid), None)
    if hit is None:
        hit = sets[sum(str(job.id).encode()) % len(sets)]
        plan["front_set"] = hit["id"]
    return hit


# 앞장 배경 장식 — 해외 PPT 레퍼런스에서 배운 표지 배경(docs/ppt-레퍼런스-디자인-학습-2026-10-12.md §7.1).
# 템플릿 한 벌이 배경을 정하지 않는 타입에만 쓴다. 작업 id 로 하나를 골라 표지·목차·간지가 같은 장식을 쓴다.
FRONT_TREATMENTS = [
    "one smooth TRANSLUCENT GLASS 3D RIBBON (frosted glass with soft refraction, in the accent color {accent} fading to white) sweeping in a gentle S-curve across the picture side and the lower edge",
    "one smooth TRANSLUCENT GLASS 3D RIBBON (frosted glass with soft refraction, in the accent color {accent} fading to white) sweeping in a gentle S-curve across the picture side and the lower edge",
    "a soft HALFTONE DOT field that flows from the accent color {accent} at one corner to white, dots shrinking smoothly",
    "a few silky PARALLEL WAVE LINES (thin, evenly spaced, the accent color {accent} at low opacity) flowing across the lower part",
    "two or three large BLURRED SOFT RINGS / glowing circles in the accent color {accent} and its light tints, out of focus",
]


# 간지 라이트톤 — 템플릿 한 벌 8개 중 7개가 '전면 코발트·짙은 남색 덮개' 간지라 그대로 따르면 밝은 표지 뒤에 어두운 간지가 붙었다(2026-10-14 시험 작업).
# 사용자 기준: 표지·간지는 밝은 라이트톤, 그림은 오른쪽 아래에 옅게, 왼쪽·위는 흰색으로 날림, 정면 인물 X. 한 벌·참고 그림의 어두운 배경보다 이것이 먼저다.
DIV_LIGHT = ("\nLIGHT TONE (this overrides any dark, cobalt or navy full-page background named in the rules, the template set or the reference images — take only their layout from them): "
             "the divider is a bright, light page like the cover — a white or very pale tint background, never a full-page dark or saturated fill and never a dark color veil over a photo. "
             "The picture sits at the RIGHT / LOWER RIGHT and takes about 40-50% of the page, light but clearly visible (at most a soft 20-25% white veil), and fades to white toward the left and the top. "
             "The chapter number and title are in the deck's dark color on the light background, the key words highlighted with the accent color. "
             "No large frontal faces — people only from the side, from behind or at a distance.\n")


def deck_blue(st):
    """앞장 그림·장식에 쓸 덱의 파랑 — 강조색(사용자 선택, 기본 분홍)은 엔진이 얹는 글(핵심어·뱃지)에만 쓴다"""
    return str(((st or {}).get("front_draw") or {}).get("key") or "#2563EB")


def front_treatment(job, k, accent):
    """이 덱 앞장의 배경 장식 한 줄(영문). 간지는 더 조용하게"""
    import zlib
    if (getattr(job, "style", None) or {}).get("front_accent") is False:   # 배경 처리가 프롬프트에 이미 있는 타입(B·E) — 강조색 고리·물결을 얹으면 그 규칙과 부딪힌다(2026-10-15 분홍 고리)
        return ""
    blue = deck_blue(getattr(job, "style", None))   # 장식은 덱의 파랑 — 강조색(기본 분홍)으로 그리면 배경과 안 어울린다(10-15)
    t = FRONT_TREATMENTS[zlib.crc32(str(getattr(job, "id", "")).encode()) % len(FRONT_TREATMENTS)].replace("the accent color {accent}", "a soft blue " + blue).replace("{accent}", blue)
    if k == "div":
        return ("BACKGROUND ACCENT (same deck decoration as the cover, but quieter): " + t
                + " — kept small and faint, only near one edge, never behind the chapter title.")
    return ("BACKGROUND ACCENT of this deck (learned from premium proposal covers): " + t
            + ". It stays BEHIND everything, low in contrast where text is laid, never touches the corners kept empty, contains no text, and is the only decoration — no other patterns.")


def front_logo_zones(st, kind="cover"):
    """(발주기관 자리, 제안사 자리) — 그 타입의 템플릿 한 벌(sets[].logos)에서. 자리: tl·tr·bl·br·bc, 없으면 None"""
    sid = str((st or {}).get("front_set") or "")
    tset = next((x for x in (front_templates().get("sets") or []) if x.get("id") == sid), None) or {}
    lg = list((tset.get("logos") or {}).get(kind) or (["tl", "bl"] if kind == "cover" else ["bl", "br"]))
    if kind == "cover":   # 표지는 타입과 상관없이 발주기관 왼쪽 위 · 주관사 왼쪽 아래(사용자 10-15) — 한 벌 설정이 거꾸로(헥사곤)거나 오른쪽 아래(네이비)면 그림 자리와 부딪혔다
        return "tl", "bl"
    return lg[0], lg[1]


def front_specs(plan, opts, title, project):
    """옵션(표지·목차·간지)과 기획의 장·절로 만들 앞장 목록. id = cover · toc · div1…"""
    from frontmatter import chapters
    lc = str((opts or {}).get("lang") or "ko")
    f = (opts or {}).get("front") or {"cover": True, "toc": True, "divider": True}
    slides = plan.get("slides") or []
    chs = chapters(slides)
    multi = len([c for c in chs if c["name"]]) >= 2
    out = []
    if f.get("cover"):
        out.append({"id": "cover", "kind": "cover", "label": "표지", "title": title, "project": project,
                    "tail": str((opts or {}).get("event") or "").strip() or (front_word(lc, "submit", "제안서") if str((opts or {}).get("purpose") or "present") == "submit" else front_word(lc, "present", "제안설명회")),
                    "date": str((opts or {}).get("date") or "").strip(), "slogan": str(plan.get("slogan") or "").strip()})
    if f.get("toc") and slides:
        out.append({"id": "toc", "kind": "toc", "label": "목차",
                    "chapters": [{"no": i + 1, "name": c["name"] or front_word(lc, "body", "본문"), "items": [t for _, t in c["items"]]} for i, c in enumerate(chs)]})
    if f.get("divider") and multi:
        for i, c in enumerate(chs):
            pc = next((x for x in (plan.get("chapters") or []) if isinstance(x, dict) and str(x.get("name") or "").strip() == c["name"]), {})
            out.append({"id": f"div{i + 1}", "kind": "div", "label": f"간지 {i + 1}", "no": i + 1, "name": c["name"], "desc": divider_line(pc), "items": [t for _, t in c["items"]]})
    if f.get("ending", True) and slides:   # 맨 뒤 세트 — 감사합니다(엔딩) · 질의응답 안내
        out.append({"id": "end", "kind": "end", "label": "엔딩", "title": front_word(lc, "end", "감사합니다"), "desc": ""})
        out.append({"id": "qna", "kind": "qna", "label": "질의응답", "title": front_word(lc, "qna", "질의응답"), "desc": "Q&A"})
    # 시안 확인 화면에서 사람이 고친 글(plan.front_edit) — 사업명·행사 이름·날짜·장 이름. 장 이름은 목차에도
    fe = plan.get("front_edit") if isinstance(plan.get("front_edit"), dict) else {}
    for x in out:
        for k, v in (fe.get(x["id"]) or {}).items():
            if k in ("title", "project", "tail", "date", "name", "desc", "slogan") and str(v).strip():
                x[k] = str(v).strip()
        if x["kind"] == "toc":
            for c in x["chapters"]:
                nm = str((fe.get(f"div{c['no']}") or {}).get("name") or "").strip()
                if nm:
                    c["name"] = nm
    return out


def front_refs(kind, st=None, tset=None):
    """표지·목차·간지 참고 그림(data URL 목록).
    타입 A: 템플릿 한 벌(tset)의 그 종류 그림 → 없으면 reference/front/<표지|목차|간지>/ 의 그림.
    다른 타입: 그 타입 refs 가운데 front_refs 에 적힌 표지·목차·간지 장"""
    st = st or {}
    if not tset and st.get("id", "a") != "a":
        fs = [styles.ref_file(st["id"], n) for n in ((st.get("front_refs") or {}).get(kind) or [])]
        return [b for b in (file_b64(p) for p in fs[:2] if p) if b]
    if tset:
        fs = [os.path.join(ref_dir(), "mockups", "표지템플릿", f"{int(n):03d}_템플릿.jpg") for n in (tset.get(kind) or [])]
        got = [b for b in (file_b64(p) for p in fs[:3] if os.path.isfile(p)) if b]
        if got:
            return got
    d = os.path.join(ref_dir(), "front", FRONT[kind][0])
    fs = sorted(glob.glob(os.path.join(d, "*.png")) + glob.glob(os.path.join(d, "*.jpg")) + glob.glob(os.path.join(d, "*.jpeg")))
    return [b for b in (file_b64(p) for p in fs[:3]) if b]


def divider_short(job, plan, f, long_line=""):
    """간지 장 이름 아래 한 줄 — 8~20자 약속 한 줄, 핵심어 하나를 **이렇게**. 한 번 지으면 plan['div_lines'][장 이름] 에 남긴다. 실패하면 빈 글"""
    name = str(f.get("name") or "").strip()
    keep = plan.setdefault("div_lines", {}) if isinstance(plan.get("div_lines", {}), dict) else {}
    if keep.get(name):
        return keep[name]
    items = " / ".join(str(t).replace("**", "") for t in (f.get("items") or [])[:6])
    try:
        o = _plan_call(job, '너는 공공 SI 제안서 간지 카피라이터다. JSON 하나만 출력한다: {"line": "…"}',
                       f"사업: {plan.get('title') or ''}\n장 이름: {name}\n이 장의 내용: {items}\n참고 문장: {long_line.replace('**', '')}\n\n"
                       "간지에서 장 이름 바로 아래 찍을 한 줄을 지어라 — 이 장이 무엇을 말하는지 짧고 분명하게, 제안사가 위원에게 말하는 1인칭 존댓말"
                       "(~습니다! / ~하겠습니다), 공백 포함 8~18자, 한 줄, 수치를 늘어놓지 않는다. 핵심어 하나만 **이렇게** 감싼다. "
                       "예: '**정확하게** 알고 있습니다!', '**치밀하게** 준비했습니다!', '누수를 **먼저** 찾겠습니다'", 300, "간지 한 줄", timeout=120)
        t = re.sub(r"\s+", " ", str((o or {}).get("line") or "")).strip().strip('"「」')
        t = t if 4 <= len(t.replace("**", "")) <= 24 else ""
    except Exception as e:
        job.event(f"간지 한 줄을 짓지 못해 원래 문장을 씁니다: {str(e)[:100]}", "warn")
        t = ""
    if t:
        plan["div_lines"] = dict(keep, **{name: t})
    return t


def cover_slogan(job, plan, project=""):
    """표지 사업명 위 작은 키메시지 — 기획에 없으면(옛 작업·MD 기획) 글 모델로 한 번 짓고 기획에 남긴다. 실패하면 빈 글"""
    s = str(plan.get("slogan") or "").strip()
    if s:
        return s
    try:
        o = _plan_call(job, '너는 공공 SI 제안서 표지 카피라이터다. JSON 하나만 출력한다: {"slogan": "…"}',
                       f"사업명: {project or plan.get('title') or ''}\n제안 핵심: {plan.get('core') or ''}\n\n"
                       "표지 사업명 바로 위에 작게 찍을 키메시지 한 줄을 지어라 — 공백 포함 12~22자, 사업이 지향하는 모습을 '…을 위한'·'…으로' 꼴로"
                       "(예: '스마트한 도시, 더 안전한 내일을 위한'). 사업명 낱말을 되풀이하지 않고, 자료에 없는 수치를 넣지 않는다.", 300, "표지 키메시지", timeout=120)
        s = re.sub(r"\s+", " ", str((o or {}).get("slogan") or "")).strip().strip('"「」')[:30]
    except Exception as e:
        job.event(f"표지 키메시지를 짓지 못해 빼고 만듭니다: {str(e)[:100]}", "warn")
        s = ""
    if s:
        plan["slogan"] = s
    return s


def make_front_mockup(job, f, plan, accent, feedback=""):
    import datetime
    if f["kind"] in ("end", "qna"):   # 엔딩·질의응답 — 간지와 같은 한 벌의 모습(배경·그림·글 배치), PART 번호 없이 큰 글 + 한 줄
        f = dict(f, kind="div", no=None, name=f.get("title") or ("감사합니다" if f["kind"] == "end" else "질의응답"), items=[], closing=f["kind"])
    k = f["kind"]
    theme = " / ".join([str(plan.get("title") or f.get("title") or "")] + [str(s.get("title") or "").replace("**", "") for s in (plan.get("slides") or [])[:3]])
    if k == "div":   # 간지 — 그 장(章)의 내용이 그림의 주제다(간지마다 다른 그림)
        theme = (f"chapter '{f.get('name', '')}' of the project '{plan.get('title') or ''}' — what this chapter is about: "
                 + " / ".join(str(t).replace("**", "") for t in (f.get("items") or [])[:6]))
    draw = {}   # 엔진이 서체로 얹을 글(나노바나나 앞장)
    if k == "cover":
        big = f.get("project") or f.get("title") or plan.get("title") or ""   # 표지 큰 글 = 사업명(작업 이름은 파일 이름인 경우가 많다). 사람이 넣은 줄바꿈은 그대로
        slogan = f.get("slogan") or cover_slogan(job, plan, big)   # 사업명 바로 위 작은 키메시지 — A~F 모든 타입(2026-10-15 사용자)
        draw = {"title": big, "small": slogan,
                "tail": f.get("tail") or "제안설명회", "date": f.get("date") or datetime.date.today().strftime("%Y. %m.")}
        detail = ((f'Small key message line right above the title (one line, about 40% of the title size, regular weight, dark color): "{slogan}"\n' if slogan else "")
                  + f'Proposal title (largest text, at most 2 lines, line break exactly where shown): "{big}"\n'
                  + 'No other slogan line and no stage mark such as "(1차)" unless it is given above — never invent one.\n'
                  + f'Small tail label right under the title (accent color): "{f.get("tail") or "제안설명회"}"\n'
                  + f'Date (very small, under the tail label): "{f.get("date") or datetime.date.today().strftime("%Y. %m.")}"\n'
                  "Do not draw any logo.")
    elif k == "toc":
        rows = "\n".join(f'{c["no"]}. {c["name"]}' for c in f["chapters"])
        draw = {"label": front_word(getattr(job, "lang", "ko"), "toc", "목차"), "tag": plan.get("title") or "",
                "rows": [(c["no"], re.sub(r"^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩIVX0-9]+[.．]\s*", "", str(c["name"])) or c["name"]) for c in f["chapters"]]}
        if len(f["chapters"]) == 1:
            rows = "\n".join(f"{i + 1}. {t}" for i, t in enumerate(f["chapters"][0]["items"][:14]))
            draw["rows"] = [(i + 1, str(t).replace("**", "")) for i, t in enumerate(f["chapters"][0]["items"][:14])]
        detail = (f'Table of contents. Label "{front_word(getattr(job, "lang", "ko"), "toc", "목차")}". Numbered list — chapter names only, big and bold (number style and colors as the rules below say):\n{rows}\n'
                  f'Very small tag at the top-right: "{plan.get("title") or ""}"')
    else:
        first = next((s for s in (plan.get("slides") or []) if str(s.get("chapter") or str(s.get("section") or "").split(" · ")[0]).strip().startswith(str(f.get("name") or "").strip()[:4])), None)
        # 간지 설명은 그 장의 핵심 한 줄 — 사람이 고친 것(desc) → 개요의 장 핵심(goal) → 장의 첫 키메시지 원문
        desc = str(f.get("desc") or "")
        if f.get("no") is not None and MEMO_TONE.search(desc.replace("**", "").strip()):
            desc = ""   # 옛 기획의 메모 말투(goal)는 간지에 찍지 않는다 — known_errors divider-memo-tone
        line = desc if f.get("no") is None else (desc or str((first or {}).get("title") or (f.get("items") or [""])[0]))
        line = re.sub(r"\s*(\.\.\.|…)+\s*", " ", line).strip()
        if f.get("no") is not None and (not desc or len(line.replace("**", "")) > 22):   # 간지 한 줄은 8~20자 약속 한 줄 — 개요를 안 거친 짧은 기획은 장 첫 제목(긴 문장)이 들어갔다(10-15)
            line = divider_short(job, plan, f, line) or line
        name = re.sub(r"^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩIVX0-9]+[.．]\s*", "", f["name"]) or f["name"]
        draw = {"no": f["no"], "name": name, "line": line, "tag": plan.get("title") or ""}
        detail = ((f'Closing page of the deck ({"thank-you page" if f.get("closing") == "end" else "questions and answers page"}) — NO chapter number, NO "PART". Only the big title "{name}" in the largest bold type.\n') if f.get("no") is None else
                  f'Chapter divider page. Chapter number "PART {f["no"]}" (or "{f["no"]:02d}" / a Roman numeral, as the rules say) and the chapter title "{name}" in the largest bold type.\n'
                  + (f'Under the title, about half the title size, with its key words emphasised — write it COMPLETELY, exactly as given, with the line break where shown (never cut it, never add "..." or "…"):\n"{line}"\n' if line else "")
                  + f'Very small tag at the top-right: "{plan.get("title") or ""}"\n'
                  "Nothing else — no list of sections, no bullets, no numbered items.")
    if k == "toc":   # 참고 그림이 4단이면 없는 장(03·04)을 지어내거나 참고 그림의 글을 베낀다 — 개수를 못 박는다
        n_it = len(f["chapters"]) if len(f["chapters"]) > 1 else len(f["chapters"][0]["items"][:14])
        detail += (f"\nThere are EXACTLY {n_it} numbered entries — draw exactly {n_it}, numbered 01 to {n_it:02d}. Do NOT add a further number or entry to fill the layout "
                   "(if the reference shows 4 columns and we have fewer, draw fewer and wider columns or a vertical list).")
    if k == "div":
        detail += "\nNo numbered slots (never draw 01 02 03 04 columns) and no sentence other than the ones given above."
    detail += "\nEvery word on the page comes from the strings above (plus the fixed labels the rules name). Never copy any text from the reference images. Never shorten a string with \"...\" or \"…\" — no ellipsis anywhere on the page."
    detail += ("\nFULL BLEED: background pictures, photos, illustrations and color areas run to the page edges they touch — never a picture that stops short of the bottom or a side edge leaving a stray white strip or margin under it.")
    st = getattr(job, "style", None) or styles.get("a")
    is_a = st.get("id", "a") == "a"
    zones = [CORNER[z] for z in front_logo_zones(st, k) if z in CORNER]
    if zones:   # 로고(발주기관·제안사)는 엔진이 붙인다 — 그 자리를 비워 둔다
        size = "about 22% of the width x 13% of the height each" if k == "cover" else "about 16% of the width x 9% of the height each"
        detail += (f"\nLOGO AREAS: leave the {' and the '.join(zones)} EMPTY (a left logo starts on the same left line as the text) — plain background only, no text, no picture detail and no drawn logo ({size}): "
                   "the logos are pasted there afterwards. Do NOT write any placeholder word there (never 로고, 클라이언트 로고, 발주기관, 제안사, LOGO, client, vendor), "
                   "and do NOT draw a box, panel, frame or darker patch for it — the background simply continues there untouched.")
    detail += ("\nPICTURE RULES: the photograph / illustration contains NO readable text, letters, numbers, signage, UI labels, watermarks, brand names or company / product logos "
               "(screens and documents inside the picture show abstract shapes only). Any people are Korean and shown from behind, from the side, at a distance or as hands at work — "
               "never a large frontal face looking at the camera (public-sector SI proposals avoid exposing real-looking faces).")
    detail += ("\nHIGHLIGHT RULE: to emphasise key words either color the words themselves, or put a SOLID color band fully behind them — the band is taller and wider than the words "
               "(padding on all four sides) and the words on it are WHITE. Never a half-height marker stripe that only overlaps the lower part of dark text.")
    fr = (st.get("front_rules") or {}).get(k) or {}
    rules = "\n".join(f"- {lab}: {fr[key]}" for key, lab in (("text", "글 배치"), ("logo", "로고"), ("image", "그림"), ("bg", "배경")) if fr.get(key))
    common = (front_templates().get("common") or {}).get(k) or []
    if common:   # 표지 템플릿에서 배운 뼈대 — 타입과 상관없이 같다. 모습만 아래 타입 규칙을 따른다
        rules = ("[공통 뼈대 — 무엇이 어디에 놓이는가]\n" + "\n".join("- " + x for x in common)
                 + "\n[이 디자인 타입의 모습 — 색·글자·그림·배경. 뼈대와 다르면 이 타입 규칙의 '글 배치'가 정한 정렬을 따른다]\n" + rules)
    tset = None if st.get("front_free") else front_set(job, plan)   # front_free — 템플릿 한 벌의 그림·설명을 쓰지 않는 타입(B)
    if tset and tset.get(k + "_what"):   # 한 벌의 그 장 모습 — 표지·목차·간지가 같은 덱으로 보이게
        rules += f"\n- 이 덱의 한 벌 '{tset.get('name', '')}': {tset[k + '_what']}. (그림은 표지·다른 장의 것을 다시 쓰지 않고, 같은 화풍으로 이 장의 주제에 맞게 새로 만든다.) 첫 참고 그림(들)이 바로 이 모습이다 — 구성·배경·색·글 자리·그림 장치를 거의 그대로 따른다(이 벌의 모습이 기준이다). 그림 화풍: {tset.get('art', '')}. 본문의 3D 클레이 캐릭터는 쓰지 않는다."
    if str(((st.get("front_engine") or {}).get(k)) or "main") in ("nb2", "both", "gpt"):   # 배경만 그리는 엔진 — 로고라는 말을 쓰면 '클인로고'·빈 상자를 그린다
        rules = "\n".join(l for l in (("" if l.strip().startswith("- 로고") else re.sub(r"[,·]\s*[^,·\n]*로고[^,·.)\n]*", "", l)) for l in rules.splitlines())
                          if l and "로고" not in l and "logo" not in l.lower())   # 로고 줄은 빼고, 다른 줄 속 '로고 …' 구절만 지운다
        detail = re.sub(r"\nLOGO AREAS:.*?(?=\nPICTURE RULES:)",
                        ("\nQUIET CORNERS: keep the " + " and the ".join(zones) + " completely empty — the same background simply continues there "
                         "(no text, no word, no box, no panel, no frame, no lighter or darker patch, no object).") if zones else "", detail, flags=re.S)
    prompt = FRONT_TEMPLATE.format(what={"cover": "COVER page", "toc": "TABLE OF CONTENTS page", "div": "CHAPTER DIVIDER page"}[k],
                                   detail=detail, accent=accent or "#FF2A6D", theme=theme, rules=rules or "- (없음)",
                                   style_front=str(st.get("front") or "").replace("{accent}", accent or "#FF2A6D"))
    learned = read(os.path.join(ref_dir(), "guide", "학습-표지목차간지.md"), 10000) if is_a else ""   # 템플릿에서 배운 앞장 문법 — 코발트·클레이 기준이라 타입 A 에만
    if learned:
        prompt += "\nStyle rules learned from the company's real decks (Korean — follow them so this page matches the body slides; where they differ from the RULES FOR THIS PAGE above, the rules above win):\n" + learned + "\n"
    if k != "cover" and str(((st.get("front_engine") or {}).get(k)) or "main") in ("nb2", "both", "gpt"):   # 타입 front 문구는 표지 장면을 그린다 — 목차·간지는 이 장의 규칙 장면만
        prompt += ("\nPICTURE OF THIS PAGE: the deck style text above describes the COVER's scene; take only its colors, light and rendering from it. "
                   "The picture on this page is exactly what the RULES FOR THIS PAGE say under '그림' — a different subject, different objects and a different composition.\n")
    if not (tset and tset.get(k + "_what")):   # 한 벌이 배경을 정하지 않는 타입 — 배운 표지 배경 장식 하나
        prompt += "\n" + front_treatment(job, k, accent) + "\n"
    if feedback:
        prompt += f"\nRevision request from the user (must apply): {feedback}\n"
    own = front_refs(k, st, tset)
    cat = [] if own or not is_a else FRONT[k][1]
    cover_p = os.path.join(job.dir, "_mockup", "cover_plain.png")
    if k != "cover":   # 표지 그림은 참고로 넘기지 않는다 — 넘기면 그 인물·장면을 그대로 다시 그린다(중복 금지). 한 벌의 느낌은 글로만 맞춘다
        if True:
            prompt += ("\nThis page belongs to the same deck as the cover (made separately). It must look like the same set: the same color palette, the same background treatment, "
                       "the same typeface feeling and the same picture STYLE (same kind of photograph / illustration / render, same colors). "
                       "But the picture itself must be NEW — a different scene that fits THIS page's own subject (see the theme); never reuse or redraw the cover's picture. Do not repeat the cover's title text or logos.\n")
            if k == "div":
                prompt += ("A CHAPTER DIVIDER IS A QUIET PAGE — it only announces that a new section starts; it must NOT look like a cover. Calm, LIGHT background (see LIGHT TONE below); the chapter number, title and one line are the whole page. "
                           "The picture is one clear scene at the right / lower right (about 40-50% of the page), light and calm; the title block stays at the top-left. "
                           "No vivid photograph, no large illustration scene, no decorative icons scattered around. At least two thirds of the page is empty.\n")
                prompt += DIV_LIGHT
    cover_bg = os.path.join(job.dir, "_mockup", "cover_bg.png")
    # 타입마다 정한 모델(front_engine): main = 기본 시안 모델 / nb2 = 나노바나나 2 로 통째 / both = 배경 그림은 나노바나나 2, 글은 기본 모델
    mode = str(((st.get("front_engine") or {}).get(k)) or "main")
    nb2 = str(W["CFG"].get("nb2_model") or styles.nb2_model())
    if mode in ("nb2", "both", "gpt"):   # 그림만 그림 모델로(글자 없이), 글은 엔진이 실제 서체로 — 그림 모델은 한글을 깨뜨린다. gpt = 배경도 기본 시안 모델(A·F, 2026-10-15)
        try:
            job.event(f"{f.get('label', k)} — 그림은 " + ("기본 시안 모델" if mode == "gpt" else "나노바나나 2") + ", 글은 엔진이 서체로 얹습니다.")
            panel = ((st.get("front_draw") or {}).get("panel") or {}).get(k)
            bgp = ("BACKGROUND PICTURE ONLY for the " + {"cover": "cover page", "toc": "table-of-contents page", "div": "chapter divider page"}[k]
                   + " of a Korean public-sector proposal deck. Landscape, full-bleed, edge to edge. ABSOLUTELY NO text, letters, numbers, logos, brand names, watermarks, signs or UI labels anywhere "
                   "(screens and documents show abstract shapes only). Any people are Korean and shown from behind, from the side, at a distance or as hands at work — never a large frontal face. " + ("Realistic photograph quality." if st.get("body_photo") else "Premium render quality in the deck's own style (not a photograph).") + "\n"
                   + f"Subject of the photo (describe it visually — never write these words in the image): the field of the project '{plan.get('title') or ''}'"
                   + (", one chapter of it (show one fitting object or place)" if k == "div" else "") + "\n"
                   + "Rules for the picture and background (Korean):\n"
                   + "\n".join(f"- {fr[key]}" for key in (("image",) if panel else ("image", "bg")) if fr.get(key))
                   + ("\nComposition: a FULL-BLEED photograph that fills the whole frame edge to edge (shown as a side photo panel) — no white or gray margins, no empty washed areas, no decorative line patterns.\n" if panel else
                      {"left": "\nComposition: keep the LEFT 45% of the picture calm, even and low in detail (large text is laid there later); put the subject in the RIGHT 55%. Keep the top-left and bottom-left corners plain.\n",
                       "right": "\nComposition: keep the RIGHT 48% of the picture calm, even and low in detail (large text is laid there later); put the subject in the LEFT half. Keep the top-left and bottom-left corners plain.\n",
                       "center": "\nComposition: keep the TOP HALF of the picture calm, even and low in detail (large centered text is laid there later); put the subject in the LOWER HALF, centered. Keep the corners plain.\n"}[__import__("frontdraw").layout_of(st, k)])
                   + "Every object sits fully inside the frame with a comfortable margin — nothing is cut off at the edges.\n")
            if k == "cover":   # 글꼴 설명(Typography …)은 넘기지 않는다 — 넘기면 그림 모델이 제목을 그려 넣는다
                bgp += str(st.get("front") or "").split("Typography")[0].replace("{accent}", deck_blue(st))
            else:   # 목차·간지 — 표지와 같은 화풍·색, 그러나 다른 장면(표지 설명을 그대로 넘기면 같은 그림이 나온다)
                bgp += (f"Picture style of this deck (keep the same style, lighting and color mood): {(tset or {}).get('art', '')} "
                        + str(st.get("front") or "").split("Typography")[0].replace("{accent}", deck_blue(st)) + "\n"
                        "This is NOT the cover. Show a DIFFERENT subject and composition from the cover of the same deck — different people (or no people), a different place, object or moment that fits the Subject above. "
                        "Never repeat the cover's scene. " + ("For the contents page show the PLACE or the EQUIPMENT of the project (a wide, calm view) with no people in the foreground. " if k == "toc" else "") + "\n")
                if tset and tset.get(k + "_what"):
                    bgp += (f"Background treatment of this page (Korean): {tset[k + '_what']}\n"
                            "Take ONLY the background color, shapes and where the picture sits from that description. Draw NO list, numbers, dots, bullets, "
                            "placeholder lines, titles, labels or words (no '목차', no '제안서') — every text and list marker is added afterwards by the engine.\n")   # 10-15 A 목차 배경에 GPT 가 '제안서 목차'·점 목록을 그렸다
                if k == "div" and not panel:
                    bgp += ("DIVIDER PAGE (follows the company's divider templates): the big chapter title and one short line are laid later on the calm TOP-LEFT area, so keep the LEFT 45% and the top band plain. "
                            "The picture is ONE clear scene or object group of this chapter's subject at the RIGHT / LOWER RIGHT, about 40-50% of the page, fully inside the frame — not a tiny corner element. "
                            "Everything else is calm background.\n")   # 10-15 사용자: 간지 그림이 너무 작다 — 20% 이하 지시를 고침
                if k == "div":
                    bgp += DIV_LIGHT
            if not panel and not (tset and tset.get(k + "_what")):
                bgp += front_treatment(job, k, accent) + "\n"
            if feedback:
                bgp += f"\nRevision request from the user (apply what concerns the picture): {feedback}\n"
            bgp += "\nThe subject of the picture comes ONLY from the Subject above (this project's own field, place and equipment) - never an unrelated product or object."
            bp = os.path.join(job.dir, "_mockup", f"{f.get('id', k)}_bg.png")   # 배경 그림은 따로 남긴다(장표로 옮길 때 그대로 쓴다)
            os.makedirs(os.path.dirname(bp), exist_ok=True)
            if False:   # (표지 배경을 다시 쓰지 않는다 — 목차·간지마다 주제에 맞는 새 그림을 만든다)   # 간지는 표지의 배경 그림을 그대로 이어 쓴다(템플릿이 그렇다) — 한 벌, 호출도 줄어든다
                import shutil
                shutil.copyfile(cover_bg, bp)
            else:
                bg = gen_image(job, bgp, [], "3:2", None, model=(None if mode == "gpt" else nb2), plain=True)   # 참고 그림을 넘기지 않는다 — 넘기면 그 그림의 피사체를 그대로 베낀다
                with open(bp, "wb") as fp:
                    fp.write(bg)
            import frontdraw
            return frontdraw.compose(k, open(bp, "rb").read(), draw, st, accent, getattr(job, "font_title", None), getattr(job, "font_body", None),
                                     front_logo_zones(st, k))
            b64 = None
            if b64:
                prompt += ("\nTHE FIRST REFERENCE IMAGE IS THE FINISHED BACKGROUND PICTURE OF THIS PAGE. Use it as it is — same picture, same framing, same colors; do not redraw, replace or crop it. "
                           "Keep every pixel of the photograph sharp and unchanged; do not repaint, re-texture or blur it. "
                           "Only add what the rules ask on top of it: the tint/overlay (if any, as one smooth even gradient) and the text, placed in the calm area. The reference image(s) of other decks show ONLY the typography and text placement - never bring their photo, product or objects into this page.\n")
                extra = [b64] + own[:1] + (own[-1:] if len(own) > 1 else [])
                try:   # 실사 사진 위 합성도 나노바나나 2 — GPT 가 합성하면 사진을 다시 그리며 얼룩이 생긴다
                    return gen_image(job, prompt, cat, "3:2", extra, front=True, model=nb2)
                except (Cancelled, Budget):
                    raise
                except Exception as e:
                    job.event(f"나노바나나 2 로 글을 얹지 못해 기본 시안 모델로 얹습니다: {str(e)[:160]}", "warn")
                return gen_image(job, prompt, cat, "3:2", extra, front=True)
        except (Cancelled, Budget):
            raise
        except Exception as e:
            job.event(f"나노바나나 2 배경을 만들지 못해 기본 시안 모델만으로 만듭니다: {str(e)[:160]}", "warn")
            traceback.print_exc()
    return gen_image(job, prompt, cat, "3:2", own, front=True)


def logo_horizontal(lg):
    """세로형 로고(심볼 위, 글자 아래)를 가로형(심볼 왼쪽, 글자 오른쪽)으로 다시 놓는다. 가로형이면 그대로.
    가로로 끊긴 가장 큰 빈 줄에서 위·아래를 나누고, 위(심볼)를 글자 높이의 1.6배로 맞춰 왼쪽에 둔다"""
    from PIL import Image
    if lg.width / max(1, lg.height) >= 2.2:
        return lg
    a = lg.split()[3]
    rows = [max(a.crop((0, y, lg.width, y + 1)).getextrema()[1], 0) for y in range(lg.height)]
    best, cur, start = None, 0, 0
    for y, v in enumerate(rows):
        if v < 24:
            if cur == 0:
                start = y
            cur += 1
        else:
            if cur and start > lg.height * 0.2 and (best is None or cur > best[1]):
                best = (start, cur)
            cur = 0
    if not best:
        return lg
    top = lg.crop((0, 0, lg.width, best[0]))
    bot = lg.crop((0, best[0] + best[1], lg.width, lg.height))
    tb, bb = top.getbbox(), bot.getbbox()
    if not tb or not bb:
        return lg
    top, bot = top.crop(tb), bot.crop(bb)
    th = int(bot.height * 1.6)
    top = top.resize((max(1, int(top.width * th / top.height)), th), Image.LANCZOS)
    gap = int(bot.height * 0.45)
    out = Image.new("RGBA", (top.width + gap + bot.width, max(th, bot.height)), (0, 0, 0, 0))
    out.paste(top, (0, (out.height - th) // 2), top)
    out.paste(bot, (top.width + gap, (out.height - bot.height) // 2), bot)
    return out


def save_front(job, fid, png, kind):
    """앞장 시안 → 2400×1600(장표 비율) 로 맞추고, 표지는 로고를 아래 양쪽에 입힌다. 반환: 올릴 jpg 경로"""
    from PIL import Image
    d = os.path.join(job.dir, "_mockup")
    os.makedirs(d, exist_ok=True)
    im = Image.open(io.BytesIO(png)).convert("RGB")
    with open(os.path.join(d, f"{fid}_raw.png"), "wb") as fp:   # 로고 입히기 전 원본 — 로고만 바꿀 때 그림을 다시 만들지 않는다
        fp.write(png)
    F = FRAME
    r = max(F["w"] / im.width, F["h"] / im.height)   # 꽉 채우고 넘치는 쪽을 가운데에서 자른다
    im = im.resize((int(im.width * r + 0.5), int(im.height * r + 0.5)), Image.LANCZOS)
    x, y = (im.width - F["w"]) // 2, (im.height - F["h"]) // 2
    im = im.crop((x, y, x + F["w"], y + F["h"]))
    if kind == "cover":
        im.save(os.path.join(d, "cover_plain.png"))
    placed = []
    if kind in ("cover", "toc", "div"):   # 로고 자리는 그 타입의 템플릿 한 벌에서(tl/tr/bl/br/bc). 바탕이 어두우면 흰 둥근 판을 깐다
        from PIL import ImageDraw, ImageStat
        lh = 72 if kind == "cover" else 50
        for which, pos in zip(("client", "vendor"), front_logo_zones(getattr(job, "style", None) or styles.get("a"), kind)):
            lg = brand_logo(job, which) if pos else None
            if lg is None:
                continue
            bb = lg.getbbox()   # 투명 여백을 걷어 내고 크기를 잰다
            if bb:
                lg = lg.crop(bb)
            lg = logo_horizontal(lg)   # 심볼 위·글자 아래(세로형) 로고는 심볼 왼쪽·글자 오른쪽으로
            # 크기는 면적으로 맞춘다 — 가로형·세로형(엠블럼 위·글자 아래) 로고가 같은 무게로 보이게. 발주기관 로고는 제안사 로고보다 15% 크게
            side = lh * 2.6 * (1.15 if which == "client" else 1.0)   # √(가로×세로) 목표(px). 가로형 로고(6:1)면 높이 약 lh
            r = side / (lg.width * lg.height) ** 0.5
            lg = lg.resize((max(1, int(lg.width * r)), max(1, int(lg.height * r))), Image.LANCZOS)
            if lg.width > 640:
                lg = lg.resize((640, max(1, int(lg.height * 640 / lg.width))), Image.LANCZOS)
            mx = F["pad"]   # 로고도 좌우 가이드(본문 틀 여백 56px)에 맞춘다 — 앞장 글 시작선과 같다
            x0 = F["w"] - mx - lg.width if pos.endswith("r") else mx
            y0 = 70 if pos.startswith("t") else F["h"] - lg.height - 70
            box = (x0, y0, x0 + lg.width, y0 + lg.height)
            # 로고는 판을 깔지 않고 투명하게 — 흰 바탕째 올린 로고는 흰 부분을 비우고, 어두운 바탕이면 흰색 로고로
            px = lg.load()
            if lg.getextrema()[3][0] == 255:   # 투명한 곳이 없는 로고(흰 바탕 JPG 등)
                for j in range(lg.height):
                    for i in range(lg.width):
                        r, g, b, a = px[i, j]
                        if min(r, g, b) > 238:
                            px[i, j] = (r, g, b, 0)
            wl = brand_logo(job, which + "_white") if sum(ImageStat.Stat(im.crop(box).convert("RGB")).mean) / 3 < 150 else None
            if wl is not None and wl.getbbox():   # 어두운 바탕 — 함께 올린 흰색 로고(공식 흰색판)를 같은 크기로
                wl = logo_horizontal(wl.crop(wl.getbbox()))
                wl = wl.resize((lg.width, max(1, int(wl.height * lg.width / wl.width))), Image.LANCZOS)
                y1 = y0 + (lg.height - wl.height) // 2
                im.paste(wl, (x0, max(0, y1)), wl)
                placed.append((which, wl, x0, max(0, y1)))
                continue
            if sum(ImageStat.Stat(im.crop(box).convert("RGB")).mean) / 3 < 150:   # 흰색판이 없으면 로고 모양을 흰색으로
                for j in range(lg.height):
                    for i in range(lg.width):
                        a = px[i, j][3]
                        if a:
                            px[i, j] = (255, 255, 255, a)
            im.paste(lg, (x0, y0), lg)
            placed.append((which, lg, x0, y0))
    # 붙인 로고를 투명 PNG 그대로 남긴다 — 장표로 옮길 때 시안에서 자르지 않고 이 파일을 같은 자리에 넣는다(시안에서 자르면 바탕까지 잘려 불투명해진다)
    for old in glob.glob(os.path.join(d, f"{fid}_logo_*.png")):
        os.remove(old)
    info = []
    for which, img, x, y in placed:
        fn = f"{fid}_logo_{which}.png"
        img.save(os.path.join(d, fn))
        info.append({"file": fn, "which": which, "x": round(x / F["w"] * 100, 2), "y": round(y / F["h"] * 100, 2),
                     "w": round(img.width / F["w"] * 100, 2), "h": round(img.height / F["h"] * 100, 2)})
    json.dump(info, open(os.path.join(d, f"{fid}_logos.json"), "w", encoding="utf-8"), ensure_ascii=False)
    im.save(os.path.join(d, f"{fid}.png"))
    jp = os.path.join(d, f"{fid}.jpg")
    t = im.copy()
    t.thumbnail((1600, 1600))
    t.save(jp, quality=90, optimize=True)
    return jp


HEAD_STRIP = 0.11   # 본문 그림 위쪽 비워 둔 띠(키메시지 자리)


def draw_headline(job, png, s):
    """본문 그림 위 띠를 바탕색으로 덮고 키메시지를 고정 크기 한 줄로 — 강조어는 강조색, 너무 길면 같은 크기로 두 줄"""
    from PIL import Image, ImageDraw, ImageFont, ImageStat
    import fontset
    im = Image.open(io.BytesIO(png)).convert("RGB")
    W_, H_ = im.size
    sh = int(H_ * HEAD_STRIP)
    band = im.crop((0, 0, W_, sh))
    col = tuple(int(v) for v in ImageStat.Stat(im.crop((0, 0, W_, max(4, int(H_ * 0.015))))).median)   # 맨 위 가장자리 바탕색(불투명하게 덮는다)
    ImageDraw.Draw(im).rectangle([0, 0, W_, sh], fill=col)
    st = getattr(job, "style", None) or {}
    title = re.sub(r"\*\*", "", str(s.get("title") or "")).strip()
    kws = [k for k in keywords_of(s) if k and k in title]
    tid = getattr(job, "font_title", None) or None
    path = fontset.title_file(tid if tid in fontset.TITLES else None)
    size = int(H_ * 0.058)
    f = ImageFont.truetype(path, size)
    track = size * -0.017
    def width(t):
        return sum(f.getlength(c) for c in t) + track * max(0, len(t) - 1)
    maxw = W_ * 0.90
    lines = [title]
    if width(title) > maxw:   # 같은 크기로 두 줄 — 가운데에 가까운 띄어쓰기에서
        sp = [i for i, c in enumerate(title) if c == " "]
        if sp:
            k = min(sp, key=lambda i: abs(i - len(title) / 2))
            lines = [title[:k].strip(), title[k:].strip()]
        while max(width(l) for l in lines) > maxw and size > 20:
            size -= 2
            f = ImageFont.truetype(path, size)
            track = size * -0.017
    hx = lambda h: tuple(int(str(h).lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))
    base = hx(st.get("head_color") or "#0B2E6B")
    acc = hx(getattr(job, "accent", "") or "#FF2A6D")
    left = ((st.get("frame") or {}).get("key_align") == "left")
    lh = size * 1.18
    y = (sh - lh * len(lines)) / 2 + (lh - size) / 2
    d = ImageDraw.Draw(im)
    for ln in lines:
        x = W_ * 0.05 if left else (W_ - width(ln)) / 2
        spans = []   # (글자, 강조?)
        i = 0
        while i < len(ln):
            hit = next((k for k in kws if ln.startswith(k, i)), None)
            if hit:
                spans += [(c, True) for c in hit]
                i += len(hit)
            else:
                spans.append((ln[i], False))
                i += 1
        for c, em in spans:
            d.text((x, y), c, font=f, fill=acc if em else base)
            x += f.getlength(c) + track
        y += lh
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


def save_mockup(job, n, png, s=None, project=""):
    """본문 PNG 보관(sNN_body.png) → 틀을 입힌 시안(sNN.png) → 올리기용 JPG(1600폭)"""
    d = os.path.join(job.dir, "_mockup")
    os.makedirs(d, exist_ok=True)
    bp = os.path.join(d, f"s{n:02d}_body.png")
    with open(bp, "wb") as f:
        f.write(png)
    if s and s.get("title"):   # 키메시지는 엔진이 같은 크기로
        try:
            with open(bp, "wb") as f:
                f.write(draw_headline(job, png, s))
        except Exception as e:
            job.event(f"{n}번 장 키메시지를 얹지 못했습니다: {str(e)[:120]}", "warn")
    p = os.path.join(d, f"s{n:02d}.png")
    im = compose_frame(job, bp, s or {"n": n}, project)
    im.save(p)
    im.thumbnail((1600, 1600))
    jp = os.path.join(d, f"s{n:02d}.jpg")
    im.save(jp, quality=90, optimize=True)
    return jp


def where(x, y):
    """핀 위치(0~1)를 말로 — 엔진·이미지 모델이 알아듣게"""
    h = "왼쪽" if x < 0.34 else "오른쪽" if x > 0.66 else "가운데"
    v = "위" if y < 0.34 else "아래" if y > 0.66 else "중간"
    return f"{h} {v} (가로 {x * 100:.0f}%, 세로 {y * 100:.0f}%)"


def comments_by_slide(j):
    out = {}
    for c in j.get("comments") or []:
        t = f"[{'결과 장표' if c.get('target') == 'result' else '시안'} · {where(float(c['x']), float(c['y']))}] {c['body']} — {str(c.get('email', '')).split('@')[0]}"
        for r in c.get("replies") or []:
            t += f" / 답글({str(r.get('email', '')).split('@')[0]}): {r['body']}"
        out.setdefault(int(c["slide"]), []).append(t)
    return out


def project_of(j):
    """머리 띠 오른쪽에 넣는 사업명 (시작 옵션)"""
    o = j.get("opts")
    if isinstance(o, str):
        try:
            o = json.loads(o)
        except Exception:
            o = None
    return str((o or {}).get("project") or "") or "(없음 — 비워 둔다)"


def lessons_text(j):
    """자가 개선 — 서버 개선 체크리스트에서 반복된 결함(lessons)을 지시문 한 덩어리로. 없으면 빈 글."""
    ls = [x for x in (j.get("lessons") or []) if isinstance(x, dict) and str(x.get("text") or "").strip()]
    if not ls:
        return ""
    rows = "\n".join(f"- {str(x['text']).strip()} (지난 작업 {int(x.get('hits') or 0)}회)" for x in ls[:12])
    return "지난 작업들에서 반복된 결함 — 이번에는 처음부터 피한다(사용자 요청이 우선):\n" + rows


def known_errors():
    """한 번 나온 오류 목록(engine/known_errors.json) — 기본 규칙·게이트 보고·회귀 시험이 같이 읽는다"""
    try:
        return json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "known_errors.json"), encoding="utf-8")).get("items") or []
    except Exception:
        return []


def known_hits(hits):
    """게이트가 잡은 [{slug,slide,count}] 를 slug 별로 합치고 제목·영역·규칙을 붙인다 — 서버가 개선 체크리스트 known:<slug> 에 쌓는다"""
    by = {x.get("slug"): x for x in known_errors()}
    out = {}
    for h in hits or []:
        k = str(h.get("slug") or "").strip()
        if not k:
            continue
        e = out.setdefault(k, {"slug": k, "slides": [], "count": 0, "area": (by.get(k) or {}).get("area") or "type",
                               "title": (by.get(k) or {}).get("title") or k, "rule": (by.get(k) or {}).get("rule") or ""})
        e["count"] += int(h.get("count") or 1)
        if h.get("slide") and h["slide"] not in e["slides"]:
            e["slides"].append(h["slide"])
    return list(out.values())


def base_rules_text(areas=None):
    """기본 규칙 — known_errors.json(한 번 나온 오류의 단일 원천)을 지시문 목록으로. engine 영역(배포·저장소 규칙)은 빼고."""
    items = known_errors()
    if not items:
        return "(없음)"
    rows = [f"- {x['rule'].strip()}" + (f" — 검사: {x['gate'].split(' — ')[0]}" if x.get("gate") else "")
            for x in items if x.get("rule") and x.get("area") != "engine" and (not areas or x.get("area") in areas)]
    return "\n".join(rows) or "(없음)"


def comments_text(j):
    """장표 제작 지시문에 넣을 핀 의견 목록"""
    by = comments_by_slide(j)
    if not by:
        return "(없음)"
    return chr(10).join(f"- {n}쪽 {t}" for n in sorted(by) for t in by[n])


def push_plan_preview(job, plan):
    """기획이 나오면 바로 plan.json 을 올린다 — 끝날 때만 올리면 진행 화면이 비어 있다"""
    try:
        d = os.path.join(job.dir, "_mockup")
        os.makedirs(d, exist_ok=True)
        pj = os.path.join(d, "plan.json")
        json.dump(plan, open(pj, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        W["put_file"](job.id, "mockup", pj, "plan.json")
    except Exception as e:
        job.event(f"기획 미리 보기를 올리지 못했습니다(진행에는 영향 없음): {str(e)[:120]}", "warn")


def run_plan_phase(job, j):
    """기획 → 시안. 끝나면 서버에 review 로 보고한다. 취소는 감시 스레드가 처리한다."""
    watch(job)
    try:
        _plan_phase(job, j)
    except Cancelled:
        pass
    except Exception:
        if job.cancel:  # 취소 뒤에 난 오류(409 등)는 무시
            return
        raise
    finally:
        job.plan_done = True


def _plan_phase(job, j):
    req, put_file, download = W["req"], W["put_file"], W["download"]
    job.style = styles.get(styles.of_job(j))
    job.accent = (j.get("theme") or "#FF2A6D")[:7]
    job.lang = lang_of(j)
    job.font_body = str(((j.get("opts") if isinstance(j.get("opts"), dict) else json.loads(j.get("opts") or "{}")) or {}).get("font_body") or "")   # 비면 fontset 기본(목록 첫 줄)
    job.font_title = str(((j.get("opts") if isinstance(j.get("opts"), dict) else json.loads(j.get("opts") or "{}")) or {}).get("font_title") or "")
    job.spent = float(j.get("spent_usd") or 0)
    job.budget = float(j["budget_usd"]) if j.get("budget_usd") not in (None, "") else None
    note = (j.get("note") or "").strip()
    _ls = lessons_text(j)   # 자가 개선 — 기획·시안 지시에도 넣는다
    if _ls:
        note = (note + "\n\n" if note else "") + _ls
    review = j.get("review")
    if isinstance(review, str):
        try:
            review = json.loads(review)
        except Exception:
            review = None
    plan = j.get("plan")
    if isinstance(plan, str):
        try:
            plan = json.loads(plan)
        except Exception:
            plan = None

    # 1) 내용
    job.push("준비", 2)
    if j.get("source_kind") == "pptx":
        src = os.path.join(job.dir, "원본.pptx")
        if not os.path.isfile(src):
            job.event("초안 pptx 를 내려받는 중")
            download(f"/worker/jobs/{job.id}/source", src)
        brief = pptx_text(src)
        job.event(f"초안에서 글을 읽었습니다 ({len(brief):,}자).")
    else:
        brief = j.get("brief") or ""

    opts = j.get("opts")
    if isinstance(opts, str):
        try:
            opts = json.loads(opts)
        except Exception:
            opts = None
    opts = opts or {"mockups": "all"}  # 옵션 없는 옛 작업은 전체
    if str(opts.get("purpose") or "") == "submit" and j.get("source_kind") != "pptx":
        import vertical   # 제출용 = A4 세로 제안서 — 기획부터 표지·목차·간지·본문 제작·결과 보고까지 한 번에(시안 확인 단계 없음)
        vertical.run(job, j, opts, brief, note)
        return
    first_run = not (plan and plan.get("slides"))

    # 2) 기획 (다시 만들기면 기존 기획을 쓴다)
    redo = {int(x["n"]): x.get("feedback", "") for x in (review or {}).get("redo", [])} if review else {}
    fredo = [str(x) for x in ((review or {}).get("front_redo") or [])]   # 표지·목차·간지 다시 만들기(id 또는 종류)
    if (not plan or not plan.get("slides")) and brief:
        ready = parse_plan_md(brief)   # 이미 만든 기획 파일(.md)을 올렸으면 기획 호출 없이 그대로 쓴다
        if ready:
            plan = ready
            for x in plan["slides"]:
                x["wire"] = clean_wire(x.get("wire"))
            fact_check(plan, "")   # 올린 기획 파일 — 자료와 맞댈 수 없어 메타 문구·워터마크만 본다
            if any(not x["wire"] for x in plan["slides"]):
                make_wires(job, plan, only_empty=True)
            job.event(f"올려 주신 기획 파일을 그대로 씁니다 — {len(plan['slides'])}장 (기획 AI 호출 없음, 비용 0).", "done")
    if not plan or not plan.get("slides"):
        job.push("기획", 4)
        context = load_context(job, 1200000)  # 싼 모델이 읽으므로 넉넉히 (자료별 고르게)
        raw_ctx = context or ""
        if context:
            context = digest_context(job, context)
        job.push("기획", 6)
        job.event("기획 중 — 장을 나누고 구성·참고 시안을 정합니다" + (" (맥락 자료 반영)" if context else ""))
        plan = make_plan(job, brief, note, context, int(opts.get("slides") or 0), str(opts.get("purpose") or "present"), raw=raw_ctx)
        job.event(f"기획 완료 — {len(plan['slides'])}장. 비용 ${job.spent:.3f}", "done")
        job.push("기획", 12)
        push_plan_preview(job, plan)   # 진행 화면의 '기획 미리 보기' — 시안을 기다리는 동안 읽게
        make_wires(job, plan)
        push_plan_preview(job, plan)
        n_chk = fact_check(plan, brief + chr(10) + (context or ""))   # 자료에 없는 수치·과장·메타 문구 — AI 없이
        if n_chk:
            job.event(f"근거 확인 {n_chk}곳 — 자료에서 찾지 못한 수치·강한 표현·메타 문구를 장마다 표시했습니다. 시안 전에 확인해 주세요.", "warn")
    else:
        job.event(f"기존 기획을 씁니다 — {len(plan['slides'])}장" + (f", {len(redo)}장 다시" if redo else ""))
    job.push("기획", 18)

    # 3) 시안 — 다시 만들 장 또는 아직 없는 장만
    have = set()
    for p in glob.glob(os.path.join(job.dir, "_mockup", "s*.jpg")):
        have.add(int(re.search(r"s(\d+)\.jpg$", p).group(1)))
    if not have and not redo:  # 다른 PC 에서 만든 시안이 있으면 받아 둔다
        for s in plan["slides"]:
            n = s["n"]
            try:
                os.makedirs(os.path.join(job.dir, "_mockup"), exist_ok=True)
                download(f"/worker/jobs/{job.id}/files/mockup/s{n:02d}.jpg", os.path.join(job.dir, "_mockup", f"s{n:02d}.jpg"))
                have.add(n)
            except Exception:
                pass
    total = len(plan["slides"])
    if redo:  # 사용자가 고른 장만
        todo = [s for s in plan["slides"] if s["n"] in redo]
    elif fredo:  # 표지·목차·간지만 고름 — 본문은 그대로
        todo = []
    elif first_run:  # 시작 옵션: 기획만 / 샘플 N장 / 전체
        mode = opts.get("mockups", "plan")
        if mode == "plan":
            todo = []
        elif mode == "sample":
            k = max(1, int(opts.get("sample") or 3))
            # 분위기(mood)가 다른 장을 고르게 — 문제 제기·해결·절차가 하나씩 보이게
            seen, todo = set(), []
            for s in plan["slides"]:
                if s.get("mood") not in seen and len(todo) < k:
                    seen.add(s.get("mood")); todo.append(s)
            for s in plan["slides"]:
                if len(todo) >= k:
                    break
                if s not in todo:
                    todo.append(s)
            todo.sort(key=lambda s: s["n"])
        else:
            todo = [s for s in plan["slides"] if s["n"] not in have]
    else:
        todo = [s for s in plan["slides"] if s["n"] not in have]
    # 표지·목차·간지 시안 — 처음 '전체' 로 만들 때, 다시 만들기로 고른 것, 아직 없는 것(본문 시안을 만들 때 함께 — 따로 고르지 않아도 결과를 볼 수 있게)
    # 한국어가 아닌 덱 — 표지 큰 글은 작업 이름(대개 한국어 파일 이름)이 아니라 기획이 그 언어로 지은 제목
    title = str((plan.get("title") if lang_of(j) != "ko" else "") or j.get("title") or plan.get("title") or "")
    specs = front_specs(plan, opts, title, str(opts.get("project") or ""))
    old = {x.get("id"): x for x in (plan.get("front") or []) if isinstance(x, dict)}
    for f in specs:
        if old.get(f["id"], {}).get("status"):
            f["status"] = old[f["id"]]["status"]
    plan["front"] = specs
    ffb = (review or {}).get("front_feedback") or {}
    fhave = {f["id"] for f in specs if os.path.isfile(os.path.join(job.dir, "_mockup", f"{f['id']}.jpg"))}
    if not fhave:
        for f in specs:   # 다른 PC 에서 만든 앞장 시안
            try:
                download(f"/worker/jobs/{job.id}/files/mockup/{f['id']}.jpg", os.path.join(job.dir, "_mockup", f"{f['id']}.jpg"))
                fhave.add(f["id"])
            except Exception:
                pass
    if fredo:
        ftodo = [f for f in specs if f["id"] in fredo or f["kind"] in fredo]
    elif first_run:
        ftodo = specs if opts.get("mockups", "plan") == "all" else []
    else:   # 본문 시안을 만들 때(고른 장이든 남은 장이든) 아직 없는 앞장도 함께 만든다
        ftodo = [f for f in specs if f["id"] not in fhave]
    for f in specs:
        if f["id"] in fhave and f not in ftodo:
            f["status"] = "ok"
    job.push("시안 생성", 20)
    job.event(f"시안 생성 — {len(todo)}장 (전체 {total}장)" + (f" + 표지·목차·간지 {len(ftodo)}장" if ftodo else ""))
    made, fails = 0, []
    stopped = None
    # 시안은 장마다 따로 그리므로 여러 장을 동시에 만든다(기본 3장씩) — 기다리는 시간이 그만큼 줄어든다
    import threading
    from concurrent.futures import ThreadPoolExecutor, as_completed
    halt = threading.Event()   # 한도에 닿으면 아직 시작 안 한 장은 건너뛴다
    accent = (j.get("theme") or "").strip() or "#FF2A6D"
    pins_by = comments_by_slide(j)

    cover_ev = threading.Event()
    # 덱 기준 장 — 시안이 여러 장이면 첫 장을 먼저 그려 _mockup/anchor.png 로 두고, 나머지는 그 장의 색·선·아이콘을 따라 그린다(일관성)
    anchor_p = os.path.join(job.dir, "_mockup", "anchor.png")
    anchor_ev = threading.Event()
    first_n = min((x["n"] for x in todo), default=None)
    # 시험 결과(2026-10-05, Higgsfield): 기준 장 그림을 넘기면 모델이 스타일만이 아니라 내용(수치·표·결론 문장·인물)까지 베꼈다 — 기본은 끈다(config style_anchor=true 로 켬)
    use_anchor = bool(W["CFG"].get("style_anchor"))
    if not use_anchor or os.path.isfile(anchor_p) or len(todo) < 2:
        anchor_ev.set()

    def one(s):
        n = s["n"]
        _st = getattr(job, "style", None) or {}
        if n != first_n:
            anchor_ev.wait(900)
        anc = file_b64(anchor_p, 1600) if use_anchor and os.path.isfile(anchor_p) else None
        if _st.get("body_render") in ("line_flat", "iso3d") or _st.get("body_photo") or _st.get("body_nb2"):
            cover_ev.wait(900)   # 본문 그림이 이 덱의 표지 화풍을 따르도록 표지를 먼저
        if job.cancel or halt.is_set():
            return n, "skip", ""
        try:
            fbk = " / ".join([x for x in [redo.get(n, "")] + [f"pin comment at {p}" for p in pins_by.get(n, [])] if x])
            png = make_mockup(job, s, fbk, accent, anchor=anc if n != first_n or os.path.isfile(anchor_p) else None)
            if use_anchor and n == first_n and not os.path.isfile(anchor_p):
                with open(anchor_p, "wb") as fp:
                    fp.write(png)
                anchor_ev.set()
            jp = save_mockup(job, n, png, s, str(opts.get("project") or ""))
            put_file(job.id, "mockup", jp, f"s{n:02d}.jpg", n)
            for suffix in ("", "_body"):  # slide 번호 없이 올린다 — 화면의 장 목록에는 jpg 만 잡힌다
                fp = os.path.join(job.dir, "_mockup", f"s{n:02d}{suffix}.png")
                if os.path.isfile(fp):
                    try:
                        put_file(job.id, "mockup", fp, f"s{n:02d}{suffix}_full.png" if not suffix else f"s{n:02d}_body.png")
                    except Exception as e:
                        W["log"]("원본 시안 올리기 실패:", e)
            return n, "ok", ""
        except Budget as e:
            halt.set()
            return n, "budget", str(e)
        except Cancelled:
            return n, "skip", ""
        except Exception as e:
            return n, "fail", str(e)
        finally:
            if n == first_n:
                anchor_ev.set()   # 첫 장이 실패해도 나머지가 기다리지 않게

    if not any(f["kind"] == "cover" for f in ftodo):
        cover_ev.set()

    def onef(f):
        fid = f["id"]
        if f["kind"] != "cover":
            cover_ev.wait(900)   # 표지를 보고 그린다(한 벌)
        if job.cancel or halt.is_set():
            cover_ev.set()
            return fid, "skip", ""
        try:
            png = make_front_mockup(job, f, plan, accent, str(ffb.get(fid) or ffb.get(f["kind"]) or ""))
            jp = save_front(job, fid, png, f["kind"])
            if f["kind"] == "cover":
                cover_ev.set()
            put_file(job.id, "mockup", jp, f"{fid}.jpg")   # 쪽번호 없이 — 본문 장 목록과 섞이지 않게
            try:
                put_file(job.id, "mockup", os.path.join(job.dir, "_mockup", f"{fid}.png"), f"{fid}_full.png")
            except Exception as e:
                W["log"]("앞장 원본 올리기 실패:", e)
            return fid, "ok", ""
        except Budget as e:
            halt.set()
            cover_ev.set()
            return fid, "budget", str(e)
        except Cancelled:
            return fid, "skip", ""
        except Exception as e:
            return fid, "fail", str(e)

    by_n = {s["n"]: s for s in todo}
    by_f = {f["id"]: f for f in ftodo}
    done = 0
    with ThreadPoolExecutor(max_workers=max(1, min(int(W["CFG"].get("image_parallel", 6)), len(todo) + len(ftodo) or 1))) as ex:
        ftodo = sorted(ftodo, key=lambda f: f["kind"] != "cover")
        futs = ([ex.submit(onef, f) for f in ftodo if f["kind"] == "cover"] + [ex.submit(one, s) for s in todo]
                + [ex.submit(onef, f) for f in ftodo if f["kind"] != "cover"])
        for fu in as_completed(futs):
            n, st, err = fu.result()
            done += 1
            if n in by_f:   # 표지·목차·간지
                f = by_f[n]
                if st == "ok":
                    f["status"] = "ok"
                    f.pop("error", None)
                    job.event(f"{f['label']} 시안 완성")
                elif st == "budget" and not stopped:
                    stopped = err
                    job.event(stopped, "warn")
                elif st == "fail":
                    f["status"] = "failed"
                    f["error"] = err[:300]
                    job.event(f"{f['label']} 시안 실패: {err[:200]}", "warn")
                job.push("시안 생성", 20 + int(75 * done / max(1, len(futs))))
                continue
            s = by_n[n]
            if st == "ok":
                made += 1
                s["status"] = "ok"
                s.pop("error", None)
                job.event(f"{n}쪽 시안 완성 — {s.get('title', '')} (누적 ${job.spent:.3f}" + (f" / 한도 ${job.budget:.2f}" if job.budget else "") + ")")
            elif st == "budget":
                if not stopped:
                    stopped = err
                    job.event(stopped, "warn")
            elif st == "fail":
                s["status"] = "failed"
                s["error"] = err[:300]
                fails.append(n)
                job.event(f"{n}쪽 시안 실패: {err[:200]}", "warn")
            job.push("시안 생성", 20 + int(75 * done / max(1, len(futs))))
    for s in plan["slides"]:
        if s["n"] in have and s["n"] not in redo and "status" not in s:
            s["status"] = "ok"

    # 4) 정리·보고
    job.push("시안 정리", 96)
    pj = os.path.join(job.dir, "_mockup", "plan.json")
    os.makedirs(os.path.dirname(pj), exist_ok=True)
    with open(pj, "w", encoding="utf-8") as f:
        json.dump(plan, f, ensure_ascii=False, indent=1)
    put_file(job.id, "mockup", pj, "plan.json")
    ok = sum(1 for s in plan["slides"] if s.get("status") == "ok")
    if job.cancel:
        return  # 감시 스레드가 보고함
    job.plan_done = True  # 여기부터는 최종 보고 — 감시 스레드와 겹치지 않게
    stats = [{"label": "장 수", "value": total}, {"label": "시안 완성", "value": ok}, {"label": "AI 비용", "value": f"${job.spent:.3f}"}]
    if ok == 0 and not todo:  # 기획만 먼저 보기
        msg = f"기획이 나왔습니다 — {total}장. 장 구성을 확인하고 시안을 만들 장을 골라 주세요."
        req("POST", f"/worker/jobs/{job.id}/finish", {"status": "review", "plan": plan, "message": msg, "report": {"summary": msg, "stats": stats}})
        return
    if ok == 0:
        req("POST", f"/worker/jobs/{job.id}/finish", {"status": "failed", "error": stopped or ("시안을 한 장도 만들지 못했습니다. " + "; ".join(f"{n}쪽: {next(s.get('error', '') for s in plan['slides'] if s['n'] == n)}" for n in fails[:3])),
                                                     "report": {"stats": stats}})
        return
    msg = f"시안 {ok}/{total}장이 나왔습니다. 장마다 확인하고 확정하면 장표를 만듭니다."
    if stopped:
        msg = f"비용 한도에 도달해 {ok}/{total}장에서 멈췄습니다. 한도를 올리고 '나머지 장 만들기'를 누르면 이어서 만듭니다."
    elif fails:
        msg += f" ({len(fails)}장은 실패 — 다시 만들기로 재시도)"
    req("POST", f"/worker/jobs/{job.id}/finish", {"status": "review", "plan": plan, "message": msg,
                                                 "report": {"summary": msg, "stats": stats}})


def prepare_build(job, j):
    """장표 제작 단계 준비 — 시안·기획·(초안 pptx)을 작업 폴더에 받는다. 반환: plan dict"""
    download, put_file = W["download"], W["put_file"]
    d = os.path.join(job.dir, "_mockup")
    os.makedirs(d, exist_ok=True)
    plan = j.get("plan")
    if isinstance(plan, str):
        plan = json.loads(plan)
    if not plan:
        pj = os.path.join(d, "plan.json")
        download(f"/worker/jobs/{job.id}/files/mockup/plan.json", pj)
        plan = json.load(open(pj, encoding="utf-8"))
    with open(os.path.join(d, "plan.json"), "w", encoding="utf-8") as f:
        json.dump(plan, f, ensure_ascii=False, indent=1)
    got = 0
    for s in plan["slides"]:
        n = s["n"]
        jp = os.path.join(d, f"s{n:02d}.jpg")
        if not os.path.isfile(jp):
            try:
                download(f"/worker/jobs/{job.id}/files/mockup/s{n:02d}.jpg", jp)
            except Exception:
                continue
        got += 1
        put_file(job.id, "before", jp, f"s{n:02d}.jpg", n)  # 비교 화면의 '시안' 쪽
        for remote, local in ((f"s{n:02d}_full.png", f"s{n:02d}.png"), (f"s{n:02d}_body.png", f"s{n:02d}_body.png")):
            lp = os.path.join(d, local)   # 그림을 잘라 쓸 원본 해상도 (없으면 jpg 로 대신한다)
            if not os.path.isfile(lp):
                try:
                    download(f"/worker/jobs/{job.id}/files/mockup/{remote}", lp)
                except Exception:
                    pass
    # 시안이 있는 장만 장표로 만든다 (기획만 있는 장은 이번 제작에서 뺀다)
    made = [s for s in plan["slides"] if os.path.isfile(os.path.join(d, f"s{s['n']:02d}.jpg"))]
    if not made:
        raise RuntimeError("시안이 있는 장이 없습니다.")
    if len(made) < len(plan["slides"]):
        job.event(f"시안이 있는 {len(made)}장만 장표로 만듭니다 (기획만 있는 {len(plan['slides']) - len(made)}장 제외).", "warn")
        plan = dict(plan, slides=made)
        with open(os.path.join(d, "plan.json"), "w", encoding="utf-8") as f:
            json.dump(plan, f, ensure_ascii=False, indent=1)
    # 표지·목차·간지 시안 — 지금 옵션에 켜져 있고 시안이 있는 것만 엔진이 장표로 옮긴다(없으면 코드가 기본 모양으로 넣는다)
    opts = j.get("opts")
    if isinstance(opts, str):
        try:
            opts = json.loads(opts)
        except Exception:
            opts = None
    on = (opts or {}).get("front") or {"cover": True, "toc": True, "divider": True}
    fronts = []
    for f in plan.get("front") or []:
        if not isinstance(f, dict) or not on.get({"cover": "cover", "toc": "toc", "div": "divider"}.get(f.get("kind"), "x")):
            continue
        fid = f.get("id")
        for remote, local in ((f"{fid}.jpg", f"{fid}.jpg"), (f"{fid}_full.png", f"{fid}.png")):
            lp = os.path.join(d, local)
            if not os.path.isfile(lp):
                try:
                    download(f"/worker/jobs/{job.id}/files/mockup/{remote}", lp)
                except Exception:
                    pass
        if os.path.isfile(os.path.join(d, f"{fid}.jpg")):
            fronts.append(f)
    plan = dict(plan, front=fronts)
    with open(os.path.join(d, "plan.json"), "w", encoding="utf-8") as fp:
        json.dump(plan, fp, ensure_ascii=False, indent=1)
    if fronts:
        job.event(f"표지·목차·간지 시안 {len(fronts)}장도 장표로 옮깁니다.")
    for which in ("client", "vendor"):  # 틀에 넣을 로고를 _brand/ 에 받아 둔다
        brand_logo(job, which)
    job.event(f"시안 {got}장을 받았습니다. 장표 제작을 시작합니다.")
    if j.get("source_kind") == "pptx":
        src = os.path.join(job.dir, "원본.pptx")
        if not os.path.isfile(src):
            download(f"/worker/jobs/{job.id}/source", src)
    return plan
