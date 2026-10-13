<?php
/**
 * 분석 보고서 — /api/v1/reports…
 * powerMCP(powerplus_publish_report)·웹이 만든 답을 사이트 디자인의 보고서 한 장(/r/{id})으로 남긴다(사용자 2026-10-08).
 * 자산 칸은 저장할 때 서버가 다시 읽어 이름·썸네일·키워드를 채운다 — 받은 글을 그대로 믿지 않는다.
 * 비회원도 볼 수 있는 등급이 아닌 자산은 잠금 칸(이름·그림 없이)으로 남긴다(링크만 알면 누구나 보기 때문, G30).
 */
declare(strict_types=1);

use Pp\Core\Access;
use Pp\Core\Actor;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Ids;
use Pp\Core\Response;
use Pp\Core\Router;

return static function (Router $r): void {
    $clip = static fn ($v, int $n): string => trim(mb_substr(is_scalar($v) ? (string) $v : '', 0, $n));

    /** 자산 칸 하나 → 보고서에 남길 모양 */
    $assetSnap = static function (string $pid, string $reason, string $label): array {
        $row = Db::row('SELECT i.*, s.name AS set_name FROM asset_items i LEFT JOIN asset_sets s ON s.id = i.set_id WHERE i.public_id = ? AND i.deleted_at IS NULL', [$pid]);
        $base = ['id' => $pid, 'reason' => $reason, 'label' => $label];
        if (!$row) {
            return $base + ['missing' => true];
        }
        if ($row['category'] === 'mockup_sample' || !Access::can(Actor::anon(), $row)) {
            return $base + ['locked' => true, 'category' => $row['category']];
        }
        $kw = Db::rows("SELECT t.tag FROM asset_tags t WHERE t.item_id = ? AND t.axis = 'kw' AND t.lang = 'ko'
                        ORDER BY (SELECT COUNT(*) FROM asset_tags c WHERE c.tag = t.tag AND c.axis = 'kw') ASC LIMIT 5", [$row['id']]);
        $ko = \Pp\Assets\Service::CATEGORY_KO[$row['category']] ?? $row['category'];
        $kwList = array_column($kw, 'tag');
        // 이름·대체 글이 빈 이관분은 받은 label → 대표 키워드 2개 순으로(카드 이름이 빈칸이던 것, 2026-10-12 MCP 시험 x1)
        $name = trim((string) ($row['name'] ?? '')) ?: trim((string) ($row['alt'] ?? '')) ?: ($label !== '' ? $label : implode(' ', array_slice($kwList, 0, 2)));
        return $base + [
            'name' => $name !== '' ? $name : $ko,
            'category' => $row['category'],
            'category_ko' => $ko,
            'set' => $row['set_name'],
            'keywords' => $kwList,
            'thumb_url' => '/api/v1/assets/items/' . $pid . '/file/thumb',
            'url' => '/assets/browse?item=' . $pid,
        ];
    };

    // 만들기 — 로그인(또는 MCP 키) 필요. 하루 50건.
    $r->post('/reports', function (array $p, Actor $a) use ($clip, $assetSnap): void {
        $in = Response::input();
        $title = $clip($in['title'] ?? '', 200);
        if ($title === '') {
            throw HttpError::invalid('제목(title)이 필요합니다.');
        }
        $today = (int) Db::val('SELECT COUNT(*) FROM core_reports WHERE user_id = ? AND created_at >= CURDATE()', [$a->id()]);
        if ($today >= 50) {
            throw new HttpError('RATE_LIMIT', '보고서는 하루 50건까지 만들 수 있습니다.', 429);
        }
        $blocks = [];
        $assetN = 0;
        $ignored = [];   // 없는·형식이 틀린 에셋 id — 빈 카드로 게시하지 않고 응답에 알린다(2026-10-12 MCP 시험 x1)
        $used = [];
        foreach (array_slice((array) ($in['blocks'] ?? []), 0, 20) as $b) {
            if (!is_array($b)) {
                continue;
            }
            $type = (string) ($b['type'] ?? '');
            $head = $clip($b['heading'] ?? '', 120);
            $note = $clip($b['note'] ?? '', 600);
            if ($type === 'assets') {
                $items = [];
                foreach (array_slice((array) ($b['items'] ?? []), 0, 60) as $it) {
                    $pid = is_array($it) ? $clip($it['id'] ?? '', 32) : $clip($it, 32);
                    if ($pid === '' || !preg_match('/^[a-z0-9]{6,32}$/', $pid)) {
                        if ($pid !== '') {
                            $ignored[] = ['id' => $pid, 'why' => '형식이 틀린 id'];
                        }
                        continue;
                    }
                    if (isset($used[$pid]) || $assetN >= 120) {
                        continue;   // 같은 에셋 두 번·상한 넘침은 조용히 뺀다
                    }
                    $snap = $assetSnap($pid, is_array($it) ? $clip($it['reason'] ?? '', 300) : '', is_array($it) ? $clip($it['label'] ?? '', 60) : '');
                    if (!empty($snap['missing'])) {
                        $ignored[] = ['id' => $pid, 'why' => '없거나 지운 에셋'];
                        continue;
                    }
                    $used[$pid] = true;
                    $assetN++;
                    $items[] = $snap;
                }
                if ($items) {
                    $blocks[] = ['type' => 'assets', 'heading' => $head, 'note' => $note, 'items' => $items];
                }
            } elseif ($type === 'text') {
                $body = $clip($b['body'] ?? '', 4000);
                if ($body !== '') {
                    $blocks[] = ['type' => 'text', 'heading' => $head, 'body' => $body];
                }
            } elseif ($type === 'list') {
                $list = array_values(array_filter(array_map(static fn ($x) => mb_substr(is_scalar($x) ? trim((string) $x) : '', 0, 300), array_slice((array) ($b['items'] ?? []), 0, 30)), 'strlen'));
                if ($list) {
                    $blocks[] = ['type' => 'list', 'heading' => $head, 'items' => $list];
                }
            } elseif ($type === 'table') {
                $cols = array_map(static fn ($x) => mb_substr(is_scalar($x) ? (string) $x : '', 0, 40), array_slice((array) ($b['columns'] ?? []), 0, 8));
                $rows = [];
                foreach (array_slice((array) ($b['rows'] ?? []), 0, 60) as $row) {
                    $rows[] = array_map(static fn ($x) => mb_substr(is_scalar($x) ? (string) $x : '', 0, 300), array_slice(array_values((array) $row), 0, count($cols)));
                }
                if ($cols && $rows) {
                    $blocks[] = ['type' => 'table', 'heading' => $head, 'columns' => $cols, 'rows' => $rows];
                }
            }
        }
        if (!$blocks) {
            $hint = $ignored ? '무시한 에셋 id: ' . implode(', ', array_column($ignored, 'id')) . ' — assets_search 로 찾은 id 를 넘기세요.' : null;
            throw HttpError::invalid('내용 칸(blocks)이 비었습니다. assets·text·list·table 중 하나 이상 넣어 주세요.', $hint);
        }
        $module = in_array($in['module'] ?? '', ['assets', 'deck', 'mock', 'guide', 'all'], true) ? (string) $in['module'] : 'assets';
        $payload = [
            'question' => $clip($in['question'] ?? '', 500),
            'summary' => $clip($in['summary'] ?? '', 2000),
            'highlights' => array_values(array_filter(array_map(static fn ($x) => mb_substr(is_scalar($x) ? trim((string) $x) : '', 0, 120), array_slice((array) ($in['highlights'] ?? []), 0, 4)), 'strlen')),
            'blocks' => $blocks,
            'via' => $a->via === 'key' ? 'mcp' : 'web',
        ];
        $pid = Ids::publicId();
        Db::exec('INSERT INTO core_reports (public_id, user_id, api_key_id, module, title, payload, expires_at) VALUES (?, ?, ?, ?, ?, ?, NOW() + INTERVAL 180 DAY)',
            [$pid, $a->id(), $a->key['id'] ?? null, $module, $title, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
        $site = rtrim((string) \Pp\Core\Config::get('app.url', 'https://powerplus.hom2box.com'), '/');
        $res = ['id' => $pid, 'url' => $site . '/r/' . $pid, 'blocks' => count($blocks), 'assets' => $assetN];
        if ($ignored) {
            $res['ignored'] = $ignored;
            $res['warnings'] = ['없거나 형식이 틀린 에셋 ' . count($ignored) . '개는 보고서에 넣지 않았습니다.'];
        }
        Response::json($res, 201);
    }, ['auth' => true]);

    // 보기 — 링크를 아는 누구나(noindex 는 화면이 단다, API 응답도 색인 금지 — MCP-008)
    $r->get('/reports/{id}', function (array $p, Actor $a): void {
        header('X-Robots-Tag: noindex, nofollow');
        $row = Db::row('SELECT r.*, u.name AS author FROM core_reports r LEFT JOIN core_users u ON u.id = r.user_id
                        WHERE r.public_id = ? AND r.deleted_at IS NULL AND (r.expires_at IS NULL OR r.expires_at > NOW())', [$p['id']]);
        if (!$row) {
            throw HttpError::notFound('보고서');
        }
        Db::exec('UPDATE core_reports SET views = views + 1 WHERE id = ?', [$row['id']]);
        $pl = json_decode((string) $row['payload'], true) ?: [];
        Response::json([
            'id' => $row['public_id'], 'title' => $row['title'], 'module' => $row['module'],
            // 링크를 아는 누구나 보는 화면 — 만든 사람 이름은 본인에게만(공개 화면엔 개인 이름을 내지 않는다)
            'author' => ($a->id() !== null && (int) $row['user_id'] === $a->id()) ? ($row['author'] ?: '나') : 'powerPlus 회원', 'created_at' => $row['created_at'], 'expires_at' => $row['expires_at'],
            'mine' => $a->id() !== null && (int) $row['user_id'] === $a->id(),
        ] + $pl);
    });

    // 내 보고서 목록·지우기
    $r->get('/me/reports', function (array $p, Actor $a): void {
        $rows = Db::rows('SELECT public_id, title, module, views, created_at, expires_at FROM core_reports WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100', [$a->id()]);
        Response::json(array_map(static fn (array $x): array => ['id' => $x['public_id'], 'title' => $x['title'], 'module' => $x['module'], 'views' => (int) $x['views'], 'created_at' => $x['created_at'], 'expires_at' => $x['expires_at']], $rows));
    }, ['auth' => true]);

    $r->delete('/reports/{id}', function (array $p, Actor $a): void {
        $n = Db::exec('UPDATE core_reports SET deleted_at = NOW() WHERE public_id = ? AND user_id = ? AND deleted_at IS NULL', [$p['id'], $a->id()]);
        if (!$n) {
            throw HttpError::notFound('보고서');
        }
        Response::noContent();
    }, ['auth' => true]);
};
