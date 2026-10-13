# 출처: powerPlus/tools/ppt-pipeline/band_pair_scan.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
import sys
from pptx import Presentation
sys.stdout.reconfigure(encoding="utf-8")
A="{http://schemas.openxmlformats.org/drawingml/2006/main}";P="{http://schemas.openxmlformats.org/presentationml/2006/main}";E=914400
p=Presentation(sys.argv[1])
def flat(shapes, tf=(0,0,1,1)):
    ox,oy,sx,sy=tf
    for s in shapes:
        if s.width is None: continue
        if s.shape_type==6:
            x=s._element.find(P+"grpSpPr").find(A+"xfrm"); co,ce=x.find(A+"chOff"),x.find(A+"chExt")
            kx=s.width/int(ce.get("cx")) if int(ce.get("cx")) else 1; ky=s.height/int(ce.get("cy")) if int(ce.get("cy")) else 1
            gx,gy=ox+s.left*sx,oy+s.top*sy
            yield from flat(s.shapes,(gx-int(co.get("x"))*kx*sx,gy-int(co.get("y"))*ky*sy,sx*kx,sy*ky))
        else: yield s,ox+s.left*sx,oy+s.top*sy,s.width*sx,s.height*sy
def fc(s):
    sp=s._element.find(P+"spPr")
    if sp is None: return None
    f=sp.find(A+"solidFill")
    if f is not None and len(f) and f[0].tag==A+"srgbClr": return f[0].get("val")
def rgb(c): return int(c[:2],16),int(c[2:4],16),int(c[4:],16)
def lum(c): r,g,b=rgb(c); return 0.3*r+0.59*g+0.11*b
for n,sl in enumerate(p.slides,1):
  c=[t for t in flat(sl.shapes) if fc(t[0]) and lum(fc(t[0]))<170 and 0.18*E<t[4]<0.75*E and t[3]>1.2*E and t[2]>1.3*E and t[0].shape_type!=13]
  for a in c:
    for b in c:
      if b[1]<=a[1]+a[3]-0.05*E or abs(b[2]-a[2])>0.06*E or abs(b[4]-a[4])>0.06*E: continue
      if b[1]-(a[1]+a[3])>1.2*E: continue
      d=max(abs(x-y) for x,y in zip(rgb(fc(a[0])),rgb(fc(b[0]))))
      if d<=12:
        # 사이에 같은 줄 다른 띠 없는 바로 이웃만
        print(n,a[0].name,fc(a[0]),"|",b[0].name,fc(b[0]),round(a[2]/E,2),round(a[3]/E,2),round(b[3]/E,2),repr(a[0].text_frame.text[:10] if a[0].has_text_frame else ''))
