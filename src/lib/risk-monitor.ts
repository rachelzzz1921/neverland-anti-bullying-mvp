import { agentPrompts } from "@/lib/mvp-content";

export type RiskMonitorLevel = "none" | "elevated" | "high" | "crisis";
export type RiskMonitorSignal =
  | "continue"
  | "reduce_intensity"
  | "stop_and_shield"
  | "crisis_exit";

export type SessionMemoryTurn = {
  speaker: "villain" | "user" | "coach" | "debrief" | "system";
  content: string;
};

export type PracticeAction = "start" | "respond" | "next_round" | "debrief";
export type PracticePhase =
  | "idle"
  | "villain_open"
  | "user_reply"
  | "coach_guide"
  | "debrief"
  | "stopped";
export type Intensity = "low" | "medium";

/** 风险管理 agent 输出的标准 JSON */
export type RiskMonitorResult = {
  risk_level: RiskMonitorLevel;
  signal: RiskMonitorSignal;
  reason: string;
  source: "rules" | "model" | "merged";
  stage: "pre" | "post";
  monitored_turn: string;
};

export type RiskMonitorInput = {
  mode: "shield" | "practice";
  action?: PracticeAction;
  practicePhase?: PracticePhase;
  userInput?: string;
  agentReply?: string;
  memory?: SessionMemoryTurn[];
  distressLevel: number;
  crisisScore?: number;
  intensity?: Intensity;
  stage: "pre" | "post";
};

const crisisPatterns = [
  /自杀|自残|不想活|结束生命|伤害自己/,
  /杀了他|杀了她|报复|弄死|伤害别人/,
];

const distressPatterns = [/撑不住|崩溃|受不了|快疯了|想哭|手在抖|喘不过气/];
const stopPatterns = [/停|停止|够了|结束|退出|STOP/i];
const villainRedLinePatterns = [
  /去死|废物|垃圾|贱人|滚出|白痴|蠢货/,
  /开除你|让你混不下去|毁掉你的职业|在行业里混不下去/,
  /女司机|女的就该|你这个外地人|乡巴佬/,
];

const RISK_LEVEL_RANK: Record<RiskMonitorLevel, number> = {
  none: 0,
  elevated: 1,
  high: 2,
  crisis: 3,
};

const SIGNAL_RANK: Record<RiskMonitorSignal, number> = {
  continue: 0,
  reduce_intensity: 1,
  stop_and_shield: 2,
  crisis_exit: 3,
};

function formatMemoryForRisk(memory: SessionMemoryTurn[]): string {
  const labels: Record<SessionMemoryTurn["speaker"], string> = {
    villain: "坏蛋",
    user: "用户",
    coach: "引导",
    debrief: "复盘",
    system: "系统",
  };
  return memory.map((turn) => `[${labels[turn.speaker]}] ${turn.content}`).join("\n");
}

export function getRiskAgentPrompt(): string {
  return agentPrompts.find((item) => item.id === "risk")?.prompt ?? "";
}

function monitoredTurnLabel(input: RiskMonitorInput): string {
  if (input.mode === "shield") return "shield";
  return [input.mode, input.action ?? "none", input.practicePhase ?? "idle", input.stage].join(":");
}

function collectTexts(input: RiskMonitorInput): string[] {
  const texts = [input.userInput ?? "", input.agentReply ?? ""];
  for (const turn of input.memory ?? []) {
    texts.push(turn.content);
  }
  return texts.filter(Boolean);
}

export function evaluateRiskMonitor(input: RiskMonitorInput): RiskMonitorResult {
  const texts = collectTexts(input);
  const combined = texts.join("\n");
  const userOnly = [
    input.userInput ?? "",
    ...(input.memory ?? []).filter((t) => t.speaker === "user").map((t) => t.content),
  ].join("\n");

  const villainTexts = [
    input.agentReply && input.stage === "post" ? input.agentReply : "",
    ...(input.memory ?? []).filter((t) => t.speaker === "villain").map((t) => t.content),
  ].filter(Boolean);

  if ((input.crisisScore ?? 0) > 0) {
    return {
      risk_level: "crisis",
      signal: "crisis_exit",
      reason: "问卷危机预警项不为 0，撤下全部模拟。",
      source: "rules",
      stage: input.stage,
      monitored_turn: monitoredTurnLabel(input),
    };
  }

  if (crisisPatterns.some((pattern) => pattern.test(combined))) {
    return {
      risk_level: "crisis",
      signal: "crisis_exit",
      reason: "检测到自我伤害、伤害他人或危机相关表达。",
      source: "rules",
      stage: input.stage,
      monitored_turn: monitoredTurnLabel(input),
    };
  }

  if (stopPatterns.some((pattern) => pattern.test(input.userInput ?? ""))) {
    return {
      risk_level: "high",
      signal: "stop_and_shield",
      reason: "用户发出停止信号，练习终止并回到盾牌。",
      source: "rules",
      stage: input.stage,
      monitored_turn: monitoredTurnLabel(input),
    };
  }

  if (villainTexts.some((text) => villainRedLinePatterns.some((pattern) => pattern.test(text)))) {
    return {
      risk_level: "high",
      signal: "stop_and_shield",
      reason: "坏蛋输出触及内容红线，立即停止陪练。",
      source: "rules",
      stage: input.stage,
      monitored_turn: monitoredTurnLabel(input),
    };
  }

  if (input.distressLevel >= 4) {
    return {
      risk_level: "high",
      signal: "stop_and_shield",
      reason: "会话前痛苦评级偏高，练习场应锁定。",
      source: "rules",
      stage: input.stage,
      monitored_turn: monitoredTurnLabel(input),
    };
  }

  const distressHits = distressPatterns.filter((pattern) => pattern.test(userOnly)).length;
  if (distressHits >= 2) {
    return {
      risk_level: "high",
      signal: "stop_and_shield",
      reason: "多轮对话中痛苦信号反复出现，建议停止练习。",
      source: "rules",
      stage: input.stage,
      monitored_turn: monitoredTurnLabel(input),
    };
  }

  if (input.distressLevel >= 3 || distressHits === 1) {
    return {
      risk_level: "elevated",
      signal: "reduce_intensity",
      reason: "痛苦有上升趋势，降低陪练强度并持续监控。",
      source: "rules",
      stage: input.stage,
      monitored_turn: monitoredTurnLabel(input),
    };
  }

  if (/滚|废物|去死|垃圾/.test(input.userInput ?? "")) {
    return {
      risk_level: "elevated",
      signal: "reduce_intensity",
      reason: "检测到高攻击性语言，建议降级监控。",
      source: "rules",
      stage: input.stage,
      monitored_turn: monitoredTurnLabel(input),
    };
  }

  return {
    risk_level: "none",
    signal: "continue",
    reason: "用户参与正常，情绪在可承受范围，风险管理持续监控中。",
    source: "rules",
    stage: input.stage,
    monitored_turn: monitoredTurnLabel(input),
  };
}

export function mergeRiskResults(
  primary: RiskMonitorResult,
  secondary: RiskMonitorResult | null | undefined,
): RiskMonitorResult {
  if (!secondary) return primary;

  const pickLevel =
    RISK_LEVEL_RANK[secondary.risk_level] > RISK_LEVEL_RANK[primary.risk_level]
      ? secondary.risk_level
      : primary.risk_level;
  const pickSignal =
    SIGNAL_RANK[secondary.signal] > SIGNAL_RANK[primary.signal]
      ? secondary.signal
      : primary.signal;

  if (pickLevel === primary.risk_level && pickSignal === primary.signal) {
    return primary;
  }

  return {
    risk_level: pickLevel,
    signal: pickSignal,
    reason: `${primary.reason}；模型补充：${secondary.reason}`,
    source: "merged",
    stage: primary.stage,
    monitored_turn: primary.monitored_turn,
  };
}

export function parseRiskModelOutput(raw: string): RiskMonitorResult | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]) as {
      risk_level?: string;
      signal?: string;
      reason?: string;
    };
    const level = parsed.risk_level;
    const signal = parsed.signal;
    if (
      !level ||
      !signal ||
      !["none", "elevated", "high", "crisis"].includes(level) ||
      !["continue", "reduce_intensity", "stop_and_shield", "crisis_exit"].includes(signal)
    ) {
      return null;
    }

    return {
      risk_level: level as RiskMonitorLevel,
      signal: signal as RiskMonitorSignal,
      reason: parsed.reason?.trim() || "风险管理模型返回监控信号。",
      source: "model",
      stage: "pre",
      monitored_turn: "model",
    };
  } catch {
    return null;
  }
}

export function buildRiskModelContext(input: RiskMonitorInput): string {
  const memoryText = input.memory?.length ? formatMemoryForRisk(input.memory) : "（无）";
  return [
    "请评估以下运行时上下文，并严格只输出风险管理 JSON。",
    `模式：${input.mode}`,
    `动作：${input.action ?? "none"}`,
    `阶段：${input.practicePhase ?? "idle"}`,
    `监控时点：${input.stage}`,
    `痛苦评级：${input.distressLevel}/5`,
    `危机预警项：${input.crisisScore ?? 0}`,
    `陪练强度：${input.intensity ?? "n/a"}`,
    `用户输入：${input.userInput || "（无）"}`,
    `Agent 回复：${input.agentReply || "（尚未生成）"}`,
    "练习记忆：",
    memoryText,
  ].join("\n");
}

export function shouldForceShield(risk: RiskMonitorResult): boolean {
  return risk.signal === "stop_and_shield" || risk.signal === "crisis_exit";
}

export function shouldReduceIntensity(risk: RiskMonitorResult): boolean {
  return risk.signal === "reduce_intensity";
}

/** 兼容旧编排字段 */
export function toLegacyRisk(risk: RiskMonitorResult): {
  level: "safe" | "watch" | "blocked";
  reasons: string[];
  action: "continue" | "downgrade" | "stop";
} {
  if (risk.signal === "crisis_exit" || risk.signal === "stop_and_shield") {
    return { level: "blocked", reasons: [risk.reason], action: "stop" };
  }
  if (risk.signal === "reduce_intensity") {
    return { level: "watch", reasons: [risk.reason], action: "downgrade" };
  }
  return { level: "safe", reasons: [risk.reason], action: "continue" };
}

export async function fetchRiskModelAssessment(
  input: RiskMonitorInput,
): Promise<RiskMonitorResult | null> {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_API_BASE_URL;
  const model = process.env.AI_MODEL;
  if (!apiKey || !baseUrl || !model) return null;

  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: getRiskAgentPrompt() },
          { role: "user", content: buildRiskModelContext(input) },
        ],
        temperature: 0,
      }),
    });

    const result = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = result.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    const parsed = parseRiskModelOutput(content);
    if (!parsed) return null;
    return { ...parsed, stage: input.stage, monitored_turn: monitoredTurnLabel(input) };
  } catch {
    return null;
  }
}

export async function runContinuousRiskMonitor(
  input: RiskMonitorInput,
): Promise<RiskMonitorResult> {
  const ruleRisk = evaluateRiskMonitor(input);
  const modelRisk = await fetchRiskModelAssessment(input);
  return mergeRiskResults(ruleRisk, modelRisk);
}
