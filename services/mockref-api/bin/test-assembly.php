<?php
declare(strict_types=1);

/**
 * 디자인 조립기 검증 (docs/11 §7 수용 기준) — PHPUnit 없이 도는 최소 러너.
 *   php api/bin/test-assembly.php          순수 함수 + 품질 게이트 7종
 *   php api/bin/test-assembly.php --db     + 로컬 DB 조립 실행: ref 역추적 · 삭제요청 제외(트랜잭션 후 되돌림)
 * 실패가 하나라도 있으면 exit 1.
 */

require __DIR__ . '/../src/bootstrap.php';

use Homebox\Assembly;
use Homebox\Db;

$fail = 0; $pass = 0;
$ok = static function (bool $cond, string $name) use (&$fail, &$pass): void {
    if ($cond) { $pass++; echo "  ✔ {$name}\n"; } else { $fail++; echo "  ✘ {$name}\n"; }
};
$status = static fn (array $report, string $id): string => array_values(array_filter($report['checks'], static fn (array $c): bool => $c['id'] === $id))[0]['status'];

echo "순수 함수\n";
$ok(Assembly::area('GNB', 0, 1, 0.01) === 'header', 'GNB → header');
$ok(Assembly::area('FOOTER', 0, 1, 0.95) === 'footer', 'FOOTER → footer');
$ok(Assembly::area('NOTICE_LIST', 0.05, 0.6, 0.4) === 'left', '왼쪽 60% → left');
$ok(Assembly::area('NOTICE_LIST', 0.66, 0.33, 0.4) === 'right', '오른쪽 33% → right');
$ok(Assembly::area('HERO_VISUAL', 0, 1, 0.1) === 'top', '폭 가득·위쪽 → top');
$ok(Assembly::cols(0.33) === 4 && Assembly::cols(1.2) === 12 && Assembly::cols(0.01) === 1, 'cols 1~12 반올림');
$ok(Assembly::density(5, 180) === 'dense' && Assembly::density(4, 280) === 'normal' && Assembly::density(2, 400) === 'airy' && Assembly::density(null, 100) === null, '밀도 구간');
$ok(Assembly::contrast('#256EF4', '#FFFFFF') >= 4.5, 'KRDS 주색 위 흰 글자 4.5:1 이상');
$ok(Assembly::sameColor('#1D56BC', '#1E57BD') && !Assembly::sameColor('#1D56BC', '#E0701F'), '색 동일 판정');
$m = Assembly::mode([4, 4, 5, null, 4]);
$ok($m['mode'] === 4 && $m['ratio'] === 0.75, '최빈값·비율');
$ps = Assembly::patternSummary('NOTICE_LIST', [
    ['id' => 1, 'site_id' => 10, 'screen_id' => 100, 'area' => 'right', 'cols' => 4, 'items' => 5, 'density' => 'dense', 'variant' => null, 'y_ratio' => 0.4, 'score' => 0.9, 'confidence' => 0.8],
    ['id' => 2, 'site_id' => 10, 'screen_id' => 100, 'area' => 'right', 'cols' => 4, 'items' => 5, 'density' => 'dense', 'variant' => null, 'y_ratio' => 0.6, 'score' => 0.9, 'confidence' => 0.5],
    ['id' => 3, 'site_id' => 11, 'screen_id' => 101, 'area' => 'left', 'cols' => 8, 'items' => 4, 'density' => 'dense', 'variant' => null, 'y_ratio' => 0.2, 'score' => 0.5, 'confidence' => 0.9],
], 4);
$ok($ps['adoption'] === 0.5 && $ps['avg_position'] === 0.3 && $ps['refs'] === ['1', '3'], 'PatternSummary 채택률·첫 위치 평균·기관당 ref 1개');

echo "품질 게이트 7종 (docs/11 §5)\n";
$slot = static fn (string $section, string $ref, string $why = '레퍼런스 다수가 이 배치를 쓴다'): array => ['area' => 'center', 'section' => $section, 'ref' => $ref, 'cols' => 12, 'components' => ['X'], 'rationale' => $why];
$base = ['spec_version' => '1.0', 'project' => 't', 'screen_type' => 'MAIN', 'grid' => ['container' => 1280, 'columns' => 12, 'gutter' => 24],
    'theme' => ['base' => 'KRDS', 'primary' => '#256EF4', 'font' => 'Pretendard GOV', 'krds_version' => '2025'],
    'slots' => [$slot('GOV_BANNER', 'a1'), $slot('GNB', 'a2'), $slot('NOTICE_LIST', 'b1'), $slot('FOOTER', 'c1')], 'sources' => []];
$ctx = ['site_of' => ['a1' => 'A', 'a2' => 'A', 'a3' => 'A', 'b1' => 'B', 'b2' => 'B', 'c1' => 'C', 'd1' => 'D'], 'site_primaries' => ['A' => '#003366', 'B' => '#1D56BC'],
    'removed' => [], 'krds_known' => ['masthead' => true, 'header' => true], 'slot_krds' => [['masthead'], ['header']],
    'site_info' => ['A' => ['name' => '가', 'url' => 'https://a.go.kr', 'captured_at' => '2026-09-01'], 'B' => ['name' => '나', 'url' => 'https://b.go.kr', 'captured_at' => '2026-09-01'], 'C' => ['name' => '다', 'url' => 'https://c.go.kr', 'captured_at' => '2026-09-01'], 'D' => ['name' => '라', 'url' => 'https://d.go.kr', 'captured_at' => '2026-09-01']],
    'alternates' => ['NOTICE_LIST' => ['b1', 'b2', 'd1'], 'FOOTER' => ['c1', 'd1'], 'GNB' => ['a2']]];

$g = Assembly::gates($base, $ctx);
$ok($g['report']['passed'] && count($g['report']['checks']) === 7, '정상 명세는 통과·항목 7개');

// 1 근거
$bad = $base; $bad['slots'][2]['rationale'] = '짧음';
$ok($status(Assembly::gates($bad, $ctx)['report'], 'evidence') === 'fail' && !Assembly::gates($bad, $ctx)['report']['passed'], '① 근거 누락 → fail(생성 중단)');
// 2 복제 방지
$dup = $base; $dup['slots'][] = $slot('NOTICE_LIST', 'a3');
$r = Assembly::gates($dup, array_replace($ctx, ['alternates' => ['NOTICE_LIST' => ['a3', 'd1']]]));
$ok($status($r['report'], 'duplication') === 'fixed' && $r['spec']['slots'][4]['ref'] === 'd1', '② 같은 기관 3번째 섹션 → 다른 기관으로 교체');
$noAlt = $ctx; $noAlt['alternates'] = [];
$ok($status(Assembly::gates($dup, $noAlt)['report'], 'duplication') === 'fail', '② 대체 후보 없으면 fail');
// 3 스타일
$col = $base; $col['theme'] = ['base' => 'CUSTOM', 'primary' => '#1D56BC', 'font' => 'X'];
$r = Assembly::gates($col, $ctx);
$ok($status($r['report'], 'style') === 'fixed' && $r['spec']['theme']['primary'] === Assembly::KRDS_PRIMARY, '③ 원본 기관 색과 같은 주색 → KRDS 주색으로 치환');
// 4 KRDS
$k = $ctx; $k['slot_krds'] = [['masthead'], ['없는_컴포넌트']];
$ok($status(Assembly::gates($base, $k)['report'], 'krds') === 'warn', '④ KRDS 에 없는 컴포넌트 → warn');
$nb = $base; array_shift($nb['slots']);
$ok($status(Assembly::gates($nb, $ctx)['report'], 'krds') === 'warn', '④ 공식 누리집 표시(GOV_BANNER) 없음 → warn');
// 5 접근성
$lo = $base; $lo['theme']['primary'] = '#8FC3FF';
$ok($status(Assembly::gates($lo, $ctx)['report'], 'a11y') === 'warn', '⑤ 주색 대비 4.5 미만 → warn');
// 6 출처
$r = Assembly::gates($base, $ctx);
$ok(count($r['spec']['sources']) === 3 && array_column($r['spec']['sources'], 'site_id') === ['A', 'B', 'C'], '⑥ 사용된 기관 3곳 출처 자동 채움');
// 7 삭제요청
$rm = $ctx; $rm['removed'] = ['b1' => true];
$r = Assembly::gates($base, $rm);
$ok($status($r['report'], 'removal') === 'fixed' && $r['spec']['slots'][2]['ref'] === 'b2', '⑦ 삭제요청 ref → 다음 후보로 교체');
$rm['removed'] = ['b1' => true, 'b2' => true, 'd1' => true];
$ok($status(Assembly::gates($base, $rm)['report'], 'removal') === 'fail', '⑦ 대체 후보도 삭제요청이면 fail');

if (in_array('--db', $argv, true)) {
    echo "DB 조립 (로컬)\n";
    $out = Assembly::run(['keyword' => '시청', 'org_type' => ['local'], 'screen_type' => 'MAIN']);
    $ok($out['quality']['passed'], '키워드 1개 → 유효한 명세·게이트 통과');
    $refs = array_column($out['spec']['slots'], 'ref');
    $ph = implode(',', array_fill(0, count($refs), '?'));
    $found = (int) Db::row("SELECT COUNT(*) AS n FROM sections x JOIN screens sc ON sc.id = x.screen_id WHERE sc.status = 'published' AND x.id IN ($ph)", $refs)['n'];
    $ok($found === count($refs), "모든 슬롯 ref 가 게시된 section_id 로 역추적 ({$found}/" . count($refs) . ')');
    $count = array_count_values(array_column($out['spec']['slots'], 'ref_site'));
    $ok(max($count) <= Assembly::MAX_PER_SITE, '같은 기관 섹션 2개 이하 (최대 ' . max($count) . ')');

    // 삭제요청: 첫 슬롯 ref 에 요청을 넣고 다시 조립 → 결과에 없어야 한다. 끝나면 되돌린다.
    $target = $refs[1] ?? $refs[0];
    $pdo = Db::pdo();
    $pdo->beginTransaction();
    try {
        Db::exec("INSERT INTO removal_requests (ticket_no, claimant_name, claimant_email, target_type, target_id, target_url, reason, detail, status, due_at)
                  VALUES ('TESTASM00001', 'test', 't@example.com', 'section', ?, 'https://example.com', 'copyright', 'assembly test', 'received', NOW())", [$target]);
        $again = Assembly::run(['keyword' => '시청', 'org_type' => ['local'], 'screen_type' => 'MAIN']);
        $ok(!in_array($target, array_column($again['spec']['slots'], 'ref'), true), "삭제요청된 섹션({$target})이 결과에 없다");
        $all = array_merge(...array_map(static fn (array $p): array => $p['refs'], $again['patterns']));
        $ok(!in_array($target, $all, true), '패턴 refs 에도 없다');
    } finally {
        $pdo->rollBack();
    }
}

echo "\n{$pass} 통과 · {$fail} 실패\n";
exit($fail > 0 ? 1 : 0);
