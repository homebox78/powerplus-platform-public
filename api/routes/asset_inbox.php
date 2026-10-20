<?php
/**
 * 자산 받은편지함 — /api/v1/admin/assets/inbox… (사용자 2026-10-20 "내가 이미지를 올려두면 알아서 일정시간 서버가 확인 후 자동 등록").
 * 관리자 › powerAssets › 자산 받은편지함 화면이 그림을 여러 장 올리면 asset_inbox 에 pending 으로 쌓이고,
 * api/bin/asset-inbox.php(크론 10분)가 중복 확인·줄이기·AI 판정 뒤 등록하거나 '검토 필요'로 돌린다. 처리 규칙은 Pp\Assets\Inbox 한 곳.
 * 권한: 큐레이터 이상, 세션 로그인만(admin.php 의 $need 와 같은 규약).
 * ⚠ index.php 모듈 목록에서 'admin' 보다 앞에 둔다 — admin.php 의 GET /admin/assets/{id} 가 먼저 등록되면 'inbox' 를 에셋 id 로 먹는다.
 */
declare(strict_types=1);

use Pp\Assets\Inbox;
use Pp\Core\Actor;
use Pp\Core\Audit;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Response;
use Pp\Core\Router;

return static function (Router $r): void {
    $need = static function (Actor $a, string $role = 'curator'): void {
        if ($a->user === null) {
            throw HttpError::unauthorized();
        }
        if ($a->via !== 'session' || !$a->hasRole($role)) {
            throw HttpError::forbidden();
        }
    };
    $rowOf = static function (string $id): array {
        if (!preg_match('/^[a-z0-9]{16}$/', $id)) {
            throw HttpError::notFound('받은편지함 그림');
        }
        $row = Db::row('SELECT * FROM asset_inbox WHERE public_id = ?', [$id]);
        if (!$row) {
            throw HttpError::notFound('받은편지함 그림');
        }
        return $row;
    };

    // 목록 — status(쉼표로 여럿)·batch 로 거르기, 상태별 건수는 meta.counts
    $r->get('/admin/assets/inbox', function (array $p, Actor $a) use ($need): void {
        $need($a);
        [$page, $limit, $off] = Response::paging(60, 200);
        $where = ["status <> 'rejected'"];
        $args = [];
        $st = array_values(array_intersect(explode(',', (string) ($_GET['status'] ?? '')), Inbox::STATUSES));
        if ($st !== []) {
            $where = ['status IN (' . implode(',', array_fill(0, count($st), '?')) . ')'];
            $args = $st;
        }
        $batch = (string) ($_GET['batch'] ?? '');
        if (preg_match('/^[a-z0-9]{16}$/', $batch)) {
            $where[] = 'batch = ?';
            $args[] = $batch;
        }
        $w = implode(' AND ', $where);
        $total = (int) Db::val("SELECT COUNT(*) FROM asset_inbox WHERE {$w}", $args);
        $rows = Db::rows("SELECT * FROM asset_inbox WHERE {$w} ORDER BY id DESC LIMIT {$limit} OFFSET {$off}", $args);
        $counts = array_fill_keys(Inbox::STATUSES, 0);
        foreach (Db::rows('SELECT status, COUNT(*) AS n FROM asset_inbox GROUP BY status') as $c) {
            $counts[(string) $c['status']] = (int) $c['n'];
        }
        Response::list(array_map([Inbox::class, 'out'], $rows), $total, $page, $limit, ['counts' => $counts]);
    });

    // 올리기 — multipart: files[](여러 장), set(묶음 이름), kind(auto·photo·illust·icon), batch(같은 올리기의 다음 조각이면 앞에서 받은 값)
    // 한 장이 틀려도 나머지는 받는다 — 틀린 것은 errors 로.
    $r->post('/admin/assets/inbox', function (array $p, Actor $a) use ($need): void {
        $need($a);
        $f = $_FILES['files'] ?? null;
        if (!is_array($f) || !isset($f['name'])) {
            if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
                throw HttpError::invalid('한 번에 보낸 크기가 서버 한도를 넘었습니다.', '파일을 나눠서 올려 주세요.');
            }
            throw HttpError::invalid('그림 파일(files[])을 보내 주세요.', 'files');
        }
        $label = trim((string) ($_POST['set'] ?? ''));
        if ($label === '') {
            throw HttpError::invalid('묶음 이름을 적어 주세요.', 'set');
        }
        $kind = (string) ($_POST['kind'] ?? 'auto');
        if (!in_array($kind, Inbox::KINDS, true)) {
            throw HttpError::invalid('종류가 올바르지 않습니다.', 'kind');
        }
        $batch = (string) ($_POST['batch'] ?? '');
        if (!preg_match('/^[a-z0-9]{16}$/', $batch)) {
            $batch = \Pp\Core\Ids::publicId();
        }
        $n = is_array($f['name']) ? count($f['name']) : 1;
        if ($n > 50) {
            throw HttpError::invalid('한 번에 50장까지 보낼 수 있습니다.', '화면은 몇 장씩 나눠 보낸다');
        }
        $items = [];
        $errors = [];
        for ($i = 0; $i < $n; $i++) {
            $one = is_array($f['name'])
                ? ['name' => $f['name'][$i] ?? '', 'tmp_name' => $f['tmp_name'][$i] ?? '', 'size' => $f['size'][$i] ?? 0, 'error' => $f['error'][$i] ?? UPLOAD_ERR_NO_FILE]
                : $f;
            try {
                $items[] = Inbox::out(Inbox::accept($one, $label, $kind, $batch, $a->id()));
            } catch (\InvalidArgumentException $e) {
                $errors[] = ['name' => (string) $one['name'], 'message' => $e->getMessage()];
            } catch (\Throwable $e) {
                error_log('[inbox] 받기 실패 ' . $e->getMessage());
                $errors[] = ['name' => (string) $one['name'], 'message' => '저장하지 못했습니다.'];
            }
        }
        if ($items !== []) {
            Audit::log($a, 'asset_inbox.upload', 'asset_inbox:' . $batch, null, ['set' => $label, 'kind' => $kind, 'count' => count($items)]);
        }
        Response::json(['batch' => $batch, 'items' => $items, 'errors' => $errors], $items !== [] ? 201 : 400);
    });

    // 미리보기(360 WebP) — 받은 그림은 웹 밖에 있어 여기서만 보인다
    $r->get('/admin/assets/inbox/{id}/thumb', function (array $p, Actor $a) use ($need, $rowOf): void {
        $need($a);
        $row = $rowOf((string) $p['id']);
        $file = Inbox::inboxDir() . '/' . Inbox::previewRel((string) $row['path']);
        if (!is_file($file)) {
            throw HttpError::notFound('미리보기');
        }
        header('Content-Type: image/webp');
        header('Content-Length: ' . filesize($file));
        header('Cache-Control: private, max-age=3600');
        readfile($file);
        exit;
    });

    // 등록(검토 필요 → 승인) — name 을 주면 그 이름으로
    $r->post('/admin/assets/inbox/{id}/approve', function (array $p, Actor $a) use ($need, $rowOf): void {
        $need($a);
        $row = $rowOf((string) $p['id']);
        if ($row['status'] !== 'review') {
            throw new HttpError('STATE', '검토 필요인 그림만 등록할 수 있습니다.', 409);
        }
        $b = Response::input();
        $name = isset($b['name']) && is_string($b['name']) ? $b['name'] : null;
        ini_set('memory_limit', '1024M');
        try {
            $itemId = Inbox::register($row, $name);
        } catch (\RuntimeException $e) {
            throw new HttpError('INBOX', $e->getMessage(), 500);
        }
        Audit::log($a, 'asset_inbox.approve', 'asset_inbox:' . $row['public_id'], ['status' => 'review', 'reason' => $row['reason']], ['item_id' => $itemId]);
        Response::json(Inbox::out((array) Db::row('SELECT * FROM asset_inbox WHERE id = ?', [(int) $row['id']])));
    });

    // 빼기 — 받은 원본·미리보기를 지우고 rejected 로(등록된 그림은 손대지 않는다)
    $r->post('/admin/assets/inbox/{id}/reject', function (array $p, Actor $a) use ($need, $rowOf): void {
        $need($a);
        $row = $rowOf((string) $p['id']);
        if (in_array($row['status'], ['done', 'processing', 'rejected'], true)) {
            throw new HttpError('STATE', '등록됐거나 처리 중인 그림은 뺄 수 없습니다.', 409);
        }
        @unlink(Inbox::inboxDir() . '/' . $row['path']);
        @unlink(Inbox::inboxDir() . '/' . Inbox::previewRel((string) $row['path']));
        Db::exec("UPDATE asset_inbox SET status = 'rejected' WHERE id = ?", [(int) $row['id']]);
        Audit::log($a, 'asset_inbox.reject', 'asset_inbox:' . $row['public_id'], ['status' => $row['status']], null);
        Response::json(['id' => $row['public_id'], 'status' => 'rejected']);
    });

    // 다시 시도 — 실패·검토 필요를 대기로(다음 회차 처리기가 다시 본다)
    $r->post('/admin/assets/inbox/{id}/retry', function (array $p, Actor $a) use ($need, $rowOf): void {
        $need($a);
        $row = $rowOf((string) $p['id']);
        if (!in_array($row['status'], ['failed', 'review'], true)) {
            throw new HttpError('STATE', '실패·검토 필요인 그림만 다시 시도할 수 있습니다.', 409);
        }
        if (!is_file(Inbox::inboxDir() . '/' . $row['path'])) {
            throw new HttpError('GONE', '받은 원본이 없어 다시 시도할 수 없습니다. 다시 올려 주세요.', 409);
        }
        Db::exec("UPDATE asset_inbox SET status = 'pending', reason = NULL, tries = 0 WHERE id = ?", [(int) $row['id']]);
        Audit::log($a, 'asset_inbox.retry', 'asset_inbox:' . $row['public_id'], ['status' => $row['status']], null);
        Response::json(Inbox::out((array) Db::row('SELECT * FROM asset_inbox WHERE id = ?', [(int) $row['id']])));
    });
};
