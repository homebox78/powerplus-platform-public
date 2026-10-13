<?php
declare(strict_types=1);

/**
 * 디자이너 선호 규칙 (2026-10-03) — designus A/B 투표 중 뚜렷한 결과만. 근거는 Homebox\Preferences.
 *   GET /api/insights/preferences?kind=form,list&q=생년월일&limit=20
 * @var Homebox\Http\Router $router
 */

use Homebox\Http\Response;
use Homebox\Preferences;

$router->get('/api/insights/preferences', static function (): void {
    $kinds = array_values(array_filter(explode(',', (string) ($_GET['kind'] ?? ''))));
    $rules = Preferences::find($kinds, (string) ($_GET['q'] ?? ''), (int) ($_GET['limit'] ?? 20));
    $counts = [];
    foreach (Preferences::all() as $r) foreach ($r['categories'] as $c) $counts[$c] = ($counts[$c] ?? 0) + 1;
    $q = trim((string) ($_GET['q'] ?? ''));
    $partial = $q !== '' && $rules && array_filter($rules, static fn ($r) => isset($r['exact']) && !$r['exact']);
    Response::json([
        'n' => count($rules),
        // 낱말 일치 정도 — exact: 모든 낱말이 든 규칙만 / partial: 모두 든 규칙이 없어 일부만 맞는 규칙(관련 낮음)으로 넓힘
        'match' => $q === '' ? null : ($partial ? 'partial' : 'exact'),
        'match_note' => $partial ? "'{$q}' 의 낱말이 모두 든 규칙이 없어 일부 낱말만 맞는 규칙을 보여 줍니다(exact: false = 관련 낮음)." : null,
        'criteria' => sprintf('designus 디자이너 A/B 투표 중 참여 %d명 이상·한쪽 %d%% 이상', Preferences::MIN_VOTES, (int) Preferences::MIN_PCT),
        'categories' => array_map(static fn ($id, $c) => ['id' => $id, 'name' => $c['name'], 'n' => $counts[$id] ?? 0], array_keys(Preferences::CATEGORIES), Preferences::CATEGORIES),
        'rules' => $rules,
        'attribution' => '출처: designus(ko.designus.design) 디자이너 투표 — 질문·표 수와 선택지 글 요약만 사용',
    ], 200, ['Cache-Control' => 'public, max-age=600']);
});
