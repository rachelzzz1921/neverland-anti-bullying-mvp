import { AlertTriangle } from "lucide-react";

export function CrisisExitPanel() {
  return (
    <div className="crisis-exit-panel" role="alert">
      <div className="crisis-exit-header">
        <AlertTriangle size={20} />
        <b>危机出口已触发</b>
      </div>
      <p>已撤下全部模拟练习。若你正处于立即危险中，请联系当地紧急服务或可信任的人。</p>
      <ul>
        <li>中国大陆心理援助热线：12320 / 各地心理危机干预热线</li>
        <li>如有自伤或伤害他人冲动，请立即寻求专业帮助</li>
      </ul>
      <small>本平台不能替代专业医疗或危机干预服务。</small>
    </div>
  );
}
