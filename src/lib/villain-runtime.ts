import type { Intensity } from "@/lib/orchestrator";

export type VillainRuntimeContext = {
  agent: "villain";
  distress_level: number;
  max_intensity: Intensity;
  forbidden_content: string[];
  stop_policy: string;
};

export function buildVillainRuntimeJson(
  distressLevel: number,
  maxIntensity: Intensity,
): string {
  const ctx: VillainRuntimeContext = {
    agent: "villain",
    distress_level: distressLevel,
    max_intensity: maxIntensity,
    forbidden_content: [
      "身份侮辱",
      "暴力威胁",
      "性相关内容",
      "自伤相关内容",
      "主动升级攻击",
    ],
    stop_policy: "收到停止或降级信号立即停止，不补最后一句",
  };
  return JSON.stringify(ctx, null, 2);
}

export function appendVillainRuntime(prompt: string, distressLevel: number, intensity: Intensity): string {
  return `${prompt}\n\n运行时安全上下文（必须遵守）：\n${buildVillainRuntimeJson(distressLevel, intensity)}`;
}
