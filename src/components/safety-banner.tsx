type SafetyBannerProps = {
  variant: "downgrade" | "assessment" | "shield-return";
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function SafetyBanner({ variant, message, actionLabel, onAction }: SafetyBannerProps) {
  return (
    <div className={`safety-banner ${variant}`} role="status">
      <p>{message}</p>
      {actionLabel && onAction ? (
        <button className="secondary-action compact" onClick={onAction} type="button">
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
