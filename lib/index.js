/* ============================================================================
 * dsh-startup-terra — Host 半侧
 * ----------------------------------------------------------------------------
 * 三段式，结构对齐 dsh-startup-rhodes（同一套 DSH 插件约定）：
 *   1) 往 index.html 注入首屏（黑幕兜底 + 关键 CSS + 配置 + 运行时脚本）
 *   2) 提供 /dsh-terra/splash.css · splash.js · asset/* · config 四条路由
 *   3) 配置落到 $DSH_HOME/dsh-terra.json（设置页经 /config 读写）
 *
 * 与 dsh-startup-rhodes / dsh-startup-screen 是互不干扰的独立插件：路由前缀、
 * DOM 根、window 全局键、存储标记、配置文件名全部独立。但三者都是全屏启动动画，
 * 同一屏只该播一个。
 * ========================================================================== */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/* 配置 schema 的唯一权威源。默认值 / 枚举 / 范围 / 校验全在这里，
   splash.js 与 client.js 里的同名块由 tools/sync-schema.mjs 生成。 */
import { DEFAULTS, normalize } from './schema.js'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const CONFIG_FILE = path.join(DSH_HOME, 'dsh-terra.json')

const NS = 'dsh-startup-terra'
const ROUTE_BASE = '/dsh-terra'

const PLUGIN_VERSION = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'))
    const v = String(pkg.version || '').trim()
    return v || '0.0.0'
  } catch (err) {
    return '0.0.0'
  }
})()

function readConfig() {
  try {
    return normalize(JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')))
  } catch (err) {
    return { ...DEFAULTS }
  }
}

function writeConfig(next) {
  const cfg = normalize(next)
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
  const tmp = CONFIG_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf8')
  fs.renameSync(tmp, CONFIG_FILE)
  return cfg
}

/** 静态文件按 mtime 缓存：改完 splash.* 刷新页面就生效，不用重启。 */
function makeReader(rel) {
  let cache = null
  return function read() {
    const file = path.join(PACKAGE_ROOT, rel)
    try {
      const st = fs.statSync(file)
      if (!cache || cache.mtimeMs !== st.mtimeMs) {
        cache = { mtimeMs: st.mtimeMs, text: fs.readFileSync(file, 'utf8') }
      }
      return cache.text
    } catch (err) {
      return ''
    }
  }
}

const readSplashCss = makeReader('lib/splash.css')
const readSplashJs = makeReader('lib/splash.js')

/** 内联脚本里不能出现 `</script>`，也不能留裸的行分隔符。 */
function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '')
}

const CRITICAL_CSS = [
  'html.dt-lock,html.dt-lock body{overflow:hidden!important}',
  '#dsh-terra-root.dt-boot{position:fixed;inset:0;z-index:2147483000;background:#060809}'
].join('')

/* 首屏兜底：应用挂载前先盖住窗口；判定不播就立刻摘掉。
   12 秒兜底只在「splash.js 完全没跑起来」时生效 —— splash.js 第一步就会摘掉
   dt-boot，所以再慢的 speed 也不会被它误杀。 */
const BOOTSTRAP_JS = `(function(){try{
var c=window.__DSH_TERRA__||{};
var root=document.getElementById('dsh-terra-root');
var off=!c.enabled;
if(!off&&c.mode==='session'&&sessionStorage.getItem('dsh-terra:shown')==='1')off=true;
if(!off&&c.mode==='daily'&&localStorage.getItem('dsh-terra:day')===new Date().toISOString().slice(0,10))off=true;
if(off){window.__DSH_TERRA_SKIP__=true;if(root&&root.parentNode)root.parentNode.removeChild(root);}
else{document.documentElement.classList.add('dt-lock');setTimeout(function(){try{var r=document.getElementById('dsh-terra-root');if(r&&r.className&&r.className.indexOf('dt-boot')!==-1){if(r.parentNode)r.parentNode.removeChild(r);document.documentElement.classList.remove('dt-lock');if(document.body)document.body.style.overflow='';window.__DSH_TERRA_FAILED__=true;}}catch(e){}},12000);}
}catch(e){} })()`

const name = NS
const inject = ['webServer', 'connection']

function resolveWebServer(ctx) {
  try {
    const viaGet = typeof ctx.get === 'function' ? ctx.get('webServer') : undefined
    if (viaGet) return viaGet
  } catch (err) { /* 取不到当没有 */ }
  return ctx.webServer
}

function hasRoutes(server) {
  return !!server && typeof server.register === 'function' && typeof server.tapIndex === 'function'
}

function apply(ctx) {
  const disposers = []
  const webServer = resolveWebServer(ctx)

  if (!hasRoutes(webServer)) {
    try {
      ctx.logger?.warn?.(
        '[' + NS + '] 当前 profile 没有可用的 webServer；Host 半侧跳过路由与首屏注入，' +
        '改由浏览器半侧（lib/client.js）自举启动界面。'
      )
    } catch (err) { /* 日志失败不影响加载 */ }
    return
  }

  function rejected(req, res) {
    try {
      const conn = (typeof ctx.get === 'function' ? ctx.get('connection') : undefined) || ctx.connection
      if (!conn || typeof conn.requestRejection !== 'function') return false
      const code = conn.requestRejection(req)
      if (code === undefined || code === null || code === false) return false
      res.statusCode = typeof code === 'number' ? code : 403
      res.end()
      return true
    } catch (err) {
      return false
    }
  }

  function registerRoute(route) {
    const inner = route && route.handler
    const wrapped = Object.assign({}, route, {
      handler: async (req, res) => {
        if (rejected(req, res)) return
        return inner(req, res)
      }
    })
    return webServer.register(wrapped)
  }

  function sendJson(res, code, payload) {
    const body = Buffer.from(JSON.stringify(payload), 'utf8')
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': String(body.length)
    })
    res.end(body)
  }

  function sendText(res, type, text) {
    const body = Buffer.from(text, 'utf8')
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'Content-Length': String(body.length)
    })
    res.end(body)
  }

  function readBody(req, limit = 64 * 1024) {
    return new Promise((resolve) => {
      let size = 0
      const chunks = []
      req.on('data', (c) => {
        size += c.length
        if (size > limit) {
          req.destroy()
          resolve('')
          return
        }
        chunks.push(c)
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', () => resolve(''))
    })
  }

  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE_BASE + '/splash.css',
    handler: (req, res) => sendText(res, 'text/css; charset=utf-8', readSplashCss())
  }))

  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE_BASE + '/splash.js',
    handler: (req, res) => sendText(res, 'application/javascript; charset=utf-8', readSplashJs())
  }))

  /* 可选素材：只放行单层 svg，方便自己换徽记。内置视觉全是内联 SVG/CSS，
     不读这里的文件也能正常播放。 */
  disposers.push(registerRoute({
    kind: 'prefix',
    path: ROUTE_BASE + '/asset',
    handler: (req, res) => {
      const file = path.basename(decodeURIComponent((req.url || '').split('?')[0] || ''))
      if (!/^[a-z0-9._-]+\.svg$/i.test(file) || file.includes('..')) {
        res.writeHead(404)
        res.end()
        return
      }
      let bytes
      try {
        bytes = fs.readFileSync(path.join(PACKAGE_ROOT, 'lib', 'assets', file))
      } catch (err) {
        res.writeHead(404)
        res.end()
        return
      }
      res.writeHead(200, {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=86400',
        'Content-Length': String(bytes.length)
      })
      res.end(bytes)
    }
  }))

  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE_BASE + '/config',
    handler: async (req, res) => {
      const method = (req.method || 'GET').toUpperCase()
      if (method === 'GET') {
        sendJson(res, 200, {
          ok: true,
          version: PLUGIN_VERSION,
          config: readConfig(),
          defaults: DEFAULTS,
          file: CONFIG_FILE
        })
        return
      }
      if (method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method not allowed' })
        return
      }
      const text = await readBody(req)
      let payload = {}
      try {
        payload = text ? JSON.parse(text) : {}
      } catch (err) {
        sendJson(res, 400, { ok: false, error: 'invalid json' })
        return
      }
      try {
        if (payload && payload.action === 'reset') {
          const cfgNow = writeConfig(DEFAULTS)
          sendJson(res, 200, { ok: true, version: PLUGIN_VERSION, config: cfgNow, defaults: DEFAULTS })
          return
        }
        const current = readConfig()
        const patch = payload && typeof payload.patch === 'object' && payload.patch ? payload.patch : payload
        const cfgNow = writeConfig({ ...current, ...patch })
        sendJson(res, 200, { ok: true, version: PLUGIN_VERSION, config: cfgNow, defaults: DEFAULTS })
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String((err && err.message) || err) })
      }
    }
  }))

  disposers.push(webServer.tapIndex((html) => {
    if (!html || html.includes(ROUTE_BASE + '/splash.js')) return html
    const cfg = readConfig()
    const head =
      '<link rel="stylesheet" href="' + ROUTE_BASE + '/splash.css">' +
      '<style id="dsh-terra-critical">' + CRITICAL_CSS + '</style>'
    const body =
      '<div id="dsh-terra-root" class="dt-root dt-boot"></div>' +
      '<script>window.__DSH_TERRA_BOOT__="index";window.__DSH_TERRA_VERSION__=' + safeJson(PLUGIN_VERSION) + ';window.__DSH_TERRA__=' + safeJson(cfg) + ';' + BOOTSTRAP_JS + '</script>' +
      '<script defer src="' + ROUTE_BASE + '/splash.js"></script>'

    let out = html
    if (out.includes('</head>')) out = out.replace('</head>', head + '</head>')
    else out = head + out
    if (out.includes('<body>')) out = out.replace('<body>', '<body>' + body)
    else if (out.includes('</body>')) out = out.replace('</body>', body + '</body>')
    else out = out + body
    return out
  }))

  ctx.effect(() => () => {
    for (const dispose of disposers) {
      try { dispose() } catch (err) { /* noop */ }
    }
  })
}

/* 只给具名导出，不写 default：cordis-plugin-loader 的 unwrapExports 是
   `exports.default ?? exports`，两边都写只会多一个漏改的地方。 */
export { apply, inject, name }
