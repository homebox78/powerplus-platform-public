<?php
declare(strict_types=1);

namespace Homebox;

/**
 * 수집한 글꼴 이름 → 목업에서 실제로 보이게 하는 웹폰트 (2026-09-25)
 *
 * 수집값은 표기가 제각각이다(S-CoreDream·SCDream·SCoreDream, NotoKr·Noto Sans Korean…). 표준 이름 하나로 모으고,
 * 그 글꼴을 불러오는 CSS(외부 스타일시트 링크 또는 @font-face)를 돌려준다. 글꼴을 불러오지 않으면 이름만 적혀 있고
 * 화면은 기본 글꼴로 보여 레퍼런스와 인상이 달라진다(메인 목업 테스트에서 확인).
 * 주소는 전부 200 확인(jsDelivr·Google Fonts·spoqa.github.io).
 */
final class WebFont
{
    private const NOONNU = 'https://cdn.jsdelivr.net/gh/projectnoonnu/';

    /** 표준 이름 → [불러오기 방식, 값] */
    private const MAP = [
        'Pretendard' => ['link', 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css'],
        'Pretendard GOV' => ['link', 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-gov.min.css'],
        'Noto Sans KR' => ['link', 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap'],
        'Nanum Gothic' => ['link', 'https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700;800&display=swap'],
        'SUITE' => ['link', 'https://cdn.jsdelivr.net/gh/sunn-us/SUITE/fonts/static/woff2/SUITE.css'],
        'Spoqa Han Sans Neo' => ['link', 'https://spoqa.github.io/spoqa-han-sans/css/SpoqaHanSansNeo.css'],
        'S-Core Dream' => ['face', [400 => 'noonfonts_six@1.2/S-CoreDream-4Regular.woff', 500 => 'noonfonts_six@1.2/S-CoreDream-5Medium.woff', 700 => 'noonfonts_six@1.2/S-CoreDream-6Bold.woff', 800 => 'noonfonts_six@1.2/S-CoreDream-8Heavy.woff']],
        'GmarketSans' => ['face', [500 => 'noonfonts_2001@1.1/GmarketSansMedium.woff', 700 => 'noonfonts_2001@1.1/GmarketSansBold.woff']],
        'Paperlogy' => ['face', [400 => '2408-3@1.0/Paperlogy-4Regular.woff2', 700 => '2408-3@1.0/Paperlogy-7Bold.woff2']],
        'SB Aggro' => ['face', [500 => 'noonfonts_2108@1.1/SBAggroM.woff', 700 => 'noonfonts_2108@1.1/SBAggroB.woff']],
    ];

    /** 수집 표기 → 표준 이름 (모르는 글꼴은 null — 그 경우 Pretendard 로 보인다) */
    public static function canonical(?string $family): ?string
    {
        $f = strtolower(preg_replace('/[\s_\-\'"]+/', '', (string) $family) ?? '');
        return match (true) {
            $f === '' => null,
            str_contains($f, 'pretendardgov') => 'Pretendard GOV',
            str_contains($f, 'pretendard') => 'Pretendard',
            str_contains($f, 'scoredream') || str_contains($f, 'scdream') => 'S-Core Dream',
            str_contains($f, 'gmarket') => 'GmarketSans',
            str_contains($f, 'notosanskr') || str_contains($f, 'notokr') || str_contains($f, 'notosanskorean') || $f === 'notosans' => 'Noto Sans KR',
            str_contains($f, 'nanumgothic') || $f === 'nanums' || $f === 'gothic' => 'Nanum Gothic',
            str_contains($f, 'suite') => 'SUITE',
            str_contains($f, 'spoqa') => 'Spoqa Han Sans Neo',
            str_contains($f, 'paperlogy') => 'Paperlogy',
            str_contains($f, 'sbaggro') || str_contains($f, 'aggro') => 'SB Aggro',
            default => null,
        };
    }

    /** 문서 <head> 에 넣을 조각 (link 태그 또는 <style>@font-face) */
    public static function head(array $families): string
    {
        $out = [];
        foreach (array_unique(array_filter($families)) as $fam) {
            [$how, $v] = self::MAP[$fam] ?? [null, null];
            if ($how === 'link') { $out[] = '<link rel="stylesheet" href="' . htmlspecialchars($v, ENT_QUOTES, 'UTF-8') . '">'; }
            if ($how === 'face') {
                $css = '';
                foreach ($v as $w => $file) {
                    $fmt = str_ends_with($file, '.woff2') ? 'woff2' : 'woff';
                    $css .= "@font-face{font-family:'{$fam}';src:url('" . self::NOONNU . $file . "') format('{$fmt}');font-weight:{$w};font-display:swap}";
                }
                $out[] = '<style>' . $css . '</style>';
            }
        }
        return implode("\n", $out);
    }

    /** CSS font-family 값 */
    public static function stack(?string $fam): string
    {
        return ($fam ? "'" . $fam . "'," : '') . "'Pretendard GOV','Pretendard',system-ui,sans-serif";
    }
}
