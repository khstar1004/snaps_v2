param(
  [string]$BaseUrl = "",
  [string]$FrontendUrl = "",
  [string]$Auth = "",
  [string]$ShowOrg = "",
  [switch]$RequireRuntime,
  [switch]$RequireNoWarnings,
  [switch]$Json
)

$ErrorActionPreference = "Stop"

function New-ReadinessCheck {
  param(
    [string]$Name,
    [string]$Status,
    [string]$Detail = ""
  )

  [PSCustomObject]@{
    name = $Name
    status = $Status
    detail = $Detail
  }
}

function Add-ReadinessCheck {
  param(
    [System.Collections.ArrayList]$Checks,
    [string]$Name,
    [string]$Status,
    [string]$Detail = ""
  )

  [void]$Checks.Add((New-ReadinessCheck -Name $Name -Status $Status -Detail $Detail))
}

function Test-CommandOutput {
  param(
    [string]$Command,
    [string[]]$Arguments = @()
  )

  try {
    $output = & $Command @Arguments 2>&1
    return @{
      ok = $LASTEXITCODE -eq 0
      text = ($output | Out-String).Trim()
    }
  } catch {
    return @{
      ok = $false
      text = $_.Exception.Message
    }
  }
}

function Test-HttpJson {
  param(
    [string]$Method,
    [string]$Url,
    [hashtable]$Headers = @{}
  )

  try {
    $response = Invoke-RestMethod `
      -Method $Method `
      -Uri $Url `
      -Headers $Headers `
      -TimeoutSec 3 `
      -ErrorAction Stop
    return @{
      ok = $true
      status = "ok"
      response = $response
    }
  } catch {
    $statusCode = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $statusCode = [int]$_.Exception.Response.StatusCode
    }
    return @{
      ok = $false
      status = if ($statusCode) { "http-$statusCode" } else { "unreachable" }
      error = $_.Exception.Message
    }
  }
}

function Test-HttpText {
  param(
    [string]$Url,
    [hashtable]$Headers = @{},
    [int]$TimeoutSec = 30
  )

  try {
    $response = Invoke-WebRequest `
      -UseBasicParsing `
      -Method "GET" `
      -Uri $Url `
      -Headers $Headers `
      -TimeoutSec $TimeoutSec `
      -MaximumRedirection 0 `
      -ErrorAction Stop
    return @{
      ok = [int]$response.StatusCode -eq 200
      status = [int]$response.StatusCode
      text = [string]$response.Content
    }
  } catch {
    $statusCode = $null
    $location = $null
    if ($_.Exception.Response) {
      $statusCode = [int]$_.Exception.Response.StatusCode
      $location = $_.Exception.Response.Headers["Location"]
    }
    return @{
      ok = $false
      status = if ($statusCode) { $statusCode } else { "unreachable" }
      location = $location
      error = $_.Exception.Message
    }
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

function Get-SnapsDatabaseUrl {
  $fromEnv = [Environment]::GetEnvironmentVariable("DATABASE_URL")
  if ($fromEnv) {
    return $fromEnv
  }

  return Get-DotEnvValue -Path ".env" -Name "DATABASE_URL"
}

function Get-SnapsRedisUrl {
  $fromEnv = [Environment]::GetEnvironmentVariable("REDIS_URL")
  if ($fromEnv) {
    return $fromEnv
  }

  return Get-DotEnvValue -Path ".env" -Name "REDIS_URL"
}

function Get-SnapsTemporalAddress {
  $fromEnv = [Environment]::GetEnvironmentVariable("TEMPORAL_ADDRESS")
  if ($fromEnv) {
    return $fromEnv
  }

  return Get-DotEnvValue -Path ".env" -Name "TEMPORAL_ADDRESS"
}

function Get-SnapsBackendUrl {
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

function Get-SnapsFrontendUrl {
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

function Split-HostPort {
  param(
    [string]$Value,
    [int]$DefaultPort
  )

  $trimmed = if ($Value) { $Value.Trim() } else { "" }
  if (-not $trimmed) {
    throw "address is empty"
  }

  if ($trimmed -match "^([^:]+):(\d+)$") {
    return @{
      host = $Matches[1]
      port = [int]$Matches[2]
    }
  }

  return @{
    host = $trimmed
    port = $DefaultPort
  }
}

function Test-TcpEndpoint {
  param(
    [string]$HostName,
    [int]$Port,
    [int]$TimeoutMs = 3000
  )

  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $async = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
      return @{
        ok = $false
        error = "timeout after ${TimeoutMs}ms"
      }
    }
    $client.EndConnect($async)
    return @{
      ok = $true
      error = ""
    }
  } catch {
    return @{
      ok = $false
      error = $_.Exception.Message
    }
  } finally {
    $client.Close()
  }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Push-Location $repoRoot
try {
  $BaseUrl = Get-SnapsBackendUrl -ExplicitBaseUrl $BaseUrl
  $FrontendUrl = Get-SnapsFrontendUrl -ExplicitFrontendUrl $FrontendUrl
  $checks = [System.Collections.ArrayList]::new()

  $node = Test-CommandOutput -Command "node" -Arguments @("--version")
  if ($node.ok -and $node.text -match "^v22\.12\.") {
    Add-ReadinessCheck $checks "node-version" "ready" $node.text
  } elseif ($node.ok) {
    Add-ReadinessCheck $checks "node-version" "warn" "Expected Node 22.12.x, got $($node.text)"
  } else {
    Add-ReadinessCheck $checks "node-version" "blocked" $node.text
  }

  $pnpm = Test-CommandOutput -Command "pnpm.cmd" -Arguments @("--version")
  if ($pnpm.ok) {
    Add-ReadinessCheck $checks "pnpm" "ready" $pnpm.text
  } else {
    $localPnpm = Get-ChildItem -Path ".corepack\v1\pnpm" -Recurse -Filter "pnpm.cjs" -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match "\\bin\\pnpm\.cjs$" } |
      Select-Object -First 1
    if ($localPnpm) {
      Add-ReadinessCheck $checks "pnpm" "ready" "repository-local Corepack pnpm.cjs"
    } else {
      Add-ReadinessCheck $checks "pnpm" "blocked" "pnpm.cmd not found and repository-local Corepack pnpm.cjs missing"
    }
  }

  if (Test-Path "node_modules\.bin\prisma.cmd") {
    Add-ReadinessCheck $checks "prisma-cli" "ready" "node_modules\\.bin\\prisma.cmd"
  } else {
    Add-ReadinessCheck $checks "prisma-cli" "blocked" "Run dependency installation before final verification"
  }

  if (Test-Path ".env") {
    Add-ReadinessCheck $checks "env-file" "ready" ".env exists"
  } else {
    Add-ReadinessCheck $checks "env-file" "warn" ".env is missing; copy .env.example before runtime"
  }

  $databaseUrl = Get-SnapsDatabaseUrl
  if (-not $databaseUrl) {
    Add-ReadinessCheck $checks "database-url" "blocked" "DATABASE_URL is missing from environment and .env"
  } else {
    try {
      $databaseUri = [Uri]$databaseUrl
      $databasePort = if ($databaseUri.Port -gt 0) { $databaseUri.Port } else { 5432 }
      $databaseName = $databaseUri.AbsolutePath.TrimStart("/")
      if ($databaseUri.Scheme -notin @("postgresql", "postgres")) {
        Add-ReadinessCheck $checks "database-url" "blocked" "Unsupported database scheme: $($databaseUri.Scheme)"
      } elseif (-not $databaseUri.Host -or -not $databaseName) {
        Add-ReadinessCheck $checks "database-url" "blocked" "DATABASE_URL must include host and database name"
      } else {
        Add-ReadinessCheck $checks "database-url" "ready" "$($databaseUri.Scheme)://$($databaseUri.Host):$databasePort/$databaseName"
        $databaseTcp = Test-TcpEndpoint -HostName $databaseUri.Host -Port $databasePort
        if ($databaseTcp.ok) {
          Add-ReadinessCheck $checks "database-tcp" "ready" "$($databaseUri.Host):$databasePort"
        } else {
          Add-ReadinessCheck $checks "database-tcp" "blocked" "$($databaseUri.Host):$databasePort - $($databaseTcp.error)"
        }
      }
    } catch {
      Add-ReadinessCheck $checks "database-url" "blocked" "DATABASE_URL parse failed: $($_.Exception.Message)"
    }
  }

  $redisUrl = Get-SnapsRedisUrl
  if (-not $redisUrl) {
    Add-ReadinessCheck $checks "redis-url" "blocked" "REDIS_URL is missing from environment and .env"
  } else {
    try {
      $redisUri = [Uri]$redisUrl
      $redisPort = if ($redisUri.Port -gt 0) { $redisUri.Port } else { 6379 }
      if ($redisUri.Scheme -ne "redis") {
        Add-ReadinessCheck $checks "redis-url" "blocked" "Unsupported Redis scheme: $($redisUri.Scheme)"
      } elseif (-not $redisUri.Host) {
        Add-ReadinessCheck $checks "redis-url" "blocked" "REDIS_URL must include host"
      } else {
        Add-ReadinessCheck $checks "redis-url" "ready" "$($redisUri.Scheme)://$($redisUri.Host):$redisPort"
        $redisTcp = Test-TcpEndpoint -HostName $redisUri.Host -Port $redisPort
        if ($redisTcp.ok) {
          Add-ReadinessCheck $checks "redis-tcp" "ready" "$($redisUri.Host):$redisPort"
        } else {
          Add-ReadinessCheck $checks "redis-tcp" "blocked" "$($redisUri.Host):$redisPort - $($redisTcp.error)"
        }
      }
    } catch {
      Add-ReadinessCheck $checks "redis-url" "blocked" "REDIS_URL parse failed: $($_.Exception.Message)"
    }
  }

  $temporalAddress = Get-SnapsTemporalAddress
  if (-not $temporalAddress) {
    Add-ReadinessCheck $checks "temporal-address" "blocked" "TEMPORAL_ADDRESS is missing from environment and .env"
  } else {
    try {
      $temporalEndpoint = Split-HostPort -Value $temporalAddress -DefaultPort 7233
      Add-ReadinessCheck $checks "temporal-address" "ready" "$($temporalEndpoint.host):$($temporalEndpoint.port)"
      $temporalTcp = Test-TcpEndpoint -HostName $temporalEndpoint.host -Port $temporalEndpoint.port
      if ($temporalTcp.ok) {
        Add-ReadinessCheck $checks "temporal-tcp" "ready" "$($temporalEndpoint.host):$($temporalEndpoint.port)"
      } else {
        Add-ReadinessCheck $checks "temporal-tcp" "blocked" "$($temporalEndpoint.host):$($temporalEndpoint.port) - $($temporalTcp.error)"
      }
    } catch {
      Add-ReadinessCheck $checks "temporal-address" "blocked" "TEMPORAL_ADDRESS parse failed: $($_.Exception.Message)"
    }
  }

  $ollama = Test-HttpJson -Method "GET" -Url "http://localhost:11434/api/tags"
  if ($ollama.ok) {
    $modelNames = @()
    if ($ollama.response.models) {
      $modelNames = @($ollama.response.models | ForEach-Object { if ($_.name) { $_.name } elseif ($_.model) { $_.model } })
    }
    $hasChat = $modelNames -contains "qwen3.5:9b"
    $hasEmbed = $modelNames -contains "nomic-embed-text:latest"
    if ($hasChat -and $hasEmbed) {
      Add-ReadinessCheck $checks "ollama-models" "ready" "qwen3.5:9b,nomic-embed-text:latest"
    } else {
      Add-ReadinessCheck $checks "ollama-models" "blocked" "Missing configured models. Found: $($modelNames -join ',')"
    }
  } else {
    Add-ReadinessCheck $checks "ollama-models" "blocked" $ollama.error
  }

  $headers = @{
    Accept = "application/json"
  }
  if ($Auth) {
    $headers.auth = $Auth
  }
  if ($ShowOrg) {
    $headers.showorg = $ShowOrg
  }

  $health = Test-HttpJson -Method "GET" -Url "$BaseUrl/snaps/health" -Headers $headers
  if ($health.ok -and $health.response.product -eq "snaps") {
    Add-ReadinessCheck $checks "backend-snaps-health" "ready" "$BaseUrl/snaps/health"
  } elseif ($health.ok) {
    Add-ReadinessCheck $checks "backend-snaps-health" "blocked" "Unexpected product: $($health.response.product)"
  } else {
    Add-ReadinessCheck $checks "backend-snaps-health" "blocked" "$($health.status): $($health.error)"
  }

  $apiHealth = Test-HttpJson -Method "POST" -Url "$BaseUrl/api/snaps/health" -Headers $headers
  if ($apiHealth.ok -and $apiHealth.response.product -eq "snaps") {
    Add-ReadinessCheck $checks "backend-api-snaps-health" "ready" "$BaseUrl/api/snaps/health"
  } elseif ($apiHealth.ok) {
    Add-ReadinessCheck $checks "backend-api-snaps-health" "blocked" "Unexpected product: $($apiHealth.response.product)"
  } else {
    Add-ReadinessCheck $checks "backend-api-snaps-health" "blocked" "$($apiHealth.status): $($apiHealth.error)"
  }

  $frontendHeaders = @{
    Accept = "text/html"
  }
  if ($Auth) {
    $frontendHeaders.auth = $Auth
  }
  if ($ShowOrg) {
    $frontendHeaders.showorg = $ShowOrg
  }
  $frontend = Test-HttpText -Url "$FrontendUrl/snaps" -Headers $frontendHeaders
  if ($frontend.ok -and $frontend.text -match "snaps 스튜디오") {
    Add-ReadinessCheck $checks "frontend-snaps-route" "ready" "$FrontendUrl/snaps"
  } elseif ($frontend.ok) {
    Add-ReadinessCheck $checks "frontend-snaps-route" "blocked" "Returned 200 but snaps 스튜디오 markup was not found"
  } else {
    $locationText = if ($frontend.location) { " location=$($frontend.location)" } else { "" }
    Add-ReadinessCheck $checks "frontend-snaps-route" "blocked" "$($frontend.status): $($frontend.error)$locationText"
  }

  $blocked = @($checks | Where-Object { $_.status -eq "blocked" })
  $warnings = @($checks | Where-Object { $_.status -eq "warn" })
  $ready = @($checks | Where-Object { $_.status -eq "ready" })
  $summary = [PSCustomObject]@{
    product = "snaps"
    baseUrl = $BaseUrl
    frontendUrl = $FrontendUrl
    ready = $ready.Count
    warn = $warnings.Count
    blocked = $blocked.Count
    checks = @($checks)
  }

  if ($Json) {
    $summary | ConvertTo-Json -Depth 8
  } else {
    Write-Host "snaps readiness:"
    foreach ($check in $checks) {
      $detail = if ($check.detail) { " - $($check.detail)" } else { "" }
      Write-Host "[$($check.status)] $($check.name)$detail"
    }
    Write-Host "verify-snaps-readiness-summary ready=$($ready.Count) warn=$($warnings.Count) blocked=$($blocked.Count)"
  }

  if ($RequireRuntime -and $blocked.Count -gt 0) {
    throw "snaps runtime readiness failed with blocked checks: $($blocked.name -join ', ')"
  }
  if ($RequireNoWarnings -and $warnings.Count -gt 0) {
    throw "snaps runtime readiness failed with warning checks: $($warnings.name -join ', ')"
  }

  if (-not $Json) {
    Write-Host "verify-snaps-readiness-ok"
  }
} finally {
  Pop-Location
}
