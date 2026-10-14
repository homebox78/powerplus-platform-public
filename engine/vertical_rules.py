# -*- coding: utf-8 -*-
"""세로(A4) 제안서 콘텐츠 규칙 — 자료 수집 → 조건문 규칙 → 생성물 검사(사용자 2026-10-14).

  "세로 제안서 내 콘텐츠를 학습해서 규칙을 만들어야 한다. 어떤 상황에 어떻게, 어떤 내용은 어떻게 — 조건문이 있어야 한다.
   제공된 자료를 기반으로 자료를 수집하고, 기획할 때 규칙에 맞게 부합하는 콘텐츠를 만들어야 한다."

  원천: 실제 제출본 세로 제안서 — 유지관리 사업 5권(제안개요·전략·개발기술·사업관리·지원부문, 148장)과
  구축 사업 정성 제안서 2권(약 700쪽). 쪽 제목·소제목·도식 구성을 전부 훑어 '이런 쪽은 이런 내용을 이런 순서·모양으로' 를 뽑았다.

  1) collect(raw)          — RFP 의 요구사항 상세표(고유번호·명칭·정의·세부내용)를 번호별로 모은다.
  2) rule_for(title, …)    — 항목 제목·절 이름·자료 신호로 규칙 하나를 고른다(위에서부터 처음 맞는 것).
  3) brief_for(item, …)    — 기획 AI 에 줄 항목별 '규칙 + 근거 자료' 묶음.
  4) check(items, pages)   — 생성된 쪽이 규칙을 지켰는지 조건문으로 검사 → 위반 목록(고칠 쪽만 다시 쓰게 한다).
  5) markdown()            — 사람이 읽는 규칙 문서(docs/세로제안서-콘텐츠-규칙.md 를 이것으로 만든다).
"""
import re

FIGS = ("concept", "hub", "photo", "strategy", "compare", "process", "cards", "rows", "layers", "org", "gantt", "kpi", "effect")
NAMES = {"concept": "체계도", "hub": "허브 개념도", "photo": "사진", "strategy": "전략 목록", "compare": "현행→개선", "process": "절차", "cards": "카드", "rows": "구분 행",
         "layers": "계층 구성도", "table": "표", "org": "조직도", "gantt": "일정표", "kpi": "지표", "effect": "기대효과", "text": "글"}

# ───────────────────────── 쪽 유형 규칙 — 위에서부터 처음 맞는 것 하나. when 은 항목 제목(+절 이름) 정규식.
#   content = 쓸 내용과 순서(블록 순서와 같다) · first = 첫 블록 구성 후보(앞이 우선) · must = 그 항목 쪽들 안에 반드시 있어야 할 구성(하나 이상)
#   tip = 샘플에서 본 쓰는 법
RULES = [
    {"id": "purpose", "label": "제안 목적·배경", "when": r"배경|목적|필요성|추진\s*배경",
     "content": ["정책·환경 변화(자료의 근거·수치)", "현행 문제 3~4개", "사업 목적·목표 한 줄과 추진 방향"],
     "first": ["concept", "compare"], "must": ["compare", "concept"],
     "tip": "목표 한 줄 아래 추진 방향 3~4개(체계도). 문제는 현행→개선 짝으로."},
    {"id": "scope", "label": "사업 범위·주요 내용", "when": r"범위|주요\s*내용|대상\s*시스템|사업\s*개요|사업\s*내용",
     "content": ["대상 시스템·업무를 분류별 개수(○종)와 함께", "분류별 주요 내용", "구축 범위와 제외 범위"],
     "first": ["cards", "rows", "layers"], "must": ["table", "rows", "cards"],
     "tip": "'메인 5종 · 공통업무 49종'처럼 분류마다 개수를 먼저 보여 주고, 6개 이상이면 표로."},
    {"id": "strategy_overview", "label": "추진 전략(개요)", "when": r"추진\s*전략|추진\s*방향|목표\s*및\s*전략|전략\s*개요|사업\s*추진\s*전략|수행\s*전략",
     "content": ["비전·목표 한 줄", "전략 3~5개 — 약속형 문장(~합니다, ~확보)", "전략별 실행 과제"],
     "first": ["strategy", "concept"], "must": ["strategy", "concept"],
     "tip": "Action 1~N 처럼 번호를 붙인 전략 목록이 첫 쪽, 이어지는 쪽은 전략 하나씩."},
    {"id": "strategy_detail", "label": "전략 세부", "when": r"전략\s*\d|Action|세부\s*전략|전략\s*[①-⑩]",
     "content": ["고려사항(RFP 가 요구하는 것)", "핵심 요구사항(고유번호)", "실행 방안", "기대효과"],
     "first": ["compare", "rows"], "must": ["effect"],
     "tip": "'고려사항 → 핵심 요구사항 → 방안' 연결이 샘플의 표준. 마지막은 기대효과 상자."},
    {"id": "strength", "label": "제안의 특징·장점", "when": r"특징|장점|차별|강점|우수성",
     "content": ["강점 3~5개(번호)", "강점마다 근거(경험·수치·인증 — 없으면 [제안사 작성])"],
     "first": ["cards", "strategy"], "must": ["cards", "strategy"], "tip": "번호 붙인 카드. 근거 없는 자랑은 쓰지 않는다."},
    {"id": "premise", "label": "성공 요인·전제 조건", "when": r"전제|성공\s*요인|성공을\s*위한|성공\s*조건",
     "content": ["성공 조건 3~4개", "조건마다 제안사가 갖춘 것"], "first": ["cards", "concept"], "must": ["cards", "concept"], "tip": ""},
    {"id": "asis", "label": "현황·현행 분석", "when": r"현황|현행|진단|환경\s*분석|시스템\s*분석",
     "content": ["개요 수치(○종·○건·○명)", "대상 목록(구분·업무·내용)", "문제점·개선 필요 사항"],
     "first": ["kpi", "table", "rows"], "must": ["table", "rows"],
     "tip": "목록이 길면 (1/3)·(2/3)로 나눠 표로 끝까지. 문제점은 마지막에 짧게."},
    {"id": "architecture", "label": "시스템 구성도", "when": r"구성도|아키텍처|목표\s*시스템|인프라|하드웨어|소프트웨어|네트워크|구성\s*방안|시스템\s*구성",
     "content": ["계층별 구성(사용자·채널 → 서비스 → 데이터 → 인프라)", "구성 요소별 사양·수량", "구성 원칙(이중화·보안)"],
     "first": ["layers"], "must": ["layers"], "tip": "위에서 아래로 사용자→인프라 층. 요소는 이름만 짧게."},
    {"id": "function", "label": "기능 요구사항 대응", "when": r"$^", "by_req": r"^(SFR|FUR|FR)-",
     "content": ["요구사항 이해(고유번호·명칭·핵심 세부내용)", "구현 방안(처리 흐름·기능 구성·화면)", "기대효과"],
     "first": ["rows", "compare", "process"], "must": ["effect"],
     "tip": "쪽 위 꼬리표에 고유번호. 세부내용 'ㅇ' 줄마다 대응 방안이 하나씩 있어야 한다."},
    {"id": "data", "label": "데이터 구축·이관·표준화", "when": r"데이터|DB|이관|전환|표준화|정제|마이그레이션",
     "content": ["대상 데이터(종류·건수)", "단계(분석→정제→이관→검증)", "검증 기준·품질 목표"],
     "first": ["process", "table"], "must": ["process", "table"], "tip": "건수는 자료 그대로. 검증 기준은 수치로."},
    {"id": "ai", "label": "AI 모델·서비스", "when": r"AI|인공지능|모델|학습|챗봇|상담|예측|추천",
     "content": ["적용 대상 업무와 목표", "흐름(수집→학습→검증→서비스→재학습)", "성능 지표"],
     "first": ["process", "compare", "concept"], "must": ["process", "kpi"], "tip": ""},
    {"id": "security", "label": "보안·개인정보", "when": r"보안|개인정보|기밀|취약|접근\s*통제|암호",
     "content": ["보안 영역(관리적·물리적·기술적)", "단계별 보호(수집·저장·이용·파기)", "위협별 대응"],
     "first": ["rows", "process"], "must": ["rows", "table"], "tip": "영역 3개를 구분 행으로, 위협→대응은 표."},
    {"id": "schedule", "label": "추진 일정", "when": r"일정|추진\s*계획|단계별\s*계획|마일스톤|공정\s*계획",
     "content": ["단계·활동별 기간(일정표)", "단계별 주요 활동·산출물", "일정 관리 원칙"],
     "first": ["gantt"], "must": ["gantt"], "tip": "착수·중간·완료 보고를 마일스톤으로. 세부 일정은 '주관기관과 협의해 확정'."},
    {"id": "organization", "label": "수행 조직·역할", "when": r"조직|업무\s*분장|수행\s*체계|협의체|역할|R&R",
     "content": ["조직도(총괄 → 팀)", "팀별 역할·담당 업무", "협의·보고 체계"], "first": ["org"], "must": ["org"],
     "tip": "사람 이름·경력은 [제안사 작성]."},
    {"id": "staff", "label": "투입 인력", "when": r"인력|투입|이력|참여\s*기술자|인원",
     "content": ["역할·등급·투입 기간 표(이름은 [제안사 작성])", "인력 변동 대처(유형별)", "변경 절차"],
     "first": ["table"], "must": ["table"], "tip": ""},
    {"id": "methodology", "label": "방법론", "when": r"방법론|프레임워크|공정|개발\s*방법",
     "content": ["방법론 구조(영역·단계)", "단계별 활동·산출물", "이 사업에 맞춘 조정(테일러링)"],
     "first": ["concept", "layers", "process"], "must": ["table"], "tip": ""},
    {"id": "quality", "label": "품질·시험·성능", "when": r"품질|시험|테스트|검수|성능|검증",
     "content": ["품질 목표·기준(수치)", "절차(계획→점검→시정→확인)", "시험 종류·기준·도구"],
     "first": ["process", "kpi"], "must": ["table", "kpi"], "tip": ""},
    {"id": "process_mgmt", "label": "관리 절차(장애·변경·위험·형상 등)",
     "when": r"관리|처리|대응|절차|장애|변경|배포|백업|복구|형상|위험|이슈|의사\s*소통|문서|모니터링|점검",
     "content": ["관리 목표 한 줄", "절차 4~6단계", "유형·등급별 처리 기준(시간·담당)"],
     "first": ["process"], "must": ["table", "rows"], "tip": "샘플 유지관리 쪽의 대부분이 이 꼴 — 절차도 + 유형별 기준표."},
    {"id": "education", "label": "교육·기술 이전·인수인계", "when": r"교육|기술\s*이전|인수|인계|훈련",
     "content": ["대상·내용·방법·시기 표", "진행 절차 또는 일정", "평가·후속 지원"],
     "first": ["table", "process"], "must": ["table"], "tip": ""},
    {"id": "operation", "label": "운영·유지보수·지원", "when": r"유지|운영|하자|지원|헬프|서비스\s*수준|SLA",
     "content": ["지원 유형별 방안", "점검 항목·주기", "서비스 수준 목표(SLA)"],
     "first": ["rows", "process"], "must": ["table", "kpi"], "tip": ""},
    {"id": "effect", "label": "기대효과", "when": r"기대\s*효과|성과|효과",
     "content": ["핵심 성과 수치", "이해관계자별 효과(국민·산업체·공무원/기관)"], "first": ["kpi", "cards"], "must": ["kpi", "cards"], "tip": ""},
    {"id": "cooperation", "label": "상생 협력·하도급", "when": r"상생|하도급|협력|중소기업|공동\s*수급",
     "content": ["참여 업체·역할·비율 표", "상생 방안"], "first": ["table", "cards"], "must": ["table"], "tip": "비율·업체명은 [제안사 작성]."},
]
DEFAULT = {"id": "default", "label": "일반 방안", "when": "", "content": ["방안의 구조(체계·구성 요소)", "세부 방안", "기대효과"],
           "first": ["concept", "cards", "rows"], "must": [], "tip": ""}

# ───────────────────────── 자료 신호 — 근거 글에 이것이 있으면 그 구성을 더한다(조건문)
SIGNALS = [
    ("steps", r"절차|단계|프로세스|흐름|→|순서", "process", "절차·단계가 있다 → 절차 도식"),
    ("time", r"\d+\s*(개월|주|일간)|착수|중간\s*보고|완료\s*보고|\d{4}\s*[.년]\s*\d{1,2}", "gantt", "기간·보고 시점이 있다 → 일정표"),
    ("org", r"조직|PM\b|PL\b|책임자|협의체|담당\s*부서", "org", "조직·책임자가 있다 → 조직도"),
    ("change", r"현행|기존|개선|고도화|전환|통합|재구성", "compare", "현행과 개선이 있다 → 현행→개선"),
    ("count", r"\d[\d,]*\s*(종|건|개|명|%|초|TB|GB|회)", "kpi", "수치가 3개 이상 → 지표 또는 표"),
]


BODY_CM = 18.05          # 본문 영역 높이(cm) — vertical.BODY_BOTTOM - 7.55
FILL_MIN = 0.85         # 쪽 채움 하한 — 제출본은 빈 아래쪽이 없다(2차 시험 평균 71% → 사용자 "하단이 비어 있다")
EFFECT_RULES = ("function", "strategy_detail", "effect")


def _norm(t):
    return re.sub(r"\s+", " ", str(t or "")).strip()


# ───────────────────────── 1) 자료 수집
def collect(raw):
    """RFP 요구사항 상세표 → {고유번호: {id, name, define, detail}} — '요구사항 고유번호 X 요구사항 명칭 Y … 정의 … 세부내용 … 산출정보'"""
    reqs = {}
    t = str(raw or "")
    for m in re.finditer(r"요구사항\s*고유\s*번호\s*([A-Z]{2,4}-\d{2,4})", t):
        seg = t[m.end(): m.end() + 4000]
        nxt = re.search(r"요구사항\s*고유\s*번호|요구사항\s*분류", seg)
        seg = seg[: nxt.start()] if nxt else seg
        name = re.search(r"요구사항\s*명칭\s*(.+?)\s*(?:요구사항\s*상세|상세\s*설명|정의)", seg, re.S)
        define = re.search(r"정의\s*(.+?)\s*세부\s*내용", seg, re.S)
        detail = re.search(r"세부\s*내용\s*(.+?)(?:산출\s*정보|관련\s*요구사항|$)", seg, re.S)
        rid = m.group(1)
        if rid in reqs:
            continue
        reqs[rid] = {"id": rid, "name": _norm(name.group(1))[:60] if name else "",
                     "define": _norm(define.group(1))[:200] if define else "",
                     "detail": _norm(detail.group(1))[:900] if detail else ""}
    if not reqs:   # 상세표가 없으면 목록표('번호 ID 명칭')라도
        for m in re.finditer(r"\b([A-Z]{2,4}-\d{2,4})\s*\n\s*([^\n]{2,40})", t):
            reqs.setdefault(m.group(1), {"id": m.group(1), "name": _norm(m.group(2)), "define": "", "detail": ""})
    return reqs


def signals(text):
    out = []
    for key, rx, kind, why in SIGNALS:
        n = len(re.findall(rx, text or ""))
        if (key == "count" and n >= 3) or (key != "count" and n >= 1):
            out.append({"signal": key, "kind": kind, "why": why})
    return out


# ───────────────────────── 2) 규칙 고르기
def rule_for(title, section="", req_ids=()):
    t = f"{title} {section}"
    if any(re.match(r"^(SFR|FUR|FR)-", str(r)) for r in req_ids or ()):
        fn = next(r for r in RULES if r["id"] == "function")
        # 제목이 더 구체적인 유형(데이터·AI·보안·일정…)이면 그쪽이 먼저 — 기능 요구는 그 밖일 때
        for r in RULES:
            if r["id"] in ("data", "ai", "security", "schedule", "organization") and re.search(r["when"], title or ""):
                return r
        return fn
    for r in RULES:
        if r["when"] and re.search(r["when"], title or ""):
            return r
    for r in RULES:   # 항목 제목에 없으면 절 이름으로
        if r["when"] and re.search(r["when"], t):
            return r
    return DEFAULT


# ───────────────────────── 3) 기획 AI 에 줄 항목별 묶음
def brief_for(item, section, reqs, excerpt=""):
    ids = [str(x) for x in item.get("req") or []]
    r = rule_for(item.get("title") or item.get("item") or "", section, ids)
    ev = [reqs[i] for i in ids if i in reqs][:4]
    sig = signals(" ".join(f"{e['define']} {e['detail']}" for e in ev) + " " + (excerpt or ""))
    first = list(r["first"])
    for s in sig:   # 자료에 절차·일정·조직이 뚜렷하면 첫 구성 후보에 더한다(규칙 후보 뒤)
        if s["kind"] not in first and s["signal"] in ("steps", "time", "org"):
            first.append(s["kind"])
    return {"rule": r["id"], "rule_label": r["label"], "content": r["content"], "first": first, "must": r["must"], "tip": r["tip"],
            "signals": [s["why"] for s in sig],
            "evidence": [{"id": e["id"], "name": e["name"], "define": e["define"], "detail": e["detail"][:500]} for e in ev]}


def allowed_first(b):
    """항목 첫 블록에 쓸 수 있는 구성 — 규칙 첫 후보 + 필수 구성(표·글 제외). 후보가 하나뿐이면 연속 금지와 부딪힌다(5차: 관리 절차 항목이 이어지면 둘 다 '절차')"""
    return list(dict.fromkeys(list(b["first"]) + [m for m in b["must"] if m not in ("text", "effect")]))


def assign_kinds(items):
    """목차 단계 — 항목 주 구성(kind) 조건문: 후보(allowed_first) 밖이면 첫 후보로, 앞 항목과 같으면 다음 후보로"""
    prev = None
    for it in items:
        b = it["_brief"]
        cand = allowed_first(b)
        b["first"] = cand   # 검사·기획 모두 넓힌 후보를 쓴다
        k = it.get("kind")
        if k not in cand:
            k = cand[0]
        if k == prev:
            k = next((x for x in cand if x != k), k)
        it["kind"] = k
        prev = k
    return items


# ───────────────────────── 4) 생성물 검사(조건문) — 위반 = 다시 쓰게 할 것, 고침 = 코드가 바로 고친 것
def _kind(b, fig_ok):
    k = str(b.get("kind") or "text")
    if k == "table":
        return "table" if isinstance(b.get("table"), dict) and b["table"].get("rows") else "text"
    return k if (k in FIGS and fig_ok(b)) else "text"


def _short(b):
    """도식 글이 너무 긴가(한 줄 25자 넘는 항목이 절반 이상)"""
    f = b.get("fig") if isinstance(b.get("fig"), dict) else {}
    its = []
    for v in f.values():
        if isinstance(v, list):
            for x in v:
                if isinstance(x, dict):
                    its += [str(y) for y in (x.get("items") or [])]
                elif isinstance(x, str):
                    its.append(x)
    long_ = [x for x in its if len(x) > 30]
    return not its or len(long_) * 2 < len(its)


def check(items, pages, fig_ok, fill=None, empty=None):
    """items = [{item, req, _brief}] (순서대로), pages = 장의 쪽 목록 → (위반 [{title, why}], 고친 것 [글])
    fill(pg) = 쪽 채움 비율(0~), empty(block) = 내용 없는 블록인가 — 그리기 쪽(vertical.py)에서 넘긴다"""
    bad, fixed = [], []
    by_item = {}
    for pg in pages:
        m = re.match(r"(\d+\.\d+)", str(pg.get("title") or ""))
        by_item.setdefault(m.group(1) if m else "", []).append(pg)
    texts = total = 0
    prev_first = None
    brief_of = {(re.match(r"(\d+\.\d+)", it["item"]) or [""])[0]: it["_brief"] for it in items}
    for pg in pages:
        t = str(pg.get("title") or "")
        bl = pg.get("blocks") or []
        ks = [_kind(b, fig_ok) for b in bl]
        total += len(ks)
        texts += ks.count("text")
        if not bl:
            bad.append({"title": t, "why": "블록이 없다"})
            continue
        if all(k == "text" for k in ks):
            bad.append({"title": t, "why": "글 블록만 있다 — 첫 블록을 내용에 맞는 도식으로"})
        if empty and any(empty(b) for b in bl):
            bad.append({"title": t, "why": "내용 없는 블록이 있다(소제목만) — bullets·table·fig 중 하나를 채울 것"})
        if fill:
            r = fill(pg)
            if r > 1.12:   # 몇 cm 를 줄일지 숫자로 — 말로만 하면 고쳐 쓸 때 넘침↔모자람을 오갔다(4차 82% → 118%)
                bad.append({"title": t, "why": f"쪽이 {round(r * 100)}% — 넘친다. 약 {(r - 0.95) * BODY_CM:.1f}cm 를 줄일 것(행 2~3개 또는 블록 하나, 목표 90~100%)"})
            if r < FILL_MIN:
                bad.append({"title": t, "why": f"쪽이 {round(r * 100)}%만 찼다 — 약 {(0.93 - r) * BODY_CM:.1f}cm 를 더할 것(행 1cm·블록 3~5cm 어림, 목표 90~100%)"})
        dup = sorted({k for k in ks if k != "text" and ks.count(k) > 1})
        if dup:
            bad.append({"title": t, "why": f"한 쪽에 같은 구성을 두 번 썼다({', '.join(NAMES.get(k, k) for k in dup)})"})
        only = brief_of.get((re.match(r"(\d+\.\d+)", t) or [""])[0], {}).get("first") or []
        if prev_first and ks[0] == prev_first and ks[0] != "text" and not (len(only) == 1 and only[0] == ks[0]):   # 후보가 그것 하나뿐인 항목은 예외(규칙끼리 충돌)
            bad.append({"title": t, "why": f"앞 쪽과 첫 블록 구성이 같다({NAMES.get(ks[0], ks[0])}) — 다른 구성으로"})
        prev_first = ks[0]
        for b, k in zip(bl, ks):
            if str(b.get("kind") or "") in FIGS and k == "text":
                bad.append({"title": t, "why": f"{NAMES.get(b.get('kind'))} 구성인데 fig 자료가 비었다(형식대로 채울 것)"})
            elif k in FIGS and not _short(b):
                bad.append({"title": t, "why": f"{NAMES.get(k)} 도식 글이 길다 — 항목은 한 줄 25자 이내"})
    for it in items:
        key = re.match(r"(\d+\.\d+)", it["item"]).group(1) if re.match(r"(\d+\.\d+)", it["item"]) else ""
        pgs = by_item.get(key) or []
        b = it["_brief"]
        if not pgs:
            bad.append({"title": it["item"], "why": "이 항목의 쪽이 없다"})
            continue
        ks = [_kind(x, fig_ok) for pg in pgs for x in pg.get("blocks") or []]
        if b["must"] and not any(k in ks for k in b["must"]):
            bad.append({"title": pgs[0].get("title"), "why": f"규칙 '{b['rule_label']}' — {' 또는 '.join(NAMES.get(k, k) for k in b['must'])} 구성이 있어야 한다"})
        first = _kind((pgs[0].get("blocks") or [{}])[0], fig_ok)
        if it.get("kind") and first != it["kind"] and first not in b["first"]:
            bad.append({"title": pgs[0].get("title"), "why": f"첫 블록은 {' / '.join(NAMES.get(k, k) for k in b['first'])} 중 하나여야 한다(지금 {NAMES.get(first, first)})"})
        if b["rule"] in ("function", "strategy_detail") and not any(k == "effect" for k in ks):
            bad.append({"title": pgs[-1].get("title"), "why": "요구사항 대응 쪽은 마지막에 기대효과 상자"})
        ids = [str(x) for x in it.get("req") or []]
        for pg in pgs:   # 고침: 요구사항 번호가 빠진 쪽은 항목 번호로 채운다
            if ids and not str(pg.get("req") or "").strip():
                pg["req"] = ", ".join(ids)
                fixed.append(f"{pg.get('title')}: 요구사항 번호 채움")
        if b["evidence"]:   # 근거에 있는 요구사항 명칭이 쪽 글에 하나도 안 나오면 — 자료와 무관하게 쓴 것
            body = " ".join(str(v) for pg in pgs for v in _walk_text(pg))
            words = {w for e in b["evidence"] for w in re.findall(r"[가-힣A-Za-z]{2,}", e["name"])} - {"구축", "고도화", "시스템", "관리", "기능"}
            if words and not any(w in body for w in words):
                bad.append({"title": pgs[0].get("title"), "why": f"근거 요구사항({', '.join(e['id'] for e in b['evidence'])}) 내용이 쪽에 없다 — 세부내용 줄마다 대응 방안"})
    eff_ok = {re.match(r"(\d+\.\d+)", it["item"]).group(1) for it in items
              if re.match(r"(\d+\.\d+)", it["item"]) and it["_brief"]["rule"] in EFFECT_RULES}
    sigs, cnt = {}, {}
    for pg in pages:
        t = str(pg.get("title") or "")
        ks = tuple(_kind(b, fig_ok) for b in pg.get("blocks") or [])
        m = re.match(r"(\d+\.\d+)", t)
        if "effect" in ks and (m.group(1) if m else "") not in eff_ok:
            bad.append({"title": t, "why": "기대효과 상자는 기능 요구사항·전략 세부·기대효과 항목에만 — 이 쪽에서는 빼고 다른 구성으로 채울 것"})
        if len(ks) >= 2 and ks in sigs:
            bad.append({"title": t, "why": f"'{sigs[ks]}' 쪽과 블록 조합이 같다({' + '.join(NAMES.get(k, k) for k in ks)}) — 구성을 바꿀 것"})
        sigs.setdefault(ks, t)
        for k in set(ks):
            cnt[k] = cnt.get(k, 0) + 1
    cap = max(2, round(len(pages) * 0.35))
    for k, n in cnt.items():
        c = max(2, round(len(pages) * 0.25)) if k == "process" else cap   # 절차는 25% — 5차에도 타임라인이 13쪽에 나와 반복감(사용자 '반복되는 느낌')
        if k not in ("table", "text") and n > c:
            bad.append({"title": "(장 전체)", "why": f"{NAMES.get(k, k)} 구성을 {n}쪽에 썼다(최대 {c}) — 다른 구성으로 바꿀 것"})
    if len(pages) >= 3 and not cnt.get("photo"):
        bad.append({"title": "(장 전체)", "why": "사진(photo) 블록이 없다 — 장마다 1~2개, 현장·장비·서비스 장면을 검색어로"})
    halves = sum(1 for pg in pages if any(b.get("half") for b in pg.get("blocks") or []))
    if len(pages) >= 3 and halves * 3 < len(pages):
        bad.append({"title": "(장 전체)", "why": f"2단 쪽이 {halves}/{len(pages)} — 3분의 1 이상은 작은 블록 둘을 half 로 나란히"})
    if total and texts * 4 > total:
        bad.append({"title": "(장 전체)", "why": f"글 블록이 {texts}/{total} — 4분의 1 이하로"})
    return bad, fixed


def _walk_text(o):
    if isinstance(o, dict):
        for v in o.values():
            yield from _walk_text(v)
    elif isinstance(o, list):
        for v in o:
            yield from _walk_text(v)
    elif isinstance(o, str):
        yield o


# ───────────────────────── 5) 사람이 읽는 규칙 문서
def markdown():
    L = ["# 세로 제안서 콘텐츠 규칙", "",
         "> 엔진(`engine/vertical_rules.py`)이 기획할 때 쓰는 규칙을 그대로 옮긴 문서다. 규칙을 바꾸면 이 문서도 다시 만든다:",
         "> `python -c \"import sys; sys.path.insert(0, 'engine'); import vertical_rules as r; open('docs/세로제안서-콘텐츠-규칙.md','w',encoding='utf-8').write(r.markdown())\"`",
         "", "원천: 실제 제출본 세로 제안서 — 유지관리 사업 5권(148장)과 구축 사업 정성 제안서 2권(약 700쪽).", "",
         "## 1. 흐름", "",
         "1. **자료 수집** — RFP 요구사항 상세표에서 고유번호마다 명칭·정의·세부내용을 모은다. 목차 항목마다 그 항목의 요구사항 근거와 '자료 신호'(절차·기간·조직·현행/개선·수치)를 붙인다.",
         "2. **규칙 고르기** — 아래 표의 조건을 위에서부터 보고 처음 맞는 규칙 하나. 기능 요구사항(SFR 등)이 걸린 항목은 '기능 요구사항 대응'.",
         "3. **기획** — 항목마다 규칙의 내용 순서·첫 구성·필수 구성과 근거 자료를 AI 에 함께 준다.",
         "4. **검사(조건문)** — 생성된 쪽을 아래 검사로 확인하고, 어긴 쪽만 위반 사유(채움 위반엔 블록별 높이 cm)와 함께 다시 쓰게 한다(최대 두 번). 요구사항 번호 누락은 코드가 바로 채운다.", "",
         "## 2. 쪽 유형 규칙 — 만약 제목이 이렇다면", "",
         "| 순서 | 조건(항목 제목) | 유형 | 쓸 내용(순서대로) | 첫 블록 구성 | 반드시 들어갈 구성 | 쓰는 법 |",
         "|:---:|---|---|---|:---:|:---:|---|"]
    for i, r in enumerate(RULES, 1):
        cond = "요구사항 번호가 SFR·FUR·FR" if r.get("by_req") else "`" + r["when"].replace("|", r"\|") + "`"   # 표 칸 안 | 는 이스케이프
        L.append(f"| {i} | {cond} | {r['label']} | {' → '.join(r['content'])} | {' / '.join(NAMES[k] for k in r['first'])} | "
                 f"{' / '.join(NAMES[k] for k in r['must']) or '—'} | {r['tip'] or '—'} |")
    L.append(f"| — | 그 밖 | {DEFAULT['label']} | {' → '.join(DEFAULT['content'])} | {' / '.join(NAMES[k] for k in DEFAULT['first'])} | — | — |")
    L += ["", "## 3. 자료 신호 — 만약 근거 자료에 이것이 있다면", "", "| 신호 | 조건(정규식) | 더할 구성 |", "|:---:|---|---|"]
    for key, rx, kind, why in SIGNALS:
        L.append(f"| {key} | `" + rx.replace("|", r"\|") + f"` | {why} |")
    L += ["", "## 4. 쪽 구성 공통 규칙", "",
          "- 한 쪽 = 도입 2문장 → 띠 문구 → 블록 2~3개. 첫 블록은 그 쪽 핵심을 한눈에 보여 주는 도식.",
          "- 한 쪽에 같은 구성 두 번 금지. 글 블록만으로 된 쪽 금지. 글 블록은 장 전체의 4분의 1 이하.",
          "- 바로 이어진 두 쪽의 첫 블록 구성이 같으면 안 된다(같은 항목의 (1/2)·(2/2)도).",
          "- 목차 단계에서 항목 주 구성은 '첫 후보 + 필수 구성' 안에서 고르고, 앞 항목과 같으면 다음 후보로 바꾼다(후보가 하나뿐인 항목은 연속 금지에서 예외).",
          "- 도식 글은 짧게: 제목 10자, 항목 한 줄 25자 이내, 개조식.",
          "- 사실·수치는 자료에 있는 것만. 제안사 정보(실적·인력 이름·지분)는 「[제안사 작성]」.", "",
          "## 5. 생성물 검사(조건문)", "",
          "| 조건 | 처리 |", "|---|---|",
          "| 글 블록만 있는 쪽 | 다시 쓰기 |", "| 한 쪽에 같은 구성 두 번 | 다시 쓰기 |", "| 앞 쪽과 첫 블록 구성이 같음 | 다시 쓰기 |",
          "| 도식 구성인데 fig 자료가 비었음 | 다시 쓰기 |", "| 도식 항목 글이 30자 넘는 것이 절반 이상 | 다시 쓰기 |",
          "| 규칙의 '반드시 들어갈 구성'이 항목 쪽 어디에도 없음 | 다시 쓰기 |", "| 첫 블록이 규칙의 첫 구성 후보가 아님 | 다시 쓰기 |",
          "| 기능 요구사항·전략 세부 항목에 기대효과 없음 | 다시 쓰기 |",
          "| 근거 요구사항 명칭의 낱말이 쪽 글에 하나도 없음(자료와 무관한 글) | 다시 쓰기 |",
          "| 장 전체 글 블록이 4분의 1 초과 | 다시 쓰기 |",
          "| 내용 없는 블록(소제목만) | 다시 쓰기 · 그릴 때도 뺀다 |",
          "| 쪽 채움 85% 미만(블록 높이 합 ÷ 본문 영역 — 렌더 실측과 ±1%) | 다시 쓰기 — 블록을 더하거나 행·항목을 늘림 |",
          "| 쪽 채움 112% 초과 | 다시 쓰기 — 블록·행을 줄임 |",
          "| 쪽 채움 100% 초과(그릴 때) | 작은 블록 둘을 2단으로 묶음 → 그래도 넘치면 간격을 줄임(최소 0.25cm) → 같은 항목 다음 쪽에 자리가 있으면 그쪽으로, 없으면 '(계속)' 쪽 |",
          "| 기대효과 상자가 기능 요구·전략 세부·기대효과 항목 밖에 있음 | 다시 쓰기 |",
          "| 장 안에서 같은 블록 조합의 쪽이 둘 | 다시 쓰기 |", "| 한 구성이 장 쪽 수의 35% 넘게 쓰임(표·글 제외, 절차는 25%) | 다시 쓰기 |",
          "| 2단 쪽이 장의 3분의 1 미만(3쪽 이상 장) | 다시 쓰기 |",
          "| 사진 블록이 없는 장(3쪽 이상) | 다시 쓰기 — 사진은 파워에셋에서 검색어로 고르고 문서 안 중복 금지 |",
          "| 도식 글 상자에서 가장 긴 낱말이 칸 폭을 넘음 | 그 문단 글자 크기를 줄임(낱말 중간 줄바꿈 금지) |",
          "| 막대 제목이 빔 | 회색 막대를 그리지 않음 |", "| 지표 숫자가 칸보다 넓음 | 글자 크기를 칸에 맞게 줄임 |",
          "| 쪽에 요구사항 번호가 빠짐 | 코드가 항목 번호로 채움 |", "",
          "## 6. 구성(블록 kind) 모양", ""]
    L += [f"- **{NAMES[k]}** (`{k}`)" for k in FIGS + ("table", "text")]
    return "\n".join(L) + "\n"
