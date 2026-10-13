<?php
/**
 * api/config.php 로 복사해 채운다(git 제외). 환경변수(대문자·점→_)가 있으면 그 값이 우선.
 * 출처: homebox-handoff api/config.example.php 구조 + powerDeck config(worker_key) + 플랫폼 공통 항목
 */
return [
    'app' => [
        'debug' => true,
        'url' => 'http://localhost:5173',           // 운영: https://powerplus.hom2box.com → 최종 https://powerplus.solideos.com
        'secret' => 'change-me-to-48-random-chars',  // KeyVault·서명에 사용. 바꾸면 보관된 키 원문을 못 연다.
        'version' => '0.1.0',
    ],
    'db' => [
        'dsn' => 'mysql:host=127.0.0.1;port=3306;dbname=powerplus;charset=utf8mb4',
        'user' => 'root',
        'pass' => 'root',
    ],
    'session' => ['name' => 'pp_sid', 'secure' => false],
    'staff' => ['domains' => ['solideos.com']],     // 이 도메인으로 검증된 로그인 = staff 분류(차단 아님)
    'superadmin' => ['email' => ''],                  // 한 계정 고정. 화면에서 부여·해제 불가.
    'auth' => ['debug_code' => true],                 // debug 일 때 OTP 응답에 dev_code
    'features' => ['billing_visible' => false],       // 구독·결제 화면 노출(superadmin 은 항상)
    // 토스페이먼츠 API 개별 연동(자동결제). 비어 있으면 결제 시작만 503, 화면은 그대로. 테스트 키 test_ck_/test_sk_.
    // webhook_secret: 개발자센터 웹훅 보안 키(서명 헤더 검증). 결제 상태 이벤트는 결제 재조회로도 검증한다.
    'toss' => ['client_key' => '', 'secret_key' => '', 'webhook_secret' => ''],
    'oauth' => [
        'google' => ['id' => '', 'secret' => ''],
        'naver' => ['id' => '', 'secret' => ''],
        'kakao' => ['id' => '', 'secret' => ''],
    ],
    'smtp' => ['host' => '', 'port' => 587, 'user' => '', 'pass' => '', 'from' => '', 'from_name' => 'powerPlus'],
    'worker' => ['key' => ''],                        // pp_worker_… 엔진·수집 워커 공용
    'storage' => ['dir' => __DIR__ . '/../storage'],
    'openrouter' => ['key' => '', 'daily_usd' => 1],  // 실서비스 외부 의존은 이것 하나(§17.2)
];
