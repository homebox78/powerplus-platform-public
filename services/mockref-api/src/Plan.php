<?php
declare(strict_types=1);

namespace Homebox;

use Homebox\Auth\Session;

/**
 * 플랜 게이트 (docs/02 §4 · taxonomy plans.limits). Mobbin 방식(사용자 지시 2026-09-24): Free 는 기관당 화면 N장까지, 나머지는 잠금(자물쇠)으로 보이되 열람 불가.
 *   - screens_per_site: -1 = 무제한. Free 5 → 기기(pc/mobile)별로 정렬 앞 5장(메인·로그인·검색…)만 허용.
 *   - design_data: 'summary' 면 타이포 스케일·역할별 색·간격은 숨기고 요약(폰트 패밀리·굵기)만.
 *   - 관리자 계정은 enterprise 로 취급.
 * 응답은 사용자별로 달라지므로 게이트가 걸린 엔드포인트는 Cache-Control private.
 */
final class Plan
{
    private static ?array $cache = null;

    /** @return array{id:string, limits:array<string,mixed>, admin:bool, logged_in:bool} */
    public static function current(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }
        $u = Session::user();
        if ($u === null) {
            // MCP 키(Authorization: Bearer hb_live_…)로도 플랜을 정한다 (2026-09-23). 전엔 MCP 데이터 호출이 전부 익명 Free 로 나가
            // Pro 키를 써도 타이포 스케일·간격·사업정보가 빠졌다. verify(한도)와 별개로 매 요청 키 소유자의 구독을 읽는다.
            $k = self::keyPlan();
            if ($k !== null) {
                return self::$cache = $k;
            }
            return self::$cache = ['id' => 'free', 'limits' => self::limits('free'), 'admin' => false, 'logged_in' => false];
        }
        if (($u['role'] ?? 'user') === 'admin') {
            return self::$cache = ['id' => 'enterprise', 'limits' => self::limits('enterprise'), 'admin' => true, 'logged_in' => true];
        }
        $sub = Db::row("SELECT plan_id FROM subscriptions WHERE owner_type = 'user' AND owner_id = ? AND status IN ('trial','active','past_due') ORDER BY id DESC LIMIT 1", [(int) $u['id']]);
        $pid = (string) ($sub['plan_id'] ?? 'free');
        return self::$cache = ['id' => $pid, 'limits' => self::limits($pid), 'admin' => false, 'logged_in' => true];
    }

    /**
     * 요청의 MCP 키로 플랜 해석. 키가 없거나 무효면 null (익명 Free 로 진행).
     * 헤더: Authorization: Bearer hb_live_… 또는 X-Homebox-Key (Apache mod_rewrite 가 Authorization 을 떨어뜨리는 환경 대비 — MISTAKES "Apache Authorization").
     * 만료·폐기 키는 무시. 한도·사용량 집계는 /api/internal/keys/verify 가 담당하므로 여기선 읽기만.
     * @return array{id:string, limits:array<string,mixed>, admin:bool, logged_in:bool, via_key:bool}|null
     */
    private static function keyPlan(): ?array
    {
        $key = (string) ($_SERVER['HTTP_X_HOMEBOX_KEY'] ?? '');
        if ($key === '') {
            $auth = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
            if ($auth === '' && function_exists('apache_request_headers')) {
                $h = apache_request_headers();
                $auth = (string) ($h['Authorization'] ?? $h['authorization'] ?? '');
            }
            if (preg_match('/^Bearer\s+(hb_live_\S+)$/i', trim($auth), $m) === 1) {
                $key = $m[1];
            }
        }
        if ($key === '' || !str_starts_with($key, 'hb_live_') || strlen($key) < 20) {
            return null;
        }
        $k = Db::row(
            "SELECT k.owner_type, k.owner_id, k.expires_at, k.revoked_at, u.role FROM api_keys k JOIN users u ON u.id = k.created_by WHERE k.key_hash = ?",
            [hash('sha256', $key)],
        );
        if ($k === null || $k['revoked_at'] !== null || ($k['expires_at'] !== null && strtotime((string) $k['expires_at']) < time())) {
            return null;
        }
        if (($k['role'] ?? '') === 'admin') {
            return ['id' => 'enterprise', 'limits' => self::limits('enterprise'), 'admin' => true, 'logged_in' => true, 'via_key' => true, 'staff' => true];
        }
        // powerMCP 중계: 플랫폼이 /keys/verify 에서 판정한 플랜을 X-Pp-Plan 으로 싣는다(staff·pro·team·admin = pro, 그 외 free).
        // 서비스 키가 유효할 때만 믿는다 — 여기 구독표는 서비스 키 소유자 것이라 사용자 플랜을 모른다(2026-10-09 시험: staff 가 Pro 402).
        $hint = strtolower(trim((string) ($_SERVER['HTTP_X_PP_PLAN'] ?? '')));
        if ($hint !== '') {
            if (in_array($hint, ['pro', 'team', 'staff', 'enterprise'], true)) {
                $pro = self::limits('pro');
                $pro['design_data'] = 'full';
                $pro['screens_per_site'] = -1;
                // staff(임직원)·enterprise 는 사내 전용 — 공공누리 2~4유형 원본도 연다(Plan::koglOpen)
                return ['id' => 'pro', 'limits' => $pro, 'admin' => false, 'logged_in' => true, 'via_key' => true, 'staff' => in_array($hint, ['staff', 'enterprise'], true)];
            }
            return ['id' => 'free', 'limits' => self::limits('free'), 'admin' => false, 'logged_in' => true, 'via_key' => true];
        }
        $sub = Db::row("SELECT plan_id FROM subscriptions WHERE owner_type = ? AND owner_id = ? AND status IN ('trial','active','past_due') ORDER BY id DESC LIMIT 1", [$k['owner_type'], (int) $k['owner_id']]);
        $pid = (string) ($sub['plan_id'] ?? 'free');
        return ['id' => $pid, 'limits' => self::limits($pid), 'admin' => false, 'logged_in' => true, 'via_key' => true];
    }

    /** @return array<string,mixed> */
    public static function limits(string $planId): array
    {
        $row = Db::row('SELECT limits FROM plans WHERE id = ?', [$planId]) ?? Db::row("SELECT limits FROM plans WHERE id = 'free'");
        $l = is_string($row['limits'] ?? null) ? (json_decode($row['limits'], true) ?: []) : (is_array($row['limits'] ?? null) ? $row['limits'] : []);
        return $l + ['screens_per_site' => 5, 'design_data' => 'summary'];
    }

    /** @var array<int,bool> 사이트별 "내가 평가했나" 캐시 (요청 단위) */
    private static array $rated = [];

    /**
     * 평가 혜택 (2026-09-23 사용자 지시 "평가를 유도하기 위한 혜택"): 로그인 사용자가 그 기관을 평가했으면
     * 무료 플랜이어도 그 기관의 화면 전부(잠긴 장수 0)를 연다. 디자인 데이터 등급(summary)·다른 기관은 그대로.
     * MCP 키 요청은 세션이 없어 해당 없음.
     */
    public static function ratedByMe(int $siteId): bool
    {
        if (array_key_exists($siteId, self::$rated)) {
            return self::$rated[$siteId];
        }
        $u = Session::user();
        if ($u === null) {
            return self::$rated[$siteId] = false;
        }
        return self::$rated[$siteId] = Db::row('SELECT 1 AS x FROM ratings WHERE site_id = ? AND user_id = ? LIMIT 1', [$siteId, (int) $u['id']]) !== null;
    }

    /** 열람 가능한 화면 id 목록. null = 전부(무제한). 기기별로 정렬 앞 N장 (screens.sort = PAGE_ORDER 메인 → 로그인·검색 → …). 평가한 기관은 전부(ratedByMe). */
    public static function allowedScreens(int $siteId, ?array $plan = null): ?array
    {
        $plan ??= self::current();
        $n = (int) ($plan['limits']['screens_per_site'] ?? 5);
        if ($n < 0 || self::ratedByMe($siteId)) {
            return null;
        }
        $rows = Db::rows(
            "SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY device ORDER BY sort, id) AS rn FROM screens WHERE site_id = ? AND status = 'published') t WHERE rn <= ?",
            [$siteId, $n],
        );
        return array_map('intval', array_column($rows, 'id'));
    }

    /**
     * 여러 기관을 한 번에 (2026-09-26 탐색 속도: 컴포넌트 예시가 기관 200곳이면 쿼리 200번이었다).
     * @param int[] $siteIds @return array<int, int[]|null>  기관별 allowedScreens 와 같은 값
     */
    public static function allowedScreensMany(array $siteIds): array
    {
        $siteIds = array_values(array_unique(array_map('intval', $siteIds)));
        $out = [];
        if ($siteIds === []) {
            return $out;
        }
        $n = (int) (self::current()['limits']['screens_per_site'] ?? 5);
        if ($n < 0) {
            return array_fill_keys($siteIds, null);
        }
        $in = implode(',', array_fill(0, count($siteIds), '?'));
        $u = Session::user();
        $rated = [];
        if ($u !== null) {
            foreach (Db::rows("SELECT DISTINCT site_id FROM ratings WHERE user_id = ? AND site_id IN ($in)", [(int) $u['id'], ...$siteIds]) as $r) {
                $rated[(int) $r['site_id']] = true;
            }
        }
        foreach ($siteIds as $id) {
            self::$rated[$id] = isset($rated[$id]);
            $out[$id] = isset($rated[$id]) ? null : [];
        }
        $rows = Db::rows("SELECT site_id, id FROM (SELECT site_id, id, ROW_NUMBER() OVER (PARTITION BY site_id, device ORDER BY sort, id) AS rn
                          FROM screens WHERE site_id IN ($in) AND status = 'published') t WHERE rn <= ?", [...$siteIds, $n]);
        foreach ($rows as $r) {
            $sid = (int) $r['site_id'];
            if ($out[$sid] !== null) {
                $out[$sid][] = (int) $r['id'];
            }
        }
        return $out;
    }

    public static function canSee(?array $allowed, int $screenId): bool
    {
        return $allowed === null || in_array($screenId, $allowed, true);
    }

    // ───── 공공누리(KOGL) 원본 제한 (LEGAL-006, 2026-10-12) ─────
    // sites.kogl_type = 화면 OCR 에서 읽은 공공누리 유형(홈박스 db/scripts/kogl-type.mjs): NULL 미표시 · 1 출처표시 · 2 상업금지 · 3 변경금지 · 4 상업금지+변경금지.
    // 2~4유형(변경·상업 이용 제한) 기관은 외부 사용자에게 원본 캡처·크롭 원본(public/card/crop/capture)을 주지 않고 썸네일+출처만 — 저작권법 24조의2 공공저작물 자유이용은
    // 1유형만 상업·변경이 자유. 임직원(staff)·관리자는 사내 참고라 그대로. 잠금(402)이 아니라 "원본 없음"이므로 locked 와 별개 필드(kogl)로 알린다.

    /** @var array<int, int|null> 사이트별 공공누리 유형 캐시(요청 단위, false = 조회 전) */
    private static array $kogl = [];

    public static function koglType(int $siteId): ?int
    {
        if (!array_key_exists($siteId, self::$kogl)) {
            $r = Db::row('SELECT kogl_type FROM sites WHERE id = ?', [$siteId]);
            self::$kogl[$siteId] = ($r === null || $r['kogl_type'] === null) ? null : (int) $r['kogl_type'];
        }
        return self::$kogl[$siteId];
    }


    /** 이 요청이 그 기관의 원본(캡처·크롭 원본)을 받아도 되는가. staff·admin 은 항상, 그 외는 공공누리 미표시·1유형만. */
    public static function koglOpen(int $siteId, ?array $plan = null): bool
    {
        $plan ??= self::current();
        if (!empty($plan['admin']) || !empty($plan['staff'])) {
            return true;
        }
        $t = self::koglType($siteId);
        return $t === null || $t <= 1;
    }

    /** 원본 자산 서명 URL — 공공누리로 막히면 null. 발급 지점은 전부 이걸 지난다(썸네일은 Signer::url 그대로). */
    public static function kurl(int $siteId, int|string|null $assetId, ?array $plan = null, ?int $ttl = null): ?string
    {
        $aid = (int) $assetId;
        if ($aid <= 0 || !self::koglOpen($siteId, $plan)) {
            return null;
        }
        return Signer::url($aid, $ttl);
    }

    /** 응답에 싣는 공공누리 안내 — 제한 중일 때만 배열, 아니면 null */
    public static function koglInfo(int $siteId, ?array $plan = null): ?array
    {
        $t = self::koglType($siteId);
        if ($t === null || $t <= 1) {
            return null;
        }
        $labels = [2 => '제2유형 · 출처표시 + 상업적 이용금지', 3 => '제3유형 · 출처표시 + 변경금지', 4 => '제4유형 · 출처표시 + 상업적 이용금지 + 변경금지'];
        return [
            'type' => $t,
            'label' => $labels[$t] ?? ('제' . $t . '유형'),
            'open' => self::koglOpen($siteId, $plan),
            'note' => self::koglOpen($siteId, $plan)
                ? '이 기관은 공공누리 ' . $t . '유형(상업 이용·변경 제한)입니다. 사내 참고로만 쓰고 외부 산출물에 원본을 넣지 않습니다.'
                : '이 기관은 공공누리 ' . $t . '유형(상업 이용·변경 제한)이라 원본 캡처는 제공하지 않습니다. 썸네일·구성 데이터와 출처만 참고하세요.',
        ];
    }

    /**
     * 원본 이미지를 공공누리로 뺐을 때 그 이유 한 줄 — 열려 있으면 null (O-04, 2026-10-15).
     * 이미지 URL 이 null 인 이유가 잠금(플랜)인지 공공누리인지 응답만 보고 알 수 있게 항목마다 image_withheld 로 싣는다(MC-25 빈 결과 이유).
     */
    public static function koglWithheld(int $siteId, ?array $plan = null): ?string
    {
        if (self::koglOpen($siteId, $plan)) {
            return null;
        }
        return '공공누리 ' . (int) self::koglType($siteId) . '유형(상업 이용·변경 제한) 기관이라 원본 이미지는 제공하지 않습니다. 좌표·구성 데이터와 출처만 참고하세요.';
    }

    /** 프론트가 배너·자물쇠를 그릴 때 쓰는 요약 */
    public static function info(array $plan, ?array $allowed, int $totalScreens, ?int $siteId = null): array
    {
        $limit = (int) ($plan['limits']['screens_per_site'] ?? 5);
        return [
            // 평가 혜택 표시용: rating_benefit = 이 플랜은 평가로 화면이 열리는 플랜(제한 플랜) / rating_unlock = 지금 그 혜택으로 열려 있음
            'rating_benefit' => $limit >= 0,
            'rating_unlock' => $limit >= 0 && $siteId !== null && self::ratedByMe($siteId),
            'plan' => $plan['id'],
            'logged_in' => $plan['logged_in'],
            'screens_limit' => $limit,
            'locked_screens' => $allowed === null ? 0 : max(0, $totalScreens - count($allowed)),
            'design_data' => (string) ($plan['limits']['design_data'] ?? 'summary'),
            'download' => (bool) ($plan['limits']['download'] ?? false),
        ];
    }
}
