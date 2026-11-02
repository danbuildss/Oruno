import { percentUsed, usd } from "../money";

export function Usage({ spent, cap }: { spent: string; cap: string }) {
  const pct = percentUsed(spent, cap);
  const left = BigInt(cap) - BigInt(spent);
  return (
    <div className="usage">
      <div
        className="bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Credit used"
      >
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="usage-text">
        <span>{usd(spent)} used</span>
        <strong>{usd(left > 0n ? left : 0n)} left</strong>
      </p>
    </div>
  );
}
