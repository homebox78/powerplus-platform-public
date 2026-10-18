# -*- coding: utf-8 -*-
"""시험용 가상 자료 한 벌 — '한빛시 AI 민원상담 플랫폼 구축'(실제 발주처·회사 아님). 수치는 모두 지어낸 시험값이다.

  python -I -X utf8 engine/tests/fixtures/make_materials.py [출력 폴더]   (기본: engine/tests/fixtures/materials)

만드는 것(라이브러리가 없으면 그 파일만 건너뛴다):
  민원통계.xlsx   시트 '월별 민원 건수'(2023-01~2025-12 36줄, 전화 칸 하나 비움 — 열 밀림 시험) ·
                  시트 '유형·처리시간'(유형별 구성비 표 + 빈 줄 + 도입 전·후 처리시간 표)
  기관현황.docx   글 속 수치 + 기관별 현황 표
  추진일정.hwpx   최소 구성 hwpx — 문단 + 만족도 표(칸 주소 cellAddr)
  채널분석.pptx   기본 차트(연도별 상담 건수, 계열 2) + 목표 지표 표
  만족도조사.pdf  표 하나(한글 글꼴을 찾을 때만)
"""
import os, sys, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))

MONTHLY = {   # 연 → 12달 전체 건수(전화+온라인)
    2023: [1820, 1750, 1910, 1880, 1960, 2010, 2120, 2080, 1990, 2050, 2100, 2230],
    2024: [2310, 2250, 2400, 2380, 2450, 2520, 2610, 2590, 2480, 2550, 2640, 2760],
    2025: [2850, 2790, 2960, 2930, 3020, 3110, 3240, 3200, 3080, 3150, 3260, 3410],
}
ONLINE_SHARE = {2023: 0.34, 2024: 0.45, 2025: 0.58}
SHARE = [("복지·급여", 31.5), ("교통·주차", 24.0), ("세무·지방세", 18.5), ("환경·청소", 14.0), ("기타", 12.0)]
TIME = [("전화 상담 대기", 12.4, 2.1), ("민원 접수 처리", 26.0, 9.5), ("단순 문의 답변", 8.0, 0.5)]
AGENCY = [("본청 민원과", "18", "1,240", "11.2"), ("동부구청", "9", "610", "13.8"), ("서부구청", "8", "570", "14.5"), ("시설관리공단", "5", "320", "9.6")]
YEARLY = [("2021", 21400, 3100), ("2022", 22100, 4800), ("2023", 16100, 8300), ("2024", 16500, 13500), ("2025", 15950, 22000)]
TARGET = [("상담 응답률(%)", "71.4", "95"), ("평균 대기(분)", "12.4", "3"), ("시민 만족도(점)", "3.2", "4.3")]
SURVEY = [("응답 속도", "2.9", "3.6"), ("안내 정확도", "3.4", "3.8"), ("이용 편의", "3.1", "3.9")]
PROSE = ("한빛시 민원 콜센터의 2025년 응답률은 71.4%에 그쳤으며, 시민 만족도는 3.2점(5점 만점)이었다. "
         "사업 예산은 18억 원, 사업 기간은 착수 후 10개월이다. 상담 인력 40명이 하루 평균 2,740건을 응대한다.")


def xlsx(out):
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "월별 민원 건수"
    ws.append(["연월", "전체(건)", "전화(건)", "온라인(건)"])
    for y, vals in MONTHLY.items():
        for m, v in enumerate(vals, 1):
            on = round(v * ONLINE_SHARE[y])
            tel = v - on
            ws.append([f"{y}-{m:02d}", v, None if (y, m) == (2023, 3) else tel, on])   # 2023-03 전화 칸 비움 — 빈 칸이 빠지면 온라인 값이 전화 열로 밀린다
    ws2 = wb.create_sheet("유형·처리시간")
    ws2.append(["유형별 민원 구성비"])
    ws2.append(["유형", "비율(%)"])
    for r in SHARE:
        ws2.append(list(r))
    ws2.append([])
    ws2.append(["구분", "도입 전(분)", "도입 후(분)"])
    for r in TIME:
        ws2.append(list(r))
    p = os.path.join(out, "민원통계.xlsx")
    wb.save(p)
    return p


def docx_(out):
    import docx
    d = docx.Document()
    d.add_heading("한빛시 AI 민원상담 플랫폼 구축 — 현황", 1)
    d.add_paragraph(PROSE)
    d.add_paragraph("기관별 현황")
    t = d.add_table(rows=1, cols=4)
    for c, h in zip(t.rows[0].cells, ["기관", "상담 인력(명)", "일평균 문의(건)", "평균 대기(분)"]):
        c.text = h
    for r in AGENCY:
        cells = t.add_row().cells
        for c, v in zip(cells, r):
            c.text = v
    d.add_paragraph("표 아래 문단 — 기관별 대기 시간 차이가 최대 4.9분이다.")
    p = os.path.join(out, "기관현황.docx")
    d.save(p)
    return p


HP = "http://www.hancom.co.kr/hwpml/2011/paragraph"


def hwpx(out):
    def run(t):
        return f'<hp:run><hp:t>{t}</hp:t></hp:run>'

    def cell(r, c, t):
        return (f'<hp:tc><hp:subList><hp:p>{run(t)}</hp:p></hp:subList>'
                f'<hp:cellAddr colAddr="{c}" rowAddr="{r}"/><hp:cellSpan colSpan="1" rowSpan="1"/></hp:tc>')
    rows = [("문항", "2024년", "2025년")] + SURVEY
    trs = "".join("<hp:tr>" + "".join(cell(i, j, v) for j, v in enumerate(r)) + "</hp:tr>" for i, r in enumerate(rows))
    xml = (f'<?xml version="1.0" encoding="UTF-8"?><hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="{HP}">'
           f'<hp:p>{run("추진 배경 — 상담 수요가 3년 새 크게 늘었다.")}</hp:p>'
           f'<hp:p>{run("시민 만족도 조사 결과")}</hp:p>'
           f'<hp:p><hp:run><hp:tbl rowCnt="{len(rows)}" colCnt="3">{trs}</hp:tbl></hp:run></hp:p>'
           f'<hp:p>{run("만족도는 모든 문항에서 올랐다.")}</hp:p></hs:sec>')
    p = os.path.join(out, "추진일정.hwpx")
    with zipfile.ZipFile(p, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/hwp+zip")
        z.writestr("Contents/section0.xml", xml)
    return p


def pptx_(out):
    from pptx import Presentation
    from pptx.chart.data import CategoryChartData
    from pptx.enum.chart import XL_CHART_TYPE
    from pptx.util import Inches
    prs = Presentation()
    s = prs.slides.add_slide(prs.slide_layouts[5])
    s.shapes.title.text = "채널별 상담 건수 추이"
    cd = CategoryChartData()
    cd.categories = [y for y, _, _ in YEARLY]
    cd.add_series("전화", [t for _, t, _ in YEARLY])
    cd.add_series("온라인", [o for _, _, o in YEARLY])
    s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(0.5), Inches(1.5), Inches(9), Inches(5), cd)
    s2 = prs.slides.add_slide(prs.slide_layouts[5])
    s2.shapes.title.text = "목표 지표"
    tb = s2.shapes.add_table(len(TARGET) + 1, 3, Inches(0.5), Inches(1.5), Inches(9), Inches(2)).table
    for j, h in enumerate(["지표", "현재", "목표"]):
        tb.cell(0, j).text = h
    for i, r in enumerate(TARGET, 1):
        for j, v in enumerate(r):
            tb.cell(i, j).text = v
    p = os.path.join(out, "채널분석.pptx")
    prs.save(p)
    return p


def _kfont():
    for f in [os.path.join(HERE, "..", "..", "fonts", n) for n in ("Pretendard-Regular.ttf", "NanumGothic.ttf")] + [
            r"C:\Windows\Fonts\malgun.ttf", "/usr/share/fonts/truetype/nanum/NanumGothic.ttf"]:
        if os.path.isfile(f):
            return f
    fs = [os.path.join(HERE, "..", "..", "fonts", n) for n in os.listdir(os.path.join(HERE, "..", "..", "fonts")) if n.lower().endswith(".ttf")] if os.path.isdir(os.path.join(HERE, "..", "..", "fonts")) else []
    return fs[0] if fs else None


def pdf(out):
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import SimpleDocTemplate, Table, Paragraph, TableStyle
    from reportlab.lib.styles import ParagraphStyle
    f = _kfont()
    if not f:
        return None
    pdfmetrics.registerFont(TTFont("K", f))
    p = os.path.join(out, "만족도조사.pdf")
    doc = SimpleDocTemplate(p, pagesize=A4)
    st = ParagraphStyle("k", fontName="K", fontSize=11, leading=16)
    t = Table([["문항", "2024년", "2025년"]] + [list(r) for r in SURVEY])
    t.setStyle(TableStyle([("FONTNAME", (0, 0), (-1, -1), "K"), ("GRID", (0, 0), (-1, -1), 0.5, (0, 0, 0))]))
    doc.build([Paragraph("시민 만족도 조사 결과(5점 척도)", st), t, Paragraph("조사 대상 1,200명, 2025년 9월 실시.", st)])
    return p


def build(out):
    os.makedirs(out, exist_ok=True)
    made = {}
    for name, fn in (("xlsx", xlsx), ("docx", docx_), ("hwpx", hwpx), ("pptx", pptx_), ("pdf", pdf)):
        try:
            p = fn(out)
            if p:
                made[name] = p
        except ImportError:
            pass
    return made


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "materials")
    for k, v in build(out).items():
        print(k, v)
