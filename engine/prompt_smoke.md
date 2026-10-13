배선 점검용 짧은 실행이다. 장표를 고치지 말고 아래만 한다(1분 안에 끝낼 것).
1. {{PD}} stage "실측" 10 "배선 점검 — 원본 확인"
2. 현재 폴더의 원본.pptx 를 _v0.1_점검.pptx 로 복사한다.
3. {{PD}} stage "재검수" 90 "배선 점검 — 복사 완료"
4. 현재 폴더에 result.json 을 UTF-8 로 쓴다:
{"result": "_v0.1_점검.pptx", "summary": "배선 점검 실행입니다. 장표는 바꾸지 않았습니다.", "score": 0, "stats": [{"label": "점검", "value": "OK"}], "changes": ["원본 복사"], "checklist": [{"slide": 1, "title": "점검용 확인 항목", "detail": "실제 변환에서는 판단이 갈린 곳이 여기에 모입니다.", "level": "info"}], "extras": []}
