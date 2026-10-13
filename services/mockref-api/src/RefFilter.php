<?php

declare(strict_types=1);

namespace Homebox;

/**
 * 목업·조립 레퍼런스에서 뺄 화면 — SQL 조건 조각(별칭 sc = screens).
 *
 * 외국어판 페이지(부산 /jpn/·경북 /chi/ 등)가 'content' 로 게시돼 있어, 홈페이지 목업의 서브 레퍼런스로
 * 뽑히면 페이지 제목이 '西区庁' 처럼 나왔다(2026-09-30 MCP 시험 r2 S01). 수집 데이터는 그대로 두고
 * 레퍼런스 선택에서만 뺀다.
 */
final class RefFilter
{
    /** 제목에 가나·한자, 또는 주소에 언어 폴더(/jpn/ /chi_b/ /eng/ …) */
    public const NOT_FOREIGN = "(COALESCE(sc.title, '') NOT REGEXP '[぀-ヿ一-鿿]' AND COALESCE(sc.url, '') NOT REGEXP '/(jpn|jp|ja|japan|chn|chi|chi_b|cn|zh|zhs|zht|china|eng|en|english|rus|ru|vie|vn|mn|th)(/|_|[.]|$)')";
}
