# Agent 协作机制

> 版本 0.2 · 适用于当前成年人职场霸凌 MVP。
> 本机制的核心目标不是让 agent 更会表演，而是让系统在「支持 → 练习 → 引导 → 复盘 → 回归」之间可控切换，避免二次伤害。

## 1. 协作总原则

五个 agent 不平权，练习中**不能手动混用**。系统必须有明确的安全优先级：

1. **风险管理**优先级最高，但不直接对用户说话。它只判断，输出结构化安全指令。
2. **盾牌**是用户的主锚点。任何不确定、痛苦上升、STOP、危机信号，都回到盾牌。
3. **坏蛋**只在用户主动同意、强度锁允许时出现，且**必须先开口**。
4. **引导**只在用户接招后出现，只教应对，不做情绪安抚，不继续扮演坏蛋。
5. **复盘**读取整段练习记忆，在引导之后出现，不复述敌意原话。

一句话协作模型：

```text
风险管理在后台判定边界，盾牌维持安全感，坏蛋提供受控刺激，引导教用户接招，复盘把整轮练习沉淀为学习。
```

## 2. Agent 的系统位置

| Agent | 是否对用户可见 | 什么时候出现 | 核心职责 | 退出条件 |
|---|---:|---|---|---|
| 盾牌 | 是 | 默认入口、STOP 后、危机前后、练习结束后 | 承接情绪、稳定用户、帮助命名事实 | 用户主动选择进入练习且安全允许 |
| 坏蛋 | 是 | 练习开始，**第一个发言** | 模拟低/中强度职场敌意，供用户接招 | 用户回应后自动退出；或 STOP / 风险升高 |
| 引导 | 是 | 用户接招后，**自动接上** | 教用户如何更好回击和设立边界 | 用户点击进入复盘 |
| 复盘 | 是 | 引导完成后 | 读取整段 session memory，给出整体复盘建议 | 用户回到盾牌 |
| 风险管理 | 否 | 全程后台运行 | 读对话、读状态、输出安全指令 | 不退出，始终在线 |

## 3. 练习阶段机（严格顺序）

练习中 agent **按阶段自动切换**，用户不能手动点选 agent tab。

```text
idle（选人物）
  -> start：坏蛋开口（villain_open → user_reply）
  -> respond：用户接招 → 引导教练（coach_guide）
  -> debrief：复盘读完整 memory（debrief）
  -> 回到盾牌（shield_return）
```

### 阶段 1：坏蛋开口

- 用户选人物、点「开始练习」
- 坏蛋主动说第一句
- 引导、复盘、盾牌均不出现

### 阶段 2：你接招

- 用户输入回应
- 系统把 villain 原话 + user 回应写入 session memory

### 阶段 3：引导教练

- 引导读取 memory，针对用户回应给 1-2 个可选回击句式
- 不做情绪安抚，不模拟坏蛋

### 阶段 4：复盘

- 复盘读取**整段** memory（坏蛋 + 用户 + 引导）
- 给出整体复盘建议，不复述敌意原话

### 全局状态机（含盾牌）

风险管理 agent **全程后台运行**，不直接对用户说话。每次 API 请求都会：
1. **pre 扫描**：用户输入、痛苦评级、危机问卷、练习记忆
2. **post 扫描**：坏蛋/引导/复盘刚生成的回复（检测红线）
3. 输出标准 JSON（`risk_level` / `signal` / `reason`），必要时强制切回盾牌

```text
WELCOME_SHIELD
  -> PRE_CHECK
  -> SHIELD_SUPPORT
  -> CONSENT_GATE
  -> PRACTICE_IDLE
  -> PRACTICE_VILLAIN_OPEN
  -> PRACTICE_USER_REPLY
  -> PRACTICE_COACH_GUIDE
  -> PRACTICE_DEBRIEF
  -> SHIELD_RETURN
```

### WELCOME_SHIELD

用户进入系统后默认由盾牌说话。

目标：
- 建立“这里安全”的第一印象。
- 不急着问量表，不急着推练习。
- 让用户知道练习是可选的。

允许 agent：
- 盾牌
- 风险管理后台

### PRE_CHECK

系统收集最低限度的安全状态。

输入：
- 当次痛苦评级 1-5
- 危机预警项
- 用户是否愿意进入练习

输出：
- 当前可开放 agent 列表
- 当前陪练强度上限

规则：
- 痛苦 4-5：只开放盾牌
- 痛苦 2-3：盾牌 + 复盘 + 低强度陪练
- 痛苦 1：盾牌 + 复盘 + 低/中强度陪练
- 任何危机信号：crisis_exit

### SHIELD_SUPPORT

盾牌先承接情绪，再帮助用户整理事实。

典型动作：
- 命名感受，但不放大。
- 区分“事实、感受、解释”。
- 询问用户是否想练习一个很小的回应。

禁止动作：
- 推销练习。
- 直接给“你应该辞职/投诉”的决定。
- 模拟坏蛋。

### CONSENT_GATE

进入坏蛋陪练前必须有知情同意门。

用户必须明确知道：
- 接下来会出现带敌意的职场语言。
- 强度被系统锁住，不开放高强度。
- 可以随时 STOP。
- STOP 后不会被追击，会立刻回到盾牌。

如果用户没有主动同意，不能进入坏蛋。

### PRACTICE_RUNNING

坏蛋在练习场内说话，但它不是自由 agent。

坏蛋每次生成前必须收到运行时上下文：

```json
{
  "agent": "villain",
  "distress_level": 1,
  "max_intensity": "low | medium",
  "forbidden_content": [
    "身份侮辱",
    "暴力威胁",
    "性相关内容",
    "自伤相关内容",
    "主动升级攻击"
  ],
  "stop_policy": "收到停止或降级信号立即停止，不补最后一句"
}
```

坏蛋的输出应短、可控、可练习。

低强度示例：

```text
这个先放一放吧，我们现在时间比较紧。
```

中强度示例：

```text
我觉得你这个方案还没想清楚，先别急着让大家跟着你走。
```

不允许示例：

```text
你这种人就是...
我让你在这个行业混不下去...
你是不是想不开...
```

### PRACTICE_STOPPED

触发方式：
- 用户点击 STOP。
- 用户输入停止词。
- 风险管理输出 `stop_and_shield`。
- 坏蛋触红线。
- 当前练习达到轮次上限。

规则：
- 坏蛋立刻停止。
- 不允许坏蛋补一句“最后反扑”。
- 系统显示“练习已停止，盾牌接管”。
- 下一条用户可见消息必须来自盾牌。

### DEBRIEF

复盘必须发生在练习之后，但要先确认用户是否已经落地。

复盘顺序：
1. 问用户现在感觉如何。
2. 用中性语言指代刚才发生的互动。
3. 让用户自己说哪个时刻最难。
4. 指出一个具体做得好的地方。
5. 只讨论一个下次可尝试的回应。

禁止：
- 复述坏蛋攻击原话。
- 打分。
- 列大量改进清单。

### SHIELD_RETURN

复盘后回到盾牌，形成闭环。

盾牌收尾目标：
- 让用户知道练习已经结束。
- 把注意力带回现实。
- 给用户一个可暂停的出口。

## 4. 风险管理输出协议

风险管理 agent 只输出 JSON：

```json
{
  "risk_level": "none | elevated | high | crisis",
  "signal": "continue | reduce_intensity | stop_and_shield | crisis_exit",
  "reason": "一句话说明观察到的依据"
}
```

系统消费规则：

| signal | 系统动作 | UI 动作 | 下一位可见 agent |
|---|---|---|---|
| continue | 保持当前状态 | 正常显示 | 当前 agent |
| reduce_intensity | 降低陪练强度 | 强度标签变低，提示“已降级” | 当前 agent 或盾牌 |
| stop_and_shield | 停止练习 | STOP 状态，高亮安全提示 | 盾牌 |
| crisis_exit | 撤下全部模拟 | 显示现实世界求助资源 | 盾牌 / 危机出口内容 |

原则：
- 存疑时升一级。
- 风险管理不诊断，只描述观察到的信号。
- 风险管理的输出优先于坏蛋 prompt。

## 5. 编排器职责

当前系统不需要给用户展示“导演/编排器”角色，但工程上需要一个编排层。

编排器负责：
- 读取用户状态。
- 决定当前允许哪个 agent 说话。
- 给 agent 注入运行时上下文。
- 调用风险管理。
- 在 STOP 或风险升高时强制切换。
- 记录每次练习前后痛苦评级。

编排器不负责：
- 直接安抚用户。
- 扮演坏蛋。
- 做心理诊断。

推荐伪代码：

```ts
if (risk.signal === "crisis_exit") {
  currentAgent = "shield";
  mode = "crisis_exit";
}

if (risk.signal === "stop_and_shield" || userPressedStop) {
  currentAgent = "shield";
  mode = "practice_stopped";
}

if (mode === "practice_running" && consented && maxIntensity !== "locked") {
  currentAgent = "villain";
}

if (mode === "debrief") {
  currentAgent = "debrief";
}
```

## 6. UI 联动规则

MVP 页面必须让用户持续知道三件事：

1. 我现在在哪个模式。
2. 我随时可以停。
3. 系统不会让坏蛋无限升级。

必要 UI：
- 常驻 STOP。
- 当前安全指令。
- 当前强度上限。
- 当前说话 agent。
- 练习前知情同意。
- 练习后复盘入口。
- 危机出口资源。

避免 UI：
- 把坏蛋做成游戏 boss。
- 用“挑战成功/失败”打分。
- 用红色、警报、攻击性视觉强化陪练。
- 把风险管理做成一个用户可聊天角色。

## 7. 数据与日志

MVP 至少记录：

| 字段 | 用途 |
|---|---|
| session_id | 区分每次练习 |
| mode | 当前状态机状态 |
| active_agent | 当前可见 agent |
| distress_before | 练习前痛苦评级 |
| distress_after | 练习后痛苦评级 |
| max_intensity | 当次强度上限 |
| risk_signal | 风险管理输出 |
| stop_triggered | 用户是否主动 STOP |
| debrief_takeaway | 用户复盘时说出的收获 |

不建议早期记录：
- 过长原始创伤叙述。
- 未脱敏的公司、人名、同事身份。
- 坏蛋攻击原话的完整回放。

## 8. 可迁移 Skill 清单

### 已在本机可直接借用

| Skill | 可迁移部分 | 如何迁移到本项目 |
|---|---|---|
| `ai-sdk` | AI 调用、结构化输出、agent 消费模式 | 后续把 `/api/chat` 升级成 AI SDK route，并让风险管理输出 JSON |
| `nextjs` | App Router、route handler、server-only env | 当前已经用于页面和 `/api/chat` |
| `env-vars` | 密钥隔离、`.env.local`、不暴露 `NEXT_PUBLIC_` | 当前已经用于阶跃星辰 key 接入 |
| `web-design-guidelines` | UI/UX 审查、可访问性、状态反馈 | 用于审查 STOP、危机出口、问卷移动端体验 |
| `verification` | 端到端验证思路：浏览器 -> API -> 模型 -> UI | 用于每次改 agent 编排后跑完整对话流 |
| `roadmap` | 阶段式交付、MVP 范围控制 | 用于把“安全闭环”作为 Phase 1，不提前做演员市场 |
| `improve-codebase-architecture` | 架构边界、模块拆分、可测试性 | 后续把 agent、risk、orchestrator、UI 状态拆成模块 |
| `create-skill` / `skill-creator` | 把本项目沉淀成专属 skill | 等机制稳定后，创建 `anti-bullying-agent-safety` 项目 skill |

### 外部 skills.sh 候选

以下是搜索到的候选，建议只借鉴，不立即作为核心依赖：

| Skill | 安装量 | 判断 |
|---|---:|---|
| `yonatangross/orchestkit@agent-orchestration` | 589 | 可参考 agent 编排概念，但安装量未到 1K，谨慎 |
| `davila7/claude-code-templates@llamaguard` | 301 | 可参考 moderation/guardrail 思路，但需验证来源和适配度 |
| `gtmagents/gtm-agents@moderation-safety-playbook` | 60 | 安装量低，只适合概念参考 |
| `bencium/bencium-marketplace@bencium-controlled-ux-designer` | 1.6K | UX 方向可评估，安装量较好，但与心理安全场景仍需人工筛选 |

### 建议自建的项目专属 Skill

如果这个项目继续推进，最值得迁移成 skill 的不是“坏蛋话术”，而是安全编排流程。

建议 skill 名：

```text
anti-bullying-agent-safety
```

包含内容：
- 四 agent 状态机。
- 坏蛋红线。
- 风险管理 JSON schema。
- STOP/降级/危机出口 UI checklist。
- 复盘禁止复述规则。
- 每次改动后的验证脚本。

这个 skill 可以让后续任何 agent 在改项目时先读安全规则，避免只做“更刺激的陪练”。

## 9. 下一步落地

建议按这个顺序继续：

1. 把当前 `/api/chat` 抽象成 `src/lib/orchestrator.ts`。
2. 新增 `/api/risk`，让风险管理独立输出 JSON。
3. 前端每次用户发送后先跑 risk，再决定是否允许调用坏蛋。
4. 把 STOP、risk signal、distress before/after 写入 session store。
5. 用 `web-design-guidelines` 做一次 UI 审查。
6. 等流程稳定后，用 `create-skill` 沉淀项目专属安全 skill。
