<?php
declare(strict_types=1);
/**
 * 받기 링크 시험(test_deck_links.php)용 가짜 PDO — 상태를 JSON 파일 하나에 둔다(시험 본체와 php -S 서버가 같은 상태를 본다).
 * 다루는 SQL: deck_jobs 한 행 읽기 · deck_share_links 넣기/읽기/고치기/지우기 · core_rate_limits 세기 · core_audit 넣기. 나머지는 빈 결과.
 * 운영 DB·네트워크 접근 없음.
 */

final class LinkFakeStmt extends PDOStatement
{
    public string $sql = '';
    public ?LinkFakePdo $db = null;
    private array $rows = [];
    private int $count = 0;

    public function execute(?array $params = null): bool
    {
        $p = array_values($params ?? []);
        $named = $params ?? [];
        $sql = preg_replace('/\s+/', ' ', trim($this->sql));
        $s = &$this->db->state;
        $this->db->log[] = $sql;
        $this->rows = [];
        $this->count = 0;
        if (preg_match('/^SELECT \* FROM deck_jobs WHERE id = (\?|:i)/', $sql)) {
            $id = (string) ($named[':i'] ?? $p[0] ?? '');
            if (isset($s['jobs'][$id])) $this->rows = [$s['jobs'][$id]];
        } elseif (str_starts_with($sql, 'INSERT INTO deck_share_links')) {
            $s['seq'] = ($s['seq'] ?? 0) + 1;
            $s['links'][] = ['id' => $s['seq'], 'token_hash' => $p[0], 'token_tail' => $p[1], 'job_id' => $p[2], 'kind' => $p[3], 'created_by' => $p[4],
                'created_at' => $p[5], 'expires_at' => $p[6], 'revoked_at' => null, 'downloads' => 0, 'last_download_at' => null];
            $this->db->lastId = (string) $s['seq'];
            $this->count = 1;
        } elseif (str_starts_with($sql, 'SELECT * FROM deck_share_links WHERE token_hash = ?')) {
            foreach ($s['links'] ?? [] as $l) if ($l['token_hash'] === $p[0]) $this->rows = [$l];
        } elseif (preg_match('/^SELECT id, token_tail.* FROM deck_share_links WHERE job_id = \?/', $sql)) {
            $this->rows = array_values(array_reverse(array_filter($s['links'] ?? [], static fn ($l) => $l['job_id'] === $p[0])));
        } elseif (str_starts_with($sql, 'UPDATE deck_share_links SET revoked_at = ?')) {
            foreach ($s['links'] as &$l) if ($l['id'] === (int) $p[1] && $l['job_id'] === $p[2] && $l['revoked_at'] === null) { $l['revoked_at'] = $p[0]; $this->count++; }
            unset($l);
        } elseif (str_starts_with($sql, 'UPDATE deck_share_links SET downloads = downloads + 1')) {
            foreach ($s['links'] as &$l) if ($l['id'] === (int) $p[1]) { $l['downloads']++; $l['last_download_at'] = $p[0]; $this->count++; }
            unset($l);
        } elseif (str_starts_with($sql, 'DELETE FROM deck_share_links WHERE job_id = ?')) {
            $before = count($s['links'] ?? []);
            $s['links'] = array_values(array_filter($s['links'] ?? [], static fn ($l) => $l['job_id'] !== $p[0]));
            $this->count = $before - count($s['links']);
        } elseif (str_starts_with($sql, 'INSERT INTO core_rate_limits')) {
            $k = $p[0] . '|' . $p[1];
            $s['rl'][$k] = ($s['rl'][$k] ?? 0) + 1;
        } elseif (str_starts_with($sql, 'SELECT hits FROM core_rate_limits')) {
            $k = $p[0] . '|' . $p[1];
            if (isset($s['rl'][$k])) $this->rows = [['hits' => $s['rl'][$k]]];
        } elseif (str_starts_with($sql, 'INSERT INTO core_audit')) {
            $s['audit'][] = ['action' => $p[2], 'target' => $p[3] . ':' . $p[4], 'after' => $p[6]];
        } elseif (preg_match('/^DELETE FROM deck_jobs WHERE id = :i/', $sql)) {
            unset($s['jobs'][(string) $named[':i']]);
        }
        $this->db->save();
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

    public function fetchColumn(int $column = 0): mixed
    {
        $r = array_shift($this->rows);
        return $r ? array_values($r)[$column] : false;
    }

    public function rowCount(): int
    {
        return $this->count;
    }
}

final class LinkFakePdo extends PDO
{
    public array $state = [];
    public array $log = [];
    public string $lastId = '0';

    public function __construct(public string $file)
    {
        $this->state = is_file($file) ? (json_decode((string) file_get_contents($file), true) ?: []) : [];
    }

    public function save(): void
    {
        file_put_contents($this->file, json_encode($this->state, JSON_UNESCAPED_UNICODE));
    }

    public function prepare(string $query, array $options = []): PDOStatement|false
    {
        $st = new LinkFakeStmt();
        $st->sql = $query;
        $st->db = $this;
        return $st;
    }

    public function query(string $query, ?int $fetchMode = null, mixed ...$fetchModeArgs): PDOStatement|false
    {
        $st = $this->prepare($query);
        $st->execute();
        return $st;
    }

    public function lastInsertId(?string $name = null): string|false
    {
        return $this->lastId;
    }
}

function link_fake_install(string $stateFile): LinkFakePdo
{
    $db = new LinkFakePdo($stateFile);
    $rp = new ReflectionProperty(\Pp\Core\Db::class, 'pdo');
    $rp->setValue(null, $db);
    return $db;
}
