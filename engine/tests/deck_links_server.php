<?php
declare(strict_types=1);
/**
 * 받기 링크 시험용 php -S 진입점 — 가짜 PDO(상태 파일 PD_LINK_STATE)를 끼운 뒤 실제 api/public/index.php 를 그대로 돌린다.
 * 실제 Router·OPEN_PATHS·회원 관문·응답 머리를 그대로 지나가게 하려는 것. test_deck_links.php 가 띄운다(직접 쓰지 않는다).
 */
$api = dirname(__DIR__, 2) . '/api';
require $api . '/src/bootstrap.php';
require __DIR__ . '/deck_links_fake.php';
link_fake_install((string) getenv('PD_LINK_STATE'));
require $api . '/public/index.php';
