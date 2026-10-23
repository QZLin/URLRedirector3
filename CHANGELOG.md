**v1.4.0** 工程现代化，只保留 Firefox 实现

- 迁移到 Manifest V3：`action`、`host_permissions`、`web_accessible_resources` 新格式、`browser_specific_settings` 与 `data_collection_permissions`，最低支持 Firefox 140
- 后台改为事件页脚本，阻塞式 `webRequest` 用法随之改为异步；设置改为带就绪 Promise 的缓存，避免事件页唤醒后读到空配置
- 源码迁移到 TypeScript 与 ES 模块（`src/shared`、`src/background`、`src/options`、`src/popup`、`src/cloud`），由 esbuild 打包
- 抛弃 Grunt / Bower，改用 pnpm + esbuild + `web-ext`（`run` / `lint` / `build` / `sign`）
- jQuery 3.3 → 3.7.1、Bootstrap 3.3.7 → 3.4.1，改为构建时从 `node_modules` 复制
- 请求改用 `fetch`，移除 jQuery.ajax 与 `jquery.blockUI`
- 更严格的正则处理：非法表达式不再抛异常，只忽略该规则
- 增加 Vitest 测试（规则引擎、在线规则解析、manifest、后台重定向与下载流程）
- 移除 Chrome / Edge 构建

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
