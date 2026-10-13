<?php
/**
 * 도우미(우측 하단 AI 봇)·powerMCP 요청 판정 — 판단 모델 Jev 는 글을 쓰지 않고 고르기만 한다.
 *  - /assist/ask   : 질문 → 도움말 문서(core_help_docs) 중 맞는 것 하나를 고르고 그 문서를 그대로 보여 준다. 맞는 게 없으면 문의로.
 *  - /assist/scope : powerMCP·도우미가 같이 쓰는 "이 요청을 플랫폼으로 할 수 있나" 판정(Triage::CAPABILITIES).
 * 답변 문장은 사람이 쓴 도움말 그대로라 지어낸 답이 나오지 않는다. 같은 질문은 core_decisions 에서 꺼낸다.
 */
declare(strict_types=1);

use Pp\Core\Actor;
use Pp\Core\Assist;
use Pp\Core\Audit;
use Pp\Core\Config;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Jev;
use Pp\Core\Response;
use Pp\Core\Router;
use Pp\Core\Triage;

return static function (Router $r): void {
    /** 같은 IP(마지막 자리 지움) 한 시간 60번 */
    $limit = static function (): void {
        $ref = 'assist:' . substr(sha1(Audit::ip()), 0, 16);
        $n = (int) Db::val('SELECT COUNT(*) FROM core_decisions WHERE ref = ? AND created_at > NOW(3) - INTERVAL 1 HOUR', [$ref]);
        if ($n >= 60) {
            throw HttpError::tooMany('잠시 뒤에 다시 물어봐 주세요.');
        }
    };

    $capLinks = Assist::CAP_LINKS;

    $r->post('/assist/ask', function (array $p, Actor $a) use ($limit, $capLinks): void {
        $q = trim((string) (Response::input()['q'] ?? ''));
        if (mb_strlen($q) < 2 || mb_strlen($q) > 500) {
            throw HttpError::invalid('질문을 2~500자로 적어 주세요.');
        }
        $limit();
        $ref = 'assist:' . substr(sha1(Audit::ip()), 0, 16);
        // 애드인 작업창(context=addin)은 에셋·시작하기·계정 도움말에서만 고른다
        $res = Assist::answer($q, (Response::input()['context'] ?? '') === 'addin', $ref);
        unset($res['capability']);
        Response::json($res);
    });

    // powerMCP 요청 판정 — 키(Bearer) 또는 로그인 사용자. MCP 도구 powerplus_check_request 가 부른다.
    $r->post('/assist/scope', function (array $p, Actor $a) use ($limit, $capLinks): void {
        $q = trim((string) (Response::input()['request'] ?? ''));
        if (mb_strlen($q) < 2 || mb_strlen($q) > 2000) {
            throw HttpError::invalid('요청을 2~2000자로 적어 주세요.');
        }
        if ($a->id() === null) {
            $limit();
        }
        $s = Triage::scope($q);
        if ($s === null) {
            throw new HttpError('UNAVAILABLE', '지금은 판정할 수 없습니다.', 503, '잠시 뒤에 다시 시도하세요.');
        }
        // 시작 주소는 절대 주소로 — MCP 를 쓰는 AI 가 사용자에게 그대로 링크로 보여 준다
        $base = rtrim((string) Config::get('app.url', 'https://powerplus.hom2box.com'), '/');
        if (!preg_match('#^https://#', $base)) {
            $base = 'https://powerplus.hom2box.com';
        }
        $path = $capLinks[$s['capability']][0] ?? null;
        $s['start'] = $path !== null ? $base . $path : null;
        if ($s['capability'] === 'deck_status') {
            $s['mcp_tool'] = 'deck_jobs';
        }
        $out = Triage::clarify($q, $s);   // needs_clarification·questions·alternatives
        unset($out['rule'], $out['vague']);
        foreach ($out['alternatives'] as $i => $alt) {
            if (isset($alt['start']) && str_starts_with((string) $alt['start'], 'https://powerplus.hom2box.com')) {
                $out['alternatives'][$i]['start'] = $base . substr((string) $alt['start'], strlen('https://powerplus.hom2box.com'));
            }
        }
        Response::json($out);
    });
};
