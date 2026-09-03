# 恋爱聊天助手 PWA - 手机版

纯前端 PWA，手机端直接调用 DeepSeek API，数据存手机本地（IndexedDB），离线可打开界面。

## 功能
- 联系人管理（新建/编辑/删除，含名字、关系阶段、性格标签、认识渠道、备注）
- 聊天记录（对方说/我说气泡、编辑/删除消息、批量粘贴、清空）
- 话题推荐（7 种场景 + 换一批避重 + 一键复制）
- 对话分析（态度/潜台词/回复建议/推进建议）
- 引用回复（14 种风格 + 引导话题 + 复制/填入）
- 关系推进提醒（每联系人顶部卡片）
- 演示模式（未填 Key 时返回预设样例）
- 日常口语风（AI 回复像真人发微信）

## 本地测试

1. 进入 pwa 目录
2. 启动 HTTP 服务：`python -m http.server 8888`
3. 电脑浏览器打开 `http://localhost:8888`
4. 点 ⚙️ 设置 → 填 DeepSeek API Key → 保存
5. 新建联系人 → 添加消息 → 点 💬 测试引用回复

## 部署到公网（免费 HTTPS）

### 方式一：Cloudflare Pages（推荐）

1. 注册免费 Cloudflare 账号：https://dash.cloudflare.com/sign-up
2. 进入 Pages → 创建项目 → 连接 Git 仓库（或直接上传）
3. 将 `pwa/` 目录下所有文件上传
4. 构建命令留空，输出目录填 `.`
5. 部署完成后拿到 `https://xxx.pages.dev` 地址
6. 手机浏览器打开这个地址

### 方式二：GitHub Pages

1. 创建 GitHub 仓库，上传 `pwa/` 目录下所有文件
2. Settings → Pages → Source 选 `main` 分支
3. 等几分钟后访问 `https://用户名.github.io/仓库名/`

### 方式三：Vercel

1. 注册 Vercel 账号
2. New Project → 上传 pwa/ 目录
3. 自动获得 `https://xxx.vercel.app` 地址

## iPhone 加到主屏幕

1. 手机 Safari 打开 PWA 地址（必须是 HTTPS）
2. 点底部分享按钮（⬆️ 图标）
3. 选"添加到主屏幕"
4. 桌面出现"恋爱助手"图标，点开就是全屏 App（无地址栏）

## Android 加到主屏幕

1. 手机 Chrome 打开 PWA 地址
2. 浏览器菜单 → "添加到主屏幕"
3. 桌面出现图标，点开是全屏 App

## 数据说明
- 数据存在手机本地 IndexedDB，不跨设备同步
- 电脑版和手机版数据不互通（各自本地存）
- 清除浏览器数据会删除所有联系人/聊天记录

## CORS 说明
DeepSeek API 允许 CORS（浏览器直连），无需代理。如果换用其他 AI 服务（如 OpenAI），可能需要配代理。
