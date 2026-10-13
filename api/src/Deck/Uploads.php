<?php
declare(strict_types=1);

namespace Pp\Deck;

use Pp\Core\Db;
use Pp\Core\Config;
use Pp\Core\Response;
use Pp\Core\HttpError;

/*
 * 출처: powerDeck api/src/Uploads.php (D:\powerDeck, 2026-10-06 이식). 로직·JSON 모양은 그대로 두고
 * 전역 Db/Config/fail/json_out → Pp\Core(Db·Config·Response·HttpError) 어댑터(Legacy), 테이블은 deck_ 접두, 설정은 Config 'deck.<key>' 로 바꿨다.
 */


/**
 * 대용량 분할 업로드 — 끊겨도 이어서 올린다.
 *
 *   POST /api/uploads              {filename, size, purpose?: 'source'|'doc', job_id?}   → {id, chunk_size, chunks, received:[]}
 *   GET  /api/uploads/{id}                                   → 받은 조각 목록(이어올리기)
 *   PUT  /api/uploads/{id}/{n}     본문 = 조각 원본 바이트       → 받은 조각 수
 *   POST /api/uploads/{id}/complete {title, note, …}         → 작업(job) 생성  /  purpose=doc 이면 작업에 맥락 자료로 붙인다
 *
 * 조각은 PUT 원본 바이트로 받는다 — PHP post_max_size·upload_max_filesize 에 걸리지 않는다.
 * 조각은 순서와 무관하게 자기 위치(n × chunk_size)에 쓰여, 몇 번 다시 보내도 결과가 같다.
 */
final class Uploads
{
    public const CHUNK = 8 * 1024 * 1024;

    private static function dir(): string
    {
        $d = Legacy::dataDir() . '/uploads';
        if (!is_dir($d)) mkdir($d, 0775, true);
        return $d;
    }

    public static function create(string $email, array $b): array
    {
        $name = trim(basename(str_replace('\\', '/', (string) ($b['filename'] ?? ''))));
        $size = (int) ($b['size'] ?? 0);
        $max = (int) Legacy::cfg('max_upload_mb', 1024) * 1024 * 1024;
        $doc = ($b['purpose'] ?? 'source') === 'doc';
        if (!$doc) Jobs::limitCheck($email);   // 초안을 올리기 전에 — 다 올린 뒤에 막히지 않게
        if ($doc) {
            if (!preg_match('/\.(' . Jobs::DOC_EXT . ')$/i', $name)) Legacy::fail('맥락 자료는 pdf·docx·hwp·hwpx·xlsx·pptx·md·txt 만 올릴 수 있습니다.');
            if (!preg_match('/^[0-9a-f]{16}$/', (string) ($b['job_id'] ?? ''))) Legacy::fail('어느 작업의 자료인지(job_id)가 필요합니다.');
        } elseif (!preg_match('/\.pptx$/i', $name)) {
            Legacy::fail('PowerPoint(.pptx) 파일만 올릴 수 있습니다.');
        }
        if ($size <= 0) Legacy::fail('빈 파일입니다.');
        if ($size > $max) Legacy::fail('파일이 너무 큽니다. 최대 ' . (int) Legacy::cfg('max_upload_mb', 1024) . 'MB 까지 올릴 수 있습니다.');
        $id = bin2hex(random_bytes(12));
        $chunks = (int) ceil($size / self::CHUNK);
        // purpose·job_id 는 filename 뒤에 숨겨 두지 않고 received 앞에 메타로 보관하지 않는다 — 별도 열 없이 status 로 구분
        Db::pdo()->prepare('INSERT INTO deck_uploads (id, email, filename, size, chunk_size, chunks, received, status, created_at)
                            VALUES (:i, :e, :f, :s, :c, :n, \'\', :st, NOW())')
            ->execute([':i' => $id, ':e' => $email, ':f' => mb_substr($name, 0, 255), ':s' => $size, ':c' => self::CHUNK, ':n' => $chunks,
                       ':st' => $doc ? 'open:doc:' . $b['job_id'] : 'open']);
        $fp = fopen(self::dir() . "/$id.part", 'wb');
        fclose($fp);
        return ['id' => $id, 'chunk_size' => self::CHUNK, 'chunks' => $chunks, 'received' => []];
    }

    private static function row(string $email, string $id): array
    {
        $st = Db::pdo()->prepare('SELECT * FROM deck_uploads WHERE id = :i AND email = :e');
        $st->execute([':i' => $id, ':e' => $email]);
        $r = $st->fetch();
        if (!$r) Legacy::fail('업로드를 찾을 수 없습니다.', 404);
        return $r;
    }

    private static function received(array $r): array
    {
        return array_values(array_map('intval', array_filter(explode(',', (string) $r['received']), 'strlen')));
    }

    private static function isOpen(array $r): bool
    {
        return str_starts_with((string) $r['status'], 'open');
    }

    public static function status(string $email, string $id): array
    {
        $r = self::row($email, $id);
        return ['id' => $id, 'chunk_size' => (int) $r['chunk_size'], 'chunks' => (int) $r['chunks'],
                'received' => self::received($r), 'status' => self::isOpen($r) ? 'open' : $r['status']];
    }

    public static function chunk(string $email, string $id, int $n): array
    {
        $r = self::row($email, $id);
        if (!self::isOpen($r)) Legacy::fail('이미 끝난 업로드입니다.', 409);
        $chunks = (int) $r['chunks'];
        if ($n < 0 || $n >= $chunks) Legacy::fail('조각 번호가 범위를 벗어났습니다.');
        $expect = ($n === $chunks - 1) ? ((int) $r['size'] - $n * (int) $r['chunk_size']) : (int) $r['chunk_size'];

        $in = fopen('php://input', 'rb');
        $data = stream_get_contents($in, $expect + 1);
        fclose($in);
        if (strlen((string) $data) !== $expect) Legacy::fail("조각 크기가 맞지 않습니다. (받음 " . strlen((string) $data) . " / 기대 $expect)");

        $fp = fopen(self::dir() . "/$id.part", 'c+b');
        flock($fp, LOCK_EX);
        fseek($fp, $n * (int) $r['chunk_size']);
        fwrite($fp, (string) $data);
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);

        // 받은 조각 기록은 행 잠금으로 — 여러 조각을 동시에 보내도 유실 없음
        $pdo = Db::pdo();
        $pdo->beginTransaction();
        $st = $pdo->prepare('SELECT received FROM deck_uploads WHERE id = :i FOR UPDATE');
        $st->execute([':i' => $id]);
        $got = self::received(['received' => (string) $st->fetchColumn()]);
        if (!in_array($n, $got, true)) $got[] = $n;
        sort($got);
        $pdo->prepare('UPDATE deck_uploads SET received = :r WHERE id = :i')->execute([':r' => implode(',', $got), ':i' => $id]);
        $pdo->commit();
        return ['received' => count($got), 'chunks' => $chunks];
    }

    public static function complete(string $email, string $id, array $b): array
    {
        $r = self::row($email, $id);
        if (!self::isOpen($r)) Legacy::fail('이미 끝난 업로드입니다.', 409);
        $got = self::received($r);
        if (count($got) !== (int) $r['chunks']) Legacy::fail('아직 받지 못한 조각이 있습니다. (' . count($got) . '/' . $r['chunks'] . ')', 409);
        $part = self::dir() . "/$id.part";
        clearstatcache();
        if (filesize($part) !== (int) $r['size']) Legacy::fail('파일 크기가 맞지 않습니다. 다시 올려 주세요.', 409);

        if (preg_match('/^open:doc:([0-9a-f]{16})$/', (string) $r['status'], $m)) {  // 맥락 자료 → 작업에 붙인다
            $res = Jobs::addDoc($m[1], $email, $part, (string) $r['filename'], (int) $r['size']);
            Db::pdo()->prepare("UPDATE deck_uploads SET status = 'done' WHERE id = :i")->execute([':i' => $id]);
            return $res;
        }

        $fh = fopen($part, 'rb');
        $magic = fread($fh, 4);
        fclose($fh);
        if ($magic !== "PK\x03\x04") Legacy::fail('PowerPoint 파일이 아닌 것 같습니다. (.pptx 형식 확인)');

        $job = Jobs::create($email, $part, (string) $r['filename'], (int) $r['size'],
            trim((string) ($b['title'] ?? '')), trim((string) ($b['note'] ?? '')), !empty($b['pilot']),
            ['kind' => ($b['kind'] ?? 'polish') === 'design' ? 'design' : 'polish', 'budget_usd' => $b['budget_usd'] ?? null,
             'accent' => $b['accent'] ?? null, 'hold' => !empty($b['hold']),
             'slides' => $b['slides'] ?? 0, 'mockups' => $b['mockups'] ?? 'plan', 'sample' => $b['sample'] ?? 3, 'project' => $b['project'] ?? '', 'front' => $b['front'] ?? null,
             'style' => $b['style'] ?? null, 'purpose' => $b['purpose'] ?? null, 'font_title' => $b['font_title'] ?? null, 'font_body' => $b['font_body'] ?? null]);   // 디자인 타입·용도·서체도 빠짐없이
        Db::pdo()->prepare("UPDATE deck_uploads SET status = 'done' WHERE id = :i")->execute([':i' => $id]);
        return $job;
    }
}
