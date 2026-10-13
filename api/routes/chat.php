<?php
/**
 * 메인 채팅 — /api/v1/chat/*  (docs/powerplus-main-chat-design.md)
 * 홈 한가운데 입력창에서 제안서를 단계별로 진행한다: 의도 → 자료 → 검토 → 목차 → 기획 → 시안 → (pro) 장표·대본.
 * 실제 일은 powerDeck design 작업(deck_jobs) 하나가 한다 — 이 층은 단계를 묻고, 작업 결과를 카드로 붙이고, 무료 한도를 센다.
 *   - 프로젝트 만들 때 hold 작업을 같이 만든다(자료를 그 작업에 올리려면 id 가 있어야 한다).
 *   - 카드(요약·목차·기획·시안·결과)는 GET 할 때 작업 상태를 보고 한 번씩만 붙인다(state.posted).
 *   - 무료: 매달 기획 1장·시안 1장·자료 1건. 결과가 나왔을 때 센다(실패는 세지 않음). 장표 만들기·대본은 pro.
 *   - 정해진 안내 문구는 core_settings chat.msg.<키> 가 있으면 그것(관리자가 고친다), 없으면 아래 기본값.
 */
declare(strict_types=1);

use Pp\Core\Actor;
use Pp\Core\Assist;
use Pp\Core\Audit;
use Pp\Core\Concierge;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Ids;
use Pp\Core\Jev;
use Pp\Core\Response;
use Pp\Core\Router;
use Pp\Deck\Jobs;
use Pp\Deck\Uploads;

const CHAT_MSG = [
    'greet'        => '무엇을 도와드릴까요? 에셋 찾기·제안서 만들기·홈페이지 목업·디자인 규칙까지 이 대화에서 시키거나 물어보세요.',
    'ask_docs'     => '자료를 올려 주시면 검토해서 진행하겠습니다. 제안요청서·과업지시서·참고 자료를 올려 주세요. 자료가 없으면 주제·대상·분량·마감을 적어 주세요.',
    'docs_note'    => '올린 자료는 기획에만 쓰고 장표를 만들면 지웁니다. AI 학습에 쓰지 않습니다.',
    'added_brief'  => '적어 주신 내용을 더했습니다. 자료를 더 올리거나 「검토 시작」을 눌러 주세요.',
    'started'      => '자료를 검토하고 있습니다. 요약과 목차가 나오면 이 자리에 올라옵니다. 단계마다 확정한 뒤 다음으로 넘어갑니다. 창을 닫아도 계속 진행되고, 나오면 알림을 드립니다.',
    'review_ready' => '검토가 끝났습니다. 아래 요약과 목차를 확인하고 확정해 주세요.',
    'free_scope'   => '무료 회원은 매달 기획 1장과 시안 1장을 볼 수 있어요. 나머지 장은 pro 에서 이어서 만들 수 있습니다.',
    'plan_limit'   => '이번 달 무료 기획·시안 1장을 모두 사용하셨어요. 다음 달 1일에 다시 열립니다. pro 로 전환하면 지금 바로 이어서 진행할 수 있어요.',
    'upload_limit' => '무료 회원은 매달 자료 1건을 올릴 수 있어요. 이번 달 몫을 이미 쓰셨습니다.',
    'size_limit'   => '무료 회원은 30MB 이하 파일만 올릴 수 있어요.',
    'locked'       => '장표 만들기와 발표 대본은 pro 부터 사용할 수 있어요.',
    'redo_limit'   => '무료 회원은 한 프로젝트에서 수정 요청을 2번까지 할 수 있어요.',
    'redo'         => '말씀하신 대로 고쳐서 다시 만들고 있습니다. 나오면 이 자리에 올라옵니다.',
    'build'        => '시안을 확정했습니다. 장표를 만들고 있습니다. 끝나면 내려받기 버튼이 나옵니다.',
    'done'         => '장표가 완성됐습니다.',
    'failed'       => '결과를 만드는 중 문제가 생겼어요. 횟수는 차감되지 않았습니다. 다시 시도해 주세요.',
    'out'          => '이 요청은 메인 채팅에서 하지 않는 작업이에요. 사용법이 궁금하면 오른쪽 아래 도우미나 도움말을 이용해 주세요.',
    'help'         => '사용법 질문은 오른쪽 아래 도우미가 더 잘 답합니다. 도움말에서도 찾아볼 수 있어요.',
    'ask_basics'   => '시작 전에 몇 가지만 정해 주세요. 정한 대로 표지·머리 띠·강조색을 만듭니다.',
    'note_saved'   =>'적어 두었습니다. 지금 단계가 끝나면 반영 여부를 묻겠습니다.',
    'ask_choice'   =>'진행할까요, 고칠까요? 아래 버튼으로 골라 주세요.',
    'need_login'   => '로그인하면 이어서 진행합니다.',
];
const CHAT_FREE_MB = 30;
const CHAT_FREE_REDO = 2;

return static function (Router $r): void {
    $msg = static function (string $k): string {
        static $cache = null;
        if ($cache === null) {
            $cache = [];
            try {
                foreach (Db::rows("SELECT k, v FROM core_settings WHERE k LIKE 'chat.msg.%'") as $row) $cache[substr((string) $row['k'], 9)] = (string) $row['v'];
            } catch (\Throwable) {
            }
        }
        return trim($cache[$k] ?? '') !== '' ? $cache[$k] : (CHAT_MSG[$k] ?? '');
    };
    $need = static function (Actor $a): array {
        if ($a->user === null || $a->kind === 'worker' || $a->via === 'key') throw HttpError::unauthorized(CHAT_MSG['need_login']);
        return [(int) $a->id(), (string) $a->user['email']];
    };
    $paid = static fn (Actor $a): bool => in_array($a->plan, ['pro', 'team', 'staff'], true) || $a->isAdmin();
    $ym = static fn (): string => date('Y-m');
    $usage = static function (int $uid) use ($ym): array {
        $row = Db::row('SELECT plan_n, mock_n, upload_n FROM chat_usage WHERE user_id = ? AND ym = ?', [$uid, $ym()]);
        return ['plan' => (int) ($row['plan_n'] ?? 0), 'mock' => (int) ($row['mock_n'] ?? 0), 'upload' => (int) ($row['upload_n'] ?? 0)];
    };
    $bump = static function (int $uid, string $col) use ($ym): void {
        Db::exec("INSERT INTO chat_usage (user_id, ym, $col) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE $col = $col + 1", [$uid, $ym()]);
    };
    $quota = static function (Actor $a, int $uid) use ($usage, $paid): array {
        $u = $usage($uid);
        $p = $paid($a);
        return ['paid' => $p, 'plan' => $u['plan'], 'mock' => $u['mock'], 'upload' => $u['upload'],
            'plan_max' => $p ? null : 1, 'mock_max' => $p ? null : 1, 'upload_max' => $p ? null : 1,
            'reset' => date('Y-m-01', strtotime('first day of next month'))];
    };
    $add = static function (int $pid, string $role, string $kind, ?string $body, ?array $card = null): void {
        Db::exec('INSERT INTO chat_messages (project_id, role, kind, body, card) VALUES (?, ?, ?, ?, ?)',
            [$pid, $role, $kind, $body, $card !== null ? json_encode($card, JSON_UNESCAPED_UNICODE) : null]);
        Db::exec('UPDATE chat_projects SET updated_at = NOW(3) WHERE id = ?', [$pid]);
    };
    $proj = static function (string $pub, int $uid): array {
        $row = Db::row('SELECT * FROM chat_projects WHERE public_id = ? AND user_id = ? AND deleted_at IS NULL', [$pub, $uid]);
        if (!$row) throw HttpError::notFound('프로젝트');
        $row['state'] = $row['state'] ? (json_decode((string) $row['state'], true) ?: []) : [];
        return $row;
    };
    $save = static function (array $p): void {
        Db::exec('UPDATE chat_projects SET step = ?, state = ?, title = ? WHERE id = ?',
            [$p['step'], json_encode($p['state'] ?: new \stdClass(), JSON_UNESCAPED_UNICODE), $p['title'], $p['id']]);
    };
    /** 입력 문장을 고른다 — Jev 가 먼저, 안 되면 낱말 규칙 */
    $intent = static function (string $text, array $choices, string $instructions): ?string {
        try {
            $c = Jev::choose('chat_intent', mb_substr($text, 0, 1500), $instructions, $choices, 0.55);
            if ($c !== null) return $c;
        } catch (\Throwable) {
        }
        return null;
    };
    /** 묻는 말인가 — 질문 꼴이고 만들어 달라는 말이 없다 */
    $isQuestion = static function (string $t): bool {
        $make = preg_match('/만들어|작성해|써 ?줘|써줘|해 ?줘|해줘|부탁|진행해|시작해|짜 ?줘/u', $t);
        $ask = preg_match('/[?？]\s*$|가능|할 수 있|되나|되나요|돼요|되요|될까|어떻게|뭐야|뭔가|무엇|뭘|있나|있어요|알려|궁금|차이|얼마|요금|가격/u', $t);
        return $ask && !$make;
    };
    $firstIntent = static function (string $text) use ($intent, $isQuestion): string {
        $c = $intent($text, [
            'proposal' => '제안서·발표 장표·PT·RFP·사업 계획서를 실제로 만들어 달라는 요청(주제·사업·발주처·자료를 적었다)',
            'question' => '질문 — 무엇을 할 수 있는지, 가능한지, 사용법·요금·계정·설치, 이 서비스가 무엇인지 묻는다',
            'other' => '장표가 아닌 다른 작업 요청 — 홈페이지 목업·시안·와이어프레임, 아이콘·사진 찾기, 디자인 토큰·부품 코드, MCP 연결',
            'out' => '플랫폼과 무관한 잡담·일반 지식·번역·코딩 질문',
        ], '사용자가 처음 보낸 말이 어떤 요청인지 고른다. 묻는 말이면 proposal 이 아니다.');
        // 질문 꼴인데 proposal 로 골랐으면 질문으로 본다 — "목업도 가능한가?" 가 장표 작업이 되던 것(2026-10-08)
        if ($c === 'proposal' && $isQuestion($text)) return 'question';
        if ($c !== null) return $c;
        if ($isQuestion($text)) return 'question';
        $cap = Assist::scopeByWords($text);
        if ($cap && !in_array($cap['capability'], ['deck_make', 'deck_polish'], true)) return 'other';
        if (preg_match('/제안|장표|발표|피티|PT|RFP|과업|기획|슬라이드|ppt|입찰|계획서|보고서/iu', $text)) return 'proposal';
        return 'question';
    };

    /** 작업 결과를 카드로 붙인다 — 같은 것은 한 번만. 무료 사용량도 여기서 센다. */
    $sync = static function (array $p, Actor $a, int $uid, string $email) use ($add, $save, $msg, $paid, $bump, $usage): array {
        if (!$p['deck_job_id']) return $p;
        try { $j = Jobs::get((string) $p['deck_job_id'], $email, $a->isAdmin()); } catch (\Throwable) { return $p; }
        $st = &$p['state'];
        $posted = $st['posted'] ?? [];
        $id = (string) $p['deck_job_id'];
        $fileUrl = static fn (string $kind, string $name): string => '/api/v1/deck/jobs/' . $id . '/files/' . $kind . '/' . rawurlencode($name);
        $status = (string) $j['status'];
        $phase = (string) ($j['phase'] ?? '');
        $pay = $paid($a);

        if ($status === 'failed' && ($st['fail_at'] ?? '') !== (string) $j['finished_at']) {
            $st['fail_at'] = (string) $j['finished_at'];
            $add((int) $p['id'], 'ai', 'text', $msg('failed'));
            $add((int) $p['id'], 'ai', 'actions', null, ['buttons' => [['act' => 'retry', 'label' => '다시 시도', 'primary' => true]]]);
            $p['step'] = 'failed';
        }
        if ($status === 'review' && $phase !== 'build') {
            $plan = is_array($j['plan'] ?? null) ? $j['plan'] : [];
            $slides = array_values(array_filter((array) ($plan['slides'] ?? []), 'is_array'));
            $mock = array_values(array_filter($j['files']['mockup'] ?? [], static fn ($f) => preg_match('/^s\d\d\.jpg$/', (string) $f['name'])));
            $mockTs = $mock ? max(array_map(static fn ($f) => (int) $f['ts'], $mock)) : 0;
            $first = empty($posted['review']);
            if ($first) {
                $add((int) $p['id'], 'ai', 'text', $msg('review_ready'));
                $ctx = array_values(array_filter($j['files']['mockup'] ?? [], static fn ($f) => $f['name'] === 'context.md'));
                if ($ctx) {
                    $txt = (string) @file_get_contents(Jobs::dir($id, 'mockup') . '/context.md');
                    if ($txt !== '') $add((int) $p['id'], 'ai', 'summary', null, ['text' => mb_substr($txt, 0, $pay ? 6000 : 2500)]);
                }
                if ($slides) {
                    $add((int) $p['id'], 'ai', 'outline', null, ['title' => (string) ($plan['title'] ?? $p['title']),
                        'items' => array_map(static fn ($s) => ['n' => (int) ($s['n'] ?? 0), 'title' => str_replace('**', '', (string) ($s['title'] ?? '')),
                            'desc' => $pay ? (string) ($s['message'] ?? '') : null], $slides), 'locked' => !$pay]);
                }
                $posted['review'] = 1;
                if (empty($st['counted'])) {   // 무료 한도는 결과가 나왔을 때 센다
                    $bump($uid, 'plan_n');
                    if ($mock) $bump($uid, 'mock_n');
                    $st['counted'] = 1;
                }
                // 2026-10-08 사용자: 확정 없이 앞질러 만들지 않는다 — 목차 → 기획 → 와이어프레임(A·B) → 시안 순서로 하나씩 확정받는다
                if (!$mock) {
                    $st['gate'] = 'toc';
                    $st['flow'] = 2;
                    $add((int) $p['id'], 'ai', 'actions', null, ['buttons' => [
                        ['act' => 'toc_ok', 'label' => '목차 확정 · 기획 보기', 'primary' => true],
                        ['act' => 'open', 'label' => '목차 고치기', 'href' => '/deck/jobs?id=' . $id]], 'job' => $id]);
                    $p['step'] = 'toc';
                }
            }
            if (($st['gate'] ?? 'mock') === 'mock' && ($first || $mockTs > (int) ($st['mock_ts'] ?? 0)) && ($mock || !isset($st['gate']))) {
                $byN = [];
                foreach ($slides as $s) $byN[(int) ($s['n'] ?? 0)] = $s;
                $shown = $pay ? $slides : [];
                if (!$pay) {   // 무료 — 시안이 나온 장(없으면 표지 다음 장) 하나만
                    $n = $mock ? (int) substr((string) $mock[0]['name'], 1, 2) : (int) (($slides[1] ?? $slides[0] ?? [])['n'] ?? 1);
                    if (isset($byN[$n])) $shown = [$byN[$n]];
                }
                if ($shown && empty($st['flow'])) {   // 새 흐름은 기획 확정 단계에서 이미 보여 줬다
                    $add((int) $p['id'], 'ai', 'plan', null, ['slides' => array_map(static fn ($s) => [
                        'n' => (int) ($s['n'] ?? 0), 'title' => str_replace('**', '', (string) ($s['title'] ?? '')), 'message' => (string) ($s['message'] ?? ''),
                        'content' => mb_substr((string) ($s['content'] ?? ''), 0, 1500), 'layout' => (string) ($s['layout'] ?? '')], array_slice($shown, 0, 40))]);
                }
                if ($mock) {
                    $keep = $pay ? $mock : array_slice($mock, 0, 1);
                    $add((int) $p['id'], 'ai', 'mockup', null, ['images' => array_map(static fn ($f) => ['n' => (int) substr((string) $f['name'], 1, 2),
                        'src' => $fileUrl('mockup', (string) $f['name']) . '?v=' . (int) $f['ts']], $keep)]);
                }
                $st['mock_ts'] = $mockTs;
                $btn = [['act' => 'redo', 'label' => '수정 요청']];
                if ($pay) array_unshift($btn, ['act' => 'build', 'label' => '시안 확정 · 장표 만들기', 'primary' => true]);
                else $btn[] = ['act' => 'upgrade', 'label' => 'pro 로 나머지 장 만들기', 'primary' => true];
                if (!$pay) $add((int) $p['id'], 'ai', 'limit', $msg('free_scope'));
                $add((int) $p['id'], 'ai', 'actions', null, ['buttons' => $btn, 'job' => $id]);
                $p['step'] = 'mockup';
            }
            // 만드는 동안 남긴 의견 — 결과 카드 뒤에 한 번 보여 주고 반영 여부를 묻는다(2026-10-08)
            $notes = array_values(array_filter((array) ($st['pending_notes'] ?? []), 'is_string'));
            if ($notes && empty($st['notes_posted'])) {
                $joined = implode("\n", $notes);
                $gate = (string) ($st['gate'] ?? 'mock');
                $btn = $gate === 'mock'
                    ? [['act' => 'redo', 'label' => '이 의견으로 다시 만들기', 'primary' => true, 'feedback' => $joined], ['act' => 'notes_skip', 'label' => '그대로 두기']]
                    : [['act' => 'notes_skip', 'label' => '의견 빼기']];
                $add((int) $p['id'], 'ai', 'actions', $gate === 'mock'
                    ? "만드는 동안 남기신 의견입니다.\n" . $joined
                    : "만드는 동안 남기신 의견입니다. 시안을 그릴 때 함께 반영합니다.\n" . $joined, ['buttons' => $btn, 'job' => $id]);
                $st['notes_posted'] = 1;
            }
        }
        if ($status === 'done' && $phase === 'build' && empty($posted['done'])) {
            $add((int) $p['id'], 'ai', 'result', $msg('done'), ['job' => $id, 'name' => (string) ($j['result_name'] ?? ''),
                'download' => '/api/v1/deck/jobs/' . $id . '/export.zip', 'open' => '/deck/jobs?id=' . $id]);
            $posted['done'] = 1;
            $p['step'] = 'done';
        }
        $st['posted'] = $posted;
        $save($p);
        unset($st);
        return $p;
    };
    $view = static function (array $p, Actor $a, int $uid, string $email) use ($quota): array {
        $msgs = Db::rows('SELECT id, role, kind, body, card, created_at FROM chat_messages WHERE project_id = ? ORDER BY id', [(int) $p['id']]);
        $job = null;
        if ($p['deck_job_id']) {
            $row = Db::row('SELECT status, phase, stage, progress, slides FROM deck_jobs WHERE id = ?', [$p['deck_job_id']]);
            if ($row) {
                $docs = Db::rows('SELECT id, name, size FROM deck_job_docs WHERE job_id = ? ORDER BY created_at', [$p['deck_job_id']]);
                $job = ['id' => $p['deck_job_id'], 'status' => $row['status'], 'phase' => $row['phase'], 'stage' => $row['stage'],
                    'progress' => (int) $row['progress'], 'docs' => array_map(static fn ($d) => ['id' => $d['id'], 'name' => $d['name'], 'size' => (int) $d['size']], $docs)];
            }
        }
        return ['id' => $p['public_id'], 'title' => $p['title'], 'step' => $p['step'], 'updated_at' => $p['updated_at'],
            'messages' => array_map(static fn ($m) => ['id' => (int) $m['id'], 'role' => $m['role'], 'kind' => $m['kind'], 'body' => $m['body'],
                'card' => $m['card'] ? json_decode((string) $m['card'], true) : null, 'at' => $m['created_at']], $msgs),
            'job' => $job, 'quota' => $quota($a, $uid)];
    };
    /** 무료 기획 한도 — 이번 달 1장을 이미 썼으면 막는다(LLM 을 부르기 전에) */
    $planGate = static function (Actor $a, int $uid) use ($paid, $usage, $msg): void {
        if (!$paid($a) && $usage($uid)['plan'] >= 1) throw new HttpError('LIMIT', $msg('plan_limit'), 402, 'plan');
    };

    $r->get('/chat/projects', static function (array $p, Actor $a) use ($need, $quota): void {
        [$uid] = $need($a);
        $rows = Db::rows('SELECT public_id, title, step, updated_at FROM chat_projects WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 30', [$uid]);
        Response::json(['items' => array_map(static fn ($x) => ['id' => $x['public_id'], 'title' => $x['title'], 'step' => $x['step'], 'updated_at' => $x['updated_at']], $rows),
            'quota' => $quota($a, $uid), 'greet' => CHAT_MSG['greet']]);
    });

    /** 앞 대화 — LLM 에 넘길 최근 말(사람 말과 AI 답 글만) */
    $hist = static function (int $pid): array {
        $rows = Db::rows("SELECT role, kind, body, card FROM chat_messages WHERE project_id = ? ORDER BY id DESC LIMIT 10", [$pid]);
        $out = [];
        foreach (array_reverse($rows) as $m) {
            $body = (string) ($m['body'] ?? '');
            if ($body === '' && $m['card']) {
                $c = json_decode((string) $m['card'], true) ?: [];
                $body = (string) ($c['body'] ?? '');
            }
            if (trim($body) === '') continue;
            $out[] = ['role' => $m['role'] === 'user' ? 'user' : 'assistant', 'content' => $body];
        }
        return $out;
    };
    /** 제안서 작업 시작 — 프로젝트(이미 있으면 그것)에 hold 작업을 붙이고 자료·기본 정보를 묻는다 */
    $startDeck = static function (?int $pid, string $text, Actor $a, int $uid, string $email) use ($msg, $add): string {
        // 프로젝트명 — 첫 말이 문장이면 그대로 쓰지 않는다. 사업명처럼 보이는 앞부분만 뽑고, 없으면 비워 두고 묻는다(2026-10-08 사용자)
        $one = trim((string) preg_replace('/\s+/u', ' ', $text));
        $guess = '';
        if (preg_match('/^(.{4,60}?(?:사업|프로젝트|구축|고도화|용역|플랫폼|시스템))(?:\s|의|을|를|에|$)/u', $one, $mm)
            && !preg_match('/다음 달|이번|해요|입니다|만들어/u', $mm[1])) {
            $guess = trim($mm[1]);
        } elseif (mb_strlen($one) <= 30 && !preg_match('/[.?!？]|요$|다$|해줘$/u', $one)) {
            $guess = $one;
        }
        $title = $guess !== '' ? mb_substr($guess, 0, 60) : '새 제안서';
        $job = Jobs::createDesign($email, ['brief' => $text, 'hold' => 1, 'title' => $title, 'mockups' => 'sample', 'sample' => 1]);
        if ($pid === null) {
            $pub = Ids::publicId();
            Db::exec('INSERT INTO chat_projects (public_id, user_id, title, step, deck_job_id, state) VALUES (?, ?, ?, ?, ?, ?)',
                [$pub, $uid, $title, 'upload', (string) $job['id'], '{}']);
            $pid = Db::lastId();
            $add($pid, 'user', 'text', $text);
        } else {
            Db::exec('UPDATE chat_projects SET deck_job_id = ?, step = ?, title = ? WHERE id = ?', [(string) $job['id'], 'upload', $title, $pid]);
            $pub = (string) Db::val('SELECT public_id FROM chat_projects WHERE id = ?', [$pid]);
        }
        $add($pid, 'ai', 'text', $msg('ask_docs'));
        $add($pid, 'ai', 'text', $msg('docs_note'));
        // 시작 전 기본 정보 — 프로젝트명·용도·장 수·발표일·강조색·로고(2026-10-08 사용자 "기본적인 것들을 물어봐야지")
        $add($pid, 'ai', 'basics', $msg('ask_basics'), ['project' => $guess, 'purpose' => 'present', 'slides' => 5,
            'slides_max' => in_array($a->plan, ['pro', 'team', 'staff'], true) || $a->isAdmin() ? 40 : 10, 'job' => (string) $job['id']]);
        return $pub;
    };

    // 첫 말 — powerLLM 이 무엇인지 고른다. 제안서 만들기면 powerDeck 작업까지, 그 밖(에셋·목업·가이드·질문)은 같은 대화에서 답한다(2026-10-08 사용자 "일도 시키고 궁금한 것도 묻고").
    $r->post('/chat/projects', static function (array $p, Actor $a) use ($need, $add, $view, $sync, $proj, $startDeck): void {
        [$uid, $email] = $need($a);
        $text = trim((string) (Response::input()['text'] ?? ''));
        if ($text === '') throw HttpError::invalid('하고 싶은 일을 적어 주세요.');
        if (mb_strlen($text) > 4000) throw HttpError::invalid('첫 말은 4,000자까지 적을 수 있어요. 긴 내용은 파일로 올려 주세요.');
        // 앞서 비로그인으로 나눈 말(최근 몇 개) — 이어서 답하게
        $prev = [];
        foreach ((array) (Response::input()['history'] ?? []) as $h) {
            if (is_array($h) && in_array($h['role'] ?? '', ['user', 'assistant'], true) && is_string($h['content'] ?? null)) {
                $prev[] = ['role' => $h['role'], 'content' => mb_substr($h['content'], 0, 1500)];
            }
        }
        $module = Concierge::route($text);
        if ($module === 'deck') {
            $pub = $startDeck(null, $text, $a, $uid, $email);
            Response::json(['project' => $view($sync($proj($pub, $uid), $a, $uid, $email), $a, $uid, $email)], 201);
        }
        $pub = Ids::publicId();
        $title = mb_substr(trim((string) preg_replace('/\s+/u', ' ', $text)), 0, 40);
        Db::exec('INSERT INTO chat_projects (public_id, user_id, title, step, deck_job_id, state) VALUES (?, ?, ?, ?, NULL, ?)',
            [$pub, $uid, $title, 'chat', '{}']);
        $pid = Db::lastId();
        $add($pid, 'user', 'text', $text);
        $add($pid, 'ai', 'reply', null, Concierge::reply($a, $text, $module, array_slice($prev, -6)));
        Response::json(['project' => $view($proj($pub, $uid), $a, $uid, $email)], 201);
    });

    // 비로그인 — 저장하지 않고 답만(같은 IP 한 시간 30번). 일(제안서 작업)은 로그인 뒤에.
    $r->post('/chat/ask', static function (array $p, Actor $a): void {
        $b = Response::input();
        $text = trim((string) ($b['text'] ?? ''));
        if (mb_strlen($text) < 2 || mb_strlen($text) > 2000) throw HttpError::invalid('2~2,000자로 적어 주세요.');
        $ref = 'chat-anon:' . substr(sha1(Audit::ip()), 0, 16);
        $n = (int) Db::val('SELECT COUNT(*) FROM core_decisions WHERE ref = ? AND created_at > NOW(3) - INTERVAL 1 HOUR', [$ref]);
        if ($n >= 30) throw HttpError::tooMany('잠시 뒤에 다시 물어봐 주세요. 로그인하면 계속 이어서 대화할 수 있어요.');
        try {
            Db::exec("INSERT INTO core_decisions (task, input_hash, ref, state_text, answer, model, cost_usd) VALUES ('chat_anon', ?, ?, '', '{}', '', 0)",
                [sha1(uniqid('', true)), $ref]);
        } catch (\Throwable) {
        }
        $hist = [];
        foreach ((array) ($b['history'] ?? []) as $h) {
            if (is_array($h) && in_array($h['role'] ?? '', ['user', 'assistant'], true) && is_string($h['content'] ?? null)) {
                $hist[] = ['role' => $h['role'], 'content' => mb_substr($h['content'], 0, 1500)];
            }
        }
        $module = Concierge::route($text);
        if ($module === 'deck') {
            Response::json(['reply' => ['kind' => 'reply', 'module' => 'deck', 'login' => true,
                'body' => "제안서는 이 대화에서 자료를 받아 목차·기획·시안까지 단계별로 만들어 드려요.\n로그인하면 지금 적은 말로 바로 시작합니다.", 'items' => [], 'links' => []]]);
        }
        Response::json(['reply' => Concierge::reply($a, $text, $module, array_slice($hist, -6))]);
    });

    $r->get('/chat/projects/{pid}', static function (array $p, Actor $a) use ($need, $proj, $sync, $view): void {
        [$uid, $email] = $need($a);
        $row = $proj((string) $p['pid'], $uid);
        Response::json($view($sync($row, $a, $uid, $email), $a, $uid, $email));
    });

    // 자료 올리기 시작 — 무료 한도(월 1건·30MB) 확인 뒤 powerDeck 분할 업로드를 연다. 조각은 /deck/uploads/{id}/{n} 로.
    $r->post('/chat/projects/{pid}/upload', static function (array $p, Actor $a) use ($need, $proj, $paid, $usage, $bump, $msg): void {
        [$uid, $email] = $need($a);
        $row = $proj((string) $p['pid'], $uid);
        $b = Response::input();
        $size = (int) ($b['size'] ?? 0);
        if (!$paid($a)) {
            if ($usage($uid)['upload'] >= 1) throw new HttpError('LIMIT', $msg('upload_limit'), 402, 'upload');
            if ($size > CHAT_FREE_MB * 1024 * 1024) throw new HttpError('LIMIT', $msg('size_limit'), 413, 'size');
        }
        $up = Uploads::create($email, ['filename' => (string) ($b['filename'] ?? ''), 'size' => $size, 'purpose' => 'doc', 'job_id' => (string) $row['deck_job_id']]);
        $bump($uid, 'upload_n');
        Response::json($up, 201);
    });

    // 말 보내기 — 지금 단계에 맞게 처리한다
    $r->post('/chat/projects/{pid}/messages', static function (array $p, Actor $a) use ($need, $proj, $add, $msg, $intent, $isQuestion, $sync, $view, $save, $hist, $startDeck): void {
        [$uid, $email] = $need($a);
        $row = $proj((string) $p['pid'], $uid);
        // 질문이면 powerLLM 이 답한다(어느 단계에서든) — 에셋·부품을 물으면 결과까지 붙는다
        $answer = static function (string $q) use ($add, $row, $a, $hist): void {
            $h = $hist((int) $row['id']);
            array_pop($h);   // 방금 넣은 질문은 reply 가 따로 붙인다
            $module = Concierge::route($q);
            $add((int) $row['id'], 'ai', 'reply', null, Concierge::reply($a, $q, $module === 'deck' ? 'help' : $module, $h));
        };
        $text = trim((string) (Response::input()['text'] ?? ''));
        if ($text === '') throw HttpError::invalid('보낼 말을 적어 주세요.');
        $text = mb_substr($text, 0, 4000);
        $add((int) $row['id'], 'user', 'text', $text);
        if (!$row['deck_job_id']) {
            // 일반 대화 — 제안서 만들기로 넘어가면 같은 대화에 powerDeck 작업을 붙인다
            if (Concierge::route($text) === 'deck') {
                $startDeck((int) $row['id'], $text, $a, $uid, $email);
            } else {
                $answer($text);
            }
            Response::json($view($sync($proj((string) $p['pid'], $uid), $a, $uid, $email), $a, $uid, $email));
        }
        $jobId = (string) $row['deck_job_id'];
        $status = (string) Db::val('SELECT status FROM deck_jobs WHERE id = ?', [$jobId]);
        // 작업과 관계없는 말(에셋 찾기·부품·목업·범위 밖)은 어느 단계에서든 바로 답한다 — 작업은 위에 고정된 채 계속 돈다(2026-10-08 사용자)
        $other = in_array(Concierge::route($text), ['assets', 'guide', 'mock', 'out'], true);
        if ($other) {
            $answer($text);
        } elseif ($status === 'hold' && $isQuestion($text)) {
            $answer($text);
        } elseif ($status === 'hold') {   // 자료 받는 중 — 적은 말은 기획에 쓸 내용으로 더한다
            Db::exec("UPDATE deck_jobs SET brief = CONCAT(COALESCE(brief, ''), '\n\n', ?) WHERE id = ? AND status = 'hold'", [$text, $jobId]);
            $add((int) $row['id'], 'ai', 'text', $msg('added_brief'));
        } elseif ($status === 'review') {
            $c = $intent($text, ['approve' => '좋다·진행·확정·다음으로 넘어가자는 승인', 'revise' => '바꿔 달라·고쳐 달라는 수정 요청', 'question' => '사용법이나 다른 것을 묻는 질문'],
                '시안 확인 단계에서 사용자가 보낸 말이 무엇인지 고른다.');
            if ($c === 'revise') {
                $row['state']['pending_fb'] = $text;
                $save($row);
                $add((int) $row['id'], 'ai', 'actions', '이 의견으로 다시 만들까요?', ['buttons' => [['act' => 'redo', 'label' => '이 의견으로 다시 만들기', 'primary' => true, 'feedback' => $text]]]);
            } elseif ($c === 'question' || ($c === null && $isQuestion($text))) {
                $answer($text);
            } else {
                $add((int) $row['id'], 'ai', 'text', $msg('ask_choice'));
            }
        } elseif (in_array($status, ['queued', 'running'], true)) {
            // 만드는 중 — 질문이면 바로 답하고, 그 밖의 말은 적어 두었다가 다음 결과에서 반영 여부를 묻는다(2026-10-08 사용자)
            $c = $intent($text, ['note' => '만들고 있는 이 제안서에 바라는 점·고칠 점·추가할 내용', 'question' => '사용법이나 진행 상황을 묻는 질문',
                'other' => '만들고 있는 제안서와 상관없는 다른 요청이나 질문'],
                '제안서를 만드는 동안 사용자가 보낸 말이 무엇인지 고른다.');
            if ($c === 'question' || $c === 'other' || ($c === null && $isQuestion($text))) {
                $answer($text);
            } else {
                $notes = array_values(array_filter((array) ($row['state']['pending_notes'] ?? []), 'is_string'));
                $notes[] = mb_substr($text, 0, 1500);
                $row['state']['pending_notes'] = array_slice($notes, -10);
                $row['state']['notes_posted'] = 0;
                $save($row);
                $add((int) $row['id'], 'ai', 'text', $msg('note_saved'));
            }
        } else {
            $answer($text);
        }
        Response::json($view($sync($proj((string) $p['pid'], $uid), $a, $uid, $email), $a, $uid, $email));
    });

    // 버튼 — start(검토 시작) · redo(수정 요청) · build(장표 만들기, pro) · retry(다시 시도)
    $r->post('/chat/projects/{pid}/action', static function (array $p, Actor $a) use ($need, $proj, $add, $msg, $paid, $planGate, $sync, $view, $save, $bump): void {
        [$uid, $email] = $need($a);
        $row = $proj((string) $p['pid'], $uid);
        $b = Response::input();
        $act = (string) ($b['act'] ?? '');
        $jobId = (string) $row['deck_job_id'];
        $admin = $a->isAdmin();
        $pay = $paid($a);
        if ($act === 'start') {
            $planGate($a, $uid);
            $opts = json_decode((string) Db::val('SELECT opts FROM deck_jobs WHERE id = ?', [$jobId]), true) ?: [];
            $opts['mockups'] = 'plan';   // 기획·와이어까지만 — 시안은 와이어 확정 뒤(2026-10-08)
            $opts['sample'] = 1;
            $bs = is_array($b['basics'] ?? null) ? $b['basics'] : [];
            $n = (int) ($bs['slides'] ?? ($b['slides'] ?? 0));
            if ($n > 0) $opts['slides'] = max(3, min($pay ? 40 : 10, $n));
            $sum = [];   // 사용자에게 다시 보여 줄 정한 내용
            if ($bs) {
                $pname = mb_substr(trim((string) ($bs['project'] ?? '')), 0, 80);
                if ($pname === '') throw HttpError::invalid('프로젝트명을 적어 주세요.');
                if ($pname !== '') { $opts['project'] = $pname; $row['title'] = mb_substr($pname, 0, 60); $sum[] = '프로젝트명 ' . $pname; }
                $opts['purpose'] = ($bs['purpose'] ?? '') === 'submit' ? 'submit' : 'present';
                $sum[] = $opts['purpose'] === 'submit' ? '제출용' : '발표용';
                $sum[] = (int) $opts['slides'] . '장';
                $ev = mb_substr(trim((string) ($bs['event'] ?? '')), 0, 30);
                if ($ev !== '') { $opts['event'] = $ev; $sum[] = '표지 ' . $ev; }
                $dt = mb_substr(trim((string) ($bs['date'] ?? '')), 0, 20);
                if ($dt !== '') { $opts['date'] = $dt; $sum[] = '발표일 ' . $dt; }
                $acc = strtoupper(trim((string) ($bs['accent'] ?? '')));
                if (preg_match('/^#[0-9A-F]{6}$/', $acc)) { Db::exec('UPDATE deck_jobs SET theme = ? WHERE id = ?', [$acc, $jobId]); $sum[] = '강조색 ' . $acc; }
                else $sum[] = '강조색은 자료 보고 정함';
                $sum[] = trim((string) ($bs['logos'] ?? '')) !== '' ? (string) $bs['logos'] : '로고 없음';
                if ($pname !== '') Db::exec('UPDATE deck_jobs SET title = ? WHERE id = ?', [mb_substr($pname, 0, 255), $jobId]);
            }
            Db::exec('UPDATE deck_jobs SET opts = ? WHERE id = ?', [json_encode($opts, JSON_UNESCAPED_UNICODE), $jobId]);
            Jobs::start($jobId, $email, $admin);
            $add((int) $row['id'], 'user', 'text', $sum ? "검토 시작\n" . implode(' · ', $sum) : '검토 시작');
            $add((int) $row['id'], 'ai', 'text', $msg('started'));
            $row['step'] = 'review';
            $save($row);
        } elseif (in_array($act, ['toc_ok', 'plan_ok', 'wire_ok'], true)) {
            // 단계 확정 — 목차 → 기획 → 와이어프레임 → 시안. 한 단계씩 보여 주고 확정받는다(2026-10-08 사용자)
            $j = Jobs::get($jobId, $email, $admin);
            if ((string) $j['status'] !== 'review') throw new HttpError('STATE', '지금은 확정할 단계가 아닙니다.', 409);
            $slides = array_values(array_filter((array) (($j['plan'] ?? [])['slides'] ?? []), 'is_array'));
            $open = ['act' => 'open', 'href' => '/deck/jobs?id=' . $jobId];
            $abWait = array_values(array_filter($slides, static fn ($s) => !empty($s['wire_alt']['b']) && empty($s['wire_pick'])));
            if ($act === 'toc_ok') {
                $shown = $pay ? $slides : (array_slice($slides, 1, 1) ?: array_slice($slides, 0, 1));
                $add((int) $row['id'], 'user', 'text', '목차 확정');
                $add((int) $row['id'], 'ai', 'text', '장마다 전할 말과 들어갈 내용입니다. 확인하고 확정해 주세요.');
                $add((int) $row['id'], 'ai', 'plan', null, ['slides' => array_map(static fn ($s) => [
                    'n' => (int) ($s['n'] ?? 0), 'title' => str_replace('**', '', (string) ($s['title'] ?? '')), 'message' => (string) ($s['message'] ?? ''),
                    'content' => mb_substr((string) ($s['content'] ?? ''), 0, 1500), 'layout' => (string) ($s['layout'] ?? '')], array_slice($shown, 0, 40))]);
                $add((int) $row['id'], 'ai', 'actions', null, ['buttons' => [
                    ['act' => 'plan_ok', 'label' => '기획 확정 · 와이어프레임 보기', 'primary' => true], $open + ['label' => '기획 고치기']], 'job' => $jobId]);
                $row['state']['gate'] = 'plan';
                $row['step'] = 'plan';
            } elseif ($act === 'plan_ok') {
                $add((int) $row['id'], 'user', 'text', '기획 확정');
                $add((int) $row['id'], 'ai', 'text', $abWait
                    ? '장마다 배치 두 가지(A·B)를 만들었습니다. 장별로 하나씩 골라 확정해 주세요. 고른 배치로 시안을 그립니다.'
                    : '와이어프레임이 준비됐습니다. 배치를 확인하고 확정해 주세요.');
                $add((int) $row['id'], 'ai', 'wire', null, ['job' => $jobId, 'open' => '/deck/jobs?id=' . $jobId,
                    'slides' => array_map(static fn ($s) => ['n' => (int) ($s['n'] ?? 0), 'title' => str_replace('**', '', (string) ($s['title'] ?? '')),
                        'ab' => !empty($s['wire_alt']['b']), 'pick' => (string) ($s['wire_pick'] ?? '')], $slides)]);
                $add((int) $row['id'], 'ai', 'actions', null, ['buttons' => [
                    ['act' => 'wire_ok', 'label' => '와이어프레임 확정 · 시안 만들기', 'primary' => true], $open + ['label' => 'A·B 고르기']], 'job' => $jobId]);
                $row['state']['gate'] = 'wire';
                $row['step'] = 'wire';
            } else {
                if ($abWait) throw new HttpError('AB_WAIT', 'A·B 를 아직 고르지 않은 장이 ' . count($abWait) . '장 있습니다. A·B 고르기에서 확정해 주세요.', 409);
                $ns = array_map(static fn ($s) => (int) ($s['n'] ?? 0), $slides);
                if (!$pay) $ns = array_slice($ns, 1, 1) ?: array_slice($ns, 0, 1);
                if (!$ns) throw HttpError::invalid('시안을 만들 장이 없습니다.');
                $notes = implode("\n", array_filter((array) ($row['state']['pending_notes'] ?? []), 'is_string'));   // 기다리는 동안 남긴 의견을 시안에 같이
                Jobs::approve($jobId, $email, $admin, ['mode' => 'redo', 'redo' => $ns, 'feedback' => $notes,
                    'slides' => array_map(static fn ($n) => ['n' => $n, 'feedback' => $notes], $ns)]
                    + ($pay ? ['front_redo' => ['cover', 'toc', 'div']] : []));
                unset($row['state']['pending_notes'], $row['state']['notes_posted']);
                if (empty($row['state']['mock_counted'])) { $bump($uid, 'mock_n'); $row['state']['mock_counted'] = 1; }
                $add((int) $row['id'], 'user', 'text', '와이어프레임 확정');
                $add((int) $row['id'], 'ai', 'text', '확정한 배치로 시안을 그리고 있습니다. 다 되면 이 자리에 올라옵니다.');
                $row['state']['gate'] = 'mock';
                $row['step'] = 'mockgen';
            }
            $save($row);
        } elseif ($act === 'redo') {
            $fb = trim((string) ($b['feedback'] ?? ($row['state']['pending_fb'] ?? '')));
            if ($fb === '') throw HttpError::invalid('어떻게 고칠지 적어 주세요.');
            if (!$pay && (int) ($row['state']['redo_n'] ?? 0) >= CHAT_FREE_REDO) throw new HttpError('LIMIT', $msg('redo_limit'), 402, 'redo');
            $j = Jobs::get($jobId, $email, $admin);
            $ns = array_map(static fn ($f) => (int) substr((string) $f['name'], 1, 2),
                array_values(array_filter($j['files']['mockup'] ?? [], static fn ($f) => preg_match('/^s\d\d\.jpg$/', (string) $f['name']))));
            if (!$ns) $ns = [1];
            if (!$pay) $ns = array_slice($ns, 0, 1);
            Jobs::approve($jobId, $email, $admin, ['mode' => 'redo', 'feedback' => $fb, 'redo' => $ns,
                'slides' => array_map(static fn ($n) => ['n' => $n, 'feedback' => $fb], $ns)]);
            $row['state']['redo_n'] = (int) ($row['state']['redo_n'] ?? 0) + 1;
            unset($row['state']['pending_fb'], $row['state']['pending_notes'], $row['state']['notes_posted']);
            $add((int) $row['id'], 'user', 'text', '수정 요청: ' . $fb);
            $add((int) $row['id'], 'ai', 'text', $msg('redo'));
            $row['step'] = 'review';
            $save($row);
        } elseif ($act === 'notes_skip') {
            unset($row['state']['pending_notes'], $row['state']['notes_posted']);
            $add((int) $row['id'], 'user', 'text', '남긴 의견 빼기');
            $add((int) $row['id'], 'ai', 'text', '남긴 의견은 반영하지 않습니다. 이어서 진행해 주세요.');
            $save($row);
        } elseif ($act === 'build') {
            if (!$pay) throw new HttpError('LOCKED', $msg('locked'), 402, 'build');
            Jobs::approve($jobId, $email, $admin, ['mode' => 'build']);
            $add((int) $row['id'], 'user', 'text', '시안 확정 · 장표 만들기');
            $add((int) $row['id'], 'ai', 'text', $msg('build'));
            $row['step'] = 'build';
            $save($row);
        } elseif ($act === 'retry') {
            Jobs::retry($jobId, $email, $admin);
            $add((int) $row['id'], 'ai', 'text', '다시 시도합니다.');
            $row['step'] = 'review';
            $save($row);
        } else {
            throw HttpError::invalid('모르는 동작입니다.');
        }
        Response::json($view($sync($proj((string) $p['pid'], $uid), $a, $uid, $email), $a, $uid, $email));
    });

    $r->delete('/chat/projects/{pid}', static function (array $p, Actor $a) use ($need, $proj): void {
        [$uid, $email] = $need($a);
        $row = $proj((string) $p['pid'], $uid);
        Db::exec('UPDATE chat_projects SET deleted_at = NOW(3) WHERE id = ?', [(int) $row['id']]);
        if ($row['deck_job_id']) {   // 아직 시작 안 한 작업은 같이 지운다(동시 작업 칸을 비우려고). 시작한 작업은 장표 목록에 남긴다
            $st = (string) Db::val('SELECT status FROM deck_jobs WHERE id = ?', [$row['deck_job_id']]);
            if ($st === 'hold') {
                try { Jobs::delete((string) $row['deck_job_id'], $email, false); } catch (\Throwable) {}
            }
        }
        Response::json(['ok' => true]);
    });
};
