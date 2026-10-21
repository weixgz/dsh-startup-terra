#Requires -Version 5.1
<#
.SYNOPSIS
  安装 / 卸载 dsh-startup-terra（泰拉终端启动动画）到 DSH profile。

.DESCRIPTION
  等价于手工执行：
    dsh plugin --profile desktop add link:<本目录>
  只是把路径斜杠与"找不到 dsh"的报错处理好。

.EXAMPLE
  .\install.ps1
  安装到 desktop profile

.EXAMPLE
  .\install.ps1 -Profile web
  安装到 web profile

.EXAMPLE
  .\install.ps1 -Remove
  从 desktop profile 卸载
#>
[CmdletBinding()]
param(
  [ValidateSet('desktop', 'web')]
  [string] $Profile = 'desktop',

  [switch] $Remove,

  [switch] $NoRestartHint
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootPosix = $root -replace '\\', '/'

if (-not (Get-Command dsh -ErrorAction SilentlyContinue)) {
  Write-Host 'x 找不到 dsh 命令。' -ForegroundColor Red
  Write-Host '  先确认 DeepSeek Harness 已安装，并且 dsh 在 PATH 里：' -ForegroundColor DarkGray
  Write-Host '    where dsh' -ForegroundColor DarkGray
  Write-Host '  没有的话用应用内的终端 / 或把安装目录加进 PATH。' -ForegroundColor DarkGray
  exit 1
}

# 基本自检：这几个文件缺一个，插件装上也跑不起来
$required = @(
  'package.json',
  'cordis.patch.yml',
  'lib/index.js',
  'lib/splash.js',
  'lib/splash.css',
  'lib/client.js'
)
$missing = @($required | Where-Object { -not (Test-Path -LiteralPath (Join-Path $root $_)) })
if ($missing.Count -gt 0) {
  Write-Host 'x 插件目录不完整，缺少：' -ForegroundColor Red
  $missing | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
  exit 1
}

if ($Remove) {
  Write-Host "→ 从 $Profile profile 卸载 dsh-startup-terra ..." -ForegroundColor Cyan
  dsh plugin --profile $Profile remove dsh-startup-terra
} else {
  Write-Host "→ 安装到 $Profile profile：" -ForegroundColor Cyan
  Write-Host "    link:$rootPosix" -ForegroundColor DarkGray
  dsh plugin --profile $Profile add "link:$rootPosix"
}

if ($LASTEXITCODE -ne 0) {
  Write-Host "x dsh plugin 返回 $LASTEXITCODE，没成功。" -ForegroundColor Red
  exit $LASTEXITCODE
}

if ($Remove) {
  Write-Host '√ 已卸载。完全退出 DSH 再打开生效。' -ForegroundColor Green
  exit 0
}

Write-Host ''
Write-Host '√ 装好了。' -ForegroundColor Green
if (-not $NoRestartHint) {
  Write-Host '  下一步：完全退出 DSH 再打开（不是关窗口），' -ForegroundColor White
  Write-Host '  然后到 设置 → 泰拉启动 调身份 / 速度 / 主题。' -ForegroundColor White
  Write-Host ''
  Write-Host '  装没装上可以这样验证：' -ForegroundColor DarkGray
  Write-Host '    浏览器访问 http://127.0.0.1:<端口>/dsh-terra/splash.js' -ForegroundColor DarkGray
  Write-Host '    401 = 已注册（没带 token，正常）  404 = 没装上 / 没重启' -ForegroundColor DarkGray
}
