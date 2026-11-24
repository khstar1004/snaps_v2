export function formatCreditValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  const safe = Math.max(0, value);
  if (safe === 0) return "0";
  if (safe >= 1000) return safe.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
  if (safe >= 100) return safe.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
  if (safe >= 10) return safe.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
  return safe.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

export function toPlanBadgeLabel(plan: string): string {
  const safe = plan.trim().toLowerCase();
  if (!safe || safe === "trial") return "";
  if (safe === "starter") return "Starter";
  if (safe === "growth") return "Growth";
  if (safe === "pro") return "Pro";
  return plan.trim();
}
