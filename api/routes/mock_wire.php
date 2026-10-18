<?php
/**
 * powerMock 기획 와이어프레임 — /api/v1/mock/wire…  (엔진: api/src/Mock/Wire.php)
 *
 *   GET    /mock/wire/options                 화면 종류·기관 묶음·칸 종류(섹션 유형)
 *   POST   /mock/wire/generate                {screen, org?, request?, ai?} → {wire, check, source: rule|ai, prompt}
 *   POST   /mock/wire/check                   {wire} → {check(+fit), wire(정리본, 칸마다 ev)}
 *   POST   /mock/wire/content                 {wire} → {wire(칸마다 예시 글 t·s·items·img, 원래 설명은 label)} — 보기용
 *   generate 응답 basis: samples·note·style·alternatives(스타일 목록) + fit(레퍼런스 닮음)·dist(채택률 분포)·recommended(추천 3안)·refine(AI 가 바꾼 점)
 *   GET    /mock/wireframes                   내 와이어 목록
 *   POST   /mock/wireframes                   {title, wire, request?, source?} 저장
 *   GET    /mock/wireframes/{id}              하나(Access::can)
 *   PUT    /mock/wireframes/{id}              {title?, wire?} 고치기
 *   DELETE /mock/wireframes/{id}
 *
 * 생성·판정은 결정적이라 비용이 없다 — 로그인 없이도 열어 둔다(MCP 키·웹 모두 같은 엔드포인트).
 * AI 다듬기(ai=true)만 로그인 + Llm 하루 상한을 탄다. 저장은 로그인, 기본 공개 범위 private.
 */
declare(strict_types=1);

use Pp\Core\Access;
use Pp\Core\Actor;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Ids;
use Pp\Core\Response;
use Pp\Core\Router;
use Pp\Mock\Wire;
use Pp\Mock\WireContent;

return static function (Router $r): void {
    $row = static function (string $pid): array {
        $x = Db::row('SELECT * FROM mock_wireframes WHERE public_id = ? AND deleted_at IS NULL', [$pid]);
        if (!$x) {
            throw HttpError::notFound('와이어프레임');
        }
        return $x;
    };
    $pub = static function (array $x, bool $full = false): array {
        $w = json_decode((string) $x['json'], true) ?: [];
        $out = [
            'id' => $x['public_id'], 'title' => $x['title'], 'screen' => $x['screen'],
            'screen_label' => Wire::SCREENS[$x['screen']]['label'] ?? $x['screen'],
            'org' => $x['org_kind'], 'score' => $x['score'] === null ? null : (int) $x['score'], 'pass' => (bool) $x['pass'],
            'rows' => count((array) ($w['rows'] ?? [])), 'source' => $x['source'], 'visibility' => $x['visibility'],
            'created_at' => $x['created_at'], 'updated_at' => $x['updated_at'],
        ];
        if ($full) {
            $w += ['org' => 'all', 'screen' => 'main', 'rows' => []];
            $out['wire'] = Wire::annotate($w);
            $out['request'] = (string) ($x['request'] ?? '');
            $out['check'] = json_decode((string) ($x['check_result'] ?? 'null'), true);
            $out['prompt'] = Wire::prompt($w, (string) ($x['request'] ?? ''));
            // 근거 — 저장해 둔 요약(wire.basis) + 지금 패턴으로 다시 계산한 분포·닮음(패턴을 다시 만들면 최신 값)
            $dist = Wire::distribution((string) $w['screen'], (string) $w['org']);
            $out['basis'] = (is_array($w['basis'] ?? null) ? $w['basis'] : []) + ['samples' => $dist['n'], 'pattern' => $dist['pattern']]
                + ['dist' => $dist, 'fit' => Wire::fit($w)];
        }
        return $out;
    };

    $r->get('/mock/wire/options', static function (): void {
        Response::json(Wire::options());
    });

    $r->post('/mock/wire/generate', static function (array $p, Actor $a): void {
        $in = Response::input();
        $screen = (string) ($in['screen'] ?? 'main');
        if (!isset(Wire::SCREENS[$screen])) {
            throw HttpError::invalid('화면 종류(screen)가 없습니다.', '다음 중 하나: ' . implode(', ', array_keys(Wire::SCREENS)));
        }
        $org = (string) ($in['org'] ?? 'all');
        $req = trim(mb_substr((string) ($in['request'] ?? ''), 0, 800));
        $style = (string) ($in['style'] ?? 'auto');
        if ($style !== 'auto' && !isset(Wire::STYLES[$style])) {
            throw HttpError::invalid('스타일(style)이 없습니다.', '다음 중 하나: auto, ' . implode(', ', array_keys(Wire::STYLES)));
        }
        $draft = Wire::draft($screen, $org, $req, $style, (int) ($in['variant'] ?? 0));
        $basis = $draft['basis'];
        unset($draft['basis']);
        $source = 'rule';
        $note = null;
        if (!empty($in['ai'])) {
            if ($a->user === null) {
                $note = 'AI 다듬기는 로그인해야 쓸 수 있어 레퍼런스 초안을 그대로 드립니다.';
            } elseif ($req === '') {
                $note = '요청 글이 없어 레퍼런스 초안을 그대로 드립니다.';
            } else {
                $ref = Wire::refine($draft, $req);
                if ($ref !== null) {
                    $draft = Wire::annotate($ref['wire']);
                    $source = 'ai';
                    $basis['refine'] = ['why' => $ref['why'], 'changes' => $ref['changes']];
                    $basis['fit'] = Wire::fit($draft);
                } else {
                    $note = 'AI 다듬기를 쓰지 못해 레퍼런스 초안을 그대로 드립니다 — ' . (Wire::$refineReason ?? '판정 미달');
                }
            }
        }
        $title = trim(mb_substr((string) ($in['title'] ?? ''), 0, 120));
        if ($title !== '') {
            $draft['title'] = $title;
        }
        Response::json([
            'wire' => $draft, 'check' => Wire::check($draft), 'source' => $source, 'note' => $note,
            'basis' => $basis, 'prompt' => Wire::prompt($draft, $req),
        ]);
    });

    $r->post('/mock/wire/check', static function (): void {
        $in = Response::input();
        $w = is_array($in['wire'] ?? null) ? $in['wire'] : $in;
        if (!is_array($w) || !isset($w['rows'])) {
            throw HttpError::invalid('wire.rows 가 필요합니다.');
        }
        $check = Wire::check($w);
        Response::json(['check' => $check, 'wire' => Wire::annotate(Wire::normalize($w))]);
    });

    // 내용 보기 — 칸마다 그 기관 묶음에 맞는 예시 글·샘플 그림 종류(결정적, 가상 기관). 보기용이라 저장하지 않는다.
    $r->post('/mock/wire/content', static function (): void {
        $in = Response::input();
        $w = is_array($in['wire'] ?? null) ? $in['wire'] : $in;
        if (!is_array($w) || !isset($w['rows'])) {
            throw HttpError::invalid('wire.rows 가 필요합니다.');
        }
        $n = Wire::normalize($w);
        Response::json(['wire' => WireContent::fill($n)]);
    });

    $r->get('/mock/wireframes', static function (array $p, Actor $a) use ($pub): void {
        $rows = Db::rows('SELECT * FROM mock_wireframes WHERE owner_user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 200', [$a->id()]);
        Response::json(array_map(static fn (array $x): array => $pub($x), $rows));
    }, ['auth' => true]);

    $r->post('/mock/wireframes', static function (array $p, Actor $a) use ($pub, $row): void {
        $in = Response::input();
        if (!is_array($in['wire'] ?? null)) {
            throw HttpError::invalid('wire 가 필요합니다.');
        }
        $today = (int) Db::val('SELECT COUNT(*) FROM mock_wireframes WHERE owner_user_id = ? AND created_at >= CURDATE()', [$a->id()]);
        if ($today >= 100) {
            throw new HttpError('RATE_LIMIT', '와이어프레임은 하루 100개까지 저장할 수 있습니다.', 429);
        }
        $w = Wire::normalize($in['wire']);
        if (!$w['rows']) {
            throw HttpError::invalid('줄이 하나도 없습니다.');
        }
        $check = Wire::check($w);
        $title = trim(mb_substr((string) ($in['title'] ?? $w['title'] ?? ''), 0, 200));
        if ($title === '') {
            $title = (Wire::ORGS[$w['org']] ?? '') . ' ' . (Wire::SCREENS[$w['screen']]['label'] ?? '') . ' 와이어';
        }
        $w['title'] = $title;
        $pid = Ids::publicId();
        Db::exec('INSERT INTO mock_wireframes (public_id, owner_user_id, title, screen, org_kind, request, json, score, pass, check_result, source)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?)', [
            $pid, $a->id(), $title, $w['screen'], $w['org'], trim(mb_substr((string) ($in['request'] ?? ''), 0, 800)) ?: null,
            json_encode($w, JSON_UNESCAPED_UNICODE), $check['score'], $check['pass'] ? 1 : 0,
            json_encode($check, JSON_UNESCAPED_UNICODE), ($in['source'] ?? '') === 'ai' ? 'ai' : 'rule',
        ]);
        Response::json($pub($row($pid), true), 201);
    }, ['auth' => true]);

    $r->get('/mock/wireframes/{id}', static function (array $p, Actor $a) use ($pub, $row): void {
        $x = $row($p['id']);
        Access::assert($a, $x);
        Response::json($pub($x, true) + ['mine' => $a->id() !== null && (int) $x['owner_user_id'] === $a->id()]);
    });

    $r->put('/mock/wireframes/{id}', static function (array $p, Actor $a) use ($pub, $row): void {
        $x = $row($p['id']);
        Access::assert($a, $x, 'edit');
        $in = Response::input();
        $w = is_array($in['wire'] ?? null) ? Wire::normalize($in['wire']) : (json_decode((string) $x['json'], true) ?: []);
        $title = trim(mb_substr((string) ($in['title'] ?? $x['title']), 0, 200)) ?: $x['title'];
        $w['title'] = $title;
        $check = Wire::check($w);
        Db::exec('UPDATE mock_wireframes SET title = ?, screen = ?, org_kind = ?, json = ?, score = ?, pass = ?, check_result = ? WHERE id = ?', [
            $title, $w['screen'] ?? $x['screen'], $w['org'] ?? $x['org_kind'], json_encode($w, JSON_UNESCAPED_UNICODE),
            $check['score'], $check['pass'] ? 1 : 0, json_encode($check, JSON_UNESCAPED_UNICODE), $x['id'],
        ]);
        Response::json($pub($row($p['id']), true));
    }, ['auth' => true]);

    $r->delete('/mock/wireframes/{id}', static function (array $p, Actor $a) use ($row): void {
        $x = $row($p['id']);
        Access::assert($a, $x, 'delete');
        Db::exec('UPDATE mock_wireframes SET deleted_at = NOW() WHERE id = ?', [$x['id']]);
        Response::noContent();
    }, ['auth' => true]);
};
