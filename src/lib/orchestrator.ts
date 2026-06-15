import {
  agentPrompts,
  villainPersonas,
  type VillainPersona,
} from "@/lib/mvp-content";
import {
  evaluateRiskMonitor,
  toLegacyRisk,
  type RiskMonitorResult,
} from "@/lib/risk-monitor";
import { appendVillainRuntime } from "@/lib/villain-runtime";

export type AgentId = "shield" | "villain" | "coach" | "debrief";
export type Intensity = "low" | "medium";
export type PracticePhase =
  | "idle"
  | "villain_open"
  | "user_reply"
  | "coach_guide"
  | "debrief"
  | "stopped";

export type PracticeAction = "start" | "respond" | "next_round" | "debrief";

export const MAX_PRACTICE_ROUNDS = 5;

export type SessionMemoryTurn = {
  speaker: "villain" | "user" | "coach" | "debrief" | "system";
  content: string;
};

export type RiskLevel = "safe" | "watch" | "blocked";

export type RiskAssessment = {
  level: RiskLevel;
  reasons: string[];
  action: "continue" | "downgrade" | "stop";
};

export type OrchestratorDecision = {
  agent: AgentId;
  practicePhase: PracticePhase;
  practiceAction?: PracticeAction;
  risk: RiskAssessment;
  riskMonitor: RiskMonitorResult;
  blocked: boolean;
  stopReason?: string;
  systemPrompt: string;
  fallbackReply: string;
  memoryContext?: string;
};


type RiskContext = {
  mode: "shield" | "practice";
  action?: PracticeAction;
  practicePhase?: PracticePhase;
  userInput?: string;
  memory?: SessionMemoryTurn[];
  distressLevel: number;
  crisisScore?: number;
  intensity?: Intensity;
};

function preRiskMonitor(ctx: RiskContext): RiskMonitorResult {
  return evaluateRiskMonitor({
    mode: ctx.mode,
    action: ctx.action,
    practicePhase: ctx.practicePhase,
    userInput: ctx.userInput,
    memory: ctx.memory,
    distressLevel: ctx.distressLevel,
    crisisScore: ctx.crisisScore,
    intensity: ctx.intensity,
    stage: "pre",
  });
}

function withRisk(
  ctx: RiskContext,
  decision: Omit<OrchestratorDecision, "risk" | "riskMonitor">,
): OrchestratorDecision {
  const riskMonitor = preRiskMonitor(ctx);
  const risk = toLegacyRisk(riskMonitor);
  return { ...decision, risk, riskMonitor };
}

function shieldStopDecision(
  ctx: RiskContext,
  userInput: string,
  stopReason: string,
  practicePhase: PracticePhase = "stopped",
): OrchestratorDecision {
  return withRisk(ctx, {
    agent: "shield",
    practicePhase,
    blocked: true,
    stopReason,
    systemPrompt: getAgentPrompt("shield"),
    fallbackReply: fallbackReply("shield", userInput),
  });
}

/** @deprecated 使用 risk-monitor 模块 */
export function assessRisk(input: string, distressLevel: number): RiskAssessment {
  return toLegacyRisk(
    evaluateRiskMonitor({
      mode: "shield",
      userInput: input,
      distressLevel,
      stage: "pre",
    }),
  );
}

export function getAgentPrompt(agent: AgentId): string {
  const found = agentPrompts.find((item) => item.id === agent);
  return found?.prompt ?? agentPrompts[0].prompt;
}

export function getVillainPersona(personaId: VillainPersona["id"]): VillainPersona {
  return villainPersonas.find((persona) => persona.id === personaId) ?? villainPersonas[0];
}

export function getVillainOpening(
  personaId: VillainPersona["id"],
  intensity: Intensity,
): string {
  const persona = getVillainPersona(personaId);
  if (intensity === "medium") {
    return persona.sampleLine;
  }
  const softened = persona.sampleLine.replace(/！/g, "。").replace(/你/g, "这边");
  return softened.length > 8 ? softened : persona.sampleLine;
}

export function formatMemoryForPrompt(memory: SessionMemoryTurn[]): string {
  const labels: Record<SessionMemoryTurn["speaker"], string> = {
    villain: "坏蛋",
    user: "用户",
    coach: "引导",
    debrief: "复盘",
    system: "系统",
  };
  return memory
    .map((turn) => `[${labels[turn.speaker]}] ${turn.content}`)
    .join("\n");
}

export function countPracticeRounds(memory: SessionMemoryTurn[]): number {
  return memory.filter((turn) => turn.speaker === "coach").length;
}

export function getDialogueForVillain(memory: SessionMemoryTurn[]): SessionMemoryTurn[] {
  return memory.filter((turn) => turn.speaker === "villain" || turn.speaker === "user");
}

function buildVillainOpeningContext(personaId: VillainPersona["id"], intensity: Intensity): string {
  const persona = getVillainPersona(personaId);
  return [
    `当前人物：${persona.name}（${persona.shortName}）`,
    `场景：${persona.scenario}`,
    `强度：${intensity === "low" ? "低" : "中"}`,
    intensity === "low" ? `风格：${persona.lowStyle}` : `风格：${persona.mediumStyle}`,
    "你是第一个开口的人。主动发起一轮职场对话，只输出一句开场，不要解释规则。",
  ].join("\n");
}

function buildVillainFollowUpContext(
  personaId: VillainPersona["id"],
  intensity: Intensity,
  memory: SessionMemoryTurn[],
): string {
  const persona = getVillainPersona(personaId);
  const round = countPracticeRounds(memory) + 1;
  const dialogue = getDialogueForVillain(memory);
  const labels: Record<"villain" | "user", string> = { villain: "坏蛋", user: "用户" };
  const transcript = dialogue
    .map((turn) => `[${labels[turn.speaker as "villain" | "user"]}] ${turn.content}`)
    .join("\n");

  return [
    `当前人物：${persona.name}（${persona.shortName}）`,
    `场景：${persona.scenario}`,
    `强度：${intensity === "low" ? "低" : "中"}`,
    intensity === "low" ? `风格：${persona.lowStyle}` : `风格：${persona.mediumStyle}`,
    `参考语气（勿原样照抄）：${persona.followUpLine}`,
    `当前是第 ${round} 轮对话。`,
    "以下是到目前为止的对话，请接着用户最后一句继续回应。",
    "只输出一句，不要解释规则，不要主动升级强度，不要越红线。",
    transcript,
  ].join("\n");
}

function villainFollowUpFallback(personaId: VillainPersona["id"], round: number): string {
  const persona = getVillainPersona(personaId);
  if (round === 2) return persona.followUpLine;
  const lines = [
    persona.followUpLine,
    "说完了没有？我待会儿还有会，别耽误大家时间。",
    "你这套说法听起来很合理，但现场不是这么运作的。",
    "行，你继续讲，但我只认最后交付的东西。",
  ];
  return lines[Math.min(round - 2, lines.length - 1)] ?? persona.followUpLine;
}

function buildCoachContext(memory: SessionMemoryTurn[], personaId?: VillainPersona["id"]): string {
  const persona = personaId ? getVillainPersona(personaId) : null;
  return [
    "以下是本轮练习的完整记录。请只针对用户最后那句回应做应对指导。",
    persona ? `人物教练提示：${persona.coachScenario}` : "",
    formatMemoryForPrompt(memory),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildDebriefContext(memory: SessionMemoryTurn[], takeaway?: string): string {
  const rounds = countPracticeRounds(memory);
  return [
    `以下是整场练习的完整沉淀记忆（共 ${rounds} 轮接招）。请做整体复盘，不复述敌意原话。`,
    takeaway ? `用户填写的收获：${takeaway}` : "",
    formatMemoryForPrompt(memory),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function villainSystemPrompt(
  base: string,
  context: string,
  distressLevel: number,
  intensity: Intensity,
): string {
  return appendVillainRuntime(`${base}\n\n${context}`, distressLevel, intensity);
}

const SHIELD_RETURN_FRAGMENT = [
  "练习已结束。请帮用户把注意力拉回现实：",
  "- 确认身体感受，不复述陪练原话",
  "- 提醒可以随时回来找盾牌聊",
  "- 语气平稳、短，不强迫用户继续",
].join("\n");

export function getShieldReturnPrompt(): string {
  return `${getAgentPrompt("shield")}\n\n${SHIELD_RETURN_FRAGMENT}`;
}

export function fallbackReply(
  agent: AgentId,
  input: string,
  memory?: SessionMemoryTurn[],
  villainPersonaId?: VillainPersona["id"],
): string {
  if (agent === "shield") {
    if (input === "STOP") {
      return "练习已经停下来了。你不用继续接招，我们可以先慢慢说刚才最难受的是哪一句。";
    }
    if (input.includes("练习结束") || input.includes("回到盾牌")) {
      return "这轮练习到这里就好。把注意力放回现实，如果身体还紧，可以先喝口水、动一动肩膀。想聊的时候我一直在。";
    }
    return "我在这儿。我们先不继续练习，你可以慢慢说刚才最难受的是哪一句。";
  }

  if (agent === "villain") {
    const round = memory ? countPracticeRounds(memory) + 1 : 1;
    const personaId = villainPersonaId ?? "gross_boss";
    if (round > 1) return villainFollowUpFallback(personaId, round);
    return getVillainPersona(personaId).sampleLine;
  }

  if (agent === "coach") {
    const persona = villainPersonaId ? getVillainPersona(villainPersonaId) : null;
    return [
      "**你刚才做对了什么**：你没有沉默，把回应说了出来。",
      "**卡住的点**：对方想把话题从事实带向对你的评价。",
      persona ? `**人物提示**：${persona.coachScenario}` : "",
      "**下次可以怎么说**：",
      "「我需要先把时间点和验收标准对齐，再讨论结果。」",
      "「请给出具体依据，我们按事实推进。」",
      "**为什么有效**：把争论从「你行不行」拉回「事情怎么做」。",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (agent === "debrief") {
    const rounds = memory ? countPracticeRounds(memory) : 0;
    return [
      "**现在感觉怎么样**：练完几轮后，身体有没有比刚才松一点？",
      rounds > 1
        ? `**你做得好的时刻**：你在 ${rounds} 轮里至少有一次把话题拉回事实，没有一直沉默。`
        : "**你做得好的时刻**：你完成了接招，并听取了引导建议。",
      "**反复出现的模式**：对方几次想把节奏带走，这是你需要守住的点。",
      "**下次只练一件事**：只练一句——「我们先把依据对齐。」",
      "**可以带走的一句话**：我不是要赢吵架，我只要把事实放回原位。",
    ].join("\n");
  }

  return `我听到了：${input.slice(0, 80)}。我们先慢一点，把节奏放回你手里。`;
}

export function decidePracticeTurn(input: {
  action: PracticeAction;
  userInput?: string;
  memory: SessionMemoryTurn[];
  distressLevel: number;
  crisisScore?: number;
  consentGiven: boolean;
  intensity: Intensity;
  villainPersona: VillainPersona["id"];
  takeaway?: string;
}): OrchestratorDecision {
  const {
    action,
    userInput = "",
    memory,
    distressLevel,
    crisisScore = 0,
    consentGiven,
    intensity,
    villainPersona,
    takeaway,
  } = input;

  const riskCtx: RiskContext = {
    mode: "practice",
    action,
    userInput,
    memory,
    distressLevel,
    crisisScore,
    intensity,
  };

  if (!consentGiven) {
    return withRisk(
      { ...riskCtx, practicePhase: "idle" },
      {
        agent: "shield",
        practicePhase: "idle",
        blocked: true,
        stopReason: "请先完成知情同意，再进入坏蛋模式。",
        systemPrompt: getAgentPrompt("shield"),
        fallbackReply: fallbackReply("shield", userInput),
      },
    );
  }

  const pre = preRiskMonitor(riskCtx);
  if (pre.signal === "crisis_exit" || pre.signal === "stop_and_shield") {
    return shieldStopDecision(
      { ...riskCtx, practicePhase: action === "start" ? "idle" : "stopped" },
      userInput,
      pre.reason,
      action === "start" ? "idle" : "stopped",
    );
  }

  if (action === "start") {
    const opening = getVillainOpening(villainPersona, intensity);
    return withRisk(
      { ...riskCtx, practicePhase: "user_reply" },
      {
        agent: "villain",
        practicePhase: "user_reply",
        practiceAction: "start",
        blocked: false,
        systemPrompt: villainSystemPrompt(
          getAgentPrompt("villain"),
          buildVillainOpeningContext(villainPersona, intensity),
          distressLevel,
          intensity,
        ),
        fallbackReply: opening,
      },
    );
  }

  if (action === "respond") {
    const updatedMemory: SessionMemoryTurn[] = [
      ...memory,
      { speaker: "user", content: userInput },
    ];

    return withRisk(
      { ...riskCtx, practicePhase: "coach_guide", memory: updatedMemory },
      {
        agent: "coach",
        practicePhase: "coach_guide",
        practiceAction: "respond",
        blocked: false,
        systemPrompt: `${getAgentPrompt("coach")}\n\n${buildCoachContext(updatedMemory, villainPersona)}`,
        fallbackReply: fallbackReply("coach", userInput, updatedMemory, villainPersona),
        memoryContext: formatMemoryForPrompt(updatedMemory),
      },
    );
  }

  if (action === "next_round") {
    const rounds = countPracticeRounds(memory);

    if (rounds === 0 || !memory.some((turn) => turn.speaker === "user")) {
      return shieldStopDecision(
        { ...riskCtx, practicePhase: "coach_guide" },
        userInput,
        "请先完成至少一轮接招，再继续下一轮。",
        "coach_guide",
      );
    }

    if (rounds >= MAX_PRACTICE_ROUNDS) {
      return shieldStopDecision(
        { ...riskCtx, practicePhase: "coach_guide" },
        userInput,
        `本轮练习已达 ${MAX_PRACTICE_ROUNDS} 轮上限，请进入复盘或 STOP。`,
        "coach_guide",
      );
    }

    const nextRound = rounds + 1;
    return withRisk(
      { ...riskCtx, practicePhase: "user_reply" },
      {
        agent: "villain",
        practicePhase: "user_reply",
        practiceAction: "next_round",
        blocked: false,
        systemPrompt: villainSystemPrompt(
          getAgentPrompt("villain"),
          buildVillainFollowUpContext(villainPersona, intensity, memory),
          distressLevel,
          intensity,
        ),
        fallbackReply: villainFollowUpFallback(villainPersona, nextRound),
        memoryContext: formatMemoryForPrompt(memory),
      },
    );
  }

  // debrief
  return withRisk(
    { ...riskCtx, practicePhase: "debrief" },
    {
      agent: "debrief",
      practicePhase: "debrief",
      practiceAction: "debrief",
      blocked: false,
      systemPrompt: `${getAgentPrompt("debrief")}\n\n${buildDebriefContext(memory, takeaway)}`,
      fallbackReply: fallbackReply("debrief", userInput, memory, villainPersona),
      memoryContext: formatMemoryForPrompt(memory),
    },
  );
}

/** 盾牌默认态：非练习流程中的对话 */
export function decideShieldTurn(input: {
  userInput: string;
  distressLevel: number;
  crisisScore?: number;
  consentGiven: boolean;
}): OrchestratorDecision {
  const { userInput, distressLevel, crisisScore = 0, consentGiven } = input;
  const riskCtx: RiskContext = {
    mode: "shield",
    userInput,
    distressLevel,
    crisisScore,
    practicePhase: "idle",
  };

  if (!consentGiven && /练习|坏蛋|陪练|对抗/.test(userInput)) {
    return withRisk(riskCtx, {
      agent: "shield",
      practicePhase: "idle",
      blocked: true,
      stopReason: "进入练习前需要先完成知情同意。",
      systemPrompt: getAgentPrompt("shield"),
      fallbackReply: "我理解你想练一练。我们先确认知情同意，再进入坏蛋模式，这样更稳。",
    });
  }

  const pre = preRiskMonitor(riskCtx);
  if (pre.signal === "crisis_exit" || pre.signal === "stop_and_shield") {
    return shieldStopDecision(riskCtx, userInput, pre.reason, "stopped");
  }

  return withRisk(riskCtx, {
    agent: "shield",
    practicePhase: "idle",
    blocked: false,
    systemPrompt: getAgentPrompt("shield"),
    fallbackReply: fallbackReply("shield", userInput),
  });
}

/** 复盘后 SHIELD_RETURN：练习收尾，注意力回现实 */
export function decideShieldReturnTurn(input: {
  distressLevel: number;
  crisisScore?: number;
}): OrchestratorDecision {
  const { distressLevel, crisisScore = 0 } = input;
  const riskCtx: RiskContext = {
    mode: "shield",
    userInput: "（练习结束，回到盾牌）",
    distressLevel,
    crisisScore,
    practicePhase: "idle",
  };

  return withRisk(riskCtx, {
    agent: "shield",
    practicePhase: "idle",
    blocked: false,
    systemPrompt: getShieldReturnPrompt(),
    fallbackReply: fallbackReply("shield", "练习结束，回到盾牌"),
  });
}
