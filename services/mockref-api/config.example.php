<?php
// api/config.php 로 복사해서 사용. config.php는 .gitignore + .htaccess deny (운영 값 보존).
return [
    'app' => [
        'debug'  => true,            // 운영은 false
        'base'   => '/',             // 운영 개발 중 '/homebox/', 완성 시 '/'
        'secret' => 'change-me-32chars-minimum-secret-key', // 서명 URL HMAC (운영은 랜덤 48자)
    ],
    'admin'   => ['token' => 'dev-admin-token'],            // Phase 2 임시 관리자 API 토큰 (X-Admin-Token)
    'storage' => ['dir' => __DIR__ . '/../storage'],        // 워커 STORAGE_DIR 와 동일 경로
    'db' => [
        // MariaDB 10.11 (운영 hom2box.com) / 로컬 docker compose 동일
        'dsn'  => 'mysql:host=127.0.0.1;port=3306;dbname=homebox;charset=utf8mb4',
        'user' => 'root',
        'pass' => 'root',
    ],
    'redis'  => ['url' => 'redis://127.0.0.1:6379'],
    'meili'  => ['host' => 'http://127.0.0.1:7700', 'key' => 'dev_master_key'],
    's3'     => ['endpoint' => 'http://127.0.0.1:9000', 'key' => 'minio', 'secret' => 'minio123', 'private' => 'homebox-private', 'public' => 'homebox-public', 'ttl' => 600],
    'session'=> ['name' => 'hb_sess', 'secure' => false],   // 운영 https 는 true
    // 소셜 로그인 (Phase 4) — 콘솔에 등록한 콜백: {origin}{app.base}/api/auth/{provider}/callback. 값은 .env 와 동일 (scripts/sync-config.mjs 로 주입)
    'oauth' => [
        'google' => ['id' => '', 'secret' => ''],
        'naver'  => ['id' => '', 'secret' => ''],
        'kakao'  => ['id' => '', 'secret' => ''],
    ],
    // 토스페이먼츠 (Phase 6, API 개별 연동·자동결제) — 테스트 키 test_ck_/test_sk_
    'toss' => ['client_key' => '', 'secret_key' => '', 'webhook_secret' => ''],
];
