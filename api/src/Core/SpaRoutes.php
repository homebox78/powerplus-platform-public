<?php
declare(strict_types=1);

namespace Pp\Core;

/**
 * 화면 주소 판정·머리 주입·robots·sitemap — api/public/spa.php 가 쓴다(2026-10-17).
 * 예전엔 Apache 가 모르는 주소도 index.html 을 200 으로 줘서 검색엔진이 없는 주소를 색인했고(소프트 404),
 * 공유 미리보기·검색 결과 제목이 어느 화면이든 홈 제목이었다.
 *
 * ⚠ PATTERNS 는 apps/web/app/routes.ts 의 route()/index() 경로를 그대로 옮긴 것이다(글자 그대로 — preflight 가 대조한다).
 *   routes.ts 에 화면을 더하면 여기에도 한 줄. 빠지면 scripts/preflight.sh 가 배포를 막는다.
 * ⚠ HEAD 의 제목·설명은 화면 코드(routes/*.tsx 의 meta, lib/page-title.ts 의 titleForPath·descForPath·ogTitleForPath)와 같은 글이다.
 *   화면 문구를 바꾸면 여기도 같이(다르면 첫 화면과 공유 미리보기 제목이 어긋난다).
 */
final class SpaRoutes
{
    public const SITE = 'powerPlus';

    /** routes.ts 경로 — ':x' 는 한 조각, ':x?' 는 있어도 없어도. '*'(404) 는 넣지 않는다 */
    public const PATTERNS = [
        '',
        'assets/:sub?', 'deck/:sub?', 'mock/:sub?', 'guide/components/:id', 'guide/:sub?',
        'community/:id?', 'search', 'login', 'signup',
        'account', 'account/keys', 'account/posts', 'account/saved/:id?', 'account/plan', 'account/settings/:section?/:sub?',
        'admin/login', 'admin', 'admin/ai', 'admin/users', 'admin/point-rules', 'admin/billing', 'admin/mail', 'admin/contacts',
        'admin/removals', 'admin/assets', 'admin/requests', 'admin/search', 'admin/stats', 'admin/guide', 'admin/deck', 'admin/deck-settings/:sub?',
        'admin/mockups', 'admin/mock/checklist', 'admin/deck/checklist', 'admin/site/checklist', 'admin/qa', 'admin/qa/:module',
        'admin/community', 'admin/help', 'admin/changelog', 'admin/policies',
        'legal/:doc', 'about', 'notice', 'changelog', 'help', 'help/:cat', 'help/:cat/:article', 'contact', 'removal',
        'powermcp', 'docs/:page?', 'pricing', 'c/:token', 'r/:token',
    ];

    /**
     * 검색엔진에 알릴 공개 화면(sitemap) — 2026-10-16 회원 전용 전환 뒤 로그인 없이 내용이 보이는 화면만.
     * 모듈은 랜딩(소개)만 — 둘러보기·최신·기획·가이드 하위 화면·커뮤니티는 회원 전용 잠금이라 뺀다. 삭제요청·로그인은 색인할 화면이 아니다.
     */
    public const PUBLIC = [
        '/', '/assets', '/deck', '/mock', '/guide', '/powermcp', '/pricing', '/about', '/help', '/contact',
        '/docs', '/docs/clients', '/docs/tools', '/docs/api', '/docs/limits', '/docs/errors',
        '/legal/terms', '/legal/privacy', '/legal/copyright', '/legal/email', '/legal/bot',
    ];

    /** 모듈 랜딩 — lib/modules.ts MODULES 의 name·sub·desc */
    private const MODULES = [
        'assets' => ['powerAssets', '제안서 에셋 라이브러리', '아이콘·일러스트·사진·장표를 PowerPoint 에 바로 넣습니다. AI 로 만든 에셋은 따로 표시해 구분합니다.'],
        'deck' => ['powerDeck', '장표 변환', '자료만 올리면 기획부터 장표·대본까지 한 번에 만듭니다. 링크 하나로 팀이 함께 보고 의견을 달고 고칩니다.'],
        'mock' => ['powerMock', '홈페이지 목업 제작 · MCP', '관공서·대학·일반 홈페이지 어느 것이든 만듭니다. AI 도구에 연결해 기획부터 목업·코드까지 잇습니다.'],
        'guide' => ['powerGuide', 'SI 디자인 규칙 안내서', '토큰·부품·KRDS 대응표·접근성 점검표를 가져다 씁니다. 코드와 디자인을 같은 규칙으로 맞춥니다.'],
    ];

    /** routes/docs.tsx TITLES */
    private const DOCS = [
        'mcp' => 'MCP 연결 가이드', 'clients' => '클라이언트별 설정', 'tools' => '도구 목록', 'api' => 'API 문서', 'limits' => '호출 한도', 'errors' => '오류 코드',
        'terms' => '이용약관', 'copyright' => '저작권 정책', 'bot' => '수집 로봇 안내',
    ];

    /** lib/policy.ts POLICY_DOCS */
    private const LEGAL = ['terms' => '이용약관', 'privacy' => '개인정보처리방침', 'copyright' => '저작권 정책', 'email' => '이메일 무단수집 거부', 'bot' => '수집 로봇 안내'];

    /** "/a/b/" → "a/b" (쿼리 없이) */
    public static function normalize(string $uri): string
    {
        $p = (string) (parse_url($uri, PHP_URL_PATH) ?? '');
        return trim(rawurldecode($p), '/');
    }

    public static function known(string $path): bool
    {
        foreach (self::PATTERNS as $pat) {
            if (preg_match(self::regex($pat), $path)) {
                return true;
            }
        }
        return false;
    }

    /** 'help/:cat/:article' → ^help/[^/]+/[^/]+$ , 'docs/:page?' → ^docs(?:/[^/]+)?$ */
    public static function regex(string $pattern): string
    {
        if ($pattern === '') {
            return '#^$#';
        }
        $re = '';
        foreach (explode('/', $pattern) as $i => $seg) {
            $sep = $i === 0 ? '' : '/';
            if (str_starts_with($seg, ':')) {
                $re .= str_ends_with($seg, '?') ? '(?:' . $sep . '[^/]+)?' : $sep . '[^/]+';
            } else {
                $re .= $sep . preg_quote($seg, '#');
            }
        }
        return '#^' . $re . '$#u';
    }

    /**
     * 공개 화면의 [제목, 설명, 공유 제목]. 목록에 없는 화면은 null(빈 껍데기의 기본값을 그대로 둔다 — 화면이 열리며 고친다).
     * @return array{0:string,1:string,2:string}|null
     */
    public static function head(string $path): ?array
    {
        $seg = $path === '' ? [] : explode('/', $path);
        $pt = static fn (string $screen, ?string $module = null): string => ($module ? "{$screen} · {$module}" : $screen) . ' — ' . self::SITE;
        if (!$seg) {
            $t = self::SITE . ' — SI 실무자의 올인원';
            return [$t, '자료만 올리면 제안서 장표·홈페이지 목업·디자인 규칙·에셋까지 이어서 만드는 SI 작업대입니다.', $t];
        }
        $first = $seg[0];
        if (isset(self::MODULES[$first]) && count($seg) === 1) {
            [$name, $sub, $desc] = self::MODULES[$first];
            $t = $pt('시작하기', $name);
            return [$t, "{$name} — {$sub}. {$desc}", $t];
        }
        return match ($first) {
            'powermcp' => count($seg) === 1 ? [$pt('powerMCP'), 'AI 에 연결해 에셋·장표·목업·디자인 규칙을 한 번에 불러 씁니다.', $pt('powerMCP')] : null,
            'pricing' => count($seg) === 1 ? [$pt('요금제'), '회원 전용 서비스의 이용 범위와 Pro·Team 요금제 안내입니다.', $pt('요금제')] : null,
            'about' => count($seg) === 1 ? [$pt('powerPlus 소개'), 'powerPlus 가 하는 일과 4개 모듈, 운영 원칙을 소개합니다.', $pt('powerPlus 소개')] : null,
            // 분류·글(help/:cat…) 제목은 화면이 분류 이름으로 바꾼다 — 여기서는 첫 화면만
            'help' => count($seg) === 1 ? [$pt('도움말 센터'), '에셋·장표·목업·가이드·계정 사용법을 분류별로 찾는 도움말 센터입니다.', $pt('도움말 센터')] : null,
            'contact' => count($seg) === 1 ? [$pt('문의'), '서비스 이용·제휴·오류 문의를 남기면 운영팀이 메일로 답합니다.', $pt('문의')] : null,
            'login', 'signup' => count($seg) === 1
                ? [($first === 'signup' ? '회원가입' : '로그인') . ' — ' . self::SITE, '이메일 인증 또는 소셜 계정으로 powerPlus 에 로그인합니다.', $first === 'signup' ? $pt('회원가입') : self::SITE]
                : null,
            'docs' => count($seg) <= 2
                ? [(self::DOCS[$seg[1] ?? 'mcp'] ?? self::DOCS['mcp']) . ' — ' . self::SITE . ' 문서', 'powerMCP 연결·도구·REST API·정책 문서', $pt('문서')]
                : null,
            'legal' => count($seg) === 2
                ? [$pt(self::LEGAL[$seg[1]] ?? self::LEGAL['terms']), '이용약관·개인정보처리방침 등 powerPlus 정책 문서와 버전별 이력입니다.', $pt('약관·정책')]
                : null,
            default => null,
        };
    }

    /** index.html 껍데기에 화면별 머리를 넣는다. notFound 면 404 제목 + noindex */
    public static function render(string $html, string $path, bool $notFound, string $siteUrl): string
    {
        $esc = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        if ($notFound) {
            $html = (string) preg_replace('#<title>.*?</title>#su', '<title>' . $esc('페이지를 찾을 수 없음 — ' . self::SITE) . '</title><meta name="robots" content="noindex"/>', $html, 1);
            return $html;
        }
        $h = self::head($path);
        if ($h === null) {
            return $html;
        }
        [$title, $desc, $og] = $h;
        $url = rtrim($siteUrl, '/') . ($path === '' ? '/' : '/' . $path);
        // 바꿀 글에 $·역슬래시가 있어도 치환 기호로 읽히지 않게 콜백으로 넣는다
        $put = static function (string $re, string $value) use (&$html): void {
            $html = (string) preg_replace_callback($re, static fn (array $m): string => $m[1] . $value . $m[2], $html, 1);
        };
        $put('#(<title>).*?(</title>)#su', $esc($title));
        $put('#(<meta name="description" content=")[^"]*(")#u', $esc($desc));
        $put('#(<meta property="og:description" content=")[^"]*(")#u', $esc($desc));
        $put('#(<meta property="og:title" content=")[^"]*(")#u', $esc($og));
        $put('#(</title>)()#', '<meta property="og:url" content="' . $esc($url) . '"/>');
        return $html;
    }

    public static function robots(string $siteUrl): string
    {
        return "# powerPlus — 관리자·계정·API·공유 링크는 색인하지 않는다.\nUser-agent: *\nAllow: /\n"
            . "Disallow: /admin\nDisallow: /account\nDisallow: /api\nDisallow: /p/\nDisallow: /c/\nDisallow: /r/\nDisallow: /search\nDisallow: /login\nDisallow: /signup\n\n"
            . 'Sitemap: ' . rtrim($siteUrl, '/') . "/sitemap.xml\n";
    }

    public static function sitemap(string $siteUrl): string
    {
        $base = rtrim($siteUrl, '/');
        $out = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n";
        foreach (self::PUBLIC as $p) {
            $out .= '  <url><loc>' . htmlspecialchars($base . $p, ENT_XML1) . "</loc></url>\n";
        }
        return $out . "</urlset>\n";
    }
}
