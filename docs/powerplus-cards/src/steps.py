# 단계 카드(정사각형 이미지 칸)용 애니메이션 17종. gen.py 의 HEAD 를 정사각형으로 바꿔 쓴다.
# 글자 없이 흰·회·검 + 주황 한 점, 움직임은 문장 하나만 보여 줄 만큼.
STEPS = {}

# ── powerAssets · AI 가 자료를 골라 줍니다
STEPS['assets-1'] = r"""  // 슬라이드에 맞는 자료를 골라 줍니다: 슬라이드 글을 읽고(훑는 선) 맞는 자료 하나가 떠오름
const T=6;
const s=blk({x:-20,y:20,w:220,h:150,r:18,d:16,k:'l',top:bar(20,22,110,12,'#2B2A28')+[0,1,2,3].map(i=>bar(20,50+i*20,i==3?100:170,7,'#D3CEC6')).join('')+'<div class="p sc" style="left:14px;top:44px;width:192px;height:4px;border-radius:2px;background:#E2622B;opacity:0"></div>'});
anim(s.top.querySelector('.sc'),[{offset:0,opacity:0,transform:'translateY(0px)'},{offset:.1,opacity:1,transform:'translateY(0px)'},{offset:.48,opacity:1,transform:'translateY(70px)'},{offset:.54,opacity:0,transform:'translateY(70px)'},{offset:1,opacity:0,transform:'translateY(70px)'}],T);
const k=blk({x:110,y:-90,w:84,h:84,r:20,d:16,k:'l',top:'<div class="p" style="left:24px;top:24px;width:36px;height:36px;border-radius:9px;border:4px solid #8F8A83;box-sizing:border-box"></div><div class="p" style="left:44px;top:30px;width:9px;height:9px;border-radius:5px;background:#E2622B"></div>'});
pop(k,.52,.9,T); anim(k.lift,[{offset:0,transform:'translateZ(0px)'},{offset:.58,transform:'translateZ(0px)'},{offset:.66,transform:'translateZ(22px)'},{offset:.76,transform:'translateZ(0px)'},{offset:1,transform:'translateZ(0px)'}],T);
"""
STEPS['assets-2'] = r"""  // 검색어로 자료 종류를 먼저 고릅니다: 세 종류 키 중 하나가 눌려 골라짐
const T=6;
const K=[[-110,'l','<div class="p" style="left:22px;top:24px;width:40px;height:32px;border-radius:6px;border:4px solid #8F8A83;box-sizing:border-box"></div>'],
 [0,'l','<div class="p" style="left:22px;top:46px;width:8px;height:14px;background:#8F8A83;border-radius:2px"></div><div class="p" style="left:36px;top:34px;width:8px;height:26px;background:#8F8A83;border-radius:2px"></div><div class="p" style="left:50px;top:24px;width:8px;height:36px;background:#8F8A83;border-radius:2px"></div>'],
 [110,'d','<div class="p" style="left:24px;top:38px;width:34px;height:6px;border-radius:3px;background:#EEEBE6"></div><div class="p" style="left:44px;top:30px;width:16px;height:16px;border-top:5px solid #EEEBE6;border-right:5px solid #EEEBE6;transform:rotate(45deg);box-sizing:border-box"></div>']];
const ks=K.map(([x,k,t])=>blk({x,y:0,w:84,h:84,r:20,d:18,k,top:t}));
// 가운데(차트)가 골라짐: 눌렸다 주황으로
const o=document.createElement('div'); o.className='p'; o.style.cssText='inset:0;border-radius:20px;background:linear-gradient(140deg,#F2803F,#D9561C);opacity:0'; ks[1].top.prepend(o);
anim(o,[{offset:0,opacity:0},{offset:.3,opacity:0},{offset:.34,opacity:1},{offset:.86,opacity:1},{offset:.92,opacity:0},{offset:1,opacity:0}],T);
anim(ks[1].lift,[{offset:0,transform:'translateZ(0px)'},{offset:.26,transform:'translateZ(0px)'},{offset:.3,transform:'translateZ(-10px)'},{offset:.38,transform:'translateZ(14px)'},{offset:.86,transform:'translateZ(14px)'},{offset:.94,transform:'translateZ(0px)'},{offset:1,transform:'translateZ(0px)'}],T);
ks[1].top.querySelectorAll('.p').forEach((p,i)=>{ if(i) anim(p,[{offset:0,background:'#8F8A83'},{offset:.3,background:'#8F8A83'},{offset:.34,background:'#FFFFFF'},{offset:.86,background:'#FFFFFF'},{offset:.92,background:'#8F8A83'},{offset:1,background:'#8F8A83'}],T); });
"""
STEPS['assets-3'] = r"""  // 장표도 같은 방식, 클릭 한 번으로 슬라이드에 들어감: 장표 판이 홈에 쏙
const T=6;
blk({x:0,y:30,w:230,h:150,r:22,d:14,k:'l',top:'<div class="p" style="left:40px;top:62px;width:150px;height:26px;border-radius:6px;background:#2B2A28"></div>'});
const c=blk({x:0,y:30,w:130,h:84,r:12,d:10,k:'l',noShadow:true,top:bar(14,14,60,8,'#2B2A28')+bar(14,30,90,6,'#D3CEC6')+bar(14,42,70,6,'#D3CEC6')+'<div class="p" style="left:0;top:0;width:6px;height:84px;border-radius:12px 0 0 12px;background:#E2622B"></div>'});
anim(c.lift,[{offset:0,transform:'translateZ(120px)'},{offset:.2,transform:'translateZ(120px)',easing:'cubic-bezier(.5,0,.8,.5)'},{offset:.42,transform:'translateZ(10px)'},{offset:.46,transform:'translateZ(16px)'},{offset:.52,transform:'translateZ(14px)'},{offset:.84,transform:'translateZ(14px)',easing:'ease-in'},{offset:1,transform:'translateZ(120px)'}],T);
anim(c,[{offset:0,transform:'scale(0)'},{offset:.12,transform:'scale(0)'},{offset:.2,transform:'scale(1)'},{offset:.88,transform:'scale(1)'},{offset:.96,transform:'scale(0)'},{offset:1,transform:'scale(0)'}],T);
"""

# ── powerDeck · 여섯 단계
STEPS['deck-1'] = r"""  // 자료를 정리한다: 흩어진 종이 몇 장이 한 장으로 모인다
const T=6, P=[[-60,-40,-14],[50,-60,10],[-40,60,8],[60,40,-10]];
const ps=P.map(([x,y,r],i)=>{ const b=blk({x:0,y:0,w:120,h:150,r:10,d:6,k:i==3?'l':'g',top:[0,1,2,3].map(j=>bar(16,22+j*18,j==3?50:86,6,i==3?'#D3CEC6':'#A9A49D')).join('')});
  anim(b,[{offset:0,transform:`translate(${x}px,${y}px) rotateZ(${r}deg)`},{offset:.2,transform:`translate(${x}px,${y}px) rotateZ(${r}deg)`,easing:'cubic-bezier(.5,0,.2,1)'},{offset:.45,transform:'translate(0px,0px) rotateZ(0deg)'},{offset:.82,transform:'translate(0px,0px) rotateZ(0deg)',easing:'cubic-bezier(.5,0,.2,1)'},{offset:1,transform:`translate(${x}px,${y}px) rotateZ(${r}deg)`}],T);
  b.lift.style.transform=`translateZ(${i*7}px)`; return b; });
const tab=blk({x:66,y:-40,w:20,h:40,r:6,d:8,k:'o',noShadow:true}); tab.lift.style.transform='translateZ(28px)'; pop(tab,.46,.82,T);
"""
STEPS['deck-2'] = r"""  // 기획을 세운다: 장마다 할 말과 근거가 차례로 쌓인다
const T=6;
blk({x:0,y:30,w:230,h:170,r:22,d:12,k:'l'});
const R=[['o',-30,150],['d',20,170],['g',70,120]];
R.forEach(([k,y,w],i)=>{ const b=blk({x:-(170-w)/2,y,w,h:34,r:10,d:10,k,noShadow:true}); b.lift.style.transform='translateZ(12px)';
  anim(b,[{offset:0,transform:'scaleX(0)'},{offset:.12+i*.14,transform:'scaleX(0)',easing:'cubic-bezier(.3,0,.2,1)'},{offset:.24+i*.14,transform:'scaleX(1)'},{offset:.84,transform:'scaleX(1)',easing:'ease-in'},{offset:.94,transform:'scaleX(0)'},{offset:1,transform:'scaleX(0)'}],T); });
"""
STEPS['deck-3'] = r"""  // 와이어프레임을 잡는다: 12칸 틀 위에 제목·도식·표 자리가 칸에 맞춰 놓인다
const T=6;
blk({x:0,y:0,w:250,h:180,r:16,d:12,k:'l',top:Array.from({length:13},(_,i)=>`<div class="p" style="left:${10+i*19}px;top:10px;width:1px;height:160px;border-radius:0;background:#E2DED8"></div>`).join('')});
const B=[[-40,-55,150,26,'d'],[-55,10,120,70,'o'],[60,10,96,70,'g']];
B.forEach(([x,y,w,h,k],i)=>{ const b=blk({x,y,w,h,r:6,d:10,k,noShadow:true});
  anim(b.lift,[{offset:0,transform:'translateZ(90px)',opacity:0},{offset:.12+i*.14,transform:'translateZ(90px)',opacity:0,easing:'cubic-bezier(.3,0,.2,1.2)'},{offset:.24+i*.14,transform:'translateZ(12px)',opacity:1},{offset:.84,transform:'translateZ(12px)',opacity:1,easing:'ease-in'},{offset:.94,transform:'translateZ(90px)',opacity:0},{offset:1,transform:'translateZ(90px)',opacity:0}],T); });
"""
STEPS['deck-4'] = r"""  // 디자인 시안을 고른다: A·B 두 장 중 하나가 올라와 확정
const T=6;
const a=blk({x:-70,y:0,w:120,h:160,r:16,d:16,k:'l',top:bar(16,18,60,10,'#2B2A28')+bar(16,40,88,60,'#ECE9E4',8)});
const b=blk({x:70,y:0,w:120,h:160,r:16,d:16,k:'l',top:bar(16,18,60,10,'#2B2A28')+bar(16,40,88,60,'#E8E4DF',8)+'<div class="p" style="left:0;top:0;right:0;height:6px;border-radius:16px 16px 0 0;background:#E2622B"></div>'});
anim(b.lift,[{offset:0,transform:'translateZ(0px)'},{offset:.3,transform:'translateZ(0px)',easing:'cubic-bezier(.3,0,.2,1)'},{offset:.42,transform:'translateZ(30px)'},{offset:.84,transform:'translateZ(30px)',easing:'ease-in'},{offset:.94,transform:'translateZ(0px)'},{offset:1,transform:'translateZ(0px)'}],T);
anim(a.top,[{offset:0,filter:'none'},{offset:.32,filter:'none'},{offset:.42,filter:'grayscale(1) brightness(.92)'},{offset:.84,filter:'grayscale(1) brightness(.92)'},{offset:.94,filter:'none'},{offset:1,filter:'none'}],T);
const ck=blk({x:110,y:60,w:46,h:46,r:12,d:10,k:'d',noShadow:true,top:'<svg viewBox="0 0 24 24" style="position:absolute;left:11px;top:11px;width:24px;height:24px" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>'});
ck.lift.style.transform='translateZ(48px)'; pop(ck,.42,.84,T);
"""
STEPS['deck-5'] = r"""  // 장표를 완성한다: 장들이 한 장씩 채워지고, 진행 중에도 지금까지 받을 수 있다
const T=7;
const N=4, sl=[];
for(let i=0;i<N;i++){ const b=blk({x:-60+i*0,y:-90+i*62,w:170,h:52,r:10,d:10,k:'l',top:'<div class="ly f">'+bar(12,12,50,8,'#2B2A28')+bar(12,28,80,6,'#D3CEC6')+'<div class="p" style="left:128px;top:12px;width:28px;height:28px;border-radius:7px;background:#BDB8B1"></div></div>'});
  const f=b.top.querySelector('.f'); anim(f,[{offset:0,opacity:0},{offset:.1+i*.15,opacity:0},{offset:.16+i*.15,opacity:1},{offset:.86,opacity:1},{offset:.94,opacity:0},{offset:1,opacity:0}],T); sl.push(b); }
// 진행 막대
const rail=blk({x:80,y:2,w:16,h:240,r:8,d:8,k:'g'});
const fill=blk({x:80,y:-118,w:16,h:240,r:8,d:10,k:'o',noShadow:true});
anim(fill,[{offset:0,transform:'translateY(0px) scaleY(0)'},{offset:.1,transform:'translateY(0px) scaleY(0)'},{offset:.7,transform:'translateY(120px) scaleY(1)'},{offset:.86,transform:'translateY(120px) scaleY(1)'},{offset:.94,transform:'translateY(0px) scaleY(0)'},{offset:1,transform:'translateY(0px) scaleY(0)'}],T);
fill.lift.firstElementChild&&0;
"""
STEPS['deck-6'] = r"""  // 대본까지 받는다: 장표 옆에 말풍선 대본이 붙는다
const T=6;
blk({x:-50,y:30,w:180,h:120,r:14,d:14,k:'l',top:bar(16,16,70,10,'#2B2A28')+[0,1,2].map(i=>bar(16+i*30,96-(i+1)*18,18,(i+1)*18,'#C9C4BD',3)).join('')});
const bub=blk({x:70,y:-60,w:170,h:110,r:26,d:16,k:'l',top:'<div class="ly ln"></div>'});
const L=bub.top.querySelector('.ln');
[[0,130,'#E2622B'],[1,110,'#C9C4BD'],[2,80,'#C9C4BD']].forEach(([i,w,c])=>{ const d=document.createElement('div'); d.className='p'; d.style.cssText=`left:20px;top:${26+i*24}px;width:${w}px;height:10px;border-radius:5px;background:${c};transform-origin:0 50%`; L.appendChild(d);
  anim(d,[{offset:0,transform:'scaleX(0)'},{offset:.3+i*.1,transform:'scaleX(0)'},{offset:.4+i*.1,transform:'scaleX(1)'},{offset:.86,transform:'scaleX(1)'},{offset:.94,transform:'scaleX(0)'},{offset:1,transform:'scaleX(0)'}],T); });
pop(bub,.14,.9,T); bub.lift.style.transform='translateZ(20px)';
"""

# ── powerMock · 사용 흐름
STEPS['mock-1'] = r"""  // 연결: 두 블록이 맞물린다
const T=6;
const a=blk({x:0,y:0,w:110,h:110,r:26,d:26,k:'g'});
const b=blk({x:0,y:0,w:110,h:110,r:26,d:26,k:'d',top:'<div class="p" style="left:0;top:40px;width:10px;height:30px;border-radius:0 6px 6px 0;background:#E2622B"></div>'});
anim(a,[{offset:0,transform:'translate(-110px,0px)'},{offset:.2,transform:'translate(-110px,0px)',easing:'cubic-bezier(.5,0,.2,1)'},{offset:.42,transform:'translate(-56px,0px)'},{offset:.84,transform:'translate(-56px,0px)',easing:'cubic-bezier(.5,0,.2,1)'},{offset:1,transform:'translate(-110px,0px)'}],T);
anim(b,[{offset:0,transform:'translate(110px,0px)'},{offset:.2,transform:'translate(110px,0px)',easing:'cubic-bezier(.5,0,.2,1)'},{offset:.42,transform:'translate(56px,0px)'},{offset:.84,transform:'translate(56px,0px)',easing:'cubic-bezier(.5,0,.2,1)'},{offset:1,transform:'translate(110px,0px)'}],T);
const dot=blk({x:0,y:-80,w:22,h:22,r:11,d:8,k:'o',noShadow:true}); dot.lift.style.transform='translateZ(40px)'; pop(dot,.44,.82,T);
"""
STEPS['mock-2'] = r"""  // 요청: 말풍선에 요청이 적히고 보낸다
const T=6;
const bub=blk({x:0,y:0,w:240,h:150,r:30,d:18,k:'l',top:'<div class="p" style="left:24px;top:30px;width:192px;height:20px;border-radius:10px;background:#E4E1DC"></div><div class="p ty" style="left:24px;top:30px;width:150px;height:20px;border-radius:10px;background:#BDB8B1;transform-origin:0 50%"></div>'});
anim(bub.top.querySelector('.ty'),[{offset:0,transform:'scaleX(0)'},{offset:.12,transform:'scaleX(0)'},{offset:.45,transform:'scaleX(1)'},{offset:.86,transform:'scaleX(1)'},{offset:.94,transform:'scaleX(0)'},{offset:1,transform:'scaleX(0)'}],T);
const send=blk({x:-20,y:40,w:150,h:30,r:15,d:10,k:'o',noShadow:true}); send.lift.style.transform='translateZ(18px)';
anim(send.lift,[{offset:0,transform:'translateZ(18px)'},{offset:.52,transform:'translateZ(18px)'},{offset:.56,transform:'translateZ(10px)'},{offset:.62,transform:'translateZ(18px)'},{offset:1,transform:'translateZ(18px)'}],T);
"""
STEPS['mock-3'] = r"""  // 판정: 점수가 기준을 넘을 때까지 바늘이 오른다
const T=6;
blk({x:-20,y:-10,w:190,h:230,r:16,d:14,k:'l',top:bar(16,16,158,16,'#2B2A28',4)+bar(16,44,74,60,'#E4E1DC',6)+bar(100,48,74,7,'#D3CEC6')+bar(100,62,60,7,'#D3CEC6')+bar(16,116,158,7,'#D3CEC6')+bar(16,130,130,7,'#D3CEC6')});
const g=blk({x:70,y:80,w:96,h:96,r:48,d:16,k:'d',top:'<svg viewBox="0 0 96 96" style="position:absolute;inset:0"><circle cx="48" cy="48" r="30" fill="none" stroke="#4A4744" stroke-width="7"/><circle class="arc" cx="48" cy="48" r="30" fill="none" stroke="#E2622B" stroke-width="7" stroke-linecap="round" stroke-dasharray="188.5" stroke-dashoffset="188.5" transform="rotate(-90 48 48)"/></svg>'});
g.lift.style.transform='translateZ(16px)';
anim(g.top.querySelector('.arc'),[{offset:0,strokeDashoffset:188.5},{offset:.12,strokeDashoffset:188.5},{offset:.4,strokeDashoffset:60},{offset:.48,strokeDashoffset:60},{offset:.64,strokeDashoffset:12},{offset:.86,strokeDashoffset:12},{offset:.94,strokeDashoffset:188.5},{offset:1,strokeDashoffset:188.5}],T);
"""
STEPS['mock-4'] = r"""  // 게시: 통과한 화면이 주소로 공유되어 날아간다
const T=6;
blk({x:-40,y:20,w:170,h:210,r:16,d:14,k:'l',top:bar(16,16,138,14,'#2B2A28',4)+bar(16,40,138,70,'#E4E1DC',8)+bar(16,122,100,7,'#D3CEC6')+bar(16,136,120,7,'#D3CEC6')});
const ln=blk({x:-40,y:-30,w:70,h:34,r:17,d:10,k:'d',noShadow:true,top:'<div class="p" style="left:14px;top:12px;width:42px;height:10px;border-radius:5px;border:3px solid #EEEBE6;box-sizing:border-box"></div>'});
ln.lift.style.transform='translateZ(18px)'; pop(ln,.12,.86,T);
const pl=blk({x:30,y:-20,w:46,h:46,r:10,d:10,k:'o',noShadow:true});
anim(pl,[{offset:0,transform:'translate(0px,0px) scale(0)'},{offset:.3,transform:'translate(0px,0px) scale(0)'},{offset:.36,transform:'translate(0px,0px) scale(1)',easing:'cubic-bezier(.5,0,.3,1)'},{offset:.72,transform:'translate(120px,-120px) scale(1)'},{offset:.8,transform:'translate(140px,-140px) scale(0)'},{offset:1,transform:'translate(140px,-140px) scale(0)'}],T);
anim(pl.lift,[{offset:0,transform:'translateZ(20px)'},{offset:.36,transform:'translateZ(20px)'},{offset:.72,transform:'translateZ(110px)'},{offset:1,transform:'translateZ(110px)'}],T);
"""

# ── powerGuide · 적용 순서
STEPS['guide-1'] = r"""  // 토큰을 가져온다: 견본 줄에서 주황 토큰 하나를 꺼내 쓴다
const T=6, C=[['#F6F4F0','#D3CFC8'],['#E2DED8','#BFBAB2'],['#C9C5BF','#A5A099'],['#F2803F','#A9421A'],['#8F8B86','#6E6A65']];
C.forEach(([c,s],i)=>{ const k=blk({x:-120+i*60,y:-30,w:52,h:110,r:10,d:16,k:'l'}); k.style.setProperty('--top',`linear-gradient(140deg,${c},${c})`); k.style.setProperty('--side',s);
  if(i===3){ anim(k,[{offset:0,transform:'translate(0px,0px)'},{offset:.2,transform:'translate(0px,0px)',easing:'cubic-bezier(.5,0,.2,1)'},{offset:.42,transform:'translate(0px,130px)'},{offset:.82,transform:'translate(0px,130px)',easing:'cubic-bezier(.5,0,.2,1)'},{offset:.96,transform:'translate(0px,0px)'},{offset:1,transform:'translate(0px,0px)'}],T);
    anim(k.lift,[{offset:0,transform:'translateZ(0px)'},{offset:.2,transform:'translateZ(0px)'},{offset:.31,transform:'translateZ(40px)'},{offset:.42,transform:'translateZ(0px)'},{offset:.82,transform:'translateZ(0px)'},{offset:.89,transform:'translateZ(40px)'},{offset:.96,transform:'translateZ(0px)'},{offset:1,transform:'translateZ(0px)'}],T); } });
blk({x:-20,y:120,w:150,h:70,r:16,d:12,k:'d'});
"""
STEPS['guide-2'] = r"""  // 부품을 고른다: 부품 판에서 하나를 집어 든다
const T=6;
blk({x:0,y:10,w:240,h:180,r:24,d:16,k:'g',top:bar(20,22,90,40,'#D9D5CF',10)+bar(124,22,96,18,'#D9D5CF',9)+bar(124,48,70,14,'#D9D5CF',7)+bar(20,80,200,16,'#D9D5CF',8)+bar(20,110,140,16,'#D9D5CF',8)});
const pc=blk({x:40,y:-50,w:80,h:30,r:15,d:12,k:'o',noShadow:true});
anim(pc.lift,[{offset:0,transform:'translateZ(16px)'},{offset:.24,transform:'translateZ(16px)',easing:'cubic-bezier(.3,0,.2,1)'},{offset:.44,transform:'translateZ(90px)'},{offset:.74,transform:'translateZ(90px)',easing:'cubic-bezier(.5,0,.6,1)'},{offset:.9,transform:'translateZ(16px)'},{offset:1,transform:'translateZ(16px)'}],T);
"""
STEPS['guide-3'] = r"""  // KRDS 로 대조한다: 양쪽을 맞대 보고 빠진 하나를 채운다
const T=6;
const L=blk({x:-80,y:0,w:120,h:150,r:16,d:16,k:'l',top:[0,1,2].map(i=>bar(18,24+i*36,84,22,'#E4E1DC',6)).join('')});
const R=blk({x:80,y:0,w:120,h:150,r:16,d:16,k:'l',top:[0,1].map(i=>bar(18,24+i*36,84,22,'#E4E1DC',6)).join('')+'<div class="p miss" style="left:18px;top:96px;width:84px;height:22px;border-radius:6px;border:2px dashed #BDB8B1;box-sizing:border-box"></div>'});
const fillB=blk({x:80,y:32,w:84,h:22,r:6,d:8,k:'o',noShadow:true});
anim(fillB.lift,[{offset:0,transform:'translateZ(90px)',opacity:0},{offset:.36,transform:'translateZ(90px)',opacity:0,easing:'cubic-bezier(.3,0,.2,1.2)'},{offset:.5,transform:'translateZ(16px)',opacity:1},{offset:.84,transform:'translateZ(16px)',opacity:1},{offset:.94,transform:'translateZ(90px)',opacity:0},{offset:1,transform:'translateZ(90px)',opacity:0}],T);
const ar=blk({x:0,y:0,w:40,h:22,r:11,d:10,k:'d',noShadow:true}); ar.lift.style.transform='translateZ(20px)';
anim(ar,[{transform:'scaleX(1)'},{transform:'scaleX(1.35)'},{transform:'scaleX(1)'}],1.5,{easing:'ease-in-out'});
"""
STEPS['guide-4'] = r"""  // 접근성 결과를 본다: 판정표에서 항목이 하나씩 확인되고, 사이트 담당 항목 하나가 남는다
const T=6;
const bd=blk({x:0,y:0,w:170,h:230,r:22,d:16,k:'l'});
for(let i=0;i<4;i++){ const y=-75+i*50; const last=i===3;
  const box=blk({x:-45,y,w:34,h:34,r:8,d:8,k:last?'l':'d',noShadow:true,top:last?'<div class="p" style="inset:4px;border-radius:5px;border:3px solid #E2622B"></div>':'<svg viewBox="0 0 24 24" style="position:absolute;left:5px;top:5px;width:24px;height:24px" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path class="c" d="m5 12 5 5 9-10" stroke-dasharray="24" stroke-dashoffset="24"/></svg>'});
  box.lift.style.transform='translateZ(16px)';
  blk({x:25,y,w:70,h:10,r:5,d:4,k:'g',noShadow:true}).lift.style.transform='translateZ(16px)';
  if(!last) anim(box.top.querySelector('.c'),[{offset:0,strokeDashoffset:24},{offset:.14+i*.16,strokeDashoffset:24},{offset:.22+i*.16,strokeDashoffset:0},{offset:.86,strokeDashoffset:0},{offset:.94,strokeDashoffset:24},{offset:1,strokeDashoffset:24}],T);
  else anim(box.lift,[{offset:0,transform:'translateZ(16px)'},{offset:.66,transform:'translateZ(16px)'},{offset:.72,transform:'translateZ(30px)'},{offset:.8,transform:'translateZ(16px)'},{offset:1,transform:'translateZ(16px)'}],T); }
"""
