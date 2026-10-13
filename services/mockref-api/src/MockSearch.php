<?php
declare(strict_types=1);

namespace Homebox;

/**
 * 자동 조립 목업(MainMockup·KitPage)의 검색 폼을 실제로 동작시키는 스크립트 (2026-09-30).
 * "시안은 흉내가 아니라 실제로 동작해야 한다" — 검색어를 넣으면 그 페이지 안의 제목·링크에서 찾아 결과 목록을 보여 준다.
 * 재현 방식의 공용 스크립트(api/data/hb-behavior.js)와 같은 동작이고, 조립 목업의 기존 마크업(form[role=search])에 맞춘 작은 판이다.
 */
final class MockSearch
{
    public const CSS = '.hb-sr{margin:10px 0 0;padding:14px 16px;border:1px solid #d8dde5;border-radius:10px;background:#fff;color:#1e2124;font-size:15px;line-height:1.5;text-align:left;box-shadow:0 8px 24px rgba(0,0,0,.08);position:relative;z-index:5}'
        . '.hb-sr p{margin:0 0 8px;font-weight:700}.hb-sr ul{margin:0;padding:0;list-style:none}.hb-sr li{padding:6px 0;border-top:1px solid #eef0f3}.hb-sr a{color:inherit;text-decoration:none}.hb-sr a:hover,.hb-sr a:focus{text-decoration:underline}';

    public const JS = <<<'JS'
(function(){
  function norm(s){return String(s||'').split(/[ \t\r\n]+/).join(' ').trim();}
  document.querySelectorAll('form[role=search]').forEach(function(f){
    var input=f.querySelector('input[type=search],input[type=text],input:not([type])');
    if(!input)return;
    var out=document.createElement('div');out.className='hb-sr';out.hidden=true;out.setAttribute('role','status');out.setAttribute('aria-live','polite');
    f.insertAdjacentElement('afterend',out);
    f.addEventListener('submit',function(e){
      e.preventDefault();
      var q=norm(input.value);out.textContent='';
      var head=document.createElement('p');out.appendChild(head);
      if(!q){head.textContent='검색어를 입력해 주세요.';out.hidden=false;return;}
      var seen={},hits=[];
      document.querySelectorAll('main a,main h2,main h3,main td,main li,#content a,#content td').forEach(function(el){
        if(out.contains(el)||f.contains(el))return;
        if(el.tagName!=='A'&&el.querySelector('a'))return;
        var t=norm(el.textContent);
        if(t.length<2||t.length>80||t.indexOf(q)<0||seen[t])return;
        seen[t]=1;hits.push({t:t,el:el});
      });
      head.textContent="'"+q+"' 검색 결과 "+hits.length+'건';
      var ul=document.createElement('ul');
      hits.slice(0,8).forEach(function(h){
        var li=document.createElement('li'),a=document.createElement('a');
        a.href='#';a.textContent=h.t;
        a.addEventListener('click',function(ev){ev.preventDefault();out.hidden=true;var lay=h.el.closest('[hidden]');if(!lay)h.el.scrollIntoView({block:'center'});});
        li.appendChild(a);ul.appendChild(li);
      });
      out.appendChild(ul);out.hidden=false;
    });
    document.addEventListener('keydown',function(e){if(e.key==='Escape')out.hidden=true;});
  });
})();
JS;
}
