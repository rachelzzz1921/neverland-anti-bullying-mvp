import { NextResponse } from "next/server";
import {
  decidePracticeTurn,
  decideShieldReturnTurn,
  decideShieldTurn,
  fallbackReply,
  type Intensity,
  type OrchestratorDecision,
  type PracticeAction,
  type SessionMemoryTurn,
} from "@/lib/orchestrator";
import type { VillainPersona } from "@/lib/mvp-content";
import {
  mergeRiskResults,
  runContinuousRiskMonitor,
  shouldForceShield,
  shouldReduceIntensity,
  type RiskMonitorResult,
} from "@/lib/risk-monitor";

type ChatRequest = {
  mode?: "shield" | "practice";
  action?: PracticeAction;
  input?: string;
  memory?: SessionMemoryTurn[];
  villainPersona?: VillainPersona["id"];
  distressLevel?: number;
  crisisScore?: number;
  intensity?: Intensity;
  consented?: boolean;
  stopped?: boolean;
  shieldReturn?: boolean;
  takeaway?: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type RiskRuntimeContext = {
  mode: "shield" | "practice";
  action?: PracticeAction;
  userInput: string;
  memory: SessionMemoryTurn[];
  distressLevel: number;
  crisisScore: number;
  intensity: Intensity;
};

export async function POST(request: Request) {
  const body = (await request.json()) as ChatRequest;
  const mode = body.mode ?? "shield";
  const input = body.input?.trim() ?? "";
  const memory = body.memory ?? [];
  const distressLevel = body.distressLevel ?? 2;
  const crisisScore = body.crisisScore ?? 0;
  const intensity = body.intensity ?? "low";
  const consented = body.consented ?? false;
  const villainPersona = body.villainPersona ?? "gross_boss";

  const runtime: RiskRuntimeContext = {
    mode,
    action: body.action,
    userInput: input,
    memory,
    distressLevel,
    crisisScore,
    intensity,
  };

  if (body.stopped) {
    const decision = decideShieldTurn({
      userInput: "STOP",
      distressLevel,
      crisisScore,
      consentGiven: consented,
    });
    return respondWithPipeline(decision, "STOP", runtime);
  }

  if (body.shieldReturn) {
    const decision = decideShieldReturnTurn({
      distressLevel,
      crisisScore,
    });
    return respondWithPipeline(decision, "练习结束，回到盾牌", runtime);
  }

  if (mode === "practice") {
    const action = body.action;
    if (!action || !["start", "respond", "next_round", "debrief"].includes(action)) {
      return NextResponse.json({ error: "练习模式需要有效的 action。" }, { status: 400 });
    }

    if (action === "respond" && !input) {
      return NextResponse.json({ error: "请先输入你的回应。" }, { status: 400 });
    }

    if (action === "next_round" && memory.length === 0) {
      return NextResponse.json({ error: "继续下一轮需要已有练习记忆。" }, { status: 400 });
    }

    if (action === "debrief" && memory.length === 0) {
      return NextResponse.json({ error: "复盘需要完整的练习记忆。" }, { status: 400 });
    }

    const decision = decidePracticeTurn({
      action,
      userInput: input,
      memory,
      distressLevel,
      crisisScore,
      consentGiven: consented,
      intensity,
      villainPersona,
      takeaway: body.takeaway,
    });

    const userMessage =
      action === "start"
        ? "（坏蛋主动开口）"
        : action === "next_round"
          ? "（坏蛋继续下一轮）"
          : action === "debrief"
            ? input || "（进入复盘）"
            : input;

    return respondWithPipeline(decision, userMessage, runtime);
  }

  if (!input) {
    return NextResponse.json({ error: "请输入要发送的内容。" }, { status: 400 });
  }

  const decision = decideShieldTurn({
    userInput: input,
    distressLevel,
    crisisScore,
    consentGiven: consented,
  });

  return respondWithPipeline(decision, input, runtime);
}

async function respondWithPipeline(
  decision: OrchestratorDecision,
  userMessage: string,
  runtime: RiskRuntimeContext,
) {
  if (decision.blocked) {
    const enforced = await enforceRiskOutcome(decision, decision.fallbackReply, runtime);
    return NextResponse.json(enforced);
  }

  const generated = await generateAgentReply(decision, userMessage);
  const enforced = await enforceRiskOutcome(decision, generated.reply, runtime, generated.providerStatus, generated.providerError);
  return NextResponse.json(enforced);
}

async function generateAgentReply(decision: OrchestratorDecision, userMessage: string) {
  const fallback = decision.fallbackReply;
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_API_BASE_URL;
  const model = process.env.AI_MODEL;

  if (!apiKey || !baseUrl || !model) {
    return {
      reply: fallback,
      providerStatus: "fallback_missing_config" as const,
      providerError: undefined,
    };
  }

  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const temperature =
    decision.agent === "villain" ? 0.6 : decision.agent === "coach" ? 0.45 : 0.4;

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
          { role: "system", content: decision.systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature,
      }),
    });

    const result = (await response.json()) as ChatCompletionResponse;

    if (!response.ok) {
      return {
        reply: fallback,
        providerStatus: "fallback_provider_error" as const,
        providerError: result.error?.message ?? `模型接口请求失败：${response.status}`,
      };
    }

    const reply = result.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return {
        reply: fallback,
        providerStatus: "fallback_empty_response" as const,
        providerError: undefined,
      };
    }

    return { reply, providerStatus: "live" as const, providerError: undefined };
  } catch (error) {
    return {
      reply: fallback,
      providerStatus: "fallback_network_error" as const,
      providerError: error instanceof Error ? error.message : "模型接口网络错误",
    };
  }
}

async function enforceRiskOutcome(
  decision: OrchestratorDecision,
  reply: string,
  runtime: RiskRuntimeContext,
  providerStatus = "fallback_missing_config",
  providerError?: string,
) {
  const preModelRisk = await runContinuousRiskMonitor({
    mode: runtime.mode,
    action: runtime.action,
    practicePhase: decision.practicePhase,
    userInput: runtime.userInput,
    memory: runtime.memory,
    distressLevel: runtime.distressLevel,
    crisisScore: runtime.crisisScore,
    intensity: runtime.intensity,
    stage: "pre",
  });

  const postRuleRisk = await runContinuousRiskMonitor({
    mode: runtime.mode,
    action: runtime.action,
    practicePhase: decision.practicePhase,
    userInput: runtime.userInput,
    agentReply: reply,
    memory: runtime.memory,
    distressLevel: runtime.distressLevel,
    crisisScore: runtime.crisisScore,
    intensity: runtime.intensity,
    stage: "post",
  });

  let riskMonitor: RiskMonitorResult = mergeRiskResults(
    mergeRiskResults(decision.riskMonitor, preModelRisk),
    postRuleRisk,
  );

  let finalAgent = decision.agent;
  let finalReply = reply;
  let blocked = decision.blocked;
  let stopReason = decision.stopReason;
  let practicePhase = decision.practicePhase;
  let intensityReduced = shouldReduceIntensity(riskMonitor);

  if (shouldForceShield(riskMonitor) && runtime.mode === "practice") {
    finalAgent = "shield";
    finalReply = fallbackReply("shield", runtime.userInput);
    blocked = true;
    stopReason = riskMonitor.reason;
    practicePhase = "stopped";
    intensityReduced = false;
  }

  return {
    reply: finalReply,
    agent: finalAgent,
    practicePhase,
    practiceAction: decision.practiceAction,
    risk: decision.risk,
    riskMonitor,
    intensityReduced,
    blocked,
    stopReason,
    providerStatus,
    providerError,
    distressLevel: runtime.distressLevel,
  };
}
