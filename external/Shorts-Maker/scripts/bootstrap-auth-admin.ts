import { ensureBootstrapAdminUser, getBootstrapAdminLoginId, shouldAutoBootstrapAdminOnLogin } from "@/lib/auth/bootstrap";

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

function printUsage(): void {
  console.log("Usage: npm run auth:bootstrap-admin -- [--dry-run]");
}

async function main(): Promise<void> {
  if (hasFlag("--help") || hasFlag("-h")) {
    printUsage();
    return;
  }

  const loginId = getBootstrapAdminLoginId();
  if (!loginId) {
    throw new Error(
      "Bootstrap admin config is missing. Set AUTH_BOOTSTRAP_ADMIN_LOGIN_ID and AUTH_BOOTSTRAP_ADMIN_PASSWORD, " +
        "or run in non-production to use the derived local admin."
    );
  }

  if (hasFlag("--dry-run")) {
    console.log(
      `[auth:bootstrap-admin] Ready to provision loginId="${loginId}" ` +
        `(autoSyncOnLogin=${shouldAutoBootstrapAdminOnLogin() ? "enabled" : "disabled"}).`
    );
    return;
  }

  const user = await ensureBootstrapAdminUser({ syncPassword: true });
  if (!user) {
    throw new Error("Bootstrap admin provisioning is not available with the current environment.");
  }

  console.log(
    `[auth:bootstrap-admin] Provisioned loginId="${user.loginId}" id="${user.id}" ` +
      `role="${user.role}" active=${user.isActive ? "true" : "false"}.`
  );
  if (!shouldAutoBootstrapAdminOnLogin()) {
    console.log("[auth:bootstrap-admin] Login-time bootstrap sync is disabled by default for explicit admin credentials.");
  }
}

main().catch((error) => {
  console.error(`[auth:bootstrap-admin] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
