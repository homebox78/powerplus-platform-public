<?php
declare(strict_types=1);

/**
 * 삭제요청 (S16, docs/09 §4 SOP): 권리자가 홈박스 내 대상 URL·사유·증빙을 제출 → 접수번호(48h 처리 기한) → 상태 조회 → 공개 처리 로그(기관명 없이 건수)
 *   POST /api/removal-requests {claimant_name, claimant_org?, claimant_email, claimant_phone?, target_url, reason, detail}  → {ticket_no, due_at}
 *   GET  /api/removal-requests/{ticket}?email=   접수자 이메일이 맞을 때만 상태 반환
 *   GET  /api/removal-requests/stats             공개 로그: 접수·처리(삭제/거절) 건수, 평균 처리 시간
 * 대상 URL 은 홈박스 내 주소(/sites/{slug}, /screens/{id}, ?section=) 만 받아 target_type/id 로 변환. 증빙 파일 업로드는 후속(메일 회신으로 접수).
 * @var Homebox\Http\Router $router
 */

use Homebox\Db;
use Homebox\Http\Response;

$router->get('/api/removal-requests/stats', static function (): void {
    $row = Db::row("SELECT COUNT(*) AS total, SUM(status = 'received') AS received, SUM(status = 'reviewing') AS reviewing, SUM(status = 'removed') AS removed, SUM(status = 'rejected') AS rejected,
                           AVG(CASE WHEN handled_at IS NOT NULL THEN TIMESTAMPDIFF(HOUR, created_at, handled_at) END) AS avg_hours FROM removal_requests");
    Response::json(['total' => (int) $row['total'], 'received' => (int) $row['received'], 'reviewing' => (int) $row['reviewing'], 'removed' => (int) $row['removed'], 'rejected' => (int) $row['rejected'], 'avg_hours' => $row['avg_hours'] === null ? null : round((float) $row['avg_hours'], 1), 'sla_hours' => 48], 200, ['Cache-Control' => 'public, max-age=300']);
});

$router->post('/api/removal-requests', static function (): void {
    $b = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $name = trim((string) ($b['claimant_name'] ?? ''));
    $email = mb_strtolower(trim((string) ($b['claimant_email'] ?? '')));
    $url = trim((string) ($b['target_url'] ?? ''));
    $reason = (string) ($b['reason'] ?? '');
    $detail = trim((string) ($b['detail'] ?? ''));
    $errors = [];
    if ($name === '' || mb_strlen($name) > 80) { $errors['claimant_name'] = '이름을 입력해 주세요.'; }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) { $errors['claimant_email'] = '올바른 이메일을 입력해 주세요.'; }
    if (!in_array($reason, ['copyright', 'privacy', 'other'], true)) { $errors['reason'] = '사유를 선택해 주세요.'; }
    if (mb_strlen($detail) < 10 || mb_strlen($detail) > 3000) { $errors['detail'] = '상세 내용을 10자 이상 적어 주세요.'; }
    if (empty($b['agree'])) { $errors['agree'] = '권리자 본인(또는 대리인) 확인에 동의해 주세요.'; }
    // 대상 특정: 홈박스 내 URL 만
    $target = null;
    $path = (string) (parse_url($url, PHP_URL_PATH) ?? '');
    parse_str((string) (parse_url($url, PHP_URL_QUERY) ?? ''), $qs);
    if (preg_match('#/screens/(\d+)#', $path, $m)) {
        $sid = (int) $m[1];
        if (!empty($qs['section']) && ctype_digit((string) $qs['section'])) {
            $target = ['section', (int) $qs['section']];
        } else {
            $target = ['screen', $sid];
        }
    } elseif (preg_match('#/sites/([a-z0-9-]+)#', $path, $m)) {
        $s = Db::row('SELECT id FROM sites WHERE slug = ?', [$m[1]]);
        if ($s) { $target = ['site', (int) $s['id']]; }
    }
    if ($target === null) { $errors['target_url'] = '홈박스 안의 주소(/sites/…, /screens/…)를 붙여 넣어 주세요.'; }
    if ($errors !== []) {
        Response::error(422, 'VALIDATION', '입력을 확인해 주세요.', $errors);
    }
    // 같은 이메일·대상으로 24h 내 중복 접수 방지
    $dup = Db::row('SELECT ticket_no FROM removal_requests WHERE claimant_email = ? AND target_type = ? AND target_id = ? AND created_at > NOW() - INTERVAL 1 DAY', [$email, $target[0], $target[1]]);
    if ($dup) {
        Response::error(409, 'DUPLICATE', "이미 접수된 요청입니다 (접수번호 {$dup['ticket_no']}).", ['ticket_no' => $dup['ticket_no']]);
    }
    $ticket = 'RM' . date('ymd') . strtoupper(substr(bin2hex(random_bytes(3)), 0, 4)); // RM240924A1B2 (12자)
    Db::exec('INSERT INTO removal_requests (ticket_no, claimant_name, claimant_org, claimant_email, claimant_phone, target_type, target_id, target_url, reason, detail, due_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3) + INTERVAL 48 HOUR)',
        [$ticket, $name, ($b['claimant_org'] ?? null) ? mb_substr((string) $b['claimant_org'], 0, 120) : null, $email, ($b['claimant_phone'] ?? null) ? mb_substr((string) $b['claimant_phone'], 0, 30) : null, $target[0], $target[1], mb_substr($url, 0, 300), $reason, $detail]);
    $row = Db::row('SELECT ticket_no, due_at, created_at FROM removal_requests WHERE ticket_no = ?', [$ticket]);
    error_log("[homebox-removal] 접수 {$ticket} {$email} {$target[0]}#{$target[1]} — 관리자 확인 필요"); // 메일 발송은 SMTP 587 설정 후 (CLAUDE.md: 25번 차단)
    Response::json(['ticket_no' => $row['ticket_no'], 'due_at' => $row['due_at'], 'created_at' => $row['created_at']], 201);
});

$router->get('/api/removal-requests/{ticket}', static function (array $p): void {
    $ticket = strtoupper((string) $p['ticket']);
    $email = mb_strtolower(trim((string) ($_GET['email'] ?? '')));
    $r = Db::row('SELECT ticket_no, status, target_type, target_url, reason, due_at, handled_at, resolution, created_at FROM removal_requests WHERE ticket_no = ? AND claimant_email = ?', [$ticket, $email]);
    if ($r === null) {
        Response::error(404, 'NOT_FOUND', '접수번호와 이메일이 일치하는 요청이 없습니다.');
    }
    Response::json($r, 200, ['Cache-Control' => 'no-store']);
});
