import type { PracticeSessionRecord } from "@/lib/session-store";

type SessionSummaryProps = {
  current: PracticeSessionRecord | null;
  recent: PracticeSessionRecord[];
};

export function SessionSummary({ current, recent }: SessionSummaryProps) {
  if (!current && recent.length === 0) return null;

  return (
    <div className="session-summary">
      <h3>本次练习记录</h3>
      {current ? (
        <dl className="session-dl">
          <div>
            <dt>会话</dt>
            <dd>{current.session_id}</dd>
          </div>
          <div>
            <dt>人物</dt>
            <dd>{current.villain_persona}</dd>
          </div>
          <div>
            <dt>轮次</dt>
            <dd>{current.practice_rounds}</dd>
          </div>
          <div>
            <dt>痛苦</dt>
            <dd>
              {current.distress_before}
              {current.distress_after !== null ? ` → ${current.distress_after}` : " → （待快评）"}
              {current.distress_delta ? `（${deltaLabel(current.distress_delta)}）` : ""}
            </dd>
          </div>
          <div>
            <dt>风险信号</dt>
            <dd>{current.risk_signal}</dd>
          </div>
          <div>
            <dt>STOP</dt>
            <dd>{current.stop_triggered ? "是" : "否"}</dd>
          </div>
          {current.debrief_takeaway ? (
            <div>
              <dt>收获</dt>
              <dd>{current.debrief_takeaway}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p>暂无进行中的练习记录。</p>
      )}
      {recent.length > 1 ? (
        <>
          <h4>最近记录</h4>
          <ul className="session-recent-list">
            {recent.slice(0, 3).map((item) => (
              <li key={item.session_id}>
                {item.villain_persona} · {item.practice_rounds} 轮 · 痛苦 {item.distress_before}
                {item.distress_after !== null ? `→${item.distress_after}` : ""}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function deltaLabel(delta: PracticeSessionRecord["distress_delta"]) {
  if (delta === "better") return "更好";
  if (delta === "worse") return "更糟";
  return "差不多";
}
