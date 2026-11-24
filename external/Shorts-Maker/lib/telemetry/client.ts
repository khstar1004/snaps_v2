import type { WorkflowEventName, WorkflowEventPage } from "@/lib/telemetry/schema";

export type WorkflowTelemetryEvent = {
  name: WorkflowEventName;
  page: WorkflowEventPage;
  stage?: string;
  status?: "success" | "failure";
  detail?: string;
  errorCode?: string;
  retryable?: boolean;
};

export function trackWorkflowEvent(event: WorkflowTelemetryEvent): void {
  try {
    const route = typeof window !== "undefined" ? window.location.pathname : "";
    const sessionId =
      typeof window !== "undefined"
        ? (() => {
            const key = "workflow-session-id-v1";
            const found = window.sessionStorage.getItem(key);
            if (found) return found;
            const created = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            window.sessionStorage.setItem(key, created);
            return created;
          })()
        : "";
    const payload = {
      ...event,
      route: route || undefined,
      sessionId: sessionId || undefined,
      ts: Date.now(),
    };
    void fetch("/api/telemetry/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    return;
  }
}
