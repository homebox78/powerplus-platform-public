# api/ — PHP 8 REST API (PDO, 프레임워크 없음)

- 진입점 `public/index.php` → `src/Http/Router` → `routes/*.php`
- 설정 `config.php` (git 제외, `config.example.php` 복사) — `Config::get('db.dsn')`
- DB `Homebox\Db` — prepared statement만, 예약어 식별자는 백틱
- 응답 `Homebox\Http\Response::json / ::error` — docs/08 공통 형식

## 로컬 실행
```bash
cp api/config.example.php api/config.php
php -S localhost:8080 -t api/public      # Vite dev 서버가 /api → :8080 프록시
curl localhost:8080/api/health           # {"ok":true,"db":true,...}  ← db:true 까지 확인
```
운영 배포는 `/var/www/html/homebox/api/` (Apache, `public/.htaccess` RewriteBase `/homebox/api/`; 루트 승격 시 `/api/`로 변경).

Phase 0 라우트: `GET /api/health`, `GET /api/taxonomy`, `GET /api/krds/components`. 나머지는 docs/08 순서대로 Phase 3~.
