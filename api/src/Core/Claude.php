<?php
declare(strict_types=1);

namespace Pp\Core;

/**
 * Claude API(Anthropic Messages API) 직접 호출 — 관리자 AI 설정에서 "그림은 OpenRouter · 나머지는 Claude API" 를 고르면 글 작업이 여기로 온다(2026-10-17 사용자 지시).
 * 출처: 새로 씀. 부르는 쪽(Deck\AiKeys·Core\Llm)과 엔진(engine/or_agent.py)은 OpenRouter(OpenAI) 꼴 본문·답을 그대로 쓰므로,
 *  ① OpenAI 꼴 본문(messages·tools·tool_calls·image_url·reasoning) → Messages API 본문으로 바꿔 보내고
 *  ② 답(content 블록·usage)을 OpenAI 꼴(choices[0].message·tool_calls·usage.cost)로 되돌린다 — 그래서 엔진·호출부는 고칠 것이 없다.
 * PHP 의존성 관리(composer)가 없는 저장소라 다른 외부 API 와 같이 curl 로 부른다. 빠른 판단(Jev)은 여기로 오지 않는다(OpenRouter 전용 API).
 */
final class Claude
{
    private const URL = 'https://api.anthropic.com/v1';
    private const VERSION = '2023-06-01';
    public const DEFAULT_MODEL = 'claude-opus-5-5';
    /** 관리자가 고르는 글 모델 — OpenRouter 의 Claude 가 아닌 모델(muse-spark 등)을 고른 자리에 대신 쓴다 */
    public const MODELS = ['claude-opus-5-5' => 'Claude Opus 5.5', 'claude-sonnet-5-5' => 'Claude Sonnet 5.5', 'claude-haiku-5-5' => 'Claude Haiku 5.5'];
    /** 1M 토큰당 달러 [입력, 출력, 캐시 읽기] — 사용 기록·작업 한도 계산용(2026-10 공식 가격). 캐시 쓰기는 입력 ×1.25 */
    private const PRICE = [
        'claude-fable-5-1' => [10.0, 50.0, 1.0], 'claude-fable-5' => [10.0, 50.0, 1.0],
        'claude-opus-5-5' => [4.0, 20.0, 0.2], 'claude-opus-5' => [5.0, 25.0, 0.5], 'claude-opus-4-8' => [5.0, 25.0, 0.5],
        'claude-opus-4-7' => [5.0, 25.0, 0.5], 'claude-opus-4-6' => [5.0, 25.0, 0.5],
        'claude-sonnet-5-5' => [2.0, 10.0, 0.2], 'claude-sonnet-5' => [2.0, 10.0, 0.2], 'claude-sonnet-4-6' => [3.0, 15.0, 0.3],
        'claude-haiku-5-5' => [0.1, 0.5, 0.01], 'claude-haiku-4-5' => [1.0, 5.0, 0.1],
    ];
    /** effort 를 받는 모델(앞부분) — Haiku 4.5 등 옛 모델에 보내면 400 */
    private const EFFORT_OK = ['claude-fable-', 'claude-opus-5', 'claude-opus-4-6', 'claude-opus-4-7', 'claude-opus-4-8', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-haiku-5'];

    /** OpenRouter 모델 id → Claude 모델 id. anthropic/claude-opus-5.5 → claude-opus-5-5. Claude 가 아니면 $fallback */
    public static function modelFor(string $orModel, string $fallback): string
    {
        $m = strtolower(trim($orModel));
        if (str_starts_with($m, 'anthropic/')) {
            $m = substr($m, 10);
        }
        $m = (string) preg_replace('/[:@].*$/', '', $m);
        if (!str_starts_with($m, 'claude-')) {
            return $fallback;
        }
        return (string) preg_replace('/(\d+)\.(\d+)/', '$1-$2', $m);
    }

    /** 키 확인 — 모델 목록(무료 호출)이 열리면 맞는 키. 틀리면 예외 */
    public static function verify(string $key): void
    {
        [$status, $raw] = self::http('GET', '/models?limit=1', $key, null, 20);
        if ($status === 401 || $status === 403) {
            throw HttpError::invalid('Claude API 키가 맞지 않습니다. 콘솔에서 복사한 키 전체를 다시 넣어 주세요.');
        }
        if ($status !== 200) {
            $d = json_decode($raw, true);
            throw HttpError::invalid('Claude API 확인 실패: ' . (string) ($d['error']['message'] ?? "HTTP $status"));
        }
    }

    /**
     * OpenAI 꼴 본문으로 Claude 를 부르고 OpenAI 꼴 답을 돌려준다 — [HTTP 상태, JSON 문자열].
     * $model 은 이미 Claude id. $effort 는 low|medium|high|xhigh|max 또는 '' (모델 기본).
     */
    public static function chat(string $key, string $model, array $b, int $timeout, string $effort = ''): array
    {
        $body = self::toMessages($model, $b, $effort);
        [$status, $raw] = self::http('POST', '/messages', $key, $body, $timeout);
        $d = json_decode($raw, true);
        if ($status !== 200 || !is_array($d)) {
            // 오류 꼴 {type:error, error:{type, message}} 은 OpenAI 꼴과 error.message 자리가 같다 — 그대로 넘긴다
            return [$status, $raw];
        }
        return [200, (string) json_encode(self::fromMessage($model, $d), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)];
    }

    /** OpenAI 꼴 → Messages API 본문 */
    private static function toMessages(string $model, array $b, string $effort): array
    {
        $system = [];
        $out = [];
        $push = static function (string $role, array $blocks) use (&$out): void {
            if ($blocks === []) {
                return;
            }
            $last = count($out) - 1;
            if ($last >= 0 && $out[$last]['role'] === $role) {   // 같은 쪽이 이어지면 한 차례로 합친다(도구 결과 여러 개 → 한 메시지)
                $out[$last]['content'] = array_merge($out[$last]['content'], $blocks);
                return;
            }
            $out[] = ['role' => $role, 'content' => $blocks];
        };
        foreach ((array) ($b['messages'] ?? []) as $m) {
            $role = (string) ($m['role'] ?? 'user');
            if ($role === 'system' || $role === 'developer') {
                $t = self::plainText($m['content'] ?? '');
                if ($t !== '') {
                    $system[] = $t;
                }
                continue;
            }
            if ($role === 'tool') {
                $push('user', [['type' => 'tool_result', 'tool_use_id' => self::toolId((string) ($m['tool_call_id'] ?? 'tool')), 'content' => self::plainText($m['content'] ?? '') ?: '(빈 결과)']]);
                continue;
            }
            $blocks = self::contentBlocks($m['content'] ?? '');
            if ($role === 'assistant') {
                foreach ((array) ($m['tool_calls'] ?? []) as $tc) {
                    $fn = (array) ($tc['function'] ?? []);
                    $args = $fn['arguments'] ?? '{}';
                    $input = is_string($args) ? json_decode($args, true) : $args;
                    $blocks[] = ['type' => 'tool_use', 'id' => self::toolId((string) ($tc['id'] ?? 'tool')), 'name' => (string) ($fn['name'] ?? ''), 'input' => is_array($input) && $input !== [] ? $input : new \stdClass()];
                }
                $push('assistant', $blocks);
                continue;
            }
            $push('user', $blocks);
        }
        // 마지막이 assistant 면 이어 쓰기(prefill)인데 최신 모델은 400 — 사용자 차례를 하나 붙인다
        if ($out !== [] && $out[count($out) - 1]['role'] === 'assistant') {
            $out[] = ['role' => 'user', 'content' => [['type' => 'text', 'text' => '이어서 계속하라.']]];
        }
        $body = ['model' => $model, 'max_tokens' => max(256, min(128000, (int) ($b['max_tokens'] ?? 16000))), 'messages' => $out];
        if ($system !== []) {
            $body['system'] = implode("\n\n", $system);
        }
        $tools = [];
        foreach ((array) ($b['tools'] ?? []) as $t) {
            $f = (array) ($t['function'] ?? $t);
            if (($f['name'] ?? '') === '') {
                continue;
            }
            $tools[] = ['name' => (string) $f['name'], 'description' => (string) ($f['description'] ?? ''), 'input_schema' => $f['parameters'] ?? ['type' => 'object', 'properties' => new \stdClass()]];
        }
        if ($tools !== []) {
            $body['tools'] = $tools;
            // 강제 도구 호출(any·tool)은 최신 모델이 400 — auto 만 보낸다. none 은 그대로
            $body['tool_choice'] = ['type' => ($b['tool_choice'] ?? '') === 'none' ? 'none' : 'auto'];
        }
        $e = strtolower(trim($effort !== '' ? $effort : (string) ($b['reasoning']['effort'] ?? '')));
        if ($e === 'minimal') {
            $e = 'low';
        }
        if (in_array($e, ['low', 'medium', 'high', 'xhigh', 'max'], true) && self::takesEffort($model)) {
            if ($e === 'xhigh' && str_starts_with($model, 'claude-opus-4-6')) {
                $e = 'high';
            }
            $body['output_config'] = ['effort' => $e];
        }
        // 같은 지시·앞 대화를 되풀이하는 장표 제작 반복에서 입력값을 아낀다(짧으면 캐시되지 않을 뿐 해는 없다)
        $body['cache_control'] = ['type' => 'ephemeral'];
        // temperature·response_format·reasoning 토큰 상한·modalities 는 보내지 않는다 — 최신 모델은 sampling 인자를 400 으로 거절하고,
        // JSON 은 지시문이 이미 요구한다(부르는 쪽 jsonClean 이 앞뒤 글을 정리)
        return $body;
    }

    /**
     * Messages API 답 → OpenAI 꼴. 생각(thinking) 블록은 일부러 버린다 — 다음 차례에 되돌려 보내지 않는다.
     * 엔진(or_agent._trim)이 문맥을 아끼려고 지난 도구 결과·그림을 줄이는데, 생각 블록을 되돌려 보낸 채 앞 기록을 고치면
     * 대화 고정 검사(history-editing check)에 걸려 400 이 난다. 생각 블록을 통째로 빼는 것은 허용된 방식이다.
     */
    private static function fromMessage(string $model, array $d): array
    {
        $text = '';
        $calls = [];
        foreach ((array) ($d['content'] ?? []) as $c) {
            if (($c['type'] ?? '') === 'text') {
                $text .= (string) ($c['text'] ?? '');
            } elseif (($c['type'] ?? '') === 'tool_use') {
                $calls[] = ['id' => (string) ($c['id'] ?? ''), 'type' => 'function',
                    'function' => ['name' => (string) ($c['name'] ?? ''), 'arguments' => (string) json_encode($c['input'] ?? new \stdClass(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]];
            }
        }
        $u = (array) ($d['usage'] ?? []);
        $in = (int) ($u['input_tokens'] ?? 0);
        $cw = (int) ($u['cache_creation_input_tokens'] ?? 0);
        $cr = (int) ($u['cache_read_input_tokens'] ?? 0);
        $outT = (int) ($u['output_tokens'] ?? 0);
        $p = self::PRICE[$model] ?? self::PRICE[self::DEFAULT_MODEL];
        $cost = ($in * $p[0] + $cw * $p[0] * 1.25 + $cr * $p[2] + $outT * $p[1]) / 1e6;
        $finish = match ((string) ($d['stop_reason'] ?? '')) {
            'tool_use' => 'tool_calls',
            'max_tokens' => 'length',
            'refusal' => 'content_filter',
            default => 'stop',
        };
        $msg = ['role' => 'assistant', 'content' => $text];
        if ($calls !== []) {
            $msg['tool_calls'] = $calls;
        }
        return [
            'id' => (string) ($d['id'] ?? ''),
            'object' => 'chat.completion',
            'model' => (string) ($d['model'] ?? $model),
            'provider' => 'anthropic',
            'choices' => [['index' => 0, 'message' => $msg, 'finish_reason' => $finish]],
            'usage' => ['prompt_tokens' => $in + $cw + $cr, 'completion_tokens' => $outT, 'total_tokens' => $in + $cw + $cr + $outT, 'cost' => round($cost, 6),
                'cache_read_tokens' => $cr, 'cache_write_tokens' => $cw],
        ];
    }

    /** OpenAI content(문자열 또는 조각 배열) → Messages API 블록 */
    private static function contentBlocks(mixed $c): array
    {
        if (!is_array($c)) {
            $t = (string) ($c ?? '');
            return trim($t) === '' ? [] : [['type' => 'text', 'text' => $t]];
        }
        $out = [];
        foreach ($c as $p) {
            $type = (string) ($p['type'] ?? '');
            if ($type === 'text' && trim((string) ($p['text'] ?? '')) !== '') {
                $out[] = ['type' => 'text', 'text' => (string) $p['text']];
            } elseif ($type === 'image_url') {
                $url = (string) (is_array($p['image_url'] ?? null) ? ($p['image_url']['url'] ?? '') : ($p['image_url'] ?? ''));
                if (preg_match('#^data:(image/(?:png|jpeg|gif|webp));base64,(.+)$#s', $url, $mm)) {
                    $out[] = ['type' => 'image', 'source' => ['type' => 'base64', 'media_type' => $mm[1], 'data' => $mm[2]]];
                } elseif (preg_match('#^https?://#', $url)) {
                    $out[] = ['type' => 'image', 'source' => ['type' => 'url', 'url' => $url]];
                }
            }
        }
        return $out;
    }

    private static function plainText(mixed $c): string
    {
        if (!is_array($c)) {
            return (string) ($c ?? '');
        }
        $t = [];
        foreach ($c as $p) {
            if (($p['type'] ?? '') === 'text') {
                $t[] = (string) ($p['text'] ?? '');
            }
        }
        return implode("\n", $t);
    }

    /** 도구 호출 id 는 영문·숫자·_- 만 받는다 */
    private static function toolId(string $id): string
    {
        $id = (string) preg_replace('/[^A-Za-z0-9_-]/', '_', $id);
        return $id !== '' ? $id : 'tool';
    }

    private static function takesEffort(string $model): bool
    {
        foreach (self::EFFORT_OK as $p) {
            if (str_starts_with($model, $p)) {
                return true;
            }
        }
        return false;
    }

    private static function http(string $method, string $path, string $key, ?array $body, int $timeout): array
    {
        $ch = curl_init(self::URL . $path);
        $headers = ['x-api-key: ' . $key, 'anthropic-version: ' . self::VERSION];
        if ($body !== null) {
            $headers[] = 'Content-Type: application/json';
        }
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => $timeout,
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        }
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($raw === false) {
            return [502, (string) json_encode(['error' => ['message' => 'Claude API 에 연결하지 못했습니다: ' . $err]], JSON_UNESCAPED_UNICODE)];
        }
        return [$status, (string) $raw];
    }
}
