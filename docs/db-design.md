# powerPlus DB 설계서 (DBA 관점) — v0.1 2026-10-06

> ARCHITECTURE.md §4 의 원칙을 표로 푼 것. 옛 세 DB(홈박스 48표·파워플러스 11표·파워덱 14표)는 **이관 원천**이지 설계 원천이 아니다.
> 표마다 "읽는 쿼리 → 인덱스"를 적는다. 인덱스 없는 열로 WHERE·ORDER BY 를 쓰는 PR 은 `EXPLAIN` 첨부 없이는 받지 않는다.

## 0. 공통 규칙
- MariaDB 10.11 · InnoDB · `utf8mb4_unicode_ci` · `sql_mode=STRICT_TRANS_TABLES,NO_ZERO_DATE`.
- 이름: 소문자 snake, 복수형, 모듈 접두(`core_ asset_ deck_ mock_ guide_ comm_`). 예약어(order·rank·key·cursor·group) 금지.
- PK `id BIGINT UNSIGNED AUTO_INCREMENT`. 외부 노출은 `public_id CHAR(16)`(base32, UNIQUE) — URL·MCP·로그에 숫자 id 금지.
- 시각 `created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)`, `updated_at … ON UPDATE`, 소프트 삭제 `deleted_at`(90일 뒤 배치 물리 삭제). 저장은 UTC, 표시만 KST.
- **콘텐츠 표 공통 6열**(`content` 묶음): `public_id, owner_user_id, org_id, visibility ENUM('internal','partner','pro','free','public','private') DEFAULT 'internal', created_at, updated_at` + `INDEX ix_vis (visibility, deleted_at)`.
- FK 는 전부 명시, 정책: 소유자 삭제 → 콘텐츠는 `ON DELETE SET NULL`(익명화), 부모 콘텐츠 삭제 → 자식 `CASCADE`, 참조 사전(org_types 등) → `RESTRICT`.
- JSON 열은 `CHECK (JSON_VALID(col))`, 자주 읽는 값은 열로 승격(아래 각 표에 명시).
- 로그·이벤트 표는 `PARTITION BY RANGE (TO_DAYS(created_at))` 월 단위, 13개월 보존.

## 1. ER 요약
```
core_users ─┬─< core_user_logins          core_orgs ─< core_org_members >─ core_users
            ├─< core_user_roles                   └─< core_subscriptions ─< core_invoices
            ├─< core_sessions                    core_plans(사전)
            ├─< core_api_keys ─< core_api_usage
            ├─< core_credit_ledger / core_point_ledger
            └─< core_notifications
core_jobs(큐) · core_events(도메인 이벤트) · core_audit · core_settings · core_feature_flags · core_metrics · core_removal_requests

asset_items ─┬─< asset_files      asset_sets(style_group) >─ asset_items
             ├─< asset_tags        asset_categories(사전) · asset_tag_dict(동의어)
             └─< asset_uses(월 파티션)   asset_requests

deck_jobs ─┬─< deck_job_files  deck_uploads · deck_upload_parts
           ├─< deck_job_events(파티션)
           ├─< deck_wires(장별 rows JSON)   deck_feedback
           ├─< deck_comments
           └─< deck_share_links(받기 링크, 토큰 해시만)
mock_orgs ─< mock_sites ─< mock_screens ─< mock_sections ─< mock_section_krds
   (org_types·site_types·page_types·section_types 사전 = taxonomy 시드)
mock_site_design · mock_nav_states · mock_components · mock_flows
mock_wires · mock_mockups(시안) · mock_gallery · mock_collections ─< mock_collection_items
mock_ratings · mock_crawl_jobs(파티션) · mock_vendors · mock_projects · mock_awards · mock_wa_certs · mock_showcase · mock_checklist
guide_tokens(버전) · guide_docs · guide_parts · guide_proposals
comm_posts ─< comm_comments · comm_likes
```

## 2. core_ (계정·권한·과금·운영)
| 표 | 핵심 열 | 인덱스(쿼리) |
|---|---|---|
| `core_users` | public_id, email(UNIQUE), name, avatar_file_id, kind ENUM(staff,external), plan ENUM(staff,free,pro,team), org_id, birthday DATE NULL, marketing_opt_in, name_changed_at, last_seen_at, deleted_at | `ux_email`, `ix_kind_plan`(관리자 목록), `ix_last_seen`(휴면) |
| `core_user_logins` | user_id, provider ENUM(otp,google,naver,kakao), provider_uid, email, email_verified, linked_at | `ux_provider_uid(provider, provider_uid)`, `ix_user` |
| `core_user_roles` | user_id, role ENUM(admin,curator,support), granted_by, granted_at | `ux_user_role`(복수 허용, 중복 금지) |
| `core_orgs` | public_id, name, kind ENUM(company,team), domain(회사 메일 도메인 — staff 판정), seats, owner_user_id | `ux_domain`(NULL 허용) |
| `core_org_members` | org_id, user_id, role ENUM(owner,member), joined_at | `ux_org_user`, `ix_user` |
| `core_sessions` | user_id, token_hash CHAR(64), login_id(어느 provider 세션인지 — superadmin 판정), ua, ip_masked, expires_at, revoked_at | `ux_token`, `ix_user_expires` |
| `core_otp_codes` | email, code_hash, attempts, expires_at | `ix_email_expires` (만료 지나면 삭제 배치) |
| `core_plans` | code(PK), name, price_month, price_year, credits_month, limits JSON(모듈별 상한), visible | — (플랜 표는 taxonomy 시드) |
| `core_subscriptions` | org_id 또는 user_id, plan, status ENUM(active,past_due,canceled), period_start/end, billing_key_enc, renews_at | `ix_user_status`, `ix_renews`(갱신 배치) |
| `core_invoices` | subscription_id, amount, vat, status, pg_tid, issued_at, paid_at, refunded_at, receipt_url | `ix_sub_issued` |
| `core_credit_ledger` | user_id, org_id, delta INT, kind ENUM(grant_month,purchase,use,refund,expire), ref_type, ref_id, balance_after, expires_at | `ix_user_created`(잔액 = 마지막 행 balance_after), `ix_expires` |
| `core_point_ledger` | user_id, delta, reason, ref_type, ref_id, created_at | `ux_dedup(user_id, reason, ref_type, ref_id)`(중복 적립 차단), `ix_user_created`. 관리자 일괄 지급은 ref_type='bulk', ref_id='YYYYMMDD(한국 날짜):사유 sha1 앞 31자' — 같은 대상·같은 사유·같은 날 두 번째는 이 키에 걸려 건너뛴다(열 추가 없음) |
| `core_point_rules` | reason(PK), delta, daily_cap, yearly_cap, enabled | — |
| `core_api_keys` | public_id, user_id, org_id, label, key_hash CHAR(64), key_enc VARBINARY(512)(다시 보기), last4, scopes SET(assets,deck,mock,guide), plan_snapshot, daily_limit, ip_allow JSON, last_used_at, revoked_at | `ux_hash`, `ix_user` |
| `core_api_usage` | key_id, day DATE, tool VARCHAR(48), calls INT, bytes BIGINT, ms_sum | `ux_key_day_tool`, 파티션 월 |
| `core_jobs` | public_id, kind VARCHAR(48)(deck.convert·mock.capture·mock.check·asset.derive·index.sync…), status ENUM(queued,running,done,failed,canceled), priority TINYINT, payload JSON, result JSON, worker_id, attempts, run_after, locked_at, finished_at, error | `ix_claim(status, priority, run_after, id)`(워커 claim 한 줄), `ix_kind_status`, 파티션 월 |
| `core_events` | type VARCHAR(64), content_type, content_id, payload JSON, processed_at | `ix_unprocessed(processed_at, id)`, 파티션 월 |
| `core_audit` | actor_user_id, actor_key_id, action, target_type, target_id, before JSON, after JSON, ip_masked | `ix_target(target_type, target_id)`, `ix_actor_created`, 파티션 월·2년 보존 |
| `core_settings` | k(PK), v TEXT(시크릿은 AES-GCM), is_secret, updated_by | — |
| `core_feature_flags` | k(PK)(billing.visible…), on, rollout JSON(역할·사용자 목록) | — |
| `core_notifications` | user_id, kind, title, link, read_at | `ix_user_unread(user_id, read_at)` |
| `core_removal_requests` | no CHAR(12), content_type, content_id, requester_email, reason, status, due_at, handled_by | `ux_no`, `ix_status_due` |
| `core_metrics` | day, scope(api/mcp/web), name, p50, p95, count | `ux_day_scope_name` |
| `core_files` | public_id, bucket, path, mime, bytes, w, h, sha256, owner_user_id, visibility, scanned_at(ClamAV) | `ix_sha`(중복), `ix_owner` |

`Access::can()` 이 읽는 것: `core_users(kind,plan)`·`core_user_roles`·`core_org_members`·대상 콘텐츠 6열. 조인 3개 이내 — 요청당 한 번 로드해 Actor 에 캐시.

## 3. asset_ (powerAssets — 파워플러스 + 홈박스 샘플 통합)
| 표 | 핵심 열 | 인덱스 |
|---|---|---|
| `asset_items` | content 6열, category ENUM(icon,photo,illust,diagram,logo,ppt,**mockup_sample**)(목업용 샘플 — 애드인 비노출, 관리자·MCP 전용), name, alt, w, h, has_text, text_safe JSON, style_sig, set_id, legacy_key VARCHAR(64)(홈박스 샘플 id / 파워플러스 id — UNIQUE, 여러 개면 `asset_legacy_keys`), source VARCHAR(32)(generated·purchased·own), slide_kind, slide_page, sha256 | `ix_cat_vis_created(category, visibility, created_at)`(랜딩·목록), `ix_set`, `ux_legacy`, `ix_sha` |
| `asset_files` | item_id, kind ENUM(original,thumb,card,mcp,og,slide), file_id → core_files | `ux_item_kind` |
| `asset_tags` | item_id, tag VARCHAR(64), lang ENUM(ko,en), axis ENUM(kw,kind,use,target,style)(홈박스 kind/use_for/대상/스타일이 축으로) | `ux_item_tag_axis`, `ix_tag_axis(tag, axis)`(검색·필터), `ix_axis_tag(axis, tag)` |
| `asset_tag_dict` | tag, group_id, lang — 동의어·한영·오타 사전(파워플러스 SearchLexicon 이관) | `ix_group`, `ux_tag_lang` |
| `asset_sets` | public_id, name, style(icon-blue·glass…), category, cover_item_id, count | — |
| `asset_uses` | item_id, user_id, key_id, channel ENUM(addin,mcp,deck,web), ref_type, ref_id, created_at | `ix_item_created`, `ix_user_created`, `ix_key_created`(MCP 반복 방지는 key_id+created_at 3일), 파티션 월 |
| `asset_favorites` | user_id, item_id | `ux_user_item` |
| `asset_requests` | user_id(NULL=MCP 자동), title, kind, detail, status, source ENUM(user,mcp_gap), handled_item_id | `ix_status_created` |
| `asset_search_logs` | q, results, user_id, channel, day | `ix_day`, 파티션 월(무결과율) |

검색: `asset_items` → Meilisearch 문서(`public_id, name, alt, tags_ko[], tags_en[], category, axis.*`), 동의어는 Meili synonyms 에 `asset_tag_dict` 를 밀어 넣는 잡. DB 는 폴백.
이관: 파워플러스 `assets`(5,000+) + 홈박스 `sample-images.json`(2,204) → sha256 으로 합치기, `legacy_key` 두 벌 보존, `usage_log`/`user_favorites` → `asset_uses(channel=addin)`/`asset_favorites`, `search_logs` → `asset_search_logs`, `content_requests` → `asset_requests`.

## 4. deck_ (powerDeck)
| 표 | 핵심 열 | 인덱스 |
|---|---|---|
| `deck_uploads` | public_id, owner_user_id, filename, bytes, mime, sha256, parts_total, parts_done, file_id, scanned_at | `ix_owner_created` |
| `deck_upload_parts` | upload_id, no, bytes, sha | `ux_upload_no` |
| `deck_jobs` | content 6열(기본 private), upload_id, kind ENUM(design,wire), phase ENUM(pilot,full), status, pilot_slide, options JSON, score, stage, pct, engine_worker_id, credits_used, started_at, finished_at, error · (현행 0005 표) budget_usd·spent_usd·**budget_base_usd**(0043 — 작업당 한도의 기준선. 시안 확정 때 spent_usd 로 다시 잡고, 발표 대본·예상 질문 비용만큼 올린다. 판정 = spent_usd − budget_base_usd ≥ budget_usd) | `ix_owner_created`, `ix_status_updated`(엔진 대기열은 core_jobs 가 담당) |
| `deck_job_files` | job_id, kind ENUM(before,after,live,frames,draft,pilot,pptx,extras), file_id, ver | `ux_job_kind_ver` |
| `deck_job_events` | job_id, at, stage, pct, msg, kind(think/log) | `ix_job_at`, 파티션 월 |
| `deck_wires` | job_id, slide_no, rows JSON, rows_ai JSON, tpl, wire_at, edited_by | `ux_job_slide` |
| `deck_feedback` | job_id, slide_no, text, user_id, created_at | `ix_job` |
| `deck_comments` · `deck_comment_replies` | 현행 이관 | |
| `deck_ai_usage` | job_id, model, tokens_in/out/reasoning, usd, created_at | `ix_job`, 파티션 월(크레딧 원가 대조) |
| `deck_share_links` (0044) | token_hash CHAR(64)(sha256 — 원문 토큰은 만들 때 한 번만 돌려줌), token_tail(끝 4자, 목록 식별용), job_id, kind(result·export·fonts), created_by(이메일), created_at, expires_at(1·7·30일, 기본 7일), revoked_at, downloads, last_download_at | `ux_token`, `ix_job_created`, `ix_expires` — 완성 산출물 받기 링크 `/api/v1/d/{토큰}`(로그인 없이, 2026-10-18). 작업 id·파일 경로는 주소·응답 어디에도 안 나간다. 만료·끊김·작업 삭제는 모두 같은 404. 작업을 지우면 같이 지운다(FK 없음) |

이관: `jobs`→`deck_jobs`(소유자 = OTP 이메일 → core_users), `job_files`→`deck_job_files`(파일은 `/var/www/powerdeck_data` 그대로 두고 `core_files.path` 로 가리킴), `workers`→`core_jobs` 워커 id, `ai_settings/ai_user_keys`→`core_settings`(회사 키 하나) — 사용자 개인 키는 이관하지 않는다.

## 5. mock_ (powerMock — 홈박스 48표를 35표로)
합치거나 없애는 것: `users/oauth_accounts/subscriptions/invoices/api_keys/api_usage_daily/teams/team_members/plans/email_codes/notifications/audit_logs/point_ledger/removal_requests/requests` → `core_`. `assets`·`masks`(마스크 좌표) → `mock_screen_files`·`mock_masks`. `showcase_entries`·`design_debates` → `mock_showcase`(관리자 전용 유지).

| 표 | 핵심 열·변경점 | 인덱스 |
|---|---|---|
| `mock_orgs` | public_id, name, org_type_id, parent_id, contact JSON, source | `ix_type`, `ix_name` |
| `mock_sites` | content 6열(수집물은 visibility=free·잠금은 플랜 규칙), org_id, slug(UNIQUE), url, host, site_type_id, status, source_kind ENUM(gov,private), renewal_year, rating_avg, rating_count, wa_cert, krds_score, published_at, kogl_type TINYINT NULL(공공누리 — 도입 확정) | `ux_slug`, `ix_kind_status_pub(source_kind, status, published_at)`, `ix_rating`, `ix_org_type` |
| `mock_screens` | site_id, public_id, device ENUM(pc,mobile), page_type_id, title, path, viewport_w, full_h, status, captured_at, file_ids(원본·공개본·썸네일은 `mock_screen_files`), ocr_text MEDIUMTEXT → **Meili 로만, DB 는 보관용** | `ix_site_device_type`, `ix_type_status`(패턴 집계), `ix_captured` |
| `mock_sections` | screen_id, section_type_id, **x,y,w,h SMALLINT 승격**, title VARCHAR(120), confidence DECIMAL(3,2), source ENUM(auto,review), crop_file_id, structure JSON(설명·플래그 — 조회 열은 승격됨), inner JSON(안쪽 실측, 재현 묶음 때만 읽음) | `ix_screen_y(screen_id, y)`(화면 섹션 순), `ix_type_screen(section_type_id, screen_id)`(유형 탐색 — 덮는 인덱스에 x,y,w,h,title 포함), `ix_conf` |
| `mock_section_krds` | section_id, krds_component_id, state | `ux_section_comp` |
| `mock_facet_counts` | facet(org_type/section_type/style/krds), key, device, count, updated_at | `ux_facet_key_device` — 워커가 게시 때 갱신, 요청 때 COUNT 안 함 |
| `mock_site_design` · `mock_page_design` · `mock_nav_states` · `mock_components` · `mock_flows/flow_steps` · `mock_masks` | 현행 열 그대로, FK 재명명 | 현행 인덱스 |
| `mock_wires` **(신규)** | content 6열(private), kind ENUM(main,sub), ref_id(레퍼런스·섞기 id), org_name, rows JSON, rows_ai JSON, check_result JSON, score, device | `ix_owner_created` |
| `mock_mockups` | content 6열(private → 공유 시 public), token CHAR(32) UNIQUE, base_token, title, ref_id, html_file_id, thumb_file_id, score, passed, check_json, published_at, expires_at, discarded_at | `ux_token`, `ix_owner_created`, `ix_expires` |
| `mock_gallery` | mockup_id, shared_at, likes, views | `ix_shared` |
| `mock_collections` ─ `mock_collection_items` | 현행 | |
| `mock_ratings` | site_id, user_id, design, a11y, ux, comment | `ux_site_user` |
| `mock_crawl_jobs` → `core_jobs(kind=mock.*)` 로 흡수, 상태 조회는 `payload->site_id` 가상 열 인덱스 | |
| `mock_vendors` · `mock_projects` · `mock_awards` · `mock_wa_certs` · `mock_g2b_*` · `mock_showcase` · `mock_checklist` | 현행 | |
| 사전: `mock_org_types` `mock_site_types` `mock_page_types` `mock_section_types` `mock_style_tags` `mock_krds_*` `mock_flow_scenarios` | taxonomy.json 시드 | |

승격의 근거: 지금 섹션 탐색·패싯이 `structure` JSON(26만 행·수 KB)을 조인마다 읽어 37초 → 덮는 인덱스로 1.6초였다. 승격 + 집계 표면 0.3초.

## 6. guide_ · comm_
| 표 | 핵심 열 |
|---|---|
| `guide_tokens` | version, tokens JSON(스키마 packages/shared/tokens.schema.json), skin(default·example), published_at, notes |
| `guide_docs` | content 6열(public), slug, title, body MD, krds_ref, parts JSON |
| `guide_parts` | key(button·tabs…), framework ENUM(react,vue,css), code_file_id, props JSON, a11y_state JSON, kit_version |
| `guide_proposals` | user_id, title, body, status, decided_by, points_granted |
| `guide_downloads` | user_id/key_id, format, version, created_at(파티션) |
| `comm_posts` / `comm_comments` / `comm_likes` | 홈박스 community_* 이관, content 6열(public) |

## 6.2 stat_ (방문자 통계) — 2026-10-20
사용자 지시: "관리자 모드에 방문자 통계 전체, 솔루션별, 브라우저·디바이스별 등 디테일한 통계 관리 페이지". 수집 방식은 사용자가 고름 — 화면이 서버에 알림(SPA 화면 이동도 잡힌다).

| 표 | 한 줄 = | 열 |
|---|---|---|
| `stat_hits` | 페이지 보기 1번(웹·애드인) 또는 키 호출 1번(MCP) | at(DATETIME(3))·day · vid(방문자, 브라우저 저장 무작위 16자 — MCP 는 키 공개 id 해시) · sid(방문, 30분 쉬면 새로) · user_id(회원이면) · path(쿼리 뺀 주소, 255) · module(assets·deck·mock·guide·community·account·admin·home·etc) · channel(web·addin·mcp) · browser·os·device(desktop·mobile·tablet) · w(화면 폭) · ref_host(바깥 유입 호스트만) · lang · ip_hash(sha256(ip+서버 비밀) 앞 16자, IP 원문은 두지 않는다) |

- 쓰기: `POST /api/v1/stats/hit`(로그인 없이, OPEN_PATHS) — 봇 UA 는 버리고, 같은 vid 의 같은 path 2초 안 반복은 하나로. MCP 는 키 인증 성공 때 서버가 직접 한 줄(path = API 주소).
- 읽기: `GET /api/v1/admin/visit-stats?from&to`(admin — /admin/stats 는 대시보드가 이미 씀) — 날짜 범위 집계만(행을 화면에 내보내지 않는다).
- 보관 400일 — retention.php 가 지운다. 개인정보: IP 원문·UA 원문을 두지 않는다(분류 결과만).
- 색인: (day, module) · (day, channel) · (vid, day) · (user_id, day). 하루 수천 줄 규모라 요약 표(일별 집계)는 두지 않는다 — 1년에 수백만 줄을 넘기면 day 요약 표를 더한다.

## 6.1 개선 체크리스트 (솔루션마다 하나 + 통합 검수) — 2026-10-15
사용자 지시: "각 솔루션마다 개선 체크리스트가 있고, 이것들이 취합 체크리스트로 전체가 하나의 검수 프로세스로 자가 개선".

| 솔루션 | 표 | 비고 |
|---|---|---|
| powerDeck | `deck_checklist` | 엔진 되먹임(lessons) — 그대로 |
| powerMock | `mock_checklist` | 판정기 되먹임 — 그대로 |
| 사이트 공통 | `site_checklist` | 공통 화면·탐색·보안 등. area ast·gde·mcp 줄은 아래 `qa_checklist` 로 옮김 |
| powerAssets · powerGuide · powerMCP | **`qa_checklist`**(module 열) | 0040 새로. 모양은 site_checklist 와 같고 `module` 열과 UNIQUE(module, slug) 만 다르다 |

- 상태 다섯 가지(open·fixing·fixed·watch·wontfix)와 '다시 걸리면 다시 연다(regressed)' 규칙은 여섯 표가 같다 → 통합 검수 화면(/admin/qa)이 한 줄 형식으로 모아 본다.
- 표를 하나로 합치지 않은 이유: deck·mock 표는 엔진·판정기가 쓰는 중이고(다른 세션 작업 중), 출처(origin) 종류가 솔루션마다 다르다. 통합은 읽기·상태 변경 API 층에서 한다.
- 자동 수집: powerAssets = 검색 결과 0건 검색어(api/bin/qa-feed.php, 매일). powerMCP = docs/MCP-개선-체크리스트.md 의 규칙(MC-, watch)·남은 일(O-) 가져오기.

## 7. 이관 매핑 요약 (db/migrate-legacy/)
| 옛 | 새 | 규칙 |
|---|---|---|
| powerplus.`sessions/auth_codes` | 버림 | 전원 재로그인(OTP) |
| powerplus.`usage_log`(이메일 기준) | `core_users`(kind=staff) + `asset_uses` | 이메일 → users 생성, `channel=addin` |
| powerplus.`mcp_keys` + homebox.`api_keys` | `core_api_keys` | 해시 그대로, scopes 는 출처 모듈, 원문 없는 키는 재발급 안내 |
| homebox.`users`(OAuth) | `core_users`(external) + `core_user_logins` | 같은 이메일이 staff 로 있으면 **staff 가 기준, 소셜은 login 연결**(§13.2-6) |
| homebox.`sections.structure` | 승격 열 + `structure` | 변환 스크립트가 x·y·w·h·title·confidence 를 뽑는다(이미 열이 있는 것은 그대로) |
| homebox `sample-images.json` + powerplus `assets` | `asset_items`(+tags·files) | sha256 합치기, legacy_key 두 벌 |
| powerdeck.`jobs/*` | `deck_*` | 파일 경로 유지 |
| solideos `tokens.json` | `guide_tokens(version=1.3.2, skin=example)` | 회사 CI 는 example 스킨으로 |
| homebox `point_ledger/gallery_items/mockup_pages/design_checklist/community_*` | 각 새 표 | **운영 원본** — 이관은 운영 DB 에서 직접(로컬 덤프 아님) |

이관 스크립트 공통: 옛 DB `SELECT` 만, 새 표 upsert(자연키), 3회 실행 수치 동일, 끝에 건수 대조표 출력(옛 N → 새 N, 합침 M, 제외 K 와 사유).

## 8. DBA 운영 설정 (서버 적용값)
```
innodb_buffer_pool_size = 2G (RAM 8G 기준 25%)  innodb_log_file_size = 512M  innodb_flush_log_at_trx_commit = 1
slow_query_log = ON  long_query_time = 1  log_queries_not_using_indexes = ON (주간 pt-query-digest 요약)
max_connections = 150  wait_timeout = 60  (PHP 는 영속 연결 안 씀)
binlog_format = ROW  expire_logs_days = 7
```
- 백업: 02:00 `mariadb-dump --single-transaction --routines` + 바이너리 로그 → VM 밖(GCS 버킷, 이관 후 사내 NAS) 30일. 월 1회 빈 DB 복구 리허설 → `/api/v1/health?deep=1`(표 수·최근 행 시각) 통과를 기록.
- 파티션 유지 배치(월 1회 잡): 다음 달 파티션 선생성, 13개월 전 파티션 → `*_archive` 로 이동 후 DROP.
- 용량 추정(1년): `mock_sections` 40만 행·JSON 포함 1.2GB / `asset_uses` 200만 행 300MB / `core_api_usage` 50만 행 50MB / 파일 저장소 15GB(자산 2GB·캡처 10GB·시안 1GB). 디스크 100GB 면 3년.
- 변경 절차: `db/migrations/NNNN_*.sql`(up 만, 되돌리기는 새 마이그레이션) + `schema.sql` 동시 갱신 + 배포가 `schema_migrations` 기준 증분 적용. 운영에서 손으로 `ALTER` 금지(했으면 그 SQL 을 마이그레이션 파일로 소급).
