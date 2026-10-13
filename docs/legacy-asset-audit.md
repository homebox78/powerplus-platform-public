# 옛 자산 감사표 — 파워플러스 7,086 + 홈박스 샘플 2,204 (2026-10-06)

이관 스크립트 `db/migrate-legacy/powerplus-assets.mjs` → `dedupe.mjs` → `homebox-samples.mjs` 순으로 돌린 결과.
근거 파일은 `db/migrate-legacy/data/`(sha256 목록·지각 해시·대조 결과). 세 번 실행해 수치가 같았다.

## 1. 결과 요약 (asset_items)

| 출처(source) | 공개 범위 | 건수 | 뜻 |
|---|---|---|---|
| powerplus | pro | 2,471 | 자체 등록(10월 이후 시트 절단·직접 생성) |
| powerplus | internal | 658 | 실제 제안서 장표(ppt) — 영구 사내 |
| homebox | pro | 1,989 | 홈박스 샘플(AI 생성) — 1,730 은 파워플러스 행에 병합, 259 는 새 행 |
| homebox | internal | 215 | 홈박스 샘플 중 글자 박힌 그래픽·로고·서명·기관장 → `mockup_sample` |
| tabler | pro | 317 | icon_605~921, Tabler Icons(MIT) |
| gov_logo | pro | 545 | 공공기관 로고(기관 저작물, 사실 표기 용도) |
| unverified | internal | 1,354 | **출처 미확인 초기 묶음** — 아래 3절, 사용자 확정 전까지 밖에 안 나감 |
| dup-of:* | internal | 11 | sha256 동일 중복, 소프트 삭제(deleted_at) |

총 7,560 행 · 두 키 보유(파워플러스 id + 홈박스 id) 1,730 · 소프트 삭제 11.

## 2. 중복 판정 방법

- **바이트 동일(sha256)**: 서버 uploads 원본 7,754개 해시. 11그룹 — 전부 장표·사진 재등록(ppt_001~007↔008~016, ppt_197↔201, ppt_683↔684, photo_335↔336, photo_353↔354). 뒤 번호를 소프트 삭제.
- **같은 그림(지각 해시)**: 홈박스 샘플은 webp 를 PNG/JPG 로 바꿔 넣었으므로 sha 로 못 잡는다. dHash 16×16 + aHash 8×8(투명은 흰색 합성). 임계 d≤20·a≤12 는 컨택트시트 3장(0~6, 7~13, 14~20)을 눈으로 보고 정했다 — 그 범위 안 쌍은 전부 같은 그림이었다.
- 홈박스 ↔ 파워플러스 **1,730쌍 병합**(아이콘 1,566·사진 136·일러스트 28). 홈박스 쪽 종류: icon-blue 1,096 · icon-glass 179 · icon-color 87 · icon-iso 80 · icon-flat 77 · icon-set 47 · sub-visual 41 · citizen 30 · news-thumb 25 · place 18 · mascot 12 …
- 홈박스에만 있는 474장은 새 행(사진류 → photo, 삽화류 → illust, 아이콘류 → icon, 글자 든 그래픽·로고·서명·기관장 → mockup_sample).

## 3. 출처 판정 (배치 기준 — 파일에는 출처 메타가 없다)

| 번호 범위 | 등록 시기 | 출처 | 처리 |
|---|---|---|---|
| icon_605~921 | 2026-06-30 | Tabler Icons(MIT, npm @tabler/icons) | `tabler`, 공개 가능 |
| logo_001~545 | 06-29·10-05 | 공공기관 로고 수집 + 한국부동산원 CI | `gov_logo`, 사실 표기 용도로만 |
| ppt_001~731 | 06-29~09-09 | 실제 제안서·외부 템플릿(10-01 클립아트·해외 템플릿 64개는 이미 삭제됨) | `internal` 고정 |
| icon_001~604 · illust_001~361 · photo_001~326 · diagram_001~063 | 06-28~07-03 | **미확인** — 초기 확정 콘텐츠 묶음, 클립아트코리아 등 상용 소스 가능성 | `unverified` + internal(1,354) |
| icon_922~ · illust_362~ · photo_327~ · diagram_064~ | 08-08 이후 | 자체 생성(AI)·시트 절단·홈박스 샘플 | `powerplus`/`homebox` |

파일 바이트에 클립아트·셔터스톡 문구가 남은 것은 0건(10-01 조사 그대로 — 리사이즈로 메타가 지워졌다). 그래서 **배치(등록 시각)로만 가를 수 있다.**

### 사용자 확정 요청
1. `unverified` 1,354건(초기 묶음): 자체 제작이면 `own` 으로 올려 pro 공개, 상용 소스면 삭제. 묶음 견본은 파워플러스 `data/clipart_batches.png`.
2. `gov_logo` 545건을 외부 Pro 에게 내보내도 되는지(기관 로고 = 기관 저작물, 사실 표기 범위라 보통 허용되나 상표 이슈는 자문 대상 §17.2-②).

## 4. 확인 대상 — 파워플러스 안 근접 쌍 (pp_near, 적용 안 함)

같은 카테고리 안에서 지각 해시가 가까운 190쌍. 컨택트시트(`sheet-pp-near.mjs`)로 보니 Tabler 변형(화살표 방향·on/off)·같은 틀의 다른 아이콘이 많아 **자동 적용하지 않았다.** 거리 0~5 인 아래 67쌍은 사람이 보고 지울 것.

- 거리 0 (바이트는 다른데 그림 동일): logo_513·515·517·519·521·523·525·527·530 (9개가 서로 전부 0 — 같은 기관 로고 변형 또는 빈 썸네일 의심), illust_423↔604, ppt_001↔008 등 sha 중복과 겹치는 9쌍(이미 삭제).
- 거리 2~5: illust_1242~1277 ↔ illust_1560~1661 (**09-30 cj 배치 ↔ 10-04 재생성 배치**, 같은 인물 일러스트의 얼굴 보정본 — 1250↔1592·1260↔1614·1273↔1627·1243↔1561·1256↔1610·1265↔1619·1267↔1657·1275↔1629·1276↔1630 …), icon_634↔635, icon_685↔693, icon_658↔760, icon_712↔715, icon_660↔661, illust_236↔361, illust_1397↔1690, ppt_063↔577, ppt_061↔549, ppt_062↔563.
- 거리 6~20: 123쌍 — `data/dedupe.json` `pp_near` 참고. 다이어그램 071~108(화살표 변형)·icon_659~696(Tabler 묶음)·logo 44쌍이 대부분.

## 5. 스크립트와 재실행

```
node db/migrate-legacy/powerplus-assets.mjs            # 파워플러스 → asset_*
node db/migrate-legacy/phash.mjs <pp썸네일폴더> --out=db/migrate-legacy/data/pp-phash.json
node db/migrate-legacy/phash.mjs <홈박스 originals> --out=db/migrate-legacy/data/hb-phash.json
node db/migrate-legacy/dedupe.mjs --d=20 --a=12          # 대조 → data/dedupe.json
node db/migrate-legacy/homebox-samples.mjs [--dry]       # 병합·새 행·소프트 삭제·출처 표시
```
전부 멱등. 옛 DB 는 읽기만 한다. `legacy_alt_key`(migration 0001)에 홈박스 id 가 남아 홈박스 MCP 재현 묶음이 옛 샘플 id 로 자산을 찾을 수 있다.
