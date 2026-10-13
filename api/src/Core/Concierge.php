<?php
declare(strict_types=1);

namespace Pp\Core;

use Pp\Assets\Service as Assets;
use Pp\Guide\Data as Guide;

/**
 * powerLLM — 메인 채팅과 우측 챗봇이 같이 쓰는 하나의 AI(2026-10-08 사용자 "일도 시키고 궁금한 것도 묻고").
 *  1) 말이 무엇인지 고른다(Jev, 실패하면 낱말 규칙): 제안서 만들기 · 에셋 찾기 · 홈페이지 목업 · 디자인 규칙·부품 · 질문 · 범위 밖
 *  2) 모듈 일을 실제로 한다: 에셋 검색(썸네일)·가이드 부품 찾기·공유된 시안 예시·도움말 문서 고르기
 *  3) LLM(Llm::chat)이 그 결과만 근거로 답 글을 쓴다 — 없는 기능·주소를 지어내지 않게, 링크는 우리가 붙인다.
 *     LLM 이 안 되면 도움말 원문 카드(Assist::answer)로 떨어진다.
 * 제안서 만들기는 여기서 하지 않고 'deck' 을 돌려준다 — 채팅 라우트가 powerDeck 작업을 만든다.
 */
final class Concierge
{
    public const MODULES = [
        'deck'   => '제안서·발표 장표·PT·RFP 기획서를 실제로 만들어 달라는 요청(주제·사업·자료를 적었다)',
        'assets' => '아이콘·사진·일러스트·다이어그램·로고·장표 같은 디자인 자산을 찾아 달라는 요청',
        'mock'   => '홈페이지·웹사이트 화면 목업·시안·와이어프레임을 만들거나 보고 싶다는 요청',
        'guide'  => '디자인 토큰·색·글꼴·KRDS·접근성·React/Vue 부품 코드를 묻거나 달라는 요청',
        'help'   => '사용법·요금·계정·설치·powerMCP 연결·이 서비스가 무엇인지 같은 질문',
        'out'    => 'powerPlus 와 무관한 잡담·일반 지식·번역·일반 코딩',
    ];

    private const STOP = '/(좀|조금|찾아\s?줘|찾아\s?주세요|찾아|보여\s?줘|보여\s?주세요|보여|주세요|해\s?줘|해주세요|알려\s?줘|있어\??|있나요\??|있나\??|필요해|필요한데|필요합니다|원해|에셋|자산|이미지|그림|넣을|쓸|만한|관련|어울리는|같은|추천)/u';

    /** 말 → 모듈 */
    public static function route(string $text): string
    {
        $c = null;
        try {
            $c = Jev::choose('chat_intent', Triage::scrub($text, 1500), '사용자가 powerPlus 채팅에 보낸 말이 어떤 요청인지 고른다. 묻는 말(가능한지·어떻게)이면 help 다.', self::MODULES, 0.55);
        } catch (\Throwable) {
        }
        $ask = (bool) preg_match('/[?？]\s*$|가능|할 수 있|되나|돼요|될까|어떻게|뭐야|무엇|궁금|얼마|요금|가격|차이/u', $text);
        $make = (bool) preg_match('/만들어|작성해|써\s?줘|짜\s?줘|진행해|시작해|부탁/u', $text);
        if ($c === 'deck' && $ask && !$make) {
            $c = 'help';   // "제안서도 되나요?" 가 작업이 되지 않게
        }
        if ($c !== null) {
            return $c;
        }
        if (preg_match('/아이콘|사진|일러스트|이미지|로고|다이어그램|에셋|그림/u', $text) && !$ask) return 'assets';
        if (preg_match('/토큰|컴포넌트|부품|krds|접근성|react|vue|리액트|색상표|팔레트|글꼴|폰트/iu', $text)) return $ask ? 'help' : 'guide';
        if (preg_match('/목업|시안|홈페이지|웹사이트|와이어/u', $text) && !$ask) return 'mock';
        if (preg_match('/제안|장표|발표|피티|ppt|rfp|기획서|대본|슬라이드/iu', $text) && $make) return 'deck';
        return 'help';
    }

    /**
     * 답 카드 — {kind:'reply', module, title, body, items, item_type, links, prompt?}
     * @param array $history 앞 대화 [{role:'user'|'assistant', content}] (최근 몇 개)
     */
    public static function reply(Actor $a, string $text, string $module, array $history = []): array
    {
        $ctx = [];
        $items = [];
        $type = null;
        $links = [];
        $prompt = null;
        $q = self::query($text);

        if ($module === 'assets') {
            $res = Assets::list($a, ['q' => $q !== '' ? $q : $text, 'addin' => true, 'sort' => 'newest'], 8, 0);
            $type = 'asset';
            foreach ($res['rows'] as $x) {
                $title = $x['name'] ?: ($x['alt'] ?: $x['category_ko']);
                $items[] = ['id' => $x['id'], 'title' => $title, 'sub' => $x['category_ko'], 'thumb_url' => $x['thumb_url'],
                    'url' => '/assets/browse?q=' . rawurlencode($q) . '&item=' . $x['id']];
            }
            $ctx[] = '에셋 검색 "' . $q . '" 결과 ' . $res['total'] . '건. 앞쪽 8개: ' . implode(', ', array_map(static fn ($i) => $i['title'] . '(' . $i['sub'] . ')', $items));
            $links = [['/assets/browse?q=' . rawurlencode($q), '검색 결과 전체 보기 (' . number_format($res['total']) . ')'], ['/assets', 'PowerPoint 애드인 받기']];
        } elseif ($module === 'guide') {
            $type = 'guide';
            $words = array_values(array_filter(preg_split('/\s+/u', mb_strtolower($q)) ?: [], static fn ($w) => mb_strlen($w) >= 2));
            $scored = [];
            foreach (Guide::registry()['metas'] ?? [] as $m) {
                $hay = mb_strtolower($m['id'] . ' ' . $m['title'] . ' ' . ($m['note'] ?? ''));
                $s = 0;
                foreach ($words as $w) {
                    if (str_contains($hay, $w)) $s += 2;
                }
                if ($s > 0) $scored[] = [$s, $m];
            }
            usort($scored, static fn ($x, $y) => $y[0] <=> $x[0]);
            foreach (array_slice($scored, 0, 6) as [, $m]) {
                $items[] = ['id' => $m['id'], 'title' => $m['title'], 'sub' => $m['id'], 'url' => '/guide/components/' . $m['id']];
            }
            $ctx[] = 'powerGuide 는 KRDS 기반 부품 ' . count(Guide::registry()['metas'] ?? []) . '종(React·Vue)과 디자인 토큰(색·글꼴·간격)을 무료로 준다.';
            if ($items) $ctx[] = '질문과 맞는 부품: ' . implode(', ', array_map(static fn ($i) => $i['title'] . '(' . $i['id'] . ')', $items));
            $links = [['/guide/components', '부품 전체 보기'], ['/guide/tokens', '디자인 토큰 받기']];
        } elseif ($module === 'mock') {
            $type = 'mock';
            $rows = Db::rows("SELECT id, title, score, updated_at FROM mock_gallery WHERE status = 'shared' ORDER BY (likes * 3 + unlocks * 2 + views / 10) DESC, id DESC LIMIT 4");
            foreach ($rows as $g) {
                $items[] = ['id' => (string) $g['id'], 'title' => (string) $g['title'] ?: '공유된 시안', 'sub' => (int) $g['score'] . '점',
                    'thumb_url' => '/api/v1/mock/gallery/' . $g['id'] . '/thumb?v=' . strtotime((string) $g['updated_at']), 'url' => '/mock/mockups?gallery=' . $g['id']];
            }
            $prompt = "powerMCP 로 다음 홈페이지 시안을 만들어 줘: " . mb_substr($text, 0, 300)
                . "\n1) mock_get_replica_kit 으로 재료를 받고 2) 그 재료대로 HTML 을 만든 뒤 3) mock_check_mockup 으로 판정해 85점 넘을 때까지 고치고 4) mock_publish_mockup 으로 게시해 주소를 알려 줘.";
            $ctx[] = 'powerMock 은 사용자가 쓰는 AI(Claude·Cursor·ChatGPT)에 powerMCP 를 연결해 목업을 만든다. 사이트에서는 만든 시안을 판정·게시·갤러리로 공유한다. 이 채팅은 요청문을 만들어 주고, 사용자는 그 요청문을 자기 AI 에 붙여 넣는다.';
            $links = [['/powermcp', 'powerMCP 연결 방법'], ['/account/keys', 'MCP 키 받기'], ['/mock/mockups?tab=gallery', '시안 갤러리']];
        } elseif ($module === 'out') {
            $ctx[] = '이 요청은 powerPlus 가 하는 일이 아니다. 정중히 범위를 말하고 할 수 있는 일(에셋·제안서·목업·디자인 규칙)을 짧게 안내한다.';
        }

        // 도움말 문서 — 낱말이 많이 겹치는 것 3개까지 근거로
        $docs = self::docs($text, $module === 'help' ? 3 : 1);
        foreach ($docs as $d) {
            $ctx[] = '[도움말: ' . $d['title'] . "]\n" . mb_substr(trim(strip_tags((string) $d['body'])), 0, 900);
            if ($module === 'help') $links[] = ['/help/' . $d['category'] . '/' . $d['slug'], $d['title']];
        }

        $sys = "너는 powerPlus 의 AI 다. powerPlus 는 SI·공공 사업 실무자를 위한 올인원 서비스이고 네 가지 모듈이 있다.\n"
            . '- ' . implode("\n- ", array_filter(Triage::CAPABILITIES, static fn ($k) => $k !== 'none', ARRAY_FILTER_USE_KEY)) . "\n"
            . "- powerMCP: 위 네 모듈을 Claude·Cursor·ChatGPT 같은 AI 도구에 연결한다(키는 마이페이지).\n"
            . "규칙: 한국어 존댓말로 짧게(3~6문장). 문장마다 줄을 바꾼다. 아래 '근거'에 있는 것만 사실로 말하고, 근거에 없는 기능·숫자·주소·가격은 지어내지 않는다(모르면 문의를 권한다). "
            . "링크·버튼은 화면이 따로 붙이니 주소를 쓰지 않는다. 마크다운 굵게·제목 기호를 쓰지 않는다. 검색 결과가 있으면 무엇을 찾았는지 한두 문장으로만 말한다(결과 그림·목록은 이 글 아래에 붙는다). 질문과 상관없는 도움말 내용은 덧붙이지 않는다. 요청문(AI 에 붙여 넣을 글)은 화면이 상자로 따로 붙이니 본문에 다시 쓰지 않는다. 구분선(---)·목록 기호를 쓰지 않는다.";
        $msgs = [['role' => 'system', 'content' => $sys]];
        foreach (array_slice($history, -6) as $h) {
            if (in_array($h['role'] ?? '', ['user', 'assistant'], true) && trim((string) ($h['content'] ?? '')) !== '') {
                $msgs[] = ['role' => $h['role'], 'content' => mb_substr(Triage::scrub((string) $h['content'], 1200), 0, 1200)];
            }
        }
        $msgs[] = ['role' => 'user', 'content' => "근거:\n" . ($ctx ? implode("\n\n", $ctx) : '(없음)') . "\n\n사용자 말: " . Triage::scrub($text, 2000)];

        $body = Llm::chat($msgs);
        if ($body !== null) {
            // 구분선·마크다운 기호 걷기(지시를 어겨도 화면이 지저분하지 않게)
            $body = preg_replace(['/^\s*(-{3,}|\*{3,}|_{3,})\s*$/m', '/\*\*(.+?)\*\*/u', '/^#{1,6}\s+/m'], ['', '$1', ''], $body) ?? $body;
            // 요청문은 화면이 상자로 붙인다 — 본문에 다시 쓴 부분은 잘라 낸다
            if ($module === 'mock' && preg_match('/^\s*(요청문|붙여 넣을 요청문|예시 요청문)\s*[:：]/mu', $body, $mm, PREG_OFFSET_CAPTURE)) {
                $body = substr($body, 0, $mm[0][1]);
            }
            $body = trim(preg_replace("/\n{3,}/", "\n\n", $body) ?? $body);
            if ($body === '') $body = null;
        }
        if ($body === null) {
            // LLM 이 안 되면 — 도움말 원문 카드로(일 결과는 그대로 붙인다)
            $fb = Assist::answer($text, false);
            $body = $items ? ($module === 'assets' ? "찾은 에셋입니다.\n누르면 크게 볼 수 있어요." : ($module === 'mock' ? "아래 요청문을 powerMCP 를 연결한 AI 에 붙여 넣으면 시안을 만듭니다." : '맞는 부품입니다.'))
                : (string) ($fb['body'] ?? '');
            if (!$links) $links = $fb['links'] ?? [];
        }
        $body = trim((string) preg_replace(['/\*\*/', '/^#+\s*/m'], '', $body));
        return ['kind' => 'reply', 'module' => $module, 'body' => $body, 'items' => $items, 'item_type' => $type,
            'links' => array_values(array_slice($links, 0, 4)), 'prompt' => $prompt];
    }

    /** 검색어 — 부탁하는 말을 걷어낸다 */
    public static function query(string $text): string
    {
        $t = $text;
        // 아이콘·사진 등을 찾는 말이면 "제안서 표지에 어울리는 … 톤" 같은 쓰임새 말은 검색어가 아니다 — 남기면 낱말을 다 가진 에셋이 없어
        // 검색이 낱말을 빼며 넓히다 흔한 "제안서" 만 남기고 "보안" 을 버렸다(2026-10-14 운영: 보안 아이콘 대신 무전기·반도체 장비).
        // 장표 자체를 찾을 때("표지 장표 찾아줘")는 그대로 둔다.
        if (preg_match('/아이콘|사진|일러스트|로고|다이어그램/u', $t)) {
            $t = (string) preg_replace('/(제안서|발표\s?자료|장표|슬라이드|PPT|ppt|표지|간지|목차)(에|에서|용으로|용|의)?|(톤|느낌|분위기)(의|으로|로)?/u', ' ', $t);
        }
        $t = (string) preg_replace(self::STOP, ' ', $t);
        $t = (string) preg_replace('/[^\p{L}\p{N}\s]/u', ' ', $t);
        $t = trim((string) preg_replace('/\s+/u', ' ', $t));
        return mb_substr($t, 0, 60);
    }

    /** 공개 도움말 중 낱말이 많이 겹치는 것 */
    private static function docs(string $text, int $n): array
    {
        try {
            $rows = Db::rows('SELECT category, slug, title, body FROM core_help_docs WHERE published = 1 AND deleted_at IS NULL');
        } catch (\Throwable) {
            return [];
        }
        $words = array_values(array_filter(preg_split('/[\s,.?!]+/u', mb_strtolower($text)) ?: [], static fn ($w) => mb_strlen($w) >= 2));
        $scored = [];
        foreach ($rows as $r) {
            $title = mb_strtolower((string) $r['title']);
            $body = mb_strtolower((string) $r['body']);
            $s = 0;
            foreach ($words as $w) {
                $stem = mb_substr($w, 0, max(2, mb_strlen($w) - 1));
                if (str_contains($title, $stem)) $s += 3;
                elseif (str_contains($body, $stem)) $s += 1;
            }
            if ($s >= 2) $scored[] = [$s, $r];
        }
        usort($scored, static fn ($x, $y) => $y[0] <=> $x[0]);
        return array_map(static fn ($x) => $x[1], array_slice($scored, 0, $n));
    }
}
