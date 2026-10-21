#!/usr/bin/env node
/* ============================================================================
 * 把 lib/schema.js 的默认值 / 校验表同步到三处静态副本
 * ----------------------------------------------------------------------------
 *   node tools/sync-schema.mjs           写回（改完 schema.js 就跑一次）
 *   node tools/sync-schema.mjs --check   只校验，漂移就 exit 1（给 CI / install.ps1 用）
 *
 * 为什么需要它：splash.js 是浏览器 IIFE、client.js 是手写 bundle、preview.html 是
 * file:// 页面，三者都加载不了 lib/schema.js。所以由本脚本把权威值写成静态副本，
 * 让「加一个配置项要改四个文件」变成「只改 schema.js + 跑一次脚本」。
 *
 * 行尾：仓库用 core.autocrlf=true，工作区是 CRLF。本脚本读写时**保留每个文件原本
 * 的行尾**，避免把整文件改成 LF 造成下一次 diff 全是空白行。
 * ========================================================================== */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')

const { FIELDS, DEFAULTS, RULES } = await import(
  pathToFileURL(path.join(ROOT, 'lib', 'schema.js')).href
)
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const VERSION = String(pkg.version || '0.0.0')

const ORDER = FIELDS.map((f) => f.key)

/** 字段行尾注释：枚举列出取值，颜色说明 auto。 */
const COMMENTS = FIELDS.reduce((acc, f) => {
  if (f.type === 'enum') acc[f.key] = f.values.join(' | ')
  else if (f.type === 'color') acc[f.key] = 'auto = 跟随主题；或 #rrggbb'
  return acc
}, {})

/** 检测文件主流行尾，缺省按 LF。 */
function detectEol(src) {
  const crlf = (src.match(/\r\n/g) || []).length
  const lf = (src.match(/(?<!\r)\n/g) || []).length
  return crlf > lf ? '\r\n' : '\n'
}

function renderObject(assignee, source, ind, eol, overrides = {}) {
  const lines = [assignee + ' = {']
  ORDER.forEach((key, i) => {
    const value = key in overrides ? overrides[key] : source[key]
    const comma = i < ORDER.length - 1 ? ',' : ''
    const note = COMMENTS[key] ? '  /* ' + COMMENTS[key] + ' */' : ''
    lines.push('  ' + key + ': ' + JSON.stringify(value) + comma + note)
  })
  lines.push('}')
  return lines.map((l) => ind + l).join(eol)
}

function renderRules(ind, eol) {
  const enums = Object.keys(RULES.enums)
    .map((k) => k + ': ' + JSON.stringify(RULES.enums[k]))
    .join(', ')
  const ranges = Object.keys(RULES.ranges)
    .map((k) => k + ': ' + JSON.stringify(RULES.ranges[k]))
    .join(', ')
  return [
    'var RULES = {',
    '  enums: { ' + enums + ' },',
    '  ranges: { ' + ranges + ' },',
    '  bools: ' + JSON.stringify(RULES.bools) + ',',
    '  texts: ' + JSON.stringify(RULES.texts) + ',',
    '  colors: ' + JSON.stringify(RULES.colors) + ',',
    '  textMax: ' + RULES.textMax,
    '}'
  ].map((l) => ind + l).join(eol)
}

/* 每个目标：缩进 + 块内容（顺序与文件里一致） */
const TARGETS = [
  {
    file: 'lib/splash.js',
    indent: '  ',
    body: (ind, eol) => [
      ind + 'var FALLBACK_VERSION = ' + JSON.stringify(VERSION),
      renderObject('var FALLBACK', DEFAULTS, ind, eol),
      renderRules(ind, eol)
    ].join(eol)
  },
  {
    file: 'lib/client.js',
    indent: '    ',
    body: (ind, eol) => [
      renderObject('var FALLBACK', DEFAULTS, ind, eol),
      ind + 'var FALLBACK_VERSION = ' + JSON.stringify(VERSION)
    ].join(eol)
  },
  {
    file: 'preview.html',
    indent: '  ',
    // 预览页固定 mode=always，方便反复刷新
    body: (ind, eol) => [
      ind + 'window.__DSH_TERRA_VERSION__ = ' + JSON.stringify(VERSION),
      renderObject('window.__DSH_TERRA__', DEFAULTS, ind, eol, { mode: 'always' })
    ].join(eol)
  }
]

/* 匹配 /* SCHEMA:BEGIN ... *\/ 到 /* SCHEMA:END *\/。
 * 兼容 CRLF 与 LF；BEGIN 注释原文可跨行（preview.html 就是两行）。 */
function blockRe() {
  return /(^|\r?\n)([ \t]*)\/\* SCHEMA:BEGIN([\s\S]*?)\*\/(\r?\n)[\s\S]*?(\r?\n)?[ \t]*\/\* SCHEMA:END \*\//
}

const checkOnly = process.argv.includes('--check')
let drifted = 0

for (const target of TARGETS) {
  const abs = path.join(ROOT, target.file)
  const src = fs.readFileSync(abs, 'utf8')
  const BLOCK = blockRe()
  if (!BLOCK.test(src)) {
    console.error('x ' + target.file + '：找不到 SCHEMA 标记块，跳过')
    drifted++
    continue
  }
  const eol = detectEol(src)
  const next = src.replace(
    BLOCK,
    (_m, nl, indent, rest, eol0) =>
      nl +
      indent + '/* SCHEMA:BEGIN' + rest + '*/' + eol0 +
      target.body(indent, eol) + eol +
      indent + '/* SCHEMA:END */'
  )
  if (next === src) {
    console.log('= ' + target.file + '（已是最新）')
    continue
  }
  if (checkOnly) {
    console.error('x ' + target.file + '：与 lib/schema.js 不一致，跑 `npm run sync` 同步')
    drifted++
  } else {
    fs.writeFileSync(abs, next, 'utf8')
    console.log('√ ' + target.file + '（已同步 v' + VERSION + '）')
  }
}

if (checkOnly) {
  if (drifted) {
    console.error('\n' + drifted + ' 个文件漂移。')
    process.exit(1)
  }
  console.log('\n全部一致。')
}
