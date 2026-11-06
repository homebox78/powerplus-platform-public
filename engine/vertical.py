# -*- coding: utf-8 -*-
"""세로(A4) 제출용 제안서 자동 제작 — '제출용'(opts.purpose == 'submit') 작업을 이 모듈이 끝까지 만든다.

  1) 기획: 올린 자료(RFP·요약)에서 사업명·발주기관·제안서 목차(RFP 권고 목차가 있으면 그대로)를 뽑고,
     장마다 본문 쪽(경로·제목·요구사항·도입 2문장·띠 문구·블록[소제목·막대 제목·글머리·표])을 짠다.
  2) 배경: 표지·목차·간지 배경을 powerAssets(세트 photo-section-keyvisual)에서 먼저 고르고,
     없거나 확신이 낮으면 나노바나나로 '흰 바탕 미니멀 유리 오브젝트' 그림을 만든다.
     어느 쪽이든 우측 하단에 연하게 두고 왼쪽·위쪽은 흰색으로 날린다(사용자 기준 2026-10-14).
  3) 제작: templates/vertical/base.pptx(표지·목차·간지·본문 마스터 + 견본 4장)로
     표지 1 · 목차(장마다) · 간지(장마다) · 본문을 만든다. 쪽 번호는 장별(Ⅱ - 3), 목차 쪽 번호는 실제 쪽.
  기본 양식의 출처: design/제안서템플릿(사내 표준 세로 템플릿)을 2026-10-14 세션에서 정비한 것."""
import contextvars, copy, hashlib, io, json, math, os, re, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image, ImageDraw, ImageFont
from lxml import etree
from pptx import Presentation
from pptx.oxml import parse_xml   # python-pptx 요소 클래스로 만든다 — etree.fromstring 도형은 도형 목록을 훑을 때 깨진다
from pptx.util import Cm, Emu, Pt

import design
import resume
import vertical_rules

A = "http://schemas.openxmlformats.org/drawingml/2006/main"
P = "http://schemas.openxmlformats.org/presentationml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS = {"a": A, "p": P, "r": R}
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(HERE, "templates", "vertical", "base.pptx")
PW, PH = 1500, 2167                     # 배경 그림(19.05 × 27.52cm 비율)
BG_SET = "photo-section-keyvisual"      # 표지·목차·간지 배경 세트
NAVY = "0B2A6F"
ROMAN = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ", "Ⅷ"]
BODY_BOTTOM = 25.6                       # 본문이 내려갈 수 있는 끝(cm) — 아래는 바닥 로고·쪽 번호
DEFAULT_PAGES = 30

OUTLINE_SYSTEM = """너는 공공 SI 제안서 기획자다. 올린 자료(제안요청서·요약·메모)를 읽고 A4 세로 기술제안서의 뼈대를 JSON 으로 낸다.

규칙
- 자료에 '제안서 목차(권고)'·'제안서 작성요령'이 있으면 그 장(Ⅰ, Ⅱ …)·절 이름과 순서를 그대로 쓴다. 없으면 기본 8장:
  Ⅰ 일반현황 / Ⅱ 전략 및 방법론 / Ⅲ 수행계획 / Ⅳ 수행기반 / Ⅴ 프로젝트 관리 / Ⅵ 프로젝트 지원 / Ⅶ 전문업체 참여 / Ⅷ 기타사항.
- 맨 끝에 별첨 장 하나(no 는 "※", title "별첨"): 요구사항 참조표·약어표·증빙서류 등 RFP 가 별첨으로 요구한 것.
- 장은 최대 8개 + 별첨. 절(sections) 아래 항목(items)이 본문 쪽 단위다. 항목마다 pages(1~3)를 정하고, 별첨을 뺀 pages 합이 {pages}쪽 안팎이 되게 한다.
- RFP 권고 목차의 절은 쪽 수가 적어도 합치거나 이름을 바꾸지 않는다(쪽이 모자라면 절마다 항목 1개·1쪽). 항목 제목은 22자 이내.
  배점이 큰 평가 항목(사업이해도·추진체계·기능 요구사항 등)에 쪽을 더 준다.
- item.req 에는 그 항목이 답하는 요구사항 고유번호(SFR-001 등)를 자료에서 찾아 적는다. 없으면 빈 배열.
- item.kind 는 그 항목 첫 쪽의 '주 구성'(아래 중 하나)이다. 항목 성격에 맞게 고르고, 문서 전체에서 다양하게 섞는다.
  concept(추진 체계·비전) · strategy(전략 목록) · compare(현행→개선) · process(절차·단계) · cards(구성 요소 2~4개) · rows(구분별 방안)
  · layers(계층 구성도) · table(목록·비교 표) · org(조직·역할) · gantt(일정) · kpi(목표 수치)
  같은 kind 가 세 항목 연속으로 오지 않게 하고, 한 kind 가 전체 항목의 30%를 넘지 않게 한다(엔진이 규칙표로 한 번 더 맞춘다).
- project.name 은 자료에 적힌 공식 사업명, client 는 발주기관 정식 명칭, year 는 자료에 적힌 사업연도(자료에 없으면 빈 글 — 짐작하지 않는다).
- project.doc 은 문서 종류. 제안요청서에 답하는 문서면 "기술제안서", 교육자료·보고서·안내서처럼 제안서가 아니면 그 이름("교육자료" 등).
- chapter.art 는 그 장을 상징하는 '작은 사물 하나'를 영어로(예: "a glass magnifier over data cards"). 사람·장면·글자 없이.
- chapter.keywords 는 배경 그림 검색용 한국어 낱말 2~4개(예: ["사업이해", "돋보기", "분석"]).
- 자료에 없는 사실을 지어내지 않는다.

JSON 형식
{"project": {"name": "", "client": "", "year": "", "doc": "기술제안서"},
 "field": "사업 분야를 영어 한 구절로",
 "chapters": [{"no": "Ⅰ", "title": "", "art": "", "keywords": [], "sections": [{"title": "", "items": [{"title": "", "req": [], "pages": 1, "kind": "concept"}]}]}]}"""

CHAPTER_SYSTEM = """너는 공공 SI 기술제안서 작성자다. 주어진 장(chapter)의 본문 쪽을 JSON 으로 쓴다. A4 세로 한 쪽은 위에서부터
경로 → 제목 → 도입 2문장 → 띠 문구(핵심 메시지 한 줄) → 블록 2~3개 로 짜인다. 블록마다 kind(구성)를 골라 내용에 맞는 모양으로 보여 준다.
제출된 실제 세로 제안서들은 쪽마다 구성이 다르다 — 글머리만 늘어놓은 쪽을 반복하지 말고, 내용이 가진 구조(단계·비교·계층·기간·수치)를 그대로 도식으로 드러낸다.

블록 구성(kind)과 fig 형식 — 도식 글은 짧게(제목 10자 이내, 항목 한 줄 25자 이내, 개조식)
- concept  추진 체계·비전·목표 구조. fig {"goal": "목표 한 줄", "pillars": [{"title": "", "items": ["", ""]}] (2~4개), "base": "기반 한 줄"}
- strategy 핵심 전략·추진 방향 목록. fig {"items": [{"tag": "전략 01", "title": "", "desc": "한 줄"}] (2~5개)}
- compare  현행 문제 → 개선(As-Is/To-Be), 기존 대비 제안. fig {"left": {"title": "As-Is 현행", "items": []}, "right": {"title": "To-Be 개선", "items": []}} (각 2~4줄, 줄끼리 짝)
- process  절차·단계·흐름 — 세로 문서라 위→아래로 그린다. fig {"steps": [{"title": "8자 이내", "items": ["25자 이내", ""]}] (3~7단계, 단계마다 설명 1~3줄)}
           3~4단계 짧은 흐름을 2단 칸에 넣을 때만 "dir": "h"(가로 갈매기, 설명 14자 이내).
- cards    나란한 구성 요소·서비스·산출물. fig {"cards": [{"title": "", "items": ["", ""]}] (2~4개)}
- rows     구분(영역·대상·유형)별 세부 방안. fig {"rows": [{"label": "8자 이내", "items": ["", ""]}] (2~6행)}
- hub      핵심 하나를 둘러싼 구성 요소·연계 기관·이해관계자(가운데 원 + 둘레 4~6개). fig {"center": "8자 이내", "center_note": "", "nodes": [{"title": "", "items": ["", ""]}] (4~6개)}
- photo    파워에셋 사진(현장·시설·장비·사람·서비스 장면) + 설명. fig {"queries": ["검색어 2~4개 — 구체 명사(예: 식품 검사 실험실, GPU 서버, 민원 창구)"], "caption": "사진 제목 한 줄", "items": ["설명 1~3줄"]}
           쪽 폭이면 왼쪽 사진·오른쪽 설명, 2단이면 사진 위·설명 아래. 장마다 1~2개 — 글만 있는 쪽이 아니라 실제 장면이 보이게. 같은 검색어를 반복하지 않는다.
- layers   계층 구성도(사용자·채널 → 서비스 → 데이터 → 인프라). fig {"layers": [{"title": "8자 이내", "items": ["요소 이름", ""]}] (2~6층, 층마다 요소 2~6개)}
- table    목록·수치 비교·요구사항 대응. 블록의 table {"cols": [], "rows": [[]]} (열 2~4, 행 2~8)
- org      수행 조직·협의체·역할. fig {"top": "사업책임자(PM)", "top_note": "", "side": ["품질보증(QA)"], "teams": [{"title": "", "items": ["역할"]}] (2~5팀)}
- gantt    일정·기간. fig {"cols": ["1월", "2월"] (12칸 이내), "rows": [{"task": "", "from": 1, "to": 3, "key": false}], "milestones": [{"title": "착수보고", "at": 1}]}
- kpi      목표 수치·성과 지표. fig {"items": [{"value": "99.9%", "label": "", "note": ""}] (2~4개)}
- effect   기대효과 — 쪽 마지막 블록에만, 짧게. fig {"items": ["", ""]}
- text     설명 글이 꼭 필요할 때만. 막대 제목(bar) + 글머리(bullets)

항목마다 주어지는 규칙과 근거(엔진이 RFP 에서 모은 것) — 반드시 따른다
- rule.content 는 그 항목에 쓸 내용과 순서다. 블록 순서를 이 순서대로 짠다(2쪽 이상이면 나눠 담는다).
- rule.first 는 첫 블록 구성 후보(앞이 우선), rule.must 는 그 항목 쪽들 안에 반드시 있어야 할 구성(하나 이상)이다.
- rule.signals 는 근거 자료에서 찾은 구조(절차·기간·조직·현행/개선·수치)다. 있으면 그 구조를 도식으로 보여 준다.
- evidence 는 그 항목이 답하는 요구사항의 원문(정의·세부내용)이다. 세부내용의 'ㅇ' 줄마다 대응 방안이 하나씩 쪽에 있어야 하고,
  요구사항 명칭의 낱말을 소제목·도식에 그대로 쓴다. evidence 에 없는 사실·수치는 쓰지 않는다.
- 엔진이 생성 뒤 위 규칙을 조건문으로 검사해 어긴 쪽은 다시 쓰게 한다.

이 문서는 가로 발표 장표가 아니라 A4 세로 제안서다 — 세로로 읽히게 기획한다
- 한 쪽은 위에서 아래로 이어지는 이야기다: (무엇이 문제·요구인가) → (방안의 구조) → (세부 절차·기준·수치) → (효과·근거). 블록 순서를 이 흐름으로.
- 도식도 세로로 키운다: 절차는 위→아래 단계, 구성은 층(layers)·체계도, 구분별 방안은 행(rows)으로 아래로 쌓는다. 가로로 4개 넘게 늘어놓지 않는다.
- 좁고 긴 내용 둘은 2단(half)으로 나란히, 넓은 도식은 쪽 폭 전체 — 2단과 1단을 섞어 쪽마다 실루엣이 다르게 한다.

쪽 구성 규칙
- 첫 블록은 그 쪽 핵심을 한눈에 보여 주는 도식이다. 항목에 kind 가 주어졌으면 그 항목 첫 쪽의 첫 블록은 그 kind 로 한다.
- 다음 블록은 세부(rows·table·cards·process·text 중 첫 블록과 다른 것), 필요하면 마지막에 effect.
- 한 쪽 안에 같은 kind 를 두 번 쓰지 않는다. text 블록만으로 된 쪽은 만들지 않는다. text 는 장 전체 블록의 4분의 1 이하.
- 바로 이어진 두 쪽의 첫 블록 kind 가 같으면 안 된다(같은 항목의 (1/2)·(2/2)도 다르게).
- 규칙이 없는 항목은: 배경·개요 → concept·compare·kpi / 현황·분석 → table·rows·kpi / 구축 방안 → concept·cards·rows·process
  / 절차·관리 → process·rows·table / 조직·인력 → org·table / 일정 → gantt / 구성도 → layers / 품질·보안 → process·rows·table / 교육·지원 → cards·table·gantt.
- 도식 블록에도 head(소제목)는 쓴다. bar 는 비워도 된다. 도식 아래 보충 글이 필요하면 bullets 1~2줄.
- 도식 하나에 글이 많으면 쪽이 넘친다 — 블록 3개 기준으로 기둥·카드·단계 항목은 2~3줄, rows 는 4행 안팎.
- 쪽은 위아래로 꽉 차야 한다(제출본은 빈 아래쪽이 없다). 본문 높이 예산은 18cm — 블록 높이 합이 15.5~18cm 가 되게 짠다. 엔진이 85% 미만 쪽은 다시 쓰게 한다.
  높이 어림(소제목 0.9 + 블록 사이 0.55 별도): concept 5~6 · hub 5~7 · process 3~4 · compare 행당 0.45+1.2 · rows 행당 0.9~1.3 · table 0.6+행당 0.6
  · cards 줄당 2.2~2.8 · kpi 1.9 · layers 층당 0.9 · strategy 항목당 1.1 · org 4.5~5.5 · gantt 0.6+행당 0.5+0.75 · effect 1~1.4
  · photo 쪽 폭 4.4~5 / 2단 5~6.
- 2단: 작은 블록 둘(kpi 2개 이하·cards 2개 이하·rows·process 5단계 이하·strategy·effect·compare·photo·table 3열 이하)은 "half": true 를 둘 다 붙여 나란히 놓는다.
  쪽마다 실루엣이 달라 보이게 2단 쪽과 1단 쪽을 섞는다(장마다 2단 쪽이 3분의 1 이상).
- 반복 금지: 기대효과(effect)는 rule 이 요구한 항목(기능 요구사항 대응·전략 세부·기대효과)에만 쓴다. 한 장에서 같은 구성(kind)은 블록 전체 기준 쪽 수의 35%를 넘지 않는다.
  같은 블록 조합(예: 지표+표+절차)을 두 쪽에 쓰지 않는다.
- 블록마다 내용이 있어야 한다 — bullets·table·fig 중 하나 이상. 소제목만 있는 블록은 쓰지 않는다.
- kpi 의 value 는 8자 이내 숫자+단위(예: 99.9%, 3초, 8억 건). 긴 수치는 줄여 쓴다(819,763,568건 → 8.2억 건).

규칙
- 항목(item) 하나에 pages 수만큼 쪽을 만든다(2쪽 이상이면 title 끝에 (1/2) 처럼 붙인다).
- title 은 '1.1 항목 이름' 꼴로 26자 이내(한 줄에 들어가게). 번호는 쓸 항목의 번호 그대로.
- lead 는 정확히 2문장. 문장마다 마침표로 끝나고 한 문장이 45자를 넘지 않는다(두 문장은 줄바꿈 없이 이어 붙여 두 줄 안에 든다). strong 은 lead 첫 문장 안의 강조 어구(그대로 들어 있어야 한다).
- band 는 30자 안팎의 한 줄. bullets 는 문장마다 70자 이하, 개조식(~함, ~임), 앞에 기호를 붙이지 않는다.
- table 은 kind 가 table 이거나 text 블록에 꼭 필요할 때만. 열 2~4개, 행 2~8개, 칸 글은 짧게.
- '사용가능하다·할 수 있다·고려하고 있다' 같은 모호한 말을 쓰지 않는다. 셀 수 있는 것은 수치로 적는다.
- 사실·수치는 자료에 있는 것만 쓴다. 제안사 정보(회사 현황·실적·인력·지분)는 자료에 없으면 「[제안사 작성]」 자리표시로 둔다.
- req 는 그 쪽이 답하는 요구사항 고유번호를 쉼표로(없으면 빈 문자열).

JSON 형식
{"pages": [{"path": "1. 사업이해도 > 1.1 사업 배경 및 목적", "title": "1.1 사업 배경 및 목적", "req": "SFR-001, SFR-002",
  "lead": ["문장 하나.", "문장 둘."], "strong": "", "band": "",
  "blocks": [{"head": "추진 체계", "kind": "concept", "fig": {"goal": "", "pillars": [{"title": "", "items": [""]}], "base": ""}},
             {"head": "", "small": "", "kind": "text", "bar": "", "bullets": ["", ""], "table": {"cols": ["", ""], "rows": [["", ""]]}}]}]}"""


# ───────────────────────── 서체 — 코드는 a시월구일1~4(본문 굵기 4단계)·G마켓 산스 TTF Bold(제목)로 쓰고, 저장 직전 고른 서체로 바꾼다.
# 제목 서체는 표지·목차·간지·쪽 제목의 큰 글자에만. 단계 = 1 옅음 · 2 본문 · 3 강조 · 4 굵음
# 본문 서체 목록은 fonts/fonts.json(가로 장표와 같은 목록, 첫 줄이 기본) — 2026-10-14 사용자 지정 4종(전부 OFL, 재배포 가능).
# 전에 쓰던 a시월구일(아시아소프트 상용)·KoPub돋움체·Rix고딕(폰트릭스)은 재배포가 안 돼 뺐다 — 옛 작업 값은 기본으로 바뀐다
_FL = json.load(open(os.path.join(HERE, "fonts", "fonts.json"), encoding="utf-8"))
VBODY = {x["id"]: (x["name"], tuple(x["faces"]), tuple(x["files"])) for x in _FL["body"]}
VBODY_DEFAULT = _FL["body"][0]["id"]
TITLE0 = ("G마켓 산스", "G마켓 산스 TTF Bold", "GmarketSansTTFBold.ttf")
# refont 가 그대로 두는 서체 — 글머리표(Arial·Wingdings)·기호, 다른 언어 대신 그리기(fontbundle.fallback_pptx 가 저장 뒤에 넣는다)
KEEP_FACES = {"Arial", "Wingdings", "Wingdings 2", "Wingdings 3", "Symbol", "Noto Sans JP", "Noto Sans SC", "Noto Sans TC"}

# 작업마다 따로인 값(서체·크기 보정·줄 높이) — 엔진 한 프로세스가 세로 제안서 여러 건을 스레드로 함께 돌리면
# 모듈 변수 하나를 같이 써서 한 작업의 서체가 다른 작업에 섞였다(2026-10-15 동시 작업 점검). run() 이 새 상태로 시작하고,
# 안쪽 ThreadPoolExecutor 는 _carry() 로 감싼 함수에 같은 상태를 넘긴다. 서체 파일·잉크 캐시(_FONTS·_INK)는 키에 서체가 들어 있어 같이 써도 된다.
_STATE = contextvars.ContextVar("vertical_state", default=None)


class _PerJob:
    """작업(문맥)마다 따로 만들어지는 dict·list 대리자 — 읽기·쓰기 문법은 원래 dict·list 그대로"""

    def __init__(self, name, make):
        self._n, self._m = name, make

    def _v(self):
        st = _STATE.get()
        if st is None:
            st = {}
            _STATE.set(st)
        if self._n not in st:
            st[self._n] = self._m()
        return st[self._n]

    def __getitem__(self, k):
        return self._v()[k]

    def __setitem__(self, k, x):
        self._v()[k] = x


def _carry(fn):
    """지금 작업의 상태를 ThreadPoolExecutor 안쪽 스레드로 넘긴다(새 스레드는 빈 문맥으로 시작한다)"""
    st = _STATE.get()
    if st is None:
        st = {}
        _STATE.set(st)

    def w(*a, **k):
        _STATE.set(st)
        return fn(*a, **k)
    return w


FONT = _PerJob("font", lambda: {"title": TITLE0, "body": VBODY[VBODY_DEFAULT]})


def use_fonts(title=None, body=None, lang="ko"):
    """opts.font_title · font_body → FONT. 모르는 값이면 기본(목록 첫 줄). lang = 장표 언어(글 런 lang 속성 — refont 가 넣는다)"""
    try:
        import fontcover
        FONT["lang"] = fontcover.LANG_TAG.get(lang, "ko-KR")
    except Exception:
        FONT["lang"] = "ko-KR"
    t = TITLE0
    TITLE_IS_BOLD[0] = False
    TITLE_SCALE[0] = 1.0
    if title and title != "gmarket":
        try:
            import fontset
            if title in fontset.TITLES:
                t = fontset.TITLES[title]
                TITLE_IS_BOLD[0] = fontset.TITLE_BOLD.get(title, False)
                TITLE_SCALE[0] = fontset.TITLE_SCALE.get(title, 1.0)
        except Exception:
            pass
    FONT["title"], FONT["body"] = t, VBODY.get(str(body or ""), VBODY[VBODY_DEFAULT])
    try:
        import fontset
        BODY_SCALE[0] = fontset.BODY_SCALE.get(str(body or ""), fontset.BODY_SCALE.get(VBODY_DEFAULT, 1.0))
    except Exception:
        BODY_SCALE[0] = 1.0
    LH[0], BL_LH[0] = 0.38 * BODY_SCALE[0], 0.42 * BODY_SCALE[0]
    _FONTS.clear()


def _level(face):
    m = re.fullmatch(r"a시월구일([1-4])", face or "")
    return int(m.group(1)) - 1 if m else None


def fface(face):
    """코드 속 서체 이름 → 고른 서체 이름"""
    lv = _level(face)
    if lv is not None:
        return FONT["body"][1][lv]
    return FONT["title"][1] if face == TITLE0[1] else face


def ffile(face):
    lv = _level(face)
    if lv is not None:
        return FONT["body"][2][lv]
    return FONT["title"][2] if face == TITLE0[1] else face


def refont(prs):
    """저장 직전 — 장표·레이아웃·마스터·테마의 서체 이름을 고른 서체로"""
    # 코드·양식은 a시월구일1~4 이름으로 짜여 있어 늘 고른 서체로 바꾼다(a시월구일은 목록에서 빠졌다)
    sub = lambda m: f'typeface="{fface(m.group(1))}"'
    keep = set(FONT["body"][1]) | {FONT["title"][1]} | KEEP_FACES
    for part in prs.part.package.iter_parts():
        el = getattr(part, "_element", None)
        if el is not None:
            lt = FONT["lang"] if "lang" in FONT._v() else "ko-KR"
            for e in el.iter():
                tf = e.get("typeface") if isinstance(e.tag, str) else None
                if tf and fface(tf) != tf:
                    e.set("typeface", fface(tf))
                elif tf and tf not in keep and not tf.startswith("+"):   # 옛 제안서에서 가져온 도식 상자의 숨은 기본 서체(lstStyle 의 산돌고딕B·윤고딕 등) — 고른 본문 서체로(R96)
                    e.set("typeface", FONT["body"][1][2 if re.search(r"(B|EB|Bold|굵|Heavy|Black)$", tf) else 1])
                if lt != "ko-KR" and isinstance(e.tag, str) and e.tag.endswith(("}rPr", "}endParaRPr", "}defRPr")):   # 장표 언어(ja-JP·zh-CN …) — 맞춤법·한자 자형
                    e.set("lang", lt)
        elif "theme" in str(part.partname) and str(part.partname).endswith(".xml"):
            part._blob = re.sub(r'typeface="([^"]+)"', sub, part._blob.decode("utf-8")).encode("utf-8")
    track_title(prs)
    scale_body(prs)


def scale_body(prs):
    """본문 서체 글자 — 크기 보정(BODY_SCALE) 후, 굵게(강조·굵음 단계) 11pt 이상이면 자간을 조금 좁힌다(fontset.BODY_TRACK)"""
    try:
        import fontset
        track, tmin = fontset.BODY_TRACK, fontset.BODY_TRACK_MIN
    except Exception:
        track, tmin = -0.015, 1100
    faces = FONT["body"][1]
    bold = set(faces[2:])
    tags = {f"{{{A}}}rPr", f"{{{A}}}defRPr", f"{{{A}}}endParaRPr"}
    for part in prs.part.package.iter_parts():
        el = getattr(part, "_element", None)
        if el is None:
            continue
        for rp in el.iter():
            if not isinstance(rp.tag, str) or rp.tag not in tags:
                continue
            lat = rp.find(f"{{{A}}}latin")
            ea = rp.find(f"{{{A}}}ea")
            f = (ea.get("typeface") if ea is not None else None) or (lat.get("typeface") if lat is not None else None)
            if f not in faces or not rp.get("sz") or rp.get("spc") == "0":   # 뱃지(자간 0 표시)는 크기를 미리 재 맞췄다
                continue
            if BODY_SCALE[0] != 1.0:
                rp.set("sz", str(round(int(rp.get("sz")) * BODY_SCALE[0] / 50) * 50))
            if f in bold and int(rp.get("sz")) >= tmin:
                rp.set("spc", str(min(int(rp.get("spc") or 0), round(track * int(rp.get("sz"))))))


try:
    from fontset import TITLE_TRACK   # 제목 서체 자간(가로 장표와 같은 값) — 원래 자간에 더한다
except Exception:
    TITLE_TRACK = -0.015


TITLE_IS_BOLD = _PerJob("title_bold", lambda: [False])   # use_fonts 가 정한다
TITLE_SCALE = _PerJob("title_scale", lambda: [1.0])      # 제목 서체 크기 보정(fonts.json title.scale) — 저장 직전 제목 글자 크기에 곱한다
BODY_SCALE = _PerJob("body_scale", lambda: [1.0])        # 본문 서체 크기 보정(fonts.json body.scale) — 글 폭·줄 높이 계산과 저장 직전 본문 글자 크기에 곱한다
BL_LH = _PerJob("bl_lh", lambda: [0.42])                 # [0] = 본문 글머리(9pt) 한 줄 높이(cm) — use_fonts 가 보정만큼 바꾼다


def track_title(prs):
    """제목 서체로 쓴 글자(표지·목차·간지·쪽 제목·띠)의 자간을 조금 좁힌다 — 양식의 원래 자간(-300~+50)에 크기 × TITLE_TRACK 을 더한다.
    자간 0 이 명시된 글자(뱃지 — 자간 없이 크기를 잰다)는 건너뛴다"""
    face = FONT["title"][1]
    tags = {f"{{{A}}}rPr", f"{{{A}}}defRPr", f"{{{A}}}endParaRPr"}
    for part in prs.part.package.iter_parts():
        el = getattr(part, "_element", None)
        if el is None:
            continue
        for rp in el.iter():
            if not isinstance(rp.tag, str) or rp.tag not in tags:
                continue
            lat = rp.find(f"{{{A}}}latin")
            ea = rp.find(f"{{{A}}}ea")
            if not ((lat is not None and lat.get("typeface") == face) or (ea is not None and ea.get("typeface") == face)):
                continue
            if TITLE_IS_BOLD[0]:
                rp.set("b", "1")   # 가족 이름 + 굵게로 고르는 제목 서체(엘리스 DX널리체) — 뱃지 글도
            if rp.get("spc") == "0":   # 뱃지 — 자간 없이 크기를 재 맞췄다(크기 보정도 하지 않는다)
                continue
            if TITLE_SCALE[0] != 1.0 and rp.get("sz"):
                rp.set("sz", str(round(int(rp.get("sz")) * TITLE_SCALE[0] / 50) * 50))   # 서체마다 덩어리감 맞춤(저장 직전 한 번)
            if rp.get("spc") == "0":
                continue
            sz = int(rp.get("sz") or 1800)
            rp.set("spc", str(int(rp.get("spc") or 0) + round(TITLE_TRACK * sz)))


# ───────────────────────── 글자 폭(목차 점선·꼬리표 폭) — 서버에 글꼴이 없으면 글자 종류로 어림
def _font(file, size):
    for d in (os.path.join(HERE, "fonts"), os.path.join(HERE, "fonts", "private"), "C:/Windows/Fonts",
              os.path.expanduser("~/AppData/Local/Microsoft/Windows/Fonts"), os.path.expanduser("~/.local/share/fonts/powerdeck"),
              "/usr/share/fonts/truetype", os.path.expanduser("~/.fonts")):
        p = os.path.join(d, file if file.lower().endswith((".ttf", ".otf")) else file + ".ttf")
        if os.path.isfile(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return None


_FONTS = {}


def font_paths():
    """이 제안서에 쓴 서체 파일 경로(제목 + 본문 굵기들) — 산출물 '5_서체' 에 넣는다(fonts/licenses/README.md 규칙, 가로 장표와 같게).
    재배포가 안 되는 서체(fontlicense — 파일 안 저작권 문구로 판단: a시월구일·Rix고딕·KoPub·하나서체)는 빼고 그 이름을 돌려준다"""
    import fontlicense
    files = list(dict.fromkeys([FONT["title"][2]] + list(FONT["body"][2])))
    found, skipped = [], []
    for f in files:
        for d in (os.path.join(HERE, "fonts"), os.path.join(HERE, "fonts", "private"), "C:/Windows/Fonts",
                  os.path.expanduser("~/AppData/Local/Microsoft/Windows/Fonts"), os.path.expanduser("~/.local/share/fonts/powerdeck"),
                  "/usr/share/fonts/truetype", os.path.expanduser("~/.fonts")):
            p_ = os.path.join(d, f if f.lower().endswith((".ttf", ".otf")) else f + ".ttf")
            if os.path.isfile(p_):
                ok_, why_ = fontlicense.shippable(p_)
                (found.append(p_) if ok_ else skipped.append(f"{f}({why_})"))
                break
        else:
            skipped.append(f)
    return found, skipped


def text_cm(t, pt, face="a시월구일2"):
    if _level(face) is not None:
        pt = pt * BODY_SCALE[0]   # 본문 서체 크기 보정(저장 직전 곱한다) — 줄 수 계산도 같은 크기로
    face = ffile(face)
    f = _FONTS.get((face, pt))
    if f is None and (face, pt) not in _FONTS:
        f = _FONTS[(face, pt)] = _font(face, pt * 10)
    if f:
        return f.getlength(t) / 10 * 0.03528
    em = pt * 0.03528
    return sum(em * (0.95 if ord(c) > 0x2E80 else 0.3 if c == " " else 0.56) for c in t)


# ───────────────────────── 기획
def _ctx(job, j, brief):
    raw = design.load_context(job, 1200000) or ""
    design.need_material(job, raw, brief, str(j.get("note") or ""))   # 원본 pptx 로 시작한 작업은 그 글이 brief 로 온다(design._plan_phase) — 같은 검사로 지나간다
    ctx = design.digest_context(job, raw) if raw else ""
    return ctx, raw


def outline(job, brief, note, ctx, raw, pages, fallback_name=""):
    user = (f"# 메모·요청\n{note or '(없음)'}\n\n# 사업 요약\n{ctx or '(없음)'}\n\n# 원문 발췌(제안서 목차·작성요령·평가 항목)\n"
            + design._excerpts(raw, ["제안서 목차", "작성요령", "작성지침", "평가 항목", "배점", "사업명", "발주"], 9000) + f"\n\n# 직접 쓴 글\n{brief or '(없음)'}")
    o = design._plan_call(job, OUTLINE_SYSTEM.replace("{pages}", str(pages)), user, 7000, "세로 제안서 목차")
    chs = [c for c in (o.get("chapters") or []) if c.get("title")]
    body = [c for c in chs if str(c.get("no")) != "※"][:8]
    for i, c in enumerate(body):
        c["no"] = ROMAN[i]
    att = next((c for c in chs if str(c.get("no")) == "※" or "별첨" in str(c.get("title"))), None) or {"title": "별첨", "sections": [
        {"title": "요구사항 참조표", "items": []}, {"title": "약어표", "items": []}, {"title": "증빙서류", "items": []}]}
    att.update({"no": "※", "title": "별첨"})
    o["chapters"] = body + [att]
    reqs = vertical_rules.collect(raw)   # 자료 수집 — RFP 요구사항 상세표(고유번호·명칭·정의·세부내용)
    o["_reqs"] = len(reqs)
    o["_req_list"] = [{"id": r["id"], "name": r.get("name") or ""} for r in reqs.values()]   # 별첨 요구사항 대응표(R117) — 번호·명칭만 보관
    flat = []
    for c in body:   # 항목마다 규칙 + 근거, 주 구성은 규칙 후보 안에서·세 번 연속 금지(조건문)
        for s in c.get("sections") or []:
            for it in s.get("items") or []:
                it["req"] = [str(x).strip() for x in it.get("req") or [] if str(x).strip()]
                it["_brief"] = vertical_rules.brief_for(it, s.get("title") or "", reqs, design._excerpts(raw, [it.get("title") or ""], 1200))
                flat.append(it)
    vertical_rules.assign_kinds(flat)
    p = o.setdefault("project", {})
    # 사업명을 못 찾으면 입력한 사업명 → 작업 이름 — 예전엔 글자 그대로 '사업명'이 표지에 찍혔다(10-29 057f·d4fd·d448, R144)
    nm = str(p.get("name") or "").strip()
    p["name"] = (nm if nm and not re.fullmatch(r"[(\[]?\s*사업\s*명\s*[)\]]?", nm) else "") or fallback_name or "사업명"
    p["client"] = str(p.get("client") or "").strip()
    # 연도는 자료에 있을 때만 — AI 가 자료에 없는 연도를 지어냈다(지금 2026년인데 표지 2025년, 10-29 057f·d4fd·d448·110d, R144)
    yr = re.sub(r"[^0-9]", "", str(p.get("year") or ""))
    p["year"] = yr if len(yr) == 4 and yr in f"{raw} {ctx} {brief} {note}" else time.strftime("%Y")
    p["doc"] = str(p.get("doc") or "기술제안서")
    return o


def fit_outline(job, o, pages, explicit):
    """목차를 사용자가 적은 쪽 수에 맞춘다(R107) — '5장 지정' 인데 RFP 목차 규칙(절마다 1쪽)이 이겨 본문 65쪽을 만들었다(10-28).
    적지 않았으면(explicit=False) 그대로 두고 최소 쪽 수만 알린다. 줄일 때: ① 항목마다 1쪽 ② 그래도 많으면 절마다 앞 항목부터 남긴다.
    RFP 권고 목차의 절은 빼지 않는다(위원이 채점표와 1:1 로 맞춰 본다) — 그래서 절 수보다 적게는 줄지 않는다"""
    body = [c for c in o.get("chapters") or [] if c.get("no") != "※"]
    secs = [s for c in body for s in c.get("sections") or []]
    its = [it for s in secs for it in s.get("items") or []]
    total = sum(int(it.get("pages") or 1) for it in its)
    n_sec = sum(1 for s in secs if s.get("items"))
    msg = f"RFP 권고 목차: 장 {len(body)} · 절 {len(secs)} · 항목 {len(its)} → 본문 {total}쪽"
    if not explicit or not its or total <= pages * 1.15 + 1:
        job.event(msg + ("" if explicit else f" (쪽 수를 적으면 그 수에 맞춰 줄입니다 — 최소 {n_sec}쪽)"), "done")
        return o
    for it in its:
        it["pages"] = 1
    target = max(pages, n_sec)
    if len(its) > target:
        keep, level = set(), 0
        while len(keep) < target:
            added = False
            for s in secs:
                lst = s.get("items") or []
                if level < len(lst) and len(keep) < target:
                    keep.add(id(lst[level]))
                    added = True
            if not added:
                break
            level += 1
        for s in secs:
            s["items"] = [it for it in (s.get("items") or []) if id(it) in keep]
    new_total = sum(int(it.get("pages") or 1) for s in secs for it in s.get("items") or [])
    job.event(msg + f" — 지정한 {pages}쪽에 맞춰 {new_total}쪽으로 줄였습니다"
              + (f"(RFP 목차 절 {n_sec}개는 빼지 않아 최소 {n_sec}쪽)" if pages < n_sec else "") + ".", "done")
    return o


class _Split(Exception):
    """긴 장 — 한 번에 쓰지 않고 처음부터 조각으로 나눠 쓴다는 표시"""


CHUNK_ITEMS = 4   # 긴 장을 나눠 쓸 때 한 번에 쓰는 항목 수(절 안에서)


def _cache_path(job):
    return os.path.join(job.dir, "_slides", "_vertical_parts.json")


def _cached_call(job, user, tokens, what):
    """본문 요청 하나 — 같은 요청(지시문 해시)을 앞 실행에서 이미 받았으면 다시 부르지 않는다.
    장 단위 보관만으로는 41쪽 장 도중에 멈추면 끝난 조각도 버렸다(10-28 사용자 "한 데까지 저장되고 이어서", R106)"""
    k = hashlib.sha1((CHAPTER_SYSTEM + "\n" + user + f"\n{tokens}").encode("utf-8", "replace")).hexdigest()
    vp = getattr(job, "_vp", None)
    lock = vp["lock"] if vp else None
    try:
        got = json.load(open(_cache_path(job), encoding="utf-8")).get(k)
    except Exception:
        got = None
    if got:
        job.event(f"{what} — 앞 실행에서 받은 것을 다시 씁니다(AI 호출 없음).", "done")
        return got
    d = design._plan_call(job, CHAPTER_SYSTEM, user, tokens, what)
    try:
        if lock:
            lock.acquire()
        p = _cache_path(job)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        try:
            allc = json.load(open(p, encoding="utf-8"))
        except Exception:
            allc = {}
        allc[k] = d
        with open(p + ".tmp", "w", encoding="utf-8") as f:
            json.dump(allc, f, ensure_ascii=False)
        os.replace(p + ".tmp", p)
    except Exception as e:
        design.W["log"]("본문 조각 보관 실패(무시):", e)
    finally:
        if lock:
            lock.release()
    return d


def _live(job, ch, pages):
    """쓴 쪽을 화면에 하나씩 — 장 번호·쪽 제목·블록 종류를 vertical_live.json 으로 올린다(진행률 아래 카드, R106)"""
    vp = getattr(job, "_vp", None)
    if not vp or not pages:
        return
    with vp["lock"]:
        live = vp.setdefault("live", {})
        for pg in pages:
            t = str(pg.get("title") or "")
            if t:
                live[f"{ch['no']}|{t}"] = {"ch": ch["no"], "chapter": ch.get("title") or "", "t": t[:60],
                                         "k": [str(b.get("kind") or "text") for b in (pg.get("blocks") or [])][:6]}
        order = {r: i for i, r in enumerate(ROMAN)}
        num = lambda t: tuple(int(n) for n in (re.match(r"(\d+)\.(\d+)", t) or re.match(r"()()", "")).groups() if n) or (999,)
        rows = sorted(live.values(), key=lambda x: (order.get(x["ch"], 99), num(x["t"]), x["t"]))   # 1.10 이 1.2 앞에 오지 않게 숫자로
        try:
            d = os.path.join(job.dir, "_mockup")
            os.makedirs(d, exist_ok=True)
            p = os.path.join(d, "vertical_live.json")
            json.dump({"pages": rows, "total": vp.get("pages_total", 0)}, open(p, "w", encoding="utf-8"), ensure_ascii=False)
            design.W["put_file"](job.id, "mockup", p, "vertical_live.json")
        except Exception as e:
            design.W["log"]("쓴 쪽 미리 보기 올리기 실패(무시):", e)


def _body_pct(vp):
    """본문 진행률 — 첫 쓰기(항목) 12→34%, 고쳐 쓰기(조각) 34→38%. 고쳐 쓰기 조각 수는 장마다 늘어나지만 job.push 는 줄지 않는다"""
    w = min(1.0, vp["done"] / max(1, vp["total"]))
    f = min(1.0, vp.get("fdone", 0) / vp["ftotal"]) if vp.get("ftotal") else 0.0
    return 12 + int(22 * w) + int(4 * f)


def _tick(job, n):
    """첫 쓰기 진행 — 쓸 항목 전체(job._vp total) 중 끝난 항목 수. 장·조각 스레드가 함께 부른다"""
    vp = getattr(job, "_vp", None)
    if not vp:
        return
    with vp["lock"]:
        vp["done"] += n
        pct = _body_pct(vp)
    job.push("기획", pct)


def _fix_add(job, n):
    vp = getattr(job, "_vp", None)
    if vp:
        with vp["lock"]:
            vp["ftotal"] = vp.get("ftotal", 0) + n


def _fix_tick(job):
    """고쳐 쓰기 조각 하나가 끝남 — 38% 앞에서 멈춘 듯 보이지 않게(R107)"""
    vp = getattr(job, "_vp", None)
    if not vp:
        return
    with vp["lock"]:
        vp["fdone"] = vp.get("fdone", 0) + 1
        pct = _body_pct(vp)
    job.push("기획", pct)


def _pinpoint(ch, bad, pages, ok):
    """'(장 전체)' 위반을 쪽 단위로 — 장 전체 위반 하나 때문에 41쪽 전부를 한 요청에 다시 쓰다 '최대 토큰' 으로 잘렸다(10-28 15:30, R107).
    사진이 없으면 엔진이 덜 찬 쪽에 사진 블록을 직접 넣고(AI 호출 없음), 나머지는 고칠 쪽만 골라 그 쪽의 위반으로 바꾼다.
    → (쪽 위반 목록, 엔진이 바로 고친 것 글 목록). rule 이 없는(모르는) 장 전체 위반은 쪽을 고를 수 없어 고쳐 쓰기에서 뺀다"""
    out = [b for b in bad if b.get("title") != "(장 전체)"]
    fixed = []
    flagged = {b["title"] for b in out}
    kinds = lambda pg: [vertical_rules._kind(b, ok) for b in pg.get("blocks") or []]

    def pick(cands, n, why):
        cands = sorted(cands, key=lambda pg: 0 if pg.get("title") in flagged else 1)   # 이미 고칠 쪽을 먼저 — 조각 수를 늘리지 않게
        for pg in cands[:max(0, n)]:
            out.append({"title": pg.get("title"), "why": why})
            flagged.add(pg.get("title"))

    for w in [b for b in bad if b.get("title") == "(장 전체)"]:
        r = w.get("rule")
        if r == "kind_cap":
            nm = vertical_rules.NAMES.get(w["kind"], w["kind"])
            pick([pg for pg in reversed(pages) if w["kind"] in kinds(pg)], w["n"] - w["max"],
                 f"장 안에 {nm} 구성이 많다({w['n']}쪽, 최대 {w['max']}) — 이 쪽은 {nm} 말고 다른 구성으로 바꿀 것")
        elif r == "no_photo":
            done = 0
            for pg in sorted(pages, key=page_fill):   # 덜 찬 쪽부터 — 사진이 빈 자리도 채운다
                if done >= 2 or page_fill(pg) > 0.85:
                    break
                t = re.sub(r"^\d+(\.\d+)*\s*|\s*\(\d+/\d+\)\s*$", "", str(pg.get("title") or "")).strip()
                blk = {"kind": "photo", "head": t[:18], "fig": {"queries": [q for q in (t, str(ch.get("title") or "")) if q], "caption": t, "items": []}}
                trial = dict(pg, blocks=list(pg.get("blocks") or []) + [blk])
                if page_fill(trial) <= 1.02:
                    pg["blocks"] = trial["blocks"]
                    done += 1
                    fixed.append(f"{pg.get('title')}: 사진 블록 넣음")
            if not done:
                pick(sorted(pages, key=page_fill)[:1], 1, "이 쪽에 사진(photo) 블록 하나 — 현장·장비·서비스 장면을 검색어로(장 안에 사진이 없다)")
        elif r == "halves":
            cands = sorted([pg for pg in pages if len(pg.get("blocks") or []) >= 2 and not any(b.get("half") for b in pg.get("blocks") or [])],
                           key=lambda pg: -page_fill(pg))   # 넘친 쪽부터 — 2단으로 묶으면 높이도 준다
            pick(cands, w["need"] - w["have"], "작은 블록 둘을 \"half\": true 로 나란히(2단) — 장 안에 2단 쪽이 모자라다")
        elif r == "text_ratio":
            excess, sel = w["texts"] - w["cap"], []
            for pg in sorted([pg for pg in pages if "text" in kinds(pg)], key=lambda pg: -kinds(pg).count("text")):
                if excess <= 0:
                    break
                sel.append(pg)
                excess -= kinds(pg).count("text")
            pick(sel, len(sel), "글 블록 하나를 내용에 맞는 도식(표·절차·카드·구분 행)으로 — 장 안에 글 블록이 많다")
    return out, fixed


def chapter_pages(job, o, ch, ctx, raw):
    items = [{"section": f"{si}. {s['title']}", "item": f"{si}.{ii} {it['title']}", "req": it.get("req") or [], "pages": int(it.get("pages") or 1),
              **({"kind": it["kind"]} if it.get("kind") in FIG_KINDS + ("table",) else {}),
              "_brief": it.get("_brief") or vertical_rules.brief_for(it, s.get("title") or "", {})}
             for si, s in enumerate(ch.get("sections") or [], 1) for ii, it in enumerate(s.get("items") or [], 1)]
    if not items:
        return []
    shown = [{**{k: v for k, v in it.items() if k != "_brief"},
              "rule": {k: it["_brief"][k] for k in ("rule_label", "content", "first", "must", "tip", "signals")}, "evidence": it["_brief"]["evidence"]}
             for it in items]
    keys = [ch["title"]] + [s["title"] for s in ch.get("sections") or []] + [x for it in items for x in it["req"]]
    user = (f"# 사업\n{o['project']['name']} — 발주 {o['project']['client']}\n\n# 이 장\n{ch['no']} {ch['title']}\n\n# 쓸 항목(순서대로)\n"
            + json.dumps(shown, ensure_ascii=False) + f"\n\n# 사업 요약\n{ctx or '(없음)'}\n\n# 원문 발췌\n{design._excerpts(raw, keys, 9000)}")
    # 항목이 많은 장은 한 번에 쓰면 답이 16k 를 넘어 '최대 토큰' 으로 두 번 잘린 뒤에야 나눴다(II 기술부문, 10-28 R105) — 처음부터 절마다
    full = json.dumps(shown, ensure_ascii=False)   # user 안의 항목 목록 — 조각·고쳐 쓰기에서 이 부분만 바꿔 넣는다
    n_pages = sum(int(it.get("pages") or 1) for it in items)
    big = len(items) > 7 or n_pages > 9
    counted = False   # 진행률(항목 단위)에 이 장을 이미 셌나 — 조각으로 쓰면 조각마다 센다
    try:
        if big:
            raise _Split(f"항목 {len(items)}개·{n_pages}쪽")
        d = _cached_call(job, user, 16000, f"{ch['no']} {ch['title']} 본문")   # 도식 자료(fig)가 붙어 글보다 길다
        pages = [pg for pg in (d.get("pages") or []) if pg.get("title")]
        _live(job, ch, pages)
    except design.Cancelled:
        raise
    except Exception as e:   # 장 한 번에 두 번 다 깨지면 절마다 따로(응답이 짧을수록 JSON 이 덜 깨진다) — 장 2개가 통째로 빠졌다(2026-10-14)
        # 절 하나도 항목이 많으면 9천 토큰에서 잘려 '이 절은 빠집니다' 로 갔다(II 1절, 10-28 15:03) — 절 안에서 항목 4개씩 조각,
        # 조각은 동시에 쓰고 끝날 때마다 진행률에 든다(41쪽 장이 12% 에서 멈춘 듯 보이던 것, R106)
        parts = []
        for sec in dict.fromkeys(x["section"] for x in shown):
            sec_items = [x for x in shown if x["section"] == sec]
            parts += [sec_items[k:k + CHUNK_ITEMS] for k in range(0, len(sec_items), CHUNK_ITEMS)]
        if isinstance(e, _Split):
            job.event(f"{ch['no']} 장은 길어서({e}) 처음부터 항목 {CHUNK_ITEMS}개씩 {len(parts)}조각으로 나눠 동시에 씁니다.")
        else:
            job.event(f"{ch['no']} 장 한 번에 쓰기 실패 — 항목 {CHUNK_ITEMS}개씩 {len(parts)}조각으로 나눠 다시 씁니다: {str(e)[:80]}", "warn")

        def one(part):
            u = user.replace(full, json.dumps(part, ensure_ascii=False))
            pg_n = sum(int(x.get("pages") or 1) for x in part)
            d = _cached_call(job, u, min(14000, 4000 + 1800 * pg_n), f"{ch['no']} {part[0]['item'][:24]} 외 {len(part) - 1}개 본문")
            got_pages = [pg for pg in (d.get("pages") or []) if pg.get("title")]
            _live(job, ch, got_pages)
            return got_pages

        got = [None] * len(parts)
        with ThreadPoolExecutor(max_workers=max(1, min(3, len(parts)))) as ex:
            futs = {ex.submit(_carry(one), part): k for k, part in enumerate(parts)}
            for f in as_completed(futs):
                k = futs[f]
                try:
                    got[k] = f.result()
                except design.Cancelled:
                    raise
                except Exception as e2:
                    got[k] = []
                    job.event(f"{ch['no']} {parts[k][0]['item'][:30]} 외 {len(parts[k]) - 1}개 본문 실패 — 이 항목들은 빠집니다: {str(e2)[:80]}", "warn")
                _tick(job, len(parts[k]))
        pages = [pg for g in got for pg in (g or [])]   # 조각 순서(= 목차 순서)대로
        if not pages:
            raise
        counted = True
    if not counted:
        _tick(job, len(items))
    normalize_blocks(pages)
    ok = lambda b: bool(fig_data(b))
    bad, fixed = vertical_rules.check(items, pages, ok, page_fill, block_empty)   # 규칙 검사(조건문)
    key = lambda t: (re.match(r"(\d+\.\d+)", str(t or "")) or [""])[0]
    for rnd in (1, 2):   # 어긴 쪽만 사유와 함께 다시 쓴다 — 최대 두 번(5차: 한 번으로는 채움 위반이 남아 '(계속)' 쪽 5개)
        if not bad or (rnd == 2 and not any(re.search(r"찼다|넘친다|블록 조합|첫 블록|구성을", b["why"]) for b in bad)):
            break
        n_bad = len(bad)
        # 장 전체 위반은 고칠 쪽을 골라 쪽 위반으로(사진 없음은 엔진이 직접) — 예전엔 장 전체 위반 하나로 41쪽 전부를 한 요청에 다시 써 잘렸다(R107)
        bad, auto = _pinpoint(ch, bad, pages, ok)
        if auto:
            fixed += auto
            normalize_blocks(pages)
        names = {b["title"] for b in bad}
        have = {key(pg.get("title")) for pg in pages}
        redo = [pg for pg in pages if pg.get("title") in names]
        want = {key(pg.get("title")) for pg in redo} | {key(it["item"]) for it in items if it["item"] in names and key(it["item"]) not in have}
        order_keys = [key(it["item"]) for it in items if key(it["item"]) in want]
        if not order_keys:
            break
        # 고칠 항목을 목차 순서대로 조각 — 항목 4개·6쪽 이하씩, 조각은 동시에(첫 쓰기와 같은 방식)
        chunks, cur, cur_n = [], [], 0
        for k in order_keys:
            npg = max(1, sum(1 for pg in redo if key(pg.get("title")) == k))
            if cur and (len(cur) >= CHUNK_ITEMS or cur_n + npg > 6):
                chunks.append(cur)
                cur, cur_n = [], 0
            cur.append(k)
            cur_n += npg
        if cur:
            chunks.append(cur)
        kinds_n = {"덜 참": sum(1 for b in bad if "찼다" in b["why"]), "넘침": sum(1 for b in bad if "넘친다" in b["why"]),
                   "구성": sum(1 for b in bad if re.search(r"구성|블록 조합|첫 블록|2단|도식", b["why"]))}
        job.event(f"{ch['no']} 규칙 검사 위반 {n_bad}건 — 고칠 쪽 {len(redo)}쪽을 {len(chunks)}조각으로 나눠 동시에 고쳐 씁니다({rnd}차)"
                  + (" · " + " · ".join(f"{k} {v}" for k, v in kinds_n.items() if v) if any(kinds_n.values()) else "")
                  + (f" · 엔진이 바로 고침 {len(auto)}" if auto else ""), "warn")
        by_t = {str(pg.get("title")): pg for pg in pages}

        def why_of(ks):
            out_ = []
            for b in bad:   # 채움 위반엔 그 쪽 블록별 높이를 붙인다 — 무엇을 얼마나 줄이고 늘릴지 AI 가 알게
                if key(b["title"]) not in ks:
                    continue
                w = f"- {b['title']}: {b['why']}"
                pg = by_t.get(str(b["title"]))
                if pg is not None and re.search(r"찼다|넘친다", b["why"]):
                    w += " (지금 블록: " + " · ".join(f"{vertical_rules.NAMES.get(str(x.get('kind') or 'text'), x.get('kind'))} {block_height(x):.1f}cm"
                                                    for x in pg.get("blocks") or [] if not block_empty(x)) + f" / 본문 영역 {BODY_BOTTOM - 7.55:.1f}cm)"
                out_.append(w)
            return out_

        def fix_one(ks):
            part_items = [x for x in shown if key(x["item"]) in ks]
            part_pages = [pg for pg in redo if key(pg.get("title")) in ks]
            fu = (user.replace(full, json.dumps(part_items, ensure_ascii=False))
                  + "\n\n# 먼저 쓴 쪽(이 중 고칠 것)\n" + json.dumps(part_pages, ensure_ascii=False)
                  + '\n\n# 규칙 검사 위반 — 이 쪽들만 고쳐 같은 JSON 형식({"pages": [...]})으로 다시 낸다. 제목은 그대로.\n' + "\n".join(why_of(set(ks))))
            d = _cached_call(job, fu, min(14000, 4000 + 1800 * max(1, len(part_pages))),
                             f"{ch['no']} 고쳐 쓰기 {rnd}차 · {part_items[0]['item'][:20]}" + (f" 외 {len(part_items) - 1}개" if len(part_items) > 1 else ""))
            return d.get("pages") or []

        _fix_add(job, len(chunks))
        got_fix = []
        with ThreadPoolExecutor(max_workers=max(1, min(3, len(chunks)))) as ex:
            futs = {ex.submit(_carry(fix_one), ks): ks for ks in chunks}
            for f in as_completed(futs):
                try:
                    got_fix += f.result()
                except design.Cancelled:
                    raise
                except Exception as e:   # 조각 하나가 실패해도 다른 조각은 받는다 — 그 항목은 앞의 것 그대로
                    job.event(f"{ch['no']} 고쳐 쓰기 조각 실패(그 항목은 앞의 것으로): {str(e)[:100]}", "warn")
                _fix_tick(job)
        try:
            d2 = {"pages": got_fix}
            # 항목 번호 기준으로 합친다 — 제목이 바뀌거나 빠졌던 항목 쪽도 받는다(4차: 고쳐 쓴 뒤 '이 항목의 쪽이 없다')
            new_by, old_by = {}, {}
            normalize_blocks(d2.get("pages") or [])   # 항목별 비교(item_cost)가 채움을 재려면 먼저 다듬어야 한다
            for pg in d2.get("pages") or []:
                if pg.get("title"):
                    new_by.setdefault(key(pg["title"]), []).append(pg)
            for pg in pages:
                old_by.setdefault(key(pg.get("title")), []).append(pg)
            redo_keys = {k for ks in chunks for k in ks}
            merged = []
            for it in items:
                k = key(it["item"])
                if k in new_by and k in old_by and k in redo_keys:
                    # 항목마다 고친 것과 앞의 것 중 나은 쪽 — 장 전체 위반 '건수' 만 보면 한 항목이 134% 로 넘쳐도
                    # 다른 항목이 나아져 받아들였다(7차: Ⅲ 13 → 8건인데 넘친 쪽 126~134% 3개, 덜어 낸 행 24)
                    use_new = item_cost(new_by[k], bad, k) <= item_cost(old_by[k], bad, k, old=True)
                    merged += new_by[k] if use_new else old_by[k]
                else:
                    merged += new_by[k] if (k in new_by and (k in redo_keys or k not in old_by)) else old_by.get(k, [])
            prev_pages = pages
            pages = merged
            normalize_blocks(pages)
            bad2, fixed2 = vertical_rules.check(items, pages, ok, page_fill, block_empty)
            if len(bad2) > n_bad:   # 고쳐 쓴 것이 더 나쁘면 앞의 것으로(6차: 2차 고쳐 쓰기에서 4→5, 2→4, 4→7) — 같은 검사 건수끼리 견준다
                job.event(f"{ch['no']} 고쳐 쓴 뒤({rnd}차) 위반이 {n_bad} → {len(bad2)}건으로 늘어 앞의 것을 씁니다", "warn")
                pages = prev_pages
                break
            fixed += fixed2
            job.event(f"{ch['no']} 고쳐 쓴 뒤({rnd}차) 규칙 위반 {n_bad} → {len(bad2)}건"
                      + (" — " + " / ".join(f"{b['title']}: {b['why']}" for b in bad2[:3]) if bad2 else ""), "warn" if bad2 else "done")
            bad = bad2
        except Exception as e:
            job.event(f"{ch['no']} 고쳐 쓰기 실패(지금 것으로 만듭니다): {str(e)[:100]}", "warn")
            break
    if fixed:
        job.event(f"{ch['no']} 엔진이 바로 고침 {len(fixed)}건 — " + " / ".join(fixed[:3]))
    for pg in pages:   # table 구성은 기존 표 블록으로 그린다(kind 만 table 이고 표가 비면 글 블록)
        for b in pg.get("blocks") or []:
            if b.get("kind") == "table" and not (isinstance(b.get("table"), dict) and b["table"].get("rows")):
                b["kind"] = "text"
    return pages


def normalize_blocks(pages):
    """AI 가 형식 칸을 바꿔 쓴 블록을 바로잡는다 — 표를 fig 에 넣음(cols·rows) · 글 줄을 fig.items 에 넣음.
    3차 시험에서 빈 블록 9건이 전부 'fig 안의 표'였다(표가 비었다고 글 블록으로 바꿔 소제목만 남음, 2026-10-14)"""
    for pg in pages:
        for b in pg.get("blocks") or []:
            f = b.get("fig") if isinstance(b.get("fig"), dict) else {}
            tb = b.get("table") if isinstance(b.get("table"), dict) else {}
            if not tb.get("rows") and isinstance(f.get("rows"), list) and f.get("cols") and all(isinstance(r, list) for r in f["rows"]):
                b["table"], b["kind"] = {"cols": f["cols"], "rows": f["rows"]}, "table"
            elif str(b.get("kind") or "text") == "text" and not [x for x in b.get("bullets") or [] if str(x).strip()]                     and isinstance(f.get("items"), list) and all(isinstance(x, str) for x in f["items"]):
                b["bullets"] = f["items"]
    return pages


def kind_mix(chapters_pages):
    """구성 분포 — 첫 블록 kind 별 쪽 수(작업 기록에 남겨 '한 모양 도배'를 바로 보이게)"""
    cnt = {}
    for pages in chapters_pages.values():
        for pg in pages:
            b = (pg.get("blocks") or [{}])[0]
            k = b.get("kind") if fig_data(b) or b.get("kind") == "table" else "text"
            cnt[k] = cnt.get(k, 0) + 1
    return cnt


# ───────────────────────── 배경
def _api(method, path, body=None, raw=False):
    cfg = design.W["CFG"]
    root = cfg["api_base"].rstrip("/").rsplit("/deck", 1)[0]
    hdr = {"Authorization": "Bearer " + cfg["worker_key"], "X-Worker": cfg.get("name", "worker"), "User-Agent": "powerDeck"}
    data = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        hdr["Content-Type"] = "application/json"
    r = urllib.request.urlopen(urllib.request.Request(root + path, data=data, headers=hdr, method=method), timeout=90).read()
    return r if raw else json.loads(r)


def find_bg(job, text, keywords, used, kind, topic=""):
    """powerAssets 배경 세트에서 고르기 — AI 확신 0.5 이상만 쓴다. 사람이 나오는 장면 키비주얼은 피한다."""
    try:
        d = _api("POST", "/assets/pick", {"category": "photo", "set": BG_SET, "text": text, "queries": keywords[:4], "exclude": list(used), "limit": 20})
        d = d.get("data", d)
    except Exception as e:
        job.event(f"powerAssets 배경 검색 실패({kind}) — 새로 만듭니다: {str(e)[:100]}", "warn")
        return None, None
    pick, conf = d.get("pick"), float(d.get("confidence") or 0)
    name = str((d.get("picked") or {}).get("label") or "")
    if not pick or conf < 0.9 or re.search(r"공무원|국민|회의|교육|고민|상담원|사람", name):
        return None, None
    if offtopic(name, f"{text} {' '.join(keywords)} {topic}"):   # 사업과 동떨어진 범주(R120)
        return None, None
    if not relevance(asset_text(d.get("picked") or {}) or name, f"{text} {' '.join(keywords)} {topic}".replace("배경", "")):   # 일반어만 겹치면 안 맞는 그림 — 생성으로(10-29)
        return None, None
    try:
        used.add(pick)
        return _api("GET", f"/assets/items/{pick}/file/original", raw=True), f"powerAssets '{name}'(확신 {conf})"
    except Exception:
        return None, None


# ───────── 그림 주제 검사(R120) — 10-28: 4d58(바이오 빅데이터) 간지에 '곡물·채소·고기·생선 — 식품 데이터 수집' 그림(낱말 점수 0 인데 세트 안 최고점이라 뽑힘),
#   e25(K-브랜드 광고) '자막 제작·검수 현장' 사진 칸에 군용 다연장 로켓 차량('현장' 같은 일반어 검색에 걸림).
#   ① 사업과 동떨어진 범주(그림 이름·태그에 있고 사업·칸 글에는 없는 것)는 뽑지 않는다 ② 일반어만 겹친 그림은 관련 없음으로 본다
OFFTOPIC = {
    "군사·무기": r"군사|군용|군대|군인|무기|미사일|로켓|전차|탱크|장갑차|전투|포탄|포병|총기|탄약|발사대|발사 차량|전투기|폭격|폭탄",
    "음식·식재료": r"식품|곡물|채소|고기|육류|생선|수산|과일|음식|요리|식재료|조리|급식|식당|빵|쌀",
    "의료": r"병원|의료|진료|환자|수술|약품|의약|간호",
    "농축산": r"농업|농장|농작물|가축|축산|양식장|어선|어업",
    "종교·장례": r"종교|교회|사찰|장례|묘지",
}
GENERIC = {"현장", "제작", "검수", "관리", "운영", "지원", "체계", "방안", "계획", "구성", "사진", "이미지", "장면", "서비스", "시스템", "업무", "과정",
           "절차", "결과", "모습", "세로", "제안서", "키비주얼", "배경", "간지", "표지", "목차", "본문", "데이터", "기반", "통합", "전략", "추진", "개요",
           "현황", "분석", "구축", "사업", "수행", "방법", "기술", "품질", "일반", "단계", "흐름", "연계", "센터", "플랫폼"}


def _toks(t):
    return {w for w in re.findall(r"[가-힣A-Za-z0-9]{2,}", str(t or ""))}


def asset_text(r):
    """자산 행의 이름·키워드·태그·설명을 한 줄로"""
    parts = [r.get("name"), r.get("label"), r.get("title"), r.get("description"), r.get("desc")]
    for k in ("keywords", "tags"):
        v = r.get(k)
        parts += v if isinstance(v, list) else [v]
    return " ".join(str(x) for x in parts if x)


def offtopic(asset, context):
    """그림(asset 글)이 사업·칸 글(context)과 동떨어진 범주면 그 범주 이름, 아니면 ''"""
    for name, rx in OFFTOPIC.items():
        if re.search(rx, asset or "") and not re.search(rx, context or ""):
            return name
    return ""


def relevance(asset, slot):
    """칸 글(slot)의 일반어가 아닌 낱말 중 그림 글(asset)에 든 것 — 부분 일치(2자 이상)도 센다"""
    at = _toks(asset)
    hit = set()
    for t in _toks(slot) - GENERIC:
        if any(t in a or (len(a) >= 2 and a in t and a not in GENERIC) for a in at):
            hit.add(t)
    return hit


PEOPLE = r"공무원|국민|회의|교육|고민|상담원|사람|조리원|점검원|연구원|어르신|엄마|아이"
# 세로(9:16) 제안서 전용 배경 세트 — 실사·3D 를 따로 묶었다(db/migrate-legacy/vp-sets.mjs, 사용자 2026-10-14 "세로제안서용 이미지는 따로 분리").
# 톤에 따라 고른다(사용자 "실사·3D 따로 올렸는데 디자인 테마에 따라 다르게"): 하얀 3D 렌더·파랑 포인트 → 블루·글래스·딥 네이비, 실사 → 네이비·틸·차콜
VP_SETS = {"photo": "vp-bg-photo", "3d": "vp-bg-3d", "dark": "vp-bg-dark", "glass": "vp-bg-glass"}
# 다크 키비주얼(VP3 125장, 짙은 남색 + 빛나는 물체가 아래) — 스플릿 스타일의 표지·간지 전면 배경(사용자 2026-10-15 "검정으로 크게 배경을 넣지 말고
# 파워에셋 다크 배경을 활용한 테마로, 지금은 꾸밈도 없고 칙칙해"). 이름에 표지·간지 역할이 없어 역할 대신 장 낱말로만 고른다. 목차·본문엔 쓰지 않는다
# 유리 아이소메트릭(HV1 87장, 밝은 바탕 + 아래쪽 유리 장면)도 이름에 역할이 없다 — 다크처럼 장 낱말로만
NOROLE_KINDS = ("dark", "glass")
DARK_STYLES = ("split",)
# 배경 세트는 스타일(테마)이 정한다 — 사용자 2026-10-16 "테마마다 배경이 달라야 함, 다크 키비주얼 말고는 배경이미지까지 같다".
# 예전엔 톤(색)이 실사/3D 를 골라 같은 톤이면 다섯 테마가 같은 그림을 같은 순서로 뽑았다. 톤은 이제 색만.
#   세트 4개를 테마 6개가 나눠 쓴다 — 같은 세트를 쓰는 둘(인덱스 탭·플로팅 필 = 유리, 사이드 레일·미니멀 라인 = 실사)은
#   세트를 반으로 갈라(STYLE_HALF) 서로 다른 그림을 뽑고, 쪽에 까는 모양(STYLE_COMPOSE)도 다르다
STYLE_BG = {"band": "3d", "tab": "glass", "side": "photo", "split": "dark", "pill": "glass", "line": "photo"}
STYLE_HALF = {"tab": 0, "pill": 1, "side": 0, "line": 1, "band": 0}   # 클래식 밴드는 3D 세트 반 — 나머지 반은 다크 키비주얼 목차(목차만 3D)
#   fade = 오른쪽 아래에 두고 위·왼쪽을 흰색으로 날림(예전 모양) / full = 쪽 전체 / card = 여백 둔 둥근 카드 / cut = 아래 띠를 또렷하게 자르고 톤 색 가는 선
STYLE_COMPOSE = {"band": "fade", "tab": "full", "side": "fade", "pill": "card", "line": "cut"}


def bg_kind(style):
    return STYLE_BG.get(str(style or ""), "3d")


def body_kind(style):
    """본문 사진 세트 — 실사 테마는 실사, 그 밖(3D·유리·다크)은 하얀 3D 렌더(유리 세트는 일러스트 분류라 본문 사진 검색에 안 걸린다)"""
    return "photo" if bg_kind(style) == "photo" else "3d"


def portrait_pool(job):
    """세로 제안서용 세로 배경(세로 전용 세트 VP_SETS · 세로 비율 · 사람 장면 제외) — 2026-10-14 사용자가 VP1 108장을 등록했는데
    의미 검색(확신 0.9)과 장 이름 검색이 거의 맞지 않아 표지·간지를 늘 새로 만들었다(11칸 중 0~1칸만 자산)"""
    # 세트마다 따로, 쪽을 넘겨 끝까지 받는다 — 예전엔 '세로제안서' 검색 limit 200 한 번이었는데 목록 API 는 120 까지만 줘서
    # 실사 102 + 3D 71 = 173장 중 일부가 늘 빠졌다(2026-10-16). set= 는 세트 공개 id 를 받는데 id 는 로컬·운영이 달라 /assets/sets 에서 이름으로 찾는다
    ids = {}
    for cat in ("photo", "illust"):
        try:
            d = _api("GET", "/assets/sets?" + urllib.parse.urlencode({"category": cat}))
            ids.update({s["name"]: s["id"] for s in (d.get("data", d) or []) if isinstance(s, dict) and s.get("name") in VP_SETS.values()})
        except Exception as e:
            job.event(f"세로 배경 세트 목록을 못 읽었습니다({cat}): {str(e)[:80]}", "warn")
    rows = []
    for name in VP_SETS.values():
        if name not in ids:
            job.event(f"세로 배경 세트 {name} 이 powerAssets 에 없습니다 — 그 세트 칸은 다른 세트·생성으로", "warn")
            continue
        for page in range(1, 6):
            try:
                d = _api("GET", "/assets/items?" + urllib.parse.urlencode({"set": ids[name], "limit": 120, "page": page}))
            except Exception as e:
                job.event(f"세로 배경 세트 {name} 를 못 읽었습니다: {str(e)[:80]}", "warn")
                break
            got = d.get("data") or []
            rows += got
            if len(got) < 120:
                break
    seen, out = set(), []
    for r in rows:
        if r.get("id") in seen or int(r.get("h") or 0) <= int(r.get("w") or 1) or re.search(PEOPLE, str(r.get("name") or "")):
            continue
        seen.add(r.get("id"))
        out.append(r)
    out.sort(key=lambda r: str(r.get("name") or "") + str(r.get("id")))   # 반 가르기(STYLE_HALF)가 매번 같은 그림 묶음이 되게 — 순서를 고정
    return out


def _sg(r):
    return (r.get("set") or {}).get("name") or r.get("style_group") or ""


def pick_portrait(pool, key, words, used, kind="photo", half=None, topic=""):
    """조건문 — 칸 역할(표지·목차·간지)이 이름에 있는 것만, 그중 테마에 맞는 세트(kind = photo|3d|glass|dark)를 먼저, 장 낱말이 가장 많이 겹치는 것.
    그 세트에 그 역할이 남아 있지 않을 때만 다른 밝은 세트에서. 같은 점수면 목록 순서.
    half = 0|1 이면 그 세트를 반으로 갈라 한쪽만(같은 세트를 쓰는 두 테마가 서로 다른 그림을 뽑게), 그 반이 바닥나면 세트 전체"""
    role = "표지" if key == "cover" else "목차" if key == "toc" else "간지"

    def halved(rs):
        if half is None:
            return rs
        idx = {r["id"]: k for k, r in enumerate([x for x in pool if _sg(x) == VP_SETS[kind]])}
        return [r for r in rs if idx.get(r["id"], 0) % 2 == half] or rs
    if kind in NOROLE_KINDS:   # 다크 세트는 표지 5·간지 16장만 이름에 역할이 있고 유리 세트는 하나도 없다 — 역할이 맞는 것 먼저, 그다음 세트 안 나머지(목차·본문 장면 제외)를 장 낱말로
        mine = halved([r for r in pool if _sg(r) == VP_SETS[kind] and r["id"] not in used])
        cands = [r for r in mine if role in str(r.get("name") or "")] or [r for r in mine if not re.search(r"목차|본문", str(r.get("name") or ""))] or mine
    else:
        cands = [r for r in pool if role in str(r.get("name") or "") and r["id"] not in used and _sg(r) in (VP_SETS["photo"], VP_SETS["3d"])]
        cands = halved([r for r in cands if _sg(r) == VP_SETS[kind]]) or cands
    ctx = " ".join(str(w) for w in words) + " " + str(topic or "")
    cands = [r for r in cands if not offtopic(asset_text(r), ctx)]   # 사업과 동떨어진 범주(식품 그림을 바이오 빅데이터 간지에 등)는 빼고 — 남는 게 없으면 생성으로(R120)
    if not cands:
        return None, None
    # 맞는 그림만 — 일반어(관리·운영·시스템·배경…)를 뺀 장·사업 낱말이 그림 이름·키워드에 하나 이상 있어야 고른다.
    # 예전엔 점수 0 이어도 후보 중 최고점을 골라 사업과 안 맞는 그림이 많이 나왔다(사용자 10-29 "테스트해 보니 안 맞는 게 많이 나와") — 없으면 생성으로
    toks = {t for w in list(words) + [topic] for t in re.findall(r"[가-힣A-Za-z0-9]{2,}", str(w))
            if t not in ("배경", "표지", "목차", "간지") and t not in GENERIC}

    def score(r):
        hay = str(r.get("name") or "") + " " + " ".join(str(k) for k in r.get("keywords") or [])
        ht = [k for k in re.findall(r"[가-힣A-Za-z0-9]{2,}", hay) if k not in GENERIC and k not in ("배경", "표지", "목차", "간지", "세로", "제안서")]
        return sum(1 for t in toks if any(t in k or (len(k) >= 2 and k in t) for k in ht))
    best = max(cands, key=score)
    if score(best) < 1:
        return None, None
    try:
        blob = _api("GET", f"/assets/items/{best['id']}/file/original", raw=True)
    except Exception:
        return None, None
    used.add(best["id"])
    return blob, f"powerAssets 세로 '{best.get('name')}'(낱말 {score(best)})"


ICON_SET = "icon-flat-blue-glass"   # 본문 아이콘 세트 고정(1,117개 — 네이비 톤·유리 배경과 어울림). 세트를 섞으면 장표가 지저분하다


def _small_png(blob, px=256):
    im = Image.open(io.BytesIO(blob)).convert("RGBA")
    im.thumbnail((px, px))
    b = io.BytesIO()
    im.save(b, "PNG")
    return b.getvalue()


def cover_crop(blob, w_cm, h_cm, px_w=1400, ax=0.5, ay=0.4):
    """사진을 칸 비율로 잘라 JPEG(ax·ay = 자를 자리, 0 왼쪽·위 ~ 1 오른쪽·아래) — 원본(5000px 넘는 것)은 줄여 넣는다"""
    im = Image.open(io.BytesIO(blob)).convert("RGB")
    ar = w_cm / h_cm
    if im.width / im.height > ar:
        nw = int(im.height * ar)
        left = int((im.width - nw) * ax)
        im = im.crop((left, 0, left + nw, im.height))
    else:
        nh = int(im.width / ar)
        top = max(0, int((im.height - nh) * ay))
        im = im.crop((0, top, im.width, top + nh))
    im.thumbnail((px_w, px_w))
    b = io.BytesIO()
    im.save(b, "JPEG", quality=86)
    return b.getvalue()


def _pick(category, text, queries, exclude, set_=None):
    body = {"category": category, "text": text[:400], "queries": [q for q in queries if q][:4], "exclude": list(exclude), "limit": 24}
    if set_:
        body["set"] = set_
    d = _api("POST", "/assets/pick", body)
    d = d.get("data", d)
    return d.get("pick"), float(d.get("confidence") or 0)


# 표지·간지 배경(가운데가 비고 하얗게 날아감) — 본문 사진으로 안 쓴다. vp-bg-dark(다크 3D, 2026-10-15)는 흰 바탕 장표에 안 맞고
# 표지·간지 글씨도 짙은 색이라 다크 테마가 생길 때까지 엔진이 쓰지 않는다(VP_SETS 에도 없다 → 세로 배경 후보에서도 빠짐)
PHOTO_SKIP = ("photo-section-keyvisual", "vp-bg-dark")
# 세로 전용 세트의 본문 장면(이름에 표지·목차·간지가 없는 것)은 위쪽이 글 자리로 비어 있다 — 톤에 맞는 세트만 쓰고 아래쪽 장면을 자른다
VP_ROLE = r"표지|목차|간지|맺음말"
PHOTO_PREFER = {"photo-doc-business": 1.0}       # 실사 문서·비즈니스 사진 우선


def photo_pick(text, queries, used, kind="photo", topic=""):
    """본문 사진 — 검색어마다 사진 분류를 검색해 후보를 모으고 조건 점수로 고른다(겹친 검색어 수 + 세트 선호, 배경 세트 제외, 이미 쓴 것 제외).
    세로 전용 세트는 톤에 맞는 쪽(kind)의 본문 장면만 — 실사 톤에 3D 가, 3D 톤에 실사 키비주얼이 섞이지 않게"""
    other = VP_SETS["3d" if kind == "photo" else "photo"]
    score, meta = {}, {}
    slot = f"{text} {' '.join(str(q) for q in queries)}"
    ctx = f"{slot} {topic}"
    for q in queries[:5]:
        try:
            rows = _api("GET", "/assets/items?" + urllib.parse.urlencode({"q": q, "category": "photo", "limit": 30})).get("data") or []
        except Exception:
            continue
        for r in rows:
            sg = ((r.get("set") or {}).get("name") or r.get("style_group") or "")
            if r["id"] in used or sg in PHOTO_SKIP or sg == other or (sg == "photo-keyvisual-climate" and "기후" not in text)                     or (sg in VP_SETS.values() and re.search(VP_ROLE, str(r.get("name") or ""))):
                continue
            at = asset_text(r)
            hit = relevance(at, slot)
            if offtopic(at, ctx) or not hit:   # 동떨어진 범주 · 일반어('현장'·'제작')만 겹친 그림은 넣지 않는다(R120)
                continue
            score[r["id"]] = score.get(r["id"], 0) + 1.0 + 0.5 * len(hit) / max(1, len(queries))
            meta[r["id"]] = sg
    if not score:   # 검색어로 못 찾으면 서버 AI 고르기 — 확신 0.6 이상, 이름이 칸과 관련 있고 동떨어진 범주가 아닐 때만
        body = {"category": "photo", "text": text[:400], "queries": [q for q in queries if q][:4], "exclude": list(used), "limit": 24}
        try:
            d = _api("POST", "/assets/pick", body)
            d = d.get("data", d)
        except Exception:
            return None, 0, ""
        pid, conf = d.get("pick"), float(d.get("confidence") or 0)
        label = asset_text(d.get("picked") or {})
        ok_ = pid and conf >= 0.6 and label and relevance(label, slot) and not offtopic(label, ctx)
        return (pid, conf, "") if ok_ else (None, 0, "")
    best = max(score, key=lambda i: score[i] + PHOTO_PREFER.get(meta[i], 0))
    return best, 1.0, meta[best]


def resolve_assets(job, chapters_pages, kind="photo", topic=""):
    """본문 사진·아이콘을 파워에셋에서 — 사용자 2026-10-14 "파워에셋을 다양하게 검색해서 이미지를 잘 활용".
    사진: AI 가 준 검색어 + 쪽 제목·소제목 낱말로(검색어 최대 4개) 고르고 문서 안 중복 금지. 아이콘: 카드·허브 노드·전략 항목 제목으로, 세트 고정"""
    used, jobs = set(), []
    for pages in chapters_pages.values():
        for pg in pages:
            title = re.sub(r"^\d+(\.\d+)*\s*|\s*\(\d+/\d+\)\s*$", "", str(pg.get("title") or ""))
            for b in pg.get("blocks") or []:
                f = b.get("fig") if isinstance(b.get("fig"), dict) else None
                if not f:
                    continue
                k = b.get("kind")
                if k == "photo":
                    qs = [str(q) for q in f.get("queries") or []] + [str(b.get("head") or ""), title]
                    jobs.append(("photo", f, f"{title} — {b.get('head') or ''} — {f.get('caption') or ''}", list(dict.fromkeys(q.strip() for q in qs if str(q).strip()))))
                elif k == "cards":
                    jobs += [("icon", c, f"{c.get('title')} — {' / '.join(_items(c.get('items'), 2))}", [str(c.get("title") or "")]) for c in (f.get("cards") or [])[:4]]
                elif k == "hub":
                    jobs += [("icon", n, f"{n.get('title')} — {' / '.join(_items(n.get('items'), 2))}", [str(n.get("title") or "")]) for n in (f.get("nodes") or [])[:6]]
                elif k == "strategy":
                    jobs += [("icon", it, f"{it.get('title')} — {it.get('desc') or ''}", [str(it.get("title") or "")]) for it in (f.get("items") or [])[:5]]
    if not jobs:
        return {}
    got = {"photo": 0, "icon": 0, "miss": 0, "skipped": []}

    def one(j):
        kind, target, text, qs = j
        try:
            if kind == "photo":
                pid, conf, sg = photo_pick(text, qs, used, kind, topic)
                if pid:
                    if sg == "photo-hero-keyvisual":   # 왼쪽·위가 글 자리로 하얗게 날아간 그림 — 장면이 있는 오른쪽 아래만
                        target["_ax"], target["_ay"] = 0.9, 0.75
                    elif sg in VP_SETS.values():   # 세로 전용 — 위쪽이 글 자리, 장면은 아래 가운데
                        target["_ax"], target["_ay"] = 0.5, 0.8
                    used.add(pid)   # 같은 사진 두 번 금지(병렬이라 아주 드물게 겹칠 수 있다 — 아래에서 한 번 더 거른다)
                    target["_img"] = _api("GET", f"/assets/items/{pid}/file/original", raw=True)
                    target["_id"] = pid
                    got["photo"] += 1
                    return
                got["skipped"].append(text)   # 관련 있는 사진이 없다 — 빈 사진 자리 + 확인 목록(R120)
                target["_need_photo"] = True
            else:
                pid, conf = _pick("icon", text, qs, (), ICON_SET)
                if pid:
                    target["_icon"] = _small_png(_api("GET", f"/assets/items/{pid}/file/thumb", raw=True))
                    got["icon"] += 1
                    return
        except Exception:
            pass
        got["miss"] += 1

    with ThreadPoolExecutor(max_workers=6) as ex:
        for j in [j for j in jobs if j[0] == "photo"]:   # 사진은 순서대로 — 앞에서 쓴 사진을 뒤에서 제외해야 겹치지 않는다
            one(j)
        list(ex.map(_carry(one), [j for j in jobs if j[0] == "icon"]))
    seen = set()
    for kind, target, _, _ in jobs:   # 같은 사진이 두 쪽에 붙었으면 뒤엣것은 자리 상자로
        if kind == "photo" and target.get("_id"):
            if target["_id"] in seen:
                target.pop("_img", None)
            seen.add(target["_id"])
    return got


# 표지·목차·간지 배경 — 고른 테마(스타일)의 화풍으로, 그 장의 제안 내용에 맞게 나노바나나가 새로 그린다(사용자 10-29 "테마 스타일 선택하면
# 그런 스타일로 제안 내용에 맞게 배경이 만들어져야 함"). 화풍 문장은 사용자 배경 프롬프트 모음(docs/발표장표_배경이미지_프롬프트_모음.md)에서:
#   3d(클래식 밴드) = §2-5 VP2 세로 3D · glass(인덱스 탭·플로팅 필) = §2-1·2-3 라이트 아크릴(유리는 사용자가 덜 좋아해 아크릴로) ·
#   photo(사이드 레일·미니멀 라인) = §1-2 FS1 밝은 하이키 실사 · dark(다크 키비주얼) = §2-8 VP3 풀컬러 다크 SF
BG_LOOK = {
    "3d": "Premium 3D RENDER illustration (not a photo), high-end polished tech key visual (octane / C4D look). Soft studio lighting, smooth gradients, gentle glow, "
          "floating holographic data cards and thin light lines used tastefully, a subtle light grid floor. Materials: matte white, soft frosted surfaces, glowing light; "
          "avoid clear glass and crystal objects. Palette: very light and airy, white and pale sky blue with cobalt blue and light cyan glow accents and a tiny warm peach highlight, "
          "no dark tones, no purple. The subject itself has clear vivid cobalt blue and cyan glowing accents so it reads well against the white background.",
    "glass": "Clean premium light-theme 3D ISOMETRIC illustration. Background is a very light cool gray to white surface (#F3F5FA to #FFFFFF) with soft large rounded panels and thin pale-blue "
             "line grooves on the floor, gentle isometric 3/4 top view. Objects are thick blue-tinted ACRYLIC (polished, slightly frosted plates and blocks with crisp bright edges, like cut plexiglass) "
             "with glossy white plastic and solid cobalt blue parts (#1F4FE0, #3B82F6, sky blue #8DB8FF), clean rounded bevels — not thin glass, not liquid, not crystal. "
             "Thin blue connecting cables and tiny orange accent dots (#FF7A30) are allowed. No glass spheres, marbles or floating orbs. Soft diffused studio light, very subtle contact shading, airy and minimal. "
             "Platforms have plain blank edges with no engraved words or numbers.",
    "photo": "Bright PHOTOREALISTIC key visual, ultra detailed, sharp, premium advertising photography. A BRIGHT, LIGHT, HIGH-KEY image: bright daylight, soft white and pale sky-blue overall tone, "
             "airy and clean like a premium corporate advertisement, accents in fresh cobalt blue and light cyan glow, a touch of soft warm sunlight. Never dark, never night, no heavy shadows, no dim interiors. "
             "Glowing data lines and particles only tastefully. The scene is clearly in South Korea (Seoul, Pangyo, Yeouido, Korean offices, labs and field sites); any people are Korean, few, "
             "seen from behind or at a distance. Devices show their screen only toward their user, no brand logos on devices. Vary the setting; do not default to a window city view.",
    "dark": "Premium full-color sci-fi technology key visual: a rich background filling the whole frame, deep navy to cobalt blue gradient with luminous cyan and electric blue glow, "
            "volumetric light rays, fine particles, glowing data lines, a subtle perspective light grid floor, digital bokeh. Cinematic, high-end CG render quality, crisp and vivid. "
            "Avoid clear glass objects as the main subject. No people faces; if a figure appears it is a tiny silhouette seen from behind.",
}
# 쪽마다 그림이 놓이는 자리 — 글(제목·목록)은 위·왼쪽에 얹힌다. 깔기(STYLE_COMPOSE)가 오른쪽 아래·아래 띠를 쓴다
BG_PLACE = {
    "3d": "LAYOUT: the 3D subject group is compact and sits in the LOWER-RIGHT part of the frame (bottom 45%, right 65%), not filling the whole frame. The whole upper half and the left side are very bright, almost pure white, empty space that fades smoothly into white.",
    "glass": "LAYOUT: the object group sits in the LOWER part of the frame (bottom 50%), slightly right of center. The upper half stays calm, almost empty light-gray/white surface with only faint panel lines; toward the left the floor lines fade out into soft white.",
    "photo": "LAYOUT: one single continuous scene; the main subject and dense detail are in the LOWER part of the frame (bottom 50%), slightly to the right. The upper half is calm, bright and low in detail (open sky, soft white haze or a bright out-of-focus area), blending smoothly with no hard edge.",
    "dark": "LAYOUT: the glowing main object group is compact and sits in the LOWER part of the frame (bottom 45%), centered or slightly right. The upper half stays a calm, smooth deep-blue gradient with only very faint particles.",
}


def bg_subject(o, key, chapter=None):
    """배경 그림의 주제 — 제안 내용에서(사업 분야·장 이름·절 이름·장 상징 사물). 영어 지시 속에 한국어 이름은 '뜻'으로만 준다(그림에 쓰지 않게)"""
    field = str(o.get("field") or "")
    proj = str((o.get("project") or {}).get("name") or "")
    if key == "cover":
        names = " / ".join(str(c.get("title") or "") for c in (o.get("chapters") or [])[:6])
        return (f"the field of this proposal — {field or proj}. The project (meaning only, never write it): '{proj}'. "
                f"Show the project's own field, place or core equipment as one strong key visual that sums up the proposal (chapters: {names}).")
    if key == "toc":
        return (f"a wide, calm view of the PLACE or the EQUIPMENT of this project's field ({field or proj}) — no people in the foreground. "
                "A quieter picture than the cover, different subject from the cover.")
    c = chapter or {}
    secs = " / ".join(str(s.get("title") or "") for s in (c.get("sections") or [])[:6])
    return (f"what this chapter of the proposal is about (meaning only, never write it): chapter '{c.get('title') or ''}' — sections: {secs}. "
            f"Field of the project: {field or proj}. Symbolic object of the chapter: {c.get('art') or 'one fitting object'}. "
            "Show ONE clear object group or scene that a reader immediately links to this chapter's content — different from the other chapters.")


def make_bg(job, art, field, kind="3d", subject=""):
    look = BG_LOOK.get(kind) or BG_LOOK["3d"]
    prompt = ("VERTICAL 9:16 portrait background picture for a page of a Korean public-sector technical proposal document (A4 vertical pages). "
              + look + "\n" + BG_PLACE.get(kind, BG_PLACE["3d"]) + "\n"
              + f"SUBJECT: {subject or art}. Theme of the project: {field}.\n"
              + "Nothing extends past the left or top edges." + design.BG_COMMON)
    nb2 = str(design.W["CFG"].get("nb2_model") or design.styles.nb2_model())
    return design.gen_image(job, prompt, [], "9:16", None, model=nb2, plain=True)   # 세로 쪽 — 예전 4:3 은 위아래를 많이 잘라 냈다


def _ss(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def compose(blob, wf=1.0, hf=0.55, alpha=0.75, fx=0.7, fy=0.6, anchor=0.85):
    """우측 하단에 그림을 두고 왼쪽·위쪽으로 갈수록 흰색으로 날린다(numpy 없이 PIL 만)."""
    src = Image.open(io.BytesIO(blob)).convert("RGB")
    w, h = int(PW * wf), int(PH * hf)
    ar = w / h
    if src.width / src.height >= ar:
        cw = int(src.height * ar)
        x0 = int((src.width - cw) * anchor)
        crop = src.crop((x0, 0, x0 + cw, src.height))
    else:
        ch = int(src.width / ar)
        crop = src.crop((0, src.height - ch, src.width, src.height))
    crop = crop.resize((w, h), Image.LANCZOS)
    mx = Image.new("L", (w, 1))
    mx.putdata([int(255 * _ss(x / (w * fx))) for x in range(w)])
    my = Image.new("L", (1, h))
    my.putdata([int(255 * alpha * _ss(y / (h * fy))) for y in range(h)])
    from PIL import ImageChops
    mask = ImageChops.multiply(mx.resize((w, h)), my.resize((w, h)))
    page = Image.new("RGB", (PW, PH), (255, 255, 255))
    page.paste(crop, (PW - w, PH - h), mask)
    b = io.BytesIO()
    page.save(b, "JPEG", quality=88)
    return b.getvalue()


def full_bg(blob=None):
    """다크 키비주얼 전면 배경 — 쪽 비율로 가운데를 자르고(9:16 → 쪽 비율, 위아래 고르게), 위쪽 글 자리에 짙은 막을 얹는다
    (간지 목록·표지 제목이 빛나는 물체와 겹쳐도 읽히게 — 58% 높이에서 0). blob 이 없으면 짙은 남색 그라데이션만(배경을 못 구했을 때)"""
    if blob is None:
        crop = Image.new("RGB", (1, 2))
        crop.putdata([(10, 26, 58), (19, 48, 107)])
        crop = crop.resize((PW, PH), Image.BILINEAR)
    else:
        src = Image.open(io.BytesIO(blob)).convert("RGB")
        ar = PW / PH
        if src.width / src.height >= ar:
            cw = int(src.height * ar)
            x0 = (src.width - cw) // 2
            crop = src.crop((x0, 0, x0 + cw, src.height))
        else:
            ch = int(src.width / ar)
            y0 = (src.height - ch) // 2
            crop = src.crop((0, y0, src.width, y0 + ch))
        crop = crop.resize((PW, PH), Image.LANCZOS)
        veil = Image.new("RGB", (PW, PH), (6, 12, 32))
        m = Image.new("L", (1, PH))
        m.putdata([int(255 * 0.6 * max(0.0, 1 - y / (PH * 0.58)) ** 1.4) for y in range(PH)])
        crop = Image.composite(veil, crop, m.resize((PW, PH)))
    b = io.BytesIO()
    crop.save(b, "JPEG", quality=88)
    return b.getvalue()


def _glow_strip(blob, w_px, h_px, cy=0.62, veil=0.3):
    """다크 키비주얼에서 빛나는 물체가 있는 가로 띠를 잘라 온다(cy = 원본 높이에서 띠 가운데). 흰 글씨가 읽히게 veil 만큼 짙은 막"""
    if blob is None:
        im = Image.new("RGB", (2, 1))
        im.putdata([(10, 26, 58), (24, 60, 130)])
        return im.resize((w_px, h_px), Image.BILINEAR)
    src = Image.open(io.BytesIO(blob)).convert("RGB")
    ch = min(src.height, int(src.width * h_px / w_px))
    y0 = max(0, min(src.height - ch, int(src.height * cy - ch / 2)))
    im = src.crop((0, y0, src.width, y0 + ch)).resize((w_px, h_px), Image.LANCZOS)
    return Image.blend(im, Image.new("RGB", im.size, (6, 12, 32)), veil) if veil else im


def band_bg(blob, accent="2F5BD3", h_cm=5.2):
    """다크 키비주얼 띠 간지 배경 — 흰 쪽 위쪽 h_cm(머리 사업명·장 태그 자리)만 표지 분위기(빛나는 물체 가로 띠).
    아래 끝은 또렷하게 자른 곡선(왼쪽 h_cm → 오른쪽 + 0.9cm 로 휘어 내려감)과 그 아래 톤 색 가는 곡선으로 마무리한다
    (사용자 2026-10-15 "흐지부지 그라데이션으로 끝나는 건 싫다, 마감은 딱 잘려야 하고 곡선 같은 디자인으로 마무리").
    3배로 그려 줄여 곡선 경계를 매끈하게(계단 없음)"""
    from PIL import ImageDraw
    S = 3
    bh, amp = PH * h_cm / PAGE_H, PH * 0.9 / PAGE_H
    th, gap = PH * 0.07 / PAGE_H, PH * 0.22 / PAGE_H
    H = int(bh + amp + gap + th * 2 + 4)
    strip = _glow_strip(blob, PW, H, 0.6, 0.35)
    edge = lambda x, off=0.0: (bh + amp * (0.5 - 0.5 * math.cos(math.pi * x / PW)) + off) * S   # 왼쪽 bh → 오른쪽 bh+amp
    xs = [PW * k / 120 for k in range(121)]
    mask = Image.new("L", (PW * S, H * S), 0)
    ImageDraw.Draw(mask).polygon([(0, 0), (PW * S, 0)] + [(x * S, edge(x)) for x in reversed(xs)], fill=255)
    mask = mask.resize((PW, H), Image.LANCZOS)
    page = Image.new("RGB", (PW, PH), (255, 255, 255))
    page.paste(strip, (0, 0), mask)
    line = Image.new("L", (PW * S, H * S), 0)
    ImageDraw.Draw(line).line([(x * S, edge(x, gap)) for x in xs], fill=255, width=max(1, int(th * S)))
    rgb = tuple(int(accent[i:i + 2], 16) for i in (0, 2, 4))
    page.paste(Image.new("RGB", (PW, H), rgb), (0, 0), line.resize((PW, H), Image.LANCZOS))
    b = io.BytesIO()
    page.save(b, "JPEG", quality=90)
    return b.getvalue()


def _crop_to(src, w, h, fy=0.5):
    """src 를 w:h 비율로 자른다 — 가로가 남으면 가운데, 세로가 남으면 fy(0 위 ~ 1 아래) 쪽을 남긴다"""
    ar = w / h
    if src.width / src.height >= ar:
        cw = int(src.height * ar)
        x0 = (src.width - cw) // 2
        return src.crop((x0, 0, x0 + cw, src.height)).resize((w, h), Image.LANCZOS)
    ch = int(src.width / ar)
    y0 = int((src.height - ch) * fy)
    return src.crop((0, y0, src.width, y0 + ch)).resize((w, h), Image.LANCZOS)


def _jpg(im, q=88):
    b = io.BytesIO()
    im.save(b, "JPEG", quality=q)
    return b.getvalue()


def full_light(blob, fy=0.0):
    """밝은 전면 배경(인덱스 탭 — 유리 아이소메트릭) — 위쪽이 비어 있는 그림이라 막 없이 쪽 전체에.
    fy = 자를 때 남길 쪽(0 = 원본 위쪽) — 장면(원본 40~90% 높이)이 쪽 아래로 내려가 위쪽 표지 제목·간지 장 목록과 겹치지 않게"""
    return _jpg(_crop_to(Image.open(io.BytesIO(blob)).convert("RGB"), PW, PH, fy))


DIV_LIST_PITCH = 1.2   # 간지 절 목록 한 줄(cm) — 16pt·줄 간격 155%, LibreOffice 렌더 실측 1.19cm(10-28 캡처)
BG_MIN_CM = 7.0        # 목록을 피해 그림을 내릴 때 남길 최소 그림 높이(cm) — 이보다 낮아지면 내리지 않고 흰 그라데이션으로 가린다
BG_GAP_CM = 0.8        # 글 끝과 그림 시작 사이


def _veil_rows(h, top_px, bottom_px, fade_px, alpha=1.0):
    """세로 막(L 모드 1×h) — top_px~bottom_px 는 alpha(흰색), 그 아래 fade_px 동안 0 으로(위로 갈수록 흰색)"""
    m = Image.new("L", (1, h))
    vals = []
    for y in range(h):
        if top_px <= y <= bottom_px:
            a = alpha
        elif bottom_px < y < bottom_px + fade_px:
            a = alpha * (1 - _ss((y - bottom_px) / max(1, fade_px)))
        else:
            a = 0.0
        vals.append(int(255 * a))
    m.putdata(vals)
    return m


def text_veil(blob, bottom_cm, fade_cm=3.0, alpha=1.0):
    """목차·간지 배경 — 글이 있는 높이(위 ~ bottom_cm)까지는 흰색으로 가리고, 그 아래 fade_cm 동안 그림이 서서히 드러난다.
    글과 배경 그림이 겹쳐 글이 묻히던 것(10-28 사용자: 간지 목록 4~6번이 유리 카드 그림 위, 목차 쪽도 배경과 겹침, R107)"""
    im = Image.open(io.BytesIO(blob)).convert("RGB")
    w, h = im.size
    b = int(h * min(PAGE_H, max(0.0, bottom_cm)) / PAGE_H)
    m = _veil_rows(h, 0, b, int(h * fade_cm / PAGE_H), alpha)
    return _jpg(Image.composite(Image.new("RGB", (w, h), (255, 255, 255)), im, m.resize((w, h))))


def _below_text(top, text_bottom, bottom_margin_cm):
    """그림 시작 높이(쪽 비율)를 글 아래로 — (새 top, 그림 안에서 가릴 높이 cm 또는 None).
    글 끝 + 틈이 그림 최소 높이를 침범하면 더 내리지 않고, 겹치는 만큼만 흰 그라데이션으로 가린다"""
    if text_bottom is None:
        return top, None
    want = text_bottom + BG_GAP_CM
    limit = PAGE_H - bottom_margin_cm - BG_MIN_CM
    top_cm = max(top * PAGE_H, min(want, limit))
    return top_cm / PAGE_H, (text_bottom - top_cm if text_bottom + 0.3 > top_cm else None)


def card_bg(blob, top=0.45, accent="2F5BD3", text_bottom=None):
    """떠 있는 둥근 카드(플로팅 필) — 흰 쪽 아래쪽에 좌우 여백을 둔 둥근 모서리 카드로 그림을 넣고 옅은 그림자.
    카드 경계는 또렷하게(흐린 페이드 금지 — 사용자 2026-10-15), 3배로 그려 줄여 모서리를 매끈하게.
    text_bottom(cm) = 그 쪽 글이 끝나는 높이 — 카드를 글 아래로 내리고, 못 내리면 카드 안 그림만 흰 그라데이션(테두리는 또렷하게, R107)"""
    from PIL import ImageDraw, ImageFilter
    top, veil_cm = _below_text(top, text_bottom, 1.6)
    S, mx, mb = 3, PW * 1.2 / PAGE_W, PH * 1.6 / PAGE_H
    x0, y0, x1, y1 = int(mx), int(PH * top), int(PW - mx), int(PH - mb)
    rad = int(PW * 0.7 / PAGE_W)
    page = Image.new("RGB", (PW, PH), (255, 255, 255))
    sh = Image.new("L", (PW, PH), 0)
    ImageDraw.Draw(sh).rounded_rectangle((x0 + 6, y0 + 14, x1 + 6, y1 + 14), rad, fill=46)
    page.paste(Image.new("RGB", (PW, PH), (30, 50, 90)), (0, 0), sh.filter(ImageFilter.GaussianBlur(18)))
    m = Image.new("L", ((x1 - x0) * S, (y1 - y0) * S), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, (x1 - x0) * S - 1, (y1 - y0) * S - 1), rad * S, fill=255)
    pic = _crop_to(Image.open(io.BytesIO(blob)).convert("RGB"), x1 - x0, y1 - y0, 0.8)
    if veil_cm is not None:   # 카드 안 그림의 위쪽(글과 겹치는 높이까지)을 흰색으로 — 아래로 3cm 동안 드러난다
        ph_ = y1 - y0
        vm = _veil_rows(ph_, 0, int(PH * max(0.0, veil_cm + 0.3) / PAGE_H), int(PH * 3.0 / PAGE_H), 0.94)
        pic = Image.composite(Image.new("RGB", pic.size, (255, 255, 255)), pic, vm.resize(pic.size))
    page.paste(pic, (x0, y0), m.resize((x1 - x0, y1 - y0), Image.LANCZOS))
    line = Image.new("L", ((x1 - x0) * S, (y1 - y0) * S), 0)
    ImageDraw.Draw(line).rounded_rectangle((0, 0, (x1 - x0) * S - 1, (y1 - y0) * S - 1), rad * S, outline=255, width=3 * S)
    rgb = tuple(int(accent[i:i + 2], 16) for i in (0, 2, 4))
    page.paste(Image.new("RGB", (x1 - x0, y1 - y0), _mix_rgb(rgb, (255, 255, 255), 0.55)), (x0, y0), line.resize((x1 - x0, y1 - y0), Image.LANCZOS))
    return _jpg(page)


def cut_bg(blob, top=0.5, accent="2F5BD3", text_bottom=None):
    """아래 띠(미니멀 라인) — 쪽 아래쪽을 가로 직선으로 또렷하게 잘라 그림을 채우고, 경계 위에 톤 색 굵은 줄(위쪽 굵은 줄과 짝).
    text_bottom(cm) = 글 끝 — 자르는 선을 글 아래로 내리고, 못 내리면 그림 위쪽만 흰 그라데이션(R107)"""
    top, veil_cm = _below_text(top, text_bottom, 0.0)
    y0 = int(PH * top)
    page = Image.new("RGB", (PW, PH), (255, 255, 255))
    pic = _crop_to(Image.open(io.BytesIO(blob)).convert("RGB"), PW, PH - y0, 0.8)
    if veil_cm is not None:
        vm = _veil_rows(PH - y0, 0, int(PH * max(0.0, veil_cm + 0.3) / PAGE_H), int(PH * 3.0 / PAGE_H), 0.94)
        pic = Image.composite(Image.new("RGB", pic.size, (255, 255, 255)), pic, vm.resize(pic.size))
    page.paste(pic, (0, y0))
    th = max(2, int(PH * 0.12 / PAGE_H))
    page.paste(Image.new("RGB", (PW, th), tuple(int(accent[i:i + 2], 16) for i in (0, 2, 4))), (0, y0 - th))
    return _jpg(page)


def _mix_rgb(a, b, t):
    return tuple(int(a[k] * (1 - t) + b[k] * t) for k in range(3))


BG_TRANSPARENCY = 0.65   # 목차·간지 배경 그림 투명도(PowerPoint 기준 — 그림 35% + 흰 바탕 65%, 사용자 10-29)


def faded(blob, t=BG_TRANSPARENCY):
    """배경 그림을 투명도 t 로 — 흰 바탕과 섞는다(그림이 원래 진하기의 1-t 만 남는다). 글이 그림 위에서도 읽히게"""
    if not blob or t <= 0:
        return blob
    im = Image.open(io.BytesIO(blob)).convert("RGB")
    out = Image.blend(Image.new("RGB", im.size, (255, 255, 255)), im, 1 - t)
    b = io.BytesIO()
    out.save(b, "JPEG", quality=90)
    return b.getvalue()


def style_bg(blob, style, role, accent, text_bottom=None):
    """표지(role=cover)·간지(div) 배경을 테마 모양대로 — STYLE_COMPOSE. 다크(split)는 따로(full_bg·band_bg).
    text_bottom(cm) = 그 쪽 글(간지 절 목록)이 끝나는 높이 — 그림이 글을 덮지 않게 내리거나 흰 그라데이션으로 가린다(R107)"""
    how = STYLE_COMPOSE.get(style, "fade")
    if how == "full":
        im = full_light(blob, 0.0)
        return text_veil(im, text_bottom) if text_bottom is not None else im
    if how == "card":
        return card_bg(blob, 0.45 if role == "cover" else 0.52, accent, text_bottom)
    if how == "cut":
        return cut_bg(blob, 0.55 if role == "cover" else 0.56, accent, text_bottom)
    im = compose(blob, 1.0, 0.68, 0.82, 0.6, 0.55) if role == "cover" else compose(blob, 1.0, 0.5, 0.72, 0.8, 0.6)
    return text_veil(im, text_bottom) if text_bottom is not None else im


def fill_image(owner, el, im):
    """도형(el)의 채움을 그림으로 — 마스터·쪽 어디든(owner 의 그림 부품으로 넣는다)"""
    b = io.BytesIO()
    im.save(b, "JPEG", quality=88)
    _, rid = owner.part.get_or_add_image_part(io.BytesIO(b.getvalue()))
    sp = el.find("p:spPr", NS)
    for f in list(sp):
        if f.tag.split("}")[1] in ("solidFill", "gradFill", "noFill", "blipFill", "pattFill"):
            sp.remove(f)
    geom = sp.find("a:prstGeom", NS)
    blip = parse_xml(f'<a:blipFill xmlns:a="{A}" xmlns:r="{R}" rotWithShape="1"><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>')
    geom.addnext(blip) if geom is not None else sp.append(blip)


def backgrounds(job, o, style="band"):
    """표지·목차·간지(장마다) 배경. 같은 그림을 두 번 쓰지 않는다. 세트·화풍은 테마(style)가 정한다 — STYLE_BG·STYLE_HALF·BG_LOOK.
    ① powerAssets 세로 전용 세트 ② powerAssets 의미 검색 ③ 맞는 게 없으면 나노바나나가 그 테마 화풍으로 제안 내용(bg_subject)에 맞게 생성"""
    kind, half = bg_kind(style), STYLE_HALF.get(style)
    used, out, log = set(), {}, []
    field = str(o.get("field") or o["project"]["name"])
    topic = f"{o['project'].get('name', '')} {o.get('field') or ''}"   # 사업 주제 — 그림 범주 검사(R120)
    slots = [("cover", f"{o['project']['name']} 표지 배경", ["표지 배경"] + [o["project"]["name"][:10]], "one key object of the project's field"),
             ("toc", "목차 배경", ["목차 배경", "목차"], "a row of shelves or bars rising step by step")]
    slots += [(f"div{i}", f"{c['title']} 간지 배경", list(c.get("keywords") or [c["title"]]), str(c.get("art") or "a small glass object"))
              for i, c in enumerate(o["chapters"])]

    n_slot, n_done = max(1, len(slots)), [0]

    def step():   # 배경 칸 하나 끝 — 40→68%(본문 뒤 단계에서 멈춘 듯 보이지 않게, R107)
        n_done[0] += 1
        job.push("시안 생성", 40 + int(28 * min(1.0, n_done[0] / n_slot)))

    pool = portrait_pool(job)
    gen = []
    for key, text, kws, art in slots:   # ① 테마 세트에서 고르기(순서대로, 같은 그림 두 번 금지) — 사용자 10-29 "파워에셋에서 골라서 맞는 게 없을 때 만들어야 함"
        k_ = "3d" if kind == "dark" and key == "toc" else kind   # 목차는 흰 바탕 쪽 — 다크 배경은 표지·간지만
        blob, src = pick_portrait(pool, key, [text] + kws, used, k_, 1 if k_ != kind else half, topic)   # 세로 배경(역할·장 낱말 조건) → 의미 검색
        if blob is None:
            blob, src = find_bg(job, text, kws, used, key, topic)
        if blob is None:
            gen.append((key, art))
        else:
            out[key] = blob
            log.append(f"{key}: {src}")
            step()
    # ② 맞는 그림이 없는 칸만 — 그 테마 화풍(BG_LOOK, 사용자 배경 프롬프트 모음)으로 그 장의 제안 내용(bg_subject)에 맞게 새로 그린다
    chs = {f"div{i}": c for i, c in enumerate(o["chapters"])}
    with ThreadPoolExecutor(max_workers=max(1, int(design.W["CFG"].get("image_parallel", 3)))) as ex:
        futs = {ex.submit(_carry(make_bg), job, art, field, "3d" if kind == "dark" and key == "toc" else kind,
                          bg_subject(o, key, chs.get(key))): key for key, art in gen}
        for f in futs:
            try:
                out[futs[f]] = f.result()
                log.append(f"{futs[f]}: 나노바나나 생성({'3d' if kind == 'dark' and futs[f] == 'toc' else kind} 화풍)")
            except (design.Cancelled, design.Budget):
                raise
            except Exception as e:
                log.append(f"{futs[f]}: 생성 실패(기본 배경 유지) {str(e)[:60]}")
            step()
    return out, log


# ───────────────────────── 디자인 = 스타일(모양) × 톤(색) — 레퍼런스 design/ppt contents sample
#   스타일은 머리 영역·목차 머리·간지 구성이 서로 다르고(색과 무관), 톤은 색만 정한다(사용자 2026-10-14: "테마를 색상으로 나누면 안 된다").
STYLES = {
    "band":  {"label": "클래식 밴드", "desc": "꽉 찬 머리 띠 + 흰 글씨, 간지는 가운데 태그"},
    "tab":   {"label": "인덱스 탭", "desc": "왼쪽 탭 머리 + 밑선, 간지는 왼쪽 정렬"},
    "side":  {"label": "사이드 레일", "desc": "왼쪽 세로 레일에 장 번호·장 이름, 간지는 굵은 레일 + 큰 번호"},
    "split": {"label": "다크 키비주얼", "desc": "표지는 파워에셋 다크 3D 전면 배경 + 흰 글씨, 간지는 흰 바탕 + 위쪽 다크 띠, 본문 머리 짙은 칸에 같은 빛 띠"},
    "pill":  {"label": "플로팅 필", "desc": "여백 둔 둥근 머리 띠, 간지는 둥근 태그"},
    "line":  {"label": "미니멀 라인", "desc": "위쪽 굵은 줄 + 진한 글씨, 간지는 큰 장 번호 + 가는 선"},
}
#   톤 — dark = 진한 면·제목, mid = 경로·강조, light = 연한 면, head = 머리 색(2개면 그라데이션), badge/badge_text = 장 번호 배지,
#   proj = 진한 머리 위 사업명 글자, accent = 추천 강조색
TONES = {
    "navy":  {"label": "네이비", "dark": "0B2A6F", "mid": "2F5BD3", "light": "DCE5F7", "head": ["0B2A6F"], "badge": "FFFFFF", "badge_text": "0B2A6F", "proj": "C8D3EE", "accent": "#2F5BD3"},
    "blue":  {"label": "블루", "dark": "1537C4", "mid": "3D7BFF", "light": "DCE7FF", "head": ["1537C4", "4A86FF"], "badge": "FFFFFF", "badge_text": "1537C4", "proj": "DCE6FF", "accent": "#3D7BFF"},
    "deep":  {"label": "딥 네이비", "dark": "0A1840", "mid": "1E4FD8", "light": "D8E1F5", "head": ["07133A", "123A8C"], "badge": "22D3EE", "badge_text": "07133A", "proj": "9FB3DB", "accent": "#22B8D8"},
    "teal":  {"label": "틸", "dark": "0B5F69", "mid": "0FA3A3", "light": "D6F1EF", "head": ["0B5F69", "129C9F"], "badge": "FFFFFF", "badge_text": "0B5F69", "proj": "CFEFEE", "accent": "#0FA3A3"},
    "gray":  {"label": "차콜", "dark": "2B2F36", "mid": "2F6BFF", "light": "E3E6EB", "head": ["2B2F36"], "badge": "2F6BFF", "badge_text": "FFFFFF", "proj": "B9BEC7", "accent": "#2F6BFF"},
    "glass": {"label": "글래스 블루", "dark": "2A3F9D", "mid": "5B7CFA", "light": "E1E7FF", "head": ["3B5BDB", "7B97FF"], "badge": "FFFFFF", "badge_text": "3B5BDB", "proj": "E5EBFF", "accent": "#5B7CFA"},
}
THEMES = TONES   # 옛 이름(vtheme) 호환


def _mix(a, b, t):
    """hex a 에 b 를 t 만큼 섞는다"""
    a, b = int(a, 16), int(b, 16)
    return "".join(f"{round(((a >> k) & 255) * (1 - t) + ((b >> k) & 255) * t):02X}" for k in (16, 8, 0))


# 색 계층(사용자 2026-10-14 "톤이 부담스럽다 — 상단 머리만 강조, 나머지는 같은 톤에서 차분하게, 글자는 차분한 검정, 강조만 파랑"):
#   head = 본문·목차 맨 위 머리 띠(강조 허용) · point = 강조 어구·쪽 제목 번호·연도·작은 태그 · calm/calm2 = 띠 문구·표 머리·큰 색 면(톤 기운만 남긴 슬레이트)
#   soft = 연한 면 · 글자는 톤과 무관하게 INK(아주 약간 회색 쪽 검정), 보조 글자는 SUB
INK, SUB = "303338", "6F7681"
for _t in TONES.values():
    _t["point"] = _t["mid"]
    _t["calm"] = _mix(_t["dark"], "3A3F47", 0.62)
    _t["calm2"] = _mix(_t["mid"], "8A909B", 0.62)
    _t["soft"] = _mix(_t["light"], "EEF0F3", 0.55)
    _t["tbl"] = _mix(_t["calm"], "FFFFFF", 0.22)   # 표 머리·표 선 = 띠 문구(calm)보다 두 톤 밝게(사용자 2026-10-22)
TBL_LINE_EMU = 6350   # 표 선 0.5pt — 옛 기본 선(약 1pt)의 절반(사용자 2026-10-22 "테이블 라인이 너무 두껍다")
TEXT_POINT = {"0A41AE", "FF3370"}   # 기본 양식에서 강조로 쓰인 글자 색(표지 연도·문서 종류). 도입 문단 강조는 put_lead 가 따로 칠한다
#   (09106D 는 소제목과 도입 강조가 같이 쓰던 색이라 포인트로 두면 소제목까지 파랗게 된다 — 사용자 2026-10-14 지적)
SHAPE_POINT = {"3975ED"}                      # 작은 강조 도형(소제목 앞 육각형)
_TXT = {f"{{{A}}}rPr", f"{{{A}}}endParaRPr", f"{{{A}}}defRPr"}
# 기본 양식에 쓰인 색 → 역할(톤마다 바꿀 색). 회색·검정·안내선 주황은 그대로
ROLE = {**{c: "dark" for c in ("1D1D49", "002060", "09106D", "070C51", "0B2A6F", "223A90", "203890", "233C8D", "2C4D90", "142D7E", "324B9C", "213553", "0C1C96")},
        **{c: "mid" for c in ("0056A4", "0A41AE", "207FE8", "3975ED", "437CD9", "6B89CD", "3082DC", "5574C4", "FF3370")},
        **{c: "light" for c in ("BFD2F9",)}}
PAGE_W, PAGE_H = 19.05, 27.52
BODY_G, BODY_T = 2.04, 2.54   # 본문 세로 기준선 — G: 경로·제목·도입·띠·아이콘·막대 왼쪽 / T: 블록 안 글 시작


def _fill(colors, ang=0):
    if len(colors) == 1:
        return f'<a:solidFill><a:srgbClr val="{colors[0]}"/></a:solidFill>'
    return (f'<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="{colors[0]}"/></a:gs><a:gs pos="100000"><a:srgbClr val="{colors[1]}"/></a:gs>'
            f'</a:gsLst><a:lin ang="{ang}" scaled="0"/></a:gradFill>')


def _shape(tree, name, x, y, w, h, colors, geom="rect", adj=None, text=None, sz=1200, col="FFFFFF", face="G마켓 산스 TTF Bold", algn="l", ang=0, rot=0):
    ids = [int(e.get("id")) for e in tree.iter(f"{{{P}}}cNvPr")] or [1]
    av = f'<a:gd name="adj" fmla="val {adj}"/>' if adj is not None else ""
    t = (f'<a:p><a:pPr algn="{algn}"/><a:r><a:rPr lang="ko-KR" sz="{sz}"><a:solidFill><a:srgbClr val="{col}"/></a:solidFill><a:latin typeface="{face}"/><a:ea typeface="{face}"/></a:rPr><a:t>{text}</a:t></a:r></a:p>'
         if text else '<a:p><a:endParaRPr lang="ko-KR"/></a:p>')
    tree.append(parse_xml(
        f'<p:sp xmlns:p="{P}" xmlns:a="{A}"><p:nvSpPr><p:cNvPr id="{max(ids) + 1}" name="{name}"/><p:cNvSpPr/><p:nvPr userDrawn="1"/></p:nvSpPr>'
        f'<p:spPr><a:xfrm{f" rot=\"{rot}\"" if rot else ""}><a:off x="{int(Cm(x))}" y="{int(Cm(y))}"/><a:ext cx="{int(Cm(w))}" cy="{int(Cm(h))}"/></a:xfrm>'
        f'<a:prstGeom prst="{geom}"><a:avLst>{av}</a:avLst></a:prstGeom>{_fill(colors, ang) if colors else "<a:noFill/>"}<a:ln><a:noFill/></a:ln></p:spPr>'
        f'<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"/><a:lstStyle/>{t}</p:txBody></p:sp>'))


def _recolor_el(el, hexv):
    for rp in el.iter(f"{{{A}}}rPr"):
        for c in rp.findall(f"{{{A}}}solidFill") + rp.findall(f"{{{A}}}gradFill"):
            rp.remove(c)
        rp.insert(0, parse_xml(f'<a:solidFill xmlns:a="{A}"><a:srgbClr val="{hexv}"/></a:solidFill>'))


def head_geom(st, tn):
    """스타일별 머리 영역 — 띠 위치(bt,bh)·배지 x·제목 x·제목 색·사업명 색"""
    if st == "pill":
        return dict(bt=0.3, bh=1.1, bx=1.0, tx=2.1, tcol="FFFFFF", pcol=tn["proj"])
    if st == "tab":
        return dict(bt=0.0, bh=1.25, bx=0.95, tx=2.05, tcol="FFFFFF", pcol="8C8C8C")
    if st == "split":
        return dict(bt=0.0, bh=1.25, bx=0.95, tx=2.05, tcol="FFFFFF", pcol=INK)
    if st == "line":
        return dict(bt=0.32, bh=1.05, bx=0.95, tx=2.05, tcol=INK, pcol="8C8C8C")
    if st == "side":
        return dict(bt=0.0, bh=1.25, bx=0.27, tx=2.05, tcol=INK, pcol="8C8C8C")
    return dict(bt=0.0, bh=1.25, bx=0.95, tx=2.05, tcol="FFFFFF", pcol=tn["proj"])


def head_band(tree, st, tn):
    """머리 영역 도형(본문·목차 공통)"""
    W_ = PAGE_W
    if st == "pill":
        _shape(tree, "머리 띠", 0.55, 0.3, W_ - 1.1, 1.1, tn["head"], "roundRect", 50000)
    elif st == "tab":
        _shape(tree, "머리 띠", 0, 0, 10.2, 1.25, tn["head"], "snip1Rect", 28000)
        _shape(tree, "머리 밑선", 10.2, 1.2, W_ - 10.2, 0.05, [tn["head"][-1]])
    elif st == "split":
        _shape(tree, "머리 띠", 0, 0, 7.8, 1.25, tn["head"])
        _shape(tree, "머리 띠 연한", 7.8, 0, W_ - 7.8, 1.25, [tn["soft"]])
        _shape(tree, "머리 밑선", 0, 1.25, W_, 0.06, [tn["point"]])
    elif st == "line":
        _shape(tree, "머리 굵은 줄", 0, 0, W_, 0.32, tn["head"])
        _shape(tree, "머리 가는 선", 0.9, 1.42, W_ - 1.8, 0.03, [tn["soft"]])
    elif st == "side":
        _shape(tree, "왼쪽 레일", 0, 0, 1.35, PAGE_H, tn["head"], ang=5400000)
        _shape(tree, "머리 가는 선", 1.95, 1.25, W_ - 2.85, 0.03, [tn["soft"]])
    else:
        _shape(tree, "머리 띠", 0, 0, W_, 1.25, tn["head"])
        if tn.get("line"):
            _shape(tree, "머리 포인트 선", 0, 1.25, W_, 0.06, [tn["line"]])


def apply_theme(prs, st, tn, masters):
    """기본 양식 전체(마스터·레이아웃·견본)를 스타일 × 톤으로 — 색 지도 + 머리 영역·목차 머리·간지 구성"""
    st = st if st in STYLES else "band"
    for part in [m.part for m in prs.slide_masters] + [l.part for m in prs.slide_masters for l in m.slide_layouts] + [s.part for s in prs.slides]:
        for c in part._element.iter(f"{{{A}}}srgbClr"):
            v = (c.get("val") or "").upper()
            role = ROLE.get(v)
            if not role:
                continue
            if any(a.tag in _TXT for a in c.iterancestors()):   # 글자 — 먹색, 강조만 포인트
                c.set("val", tn["point"] if v in TEXT_POINT else (tn["soft"] if role == "light" else INK))
            else:                                               # 면 — 차분한 슬레이트, 작은 강조 도형만 포인트
                c.set("val", tn["point"] if v in SHAPE_POINT else {"dark": tn["calm"], "mid": tn["calm2"], "light": tn["soft"]}[role])
    m_body, m_toc, m_div, m_cover = masters
    g = head_geom(st, tn)
    bt, bh = g["bt"], g["bh"]
    gh = 0.6
    gy = bt + (bh - gh) / 2 if st != "side" else 0.45

    def center(sh, x=None, w=None, top=None, h=None):
        sh.top, sh.height = Cm(bt if top is None else top), Cm(bh if h is None else h)
        if x is not None:
            sh.left = Cm(x)
        if w is not None:
            sh.width = Cm(w)
        sh.text_frame.vertical_anchor = 3
        bp = sh.text_frame._txBody.find("a:bodyPr", NS)
        for k in ("tIns", "bIns"):
            bp.set(k, "0")
        for x_ in bp.findall("a:spAutoFit", NS) + bp.findall("a:normAutofit", NS):
            bp.remove(x_)

    # ── 본문 머리
    for nm in ("머리 밑줄", "장 번호 배지"):
        for x in named(m_body.shapes, nm):
            x._element.getparent().remove(x._element)
    tree = m_body.shapes._spTree
    head_band(tree, st, tn)
    badge_bg = tn["dark"] if st in ("line",) else tn["badge"]
    badge_tx = "FFFFFF" if st in ("line",) else tn["badge_text"]
    _shape(tree, "장 번호 배지", g["bx"], gy, 0.82, gh, [badge_bg], "roundRect", 22000)
    pn = next((x for x in walk(m_body.shapes) if x.has_text_frame and x.top < Cm(1.5) and x.text_frame.text.strip()), None)
    if pn is not None:   # 사업명
        center(pn)
        _recolor_el(pn._element, g["pcol"])
        tree.remove(pn._element)
        tree.append(pn._element)
    if st == "side":   # 바닥 왼쪽 로고가 레일에 걸리지 않게
        for sh in m_body.shapes:
            if sh.top > Cm(26) and sh.left < Cm(1.5):
                sh.left = Cm(1.75)
    for lay in m_body.slide_layouts:
        for sh in lay.shapes:
            if not (sh.has_text_frame and sh.top < Cm(2)):
                continue
            if sh.name == "Rectangle 95":
                center(sh, g["bx"], 0.82, gy, gh)
                for p_ in sh.text_frame.paragraphs:
                    p_.alignment = 2
                _recolor_el(sh._element, badge_tx)
            elif st == "side":   # 장 이름을 레일 안에 세로로(위→아래)
                w_, h_ = 9.0, 1.35
                sh.rotation = 90
                sh.width, sh.height = Cm(w_), Cm(h_)
                sh.left, sh.top = Cm(1.35 / 2 - w_ / 2), Cm(1.6 + w_ / 2 - h_ / 2)
                sh.text_frame.vertical_anchor = 3
                for p_ in sh.text_frame.paragraphs:
                    p_.alignment = 1
                _recolor_el(sh._element, "FFFFFF")
            else:
                center(sh, g["tx"])
                _recolor_el(sh._element, g["tcol"])
    # ── 간지
    for x in named(m_div.shapes, "그룹 41"):
        x._element.getparent().remove(x._element)
    dt = m_div.shapes._spTree
    if st == "band":
        pass   # 장 태그 뱃지는 chapter_layouts 가 장마다 글 길이에 맞춰 그린다
    elif st == "pill":
        pass
    elif st == "tab":
        pass
    elif st == "split":   # 위쪽 색 블록 대신 장마다 다크 키비주얼 전면 배경(divider) — 머리 사업명도 흰 글씨
        for sh in m_div.shapes:
            if sh.has_text_frame:
                _recolor_el(sh._element, "FFFFFF")
    elif st == "side":
        _shape(dt, "왼쪽 굵은 레일", 0, 0, 4.4, PAGE_H, [tn["calm"], _mix(tn["calm"], "FFFFFF", 0.1)], ang=5400000)
    elif st == "line":
        _shape(dt, "가는 선", (PAGE_W - 5.0) / 2, 8.75, 5.0, 0.05, [tn["point"]])
    for lay in m_div.slide_layouts:
        for sh in lay.shapes:
            if not sh.has_text_frame:
                continue
            t = sh.text_frame.text.strip()
            is_tag = "CHAPTER" in t or t in ("※", "*")
            if st in ("tab",):
                sh.left = Cm(2.0) if not is_tag else Cm(2.0)
                if is_tag:
                    sh.width = Cm(4.6)
                for p_ in sh.text_frame.paragraphs:
                    p_.alignment = 2 if is_tag else 1
            elif st == "side":
                if is_tag:   # 큰 장 번호(레일 안, 흰 글씨)
                    sh.left, sh.top, sh.width, sh.height = Cm(0), Cm(2.6), Cm(4.4), Cm(3.2)
                    for p_ in sh.text_frame.paragraphs:
                        p_.alignment = 2
                        for r in p_.runs:
                            r.font.size = Pt(60)
                else:
                    sh.left, sh.width = Cm(5.2), Cm(12.8)
                    for p_ in sh.text_frame.paragraphs:
                        p_.alignment = 1
            elif st == "line" and is_tag:   # 큰 장 번호(색)
                sh.left, sh.top, sh.width, sh.height = Cm(0), Cm(2.4), Cm(PAGE_W), Cm(3.6)
                for p_ in sh.text_frame.paragraphs:
                    p_.alignment = 2
                    for r in p_.runs:
                        r.font.size = Pt(72)
            if is_tag:   # 다크 키비주얼(split)은 장 태그가 위쪽 띠 안 — 흰 글씨. 장 제목은 띠 아래 흰 바탕이라 먹색 그대로
                _recolor_el(sh._element, tn["point"] if st == "line" else "FFFFFF")
    # ── 목차 머리
    for nm in ("그룹 2", "자유형 34"):
        for x in named(m_toc.shapes, nm):
            if x._element.getparent() is not None:
                x._element.getparent().remove(x._element)
    tt = m_toc.shapes._spTree
    head_band(tt, st, tn)
    lab_col = "FFFFFF" if st in ("band", "tab", "split", "pill") else INK
    lx = 2.05 if st == "side" else g["bx"] + 0.1
    _shape(tt, "목차 글", lx, bt + 0.07, 2.0, bh, None, text="목차", sz=1400, col=lab_col)
    for lay in m_toc.slide_layouts:
        for sh in lay.shapes:
            if sh.has_text_frame and ("CHAPTER" in sh.text_frame.text or sh.text_frame.text.strip() in ("※", "*")):
                center(sh, lx + 2.1)
                for p_ in sh.text_frame.paragraphs:
                    p_.alignment = 1
                _recolor_el(sh._element, lab_col)
    # ── 표지·간지·목차 왼쪽 가는 세로 띠 = 톤 머리 색
    for m in (m_cover, m_div, m_toc):
        for sh in m.shapes:
            if sh.shape_type == 1 and sh.left < Cm(0.1) and sh.width < Cm(0.5) and sh.height > Cm(20):
                sp = sh._element.find("p:spPr", NS)
                for c in sp.findall("a:solidFill", NS) + sp.findall("a:gradFill", NS) + sp.findall("a:noFill", NS):
                    sp.remove(c)
                sp.find("a:prstGeom", NS).addnext(parse_xml(f'<a:solidFill xmlns:a="{A}"><a:srgbClr val="{tn["calm"]}"/></a:solidFill>'))   # 머리가 아니라 차분한 색


# ───────────────────────── pptx 도우미
def set_bg(owner, blob):
    _, rid = owner.part.get_or_add_image_part(io.BytesIO(blob))
    csld = owner._element.find("p:cSld", NS)
    old = csld.find("p:bg", NS)
    if old is not None:
        csld.remove(old)
    csld.insert(0, parse_xml(
        f'<p:bg xmlns:p="{P}" xmlns:a="{A}" xmlns:r="{R}"><p:bgPr><a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="{rid}"/>'
        f'<a:srcRect/><a:stretch><a:fillRect/></a:stretch></a:blipFill><a:effectLst/></p:bgPr></p:bg>'))


def walk(shapes):
    for sh in shapes:
        yield sh
        if sh.shape_type == 6:
            yield from walk(sh.shapes)


def abs_box(sh):
    """그룹 안 도형의 실제 위치(cm) — 그룹 변환(off·chOff·ext·chExt)을 거슬러 올라가 계산"""
    el = sh._element
    off, ext = el.find(".//a:xfrm/a:off", NS), el.find(".//a:xfrm/a:ext", NS)
    x, y, w, h = int(off.get("x")), int(off.get("y")), int(ext.get("cx")), int(ext.get("cy"))
    par = el.getparent()
    while par is not None and par.tag == f"{{{P}}}grpSp":
        gx = par.find("p:grpSpPr/a:xfrm", NS)
        o, e, co, ce = gx.find("a:off", NS), gx.find("a:ext", NS), gx.find("a:chOff", NS), gx.find("a:chExt", NS)
        sx = int(e.get("cx")) / max(1, int(ce.get("cx")))
        sy = int(e.get("cy")) / max(1, int(ce.get("cy")))
        x = int(o.get("x")) + (x - int(co.get("x"))) * sx
        y = int(o.get("y")) + (y - int(co.get("y"))) * sy
        w, h = w * sx, h * sy
        par = par.getparent()
    return x / 360000, y / 360000, w / 360000, h / 360000


def _lins(sh):
    """글 상자 왼쪽 안쪽 여백(cm) — 지정이 없으면 PowerPoint 기본 0.254"""
    if not sh.has_text_frame or not sh.text_frame.text.strip():
        return 0.0   # 글 없는 도형(아이콘·막대)은 도형 끝이 곧 보이는 끝 — 여백을 더하면 0.25cm 왼쪽으로 밀린다(2026-10-14 실수)
    v = sh.text_frame._txBody.find("a:bodyPr", NS).get("lIns")
    return int(v) / 360000 if v is not None else 0.254


def run_pt_face(sh, default_pt=18):
    """글 상자 첫 글자의 실제 크기·서체 — 크기 지정이 없으면 문서 기본(18pt). 14pt 로 가정해 뱃지 폭이 좁았다(2026-10-14)"""
    r0 = sh._element.find(".//a:r/a:rPr", NS)
    pt = int(r0.get("sz")) / 100 if r0 is not None and r0.get("sz") else default_pt
    text = sh.text_frame.text.strip()
    # 영문·숫자 글자는 latin 서체로 그려진다('CHAPTER Ⅰ' 는 G마켓 산스) — 한글이 섞이면 ea
    tag = "a:ea" if re.search(r"[가-힣]", text) else "a:latin"
    fe = r0.find(tag, NS) if r0 is not None else None
    if fe is None and r0 is not None:
        fe = r0.find("a:ea", NS)
    return pt, (fe.get("typeface") if fe is not None else "a시월구일3")


_INK = {}
try:   # 서체별 '글 상자 가운데 → 기준선' 실측(engine/tools_baseline_calib.py 가 PowerPoint 렌더로 만든다)
    BASELINE = json.load(open(os.path.join(HERE, "templates", "vertical", "baseline.json"), encoding="utf-8"))
except Exception:
    BASELINE = {}


def _ink(text, pt, face):
    """글을 실제로 그려 잰 잉크 — (진행 폭, x0, y0, x1, y1) cm, 기준선이 y=0(아래 +). 서체 파일이 없으면 None.
    PIL getbbox 는 잉크가 아니라 글자 칸 상자를 준다 — 'Ⅰ' 처럼 오른쪽이 빈 글자에서 0.08cm 쏠림을 놓쳤다(2026-10-14)"""
    ff = ffile(face)
    key = (ff, pt, text)
    if key not in _INK:
        f = _FONTS.get((ff, pt))
        if f is None and (ff, pt) not in _FONTS:
            f = _FONTS[(ff, pt)] = _font(ff, pt * 10)
        if not f:
            _INK[key] = None
        else:
            W, H = int(f.getlength(text)) + 400, int(pt * 40)
            im = Image.new("L", (W, H), 0)
            ImageDraw.Draw(im).text((200, H * 2 // 3), text, font=f, fill=255, anchor="ls")
            bb = im.getbbox() or (200, H * 2 // 3, 200, H * 2 // 3)
            k = 0.03528 / 10
            _INK[key] = (f.getlength(text) * k, (bb[0] - 200) * k, (bb[1] - H * 2 // 3) * k, (bb[2] - 200) * k, (bb[3] - H * 2 // 3) * k)
    return _INK[key]


def ink_cm(text, pt, face):
    """글자 잉크 폭·높이 cm(서체가 없으면 어림)"""
    r = _ink(text, pt, face)
    if r:
        return r[3] - r[1], r[4] - r[2]
    return text_cm(text, pt, face) * 0.97, pt * 0.03528 * 0.9


def ink_offset_cm(text, pt, face):
    """가운데 정렬·안쪽 여백 0 글 상자에서 잉크를 정가운데로 옮길 양(cm) — (dx, dy), 양수 = 오른쪽·아래로 옮겨야 함.
    가로: PowerPoint 는 진행 폭 가운데에 맞춘다 → 잉크 가운데와의 차이. 세로: 기준선 자리(BASELINE 실측, em) + 잉크의 기준선 기준 가운데"""
    r = _ink(text, pt, face)
    if not r:
        return 0.0, 0.0
    adv, x0, y0, x1, y1 = r
    em = pt * 0.03528
    base = BASELINE.get(fface(face), {}).get("base_em", 0.33) * em
    return adv / 2 - (x0 + x1) / 2, -(base + (y0 + y1) / 2)


def badge_size(text, pt, face, spc_cm=0.0):
    """뱃지 = 글 잉크 + 여백. 상하 여백 = 잉크 높이 × 0.42, 좌우 여백 = 상하 × 1.5(사용자 2026-10-14 "좌우 여백은 상하 여백보다 1.5배 넓게").
    여백은 '보이는' 여백 — 글자 크기(em)로 짐작하면 한글 잉크가 0.91em 이라 상하가 좁고 비율이 2.1 로 틀어졌다(고해상도 렌더 실측). (폭, 높이) cm"""
    iw, ih = ink_cm(text, pt, face)
    pv = ih * 0.42
    return iw + 2 * pv * 4.5, ih + 2 * pv   # 좌우 = 상하 × 4.5 (처음 1.5 → 사용자 2026-10-14 "좌우 여백 지금보다 3배 더 여유")


def fit_badge(tree, sh, name, x, cy, colors, geom, adj, center_x=False):
    """글 상자 sh 를 뱃지로 — 뱃지 도형을 글 바로 뒤에 그리고, 글 상자를 뱃지와 같은 자리·크기로(가운데 정렬, 안쪽 여백 0)"""
    for r in sh._element.iter(f"{{{A}}}rPr"):   # 뱃지 글은 자간 없이 — 마지막 글자 뒤 자간까지 폭에 들어가 글이 왼쪽으로 쏠렸다
        if True:
            r.set("spc", "0")   # 0 을 명시 — 제목 자간 줄이기(refont)가 뱃지 글은 건너뛴다(뱃지 크기는 자간 없이 잰다)
    pt, face = run_pt_face(sh)
    text = sh.text_frame.text.strip()
    bw, bh = badge_size(text, pt, face)
    odx, ody = ink_offset_cm(text, pt, face)
    bx = (PAGE_W - bw) / 2 if center_x else x
    by = cy - bh / 2
    _shape(tree, name, bx, by, bw, bh, colors, geom, adj)
    e = tree[-1]
    tree.remove(e)
    top = sh._element   # 글 상자가 그룹 안이면 그룹째 앞(아래층)에 — 그룹 안에 넣으면 그룹 좌표로 읽혀 0.19cm 밀렸다
    while top.getparent() is not None and top.getparent() is not tree:
        top = top.getparent()
    top.addprevious(e)
    bp = sh.text_frame._txBody.find("a:bodyPr", NS)
    # 잉크를 뱃지 정가운데로 — 치우친 쪽 반대편에 안쪽 여백을 두 배로 주면 가운데 정렬된 글이 그만큼 옮겨진다
    bp.set("lIns", str(int(Cm(max(0.0, 2 * odx)))))
    bp.set("rIns", str(int(Cm(max(0.0, -2 * odx)))))
    bp.set("tIns", str(int(Cm(max(0.0, 2 * ody)))))
    bp.set("bIns", str(int(Cm(max(0.0, -2 * ody)))))
    bp.set("anchor", "ctr")
    for x_ in bp.findall("a:spAutoFit", NS) + bp.findall("a:normAutofit", NS):
        bp.remove(x_)
    for _ in range(3):   # 그룹 배율을 거슬러 실제 위치·크기를 뱃지와 같게
        ax, ay, aw, ah = abs_box(sh)
        sx, sy = aw / max(1e-6, sh.width / 360000), ah / max(1e-6, sh.height / 360000)
        sh.left = int(sh.left + Cm(bx - ax) / sx)
        sh.top = int(sh.top + Cm(by - ay) / sy)
        sh.width, sh.height = int(Cm(bw) / sx), int(Cm(bh) / sy)
    for p_ in sh.text_frame.paragraphs:
        p_.alignment = 2
    return bw, bh


def _algn(sh):
    """첫 문단의 실제 정렬 — 문단에 없으면 상자 lstStyle 의 1단계 값"""
    tb = sh.text_frame._txBody
    p0 = tb.find("a:p/a:pPr", NS)
    if p0 is not None and p0.get("algn"):
        return p0.get("algn")
    l1 = tb.find("a:lstStyle/a:lvl1pPr", NS)
    return (l1.get("algn") if l1 is not None else None) or "l"


def _boxed(sh):
    """면(단색·그라데이션)이나 테두리가 보이는 도형인가"""
    sp = sh._element.find(f"{{{P}}}spPr")
    if sp is None:
        return False
    if sp.find(f"{{{A}}}solidFill") is not None or sp.find(f"{{{A}}}gradFill") is not None:
        return True
    ln = sp.find(f"{{{A}}}ln")
    return ln is not None and ln.find(f"{{{A}}}solidFill") is not None


def vis_left(sh):
    """보이는 왼쪽 끝 — 글 상자는 안쪽 여백을 더한 글의 시작점"""
    return abs_box(sh)[0] + _lins(sh)


def shift_to(sh, x_cm):
    """보이는 왼쪽 끝을 x_cm 에 — 그룹 안이어도 차이만큼 옮긴다(그룹 배율 1 가정)"""
    sh.left = int(sh.left + Cm(x_cm - vis_left(sh)))


def head_span(prs):
    """본문 머리 영역의 가로 끝(cm) — 왼쪽 = 장 번호 배지(로마자) 왼쪽, 오른쪽 = 사업명 글 오른쪽 끝. 왼쪽 레일(side)이면 레일 안쪽 선"""
    for m in prs.slide_masters:
        bd = next((x for x in m.shapes if x.name == "장 번호 배지"), None)
        if bd is None:
            continue
        pn = next((x for x in m.shapes if x.has_text_frame and x.top < Cm(1.5) and x.text_frame.text.strip() and x is not bd), None)
        if pn is None:
            return None
        bp = pn.text_frame._txBody.find("a:bodyPr", NS)
        l_ = bd.left / 360000
        rail = next((x for x in m.shapes if x.name == "왼쪽 레일"), None)
        if rail is not None:
            l_ = max(l_, (rail.left + rail.width) / 360000 + 0.6)
        return m, l_, (pn.left + pn.width - int(bp.get("rIns", 91440))) / 360000
    return None


SPAN_TAG = "본문폭"


def widen_body(prs):
    """세로 제안서 본문 좌우 여백 = 머리 영역 좌우 끝(사용자 10-28 "컨텐츠 좌우 여백이 너무 크다", R125).
    본문은 기준선 G(2.04)~G+15 로 짜여 있다 — 짠 뒤 본문 장의 도형을 가로로만 [G, G+15] → [배지 왼쪽, 사업명 끝] 으로 옮긴다.
    글 상자·막대·표·선은 폭도 같은 비율로 넓히고(세로 높이는 그대로 — 줄이 줄면 줄었지 늘지 않는다),
    그림·작은 아이콘(정사각형에 가까운 1.6cm 미만)은 비율을 지키려 크기는 두고 자리만 옮긴다. 두 번 돌려도 한 번만(마스터 표시)."""
    hs = head_span(prs)
    if hs is None:
        return 0
    m, L, R = hs
    if (m._element.cSld.get("name") or "").startswith(SPAN_TAG):
        return 0
    G, W0 = BODY_G, 15.0
    k = (R - L) / W0
    if not (1.0 < k < 1.4):
        return 0
    f = lambda x: L + (x - G) * k

    def keep(el, w, h):
        tag = etree.QName(el).localname
        if tag == "pic":
            return True
        if tag == "graphicFrame" or tag == "cxnSp" or tag == "grpSp":
            return False
        return w < 1.6 and h > 0 and abs(w - h) / max(w, h) < 0.35

    def move(el, mapx, scale, clamp=None):
        """el 의 xfrm 을 가로로 — mapx: 이 좌표계의 x 변환, scale: 이 좌표계 1 단위의 실제 cm(크기 판정용),
        clamp: 오른쪽 끝 상한(맨 위 도형만 — 경로 글 상자처럼 원래 G+15 를 넘던 빈 폭이 쪽 밖으로 나가지 않게)"""
        xf = el.find("p:spPr/a:xfrm", NS) if el.find("p:spPr", NS) is not None else None
        if xf is None:
            xf = el.find("p:grpSpPr/a:xfrm", NS)
        if xf is None:
            xf = el.find("p:xfrm", NS)
        if xf is None:
            return
        off, ext = xf.find("a:off", NS), xf.find("a:ext", NS)
        if off is None or ext is None:
            return
        x, w, h = int(off.get("x")), int(ext.get("cx")), int(ext.get("cy"))
        rot = int(xf.get("rot", "0")) % 21600000
        side = rot in (5400000, 16200000)
        if keep(el, w * scale / 360000, h * scale / 360000) or side:
            c = mapx(x + w / 2)
            off.set("x", str(int(round(c - w / 2))))
            return
        nx = mapx(x)
        nr = mapx(x + w)
        if clamp is not None and nr > clamp:
            nr = max(clamp, nx + 1)
        nw = int(round(nr - nx))
        off.set("x", str(int(round(nx))))
        ext.set("cx", str(nw))
        tag = etree.QName(el).localname
        if tag == "graphicFrame":
            for gc in el.iter(f"{{{A}}}gridCol"):
                gc.set("w", str(int(round(int(gc.get("w")) * nw / max(1, w)))))
        elif tag == "grpSp":
            co, ce = xf.find("a:chOff", NS), xf.find("a:chExt", NS)
            if co is not None and ce is not None:
                c0, cw = int(co.get("x")), int(ce.get("cx"))
                ce.set("cx", str(int(round(cw * nw / max(1, w)))))
                sub = lambda cx_, c0=c0: c0 + (cx_ - c0) * k
                for ch in el:
                    if etree.QName(ch).localname in ("sp", "pic", "grpSp", "graphicFrame", "cxnSp"):
                        move(ch, sub, scale * (w / max(1, cw)))

    n = 0
    for s in prs.slides:
        if s.slide_layout.slide_master is not m:
            continue
        for sh in list(s.shapes):
            if sh.top is None or not (Cm(1.6) < sh.top < Cm(26.3)):
                continue   # 머리·바닥(쪽 번호·로고)은 그대로
            move(sh._element, lambda v: f(v / 360000) * 360000, 1.0, R * 360000)
            n += 1
    m._element.cSld.set("name", f"{SPAN_TAG} {L:.2f}-{R:.2f}")
    return n


def span_k(prs):
    """widen_body 를 거친 장표의 가로 배율(안 거쳤으면 1)"""
    hs = head_span(prs)
    if hs is None or not (hs[0]._element.cSld.get("name") or "").startswith(SPAN_TAG):
        return 1.0
    return (hs[2] - hs[1]) / 15.0


def _is_toc_slide(s):
    """목차 쪽 — 레이아웃·마스터 머리에 '목차' 글이 있다"""
    try:
        for src in (s.slide_layout.shapes, s.slide_layout.slide_master.shapes):
            for sh in walk(src):
                if sh.has_text_frame and sh.text_frame.text.strip() == "목차":
                    return True
    except Exception:
        pass
    return False


def audit_align(prs, lo=0.05, hi=0.9):
    """정렬 검사 — 한 장 안에서 왼쪽 정렬 요소들의 시작점이 '거의 같은데 다른'(lo~hi cm 차이) 곳을 찾는다.
    눈대중으로 놓친 사례: 표지 뱃지가 글 기준선보다 0.56cm 왼쪽(사용자 2026-10-14). 들여쓰기는 같은 상자 안 문단이라 걸리지 않는다."""
    out = []
    ind = (BODY_T - BODY_G) * span_k(prs)   # 기준선 → 블록 안 글 들여쓰기(본문 폭을 넓혔으면 같은 비율)
    for k, s in enumerate(prs.slides, 1):
        if _is_toc_slide(s):   # 목차는 장 이름 ↔ 절 이름 들여쓰기가 원래 양식 — 작업마다 6~10건 오탐이 진짜 경고를 묻었다(R146)
            continue
        items = []
        for src in (s.slide_layout.shapes, s.shapes):
            for sh in walk(src):
                if sh.shape_type == 6:
                    continue
                try:
                    x, y, w, h = abs_box(sh)
                except Exception:
                    continue
                if x < 0.5 or (w > PAGE_W * 0.85 and h > 5) or h > PAGE_H * 0.8 or y > 25.5 or y < 1.6:
                    continue   # 배경·꽉 찬 그림·레일·머리·바닥(머리·바닥은 따로 정렬)
                if sh.has_text_frame and sh.text_frame.text.strip():
                    if _algn(sh) in ("ctr", "r"):
                        continue
                    if sh.name in FIG_NAMES and x > BODY_T + 0.05:
                        continue   # 도식 안쪽 칸(둘째 열부터)은 도식마다 칸 나눔이 달라 서로 맞출 대상이 아니다 — 바깥 선(T)만 본다
                    # 면·테두리가 보이는 상자 안 글은 상자 끝이 보이는 왼쪽 선이다(도식 상자 28건 오탐, 2026-10-14)
                    items.append((x if _boxed(sh) else vis_left(sh), sh.text_frame.text.strip()[:14]))
                elif sh.name in ("표지 필", "표지 탭", "장 태그", "육각형 42", "직사각형 25"):   # 기준선에 붙는 장식(뱃지·소제목 아이콘·막대)
                    if abs(x + w / 2 - PAGE_W / 2) < 0.05:
                        continue   # 쪽 가운데 놓인 장식(가운데 정렬 간지 태그)은 왼쪽 선 검사 대상이 아니다
                    items.append((x, sh.name))
        items.sort()
        for (x1, a), (x2, b) in zip(items, items[1:]):
            if lo < x2 - x1 < hi and abs(x2 - x1 - ind) > 0.03:   # 본문 2단(기준선 → 블록 안 글 0.50)은 의도한 들여쓰기
                out.append(f"{k}쪽 '{a}' {x1:.2f}cm ↔ '{b}' {x2:.2f}cm ({x2 - x1:.2f}cm 어긋남)")
    return out


def named(shapes, name, nth=None):
    hits = [s for s in walk(shapes) if s.name == name]
    return hits if nth is None else (hits[nth] if len(hits) > nth else None)


def set_text(sh, text):
    """첫 문단 첫 런 서식을 살려 글만 바꾼다."""
    body = sh.text_frame._txBody
    ps = body.findall("a:p", NS)
    for p_ in ps[1:]:
        body.remove(p_)
    rs = ps[0].findall("a:r", NS)
    if not rs:
        r = etree.SubElement(ps[0], f"{{{A}}}r")
        etree.SubElement(r, f"{{{A}}}t")
        end = ps[0].find("a:endParaRPr", NS)
        if end is not None:
            ps[0].remove(r)
            end.addprevious(r)
        rs = [r]
    rs[0].find("a:t", NS).text = text
    for r in rs[1:]:
        ps[0].remove(r)
    for f in ps[0].findall("a:fld", NS):
        ps[0].remove(f)


def clone_slide(prs, src):
    """같은 파일 안에서 장표 복제 — 글·도형·선에 더해 그림·차트·SmartArt·링크의 연결(rId)도 새 장에 단다.
    2026-10-18 전에는 도형 XML 만 복사해 견본에 그림·차트가 있으면 새 장의 r:embed·r:id 가 없는 연결을 가리켰다(PowerPoint '복구' — R81).
    연결 옮기기는 합치기(merge_pptx.copy_rels·remap_refs)와 같은 함수 — 차트는 파트째 새 이름으로(두 장이 한 차트를 나눠 갖지 않게)."""
    import merge_pptx
    s = prs.slides.add_slide(src.slide_layout)
    for ph in list(s.placeholders):
        ph._element.getparent().remove(ph._element)
    rid, dead, memo = merge_pptx.copy_rels(src, s, prs.part.package, 0, "세로 제안서 견본")
    for el in src.shapes._spTree.iterchildren():
        if el.tag.split("}")[1] in ("sp", "grpSp", "cxnSp", "pic", "graphicFrame", "contentPart"):
            s.shapes._spTree.append(copy.deepcopy(el))
    merge_pptx.remap_refs(s._element, rid, dead, memo, 0)
    return s


def master_of(prs, name):
    """PowerPoint '디자인' 이름 = 마스터 테마 이름(base.pptx 를 만들 때 vertical-body/cover/toc/divider 로 붙였다)"""
    for m in prs.slide_masters:
        th = m.part.part_related_by("http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme")
        if (parse_xml(th.blob).get("name") or "") == name:
            return m
    raise RuntimeError(f"base.pptx 에 '{name}' 마스터가 없습니다")


def layout_for(master, i):
    ls = list(master.slide_layouts)
    return ls[min(i, len(ls) - 1)]


def move_slide(prs, slide, to):
    lst = prs.slides._sldIdLst
    for sid in lst:
        if prs.part.related_part(sid.get(f"{{{R}}}id")) is slide.part:
            lst.remove(sid)
            lst.insert(to, sid)
            return


def drop_slide(prs, slide):
    lst = prs.slides._sldIdLst
    for sid in list(lst):
        rid = sid.get(f"{{{R}}}id")
        if prs.part.related_part(rid) is slide.part:
            prs.part.drop_rel(rid)
            lst.remove(sid)


# ───────────────────────── 제작
class Build:
    def __init__(self, o, bgs, logo, style="band", tone="navy"):
        self.o, self.bgs, self.logo = o, bgs, logo
        self.style = style if style in STYLES else "band"
        self.th = TONES.get(tone) or TONES["navy"]
        self.prs = Presentation(BASE)
        s = list(self.prs.slides)
        self.s_body, self.s_cover, self.s_toc, self.s_div = s[0], s[1], s[2], s[3]
        self.m_body = master_of(self.prs, "vertical-body")
        self.m_toc = master_of(self.prs, "vertical-toc")
        self.m_div = master_of(self.prs, "vertical-divider")
        self.m_cover = master_of(self.prs, "vertical-cover")
        apply_theme(self.prs, self.style, self.th, (self.m_body, self.m_toc, self.m_div, self.m_cover))
        if self.style in DARK_STYLES:   # 본문 머리 짙은 칸 = 표지 다크 키비주얼의 빛나는 띠(표지 분위기만 살짝 — 목차 머리는 그대로)
            for x in named(self.m_body.shapes, "머리 띠"):
                w_, h_ = x.width / 360000, x.height / 360000
                fill_image(self.m_body, x._element, _glow_strip(self.bgs.get("cover"), int(w_ * 60), int(h_ * 60), 0.62, 0.25))
        self.normalize_body()
        self.pageno = {}     # (장 번호) → 쪽 수
        self.trimmed = []    # 넘쳐서 덜어 낸 행(작업 기록·확인 목록에 남긴다 — 지금은 지우지 않고 '(계속)' 쪽으로 넘겨 비어 있어야 한다)
        self.req_at = {}     # 요구사항 번호 → [(첫 쪽 'Ⅱ-3', 항목 제목)] — 별첨 대응표
        self.item_at = {}    # (장 번호, 항목 제목) → 첫 쪽
        self.appendix = 0    # 별첨 쪽 수
        self.pn = {}         # 장 → 본문 레이아웃에서 떼어 낸 쪽 번호 칸

    def normalize_body(self):
        """본문 견본 블록의 세로 기준선 정리 — 원래 양식은 아이콘·막대 2.02~2.09, 글 2.12~2.54 로 제각각이었다(사용자 2026-10-14 "세로 가이드가 하나도 안 맞아").
        아이콘·막대 왼쪽 = G(본문 기준선, 도입 문단과 같은 선), 그 안의 글(소제목·작은 제목·막대 제목·본문 글) = T 한 선, 오른쪽 끝 = G + 15"""
        G, T, R_ = BODY_G, BODY_T, BODY_G + 15.0
        hex42 = None
        for sh in walk(self.s_body.shapes):
            if sh.shape_type == 6:
                continue
            x, y, w, h = abs_box(sh)
            if y < 7.3:
                continue
            if sh.name == "육각형 42":
                shift_to(sh, G)
                hex42 = (G, w)
            elif sh.name == "직사각형 25":
                shift_to(sh, G)
                sh.width = Cm(R_ - G)
            elif sh.has_text_frame and sh.name in ("Rectangle 95", "TextBox 19", "AutoShape 91"):
                shift_to(sh, T)
                sh.width = Cm(R_ - T)
        for sh in walk(self.s_body.shapes):
            if sh.name == "육각형 54" and hex42:   # 작은 육각형은 큰 육각형과 가운데를 맞춘다
                w = abs_box(sh)[2]
                shift_to(sh, hex42[0] + (hex42[1] - w) / 2)
        # 목차 — 목록 글을 장 이름 글과 같은 선에(원래 4.57 ↔ 4.48)
        ttl = next((x for x in layout_for(self.m_toc, 0).shapes if x.has_text_frame and x.top > Cm(2) and x.text_frame.text.strip()), None)
        lst = min((x for x in self.s_toc.shapes if x.has_text_frame and x.name == "Text Box 40"), key=lambda x: x.left, default=None)
        if ttl is not None and lst is not None:
            shift_to(lst, vis_left(ttl))

    # 공통 글: 사업명(마스터들의 머리·바닥)
    def project_text(self):
        name = self.o["project"]["name"]
        for m in (self.m_body, self.m_toc, self.m_div):
            for sh in walk(m.shapes):
                if sh.has_text_frame and re.search(r"사업|구축|○○", sh.text_frame.text) and sh.top < Cm(27):
                    set_text(sh, name)
        # 본문 바닥 왼쪽: 발주기관 로고(있으면 그림, 없으면 이름)
        x, y, h = Cm(1.75 if self.style == "side" else 1.02), Cm(26.61), Cm(0.6)
        # 바닥 오른쪽 제안사 로고(견본 마스터의 그림) — 이름을 붙여 로고 쌍 검사(logosize.check)가 알아보게(R121)
        ven = next((sh for sh in self.m_body.shapes if sh.shape_type == 13 and sh.top > Cm(26) and sh.left > Cm(9)), None)
        if ven is not None:
            ven.name = "제안사 로고"
        if self.logo:
            im = Image.open(io.BytesIO(self.logo))
            w = int(h * im.width / im.height)
            if ven is not None:   # 발주기관 로고 높이 ≥ 제안사 로고 × 1.15(사용자 10-28, R121) — 발주기관은 견본 높이 0.6cm 를 넘지 않고, 모자라면 제안사 로고를 줄인다(오른쪽 끝·세로 가운데 유지)
                import logosize
                cs, vs = logosize.enforce_height((w, h), (ven.width, ven.height), h, None)
                vw, vh = logosize.ints_pair(cs, vs)[1]
                if (vw, vh) != (ven.width, ven.height):
                    r_, cy = ven.left + ven.width, ven.top + ven.height // 2
                    ven.width, ven.height, ven.left, ven.top = vw, vh, r_ - vw, cy - vh // 2
            self.m_body.shapes._spTree.append(self._pic_el(self.m_body, self.logo, x, y, w, h, "발주기관 로고"))
        elif self.o["project"]["client"]:
            self._text_el(self.m_body, self.o["project"]["client"], x, y, Cm(6), h, 900, "595959", "a시월구일3")

    def _pic_el(self, owner, blob, x, y, w, h, name):
        _, rid = owner.part.get_or_add_image_part(io.BytesIO(blob))
        ids = [int(e.get("id")) for e in owner._element.iter(f"{{{P}}}cNvPr")] or [1]
        return parse_xml(
            f'<p:pic xmlns:p="{P}" xmlns:a="{A}" xmlns:r="{R}"><p:nvPicPr><p:cNvPr id="{max(ids) + 1}" name="{name}"/>'
            f'<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr userDrawn="1"/></p:nvPicPr>'
            f'<p:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
            f'<p:spPr><a:xfrm><a:off x="{int(x)}" y="{int(y)}"/><a:ext cx="{int(w)}" cy="{int(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>')

    def _text_el(self, owner, text, x, y, w, h, sz, col, face, bold=False):
        ids = [int(e.get("id")) for e in owner._element.iter(f"{{{P}}}cNvPr")] or [1]
        t = (text or "").replace("&", "&amp;").replace("<", "&lt;")
        owner.shapes._spTree.append(parse_xml(
            f'<p:sp xmlns:p="{P}" xmlns:a="{A}"><p:nvSpPr><p:cNvPr id="{max(ids) + 1}" name="글"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>'
            f'<p:spPr><a:xfrm><a:off x="{int(x)}" y="{int(y)}"/><a:ext cx="{int(w)}" cy="{int(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>'
            f'<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"/><a:lstStyle/><a:p><a:r>'
            f'<a:rPr lang="ko-KR" sz="{sz}" b="{1 if bold else 0}"><a:solidFill><a:srgbClr val="{col}"/></a:solidFill><a:latin typeface="{face}"/><a:ea typeface="{face}"/></a:rPr>'
            f'<a:t>{t}</a:t></a:r></a:p></p:txBody></p:sp>'))

    # 표지
    def cover(self):
        s = clone_slide(self.prs, self.s_cover)
        p = self.o["project"]
        yr = named(s.shapes, "TextBox 29", 0)
        if yr is not None:
            set_text(yr, f"{p['year']}년")
        tt = named(s.shapes, "TextBox 24", 0)
        if tt is not None:
            l1, l2, small = split_title(re.sub(r"^\s*(19|20)\d{2}\s*년(도)?\s*", "", p["name"]))   # 연도는 위 줄에 따로 있다
            ps = tt.text_frame.paragraphs
            ps[0].runs[0].text, ps[1].runs[0].text = l1, l2
            if small:
                for r in ps[0].runs:
                    r.font.size = Pt(26)
                for r in ps[1].runs:
                    r.font.size = Pt(32)
        dc = named(s.shapes, "TextBox 30", 0)
        if dc is not None:
            set_text(dc, p["doc"])
        if self.bgs.get("cover"):
            set_bg(s, full_bg(self.bgs["cover"]) if self.style in DARK_STYLES else style_bg(self.bgs["cover"], self.style, "cover", self.th["point"]))
        guide = vis_left(tt) if tt is not None else 1.92   # 표지 왼쪽 기준선 = 제목 글자의 실제 시작점
        for x_ in (yr, dc):
            if x_ is not None:
                shift_to(x_, guide)
        light_text = self.cover_style(s, dc, guide)
        x, y, h = Cm(guide), Cm(1.39), Cm(1.35)
        if self.logo:
            im = Image.open(io.BytesIO(self.logo))
            s.shapes._spTree.append(self._pic_el(s, self.logo, x, y, int(h * im.width / im.height), h, "발주기관 로고"))
        elif p["client"]:
            self._text_el(s, p["client"], x, y, Cm(10), h, 1600, "FFFFFF" if light_text else INK, "a시월구일3")
        return s

    def cover_style(self, s, dc, guide):
        """표지도 스타일마다 다르게 — 도형은 글 뒤(spTree 앞쪽)에. 흰 글씨로 바꿨으면 True.
        뱃지(탭·필)는 왼쪽 끝을 기준선(guide)에 맞추고 글은 뱃지 가운데 — 뱃지가 기준선 왼쪽으로 삐져나왔다(사용자 2026-10-14)"""
        tn, st = self.th, self.style
        shapes = []

        def add(*a, **k):   # 장표 트리에 바로 그린 뒤 맨 뒤(글 아래)로 옮긴다 — 다른 트리를 거치면 요소 클래스가 바뀐다
            tree_ = s.shapes._spTree
            _shape(tree_, *a, **k)
            shapes.append(tree_[-1])

        dxy = abs_box(dc) if dc is not None else (guide, 10.11, 3.4, 1.03)
        calm = [tn["calm"], _mix(tn["calm"], "FFFFFF", 0.1)]
        if st in ("tab", "pill") and dc is not None:   # 뱃지 — 좌우 여백 = 상하 × 1.5, 왼쪽 = 기준선
            _recolor_el(dc._element, "FFFFFF")
            fit_badge(s.shapes._spTree, dc, "표지 탭" if st == "tab" else "표지 필", guide, dxy[1] + dxy[3] / 2, [tn["point"]],
                      "snip1Rect" if st == "tab" else "roundRect", 28000 if st == "tab" else 50000)
        if st == "band":
            add("표지 위 띠", 0, 0, PAGE_W, 0.95, tn["head"])
        elif st == "side":
            add("표지 레일", 0, 0, 1.35, PAGE_H, calm, ang=5400000)
        elif st == "split":   # 위쪽 검정 큰 블록은 뺐다(사용자 2026-10-15 "칙칙해") — 다크 키비주얼 전면 배경, 마스터의 흰 판·띠는 숨긴다
            s._element.set("showMasterSp", "0")
            if not self.bgs.get("cover"):
                set_bg(s, full_bg())
        elif st == "line":
            add("표지 위 굵은 줄", 0, 0, PAGE_W, 0.45, tn["head"])
            add("표지 제목 밑선", guide, dxy[1] + dxy[3] + 0.5, 6.0, 0.06, [tn["point"]])
        tree = s.shapes._spTree
        for k, e in enumerate(shapes):
            tree.remove(e)
            tree.insert(2 + k, e)
        if st == "split":
            for nm in ("TextBox 24", "TextBox 29", "TextBox 30"):
                for x in named(s.shapes, nm):
                    _recolor_el(x._element, "FFFFFF")
            return True
        return False

    # 간지·목차 레이아웃 글(장 번호·장 이름)
    def chapter_layouts(self):
        for i, c in enumerate(self.o["chapters"]):
            tag = "※" if c["no"] == "※" else (c["no"] if self.style in ("side", "line") else f"CHAPTER {c['no']}")   # 큰 장 번호 스타일은 번호만
            for m in (self.m_div, self.m_toc, self.m_body):
                layout_for(m, i).name = c["title"] if c["no"] == "※" else f"{c['no']} {c['title']}"
            for m in (self.m_div, self.m_toc):
                lay = layout_for(m, i)
                for sh in lay.shapes:
                    if not sh.has_text_frame or not sh.text_frame.text.strip():
                        continue
                    t = sh.text_frame.text.strip()
                    is_tag = "CHAPTER" in t or t in ("※", "*")
                    set_text(sh, tag if is_tag else c["title"])
                    if not is_tag:   # 긴 장 이름이 상자 폭에서 꺾이지 않게(LibreOffice 썸네일 포함, R119)
                        fit_box(sh, c["title"], center=(m is self.m_div))
                    if is_tag and m is self.m_div and self.style in ("band", "pill", "tab"):   # 간지 장 태그 = 뱃지(좌우 = 상하 × 1.5)
                        bx = abs_box(sh)[0] + _lins(sh)
                        geo = {"band": ("roundRect", 18000), "pill": ("roundRect", 50000), "tab": ("snip1Rect", 28000)}[self.style]
                        bw, bh = fit_badge(lay.shapes._spTree, sh, "장 태그", bx if self.style == "tab" else 0, 3.62 + 0.475,
                                           [self.th["point"]], geo[0], geo[1], center_x=self.style != "tab")
                        if self.style == "tab":   # 탭 오른쪽으로 이어지는 가는 밑선
                            _shape(lay.shapes._spTree, "장 밑선", bx + bw, 3.62 + 0.475 + bh / 2 - 0.05, PAGE_W - 1.0 - (bx + bw), 0.05, [self.th["soft"]])
            lay = layout_for(self.m_body, i)
            for sh in list(lay.shapes):
                if not sh.has_text_frame:
                    continue
                if sh.top > Cm(26):   # 쪽 번호(필드 = 전체 장 번호) → 떼어 두고 장표마다 장별 번호 글자로
                    self.pn[i] = copy.deepcopy(sh._element)
                    sh._element.getparent().remove(sh._element)
                elif sh.top < Cm(2):
                    set_text(sh, c["no"] if sh.name == "Rectangle 95" else c["title"])
                    if sh.name != "Rectangle 95":
                        fit_box(sh, c["title"], grow=False)

    def divider(self, i, c):
        s = self.prs.slides.add_slide(layout_for(self.m_div, i))
        for ph in list(s.placeholders):
            ph._element.getparent().remove(ph._element)
        box = copy.deepcopy(self.s_div.shapes[0]._element)
        s.shapes._spTree.append(box)
        b = s.shapes[-1]
        tf = b.text_frame
        p0 = copy.deepcopy(tf.paragraphs[0]._p)
        for pp in list(tf.paragraphs):
            pp._p.getparent().remove(pp._p)
        for k, sec in enumerate(c.get("sections") or [], 1):
            e = copy.deepcopy(p0)
            rs = e.findall("a:r", NS)
            rs[0].find("a:t", NS).text = f"{k}. {sec['title']}"
            for r in rs[1:]:
                e.remove(r)
            tf._txBody.append(e)
        if not c.get("sections"):   # 절이 없는 장(별첨 등) — 문단이 하나도 없는 글 상자는 PowerPoint 가 '복구' 를 요구한다(10-28 확인, R107)
            e = copy.deepcopy(p0)
            for r in e.findall("a:r", NS):
                e.remove(r)
            tf._txBody.append(e)
        if self.style in ("tab", "side"):   # 왼쪽 정렬 스타일 — 장 이름과 같은 줄에서 시작
            b.left = Cm(2.0 if self.style == "tab" else 5.2)
        # 견본 상자는 줄바꿈 없음(wrap=none)·폭 6.5cm 라, 글줄이 더 길면 LibreOffice 는 상자를 양옆으로 넓혀 글이 왼쪽 레일 위로 밀렸다
        # (사용자 2026-10-15 '글자 위치가 이상함' — 사이드 레일 간지 목록 번호가 레일에 걸침). PowerPoint 는 오른쪽으로만 넓힌다.
        # → 줄바꿈 켜고 폭을 오른쪽 여백(1.2cm)까지 — 왼쪽 끝이 두 렌더러에서 같다
        b.text_frame._txBody.bodyPr.set("wrap", "square")
        if self.style not in ("tab", "side"):   # 가운데 정렬 스타일 — 가장 긴 줄을 재서 목록 묶음 전체를 쪽 가운데에(LibreOffice 가 하던 모양을 PowerPoint 에서도)
            sz = next((int(r.get("sz")) / 100 for r in b._element.iter(f"{{{A}}}rPr") if r.get("sz")), 16.0)
            face = next((e.get("typeface") for e in b._element.iter(f"{{{A}}}latin") if e.get("typeface")), "a시월구일2")
            lw = max([text_cm(f"{k}. {sec['title']}", sz, face) for k, sec in enumerate(c.get("sections") or [], 1)] or [6.0])
            b.left = Cm(max(1.2, (PAGE_W - lw) / 2 - 0.25))
        b.width = Cm(PAGE_W) - b.left - Cm(1.2)
        # 절 이름이 아주 길면(쪽 폭 가까이) 줄이 꺾여 목록 높이가 어긋난다 — 가장 긴 줄이 안쪽 폭의 92% 안에 들도록 글자를 줄인다(12pt 까지, R119)
        rs_ = [r for r in b._element.iter(f"{{{A}}}rPr") if r.get("sz")]
        sz0 = int(rs_[0].get("sz")) / 100 if rs_ else 16.0
        face0 = next((e.get("typeface") for e in b._element.iter(f"{{{A}}}latin") if e.get("typeface")), "a시월구일2")
        bpi = b.text_frame._txBody.bodyPr
        inner = Emu(b.width).cm - (int(bpi.get("lIns") if bpi.get("lIns") is not None else 91440) + int(bpi.get("rIns") if bpi.get("rIns") is not None else 91440)) / 360000
        lw0 = max([text_cm(f"{k}. {sec['title']}", sz0, face0) for k, sec in enumerate(c.get("sections") or [], 1)] or [0.0])
        if lw0 > inner * 0.92:
            nsz = max(12.0, sz0 * inner * 0.92 / lw0)
            for r in rs_:
                r.set("sz", str(int(nsz * 100)))
        # 글에 맞춰 늘리기(spAutoFit)를 끄고 높이를 직접 — LibreOffice(결과 썸네일)는 이 상자를 견본 폭(6.5cm)으로 다시 재 '1. 요구사항 / 참조표' 처럼 줄을 바꿨다(10-28, R111)
        bp_ = b.text_frame._txBody.bodyPr
        for k_ in list(bp_):
            if k_.tag.endswith("Autofit") or k_.tag.endswith("AutoFit"):
                bp_.remove(k_)
        bp_.insert(0, bp_.makeelement(f"{{{A}}}noAutofit", {}))
        b.height = Cm(0.4 + max(1, len(c.get("sections") or [])) * DIV_LIST_PITCH)
        # 다크 키비주얼 간지는 흰 바탕 + 위쪽 띠(band_bg) — 목록은 띠 아래라 먹색 그대로(2026-10-15, 예전엔 위쪽 색 블록이라 흰 글씨)
        if self.bgs.get(f"div{i}"):
            # 절 목록이 끝나는 높이 — 배경 그림이 목록을 덮지 않게(절 6개면 16cm 넘게 내려와 카드 그림과 겹쳤다, 10-28 R107)
            n_sec = len(c.get("sections") or [])
            list_bottom = Emu(b.top).cm + 0.13 + n_sec * DIV_LIST_PITCH + 0.15
            set_bg(s, band_bg(self.bgs[f"div{i}"], self.th["point"]) if self.style in DARK_STYLES
                   else style_bg(faded(self.bgs[f"div{i}"]), self.style, "div", self.th["point"], list_bottom))   # 간지 배경 투명도 65%(사용자 10-29) — 다크 띠는 흰 장 제목이 얹혀 그대로
        elif self.style in DARK_STYLES:   # 배경을 못 구했으면 짙은 남색 띠라도 — 띠 위 흰 장 제목이 흰 바탕에 묻히지 않게(도형으로 덮으면 레이아웃의 장 제목이 가려진다)
            set_bg(s, band_bg(None, self.th["point"]))
        return s

    # 본문 — 견본 장표를 복제해 글을 채우고, 블록은 아래로 쌓는다
    def body_page(self, i, c, pg, cont=None):
        s = self.prs.slides.add_slide(layout_for(self.m_body, i))
        for ph in list(s.placeholders):
            ph._element.getparent().remove(ph._element)
        src = self.s_body
        head = [el for el in src.shapes._spTree.iterchildren() if el.tag.split("}")[1] in ("sp", "grpSp", "cxnSp")]
        block_els = []
        for el in head:
            off = el.find(".//a:off", NS)
            y = int(off.get("y")) if off is not None else 0
            (block_els if y >= int(Cm(7.3)) else []).append(el)
            if y < int(Cm(7.3)):
                s.shapes._spTree.append(copy.deepcopy(el))
        # 머리: 경로·제목·요구사항
        rect2 = sorted([x for x in s.shapes if x.name == "Rectangle 2"], key=lambda x: x.top)
        cont = cont or pg.get("_cont")   # 그리기 전에 나눈 '(계속)' 쪽(paginate·trim_overflow)
        title = (re.sub(r"\s*\(\d+/\d+\)\s*$", "", str(pg.get("title") or "").strip()) + " (계속)") if cont else str(pg.get("title") or "").strip()
        if rect2:   # 경로는 AI 글을 믿지 않고 목차에서 만든다(장 이름이 섞여 목차와 어긋났다 — 운영 점검 2026-10-14). 가이드 견본은 fixed_path
            set_text(rect2[0], pg["fixed_path"] if "fixed_path" in pg else (page_path(c, title) or str(pg.get("path") or "")))
        if len(rect2) > 1:
            set_text(rect2[1], title)
            fit_one_line(rect2[1], title, 14.6)
            point_number(rect2[1], self.th["point"])   # 제목은 먹색, 번호만 포인트
        tag = named(s.shapes, "요구사항 꼬리표", 0)
        ids = [x.strip() for x in re.split(r"[,\s]+", str(pg.get("req") or "")) if x.strip()]
        req = ", ".join(ids[:3]) + (f" 외 {len(ids) - 3}" if len(ids) > 3 else "")   # 길면 경로 줄을 덮는다
        if tag is not None:
            if req:
                rs = tag.text_frame.paragraphs[0].runs
                if len(rs) > 1:
                    rs[1].text = "   " + req
                w = text_cm("요구사항   " + req, 8) + 0.7
                tag.left, tag.width = Cm(18.15 - w), Cm(w)
            else:
                tag._element.getparent().remove(tag._element)
        # 도입 2문장 + 강조
        lead = [x for x in s.shapes if x.name == "Rectangle 95" and x.height > Cm(1.5)]
        if lead:
            put_lead(lead[0], [str(t) for t in (pg.get("lead") or [])][:2], str(pg.get("strong") or ""), self.th["point"])
        band = named(s.shapes, "Text Box 166", 0)
        if band is not None:
            set_text(band, str(pg.get("band") or ""))
        # 블록
        y = 7.55
        rest = []
        blocks = [b for b in pg.get("blocks") or [] if not block_empty(b)]
        us = units(blocks)
        tot = sum(unit_height(u) for u in us)
        gap = 0.55
        g_min, m_bot = (TIGHT_GAP, TIGHT_BOTTOM) if pg.get("_tight") else (0.25, 0.4)   # 촘촘한 쪽(split_page 가 정함, R117)
        if len(us) > 1 and tot + gap * (len(us) - 1) > BODY_BOTTOM - y:   # 조금 넘치면 간격을 줄여 한 쪽에(최소 0.25)
            gap = max(g_min, (BODY_BOTTOM + m_bot - y - tot) / (len(us) - 1))
        elif len(us) > 1 and (tot + gap * (len(us) - 1)) / (BODY_BOTTOM - y) >= 0.75:   # 조금 빈 쪽은 남는 높이를 간격에 고르게(최대 1.2cm) — 아래만 비지 않게
            gap = min(1.2, (BODY_BOTTOM - y - tot) / (len(us) - 1))
        for ui, u in enumerate(us):
            h = unit_height(u)
            if y + h > BODY_BOTTOM + m_bot + 1e-6 and ui:   # 바닥 여유 0.4cm 까지 — 블록 하나만 담긴 '(계속)' 쪽을 줄인다(쪽 번호·로고는 26.6cm)
                rest = [b for uu in us[ui:] for b in uu]
                break
            if len(u) == 1:
                self.block(s, block_els, u[0], y)
            else:   # 2단 — 왼쪽 칸은 제자리, 오른쪽 칸은 반쪽 폭 + 0.5 만큼 옮겨 그린다
                for j, b in enumerate(u):
                    self.block(s, block_els, b, y, dx=j * (HW + 0.5), W=HW - (BODY_T - BODY_G))
            y += h + gap
        self.page_number(s, i, c)
        return s, rest

    def block(self, s, els, blk, y, dx=0.0, W=None):
        dy = Cm(y - 7.55)
        small = str(blk.get("small") or "").strip()
        bar = str(blk.get("bar") or "").strip()
        bullets = [str(b).strip().lstrip("·•-▪ ") for b in (blk.get("bullets") or []) if str(b).strip()]
        fd = fig_data(blk)
        if fd:
            return self.fig_block(s, els, blk, y, fd, small, bullets, dx, W)
        if W:   # 2단 표 — 소제목만 견본에서, 표는 반쪽 폭
            return self.half_table(s, els, blk, y, dx, W)
        for el in els:
            e = copy.deepcopy(el)
            nm = e.find(".//p:cNvPr", NS).get("name")
            off = e.find(".//a:off", NS)
            oy = int(off.get("y"))
            if nm in ("TextBox 19", "육각형 54") and oy < int(Cm(9.0)) and not small:
                continue   # 작은 제목이 없으면 뺀다
            if e.tag.endswith("grpSp") and not bar:
                continue   # 막대 제목이 비면 빈 회색 막대를 그리지 않는다(결과 14·22·28·30쪽, 2026-10-14)
            shift = dy - (Cm(0.64) if (not small and oy >= int(Cm(9.0))) else 0) - (Cm(0.96) if (not bar and oy >= int(Cm(9.9))) else 0)
            off.set("y", str(oy + int(shift)))
            s.shapes._spTree.append(e)
            sh = s.shapes[-1]
            if nm == "Rectangle 95":
                set_text(sh, str(blk.get("head") or ""))
            elif nm == "TextBox 19" and oy < int(Cm(9.0)):
                set_text(sh, small)
            elif sh.shape_type == 6:
                for c in walk(sh.shapes):
                    if c.has_text_frame and c.name == "TextBox 19":
                        set_text(c, str(blk.get("bar") or ""))
            elif nm == "AutoShape 91":
                tb = blk.get("table")
                has_tb = isinstance(tb, dict) and tb.get("cols") and tb.get("rows")
                if bullets:
                    put_bullets(sh, bullets)
                    sh.height = Cm(bullet_lines(bullets) * BL_LH[0] + 0.1)
                    top = sh.top + sh.height + Cm(0.25)
                else:   # 글머리 없이 표만 — 빈 글 상자를 빼고 그 자리에 표
                    top = sh.top
                    sh._element.getparent().remove(sh._element)
                if has_tb:
                    add_table(s, tb, sh.left, top, sh.width, self.th)

    def half_table(self, s, els, blk, y, dx, W):
        for el in els:
            nm = el.find(".//p:cNvPr", NS).get("name")
            if nm not in ("Rectangle 95", "육각형 42"):
                continue
            e = copy.deepcopy(el)
            off = e.find(".//a:off", NS)
            off.set("y", str(int(off.get("y")) + int(Cm(y - 7.55))))
            off.set("x", str(int(off.get("x")) + int(Cm(dx))))
            s.shapes._spTree.append(e)
            if nm == "Rectangle 95":
                set_text(s.shapes[-1], str(blk.get("head") or ""))
                s.shapes[-1].width = Cm(W)
        add_table(s, blk["table"], Cm(BODY_T + dx), Cm(y + 0.91), Cm(W), self.th)

    def fig_block(self, s, els, blk, y, fd, small, bullets, dx=0.0, W=None):
        """도식 블록 — 견본의 소제목·작은 제목·막대 제목을 그대로 쓰고, 그 아래에 도식, 남는 글은 도식 밑에"""
        bar = str(blk.get("bar") or "").strip()
        nxt = y + (1.55 if small else 0.91)          # 견본에서 막대 제목이 놓이는 자리(작은 제목 없으면 0.64 위)
        after_bar = nxt + (0.96 if bar else 0)
        for el in els:
            e = copy.deepcopy(el)
            nm = e.find(".//p:cNvPr", NS).get("name")
            off = e.find(".//a:off", NS)
            oy = int(off.get("y"))
            is_small = nm in ("TextBox 19", "육각형 54") and oy < int(Cm(9.0))
            if (is_small and not small) or nm == "AutoShape 91" or (e.tag.endswith("grpSp") and not bar):
                continue
            off.set("y", str(oy + int(Cm(y - 7.55)) - (int(Cm(0.64)) if (not small and oy >= int(Cm(9.0))) else 0)))
            if dx:
                off.set("x", str(int(off.get("x")) + int(Cm(dx))))
            s.shapes._spTree.append(e)
            sh = s.shapes[-1]
            if nm == "Rectangle 95":
                set_text(sh, str(blk.get("head") or ""))
                if W:
                    sh.width = Cm(W)
            elif is_small:
                if sh.has_text_frame:
                    set_text(sh, small)
            elif sh.shape_type == 6:
                for c in walk(sh.shapes):
                    if c.has_text_frame and c.name == "TextBox 19":
                        set_text(c, bar)
        draw_fig(s.shapes._spTree, fd[0], fd[1], BODY_T + dx, after_bar, self.th, W,
                 pic=lambda blob, px, py, pw, ph, nm: s.shapes._spTree.append(self._pic_el(s, blob, Cm(px), Cm(py), Cm(pw), Cm(ph), nm)))
        if bullets:   # 도식 밑 보충 글 — 견본 본문 글 상자를 그대로 복제
            src = next((el for el in els if el.find(".//p:cNvPr", NS).get("name") == "AutoShape 91"), None)
            if src is not None:
                e = copy.deepcopy(src)
                s.shapes._spTree.append(e)
                sh = s.shapes[-1]
                put_bullets(sh, bullets)
                sh.top = Cm(after_bar + fig_height(fd[0], fd[1], W) + 0.35)
                sh.height = Cm(bullet_lines(bullets) * BL_LH[0] * (FW / W if W else 1) + 0.1)
                if W:
                    sh.left, sh.width = Cm(BODY_T + dx), Cm(W)

    def page_number(self, s, i, c):
        n = self.pageno[c["no"]] = self.pageno.get(c["no"], 0) + 1
        if self.pn.get(i) is not None:
            s.shapes._spTree.append(copy.deepcopy(self.pn[i]))
            set_text(s.shapes[-1], f"{c['no']} - {n}")
        return n

    # 목차
    def toc(self, i, c, rows_of):
        """rows_of = [(1단계 글, [(2단계 글, 쪽 글자)…])…] — 20줄이 넘으면 다음 장으로"""
        src = self.s_toc
        boxes = [x for x in src.shapes if x.has_text_frame and x.text_frame.text.strip()]
        pg_box, it_box = (boxes[0], boxes[1]) if boxes[0].left > boxes[1].left else (boxes[1], boxes[0])
        P_L1 = copy.deepcopy(it_box.text_frame.paragraphs[0]._p)
        P_L2 = copy.deepcopy(it_box.text_frame.paragraphs[1]._p)
        P_PG = copy.deepcopy(pg_box.text_frame.paragraphs[1]._p)
        line = next(x for x in src.shapes if x.name == "Line 58")._element
        pages, cur, n = [], [], 0
        for g in rows_of:
            need = 1 + len(g[1]) + (1 if cur else 0)
            if cur and n + need > 20:
                pages.append(cur)
                cur, n = [], 0
                need -= 1
            cur.append(g)
            n += need
        if cur:
            pages.append(cur)
        made = []
        for groups in pages:
            s = self.prs.slides.add_slide(layout_for(self.m_toc, i))
            for ph in list(s.placeholders):
                ph._element.getparent().remove(ph._element)
            # 줄마다 상자 하나씩 — 장 이름·쪽번호·점선이 같은 줄 가운데(y)에 선다. 상자 두 개에 문단을 흘려 넣으면
            # 렌더러·서체마다 첫 줄 기준선이 달라 쪽번호·점선이 글과 어긋났다(10-15 사용자 '텍스트랑 우측 페이지랑 수평이 안 맞고 라인도')
            # 점선은 글 길이와 상관없이 같은 폭(글 시작 ~ 쪽번호 끝)으로 깔고, 글·쪽번호 상자에 흰 바탕 + 좌우 여백을 줘서
            # 위에서 가린다 — 사용자가 글만 고쳐도 상자가 글 폭을 따라가(wrap none + spAutoFit) 점선 길이를 다시 맞출 일이 없다(10-16)
            x_dot0 = vis_left(it_box)
            x_dot1 = abs_box(pg_box)[0] + abs_box(pg_box)[2] - _lins(pg_box)   # 쪽번호 오른쪽 끝(오른쪽 정렬 기준)

            def put(tmpl_box, p_el, row, txt, right=None):
                e = copy.deepcopy(tmpl_box._element)
                body = e.find(".//p:txBody", NS)
                for x in body.findall("a:p", NS):
                    body.remove(x)
                _one_line(p_el)
                p_el.find("a:pPr", NS).set("algn", "r" if right else "l")   # 글이 늘면 점선 쪽(안쪽)으로 자란다
                body.append(p_el)
                bp = body.find("a:bodyPr", NS)
                bp.set("anchor", "ctr"); bp.set("tIns", "0"); bp.set("bIns", "0")
                bp.set("lIns", str(int(Cm(TOC_PAD)))); bp.set("rIns", str(int(Cm(TOC_PAD if right else TOC_PAD - 0.1)))); bp.set("wrap", "none")   # 글 쪽은 점선 끊김 자리(평균 0.1)만큼 덜어 양쪽 틈을 같게
                for k in list(bp):
                    if k.tag.endswith("Autofit") or k.tag.endswith("AutoFit"):
                        bp.remove(k)
                bp.insert(0, bp.makeelement(f"{{{A}}}spAutoFit", {}))
                sp = e.find("p:spPr", NS)
                for f in sp.findall("a:noFill", NS) + sp.findall("a:solidFill", NS):
                    sp.remove(f)
                fill = sp.makeelement(f"{{{A}}}solidFill", {})
                fill.append(fill.makeelement(f"{{{A}}}srgbClr", {"val": "FFFFFF"}))
                sp.find("a:prstGeom", NS).addnext(fill)
                # 'Ⅰ' 는 서체에 없어 대체 글꼴로 그려진다 — 라틴 I 로 재고 대체 글꼴 옆 여백(0.15)을 더해야 실제 폭에 맞는다(PowerPoint 실측)
                # 글 크기는 그 문단의 실제 크기로(견본 15.5pt) + 12% 여유 — 14pt 로 재 상자가 좁았다. PowerPoint 는 wrap=none 이라 넘겨도
                # 한 줄로 그리지만, 결과 화면 썸네일을 만드는 LibreOffice 는 상자 폭에서 줄을 바꿔 글이 겹쳤다(10-28 사용자, R111)
                pt = next((int(r.get("sz")) / 100 for r in p_el.iter(f"{{{A}}}rPr") if r.get("sz")), 14.0)
                # 서체도 그 문단의 것으로 — 장 줄은 굵은 단계(a시월구일3)인데 본문 단계로 재 '1. 사업에 대한 이해' 의 '이해' 가 다음 줄로 꺾였다(10-28 썸네일, R119)
                face = next((e.get("typeface") for e in p_el.iter(f"{{{A}}}latin") if e.get("typeface")), "a시월구일2")
                w = text_cm(txt.translate(ROMAN_LATIN), pt, face) * 1.12 + (0.15 if txt != txt.translate(ROMAN_LATIN) else 0) + 2 * TOC_PAD - (0 if right else 0.1)
                x = (right - TOC_PAD - (w - 2 * TOC_PAD)) if right else (x_dot0 - TOC_PAD)
                e.find(".//a:off", NS).set("x", str(int(Cm(x))))
                e.find(".//a:off", NS).set("y", str(int(Cm(TOC_Y0 + row * TOC_PITCH - TOC_PITCH / 2))))
                e.find(".//a:ext", NS).set("cx", str(int(Cm(w))))
                e.find(".//a:ext", NS).set("cy", str(int(Cm(TOC_PITCH))))
                s.shapes._spTree.append(e)
            row = 0
            for gi, (l1, l2s) in enumerate(groups):
                if gi:
                    row += 1
                put(it_box, _para(P_L1, [l1[0], l1[1]]), row, l1[0] + l1[1])
                row += 1
                for t2, pno in l2s:
                    if pno:   # 점선을 먼저 깔아 글·쪽번호 상자 밑에 둔다
                        e = copy.deepcopy(line)
                        e.find(".//a:off", NS).set("x", str(int(Cm(x_dot0))))
                        e.find(".//a:off", NS).set("y", str(int(Cm(TOC_Y0 + row * TOC_PITCH))))   # 줄 상자 가운데와 같은 y(실측: 점선·글·쪽번호 가운데 차 0~0.5px)
                        e.find(".//a:ext", NS).set("cx", str(int(Cm(x_dot1 - x_dot0))))
                        e.find(".//a:ext", NS).set("cy", "0")
                        s.shapes._spTree.append(e)
                    put(it_box, _para(P_L2, ["    ", t2]), row, "    " + t2)
                    if pno:
                        put(pg_box, _para(P_PG, [pno]), row, pno, right=x_dot1)
                    row += 1
            # 이 목차 쪽의 글 끝(마지막 줄 상자 아래) — 쪽마다 배경을 이 높이에 맞춰 가린다(R107)
            self.__dict__.setdefault("toc_bottom", {})[s.slide_id] = TOC_Y0 + (max(1, row) - 1) * TOC_PITCH + TOC_PITCH / 2
            made.append(s)
        return made

    def build(self, chapters_pages, out):
        self.project_text()
        self.chapter_layouts()
        # 목차 배경 — 마스터의 쪽 전체 그림 한 장을 모든 목차 쪽이 같이 써서, 줄이 많은 쪽은 아래쪽 그림과 글이 겹쳤다(10-28 사용자, R107).
        # 그림은 마스터에서 떼고, 목차 쪽마다 그 쪽 글이 끝나는 높이까지 흰색으로 가린 배경을 쪽 배경으로 넣는다(아래 TOC 를 만든 뒤)
        self.toc_bottom = {}
        toc_pic = next((x for x in walk(self.m_toc.shapes) if x.shape_type == 13 and x.width > Cm(15)), None)
        toc_src = None
        if toc_pic is not None:
            rid = toc_pic._element.find(".//a:blip", NS).get(f"{{{R}}}embed")
            toc_src = faded(self.bgs["toc"] if self.bgs.get("toc") else toc_pic.part.related_part(rid).blob)   # 목차 배경 투명도 65%(사용자 10-29)
            toc_src = compose(toc_src, 0.85, 0.42, 0.5, 0.6, 0.6) if self.bgs.get("toc") else toc_src
        cover = self.cover()
        order = [cover]
        toc_rows, chapter_slides, chapter_kinds = [], [], []
        for i, c in enumerate(self.o["chapters"]):
            sl = [self.divider(i, c)]
            kinds = ["div"]
            rows = []
            pages = chapters_pages.get(i) or []
            if True:
                by_sec = {}
                if c["no"] == "※":   # 별첨 — AI 없이 엔진이 쪽을 만든다(요구사항 대응표·약어표·빈 서식, R117). 예전엔 간지 목록 줄만 있었다
                    pages = appendix_pages(self.o, c, chapters_pages, self.req_at, self.item_at)
                    self.appendix = len(pages)
                else:
                    pages = merge_item_pages([fit_page(strip_marks(dict(pg))) for pg in pages])
                    pages = trim_overflow(pages, self.trimmed)   # 넘친 쪽은 끝 행을 다음 쪽으로 · 다음 쪽이 없으면 '(계속)' 쪽을 새로(지우지 않는다, R117)
                for pi, pg in enumerate(pages):   # 넘칠 블록을 같은 항목 다음 쪽 앞으로(자리가 있을 때) — 블록 하나뿐인 '(계속)' 쪽이 생겼다(3차 검수)
                    if page_fill(pg) <= 1.02 or pi + 1 >= len(pages):
                        continue
                    nxt = pages[pi + 1]
                    same = re.sub(r"\s*\(\d+/\d+\)\s*$", "", str(pg.get("title") or "")) == re.sub(r"\s*\(\d+/\d+\)\s*$", "", str(nxt.get("title") or ""))
                    while same and page_fill(pg) > 1.02 and len(pg.get("blocks") or []) > 1:
                        b = pg["blocks"][-1]
                        trial = dict(nxt, blocks=[dict(b, half=False)] + list(nxt.get("blocks") or []))
                        if page_fill(trial) > 1.02:
                            break
                        pg["blocks"] = pg["blocks"][:-1]
                        nxt["blocks"] = trial["blocks"]
                if c["no"] != "※":   # 그리기 전에 쪽을 나누고(넘치는 단위 → '(계속)'), 반쯤 빈 뒤쪽은 합치거나 고르게(R117)
                    pages = balance_pages(paginate(pages))
                for pg in pages:
                    rest, cont = None, None
                    s, rest = self.body_page(i, c, pg)
                    sl.append(s)
                    kinds.append(str(pg.get("title") or "") + (" (계속)" if pg.get("_cont") else ""))
                    first = f"{c['no']}-{self.pageno[c['no']]}"
                    if c["no"] != "※" and not pg.get("_cont"):   # 별첨 요구사항 대응표가 쓸 자리 — 요구사항 번호·항목 → 첫 쪽
                        key_ = re.sub(r"\s*\(\d+/\d+\)\s*$", "", str(pg.get("title") or "").strip())
                        self.item_at.setdefault((i, key_), first)
                        for rid in re.findall(r"[A-Z]{2,4}-\d{2,4}", str(pg.get("req") or "")):
                            if first not in [x[0] for x in self.req_at.setdefault(rid, [])]:
                                self.req_at[rid].append((first, key_))
                    k = 2
                    while rest:
                        s, rest2 = self.body_page(i, c, dict(pg, blocks=rest), cont=f"{k}")
                        sl.append(s)
                        kinds.append(f"{pg.get('title') or ''} ({k})")
                        rest, k = rest2, k + 1
                    item = re.sub(r"\s*\(\d+/\d+\)\s*$", "", str(pg.get("title") or "").strip())
                    m = re.match(r"(\d+)\.\d+", item)
                    k_ = int(m.group(1)) if m else 0
                    by_sec.setdefault(k_, [])
                    if item not in [x[0] for x in by_sec[k_]]:
                        by_sec[k_].append((item, first))
                for k, sec in enumerate(c.get("sections") or [], 1):
                    rows.append(((f"{k}. ", sec["title"]), by_sec.get(k, [])))
            toc_rows.append((i, c, rows))
            chapter_slides.append(sl)
            chapter_kinds.append(kinds)
        tocs = []
        for i, c, rows in toc_rows:
            tocs += self.toc(i, c, rows)
        if toc_pic is not None and toc_src:
            rid = toc_pic._element.find(".//a:blip", NS).get(f"{{{R}}}embed")
            toc_pic._element.getparent().remove(toc_pic._element)
            try:
                toc_pic.part.drop_rel(rid)   # 떼어 낸 그림 부품은 파일에서도 뺀다
            except Exception:
                pass
            for s in tocs:
                set_bg(s, text_veil(toc_src, self.toc_bottom.get(s.slide_id, PAGE_H)))
        order += tocs + [x for sl in chapter_slides for x in sl]
        # 결과 화면 캔버스용 — 쪽마다 종류·장(章)·제목(장 줄 = 표지·목차 한 줄 + 장마다 간지·본문 한 줄)
        self.pages = [{"n": 1, "kind": "cover", "ch": "표지 · 목차", "title": "표지"}]
        self.pages += [{"n": 2 + k, "kind": "toc", "ch": "표지 · 목차", "title": f"목차 {k + 1}"} for k in range(len(tocs))]
        for i, kinds in enumerate(chapter_kinds):
            c = self.o["chapters"][i]
            for t in kinds:
                self.pages.append({"n": len(self.pages) + 1, "kind": "div" if t == "div" else "body", "ch": f"{c['no']} {c['title']}",
                                   "title": f"간지 · {c['title']}" if t == "div" else t})
        for k, s in enumerate(order):
            move_slide(self.prs, s, k)
        for s in (self.s_body, self.s_cover, self.s_toc, self.s_div):
            drop_slide(self.prs, s)
        refont(self.prs)
        widen_body(self.prs)   # 본문 좌우 = 머리 영역 좌우 끝(R125)
        self.prs.save(out)
        return len(order)


def _para(tmpl, parts):
    e = copy.deepcopy(tmpl)
    rs = e.findall("a:r", NS)
    for r in rs[len(parts):]:
        e.remove(r)
    rs = e.findall("a:r", NS)
    while len(rs) < len(parts):
        n = copy.deepcopy(rs[-1])
        rs[-1].addnext(n)
        rs = e.findall("a:r", NS)
    for r, t in zip(rs, parts):
        r.find("a:t", NS).text = t
    return e


TOC_PITCH = 0.893   # 목차 한 줄 높이(cm) — 점선도 이 간격으로 놓는다
TOC_PAD = 0.4       # 목차 글·쪽번호 상자 좌우 여백(cm, 약 15px) — 흰 바탕이 점선을 이만큼 더 가려 글과 점선 사이가 뜬다
ROMAN_LATIN = str.maketrans({"Ⅰ": "I", "Ⅱ": "II", "Ⅲ": "III", "Ⅳ": "IV", "Ⅴ": "V", "Ⅵ": "VI", "Ⅶ": "VII", "Ⅷ": "VIII", "Ⅸ": "IX", "Ⅹ": "X"})
TOC_Y0 = 5.72       # 첫 줄 가운데 y(cm) — 견본 목록 상자(top 5.16 + 안쪽 여백 0.127)의 첫 줄 가운데. 줄 상자·쪽번호·점선이 모두 이 y 를 쓴다


def _one_line(p):
    """줄 상자 안 문단 — 줄 간격 100%·앞뒤 간격 0(상자 가운데 정렬이 렌더러와 무관하게 맞게)"""
    pPr = p.find("a:pPr", NS)
    if pPr is None:
        pPr = p.makeelement(f"{{{A}}}pPr", {})
        p.insert(0, pPr)
    for old in pPr.findall("a:lnSpc", NS) + pPr.findall("a:spcBef", NS) + pPr.findall("a:spcAft", NS):
        pPr.remove(old)
    ln = pPr.makeelement(f"{{{A}}}lnSpc", {})
    ln.append(ln.makeelement(f"{{{A}}}spcPct", {"val": "100000"}))
    pPr.insert(0, ln)



def page_path(c, title):
    """'1.2 …' 제목 → '1. 절 이름 > 1.2 …' (목차 절 이름 그대로)"""
    m = re.match(r"(\d+)\.\d+", title)
    secs = c.get("sections") or []
    if not m or not (0 < int(m.group(1)) <= len(secs)):
        return ""
    k = int(m.group(1))
    item = re.sub(r"\s*\(\d+(/\d+)?\)\s*$", "", title)   # f-string 안 역슬래시는 3.12 미만에서 문법 오류 — 밖에서
    return f"{k}. {secs[k - 1]['title']} > {item}"


def point_number(sh, col):
    """'1.1 사업 배경' → 번호 '1.1' 만 포인트 색(나머지는 양식의 먹색 그대로)"""
    ps = sh.text_frame.paragraphs
    if not ps or not ps[0].runs:
        return
    r = ps[0].runs[0]
    m = re.match(r"^(\d+(?:\.\d+)*\.?)(\s+.*)$", r.text, re.S)
    if not m:
        return
    e = copy.deepcopy(r._r)
    e.find("a:t", NS).text = m.group(1)
    _recolor_el(e, col)
    r.text = m.group(2)
    r._r.addprevious(e)


def fit_one_line(sh, text, width_cm, start=18, low=12):
    """제목이 한 줄에 들어가게 글자 크기를 줄인다(G마켓 산스 굵게 — 글꼴이 없으면 글자 종류로 어림)"""
    pt = start
    while pt > low and text_cm(text, pt * TITLE_SCALE[0], TITLE0[1]) * 1.04 > width_cm:
        pt -= 1
    for r in sh.text_frame.paragraphs[0].runs:
        r.font.size = Pt(pt)


def fit_box(sh, text, center=False, grow=True, low=0.7, margin=1.06):
    """한 줄 글 상자를 글 폭에 맞춘다 — ① 상자를 넓히고(가운데 정렬이면 양쪽, 아니면 오른쪽 · 쪽 여백 1.2cm 까지) ② 그래도 넘치면 글자를 줄인다(원래의 70% 까지).
    LibreOffice(결과 화면 썸네일)는 wrap 과 상관없이 상자 폭에서 줄을 바꿔 아래 줄과 겹쳤다(10-28 사용자, R119). 폭은 그 문단 서체 파일로 잰다"""
    rs = [r for p in sh.text_frame.paragraphs for r in p.runs]
    if not rs:
        return
    r0 = rs[0]._r.find("a:rPr", NS)
    pt = int(r0.get("sz")) / 100 if r0 is not None and r0.get("sz") else 18.0
    lat = r0.find("a:latin", NS) if r0 is not None else None
    face = lat.get("typeface") if lat is not None else "a시월구일2"
    scale = TITLE_SCALE[0] if face == TITLE0[1] else 1.0
    bp = sh.text_frame._txBody.bodyPr
    ins = (int(bp.get("lIns") if bp.get("lIns") is not None else 91440) + int(bp.get("rIns") if bp.get("rIns") is not None else 91440)) / 360000
    need = lambda p_: text_cm(text.translate(ROMAN_LATIN), p_ * scale, face) * margin + ins
    if need(pt) <= sh.width / 360000:
        return
    if grow:
        x, w = sh.left / 360000, sh.width / 360000
        if center:
            half = min((PAGE_W - 2.4) / 2, max(w / 2, need(pt) / 2))
            cx = x + w / 2
            half = min(half, cx - 1.2, PAGE_W - 1.2 - cx)
            sh.left, sh.width = Cm(cx - half), Cm(2 * half)
        else:
            sh.width = Cm(min(PAGE_W - 1.2 - x, max(w, need(pt))))
    p_ = pt
    while p_ > pt * low and need(p_) > sh.width / 360000:
        p_ -= 0.5
    if p_ != pt:
        for r in rs:
            r.font.size = Pt(p_)


def split_title(name):
    """표지 제목 두 줄 — 1줄(32pt) 14자·2줄(42pt) 11자 안. 넘치면 작은 글자로."""
    w = name.split()
    best = None
    for k in range(1, len(w)):
        a, b = " ".join(w[:k]), " ".join(w[k:])
        over = max(0, len(a) - 14) + max(0, len(b) - 11)
        if best is None or over < best[0] or (over == best[0] and abs(len(a) - len(b)) < abs(len(best[1]) - len(best[2]))):
            best = (over, a, b)
    if not best:
        return name, "", len(name) > 11
    return best[1], best[2], best[0] > 0


def put_lead(sh, sentences, strong, point=None):
    pe = sh.text_frame.paragraphs[0]._p
    rs = pe.findall("a:r", NS)
    norm = copy.deepcopy(rs[0]) if rs else None
    bold = next((copy.deepcopy(r) for r in rs if (r.find("a:rPr", NS) is not None and r.find("a:rPr", NS).get("b") == "1")), None)
    for el in pe.findall("a:r", NS) + pe.findall("a:br", NS):
        pe.remove(el)
    for p_ in sh.text_frame.paragraphs[1:]:
        p_._p.getparent().remove(p_._p)
    if norm is None:
        return
    end = pe.find("a:endParaRPr", NS)

    def add(e):
        (end.addprevious(e) if end is not None else pe.append(e))

    for k, sent in enumerate(sentences):
        sent = sent.strip()
        if k:   # 문장 사이는 줄바꿈 없이 빈칸 하나로 이어 쓴다(사용자 2026-10-22 "마침표에서 줄 바꾸지 않기로")
            sent = " " + sent
        parts = [(sent, False)]
        if k == 0 and strong and strong in sent:
            a, b = sent.split(strong, 1)
            parts = [(a, False), (strong, True), (b, False)]
        for t, is_b in parts:
            if not t:
                continue
            e = copy.deepcopy(bold if (is_b and bold is not None) else norm)
            e.find("a:t", NS).text = t
            if is_b and bold is None:
                e.find("a:rPr", NS).set("b", "1")
            if is_b and point:   # 강조 어구만 포인트 색
                _recolor_el(e, point)
            add(e)


def put_bullets(sh, items):
    body = sh.text_frame._txBody
    ps = body.findall("a:p", NS)
    tmpl = copy.deepcopy(ps[0])
    for x in ps:
        body.remove(x)
    for it in items or [""]:
        e = copy.deepcopy(tmpl)
        rs = e.findall("a:r", NS)
        if rs:
            rs[0].find("a:t", NS).text = it
            for r in rs[1:]:
                e.remove(r)
        body.append(e)


def bullet_lines(items):
    return sum(max(1, math.ceil(text_cm(t, 9) / 14.6)) for t in items) or 1


def block_height(blk, W=None):
    fd = fig_data(blk)
    if fd:   # 도식 블록 — 소제목(+작은 제목) → (막대 제목) → 도식 → (보충 글)
        h = 0.91 + (0.64 if str(blk.get("small") or "").strip() else 0) + (0.96 if str(blk.get("bar") or "").strip() else 0)
        h += fig_height(fd[0], fd[1], W) + 0.2
        bl = [str(b) for b in (blk.get("bullets") or []) if str(b).strip()]
        return h + (0.15 + bullet_lines(bl) * BL_LH[0] * (FW / W if W else 1) + 0.1 if bl else 0)
    if W:   # 2단 표 — 소제목 + 표(칸이 좁아 줄바꿈이 는다)
        tb = blk.get("table")
        return 0.91 + (table_height(tb, W) if isinstance(tb, dict) and tb.get("rows") else 0)
    h = 0.9 + (0.64 if str(blk.get("small") or "").strip() else 0) + (0.96 if str(blk.get("bar") or "").strip() else 0)
    bl = [str(b) for b in (blk.get("bullets") or []) if str(b).strip()]
    tb = blk.get("table")
    has_tb = isinstance(tb, dict) and tb.get("rows")
    h += (bullet_lines(bl) * BL_LH[0] + 0.1 + (0.25 if has_tb else 0)) if bl else 0
    if has_tb:
        h += table_height(tb, 14.9)
    return h


HALF_KINDS = ("kpi", "cards", "rows", "process", "strategy", "effect", "compare", "table", "photo")   # 허브는 반쪽에서 노드가 1cm 아래로 좁아져 뺀다


def half_ok(blk):
    """반쪽 폭(약 6.3cm)에 들어가도 읽히는가 — 구성마다 조건(3차 검수: 반쪽에 카드 3장이 들어가 칸이 2cm)"""
    k = str(blk.get("kind") or "")
    f = blk.get("fig") if isinstance(blk.get("fig"), dict) else {}
    if k not in HALF_KINDS:
        return False
    if k == "table":
        tb = blk.get("table") if isinstance(blk.get("table"), dict) else {}
        return bool(tb.get("rows")) and len(tb.get("cols") or []) <= 3
    if not fig_data(blk):
        return False
    if k in ("cards", "kpi"):
        return len(f.get("cards") or f.get("items") or []) <= 2
    if k == "process":
        return _vproc(f, HW) and len(f.get("steps") or []) <= 5
    return True
HW = (BODY_G + 15.0 - BODY_G - 0.5) / 2   # 2단 한 칸 폭(G 기준 — 오른쪽 칸 소제목도 아이콘부터)


def is_half(blk):
    return bool(blk.get("half")) and half_ok(blk)


def units(blocks):
    """그릴 단위 — half 블록이 둘 이어지면 한 단위(2단), 나머지는 한 블록 한 단위"""
    out, i = [], 0
    while i < len(blocks):
        if is_half(blocks[i]) and i + 1 < len(blocks) and is_half(blocks[i + 1]):
            out.append([blocks[i], blocks[i + 1]])
            i += 2
        else:
            out.append([dict(blocks[i], half=False)])
            i += 1
    return out


def unit_height(u):
    if len(u) == 1:
        return block_height(u[0])
    return max(block_height(b, HW - (BODY_T - BODY_G)) for b in u)


def strip_marks(v):
    """AI 가 글에 남긴 강조 표시(**)를 지운다 — 도입 문장에 '**전담 조직**'이 그대로 찍혔다(10-30 809c 5곳·d448 1곳, R145). 쪽 전체(블록·표 안까지)"""
    if isinstance(v, str):
        return v.replace("**", "")
    if isinstance(v, list):
        return [strip_marks(x) for x in v]
    if isinstance(v, dict):
        return {k: (x if k.startswith("_") else strip_marks(x)) for k, x in v.items()}
    return v


def fit_page(pg):
    """넘치는 쪽(100% 초과)은 이어진 작은 블록 둘을 2단으로 묶는다 — AI 가 half 지시를 거의 안 따랐다(3차 시험 2단 0쪽)"""
    bl = [b for b in pg.get("blocks") or [] if not block_empty(b)]
    if page_fill(pg) <= 1.0 or any(b.get("half") for b in bl):
        return pg
    small = lambda b: half_ok(b) and block_height(b, HW - (BODY_T - BODY_G)) <= 8.0
    for i in range(len(bl) - 1):
        if small(bl[i]) and small(bl[i + 1]):
            bl[i]["half"] = bl[i + 1]["half"] = True
            if page_fill(pg) <= 1.08:
                break
            bl[i]["half"] = bl[i + 1]["half"] = False
    return pg


def _item_key(pg):
    return re.sub(r"\s*\(\d+/\d+\)\s*$", "", str(pg.get("title") or "").strip())


def item_cost(pgs, bad, k, old=False):
    """한 항목 쪽들의 나쁨 — 목표 채움(90~100%)에서 벗어난 양(넘침은 모자람의 두 배: 덜어 내면 내용을 잃는다)
    + 앞 검사에서 그 항목에 걸린 채움 밖 위반(구성 중복 등, 앞의 것에만 — 고친 것은 그 위반을 고쳤다고 본다)"""
    c = 0.0
    for pg in pgs:
        f = page_fill(fit_page(dict(pg)))
        c += max(0.0, 0.88 - f) + 2 * max(0.0, f - 1.02)
    if old:
        c += 0.1 * sum(1 for b in bad if str(b.get("title") or "").startswith(k) and not re.search(r"찼다|넘친다", b["why"]))
    return c


def merge_item_pages(pages):
    """같은 항목의 이어진 두 쪽이 한 쪽에 들어가면(105% 이하, 2단 묶기 포함) 합친다 — 반쯤 빈 (2/2) 쪽과 '(계속)' 쪽을 줄인다.
    AI 가 쪽 높이를 못 맞춰 고쳐 쓸 때마다 모자람↔넘침을 오갔다(6차: 75% 미만 16쪽, '(계속)' 7쪽)"""
    out = []
    for pg in pages:
        if out and _item_key(out[-1]) == _item_key(pg):
            trial = fit_page(dict(out[-1], blocks=[dict(b, half=False) for b in (out[-1].get("blocks") or []) + (pg.get("blocks") or [])]))
            if page_fill(trial) <= 1.05:
                trial["title"] = _item_key(pg)   # '(1/2)' 를 뗀다 — 이제 한 쪽
                out[-1] = trial
                continue
        out.append(pg)
    # 남은 '(k/n)' 번호를 실제 쪽 수로 다시 매긴다
    groups = {}
    for pg in out:
        groups.setdefault(_item_key(pg), []).append(pg)
    for k, g in groups.items():
        if len(g) > 1:
            for i, pg in enumerate(g, 1):
                pg["title"] = f"{k} ({i}/{len(g)})"
        elif re.search(r"\(\d+/\d+\)\s*$", str(g[0].get("title") or "")):
            g[0]["title"] = k
    return out


def _rows_of(b):
    """블록에서 행 단위로 나눌 수 있는 목록(참조) — 표 행·구분 행·전략 항목·절차 단계(4단계 넘을 때)·카드(3개 넘을 때)"""
    k = str(b.get("kind") or "")
    f = b.get("fig") if isinstance(b.get("fig"), dict) else {}
    tb = b.get("table") if isinstance(b.get("table"), dict) else {}
    if k == "table" and len(tb.get("rows") or []) > 2:
        return tb["rows"]
    if k == "rows" and len(f.get("rows") or []) > 2:
        return f["rows"]
    if k == "strategy" and len(f.get("items") or []) > 2:
        return f["items"]
    if k == "process" and len(f.get("steps") or []) > 4:
        return f["steps"]
    if k == "cards" and len(f.get("cards") or []) > 3:
        return f["cards"]
    return None


ROWS_KEY = {"rows": "rows", "strategy": "items", "process": "steps", "cards": "cards"}


def _row_list(b):
    """블록의 행 목록(참조) — _rows_of 와 달리 행 수 조건 없이(이어 붙일 때 쓴다)"""
    if isinstance(b.get("table"), dict) and str(b.get("kind") or "") in ("table", "text"):
        return b["table"].setdefault("rows", [])
    k = ROWS_KEY.get(str(b.get("kind") or ""))
    return b["fig"].setdefault(k, []) if k and isinstance(b.get("fig"), dict) else None


def _push_rows(b, moved, nxt):
    """b 에서 덜어 낸 끝 행(moved, 순서대로)을 같은 항목 다음 쪽(nxt) 맨 앞의 '(이어서)' 블록에 이어 붙인다"""
    head = (nxt.get("blocks") or [None])[0]
    if head is not None and head.get("_cont_of") == b.get("_cont_id") and _row_list(head) is not None:
        _row_list(head)[0:0] = moved
        return
    b.setdefault("_cont_id", f"c{id(b)}")
    nb = copy.deepcopy(b)
    nb["head"] = re.sub(r"\s*\(이어서\)$", "", str(b.get("head") or "")) + " (이어서)"
    nb["_cont_of"] = b["_cont_id"]
    nb.pop("_cont_id", None)
    nb["half"] = False
    nb["bullets"] = []   # 보충 글은 앞 블록에만
    if isinstance(nb.get("table"), dict) and str(nb.get("kind") or "") in ("table", "text"):
        nb["table"]["rows"] = list(moved)
    elif isinstance(nb.get("fig"), dict):
        nb["fig"][ROWS_KEY[str(nb.get("kind"))]] = list(moved)
    nxt["blocks"] = [nb] + list(nxt.get("blocks") or [])


def _rejoin(blocks):
    """'(이어서)' 블록이 원래 블록 바로 뒤에 다시 붙으면 한 블록으로 — 같은 쪽에 같은 소제목이 두 번 나오지 않게"""
    out = []
    for b in blocks:
        if out and b.get("_cont_of") and b.get("_cont_of") == out[-1].get("_cont_id") and _row_list(out[-1]) is not None and _row_list(b) is not None:
            out[-1] = copy.deepcopy(out[-1])
            _row_list(out[-1]).extend(_row_list(b))
            continue
        out.append(b)
    return out


def cont_page(pg):
    """같은 항목의 '(계속)' 쪽 — 제목·경로·요구사항은 그대로, 블록은 비운다(body_page 가 제목에 '(계속)' 을 붙인다)"""
    return dict(pg, blocks=[], _cont=True)


def _split_block(b, r):
    """행을 나눌 수 있는 블록 b 를 앞 r 행 / 나머지('(이어서)')로 — 원본은 건드리지 않는다"""
    b1 = copy.deepcopy(b)
    b1.setdefault("_cont_id", b.get("_cont_id") or f"c{id(b)}")
    rows = _row_list(b1)
    rest = rows[r:]
    del rows[r:]
    holder = {"blocks": []}
    _push_rows(b1, rest, holder)
    return b1, holder["blocks"][0]


def _cuts(bl):
    """쪽을 둘로 가르는 자리 — (앞 블록들, 뒤 블록들). 단위 사이 + 행을 나눌 수 있는 한 칸 블록의 행 사이(양쪽 2행 이상).
    2단 묶음은 가르지 않는다(왼쪽·오른쪽 칸이 다른 쪽으로 갈라진다)"""
    sp = _spans(bl)
    out = []
    for u, (s0, s1) in enumerate(sp):
        if u:
            out.append((bl[:s0], bl[s0:]))
        if s1 - s0 == 1 and _rows_of(bl[s0]) is not None:
            n = len(_row_list(bl[s0]))
            for r in range(2, n - 1):
                b1, b2 = _split_block(bl[s0], r)
                out.append((bl[:s0] + [b1], [b2] + bl[s1:]))
    return out


def split_page(pg):
    """한 쪽에 안 드는 쪽을 쪽 여러 개로(앞 쪽 + '(계속)' 쪽) — 행은 지우지 않는다(R117).
    두 쪽으로 될 때: 두 쪽 다 60% 이상이 되는 자리 중 앞 쪽이 가장 꽉 차는 곳, 그런 자리가 없으면 덜 찬 쪽이 가장 차는 곳(고르게).
    두 쪽으로 안 되면 앞 쪽을 가장 꽉 채우고 나머지를 다시 나눈다"""
    bl = [b for b in pg.get("blocks") or [] if not block_empty(b)]
    if fits(bl) or len(bl) == 0:
        return [dict(pg, blocks=bl)]
    if fits_tight(bl):   # 글자·행 간격을 줄이면 한 쪽에 든다 — 0.5cm 넘침에 '(계속)' 쪽을 만들지 않는다
        return [dict(pg, blocks=tighten(bl), _tight=True)]
    cuts = _cuts(bl)
    fill = lambda x: page_fill({"blocks": x})
    two = [(p1, p2) for p1, p2 in cuts if fits(p1) and fits(p2)]
    if two:
        good = [c for c in two if min(fill(c[0]), fill(c[1])) >= SPARSE]
        p1, p2 = max(good, key=lambda c: fill(c[0])) if good else max(two, key=lambda c: min(fill(c[0]), fill(c[1])))
        return [dict(pg, blocks=p1), dict(cont_page(pg), blocks=p2)]
    one = [(p1, p2) for p1, p2 in cuts if fits(p1)]
    if not one:   # 나눌 자리가 없다(블록 하나가 쪽보다 크고 행도 못 나눔) — 그대로 그리고 body_page 가 넘치는 단위를 넘긴다
        return [dict(pg, blocks=bl)]
    p1, p2 = max(one, key=lambda c: fill(c[0]))
    rest = split_page(dict(cont_page(pg), blocks=p2))
    return [dict(pg, blocks=p1)] + rest


def trim_overflow(pages, log=None):
    """넘치는 쪽은 split_page 로 '(계속)' 쪽을 만들어 나눈다 — 행을 지우지 않는다.
    예전엔 같은 항목 다음 쪽이 없으면 끝 행을 한 쪽에 2행까지 조용히 지웠다(10-28 4d58: 37행 삭제, R117).
    log 에는 '정말 지운 행'만 남긴다(지금은 지우는 길이 없다 — 작업 기록·확인 목록 자리만 남겨 둔다)"""
    out = []
    for pg in pages:
        out += split_page(pg)
    return out


TIGHT_GAP, TIGHT_BOTTOM, TIGHT_ROW, TIGHT_STEP = 0.15, 0.5, 0.54, 0.2   # 촘촘한 쪽 — 블록 사이·바닥 여유·표 행(8pt)·절차 단계 사이(cm)


def fits(blocks, tight=False):
    """한 쪽에 들어가는가 — body_page 와 같은 계산(블록 사이 간격은 0.25cm 까지 줄이고 바닥 여유 0.4cm 까지).
    tight = 촘촘한 쪽(간격 0.15·바닥 0.5·표 행 0.54·절차 단계 사이 0.2) — blocks 는 tighten() 한 것이어야 한다"""
    us = units([b for b in blocks if not block_empty(b)])
    g, m = (TIGHT_GAP, TIGHT_BOTTOM) if tight else (0.25, 0.4)
    return len(us) <= 1 or sum(unit_height(u) for u in us) + g * (len(us) - 1) <= BODY_BOTTOM + m - 7.55 + 1e-6


def tighten(blocks):
    """글자·행 간격 조정(R117) — 표는 행 0.54cm·8pt, 세로 절차는 단계 사이 0.2cm. 원본은 그대로 두고 사본에 표시"""
    out = []
    for b in blocks:
        b = copy.deepcopy(b)
        if isinstance(b.get("table"), dict):
            b["table"]["_tight"] = True
        if str(b.get("kind") or "") == "process" and isinstance(b.get("fig"), dict):
            b["fig"]["_tight"] = True
        out.append(b)
    return out


def fits_tight(blocks):
    return fits(tighten(blocks), True)


def _spans(blocks):
    """units() 와 같은 묶음을 원래 블록 번호 구간으로 — [(시작, 끝)]"""
    out, i = [], 0
    while i < len(blocks):
        n = 2 if (is_half(blocks[i]) and i + 1 < len(blocks) and is_half(blocks[i + 1])) else 1
        out.append((i, i + n))
        i += n
    return out


def paginate(pages):
    """쪽을 그리기 전에 나눈다 — 한 쪽에 안 드는 단위는 '(계속)' 쪽으로(예전엔 body_page 가 그리면서 나눠 반쯤 빈 쪽을 고칠 수 없었다)"""
    out = []
    for pg in pages:
        bl = [b for b in pg.get("blocks") or [] if not block_empty(b)]
        sp = _spans(bl)
        cur, first = [], True
        for a, z in sp:
            if cur and not fits(cur + bl[a:z]):
                out.append(dict(pg, blocks=cur) if first else dict(cont_page(pg), blocks=cur))
                cur, first = [], False
            cur = cur + bl[a:z]
        out.append(dict(pg, blocks=cur) if first else dict(cont_page(pg), blocks=cur))
    return out


SPARSE = 0.6   # 같은 항목 뒤쪽이 이보다 덜 차면(page_fill) 앞 쪽과 합치거나 고르게 나눈다(R117)


def balance_pages(pages):
    """반쯤 빈 '(계속)'·(2/2) 쪽(채움 60% 미만) — ① 앞 쪽과 합쳐 한 쪽에 들면(블록 간격을 줄이는 범위 안에서) 합친다
    ② 안 들면 앞 쪽 끝 단위(블록·2단)나 끝 행을 넘겨 두 쪽을 고르게 — 한쪽만 텅 비지 않게"""
    j = 1
    while j < len(pages):
        a, b = pages[j - 1], pages[j]
        if _item_key(a) != _item_key(b) or page_fill(b) >= SPARSE:
            j += 1
            continue
        ab = [x for x in a.get("blocks") or [] if not block_empty(x)]
        bb = [x for x in b.get("blocks") or [] if not block_empty(x)]
        if fits(_rejoin(ab + bb)):   # ① 합치기 — 앞 쪽 제목·도입 그대로
            pages[j - 1] = dict(a, blocks=_rejoin(ab + bb))
            del pages[j]
            continue
        if fits_tight(_rejoin(ab + bb)):   # ① 글자·행 간격을 줄여 합치기
            pages[j - 1] = dict(a, blocks=tighten(_rejoin(ab + bb)), _tight=True)
            del pages[j]
            continue
        c_ = pages[j + 1] if j + 1 < len(pages) and _item_key(pages[j + 1]) == _item_key(b) else None
        if c_ is not None and fits(_rejoin(bb + list(c_.get("blocks") or []))):   # ①' 뒤에 같은 항목 쪽이 또 있으면 그쪽 앞에 합친다
            pages[j + 1] = dict(c_, blocks=_rejoin(bb + list(c_.get("blocks") or [])))
            del pages[j]
            continue

        def ok(na, nb):   # 한 쪽에 들고, 두 쪽 중 덜 찬 쪽이 더 차게 될 때만(한쪽만 텅 비지 않게)
            lo = min(page_fill(dict(a, blocks=ab)), page_fill(dict(b, blocks=bb)))
            return fits(nb) and min(page_fill(dict(a, blocks=na)), page_fill(dict(b, blocks=nb))) > lo + 1e-6
        for _ in range(60):   # ② 고르게 — 뒤쪽이 60% 에 닿으면 멈춘다(앞 쪽은 되도록 꽉 찬 채로)
            if page_fill(dict(b, blocks=bb)) >= SPARSE:
                break
            sp = _spans(ab)
            moved = False
            if len(sp) > 1:   # 끝 단위 하나를 뒤 쪽 앞으로
                s0 = sp[-1][0]
                na, nb = ab[:s0], _rejoin(ab[s0:] + bb)
                if ok(na, nb):
                    ab, bb, moved = na, nb, True
            if not moved and ab and _rows_of(ab[-1]) is not None and (len(sp) == 1 or sp[-1][1] - sp[-1][0] == 1):   # 끝 블록의 끝 행 하나를
                ta = copy.deepcopy(ab)
                tb_ = dict(b, blocks=list(bb))
                ta[-1].setdefault("_cont_id", ab[-1].get("_cont_id") or f"c{id(ab[-1])}")
                ab[-1]["_cont_id"] = ta[-1]["_cont_id"]
                if bb and bb[0].get("_cont_of") == ta[-1]["_cont_id"]:
                    tb_["blocks"] = [copy.deepcopy(bb[0])] + bb[1:]
                _push_rows(ta[-1], [_rows_of(ta[-1]).pop()], tb_)
                if ok(ta, tb_["blocks"]):
                    ab, bb, moved = ta, tb_["blocks"], True
            if not moved:
                break
        a, b = dict(a, blocks=ab), dict(b, blocks=bb)
        pages[j - 1], pages[j] = a, b
        j += 1
    return pages


# ───────────────────────── 별첨 — AI 없이 엔진이 만든다(R117). 예전엔 별첨 장을 본문 작성에서 빼고 간지 목록 줄만 만들어,
#   4d58(요구사항 수용여부 비교표·평가항목 조견표·약어표·기술적용계획표·증빙)·e25(별첨 3항목)에 본문 쪽이 하나도 없었다(10-28).
#   요구사항 대응표 = 목차가 모은 요구사항 번호 + 본문 쪽의 req · 약어표 = 본문에서 모은 영문 약어 · 나머지 = '[제안사 작성]' 빈 서식(제목·표 머리)
ABBR = {   # 흔한 약어만(뜻이 하나로 정해진 것). 본문에 '풀이(약어)'·'약어(원어)' 가 있으면 그것이 먼저, 없고 여기에도 없으면 [제안사 작성]
    "AI": "인공지능(Artificial Intelligence)", "API": "응용 프로그램 인터페이스(Application Programming Interface)",
    "BCP": "업무 연속성 계획(Business Continuity Plan)", "CCTV": "폐쇄회로 텔레비전(Closed-Circuit Television)",
    "CMS": "콘텐츠 관리 시스템(Content Management System)", "CPU": "중앙 처리 장치(Central Processing Unit)",
    "CR": "변경 요청(Change Request)", "CRM": "고객 관계 관리(Customer Relationship Management)", "DB": "데이터베이스(Database)",
    "DBMS": "데이터베이스 관리 시스템(Database Management System)", "DR": "재해 복구(Disaster Recovery)",
    "ERP": "전사적 자원 관리(Enterprise Resource Planning)", "FAQ": "자주 묻는 질문(Frequently Asked Questions)",
    "FTP": "파일 전송 규약(File Transfer Protocol)", "GIS": "지리 정보 시스템(Geographic Information System)",
    "GPU": "그래픽 처리 장치(Graphics Processing Unit)", "HW": "하드웨어(Hardware)", "ICT": "정보통신기술(Information and Communications Technology)",
    "IP": "인터넷 프로토콜(Internet Protocol)", "ISMS": "정보보호 관리체계(Information Security Management System)",
    "ISO": "국제표준화기구(International Organization for Standardization)", "IT": "정보기술(Information Technology)",
    "ITSM": "IT 서비스 관리(IT Service Management)", "IoT": "사물인터넷(Internet of Things)", "KPI": "핵심 성과 지표(Key Performance Indicator)",
    "LAN": "근거리 통신망(Local Area Network)", "MOU": "업무 협약(Memorandum of Understanding)", "OS": "운영체제(Operating System)",
    "OTP": "일회용 비밀번호(One-Time Password)", "PC": "개인용 컴퓨터(Personal Computer)", "PL": "파트 책임자(Part Leader)",
    "PM": "사업 책임자(Project Manager)", "PMO": "사업 관리 조직(Project Management Office)", "QA": "품질 보증(Quality Assurance)",
    "RFP": "제안요청서(Request for Proposal)", "ROI": "투자 수익률(Return on Investment)", "RPO": "목표 복구 시점(Recovery Point Objective)",
    "RTO": "목표 복구 시간(Recovery Time Objective)", "SaaS": "서비스형 소프트웨어(Software as a Service)",
    "SLA": "서비스 수준 협약(Service Level Agreement)", "SMS": "문자 메시지 서비스(Short Message Service)",
    "SNS": "소셜 네트워크 서비스(Social Network Service)", "SR": "서비스 요청(Service Request)", "SSO": "통합 인증(Single Sign-On)",
    "SW": "소프트웨어(Software)", "UI": "사용자 인터페이스(User Interface)", "URL": "인터넷 주소(Uniform Resource Locator)",
    "UX": "사용자 경험(User Experience)", "VDI": "가상 데스크톱 환경(Virtual Desktop Infrastructure)", "VPN": "가상 사설망(Virtual Private Network)",
    "WAS": "웹 애플리케이션 서버(Web Application Server)", "WBS": "작업 분류 체계(Work Breakdown Structure)",
}
ROMAN_ABBR = {"I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"}
ABBR_RX = re.compile(r"(?<![A-Za-z0-9])([A-Z][A-Za-z0-9]{0,8}[A-Z0-9]|[A-Z]{2})(?![A-Za-z0-9])(?!-\d)")
FILL = "[제안사 작성]"


def _josa(w, a, b):
    """받침 있으면 a, 없으면 b — '약어표는', '비교표는'"""
    ch = str(w or "").strip()[-1:] or "가"
    return a if ("가" <= ch <= "힣" and (ord(ch) - 0xAC00) % 28) else b


def _req_sort(rid):
    m = re.match(r"([A-Z]+)-(\d+)", rid)
    return (m.group(1), int(m.group(2))) if m else (rid, 0)


def collect_abbr(chapters_pages, item_at, chapters):
    """본문 글에서 영문 약어(대문자 둘 이상)를 모은다 → [(약어, 풀이, 처음 나온 쪽)] 가나다(알파벳)순"""
    seen, text_all = {}, []
    # 요구사항 번호 접두(OMR·SFR …)는 약어가 아니다 — 본문 표에 'OMR 19' 처럼 따로 나와도 뺀다
    pre = {m.group(1) for c in chapters for s_ in c.get("sections") or [] for it in s_.get("items") or []
           for m in [re.match(r"([A-Z]{2,4})-\d", str(x)) for x in it.get("req") or []] if m}
    for i in sorted(k for k in chapters_pages if k < len(chapters) and chapters[k].get("no") != "※"):
        for pg in chapters_pages.get(i) or []:
            pre |= set(re.findall(r"\b([A-Z]{2,4})-\d{2,4}", str(pg.get("req") or "")))
            t = " ".join(str(v) for v in vertical_rules._walk_text({k: v for k, v in pg.items() if k not in ("req", "path")}))
            text_all.append(t)
            for m in ABBR_RX.finditer(t):
                a = m.group(1)
                if a in ROMAN_ABBR or a in pre or (sum(1 for x in a if x.isupper()) < 2 and a not in ABBR):
                    continue
                seen.setdefault(a, item_at.get((i, _item_key(pg))) or "")
    blob = " ".join(text_all)
    out = []
    for a in sorted(seen, key=lambda x: x.upper()):
        mean = ""
        m = re.search(re.escape(a) + r"\s*\(\s*([A-Za-z][A-Za-z\s&\-/]{3,60}?)\s*\)", blob)   # 약어(원어)
        if m:
            mean = m.group(1).strip()
        m = re.search(r"([가-힣][가-힣·\s]{1,24}?)\s*\(\s*" + re.escape(a) + r"\s*[,)]", blob)   # 풀이(약어)
        if m:
            ko = m.group(1).split()
            ko = ko[-3:]
            while len(ko) > 1 and re.search(r"(은|는|이|가|을|를|의|에|로|와|과|및|등|해|고|며)$", ko[0]):
                ko = ko[1:]
            known = ABBR.get(a, "").split("(")[0].split()
            if len("".join(ko)) < 3:   # '1조원(OECD 기준)' 의 '조원' 처럼 풀이가 아닌 앞 글자 — 버린다
                pass
            elif known and known[-1] == ko[-1]:   # 본문 풀이 끝 낱말이 사전과 같으면 사전 풀이 — 앞 문맥('발주기관 서비스 요청')이 섞이지 않게
                mean = ABBR[a]
            else:
                mean = " ".join(ko) + (f"({mean})" if mean else "")
        out.append((a, mean or ABBR.get(a) or FILL, seen[a]))
    return out


def _table_pages(base, head, cols, rows, bullets, blank=False):
    """별첨 표 쪽 — 쪽에 드는 만큼 행을 담고, 여러 쪽이면 행을 고르게(마지막 쪽만 텅 비지 않게). 빈 서식은 쪽 85% 까지 빈 행"""
    # 긴 별첨 표는 PowerPoint 가 행을 어림(0.62cm)보다 조금 높게 그린다(a시월구일 8.5pt 실측 약 0.65 — 26행이면 0.6cm 넘쳐 바닥 꼬리와 겹침) — 7% 여유
    avail = (BODY_BOTTOM - 7.55) * 0.93
    blk = lambda rs, first: {"kind": "table", "head": head + ("" if first else " (이어서)"), "bullets": list(bullets) if first else [],
                             "table": {"cols": list(cols), "rows": [list(r) for r in rs], "_max_rows": max(1, len(rs))}}
    if blank:
        rs = [[""] * len(cols)]
        while block_height(blk(rs + [[""] * len(cols)], True)) <= avail * 0.85 and len(rs) < 40:
            rs.append([""] * len(cols))
        if cols and cols[0] == "번호":
            rs = [[str(k)] + r[1:] for k, r in enumerate(rs, 1)]
        return [dict(base, blocks=[blk(rs, True)])]
    chunks, cur = [], []
    for r in rows:   # 먼저 채우는 대로 → 쪽 수
        if cur and block_height(blk(cur + [r], not chunks)) > avail:
            chunks.append(cur)
            cur = []
        cur.append(r)
    if cur or not chunks:
        chunks.append(cur)
    if len(chunks) > 1:   # 같은 쪽 수로 고르게 다시 나눠 본다(첫 쪽은 안내 글이 있어 덜 담는다)
        n, per = len(chunks), math.ceil(len(rows) / len(chunks))
        even = [rows[k:k + per] for k in range(0, len(rows), per)]
        if len(even) == n and all(block_height(blk(ch, k == 0)) <= avail for k, ch in enumerate(even)):
            chunks = even
    return [dict(base, blocks=[blk(ch, k == 0)], **({"_cont": True} if k else {})) for k, ch in enumerate(chunks)]


def appendix_pages(o, c, chapters_pages, req_at, item_at):
    """별첨 장(※)의 쪽 — 절마다 항목(없으면 절 자체)을 쪽으로. 제목 'k.j 이름' 이라 목차·경로가 본문과 같은 길로 나온다"""
    chapters = o.get("chapters") or []
    out = []
    for k, sec in enumerate(c.get("sections") or [], 1):
        its = [it for it in sec.get("items") or [] if str(it.get("title") or "").strip()] or [{"title": sec.get("title") or "별첨"}]
        for j, it in enumerate(its, 1):
            name = str(it["title"]).strip()
            title = f"{k}.{j} {name}"
            base = {"title": title, "path": page_path(c, title), "req": "", "strong": "", "lead": [], "band": ""}
            key = f"{sec.get('title') or ''} {name}"
            if re.search(r"요구사항|과업|대응표|참조표|수용", key):
                refs = {rid: list(v) for rid, v in req_at.items()}
                for ci, ch in enumerate(chapters):   # 목차 항목의 요구사항 번호 → 그 항목 첫 쪽
                    if ch.get("no") == "※":
                        continue
                    for s_ in ch.get("sections") or []:
                        for it_ in s_.get("items") or []:
                            at = next(((v, kk[1]) for kk, v in item_at.items() if kk[0] == ci
                                       and re.sub(r"^\d+(\.\d+)*\s*", "", kk[1]) == str(it_.get("title") or "").strip()), None)
                            for rid in it_.get("req") or []:
                                lst = refs.setdefault(str(rid).strip(), [])
                                if at and at[0] not in [x[0] for x in lst]:
                                    lst.append(at)
                names = {str(r.get("id")): str(r.get("name") or "") for r in o.get("_req_list") or [] if r.get("id")}
                for rid in names:
                    refs.setdefault(rid, [])
                refs = {r: v for r, v in refs.items() if re.match(r"^[A-Z]{2,4}-\d{2,4}$", r)}
                accept = "수용" in key
                if refs:
                    has_name = any(names.get(r) for r in refs)
                    cols = ["고유번호", "요구사항 명칭" if has_name else "대응 항목", "대응 쪽", "수용 여부" if accept else "비고"]
                    rows = []
                    for rid in sorted(refs, key=_req_sort):
                        v = refs[rid]
                        rows.append([rid, names.get(rid) or (re.sub(r"^\d+(\.\d+)*\s*", "", v[0][1]) if v else ""),
                                     ", ".join(x[0] for x in v[:3]) + (f" 외 {len(v) - 3}" if len(v) > 3 else "") if v else "-",
                                     "" if accept else ("" if v else "본문 대응 없음")])
                    n_hit = sum(1 for r in refs if refs[r])
                    base.update(lead=[f"RFP 요구사항 {len(refs)}건과 제안서 본문의 대응 쪽을 한 표로 정리했습니다.",
                                      "고유번호 순으로 적어 요구사항별 대응 내용을 바로 찾을 수 있습니다."],
                                strong=f"{len(refs)}건", band=f"요구사항 {len(refs)}건 · 본문 대응 {n_hit}건")
                    bl = ([f"{FILL} 수용 여부(수용·부분 수용·대안 제시)는 제안사가 확인해 적습니다."] if accept else []) \
                        + ([f"대응 쪽이 '-' 인 {len(refs) - n_hit}건은 본문에 대응 쪽이 없습니다 — {FILL}"] if n_hit < len(refs) else [])
                    out += _table_pages(base, name, cols, rows, bl)
                else:   # 요구사항 번호가 없는 RFP — 본문 항목을 기준으로 과업 대응 칸을 비워 둔다
                    rows = [["", re.sub(r"^\d+(\.\d+)*\s*", "", kk[1]), v, ""] for kk, v in item_at.items()]
                    base.update(lead=["과업지시서의 과업과 제안서 본문 항목을 한 표로 대응합니다.",
                                      f"본문 항목 {len(rows)}개와 첫 쪽을 먼저 적어 두었습니다."],
                                strong="한 표로 대응", band=f"본문 항목 {len(rows)}개 · 과업 내용 {FILL}")
                    out += _table_pages(base, name, ["과업 내용", "제안서 대응 항목", "대응 쪽", "비고"], rows,
                                        [f"{FILL} 과업 내용 칸은 과업지시서의 과업 항목을 옮겨 적습니다."])
            elif re.search(r"약어|용어", key):
                ab = collect_abbr(chapters_pages, item_at, chapters)
                rows = [[a, m, p] for a, m, p in ab]
                n_fill = sum(1 for r in rows if r[1] == FILL)
                base.update(lead=[f"본문에 쓴 영문 약어 {len(rows)}개를 알파벳 순으로 정리했습니다.",
                                  "처음 나온 쪽을 함께 적어 본문에서 바로 찾을 수 있습니다."],
                            strong=f"{len(rows)}개", band=f"약어 {len(rows)}개" + (f" · 풀이 {FILL} {n_fill}개" if n_fill else ""))
                bl = [f"풀이가 {FILL} 인 약어는 제안사가 뜻을 적습니다."] if n_fill else []
                if not rows:
                    base.update(lead=[f"{name}{_josa(name, '은', '는')} 제안사가 작성하는 서식입니다.", "본문에 쓴 용어를 표에 옮겨 적습니다."], strong="", band=FILL)
                    out += _table_pages(base, name, ["약어·용어", "풀이", "처음 나온 쪽"], [], [f"{FILL} 본문에 쓴 약어·용어를 적습니다."], blank=True)
                else:
                    out += _table_pages(base, name, ["약어", "풀이", "처음 나온 쪽"], rows, bl)
            else:   # 빈 서식 — 제목·표 머리만, 행은 제안사가 채운다
                if re.search(r"평가|조견", key):
                    cols = ["평가 항목", "배점", "제안서 대응 목차", "쪽"]
                    rows = []
                    for ci, ch in enumerate(chapters):
                        if ch.get("no") == "※":
                            continue
                        for sk, s_ in enumerate(ch.get("sections") or [], 1):
                            pg_ = next((v for kk, v in item_at.items() if kk[0] == ci and re.match(rf"{sk}\.\d+\s", kk[1] + " ")), "")
                            rows.append(["", "", f"{ch.get('no')}-{sk}. {s_.get('title') or ''}", pg_])
                    base.update(lead=["RFP 평가 항목과 제안서 목차를 한 표로 맞춰 봅니다.", "제안서 목차와 쪽은 본문 기준으로 먼저 적어 두었습니다."],
                                strong="한 표로", band=f"평가 항목·배점 {FILL}")
                    out += _table_pages(base, name, cols, rows, [f"{FILL} 평가 항목·배점은 RFP 제안서 평가표에서 옮겨 적습니다."])
                    continue
                if re.search(r"기술", key):
                    cols, tip = ["적용 기술", "적용 부문", "적용 방안", "대응 쪽"], ["적용할 기술과 부문·방안을 적습니다.", "대응 쪽 칸에는 그 기술을 설명한 본문 쪽 번호를 적습니다."]
                elif re.search(r"증빙|서류|서식|산출|내역|확약|각서|인증|경력|재직", key):
                    cols, tip = ["번호", "서류 이름", "제출 부수", "비고"], ["제출할 서류 이름과 부수를 적고, 사본은 이 쪽 뒤에 붙입니다.", "서류 순서는 RFP 의 제출 서류 목록 순서를 따릅니다."]
                else:
                    cols, tip = ["구분", "내용", "비고"], ["RFP 가 요구한 내용을 적습니다."]
                rq = [str(x).strip() for x in it.get("req") or [] if str(x).strip()]
                base["req"] = ", ".join(rq)   # 목차가 이 별첨에 붙인 요구사항 번호(머리 꼬리표)
                base.update(lead=[f"{name}{_josa(name, '은', '는')} 제안사가 작성하는 서식입니다.", "표 머리만 두었으니 RFP 기준에 맞춰 행을 채웁니다."],
                            strong="제안사가 작성", band=f"{name} · {FILL}")
                out += _table_pages(base, name, cols, [], [f"{FILL} {tip[0]}"] + tip[1:]
                                    + ([f"관련 요구사항 {', '.join(rq)} 의 증빙·내용을 이 표에 맞춰 적습니다."] if rq else []), blank=True)
    return out


def block_empty(blk):
    """글머리·표·도식이 하나도 없는 블록(소제목만 남는다)"""
    tb = blk.get("table")
    return not fig_data(blk) and not [b for b in (blk.get("bullets") or []) if str(b).strip()] and not (isinstance(tb, dict) and tb.get("rows"))


def page_fill(pg):
    """본문 쪽 채움 비율 — 블록 높이 합 / 본문 영역(7.55 ~ BODY_BOTTOM)"""
    bl = [b for b in pg.get("blocks") or [] if not block_empty(b)]
    us = units(bl)
    return (sum(unit_height(u) for u in us) + 0.55 * max(0, len(us) - 1)) / (BODY_BOTTOM - 7.55)


def col_widths(cols, rows, total):
    """열 너비 — 열마다 가장 긴 글 폭에 비례(최소 1.6cm)"""
    cols = [str(c) for c in cols][:4]
    need = [max([text_cm(str(c), 8.5)] + [text_cm(str(r[i]) if i < len(r) else "", 8.5) for r in rows]) + 0.4 for i, c in enumerate(cols)]
    need = [max(1.6, x) for x in need]
    k = total / sum(need)
    return [x * k for x in need]


def table_height(tb, total):
    cols = [str(c) for c in tb["cols"]][:4]
    rows = [[str(v) for v in r][:len(cols)] for r in tb["rows"][:int(tb.get("_max_rows") or 8)]]
    ws = col_widths(cols, rows, total)
    rh = TIGHT_ROW if tb.get("_tight") else 0.62   # 촘촘한 쪽(R117)은 행 높이를 줄인다(글자 8pt)
    h = rh
    for r in rows:
        lines = max([1] + [math.ceil(text_cm(v, 8.5) / max(0.5, ws[i] - 0.3)) for i, v in enumerate(r)])
        h += rh if lines == 1 else rh + (lines - 1) * 0.36 * BODY_SCALE[0]
    return h


def add_table(s, tb, x, y, w, th=None):
    th = th or THEMES["navy"]
    cols = [str(c) for c in tb["cols"]][:4]
    rows = [[str(v) for v in r][:len(cols)] + [""] * (len(cols) - len(r)) for r in tb["rows"][:int(tb.get("_max_rows") or 8)]]   # 별첨 표는 쪽에 드는 만큼(_max_rows)
    rh, fpt = (TIGHT_ROW, 8.0) if tb.get("_tight") else (0.62, 8.5)
    g = s.shapes.add_table(len(rows) + 1, len(cols), x, y, w, Cm(rh * (len(rows) + 1)))
    t = g.table
    tblPr = g._element.find(".//a:tblPr", NS)
    for k in list(tblPr.attrib):
        del tblPr.attrib[k]
    st = tblPr.find("a:tableStyleId", NS)
    if st is not None:
        tblPr.remove(st)
    widths = col_widths(cols, rows, w / 360000)
    short = [all(len(r[ci]) <= 6 for r in rows) for ci in range(len(cols))]   # 6자 이하 열은 가운데   # 글 길이에 맞춘 열 너비(cm) — 고르게 나누면 긴 칸이 줄바꿈돼 표가 길어진다
    for ci in range(len(cols)):
        t.columns[ci].width = Cm(widths[ci])
    for ri in range(len(rows) + 1):
        t.rows[ri].height = Cm(rh)
        for ci in range(len(cols)):
            cell = t.cell(ri, ci)
            cell.text = cols[ci] if ri == 0 else rows[ri - 1][ci]
            cell.margin_left = cell.margin_right = Cm(0.15)
            cell.margin_top = cell.margin_bottom = Cm(0.05)
            cell.vertical_anchor = 3
            fill = cell.fill
            fill.solid()
            fill.fore_color.rgb = __import__("pptx").dml.color.RGBColor.from_string(th["tbl"] if ri == 0 else ("FFFFFF" if ri % 2 else "F5F7FB"))
            tcPr = cell._tc.get_or_add_tcPr()   # 선을 직접 적는다 — 안 적으면 LibreOffice 가 검정 굵은 선을 그린다
            for tag in ("lnB", "lnT", "lnR", "lnL"):   # 순서 lnL·lnR·lnT·lnB 가 채우기 앞에 와야 한다(맨 앞에 거꾸로 넣음)
                old = tcPr.find(f"a:{tag}", NS)
                if old is not None:
                    tcPr.remove(old)
                tcPr.insert(0, parse_xml(f'<a:{tag} xmlns:a="{A}" w="{TBL_LINE_EMU}" cap="flat" cmpd="sng" algn="ctr">'
                                         f'<a:solidFill><a:srgbClr val="{th["tbl"]}"/></a:solidFill><a:prstDash val="solid"/></a:{tag}>'))
            for p_ in cell.text_frame.paragraphs:
                p_.alignment = 2 if (ri == 0 or short[ci]) else 1   # 정렬은 열 단위(사용자 표 규칙 — 칸마다 섞지 않는다)
                for r in p_.runs:
                    r.font.size = Pt(fpt)
                    r.font.color.rgb = __import__("pptx").dml.color.RGBColor.from_string("FFFFFF" if ri == 0 else "4D4D4D")
                    rp = r._r.get_or_add_rPr()
                    for tag in ("latin", "ea"):
                        e = rp.find(f"a:{tag}", NS)
                        if e is None:
                            e = etree.SubElement(rp, f"{{{A}}}{tag}")
                        e.set("typeface", "a시월구일3" if ri == 0 else "a시월구일2")


# ───────────────────────── 본문 도식 — 블록 kind 별 구성(사용자 2026-10-14 "샘플 하나로 모든 콘텐츠를 도배한 느낌, 구성이 더 다양해야")
#   제출본 세로 제안서 148장(design/제안서템플릿/컨텐츠디자인은 말고구성예시샘플)에서 반복된 구성만 골랐다 — 개념 체계도·As-Is/To-Be·
#   단계 흐름·카드·구분 행·조직도·일정표·핵심 지표·전략 목록·기대효과 상자. 전부 PowerPoint 도형(고쳐 쓸 수 있게), 색은 글자 먹색·면은 톤 기운만.
FIG_KINDS = ("concept", "hub", "photo", "compare", "process", "cards", "rows", "layers", "org", "gantt", "kpi", "strategy", "effect")
FIG_NAMES = {"개선", "개선 내용", "곁 조직", "구분", "기간", "기대효과 내용", "기대효과 바탕", "기대효과 이름", "기둥 내용", "기둥 머리", "내용", "단계", "단계 설명", "단계 원", "단계 제목", "마일스톤", "마일스톤 이름", "막대", "목표", "바탕", "사진", "사진 글", "사진 바탕", "사진 설명", "사진 자리", "아이콘", "요소", "일정 머리", "전략 내용", "전략 바탕", "전략 번호", "지표", "총괄", "층 바탕", "층 이름", "카드 내용", "카드 머리", "칸", "팀", "팀 역할", "허브 노드", "허브 중심", "허브 테", "현재", "현재 내용", "화살표", "활동"}   # 도식이 그리는 도형 이름(정렬 검사에서 안쪽 칸을 가려낸다)
FW = BODY_G + 15.0 - BODY_T   # 도식 폭(블록 안 글 시작선 T ~ 오른쪽 끝)
LINE = "D3D7DE"
BOX_PAD = 0.15   # 면·테두리 있는 글 상자의 최소 안쪽 여백(cm, R120)
LH = _PerJob("lh", lambda: [0.38])   # [0] = 8.5~9pt 한 줄 높이(cm) — use_fonts 가 본문 서체 크기 보정만큼 바꾼다(작업마다 따로)


def _esc(t):
    return str(t or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _lines(t, pt, w, face="a시월구일2"):
    """글 t 가 폭 w(cm)에서 몇 줄인지"""
    return max(1, math.ceil(text_cm(str(t or ""), pt, face) * 1.03 / max(0.6, w)))


def _box(tree, name, x, y, w, h, fill=None, line=None, geom="rect", adj=None, paras=(), algn="l", anchor="t",
         ins=(0.18, 0.12, 0.18, 0.12), bullet=False, lw=9525, wrap="square"):
    """글 상자 겸 도형 — paras = [(글, pt, 색, 서체)] 문단마다 한 줄 이상(줄바꿈 허용)"""
    ids = [int(e.get("id")) for e in tree.iter(f"{{{P}}}cNvPr")] or [1]
    av = f'<a:gd name="adj" fmla="val {adj}"/>' if adj is not None else ""
    fill_x = f'<a:solidFill><a:srgbClr val="{fill}"/></a:solidFill>' if fill else "<a:noFill/>"
    ln_x = f'<a:ln w="{lw}"><a:solidFill><a:srgbClr val="{line}"/></a:solidFill></a:ln>' if line else "<a:ln><a:noFill/></a:ln>"
    ps = ""
    # 낱말 중간 줄바꿈 금지(사용자 2026-10-14 '식품안전나/라' '03/적재' — "줄바꿈 되면 안 되는 곳에서의 줄바꿈 지양"):
    # 쓸 수 있는 폭(타원은 내접 폭 0.7)에 가장 긴 낱말이 안 들어가면 그 문단 글자를 줄인다(최소 6.5pt)
    # 면·테두리가 있는 글 상자는 안쪽 여백을 0.15cm 이상(위아래는 위 정렬일 때) — 조직도 '사업책임자(PM)' 가 상자 테두리에 붙었다(10-28 사용자, R120)
    has_text = any((t if isinstance(t, str) else "x") for t, *_ in (paras or []))
    if (fill or line) and has_text and geom not in ("ellipse", "rightArrow", "diamond", "chevron", "homePlate") and w >= 1.2:
        ins = (max(ins[0], BOX_PAD), max(ins[1], BOX_PAD if anchor == "t" else 0), max(ins[2], BOX_PAD), max(ins[3], BOX_PAD if anchor == "t" else 0))
    usable = w * (0.7 if geom == "ellipse" else 1.0) - ins[0] - ins[2] - (0.32 if bullet else 0)
    fitted = []
    for t, pt, col, face in paras or [("", 9, INK, "a시월구일2")]:
        if not isinstance(t, list) and wrap != "none":
            longest = max((x for x in str(t).split() if x), key=lambda x: text_cm(x, pt, face), default="")
            while pt > 6.5 and longest and text_cm(longest, pt, face) * 1.06 > usable:
                pt -= 0.5
        fitted.append((t, pt, col, face))

    def norm(ps_):   # 문단마다 [(글, pt, 서체)…] 조각으로(여러 색 문단 포함)
        return [[(rt, rp, rf) for rt, rp, _, rf in t] if isinstance(t, list) else [(str(t), pt, face)] for t, pt, _, face in ps_]

    def text_h(ps_):   # 줄바꿈까지 센 글 높이(cm) — 줄 간격 100%(PowerPoint 한 줄 ≈ 1.2em), 본문 서체는 저장 때 곱하는 크기 보정까지
        hh = 0.0
        for runs in norm(ps_):
            w_ = sum(text_cm(rt, rp, rf) for rt, rp, rf in runs)
            pmax = max(rp * (BODY_SCALE[0] if _level(rf) is not None else 1.0) for _, rp, rf in runs)
            n = 1 if wrap == "none" else max(1, math.ceil(w_ * 1.03 / max(0.3, usable)))
            hh += n * pmax * 0.03528 * 1.2
        return hh

    def smaller(ps_):
        return [([(rt, max(6.5, rp - 0.5), rc, rf) for rt, rp, rc, rf in t], pt, col, face) if isinstance(t, list) else (t, max(6.5, pt - 0.5), col, face)
                for t, pt, col, face in ps_]

    def biggest(ps_):
        return max(rp for runs in norm(ps_) for _, rp, _ in runs)
    if (fill or line) and has_text and geom not in ("ellipse",):   # 상자 높이에 안 들면 글자를 줄인다(6.5pt 까지) — 글이 테두리를 넘지 않게(R120)
        room = h - ins[1] - ins[3]
        while text_h(fitted) > room + 0.02 and biggest(fitted) > 6.5:
            fitted = smaller(fitted)
    for t, pt, col, face in fitted:
        bu = ('<a:pPr marL="114300" indent="-114300" algn="{a}" latinLnBrk="0"><a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:buFont typeface="Arial"/><a:buChar char="·"/></a:pPr>'
              if bullet else '<a:pPr algn="{a}" latinLnBrk="0"><a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:buNone/></a:pPr>').format(a=algn)
        runs = t if isinstance(t, list) else [(t, pt, col, face)]   # 글 자리에 [(글, pt, 색, 서체)…] 를 주면 한 문단 안 여러 색
        ps += f'<a:p>{bu}' + "".join(
            f'<a:r><a:rPr lang="ko-KR" sz="{int(rp * 100)}"><a:solidFill><a:srgbClr val="{rc}"/></a:solidFill>'
            f'<a:latin typeface="{rf}"/><a:ea typeface="{rf}"/></a:rPr><a:t>{_esc(rt)}</a:t></a:r>' for rt, rp, rc, rf in runs) + '</a:p>'
    l, t_, r, b = (int(Cm(v)) for v in ins)
    tree.append(parse_xml(
        f'<p:sp xmlns:p="{P}" xmlns:a="{A}"><p:nvSpPr><p:cNvPr id="{max(ids) + 1}" name="{_esc(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
        f'<p:spPr><a:xfrm><a:off x="{int(Cm(x))}" y="{int(Cm(y))}"/><a:ext cx="{int(Cm(w))}" cy="{int(Cm(h))}"/></a:xfrm>'
        f'<a:prstGeom prst="{geom}"><a:avLst>{av}</a:avLst></a:prstGeom>{fill_x}{ln_x}</p:spPr>'
        f'<p:txBody><a:bodyPr wrap="{wrap}" lIns="{l}" tIns="{t_}" rIns="{r}" bIns="{b}" anchor="{anchor}"><a:noAutofit/></a:bodyPr><a:lstStyle/>{ps}</p:txBody></p:sp>'))


def _line(tree, x1, y1, x2, y2, col=LINE, w=9525, head=False):
    ids = [int(e.get("id")) for e in tree.iter(f"{{{P}}}cNvPr")] or [1]
    x, y, cx, cy = min(x1, x2), min(y1, y2), abs(x2 - x1), abs(y2 - y1)
    flip = (' flipH="1"' if x2 < x1 else "") + (' flipV="1"' if y2 < y1 else "")
    tail = '<a:tailEnd type="triangle" w="sm" len="sm"/>' if head else ""
    tree.append(parse_xml(
        f'<p:cxnSp xmlns:p="{P}" xmlns:a="{A}"><p:nvCxnSpPr><p:cNvPr id="{max(ids) + 1}" name="연결선"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr>'
        f'<p:spPr><a:xfrm{flip}><a:off x="{int(Cm(x))}" y="{int(Cm(y))}"/><a:ext cx="{int(Cm(cx))}" cy="{int(Cm(cy))}"/></a:xfrm>'
        f'<a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="{w}"><a:solidFill><a:srgbClr val="{col}"/></a:solidFill>{tail}</a:ln></p:spPr></p:cxnSp>'))


def _items(v, n=6):
    return [str(x).strip().lstrip("·•-▪ ") for x in (v or []) if str(x).strip()][:n]


def _list_h(items, w, pt=8.5):
    return sum(_lines(t, pt, w - 0.75) for t in items) * LH[0] + 0.3 if items else 0   # 안쪽 여백 0.36 + 글머리 들여쓰기 0.32


def fig_data(blk):
    """블록의 도식 자료 — kind 가 도식이 아니거나 자료가 비면 None(글 블록으로 그린다)"""
    k = str(blk.get("kind") or "").strip()
    f = blk.get("fig") if isinstance(blk.get("fig"), dict) else {}
    if k not in FIG_KINDS:
        return None
    need = {"concept": "pillars", "hub": "nodes", "photo": "queries", "compare": "left", "process": "steps", "cards": "cards", "rows": "rows", "layers": "layers", "org": "teams",
            "gantt": "rows", "kpi": "items", "strategy": "items", "effect": "items"}[k]
    return (k, f) if f.get(need) else None


def _vproc(f, W):
    """절차를 세로로 그리나 — A4 세로 문서는 위→아래 흐름이 기본(사용자 2026-10-14 "가로 발표장표가 아니라 세로 A4").
    가로 갈매기는 dir 이 "h" 이고 4단계 이하일 때만"""
    return not (str(f.get("dir") or "") == "h" and len(f.get("steps") or []) <= 4)


def _vstep_h(st, W):
    return max(0.8, 0.45 + _list_h(_items(st.get("items"), 3), W - 1.3) - 0.2)


def _org_top_h(f):
    """조직도 총괄 상자 높이 — 이름 한 줄(10pt)이면 0.8, 메모 줄(8pt)이 있으면 1.25"""
    return 1.25 if str(f.get("top_note") or "").strip() else 0.8


def fig_height(k, f, W=None):
    W = W or FW
    if k == "concept":
        ps = (f.get("pillars") or [])[:4]
        cw = (W - 0.3 * (len(ps) - 1)) / max(1, len(ps))
        body = max([_list_h(_items(p.get("items"), 4), cw) for p in ps] + [0.6])
        return 0.85 + 0.35 + 0.66 + body + (0.3 + 0.7 if f.get("base") else 0)
    if k == "compare":
        cw = (W - 1.1) / 2
        return 0.66 + max(_list_h(_items((f.get("left") or {}).get("items")), cw), _list_h(_items((f.get("right") or {}).get("items")), cw), 0.6)
    if k == "process":
        st = (f.get("steps") or [])[:7]
        if _vproc(f, W):   # 세로 절차 — 단계마다 한 줄(왼쪽 이름 · 오른쪽 설명), 사이 화살표 0.3
            return sum(_vstep_h(s_, W) for s_ in st) + (TIGHT_STEP if f.get("_tight") else 0.3) * (len(st) - 1)
        st = st[:6]
        cw = W / max(1, len(st))
        return 0.8 + 0.15 + max([_list_h(_items(s.get("items"), 3), cw - 0.1) for s in st] + [0.5])
    if k == "cards":
        cs = (f.get("cards") or [])[:4]
        cols = len(cs) if len(cs) <= 3 else 2
        cw = (W - 0.3 * (cols - 1)) / max(1, cols)
        rows = [cs[i:i + cols] for i in range(0, len(cs), cols)]
        return sum(0.72 + max([_list_h(_items(c.get("items"), 4), cw) for c in r] + [0.4]) for r in rows) + 0.25 * (len(rows) - 1)
    if k == "rows":
        return sum(max(0.62, _list_h(_items(r.get("items"), 4), W - 3.4) + 0.05) for r in (f.get("rows") or [])[:6]) + 0.12 * (len((f.get("rows") or [])[:6]) - 1)
    if k == "photo":   # 쪽 폭: 왼쪽 사진 + 오른쪽 설명 / 2단: 사진 위 + 설명 아래
        it = _items(f.get("items"), 3)
        if W < FW - 1:
            return 3.8 + 0.15 + 0.5 + (_list_h(it, W) if it else 0)
        return max(4.4, 0.6 + _list_h(it, W - 6.8))
    if k == "layers":
        return len((f.get("layers") or [])[:6]) * 0.87 - 0.12
    if k == "hub":   # 가운데 원 + 둘레 노드 2열(왼쪽·오른쪽)
        ns = (f.get("nodes") or [])[:6]
        per = math.ceil(len(ns) / 2) or 1
        nh = max([0.6 + _list_h(_items(n.get("items"), 3), (W - 4.6) / 2, 8) for n in ns] + [1.2])
        return max(4.2, per * nh + (per - 1) * 0.3)
    if k == "org":
        ts = (f.get("teams") or [])[:5]
        cw = (W - 0.25 * (len(ts) - 1)) / max(1, len(ts))
        return _org_top_h(f) + 0.5 + 0.35 + 0.62 + max([_list_h(_items(t.get("items"), 4), cw, 8) for t in ts] + [0.5])
    if k == "gantt":
        return 0.6 + 0.5 * len((f.get("rows") or [])[:10]) + (0.75 if f.get("milestones") else 0)
    if k == "kpi":
        return 1.9
    if k == "strategy":
        return sum(max(0.95, 0.3 + 0.45 + _lines(s.get("desc"), 8.5, W - 3.0) * LH[0]) for s in (f.get("items") or [])[:5]) + 0.15 * (len((f.get("items") or [])[:5]) - 1)
    if k == "effect":
        return max(0.9, _list_h(_items(f.get("items"), 4), W - 2.6) + 0.1)
    return 0


def draw_fig(tree, k, f, x, y, th, W=None, pic=None):
    """도식 하나를 (x, y)에서 폭 W(기본 FW, 2단이면 반쪽)로 그린다 — 높이는 fig_height 와 같게.
    pic(blob, x, y, w, h, name) = 그림 넣기(쪽 파트가 필요해 Build 가 넘긴다). 사진·아이콘 바이트는 resolve_assets 가 fig 에 _img·_icon 으로 붙인다"""
    W, calm, calm2, soft, pt_ = W or FW, th["calm"], th["calm2"], th["soft"], th["point"]
    pic = pic or (lambda *a: None)
    B3, B2 = "a시월구일3", "a시월구일2"

    def lst(name, bx, by, bw, bh, items, fill=None, line=LINE, pt=8.5):
        # 면·테두리 없는 글 상자는 왼쪽 여백 0 — 글이 소제목 선(T)에 바로 붙게(2단 사진 설명 0.18cm 어긋남, 3차 검수)
        _box(tree, name, bx, by, bw, bh, fill, line, paras=[(t, pt, INK, B2) for t in items], bullet=True,
             ins=(0.18 if (fill or line) else 0.0, 0.12, 0.18, 0.12))

    if k == "concept":   # 목표 띠 → 기둥 2~4 → 바탕 띠
        ps = (f.get("pillars") or [])[:4]
        n = max(1, len(ps))
        cw = (W - 0.3 * (n - 1)) / n
        _box(tree, "목표", x, y, W, 0.85, calm, None, "roundRect", 12000, [(f.get("goal") or "", 11, "FFFFFF", "a시월구일4")], "ctr", "ctr")
        yy = y + 0.85 + 0.35
        _line(tree, x + W / 2, y + 0.85, x + W / 2, yy, LINE)
        body = max([_list_h(_items(p.get("items"), 4), cw) for p in ps] + [0.6])
        for i, p in enumerate(ps):
            px = x + i * (cw + 0.3)
            _box(tree, "기둥 머리", px, yy, cw, 0.66, calm2, None, paras=[(p.get("title") or "", 9.5, "FFFFFF", B3)], algn="ctr", anchor="ctr")
            lst("기둥 내용", px, yy + 0.66, cw, body, _items(p.get("items"), 4), "FFFFFF")
        if f.get("base"):
            by = yy + 0.66 + body + 0.3
            _box(tree, "바탕", x, by, W, 0.7, soft, None, paras=[(f["base"], 9.5, INK, B3)], algn="ctr", anchor="ctr")
    elif k == "compare":   # As-Is → To-Be
        cw = (W - 1.1) / 2
        L, R_ = f.get("left") or {}, f.get("right") or {}
        li, ri = _items(L.get("items")), _items(R_.get("items"))
        bh = max(_list_h(li, cw), _list_h(ri, cw), 0.6)
        _box(tree, "현재", x, y, cw, 0.66, "9AA1AC", None, paras=[(L.get("title") or "As-Is", 9.5, "FFFFFF", B3)], algn="ctr", anchor="ctr")
        lst("현재 내용", x, y + 0.66, cw, bh, li, "FFFFFF")
        rx = x + cw + 1.1
        _box(tree, "개선", rx, y, cw, 0.66, calm, None, paras=[(R_.get("title") or "To-Be", 9.5, "FFFFFF", B3)], algn="ctr", anchor="ctr")
        lst("개선 내용", rx, y + 0.66, cw, bh, ri, soft, None)
        _box(tree, "화살표", x + cw + 0.25, y + 0.66 + bh / 2 - 0.35, 0.6, 0.7, pt_, None, "rightArrow", ins=(0, 0, 0, 0))
    elif k == "process" and _vproc(f, W):   # 세로 절차 = 타임라인 — 번호 원이 세로 선으로 이어지고 오른쪽에 단계 제목·설명(구분 행과 모양이 달라야 한다, 3차 검수)
        st = (f.get("steps") or [])[:7]
        hs = [_vstep_h(s_, W) for s_ in st]
        ys = [y + sum(hs[:i]) + (TIGHT_STEP if f.get("_tight") else 0.3) * i for i in range(len(st))]
        if len(st) > 1:
            _line(tree, x + 0.35, ys[0] + 0.35, x + 0.35, ys[-1] + 0.35, "B8BEC8", 15875)
        for i, (s_, h, yy) in enumerate(zip(st, hs, ys)):
            last = i == len(st) - 1
            _box(tree, "단계 원", x, yy, 0.7, 0.7, calm if last else calm2, None, "ellipse", None,
                 [(f"{i + 1:02d}", 8.5, "FFFFFF", "a시월구일4")], "ctr", "ctr", ins=(0, 0, 0, 0), wrap="none")
            _box(tree, "단계 제목", x + 1.0, yy, W - 1.0, 0.7, None, None, paras=[(s_.get("title") or "", 10, INK, "a시월구일4")], anchor="ctr", ins=(0, 0, 0, 0))
            its = _items(s_.get("items"), 3)
            if its:
                lst("단계 설명", x + 0.85, yy + 0.55, W - 0.85, h - 0.5, its, None, None)
            if not last:
                _line(tree, x + 1.0, yy + h + 0.15, x + W, yy + h + 0.15, "E6E9EE", 6350)
    elif k == "process":   # 단계 갈매기 → 단계별 설명(2단·짧은 흐름 전용)
        st = (f.get("steps") or [])[:6]
        n = max(1, len(st))
        cw = W / n
        body = max([_list_h(_items(s.get("items"), 3), cw - 0.1) for s in st] + [0.5])
        for i, s in enumerate(st):
            sx = x + i * cw
            t = s.get("title") or ""
            pt = 9.5
            while pt > 7.5 and text_cm(t, pt, B3) > cw - 0.75:
                pt -= 0.5
            _box(tree, "단계", sx, y, cw + (0.18 if i < n - 1 else 0), 0.8, calm if i == n - 1 else calm2, None,
                 "homePlate" if i == 0 else "chevron", 30000, [(f"{i + 1:02d} {t}" if len(t) <= 9 else t, pt, "FFFFFF", B3)], "ctr", "ctr",
                 ins=(0.3 if i else 0.12, 0, 0.3, 0), wrap="none")   # 갈매기 글은 한 줄('03 적재' 두 줄 사례)
            lst("단계 설명", sx + 0.05, y + 0.95, cw - 0.1, body, _items(s.get("items"), 3), soft if i == n - 1 else "FFFFFF", LINE)
    elif k == "cards":
        cs = (f.get("cards") or [])[:4]
        cols = len(cs) if len(cs) <= 3 else 2
        cw = (W - 0.3 * (cols - 1)) / max(1, cols)
        yy = y
        for r0 in range(0, len(cs), cols):
            row = cs[r0:r0 + cols]
            bh = max([_list_h(_items(c.get("items"), 4), cw) for c in row] + [0.4])
            for j, c in enumerate(row):
                cx = x + j * (cw + 0.3)
                ic = c.get("_icon")
                _box(tree, "카드 머리", cx, yy, cw, 0.72, soft, LINE, paras=[([(f"{r0 + j + 1:02d}  ", 9.5, pt_, "a시월구일4"), (c.get("title") or "", 9.5, INK, B3)], 9.5, INK, B3)],
                     anchor="ctr", ins=(0.85 if ic else 0.2, 0.04, 0.15, 0.04))
                if ic:
                    pic(ic, cx + 0.15, yy + 0.08, 0.56, 0.56, "아이콘")
                lst("카드 내용", cx, yy + 0.72, cw, bh, _items(c.get("items"), 4), "FFFFFF")
            yy += 0.72 + bh + 0.25
    elif k == "rows":   # 구분 | 내용 행
        yy = y
        for r in (f.get("rows") or [])[:6]:
            it = _items(r.get("items"), 4)
            h = max(0.62, _list_h(it, W - 3.4) + 0.05)
            _box(tree, "구분", x, yy, 3.2, h, calm2, None, paras=[(r.get("label") or "", 9, "FFFFFF", B3)], algn="ctr", anchor="ctr", ins=(0.1, 0.05, 0.1, 0.05))
            lst("내용", x + 3.3, yy, W - 3.3, h, it, "FFFFFF")
            yy += h + 0.12
    elif k == "hub":   # 허브 — 가운데 원(핵심) + 왼쪽·오른쪽 노드, 원과 노드를 선으로(샘플 '정보공유시스템 개념도' 꼴)
        ns = (f.get("nodes") or [])[:6]
        per = math.ceil(len(ns) / 2) or 1
        nw = (W - 4.6) / 2
        nh = max([0.6 + _list_h(_items(n.get("items"), 3), nw, 8) for n in ns] + [1.2])
        H = max(4.2, per * nh + (per - 1) * 0.3)
        d = min(3.6, H - 0.4)
        cx, cy = x + W / 2, y + H / 2
        for i, n in enumerate(ns):
            col, row = (0, i) if i < per else (1, i - per)
            nx = x if col == 0 else x + W - nw
            ny = y + row * (nh + 0.3) + (H - (per * nh + (per - 1) * 0.3)) / 2
            _line(tree, nx + (nw if col == 0 else 0), ny + nh / 2, cx + (-d / 2 if col == 0 else d / 2), cy, "9AA1AC", 9525)
            ic = n.get("_icon")
            _box(tree, "허브 노드", nx, ny, nw, nh, "FFFFFF", LINE, "roundRect", 8000,
                 [(n.get("title") or "", 9, INK, B3)] + [(t, 8, INK, B2) for t in _items(n.get("items"), 3)], anchor="ctr", ins=(1.05 if ic else 0.2, 0.08, 0.15, 0.08))
            if ic:
                pic(ic, nx + 0.2, ny + nh / 2 - 0.36, 0.72, 0.72, "아이콘")
        _box(tree, "허브 테", cx - d / 2 - 0.15, cy - d / 2 - 0.15, d + 0.3, d + 0.3, soft, None, "ellipse", ins=(0, 0, 0, 0))
        cpt = 11
        while cpt > 8 and text_cm(str(f.get("center") or ""), cpt, "a시월구일4") > d * 0.72:
            cpt -= 0.5   # 원 안 낱말이 끊기지 않게('식품안전나/라' 사례) — 원 폭 72% 안에 들게
        _box(tree, "허브 중심", cx - d / 2, cy - d / 2, d, d, calm, None, "ellipse", None,
             [(f.get("center") or "", cpt, "FFFFFF", "a시월구일4")] + ([(f["center_note"], 8, "E8EBF0", B2)] if f.get("center_note") else []),
             "ctr", "ctr", ins=(0.1, 0.1, 0.1, 0.1))
    elif k == "photo":   # 파워에셋 사진 + 설명
        it = _items(f.get("items"), 3)
        cap = str(f.get("caption") or "")
        if W < FW - 1:   # 2단 — 사진 위, 설명 아래
            if f.get("_img"):
                pic(cover_crop(f["_img"], W, 3.8, ax=f.get("_ax", 0.5), ay=f.get("_ay", 0.4)), x, y, W, 3.8, "사진")
            else:
                _box(tree, "사진 자리", x, y, W, 3.8, soft, None, paras=[("[사진 — 제안사 첨부]" if f.get("_need_photo") else "[사진]", 9, SUB, B2)], algn="ctr", anchor="ctr")
            _box(tree, "사진 설명", x, y + 3.95, W, 0.5, None, None, paras=[(cap, 9, INK, B3)], ins=(0, 0, 0, 0), anchor="ctr")
            if it:
                lst("사진 글", x, y + 4.45, W, _list_h(it, W), it, None, None)
        else:   # 쪽 폭 — 왼쪽 사진 6.5cm, 오른쪽 설명
            H = max(4.4, 0.6 + _list_h(it, W - 6.8))
            if f.get("_img"):
                pic(cover_crop(f["_img"], 6.5, H, ax=f.get("_ax", 0.5), ay=f.get("_ay", 0.4)), x, y, 6.5, H, "사진")
            else:
                _box(tree, "사진 자리", x, y, 6.5, H, soft, None, paras=[("[사진 — 제안사 첨부]" if f.get("_need_photo") else "[사진]", 9, SUB, B2)], algn="ctr", anchor="ctr")
            _box(tree, "사진 바탕", x + 6.7, y, W - 6.7, H, soft, None, ins=(0, 0, 0, 0))
            _box(tree, "사진 설명", x + 6.9, y + 0.15, W - 7.1, 0.5, None, None, paras=[(cap, 10, INK, "a시월구일4")], ins=(0, 0, 0, 0), anchor="ctr")
            if it:
                lst("사진 글", x + 6.8, y + 0.7, W - 6.9, H - 0.8, it, None, None)
    elif k == "layers":   # 계층 구성도 — 위(사용자)에서 아래(인프라)로, 층마다 이름 + 요소 칩
        yy = y
        for r in (f.get("layers") or [])[:6]:
            _box(tree, "층 이름", x, yy, 2.8, 0.75, calm2, None, paras=[(r.get("title") or "", 9, "FFFFFF", B3)], algn="ctr", anchor="ctr", ins=(0.05, 0, 0.05, 0))
            _box(tree, "층 바탕", x + 2.9, yy, W - 2.9, 0.75, soft, None, ins=(0, 0, 0, 0))
            it = [str(v) for v in (r.get("items") or []) if str(v).strip()][:6] or [""]
            gap, cw = 0.15, (W - 2.9 - 0.3 - 0.15 * (len(it) - 1)) / len(it)
            for j, v in enumerate(it):
                pt = 8.5
                while pt > 7 and text_cm(v, pt, B3) > cw - 0.2:
                    pt -= 0.5
                _box(tree, "요소", x + 3.05 + j * (cw + gap), yy + 0.12, cw, 0.51, "FFFFFF", LINE, "roundRect", 12000, [(v, pt, INK, B3)], "ctr", "ctr", ins=(0.05, 0, 0.05, 0))
            yy += 0.87
    elif k == "org":   # 총괄 → (곁 조직) → 팀
        ts = (f.get("teams") or [])[:5]
        n = max(1, len(ts))
        cw = (W - 0.25 * (n - 1)) / n
        th_ = _org_top_h(f)   # 메모(top_note)가 있으면 두 줄 + 위아래 여백(예전엔 0.8cm 에 두 줄이라 글이 테두리에 붙었다, R120)
        tw = min(W, max(4.6, max(text_cm(str(f.get("top") or "사업책임자(PM)"), 10, "a시월구일4"), text_cm(str(f.get("top_note") or ""), 8, B2)) * 1.08 + 2 * BOX_PAD + 0.2))
        tx = x + (W - tw) / 2
        _box(tree, "총괄", tx, y, tw, th_, calm, None, "roundRect", 12000,
             [(f.get("top") or "사업책임자(PM)", 10, "FFFFFF", "a시월구일4")] + ([(f["top_note"], 8, "E8EBF0", B2)] if f.get("top_note") else []), "ctr", "ctr")
        side = [str(s) for s in (f.get("side") or [])][:2]
        for j, sname in enumerate(side):
            sx = x + 0.2 if j == 0 else x + W - 3.6 - 0.2
            _line(tree, sx + (3.6 if j == 0 else 0), y + th_ / 2, tx if j == 0 else tx + tw, y + th_ / 2, "9AA1AC", 9525)
            _box(tree, "곁 조직", sx, y + th_ / 2 - 0.28, 3.6, 0.56, "FFFFFF", "9AA1AC", "roundRect", 12000, [(sname, 8.5, INK, B3)], "ctr", "ctr", ins=(0.05, 0, 0.05, 0))
        ly = y + th_ + 0.5
        _line(tree, x + W / 2, y + th_, x + W / 2, ly, "9AA1AC")
        if n > 1:
            _line(tree, x + cw / 2, ly, x + W - cw / 2, ly, "9AA1AC")
        body = max([_list_h(_items(t.get("items"), 4), cw, 8) for t in ts] + [0.5])
        for i, t in enumerate(ts):
            cx = x + i * (cw + 0.25)
            _line(tree, cx + cw / 2, ly, cx + cw / 2, ly + 0.35, "9AA1AC")
            _box(tree, "팀", cx, ly + 0.35, cw, 0.62, calm2, None, paras=[(t.get("title") or "", 9, "FFFFFF", B3)], algn="ctr", anchor="ctr", ins=(0.05, 0, 0.05, 0))
            lst("팀 역할", cx, ly + 0.97, cw, body, _items(t.get("items"), 4), "FFFFFF", pt=8)
    elif k == "gantt":   # 활동 × 기간 막대
        cols = [str(c) for c in (f.get("cols") or [])][:12] or [f"{i}월" for i in range(1, 7)]
        rows = (f.get("rows") or [])[:10]
        lw_ = 3.8
        cw = (W - lw_) / len(cols)
        _box(tree, "일정 머리", x, y, lw_, 0.6, th["tbl"], None, paras=[("구분", 8.5, "FFFFFF", B3)], algn="ctr", anchor="ctr")
        for j, c in enumerate(cols):
            _box(tree, "기간", x + lw_ + j * cw, y, cw, 0.6, th["tbl"], "FFFFFF", paras=[(c, 8 if cw > 1 else 7, "FFFFFF", B3)], algn="ctr", anchor="ctr", ins=(0, 0, 0, 0), lw=6350)
        for i, r in enumerate(rows):   # 바탕 → 세로 칸선 → 막대 순(선이 막대를 덮지 않게)
            ry = y + 0.6 + i * 0.5
            _box(tree, "활동", x, ry, lw_, 0.5, soft if i % 2 == 0 else "FFFFFF", None, paras=[(r.get("task") or "", 8.5, INK, B3)], anchor="ctr", ins=(0.15, 0, 0.05, 0))
            _box(tree, "칸", x + lw_, ry, W - lw_, 0.5, soft if i % 2 == 0 else "FFFFFF", None, ins=(0, 0, 0, 0))
        for j in range(len(cols) + 1):
            _line(tree, x + lw_ + j * cw, y + 0.6, x + lw_ + j * cw, y + 0.6 + 0.5 * len(rows), "E1E4E9", 6350)
        for i, r in enumerate(rows):
            ry = y + 0.6 + i * 0.5
            try:
                a = max(1, min(len(cols), int(r.get("from") or 1)))
                b = max(a, min(len(cols), int(r.get("to") or a)))
            except (TypeError, ValueError):
                continue
            _box(tree, "막대", x + lw_ + (a - 1) * cw + 0.08, ry + 0.13, (b - a + 1) * cw - 0.16, 0.24, pt_ if r.get("key") else calm2, None,
                 "roundRect", 50000, ins=(0, 0, 0, 0))
        my = y + 0.6 + 0.5 * len(rows) + 0.08
        for m in (f.get("milestones") or [])[:6]:   # 마일스톤 — 마름모 + 이름
            try:
                at = max(1, min(len(cols), int(m.get("at") or 1)))
            except (TypeError, ValueError):
                continue
            mx = x + lw_ + (at - 0.5) * cw
            _box(tree, "마일스톤", mx - 0.14, my, 0.28, 0.28, pt_, None, "diamond", ins=(0, 0, 0, 0))
            _box(tree, "마일스톤 이름", mx - 1.3, my + 0.3, 2.6, 0.36, None, None, paras=[(m.get("title") or "", 7.5, INK, B3)], algn="ctr", anchor="t", ins=(0, 0, 0, 0))
    elif k == "kpi":   # 핵심 수치 2~4
        it = (f.get("items") or [])[:4]
        n = max(1, len(it))
        cw = (W - 0.3 * (n - 1)) / n
        for i, d in enumerate(it):
            cx = x + i * (cw + 0.3)
            vpt = 18
            while vpt > 11 and text_cm(str(d.get("value") or ""), vpt, "a시월구일4") > cw - 0.4:
                vpt -= 1   # 숫자가 칸보다 넓으면 두 줄로 깨진다('819,763.5 68건' 사례) — 한 줄에 들게 줄인다
            _box(tree, "지표", cx, y, cw, 1.9, soft, None, "roundRect", 8000,
                 [(d.get("value") or "", vpt, pt_, "a시월구일4"), (d.get("label") or "", 9, INK, B3)] + ([(d["note"], 7.5, SUB, B2)] if d.get("note") else []),
                 "ctr", "ctr", ins=(0.1, 0.08, 0.1, 0.08))
    elif k == "strategy":   # 전략 01 · 제목 · 한 줄
        yy = y
        for i, s in enumerate((f.get("items") or [])[:5]):
            h = max(0.95, 0.3 + 0.45 + _lines(s.get("desc"), 8.5, W - 3.0) * LH[0])
            _box(tree, "전략 바탕", x, yy, W, h, soft, None, ins=(0, 0, 0, 0))
            _box(tree, "전략 번호", x, yy, 2.4, h, calm, None, paras=[(s.get("tag") or f"전략 {i + 1:02d}", 9.5, "FFFFFF", "a시월구일4")], algn="ctr", anchor="ctr", ins=(0.05, 0, 0.05, 0))
            if s.get("_icon"):
                pic(s["_icon"], x + W - 0.95, yy + h / 2 - 0.36, 0.72, 0.72, "아이콘")
            _box(tree, "전략 내용", x + 2.6, yy, W - 2.7 - (0.9 if s.get("_icon") else 0), h, None, None,
                 paras=[(s.get("title") or "", 10.5, INK, "a시월구일4")] + ([(s["desc"], 8.5, SUB, B2)] if s.get("desc") else []), anchor="ctr", ins=(0.1, 0.08, 0.1, 0.08))
            yy += h + 0.15
    elif k == "effect":   # 기대효과 상자
        it = _items(f.get("items"), 4)
        h = max(0.9, _list_h(it, W - 2.6) + 0.1)
        _box(tree, "기대효과 바탕", x, y, W, h, soft, None, "roundRect", 8000, ins=(0, 0, 0, 0))
        _box(tree, "기대효과 이름", x + 0.25, y + h / 2 - 0.3, 1.9, 0.6, calm, None, "roundRect", 50000, [(f.get("label") or "기대효과", 9, "FFFFFF", B3)], "ctr", "ctr", ins=(0, 0, 0, 0))
        lst("기대효과 내용", x + 2.4, y + 0.05, W - 2.5, h - 0.1, it, None, None)


def client_logo(o):
    c = o["project"]["client"]
    if not c:
        return None
    try:
        d = _api("GET", "/assets/items?" + urllib.parse.urlencode({"category": "logo", "q": c, "limit": 5}))
        rows = d.get("data") or []
        hit = next((r for r in rows if c.replace(" ", "") in str(r.get("name") or "").replace(" ", "")), None)
        if hit:
            return _api("GET", f"/assets/items/{hit['id']}/file/original", raw=True)
    except Exception:
        pass
    return None


# ───────────────────────── 실행
def run(job, j, opts, brief, note):
    _STATE.set({})   # 이 작업만의 서체·줄 높이 — 같은 엔진에서 함께 도는 다른 세로 제안서와 섞이지 않게
    req, put_file = design.W["req"], design.W["put_file"]
    pages = int(opts.get("slides") or 0) or DEFAULT_PAGES
    job.push("기획", 4)
    job.event("세로 제안서(A4) — 자료를 읽고 RFP 권고 목차대로 장·절을 정합니다.")
    ctx, raw = _ctx(job, j, brief)
    # 이어 만들기(R81) — 앞 실행이 목차·본문 기획까지 마치고 뒤(배경·조립·올리기)에서 실패했으면, 같은 자료·요청이면 그 기획을 쓴다.
    # 지문 = 직접 쓴 글·요청 사항(원문, 개선 체크리스트 문구 제외 — 실패할 때마다 늘어 지문이 늘 달라진다)·쪽 수·사업 요약·자료 원문
    sig = resume.sig_of({"brief": brief, "note": (j.get("note") or "").strip(), "pages": pages, "ctx": ctx,
                         "raw": hashlib.sha256(raw.encode("utf-8", "replace")).hexdigest(), "kind": "vertical"})
    keep = os.path.join(job.dir, "_slides", "_vertical.json")
    ent = (resume.built_fresh(job).get("vertical") or {})
    saved = None
    if ent.get("sig") == sig and os.path.isfile(keep):
        try:
            saved = json.load(open(keep, encoding="utf-8"))
            if not (isinstance(saved, dict) and (saved.get("outline") or {}).get("chapters")):
                saved = None
        except Exception:
            saved = None

    def keep_plan(o, pages_):
        try:
            os.makedirs(os.path.dirname(keep), exist_ok=True)
            with open(keep + ".tmp", "w", encoding="utf-8") as f:
                json.dump({"outline": o, "pages": pages_}, f, ensure_ascii=False)
            os.replace(keep + ".tmp", keep)
            resume.built_put(job, "vertical", {"sig": sig, "file": "_slides/_vertical.json"})
        except Exception as e:
            design.W["log"]("세로 제안서 기획 보관 실패(무시):", e)

    if saved:
        o = saved["outline"]
        old_pages = {int(k): v for k, v in (saved.get("pages") or {}).items() if str(k).lstrip("-").isdigit()}
        job.event(f"앞 실행에서 만든 목차를 다시 씁니다 — {o['project'].get('name', '')} / {len(o['chapters'])}장 (목차 AI 호출 없음).", "done")
    else:
        o = outline(job, brief, note, ctx, raw, pages, str(opts.get("project") or "").strip() or design.clean_title(str(j.get("title") or "")))
        o = fit_outline(job, o, pages, bool(opts.get("slides_set")))   # 쪽 수를 적었으면 그 수에 맞춰(R107)
        old_pages = {}
        keep_plan(o, {})   # 목차만이라도 먼저 — 본문 기획 도중 실패해도 다시 돌리면 목차는 다시 짜지 않는다
    p = o["project"]
    job.event(f"목차 완료 — {p['name']} / {len(o['chapters'])}장. 비용 ${job.spent:.3f}", "done")
    its = [it for c in o["chapters"] for s in c.get("sections") or [] for it in s.get("items") or [] if it.get("_brief")]
    rules = {}
    for it in its:
        rules[it["_brief"]["rule_label"]] = rules.get(it["_brief"]["rule_label"], 0) + 1
    job.event(f"자료 수집: RFP 요구사항 {o.get('_reqs', 0)}건 · 근거가 붙은 항목 {sum(1 for it in its if it['_brief']['evidence'])}/{len(its)} · 규칙 "
              + " · ".join(f"{k} {v}" for k, v in sorted(rules.items(), key=lambda x: -x[1])[:8]), "done")
    job.push("기획", 12)
    body = [(i, c) for i, c in enumerate(o["chapters"]) if c["no"] != "※"]
    chapters_pages = {i: old_pages[i] for i, c in body if old_pages.get(i)}   # 앞 실행에서 본문을 만든 장은 그대로(빈 장 = 그때 실패한 장만 다시)
    if chapters_pages:
        job.event(f"앞 실행에서 만든 본문 {len(chapters_pages)}장을 다시 씁니다" + (f" — 나머지 {len(body) - len(chapters_pages)}장만 만듭니다." if len(chapters_pages) < len(body) else " (본문 AI 호출 없음)."), "done")
    # 본문 진행률은 장이 아니라 항목 단위로(_tick) — 41쪽짜리 장 하나가 남으면 장 단위로는 끝날 때까지 12% 였다(R106)
    import threading
    job._vp = {"lock": threading.RLock(), "done": 0,
               "total": sum(len(s.get("items") or []) for i, c in body if i not in chapters_pages for s in c.get("sections") or []),
               "pages_total": sum(int(it.get("pages") or 1) for i, c in body for s in c.get("sections") or [] for it in s.get("items") or [])}
    for i, c in body:   # 앞 실행에서 다 쓴 장도 미리 보기 카드에 먼저 보인다
        if chapters_pages.get(i):
            _live(job, c, chapters_pages[i])
    with ThreadPoolExecutor(max_workers=design.par(job, 2, 4)) as ex:
        futs = {ex.submit(_carry(chapter_pages), job, o, c, ctx, raw): i for i, c in body if i not in chapters_pages}
        total, done = len(body), len(chapters_pages)
        for f in as_completed(futs):   # 끝나는 순서대로 — 앞 장이 오래 걸려도 다 쓴 장은 바로 저장·진행률에 든다
            i = futs[f]
            try:
                chapters_pages[i] = f.result()
                job.event(f"{o['chapters'][i]['no']} {o['chapters'][i]['title']} — 본문 {len(chapters_pages[i])}쪽 ({done + 1}/{total}장)", "done")
            except design.Cancelled:
                raise
            except Exception as e:
                chapters_pages[i] = []
                job.event(f"{o['chapters'][i]['title']} 본문 실패 — 간지만 넣습니다: {str(e)[:120]}", "warn")
            done += 1
            # 장마다 바로 보관 — 모든 장이 끝난 뒤 한 번만 저장해, 도중에 멈추면 다 쓴 장도 버리고 처음부터 다시 썼다(10-28, R105)
            keep_plan(o, {k: v for k, v in chapters_pages.items() if v})
    if futs:
        keep_plan(o, chapters_pages)
    job.push("기획", 38)   # 본문(첫 쓰기·고쳐 쓰기) 끝
    try:
        d = os.path.join(job.dir, "_mockup")
        os.makedirs(d, exist_ok=True)
        pj = os.path.join(d, "vertical.json")
        json.dump({"outline": o, "pages": chapters_pages}, open(pj, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        put_file(job.id, "extra", pj, "세로제안서_기획.json")
    except Exception:
        pass
    mix = kind_mix(chapters_pages)
    names = vertical_rules.NAMES
    job.event("본문 구성(쪽 첫 블록): " + " · ".join(f"{names.get(k, k)} {n}" for k, n in sorted(mix.items(), key=lambda x: -x[1])), "done")
    style = str(opts.get("vstyle") or "band")
    tone = str(opts.get("vtone") or opts.get("vtheme") or "navy")
    bgk, bdk = bg_kind(style), body_kind(style)   # 배경 세트는 테마가 정한다(톤은 색만) — 사용자 2026-10-16
    BGN = {"photo": "실사", "3d": "3D 렌더", "glass": "유리 아이소메트릭", "dark": "다크 키비주얼"}
    job.event(f"배경 그림: 테마 {(STYLES.get(style) or STYLES['band'])['label']} → 표지·간지 {BGN[bgk]}({VP_SETS[bgk]}"
              + (f", 반쪽 {STYLE_HALF[style] + 1}" if style in STYLE_HALF else "") + f") · 깔기 {STYLE_COMPOSE.get(style, '전면')} · 본문 사진 {BGN[bdk]}")
    photo_got = None
    try:
        got = photo_got = resolve_assets(job, chapters_pages, bdk, f"{p.get('name', '')} {o.get('field') or ''}")
        if got:
            job.event(f"파워에셋 본문 그림: 사진 {got['photo']} · 아이콘 {got['icon']}(세트 {ICON_SET})" + (f" · 못 찾음 {got['miss']}" if got["miss"] else ""), "done")
            if got.get("skipped"):
                job.event(f"사업·칸 주제와 맞는 사진이 없어 비워 둔 사진 칸 {len(got['skipped'])}개 — " + " / ".join(x[:40] for x in got["skipped"][:4]), "warn")
    except Exception as e:
        job.event(f"파워에셋 본문 그림 검색 실패(도식만으로 만듭니다): {str(e)[:100]}", "warn")
    job.push("시안 생성", 40)
    job.event("표지·목차·간지 배경 — powerAssets 에서 먼저 찾고, 없으면 나노바나나로 만듭니다.")
    bgs, bglog = backgrounds(job, o, style)
    job.event("배경: " + " · ".join(bglog), "done")
    logo = client_logo(o)
    job.push("시안 생성", 70)
    out = os.path.join(job.dir, "결과.pptx")
    import fontset   # 장표 언어·기획 글에 없는 글자의 서체 → 그 언어 기본 서체(가로 장표와 같은 판단, 2026-10-18)
    _ft, _fb, _fn = fontset.for_lang(opts.get("font_title"), opts.get("font_body"), getattr(job, "lang", "ko"), fontset.text_of(o))
    for m in _fn:
        job.event(m, "warn")
    use_fonts(_ft, _fb, getattr(job, "lang", "ko"))
    bd = Build(o, bgs, logo, style, tone)
    n = bd.build(chapters_pages, out)
    if bd.trimmed:
        job.event(f"쪽이 넘쳐 덜어 낸 행 {len(bd.trimmed)}개 — " + " / ".join(bd.trimmed[:4]), "warn")
    if getattr(bd, "appendix", 0):
        job.event(f"별첨 {bd.appendix}쪽 — 요구사항 대응표·약어표는 본문에서 엔진이 채우고, 나머지는 「[제안사 작성]」 서식(AI 호출 없음)", "done")
    # 정말 지운 행이 있으면 확인 목록에 쪽별로(R117 — 지금은 '(계속)' 쪽으로 넘겨 비어 있어야 한다)
    n_of = {str(x.get("title") or ""): x.get("n", 0) for x in getattr(bd, "pages", [])}
    left_check = []
    try:   # 빈칸·메모 문구(R149) — 「제안사 작성」은 양식이라 빼고, 쪽 번호와 함께 확인 목록에
        import flatfx
        for no_, sl_ in enumerate(Presentation(out).slides, 1):
            for t_ in flatfx.leftovers(sl_)[:2]:
                left_check.append({"slide": no_, "title": "빈칸·메모 문구가 남음", "level": "warn", "detail": t_})
    except Exception as e:
        design.W["log"]("빈칸 문구 검사 실패(무시):", e)
    photo_check = [{"slide": 0, "title": "사진 칸 비어 있음", "level": "warn",
                    "detail": f"{x[:80]} — 사업·칸 주제와 맞는 파워에셋 사진이 없어 비워 두었습니다(제안사 사진을 넣어 주세요)"}
                   for x in (photo_got or {}).get("skipped", [])[:10]]
    trimmed_check = [{"slide": n_of.get(t.split(": ")[0], 0), "title": "넘쳐서 덜어 낸 행", "level": "warn", "detail": t} for t in bd.trimmed]
    try:   # 정렬 검사 — 세로 기준선이 '거의 같은데 다른' 곳(눈대중으로 놓쳤던 표지 뱃지 0.56cm 사례, 2026-10-14)
        align = audit_align(Presentation(out))
    except Exception as e:
        align = [f"정렬 검사 실패: {str(e)[:80]}"]
    job.event(f"정렬 검사: 세로 기준선 어긋남 {len(align)}건" + (" — " + " / ".join(align[:3]) if align else ""), "warn" if align else "done")
    job.event(f"서체: 제목 {FONT['title'][0]}(표지·목차·간지·쪽 제목) · 본문 {FONT['body'][0]}")
    job.event(f"디자인: {(STYLES.get(style) or STYLES['band'])['label']} · 톤 {(TONES.get(tone) or TONES['navy'])['label']}")
    job.event(f"세로 제안서 {n}장(표지·목차·간지·본문)을 만들었습니다.", "done")
    try:   # 작성 가이드 — 사용법·서식 규칙표·1~4 depth 견본(같은 스타일·톤)
        gp = os.path.join(job.dir, "세로제안서_작성가이드.pptx")
        build_guide(o["project"], style, tone, logo, gp)
        put_file(job.id, "extra", gp)
        job.event("작성 가이드(사용법·서식 규칙표·1~4 depth 견본)를 함께 넣었습니다.", "done")
    except Exception as e:
        job.event(f"작성 가이드를 만들지 못했습니다(결과 장표는 정상): {str(e)[:120]}", "warn")
    try:   # 쓴 서체 파일 — 산출물 묶음(zip)의 '5_서체'(가로 장표와 같은 규칙). 사용자 2026-10-14 "산출물에 폰트가 없는데?"
        # 결과 pptx 에 실제로 적힌 서체를 모은다(fontbundle — 섞인 언어 글은 그 언어 서체로 바꾼 뒤, 라이선스·설치 안내 포함, 2026-10-18)
        import fontbundle
        _sz = fontbundle.sanitize_pptx(out)   # refont 가 못 잡은 남의 서체까지 — 마지막 한 번 더(R97)
        if _sz:
            job.event(fontbundle.sanitize_note(_sz), "warn")
        fbk = fontbundle.fallback_pptx(out)
        if fbk:
            job.event(f"다른 언어 글 {len(fbk)}곳을 그 글자가 있는 서체로 바꿨습니다(" + " · ".join(dict.fromkeys(f"{a} → {b}" for a, b, _ in fbk)) + ")", "warn")
        allp, miss_, noship_ = fontbundle.bundle(out, os.path.join(job.dir, "_fonts"))
        fp = [f for f in allp if re.search(r"\.(ttf|otf|ttc)$", f, re.I)]
        skip = miss_ + noship_
        for f in allp:
            put_file(job.id, "extra", f)
        job.event(f"이 장표에 쓰인 서체 {len(fp)}개를 산출물에 넣었습니다(" + ", ".join(os.path.basename(f) for f in fp) + ") · 설치 안내·라이선스 포함"
                  + (f" · 넣지 않음: {', '.join(skip)}(재배포가 안 되거나 엔진에 없음 — 받는 사람이 따로 설치, 작성 가이드의 설치 안내 참고)" if skip else ""), "done" if fp else "warn")
    except Exception as e:
        job.event(f"서체 파일을 산출물에 넣지 못했습니다: {str(e)[:100]}", "warn")
    job.push("시안 정리", 96)
    try:
        design.W.get("upload_after", lambda *a, **k: None)(job, out)
    except Exception as e:
        job.event(f"장별 미리 보기 렌더 실패(결과 파일은 정상): {str(e)[:120]}", "warn")
    put_file(job.id, "result", out)
    try:
        design.W.get("text_map", lambda *a, **k: None)(job, out)
    except Exception:
        pass
    n_body = sum(len(v) for v in chapters_pages.values())
    req("POST", f"/worker/jobs/{job.id}/finish", {"status": "done", "result_name": "결과.pptx", "engine": "vertical", "report": {
        "summary": f"{p['name']} — A4 세로 제안서 {n}장(본문 {n_body}쪽, {len(o['chapters'])}장 구성)",
        "stats": [{"label": "전체 장", "value": n}, {"label": "본문 쪽", "value": n_body}, {"label": "장 구성", "value": len(o["chapters"])}],
        "pages": getattr(bd, "pages", []), "fonts": {"title": FONT["title"][0], "body": FONT["body"][0]},
        "checklist": trimmed_check + left_check[:12] + photo_check + [{"slide": int(re.match(r"(\d+)", a).group(1)) if re.match(r"(\d+)", a) else 0, "title": "세로 기준선 어긋남", "level": "warn", "detail": a} for a in align[:10]]
                     + [{"slide": 0, "title": "제안사 정보 확인", "level": "info",
                       "detail": "회사 현황·실적·인력·지분처럼 자료에 없는 제안사 정보는 「[제안사 작성]」 자리로 두었습니다."}],
        "changes": bglog}})
    resume.built_done(job)   # 끝까지 성공 — 이 작업을 다시 돌리면(새로 만들어 달라는 뜻) 기획을 이어 쓰지 않는다(R81)


# ───────────────────────── 작성 가이드(결과에 함께 넣는다) — 컨소시엄 업체가 같은 규칙으로 쓰게(사용자 2026-10-14)
def guide_pages(th):
    b = lambda head, bar, bullets, small="", table=None: dict(head=head, small=small, bar=bar, bullets=bullets, **({"table": table} if table else {}))
    spec1 = {"cols": ["요소", "글꼴", "크기", "색 · 속성"], "rows": [
        ["머리 띠 장 이름", "a시월구일3", "12pt", "흰색(띠 위) · 띠 높이 가운데"],
        ["장 번호 배지", "a시월구일3", "12pt", "배지 색 위 · 가운데"],
        ["사업명(머리)", "a시월구일2", "8pt", "오른쪽 정렬"],
        ["경로 줄", "a시월구일2", "10pt", f"#{SUB}"],
        ["쪽 제목", "G마켓 산스 TTF Bold", "18pt", f"#{INK} · 번호만 #{th['point']} · 한 줄"],
        ["요구사항 꼬리표", "a시월구일3 / a시월구일2", "8pt", "번호 3개 + 외 N"],
        ["쪽 번호", "a시월구일1", "9pt", "장별 'Ⅱ - 3' · 아래 가운데"]]}
    spec2 = {"cols": ["요소", "글꼴", "크기", "색 · 속성"], "rows": [
        ["도입 문단", "a시월구일2 / 강조 a시월구일3", "11pt", "#686868 · 줄간격 1.25 · 2문장"],
        ["띠 문구", "a시월구일4", "13pt", "흰색 · 한 줄"],
        ["소제목", "a시월구일3", "12pt", f"#{INK}"],
        ["작은 제목", "a시월구일3", "10.5pt", f"#{INK}"],
        ["막대 제목", "a시월구일3", "11pt", f"#{INK} · 바탕 #D9D9D9 50%"],
        ["본문 글", "a시월구일2", "9pt", "#4D4D4D · 줄간격 1.0 · 앞 점 없음"],
        ["표 머리 / 표 본문", "a시월구일3 / a시월구일2", "8.5pt", f"#{th['tbl']} 바탕 흰 글씨 / #4D4D4D"],
        ["표 선", "—", "0.5pt", f"#{th['tbl']} · 띠 문구보다 두 톤 밝게"]]}
    for sp in (spec1, spec2):   # 글꼴 칸 = 고른 서체 이름(사용자 2026-10-14 "고르면 작성가이드에 폰트도 같이 변경")
        for r in sp["rows"]:
            r[1] = re.sub(r"a시월구일[1-4]|G마켓 산스 TTF Bold", lambda m: fface(m.group(0)), r[1])
            fam = FONT["body"][0] + " "
            if r[1].count(fam) > 1:   # 'KoPub돋움체 Bold / KoPub돋움체 Medium' → 'KoPub돋움체 Bold / Medium' (칸이 넘쳐 옆 칸이 줄바꿈되지 않게)
                head, _, tail = r[1].partition(" / ")
                r[1] = head + " / " + tail.replace(fam, "")
    bf = FONT["body"]
    lv = "·".join(dict.fromkeys(f.replace(bf[0], "").strip() for f in bf[1]))   # 굵기 이름만(1·2·3·4 / Light·Medium·Bold)
    return [
        {"title": "1.1 구성과 쪽 추가", "fixed_path": "1. 작성 가이드", "req": "",
         "lead": ["이 제안서는 표지·목차·간지·본문 네 가지 양식으로 짜여 있습니다.", "장마다 전용 레이아웃이 있어 머리 띠와 쪽 번호가 맞습니다."],
         "strong": "네 가지 양식", "band": "같은 장 안에서는 쪽을 복제해 이어 씁니다",
         "blocks": [b("구성", "양식 네 가지", ["표지 1쪽 → 목차(장마다) → 간지(장마다) → 본문 순서로 엮음",
                                         "목차·간지·본문은 장마다 전용 레이아웃(Ⅰ 일반현황, Ⅱ 전략 및 방법론 …)을 씀",
                                         "다른 장으로 옮긴 쪽은 [홈 > 레이아웃]에서 그 장 레이아웃으로 바꿈"]),
                    b("쪽 추가·삭제", "복제해서 이어 쓰기", ["같은 장 본문 쪽을 골라 Ctrl+D 로 복제한 뒤 글만 바꿈",
                                                      "블록(소제목·막대 제목·본문)은 묶음째 복사해 아래로 이어 붙임",
                                                      "쪽 번호(Ⅱ - 3)는 글자 상자라 쪽을 넣거나 빼면 직접 고침",
                                                      "목차 쪽 번호도 함께 고침 — 평가위원이 참조표로 찾아감"])]},
        {"title": "1.2 글쓰기 규칙", "fixed_path": "1. 작성 가이드", "req": "",
         "lead": ["문장은 마침표에서 줄을 바꾸지 않고 이어서 씁니다.", "모호한 표현 대신 수치로 적어 바로 확인하게 합니다."],
         "strong": "줄을 바꾸지 않고 이어서", "band": "문장은 이어 쓰기, 수치로 말하기",
         "blocks": [b("문장", "줄바꿈과 길이", ["도입 문단은 2문장을 줄바꿈 없이 이어 씀, 한 문장 45자 이내",
                                           "본문 글은 개조식(~함, ~임), 한 줄 70자 이내, 앞에 점(·)을 붙이지 않음",
                                           "'할 수 있다·고려하고 있다' 같은 모호한 말은 쓰지 않음"]),
                    b("글꼴", "설치해야 할 글꼴", [f"제목: {FONT['title'][1]} — 표지·목차·간지·쪽 제목의 큰 글자에만",
                                             f"본문: {bf[0]} {lv} — 굵기 4단계(옅음·본문·강조·굵음)",
                                             "글꼴이 없는 PC 에서는 다른 글꼴로 바뀌어 줄바꿈이 달라짐 — 작성 전 설치",
                                             "컨소시엄 업체는 같은 양식 파일로 작성해 합칠 때 어긋나지 않게 함"]),
                    b("색", "글자는 먹색, 톤은 머리·강조에만", [f"글자 #{INK} — 제목·소제목·막대 제목 / 보조 #{SUB} — 경로",
                                       f"강조 #{th['point']} — 쪽 제목 번호·강조 어구·태그만 칠함",
                                       f"차분한 면 #{th['calm']} — 띠 문구 / 표 머리·선 #{th['tbl']} / 연한 면 #{th['soft']}"])]},
        {"title": "1.3 서식 규칙표", "fixed_path": "1. 작성 가이드", "req": "",
         "lead": ["요소마다 글꼴·크기·색이 정해져 있습니다.", "새 쪽을 만들 때도 이 표의 값 그대로 씁니다."],
         "strong": "글꼴·크기·색", "band": "요소별 서식 — 이 값 그대로",
         "blocks": [b("머리·제목 영역", "머리 띠부터 쪽 번호까지", ["쪽 위쪽과 아래쪽에 늘 같은 자리로 놓이는 요소"], table=spec1),
                    b("본문 영역", "도입 문단부터 표까지", ["블록 하나 = 소제목 + (작은 제목) + 막대 제목 + 본문 글 + (표)"], table=spec2)]},
        {"title": "1 사업이해도", "fixed_path": "", "req": "SFR-001",
         "lead": ["1 depth 는 장 안의 큰 절을 여는 쪽입니다.", "경로 줄 없이 절 번호와 이름만 씁니다."],
         "strong": "큰 절을 여는 쪽", "band": "1 depth — 절의 방향을 먼저 보여 주는 쪽",
         "blocks": [b("쓰는 곳", "1 depth 예시", ["절의 첫 쪽에 써서 절 전체의 방향을 먼저 보여 줌", "제목 형식: 숫자 + 공백 + 절 이름(예: 1 사업이해도)"])]},
        {"title": "1.1 사업 배경 및 목적", "fixed_path": "1. 사업이해도", "req": "SFR-001, SFR-002",
         "lead": ["2 depth 는 절 아래 항목 하나를 설명하는 기본 쪽입니다.", "경로 줄에는 위 절 하나만 적습니다."],
         "strong": "기본 쪽", "band": "2 depth — 가장 많이 쓰는 본문 쪽",
         "blocks": [b("쓰는 곳", "2 depth 예시", ["항목마다 1~3쪽, 2쪽 이상이면 제목 끝에 (1/2)처럼 붙임", "경로: 1. 사업이해도 / 제목: 1.1 사업 배경 및 목적"], small="현행 시스템의 한계")]},
        {"title": "1.1.1 추진 배경", "fixed_path": "1. 사업이해도 > 1.1 사업 배경", "req": "SFR-001",
         "lead": ["3 depth 는 항목을 더 잘게 나눌 때 씁니다.", "경로 줄에 절과 항목을 이어 적습니다."],
         "strong": "더 잘게 나눌 때", "band": "3 depth — 항목 안의 세부 주제",
         "blocks": [b("쓰는 곳", "3 depth 예시", ["한 항목이 3쪽을 넘으면 세부 주제로 나눠 3 depth 로 씀", "경로: 1. 사업이해도 > 1.1 사업 배경 / 제목: 1.1.1 추진 배경"])]},
        {"title": "1.1.1.1 현행 시스템 현황", "fixed_path": "1. 사업이해도 > 1.1 사업 배경 > 1.1.1 추진 배경", "req": "SFR-001",
         "lead": ["4 depth 는 세부 주제 안에서 한 가지를 짚을 때만 씁니다.", "너무 깊어지면 읽기 어려우니 꼭 필요할 때만 씁니다."],
         "strong": "한 가지를 짚을 때", "band": "4 depth — 가장 깊은 단계(꼭 필요할 때만)",
         "blocks": [b("쓰는 곳", "4 depth 예시", ["경로 줄에 세 단계를 모두 적어 위치를 알려 줌", "4 depth 아래로는 더 나누지 않고 블록으로 정리함"])]},
    ]


def build_guide(project, style, tone, logo, out):
    o = {"project": dict(project), "chapters": [{"no": "Ⅰ", "title": "작성 가이드", "sections": []}]}
    b = Build(o, {}, logo, style, tone)
    b.project_text()
    b.chapter_layouts()
    c = o["chapters"][0]
    slides = []
    for pg in guide_pages(b.th):
        s, rest = b.body_page(0, c, pg)
        slides.append(s)
        k = 2
        while rest:
            s, rest = b.body_page(0, c, dict(pg, blocks=rest), cont=str(k))
            slides.append(s)
            k += 1
    for k, s in enumerate(slides):
        move_slide(b.prs, s, k)
    for s in (b.s_body, b.s_cover, b.s_toc, b.s_div):
        drop_slide(b.prs, s)
    refont(b.prs)
    widen_body(b.prs)
    b.prs.save(out)
    return len(slides)
