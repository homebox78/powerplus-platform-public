// powerAssets 설치 마법사(exe) 빌드 — apps/addin/installer(.NET 8 WinForms + WebView2) → apps/addin/release/
//   1) 앱 아이콘(app.ico) 생성: 검정 사각 + Boxes(사이트 powerAssets 로고와 같은 모양)
//   2) dotnet publish 단일 exe(자체 포함, 압축)
//   3) release/powerAssets_Setup.exe 로 복사 + api/data/addin-setup.json(버전·크기·sha256·날짜) 기록
// 사용: node scripts/build-installer.mjs   (배포 스크립트가 release/ 를 /addin/ 으로 싣는다)
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const SRC = path.join(ROOT, 'apps/addin/installer');
const REL = path.join(ROOT, 'apps/addin/release');
const EXE = 'powerAssets_Setup.exe';

// ── 1) 아이콘
const BOXES = `<path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z"/><path d="m7 16.5-4.74-2.85"/><path d="m7 16.5 5-3"/><path d="M7 16.5v5.17"/><path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z"/><path d="m17 16.5-5-3"/><path d="m17 16.5 4.74-2.85"/><path d="M17 16.5v5.17"/><path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z"/><path d="M12 8 7.26 5.15"/><path d="m12 8 4.74-2.85"/><path d="M12 13.5V8"/>`;
function iconSvg(px) {
  // 작은 크기는 선을 조금 굵게(16px 에서 1.8 은 뭉개진다)
  const sw = px <= 16 ? 2.4 : px <= 32 ? 2.1 : 1.8;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 32 32">
<rect x="0" y="0" width="32" height="32" rx="7" fill="#111111"/>
<g transform="translate(5 5) scale(0.9166)" fill="none" stroke="#fff" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${BOXES}</g></svg>`);
}
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = await Promise.all(sizes.map((s) => sharp(iconSvg(s)).png().toBuffer()));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let off = head.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(s >= 256 ? 0 : s, e); head.writeUInt8(s >= 256 ? 0 : s, e + 1);
  head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(pngs[i].length, e + 8); head.writeUInt32LE(off, e + 12);
  off += pngs[i].length;
});
fs.writeFileSync(path.join(SRC, 'app.ico'), Buffer.concat([head, ...pngs]));
fs.writeFileSync(path.join(SRC, 'app-256.png'), pngs[pngs.length - 1]); // 검수용 미리보기

// ── 2) 빌드
const pub = path.join(SRC, 'bin', 'publish');
fs.rmSync(pub, { recursive: true, force: true });
execFileSync('dotnet', ['publish', 'PowerPlusInstaller.csproj', '-c', 'Release', '-r', 'win-x64', '--self-contained', 'true',
  '-p:PublishSingleFile=true', '-p:IncludeNativeLibrariesForSelfExtract=true', '-p:EnableCompressionInSingleFile=true',
  '-o', pub], { cwd: SRC, stdio: 'inherit' });

// ── 3) 결과 싣기
const built = path.join(pub, EXE);
if (!fs.existsSync(built)) throw new Error('빌드 결과가 없습니다: ' + built);
fs.mkdirSync(REL, { recursive: true });
fs.copyFileSync(built, path.join(REL, EXE));
const buf = fs.readFileSync(built);
const ver = (fs.readFileSync(path.join(SRC, 'PowerPlusInstaller.csproj'), 'utf8').match(/<Version>([^<]+)<\/Version>/) || [])[1] || '0.0.0';
const info = {
  url: '/addin/' + EXE,
  version: ver,
  size: buf.length,
  sha256: createHash('sha256').update(buf).digest('hex'),
  published: new Date().toISOString().slice(0, 10),
};
fs.writeFileSync(path.join(REL, 'setup.json'), JSON.stringify(info, null, 2) + '\n');
fs.mkdirSync(path.join(ROOT, 'api/data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'api/data/addin-setup.json'), JSON.stringify(info, null, 2) + '\n');
console.log('✔', EXE, (buf.length / 1048576).toFixed(1) + 'MB', 'v' + ver);
