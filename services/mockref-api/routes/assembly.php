<?php
declare(strict_types=1);

/**
 * 디자인 조립 (docs/11 · Phase 8, 2026-09-29)
 *   GET /api/assembly?keyword=&org_type=a,b&screen_type=MAIN&sections=GNB,NOTICE_LIST&theme=KRDS|CUSTOM&primary=%23RRGGBB&font=&device=pc&project=
 * 응답 = packages/shared AssemblyResult (spec · patterns · component_plan · candidates · quality · notes).
 * 이미지는 싣지 않는다(CLAUDE.md §8.2 ⑤ 조립 단계 = 이미지 없음). 근거 화면은 ref(section_id) → get_screen 으로 본다.
 * @var Homebox\Http\Router $router
 */

use Homebox\Assembly;
use Homebox\Http\Response;

$router->get('/api/assembly', static function (): void {
    $list = static fn (string $k): array => array_values(array_filter(array_map('trim', explode(',', (string) ($_GET[$k] ?? ''))), static fn (string $v): bool => $v !== ''));
    try {
        $out = Assembly::run([
            'keyword' => (string) ($_GET['keyword'] ?? ''),
            'org_type' => $list('org_type'),
            'screen_type' => (string) ($_GET['screen_type'] ?? 'MAIN'),
            'sections' => $list('sections'),
            'theme' => (string) ($_GET['theme'] ?? 'KRDS'),
            'primary' => (string) ($_GET['primary'] ?? ''),
            'font' => (string) ($_GET['font'] ?? ''),
            'device' => (string) ($_GET['device'] ?? 'pc'),
            'project' => (string) ($_GET['project'] ?? ''),
        ]);
    } catch (\InvalidArgumentException $e) {
        Response::error(422, 'INVALID_INPUT', $e->getMessage());
    } catch (\DomainException $e) {
        Response::error(404, 'NO_EVIDENCE', $e->getMessage());
    }
    // 근거 게이트 실패 = 생성 중단 (docs/11 §5) — 명세 대신 보고서만 준다
    $evidence = array_values(array_filter($out['quality']['checks'], static fn (array $c): bool => $c['id'] === 'evidence'))[0] ?? null;
    if ($evidence !== null && $evidence['status'] === 'fail') {
        Response::error(422, 'EVIDENCE_MISSING', $evidence['detail'], ['quality' => $out['quality']]);
    }
    // Vue·React 코드 + 부품 대응표 (사용자 확정 2026-09-29 "둘 다 제공") — code=0 이면 뺀다
    if ((string) ($_GET['code'] ?? '1') !== '0') {
        $out['code'] = \Homebox\AssemblyCode::build($out['spec'], ['org_type' => $list('org_type'), 'keyword' => (string) ($_GET['keyword'] ?? '')]);
    }
    Response::json($out, 200, ['Cache-Control' => 'public, max-age=120']);
});
