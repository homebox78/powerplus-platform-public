# powerPlus 연계 — 자산으로 장표를 고치고, 완성 장표를 자산으로 올린다

powerPlus = 사내 PPT 자산 라이브러리(https://hom2box.com/powerPlus, 아이콘 1,586+·일러스트·사진·다이어그램·장표 731+).
연계는 두 방향이다.

```
① 라이브러리 → 장표   : 아이콘·인물 일러스트를 3D 세트 자산으로 교체 (6·7단계)
② 장표 → 라이브러리   : 완성 장표를 전체본 1 + 낱장 N 으로 등록 (납품 후)
```

---

## ① 자산 찾기

### 공개 API (인증 없음, 읽기 전용)
```
GET https://hom2box.com/powerPlus/api/public/assets?q=<검색어>&category=icon&limit=5
GET https://hom2box.com/powerPlus/api/public/assets?ids=icon_1397,icon_1263   # id 로 콕 집어
```
응답 `data[]` 에 `id · image_url(원본) · thumb_url · tags · style_sig`. slide_url 은 공개 응답에서 빠진다.

### find.py — 후보를 시트로 **눈으로** 고른다
```bash
"$PY" find.py cand "2:교육훈련" "3:시스템설정" "5:모니터링"   # cand/candidates.png
```
- ⚠️ 태그 매칭은 빗나간다: '기술지원' → 티켓·쿠폰, 태그 '시계'(icon_1059)는 속도계. 검색어를 바꿔 가며 시트로 확인.
- 검색은 서버 사전(동의어·조사 벗기기·오타 교정)을 거친다. 한 글자·일반어는 결과가 넓다.

### 스타일 세트 — 한 장표 = 한 세트
- 아이콘: **3D 아이콘 295종 세트**(2026-09-11 등록, `icon_1263` 과 같은 세트). ⚠️ 같은 배치가 지문으로 47/295 두 세트로 갈려 있다 — 관리자 '같은 스타일 세트' 화면의 개수와 대조해 295 쪽을 쓴다.
- 인물·장면: **3D 인물 94종 세트**(`illust_187` 과 같은 세트).
- 세트 목록은 `/api/assets/{id}/set` 이 인증 필요 → 서버 키가드 임시 러너로 `AssetService::styleSet` 호출해 받고 **즉시 삭제**(`import_key` 는 서버 config.php 에만).
- 받은 이미지는 `tools/ppt-pipeline/lib/<id>.png`(세트 교체용) 또는 `diagram/assets/`(도식용)에 둔다.

### 무엇으로 바꿀지 — 2단 판단
1. 그림을 본다(`iconsheet.py` 시트).
2. 애매하면 **옆 글자**(`extract.py` 가 거리와 함께 붙인 가까운 텍스트 3개; 0.5~1.0in 이내면 그 항목 아이콘). 예: 노드 연결 도형인데 옆 글자 "안정화·장애요소 제거" → 서버 정상 아이콘.
- 종류당 대체 자산 3개를 미리 골라 슬라이드 단위로 돌려 쓴다(같은 장 중복 금지).
- 빨간 X(icon_1089)는 부정 의미 1~2곳에만.

## ① 교체

| 경우 | 도구 |
|---|---|
| 그림 아이콘·일러스트, 도형 단위로 지목 | `set_swap.py <src> <dst> set_swap.<프로젝트>.json` |
| 그림, 배치 순서 번호로 지목 | `swap.py <src> list` → `swap.py <src> <dst> "2=icon_977.png"` |
| 도형(벡터) 아이콘 | `shape_scan_*` → `map.sample.py` 복사 → `shapeswap_all.py` / `shapeswap_bbox.py` |
| 이미 넣은 자산 A→B 전 장 | `icon_hashswap.py <src> <dst> A.png B.png` |
| 덩어리감 | `mass_even.py` / `icon_massnorm.py` |
| 같은 장 중복 | `icon_dedupe.py` |

set_swap 이 하는 일: 원래 그림 잉크 영역에 비율 유지로 맞춤 · 다시칠하기(duotone·clrChange)·자르기(srcRect) 제거 · **예술 효과 원본 레이어(hdphoto) 제거** · 공유 파트 분리.
내가 넣은 그림은 PNG 바이트 sha1 로 식별(필요하면 `Name="PPICON"`)해 이후 COM 도구가 찾게 한다.

---

## ② 완성 장표 등록 (전체본 + 낱장)

```bash
"$PY" optimize.py "<최종>.pptx" full.pptx 1200   # 이미지 최대변 1200 + 불투명 PNG→JPEG + 알파 PNG 조건부 양자화 (40MB 상한)
"$PY" split.py full.pptx parts                    # 낱장(마스터 layout 가지치기·notes/handout master·섹션 제거)
"$PY" render.py full.pptx thumbs                  # 썸네일 겸 검수
"$PY" dump.py && "$PY" sheet.py 1 16              # 텍스트·시트로 내용 파악
cp meta.sample.py meta.py                         # 이름·slide_page·키워드 작성
"$PY" stage.py                                    # _stage/ppt/{files,thumbs,manifest.json}
```
- `slide_kind`: package(전체) / single(낱장). `slide_page`: cover·toc·divider·content·qa·etc.
- 키워드: ①장표에 실제 쓰인 말 ②용도(로드맵·조직도·구성도·간지) ③도메인 ④**표기 변형**(Web-GIS→웹지아이에스) + 사업 공통 `COMMON_KO/EN` 을 전 낱장에. 낱장당 ko 25~40·en 15~30.
- 업로드: tar → scp → 서버 `<webroot>/_stage/` 해제 → `server/bin/import-ppt.php` 를 웹루트 임시 사본으로 → `curl 'localhost/powerPlus/<임시>.php?key=<import_key>'` → 임시 파일 삭제. bin/ 은 .htaccess 403 이라 웹루트 사본 필수. 서버 CLI php 엔 pdo_mysql 이 없어 웹 SAPI 로.
- SSH 키: 환경에 따라 `server/google_key.pem` 또는 `server/config/google_key.pem`. 권한이 넓으면 `%TEMP%` 로 복사 후 `icacls /inheritance:r /grant:r "$env:USERNAME:R"`, 작업 후 삭제.
- 원격 경로 변수는 `ftp.env` 의 **`FTP_REMOTE_PATH`**. 쓰기 전에 `ls -d "$경로"` — 빈 변수면 홈에 풀린다.

## 연계 검수

| 무엇을 | 어떻게 | 기준 |
|---|---|---|
| 교체 자산이 한 세트인가 | 교체된 id 목록을 세트 id 집합과 대조 | 세트 밖 0 (예외는 이유) |
| 톤 | 교체 장 컨택트시트 | 파란 3D 톤 한 벌, 튀는 색 없음 |
| 중복 | 해시로 장별 카운트 | 같은 장 같은 아이콘 0(불릿 마커 예외) |
| 저장 되돌림 | COM 으로 한 번 열어 저장 후 렌더 | 옛 그림 복귀 0 |
| 크기 | 같은 줄 √면적 | 중앙값 ±, 원 안 62% |
| 등록 수량 | importer 출력 | "등록 N · 건너뜀 0" |
| 분할 무손실 | 낱장 vs 전체본 렌더 색차 | < 0.01 |
| 용량 | 원본 대비 렌더 색차 | < 0.2 |
| 검색 | **서버에서 `curl localhost`**(git-bash curl 은 한글이 깨져 0건) | 장표 고유어가 신규분 상위에 |
| 정리 | 등록 성공 후 | 로컬 원본·스테이지·임시키 삭제(묻지 않음), 서버 `_import` 정리 |
