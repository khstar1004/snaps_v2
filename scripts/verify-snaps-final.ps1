param(
  [string]$BaseUrl = "",
  [string]$FrontendUrl = "",
  [string]$Auth = "",
  [string]$ShowOrg = "",
  [string]$ConnectedIntegrationId = "",
  [string]$ConnectedPlatform = "instagram",
  [string]$ConnectedNaverCafeClubId = "",
  [string]$ConnectedNaverCafeMenuId = "",
  [string]$RuntimeSmokeId = "",
  [switch]$IncludeMutating,
  [switch]$IncludeConnectedSchedule,
  [switch]$IncludeNaverCafeLive,
  [switch]$IncludePixelleDirect,
  [switch]$IncludePixelleJob,
  [switch]$IncludeInboxClear,
  [switch]$IncludeOllama,
  [switch]$ApplyDbPush,
  [switch]$CheckPrerequisitesOnly,
  [switch]$SkipPreflight,
  [switch]$SkipBuild
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

function Invoke-PnpmStep {
  param(
    [string]$Name,
    [string[]]$Arguments = @()
  )

  $pnpmCommand = Get-Command "pnpm.cmd" -ErrorAction SilentlyContinue
  if ($pnpmCommand) {
    Invoke-Step $Name $pnpmCommand.Source $Arguments
    return
  }

  $localPnpm = Get-ChildItem -Path ".corepack\v1\pnpm" -Recurse -Filter "pnpm.cjs" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "\\bin\\pnpm\.cjs$" } |
    Select-Object -First 1
  if ($localPnpm) {
    $nodeArguments = @($localPnpm.FullName) + $Arguments
    Invoke-Step $Name "node" $nodeArguments
    return
  }

  throw "pnpm is not on PATH and no repository-local Corepack pnpm.cjs was found."
}

function Invoke-Prisma {
  param(
    [string]$Name,
    [string[]]$Arguments = @()
  )

  $prisma = "node_modules\.bin\prisma.cmd"
  if (-not (Test-Path $prisma)) {
    throw "Prisma CLI was not found at $prisma. Run dependency installation before verify:snaps:final."
  }
  Invoke-Step $Name $prisma $Arguments
}

function Assert-EnvValue {
  param(
    [string]$Name,
    [string]$ExpectedValue = ""
  )

  $value = [Environment]::GetEnvironmentVariable($Name)
  if (-not $value) {
    throw "$Name is required for this final verification option."
  }
  if ($ExpectedValue -and $value -ne $ExpectedValue) {
    throw "$Name must be set to '$ExpectedValue' for this final verification option."
  }
}

function Assert-FinalOptionPrerequisites {
  if ($IncludeOllama) {
    Assert-EnvValue "SNAPS_OLLAMA_RAG_CONFIRM" "embed"
  }

  if ($ConnectedIntegrationId) {
    Assert-EnvValue "SNAPS_CONNECTED_DRAFT_CONFIRM" "draft"
  }

  if ($IncludeConnectedSchedule -and -not $ConnectedIntegrationId) {
    throw "-IncludeConnectedSchedule requires -ConnectedIntegrationId because it creates a real scheduled post."
  }
  if ($IncludeConnectedSchedule) {
    Assert-EnvValue "SNAPS_CONNECTED_SCHEDULE_CONFIRM" "schedule"
  }

  if ($IncludeNaverCafeLive) {
    Assert-EnvValue "NAVER_CAFE_ACCESS_TOKEN"
    Assert-EnvValue "NAVER_CAFE_CLUB_ID"
    Assert-EnvValue "NAVER_CAFE_MENU_ID"
    Assert-EnvValue "SNAPS_NAVER_CAFE_CONFIRM" "post"
  }

  if ($IncludePixelleDirect) {
    Assert-EnvValue "PIXELLE_VIDEO_URL"
    Assert-EnvValue "SNAPS_PIXELLE_CONFIRM" "generate"
  }

  if ($IncludePixelleJob) {
    Assert-EnvValue "PIXELLE_VIDEO_URL"
    Assert-EnvValue "SNAPS_PIXELLE_CONFIRM" "generate"
  }

  if ($IncludeInboxClear) {
    Assert-EnvValue "SNAPS_INBOX_CLEAR_CONFIRM" "clear"
  }

  if ($ApplyDbPush) {
    Assert-EnvValue "SNAPS_DB_PUSH_CONFIRM" "push"
  }

  if ($IncludeMutating) {
    Assert-EnvValue "SNAPS_MUTATING_CONFIRM" "mutate"
  }

  Assert-EnvValue "SNAPS_RUNTIME_CONFIRM" "smoke"
}

function Get-DotEnvValue {
  param(
    [string]$Path,
    [string]$Name
  )

  if (-not (Test-Path $Path)) {
    return ""
  }

  $pattern = "^\s*$([regex]::Escape($Name))\s*=\s*(.+?)\s*$"
  foreach ($line in Get-Content $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }
    if ($trimmed -match $pattern) {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }

  return ""
}

function Resolve-SnapsBaseUrl {
  param([string]$ExplicitBaseUrl)

  if ($ExplicitBaseUrl) {
    return $ExplicitBaseUrl.TrimEnd("/")
  }

  $candidates = @(
    [Environment]::GetEnvironmentVariable("NEXT_PUBLIC_BACKEND_URL"),
    [Environment]::GetEnvironmentVariable("BACKEND_INTERNAL_URL"),
    (Get-DotEnvValue -Path ".env" -Name "NEXT_PUBLIC_BACKEND_URL"),
    (Get-DotEnvValue -Path ".env" -Name "BACKEND_INTERNAL_URL")
  ) | Where-Object { $_ }

  foreach ($candidate in $candidates) {
    $normalized = $candidate.Trim().TrimEnd("/")
    if ($normalized.EndsWith("/api")) {
      $normalized = $normalized.Substring(0, $normalized.Length - 4)
    }
    if ($normalized) {
      return $normalized
    }
  }

  $port = [Environment]::GetEnvironmentVariable("PORT")
  if (-not $port) {
    $port = Get-DotEnvValue -Path ".env" -Name "PORT"
  }
  if ($port) {
    return "http://localhost:$port"
  }

  return "http://localhost:3000"
}

function Resolve-SnapsFrontendUrl {
  param([string]$ExplicitFrontendUrl)

  if ($ExplicitFrontendUrl) {
    return $ExplicitFrontendUrl.TrimEnd("/")
  }

  $frontend = [Environment]::GetEnvironmentVariable("FRONTEND_URL")
  if (-not $frontend) {
    $frontend = Get-DotEnvValue -Path ".env" -Name "FRONTEND_URL"
  }
  if ($frontend) {
    return $frontend.TrimEnd("/")
  }

  return ""
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Push-Location $repoRoot
try {
  $BaseUrl = Resolve-SnapsBaseUrl -ExplicitBaseUrl $BaseUrl
  $FrontendUrl = Resolve-SnapsFrontendUrl -ExplicitFrontendUrl $FrontendUrl

  if ($CheckPrerequisitesOnly) {
    Invoke-PnpmStep "pnpm resolution smoke" @("--version")
    $prisma = "node_modules\.bin\prisma.cmd"
    if (-not (Test-Path $prisma)) {
      throw "Prisma CLI was not found at $prisma. Run dependency installation before verify:snaps:final."
    }
    Write-Host "Prisma CLI path ok: $prisma"
    Write-Host "verify-snaps-final-prerequisites-ok"
    return
  }

  if (-not $Auth) {
    throw "verify-snaps-final requires -Auth from a logged-in browser session. Use verify:snaps:preflight for install-skipped checks."
  }

  Assert-FinalOptionPrerequisites

  if (-not $SkipPreflight) {
    $preflightArgs = @(
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      "scripts/verify-snaps-preflight.ps1"
    )
    if ($IncludeOllama) {
      $preflightArgs += "-IncludeOllama"
    }
    Invoke-Step "snaps install-ready preflight" "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" $preflightArgs
  }

  Invoke-Prisma "Prisma client generate" @(
    "generate",
    "--schema",
    "libraries/nestjs-libraries/src/database/prisma/schema.prisma"
  )

  if ($ApplyDbPush) {
    Invoke-Prisma "Prisma db push" @(
      "db",
      "push",
      "--accept-data-loss",
      "--schema",
      "libraries/nestjs-libraries/src/database/prisma/schema.prisma"
    )
  } else {
    Write-Host "==> Prisma db push skipped. Pass -ApplyDbPush after reviewing DATABASE_URL and migration policy."
  }

  if (-not $SkipBuild) {
    Invoke-PnpmStep "Production build" @(
      "-r",
      "--workspace-concurrency=1",
      "--filter",
      "./apps/frontend",
      "--filter",
      "./apps/backend",
      "--filter",
      "./apps/orchestrator",
      "run",
      "build"
    )
  }

  Invoke-Step "snaps Docker dev image cache report" "node" @(
    "scripts/verify-snaps-dev-images.mjs"
  )

  $runtimeArgs = @(
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "scripts/verify-snaps-runtime.ps1",
    "-BaseUrl",
    $BaseUrl,
    "-Auth",
    $Auth
  )
  if ($ShowOrg) {
    $runtimeArgs += @("-ShowOrg", $ShowOrg)
  }
  if ($ConnectedIntegrationId) {
    $runtimeArgs += @("-ConnectedIntegrationId", $ConnectedIntegrationId)
    $runtimeArgs += @("-ConnectedPlatform", $ConnectedPlatform)
  }
  if ($ConnectedNaverCafeClubId) {
    $runtimeArgs += @("-ConnectedNaverCafeClubId", $ConnectedNaverCafeClubId)
  }
  if ($ConnectedNaverCafeMenuId) {
    $runtimeArgs += @("-ConnectedNaverCafeMenuId", $ConnectedNaverCafeMenuId)
  }
  if ($RuntimeSmokeId) {
    $runtimeArgs += @("-RuntimeSmokeId", $RuntimeSmokeId)
  }
  if ($FrontendUrl) {
    $runtimeArgs += @("-FrontendUrl", $FrontendUrl)
  }
  if ($IncludeMutating) {
    $runtimeArgs += "-IncludeMutating"
  }
  if ($IncludeConnectedSchedule) {
    $runtimeArgs += "-IncludeConnectedSchedule"
  }
  if ($IncludePixelleJob) {
    $runtimeArgs += "-IncludePixelleJob"
  }
  if ($IncludeInboxClear) {
    $runtimeArgs += "-IncludeInboxClear"
  }
  if ($IncludeOllama) {
    $runtimeArgs += "-RequireOllama"
  }

  $readinessFrontendUrl = if ($FrontendUrl) { $FrontendUrl } else { $BaseUrl }
  $readinessArgs = @(
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "scripts/verify-snaps-readiness.ps1",
    "-BaseUrl",
    $BaseUrl,
    "-FrontendUrl",
    $readinessFrontendUrl,
    "-Auth",
    $Auth,
    "-RequireRuntime",
    "-RequireNoWarnings"
  )
  if ($ShowOrg) {
    $readinessArgs += @("-ShowOrg", $ShowOrg)
  }
  Invoke-Step "snaps runtime readiness gate" "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" $readinessArgs

  Invoke-Step "snaps authenticated runtime smoke" "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" $runtimeArgs

  if ($IncludeNaverCafeLive) {
    $previousNaverSmokeId = $env:SNAPS_NAVER_CAFE_SMOKE_ID
    if ($RuntimeSmokeId -and -not $env:SNAPS_NAVER_CAFE_SMOKE_ID) {
      $env:SNAPS_NAVER_CAFE_SMOKE_ID = $RuntimeSmokeId
    }
    try {
      Invoke-Step "snaps Naver Cafe live provider smoke" "node_modules\.bin\ts-node.cmd" @(
        "--transpile-only",
        "-r",
        "tsconfig-paths/register",
        "--project",
        "tsconfig.base.json",
        "--compiler-options",
        '{\"module\":\"commonjs\"}',
        "scripts/verify-snaps-naver-cafe.ts"
      )
    } finally {
      $env:SNAPS_NAVER_CAFE_SMOKE_ID = $previousNaverSmokeId
    }
  }

  if ($IncludePixelleDirect) {
    $previousPixelleSmokeId = $env:SNAPS_PIXELLE_SMOKE_ID
    if ($RuntimeSmokeId -and -not $env:SNAPS_PIXELLE_SMOKE_ID) {
      $env:SNAPS_PIXELLE_SMOKE_ID = $RuntimeSmokeId
    }
    try {
      Invoke-Step "snaps Pixelle direct live smoke" "node_modules\.bin\ts-node.cmd" @(
        "--transpile-only",
        "-r",
        "tsconfig-paths/register",
        "--project",
        "tsconfig.base.json",
        "--compiler-options",
        '{\"module\":\"commonjs\"}',
        "scripts/verify-snaps-pixelle.ts"
      )
    } finally {
      $env:SNAPS_PIXELLE_SMOKE_ID = $previousPixelleSmokeId
    }
  }

  Write-Host "verify-snaps-final-ok"
} finally {
  Pop-Location
}
