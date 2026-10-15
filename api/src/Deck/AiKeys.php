<?php
declare(strict_types=1);

namespace Pp\Deck;

use Pp\Core\Db;
use Pp\Core\Config;
use Pp\Core\Response;
use Pp\Core\HttpError;
use Throwable;
use RuntimeException;

/*
 * 출처: powerDeck api/src/AiKeys.php (D:\powerDeck, 2026-10-06 이식). 로직·JSON 모양은 그대로 두고
 * 전역 Db/Config/fail/json_out → Pp\Core(Db·Config·Response·HttpError) 어댑터(Legacy), 테이블은 deck_ 접두, 설정은 Config 'deck.<key>' 로 바꿨다.
 */


/**
 * AI(OpenRouter) 키·모델 설정. 키는 서버 DB 에 암호화(AES-256-GCM)해 두고 브라우저로는 끝자리만 내려 보낸다.
 *   key_mode = personal : 사용자마다 자기 키 (회사 지원 전)
 *   key_mode = company  : 관리자가 넣은 회사 키 하나를 모두가 쓴다
 * OpenRouter 요청은 이 서버가 알맞은 키를 붙여 대신 보낸다(proxy).
 */
final class AiKeys
{
    private const OR = 'https://openrouter.ai/api/v1';
    public const DEFAULT_PLAN = 'anthropic/claude-sonnet-5.5';
    public const DEFAULT_IMAGE = 'openai/gpt-image-2.5-flare';
    public const DEFAULT_DIGEST = 'google/gemini-2.5-flash-lite';
    /** 이미지 외 모든 글 작업(기획·요약·대본·와이어)의 OpenRouter 모델 — xhigh 추론 */
    public const DEFAULT_TEXT = 'meta/muse-spark-1.3-contributor';
    public const DEFAULT_EFFORT = 'xhigh';
    private const EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh'];

    /* ───────── 설정 조회 · 모델 고르기 ───────── */

    /** 화면용 설정 — 키 원문은 절대 넣지 않는다 */
    public static function settings(string $email, bool $admin): array
    {
        $mode = self::mode();
        $mine = self::userRow($email);
        $companyHint = self::setting('company_key_hint');
        $out = [
            'mode' => $mode,
            'personal' => ['set' => (bool) $mine, 'hint' => $mine['key_hint'] ?? null, 'updated_at' => $mine['updated_at'] ?? null],
            'company' => ['set' => $companyHint !== null],
            'models' => self::models($email),
            'ready' => $mode === 'company' ? $companyHint !== null : (bool) $mine,
            'isAdmin' => $admin,
            'budget' => self::budgetInfo($email),
        ];
        $out['engine_model'] = self::engineModel();
        $out['text_engine'] = self::textEngine();
        $out['image_provider'] = self::imageProvider();
        $out['hf_status'] = self::hfStatus();
        $out['hf_key'] = ['set' => self::setting('hf_key_enc') !== null, 'hint' => $admin ? self::setting('hf_key_hint') : null];
        $out['hf_personal'] = ['set' => self::setting(self::uk('hfk', $email)) !== null, 'hint' => self::setting(self::uk('hfh', $email)), 'provider' => self::imageProviderFor($email)];
        $out['digest_model'] = self::setting('digest_model') ?? '';   // 비면 글 모델을 따른다(자료 정리만 따로 고를 수 있다)
        $out['text_model'] = self::setting('text_model') ?? self::DEFAULT_TEXT;
        $out['text_effort'] = self::textEffort();
        if ($admin) {
            $out['company']['hint'] = $companyHint;
            $out['admin_models'] = ['plan' => self::setting('plan_model') ?? self::textModel(), 'image' => self::setting('image_model') ?? self::DEFAULT_IMAGE];
        }
        return $out;
    }

    /** 시안 그림은 OpenRouter 고정 — 모든 AI 를 OpenRouter API 하나로(2026-10-05). Higgsfield 설정은 남아 있어도 쓰지 않는다 */
    public static function imageProvider(): string
    {
        return 'openrouter';
    }

    /** 장표 제작 에이전트 모델(OpenRouter id) — 관리자가 OpenRouter 목록에서 아무 모델이나 고른다. 기본 Claude Opus 5.5 */
    public const DEFAULT_ENGINE = 'anthropic/claude-opus-5.5';
    /** 기획·요약·대본 등 글 작업은 늘 OpenRouter API(설정한 글 모델) — 엔진 PC 의 Claude 구독(cli)으로 넘기던 길은 닫았다(2026-10-05) */
    public static function textEngine(): string
    {
        return 'api';
    }

    /** 이미지 외 모든 글 작업이 OpenRouter 로 돌 때 쓰는 모델·추론 강도 — 관리자 설정, 기본 muse-spark xhigh */
    public static function textModel(): string
    {
        $m = trim((string) (self::setting('text_model') ?? ''));
        return $m !== '' ? $m : self::DEFAULT_TEXT;
    }

    public static function textEffort(): string
    {
        $e = strtolower(trim((string) (self::setting('text_effort') ?? '')));
        return in_array($e, self::EFFORTS, true) ? $e : self::DEFAULT_EFFORT;
    }

    /** 이미지 외 글 작업의 실제 모델 — 개인 키 방식에서 본인이 고른 글 모델, 회사 키 방식에서 회사가 고른 글 모델이 있으면 그것을, 없으면 글 기본(muse-spark) */
    private static function textModelFor(string $email): string
    {
        if (self::mode() === 'personal') {
            $st = Db::pdo()->prepare('SELECT plan_model FROM deck_ai_user_keys WHERE email = ?');
            $st->execute([strtolower($email)]);
            $r = $st->fetch() ?: [];
            if (!empty($r['plan_model'])) return (string) $r['plan_model'];
        } else {
            $p = self::setting('plan_model');
            if ($p) return $p;
        }
        return self::textModel();
    }

    /**
     * 추천 추론 강도 — 사람이 고르지 않는다(2026-10-05). 작업 종류 × 모델 계열.
     *   자료 정리(digest) low — 긴 자료를 빠르고 싸게 / 기획·와이어(plan) high / 대본·QA(script) medium / 장표 제작(build) medium(수십 번 주고받는다)
     *   muse 계열은 기획 xhigh·제작 high(지금까지 쓰던 값)
     */
    private static function recommendedEffort(string $model, string $kind): string
    {
        $muse = stripos($model, 'muse') !== false;
        return match ($kind) {
            'digest' => 'low',
            'plan' => $muse ? 'xhigh' : 'high',
            'build' => $muse ? 'high' : 'medium',
            default => 'medium',
        };
    }

    /** OpenRouter 로 보내고, 추론 인자 때문에 거절(400·422)되면 추론을 빼고 답 몫만으로 한 번 더 — 어떤 모델이든 멈추지 않게 */
    private static function send(string $key, array $b, int $timeout, string $path = '/chat/completions'): array
    {
        $ans = (int) ($b['_answer_tokens'] ?? 0);   // 내부 표시 — OpenRouter 로는 보내지 않는다
        unset($b['_answer_tokens']);
        [$status, $raw] = self::http('POST', $path, $key, $b, $timeout);
        if (($status === 400 || $status === 422) && isset($b['reasoning'])) {
            error_log('[powerDeck] 추론 인자 거절 — 빼고 다시: ' . ($b['model'] ?? '') . ' ' . mb_substr($raw, 0, 200));
            unset($b['reasoning']);
            if ($ans > 0) $b['max_tokens'] = $ans;
            [$status, $raw] = self::http('POST', $path, $key, $b, $timeout);
        }
        return [$status, $raw];
    }

    /** AI JSON 앞뒤 정리 + 문자열 안 실제 제어문자 이스케이프 — 추론 모델이 날것 줄바꿈·탭을 넣으면 json_decode 가 터진다 */
    public static function jsonClean(string $s): string
    {
        $s = (string) preg_replace('/^```(?:json)?\s*|\s*```$/', '', trim($s));
        $out = '';
        $in = false;
        $esc = false;
        $n = strlen($s);
        for ($i = 0; $i < $n; $i++) {
            $c = $s[$i];
            if ($in) {
                if ($esc) { $out .= $c; $esc = false; continue; }
                if ($c === '\\') { $out .= $c; $esc = true; continue; }
                if ($c === '"') { $out .= $c; $in = false; continue; }
                $o = ord($c);
                if ($o < 0x20) { $out .= $o === 0x0A ? '\n' : ($o === 0x0D ? '\r' : ($o === 0x09 ? '\t' : '')); continue; }
                $out .= $c;
                continue;
            }
            if ($c === '"') $in = true;
            $out .= $c;
        }
        return $out;
    }

    public static function engineModel(): string
    {
        $m = trim((string) (self::setting('engine_model') ?? ''));
        if ($m === '') return self::DEFAULT_ENGINE;
        if (strpos($m, '/') === false && str_starts_with($m, 'claude-')) {   // 예전 Claude Code 이름(claude-opus-5-5) → OpenRouter id
            $m = 'anthropic/' . preg_replace('/-(\d+)-(\d+)$/', '-$1.$2', preg_replace('/\[.*\]$|-\d{8}$/', '', $m));
        }
        return $m;
    }

    /**
     * OpenRouter 모델 능력 — 공개 목록(/models)을 6시간 캐시. 어떤 모델을 골라도 그 모델이 받는 인자만 보내려고.
     * 모르는 모델이면 null(손대지 않고 그대로 보낸다)
     */
    public static function modelInfo(string $model): ?array
    {
        static $mem = null;
        if ($mem === null) {
            $f = sys_get_temp_dir() . '/pd_or_models.json';
            $mem = is_file($f) && time() - filemtime($f) < 21600 ? (json_decode((string) file_get_contents($f), true) ?: []) : [];
            if (!$mem) {
                $ch = curl_init(self::OR . '/models');
                curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 30]);
                $raw = curl_exec($ch);
                foreach ((json_decode((string) $raw, true)['data'] ?? []) as $m) {
                    $sp = $m['supported_parameters'] ?? [];
                    $top = $m['top_provider'] ?? [];
                    $mem[$m['id']] = [
                        'tools' => in_array('tools', $sp, true),
                        'reasoning' => in_array('reasoning', $sp, true) || in_array('include_reasoning', $sp, true),
                        'json' => in_array('response_format', $sp, true) || in_array('structured_outputs', $sp, true),
                        'temperature' => in_array('temperature', $sp, true),
                        'vision' => in_array('image', $m['architecture']['input_modalities'] ?? [], true),
                        'max_out' => (int) ($top['max_completion_tokens'] ?? 0),
                        'ctx' => (int) ($m['context_length'] ?? 0),
                    ];
                }
                if ($mem) @file_put_contents($f, json_encode($mem));
                elseif (is_file($f)) $mem = json_decode((string) file_get_contents($f), true) ?: [];   // 못 받으면 낡은 캐시라도
            }
        }
        return $mem[$model] ?? ($mem[explode(':', $model)[0]] ?? null);
    }

    /** 고른 모델에 맞게 글 요청을 다듬는다 — 출력 한도, 그림을 못 보는 모델의 그림, 안 받는 인자(JSON 형식·도구·온도), 추론 강도 */
    private static function fitModel(string $model, array $b, string $kind = 'plan'): array
    {
        $i = self::modelInfo($model);
        if ($i === null) { unset($b['reasoning']); return $b; }   // 목록에 없는 모델 — 추론 인자를 붙이지 않는다(거절될 수 있다)
        if (!empty($b['max_tokens']) && $i['max_out'] > 0 && (int) $b['max_tokens'] > $i['max_out']) $b['max_tokens'] = $i['max_out'];
        if (!empty($b['max_tokens']) && $i['ctx'] > 0 && (int) $b['max_tokens'] > (int) ($i['ctx'] / 2)) $b['max_tokens'] = (int) ($i['ctx'] / 2);
        if (!$i['json'] && isset($b['response_format'])) unset($b['response_format']);   // 지시문이 이미 'JSON 만' 을 요구한다 — 앞뒤 글은 jsonClean 이 정리
        if (!$i['tools']) unset($b['tools'], $b['tool_choice']);
        if (!$i['temperature']) unset($b['temperature']);
        if (!$i['vision'] && isset($b['messages']) && is_array($b['messages'])) {   // 그림 조각 → 글 한 줄
            foreach ($b['messages'] as &$m) {
                if (!is_array($m['content'] ?? null)) continue;
                $txt = [];
                foreach ($m['content'] as $p) $txt[] = ($p['type'] ?? '') === 'text' ? (string) ($p['text'] ?? '') : '[그림 — 이 모델은 그림을 볼 수 없어 뺐다]';
                $m['content'] = implode("\n", $txt);
            }
            unset($m);
        }
        if ($i['reasoning']) {
            // 강도는 추천값(작업 종류 × 모델). 추론 토큰도 max_tokens 안에서 쓰므로 생각 상한(reasoning.max_tokens)을 정하고
            // 답 몫(원래 max_tokens)을 따로 더한다 — effort 만 주면 max_tokens 대부분을 생각에 써서 답이 비었다(2026-10-05 와이어 0/5장).
            // effort 만 받는 모델은 OpenRouter 가 이 상한을 강도로 바꿔 준다. 쓴 만큼만 과금
            $budget = ['minimal' => 1024, 'low' => 4096, 'medium' => 12000, 'high' => 24000, 'xhigh' => 48000];
            $eff = (string) ($b['reasoning']['effort'] ?? self::recommendedEffort($model, $kind));
            if (empty($b['reasoning']['max_tokens'])) {
                $cap = $i['max_out'] > 0 ? $i['max_out'] : 64000;
                if ($i['ctx'] > 0) $cap = min($cap, (int) ($i['ctx'] / 2));
                $ans = min((int) ($b['max_tokens'] ?? 16000), (int) ($cap / 2));
                $r = max(1024, min($budget[$eff] ?? 12000, $cap - $ans));
                $b['reasoning'] = ['max_tokens' => $r];
                $b['_answer_tokens'] = $ans;
                $b['max_tokens'] = min($cap, $ans + $r);
            }
        } else {
            unset($b['reasoning']);
        }
        return $b;
    }

    /* ───────── 키 · 모델 저장 ───────── */

    /** 개인 키 저장 — OpenRouter 로 확인하고 맞을 때만 */
    public static function savePersonal(string $email, string $key): array
    {
        $key = self::cleanKey($key);
        $info = self::keyInfo($key);
        Db::pdo()->prepare('REPLACE INTO deck_ai_user_keys (email, key_enc, key_hint, updated_at) VALUES (?, ?, ?, NOW())')
            ->execute([strtolower($email), self::enc($key), self::hint($key)]);
        return ['ok' => true, 'info' => $info];
    }

    public static function deletePersonal(string $email): array
    {
        Db::pdo()->prepare('DELETE FROM deck_ai_user_keys WHERE email = ?')->execute([strtolower($email)]);
        return ['ok' => true];
    }

    /** 개인 모델 선택 (회사 키 방식이면 관리자 설정이 우선) */
    public static function saveModels(string $email, array $b): array
    {
        [$plan, $image] = self::cleanModels($b);
        Db::pdo()->prepare('INSERT INTO deck_ai_user_keys (email, key_enc, key_hint, plan_model, image_model, updated_at) VALUES (?, "", NULL, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE plan_model = VALUES(plan_model), image_model = VALUES(image_model)')
            ->execute([strtolower($email), $plan, $image]);
        return ['ok' => true, 'models' => self::models($email)];
    }

    /** 관리자 — 키 방식·회사 키·회사 기본 모델 */
    public static function saveAdmin(array $b): array
    {
        if (isset($b['mode'])) {
            $mode = (string) $b['mode'];
            if (!in_array($mode, ['personal', 'company'], true)) Legacy::fail('키 방식은 personal 또는 company 입니다.');
            if ($mode === 'company' && self::setting('company_key_hint') === null && trim((string) ($b['company_key'] ?? '')) === '') {
                Legacy::fail('공용 키 방식으로 바꾸려면 OpenRouter 키를 먼저 넣어 주세요.');
            }
            self::setSetting('key_mode', $mode);
        }
        $info = null;
        if (trim((string) ($b['company_key'] ?? '')) !== '') {
            $key = self::cleanKey((string) $b['company_key']);
            $info = self::keyInfo($key);
            self::setSetting('company_key_enc', self::enc($key));
            self::setSetting('company_key_hint', self::hint($key));
        }
        if (!empty($b['remove_company_key'])) {
            if (self::mode() === 'company') Legacy::fail('공용 키 방식에서는 키를 지울 수 없습니다. 먼저 개인 키 방식으로 바꿔 주세요.');
            self::setSetting('company_key_enc', null);
            self::setSetting('company_key_hint', null);
        }
        if (isset($b['plan']) || isset($b['image'])) {
            [$plan, $image] = self::cleanModels($b);
            self::setSetting('plan_model', $plan);
            self::setSetting('image_model', $image);
        }
        if (isset($b['digest_model'])) {
            $m = trim((string) $b['digest_model']);
            if ($m !== '' && !preg_match('#^[a-z0-9._-]+/[a-z0-9._:-]+$#i', $m)) Legacy::fail('요약 모델 이름이 올바르지 않습니다.');
            self::setSetting('digest_model', $m !== '' ? $m : null);
        }
        if (isset($b['text_model'])) {
            $m = trim((string) $b['text_model']);
            if ($m !== '' && !preg_match('#^[a-z0-9._-]+/[a-z0-9._:-]+$#i', $m)) Legacy::fail('글 모델 이름이 올바르지 않습니다.');
            self::setSetting('text_model', $m !== '' ? $m : null);
        }
        if (isset($b['text_effort'])) {
            $e = strtolower(trim((string) $b['text_effort']));
            if (!in_array($e, self::EFFORTS, true)) Legacy::fail('추론 강도는 minimal·low·medium·high·xhigh 중 하나입니다.');
            self::setSetting('text_effort', $e);
        }
        // text_engine · image_provider 는 OpenRouter 로 고정 — 예전 화면이 보내도 무시한다
        if (trim((string) ($b['hf_key_id'] ?? '')) !== '' && trim((string) ($b['hf_key_secret'] ?? '')) !== '') {   // 두 칸으로 받은 것 — secret 이 이미 'ID:…' 이면 겹친 ID 는 아래에서 하나로
            $b['hf_key'] = preg_replace('/\s+/', '', (string) $b['hf_key_id']) . ':' . preg_replace('/\s+/', '', (string) $b['hf_key_secret']);
        }
        if (trim((string) ($b['hf_key'] ?? '')) !== '') {   // 회사 Higgsfield 키 — 무료 견적 호출로 확인한 뒤 저장
            $k = self::hfCheck((string) preg_replace('/\s+/', '', (string) $b['hf_key']));
            self::setSetting('hf_key_enc', self::enc($k));
            self::setSetting('hf_key_hint', substr($k, 0, 6) . '…' . substr($k, -4));
        }
        if (!empty($b['remove_hf_key'])) { self::setSetting('hf_key_enc', null); self::setSetting('hf_key_hint', null); }
        if (isset($b['engine_model'])) {
            $m = trim((string) $b['engine_model']);
            if ($m !== '' && !preg_match('#^[a-z0-9._-]+/[a-z0-9._:-]+$#i', $m)) Legacy::fail('엔진 모델은 OpenRouter 모델 이름입니다 (예: anthropic/claude-opus-5.5).');
            self::setSetting('engine_model', $m !== '' ? $m : null);
        }
        return ['ok' => true, 'info' => $info];
    }

    /* ───────── Higgsfield 키 · 그림 만드는 곳 ───────── */

    /** 설정 화면에서 넣은 Higgsfield 키('id:secret') — 엔진에만 넘긴다. 개인 키 방식이면 그 사용자의 키, 회사 키 방식이면 회사 키 */
    public static function hfKey(?string $email = null): string
    {
        $e = $email !== null && self::mode() !== 'company' ? self::setting(self::uk('hfk', $email)) : self::setting('hf_key_enc');
        try { return $e ? self::dec($e) : ''; } catch (Throwable $x) { return ''; }
    }

    /** 사용자별 설정 키(ai_settings.k 는 64자) */
    private static function uk(string $p, string $email): string
    {
        return $p . ':' . sha1(strtolower($email));
    }

    /** 이 사용자의 시안 그림 만드는 곳 — 개인 키 방식이면 본인이 고른 것, 회사 키 방식이면 관리자 설정 */
    public static function imageProviderFor(string $email): string
    {
        if (self::mode() === 'company') return self::imageProvider();
        return self::setting(self::uk('hfp', $email)) === 'higgsfield' ? 'higgsfield' : 'openrouter';
    }

    /** 내 계정 — Higgsfield 키(두 칸)·그림 만드는 곳(개인 키 방식에서) */
    public static function savePersonalHf(string $email, array $b): array
    {
        if (self::mode() === 'company') Legacy::fail('공용 키 방식에서는 관리자가 정합니다.', 409);
        if (!empty($b['remove'])) { self::setSetting(self::uk('hfk', $email), null); self::setSetting(self::uk('hfh', $email), null); }
        $id = (string) preg_replace('/\s+/', '', (string) ($b['id'] ?? ''));
        $sec = (string) preg_replace('/\s+/', '', (string) ($b['secret'] ?? ''));
        if ($id !== '' && $sec !== '') {
            $k = self::hfCheck($id . ':' . $sec);
            self::setSetting(self::uk('hfk', $email), self::enc($k));
            self::setSetting(self::uk('hfh', $email), substr($k, 0, 6) . '…' . substr($k, -4));
        }
        if (isset($b['provider'])) {
            if ($b['provider'] === 'higgsfield' && !self::setting(self::uk('hfk', $email))) Legacy::fail('Higgsfield 키를 먼저 넣어 주세요.');
            self::setSetting(self::uk('hfp', $email), $b['provider'] === 'higgsfield' ? 'higgsfield' : null);
        }
        return ['ok' => true];
    }

    /** Higgsfield 키 확인 — 겹친 ID 정리, 형식, 무료 견적 호출. 정리한 'id:secret' 을 돌려준다 */
    private static function hfCheck(string $k): string
    {
        if (preg_match('/^([0-9a-f-]{36}):\1:(.+)$/i', $k, $mm)) $k = $mm[1] . ':' . $mm[2];
        if (!preg_match('/^[0-9a-f-]{36}:[^:\s]{16,200}$/i', $k)) Legacy::fail('Higgsfield 키 형식이 아닙니다 — API key ID 와 secret 을 확인해 주세요.');
        $ch = curl_init('https://api.higgsfield.ai/estimate/marketing-studio/image/flare');
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_TIMEOUT => 20,
            CURLOPT_HTTPHEADER => ['Authorization: Key ' . $k, 'Content-Type: application/json'], CURLOPT_POSTFIELDS => '{"prompt":"test"}']);
        curl_exec($ch);
        if ((int) curl_getinfo($ch, CURLINFO_HTTP_CODE) === 401) Legacy::fail('Higgsfield 키가 맞지 않습니다. 콘솔에서 복사한 ID 와 secret 을 확인해 주세요.');
        return $k;
    }

    public static function setHfStatus(string $state, string $msg): void
    {
        self::setSetting('hf_status', json_encode(['state' => $state === 'no_credits' ? 'no_credits' : 'ok', 'message' => mb_substr($msg, 0, 300), 'at' => date('Y-m-d H:i:s')], JSON_UNESCAPED_UNICODE));
    }

    public static function hfStatus(): array
    {
        $s = json_decode((string) (self::setting('hf_status') ?? ''), true);
        return is_array($s) ? $s : ['state' => 'unknown'];
    }

    /* ───────── 잔액 · 예산 ───────── */

    /**
     * 그림(시안) 비용을 쓸 단계 전에 OpenRouter 에 쓸 돈이 남았는지 — 모자라면 바로 알린다(대기열에서 기다리다 실패하지 않게).
     * 둘 중 작은 쪽: 계정 잔액(크레딧 − 사용액) · 키 한도의 남은 금액. 1분 캐시. 확인 자체가 실패하면 막지 않는다.
     */
    public static function creditCheck(string $email, float $need = 0.5): void
    {
        if (self::imageProviderFor($email) === 'higgsfield') {
            $hf = self::hfStatus();
            if (($hf['state'] ?? '') !== 'no_credits') return;   // Higgsfield 로 만든다 — OpenRouter 잔액은 상관없다
            // Higgsfield 크레딧이 소진됐다 — 대신 쓸 OpenRouter 잔액을 본다. 그것도 없으면 아래에서 막는다
        }
        try { $key = self::effectiveKey($email); } catch (Throwable $e) { return; }
        $cf = sys_get_temp_dir() . '/pd_credit_' . substr(hash('sha256', $key), 0, 16) . '.json';
        $c = is_file($cf) && filemtime($cf) > time() - 60 ? json_decode((string) file_get_contents($cf), true) : null;
        if (!is_array($c)) {
            $c = ['acct' => null, 'key' => null];
            [$s1, $r1] = self::http('GET', '/credits', $key, null, 10);
            $d1 = json_decode($r1, true)['data'] ?? null;
            if ($s1 === 200 && is_array($d1)) $c['acct'] = (float) ($d1['total_credits'] ?? 0) - (float) ($d1['total_usage'] ?? 0);
            [$s2, $r2] = self::http('GET', '/key', $key, null, 10);
            $d2 = json_decode($r2, true)['data'] ?? null;
            if ($s2 === 200 && is_array($d2) && isset($d2['limit_remaining'])) $c['key'] = (float) $d2['limit_remaining'];
            @file_put_contents($cf, json_encode($c));
        }
        if ($c['acct'] !== null && $c['acct'] < $need)
            Legacy::fail(sprintf((self::imageProviderFor($email) === 'higgsfield' ? 'Higgsfield 크레딧이 소진됐고, 대신 쓸 ' : '') . 'OpenRouter 계정 잔액이 $%.2f 남아 시안 그림을 만들 수 없습니다. 충전(openrouter.ai/settings/credits)한 뒤 다시 눌러 주세요. — 키 한도가 남아 있어도 계정 잔액이 없으면 만들지 못합니다.', max(0, $c['acct'])), 402);
        if ($c['key'] !== null && $c['key'] < $need)
            Legacy::fail(sprintf('OpenRouter 키 한도가 $%.2f 남아 시안 그림을 만들 수 없습니다. 키 한도를 올린 뒤 다시 눌러 주세요.', max(0, $c['key'])), 402);
    }

    /** 지금 이 사용자에게 적용되는 키의 한도·사용액 */
    public static function check(string $email): array
    {
        return ['info' => self::keyInfo(self::effectiveKey($email))];
    }

    /** 비용 한도 — 관리자가 전역으로 정한다: 작업당 한도(job_budget_usd), 사용자별 월 상한(monthly_cap_usd). 이달 사용액은 사용자별 */
    public static function budgetInfo(string $email): array
    {
        $m = Db::pdo()->prepare("SELECT COALESCE(SUM(cost_usd),0) FROM deck_ai_usage WHERE email = ? AND kind NOT IN " . self::SUBS_SQL . " AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')");
        $m->execute([strtolower($email)]);
        $d = self::setting('job_budget_usd');
        $c = self::setting('monthly_cap_usd');
        return [
            'default' => $d !== null && (float) $d > 0 ? (float) $d : null,
            'monthly_cap' => $c !== null && (float) $c > 0 ? (float) $c : null,
            'month_spent' => round((float) $m->fetchColumn(), 4),
        ];
    }

    /** 구독 사용분 종류 — 실제 청구가 아니라 API 환산액(engine·e* = Claude 구독, hf = Higgsfield 크레딧). 화면 KIND 의 '(구독·환산)' 과 같게 */
    private const SUBS_SQL = "('engine','eplan','edigest','escript','ewire','hf')";

    /** 관리자 — 과금 내역: 기간 합계, 사용자별·모델별 합계, 호출 한 건씩(최근 500건) */
    public static function adminUsage(int $days): array
    {
        $days = max(1, min(365, $days));
        $pdo = Db::pdo();
        $since = "created_at >= (NOW() - INTERVAL $days DAY)";
        $sub = "kind IN " . self::SUBS_SQL;   // 구독 사용분(Claude 구독·Higgsfield 크레딧)의 API 환산액 — 실제 청구 아님
        $real = "NOT ($sub) AND $since";   // 실제 청구(OpenRouter)만
        $sum = "SELECT COUNT(*) n, COALESCE(SUM(cost_usd),0) cost, COALESCE(SUM(tokens_in),0) tin, COALESCE(SUM(tokens_out),0) tout FROM deck_ai_usage WHERE ";
        $tot = $pdo->query($sum . $real)->fetch();
        $stot = $pdo->query($sum . "$sub AND $since")->fetch();
        $mon = "created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')";
        $month = (float) $pdo->query("SELECT COALESCE(SUM(cost_usd),0) FROM deck_ai_usage WHERE NOT ($sub) AND $mon")->fetchColumn();
        $smonth = (float) $pdo->query("SELECT COALESCE(SUM(cost_usd),0) FROM deck_ai_usage WHERE $sub AND $mon")->fetchColumn();
        $f = static fn($r) => ['cost' => round((float) $r['cost'], 4), 'n' => (int) $r['n']] + $r;
        return [
            'days' => $days,
            'total' => ['n' => (int) $tot['n'], 'cost' => round((float) $tot['cost'], 4), 'tokens_in' => (int) $tot['tin'], 'tokens_out' => (int) $tot['tout']],
            'month_cost' => round($month, 4),
            'subs' => ['n' => (int) $stot['n'], 'cost' => round((float) $stot['cost'], 4), 'tokens_in' => (int) $stot['tin'], 'tokens_out' => (int) $stot['tout'], 'month_cost' => round($smonth, 4)],
            'by_user' => array_map($f, $pdo->query("SELECT email, COUNT(*) n, SUM(cost_usd) cost, SUM(kind='image') images FROM deck_ai_usage WHERE $real GROUP BY email ORDER BY cost DESC")->fetchAll()),
            'by_model' => array_map($f, $pdo->query("SELECT model, kind, COUNT(*) n, SUM(cost_usd) cost FROM deck_ai_usage WHERE $since GROUP BY model, kind ORDER BY cost DESC")->fetchAll()),
            'by_day' => array_map($f, $pdo->query("SELECT DATE(created_at) day, COUNT(*) n, SUM(cost_usd) cost FROM deck_ai_usage WHERE $real GROUP BY DATE(created_at) ORDER BY day")->fetchAll()),
            'rows' => array_map(static fn($r) => ['cost_usd' => round((float) $r['cost_usd'], 6), 'tokens_in' => (int) $r['tokens_in'], 'tokens_out' => (int) $r['tokens_out']] + $r,
                $pdo->query("SELECT u.id, u.created_at, u.email, u.job_id, j.title, u.kind, u.model, u.cost_usd, u.tokens_in, u.tokens_out
                             FROM deck_ai_usage u LEFT JOIN deck_jobs j ON j.id = u.job_id WHERE u.$since ORDER BY u.id DESC LIMIT 500")->fetchAll()),
        ];
    }

    /** 관리자 — 작업당 한도·월 상한 */
    public static function saveBudget(array $b): array
    {
        $num = static function ($v): ?string { $f = (float) ($v ?? 0); if ($f > 10000) Legacy::fail('$10,000 이하로 적어 주세요.'); return $f > 0 ? (string) round($f, 2) : null; };
        if (array_key_exists('default_budget_usd', $b)) self::setSetting('job_budget_usd', $num($b['default_budget_usd']));
        if (array_key_exists('monthly_cap_usd', $b)) self::setSetting('monthly_cap_usd', $num($b['monthly_cap_usd']));
        return ['ok' => true];
    }

    public static function jobBudget(): ?float
    {
        $d = self::setting('job_budget_usd');
        return $d !== null && (float) $d > 0 ? (float) $d : null;
    }

    /* ───────── AI 호출 — 엔진 대신 부르기 · 작업 대기열 · 채팅 ───────── */

    /**
     * 엔진(작업자)이 작업 주인의 키로 OpenRouter 를 부른다. 비용은 작업(spent_usd)과 사용 기록(ai_usage)에 적립.
     * 작업 한도(budget_usd)·월 상한을 넘으면 402 로 거절한다 — 엔진은 그 자리에서 멈춘다.
     */
    public static function chatForJob(array $job, array $b): void
    {
        $email = strtolower((string) $job['email']);
        $jid = (string) $job['id'];
        $budget = $job['budget_usd'] !== null ? (float) $job['budget_usd'] : null;
        $spent = (float) $job['spent_usd'];
        if ($budget !== null && $spent >= $budget) Legacy::fail(sprintf('이 작업의 비용 한도($%.2f)에 도달했습니다 (사용 $%.4f). 한도를 올리면 이어서 만듭니다.', $budget, $spent), 402);
        $bi = self::budgetInfo($email);
        if ($bi['monthly_cap'] !== null && $bi['month_spent'] >= $bi['monthly_cap']) Legacy::fail(sprintf('이달 AI 비용 상한($%.2f)에 도달했습니다 (사용 $%.4f). AI 키 설정에서 상한을 올려 주세요.', $bi['monthly_cap'], $bi['month_spent']), 402);

        $key = self::effectiveKey($email);
        $kind = in_array($b['kind'] ?? '', ['image', 'digest', 'build'], true) ? $b['kind'] : 'plan';
        unset($b['kind']);
        // 엔진이 정한 기다릴 시간(선택 단계는 짧게) — 60~300초, 없으면 300(2026-10-07 속도 점검)
        $wait = isset($b['_timeout']) ? max(60, min(300, (int) $b['_timeout'])) : 300;
        unset($b['_timeout']);
        // 글(기획·요약·제작 에이전트)은 이미지 외 전부 글 모델(muse-spark xhigh 기본, 본인·회사가 고른 글 모델이 있으면 그것)로 — 이미지는 전용 모델 그대로. build는 워커가 명시한 모델 우선.
        $b['model'] = (string) ($b['model'] ?? '') !== '' ? (string) $b['model']
            : ($kind === 'image' ? self::models($email)['image']   // 그림은 관리자가 정해 둔 이미지 모델 고정(예전엔 여기서 글 모델이 들어갔다)
            : ($kind === 'digest' ? (self::setting('digest_model') ?: self::textModelFor($email)) : self::textModelFor($email)));
        if (!preg_match('#^[a-z0-9._-]+/[a-z0-9._:-]+$#i', $b['model'])) Legacy::fail('모델 이름이 올바르지 않습니다.');
        if ($kind !== 'image') $b = self::fitModel($b['model'], $b, $kind);
        unset($b['stream']);
        // 글(기획)은 chat/completions, 그림(시안)은 전용 이미지 API(/images: prompt·aspect_ratio·quality·input_references → data[].b64_json)
        if ($kind === 'image') {
            if (trim((string) ($b['prompt'] ?? '')) === '') Legacy::fail('prompt 가 필요합니다.');
            $path = '/images';
        } else {
            if (!isset($b['messages']) || !is_array($b['messages'])) Legacy::fail('messages 가 필요합니다.');
            $path = '/chat/completions';
        }
        [$status, $raw] = $kind === 'image' ? self::http('POST', $path, $key, $b, 300) : self::send($key, $b, $wait, $path);
        $d = json_decode($raw, true);
        $cost = 0.0;
        if ($status === 200 && is_array($d)) {
            $u = $d['usage'] ?? [];
            $cost = (float) ($u['cost'] ?? 0);
            Db::pdo()->prepare('INSERT INTO deck_ai_usage (email, job_id, kind, model, cost_usd, tokens_in, tokens_out, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())')
                ->execute([$email, $jid, $kind, mb_substr((string) $b['model'], 0, 128), $cost, (int) ($u['prompt_tokens'] ?? 0), (int) ($u['completion_tokens'] ?? 0)]);
            $spent = Jobs::addSpend($jid, $cost);
            $d['pd'] = ['cost' => $cost, 'spent' => round($spent, 4), 'budget' => $budget, 'cost_known' => isset($u['cost'])];
            $raw = json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo $raw;
    }

    /**
     * 글 작업을 엔진 PC 에 맡긴다(ai_tasks). 엔진이 켜져 있고 글 엔진이 '구독(CLI)'일 때만.
     * 20초 안에 아무 엔진도 안 가져가면(꺼짐·과부하) 거두고 null — 부르는 쪽이 OpenRouter 로 간다.
     * 가져갔는데 4분 안에 끝나지 않거나 실패해도 null.
     */
    // 정리 필요: 이 파일 안팎 어디서도 부르지 않는다(2026-10-15 확인) — chatForJob 에서 연결이 끊긴 것인지 일부러 끈 것인지 확인 후 연결하거나 지운다
    private static function viaEngine(array $job, string $kind, array $b): ?array
    {
        if (self::textEngine() !== 'cli') return null;
        $pdo = Db::pdo();
        if (!(int) $pdo->query('SELECT COUNT(*) FROM deck_workers WHERE seen_at > (NOW() - INTERVAL 30 SECOND)')->fetchColumn()) return null;
        $pdo->prepare('INSERT INTO deck_ai_tasks (job_id, email, kind, body, status, created_at, updated_at) VALUES (?, ?, ?, ?, \'queued\', NOW(), NOW())')
            ->execute([(string) ($job['id'] ?? ''), strtolower((string) $job['email']), $kind, json_encode(['messages' => $b['messages'] ?? []], JSON_UNESCAPED_UNICODE)]);
        $id = (int) $pdo->lastInsertId();
        @set_time_limit(320);
        $t0 = time();
        while (true) {
            usleep(1000000);
            $st = $pdo->prepare('SELECT status, result, error FROM deck_ai_tasks WHERE id = ?');
            $st->execute([$id]);
            $r = $st->fetch() ?: ['status' => 'failed'];
            if ($r['status'] === 'done') {
                $pdo->prepare('INSERT INTO deck_ai_usage (email, job_id, kind, model, cost_usd, tokens_in, tokens_out, created_at) VALUES (?, ?, ?, ?, 0, 0, 0, NOW())')
                    ->execute([strtolower((string) $job['email']), (string) ($job['id'] ?? ''), 'e' . $kind, 'engine (Claude 구독)']);
                return ['choices' => [['message' => ['content' => (string) $r['result']]]], 'model' => 'engine', 'usage' => ['cost' => 0]];
            }
            if ($r['status'] === 'failed') return null;
            $wait = time() - $t0;
            if ($r['status'] === 'queued' && $wait >= 20) {   // 아무도 안 가져감 — 거두고 OpenRouter 로
                $pdo->prepare("UPDATE deck_ai_tasks SET status = 'canceled', updated_at = NOW() WHERE id = ? AND status = 'queued'")->execute([$id]);
                return null;
            }
            if ($wait >= 240) {
                $pdo->prepare("UPDATE deck_ai_tasks SET status = 'canceled', updated_at = NOW() WHERE id = ?")->execute([$id]);
                return null;
            }
        }
    }

    /** 엔진이 글 작업 하나를 가져간다(원자적으로) */
    public static function claimTask(string $worker): ?array
    {
        $pdo = Db::pdo();
        $pdo->exec("UPDATE deck_ai_tasks SET status = 'canceled' WHERE status IN ('queued','running') AND created_at < (NOW() - INTERVAL 10 MINUTE)");
        $r = $pdo->query("SELECT id FROM deck_ai_tasks WHERE status = 'queued' ORDER BY id LIMIT 1")->fetch();
        if (!$r) return null;
        $u = $pdo->prepare("UPDATE deck_ai_tasks SET status = 'running', worker = ?, updated_at = NOW() WHERE id = ? AND status = 'queued'");
        $u->execute([$worker, $r['id']]);
        if ($u->rowCount() !== 1) return null;
        $st = $pdo->prepare('SELECT id, job_id, kind, body FROM deck_ai_tasks WHERE id = ?');
        $st->execute([$r['id']]);
        $t = $st->fetch();
        $t['body'] = json_decode((string) $t['body'], true);
        return $t;
    }

    public static function finishTask(int $id, string $worker, array $b): array
    {
        $ok = isset($b['content']) && trim((string) $b['content']) !== '';
        Db::pdo()->prepare("UPDATE deck_ai_tasks SET status = ?, result = ?, error = ?, updated_at = NOW() WHERE id = ? AND worker = ? AND status = 'running'")
            ->execute([$ok ? 'done' : 'failed', $ok ? (string) $b['content'] : null, $ok ? null : mb_substr((string) ($b['error'] ?? ''), 0, 1000), $id, $worker]);
        return ['ok' => true];
    }

    /** 서버가 직접 쓰는 글 호출(발표 대본 등) — 한도 확인·비용 기록은 chatForJob 과 같다. 결과(배열)를 돌려준다 */
    public static function ask(array $job, string $kind, array $b): array
    {
        $email = strtolower((string) $job['email']);
        $budget = $job['budget_usd'] !== null ? (float) $job['budget_usd'] : null;
        if ($budget !== null && (float) $job['spent_usd'] >= $budget) Legacy::fail(sprintf('이 작업의 비용 한도($%.2f)에 도달했습니다.', $budget), 402);
        $bi = self::budgetInfo($email);
        if ($bi['monthly_cap'] !== null && $bi['month_spent'] >= $bi['monthly_cap']) Legacy::fail(sprintf('이달 AI 비용 상한($%.2f)에 도달했습니다.', $bi['monthly_cap']), 402);
        $b['model'] = self::textModelFor(strtolower((string) $job['email']));   // 대본·와이어 등 서버 직접 호출도 글 모델 하나로(OpenRouter)
        $b = self::fitModel($b['model'], $b, $kind === 'script' ? 'script' : 'plan');
        [$status, $raw] = self::send(self::effectiveKey($email), $b, 280);
        $d = json_decode($raw, true);
        if ($status !== 200 || !is_array($d)) Legacy::fail('AI 호출에 실패했습니다 (' . $status . '): ' . mb_substr((string) ($d['error']['message'] ?? $raw), 0, 200), 502);
        $u = $d['usage'] ?? [];
        Db::pdo()->prepare('INSERT INTO deck_ai_usage (email, job_id, kind, model, cost_usd, tokens_in, tokens_out, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())')
            ->execute([$email, (string) $job['id'], $kind, mb_substr((string) $b['model'], 0, 128), (float) ($u['cost'] ?? 0), (int) ($u['prompt_tokens'] ?? 0), (int) ($u['completion_tokens'] ?? 0)]);
        Jobs::addSpend((string) $job['id'], (float) ($u['cost'] ?? 0));
        $d['model'] = $b['model'];
        return $d;
    }

    /**
     * OpenRouter chat/completions 대리 호출 — 기획(글)과 시안 이미지(modalities: image) 모두.
     * 모델을 비우면 kind(plan|image) 에 맞는 설정 모델을 쓴다.
     */
    public static function chat(string $email, array $b): void
    {
        $key = self::effectiveKey($email);
        $kind = ($b['kind'] ?? 'plan') === 'image' ? 'image' : 'plan';
        unset($b['kind']);
        $b['model'] = (string) ($b['model'] ?? '') !== '' ? (string) $b['model'] : ($kind === 'image' ? self::models($email)[$kind] : self::textModelFor($email));
        if (!preg_match('#^[a-z0-9._-]+/[a-z0-9._:-]+$#i', $b['model'])) Legacy::fail('모델 이름이 올바르지 않습니다.');
        $b = self::fitModel($b['model'], $b);
        if (!isset($b['messages']) || !is_array($b['messages'])) Legacy::fail('messages 가 필요합니다.');
        unset($b['stream']); // 대리 호출은 한 번에 받는다
        [$status, $raw] = self::send($key, $b, 300);
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo $raw;
    }

    /* ───────── 내부 ───────── */

    /** 키 방식 — 항상 회사 키(2026-10-05: 모든 설정은 회사 관리자가 한다, 개인 키 없음). key_mode 설정과 개인 키 표는 남아 있지만 쓰지 않는다 */
    private static function mode(): string
    {
        return 'company';
    }

    private static function effectiveKey(string $email): string
    {
        if (self::mode() === 'company') {
            $enc = self::setting('company_key_enc');
            if ($enc === null && (string) Config::get('openrouter.key', '') !== '') return (string) Config::get('openrouter.key');   // 플랫폼 config 폴백
            if ($enc === null) Legacy::fail('OpenRouter 키가 아직 등록되지 않았습니다. 관리자에게 문의해 주세요.', 409);
            return self::dec($enc);
        }
        $row = self::userRow($email);
        if (!$row) Legacy::fail('AI 키 설정에서 본인 OpenRouter 키를 먼저 넣어 주세요.', 409);
        return self::dec($row['key_enc']);
    }

    /** 서버가 스스로 쓰는 회사 OpenRouter 키 — 없으면 null(빠른 판단 Core\Jev 처럼 실패해도 본 기능은 계속되는 곳에서 쓴다) */
    public static function serverKey(): ?string
    {
        $enc = self::setting('company_key_enc');
        if ($enc !== null) {
            try { return self::dec($enc); } catch (\Throwable) { return null; }
        }
        $k = (string) Config::get('openrouter.key', '');
        return $k !== '' ? $k : null;
    }

    /** 사용자 키 행 (모델만 저장된 빈 행은 키 없음으로 본다) */
    private static function userRow(string $email): ?array
    {
        $st = Db::pdo()->prepare('SELECT * FROM deck_ai_user_keys WHERE email = ?');
        $st->execute([strtolower($email)]);
        $r = $st->fetch();
        return $r && $r['key_enc'] !== '' ? $r : null;
    }

    private static function models(string $email): array
    {
        $plan = self::textModelFor($email);
        $image = self::setting('image_model') ?? self::DEFAULT_IMAGE;
        if (self::mode() === 'personal') {
            $st = Db::pdo()->prepare('SELECT plan_model, image_model FROM deck_ai_user_keys WHERE email = ?');
            $st->execute([strtolower($email)]);
            $r = $st->fetch() ?: [];
            $plan = ($r['plan_model'] ?? '') ?: $plan;
            $image = ($r['image_model'] ?? '') ?: $image;
        }
        return ['plan' => $plan, 'image' => $image];
    }

    private static function cleanModels(array $b): array
    {
        $ok = static fn($m) => is_string($m) && preg_match('#^[a-z0-9._-]+/[a-z0-9._:-]+$#i', $m);
        $plan = (string) ($b['plan'] ?? '');
        $image = (string) ($b['image'] ?? '');
        if (!$ok($plan) || !$ok($image)) Legacy::fail('모델 이름이 올바르지 않습니다.');
        return [$plan, $image];
    }

    private static function cleanKey(string $key): string
    {
        $key = trim($key);
        if (!preg_match('/^sk-or-[A-Za-z0-9_-]{10,200}$/', $key)) Legacy::fail('OpenRouter 키는 sk-or- 로 시작합니다. 키 전체를 붙여 넣어 주세요.');
        return $key;
    }

    private static function hint(string $key): string
    {
        return substr($key, 0, 9) . '…' . substr($key, -4);
    }

    /** OpenRouter /key — 키 확인 + 한도·사용액 */
    private static function keyInfo(string $key): array
    {
        [$status, $raw] = self::http('GET', '/key', $key, null, 20);
        $d = json_decode($raw, true);
        if ($status === 401 || $status === 403) Legacy::fail('키가 맞지 않습니다. OpenRouter 에서 복사한 키 전체를 다시 넣어 주세요.');
        if ($status !== 200) Legacy::fail('OpenRouter 확인 실패: ' . ($d['error']['message'] ?? "HTTP $status"), 502);
        $x = $d['data'] ?? [];
        [$s2, $r2] = self::http('GET', '/credits', $key, null, 20);   // 계정 잔액 — 실제로 남은 돈(충전 − 사용)
        $c = $s2 === 200 ? (json_decode($r2, true)['data'] ?? null) : null;
        return [
            'credits' => is_array($c) ? (float) ($c['total_credits'] ?? 0) : null,
            'credits_used' => is_array($c) ? (float) ($c['total_usage'] ?? 0) : null,
            'balance' => is_array($c) ? round((float) ($c['total_credits'] ?? 0) - (float) ($c['total_usage'] ?? 0), 4) : null,
            'label' => $x['label'] ?? null,
            'usage' => isset($x['usage']) ? (float) $x['usage'] : null,
            'limit' => isset($x['limit']) ? (float) $x['limit'] : null,
            'limit_remaining' => isset($x['limit_remaining']) ? (float) $x['limit_remaining'] : null,
        ];
    }

    private static function http(string $method, string $path, string $key, ?array $body, int $timeout): array
    {
        $ch = curl_init(self::OR . $path);
        $headers = ['Authorization: Bearer ' . $key, 'X-Title: powerDeck', 'HTTP-Referer: https://' . ($_SERVER['HTTP_HOST'] ?? 'hom2box.com') . '/powerDeck/'];
        if ($body !== null) $headers[] = 'Content-Type: application/json';
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => $timeout,
        ]);
        if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($raw === false) Legacy::fail('OpenRouter 에 연결하지 못했습니다: ' . $err, 502);
        return [$status, (string) $raw];
    }

    /* 암호화 — config 의 key_secret(64자 hex). 없으면 worker_key 에서 파생 */
    private static function secret(): string
    {
        $s = (string) Legacy::cfg('key_secret', '');
        if ($s !== '') return hash('sha256', $s, true);
        $w = (string) Legacy::cfg('worker_key', Config::get('worker.key', ''));
        if ($w === '') throw new RuntimeException('key_secret 또는 worker_key 가 설정되지 않아 키를 암호화할 수 없습니다.');
        return hash('sha256', 'powerDeck-ai-keys|' . $w, true);
    }

    private static function enc(string $plain): string
    {
        $iv = random_bytes(12);
        $tag = '';
        $ct = openssl_encrypt($plain, 'aes-256-gcm', self::secret(), OPENSSL_RAW_DATA, $iv, $tag);
        return 'v1:' . base64_encode($iv . $tag . $ct);
    }

    private static function dec(string $enc): string
    {
        $raw = base64_decode(substr($enc, 3), true);
        $plain = $raw === false ? false : openssl_decrypt(substr($raw, 28), 'aes-256-gcm', self::secret(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
        if ($plain === false) Legacy::fail('저장된 키를 풀 수 없습니다. 키를 다시 넣어 주세요.', 409);
        return $plain;
    }

    private static function setting(string $k): ?string
    {
        $st = Db::pdo()->prepare('SELECT v FROM deck_ai_settings WHERE k = ?');
        $st->execute([$k]);
        $v = $st->fetchColumn();
        return $v === false || $v === null ? null : (string) $v;
    }

    private static function setSetting(string $k, ?string $v): void
    {
        if ($v === null) { Db::pdo()->prepare('DELETE FROM deck_ai_settings WHERE k = ?')->execute([$k]); return; }
        Db::pdo()->prepare('REPLACE INTO deck_ai_settings (k, v) VALUES (?, ?)')->execute([$k, $v]);
    }
}
