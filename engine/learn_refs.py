# -*- coding: utf-8 -*-
"""참고 장표를 '학습'한다 — 엔진 PC 의 Claude Code(구독)가 장표 그림을 보고 유형·헤드라인·메시지 장치·레이아웃 문법을 적는다.
  learn_refs.py scan  <덱 폴더> <out.jsonl> [--batch 6] [--par 3] [--model claude-haiku-4-5-20251001] [--only 1,2,3]
      장마다 한 줄 JSON. 이미 적힌 장은 건너뛴다(이어서 돌릴 수 있다)
  learn_refs.py guide <in.jsonl[,in2.jsonl]> <guide.md> <catalog.md> <front.md> [--model claude-sonnet-5-5]
      scan 결과를 모아 ① 기획·시안이 읽는 학습 가이드(유형별 레이아웃 문법·헤드라인 쓰는 법·메시지 장치) ② 유형별 목록(CATALOG-D)
      ③ 표지·목차·간지·맺음말 문법(front.md — 앞장 시안이 본문과 이질감 없게)을 쓴다. 두 번째 jsonl(템플릿 덱)은 T 번호로 적는다
"""
import glob, json, os, re, subprocess, sys, threading, time
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, "config.json"), encoding="utf-8"))
opt = lambda k, d=None: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
TYPES = ["표지", "목차", "간지", "맺음말", "문제 제기·현황", "사업 이해·목표", "추진 전략·방향", "수행 방안·절차", "구성도·아키텍처", "데이터·연계",
         "화면·서비스", "일정·조직·인력", "품질·보안·테스트", "유지관리·운영·교육", "수행 실적·역량", "비교·차별성", "기타"]

SCAN = """아래 장표 그림 파일 {k}개를 Read 도구로 하나씩 열어 보고, 장마다 JSON 한 개씩 배열로 출력한다. 설명 없이 JSON 배열만.
파일:
{files}

장마다:
{{"file": "파일 이름", "type": "{types} 중 하나", "headline": "장의 헤드라인(가장 큰 글, 띄어쓰기 바로잡아 그대로)", "message": "이 장이 심사위원에게 말하려는 것 한 문장",
 "device": "메시지를 드러내는 장치 — 예: 머리 싸맨 인물+흩어진 카드, AS-IS→TO-BE 대비, 단계 쉐브론, 큰 수치, 화면 캡처 증명, 지도, 타임라인 (없으면 '카드 나열')",
 "layout": "칸 구성 문법 한두 문장 — 위/아래/좌/우 비율, 열 수, 무엇이 어디에(예: '왼쪽 40% 인물 장면, 오른쪽 60% 카드 3단, 아래 결론 띠')",
 "components": ["카드", "표", "화살표", "3D 아이콘", "사진", "화면 캡처", "말풍선", "띠", "번호 배지", "도식", "그래프" 중 있는 것],
 "density": "낮음|중간|높음", "value": 1~5 (참고 가치 — 메시지가 장면으로 드러나면 높게, 글만 나열이면 낮게), "note": "특이점 한 줄(없으면 빈 문자열)"}}
"""

GUIDE = """너는 공공 SI 제안설명회 장표의 디자인·기획 분석가다. 아래는 실제 제안설명회 장표 {n}장을 한 장씩 보고 적은 기록(JSON 줄)이다.
이 기록으로 두 문서를 만든다. 반드시 아래 구분자로 나눠 출력한다.

===GUIDE===
(기획 AI 와 시안 AI 가 읽는 학습 가이드 — 한국어 마크다운, 9,000자 안팎. 규칙은 짧은 문장, 예시는 D번호로)
# 실제 장표 540장에서 배운 것
## 1. 헤드라인 쓰는 법 — 실제 헤드라인에서 뽑은 규칙 5~8개 + 좋은 예 15개(D번호, 유형)
## 2. 유형별 레이아웃 문법 — 유형마다: 가장 흔한 칸 구성 2~3가지(비율·열 수·무엇이 어디에), 메시지 장치, 좋은 예 D번호 3개, 피할 것
## 3. 메시지가 드러나는 장치 모음 — 장치 이름 → 언제 쓰는가 → 예 D번호
## 4. 글 밀도·부품 규칙 — 카드/표/띠/배지/아이콘을 실제 장표가 어떻게 쓰는가
## 5. 피할 것 — value 가 낮은 장의 공통점
===FRONT===
(표지·목차·간지 시안 AI 가 읽는 문법 — 한국어 마크다운 3,000자 안팎. 기록 중 type 이 표지·목차·간지·맺음말인 장(T 번호 = 템플릿 덱, D 번호 = 본문 덱)을 근거로)
# 표지·목차·간지·맺음말 — 본문과 한 벌로 보이게
## 표지 — 제목 자리·크기, 사진/일러스트 쓰는 법, 색 띠·여백, 로고 자리, 좋은 예 T번호
## 목차 — 장 번호·이름 배치, 배경(사진/단색), 좋은 예
## 간지 — PART 번호·제목·절 목록 배치, 배경, 본문 장과 색·서체·여백을 맞추는 법, 좋은 예
## 맺음말 — 문구 양식, 좋은 예
## 본문과 이질감 없게 — 앞장과 본문이 같은 덱으로 보이려면 무엇을 맞춰야 하는가(색·서체 위계·여백·장치)
===CATALOG===
(참고 목록 — 한국어 마크다운. 머리말 2줄 뒤, 유형마다 `## 유형 (N장)` 아래에 `D번호 헤드라인 — 장치 (value)` 를 value 높은 순으로 한 줄씩. 표지·목차·간지·맺음말은 한 줄로 번호만)

기록:
{rows}
"""


def claude(prompt, model, allowed, add_dir, timeout=900):
    exe = CFG.get("claude") or "claude"
    cmd = [exe, "-p", "--output-format", "json", "--model", model, "--allowedTools", allowed, "--disallowedTools", "Bash,Write,Edit,WebFetch,WebSearch,TodoWrite,Task"]
    if add_dir:
        cmd += ["--add-dir", add_dir]
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    if CFG.get("anthropic_api_key"):
        env["ANTHROPIC_API_KEY"] = CFG["anthropic_api_key"]
    r = subprocess.run(cmd, input=prompt.encode("utf-8"), capture_output=True, timeout=timeout, env=env, cwd=add_dir or HERE)
    d = json.loads(r.stdout.decode("utf-8", "replace") or "{}")
    if d.get("is_error"):
        raise RuntimeError(str(d.get("result"))[:300])
    return d.get("result") or "", float(d.get("total_cost_usd") or 0)


def parse_json(s):
    s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s.strip(), flags=re.S)
    i, j = s.find("["), s.rfind("]")
    return json.loads(s[i:j + 1])


def scan(deck, out):
    batch, par = int(opt("--batch", 6)), int(opt("--par", 3))
    model = opt("--model", "claude-haiku-4-5-20251001")
    files = sorted(glob.glob(os.path.join(deck, "*.jpg")) + glob.glob(os.path.join(deck, "*.png")))
    if opt("--only"):
        want = {int(x) for x in opt("--only").split(",")}
        files = [f for f in files if int(re.match(r"(\d+)", os.path.basename(f)).group(1)) in want]
    done = set()
    if os.path.isfile(out):
        for ln in open(out, encoding="utf-8"):
            try:
                done.add(json.loads(ln)["file"])
            except Exception:
                pass
    todo = [f for f in files if os.path.basename(f) not in done]
    print(f"장 {len(files)} · 이미 {len(done)} · 이번 {len(todo)} · {batch}장씩 {par}개 동시 · {model}")
    groups = [todo[i:i + batch] for i in range(0, len(todo), batch)]
    lock = threading.Lock()
    cost = [0.0]

    def one(g):
        names = [os.path.basename(f) for f in g]
        prompt = SCAN.format(k=len(g), files="\n".join(names), types=" | ".join(TYPES))
        for attempt in range(2):
            try:
                txt, c = claude(prompt, model, "Read", deck)
                rows = parse_json(txt)
                # 모델이 파일 이름을 조금 다르게 적어도(특수문자·띄어쓰기) 앞 번호로 맞춘다
                num = {re.match(r"(\d+)", n).group(1): n for n in names}
                fixed = []
                for r in rows:
                    m = re.match(r"\D*(\d+)", str(r.get("file", ""))) if isinstance(r, dict) else None
                    if m and m.group(1).zfill(3) in num:
                        r["file"] = num[m.group(1).zfill(3)]
                        fixed.append(r)
                rows = fixed
                if not rows:
                    raise RuntimeError("JSON 없음: " + txt[:120])
                with lock:
                    cost[0] += c
                    with open(out, "a", encoding="utf-8") as f:
                        for r in rows:
                            r["n"] = int(re.match(r"(\d+)", r["file"]).group(1))
                            f.write(json.dumps(r, ensure_ascii=False) + "\n")
                return len(rows)
            except Exception as e:
                err = e
                time.sleep(3)
        print("실패:", names[0], "…", str(err)[:160])
        return 0

    t0 = time.time()
    n = 0
    with ThreadPoolExecutor(max_workers=par) as ex:
        for k, fu in enumerate(as_completed([ex.submit(one, g) for g in groups]), 1):
            n += fu.result()
            print(f"  {k}/{len(groups)} 묶음 · 적은 장 {n} · {int(time.time() - t0)}초 · 환산 ${cost[0]:.2f}", flush=True)
    print("끝", out)


def guide(src, gmd, cmd_, fmd=None):
    model = opt("--model", "claude-sonnet-5-5")
    rows = []
    for k, path in enumerate(src.split(",")):
        uniq = {}
        for ln in open(path, encoding="utf-8"):
            try:
                r = json.loads(ln)
                uniq[r["n"]] = r
            except Exception:
                pass
        tag = "D" if k == 0 else "T"
        rows += [json.dumps({"id": f"{tag}{n:03d}"} | {kk: v for kk, v in uniq[n].items() if kk not in ("file", "n")}, ensure_ascii=False) for n in sorted(uniq)]
    txt, c = claude(GUIDE.format(n=len(rows), rows="\n".join(rows)), model, "", None, timeout=1800)
    if "===CATALOG===" not in txt:
        raise RuntimeError("출력 형식이 다릅니다: " + txt[:200])
    g = txt.split("===GUIDE===", 1)[-1].split("===CATALOG===", 1)
    front = ""
    if "===FRONT===" in g[0]:
        g[0], front = g[0].split("===FRONT===", 1)
    open(gmd, "w", encoding="utf-8").write(g[0].strip() + "\n")
    if fmd and front.strip():
        open(fmd, "w", encoding="utf-8").write(front.strip() + "\n")
    head = "# D 덱 — 컨텐츠 모음 (실제 제안설명회 장표 540장)\n\n참고 번호는 `D` + 세 자리: `D123`. 폴더 `컨텐츠모음/NNN_제목.jpg`. 유형·헤드라인은 장표를 보고 적은 것. 표지·목차·간지·맺음말은 본문 참고로 쓰지 않는다(그건 `front/`).\n\n"
    open(cmd_, "w", encoding="utf-8").write(head + g[1].strip() + "\n")
    print(f"가이드 {len(g[0])}자 · 목록 {len(g[1])}자 · 환산 ${c:.2f}")


if __name__ == "__main__":
    if sys.argv[1] == "scan":
        scan(os.path.abspath(sys.argv[2]), os.path.abspath(sys.argv[3]))
    else:
        guide(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5] if len(sys.argv) > 5 and not sys.argv[5].startswith("--") else None)
