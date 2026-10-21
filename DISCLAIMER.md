# 免责声明 / DISCLAIMER

## 性质

`dsh-startup-terra` 是一个 **DeepSeek Harness 的第三方插件**，同时是一个
**《明日方舟》主题的非官方同人作品**。

- 与鹰角网络（Hypergryph / 上海鹰角网络科技有限公司）**无任何关联**，
  未获得授权、未获得背书、不代表官方立场。
- 与 DeepSeek（深度求索）**无任何关联**，不是 DSH 官方组件。
- 《明日方舟》、 Rhodes Island（罗德岛）、PRTS 等名称与相关设定的权利归原权利人所有。

## 关于素材

**分两层，许可不同**：

**一、本项目原创（MIT）**

- 启动屏的装饰部分：CSS 网格/扫描线/噪点、进度条、授权面板、HUD 框线，全部是 CSS 渐变与内联 SVG；
- 授权音效由 WebAudio 在运行时用振荡器与白噪声**现场合成**，不读取任何音频文件，也没有位图；
- 官方徽记加载失败时兜底用的六边形 + 内三角徽记，是**通用几何图形**，不构成对任何官方标志的复制。

**二、第三方素材（不属于 MIT）**

- `lib/assets/rhodes-island-mark.svg`：罗德岛三角 + 塔楼徽记，
  由使用者提供、按官方矢量与标志描摹重建，**权利归鹰角网络（Hypergryph）所有**；
- 该文件仅用于个人学习 / 同人创作 / 内部分享，**禁止商业使用**；
- 它**不是插件的必需依赖**：删掉这个文件，启动屏会退回原创几何占位徽记，功能不受影响。

详见 `lib/assets/NOTICE.md`。除该目录外的代码、样式、文案、图形均在 MIT 许可范围内发布。

## 使用限制

1. **禁止商业使用**：不得将本项目或它的衍生版本用于售卖、付费分发、商业产品界面，
   也不得用于任何付费服务的前置界面。
2. **禁止冒充官方**：不得移除本声明后以「官方」名义分发，不得暗示获得授权或背书。
3. **自担风险**：插件在页面载入时注入全屏覆盖层。作者已尽力做兜底（任何异常都会移除
   覆盖层，12 秒超时兜底也会强制放行），但不对因使用本项目导致的任何问题负责。
4. **修改与再分发**：允许在保留本声明与 MIT 许可的前提下修改和再分发；
   分发时必须同时保留 `LICENSE` 与本文件。

## 侵权处理

若权利人认为本项目内容侵犯其合法权益，请通过仓库 issue 联系，作者将在确认后
立即删除相关内容或停止维护本项目。

---

# Disclaimer (English, short)

`dsh-startup-terra` is an unofficial, non-commercial fan-made plugin for DeepSeek Harness
inspired by the visual language of *Arknights*. It is **not affiliated with, endorsed by, or
licensed by** Hypergryph or DeepSeek. The repository contains **no game assets**: all graphics
are original inline SVG / CSS, and the confirmation sound is synthesized at runtime with the
Web Audio API. Code and text are MIT-licensed. Commercial use is prohibited.
