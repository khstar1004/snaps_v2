param(
  [string]$BaseUrl = "",
  [string]$FrontendUrl = ""
)

$ErrorActionPreference = "Stop"

function Get-ComposeImages {
  param([string]$ComposePath)

  if (-not (Test-Path $ComposePath)) {
    return @()
  }

  $matches = Select-String -Path $ComposePath -Pattern '^\s*image:\s*([^\s#]+)'
  return @(
    $matches |
      ForEach-Object { $_.Matches[0].Groups[1].Value.Trim("'`"") } |
      Sort-Object -Unique
  )
}

function Write-DockerImageReadiness {
  $composePath = "docker-compose.dev.yaml"
  $requiredImages = @(Get-ComposeImages $composePath)
  if (-not $requiredImages.Length) {
    return
  }

  Write-Host ""
  Write-Host "== Docker dev image readiness"

  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "docker not found; npm run dev:docker cannot start until Docker is installed."
    return
  }

  $previousErrorPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $dockerImageOutput = @(& docker image ls --format "{{.Repository}}:{{.Tag}}" 2>&1)
    $dockerImageExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorPreference
  }
  if ($dockerImageExitCode -ne 0) {
    Write-Host "docker image list is unavailable; npm run dev:docker may still need image pulls."
    return
  }
  $localImages = @($dockerImageOutput | ForEach-Object { "$_".Trim() } | Where-Object { $_ })

  $missingImages = @($requiredImages | Where-Object { $localImages -notcontains $_ })
  if ($missingImages.Length) {
    Write-Host "Local Docker cache is missing $($missingImages.Length) image(s) from ${composePath}:"
    foreach ($image in $missingImages) {
      Write-Host "   - $image"
    }
    Write-Host "npm run dev:docker may pull these images before Postgres, Redis, and Temporal are ready."
  } else {
    Write-Host "All $($requiredImages.Length) dev dependency images are already available locally."
  }
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

  return "http://localhost:4200"
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Push-Location $repoRoot
try {
  $BaseUrl = Resolve-SnapsBaseUrl -ExplicitBaseUrl $BaseUrl
  $FrontendUrl = Resolve-SnapsFrontendUrl -ExplicitFrontendUrl $FrontendUrl

  Write-Host "snaps runtime handoff"
  Write-Host "BaseUrl: $BaseUrl"
  Write-Host "FrontendUrl: $FrontendUrl"
  Write-Host ""

  Write-Host "== Current readiness report"
  & "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -ExecutionPolicy Bypass `
    -File "scripts/verify-snaps-readiness.ps1" `
    -BaseUrl $BaseUrl `
    -FrontendUrl $FrontendUrl
  if ($LASTEXITCODE -ne 0) {
    throw "readiness report failed with exit code $LASTEXITCODE"
  }

  Write-DockerImageReadiness

  Write-Host ""
  Write-Host "== Next commands after install is allowed"
  Write-Host "1. Use Node 22.12.x:"
  Write-Host "   volta install node@22.12.0"
  Write-Host "   # or: nvm install 22.12.0; nvm use 22.12.0"
  Write-Host "2. Prepare env and dependencies:"
  Write-Host "   if (-not (Test-Path .env)) { Copy-Item .env.example .env }"
  Write-Host "   pnpm install"
  Write-Host "   npm run prisma-generate"
  Write-Host "3. Start runtime infrastructure and app:"
  Write-Host "   npm run dev:docker"
  Write-Host "   npm run dev"
  Write-Host "4. Check strict readiness:"
  Write-Host "   npm run verify:snaps:readiness:strict"
  Write-Host "5. Optional demo seed check:"
  Write-Host "   npm run verify:snaps:demo"
  Write-Host "   # In snaps 스튜디오, press Demo in Workspace Import, then Import."
  Write-Host "6. After logging in, run the final gate with a browser auth cookie:"
  Write-Host "   `$env:SNAPS_OLLAMA_RAG_CONFIRM = `"embed`""
  Write-Host "   `$env:SNAPS_RUNTIME_CONFIRM = `"smoke`""
  Write-Host "   npm run verify:snaps:final -- -BaseUrl $BaseUrl -Auth `"<auth-cookie>`" -ShowOrg `"<organizationId>`" -IncludeOllama -FrontendUrl $FrontendUrl"
  Write-Host ""
  Write-Host "Optional live/destructive flags require disposable targets and explicit confirmation envs:"
  Write-Host "   authenticated runtime smoke with SNAPS_RUNTIME_CONFIRM=smoke"
  Write-Host "   -IncludeOllama with SNAPS_OLLAMA_RAG_CONFIRM=embed"
  Write-Host "   -ApplyDbPush with SNAPS_DB_PUSH_CONFIRM=push"
  Write-Host "   -IncludeMutating with SNAPS_MUTATING_CONFIRM=mutate"
  Write-Host "   -ConnectedIntegrationId with SNAPS_CONNECTED_DRAFT_CONFIRM=draft"
  Write-Host "   -IncludeConnectedSchedule with -ConnectedIntegrationId and SNAPS_CONNECTED_SCHEDULE_CONFIRM=schedule"
  Write-Host "   -IncludeNaverCafeLive with SNAPS_NAVER_CAFE_CONFIRM=post"
  Write-Host "   -IncludePixelleDirect or -IncludePixelleJob with SNAPS_PIXELLE_CONFIRM=generate"
  Write-Host "   -IncludeInboxClear with SNAPS_INBOX_CLEAR_CONFIRM=clear"
  Write-Host "verify-snaps-runtime-handoff-ok"
} finally {
  Pop-Location
}
