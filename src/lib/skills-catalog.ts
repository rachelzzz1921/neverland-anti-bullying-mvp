export type SkillCategory = "foundation" | "ui" | "agent" | "deployment" | "safety";
export type SkillPhase = "now" | "next" | "later";
export type SkillStatus = "active" | "installed" | "planned";

export type SkillRecord = {
  id: string;
  name: string;
  category: SkillCategory;
  phase: SkillPhase;
  status: SkillStatus;
  use: string;
  install?: string;
};

export const skillCategoryLabels: Record<SkillCategory, string> = {
  foundation: "底座",
  ui: "界面",
  agent: "Agent",
  deployment: "部署",
  safety: "安全",
};

export const skillPhaseLabels: Record<SkillPhase, string> = {
  now: "当前",
  next: "下一步",
  later: "后续",
};

export const skillStatusLabels: Record<SkillStatus, string> = {
  active: "使用中",
  installed: "已安装",
  planned: "规划中",
};

export const skillsCatalog: SkillRecord[] = [
  {
    id: "roadmap",
    name: "roadmap",
    category: "foundation",
    phase: "now",
    status: "active",
    use: "把 MVP 收敛成可执行阶段：先验证安全对话闭环，再扩展真实模型、账户和数据。",
  },
  {
    id: "nextjs",
    name: "nextjs",
    category: "foundation",
    phase: "now",
    status: "active",
    use: "作为页面和交互底座，适合后续部署到 Vercel，并逐步增加 API route / Server Actions。",
  },
  {
    id: "shadcn-ui",
    name: "shadcn/ui",
    category: "ui",
    phase: "next",
    status: "planned",
    use: "作为后续组件体系与视觉语言参考：卡片、标签、对话框、表单和空状态都应保持安静、可访问。",
  },
  {
    id: "web-design-guidelines",
    name: "web-design-guidelines",
    category: "ui",
    phase: "next",
    status: "planned",
    use: "用于后续 UI/UX 审查，重点检查可读性、状态反馈、移动端和危机出口是否足够明显。",
  },
  {
    id: "tanstack-table",
    name: "tanstack-table",
    category: "ui",
    phase: "now",
    status: "installed",
    use: "Skill 管理与数据列表采用分页、筛选、排序，避免一屏无限下拉。",
    install: "npx skills add tanstack-skills/tanstack-skills@tanstack-table -g -y",
  },
  {
    id: "find-skills",
    name: "find-skills",
    category: "agent",
    phase: "now",
    status: "installed",
    use: "从 skills.sh 搜索、安装和更新 agent skills，快速补齐 MVP 所需能力。",
  },
  {
    id: "skill-creator",
    name: "skill-creator",
    category: "agent",
    phase: "next",
    status: "planned",
    use: "当 Neverland 的 agent 协作规则稳定后，把盾牌/坏蛋/引导/复盘沉淀成可复用 skill。",
  },
  {
    id: "ai-sdk",
    name: "ai-sdk",
    category: "agent",
    phase: "next",
    status: "planned",
    use: "接入真实模型编排、流式回复和结构化风险管理 JSON 输出。",
  },
  {
    id: "verification",
    name: "verification",
    category: "safety",
    phase: "next",
    status: "planned",
    use: "端到端验证盾牌 → 练习 → 引导 → 复盘闭环，以及 STOP / 危机出口是否生效。",
  },
  {
    id: "supabase",
    name: "supabase",
    category: "deployment",
    phase: "later",
    status: "planned",
    use: "后续存储会话记忆、痛苦评级趋势和匿名问卷结果，并配合 RLS 保护用户数据。",
  },
  {
    id: "vercel-cli",
    name: "vercel-cli",
    category: "deployment",
    phase: "later",
    status: "planned",
    use: "预览部署、环境变量管理和线上日志排查，支撑 MVP 对外演示。",
  },
  {
    id: "canvas",
    name: "canvas",
    category: "ui",
    phase: "later",
    status: "planned",
    use: "把 agent 协作机制、强度锁和阶段机做成可交互说明，方便产品评审。",
  },
];

/** @deprecated Use skillsCatalog instead. */
export const selectedSkills = skillsCatalog
  .filter((skill) => skill.status === "active" || skill.status === "installed")
  .slice(0, 4)
  .map(({ name, use }) => ({ name, use }));
