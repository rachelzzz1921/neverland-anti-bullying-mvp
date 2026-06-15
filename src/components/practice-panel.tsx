"use client";

import type { ReactNode } from "react";
import { HeartHandshake, PauseCircle, Shield, Swords } from "lucide-react";
import { SessionSummary } from "@/components/session-summary";
import type { PracticeSessionRecord } from "@/lib/session-store";
import type { PracticePhase } from "@/lib/orchestrator";
import { MAX_PRACTICE_ROUNDS } from "@/lib/orchestrator";
import { SafetyBanner } from "@/components/safety-banner";

type DistressOption = { value: number; label: string; helper: string };

type PracticePanelProps = {
  distressOptions: DistressOption[];
  distressLevel: number;
  onDistressChange: (value: number) => void;
  assessmentBanner: { show: boolean; message: string; onApply: () => void };
  consented: boolean;
  onConsentChange: (value: boolean) => void;
  consentDisabled: boolean;
  canEnterVillain: boolean;
  canStartPractice: boolean;
  canNextRound: boolean;
  canJumpToDebrief: boolean;
  stopped: boolean;
  isSending: boolean;
  viewMode: "shield" | "practice";
  practicePhase: PracticePhase;
  practiceRounds: number;
  currentSession: PracticeSessionRecord | null;
  recentSessions: PracticeSessionRecord[];
  onEnterPractice: () => void;
  onStartPractice: () => void;
  onNextRound: () => void;
  onDebrief: () => void;
  onReturnShield: () => void;
  onStop: () => void;
  children: ReactNode;
};

export function PracticePanel({
  distressOptions,
  distressLevel,
  onDistressChange,
  assessmentBanner,
  consented,
  onConsentChange,
  consentDisabled,
  canEnterVillain,
  canStartPractice,
  canNextRound,
  canJumpToDebrief,
  stopped,
  isSending,
  viewMode,
  practicePhase,
  practiceRounds,
  currentSession,
  recentSessions,
  onEnterPractice,
  onStartPractice,
  onNextRound,
  onDebrief,
  onReturnShield,
  onStop,
  children,
}: PracticePanelProps) {
  return (
    <div className="practice-layout">
      <div className="control-panel-wrapper">
        <details className="control-panel-details">
          <summary className="control-panel-summary">
            <span>练习设置</span>
            <em>
              痛苦 {distressLevel}/5 · {viewMode === "shield" ? "盾牌" : "练习"}
            </em>
          </summary>
          <aside className="control-panel">
            <h3 className="desktop-only">会话前痛苦评级</h3>
        {assessmentBanner.show ? (
          <SafetyBanner
            actionLabel="采纳建议"
            message={assessmentBanner.message}
            onAction={assessmentBanner.onApply}
            variant="assessment"
          />
        ) : null}
        <div className="distress-options">
          {distressOptions.map((option) => (
            <button
              className={distressLevel === option.value ? "option selected" : "option"}
              key={option.value}
              onClick={() => onDistressChange(option.value)}
              type="button"
            >
              <span>{option.label}</span>
              <small>{option.helper}</small>
            </button>
          ))}
        </div>
        <label className="consent">
          <input
            checked={consented}
            disabled={consentDisabled}
            onChange={(event) => onConsentChange(event.target.checked)}
            type="checkbox"
          />
          我知道接下来会模拟带有敌意的职场语言，并且可以随时停止。
        </label>
        <button
          className="villain-mode-button"
          disabled={!canEnterVillain || stopped}
          onClick={onEnterPractice}
          type="button"
        >
          <Swords size={18} />
          进入坏蛋模式
        </button>
        {viewMode === "practice" && practicePhase === "idle" ? (
          <button
            className="primary-action compact"
            disabled={!canStartPractice || isSending}
            onClick={onStartPractice}
            type="button"
          >
            开始练习（坏蛋先开口）
          </button>
        ) : null}
        {viewMode === "practice" && practicePhase === "coach_guide" ? (
          <>
            <button
              className="primary-action compact"
              disabled={!canNextRound || isSending}
              onClick={onNextRound}
              type="button"
            >
              <Swords size={16} />
              继续下一轮
            </button>
            <button
              className="secondary-action compact"
              disabled={!canJumpToDebrief || isSending}
              onClick={onDebrief}
              type="button"
            >
              <HeartHandshake size={16} />
              进入复盘
            </button>
          </>
        ) : null}
        {viewMode === "practice" && practicePhase === "debrief" ? (
          <button className="secondary-action compact" onClick={onReturnShield} type="button">
            <Shield size={16} />
            回到盾牌
          </button>
        ) : null}
        <button className="stop-button desktop-stop" disabled={isSending} onClick={onStop} type="button">
          <PauseCircle size={20} />
          STOP · 立刻回到盾牌
        </button>
            <SessionSummary current={currentSession} recent={recentSessions} />
          </aside>
        </details>
      </div>
      <div className="simulation-panel">{children}</div>
    </div>
  );
}

export { MAX_PRACTICE_ROUNDS };
