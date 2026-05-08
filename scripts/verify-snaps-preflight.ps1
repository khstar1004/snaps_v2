param(
  [switch]$IncludeOllama
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
  param(
    [string]$Name,
    [string]$Command,
    [string[]]$Arguments = @()
  )

  Write-Host "==> $Name"
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

function Test-PowerShellScript {
  param([string]$Path)

  Write-Host "==> parse $Path"
  $tokens = $null
  $parseErrors = $null
  $null = [System.Management.Automation.Language.Parser]::ParseFile(
    (Resolve-Path $Path),
    [ref]$tokens,
    [ref]$parseErrors
  )
  if ($parseErrors.Count) {
    $parseErrors | ForEach-Object { Write-Host $_.Message }
    throw "$Path has PowerShell parse errors"
  }
}

function Test-FilteredTypecheck {
  param(
    [string]$Name,
    [string]$Project,
    [string]$Pattern
  )

  Write-Host "==> $Name"
  $output = & "node_modules\.bin\tsc.cmd" "-p" $Project "--noEmit" "--pretty" "false" 2>&1
  $matches = $output | Select-String -Pattern $Pattern
  if ($matches) {
    $matches | ForEach-Object { Write-Host $_ }
    throw "$Name found snaps-related typecheck output"
  }
}

function Test-ReadinessJsonContract {
  Write-Host "==> snaps readiness JSON contract"
  $output = & "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -ExecutionPolicy Bypass `
    -File "scripts/verify-snaps-readiness.ps1" `
    -Json 2>&1
  if ($LASTEXITCODE -ne 0) {
    $output | ForEach-Object { Write-Host $_ }
    throw "snaps readiness JSON contract failed with exit code $LASTEXITCODE"
  }

  $text = ($output | Out-String).Trim()
  try {
    $readiness = $text | ConvertFrom-Json
  } catch {
    Write-Host $text
    throw "snaps readiness JSON output could not be parsed: $($_.Exception.Message)"
  }

  if ($readiness.product -ne "snaps") {
    throw "snaps readiness JSON product mismatch: $($readiness.product)"
  }
  if ($null -eq $readiness.ready -or $null -eq $readiness.warn -or $null -eq $readiness.blocked) {
    throw "snaps readiness JSON summary counts are missing."
  }
  $checkNames = @($readiness.checks | ForEach-Object { $_.name })
  foreach ($requiredCheck in @(
    "node-version",
    "database-tcp",
    "redis-tcp",
    "temporal-tcp",
    "backend-snaps-health",
    "backend-api-snaps-health",
    "frontend-snaps-route",
    "ollama-models"
  )) {
    if ($checkNames -notcontains $requiredCheck) {
      throw "snaps readiness JSON is missing check: $requiredCheck"
    }
  }

  Write-Host "readiness JSON ok: ready=$($readiness.ready) warn=$($readiness.warn) blocked=$($readiness.blocked)"
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Push-Location $repoRoot
try {
  Invoke-Step "snaps static verifier" "node" @("scripts/verify-snaps-static.mjs")
  Invoke-Step "snaps env verifier" "node" @("scripts/verify-snaps-env.mjs")
  Invoke-Step "snaps completion audit verifier" "node" @("scripts/verify-snaps-audit.mjs")
  Invoke-Step "snaps API contract verifier" "node" @("scripts/verify-snaps-api-contract.mjs")
  Invoke-Step "snaps frontend surface verifier" "node" @("scripts/verify-snaps-frontend-surface.mjs")
  Invoke-Step "snaps product shell verifier" "node" @("scripts/verify-snaps-product-shell.mjs")
  Invoke-Step "snaps runtime smoke contract verifier" "node" @("scripts/verify-snaps-runtime-contract.mjs")
  Invoke-Step "snaps DB contract verifier" "node" @("scripts/verify-snaps-db-contract.mjs")
  Invoke-Step "snaps platform contract verifier" "node" @("scripts/verify-snaps-platform-contract.mjs")
  Invoke-Step "snaps provider contract verifier" "node" @("scripts/verify-snaps-provider-contract.mjs")
  Invoke-Step "snaps demo workspace verifier" "node" @("scripts/verify-snaps-demo-workspace.mjs")
  Invoke-Step "snaps Naver Cafe live verifier dry-run" "node_modules\.bin\ts-node.cmd" @(
    "--transpile-only",
    "-r",
    "tsconfig-paths/register",
    "--project",
    "tsconfig.base.json",
    "--compiler-options",
    '{\"module\":\"commonjs\"}',
    "scripts/verify-snaps-naver-cafe.ts",
    "--dry-run"
  )
  Invoke-Step "snaps Pixelle live verifier dry-run" "node_modules\.bin\ts-node.cmd" @(
    "--transpile-only",
    "-r",
    "tsconfig-paths/register",
    "--project",
    "tsconfig.base.json",
    "--compiler-options",
    '{\"module\":\"commonjs\"}',
    "scripts/verify-snaps-pixelle.ts",
    "--dry-run"
  )
  Invoke-Step "snaps service smoke" "node_modules\.bin\ts-node.cmd" @(
    "--transpile-only",
    "-r",
    "tsconfig-paths/register",
    "--project",
    "tsconfig.base.json",
    "--compiler-options",
    '{\"module\":\"commonjs\"}',
    "scripts/verify-snaps-services.ts"
  )
  Invoke-Step "snaps controller smoke" "node_modules\.bin\ts-node.cmd" @(
    "--transpile-only",
    "-r",
    "tsconfig-paths/register",
    "--project",
    "tsconfig.base.json",
    "--compiler-options",
    '{\"module\":\"commonjs\"}',
    "scripts/verify-snaps-controller.ts"
  )
  Invoke-Step "snaps libraries typecheck" "node_modules\.bin\tsc.cmd" @(
    "-p",
    "libraries/nestjs-libraries/tsconfig.json",
    "--noEmit",
    "--pretty",
    "false"
  )
  Invoke-Step "Backend full typecheck" "node_modules\.bin\tsc.cmd" @(
    "-p",
    "apps/backend/tsconfig.json",
    "--noEmit",
    "--pretty",
    "false"
  )
  Invoke-Step "Frontend full typecheck" "node_modules\.bin\tsc.cmd" @(
    "-p",
    "apps/frontend/tsconfig.json",
    "--noEmit",
    "--pretty",
    "false"
  )
  Invoke-Step "Orchestrator full typecheck" "node_modules\.bin\tsc.cmd" @(
    "-p",
    "apps/orchestrator/tsconfig.json",
    "--noEmit",
    "--pretty",
    "false"
  )
  Invoke-Step "Commands full typecheck" "node_modules\.bin\tsc.cmd" @(
    "-p",
    "apps/commands/tsconfig.json",
    "--noEmit",
    "--pretty",
    "false"
  )
  Invoke-Step "Extension full typecheck" "node_modules\.bin\tsc.cmd" @(
    "-p",
    "apps/extension/tsconfig.json",
    "--noEmit",
    "--pretty",
    "false"
  )
  Invoke-Step "SDK full typecheck" "node_modules\.bin\tsc.cmd" @(
    "-p",
    "apps/sdk/tsconfig.json",
    "--noEmit",
    "--pretty",
    "false"
  )
  Test-FilteredTypecheck `
    "Backend snaps typecheck filter" `
    "apps/backend/tsconfig.json" `
    "snaps|reply-capabilities|publish-reply|SnapsFeedbackPublishReplyDto|IntegrationManager|naver-cafe"
  Test-FilteredTypecheck `
    "Frontend snaps typecheck filter" `
    "apps/frontend/tsconfig.json" `
    "snaps|replyIntegrationOptions|replyCapabilities|publishPlatformReply|플랫폼 게시|naver-cafe"
  Invoke-Step "Jest test smoke" "npm.cmd" @(
    "test",
    "--",
    "--runInBand"
  )

  $previousDatabaseUrl = $env:DATABASE_URL
  if (-not $env:DATABASE_URL) {
    $env:DATABASE_URL = "postgresql://snaps-user:snaps-password@localhost:5432/snaps-db-local"
  }
  try {
    Invoke-Step "Prisma schema validate" "node_modules\.bin\prisma.cmd" @(
      "validate",
      "--schema",
      "libraries/nestjs-libraries/src/database/prisma/schema.prisma"
    )
  } finally {
    $env:DATABASE_URL = $previousDatabaseUrl
  }

  Invoke-Step "Docker compose config" "docker" @(
    "compose",
    "-f",
    "docker-compose.yaml",
    "config",
    "--quiet"
  )
  Invoke-Step "Docker compose dev config" "docker" @(
    "compose",
    "-f",
    "docker-compose.dev.yaml",
    "config",
    "--quiet"
  )
  Invoke-Step "snaps Docker dev image cache report" "node" @(
    "scripts/verify-snaps-dev-images.mjs"
  )

  Test-PowerShellScript "scripts/verify-snaps-runtime.ps1"
  Test-PowerShellScript "scripts/verify-snaps-ollama.ps1"
  Test-PowerShellScript "scripts/verify-snaps-final.ps1"
  Test-PowerShellScript "scripts/verify-snaps-final-guards.ps1"
  Test-PowerShellScript "scripts/verify-snaps-readiness.ps1"
  Test-PowerShellScript "scripts/snaps-runtime-handoff.ps1"
  Invoke-Step "snaps final option guard verifier" "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" @(
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "scripts/verify-snaps-final-guards.ps1"
  )
  Invoke-Step "snaps readiness report" "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" @(
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "scripts/verify-snaps-readiness.ps1"
  )
  Test-ReadinessJsonContract
  Invoke-Step "snaps final prerequisite smoke" "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" @(
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "scripts/verify-snaps-final.ps1",
    "-CheckPrerequisitesOnly"
  )

  if ($IncludeOllama) {
    Invoke-Step "snaps Ollama smoke" "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" @(
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      "scripts/verify-snaps-ollama.ps1"
    )
  }

  Write-Host "verify-snaps-preflight-ok"
} finally {
  Pop-Location
}
