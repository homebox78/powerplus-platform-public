<?php
declare(strict_types=1);
/**
 * 파워덱 서버 흐름(2026-11-01 전체 검수 H1~H6·M1~M8·L1~L9, R151~R169) — DB 없이 가짜 PDO 로 SQL·값만 받아 본다.
 *   php engine/tests/test_deck_flow.php          (전부 통과면 0)
 *   PD_API_DIR=<고치기 전 api/src 사본> php …    음성 대조 — 고치기 전 코드는 대부분 실패해야 한다
 * 운영 DB·네트워크 접근 없음. 파일은 임시 폴더에만.
 */

$src = getenv('PD_API_DIR') ?: dirname(__DIR__, 2) . '/api/src';
spl_autoload_register(static function (string $c) use ($src): void {
    if (!str_starts_with($c, 'Pp\\')) return;
    $rel = str_replace('\\', '/', substr($c, 3));
    $f = $src . '/' . $rel . '.php';
    if (!is_file($f)) $f = dirname(__DIR__, 2) . '/api/src/' . $rel . '.php';   // 사본에 없는 파일은 지금 저장소 것
    if (is_file($f)) require $f;
});
$tmp = sys_get_temp_dir() . '/pp-deck-flow-' . bin2hex(random_bytes(4));
mkdir($tmp, 0775, true);
putenv('STORAGE_DIR=' . $tmp);
(new ReflectionProperty(\Pp\Core\Config::class, 'cfg'))->setValue(null, ['deck' => ['max_job_docs_mb' => 10]]);   // api/config.php 를 읽지 않게

// 경고도 실패로 — 공유 사용자 조회의 Undefined key 경고(L9)를 잡는다
set_error_handler(static function (int $no, string $msg): bool {
    if (str_contains($msg, 'headers already sent')) return true;   // 시험 글을 먼저 찍어 나는 경고 — 내려받기 머리를 보는 시험이 아니다
    throw new ErrorException($msg, 0, $no);
});

final class FakeStmt extends PDOStatement
{
    public string $sql = '';
    public ?FakePdo $db = null;
    private array $rows = [];
    public function execute(?array $params = null): bool
    {
        $this->db->log[] = [$this->sql, $params ?? []];
        $this->rows = ($this->db->route)($this->sql, $params ?? []) ?? [];
        return true;
    }
    public function fetch(int $mode = PDO::FETCH_DEFAULT, int $cursorOrientation = PDO::FETCH_ORI_NEXT, int $cursorOffset = 0): mixed
    {
        return array_shift($this->rows) ?? false;
    }
    public function fetchAll(int $mode = PDO::FETCH_DEFAULT, mixed ...$args): array
    {
        [$r, $this->rows] = [$this->rows, []];
        return $mode === PDO::FETCH_COLUMN ? array_map(static fn ($x) => array_values($x)[0], $r) : $r;
    }
    public function rowCount(): int
    {
        return 1;
    }
    public function fetchColumn(int $column = 0): mixed
    {
        $r = array_shift($this->rows);
        return $r ? array_values($r)[$column] : false;
    }
}

final class FakePdo extends PDO
{
    public array $log = [];
    public array $job = [];
    public array $docs = [];
    public array $newest = [];   // 잠금 안에서 읽히는 최신 기획·상태(SELECT … FOR UPDATE)
    public array $comment = [];
    /** @var callable */
    public $route;
    public function __construct() {}
    public function prepare(string $query, array $options = []): PDOStatement|false
    {
        $s = new FakeStmt();
        $s->sql = $query;
        $s->db = $this;
        return $s;
    }
    public function query(string $query, ?int $fetchMode = null, mixed ...$fetchModeArgs): PDOStatement|false
    {
        $s = $this->prepare($query);
        $s->execute();
        return $s;
    }
    public function lastInsertId(?string $name = null): string|false { return '1'; }
    public function beginTransaction(): bool { return true; }
    public function commit(): bool { return true; }
    public function rollBack(): bool { return true; }
    public function inTransaction(): bool { return false; }
    public function quote(string $s, int $t = PDO::PARAM_STR): string|false { return "'" . $s . "'"; }
}

function db(array $over = []): FakePdo
{
    $db = new FakePdo();
    $db->job = $over + ['id' => 'abcdef0123456789', 'email' => 'owner@example.com', 'title' => '사업', 'filename' => 'a.pptx', 'kind' => 'design', 'phase' => 'plan', 'status' => 'running',
        'worker' => 'w1', 'plan' => null, 'opts' => null, 'attempts' => 1, 'shared' => 0, 'size' => 1, 'slides' => null, 'progress' => 0, 'cancel_requested' => 0, 'pilot_slide' => null,
        'report' => null, 'budget_usd' => 2.0, 'spent_usd' => 1.5, 'budget_base_usd' => 0, 'review' => null, 'brief' => '내용', 'note' => null, 'feedback' => null, 'error' => null,
        'result_name' => null, 'source_kind' => 'text', 'docs_purged_at' => null];
    $db->route = static function (string $sql, array $p) use ($db): array {
        if (preg_match('/SELECT plan, status FROM deck_jobs/', $sql)) return [$db->newest ?: ['plan' => $db->job['plan'], 'status' => $db->job['status']]];
        if (preg_match('/SELECT \* FROM deck_job_comments/', $sql)) return [$db->comment];
        if (preg_match('/^\s*SELECT \* FROM deck_jobs/i', $sql)) return [$db->job];
        if (preg_match('/SELECT kind, slide, name, size/', $sql)) return $db->job['_files'] ?? [];
        if (preg_match('/FROM deck_job_docs/', $sql)) {
            if (str_contains($sql, 'SUM(size)')) return [['s' => array_sum(array_column($db->docs, 'size'))]];
            return $db->docs;
        }
        if (preg_match('/FROM deck_job_events/', $sql)) return [['id' => 1, 'ts' => 't', 'kind' => 'info', 'message' => '맥락 자료 읽음 — 비밀.pdf']];
        if (preg_match('/COUNT\(\*\) FROM deck_jobs WHERE email/', $sql)) return [['n' => 0]];
        return [];
    };
    (new ReflectionProperty(\Pp\Core\Db::class, 'pdo'))->setValue(null, $db);
    return $db;
}

/** 이 SQL 조각이 들어간 실행 기록 */
function ran(FakePdo $db, string $needle): array
{
    return array_values(array_filter($db->log, static fn ($l) => str_contains($l[0], $needle)));
}
function eventsOf(FakePdo $db): array
{
    return array_map(static fn ($l) => [$l[1][':k'], $l[1][':m']], ran($db, 'INSERT INTO deck_job_events'));
}
function fails(callable $fn, int $status): void
{
    try {
        $fn();
    } catch (\Pp\Core\HttpError $e) {
        $got = (new ReflectionClass($e))->hasProperty('status') ? (new ReflectionProperty($e, 'status'))->getValue($e) : $e->getCode();
        if ((int) $got !== $status) throw new RuntimeException("상태 {$got} (기대 {$status}): " . $e->getMessage());
        return;
    }
    throw new RuntimeException("막히지 않음(기대 {$status})");
}
function must(bool $ok, string $msg): void
{
    if (!$ok) throw new RuntimeException($msg);
}
/** 출력·헤더를 삼키고 실행 — 내려받기 */
function quiet(callable $fn): string
{
    ob_start();
    try {
        @$fn();
        return (string) ob_get_contents();
    } finally {
        ob_end_clean();
    }
}

use Pp\Deck\AiKeys;
use Pp\Deck\Jobs;
use Pp\Deck\Uploads;

const ID = 'abcdef0123456789';
const OWNER = 'owner@example.com';
$tests = [];

/* ── H1 공유 사용자에게 그림만 ── */
$tests['H1 sharedFileOk — 시안 그림은 되고 사업 요약·수치·기획·글 지도·결과는 안 된다'] = static function (): void {
    foreach ([['mockup', 's01.jpg'], ['mockup', 'cover.PNG'], ['after', 'front_1.jpeg'], ['before', 's02.png'], ['live', 'x.jpg']] as [$k, $n]) must(Jobs::sharedFileOk($k, $n), "$k/$n 는 받아야 함");
    foreach ([['mockup', 'context.md'], ['mockup', 'facts.json'], ['mockup', 'plan.json'], ['mockup', 'text_map.json'], ['mockup', 'deck_text.json'], ['result', 'a.pptx'], ['extra', 'a.jpg'], ['source', 'source.pptx'], ['mockup', '../x/context.md']] as [$k, $n]) {
        must(!Jobs::sharedFileOk($k, $n), "$k/$n 는 막아야 함");
    }
};
$tests['H1 send — 비로그인 공유(shared=3)가 context.md 를 받으면 403, 시안 그림은 된다(음성 대조 포함)'] = static function (): void {
    db(['shared' => 3]);
    $d = Jobs::dir(ID, 'mockup');
    file_put_contents($d . '/context.md', '사업 요약');
    file_put_contents($d . '/s01.jpg', 'JPG');
    fails(static fn () => Jobs::send(ID, '', false, 'mockup', 'context.md', false), 403);
    must(quiet(static fn () => Jobs::send(ID, '', false, 'mockup', 's01.jpg', false)) === 'JPG', '그림을 못 받음');
    must(quiet(static fn () => Jobs::send(ID, OWNER, false, 'mockup', 'context.md', false)) === '사업 요약', '주인도 못 받음');
};
$tests['H1 get(비로그인) — 비용·엔진·오류·보고서를 빼고 쪽 구성만, 파일 목록은 그림만'] = static function (): void {
    db(['shared' => 3, 'status' => 'done', 'error' => '비밀 오류', 'report' => json_encode(['summary' => '요약', 'checklist' => [['title' => 'x']], 'pages' => [['n' => 1]]]),
        '_files' => [['kind' => 'mockup', 'slide' => 1, 'name' => 's01.jpg', 'size' => 1, 'ts' => 1], ['kind' => 'mockup', 'slide' => null, 'name' => 'context.md', 'size' => 1, 'ts' => 1], ['kind' => 'result', 'slide' => null, 'name' => 'a.pptx', 'size' => 1, 'ts' => 1]]]);
    $j = Jobs::get(ID, '', false);
    foreach (['spent_usd', 'budget_usd', 'budget_base_usd', 'worker', 'error', 'email', 'est_image_usd'] as $k) must(!array_key_exists($k, $j), "$k 가 나감");
    must($j['report'] === ['pages' => [['n' => 1]]], '보고서: ' . json_encode($j['report']));
    must(array_column($j['files']['mockup'], 'name') === ['s01.jpg'] && $j['files']['result'] === [], '파일 목록: ' . json_encode($j['files']));
};
$tests['H1·L9 get(로그인 공유) — 자료 이름·기록 없음, Undefined key 경고 없음 / 주인은 그대로(음성 대조)'] = static function (): void {
    $db = db(['shared' => 1, 'status' => 'done']);
    $db->docs = [['id' => 'd', 'name' => '비밀.pdf', 'size' => 1, 'created_at' => 't']];
    $j = Jobs::get(ID, 'guest@example.com', false);
    must($j['docs'] === [] && $j['events'] === [], '공유 사용자에게 docs/events 가 나감');
    must(!array_key_exists('est_image_usd', $j), '보기 공유에 예상 비용이 나감');
    $o = Jobs::get(ID, OWNER, false);
    must(count($o['docs']) === 1 && count($o['events']) === 1, '주인이 자료·기록을 못 봄');
};

/* ── H2·L7 글 고치기 실패 ── */
$tests['H2 finish(failed:true) — 완성 상태로, 기록은 kind warn, 반영했습니다 없음'] = static function (): void {
    $db = db(['phase' => 'edit']);
    Jobs::finish(ID, 'w1', ['status' => 'done', 'message' => '글 고치기에 실패했습니다 — 장표는 이전 그대로입니다 (X)', 'failed' => true]);
    $ev = eventsOf($db);
    must(count($ev) === 1 && $ev[0][0] === 'warn' && str_contains($ev[0][1], '실패'), '기록: ' . json_encode($ev, JSON_UNESCAPED_UNICODE));
    $u = ran($db, "status = 'done', stage = '완료'");
    must(count($u) === 1 && $u[0][1][':p'] === 'build', '완성 상태로 안 돌아감');
};
$tests['H2 finish(성공) — kind done 으로 반영했습니다(음성 대조)'] = static function (): void {
    $db = db(['phase' => 'edit']);
    Jobs::finish(ID, 'w1', ['status' => 'done', 'message' => '글 2곳을 고쳤습니다.', 'failed' => false]);
    $ev = eventsOf($db);
    must(end($ev)[0] === 'done' && end($ev)[1] === '글 2곳을 고쳤습니다.', '기록: ' . json_encode($ev, JSON_UNESCAPED_UNICODE));
};
$tests['L7 finish(status=failed, 글 고치기) — 실패 작업으로 만들지 않고 반영 문구도 없음'] = static function (): void {
    $db = db(['phase' => 'edit', 'kind' => 'polish']);
    Jobs::finish(ID, 'w1', ['status' => 'failed', 'error' => 'RuntimeError: x']);
    $ev = eventsOf($db);
    must($ev[0][0] === 'warn' && str_contains($ev[0][1], '실패') && !str_contains($ev[0][1], '반영했습니다'), '기록: ' . json_encode($ev, JSON_UNESCAPED_UNICODE));
    must(ran($db, "status = 'done', stage = '완료'")[0][1][':p'] === 'full', '다듬기 단계로 안 돌아감');
    must(!ran($db, 'UPDATE deck_jobs SET status = :s'), '일반 완료 경로로 샘');
};

/* ── H3·M2·M3·M5 다시 돌리기 ── */
$tests['H3 retry — 기준선을 지금 사용액으로(세로 제안서)'] = static function (): void {
    $db = db(['status' => 'done', 'opts' => json_encode(['purpose' => 'submit']), 'phase' => 'plan']);
    Jobs::retry(ID, OWNER, false);
    must((bool) ran($db, 'budget_base_usd=spent_usd'), '기준선이 안 잡힘');
};
$tests['H3 한도 글 — 세로·회사소개에는 시안 확정 얘기가 없고 다시 돌리기를 말한다'] = static function (): void {
    $m = AiKeys::budgetStopMessage(5.0, 5.0, [], 0.0, true);
    must(str_contains($m, '다시 돌리면') && str_contains($m, '다시 채웁니다') && !str_contains($m, '시안을 확정하면'), $m);
    $g = AiKeys::budgetStopMessage(5.0, 5.0, []);
    must(str_contains($g, '시안을 확정하면'), '가로 글이 바뀜: ' . $g);
};
$tests['M2 retry — 완성된 작업은 앞선 부분 수정을 지운다, 실패한 수정은 잇는다(음성 대조)'] = static function (): void {
    $rv = json_encode(['revise' => ['all' => false, 'slides' => [2]]]);
    $db = db(['status' => 'done', 'phase' => 'build', 'review' => $rv]);
    Jobs::retry(ID, OWNER, false);
    must((bool) ran($db, ', review=NULL'), '완성 작업의 수정 범위가 남음');
    $db = db(['status' => 'failed', 'phase' => 'build', 'review' => $rv]);
    Jobs::retry(ID, OWNER, false);
    must(!ran($db, ', review=NULL'), '실패한 수정 요청의 범위까지 지움');
};
$tests['M3 backRequested — 표시가 있어도 멈춤 요청 없음·제작 단계면 false'] = static function (): void {
    $o = json_encode(['back' => 1]);
    must(Jobs::backRequested(['opts' => $o, 'cancel_requested' => 1, 'phase' => 'plan']), '유효한 요청을 못 봄');
    must(!Jobs::backRequested(['opts' => $o, 'cancel_requested' => 0, 'phase' => 'plan']), '멈춤 요청 없이 true');
    must(!Jobs::backRequested(['opts' => $o, 'cancel_requested' => 1, 'phase' => 'build']), '제작 단계에서 true — 기획이 지워짐');
};
$tests['M3 finish — 멈추기 전에 끝나면 표시를 지운다 / 제작 단계 취소는 기획을 안 지운다 / 진짜 멈춤은 hold'] = static function (): void {
    $db = db(['opts' => json_encode(['back' => 1, 'lang' => 'ko']), 'cancel_requested' => 1]);
    Jobs::finish(ID, 'w1', ['status' => 'done']);
    $u = ran($db, 'SET opts = :o, cancel_requested = 0');
    must(count($u) === 1 && !isset(json_decode((string) $u[0][1][':o'], true)['back']), '표시가 안 지워짐');
    $db = db(['phase' => 'build', 'opts' => json_encode(['back' => 1]), 'cancel_requested' => 1]);
    Jobs::finish(ID, 'w1', ['status' => 'canceled']);
    must(!ran($db, "status = 'hold'"), '제작 단계 취소가 hold 로 — 기획·시안이 지워짐');
    $db = db(['opts' => json_encode(['back' => 1]), 'cancel_requested' => 1]);
    Jobs::finish(ID, 'w1', ['status' => 'canceled']);
    must((bool) ran($db, "status = 'hold'"), '진짜 멈춤이 hold 로 안 감(음성 대조)');
};
$tests['M3 cancel(진행 중) — 남은 표시를 지운다'] = static function (): void {
    $db = db(['opts' => json_encode(['back' => 1])]);
    Jobs::cancel(ID, OWNER, false);
    $u = ran($db, 'cancel_requested = 1, opts = :o');
    must(count($u) === 1 && !isset(json_decode((string) $u[0][1][':o'], true)['back']), '표시가 남음');
};
$tests['M5 retry — 자료·글이 다 지워졌으면 비용 쓰기 전에 막는다 / 글·자료·기획이 있으면 통과(음성 대조)'] = static function (): void {
    db(['status' => 'done', 'brief' => null, 'opts' => json_encode(['purpose' => 'submit'])]);
    fails(static fn () => Jobs::retry(ID, OWNER, false), 409);
    $d = db(['status' => 'done', 'brief' => null, 'opts' => json_encode(['purpose' => 'submit'])]);
    $d->docs = [['id' => 'x', 'name' => 'a.pdf', 'size' => 1, 'created_at' => 't']];
    must(!Jobs::nothingToRead($d->job), '자료가 있는데 막음');
    must(!Jobs::nothingToRead(db(['status' => 'failed', 'brief' => '내용'])->job), '글이 있는데 막음');
    must(!Jobs::nothingToRead(db(['status' => 'failed', 'brief' => null, 'plan' => json_encode(['slides' => [['n' => 1]]])])->job), '가로 작업은 기획이 있으면 다시 돌릴 수 있어야 함');
    must(!Jobs::nothingToRead(db(['status' => 'failed', 'brief' => null, 'note' => str_repeat('가', 200)])->job), '요청 글이 충분한데 막음');
};

/* ── H5 pptx 옵션 ── */
$tests['H5 jobOpts → Jobs::opts — 화면이 보내는 옵션이 pptx 로 시작해도 빠짐없이 간다'] = static function (): void {
    $b = ['kind' => 'design', 'hold' => true, 'slides' => 12, 'slides_set' => true, 'mockups' => 'sample', 'sample' => 2, 'project' => '사업', 'front' => ['cover' => false], 'event' => '설명회', 'date' => '2026.11',
          'style' => 'c', 'purpose' => 'submit', 'vstyle' => 'tab', 'vtone' => 'teal', 'ctheme' => 'd', 'ctone' => '#7C3AED', 'cfree' => true, 'lang' => 'en', 'font_title' => 'gmarket', 'font_body' => 'pretendard'];
    $o = Uploads::jobOpts($b);
    must($o['kind'] === 'design' && $o['hold'] === true, 'kind·hold');
    $op = json_decode((string) (new ReflectionMethod(Jobs::class, 'opts'))->invoke(null, $o, true), true);
    foreach (['slides' => 12, 'slides_set' => true, 'mockups' => 'sample', 'sample' => 2, 'project' => '사업', 'event' => '설명회', 'date' => '2026.11', 'style' => 'c', 'purpose' => 'submit', 'vstyle' => 'tab', 'vtone' => 'teal', 'ctheme' => 'd', 'ctone' => '#7C3AED', 'cfree' => true, 'lang' => 'en', 'font_title' => 'gmarket', 'font_body' => 'pretendard'] as $k => $v) {
        must(($op[$k] ?? null) === $v, "$k 가 버려짐: " . json_encode($op[$k] ?? null));
    }
    $d = Uploads::jobOpts([]);   // 빈 값부터(R09)
    must($d['kind'] === 'polish' && $d['slides'] === 0 && $d['mockups'] === 'plan', '기본값');
};

/* ── H6 확정이 최신 기획을 쓴다 ── */
$approve = static function (string $mode, array $extra = []): FakePdo {
    $old = json_encode(['slides' => [['n' => 1, 'title' => '옛', 'wire' => [['id' => 'old']]]]]);
    $new = json_encode(['slides' => [['n' => 1, 'title' => '옛', 'wire' => [['id' => 'NEW']]]]]);
    $db = db(['status' => 'review', 'plan' => $old]);
    $db->newest = ['plan' => $new, 'status' => 'review'];
    $b = ['mode' => $mode, 'slides' => [['n' => 1, 'title' => '고친 제목']]] + $extra;
    (new ReflectionMethod(Jobs::class, 'approveDesign'))->invoke(null, $db->job, OWNER, false, $b);
    return $db;
};
$tests['H6 시안 확정 — 잠금 안의 최신 기획(뒤늦게 저장된 와이어) + 장별 수정을 쓴다'] = static function () use ($approve): void {
    $db = $approve('build');
    must((bool) ran($db, 'FOR UPDATE'), '기획을 잠그지 않음');
    $u = ran($db, "phase = 'build', plan = COALESCE(:pl, plan)");
    $pl = json_decode((string) $u[0][1][':pl'], true);
    must($pl['slides'][0]['wire'][0]['id'] === 'NEW', '옛 기획으로 덮음: ' . json_encode($pl));
    must($pl['slides'][0]['title'] === '고친 제목', '장별 수정이 빠짐');
};
$tests['H6 시안 다시 만들기 — 같은 규칙'] = static function () use ($approve): void {
    $db = $approve('redo', ['redo' => [1]]);
    $u = ran($db, "phase = 'plan', plan = COALESCE(:pl, plan)");
    must(json_decode((string) $u[0][1][':pl'], true)['slides'][0]['wire'][0]['id'] === 'NEW', '옛 기획으로 덮음');
};
$tests['H6 두 번 눌러 이미 돌고 있으면 되돌리지 않는다'] = static function (): void {
    $db = db(['status' => 'review', 'plan' => json_encode(['slides' => []])]);
    $db->newest = ['plan' => $db->job['plan'], 'status' => 'running'];
    fails(static fn () => (new ReflectionMethod(Jobs::class, 'approveDesign'))->invoke(null, $db->job, OWNER, false, ['mode' => 'build']), 409);
};

/* ── M1 결과 파일 하나 ── */
$tests['M1 pickResult — result_name 파일 → 없으면 최근 것 / 이름순 첫 파일이 아니다(음성 대조)'] = static function () use ($tmp): void {
    $d = $tmp . '/pick';
    @mkdir($d);
    foreach (['a_v0.2.pptx' => time() - 500, 'b_v0.6.pptx' => time() - 50, 'c_old.pptx' => time() - 900] as $n => $t) { file_put_contents("$d/$n", 'x'); touch("$d/$n", $t); }
    $all = glob("$d/*.pptx");
    must(basename($all[0]) === 'a_v0.2.pptx', '음성 입력: 이름순 첫 파일은 옛 판이어야 함');
    must(basename((string) Jobs::pickResult($all, 'c_old.pptx')) === 'c_old.pptx', 'result_name 을 안 봄');
    must(basename((string) Jobs::pickResult($all, '')) === 'b_v0.6.pptx', '최근 파일을 안 봄');
    must(basename((string) Jobs::pickResult($all, '없는이름.pptx')) === 'b_v0.6.pptx', '없는 이름에서 최근 파일로 안 감');
    must(Jobs::pickResult([], 'x') === null, '빈 목록');
};
$tests['M1 claim — 글 고치기가 받을 파일이 지금 결과(이름순 첫 파일 아님)'] = static function (): void {
    $id = 'abcdef0123456780';
    $d = Jobs::dir($id, 'result');
    foreach (['a.pptx' => time() - 500, 'z.pptx' => time()] as $n => $t) { file_put_contents("$d/$n", 'x'); touch("$d/$n", $t); }
    $db = db(['id' => $id, 'status' => 'queued', 'result_name' => 'z.pptx']);
    $base = $db->route;
    $db->route = static function (string $sql, array $p) use ($base, $db, $id): array {
        if (str_starts_with(trim($sql), 'SELECT id FROM deck_jobs WHERE status')) return [['id' => $id]];
        if (preg_match('/SELECT id, email, title/', $sql)) return [$db->job];
        return $base($sql, $p);
    };
    $row = Jobs::claim('w1');
    must(($row['result_file'] ?? null) === 'z.pptx', 'result_file=' . var_export($row['result_file'] ?? null, true));
};

/* ── M7 올리기 전 검사 ── */
$tests['M7 create(doc) — 남의 작업은 시작할 때 막고 임시 파일도 안 만든다'] = static function () use ($tmp): void {
    $db = db(['status' => 'hold']);
    fails(static fn () => Uploads::create('other@example.com', ['filename' => 'a.pdf', 'size' => 100, 'purpose' => 'doc', 'job_id' => ID]), 404);
    must(!ran($db, 'INSERT INTO deck_uploads'), '행이 만들어짐');
};
$tests['M7 create(doc) — 작업당 자료 합계를 넘으면 413, 안 넘으면 통과(음성 대조)'] = static function (): void {
    $db = db(['status' => 'hold']);
    $db->docs = [['size' => 9 * 1024 * 1024]];
    fails(static fn () => Uploads::create(OWNER, ['filename' => 'a.pdf', 'size' => 2 * 1024 * 1024, 'purpose' => 'doc', 'job_id' => ID]), 413);
    $r = Uploads::create(OWNER, ['filename' => 'a.pdf', 'size' => 1024, 'purpose' => 'doc', 'job_id' => ID]);
    must(!empty($r['id']) && (bool) ran($db, 'INSERT INTO deck_uploads'), '정상 업로드가 막힘');
};
$tests['M7 retention — 업로드 정리 블록이 임시 파일·행을 지운다(소스 대조)'] = static function (): void {
    // 줄 끝을 LF 로 — CRLF 로 체크아웃된 저장소(홈박스 갈래)에서 '\n' 대조가 늘 실패해 배포가 멈췄다(R182)
    $s = str_replace("\r\n", "\n", (string) file_get_contents(dirname(__DIR__, 2) . '/api/bin/retention.php'));
    must(str_contains($s, "status LIKE 'open%' AND created_at < NOW() - INTERVAL 3 DAY") && str_contains($s, "'.part'") && str_contains($s, 'DELETE FROM deck_uploads'), '정리 코드 없음');
    must(str_contains($s, 'if (!$dry) {' . "\n" . '            @unlink($upDir'), '--dry 에서도 지움');
    must(str_contains((string) file_get_contents(dirname(__DIR__, 2) . '/scripts/deploy.sh'), 'addcron retention.php'), '크론 등록 없음(R47)');
};

/* ── M8 ── */
$tests['M8 createDesign — 내용·제목 없이 자료만(hold)이어도 500 이 아니다'] = static function (): void {
    $db = db(['status' => 'hold']);
    Jobs::createDesign(OWNER, ['hold' => true, 'brief' => '', 'title' => '']);
    $u = ran($db, 'INSERT INTO deck_jobs');
    must(count($u) === 1 && $u[0][1][':t'] === '새 장표', '제목: ' . json_encode($u[0][1][':t'] ?? null, JSON_UNESCAPED_UNICODE));
};

/* ── L1·L2·L6 ── */
$tests['L1 편집자 해결 표시 — 남의 의견도 되고, 글 고치기·지우기는 403 / 보기 공유는 403(음성 대조)'] = static function (): void {
    $db = db(['shared' => 2, 'status' => 'review']);
    $db->comment = ['id' => 7, 'email' => 'author@example.com', 'job_id' => ID];
    Jobs::editComment(ID, 7, 'editor@example.com', false, ['resolved' => true]);
    must((bool) ran($db, 'SET resolved = ?'), '해결 표시가 안 됨');
    fails(static fn () => Jobs::editComment(ID, 7, 'editor@example.com', false, ['body' => '바꿈']), 403);
    fails(static fn () => Jobs::editComment(ID, 7, 'editor@example.com', false, [], true), 403);
    $db = db(['shared' => 1, 'status' => 'review']);
    $db->comment = ['id' => 7, 'email' => 'author@example.com', 'job_id' => ID];
    fails(static fn () => Jobs::editComment(ID, 7, 'viewer@example.com', false, ['resolved' => true]), 403);
};
$tests['L2 삭제 — 자료 목록·의견·답글 행과 와이어 기록 파일까지'] = static function (): void {
    $db = db(['status' => 'done']);
    $dir = \Pp\Deck\Legacy::dataDir() . '/wire_feedback';
    @mkdir($dir, 0775, true);
    file_put_contents($dir . '/' . ID . '.json', '{}');
    Jobs::delete(ID, OWNER, false);
    foreach (['deck_job_docs', 'deck_job_comments', 'deck_job_comment_replies', 'deck_job_files', 'deck_job_events'] as $t) must((bool) ran($db, "DELETE FROM $t"), "$t 가 남음");
    must(!is_file($dir . '/' . ID . '.json'), '와이어 기록 파일이 남음');
};
$tests['L6 대기 중 글 고치기 취소 — 완성으로 돌아간다 / 보통 작업 취소는 canceled(음성 대조)'] = static function (): void {
    $db = db(['status' => 'queued', 'phase' => 'edit']);
    Jobs::cancel(ID, OWNER, false);
    must((bool) ran($db, "status = 'done', stage = '완료'") && !ran($db, "status = 'canceled'"), '완성본이 취소로 표시됨');
    $db = db(['status' => 'queued', 'phase' => 'plan']);
    Jobs::cancel(ID, OWNER, false);
    must((bool) ran($db, "status = 'canceled'"), '보통 취소가 안 됨');
};
$tests['L6 reap — 끊긴 글 고치기 취소·실패도 완성으로(실패 작업 안 만듦)'] = static function (): void {
    $db = db();
    $base = $db->route;
    $db->route = static function (string $sql, array $p) use ($base): array {
        if (str_contains($sql, 'heartbeat_at < (NOW() - INTERVAL 90 SECOND)')) return [['id' => ID, 'opts' => null, 'phase' => 'edit', 'kind' => 'design', 'cancel_requested' => 1]];
        if (str_contains($sql, 'heartbeat_at < (NOW() - INTERVAL 15 MINUTE)')) return [['id' => ID, 'worker' => 'w', 'attempts' => 3, 'phase' => 'edit', 'kind' => 'design']];
        return $base($sql, $p);
    };
    Jobs::reap();
    must(count(ran($db, "status = 'done', stage = '완료'")) === 2 && !ran($db, "SET status = 'failed'") && !ran($db, "SET status = 'canceled'"), json_encode(array_column($db->log, 0), JSON_UNESCAPED_UNICODE));
};

/* ── L3·L4 라우트 ── */
$routes = static function (): array {
    $r = new \Pp\Core\Router();
    (require dirname(__DIR__, 2) . '/api/routes/deck.php')($r);
    $all = (new ReflectionProperty($r, 'routes'))->getValue($r);
    $by = [];
    foreach ($all as $m => $list) foreach ($list as $x) $by[$m . ' ' . $x['p']] = $x['h'];
    return $by;
};
$actor = static fn (string $via, array $roles = []): \Pp\Core\Actor => new \Pp\Core\Actor(['id' => 1, 'email' => OWNER], null, 'staff', 'staff', $roles, null, $via);
$tests['L4 회사 키 잔액 — 일반 회원 403'] = static function () use ($routes, $actor): void {
    db();
    fails(static fn () => $routes()['GET /deck/ai/key/check']([], $actor('session')), 403);
};
$tests['L3 키로 shared=3 은 403, 소스에 감사 기록'] = static function () use ($routes, $actor): void {
    db(['status' => 'done']);
    $h = $routes()['PATCH /deck/jobs/{id}'];
    // Legacy::body 가 php://input 을 읽어 CLI 에서는 빈 값 — 판정 식을 소스로 함께 본다
    $s = (string) file_get_contents(dirname(__DIR__, 2) . '/api/routes/deck.php');
    must(str_contains($s, "\$share === 3 && \$a->via !== 'session'") && str_contains($s, "Audit::log(\$a, 'deck.share'"), '키 차단·감사 기록 코드 없음');
    must(is_callable($h), 'PATCH 라우트 없음');
};

/* ── 음성 대조: 판정기 자체 ── */
$tests['음성 대조 — fails 는 막히지 않으면 실패한다'] = static function (): void {
    try {
        fails(static fn () => null, 403);
    } catch (RuntimeException) {
        return;
    }
    throw new RuntimeException('측정기가 동작하지 않음');
};

$bad = 0;
foreach ($tests as $name => $fn) {
    try {
        $fn();
        echo "통과  $name\n";
    } catch (\Throwable $e) {
        $bad++;
        echo "실패  $name: " . get_class($e) . ': ' . $e->getMessage() . "\n";
    }
}
restore_error_handler();
$rm = static function (string $p) use (&$rm): void {
    if (is_dir($p)) { foreach (array_diff((array) scandir($p), ['.', '..']) as $f) $rm("$p/$f"); @rmdir($p); } else { @unlink($p); }
};
$rm($tmp);
echo (count($tests) - $bad) . '/' . count($tests) . " 통과\n";
exit($bad ? 1 : 0);
