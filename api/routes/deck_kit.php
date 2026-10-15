<?php
declare(strict_types=1);

/**
 * powerDeck 재료·판정 — 기획·와이어프레임·대본을 사용자 AI 가 만들고 서버는 결정적으로 판정한다(서버 LLM 호출 0).
 * PLAN §23 순서 ①②. 본문은 api/src/Deck/Kit.php.
 *   GET  /deck/kit/plan     POST /deck/check/plan
 *   GET  /deck/kit/wire     POST /deck/check/wireframe
 *   GET  /deck/kit/script   POST /deck/check/script
 * 인증: 세션 또는 Bearer 키(powerDeck 범위). 키 호출은 일 한도에 센다(Keys::hit).
 */

use Pp\Core\Actor;
use Pp\Core\HttpError;
use Pp\Core\Keys;
use Pp\Core\Response;
use Pp\Core\Router;
use Pp\Deck\Kit;

return static function (Router $r): void {
    $guard = static function (Actor $a, string $tool): void {
        if ($a->user === null || $a->kind === 'worker') {
            throw HttpError::unauthorized();
        }
        // 키 범위(deck)는 Router 가 먼저 본다(403 FORBIDDEN_SCOPE, O-01·O-10).
        // 한도 집계도 Router 가 요청마다 한 번 하므로 아래 hit 은 보통 건너뛴다(Keys::$counted).
        if ($a->via === 'key') {
            Keys::hit($a, $tool);
        }
    };
    $body = static function (): array {
        $len = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
        if ($len > 2_000_000) {
            throw HttpError::invalid('요청이 너무 큽니다(2MB 까지).', '원자료는 필요한 부분만 보내세요.');
        }
        return Response::input();
    };

    $r->get('/deck/kit/plan', static function (array $p, Actor $a) use ($guard): never {
        $guard($a, 'deck_get_plan_kit');
        Response::json(Kit::planKit());
    });
    $r->post('/deck/check/plan', static function (array $p, Actor $a) use ($guard, $body): never {
        $guard($a, 'deck_check_plan');
        Response::json(Kit::checkPlan($body()));
    });
    $r->get('/deck/kit/wire', static function (array $p, Actor $a) use ($guard): never {
        $guard($a, 'deck_get_wire_kit');
        Response::json(Kit::wireKit(!empty($_GET['full'])));   // ?full=1 이면 규칙 원문 전체
    });
    $r->post('/deck/check/wireframe', static function (array $p, Actor $a) use ($guard, $body): never {
        $guard($a, 'deck_check_wireframe');
        Response::json(Kit::checkWire($body()));
    });
    $r->get('/deck/kit/script', static function (array $p, Actor $a) use ($guard): never {
        $guard($a, 'deck_get_script_kit');
        Response::json(Kit::scriptKit());
    });
    $r->post('/deck/check/script', static function (array $p, Actor $a) use ($guard, $body): never {
        $guard($a, 'deck_check_script');
        Response::json(Kit::checkScript($body()));
    });
};
