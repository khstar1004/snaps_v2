import { Client } from "@upstash/qstash";

let clientInstance: Client | null = null;

function getClient(): Client {
  if (clientInstance) return clientInstance;
  const token = process.env.QSTASH_TOKEN?.trim() || "";
  const baseUrl = process.env.QSTASH_URL?.trim() || "";
  if (!token) {
    throw new Error("QSTASH_TOKEN is required");
  }
  clientInstance = new Client({
    token,
    baseUrl: baseUrl || undefined,
  });
  return clientInstance;
}

function resolveExecuteUrl(): string {
  const base = process.env.APP_BASE_URL?.trim() || "";
  if (!base) {
    throw new Error("APP_BASE_URL is required");
  }
  return `${base.replace(/\/$/, "")}/api/publish/execute`;
}

function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  if (host === "localhost" || host === "::1" || host === "[::1]") return true;
  if (host.startsWith("127.")) return true;
  return false;
}

async function executeJobDirectly(url: string, jobId: string, userId: string): Promise<void> {
  const executeSecret = process.env.PUBLISH_EXECUTE_SECRET?.trim() || "";
  if (!executeSecret) {
    throw new Error("PUBLISH_EXECUTE_SECRET is required");
  }
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-publish-secret": executeSecret,
    },
    body: JSON.stringify({ jobId, userId }),
    cache: "no-store",
  });
  if (!response.ok) {
    const bodyText = (await response.text()).slice(0, 240);
    throw new Error(`Direct execute failed (${response.status}): ${bodyText}`);
  }
}

export async function enqueuePublishJob(jobId: string, userId: string, delayMs = 0): Promise<void> {
  const url = resolveExecuteUrl();
  const executeSecret = process.env.PUBLISH_EXECUTE_SECRET?.trim() || "";
  if (!executeSecret) {
    throw new Error("PUBLISH_EXECUTE_SECRET is required");
  }
  const parsedUrl = new URL(url);
  if (isLoopbackHostname(parsedUrl.hostname)) {
    if (delayMs > 0) {
      throw new Error(
        "Scheduled delay on localhost is not supported with QStash. Use a public APP_BASE_URL (ngrok/tunnel) or publish immediately."
      );
    }
    await executeJobDirectly(url, jobId, userId);
    return;
  }

  const client = getClient();
  const delaySec = Math.max(0, Math.floor(delayMs / 1000));
  await client.publishJSON({
    url,
    body: { jobId, userId },
    retries: 3,
    delay: delaySec > 0 ? delaySec : undefined,
    headers: { "x-publish-secret": executeSecret },
  });
}
