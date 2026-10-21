#!/usr/bin/env node
/* ============================================================================
 * 装 / 卸 dsh-startup-terra 到 DSH profile
 * ----------------------------------------------------------------------------
 *   node tools/dsh-plugin.mjs add               装到 desktop profile（默认）
 *   node tools/dsh-plugin.mjs remove            从 desktop profile 卸载
 *   node tools/dsh-plugin.mjs --profile web add 装到 web profile
 *   node tools/dsh-plugin.mjs list              看装了什么
 *
 * 为什么不用 `dsh plugin --profile desktop add ...`：
 *   dsh 的 CLI 在 bin.js 里对 profile 名做了硬编码拦截（rejectElectronProfile）——
 *   只要叫 desktop（不区分大小写、也不管应用有没有运行）就直接报错退出，
 *   开关 manageDesktopProfile 只在 Electron 端调用 runCli() 时传入，
 *   命令行和环境变量都打不开。所以那条命令在任何机器上都跑不通。
 *
 * 这里的做法是直接调用 dsh 内部同一个 runPlugin()，也就是 Electron 端走的
 * 那条路径（它只校验 profile 目录里有 package.json）。web 等其它 profile 没有被
 * 拦截，仍然走官方 CLI。
 * ========================================================================== */

import fs from 'node:fs'
import path from 'node:path'
import { execSync, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

/* ── 参数 ───────────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2)
let profile = 'desktop'
const rest = []

for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--profile' || a === '-p') { profile = argv[++i] || 'desktop'; continue }
  if (a.startsWith('--profile=')) { profile = a.slice('--profile='.length); continue }
  if (a === '--dsh-lib') { rest.push('--dsh-lib', argv[++i]); continue }
  rest.push(a)
}

let dshLibOverride = null
const filtered = []
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--dsh-lib') { dshLibOverride = rest[++i]; continue }
  filtered.push(rest[i])
}

const command = filtered[0] || 'add'
let args = filtered.slice(1)

/* add 没给包说明符时，默认 link 本仓库（软链：改完刷新即生效） */
if ((command === 'add' || command === 'install') && args.length === 0) {
  args = ['link:' + ROOT.replace(/\\/g, '/')]
}
if (command === 'remove' || command === 'uninstall' || command === 'rm') {
  if (args.length === 0) args = [PKG.name]
}

/* ── 定位 dsh 安装目录 ───────────────────────────────────────────────────── */

function resolveDshRoot() {
  const cands = []

  const tryResolve = (base) => {
    try {
      const req = createRequire(path.join(base, '.__resolve__.js'))
      return path.dirname(req.resolve('@deepseek-ai/dsh/package.json'))
    } catch (err) {
      return null
    }
  }

  cands.push(tryResolve(process.cwd()))
  cands.push(tryResolve(ROOT))

  try {
    const g = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    if (g) cands.push(path.join(g, '@deepseek-ai/dsh'))
  } catch (err) { /* 没有 npm 就算了 */ }

  try {
    const where = process.platform === 'win32' ? 'where dsh' : 'command -v dsh'
    const out = execSync(where, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    const first = out.split(/\r?\n/)[0].trim()
    if (first) {
      let dir = path.dirname(first)
      for (let i = 0; i < 5; i++) {
        cands.push(path.join(dir, 'node_modules', '@deepseek-ai', 'dsh'))
        dir = path.dirname(dir)
      }
    }
  } catch (err) { /* PATH 里没有 */ }

  for (const c of cands) {
    if (c && fs.existsSync(path.join(c, 'package.json'))) return c
  }
  return null
}

function resolvePluginModule() {
  if (dshLibOverride) return dshLibOverride
  const root = resolveDshRoot()
  if (!root) return null
  const libDir = path.join(root, 'lib')
  try {
    const hit = fs.readdirSync(libDir).find((n) => /^plugin-.*\.js$/.test(n))
    return hit ? path.join(libDir, hit) : null
  } catch (err) {
    return null
  }
}

/* ── 执行 ───────────────────────────────────────────────────────────────── */

function spawnCli() {
  const r = spawnSync('dsh', ['plugin', '--profile', profile, command, ...args], {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })
  if (r.error) {
    console.error('x 起不了 dsh：' + r.error.message)
    return 1
  }
  return r.status == null ? 1 : r.status
}

async function runInternal() {
  const mod = resolvePluginModule()
  if (!mod || !fs.existsSync(mod)) {
    console.error('x 找不到 dsh 的 plugin 模块。')
    console.error('  用 --dsh-lib <绝对路径> 指一下，例如：')
    console.error('    node tools/dsh-plugin.mjs --dsh-lib "C:/.../@deepseek-ai/dsh/lib/plugin-xxxx.js" add')
    return 1
  }
  let runPlugin
  try {
    ;({ runPlugin } = await import(pathToFileURL(mod).href))
  } catch (err) {
    console.error('x 加载 ' + mod + ' 失败：' + err.message)
    return 1
  }
  if (typeof runPlugin !== 'function') {
    console.error('x ' + mod + ' 里没有 runPlugin，dsh 版本可能变了。')
    return 1
  }
  console.log('→ dsh plugin --profile ' + profile + ' ' + command + ' ' + args.join(' ') + '（走内部接口）')
  try {
    const code = await runPlugin(profile, [command, ...args])
    return typeof code === 'number' ? code : 0
  } catch (err) {
    console.error('x 失败：' + ((err && err.message) || err))
    return 1
  }
}

const isDesktop = String(profile).toLowerCase() === 'desktop'
const code = isDesktop ? await runInternal() : spawnCli()

if (code === 0) {
  console.log('')
  if (command === 'remove' || command === 'uninstall' || command === 'rm') {
    console.log('√ 已卸载。完全退出 DSH 再打开生效。')
  } else if (command === 'add' || command === 'install') {
    console.log('√ 装好了。完全退出 DSH 再打开（不是关窗口），然后到 设置 → 泰拉启动 调。')
    console.log('  验证：浏览器访问 http://127.0.0.1:<端口>/dsh-terra/splash.js')
    console.log('        401 = 已注册（没带 token，正常）   404 = 没装上 / 没重启')
  }
}

process.exit(code)
