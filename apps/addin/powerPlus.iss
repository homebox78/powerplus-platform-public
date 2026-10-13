; powerPlus 자산 라이브러리 — 설치 프로그램 (Inno Setup)
; 사용자별 설치(관리자 권한 불필요). 더블클릭으로 간단 설치 + Windows 프로그램 제거에 등록.

[Setup]
AppId={{629c04eb-661e-43a4-abc4-21a298eb92db}
AppName=powerPlus 자산 라이브러리
AppVersion=1.0.0
AppPublisher=powerPlus
DefaultDirName={localappdata}\powerPlus
UninstallDisplayName=powerPlus 자산 라이브러리
DisableWelcomePage=yes
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
PrivilegesRequired=lowest
OutputDir=.
OutputBaseFilename=powerPlus_Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "default"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "install\manifest.xml"; DestDir: "{app}"; Flags: ignoreversion

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Office\16.0\WEF\Developer"; Flags: uninsdeletekeyifempty
Root: HKCU; Subkey: "Software\Microsoft\Office\16.0\WEF\Developer"; ValueType: string; ValueName: "629c04eb-661e-43a4-abc4-21a298eb92db"; ValueData: "{app}\manifest.xml"; Flags: uninsdeletevalue

[Messages]
FinishedHeadingLabel=powerPlus 설치 완료
FinishedLabel=powerPlus 가 설치되었습니다.%n%nPowerPoint 를 완전히 종료한 뒤 다시 실행하면 [홈] 리본에 powerPlus 버튼이 나타납니다.%n버튼을 누르고 회사 이메일로 로그인하세요.
