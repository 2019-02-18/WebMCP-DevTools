# Chrome 内置了 AI 工具协议？WebMCP 抢先体验 + 开源 DevTools 全解析

上周在逛 Chrome 的实验性 API 时，我发现了一个让我瞬间坐直的东西：

**`navigator.modelContext`**

这是 Chrome 正在实验的一个浏览器原生 API，允许网页直接给 AI 注册可调用的工具。没错，不是第三方库，不是 npm 包，是**浏览器原生**的。

我当时的反应是：这不就是 MCP 的浏览器版？

于是我花了两周做了一个 Chrome 扩展，不仅能调试这些工具，还能把浏览器里的工具桥接到 Cursor 里直接用。今天把整个过程和思路分享出来。

> 项目已开源，文末有链接。

---

## 先说结论：WebMCP 是什么

你大概率听过 MCP（Model Context Protocol），Anthropic 搞的那个 AI 工具调用协议。现在几乎所有 AI 客户端都支持了。

**WebMCP 做的事情更激进** —— 它让浏览器成为工具的载体。

一段 JavaScript 就够了：

```javascript
navigator.modelContext.registerTool({
  name: 'get_weather',
  description: '查询城市天气',
  inputSchema: {
    type: 'object',
    properties: {
      city: { type: 'string', description: '城市名' }
    },
    required: ['city']
  },
  execute: async ({ city }) => {
    const res = await fetch(`/api/weather?city=${city}`);
    return res.json();
  }
});
```

更离谱的是，连 JavaScript 都不用写 —— HTML 表单就行：

```html
<form toolname="coffee_order" tooldescription="点一杯咖啡">
  <select name="type" required>
    <option value="latte">拿铁</option>
    <option value="americano">美式</option>
  </select>
  <button type="submit">下单</button>
</form>
```

**HTML 表单即工具。** 你的 `<form>` 加两个属性，AI 就知道怎么帮你填表了。

---

## 痛点：API 有了，工具呢？

WebMCP 目前要手动启用 `chrome://flags/#enable-webmcp-testing`，还在实验阶段。

我启用之后遇到的第一个问题是：**我注册了工具，然后呢？**

- 页面注册了哪些工具？不知道
- Schema 长什么样？得自己 `console.log`
- 想执行一下？得自己写调用代码
- 多个标签页的工具？完全看不到

Chrome DevTools 里也没有 WebMCP 面板。

所以我决定自己做一个。

---

## WebMCP DevTools：我做了什么

一个 Chrome 侧面板扩展，打开就能看到当前所有标签页的 WebMCP 工具。

### 工具检测 + Schema 可视化

自动检测所有标签页注册的工具，Schema 以树形结构展开，支持 `$ref`、`allOf`、`oneOf`、`anyOf` 等高级特性。

<!-- 图片：tools-schema.png — 工具列表 + Schema 展开视图 -->
![工具列表](./images/tools-schema.png)

### 一键执行

点工具卡片，自动生成交互式表单。填参数，点执行，结果即时返回。也可以切换成原始 JSON 模式手写参数。

<!-- 图片：execute.png — 执行面板，填入参数和返回结果 -->
![执行面板](./images/execute.png)

### 执行历史 + 性能统计

每次执行自动记录，统计成功率、平均耗时、最快最慢。还能按来源区分 —— 手动执行、AI 助手调用、还是 MCP Bridge 远程调用。

<!-- 图片：history.png — 历史记录和统计面板 -->
![执行历史](./images/history.png)

### 内置 AI 助手

侧面板里直接和 AI 对话，AI 可以自动调用页面上的 WebMCP 工具。

比如我说"你来选择"，AI 自己调了 `coffee_order`，帮我点了杯拿铁：

<!-- 图片：ai-panel.png — AI 对话 + 工具调用过程 -->
![AI 助手](./images/ai-panel.png)

流式输出、Markdown 渲染、代码语法高亮都有。

### 快照对比

保存工具定义快照，下次迭代时一键 diff —— 开发过程中特别实用。

<!-- 图片：snapshots.png — 快照管理界面 -->
![快照](./images/snapshots.png)

---

## 重头戏：让 Cursor 调用浏览器里的工具

这是 2.0 版本最核心的能力。

**场景：** 你在浏览器里打开了一个带 WebMCP 工具的页面，你希望在 Cursor 里让 AI 直接调用这些工具。

**问题：** WebMCP 工具存在于浏览器沙箱里，外部 AI 客户端根本碰不到。

**我的方案：** 做一个 MCP Bridge Server，在浏览器和 AI 客户端之间架一座桥。

```
Cursor / Claude Desktop
       ↕  stdio (MCP 协议)
  MCP Bridge Server
       ↕  WebSocket (localhost)
   Chrome 扩展
       ↕  Content Script
     网页上的 WebMCP 工具
```

### 30 秒配置

npm 包已经发布了，在 Cursor 的 `.cursor/mcp.json` 里加一行：

```json
{
  "mcpServers": {
    "webmcp-devtools": {
      "command": "npx",
      "args": ["-y", "webmcp-devtools-server"]
    }
  }
}
```

然后在扩展面板点 **Bridge** 连接，完事。

### 实际效果

在 Cursor 里列出浏览器工具：

```
> webmcp_list_tools

Found 8 WebMCP tool(s):
- fortune_telling: 星座运势预测 [read-only]
- split_bill: 多人聚餐后智能AA分账
- random_picker: 选择困难症终结者
- world_clock: 全球城市时间查询 [read-only]
- gen_password: 安全密码生成器
- unit_convert: 通用单位换算
- coffee_order: 下单一杯咖啡 [declarative]
- event_signup: 活动报名 [declarative]
```

直接调用：

```
> webmcp_call_tool fortune_telling {"zodiac":"天秤座","aspect":"事业"}

{
  "星座": "天秤座",
  "运势指数": "84/100",
  "幸运色": "玫瑰金",
  "今日建议": "适合整理思绪，为下周做规划"
}
```

**从 Cursor 到浏览器页面上的工具，整条链路完全打通。**

---

## 踩的一些坑

### Chrome MV3 Service Worker 休眠

Service Worker 大约 30 秒无活动就会被 Chrome 干掉，WebSocket 连接随之断开。

我的方案是双层心跳保活：
- 客户端用 `chrome.alarms` 每 24 秒 PING
- 服务端每 20 秒 PING

两端互相保活，Service Worker 就不会被杀了。

### 端口泄漏

MCP Bridge 的 Node.js 进程如果异常退出，WebSocket 端口不会释放，下次启动就会报 `EADDRINUSE`。

解决方案是注册所有退出信号：

```javascript
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.stdin.on('close', cleanup);
process.on('exit', () => bridge.stop());
```

### 工具消息格式

AI 的 Function Calling 对消息格式要求很严格 —— `tool_calls` 需要有 `id`，`tool` 类型的消息需要对应 `tool_call_id`。这块调了不少时间才跑通。

---

## 在线体验

我做了一个中文演示页面，注册了 8 个好玩的工具供体验：

| 工具 | 说明 | 类型 |
|------|------|------|
| 🔮 今日运势 | 星座运势预测 | 只读 |
| 💰 AA 记账 | 智能分账（嵌套对象+数组） | 编程式 |
| 🎲 随机决定器 | 选择困难症终结者 | 编程式 |
| 🌍 世界时钟 | 多城市时间对比 | 只读 |
| 🔑 密码生成器 | 安全密码+强度评估 | 编程式 |
| 📊 单位换算 | 长度/重量/温度等互转 | 编程式 |
| ☕ 咖啡订单 | 声明式表单工具 | 声明式 |
| 🎉 活动报名 | 声明式表单工具 | 声明式 |

<!-- 图片：demo-page.png — 演示页面整体截图 -->
![演示页面](./images/demo-page.png)

> 需要先启用 `chrome://flags/#enable-webmcp-testing`

---

## 快速上手

**第一步：启用 WebMCP**

```
chrome://flags/#enable-webmcp-testing → Enabled → 重启
```

**第二步：安装扩展**

[Chrome Web Store 下载](https://chromewebstore.google.com/detail/webmcp-devtools/cgfogfkcfjdgpekdndcihajfjkaekjcl)

或者从源码构建：

```bash
git clone https://github.com/2019-02-18/WebMCP-DevTools.git
cd WebMCP-DevTools && pnpm install && pnpm build
```

**第三步：连接 MCP Bridge（可选）**

```json
{
  "mcpServers": {
    "webmcp-devtools": {
      "command": "npx",
      "args": ["-y", "webmcp-devtools-server"]
    }
  }
}
```

---

## 写在最后

WebMCP 还在早期实验阶段，但方向很明确：**浏览器要成为 AI 的原生工具平台。**

想象一下：
- 电商网站暴露"搜索商品""加入购物车"工具
- 银行网站暴露"查余额""转账"工具
- 所有这些，用户授权后 AI 就能操作

这不是科幻，这是 Chrome 正在做的事。

WebMCP DevTools 是我为这个未来做的第一步 —— 帮开发者更好地开发和调试 WebMCP 工具。

**GitHub：** [github.com/2019-02-18/WebMCP-DevTools](https://github.com/2019-02-18/WebMCP-DevTools)

**npm：** [webmcp-devtools-server](https://www.npmjs.com/package/webmcp-devtools-server)

**Chrome Web Store：** [WebMCP DevTools](https://chromewebstore.google.com/detail/webmcp-devtools/cgfogfkcfjdgpekdndcihajfjkaekjcl)

如果对你有帮助，点个 ⭐ 和 👍 呗。有问题欢迎评论区交流。
