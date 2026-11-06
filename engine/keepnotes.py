"""기존 구성 그대로 — 원본 장표의 발표 스크립트(슬라이드 노트)를 결과 장표의 같은 장에 옮긴다(R237)

장 합치기(merge_pptx)는 노트를 버리고, 원본 옮기기(keeplayout)는 노트를 읽지 않아 결과에 스크립트가 없었다(11-05 사용자가 손으로 요청).
기존 구성 그대로는 글이 원본 그대로라 장의 글 낱말이 가장 많이 겹치는 원본 장이 그 장의 원본이다 — 순서·앞장(표지·간지) 끼움과 무관.
이미 노트가 있는 장은 두고, 겹침이 모자란 장은 옮기지 않는다(엉뚱한 스크립트보다 빈칸이 낫다).

실행: python keepnotes.py 결과.pptx 원본.pptx [plan.json]   — plan 이 keep 이 아니면 아무것도 하지 않는다
"""
import json, re, sys
from pptx import Presentation

MIN_SCORE = 0.5   # 결과 장 낱말 중 원본 장에도 있는 몫


def _texts(shapes):
    for sh in shapes:
        if sh.shape_type == 6:   # 묶음
            yield from _texts(sh.shapes)
            continue
        if getattr(sh, "has_text_frame", False) and sh.has_text_frame:
            yield sh.text_frame.text
        if getattr(sh, "has_table", False) and sh.has_table:
            for row in sh.table.rows:
                for c in row.cells:
                    yield c.text


def words(slide):
    """장의 글 낱말(두 글자 이상) 집합 — 띄어쓰기·줄바꿈이 달라져도 같게"""
    t = " ".join(_texts(slide.shapes))
    return {w for w in re.findall(r"[0-9A-Za-z가-힣]+", t) if len(w) >= 2}


def notes_of(slide):
    if not slide.has_notes_slide:
        return ""
    tf = slide.notes_slide.notes_text_frame
    return (tf.text if tf is not None else "").strip()


def match(out_words, src_words, min_score=MIN_SCORE):
    """결과 장 i → 원본 장 j (점수 높은 짝부터 한 번씩). 반환 {i: j}"""
    pairs = []
    for i, a in enumerate(out_words):
        if len(a) < 3:   # 글이 거의 없는 장(그림 장)은 짝짓지 않는다
            continue
        for j, b in enumerate(src_words):
            if not b:
                continue
            k = len(a & b)
            s, r = k / len(a), k / len(b)
            # 목차·간지처럼 엔진이 글을 더 붙인 장 — 원본 낱말(5개 이상)이 거의 다 들어 있으면 같은 장
            if (s >= min_score and r >= min_score * 0.6) or (min(len(a), len(b)) >= 5 and k / min(len(a), len(b)) >= 0.9):
                pairs.append((s + r, i, j))
    got, used = {}, set()
    for _, i, j in sorted(pairs, reverse=True):
        if i in got or j in used:
            continue
        got[i] = j
        used.add(j)
    return got


def run(out_path, src_path):
    out, src = Presentation(out_path), Presentation(src_path)
    sn = [notes_of(s) for s in src.slides]
    if not any(sn):
        return 0, 0
    slides = list(out.slides)
    m = match([words(s) for s in slides], [words(s) for s in src.slides])
    n = 0
    for i, j in sorted(m.items()):
        if not sn[j] or notes_of(slides[i]):
            continue
        slides[i].notes_slide.notes_text_frame.text = sn[j].replace("\v", "\n")
        n += 1
    if n:
        out.save(out_path)
    return n, sum(1 for x in sn if x)


if __name__ == "__main__":
    if len(sys.argv) > 3:
        try:
            if not json.load(open(sys.argv[3], encoding="utf-8")).get("keep"):
                print("발표 스크립트 — 기존 구성 그대로가 아니라 건너뜀")
                sys.exit(0)
        except (OSError, ValueError):
            pass
    n, total = run(sys.argv[1], sys.argv[2])
    if total:
        print(f"발표 스크립트 — 원본 노트 {total}장 중 {n}장을 같은 장에 옮김" + (f" (짝을 못 찾은 {total - n}장은 확인 목록)" if n < total else ""))
        if n < total:
            print(f"WARN: 0|발표 스크립트 일부 못 옮김|원본 노트 {total}장 중 {total - n}장은 결과에서 같은 장을 찾지 못했습니다 — 원본 노트를 확인해 주세요")
    else:
        print("발표 스크립트 — 원본에 노트 없음")
