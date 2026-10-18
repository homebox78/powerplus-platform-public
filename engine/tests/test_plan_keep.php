<?php
declare(strict_types=1);
/**
 * 기획 먼저 저장(R81) — 서버 Jobs::savePlan · finish(failed) 가 plan 칸을 남기는지. DB 없이 가짜 PDO 로 SQL·값만 받아 본다.
 *   php engine/tests/test_plan_keep.php          (전부 통과면 0)
 *   PD_API_DIR=<옛 api/src 사본> php …          음성 대조 — 고치기 전 Jobs.php 는 실패해야 한다
 * 운영 DB·네트워크 접근 없음.
 */

$src = getenv('PD_API_DIR') ?: dirname(__DIR__, 2) . '/api/src';
spl_autoload_register(static function (string $c) use ($src): void {
    if (!str_starts_with($c, 'Pp\\')) return;
    $rel = str_replace('\\', '/', substr($c, 3));
    $f = $src . '/' . $rel . '.php';
    if (!is_file($f)) $f = dirname(__DIR__, 2) . '/api/src/' . $rel . '.php';   // 사본에 없는 파일은 지금 저장소 것
    if (is_file($f)) require $f;
});

final class FakeStmt extends PDOStatement
{
    public string $sql = '';
    public ?FakePdo $db = null;
    private array $rows = [];
    public function execute(?array $params = null): bool
    {
        $this->db->log[] = [$this->sql, $params ?? []];
        if (preg_match('/^\s*SELECT \* FROM deck_jobs/i', $this->sql)) $this->rows = [$this->db->job];
        elseif (preg_match('/^\s*SELECT plan FROM deck_jobs/i', $this->sql)) $this->rows = [['plan' => $this->db->job['plan']]];
        if (preg_match('/^\s*UPDATE deck_jobs SET plan = :pl\b/', $this->sql)) $this->db->job['plan'] = $params[':pl'];
        return true;
    }
    public function fetch(int $mode = PDO::FETCH_DEFAULT, int $cursorOrientation = PDO::FETCH_ORI_NEXT, int $cursorOffset = 0): mixed
    {
        return array_shift($this->rows) ?? false;
    }
    public function fetchAll(int $mode = PDO::FETCH_DEFAULT, mixed ...$args): array
    {
        [$r, $this->rows] = [$this->rows, []];
        return $r;
    }
    public function rowCount(): int
    {
        return 0;
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
}

function fresh(array $over = []): FakePdo
{
    $db = new FakePdo();
    $db->job = $over + ['id' => 'ab12', 'email' => 'u@example.com', 'kind' => 'design', 'phase' => 'plan', 'status' => 'running', 'worker' => 'w1',
                        'plan' => null, 'opts' => null, 'attempts' => 1];
    $rp = new ReflectionProperty(\Pp\Core\Db::class, 'pdo');
    $rp->setValue(null, $db);
    return $db;
}

$plan = ['title' => 'T', 'slides' => [['n' => 1, 'title' => '가', 'wire' => [['kind' => 'card']]], ['n' => 2, 'title' => '나']]];
$tests = [];

$tests['savePlan — 진행 중 기획을 plan 칸에 저장(pre_mockup 유지)'] = static function () use ($plan): void {
    $db = fresh();
    if (!method_exists(\Pp\Deck\Jobs::class, 'savePlan')) throw new RuntimeException('Jobs::savePlan 없음');
    \Pp\Deck\Jobs::savePlan('ab12', 'w1', ['plan' => $plan + ['pre_mockup' => true]]);
    $got = json_decode((string) $db->job['plan'], true);
    if (($got['pre_mockup'] ?? null) !== true || count($got['slides'] ?? []) !== 2) throw new RuntimeException('plan 이 저장되지 않음: ' . var_export($db->job['plan'], true));
    if (empty($got['slides'][0]['wire_at'])) throw new RuntimeException('와이어 시각(wire_at)이 없음');
    if ($db->job['status'] !== 'running') throw new RuntimeException('상태가 바뀜');
};

$tests['savePlan — 제작 단계(build) 작업은 거절'] = static function () use ($plan): void {
    $db = fresh(['phase' => 'build']);
    if (!method_exists(\Pp\Deck\Jobs::class, 'savePlan')) throw new RuntimeException('Jobs::savePlan 없음');
    try {
        \Pp\Deck\Jobs::savePlan('ab12', 'w1', ['plan' => $plan]);
    } catch (\Pp\Core\HttpError $e) {
        if ($db->job['plan'] !== null) throw new RuntimeException('거절했는데 plan 이 바뀜');
        return;
    }
    throw new RuntimeException('거절하지 않음');
};

$tests['finish(failed) — 기획 단계 실패에도 엔진이 보낸 plan 을 남김'] = static function () use ($plan): void {
    $db = fresh();
    \Pp\Deck\Jobs::finish('ab12', 'w1', ['status' => 'failed', 'error' => '시안을 한 장도 만들지 못했습니다.', 'plan' => $plan + ['pre_mockup' => true]]);
    $got = json_decode((string) $db->job['plan'], true);
    if (count($got['slides'] ?? []) !== 2 || ($got['pre_mockup'] ?? null) !== true) throw new RuntimeException('실패 보고의 plan 이 저장되지 않음');
};

$tests['finish(failed) — plan 없이 실패하면 앞서 저장한 plan 을 지우지 않음'] = static function () use ($plan): void {
    $db = fresh(['plan' => json_encode($plan + ['pre_mockup' => true])]);
    \Pp\Deck\Jobs::finish('ab12', 'w1', ['status' => 'failed', 'error' => 'RuntimeError: x']);
    $got = json_decode((string) $db->job['plan'], true);
    if (count($got['slides'] ?? []) !== 2) throw new RuntimeException('plan 이 사라짐');
};

$tests['finish(failed) — 제작 단계 실패는 plan 을 건드리지 않음'] = static function () use ($plan): void {
    $db = fresh(['phase' => 'build', 'plan' => json_encode(['slides' => [['n' => 9]]])]);
    \Pp\Deck\Jobs::finish('ab12', 'w1', ['status' => 'failed', 'error' => 'x', 'plan' => $plan]);
    $got = json_decode((string) $db->job['plan'], true);
    if (($got['slides'][0]['n'] ?? 0) !== 9) throw new RuntimeException('제작 단계 plan 을 덮음');
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
echo (count($tests) - $bad) . '/' . count($tests) . " 통과\n";
exit($bad ? 1 : 0);
