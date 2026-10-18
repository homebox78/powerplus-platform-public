# powerDeck 변환 엔진(워커) 설치 점검 — 새 PC·서버에 워커를 올릴 때 한 번 돌린다.
#   powershell -ExecutionPolicy Bypass -File worker\setup.ps1            점검 + 파이썬 꾸러미·서체 설치
#   powershell -ExecutionPolicy Bypass -File worker\setup.ps1 -Startup   + 로그인 때 자동 실행 등록
# 고칠 수 없는 것(PowerPoint·Claude 로그인·config.json)은 무엇이 빠졌는지만 알려 준다.
param([switch]$Startup)
$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$bad = 0
function Ok($m) { Write-Host "  [확인] $m" -ForegroundColor Green }
function No($m) { Write-Host "  [필요] $m" -ForegroundColor Yellow; $script:bad++ }

Write-Host "1. 파이썬"
$py = (Get-Command py -ErrorAction SilentlyContinue)
if (-not $py) { $py = (Get-Command python -ErrorAction SilentlyContinue) }
if ($py) {
    Ok "$($py.Source)"
    & $py.Source -m pip install --quiet --disable-pip-version-check python-pptx pywin32 lxml pillow pypdf python-docx openpyxl olefile pdfplumber
    if ($LASTEXITCODE -eq 0) { Ok "꾸러미: python-pptx pywin32 lxml pillow pypdf python-docx openpyxl olefile" } else { No "pip 설치 실패 — 위 오류를 확인하세요" }
} else { No "파이썬이 없습니다 — https://www.python.org 에서 설치(3.11 이상)" }

Write-Host "2. PowerPoint (렌더·글 위치 실측에 필요)"
try { $pp = New-Object -ComObject PowerPoint.Application; Ok "PowerPoint $($pp.Version)"; $pp.Quit() } catch { No "PowerPoint 가 없습니다 — Microsoft 365/Office 를 설치하고 한 번 실행해 정품 인증까지 마치세요" }

Write-Host "3. Claude Code CLI (장표 제작·기획)"
$cl = (Get-Command claude -ErrorAction SilentlyContinue)
if ($cl) { Ok "$($cl.Source) — $(& $cl.Source --version 2>$null)"; Write-Host "       로그인은 직접: 터미널에서 claude 를 실행해 /login (또는 config.json 의 anthropic_api_key)" }
else { No "claude 가 없습니다 — Node.js 설치 후: npm i -g @anthropic-ai/claude-code" }

Write-Host "4. 서체 (a시월구일 1~4 · G마켓 산스, 대체 Asta Sans)"
if ($py) { & $py.Source (Join-Path $here 'fonts_install.py'); if ($LASTEXITCODE -eq 0) { Ok "G마켓 산스·Asta Sans 설치됨" } else { No "서체 설치 실패" } }
$fk = @('HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts', 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts')
$siwol = @(1..4 | Where-Object { $n = "a시월구일$_ (TrueType)"; $fk | Where-Object { (Get-ItemProperty $_ -ErrorAction SilentlyContinue).$n } })
if ($siwol.Count -eq 4) { Ok "a시월구일 1~4 설치됨 — 장표 본문 서체" } else { No "a시월구일 1~4 가 없습니다($($siwol.Count)/4) — 회사 서체를 설치하세요. 없으면 Asta Sans 로 대신 만듭니다" }

Write-Host "5. 설정 (worker\config.json)"
$cfgPath = Join-Path $here 'config.json'
if (Test-Path $cfgPath) {
    $cfg = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
    Ok "서버: $($cfg.api_base) · 이름: $($cfg.name) · 동시 작업: $($cfg.slots)"
    foreach ($k in 'pipeline_dir', 'skill_dir') { if (Test-Path $cfg.$k) { Ok "$k = $($cfg.$k)" } else { No "$k 폴더가 없습니다: $($cfg.$k) — powerPlus 저장소를 받아 두세요" } }
    if ($cfg.worker_key -match '서버|^$') { No "worker_key 가 비어 있습니다 — 서버 api/config/config.php 의 worker_key 와 같은 값" }
    try { $h = Invoke-RestMethod -Uri ($cfg.api_base + '/health') -TimeoutSec 10; if ($h.ok) { Ok "서버 응답 정상" } } catch { No "서버에 닿지 않습니다: $($cfg.api_base)/health" }
} else { No "config.json 이 없습니다 — config.example.json 을 복사해 api_base·worker_key·경로를 채우세요" }

if ($Startup) {
    $lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'powerDeck 엔진.lnk'
    $s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
    $s.TargetPath = Join-Path $here 'start.bat'; $s.WorkingDirectory = $here; $s.WindowStyle = 7; $s.Save()
    Ok "로그인 때 자동 실행 등록: $lnk"
}

Write-Host ""
if ($bad -eq 0) { Write-Host "준비 끝 — worker\start.bat 을 실행하면 엔진이 켜집니다." -ForegroundColor Green }
else { Write-Host "빠진 것 $bad 개 — 위 [필요] 항목을 채운 뒤 다시 돌려 주세요." -ForegroundColor Yellow }
