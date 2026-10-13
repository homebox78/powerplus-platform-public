<?php
/**
 * 관리자 일괄 처리 2 — 커뮤니티 글·댓글, 시안·갤러리, 변경 이력, 도움말, 장표 작업, 개선 체크리스트를 여러 개 골라 한꺼번에.
 * 출처: admin_bulk.php(ids 검증·상한·Audit 규약). 항목마다 하는 일은 단건 엔드포인트를 그대로 따른다 —
 *       admin2.php(커뮤니티·시안·갤러리·도움말·변경 이력) · admin.php(장표 작업 취소·삭제와 파일 정리) · mock.php(체크리스트 상태).
 * 경로는 단건의 {id} 경로와 겹치지 않게 /admin/bulk/<대상> 으로 둔다(예: POST /admin/mock/checklist/{id} 가 'bulk' 를 먹지 않게).
 * 권한: 단건과 같은 역할(체크리스트만 큐레이터, 나머지 관리자). 세션 로그인만. 응답 {action, count, skipped?}.
 */
declare(strict_types=1);

use Pp\Core\Actor;
use Pp\Core\Audit;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Response;
use Pp\Core\Router;

return static function (Router $r): void {
    $need = static function (Actor $a, string $role = 'admin'): void {
        if ($a->user === null) {
            throw HttpError::unauthorized();
        }
        if ($a->via !== 'session' || !$a->hasRole($role)) {
            throw HttpError::forbidden();
        }
    };
    /** ids 배열 검증 — 형식이 맞는 것만, 중복 제거, 500개 상한 */
    $ids = static function (array $b, string $re = '/^[A-Za-z0-9_-]{4,32}$/'): array {
        $list = array_values(array_unique(array_filter(array_map('strval', (array) ($b['ids'] ?? [])), static fn (string $s): bool => preg_match($re, $s) === 1)));
        if ($list === []) {
            throw HttpError::invalid('처리할 항목을 골라 주세요.');
        }
        if (count($list) > 500) {
            throw HttpError::invalid('한 번에 500개까지 처리할 수 있습니다.');
        }
        return $list;
    };
    $in = static fn (array $list): string => implode(',', array_fill(0, count($list), '?'));
    $action = static function (array $b, array $allowed): string {
        $act = (string) ($b['action'] ?? '');
        if (!in_array($act, $allowed, true)) {
            throw HttpError::invalid('할 일을 골라 주세요.', implode(' · ', $allowed) . ' 중 하나');
        }
        return $act;
    };
    $done = static fn (string $act, int $count, int $total): array => ['action' => $act, 'count' => $count] + ($total - $count > 0 ? ['skipped' => $total - $count] : []);
    $INT = '/^\d{1,12}$/';

    // ---- 커뮤니티 글: hide · show · pin · unpin · delete (admin2 PATCH/DELETE /admin/community/posts/{id})
    $r->post('/admin/bulk/community/posts', function (array $p, Actor $a) use ($need, $ids, $in, $action, $done): void {
        $need($a);
        $b = Response::input();
        $act = $action($b, ['hide', 'show', 'pin', 'unpin', 'delete']);
        $list = $ids($b);
        $rows = Db::rows("SELECT * FROM comm_posts WHERE public_id IN ({$in($list)})", $list);
        $n = 0;
        foreach ($rows as $row) {
            $id = (int) $row['id'];
            $hidden = $row['deleted_at'] !== null;
            if ($act === 'delete') {
                Db::exec('DELETE FROM comm_posts WHERE id = ?', [$id]);
                Audit::log($a, 'comm.admin.delete', 'comm_posts:' . $row['public_id'], ['category' => $row['category'], 'title' => $row['title'], 'comments' => (int) $row['comment_count']], null);
            } elseif ($act === 'hide' || $act === 'show') {
                $h = $act === 'hide';
                if ($hidden === $h) {
                    continue;
                }
                Db::exec('UPDATE comm_posts SET deleted_at = ' . ($h ? 'COALESCE(deleted_at, NOW(3))' : 'NULL') . ' WHERE id = ?', [$id]);
                Audit::log($a, 'comm.admin.update', 'comm_posts:' . $row['public_id'], ['hidden' => $hidden], ['hidden' => $h]);
            } else {
                $pin = $act === 'pin';
                if ((bool) $row['pinned'] === $pin) {
                    continue;
                }
                Db::exec('UPDATE comm_posts SET pinned = ? WHERE id = ?', [$pin ? 1 : 0, $id]);
                Audit::log($a, 'comm.admin.update', 'comm_posts:' . $row['public_id'], ['pinned' => (bool) $row['pinned']], ['pinned' => $pin]);
            }
            $n++;
        }
        Response::json($done($act, $n, count($list)));
    });

    // ---- 커뮤니티 댓글: hide · show · delete (admin2 POST/DELETE /admin/community/comments/{id}) — 글의 댓글 수를 다시 센다
    $r->post('/admin/bulk/community/comments', function (array $p, Actor $a) use ($need, $ids, $in, $action, $done, $INT): void {
        $need($a);
        $b = Response::input();
        $act = $action($b, ['hide', 'show', 'delete']);
        $list = $ids($b, $INT);
        $rows = Db::rows("SELECT c.*, p.public_id AS post_pid FROM comm_comments c JOIN comm_posts p ON p.id = c.post_id WHERE c.id IN ({$in($list)})", $list);
        $n = 0;
        $posts = [];
        foreach ($rows as $c) {
            $id = (int) $c['id'];
            $hidden = $c['deleted_at'] !== null;
            if ($act === 'delete') {
                Db::exec('DELETE FROM comm_comments WHERE id = ?', [$id]);
                Audit::log($a, 'comm.admin.comment.delete', 'comm_comments:' . $id, ['post' => $c['post_pid'], 'body' => mb_substr((string) $c['body'], 0, 200)], null);
            } else {
                $h = $act === 'hide';
                if ($hidden === $h) {
                    continue;
                }
                Db::exec('UPDATE comm_comments SET deleted_at = ' . ($h ? 'COALESCE(deleted_at, NOW(3))' : 'NULL') . ' WHERE id = ?', [$id]);
                Audit::log($a, 'comm.admin.comment.' . $act, 'comm_comments:' . $id, ['hidden' => $hidden], ['hidden' => $h]);
            }
            $posts[(int) $c['post_id']] = true;
            $n++;
        }
        foreach (array_keys($posts) as $pid) {
            Db::exec('UPDATE comm_posts SET comment_count = (SELECT COUNT(*) FROM comm_comments WHERE post_id = ? AND deleted_at IS NULL) WHERE id = ?', [$pid, $pid]);
        }
        Response::json($done($act, $n, count($list)));
    });

    // ---- 시안: discard · restore · gallery_hide · gallery_delete (admin2 /admin/mockups/{id}, /admin/gallery/{id})
    $r->post('/admin/bulk/mockups', function (array $p, Actor $a) use ($need, $ids, $in, $action, $done): void {
        $need($a);
        $b = Response::input();
        $act = $action($b, ['discard', 'restore', 'gallery_hide', 'gallery_delete']);
        $list = $ids($b);
        $rows = Db::rows("SELECT m.id, m.public_id, m.discarded_at, g.id AS g_id, g.status AS g_status, g.likes AS g_likes
                          FROM mock_mockups m LEFT JOIN mock_gallery g ON g.mockup_id = m.id
                          WHERE m.public_id IN ({$in($list)}) AND m.deleted_at IS NULL", $list);
        $n = 0;
        foreach ($rows as $m) {
            $mid = (int) $m['id'];
            $gid = $m['g_id'] ? (int) $m['g_id'] : 0;
            if ($act === 'discard') {
                if ($m['discarded_at'] !== null) {
                    continue;
                }
                Db::exec('UPDATE mock_mockups SET discarded_at = NOW(3) WHERE id = ?', [$mid]);
                if ($gid && $m['g_status'] === 'shared') {
                    Db::exec("UPDATE mock_gallery SET status = 'hidden' WHERE id = ?", [$gid]);
                }
                Audit::log($a, 'mock.mockup.discard', 'mockup:' . $m['public_id'], ['discarded' => false, 'gallery' => $m['g_status']], ['discarded' => true]);
            } elseif ($act === 'restore') {
                if ($m['discarded_at'] === null) {
                    continue;
                }
                Db::exec('UPDATE mock_mockups SET discarded_at = NULL WHERE id = ?', [$mid]);
                if ($gid && $m['g_status'] === 'hidden') {
                    Db::exec("UPDATE mock_gallery SET status = 'study' WHERE id = ?", [$gid]);
                }
                Audit::log($a, 'mock.mockup.restore', 'mockup:' . $m['public_id'], ['discarded' => true], ['discarded' => false]);
            } elseif ($act === 'gallery_hide') {
                if (!$gid || $m['g_status'] === 'hidden') {
                    continue;
                }
                Db::exec("UPDATE mock_gallery SET status = 'hidden' WHERE id = ?", [$gid]);
                Audit::log($a, 'mock.gallery.hide', 'gallery:' . $gid, ['status' => $m['g_status']], ['status' => 'hidden']);
            } else {
                if (!$gid) {
                    continue;
                }
                Db::exec('DELETE FROM mock_gallery WHERE id = ?', [$gid]);
                Audit::log($a, 'mock.gallery.delete', 'gallery:' . $gid, ['status' => $m['g_status'], 'mockup' => $m['public_id'], 'likes' => (int) $m['g_likes']], null);
            }
            $n++;
        }
        Response::json($done($act, $n, count($list)));
    });

    // ---- 변경 이력·도움말: publish · unpublish · delete(소프트) — 표만 다르고 규칙이 같다
    $pubBulk = static function (string $table, string $auditPrefix, array $deleteKeys) use ($need, $ids, $in, $action, $done): callable {
        return static function (array $p, Actor $a) use ($table, $auditPrefix, $deleteKeys, $need, $ids, $in, $action, $done): void {
            $need($a);
            $b = Response::input();
            $act = $action($b, ['publish', 'unpublish', 'delete']);
            $list = $ids($b);
            $rows = Db::rows("SELECT * FROM {$table} WHERE public_id IN ({$in($list)}) AND deleted_at IS NULL", $list);
            $n = 0;
            foreach ($rows as $row) {
                $id = (int) $row['id'];
                if ($act === 'delete') {
                    Db::exec("UPDATE {$table} SET deleted_at = NOW(3) WHERE id = ?", [$id]);
                    Audit::log($a, $auditPrefix . '.delete', $table . ':' . $row['public_id'], array_intersect_key($row, array_flip($deleteKeys)), null);
                } else {
                    $on = $act === 'publish' ? 1 : 0;
                    if ((int) $row['published'] === $on) {
                        continue;
                    }
                    Db::exec("UPDATE {$table} SET published = ? WHERE id = ?", [$on, $id]);
                    Audit::log($a, $auditPrefix . '.update', $table . ':' . $row['public_id'], ['published' => (int) $row['published']], ['published' => $on]);
                }
                $n++;
            }
            Response::json($done($act, $n, count($list)));
        };
    };
    $r->post('/admin/bulk/changelog', $pubBulk('core_changelog', 'changelog', ['module', 'version', 'title']));
    $r->post('/admin/bulk/help/docs', $pubBulk('core_help_docs', 'help.doc', ['category', 'slug', 'title']));

    // ---- 장표 작업: cancel · delete (admin.php /admin/deck/jobs/{id}/cancel, DELETE) — 삭제는 파일 폴더까지 지운다
    $r->post('/admin/bulk/deck/jobs', function (array $p, Actor $a) use ($need, $ids, $in, $action, $done): void {
        $need($a);
        $b = Response::input();
        $act = $action($b, ['cancel', 'delete']);
        $list = $ids($b, '/^[0-9a-f]{16}$/');
        $rows = Db::rows("SELECT id, status FROM deck_jobs WHERE id IN ({$in($list)})", $list);
        $n = 0;
        foreach ($rows as $j) {
            $id = (string) $j['id'];
            $st = (string) $j['status'];
            if ($act === 'cancel') {
                if (in_array($st, ['queued', 'review', 'hold'], true)) {
                    Db::exec("UPDATE deck_jobs SET status = 'canceled', finished_at = NOW() WHERE id = ?", [$id]);
                    Db::exec("INSERT INTO deck_job_events (job_id, ts, kind, message) VALUES (?, NOW(), 'warn', '관리자가 작업을 취소했습니다.')", [$id]);
                } elseif ($st === 'running') {
                    Db::exec('UPDATE deck_jobs SET cancel_requested = 1 WHERE id = ?', [$id]);
                    Db::exec("INSERT INTO deck_job_events (job_id, ts, kind, message) VALUES (?, NOW(), 'warn', '관리자가 취소를 요청했습니다. 엔진이 현재 단계를 마치는 대로 멈춥니다.')", [$id]);
                } else {
                    continue;
                }
                Audit::log($a, 'deck.job.cancel', 'deck_job:' . $id, ['status' => $st], ['status' => $st === 'running' ? 'running(cancel_requested)' : 'canceled']);
            } else {
                if ($st === 'running' || $st === 'deleted') {
                    continue;
                }
                $files = (int) Db::val('SELECT COUNT(*) FROM deck_job_files WHERE job_id = ?', [$id]);
                Db::exec('DELETE FROM deck_job_files WHERE job_id = ?', [$id]);
                $root = \Pp\Deck\Legacy::dataDir() . '/jobs/' . $id;
                if (is_dir($root)) {
                    $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS), \RecursiveIteratorIterator::CHILD_FIRST);
                    foreach ($it as $f) {
                        $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
                    }
                    @rmdir($root);
                }
                Db::exec("UPDATE deck_jobs SET status = 'deleted', deleted_at = NOW(), deleted_by = ?, worker = NULL, cancel_requested = 0 WHERE id = ?", [$a->id(), $id]);
                Db::exec("INSERT INTO deck_job_events (job_id, ts, kind, message) VALUES (?, NOW(), 'warn', '관리자가 작업과 파일을 지웠습니다.')", [$id]);
                Audit::log($a, 'deck.job.delete', 'deck_job:' . $id, ['status' => $st, 'files' => $files], ['status' => 'deleted']);
            }
            $n++;
        }
        Response::json($done($act, $n, count($list)));
    });

    // ---- 개선 체크리스트: 상태 한꺼번에 (mock.php POST /admin/mock/checklist/{id} 의 status 부분, 큐레이터)
    $r->post('/admin/bulk/mock/checklist', function (array $p, Actor $a) use ($need, $ids, $in, $done, $INT): void {
        $need($a, 'curator');
        $b = Response::input();
        $s = (string) ($b['status'] ?? '');
        if (!in_array($s, \Pp\Mock\Checklist::STATUSES, true)) {
            throw HttpError::invalid('상태 값이 올바르지 않습니다.', implode(' · ', \Pp\Mock\Checklist::STATUSES));
        }
        $list = $ids($b, $INT);
        $rows = Db::rows("SELECT id, status, regressed FROM mock_checklist WHERE id IN ({$in($list)})", $list);
        $n = 0;
        foreach ($rows as $x) {
            if ((string) $x['status'] === $s && !($s === 'fixed' && (int) $x['regressed'] === 1)) {
                continue;
            }
            Db::exec('UPDATE mock_checklist SET status = ?, ' . ($s === 'fixed' ? 'fixed_at = NOW(3), regressed = 0' : 'fixed_at = NULL') . ' WHERE id = ?', [$s, (int) $x['id']]);
            Audit::log($a, 'mock.checklist.update', 'mock_checklist:' . $x['id'], ['status' => $x['status'], 'regressed' => (int) $x['regressed']], ['status' => $s, 'regressed' => $s === 'fixed' ? 0 : (int) $x['regressed']]);
            $n++;
        }
        Response::json($done('status', $n, count($list)));
    });
};
