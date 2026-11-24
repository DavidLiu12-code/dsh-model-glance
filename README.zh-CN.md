# ModelGlance

**一个精致、轻量的 DeepSeek Harness 模型选择器。**

ModelGlance 把输入框里那个小模型按钮换成一个两段式选择器：日常切换用紧凑单列弹窗，浏览模型用带提供商侧栏的展开面板。它只是 DSH 已有模型选择机制的一层皮肤 —— 读宿主的模型目录，请宿主切换模型。它不保存任何凭据、不发任何网络请求、不碰你的提供商配置。

<p align="center">
  <img src="docs/images/compact-light.png" alt="紧凑模型选择器（浅色）" width="620">
</p>
<p align="center">
  <img src="docs/images/expanded-dark.png" alt="展开面板与提供商侧栏（深色）" width="760">
</p>

> 截图来自隔离测试环境，用的是演示目录。它们展示插件本身；你的提供商与模型会不一样。

## 为什么做它

宿主自带的控件刻意做得极简：一个名字、一个箭头、也许一个推理档位角标。模型只有两三个时够用；一旦变成三个提供商、十几个模型、几个收藏，再加上「哪个支持推理」记不清，就不够用了。ModelGlance 补的是结构 —— 搜索、提供商、收藏、最近使用、真实档位 —— 而不是把选模型变成一套管理后台。

## 功能

- **两种视图**：锚定在输入框模型按钮上方的紧凑弹窗；带窄侧栏的展开面板（左侧导航 + 右侧连续列表）。
- **搜索与提供商过滤**：大小写不敏感，匹配名称、id 与描述。
- **收藏与最近使用**：本地只存 `<provider>/<model>` 标识。当前正在用的模型会进入最近使用；宿主没有历史接口，装插件之前的使用记录无法重建。
- **只显示真实推理档位**：哪些档位可用由宿主决定。模型没有 reasoning 元数据时，整行档位不出现 —— 绝不虚构档位。
- **跟随主题**：所有颜色都是宿主 `--dsw-alias-*` token 或由其 `color-mix()` 派生，浅色/深色跟随宿主外观设置，插件没有独立开关。
- **键盘操作**：`↑`/`↓` 移动、`Enter` 切换、`Esc` 关闭并把焦点还给按钮、`→`/`←` 在紧凑与展开之间切换。**不注册任何全局快捷键**，不会和命令面板冲突。
- **对失败诚实**：切换被拒时保留原模型、面板保持打开、显示宿主给出的原因；切换成功时紧凑弹窗自动关闭、展开面板保持打开。

## 安装

需要 **DSH 0.2.3-alpha.2 或更高**。仅在 `0.2.3-alpha.2` 上验证过 —— 宿主处于 alpha 通道，slot 契约可能随版本变化。

```sh
git clone https://github.com/<你的用户名>/dsh-model-glance.git
dsh plugin --profile desktop add /绝对路径/dsh-model-glance
```

然后**完全退出并重新打开 DSH**。新会话里输入框就会显示新的模型控件。

卸载：

```sh
dsh plugin --profile desktop remove dsh-model-glance
```

除此之外不改动任何东西：插件不在自己的包以外留文件，只在 profile 清单里加一行依赖，以及一个随卸载一起删除的目录链接。

### 手工接线（进阶，不推荐）

如果 `dsh plugin add` 在你的 profile 里跑不起来（例如该 profile 里别的包引用了已被清理的本地 tgz），也可以手工达到同样效果：在 profile 的 `package.json` 里加 `dsh.profile.bundles` 条目与 `link:` 依赖，再在 profile 的 `node_modules` 里建一个目录 junction。ModelGlance 本身不需要特殊处理，这个退路只是因为插件加载器跑在该 profile 的 pnpm 工作区里。走这条路之前请先备份 profile。

## 实现方式

ModelGlance 以 `priority: -1` 注册 `conversation.input.model`。单值 slot 渲染优先级最低的条目，因此这是**确定性地接管**，而不是依赖注册顺序。随后它使用注入的座位接口 —— `directory`（快照仓库）、`load()`、`select()` —— 也就是内置 `/model` 弹窗使用的同一个会话级模型目录。`select()` 解析出非 `ok` 结果或抛错即为失败，其余为成功；任何情况下都不做乐观更新。

如果该 slot 已被别的插件占用，ModelGlance **完全不注册**：只打印一条警告，把座位留给对方。它不会停用、重排或卸载任何其他插件。

## 安全

除了 UI slot，插件没有任何宿主能力：

- 不访问文件系统、不执行 shell、不起子进程；
- 不发起任何网络请求，无遥测、无自动更新、无远程代码；
- 不读取凭据、API Key、Base URL 或提供商配置；
- 不写宿主状态 —— 唯一持久化的是宿主页面 `localStorage` 里的收藏与最近使用；
- 在你的 profile 里只增加一行依赖和一个链接，卸载即移除。

安装插件必然会写 profile 目录，这不是零风险操作，本文不会声称它是。

## 已知限制

- 只美化输入框座位；宿主自带的 `/model` 弹窗保持原样。
- 不渲染第三方注册的 `conversation.input.model.label` 徽章。
- **不显示上下文窗口、输入模态、价格**：浏览器侧目录里没有这些字段，要显示就必须新开一条网络路由，本插件拒绝这样做。
- 不复制宿主特有的 tooltip 与选项行。
- 子代理会话在 DSH 里本来就没有模型选择器，这里也没有。
- 尚未测试超大目录（100+ 提供商）、多显示器、以及同时装饰输入框的其他插件。

## 开发

客户端半边是一个手写的 `client.js` —— 无打包、无运行时依赖。React 与 `react-dom` 在运行时由宿主模块表提供。

```sh
node tests/smoke.mjs          # 离屏：假宿主 + 真实 SSR 渲染，不需要启动应用
```

浏览器测试跑在隔离 profile 上（绝不碰你的真实 profile）：

```sh
# 终端 1：隔离 profile 监听 5199
set DSH_HOME=D:\path\to\.test-home
dsh --profile modelglance-test --port 5199

# 终端 2
set MG_APP_URL=http://127.0.0.1:5199
node tests/e2e.mjs            # 行为 + 100/125/150% 与 720px 布局
node tests/failure.mjs        # 被拒的切换、输入法回车
node tests/catalog.mjs        # 注入 30 个模型的目录、截断、滚动
```

每个套件证明什么、需要哪些环境变量，见 [`tests/README.md`](tests/README.md)。

`design/` 是插件 CSS 所依据的 HTML 视觉参考稿。它是样品，不属于运行时包。

## 兼容性

| DSH | 状态 |
| --- | --- |
| 0.2.3-alpha.2 | 已验证（smoke 4/4、e2e 30/30、failure 8/8、catalog 14/14） |
| 其他版本 | **未验证** |

## 许可证

MIT —— 见 [LICENSE](LICENSE)。
