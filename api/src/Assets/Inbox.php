<?php
declare(strict_types=1);

namespace Pp\Assets;

use Pp\Core\Config;
use Pp\Core\Db;
use Pp\Core\Ids;
use Pp\Core\Jev;
use Pp\Core\Llm;
use Pp\Core\Pick;
use Pp\Core\Scan;
use Pp\Deck\AiKeys;

/**
 * 자산 받은편지함(사용자 2026-10-20 "내가 이미지를 올려두면 알아서 일정시간 서버가 확인 후 자동 등록").
 * 관리자가 화면에서 그림을 올리면(accept) asset_inbox 에 pending 으로 쌓이고, 크론(api/bin/asset-inbox.php)이 process 로
 *   ① 같은 파일(sha256) → dup  ② 같은 세트 안 비슷한 그림(16×16 dHash, 썸네일과 비교 — 다른 세트는 비용 때문에 보지 않는다) → review
 *   ③ AI 판정(이름·검색 낱말·종류·글자·결함) → 글자·결함·AI 실패면 review, 아니면 register 로 바로 등록(done).
 * 등록은 db/migrate-legacy/register-photos.mjs·register-icons.mjs 와 같은 쓰기를 한다 —
 *   asset_sets(이름으로 찾고 없으면 만듦) · asset_items(visibility public, source own, ai_generated 1, legacy_key 'inbox:<받은편지함 id>')
 *   · core_files + asset_files(original·thumb, bucket 'assets', 경로 'inbox/<세트 폴더>/<에셋 id>.jpg|png') · asset_tags(kw ko/en + style 축).
 * 파일: 올린 원본은 <storage.dir>/inbox/<YYYYMMDD>/<무작위>.<확장자>(웹 밖), 미리보기는 같은 이름 .thumb.webp.
 *   등록·중복·빼기 뒤 원본은 지우고 미리보기만 남긴다(빼기는 미리보기까지). 서버에 사본을 남기지 않는다(자산 용량 최적화 원칙).
 * 원본 처리: 가로 2500 넘으면 2500 으로(비율 유지) · 진짜 투명이 있으면 PNG, 아니면 JPG q92(이미 JPG 이고 줄일 일이 없으면 받은 그대로).
 */
final class Inbox
{
    public const KINDS = ['auto', 'photo', 'illust', 'icon'];
    public const STATUSES = ['pending', 'processing', 'done', 'review', 'dup', 'failed', 'rejected'];
    public const MAX_BYTES = 50 * 1024 * 1024;
    public const MAX_WIDTH = 2500;
    /** 그림을 읽는 글 모델 — 메인 채팅 기본값과 같은 Haiku 4.5(그림 입력 가능, 한 장 약 $0.002). 관리자가 고른 채팅 모델은 그림을 못 읽을 수 있어 고정 */
    public const VISION_MODEL = 'anthropic/claude-haiku-4.5';
    /**
     * 16×16 dHash 256비트 중 이만큼 이하로 다르면 비슷한 그림.
     * 2026-10-20 실측(세트 4개 × 40장): 같은 그림(원본↔360 WebP 썸네일) 최대 34(p90 13~18) · 같은 세트 다른 그림 최소 46(p5 63~104).
     * 처음 20 으로 두었더니 원본을 85% 로 줄인 아이콘도 썸네일과 24 라 못 잡았다 → 36.
     */
    private const DHASH_NEAR = 36;
    /** 비교할 같은 세트 에셋 수 상한(최근 것부터) — 썸네일 360px 500장 읽기 약 1~2초 */
    private const SET_SCAN = 500;
    /** 평균 밝기가 이보다 어두우면 사유에 "어두운 그림"을 붙인다(어두운 그림은 이웃 밝기 차가 작아 dHash 가 틀리기 쉽다 — 그래서 dHash 로는 절대 빼지 않고 검토로만) */
    private const DARK_LUMA = 50.0;
    private const BASE_WORDS = [
        'photo' => [['사진', '실사'], ['photo']],
        'illust' => [['일러스트'], ['illustration']],
        'icon' => [['아이콘'], ['icon']],
    ];
    /** 그림에 글자로 안 보이면 낱말에 넣지 않는 기관 이름 꼴(엠바고·발주처 노출 방지) */
    private const ORG_RE = '/(식약처|식품의약품안전처|안전처|진흥원|위원회|공단|mfds)/iu';

    public static function root(): string
    {
        return rtrim((string) Config::get('storage.dir'), '/\\');
    }

    public static function inboxDir(): string
    {
        return self::root() . '/inbox';
    }

    /** 묶음 이름 → 세트 이름 'inbox-<낱말-낱말>'(한글 그대로, 48자 이하 — asset_items.style_group 길이) */
    public static function setName(string $label): string
    {
        $s = trim($label);
        if (class_exists(\Normalizer::class)) {
            $s = (string) \Normalizer::normalize($s, \Normalizer::FORM_C);
        }
        $s = mb_strtolower($s);
        $s = trim((string) preg_replace('/[^\p{L}\p{N}]+/u', '-', $s), '-');
        $s = mb_substr($s, 0, 42);
        $s = rtrim($s, '-');
        return 'inbox-' . ($s !== '' ? $s : 'set');
    }

    /** 세트 이름 → 저장 폴더 이름(영문·숫자만 쓰면 그대로, 한글이 섞이면 해시) */
    private static function dirOf(string $setName): string
    {
        return preg_match('/^[a-z0-9-]+$/', $setName) ? $setName : 'inbox-s' . substr(sha1($setName), 0, 12);
    }

    public static function previewRel(string $path): string
    {
        return (string) preg_replace('/\.[a-z0-9]+$/i', '', $path) . '.thumb.webp';
    }

    /**
     * 한 장 받기 — $f 는 $_FILES 꼴 한 칸(name·tmp_name·size·error). $uploaded=false 면 move_uploaded_file 대신 복사(시험·CLI).
     * 잘못된 파일은 \InvalidArgumentException(화면에 파일별로 보인다).
     */
    public static function accept(array $f, string $label, string $kind, string $batch, ?int $userId, bool $uploaded = true): array
    {
        $label = mb_substr(trim($label), 0, 120);
        if ($label === '') {
            throw new \InvalidArgumentException('묶음 이름을 적어 주세요.');
        }
        if (!in_array($kind, self::KINDS, true)) {
            $kind = 'auto';
        }
        if ((int) ($f['error'] ?? 1) !== UPLOAD_ERR_OK) {
            throw new \InvalidArgumentException((int) ($f['error'] ?? 0) === UPLOAD_ERR_INI_SIZE ? '파일이 서버 한도보다 큽니다.' : '파일을 받지 못했습니다.');
        }
        $tmp = (string) ($f['tmp_name'] ?? '');
        $size = (int) ($f['size'] ?? 0);
        if ($size < 1 || $size > self::MAX_BYTES) {
            throw new \InvalidArgumentException('한 장에 50MB 이하만 올릴 수 있습니다.');
        }
        $info = @getimagesize($tmp);
        if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true)) {
            throw new \InvalidArgumentException('JPG·PNG·WEBP 그림만 올릴 수 있습니다.');
        }
        $tooBig = Service::pixelLimitError((int) $info[0], (int) $info[1]);
        if ($tooBig !== null) {
            throw new \InvalidArgumentException($tooBig);
        }
        $ext = match ($info[2]) { IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', default => 'webp' };
        $sha = (string) hash_file('sha256', $tmp);
        $day = date('Ymd');
        $dir = self::inboxDir() . '/' . $day;
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new \RuntimeException('받은편지함 폴더를 만들 수 없습니다.');
        }
        $pid = Ids::publicId();
        $rel = "{$day}/" . Ids::publicId() . ".{$ext}";
        $abs = self::inboxDir() . '/' . $rel;
        $ok = $uploaded ? move_uploaded_file($tmp, $abs) : copy($tmp, $abs);
        if (!$ok) {
            throw new \RuntimeException('파일을 저장하지 못했습니다.');
        }
        // 미리보기(화면 목록용) — 1,600만 화소 넘는 그림은 웹 메모리(FPM 256M)를 넘길 수 있어 처리기(CLI 1G)가 만든다
        if ((int) $info[0] * (int) $info[1] <= 16_000_000) {
            try {
                $im = self::load($abs, $info[2]);
                if ($im) {
                    self::writeThumb($im, self::inboxDir() . '/' . self::previewRel($rel));
                }
                unset($im);
            } catch (\Throwable) {
            }
        }
        Db::exec('INSERT INTO asset_inbox (public_id, batch, set_name, kind_hint, orig_name, path, sha256, bytes, w, h, status, uploaded_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
            [$pid, $batch, $label, $kind, mb_substr((string) ($f['name'] ?? ''), 0, 255), $rel, $sha, $size,
                min(65535, (int) $info[0]), min(65535, (int) $info[1]), 'pending', $userId]);
        return (array) Db::row('SELECT * FROM asset_inbox WHERE public_id = ?', [$pid]);
    }

    /** 화면에 내보내는 꼴 */
    public static function out(array $r): array
    {
        $item = null;
        if ($r['item_id'] !== null) {
            $it = Db::row('SELECT public_id, name, category, deleted_at FROM asset_items WHERE id = ?', [(int) $r['item_id']]);
            if ($it) {
                $item = ['id' => $it['public_id'], 'name' => $it['name'], 'category' => $it['category'], 'deleted' => $it['deleted_at'] !== null];
            }
        }
        $arr = static function (mixed $j): array {
            $v = is_string($j) && $j !== '' ? json_decode($j, true) : null;
            return is_array($v) ? array_values(array_filter($v, 'is_string')) : [];
        };
        return [
            'id' => $r['public_id'], 'batch' => $r['batch'], 'set_name' => $r['set_name'], 'set_code' => self::setName((string) $r['set_name']),
            'kind' => $r['kind_hint'], 'orig_name' => $r['orig_name'], 'bytes' => (int) $r['bytes'],
            'w' => $r['w'] === null ? null : (int) $r['w'], 'h' => $r['h'] === null ? null : (int) $r['h'],
            'status' => $r['status'], 'reason' => $r['reason'], 'ai_name' => $r['ai_name'], 'ai_ko' => $arr($r['ai_ko']), 'ai_en' => $arr($r['ai_en']),
            'ai_category' => $r['ai_category'], 'ai_has_text' => $r['ai_has_text'] === null ? null : (bool) $r['ai_has_text'],
            'item' => $item, 'tries' => (int) $r['tries'], 'created_at' => $r['created_at'], 'updated_at' => $r['updated_at'],
            'thumb_url' => is_file(self::inboxDir() . '/' . self::previewRel((string) $r['path'])) ? '/api/v1/admin/assets/inbox/' . $r['public_id'] . '/thumb' : null,
        ];
    }

    // ---------------------------------------------------------------- 처리

    /** 멈춘 processing(30분) 되살리기 — 세 번 넘게 멈춘 것은 실패로 */
    public static function recover(): int
    {
        $n = Db::exec("UPDATE asset_inbox SET status = 'pending' WHERE status = 'processing' AND updated_at < NOW() - INTERVAL 30 MINUTE AND tries < 3");
        $n += Db::exec("UPDATE asset_inbox SET status = 'failed', reason = '처리 중 세 번 멈춤' WHERE status = 'processing' AND updated_at < NOW() - INTERVAL 30 MINUTE AND tries >= 3");
        return $n;
    }

    /**
     * 한 줄 처리 — 결과 상태와 사유. $dry 면 DB·파일을 바꾸지 않고 판정만(AI 는 부른다).
     * @return array{status:string, reason:?string}
     */
    public static function process(array $row, bool $dry = false): array
    {
        $id = (int) $row['id'];
        $abs = self::inboxDir() . '/' . $row['path'];
        $set = static function (array $f) use ($id, $dry): void {
            if ($dry || $f === []) {
                return;
            }
            $cols = implode(', ', array_map(static fn (string $k): string => "{$k} = ?", array_keys($f)));
            Db::exec("UPDATE asset_inbox SET {$cols} WHERE id = ?", [...array_values($f), $id]);
        };
        if (!is_file($abs)) {
            $set(['status' => 'failed', 'reason' => '원본 파일이 없습니다']);
            return ['status' => 'failed', 'reason' => '원본 파일이 없습니다'];
        }
        // ① 같은 파일 — 등록된 에셋(원본 sha256) 또는 먼저 올린 받은편지함 줄
        $same = Db::row('SELECT public_id, name FROM asset_items WHERE sha256 = ? AND deleted_at IS NULL LIMIT 1', [$row['sha256']]);
        $prev = $same ? null : Db::row("SELECT public_id, orig_name FROM asset_inbox WHERE sha256 = ? AND id < ? AND status IN ('pending','processing','done','review') ORDER BY id LIMIT 1", [$row['sha256'], $id]);
        if ($same || $prev) {
            $why = $same ? '같은 그림이 이미 있음: ' . ($same['name'] ?: '이름 없음') . ' (' . $same['public_id'] . ')' : '같은 파일을 먼저 올림: ' . $prev['orig_name'] . ' (' . $prev['public_id'] . ')';
            $set(['status' => 'dup', 'reason' => mb_substr($why, 0, 300)]);
            if (!$dry) {
                @unlink($abs);
            }
            return ['status' => 'dup', 'reason' => $why];
        }
        $im = self::load($abs);
        if (!$im) {
            $set(['status' => 'failed', 'reason' => '그림을 열 수 없습니다(깨진 파일)']);
            return ['status' => 'failed', 'reason' => '그림을 열 수 없습니다(깨진 파일)'];
        }
        $prevRel = self::previewRel((string) $row['path']);
        if (!$dry && !is_file(self::inboxDir() . '/' . $prevRel)) {
            self::writeThumb($im, self::inboxDir() . '/' . $prevRel);
        }
        $reasons = [];
        // ② 같은 세트 안 비슷한 그림 — 자동으로 빼지 않고 검토로만(dHash 는 어두운 그림·같은 구도 다른 그림에서 틀린다)
        [$hash, $luma] = self::dhash($im);
        $setName = self::setName((string) $row['set_name']);
        $best = null;
        foreach (self::setHashes($setName) as [$pid, $nm, $h]) {
            $d = self::distance($hash, $h);
            if ($d <= self::DHASH_NEAR && ($best === null || $d < $best[0])) {
                $best = [$d, $pid, $nm];
            }
        }
        if ($best !== null) {
            $reasons[] = '비슷한 그림 있음: ' . ($best[2] ?: '이름 없음') . " ({$best[1]}, 차이 {$best[0]}/256" . ($luma < self::DARK_LUMA ? ', 어두운 그림 — 눈으로 확인' : '') . ')';
        }
        unset($im);
        // ③ AI 판정
        $ai = self::vision($abs, (string) $row['set_name'], (string) $row['orig_name']);
        $jevText = self::jevText($abs, (string) $row['public_id']);
        if ($ai === null) {
            $reasons[] = 'AI 판정 못 함';
        } else {
            if ($ai['has_text'] || $jevText) {
                $reasons[] = '그림 안에 글자·로고가 보임' . (!$ai['has_text'] ? '(Jev)' : '');
            }
            if ($ai['defect']) {
                $reasons[] = '결함 의심' . ($ai['defect_reason'] !== '' ? ': ' . $ai['defect_reason'] : '');
            }
        }
        $fields = [
            'ai_name' => $ai['name'] ?? null,
            'ai_ko' => $ai ? json_encode($ai['ko'], JSON_UNESCAPED_UNICODE) : null,
            'ai_en' => $ai ? json_encode($ai['en'], JSON_UNESCAPED_UNICODE) : null,
            'ai_category' => $ai['category'] ?? null,
            'ai_has_text' => $ai ? (($ai['has_text'] || $jevText) ? 1 : 0) : ($jevText ? 1 : null),
        ];
        if ($reasons !== []) {
            $why = mb_substr(implode(' · ', $reasons), 0, 300);
            $set($fields + ['status' => 'review', 'reason' => $why]);
            return ['status' => 'review', 'reason' => $why];
        }
        if ($dry) {
            return ['status' => 'done', 'reason' => '[DRY] 등록 예정: ' . ($ai['name'] ?? '')];
        }
        $set($fields);
        $row = array_merge($row, $fields);
        self::register($row);
        return ['status' => 'done', 'reason' => null];
    }

    /**
     * 에셋으로 등록 — 처리기(done)와 화면의 '등록'(검토 필요 → 승인)이 같이 쓴다. 등록된 asset_items.id.
     * 같은 받은편지함 줄을 다시 등록하면(legacy_key 같음) 새로 만들지 않고 고친다.
     */
    public static function register(array $row, ?string $nameOverride = null): int
    {
        $abs = self::inboxDir() . '/' . $row['path'];
        $info = @getimagesize($abs);
        $im = $info ? self::load($abs, $info[2]) : null;
        if (!$im) {
            throw new \RuntimeException('원본 그림을 열 수 없습니다.');
        }
        $rotated = self::$rotated;
        $w = imagesx($im);
        $h = imagesy($im);
        $alpha = self::hasAlpha($im);
        $resize = $w > self::MAX_WIDTH;
        if ($resize) {
            $nh = max(1, (int) round($h * self::MAX_WIDTH / $w));
            $dst = imagecreatetruecolor(self::MAX_WIDTH, $nh);
            imagealphablending($dst, false);
            imagesavealpha($dst, true);
            imagefill($dst, 0, 0, imagecolorallocatealpha($dst, 0, 0, 0, 127));
            imagecopyresampled($dst, $im, 0, 0, 0, 0, self::MAX_WIDTH, $nh, $w, $h);
            $im = $dst;
            $w = self::MAX_WIDTH;
            $h = $nh;
        }
        $cat = in_array($row['kind_hint'], ['photo', 'illust', 'icon'], true) ? (string) $row['kind_hint']
            : (in_array($row['ai_category'] ?? '', ['photo', 'illust', 'icon'], true) ? (string) $row['ai_category'] : 'photo');
        $setName = self::setName((string) $row['set_name']);
        $dirRel = 'inbox/' . self::dirOf($setName);
        $dirAbs = self::root() . '/assets/' . $dirRel;
        if (!is_dir($dirAbs) && !mkdir($dirAbs, 0775, true) && !is_dir($dirAbs)) {
            throw new \RuntimeException('저장 폴더를 만들 수 없습니다.');
        }
        $legacy = 'inbox:' . $row['public_id'];
        $ex = Db::row('SELECT id, public_id FROM asset_items WHERE legacy_key = ?', [$legacy]);
        $pid = $ex ? (string) $ex['public_id'] : Ids::publicId();
        $ext = $alpha ? 'png' : 'jpg';
        $origRel = "{$dirRel}/{$pid}.{$ext}";
        $thumbRel = "{$dirRel}/{$pid}.thumb.webp";
        $origAbs = self::root() . '/assets/' . $origRel;
        // 받은 그대로 둘 수 있으면(같은 형식·줄이지 않음·돌리지 않음) 다시 굽지 않는다
        $asIs = !$resize && !$rotated && (($alpha && $info[2] === IMAGETYPE_PNG) || (!$alpha && $info[2] === IMAGETYPE_JPEG));
        if ($asIs) {
            $ok = copy($abs, $origAbs);
        } elseif ($alpha) {
            imagealphablending($im, false);
            imagesavealpha($im, true);
            $ok = imagepng($im, $origAbs, 6);
        } else {
            $flat = imagecreatetruecolor($w, $h);
            imagefill($flat, 0, 0, imagecolorallocate($flat, 255, 255, 255));
            imagecopy($flat, $im, 0, 0, 0, 0, $w, $h);
            $ok = imagejpeg($flat, $origAbs, 92);
            unset($flat);
        }
        if (!$ok || !self::writeThumb($im, self::root() . '/assets/' . $thumbRel)) {
            throw new \RuntimeException('등록 파일을 쓰지 못했습니다.');
        }
        unset($im);
        $tw = 0;
        $th = 0;
        $ti = @getimagesize(self::root() . '/assets/' . $thumbRel);
        if ($ti) {
            [$tw, $th] = $ti;
        }
        $sha = (string) hash_file('sha256', $origAbs);
        $name = mb_substr(trim((string) ($nameOverride ?? '')), 0, 200);
        if ($name === '') {
            $name = trim((string) ($row['ai_name'] ?? ''));
        }
        if ($name === '') {
            $name = mb_substr((string) preg_replace('/\.[a-z0-9]+$/i', '', (string) $row['orig_name']), 0, 200) ?: '이름 없음';
        }
        $hasText = (int) ($row['ai_has_text'] ?? 0) === 1;
        [$ko, $en] = self::tags($row, $cat, $hasText);
        $files = ['original' => [$origRel, $alpha ? 'image/png' : 'image/jpeg', $w, $h], 'thumb' => [$thumbRel, 'image/webp', $tw, $th]];
        $uploadedBy = $row['uploaded_by'] === null ? null : (int) $row['uploaded_by'];
        $itemId = Db::tx(static function () use ($setName, $cat, $ex, $pid, $name, $w, $h, $hasText, $sha, $legacy, $files, $ko, $en, $uploadedBy): int {
            $setId = Db::val('SELECT id FROM asset_sets WHERE name = ?', [$setName]);
            if ($setId === null) {
                Db::exec('INSERT INTO asset_sets (public_id, name, style, category) VALUES (?,?,?,?)', [Ids::publicId(), $setName, mb_substr($setName, 0, 40), $cat]);
                $setId = Db::lastId();
            }
            $setId = (int) $setId;
            $style = mb_substr($setName, 0, 48);
            if ($ex) {
                $id = (int) $ex['id'];
                Db::exec('UPDATE asset_items SET category = ?, name = ?, alt = ?, w = ?, h = ?, has_text = ?, style_group = ?, set_id = ?, sha256 = ?, deleted_at = NULL WHERE id = ?',
                    [$cat, $name, $name, $w, $h, $hasText ? 1 : 0, $style, $setId, $sha, $id]);
            } else {
                Db::exec("INSERT INTO asset_items (public_id, owner_user_id, visibility, category, name, alt, w, h, has_text, style_group, set_id, source, sha256, legacy_key, ai_generated) VALUES (?, ?, 'public', ?, ?, ?, ?, ?, ?, ?, ?, 'own', ?, ?, 1)",
                    [$pid, $uploadedBy, $cat, $name, $name, $w, $h, $hasText ? 1 : 0, $style, $setId, $sha, $legacy]);
                $id = Db::lastId();
            }
            foreach ($files as $kind => [$path, $mime, $fw, $fh]) {
                $abs = self::root() . '/assets/' . $path;
                $fsha = (string) hash_file('sha256', $abs);
                $bytes = (int) filesize($abs);
                $fid = Db::val("SELECT id FROM core_files WHERE bucket = 'assets' AND path = ?", [$path]);
                if ($fid !== null) {
                    Db::exec('UPDATE core_files SET mime = ?, bytes = ?, w = ?, h = ?, sha256 = ? WHERE id = ?', [$mime, $bytes, $fw ?: null, $fh ?: null, $fsha, (int) $fid]);
                } else {
                    Db::exec("INSERT INTO core_files (public_id, bucket, path, mime, bytes, w, h, sha256, owner_user_id, visibility) VALUES (?, 'assets', ?, ?, ?, ?, ?, ?, ?, 'public')",
                        [Ids::publicId(), $path, $mime, $bytes, $fw ?: null, $fh ?: null, $fsha, $uploadedBy]);
                    $fid = Db::lastId();
                }
                Db::exec('INSERT INTO asset_files (item_id, kind, file_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE file_id = VALUES(file_id)', [$id, $kind, (int) $fid]);
            }
            Db::exec('DELETE FROM asset_tags WHERE item_id = ?', [$id]);
            $rows = [];
            foreach ($ko as $t) {
                $rows[] = [$t, 'ko', 'kw'];
            }
            foreach ($en as $t) {
                $rows[] = [$t, 'en', 'kw'];
            }
            $rows[] = [mb_strtolower($style), 'ko', 'style'];
            foreach ($rows as [$t, $lang, $axis]) {
                Db::exec('INSERT IGNORE INTO asset_tags (item_id, tag, lang, axis) VALUES (?,?,?,?)', [$id, $t, $lang, $axis]);
            }
            Db::exec('UPDATE asset_sets s SET item_count = (SELECT COUNT(*) FROM asset_items i WHERE i.set_id = s.id AND i.deleted_at IS NULL) WHERE s.id = ?', [$setId]);
            return $id;
        });
        Db::exec("UPDATE asset_inbox SET status = 'done', reason = NULL, item_id = ? WHERE id = ?", [$itemId, (int) $row['id']]);
        foreach ($files as [$path]) {   // 업로드 바이러스 검사 대기열(SEC-011) — 화면 등록(POST /admin/assets)과 같게
            Scan::queue(self::root() . '/assets/' . $path, 'asset', $pid, $uploadedBy);
        }
        @unlink($abs);   // 등록본이 생겼으니 받은 원본은 지운다(미리보기만 남김)
        if (isset(self::$setCache[$setName]) && ($thumb = self::load(self::root() . '/assets/' . $thumbRel))) {
            self::$setCache[$setName][] = [$pid, $name, self::dhash($thumb)[0]];   // 같은 회차 뒤 그림이 방금 넣은 것과도 비교되게
        }
        return $itemId;
    }

    /** 검색 낱말 — AI 낱말 + 종류 기본 낱말 + 묶음 이름 낱말(기관 이름 꼴은 그림에 글자가 없으면 뺀다) */
    private static function tags(array $row, string $cat, bool $hasText): array
    {
        $norm = static function (string $t): string {
            if (class_exists(\Normalizer::class)) {
                $t = (string) \Normalizer::normalize($t, \Normalizer::FORM_C);
            }
            return mb_substr(mb_strtolower(trim($t)), 0, 64);
        };
        $dec = static function (mixed $j): array {
            $v = is_string($j) && $j !== '' ? json_decode($j, true) : (is_array($j) ? $j : null);
            return is_array($v) ? array_values(array_filter($v, 'is_string')) : [];
        };
        $words = array_values(array_filter(preg_split('/[\s,·\/_\-]+/u', (string) $row['set_name']) ?: [], static fn (string $w): bool => mb_strlen($w) >= 2));
        $ko = [...$dec($row['ai_ko'] ?? null), ...array_slice($words, 0, 6), ...self::BASE_WORDS[$cat][0]];
        $en = [...$dec($row['ai_en'] ?? null), ...self::BASE_WORDS[$cat][1]];
        $clean = static function (array $list) use ($norm, $hasText): array {
            $out = [];
            foreach ($list as $t) {
                $t = $norm((string) $t);
                if ($t === '' || (!$hasText && preg_match(self::ORG_RE, $t))) {
                    continue;
                }
                $out[$t] = true;
            }
            return array_keys($out);
        };
        return [$clean($ko), $clean($en)];
    }

    // ---------------------------------------------------------------- AI

    /**
     * 그림 판정 — 이름·한국어/영어 낱말·종류·글자·결함. 키가 없거나 실패·형식이 틀리면 null(→ 검토 필요).
     * @return array{name:?string, ko:list<string>, en:list<string>, category:?string, has_text:bool, defect:bool, defect_reason:string}|null
     */
    public static function vision(string $abs, string $setLabel, string $origName): ?array
    {
        $img = Pick::imagePart($abs);   // 긴 변 480 JPEG — 비용을 낮게
        if ($img === null) {
            return null;
        }
        $prompt = "이 그림을 SI 제안서·홈페이지 목업에 쓰는 이미지 자산 라이브러리에 등록하려 한다.\n"
            . '관리자가 붙인 묶음 이름: «' . mb_substr($setLabel, 0, 60) . "»\n"
            . "아래 JSON 하나로만 답하라(설명·코드 블록 없이).\n"
            . '{"name_ko": "장면이나 사물을 설명하는 짧은 한국어 이름(30자 이하)", "ko": ["한국어 검색 낱말 8~15개 — 사물·장면·색·분위기·쓰임, 낱말 하나씩"], '
            . '"en": ["English search keywords 6-12"], "category": "photo(실사 사진) | illust(일러스트·3D 렌더·그래픽) | icon(단독 아이콘·픽토그램) 중 하나", '
            . '"has_text": "그림 안에 읽을 수 있는 글자·숫자·로고가 박혀 있으면 true", "defect": "잘림·깨짐·워터마크·심한 흐림이 있으면 true", "defect_reason": "defect 가 true 일 때 한 줄 이유, 아니면 빈 글"}' . "\n"
            . "규칙: 그림에 글자로 보이지 않는 기관·회사·사업 이름(부처·청·공단 이름 등)은 이름과 낱말에 넣지 않는다. 묶음 이름의 고유 이름도 그림에 안 보이면 넣지 않는다.";
        $raw = Llm::chat([
            ['role' => 'system', 'content' => '너는 이미지 자산 분류기다. 요청한 JSON 하나만 답한다.'],
            ['role' => 'user', 'content' => [['type' => 'text', 'text' => $prompt], $img]],
        ], 600, 60, self::VISION_MODEL, 'inbox');
        if ($raw === null) {
            return null;
        }
        $s = AiKeys::jsonClean($raw);
        $a = strpos($s, '{');
        $b = strrpos($s, '}');
        $d = $a !== false && $b !== false && $b > $a ? json_decode(substr($s, $a, $b - $a + 1), true) : null;
        if (!is_array($d)) {
            error_log('[inbox] AI 답을 못 읽음: ' . mb_substr($raw, 0, 200));
            return null;
        }
        // 빈 값부터(R09) — 글이 아닌 칸·빈 배열·이상한 종류를 걸러 낸다
        $list = static function (mixed $v, int $max): array {
            $out = [];
            foreach (is_array($v) ? $v : [] as $t) {
                if (!is_string($t) && !is_int($t)) {
                    continue;
                }
                $t = mb_substr(trim((string) $t), 0, 64);
                if ($t !== '' && !in_array($t, $out, true)) {
                    $out[] = $t;
                }
            }
            return array_slice($out, 0, $max);
        };
        $bool = static fn (mixed $v): bool => $v === true || $v === 1 || (is_string($v) && in_array(strtolower(trim($v)), ['true', 'yes', '1', '예'], true));
        $ko = $list($d['ko'] ?? null, 15);
        $en = array_map('strtolower', $list($d['en'] ?? null, 12));
        if ($ko === [] && $en === []) {
            return null;
        }
        $name = mb_substr(trim(is_string($d['name_ko'] ?? null) ? $d['name_ko'] : ''), 0, 30);
        $cat = is_string($d['category'] ?? null) ? strtolower(trim($d['category'])) : '';
        $hasText = $bool($d['has_text'] ?? false);
        if (!$hasText) {   // 그림에 글자가 없는데 기관 이름을 붙였으면 이름에서도 뺀다
            $ko = array_values(array_filter($ko, static fn (string $t): bool => !preg_match(self::ORG_RE, $t)));
            $en = array_values(array_filter($en, static fn (string $t): bool => !preg_match(self::ORG_RE, $t)));
            if ($name !== '' && preg_match(self::ORG_RE, $name)) {
                $name = '';
            }
        }
        return [
            'name' => $name !== '' ? $name : null, 'ko' => $ko, 'en' => $en,
            'category' => in_array($cat, ['photo', 'illust', 'icon'], true) ? $cat : null,
            'has_text' => $hasText, 'defect' => $bool($d['defect'] ?? false),
            'defect_reason' => mb_substr(trim(is_string($d['defect_reason'] ?? null) ? $d['defect_reason'] : ''), 0, 120),
        ];
    }

    /** Jev 1.14 글자 판정(시험 15/15·음성 24/24, api/bin/asset-check.php) — 글 모델이 놓친 글자를 한 번 더 본다. 실패면 false */
    private static function jevText(string $abs, string $ref): bool
    {
        $img = Pick::imagePart($abs);
        if ($img === null) {
            return false;
        }
        $a = Jev::ask('asset_check', ['그림 자산:', $img], ['text' => ['type' => 'noul', 'instructions' => '그림 안에 읽을 수 있는 글자(제목·문구·간판 글씨·로고 글자)가 들어 있다']], 'inbox:' . $ref, 20);
        return isset($a['text']['noul']) && (float) $a['text']['noul'] >= 0.5;
    }

    // ---------------------------------------------------------------- 그림 도구

    /** load() 가 EXIF 방향대로 돌렸는지(돌렸으면 받은 그대로 둘 수 없다) */
    private static bool $rotated = false;
    /** 세트 이름 → [[pid, name, hash]] — 한 회차 안에서 한 번만 읽는다 */
    private static array $setCache = [];

    public static function load(string $abs, ?int $type = null): ?\GdImage
    {
        self::$rotated = false;
        $raw = @file_get_contents($abs);
        $im = $raw === false ? false : @imagecreatefromstring($raw);
        if (!$im) {
            return null;
        }
        if (!imageistruecolor($im)) {
            imagepalettetotruecolor($im);
        }
        imagesavealpha($im, true);
        $type ??= (int) (@getimagesize($abs)[2] ?? 0);
        if ($type === IMAGETYPE_JPEG && function_exists('exif_read_data')) {
            $o = (int) (@exif_read_data($abs)['Orientation'] ?? 1);
            $deg = match ($o) { 3 => 180, 6 => -90, 8 => 90, default => 0 };
            if ($deg !== 0) {
                $r = imagerotate($im, $deg, 0);
                if ($r) {
                    $im = $r;
                    self::$rotated = true;
                }
            }
        }
        return $im;
    }

    /** 진짜 투명 — 긴 변 256 으로 줄여 반투명 이상 화소가 0.5% 넘게 있으면 */
    private static function hasAlpha(\GdImage $im): bool
    {
        $w = imagesx($im);
        $h = imagesy($im);
        $s = min(1.0, 256 / max($w, $h));
        $sw = max(1, (int) round($w * $s));
        $sh = max(1, (int) round($h * $s));
        $t = imagecreatetruecolor($sw, $sh);
        imagealphablending($t, false);
        imagesavealpha($t, true);
        imagefill($t, 0, 0, imagecolorallocatealpha($t, 0, 0, 0, 127));
        imagecopyresampled($t, $im, 0, 0, 0, 0, $sw, $sh, $w, $h);
        $n = 0;
        $need = max(1, (int) ($sw * $sh * 0.005));
        for ($y = 0; $y < $sh; $y++) {
            for ($x = 0; $x < $sw; $x++) {
                if (((imagecolorat($t, $x, $y) >> 24) & 0x7F) >= 16 && ++$n >= $need) {
                    return true;
                }
            }
        }
        return false;
    }

    /** 긴 변 360 WebP(투명 유지) */
    public static function writeThumb(\GdImage $im, string $dst, int $max = 360): bool
    {
        $w = imagesx($im);
        $h = imagesy($im);
        $s = min(1.0, $max / max($w, $h));
        $tw = max(1, (int) round($w * $s));
        $th = max(1, (int) round($h * $s));
        $t = imagecreatetruecolor($tw, $th);
        imagealphablending($t, false);
        imagesavealpha($t, true);
        imagefill($t, 0, 0, imagecolorallocatealpha($t, 0, 0, 0, 127));
        imagecopyresampled($t, $im, 0, 0, 0, 0, $tw, $th, $w, $h);
        $dir = dirname($dst);
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            return false;
        }
        return imagewebp($t, $dst, 84);
    }

    /**
     * 16×16 dHash(흰 바탕에 눕혀 17×16 회색 → 가로 이웃 밝기 비교 256비트 = 32바이트) + 평균 밝기(0~255).
     * api/bin/asset-dup-scan.php 의 9×8 판을 키운 것 — 같은 세트 안 비슷한 장면을 더 촘촘히 가른다.
     * @return array{0:string, 1:float}
     */
    public static function dhash(\GdImage $im): array
    {
        $small = imagecreatetruecolor(17, 16);
        imagefill($small, 0, 0, imagecolorallocate($small, 255, 255, 255));
        imagecopyresampled($small, $im, 0, 0, 0, 0, 17, 16, imagesx($im), imagesy($im));
        $bytes = '';
        $sum = 0.0;
        for ($y = 0; $y < 16; $y++) {
            $prev = null;
            $acc = 0;
            $bit = 0;
            for ($x = 0; $x < 17; $x++) {
                $c = imagecolorat($small, $x, $y);
                $g = ((($c >> 16) & 255) * 299 + (($c >> 8) & 255) * 587 + ($c & 255) * 114) / 1000;
                $sum += $g;
                if ($prev !== null) {
                    $acc = ($acc << 1) | ($prev > $g ? 1 : 0);
                    if (++$bit === 8) {
                        $bytes .= chr($acc);
                        $acc = 0;
                        $bit = 0;
                    }
                }
                $prev = $g;
            }
        }
        return [$bytes, $sum / (17 * 16)];
    }

    public static function distance(string $a, string $b): int
    {
        static $pc = null;
        if ($pc === null) {
            $pc = [];
            for ($i = 0; $i < 256; $i++) {
                $pc[$i] = substr_count(decbin($i), '1');
            }
        }
        if (strlen($a) !== strlen($b)) {
            return 256;
        }
        $n = 0;
        foreach (count_chars($a ^ $b, 1) as $byte => $cnt) {
            $n += $pc[$byte] * $cnt;
        }
        return $n;
    }

    /** 같은 세트에 이미 있는 에셋들의 썸네일 dHash — 세트가 없으면 빈 목록 */
    private static function setHashes(string $setName): array
    {
        if (isset(self::$setCache[$setName])) {
            return self::$setCache[$setName];
        }
        $rows = Db::rows("SELECT i.public_id, i.name, f.bucket, f.path FROM asset_sets s JOIN asset_items i ON i.set_id = s.id AND i.deleted_at IS NULL
                           JOIN asset_files af ON af.item_id = i.id AND af.kind = 'thumb' JOIN core_files f ON f.id = af.file_id
                          WHERE s.name = ? ORDER BY i.id DESC LIMIT " . self::SET_SCAN, [$setName]);
        $out = [];
        foreach ($rows as $r) {
            $im = self::load(self::root() . '/' . $r['bucket'] . '/' . $r['path']);
            if (!$im) {
                continue;
            }
            $out[] = [(string) $r['public_id'], (string) ($r['name'] ?? ''), self::dhash($im)[0]];
        }
        return self::$setCache[$setName] = $out;
    }
}
