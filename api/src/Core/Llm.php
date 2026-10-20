<?php
declare(strict_types=1);

namespace Pp\Core;

use Pp\Deck\AiKeys;

/**
 * 글을 쓰는 LLM — 메인 채팅·챗봇(powerLLM)이 답을 쓸 때 부른다. OpenRouter chat/completions, 회사 키(AiKeys::serverKey).
 *  - 관리자 AI 설정에 Claude API 키가 있으면(AiKeys::textProvider) Core\Claude 로 간다 — 답 꼴은 같다.
 *  - 모델: 관리자 AI 설정(core_settings ai.chat.model) > 기본 anthropic/claude-haiku-4.5(빠르고 한국어가 자연스럽다).
 *  - 하루 상한·켜기 스위치는 없앴다(2026-10-18). 키가 없거나 실패하면 null — 부른 쪽은 도움말 원문 카드로 계속한다.
 *  - 비용은 deck_ai_usage(kind='chat') 에 남겨 이력·과금 화면 하나로 본다. 개인 정보는 넣지 않는다(부르는 쪽이 Triage::scrub).
 */
final class Llm
{
    public const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';
    private const DEFAULT_DAILY = 3.0;
    private const URL = 'https://openrouter.ai/api/v1/chat/completions';

    private static ?array $cfg = null;

    /** enabled · model · daily_usd */
    public static function config(): array
    {
        if (self::$cfg !== null) {
            return self::$cfg;
        }
        $rows = [];
        try {
            foreach (Db::rows("SELECT k, v FROM core_settings WHERE k LIKE 'ai.chat.%'") as $r) {
                $rows[(string) $r['k']] = (string) ($r['v'] ?? '');
            }
        } catch (\Throwable) {
        }
        $model = trim($rows['ai.chat.model'] ?? '');
        $daily = isset($rows['ai.chat.daily_usd']) && is_numeric($rows['ai.chat.daily_usd']) ? (float) $rows['ai.chat.daily_usd'] : self::DEFAULT_DAILY;
        return self::$cfg = [
            'enabled' => ($rows['ai.chat.enabled'] ?? '1') !== '0',
            'model' => preg_match('#^[a-z0-9._-]+/[a-z0-9._:-]+$#i', $model) ? $model : self::DEFAULT_MODEL,
            'daily_usd' => max(0.0, $daily),
        ];
    }

    public static function forget(): void
    {
        self::$cfg = null;
    }

    public static function spentToday(): float
    {
        return (float) Db::val("SELECT COALESCE(SUM(cost_usd), 0) FROM deck_ai_usage WHERE kind = 'chat' AND created_at >= CURDATE()");
    }

    /**
     * 메시지 묶음([{role, content}])을 보내고 답 글을 받는다. 실패하면 null.
     * $model 을 주면 OpenRouter 로 갈 때 그 모델(그림을 읽어야 하는 곳 — 관리자가 고른 채팅 모델이 그림을 못 읽을 수 있다).
     * $kind 는 비용 기록(deck_ai_usage.kind, 8자 이하) 구분 — 자산 받은편지함은 'inbox'.
     */
    public static function chat(array $messages, int $maxTokens = 700, int $timeout = 40, ?string $model = null, string $kind = 'chat'): ?string
    {
        // 켜기·하루 상한은 없앴다(2026-10-18 사용자 지시 "상한 이런거 없애고") — 예전에 꺼 둔 값이 남아 있어도 보지 않는다
        $cfg = self::config();
        $body = ['model' => $model ?? $cfg['model'], 'messages' => $messages, 'max_tokens' => $maxTokens, 'temperature' => 0.4, 'usage' => ['include' => true]];
        // Claude 키가 있으면 먼저 — 모델 고정 Claude::CHAT_MODEL(관리자 Claude API 칸 '지금 쓰는 모델'에 보인다).
        // 키를 풀 수 없음·크레딧 소진·키 거절이면 null → 아래 OpenRouter 로 이어서
        $r = AiKeys::textProvider() === 'claude' ? AiKeys::claudeCall(Claude::CHAT_MODEL, $body, $timeout, 'low') : null;
        if ($r !== null) {
            [$status, $raw] = $r;
        } else {
            $key = AiKeys::serverKey();
            if ($key === null) {
                return null;
            }
            $ch = curl_init(self::URL);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CONNECTTIMEOUT => 5,
                CURLOPT_TIMEOUT => $timeout,
                CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $key, 'Content-Type: application/json', 'X-Title: powerPlus'],
                CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ]);
            $raw = curl_exec($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        }
        if ($raw === false || $status !== 200) {
            error_log('[llm] 실패 ' . $status . ' ' . mb_substr((string) $raw, 0, 300));
            return null;
        }
        $d = json_decode((string) $raw, true);
        $text = trim((string) ($d['choices'][0]['message']['content'] ?? ''));
        if ($text === '') {
            return null;
        }
        try {
            Db::exec("INSERT INTO deck_ai_usage (email, job_id, kind, model, cost_usd, tokens_in, tokens_out, created_at) VALUES ('system', NULL, ?, ?, ?, ?, ?, NOW())",
                [substr($kind, 0, 8), mb_substr((string) ($d['model'] ?? $body['model']), 0, 64), (float) ($d['usage']['cost'] ?? 0),
                    (int) ($d['usage']['prompt_tokens'] ?? 0), (int) ($d['usage']['completion_tokens'] ?? 0)]);
        } catch (\Throwable) {
        }
        return $text;
    }
}
