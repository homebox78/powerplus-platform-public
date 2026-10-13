<?php
/**
 * 내 목록 한꺼번에 — /api/v1/me/bulk/…  (2026-10-07 사용자 "한꺼번에 수정하거나 삭제할 수도 있고")
 * 출처: 같은 단건 엔드포인트를 그대로 따른다 — routes/deck.php DELETE /deck/jobs/{id}(Jobs::delete, 진행 중은 못 지움),
 *       routes/mock.php DELETE /mock/mockups/{token}(소프트 삭제 + 갤러리 숨김), routes/saved.php DELETE /collections/{id}/items/{type}/{ref},
 *       routes/comm.php POST /notifications/read, routes/core.php DELETE /keys/{id}(Keys::revoke).
 *
 * 공통: 로그인 사용자 본인 것만(서버에서 owner 조건으로 거른다 — 남의 id 는 조용히 0 처리), ids 상한 200, 응답 {count}.
 *   POST /me/bulk/deck-jobs/delete      {ids:[16자리 작업 id]}
 *   POST /me/bulk/mockups/delete        {ids:[token]}
 *   POST /me/bulk/collections/{id}/remove {ids:["type:ref"]}
 *   POST /me/bulk/notifications/read    {ids:[숫자]}
 *   POST /me/bulk/notifications/delete  {ids:[숫자]}
 *   POST /me/bulk/keys/revoke           {ids:[public_id]}
 */
declare(strict_types=1);

use Pp\Core\Actor;
use Pp\Core\Audit;
use Pp\Core\Auth;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Keys;
use Pp\Core\Response;
use Pp\Core\Router;
use Pp\Deck\Jobs;

return static function (Router $r): void {
    /** 요청 ids — 문자열로 다듬고 중복 제거, 상한 200 */
    $ids = static function (callable $clean): array {
        $raw = (array) (Response::input()['ids'] ?? []);
        if (count($raw) > 200) {
            throw HttpError::invalid('한 번에 200개까지 고를 수 있습니다.');
        }
        $out = [];
        foreach ($raw as $v) {
            $s = $clean(is_scalar($v) ? (string) $v : '');
            if ($s !== '') {
                $out[$s] = true;
            }
        }
        return array_keys($out);
    };
    $ph = static fn (array $a): string => implode(',', array_fill(0, count($a), '?'));

    // 내 장표 작업 지우기 — 진행 중인 작업은 건너뛴다(단건과 같은 규칙)
    $r->post('/me/bulk/deck-jobs/delete', static function (array $p, Actor $a) use ($ids, $ph): void {
        $u = Auth::requireUser($a);
        $list = $ids(static fn (string $s): string => preg_match('/^[0-9a-f]{16}$/', $s) ? $s : '');
        $n = 0;
        if ($list !== []) {
            $email = (string) $u['email'];
            $own = Db::rows("SELECT id FROM deck_jobs WHERE id IN ({$ph($list)}) AND email = ? AND status <> 'running'", [...$list, $email]);
            foreach ($own as $j) {
                Jobs::delete((string) $j['id'], $email, false);
                $n++;
            }
            if ($n > 0) {
                Audit::log($a, 'deck.bulk_delete', 'deck_jobs:' . $n);
            }
        }
        Response::json(['count' => $n]);
    }, ['auth' => true]);

    // 내 시안 지우기 — 소프트 삭제 + 갤러리 숨김
    $r->post('/me/bulk/mockups/delete', static function (array $p, Actor $a) use ($ids, $ph): void {
        $u = Auth::requireUser($a);
        $list = $ids(static fn (string $s): string => (string) preg_replace('/[^A-Za-z0-9_-]/', '', $s));
        $n = 0;
        if ($list !== []) {
            $rows = Db::rows("SELECT id FROM mock_mockups WHERE token IN ({$ph($list)}) AND owner_user_id = ? AND deleted_at IS NULL", [...$list, (int) $u['id']]);
            $mids = array_map(static fn ($m): int => (int) $m['id'], $rows);
            if ($mids !== []) {
                Db::exec("UPDATE mock_mockups SET deleted_at = NOW(3), published_at = NULL, visibility = 'private' WHERE id IN ({$ph($mids)})", $mids);
                Db::exec("UPDATE mock_gallery SET status = 'hidden' WHERE mockup_id IN ({$ph($mids)})", $mids);
                $n = count($mids);
                Audit::log($a, 'mock.bulk_delete', 'mockup:' . $n);
            }
        }
        Response::json(['count' => $n]);
    }, ['auth' => true]);

    // 컬렉션 항목 빼기 — ids = "type:ref"
    $r->post('/me/bulk/collections/{id}/remove', static function (array $p, Actor $a) use ($ids): void {
        $u = Auth::requireUser($a);
        $c = Db::row('SELECT id FROM core_collections WHERE public_id = ? AND owner_user_id = ?', [(string) $p['id'], $u['id']]);
        if (!$c) {
            throw HttpError::notFound('컬렉션');
        }
        $list = $ids(static fn (string $s): string => preg_match('/^[a-z]+:[A-Za-z0-9_-]+$/', $s) ? $s : '');
        $n = 0;
        foreach ($list as $k) {
            [$type, $ref] = explode(':', $k, 2);
            $n += Db::exec('DELETE FROM core_collection_items WHERE collection_id = ? AND item_type = ? AND item_public_id = ?', [(int) $c['id'], $type, $ref]);
        }
        if ($n > 0) {
            Db::exec('UPDATE core_collections SET updated_at = NOW(3) WHERE id = ?', [(int) $c['id']]);
        }
        Response::json(['count' => $n]);
    }, ['auth' => true]);

    // 알림 읽음·지우기
    $num = static fn (string $s): string => ctype_digit($s) && (int) $s > 0 ? $s : '';
    $r->post('/me/bulk/notifications/read', static function (array $p, Actor $a) use ($ids, $ph, $num): void {
        $u = Auth::requireUser($a);
        $list = array_map('intval', $ids($num));
        $n = $list === [] ? 0 : Db::exec("UPDATE core_notifications SET read_at = NOW(3) WHERE user_id = ? AND read_at IS NULL AND id IN ({$ph($list)})", [$u['id'], ...$list]);
        Response::json(['count' => $n]);
    }, ['auth' => true]);
    $r->post('/me/bulk/notifications/delete', static function (array $p, Actor $a) use ($ids, $ph, $num): void {
        $u = Auth::requireUser($a);
        $list = array_map('intval', $ids($num));
        $n = $list === [] ? 0 : Db::exec("DELETE FROM core_notifications WHERE user_id = ? AND id IN ({$ph($list)})", [$u['id'], ...$list]);
        Response::json(['count' => $n]);
    }, ['auth' => true]);

    // API 키 폐기
    $r->post('/me/bulk/keys/revoke', static function (array $p, Actor $a) use ($ids): void {
        $u = Auth::requireUser($a);
        $n = 0;
        foreach ($ids(static fn (string $s): string => (string) preg_replace('/[^A-Za-z0-9_-]/', '', $s)) as $pid) {
            if (Keys::revoke((int) $u['id'], $pid)) {
                Audit::log($a, 'key.revoke', 'core_api_keys:' . $pid);
                $n++;
            }
        }
        Response::json(['count' => $n]);
    }, ['auth' => true]);
};
