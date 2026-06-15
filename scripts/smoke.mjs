#!/usr/bin/env node

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

async function post(path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  return { ok: response.ok, status: response.status, json };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log(`Smoke testing ${BASE}/api/chat ...`);

  const start = await post("/api/chat", {
    mode: "practice",
    action: "start",
    consented: true,
    distressLevel: 1,
    crisisScore: 0,
    intensity: "low",
    villainPersona: "gross_boss",
    memory: [],
  });
  assert(start.ok, `start failed: ${start.status} ${start.json.error ?? ""}`);
  assert(start.json.reply, "start missing reply");
  assert(start.json.agent === "villain", "start should return villain");
  console.log("✓ practice start");

  const memory = [{ speaker: "villain", content: start.json.reply }];
  const respond = await post("/api/chat", {
    mode: "practice",
    action: "respond",
    consented: true,
    distressLevel: 1,
    input: "我需要先把验收标准对齐。",
    memory,
    villainPersona: "gross_boss",
    intensity: "low",
  });
  assert(respond.ok, `respond failed: ${respond.status}`);
  assert(respond.json.agent === "coach", "respond should return coach");
  console.log("✓ practice respond");

  const debrief = await post("/api/chat", {
    mode: "practice",
    action: "debrief",
    consented: true,
    distressLevel: 1,
    memory: [
      ...memory,
      { speaker: "user", content: "我需要先把验收标准对齐。" },
      { speaker: "coach", content: respond.json.reply },
    ],
    villainPersona: "gross_boss",
    intensity: "low",
    takeaway: "把争论拉回事实",
  });
  assert(debrief.ok, `debrief failed: ${debrief.status}`);
  assert(debrief.json.agent === "debrief", "debrief should return debrief agent");
  console.log("✓ practice debrief");

  const stop = await post("/api/chat", {
    mode: "shield",
    stopped: true,
    consented: false,
    distressLevel: 2,
    crisisScore: 0,
    intensity: "low",
  });
  assert(stop.ok, `stop failed: ${stop.status}`);
  assert(stop.json.agent === "shield", "stop should return shield");
  assert(
    stop.json.riskMonitor?.signal === "stop_and_shield" ||
      stop.json.reply?.includes("停") ||
      stop.json.reply?.includes("接招"),
    "stop should have shield reply or stop signal",
  );
  console.log("✓ STOP → shield");

  const blocked = await post("/api/chat", {
    mode: "practice",
    action: "start",
    consented: true,
    distressLevel: 2,
    crisisScore: 1,
    intensity: "low",
    villainPersona: "gross_boss",
    memory: [],
  });
  assert(blocked.json.blocked === true, "crisis should block practice");
  console.log("✓ crisis blocks practice");

  console.log("\nAll smoke checks passed.");
}

main().catch((error) => {
  console.error("\nSmoke test failed:", error.message);
  process.exit(1);
});
