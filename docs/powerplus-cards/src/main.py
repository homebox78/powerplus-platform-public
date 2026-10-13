# 메인 카드(16:9 이미지 칸) 애니메이션 4종. 글자 없이 흰·회·검 + 주황 한 점.
MAIN = {}

# powerAssets — 아이콘·일러스트·사진·장표를 PowerPoint 안에서 바로 넣습니다. 생성형 AI 로 만든 에셋은 따로 표시해 구분합니다.
MAIN['assets'] = r"""
const T=8, GL='#8F8A83';
// 종류별 기호: 아이콘 · 일러스트 · 사진 · 장표
const G={
 icon:`<div class="p" style="left:34px;top:34px;width:42px;height:42px;border-radius:12px;border:5px solid ${GL};box-sizing:border-box"></div>`,
 ill:`<div class="p" style="left:30px;top:52px;width:50px;height:26px;border-radius:26px 26px 6px 6px;background:${GL}"></div><div class="p" style="left:44px;top:30px;width:22px;height:22px;border-radius:11px;background:${GL}"></div>`,
 photo:`<div class="p" style="left:28px;top:32px;width:54px;height:44px;border-radius:8px;background:#D9D5CF"></div><div class="p" style="left:34px;top:54px;width:42px;height:16px;clip-path:polygon(0 100%,35% 20%,60% 70%,80% 40%,100% 100%);background:${GL};border-radius:0"></div>`,
 slide:`<div class="p" style="left:26px;top:34px;width:58px;height:40px;border-radius:6px;border:4px solid ${GL};box-sizing:border-box"></div><div class="p" style="left:34px;top:44px;width:24px;height:5px;background:${GL}"></div>`
};
const L=[['icon','l'],['ill','l'],['photo','g'],['slide','l'],['icon','g'],['photo','l'],['ill','d'],['slide','l'],['icon','l']];
const tiles=L.map(([g,k],n)=>{ const c=n%3, r=Math.floor(n/3), x=-380+c*124, y=-124+r*124;
  const b=blk({x,y,w:110,h:110,r:24,d:18,k,top:G[g].replaceAll(GL,k==='d'?'#EEEBE6':k==='g'?'#6E6A64':GL)}); b.px=x; b.py=y;
  anim(b.lift,[{transform:'translateZ(0px)'},{transform:'translateZ(10px)'},{transform:'translateZ(0px)'}],3.2,{easing:'ease-in-out',delay:-(c*.25+r*.18)*1000}); return b; });
// AI 로 만든 에셋 표시: 검은 별 표지
[2,6].forEach((n,i)=>{ const t=tiles[n]; const m=blk({x:t.px+40,y:t.py-40,w:34,h:34,r:17,d:10,k:'d',noShadow:true,top:'<svg viewBox="0 0 24 24" style="position:absolute;left:7px;top:7px;width:20px;height:20px"><path d="M12 3l2 6.5L20.5 12 14 14l-2 7-2-7-6.5-2L10 9.5z" fill="#fff"/></svg>'});
  m.lift.style.transform='translateZ(32px)'; pop(m,.56+i*.06,.9,T); });
// 슬라이드 판 (PowerPoint)
const sl=blk({x:200,y:0,w:400,h:260,r:20,d:20,k:'l',top:bar(0,0,400,30,'#2B2A28',0)+bar(28,62,150,14,'#2B2A28')+bar(28,92,150,8,'#D3CEC6')+bar(28,108,130,8,'#D3CEC6')+bar(28,124,140,8,'#D3CEC6')+
  '<div class="p hole" style="left:206px;top:56px;width:168px;height:168px;border:3px dashed #C9C2B8;border-radius:16px"></div>'});
// 고른 아이콘 하나(주황 점)가 들려 슬라이드 빈칸으로
const src=tiles[0], DX=200+90-src.px, DY=4-src.py;
const fly=blk({x:src.px,y:src.py,w:110,h:110,r:24,d:18,k:'l',top:G.icon+'<div class="p" style="left:62px;top:40px;width:10px;height:10px;border-radius:5px;background:#E2622B"></div>'});
const EZ='cubic-bezier(.5,0,.25,1)';
anim(fly,[{offset:0,transform:'translate(0px,0px) scale(0)'},{offset:.14,transform:'translate(0px,0px) scale(0)'},{offset:.141,transform:'translate(0px,0px) scale(1)',easing:EZ},{offset:.42,transform:`translate(${DX}px,${DY}px) scale(1.4)`},{offset:.86,transform:`translate(${DX}px,${DY}px) scale(1.4)`,easing:'ease-in'},{offset:.92,transform:`translate(${DX}px,${DY}px) scale(0)`},{offset:1,transform:`translate(${DX}px,${DY}px) scale(0)`}],T);
anim(fly.lift,[{offset:0,transform:'translateZ(0px)'},{offset:.14,transform:'translateZ(0px)',easing:'ease-out'},{offset:.28,transform:'translateZ(140px)',easing:'ease-in'},{offset:.42,transform:'translateZ(22px)'},{offset:1,transform:'translateZ(22px)'}],T);
anim(src,[{offset:0,transform:'scale(1)'},{offset:.14,transform:'scale(1)'},{offset:.145,transform:'scale(0)'},{offset:.9,transform:'scale(0)',easing:'cubic-bezier(.3,1.5,.5,1)'},{offset:.97,transform:'scale(1)'},{offset:1,transform:'scale(1)'}],T);
anim(sl.top.querySelector('.hole'),[{offset:0,opacity:1},{offset:.4,opacity:1},{offset:.43,opacity:0},{offset:.9,opacity:0},{offset:.95,opacity:1},{offset:1,opacity:1}],T);
anim(sl.lift,[{offset:0,transform:'translateZ(0px)'},{offset:.42,transform:'translateZ(0px)'},{offset:.45,transform:'translateZ(-8px)'},{offset:.5,transform:'translateZ(0px)'},{offset:1,transform:'translateZ(0px)'}],T);
"""

# powerDeck — 자료만 올리면 정리·기획·화면설계부터 디자인 장표와 대본까지 한 번에. 링크 하나로 팀이 같이 보고 의견을 달고 함께 고칩니다.
MAIN['deck'] = r"""
const T=9, DK='#2B2A28', GR='#E6E3DE', LN='#D3CEC6';
// 단계 키 4개: 차례로 검게 켜진다
const ST=[.13,.25,.37,.49];
ST.forEach((t,i)=>{ const k=blk({x:-400,y:-150+i*84,w:90,h:64,r:16,d:16,k:'l',top:'<div class="ly on" style="background:linear-gradient(140deg,#3E3C3A,#222120);opacity:0"></div>'});
  anim(k.top.querySelector('.on'),[{offset:0,opacity:0},{offset:t,opacity:0},{offset:t+.03,opacity:1},{offset:.9,opacity:1},{offset:.95,opacity:0},{offset:1,opacity:0}],T);
  anim(k.lift,[{offset:0,transform:'translateZ(0px)'},{offset:t,transform:'translateZ(0px)'},{offset:t+.03,transform:'translateZ(18px)'},{offset:t+.08,transform:'translateZ(0px)'},{offset:1,transform:'translateZ(0px)'}],T); });
// 장표: 자료 → 기획 → 화면설계 → 디자인
const S=[
 [0,1,2,3,4,5,6,7].map(r=>bar(26,26+r*22,r%3==2?200:300,8,LN)).join(''),
 bar(26,26,180,16,DK)+[0,1,2].map(r=>bar(26,70+r*40,14,14,'#8F8A83',7)+bar(52,72+r*40,220,10,LN)).join(''),
 `<div class="p" style="left:26px;top:22px;width:180px;height:18px;border:2px dashed #B9B3AA"></div>`+[0,1,2].map(c=>`<div class="p" style="left:${26+c*104}px;top:58px;width:92px;height:96px;border:2px dashed #B9B3AA"></div>`).join('')+`<div class="p" style="left:26px;top:168px;width:300px;height:16px;border:2px dashed #B9B3AA"></div>`,
 bar(26,24,200,16,DK)+bar(26,66,140,104,'#F1EEEA',10)+[0,1,2,3].map(c=>bar(46+c*28,150-(c+1)*16,18,(c+1)*16,c==3?'#E2622B':'#BDB8B1',4)).join('')+bar(184,66,150,30,GR,8)+bar(184,104,150,30,GR,8)+bar(184,142,150,30,GR,8)
];
const slide=blk({x:-60,y:-20,w:360,h:226,r:18,d:20,k:'l',top:S.map(h=>`<div class="ly">${h}</div>`).join('')});
const LT=[[.12,.25],[.25,.37],[.37,.49],[.49,.9]];
[...slide.top.children].forEach((el,i)=>anim(el,[{offset:0,opacity:0},{offset:LT[i][0],opacity:0},{offset:LT[i][0]+.025,opacity:1},{offset:LT[i][1],opacity:1},{offset:Math.min(LT[i][1]+.025,1),opacity:0},{offset:1,opacity:0}],T));
// 자료 한 장이 떨어져 스며든다
const doc=blk({x:-60,y:-20,w:170,h:214,r:12,d:12,k:'g',noShadow:true,top:[0,1,2,3,4].map(r=>bar(20,26+r*24,r==4?80:130,8,'#9F9B95')).join('')});
anim(doc.lift,[{offset:0,transform:'translateZ(260px)'},{offset:.02,transform:'translateZ(260px)',easing:'cubic-bezier(.5,0,.8,.6)'},{offset:.1,transform:'translateZ(22px)'},{offset:1,transform:'translateZ(22px)'}],T);
anim(doc,[{offset:0,transform:'scale(1)'},{offset:.1,transform:'scale(1)',easing:'ease-in'},{offset:.14,transform:'scale(0)'},{offset:1,transform:'scale(0)'}],T);
// 대본 말풍선
pop(blk({x:300,y:-140,w:200,h:120,r:26,d:16,k:'d',top:bar(24,30,140,8,'#6E6A65')+bar(24,50,120,8,'#6E6A65')+bar(24,70,90,8,'#6E6A65')}),.56,.9,T);
// 링크 하나로 공유 + 팀 의견 핀
pop(blk({x:300,y:40,w:180,h:56,r:28,d:14,k:'l',top:'<div class="p" style="left:22px;top:20px;width:34px;height:16px;border-radius:8px;border:4px solid #6E6A65;box-sizing:border-box"></div>'+bar(70,24,86,8,LN)}),.64,.9,T);
[[-160,-90,.70],[40,30,.74],[120,-100,.78]].forEach(([x,y,t])=>{ const c=blk({x,y,w:48,h:48,r:24,d:12,k:'d',noShadow:true,top:'<div class="p" style="left:17px;top:17px;width:14px;height:14px;border-radius:7px;background:#EEEBE6"></div>'});
  c.lift.style.transform='translateZ(40px)'; pop(c,t,.9,T); });
"""

# powerMock — 관공서·대학·일반 홈페이지 어느 것이든. AI 도구에 연결하면 기획부터 목업·컴포넌트까지 한 흐름.
MAIN['mock'] = r"""
const T=9, C=3, LN='#D3CEC6';
const on=(o,base)=>{ const b=blk(Object.assign({noShadow:true},o)); b.lift.style.transform=`translateZ(${base}px)`; return b; };
const bounce=(b,base,t)=>anim(b.lift,[{offset:0,transform:`translateZ(${base}px)`},{offset:t,transform:`translateZ(${base}px)`},{offset:t+.06,transform:`translateZ(${base+24}px)`},{offset:t+.14,transform:`translateZ(${base}px)`},{offset:1,transform:`translateZ(${base}px)`}],C);
for(let x=-300;x<300;x+=40) blk({x,y:0,w:22,h:8,r:4,d:4,k:'g',noShadow:true});
// AI 도구
const ai=blk({x:-390,y:0,w:160,h:160,r:38,d:30,k:'d',top:'<svg viewBox="0 0 24 24" style="position:absolute;left:46px;top:46px;width:68px;height:68px"><path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z" fill="#EEEBE6"/></svg>'});
bounce(ai,0,0);
// 신호
const pulse=blk({x:-300,y:0,w:34,h:34,r:17,d:14,k:'o',noShadow:true});
anim(pulse,[{offset:0,transform:'translate(0px,0)'},{offset:.62,transform:'translate(600px,0)'},{offset:1,transform:'translate(600px,0)'}],C,{easing:'cubic-bezier(.45,0,.55,1)'});
anim(pulse.lift,[{offset:0,transform:'translateZ(6px) scale(0)'},{offset:.06,transform:'translateZ(6px) scale(1)'},{offset:.58,transform:'translateZ(6px) scale(1)'},{offset:.64,transform:'translateZ(6px) scale(0)'},{offset:1,transform:'translateZ(6px) scale(0)'}],C);
// 기획 판: 칸 잡기
const WX=-150, wf=blk({x:WX,y:0,w:210,h:280,r:24,d:26,k:'l'});
const wp=[[0,-90,170,30],[0,-28,170,70],[-44,66,82,100],[44,66,82,100]].map(([x,y,w,h])=>on({x:WX+x,y,w,h,r:10,d:10,k:'g'},26));
bounce(wf,0,.18); wp.forEach(p=>bounce(p,26,.18));
// 목업 판: 관공서 · 대학 · 일반 — 세 가지 배치가 차례로 (색 대신 배치가 달라진다)
const MX=110, mk=blk({x:MX,y:0,w:210,h:280,r:24,d:26,k:'l'});
const lay=[
 [[0,-100,170,24,'d'],[0,-38,170,80,'g'],[-44,62,82,70,'l'],[44,62,82,70,'l']],
 [[-44,-90,82,44,'d'],[44,-90,82,44,'g'],[0,-10,170,90,'g'],[0,84,170,40,'l']],
 [[0,-100,170,24,'d'],[-44,-24,82,110,'g'],[44,-48,82,60,'l'],[44,26,82,60,'l']]];
const mp=[0,1,2,3].map(i=>on({x:MX,y:0,w:10,h:10,r:10,d:10,k:'g'},26));
mp.forEach((b,i)=>{ const fr=[]; lay.forEach((L,j)=>{ const [x,y,w,h]=L[i]; const tf=`translate(${x}px,${y}px)`; fr.push({offset:j/3,transform:tf,easing:'cubic-bezier(.5,0,.2,1)'},{offset:j/3+.25,transform:tf}); });
  fr.push({offset:1,transform:`translate(${lay[0][i][0]}px,${lay[0][i][1]}px)`}); anim(b,fr,T);
  const sz=[]; lay.forEach((L,j)=>{ const [, , w,h,k]=L[i]; sz.push({offset:j/3,width:w+'px',height:h+'px',left:-w/2+'px',top:-h/2+'px',easing:'cubic-bezier(.5,0,.2,1)'},{offset:j/3+.25,width:w+'px',height:h+'px',left:-w/2+'px',top:-h/2+'px'}); });
  sz.push({offset:1,width:lay[0][i][2]+'px',height:lay[0][i][3]+'px',left:-lay[0][i][2]/2+'px',top:-lay[0][i][3]/2+'px'});
  b.querySelectorAll('i,b').forEach(e=>anim(e,sz,T));
  if(i===0) b.className='blk d'; });
bounce(mk,0,.38); mp.forEach(p=>bounce(p,26,.38));
// 컴포넌트: 버튼 · 카드 · 입력칸
const PX=380;
const parts=[blk({x:PX,y:-80,w:170,h:60,r:30,d:22,k:'d',top:bar(50,24,70,12,'#EEEBE6')}),
 blk({x:PX,y:20,w:170,h:104,r:20,d:22,k:'l',top:bar(18,18,134,36,'#ECE9E4',8)+bar(18,64,96,9,'#CFCAC2')+bar(18,80,64,9,'#E2DED8')}),
 blk({x:PX,y:118,w:170,h:56,r:16,d:18,k:'l',top:`<div class="p" style="left:12px;top:11px;width:146px;height:34px;border:2px solid #D6D1CA;border-radius:10px"></div>`})];
parts.forEach((p,i)=>bounce(p,0,.6+i*.05));
"""

# powerGuide — 토큰·부품·KRDS 대응표·접근성 체크리스트를 누구나 가져다 씁니다. 코드와 디자인이 같은 규칙을 따릅니다.
MAIN['guide'] = r"""
const T=8, DK='#2B2A28', LN='#D3CEC6';
const TK=[['#F4F2EE','#D3CFC8'],['#CFCBC5','#A9A49D'],['#F2803F','#A9421A'],['#6E6A65','#4A4744'],['#2E2C2B','#141312']];
TK.forEach(([c,s],i)=>{ const k=blk({x:-200+i*100,y:-230,w:82,h:82,r:20,d:18,k:'l'}); k.style.setProperty('--top',`linear-gradient(140deg,${c},${c})`); k.style.setProperty('--side',s);
  anim(k.lift,[{transform:'translateZ(0px)'},{transform:'translateZ(14px)'},{transform:'translateZ(0px)'}],3.2,{easing:'ease-in-out',delay:-i*240}); });
// 같은 토큰이 디자인 판과 코드 판으로 동시에
[[-250,0],[250,0]].forEach(([tx,ty])=>{ const c=blk({x:0,y:-230,w:40,h:40,r:20,d:12,k:'o',noShadow:true});
  anim(c,[{offset:0,transform:'translate(0px,0px) scale(0)'},{offset:.12,transform:'translate(0px,0px) scale(0)'},{offset:.16,transform:'translate(0px,0px) scale(1)',easing:'cubic-bezier(.5,0,.3,1)'},{offset:.36,transform:`translate(${tx}px,${ty+230}px) scale(1)`},{offset:.4,transform:`translate(${tx}px,${ty+230}px) scale(0)`},{offset:1,transform:`translate(${tx}px,${ty+230}px) scale(0)`}],T);
  anim(c.lift,[{offset:0,transform:'translateZ(30px)'},{offset:.16,transform:'translateZ(30px)'},{offset:.26,transform:'translateZ(130px)'},{offset:.36,transform:'translateZ(30px)'},{offset:1,transform:'translateZ(30px)'}],T); });
const ds=blk({x:-250,y:0,w:280,h:210,r:22,d:18,k:'l',top:bar(20,30,200,14,DK)+bar(20,56,240,8,LN)+bar(20,72,180,8,LN)+'<div class="p bt" style="left:20px;top:120px;width:150px;height:48px;border-radius:24px;background:#C9C5BF"></div>'});
anim(ds.top.querySelector('.bt'),[{offset:0,background:'#C9C5BF'},{offset:.37,background:'#C9C5BF'},{offset:.41,background:'#E2622B'},{offset:.9,background:'#E2622B'},{offset:.95,background:'#C9C5BF'},{offset:1,background:'#C9C5BF'}],T);
const cd=blk({x:250,y:0,w:280,h:210,r:22,d:18,k:'d',top:bar(20,30,120,9,'#6E6A65')+bar(36,50,180,9,'#6E6A65')+'<div class="p ln" style="left:36px;top:70px;width:200px;height:9px;border-radius:5px;background:#6E6A65"></div>'+bar(36,90,150,9,'#6E6A65')+bar(20,110,60,9,'#6E6A65')+bar(20,140,170,9,'#4E4A46')});
anim(cd.top.querySelector('.ln'),[{offset:0,background:'#6E6A65'},{offset:.37,background:'#6E6A65'},{offset:.41,background:'#F2803F'},{offset:.9,background:'#F2803F'},{offset:.95,background:'#6E6A65'},{offset:1,background:'#6E6A65'}],T);
[ds,cd].forEach(b=>anim(b.lift,[{offset:0,transform:'translateZ(0px)'},{offset:.37,transform:'translateZ(0px)'},{offset:.42,transform:'translateZ(18px)'},{offset:.5,transform:'translateZ(0px)'},{offset:1,transform:'translateZ(0px)'}],T));
// 접근성 체크 (검정 체크)
const A=blk({x:-120,y:230,w:250,h:150,r:20,d:16,k:'l',top:[0,1,2].map(r=>`<div class="p" style="left:20px;top:${28+r*36}px;width:24px;height:24px;border-radius:6px;border:2px solid #CFCAC2;box-sizing:border-box"></div><svg viewBox="0 0 24 24" style="position:absolute;left:21px;top:${29+r*36}px;width:22px;height:22px"><path class="c" d="M5 12l5 5 9-10" fill="none" stroke="#2B2A28" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="24" stroke-dashoffset="24"/></svg>`+bar(58,36+r*36,[150,120,140][r],8,LN)).join('')});
[...A.top.querySelectorAll('.c')].forEach((p,i)=>anim(p,[{offset:0,strokeDashoffset:24},{offset:.52+i*.07,strokeDashoffset:24},{offset:.57+i*.07,strokeDashoffset:0},{offset:.9,strokeDashoffset:0},{offset:.95,strokeDashoffset:24},{offset:1,strokeDashoffset:24}],T));
// KRDS 대응표 (검정 연결선)
const K=blk({x:170,y:230,w:250,h:150,r:20,d:16,k:'l',top:[0,1,2].map(r=>bar(20,30+r*36,70,14,'#E6E3DE',6)+`<div class="p rw" style="left:98px;top:${35+r*36}px;width:44px;height:4px;border-radius:2px;background:#2B2A28;transform-origin:0 50%"></div>`+bar(150,30+r*36,78,14,'#E6E3DE',6)).join('')});
[...K.top.querySelectorAll('.rw')].forEach((el,i)=>anim(el,[{offset:0,transform:'scaleX(0)'},{offset:.6+i*.07,transform:'scaleX(0)'},{offset:.65+i*.07,transform:'scaleX(1)'},{offset:.9,transform:'scaleX(1)'},{offset:.95,transform:'scaleX(0)'},{offset:1,transform:'scaleX(0)'}],T));
"""
