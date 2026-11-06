# -*- coding: utf-8 -*-
"""서체 묶음(fontbundle.bundle) — 앞 실행이 _fonts 에 남긴 서체가 산출물에 섞이지 않는가(R141).
  10-29 057f: 다시 돌린 세로 제안서 묶음에 10-20 실행의 프리젠테이션·프리텐다드·G마켓 Light 가 그대로 들어갔다(장표엔 G마켓 Bold·a시월구일만).
  음성 대조: 고치기 전 bundle 은 남은 파일을 지우지 않는다(PD_ENGINE_DIR=<옛 engine>)."""
import os, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.environ.get("PD_ENGINE_DIR") or os.path.join(HERE, "..")))
from pptx import Presentation
from pptx.util import Inches
import fontbundle

tmp = tempfile.mkdtemp()
prs = Presentation()
s = prs.slides.add_slide(prs.slide_layouts[6])
tb = s.shapes.add_textbox(Inches(1), Inches(1), Inches(4), Inches(1))
r = tb.text_frame.paragraphs[0].add_run()
r.text = "가나다"
r.font.name = "G마켓 산스 TTF Bold"
pp = os.path.join(tmp, "a.pptx")
prs.save(pp)
out = os.path.join(tmp, "_fonts")
os.makedirs(out)
stale = os.path.join(out, "Freesentation-4Regular.ttf")
open(stale, "wb").write(b"old")
fontbundle.bundle(pp, out)
left = sorted(os.listdir(out))
print("묶음:", left)
if os.path.exists(stale):
    print("실패 앞 실행의 서체(Freesentation)가 묶음에 남음(R141)")
    sys.exit(1)
print("통과 묶음엔 이번 장표에 쓰인 서체만(R141)")
