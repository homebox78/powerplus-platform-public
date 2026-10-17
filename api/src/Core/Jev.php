<?php
declare(strict_types=1);

namespace Pp\Core;

use Pp\Deck\AiKeys;

/**
 * 빠른 판단 — OpenRouter 의 판단 전용 모델 TypeSafe Jev(글만 받고, 정해 둔 선택지 중 하나를 고른다).
 *  - 주소: POST https://openrouter.ai/api/alpha/decisions (chat/completions 는 거절된다)
 *  - 요청: { model, state: 글|객체|배열, questions: { 이름: 질문 } }
 *      질문 종류 choice  = { type, instructions, criteria: { 선택지: 설명 } } → choice · probabilities · confidence
 *                score   = { type, instructions, criteria: [기준…] }       → score(0~1) · probabilities · confidence
 *                noul    = { type, instructions }                          → noul(예일 확률 0~1)
 *  - 가격(2026-10 실측): 입력 100만 토큰당 $0.042, 출력 무료. 한 번에 약 $0.00002.
 *
 * 원칙: 판단은 "보조"다. 키가 없거나·하루 상한을 넘었거나·실패하면 null 을 돌려주고, 부른 쪽은 원래 규칙으로 계속한다.
 * 같은 질문(task + 입력)은 core_decisions 에서 꺼내 다시 묻지 않는다. 비용은 deck_ai_usage(kind='jev')에도 남겨 이력·과금 화면 하나로 본다.
 * 개인 정보(이메일·이름·전화)는 state 에 넣지 않는다 — 부르는 쪽 책임.
 */
final class Jev
{
    public const MODEL = 'typesafe/jev-1.13';
    private const URL = 'https://openrouter.ai/api/alpha/decisions';
    /** 하루 상한(달러) — 관리자 AI 설정(core_settings ai.jev.daily_usd) > config openrouter.jev_daily_usd > 0.5 (약 2만 5천 번) */
    private const DEFAULT_DAILY = 0.5;

    /**
     * 사용처(task 이름) — 관리자 AI 설정에서 하나씩 끌 수 있다(core_settings ai.jev.use.<키> = '0').
     * 키 = ask() 의 $task. 새 사용처를 만들면 여기에 한 줄 더한다(없는 task 는 늘 켜짐).
     */
    public const USES = [
        'chat_intent'    => ['메인 채팅 의도', '홈 채팅이 첫 말·답의 의도(제안서 작업·승인·수정)를 가린다'],
        'assist'         => ['AI 도우미', '사이트 도우미·작업창 도움말 봇이 맞는 도움말을 고른다'],
        'mcp_scope'      => ['요청 판정', '도우미·powerMCP 가 요청을 할 수 있는 일인지 가린다'],
        'search_tab'     => ['통합 검색 탭', '검색어에 맞는 결과 탭을 먼저 연다'],
        'contact'        => ['문의 분류', '문의의 주제·서비스·급함·스팸을 붙인다'],
        'post'           => ['커뮤니티 글 점검', '광고·비방 의심 글을 표시한다'],
        'request_kind'   => ['자료 요청 종류', '종류 없이 온 자료 요청의 분류를 채운다'],
        'checklist_area' => ['체크리스트 분야', '목업 판정 고칠 점의 분야를 고른다'],
        'deck_mood'      => ['장표 분위기', '기획의 분위기 값을 정해진 값으로 맞춘다'],
        'addin_route'    => ['애드인 검색 종류', '애드인 검색어에 맞는 자료 종류(아이콘·사진·장표…)를 먼저 고른다'],
        'deck_icon'      => ['장표 아이콘 고르기', '초안 다듬기에서 슬라이드 문맥에 맞는 powerAssets 아이콘·그림을 고른다'],
        'addin_slide'    => ['애드인 슬라이드 추천', '선택한 슬라이드 글로 어울리는 자료 종류와 검색 낱말을 고른다'],
    ];

    /** 같은 요청 안에서 한 번만 읽는 설정 */
    private static ?array $cfg = null;

    /** 현재 설정 — enabled · daily_usd · uses(키별 켜짐). 관리자 AI 설정 화면과 ask() 가 같이 쓴다 */
    public static function config(): array
    {
        if (self::$cfg !== null) {
            return self::$cfg;
        }
        $rows = [];
        try {
            foreach (Db::rows("SELECT k, v FROM core_settings WHERE k LIKE 'ai.jev.%'") as $r) {
                $rows[(string) $r['k']] = (string) ($r['v'] ?? '');
            }
        } catch (\Throwable) {
        }
        $daily = isset($rows['ai.jev.daily_usd']) && is_numeric($rows['ai.jev.daily_usd'])
            ? (float) $rows['ai.jev.daily_usd'] : (float) Config::get('openrouter.jev_daily_usd', self::DEFAULT_DAILY);
        $uses = [];
        foreach (array_keys(self::USES) as $k) {
            $uses[$k] = ($rows['ai.jev.use.' . $k] ?? '1') !== '0';
        }
        return self::$cfg = [
            'enabled' => ($rows['ai.jev.enabled'] ?? '1') !== '0',
            'daily_usd' => max(0.0, $daily),
            'uses' => $uses,
        ];
    }

    /** 설정을 바꾼 뒤 같은 요청에서 다시 읽게 */
    public static function forget(): void
    {
        self::$cfg = null;
    }

    /**
     * 질문 묶음을 묻는다. 실패하면 null.
     * @param string $task  판단 이름(기록·상한 구분)
     * @param string|array $state 판단할 상황
     * @param array $questions 위 형식의 질문 묶음
     */
    public static function ask(string $task, string|array $state, array $questions, ?string $ref = null, int $timeout = 8): ?array
    {
        $cfg = self::config();
        if (!$cfg['enabled'] || ($cfg['uses'][$task] ?? true) === false) {
            return null;   // 관리자가 껐다 — 부른 쪽은 원래 규칙으로
        }
        $stateText = is_string($state) ? $state : json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $stateText = mb_substr((string) $stateText, 0, 20000);   // 32k 토큰 한도 안쪽으로
        $hash = sha1($task . "\n" . $stateText . "\n" . json_encode($questions, JSON_UNESCAPED_UNICODE));

        try {
            $hit = Db::row('SELECT answer FROM core_decisions WHERE task = ? AND input_hash = ?', [$task, $hash]);
            if ($hit) {
                return json_decode((string) $hit['answer'], true) ?: null;
            }
            if (self::spentToday() >= $cfg['daily_usd']) {
                return null;
            }
        } catch (\Throwable) {
            return null;   // 표가 아직 없는 환경 등 — 판단 없이 계속
        }

        $key = AiKeys::serverKey();
        if ($key === null) {
            return null;
        }
        $body = ['model' => self::MODEL, 'state' => is_string($state) ? $stateText : $state, 'questions' => $questions];
        $ch = curl_init(self::URL);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $key, 'Content-Type: application/json', 'X-Title: powerPlus'],
            CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        unset($ch); // curl_close 는 PHP 8.0 부터 하는 일이 없고 8.5 에서 폐기 예고
        if ($raw === false || $status !== 200) {
            error_log('[jev] ' . $task . ' 실패 ' . $status . ' ' . mb_substr((string) $raw, 0, 300));
            return null;
        }
        $d = json_decode((string) $raw, true);
        $answers = is_array($d['answers'] ?? null) ? $d['answers'] : null;
        if ($answers === null) {
            return null;
        }
        $cost = (float) ($d['usage']['cost'] ?? 0);
        $model = mb_substr((string) ($d['model'] ?? self::MODEL), 0, 64);
        try {
            Db::exec('INSERT IGNORE INTO core_decisions (task, input_hash, ref, state_text, answer, model, cost_usd) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [$task, $hash, $ref, $stateText, json_encode($answers, JSON_UNESCAPED_UNICODE), $model, $cost]);
            Db::exec("INSERT INTO deck_ai_usage (email, job_id, kind, model, cost_usd, tokens_in, tokens_out, created_at) VALUES ('system', NULL, 'jev', ?, ?, ?, ?, NOW())",
                [$model, $cost, (int) ($d['usage']['input_tokens'] ?? 0), (int) ($d['usage']['output_tokens'] ?? 0)]);
        } catch (\Throwable) {
        }
        return $answers;
    }

    /** choice 질문 하나만 묻고 고른 값(확신도 미달이면 null) */
    public static function choose(string $task, string|array $state, string $instructions, array $criteria, float $minConfidence = 0.6, ?string $ref = null): ?string
    {
        $a = self::ask($task, $state, ['pick' => ['type' => 'choice', 'instructions' => $instructions, 'criteria' => $criteria]], $ref);
        $p = $a['pick'] ?? null;
        if (!is_array($p) || !isset($p['choice']) || !array_key_exists((string) $p['choice'], $criteria)) {
            return null;
        }
        return (float) ($p['confidence'] ?? 0) >= $minConfidence ? (string) $p['choice'] : null;
    }

    /** 예·아니오 질문 하나 — 예일 확률(0~1), 실패하면 null */
    public static function yes(string $task, string|array $state, string $instructions, ?string $ref = null): ?float
    {
        $a = self::ask($task, $state, ['yes' => ['type' => 'noul', 'instructions' => $instructions]], $ref);
        return isset($a['yes']['noul']) ? (float) $a['yes']['noul'] : null;
    }

    public static function spentToday(): float
    {
        return (float) Db::val("SELECT COALESCE(SUM(cost_usd),0) FROM core_decisions WHERE created_at >= CURDATE()");
    }
}
