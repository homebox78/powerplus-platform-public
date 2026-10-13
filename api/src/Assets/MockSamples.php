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
    ];

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
            "SELECT i.id, i.public_id, i.legacy_key, i.legacy_alt_key, i.alt, i.w, i.h, i.has_text, i.text_safe,
                    (SELECT t.tag FROM asset_tags t WHERE t.item_id = i.id AND t.axis = 'kind' LIMIT 1) AS kind
               FROM asset_items i
              WHERE i.deleted_at IS NULL AND EXISTS (SELECT 1 FROM asset_tags t WHERE t.item_id = i.id AND t.axis = 'kind')
              ORDER BY i.id"
        );
        if ($items === []) {
            return [];
        }
        $tags = [];
        foreach (Db::rows("SELECT item_id, tag, axis FROM asset_tags WHERE axis IN ('kw','use','target') AND item_id IN (SELECT item_id FROM asset_tags WHERE axis = 'kind') ORDER BY item_id, axis, tag") as $t) {
            $tags[(int) $t['item_id']][$t['axis']][] = (string) $t['tag'];
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
            $all = array_values(array_merge($tg['kw'] ?? [], array_map(static fn ($x) => '대상:' . $x, $tg['target'] ?? [])));
            $safe = is_string($r['text_safe']) ? json_decode($r['text_safe'], true) : null;
            $out[] = [
                'id' => $hb ?? ('pa-' . $r['public_id']),
                'kind' => $kind,
                'kind_label' => self::KIND_LABEL[$kind] ?? $kind,
                'use_for' => $tg['use'] ?? [],
                'file' => $base . $r['public_id'] . '/original',
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
        if (!in_array($kind, ['original', 'thumb'], true) || !preg_match('/^[a-z0-9]{8,32}$/', $publicId)) {
            throw HttpError::notFound('파일');
        }
        $f = Db::row(
            "SELECT f.bucket, f.path, f.mime FROM asset_items i
               JOIN asset_files af ON af.item_id = i.id AND af.kind = ?
               JOIN core_files f ON f.id = af.file_id
              WHERE i.public_id = ? AND i.deleted_at IS NULL
                AND EXISTS (SELECT 1 FROM asset_tags t WHERE t.item_id = i.id AND t.axis = 'kind')",
            [$kind, $publicId]
        );
        if (!$f) {
            throw HttpError::notFound('파일');
        }
        $local = rtrim((string) Config::get('storage.dir'), '/\\') . '/' . $f['bucket'] . '/' . $f['path'];
        if (!is_file($local)) {
            throw HttpError::notFound('파일');
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
}
