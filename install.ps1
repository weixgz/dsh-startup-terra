#Requires -Version 5.1
<#
.SYNOPSIS
  安装 / 卸载 dsh-startup-terra（泰拉终端启动动画）到 DSH profile。

.DESCRIPTION
  做三件事：
    1) 自检目录完整性；
    2) 校验三处默认值副本与 lib/schema.js 一致（漂移就自动同步）；
    3) 装 / 卸插件。

  注意：这里不走 `dsh plugin --profile desktop add ...` —— dsh 的 CLI 对 profile 名
  desktop 做了硬编码拦截（不看应用有没有运行），那条命令在任何机器上都跑不通。
  脚本改调 tools/dsh-plugin.mjs，它直接调用 dsh 内部同一个 runPlugin()，
  也就是 Electron 端走的那条路径。web 等其它 profile 没有被拦截，会走官方 CLI。

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

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'x 找不到 node（需要 >= 20）。' -ForegroundColor Red
  Write-Host '  装完 node 再跑本脚本，或手工执行：' -ForegroundColor DarkGray
  Write-Host '    node tools/dsh-plugin.mjs --profile desktop add' -ForegroundColor DarkGray
  exit 1
}

# 基本自检：这几个文件缺一个，插件装上也跑不起来
$required = @(
  'package.json',
  'cordis.patch.yml',
  'lib/index.js',
  'lib/schema.js',
  'lib/splash.js',
  'lib/splash.css',
  'lib/client.js',
  'tools/dsh-plugin.mjs',
  'tools/sync-schema.mjs'
)
$missing = @($required | Where-Object { -not (Test-Path -LiteralPath (Join-Path $root $_)) })
if ($missing.Count -gt 0) {
  Write-Host 'x 插件目录不完整，缺少：' -ForegroundColor Red
  $missing | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
  exit 1
}

# 默认值三处副本与 lib/schema.js 是否一致
Write-Host '→ 校验配置 schema 副本 ...' -ForegroundColor Cyan
Push-Location $root
node tools/sync-schema.mjs --check
if ($LASTEXITCODE -ne 0) {
  Write-Host '  ! 有副本漂移，自动同步一次。' -ForegroundColor Yellow
  node tools/sync-schema.mjs
  if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-Host 'x 同步失败，先修 lib/schema.js。' -ForegroundColor Red
    exit $LASTEXITCODE
  }
}

if ($Remove) {
  Write-Host "→ 从 $Profile profile 卸载 dsh-startup-terra ..." -ForegroundColor Cyan
  node tools/dsh-plugin.mjs --profile $Profile remove
} else {
  Write-Host "→ 安装到 $Profile profile ..." -ForegroundColor Cyan
  node tools/dsh-plugin.mjs --profile $Profile add
}
$code = $LASTEXITCODE
Pop-Location

if ($code -ne 0) {
  Write-Host "x 返回 $code，没成功。" -ForegroundColor Red
  exit $code
}

if ($Remove) {
  Write-Host '√ 已卸载。完全退出 DSH 再打开生效。' -ForegroundColor Green
  exit 0
}

if (-not $NoRestartHint) {
  Write-Host ''
  Write-Host '  下一步：完全退出 DSH 再打开（不是关窗口），' -ForegroundColor White
  Write-Host '  然后到 设置 → 泰拉启动 调身份 / 速度 / 主题。' -ForegroundColor White
  Write-Host ''
  Write-Host '  装没装上可以这样验证：' -ForegroundColor DarkGray
  Write-Host '    浏览器访问 http://127.0.0.1:<端口>/dsh-terra/splash.js' -ForegroundColor DarkGray
  Write-Host '    401 = 已注册（没带 token，正常）  404 = 没装上 / 没重启' -ForegroundColor DarkGray
}
