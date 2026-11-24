"use client";

import { useEffect, useRef } from "react";
import type { PublishPreflightIssue } from "@/lib/publish/preflight";
import { toPreflightDetail } from "@/lib/publish/preflight";
import { trackWorkflowEvent } from "@/lib/telemetry/client";
import type { WorkflowEventPage } from "@/lib/telemetry/schema";

export function usePreflightTracking(input: {
  issues: PublishPreflightIssue[];
  page: WorkflowEventPage;
  stage: string;
  ready: boolean;
}) {
  const lastDetailRef = useRef("");

  useEffect(() => {
    const detail = toPreflightDetail(input.issues);
    if (lastDetailRef.current === detail) return;
    lastDetailRef.current = detail;
    trackWorkflowEvent({
      name: "publish_preflight_checked",
      page: input.page,
      stage: input.stage,
      status: input.ready ? "success" : "failure",
      detail,
    });
  }, [input.issues, input.page, input.ready, input.stage]);
}
