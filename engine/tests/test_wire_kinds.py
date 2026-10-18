# -*- coding: utf-8 -*-
"""와이어 상자 종류 한 벌(engine/wire_kinds.json)과 그 종류를 읽고 그리는 코드가 어긋나지 않는지 본다(2026-10-18).

  python3 engine/tests/test_wire_kinds.py        (전부 통과면 0 — deploy-engine.sh 가 test_known 다음에 돌린다)
  WIRE_PNG_OUT=<폴더> 를 주면 모든 종류 견본 그림(all_kinds.png · sheet.png)을 거기에 남긴다.
AI·PowerPoint 호출 없음. php 가 있으면 서버 사본의 프롬프트 채우기도 같은지 본다."""
import io, json, os, re, shutil, subprocess, sys, tempfile, base64

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.dirname(HERE)
ROOT = os.path.dirname(ENGINE)
sys.path.insert(0, ENGINE)
import wirekinds as K  # noqa: E402
import design as D  # noqa: E402

COPIES = [os.path.join(ROOT, "api", "src", "Deck", "wire_kinds.json"), os.path.join(ROOT, "apps", "web", "app", "modules", "deck", "legacy", "data", "wire_kinds.json")]
SAMPLES = json.load(open(os.path.join(HERE, "wire_kind_samples.json"), encoding="utf-8"))["kinds"]
CASES = json.load(open(os.path.join(HERE, "wire_chart_cases.json"), encoding="utf-8"))["cases"]
OUT = os.environ.get("WIRE_PNG_OUT") or tempfile.mkdtemp(prefix="wire-")


def _src(path):
    return open(path, encoding="utf-8").read()


def _func(src, name):
    """파이썬 함수 하나의 본문(다음 최상위 def 까지)"""
    i = src.index(f"\ndef {name}(")
    j = src.find("\ndef ", i + 5)
    return src[i:j if j > 0 else None]


def test_registry_copies_identical():
    """서버·화면 사본이 정본과 바이트까지 같다(preflight 10번과 같은 검사)"""
    want = open(os.path.join(ENGINE, "wire_kinds.json"), "rb").read()
    for p in COPIES:
        assert os.path.exists(p), f"사본 없음: {p}"
        assert open(p, "rb").read() == want, f"사본이 다르다 — cp engine/wire_kinds.json {os.path.relpath(p, ROOT)}"


def test_registry_fields():
    """종류마다 필수 칸·아이콘(잘라 받은 글꼴에 있는 이름)·부류·견본"""
    icons = set(open(os.path.join(ROOT, "apps", "web", "app", "styles", "material-symbols-names.txt"), encoding="utf-8").read().split())
    assert len(K.KINDS) == len(set(K.KINDS)), "종류 중복"
    for x in K.REG["kinds"]:
        for f in ("k", "label", "hint", "icon", "size", "cls", "fmt"):
            assert x.get(f), f"{x.get('k')}: {f} 비어 있음"
        assert x["cls"] in ("visual", "text", "band"), f"{x['k']}: cls {x['cls']}"
        assert x["icon"] in icons, f"{x['k']}: 아이콘 {x['icon']} 이 글꼴 목록에 없다 — node scripts/ms-subset.mjs build"
        assert 3 <= x["size"]["w"] <= 96 and 3 <= x["size"]["h"] <= 82, f"{x['k']}: size"
        assert x["k"] in SAMPLES, f"{x['k']}: 견본(tests/wire_kind_samples.json) 없음"
        if x.get("form"):
            assert x.get("use"), f"{x['k']}: 주인공 도식인데 프롬프트 표 글(use) 없음"
    assert set(SAMPLES) == set(K.KINDS), f"견본에만 있는 종류: {set(SAMPLES) - set(K.KINDS)}"


def test_code_branches():
    """주인공 도식(form)마다 엔진 그림·시안 지시·서버 높이 셈·화면 스케치에 갈래가 있고, 거꾸로 코드의 갈래는 모두 등록된 종류다"""
    src = _src(os.path.join(ENGINE, "design.py"))
    png, txt = _func(src, "wire_png"), _func(src, "wire_text")
    php = _src(os.path.join(ROOT, "api", "src", "Deck", "WireLayout.php"))
    need = php[php.index("public static function need("):php.index("private static function share(")]
    tsx = _src(os.path.join(ROOT, "apps", "web", "app", "modules", "deck", "legacy", "WireSketch.tsx"))
    plain = {"table", "kpi"}   # 표·수치는 그림 갈래가 아니라 글 갈래로 그린다(wire_png 의 table·kpi 는 있음)
    for k in K.FORM:
        assert f'k == "{k}"' in png or f'"{k}"' in png, f"wire_png 에 {k} 갈래 없음"
        assert f'"{k}"' in txt, f"wire_text 에 {k} 갈래 없음"
        assert f"'{k}'" in need, f"WireLayout::need 에 {k} 없음"
        if k not in plain:
            assert f'case "{k}"' in tsx, f"WireSketch.tsx 에 {k} 없음"
    for k in set(re.findall(r'k == "([a-z]+)"', png)) | set(re.findall(r'b\["k"\] == "([a-z]+)"', txt)):
        assert k in K.KINDS, f"코드에만 있는 종류: {k}"
    for k in set(re.findall(r'case "([a-z]+)"', tsx)):
        assert k in K.KINDS or k in K.CHART_TYPES, f"WireSketch 에만 있는 갈래: {k}"


def test_prompt_rendered():
    """프롬프트 자리가 모두 채워지고, 모든 종류가 '쓰는 법'에 나온다. php 가 있으면 서버(WireKinds::prompt)와 같은 글"""
    py = K.read_prompt()
    assert "{{" not in py, "채워지지 않은 자리"
    fm = py[py.index("## 종류(k)별로 적는 법"):]
    for k in K.KINDS:
        assert re.search(r"^- (?:[a-z]+ · )*" + k + r"\b", fm, re.M), f"쓰는 법에 {k} 없음"
    api = os.path.join(ROOT, "api", "src", "Deck", "prompt_wire.md")
    assert _src(api).replace("\r\n", "\n") == _src(os.path.join(ENGINE, "prompt_wire.md")), "api 사본 prompt_wire.md 가 다르다"
    php = shutil.which("php")
    if php:
        code = ("require 'api/src/bootstrap.php'; echo \\Pp\\Deck\\WireKinds::prompt((string) file_get_contents('api/src/Deck/prompt_wire.md'));")
        got = subprocess.run([php, "-r", code], cwd=ROOT, capture_output=True, text=True, encoding="utf-8").stdout
        assert got.replace("\r\n", "\n") == py, "서버 WireKinds::prompt 와 엔진 wirekinds.prompt 가 다른 글을 낸다"


def test_prompt_examples():
    """출력 예시 — JSON 으로 읽히고, 장마다 why(관계 한 줄)가 있고, 관계·주 시각물·배치가 서로 다르다(공장형 예시 금지, 2026-10-18)"""
    py = K.read_prompt()
    ex = json.loads(py[py.index('{"slides"', py.index("## 출력")):].strip())["slides"]
    assert len(ex) >= 3, "예시가 3장 미만"
    whys = [str(s.get("why") or "") for s in ex]
    assert all(":" in w for w in whys), f"why 가 '관계: 근거' 꼴이 아니다: {whys}"
    assert len({w.split(":")[0] for w in whys}) == len(whys), "예시들의 관계가 겹친다"

    def kinds(s):
        out = []
        for b in s.get("blocks") or []:
            out.append(b["k"])
        for r in s.get("rows") or []:
            for c in r["cols"]:
                out += [x["k"] for x in c["stack"]] if "stack" in c else [c["k"]]
        return out
    heroes = [next((k for k in kinds(s) if k in K.FORM), "") for s in ex]
    assert len(set(heroes)) == len(heroes) and all(heroes), f"예시의 주 시각물이 겹치거나 없다: {heroes}"
    for s in ex:   # 예시의 데이터 상자는 실제로 그 형태로 그려진다
        for k in kinds(s):
            assert k in K.KINDS, k


def test_chart_cases():
    """chart 글 읽기 — 옛 형식(라벨 | 값 · 도입 전/후 짝)과 새 형식(유형·계열·메시지) 모두"""
    for c in CASES:
        got = D.wire_chart(c["d"])
        got = dict(got, rows=[[lab, [None if v is None else (int(v) if v == int(v) else v) for v in vs]] for lab, vs in got["rows"]])
        assert got == c["expect"], f"{c['name']}: {got} != {c['expect']}"


def test_chart_negative():
    """음성 대조 — 값이 하나뿐인 chart 는 그래프로 그리지 않고(글 상자), 시안 지시도 그래프라 하지 않는다"""
    bad = {"n": 1, "wire": [{"id": "a", "k": "chart", "x": 2, "y": 15, "w": 50, "h": 60, "t": "처리 건수", "d": "유형: bar\n2025 | 120"}]}
    assert D.chart_nums(D.wire_chart(bad["wire"][0]["d"])) < 2
    assert "BAR CHART" not in D.wire_text(bad) and "contents" in D.wire_text(bad)
    good = {"n": 1, "wire": [dict(bad["wire"][0], d="유형: line\n2024 | 100\n2025 | 120")]}
    assert "LINE CHART" in D.wire_text(good)


def _slide(kinds, cols):
    rows = (len(kinds) + cols - 1) // cols
    w, h = 96 / cols, 82 / rows
    return {"n": 1, "wire": [dict(id=f"w{i}", k=k, x=round(2 + (i % cols) * w, 1), y=round(15 + (i // cols) * h, 1), w=round(w - 1, 1), h=round(h - 1, 1), **SAMPLES[k])
                             for i, k in enumerate(kinds)]}


def test_wire_png_all_kinds():
    """모든 종류를 한 장에(작은 칸) + 종류마다 큰 칸 한 장씩 그려 모은 시트 — 예외 없이 그려지는지, 그림을 남긴다"""
    from PIL import Image
    os.makedirs(OUT, exist_ok=True)
    one = D.wire_png(_slide(list(K.KINDS), 6))
    assert one and one.startswith("data:image/png;base64,")
    open(os.path.join(OUT, "all_kinds.png"), "wb").write(base64.b64decode(one.split(",", 1)[1]))
    tiles = []
    for k in K.KINDS:
        s = {"n": 1, "wire": [dict(id="a", k=k, x=4, y=15, w=92, h=80, **SAMPLES[k])]}
        tiles.append((k, Image.open(io.BytesIO(base64.b64decode(D.wire_png(s).split(",", 1)[1]))).convert("RGB").resize((480, 270))))
    cols = 6
    sheet = Image.new("RGB", (cols * 490 + 10, ((len(tiles) + cols - 1) // cols) * 300 + 10), (230, 230, 230))
    from PIL import ImageDraw
    dr = ImageDraw.Draw(sheet)
    for i, (k, im) in enumerate(tiles):
        x, y = 10 + (i % cols) * 490, 10 + (i // cols) * 300
        sheet.paste(im, (x, y + 20))
        dr.text((x, y + 2), k, font=D._font(16), fill=(0, 0, 0))
    sheet.save(os.path.join(OUT, "sheet.png"))
    # 차트 유형마다 한 칸씩
    charts = []
    for c in CASES[:13]:
        s = {"n": 1, "wire": [dict(id="a", k="chart", x=4, y=15, w=92, h=80, t=c["name"], d=c["d"])]}
        charts.append(Image.open(io.BytesIO(base64.b64decode(D.wire_png(s).split(",", 1)[1]))).convert("RGB").resize((640, 360)))
    cs = Image.new("RGB", (4 * 650 + 10, ((len(charts) + 3) // 4) * 370 + 10), (230, 230, 230))
    for i, im in enumerate(charts):
        cs.paste(im, (10 + (i % 4) * 650, 10 + (i // 4) * 370))
    cs.save(os.path.join(OUT, "charts.png"))


def test_wire_text_all_kinds():
    """새 종류·차트 유형마다 시안 지시에 그 형태 이름이 들어가고, 메시지·강조가 지시로 바뀐다"""
    want = {"dodont": "DO/DON'T", "quote": "QUOTE CARD", "progress": "PROGRESS BARS", "swimlane": "SWIMLANE", "pin": "ANNOTATED SCREEN",
            "chart": "LINE CHART", "kpi": "KPI ROW", "gauge": "DONUT GAUGES", "proportion": "PROPORTION BAR"}
    for k, word in want.items():
        t = D.wire_text({"n": 1, "wire": [dict(id="a", k=k, x=2, y=15, w=60, h=60, **SAMPLES[k])]})
        assert word in t, f"{k}: {word} 없음 — {t[:160]}"
        if "메시지:" in SAMPLES[k]["d"]:
            assert "KEY MESSAGE" in t and "메시지:" not in t, f"{k}: 메시지 지시"
        if "강조:" in SAMPLES[k]["d"]:
            assert "HIGHLIGHT ONLY" in t, f"{k}: 강조 지시"
    for c in CASES[:13]:
        ch = D.wire_chart(c["d"])
        if D.chart_nums(ch) >= 2:
            assert D.CHART_EN[ch["type"]].split(" (")[0] in D.chart_text(ch), c["name"]


def main():
    tests = [(k, v) for k, v in globals().items() if k.startswith("test_") and callable(v)]
    bad = 0
    for k, fn in tests:
        try:
            fn()
            print(f"통과  {k}")
        except Exception as e:      # noqa: BLE001
            bad += 1
            print(f"실패  {k}: {type(e).__name__}: {e}")
    print(f"{len(tests) - bad}/{len(tests)} 통과 · 그림 {OUT}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
