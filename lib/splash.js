/* ============================================================================
 * dsh-startup-terra — 启动屏运行时
 * ----------------------------------------------------------------------------
 * 由 Host 半侧 index.js 注入；也可以由 lib/client.js 自举加载（桌面端没走到
 * tapIndex 时）。两种入口走的是同一份代码：
 *
 *   window.__DSH_TERRA__          配置（injected 或 /dsh-terra/config 取回）
 *   #dsh-terra-root               宿主预置的挂载点，没有就自己建
 *   window.__DSH_TERRA_API__      暴露给设置页：{ replay, skip }
 *
 * 时序：自检开机 → 授权面板（等确认）→ 权限验证（跟随音效）→ ACCESS GRANTED
 *       → 色散揭幕 → 卸载。
 *
 * 设计约束：
 *   - 零素材：徽记是内联 SVG，底纹/扫描线/噪点是 CSS 渐变，都不加载文件；
 *   - 零依赖：不 require、不 import、不碰宿主内部对象；
 *   - 兜底完整：任何一步抛错都走 release()，绝不给用户留黑屏。
 * ========================================================================== */

(function () {
  'use strict'

  var NS = 'dsh-terra'
  var ROOT_ID = 'dsh-terra-root'
  var BASE = '/dsh-terra'
  var CONFIG_API = BASE + '/config'
  var FLAG_SHOWN = 'dsh-terra:shown'
  var FLAG_DAY = 'dsh-terra:day'

  /* SCHEMA:BEGIN 由 tools/sync-schema.mjs 从 lib/schema.js 生成，不要手改 */
  var FALLBACK_VERSION = "1.1.0"
  var FALLBACK = {
    enabled: true,
    mode: "session",  /* always | session | daily */
    speed: 1,
    requireInteraction: true,
    allowSkip: true,
    identity: "林间鹤",
    identityId: "0001",
    accessLevel: "8",
    sound: true,
    soundVolume: 0.7,
    org: "RHODES ISLAND",
    terminal: "TERMINAL 01",
    footer: "TERRA OPERATIONAL COMMAND",
    theme: "dark",  /* dark | light */
    accent: "auto"  /* auto = 跟随主题；或 #rrggbb */
  }
  var RULES = {
    enums: { mode: ["always","session","daily"], theme: ["dark","light"] },
    ranges: { speed: [0.35,3], soundVolume: [0,1] },
    bools: ["enabled","requireInteraction","allowSkip","sound"],
    texts: ["identity","identityId","accessLevel","org","terminal","footer"],
    colors: ["accent"],
    textMax: 64
  }
  /* SCHEMA:END */

  var VERSION = (function () {
    try {
      return window.__DSH_TERRA_VERSION__ ? String(window.__DSH_TERRA_VERSION__) : FALLBACK_VERSION
    } catch (err) {
      return FALLBACK_VERSION
    }
  })()

  var CANCELLED = { cancelled: true }

  var cfg = FALLBACK
  var speed = 1
  var root = null
  var stage = null
  var f = {}
  var timers = []
  var hexTimer = 0
  var cancelled = false
  var confirmResolve = null
  var keyHandler = null

  /* ── 小工具 ─────────────────────────────────────────────────────────── */

  /* 边界值一律读 RULES（lib/schema.js 生成），运行时里不再写死任何魔法数字。 */

  function clampRange(value, key) {
    var n = Number(value)
    if (!isFinite(n)) return FALLBACK[key]
    var r = RULES.ranges[key]
    if (!r) return n
    return Math.min(r[1], Math.max(r[0], n))
  }

  function pickEnum(value, key) {
    var vs = RULES.enums[key]
    if (!vs) return value
    return vs.indexOf(value) !== -1 ? value : FALLBACK[key]
  }

  function isTruthy(value) {
    return value === true || value === 'true' || value === 1 || value === '1'
  }

  function mergeConfig(input) {
    var out = {}
    var key
    for (key in FALLBACK) {
      if (Object.prototype.hasOwnProperty.call(FALLBACK, key)) out[key] = FALLBACK[key]
    }
    if (input && typeof input === 'object') {
      for (key in FALLBACK) {
        if (!Object.prototype.hasOwnProperty.call(FALLBACK, key)) continue
        if (input[key] === undefined || input[key] === null) continue
        out[key] = input[key]
      }
    }
    for (key in RULES.ranges) {
      if (Object.prototype.hasOwnProperty.call(RULES.ranges, key)) out[key] = clampRange(out[key], key)
    }
    for (key in RULES.enums) {
      if (Object.prototype.hasOwnProperty.call(RULES.enums, key)) out[key] = pickEnum(out[key], key)
    }
    RULES.bools.forEach(function (k) { out[k] = isTruthy(out[k]) })
    RULES.texts.forEach(function (k) {
      out[k] = String(out[k] == null ? '' : out[k]).slice(0, RULES.textMax)
    })
    if (!String(out.identity || '').trim()) out.identity = FALLBACK.identity
    if (!String(out.identityId || '').trim()) out.identityId = FALLBACK.identityId
    if (!String(out.accessLevel || '').trim()) out.accessLevel = FALLBACK.accessLevel
    var accent = String(out.accent == null ? '' : out.accent).trim()
    out.accent = (accent === 'auto' || /^#[0-9a-fA-F]{3,8}$/.test(accent)) ? accent : FALLBACK.accent
    return out
  }

  function guard() {
    if (cancelled) throw CANCELLED
  }

  /** 跟随速度倍率的等待。 */
  function sleep(ms) {
    return new Promise(function (resolve) {
      var id = setTimeout(resolve, Math.max(0, ms / speed))
      timers.push(id)
    })
  }

  /** 真实时长的等待：音效段不被压快。 */
  function rawSleep(ms) {
    return new Promise(function (resolve) {
      var id = setTimeout(resolve, Math.max(0, ms))
      timers.push(id)
    })
  }

  function clearTimers() {
    for (var i = 0; i < timers.length; i++) {
      try { clearTimeout(timers[i]) } catch (err) { /* noop */ }
    }
    timers.length = 0
    if (hexTimer) {
      try { clearInterval(hexTimer) } catch (err) { /* noop */ }
      hexTimer = 0
    }
  }

  function setText(node, value) {
    if (node) node.textContent = value == null ? '' : String(value)
  }

  function query(sel) {
    return root ? root.querySelector(sel) : null
  }

  /* ── 模板 ───────────────────────────────────────────────────────────── */

  /* 素材根：Host 走 /dsh-terra/asset/，本地 preview 用 lib/assets/。
     preview.html 里通过 window.__DSH_TERRA_ASSET_BASE__ 覆盖。 */
  var ASSET_BASE = (function () {
    try {
      var base = window.__DSH_TERRA_ASSET_BASE__
      if (base) return String(base).replace(/\/+$/, '') + '/'
    } catch (err) { /* noop */ }
    return BASE + '/asset/'
  })()

  var MARK_FILE = 'rhodes-island-mark.svg'

  /* 占位徽记（纯几何、原创）：官方标志没加载出来时它兜底，所以黑屏风险为零。 */
  var MARK_SVG = [
    '<svg class="dt-mark" viewBox="0 0 120 120" aria-hidden="true" focusable="false">',
    '<polygon class="dt-mark-hex" points="60,8 105,34 105,86 60,112 15,86 15,34"/>',
    '<polygon class="dt-mark-tri" points="60,30 89,80 31,80"/>',
    '<circle class="dt-mark-core" cx="60" cy="60" r="3.6"/>',
    '<path class="dt-mark-tick" d="M60 1v9M60 110v9M1 60h9M110 60h9"/>',
    '</svg>'
  ].join('')

  /* 官方徽记叠在占位徽记上面：加载成功才盖住占位，失败就整块摘掉。
     浅色主题靠 .dt-mark-wrap 的 invert(1) 翻面，所以只需要这一份文件。 */
  function markLayer() {
    return (
      '<span class="dt-mark-wrap">' +
      '<img class="dt-mark-img" alt="" aria-hidden="true" src="' + ASSET_BASE + MARK_FILE + '">' +
      '</span>'
    )
  }

  /* 外层 .dt-stage 一并写进模板：挂载后 root 只有这一个子节点，
     主题类与 --dt-accent 都加在它上面。 */
  var TEMPLATE = [
    '<div class="dt-stage">',
    '<div class="dt-grid"></div>',
    '<div class="dt-scan"></div>',
    '<div class="dt-noise"></div>',
    '<div class="dt-frame"></div>',

    '<header class="dt-top">',
    '<div class="dt-top-left">',
    '<span class="dt-org" data-f="org"></span>',
    '<span class="dt-slash">//</span>',
    '<span class="dt-tag">PRTS TERMINAL</span>',
    '</div>',
    '<div class="dt-top-right">',
    '<span class="dt-term" data-f="terminal"></span>',
    '<button class="dt-skip" type="button" data-act="skip">SKIP</button>',
    '</div>',
    '</header>',

    '<main class="dt-main">',

    '<section class="dt-scene is-active" data-scene="boot">',
    '<div class="dt-emblem">' + MARK_SVG + markLayer() + '</div>',
    '<div class="dt-lockup">',
    '<div class="dt-lockup-word">PRTS</div>',
    '<div class="dt-lockup-rule"></div>',
    '<div class="dt-lockup-sub">SYNTHESIZE INFORMATION · ANALYSIS OS</div>',
    '</div>',
    '<ul class="dt-log" data-f="log"></ul>',
    '<div class="dt-bar"><i class="dt-bar-fill" data-f="bootFill"></i></div>',
    '<div class="dt-bar-meta">',
    '<span class="dt-bar-label">CALIBRATING SOURCE ARTS</span>',
    '<span class="dt-bar-pct" data-f="bootPct">0%</span>',
    '</div>',
    '</section>',

    '<section class="dt-scene" data-scene="login">',
    '<div class="dt-panel" data-f="panel">',
    '<div class="dt-panel-head"><span>AUTHORIZATION <b>REQUIRED</b></span><span>PRTS // 03</span></div>',
    '<div class="dt-panel-body">',
    '<div class="dt-emblem dt-emblem-sm">' + MARK_SVG + markLayer() + '</div>',
    '<div class="dt-dossier">',
    '<div class="dt-dossier-title">TERMINAL ACCESS</div>',
    '<div class="dt-row"><span class="dt-row-k">ID</span><span class="dt-row-dot"></span><span class="dt-row-v" data-f="identity"></span></div>',
    '<div class="dt-row"><span class="dt-row-k">NO.</span><span class="dt-row-dot"></span><span class="dt-row-v" data-f="identityId"></span></div>',
    '<div class="dt-row"><span class="dt-row-k">CLEARANCE</span><span class="dt-row-dot"></span><span class="dt-row-v" data-f="accessLevel"></span></div>',
    '<div class="dt-verify" data-f="verify"></div>',
    '<div class="dt-hex" data-f="hex"></div>',
    '</div>',
    '</div>',
    '<div class="dt-panel-foot">',
    '<button class="dt-confirm" type="button" data-act="confirm">确认登录</button>',
    '<span class="dt-hint" data-f="hint">ENTER 确认 · ESC 跳过</span>',
    '</div>',
    '</div>',
    '</section>',

    '<section class="dt-scene" data-scene="grant">',
    '<div class="dt-grant">',
    '<div class="dt-grant-word">ACCESS GRANTED</div>',
    '<div class="dt-grant-line"></div>',
    '<div class="dt-grant-sub" data-f="welcome"></div>',
    '</div>',
    '</section>',

    '</main>',

    '<footer class="dt-foot">',
    '<span class="dt-foot-text" data-f="footer"></span>',
    '<span class="dt-foot-meta">TERRA // v' + VERSION + '</span>',
    '</footer>',

    '<div class="dt-flash" data-f="flash"></div>',
    '</div>'
  ].join('')

  /* ── 挂载 / 卸载 ────────────────────────────────────────────────────── */

  function mount() {
    root = document.getElementById(ROOT_ID)
    if (!root) {
      root = document.createElement('div')
      root.id = ROOT_ID
      if (document.body) document.body.appendChild(root)
      else document.documentElement.appendChild(root)
    }
    root.className = 'dt-root'
    root.innerHTML = TEMPLATE

    stage = root.querySelector('.dt-stage')

    /* 模板里已经带 .dt-stage；这里保留兜底：万一模板被改坏，也把内容包起来，
       不至于把主题类加空。 */
    if (!stage) {
      var wrap = document.createElement('div')
      wrap.className = 'dt-stage'
      while (root.firstChild) wrap.appendChild(root.firstChild)
      root.appendChild(wrap)
      stage = wrap
    }

    stage.classList.add('dt-theme-' + cfg.theme)

    /* accent === 'auto' 时不写行内变量，交给 CSS 的主题极色：
       深色底近白、浅色底近黑，白底白字这种情况不会出现。 */
    if (cfg.accent && cfg.accent !== 'auto') {
      stage.style.setProperty('--dt-accent', cfg.accent)
    }

    f = {
      org: query('[data-f="org"]'),
      terminal: query('[data-f="terminal"]'),
      footer: query('[data-f="footer"]'),
      log: query('[data-f="log"]'),
      bootFill: query('[data-f="bootFill"]'),
      bootPct: query('[data-f="bootPct"]'),
      panel: query('[data-f="panel"]'),
      identity: query('[data-f="identity"]'),
      identityId: query('[data-f="identityId"]'),
      accessLevel: query('[data-f="accessLevel"]'),
      verify: query('[data-f="verify"]'),
      hex: query('[data-f="hex"]'),
      hint: query('[data-f="hint"]'),
      welcome: query('[data-f="welcome"]'),
      flash: query('[data-f="flash"]'),
      skip: query('[data-act="skip"]'),
      confirm: query('[data-act="confirm"]')
    }

    setText(f.org, cfg.org)
    setText(f.terminal, cfg.terminal)
    setText(f.footer, cfg.footer)
    setText(f.identity, cfg.identity)
    setText(f.identityId, cfg.identityId)
    setText(f.accessLevel, cfg.accessLevel)

    if (!cfg.allowSkip && f.skip && f.skip.parentNode) {
      f.skip.parentNode.removeChild(f.skip)
      f.skip = null
    }

    if (f.skip) {
      f.skip.addEventListener('click', function () { skip() })
    }
    if (f.confirm) {
      f.confirm.addEventListener('click', function () { confirm() })
    }

    bindMarks()

    document.documentElement.classList.add('dt-lock')
    if (document.body && document.body.style) document.body.style.overflow = 'hidden'
  }

  /* 官方徽记的加载处理：成功 → 给 .dt-emblem 加 has-logo（盖住占位徽记）；
     失败/404 → 把整层摘掉，留下占位徽记。两条路都不留空洞。 */
  function bindMarks() {
    var imgs = root ? root.querySelectorAll('img.dt-mark-img') : []
    for (var i = 0; i < imgs.length; i++) bindMark(imgs[i])
  }

  function bindMark(img) {
    var wrap = img.parentNode
    var emblem = wrap && wrap.parentNode

    function ok() {
      if (emblem) emblem.classList.add('has-logo')
    }

    function fail() {
      if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap)
      if (emblem) emblem.classList.remove('has-logo')
    }

    img.addEventListener('load', ok)
    img.addEventListener('error', fail)

    /* 缓存命中/失败可能早于监听器，补一次同步判定 */
    if (img.complete) {
      if (img.naturalWidth > 0) ok()
      else fail()
    }
  }

  function release() {
    cancelled = true

    /* 有正在等确认的 Promise，先放它出去：续体会在 guard() 处抛 CANCELLED，
       由 run() 的 catch 吞掉，避免留下悬空等待。 */
    var pending = confirmResolve
    confirmResolve = null
    if (typeof pending === 'function') {
      try { pending() } catch (err) { /* noop */ }
    }

    clearTimers()

    if (keyHandler) {
      try { document.removeEventListener('keydown', keyHandler, true) } catch (err) { /* noop */ }
      keyHandler = null
    }

    try {
      if (root && root.parentNode) root.parentNode.removeChild(root)
    } catch (err) { /* noop */ }
    root = null
    stage = null
    f = {}

    try {
      document.documentElement.classList.remove('dt-lock')
      if (document.body && document.body.style) document.body.style.overflow = ''
    } catch (err) { /* noop */ }

    window.__DSH_TERRA_DONE__ = true
  }

  function skip() {
    if (cancelled) return
    release()
  }

  function confirm() {
    if (cancelled) return
    if (f.confirm) f.confirm.disabled = true
    if (typeof confirmResolve === 'function') {
      var resolve = confirmResolve
      confirmResolve = null
      resolve()
    }
  }

  function bindKeys() {
    keyHandler = function (event) {
      var key = event.key || ''
      if (key === 'Escape') {
        if (!cfg.allowSkip) return
        event.preventDefault()
        skip()
        return
      }
      if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
        if (cancelled) return
        if (!confirmResolve) return
        event.preventDefault()
        confirm()
      }
    }
    document.addEventListener('keydown', keyHandler, true)
  }

  function showScene(name) {
    var scenes = root ? root.querySelectorAll('.dt-scene') : []
    for (var i = 0; i < scenes.length; i++) {
      var node = scenes[i]
      if (node.getAttribute('data-scene') === name) node.classList.add('is-active')
      else node.classList.remove('is-active')
    }
  }

  function setProgress(pct) {
    if (f.bootFill) f.bootFill.style.width = pct + '%'
    if (f.bootPct) f.bootPct.textContent = pct + '%'
  }

  function appendLogLine(label, value) {
    if (!f.log) return
    var li = document.createElement('li')
    li.className = 'dt-log-line'

    var k = document.createElement('span')
    k.className = 'dt-log-k'
    k.textContent = label

    var dots = document.createElement('span')
    dots.className = 'dt-log-dots'

    var v = document.createElement('span')
    v.className = 'dt-log-v'
    v.textContent = value

    li.appendChild(k)
    li.appendChild(dots)
    li.appendChild(v)
    f.log.appendChild(li)
  }

  /* ── 音效（WebAudio 现场合成，无音频文件）──────────────────────────── */

  var AudioCtor = (function () {
    try {
      return window.AudioContext || window.webkitAudioContext || null
    } catch (err) {
      return null
    }
  })()

  /** 返回本段应等待的毫秒数（真实时长）。没有音效时给一个兜底时长。 */
  function playGrantSound() {
    var fallbackMs = 2600
    if (!cfg.sound || !AudioCtor) return fallbackMs

    var ac = null
    try {
      ac = new AudioCtor()
    } catch (err) {
      return fallbackMs
    }

    var volume = clampRange(cfg.soundVolume, 'soundVolume')
    var now = 0
    var master = null

    try {
      now = ac.currentTime
      master = ac.createGain()
      master.gain.value = volume * 0.42
      master.connect(ac.destination)

      function tone(freq, offset, duration, level, type) {
        var osc = ac.createOscillator()
        var gain = ac.createGain()
        osc.type = type || 'sine'
        osc.frequency.setValueAtTime(freq, now + offset)
        gain.gain.setValueAtTime(0.0001, now + offset)
        gain.gain.linearRampToValueAtTime(level, now + offset + 0.03)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration)
        osc.connect(gain)
        gain.connect(master)
        osc.start(now + offset)
        osc.stop(now + offset + duration + 0.06)
      }

      /* 三音上行 + 一条上扫的带通噪声，做出「权限确认」的空气感 */
      tone(523.25, 0.0, 1.15, 0.5, 'sine')
      tone(783.99, 0.16, 1.35, 0.34, 'sine')
      tone(1046.5, 0.34, 1.6, 0.22, 'triangle')

      var frames = Math.floor(ac.sampleRate * 2.4)
      var buffer = ac.createBuffer(1, frames, ac.sampleRate)
      var data = buffer.getChannelData(0)
      for (var i = 0; i < frames; i++) {
        var decay = Math.pow(1 - i / frames, 2.2)
        data[i] = (Math.random() * 2 - 1) * decay
      }

      var noise = ac.createBufferSource()
      noise.buffer = buffer

      var band = ac.createBiquadFilter()
      band.type = 'bandpass'
      band.Q.value = 1.1
      band.frequency.setValueAtTime(320, now)
      band.frequency.exponentialRampToValueAtTime(4200, now + 2.3)

      var noiseGain = ac.createGain()
      noiseGain.gain.value = 0.16

      noise.connect(band)
      band.connect(noiseGain)
      noiseGain.connect(master)
      noise.start(now)
      noise.stop(now + 2.4)

      if (ac.state === 'suspended' && typeof ac.resume === 'function') {
        ac.resume().catch(function () { /* 被策略拦就算了 */ })
      }

      setTimeout(function () {
        try { ac.close() } catch (err) { /* noop */ }
      }, 3400)
    } catch (err) {
      try { if (ac && typeof ac.close === 'function') ac.close() } catch (e) { /* noop */ }
      return fallbackMs
    }

    return 2500
  }

  /* ── 验证态 ─────────────────────────────────────────────────────────── */

  var HEX_CHARS = '0123456789ABCDEF'

  function randomHex(len) {
    var out = ''
    for (var i = 0; i < len; i++) out += HEX_CHARS.charAt(Math.floor(Math.random() * 16))
    return out
  }

  function hexLine() {
    var parts = []
    for (var i = 0; i < 4; i++) parts.push(randomHex(4))
    return parts.join(' ')
  }

  function startHex() {
    if (!f.hex) return
    f.hex.textContent = hexLine()
    hexTimer = setInterval(function () {
      if (!f.hex) return
      f.hex.textContent = hexLine()
    }, 90)
  }

  function buildVerifyRows(rows) {
    if (!f.verify) return []
    f.verify.innerHTML = ''
    var nodes = []
    for (var i = 0; i < rows.length; i++) {
      var row = document.createElement('div')
      row.className = 'dt-vrow'

      var k = document.createElement('span')
      k.className = 'dt-vrow-k'
      k.textContent = rows[i][0]

      var dots = document.createElement('span')
      dots.className = 'dt-row-dot'

      var v = document.createElement('span')
      v.className = 'dt-vrow-v'
      v.textContent = 'PENDING'

      row.appendChild(k)
      row.appendChild(dots)
      row.appendChild(v)
      f.verify.appendChild(row)

      nodes.push({ row: row, value: v, label: rows[i][1] })
    }
    return nodes
  }

  /* ── 时序 ───────────────────────────────────────────────────────────── */

  async function bootPhase() {
    var lines = [
      ['PRTS CORE', 'ONLINE'],
      ['SOURCE ARTS', 'CALIBRATED'],
      ['ROUTE BUFFER', 'SYNCED'],
      ['IDENTITY CACHE', 'LOADED']
    ]
    var steps = 12

    for (var i = 1; i <= steps; i++) {
      guard()
      setProgress(Math.round((i / steps) * 100))
      if (i % 3 === 0) {
        var entry = lines[Math.floor(i / 3) - 1]
        if (entry) appendLogLine(entry[0], entry[1])
      }
      await sleep(105)
    }

    guard()
    setProgress(100)
    await sleep(300)
  }

  async function loginPhase() {
    guard()
    showScene('login')

    if (!cfg.requireInteraction) {
      setText(f.hint, 'AUTO CONFIRM')
      await sleep(700)
      guard()
      return
    }

    await new Promise(function (resolve) {
      confirmResolve = resolve
    })

    guard()
    if (f.panel) f.panel.classList.add('is-verifying')
    setText(f.hint, 'VERIFYING CLEARANCE')
  }

  async function verifyPhase() {
    guard()
    var rows = buildVerifyRows([
      ['IDENTITY CHECK', 'IDENTITY VERIFIED'],
      ['ARTS CLEARANCE', 'CLEARANCE GRANTED'],
      ['TERMINAL HANDSHAKE', 'HANDSHAKE ESTABLISHED']
    ])

    var soundMs = playGrantSound()
    startHex()
    var startedAt = Date.now()

    for (var i = 0; i < rows.length; i++) {
      guard()
      await sleep(430)
      guard()
      rows[i].value.textContent = rows[i].label
      rows[i].row.classList.add('is-ok')
    }

    var spent = Date.now() - startedAt
    var remaining = soundMs - spent
    if (remaining > 60) await rawSleep(remaining)

    guard()
    if (hexTimer) {
      try { clearInterval(hexTimer) } catch (err) { /* noop */ }
      hexTimer = 0
    }
  }

  async function grantPhase() {
    guard()
    showScene('grant')
    setText(f.welcome, 'WELCOME BACK, ' + String(cfg.identity).toUpperCase())
    await sleep(560)

    guard()
    if (f.flash) f.flash.classList.add('is-on')
    await rawSleep(150)

    guard()
    if (stage) stage.classList.add('is-leaving')
    await sleep(660)
  }

  async function run() {
    await bootPhase()
    await loginPhase()
    await verifyPhase()
    await grantPhase()
    release()
  }

  /* ── 入口 ───────────────────────────────────────────────────────────── */

  function markShown() {
    try {
      if (cfg.mode === 'session') window.sessionStorage.setItem(FLAG_SHOWN, '1')
      if (cfg.mode === 'daily') {
        window.localStorage.setItem(FLAG_DAY, new Date().toISOString().slice(0, 10))
      }
    } catch (err) { /* 隐私模式 / 存储被禁 */ }
  }

  function resolveConfig() {
    var injected = null
    try {
      injected = window.__DSH_TERRA__
    } catch (err) {
      injected = null
    }
    if (injected && typeof injected === 'object') return Promise.resolve(injected)

    return fetch(CONFIG_API, { headers: { Accept: 'application/json' } })
      .then(function (res) { return res.json() })
      .then(function (json) {
        if (json && json.ok === true && json.config) return json.config
        return null
      })
      .catch(function () { return null })
  }

  function exposeApi() {
    window.__DSH_TERRA_API__ = {
      version: VERSION,
      skip: function () { skip() },
      replay: function () {
        try {
          window.location.reload()
        } catch (err) { /* noop */ }
      }
    }
  }

  function start() {
    if (window.__DSH_TERRA_STARTED__) return
    window.__DSH_TERRA_STARTED__ = true
    cancelled = false

    resolveConfig()
      .then(function (raw) {
        cfg = mergeConfig(raw)
        speed = cfg.speed

        if (cfg.enabled === false) {
          release()
          return
        }

        /* 首屏兜底脚本判定这一轮不播（会话/每日标记命中）时会把根节点摘掉并立起
           这个标记。此处只看标记，不重复判存储：客户端自举路径在加载本脚本前
           就已经写好标记了，重复判会把自己也跳过。 */
        if (window.__DSH_TERRA_SKIP__ === true) {
          release()
          return
        }

        mount()
        markShown()
        exposeApi()
        bindKeys()

        run().catch(function (err) {
          if (err === CANCELLED) return
          try { console.warn('[dsh-terra] splash aborted:', err) } catch (e) { /* noop */ }
          release()
        })
      })
      .catch(function () {
        /* 配置都拿不到：直接放行，不要黑屏 */
        release()
      })
  }

  if (typeof document === 'undefined') return

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true })
  } else {
    start()
  }
})()
