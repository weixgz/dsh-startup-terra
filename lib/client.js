/**
 * dsh-startup-terra — 浏览器半侧（设置页「泰拉启动」）
 * ----------------------------------------------------------------------------
 * 手写 ModuleLoader bundle，无需构建。做两件事：
 *   1) 注册一个 settings.section，读写 Host 的 /dsh-terra/config；
 *   2) 桌面端没走到 tapIndex 时自举加载启动屏（/dsh-terra/splash.css + splash.js）。
 *
 * 注册 id 必须等于 loader entry 名（dsh-startup-terra），否则会报
 * "loaded without registering dsh-startup-terra"。
 */
window.__ModuleLoader__.load({
  id: 'dsh-startup-terra',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var react = require('react')
    var h = react.createElement

    var BASE = '/dsh-terra'
    var API = BASE + '/config'
    var ROOT_ID = 'dsh-terra-root'
    var FLAG_SHOWN = 'dsh-terra:shown'
    var FLAG_DAY = 'dsh-terra:day'

    /* ── 面板样式（前缀 __dt_，避免与别的插件撞名）──────────────────────── */
    var CSS = [
      '.__dt_root{max-width:620px;display:flex;flex-direction:column;gap:14px;font-size:13px;color:var(--dsw-alias-label-primary)}',
      '.__dt_version{font-family:ui-monospace,Consolas,monospace;font-size:12px;letter-spacing:.04em;color:var(--dsw-alias-label-tertiary)}',
      '.__dt_group{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:11px}',
      '.__dt_groupTitle{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary)}',
      '.__dt_field{display:flex;flex-direction:column;gap:5px}',
      '.__dt_label{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.__dt_hint{font-size:11px;line-height:1.55;color:var(--dsw-alias-label-tertiary)}',
      '.__dt_row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.__dt_input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 10px;font-size:13px;box-sizing:border-box;width:100%;outline:none}',
      '.__dt_input:focus{border-color:var(--dsw-alias-state-business-primary)}',
      '.__dt_inputMono{font-family:ui-monospace,Consolas,monospace;font-size:12px;letter-spacing:.06em}',
      '.__dt_select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 8px;font:inherit;font-size:13px;min-width:180px}',
      '.__dt_check{display:flex;align-items:flex-start;gap:8px;cursor:pointer}',
      '.__dt_check input{margin-top:2px;accent-color:var(--dsw-alias-state-business-primary)}',
      '.__dt_checkText{display:flex;flex-direction:column;gap:2px}',
      '.__dt_two{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
      '.__dt_actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:2px}',
      '.__dt_btn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 14px;font:inherit;font-size:13px;cursor:pointer}',
      '.__dt_btn:hover:not(:disabled){border-color:var(--dsw-alias-state-business-primary)}',
      '.__dt_btn:disabled{opacity:.5;cursor:default}',
      '.__dt_btnPrimary{border-color:var(--dsw-alias-state-business-primary,#3964fe);background:var(--dsw-alias-state-business-primary,#3964fe);color:#fff}',
      '.__dt_status{font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.__dt_ok{font-size:12px;color:var(--dsw-alias-state-business-primary)}',
      '.__dt_err{font-size:12px;color:var(--dsw-alias-state-error-primary,#f85149)}',
      '.__dt_swatch{width:38px;height:26px;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;cursor:pointer}',
      '.__dt_preview{margin-top:2px;border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:12px}',
      '.__dt_previewText{font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:1.5}'
    ].join('')

    var tagId = 'dsh-startup-terra/main.css'
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="' + tagId + '"]') === null) {
      var tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-startup-terra'
      tag.dataset.pluginCss = tagId
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    /* ── 表单原子 ────────────────────────────────────────────────────────── */
    function Field(props) {
      return h('div', { className: '__dt_field' },
        h('label', { className: '__dt_label' }, props.label),
        props.children,
        props.hint ? h('div', { className: '__dt_hint' }, props.hint) : null
      )
    }

    function TextInput(props) {
      return h('input', {
        className: '__dt_input' + (props.mono ? ' __dt_inputMono' : ''),
        type: 'text',
        value: props.value == null ? '' : String(props.value),
        placeholder: props.placeholder || '',
        maxLength: props.maxLength || 64,
        spellCheck: false,
        onChange: function (e) { props.onChange(e.target.value) }
      })
    }

    function Select(props) {
      return h('select', {
        className: '__dt_select',
        value: props.value,
        onChange: function (e) { props.onChange(e.target.value) }
      }, props.options.map(function (o) {
        return h('option', { key: o[0], value: o[0] }, o[1])
      }))
    }

    function Check(props) {
      return h('label', { className: '__dt_check' },
        h('input', {
          type: 'checkbox',
          checked: !!props.checked,
          onChange: function (e) { props.onChange(e.target.checked) }
        }),
        h('span', { className: '__dt_checkText' },
          h('span', null, props.label),
          props.hint ? h('span', { className: '__dt_hint' }, props.hint) : null
        )
      )
    }

    var FALLBACK = {
      enabled: true, mode: 'session', theme: 'dark', speed: 1,
      requireInteraction: true, allowSkip: true,
      sound: true, soundVolume: 0.7,
      identity: '林间鹤', identityId: '0001', accessLevel: '8',
      org: 'RHODES ISLAND', terminal: 'TERMINAL 01',
      footer: 'TERRA OPERATIONAL COMMAND', accent: 'auto'
    }

    function num(v, d) {
      var n = Number(v)
      return isFinite(n) ? n : d
    }

    var FALLBACK_VERSION = '1.0.0'
    function readInjectedVersion() {
      try {
        return window.__DSH_TERRA_VERSION__ ? String(window.__DSH_TERRA_VERSION__) : ''
      } catch (e) { return '' }
    }

    /* ── 设置面板 ────────────────────────────────────────────────────────── */
    function Panel() {
      var [draft, setDraft] = react.useState(null)
      var [file, setFile] = react.useState('')
      var [version, setVersion] = react.useState(readInjectedVersion)
      var [error, setError] = react.useState(null)
      var [notice, setNotice] = react.useState(null)
      var [busy, setBusy] = react.useState(false)

      function load() {
        setError(null)
        return fetch(API, { headers: { Accept: 'application/json' } })
          .then(function (r) { return r.json() })
          .then(function (j) {
            if (!j || j.ok !== true) throw new Error((j && j.error) || 'load failed')
            setDraft(Object.assign({}, FALLBACK, j.config))
            setFile(j.file || '')
            if (j.version) setVersion(String(j.version))
          })
          .catch(function (e) {
            setError('读取配置失败：' + String(e && e.message ? e.message : e))
          })
      }

      react.useEffect(function () { load() }, [])

      function set(key, value) {
        setNotice(null)
        setDraft(function (d) {
          var next = Object.assign({}, d)
          next[key] = value
          return next
        })
      }

      function save() {
        if (!draft) return
        setBusy(true)
        setNotice(null)
        setError(null)
        fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patch: draft })
        })
          .then(function (r) { return r.json() })
          .then(function (j) {
            if (!j || j.ok !== true) throw new Error((j && j.error) || 'save failed')
            setDraft(Object.assign({}, FALLBACK, j.config))
            setNotice('已保存。点「立即预览」用新配置重播一次。')
          })
          .catch(function (e) {
            setError('保存失败：' + String(e && e.message ? e.message : e))
          })
          .then(function () { setBusy(false) })
      }

      function reset() {
        setBusy(true)
        setNotice(null)
        setError(null)
        fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reset' })
        })
          .then(function (r) { return r.json() })
          .then(function (j) {
            if (!j || j.ok !== true) throw new Error((j && j.error) || 'reset failed')
            setDraft(Object.assign({}, FALLBACK, j.config))
            setNotice('已恢复默认。')
          })
          .catch(function (e) {
            setError('恢复默认失败：' + String(e && e.message ? e.message : e))
          })
          .then(function () { setBusy(false) })
      }

      function preview() {
        var api = window.__DSH_TERRA_API__
        if (api && typeof api.replay === 'function') {
          api.replay()
          return
        }
        window.location.reload()
      }

      var versionLine = h('div', { className: '__dt_version' }, '版本 v' + (version || FALLBACK_VERSION))

      if (!draft) {
        return h('div', { className: '__dt_root' },
          versionLine,
          h('div', { className: '__dt_status' }, error ? error : '读取配置中…'),
          error ? h('div', { className: '__dt_actions' },
            h('button', { className: '__dt_btn', onClick: load }, '重试')
          ) : null
        )
      }

      var modeOptions = [
        ['session', '每个浏览器会话一次'],
        ['daily', '每天一次'],
        ['always', '每次打开都播放']
      ]

      return h('div', { className: '__dt_root' },
        versionLine,

        h('div', { className: '__dt_group' },
          h('div', { className: '__dt_groupTitle' }, '播放'),
          h(Check, {
            label: '启用泰拉终端启动动画',
            hint: '关闭后直接进主界面。',
            checked: draft.enabled,
            onChange: function (v) { set('enabled', v) }
          }),
          h(Field, { label: '播放时机' },
            h(Select, {
              value: draft.mode,
              options: modeOptions,
              onChange: function (v) { set('mode', v) }
            })
          ),
          h(Field, {
            label: '速度倍率',
            hint: '只影响自检与揭幕段；验证段跟随音效真实时长，不会被压快。'
          },
            h('div', { className: '__dt_row' },
              h('input', {
                type: 'range', min: 0.35, max: 3, step: 0.05,
                value: num(draft.speed, 1),
                style: { flex: '1 1 240px' },
                onChange: function (e) { set('speed', Number(e.target.value)) }
              }),
              h('span', { className: '__dt_status' }, num(draft.speed, 1).toFixed(2) + '×')
            )
          ),
          h(Check, {
            label: '需要确认登录',
            hint: '停在授权面板等「确认登录」/ Enter；关闭则自动确认。',
            checked: draft.requireInteraction,
            onChange: function (v) { set('requireInteraction', v) }
          }),
          h(Check, {
            label: '允许跳过',
            hint: '右上角 SKIP，Esc 也能直接进主界面。',
            checked: draft.allowSkip,
            onChange: function (v) { set('allowSkip', v) }
          })
        ),

        h('div', { className: '__dt_group' },
          h('div', { className: '__dt_groupTitle' }, '干员档案'),
          h(Field, {
            label: '身份名称',
            hint: '显示在授权面板与「WELCOME BACK, xxx」。'
          }, h(TextInput, {
            value: draft.identity,
            placeholder: '例如：林间鹤',
            onChange: function (v) { set('identity', v) }
          })),
          h('div', { className: '__dt_two' },
            h(Field, { label: '身份编号', hint: '建议用数字；中文名派生不出编号。' },
              h(TextInput, {
                value: draft.identityId,
                mono: true,
                onChange: function (v) { set('identityId', v) }
              })),
            h(Field, { label: '权限等级' },
              h(TextInput, {
                value: draft.accessLevel,
                mono: true,
                onChange: function (v) { set('accessLevel', v) }
              }))
          )
        ),

        h('div', { className: '__dt_group' },
          h('div', { className: '__dt_groupTitle' }, '声音'),
          h(Check, {
            label: '授权音效',
            hint: '点「确认登录」后由 WebAudio 现场合成（三音上行 + 上扫噪声），不读取音频文件。',
            checked: draft.sound,
            onChange: function (v) { set('sound', v) }
          }),
          draft.sound ? h(Field, { label: '音效音量' },
            h('div', { className: '__dt_row' },
              h('input', {
                type: 'range', min: 0, max: 1, step: 0.05,
                value: num(draft.soundVolume, 0.7),
                style: { flex: '1 1 200px' },
                onChange: function (e) { set('soundVolume', Number(e.target.value)) }
              }),
              h('span', { className: '__dt_status' }, Math.round(num(draft.soundVolume, 0.7) * 100) + '%')
            )
          ) : null
        ),

        h('div', { className: '__dt_group' },
          h('div', { className: '__dt_groupTitle' }, '文案'),
          h(Field, { label: '左上角机构名' },
            h(TextInput, { value: draft.org, onChange: function (v) { set('org', v) } })),
          h(Field, { label: '右上角终端号' },
            h(TextInput, {
              value: draft.terminal,
              mono: true,
              onChange: function (v) { set('terminal', v) }
            })),
          h(Field, { label: '左下角页脚' },
            h(TextInput, {
              value: draft.footer,
              mono: true,
              onChange: function (v) { set('footer', v) }
            }))
        ),

        h('div', { className: '__dt_group' },
          h('div', { className: '__dt_groupTitle' }, '视觉'),
          h(Field, { label: '主题' },
            h(Select, {
              value: draft.theme,
              options: [['dark', '深色 · 暗底终端'], ['light', '浅色 · 亮底档案']],
              onChange: function (v) { set('theme', v) }
            })
          ),
          h(Field, {
            label: '强调色',
            hint: '徽记光晕、进度条、状态字、确认按钮都用它。「跟随主题」就是默认的黑白方案：深色底近白、浅色底近黑。'
          },
            h('div', { className: '__dt_row' },
              h('input', {
                className: '__dt_swatch',
                type: 'color',
                value: draft.accent === 'auto' ? '#f2f5f6' : draft.accent,
                onChange: function (e) { set('accent', e.target.value) }
              }),
              h('span', { className: '__dt_status' },
                draft.accent === 'auto' ? '跟随主题（黑白）' : String(draft.accent)),
              h('button', {
                className: '__dt_btn',
                type: 'button',
                disabled: draft.accent === 'auto',
                onClick: function () { set('accent', 'auto') }
              }, '跟随主题')
            )
          )
        ),

        h('div', { className: '__dt_preview' },
          h('div', { className: '__dt_previewText' },
            '预览按「已保存」的配置重播。想先看新配置，先保存再预览。',
            file ? h('div', { style: { marginTop: '4px', opacity: 0.75 } }, '配置文件：' + file) : null
          ),
          h('button', { className: '__dt_btn', onClick: preview }, '立即预览')
        ),

        h('div', { className: '__dt_actions' },
          h('button', {
            className: '__dt_btn __dt_btnPrimary',
            disabled: busy,
            onClick: save
          }, busy ? '处理中…' : '保存'),
          h('button', { className: '__dt_btn', disabled: busy, onClick: reset }, '恢复默认'),
          h('button', { className: '__dt_btn', disabled: busy, onClick: load }, '放弃修改'),
          notice ? h('span', { className: '__dt_ok' }, notice) : null,
          error ? h('span', { className: '__dt_err' }, error) : null
        )
      )
    }

    /* ── 桌面端自举：没走到 tapIndex 时自己把启动屏拉起来 ─────────────────── */
    function readFlag(store, key) {
      try {
        var s = window[store]
        return s ? s.getItem(key) : null
      } catch (e) { return null }
    }

    function writeFlag(store, key, value) {
      try {
        var s = window[store]
        if (s) s.setItem(key, value)
      } catch (e) { /* 隐私模式 */ }
    }

    function release() {
      try {
        var r = document.getElementById(ROOT_ID)
        if (r && r.parentNode) r.parentNode.removeChild(r)
        if (document.documentElement.classList) document.documentElement.classList.remove('dt-lock')
        if (document.body && document.body.style) document.body.style.overflow = ''
        window.__DSH_TERRA_FAILED__ = true
      } catch (e) { /* noop */ }
    }

    function loadCss(href) {
      var link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = href
      link.addEventListener('error', release)
      ;(document.head || document.documentElement).appendChild(link)
    }

    function loadScript(src) {
      var s = document.createElement('script')
      s.src = src
      s.async = false
      s.addEventListener('error', release)
      ;(document.head || document.documentElement).appendChild(s)
    }

    function selfBoot() {
      try {
        if (typeof window === 'undefined' || typeof document === 'undefined') return
        if (!document.body) return
        if (window.__DSH_TERRA_BOOT__) return
        if (window.__DSH_TERRA__) return
        if (document.getElementById(ROOT_ID)) return
        if (window.__DSH_TERRA_FAILED__ === true) return

        window.__DSH_TERRA_BOOT__ = 'client'

        fetch(API, { headers: { Accept: 'application/json' } })
          .then(function (r) { return r.json() })
          .then(function (j) { return j && j.ok === true ? j.config : null })
          .catch(function () { return null })
          .then(function (cfg) {
            cfg = cfg || { enabled: true, mode: 'session', speed: 1 }
            if (cfg.enabled === false) return

            var today = new Date().toISOString().slice(0, 10)
            if (cfg.mode === 'session' && readFlag('sessionStorage', FLAG_SHOWN) === '1') return
            if (cfg.mode === 'daily' && readFlag('localStorage', FLAG_DAY) === today) return
            if (cfg.mode === 'session') writeFlag('sessionStorage', FLAG_SHOWN, '1')
            if (cfg.mode === 'daily') writeFlag('localStorage', FLAG_DAY, today)

            var mount = document.createElement('div')
            mount.id = ROOT_ID
            mount.className = 'dt-root dt-boot'
            document.body.appendChild(mount)
            document.documentElement.classList.add('dt-lock')
            if (document.body.style) document.body.style.overflow = 'hidden'

            window.__DSH_TERRA__ = cfg
            loadCss(BASE + '/splash.css')
            loadScript(BASE + '/splash.js?t=' + Date.now())
          })
          .catch(function () { /* 自举失败就算了，不要带崩宿主 */ })
      } catch (e) { /* selfBoot 绝不抛 */ }
    }

    /* ── 插件入口 ────────────────────────────────────────────────────────── */
    var inject = ['slots']

    function apply(ctx) {
      selfBoot()
      ctx.slots.inject('settings.section', function () {
        return ctx.slots.register(
          { name: 'settings.section', id: 'terra-startup', order: 29, label: '泰拉启动' },
          function () { return h(Panel, {}) }
        )
      })
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
