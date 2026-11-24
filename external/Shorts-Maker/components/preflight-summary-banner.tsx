"use client";

type PreflightSummaryBannerProps = {
  publishReady: boolean;
  scheduleReady: boolean;
  publishCount: number;
  scheduleCount: number;
  publishLabel: string;
  scheduleLabel: string;
};

export function PreflightSummaryBanner({
  publishReady,
  scheduleReady,
  publishCount,
  scheduleCount,
  publishLabel,
  scheduleLabel,
}: PreflightSummaryBannerProps) {
  if (publishReady && scheduleReady) {
    return <div className="warn">점검 완료: 즉시/예약 작업 모두 가능한 상태입니다.</div>;
  }
  return (
    <div className="warn">
      점검 필요:
      {publishLabel} {publishReady ? "준비됨" : `미완료 ${publishCount}건`},
      {scheduleLabel} {scheduleReady ? "준비됨" : `미완료 ${scheduleCount}건`}
    </div>
  );
}
