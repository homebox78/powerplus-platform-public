// 검수용 컨택트시트: 파워플러스 안 근접 쌍(pp_near) — node db/migrate-legacy/sheet-pp-near.mjs <out.png>. 썸네일 폴더(T) 경로는 PC 마다 바꿀 것.
import sharp from "sharp"; import { readFileSync } from "node:fs";
const d=JSON.parse(readFileSync("db/migrate-legacy/data/dedupe.json","utf8"));
const T="C:/Users/<사용자>/AppData/Local/Temp/pp_thumbs/uploads";
const pp=JSON.parse(readFileSync("db/migrate-legacy/data/pp-phash.json","utf8")); const ppPath=Object.fromEntries(Object.keys(pp).map(p=>[p.replace(/^.*\//,'').replace(/\.[a-z0-9]+$/i,''),p]));
const sel=d.pp_near.filter(m=>m[2]>=+process.argv[2]&&m[2]<=+process.argv[3]).slice(0,48); const W=120, cols=8; const tiles=[];
for (let i=0;i<sel.length;i++){const [x,y,dd]=sel[i];
  const a=await sharp(`${T}/${ppPath[x]}`).flatten({background:"#fff"}).resize(W,W,{fit:"contain",background:"#fff"}).png().toBuffer();
  const b=await sharp(`${T}/${ppPath[y]}`).flatten({background:"#fff"}).resize(W,W,{fit:"contain",background:"#fff"}).png().toBuffer();
  const lab=Buffer.from(`<svg width="${W*2}" height="16"><rect width="${W*2}" height="16" fill="#036"/><text x="3" y="12" font-size="10" fill="#fff" font-family="sans-serif">${i} d${dd} ${x} ${y}</text></svg>`);
  tiles.push({input:await sharp({create:{width:W*2,height:W+16,channels:3,background:"#eee"}}).composite([{input:a,left:0,top:16},{input:b,left:W,top:16},{input:lab,left:0,top:0}]).png().toBuffer(),left:(i%cols)*(W*2+6),top:Math.floor(i/cols)*(W+22)});}
await sharp({create:{width:cols*(W*2+6),height:Math.max(1,Math.ceil(sel.length/cols))*(W+22),channels:3,background:"#999"}}).composite(tiles).png().toFile(process.argv[4]); console.log("near sheet",sel.length);
