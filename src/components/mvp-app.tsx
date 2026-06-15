"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  HeartHandshake,
  Lightbulb,
  LoaderCircle,
  Lock,
  Send,
  Shield,
  Swords,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CrisisExitPanel } from "@/components/crisis-exit-panel";
import { MobilePracticeDock } from "@/components/mobile-practice-dock";
import { PostPracticeModal } from "@/components/post-practice-modal";
import { PracticePanel } from "@/components/practice-panel";
import { SafetyBanner } from "@/components/safety-banner";
import { ShieldChat } from "@/components/shield-chat";
import { SiteNav } from "@/components/site-nav";
import { SkillManager } from "@/components/skill-manager";
import { suggestDistressFromQuestionnaire } from "@/lib/assessment";
import {
  agentPrompts,
  bullyingQuestions,
  distressQuestions,
  practiceStates,
  villainPersonas,
} from "@/lib/mvp-content";
import type { PracticePhase, SessionMemoryTurn } from "@/lib/orchestrator";
import { MAX_PRACTICE_ROUNDS, countPracticeRounds } from "@/lib/orchestrator";
import {
  endPracticeSession,
  getCurrentSession,
  listRecentSessions,
  startPracticeSession,
  updateCurrentSession,
  type PracticeSessionRecord,
} from "@/lib/session-store";

type Intensity = "locked" | "low" | "medium";
type ViewMode = "shield" | "practice";
type VillainPersonaId = (typeof villainPersonas)[number]["id"];
type Speaker = "user" | "shield" | "villain" | "coach" | "debrief" | "system";

type ChatMessage = {
  role: Speaker;
  content: string;
  meta?: string;
};

type ChatResult = {
  reply?: string;
  error?: string;
  agent?: Speaker;
  practicePhase?: PracticePhase;
  risk?: {
    level: string;
    reasons: string[];
    action: string;
  };
  riskMonitor?: {
    risk_level: string;
    signal: string;
    reason: string;
    source: string;
    stage: string;
    monitored_turn: string;
  };
  intensityReduced?: boolean;
  blocked?: boolean;
  stopReason?: string;
  providerStatus?: string;
};

const phaseSteps: { id: PracticePhase; label: string }[] = [
  { id: "villain_open", label: "坏蛋开口" },
  { id: "user_reply", label: "你接招" },
  { id: "coach_guide", label: "引导教练" },
  { id: "debrief", label: "复盘" },
];

const distressOptions = [
  { value: 1, label: "1 平稳", helper: "可以选择练习" },
  { value: 2, label: "2 有波动", helper: "仅低强度" },
  { value: 3, label: "3 明显困扰", helper: "仅低强度" },
  { value: 4, label: "4 很难受", helper: "只开放盾牌" },
  { value: 5, label: "5 接近崩溃", helper: "退出模拟" },
];

const scoreLabels = ["从不", "几天", "一半以上", "几乎天天"];

function getIntensity(level: number): Intensity {
  if (level >= 4) return "locked";
  if (level >= 2) return "low";
  return "medium";
}

function phaseIndex(phase: PracticePhase): number {
  const map: Record<PracticePhase, number> = {
    idle: -1,
    villain_open: 0,
    user_reply: 1,
    coach_guide: 2,
    debrief: 3,
    stopped: -1,
  };
  return map[phase];
}

function getSafetySignal(level: number, crisisScore: number) {
  if (crisisScore > 0) {
    return {
      level: "crisis",
      signal: "crisis_exit",
      copy: "出现危机预警项，撤下全部模拟，显示现实世界求助资源。",
    };
  }

  if (level >= 4) {
    return {
      level: "high",
      signal: "stop_and_shield",
      copy: "当前痛苦评级较高，练习场锁定，只保留盾牌。",
    };
  }

  if (level >= 2) {
    return {
      level: "elevated",
      signal: "reduce_intensity",
      copy: "允许继续支持性对话；若进入练习，只开放低强度。",
    };
  }

  return {
    level: "none",
    signal: "continue",
    copy: "用户处于可承受范围，可在知情同意后进入练习。",
  };
}

export function MvpApp() {
  const [distressLevel, setDistressLevel] = useState(2);
  const [consented, setConsented] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("shield");
  const [practicePhase, setPracticePhase] = useState<PracticePhase>("idle");
  const [villainPersona, setVillainPersona] = useState<VillainPersonaId>("gross_boss");
  const [userInput, setUserInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [runtimeIntensity, setRuntimeIntensity] = useState<"low" | "medium" | null>(null);
  const [intensityDowngraded, setIntensityDowngraded] = useState(false);
  const [showPostPracticeModal, setShowPostPracticeModal] = useState(false);
  const [showShieldReturnBar, setShowShieldReturnBar] = useState(false);
  const [debriefTakeaway, setDebriefTakeaway] = useState("");
  const [currentSession, setCurrentSession] = useState<PracticeSessionRecord | null>(null);
  const [recentSessions, setRecentSessions] = useState<PracticeSessionRecord[]>([]);
  const [runtimeRisk, setRuntimeRisk] = useState({
    level: "elevated",
    signal: "reduce_intensity",
    copy: "初始痛苦评级为 2，仅开放低强度陪练。",
    source: "rules",
  });
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);
  const [shieldMessages, setShieldMessages] = useState<ChatMessage[]>([
    {
      role: "shield",
      content: "先不用急着证明什么。你刚才经历的事听起来让你很紧绷，我们可以先把它放慢一点。",
    },
  ]);
  const [practiceMessages, setPracticeMessages] = useState<ChatMessage[]>([]);
  const [sessionMemory, setSessionMemory] = useState<SessionMemoryTurn[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>(() =>
    Object.fromEntries(distressQuestions.map((question) => [question.id, 0])),
  );

  useEffect(() => {
    setCurrentSession(getCurrentSession());
    setRecentSessions(listRecentSessions());
  }, []);

  function refreshSessions() {
    setCurrentSession(getCurrentSession());
    setRecentSessions(listRecentSessions());
  }

  const crisisScore = answers.d9 ?? 0;
  const signal = getSafetySignal(distressLevel, crisisScore);
  const intensity = getIntensity(distressLevel);
  const totalScore = Object.values(answers).reduce((sum, value) => sum + value, 0);
  const depressionScore = distressQuestions
    .slice(0, 9)
    .reduce((sum, question) => sum + (answers[question.id] ?? 0), 0);
  const anxietyScore = distressQuestions
    .slice(9, 16)
    .reduce((sum, question) => sum + (answers[question.id] ?? 0), 0);

  const assessmentSuggestion = useMemo(
    () =>
      suggestDistressFromQuestionnaire({
        depressionScore,
        anxietyScore,
        crisisScore,
        totalScore,
      }),
    [anxietyScore, crisisScore, depressionScore, totalScore],
  );

  const crisisActive =
    crisisScore > 0 || runtimeRisk.signal === "crisis_exit" || assessmentSuggestion.crisisExit;

  const effectiveApiIntensity = (): "low" | "medium" => {
    if (runtimeIntensity) return runtimeIntensity;
    if (intensityDowngraded || distressLevel >= 2) return "low";
    return "medium";
  };

  const displayIntensity: Intensity = crisisActive
    ? "locked"
    : runtimeIntensity
      ? runtimeIntensity
      : intensity;

  const practiceCopy = useMemo(() => {
    if (stopped) return "STOP 已触发：练习停止，盾牌接管。";
    if (crisisActive) return "危机出口已触发：不进入任何模拟。";
    if (intensity === "locked") return "当前不开放陪练，先回到盾牌。";
    if (!consented) return "需要用户主动确认知情同意后，才可进入练习。";
    if (intensityDowngraded) return "风险管理已降级：陪练仅限低强度。";
    return displayIntensity === "low"
      ? "练习场开放：仅低强度，风险管理持续监控。"
      : "练习场开放：低/中强度可选，高强度仍不开放。";
  }, [consented, crisisActive, displayIntensity, intensity, intensityDowngraded, stopped]);

  const canEnterVillain =
    intensity !== "locked" && !crisisActive && consented && !assessmentSuggestion.lockPractice;
  const canStartPractice = canEnterVillain && !stopped && practicePhase === "idle";
  const canUserReply = practicePhase === "user_reply" && !stopped;
  const practiceRounds = countPracticeRounds(sessionMemory);
  const canNextRound =
    practicePhase === "coach_guide" && !stopped && practiceRounds > 0 && practiceRounds < MAX_PRACTICE_ROUNDS;
  const canJumpToDebrief =
    viewMode === "practice" &&
    !stopped &&
    practicePhase !== "idle" &&
    practicePhase !== "debrief" &&
    sessionMemory.length > 0;
  const activeStep = phaseIndex(practicePhase);

  function applyRisk(result: ChatResult) {
    if (result.intensityReduced || result.riskMonitor?.signal === "reduce_intensity") {
      setRuntimeIntensity("low");
      setIntensityDowngraded(true);
    }

    if (result.riskMonitor) {
      setRuntimeRisk({
        level: result.riskMonitor.risk_level,
        signal: result.riskMonitor.signal,
        copy: result.riskMonitor.reason,
        source: result.riskMonitor.source,
      });
      updateCurrentSession({ risk_signal: result.riskMonitor.signal });
      refreshSessions();
    } else if (result.risk) {
      setRuntimeRisk({
        level: result.risk.level,
        signal: result.risk.action,
        copy: result.risk.reasons.join("；") || "风险管理持续监控中。",
        source: "rules",
      });
    }
  }

  function chatPayload(extra: Record<string, unknown>) {
    return {
      distressLevel,
      crisisScore,
      consented,
      stopped,
      intensity: effectiveApiIntensity(),
      ...extra,
    };
  }

  function handleForcedShield(result: ChatResult) {
    if (!result.blocked) return false;

    const riskSignal = result.riskMonitor?.signal;
    const riskForced =
      riskSignal === "stop_and_shield" ||
      riskSignal === "crisis_exit" ||
      result.practicePhase === "stopped";

    if (!riskForced) return false;

    applyRisk(result);
    setStopped(true);
    setViewMode("shield");
    setPracticePhase("stopped");
    if (riskSignal === "crisis_exit") {
      setConsented(false);
    }
    setShieldMessages((messages) => [
      ...messages,
      {
        role: "system",
        content: `风险管理介入：${result.stopReason ?? result.riskMonitor?.reason ?? "练习已停止。"}`,
      },
      { role: "shield", content: result.reply ?? "我们先回到盾牌，慢慢说。" },
    ]);
    setShowPostPracticeModal(!crisisActive);
    return true;
  }

  function handleFlowBlock(result: ChatResult) {
    if (!result.blocked) return false;
    setChatError(result.stopReason ?? result.riskMonitor?.reason ?? "当前无法继续。");
    if (result.practicePhase) setPracticePhase(result.practicePhase);
    return true;
  }

  function metaLabel(status?: string) {
    return status && status !== "live" ? "本地安全兜底" : undefined;
  }

  async function copyPrompt(name: string, prompt: string) {
    await navigator.clipboard.writeText(prompt);
    setCopiedPrompt(name);
    window.setTimeout(() => setCopiedPrompt(null), 1600);
  }

  async function callChat(body: Record<string, unknown>) {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as ChatResult;
    if (!response.ok || !result.reply) {
      throw new Error(result.error ?? "模型接口暂时不可用。");
    }
    return result;
  }

  async function sendShieldMessage() {
    const input = userInput.trim();
    if (!input || isSending) return;

    setChatError(null);
    setIsSending(true);
    setUserInput("");
    setShieldMessages((messages) => [...messages, { role: "user", content: input }]);

    try {
      const result = await callChat(chatPayload({ mode: "shield", input }));
      applyRisk(result);

      if (result.blocked) {
        setStopped(true);
        setViewMode("shield");
        setPracticePhase("stopped");
      }

      setShieldMessages((messages) => [
        ...messages,
        {
          role: result.agent ?? "shield",
          content: result.reply ?? "",
          meta: metaLabel(result.providerStatus),
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "模型接口暂时不可用。";
      setChatError(message);
      setShieldMessages((messages) => [...messages, { role: "system", content: message }]);
    } finally {
      setIsSending(false);
    }
  }

  async function startPractice() {
    if (!canStartPractice || isSending) return;

    setChatError(null);
    setIsSending(true);
    setViewMode("practice");
    setPracticeMessages([]);
    setSessionMemory([]);
    setShowShieldReturnBar(false);
    setDebriefTakeaway("");

    const session = startPracticeSession({
      distress_before: distressLevel,
      max_intensity: effectiveApiIntensity(),
      villain_persona: currentVillainName(villainPersona),
    });
    setCurrentSession(session);
    refreshSessions();

    try {
      const result = await callChat(
        chatPayload({
          mode: "practice",
          action: "start",
          villainPersona,
          memory: [],
        }),
      );
      applyRisk(result);

      if (handleForcedShield(result)) return;
      if (handleFlowBlock(result)) return;

      const villainTurn: SessionMemoryTurn = {
        speaker: "villain",
        content: result.reply ?? "",
      };

      setSessionMemory([villainTurn]);
      setPracticePhase(result.practicePhase ?? "user_reply");
      updateCurrentSession({ practice_rounds: 0, active_agent: "villain" });
      refreshSessions();
      setPracticeMessages([
        {
          role: "system",
          content: `练习开始：${currentVillainName(villainPersona)} 先开口。请接招，引导与复盘会在你回应后自动跟上。`,
        },
        {
          role: "villain",
          content: result.reply ?? "",
          meta: metaLabel(result.providerStatus),
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "模型接口暂时不可用。";
      setChatError(message);
      setViewMode("shield");
      setPracticePhase("idle");
    } finally {
      setIsSending(false);
    }
  }

  async function sendPracticeReply() {
    const input = userInput.trim();
    if (!input || !canUserReply || isSending) return;

    setChatError(null);
    setIsSending(true);
    setUserInput("");
    setPracticeMessages((messages) => [...messages, { role: "user", content: input }]);

    try {
      const result = await callChat(
        chatPayload({
          mode: "practice",
          action: "respond",
          input,
          memory: sessionMemory,
          villainPersona,
        }),
      );
      applyRisk(result);

      if (handleForcedShield(result)) return;
      if (handleFlowBlock(result)) return;

      const userTurn: SessionMemoryTurn = { speaker: "user", content: input };
      const coachTurn: SessionMemoryTurn = { speaker: "coach", content: result.reply ?? "" };
      const updatedMemory = [...sessionMemory, userTurn, coachTurn];
      const rounds = countPracticeRounds(updatedMemory);

      setSessionMemory(updatedMemory);
      setPracticePhase(result.practicePhase ?? "coach_guide");
      updateCurrentSession({ practice_rounds: rounds, active_agent: "coach" });
      refreshSessions();
      setPracticeMessages((messages) => [
        ...messages,
        {
          role: "coach",
          content: result.reply ?? "",
          meta: metaLabel(result.providerStatus),
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "模型接口暂时不可用。";
      setChatError(message);
      setPracticeMessages((messages) => [...messages, { role: "system", content: message }]);
    } finally {
      setIsSending(false);
    }
  }

  async function continueNextRound() {
    if (!canNextRound || isSending) return;

    setChatError(null);
    setIsSending(true);

    try {
      const result = await callChat(
        chatPayload({
          mode: "practice",
          action: "next_round",
          memory: sessionMemory,
          villainPersona,
        }),
      );
      applyRisk(result);

      if (handleForcedShield(result)) return;
      if (handleFlowBlock(result)) return;

      const villainTurn: SessionMemoryTurn = { speaker: "villain", content: result.reply ?? "" };
      const updatedMemory = [...sessionMemory, villainTurn];

      setSessionMemory(updatedMemory);
      setPracticePhase(result.practicePhase ?? "user_reply");
      updateCurrentSession({ active_agent: "villain" });
      refreshSessions();
      setPracticeMessages((messages) => [
        ...messages,
        {
          role: "system",
          content: `第 ${practiceRounds + 1} 轮：坏蛋继续接招。`,
        },
        {
          role: "villain",
          content: result.reply ?? "",
          meta: metaLabel(result.providerStatus),
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "模型接口暂时不可用。";
      setChatError(message);
      setPracticeMessages((messages) => [...messages, { role: "system", content: message }]);
    } finally {
      setIsSending(false);
    }
  }

  async function runDebrief() {
    if (!canJumpToDebrief || isSending) return;

    setChatError(null);
    setIsSending(true);
    setPracticeMessages((messages) => [
      ...messages,
      { role: "system", content: "你选择了随时进入复盘，复盘 agent 将读取已有练习记忆。" },
    ]);

    try {
      const result = await callChat(
        chatPayload({
          mode: "practice",
          action: "debrief",
          memory: sessionMemory,
          villainPersona,
          takeaway: debriefTakeaway.trim() || undefined,
        }),
      );
      applyRisk(result);

      if (handleForcedShield(result)) return;
      if (handleFlowBlock(result)) return;

      const debriefTurn: SessionMemoryTurn = { speaker: "debrief", content: result.reply ?? "" };
      setSessionMemory((memory) => [...memory, debriefTurn]);
      setPracticePhase(result.practicePhase ?? "debrief");
      updateCurrentSession({
        active_agent: "debrief",
        debrief_takeaway: debriefTakeaway.trim() || null,
      });
      refreshSessions();
      setPracticeMessages((messages) => [
        ...messages,
        {
          role: "debrief",
          content: result.reply ?? "",
          meta: metaLabel(result.providerStatus),
        },
      ]);
      setShowShieldReturnBar(true);
      window.setTimeout(() => {
        setShowPostPracticeModal(true);
      }, 800);
    } catch (error) {
      const message = error instanceof Error ? error.message : "模型接口暂时不可用。";
      setChatError(message);
      setPracticeMessages((messages) => [...messages, { role: "system", content: message }]);
    } finally {
      setIsSending(false);
    }
  }

  async function handleStop() {
    if (isSending) return;

    setChatError(null);
    setIsSending(true);

    try {
      const result = await callChat(
        chatPayload({
          mode: "shield",
          stopped: true,
        }),
      );
      applyRisk(result);

      setStopped(true);
      setConsented(false);
      setViewMode("shield");
      setPracticePhase("stopped");
      updateCurrentSession({ stop_triggered: true, active_agent: "shield", mode: "STOPPED" });
      refreshSessions();

      setShieldMessages((messages) => [
        ...messages,
        { role: "system", content: "STOP 已触发。陪练停止，盾牌接管。" },
        {
          role: "shield",
          content: result.reply ?? "练习已经停下来了。你不用继续接招，我们可以先慢慢说刚才最难受的是哪一句。",
          meta: metaLabel(result.providerStatus),
        },
      ]);
      if (!crisisActive) setShowPostPracticeModal(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "STOP 请求失败。";
      setChatError(message);
      setStopped(true);
      setConsented(false);
      setViewMode("shield");
      setPracticePhase("stopped");
      setShieldMessages((messages) => [
        ...messages,
        { role: "system", content: "STOP 已触发（本地）。" },
        { role: "shield", content: "练习已经停下来了。你不用继续接招，我们可以先慢慢说刚才最难受的是哪一句。" },
      ]);
      if (!crisisActive) setShowPostPracticeModal(true);
    } finally {
      setIsSending(false);
    }
  }

  async function returnToShieldAfterPractice() {
    if (isSending) return;

    setChatError(null);
    setIsSending(true);
    setViewMode("shield");
    setShowShieldReturnBar(false);

    try {
      const result = await callChat(chatPayload({ mode: "shield", shieldReturn: true }));
      applyRisk(result);
      setShieldMessages((messages) => [
        ...messages,
        { role: "system", content: "练习已结束，盾牌收尾。" },
        {
          role: "shield",
          content: result.reply ?? "这轮练习到这里就好。把注意力放回现实，想聊的时候我一直在。",
          meta: metaLabel(result.providerStatus),
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "回到盾牌失败。";
      setShieldMessages((messages) => [
        ...messages,
        { role: "shield", content: "这轮练习到这里就好。把注意力放回现实，想聊的时候我一直在。" },
        { role: "system", content: message },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function finishPostPractice(input: {
    distressAfter: number;
    delta: "better" | "same" | "worse";
    takeaway: string;
  }) {
    endPracticeSession({
      distress_after: input.distressAfter,
      distress_delta: input.delta,
      debrief_takeaway: input.takeaway || debriefTakeaway.trim() || null,
      stop_triggered: stopped,
      practice_rounds: practiceRounds,
      risk_signal: runtimeRisk.signal,
    });
    if (input.takeaway) setDebriefTakeaway(input.takeaway);
    refreshSessions();
    setShowPostPracticeModal(false);
    if (practicePhase === "debrief" && !stopped) {
      void returnToShieldAfterPractice();
    }
  }

  function resetPractice() {
    setPracticePhase("idle");
    setPracticeMessages([]);
    setSessionMemory([]);
    setStopped(false);
    setUserInput("");
    setChatError(null);
    setShowShieldReturnBar(false);
    setDebriefTakeaway("");
  }

  function enterPracticeSetup() {
    if (!canEnterVillain) return;
    setViewMode("practice");
    resetPractice();
    setPracticeMessages([
      {
        role: "system",
        content: "请选择陪练人物，然后点击「开始练习」。每轮流程：坏蛋开口 → 你接招 → 引导教练；可多轮，最后复盘。",
      },
    ]);
  }

  function applyAssessmentSuggestion() {
    setDistressLevel(assessmentSuggestion.suggestedLevel);
    if (assessmentSuggestion.crisisExit) setConsented(false);
    if (assessmentSuggestion.lockPractice) setConsented(false);
  }

  const showMobileDock = viewMode === "practice" || practicePhase === "stopped";

  return (
    <main className={`app-shell${showMobileDock ? " has-practice-dock" : ""}`} id="top">
      <SiteNav />
      <MobilePracticeDock
        canJumpToDebrief={canJumpToDebrief}
        canNextRound={canNextRound}
        canStartPractice={canStartPractice}
        isSending={isSending}
        onDebrief={() => void runDebrief()}
        onNextRound={() => void continueNextRound()}
        onReturnShield={() => void returnToShieldAfterPractice()}
        onStartPractice={() => void startPractice()}
        onStop={() => void handleStop()}
        practicePhase={practicePhase}
        viewMode={viewMode}
        visible={showMobileDock}
      />
      <PostPracticeModal
        distressBefore={currentSession?.distress_before ?? distressLevel}
        onSkip={() => {
          finishPostPractice({
            distressAfter: distressLevel,
            delta: "same",
            takeaway: debriefTakeaway.trim(),
          });
        }}
        onSubmit={finishPostPractice}
        open={showPostPracticeModal}
      />

      <section className="hero">
        <div className="eyebrow">
          <Shield size={16} />
          Neverland MVP · safety-first workplace bullying practice
        </div>
        <div className="hero-grid">
          <div>
            <h1>安全地模拟坏蛋，而不是制造新的伤害。</h1>
            <p className="hero-copy">
              这个 MVP 把核心闭环做成可点原型：默认盾牌、分阶段练习（坏蛋 → 你 → 引导 → 复盘）、强度锁与常驻 STOP。
            </p>
            <div className="hero-actions">
              <a className="primary-action" href="#practice">
                跑一次 MVP 流程
              </a>
              <a className="secondary-action" href="#prompts">
                查看 agent prompt
              </a>
            </div>
          </div>

          <div className="safety-card">
            <div className="safety-card-header">
              <AlertTriangle size={20} />
              <span>当前安全指令</span>
            </div>
            <div className="signal">{crisisActive ? "crisis_exit" : signal.signal}</div>
            <p>{crisisActive ? assessmentSuggestion.reason : signal.copy}</p>
            <code>
              {JSON.stringify({
                risk_level: crisisActive ? "crisis" : signal.level,
                signal: crisisActive ? "crisis_exit" : signal.signal,
                reason: crisisActive ? assessmentSuggestion.reason : "由痛苦评级与危机预警项触发",
                runtime_intensity: effectiveApiIntensity(),
              })}
            </code>
          </div>
        </div>
      </section>

      <section className="section" id="foundation">
        <div className="section-heading">
          <p className="kicker">底座选择</p>
          <h2>适合这个 MVP 的 skills</h2>
          <p>
            当前阶段用轻量前端先验证体验和安全规则；Skill 列表支持搜索、分类和分页浏览，不再一屏堆满。
          </p>
        </div>
        <SkillManager />
      </section>

      <section className="section" id="practice">
        <div className="section-heading">
          <p className="kicker">UX 原型</p>
          <h2>安全闭环练习场</h2>
          <p>
            练习不是默认入口。进入后 agent 严格分阶段，不能手动混用：坏蛋先开口 → 你接招 → 引导教练 → 复盘。
          </p>
        </div>

        {crisisActive ? <CrisisExitPanel /> : null}

        <PracticePanel
          assessmentBanner={{
            show: assessmentSuggestion.suggestedLevel !== distressLevel,
            message: `问卷建议评级 ${assessmentSuggestion.suggestedLevel}：${assessmentSuggestion.reason}`,
            onApply: applyAssessmentSuggestion,
          }}
          canEnterVillain={canEnterVillain}
          canJumpToDebrief={canJumpToDebrief}
          canNextRound={canNextRound}
          canStartPractice={canStartPractice}
          consentDisabled={intensity === "locked" || crisisActive || assessmentSuggestion.lockPractice}
          consented={consented}
          currentSession={currentSession}
          distressLevel={distressLevel}
          distressOptions={distressOptions}
          isSending={isSending}
          onConsentChange={setConsented}
          onDebrief={() => void runDebrief()}
          onDistressChange={(value) => {
            setDistressLevel(value);
            setStopped(false);
            if (value >= 4) setConsented(false);
          }}
          onEnterPractice={enterPracticeSetup}
          onNextRound={() => void continueNextRound()}
          onReturnShield={() => void returnToShieldAfterPractice()}
          onStartPractice={() => void startPractice()}
          onStop={() => void handleStop()}
          practicePhase={practicePhase}
          practiceRounds={practiceRounds}
          recentSessions={recentSessions}
          stopped={stopped}
          viewMode={viewMode}
        >
            {intensityDowngraded ? (
              <SafetyBanner
                message="风险管理已触发降级：陪练强度已锁定为 low，后续请求将携带低强度参数。"
                variant="downgrade"
              />
            ) : null}
            {showShieldReturnBar ? (
              <SafetyBanner
                actionLabel="回到盾牌"
                message="练习已结束。复盘完成，建议回到盾牌做收尾。"
                onAction={() => void returnToShieldAfterPractice()}
                variant="shield-return"
              />
            ) : null}
            <div className="status-row">
              <span className={`status-pill ${displayIntensity}`}>{displayIntensity}</span>
              <span>{practiceCopy}</span>
              <span className="view-mode-pill">{viewMode === "shield" ? "盾牌模式" : "练习模式"}</span>
            </div>
            <div className="orchestration-strip">
              <span>阶段：{practicePhase}</span>
              <span>
                轮次：{practiceRounds}/{MAX_PRACTICE_ROUNDS}
              </span>
              <span>风险管理：{runtimeRisk.signal}</span>
              <span>请求强度：{effectiveApiIntensity()}</span>
            </div>
            <details className="risk-monitor-details">
              <summary>风险管理 JSON</summary>
              <code className="risk-monitor-json">
                {JSON.stringify({
                  risk_level: runtimeRisk.level,
                  signal: runtimeRisk.signal,
                  reason: runtimeRisk.copy,
                  source: runtimeRisk.source,
                  agent: "risk",
                  status: "monitoring",
                  intensity_reduced: intensityDowngraded,
                })}
              </code>
            </details>
            {viewMode === "practice" ? (
              <div className="phase-steps">
                {phaseSteps.map((step, index) => (
                  <div
                    className={
                      activeStep === index
                        ? "phase-step active"
                        : activeStep > index
                          ? "phase-step done"
                          : "phase-step"
                    }
                    key={step.id}
                  >
                    <span>{index + 1}</span>
                    <em>{step.label}</em>
                  </div>
                ))}
              </div>
            ) : null}
            {viewMode === "practice" && practicePhase === "idle" && !crisisActive ? (
              <div className="persona-grid">
                {villainPersonas.map((persona) => (
                  <button
                    className={villainPersona === persona.id ? "persona-card active" : "persona-card"}
                    disabled={isSending}
                    key={persona.id}
                    onClick={() => setVillainPersona(persona.id)}
                    type="button"
                  >
                    <b>{persona.name}</b>
                    <span>{persona.scenario}</span>
                    <small>{persona.safetyNote}</small>
                  </button>
                ))}
              </div>
            ) : null}
            {canJumpToDebrief ? (
              <div className="practice-jump-bar">
                <label className="takeaway-field">
                  我学到了什么（可选，复盘时会引用）
                  <textarea
                    onChange={(event) => setDebriefTakeaway(event.target.value)}
                    placeholder="一句话收获"
                    rows={2}
                    value={debriefTakeaway}
                  />
                </label>
                <button
                  className="jump-debrief-button"
                  disabled={isSending}
                  onClick={() => void runDebrief()}
                  type="button"
                >
                  <HeartHandshake size={16} />
                  随时进入复盘
                </button>
                <span>跳过当前阶段，复盘 agent 读取已有练习记忆</span>
              </div>
            ) : null}
            {viewMode === "shield" ? (
              <ShieldChat
                chatError={chatError}
                isSending={isSending}
                messages={shieldMessages}
                onInputChange={setUserInput}
                onSubmit={() => void sendShieldMessage()}
                userInput={userInput}
              />
            ) : (
              <div className="chat-shell">
                <div className="message-list">
                  {practiceMessages.map((message, index) => (
                    <div className={`message ${message.role}-message`} key={`${message.role}-${index}`}>
                      <b>{message.role === "user" ? "你" : roleLabel(message.role)}</b>
                      {message.meta ? <small>{message.meta}</small> : null}
                      <p>{message.content}</p>
                    </div>
                  ))}
                  {isSending ? (
                    <div className="message system-message">
                      <b>系统</b>
                      <p>
                        <LoaderCircle className="spin" size={16} /> 正在请求模型接口...
                      </p>
                    </div>
                  ) : null}
                </div>
                {chatError ? <div className="inline-error">{chatError}</div> : null}
                {canUserReply ? (
                  <form
                    className="reply-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void sendPracticeReply();
                    }}
                  >
                    <textarea
                      onChange={(event) => setUserInput(event.target.value)}
                      placeholder="接招：写下你会怎么回应坏蛋。发送后引导教练会自动接上。"
                      rows={3}
                      value={userInput}
                    />
                    <button disabled={!userInput.trim() || isSending} type="submit">
                      <Send size={16} />
                      接招
                    </button>
                  </form>
                ) : null}
                {practicePhase === "coach_guide" ? (
                  <div className="phase-actions">
                    <p className="phase-hint">
                      引导已完成。选择下一步：
                      {practiceRounds >= MAX_PRACTICE_ROUNDS ? " 已达轮次上限，请进入复盘。" : ""}
                    </p>
                    <div className="phase-action-buttons">
                      <button
                        className="primary-action"
                        disabled={!canNextRound || isSending}
                        onClick={() => void continueNextRound()}
                        type="button"
                      >
                        <Swords size={16} />
                        继续下一轮
                      </button>
                      <button
                        className="secondary-action"
                        disabled={!canJumpToDebrief || isSending}
                        onClick={() => void runDebrief()}
                        type="button"
                      >
                        <HeartHandshake size={16} />
                        进入复盘
                      </button>
                    </div>
                  </div>
                ) : null}
                {practicePhase === "debrief" ? (
                  <div className="phase-actions">
                    <p className="phase-hint">本轮闭环结束。可回到盾牌继续聊感受。</p>
                    <div className="phase-action-buttons">
                      <button
                        className="secondary-action"
                        onClick={() => void returnToShieldAfterPractice()}
                        type="button"
                      >
                        <Shield size={16} />
                        回到盾牌
                      </button>
                      <button className="secondary-action" onClick={enterPracticeSetup} type="button">
                        <Swords size={16} />
                        再练一轮
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
        </PracticePanel>

        <div className="timeline">
          {practiceStates.map((state, index) => (
            <article key={state.title}>
              <span>{index + 1}</span>
              <h3>{state.title}</h3>
              <p>{state.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section" id="prompts">
        <div className="section-heading">
          <p className="kicker">Agent prompt</p>
          <h2>各角色的系统提示词</h2>
          <p>坏蛋、引导、复盘在练习中按阶段自动切换；盾牌是默认锚点，风险管理只输出 JSON。</p>
        </div>
        <div className="agent-grid">
          {agentPrompts.map((agent) => (
            <article className="agent-card" key={agent.id}>
              <div className="agent-topline">
                <span className="agent-icon">
                  {agent.id === "shield" ? <Shield size={20} /> : null}
                  {agent.id === "villain" ? <Swords size={20} /> : null}
                  {agent.id === "coach" ? <Lightbulb size={20} /> : null}
                  {agent.id === "debrief" ? <HeartHandshake size={20} /> : null}
                  {agent.id === "risk" ? <Lock size={20} /> : null}
                </span>
                <div>
                  <h3>{agent.name}</h3>
                  <p>{agent.label}</p>
                </div>
              </div>
              <p className="agent-role">{agent.role}</p>
              <div className="tone-bars">
                <ToneBar label="温暖" value={agent.tone.warmth} />
                <ToneBar label="直接" value={agent.tone.directness} />
                <div className="tone-meta">
                  <span>节奏：{agent.tone.pace}</span>
                  <span>强度：{agent.tone.intensity}</span>
                </div>
              </div>
              <p className="note">{agent.designNote}</p>
              <details>
                <summary>展开 system prompt</summary>
                <pre>{agent.prompt}</pre>
              </details>
              <button
                className="copy-button"
                onClick={() => copyPrompt(agent.name, agent.prompt)}
                type="button"
              >
                {copiedPrompt === agent.name ? <CheckCircle2 size={16} /> : <Clipboard size={16} />}
                {copiedPrompt === agent.name ? "已复制" : "复制 prompt"}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="section" id="assessment">
        <div className="section-heading">
          <p className="kicker">评估体系</p>
          <h2>问卷与强度锁映射</h2>
          <p>这不是诊断工具。MVP 中它用于安全分流、记录练习前后痛苦变化，并触发降级或退出。</p>
        </div>

        <div className="assessment-grid">
          <div className="questionnaire">
            <div className="score-summary">
              <span>总分 {totalScore}/60</span>
              <span>抑郁 {depressionScore}/27</span>
              <span>焦虑 {anxietyScore}/21</span>
            </div>
            {distressQuestions.map((question, index) => (
              <div className={question.crisis ? "question crisis" : "question"} key={question.id}>
                <div>
                  <small>
                    {index + 1}. {question.dimension}
                  </small>
                  <p>{question.text}</p>
                </div>
                <div className="score-buttons">
                  {scoreLabels.map((label, value) => (
                    <button
                      aria-label={`${question.text}：${label}`}
                      className={answers[question.id] === value ? "score active" : "score"}
                      key={label}
                      onClick={() =>
                        setAnswers((current) => ({
                          ...current,
                          [question.id]: value,
                        }))
                      }
                      type="button"
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <aside className="mapping-card">
            <h3>分流逻辑</h3>
            <ul>
              <li>第 9 题不为 0：直接触发 crisis_exit。</li>
              <li>痛苦评级 4-5：锁定陪练，只开放盾牌。</li>
              <li>痛苦评级 2-3：陪练最多低强度。</li>
              <li>痛苦评级 1：可在同意后进入低/中强度练习。</li>
            </ul>
            <div className="assessment-suggestion">
              <b>问卷建议</b>
              <p>
                建议痛苦评级 {assessmentSuggestion.suggestedLevel}：{assessmentSuggestion.reason}
              </p>
              {assessmentSuggestion.suggestedLevel !== distressLevel ? (
                <button className="secondary-action compact" onClick={applyAssessmentSuggestion} type="button">
                  采纳建议并同步强度锁
                </button>
              ) : null}
            </div>
            <div className="disclaimer">
              <b>现实世界支持</b>
              <p>若出现自伤、伤害他人或立即危险，请联系当地紧急服务、可信任的人或专业危机干预资源。</p>
            </div>
          </aside>
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <p className="kicker">题库调整</p>
          <h2>职场霸凌情况分析问卷</h2>
          <p>项目文档当前只做成年人职场版，因此这里把校园题迁移成职场题，并保留旁观者/支持因素。</p>
        </div>
        <div className="bullying-grid">
          {bullyingQuestions.map((question, index) => (
            <article className={question.crisis ? "bullying-item crisis" : "bullying-item"} key={question.id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <small>{question.dimension}</small>
              <p>{question.text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function roleLabel(role: ChatMessage["role"]) {
  if (role === "shield") return "盾牌";
  if (role === "villain") return "坏蛋陪练";
  if (role === "coach") return "引导教练";
  if (role === "debrief") return "复盘";
  return "系统";
}

function currentVillainName(personaId: VillainPersonaId) {
  return villainPersonas.find((persona) => persona.id === personaId)?.name ?? "坏蛋陪练";
}

function ToneBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="tone-bar">
      <span>{label}</span>
      <div>
        <i style={{ width: `${value}%` }} />
      </div>
      <em>{value}</em>
    </div>
  );
}
