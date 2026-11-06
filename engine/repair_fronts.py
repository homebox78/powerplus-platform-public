# -*- coding: utf-8 -*-
"""이미 만든 가로 장표의 앞장(표지·목차·간지·엔딩·질의응답)을 시안대로 다시 넣는다 — AI 없이(R110 사후 처리).
  repair_fronts.py <결과.pptx> <mockup 폴더> <out.pptx>

  R110: 리눅스 합치기(merge_pptx.replace)가 여러 앞장을 갈아 끼울 때 파트 이름이 겹쳐 표지·목차·간지가 모두 마지막 간지로 저장됐고,
  엔딩·질의응답은 시안을 만들고도 장표로 옮기지 않아 코드 기본 모양(파란 그라데이션)이 들어갔다.
  - 표지·목차·간지: 시안대로 만든 앞장 파일(mockup/<id>.pptx)을 그 자리에 다시 넣는다(고친 merge_pptx.replace).
  - 엔딩·질의응답: 시안대로 만든 앞장 파일이 없으면 시안 그림(<id>_full.png → <id>.jpg)을 쪽 전체 그림 한 장으로 넣는다(글은 그림 속 글).
  앞장 자리는 frontmatter.kinds 로 찾고, 간지는 나온 순서대로 div1·div2… 와 맞춘다(worker.front_matter 와 같은 규칙).
  끝나면 앞장 꼬리표(frontmatter tag)를 다시 단다 — 결과 화면이 앞장·본문을 가른다."""
import json, os, shutil, subprocess, sys, tempfile

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from pptx import Presentation  # noqa: E402
import merge_pptx  # noqa: E402

PY = sys.executable


def picture_slide(base, img, out):
    """base 와 같은 크기·레이아웃의 한 장짜리 pptx — 쪽 전체에 그림 한 장"""
    p = Presentation(base)
    lst = p.slides._sldIdLst
    keep = list(lst)[0]
    for el in list(lst)[1:]:
        p.part.drop_rel(el.rId)
        lst.remove(el)
    s = p.slides[0]
    tree = s.shapes._spTree
    for el in list(tree):
        if el.tag.split("}")[-1] in ("sp", "pic", "grpSp", "graphicFrame", "cxnSp"):
            tree.remove(el)
    bg = s._element.find("{http://schemas.openxmlformats.org/presentationml/2006/main}cSld").find("{http://schemas.openxmlformats.org/presentationml/2006/main}bg")
    if bg is not None:
        bg.getparent().remove(bg)
    pic = s.shapes.add_picture(img, 0, 0, p.slide_width, p.slide_height)
    pic.name = "pd_front_picture"
    p.save(out)
    _ = keep
    return out


def expected_kinds(plan, front, n_slides):
    """기획·앞장 옵션으로 원래 쪽 순서를 다시 짠다 — 망가진 장표는 앞장 꼬리표도 마지막 간지 것이라(표지·목차가 div 로 읽힘) 믿을 수 없다.
    frontmatter.build 와 같은 순서: 표지 · 목차 · (장마다 간지 + 본문) · 엔딩 · 질의응답. 쪽 수가 안 맞으면 None"""
    import frontmatter as FM
    slides = plan.get("slides") or []
    chs = FM.chapters(slides)
    multi = len([c for c in chs if c["name"]]) >= 2
    out = (["cover"] if front.get("cover", True) else []) + (["toc"] if front.get("toc", True) and slides else [])
    for c in chs:
        out += (["div"] if front.get("divider", True) and multi else []) + ["body"] * len(c["items"])
    out += ["end", "qna"] if front.get("ending", True) and slides else []
    return out if len(out) == n_slides else None


def main():
    src, mock, out = sys.argv[1], sys.argv[2], sys.argv[3]
    r = subprocess.run([PY, os.path.join(HERE, "frontmatter.py"), "kinds", src], capture_output=True, text=True, encoding="utf-8")
    kinds = json.loads((r.stdout or "[]").strip().splitlines()[-1])
    pj = os.path.join(mock, "plan.json")
    front = json.loads(sys.argv[4]) if len(sys.argv) > 4 else {}
    if os.path.isfile(pj):
        exp = expected_kinds(json.load(open(pj, encoding="utf-8")), front, len(Presentation(src).slides))
        if exp:
            kinds = exp
    tmpd = tempfile.mkdtemp(prefix="rf-")
    work = os.path.join(tmpd, "work.pptx")
    shutil.copy2(src, work)
    pairs, tags, seen, log = [], [], {}, []
    for i, k in enumerate(kinds, 1):
        if k == "body":
            continue
        seen[k] = seen.get(k, 0) + 1
        fid = f"div{seen[k]}" if k == "div" else k
        fp = os.path.join(mock, f"{fid}.pptx")
        if not os.path.isfile(fp):
            img = next((os.path.join(mock, n) for n in (f"{fid}_full.png", f"{fid}.jpg") if os.path.isfile(os.path.join(mock, n))), None)
            if not img:
                log.append(f"{i}쪽 {fid}: 시안 없음 — 그대로")
                continue
            fp = picture_slide(src, img, os.path.join(tmpd, f"{fid}.pptx"))
            log.append(f"{i}쪽 {fid}: 시안 그림으로")
        else:
            log.append(f"{i}쪽 {fid}: 시안대로 만든 앞장")
        pairs.append((i, fp))
        tags.append(f"{i}={k}")
    if pairs:
        merge_pptx.replace(work, pairs)
        subprocess.run([PY, os.path.join(HERE, "frontmatter.py"), "tag", work] + tags, check=True, capture_output=True)
    shutil.copy2(work, out)
    print(json.dumps({"kinds": kinds, "replaced": len(pairs), "log": log}, ensure_ascii=False))


if __name__ == "__main__":
    main()
