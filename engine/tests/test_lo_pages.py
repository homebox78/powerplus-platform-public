# -*- coding: utf-8 -*-
"""장 그림을 동시에 그려도 장 번호와 그림이 어긋나지 않는다(R181) — LibreOffice 없이 pdftoppm 을 가짜로.
 ① 늦게 끝나는 장이 있어도 번호 순서대로 돌려준다 ② 파일마다 자기 장의 그림 ③ picks·범위 밖 번호
 음성: 번호를 뒤바꾼 입력은 ② 검사에 걸려야 한다"""
import os, sys, tempfile, time, types
from unittest import mock
sys.path.insert(0, os.path.abspath(os.environ.get("PD_ENGINE_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")))
from PIL import Image
import lo

FAILS = []


def check(ok, msg):
    print(("통과 " if ok else "실패 ") + msg)
    if not ok:
        FAILS.append(msg)


def fake(cmd, **k):
    i = int(cmd[cmd.index("-f") + 1])
    time.sleep(0.02 * (10 - i))   # 앞 장일수록 늦게 끝난다 — 끝난 순서로 모으면 어긋난다
    Image.new("RGB", (100, 72), (i, 0, 0)).save(cmd[-1] + ".png")
    return types.SimpleNamespace(returncode=0)


def own(res):
    return all(Image.open(p).getpixel((5, 5))[0] == i for i, p in res)


t = tempfile.mkdtemp()
o = os.path.join(t, "o")
os.makedirs(o)
with mock.patch("shutil.which", return_value="pdftoppm"), mock.patch.object(lo, "_page_count", return_value=9), \
        mock.patch.object(lo, "_ratio", return_value=0.5), mock.patch("subprocess.run", fake):
    r = lo._pages("x.pdf", o, None, 200, "s", t)
    check([i for i, _ in r] == list(range(1, 10)), "① 번호 순서대로")
    check(own(r), "② 파일마다 자기 장의 그림")
    check(not own([(i, p) for (i, _), (_, p) in zip(r, r[::-1])]), "② 음성 대조: 뒤바꾸면 걸린다")
    check(all(Image.open(p).size == (200, 100) for _, p in r), "② 크기를 맞춘다")
    check([i for i, _ in lo._pages("x.pdf", o, [3, 99, 2], 200, "s", t)] == [2, 3], "③ picks 만, 범위 밖은 뺀다")
print(f"\n실패 {len(FAILS)}건" if FAILS else "\n전부 통과")
sys.exit(1 if FAILS else 0)
