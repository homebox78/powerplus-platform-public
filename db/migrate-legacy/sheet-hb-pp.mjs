// 검수용 컨택트시트: 홈박스↔파워플러스 후보 쌍을 나란히 — node db/migrate-legacy/sheet-hb-pp.mjs <lo> <hi> <out.png>. 썸네일 폴더(T)·홈박스 원본(HB) 경로는 PC 마다 바꿀 것.
import sharp from "sharp"; import { readFileSync } from "node:fs";
const d=JSON.parse(readFileSync("db/migrate-legacy/data/dedupe.json","utf8"));
const T="C:/Users/<사용자>/AppData/Local/Temp/pp_thumbs/uploads"; const HB="D:/homebox-handoff/design/sample-assets/originals";
const hb=JSON.parse(readFileSync("db/migrate-legacy/data/hb-phash.json","utf8")); const hbPath=Object.fromEntries(Object.keys(hb).map(p=>[p.replace(/^.*\//,'').replace(/\.[a-z0-9]+$/i,''),p]));
const pp=JSON.parse(readFileSync("db/migrate-legacy/data/pp-phash.json","utf8")); const ppPath=Object.fromEntries(Object.keys(pp).map(p=>[p.replace(/^.*\//,'').replace(/\.[a-z0-9]+$/i,''),p]));
const lo=+process.argv[2], hi=+process.argv[3], out=process.argv[4];
const sel=d.hb_pp.filter(m=>m.d>=lo&&m.d<=hi).sort(()=>Math.random()-0.5).slice(0,48);
const W=120, cols=8; const tiles=[];
for (let i=0;i<sel.length;i++){const m=sel[i];
  const a=await sharp(`${HB}/${hbPath[m.hb]}`).flatten({background:"#fff"}).resize(W,W,{fit:"contain",background:"#fff"}).png().toBuffer();
  const b=await sharp(`${T}/${ppPath[m.pp]}`).flatten({background:"#fff"}).resize(W,W,{fit:"contain",background:"#fff"}).png().toBuffer();
  const lab=Buffer.from(`<svg width="${W*2}" height="16"><rect width="${W*2}" height="16" fill="#c00"/><text x="3" y="12" font-size="11" fill="#fff" font-family="sans-serif">${i} d${m.d} a${m.a} ${m.pp}</text></svg>`);
  const pair=await sharp({create:{width:W*2,height:W+16,channels:3,background:"#eee"}}).composite([{input:a,left:0,top:16},{input:b,left:W,top:16},{input:lab,left:0,top:0}]).png().toBuffer();
  tiles.push({input:pair,left:(i%cols)*(W*2+6),top:Math.floor(i/cols)*(W+22)});}
await sharp({create:{width:cols*(W*2+6),height:Math.ceil(sel.length/cols)*(W+22),channels:3,background:"#999"}}).composite(tiles).png().toFile(out);
console.log("sheet",out,sel.length);
