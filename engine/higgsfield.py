# -*- coding: utf-8 -*-
"""Higgsfield 로 시안 그림 만들기 — 관리자 설정 '시안 그림 만드는 곳 = Higgsfield' 일 때 design.gen_image 가 부른다.

키는 엔진 PC 의 worker/config.json:
  "higgsfield_key_id": "…", "higgsfield_key_secret": "…"
  "higgsfield_model": "marketing-studio/image/flare"          (일러스트·아이콘·3D — GPT Image 2.5 Flare)
  "higgsfield_photo_model": "higgsfield-ai/soul/v2/standard"   (실사 — 나노바나나 2 자리)

흐름(https://docs.higgsfield.ai): 참고 그림은 presigned URL 로 올려 public_url 을 얻고 → 모델 엔드포인트에 제출 → status_url 을 폴링 → images[0].url 을 받아 PNG 로.
"""
import base64, io, json, time, uuid, urllib.request, urllib.error

API = "https://api.higgsfield.ai"


class NoCredits(RuntimeError):
    """Higgsfield 크레딧 소진(403) — 충전 전까지 이 엔진은 Higgsfield 를 쓰지 않는다"""


def _key(cfg, server_key=""):
    """인증 헤더. config 의 id·secret → (secret 칸에 'id:secret' 을 통째로 넣었으면 그대로) → 설정 화면에서 넣은 키(server_key, 'id:secret')"""
    kid, sec = str(cfg.get("higgsfield_key_id") or "").strip(), str(cfg.get("higgsfield_key_secret") or "").strip()
    if ":" in sec:
        return f"Key {sec}"
    if kid and sec:
        return f"Key {kid}:{sec}"
    if ":" in (server_key or ""):
        return f"Key {server_key.strip()}"
    raise RuntimeError("Higgsfield 키가 없습니다 — 설정(관리자)의 Higgsfield 키 또는 worker/config.json 의 higgsfield_key_id · higgsfield_key_secret")


def _req(method, url, auth=None, body=None, headers=None, raw=None, timeout=60):
    h = dict(headers or {})
    if auth:
        h["Authorization"] = auth
    data = raw
    if body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    rq = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(rq, timeout=timeout) as r:
            b = r.read()
    except urllib.error.HTTPError as e:
        msg = e.read()[:300].decode("utf-8", "replace")
        if e.code == 403 and auth:
            raise NoCredits(f"Higgsfield 크레딧이 부족합니다: {msg}")
        raise RuntimeError(f"Higgsfield {e.code}: {msg}")
    return json.loads(b) if b and b[:1] in (b"{", b"[") else b


def _upload(auth, data_url):
    """data URL(참고 그림) → Higgsfield 저장소에 올려 public URL"""
    head, b64 = data_url.split(",", 1)
    ctype = head[5:].split(";")[0] or "image/png"
    u = _req("POST", API + "/files/generate-upload-url", auth, {"content_type": ctype})
    _req("PUT", u["upload_url"], headers=u.get("upload_headers") or {"Content-Type": ctype}, raw=base64.b64decode(b64), timeout=120)
    return u["public_url"]


def image(job, prompt, data_urls, aspect, photo=False, cfg=None):
    """그림 한 장 → PNG 바이트. 실사(photo)면 SOUL V2(참고 그림을 받지 않는다), 아니면 Marketing Studio 2.5 Flare(참고 그림 16장까지)"""
    from PIL import Image
    cfg = cfg or {}
    auth = _key(cfg, getattr(job, "hf_key", ""))
    if photo:
        model = str(cfg.get("higgsfield_photo_model") or "higgsfield-ai/soul/v2/standard")
        body = {"prompt": prompt[:5000], "aspect_ratio": aspect if aspect in ("16:9", "4:3", "3:2", "1:1") else "3:2", "resolution": "1080p", "batch_size": 1}
    else:
        model = str(cfg.get("higgsfield_model") or "marketing-studio/image/flare")
        refs = [_upload(auth, d) for d in (data_urls or [])[:16]]
        body = {"prompt": prompt[:5000], "aspect_ratio": aspect if aspect in ("16:9", "3:2", "4:3", "1:1") else "3:2",
                "resolution": "2k", "quality": "high", "enhance_prompt": False}
        if refs:
            body["image_urls"] = refs
    sub = _req("POST", f"{API}/{model}", auth, body, headers={"Idempotency-Key": str(uuid.uuid4())})
    st_url = sub.get("status_url") or f"{API}/requests/{sub['request_id']}/status"
    job.event(f"Higgsfield({model.split('/')[-1]}) 에 그림을 맡겼습니다.") if getattr(job, "_hf_said", None) is None and not setattr(job, "_hf_said", 1) else None
    t0 = time.time()
    while True:
        if getattr(job, "cancel", False):
            try:
                _req("POST", sub.get("cancel_url") or f"{API}/requests/{sub['request_id']}/cancel", auth, {})
            except Exception:
                pass
            raise RuntimeError("취소됨")
        time.sleep(3)
        s = _req("GET", st_url, auth)
        if s.get("status") == "completed":
            url = ((s.get("images") or [{}])[0]).get("url")
            if not url:
                raise RuntimeError("Higgsfield 가 그림 주소를 돌려주지 않았습니다")
            img = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "powerDeck"}), timeout=120).read()
            buf = io.BytesIO()
            Image.open(io.BytesIO(img)).convert("RGB").save(buf, "PNG")
            return buf.getvalue()
        if s.get("status") in ("failed", "nsfw", "canceled"):
            raise RuntimeError(f"Higgsfield 요청 {s.get('status')}: {str(s.get('error') or '')[:200]}")
        if time.time() - t0 > 600:
            raise RuntimeError("Higgsfield 응답이 10분 넘게 없습니다")
