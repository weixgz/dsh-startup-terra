# dsh-startup-terra

> 泰拉终端 · 罗德岛 HUD 风格的 DeepSeek Harness 启动动画
> 自检开机 → 干员档案授权 → 权限验证 → `ACCESS GRANTED` → 色散揭幕
>
> 视觉走**黑白**：深色底是近白 + 灰阶层次，不做彩色强调。

**零位图、零音频、零字体、零运行时依赖**：徽记是矢量 SVG，底纹/扫描线/噪点是 CSS 渐变，
授权音效由 WebAudio 现场合成。整个插件没有一张位图、没有一个音频文件、没有 web font。

> 启动屏的徽记用的是罗德岛官方矢量标志（`lib/assets/rhodes-island-mark.svg`，**第三方素材，
> 不属 MIT**，仅供个人同人使用）。把它删掉或留着都行 —— 缺失时自动退回本项目原创的几何占位徽记，
> 功能不受影响。详见 [lib/assets/NOTICE.md](lib/assets/NOTICE.md)。

> 架构参考了 [dsh-startup-rhodes](https://github.com/Moonmick/dsh-startup-rhodes) 的 DSH 插件分层
> （Host 半侧路由注入 + Web 客户端 bundle + 启动运行时）。代码、文案与视觉均为本仓库重新实现，
> 不包含该项目的素材。本项目是非官方同人作品，与鹰角网络、DeepSeek 均无关联。

---

## 目录

- [本地预览](#本地预览不用装插件)
- [播放序列](#播放序列)
- [安装](#安装)
- [使用](#使用)
- [设置](#设置)
- [目录结构](#目录结构)
- [改东西](#改东西)
- [和别的启动插件共存](#和别的启动插件共存)
- [常见问题](#常见问题)
- [更新日志](#更新日志)
- [版权与免责声明](#版权与免责声明)

---

## 本地预览（不用装插件）

直接在浏览器里打开仓库根目录的 `preview.html` 就能看完整播放序列 —— 不需要装 DSH，
不需要起服务（`file://` 就能跑，因为它用的是配置注入而不是 `/dsh-terra/config` 路由）。

- 刷新页面 = 重播
- 点「确认登录」= 走音效 + 权限验证；`Esc` = 跳过
- 想试浅色主题 / 2 倍速 / 换身份 / 换强调色，改 `preview.html` 里那段 `window.__DSH_TERRA__` 即可

这一步能在装到 DSH 之前就确认「这版视觉你要不要」。

---

## 播放序列

| 幕 | 画面 | 时长（1×） |
|---|---|---|
| 1 | 黑幕自检：罗德岛徽记模糊显影 + 一道扫光、`PRTS` 排版字标、四行自检日志、进度线走满 | ~1.7s |
| 2 | 授权面板：徽记 + `ID / NO. / CLEARANCE` 三行档案 +「确认登录」 | 等你确认 |
| 3 | 确认后：三音上行音效 + 上扫噪声，`IDENTITY CHECK / ARTS CLEARANCE / TERMINAL HANDSHAKE` 逐条转绿，十六进制流滚动 | 跟随音效（2.5s） |
| 4 | `ACCESS GRANTED` + 下划线扫出 + 闪白 → 色散后撤 → 卸载 | ~1.4s |

任意时刻 `Esc` 或右上角 `SKIP` 直接进主界面（可在设置里关掉跳过）。

设计取舍：**登录屏会一直等你确认**，不点就一直停在那 —— 因为它同时是「这是一次新的终端会话」的
可见提示。不想要就关掉「需要确认登录」，改成自动确认。

---

## 安装

**环境要求**：DSH Desktop 或 web profile（支持插件），Node ≥ 20。

```powershell
# 方式零：脚本（Windows，会自检目录 + 校验配置副本 + 安装）
.\install.ps1                 # 装到 desktop profile
.\install.ps1 -Profile web    # 装到 web profile

# 方式一：命令行（跨平台，等价于上面的安装那一步）
node tools/dsh-plugin.mjs add                      # desktop
node tools/dsh-plugin.mjs --profile web add        # web

# 装完看一眼装了什么
node tools/dsh-plugin.mjs list
```

**装完必须完全退出 DSH 再打开**（不是关窗口）。web profile 则重启 `dsh web`。

卸载：

```powershell
.\install.ps1 -Remove
# 或
node tools/dsh-plugin.mjs remove
```

> **别用 `dsh plugin --profile desktop add ...`，那条命令跑不通。**
> dsh 的 CLI 在 `bin.js` 里对 profile 名做了硬编码拦截（`rejectElectronProfile`）：
> 只要叫 `desktop`（不区分大小写，也不管应用有没有在运行）就直接报错退出，
> 开关 `manageDesktopProfile` 只在 Electron 端调用 `runCli()` 时传入，
> 命令行和环境变量都打不开 —— 所以它在任何机器上都失败，不是你的环境问题。
> `tools/dsh-plugin.mjs` 直接调用 dsh 内部的同一个 `runPlugin()`，也就是 Electron 端
> 走的那条路径。`web` 等其它 profile 没有被拦截，脚本会正常走官方 CLI。

> `link:` 是软链安装：之后改 `lib/splash.css` / `lib/splash.js`，**刷新页面**就能看到效果，
> 不用重装、不用重启。改 `lib/index.js` / `lib/client.js` 才需要重启。

---

## 使用

- 页面载入自动播放；
- 授权面板点「确认登录」，或按 `Enter` / `Space`；
- `Esc` 或右上角 `SKIP` 直接进入主界面；
- 设置 → **泰拉启动** → 改身份、文案、速度、主题，点「立即预览」重播。

配置保存在 `$DSH_HOME/dsh-terra.json`（默认 `~/.dsh/dsh-terra.json`，`DSH_HOME` 可覆盖）。

---

## 设置

| 分组 | 选项 | 默认 |
|---|---|---|
| 播放 | 启用、播放时机（每个会话 / 每天 / 每次）、速度倍率、是否需要确认登录、是否允许跳过 | 开 / 每个会话 / 1× / 需要 / 允许 |
| 干员档案 | 身份名称、身份编号、权限等级 | 林间鹤 / 0001 / 8 |
| 声音 | 授权音效开关、音量 | 开 / 70% |
| 文案 | 左上机构名、右上终端号、左下页脚 | RHODES ISLAND / TERMINAL 01 / TERRA OPERATIONAL COMMAND |
| 视觉 | 深色 / 浅色、强调色 | 深色 / 跟随主题（黑白） |

> 速度只影响自检与揭幕段；验证段跟随音效真实时长，压快会让音画不同步。
> 中文名字派生不出编号，请把「身份编号」填成数字。

**关于黑白**：默认强调色是 `auto`（跟随主题）—— 深色底用近白 `#f2f5f6`、浅色底用近黑
`#14181b`，所以切到浅色主题不会出现白底白字。想换成别的颜色（比如琥珀金）就在设置里点
色块自定义；想回到黑白点「跟随主题」。自定义颜色时，确认按钮上的文字色由主题决定，
挑太浅或太深的色可能对比不足，自己看一眼预览即可。

---

## 目录结构

```
dsh-startup-terra/
├─ lib/
│  ├─ schema.js     ★ 配置唯一权威源：默认值 / 枚举 / 范围 / 校验
│  ├─ index.js      Host 半侧：四条路由 + index.html 注入 + 配置读写（原子写）
│  ├─ splash.js     启动运行时：时间线 / WebAudio 合成音效 / 交互 / 兜底
│  ├─ splash.css    全部样式（深色 / 浅色 / 窄屏 / 减少动效）
│  ├─ client.js     设置页「泰拉启动」+ 桌面端自举
│  └─ assets/
│     ├─ rhodes-island-mark.svg  罗德岛徽记（第三方，非 MIT）
│     └─ NOTICE.md               该素材的权利与使用限制
├─ tools/
│  ├─ sync-schema.mjs  把 schema.js 的默认值同步到三处静态副本（--check 只校验）
│  └─ dsh-plugin.mjs   装/卸插件，绕开 CLI 对 desktop profile 的硬编码拦截
├─ preview.html      本地预览页（不进插件运行时）
├─ install.ps1       一键安装/卸载脚本（Windows）
├─ icon.svg          插件图标（矢量，无位图）
├─ cordis.patch.yml  bundle 层声明
├─ package.json      dsh.bundle + dsh.client 声明
├─ DISCLAIMER.md     免责声明
└─ LICENSE           MIT（覆盖除 lib/assets/ 以外的内容）
```

**徽记是怎么接进来的**：`splash.js` 把官方徽记作为 `<img src="/dsh-terra/asset/rhodes-island-mark.svg">`
叠在原创占位徽记上面，`load` 成功才显形、`error` 就把这一层摘掉。浅色主题不额外放文件，
直接对容器做 `filter: invert(1)` 翻面（黑白互换就是官方的 inverse 版）。

换自己的标志：放一个同名 `lib/assets/rhodes-island-mark.svg` 覆盖即可 —— 建议透明底、
只用黑白两色、viewBox 近似正方形。白名单只放行单层 `.svg`，其它后缀和子目录都会被 404。

---

## 改东西

```bash
npm run check          # 校验三处默认值副本没漂移
node --check lib/index.js
node --check lib/splash.js
node --check lib/client.js
```

`lib/client.js` 是浏览器 bundle（用到 `Symbol.toStringTag` 与 `window`），`node --check`
只验证语法，不会执行，所以能过。

### 加 / 改一个配置项：只改 `lib/schema.js`

配置项的默认值、枚举、范围、校验**只在 `lib/schema.js` 里定义一次**。加完（或改完）跑：

```bash
npm run sync
```

它会把权威值写进 `lib/splash.js`、`lib/client.js`、`preview.html` 三处标记块
（`/* SCHEMA:BEGIN */` … `/* SCHEMA:END */`）。**那三处不要手改**，手写会被覆盖，
而且 `npm run check` / `install.ps1` 会报错。

为什么不是共享模块：`splash.js` 是浏览器 IIFE（约束是「不 require、不 import」），
`client.js` 是手写 ModuleLoader bundle（只能 require 宿主模块），`preview.html` 跑在
`file://` 下 —— 三者都加载不了 `schema.js`。所以走「Node 端权威 + 生成静态副本 + 脚本校验」。

校验边界值也一样：`splash.js` 里不再写死 `0.35/3` 这类数字，运行时读生成的 `RULES`，
和 Host 端的 `normalize()` 行为一致。

- **改文案**：静态字在 `lib/splash.js` 的 `TEMPLATE` 里；运行期文案在 `TEMPLATE` 的
  `data-f` 节点。默认文案改 `lib/schema.js` 的 `default`，然后 `npm run sync`。
- **改配色**：`lib/splash.css` 里 `.dt-stage` 的 `--dt-*` 变量；强调色由配置写进行内样式。
- **改字标**：`PRTS` 是排版的（`.dt-lockup-word`），不是图片也不是字体路径 ——
  改字号/字距就在这条规则里；下面那行 `SYNTHESIZE INFORMATION · ANALYSIS OS` 在 `TEMPLATE` 里。
- **改节奏**：`bootPhase()` 的 `steps` 与 `sleep(105)`；`verifyPhase()` 的 `sleep(430)`；
  `grantPhase()` 的三个等待。
- **改音效**：`playGrantSound()` 里的三个 `tone()` 与噪声扫频参数；返回值就是本段要等的毫秒数。

---

## 和别的启动插件共存

路由前缀（`/dsh-terra`）、DOM 根（`#dsh-terra-root`）、全局键（`__DSH_TERRA__`）、
存储标记（`dsh-terra:*`）、配置文件名（`dsh-terra.json`）全部独立，
与 `dsh-startup-rhodes` / `dsh-startup-screen` **可以同时安装互不报错**。

但它们都是全屏启动动画，**同一屏只该播一个**，否则会叠两层黑幕。请在设置里关掉一个，
或从 profile 的 `dsh.profile.bundles` 里移除一个。

---

## 常见问题

**Q：刷新后没有动画？**
先完全退出桌面端再打开一次。仍没有就检查路由：未带 token 访问
`http://127.0.0.1:<端口>/dsh-terra/splash.js` 应返回 **401**（已注册），**404** 说明没装上或没重启。

**Q：设置页没有「泰拉启动」？**
客户端 bundle 没加载。重启 DSH，并确认 profile 的 `dsh.profile.bundles` 里有 `dsh-startup-terra`。

**Q：`dsh plugin --profile desktop add ...` 报 `profile "desktop" is managed exclusively by the Electron application`？**
这是 dsh CLI 的硬编码拦截，不是环境问题，也不是 DSH 没关掉 —— 只要 profile 名叫 `desktop`
就直接拒绝（见[安装](#安装)）。改用：

```powershell
node tools/dsh-plugin.mjs add        # 或 .\install.ps1
```

它调用的是 dsh 内部同一个 `runPlugin()`，也就是 Electron 端走的那条路。

**Q：改了默认值，设置页和播放出来的不一致？**
跑 `npm run check`。三处副本（`splash.js` / `client.js` / `preview.html`）是从
`lib/schema.js` 生成的，手改了就会被判漂移。执行 `npm run sync` 同步。

**Q：没有声音？**
浏览器要求先有一次用户操作才允许出声，所以音效只在点「确认登录」之后响。
另外检查设置里的「授权音效」开关、音量、以及系统音量。

**Q：只播了一次，刷新不播了？**
默认「每个浏览器会话一次」。改成「每次打开都播放」即可。

**Q：能只改文字不动别的吗？**
可以，直接编辑 `~/.dsh/dsh-terra.json`，或只用设置页。

**Q：字体不一样？**
字体链是系统回退：没有 Bahnschrift / DIN Alternate 时退到系统无衬线，版式不变，字面略有差异。

---

## 更新日志

### v1.1.0

- **配置单一数据源**：新增 `lib/schema.js`，默认值 / 枚举 / 范围 / 校验只在这里定义一次；
  `lib/splash.js`、`lib/client.js`、`preview.html` 的默认值块改为由 `tools/sync-schema.mjs`
  生成（标记块 `SCHEMA:BEGIN/END`）。以前加一个配置项要改四个文件、靠注释提醒人工同步。
- **校验边界不再散落**：`splash.js` 运行时读生成的 `RULES`，删掉了写死的 `0.35/3`、`0/1`、
  `'dark'/'light'`，与 Host 端 `normalize()` 行为一致。
- **修好安装链路**：新增 `tools/dsh-plugin.mjs`，绕开 dsh CLI 对 `desktop` profile 的
  硬编码拦截（那条 `dsh plugin --profile desktop add` 在任何机器上都会失败）。
  `install.ps1` 改为调用它，并在安装前自动校验/同步配置副本。
- 设置页优先用接口下发的 `defaults`，进一步降低「面板显示值」与「播放实际值」漂移的可能。

### v1.0.0

- 首个可用版本：自检开机 → 干员档案授权 → 权限验证 → `ACCESS GRANTED` → 色散揭幕。

---

## 版权与免责声明

本项目是**非官方同人作品**，与《明日方舟》的权利方（鹰角网络 / Hypergryph）及 DeepSeek
均无关联，也未获得任何授权或背书。

- **代码与文案**：MIT。
- **无位图、无音频文件**：音效是运行时合成的正弦波与噪声；装饰全是 CSS 渐变。
- **一处第三方素材**：`lib/assets/rhodes-island-mark.svg`（罗德岛徽记）权利归鹰角网络，
  不在 MIT 范围内，仅限个人同人自用，可随时删除（删了自动退回几何占位徽记）。
- **请勿商业使用**，也不要把它当作官方产品的界面。

完整条款见 [DISCLAIMER.md](./DISCLAIMER.md)。

## License

[MIT](./LICENSE) © 2026 dsh-startup-terra contributors
