<?php
/**
 * 관리자 · AI 설정 — /api/v1/admin/ai (사용자 지시 2026-10-07: "AI 설정은 따로, 각 솔루션의 AI 를 한 곳에서, Jev 도").
 * 출처: 새로 씀. 역할 검사·응답·감사 기록은 api/routes/admin.php 와 같은 방식.
 *  - GET  /admin/ai      : OpenRouter 연결 상태(키 값은 끝 4자리도 아닌 "있음/없음·출처·끝 4자리"만) + 솔루션별 현재값 + 최근 30일 사용량
 *  - PUT  /admin/ai/jev  : 빠른 판단(Jev) 켜기·하루 상한·사용처별 켜기 → core_settings(ai.jev.*)
 *  - PUT  /admin/ai/provider : Claude API 키 넣기·지우기(있으면 그림 외 글 작업이 Claude, 모델 고정) → Deck\AiKeys::saveProvider
 * powerDeck 모델·키·예산은 여기서 새로 저장하지 않는다 — 화면이 기존 장표 설정(Deck\AiKeys::saveAdmin·saveBudget 경로)을 그대로 끼워 쓴다.
 * 권한: admin 이상, 세션 로그인만. 시크릿 원문은 응답·로그 어디에도 넣지 않는다.
 */
declare(strict_types=1);

use Pp\Core\Actor;
use Pp\Core\Audit;
use Pp\Core\Config;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Jev;
use Pp\Core\Llm;
use Pp\Core\Response;
use Pp\Core\Router;
use Pp\Deck\AiKeys;

return static function (Router $r): void {
    $need = static function (Actor $a): void {
        if ($a->user === null) {
            throw HttpError::unauthorized();
        }
        if ($a->via !== 'session' || !$a->hasRole('admin')) {
            throw HttpError::forbidden();
        }
    };
    $safe = static function (callable $f, mixed $fallback): mixed {
        try {
            return $f();
        } catch (\Throwable) {
            return $fallback;
        }
    };
    /** 사용 기록 종류 → 솔루션·이름 */
    $kindInfo = static function (string $kind): array {
        $deck = ['plan' => '기획(글)', 'image' => '시안(이미지)', 'digest' => '자료 요약', 'script' => '발표 대본', 'wire' => '와이어프레임', 'build' => '장표 제작',
            'engine' => '장표 제작(엔진)', 'eplan' => '기획(엔진)', 'edigest' => '자료 요약(엔진)', 'escript' => '발표 대본(엔진)',
            'ewire' => '와이어프레임(엔진)', 'hf' => 'Higgsfield 그림'];
        if ($kind === 'jev') {
            return ['jev', '빠른 판단'];
        }
        if ($kind === 'chat') {
            return ['chat', 'powerPlus AI 답변'];
        }
        return ['deck', $deck[$kind] ?? $kind];
    };

    $r->get('/admin/ai', function (array $p, Actor $a) use ($need, $safe, $kindInfo): void {
        $need($a);
        $email = (string) ($a->user['email'] ?? '');
        $deck = $safe(static fn () => AiKeys::settings($email, true), []);

        // OpenRouter 연결 — 회사 키(장표 설정에 저장한 것) > 서버 설정 파일. 값은 끝 4자리만
        $hint = (string) ($deck['company']['hint'] ?? '');
        $fromConfig = (string) Config::get('openrouter.key', '') !== '';
        $source = !empty($deck['company']['set']) ? 'company' : ($fromConfig ? 'config' : null);
        $usable = $safe(static fn () => AiKeys::serverKey() !== null, false);
        $last4 = $hint !== '' ? mb_substr($hint, -4) : null;

        // 빠른 판단(Jev) — 사용처별 최근 7일 호출 수(캐시 적중은 세지 않는다 — core_decisions 는 새로 물은 것만 쌓인다)
        $cfg = Jev::config();
        $counts = [];
        foreach ($safe(static fn () => Db::rows('SELECT task, COUNT(*) n, COALESCE(SUM(cost_usd),0) cost FROM core_decisions WHERE created_at >= NOW() - INTERVAL 7 DAY GROUP BY task'), []) as $row) {
            $counts[(string) $row['task']] = ['n' => (int) $row['n'], 'cost' => round((float) $row['cost'], 4)];
        }
        $uses = [];
        foreach (Jev::USES as $k => [$label, $desc]) {
            $uses[] = ['key' => $k, 'label' => $label, 'desc' => $desc, 'on' => (bool) $cfg['uses'][$k],
                'calls_7d' => $counts[$k]['n'] ?? 0, 'cost_7d' => $counts[$k]['cost'] ?? 0.0];
        }
        $spent = $safe(static fn () => Jev::spentToday(), 0.0);

        // 최근 30일 사용량 — 솔루션·종류별
        $usage = [];
        foreach ($safe(static fn () => Db::rows('SELECT kind, COUNT(*) n, COALESCE(SUM(cost_usd),0) cost FROM deck_ai_usage WHERE created_at >= NOW() - INTERVAL 30 DAY GROUP BY kind ORDER BY cost DESC'), []) as $row) {
            [$sol, $label] = $kindInfo((string) $row['kind']);
            $usage[] = ['solution' => $sol, 'kind' => (string) $row['kind'], 'label' => $label, 'calls' => (int) $row['n'], 'cost' => round((float) $row['cost'], 4),
                'billed' => !in_array((string) $row['kind'], ['engine', 'eplan', 'edigest', 'escript', 'ewire', 'hf'], true)];
        }

        $claudeHint = (string) ($deck['claude']['hint'] ?? '');
        Response::json([
            'openrouter' => ['set' => $source !== null, 'usable' => $usable, 'source' => $source, 'last4' => $last4],
            // 글 작업 경로 — Claude 키가 있으면 claude(그림만 OpenRouter, 모델 고정), 없으면 openrouter. 키는 끝 4자리만
            'provider' => [
                'value' => (string) ($deck['text_provider'] ?? 'openrouter'),
                'claude' => ['set' => !empty($deck['claude']['set']), 'usable' => $safe(static fn () => AiKeys::claudeKey() !== null, false),
                    'last4' => $claudeHint !== '' ? mb_substr($claudeHint, -4) : null, 'fixed' => $deck['claude']['fixed'] ?? [],
                    'status' => $deck['claude']['status'] ?? ['state' => 'ok'], 'budget' => $deck['claude']['budget'] ?? null],
            ],
            'solutions' => [
                [
                    'id' => 'deck', 'name' => 'powerDeck', 'desc' => '자료 정리·기획·대본·와이어·시안·장표 제작',
                    'items' => [
                        ['label' => '글 모델', 'value' => (string) ($deck['text_model'] ?? '')],
                        ['label' => '추론 강도', 'value' => (string) ($deck['text_effort'] ?? '')],
                        ['label' => '기획 모델', 'value' => (string) ($deck['admin_models']['plan'] ?? '')],
                        ['label' => '자료 정리 모델', 'value' => (string) (($deck['digest_model'] ?? '') ?: '글 모델과 같음')],
                        ['label' => '시안 그림 모델', 'value' => (string) ($deck['admin_models']['image'] ?? '')],
                        ['label' => '장표 제작 모델', 'value' => (string) ($deck['engine_model'] ?? '')],
                        ['label' => '작업당 한도', 'value' => isset($deck['budget']['default']) ? '$' . $deck['budget']['default'] : '없음'],
                        ['label' => '월 상한', 'value' => isset($deck['budget']['monthly_cap']) ? '$' . $deck['budget']['monthly_cap'] : '없음'],
                        ['label' => '이달 사용', 'value' => '$' . (string) ($deck['budget']['month_spent'] ?? 0)],
                    ],
                ],
                [
                    'id' => 'jev', 'name' => '빠른 판단(Jev)', 'desc' => '고르기만 하는 판단 모델 — 꺼도 각 기능은 원래 규칙으로 돈다',
                    'model' => Jev::MODEL, 'enabled' => (bool) $cfg['enabled'], 'daily_usd' => $cfg['daily_usd'], 'spent_today' => round((float) $spent, 4),
                    'uses' => $uses,
                ],
                [
                    'id' => 'chat', 'name' => 'powerPlus AI(채팅)', 'desc' => '홈 채팅·우측 챗봇이 답을 쓰는 모델 — 꺼지거나 상한을 넘으면 도움말 원문으로 답한다',
                    'model' => Llm::config()['model'], 'default_model' => Llm::DEFAULT_MODEL, 'enabled' => (bool) Llm::config()['enabled'],
                    'daily_usd' => Llm::config()['daily_usd'], 'spent_today' => round((float) $safe(static fn () => Llm::spentToday(), 0.0), 4),
                ],
            ],
            'usage' => $usage,
        ]);
    });

    $r->put('/admin/ai/jev', function (array $p, Actor $a) use ($need): void {
        $need($a);
        $in = Response::input();
        $before = Jev::config();
        $set = static function (string $k, string $v) use ($a): void {
            Db::exec('INSERT INTO core_settings (k, v, is_secret, updated_by) VALUES (?, ?, 0, ?) ON DUPLICATE KEY UPDATE v = VALUES(v), updated_by = VALUES(updated_by)', [$k, $v, $a->id()]);
        };
        if (array_key_exists('enabled', $in)) {
            $set('ai.jev.enabled', !empty($in['enabled']) ? '1' : '0');
        }
        if (array_key_exists('daily_usd', $in)) {
            $d = $in['daily_usd'];
            if (!is_numeric($d) || (float) $d < 0 || (float) $d > 100) {
                throw HttpError::invalid('하루 상한은 0~100 달러로 적어 주세요.');
            }
            $set('ai.jev.daily_usd', (string) round((float) $d, 2));
        }
        if (isset($in['uses']) && is_array($in['uses'])) {
            foreach ($in['uses'] as $k => $on) {
                if (!isset(Jev::USES[(string) $k])) {
                    throw HttpError::invalid('알 수 없는 사용처입니다.');
                }
                $set('ai.jev.use.' . $k, $on ? '1' : '0');
            }
        }
        Jev::forget();
        $after = Jev::config();
        Audit::log($a, 'ai.jev.update', 'settings:ai.jev', $before, $after);
        Response::json($after);
    });

    // Claude API 키 — 있으면 시안 그림 외 글 작업이 Claude(모델 고정), 지우면 OpenRouter 기존 설정(2026-10-17). 확인 뒤 암호화 저장, 감사 기록엔 끝 4자리만
    $r->put('/admin/ai/provider', function (array $p, Actor $a) use ($need): void {
        $need($a);
        $in = Response::input();
        $before = ['provider' => AiKeys::textProvider()];
        $out = AiKeys::saveProvider($in);
        $after = ['provider' => $out['provider'],
            'claude_key' => trim((string) ($in['claude_key'] ?? '')) !== '' ? '…' . mb_substr((string) $out['claude_hint'], -4) . ' 새로 넣음' : (!empty($in['remove_claude_key']) ? '지움' : '그대로')];
        Audit::log($a, 'ai.provider.update', 'settings:ai.provider', $before, $after);
        Response::json(['provider' => $out['provider']]);
    });

    // powerPlus AI(채팅) — 켜기·모델(OpenRouter id, 비우면 기본)·하루 상한 → core_settings(ai.chat.*)
    $r->put('/admin/ai/chat', function (array $p, Actor $a) use ($need): void {
        $need($a);
        $in = Response::input();
        $before = Llm::config();
        $set = static function (string $k, string $v) use ($a): void {
            Db::exec('INSERT INTO core_settings (k, v, is_secret, updated_by) VALUES (?, ?, 0, ?) ON DUPLICATE KEY UPDATE v = VALUES(v), updated_by = VALUES(updated_by)', [$k, $v, $a->id()]);
        };
        if (array_key_exists('enabled', $in)) {
            $set('ai.chat.enabled', !empty($in['enabled']) ? '1' : '0');
        }
        if (array_key_exists('model', $in)) {
            $m = trim((string) $in['model']);
            if ($m !== '' && !preg_match('#^[a-z0-9._-]+/[a-z0-9._:-]+$#i', $m)) {
                throw HttpError::invalid('모델은 OpenRouter 이름(예: anthropic/claude-haiku-4.5)으로 적어 주세요.');
            }
            $set('ai.chat.model', $m);
        }
        if (array_key_exists('daily_usd', $in)) {
            $d = $in['daily_usd'];
            if (!is_numeric($d) || (float) $d < 0 || (float) $d > 100) {
                throw HttpError::invalid('하루 상한은 0~100 달러로 적어 주세요.');
            }
            $set('ai.chat.daily_usd', (string) round((float) $d, 2));
        }
        Llm::forget();
        $after = Llm::config();
        Audit::log($a, 'ai.chat.update', 'settings:ai.chat', $before, $after);
        Response::json($after);
    });
};
