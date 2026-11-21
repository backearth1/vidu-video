# Vidu 视频生成 Web 服务

一个零依赖的 Web 控制台，通过 [Vidu 开放平台](https://platform.vidu.cn) API 生成视频。**所有输入参数均可在网页上调整**：

| 模式 | 说明 | 接口 |
|------|------|------|
| 参考生视频 | 1~7 张参考图 + 文本 → 主体一致视频 | `POST /ent/v2/reference2video` |
| 图生视频 | 1 张首帧图 + 文本 → 视频 | `POST /ent/v2/img2video` |
| 首尾帧生视频 | 首帧 + 尾帧 2 张图 + 文本 → 过渡视频 | `POST /ent/v2/start-end2video` |
| 智能多帧 | 2~9 个关键帧（各带提示词/时长）→ 多帧视频 | `POST /ent/v2/multiframe` |
| Drama 生视频 | 文生/首帧/首尾帧/多模态参考（v3 协议，Bearer 鉴权） | `POST /ent/api/v3/contents/generations/tasks` |
| 解说剧成片 | 剧本 + 资产（角色/场景/道具）→ 自动分镜解说剧（v1 协议） | `POST /ent/v1/explain-comic/tasks` |
| 短剧成片 | 分镜剧本 + 资产（均带参考图）→ 带台词短剧（v1 协议） | `POST /ent/v1/short-play/tasks` |
| Kling 生视频 | 第三方网关 www.ysxxai.com 调用 Kling（文生/图生，独立 Key） | `POST /v1/video/generations` |

> 站点：页面顶部可切换「国内 (api.vidu.cn)」/「海外 (api.vidu.com)」，各用对应的 API Key；NS 有声模型固定走 `.com`。

## 主体库（Subjects）

点顶部「主体库」按钮管理常用主体（`/ent/v2/subjects`）：

- **上传**：填名称 + 1~3 张图片（URL 或本地上传），创建主体。
- **预览 / 删除**：列表以缩略图展示所有主体；个人主体可删除（官方 `system` 主体只读）。
- **素材复用**：所有图片上传入口（参考图 / 首帧 / 关键帧 / 解说剧·短剧资产）旁多了「主体库」按钮，选用某主体后会把它的**托管图片 URL**填入输入框——这样请求体携带的是 URL 而非大体积 base64，避免单次请求上传大图片。

## 特性

- **全参数可调**：模型、时长、分辨率、宽高比、随机种子、运动幅度、风格、音频/BGM/音色、错峰、水印、元数据、回调地址等，逐项在页面表单中编辑。
- **图片支持 URL 或本地上传**（本地文件自动转 base64 data URI）。
- **原始 JSON 覆盖**：高级用户可直接注入/覆盖任意请求字段。
- **任务管理**：创建后可查询、自动轮询、取消，并在页面内预览/下载生成的视频。
- **API Key 服务端注入**：Key 通过本地代理转发，不写入前端代码；页面填写值优先，回退到环境变量。
- **零第三方依赖**：仅需 Node.js ≥ 18（内置 `fetch`）。

## 快速开始

```bash
# 1. 进入项目目录
cd viduvideo

# 2.（可选）配置默认 API Key，否则可在页面顶部填写
export VIDU_API_KEY="你的_vidu_api_key"

# 3. 启动
npm start          # 或： node server.js

# 4. 打开浏览器
open http://localhost:8080
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `VIDU_API_KEY` | 空 | 默认 API Key（页面填写值优先） |
| `VIDU_BASE_URL` | `https://api.vidu.cn/ent/v2` | Vidu API 基址（海外可改为 `https://api.vidu.com/ent/v2`） |
| `PORT` | `8080` | 监听端口 |
| `HOST` | `0.0.0.0` | 监听地址 |

## 使用流程

1. 顶部填写 API Key（或已设 `VIDU_API_KEY`）。
2. 选择顶部标签页切换生成模式。
3. 填写/调整参数，上传或粘贴图片。可点「预览请求体」检查将要发送的 JSON。
4. 点「生成视频」创建任务，页面返回 `task_id`。
5. 点「自动轮询」等待任务完成，视频将在右侧内嵌播放并提供下载链接。

## 项目结构

```
viduvideo/
├── server.js          # 零依赖 Node 服务器 + Vidu 代理
├── package.json
├── public/
│   ├── index.html     # 页面结构
│   ├── styles.css     # 样式
│   ├── schema.js      # 各模式完整参数 Schema（表单据此生成）
│   └── app.js         # 表单渲染 + 请求/轮询逻辑
└── README.md
```

## 说明

- 请求经本地服务端（`/api/*`）代理到 Vidu，避免在浏览器暴露 Key，同时规避跨域。
- 参数取值区间随模型不同而不同（如时长、分辨率），页面 help 文本给出提示；若服务端返回参数错误，请对照提示调整。
- 任务查询接口：`GET /ent/v2/tasks/{id}/creations`；取消接口：`POST /ent/v2/tasks/{id}/cancel`。
