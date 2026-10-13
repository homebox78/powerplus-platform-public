# powerPlus 인벤토리 (2026-10-06)
## 라우트 server/index.php (약 40개, 정규식 끝부분 매칭, bearer_token 62-73)
health · POST /mcp(McpServer) · /api/admin/mcp-keys · /api/public/{assets,assets/topics,assets/{id}/similar,categories}(무인증) · /api/auth/{request,verify,me,logout} · /api/me/{favorites,recent} · POST /api/usage · ~~imagesearch/imageproxy~~(외부 이미지 검색 — **이관 안 함, 플랫폼에서 삭제**, 사용자 2026-10-06) · /api/admin/stats{,/series,/analytics} · /api/categories · /api/admin/categories · /api/requests · /api/admin/requests · /api/announcements · /api/admin/announcements · /api/admin/assets(multipart) · /api/assets/{suggest,topics,{id}/similar,{id}/set,{id}} · GET /api/assets(category,q,page,limit≤2000,sort,kind,ptype,topic|ids)
## 인증 AuthService.php
OTP 6자리 sha256, 60초 제한·5회·10분 TTL, 토큰 64hex sha256 sessions 30일, Bearer. rejectReason 83-112: allowed_domain(s)→allowed_emails→open_until(+open_emails). admin=config admin_emails. validateToken 이 visits INSERT IGNORE.
## 테이블 12 (sql/schema.sql + bin/migrate.php 멱등 ALTER)
assets(id VARCHAR64 PK `{cat}_{NNN}`, name, category, tags JSON(ko+en 합집합), tags_ko, tags_en, svg, image_path, slide_path, slide_kind package|single, slide_page cover|toc|divider|content|greeting|qa|etc, thumb_path, style_sig VARCHAR8 t0~t5/t0d~t5d/c/n, created_at; 계산 views·fav_count) idx_category, idx_style(category,style_sig), idx_created
categories(key PK,label,sort_order) 시드 icon photo illust diagram ppt logo
usage_log(id,asset_id,email,used_at) idx_email(email,asset_id,used_at)
visits(email,day) UNIQUE
user_favorites(email,asset_id) PK
announcements(id,title,body,is_active,created_at,updated_at)
content_requests(id,email,type,title,description,link,status new,created_at)
search_logs(id,email,query,category,results,searched_at)
mcp_keys(id,name,key_hash,key_hint,created_by,created_at,last_used_at,uses,revoked_at) 키 pp_mcp_
auth_codes, sessions(token_hash PK,email,expires_at,...)
※ style_group 컬럼 없음(세트=30분 배치+style_sig). 운영 tags 는 utf8mb4_bin → LOWER().
## 검색 AssetService::list 41-253
tokenize(stem→decompose→glue)→correctTokens(자모 편집거리 ≤3자 1, 이상 2)→categoryHints→expand(동의어 ≤12). 단계: ①종류+전낱말 ②전낱말 ③하나라도 ④한글자 부분일치, MIN_GOOD=6. 점수 이름×4·태그정확×3·부분×1·한글자정확×4·카테고리힌트×8·종류낱말+2. 사전 = SearchLexicon.php 상수(GROUPS 12-144, EXTRA_VOCAB, CAT_HINT, STOP, TAILS) + 실제 태그(2회+) 캐시 sys_temp/pp_tagdict.json 하루. AssetTopics::MAP 주제 칩. similar=태그겹침+같은카테고리×2. suggest=사전 앞글자/최근30일 인기.
## 파일
uploads/{cat}/{id}.{png|jpg}, 썸네일 uploads/{cat}/thumbs/{id}.ext(360), 장표 uploads/ppt/{id}.pptx. 원본 크기 원칙(ASSET-IMPORT.md) — AdminController.saveImage 200-207 와 import-ppt 79 는 아직 축소(불일치). webp 미지원.
## MCP McpServer.php 도구 7: search_assets, get_asset(썸네일 image content), similar_assets, style_set, list_categories, list_topics, suggest_keywords. logSearch email='mcp:<키>'.
## 관리자 admin/index.html 1720줄: 탭 5(대시보드·자산·공지·요청·MCP) + 모달(자산 등록/수정, 카테고리, 공지, 확인) + 자산 상세 드로어. API 는 위 admin/* 전부.
## 애드인 addin/src/taskpane/api/*.ts 9파일 19호출: auth(request/verify/logout), assets(list/topics/suggest/ids/similar/set), categories, prefs(favorites/recent), usage, requests, announcements, ~~imagesearch~~(삭제). API_BASE config.ts:4.
## 최근 커밋: 10-01 MCP 서버·원본 크기 원칙, 09-15 관리자 개편, 09-11 사전 보강·LOWER, 08-13 세트 색감·오타 교정·주제 칩.
