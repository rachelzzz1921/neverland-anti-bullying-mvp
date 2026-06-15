# Neverland Anti-Bullying MVP

安全优先的职场霸凌应对练习原型：默认盾牌、分阶段陪练、风险管理与 STOP 闭环。

## 快速开始

```bash
npm install
cp .env.example .env.local   # 可选：配置 LLM
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

### 环境变量（可选）

| 变量 | 说明 |
|------|------|
| `AI_API_KEY` | 模型 API Key |
| `AI_API_BASE_URL` | OpenAI 兼容接口根地址 |
| `AI_MODEL` | 模型名称 |

未配置时自动使用本地安全兜底回复。

## 演示脚本

1. 默认盾牌聊 1 句 → 勾选知情同意 → 选择陪练人物
2. 开始练习 → 坏蛋开口 → 接招 → 引导 → **继续下一轮** → 再接招
3. 点 **随时进入复盘** → 填「学到了什么」→ 看 session 摘要（痛苦 before/after）
4. 演示 STOP：练习中按 STOP → 盾牌接管（服务端）
5. 演示危机：问卷 d9 非 0 → 危机出口，练习锁死

## 架构要点

- `src/components/mvp-app.tsx` — 主流程编排
- `src/lib/orchestrator.ts` — agent 分阶段决策
- `src/lib/risk-monitor.ts` — 风险 pre/post 扫描
- `src/lib/session-store.ts` — 本地 session 日志（AGENT_COLLABORATION §7）
- `src/app/api/chat/route.ts` — 统一聊天 API

## 脚本

```bash
npm run typecheck   # TypeScript 检查
npm run build       # 生产构建
npm run smoke       # API 冒烟测试（需 dev server 或 BASE_URL）
```

## 安全说明

本平台不替代专业医疗或危机干预。出现自伤或立即危险请寻求现实求助资源。
