<?php
declare(strict_types=1);

namespace Pp\Deck;

use Pp\Core\Access;
use Pp\Core\Actor;
use Pp\Core\Config;
use Pp\Core\Db;

/*
 * 출처: powerDeck api/src/Logos.php (D:\powerDeck, 2026-10-06 이식). JSON 모양({data:[{id,name,thumb,img}], total}·분류 6종)은 그대로 두고,
 * 원천을 옛 운영 powerPlus 공개 API 중계 → 플랫폼 powerAssets(asset_items category=logo, 같은 프로세스)로 바꿨다(사용자 2026-10-06 "로고 검색: 파워플러스 참조").
 * 모든 조회가 Access 를 지난다. 로고는 공개(public) 등급이라 로그인 없이도 보인다.
 */

/**
 * 로고 찾기 — powerDeck 업로드·설정에서 발주처·자사 로고를 고를 때.
 *   GET /deck/logos?q=&topic=                    → {data:[{id,name,thumb,img}], total}  (thumb·img = "<public_id>/<kind>.<ext>")
 *   GET /deck/logos/topics                       → {data:[{id,label,count}]}
 *   GET /deck/logos/file?p=<pid>/<kind>.<ext>    → 그림 바이트(같은 출처 — 브라우저가 blob 으로 받아 File 로 쓴다)
 */
final class Logos
{
    /** 쓰지 않는 로고 — 솔리데오 컨소시엄은 'solideo S + 솔리데오 컨소시엄'(가로, 심볼 왼쪽) logo_524·523(흰색)만 쓴다 */
    private const HIDE = ['pp:logo_525', 'pp:logo_526', 'pp:logo_527', 'pp:logo_528', 'pp:logo_529'];

    /** 분류 — 공공 6개는 옛 powerPlus 주제 이름, biz-* 는 semologo 국내 기업 카테고리를 묶은 것(2026-10-18).
     *  화면(LogoSearch.tsx·powerAssets 로고 분류)은 이 목록을 /deck/logos/topics·/assets/logo-topics 로 받는다.
     *  저장 = asset_items.style_group 'logo-<분류>'. 기업은 이름으로 못 가르니 등록 때(db/migrate-legacy/register-logos.mjs) 정하고, 비어 있는 것은 ensureTopics 가 이름으로 채운다. */
    public const TOPICS = [
        'gov' => '중앙부처', 'local' => '지자체', 'agency' => '공단·공사·재단', 'promo' => '진흥원·연구원', 'edu' => '교육',
        'biz-food' => '식품·음료', 'biz-it' => 'IT·게임·통신', 'biz-media' => '미디어·엔터', 'biz-health' => '의료·바이오', 'biz-finance' => '금융·결제',
        'biz-maker' => '제조·중공업', 'biz-energy' => '에너지·화학', 'biz-retail' => '유통·패션', 'biz-mobility' => '교통·물류·여행', 'biz-build' => '건설·부동산',
        'biz-sports' => '스포츠', 'biz-etc' => '기타 기업·브랜드', 'own' => '자사',
    ];

    /** 이름 끝말로 분류(판정 순서 = 자사 → 교육 → 진흥·연구 → 공단·공사·재단 → 지자체 → 중앙부처) */
    private static function topicOf(string $name): string
    {
        $n = preg_replace('/\s+/u', '', $name) ?? $name;
        return match (true) {
            (bool) preg_match('/솔리데오|solideo/iu', $n) => 'own',
            (bool) preg_match('/교육청|교육원|대학교?$|학교$|교육학술|교육과정/u', $n) => 'edu',
            (bool) preg_match('/진흥원|연구원|기술원|연구소|정보원|평가원|개발원/u', $n) => 'promo',
            (bool) preg_match('/공단|공사|재단|관리원|센터|협회|은행|공원$/u', $n) => 'agency',
            (bool) preg_match('/(특별시|광역시|특별자치시|특별자치도|도|시|군|구)$/u', $n) => 'local',
            (bool) preg_match('/(부|처|청|위원회|원)$/u', $n) => 'gov',
            default => 'agency',
        };
    }

    private static function ext(?string $mime): string
    {
        return match ($mime) { 'image/jpeg' => 'jpg', 'image/webp' => 'webp', 'image/svg+xml' => 'svg', default => 'png' };
    }

    /** 분류가 안 붙은 로고(관리자 새 등록·옛 공공기관 로고)에 이름으로 분류를 붙인다. 할 일이 없으면 색인 한 번 읽고 끝 */
    public static function ensureTopics(): void
    {
        $rows = Db::rows("SELECT id, name FROM asset_items WHERE category = 'logo' AND (style_group IS NULL OR style_group NOT LIKE 'logo-%')");
        foreach ($rows as $r) {
            Db::exec('UPDATE asset_items SET style_group = ? WHERE id = ?', ['logo-' . self::topicOf((string) $r['name']), $r['id']]);
        }
    }

    /** style_group 'logo-<분류>' → 분류 id(모르는 값이면 이름으로) */
    private static function topicFrom(?string $group, string $name): string
    {
        $t = $group !== null && str_starts_with($group, 'logo-') ? substr($group, 5) : '';
        return isset(self::TOPICS[$t]) ? $t : self::topicOf($name);
    }

    /** 보이는 로고 전체(이름·태그·파일) — 2026-10-18 semologo 국내 로고로 약 6천 개, 아직 요청마다 한 번 읽는다(느려지면 캐시) */
    private static function all(Actor $a): array
    {
        self::ensureTopics();
        [$vis, $vp] = Access::whereVisible($a, 'i');
        $hide = implode(',', array_fill(0, count(self::HIDE), '?'));
        $rows = Db::rows(
            "SELECT i.public_id, i.name, i.style_group,
                    (SELECT GROUP_CONCAT(t.tag SEPARATOR ' ') FROM asset_tags t WHERE t.item_id = i.id AND t.lang = 'ko') AS tags,
                    (SELECT f.mime FROM asset_files af JOIN core_files f ON f.id = af.file_id WHERE af.item_id = i.id AND af.kind = 'original') AS mime_o,
                    (SELECT f.mime FROM asset_files af JOIN core_files f ON f.id = af.file_id WHERE af.item_id = i.id AND af.kind = 'thumb') AS mime_t
             FROM asset_items i
             WHERE i.category = 'logo' AND i.deleted_at IS NULL AND (i.legacy_key IS NULL OR i.legacy_key NOT IN ({$hide})) AND {$vis}
             ORDER BY i.name",
            array_merge(self::HIDE, $vp),
        );
        return array_map(static function (array $r): array {
            $img = $r['mime_o'] ? "{$r['public_id']}/original." . self::ext($r['mime_o']) : '';
            return [
                'id' => $r['public_id'],
                'name' => (string) $r['name'],
                'thumb' => $r['mime_t'] ? "{$r['public_id']}/thumb." . self::ext($r['mime_t']) : $img,
                'img' => $img,
                'tags' => (string) $r['tags'],
                'topic' => self::topicFrom($r['style_group'], (string) $r['name']),
            ];
        }, $rows);
    }

    private static function out(array $r): array
    {
        return ['id' => $r['id'], 'name' => $r['name'], 'thumb' => $r['thumb'], 'img' => $r['img']];
    }

    public static function search(Actor $a, array $q): array
    {
        $kw = trim(mb_substr((string) ($q['q'] ?? ''), 0, 60));
        $topic = array_key_exists((string) ($q['topic'] ?? ''), self::TOPICS) ? (string) $q['topic'] : '';
        $rows = self::all($a);
        if ($topic !== '') {
            $rows = array_values(array_filter($rows, static fn($r) => $r['topic'] === $topic));
        }
        if ($kw === '') {
            return ['data' => array_map(self::out(...), array_slice($rows, 0, 200)), 'total' => count($rows)];
        }
        // 이름·태그에 낱말이 전부 들어 있는 것(검색 오타 교정이 '식약'을 '신약'으로 바꾸므로 이름 찾기는 여기서 — 옛 동작 그대로)
        $words = array_values(array_filter(preg_split('/\s+/u', mb_strtolower($kw)) ?: [], static fn($w) => $w !== ''));
        $hits = [];
        foreach ($rows as $r) {
            $hay = mb_strtolower($r['name'] . ' ' . $r['tags']);
            foreach ($words as $w) {
                if (mb_strpos($hay, $w) === false) {
                    continue 2;
                }
            }
            $score = (mb_strpos(mb_strtolower($r['name']), $words[0] ?? '') === 0 ? 0 : 1) * 100 + mb_strlen($r['name']);   // 이름이 검색어로 시작하면 위로, 짧은 이름 먼저
            $hits[] = [$score, $r];
        }
        usort($hits, static fn($x, $y) => $x[0] <=> $y[0]);
        return ['data' => array_map(static fn($h) => self::out($h[1]), array_slice($hits, 0, 120)), 'total' => count($hits)];
    }

    public static function topics(Actor $a): array
    {
        $count = [];
        foreach (self::all($a) as $r) {
            $count[$r['topic']] = ($count[$r['topic']] ?? 0) + 1;
        }
        $out = [];
        foreach (self::TOPICS as $id => $label) {
            $out[] = ['id' => $id, 'label' => $label, 'count' => $count[$id] ?? 0];
        }
        return ['data' => $out];
    }

    /**
     * 그림 — "<public_id>/<thumb|original>.<ext>" 만 받는다. 권한 확인 뒤 로컬 storage, 없으면 옛 서버 파일을 서버가 받아 같은 출처로 내준다
     * (화면이 fetch → blob 으로 File 을 만드는데, 다른 출처 302 는 CORS 에 막힌다).
     */
    public static function file(Actor $a, string $p): void
    {
        // "legacy/<옛 파워플러스 에셋 번호>/<thumb|original>" — 화면에 박힌 솔리데오 로고 칩(logo_524 등)용. legacy_key 로 찾는다
        if (preg_match('#^legacy/([a-z]+_\d+)/(thumb|original)$#', $p, $m)) {
            $item = Db::row("SELECT id, visibility, owner_user_id, org_id FROM asset_items WHERE legacy_key IN (?, ?) AND category = 'logo' AND deleted_at IS NULL", [$m[1], 'pp:' . $m[1]]);   // 이관 때 'pp:' 접두가 붙었다
        } elseif (preg_match('#^([a-z0-9]{16})/(thumb|original)\.(png|jpg|webp|svg)$#', $p, $m)) {
            $item = Db::row("SELECT id, visibility, owner_user_id, org_id FROM asset_items WHERE public_id = ? AND category = 'logo' AND deleted_at IS NULL", [$m[1]]);
        } else {
            Legacy::fail('잘못된 로고 경로', 400);
        }
        if (!$item || !Access::can($a, $item)) {
            Legacy::fail('로고를 찾을 수 없습니다', 404);
        }
        $f = Db::row('SELECT f.bucket, f.path, f.mime FROM asset_files af JOIN core_files f ON f.id = af.file_id WHERE af.item_id = ? AND af.kind = ?', [$item['id'], $m[2]]);
        if (!$f) {
            Legacy::fail('로고 그림이 없습니다', 404);
        }
        $local = rtrim((string) Config::get('storage.dir'), '/\\') . '/' . $f['bucket'] . '/' . $f['path'];
        // 2026-10-07: 옛 서버(/powerPlus)는 내렸다 — 파일은 전부 플랫폼 storage 에 있다
        if (!is_file($local)) {
            Legacy::fail('로고 그림이 없습니다', 404);
        }
        // 원본을 받는 것 = 로고 찾기에서 고른 것 — powerAssets '자주 사용하는 로고'(Service::frequentLogos)의 근거
        if ($m[2] === 'original' && $a->id() !== null) {
            try {
                Db::exec("INSERT INTO asset_uses (item_id, user_id, channel) VALUES (?, ?, 'deck')", [$item['id'], $a->id()]);
            } catch (\Throwable) {
            }
        }
        $img = (string) file_get_contents($local);
        header('Content-Type: ' . $f['mime']);
        header('Cache-Control: ' . ($item['visibility'] === 'public' ? 'public' : 'private') . ', max-age=86400');
        echo $img;
        exit;
    }
}
