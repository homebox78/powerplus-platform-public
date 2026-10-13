# -*- coding: utf-8 -*-
"""OpenRouter 모델 능력표 — 어떤 모델을 골라도 엔진이 그 모델에 맞춰 부르게.
https://openrouter.ai/api/v1/models (공개 목록, 키 불필요)를 6시간마다 받아 jobs_dir/_or_models.json 에 둔다.
  tools      — 도구 호출(function calling)을 받는가. 못 받으면 or_agent 가 글 규약(<tool …>)으로 대신한다
  vision     — 그림을 입력으로 받는가. 못 받으면 시안 그림 대신 기획 좌표·글로 만든다
  reasoning  — reasoning(effort) 인자를 받는가
  tool_choice· max_out(최대 출력 토큰) · ctx(문맥 길이) · image_out(그림을 만드는가)
목록을 못 받거나 목록에 없는 모델이면 무난한 기본값(도구·그림 됨, 문맥 128k)으로 보고, 실제 호출 오류에서 다시 맞춘다."""
import json, os, time, urllib.request

URL = "https://openrouter.ai/api/v1/models"
TTL = 6 * 3600
DEFAULT = {"tools": True, "vision": True, "reasoning": False, "tool_choice": True, "ctx": 128000, "max_out": 16000, "image_out": False, "known": False}
_MEM = {"at": 0, "models": {}}


def _cache_path():
    try:
        import worker as W
        d = W.CFG.get("jobs_dir") or W.HERE
    except Exception:
        d = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(d, "_or_models.json")


def _load():
    if _MEM["models"] and time.time() - _MEM["at"] < TTL:
        return _MEM["models"]
    p = _cache_path()
    try:
        if os.path.isfile(p) and time.time() - os.path.getmtime(p) < TTL:
            _MEM.update(at=os.path.getmtime(p), models=json.load(open(p, encoding="utf-8")))
            return _MEM["models"]
    except Exception:
        pass
    try:
        with urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent": "powerDeck-worker"}), timeout=30) as r:
            data = json.loads(r.read().decode("utf-8")).get("data") or []
        models = {}
        for m in data:
            sp = set(m.get("supported_parameters") or [])
            arch = m.get("architecture") or {}
            top = m.get("top_provider") or {}
            ctx = int(m.get("context_length") or top.get("context_length") or 0) or DEFAULT["ctx"]
            models[m["id"]] = {"tools": "tools" in sp, "tool_choice": "tool_choice" in sp,
                               "reasoning": "reasoning" in sp or "include_reasoning" in sp,
                               "vision": "image" in (arch.get("input_modalities") or []),
                               "image_out": "image" in (arch.get("output_modalities") or []),
                               "ctx": ctx, "max_out": int(top.get("max_completion_tokens") or 0) or min(32000, ctx // 4), "known": True}
        if models:
            try:
                json.dump(models, open(p, "w", encoding="utf-8"))
            except Exception:
                pass
            _MEM.update(at=time.time(), models=models)
    except Exception:
        try:   # 낡은 캐시라도
            _MEM.update(at=time.time() - TTL + 600, models=json.load(open(p, encoding="utf-8")))
        except Exception:
            pass
    return _MEM["models"]


def info(model):
    """모델 능력 dict — 모르는 모델이면 기본값(known=False)"""
    m = _load().get(str(model or "").split(":")[0]) or _load().get(str(model or ""))
    return dict(DEFAULT, **(m or {}))


if __name__ == "__main__":
    import sys
    for a in sys.argv[1:] or ["anthropic/claude-opus-4.5", "openai/gpt-4o-mini", "deepseek/deepseek-r1"]:
        print(a, info(a))
