export type QuestionnaireScores = {
  depressionScore: number;
  anxietyScore: number;
  crisisScore: number;
  totalScore: number;
};

export type DistressSuggestion = {
  suggestedLevel: number;
  reason: string;
  lockPractice: boolean;
  crisisExit: boolean;
};

/** 问卷子分 → 建议痛苦评级（用户可手动 override） */
export function suggestDistressFromQuestionnaire(scores: QuestionnaireScores): DistressSuggestion {
  if (scores.crisisScore > 0) {
    return {
      suggestedLevel: 5,
      reason: "危机预警项不为 0，撤下全部模拟。",
      lockPractice: true,
      crisisExit: true,
    };
  }

  if (scores.depressionScore >= 15 || scores.anxietyScore >= 12) {
    return {
      suggestedLevel: 4,
      reason: "抑郁/焦虑子分偏高，建议只保留盾牌，不进入陪练。",
      lockPractice: true,
      crisisExit: false,
    };
  }

  if (scores.depressionScore >= 10 || scores.anxietyScore >= 8 || scores.totalScore >= 25) {
    return {
      suggestedLevel: 3,
      reason: "问卷显示明显困扰，陪练仅限低强度。",
      lockPractice: false,
      crisisExit: false,
    };
  }

  if (scores.depressionScore >= 5 || scores.anxietyScore >= 5) {
    return {
      suggestedLevel: 2,
      reason: "问卷显示有一定波动，建议低强度陪练。",
      lockPractice: false,
      crisisExit: false,
    };
  }

  return {
    suggestedLevel: 1,
    reason: "问卷处于相对平稳区间，可在同意后进入练习。",
    lockPractice: false,
    crisisExit: false,
  };
}
