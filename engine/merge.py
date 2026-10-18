# -*- coding: utf-8 -*-
"""장마다 따로 만든 pptx(한 장짜리)를 PowerPoint 로 합친다(그림·서체·표가 그대로 온다). 리눅스는 merge_pptx.py.
  merge.py <out.pptx> <s01.pptx> <s02.pptx> …            순서대로 한 파일로
  merge.py replace <base.pptx> <쪽번호>=<sNN.pptx> …      base 의 그 장만 새 파일의 첫 장으로 갈아 끼운다
장 파일(sNN.pptx)은 읽기만 한다 — 실패해도 지우거나 고치지 않는다. 실패 글은 늘 '만든 장은 남겨 두었다 — 다시 돌리면 합치기부터'로 끝난다
(worker.build_parallel 의 실패 문구와 같은 뜻, R79·R81). 2026-10-18 전에는 PowerPoint 오류가 꼬리 없는 Traceback 으로 나갔다."""
import os, shutil, sys, time

sys.stdout.reconfigure(encoding="utf-8")
if os.name != "nt":   # 리눅스 엔진 — PowerPoint 대신 python-pptx
    import runpy
    runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)), "merge_pptx.py"), run_name="__main__")
    sys.exit(0)

KEPT = "만든 장은 남겨 두었다 — 다시 돌리면 합치기부터"


def fail(msg):
    sys.exit(f"합치기 실패: {msg} — {KEPT}")


def open_(app, path):
    for _ in range(8):   # 방금 저장된 파일은 잠깐 잠겨 있을 수 있다
        try:
            return app.Presentations.Open(path, WithWindow=False)
        except Exception:
            time.sleep(2)
    fail("PowerPoint 로 파일을 열지 못했습니다: " + path)


def main():
    import win32com.client as win32
    app = win32.Dispatch("PowerPoint.Application")
    if sys.argv[1] == "replace":
        base = os.path.abspath(sys.argv[2])
        pairs = sorted((int(a.split("=", 1)[0]), os.path.abspath(a.split("=", 1)[1])) for a in sys.argv[3:])
        pres = open_(app, base)
        try:
            for n, f in pairs:
                if n < 1 or n > pres.Slides.Count:
                    fail(f"{n}쪽이 없습니다")
                pres.Slides.InsertFromFile(f, n, 1, 1)   # n 뒤에 넣고
                pres.Slides(n).Delete()                    # 예전 n 을 지운다
            pres.Save()
            print(f"갈아 끼운 장 {len(pairs)}")
        finally:
            pres.Close()
            time.sleep(0.3)
    else:
        out, parts = os.path.abspath(sys.argv[1]), [os.path.abspath(p) for p in sys.argv[2:]]
        if not parts:
            fail("합칠 파일이 없습니다")
        shutil.copy2(parts[0], out)   # 첫 장 파일은 사본(out)만 고친다
        if len(parts) > 1:
            pres = open_(app, out)
            try:
                while pres.Slides.Count > 1:   # 첫 파일에 장이 더 있으면 첫 장만 남긴다
                    pres.Slides(pres.Slides.Count).Delete()
                for p in parts[1:]:
                    pres.Slides.InsertFromFile(p, pres.Slides.Count, 1, 1)
                pres.Save()
                print(f"장 {pres.Slides.Count}개를 한 파일로 합쳤습니다")
            finally:
                pres.Close()
                time.sleep(0.3)
        else:
            print("장 1개")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:   # PowerPoint(COM) 오류·파일 오류 — 장 파일은 그대로 두고 같은 꼬리로 알린다
        fail(f"{type(e).__name__}: {str(e)[:300]}")
