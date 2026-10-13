// powerAssets 설치 마법사 — 출처: powerPlus installer/Program.cs. 설치 폴더 이름(powerPlus)은 기존 설치와 맞추려고 그대로 둔다.
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Win32;

namespace PowerPlusInstaller;

static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
    }
}

public class MainForm : Form
{
    const string GUID = "629c04eb-661e-43a4-abc4-21a298eb92db";
    const string WEF_KEY = @"Software\Microsoft\Office\16.0\WEF\Developer";

    const int BASE_W = 720, BASE_H = 532; // 디자인 기준(96 DPI) — 세로 +20px(설치 중 세로 스크롤 방지)
    readonly WebView2 _web = new();
    string _installPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "powerPlus");

    [DllImport("user32.dll")] static extern bool ReleaseCapture();
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, int msg, int wp, int lp);
    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int val, int size);
    [DllImport("gdi32.dll")] static extern IntPtr CreateRoundRectRgn(int x1, int y1, int x2, int y2, int w, int h);

    const int CS_DROPSHADOW = 0x20000;
    protected override CreateParams CreateParams
    {
        get { var cp = base.CreateParams; cp.ClassStyle |= CS_DROPSHADOW; return cp; } // 연한 시스템 그림자
    }

    void ApplyRoundedCorners()
    {
        int r = (int)Math.Round(8 * (DeviceDpi / 96.0)); // 8px (DPI 보정)
        if (Environment.OSVersion.Version.Build >= 22000)
        {
            int pref = 2; // DWMWCP_ROUND (Win11, 부드러운 AA 라운드 + 그림자)
            DwmSetWindowAttribute(Handle, 33, ref pref, sizeof(int));
        }
        else
        {
            Region = System.Drawing.Region.FromHrgn(CreateRoundRectRgn(0, 0, Width + 1, Height + 1, r * 2, r * 2)); // Win10 폴백
        }
    }

    // 창을 모니터 DPI에 맞춰 키운다(WebView2는 콘텐츠를 배율대로 렌더하므로 창도 같이 커져야 안 찌그러짐)
    void ApplyDpiSize()
    {
        double s = DeviceDpi / 96.0;
        int w = (int)Math.Round(BASE_W * s), h = (int)Math.Round(BASE_H * s);
        var wa = Screen.FromControl(this).WorkingArea; // 화면 작업영역 안으로 클램프
        w = Math.Min(w, wa.Width); h = Math.Min(h, wa.Height);
        ClientSize = new Size(w, h);
        Location = new Point(wa.Left + (wa.Width - Width) / 2, wa.Top + (wa.Height - Height) / 2);
    }

    protected override void OnDpiChanged(DpiChangedEventArgs e)
    {
        base.OnDpiChanged(e);
        ApplyDpiSize();      // 다른 배율 모니터로 옮길 때 재조정
        ApplyRoundedCorners();
    }

    public MainForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.None; // DPI 스케일은 ApplyDpiSize에서 직접(이중 스케일/미스케일 방지)
        ClientSize = new Size(BASE_W, BASE_H); // 임시 — Load에서 DeviceDpi로 보정
        BackColor = Color.White;
        Text = "powerAssets 설치 마법사";
        try { Icon = Icon.ExtractAssociatedIcon(Environment.ProcessPath!); } catch { }

        _web.Dock = DockStyle.Fill;
        Controls.Add(_web);
        Load += async (_, __) => { ApplyDpiSize(); ApplyRoundedCorners(); await InitAsync(); };
    }

    async Task InitAsync()
    {
        var dataDir = Path.Combine(Path.GetTempPath(), "powerPlus_setup_wv2");
        var env = await CoreWebView2Environment.CreateAsync(null, dataDir);
        await _web.EnsureCoreWebView2Async(env);
        var c = _web.CoreWebView2;
        c.Settings.AreDefaultContextMenusEnabled = false;
        c.Settings.IsZoomControlEnabled = false;
        c.Settings.AreDevToolsEnabled = false;
        c.WebMessageReceived += OnMessage;
        c.NavigationCompleted += (_, __) =>
        {
            Post(new { @event = "path", path = _installPath });
            Post(new { @event = "version", version = Application.ProductVersion.Split('+')[0] });
            var (status, label) = DetectOffice();        // Office 버전 감지 → 미지원이면 안내
            Post(new { @event = "office", status, label });
        };
        // 제목 글꼴(Momo Trust Display)은 exe 안에 넣고 base64 로 끼운다 — 인터넷이 막혀도 제목 모양이 같게.
        var html = ReadResource("installer.html").Replace("__MOMO_WOFF2__", Convert.ToBase64String(ReadResourceBytes("momo-v2.woff2")));
        c.NavigateToString(html);
    }

    void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        string raw;
        try { raw = e.TryGetWebMessageAsString(); } catch { return; }
        JsonElement m;
        try { m = JsonDocument.Parse(raw).RootElement; } catch { return; }
        var action = m.TryGetProperty("action", out var a) ? a.GetString() : null;
        switch (action)
        {
            case "drag":
                ReleaseCapture();
                SendMessage(Handle, 0xA1, 0x2, 0); // WM_NCLBUTTONDOWN, HTCAPTION
                break;
            case "close":
                Close();
                break;
            case "browse":
                BrowseFolder();
                break;
            case "install":
                _ = DoInstall(m);
                break;
            case "finish":
                var launch = m.TryGetProperty("launch", out var l) && l.ValueKind == JsonValueKind.True;
                if (launch) TryLaunchPowerPoint();
                Close();
                break;
        }
    }

    void BrowseFolder()
    {
        using var dlg = new FolderBrowserDialog { Description = "설치 위치 선택", UseDescriptionForTitle = true };
        try { dlg.SelectedPath = _installPath; } catch { }
        if (dlg.ShowDialog(this) == DialogResult.OK && !string.IsNullOrWhiteSpace(dlg.SelectedPath))
        {
            // 선택 폴더 아래 powerPlus 하위 폴더로 설치
            _installPath = dlg.SelectedPath.TrimEnd('\\').EndsWith("powerPlus", StringComparison.OrdinalIgnoreCase)
                ? dlg.SelectedPath
                : Path.Combine(dlg.SelectedPath, "powerPlus");
            Post(new { @event = "path", path = _installPath });
        }
    }

    async Task DoInstall(JsonElement m)
    {
        try
        {
            await Task.Run(() =>
            {
                Directory.CreateDirectory(_installPath);
                var manifestPath = Path.Combine(_installPath, "manifest.xml");
                File.WriteAllText(manifestPath, ReadResource("manifest.xml"), new System.Text.UTF8Encoding(false));
                // PowerPoint 웹 애드인 사이드로드 등록 (HKCU, 관리자 권한 불필요)
                // ⚠️ MS 공식 형식: 값 "이름=manifest 전체경로, 데이터=manifest 전체경로".
                //    (이름=GUID 형식은 Office가 재시작 시 정리해 애드인이 사라지는 원인)
                using var key = Registry.CurrentUser.CreateSubKey(WEF_KEY);
                try { key.DeleteValue(GUID, false); } catch { }            // 옛 형식 흔적 제거
                try { key.DeleteValue(manifestPath, false); } catch { }     // 중복 방지
                key.SetValue(manifestPath, manifestPath, RegistryValueKind.String);
            });
            await Task.Delay(900); // 진행 표시가 자연스럽도록 약간의 텀
            Post(new { @event = "done" });
        }
        catch (Exception ex)
        {
            Post(new { @event = "error", msg = ex.Message });
        }
    }

    void TryLaunchPowerPoint()
    {
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("powerpnt.exe") { UseShellExecute = true });
        }
        catch { /* PowerPoint 미설치 등 — 무시 */ }
    }

    // 설치된 Office 버전을 감지한다. powerPlus(React18 작업창)는 WebView2 엔진이 필요한
    //   Microsoft 365 / Office 2021·2019 이상에서만 동작 → 2016 등 구버전은 IE11 웹뷰라 미지원.
    //   status: "ok" 정상 / "unsupported" 구버전 / "none" 미감지. (감지 실패는 막지 않고 ok 처리)
    static (string status, string label) DetectOffice()
    {
        try
        {
            // 1) Click-to-Run (Microsoft 365 / 2019 / 2021 / 2024, 그리고 구형 C2R 2016)
            foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
            {
                using var hklm = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view);
                using var c2r = hklm.OpenSubKey(@"SOFTWARE\Microsoft\Office\ClickToRun\Configuration");
                if (c2r == null) continue;
                string ver = (c2r.GetValue("VersionToReport") as string)
                          ?? (c2r.GetValue("ClientVersionToReport") as string) ?? "";
                string ids = (c2r.GetValue("ProductReleaseIds") as string) ?? "";
                int build = ParseBuild(ver);                  // 16.0.<build>.x — 2016≈4266(<10000), 2019+≈10000+
                string label = OfficeLabel(ids, ver);
                bool modern = build >= 10000
                    || Has(ids, "2019") || Has(ids, "2021") || Has(ids, "2024")
                    || Has(ids, "365") || Has(ids, "O365") || Has(ids, "Microsoft365");
                bool old2016 = Has(ids, "2016") || (build > 0 && build < 10000);
                if (old2016 && !modern) return ("unsupported", label.Length > 0 ? label : "Office 2016");
                return ("ok", label);
            }
            // 2) ClickToRun 없음 = MSI(볼륨) 또는 구버전 — 16.0 MSI는 Office 2016 볼륨
            foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
            {
                using var hklm = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view);
                if (HasInstallRoot(hklm, "16.0")) return ("unsupported", "Office 2016 (MSI 볼륨)");
                if (HasInstallRoot(hklm, "15.0")) return ("unsupported", "Office 2013");
                if (HasInstallRoot(hklm, "14.0")) return ("unsupported", "Office 2010");
            }
            return ("none", "Office 미감지");
        }
        catch { return ("ok", ""); }   // 감지 자체 실패 시 설치를 막지 않는다
    }

    static bool Has(string s, string sub) => s.IndexOf(sub, StringComparison.OrdinalIgnoreCase) >= 0;

    static bool HasInstallRoot(RegistryKey hklm, string ver)
    {
        using var k = hklm.OpenSubKey($@"SOFTWARE\Microsoft\Office\{ver}\Common\InstallRoot");
        return k?.GetValue("Path") is string p && p.Length > 0;
    }

    static int ParseBuild(string ver)
    {
        var parts = (ver ?? "").Split('.');
        return parts.Length >= 3 && int.TryParse(parts[2], out var b) ? b : 0;
    }

    static string OfficeLabel(string ids, string ver)
    {
        if (Has(ids, "365") || Has(ids, "O365") || Has(ids, "Microsoft365")) return "Microsoft 365";
        if (Has(ids, "2024")) return "Office 2024";
        if (Has(ids, "2021")) return "Office 2021";
        if (Has(ids, "2019")) return "Office 2019";
        if (Has(ids, "2016")) return "Office 2016";
        return string.IsNullOrEmpty(ver) ? "Office" : "Office (" + ver + ")";
    }

    void Post(object o) => _web.CoreWebView2?.PostWebMessageAsString(JsonSerializer.Serialize(o));

    static byte[] ReadResourceBytes(string endsWith)
    {
        var asm = Assembly.GetExecutingAssembly();
        var name = asm.GetManifestResourceNames().First(n => n.EndsWith(endsWith, StringComparison.OrdinalIgnoreCase));
        using var s = asm.GetManifestResourceStream(name)!;
        using var m = new MemoryStream();
        s.CopyTo(m);
        return m.ToArray();
    }

    static string ReadResource(string endsWith)
    {
        var asm = Assembly.GetExecutingAssembly();
        var name = asm.GetManifestResourceNames().First(n => n.EndsWith(endsWith, StringComparison.OrdinalIgnoreCase));
        using var s = asm.GetManifestResourceStream(name)!;
        using var r = new StreamReader(s);
        return r.ReadToEnd();
    }
}
