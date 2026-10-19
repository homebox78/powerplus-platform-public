<?php
/**
 * Jev 모델 비교 시험(CLI 전용) — 같은 질문을 두 모델에 묻고 정답률·확신도·응답 시간·비용을 견준다.
 *   php api/bin/jev-compare.php text  [모델A] [모델B]          → 글 판단(채팅 의도·요청 판정·자료 요청 종류) 정답표로
 *   php api/bin/jev-compare.php image <정답 json> [모델]        → 그림 판단(json = [{file, q:{이름:질문}, expect:{이름:값}}])
 * 실제 사용처 함수가 만드는 질문을 Jev::$capture 로 그대로 받아 쓴다 — 시험 질문이 코드와 어긋나지 않게.
 * 비용은 OpenRouter 계정에 실제로 든다(글 1회 약 $0.00002, 그림 1회 약 $0.0001).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require __DIR__ . '/../src/bootstrap.php';

use Pp\Core\Concierge;
use Pp\Core\Jev;
use Pp\Core\Triage;

$mode = $argv[1] ?? 'text';

/** 질문 묶음에서 첫 답의 값(choice·noul) */
$valueOf = static function (?array $answers, string $name): array {
    $a = $answers[$name] ?? null;
    if (!is_array($a)) {
        return [null, 0.0];
    }
    return match ($a['type'] ?? '') {
        'choice' => [(string) ($a['choice'] ?? ''), (float) ($a['confidence'] ?? 0)],
        'noul' => [(float) ($a['noul'] ?? 0) >= 0.5 ? 'yes' : 'no', abs((float) ($a['noul'] ?? 0) - 0.5) * 2],
        'score' => [(string) round((float) ($a['score'] ?? 0), 2), (float) ($a['confidence'] ?? 0)],
        'box' => [json_encode($a['box'] ?? null), (float) ($a['confidence'] ?? 0)],
        default => [null, 0.0],
    };
};

if ($mode === 'text') {
    $models = [$argv[2] ?? 'typesafe/jev-1.13', $argv[3] ?? 'typesafe/jev-1.14'];
    // [사용처, 입력, 정답] — 정답은 사람이 정한 것(질문 이름 = 첫 질문)
    $cases = [
        ['chat', '청주시 스마트시티 제안서 20장 만들어 줘', 'deck'],
        ['chat', '제안서도 만들 수 있나요?', 'help'],
        ['chat', '파란색 클라우드 아이콘 찾아 줘', 'assets'],
        ['chat', '대학교 홈페이지 메인 시안 보고 싶어', 'mock'],
        ['chat', 'KRDS 버튼 리액트 코드 줘', 'guide'],
        ['chat', '요금제가 어떻게 되나요', 'help'],
        ['chat', '오늘 날씨 어때', 'out'],
        ['chat', '이 문장 영어로 번역해 줘', 'out'],
        ['chat', '식약처 로고 있어?', 'assets'],
        ['chat', '관공서 사이트 와이어프레임 짜 줘', 'mock'],
        ['chat', '접근성 대비 기준이 몇 대 일이야?', 'guide'],
        ['chat', 'powerMCP 를 클로드에 연결하는 법', 'help'],
        ['chat', '착수보고 발표 자료 부탁해요. 사업명은 행정정보 공동이용 고도화', 'deck'],
        ['chat', '악수하는 사진 몇 장', 'assets'],
        ['chat', '파이썬으로 크롤러 짜 줘', 'out'],
        ['scope', '내 HTML 접근성 검사해 줘', 'guide_check'],
        ['scope', 'KRDS 공식 배너 꼭 넣어야 해?', 'guide_rules'],
        ['scope', '초안 PPT 디자인 정리해 줘', 'deck_polish'],
        ['scope', '맡긴 장표 다 됐어?', 'deck_status'],
        ['scope', '서울시청 사이트 디자인 참고하고 싶어', 'mock_ref'],
        ['scope', '디자인 토큰 CSS 파일 받을래', 'guide_tokens'],
        ['scope', 'Vue 탭 컴포넌트 코드', 'guide_parts'],
        ['scope', '영상 편집해 줘', 'none'],
        ['scope', '공공기관 메인 화면 목업', 'mock_page'],
        ['scope', '보고서에 넣을 데이터센터 사진', 'assets'],
        ['scope', 'RFP 보고 제안서 기획해 줘', 'deck_make'],
        ['scope', '사이트맵이랑 섹션 배치부터 잡자', 'mock_wire'],
        ['kind', '스마트팩토리 아이콘 세트', 'icon'],
        ['kind', '회의실 사진', 'photo'],
        ['kind', '조직도 도식', 'diagram'],
        ['kind', '한국전력 CI', 'logo'],
        ['kind', '표지 장표 템플릿', 'ppt'],
        ['kind', '3D 캐릭터 그림', 'illust'],
    ];
    $sum = [];
    foreach ($models as $m) {
        $sum[$m] = ['ok' => 0, 'n' => 0, 'conf' => 0.0, 'ms' => 0, 'cost' => 0.0, 'err' => 0, 'wrong' => []];
    }
    foreach ($cases as [$use, $input, $want]) {
        Jev::$capture = [];
        match ($use) {
            'chat' => Concierge::route($input),
            'scope' => Triage::scope($input),
            'kind' => Triage::requestKind($input, null),
        };
        $cap = Jev::$capture[0] ?? null;
        Jev::$capture = null;
        if ($cap === null) {
            echo "질문 못 받음: {$use} {$input}\n";
            continue;
        }
        [, $state, $questions] = $cap;
        $name = (string) array_key_first($questions);
        $line = [];
        foreach ($models as $m) {
            $r = Jev::raw($m, $state, $questions);
            [$v, $c] = $valueOf($r['answers'], $name);
            $s = &$sum[$m];
            $s['n']++;
            $s['ms'] += $r['ms'];
            $s['cost'] += $r['cost'];
            $s['conf'] += $c;
            if ($r['status'] !== 200) {
                $s['err']++;
            }
            if ($v === $want) {
                $s['ok']++;
            } else {
                $s['wrong'][] = "{$input} → " . ($v ?? '오류') . " (정답 {$want})";
            }
            unset($s);
            $line[] = sprintf('%s %.2f %dms', $v ?? 'ERR', $c, $r['ms']);
        }
        printf("%-6s %-34s 정답 %-12s | %s\n", $use, mb_strimwidth($input, 0, 34, '…'), $want, implode(' | ', $line));
    }
    foreach ($sum as $m => $s) {
        printf("\n%s: 정답 %d/%d · 평균 확신 %.2f · 평균 %dms · 비용 $%.5f · 오류 %d\n", $m, $s['ok'], $s['n'], $s['conf'] / max(1, $s['n']), intdiv($s['ms'], max(1, $s['n'])), $s['cost'], $s['err']);
        foreach ($s['wrong'] as $w) {
            echo "   틀림: {$w}\n";
        }
    }
    exit(0);
}

if ($mode === 'image') {
    $spec = json_decode((string) file_get_contents($argv[2] ?? ''), true) ?: [];
    $model = $argv[3] ?? 'typesafe/jev-1.14';
    $tot = ['n' => 0, 'ok' => 0, 'ms' => 0, 'cost' => 0.0, 'err' => 0];
    $per = [];
    foreach ($spec as $case) {
        $file = (string) $case['file'];
        $mime = str_ends_with(strtolower($file), '.jpg') || str_ends_with(strtolower($file), '.jpeg') ? 'image/jpeg' : 'image/png';
        $state = [(string) ($case['caption'] ?? '판정할 그림:'), ['type' => 'image_url', 'image_url' => ['url' => "data:{$mime};base64," . base64_encode((string) file_get_contents($file))]]];
        $r = Jev::raw($model, $state, $case['q']);
        $tot['ms'] += $r['ms'];
        $tot['cost'] += $r['cost'];
        if ($r['status'] !== 200) {
            $tot['err']++;
            echo basename($file), " 오류 {$r['status']} {$r['error']}\n";
            continue;
        }
        $out = [];
        foreach ($case['q'] as $name => $_) {
            [$v, $c] = $valueOf($r['answers'], (string) $name);
            $want = $case['expect'][$name] ?? null;
            if ($want !== null) {
                $tot['n']++;
                $per[$name]['n'] = ($per[$name]['n'] ?? 0) + 1;
                if ($v === $want) {
                    $tot['ok']++;
                    $per[$name]['ok'] = ($per[$name]['ok'] ?? 0) + 1;
                }
            }
            $out[] = "{$name}=" . $v . sprintf('(%.2f)', $c) . ($want !== null && $v !== $want ? " ✗정답 {$want}" : '');
        }
        printf("%-34s %5dms %s\n", mb_strimwidth(basename($file), 0, 34, '…'), $r['ms'], implode(' · ', $out));
    }
    printf("\n%s: 정답 %d/%d · 평균 %dms · 비용 $%.5f · 오류 %d\n", $model, $tot['ok'], $tot['n'], intdiv($tot['ms'], max(1, count($spec))), $tot['cost'], $tot['err']);
    foreach ($per as $k => $p) {
        printf("   %s: %d/%d\n", $k, $p['ok'] ?? 0, $p['n']);
    }
    exit(0);
}
fwrite(STDERR, "사용: jev-compare.php text|image …\n");
exit(1);
