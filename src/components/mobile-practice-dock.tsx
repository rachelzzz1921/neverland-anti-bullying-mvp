"use client";

import { HeartHandshake, PauseCircle, Shield, Swords } from "lucide-react";
import type { PracticePhase } from "@/lib/orchestrator";

type MobilePracticeDockProps = {
  visible: boolean;
  viewMode: "shield" | "practice";
  practicePhase: PracticePhase;
  canStartPractice: boolean;
  canNextRound: boolean;
  canJumpToDebrief: boolean;
  isSending: boolean;
  onStop: () => void;
  onStartPractice: () => void;
  onNextRound: () => void;
  onDebrief: () => void;
  onReturnShield: () => void;
};

export function MobilePracticeDock({
  visible,
  viewMode,
  practicePhase,
  canStartPractice,
  canNextRound,
  canJumpToDebrief,
  isSending,
  onStop,
  onStartPractice,
  onNextRound,
  onDebrief,
  onReturnShield,
}: MobilePracticeDockProps) {
  if (!visible) return null;

  return (
    <div aria-label="练习快捷操作" className="mobile-practice-dock mobile-only" role="toolbar">
      {viewMode === "practice" && practicePhase === "idle" ? (
        <button
          className="dock-action primary"
          disabled={!canStartPractice || isSending}
          onClick={onStartPractice}
          type="button"
        >
          <Swords size={16} />
          开始
        </button>
      ) : null}
      {viewMode === "practice" && practicePhase === "coach_guide" ? (
        <>
          <button
            className="dock-action"
            disabled={!canNextRound || isSending}
            onClick={onNextRound}
            type="button"
          >
            <Swords size={16} />
            下一轮
          </button>
          <button
            className="dock-action"
            disabled={!canJumpToDebrief || isSending}
            onClick={onDebrief}
            type="button"
          >
            <HeartHandshake size={16} />
            复盘
          </button>
        </>
      ) : null}
      {viewMode === "practice" && practicePhase === "debrief" ? (
        <button className="dock-action" disabled={isSending} onClick={onReturnShield} type="button">
          <Shield size={16} />
          回盾牌
        </button>
      ) : null}
      <button className="dock-action stop" disabled={isSending} onClick={onStop} type="button">
        <PauseCircle size={16} />
        STOP
      </button>
    </div>
  );
}
