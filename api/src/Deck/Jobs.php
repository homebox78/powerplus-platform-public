<?php
declare(strict_types=1);

namespace Pp\Deck;

use Pp\Core\Db;
use Pp\Core\Notify;
use Pp\Core\Scan;
use Pp\Core\Config;
use Pp\Core\Response;
use Pp\Core\HttpError;
use PDO;
use ZipArchive;
use Throwable;
use RecursiveIteratorIterator;
use RecursiveDirectoryIterator;
use FilesystemIterator;

/*
 * 출처: powerDeck api/src/Jobs.php (D:\powerDeck, 2026-10-06 이식). 로직·JSON 모양은 그대로 두고
 * 전역 Db/Config/fail/json_out → Pp\Core(Db·Config·Response·HttpError) 어댑터(Legacy), 테이블은 deck_ 접두, 설정은 Config 'deck.<key>' 로 바꿨다.
 */


/**
 * 변환 작업 — 웹(사용자)과 엔진(윈도우 작업자) 사이의 계약.
 *
 * 상태: queued → running → done | failed | canceled
 * 파일 종류(kind): source(원본) · result(완성 pptx) · before/after(장별 렌더 PNG) · extra(보고서 등) · live(작업 중 중간 렌더, 같은 이름으로 덮어씀) · draft(지금까지 만든 판, 덮어씀) · pilot(한 장 시안: pilot.pptx·결정.md) · frames(다시 보기용 렌더 묶음 f001_s01.jpg… + frames.json)
 * 파일은 웹루트 밖 data/jobs/<id>/<kind>/<name> 에 두고 API 로만 내려준다(로그인 확인).
 */
final class Jobs
{
    /** 제작 언어(장표 글) — 엔진 design.LANGS 와 같은 목록 */
    public const LANGS = ['ko', 'en', 'ja', 'zh', 'fr', 'es', 'de', 'vi'];

    /* ───────────── 작업 만들기 · 폴더 ───────────── */

    public const KINDS = ['source', 'result', 'before', 'after', 'extra', 'live', 'frames', 'draft', 'pilot', 'mockup', 'brand'];

    public static function dir(string $id, string $kind = ''): string
    {
        $d = Legacy::dataDir() . '/jobs/' . $id . ($kind !== '' ? '/' . $kind : '');
        if (!is_dir($d)) mkdir($d, 0775, true);
        return $d;
    }

    /**
     * 작업 종류(kind)
     *   polish — 초안 pptx 를 si-deck 으로 다듬기 (phase: pilot|full)
     *   design — 내용(글·md·pptx)으로 기획 → 시안 이미지 → 확정 → 장표 제작 (phase: plan|build)
     */
    public static function create(string $email, string $partPath, string $filename, int $size, string $title, string $note, bool $pilot = false, array $opts = []): array
    {
        $id = bin2hex(random_bytes(8));
        $dest = self::dir($id, 'source') . '/source.pptx';
        if (!rename($partPath, $dest)) Legacy::fail('파일을 옮기지 못했습니다.', 500);
        Scan::queue($dest, 'deck_source', $id, self::userId($email));  // 바이러스 검사 대기열(SEC-011)
        $design = ($opts['kind'] ?? 'polish') === 'design';
        $budget = self::budget($opts['budget_usd'] ?? null, $email);
        $theme = self::accent($opts['accent'] ?? null);
        $status = !empty($opts['hold']) ? 'hold' : 'queued';  // 맥락 자료를 더 올릴 거면 hold → /start 로 대기열에
        $slides = null;
        if (class_exists('ZipArchive')) {
            $z = new ZipArchive();
            if ($z->open($dest) === true) {
                $slides = 0;
                for ($i = 0; $i < $z->numFiles; $i++) {
                    if (preg_match('#^ppt/slides/slide\d+\.xml$#', (string) $z->getNameIndex($i))) $slides++;
                }
                $z->close();
            }
        }
        $title = $title !== '' ? $title : preg_replace('/\.pptx$/i', '', $filename);
        $pdo = Db::pdo();
        $pdo->prepare('INSERT INTO deck_jobs (id, email, title, filename, size, slides, note, status, progress, phase, kind, source_kind, budget_usd, theme, opts, created_at)
                       VALUES (:i, :e, :t, :f, :s, :n, :no, :st, 0, :ph, :k, \'pptx\', :b, :th, :op, NOW())')
            ->execute([':op' => self::opts($opts, $design),   // 다듬기도 서체 선택(font_title·font_body)을 쓴다
                       ':i' => $id, ':e' => $email, ':t' => mb_substr((string) $title, 0, 255), ':f' => $filename,
                       ':s' => $size, ':n' => $slides, ':no' => $note !== '' ? $note : null, ':st' => $status,
                       ':ph' => $design ? 'plan' : ($pilot ? 'pilot' : 'full'), ':k' => $design ? 'design' : 'polish', ':b' => $budget, ':th' => $theme]);
        self::addFile($id, 'source', null, 'source.pptx', $size);
        self::event($id, 'info', '업로드 완료 — ' . ($slides ? "{$slides}장, " : '') . self::mb($size)
            . ($design ? '. 내용을 읽어 기획부터 만듭니다.' : '. 변환 대기열에 올렸습니다.'));
        return self::get($id, $email, true);
    }

    /**
     * [개발용 — 운영 전에 없앤다] 엔진이 따로 만든 시험 시안을 사용자의 작업 목록에 '시안 확인' 작업으로 올린다.
     * 엔진(worker 키)만 부른다. 이 엔진이 맡은 진행 작업으로 만들어 두고, 엔진이 시안을 올린 뒤 finish(review) 한다.
     */
    public static function devTestJob(string $worker, array $b): array
    {
        if (preg_match('/^[0-9a-f]{16}$/', (string) ($b['id'] ?? '')) && !empty($b['build'])) {   // 시험 작업 시안 확정 → 장표 제작(개발용)
            Db::pdo()->prepare("UPDATE deck_jobs SET status = \"queued\", phase = \"build\", stage = NULL, progress = 0, worker = NULL, claimed_at = NULL, heartbeat_at = NULL,
                                started_at = NULL, finished_at = NULL, cancel_requested = 0, review = NULL, created_at = NOW() WHERE id = :i AND filename = \"test.md\"")
                ->execute([':i' => $b['id']]);
            self::event($b['id'], 'info', '시험 시안 확정 — 장표를 만듭니다.');
            return ['id' => $b['id']];
        }
        if (preg_match('/^[0-9a-f]{16}$/', (string) ($b['id'] ?? ''))) {   // 이미 올린 시험 작업을 다시 연다 — 시안을 바꿔 올리고 다시 '시안 확인'으로
            Db::pdo()->prepare("UPDATE deck_jobs SET status = \"running\", worker = :w, claimed_at = NOW(), heartbeat_at = NOW() WHERE id = :i AND filename = \"test.md\"")
                ->execute([':w' => $worker, ':i' => $b['id']]);
            self::event($b['id'], 'info', '시험 시안을 새로 올립니다.');
            return ['id' => $b['id']];
        }
        $email = strtolower(trim((string) ($b['email'] ?? '')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) Legacy::fail('email 이 필요합니다.');
        $id = bin2hex(random_bytes(8));
        $brief = (string) ($b['brief'] ?? '');
        Db::pdo()->prepare('INSERT INTO deck_jobs (id, email, title, filename, size, slides, note, brief, status, progress, phase, kind, source_kind, budget_usd, theme, opts, worker, claimed_at, heartbeat_at, started_at, created_at)
                            VALUES (:i, :e, :t, :f, :s, NULL, NULL, :br, "running", 90, "plan", "design", "text", NULL, :th, :op, :w, NOW(), NOW(), NOW(), NOW())')
            ->execute([':i' => $id, ':e' => $email, ':t' => mb_substr((string) ($b['title'] ?? '시험 시안'), 0, 255), ':f' => 'test.md', ':s' => strlen($brief),
                       ':br' => $brief, ':th' => self::accent($b['accent'] ?? null), ':op' => self::opts($b), ':w' => $worker]);
        self::event($id, 'info', '시험 시안(엔진에서 따로 만든 것)을 올립니다.');
        return ['id' => $id];
    }

    /** design 작업 — 글이나 .md 내용으로 시작 (파일 없음) */
    public static function createDesign(string $email, array $b): array
    {
        self::limitCheck($email);
        AiKeys::creditCheck($email);   // 잔액이 없으면 기다리지 않게 바로 알린다
        $brief = trim((string) ($b['brief'] ?? ''));
        // 내용 없이 맥락 자료만으로 시작(hold → 자료 → start): 기획이 자료를 읽고 핵심 장을 스스로 잡는다
        if (mb_strlen($brief) < 20 && empty($b['hold'])) Legacy::fail('내용이 너무 짧습니다. 장표에 담을 내용을 적거나, 맥락 자료를 올려 주세요.');
        if (mb_strlen($brief) > 300000) Legacy::fail('내용이 너무 깁니다 (30만 자 까지).');
        $sk = ($b['source_kind'] ?? 'text') === 'md' ? 'md' : 'text';
        $fname = trim((string) ($b['filename'] ?? '')) ?: ($sk === 'md' ? '내용.md' : '내용 입력');
        $title = trim((string) ($b['title'] ?? '')) ?: mb_substr(preg_replace('/^#+\s*/', '', strtok($brief, "\n")) ?: '새 장표', 0, 80);
        $id = bin2hex(random_bytes(8));
        Db::pdo()->prepare('INSERT INTO deck_jobs (id, email, title, filename, size, slides, note, brief, status, progress, phase, kind, source_kind, budget_usd, theme, opts, created_at)
                            VALUES (:i, :e, :t, :f, :s, NULL, :no, :br, :st, 0, \'plan\', \'design\', :sk, :b, :th, :op, NOW())')
            ->execute([':op' => self::opts($b, true), ':i' => $id, ':e' => $email, ':t' => mb_substr($title, 0, 255), ':f' => mb_substr($fname, 0, 255), ':s' => strlen($brief),
                       ':no' => trim((string) ($b['note'] ?? '')) ?: null, ':br' => $brief, ':sk' => $sk, ':st' => !empty($b['hold']) ? 'hold' : 'queued',
                       ':b' => self::budget($b['budget_usd'] ?? null, $email), ':th' => self::accent($b['accent'] ?? null)]);
        self::event($id, 'info', '내용을 받았습니다 (' . number_format(mb_strlen($brief)) . '자). 기획부터 만듭니다.');
        return self::get($id, $email, true);
    }

    /* ───────────── 산출물 — 기획 MD, 전체 묶음(zip) ───────────── */

    /** 지금 기획(사용자가 고친 내용 포함)을 마크다운으로 — 다시 올리면 기획 단계 없이 그대로 쓸 수 있는 형식 */
    public static function planMd(array $j): string
    {
        $plan = !empty($j['plan']) ? (is_array($j['plan']) ? $j['plan'] : json_decode((string) $j['plan'], true)) : null;
        if (!$plan || empty($plan['slides'])) return '';
        $md = ['# ' . (($plan['title'] ?? '') ?: $j['title']), '', '> powerDeck 기획 · ' . count($plan['slides']) . '장 · ' . date('Y-m-d'), ''];
        foreach ($plan['slides'] as $s) {
            $md[] = '## ' . ($s['n'] ?? '') . '. ' . str_replace('**', '', (string) ($s['title'] ?? ''));
            $md[] = '';
            $md[] = '- **장**: ' . (($s['section'] ?? '') ?: '—') . '  ·  **유형**: ' . (($s['type'] ?? '') ?: '—') . '  ·  **분위기**: ' . (($s['mood'] ?? '') ?: '—')
                . (!empty($s['ref']) ? '  ·  **참고**: ' . implode(', ', (array) $s['ref']) : '');
            foreach (['message' => '전달할 것', 'scene' => '장면', 'layout' => '구성', 'keyword' => '강조', 'device' => '장치'] as $k => $l) if (!empty($s[$k])) $md[] = "- **$l**: " . $s[$k];
            if (!empty($s['wire']) && is_array($s['wire'])) {   // 와이어프레임 — '- 종류 x,y,w,h | 제목 | 글1 / 글2' (기획 .md 를 다시 올리면 그대로 읽는다)
                array_push($md, '', '### 배치', '');
                foreach ($s['wire'] as $b) $md[] = sprintf('- %s %s,%s,%s,%s | %s%s', $b['k'] ?? 'card', $b['x'] ?? 0, $b['y'] ?? 0, $b['w'] ?? 0, $b['h'] ?? 0,
                    str_replace('|', '/', (string) ($b['t'] ?? '')), !empty($b['d']) ? ' | ' . str_replace(["\r\n", "\n"], ' / ', (string) $b['d']) : '');
            }
            array_push($md, '', '### 내용', '', (string) ($s['content'] ?? ''), '');
        }
        return implode("\n", $md);
    }

    public static function sendPlanMd(string $id, string $email, bool $admin): void
    {
        $j = self::own($id, $email, $admin);
        $md = self::planMd($j);
        if ($md === '') Legacy::fail('아직 기획이 없습니다.', 404);
        header('Content-Type: text/markdown; charset=utf-8');
        header("Content-Disposition: attachment; filename*=UTF-8''" . rawurlencode(preg_replace('/[\\\\\/:*?"<>|]/', '_', (string) $j['title']) . '_기획.md'));
        echo $md;
    }

    /** 산출물 전체를 zip 한 개로 — 결과 장표, 기획·사업 요약·과정 문서(md), 시안, 결과 렌더 */
    public static function export(string $id, string $email, bool $admin): void
    {
        $j = self::own($id, $email, $admin);
        if (!class_exists('ZipArchive')) Legacy::fail('서버에 zip 기능이 없습니다. 파일을 하나씩 받아 주세요.', 501);
        $tmp = tempnam(sys_get_temp_dir(), 'pdx');
        $z = new ZipArchive();
        if ($z->open($tmp, ZipArchive::OVERWRITE) !== true) Legacy::fail('묶음 파일을 만들지 못했습니다.', 500);
        $n = 0;
        $add = static function (string $path, string $as) use ($z, &$n) { if (is_file($path)) { $z->addFile($path, $as); $n++; } };
        $base = preg_replace('/\.pptx$/i', '', (string) ($j['result_name'] ?: $j['title']));
        foreach (glob(self::dir($id, 'result') . '/*') ?: [] as $f) $add($f, '1_결과 장표/' . (($j['result_name'] ?? '') ?: basename($f)));
        $md = self::planMd($j);
        if ($md !== '') { $z->addFromString('2_기획·문서/기획.md', $md); $n++; }
        $add(self::dir($id, 'mockup') . '/context.md', '2_기획·문서/사업 요약.md');
        $add(self::dir($id, 'mockup') . '/plan.json', '2_기획·문서/plan.json');
        foreach (glob(self::dir($id, 'extra') . '/*') ?: [] as $f) $add($f, (preg_match('/\.(ttf|otf|ttc)$/i', $f) ? '5_서체/' : '2_기획·문서/') . basename($f));
        foreach (glob(self::dir($id, 'mockup') . '/s[0-9][0-9].jpg') ?: [] as $f) $add($f, '3_시안/' . basename($f));
        foreach (array_merge(glob(self::dir($id, 'mockup') . '/cover.jpg') ?: [], glob(self::dir($id, 'mockup') . '/toc.jpg') ?: [], glob(self::dir($id, 'mockup') . '/div[0-9]*.jpg') ?: []) as $f) $add($f, '3_시안/0_' . basename($f));
        foreach (glob(self::dir($id, 'after') . '/*.jpg') ?: [] as $f) $add($f, '4_결과 렌더/' . basename($f));
        if (($sh = Script::html($j)) !== '') { $z->addFromString('6_발표 대본/1_발표 대본(들고 갈 것).html', $sh); $z->addFromString('6_발표 대본/2_발표 연습(노래방식).html', Script::practice($j)); $z->addFromString('6_발표 대본/발표 대본.md', Script::md($j)); $n += 3; }
        if (($j['source_kind'] ?? '') === 'pptx') $add(self::dir($id, 'source') . '/source.pptx', '0_원본/' . $j['filename']);
        $z->close();
        if ($n === 0) { @unlink($tmp); Legacy::fail('내려받을 산출물이 아직 없습니다.', 404); }
        header('Content-Type: application/zip');
        header('Content-Length: ' . filesize($tmp));
        header("Content-Disposition: attachment; filename*=UTF-8''" . rawurlencode(preg_replace('/[\\\\\/:*?"<>|]/', '_', (string) $j['title']) . '_산출물.zip'));
        readfile($tmp);
        @unlink($tmp);
    }

    /* ───────────── 맥락 자료 (RFP·과업지시서·평가기준·회사소개 등) ─────────────
     * 장표에 들어가는 글이 아니라 기획이 읽는 배경 — 기획을 만들 때만 읽는다(요약 context.md + 원문 발췌).
     * 지우는 때: '장표 만들기'로 넘어가는 순간(dropDocs) · 기획 단계에 멈춰도 올린 지 7일 뒤(purgeDocs). 요약 context.md 는 남긴다(대본 등). */
    public const DOC_EXT = 'pdf|docx|hwpx|hwp|xlsx|pptx|md|txt|markdown|csv';
    public const DOC_KEEP_DAYS = 7;

    public static function addDoc(string $jobId, string $email, string $partPath, string $filename, int $size): array
    {
        $j = self::own($jobId, $email, false);
        if (!in_array($j['status'], ['hold', 'queued', 'review', 'done', 'failed', 'canceled'], true)) Legacy::fail('진행 중인 작업에는 자료를 더할 수 없습니다.', 409);
        if (!preg_match('/\.(' . self::DOC_EXT . ')$/i', $filename)) Legacy::fail('맥락 자료는 pdf·docx·hwp·hwpx·xlsx·pptx·md·txt 만 올릴 수 있습니다.');
        $id = bin2hex(random_bytes(8));
        $dest = self::dir($jobId, 'docs') . '/' . $id . '_' . basename($filename);
        if (!rename($partPath, $dest)) Legacy::fail('파일을 옮기지 못했습니다.', 500);
        Db::pdo()->prepare('INSERT INTO deck_job_docs (id, job_id, email, name, size, created_at) VALUES (?, ?, ?, ?, ?, NOW())')
            ->execute([$id, $jobId, strtolower($email), mb_substr(basename($filename), 0, 255), $size]);
        Scan::queue($dest, 'deck_doc', $jobId . ':' . $id, self::userId($email));  // 바이러스 검사 대기열(SEC-011)
        self::event($jobId, 'info', '맥락 자료 추가 — ' . basename($filename) . ' (' . self::mb($size) . ')');
        self::dropDigest($jobId);
        return ['ok' => true, 'docs' => self::docs($jobId)];
    }

    public static function docs(string $jobId): array
    {
        $st = Db::pdo()->prepare('SELECT id, name, size, created_at FROM deck_job_docs WHERE job_id = ? ORDER BY created_at');
        $st->execute([$jobId]);
        return array_map(static fn($d) => ['id' => $d['id'], 'name' => $d['name'], 'size' => (int) $d['size'], 'created_at' => $d['created_at']], $st->fetchAll());
    }

    public static function deleteDoc(string $jobId, string $docId, string $email, bool $admin): array
    {
        $j = self::own($jobId, $email, $admin);
        if ($j['status'] === 'running') Legacy::fail('진행 중인 작업의 자료는 뺄 수 없습니다. 먼저 멈춰 주세요.', 409);
        foreach (glob(self::dir($jobId, 'docs') . '/' . basename($docId) . '_*') ?: [] as $f) @unlink($f);
        Db::pdo()->prepare('DELETE FROM deck_job_docs WHERE id = ? AND job_id = ?')->execute([$docId, $jobId]);
        self::dropDigest($jobId);
        return ['ok' => true, 'docs' => self::docs($jobId)];
    }

    /** 자료 올리기가 끝난 뒤 대기열에 넣는다 (hold → queued) */
    public static function start(string $id, string $email, bool $admin): array
    {
        // 공유받아 볼 수는 있지만 주인이 아니면 404 가 아니라 403 — 권한 없음을 바로 알린다(2026-10-10 하)
        $j = self::view($id, $email, $admin);
        if (!$admin && $j['email'] !== $email) Legacy::fail('작업 주인만 시작할 수 있습니다.', 403);
        if ($j['status'] !== 'hold') Legacy::fail('이미 시작된 작업입니다.', 409);
        AiKeys::creditCheck((string) $j['email']);
        $n = count(self::docs($id));
        if (mb_strlen(trim((string) ($j['brief'] ?? ''))) < 20 && $n === 0 && ($j['source_kind'] ?? '') !== 'pptx') Legacy::fail('내용도 맥락 자료도 없습니다. 둘 중 하나는 있어야 합니다.');
        Db::pdo()->prepare("UPDATE deck_jobs SET status = 'queued', created_at = NOW() WHERE id = :i")->execute([':i' => $id]);
        self::event($id, 'info', $n ? "맥락 자료 {$n}개와 함께 대기열에 올렸습니다." : '대기열에 올렸습니다.');
        return self::get($id, $email, $admin);
    }

    /** 엔진용 — 자료 파일 내려주기 */
    public static function workerDoc(string $jobId, string $docId): void
    {
        $fs = glob(self::dir($jobId, 'docs') . '/' . basename($docId) . '_*') ?: [];
        if (!$fs) Legacy::fail('자료 없음', 404);
        header('Content-Type: application/octet-stream');
        header('Content-Length: ' . filesize($fs[0]));
        header("Content-Disposition: attachment; filename*=UTF-8''" . rawurlencode(preg_replace('/^[0-9a-f]{16}_/', '', basename($fs[0]))));
        readfile($fs[0]);
    }

    /** 작업의 맥락 자료(원본 파일·목록)를 지금 지운다 — '장표 만들기'로 넘어갈 때. 요약(mockup/context.md)은 남는다 */
    public static function dropDocs(string $id, string $why): void
    {
        $pdo = Db::pdo();
        $st = $pdo->prepare('SELECT name FROM deck_job_docs WHERE job_id = ?');
        $st->execute([$id]);
        $names = $st->fetchAll(PDO::FETCH_COLUMN);
        if (!$names) return;
        $d = self::dir($id, 'docs');
        foreach (glob($d . '/*') ?: [] as $f) @unlink($f);
        @rmdir($d);
        $pdo->prepare('DELETE FROM deck_job_docs WHERE job_id = ?')->execute([$id]);
        $pdo->prepare('UPDATE deck_jobs SET docs_purged_at = NOW() WHERE id = ?')->execute([$id]);
        self::event($id, 'info', $why . ' 맥락 자료 ' . count($names) . '개를 서버에서 지웠습니다(요약은 남김) — ' . mb_substr(implode(', ', $names), 0, 200));
    }

    /** 올린 지 7일 지난 맥락 자료 삭제 — 기획 단계에 멈춘 작업까지. 돌고 있는 작업만 미룬다. 엔진이 작업을 가져갈 때마다 가볍게 돈다 */
    public static function purgeDocs(): void
    {
        $pdo = Db::pdo();
        $rows = $pdo->query("SELECT d.id, d.job_id, d.name FROM deck_job_docs d JOIN deck_jobs j ON j.id = d.job_id
                             WHERE d.created_at < (NOW() - INTERVAL " . self::DOC_KEEP_DAYS . " DAY) AND j.status <> 'running' LIMIT 100")->fetchAll();
        $byJob = [];
        foreach ($rows as $r) {
            foreach (glob(self::dir((string) $r['job_id'], 'docs') . '/' . basename((string) $r['id']) . '_*') ?: [] as $f) @unlink($f);
            $pdo->prepare('DELETE FROM deck_job_docs WHERE id = ?')->execute([$r['id']]);
            $byJob[$r['job_id']][] = $r['name'];
        }
        foreach ($byJob as $id => $names) {
            if (!(int) $pdo->query('SELECT COUNT(*) FROM deck_job_docs WHERE job_id = ' . $pdo->quote((string) $id))->fetchColumn()) {
                @rmdir(Legacy::dataDir() . '/jobs/' . $id . '/docs');
                $pdo->prepare('UPDATE deck_jobs SET docs_purged_at = NOW() WHERE id = ?')->execute([$id]);
            }
            self::event((string) $id, 'info', '올린 지 ' . self::DOC_KEEP_DAYS . '일이 지나 맥락 자료 ' . count($names) . '개를 서버에서 지웠습니다(요약은 남김) — ' . mb_substr(implode(', ', $names), 0, 200));
        }
    }

    /**
     * 시작 옵션 — slides: 장 수(0·없음 = 자동), mockups: 'plan'(기획만 먼저 보기) | 'sample'(샘플 N장) | 'all', sample: N
     * 기본은 'plan' — 돈이 드는 시안 이미지는 기획을 본 뒤 고른 장만 만든다.
     */
    /** 표지·목차·간지를 넣을지 — 안 주면 모두 넣는다 */
    private static function front($f): array
    {
        $f = is_array($f) ? $f : [];
        return ['cover' => !isset($f['cover']) || !empty($f['cover']), 'toc' => !isset($f['toc']) || !empty($f['toc']), 'divider' => !isset($f['divider']) || !empty($f['divider'])];
    }

    private static function opts(array $b, bool $design = false): string
    {
        $n = max(0, min(200, (int) ($b['slides'] ?? 0)));
        // 새로 기획하는 장표는 장 수를 안 적으면 5장(2026-10-07 사용자) — '자동'이 자료 14만 자에 37장을 잡아 몇 시간씩 걸렸다
        if ($design && $n === 0) $n = ['submit' => 30, 'company' => 14][$b['purpose'] ?? ''] ?? 5;   // 제출용(세로 제안서)은 본문 쪽 수 — 미입력이면 30쪽, 회사소개용(회사소개서)은 14쪽
        $m = in_array($b['mockups'] ?? '', ['plan', 'sample', 'all'], true) ? $b['mockups'] : 'plan';
        return json_encode(['slides' => $n, 'mockups' => $m, 'sample' => max(1, min(20, (int) ($b['sample'] ?? 3))),
            'project' => mb_substr(trim((string) ($b['project'] ?? '')), 0, 80), 'front' => self::front($b['front'] ?? null),
            'event' => mb_substr(trim((string) ($b['event'] ?? '')), 0, 30), 'date' => mb_substr(trim((string) ($b['date'] ?? '')), 0, 20),   // 표지 꼬리 글·날짜(비우면 엔진이 '제안설명회'·작성 날짜)
            'style' => preg_match('/^[a-z]{1,2}$/', (string) ($b['style'] ?? '')) ? $b['style'] : 'a',
            'purpose' => in_array($b['purpose'] ?? '', ['submit', 'company'], true) ? $b['purpose'] : 'present',   // company = 회사소개서(테마 A·B, engine/company.py)
            'vstyle' => in_array($b['vstyle'] ?? '', ['band', 'tab', 'side', 'split', 'pill', 'line'], true) ? $b['vstyle'] : 'band',   // 세로 제안서 디자인 스타일(모양) — engine/vertical.py STYLES
            'vtone' => in_array($b['vtone'] ?? ($b['vtheme'] ?? ''), ['navy', 'blue', 'deep', 'teal', 'gray', 'glass'], true) ? ($b['vtone'] ?? $b['vtheme']) : 'navy',   // 톤(색) — TONES(옛 vtheme 도 받는다)
            'ctheme' => in_array($b['ctheme'] ?? '', ['a', 'b'], true) ? $b['ctheme'] : 'a',   // 회사소개서 테마 — A 다크 임팩트 · B 라이트 에디토리얼(engine/company.py COMPANY_THEMES)
            'ctone' => in_array($b['ctone'] ?? '', ['blue', 'teal', 'violet', 'crimson', 'orange'], true) ? $b['ctone'] : 'blue',   // 회사소개서 톤 — engine/company.py TONES
            'lang' => in_array($b['lang'] ?? '', self::LANGS, true) ? $b['lang'] : 'ko',   // 제작 언어 — 장표 글·시안·대본
            'font_title' => preg_match('/^[a-z0-9]{2,16}$/', (string) ($b['font_title'] ?? '')) ? $b['font_title'] : '',
            'font_body' => preg_match('/^[a-z0-9]{2,16}$/', (string) ($b['font_body'] ?? '')) ? $b['font_body'] : ''], JSON_UNESCAPED_UNICODE);   // 서체 — worker/fonts/fonts.json 의 id(모르면 엔진이 기본)
        // project = 머리 띠 오른쪽에 넣는 사업명, style = 디자인 타입(reference/styles), purpose = 용도(제출용: 평가항목 빠짐없이 / 발표용: 한 장 한 메시지)
    }

    /* ───────────── 비용 · 로고 · 설정 바꾸기 ───────────── */

    /** 작업의 단계별 비용 —digest(자료 요약)·plan(기획)·image(시안)은 실제 청구액, engine(장표 제작)은 구독 사용분의 API 환산액 */
    public static function costs(string $id): array
    {
        $st = Db::pdo()->prepare('SELECT kind, model, COUNT(*) n, SUM(cost_usd) usd, SUM(tokens_in) a, SUM(tokens_out) b FROM deck_ai_usage WHERE job_id = ? GROUP BY kind, model ORDER BY MIN(id)');
        $st->execute([$id]);
        return array_map(static fn($r) => ['kind' => $r['kind'], 'model' => $r['model'], 'n' => (int) $r['n'], 'usd' => round((float) $r['usd'], 4),
            'a' => (int) $r['a'], 'b' => (int) $r['b']], $st->fetchAll());
    }

    /** 이 사용자의 시안 한 장 평균 비용(최근 30장) — 미리보기의 예상 비용 */
    public static function estImageUsd(string $email): ?float
    {
        $st = Db::pdo()->prepare("SELECT AVG(c) FROM (SELECT cost_usd c FROM deck_ai_usage WHERE email = ? AND kind = 'image' AND cost_usd > 0 ORDER BY id DESC LIMIT 30) t");
        $st->execute([strtolower($email)]);
        $v = $st->fetchColumn();
        return $v !== null && $v !== false ? round((float) $v, 4) : null;
    }

    /**
     * 틀에 넣을 로고 — which: client(발주기관, 바닥 왼쪽) | vendor(제안사, 바닥 오른쪽). PNG·JPG, 5MB 까지.
     * 머리 띠·바닥은 이미지 모델이 그리지 않고 엔진이 고정 위치·크기로 합성한다.
     */
    public static function putBrand(string $id, string $email, bool $admin, string $which): array
    {
        self::own($id, $email, $admin);
        if (!in_array($which, ['client', 'vendor', 'client_white', 'vendor_white'], true)) Legacy::fail('client · vendor · client_white · vendor_white');
        $data = (string) file_get_contents('php://input', false, null, 0, 5 * 1024 * 1024 + 1);
        if (strlen($data) > 5 * 1024 * 1024) Legacy::fail('로고는 5MB 까지 올릴 수 있습니다.');
        $png = str_starts_with($data, "\x89PNG"); $jpg = str_starts_with($data, "\xFF\xD8");
        if (!$png && !$jpg) Legacy::fail('로고는 PNG 또는 JPG 만 올릴 수 있습니다.');
        $name = $which . ($png ? '.png' : '.jpg');
        foreach (['.png', '.jpg'] as $e) @unlink(self::dir($id, 'brand') . '/' . $which . $e);
        Db::pdo()->prepare("DELETE FROM deck_job_files WHERE job_id = ? AND kind = 'brand' AND name LIKE ?")->execute([$id, $which . '.%']);
        file_put_contents(self::dir($id, 'brand') . '/' . $name, $data);
        self::addFile($id, 'brand', null, $name, strlen($data));
        Scan::queue(self::dir($id, 'brand') . '/' . $name, 'brand', $id . ':' . $name, self::userId($email));  // 바이러스 검사 대기열(SEC-011)
        return ['ok' => true, 'name' => $name];
    }

    /** 강조색 — #RRGGBB 만. 없으면 null(기본 분홍) */
    private static function accent(mixed $v): ?string
    {
        $s = strtoupper(trim((string) ($v ?? '')));
        return preg_match('/^#[0-9A-F]{6}$/', $s) ? $s : null;
    }

    /** 작업 비용 한도 — 관리자 전역값(job_budget_usd). 없으면 한도 없음(null). 사용자가 보낸 값은 쓰지 않는다 */
    private static function budget(mixed $v, string $email): ?float
    {
        return AiKeys::jobBudget();
    }

    /** 제목·비용 한도 수정 */
    public static function patch(string $id, string $email, bool $admin, array $b): array
    {
        $j00 = self::view($id, $email, $admin);
        $viewer = [$email, $admin];   // 마지막 응답은 부른 사람 기준으로(편집자에게 주인 화면을 돌려주지 않게)
        if (!$admin && $j00['email'] !== $email) {   // 편집 권한으로 공유받은 사람 — 기획 글·와이어프레임·A·B 확정·앞장 글만
            if ((int) $j00['shared'] !== 2 || $email === '') Legacy::fail('작업 주인만 바꿀 수 있습니다.', 403);
            $b = array_intersect_key($b, ['slides' => 1, 'front_edit' => 1]);
            if (!$b) Legacy::fail('편집 권한으로는 기획·와이어프레임만 고칠 수 있습니다.', 403);
            $email = (string) $j00['email']; $admin = false;   // 아래 own() 검사를 주인으로 통과
        }
        $sets = []; $p = [':i' => $id];
        if (isset($b['title'])) {
            $t = trim((string) $b['title']);
            if ($t === '') Legacy::fail('제목을 비울 수 없습니다.');
            $sets[] = 'title = :t'; $p[':t'] = mb_substr($t, 0, 255);
        }
        // 공유 — 0 끔 · 1 로그인한 사람 의견 · 2 로그인한 사람 편집 · 3 링크만 있으면 누구나 보기(로그인하면 의견). true 는 1(예전 화면)
        if (isset($b['shared'])) { $v = $b['shared'] === true ? 1 : (int) $b['shared']; $sets[] = 'shared = :sh'; $p[':sh'] = max(0, min(3, $v)); }
        // 작업 설정 바꾸기 — 디자인 타입·서체·강조색. 엔진이 돌고 있지 않을 때(확인 대기·올리는 중)만. 그 뒤에 만드는 시안·장표부터 적용된다
        if (isset($b['settings']) && is_array($b['settings'])) {
            $j1 = self::own($id, $email, $admin);
            if (($j1['kind'] ?? '') !== 'design') Legacy::fail('디자인 타입·서체·강조색은 내용으로 장표 만들기 작업에서만 바꿀 수 있습니다.', 409);
            if (!in_array($j1['status'], ['review', 'hold'], true)) Legacy::fail('엔진이 작업 중일 때는 설정을 바꿀 수 없습니다. 확인 단계에서 바꿔 주세요.', 409);
            $st = $b['settings'];
            $op = !empty($j1['opts']) ? (json_decode((string) $j1['opts'], true) ?: []) : [];
            if (isset($st['style']) && preg_match('/^[a-z]{1,2}$/', (string) $st['style'])) $op['style'] = (string) $st['style'];
            foreach (['font_title', 'font_body'] as $k) if (isset($st[$k]) && preg_match('/^[a-z0-9]{2,16}$/', (string) $st[$k])) $op[$k] = (string) $st[$k];
            $sets[] = 'opts = :op'; $p[':op'] = json_encode($op, JSON_UNESCAPED_UNICODE);
            if (isset($st['accent'])) {
                $ac = self::accent($st['accent']);
                if ($ac === null) Legacy::fail('강조색 코드가 올바르지 않습니다(예: #FF2A6D).');
                $sets[] = 'theme = :th'; $p[':th'] = $ac;
            }
            self::event($id, 'info', '작업 설정을 바꿨습니다 — 디자인 타입 ' . strtoupper((string) ($op['style'] ?? 'a')) . (isset($st['accent']) ? ' · 강조색 ' . self::accent($st['accent']) : ''));
        }
        // 기획 장별 수정 자동 저장 — slides: [{n, title?, message?, scene?, layout?, content?}]
        if (isset($b['slides']) && is_array($b['slides'])) {
            $j0 = self::own($id, $email, $admin);
            $plan = !empty($j0['plan']) ? json_decode((string) $j0['plan'], true) : null;
            if ($plan && isset($plan['slides'])) {
                $lim = ['title' => 300, 'section' => 300, 'keyword' => 200, 'message' => 3000, 'scene' => 3000, 'layout' => 3000, 'content' => 20000];
                foreach ($b['slides'] as $s) {
                    if (!is_array($s)) continue;
                    foreach ($plan['slides'] as &$ps) {
                        if ((int) ($ps['n'] ?? 0) !== (int) ($s['n'] ?? -1)) continue;
                        foreach ($lim as $k => $max) if (isset($s[$k])) $ps[$k] = mb_substr((string) $s[$k], 0, $max);
                        if (isset($s['wire']) && is_array($s['wire'])) $ps['wire'] = self::wire($s['wire']);
                        if (isset($s['wire_ai']) && is_array($s['wire_ai'])) { $ps['wire_ai'] = self::wire($s['wire_ai']); $ps['wire_at'] = gmdate('Y-m-d H:i:s'); }   // AI 로 다시 짠 시각(UTC) — 화면 우측 위에 보인다
                        // A·B 와이어프레임 확정 — 고른 안이 wire 가 되고(시안은 wire 로 그린다), '' 이면 다시 고르기
                        if (isset($s['wire_pick'])) {
                            $pk = (string) $s['wire_pick'];
                            if (in_array($pk, ['a', 'b'], true) && !empty($ps['wire_alt'][$pk])) {
                                $ps['wire'] = self::wire((array) $ps['wire_alt'][$pk]);
                                $ps['wire_pick'] = $pk;
                                $s['wire'] = true;   // 아래 합격 기준을 다시 본다
                            } elseif ($pk === '') unset($ps['wire_pick']);
                        }
                        // 합격 기준(겹침·넘침·빠진 수치…) — 배치나 글이 바뀔 때마다 다시 본다
                        if ((isset($s['wire']) || isset($s['content']) || isset($s['title'])) && !empty($ps['wire'])) $ps['wire_checks'] = WireLayout::check($ps['wire'], $ps);
                    }
                    unset($ps);
                }
                $sets[] = 'plan = :pl'; $p[':pl'] = json_encode($plan, JSON_UNESCAPED_UNICODE);
            }
        }
        // 표지·목차·간지 글 고치기 — front_edit: {id: {project?, tail?, date?, name?}}. 엔진이 앞장을 다시 짤 때 우선하고, 지금 front 에도 바로 반영
        if (isset($b['front_edit']) && is_array($b['front_edit'])) {
            $j0 = self::own($id, $email, $admin);
            $plan = !empty($j0['plan']) ? json_decode((string) $j0['plan'], true) : null;
            if ($plan) {
                $fe = is_array($plan['front_edit'] ?? null) ? $plan['front_edit'] : [];
                foreach ($b['front_edit'] as $fid => $v) {
                    if (!preg_match('/^(cover|toc|end|qna|div\d{0,2})$/', (string) $fid) || !is_array($v)) continue;
                    foreach (['title' => 200, 'project' => 200, 'tail' => 60, 'date' => 40, 'name' => 120, 'desc' => 120, 'slogan' => 60] as $k => $max) {   // slogan = 표지 사업명 위 키메시지(2026-10-15)
                        if (!array_key_exists($k, $v)) continue;
                        $fe[$fid][$k] = mb_substr(trim((string) $v[$k]), 0, $max);
                    }
                }
                $plan['front_edit'] = $fe;
                foreach ((array) ($plan['front'] ?? []) as $i => $f) {
                    $o = $fe[$f['id'] ?? ''] ?? null;
                    if ($o) foreach ($o as $k => $x) if ($x !== '') $plan['front'][$i][$k] = $x;
                    if (($f['kind'] ?? '') === 'toc') foreach ((array) ($f['chapters'] ?? []) as $ci => $c) {
                        $nm = $fe['div' . (int) ($c['no'] ?? 0)]['name'] ?? '';
                        if ($nm !== '') $plan['front'][$i]['chapters'][$ci]['name'] = $nm;
                    }
                }
                $sets[] = 'plan = :pl2'; $p[':pl2'] = json_encode($plan, JSON_UNESCAPED_UNICODE);
            }
        }
        if (array_key_exists('budget_usd', $b)) {  // 작업 한도는 관리자만 올릴 수 있다
            if (!$admin) Legacy::fail('비용 한도는 관리자만 바꿀 수 있습니다.', 403);
            $f = (float) ($b['budget_usd'] ?? 0);
            if ($f > 10000) Legacy::fail('비용 한도는 $10,000 이하로 적어 주세요.');
            $sets[] = 'budget_usd = :b'; $p[':b'] = $f > 0 ? round($f, 2) : null;
        }
        if ($sets) Db::pdo()->prepare('UPDATE deck_jobs SET ' . implode(', ', $sets) . ' WHERE id = :i')->execute($p);
        return self::get($id, $viewer[0], $viewer[1]);
    }

    /** 와이어프레임 상자 목록 다듬기 — 종류는 정해진 것만, 좌표는 본문 기준 0~100 %, 상자 60개까지 */
    /** AI 가 상자 제목에 쓴 자리표시 — 워커 design.py WIRE_PLACEHOLDER 와 같다 */
    public const WIRE_PLACEHOLDER = ['결론 띠', '한 줄 결론', '결론', '상황·입력', '결과·전략', '우리의 장치(플랫폼·절차·화면)', '제목', '내용', '항목', '상자 제목'];

    /** $ai: AI 가 낸 것이면 자리표시 상자를 거른다(사람이 손으로 적은 것은 그대로 둔다) */
    public static function wire(array $in, bool $ai = false): array
    {
        $kinds = ['panel', 'card', 'person', 'image', 'screen', 'chart', 'table', 'flow', 'map', 'badge', 'band', 'text', 'gantt', 'phase', 'kpi', 'fishbone', 'hub', 'pyramid', 'matrix', 'funnel', 'cycle', 'venn', 'roadmap', 'isostack', 'gauge', 'proportion', 'converge', 'ridge', 'petal', 'stage'];
        $out = [];
        foreach (array_slice($in, 0, 60) as $b) {
            if (!is_array($b)) continue;
            $k = in_array($b['k'] ?? '', $kinds, true) ? $b['k'] : 'card';
            $n = static fn($v, $lo, $hi) => round(max($lo, min($hi, (float) $v)), 1);
            $x = $n($b['x'] ?? 0, 0, 97); $y = $n($b['y'] ?? 0, 0, 97);
            $o = ['id' => preg_replace('/[^a-z0-9]/i', '', (string) ($b['id'] ?? '')) ?: substr(md5(uniqid('', true)), 0, 6), 'k' => $k,
                  'x' => $x, 'y' => $y, 'w' => $n($b['w'] ?? 20, 3, 100 - $x), 'h' => $n($b['h'] ?? 20, 3, 100 - $y),
                  't' => mb_substr((string) ($b['t'] ?? ''), 0, 200)];
            if (isset($b['d']) && trim((string) $b['d']) !== '') $o['d'] = mb_substr((string) $b['d'], 0, 1500);
            if ($ai && in_array(trim($o['t']), self::WIRE_PLACEHOLDER, true)) {   // AI 가 낸 자리표시('결론 띠' 등) — 글 첫 줄을 제목으로, 글이 없으면 버린다
                $d = trim((string) ($o['d'] ?? ''));
                unset($o['d']);
                if ($d === '') continue;
                $two = explode("\n", $d, 2);
                $o['t'] = mb_substr($two[0], 0, 200);
                if (trim($two[1] ?? '') !== '') $o['d'] = trim($two[1]);
            }
            $out[] = $o;
        }
        return $out;
    }

    /** AI 호출 비용 적립 (AiKeys 가 부른다) */
    public static function addSpend(string $id, float $usd): float
    {
        $pdo = Db::pdo();
        $pdo->prepare('UPDATE deck_jobs SET spent_usd = spent_usd + :c WHERE id = :i')->execute([':c' => $usd, ':i' => $id]);
        $st = $pdo->prepare('SELECT spent_usd FROM deck_jobs WHERE id = :i');
        $st->execute([':i' => $id]);
        return (float) $st->fetchColumn();
    }

    public static function mb(int $b): string
    {
        return $b >= 1048576 ? round($b / 1048576, 1) . 'MB' : round($b / 1024) . 'KB';
    }

    /** 작업 소유자 이메일 → core_users.id (검사 대기열·알림용, 없으면 null) */
    private static function userId(string $email): ?int
    {
        try {
            $v = Db::val('SELECT id FROM core_users WHERE email = ? AND deleted_at IS NULL', [strtolower(trim($email))]);
            return $v !== null && $v !== false ? (int) $v : null;
        } catch (Throwable) {
            return null;
        }
    }

    public static function event(string $id, string $kind, string $msg): void
    {
        Db::pdo()->prepare('INSERT INTO deck_job_events (job_id, ts, kind, message) VALUES (:j, NOW(), :k, :m)')
            ->execute([':j' => $id, ':k' => mb_substr($kind, 0, 24), ':m' => mb_substr($msg, 0, 4000)]);
    }

    /** 표지·목차·간지 렌더를 지운다 — 다시 넣거나 뺄 때 예전 그림이 남지 않게 */
    private static function clearFront(string $id): void
    {
        foreach (glob(self::dir($id, 'after') . '/front_*') ?: [] as $f) @unlink($f);
        Db::pdo()->prepare("DELETE FROM deck_job_files WHERE job_id = ? AND kind = 'after' AND name LIKE 'front%'")->execute([$id]);
    }

    /**
     * 장 순서 바꾸기·지우기 — order: 남길 장의 옛 쪽 번호를 새 순서대로(빠진 장은 지운다), chapters: {옛 쪽: 새 장(章) 이름}(다른 장으로 옮긴 장).
     * 기획(쪽 번호·장·절), 시안 파일(sNN…)과 파일 목록, 의견 핀을 한 번에 새 번호로 옮긴다. 목차·간지는 장 구성에서 다시 만들어진다.
     * 엔진이 작업 중일 때(대기·진행)는 막는다. 엔진 PC 의 시안 사본은 order_rev 가 바뀌면 다시 받는다.
     */
    /** 절 이름에서 장 이름을 떼고 남은 꼬리 — 앞에 몇 번 겹쳐 붙었든 모두 뗀다(엔진 design.section_sub 와 같은 규칙) */
    public static function sectionSub(string $sec, string $ch): string
    {
        $sec = trim($sec);
        $ch = trim($ch);
        if ($sec === '') return '';
        if ($ch !== '') {
            while (str_starts_with($sec, $ch)) {
                $rest = substr($sec, strlen($ch));
                if ($rest !== '' && !preg_match('/^\s*[·:|\-–—]/u', $rest)) break;
                $sec = (string) preg_replace('/^\s*[·:|\-–—]?\s*/u', '', $rest);
            }
            $parts = array_filter(array_map('trim', preg_split('/\s+·\s+/u', $sec) ?: []), fn ($p) => $p !== '' && $p !== $ch);
            $sec = implode(' · ', $parts);
        }
        return $sec;
    }

    public static function reorder(string $id, string $email, bool $admin, array $b): array
    {
        $j = self::own($id, $email, $admin);
        if (!in_array($j['status'], ['review', 'hold'], true)) Legacy::fail('엔진이 작업 중일 때는 장 순서를 바꿀 수 없습니다. 확인 단계에서 바꿔 주세요.', 409);
        $plan = !empty($j['plan']) ? json_decode((string) $j['plan'], true) : null;
        if (!$plan || empty($plan['slides'])) Legacy::fail('기획이 아직 없습니다.', 409);
        $old = [];
        foreach ($plan['slides'] as $sl) $old[(int) ($sl['n'] ?? 0)] = $sl;
        $order = array_values(array_unique(array_map('intval', (array) ($b['order'] ?? []))));
        if (!$order) Legacy::fail('장을 모두 지울 수는 없습니다.');
        foreach ($order as $n) if (!isset($old[$n])) Legacy::fail("없는 장({$n}쪽)이 있습니다.");
        $chg = is_array($b['chapters'] ?? null) ? $b['chapters'] : [];
        $map = [];
        $new = [];
        foreach ($order as $i => $n) {
            $sl = $old[$n];
            $map[$n] = $i + 1;
            $to = trim((string) ($chg[$n] ?? $chg[(string) $n] ?? ''));
            if ($to !== '') {   // 다른 장(章)으로 옮김 — 절 이름은 그대로
                // 장 이름에 '·'가 있어도('기술·기능 방안') 첫 조각만 보고 자르지 않는다 — 띄어 쓴 ' · ' 만 구분자(DCK-106)
                $prev = trim((string) ($sl['chapter'] ?? explode(' · ', (string) ($sl['section'] ?? ''))[0]));
                $sub = self::sectionSub((string) ($sl['section'] ?? ''), $prev);
                $to = mb_substr($to, 0, 80);
                $sl['chapter'] = $to;
                $sl['section'] = $sub !== '' ? "{$to} · {$sub}" : $to;
            }
            $sl['n'] = $i + 1;
            $new[] = $sl;
        }
        $plan['slides'] = $new;
        $plan['order_rev'] = (int) ($plan['order_rev'] ?? 0) + 1;
        $pdo = Db::pdo();
        // 시안 파일 — 디스크와 목록을 두 단계로 옮긴다(번호가 겹치지 않게)
        $d = self::dir($id, 'mockup');
        $moves = [];
        foreach (glob($d . '/s[0-9][0-9]*') ?: [] as $f) {
            if (!preg_match('/^s(\d{2})(.*)$/', basename($f), $m)) continue;
            $n = (int) $m[1];
            if (!isset($map[$n])) { @unlink($f); continue; }
            $t = $d . '/__mv_' . basename($f);
            if (@rename($f, $t)) $moves[] = [$t, sprintf('%s/s%02d%s', $d, $map[$n], $m[2])];
        }
        foreach ($moves as [$a, $c]) @rename($a, $c);
        $rows = $pdo->prepare("SELECT id, name FROM deck_job_files WHERE job_id = ? AND kind = 'mockup'");
        $rows->execute([$id]);
        $fix = [];
        foreach ($rows->fetchAll() as $r) {
            if (!preg_match('/^s(\d{2})(.*)$/', (string) $r['name'], $m)) continue;
            $n = (int) $m[1];
            if (!isset($map[$n])) { $pdo->prepare('DELETE FROM deck_job_files WHERE id = ?')->execute([$r['id']]); continue; }
            $pdo->prepare('UPDATE deck_job_files SET name = ? WHERE id = ?')->execute(['__mv_' . $r['name'], $r['id']]);
            $fix[] = [(int) $r['id'], sprintf('s%02d%s', $map[$n], $m[2]), $map[$n]];
        }
        foreach ($fix as [$fid, $nm, $sn]) $pdo->prepare('UPDATE deck_job_files SET name = ?, slide = ? WHERE id = ?')->execute([$nm, $sn, $fid]);
        // 의견 핀 — 남는 장은 새 번호로, 지운 장의 의견은 닫는다(쪽 0)
        $cs = $pdo->prepare("SELECT id, slide FROM deck_job_comments WHERE job_id = ? AND target = 'mockup'");
        $cs->execute([$id]);
        foreach ($cs->fetchAll() as $c) {
            $n = (int) $c['slide'];
            if (isset($map[$n])) $pdo->prepare('UPDATE deck_job_comments SET slide = ? WHERE id = ?')->execute([$map[$n], $c['id']]);
            else $pdo->prepare('UPDATE deck_job_comments SET slide = 0, resolved = 1 WHERE id = ?')->execute([$c['id']]);
        }
        $gone = count($old) - count($order);
        $pdo->prepare('UPDATE deck_jobs SET plan = ?, slides = ? WHERE id = ?')->execute([json_encode($plan, JSON_UNESCAPED_UNICODE), count($new), $id]);
        self::event($id, 'info', '장 순서를 바꿨습니다' . ($gone > 0 ? " — {$gone}장 지움" : '') . ' (목차·간지는 장 구성대로 다시 맞춰집니다)');
        return self::get($id, $email, $admin);
    }

    /* ───────────── 파일 기록 · 동시 작업 한도 · 권한 ───────────── */

    public static function addFile(string $id, string $kind, ?int $slide, string $name, int $size): void
    {
        Db::pdo()->prepare('INSERT INTO deck_job_files (job_id, kind, slide, name, size, created_at)
                            VALUES (:j, :k, :s, :n, :z, NOW())
                            ON DUPLICATE KEY UPDATE size = VALUES(size), slide = VALUES(slide), created_at = NOW()')
            ->execute([':j' => $id, ':k' => $kind, ':s' => $slide, ':n' => $name, ':z' => $size]);
    }

    /** 대기 중 몇 번째인지 + 엔진이 살아 있는지 (화면 안내용) */
    /** 한 사람이 동시에 진행(올리는 중·대기·변환 중)할 수 있는 작업 수 — config 의 max_active_jobs(기본 5). 확인 대기는 세지 않는다 */
    public static function maxActive(): int
    {
        return max(1, (int) Legacy::cfg('max_active_jobs', 5));
    }

    public static function activeCount(string $email): int
    {
        $st = Db::pdo()->prepare("SELECT COUNT(*) FROM deck_jobs WHERE email = :e AND status IN ('hold', 'queued', 'running')");
        $st->execute([':e' => $email]);
        return (int) $st->fetchColumn();
    }

    /** 새 작업을 시작하거나 다시 돌릴 때 — 이미 꽉 찼으면 막는다 */
    public static function limitCheck(string $email): void
    {
        $n = self::activeCount($email); $max = self::maxActive();
        if ($n >= $max) Legacy::fail("동시에 진행할 수 있는 작업은 {$max}건입니다(지금 {$n}건 진행 중). 진행 중인 작업이 끝나거나 취소한 뒤 다시 시작해 주세요.", 429);
    }

    public static function engine(?string $email = null): array
    {
        $pdo = Db::pdo();
        $w = $pdo->query('SELECT name, seen_at, info FROM deck_workers WHERE seen_at > (NOW() - INTERVAL 2 MINUTE) ORDER BY seen_at DESC')->fetchAll();
        $q = (int) $pdo->query("SELECT COUNT(*) FROM deck_jobs WHERE status = 'queued'")->fetchColumn();
        $r = (int) $pdo->query("SELECT COUNT(*) FROM deck_jobs WHERE status = 'running'")->fetchColumn();
        return ['online' => count($w) > 0, 'workers' => $w, 'queued' => $q, 'running' => $r,
                'mine' => $email !== null ? ['active' => self::activeCount($email), 'max' => self::maxActive()] : null];
    }

    public static function own(string $id, string $email, bool $admin): array
    {
        $st = Db::pdo()->prepare('SELECT * FROM deck_jobs WHERE id = :i');
        $st->execute([':i' => $id]);
        $j = $st->fetch();
        if (!$j || (!$admin && $j['email'] !== $email)) Legacy::fail('작업을 찾을 수 없습니다.', 404);
        return $j;
    }

    /** 볼 수 있는 작업 — 주인·관리자, 또는 공유(shared)된 작업은 로그인한 누구나(시안 보기·의견 남기기만) */
    private static function view(string $id, string $email, bool $admin): array
    {
        $st = Db::pdo()->prepare('SELECT * FROM deck_jobs WHERE id = :i');
        $st->execute([':i' => $id]);
        $j = $st->fetch();
        // 공유 — 로그인한 사람은 shared 1~3, 로그인 안 한 사람('')은 3(링크만 있으면 보기)만
        $sh = (int) ($j['shared'] ?? 0);
        // 테스트 계정 거울 — 원본 계정 작업은 보기만(mine=false 라 쓰기·주인 버튼은 막힌다)
        $tid = \Pp\Core\TestLogin::userId();
        $mirror = $j && $tid !== null && $email !== '' && strtolower($email) === strtolower((string) Db::val('SELECT email FROM core_users WHERE id = ?', [$tid]))
            && in_array(strtolower((string) $j['email']), \Pp\Core\TestLogin::mirrorEmails($tid), true);
        if (!$j || (!$admin && !$mirror && ($email === '' || $j['email'] !== $email) && !($sh > 0 && ($email !== '' || $sh === 3)))) Legacy::fail('작업을 찾을 수 없습니다.', 404);
        return $j;
    }

    /** 편집할 수 있는 작업 — 주인·관리자, 또는 편집 권한(shared=2)으로 공유받은 로그인 사용자 */
    public static function editable(string $id, string $email, bool $admin): array
    {
        $j = self::view($id, $email, $admin);
        if (!$admin && $j['email'] !== $email && ((int) $j['shared'] !== 2 || $email === '')) Legacy::fail('작업 주인만 할 수 있습니다.', 403);
        return $j;
    }

    /* ───────────── 핀 의견 — 시안 이미지 위 (x,y: 0~1) ───────────── */
    public static function comments(string $jobId, bool $openOnly = false): array
    {
        // 상태: 검토 대기(accepted=0) → 주인이 '반영하기'(accepted=1) 한 것만 엔진에 간다. resolved=1 은 닫음(반영 안 함·처리 끝)
        $st = Db::pdo()->prepare('SELECT id, slide, x, y, email, body, resolved, accepted, reply, target, created_at FROM deck_job_comments WHERE job_id = ?' . ($openOnly ? ' AND resolved = 0 AND accepted = 1' : '') . ' ORDER BY slide, id');
        $st->execute([$jobId]);
        // 답글(스레드) — 의견마다 시간순
        $rs = Db::pdo()->prepare('SELECT id, comment_id, email, body, created_at FROM deck_job_comment_replies WHERE job_id = ? ORDER BY id');
        $rs->execute([$jobId]);
        $by = [];
        foreach ($rs->fetchAll() as $r) $by[(int) $r['comment_id']][] = ['id' => (int) $r['id'], 'email' => $r['email'], 'body' => $r['body'], 'created_at' => $r['created_at']];
        return array_map(static fn($c) => ['id' => (int) $c['id'], 'slide' => (int) $c['slide'], 'x' => (float) $c['x'], 'y' => (float) $c['y'],
            'email' => $c['email'], 'body' => $c['body'], 'resolved' => (bool) $c['resolved'], 'accepted' => (bool) $c['accepted'],
            'target' => $c['target'] ?? 'mockup',   // mockup = 시안 위 의견, result = 완성 장표 위 의견
            'replies' => $by[(int) $c['id']] ?? [], 'created_at' => $c['created_at']], $st->fetchAll());
    }

    public static function addComment(string $id, string $email, bool $admin, array $b): array
    {
        $j = self::view($id, $email, $admin);
        $owner = $j['email'] === $email;   // 주인이 직접 남긴 의견은 바로 '반영'. 팀원 의견은 주인이 확정해야 반영
        $body = trim((string) ($b['body'] ?? ''));
        if ($body === '') Legacy::fail('의견을 적어 주세요.');
        $x = max(0, min(1, (float) ($b['x'] ?? 0.5)));
        $y = max(0, min(1, (float) ($b['y'] ?? 0.5)));
        Db::pdo()->prepare('INSERT INTO deck_job_comments (job_id, slide, x, y, email, body, accepted, target, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())')
            ->execute([$id, max(1, (int) ($b['slide'] ?? 1)), $x, $y, strtolower($email), mb_substr($body, 0, 2000), $owner ? 1 : 0,
                       ($b['target'] ?? 'mockup') === 'result' ? 'result' : 'mockup']);
        Checklist::safe(static fn () => Checklist::fromFeedback($id, $body, max(1, (int) ($b['slide'] ?? 1)), '장표 위 의견'));
        return ['data' => self::comments($id)];
    }

    /** 답글 — 볼 수 있는 사람 누구나 (주인·팀원) */
    public static function addReply(string $id, int $cid, string $email, bool $admin, array $b): array
    {
        self::view($id, $email, $admin);
        $body = trim((string) ($b['body'] ?? ''));
        if ($body === '') Legacy::fail('답글을 적어 주세요.');
        $st = Db::pdo()->prepare('SELECT id FROM deck_job_comments WHERE id = ? AND job_id = ?');
        $st->execute([$cid, $id]);
        if (!$st->fetchColumn()) Legacy::fail('의견을 찾을 수 없습니다.', 404);
        Db::pdo()->prepare('INSERT INTO deck_job_comment_replies (comment_id, job_id, email, body, created_at) VALUES (?, ?, ?, ?, NOW())')
            ->execute([$cid, $id, strtolower($email), mb_substr($body, 0, 2000)]);
        return ['data' => self::comments($id)];
    }

    public static function editReply(string $id, int $cid, int $rid, string $email, bool $admin, array $b, bool $delete = false): array
    {
        $j = self::view($id, $email, $admin);
        $st = Db::pdo()->prepare('SELECT * FROM deck_job_comment_replies WHERE id = ? AND comment_id = ? AND job_id = ?');
        $st->execute([$rid, $cid, $id]);
        $r = $st->fetch();
        if (!$r) Legacy::fail('답글을 찾을 수 없습니다.', 404);
        $owner = $admin || $j['email'] === $email;
        if ($delete) {
            if (!$owner && $r['email'] !== strtolower($email)) Legacy::fail('내가 쓴 답글만 지울 수 있습니다.', 403);
            Db::pdo()->prepare('DELETE FROM deck_job_comment_replies WHERE id = ?')->execute([$rid]);
        } else {
            if ($r['email'] !== strtolower($email)) Legacy::fail('내가 쓴 답글만 고칠 수 있습니다.', 403);
            $body = trim((string) ($b['body'] ?? ''));
            if ($body === '') Legacy::fail('내용을 적어 주세요.');
            Db::pdo()->prepare('UPDATE deck_job_comment_replies SET body = ? WHERE id = ?')->execute([mb_substr($body, 0, 2000), $rid]);
        }
        return ['data' => self::comments($id)];
    }

    /** 고치기·해결 표시·삭제 — 글쓴이, 작업 주인, 관리자 */
    public static function editComment(string $id, int $cid, string $email, bool $admin, array $b, bool $delete = false): array
    {
        $j = self::view($id, $email, $admin);
        $st = Db::pdo()->prepare('SELECT * FROM deck_job_comments WHERE id = ? AND job_id = ?');
        $st->execute([$cid, $id]);
        $c = $st->fetch();
        if (!$c) Legacy::fail('의견을 찾을 수 없습니다.', 404);
        $owner = $admin || $j['email'] === $email;
        $editor = $owner || ((int) ($j['shared'] ?? 0) === 2 && $email !== '');   // 편집 권한으로 공유받은 사람
        if (!$owner && $c['email'] !== strtolower($email)) Legacy::fail('내가 쓴 의견만 바꿀 수 있습니다.', 403);
        if ($delete) {
            Db::pdo()->prepare('DELETE FROM deck_job_comments WHERE id = ?')->execute([$cid]);
            Db::pdo()->prepare('DELETE FROM deck_job_comment_replies WHERE comment_id = ?')->execute([$cid]);
        } else {
            // '해결' 표시는 주인·편집자만 — 의견 작성자 본인은 글만 고치고 지울 수 있다(2026-10-10 하)
            if (isset($b['resolved']) && !$editor) Legacy::fail('해결 표시는 작업 주인·편집자만 할 수 있습니다.', 403);
            if (isset($b['resolved'])) Db::pdo()->prepare('UPDATE deck_job_comments SET resolved = ? WHERE id = ?')->execute([empty($b['resolved']) ? 0 : 1, $cid]);
            if (isset($b['accepted']) || isset($b['reply'])) {   // 반영 확정·답글은 작업 주인만
                if (!$owner) Legacy::fail('작업 주인만 반영 여부를 정할 수 있습니다.', 403);
                if (isset($b['accepted'])) Db::pdo()->prepare('UPDATE deck_job_comments SET accepted = ? WHERE id = ?')->execute([empty($b['accepted']) ? 0 : 1, $cid]);
                if (isset($b['reply']) && trim((string) $b['reply']) !== '') self::addReply($id, $cid, $email, $admin, ['body' => $b['reply']]);
            }
            if (isset($b['body']) && trim((string) $b['body']) !== '') Db::pdo()->prepare('UPDATE deck_job_comments SET body = ? WHERE id = ?')->execute([mb_substr(trim((string) $b['body']), 0, 2000), $cid]);
        }
        return ['data' => self::comments($id)];
    }

    /* ───────────── 목록 · 상세 · 진행 기록 ───────────── */

    private static function shape(array $j): array
    {
        $j['size'] = (int) $j['size'];
        $j['slides'] = $j['slides'] !== null ? (int) $j['slides'] : null;
        $j['progress'] = (int) $j['progress'];
        $j['cancel_requested'] = (bool) $j['cancel_requested'];
        $j['pilot_slide'] = isset($j['pilot_slide']) && $j['pilot_slide'] !== null ? (int) $j['pilot_slide'] : null;
        $j['report'] = $j['report'] ? json_decode((string) $j['report'], true) : null;
        $j['budget_usd'] = $j['budget_usd'] !== null ? (float) $j['budget_usd'] : null;
        $j['spent_usd'] = round((float) ($j['spent_usd'] ?? 0), 4);
        $j['plan'] = !empty($j['plan']) ? json_decode((string) $j['plan'], true) : null;
        $j['review'] = !empty($j['review']) ? json_decode((string) $j['review'], true) : null;
        $j['opts'] = !empty($j['opts']) ? json_decode((string) $j['opts'], true) : null;
        unset($j['brief']); // 화면엔 내용 전문을 보내지 않는다 (길다). 필요하면 별도 요청
        return $j;
    }

    public static function list(string $email, bool $all): array
    {
        $sql = 'SELECT id, email, title, filename, size, slides, status, phase, kind, stage, progress, worker, cancel_requested, budget_usd, spent_usd, created_at, started_at, finished_at, result_name, theme, opts, error,
                       TIMESTAMPDIFF(MINUTE, created_at, NOW()) AS age_min
                FROM deck_jobs ';
        $args = [];
        if (!$all) {
            // 테스트 계정이면 거울 원본 계정의 작업도 목록에(읽기 전용 — 열기는 관리자 권한으로 이미 된다)
            $mirror = \Pp\Core\TestLogin::mirrorEmails(\Pp\Core\TestLogin::userId() !== null && strtolower($email) === 'test-account@test.powerplus.local' ? \Pp\Core\TestLogin::userId() : null);
            $ems = array_values(array_unique(array_merge([$email], $mirror)));
            $ph = [];
            foreach ($ems as $i => $em) { $ph[] = ':e' . $i; $args[':e' . $i] = $em; }
            $sql .= 'WHERE email IN (' . implode(',', $ph) . ') ';
        }
        $sql .= 'ORDER BY created_at DESC LIMIT 200';
        $st = Db::pdo()->prepare($sql);
        $st->execute($args);
        $rows = $st->fetchAll();
        // 대기 순번
        $q = Db::pdo()->query("SELECT id FROM deck_jobs WHERE status = 'queued' ORDER BY created_at")->fetchAll(PDO::FETCH_COLUMN);
        $pos = array_flip($q);
        foreach ($rows as &$r) {
            $r['size'] = (int) $r['size'];
            $r['progress'] = (int) $r['progress'];
            $r['cancel_requested'] = (bool) $r['cancel_requested'];
            $r['budget_usd'] = $r['budget_usd'] !== null ? (float) $r['budget_usd'] : null;
            $r['spent_usd'] = round((float) $r['spent_usd'], 4);
            $r['opts'] = !empty($r['opts']) ? json_decode((string) $r['opts'], true) : null;   // 목록에 디자인 타입·용도·서체 표시
            $r['queue_pos'] = isset($pos[$r['id']]) ? $pos[$r['id']] + 1 : null;
            // 실패 사유·대기 시간 — 목록만 보고도 왜 멈췄는지·얼마나 기다렸는지 알게(MCP deck_jobs, 2026-10-12)
            $err = trim((string) ($r['error'] ?? ''));
            $r['error'] = $r['status'] === 'failed' ? (mb_substr($err, 0, 300) ?: '작업 중 오류가 났습니다(사유 기록 없음).') : null;
            $age = (int) ($r['age_min'] ?? 0);
            unset($r['age_min']);
            $r['waiting_since'] = $r['status'] === 'queued' ? $r['created_at'] : null;
            $r['wait_min'] = $r['status'] === 'queued' ? $age : null;
            $th = Db::pdo()->prepare("SELECT kind, name FROM deck_job_files WHERE job_id = :j AND kind IN ('after','before','mockup') AND slide IS NOT NULL ORDER BY kind = 'after' DESC, kind = 'mockup' DESC, slide LIMIT 1");
            $th->execute([':j' => $r['id']]);
            $t = $th->fetch();
            $r['thumb'] = $t ? $t['name'] : null;
            $r['thumb_kind'] = $t ? $t['kind'] : null;
            // 시안이 아직 없는 작업 — 첫 장의 와이어프레임을 썸네일로 쓴다(기획이 있을 때)
            $r['wire1'] = null;
            if (!$t && $r['kind'] === 'design') {
                $pl = Db::pdo()->prepare('SELECT plan FROM deck_jobs WHERE id = :j');
                $pl->execute([':j' => $r['id']]);
                $plan = json_decode((string) $pl->fetchColumn(), true);
                $s0 = $plan['slides'][0] ?? null;
                if ($s0 && !empty($s0['wire'])) $r['wire1'] = ['title' => $s0['title'] ?? '', 'keyword' => $s0['keyword'] ?? '', 'section' => $s0['section'] ?? '', 'blocks' => $s0['wire']];
            }   // 그림이 어느 묶음(after·mockup·before)에 있는지 — 화면이 짐작하지 않게
        }
        return $rows;
    }

    public static function get(string $id, string $email, bool $admin): array
    {
        $raw = self::view($id, $email, $admin);
        $mine = $admin || $raw['email'] === $email;
        $j = self::shape($raw);
        $j['mine'] = $mine;                      // false = 공유 링크로 들어온 팀원 (보기·의견만)
        $j['admin'] = $admin;                    // 관리자 — 「설정」에 이 작업이 실제로 쓴 모델이 보인다
        $j['shared'] = !empty($raw['shared']);
        $j['share'] = (int) $raw['shared'];                 // 0 끔 · 1 의견 · 2 편집 · 3 링크로 보기
        $j['can_edit'] = $mine || ((int) $raw['shared'] === 2 && $email !== '');
        $j['anon'] = $email === '';                          // 로그인 없이 링크로 보는 중 — 보기만
        // 진짜 주인 — 화면의 설정·취소·시작 버튼 분기용. 관리자가 남의 작업을 열면 메일이 달라 false.
        // ⚠ 2026-10-14 전에는 `!$admin &&` 가 붙어 관리자 계정은 자기 작업에서도 멈추기·시작 버튼이 사라졌다
        $j['is_owner'] = $raw['email'] === $email;
        // 공유받은 사람에게 보여 줄 주인 표시 — 이메일 전체 대신 앞 2자 + *** (안전한 필드, 2026-10-10 상1)
        $local = (string) strstr((string) $raw['email'], '@', true);
        if ($local === '') $local = (string) $raw['email'];
        $j['owner_label'] = $mine ? $local : (mb_substr($local, 0, 2) . '***');
        $j['comments'] = $email === '' ? [] : self::comments($id);   // 로그인 없이 보는 사람에게는 의견(남긴 사람 메일)을 보이지 않는다
        if (!$mine) unset($j['note'], $j['feedback'], $j['email']);   // 공유받은 사람에게 주인 메일을 보이지 않는다(leak-audit 2026-10-06)
        $f = Db::pdo()->prepare('SELECT kind, slide, name, size, UNIX_TIMESTAMP(created_at) AS ts FROM deck_job_files WHERE job_id = :j ORDER BY kind, slide, name');
        $f->execute([':j' => $id]);
        $files = ['before' => [], 'after' => [], 'result' => [], 'extra' => [], 'source' => [], 'live' => [], 'frames' => [], 'draft' => [], 'pilot' => [], 'mockup' => []];
        foreach ($f->fetchAll() as $x) {
            $x['size'] = (int) $x['size'];
            $x['ts'] = (int) $x['ts'];
            $x['slide'] = $x['slide'] !== null ? (int) $x['slide'] : null;
            $files[$x['kind']][] = $x;
        }
        $j['files'] = $files;
        $j['docs'] = $email === '' ? [] : self::docs($id);
        if (($j['kind'] ?? '') === 'design') $j['est_image_usd'] = self::estImageUsd((string) $j['email']);
        if ($mine) $j['costs'] = self::costs($id);
        if ($mine) $j['script'] = Script::info($id, $j);
        $j['events'] = $email === '' ? [] : self::events($id, 0);
        $q = Db::pdo()->query("SELECT id FROM deck_jobs WHERE status = 'queued' ORDER BY created_at")->fetchAll(PDO::FETCH_COLUMN);
        $p = array_search($id, $q, true);
        $j['queue_pos'] = $p === false ? null : $p + 1;
        return $j;
    }

    public static function events(string $id, int $after): array
    {
        $st = Db::pdo()->prepare('SELECT id, ts, kind, message FROM deck_job_events WHERE job_id = :j AND id > :a ORDER BY id LIMIT 500');
        $st->execute([':j' => $id, ':a' => $after]);
        return array_map(static fn($e) => ['id' => (int) $e['id']] + $e, $st->fetchAll());
    }

    /* ───────────── 상태 바꾸기 — 취소 · 되돌리기 · 삭제 · 다시 · 보내기 ───────────── */

    public static function cancel(string $id, string $email, bool $admin): array
    {
        $j = self::own($id, $email, $admin);
        if ($j['status'] === 'queued' || $j['status'] === 'review' || $j['status'] === 'hold') {
            Db::pdo()->prepare("UPDATE deck_jobs SET status = 'canceled', finished_at = NOW() WHERE id = :i")->execute([':i' => $id]);
            self::event($id, 'warn', '사용자가 대기 중인 작업을 취소했습니다.');
        } elseif ($j['status'] === 'running') {
            Db::pdo()->prepare('UPDATE deck_jobs SET cancel_requested = 1 WHERE id = :i')->execute([':i' => $id]);
            self::event($id, 'warn', '취소를 요청했습니다. 엔진이 현재 단계를 마치는 대로 멈춥니다.');
        }
        return self::get($id, $email, $admin);
    }

    /**
     * 멈추고 내용 입력으로 — 기획 단계(design·phase plan)를 언제든 멈추고 '시작 대기(hold)' 로 되돌린다.
     * 자료(회사소개서 등)를 더하거나 빼고 '검토 시작'을 누르면 기획을 처음부터 다시 짠다(2026-10-14 사용자 지시).
     * 엔진이 돌고 있으면 취소를 요청해 두고(opts.back), 엔진이 멈췄다고 알리면 finish·claim 이 hold 로 되돌린다.
     */
    public static function back(string $id, string $email, bool $admin): array
    {
        $j = self::own($id, $email, $admin);
        if (($j['kind'] ?? '') !== 'design' || !in_array($j['phase'] ?? 'plan', ['plan', '', null], true)) {
            Legacy::fail('기획 단계에서만 내용 입력으로 돌아갈 수 있습니다. 장표를 만들기 시작한 뒤에는 새 작업으로 시작해 주세요.', 409);
        }
        if ($j['status'] === 'hold') return self::get($id, $email, $admin);
        if ($j['status'] === 'running') {
            $op = !empty($j['opts']) ? (json_decode((string) $j['opts'], true) ?: []) : [];
            $op['back'] = 1;
            Db::pdo()->prepare('UPDATE deck_jobs SET cancel_requested = 1, opts = :o WHERE id = :i')
                ->execute([':o' => json_encode($op, JSON_UNESCAPED_UNICODE), ':i' => $id]);
            self::event($id, 'warn', '기획을 멈추고 내용 입력으로 돌아갑니다. 엔진이 지금 단계를 마치는 대로 멈춥니다.');
        } else {
            self::toHold($id);
        }
        return self::get($id, $email, $admin);
    }

    /** 기획 결과(plan·시안·사업 요약)를 비우고 hold 로 — 맥락 자료·로고·설정은 그대로 둔다 */
    private static function toHold(string $id): void
    {
        $pdo = Db::pdo();
        $st = $pdo->prepare('SELECT opts FROM deck_jobs WHERE id = :i');
        $st->execute([':i' => $id]);
        $op = json_decode((string) $st->fetchColumn(), true) ?: [];
        unset($op['back']);
        $pdo->prepare("UPDATE deck_jobs SET status = 'hold', phase = 'plan', plan = NULL, review = NULL, stage = NULL, progress = 0, worker = NULL,
                       claimed_at = NULL, heartbeat_at = NULL, started_at = NULL, finished_at = NULL, error = NULL, cancel_requested = 0,
                       opts = :o WHERE id = :i")
            ->execute([':o' => $op ? json_encode($op, JSON_UNESCAPED_UNICODE) : null, ':i' => $id]);
        // 옛 기획 미리 보기(plan.json)·시안·사업 요약(context.md)이 새 기획에 섞이지 않게 지운다
        foreach (glob(self::dir($id, 'mockup') . '/*') ?: [] as $f) if (is_file($f)) @unlink($f);
        $pdo->prepare("DELETE FROM deck_job_files WHERE job_id = ? AND kind IN ('mockup', 'live')")->execute([$id]);
        self::event($id, 'info', '내용 입력으로 돌아왔습니다. 자료를 더하거나 뺀 뒤 「검토 시작」을 누르면 기획을 처음부터 다시 짭니다.');
    }

    /** 자료가 바뀌면 서버에 저장된 사업 요약(context.md)은 낡은 것 — 지워서 다음 기획이 새 자료로 다시 요약하게 */
    private static function dropDigest(string $id): void
    {
        @unlink(self::dir($id, 'mockup') . '/context.md');
        Db::pdo()->prepare("DELETE FROM deck_job_files WHERE job_id = ? AND kind = 'mockup' AND name = 'context.md'")->execute([$id]);
    }

    /** 삭제 — 기록·파일까지 지운다. 진행 중이면 먼저 취소해야 한다. */
    public static function delete(string $id, string $email, bool $admin): array
    {
        $j = self::own($id, $email, $admin);
        if ($j['status'] === 'running') Legacy::fail('진행 중인 작업은 먼저 취소한 뒤 지울 수 있습니다.', 409);
        $pdo = Db::pdo();
        foreach (['deck_job_files', 'deck_job_events'] as $t) $pdo->prepare("DELETE FROM $t WHERE job_id = :i")->execute([':i' => $id]);
        $pdo->prepare('DELETE FROM deck_jobs WHERE id = :i')->execute([':i' => $id]);
        $root = Legacy::dataDir() . '/jobs/' . $id;
        if (preg_match('/^[0-9a-f]{16}$/', $id) && is_dir($root)) {
            $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
            foreach ($it as $f) $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
            @rmdir($root);
        }
        return ['ok' => true];
    }

    /** 다시 돌리기 — 끝난 작업을 같은 원본으로 대기열에 다시 올린다. */
    public static function retry(string $id, string $email, bool $admin): array
    {
        $j = self::own($id, $email, $admin);
        if (!in_array($j['status'], ['failed', 'canceled', 'done'], true)) Legacy::fail('진행 중인 작업은 다시 돌릴 수 없습니다.', 409);
        self::limitCheck((string) $j['email']);
        AiKeys::creditCheck((string) $j['email']);
        Db::pdo()->prepare("UPDATE deck_jobs SET status='queued', stage=NULL, progress=0, worker=NULL, claimed_at=NULL, heartbeat_at=NULL,
                             started_at=NULL, finished_at=NULL, error=NULL, cancel_requested=0, created_at=NOW() WHERE id = :i")
            ->execute([':i' => $id]);
        self::event($id, 'info', '다시 돌리기 — 대기열에 다시 올렸습니다.');
        return self::get($id, $email, $admin);
    }

    /** 파일 내려주기 (로그인 확인 후). */
    public static function send(string $id, string $email, bool $admin, string $kind, string $name, bool $download): void
    {
        $j = self::view($id, $email, $admin);
        if (!in_array($kind, self::KINDS, true)) Legacy::fail('잘못된 파일 종류', 400);
        // 공유로 들어온 팀원은 시안·렌더만 (원본·결과 파일·자료는 주인만)
        if (!$admin && $j['email'] !== $email && !in_array($kind, ['mockup', 'before', 'after', 'live'], true)) Legacy::fail('작업 주인만 받을 수 있습니다.', 403);
        $name = basename($name);
        $p = self::dir($id, $kind) . '/' . $name;
        if (!is_file($p)) Legacy::fail('파일이 없습니다.', 404);
        $ext = strtolower(pathinfo($p, PATHINFO_EXTENSION));
        $type = match ($ext) {
            'png' => 'image/png', 'jpg', 'jpeg' => 'image/jpeg', 'json' => 'application/json',
            'md' => 'text/markdown; charset=utf-8', 'txt' => 'text/plain; charset=utf-8',
            'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            default => 'application/octet-stream',
        };
        $out = $name;
        if ($kind === 'source') $out = $j['filename'];
        if ($kind === 'result') $out = $j['result_name'] ?: $name;
        if ($kind === 'pilot' && $name === 'pilot.pptx') $out = preg_replace('/\.pptx$/i', '', (string) $j['filename']) . '_시안.pptx';
        if ($kind === 'draft') $out = preg_replace('/\.pptx$/i', '', (string) $j['filename']) . '_작업중.pptx';
        header('Content-Type: ' . $type);
        header('Content-Length: ' . filesize($p));
        header('Cache-Control: private, max-age=' . ($kind === 'before' || $kind === 'after' ? '300' : '0'));
        header("Content-Disposition: " . ($download ? 'attachment' : 'inline') . "; filename*=UTF-8''" . rawurlencode($out));
        readfile($p);
    }

    /* ───────────── 엔진(작업자) 쪽 ───────────── */

    public static function heartbeatWorker(string $name, string $info): void
    {
        Db::pdo()->prepare('INSERT INTO deck_workers (name, seen_at, info) VALUES (:n, NOW(), :i) ON DUPLICATE KEY UPDATE seen_at = NOW(), info = VALUES(info)')
            ->execute([':n' => mb_substr($name, 0, 64), ':i' => mb_substr($info, 0, 255)]);
    }

    /** 대기 작업 하나를 원자적으로 가져간다. 15분 넘게 소식 없는 진행 작업은 다시 대기로 돌린다. */
    /**
     * 대기열에서 하나 잡는다.
     * - 고르게: 지금 돌고 있는 작업이 적은 사람의 것부터(한 사람이 여러 개 올려도 다른 사람이 밀리지 않게), 같으면 먼저 올린 것부터.
     * - lightOnly: 엔진의 무거운 자리(장표 제작·초안 다듬기 — PowerPoint 와 Claude 여러 개를 쓴다)가 찼을 때.
     *   가벼운 작업(기획·와이어프레임·시안, 글 고치기 — AI 호출 위주)만 잡는다.
     */
    public static function claim(string $worker, bool $lightOnly = false): ?array
    {
        $pdo = Db::pdo();
        try { self::purgeDocs(); } catch (Throwable $e) { error_log('[powerDeck] purgeDocs: ' . $e->getMessage()); }
        // 취소를 요청했는데 엔진이 90초 넘게 소식이 없으면(멈췄거나 재시작됨) 서버가 취소로 끝낸다
        $dead = $pdo->query("SELECT id, opts FROM deck_jobs WHERE status = 'running' AND cancel_requested = 1 AND heartbeat_at < (NOW() - INTERVAL 90 SECOND)")->fetchAll(PDO::FETCH_KEY_PAIR);
        foreach ($dead as $d => $dOpts) {
            if (!empty((json_decode((string) $dOpts, true) ?: [])['back'])) { self::toHold((string) $d); continue; }
            $pdo->prepare("UPDATE deck_jobs SET status = 'canceled', stage = '취소됨', finished_at = NOW() WHERE id = :i AND status = 'running'")->execute([':i' => $d]);
            self::event((string) $d, 'warn', '취소되었습니다.');
        }
        $stale = $pdo->query("SELECT id, worker FROM deck_jobs WHERE status = 'running' AND heartbeat_at < (NOW() - INTERVAL 15 MINUTE)")->fetchAll();
        foreach ($stale as $s) {
            $pdo->prepare("UPDATE deck_jobs SET status = 'queued', worker = NULL WHERE id = :i AND status = 'running'")->execute([':i' => $s['id']]);
            self::event($s['id'], 'warn', "엔진({$s['worker']})과 연결이 끊겨 대기열로 되돌렸습니다.");
        }
        for ($try = 0; $try < 3; $try++) {
            // 세로 제안서(제출용)는 기획 단계에서 결과까지 만드는 무거운 작업이라 가벼운 자리에 주지 않는다(엔진 is_heavy 와 같은 판정, 2026-10-15)
            $id = $pdo->query("SELECT id FROM deck_jobs WHERE status = 'queued'" . ($lightOnly ? " AND kind = 'design' AND phase IN ('plan', 'edit')
                               AND NOT (COALESCE(JSON_UNQUOTE(JSON_EXTRACT(opts, '$.purpose')), '') IN ('submit', 'company') AND COALESCE(source_kind, '') <> 'pptx')" : '') . "
                               ORDER BY (SELECT COUNT(*) FROM deck_jobs r WHERE r.email = deck_jobs.email AND r.status = 'running'), created_at LIMIT 1")->fetchColumn();
            if ($id === false) return null;
            $st = $pdo->prepare("UPDATE deck_jobs SET status = 'running', worker = :w, claimed_at = NOW(), heartbeat_at = NOW(),
                                 started_at = COALESCE(started_at, NOW()), stage = '준비', progress = 1
                                 WHERE id = :i AND status = 'queued'");
            $st->execute([':w' => $worker, ':i' => $id]);
            if ($st->rowCount() === 1) {
                self::event((string) $id, 'info', "변환 엔진이 작업을 시작했습니다 ({$worker}).");
                $j = $pdo->prepare('SELECT id, email, title, filename, size, slides, note, phase, pilot_slide, feedback, kind, source_kind, brief, budget_usd, spent_usd, plan, review, theme, opts FROM deck_jobs WHERE id = :i');
                $j->execute([':i' => $id]);
                $row = $j->fetch();
                $rf = glob(self::dir((string) $id, 'result') . '/*.pptx') ?: [];
                $row['result_file'] = $rf ? basename($rf[0]) : null;   // 글 고치기(phase=edit)가 받아 갈 결과 파일
                $row['comments'] = self::comments((string) $id, true);  // 해결 안 된 핀 의견 — 엔진이 시안·장표에 반영
                // 자가 개선 — 지난 작업들에서 반복된 결함(개선 체크리스트)을 이번 작업 지시에 넣는다
                $row['lessons'] = [];
                try { $row['lessons'] = Checklist::lessons(12); } catch (Throwable $e) { error_log('[pp-deck-checklist] ' . $e->getMessage()); }
                return $row;
            }
        }
        return null;
    }

    /** 엔진이 구독(CLI)으로 돌린 글 작업의 사용 기록 — 실제 청구가 아니라 환산액. kind: eplan(기획) · edigest(자료 요약) */
    public static function workerUsage(string $id, string $worker, array $b): array
    {
        $j = self::mine($id, $worker);
        $kind = in_array($b['kind'] ?? '', ['eplan', 'edigest', 'hf'], true) ? $b['kind'] : 'eplan';   // hf = Higgsfield 구독 크레딧(tokens_in = 크레딧×100)
        Db::pdo()->prepare('INSERT INTO deck_ai_usage (email, job_id, kind, model, cost_usd, tokens_in, tokens_out, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())')
            ->execute([strtolower((string) $j['email']), $id, $kind, mb_substr((string) ($b['model'] ?? 'claude'), 0, 128), (float) ($b['cost'] ?? 0), (int) ($b['turns'] ?? 0), (int) ($b['seconds'] ?? 0)]);
        return ['ok' => true];
    }

    /** 엔진이 맡은 진행 작업 (AI 대리 호출용) */
    public static function forWorker(string $id, string $worker): array
    {
        return self::mine($id, $worker);
    }

    private static function mine(string $id, string $worker): array
    {
        $st = Db::pdo()->prepare('SELECT * FROM deck_jobs WHERE id = :i');
        $st->execute([':i' => $id]);
        $j = $st->fetch();
        if (!$j) Legacy::fail('작업 없음', 404);
        if ($j['worker'] !== $worker || $j['status'] !== 'running') Legacy::fail('이 엔진이 맡은 진행 작업이 아닙니다.', 409);
        return $j;
    }

    /** 진행 보고 — 응답으로 취소 요청 여부를 돌려준다. */
    public static function progress(string $id, string $worker, array $b): array
    {
        $j = self::mine($id, $worker);
        $sets = ['heartbeat_at = NOW()'];
        $p = [':i' => $id];
        if (isset($b['stage'])) { $sets[] = 'stage = :s'; $p[':s'] = mb_substr((string) $b['stage'], 0, 64); }
        if (isset($b['progress'])) { $sets[] = 'progress = :p'; $p[':p'] = max(0, min(99, (int) $b['progress'])); }
        Db::pdo()->prepare('UPDATE deck_jobs SET ' . implode(', ', $sets) . ' WHERE id = :i')->execute($p);
        foreach ((array) ($b['events'] ?? []) as $e) {
            if (is_array($e) && trim((string) ($e['message'] ?? '')) !== '') self::event($id, (string) ($e['kind'] ?? 'info'), (string) $e['message']);
        }
        return ['cancel' => (bool) $j['cancel_requested']];
    }

    public static function putFile(string $id, string $worker, string $kind, string $name, ?int $slide): array
    {
        self::mine($id, $worker);
        if (!in_array($kind, self::KINDS, true) || $kind === 'source') Legacy::fail('잘못된 파일 종류');
        $name = basename($name);
        if ($name === '' || !preg_match('/\.(png|jpg|jpeg|pptx|json|md|txt' . ($kind === 'extra' ? '|ttf|otf|ttc' : '') . ')$/i', $name)) Legacy::fail('허용하지 않는 파일 형식');
        $p = self::dir($id, $kind) . '/' . $name;
        $in = fopen('php://input', 'rb');
        $out = fopen($p . '.part', 'wb');
        $n = stream_copy_to_stream($in, $out);
        fclose($in);
        fclose($out);
        rename($p . '.part', $p);
        self::addFile($id, $kind, $slide, $name, (int) $n);
        return ['ok' => true, 'size' => $n];
    }

    public static function finish(string $id, string $worker, array $b): array
    {
        $j0 = self::mine($id, $worker);
        $status = in_array($b['status'] ?? '', ['done', 'failed', 'canceled', 'review'], true) ? $b['status'] : 'failed';
        if (isset($b['engine']) && is_array($b['engine'])) {
            $en = $b['engine'];
            Db::pdo()->prepare("INSERT INTO deck_ai_usage (email, job_id, kind, model, cost_usd, tokens_in, tokens_out, created_at) VALUES (?, ?, 'engine', ?, ?, ?, ?, NOW())")
                ->execute([strtolower((string) $j0['email']), $id, mb_substr((string) ($en['model'] ?? 'claude'), 0, 128), (float) ($en['cost'] ?? 0),
                           (int) ($en['turns'] ?? 0), (int) ($en['seconds'] ?? 0)]);   // engine 행은 tokens_in=턴 수, tokens_out=걸린 초
        }
        // 개선 체크리스트 — 엔진 확인 목록·실패 사유를 쌓는다(막지 않음)
        if (isset($b['report']) && is_array($b['report'])) Checklist::safe(static fn () => Checklist::fromReport($id, $b['report']));
        if (isset($b['report']['guard']) && is_array($b['report']['guard'])) Checklist::safe(static fn () => Checklist::fromGuard($id, $b['report']));
        if ($status === 'failed' && !empty($b['error'])) Checklist::safe(static fn () => Checklist::fromFail($id, (string) $b['error']));
        // 「멈추고 내용 입력으로」를 눌러 멈춘 기획 — 취소로 끝내지 않고 시작 대기로 되돌린다
        if ($status === 'canceled' && !empty((json_decode((string) ($j0['opts'] ?? ''), true) ?: [])['back'])) {
            self::toHold($id);
            return ['ok' => true];
        }
        if ($status === 'done' && ($j0['phase'] ?? 'full') === 'pilot') return self::finishPilot($id, $b);
        if ($status === 'review') return self::finishPlan($id, $b);
        Db::pdo()->prepare('UPDATE deck_jobs SET status = :s, progress = :p, stage = :st, finished_at = NOW(), heartbeat_at = NOW(),
                            result_name = COALESCE(:r, result_name), report = COALESCE(:rep, report), error = :e WHERE id = :i')
            ->execute([':s' => $status, ':p' => $status === 'done' ? 100 : 0, ':st' => $status === 'done' ? '완료' : ($status === 'canceled' ? '취소됨' : '실패'),
                       ':r' => isset($b['result_name']) ? mb_substr((string) $b['result_name'], 0, 255) : null,
                       ':rep' => isset($b['report']) ? json_encode($b['report'], JSON_UNESCAPED_UNICODE) : null,
                       ':e' => isset($b['error']) ? mb_substr((string) $b['error'], 0, 4000) : null, ':i' => $id]);
        if (($j0['phase'] ?? '') === 'edit') {   // 글 고치기 — 원래 단계로 되돌리고 끝. 핀 의견·보고서는 건드리지 않는다
            Db::pdo()->prepare('UPDATE deck_jobs SET phase = :p, review = NULL WHERE id = :i')->execute([':p' => ($j0['kind'] ?? '') === 'design' ? 'build' : 'full', ':i' => $id]);
            self::event($id, 'done', (string) ($b['message'] ?? '글 고치기를 반영했습니다.'));
            return ['ok' => true];
        }
        if ($status === 'done' && ($j0['kind'] ?? '') === 'design') {
            Db::pdo()->prepare('UPDATE deck_job_comments SET resolved = 1 WHERE job_id = ? AND accepted = 1 AND resolved = 0')->execute([$id]);
        }
        self::event($id, $status === 'done' ? 'done' : 'error',
            $status === 'done' ? '변환이 끝났습니다.' : ($status === 'canceled' ? '취소되었습니다.' : '변환에 실패했습니다: ' . ($b['error'] ?? '')));
        if ($status === 'done') self::notifyOwner($id, '장표가 완성됐습니다', '내 작업에서 결과를 확인하고 내려받으세요.', 'deck_done');
        elseif ($status === 'failed') self::notifyOwner($id, '장표 변환에 실패했습니다', '내 작업에서 실패 사유를 보고 다시 돌릴 수 있습니다.', 'deck_failed');
        return ['ok' => true];
    }

    /**
     * 작업 주인에게 알림 — 헤더 종(항상) + 메일(주인이 '작업 완료' 메일을 켜 둔 경우, 기본 켬).
     * 작업은 이메일로 묶여 있어 core_users 로 찾는다. 실패해도 작업은 계속.
     * ⚠ 2026-10-07 전까지 Notify 를 use 하지 않아 Pp\Deck\Notify 로 찾다가 예외가 삼켜져 장표 알림이 한 번도 안 쌓였다.
     */
    private static function notifyOwner(string $id, string $title, ?string $body = null, ?string $mailType = null): void
    {
        try {
            $r = Db::row('SELECT u.id, j.title, j.slides, j.plan, j.error, TIMESTAMPDIFF(MINUTE, COALESCE(j.started_at, j.created_at), NOW()) AS mins
                          FROM deck_jobs j JOIN core_users u ON u.email = j.email WHERE j.id = ?', [$id]);
            if (!$r) return;
            $jobTitle = (string) $r['title'] ?: '장표';
            Notify::send((int) $r['id'], 'system', $title . ' — ' . $jobTitle, '/deck/jobs?id=' . rawurlencode($id), null, $body);
            if ($mailType === null) return;
            $plan = json_decode((string) ($r['plan'] ?? ''), true);
            $slides = (int) ($r['slides'] ?? 0) ?: (is_array($plan) ? count((array) ($plan['slides'] ?? [])) : 0);
            $vars = match ($mailType) {
                'deck_done', 'deck_plan', 'deck_mockup' => ['title' => $jobTitle, 'slides' => $slides ?: '-', 'minutes' => max(1, (int) ($r['mins'] ?? 0))],
                'deck_failed' => ['title' => $jobTitle, 'reason' => mb_substr(trim((string) ($r['error'] ?? '')) ?: '작업 중 오류가 났습니다.', 0, 300)],
                default => ['title' => $jobTitle],
            };
            Notify::mail((int) $r['id'], 'work', $mailType, $vars);
        } catch (Throwable $e) {
            error_log('[pp-deck] notify ' . $id . ': ' . $e->getMessage());
        }
    }

    /** design 기획 또는 시안 단계 완료 — 시안 확인을 기다린다. plan 은 장별 기획(JSON). */
    private static function finishPlan(string $id, array $b): array
    {
        $plan = null;
        if (isset($b['plan']) && is_array($b['plan'])) {
            $st = Db::pdo()->prepare('SELECT plan FROM deck_jobs WHERE id = ?');
            $st->execute([$id]);
            $old = json_decode((string) $st->fetchColumn(), true);
            $plan = json_encode(self::stampWires(is_array($old) ? $old : null, $b['plan']), JSON_UNESCAPED_UNICODE);
            Checklist::safe(static fn () => Checklist::fromPlan($id, $b['plan']));
        }
        Db::pdo()->prepare("UPDATE deck_jobs SET status = 'review', stage = '시안 확인', progress = 100, heartbeat_at = NOW(), review = NULL,
                            plan = COALESCE(:pl, plan), report = :rep, error = :e WHERE id = :i")
            ->execute([':pl' => $plan, ':rep' => isset($b['report']) ? json_encode($b['report'], JSON_UNESCAPED_UNICODE) : null,
                       ':e' => isset($b['error']) ? mb_substr((string) $b['error'], 0, 4000) : null, ':i' => $id]);
        // 시안 이미지가 있으면 시안 단계, 없으면 기획(글·와이어 A·B) 단계 — 메일·알림도 따로
        $hasMock = (bool) (glob(self::dir($id, 'mockup') . '/*.jpg') ?: []);
        if ($hasMock) {
            self::event($id, 'done', $b['message'] ?? '시안이 나왔습니다. 장마다 확인하고 확정하면 장표를 만듭니다.');
            self::notifyOwner($id, '시안이 나왔습니다', '장마다 확인하고 확정하면 장표를 만듭니다.', 'deck_mockup');
        } else {
            self::event($id, 'done', $b['message'] ?? '기획이 나왔습니다. 장마다 와이어프레임 A·B 를 고르고 확정하면 시안을 만듭니다.');
            self::notifyOwner($id, '기획이 나왔습니다', '장마다 와이어프레임 A·B 를 고르고 확정하면 시안을 만듭니다.', 'deck_plan');
        }
        return ['ok' => true];
    }

    /**
     * 와이어프레임 생성 시각(wire_at, UTC) — 엔진이 보낸 기획에서 배치가 이전과 다른 장만 지금 시각, 같은 장은 이전 시각을 잇는다.
     * 다시 돌렸을 때 새로 만든 것인지 화면에서 구분하려고.
     */
    private static function stampWires(?array $old, array $plan): array
    {
        $prev = [];
        foreach ((array) ($old['slides'] ?? []) as $s) if (is_array($s)) $prev[(int) ($s['n'] ?? 0)] = $s;
        $now = gmdate('Y-m-d H:i:s');
        foreach ((array) ($plan['slides'] ?? []) as $i => $s) {
            if (!is_array($s) || empty($s['wire'])) continue;
            $p = $prev[(int) ($s['n'] ?? 0)] ?? null;
            $same = $p && !empty($p['wire_at']) && json_encode($p['wire'] ?? null) === json_encode($s['wire']);
            $plan['slides'][$i]['wire_at'] = $same ? $p['wire_at'] : $now;
        }
        return $plan;
    }

    /** 시안(한 장) 단계 완료 — 사용자 확인을 기다린다. */
    private static function finishPilot(string $id, array $b): array
    {
        Db::pdo()->prepare("UPDATE deck_jobs SET status = 'review', stage = '한 장 확인', progress = 100, heartbeat_at = NOW(),
                            pilot_slide = :ps, report = :rep WHERE id = :i")
            ->execute([':ps' => isset($b['pilot_slide']) ? (int) $b['pilot_slide'] : null,
                       ':rep' => isset($b['report']) ? json_encode($b['report'], JSON_UNESCAPED_UNICODE) : null, ':i' => $id]);
        self::event($id, 'done', '한 장 시안이 나왔습니다. 확인하고 의견을 주시면 나머지 장을 진행합니다.');
        self::notifyOwner($id, '한 장 시안이 나왔습니다', '확인하고 의견을 주시면 나머지 장을 진행합니다.', 'deck_review');
        return ['ok' => true];
    }

    /* ───────────── 시안 확인 · 승인 · 편집 ───────────── */

    /**
     * 시안 확인 후 진행 — mode=continue: 나머지 장 진행 / mode=redo: 의견 반영해 시안 한 장 다시.
     * 의견은 누적해 엔진에 넘긴다(앞선 의견도 계속 지켜야 하므로).
     */
    public static function approve(string $id, string $email, bool $admin, array $b): array
    {
        $j = self::own($id, $email, $admin);
        if (($j['kind'] ?? 'polish') === 'design') return self::approveDesign($j, $email, $admin, $b);
        if ($j['status'] !== 'review') Legacy::fail('시안 확인 단계가 아닙니다.', 409);
        $mode = ($b['mode'] ?? 'continue') === 'redo' ? 'redo' : 'continue';
        $fb = trim((string) ($b['feedback'] ?? ''));
        if ($mode === 'redo' && $fb === '') Legacy::fail('다시 할 때는 어떻게 바꿀지 적어 주세요.');
        if ($fb !== '') Checklist::safe(static fn () => Checklist::fromFeedback($id, $fb, (int) ($j['pilot_slide'] ?? 0), '시안 의견'));
        $all =trim(((string) ($j['feedback'] ?? '')) . ($fb !== '' ? "\n- " . mb_substr($fb, 0, 3000) : ''));
        Db::pdo()->prepare("UPDATE deck_jobs SET status = 'queued', phase = :ph, feedback = :f, stage = NULL, progress = 0, worker = NULL,
                            claimed_at = NULL, heartbeat_at = NULL, started_at = NULL, cancel_requested = 0, created_at = NOW() WHERE id = :i")
            ->execute([':ph' => $mode === 'redo' ? 'pilot' : 'full', ':f' => $all !== '' ? $all : null, ':i' => $id]);
        self::event($id, 'info', $mode === 'redo'
            ? '의견을 반영해 시안 한 장을 다시 만듭니다: ' . $fb
            : ($fb !== '' ? '시안 승인 — 의견을 반영해 나머지 장을 진행합니다: ' . $fb : '시안 승인 — 나머지 장을 진행합니다.'));
        return self::get($id, $email, $admin);
    }

    /**
     * design 작업의 확인 단계.
     *   mode=build  : 시안 확정 → 장표 제작(phase build). 장별 내용 수정(slides[].content)은 plan 에 반영.
     *   mode=redo   : 고른 장만 시안 다시(phase plan). slides[] = {n, feedback, content?}. 나머지 장 시안은 그대로.
     *   mode=revise : 완성된 장표에 수정 요청 → 다시 제작(phase build). feedback 누적.
     */
    private static function approveDesign(array $j, string $email, bool $admin, array $b): array
    {
        AiKeys::creditCheck((string) $j['email']);   // 시안·장표를 만들러 가기 전에
        $id = $j['id'];
        $mode = (string) ($b['mode'] ?? 'build');
        $fb = trim((string) ($b['feedback'] ?? ''));
        $slides = array_values(array_filter((array) ($b['slides'] ?? []), 'is_array'));
        $plan = !empty($j['plan']) ? json_decode((string) $j['plan'], true) : null;
        if ($plan) WireAi::learn($id, $plan);   // 사람이 고친 와이어프레임을 남긴다(배치 학습용)
        // 장별 내용 수정은 어느 모드든 plan 에 반영한다
        if ($plan && isset($plan['slides'])) {
            foreach ($slides as $s) {
                foreach ($plan['slides'] as &$ps) {
                    if ((int) ($ps['n'] ?? 0) === (int) ($s['n'] ?? -1)) {
                        if (isset($s['content'])) $ps['content'] = mb_substr((string) $s['content'], 0, 20000);
                        if (isset($s['title'])) $ps['title'] = mb_substr((string) $s['title'], 0, 300);
                        foreach (['message', 'scene', 'layout'] as $k) if (isset($s[$k])) $ps[$k] = mb_substr((string) $s[$k], 0, 3000);
                    }
                }
                unset($ps);
            }
        }
        $planJson = $plan ? json_encode($plan, JSON_UNESCAPED_UNICODE) : null;
        // 개선 체크리스트 — 사용자가 적은 의견(전체·장별·표지류)을 주제별로 쌓는다
        Checklist::safe(static function () use ($id, $fb, $slides, $b, $mode): void {
            $where = ['build' => '확정 요청', 'redo' => '다시 만들기', 'revise' => '수정 요청'][$mode] ?? '의견';
            if ($fb !== '') Checklist::fromFeedback($id, $fb, 0, $where);
            foreach ($slides as $s) Checklist::fromFeedback($id, (string) ($s['feedback'] ?? ''), (int) ($s['n'] ?? 0), $where);
            foreach ((array) ($b['front_feedback'] ?? []) as $v) Checklist::fromFeedback($id, (string) $v, 0, $where . '(표지·목차·간지)');
        });
        $requeue ="status = 'queued', stage = NULL, progress = 0, worker = NULL, claimed_at = NULL, heartbeat_at = NULL, started_at = NULL, finished_at = NULL, cancel_requested = 0, created_at = NOW()";
        if (isset($b['front']) && is_array($b['front'])) {   // 표지·목차·간지 선택 — 제작 직전에 바꿀 수 있다
            $op = !empty($j['opts']) ? (json_decode((string) $j['opts'], true) ?: []) : [];
            $op['front'] = self::front($b['front']);
            Db::pdo()->prepare('UPDATE deck_jobs SET opts = :o WHERE id = :i')->execute([':o' => json_encode($op, JSON_UNESCAPED_UNICODE), ':i' => $id]);
        }
        if ($mode === 'build') {
            if ($j['status'] !== 'review') Legacy::fail('시안 확인 단계가 아닙니다.', 409);
            $all = trim(((string) ($j['feedback'] ?? '')) . ($fb !== '' ? "\n- " . mb_substr($fb, 0, 3000) : ''));
            Db::pdo()->prepare("UPDATE deck_jobs SET $requeue, phase = 'build', plan = COALESCE(:pl, plan), review = NULL, feedback = :f WHERE id = :i")
                ->execute([':pl' => $planJson, ':f' => $all !== '' ? $all : null, ':i' => $id]);
            self::event($id, 'info', '시안 확정 — 장표를 만듭니다.' . ($fb !== '' ? " 요청: $fb" : ''));
            self::dropDocs($id, '장표 만들기로 넘어가 — 기획에만 쓰는');
        } elseif ($mode === 'redo') {
            if ($j['status'] !== 'review') Legacy::fail('시안 확인 단계가 아닙니다.', 409);
            // redo = 다시(새로) 만들 장 번호. 없으면 예전처럼 slides 전부. 장별 의견은 slides[].feedback 에서
            $fbBy = [];
            foreach ($slides as $s) $fbBy[(int) ($s['n'] ?? 0)] = mb_substr(trim((string) ($s['feedback'] ?? '')), 0, 3000);
            $ns = isset($b['redo']) && is_array($b['redo']) ? array_map('intval', $b['redo']) : array_keys($fbBy);
            $redo = array_values(array_map(static fn($n) => ['n' => $n, 'feedback' => $fbBy[$n] ?? ''], array_filter(array_unique($ns), static fn($n) => $n > 0)));
            // 표지·목차·간지 시안 — id(cover·toc·div1…) 또는 종류(div = 간지 전부)
            $fr = array_values(array_unique(array_filter(array_map('strval', (array) ($b['front_redo'] ?? [])), static fn($x) => (bool) preg_match('/^(cover|toc|div\d{0,2})$/', $x))));
            $ffb = [];
            foreach ((array) ($b['front_feedback'] ?? []) as $k => $v) if (preg_match('/^(cover|toc|div\d{0,2})$/', (string) $k) && trim((string) $v) !== '') $ffb[$k] = mb_substr(trim((string) $v), 0, 3000);
            if (!$redo && !$fr) Legacy::fail('다시 만들 장을 골라 주세요.');
            Db::pdo()->prepare("UPDATE deck_jobs SET $requeue, phase = 'plan', plan = COALESCE(:pl, plan), review = :r WHERE id = :i")
                ->execute([':pl' => $planJson, ':r' => json_encode(['redo' => $redo, 'feedback' => $fb, 'front_redo' => $fr, 'front_feedback' => (object) $ffb], JSON_UNESCAPED_UNICODE), ':i' => $id]);
            $lab = ['cover' => '표지', 'toc' => '목차', 'div' => '간지'];
            self::event($id, 'info', '시안을 다시 만듭니다: ' . implode(', ', array_merge(array_map(static fn($s) => $s['n'] . '쪽', $redo),
                array_map(static fn($x) => $lab[preg_replace('/\d+$/', '', $x)] . (preg_match('/\d+$/', $x, $mm) ? " {$mm[0]}" : ''), $fr))));
        } elseif ($mode === 'revise') {
            if ($j['status'] !== 'done') Legacy::fail('완성된 장표에만 수정을 요청할 수 있습니다.', 409);
            $pins = count(self::comments($id, true));
            if ($fb === '' && $pins === 0) Legacy::fail('어떻게 바꿀지 적거나, 장표 위 의견을 반영 예정으로 확정해 주세요.');
            $all = trim(((string) ($j['feedback'] ?? '')) . ($fb !== '' ? "\n- " . mb_substr($fb, 0, 3000) : ''));
            $ns = array_values(array_unique(array_map(static fn($c) => (int) $c['slide'], self::comments($id, true))));
            // revise.all = 글로 적은 요청이 있어 전체를 다시 / 아니면 slides(의견이 달린 장)만 다시 만든다
            Db::pdo()->prepare("UPDATE deck_jobs SET $requeue, phase = 'build', feedback = :f, review = :r WHERE id = :i")
                ->execute([':f' => $all !== '' ? $all : null, ':r' => json_encode(['revise' => ['all' => $fb !== '', 'slides' => $ns]]), ':i' => $id]);
            self::clearFront($id);
            self::event($id, 'info', '수정 요청을 반영해 장표를 다시 만듭니다' . ($pins ? " (장표 위 의견 {$pins}개)" : '') . ($fb !== '' ? ': ' . $fb : '.'));
        } else {
            Legacy::fail('알 수 없는 모드');
        }
        return self::get($id, $email, $admin);
    }

    /**
     * 웹에서 장표 글 바로 고치기 — AI 없이 엔진이 그 도형의 글만 바꾸고 다시 렌더한다(1분 안팎).
     * edits = [{slide, id, text}] (id 는 mockup/text_map.json 의 것). 비어 있으면 글 위치만 다시 읽는다.
     */
    public static function edits(string $id, string $email, bool $admin, array $b): array
    {
        $j = self::own($id, $email, $admin);
        if ($j['status'] !== 'done') Legacy::fail('완성된 장표만 고칠 수 있습니다.', 409);
        $edits = [];
        foreach ((array) ($b['edits'] ?? []) as $e) {
            if (!is_array($e) || !preg_match('/^s\d+(:\d+:\d+)?$/', (string) ($e['id'] ?? '')) || (int) ($e['slide'] ?? 0) < 1) continue;
            $edits[] = ['slide' => (int) $e['slide'], 'id' => (string) $e['id'], 'text' => mb_substr((string) ($e['text'] ?? ''), 0, 5000)];
            if (count($edits) >= 300) break;
        }
        $front = isset($b['front']) && is_array($b['front']) ? ['front' => self::front($b['front'])] : [];
        Db::pdo()->prepare("UPDATE deck_jobs SET status = 'queued', stage = NULL, progress = 0, worker = NULL, claimed_at = NULL, heartbeat_at = NULL, started_at = NULL, finished_at = NULL,
                            cancel_requested = 0, created_at = NOW(), phase = 'edit', review = :r WHERE id = :i")
            ->execute([':r' => json_encode(['edits' => $edits] + $front, JSON_UNESCAPED_UNICODE), ':i' => $id]);
        if ($front) {
            self::clearFront($id);
            $op = !empty($j['opts']) ? (json_decode((string) $j['opts'], true) ?: []) : [];
            $op['front'] = $front['front'];
            Db::pdo()->prepare('UPDATE deck_jobs SET opts = :o WHERE id = :i')->execute([':o' => json_encode($op, JSON_UNESCAPED_UNICODE), ':i' => $id]);
        }
        self::event($id, 'info', $front ? '표지·목차·간지를 다시 넣습니다 (AI 없이).' : ($edits ? '글 ' . count($edits) . '곳을 고칩니다 (AI 없이 바로 반영).' : '장표의 글 위치를 읽습니다.'));
        return self::get($id, $email, $admin);
    }

    /** 엔진이 시안 결과물(pilot.pptx·결정.md)을 내려받는다. */
    public static function workerFile(string $id, string $kind, string $name): void
    {
        if (!in_array($kind, ['pilot', 'draft', 'mockup', 'brand', 'result'], true)) Legacy::fail('잘못된 파일 종류', 400);
        $p = self::dir($id, $kind) . '/' . basename($name);
        if (!is_file($p)) Legacy::fail('파일 없음', 404);
        header('Content-Type: application/octet-stream');
        header('Content-Length: ' . filesize($p));
        readfile($p);
    }
}
