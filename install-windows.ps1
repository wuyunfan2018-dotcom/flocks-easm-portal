<#
ThreatBook EASM Portal：Windows 版 Flocks 一键安装 / 升级 / 卸载。

  双击 install-windows.cmd                     安装或升级（可反复运行）
  install-windows.cmd -DryRun                  只预览，不改动任何文件
  install-windows.cmd -Uninstall               卸载（保留 easm.db、证据截图和收件箱）
  install-windows.cmd -NoRestart               装完不询问是否重启 Flocks
  install-windows.cmd -NoKey                   不检查、不生成 EASM_SECRET_KEY
  install-windows.cmd -Yes                     无人值守：缺什么就按默认补上（密钥、镜像），不重启

它做的事：找到 Flocks 自带的 Python，运行 install.py（复制页面、访问契约、入库工作流和技能，
在 ~/.flocks 里登记场景套件，升级 Flocks 也不会丢），检查 EASM_SECRET_KEY（没有就生成并保存到
当前用户的环境变量），可选设置 Python 包镜像和客户名称，最后询问是否重启 Flocks。
不会读取或上传任何客户数据。
#>
param(
    [switch]$DryRun,
    [switch]$Uninstall,
    [switch]$NoKey,
    [switch]$NoRestart,
    [switch]$Yes,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
Set-Location -LiteralPath $PSScriptRoot

function Say([string]$Text, [string]$Color = 'Gray') { Write-Host $Text -ForegroundColor $Color }

function Ask([string]$Question, [string]$Default) {
    # -Yes (unattended, e.g. run by Rex) always takes the default answer.
    if ($Yes) { return $Default }
    $a = Read-Host $Question
    if ([string]::IsNullOrWhiteSpace($a)) { return $Default }
    return $a.Trim()
}

function Get-UserOrProcessEnv([string]$Name) {
    $v = [Environment]::GetEnvironmentVariable($Name, 'Process')
    if (-not $v) { $v = [Environment]::GetEnvironmentVariable($Name, 'User') }
    if (-not $v) { $v = [Environment]::GetEnvironmentVariable($Name, 'Machine') }
    return $v
}

function Find-FlocksShim {
    $candidates = @(Join-Path $env:USERPROFILE '.local\bin\flocks.cmd')
    $cmd = Get-Command flocks -ErrorAction SilentlyContinue
    if ($cmd) { $candidates += $cmd.Source }
    foreach ($p in $candidates) {
        if ($p -and (Test-Path -LiteralPath $p)) { return $p }
    }
    return $null
}

function Find-FlocksPython([string]$Shim) {
    if ($Shim -and $Shim.ToLower().EndsWith('.cmd')) {
        $text = Get-Content -Raw -LiteralPath $Shim
        $m = [regex]::Match($text, '"?([^"\r\n]*?python3?\.exe)"?\s+(?:-m\s+)?flocks')
        if ($m.Success -and (Test-Path -LiteralPath $m.Groups[1].Value)) { return $m.Groups[1].Value }
    }
    foreach ($p in @('C:\flocks\flocks\.venv\Scripts\python.exe', (Join-Path $env:USERPROFILE 'flocks\.venv\Scripts\python.exe'))) {
        if (Test-Path -LiteralPath $p) { return $p }
    }
    # Last resort: any Python; install.py then looks for the Flocks interpreter itself.
    foreach ($name in @('py', 'python')) {
        $g = Get-Command $name -ErrorAction SilentlyContinue
        if ($g -and ($g.Source -notlike '*\WindowsApps\*')) { return $g.Source }
    }
    return $null
}

function New-FernetKey {
    # A Fernet key is 32 random bytes, URL-safe base64 (44 characters).
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_')
}

Say ''
Say '=== ThreatBook EASM Portal 安装程序（Windows）===' 'Cyan'

$shim = Find-FlocksShim
$py = Find-FlocksPython $shim
if (-not $py) {
    Say '没有找到 Flocks。请先安装并启动一次 Flocks（会生成 %USERPROFILE%\.local\bin\flocks.cmd），再运行本程序。' 'Red'
    exit 2
}
Say "Flocks 启动器：$(if ($shim) { $shim } else { '未找到（不影响安装，但无法帮你重启 Flocks）' })"
Say "使用的 Python：$py"
Say ''

$installArgs = @('install.py')
if ($DryRun) { $installArgs += '--dry-run' }
if ($Uninstall) { $installArgs += '--uninstall' }
if ($Rest) { $installArgs += $Rest }

$env:EASM_WRAPPER = '1'   # install.py leaves the next steps to this script
& $py @installArgs
$rc = $LASTEXITCODE
if ($rc -ne 0) {
    Say ''
    Say "install.py 失败（退出码 $rc）。请把上面的完整输出发给 EASM 维护人。" 'Red'
    exit $rc
}
if ($DryRun) {
    Say ''
    Say '以上为预览，没有改动任何文件。' 'Yellow'
    exit 0
}
if ($Uninstall) {
    Say ''
    Say '已卸载。重启 Flocks 后导航里不再显示 EASM Portal；数据（easm.db、截图、收件箱）保留在 %USERPROFILE%\.flocks 下。' 'Green'
    exit 0
}

$needsNewProcess = $false   # true when a user environment variable was set just now

# ---- EASM_SECRET_KEY: encrypts leaked passwords at ingest; needed again to reveal them -------------------------
$keyCreated = $false
if (-not $NoKey) {
    $existing = Get-UserOrProcessEnv 'EASM_SECRET_KEY'
    Say ''
    if ($existing) {
        # Make it visible to a Flocks restarted from this window even if the window predates the variable.
        if (-not $env:EASM_SECRET_KEY) { $env:EASM_SECRET_KEY = $existing }
        Say '已检测到 EASM_SECRET_KEY（不显示内容），保持不变。' 'Green'
    } else {
        $answer = Ask '还没有 EASM 加密密钥（入库时用它加密泄露凭据的密码）。现在生成并保存到当前用户的环境变量？[Y/n]' 'y'
        if ($answer -match '^[Yy]') {
            $key = New-FernetKey
            [Environment]::SetEnvironmentVariable('EASM_SECRET_KEY', $key, 'User')
            $env:EASM_SECRET_KEY = $key
            $keyCreated = $true
            $needsNewProcess = $true
            Say '已生成并保存到当前用户的环境变量 EASM_SECRET_KEY。' 'Green'
            Say '请立刻把它备份到密码管理器：丢了它，已入库的密码就无法再显示。不要发到聊天、邮件或代码仓库。' 'Yellow'
            Say '查看密钥（仅在你自己的电脑上执行）：[Environment]::GetEnvironmentVariable(''EASM_SECRET_KEY'',''User'')' 'Yellow'
        } else {
            Say '跳过。入库前必须设置 EASM_SECRET_KEY 并完整重启 Flocks，见安装指引第 2 节。' 'Yellow'
        }
    }
}

# ---- Python package mirror: the first ingest downloads 3 packages; pypi.org is slow or blocked on many CN networks
$indexVars = @('FLOCKS_UV_DEFAULT_INDEX', 'UV_DEFAULT_INDEX', 'UV_INDEX_URL', 'PIP_INDEX_URL', 'FLOCKS_WORKFLOW_REQUIREMENTS_PIP_INDEX_URL')
$indexSet = $false
foreach ($v in $indexVars) { if (Get-UserOrProcessEnv $v) { $indexSet = $true } }
if (-not $indexSet) {
    Say ''
    $answer = Ask '第一次入库要下载几个 Python 包。国内网络建议用阿里云镜像，现在设置？[Y/n]' 'y'
    if ($answer -match '^[Yy]') {
        $mirror = 'https://mirrors.aliyun.com/pypi/simple'
        [Environment]::SetEnvironmentVariable('FLOCKS_UV_DEFAULT_INDEX', $mirror, 'User')
        $env:FLOCKS_UV_DEFAULT_INDEX = $mirror
        $needsNewProcess = $true
        Say "已设置用户环境变量 FLOCKS_UV_DEFAULT_INDEX = $mirror" 'Green'
    }
}

# ---- Customer name for new periods (workspace\easm\ingest-defaults.json) ----------------------------------------
$defaults = Join-Path $env:USERPROFILE '.flocks\workspace\easm\ingest-defaults.json'
if (-not (Test-Path -LiteralPath $defaults)) {
    Say ''
    $name = Ask '客户名称（报告上显示的名字，例如 ACME Ltd；直接回车跳过，以后再填）' ''
    if ($name) {
        $slug = (($name.ToLower() -replace '[^a-z0-9]+', '-').Trim('-'))
        if (-not $slug) { $slug = 'customer' }
        $json = (@{ customer_id = $slug; customer_name = $name } | ConvertTo-Json -Compress)
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $defaults) | Out-Null
        [IO.File]::WriteAllText($defaults, $json, (New-Object System.Text.UTF8Encoding $false))
        Say "已保存：$defaults" 'Green'
    }
}

# ---- Restart Flocks so it loads the EASM suite (and the key) ------------------------------------------------
Say ''
$restarted = $false
if (-not $NoRestart -and $shim) {
    $answer = Ask '现在重启 Flocks 让 EASM 生效？这会中断正在进行的对话和任务。[y/N]' 'n'
    if ($answer -match '^[Yy]') {
        Say '正在重启 Flocks ……'
        # Started from this process, so the new Flocks gets EASM_SECRET_KEY and the mirror even if set just now.
        & $shim restart
        if ($LASTEXITCODE -eq 0) { $restarted = $true } else { Say "flocks restart 返回 $LASTEXITCODE，请手动重启。" 'Red' }
    }
}

Say ''
Say '=== 完成 ===' 'Cyan'
if ($restarted) {
    Say '打开 Flocks，在顶部的工作区切换框里选择 “EASM Portal”。' 'Green'
} else {
    Say '还差一步：让 Flocks 加载 EASM。' 'Yellow'
    if ($needsNewProcess -or $keyCreated) {
        Say '  新开一个 PowerShell 窗口（不要用安装前就开着的窗口），运行：flocks restart' 'Yellow'
        Say '  （刚保存的环境变量只对之后启动的程序生效）' 'Yellow'
    } else {
        Say '  * 在 PowerShell 运行：flocks restart' 'Yellow'
        Say '  * 或者不重启：在 Flocks 的「工具清单」页点右上角的刷新按钮，然后刷新浏览器' 'Yellow'
    }
    Say '然后在顶部的工作区切换框里选择 “EASM Portal”。' 'Yellow'
}
exit 0
