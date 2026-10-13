# 샘플 20차 — 관공서 밖 종류 8개 (2026-10-11)

powerMock 이 대학·학교·복지관·재단·협회·문화시설·기업·교육원 시안도 만들게 되면서(SampleContent::persona) 그 종류에 맞는 샘플을 만든다.
등록 = powerAssets(asset_items) — kind·use·target(묶음)·kw 태그. MCP 는 powerAssets 샘플 목록(/api/v1/assets/mock-samples)을 읽는다.

규칙(이전 차수 교훈)
- 실제 기관·학교·기업 이름 금지. 글자 그래픽엔 가상 이름(아래 표)만, 날짜·회차·테두리 금지.
- 21:9 는 "왼쪽 N% 비우기"를 쓰지 않는다(분할 화면이 나온다) — 주인공을 오른쪽 3분의 1, 나머지는 같은 장면.
- 인물은 한국인(East Asian), 간판·화면 글자 없음.

| 묶음(target) | 가상 기관 | 사진 소재 |
|---|---|---|
| univ | 한빛대학교 | 캠퍼스 본관·잔디·강의실·도서관·연구실 |
| school | 한빛고등학교 | 교문·교실 수업·운동장·과학실 |
| welfare | 한빛종합사회복지관 | 어르신 프로그램·아동 돌봄·배식 나눔·상담 |
| foundation | 한빛문화재단 | 장학금 수여·공연 지원·문화 행사 |
| assoc | 한국미래산업협회 | 세미나·박람회 부스·회원사 간담회 |
| culture | 한빛아트센터 | 공연장 무대·전시장·관람객 |
| biz | 한빛솔루션 | 사옥 외관·사무실 협업·제품 개발 |
| academy | 한빛평생교육원 | 성인 강좌·공방 실습·디지털 교육 |

종류(묶음마다): hero-city 21:9 1 · sub-visual 21:9 1 · news-thumb 3:2 2 · place 3:2 1 (nano_banana_2 2k) / popup-wide 16:9→2:1 1 · notice-square 1:1 1 · strip-banner 21:9→4:1 1 · emblem 가로 로고 1 (gpt_image_2_5 high 2k).

공통 꼬리(사진): `Real documentary photograph, natural light, Korean (East Asian) people if any, no text, no letters, no logos, no signage, one single scene from one camera, high detail.`
21:9 꼬리: `Wide cinematic frame; the main subject sits in the right third, the rest of the frame continues the same scene (sky, wall, lawn).`
그래픽 꼬리: `Clean modern Korean web banner design, flat illustration with soft gradients, Korean text rendered exactly, no dates, no numbers of rounds, no border frame, no real brand names.`

프롬프트 원문은 생성 스크립트 기록(storage/sample-src/2026-10-11-cat20/prompts.json)에 남긴다.
