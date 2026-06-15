"use client";

type PostPracticeModalProps = {
  open: boolean;
  distressBefore: number;
  onSubmit: (input: {
    distressAfter: number;
    delta: "better" | "same" | "worse";
    takeaway: string;
  }) => void;
  onSkip: () => void;
};

const deltaOptions: { id: "better" | "same" | "worse"; label: string }[] = [
  { id: "better", label: "比练习前更好" },
  { id: "same", label: "差不多" },
  { id: "worse", label: "比练习前更糟" },
];

export function PostPracticeModal({
  open,
  distressBefore,
  onSubmit,
  onSkip,
}: PostPracticeModalProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <form
        className="post-practice-modal"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          onSubmit({
            distressAfter: Number(data.get("distress_after") ?? distressBefore),
            delta: (data.get("delta") as "better" | "same" | "worse") ?? "same",
            takeaway: String(data.get("takeaway") ?? "").trim(),
          });
        }}
      >
        <h3>练习后快评</h3>
        <p>练习前痛苦评级：{distressBefore}/5。这几题帮助我们记录当次安全指标。</p>
        <label>
          现在痛苦评级（1-5）
          <select defaultValue={String(distressBefore)} name="distress_after">
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>与练习前相比</legend>
          {deltaOptions.map((option) => (
            <label className="radio-row" key={option.id}>
              <input defaultChecked={option.id === "same"} name="delta" type="radio" value={option.id} />
              {option.label}
            </label>
          ))}
        </fieldset>
        <label>
          我学到了什么（可选）
          <textarea name="takeaway" placeholder="一句话收获，会写入本次练习记录" rows={2} />
        </label>
        <div className="modal-actions">
          <button className="primary-action" type="submit">
            保存并继续
          </button>
          <button className="secondary-action" onClick={onSkip} type="button">
            跳过
          </button>
        </div>
      </form>
    </div>
  );
}
