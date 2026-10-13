-- 0036 자가 개선 — 한 번 나온 오류(engine/known_errors.json)를 개선 체크리스트에 '고침' 상태로 심는다.
-- 엔진 게이트가 다시 잡으면 Checklist::record 가 open·다시 걸림으로 되돌리고, fix_note(규칙)가 다음 작업 지시문에 실린다.
-- 이 파일은 scripts/known-errors-sql.cjs 로 생성. 새 오류는 known_errors.json 에 한 줄 추가 후 새 마이그레이션으로 다시 생성.
INSERT IGNORE INTO deck_checklist (slug, area, title, detail, origin, status, fix_note, fix_commit, fixed_at, evidence)
VALUES ('known:font-shrink', 'type', '다듬기에서 본문 글자를 원본보다 작게 줄임', '증상: 12pt 본문이 7~8pt 가 되어 카드가 휑하고 읽기 어렵다 / 원인: AI 가 ''크기 통일''을 가장 작은 쪽으로 맞추고, 칸을 맞출 때 글을 줄였다 / 막는 장치: sizeguard.py — 결과를 원본과 견줘 줄어든 글자를 원본 크기로 되돌림(넘치면 0.25pt 씩, AI 값 아래로는 안 내림)', 'manual', 'fixed', '글자 크기는 원본보다 작게 내리지 않는다. 통일은 원본에서 가장 많이 쓴 크기로, 줄이는 건 칸을 넘칠 때만 0.25pt 씩. 빈 공간은 카드·도식 크기로 맞춘다.', '6ad008e', NOW(3), '[]');
INSERT IGNORE INTO deck_checklist (slug, area, title, detail, origin, status, fix_note, fix_commit, fixed_at, evidence)
VALUES ('known:autofit-scale', 'type', '자동 맞춤 비율(fontScale)로 글자를 몰래 줄임', '증상: 글자 크기 값은 그대로인데 화면에서는 작게 보인다 / 원인: normAutofit fontScale 을 낮춰 칸에 억지로 맞췄다 / 막는 장치: sizeguard.py — 원본보다 작아진 fontScale 을 원본 비율로 되돌림', 'manual', 'fixed', '자동 맞춤 비율로 글을 줄이지 않는다. 넘치면 문장을 나누거나 칸을 키운다.', '6ad008e', NOW(3), '[]');
INSERT IGNORE INTO deck_checklist (slug, area, title, detail, origin, status, fix_note, fix_commit, fixed_at, evidence)
VALUES ('known:memo-changed', 'plan', '기획 메모·말풍선 도형을 고침', '증상: 노란 메모 상자의 서체·크기·문구가 바뀌었다 / 원인: 서체·크기 통일을 메모 도형에도 일괄 적용했다 / 막는 장치: sizeguard.py — 메모 도형은 원본 그대로 되돌림', 'manual', 'fixed', '기획 메모·말풍선(노란 상자, 이름에 ''메모'', 장 밖 도형)은 서체·크기·문구·위치를 그대로 둔다.', '6ad008e', NOW(3), '[]');
INSERT IGNORE INTO deck_checklist (slug, area, title, detail, origin, status, fix_note, fix_commit, fixed_at, evidence)
VALUES ('known:inherited-size-enlarge', 'type', '줄바꿈 도구가 물려받은 글자 크기를 키움', '증상: 마스터에서 물려받은 10pt 글이 줄바꿈 정리 뒤 18pt 가 되어 카드 글이 겹친다 / 원인: textlines fix 가 크기를 모르는 런을 기본값 18pt 로 보고 그 값을 박았다 / 막는 장치: textlines.py _size_known — 크기를 모르면 크기를 바꾸지 않음', 'manual', 'fixed', '크기를 알 수 없는 글은 크기를 건드리지 않고 줄바꿈만 고친다.', '3bec193', NOW(3), '[]');
INSERT IGNORE INTO deck_checklist (slug, area, title, detail, origin, status, fix_note, fix_commit, fixed_at, evidence)
VALUES ('known:card-empty-space', 'wire', '카드 안 글 아래 큰 빈 공간', '증상: 카드는 큰데 글은 위 3분의 1에만 있다 / 원인: 원본 카드 높이를 그대로 두고 글만 정리했다 / 막는 장치: cardfit.py fit — 형제 카드 묶음을 같은 높이로 줄임', 'manual', 'fixed', '카드 안 빈 공간은 cardfit fit 으로 형제 카드를 같이 줄이고 남는 공간은 내용을 세로 가운데로 둔다.', 'd512cba', NOW(3), '[]');
INSERT IGNORE INTO deck_checklist (slug, area, title, detail, origin, status, fix_note, fix_commit, fixed_at, evidence)
VALUES ('known:card-overshrink', 'wire', '카드를 너무 많이 줄여 장 아래가 빔', '증상: 카드가 글 높이만큼 쪼그라들고 장 아래 절반이 비었다 / 원인: cardfit fit 이 빈 공간을 전부 잘라냈다 / 막는 장치: cardfit.py fit keep=0.6 + 세로 가운데', 'manual', 'fixed', '카드 높이는 원래의 60% 아래로 줄이지 않는다. 남는 공간은 내용을 세로 가운데로 나눈다.', '3d48e3c', NOW(3), '[]');
INSERT IGNORE INTO deck_checklist (slug, area, title, detail, origin, status, fix_note, fix_commit, fixed_at, evidence)
VALUES ('known:double-space', 'type', '글 안 이중 공백', '증상: ''AI  가''처럼 띄어쓰기가 두 칸이다 / 원인: 원문 공백을 그대로 옮겼다 / 막는 장치: cardfit.py spaces', 'manual', 'fixed', '마감 전 cardfit spaces 로 이중 공백을 한 칸으로. 문구는 바꾸지 않는다.', 'd512cba', NOW(3), '[]');
INSERT IGNORE INTO deck_checklist (slug, area, title, detail, origin, status, fix_note, fix_commit, fixed_at, evidence)
VALUES ('known:bottom-empty', 'wire', '장 아래쪽이 크게 비어 있음', '증상: 내용이 장 위쪽에만 몰려 있다 / 원인: 글·카드를 줄인 뒤 배치를 다시 펼치지 않았다 / 막는 장치: sizeguard.py — 25% 넘게 비면 확인 목록에 안내', 'manual', 'fixed', '끝나기 전에 장마다 내용이 아래 띠 위까지 차는지 렌더로 본다. 25% 넘게 비면 카드·도식을 키우거나 아래로 펼친다.', '6ad008e', NOW(3), '[]');
INSERT IGNORE INTO deck_checklist (slug, area, title, detail, origin, status, fix_note, fix_commit, fixed_at, evidence)
VALUES ('known:icon-style-mixed', 'assets', '한 장에 아이콘 스타일이 섞임(선화·3D)', '증상: 카드마다 아이콘 질감이 다르다 / 원인: 엔진의 아이콘 고르기(/assets/pick)가 401 로 막혀 일반 검색으로 떨어졌다 / 막는 장치: api assets/pick 라우트가 엔진 요청을 받음 + asset_find.py pick --set', 'manual', 'fixed', '아이콘은 pick 으로 고르고, 한 장의 두 번째 아이콘부터는 첫 아이콘 세트(--set)로만 고른다.', '3bec193', NOW(3), '[]');
INSERT IGNORE INTO deck_checklist (slug, area, title, detail, origin, status, fix_note, fix_commit, fixed_at, evidence)
VALUES ('known:binary-eol', 'engine', '줄끝 규칙이 그림·글꼴 파일을 깨뜨림', '증상: 스킬 참고 그림 jpg 가 서버에서 열리지 않는다 / 원인: engine/** text eol=lf 가 바이너리에도 적용됐다 / 막는 장치: .gitattributes 바이너리 예외', 'manual', 'fixed', '폴더 단위 줄끝 규칙에는 그림·글꼴 binary 예외를 같이 둔다.', '99baa05', NOW(3), '[]');
INSERT IGNORE INTO deck_checklist (slug, area, title, detail, origin, status, fix_note, fix_commit, fixed_at, evidence)
VALUES ('known:guide-missing', 'engine', '엔진 디자인 지침 파일이 서버에 없음', '증상: 기획 프롬프트에 공용 디자인 가이드가 안 들어간다 / 원인: 서버 이전 때 ~/powerDeck/reference/guide 가 빠졌다 / 막는 장치: deploy-engine.sh 가 reference-guide 를 함께 올림', 'manual', 'fixed', '엔진이 읽는 지침·참고 파일은 저장소(engine/reference-guide)에 두고 deploy-engine.sh 로만 올린다.', '39a7f8a', NOW(3), '[]');
