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


FORMS2_NEG = [   # 2차 16종 음성 대조 — 서버 WireLayout::check · 엔진 wireforms.check 가 같이 잡아야 한다(R67)
    ("arch", "[서버] 웹", "구성도"),                       # 노드 1개·연결 0개
    ("org", "개발: 화면\n운영: 배포", "총괄"),              # 맨 위 총괄 없음
    ("flowchart", "접수\n검토\n◎ 완료", "판정"),             # 분기 없음 → flow 로
    ("trace", "요구 | 방안\nSFR-1 | ", "양쪽"),             # 방안 없음
    ("consortium", "★A | 60%\n★B | 30%", "★"),             # 주사업자 둘·지분 합 90
]


def _php(code):
    php = shutil.which("php")
    if not php:
        return None
    r = subprocess.run([php, "-r", "require 'api/src/bootstrap.php'; " + code], cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
    assert r.returncode == 0, r.stderr[:400]
    return r.stdout


def test_forms2_parse_and_check():
    """2차 16종 — 견본은 그릴 거리가 있고 판정에 걸리지 않으며, 형태 이름이 시안 지시에 들어간다. 음성 대조는 엔진·서버가 모두 잡는다"""
    import wireforms as F
    assert set(F.KINDS) <= set(K.FORM), f"wireforms 에만 있는 종류: {set(F.KINDS) - set(K.FORM)}"
    words = {"arch": "ARCHITECTURE", "stepcols": "STAGE COLUMNS", "derive": "STRATEGY DERIVATION", "askanswer": "QUESTION → ANSWER", "linkage": "LINKAGE",
             "org": "ORGANIZATION CHART", "voices": "VOICES", "screenshift": "BEFORE → AFTER", "triad": "ISSUE → SOLUTION", "flowchart": "FLOWCHART",
             "rowgrid": "ROW-HEADER GRID", "timeline": "MILESTONE TIMELINE", "stairs": "GROWTH STAIRS", "consortium": "CONSORTIUM", "trace": "TRACEABILITY", "twinhub": "TWIN HUB"}
    for k in F.KINDS:
        sm = SAMPLES[k]
        assert F.ok(k, sm["t"], sm["d"]), f"{k}: 견본을 그릴 수 없다"
        assert not F.check(k, sm["t"], sm["d"]), f"{k}: 견본이 판정에 걸린다 {F.check(k, sm['t'], sm['d'])}"
        t = D.wire_text({"n": 1, "wire": [dict(id="a", k=k, x=2, y=15, w=96, h=80, **sm)]})
        assert words[k] in t, f"{k}: 시안 지시에 {words[k]} 없음 — {t[:120]}"
    for k, d, word in FORMS2_NEG:
        assert any(word in c for c in F.check(k, "시험", d)), f"엔진 음성 대조 {k}: {F.check(k, '시험', d)}"
    neg = json.dumps([{"k": k, "d": d} for k, d, _ in FORMS2_NEG], ensure_ascii=False).replace("'", "\\'")
    out = _php("foreach (json_decode('" + neg + "', true) as $x) echo json_encode(\\Pp\\Deck\\WireLayout::check([['k'=>$x['k'],'x'=>2,'y'=>15,'w'=>96,'h'=>80,'t'=>'시험','d'=>$x['d']]]), JSON_UNESCAPED_UNICODE), \"\\n\";")
    if out is not None:
        for (k, _, word), line in zip(FORMS2_NEG, out.strip().splitlines()):
            assert word in line, f"서버 음성 대조 {k}: {line}"
        good = json.dumps({k: SAMPLES[k] for k in F.KINDS}, ensure_ascii=False).replace("'", "\\'")
        out = _php("foreach (json_decode('" + good + "', true) as $k => $s) { $c = array_filter(\\Pp\\Deck\\WireLayout::check([['k'=>$k,'x'=>2,'y'=>15,'w'=>96,'h'=>82]+$s]), fn($x) => !str_contains($x, '비어 있습니다')); if ($c) echo $k, ': ', implode(' / ', $c), \"\\n\"; }")
        assert not out.strip(), f"서버 판정이 견본을 잡는다: {out}"


def test_templates():
    """배치 틀 — 서버·화면 사본이 같고, 칸 종류는 등록된 것, 줄마다 span 합 12, 화살표 틀은 엔진 ARROW_TPL 과 같다, 새 틀은 프롬프트에 쓰는 때가 적혀 있다"""
    a = os.path.join(ROOT, "api", "src", "Deck", "wire_templates.json")
    b = os.path.join(ROOT, "apps", "web", "app", "modules", "deck", "legacy", "data", "wire_templates.json")
    assert open(a, "rb").read() == open(b, "rb").read(), "화면 사본 wire_templates.json 이 다르다"
    tp = json.load(open(a, encoding="utf-8"))["templates"]
    py = K.read_prompt()
    for t in tp:
        for r in t["rows"]:
            assert sum(c["span"] for c in r["cols"]) == 12, f"{t['id']}: span 합"
            for c in r["cols"]:
                for x in c.get("stack") or [c]:
                    assert x["k"] in K.KINDS, f"{t['id']}: 모르는 종류 {x['k']}"
        assert f"`{t['id']}`" in py, f"프롬프트에 틀 {t['id']} 설명이 없다"
    assert {t["id"] for t in tp if t.get("arrows")} == set(D.ARROW_TPL), "화살표 틀 목록이 엔진 ARROW_TPL 과 다르다"
    out = _php("echo json_encode(array_map(fn($b) => [$b['k'], $b['w'], $b['h']], \\Pp\\Deck\\WireLayout::fromAi(['tpl' => 'archside', 'blocks' => [['k'=>'badge','t'=>'99.9%','d'=>'가용성'], ['k'=>'arch','t'=>'구성','d'=>\"[가] 웹, 앱\\n[나] DB:통합\\n가 -> 나\"], ['k'=>'card','t'=>'요점','d'=>\"- 이중화\\n- 자동 전환\"]]])));")
    if out is not None:
        got = json.loads(out)
        assert got[0][0] == "arch" and got[0][1] > 60, f"archside 의 arch 칸에 arch 가 들어가지 않았다: {got}"


def test_arrows_and_low_rows():
    """화살표 틀(bridge3)은 칸 나눔이 그대로일 때만 화살표 — 상자를 옮기면 빠진다(음성 대조). 흐름 줄은 필요한 만큼만 높이를 받는다(E2E 382 8쪽 빈 띠)"""
    import wirediv
    wire = [dict(id="a", k="card", x=2, y=15, w=22.5, h=71, t="현황", d="- 가"), dict(id="b", k="screen", x=26.5, y=15, w=47, h=71, t="", d="그림: 화면"),
            dict(id="c", k="card", x=75.5, y=15, w=22.5, h=71, t="결과", d="- 나"), dict(id="d", k="band", x=2, y=88, w=96, h=9, t="결론", d="")]
    s = {"n": 1, "wire": wire}
    D.set_wire_tpl(s, "배치 틀 bridge3", wire)
    assert len(D.wire_arrows(s)) == 2 and "READING-FLOW ARROWS" in D.wire_text(s)
    assert D.wire_png(s)
    moved = dict(s, wire=[dict(wire[0], w=40)] + wire[1:])
    assert not D.wire_arrows(moved) and "READING-FLOW" not in D.wire_text(moved), "배치를 바꿨는데 화살표가 남았다"
    D.set_wire_tpl(s, "배치 틀 c363b", wire)
    assert "wire_tpl" not in s, "화살표 없는 틀인데 wire_tpl 이 남았다"
    assert wirediv.geom(wire)   # 칸 나눔 서명이 틀과 상관없이 같은 규칙
    # 좁은 칸 kpi — 세로로 쌓아 그린다(예외 없이) · 서버도 같은 기준으로 높이를 늘린다
    assert D.wire_png({"n": 1, "wire": [dict(id="k", k="kpi", x=2, y=15, w=22.5, h=71, t="현황", d="71.4% | 응답률\n3.2점 | 만족도")]})
    out = _php("$r = [['h'=>3,'cols'=>[['span'=>12,'k'=>'flow','t'=>'5단계','d'=>\"분석: 현황\\n설계: 흐름\\n구축: 플랫폼\"]]], ['h'=>3,'cols'=>[['span'=>6,'k'=>'chart','t'=>'추이','d'=>\"2024 | 1\\n2025 | 2\"],['span'=>6,'k'=>'card','t'=>'요점','d'=>\"- 가\\n- 나\"]]]];"
               " $w = \\Pp\\Deck\\WireLayout::build($r); $n = \\Pp\\Deck\\WireLayout::need($w[0], 96.0);"
               " echo json_encode([$w[0]['h'], $n, \\Pp\\Deck\\WireLayout::kpiStacked(22.5, 2), \\Pp\\Deck\\WireLayout::kpiStacked(60.0, 2),"
               " \\Pp\\Deck\\WireLayout::check([['k'=>'flow','x'=>2,'y'=>15,'w'=>96,'h'=>41.5,'t'=>'5단계','d'=>\"분석: 현황\\n설계: 흐름\"]])], JSON_UNESCAPED_UNICODE);")
    if out is not None:
        h, need, narrow, wide, chk = json.loads(out)
        assert h <= need * 1.3 + 3.6, f"흐름 줄이 필요({need:.1f})보다 크게 잡혔다: {h}"
        assert narrow and not wide, "kpi 세로 쌓기 기준"
        assert any("훨씬 큽니다" in c for c in chk), f"큰 흐름 상자(빈 띠) 음성 대조: {chk}"


def test_e2e742_line_triad_timeline():
    """2차 E2E 742 — 점 36개 꺾은선: 라벨은 처음·끝·해 바뀜·강조만, 세로는 값 범위, 시안 지시에 점 수·처음/끝/강조값. triad 머리 줄이 행으로 안 들어감, timeline '강조:' 는 사건이 아님"""
    import wireforms as F
    labs = [f"{y}-{m:02d}" for y in (2023, 2024, 2025) for m in range(1, 13)]
    assert D.axis_keep(labs) == {0, 12, 24, 35}
    assert 20 in D.axis_keep(labs, labs[20]), "강조 라벨이 빠졌다"
    assert D.axis_keep(labs[:12]) == set(range(12)), "12개 이하는 모두(음성 대조)"
    rows = [(l, [1700 + i * 50.0]) for i, l in enumerate(labs)]
    lo, hi = D.line_range(rows, 1)
    assert 1400 < lo < 1700 and 3450 < hi < 3800, (lo, hi)   # 0 이 아니라 값 범위(1,700~3,450) + 여유 12%
    d = "유형: line\n강조: 2025-12\n" + "\n".join(f"{l} | {int(v[0])}" for l, v in rows)
    ch = D.wire_chart(d)
    t = D.chart_text(ch)
    assert "exactly 36 points" in t and "first [2023-01] 1700" in t and "highlight [2025-12] 3450" in t and "not from zero" in t, t[:300]
    assert "exactly" not in D.chart_text(D.wire_chart("유형: line\n2024 | 1\n2025 | 2\n2026 | 3")), "점이 적은 선에 많은 점 지시(음성 대조)"
    assert D.wire_png({"n": 1, "wire": [dict(id="a", k="chart", x=2, y=15, w=96, h=36, t="월별", d=d)]})
    # triad — 꾸밈 붙은 머리 · 머리를 또 적은 줄
    o = F.triad("업무 | 방안 | 효과(도입 전 → 도입 후)\n업무 | 방안 | 효과(도입 전 → 도입 후)\n전화 상담 대기 | 통합 전화 | 12.4분 → 2.1분\n단순 문의 | AI 답변 | 8분 → 0.5분")
    assert o["head"][2].startswith("효과") and len(o["rows"]) == 2 and o["rows"][0][0] == "전화 상담 대기", o
    o = F.triad("장애 대응 지연 | 이중화 | 중단 0분\n접속 폭주 | 자동 확장 | 응답 2초")
    assert len(o["rows"]) == 2 and o["head"] == ["이슈", "방안", "효과"], "머리 없는 표의 첫 행을 머리로 먹었다(음성 대조)"
    o = F.timeline("강조: 2025.12\n[2023.01] 1,820건: 시작\n[2025.12] 3,410건: 최대")
    assert len(o["ev"]) == 2 and o["hl"] == "2025.12", o
    # 서버 — 같은 꼴 수치 카드 · 같은 범주 두 그래프(엔진 wirediv 와 같은 글), 음성 대조
    w = json.dumps({"cards": [{"k": "card", "x": 2 + i * 16, "y": 15, "w": 14, "h": 40, "t": f"기관{i}", "d": f"- 인력 {i + 5}명\n- 일평균 {i + 300}건"} for i in range(4)],
                    "two": [{"k": "chart", "x": 2, "y": 15, "w": 46, "h": 50, "t": "전화", "d": "2021 | 1\n2022 | 2\n2023 | 3"}, {"k": "chart", "x": 50, "y": 15, "w": 48, "h": 50, "t": "온라인", "d": "2021 | 4\n2022 | 5\n2023 | 6"}],
                    "ok": [{"k": "chart", "x": 2, "y": 15, "w": 96, "h": 50, "t": "채널", "d": "구분 | 전화 | 온라인\n2021 | 1 | 4\n2022 | 2 | 5\n2023 | 3 | 6"}]}, ensure_ascii=False)
    out = _php("foreach (json_decode('" + w + "', true) as $k => $x) echo $k, '=', implode(' / ', \\Pp\\Deck\\WireLayout::check($x)), \"\\n\";")
    if out is not None:
        got = dict(l.split("=", 1) for l in out.strip().splitlines())
        assert "같은 꼴 수치 카드 4개" in got["cards"] and "두 계열을 그래프 2개로" in got["two"], got
        assert "같은" not in got["ok"], f"계열 2개 한 그래프를 잡았다(음성 대조): {got['ok']}"


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
