# -*- coding: utf-8 -*-
"""이어 만들기 공용 — 다시 돌리면 끝난 일을 처음부터 하지 않게(R79·R81).
_slides/_built.json 하나에 '어떤 조건으로 만들었나'(지문) 와 그 결과를 적는다. 다시 돌릴 때 지문이 같으면 그 결과를 쓴다.
  slides.<sNN|cover|toc|…>  장마다 — 여러 엔진 제작(worker.build_parallel)
  whole                     엔진 하나로 만든 장표 전체(worker.build_single, build_parallel=0)
  vertical                  세로 제안서 목차·본문 기획(vertical.run)
  done                      작업이 끝까지 성공 — 끝난 작업을 다시 돌리면 새로 만들어 달라는 뜻이라 기록을 쓰지 않는다
2026-10-18 worker.py 에서 떼어 냈다(R81) — 세로 제안서·엔진 하나 경로도 같은 함수를 쓴다."""
import hashlib, json, os, time, zipfile

BUILT = "_built.json"


def _log(*a):
    print("[resume]", *a, flush=True)


def built_path(job):
    return os.path.join(job.dir, "_slides", BUILT)


def built_load(job):
    p = built_path(job)
    try:
        m = json.load(open(p, encoding="utf-8")) if os.path.isfile(p) else {}
    except Exception:
        m = {}
    return m if isinstance(m, dict) else {}


def built_fresh(job):
    """지금 이어 쓸 기록 — 끝까지 성공한 작업이면 빈 기록(새로 만든다)"""
    m = built_load(job)
    return {} if m.get("done") else m


def built_save(job, m):
    d = os.path.join(job.dir, "_slides")
    os.makedirs(d, exist_ok=True)
    tmp = os.path.join(d, BUILT + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False, indent=1)
    os.replace(tmp, os.path.join(d, BUILT))


def built_put(job, key, entry):
    """기록 한 칸을 바로 저장 — 다음 단계가 실패해도 이 결과는 남는다. 실패해도 작업은 이어 간다"""
    try:
        m = built_fresh(job)
        m[key] = dict(entry, at=time.strftime("%Y-%m-%d %H:%M:%S"))
        m["done"] = False
        built_save(job, m)
    except Exception as e:
        _log("기록 저장 실패(무시):", e)


def built_done(job):
    """작업이 끝까지 성공하면 기록을 '다 씀' 으로 — 끝난 작업을 다시 돌리면(새로 만들어 달라는 뜻) 이어 쓰지 않는다"""
    try:
        m = built_load(job)
        if m:
            m["done"] = True
            built_save(job, m)
    except Exception as e:
        _log("기록 마감 실패(무시):", e)


def sig_of(obj, files=()):
    """지문 — 파일 내용(이름+sha256)과 조건(JSON)"""
    h = hashlib.sha256()
    for p in files:
        h.update(os.path.basename(p).encode())
        with open(p, "rb") as f:
            h.update(hashlib.sha256(f.read()).digest())
    h.update(json.dumps(obj, ensure_ascii=False, sort_keys=True, default=str).encode())
    return h.hexdigest()


def pptx_ok(path):
    return os.path.isfile(path) and os.path.getsize(path) >= 10000 and zipfile.is_zipfile(path)


def reusable(path, entry, sig, mocks, legacy_ok):
    """이미 만든 장 파일을 그대로 써도 되나. 기록(entry)이 있으면 지문이 같을 때만.
    기록이 없는 옛 파일(이 기능 전에 만든 것)은 수정 요청·핀 의견이 없고 시안보다 나중에 만든 것만(legacy_ok)"""
    if not pptx_ok(path):
        return None
    if entry:
        return entry if entry.get("sig") == sig else None
    if not legacy_ok or not mocks or os.path.getmtime(path) < max(os.path.getmtime(p) for p in mocks):
        return None
    return {"sig": sig, "legacy": True, "report": {}}
