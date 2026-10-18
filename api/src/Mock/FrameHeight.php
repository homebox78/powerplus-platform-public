<?php
declare(strict_types=1);

namespace Pp\Mock;

/**
 * 시안 HTML 에 "내 높이"를 부모 창에 알려 주는 작은 스크립트를 붙인다.
 * 이유: 미리보기 iframe 이 sandbox(allow-same-origin 없음)라 부모가 안쪽 높이를 잴 수 없다 → 안쪽 세로 스크롤이 생겼다.
 * 높이를 받아 iframe 을 내용만큼 늘려 바깥 스크롤 하나로 본다(사용자 2026-10-07 "안에 컨텐츠 만큼 세로 길어져야함").
 * 새 창으로 열면(부모 없음) 아무 일도 안 한다. 100vh 요소가 있어 높이가 계속 늘어나는 것은 부모 쪽에서 상한으로 막는다.
 * 높이 = body 직계 요소의 실제 바닥(고정 위치 제외) — scrollHeight 는 iframe 자기 높이보다 작아지지 않아, 한 번 커지면(펼친 판·탭·늦게 뜬 그림)
 * 다시 줄지 않고 바닥글 아래 흰 띠가 남았다(2026-10-15 사용자 지적 "푸터 하단에 이상한 여백").
 * 2026-10-18: 10-15 수정 때 send() 가 bottom() 안의 지역 변수 b 를 써서 'b is not defined' 로 높이를 한 번도 못 보냈다 —
 * 미리보기가 고정 높이 틀에 갇혀 "푸터를 스크롤해도 아래가 안 보임"(사용자). 시험: packages/mcp/test/frame-height.render.test.mjs(실제 iframe 에서 높이 메시지가 오는지).
 */
final class FrameHeight
{
    private const SCRIPT = <<<'JS'
<script data-pp-frame-height>(function(){if(window.parent===window)return;var last=0,lastW=0;function bottom(){var b=document.body;if(!b)return 0;var m=0,k=b.children,y=window.scrollY||0;for(var i=0;i<k.length;i++){var e=k[i],s=getComputedStyle(e);if(s.position==='fixed'||s.display==='none'||e.tagName==='SCRIPT')continue;var r=e.getBoundingClientRect();if(r.height>0&&r.bottom+y>m)m=r.bottom+y;}var bs=getComputedStyle(b);return Math.ceil(m+parseFloat(bs.paddingBottom||0)+parseFloat(bs.marginBottom||0));}function send(){var d=document.documentElement,b=document.body;var h=bottom()||d.scrollHeight;var w=Math.max(d.scrollWidth,b?b.scrollWidth:0);if(h&&(Math.abs(h-last)>2||w!==lastW)){last=h;lastW=w;try{parent.postMessage({ppFrameHeight:h,ppFrameWidth:w},'*');}catch(e){}}}
window.addEventListener('load',send);if(window.ResizeObserver){new ResizeObserver(send).observe(document.documentElement);}var n=0,t=setInterval(function(){send();if(++n>30)clearInterval(t);},500);send();})();</script>
JS;

    public static function inject(string $html): string
    {
        $pos = strripos($html, '</body>');
        return $pos === false ? $html . self::SCRIPT : substr($html, 0, $pos) . self::SCRIPT . substr($html, $pos);
    }
}
