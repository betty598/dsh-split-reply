# dsh-split-reply

> 让 QQ 那边的回复**一句一句发**：整段话按标点拆开，隔一两秒一条条送出去，像人在打字。

DeepSeek Harness 的 QQ 频道（`@tencent-connect/dsh-qqbot`）默认把一整段话一次性丢过去，读起来像公告。
装上这个插件，它会变成这样：

```
你：今天好累啊

她：怎么啦。
    是工作那边的事吗？
    那你早点睡，别硬撑。
      ← 这条 1.4 秒后到
      ← 这条 1.2 秒后到
```

## 它怎么做到的

`dsh-qqbot` 发出去的所有文字，最后都汇到 `QQBot.prototype.sendMarkdown` 这一个口子（正常回复、报错提示、文件投递、提问卡片全走它）。

本插件在这个原型方法外面包一层：

1. 拿到整段文本
2. 按 `。！？!?…~` 和换行切开
3. 太碎的并回去、太多的合并掉
4. 两条之间随机等 0.7–1.6 秒
5. 逐条发出去

**不改官方包**，只包一层原型方法，`dsh-qqbot` 升级也不受影响。

## 什么时候不拆

- 带按钮/键盘的消息（提问卡片、审批按钮）
- 含代码块、表格、Markdown 标题的回复
- 短句（少于 `minTotalChars` 个字）
- `enabled: false` 时全部放行

## 安装

### 手动装（推荐，先这样）

```bash
cd ~/.dsh/profiles/desktop

# 1. 把仓库放到 _plugins 下
git clone https://github.com/betty598/dsh-split-reply.git _plugins/dsh-split-reply

# 2. 跑安装脚本：写 package.json、建软链、加配置
node _plugins/dsh-split-reply/scripts/install.mjs "$PWD/_plugins/dsh-split-reply"
```

### 必须改一处 QQ 配置

**把 `im-qqbot` 的流式输出关掉**，否则回复走的是流式通道，根本不会经过这个口子：

```yaml
# ~/.dsh/profiles/desktop/cordis.patch.yml
- id: im-qqbot
  config:
    appId: '你的AppID'
    appSecret: 你的Secret
    streaming: false      # ← 加这一行
```

然后重启 DSH。

## 配置项

写在 `~/.dsh/profiles/desktop/cordis.patch.yml`：

```yaml
- id: split-reply
  name: dsh-split-reply
  config:
    enabled: true
    maxSegments: 4
    minSegmentChars: 4
    minTotalChars: 10
    minIntervalMs: 700
    maxIntervalMs: 1600
    splitOnNewline: true
```

| 键 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关 |
| `maxSegments` | `4` | 最多拆几条，超了自动合并 |
| `minSegmentChars` | `4` | 太短的碎片并回上一句 |
| `minTotalChars` | `10` | 整段短于这个字数就不拆 |
| `minIntervalMs` | `700` | 两条之间最短间隔 |
| `maxIntervalMs` | `1600` | 两条之间最长间隔 |
| `splitOnNewline` | `true` | 换行也算分段点 |

## 已知限制

- **只在 QQ 频道有效**。别的 IM 频道（如果以后有）走的是各自的发送口，得单独接。
- **QQ 官方对同一条消息的被动回复有次数上限（5 次）**，所以 `maxSegments` 默认 4。调大了会被限流，插件会把发失败的那条咽下去、不崩，但剩下的也发不出去了。
- 流式输出开着时本插件不生效（见上面「必须改一处 QQ 配置」）。
- 拆句靠标点。模型如果整段不用标点，就拆不动——它也只好一次性发完。

## 卸载

```bash
# 1. 从 cordis.patch.yml 里删掉 split-reply 那段
# 2. 从 package.json 的 dependencies 和 dsh.profile.bundles 里删掉 dsh-split-reply
# 3. 删掉 node_modules/dsh-split-reply 和 _plugins/dsh-split-reply
# 4. 重启
```

## 开发

```bash
node --test test/split.test.js
```

## 许可证

MIT
