<?php
/**
 * 질문에 답한다 — 우측 하단 도우미(/assist/ask)와 홈 메인 채팅의 질문이 같이 쓴다.
 * 1) 도움말 문서(core_help_docs) 중 맞는 것 하나를 Jev 가 고르면 사람이 쓴 문서를 그대로 보여 준다.
 * 2) 없으면 "플랫폼으로 할 수 있는 일인가"(Triage::scope)를 보고 갈 곳을 알려 준다.
 * 3) Jev 가 안 되면 낱말 규칙으로 갈 곳을 고른다. 그래도 없으면 문의로.
 * 지어낸 답 문장은 없다 — 모듈 설명은 Triage::CAPABILITIES, 나머지는 도움말 원문.
 */
declare(strict_types=1);

namespace Pp\Core;

final class Assist
{
    /** 기능 → 사용자가 바로 갈 곳 */
    public const CAP_LINKS = [
        'assets' => ['/assets', 'powerAssets 둘러보기'], 'deck_make' => ['/deck', 'powerDeck 시작하기'], 'deck_polish' => ['/deck', 'powerDeck 시작하기'], 'deck_status' => ['/deck/jobs', '내 장표 작업 보기'],
        'mock_page' => ['/mock', 'powerMock 시작하기'], 'mock_wire' => ['/mock', 'powerMock 시작하기'], 'mock_ref' => ['/powermcp', 'powerMCP 도구 보기'],
        'guide_tokens' => ['/guide/tokens', '토큰 받기'], 'guide_parts' => ['/guide/components', '부품 보기'],
    ];

    /** 서비스 기능이 아닌 질문 — 갈 곳이 정해져 있다 */
    private const FIXED = [
        '/요금|가격|얼마|결제|구독|플랜|크레딧|무료|유료|pro\b|프로 ?요금/iu' => ['요금과 무료 범위', '요금제 화면에서 모듈별 무료 범위와 요금을 볼 수 있습니다. 쓰고 있는 플랜과 남은 사용량은 마이페이지에 있습니다.', [['/pricing', '요금제 보기'], ['/account', '마이페이지']]],
        '/탈퇴|비밀번호|로그인이 안|계정|이메일 ?바꾸|프로필/u' => ['계정 관리', '이름·사진·알림·탈퇴는 마이페이지에서 바꿀 수 있습니다. 로그인이 안 되면 문의를 남겨 주세요.', [['/account', '마이페이지'], ['/contact', '문의하기']]],
        '/설치|애드인|파워포인트에서|add-?in/iu' => ['PowerPoint 애드인 설치', '설치 파일을 받아 실행하면 PowerPoint 작업창에서 에셋을 바로 넣을 수 있습니다.', [['/assets', '설치 안내 보기'], ['/help', '도움말']]],
    ];

    /** Jev 를 못 쓸 때 낱말로 기능을 고른다 — 순서가 우선순위 */
    private const CAP_WORDS = [
        'mcp' => '/mcp|엠씨피|claude|클로드|커서|cursor|chatgpt|연결|api ?키/iu',
        'mock_wire' => '/와이어|화면 구성|레이아웃|섹션 배치|사이트맵/u',
        'mock_page' => '/목업|시안|홈페이지|웹사이트|사이트|메인 화면|서브 화면|랜딩|웹 ?디자인/u',
        'guide_parts' => '/부품|컴포넌트|react|vue|리액트|뷰|krds|접근성/iu',
        'guide_tokens' => '/토큰|디자인 ?시스템|색상표|팔레트|글꼴|폰트/u',
        'deck_polish' => '/초안|다듬|정리된 디자인|ppt.*(고쳐|바꿔)/iu',
        'deck_make' => '/제안|장표|발표|피티|ppt|rfp|기획서|대본|슬라이드/iu',
        'assets' => '/아이콘|이미지|사진|일러스트|로고|에셋|자산|다이어그램|애드인|파워포인트에 넣/iu',
    ];

    /** 질문 → 답 카드 {kind, title, body, links:[[href,label]], capability?} */
    public static function answer(string $q, bool $addin = false, ?string $ref = null): array
    {
        $docs = Db::rows('SELECT category, slug, title, body FROM core_help_docs WHERE published = 1 AND deleted_at IS NULL'
            . ($addin ? " AND category IN ('assets','start','account')" : '') . ' ORDER BY category, sort_order, id');
        $criteria = [];
        foreach ($docs as $d) {
            $criteria[$d['category'] . '/' . $d['slug']] = $d['title'] . ' — ' . mb_substr(preg_replace('/\s+/u', ' ', strip_tags((string) $d['body'])) ?? '', 0, 140);
        }
        $criteria['none'] = '위 도움말 어디에도 답이 없다(계정 문제·오류 신고·견적·제휴처럼 사람이 봐야 하는 질문 포함)';
        $ans = null;
        try {
            $ans = Jev::ask('assist', '사용자 질문: ' . Triage::scrub($q, 500), [
                'doc' => ['type' => 'choice', 'instructions' => '이 질문에 답이 되는 도움말 문서', 'criteria' => $criteria],
                'human' => ['type' => 'noul', 'instructions' => '오류·결제·계정 잠김·삭제 요청처럼 운영자가 직접 처리해야 하는 질문인가'],
            ], $ref);
        } catch (\Throwable) {
        }
        $human = 0.0;
        if (is_array($ans)) {
            $pick = (string) ($ans['doc']['choice'] ?? 'none');
            $conf = (float) ($ans['doc']['confidence'] ?? 0);
            $human = (float) ($ans['human']['noul'] ?? 0);
            if ($pick !== 'none' && $conf >= 0.45 && isset($criteria[$pick])) {
                foreach ($docs as $d) {
                    if ($d['category'] . '/' . $d['slug'] === $pick) {
                        return [
                            'kind' => 'doc', 'confidence' => round($conf, 2), 'title' => $d['title'],
                            'body' => mb_substr(trim((string) $d['body']), 0, 1200),
                            'links' => array_values(array_filter([['/help/' . $d['category'] . '/' . $d['slug'], '도움말에서 보기'], $human >= 0.6 ? ['/contact', '운영자에게 문의'] : null])),
                        ];
                    }
                }
            }
        }
        // 도움말에 없는 요금·계정·설치 질문 — 서비스 판정(scope)은 '하는 일'만 보므로 "안 하는 일"로 잘못 답했다(2026-10-08)
        foreach (self::FIXED as $re => [$title, $body, $links]) {
            if (preg_match($re, $q)) {
                return ['kind' => 'scope', 'title' => $title, 'body' => $body, 'links' => $links];
            }
        }
        // 운영자가 봐야 하는 일(결제·계정·오류)은 바로 문의로
        $scope = null;
        if ($human < 0.5) {
            try { $scope = Triage::scope($q); } catch (\Throwable) { $scope = null; }
            if ($scope === null) {
                $scope = self::scopeByWords($q);
            }
        }
        if ($scope && $scope['supported']) {
            $cap = $scope['capability'];
            if ($cap === 'mcp') {
                return ['kind' => 'scope', 'capability' => 'mcp', 'title' => 'powerMCP 로 연결할 수 있습니다',
                    'body' => 'Claude·Cursor·ChatGPT 같은 AI 도구에 powerMCP 를 연결하면 에셋·장표·목업·가이드를 한 번에 불러 쓸 수 있습니다. 키는 마이페이지에서 발급합니다.',
                    'links' => [['/powermcp', 'powerMCP 안내'], ['/account/keys', '키 발급']]];
            }
            if (isset(self::CAP_LINKS[$cap])) {
                $l = self::CAP_LINKS[$cap];
                return ['kind' => 'scope', 'capability' => $cap, 'confidence' => $scope['confidence'] ?? null, 'title' => '이렇게 할 수 있습니다',
                    'body' => Triage::CAPABILITIES[$cap], 'links' => [[$l[0], $l[1]], ['/help', '도움말']]];
            }
        }
        return ['kind' => 'none', 'title' => '도움말에서 답을 찾지 못했습니다',
            'body' => $human >= 0.5 ? '결제·계정·오류처럼 운영자가 직접 확인해야 하는 내용입니다. 문의를 남겨 주시면 확인해 드립니다.'
                : (($scope && $scope['capability'] === 'none') ? '말씀하신 일은 powerPlus 가 하는 일이 아닌 것 같습니다. 운영자에게 물어보시면 확인해 드립니다.' : '운영자에게 문의를 남겨 주시면 답해 드립니다.'),
            'links' => [['/contact?message=' . rawurlencode(mb_substr($q, 0, 300)), '이 질문으로 문의하기'], ['/help', '도움말 전체']]];
    }

    /** 낱말 규칙으로 기능 판정 — Jev 를 못 쓸 때 */
    public static function scopeByWords(string $q): ?array
    {
        foreach (self::CAP_WORDS as $cap => $re) {
            if (preg_match($re, $q)) {
                return ['capability' => $cap, 'supported' => true, 'confidence' => null];
            }
        }
        return null;
    }
}
