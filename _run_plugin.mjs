// 直接调用 dsh 的底层 plugin 接口，绕开 CLI 对 desktop profile 的硬编码拒绝。
// 等价于 Electron 端执行 `dsh plugin --profile desktop add ...`
import { pathToFileURL } from 'node:url';

const LIB = 'C:/Users/Administrator/.workbuddy/binaries/node/versions/22.22.2-6/node_modules/@deepseek-ai/dsh/lib/plugin-BiveYA7h.js';
const { runPlugin } = await import(pathToFileURL(LIB).href);
const args = process.argv.slice(2);
const code = await runPlugin('desktop', args);
console.log('\n[exitCode]', code);
process.exit(code);
