# powerPlus 통합 플랫폼

SI 실무자에게 필요한 서비스를 한 곳에 — powerAssets(자산) · powerDeck(장표 변환) · powerMock(공공 레퍼런스·MCP) · powerGuide(디자인 규칙 안내서).

- 기획: `docs/PLAN.md` (단일 원본은 (비공개 작업 기록), 여기는 사본)
- 최종 주소: https://powerplus.solideos.com/ (서버 준비 전까지 현 운영 VM `/platform/` 에서 개발)
- 스택: React 19 · TypeScript · Vite 8 · Tailwind v4 · shadcn/ui / PHP 8 + MariaDB 10.11 / Node(powerMCP)
- 기존 저장소(powerPlus·powerDeck·homebox-handoff·solideos)는 참조 전용 — 필요한 것을 이쪽으로 가져온다.

## S1 뼈대 (2026-10-06)
- `api/` PHP 8 REST v1: `public/index.php` → `routes/<모듈>.php` → `src/Core/*`. 인증 미들웨어 하나(세션 `pp_sid` · Bearer `pp_live_` · 워커 `pp_worker_`) → `Actor`. 권한은 `Access::can()` 한 곳.
- `db/schema.sql` core_ 22표 + asset_ 9표(IF NOT EXISTS, 멱등). `node db/scripts/migrate.mjs` 로 적용(+ `db/migrations/*.sql` 증분).
- 로컬: `cp api/config.example.php api/config.php` → `php -S 127.0.0.1:8090 -t api/public` → `curl /api/v1/health`(db:true).
- 개발 로그인 `GET /api/v1/auth/dev?email=`(debug·루프백만). OTP 는 debug 면 응답에 `dev_code`.
