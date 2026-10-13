# -*- coding: utf-8 -*-
"""pptx 의 한 장을 PNG 한 파일로 — 인자: <pptx> <out.png> [장 번호=1]
Windows: PowerPoint(여러 엔진이 동시에 써도 되게 PowerPoint 를 끄지 않는다) / 리눅스: LibreOffice(lo.py)"""
import os, shutil, sys, tempfile, time

src, out = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
n = int(sys.argv[3]) if len(sys.argv) > 3 else 1
os.makedirs(os.path.dirname(out), exist_ok=True)

if os.name != "nt":
    import lo
    tmp = tempfile.mkdtemp(prefix="pd_r1_")
    try:
        got = lo.render(src, tmp, [n])
        if not got:
            sys.exit(f"{n}쪽이 없습니다: {src}")
        shutil.move(got[0][1], out)
        print(out)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    sys.exit(0)

import win32com.client as win32
app = win32.Dispatch("PowerPoint.Application")
pres = None
for _ in range(8):   # 방금 저장된 파일은 잠깐 잠겨 있을 수 있다   # 다른 엔진과 겹쳐 잠깐 실패하면 다시
    try:
        pres = app.Presentations.Open(src, ReadOnly=True, WithWindow=False)
        break
    except Exception:
        time.sleep(2)
if pres is None:
    sys.exit("PowerPoint 로 파일을 열지 못했습니다: " + src)
try:
    pres.Slides(n).Export(out, "PNG", 1600, 1108)
    print(out)
finally:
    pres.Close()
