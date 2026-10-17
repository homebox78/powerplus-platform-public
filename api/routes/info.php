<?php
/**
 * 정보·정책 페이지 서버 — /api/v1/contact · /api/v1/removal/…
 * 출처: homebox-handoff api/routes/requests.php(POST /api/contact)·removal.php(삭제요청 S16) — REST v1 규약(Actor·HttpError·봉투)으로,
 *   대상은 홈박스 기관 화면(/sites·/screens)이 아니라 powerPlus 안의 주소(게시 시안 /p/…, 에셋·커뮤니티·장표 공유 링크) 전부.
 * 필드 오류는 422 + hint=필드 이름(화면이 그 칸 아래에 문구를 띄운다).
 */
declare(strict_types=1);

use Pp\Core\Actor;
use Pp\Core\Audit;
use Pp\Core\Config;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Ids;
use Pp\Core\Mail;
use Pp\Core\Notify;
use Pp\Core\RateLimit;
use Pp\Core\Response;
use Pp\Core\Router;

const CONTACT_TOPICS = ['general', 'team', 'data', 'bug', 'partner'];
const CONTACT_MODULES = ['assets', 'deck', 'mock', 'guide'];
const REMOVAL_SLA_HOURS = 48;

return static function (Router $r): void {
    $field = static fn (string $name, string $msg): HttpError => new HttpError('INVALID', $msg, 422, $name);
    /** 운영자(admin·superadmin·support)에게 알림 — 실패해도 접수는 막지 않는다 */
    $notifyOps = static function (string $kind, string $title, string $link): void {
        try {
            foreach (Db::rows("SELECT DISTINCT user_id FROM core_user_roles WHERE role IN ('superadmin','admin','support')") as $row) {
                Notify::send((int) $row['user_id'], $kind, $title, $link);
            }
        } catch (\Throwable) {
        }
    };

    // 문의 — 로그인 없이도 보낼 수 있다. 같은 이메일은 1분에 한 번.
    $r->post('/contact', function (array $p, Actor $a) use ($field, $notifyOps): void {
        $b = Response::input();
        $name = trim((string) ($b['name'] ?? ''));
        $email = mb_strtolower(trim((string) ($b['email'] ?? '')));
        $topic = in_array($b['topic'] ?? '', CONTACT_TOPICS, true) ? (string) $b['topic'] : 'general';
        $module = in_array($b['module'] ?? '', CONTACT_MODULES, true) ? (string) $b['module'] : null;
        $message = trim((string) ($b['message'] ?? ''));
        if ($name === '' || mb_strlen($name) > 60) {
            throw $field('name', '이름을 입력해 주세요.');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw $field('email', '이메일 형식이 올바르지 않습니다.');
        }
        if (mb_strlen($message) < 10 || mb_strlen($message) > 3000) {
            throw $field('message', '내용을 10자 이상 적어 주세요.');
        }
        if (Db::val('SELECT id FROM core_contacts WHERE email = ? AND created_at > NOW(3) - INTERVAL 1 MINUTE', [$email])) {
            throw HttpError::tooMany('잠시 뒤에 다시 보내 주세요.');
        }
        // 도배 막기(2026-10-17) — 이메일을 바꿔 가며 보내도 IP 한 곳에서 시간 5번·하루 20번
        $ip = RateLimit::ipKey();
        RateLimit::hit("contact.ip.h:{$ip}", 5, RateLimit::HOUR, '문의를 너무 자주 보냈습니다. 잠시 뒤에 다시 보내 주세요.');
        RateLimit::hit("contact.ip.d:{$ip}", 20, RateLimit::DAY, '오늘 보낼 수 있는 문의 수를 넘었습니다. 내일 다시 보내 주세요.');
        $pid = Ids::publicId();
        $seats = (int) ($b['seats'] ?? 0);
        Db::exec('INSERT INTO core_contacts (public_id, user_id, topic, module, name, email, org, seats, message, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
            $pid, $a->id(), $topic, $module, $name, $email,
            mb_substr(trim((string) ($b['org'] ?? '')), 0, 120) ?: null,
            $topic === 'team' && $seats > 0 ? min($seats, 100000) : null,
            $message, Audit::ip(),
        ]);
        // 빠른 판단(Jev) — 실제 주제·모듈·급함·스팸을 core_contacts.ai 에 붙인다. 실패해도 접수는 그대로.
        // 비로그인 문의는 사이트 전체 하루 50건까지만 묻는다(AI 비용을 남이 태우지 못하게). 넘으면 판단 없이 접수만.
        $ai = $a->id() !== null || RateLimit::take('contact.triage.anon.d', 50, RateLimit::DAY)
            ? \Pp\Core\Triage::contact($pid, $topic, $module, $message, (string) ($b['org'] ?? '') ?: null)
            : null;
        if (($ai['spam'] ?? 0) < 0.8) {
            $notifyOps('contact', ($ai && ($ai['urgent'] ?? 0) >= 0.7 ? '[급함] ' : '') . "새 문의: {$name}", '/admin');
        }
        $to = (string) Config::get('mail.ops_to', '');
        if ($to !== '') {
            Mail::send($to, "[powerPlus 문의] {$topic} · {$name}", "{$name} <{$email}>\n\n{$message}");
        }
        Response::json(['id' => $pid], 201);
    });

    // 홈 숫자 띠 — 누구나 볼 수 있는 숫자만(공개 에셋·공유된 시안·키트 부품). 사용자 수·사내 자료 수는 넣지 않는다.
    $r->get('/home/stats', function (array $p, Actor $a): void {
        // 에셋 수는 보는 사람 권한 기준 — /assets·둘러보기와 같은 Access::whereVisible 로 센다(품질 판정 GEN-018: 홈은 공개만 세서 임직원 화면과 숫자가 달랐다)
        [$visSql, $visParams] = \Pp\Core\Access::whereVisible($a, 'i');
        $row = Db::row("SELECT COUNT(*) AS total, SUM(i.category = 'icon') AS icon, SUM(i.category = 'photo') AS photo
                        FROM asset_items i WHERE i.deleted_at IS NULL AND i.category <> 'mockup_sample' AND {$visSql}", $visParams) ?? [];
        $gallery = (int) (Db::row("SELECT COUNT(*) AS n FROM mock_gallery WHERE status = 'shared'")['n'] ?? 0);
        $parts = count(\Pp\Guide\Data::registry()['metas'] ?? []);
        Response::json([
            'assets' => (int) ($row['total'] ?? 0), 'icons' => (int) ($row['icon'] ?? 0), 'photos' => (int) ($row['photo'] ?? 0),
            'deck_steps' => 6, 'gallery' => $gallery, 'kit_parts' => $parts,
        ]);
    });

    // 삭제요청 공개 로그 — 대상 이름 없이 건수만
    $r->get('/removal/stats', function (array $p, Actor $a): void {
        $row = Db::row("SELECT COUNT(*) AS total, SUM(status = 'received') AS received, SUM(status = 'reviewing') AS reviewing,
                               SUM(status = 'done') AS removed, SUM(status = 'rejected') AS rejected,
                               AVG(CASE WHEN handled_at IS NOT NULL THEN TIMESTAMPDIFF(HOUR, created_at, handled_at) END) AS avg_hours
                        FROM core_removal_requests") ?? [];
        Response::json([
            'total' => (int) ($row['total'] ?? 0), 'received' => (int) ($row['received'] ?? 0), 'reviewing' => (int) ($row['reviewing'] ?? 0),
            'removed' => (int) ($row['removed'] ?? 0), 'rejected' => (int) ($row['rejected'] ?? 0),
            'avg_hours' => ($row['avg_hours'] ?? null) === null ? null : round((float) $row['avg_hours'], 1), 'sla_hours' => REMOVAL_SLA_HOURS,
        ]);
    });

    // 삭제요청 접수 — 대상은 powerPlus 안의 주소. 같은 이메일·대상은 하루 한 번.
    $r->post('/removal', function (array $p, Actor $a) use ($field, $notifyOps): void {
        $b = Response::input();
        $name = trim((string) ($b['claimant_name'] ?? ''));
        $email = mb_strtolower(trim((string) ($b['claimant_email'] ?? '')));
        $url = trim((string) ($b['target_url'] ?? ''));
        $reason = (string) ($b['reason'] ?? '');
        $detail = trim((string) ($b['detail'] ?? ''));
        if ($name === '' || mb_strlen($name) > 80) {
            throw $field('claimant_name', '이름을 입력해 주세요.');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw $field('claimant_email', '올바른 이메일을 입력해 주세요.');
        }
        $path = (string) (parse_url($url, PHP_URL_PATH) ?? '');
        $host = (string) (parse_url($url, PHP_URL_HOST) ?? '');
        $ownHosts = array_filter([$_SERVER['HTTP_HOST'] ?? '', 'powerplus.hom2box.com', 'powerplus.solideos.com', 'localhost', '127.0.0.1']);
        $hostOk = $host === '' || in_array(preg_replace('/:\d+$/', '', $host), array_map(static fn ($h) => preg_replace('/:\d+$/', '', (string) $h), $ownHosts), true);
        if ($url === '' || !$hostOk || !preg_match('#^/([a-z]+)(?:/([A-Za-z0-9_-]+))?#', $path, $m)) {
            throw $field('target_url', 'powerPlus 안의 주소를 붙여 넣어 주세요.');
        }
        parse_str((string) (parse_url($url, PHP_URL_QUERY) ?? ''), $qs);
        $type = $m[1] === 'p' ? 'mockup' : $m[1];
        $id = (string) ($m[2] ?? ($qs['id'] ?? ''));
        if (!in_array($reason, ['copyright', 'privacy', 'other'], true)) {
            throw $field('reason', '사유를 골라 주세요.');
        }
        if (mb_strlen($detail) < 10 || mb_strlen($detail) > 3000) {
            throw $field('detail', '상세 내용을 10자 이상 적어 주세요.');
        }
        if (empty($b['agree'])) {
            throw $field('agree', '권리자 본인(또는 대리인) 확인에 동의해 주세요.');
        }
        $dup = Db::val('SELECT no FROM core_removal_requests WHERE requester_email = ? AND target_url = ? AND created_at > NOW(3) - INTERVAL 1 DAY', [$email, mb_substr($url, 0, 300)]);
        if ($dup) {
            throw new HttpError('DUPLICATE', "이미 접수된 요청입니다(접수번호 {$dup}).", 409);
        }
        // 도배 막기(2026-10-17) — 접수마다 확인 메일이 나간다. IP 한 곳에서 시간 3번·하루 10번, 이메일 하나에 하루 10건
        $ip = RateLimit::ipKey();
        RateLimit::hit("removal.ip.h:{$ip}", 3, RateLimit::HOUR, '삭제요청을 너무 자주 보냈습니다. 잠시 뒤에 다시 보내 주세요.');
        RateLimit::hit("removal.ip.d:{$ip}", 10, RateLimit::DAY, '오늘 보낼 수 있는 삭제요청 수를 넘었습니다. 여러 건이면 문의로 한 번에 보내 주세요.');
        if ((int) Db::val('SELECT COUNT(*) FROM core_removal_requests WHERE requester_email = ? AND created_at > NOW(3) - INTERVAL 1 DAY', [$email]) >= 10) {
            throw HttpError::tooMany('이 이메일로 오늘 보낼 수 있는 삭제요청 수를 넘었습니다.', '하루 10건');
        }
        $no = 'RM' . date('ymd') . strtoupper(bin2hex(random_bytes(2))); // RM261006A1B2 (12자)
        Db::exec('INSERT INTO core_removal_requests (no, content_type, content_id, claimant_name, claimant_org, requester_email, claimant_phone, target_url, reason_kind, reason, due_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3) + INTERVAL ' . REMOVAL_SLA_HOURS . ' HOUR)', [
            $no, mb_substr($type, 0, 40), mb_substr($id, 0, 40), $name,
            mb_substr(trim((string) ($b['claimant_org'] ?? '')), 0, 120) ?: null, $email,
            mb_substr(trim((string) ($b['claimant_phone'] ?? '')), 0, 30) ?: null,
            mb_substr($url, 0, 300), $reason, $detail,
        ]);
        $row = Db::row('SELECT no, due_at, created_at FROM core_removal_requests WHERE no = ?', [$no]);
        Audit::log($a, 'removal.create', "removal:{$no}");
        $notifyOps('removal', "삭제요청 접수 {$no}", '/admin');
        [$subj, $text, $html] = \Pp\Core\MailTemplate::render('removal_received', ['no' => $no, 'target' => $url, 'due' => (string) $row['due_at']]);
        Mail::send($email, $subj, $text, $html);
        Response::json(['ticket_no' => $row['no'], 'due_at' => $row['due_at'], 'created_at' => $row['created_at']], 201);
    });

    // 처리 상태 — 접수 이메일이 맞을 때만
    $r->get('/removal/{no}', function (array $p, Actor $a): void {
        $no = strtoupper((string) $p['no']);
        $email = mb_strtolower(trim((string) ($_GET['email'] ?? '')));
        $row = Db::row('SELECT no, status, target_url, reason_kind, due_at, handled_at, resolution, created_at FROM core_removal_requests WHERE no = ? AND requester_email = ?', [$no, $email]);
        if (!$row) {
            throw new HttpError('NOT_FOUND', '접수번호와 이메일이 일치하는 요청이 없습니다.', 404);
        }
        Response::json([
            'ticket_no' => $row['no'], 'status' => $row['status'], 'target_url' => $row['target_url'], 'reason' => $row['reason_kind'],
            'due_at' => $row['due_at'], 'handled_at' => $row['handled_at'], 'resolution' => $row['resolution'], 'created_at' => $row['created_at'],
        ]);
    });
};
