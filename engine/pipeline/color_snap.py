# -*- coding: utf-8 -*-
# 출처: powerPlus/tools/ppt-pipeline/color_snap.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
"""근접색을 팔레트로 스냅. 인자: <src> <dst|-> [임계]
- dst 가 '-' 면 시뮬레이션(파일 저장 안 함). 노란 메모·분홍 말풍선 제외."""
import sys, io, collections
from pptx import Presentation
NS="{http://schemas.openxmlformats.org/drawingml/2006/main}"
src=sys.argv[1]; dst=sys.argv[2]; TH=float(sys.argv[3]) if len(sys.argv)>3 else 70.0
PAL={"navy":"002060","teal":"255A7B","indigo":"3A46A0","blue":"0456B6","azure":"1973D1",
     "cyan":"00B0F0","steel":"658EBB","mist":"C0D2E6","tint":"DEEBF7","near":"F2F7FC",
     "red":"EB696D","crimson":"C00000","pink":"FF3370","orange":"F78E3F",
     "green":"008400","haze":"A2AAC2","sky":"5FC8F7",
     "ink":"404040","ink2":"4D4D4D","slate":"4E5B6F","gray":"D3D3D3","silver":"808080",
     "white":"FFFFFF","black":"000000"}
NEUTRAL={"ink","ink2","slate","gray","silver","white","black"}
# 자동 판정이 어색한 것만 손으로 고정(깊은 적색은 분홍이 아니라 crimson)
OVERRIDE={"CA253E":"C00000","88B2D8":"658EBB"}
KEEPHEX={"FFFF00","FFFFCC","FFFF99","FFFF87"}
def rgb(h): return (int(h[0:2],16),int(h[2:4],16),int(h[4:6],16))
def dist(a,b):
    ra,rb=rgb(a),rgb(b)
    rm=(ra[0]+rb[0])/2
    dr,dg,db=ra[0]-rb[0],ra[1]-rb[1],ra[2]-rb[2]
    return ((2+rm/256)*dr*dr + 4*dg*dg + (2+(255-rm)/256)*db*db) ** 0.5
import colorsys
def sat(h):
    r,g,b=[x/255 for x in rgb(h)]
    return colorsys.rgb_to_hls(r,g,b)[2]
def hue(h):
    r,g,b=[x/255 for x in rgb(h)]
    return colorsys.rgb_to_hls(r,g,b)[0]*360
def hgap(a,b):
    d=abs(hue(a)-hue(b)) % 360
    return min(d, 360-d)
def snap(h):
    h=h.upper()
    if h in KEEPHEX: return None
    if h in PAL.values(): return None
    if h in OVERRIDE:
        v=OVERRIDE[h]; return (v, 0.0, [k for k,x in PAL.items() if x==v][0])
    sh_=sat(h)
    cand=[]
    for t,v in PAL.items():
        # 채도 가드: 유채색을 무채색 토큰으로(또는 그 반대로) 보내지 않는다
        if sh_>=0.18 and t in NEUTRAL: continue
        if sh_<0.10 and t not in NEUTRAL: continue
        d=dist(h,v)
        if sh_>=0.18 and sat(v)>=0.18: d += hgap(h,v)*1.6   # 색상(hue) 차이에 벌점
        cand.append((d, v, t))
    if not cand: return None
    d,v,t=min(cand)
    return (v,d,t) if d<=TH else None
p=Presentation(src)
moved=collections.Counter(); kept=collections.Counter(); skipped=0
def is_memo(sh):
    try:
        if sh.fill.type==1 and str(sh.fill.fore_color.rgb) in KEEPHEX: return True
    except Exception: pass
    return "말풍선" in sh.name and sh.has_text_frame and "디자인" in sh.text_frame.text
def do(el):
    # 그라데이션 스톱은 건드리지 않는다 — 여러 스톱이 한 색으로 뭉쳐 평면이 된다
    # (lxml 프록시는 매번 새로 만들어져 id() 로는 식별할 수 없다 → 조상 태그로 판정)
    def in_grad(node):
        n=node.getparent()
        while n is not None:
            if n.tag == NS+"gsLst": return True
            n=n.getparent()
        return False
    for c in el.iter(NS+"srgbClr"):
        if in_grad(c): continue
        v=(c.get("val") or "").upper()
        if len(v)!=6: continue
        s=snap(v)
        if s: moved[(v,s[0],s[2])]+=1;  c.set("val", s[0]) if dst!="-" else None
        else: kept[v]+=1
def walk(shapes):
    global skipped
    for sh in shapes:
        if is_memo(sh): skipped+=1; continue
        if str(sh.shape_type).startswith("GROUP"): walk(sh.shapes); continue
        do(sh._element)
for s in p.slides: walk(s.shapes)
if dst!="-": p.save(dst)
o=io.open("color_log.txt","w",encoding="utf-8")
o.write("임계 %.0f · 제외도형 %d\n이동 %d회(%d종) · 유지 %d회(%d종)\n\n"%(TH,skipped,sum(moved.values()),len(moved),sum(kept.values()),len(kept)))
bytok=collections.defaultdict(list)
for (a,b,t),v in moved.items(): bytok[t].append((v,a))
for t in sorted(bytok, key=lambda t:-sum(x[0] for x in bytok[t])):
    items=sorted(bytok[t],reverse=True)
    o.write("%-8s #%s ← %s\n"%(t,PAL[t]," ".join("#%s(%d)"%(a,v) for v,a in items[:10])))
o.write("\n### 유지(팔레트에서 멀어 그대로) 상위 30\n")
for k,v in kept.most_common(30): o.write("%5d #%s\n"%(v,k))
o.close(); print("moved",sum(moved.values()),"kept-kinds",len(kept))
