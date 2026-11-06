# -*- coding: utf-8 -*-
"""앞장 갈아 끼우기 시험(R110) — 여러 장을 한 번에 갈아 끼워도 장마다 제 내용이 남는가.
  10-28: 리눅스 합치기(merge_pptx.replace)가 '붙이기 → 옛 장 빼기' 를 번갈아 해 여러 장이 한 파트 이름(slideN.xml)으로 저장돼,
  표지·목차·간지가 모두 마지막 간지(PART 4)로 나왔다.
  python -X utf8 engine/tests/test_replace_distinct.py
  PD_ENGINE_DIR=<고치기 전 engine 사본> python …     음성 대조 — 고치기 전 코드는 실패해야 한다"""
import collections, importlib.util, os, sys, tempfile, zipfile, warnings

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(os.environ.get("PD_ENGINE_DIR") or os.path.dirname(HERE))
from pptx import Presentation  # noqa: E402
from pptx.util import Inches  # noqa: E402

warnings.simplefilter("ignore")
spec = importlib.util.spec_from_file_location("mp", os.path.join(SRC, "merge_pptx.py"))
mp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mp)
T = tempfile.mkdtemp(prefix="repl-")


def deck(path, texts):
    p = Presentation()
    for t in texts:
        s = p.slides.add_slide(p.slide_layouts[6])
        s.shapes.add_textbox(Inches(1), Inches(1), Inches(6), Inches(1)).text_frame.text = t
    p.save(path)


base = os.path.join(T, "base.pptx")
deck(base, ["옛 표지", "옛 목차", "본문 1", "옛 간지", "본문 2", "옛 엔딩"])
srcs = {}
for k, t in ((1, "새 표지"), (2, "새 목차"), (4, "새 간지 PART 1"), (6, "새 엔딩")):
    f = os.path.join(T, f"f{k}.pptx")
    deck(f, [t])
    srcs[k] = (f, t)
mp.replace(base, [(k, f) for k, (f, _) in srcs.items()])
names = collections.Counter(zipfile.ZipFile(base).namelist())
got = [" ".join(sh.text_frame.text for sh in s.shapes if sh.has_text_frame) for s in Presentation(base).slides]
want = ["새 표지", "새 목차", "본문 1", "새 간지 PART 1", "본문 2", "새 엔딩"]
fails = []
if [k for k, v in names.items() if v > 1]:
    fails.append(f"겹친 파트 이름: {[k for k, v in names.items() if v > 1]}")
if got != want:
    fails.append(f"장 내용이 다름: {got}")
print("통과 여러 장 갈아 끼우기 — 장마다 제 내용" if not fails else "실패 " + " / ".join(fails))
sys.exit(1 if fails else 0)
