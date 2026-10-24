# URLRedirector3

使用 WebExtension 编写的 Firefox URL 重定向扩展，按正则表达式改写请求地址，可用于网页调试，或替换 CDN 域名。

本扩展是 [URLRedirector](https://github.com/fengyc/URLRedirector) 的修改版，在其代码基础上继续维护。感谢原作者 [Yingcai FENG](https://github.com/fengyc) `The MIT License (MIT) Copyright © 2016 Yingcai FENG`。

- 上架地址：<https://addons.mozilla.org/zh-CN/firefox/addon/urlredirector3/>
- 仓库：<https://github.com/QZLin/URLRedirector3>
- 问题反馈：<https://github.com/QZLin/URLRedirector3/issues>

扩展使用 Manifest V3 与事件页后台脚本，依赖 Firefox 独有的阻塞式 `webRequest`，**最低支持 Firefox 140**；只支持正则表达式替换，不支持通配符。打包、校验、签名统一由 [`web-ext`](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/) 完成。

## 规则订阅

以下在线规则可直接用作订阅地址：

- <https://raw.githubusercontent.com/fengyc/URLRedirector/master/tools/gooreplacer.gson>
- <https://raw.githubusercontent.com/fengyc/URLRedirector/master/tools/rules.json>
- [极客族的在线规则](http://cdn.geekzu.org/cached.html)：<https://raw.githubusercontent.com/fengyc/URLRedirector/master/tools/rules_geekzu.json>
- [烧饼博客的在线规则](https://sb.sb/blog/css-cdn/)：<https://raw.githubusercontent.com/fengyc/URLRedirector/master/tools/rules_lolinet.json>

其它用户维护的规则：[ivysrono/URLRedirectorRules](https://github.com/ivysrono/URLRedirectorRules)。

## 特性

1. 自定义规则，支持正则替换、`$1` 形式的捕获组引用，以及 URL / Base64 编解码处理
2. 规则可按请求方法、资源类型、排除地址过滤
3. 在线规则订阅，可定时自动刷新，可单独禁用订阅里的某条规则
4. 规则测试框：输入示例地址即时预览替换结果
5. 配置页修改即时自动保存（带保存状态提示）
6. 规则列表可拖拽排序，或用上下按钮移动（按住 Shift 跳到首/尾）
7. 按住 Shift 添加规则、点击标题或点击行，会把新规则放在列表顶部
8. 双击规则打开编辑弹窗，弹窗内可删除该规则（需二次确认）
9. 以 JSON 查看用户规则；粘贴 JSON 导入，重复与不完整的条目会被跳过
10. 浏览器同步（`storage.sync`）与 OneDrive 云备份
11. 工具栏弹窗可一键开关重定向

限于 WebExtension 的能力，目前不支持以本地文件方式导入、导出配置；需要备份时请用 JSON 查看/粘贴或 OneDrive。

## 权限与隐私

| 权限                               | 用途                                      |
| ---------------------------------- | ----------------------------------------- |
| `webRequest`、`webRequestBlocking` | 在请求发出前改写地址                      |
| `<all_urls>`                       | 规则可作用于任意站点                      |
| `storage`                          | 保存规则与设置（可选同步到 Firefox 账号） |
| `alarms`                           | 定时刷新在线规则                          |
| `tabs`                             | 打开配置页、OneDrive 登录后切回配置页     |

没有遥测。对外请求只有两类：用户自己填写的订阅地址（定时下载规则），以及用户主动触发时的 OneDrive 接口。manifest 声明 `data_collection_permissions: none`。

## 规则示例

把 `a.com` 换成 `b.com`：

    原始地址  a.com      目标地址  b.com
    原始请求  https://www.a.com
    重定向到  https://www.b.com

用正则匹配子域：

    原始地址  a.*.com    目标地址  b.com
    原始请求  https://www.abc.com
    重定向到  https://www.b.com

引用原始地址中的片段：

    原始地址  (\d+).com  目标地址  com/$1
    原始请求  https://www.a.1.com
    重定向到  https://www.a.com/1

## 规则格式

规则引擎见 `src/shared/model.ts` 的 `Rule` / `OnlineURL` / `Storage`。单条规则的字段：

```js
{
  description: "规则描述，可选",
  origin: "原始地址正则表达式，必需",
  exclude: "排除地址正则表达式，可选",
  methods: ["GET"],                 // 请求方法，可选，留空表示全部
  types: ["script"],                // 资源类型，可选，留空表示全部
  target: "目标地址，必需，支持 $1",
  example: "用于测试的示例地址，可选",
  enable: true,                     // 可选，默认 false（导入时为 true）
  process: "urlEncode"              // 可选：urlEncode / urlDecode / base64Encode / base64Decode
}
```

未列出的字段会被忽略。`methods` 可取 GET / POST / DELETE 等；`types` 见 [ResourceType](https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/ResourceType)。

规则文件是一个 JSON 对象，`rules` 为规则列表：

```json
{ "version": "1.0", "rules": [{ "origin": "a.com", "target": "b.com" }] }
```

格式由 `version` 区分：缺省或 `< 1.0` 时按 gooreplacer 的对象形式解析（见 `tools/gooreplacer.gson`）；`>= 1.0` 时按上面的列表形式解析（见 `tools/rules.json`）。完整示例见 `tools/rules_demo.json`。JSON 转义容易出错，可先用校验工具检查。

用户自定义规则优先于在线规则，可覆盖在线规则。导入时也接受裸的规则数组或单条规则对象。

改写结果与原地址相同的规则（如 `a.com` → `a.com`）会被跳过，不影响其后的规则。

## 开发

需要 Node.js 20.19+、[pnpm](https://pnpm.io/) 12.14（`packageManager` 已锁定，建议用 `corepack enable`）与 Firefox 140+。运行 `pnpm run dev` 还要求安装 **Firefox Developer Edition**（`web-ext-config.mjs` 指定）；用其它渠道可在命令后加 `--firefox=firefox`。

构建环境细节、产物映射和 AMO 源码审查说明见 [SOURCE.md](SOURCE.md)。

```sh
corepack enable
pnpm install

pnpm run dev            # 开发构建，启动 Firefox 加载扩展并监听改动
pnpm run watch          # 只监听并重建
pnpm run build          # 生产构建（压缩、无 sourcemap）到 dist/firefox
pnpm run package        # 构建并用 web-ext 打包到 dist/artifacts
pnpm run sign           # 通过 AMO 签名，凭据放 .env（见 .env.example）
pnpm run pack-src       # 生成供 AMO 源码审查的源码 zip
pnpm run clean          # 删除 dist、coverage、web-ext-artifacts 与 *.log
pnpm run clean --all    # 连同 node_modules 一起删除
```

质量检查（`pnpm run check` 已包含前四项）：

```sh
pnpm run format:check   # Prettier
pnpm run typecheck      # tsc --noEmit
pnpm run lint           # ESLint
pnpm test               # Vitest
pnpm run lint:webext    # web-ext lint
```

也可以在 `about:debugging#/runtime/this-firefox` 用「临时载入附加组件」直接加载 `dist/firefox/manifest.json`。

发布前：更新 `package.json` 的 `version`、在 CHANGELOG 记一条、跑 `pnpm run check`、`pnpm run package`，提审时同时上传 `pnpm run pack-src` 生成的源码包。清单里的名称、描述、版本、主页与 gecko 元数据都只写在 `package.json`，构建时注入 manifest。

### 目录结构

    src/manifest.json       # Manifest V3 清单骨架，名称/描述/版本/主页/gecko 元数据由构建从 package.json 注入
    src/background/         # 事件页：重定向与在线规则刷新
    src/options/            # 配置页
    src/popup/              # 工具栏弹窗
    src/cloud/              # OneDrive 同步
    src/shared/             # 规则模型、存储、i18n、URL 常量等共享模块
    src/_locales/           # 界面翻译
    src/static/             # 项目样式与图标
    build/                  # esbuild 构建、打包、签名、源码打包脚本
    tests/                  # Vitest 测试
    tools/                  # 示例规则与截图

### 依赖说明

- 无 jQuery、无 Bootstrap JavaScript：交互逻辑是原生 DOM，弹窗/折叠等少量行为由 `src/shared/ui.ts` 提供。
- 只保留 Bootstrap 5.3.8 的样式表与 Bootstrap Icons 字体，构建时从 `node_modules` 复制进产物；图标用 Bootstrap Icons，`src/static/css/app.css` 只放少量项目级样式。
- 页面脚本是 ES 模块，后台脚本打成经典脚本（Firefox 仍以事件页运行后台脚本，不支持 service worker）。
- 新增依赖前请确认兼容 Firefox 140+ 与 Manifest V3。
- Bootstrap 与 Bootstrap Icons 均以 MIT 许可，作为构建依赖随产物分发。

翻译放在 `src/_locales/<lang>/messages.json`；新增语言时把目录名加进 `_locales`，并确认它不为 `default_locale`。

## 帮助

1. 在 issue 中报告问题或提需求
2. fork 本仓库，提交代码或文档的 pull request
3. 参与功能与 bug 的讨论

## License

本项目以 MIT 许可发布，详见 [LICENSE](LICENSE)。
