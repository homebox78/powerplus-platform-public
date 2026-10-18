<?php
declare(strict_types=1);

namespace Pp\Deck;

use Pp\Core\Db;
use Pp\Core\Config;
use Pp\Core\Response;
use Pp\Core\HttpError;

/*
 * 출처: powerDeck api/src/WireAi.php (D:\powerDeck, 2026-10-06 이식). 로직·JSON 모양은 그대로 두고
 * 전역 Db/Config/fail/json_out → Pp\Core(Db·Config·Response·HttpError) 어댑터(Legacy), 테이블은 deck_ 접두, 설정은 Config 'deck.<key>' 로 바꿨다.
 */
/**
 * 와이어프레임 AI 로 다시 짜기 — 고른 장(한 번에 5장까지)의 상자를 기획 내용으로 새로 짠다.
 * 규칙은 prompt_wire.md(워커 worker/prompt_wire.md 와 같은 글 — 고치면 둘 다). 결과는 기획(plan)의 그 장 wire 에 바로 저장한다.
 */
final class WireAi
{
    public const BATCH = 5;

    public static function make(string $id, string $email, bool $admin, array $b): array
    {
        $j = Jobs::editable($id, $email, $admin);
        if (($j['kind'] ?? '') !== 'design') Legacy::fail('와이어프레임은 내용으로 장표 만들기 작업에만 있습니다.', 409);
        $plan = !empty($j['plan']) ? json_decode((string) $j['plan'], true) : null;
        if (!$plan || empty($plan['slides'])) Legacy::fail('기획이 아직 없습니다.', 409);
        $ns = array_values(array_unique(array_map('intval', (array) ($b['ns'] ?? []))));
        if (!$ns) Legacy::fail('다시 짤 장을 골라 주세요.');
        if (count($ns) > self::BATCH) Legacy::fail('한 번에 ' . self::BATCH . '장까지 다시 짭니다.');
        $src = [];
        foreach ($plan['slides'] as $s) {
            if (!in_array((int) ($s['n'] ?? 0), $ns, true)) continue;
            $src[] = implode("\n", ['## ' . $s['n'] . '쪽 — ' . ($s['title'] ?? ''), '전달할 것: ' . ($s['message'] ?? ''),
                '유형: ' . ($s['type'] ?? '') . ' · 장치: ' . ($s['device'] ?? ''), '구성: ' . ($s['layout'] ?? ''), '장면: ' . ($s['scene'] ?? ''),
                '내용:', mb_substr((string) ($s['content'] ?? ''), 0, 5000)]);
        }
        if (!$src) Legacy::fail('그 장이 기획에 없습니다.', 404);
        $note = trim(mb_substr((string) ($b['note'] ?? ''), 0, 500));
        $user = '덱 제목: ' . ($plan['title'] ?? $j['title']) . ($note !== '' ? "\n요청: " . $note : '')
            . "\n\n아래 " . count($src) . "장의 와이어프레임을 짠다(n 은 쪽 번호 그대로).\n\n" . implode("\n\n", $src);
        $d = AiKeys::ask($j, 'plan', [
            'messages' => [['role' => 'system', 'content' => WireKinds::prompt((string) file_get_contents(__DIR__ . '/prompt_wire.md'))], ['role' => 'user', 'content' => $user]],
            'response_format' => ['type' => 'json_object'], 'max_tokens' => 1600 * count($src) + 600, 'temperature' => 0.2,
        ]);
        $out = json_decode(AiKeys::jsonClean((string) ($d['choices'][0]['message']['content'] ?? '')), true);
        $by = [];
        foreach ($plan['slides'] as $s) $by[(int) ($s['n'] ?? 0)] = $s;
        $save = [];
        foreach ((array) ($out['slides'] ?? []) as $x) {
            $n = (int) ($x['n'] ?? 0);
            if (!in_array($n, $ns, true) || !is_array($x)) continue;
            $w = WireLayout::fromAi($x);
            if ($w) $save[] = ['n' => $n, 'wire' => $w, 'wire_ai' => $w, 'wire_why' => trim((string) ($x['why'] ?? ''))];   // wire_ai: AI 가 짠 그대로 — 사람이 고친 것과 견줘 배운다
        }
        if (!$save) Legacy::fail('와이어프레임을 짜지 못했습니다. 다시 눌러 주세요.', 502);
        Jobs::event($id, 'info', '와이어프레임 AI 로 다시 짬 — ' . implode(',', array_column($save, 'n')) . '쪽');
        return Jobs::patch($id, $email, $admin, ['slides' => $save]);
    }

    /**
     * 사람이 고친 배치를 남긴다 — AI 가 짠 것(wire_ai)과 확정한 것(wire)이 다른 장만. data/wire_feedback/<작업>.json (작업마다 한 파일, 덮어쓴다).
     * 지금은 쌓기만 한다. 충분히 모이면 배치 틀·예시로 되먹인다.
     */
    public static function learn(string $id, array $plan): void
    {
        $rows = [];
        foreach ((array) ($plan['slides'] ?? []) as $s) {
            if (empty($s['wire_ai']) || empty($s['wire']) || $s['wire_ai'] == $s['wire']) continue;
            $rows[] = ['n' => (int) ($s['n'] ?? 0), 'type' => $s['type'] ?? '', 'device' => $s['device'] ?? '', 'layout' => $s['layout'] ?? '', 'ai' => $s['wire_ai'], 'final' => $s['wire']];
        }
        if (!$rows) return;
        $dir = Legacy::dataDir() . '/wire_feedback';
        if (!is_dir($dir)) @mkdir($dir, 0775, true);
        @file_put_contents($dir . '/' . $id . '.json', json_encode(['job' => $id, 'at' => date('Y-m-d H:i:s'), 'slides' => $rows], JSON_UNESCAPED_UNICODE));
    }

    /** 화면용 — 사람이 고른 배치 틀에 지금 상자들을 끼워 좌표로 돌려준다(빈 칸은 남긴다). body: { tpl, blocks: [{k,t,d}] } */
    public static function tpl(array $b): array
    {
        $rows = WireLayout::applyTpl((string) ($b['tpl'] ?? ''), array_slice((array) ($b['blocks'] ?? []), 0, 40), true);
        if ($rows === null) Legacy::fail('없는 배치 틀입니다.', 404);
        return ['wire' => Jobs::wire(WireLayout::build($rows))];
    }

    /** 엔진용 — AI 가 낸 장들(rows 또는 옛 wire)을 좌표로 바꾸고 합격 기준을 검사해 돌려준다. slides: [{n, rows|wire, content?, title?}] */
    public static function layout(array $slides): array
    {
        $out = [];
        foreach (array_slice($slides, 0, 40) as $x) {
            if (!is_array($x)) continue;
            $w = WireLayout::fromAi($x);
            $out[] = ['n' => (int) ($x['n'] ?? 0), 'wire' => $w, 'wire_checks' => $w ? WireLayout::check($w, $x) : []];
        }
        return ['slides' => $out];
    }
}
