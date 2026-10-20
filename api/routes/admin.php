<?php
/**
 * 관리자 서버 — /api/v1/admin/… (기획 §9: 대시보드·사용자·문의·삭제요청).
 * 출처: homebox-handoff api/routes/admin-requests.php(요청 처리 흐름) — REST v1 규약(Actor·HttpError·봉투)으로.
 * 권한: 문의·삭제요청 = support 이상, 대시보드·사용자 = admin 이상. 세션 로그인만(API 키로는 관리자 화면을 못 부른다).
 * admin 역할 부여·회수는 superadmin 만(§12.2), superadmin 은 화면에서 손대지 못한다(코드 상수).
 * 모든 쓰기는 Core\Audit 로 남긴다(§9.3). 응답은 Response::json 기본 no-store.
 */
declare(strict_types=1);

use Pp\Assets\Service as AssetService;
use Pp\Core\Actor;
use Pp\Core\Audit;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Mail;
use Pp\Core\Response;
use Pp\Core\Router;
use Pp\Core\Scan;
use Pp\Core\Users;
use Pp\Core\Ids;
use Pp\Core\Config;
use Pp\Core\Notify;

const ADMIN_GRANTABLE = ['admin', 'curator', 'support'];
const CONTACT_STATUS = ['open', 'answered', 'closed'];
const REMOVAL_STATUS = ['received', 'reviewing', 'done', 'rejected'];
/** 관리자 화면이 바꿀 수 있는 에셋 공개 등급(기획 §12.1) / 필터로 볼 수 있는 전체 */
const ASSET_VIS_SET = ['internal', 'pro', 'free', 'public'];
const ASSET_VIS_ALL = ['internal', 'partner', 'pro', 'free', 'public', 'private'];

return static function (Router $r): void {
    /** 역할 확인 — support 는 문의·삭제요청만, admin 은 전부(Actor::hasRole 이 admin·superadmin 을 상위로 본다) */
    $need = static function (Actor $a, string $role): void {
        if ($a->user === null) {
            throw HttpError::unauthorized();
        }
        if ($a->via !== 'session' || !$a->hasRole($role)) {
            throw HttpError::forbidden();
        }
    };
    $like = static fn (string $q): string => '%' . addcslashes($q, '%_\\') . '%';

    // ---- 대시보드
    $r->get('/admin/stats', function (array $p, Actor $a) use ($need): void {
        $need($a, 'admin');
        $users = Db::row("SELECT COUNT(*) AS total, SUM(kind = 'staff') AS staff, SUM(kind = 'external') AS external FROM core_users WHERE deleted_at IS NULL") ?? [];
        $safe = static function (string $sql): int {
            try {
                return (int) Db::val($sql);
            } catch (\Throwable) {
                return 0;
            }
        };
        $removal = Db::row("SELECT SUM(status IN ('received','reviewing')) AS pending,
                                   SUM(status IN ('received','reviewing') AND due_at < NOW(3)) AS overdue
                            FROM core_removal_requests") ?? [];
        $audit = Db::rows('SELECT au.id, au.action, au.target_type, au.target_id, au.created_at, u.name AS actor_name, u.email AS actor_email
                           FROM core_audit au LEFT JOIN core_users u ON u.id = au.actor_user_id
                           ORDER BY au.id DESC LIMIT 10');
        Response::json([
            'users' => ['total' => (int) ($users['total'] ?? 0), 'staff' => (int) ($users['staff'] ?? 0), 'external' => (int) ($users['external'] ?? 0)],
            'assets' => $safe('SELECT COUNT(*) FROM asset_items WHERE deleted_at IS NULL'),
            'deck_jobs' => $safe('SELECT COUNT(*) FROM deck_jobs'),
            'mockups' => $safe('SELECT COUNT(*) FROM mock_mockups WHERE deleted_at IS NULL'),
            'contacts_open' => $safe("SELECT COUNT(*) FROM core_contacts WHERE status = 'open'"),
            'removals' => ['pending' => (int) ($removal['pending'] ?? 0), 'overdue' => (int) ($removal['overdue'] ?? 0)],
            'audit' => array_map(static fn (array $x): array => [
                'id' => (int) $x['id'], 'action' => $x['action'], 'target' => $x['target_type'] . ':' . $x['target_id'],
                'actor' => $x['actor_name'] ?? null, 'actor_email' => $x['actor_email'] ?? null, 'created_at' => $x['created_at'],
            ], $audit),
        ]);
    });

    // ---- 대시보드 운영 현황판(사용자 2026-10-18 "관리자 메뉴 속성에 맞게 짜임새 있고 실질적인 모니터링") —
    // 왼쪽 메뉴 묶음(요청 처리·모듈 운영·품질 검수·콘텐츠·회원·설정)마다 지금 손이 가야 하는 수와 위험 신호. 한 칸이 실패해도 나머지는 나온다.
    $r->get('/admin/ops', function (array $p, Actor $a) use ($need): void {
        $need($a, 'admin');
        $v = static function (string $sql, array $args = []): int {
            try {
                return (int) Db::val($sql, $args);
            } catch (\Throwable) {
                return 0;
            }
        };
        $rows = static function (string $sql): array {
            try {
                return Db::rows($sql);
            } catch (\Throwable) {
                return [];
            }
        };
        $oldest = static function (string $sql): ?string {
            try {
                $x = Db::val($sql);
                return $x === null || $x === false ? null : (string) $x;
            } catch (\Throwable) {
                return null;
            }
        };
        // 체크리스트 = 열림(open·fixing)·다시 생김(regressed)
        $chk = static function (string $table, string $where = '1=1') use ($v): array {
            return [
                'open' => $v("SELECT COUNT(*) FROM {$table} WHERE status IN ('open','fixing') AND {$where}"),
                'regressed' => $v("SELECT COUNT(*) FROM {$table} WHERE status IN ('open','fixing') AND regressed = 1 AND {$where}"),
            ];
        };
        Response::json([
            'requests' => [
                'contacts' => $v("SELECT COUNT(*) FROM core_contacts WHERE status = 'open'"),
                'contacts_oldest' => $oldest("SELECT MIN(created_at) FROM core_contacts WHERE status = 'open'"),
                'asset_requests' => $v("SELECT COUNT(*) FROM asset_requests WHERE status = 'new'"),
                'asset_requests_oldest' => $oldest("SELECT MIN(created_at) FROM asset_requests WHERE status = 'new'"),
                'removals' => $v("SELECT COUNT(*) FROM core_removal_requests WHERE status IN ('received','reviewing')"),
                'removals_overdue' => $v("SELECT COUNT(*) FROM core_removal_requests WHERE status IN ('received','reviewing') AND due_at < NOW(3)"),
            ],
            'modules' => [
                'deck_queue' => $v("SELECT COUNT(*) FROM deck_jobs WHERE status = 'queued'"),
                'deck_running' => $v("SELECT COUNT(*) FROM deck_jobs WHERE status = 'running'"),
                // 돌고 있다는데 10분 넘게 소식이 없는 작업 = 엔진이 멈췄을 수 있다
                'deck_stalled' => $v("SELECT COUNT(*) FROM deck_jobs WHERE status = 'running' AND (heartbeat_at IS NULL OR heartbeat_at < NOW() - INTERVAL 10 MINUTE)"),
                'deck_failed24' => $v("SELECT COUNT(*) FROM deck_jobs WHERE status = 'failed' AND created_at >= NOW() - INTERVAL 1 DAY"),
                'deck_review' => $v("SELECT COUNT(*) FROM deck_jobs WHERE status = 'review'"),
                'ai_month_usd' => (float) (function () {
                    try {
                        return Db::val("SELECT COALESCE(SUM(cost_usd), 0) FROM deck_ai_usage WHERE created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')");
                    } catch (\Throwable) {
                        return 0;
                    }
                })(),
                'assets_new7' => $v('SELECT COUNT(*) FROM asset_items WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL 7 DAY'),
                // 자산 받은편지함 — 자동 등록하지 못하고 사람 손을 기다리는 그림(글자·결함·비슷한 그림·AI 실패)
                'inbox_review' => $v("SELECT COUNT(*) FROM asset_inbox WHERE status = 'review'"),
                // 찾았는데 하나도 없던 말(7일) — 자료 요청·등록 후보
                'zero_searches' => array_map(static fn (array $r): array => ['q' => (string) $r['q'], 'n' => (int) $r['n']],
                    $rows("SELECT q, COUNT(*) AS n FROM asset_search_logs WHERE results = 0 AND day >= CURDATE() - INTERVAL 7 DAY GROUP BY q ORDER BY n DESC LIMIT 5")),
                'zero_search_total' => $v('SELECT COUNT(*) FROM asset_search_logs WHERE results = 0 AND day >= CURDATE() - INTERVAL 7 DAY'),
                'mock_new7' => $v('SELECT COUNT(*) FROM mock_mockups WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL 7 DAY'),
            ],
            'quality' => [
                'site' => $chk('site_checklist'),
                'assets' => $chk('qa_checklist', "module = 'assets'"),
                'deck' => $chk('deck_checklist'),
                'mock' => $chk('mock_checklist'),
                'guide' => $chk('qa_checklist', "module = 'guide'"),
                'mcp' => $chk('qa_checklist', "module = 'mcp'"),
            ],
            'content' => [
                'posts7' => $v('SELECT COUNT(*) FROM comm_posts WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL 7 DAY'),
                'comments7' => $v('SELECT COUNT(*) FROM comm_comments WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL 7 DAY'),
                'changelog_last' => $oldest('SELECT MAX(released_on) FROM core_changelog WHERE deleted_at IS NULL AND published = 1'),
            ],
            'members' => [
                'signups7' => $v('SELECT COUNT(*) FROM core_users WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL 7 DAY'),
                // 휴면 풀어 달라는 요청(관리자 승인 뒤 재사용, 2026-10-16 결정)
                'dormant_requests' => $v("SELECT COUNT(*) FROM core_users WHERE deleted_at IS NULL AND status = 'dormant' AND dormant_requested_at IS NOT NULL"),
                'dormant' => $v("SELECT COUNT(*) FROM core_users WHERE deleted_at IS NULL AND status = 'dormant'"),
                // 이용 기한(임직원 1년·협력사 계약 끝)이 30일 안에 끝나는 사람
                'expiring30' => $v('SELECT COUNT(*) FROM core_users WHERE deleted_at IS NULL AND access_until IS NOT NULL AND access_until >= NOW() AND access_until < NOW() + INTERVAL 30 DAY'),
                // 보기만 하는 외부 Free(전환 후보) — 판정은 Users::planOf 와 같은 구독 조건(개인 구독만 본다, 팀 소속은 드물어 뺀다)
                'free_viewers' => $v("SELECT COUNT(*) FROM core_users u WHERE u.deleted_at IS NULL AND u.status = 'active' AND u.kind <> 'staff'
                    AND NOT EXISTS (SELECT 1 FROM core_subscriptions s JOIN core_plans pl ON pl.id = s.plan_id WHERE s.owner_type = 'user' AND s.owner_id = u.id
                        AND pl.code IN ('pro','team') AND s.status IN ('trial','active','past_due') AND (s.current_period_end IS NULL OR s.current_period_end > NOW(3)))"),
            ],
        ]);
    });

    // ---- 문의
    $contactOut =static fn (array $c): array => [
        'id' => $c['public_id'], 'topic' => $c['topic'], 'module' => $c['module'], 'name' => $c['name'], 'email' => $c['email'],
        'org' => $c['org'], 'seats' => $c['seats'] === null ? null : (int) $c['seats'], 'message' => $c['message'],
        'reply' => $c['reply'], 'reply_sent_at' => $c['reply_sent_at'], 'status' => $c['status'],
        'member' => $c['user_id'] !== null, 'handled_by' => $c['handler_name'] ?? null, 'handled_at' => $c['handled_at'], 'created_at' => $c['created_at'],
        'ai' => isset($c['ai']) && $c['ai'] !== null ? json_decode((string) $c['ai'], true) : null,
    ];
    $contactSql = 'SELECT c.*, h.name AS handler_name FROM core_contacts c LEFT JOIN core_users h ON h.id = c.handled_by';

    $r->get('/admin/contacts', function (array $p, Actor $a) use ($need, $like, $contactOut, $contactSql): void {
        $need($a, 'support');
        [$page, $limit, $off] = Response::paging(30, 100);
        $where = ['1=1'];
        $args = [];
        $st = (string) ($_GET['status'] ?? '');
        if (in_array($st, CONTACT_STATUS, true)) {
            $where[] = 'c.status = ?';
            $args[] = $st;
        }
        $q = trim((string) ($_GET['q'] ?? ''));
        if ($q !== '') {
            $where[] = '(c.name LIKE ? OR c.email LIKE ? OR c.message LIKE ? OR c.org LIKE ?)';
            array_push($args, $like($q), $like($q), $like($q), $like($q));
        }
        $w = implode(' AND ', $where);
        $total = (int) Db::val("SELECT COUNT(*) FROM core_contacts c WHERE {$w}", $args);
        $rows = Db::rows("{$contactSql} WHERE {$w} ORDER BY c.id DESC LIMIT {$limit} OFFSET {$off}", $args);
        $counts = [];
        foreach (Db::rows('SELECT status, COUNT(*) AS n FROM core_contacts GROUP BY status') as $c) {
            $counts[$c['status']] = (int) $c['n'];
        }
        Response::list(array_map($contactOut, $rows), $total, $page, $limit, ['counts' => $counts]);
    });

    $r->patch('/admin/contacts/{id}', function (array $p, Actor $a) use ($need, $contactOut, $contactSql): void {
        $need($a, 'support');
        $c = Db::row('SELECT * FROM core_contacts WHERE public_id = ?', [(string) $p['id']]);
        if (!$c) {
            throw HttpError::notFound('문의');
        }
        $b = Response::input();
        $status = (string) ($b['status'] ?? $c['status']);
        if (!in_array($status, CONTACT_STATUS, true)) {
            throw HttpError::invalid('상태 값이 올바르지 않습니다.');
        }
        $reply = array_key_exists('reply', $b) ? trim((string) $b['reply']) : (string) ($c['reply'] ?? '');
        if (mb_strlen($reply) > 5000) {
            throw new HttpError('INVALID', '답변은 5,000자까지 적을 수 있습니다.', 422, 'reply');
        }
        $send = !empty($b['send_mail']);
        if ($send && $reply === '') {
            throw new HttpError('INVALID', '보낼 답변을 적어 주세요.', 422, 'reply');
        }
        $mailOk = null;
        if ($send) {
            [$subj, $text, $html] = \Pp\Core\MailTemplate::render('contact_reply', ['name' => (string) $c['name'], 'reply' => $reply, 'message' => (string) $c['message']]);
            $mailOk = Mail::send((string) $c['email'], $subj, $text, $html);
            if ($status === 'open') {
                $status = 'answered';
            }
        }
        Db::exec(
            'UPDATE core_contacts SET status = ?, reply = ?, reply_sent_at = IF(?, NOW(3), reply_sent_at), handled_by = ?, handled_at = NOW(3) WHERE id = ?',
            [$status, $reply === '' ? null : $reply, $mailOk === true ? 1 : 0, $a->id(), $c['id']]
        );
        Audit::log($a, $send ? 'contact.reply' : 'contact.update', 'contact:' . $c['public_id'],
            ['status' => $c['status']], ['status' => $status, 'mail' => $mailOk]);
        $row = Db::row("{$contactSql} WHERE c.id = ?", [$c['id']]);
        Response::json($contactOut($row) + ['mail_sent' => $mailOk]);
    });

    // ---- 삭제요청
    $removalOut = static fn (array $x): array => [
        'no' => $x['no'], 'status' => $x['status'], 'content_type' => $x['content_type'], 'content_id' => $x['content_id'],
        'claimant_name' => $x['claimant_name'], 'claimant_org' => $x['claimant_org'], 'email' => $x['requester_email'],
        'phone' => $x['claimant_phone'], 'target_url' => $x['target_url'], 'reason_kind' => $x['reason_kind'], 'reason' => $x['reason'],
        'resolution' => $x['resolution'], 'due_at' => $x['due_at'], 'handled_by' => $x['handler_name'] ?? null, 'handled_at' => $x['handled_at'],
        'created_at' => $x['created_at'], 'overdue' => in_array($x['status'], ['received', 'reviewing'], true) && strtotime((string) $x['due_at']) < time(),
    ];
    $removalSql = 'SELECT r.*, h.name AS handler_name FROM core_removal_requests r LEFT JOIN core_users h ON h.id = r.handled_by';

    $r->get('/admin/removals', function (array $p, Actor $a) use ($need, $like, $removalOut, $removalSql): void {
        $need($a, 'support');
        [$page, $limit, $off] = Response::paging(30, 100);
        $where = ['1=1'];
        $args = [];
        $st = (string) ($_GET['status'] ?? '');
        if (in_array($st, REMOVAL_STATUS, true)) {
            $where[] = 'r.status = ?';
            $args[] = $st;
        } elseif ($st === 'pending') {
            $where[] = "r.status IN ('received','reviewing')";
        }
        $q = trim((string) ($_GET['q'] ?? ''));
        if ($q !== '') {
            $where[] = '(r.no LIKE ? OR r.requester_email LIKE ? OR r.claimant_name LIKE ? OR r.target_url LIKE ?)';
            array_push($args, $like($q), $like($q), $like($q), $like($q));
        }
        $w = implode(' AND ', $where);
        $total = (int) Db::val("SELECT COUNT(*) FROM core_removal_requests r WHERE {$w}", $args);
        // 처리 대기는 기한 가까운 순, 끝난 건은 최근 순
        $rows = Db::rows("{$removalSql} WHERE {$w} ORDER BY (r.status IN ('received','reviewing')) DESC, IF(r.status IN ('received','reviewing'), r.due_at, NULL) ASC, r.id DESC LIMIT {$limit} OFFSET {$off}", $args);
        $counts = [];
        foreach (Db::rows('SELECT status, COUNT(*) AS n FROM core_removal_requests GROUP BY status') as $c) {
            $counts[$c['status']] = (int) $c['n'];
        }
        Response::list(array_map($removalOut, $rows), $total, $page, $limit, ['counts' => $counts]);
    });

    $r->patch('/admin/removals/{no}', function (array $p, Actor $a) use ($need, $removalOut, $removalSql): void {
        $need($a, 'support');
        $x = Db::row('SELECT * FROM core_removal_requests WHERE no = ?', [strtoupper((string) $p['no'])]);
        if (!$x) {
            throw HttpError::notFound('삭제요청');
        }
        $b = Response::input();
        $status = (string) ($b['status'] ?? $x['status']);
        if (!in_array($status, REMOVAL_STATUS, true)) {
            throw HttpError::invalid('상태 값이 올바르지 않습니다.');
        }
        $resolution = array_key_exists('resolution', $b) ? trim((string) $b['resolution']) : (string) ($x['resolution'] ?? '');
        if (in_array($status, ['done', 'rejected'], true) && $resolution === '') {
            throw new HttpError('INVALID', '처리 결과를 적어 주세요.', 422, 'resolution');
        }
        if (mb_strlen($resolution) > 3000) {
            throw new HttpError('INVALID', '처리 결과는 3,000자까지 적을 수 있습니다.', 422, 'resolution');
        }
        $final = in_array($status, ['done', 'rejected'], true);
        Db::exec(
            'UPDATE core_removal_requests SET status = ?, resolution = ?, handled_by = ?, handled_at = IF(?, NOW(3), handled_at) WHERE id = ?',
            [$status, $resolution === '' ? null : $resolution, $a->id(), $final ? 1 : 0, $x['id']]
        );
        $mailOk = null;
        if (!empty($b['notify']) && $status !== $x['status']) {
            $label = ['received' => '접수', 'reviewing' => '검토 중', 'done' => '삭제 처리 완료', 'rejected' => '반려'][$status];
            [$subj, $text, $html] = \Pp\Core\MailTemplate::render('removal_result', ['no' => (string) $x['no'], 'status' => $label, 'target' => (string) $x['target_url'], 'resolution' => $resolution]);
            $mailOk = Mail::send((string) $x['requester_email'], $subj, $text, $html);
        }
        Audit::log($a, 'removal.update', 'removal:' . $x['no'], ['status' => $x['status']], ['status' => $status, 'mail' => $mailOk]);
        $row = Db::row("{$removalSql} WHERE r.id = ?", [$x['id']]);
        Response::json($removalOut($row) + ['mail_sent' => $mailOk]);
    });

    // ---- 사용자·역할
    $r->get('/admin/users', function (array $p, Actor $a) use ($need, $like): void {
        $need($a, 'admin');
        [$page, $limit, $off] = Response::paging(30, 100);
        $where = ['u.deleted_at IS NULL'];
        $args = [];
        $kind = (string) ($_GET['kind'] ?? '');
        if (in_array($kind, ['staff', 'external'], true)) {
            $where[] = 'u.kind = ?';
            $args[] = $kind;
        }
        $st = (string) ($_GET['status'] ?? '');
        if (in_array($st, ['active', 'blocked', 'dormant'], true)) {
            $where[] = 'u.status = ?';
            $args[] = $st;
        }
        $role = (string) ($_GET['role'] ?? '');
        if (in_array($role, ['superadmin', 'admin', 'curator', 'support'], true)) {
            $where[] = 'EXISTS (SELECT 1 FROM core_user_roles rr WHERE rr.user_id = u.id AND rr.role = ?)';
            $args[] = $role;
        } elseif ($role === 'any') {
            $where[] = 'EXISTS (SELECT 1 FROM core_user_roles rr WHERE rr.user_id = u.id)';
        }
        $q = trim((string) ($_GET['q'] ?? ''));
        if ($q !== '') {
            $where[] = '(u.name LIKE ? OR u.email LIKE ?)';
            array_push($args, $like($q), $like($q));
        }
        $w = implode(' AND ', $where);
        $total = (int) Db::val("SELECT COUNT(*) FROM core_users u WHERE {$w}", $args);
        $rows = Db::rows("SELECT u.*, GREATEST(COALESCE(u.last_seen_at, '1970-01-01'), COALESCE((SELECT MAX(l.last_login_at) FROM core_user_logins l WHERE l.user_id = u.id), '1970-01-01')) AS last_active,
                                 (SELECT GROUP_CONCAT(rr.role) FROM core_user_roles rr WHERE rr.user_id = u.id) AS role_list
                          FROM core_users u WHERE {$w} ORDER BY last_active DESC, u.id DESC LIMIT {$limit} OFFSET {$off}", $args);
        $out = array_map(static function (array $u) use ($a): array {
            $last = (string) $u['last_active'];
            return [
                'id' => $u['public_id'], 'name' => $u['name'], 'email' => $u['email'], 'kind' => $u['kind'], 'status' => $u['status'] ?? 'active',
                'plan' => Users::plan($u), 'roles' => $u['role_list'] ? explode(',', (string) $u['role_list']) : [],
                'last_active' => str_starts_with($last, '1970') ? null : $last, 'created_at' => $u['created_at'],
                'dormant_requested_at' => $u['dormant_requested_at'] ?? null, 'access_until' => $u['access_until'] ?? null,
                'me' => (int) $u['id'] === $a->id(),
            ];
        }, $rows);
        Response::list($out, $total, $page, $limit, ['can_grant_admin' => in_array('superadmin', $a->roles, true)]);
    });

    $roleChange = static function (Actor $a, string $pid, string $role, bool $grant): void {
        if (!in_array($role, ADMIN_GRANTABLE, true)) {
            throw HttpError::invalid('화면에서 바꿀 수 없는 역할입니다.', 'superadmin 은 설정의 고정 계정에만 붙습니다.');
        }
        if ($role === 'admin' && !in_array('superadmin', $a->roles, true)) {
            throw HttpError::forbidden('admin 역할은 superadmin 만 부여·회수할 수 있습니다.');
        }
        $u = Users::byPublicId($pid);
        if (!$u) {
            throw HttpError::notFound('사용자');
        }
        if (!$grant && $role === 'admin' && (int) $u['id'] === $a->id()) {
            throw new HttpError('SELF_REVOKE', '자기 자신의 admin 역할은 회수할 수 없습니다.', 409);
        }
        $before = Users::roles((int) $u['id']);
        if ($grant) {
            Db::exec('INSERT IGNORE INTO core_user_roles (user_id, role, granted_by) VALUES (?,?,?)', [$u['id'], $role, $a->id()]);
        } else {
            Db::exec('DELETE FROM core_user_roles WHERE user_id = ? AND role = ?', [$u['id'], $role]);
        }
        $after = Users::roles((int) $u['id']);
        Audit::log($a, $grant ? 'role.grant' : 'role.revoke', 'user:' . $u['public_id'], ['roles' => $before], ['roles' => $after]);
        Response::json(['id' => $u['public_id'], 'roles' => $after]);
    };

    $r->post('/admin/users/{id}/roles', function (array $p, Actor $a) use ($need, $roleChange): void {
        $need($a, 'admin');
        $roleChange($a, (string) $p['id'], (string) (Response::input()['role'] ?? ''), true);
    });
    $r->delete('/admin/users/{id}/roles/{role}', function (array $p, Actor $a) use ($need, $roleChange): void {
        $need($a, 'admin');
        $roleChange($a, (string) $p['id'], (string) $p['role'], false);
    });

    // ================================================================ 모듈 운영 (기획 §9.2 powerAssets·powerDeck·powerMock)

    // ---- 에셋 — curator 이상. 관리자는 등급과 무관하게 전부 본다(Access::whereVisible 이 admin 을 1=1 로 둔다).
    $r->get('/admin/assets', function (array $p, Actor $a) use ($need, $like): void {
        $need($a, 'curator');
        [$page, $limit, $off] = Response::paging(48, 120);
        $where = ['i.deleted_at IS NULL'];
        $args = [];
        // 글자 박힌 목업 샘플(mockup_sample)은 superadmin 에게만 보인다(사용자 2026-10-06 "최고 관리자에게만")
        $super = in_array('superadmin', $a->roles, true);
        if (!$super) {
            $where[] = "i.category <> 'mockup_sample'";
        }
        $cat = (string) ($_GET['category'] ?? '');
        if (in_array($cat, AssetService::CATEGORIES, true) && ($super || $cat !== 'mockup_sample')) {
            $where[] = 'i.category = ?';
            $args[] = $cat;
        }
        // 목업 샘플은 자기 분류에서만 — 전체·다른 분류 목록에 섞이지 않게(사용자 2026-10-09 "카테고리 하나 따로 만들어서 관리")
        if ($cat !== 'mockup_sample') {
            $where[] = "i.category <> 'mockup_sample'";
        }
        $vis = (string) ($_GET['visibility'] ?? '');
        if (in_array($vis, ASSET_VIS_ALL, true)) {
            $where[] = 'i.visibility = ?';
            $args[] = $vis;
        }
        foreach (AssetService::tokens((string) ($_GET['q'] ?? '')) as $tok) {
            $where[] = "(LOWER(COALESCE(i.name,'')) LIKE ? OR i.public_id = ? OR EXISTS (SELECT 1 FROM asset_tags t WHERE t.item_id = i.id AND t.tag LIKE ?))";
            array_push($args, $like($tok), $tok, $like($tok));
        }
        $w = implode(' AND ', $where);
        $total = (int) Db::val("SELECT COUNT(*) FROM asset_items i WHERE {$w}", $args);
        $rows = Db::rows("SELECT i.public_id, i.category, i.name, i.alt, i.visibility, i.ai_generated, i.created_at, i.updated_at
                          FROM asset_items i WHERE {$w} ORDER BY i.created_at DESC, i.id DESC LIMIT {$limit} OFFSET {$off}", $args);
        $counts = [];
        foreach (Db::rows('SELECT visibility, COUNT(*) AS n FROM asset_items WHERE deleted_at IS NULL' . ($super ? '' : " AND category <> 'mockup_sample'") . ' GROUP BY visibility') as $c) {
            $counts[$c['visibility']] = (int) $c['n'];
        }
        $out = array_map(static fn (array $x): array => [
            'id' => $x['public_id'], 'category' => $x['category'], 'category_ko' => AssetService::CATEGORY_KO[$x['category']] ?? $x['category'],
            'name' => $x['name'] ?: ($x['alt'] ?: null), 'visibility' => $x['visibility'], 'ai' => (bool) $x['ai_generated'],
            'created_at' => $x['created_at'], 'updated_at' => $x['updated_at'], 'thumb_url' => AssetService::fileUrl($x['public_id'], 'thumb'),
        ], $rows);
        // 화면이 고를 수 있는 등급 — curator 는 internal 로 올리기만(낮추기는 admin 이상, 기획 §12.2)
        $allowed = $a->isAdmin() ? ASSET_VIS_SET : ['internal'];
        Response::list($out, $total, $page, $limit, ['counts' => $counts, 'allowed' => $allowed]);
    });

    // 공개 등급 일괄 변경 — 에셋마다 감사 기록 하나(before·after). curator 는 internal 로만.
    $r->post('/admin/assets/visibility', function (array $p, Actor $a) use ($need): void {
        $need($a, 'curator');
        $b = Response::input();
        $to = (string) ($b['visibility'] ?? '');
        if (!in_array($to, ASSET_VIS_SET, true)) {
            throw HttpError::invalid('바꿀 등급을 골라 주세요.', 'internal · pro · free · public 중 하나');
        }
        if (!$a->isAdmin() && $to !== 'internal') {
            throw HttpError::forbidden('큐레이터는 사내 전용(internal)으로 올리기만 할 수 있습니다.');
        }
        $ids = array_values(array_unique(array_filter(array_map('strval', (array) ($b['ids'] ?? [])), static fn (string $s): bool => preg_match('/^[A-Za-z0-9_-]{4,32}$/', $s) === 1)));
        if ($ids === []) {
            throw HttpError::invalid('바꿀 에셋을 골라 주세요.');
        }
        if (count($ids) > 200) {
            throw HttpError::invalid('한 번에 200개까지 바꿀 수 있습니다.');
        }
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $rows = Db::rows("SELECT id, public_id, visibility, category FROM asset_items WHERE deleted_at IS NULL AND public_id IN ({$ph})", $ids);
        $changed = 0;
        $skipped = 0;
        $blocked = 0;
        foreach ($rows as $x) {
            if ($x['visibility'] === $to) {
                $skipped++;
                continue;
            }
            if ($x['category'] === 'ppt' && $to !== 'internal') {   // 장표는 영구 임직원 전용 — 일괄 변경에서도 넓히지 않는다(사용자 2026-10-16)
                $blocked++;
                continue;
            }
            // 개인 소유(private)를 internal 로 바꾸면 오히려 넓어진다 — curator 는 손대지 못한다
            if (!$a->isAdmin() && $x['visibility'] === 'private') {
                $blocked++;
                continue;
            }
            Db::exec('UPDATE asset_items SET visibility = ? WHERE id = ?', [$to, $x['id']]);
            Audit::log($a, 'asset.visibility', 'asset:' . $x['public_id'], ['visibility' => $x['visibility']], ['visibility' => $to]);
            $changed++;
        }
        Response::json(['changed' => $changed, 'skipped' => $skipped, 'blocked' => $blocked, 'missing' => count($ids) - count($rows), 'visibility' => $to]);
    });

    // ---- 장표 작업 — admin 이상. deck_jobs 는 옛 스키마(주인 = email) 라 사용자 표와 email 로 잇는다.
    $r->get('/admin/deck/jobs', function (array $p, Actor $a) use ($need, $like): void {
        $need($a, 'admin');
        [$page, $limit, $off] = Response::paging(30, 100);
        $where = ['1=1'];
        $args = [];
        $st = (string) ($_GET['status'] ?? '');
        if ($st !== '' && preg_match('/^[a-z_]{2,16}$/', $st) === 1) {
            $where[] = 'j.status = ?';
            $args[] = $st;
        }
        $q = trim((string) ($_GET['q'] ?? ''));
        if ($q !== '') {
            $where[] = '(j.title LIKE ? OR j.filename LIKE ? OR j.email LIKE ? OR j.id = ?)';
            array_push($args, $like($q), $like($q), $like($q), $q);
        }
        $w = implode(' AND ', $where);
        $total = (int) Db::val("SELECT COUNT(*) FROM deck_jobs j WHERE {$w}", $args);
        $rows = Db::rows("SELECT j.id, j.title, j.filename, j.email, j.status, j.stage, j.progress, j.slides, j.kind, j.phase, j.worker, j.error,
                                 j.spent_usd, j.created_at, j.finished_at, u.name AS owner_name
                          FROM deck_jobs j LEFT JOIN core_users u ON u.email = j.email AND u.deleted_at IS NULL
                          WHERE {$w} ORDER BY j.created_at DESC LIMIT {$limit} OFFSET {$off}", $args);
        $counts = [];
        foreach (Db::rows('SELECT status, COUNT(*) AS n FROM deck_jobs GROUP BY status') as $c) {
            $counts[$c['status']] = (int) $c['n'];
        }
        $out = array_map(static fn (array $x): array => [
            'id' => $x['id'], 'title' => $x['title'], 'filename' => $x['filename'], 'email' => $x['email'], 'owner' => $x['owner_name'],
            'status' => $x['status'], 'stage' => $x['stage'], 'progress' => (int) $x['progress'], 'slides' => $x['slides'] === null ? null : (int) $x['slides'],
            'kind' => $x['kind'], 'phase' => $x['phase'], 'worker' => $x['worker'],
            'error' => $x['error'] === null ? null : mb_substr((string) $x['error'], 0, 600),
            'spent_usd' => (float) $x['spent_usd'], 'created_at' => $x['created_at'], 'finished_at' => $x['finished_at'],
            'url' => '/deck/jobs?id=' . rawurlencode((string) $x['id']),
        ], $rows);
        Response::list($out, $total, $page, $limit, ['counts' => $counts]);
    });

    // ---- 시안 — admin 이상. 점수·판정·게시·폐기·갤러리 상태.
    $r->get('/admin/mockups', function (array $p, Actor $a) use ($need, $like): void {
        $need($a, 'admin');
        [$page, $limit, $off] = Response::paging(30, 100);
        $where = ['m.deleted_at IS NULL'];
        $args = [];
        $where[] = match ((string) ($_GET['state'] ?? '')) {
            'passed' => 'm.passed = 1',
            'failed' => 'm.passed = 0',
            'unchecked' => 'm.passed IS NULL',
            'published' => 'm.published_at IS NOT NULL',
            'discarded' => 'm.discarded_at IS NOT NULL',
            'shared' => "g.status = 'shared'",
            default => '1=1',
        };
        $q = trim((string) ($_GET['q'] ?? ''));
        if ($q !== '') {
            $where[] = '(m.title LIKE ? OR m.ref_id LIKE ? OR u.email LIKE ? OR u.name LIKE ? OR m.public_id = ?)';
            array_push($args, $like($q), $like($q), $like($q), $like($q), $q);
        }
        $w = implode(' AND ', $where);
        $from = 'FROM mock_mockups m LEFT JOIN core_users u ON u.id = m.owner_user_id LEFT JOIN mock_gallery g ON g.mockup_id = m.id';
        $total = (int) Db::val("SELECT COUNT(*) {$from} WHERE {$w}", $args);
        $rows = Db::rows("SELECT m.public_id, m.token, m.title, m.ref_id, m.device, m.score, m.passed, m.check_count, m.published_at, m.discarded_at, m.expires_at, m.created_at,
                                 u.name AS owner_name, u.email AS owner_email, g.id AS g_id, g.status AS g_status, g.likes AS g_likes
                          {$from} WHERE {$w} ORDER BY m.created_at DESC LIMIT {$limit} OFFSET {$off}", $args);
        $c = Db::row("SELECT COUNT(*) AS total, SUM(m.passed = 1) AS passed, SUM(m.passed = 0) AS failed, SUM(m.published_at IS NOT NULL) AS published,
                             SUM(m.discarded_at IS NOT NULL) AS discarded, SUM(g.status = 'shared') AS shared
                      FROM mock_mockups m LEFT JOIN mock_gallery g ON g.mockup_id = m.id WHERE m.deleted_at IS NULL") ?? [];
        $out = array_map(static fn (array $x): array => [
            'id' => $x['public_id'], 'title' => $x['title'] !== '' ? $x['title'] : null, 'ref_id' => $x['ref_id'], 'device' => $x['device'],
            'score' => $x['score'] === null ? null : (int) $x['score'], 'passed' => $x['passed'] === null ? null : (bool) $x['passed'],
            'checks' => (int) $x['check_count'], 'published' => $x['published_at'] !== null, 'discarded' => $x['discarded_at'] !== null,
            'owner' => $x['owner_name'], 'owner_email' => $x['owner_email'], 'created_at' => $x['created_at'], 'expires_at' => $x['expires_at'],
            'gallery' => $x['g_id'] ? ['id' => (int) $x['g_id'], 'status' => $x['g_status'], 'likes' => (int) $x['g_likes']] : null,
            'preview_url' => '/api/v1/mock/mockups/' . $x['token'] . '/html',
            'public_url' => $x['published_at'] !== null ? '/p/' . $x['token'] : null,
        ], $rows);
        Response::list($out, $total, $page, $limit, ['counts' => array_map('intval', $c)]);
    });

    // 갤러리 공개 해제 — 공유(shared) → 학습 보관(study). 시안 자체와 점수는 그대로.
    $r->post('/admin/mockups/{id}/unshare', function (array $p, Actor $a) use ($need): void {
        $need($a, 'admin');
        $g = Db::row('SELECT g.id, g.status, m.public_id FROM mock_gallery g JOIN mock_mockups m ON m.id = g.mockup_id WHERE m.public_id = ?', [(string) $p['id']]);
        if (!$g) {
            throw HttpError::notFound('갤러리 항목');
        }
        if ($g['status'] !== 'shared') {
            throw new HttpError('NOT_SHARED', '갤러리에 공개된 시안이 아닙니다.', 409);
        }
        Db::exec("UPDATE mock_gallery SET status = 'study' WHERE id = ?", [(int) $g['id']]);
        Audit::log($a, 'mock.gallery.unshare', 'mockup:' . $g['public_id'], ['gallery' => 'shared'], ['gallery' => 'study']);
        Response::json(['id' => $g['public_id'], 'gallery' => 'study']);
    });

    // ================================================================ 장표 운영 상세(기획 §9.2 powerDeck > 작업·엔진·품질) — admin 이상
    // deck_jobs 는 옛 파워덱 스키마(id CHAR(16)·주인 email·shared 0~3). 파일은 Legacy::dataDir()/jobs/<id>/<kind>/.
    $deckId = static function (string $s): string {
        if (preg_match('/^[0-9a-f]{16}$/', $s) !== 1) {
            throw HttpError::notFound('장표 작업');
        }
        return $s;
    };
    $deckRow = static function (string $id): array {
        $j = Db::row('SELECT j.*, u.public_id AS owner_pid, u.name AS owner_name FROM deck_jobs j LEFT JOIN core_users u ON u.email = j.email AND u.deleted_at IS NULL WHERE j.id = ?', [$id]);
        if (!$j) {
            throw HttpError::notFound('장표 작업');
        }
        return $j;
    };
    $deckOut = static function (array $j): array {
        $files = Db::rows('SELECT kind, slide, name, size, created_at FROM deck_job_files WHERE job_id = ? ORDER BY kind, slide, name', [$j['id']]);
        $events = Db::rows('SELECT id, ts, kind, message FROM deck_job_events WHERE job_id = ? ORDER BY id DESC LIMIT 30', [$j['id']]);
        $bytes = 0;
        $byKind = [];
        foreach ($files as $f) {
            $bytes += (int) $f['size'];
            $byKind[$f['kind']] = ($byKind[$f['kind']] ?? 0) + 1;
        }
        $dur = null;
        if ($j['started_at'] && $j['finished_at']) {
            $dur = max(0, strtotime((string) $j['finished_at']) - strtotime((string) $j['started_at']));
        }
        $opts = !empty($j['opts']) ? json_decode((string) $j['opts'], true) : null;
        return [
            'id' => $j['id'], 'title' => $j['title'], 'filename' => $j['filename'], 'size' => (int) $j['size'],
            'email' => $j['email'], 'owner' => $j['owner_name'] ?? null, 'owner_id' => $j['owner_pid'] ?? null,
            'status' => $j['status'], 'stage' => $j['stage'], 'progress' => (int) $j['progress'],
            'slides' => $j['slides'] === null ? null : (int) $j['slides'], 'kind' => $j['kind'], 'source_kind' => $j['source_kind'],
            'phase' => $j['phase'], 'pilot_slide' => $j['pilot_slide'] === null ? null : (int) $j['pilot_slide'],
            'worker' => $j['worker'], 'cancel_requested' => (bool) $j['cancel_requested'],
            'error' => $j['error'], 'note' => $j['note'], 'feedback' => $j['feedback'], 'theme' => $j['theme'],
            'shared' => (int) $j['shared'], 'result_name' => $j['result_name'],
            'budget_usd' => $j['budget_usd'] === null ? null : (float) $j['budget_usd'], 'spent_usd' => round((float) $j['spent_usd'], 4),
            'opts' => is_array($opts) ? $opts : null,
            'created_at' => $j['created_at'], 'claimed_at' => $j['claimed_at'], 'heartbeat_at' => $j['heartbeat_at'],
            'started_at' => $j['started_at'], 'finished_at' => $j['finished_at'], 'deleted_at' => $j['deleted_at'] ?? null,
            'duration_sec' => $dur,
            'files' => ['count' => count($files), 'bytes' => $bytes, 'by_kind' => $byKind,
                'items' => array_map(static fn (array $f): array => ['kind' => $f['kind'], 'slide' => $f['slide'] === null ? null : (int) $f['slide'], 'name' => $f['name'], 'size' => (int) $f['size'], 'created_at' => $f['created_at']], $files)],
            'events' => array_map(static fn (array $e): array => ['id' => (int) $e['id'], 'ts' => $e['ts'], 'kind' => $e['kind'], 'message' => $e['message']], $events),
            'url' => '/deck/jobs?id=' . rawurlencode((string) $j['id']),
        ];
    };
    /** 작업 파일 폴더 통째 삭제(파일 레코드 포함). 작업·기록 행은 남긴다. */
    $deckWipeFiles = static function (string $id): int {
        $n = (int) Db::val('SELECT COUNT(*) FROM deck_job_files WHERE job_id = ?', [$id]);
        Db::exec('DELETE FROM deck_job_files WHERE job_id = ?', [$id]);
        $root = \Pp\Deck\Legacy::dataDir() . '/jobs/' . $id;
        if (is_dir($root)) {
            $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS), \RecursiveIteratorIterator::CHILD_FIRST);
            foreach ($it as $f) {
                $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
            }
            @rmdir($root);
        }
        return $n;
    };

    $r->get('/admin/deck/jobs/{id}', function (array $p, Actor $a) use ($need, $deckId, $deckRow, $deckOut): void {
        $need($a, 'admin');
        Response::json($deckOut($deckRow($deckId((string) $p['id']))));
    });

    // 취소 — 대기·확인·보류는 즉시 canceled, 진행 중이면 cancel_requested(엔진이 단계를 마치고 멈춘다. Jobs::claim 이 90초 뒤 회수)
    $r->post('/admin/deck/jobs/{id}/cancel', function (array $p, Actor $a) use ($need, $deckId, $deckRow, $deckOut): void {
        $need($a, 'admin');
        $j = $deckRow($deckId((string) $p['id']));
        $st = (string) $j['status'];
        if (in_array($st, ['queued', 'review', 'hold'], true)) {
            Db::exec("UPDATE deck_jobs SET status = 'canceled', finished_at = NOW() WHERE id = ?", [$j['id']]);
            Db::exec("INSERT INTO deck_job_events (job_id, ts, kind, message) VALUES (?, NOW(), 'warn', '관리자가 작업을 취소했습니다.')", [$j['id']]);
        } elseif ($st === 'running') {
            Db::exec('UPDATE deck_jobs SET cancel_requested = 1 WHERE id = ?', [$j['id']]);
            Db::exec("INSERT INTO deck_job_events (job_id, ts, kind, message) VALUES (?, NOW(), 'warn', '관리자가 취소를 요청했습니다. 엔진이 현재 단계를 마치는 대로 멈춥니다.')", [$j['id']]);
        } else {
            throw new HttpError('CONFLICT', '취소할 수 있는 상태가 아닙니다.', 409, '대기·확인·보류·진행 중인 작업만 취소합니다.');
        }
        Audit::log($a, 'deck.job.cancel', 'deck_job:' . $j['id'], ['status' => $st], ['status' => $st === 'running' ? 'running(cancel_requested)' : 'canceled']);
        Response::json($deckOut($deckRow((string) $j['id'])));
    });

    // 재실행 — 실패·취소(·완료) 작업을 같은 원본으로 대기열에. 관리자 경로라 사용자 동시 작업 한도·크레딧 검사는 건너뛴다.
    $r->post('/admin/deck/jobs/{id}/requeue', function (array $p, Actor $a) use ($need, $deckId, $deckRow, $deckOut): void {
        $need($a, 'admin');
        $j = $deckRow($deckId((string) $p['id']));
        $st = (string) $j['status'];
        if (!in_array($st, ['failed', 'canceled', 'done'], true)) {
            throw new HttpError('CONFLICT', '실패·취소·완료된 작업만 다시 돌릴 수 있습니다.', 409);
        }
        if ((string) $j['kind'] === 'polish' && !is_file(\Pp\Deck\Legacy::dataDir() . '/jobs/' . $j['id'] . '/source/source.pptx')) {
            throw new HttpError('CONFLICT', '원본 파일이 없어 다시 돌릴 수 없습니다.', 409, '파일이 지워진 작업입니다.');
        }
        Db::exec("UPDATE deck_jobs SET status = 'queued', stage = NULL, progress = 0, worker = NULL, claimed_at = NULL, heartbeat_at = NULL,
                  started_at = NULL, finished_at = NULL, error = NULL, cancel_requested = 0, created_at = NOW() WHERE id = ?", [$j['id']]);
        Db::exec("INSERT INTO deck_job_events (job_id, ts, kind, message) VALUES (?, NOW(), 'info', '관리자가 다시 돌리기 — 대기열에 다시 올렸습니다.')", [$j['id']]);
        Audit::log($a, 'deck.job.requeue', 'deck_job:' . $j['id'], ['status' => $st], ['status' => 'queued']);
        Response::json($deckOut($deckRow((string) $j['id'])));
    });

    // 삭제 — 상태 deleted + deleted_at, 파일(deck_job_files·storage)은 지운다. 작업 행·기록·과금은 남긴다(사용 통계 대조).
    $r->delete('/admin/deck/jobs/{id}', function (array $p, Actor $a) use ($need, $deckId, $deckRow, $deckWipeFiles): void {
        $need($a, 'admin');
        $j = $deckRow($deckId((string) $p['id']));
        $st = (string) $j['status'];
        if ($st === 'running') {
            throw new HttpError('CONFLICT', '진행 중인 작업은 먼저 취소한 뒤 지울 수 있습니다.', 409);
        }
        if ($st === 'deleted') {
            throw new HttpError('CONFLICT', '이미 지운 작업입니다.', 409);
        }
        $n = $deckWipeFiles((string) $j['id']);
        Db::exec("UPDATE deck_jobs SET status = 'deleted', deleted_at = NOW(), deleted_by = ?, worker = NULL, cancel_requested = 0 WHERE id = ?", [$a->id(), $j['id']]);
        Db::exec("INSERT INTO deck_job_events (job_id, ts, kind, message) VALUES (?, NOW(), 'warn', '관리자가 작업과 파일을 지웠습니다.')", [$j['id']]);
        Audit::log($a, 'deck.job.delete', 'deck_job:' . $j['id'], ['status' => $st, 'files' => $n], ['status' => 'deleted']);
        Response::json(['id' => $j['id'], 'status' => 'deleted', 'files_removed' => $n]);
    });

    // 공유 수준(0 끔 · 1 로그인 의견 · 2 로그인 편집 · 3 링크만 있으면 보기)·소유자 이메일 변경
    $r->patch('/admin/deck/jobs/{id}', function (array $p, Actor $a) use ($need, $deckId, $deckRow, $deckOut): void {
        $need($a, 'admin');
        $j = $deckRow($deckId((string) $p['id']));
        $b = Response::input();
        $sets = [];
        $args = [];
        $before = [];
        $after = [];
        if (array_key_exists('shared', $b)) {
            $sh = (int) $b['shared'];
            if ($sh < 0 || $sh > 3) {
                throw HttpError::invalid('공유 수준은 0~3 입니다.', '0 끔 · 1 로그인 의견 · 2 로그인 편집 · 3 링크만 있으면 보기');
            }
            if ($sh !== (int) $j['shared']) {
                $sets[] = 'shared = ?';
                $args[] = $sh;
                $before['shared'] = (int) $j['shared'];
                $after['shared'] = $sh;
            }
        }
        if (array_key_exists('email', $b)) {
            $email = strtolower(trim((string) $b['email']));
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                throw new HttpError('INVALID', '이메일 형식이 올바르지 않습니다.', 422, 'email');
            }
            $u = Db::row('SELECT id FROM core_users WHERE email = ? AND deleted_at IS NULL', [$email]);
            if (!$u) {
                throw new HttpError('INVALID', '그 이메일로 가입한 사용자가 없습니다.', 422, 'email');
            }
            if ($email !== (string) $j['email']) {
                $sets[] = 'email = ?';
                $args[] = $email;
                $before['email'] = $j['email'];
                $after['email'] = $email;
            }
        }
        if ($sets !== []) {
            $args[] = $j['id'];
            Db::exec('UPDATE deck_jobs SET ' . implode(', ', $sets) . ' WHERE id = ?', $args);
            Audit::log($a, 'deck.job.update', 'deck_job:' . $j['id'], $before, $after);
        }
        Response::json($deckOut($deckRow((string) $j['id'])));
    });

    // 엔진 상태 — deck_workers 전부(2분 안에 통신 = 온라인, Jobs::engine 과 같은 기준) + 대기열
    $r->get('/admin/deck/engines', function (array $p, Actor $a) use ($need): void {
        $need($a, 'admin');
        $workers = Db::rows('SELECT name, info, seen_at, (seen_at > (NOW() - INTERVAL 2 MINUTE)) AS online,
                                    (SELECT COUNT(*) FROM deck_jobs j WHERE j.worker = w.name AND j.status = \'running\') AS running
                             FROM deck_workers w ORDER BY online DESC, seen_at DESC', []);
        $q = Db::row("SELECT SUM(status = 'queued') AS queued, SUM(status = 'running') AS running, SUM(status = 'hold') AS hold, SUM(status = 'review') AS review,
                             MIN(IF(status = 'queued', created_at, NULL)) AS oldest_queued,
                             SUM(status = 'running' AND heartbeat_at < (NOW() - INTERVAL 5 MINUTE)) AS stale
                      FROM deck_jobs") ?? [];
        Response::json([
            'online' => count(array_filter($workers, static fn (array $w): bool => (int) $w['online'] === 1)) > 0,
            'workers' => array_map(static fn (array $w): array => ['name' => $w['name'], 'info' => $w['info'], 'seen_at' => $w['seen_at'], 'online' => (int) $w['online'] === 1, 'running' => (int) $w['running']], $workers),
            'queue' => ['queued' => (int) ($q['queued'] ?? 0), 'running' => (int) ($q['running'] ?? 0), 'hold' => (int) ($q['hold'] ?? 0), 'review' => (int) ($q['review'] ?? 0),
                'stale' => (int) ($q['stale'] ?? 0), 'oldest_queued' => $q['oldest_queued'] ?? null],
        ]);
    });

    // 서버 연결 상태 — 대시보드 맨 위 띠(30초마다). 값(키·주소)은 내보내지 않고 상태만.
    $r->get('/admin/system', function (array $p, Actor $a) use ($need): void {
        $need($a, 'admin');
        $t = microtime(true);
        $db = false;
        try { $db = (int) Db::val('SELECT 1') === 1; } catch (\Throwable) {}
        $dbMs = (int) round((microtime(true) - $t) * 1000);
        $eng = Db::row("SELECT COUNT(*) AS n, SUM(seen_at > (NOW() - INTERVAL 2 MINUTE)) AS online, MAX(seen_at) AS last FROM deck_workers") ?? [];
        $q = Db::row("SELECT SUM(status = 'queued') AS queued, SUM(status = 'running') AS running FROM deck_jobs") ?? [];
        $ai = false;
        try { $ai = \Pp\Deck\AiKeys::serverKey() !== null; } catch (\Throwable) {}
        $jev = 0.0;
        try { $jev = \Pp\Core\Jev::spentToday(); } catch (\Throwable) {}
        $mcpUrl = (string) Config::get('mcp.health_url', 'http://127.0.0.1:3110/mcp/health');
        $mcp = null;
        $ch = curl_init($mcpUrl);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT_MS => 700, CURLOPT_TIMEOUT_MS => 1200]);
        $raw = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        unset($ch); // curl_close 폐기 예고(8.5) — 핸들은 범위를 벗어나면 닫힌다
        if ($raw !== false && $code === 200) {
            $d = json_decode((string) $raw, true);
            $mcp = ['version' => $d['version'] ?? null, 'tools' => $d['tools'] ?? null];
        }
        Response::json([
            'checked_at' => date('c'),
            'api' => ['ok' => true, 'php' => PHP_VERSION],
            'db' => ['ok' => $db, 'ms' => $dbMs],
            'engine' => ['ok' => (int) ($eng['online'] ?? 0) > 0, 'online' => (int) ($eng['online'] ?? 0), 'total' => (int) ($eng['n'] ?? 0),
                'last_seen' => $eng['last'] ?? null, 'queued' => (int) ($q['queued'] ?? 0), 'running' => (int) ($q['running'] ?? 0)],
            'ai' => ['ok' => $ai, 'jev_today_usd' => round($jev, 4)],
            'mail' => ['ok' => (string) Config::get('smtp.host', '') !== ''],
            'mcp' => ['ok' => $mcp !== null] + ($mcp ?? []),
        ]);
    });

    // 일별 작업 통계(차트) — 만든 날 기준 건수·완료·실패, 완료 작업 평균 소요(초). 빈 날은 0 으로 채운다.
    $r->get('/admin/deck/stats', function (array $p, Actor $a) use ($need): void {
        $need($a, 'admin');
        $days = max(1, min(180, (int) ($_GET['days'] ?? 30)));
        $rows = Db::rows("SELECT DATE(created_at) AS d, COUNT(*) AS total, SUM(status = 'done') AS done, SUM(status = 'failed') AS failed,
                                 SUM(status = 'canceled') AS canceled, SUM(spent_usd) AS spent,
                                 AVG(IF(status = 'done' AND started_at IS NOT NULL AND finished_at IS NOT NULL, TIMESTAMPDIFF(SECOND, started_at, finished_at), NULL)) AS avg_sec
                          FROM deck_jobs WHERE created_at >= (CURDATE() - INTERVAL ? DAY) AND status <> 'deleted' GROUP BY DATE(created_at)", [$days - 1]);
        $by = [];
        foreach ($rows as $x) {
            $by[(string) $x['d']] = $x;
        }
        $out = [];
        $t = new \DateTimeImmutable('today');
        for ($i = $days - 1; $i >= 0; $i--) {
            $d = $t->sub(new \DateInterval("P{$i}D"))->format('Y-m-d');
            $x = $by[$d] ?? null;
            $out[] = ['date' => $d, 'total' => (int) ($x['total'] ?? 0), 'done' => (int) ($x['done'] ?? 0), 'failed' => (int) ($x['failed'] ?? 0),
                'canceled' => (int) ($x['canceled'] ?? 0), 'spent_usd' => round((float) ($x['spent'] ?? 0), 4), 'avg_sec' => $x && $x['avg_sec'] !== null ? (int) round((float) $x['avg_sec']) : null];
        }
        $sum = Db::row("SELECT COUNT(*) AS total, SUM(status = 'done') AS done, SUM(status = 'failed') AS failed, SUM(spent_usd) AS spent,
                               AVG(IF(status = 'done' AND started_at IS NOT NULL AND finished_at IS NOT NULL, TIMESTAMPDIFF(SECOND, started_at, finished_at), NULL)) AS avg_sec
                        FROM deck_jobs WHERE created_at >= (CURDATE() - INTERVAL ? DAY) AND status <> 'deleted'", [$days - 1]) ?? [];
        $total = (int) ($sum['total'] ?? 0);
        $done = (int) ($sum['done'] ?? 0);
        Response::json([
            'days' => $days,
            'series' => $out,
            'summary' => ['total' => $total, 'done' => $done, 'failed' => (int) ($sum['failed'] ?? 0),
                'done_rate' => $total > 0 ? round($done * 100 / $total, 1) : null,
                'avg_sec' => isset($sum['avg_sec']) && $sum['avg_sec'] !== null ? (int) round((float) $sum['avg_sec']) : null,
                'spent_usd' => round((float) ($sum['spent'] ?? 0), 4)],
        ]);
    });

    // ================================================================ 대시보드 분석 (기획 §9.2 대시보드)
    // 출처: 옛 파워플러스 UsageService::analytics(핵심 3지표·추이·요일×시간·카테고리 실사용·TOP) — 살아남은 지표만, 새 표(asset_uses·deck_jobs·mock_mockups)로.
    // 한 엔드포인트로 전부 돌려준다(라운드트립 1). 버킷 포맷은 화이트리스트, 집계는 SUM/GROUP BY 한 방씩. admin 이상.
    // ⚠ 로그인 이력 표가 없어 '로그인' 추이는 core_user_logins.last_login_at(사용자별 마지막 로그인)으로 센다 — 과거 구간은 실제보다 적게 보인다.
    $r->get('/admin/analytics', function (array $p, Actor $a) use ($need): void {
        $need($a, 'admin');
        $period = (string) ($_GET['period'] ?? 'month');
        $period = in_array($period, ['day', 'year'], true) ? $period : 'month';
        [$fmt, $n] = match ($period) {
            'day' => ['%Y-%m-%d', 30],
            'year' => ['%Y', 5],
            default => ['%Y-%m', 12],
        };
        $safeRows = static function (string $sql, array $args = []): array {
            try {
                return Db::rows($sql, $args);
            } catch (\Throwable) {
                return [];
            }
        };
        $safeRow = static function (string $sql, array $args = []): array {
            try {
                return Db::row($sql, $args) ?? [];
            } catch (\Throwable) {
                return [];
            }
        };
        // 이메일 마스킹 — 앞 2글자 + *** + @도메인(개인 이메일 전체 노출 금지)
        $mask = static function (?string $e): ?string {
            if ($e === null || $e === '') {
                return null;
            }
            $at = strpos($e, '@');
            $local = $at === false ? $e : substr($e, 0, $at);
            $domain = $at === false ? '' : substr($e, $at);
            return mb_substr($local, 0, 2) . '***' . $domain;
        };

        // ---- 핵심 3지표 (옛 발표 지표: 누적 삽입 / 최근 30일 / 상위 3명 비중)
        $tot = $safeRow('SELECT COUNT(*) AS n, COUNT(DISTINCT user_id) AS users FROM asset_uses');
        $m30 = $safeRow('SELECT COUNT(*) AS n, COUNT(DISTINCT user_id) AS users FROM asset_uses WHERE created_at >= NOW(3) - INTERVAL 30 DAY');
        $prev30 = $safeRow('SELECT COUNT(*) AS n FROM asset_uses WHERE created_at >= NOW(3) - INTERVAL 60 DAY AND created_at < NOW(3) - INTERVAL 30 DAY');
        $top3 = (int) ($safeRow('SELECT COALESCE(SUM(n),0) AS s FROM (SELECT COUNT(*) AS n FROM asset_uses WHERE user_id IS NOT NULL GROUP BY user_id ORDER BY n DESC LIMIT 3) t')['s'] ?? 0);
        $insTotal = (int) ($tot['n'] ?? 0);

        // ---- 추이: 버킷별 로그인·삽입·장표 작업·시안 판정(각 표 한 번씩 GROUP BY → 버킷 union, 최근 N개)
        $bucket = static fn (string $col): string => "DATE_FORMAT({$col}, '{$fmt}')";
        $series = [
            'logins' => $safeRows("SELECT {$bucket('last_login_at')} AS b, COUNT(DISTINCT user_id) AS n FROM core_user_logins WHERE last_login_at IS NOT NULL GROUP BY b"),
            'uses' => $safeRows("SELECT {$bucket('created_at')} AS b, COUNT(*) AS n FROM asset_uses GROUP BY b"),
            'deck' => $safeRows("SELECT {$bucket('created_at')} AS b, COUNT(*) AS n FROM deck_jobs GROUP BY b"),
            'mock' => $safeRows("SELECT {$bucket('checked_at')} AS b, COUNT(*) AS n FROM mock_mockups WHERE checked_at IS NOT NULL AND deleted_at IS NULL GROUP BY b"),
        ];
        $buckets = [];
        foreach ($series as $k => $rows) {
            foreach ($rows as $x) {
                $buckets[$x['b']][$k] = (int) $x['n'];
            }
        }
        ksort($buckets);
        $buckets = array_slice($buckets, -$n, null, true);
        $trend = [];
        foreach ($buckets as $b => $v) {
            $trend[] = ['bucket' => (string) $b, 'logins' => $v['logins'] ?? 0, 'uses' => $v['uses'] ?? 0, 'deck' => $v['deck'] ?? 0, 'mock' => $v['mock'] ?? 0];
        }

        // ---- 요일×시간 히트맵 (삽입, 7×24; DAYOFWEEK 1=일 … 7=토)
        $heat = array_fill(0, 7, array_fill(0, 24, 0));
        foreach ($safeRows('SELECT DAYOFWEEK(created_at) AS d, HOUR(created_at) AS h, COUNT(*) AS n FROM asset_uses GROUP BY d, h') as $x) {
            $heat[(int) $x['d'] - 1][(int) $x['h']] = (int) $x['n'];
        }

        // ---- 카테고리별 실사용(등록 수가 아니라 삽입된 수) + 등록 수
        $cats = [];
        foreach ($safeRows('SELECT i.category, COUNT(u.id) AS uses, COUNT(DISTINCT u.item_id) AS used_items FROM asset_uses u JOIN asset_items i ON i.id = u.item_id GROUP BY i.category') as $x) {
            $cats[$x['category']] = ['category' => $x['category'], 'category_ko' => AssetService::CATEGORY_KO[$x['category']] ?? $x['category'], 'uses' => (int) $x['uses'], 'used_items' => (int) $x['used_items'], 'items' => 0];
        }
        foreach ($safeRows('SELECT category, COUNT(*) AS n FROM asset_items WHERE deleted_at IS NULL GROUP BY category') as $x) {
            $cats[$x['category']] ??= ['category' => $x['category'], 'category_ko' => AssetService::CATEGORY_KO[$x['category']] ?? $x['category'], 'uses' => 0, 'used_items' => 0, 'items' => 0];
            $cats[$x['category']]['items'] = (int) $x['n'];
        }
        usort($cats, static fn (array $x, array $y): int => $y['uses'] <=> $x['uses']);

        // ---- TOP: 인기 에셋 10(존재하는 에셋만 — 삭제된 에셋은 빈 줄로 안 나온다) · 활발한 사용자 10(마스킹) · 최근 삽입 60(화면이 15씩 쪽 넘김)
        $topAssets = array_map(static fn (array $x): array => [
            'id' => $x['public_id'], 'name' => $x['name'] ?: ($x['alt'] ?: null), 'category' => $x['category'],
            'category_ko' => AssetService::CATEGORY_KO[$x['category']] ?? $x['category'], 'uses' => (int) $x['n'], 'thumb_url' => AssetService::fileUrl($x['public_id'], 'thumb'),
        ], $safeRows('SELECT i.public_id, i.name, i.alt, i.category, COUNT(*) AS n FROM asset_uses u JOIN asset_items i ON i.id = u.item_id AND i.deleted_at IS NULL GROUP BY i.id ORDER BY n DESC, i.id DESC LIMIT 10'));
        $topUsers = array_map(static fn (array $x): array => [
            'name' => $x['name'], 'email' => $mask($x['email']), 'kind' => $x['kind'], 'uses' => (int) $x['n'],
            'share' => $insTotal > 0 ? round((int) $x['n'] * 100 / $insTotal, 1) : 0,
        ], $safeRows('SELECT c.name, c.email, c.kind, COUNT(*) AS n FROM asset_uses u JOIN core_users c ON c.id = u.user_id GROUP BY c.id ORDER BY n DESC LIMIT 10'));
        $recent = array_map(static fn (array $x): array => [
            'at' => $x['created_at'], 'channel' => $x['channel'], 'user' => $x['uname'], 'email' => $mask($x['email']),
            'asset' => $x['public_id'] ? [
                'id' => $x['public_id'], 'name' => $x['name'] ?: ($x['alt'] ?: null), 'category_ko' => AssetService::CATEGORY_KO[$x['category']] ?? $x['category'],
                'thumb_url' => AssetService::fileUrl($x['public_id'], 'thumb'),
            ] : null,
        ], $safeRows('SELECT u.created_at, u.channel, c.name AS uname, c.email, i.public_id, i.name, i.alt, i.category
                      FROM asset_uses u LEFT JOIN core_users c ON c.id = u.user_id LEFT JOIN asset_items i ON i.id = u.item_id AND i.deleted_at IS NULL
                      ORDER BY u.id DESC LIMIT 60'));

        // ---- 모듈 종합(2026-10-06 재구성): 최근 30일 vs 직전 30일, 같은 비중으로
        $win = static fn (string $col): string => "SUM({$col} >= NOW(3) - INTERVAL 30 DAY) AS c30, SUM({$col} >= NOW(3) - INTERVAL 60 DAY AND {$col} < NOW(3) - INTERVAL 30 DAY) AS p30";
        $dk = $safeRow("SELECT {$win('created_at')},
                               SUM(created_at >= NOW(3) - INTERVAL 30 DAY AND status = 'done') AS done30,
                               SUM(created_at >= NOW(3) - INTERVAL 30 DAY AND status = 'failed') AS failed30,
                               SUM(status IN ('queued','running')) AS queue, COUNT(*) AS total
                        FROM deck_jobs WHERE deleted_at IS NULL");
        $mk = $safeRow("SELECT {$win('checked_at')},
                               AVG(CASE WHEN checked_at >= NOW(3) - INTERVAL 30 DAY THEN score END) AS avg30,
                               SUM(checked_at >= NOW(3) - INTERVAL 30 DAY AND passed = 1) AS pass30,
                               SUM(published_at IS NOT NULL) AS published, COUNT(*) AS total
                        FROM mock_mockups WHERE deleted_at IS NULL AND checked_at IS NOT NULL");
        $gal = $safeRow("SELECT COUNT(*) AS n, SUM(status = 'shared') AS shared FROM mock_gallery");
        $ux = $safeRow("SELECT COUNT(*) AS total, SUM(kind = 'staff') AS staff, SUM(kind <> 'staff') AS external FROM core_users WHERE deleted_at IS NULL");
        $activeSql = static fn (string $from, string $to): string =>
            "SELECT COUNT(DISTINCT uid) AS n FROM (
                SELECT user_id AS uid FROM asset_uses WHERE user_id IS NOT NULL AND created_at >= {$from} AND created_at < {$to}
                UNION SELECT cu.id FROM deck_jobs dj JOIN core_users cu ON cu.email = dj.email WHERE dj.created_at >= {$from} AND dj.created_at < {$to}
                UNION SELECT owner_user_id FROM mock_mockups WHERE owner_user_id IS NOT NULL AND created_at >= {$from} AND created_at < {$to}
                UNION SELECT user_id FROM core_user_logins WHERE last_login_at >= {$from} AND last_login_at < {$to}
             ) t";
        $act30 = (int) ($safeRow($activeSql('NOW(3) - INTERVAL 30 DAY', 'NOW(3) + INTERVAL 1 DAY'))['n'] ?? 0);
        $actP30 = (int) ($safeRow($activeSql('NOW(3) - INTERVAL 60 DAY', 'NOW(3) - INTERVAL 30 DAY'))['n'] ?? 0);
        $d30 = (int) ($dk['c30'] ?? 0);
        $modules = [
            'assets' => ['c30' => (int) ($m30['n'] ?? 0), 'p30' => (int) ($prev30['n'] ?? 0), 'users30' => (int) ($m30['users'] ?? 0), 'total' => $insTotal],
            'deck' => ['c30' => $d30, 'p30' => (int) ($dk['p30'] ?? 0), 'done30' => (int) ($dk['done30'] ?? 0), 'failed30' => (int) ($dk['failed30'] ?? 0),
                'done_pct' => $d30 > 0 ? round((int) ($dk['done30'] ?? 0) * 100 / $d30, 1) : 0, 'queue' => (int) ($dk['queue'] ?? 0), 'total' => (int) ($dk['total'] ?? 0)],
            'mock' => ['c30' => (int) ($mk['c30'] ?? 0), 'p30' => (int) ($mk['p30'] ?? 0), 'avg30' => $mk['avg30'] === null || !isset($mk['avg30']) ? null : round((float) $mk['avg30'], 1),
                'pass30' => (int) ($mk['pass30'] ?? 0), 'published' => (int) ($mk['published'] ?? 0), 'gallery' => (int) ($gal['n'] ?? 0), 'shared' => (int) ($gal['shared'] ?? 0), 'total' => (int) ($mk['total'] ?? 0)],
            'users' => ['total' => (int) ($ux['total'] ?? 0), 'staff' => (int) ($ux['staff'] ?? 0), 'external' => (int) ($ux['external'] ?? 0), 'active30' => $act30, 'active_p30' => $actP30],
        ];
        // ⚠ deck_jobs 는 옛 파워덱 스키마 그대로(소유자 = email 열, id = 문자열) — 사용자 연결은 email 로. 장표 상태 분포 · 시안 점수 구간 · 장표 최근 작업 · 실패 사유 · 시안 최근 판정
        $deckStatus = array_map(static fn (array $x): array => ['status' => $x['status'], 'n' => (int) $x['n']],
            $safeRows('SELECT status, COUNT(*) AS n FROM deck_jobs WHERE deleted_at IS NULL GROUP BY status ORDER BY n DESC'));
        $scoreBins = [];
        foreach (['0–59' => [0, 59], '60–69' => [60, 69], '70–79' => [70, 79], '80–89' => [80, 89], '90–100' => [90, 100]] as $label => [$lo, $hi]) {
            $scoreBins[] = ['bin' => $label, 'n' => (int) ($safeRow('SELECT COUNT(*) AS n FROM mock_mockups WHERE deleted_at IS NULL AND score BETWEEN ? AND ?', [$lo, $hi])['n'] ?? 0)];
        }
        $deckRecent = array_map(static fn (array $x): array => [
            'id' => (string) $x['id'], 'title' => $x['title'], 'status' => $x['status'], 'slides' => $x['slides'] === null ? null : (int) $x['slides'],
            'kind' => $x['kind'], 'user' => $x['uname'], 'email' => $mask($x['email']), 'at' => $x['created_at'], 'finished_at' => $x['finished_at'],
            'error' => $x['error'] ? mb_substr((string) $x['error'], 0, 120) : null,
        ], $safeRows('SELECT j.id, j.title, j.status, j.slides, j.kind, j.created_at, j.finished_at, j.error, c.name AS uname, j.email
                      FROM deck_jobs j LEFT JOIN core_users c ON c.email = j.email WHERE j.deleted_at IS NULL ORDER BY j.created_at DESC LIMIT 30'));
        $deckFail = array_map(static fn (array $x): array => ['reason' => $x['reason'], 'n' => (int) $x['n']],
            $safeRows("SELECT LEFT(COALESCE(NULLIF(TRIM(error),''),'(사유 없음)'), 60) AS reason, COUNT(*) AS n FROM deck_jobs WHERE deleted_at IS NULL AND status = 'failed' GROUP BY reason ORDER BY n DESC LIMIT 8"));
        $mockRecent = array_map(static fn (array $x): array => [
            'token' => $x['token'], 'title' => $x['title'], 'score' => $x['score'] === null ? null : (int) $x['score'], 'passed' => $x['passed'] === null ? null : (bool) $x['passed'],
            'device' => $x['device'], 'checks' => (int) $x['check_count'], 'published' => $x['published_at'] !== null, 'user' => $x['uname'], 'email' => $mask($x['email']), 'at' => $x['checked_at'],
        ], $safeRows('SELECT m.token, m.title, m.score, m.passed, m.device, m.check_count, m.published_at, m.checked_at, c.name AS uname, c.email
                      FROM mock_mockups m LEFT JOIN core_users c ON c.id = m.owner_user_id WHERE m.deleted_at IS NULL AND m.checked_at IS NOT NULL ORDER BY m.checked_at DESC LIMIT 30'));
        // 사용자 교차: 모듈별 건수(어느 한 모듈이라도 쓴 사람, 합계 순 20)
        $cross = array_map(static fn (array $x): array => [
            'name' => $x['name'], 'email' => $mask($x['email']), 'kind' => $x['kind'],
            'assets' => (int) $x['a'], 'deck' => (int) $x['d'], 'mock' => (int) $x['m'], 'total' => (int) $x['a'] + (int) $x['d'] + (int) $x['m'],
        ], $safeRows('SELECT c.name, c.email, c.kind,
                        (SELECT COUNT(*) FROM asset_uses u WHERE u.user_id = c.id) AS a,
                        (SELECT COUNT(*) FROM deck_jobs j WHERE j.email = c.email AND j.deleted_at IS NULL) AS d,
                        (SELECT COUNT(*) FROM mock_mockups m WHERE m.owner_user_id = c.id AND m.deleted_at IS NULL) AS m
                      FROM core_users c WHERE c.deleted_at IS NULL
                      HAVING a + d + m > 0 ORDER BY a + d + m DESC LIMIT 20'));

        Response::json([
            'period' => $period,
            'modules' => $modules,
            'deck_status' => $deckStatus,
            'score_bins' => $scoreBins,
            'deck_recent' => $deckRecent,
            'deck_fail' => $deckFail,
            'mock_recent' => $mockRecent,
            'cross_users' => $cross,
            'hero' => [
                'ins_total' => $insTotal, 'users_total' => (int) ($tot['users'] ?? 0),
                'ins_30' => (int) ($m30['n'] ?? 0), 'users_30' => (int) ($m30['users'] ?? 0), 'ins_prev_30' => (int) ($prev30['n'] ?? 0),
                'top3' => $top3, 'top3_pct' => $insTotal > 0 ? round($top3 * 100 / $insTotal, 1) : 0,
            ],
            'trend' => $trend,
            'heatmap' => $heat,
            'categories' => array_values($cats),
            'top_assets' => $topAssets,
            'top_users' => $topUsers,
            'recent' => $recent,
        ]);
    });

    // ================================================================ powerAssets 백오피스 (2026-10-06) — 등록·수정·삭제·세트·요청·검색 품질
    // 출처: powerPlus server/admin/index.html(에셋 등록·수정 모달·상세 패널·콘텐츠 요청·검색 품질) 의 동작을 REST v1 로. 판정·기록은 위 핸들러와 같은 규칙.
    $ASSET_TAG_MAX = 60;
    /** 태그 배열 정리 — 소문자·NFC·중복 제거·64자 컷(태그는 소문자로 저장돼 검색과 맞는다) */
    $cleanTags = static function (mixed $v) use ($ASSET_TAG_MAX): array {
        if (is_string($v)) {
            $v = preg_split('/[,\n]+/u', $v) ?: [];
        }
        $out = [];
        foreach ((array) $v as $t) {
            $t = mb_strtolower(trim((string) $t));
            if (class_exists('Normalizer')) {
                $t = \Normalizer::normalize($t, \Normalizer::FORM_C) ?: $t;
            }
            if ($t === '' || mb_strlen($t) > 64) {
                continue;
            }
            $out[$t] = true;
        }
        return array_slice(array_keys($out), 0, $ASSET_TAG_MAX);
    };
    /** 관리자 상세 응답 — 태그·파일·세트·사용·즐겨찾기 */
    $assetDetail = static function (array $x): array {
        $tags = ['ko' => [], 'en' => [], 'meta' => []];
        foreach (Db::rows('SELECT tag, lang, axis FROM asset_tags WHERE item_id = ? ORDER BY axis, lang, tag', [$x['id']]) as $t) {
            if ($t['axis'] === 'kw') {
                $tags[$t['lang']][] = $t['tag'];
            } else {
                $tags['meta'][] = $t['axis'] . ':' . $t['tag'];
            }
        }
        $files = array_map(static fn (array $f): array => [
            'kind' => $f['kind'], 'mime' => $f['mime'], 'bytes' => (int) $f['bytes'], 'w' => $f['w'] === null ? null : (int) $f['w'], 'h' => $f['h'] === null ? null : (int) $f['h'],
            'bucket' => $f['bucket'], 'url' => AssetService::fileUrl($x['public_id'], $f['kind']),
        ], Db::rows('SELECT af.kind, f.mime, f.bytes, f.w, f.h, f.bucket FROM asset_files af JOIN core_files f ON f.id = af.file_id WHERE af.item_id = ? ORDER BY af.kind', [$x['id']]));
        $set = $x['set_id'] ? Db::row('SELECT public_id, name, item_count FROM asset_sets WHERE id = ?', [$x['set_id']]) : null;
        return [
            'id' => $x['public_id'], 'category' => $x['category'], 'category_ko' => AssetService::CATEGORY_KO[$x['category']] ?? $x['category'],
            'name' => $x['name'], 'alt' => $x['alt'], 'visibility' => $x['visibility'], 'ai' => (bool) $x['ai_generated'],
            'w' => $x['w'] === null ? null : (int) $x['w'], 'h' => $x['h'] === null ? null : (int) $x['h'], 'source' => $x['source'],
            'slide_kind' => $x['slide_kind'], 'slide_page' => $x['slide_page'], 'style_group' => $x['style_group'], 'legacy_key' => $x['legacy_key'],
            'set' => $set ? ['id' => $set['public_id'], 'name' => $set['name'], 'count' => (int) $set['item_count']] : null,
            'tags' => $tags, 'files' => $files,
            'thumb_url' => AssetService::fileUrl($x['public_id'], 'thumb'), 'original_url' => AssetService::fileUrl($x['public_id'], 'original'),
            'uses' => (int) Db::val('SELECT COUNT(*) FROM asset_uses WHERE item_id = ?', [$x['id']]),
            'favorites' => (int) Db::val('SELECT COUNT(*) FROM asset_favorites WHERE item_id = ?', [$x['id']]),
            'created_at' => $x['created_at'], 'updated_at' => $x['updated_at'], 'deleted_at' => $x['deleted_at'],
        ];
    };
    /** 에셋 한 건 — 삭제된 것도 관리자는 본다(복원용). mockup_sample 은 superadmin 만. */
    $assetRow = static function (Actor $a, string $pid): array {
        $x = Db::row('SELECT * FROM asset_items WHERE public_id = ?', [$pid]);
        if (!$x || ($x['category'] === 'mockup_sample' && !in_array('superadmin', $a->roles, true))) {
            throw HttpError::notFound('에셋');
        }
        return $x;
    };
    /** 세트 공개 id → 내부 id(없으면 null). 빈 문자열이면 세트 해제. */
    $setIdOf = static function (mixed $v): ?int {
        $v = trim((string) $v);
        if ($v === '') {
            return null;
        }
        $id = Db::val('SELECT id FROM asset_sets WHERE public_id = ?', [$v]);
        if (!$id) {
            throw HttpError::invalid('세트를 찾을 수 없습니다.', 'set');
        }
        return (int) $id;
    };
    /** 세트 건수 재계산(살아 있는 에셋만) */
    $recount = static function (?int ...$setIds): void {
        foreach (array_unique(array_filter($setIds)) as $sid) {
            Db::exec('UPDATE asset_sets s SET item_count = (SELECT COUNT(*) FROM asset_items i WHERE i.set_id = s.id AND i.deleted_at IS NULL) WHERE s.id = ?', [$sid]);
        }
    };

    // 카테고리 라벨 + 건수(살아 있는 것·휴지통) — 화면 분류 고르기용
    $r->get('/admin/assets/categories', function (array $p, Actor $a) use ($need): void {
        $need($a, 'curator');
        $super = in_array('superadmin', $a->roles, true);
        $live = array_column(Db::rows('SELECT category, COUNT(*) n FROM asset_items WHERE deleted_at IS NULL GROUP BY category'), 'n', 'category');
        $gone = array_column(Db::rows('SELECT category, COUNT(*) n FROM asset_items WHERE deleted_at IS NOT NULL GROUP BY category'), 'n', 'category');
        $out = [];
        foreach (AssetService::CATEGORIES as $c) {
            if ($c === 'mockup_sample' && !$super) {
                continue;
            }
            $out[] = ['id' => $c, 'label' => AssetService::CATEGORY_KO[$c], 'count' => (int) ($live[$c] ?? 0), 'deleted' => (int) ($gone[$c] ?? 0)];
        }
        Response::json($out);
    });

    // 휴지통 — 소프트 삭제된 에셋 목록(복원용)
    $r->get('/admin/assets/trash', function (array $p, Actor $a) use ($need): void {
        $need($a, 'curator');
        [$page, $limit, $off] = Response::paging(48, 120);
        $super = in_array('superadmin', $a->roles, true);
        $w = 'i.deleted_at IS NOT NULL' . ($super ? '' : " AND i.category <> 'mockup_sample'");
        $total = (int) Db::val("SELECT COUNT(*) FROM asset_items i WHERE {$w}");
        $rows = Db::rows("SELECT i.public_id, i.category, i.name, i.alt, i.visibility, i.ai_generated, i.created_at, i.updated_at, i.deleted_at FROM asset_items i WHERE {$w} ORDER BY i.deleted_at DESC LIMIT {$limit} OFFSET {$off}");
        Response::list(array_map(static fn (array $x): array => [
            'id' => $x['public_id'], 'category' => $x['category'], 'category_ko' => AssetService::CATEGORY_KO[$x['category']] ?? $x['category'],
            'name' => $x['name'] ?: ($x['alt'] ?: null), 'visibility' => $x['visibility'], 'ai' => (bool) $x['ai_generated'],
            'created_at' => $x['created_at'], 'updated_at' => $x['updated_at'], 'deleted_at' => $x['deleted_at'], 'thumb_url' => AssetService::fileUrl($x['public_id'], 'thumb'),
        ], $rows), $total, $page, $limit);
    });

    // 등록 — multipart: file(이미지, ppt 는 .pptx + thumb 이미지 선택), category, name, alt, visibility(기본 internal), tags_ko, tags_en, set, ai
    // 원본은 크기 그대로 저장(축소 금지 — 2026-09-30 원본 크기 원칙), 썸네일만 360px(PNG 투명 유지).
    $r->post('/admin/assets', function (array $p, Actor $a) use ($need, $cleanTags, $setIdOf, $recount, $assetDetail): void {
        $need($a, 'curator');
        $cat = (string) ($_POST['category'] ?? '');
        if (!in_array($cat, AssetService::CATEGORIES, true)) {
            throw HttpError::invalid('분류를 골라 주세요.', 'category');
        }
        if ($cat === 'mockup_sample' && !in_array('superadmin', $a->roles, true)) {
            throw HttpError::forbidden('목업 샘플은 superadmin 만 등록할 수 있습니다.');
        }
        $vis = (string) ($_POST['visibility'] ?? 'internal');
        if (!in_array($vis, ASSET_VIS_SET, true)) {
            throw HttpError::invalid('공개 범위가 올바르지 않습니다.', 'visibility');
        }
        if (!$a->isAdmin() && $vis !== 'internal') {
            throw HttpError::forbidden('큐레이터는 사내 전용(internal)으로만 등록할 수 있습니다.');
        }
        if ($cat === 'ppt' && $vis !== 'internal') {   // 장표(실제 제안서)는 영구 임직원 전용 — 관리자도 못 넓힌다(사용자 2026-10-16)
            throw HttpError::forbidden('장표(ppt)는 임직원 전용(internal)으로만 둘 수 있습니다.');
        }
        $f = $_FILES['file'] ?? null;
        if (!$f || ($f['error'] ?? 1) !== UPLOAD_ERR_OK) {
            throw HttpError::invalid('파일(file)을 보내 주세요.', 'file');
        }
        $maxBytes = ($cat === 'ppt' ? 40 : 20) * 1024 * 1024;
        if ((int) $f['size'] > $maxBytes || (int) $f['size'] < 1) {
            throw HttpError::invalid(($cat === 'ppt' ? '40' : '20') . 'MB 이하만 올릴 수 있습니다.', 'file');
        }
        $name = mb_substr(trim((string) ($_POST['name'] ?? '')), 0, 200);
        $alt = mb_substr(trim((string) ($_POST['alt'] ?? '')), 0, 300);
        $tagsKo = $cleanTags($_POST['tags_ko'] ?? '');
        $tagsEn = $cleanTags($_POST['tags_en'] ?? '');
        $setId = $setIdOf($_POST['set'] ?? '');
        $ai = !empty($_POST['ai']) && $_POST['ai'] !== '0' && $_POST['ai'] !== 'false' ? 1 : 0;
        $tmp = (string) $f['tmp_name'];
        $sha = hash_file('sha256', $tmp);
        $dup = Db::row('SELECT public_id FROM asset_items WHERE sha256 = ? AND deleted_at IS NULL', [$sha]);
        if ($dup) {
            throw new HttpError('DUPLICATE', '같은 파일이 이미 등록돼 있습니다.', 409, $dup['public_id']);
        }
        $pid = Ids::publicId();
        $storage = rtrim((string) Config::get('storage.dir'), '/\\') . '/assets';
        $dir = "{$storage}/{$cat}";
        $thumbDir = "{$storage}/{$cat}/thumbs";
        foreach ([$dir, $thumbDir] as $d) {
            if (!is_dir($d) && !mkdir($d, 0775, true)) {
                throw new HttpError('STORAGE', '저장 폴더를 만들 수 없습니다.', 500);
            }
        }
        $files = []; // kind => [path, mime, bytes, w, h, sha]
        $w = $h = null;
        $slideKind = null;
        $slidePage = null;
        if ($cat === 'ppt') {
            // 장표는 .pptx 원본(kind=slide) + 썸네일 이미지(thumb, 선택). Office 파일은 finfo 가 불안정해 확장자로 본다(파워플러스 교훈).
            $ext = strtolower(pathinfo((string) $f['name'], PATHINFO_EXTENSION));
            if (!in_array($ext, ['ppt', 'pptx'], true)) {
                throw HttpError::invalid('장표는 .ppt/.pptx 파일을 올려 주세요.', 'file');
            }
            $slideKind = in_array((string) ($_POST['slide_kind'] ?? ''), ['package', 'single'], true) ? (string) $_POST['slide_kind'] : 'single';
            $slidePage = mb_substr(trim((string) ($_POST['slide_page'] ?? '')), 0, 20) ?: null;
            $path = "{$cat}/{$pid}.{$ext}";
            if (!move_uploaded_file($tmp, "{$storage}/{$path}")) {
                throw new HttpError('STORAGE', '파일을 저장하지 못했습니다.', 500);
            }
            $files['slide'] = [$path, $ext === 'ppt' ? 'application/vnd.ms-powerpoint' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation', (int) $f['size'], null, null, $sha];
            $t = $_FILES['thumb'] ?? null;
            if ($t && ($t['error'] ?? 1) === UPLOAD_ERR_OK) {
                $info = @getimagesize((string) $t['tmp_name']);
                if ($info && in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true)) {
                    $text = $info[2] === IMAGETYPE_PNG ? 'png' : ($info[2] === IMAGETYPE_WEBP ? 'webp' : 'jpg');
                    $tpath = "{$cat}/thumbs/{$pid}.{$text}";
                    if (move_uploaded_file((string) $t['tmp_name'], "{$storage}/{$tpath}")) {
                        $files['thumb'] = [$tpath, $info['mime'], (int) $t['size'], $info[0], $info[1], hash_file('sha256', "{$storage}/{$tpath}")];
                        $w = $info[0];
                        $h = $info[1];
                    }
                }
            }
        } else {
            $info = @getimagesize($tmp);
            if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP, IMAGETYPE_GIF], true)) {
                throw HttpError::invalid('JPG·PNG·WEBP·GIF 이미지만 됩니다.', 'file');
            }
            // 화소 상한은 Assets\Service::MAX_PIXELS 한 곳(4천만, 2026-10-18) — 옮기기·디코딩 전에 거절해 고아 파일·메모리 Fatal 을 막는다
            $tooBig = \Pp\Assets\Service::pixelLimitError((int) $info[0], (int) $info[1]);
            if ($tooBig !== null) {
                throw HttpError::invalid($tooBig, 'file');
            }
            $ext = match ($info[2]) { IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp', default => 'gif' };
            $w = $info[0];
            $h = $info[1];
            $path = "{$cat}/{$pid}.{$ext}";
            if (!move_uploaded_file($tmp, "{$storage}/{$path}")) {
                throw new HttpError('STORAGE', '파일을 저장하지 못했습니다.', 500);
            }
            $files['original'] = [$path, $info['mime'], (int) $f['size'], $w, $h, $sha];
            // 썸네일 360px(긴 변 기준) — PNG·GIF·WEBP 는 투명 유지해 PNG 로, JPG 는 JPG 로
            $src = match ($info[2]) {
                IMAGETYPE_JPEG => imagecreatefromjpeg("{$storage}/{$path}"),
                IMAGETYPE_PNG => imagecreatefrompng("{$storage}/{$path}"),
                IMAGETYPE_WEBP => imagecreatefromwebp("{$storage}/{$path}"),
                default => imagecreatefromgif("{$storage}/{$path}"),
            };
            if ($src) {
                $scale = min(1.0, 360 / max($w, $h));
                $tw = max(1, (int) round($w * $scale));
                $th = max(1, (int) round($h * $scale));
                $dst = imagecreatetruecolor($tw, $th);
                $isJpg = $info[2] === IMAGETYPE_JPEG;
                if ($isJpg) {
                    imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));
                } else {
                    imagealphablending($dst, false);
                    imagesavealpha($dst, true);
                    imagefill($dst, 0, 0, imagecolorallocatealpha($dst, 0, 0, 0, 127));
                }
                imagecopyresampled($dst, $src, 0, 0, 0, 0, $tw, $th, $w, $h);
                $tpath = "{$cat}/thumbs/{$pid}." . ($isJpg ? 'jpg' : 'png');
                $ok = $isJpg ? imagejpeg($dst, "{$storage}/{$tpath}", 86) : imagepng($dst, "{$storage}/{$tpath}", 6);
                imagedestroy($src);
                imagedestroy($dst);
                if ($ok) {
                    $files['thumb'] = [$tpath, $isJpg ? 'image/jpeg' : 'image/png', (int) filesize("{$storage}/{$tpath}"), $tw, $th, hash_file('sha256', "{$storage}/{$tpath}")];
                }
            }
        }
        $itemId = Db::tx(static function () use ($pid, $a, $vis, $cat, $name, $alt, $w, $h, $setId, $slideKind, $slidePage, $sha, $ai, $files, $tagsKo, $tagsEn): int {
            Db::exec('INSERT INTO asset_items (public_id, owner_user_id, visibility, category, name, alt, w, h, set_id, source, slide_kind, slide_page, sha256, ai_generated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                [$pid, $a->id(), $vis, $cat, $name ?: null, $alt ?: null, $w, $h, $setId, 'own', $slideKind, $slidePage, $sha, $ai]);
            $id = Db::lastId();
            foreach ($files as $kind => [$path, $mime, $bytes, $fw, $fh, $fsha]) {
                Db::exec('INSERT INTO core_files (public_id, bucket, path, mime, bytes, w, h, sha256, owner_user_id, visibility) VALUES (?,?,?,?,?,?,?,?,?,?)',
                    [Ids::publicId(), 'assets', $path, $mime, $bytes, $fw, $fh, $fsha, $a->id(), $vis]);
                Db::exec('INSERT INTO asset_files (item_id, kind, file_id) VALUES (?,?,?)', [$id, $kind, Db::lastId()]);
            }
            foreach (['ko' => $tagsKo, 'en' => $tagsEn] as $lang => $tags) {
                foreach ($tags as $t) {
                    Db::exec("INSERT IGNORE INTO asset_tags (item_id, tag, lang, axis) VALUES (?,?,?,'kw')", [$id, $t, $lang]);
                }
            }
            return $id;
        });
        $recount($setId);
        Audit::log($a, 'asset.create', 'asset:' . $pid, null, ['category' => $cat, 'visibility' => $vis, 'name' => $name ?: null, 'bytes' => (int) $f['size']]);
        foreach ($files as $fileRow) {  // 원본·장표·썸네일 전부 바이러스 검사 대기열(SEC-011)
            Scan::queue("{$storage}/{$fileRow[0]}", 'asset', $pid, $a->id());
        }
        Response::json($assetDetail(Db::row('SELECT * FROM asset_items WHERE id = ?', [$itemId])), 201);
    });

    // 상세
    $r->get('/admin/assets/{id}', function (array $p, Actor $a) use ($need, $assetRow, $assetDetail): void {
        $need($a, 'curator');
        Response::json($assetDetail($assetRow($a, (string) $p['id'])));
    });

    // 메타 수정 — name·alt·category·visibility·tags{ko,en}·set·ai·slide_kind·slide_page. 보낸 키만 바꾼다. 태그는 kw 축만 교체.
    $r->patch('/admin/assets/{id}', function (array $p, Actor $a) use ($need, $assetRow, $assetDetail, $cleanTags, $setIdOf, $recount): void {
        $need($a, 'curator');
        $x = $assetRow($a, (string) $p['id']);
        if ($x['deleted_at'] !== null) {
            throw new HttpError('DELETED', '삭제된 에셋입니다. 먼저 복원하세요.', 409);
        }
        $b = Response::input();
        $set = [];
        $args = [];
        $before = [];
        $after = [];
        if (array_key_exists('name', $b)) {
            $v = mb_substr(trim((string) $b['name']), 0, 200) ?: null;
            if ($v !== $x['name']) { $set[] = 'name = ?'; $args[] = $v; $before['name'] = $x['name']; $after['name'] = $v; }
        }
        if (array_key_exists('alt', $b)) {
            $v = mb_substr(trim((string) $b['alt']), 0, 300) ?: null;
            if ($v !== $x['alt']) { $set[] = 'alt = ?'; $args[] = $v; $before['alt'] = $x['alt']; $after['alt'] = $v; }
        }
        if (array_key_exists('category', $b)) {
            $v = (string) $b['category'];
            if (!in_array($v, AssetService::CATEGORIES, true)) {
                throw HttpError::invalid('분류가 올바르지 않습니다.', 'category');
            }
            if ($v === 'mockup_sample' && !in_array('superadmin', $a->roles, true)) {
                throw HttpError::forbidden('목업 샘플 분류는 superadmin 만 지정할 수 있습니다.');
            }
            if ($v !== $x['category']) { $set[] = 'category = ?'; $args[] = $v; $before['category'] = $x['category']; $after['category'] = $v; }
        }
        if (array_key_exists('visibility', $b)) {
            $v = (string) $b['visibility'];
            if (!in_array($v, ASSET_VIS_SET, true)) {
                throw HttpError::invalid('공개 범위가 올바르지 않습니다.', 'visibility');
            }
            if ($v !== $x['visibility']) {
                if (!$a->isAdmin() && ($v !== 'internal' || $x['visibility'] === 'private')) {
                    throw HttpError::forbidden('큐레이터는 사내 전용(internal)으로 올리기만 할 수 있습니다.');
                }
                if (($after['category'] ?? $x['category']) === 'ppt' && $v !== 'internal') {   // 장표는 영구 임직원 전용(사용자 2026-10-16)
                    throw HttpError::forbidden('장표(ppt)는 임직원 전용(internal)으로만 둘 수 있습니다.');
                }
                $set[] = 'visibility = ?'; $args[] = $v; $before['visibility'] = $x['visibility']; $after['visibility'] = $v;
            }
        }
        if (($after['category'] ?? null) === 'ppt' && ($after['visibility'] ?? $x['visibility']) !== 'internal') {   // 분류를 ppt 로 바꾸면 범위도 internal 로
            $set[] = 'visibility = ?'; $args[] = 'internal'; $before['visibility'] = $x['visibility']; $after['visibility'] = 'internal';
        }
        if (array_key_exists('ai', $b)) {
            $v = !empty($b['ai']) ? 1 : 0;
            if ($v !== (int) $x['ai_generated']) { $set[] = 'ai_generated = ?'; $args[] = $v; $before['ai'] = (bool) $x['ai_generated']; $after['ai'] = (bool) $v; }
        }
        if (array_key_exists('slide_kind', $b)) {
            $v = in_array((string) $b['slide_kind'], ['package', 'single'], true) ? (string) $b['slide_kind'] : null;
            if ($v !== $x['slide_kind']) { $set[] = 'slide_kind = ?'; $args[] = $v; $before['slide_kind'] = $x['slide_kind']; $after['slide_kind'] = $v; }
        }
        if (array_key_exists('slide_page', $b)) {
            $v = mb_substr(trim((string) $b['slide_page']), 0, 20) ?: null;
            if ($v !== $x['slide_page']) { $set[] = 'slide_page = ?'; $args[] = $v; $before['slide_page'] = $x['slide_page']; $after['slide_page'] = $v; }
        }
        $oldSet = $x['set_id'] === null ? null : (int) $x['set_id'];
        $newSet = $oldSet;
        if (array_key_exists('set', $b)) {
            $newSet = $setIdOf($b['set'] ?? '');
            if ($newSet !== $oldSet) { $set[] = 'set_id = ?'; $args[] = $newSet; $before['set'] = $oldSet; $after['set'] = $newSet; }
        }
        $tagsChanged = false;
        if (array_key_exists('tags', $b) && is_array($b['tags'])) {
            $cur = ['ko' => [], 'en' => []];
            foreach (Db::rows("SELECT tag, lang FROM asset_tags WHERE item_id = ? AND axis = 'kw' ORDER BY tag", [$x['id']]) as $t) {
                $cur[$t['lang']][] = $t['tag'];
            }
            $new = ['ko' => $cleanTags($b['tags']['ko'] ?? $cur['ko']), 'en' => $cleanTags($b['tags']['en'] ?? $cur['en'])];
            sort($cur['ko']); sort($cur['en']);
            $cmp = $new; sort($cmp['ko']); sort($cmp['en']);
            if ($cmp !== $cur) {
                $tagsChanged = true;
                $before['tags'] = ['ko' => count($cur['ko']), 'en' => count($cur['en'])];
                $after['tags'] = ['ko' => count($new['ko']), 'en' => count($new['en'])];
            }
        }
        if ($set === [] && !$tagsChanged) {
            Response::json($assetDetail($x));
        }
        Db::tx(static function () use ($set, $args, $x, $tagsChanged, $new): void {
            if ($set !== []) {
                $args[] = $x['id'];
                Db::exec('UPDATE asset_items SET ' . implode(', ', $set) . ' WHERE id = ?', $args);
            }
            if ($tagsChanged) {
                Db::exec("DELETE FROM asset_tags WHERE item_id = ? AND axis = 'kw'", [$x['id']]);
                foreach ($new as $lang => $tags) {
                    foreach ($tags as $t) {
                        Db::exec("INSERT IGNORE INTO asset_tags (item_id, tag, lang, axis) VALUES (?,?,?,'kw')", [$x['id'], $t, $lang]);
                    }
                }
            }
        });
        $recount($oldSet, $newSet);
        Audit::log($a, 'asset.update', 'asset:' . $x['public_id'], $before, $after);
        Response::json($assetDetail(Db::row('SELECT * FROM asset_items WHERE id = ?', [$x['id']])));
    });

    // 소프트 삭제 — 파일은 그대로(복원 가능), 90일 뒤 물리 삭제는 배치 몫
    $r->delete('/admin/assets/{id}', function (array $p, Actor $a) use ($need, $assetRow, $recount): void {
        $need($a, 'curator');
        $x = $assetRow($a, (string) $p['id']);
        if ($x['deleted_at'] !== null) {
            throw new HttpError('DELETED', '이미 삭제된 에셋입니다.', 409);
        }
        Db::exec('UPDATE asset_items SET deleted_at = NOW(3) WHERE id = ?', [$x['id']]);
        $recount($x['set_id'] === null ? null : (int) $x['set_id']);
        Audit::log($a, 'asset.delete', 'asset:' . $x['public_id'], ['category' => $x['category'], 'name' => $x['name']], null);
        Response::json(['id' => $x['public_id'], 'deleted' => true]);
    });
    $r->post('/admin/assets/{id}/restore', function (array $p, Actor $a) use ($need, $assetRow, $assetDetail, $recount): void {
        $need($a, 'curator');
        $x = $assetRow($a, (string) $p['id']);
        if ($x['deleted_at'] === null) {
            throw new HttpError('NOT_DELETED', '삭제된 에셋이 아닙니다.', 409);
        }
        Db::exec('UPDATE asset_items SET deleted_at = NULL WHERE id = ?', [$x['id']]);
        $recount($x['set_id'] === null ? null : (int) $x['set_id']);
        Audit::log($a, 'asset.restore', 'asset:' . $x['public_id'], null, ['category' => $x['category'], 'name' => $x['name']]);
        Response::json($assetDetail(Db::row('SELECT * FROM asset_items WHERE id = ?', [$x['id']])));
    });

    // 일괄 처리 — action: delete(휴지통으로) | restore(휴지통에서 되살림).
    // 대상: ids(고른 것) 또는 all=true(지금 보고 있는 조건 전부 — category·visibility·q). 소프트 삭제라 언제든 되돌릴 수 있다.
    // 한 번에 5,000개까지(넘으면 조건을 좁혀 달라고 한다). 에셋마다 감사 기록 하나.
    $r->post('/admin/assets/bulk', function (array $p, Actor $a) use ($need, $like, $recount): void {
        $need($a, 'curator');
        $b = Response::input();
        $action = (string) ($b['action'] ?? '');
        if (!in_array($action, ['delete', 'restore'], true)) {
            throw HttpError::invalid('할 일을 골라 주세요.', 'delete · restore 중 하나');
        }
        $super = in_array('superadmin', $a->roles, true);
        $where = [$action === 'delete' ? 'i.deleted_at IS NULL' : 'i.deleted_at IS NOT NULL'];
        $args = [];
        if (!$super) {
            $where[] = "i.category <> 'mockup_sample'";
        }
        if (!empty($b['all'])) {
            $f = (array) ($b['filter'] ?? []);
            $cat = (string) ($f['category'] ?? '');
            if (in_array($cat, AssetService::CATEGORIES, true)) {
                $where[] = 'i.category = ?';
                $args[] = $cat;
            }
            if ($cat !== 'mockup_sample') {
                $where[] = "i.category <> 'mockup_sample'";
            }
            $vis = (string) ($f['visibility'] ?? '');
            if (in_array($vis, ASSET_VIS_ALL, true)) {
                $where[] = 'i.visibility = ?';
                $args[] = $vis;
            }
            foreach (AssetService::tokens((string) ($f['q'] ?? '')) as $tok) {
                $where[] = "(LOWER(COALESCE(i.name,'')) LIKE ? OR i.public_id = ? OR EXISTS (SELECT 1 FROM asset_tags t WHERE t.item_id = i.id AND t.tag LIKE ?))";
                array_push($args, $like($tok), $tok, $like($tok));
            }
        } else {
            $ids = array_values(array_unique(array_filter(array_map('strval', (array) ($b['ids'] ?? [])), static fn (string $s): bool => preg_match('/^[A-Za-z0-9_-]{4,32}$/', $s) === 1)));
            if ($ids === []) {
                throw HttpError::invalid('처리할 에셋을 골라 주세요.');
            }
            $where[] = 'i.public_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
            array_push($args, ...$ids);
        }
        $w = implode(' AND ', $where);
        $rows = Db::rows("SELECT i.id, i.public_id, i.category, i.name, i.set_id FROM asset_items i WHERE {$w} LIMIT 5001", $args);
        if (count($rows) > 5000) {
            throw HttpError::invalid('한 번에 5,000개까지 처리할 수 있습니다.', '분류·공개 범위·검색어로 좁혀 주세요.');
        }
        $sets = [];
        foreach (array_chunk($rows, 500) as $chunk) {
            $ph = implode(',', array_fill(0, count($chunk), '?'));
            Db::exec('UPDATE asset_items SET deleted_at = ' . ($action === 'delete' ? 'NOW(3)' : 'NULL') . " WHERE id IN ({$ph})", array_column($chunk, 'id'));
        }
        foreach ($rows as $x) {
            $sets[] = $x['set_id'] === null ? null : (int) $x['set_id'];
            $snap = ['category' => $x['category'], 'name' => $x['name']];
            Audit::log($a, 'asset.' . $action, 'asset:' . $x['public_id'], $action === 'delete' ? $snap : null, $action === 'delete' ? null : $snap);
        }
        $recount(...$sets);
        Response::json(['action' => $action, 'count' => count($rows)]);
    });

    // ---- 세트 목록·이름 수정
    $r->get('/admin/sets', function (array $p, Actor $a) use ($need): void {
        $need($a, 'curator');
        $where = ['1=1'];
        $args = [];
        $cat = (string) ($_GET['category'] ?? '');
        if (in_array($cat, AssetService::CATEGORIES, true)) {
            $where[] = 's.category = ?';
            $args[] = $cat;
        }
        $q = trim((string) ($_GET['q'] ?? ''));
        if ($q !== '') {
            $where[] = 's.name LIKE ?';
            $args[] = '%' . addcslashes($q, '%_\\') . '%';
        }
        $rows = Db::rows('SELECT s.public_id, s.name, s.style, s.category, s.item_count, s.created_at,
                                 (SELECT c.public_id FROM asset_items c WHERE c.id = s.cover_item_id) AS cover_pid,
                                 (SELECT MIN(i.public_id) FROM asset_items i WHERE i.set_id = s.id AND i.deleted_at IS NULL) AS first_pid
                          FROM asset_sets s WHERE ' . implode(' AND ', $where) . ' ORDER BY s.item_count DESC, s.id ASC LIMIT 500', $args);
        Response::json(array_map(static fn (array $s): array => [
            'id' => $s['public_id'], 'name' => $s['name'], 'style' => $s['style'], 'category' => $s['category'],
            'category_ko' => AssetService::CATEGORY_KO[$s['category']] ?? $s['category'], 'count' => (int) $s['item_count'], 'created_at' => $s['created_at'],
            'cover_url' => AssetService::fileUrl($s['cover_pid'] ?: $s['first_pid'], 'thumb'),
        ], $rows));
    });
    $r->patch('/admin/sets/{id}', function (array $p, Actor $a) use ($need): void {
        $need($a, 'curator');
        $s = Db::row('SELECT * FROM asset_sets WHERE public_id = ?', [(string) $p['id']]);
        if (!$s) {
            throw HttpError::notFound('세트');
        }
        $b = Response::input();
        $name = mb_substr(trim((string) ($b['name'] ?? $s['name'])), 0, 120);
        if ($name === '') {
            throw HttpError::invalid('세트 이름을 적어 주세요.', 'name');
        }
        $style = array_key_exists('style', $b) ? (mb_substr(trim((string) $b['style']), 0, 40) ?: null) : $s['style'];
        Db::exec('UPDATE asset_sets SET name = ?, style = ? WHERE id = ?', [$name, $style, $s['id']]);
        Audit::log($a, 'asset.set.update', 'asset_set:' . $s['public_id'], ['name' => $s['name'], 'style' => $s['style']], ['name' => $name, 'style' => $style]);
        Response::json(['id' => $s['public_id'], 'name' => $name, 'style' => $style, 'category' => $s['category'], 'count' => (int) $s['item_count']]);
    });

    // ---- 콘텐츠 요청(asset_requests) — new/done/rejected + 답변. support 이상(요청 처리는 지원 역할의 일).
    $reqOut = static fn (array $x): array => [
        'id' => $x['public_id'], 'title' => $x['title'], 'kind' => $x['kind'], 'kind_ko' => $x['kind'] ? (AssetService::CATEGORY_KO[$x['kind']] ?? $x['kind']) : null,
        'detail' => $x['detail'], 'status' => $x['status'], 'source' => $x['source'], 'reply' => $x['reply'] ?? null,
        'requester' => $x['req_name'] ?? null, 'requester_email' => $x['req_email'] ?? null,
        'handled_item' => $x['handled_pid'] ?? null, 'handled_by' => $x['handler_name'] ?? null, 'handled_at' => $x['handled_at'] ?? null,
        'created_at' => $x['created_at'],
    ];
    $reqSql = 'SELECT q.*, u.name AS req_name, u.email AS req_email, h.name AS handler_name, (SELECT public_id FROM asset_items i WHERE i.id = q.handled_item_id) AS handled_pid
               FROM asset_requests q LEFT JOIN core_users u ON u.id = q.user_id LEFT JOIN core_users h ON h.id = q.handled_by';
    $r->get('/admin/requests', function (array $p, Actor $a) use ($need, $like, $reqOut, $reqSql): void {
        $need($a, 'support');
        [$page, $limit, $off] = Response::paging(30, 100);
        $where = ['1=1'];
        $args = [];
        $st = (string) ($_GET['status'] ?? '');
        if (in_array($st, ['new', 'done', 'rejected'], true)) {
            $where[] = 'q.status = ?';
            $args[] = $st;
        }
        $q = trim((string) ($_GET['q'] ?? ''));
        if ($q !== '') {
            $where[] = '(q.title LIKE ? OR q.detail LIKE ? OR u.email LIKE ? OR u.name LIKE ?)';
            array_push($args, $like($q), $like($q), $like($q), $like($q));
        }
        $w = implode(' AND ', $where);
        $total = (int) Db::val("SELECT COUNT(*) FROM asset_requests q LEFT JOIN core_users u ON u.id = q.user_id WHERE {$w}", $args);
        $rows = Db::rows("{$reqSql} WHERE {$w} ORDER BY (q.status = 'new') DESC, q.id DESC LIMIT {$limit} OFFSET {$off}", $args);
        $counts = [];
        foreach (Db::rows('SELECT status, COUNT(*) AS n FROM asset_requests GROUP BY status') as $c) {
            $counts[$c['status']] = (int) $c['n'];
        }
        Response::list(array_map($reqOut, $rows), $total, $page, $limit, ['counts' => $counts]);
    });
    $r->patch('/admin/requests/{id}', function (array $p, Actor $a) use ($need, $reqOut, $reqSql): void {
        $need($a, 'support');
        $x = Db::row('SELECT * FROM asset_requests WHERE public_id = ?', [(string) $p['id']]);
        if (!$x) {
            throw HttpError::notFound('콘텐츠 요청');
        }
        $b = Response::input();
        $status = (string) ($b['status'] ?? $x['status']);
        if (!in_array($status, ['new', 'done', 'rejected'], true)) {
            throw HttpError::invalid('상태 값이 올바르지 않습니다.');
        }
        $reply = array_key_exists('reply', $b) ? mb_substr(trim((string) $b['reply']), 0, 3000) : (string) ($x['reply'] ?? '');
        $itemId = $x['handled_item_id'];
        if (array_key_exists('handled_item', $b)) {
            $pid = trim((string) $b['handled_item']);
            if ($pid === '') {
                $itemId = null;
            } else {
                $itemId = Db::val('SELECT id FROM asset_items WHERE public_id = ? AND deleted_at IS NULL', [$pid]);
                if (!$itemId) {
                    throw HttpError::invalid('연결할 에셋을 찾을 수 없습니다.', 'handled_item');
                }
            }
        }
        $final = $status !== 'new';
        Db::exec('UPDATE asset_requests SET status = ?, reply = ?, handled_item_id = ?, handled_by = ?, handled_at = IF(?, NOW(3), NULL) WHERE id = ?',
            [$status, $reply === '' ? null : $reply, $itemId, $final ? $a->id() : null, $final ? 1 : 0, $x['id']]);
        if ($status !== $x['status'] && $x['user_id'] !== null) {
            try {
                Notify::send((int) $x['user_id'], 'asset.request', $status === 'done' ? '요청하신 자료가 등록됐습니다' : '자료 요청이 보류됐습니다', '/account?tab=assets', $a->id(), mb_substr((string) $x['title'], 0, 80) . ($reply !== '' ? ' — ' . mb_substr($reply, 0, 120) : ''));
            if ($status === 'done') {
                $rq = ['uid' => (int) $x['user_id'], 'title' => mb_substr((string) $x['title'], 0, 80)];
                Notify::later(static function () use ($rq): void {
                    $nm = (string) (Db::val('SELECT name FROM core_users WHERE id = ?', [$rq['uid']]) ?? '');
                    Notify::mail($rq['uid'], 'request', 'request_done', ['name' => ($nm !== '' ? $nm : '회원'), 'title' => $rq['title'], 'count' => 0]);
                });
            }
            } catch (\Throwable) {
            }
        }
        Audit::log($a, 'asset.request.update', 'asset_requests:' . $x['public_id'], ['status' => $x['status']], ['status' => $status, 'item' => $itemId]);
        Response::json($reqOut(Db::row("{$reqSql} WHERE q.id = ?", [$x['id']])));
    });

    // ---- 검색 품질 — asset_search_logs 최근 N일: 검색 수·무결과율·인기/무결과 검색어 TOP10·일별 추이(파워플러스 analytics.search 이식)
    $r->get('/admin/search-quality', function (array $p, Actor $a) use ($need): void {
        $need($a, 'curator');
        $days = max(1, min(365, (int) ($_GET['days'] ?? 30)));
        $from = ['day >= CURDATE() - INTERVAL ? DAY', [$days - 1]];
        $sum = Db::row("SELECT COUNT(*) AS total, SUM(results = 0) AS zero, COUNT(DISTINCT q) AS distinct_q, COUNT(DISTINCT user_id) AS users FROM asset_search_logs WHERE {$from[0]}", $from[1]) ?? [];
        $total = (int) ($sum['total'] ?? 0);
        $zero = (int) ($sum['zero'] ?? 0);
        $top = Db::rows("SELECT q, COUNT(*) AS n, MAX(results) AS results FROM asset_search_logs WHERE {$from[0]} AND results > 0 GROUP BY q ORDER BY n DESC, q ASC LIMIT 10", $from[1]);
        // 무결과 = 그 기간에 한 번도 결과를 못 낸 검색어(한 번이라도 찾았으면 뺀다)
        $none = Db::rows("SELECT q, COUNT(*) AS n, MAX(created_at) AS last_at FROM asset_search_logs WHERE {$from[0]} GROUP BY q HAVING MAX(results) = 0 ORDER BY n DESC, last_at DESC LIMIT 10", $from[1]);
        $daily = Db::rows("SELECT day, COUNT(*) AS total, SUM(results = 0) AS zero FROM asset_search_logs WHERE {$from[0]} GROUP BY day ORDER BY day", $from[1]);
        $chan = [];
        foreach (Db::rows("SELECT channel, COUNT(*) AS n FROM asset_search_logs WHERE {$from[0]} GROUP BY channel", $from[1]) as $c) {
            $chan[$c['channel']] = (int) $c['n'];
        }
        Response::json([
            'days' => $days, 'total' => $total, 'zero' => $zero, 'zero_rate' => $total > 0 ? round($zero / $total * 100, 1) : 0.0,
            'distinct' => (int) ($sum['distinct_q'] ?? 0), 'users' => (int) ($sum['users'] ?? 0), 'channels' => $chan,
            'top' => array_map(static fn (array $x): array => ['q' => $x['q'], 'count' => (int) $x['n'], 'results' => (int) $x['results']], $top),
            'zero_top' => array_map(static fn (array $x): array => ['q' => $x['q'], 'count' => (int) $x['n'], 'last_at' => $x['last_at']], $none),
            'daily' => array_map(static fn (array $x): array => ['day' => $x['day'], 'total' => (int) $x['total'], 'zero' => (int) $x['zero'], 'zero_rate' => (int) $x['total'] > 0 ? round((int) $x['zero'] / (int) $x['total'] * 100, 1) : 0.0], $daily),
        ]);
    });
};
