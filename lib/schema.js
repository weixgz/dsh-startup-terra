/* ============================================================================
 * dsh-startup-terra — 配置 schema（唯一权威源）
 * ----------------------------------------------------------------------------
 * 这里是全插件**唯一**定义配置项的地方。lib/index.js 直接 import 它；
 * lib/splash.js、lib/client.js、preview.html 里的默认值块由
 * `tools/sync-schema.mjs` 从本文件生成（标记块 SCHEMA:BEGIN / SCHEMA:END），
 * 不要手改那三处。
 *
 * 为什么不用共享模块：splash.js 是浏览器 IIFE（约束是「不 require、不 import」），
 * client.js 是手写 ModuleLoader bundle（只能 require 宿主模块），两者都加载不了
 * 本文件。所以走「Node 端权威 + 生成静态副本 + 脚本校验」而不是运行时共享。
 *
 * 新增一个配置项：只改下面的 FIELDS，然后跑 `npm run sync`。
 * ========================================================================== */

/** 分组只用于组织与未来的设置页渲染，不影响校验。 */
export const GROUPS = ['play', 'profile', 'sound', 'copy', 'visual']

/**
 * type:
 *   bool   —— 宽松真值（true / 'true' / 1 / '1'）
 *   enum   —— 必须命中 values，否则回落默认
 *   range  —— 数值夹到 [min, max]
 *   text   —— 字符串，截到 max 长度
 *   color  —— 'auto' 或 #rgb / #rgba / #rrggbb / #rrggbbaa
 */
export const FIELDS = [
  { key: 'enabled', type: 'bool', default: true, group: 'play', label: '启用启动动画' },
  { key: 'mode', type: 'enum', default: 'session', values: ['always', 'session', 'daily'], group: 'play', label: '播放时机' },
  { key: 'speed', type: 'range', default: 1, min: 0.35, max: 3, group: 'play', label: '速度倍率' },
  { key: 'requireInteraction', type: 'bool', default: true, group: 'play', label: '需要确认登录' },
  { key: 'allowSkip', type: 'bool', default: true, group: 'play', label: '允许跳过' },

  { key: 'identity', type: 'text', default: '林间鹤', max: 64, group: 'profile', label: '身份名称' },
  { key: 'identityId', type: 'text', default: '0001', max: 64, group: 'profile', label: '身份编号' },
  { key: 'accessLevel', type: 'text', default: '8', max: 64, group: 'profile', label: '权限等级' },

  { key: 'sound', type: 'bool', default: true, group: 'sound', label: '授权音效' },
  { key: 'soundVolume', type: 'range', default: 0.7, min: 0, max: 1, group: 'sound', label: '音量' },

  { key: 'org', type: 'text', default: 'RHODES ISLAND', max: 64, group: 'copy', label: '左上机构名' },
  { key: 'terminal', type: 'text', default: 'TERMINAL 01', max: 64, group: 'copy', label: '右上终端号' },
  { key: 'footer', type: 'text', default: 'TERRA OPERATIONAL COMMAND', max: 64, group: 'copy', label: '左下页脚' },

  { key: 'theme', type: 'enum', default: 'dark', values: ['dark', 'light'], group: 'visual', label: '主题' },
  { key: 'accent', type: 'color', default: 'auto', group: 'visual', label: '强调色' }
]

const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/

/** 文本字段的统一截断长度（各字段可单独用 max 覆盖）。 */
export const DEFAULT_TEXT_MAX = 64

/* ── 由 FIELDS 派生的校验表 ─────────────────────────────────────────────── */

export const DEFAULTS = Object.freeze(
  FIELDS.reduce((acc, f) => {
    acc[f.key] = f.default
    return acc
  }, {})
)

export const ENUMS = Object.freeze(
  FIELDS.filter((f) => f.type === 'enum').reduce((acc, f) => {
    acc[f.key] = f.values.slice()
    return acc
  }, {})
)

export const RANGES = Object.freeze(
  FIELDS.filter((f) => f.type === 'range').reduce((acc, f) => {
    acc[f.key] = [f.min, f.max]
    return acc
  }, {})
)

const byType = (type) => FIELDS.filter((f) => f.type === type).map((f) => f.key)

export const BOOL_KEYS = Object.freeze(byType('bool'))
export const TEXT_KEYS = Object.freeze(byType('text'))
export const COLOR_KEYS = Object.freeze(byType('color'))

const maxLenOf = (key) => {
  const f = FIELDS.find((x) => x.key === key)
  return f && typeof f.max === 'number' ? f.max : DEFAULT_TEXT_MAX
}

/* ── 校验 ───────────────────────────────────────────────────────────────── */

function truthy(value) {
  return value === true || value === 'true' || value === 1 || value === '1'
}

/**
 * 把任意输入夹成合法配置：缺字段补默认、越界回落、文本截断。
 * 浏览器端（splash.js）用的是由本函数语义生成出来的静态副本，行为一致。
 */
export function normalize(input) {
  const out = { ...DEFAULTS }
  const src = input && typeof input === 'object' ? input : {}

  for (const f of FIELDS) {
    const key = f.key
    if (!(key in src) || src[key] === undefined || src[key] === null) continue
    const value = src[key]

    if (f.type === 'bool') {
      out[key] = truthy(value)
    } else if (f.type === 'enum') {
      out[key] = f.values.includes(value) ? value : f.default
    } else if (f.type === 'range') {
      const n = Number(value)
      out[key] = Number.isFinite(n) ? Math.min(f.max, Math.max(f.min, n)) : f.default
    } else if (f.type === 'color') {
      const s = String(value).trim()
      out[key] = s === 'auto' || COLOR_RE.test(s) ? s : f.default
    } else if (f.type === 'text') {
      out[key] = String(value).slice(0, maxLenOf(key))
    } else {
      out[key] = value
    }
  }

  /* 派生与兜底：编号为空时从身份名里挤一串大写字符，再不行给 0000。 */
  if (!String(out.identity).trim()) out.identity = DEFAULTS.identity
  if (!String(out.identityId).trim()) {
    out.identityId = String(out.identity).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
  }
  if (!String(out.identityId).trim()) out.identityId = '0000'
  if (!String(out.accessLevel).trim()) out.accessLevel = DEFAULTS.accessLevel

  return out
}

/** 给浏览器端用的紧凑校验表（tools/sync-schema.mjs 生成到 splash.js 里）。 */
export const RULES = Object.freeze({
  enums: ENUMS,
  ranges: RANGES,
  bools: BOOL_KEYS,
  texts: TEXT_KEYS,
  colors: COLOR_KEYS,
  textMax: DEFAULT_TEXT_MAX
})
