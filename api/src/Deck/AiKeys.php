<?php
declare(strict_types=1);

namespace Pp\Deck;

use Pp\Core\Claude;
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
        $out['text_provider'] = self::textProvider();
        $out['claude'] = ['set' => self::claudeKeys() !== [], 'fixed' => Claude::FIXED, 'status' => self::claudeStatus()];
        if ($admin) {
            try { $out['claude']['budget'] = self::claudeBudget(); } catch (Throwable) { $out['claude']['budget'] = null; }
        }
        if ($admin) {
            $out['claude']['keys'] = self::claudeKeyList();
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

    /**
     * 글 작업이 가는 곳 — Claude API 키가 있으면 claude(시안 그림만 OpenRouter, 나머지 글 작업은 Claude API 직접), 없으면 openrouter(기존 설정 그대로).
     * 2026-10-17 사용자 지시: "Claude API 키 값이 있으면 이것 먼저, 없으면 오픈라우터 기존 설정대로 — 탭으로 조정할 필요 없이". 빠른 판단(Jev)은 늘 OpenRouter.
     */
    public static function textProvider(): string
    {
        return self::claudeKeys() ? 'claude' : 'openrouter';
    }

    /** 크레딧 소진·키 거절 뒤 그 키를 건너뛰는 시간(초) — 지나면 그 키로 다시 한 번 시도한다(충전되면 저절로 돌아오게) */
    private const CLAUDE_SKIP = 1800;

    /**
     * Claude 키 목록 — [{id, enc, hint, added, status?}], 개수 제한 없음(2026-10-18 사용자 "키 여러 개, 소진되면 다음 키로, 다 쓰면 OpenRouter").
     * 계정이 다른 키들이라 키마다 막힘(status)을 따로 둔다. 예전 키 하나(claude_key_enc·claude_status)는 첫 번째 키로 옮긴다.
     */
    private static function claudeKeys(): array
    {
        $list = json_decode((string) (self::setting('claude_keys') ?? ''), true);
        $list = is_array($list) ? array_values(array_filter($list, static fn ($k) => is_array($k) && !empty($k['enc']) && !empty($k['id']))) : [];
        $old = self::setting('claude_key_enc');
        if ($old !== null) {
            $st = json_decode((string) (self::setting('claude_status') ?? ''), true);
            // 동시에 들어온 요청이 이미 옮겼으면 다시 넣지 않는다(같은 암호문)
            if (!in_array($old, array_column($list, 'enc'), true)) array_unshift($list,['id' => bin2hex(random_bytes(4)), 'enc' => $old, 'hint' => (string) (self::setting('claude_key_hint') ?? ''),
                'added' => date('Y-m-d H:i:s'), 'status' => is_array($st) && in_array($st['state'] ?? '', ['no_credits', 'bad_key'], true) ? $st : null]);
            self::setSetting('claude_keys', json_encode($list, JSON_UNESCAPED_UNICODE));
            foreach (['claude_key_enc', 'claude_key_hint', 'claude_status'] as $k) self::setSetting($k, null);
        }
        return $list;
    }

    private static function saveClaudeKeys(array $list): void
    {
        self::setSetting('claude_keys', $list ? json_encode(array_values($list), JSON_UNESCAPED_UNICODE) : null);
    }

    /** 키 하나의 막힘 표시를 바꾼다 — 그 사이 다른 요청이 목록을 바꿨을 수 있어 다시 읽고 id 로 찾는다 */
    private static function setClaudeKeyStatus(string $id, ?array $status): void
    {
        $list = self::claudeKeys();
        foreach ($list as &$k) {
            if ($k['id'] !== $id) continue;
            $k['status'] = $status;
            // 크레딧 소진 이력 — 충전 뒤 다시 쓰여도 지우지 않는다. 그 기간에 이 서버에서 얼마를 쓰고 떨어졌는지 같이 남긴다
            if (($status['state'] ?? '') === 'no_credits') $k['exhausted'] = ['at' => $status['at'], 'spent' => self::claudeKeySpend($id)[0]];
        }
        unset($k);
        self::saveClaudeKeys($list);
    }

    /** 지금 막혀 있는 키인가 — 잔액 부족·키 거절 뒤 30분 동안 */
    private static function claudeKeyBlocked(array $k): bool
    {
        $st = $k['status'] ?? null;
        return is_array($st) && time() - (int) ($st['ts'] ?? 0) < self::CLAUDE_SKIP;
    }

    /**
     * Claude 로 한 번 부른다 — [상태, OpenAI 꼴 JSON]. 키를 넣은 순서대로 막히지 않은 키를 쓰고, 이번 호출이 잔액 부족·키 거절이면
     * 그 키를 30분 막고 다음 키로 바로 다시 부른다. 모든 키가 막히면 null(부른 쪽이 OpenRouter 기존 설정으로 간다 — 2026-10-17 "크레딧 떨어지면 자동으로 OpenRouter").
     * 그 밖의 오류(요청 잘못·과부하)는 그대로 돌려준다 — 다른 키·OpenRouter 로 넘겨도 같은 요청이라 소용없고 비용만 겹친다.
     */
    public static function claudeCall(string $model, array $b, int $timeout, string $effort): ?array
    {
        unset($b['_answer_tokens']);
        foreach (self::claudeKeys() as $k) {
            if (self::claudeKeyBlocked($k)) continue;
            try { $key = self::dec((string) $k['enc']); } catch (Throwable) { continue; }
            [$status, $raw] = Claude::chat($key, $model, $b, $timeout, $effort);
            if ($status === 200) {
                if (!empty($k['status'])) self::setClaudeKeyStatus($k['id'], null);   // 충전 뒤 첫 성공 — 표시를 지운다(소진 이력 exhausted 는 남는다)
                self::addClaudeKeySpend((string) $k['id'], (float) (json_decode($raw, true)['usage']['cost'] ?? 0));
                return [$status, $raw];
            }
            $msg = (string) (json_decode($raw, true)['error']['message'] ?? '');
            $state = $status === 401 || $status === 403 ? 'bad_key'
                : (preg_match('/credit balance|purchase credits|billing|insufficient.*(credit|fund)/i', $msg) ? 'no_credits' : null);
            if ($state === null) return [$status, $raw];
            error_log('[claude] 키 …' . substr((string) $k['hint'], -4) . ' ' . $state . ' — 다음 키로: ' . mb_substr($msg, 0, 200));
            self::setClaudeKeyStatus($k['id'], ['state' => $state, 'message' => mb_substr($msg, 0, 300), 'at' => date('Y-m-d H:i:s'), 'ts' => time()]);
        }
        return null;
    }

    /**
     * Claude 전체 상태 — 막히지 않은 키가 하나라도 있으면 ok. 전부 막혔으면 no_credits(하나라도 잔액 부족이면)·bad_key 와
     * 가장 먼저 다시 시도하는 키의 막힌 시각(at·ts) — 화면에 "언제부터 OpenRouter 로 도는지" 보인다.
     */
    public static function claudeStatus(): array
    {
        $keys = self::claudeKeys();
        $blocked = array_filter($keys, [self::class, 'claudeKeyBlocked']);
        if (!$keys || count($blocked) < count($keys)) return ['state' => 'ok'];
        usort($blocked, static fn ($a, $b) => (int) $a['status']['ts'] <=> (int) $b['status']['ts']);
        $states = array_map(static fn ($k) => $k['status']['state'], $blocked);
        return ['state' => in_array('no_credits', $states, true) ? 'no_credits' : 'bad_key'] + $blocked[0]['status'];
    }

    /** 관리자 화면용 키 목록 — 원문·암호문 없이 앞뒤 몇 글자와 상태만 */
    private static function claudeKeyList(): array
    {
        return array_map(static function (array $k): array {
            $blocked = self::claudeKeyBlocked($k);
            [$spent, $calls] = self::claudeKeySpend((string) $k['id']);
            return ['id' => $k['id'], 'hint' => (string) $k['hint'], 'added' => (string) ($k['added'] ?? ''),
                'state' => $blocked ? (string) $k['status']['state'] : 'ok', 'at' => $blocked ? (string) ($k['status']['at'] ?? '') : null,
                'spent' => $spent, 'calls' => $calls, 'last_used' => self::setting('cku:' . $k['id']),
                'exhausted' => is_array($k['exhausted'] ?? null) ? $k['exhausted'] : null];
        }, self::claudeKeys());
    }

    /** 이번 기간 시작일 — 관리자가 적은 갱신일(매월 N일, 기본 1일, 짧은 달이면 말일). [시작일, N] */
    private static function claudeSince(): array
    {
        $day = max(1, min(31, (int) (self::setting('claude_reset_day') ?? 1)));
        $now = new \DateTimeImmutable('today');
        $at = static function (\DateTimeImmutable $m) use ($day): \DateTimeImmutable {
            return $m->setDate((int) $m->format('Y'), (int) $m->format('n'), min($day, (int) $m->format('t')));
        };
        $since = $at($now->modify('first day of this month'));
        if ($since > $now) $since = $at($now->modify('first day of last month'));
        return [$since, $day];
    }

    /**
     * 키별 사용 기록 — 성공한 호출마다 그 키의 이번 기간 비용·호출 수를 더한다(2026-10-18 사용자 "각각 소진 내역이 다 남아야").
     * deck_ai_usage 는 어느 키로 불렀는지 모르므로 따로 센다. 기간마다 줄이 따로라 갱신일이 지나면 저절로 0 부터, 지난 기간 기록은 남는다.
     * 더하기는 SQL 한 줄(v = v + ?)이라 동시에 불러도 빠지지 않는다. 설정 키(64자): ckc|ckn:<키 id 8자>:<YYYY-MM-DD>
     */
    private static function addClaudeKeySpend(string $id, float $cost): void
    {
        try {
            $p = ':' . $id . ':' . self::claudeSince()[0]->format('Y-m-d');
            $add = Db::pdo()->prepare('INSERT INTO deck_ai_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = CAST(v AS DECIMAL(14,6)) + VALUES(v)');
            $add->execute(['ckc' . $p, (string) round($cost, 6)]);
            $add->execute(['ckn' . $p, '1']);
            self::setSetting('cku:' . $id, date('Y-m-d H:i:s'));   // 마지막으로 쓴 때
        } catch (Throwable $e) {
            error_log('[claude] 키별 사용 기록 실패: ' . $e->getMessage());   // 기록 실패로 답을 버리지 않는다
        }
    }

    /** 키 하나의 이번 기간 사용 [비용, 호출 수] */
    private static function claudeKeySpend(string $id): array
    {
        $p = ':' . $id . ':' . self::claudeSince()[0]->format('Y-m-d');
        return [round((float) (self::setting('ckc' . $p) ?? 0), 4), (int) (self::setting('ckn' . $p) ?? 0)];
    }

    /**
     * 이번 기간 Claude 사용 — 관리자가 적은 월 크레딧(기본 $200)·갱신일(매월 N일, 기본 1일)로 기간을 잡고,
     * 사용 기록 중 모델이 claude- 로 시작하는 것(이 서버가 Claude API 로 직접 부른 것)의 비용을 더한다.
     * 잔액을 알려 주는 API 가 Claude 에 없어서 "추정" — 같은 키를 다른 곳에서 쓴 만큼은 빠지지 않는다. 정확한 값은 콘솔 결제 화면.
     */
    public static function claudeBudget(): array
    {
        // 월 크레딧은 키 하나당 값 — 키마다 계정이 달라 전체는 키 개수만큼 곱한다(갱신일은 하나로 본다)
        $perKey = (float) (self::setting('claude_credit_usd') ?? 200);
        $n = max(1, count(self::claudeKeys()));
        $credit = $perKey * $n;
        [$since, $day] = self::claudeSince();
        // 엔진 PC 의 Claude 구독(Claude Code) 사용분(engine·e*)도 모델이 claude- 로 남는다 — 구독 종류는 빼야 API 크레딧만 센다(2026-10-17 시험에서 $106 이 섞여 나왔다)
        $w = "model LIKE 'claude-%' AND kind NOT IN " . self::SUBS_SQL . " AND created_at >= ?";
        $spent = (float) Db::val("SELECT COALESCE(SUM(cost_usd), 0) FROM deck_ai_usage WHERE $w", [$since->format('Y-m-d')]);
        $calls = (int) Db::val("SELECT COUNT(*) FROM deck_ai_usage WHERE $w", [$since->format('Y-m-d')]);
        return ['credit' => round($credit, 2), 'per_key' => round($perKey, 2), 'keys' => $n, 'reset_day' => $day, 'since' => $since->format('Y-m-d'),
            'spent' => round($spent, 4), 'left' => round(max(0.0, $credit - $spent), 4), 'calls' => $calls];
    }

    /** 서버가 쓸 수 있는 Claude API 키 하나(풀 수 있는 첫 키) — 하나도 없으면 null. 화면의 "키를 풀 수 없음" 판정용 */
    public static function claudeKey(): ?string
    {
        foreach (self::claudeKeys() as $k) {
            try { return self::dec((string) $k['enc']); } catch (Throwable) {}
        }
        return null;
    }

    /** 관리자 — Claude 키 더하기(+)·빼기(−)·월 크레딧. 키가 하나라도 있으면 글 작업이 Claude 로(모델은 Claude::forKind 고정) */
    public static function saveProvider(array $b): array
    {
        $added = null;
        $key = (string) preg_replace('/\s+/', '', (string) ($b['claude_key'] ?? ''));   // 붙여 넣다 섞인 줄바꿈·공백
        if ($key !== '') {
            // 꼴은 앞머리만 본다 — 진짜 확인은 아래 Claude::verify(모델 목록 호출)
            if (str_starts_with($key, 'sk-ant-admin')) Legacy::fail('관리자 키(sk-ant-admin)는 쓸 수 없습니다. 일반 API 키를 넣어 주세요.');
            if (!preg_match('/^sk-ant-[A-Za-z0-9_-]{20,300}$/', $key)) Legacy::fail('Claude API 키는 sk-ant- 로 시작합니다. 키 전체를 붙여 넣어 주세요.');
            $list = self::claudeKeys();
            foreach ($list as $k) {
                try { $same = self::dec((string) $k['enc']) === $key; } catch (Throwable) { $same = false; }
                if ($same) Legacy::fail('이미 넣은 키입니다 (…' . substr($key, -4) . ').');
            }
            Claude::verify($key);
            $added = substr($key, 0, 10) . '…' . substr($key, -4);
            $list[] = ['id' => bin2hex(random_bytes(4)), 'enc' => self::enc($key), 'hint' => $added, 'added' => date('Y-m-d H:i:s'), 'status' => null];
            self::saveClaudeKeys($list);
        }
        $rid = (string) ($b['remove_claude_key_id'] ?? '');
        if ($rid !== '') {   // 키 하나 빼기 — 마지막 키를 빼면 OpenRouter 기존 설정으로 돌아간다
            $list = self::claudeKeys();
            $left = array_values(array_filter($list, static fn ($k) => $k['id'] !== $rid));
            if (count($left) === count($list)) Legacy::fail('지울 키를 찾지 못했습니다. 화면을 새로 고쳐 주세요.', 404);
            self::saveClaudeKeys($left);
            if (preg_match('/^[0-9a-f]{8}$/', $rid)) {   // 그 키의 사용 기록 줄도 같이 — 다른 키의 줄은 id 가 달라 걸리지 않는다
                Db::pdo()->prepare("DELETE FROM deck_ai_settings WHERE k = ? OR k LIKE ? OR k LIKE ?")->execute(['cku:' . $rid, 'ckc:' . $rid . ':%', 'ckn:' . $rid . ':%']);
            }
        }
        if (array_key_exists('claude_credit_usd', $b)) {
            $c = $b['claude_credit_usd'];
            if (!is_numeric($c) || (float) $c < 0 || (float) $c > 100000) Legacy::fail('월 크레딧은 0~100,000 달러로 적어 주세요.');
            self::setSetting('claude_credit_usd', (string) round((float) $c, 2));
        }
        if (array_key_exists('claude_reset_day', $b)) {
            $d = $b['claude_reset_day'];
            if (!is_numeric($d) || (int) $d < 1 || (int) $d > 31) Legacy::fail('갱신일은 1~31 사이 날짜로 적어 주세요.');
            self::setSetting('claude_reset_day', (string) (int) $d);
        }
        if (!empty($b['remove_claude_key'])) self::saveClaudeKeys([]);   // 전부 지우기(예전 화면 호환) — 바로 OpenRouter 기존 설정으로
        return ['ok' => true, 'provider' => self::textProvider(), 'claude_hint' => $added, 'claude_count' => count(self::claudeKeys())];
    }

    /**
     * 글 호출 하나 — 경로가 claude 면 Claude API, 아니면 OpenRouter. [상태, OpenAI 꼴 JSON, 실제로 쓴 모델].
     * Claude 쪽 추론 강도: 엔진이 정한 값(reasoning.effort)이 있으면 그것, 없으면 작업 종류별 추천(자료 정리 low · 기획 high · 나머지 medium).
     */
    private static function sendText(string $email, array $b, int $timeout, string $kind): array
    {
        if (self::textProvider() === 'claude') {
            $model = Claude::forKind($kind);   // 고르지 않는다 — 장표 제작 Opus 5.5, 나머지 Sonnet 5.5 고정
            $effort = (string) ($b['reasoning']['effort'] ?? '') ?: match ($kind) { 'digest', 'check' => 'low', 'plan' => 'high', default => 'medium' };
            $r = self::claudeCall($model, $b, $timeout, $effort);
            if ($r !== null) return [$r[0], $r[1], $model];
            // 키를 풀 수 없음·크레딧 소진·키 거절 — 아래 OpenRouter 기존 설정으로 이어서(작업이 멈추지 않게)
        }
        $b = self::fitModel((string) $b['model'], $b, $kind);
        [$status, $raw] = self::send(self::effectiveKey($email), $b, $timeout);
        return [$status, $raw, (string) $b['model']];
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
            'digest', 'check' => 'low',
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

    /** 구독 사용분 종류(engine·e* = Claude 구독, hf = Higgsfield 크레딧) — 월 상한 판정에서만 뺀다. 과금 화면 합계에는 들어간다 */
    private const SUBS_SQL = "('engine','eplan','edigest','escript','ewire','hf')";

    /** 관리자 — 과금 내역: 기간 합계, 사용자별·모델별 합계, 호출 한 건씩(최근 500건). 구독 사용분(engine·e*·hf)도 실제 비용으로 합친다(사용자 2026-10-16) */
    public static function adminUsage(int $days): array
    {
        $days = max(1, min(365, $days));
        $pdo = Db::pdo();
        $since = "created_at >= (NOW() - INTERVAL $days DAY)";
        $real = $since;
        $sum = "SELECT COUNT(*) n, COALESCE(SUM(cost_usd),0) cost, COALESCE(SUM(tokens_in),0) tin, COALESCE(SUM(tokens_out),0) tout FROM deck_ai_usage WHERE ";
        $tot = $pdo->query($sum . $real)->fetch();
        $month = (float) $pdo->query("SELECT COALESCE(SUM(cost_usd),0) FROM deck_ai_usage WHERE created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')")->fetchColumn();
        $f = static fn($r) => ['cost' => round((float) $r['cost'], 4), 'n' => (int) $r['n']] + $r;
        return [
            'days' => $days,
            'total' => ['n' => (int) $tot['n'], 'cost' => round((float) $tot['cost'], 4), 'tokens_in' => (int) $tot['tin'], 'tokens_out' => (int) $tot['tout']],
            'month_cost' => round($month, 4),
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
        if (array_key_exists('default_budget_usd', $b)) {
            $new = $num($b['default_budget_usd']);
            self::setSetting('job_budget_usd', $new);
            // 한도는 작업을 만들 때 작업마다 복사된다 — 전역값만 올리면 한도에 걸려 멈춘 작업은 그대로 $2 라 "다시 돌리기"도 또 멈췄다
            // (2026-10-18 사용자 "변경했는데도 이러네?", R75). 올리거나 없앨 때 아직 안 끝난 작업(완료·취소 제외)의 낮은 한도도 같이 올린다. 내리는 것은 새 작업부터.
            $pdo = Db::pdo();
            if ($new === null) {
                $pdo->exec("UPDATE deck_jobs SET budget_usd = NULL WHERE budget_usd IS NOT NULL AND status NOT IN ('done','canceled')");
            } else {
                $pdo->prepare("UPDATE deck_jobs SET budget_usd = ? WHERE budget_usd IS NOT NULL AND budget_usd < ? AND status NOT IN ('done','canceled')")->execute([$new, $new]);
            }
        }
        if (array_key_exists('monthly_cap_usd', $b)) self::setSetting('monthly_cap_usd', $num($b['monthly_cap_usd']));
        return ['ok' => true];
    }

    /** 한도 판정에 들어가는 사용 종류의 이름 — 오류 글에서 "어느 단계가 한도를 썼는지" 보이게 */
    private const KIND_LABEL = ['plan' => '기획·와이어', 'digest' => '자료 요약', 'image' => '시안 그림', 'check' => '시안 판정', 'build' => '장표 제작', 'script' => '발표 대본'];

    /**
     * 작업당 한도에 닿았을 때의 글 — 얼마를 어느 단계가 썼는지 + 어디서 무엇을 올리면 되는지(2026-10-18 전수조사 C).
     * 한도는 작업 하나에 기획·시안·장표 제작·대본을 합친 금액이라, 장표 단계 시작 전에 이미 한도 근처일 수 있다 — 그 사실을 글로 알린다.
     * $byKind = [kind => usd]. DB 없이 시험할 수 있게 순수 함수로 둔다.
     */
    public static function budgetStopMessage(float $budget, float $spent, array $byKind, float $base = 0.0): string
    {
        $parts = [];
        foreach ($byKind as $k => $usd) {
            if ((float) $usd <= 0 || $k === 'script') continue;   // 대본·예상 질문은 작업 한도 밖(2026-10-18 사용자 결정)
            $parts[] = (self::KIND_LABEL[$k] ?? (string) $k) . sprintf(' $%.2f', (float) $usd);
        }
        // 한도는 시안 확정 때 다시 채운다(0043 budget_base_usd) — 확정 전에 멈췄는지 뒤에 멈췄는지에 따라 할 말이 다르다
        $stage = $base > 0
            ? sprintf('시안 확정 때 한도를 다시 채웠고, 확정 전 사용 $%.2f 은 빼고 셉니다. ', $base)
            : '시안을 확정하면 장표 제작용으로 한도가 다시 채워집니다. ';
        return sprintf('이 작업의 비용 한도($%.2f)에 도달했습니다 (한도에 드는 사용 $%.4f). ', $budget, $spent)
            . ($parts ? '작업 전체 내역: ' . implode(' · ', $parts) . '. ' : '')
            . $stage
            . '발표 대본·예상 질문은 작업 한도에 들지 않습니다(월 상한만 봅니다). '
            . '관리자 › AI 설정 › 비용 한도(작업당)를 올리면 이 작업에도 적용되고, 다시 돌리면 멈춘 단계부터 다시 합니다.';
    }

    /** 작업 한도에 드는 사용액 = spent_usd − 기준선(budget_base_usd, 0043). 기준선은 시안 확정 때 다시 잡고, 대본·예상 질문 비용만큼 올린다 */
    public static function countedSpend(array $job): float
    {
        return max(0.0, (float) ($job['spent_usd'] ?? 0) - (float) ($job['budget_base_usd'] ?? 0));
    }

    /** 엔진에게 줄 한도 — 엔진은 누계(spent_usd)와 견주므로 기준선을 더한 값. 한도 없음이면 null */
    public static function engineCap(array $job): ?float
    {
        if (($job['budget_usd'] ?? null) === null) return null;
        return round((float) $job['budget_usd'] + (float) ($job['budget_base_usd'] ?? 0), 4);
    }

    /** 월 상한에 닿았을 때의 글 — 어디서 올리는지, 언제 풀리는지 */
    public static function monthlyStopMessage(float $cap, float $spent): string
    {
        return sprintf('이달 AI 비용 상한($%.2f)에 도달했습니다 (사용 $%.4f). ', $cap, $spent)
            . '관리자 › AI 설정 › 비용 한도(사용자별 월 상한)를 올리거나, 다음 달 1일에 풀립니다.';
    }

    /**
     * 작업 한도·월 상한 확인 — chatForJob(엔진 대리 호출)과 ask(서버 직접 호출)가 같은 판정·같은 글을 쓰게.
     * $jobCap=false = 작업 한도는 보지 않고 월 상한만(발표 대본·예상 질문, 2026-10-18 사용자 결정 "대본 제외").
     */
    private static function budgetGuard(array $job, string $email, bool $jobCap = true): void
    {
        $budget = $job['budget_usd'] !== null ? (float) $job['budget_usd'] : null;
        $spent = self::countedSpend($job);   // 시안 확정 때 다시 잡은 기준선 이후(0043)
        if ($jobCap && $budget !== null && $spent >= $budget) {
            $by = [];
            try {
                $st = Db::pdo()->prepare("SELECT kind, COALESCE(SUM(cost_usd),0) usd FROM deck_ai_usage WHERE job_id = ? AND kind NOT IN " . self::SUBS_SQL . " AND kind <> 'script' GROUP BY kind ORDER BY MIN(id)");
                $st->execute([(string) $job['id']]);
                foreach ($st->fetchAll() as $r) $by[(string) $r['kind']] = (float) $r['usd'];
            } catch (Throwable) {}   // 내역을 못 읽어도 멈추는 판정은 그대로
            Legacy::fail(self::budgetStopMessage($budget, $spent, $by, (float) ($job['budget_base_usd'] ?? 0)), 402);
        }
        $bi = self::budgetInfo($email);
        if ($bi['monthly_cap'] !== null && $bi['month_spent'] >= $bi['monthly_cap']) Legacy::fail(self::monthlyStopMessage($bi['monthly_cap'], $bi['month_spent']), 402);
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
        $budget = self::engineCap($job);   // 엔진은 누계와 견준다 — 기준선(시안 확정 때 다시 채움)을 더한 한도를 준다(0043)
        self::budgetGuard($job, $email);   // 한도 글에 단계별 사용액·올리는 곳(전수조사 C, 2026-10-18)

        // check = 시안이 와이어를 따랐는지 보는 판정(와이어 스케치 + 시안 두 그림을 함께 보는 글 모델, 2026-10-18) — 사용 기록에서 따로 보이게
        $kind = in_array($b['kind'] ?? '', ['image', 'digest', 'build', 'check'], true) ? $b['kind'] : 'plan';
        unset($b['kind']);
        // 엔진이 정한 기다릴 시간(선택 단계는 짧게) — 60~300초, 없으면 300(2026-10-07 속도 점검)
        $wait = isset($b['_timeout']) ? max(60, min(300, (int) $b['_timeout'])) : 300;
        unset($b['_timeout']);
        // 글(기획·요약·제작 에이전트)은 이미지 외 전부 글 모델(muse-spark xhigh 기본, 본인·회사가 고른 글 모델이 있으면 그것)로 — 이미지는 전용 모델 그대로. build는 워커가 명시한 모델 우선.
        $b['model'] = (string) ($b['model'] ?? '') !== '' ? (string) $b['model']
            : ($kind === 'image' ? self::models($email)['image']   // 그림은 관리자가 정해 둔 이미지 모델 고정(예전엔 여기서 글 모델이 들어갔다)
            : ($kind === 'digest' ? (self::setting('digest_model') ?: self::textModelFor($email))
            : ($kind === 'check' ? (self::setting('check_model') ?: self::textModelFor($email)) : self::textModelFor($email))));   // 판정 모델은 그림을 볼 수 있어야 한다 — 따로 정하지 않으면 글 모델(못 보면 엔진이 판정을 건너뛴다)
        if (!preg_match('#^[a-z0-9._-]+/[a-z0-9._:-]+$#i', $b['model'])) Legacy::fail('모델 이름이 올바르지 않습니다.');
        unset($b['stream']);
        // 그림(시안)은 늘 OpenRouter 전용 이미지 API(/images: prompt·aspect_ratio·quality·input_references → data[].b64_json),
        // 글(기획·요약·제작)은 관리자가 고른 경로(OpenRouter chat/completions 또는 Claude API) — 답은 어느 쪽이든 OpenAI 꼴
        if ($kind === 'image') {
            if (trim((string) ($b['prompt'] ?? '')) === '') Legacy::fail('prompt 가 필요합니다.');
            [$status, $raw] = self::http('POST', '/images', self::effectiveKey($email), $b, 300);
        } else {
            if (!isset($b['messages']) || !is_array($b['messages'])) Legacy::fail('messages 가 필요합니다.');
            [$status, $raw, $b['model']] = self::sendText($email, $b, $wait, $kind);
        }
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

    /** 엔진이 글 작업 하나를 가져간다(원자적으로) — 글을 엔진 구독(CLI)으로 넘기던 길(viaEngine)은 2026-10-05 에 닫혀 2026-10-17 에 지웠다. 엔진 폴링 호환으로 남긴다 */
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
        // 대본·예상 질문은 완성된 작업에서 부른다 — 예전 글은 '한도에 도달했습니다'뿐이라 무엇을 올릴지 몰랐다(전수조사 C)
        // 대본·예상 질문(script)은 작업 한도에서 뺀다 — 월 상한만 본다(2026-10-18 사용자 결정). 와이어(plan)는 작업 한도 그대로
        $side = $kind === 'script';
        self::budgetGuard($job, $email, !$side);
        $b['model'] = self::textModelFor(strtolower((string) $job['email']));   // 대본·와이어 등 서버 직접 호출도 글 모델 하나로(관리자가 고른 경로)
        [$status, $raw, $b['model']] = self::sendText($email, $b, 280, $kind === 'script' ? 'script' : 'plan');
        $d = json_decode($raw, true);
        if ($status !== 200 || !is_array($d)) Legacy::fail('AI 호출에 실패했습니다 (' . $status . '): ' . mb_substr((string) ($d['error']['message'] ?? $raw), 0, 200), 502);
        $u = $d['usage'] ?? [];
        Db::pdo()->prepare('INSERT INTO deck_ai_usage (email, job_id, kind, model, cost_usd, tokens_in, tokens_out, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())')
            ->execute([$email, (string) $job['id'], $kind, mb_substr((string) $b['model'], 0, 128), (float) ($u['cost'] ?? 0), (int) ($u['prompt_tokens'] ?? 0), (int) ($u['completion_tokens'] ?? 0)]);
        Jobs::addSpend((string) $job['id'], (float) ($u['cost'] ?? 0));
        // 사용액(spent_usd)·사용 기록은 그대로 남기고, 기준선을 같은 만큼 올려 작업 한도 판정에서만 뺀다(0043)
        if ($side && (float) ($u['cost'] ?? 0) > 0) {
            Db::pdo()->prepare('UPDATE deck_jobs SET budget_base_usd = budget_base_usd + ? WHERE id = ?')->execute([(float) $u['cost'], (string) $job['id']]);
        }
        $d['model'] = $b['model'];
        return $d;
    }

    /**
     * OpenRouter chat/completions 대리 호출 — 기획(글)과 시안 이미지(modalities: image) 모두.
     * 모델을 비우면 kind(plan|image) 에 맞는 설정 모델을 쓴다.
     */
    public static function chat(string $email, array $b): void
    {
        $kind = ($b['kind'] ?? 'plan') === 'image' ? 'image' : 'plan';
        unset($b['kind']);
        $b['model'] = (string) ($b['model'] ?? '') !== '' ? (string) $b['model'] : ($kind === 'image' ? self::models($email)[$kind] : self::textModelFor($email));
        if (!preg_match('#^[a-z0-9._-]+/[a-z0-9._:-]+$#i', $b['model'])) Legacy::fail('모델 이름이 올바르지 않습니다.');
        if (!isset($b['messages']) || !is_array($b['messages'])) Legacy::fail('messages 가 필요합니다.');
        unset($b['stream']); // 대리 호출은 한 번에 받는다
        // 그림(modalities: image)은 OpenRouter, 글은 관리자가 고른 경로
        [$status, $raw] = $kind === 'image' ? self::send(self::effectiveKey($email), self::fitModel($b['model'], $b), 300) : array_slice(self::sendText($email, $b, 300, 'plan'), 0, 2);
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
        $err = curl_error($ch);   // curl_close 는 PHP 8 부터 하는 일이 없고 8.5 에서 사용 중단 — 핸들은 범위를 벗어나면 닫힌다
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
