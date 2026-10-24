**v1.5.0** 升级到 Bootstrap 5

- 修正 `pnpm dev` 下改动非入口文件（HTML、样式、翻译）后 `dist` 里的脚本被清空、页面只能显示而所有控件无响应的问题：watch 只在首次构建时清理产物，并等产物就绪后再启动 Firefox
- 配置页的修改即时自动保存（400ms 防抖），保存按钮保留为立即写入，「重置」会丢弃尚未写入的修改，按钮旁显示保存状态
- 自动保存不再裁剪 `settings` 里的空行，未填完的订阅行会留在原处，避免行号与设置数组错位
- Bootstrap 3.4.1 → 5.3.8：标记改用 BS5 的栅格、表单、按钮与弹窗写法（`data-bs-dismiss`、`.btn-close`、`.form-check`、`.float-end` 等）
- glyphicons 图标替换为 Bootstrap Icons，字体仍由构建时从 `node_modules` 复制
- 调整 `src/shared/ui.ts` 的弹窗/折叠 helper 以匹配 BS5 的 `.show` 语义，保留 `modal-open` 滚动锁
- 新增 `src/static/css/app.css`，存放 Bootstrap 5 已移除的 `.btn-xs` 等少量补充样式
- 配置页弹窗改为大尺寸，并按 BS5 习惯把关闭按钮放到标题之后
- 规则与订阅行的上移/下移按钮带 tooltip，按住 Shift 可一步移到底部/顶部
- 每行新增三横线拖动手柄，可直接拖动排序（拖到表格空白处为移到底部），手柄的交互区域覆盖整个手柄单元格
- 用户规则的「添加」按钮带 tooltip，按住 Shift 点击该按钮、「用户规则」标题或任一规则行，会把新规则加到列表顶部
- 双击用户规则打开的编辑弹窗新增「删除」，按下后还需在确认弹窗中再确认一次才会删除
- 用户规则新增「从 JSON 导入」，接受导出的规则文件、裸规则数组以及 gooreplacer 旧格式，重复与不完整的条目自动跳过
- 表头改为单行显示并压缩内边距，「优先顺序」不再被挤成两行，标题行高度减半
- 修正规则链的循环判定：改写结果与原地址相同的规则（如 a.com → a.com）不再占满 1000 步、拖垮整次重定向，改为跳过它继续匹配后面的规则；地址回到出现过的值时视为收敛，超出步数上限时返回最后一个结果而不是放弃
- 新增 `pnpm run pack-src`，生成提交 AMO 源码审查的源码包；构建环境与步骤记录在 `SOURCE.md`
- 清单中的名称、描述、版本、主页与 gecko 元数据统一取自 `package.json`（`displayName` 缺省时退回 `name`），`src/manifest.json` 只保留权限、入口等结构字段，发布时无需在多处同步字符串
- 新增 `pnpm run clean`，删除 `dist`、`coverage`、`web-ext-artifacts` 与日志；加 `--all` 时连同 `node_modules` 一起删除
- 重写 README：补充特性、权限与隐私说明、发布流程与开发指引，过时内容做清理
- README 注明本扩展是 URLRedirector 的修改版并致谢原作者 Yingcai FENG；许可说明改为指向新增的 `LICENSE`，版权行保留原作者

**v1.4.0** 工程现代化，只保留 Firefox 实现

- 迁移到 Manifest V3：`action`、`host_permissions`、`web_accessible_resources` 新格式、`browser_specific_settings` 与 `data_collection_permissions`，最低支持 Firefox 140
- 后台改为事件页脚本，阻塞式 `webRequest` 用法随之改为异步；设置改为带就绪 Promise 的缓存，避免事件页唤醒后读到空配置
- 源码迁移到 TypeScript 与 ES 模块（`src/shared`、`src/background`、`src/options`、`src/popup`、`src/cloud`），由 esbuild 打包
- 抛弃 Grunt / Bower，改用 pnpm + esbuild + `web-ext`（`run` / `lint` / `build` / `sign`）
- Bootstrap 3.3.7 → 3.4.1，改为构建时从 `node_modules` 复制
- 完全移除 jQuery 与 Bootstrap JavaScript，配置页改为原生 DOM，弹窗/折叠由 `src/shared/ui.ts` 实现
- 请求改用 `fetch`，移除 jQuery.ajax 与 `jquery.blockUI`
- 更严格的正则处理：非法表达式不再抛异常，只忽略该规则
- 增加 Vitest 测试（规则引擎、在线规则解析、manifest、后台重定向与下载流程、配置页与弹窗 DOM）
- 移除 Chrome / Edge 构建
- 清理仓库：删除 Grunt、Bower 与 PSD 设计稿备份

**v1.3.12** 处理死循环问题

**v1.3.11** 支持 edge 浏览器，onedrive 登录时自动返回到选项页

**v1.3.10** 根据审核邮件，在进行云同步时用 modal 替换掉 jquery.blockUI

**v1.3.9** 增加 onedrive 支持

**v1.3.3** 修正 storage.sync 的处理

**v1.3.2** 增加 storage.sync 的支持，在支持 storage.sync 的浏览器（firefox 53 和更新的版本）可进行浏览器同步

**v1.3.1** 界面优化，增加双击打开用户规则，为用户规则编辑框增加清理按钮

**v1.3.0** 代码整理，增加示例规则测试、订阅规则展开功能、订阅规则可选更新功能，修正扩展启用时状态不一致的 bug

**v1.2.14** 增加查看自定义规则的 JSON 格式数据功能

**v1.2.13** 更正排除规则的 bug #9

_2017-01-22_ 整理配置界面

**v1.2.11** 升级 jquery 到 2.2.4，根据审核意见，修改 DOM 操作

**v1.2.10** （AMO 审核中）增加更多的重定向配置选项，支持根据请求方法、资源类型、排除地址进行过滤

**v1.2.9** 更正 options 中启用选项的 bug ，增加规则优先顺序调整功能

_2016-11-30_ 增加极客族的在线规则

**2016-11-03** **通过审核，已经上线 :-)**

**v1.2.8** 把 options/options.js 中的 jquery.html("") 方法替换为 jquery.empty() 方法

**v1.2.7** 根据审核邮件，去掉 moment.js 库，修改 options/options.js 中 DOM 的处理过程

**v1.2.6** 修复 BUG

**v1.2.5** 修复 background 中的 BUG

**v1.2.4** 在 background 中用 [alarms](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/alarms) 代替 setInterval

**v1.2.3** 界面调整，修正在线链接打开事件的 bug

**v1.2.2** 界面调整、性能优化，修正 chrome 和 firefox 兼容性方面的 bug，禁止添加多个相同在线规则

_2016-10-01_ 修改下载在线规则为异步处理，处理 Date 对象在 chrome 和 firefox 下的兼容性问题，微小的界面调整和性能优化，禁止添加多个相同的在线规则

**v1.2.1** 微小界面调整，适应 windows 上的显示，准备 chrome 支持

_2016-09-29_ 参考 https://lug.ustc.edu.cn/wiki/mirrors/help/revproxy , 更新 rules.json

**v1.2** 更正设置页面的重置按钮事件

**v1.1** 微小界面调整
