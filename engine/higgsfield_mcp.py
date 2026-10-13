# -*- coding: utf-8 -*-
"""Higgsfield MCP(https://mcp.higgsfield.ai/mcp) — 웹 구독(Plus 등) 크레딧으로 그림을 만든다. API 키·API 크레딧이 필요 없다.

  python higgsfield_mcp.py login     # 브라우저가 열리면 Higgsfield 계정으로 승인(엔진 PC 에서 한 번). 토큰은 worker/higgsfield_mcp.json(git 제외)
  python higgsfield_mcp.py tools     # 쓸 수 있는 도구 목록
엔진은 call(name, args) 로 도구를 부른다. 토큰이 만료되면 refresh_token 으로 저절로 갱신한다.
"""
import base64, hashlib, re, http.server, json, os, secrets, sys, threading, time, urllib.parse, urllib.request, urllib.error, webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
TOK = os.path.join(HERE, "higgsfield_mcp.json")
MCP = "https://mcp.higgsfield.ai/mcp"
AS = "https://mcp.higgsfield.ai"
PORT = 33418
REDIRECT = f"http://127.0.0.1:{PORT}/callback"


def _post(url, data, headers=None, form=False):
    h = dict(headers or {})
    if form:
        body = urllib.parse.urlencode(data).encode()
        h["Content-Type"] = "application/x-www-form-urlencoded"
    else:
        body = json.dumps(data).encode()
        h["Content-Type"] = "application/json"
    rq = urllib.request.Request(url, data=body, method="POST", headers=h)
    try:
        with urllib.request.urlopen(rq, timeout=60) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def _save(d):
    json.dump(d, open(TOK, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def _load():
    try:
        return json.load(open(TOK, encoding="utf-8"))
    except Exception:
        return {}


def login():
    """동적 클라이언트 등록 → PKCE 인가(기본 브라우저) → 토큰"""
    st, _, b = _post(AS + "/oauth2/register", {"client_name": "powerDeck engine", "redirect_uris": [REDIRECT],
                                              "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"],
                                              "token_endpoint_auth_method": "none", "scope": "openid email offline_access"})
    if st >= 300:
        sys.exit(f"클라이언트 등록 실패 {st}: {b[:300]}")
    client = json.loads(b)
    ver = secrets.token_urlsafe(48)
    chal = base64.urlsafe_b64encode(hashlib.sha256(ver.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(16)
    url = AS + "/oauth2/authorize?" + urllib.parse.urlencode({
        "response_type": "code", "client_id": client["client_id"], "redirect_uri": REDIRECT, "scope": "openid email offline_access",
        "code_challenge": chal, "code_challenge_method": "S256", "state": state, "resource": MCP})
    got = {}

    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            got.update({k: v[0] for k, v in q.items()})
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write("<h2>powerDeck — Higgsfield 연결 완료. 이 창은 닫아도 됩니다.</h2>".encode("utf-8"))

        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(("127.0.0.1", PORT), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    print("브라우저에서 Higgsfield 승인을 기다립니다…\n" + url, flush=True)
    webbrowser.open(url)
    t0 = time.time()
    while "code" not in got and "error" not in got and time.time() - t0 < 600:
        time.sleep(0.5)
    srv.shutdown()
    if "code" not in got or got.get("state") != state:
        sys.exit(f"승인을 받지 못했습니다: {got}")
    st, _, b = _post(AS + "/oauth2/token", {"grant_type": "authorization_code", "code": got["code"], "redirect_uri": REDIRECT,
                                           "client_id": client["client_id"], "code_verifier": ver, "resource": MCP}, form=True)
    if st >= 300:
        sys.exit(f"토큰 받기 실패 {st}: {b[:300]}")
    tok = json.loads(b)
    tok["client_id"] = client["client_id"]
    tok["expires_at"] = time.time() + int(tok.get("expires_in") or 3600) - 60
    _save(tok)
    print("ok — Higgsfield MCP 연결됨", flush=True)


def _token():
    t = _load()
    if not t.get("access_token"):
        raise RuntimeError("Higgsfield MCP 에 로그인하지 않았습니다(엔진 PC 에서 python higgsfield_mcp.py login)")
    if time.time() > float(t.get("expires_at") or 0) and t.get("refresh_token"):
        st, _, b = _post(AS + "/oauth2/token", {"grant_type": "refresh_token", "refresh_token": t["refresh_token"], "client_id": t["client_id"], "resource": MCP}, form=True)
        if st >= 300:
            raise RuntimeError(f"Higgsfield MCP 토큰 갱신 실패 {st}: {b[:200]} — 다시 로그인해 주세요")
        n = json.loads(b)
        t.update(n)
        t["expires_at"] = time.time() + int(n.get("expires_in") or 3600) - 60
        _save(t)
    return t["access_token"]


_SESSION = {}


def _rpc(method, params=None, notify=False):
    h = {"Authorization": "Bearer " + _token(), "Accept": "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18"}
    if _SESSION.get("id"):
        h["Mcp-Session-Id"] = _SESSION["id"]
    msg = {"jsonrpc": "2.0", "method": method, "params": params or {}}
    if not notify:
        msg["id"] = int(time.time() * 1000)
    st, hd, b = _post(MCP, msg, h)
    sid = hd.get("Mcp-Session-Id") or hd.get("mcp-session-id")
    if sid:
        _SESSION["id"] = sid
    if st >= 300:
        raise RuntimeError(f"Higgsfield MCP {method} {st}: {b[:300]}")
    if notify:
        return None
    txt = b.decode("utf-8", "replace")
    if "data:" in txt and not txt.lstrip().startswith("{"):   # SSE
        for line in txt.splitlines():
            if line.startswith("data:"):
                d = json.loads(line[5:].strip())
                if d.get("id") is not None:
                    txt = json.dumps(d)
    d = json.loads(txt)
    if d.get("error"):
        raise RuntimeError(f"Higgsfield MCP {method}: {d['error']}")
    return d.get("result")


def _init():
    if _SESSION.get("ready"):
        return
    _rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "powerDeck", "version": "1"}})
    _rpc("notifications/initialized", notify=True)
    _SESSION["ready"] = True


def tools():
    _init()
    return (_rpc("tools/list") or {}).get("tools") or []


def call(name, args):
    _init()
    return _rpc("tools/call", {"name": name, "arguments": args})


def connected():
    return bool(_load().get("access_token"))


class NoCredits(RuntimeError):
    """구독 크레딧 소진"""


def _upload(data_url):
    """data URL → Higgsfield 미디어 ID(presigned PUT 후 confirm)"""
    import re
    head, b64 = data_url.split(",", 1)
    ctype = head[5:].split(";")[0] or "image/png"
    ext = {"image/jpeg": "jpg", "image/webp": "webp"}.get(ctype, "png")
    r = call("media_upload", {"files": [{"filename": f"ref.{ext}", "content_type": ctype}]})
    txt = "".join(c.get("text", "") for c in (r or {}).get("content") or [])
    mid = re.search(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", txt)
    url = re.search(r"'(https://upload[^']+)'", txt)
    if not mid or not url:
        raise RuntimeError("Higgsfield 업로드 주소를 받지 못했습니다: " + txt[:200])
    rq = urllib.request.Request(url.group(1), data=base64.b64decode(b64), method="PUT", headers={"Content-Type": ctype, "If-None-Match": "*", "User-Agent": "curl/8.5.0"})   # Cloudflare 가 파이썬 기본 UA 를 막는다(1010)
    urllib.request.urlopen(rq, timeout=120).read()
    call("media_confirm", {"type": "image", "media_ids": [mid.group(1)]})
    return mid.group(1)


COST = {}   # 모델별 1장 크레딧(get_cost 로 한 번 재서 기억)


def credits_of(params):
    """이 설정으로 1장 만들 때 드는 크레딧 — 처음 한 번만 Higgsfield 에 물어본다(차감 없음)"""
    key = (params.get("model"), params.get("quality"), params.get("resolution"), params.get("variant"))
    if key not in COST:
        try:
            r = call("generate_image", {"params": {**{k: v for k, v in params.items() if k != "medias"}, "get_cost": True}})
            txt = "".join(c.get("text", "") for c in (r or {}).get("content") or [])
            m = re.search(r"([0-9.]+) credits", txt)
            COST[key] = float(m.group(1)) if m else 0.0
        except Exception:
            COST[key] = 0.0
    return COST[key]


def image(job, prompt, data_urls, aspect, photo=False):
    """그림 한 장 → PNG 바이트. 구독 크레딧으로. 실사(photo)면 나노바나나 2, 아니면 GPT Image 2.5 Flare(high, 2k). 참고 그림은 올려서 넘긴다"""
    import io
    from PIL import Image
    ar = aspect if aspect in ("16:9", "3:2", "4:3", "1:1") else "3:2"
    refs = [{"value": _upload(d), "role": "image_references"} for d in (data_urls or [])[:8]]
    if photo:
        params = {"model": "nano_banana_2", "prompt": prompt[:5000], "aspect_ratio": ar, "resolution": "2k", "use_unlim": False}
    else:
        params = {"model": "gpt_image_2_5", "prompt": prompt[:5000], "aspect_ratio": ar, "variant": "flare", "quality": "high", "resolution": "2k", "use_unlim": False}
    if refs:
        params["medias"] = refs
    try:
        r = call("generate_image", {"params": params})
    except RuntimeError as e:
        if "credit" in str(e).lower() or "insufficient" in str(e).lower():
            raise NoCredits(str(e))
        raise
    txt = "".join(c.get("text", "") for c in (r or {}).get("content") or [])
    res = ((r or {}).get("structuredContent") or {}).get("results") or []
    if not res or not res[0].get("id"):
        if "credit" in txt.lower():
            raise NoCredits("Higgsfield 구독 크레딧이 부족합니다: " + txt[:200])
        raise RuntimeError("Higgsfield 가 작업을 받지 않았습니다: " + txt[:300])
    jid = res[0]["id"]
    t0 = time.time()
    while True:
        if getattr(job, "cancel", False):
            raise RuntimeError("취소됨")
        g = ((call("job_status", {"jobId": jid, "sync": True}) or {}).get("structuredContent") or {}).get("generation") or {}
        st = g.get("status")
        if st == "completed":
            url = (g.get("results") or {}).get("rawUrl")
            img = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "powerDeck"}), timeout=120).read()
            buf = io.BytesIO()
            Image.open(io.BytesIO(img)).convert("RGB").save(buf, "PNG")
            job._hf_last = {"model": params["model"], "credits": credits_of({k: v for k, v in params.items() if k != "medias"})}   # 사용 기록용
            return buf.getvalue()
        if st in ("failed", "nsfw", "canceled", "ip_detected"):
            raise RuntimeError(f"Higgsfield 작업 {st}")
        if time.time() - t0 > 600:
            raise RuntimeError("Higgsfield 응답이 10분 넘게 없습니다")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    cmd = sys.argv[1] if len(sys.argv) > 1 else "tools"
    if cmd == "login":
        login()
    else:
        for t in tools():
            print("##", t.get("name"), "—", (t.get("description") or "")[:300].replace("\n", " "))
            print("   ", json.dumps(t.get("inputSchema") or {}, ensure_ascii=False)[:1500])
