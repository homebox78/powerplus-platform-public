# -*- coding: utf-8 -*-
"""서체 파일을 산출물에 넣어도 되는가(재배포) — 파일 안 이름표(name 테이블)의 저작권·제작사로 판단한다.

사용자 2026-10-14 "지금 내가 사용하는 폰트 중 같이 배포가 안 되는 폰트를 알려줘" — 파일 안 문구로 확인한 결과:
  a시월구일 = AsiaSoft 상용(All Rights Reserved, 라이선스 문구 없음) · Rix고딕 = FONTRIX 상용 ·
  KoPub돋움체 = FONTRIX 제작, 무료 사용이지만 '양도 금지' 조항이라 파일 전달은 불분명 · 하나서체 = YoonDesign, 공식 재배포 조건 확인 못함.
  → 이 제작사 파일은 산출물('5_서체')에 넣지 않고, 결과 안내에 '설치해야 할 글꼴'로만 적는다.
fontTools 없이 표준 OpenType name 테이블만 읽는다(엔진 서버에 fontTools 가 없다)."""
import os
import struct

NO_SHIP = {   # 저작권·제작사 문구에 이 낱말이 있으면 넣지 않는다 — 이유
    "asiasoft": "아시아소프트 상용 서체",
    "fontrix": "폰트릭스 제작 서체(상용 또는 양도 금지 조항)",
    "yoondesign": "윤디자인 제작 — 재배포 조건 확인 전",
}


def name_strings(path, ids=(0, 7, 8, 13)):
    """name 테이블에서 nameID → 문자열(첫 번째 읽히는 것). ttc 는 첫 서체만"""
    out = {}
    try:
        with open(path, "rb") as f:
            data = f.read()
        off = 12 if data[:4] != b"ttcf" else struct.unpack(">I", data[12:16])[0] + 12
        n = struct.unpack(">H", data[off - 8:off - 6])[0]
        for i in range(n):
            tag, _, toff, _ = struct.unpack(">4sIII", data[off + 16 * i: off + 16 * i + 16])
            if tag != b"name":
                continue
            _, cnt, soff = struct.unpack(">HHH", data[toff:toff + 6])
            for r in range(cnt):
                pid, eid, lid, nid, ln, so = struct.unpack(">HHHHHH", data[toff + 6 + 12 * r: toff + 18 + 12 * r])
                if nid not in ids or nid in out:
                    continue
                raw = data[toff + soff + so: toff + soff + so + ln]
                try:
                    out[nid] = raw.decode("utf-16-be") if pid in (0, 3) else raw.decode("latin-1")
                except Exception:
                    pass
            break
    except Exception:
        pass
    return out


def shippable(path):
    """(넣어도 되는가, 이유) — 모르는 제작사는 넣는다(오픈 라이선스·무료 배포 서체가 대부분이라 목록으로 막는 쪽)"""
    s = " ".join(name_strings(path).values()).lower()
    for k, why in NO_SHIP.items():
        if k in s:
            return False, why
    return True, ""


HERE = os.path.dirname(os.path.abspath(__file__))
EXTRA = {   # 서체 파일과 함께 넣을 라이선스 문서(배포처가 동봉을 요구) — 파일 이름 앞부분 → fonts/licenses 의 문서
    "Cafe24PROSlim": ["Cafe24PROSlimMax-license.pdf"],
    "HadaRound": ["HadaRound-COPYRIGHT.txt"],
    "HakgyoansimAllimjang": ["HakgyoansimAllimjang-license.txt"],
}


def write_notice(paths, out_dir):
    """산출물 서체 폴더에 '서체_라이선스.txt'(서체별 저작권 고지 + SIL OFL 1.1 전문) + 배포처 동봉 문서를 쓴다.
    OFL 은 서체를 다시 배포할 때 저작권 고지와 라이선스 전문을 함께 넣으라고 한다 — 돌려주는 값은 쓴 파일 경로들"""
    os.makedirs(out_dir, exist_ok=True)
    lines = ["이 폴더의 서체 파일은 모두 SIL Open Font License 1.1 로 배포되는 무료 서체입니다.",
             "서체 파일만 따로 판매할 수 없습니다. 다시 배포할 때는 이 안내를 함께 넣어 주세요.",
             "AstaSans-BoldPD·HadaRound-BoldPD 는 원본 Bold 의 이름표(가족 이름)만 바꾼 OFL 수정판입니다(글자 모양은 원본과 같음).", ""]
    extra = []
    for p in paths:
        n = name_strings(p, (0, 1, 4, 13))
        lines += [f"■ {os.path.basename(p)} — {n.get(4) or n.get(1) or ''}", f"  {(n.get(0) or '').strip()}", ""]
        for k, docs in EXTRA.items():
            if os.path.basename(p).startswith(k):
                extra += [d for d in docs if d not in extra]
    ofl = os.path.join(HERE, "fonts", "OFL.txt")
    if os.path.isfile(ofl):
        t = open(ofl, encoding="utf-8", errors="ignore").read()
        i = t.find("SIL OPEN FONT LICENSE")   # 앞의 특정 서체 저작권 줄은 떼고 라이선스 전문만
        lines += ["-" * 60, t[i:] if i >= 0 else t]
    out = [os.path.join(out_dir, "서체_라이선스.txt")]
    open(out[0], "w", encoding="utf-8").write("\n".join(lines))
    for d in extra:
        src = os.path.join(HERE, "fonts", "licenses", d)
        if os.path.isfile(src):
            import shutil
            shutil.copy2(src, os.path.join(out_dir, d))
            out.append(os.path.join(out_dir, d))
    return out


if __name__ == "__main__":
    import sys
    for p in sys.argv[1:]:
        ok, why = shippable(p)
        print(("넣음 " if ok else "안 넣음 ") + os.path.basename(p) + (f" — {why}" if why else ""))
