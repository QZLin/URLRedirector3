URLRedirector
=============

使用 WebExtension 方式编写的 Firefox URL 重定向扩展，按正则表达式修改请求地址。

扩展的开发受 [gooreplacer](https://github.com/jiacai2050/gooreplacer) 启发，由于 gooreplacer 在 MAC 下运行时会遇到停止运行的问题，因此采用 WebExtension 方式实现。扩展仅支持正则表达式替换方式，不支持通配符。

可用于帮助网页开发和调试，以及解决国内无法访问 google CDN 之类的问题。

上架地址 [https://addons.mozilla.org/zh-CN/firefox/addon/urlredirector/](https://addons.mozilla.org/zh-CN/firefox/addon/urlredirector/)。

从 1.4.0 起，扩展只保留 Firefox 实现，使用 Manifest V3、事件页后台脚本和 `web-ext` 工具链：

- Chrome / Edge 构建已移除（`browser_action`、`options_page` 等兼容层随之删除）。
- 依赖 Firefox 独有、Chrome MV3 不支持的阻塞式 `webRequest`，因此**最低支持 Firefox 140**。
- 打包、校验、签名统一由 [`web-ext`](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/) 完成，不再使用 Grunt / Bower。

供用户使用的在线规则有:

- [https://raw.githubusercontent.com/fengyc/URLRedirector/master/tools/gooreplacer.gson](https://raw.githubusercontent.com/fengyc/URLRedirector/master/tools/gooreplacer.gson)
- [https://raw.githubusercontent.com/fengyc/URLRedirector/master/tools/rules.json](https://raw.githubusercontent.com/fengyc/URLRedirector/master/tools/rules.json)
- [极客族的在线规则](http://cdn.geekzu.org/cached.html) [https://raw.githubusercontent.com/fengyc/URLRedirector/master/tools/rules_geekzu.json](https://raw.githubusercontent.com/fengyc/URLRedirector/master/tools/rules_geekzu.json)
- [烧饼博客的在线规则](https://sb.sb/blog/css-cdn/) [https://raw.githubusercontent.com/fengyc/URLRedirector/master/tools/rules_lolinet.json](https://raw.githubusercontent.com/fengyc/URLRedirector/master/tools/rules_lolinet.json)

其它用户提供的规则：

- ivysrono 做的规则 [https://github.com/ivysrono/URLRedirectorRules](https://github.com/ivysrono/URLRedirectorRules)

版本和特性列表
-------

版本变更历史请查看 CHANGELOG 。

目前支持的特性：

1. 支持在线规则订阅、在线规则自动更新
2. 可禁用在线规则的某条特定规则（更新后被覆盖）
3. 支持自定义规则
4. 支持规则测试示例
5. 支持浏览器同步（`storage.sync`）
6. 支持云盘同步（目前支持 onedrive）
7. 支持按请求方法、资源类型、排除地址过滤

限于 WebExtension 的能力，目前不支持以本地文件方式导入、导出配置。

其它说明
--------

1. 规则示例

   简单规则，将 a.com 替换为 b.com ：

       原始地址 a.com  目标地址 b.com
       原始请求 https://www.a.com
       重定向到 https://www.b.com

   简单正则表达式：

       原始地址 a.*.com 目标地址 b.com
       原始请求 https://www.abc.com
       重定向到 https://www.b.com

   使用原始地址的部分信息：

       原始地址 (\d+).com  目标地址 com/$1
       原始请求 https://www.a.1.com
       重定向到 https://www.a.com/1

2. 内部实现

   规则引擎为 `src/shared/model.ts` 中的 `Rule` / `OnlineURL` / `Storage`，规则对象结构：

       {
           description: <规则描述，可选>
           origin: <原始地址正则表达式，必需>
           exclude: <排除地址正则表达式，可选>,
           methods: <原始请求方法列表，可选>
           types: <URL 资源类型列表，可选>
           target: <目标地址正则表达式，必需>
           example: <用于测试的示例地址，可选>
           enable: <是否启用，可选>
       }

   不在 Rule 对象描述中的字段可随意添加，不影响结果；
   请求方法可为 GET / POST / DELETE 等等，如 `["GET", "POST"]`；
   URL 资源类型见 [ResourceType](https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/ResourceType) 。

   在线规则使用一个包含了规则列表的 json 格式的文件表示：

       {
           version: <版本号，可选>,
           rules: <规则列表，必须>
       }

   整合了在线规则和规则对象的示例文件见 `tools` 目录下的 `rules_demo.json`。

   目前支持两种格式，通过 version 进行区分。
   （1）不包含 version 或 version < 1.0 时，使用 gooreplacer 定义的格式，见 `tools/gooreplacer.gson` 或 [https://github.com/jiacai2050/gooreplacer4chrome/raw/master/gooreplacer.gson](https://github.com/jiacai2050/gooreplacer4chrome/raw/master/gooreplacer.gson) ；
   （2）包含 version 且 version >= 1.0 时，使用新格式，见 `tools/rules.json` 。

   两种格式的主要区别在于 rules 字段，在 gooreplacer 中 rules 为对象，在新格式中，rules 为列表（为了在后期能更加方便地支持规则排序）。

   由于在线规则使用 json 格式，因此需要注意 json 转义符问题， [json 在线校验工具](http://json.cn/) 可检查文件内容是否符合 json 格式。

   用户定制的本地规则优先于在线规则，可覆盖在线规则。

开发
----

需要 Node.js 20.19+ 与 [pnpm](https://pnpm.io/)；运行扩展需要 Firefox 140+。

    pnpm install            # 安装依赖
    pnpm run dev            # 构建后启动 Firefox 并监听改动
    pnpm run build          # 生产构建（压缩、无 sourcemap），输出 dist/firefox
    pnpm run package        # 构建并用 web-ext 打包，输出 dist/artifacts/*.zip
    pnpm run sign           # 通过 AMO 签名，凭据放在 .env（见 .env.example）

常用的质量检查：

    pnpm run typecheck      # tsc --noEmit
    pnpm run lint           # ESLint
    pnpm run lint:webext    # web-ext lint，校验 manifest 与打包内容
    pnpm test               # Vitest 单元测试
    pnpm run check          # 上述检查 + Prettier 格式检查

在 `about:debugging` 中「临时载入附加组件」并选择 `dist/firefox/manifest.json` 也可以手动加载构建产物；`pnpm run dev` 会自动打开 Firefox、加载扩展并在源码变化时重载。

目录结构：

    src/manifest.json       # Manifest V3 清单，版本号由构建脚本注入
    src/background/         # 事件页：重定向与在线规则刷新
    src/options/            # 配置页
    src/popup/              # 工具栏弹窗
    src/cloud/              # OneDrive 同步
    src/shared/             # 规则模型、存储、i18n 等共享模块
    src/_locales/           # 界面翻译
    build/                  # esbuild 构建、打包、签名脚本
    tests/                  # Vitest 测试

依赖升级说明：

- Bootstrap 3.4.1 / jQuery 3.7.1 在构建时从 `node_modules` 复制到产物中，`src` 不再存放第三方资源。
- 页面脚本为 ES 模块并由 esbuild 打包，后台脚本打包成经典脚本（Firefox 目前仍以事件页运行后台脚本，不支持 service worker）。
- 新增依赖前请确认其兼容 Firefox 140+ 与 Manifest V3。

帮助 URLRedirector
----------------

我需要你的帮助来提高 URLRedirector 的功能和质量，你可以从以下几个（但不限于）方面提供你力所能及帮助：

1. 在 issue 中提出你遇到的问题或需要的功能
2. fork 本仓库，贡献你的代码或文档，并提交 pull request
3. 参与功能和 bug 的讨论

License
-------

Copyright © 2016 Yingcai FENG

The MIT License (MIT)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
