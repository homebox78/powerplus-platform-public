<?php
/**
 * 목업 샘플 라이브러리 = powerAssets 의 샘플 묶음(사용자 2026-10-11 "파워목업 MCP 제작 시 파워에셋에서 가져오게").
 * 예전에는 레퍼런스 엔진(services/mockref-api)이 자기 data/sample-images.json 을 읽었다. 이제 원본은 asset_items 이고
 * 'kind' 축 태그가 있는 행 = 샘플 라이브러리. 새 샘플은 powerAssets 에 등록하면 다음 갱신(5분 캐시) 때 MCP 시안에 쓰인다.
 * 응답 모양은 레퍼런스 엔진 Samples::all() 의 항목 그대로(id·kind·kind_label·use_for·file·thumb·w·h·aspect·alt·tags·has_text·text_safe).
 * file·thumb 는 절대 주소(공개 샘플 파일 경로) — 엔진의 Samples::url() 이 http 로 시작하면 그대로 쓴다.
 */
declare(strict_types=1);

namespace Pp\Assets;

use Pp\Core\Config;
use Pp\Core\Db;
use Pp\Core\HttpError;

final class MockSamples
{
    /** 종류 이름(옛 sample-images.json 의 kind_label 그대로 + 2026-10-11 새 종류) */
    public const KIND_LABEL = [
        'archive-photo' => '연혁 기록 사진(흑백·세피아)', 'banner' => '배너존(글자 포함)', 'building-illust' => '기관 건물 일러스트(글자 없음, 투명)',
        'card-news' => '카드뉴스(SNS 소식, 글자 포함)', 'citizen' => '콘텐츠 속 주민', 'emblem' => '로고·상징', 'hero-city' => '메인 비주얼(도시)',
        'hero-illust' => '메인 비주얼 일러스트(글자 없음, 한쪽 여백)', 'hero-nature' => '메인 비주얼(자연·농어촌)', 'icon-blue' => '평면 파랑 반투명 겹침 아이콘(투명)',
        'icon-color' => '컬러 입체 아이콘(투명)', 'icon-flat' => '평면 파스텔 아이콘(투명)', 'icon-glass' => '유리 질감 입체 아이콘(투명, 파랑)', 'icon-gradient' => '컬러 그라데이션 평면 아이콘(투명)',
        'icon-iso' => '입체 무광 아이소메트릭 아이콘(투명, 남색)', 'icon-set' => '바로가기 아이콘', 'infographic' => '숫자·안내 인포그래픽(글자 포함)',
        'leader' => '기관장 인사말 사진', 'leader-cutout' => '기관장(배경 없음, 투명)', 'leader-field' => '기관장 현장 활동', 'mascot' => '마스코트(글자 없음, 투명)',
        'news-thumb' => '소식·보도자료 썸네일', 'notice-square' => '정사각 알림판 1:1(글자 포함, 공용)', 'pattern-bg' => '배경 무늬(비전·띠 문구, 글자 없음)',
        'place' => '관광·시설 소개', 'popup' => '팝업존(글자 포함)', 'popup-tall' => '세로형 팝업 8:9(글자 포함, 공용)', 'popup-wide' => '팝업존 가로 배너 2:1(글자 포함, 공용)',
        'poster' => '행사 포스터(세로, 글자 포함)', 'signature' => '친필 서명', 'spot-illust' => '안내 삽화(빈 결과·오시는 길·완료, 글자 없음, 투명)',
        'strip-banner' => '띠 배너 4:1(글자 포함, 공용)', 'sub-visual' => '서브페이지 상단 띠', 'symbol-illust' => '상징 삽화(꽃·나무·새·동물, 글자 없음, 투명)',
        'tour' => '관광 명소·축제 사진(글자 없음)', 'video-thumb' => '영상 썸네일 16:9(글자 포함, 공용)',
        'hero-keyvisual' => '메인 비주얼 키비주얼(산업·공공사업, 글자 없음, 왼쪽 글자 자리)',
    ];

    /**
     * 세트 → 목업 종류(2026-10-14 사용자 "파워에셋에 올린 아이콘·이미지를 MCP 가 잘 꺼내 쓰게").
     * 'kind' 태그를 따로 달지 않아도 이 세트에 올린 자산은 목업 재료가 된다 — 공개 등급(public)만(사내 전용이 공개 샘플 주소로 새지 않게).
     * [종류, 대상 묶음(Samples::ORG_GROUP 값 — 비우면 전체)]. 아이콘 세트(icon-…)는 세트 이름이 곧 종류 = 한 시안 안에서 스타일이 안 섞인다.
     */
    private const SET_KIND = [
        'photo-hero-keyvisual' => ['hero-keyvisual', ['corp', 'gov', 'biz', 'assoc']],
        'illust-keyvisual-glass' => ['hero-keyvisual', ['corp', 'gov', 'biz', 'assoc']],
        'illust-keyvisual-flat' => ['hero-keyvisual', ['corp', 'gov', 'biz', 'assoc']],
        'photo-keyvisual-climate' => ['hero-keyvisual', ['gov', 'corp']],
        'photo-doc-business' => ['news-thumb', ['biz', 'corp', 'assoc', 'foundation', 'gov']],
    ];

    /** 목업 재료인 행 — 'kind' 태그가 있거나, 공개 등급이고 SET_KIND 세트·아이콘 세트에 든 것. i = asset_items, s = asset_sets(LEFT JOIN) */
    private static function sampleWhere(): string
    {
        $sets = implode(', ', array_map(static fn ($n) => "'" . $n . "'", array_keys(self::SET_KIND)));
        return "(EXISTS (SELECT 1 FROM asset_tags t WHERE t.item_id = i.id AND t.axis = 'kind')"
            . " OR (i.visibility = 'public' AND i.w > 0 AND (s.name IN ({$sets}) OR (i.category = 'icon' AND s.name LIKE 'icon-%'))))";
    }

    private const CACHE_TTL = 300;

    /** @return list<array<string,mixed>> */
    public static function all(): array
    {
        $cache = rtrim(sys_get_temp_dir(), '/\\') . '/pp-mock-samples.json';
        if (is_file($cache) && filemtime($cache) > time() - self::CACHE_TTL) {
            $j = json_decode((string) file_get_contents($cache), true);
            if (is_array($j)) {
                return $j;
            }
        }
        $items = Db::rows(
            "SELECT i.id, i.public_id, i.legacy_key, i.legacy_alt_key, i.alt, i.w, i.h, i.has_text, i.text_safe, s.name AS set_name,
                    (SELECT t.tag FROM asset_tags t WHERE t.item_id = i.id AND t.axis = 'kind' LIMIT 1) AS kind
               FROM asset_items i LEFT JOIN asset_sets s ON s.id = i.set_id
              WHERE i.deleted_at IS NULL AND " . self::sampleWhere() . "
              ORDER BY i.id"
        );
        if ($items === []) {
            return [];
        }
        $tags = [];
        $ids = array_map(static fn ($r) => (int) $r['id'], $items);
        foreach (array_chunk($ids, 2000) as $chunk) {
            foreach (Db::rows("SELECT item_id, tag, axis FROM asset_tags WHERE axis IN ('kw','use','target') AND item_id IN (" . implode(',', $chunk) . ") ORDER BY item_id, axis, tag") as $t) {
                $tags[(int) $t['item_id']][$t['axis']][] = (string) $t['tag'];
            }
        }
        $base = rtrim((string) Config::get('app.url', 'https://powerplus.hom2box.com'), '/') . '/api/v1/assets/samples/';
        $out = [];
        foreach ($items as $r) {
            $id = (int) $r['id'];
            $hb = null;
            foreach ([$r['legacy_key'], $r['legacy_alt_key']] as $k) {
                if (is_string($k) && str_starts_with($k, 'hb:')) { $hb = substr($k, 3); break; }
            }
            $kind = (string) $r['kind'];
            $w = (int) $r['w']; $h = (int) $r['h'];
            $tg = $tags[$id] ?? [];
            if ($kind === '') { // 'kind' 태그 없이 세트로 들어온 자산 — 세트가 종류·대상을 정한다
                $set = (string) $r['set_name'];
                [$kind, $target] = self::SET_KIND[$set] ?? [$set, []];
                $tg['target'] = array_values(array_unique(array_merge($tg['target'] ?? [], $target)));
            }
            $all = array_values(array_merge($tg['kw'] ?? [], array_map(static fn ($x) => '대상:' . $x, $tg['target'] ?? [])));
            $safe = is_string($r['text_safe']) ? json_decode($r['text_safe'], true) : null;
            if ($kind === 'hero-keyvisual' && !is_array($safe)) { $safe = ['side' => 'left']; } // 키비주얼 세트는 왼쪽이 글자 자리로 만들었다
            $out[] = [
                'id' => $hb ?? ('pa-' . $r['public_id']),
                'kind' => $kind,
                'kind_label' => self::KIND_LABEL[$kind] ?? (str_starts_with($kind, 'icon-') ? '아이콘 세트 ' . $kind . '(투명)' : $kind),
                'use_for' => $tg['use'] ?? [],
                // 큰 원본(키비주얼 5375px·업무 사진 8192px, 장당 4~9MB)은 목업이 무거워지므로 긴 변 1920 판(web)으로
                'file' => $base . $r['public_id'] . (max($w, $h) > 2400 ? '/web' : '/original'),
                'thumb' => $base . $r['public_id'] . '/thumb',
                'w' => $w, 'h' => $h, 'aspect' => $h > 0 ? round($w / $h, 3) : 1,
                'alt' => (string) ($r['alt'] ?? ''),
                'tags' => $all,
                'has_text' => (bool) $r['has_text'],
                'temporary' => false,
                'note' => null,
                'text_safe' => is_array($safe) ? $safe : null,
                'asset_id' => $r['public_id'],
            ];
        }
        @file_put_contents($cache, json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
        return $out;
    }

    /** 샘플 파일 공개 제공 — 샘플 라이브러리('kind' 축 태그가 있는 행)만, 워터마크 없이(목업 <img src> 용, 예전 /mockref/api/samples/file 과 같은 공개 범위). */
    public static function sendFile(string $publicId, string $kind): never
    {
        if (!in_array($kind, ['original', 'thumb', 'web'], true) || !preg_match('/^[a-z0-9]{8,32}$/', $publicId)) {
            throw HttpError::notFound('파일');
        }
        $web = $kind === 'web';
        if ($web) { $kind = 'original'; }
        $f = Db::row(
            "SELECT f.bucket, f.path, f.mime FROM asset_items i
               LEFT JOIN asset_sets s ON s.id = i.set_id
               JOIN asset_files af ON af.item_id = i.id AND af.kind = ?
               JOIN core_files f ON f.id = af.file_id
              WHERE i.public_id = ? AND i.deleted_at IS NULL AND " . self::sampleWhere(),
            [$kind, $publicId]
        );
        if (!$f) {
            throw HttpError::notFound('파일');
        }
        $local = rtrim((string) Config::get('storage.dir'), '/\\') . '/' . $f['bucket'] . '/' . $f['path'];
        if (!is_file($local)) {
            throw HttpError::notFound('파일');
        }
        if ($web) {
            [$local, $f['mime']] = self::webCopy($local, (string) $f['mime'], $publicId);
        }
        header('Content-Type: ' . (string) $f['mime']);
        header('Content-Length: ' . (string) filesize($local));
        header('Cache-Control: public, max-age=604800');
        header('Access-Control-Allow-Origin: *');
        header('Cross-Origin-Resource-Policy: cross-origin');
        header('X-Content-Type-Options: nosniff');
        readfile($local);
        exit;
    }

    /**
     * 목업용 긴 변 1920 판 — storage/mockweb/<public_id>.<jpg|png> 에 한 번 만들어 둔다(원본이 바뀌면 다시). 못 만들면 원본.
     * @return array{0:string,1:string} [경로, mime]
     */
    private static function webCopy(string $src, string $mime, string $publicId): array
    {
        $alpha = in_array($mime, ['image/png', 'image/webp', 'image/gif'], true);
        $out = rtrim((string) Config::get('storage.dir'), '/\\') . '/mockweb/' . $publicId . ($alpha ? '.png' : '.jpg');
        $outMime = $alpha ? 'image/png' : 'image/jpeg';
        if (is_file($out) && filemtime($out) >= filemtime($src)) {
            return [$out, $outMime];
        }
        $im = @imagecreatefromstring((string) file_get_contents($src));
        if (!$im) {
            return [$src, $mime];
        }
        $w = imagesx($im);
        $h = imagesy($im);
        if (max($w, $h) <= 1920) {
            imagedestroy($im);
            return [$src, $mime];
        }
        $r = 1920 / max($w, $h);
        $dst = imagecreatetruecolor(max(1, (int) round($w * $r)), max(1, (int) round($h * $r)));
        imagealphablending($dst, false);
        imagesavealpha($dst, true);
        imagecopyresampled($dst, $im, 0, 0, 0, 0, imagesx($dst), imagesy($dst), $w, $h);
        imagedestroy($im);
        @mkdir(dirname($out), 0775, true);
        $tmp = $out . '.part' . getmypid();
        $ok = $alpha ? imagepng($dst, $tmp, 6) : imagejpeg($dst, $tmp, 84);
        imagedestroy($dst);
        if (!$ok || !@rename($tmp, $out)) {
            @unlink($tmp);
            return [$src, $mime];
        }
        return [$out, $outMime];
    }
}
