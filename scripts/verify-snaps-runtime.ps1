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
  [switch]$RequireOllama,
  [switch]$IncludeConnectedSchedule,
  [switch]$IncludeSandboxChannel,
  [switch]$IncludePixelleJob,
  [switch]$IncludeInboxClear,
  [switch]$IncludeMutating
)

$ErrorActionPreference = "Stop"
if (-not $RuntimeSmokeId) {
  $RuntimeSmokeId = "snaps-smoke-$((Get-Date).ToString('yyyyMMddHHmmss'))"
}
if ($Auth -and $env:SNAPS_RUNTIME_CONFIRM -ne "smoke") {
  throw "Authenticated runtime smoke requires SNAPS_RUNTIME_CONFIRM=smoke because it records snaps activity entries."
}
if ($IncludeMutating -and $env:SNAPS_MUTATING_CONFIRM -ne "mutate") {
  throw "Mutating runtime smoke requires SNAPS_MUTATING_CONFIRM=mutate because it creates and deletes snaps workspace records."
}
if ($ConnectedIntegrationId -and $env:SNAPS_CONNECTED_DRAFT_CONFIRM -ne "draft") {
  throw "Connected draft smoke requires SNAPS_CONNECTED_DRAFT_CONFIRM=draft because it creates a real connected draft."
}
if ($RequireOllama -and $env:SNAPS_OLLAMA_RAG_CONFIRM -ne "embed") {
  throw "Ollama RAG embedding smoke requires SNAPS_OLLAMA_RAG_CONFIRM=embed because it creates and deletes a temporary RAG example."
}
if ($IncludeConnectedSchedule -and -not $ConnectedIntegrationId) {
  throw "-IncludeConnectedSchedule requires -ConnectedIntegrationId because it creates a real scheduled post."
}
if ($IncludeConnectedSchedule -and $env:SNAPS_CONNECTED_SCHEDULE_CONFIRM -ne "schedule") {
  throw "Connected schedule smoke requires SNAPS_CONNECTED_SCHEDULE_CONFIRM=schedule because it creates a real scheduled post."
}
if ($IncludeSandboxChannel -and $env:SNAPS_SANDBOX_CHANNEL_CONFIRM -ne "sandbox") {
  throw "Sandbox connected-channel smoke requires SNAPS_SANDBOX_CHANNEL_CONFIRM=sandbox because it creates local sandbox drafts, schedules, comments, and reports."
}
if ($IncludeSandboxChannel -and (-not $Auth -or -not $ShowOrg)) {
  throw "-IncludeSandboxChannel requires -Auth and -ShowOrg so the local sandbox integration can be seeded and cleaned up for one organization."
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

function Invoke-SnapsRequest {
  param(
    [string]$Method,
    [string]$Path,
    [object]$Body = $null
  )

  $headers = @{
    Accept = "application/json"
  }
  if ($Auth) {
    $headers.auth = $Auth
  }
  if ($ShowOrg) {
    $headers.showorg = $ShowOrg
  }

  $params = @{
    Method = $Method
    Uri = "$BaseUrl$Path"
    Headers = $headers
  }
  if ($null -ne $Body) {
    $params.ContentType = "application/json"
    $params.Body = ($Body | ConvertTo-Json -Depth 20)
  }

  Invoke-RestMethod @params
}

function Invoke-SnapsRequestExpectStatus {
  param(
    [string]$Method,
    [string]$Path,
    [int]$StatusCode,
    [object]$Body = $null
  )

  try {
    $null = Invoke-SnapsRequest -Method $Method -Path $Path -Body $Body
  } catch {
    $actualStatus = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $actualStatus = [int]$_.Exception.Response.StatusCode
    }
    if ($actualStatus -ne $StatusCode) {
      throw "Expected $Method $Path to return $StatusCode but got $actualStatus. $($_.Exception.Message)"
    }
    return
  }

  throw "Expected $Method $Path to return $StatusCode but it succeeded."
}

function Convert-ToArray {
  param([object]$Value)

  if ($null -eq $Value) {
    return ,@()
  }
  if ($Value -is [System.Array]) {
    return ,$Value
  }
  return ,@($Value)
}

function Convert-ToQueryValue {
  param([string]$Value)

  return [System.Uri]::EscapeDataString($Value)
}

function Invoke-CleanupDelete {
  param(
    [string]$Label,
    [string]$Path
  )

  if (-not $Path) {
    return $null
  }

  try {
    $deleted = Invoke-SnapsRequest -Method "DELETE" -Path $Path
    if ($null -ne $deleted.deleted -and -not $deleted.deleted) {
      return "$Label was not deleted."
    }
  } catch {
    return "$Label cleanup failed: $($_.Exception.Message)"
  }

  return $null
}

function Invoke-SandboxChannelTool {
  param([string[]]$Arguments)

  $output = & node "scripts/snaps-sandbox-channel.mjs" @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  $text = ($output | Out-String).Trim()
  if ($exitCode -ne 0) {
    throw "snaps sandbox channel tool failed: $text"
  }
  if (-not $text) {
    throw "snaps sandbox channel tool returned no JSON output."
  }

  return $text | ConvertFrom-Json
}

function Test-SnapsFrontendRoute {
  $routeBaseUrl = if ($FrontendUrl) { $FrontendUrl } else { $BaseUrl }
  if (-not $Auth) {
    Write-Host "frontend route smoke skipped: no auth token supplied"
    return
  }

  $headers = @{
    Accept = "text/html"
    auth = $Auth
  }
  if ($ShowOrg) {
    $headers.showorg = $ShowOrg
  }

  try {
    $response = Invoke-WebRequest `
      -UseBasicParsing `
      -Method "GET" `
      -Uri "$routeBaseUrl/snaps" `
      -Headers $headers `
      -MaximumRedirection 0 `
      -ErrorAction Stop
  } catch {
    $status = $null
    $location = $null
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
      $location = $_.Exception.Response.Headers["Location"]
    }
    throw "/snaps frontend route failed before markup validation. frontendUrl=$routeBaseUrl status=$status location=$location. Check that the frontend server is running and -Auth is a valid logged-in cookie. $($_.Exception.Message)"
  }

  if ([int]$response.StatusCode -ne 200) {
    $location = $response.Headers["Location"]
    throw "Expected /snaps frontend route at $routeBaseUrl to return 200 but got $($response.StatusCode). location=$location"
  }
  if ($response.Content -notmatch "snaps 스튜디오") {
    $snippet = ($response.Content -replace "\s+", " ")
    if ($snippet.Length -gt 180) {
      $snippet = $snippet.Substring(0, 180)
    }
    throw "/snaps frontend route did not render snaps 스튜디오 markup. snippet=$snippet"
  }
  Write-Host "frontend route ok: /snaps"
}

function Assert-SnapsOllamaReady {
  param(
    [object]$Health,
    [string]$Label
  )

  if (-not $Health.ollama) {
    throw "$Label did not include Ollama health details."
  }

  $missingModels = Convert-ToArray $Health.ollama.missingModels
  if (
    -not $Health.ollama.ok -or
    -not $Health.ollama.chatModelAvailable -or
    -not $Health.ollama.embedModelAvailable -or
    $missingModels.Count -gt 0
  ) {
    $missingText = if ($missingModels.Count -gt 0) { $missingModels -join ", " } else { "unknown" }
    throw "$Label Ollama models are not ready. chatModel=$($Health.ollama.chatModel) chatReady=$($Health.ollama.chatModelAvailable) embedModel=$($Health.ollama.embedModel) embedReady=$($Health.ollama.embedModelAvailable) missing=$missingText error=$($Health.ollama.error)"
  }
}

function New-ConnectedVariantSettings {
  param([string]$Platform)

  $settings = @{
    "__type" = $Platform
  }
  if ($Platform -eq "instagram") {
    $settings.post_type = "post"
  }
  if ($Platform -eq "youtube") {
    $settings.type = "post"
  }
  if ($Platform -eq "tiktok") {
    $settings.privacy_level = "PUBLIC_TO_EVERYONE"
  }
  if ($Platform -eq "naver-cafe") {
    if (-not $ConnectedNaverCafeClubId -or -not $ConnectedNaverCafeMenuId) {
      throw "Connected Naver Cafe verification requires -ConnectedNaverCafeClubId and -ConnectedNaverCafeMenuId."
    }
    $settings.clubId = $ConnectedNaverCafeClubId
    $settings.menuId = $ConnectedNaverCafeMenuId
    $settings.subject = "snaps runtime connected channel smoke $RuntimeSmokeId"
  }

  return $settings
}

function Invoke-ConnectedChannelSmoke {
  if (-not $ConnectedIntegrationId) {
    Write-Host "connected-channel smoke skipped: no -ConnectedIntegrationId supplied"
    return
  }

  $settings = New-ConnectedVariantSettings -Platform $ConnectedPlatform
  $variant = @{
    platform = $ConnectedPlatform
    content = "snaps runtime connected-channel draft smoke [$RuntimeSmokeId]"
    hashtags = @("#snaps")
    settings = $settings
    publishMode = "schedule"
  }
  $integrations = @(
    @{
      platform = $ConnectedPlatform
      integrationId = $ConnectedIntegrationId
    }
  )

  $draft = Invoke-SnapsRequest -Method "POST" -Path "/snaps/schedule-variants" -Body @{
    variants = @($variant)
    integrations = $integrations
    scheduleType = "draft"
  }
  if (-not $draft.scheduled -or $draft.scheduled.Count -lt 1) {
    throw "Connected-channel draft smoke did not create a connected draft."
  }
  Write-Host "connected-channel draft ok: platform=$ConnectedPlatform scheduled=$($draft.scheduled.Count)"

  if (-not $IncludeConnectedSchedule) {
    Write-Host "connected-channel schedule smoke skipped: pass -IncludeConnectedSchedule to create a real scheduled post"
    return
  }

  $scheduled = Invoke-SnapsRequest -Method "POST" -Path "/snaps/schedule-variants" -Body @{
    variants = @($variant)
    integrations = $integrations
    scheduleType = "schedule"
    operatorConfirmed = $true
    publishDate = (Get-Date).AddHours(2).ToString("o")
  }
  if (-not $scheduled.scheduled -or $scheduled.scheduled.Count -lt 1) {
    throw "Connected-channel schedule smoke did not create a connected scheduled post."
  }
  Write-Host "connected-channel schedule ok: platform=$ConnectedPlatform scheduled=$($scheduled.scheduled.Count)"
}

function Invoke-SandboxConnectedChannelSmoke {
  if (-not $IncludeSandboxChannel) {
    return
  }

  $sandboxIntegration = $null
  $sandboxReportId = $null
  $sandboxInboxItemIds = @()
  $sandboxCompleted = $false

  try {
    $sandboxIntegration = Invoke-SandboxChannelTool @(
      "seed",
      "--org",
      $ShowOrg,
      "--smoke-id",
      $RuntimeSmokeId
    )
    $sandboxIntegrationId = $sandboxIntegration.integrationId
    if (-not $sandboxIntegrationId -or $sandboxIntegration.providerIdentifier -ne "snapssandbox") {
      throw "Sandbox integration seed did not return a snapssandbox integration."
    }

    $variant = @{
      platform = "instagram"
      label = "Instagram"
      content = "snaps sandbox connected-channel draft smoke [$RuntimeSmokeId]"
      hashtags = @("#snaps")
      settings = @{
        "__type" = "instagram"
        post_type = "post"
      }
      publishMode = "schedule"
    }
    $integrations = @(
      @{
        platform = "instagram"
        integrationId = $sandboxIntegrationId
      }
    )

    $draft = Invoke-SnapsRequest -Method "POST" -Path "/snaps/schedule-variants" -Body @{
      variants = @($variant)
      integrations = $integrations
      scheduleType = "draft"
    }
    $draftScheduled = Convert-ToArray $draft.scheduled
    if ($draftScheduled.Count -lt 1) {
      throw "Sandbox connected-channel draft smoke did not create a draft."
    }
    Write-Host "sandbox connected-channel draft ok: scheduled=$($draftScheduled.Count)"

    $scheduled = Invoke-SnapsRequest -Method "POST" -Path "/snaps/schedule-variants" -Body @{
      variants = @($variant)
      integrations = $integrations
      scheduleType = "schedule"
      operatorConfirmed = $true
      publishDate = (Get-Date).AddHours(2).ToString("o")
    }
    $scheduledPosts = Convert-ToArray $scheduled.scheduled
    if ($scheduledPosts.Count -lt 1 -or -not $scheduledPosts[0].postId) {
      throw "Sandbox connected-channel schedule smoke did not create a scheduled post."
    }
    $sandboxPostId = $scheduledPosts[0].postId
    $sandboxReleaseId = "snaps-sandbox-release-$RuntimeSmokeId"
    $markPost = Invoke-SandboxChannelTool @(
      "mark-post",
      "--org",
      $ShowOrg,
      "--post-id",
      $sandboxPostId,
      "--release-id",
      $sandboxReleaseId
    )
    if ($markPost.releaseId -ne $sandboxReleaseId) {
      throw "Sandbox post release id was not marked for post analytics."
    }
    Write-Host "sandbox connected-channel schedule ok: scheduled=$($scheduledPosts.Count)"

    $analyticsReport = Invoke-SnapsRequest -Method "POST" -Path "/snaps/report/from-platform-analytics" -Body @{
      title = "runtime sandbox analytics report $RuntimeSmokeId"
      date = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      integrationIds = @($sandboxIntegrationId)
      postIds = @($sandboxPostId)
    }
    $sandboxReportId = $analyticsReport.reportId
    if (
      -not $sandboxReportId -or
      -not $analyticsReport.insights -or
      -not $analyticsReport.actionItems -or
      ((Convert-ToArray $analyticsReport.warnings).Count -gt 0)
    ) {
      throw "Sandbox provider analytics report did not return a clean report."
    }
    Write-Host "sandbox provider analytics ok: report=$sandboxReportId"

    $capabilities = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/inbox/reply-capabilities")
    $sandboxCapability = $capabilities | Where-Object { $_.id -eq $sandboxIntegrationId } | Select-Object -First 1
    if (-not $sandboxCapability -or -not $sandboxCapability.commentable) {
      throw "Sandbox reply capability was not exposed as commentable."
    }

    $reply = Invoke-SnapsRequest -Method "POST" -Path "/snaps/inbox/publish-reply" -Body @{
      integrationId = $sandboxIntegrationId
      platformPostId = $sandboxReleaseId
      lastCommentId = "snaps-sandbox-last-comment-$RuntimeSmokeId"
      reply = "snaps sandbox connected reply smoke [$RuntimeSmokeId]"
      settings = @{}
    }
    $replyResult = Convert-ToArray $reply.result
    if ($reply.provider -ne "snapssandbox" -or $replyResult.Count -lt 1 -or -not $replyResult[0].releaseURL) {
      throw "Sandbox provider reply publish did not return a provider result."
    }
    Write-Host "sandbox provider reply ok: provider=$($reply.provider)"

    $replyDraft = Invoke-SnapsRequest -Method "POST" -Path "/snaps/inbox/reply-draft" -Body @{
      postId = $sandboxPostId
      reply = "snaps sandbox stored comment smoke [$RuntimeSmokeId]"
    }
    if (-not $replyDraft.id) {
      throw "Sandbox reply draft did not create a stored comment."
    }

    $commentImport = Invoke-SnapsRequest -Method "POST" -Path "/snaps/inbox/import-post-comments" -Body @{
      sources = @(
        @{
          postId = $sandboxPostId
          platform = "instagram"
          sourceUrl = "https://snaps.local/sandbox/posts/$sandboxReleaseId"
        }
      )
      defaultPlatform = "instagram"
    }
    $sandboxInboxItemIds = Convert-ToArray $commentImport.items | ForEach-Object { $_.id } | Where-Object { $_ }
    if ($commentImport.sourcePosts -ne 1 -or $commentImport.imported -lt 1) {
      throw "Sandbox connected-comment import did not import the stored post comment."
    }
    Write-Host "sandbox connected-comment import ok: imported=$($commentImport.imported)"

    $sandboxCompleted = $true
  } finally {
    $cleanupErrors = @()

    foreach ($itemId in $sandboxInboxItemIds) {
      $cleanupError = Invoke-CleanupDelete -Label "sandbox inbox item" -Path "/snaps/inbox/items/$itemId"
      if ($cleanupError) {
        $cleanupErrors += $cleanupError
      }
    }

    $cleanupError = Invoke-CleanupDelete -Label "sandbox analytics report" -Path $(if ($sandboxReportId) { "/snaps/report/$sandboxReportId" } else { $null })
    if ($cleanupError) {
      $cleanupErrors += $cleanupError
    }

    try {
      $cleanupResult = Invoke-SandboxChannelTool @(
        "cleanup",
        "--org",
        $ShowOrg,
        "--smoke-id",
        $RuntimeSmokeId,
        "--integration-id",
        $(if ($sandboxIntegration) { $sandboxIntegration.integrationId } else { "" })
      )
      Write-Host "sandbox channel cleanup ok: posts=$($cleanupResult.posts) comments=$($cleanupResult.comments) integrations=$($cleanupResult.integrations)"
    } catch {
      $cleanupErrors += "sandbox channel cleanup failed: $($_.Exception.Message)"
    }

    if ($cleanupErrors.Count -gt 0) {
      $cleanupErrors | ForEach-Object { Write-Host "cleanup warning: $_" }
      if ($sandboxCompleted) {
        throw "Sandbox connected-channel cleanup failed."
      }
    }
  }
}

function Invoke-PixelleJobSmoke {
  if (-not $IncludePixelleJob) {
    return
  }
  if (-not $health.pixelle.configured) {
    throw "Pixelle job smoke requires PIXELLE_VIDEO_URL to be configured."
  }
  if ($env:SNAPS_PIXELLE_CONFIRM -ne "generate") {
    throw "Pixelle job smoke requires SNAPS_PIXELLE_CONFIRM=generate because it submits a real Pixelle job."
  }

  $pixelleJob = Invoke-SnapsRequest -Method "POST" -Path "/api/snaps/video/generate-short" -Body @{
    sourceText = "snaps Pixelle runtime job smoke [$RuntimeSmokeId]"
    durationSeconds = 30
    platform = "tiktok"
  }
  if ($pixelleJob.status -eq "script-ready") {
    throw "Pixelle job smoke returned script-ready even though PIXELLE_VIDEO_URL is configured."
  }
  $jobId = if ($pixelleJob.jobId) { $pixelleJob.jobId } else { $pixelleJob.id }
  if (-not $jobId) {
    throw "Pixelle job smoke did not return jobId or id."
  }
  Write-Host "pixelle job ok: job=$jobId status=$($pixelleJob.status)"

  $pixelleStatus = Invoke-SnapsRequest -Method "GET" -Path "/api/snaps/video/status/$jobId"
  if ($null -eq $pixelleStatus.status) {
    throw "Pixelle status smoke did not return a status field."
  }
  Write-Host "pixelle status ok: job=$jobId status=$($pixelleStatus.status)"
}

function Invoke-AgentTaskSmoke {
  $agentCommand = "내일 오전 10시에 snaps runtime smoke $RuntimeSmokeId 원문을 인스타, 스레드, 링크드인에 올릴 수 있게 준비하고 쇼츠 대본도 만들어줘."
  $prepared = Invoke-SnapsRequest -Method "POST" -Path "/snaps/agent/prepare" -Body @{
    command = $agentCommand
    useRag = $false
    now = "2026-05-12T00:00:00.000Z"
    timezoneOffsetMinutes = -540
  }
  if (-not $prepared.task -or -not $prepared.task.id) {
    throw "Agent prepare did not return a persisted task."
  }
  if (-not $prepared.plan.competitorPlaybook -or -not $prepared.plan.goToMarketPlan -or -not $prepared.plan.scenarioRun) {
    throw "Agent prepare did not return competitor playbook, go-to-market plan, and scenario run."
  }
  $taskId = $prepared.task.id
  $taskSearch = Convert-ToQueryValue $RuntimeSmokeId
  $taskList = Invoke-SnapsRequest -Method "GET" -Path "/snaps/agent/tasks?keyword=$taskSearch&pageSize=5"
  if (-not $taskList.list -or $taskList.list.Count -lt 1) {
    throw "Agent task list did not include the prepared task."
  }
  $taskDetail = Invoke-SnapsRequest -Method "GET" -Path "/snaps/agent/tasks/$taskId"
  if (-not $taskDetail.result -or $taskDetail.result.plan.command -notmatch $RuntimeSmokeId) {
    throw "Agent task detail did not include the prepared result."
  }
  $favorited = Invoke-SnapsRequest -Method "POST" -Path "/snaps/agent/tasks/$taskId/favorite" -Body @{}
  if (-not $favorited.favorite) {
    throw "Agent task favorite route did not set favorite=true."
  }
  $unfavorited = Invoke-SnapsRequest -Method "DELETE" -Path "/snaps/agent/tasks/$taskId/favorite"
  if ($unfavorited.favorite) {
    throw "Agent task unfavorite route did not set favorite=false."
  }
  $rated = Invoke-SnapsRequest -Method "POST" -Path "/snaps/agent/tasks/$taskId/rating" -Body @{
    rating = 5
    comment = "runtime smoke"
  }
  if ($rated.rating -ne 5) {
    throw "Agent task rating route did not store the rating."
  }
  $deleted = Invoke-SnapsRequest -Method "DELETE" -Path "/snaps/agent/tasks/$taskId"
  if (-not $deleted.deleted) {
    throw "Agent task delete route did not delete the task."
  }
  Write-Host "agent task ok: taskId=$taskId"
}

function Invoke-InboxClearSmoke {
  if (-not $IncludeInboxClear) {
    return
  }
  if ($env:SNAPS_INBOX_CLEAR_CONFIRM -ne "clear") {
    throw "Inbox clear smoke requires SNAPS_INBOX_CLEAR_CONFIRM=clear because it deletes every snaps inbox item in the current organization."
  }

  $import = Invoke-SnapsRequest -Method "POST" -Path "/snaps/inbox/import" -Body @{
    items = @(
      @{
        platform = "threads"
        author = "inbox-clear-smoke"
        content = "snaps inbox clear smoke [$RuntimeSmokeId]"
      }
    )
  }
  if ($import.imported -lt 1) {
    throw "Inbox clear smoke could not import a disposable feedback item before clearing."
  }

  $cleared = Invoke-SnapsRequest -Method "DELETE" -Path "/snaps/inbox/items"
  if ($cleared.deleted -lt 1 -or $cleared.total -ne 0) {
    throw "Inbox clear smoke did not report deleted items and total=0."
  }

  $afterClear = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/inbox/items")
  if ($afterClear.Count -ne 0) {
    throw "Inbox clear smoke left feedback items after clear."
  }
  Write-Host "inbox clear ok: deleted=$($cleared.deleted)"
}

$BaseUrl = Resolve-SnapsBaseUrl -ExplicitBaseUrl $BaseUrl
$FrontendUrl = Resolve-SnapsFrontendUrl -ExplicitFrontendUrl $FrontendUrl

Write-Host "snaps runtime smoke: $BaseUrl"
Write-Host "snaps runtime smoke id: $RuntimeSmokeId"
if ($FrontendUrl) {
  Write-Host "snaps frontend smoke: $FrontendUrl"
}
if (-not $Auth) {
  Write-Host "No -Auth token supplied. Protected snaps endpoints may return 403."
}

$health = Invoke-SnapsRequest -Method "GET" -Path "/snaps/health"
if ($health.product -ne "snaps") {
  throw "Unexpected health product: $($health.product)"
}
if ($RequireOllama) {
  Assert-SnapsOllamaReady -Health $health -Label "/snaps/health"
}
Write-Host "health ok: ollama=$($health.ollama.ok), rag=$($health.rag.enabled), pixelle=$($health.pixelle.configured)"

$apiHealth = Invoke-SnapsRequest -Method "POST" -Path "/api/snaps/health"
if ($apiHealth.product -ne "snaps") {
  throw "Unexpected /api/snaps health product: $($apiHealth.product)"
}
if ($RequireOllama) {
  Assert-SnapsOllamaReady -Health $apiHealth -Label "/api/snaps/health"
}
Write-Host "api health alias ok"

Test-SnapsFrontendRoute
Invoke-AgentTaskSmoke

Invoke-SnapsRequestExpectStatus -Method "POST" -Path "/snaps/transform" -StatusCode 400 -Body @{}
Invoke-SnapsRequestExpectStatus -Method "POST" -Path "/api/snaps/transform-and-schedule" -StatusCode 400 -Body @{}
Write-Host "transform missing sourceText validation ok"

$transform = Invoke-SnapsRequest -Method "POST" -Path "/snaps/transform" -Body @{
  sourceText = "이번 주 신제품 업데이트와 고객 반응을 플랫폼별 게시물로 정리합니다."
  targetPlatforms = @("threads", "instagram", "xiaohongshu", "naver-blog", "kakao-talk")
  tone = "한국 나노 인플루언서 스타일"
  useRag = $false
}
if (-not $transform.variants -or $transform.variants.Count -lt 2) {
  throw "Transform did not return enough variants."
}
Write-Host "transform ok: provider=$($transform.provider), variants=$($transform.variants.Count)"

$apiTransform = Invoke-SnapsRequest -Method "POST" -Path "/api/snaps/transform" -Body @{
  sourceText = "API alias에서도 동일하게 플랫폼별 변환이 되는지 확인합니다."
  targetPlatforms = @("threads", "instagram")
  tone = "간결한 한국어"
  useRag = $false
}
if (-not $apiTransform.variants -or $apiTransform.variants.Count -lt 2) {
  throw "Transform API alias did not return enough variants."
}
Write-Host "transform api alias ok: variants=$($apiTransform.variants.Count)"

$draftTransform = Invoke-SnapsRequest -Method "POST" -Path "/api/snaps/transform-and-draft" -Body @{
  sourceText = "새로운 기능 업데이트를 draft payload로 변환합니다."
  targetPlatforms = @("threads", "instagram")
  tone = "간결한 한국어"
  useRag = $false
}
if (-not $draftTransform.draftPayload -or $draftTransform.draftPayload.type -ne "draft" -or $draftTransform.draftPayload.posts.Count -lt 1) {
  throw "Transform-and-draft alias did not return a draft payload."
}
Write-Host "transform draft alias ok: posts=$($draftTransform.draftPayload.posts.Count)"

$scheduledTransform = Invoke-SnapsRequest -Method "POST" -Path "/api/snaps/transform-and-schedule" -Body @{
  sourceText = "연결 채널 없이 예약 변환할 때 경고를 확인합니다."
  targetPlatforms = @("instagram")
  tone = "테스트"
  useRag = $false
  integrations = @()
  scheduleType = "draft"
}
if (-not $scheduledTransform.warnings -or $scheduledTransform.warnings.Count -lt 1 -or $scheduledTransform.scheduled.Count -ne 0) {
  throw "Transform-and-schedule alias without integrations should return warnings and no scheduled posts."
}
Write-Host "transform schedule alias warning ok"

$bestTime = Invoke-SnapsRequest -Method "GET" -Path "/snaps/schedule/best-time"
if (-not $bestTime.recommendedDate -or -not $bestTime.recommendedDateLocal -or -not $bestTime.source) {
  throw "Best-time schedule recommendation did not return recommendedDate, recommendedDateLocal, and source."
}
Write-Host "best-time schedule recommendation ok: $($bestTime.recommendedDateLocal)"

$brandKitId = $null
try {
  $brandKitPreview = Invoke-SnapsRequest -Method "POST" -Path "/snaps/brand-kits/analyze" -Body @{
    name = "Runtime brand kit $RuntimeSmokeId"
    audience = "B2B marketers"
    voice = "Clear practical Korean advisor"
    tone = "Evidence-led and concise"
    requiredTerms = @("snaps", "content ops")
    bannedTerms = @("perfect", "guaranteed")
    hashtags = @("#snaps", "#contentops")
    targetPlatforms = @("threads", "instagram")
    websiteText = "Brand: Runtime brand kit $RuntimeSmokeId`nUse proof and practical checklists."
  }
  if ($brandKitPreview.source -ne "snaps-brand-kit" -or -not ($brandKitPreview.requiredTerms -contains "snaps")) {
    throw "Brand kit analysis did not return voice guidance."
  }

  $brandKit = Invoke-SnapsRequest -Method "POST" -Path "/snaps/brand-kits" -Body @{
    name = $brandKitPreview.name
    audience = $brandKitPreview.audience
    voice = $brandKitPreview.voice
    tone = $brandKitPreview.tone
    values = $brandKitPreview.values
    requiredTerms = $brandKitPreview.requiredTerms
    bannedTerms = $brandKitPreview.bannedTerms
    hashtags = $brandKitPreview.hashtags
    cta = $brandKitPreview.cta
    colors = $brandKitPreview.colors
    targetPlatforms = $brandKitPreview.targetPlatforms
    examples = $brandKitPreview.examples
  }
  $brandKitId = $brandKit.id
  if (-not $brandKitId -or $brandKit.source -ne "snaps-brand-kit") {
    throw "Brand kit save did not return a saved kit."
  }

  $brandKitList = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/brand-kits")
  if (-not ($brandKitList | Where-Object { $_.id -eq $brandKitId })) {
    throw "Brand kit list did not include the saved kit."
  }

  $brandKitApply = Invoke-SnapsRequest -Method "POST" -Path "/snaps/brand-kits/$brandKitId/apply" -Body @{
    sourceText = "Runtime brand source $RuntimeSmokeId"
    topic = "Runtime brand topic"
  }
  if ($brandKitApply.source -ne "snaps-brand-kit-application" -or -not ($brandKitApply.hashtagAppend -contains "#snaps")) {
    throw "Brand kit apply did not return transform guidance."
  }
  Write-Host "brand kit ok: $brandKitId"
} finally {
  $brandKitCleanupError = Invoke-CleanupDelete -Label "brand kit" -Path $(if ($brandKitId) { "/snaps/brand-kits/$brandKitId" } else { $null })
  if ($brandKitCleanupError) {
    Write-Host "cleanup warning: $brandKitCleanupError"
  } elseif ($brandKitId) {
    Write-Host "brand kit cleanup ok"
  }
}

$mediaAssetId = $null
try {
  $mediaAssetPreview = Invoke-SnapsRequest -Method "POST" -Path "/snaps/media-library/preview" -Body @{
    title = "Runtime media asset $RuntimeSmokeId"
    url = "https://example.com/runtime-media-$RuntimeSmokeId.png"
    mediaType = "image"
    altText = "Runtime media asset for snaps smoke"
    caption = "Runtime media asset caption"
    campaign = "Runtime media campaign"
    tags = @("runtime", "media")
    targetPlatforms = @("instagram", "youtube")
    width = 1080
    height = 1350
  }
  if ($mediaAssetPreview.source -ne "snaps-media-library" -or -not $mediaAssetPreview.platformFit) {
    throw "Media library preview did not return platform fit guidance."
  }

  $mediaAsset = Invoke-SnapsRequest -Method "POST" -Path "/snaps/media-library" -Body @{
    title = $mediaAssetPreview.title
    url = $mediaAssetPreview.url
    thumbnail = $mediaAssetPreview.thumbnail
    mediaType = $mediaAssetPreview.mediaType
    altText = $mediaAssetPreview.altText
    caption = $mediaAssetPreview.caption
    campaign = $mediaAssetPreview.campaign
    tags = $mediaAssetPreview.tags
    targetPlatforms = @("instagram", "linkedin")
    width = $mediaAssetPreview.width
    height = $mediaAssetPreview.height
  }
  $mediaAssetId = $mediaAsset.id
  if (-not $mediaAssetId -or $mediaAsset.source -ne "snaps-media-library") {
    throw "Media library save did not return a saved asset."
  }

  $mediaAssetList = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/media-library")
  if (-not ($mediaAssetList | Where-Object { $_.id -eq $mediaAssetId })) {
    throw "Media library list did not include the saved asset."
  }

  $mediaAssetAttach = Invoke-SnapsRequest -Method "POST" -Path "/snaps/media-library/$mediaAssetId/attach" -Body @{
    targetPlatforms = @("instagram", "linkedin")
    caption = "Runtime attached media caption"
  }
  if ($mediaAssetAttach.source -ne "snaps-media-library-attach" -or $mediaAssetAttach.transform.variants.Count -lt 2) {
    throw "Media library attach did not return platform variants."
  }

  $mediaAssetQueue = Invoke-SnapsRequest -Method "POST" -Path "/snaps/media-library/$mediaAssetId/schedule" -Body @{
    targetPlatforms = @("instagram")
    caption = "Runtime queued media caption"
    scheduleType = "draft"
    integrations = @()
  }
  if ($mediaAssetQueue.source -ne "snaps-media-library" -or -not $mediaAssetQueue.warnings) {
    throw "Media library draft queue should surface missing integration warnings."
  }
  Write-Host "media library ok: $mediaAssetId"
} finally {
  $mediaAssetCleanupError = Invoke-CleanupDelete -Label "media asset" -Path $(if ($mediaAssetId) { "/snaps/media-library/$mediaAssetId" } else { $null })
  if ($mediaAssetCleanupError) {
    Write-Host "cleanup warning: $mediaAssetCleanupError"
  } elseif ($mediaAssetId) {
    Write-Host "media library cleanup ok"
  }
}

$creativeMediaAssetId = $null
try {
  $creativeBriefPreview = Invoke-SnapsRequest -Method "POST" -Path "/snaps/creative-briefs/preview" -Body @{
    title = "Runtime creative brief $RuntimeSmokeId"
    sourceText = "Runtime creative handoff for snaps media library smoke."
    mediaType = "image"
    aspectRatio = "portrait"
    visualStyle = "clean Korean SaaS editorial layout"
    targetPlatforms = @("instagram", "linkedin")
    cta = "댓글로 파일럿이라고 남겨주세요."
  }
  if ($creativeBriefPreview.source -ne "snaps-creative-brief" -or $creativeBriefPreview.items.Count -lt 1) {
    throw "Creative brief preview did not return design handoff items."
  }
  Write-Host "creative brief preview ok: items=$($creativeBriefPreview.items.Count)"

  $creativeBriefSave = Invoke-SnapsRequest -Method "POST" -Path "/snaps/creative-briefs/save-media" -Body @{
    title = "Runtime creative brief $RuntimeSmokeId"
    sourceText = "Runtime creative handoff for snaps media library smoke."
    mediaType = "image"
    aspectRatio = "portrait"
    targetPlatforms = @("instagram", "linkedin")
    itemId = $creativeBriefPreview.items[0].id
  }
  $creativeMediaAssetId = $creativeBriefSave.asset.id
  if (-not $creativeMediaAssetId -or $creativeBriefSave.source -ne "snaps-creative-brief") {
    throw "Creative brief save-media did not return a saved media asset."
  }
  Write-Host "creative brief save-media ok: asset=$creativeMediaAssetId"
} finally {
  $creativeCleanupError = Invoke-CleanupDelete -Label "creative brief media asset" -Path $(if ($creativeMediaAssetId) { "/snaps/media-library/$creativeMediaAssetId" } else { $null })
  if ($creativeCleanupError) {
    Write-Host "cleanup warning: $creativeCleanupError"
  } elseif ($creativeMediaAssetId) {
    Write-Host "creative brief cleanup ok"
  }
}

$ideaId = $null
$ideaSourceId = $null
try {
  $ideaPreview = Invoke-SnapsRequest -Method "POST" -Path "/snaps/ideas/generate" -Body @{
    topic = "Runtime idea board $RuntimeSmokeId"
    audience = "B2B marketers"
    goal = "more pilot comments"
    targetPlatforms = @("threads", "instagram")
    count = 3
  }
  if ($ideaPreview.source -ne "snaps-idea-board" -or $ideaPreview.ideas.Count -lt 3) {
    throw "Idea board generation did not return generated ideas."
  }

  $idea = Invoke-SnapsRequest -Method "POST" -Path "/snaps/ideas" -Body @{
    title = $ideaPreview.ideas[0].title
    body = $ideaPreview.ideas[0].body
    group = "Runtime"
    tags = @("runtime", "idea")
    targetPlatforms = @("threads")
    priority = "high"
  }
  $ideaId = $idea.id
  if (-not $ideaId -or $idea.status -ne "inbox") {
    throw "Idea board save did not return an inbox idea."
  }

  $ideaList = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/ideas?status=inbox&search=Runtime")
  if (-not ($ideaList | Where-Object { $_.id -eq $ideaId })) {
    throw "Idea board list did not include the saved idea."
  }

  $ideaStatusUpdate = Invoke-SnapsRequest -Method "POST" -Path "/snaps/ideas/$ideaId/status" -Body @{
    status = "planned"
    group = "Runtime"
  }
  if ($ideaStatusUpdate.idea.status -ne "planned") {
    throw "Idea board status update did not mark the idea planned."
  }

  $ideaPromotion = Invoke-SnapsRequest -Method "POST" -Path "/snaps/ideas/$ideaId/promote-to-source" -Body @{}
  $ideaSourceId = $ideaPromotion.source.id
  if (-not $ideaSourceId -or $ideaPromotion.idea.status -ne "drafted") {
    throw "Idea board promotion did not create a source and draft the idea."
  }
  Write-Host "idea board ok: $ideaId source=$ideaSourceId"
} finally {
  $ideaCleanupError = Invoke-CleanupDelete -Label "idea board item" -Path $(if ($ideaId) { "/snaps/ideas/$ideaId" } else { $null })
  if ($ideaCleanupError) {
    Write-Host "cleanup warning: $ideaCleanupError"
  } elseif ($ideaId) {
    Write-Host "idea board cleanup ok"
  }
  $ideaSourceCleanupError = Invoke-CleanupDelete -Label "idea source" -Path $(if ($ideaSourceId) { "/snaps/source-library/$ideaSourceId" } else { $null })
  if ($ideaSourceCleanupError) {
    Write-Host "cleanup warning: $ideaSourceCleanupError"
  } elseif ($ideaSourceId) {
    Write-Host "idea source cleanup ok"
  }
}

$viralCoach = Invoke-SnapsRequest -Method "POST" -Path "/snaps/coach/viral" -Body @{
  platform = "instagram"
  title = "Runtime viral coach $RuntimeSmokeId"
  content = "콘텐츠 만드는 사람이 가장 많이 놓치는 첫 3초 훅을 고치는 방법입니다. 문제를 먼저 보여주고 저장할 만한 체크리스트로 정리하세요. 댓글로 다음 주제를 알려주세요."
  visualDescription = "첫 화면에 큰 자막, 체크리스트 카드, 문제 장면이 순서대로 보입니다."
  hashtags = @("#콘텐츠", "#마케팅", "#릴스")
  durationSeconds = 30
}
if ($viralCoach.source -ne "snaps-viral-ai-coach" -or $viralCoach.categories.Count -lt 6 -or $viralCoach.suggestedHooks.Count -lt 1) {
  throw "Viral coach did not return scorecard categories and suggested hooks."
}
Write-Host "viral coach scorecard ok: score=$($viralCoach.score)"

$variationSourceIds = @()
try {
  $variationPayload = @{
    sourceText = "snaps post variation lab runtime smoke $RuntimeSmokeId 원문입니다. 하나의 성과 좋은 글을 여러 훅, 증거, CTA 후보로 바꿔 A/B 테스트합니다. 고객은 시간이 줄어드는 증거와 저장할 체크리스트를 원합니다."
    title = "Runtime variation lab $RuntimeSmokeId"
    topic = "AI 콘텐츠 운영 실험"
    audience = "B2B 콘텐츠 마케터"
    cta = "댓글로 실험이라고 남기면 샘플 훅 목록을 보내드립니다."
    targetPlatforms = @("threads", "instagram", "linkedin")
    variantCount = 5
    goal = "comments"
    competitorHook = "손작업 콘텐츠를 줄이세요"
    tags = @("runtime", "experiment")
  }
  $variationPreview = Invoke-SnapsRequest -Method "POST" -Path "/snaps/experiments/variations/preview" -Body $variationPayload
  if ($variationPreview.source -ne "snaps-post-variation-lab" -or $variationPreview.totalVariants -lt 5 -or -not $variationPreview.winningVariantId) {
    throw "Post variation lab preview did not return ranked variations."
  }
  Write-Host "post variation lab preview ok: variants=$($variationPreview.totalVariants)"

  $variationImport = Invoke-SnapsRequest -Method "POST" -Path "/snaps/experiments/variations/import-sources" -Body $variationPayload
  if ($variationImport.imported.imported -lt 1) {
    throw "Post variation lab import did not merge variations into Source Library."
  }
  $variationSources = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/source-library")
  $variationSourceIds = $variationSources |
    Where-Object { $_.title -match $RuntimeSmokeId -and $_.sourcePlatform -eq "post-variation-lab" } |
    ForEach-Object { $_.id } |
    Where-Object { $_ }
  Write-Host "post variation lab source import ok: sources=$($variationSourceIds.Count)"

  $variationQueue = Invoke-SnapsRequest -Method "POST" -Path "/snaps/experiments/variations/schedule" -Body ($variationPayload + @{
    scheduleType = "draft"
    integrations = @()
  })
  if (-not $variationQueue.warnings -or $variationQueue.warnings.Count -lt 1) {
    throw "Post variation lab draft queue should warn when no connected integrations are supplied."
  }
  Write-Host "post variation lab draft queue warning ok"
} finally {
  foreach ($variationSourceId in $variationSourceIds) {
    $variationCleanupError = Invoke-CleanupDelete -Label "post variation source" -Path "/snaps/source-library/$variationSourceId"
    if ($variationCleanupError) {
      Write-Host "cleanup warning: $variationCleanupError"
    }
  }
  if ($variationSourceIds.Count -gt 0) {
    Write-Host "post variation lab cleanup ok"
  }
}

$resolvedSource = Invoke-SnapsRequest -Method "POST" -Path "/snaps/source-resolver/preview" -Body @{
  sourceType = "text"
  text = "snaps source resolver runtime smoke $RuntimeSmokeId 원문입니다. URL, 텍스트, 리서치 소스를 원문 라이브러리 입력으로 바꾸는 흐름을 확인합니다."
  customInstructions = "한국 B2B 콘텐츠 톤으로 재사용"
  tags = @("runtime", "resolver")
}
if ($resolvedSource.source -ne "snaps-source-resolver" -or $resolvedSource.sourceType -ne "text" -or -not $resolvedSource.sourceInput.sourceText) {
  throw "Source resolver preview did not return source library input."
}
Write-Host "source resolver preview ok: words=$($resolvedSource.wordCount)"

$resolvedSourceImport = Invoke-SnapsRequest -Method "POST" -Path "/snaps/source-resolver/import" -Body @{
  sourceType = "research"
  query = "snaps source resolver $RuntimeSmokeId"
  customInstructions = "pilot 고객에게 보여줄 리서치 브리프"
  tags = @("runtime", "research")
}
if ($resolvedSourceImport.imported.imported -lt 1 -or $resolvedSourceImport.preview.sourceType -ne "research") {
  throw "Source resolver import did not merge a research brief into Source Library."
}
Write-Host "source resolver import ok: imported=$($resolvedSourceImport.imported.imported)"

$calendarSourceIds = @()
try {
  $calendarCampaign = "Runtime calendar $RuntimeSmokeId"
  $calendarBrief = "snaps content calendar runtime smoke $RuntimeSmokeId 브리프입니다. 하나의 원문을 날짜별 포스트 슬롯, 쇼츠, 캐러셀, 저장형 게시물로 나눕니다."
  $calendarPreview = Invoke-SnapsRequest -Method "POST" -Path "/snaps/calendar/plan" -Body @{
    sourceText = $calendarBrief
    campaign = $calendarCampaign
    audience = "B2B 콘텐츠 마케터"
    cadence = "weekdays"
    days = 7
    postsPerDay = 1
    targetPlatforms = @("threads", "instagram", "linkedin")
    contentPillars = "교육,문제 인식,사례"
    goals = "reach,save,lead"
    formats = "text,carousel,short-video"
  }
  if ($calendarPreview.source -ne "snaps-content-calendar" -or $calendarPreview.acceptedItems -lt 1 -or $calendarPreview.items.Count -lt 1) {
    throw "Content calendar preview did not return accepted items."
  }
  Write-Host "content calendar plan ok: items=$($calendarPreview.acceptedItems)"

  $calendarImport = Invoke-SnapsRequest -Method "POST" -Path "/snaps/calendar/import-sources" -Body @{
    sourceText = $calendarBrief
    campaign = $calendarCampaign
    cadence = "weekdays"
    days = 7
    postsPerDay = 1
    targetPlatforms = @("threads", "instagram", "linkedin")
    contentPillars = "교육,문제 인식,사례"
    goals = "reach,save,lead"
    formats = "text,carousel,short-video"
  }
  if ($calendarImport.imported.imported -lt 1) {
    throw "Content calendar import did not import any source items."
  }
  $calendarSources = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/source-library")
  $calendarSourceIds = @(
    $calendarSources |
      Where-Object { $_.title -like "$calendarCampaign*" } |
      Select-Object -ExpandProperty id
  )
  if ($calendarSourceIds.Count -lt 1) {
    throw "Content calendar imported sources were not visible in the source library."
  }
  Write-Host "content calendar source import ok: sources=$($calendarSourceIds.Count)"

  $calendarSchedule = Invoke-SnapsRequest -Method "POST" -Path "/snaps/calendar/schedule" -Body @{
    sourceText = $calendarBrief
    campaign = $calendarCampaign
    cadence = "weekdays"
    days = 7
    postsPerDay = 1
    targetPlatforms = @("threads", "instagram", "linkedin")
    contentPillars = "교육,문제 인식,사례"
    goals = "reach,save,lead"
    formats = "text,carousel,short-video"
    scheduleType = "draft"
    integrations = @()
  }
  if (-not $calendarSchedule.items -or $calendarSchedule.items.Count -lt 1 -or -not $calendarSchedule.items[0].warnings -or $calendarSchedule.items[0].warnings.Count -lt 1) {
    throw "Content calendar schedule without integrations should return item warnings."
  }
  Write-Host "content calendar draft queue warning ok"
} finally {
  foreach ($calendarSourceId in $calendarSourceIds) {
    $cleanupError = Invoke-CleanupDelete -Label "content calendar source" -Path "/snaps/source-library/$calendarSourceId"
    if ($cleanupError) {
      Write-Host "cleanup warning: $cleanupError"
    }
  }
  if ($calendarSourceIds.Count -gt 0) {
    Write-Host "content calendar cleanup ok"
  }
}

$categorySourceIds = @()
try {
  $categoryCampaign = "Runtime category $RuntimeSmokeId"
  $categorySource = "snaps content category runtime smoke $RuntimeSmokeId 원문입니다. 교육, 사례, 프로모션, 커뮤니티 카테고리로 균형 잡힌 게시 믹스를 만듭니다."
  $categoryConfig = @(
    "교육|evergreen|#12b8b8|저장형 체크리스트와 튜토리얼|2",
    "사례|share-once|#f6c85f|고객 전후 비교|1",
    "프로모션|share-once|#ef6f6c|상담 CTA|1"
  ) -join "`n"
  $categoryPreview = Invoke-SnapsRequest -Method "POST" -Path "/snaps/categories/plan" -Body @{
    sourceText = $categorySource
    campaign = $categoryCampaign
    categories = $categoryConfig
    categorySequence = "교육,교육,사례,프로모션"
    days = 7
    postsPerDay = 1
    targetPlatforms = @("threads", "instagram")
    linkUrl = "https://example.com/offer"
  }
  if ($categoryPreview.source -ne "snaps-content-categories" -or $categoryPreview.acceptedItems -lt 1 -or $categoryPreview.categoryMix.Count -lt 1) {
    throw "Content category preview did not return a category queue."
  }
  Write-Host "content category plan ok: items=$($categoryPreview.acceptedItems)"

  $categoryImport = Invoke-SnapsRequest -Method "POST" -Path "/snaps/categories/import-sources" -Body @{
    sourceText = $categorySource
    campaign = $categoryCampaign
    categories = $categoryConfig
    categorySequence = "교육,교육,사례,프로모션"
    days = 7
    postsPerDay = 1
    targetPlatforms = @("threads", "instagram")
    linkUrl = "https://example.com/offer"
  }
  if ($categoryImport.imported.imported -lt 1) {
    throw "Content category import did not import any source items."
  }
  $categorySources = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/source-library")
  $categorySourceIds = @(
    $categorySources |
      Where-Object { $_.title -like "$categoryCampaign*" } |
      Select-Object -ExpandProperty id
  )
  if ($categorySourceIds.Count -lt 1) {
    throw "Content category imported sources were not visible in the source library."
  }
  Write-Host "content category source import ok: sources=$($categorySourceIds.Count)"

  $categorySchedule = Invoke-SnapsRequest -Method "POST" -Path "/snaps/categories/schedule" -Body @{
    sourceText = $categorySource
    campaign = $categoryCampaign
    categories = $categoryConfig
    categorySequence = "교육,교육,사례,프로모션"
    days = 7
    postsPerDay = 1
    targetPlatforms = @("threads", "instagram")
    linkUrl = "https://example.com/offer"
    scheduleType = "draft"
    integrations = @()
  }
  if (-not $categorySchedule.items -or $categorySchedule.items.Count -lt 1 -or -not $categorySchedule.items[0].warnings -or $categorySchedule.items[0].warnings.Count -lt 1) {
    throw "Content category schedule without integrations should return item warnings."
  }
  Write-Host "content category draft queue warning ok"
} finally {
  foreach ($categorySourceId in $categorySourceIds) {
    $cleanupError = Invoke-CleanupDelete -Label "content category source" -Path "/snaps/source-library/$categorySourceId"
    if ($cleanupError) {
      Write-Host "cleanup warning: $cleanupError"
    }
  }
  if ($categorySourceIds.Count -gt 0) {
    Write-Host "content category cleanup ok"
  }
}

$conditionSourceId = $null
try {
  $conditionParentTitle = "Runtime condition parent $RuntimeSmokeId"
  $conditionFollowUp = "조건이 충족된 부모 게시물에 붙일 후속 자료 링크입니다. snaps post condition runtime smoke $RuntimeSmokeId"
  $conditionPreview = Invoke-SnapsRequest -Method "POST" -Path "/snaps/conditions/preview" -Body @{
    parentTitle = $conditionParentTitle
    parentPlatform = "instagram"
    parentPublishedAt = (Get-Date).AddHours(-2).ToString("o")
    followUpText = $conditionFollowUp
    conditionType = "engagement-rate"
    threshold = 3.5
    metrics = @{
      likes = 120
      retweets = 8
      comments = 18
      impressions = 4200
      engagementRate = 4.2
    }
    baseline = @{
      averageImpressions = 3000
      averageEngagementRate = 3.1
    }
    targetPlatforms = @("instagram", "threads")
  }
  if ($conditionPreview.source -ne "snaps-post-condition" -or -not $conditionPreview.triggerMet -or $conditionPreview.status -ne "ready") {
    throw "Post condition preview did not return a triggered decision."
  }
  Write-Host "post condition preview ok: $($conditionPreview.conditionSummary)"

  $conditionImport = Invoke-SnapsRequest -Method "POST" -Path "/snaps/conditions/import-source" -Body @{
    parentTitle = $conditionParentTitle
    parentPlatform = "instagram"
    followUpText = $conditionFollowUp
    conditionType = "likes"
    threshold = 50
    metrics = @{ likes = 120; impressions = 4200 }
    targetPlatforms = @("threads")
  }
  if ($conditionImport.imported.imported -lt 1) {
    throw "Post condition import did not import follow-up source."
  }
  $conditionSources = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/source-library")
  $conditionSource = $conditionSources | Where-Object { $_.title -like "$conditionParentTitle*" } | Select-Object -First 1
  $conditionSourceId = $conditionSource.id
  if (-not $conditionSourceId) {
    throw "Post condition imported source was not visible in the source library."
  }
  Write-Host "post condition source import ok: source=$conditionSourceId"

  $conditionSchedule = Invoke-SnapsRequest -Method "POST" -Path "/snaps/conditions/schedule" -Body @{
    parentTitle = $conditionParentTitle
    parentPlatform = "threads"
    followUpText = $conditionFollowUp
    conditionType = "likes"
    threshold = 50
    metrics = @{ likes = 120; impressions = 4200 }
    targetPlatforms = @("threads")
    scheduleType = "draft"
    integrations = @()
  }
  if (-not $conditionSchedule.warnings -or $conditionSchedule.warnings.Count -lt 1 -or $conditionSchedule.scheduled.Count -ne 0) {
    throw "Post condition schedule without integrations should return warnings and no scheduled posts."
  }
  Write-Host "post condition draft queue warning ok"
} finally {
  $conditionCleanupError = Invoke-CleanupDelete -Label "post condition source" -Path $(if ($conditionSourceId) { "/snaps/source-library/$conditionSourceId" } else { $null })
  if ($conditionCleanupError) {
    Write-Host "cleanup warning: $conditionCleanupError"
  } elseif ($conditionSourceId) {
    Write-Host "post condition cleanup ok"
  }
}

$approvalId = $null
try {
  $approval = Invoke-SnapsRequest -Method "POST" -Path "/snaps/approvals" -Body @{
    title = "Runtime approval $RuntimeSmokeId"
    reviewer = "runtime-client@example.com"
    note = "runtime approval smoke"
    variants = @(
      @{
        platform = "threads"
        label = "Threads"
        content = "snaps approval workflow runtime smoke [$RuntimeSmokeId]"
        hashtags = @("#snaps")
        settings = @{}
        publishMode = "schedule"
      }
    )
    scheduleType = "draft"
  }
  $approvalId = $approval.id
  if (-not $approvalId -or $approval.status -ne "pending") {
    throw "Approval request did not return a pending item."
  }
  Write-Host "approval request ok: $approvalId"

  $approvalList = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/approvals")
  if (-not ($approvalList | Where-Object { $_.id -eq $approvalId })) {
    throw "Approval list did not include the submitted approval request."
  }

  $approvalPublicLink = Invoke-SnapsRequest -Method "POST" -Path "/snaps/approvals/$approvalId/public-link" -Body @{
    reviewer = "runtime-client@example.com"
    note = "runtime public approval review"
    expiresInDays = 14
    allowDecision = $true
  }
  if (-not $approvalPublicLink.publicReviewUrl -or -not $approvalPublicLink.publicApiPath -or -not $approvalPublicLink.token) {
    throw "Approval public review link did not return public URL metadata."
  }
  $approvalPublicReview = Invoke-SnapsRequest -Method "GET" -Path $approvalPublicLink.publicApiPath
  if ($approvalPublicReview.source -ne "snaps-public-approval-review" -or $approvalPublicReview.approvalId -ne $approvalId) {
    throw "Approval public review endpoint did not return the approval request."
  }
  $approvalPublicComment = Invoke-SnapsRequest -Method "POST" -Path "$($approvalPublicLink.publicApiPath)/comment" -Body @{
    actor = "runtime-client@example.com"
    message = "Runtime public approval feedback [$RuntimeSmokeId]"
    selection = "public CTA"
  }
  if ($approvalPublicComment.source -ne "snaps-public-approval-comment" -or -not $approvalPublicComment.comment.id) {
    throw "Approval public review comment did not store feedback."
  }
  $approvalPublicDecision = Invoke-SnapsRequest -Method "POST" -Path "$($approvalPublicLink.publicApiPath)/review" -Body @{
    decision = "request-changes"
    reviewer = "runtime-client@example.com"
    note = "public reviewer requested changes"
  }
  if ($approvalPublicDecision.review.status -ne "changes-requested") {
    throw "Approval public review decision did not update status."
  }
  Write-Host "approval public review link ok"

  $approvalRevoked = Invoke-SnapsRequest -Method "DELETE" -Path "/snaps/approvals/$approvalId/public-link"
  if (-not $approvalRevoked.revoked -or $approvalRevoked.approval.publicReviewEnabled) {
    throw "Approval public review link revoke did not disable the link."
  }
  Invoke-SnapsRequestExpectStatus -Method "GET" -Path $approvalPublicLink.publicApiPath -StatusCode 404
  Write-Host "approval public review revoke ok"

  $approvalComment = Invoke-SnapsRequest -Method "POST" -Path "/snaps/approvals/$approvalId/comments" -Body @{
    actor = "runtime-client@example.com"
    message = "Runtime approval comment [$RuntimeSmokeId]"
    visibility = "reviewer"
    selection = "CTA"
  }
  $approvalCommentId = $approvalComment.comment.id
  if (-not $approvalCommentId -or -not $approvalComment.approval.comments -or $approvalComment.approval.comments.Count -lt 1) {
    throw "Approval comment thread did not store a comment."
  }

  $resolvedApprovalComment = Invoke-SnapsRequest -Method "POST" -Path "/snaps/approvals/$approvalId/comments/$approvalCommentId/resolve" -Body @{
    actor = "snaps operator"
    resolved = $true
  }
  if (-not $resolvedApprovalComment.comment.resolved) {
    throw "Approval comment thread did not resolve the comment."
  }
  Write-Host "approval comment thread ok"

  $approved = Invoke-SnapsRequest -Method "POST" -Path "/snaps/approvals/$approvalId/review" -Body @{
    decision = "approve"
    reviewer = "runtime-client@example.com"
    note = "approved in runtime smoke"
  }
  if ($approved.status -ne "approved") {
    throw "Approval review did not mark the item approved."
  }
  Write-Host "approval review ok: status=$($approved.status)"

  $approvalSchedule = Invoke-SnapsRequest -Method "POST" -Path "/snaps/approvals/$approvalId/schedule" -Body @{
    scheduleType = "draft"
    integrations = @()
  }
  if (-not $approvalSchedule.scheduled.warnings -or $approvalSchedule.scheduled.warnings.Count -lt 1 -or $approvalSchedule.scheduled.scheduled.Count -ne 0) {
    throw "Approval schedule without integrations should return warnings and no scheduled posts."
  }
  Write-Host "approval draft queue warning ok"
} finally {
  $approvalCleanupError = Invoke-CleanupDelete -Label "approval request" -Path $(if ($approvalId) { "/snaps/approvals/$approvalId" } else { $null })
  if ($approvalCleanupError) {
    Write-Host "cleanup warning: $approvalCleanupError"
  } elseif ($approvalId) {
    Write-Host "approval workflow cleanup ok"
  }
}

$bulkSourceId = $null
try {
  $bulkCsv = @"
title,topic,caption,platforms,publishDate,mediaUrl,linkUrl,tags
Runtime bulk $RuntimeSmokeId,Runtime CSV,"CSV bulk row for snaps runtime smoke $RuntimeSmokeId","instagram|threads",$((Get-Date).AddDays(1).ToString("yyyy-MM-ddTHH:mm:ssK")),https://example.com/runtime.png,https://example.com/runtime,"bulk|runtime"
"@
  $bulkPreview = Invoke-SnapsRequest -Method "POST" -Path "/snaps/bulk/preview" -Body @{
    csvText = $bulkCsv
    defaultPlatforms = @("instagram", "threads")
    defaultTone = "테스트"
  }
  if ($bulkPreview.acceptedRows -lt 1 -or $bulkPreview.rows.Count -lt 1) {
    throw "Bulk CSV preview did not return accepted rows."
  }
  Write-Host "bulk csv preview ok: rows=$($bulkPreview.acceptedRows)"

  $bulkImport = Invoke-SnapsRequest -Method "POST" -Path "/snaps/bulk/import-sources" -Body @{
    csvText = $bulkCsv
    defaultPlatforms = @("instagram", "threads")
    defaultTone = "테스트"
  }
  if ($bulkImport.imported.imported -lt 1) {
    throw "Bulk CSV import did not import any source rows."
  }
  $bulkSources = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/source-library")
  $bulkSource = $bulkSources | Where-Object { $_.title -eq "Runtime bulk $RuntimeSmokeId" } | Select-Object -First 1
  $bulkSourceId = $bulkSource.id
  if (-not $bulkSourceId) {
    throw "Bulk CSV imported source was not visible in the source library."
  }
  Write-Host "bulk csv source import ok: source=$bulkSourceId"

  $bulkSchedule = Invoke-SnapsRequest -Method "POST" -Path "/snaps/bulk/schedule" -Body @{
    csvText = $bulkCsv
    defaultPlatforms = @("instagram", "threads")
    defaultTone = "테스트"
    scheduleType = "draft"
    integrations = @()
  }
  if ($bulkSchedule.rows.Count -lt 1 -or -not $bulkSchedule.rows[0].warnings) {
    throw "Bulk CSV schedule without integrations should return row warnings."
  }
  Write-Host "bulk csv draft queue warning ok"
} finally {
  $bulkCleanupErrors = @()
  $cleanupError = Invoke-CleanupDelete -Label "bulk csv source" -Path $(if ($bulkSourceId) { "/snaps/source-library/$bulkSourceId" } else { $null })
  if ($cleanupError) { $bulkCleanupErrors += $cleanupError }
  if ($bulkCleanupErrors.Count -gt 0) {
    $bulkCleanupErrors | ForEach-Object { Write-Host "cleanup warning: $_" }
  } elseif ($bulkSourceId) {
    Write-Host "bulk csv cleanup ok"
  }
}

$feedSourceId = $null
try {
  $feedXml = @"
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>snaps runtime feed</title>
    <item>
      <title>Runtime feed $RuntimeSmokeId</title>
      <link>https://example.com/runtime-feed</link>
      <description>RSS feed row for snaps runtime smoke $RuntimeSmokeId</description>
      <pubDate>$((Get-Date).AddDays(1).ToUniversalTime().ToString("R"))</pubDate>
      <category>runtime</category>
      <enclosure url="https://example.com/runtime-feed.png" type="image/png" />
    </item>
  </channel>
</rss>
"@
  $feedPreview = Invoke-SnapsRequest -Method "POST" -Path "/snaps/feeds/preview" -Body @{
    feedXml = $feedXml
    defaultPlatforms = @("instagram", "threads")
    defaultTone = "테스트"
  }
  if ($feedPreview.acceptedItems -lt 1 -or $feedPreview.items.Count -lt 1) {
    throw "RSS feed preview did not return accepted items."
  }
  Write-Host "rss feed preview ok: items=$($feedPreview.acceptedItems)"

  $feedImport = Invoke-SnapsRequest -Method "POST" -Path "/snaps/feeds/import-sources" -Body @{
    feedXml = $feedXml
    defaultPlatforms = @("instagram", "threads")
    defaultTone = "테스트"
  }
  if ($feedImport.imported.imported -lt 1) {
    throw "RSS feed import did not import any source items."
  }
  $feedSources = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/source-library")
  $feedSource = $feedSources | Where-Object { $_.title -eq "Runtime feed $RuntimeSmokeId" } | Select-Object -First 1
  $feedSourceId = $feedSource.id
  if (-not $feedSourceId) {
    throw "RSS feed imported source was not visible in the source library."
  }
  Write-Host "rss feed source import ok: source=$feedSourceId"

  $feedSchedule = Invoke-SnapsRequest -Method "POST" -Path "/snaps/feeds/schedule" -Body @{
    feedXml = $feedXml
    defaultPlatforms = @("instagram", "threads")
    defaultTone = "테스트"
    scheduleType = "draft"
    integrations = @()
  }
  if ($feedSchedule.items.Count -lt 1 -or -not $feedSchedule.items[0].warnings) {
    throw "RSS feed schedule without integrations should return item warnings."
  }
  Write-Host "rss feed draft queue warning ok"
} finally {
  $feedCleanupErrors = @()
  $cleanupError = Invoke-CleanupDelete -Label "rss feed source" -Path $(if ($feedSourceId) { "/snaps/source-library/$feedSourceId" } else { $null })
  if ($cleanupError) { $feedCleanupErrors += $cleanupError }
  if ($feedCleanupErrors.Count -gt 0) {
    $feedCleanupErrors | ForEach-Object { Write-Host "cleanup warning: $_" }
  } elseif ($feedSourceId) {
    Write-Host "rss feed cleanup ok"
  }
}

$carouselSource = @"
Runtime carousel $RuntimeSmokeId
원문을 플랫폼별 문법으로 재작성합니다.
저장할 만한 인사이트를 카드뉴스로 쪼갭니다.
마지막 장에는 상담 CTA를 둡니다.
"@
$carouselPreview = Invoke-SnapsRequest -Method "POST" -Path "/snaps/visuals/carousel/preview" -Body @{
  sourceText = $carouselSource
  title = "Runtime carousel $RuntimeSmokeId"
  topic = "runtime carousel"
  targetPlatforms = @("instagram", "threads")
  template = "listicle"
  aspectRatio = "square"
  slideCount = 4
}
if ($carouselPreview.slideCount -lt 3 -or $carouselPreview.media.Count -lt 3 -or -not $carouselPreview.slides[0].svgDataUrl) {
  throw "Carousel visual preview did not return generated slide media."
}
Write-Host "carousel visual preview ok: slides=$($carouselPreview.slideCount)"

$carouselExport = Invoke-SnapsRequest -Method "POST" -Path "/snaps/visuals/carousel/export" -Body @{
  sourceText = $carouselSource
  title = "Runtime carousel $RuntimeSmokeId"
  targetPlatforms = @("instagram")
}
if (-not $carouselExport.exportHtml -or -not ($carouselExport.exportHtml -like "*Runtime carousel*")) {
  throw "Carousel visual export did not return expected HTML."
}
Write-Host "carousel visual export ok"

$carouselSchedule = Invoke-SnapsRequest -Method "POST" -Path "/snaps/visuals/carousel/schedule" -Body @{
  sourceText = $carouselSource
  title = "Runtime carousel $RuntimeSmokeId"
  targetPlatforms = @("instagram")
  scheduleType = "draft"
  integrations = @()
}
if ($carouselSchedule.variants.Count -lt 1 -or -not $carouselSchedule.warnings) {
  throw "Carousel visual schedule without integrations should return warnings."
}
Write-Host "carousel visual draft queue warning ok"

$visualPlannerItems = @(
  @{
    title = "Runtime feed cover $RuntimeSmokeId"
    imageUrl = "https://example.com/runtime-feed-cover.png"
    status = "scheduled"
    publishDate = (Get-Date).AddDays(1).ToString("o")
    caption = "Runtime feed planner cover"
    mediaType = "image"
  },
  @{
    title = "Runtime reel cover $RuntimeSmokeId"
    imageUrl = "https://example.com/runtime-reel-cover.png"
    status = "draft"
    publishDate = (Get-Date).AddDays(2).ToString("o")
    caption = "Runtime feed planner reel cover"
    mediaType = "video"
  }
)
$visualPlannerPreview = Invoke-SnapsRequest -Method "POST" -Path "/snaps/visual-planner/preview" -Body @{
  platform = "instagram"
  viewMode = "vertical"
  includeDrafts = $true
  items = $visualPlannerItems
}
if ($visualPlannerPreview.source -ne "snaps-visual-feed-planner" -or $visualPlannerPreview.columns -ne 3 -or $visualPlannerPreview.items.Count -lt 2) {
  throw "Visual feed planner preview did not return grid cells."
}
Write-Host "visual feed planner preview ok: items=$($visualPlannerPreview.totalItems)"

$visualPlannerSchedule = Invoke-SnapsRequest -Method "POST" -Path "/snaps/visual-planner/schedule" -Body @{
  platform = "instagram"
  viewMode = "square"
  targetPlatforms = @("instagram")
  scheduleType = "draft"
  integrations = @()
  items = $visualPlannerItems
}
if ($visualPlannerSchedule.variants.Count -lt 1 -or -not $visualPlannerSchedule.warnings) {
  throw "Visual feed planner schedule without integrations should return warnings."
}
Write-Host "visual feed planner draft queue warning ok"

$firstCommentPreview = Invoke-SnapsRequest -Method "POST" -Path "/snaps/first-comments/preview" -Body @{
  sourceText = "Runtime first comment source $RuntimeSmokeId https://example.com/runtime-first-comment"
  topic = "Runtime first comment"
  globalComment = "#snaps #firstcomment`n`nRuntime first comment CTA"
  strategy = "hashtags"
  targetPlatforms = @("instagram", "linkedin")
  variants = @(
    @{
      platform = "instagram"
      label = "Instagram"
      title = "Runtime first comment post"
      content = "Runtime first comment caption"
      hashtags = @("#snaps", "#firstcomment")
      settings = @{ __type = "instagram"; post_type = "post" }
      publishMode = "schedule"
    }
  )
}
if ($firstCommentPreview.source -ne "snaps-first-comment-planner" -or $firstCommentPreview.supportedItems -lt 1) {
  throw "First comment planner preview did not return supported comment items."
}
Write-Host "first comment planner preview ok: items=$($firstCommentPreview.totalItems)"

$firstCommentSchedule = Invoke-SnapsRequest -Method "POST" -Path "/snaps/first-comments/schedule" -Body @{
  sourceText = "Runtime first comment source $RuntimeSmokeId"
  globalComment = "#snaps #firstcomment`n`nRuntime first comment CTA"
  strategy = "hashtags"
  targetPlatforms = @("instagram")
  scheduleType = "draft"
  integrations = @()
  variants = @(
    @{
      platform = "instagram"
      label = "Instagram"
      title = "Runtime first comment post"
      content = "Runtime first comment caption"
      hashtags = @("#snaps", "#firstcomment")
      settings = @{ __type = "instagram"; post_type = "post" }
      publishMode = "schedule"
    }
  )
}
if ($firstCommentSchedule.variants.Count -lt 1 -or -not $firstCommentSchedule.warnings) {
  throw "First comment schedule without integrations should return warnings."
}
Write-Host "first comment draft queue warning ok"

$hashtagSetId = $null
$hashtagSetPreview = Invoke-SnapsRequest -Method "POST" -Path "/snaps/hashtag-sets/preview" -Body @{
  title = "Runtime hashtag set $RuntimeSmokeId"
  topic = "Runtime hashtag set"
  hashtagText = "#snaps #firstcomment #콘텐츠운영 #마케팅자동화 #파일럿 #초과태그"
  reusableText = "Runtime hashtag set CTA"
  placement = "first-comment"
  strategy = "campaign"
  targetPlatforms = @("instagram", "linkedin")
  variants = @(
    @{
      platform = "instagram"
      label = "Instagram"
      title = "Runtime hashtag set post"
      content = "Runtime hashtag set caption"
      hashtags = @("#snaps")
      settings = @{ __type = "instagram"; post_type = "post" }
      publishMode = "schedule"
    }
  )
}
if ($hashtagSetPreview.source -ne "snaps-hashtag-set" -or $hashtagSetPreview.hashtags.Count -lt 2 -or -not $hashtagSetPreview.platformPlans) {
  throw "Hashtag set preview did not return platform plans."
}
Write-Host "hashtag set preview ok: tags=$($hashtagSetPreview.hashtags.Count)"

$hashtagSet = Invoke-SnapsRequest -Method "POST" -Path "/snaps/hashtag-sets" -Body $hashtagSetPreview
$hashtagSetId = $hashtagSet.id
if (-not $hashtagSetId -or $hashtagSet.source -ne "snaps-hashtag-set") {
  throw "Hashtag set save did not return an id."
}
$hashtagSetList = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/hashtag-sets")
if (-not ($hashtagSetList | Where-Object { $_.id -eq $hashtagSetId } | Select-Object -First 1)) {
  throw "Hashtag set list did not include saved set."
}
$hashtagSetApply = Invoke-SnapsRequest -Method "POST" -Path "/snaps/hashtag-sets/$hashtagSetId/apply" -Body @{
  placement = "first-comment"
  targetPlatforms = @("instagram")
  variants = @(
    @{
      platform = "instagram"
      label = "Instagram"
      title = "Runtime hashtag set post"
      content = "Runtime hashtag set caption"
      hashtags = @("#snaps")
      settings = @{ __type = "instagram"; post_type = "post" }
      publishMode = "schedule"
    }
  )
}
if ($hashtagSetApply.source -ne "snaps-hashtag-set-application" -or $hashtagSetApply.transform.variants.Count -lt 1) {
  throw "Hashtag set apply did not return transform variants."
}
$hashtagSetSchedule = Invoke-SnapsRequest -Method "POST" -Path "/snaps/hashtag-sets/$hashtagSetId/schedule" -Body @{
  placement = "first-comment"
  targetPlatforms = @("instagram")
  scheduleType = "draft"
  integrations = @()
  variants = @(
    @{
      platform = "instagram"
      label = "Instagram"
      title = "Runtime hashtag set post"
      content = "Runtime hashtag set caption"
      hashtags = @("#snaps")
      settings = @{ __type = "instagram"; post_type = "post" }
      publishMode = "schedule"
    }
  )
}
if ($hashtagSetSchedule.source -ne "snaps-hashtag-set" -or -not $hashtagSetSchedule.warnings) {
  throw "Hashtag set schedule without integrations should return warnings."
}
$trackedHashtagSetId = $null
$hashtagTrackerPayload = @{
  title = "Runtime hashtag tracker $RuntimeSmokeId"
  topic = "Runtime hashtag tracker"
  goal = "engagement"
  hashtagText = "#snaps #firstcomment #콘텐츠운영 #마케팅자동화"
  targetPlatforms = @("instagram", "x")
  importText = "hashtag,platform,posts,impressions,engagements,comments,saves,clicks`n#snaps,instagram,7,11200,740,44,116,51`n#firstcomment,instagram,4,6800,288,30,42,18`n#마케팅자동화,x,11,17400,540,39,21,72"
}
$hashtagTrackerPreview = Invoke-SnapsRequest -Method "POST" -Path "/snaps/hashtags/tracker/preview" -Body $hashtagTrackerPayload
if ($hashtagTrackerPreview.source -ne "snaps-hashtag-tracker" -or $hashtagTrackerPreview.trackedHashtags -lt 2 -or -not $hashtagTrackerPreview.bestHashtag) {
  throw "Hashtag tracker preview did not return scored hashtag recommendations."
}
Write-Host "hashtag tracker preview ok: best=$($hashtagTrackerPreview.bestHashtag)"

$trackedHashtagSet = Invoke-SnapsRequest -Method "POST" -Path "/snaps/hashtags/tracker/save-set" -Body ($hashtagTrackerPayload + @{
  setTitle = "Runtime tracked hashtag set $RuntimeSmokeId"
  placement = "caption"
})
$trackedHashtagSetId = $trackedHashtagSet.set.id
if ($trackedHashtagSet.source -ne "snaps-hashtag-tracker" -or -not $trackedHashtagSetId) {
  throw "Hashtag tracker did not save recommended hashtags as a set."
}
Write-Host "hashtag tracker save-set ok: set=$trackedHashtagSetId"

$trackedHashtagSetCleanupError = Invoke-CleanupDelete -Label "tracked hashtag set" -Path $(if ($trackedHashtagSetId) { "/snaps/hashtag-sets/$trackedHashtagSetId" } else { $null })
if ($trackedHashtagSetCleanupError) {
  throw $trackedHashtagSetCleanupError
}
$hashtagSetCleanupError = Invoke-CleanupDelete -Label "hashtag set" -Path $(if ($hashtagSetId) { "/snaps/hashtag-sets/$hashtagSetId" } else { $null })
if ($hashtagSetCleanupError) {
  throw $hashtagSetCleanupError
}
Write-Host "hashtag set save/apply/tracker/draft queue warning ok"

$listeningMonitorId = $null
$listeningInboxCleanupIds = @()
$listeningImportText = @"
platform,author,content,postId,sourceUrl,engagement
instagram,@runtime_lead,"snaps 가격표와 데모 링크 받을 수 있나요? #콘텐츠자동화",runtime-listen-1,https://example.com/runtime/listen-1,24
threads,@runtime_ops,"Buffer랑 비교하면 댓글 응대까지 되나요?",runtime-listen-2,https://example.com/runtime/listen-2,9
x,@runtime_noise,"카지노 무료머니 snaps",runtime-listen-3,https://example.com/runtime/listen-3,2
"@
$listeningPreview = Invoke-SnapsRequest -Method "POST" -Path "/snaps/listening/preview" -Body @{
  title = "Runtime social listening $RuntimeSmokeId"
  query = "snaps OR #콘텐츠자동화"
  keywords = @("snaps", "#콘텐츠자동화", "가격", "데모", "Buffer", "비교")
  excludeKeywords = @("카지노")
  targetPlatforms = @("instagram", "threads", "x")
  campaign = "runtime smoke"
  importText = $listeningImportText
}
if ($listeningPreview.source -ne "snaps-social-listening" -or $listeningPreview.highIntentItems -lt 1 -or -not $listeningPreview.signals) {
  throw "Social listening preview did not return high-intent signals."
}
Write-Host "social listening preview ok: highIntent=$($listeningPreview.highIntentItems)"

$listeningMonitor = Invoke-SnapsRequest -Method "POST" -Path "/snaps/listening/monitors" -Body @{
  title = "Runtime social listening $RuntimeSmokeId"
  query = "snaps OR #콘텐츠자동화"
  keywords = @("snaps", "#콘텐츠자동화", "가격", "데모", "Buffer", "비교")
  excludeKeywords = @("카지노")
  targetPlatforms = @("instagram", "threads", "x")
  campaign = "runtime smoke"
  tags = @("runtime", "listening")
  importText = $listeningImportText
}
$listeningMonitorId = $listeningMonitor.id
if (-not $listeningMonitorId -or $listeningMonitor.source -ne "snaps-social-listening") {
  throw "Social listening monitor save did not return an id."
}
$listeningList = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/listening/monitors")
if (-not ($listeningList | Where-Object { $_.id -eq $listeningMonitorId } | Select-Object -First 1)) {
  throw "Social listening list did not include saved monitor."
}
$listeningRun = Invoke-SnapsRequest -Method "POST" -Path "/snaps/listening/monitors/$listeningMonitorId/run" -Body @{
  importText = $listeningImportText
}
if ($listeningRun.source -ne "snaps-social-listening-run" -or $listeningRun.preview.highIntentItems -lt 1) {
  throw "Social listening run did not return a high-intent preview."
}
$listeningPromote = Invoke-SnapsRequest -Method "POST" -Path "/snaps/listening/monitors/$listeningMonitorId/promote-to-inbox" -Body @{
  importText = $listeningImportText
}
if ($listeningPromote.inbox.imported -lt 1) {
  throw "Social listening promotion did not import inbox items."
}
$listeningInboxCleanupIds = Convert-ToArray $listeningPromote.inbox.items | ForEach-Object { $_.id } | Where-Object { $_ }
foreach ($itemId in $listeningInboxCleanupIds) {
  $cleanupError = Invoke-CleanupDelete -Label "listening inbox item" -Path "/snaps/inbox/items/$itemId"
  if ($cleanupError) {
    throw $cleanupError
  }
}
$listeningCleanupError = Invoke-CleanupDelete -Label "listening monitor" -Path $(if ($listeningMonitorId) { "/snaps/listening/monitors/$listeningMonitorId" } else { $null })
if ($listeningCleanupError) {
  throw $listeningCleanupError
}
Write-Host "social listening save/run/promote/delete ok"

$trendSourceIds = @()
try {
  $trendImportText = @"
topic,platform,volume,previousVolume,engagement,sentiment,competitor,format,content,source
Runtime trend $RuntimeSmokeId,instagram,42,13,760,positive,Rival Studio,reels,"3초 안에 수작업 문제를 보여준 릴스",competitor
가격 문의 자동응대,threads,21,7,180,mixed,,thread,"가격표와 데모 링크 요청이 늘어남",listening
예약 발행 오류 알림,x,17,4,120,negative,,post,"오류 알림을 요구하는 불만 리스크",listening
"@
  $trendPayload = @{
    title = "Runtime trend radar $RuntimeSmokeId"
    industry = "B2B content automation"
    region = "KR"
    windowDays = 7
    keywords = @("Runtime trend $RuntimeSmokeId", "가격 문의", "예약 발행")
    targetPlatforms = @("instagram", "threads", "linkedin")
    importText = $trendImportText
    listeningPreview = $listeningPreview
    hashtagTrackerPreview = $hashtagTrackerPreview
  }
  $trendPreview = Invoke-SnapsRequest -Method "POST" -Path "/snaps/trends/radar/preview" -Body $trendPayload
  if ($trendPreview.source -ne "snaps-trend-radar" -or $trendPreview.totalTrends -lt 2 -or -not $trendPreview.alerts) {
    throw "Trend radar preview did not return scored trend alerts."
  }
  Write-Host "trend radar preview ok: trends=$($trendPreview.totalTrends)"

  $trendImport = Invoke-SnapsRequest -Method "POST" -Path "/snaps/trends/radar/import-sources" -Body $trendPayload
  if ($trendImport.source -ne "snaps-trend-radar" -or $trendImport.imported.imported -lt 1) {
    throw "Trend radar source import did not import source ideas."
  }
  $trendSources = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/source-library")
  $trendSourceIds = $trendSources |
    Where-Object { $_.sourcePlatform -eq "trend-radar" -and $_.sourceText -like "*$RuntimeSmokeId*" } |
    ForEach-Object { $_.id } |
    Where-Object { $_ }
  foreach ($sourceId in $trendSourceIds) {
    $cleanupError = Invoke-CleanupDelete -Label "trend radar source" -Path "/snaps/source-library/$sourceId"
    if ($cleanupError) {
      throw $cleanupError
    }
  }
  Write-Host "trend radar source import ok: imported=$($trendImport.imported.imported)"
} catch {
  foreach ($sourceId in $trendSourceIds) {
    $cleanupError = Invoke-CleanupDelete -Label "trend radar source" -Path "/snaps/source-library/$sourceId"
    if ($cleanupError) {
      Write-Host "cleanup warning: $cleanupError"
    }
  }
  throw
}

$postPreview = Invoke-SnapsRequest -Method "POST" -Path "/snaps/previews/post" -Body @{
  variants = $transform.variants
  device = "desktop"
  linkUrl = "https://example.com/runtime/$RuntimeSmokeId"
  linkTitle = "Runtime link preview $RuntimeSmokeId"
  linkDescription = "Runtime smoke verifies platform feed cuts and link cards."
  linkImage = "https://example.com/runtime-preview.png"
  imageDescription = "Runtime smoke campaign dashboard preview"
  media = @(@{ path = "https://example.com/runtime-preview.png" })
  targetPlatforms = @("instagram", "linkedin", "x")
}
if ($postPreview.source -ne "snaps-post-preview-inspector" -or $postPreview.totalCards -lt 2 -or -not $postPreview.cards) {
  throw "Post preview inspector did not return platform cards."
}
$postPreviewWarnings = Convert-ToArray $postPreview.warnings
if ($postPreview.averageAccessibilityScore -lt 1 -or $postPreviewWarnings.Count -lt 1) {
  throw "Post preview inspector did not return accessibility scoring and warnings."
}
Write-Host "post preview inspector ok: cards=$($postPreview.totalCards)"

$adDisclosure = Invoke-SnapsRequest -Method "POST" -Path "/snaps/compliance/ad-disclosure" -Body @{
  relationship = "gifted"
  advertiser = "Runtime $RuntimeSmokeId"
  variants = @(
    @{ platform = "instagram"; content = "체험단으로 받은 세럼 후기`n#세럼" },
    @{ platform = "kakao-talk"; content = "오픈 기념 할인 쿠폰" }
  )
}
$adDisclosureCards = Convert-ToArray $adDisclosure.cards
if ($adDisclosure.source -ne "snaps-ad-disclosure-guard" -or $adDisclosure.status -ne "block" -or $adDisclosureCards.Count -lt 2) {
  throw "Ad disclosure guard did not block an ambiguous sponsored post."
}
$kakaoRules = @(Convert-ToArray $adDisclosureCards[1].findings | ForEach-Object { $_.rule })
if (-not ($kakaoRules -contains "message-ad-prefix-missing") -or -not $adDisclosureCards[1].fixApplied) {
  throw "Ad disclosure guard did not flag and fix the KakaoTalk ad message prefix."
}
Write-Host "ad disclosure guard ok: blockers=$($adDisclosure.blockers) warnings=$($adDisclosure.warnings)"

$recycleSourceIds = @()
try {
  $recycleSource = @"
Runtime recycle $RuntimeSmokeId
성과가 좋았던 게시물을 에버그린 큐로 재활용합니다.
문제 인식형으로 다시 보여줍니다.
실행 체크리스트형으로 다시 정리합니다.
성과 근거를 붙여 신뢰도를 높입니다.
"@
  $recyclePreview = Invoke-SnapsRequest -Method "POST" -Path "/snaps/recycle/preview" -Body @{
    sourceText = $recycleSource
    title = "Runtime recycle $RuntimeSmokeId"
    category = "evergreen"
    cadence = "weekly"
    repeatCount = 3
    targetPlatforms = @("instagram", "threads")
    performanceNote = "runtime smoke top performer"
  }
  if ($recyclePreview.acceptedItems -lt 3 -or $recyclePreview.items.Count -lt 3) {
    throw "Evergreen recycle preview did not return accepted items."
  }
  Write-Host "evergreen recycle preview ok: items=$($recyclePreview.acceptedItems)"

  $recycleImport = Invoke-SnapsRequest -Method "POST" -Path "/snaps/recycle/import-sources" -Body @{
    sourceText = $recycleSource
    title = "Runtime recycle $RuntimeSmokeId"
    category = "evergreen"
    cadence = "weekly"
    repeatCount = 3
    targetPlatforms = @("instagram", "threads")
    performanceNote = "runtime smoke top performer"
  }
  if ($recycleImport.imported.imported -lt 1) {
    throw "Evergreen recycle import did not import any source items."
  }
  $recycleSources = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/source-library")
  $recycleSourceIds = @($recycleSources | Where-Object { $_.title -like "Runtime recycle $RuntimeSmokeId*" } | ForEach-Object { $_.id } | Where-Object { $_ })
  if ($recycleSourceIds.Count -lt 1) {
    throw "Evergreen recycle imported sources were not visible in the source library."
  }
  Write-Host "evergreen recycle source import ok: sources=$($recycleSourceIds.Count)"

  $recycleSchedule = Invoke-SnapsRequest -Method "POST" -Path "/snaps/recycle/schedule" -Body @{
    sourceText = $recycleSource
    title = "Runtime recycle $RuntimeSmokeId"
    category = "evergreen"
    cadence = "weekly"
    repeatCount = 3
    targetPlatforms = @("instagram", "threads")
    scheduleType = "draft"
    integrations = @()
  }
  if ($recycleSchedule.items.Count -lt 1 -or -not $recycleSchedule.items[0].warnings) {
    throw "Evergreen recycle schedule without integrations should return item warnings."
  }
  Write-Host "evergreen recycle draft queue warning ok"
} finally {
  $recycleCleanupErrors = @()
  foreach ($recycleSourceId in $recycleSourceIds) {
    $cleanupError = Invoke-CleanupDelete -Label "evergreen recycle source" -Path "/snaps/source-library/$recycleSourceId"
    if ($cleanupError) { $recycleCleanupErrors += $cleanupError }
  }
  if ($recycleCleanupErrors.Count -gt 0) {
    $recycleCleanupErrors | ForEach-Object { Write-Host "cleanup warning: $_" }
} elseif ($recycleSourceIds.Count -gt 0) {
    Write-Host "evergreen recycle cleanup ok"
  }
}

$repurposeSourceIds = @()
try {
  $repurposeSource = @"
youtube|2030-01-06T11:00:00+09:00|https://example.com/youtube/runtime|Runtime repurpose $RuntimeSmokeId future|라이브 데모 영상을 Threads와 LinkedIn용 문장으로 재배포합니다.
blog|2024-01-02T09:00:00+09:00|https://example.com/blog/runtime|Runtime repurpose $RuntimeSmokeId existing|이미 공개된 가이드는 일정 기반 슬롯에서만 재배포합니다.
"@
  $repurposeBody = @{
    sourceText = $repurposeSource
    workflowMode = "schedule"
    contentFilter = "all-content"
    targetPlatforms = @("threads", "linkedin")
    tags = @("runtime-smoke")
  }
  $repurposePreview = Invoke-SnapsRequest -Method "POST" -Path "/snaps/repurpose/preview" -Body $repurposeBody
  $repurposeSlots = Convert-ToArray $repurposePreview.scheduleSlots
  if ($repurposePreview.source -ne "snaps-repurpose-queue" -or $repurposePreview.acceptedItems -lt 2 -or $repurposeSlots.Count -lt 1) {
    throw "Repurpose queue preview did not return accepted posting-plan items."
  }
  Write-Host "repurpose queue preview ok: items=$($repurposePreview.acceptedItems) slots=$($repurposeSlots.Count)"

  $repurposeImport = Invoke-SnapsRequest -Method "POST" -Path "/snaps/repurpose/import-sources" -Body $repurposeBody
  if ($repurposeImport.imported.imported -lt 1) {
    throw "Repurpose queue import did not import any source items."
  }
  $repurposeSources = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/source-library")
  $repurposeSourceIds = @($repurposeSources | Where-Object { $_.title -like "Runtime repurpose $RuntimeSmokeId*" } | ForEach-Object { $_.id } | Where-Object { $_ })
  if ($repurposeSourceIds.Count -lt 1) {
    throw "Repurpose queue imported sources were not visible in the source library."
  }
  Write-Host "repurpose queue source import ok: sources=$($repurposeSourceIds.Count)"

  $repurposeScheduleBody = $repurposeBody.Clone()
  $repurposeScheduleBody.scheduleType = "draft"
  $repurposeScheduleBody.integrations = @()
  $repurposeSchedule = Invoke-SnapsRequest -Method "POST" -Path "/snaps/repurpose/schedule" -Body $repurposeScheduleBody
  if ($repurposeSchedule.items.Count -lt 1 -or -not $repurposeSchedule.items[0].warnings) {
    throw "Repurpose queue schedule without integrations should return item warnings."
  }
  Write-Host "repurpose queue draft warning ok"
} finally {
  $repurposeCleanupErrors = @()
  foreach ($repurposeSourceId in $repurposeSourceIds) {
    $cleanupError = Invoke-CleanupDelete -Label "repurpose queue source" -Path "/snaps/source-library/$repurposeSourceId"
    if ($cleanupError) { $repurposeCleanupErrors += $cleanupError }
  }
  if ($repurposeCleanupErrors.Count -gt 0) {
    $repurposeCleanupErrors | ForEach-Object { Write-Host "cleanup warning: $_" }
  } elseif ($repurposeSourceIds.Count -gt 0) {
    Write-Host "repurpose queue cleanup ok"
  }
}

$recurringSourceIds = @()
try {
  $recurringSource = @"
2주 파일럿 모집 반복 게시
같은 제안을 매주 다른 각도로 보여줍니다.
댓글과 상담 CTA를 유지하고 날짜별 큐를 만듭니다.
"@
  $recurringPreview = Invoke-SnapsRequest -Method "POST" -Path "/snaps/recurring/preview" -Body @{
    sourceText = $recurringSource
    title = "Runtime recurring $RuntimeSmokeId"
    cadence = "weekly"
    repeatCount = 3
    localTime = "10:00"
    targetPlatforms = @("instagram", "threads")
    cta = "댓글로 파일럿이라고 남겨주세요."
  }
  if ($recurringPreview.acceptedItems -lt 3 -or $recurringPreview.items.Count -lt 3 -or -not $recurringPreview.items[0].publishDate) {
    throw "Recurring post preview did not return dated accepted items."
  }
  Write-Host "recurring post preview ok: items=$($recurringPreview.acceptedItems)"

  $recurringImport = Invoke-SnapsRequest -Method "POST" -Path "/snaps/recurring/import-sources" -Body @{
    sourceText = $recurringSource
    title = "Runtime recurring $RuntimeSmokeId"
    cadence = "weekly"
    repeatCount = 3
    localTime = "10:00"
    targetPlatforms = @("instagram", "threads")
    cta = "댓글로 파일럿이라고 남겨주세요."
  }
  if ($recurringImport.imported.imported -lt 1) {
    throw "Recurring post import did not import any source items."
  }
  $recurringSources = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/source-library")
  $recurringSourceIds = @($recurringSources | Where-Object { $_.title -like "Runtime recurring $RuntimeSmokeId*" } | ForEach-Object { $_.id } | Where-Object { $_ })
  if ($recurringSourceIds.Count -lt 1) {
    throw "Recurring post imported sources were not visible in the source library."
  }
  Write-Host "recurring post source import ok: sources=$($recurringSourceIds.Count)"

  $recurringSchedule = Invoke-SnapsRequest -Method "POST" -Path "/snaps/recurring/schedule" -Body @{
    sourceText = $recurringSource
    title = "Runtime recurring $RuntimeSmokeId"
    cadence = "weekly"
    repeatCount = 3
    targetPlatforms = @("instagram", "threads")
    scheduleType = "draft"
    integrations = @()
  }
  if ($recurringSchedule.items.Count -lt 1 -or -not $recurringSchedule.items[0].warnings) {
    throw "Recurring post schedule without integrations should return item warnings."
  }
  Write-Host "recurring post draft queue warning ok"
} finally {
  $recurringCleanupErrors = @()
  foreach ($recurringSourceId in $recurringSourceIds) {
    $cleanupError = Invoke-CleanupDelete -Label "recurring post source" -Path "/snaps/source-library/$recurringSourceId"
    if ($cleanupError) { $recurringCleanupErrors += $cleanupError }
  }
  if ($recurringCleanupErrors.Count -gt 0) {
    $recurringCleanupErrors | ForEach-Object { Write-Host "cleanup warning: $_" }
  } elseif ($recurringSourceIds.Count -gt 0) {
    Write-Host "recurring post cleanup ok"
  }
}

$salesCampaignId = $null
$salesReportId = $null
try {
  $salesCampaign = Invoke-SnapsRequest -Method "POST" -Path "/snaps/sales/campaigns" -Body @{
    title = "Runtime sales $RuntimeSmokeId"
    destinationUrl = "https://example.com/snaps-offer"
    cta = "상담 신청"
    platform = "instagram"
    tags = @("runtime", "sales")
  }
  $salesCampaignId = $salesCampaign.id
  if (-not $salesCampaign.id -or -not $salesCampaign.trackingUrl -or -not $salesCampaign.linkInBioUrl) {
    throw "Sales campaign did not include id, trackingUrl, and linkInBioUrl."
  }
  Write-Host "sales campaign ok: $($salesCampaign.slug)"

  $salesLinkUri = [Uri]$salesCampaign.linkInBioUrl
  $salesPublicPath = $salesLinkUri.AbsolutePath -replace "^/snaps/link", "/public/snaps/link"
  $salesLinkSegments = $salesLinkUri.AbsolutePath.Trim("/").Split("/")
  $salesLinkOrganizationId = if ($salesLinkSegments.Length -ge 3) { $salesLinkSegments[2] } else { $null }
  $publicSalesLink = Invoke-RestMethod -Method "GET" -Uri "$BaseUrl$salesPublicPath" -Headers @{ Accept = "application/json" }
  if ($publicSalesLink.source -ne "snaps-public-sales-link" -or -not $publicSalesLink.clickPath -or -not $publicSalesLink.destinationHost) {
    throw "Public sales link did not expose link-in-bio metadata."
  }
  if (-not $salesLinkOrganizationId) {
    throw "Sales link-in-bio URL did not include an organization path segment."
  }
  $publicSalesHub = Invoke-RestMethod -Method "GET" -Uri "$BaseUrl/public/snaps/link/$([Uri]::EscapeDataString($salesLinkOrganizationId))" -Headers @{ Accept = "application/json" }
  $publicSalesHubLinks = Convert-ToArray $publicSalesHub.links
  if ($publicSalesHub.source -ne "snaps-public-sales-hub" -or -not ($publicSalesHubLinks | Where-Object { $_.campaignId -eq $salesCampaign.id })) {
    throw "Public sales hub did not expose the created campaign."
  }
  try {
    $publicSalesClick = Invoke-WebRequest -Method "GET" -Uri "$BaseUrl$salesPublicPath/go" -Headers @{ Accept = "text/html" } -MaximumRedirection 0 -ErrorAction Stop
  } catch {
    $publicSalesClick = $_.Exception.Response
  }
  $publicSalesClickStatus = [int]$publicSalesClick.StatusCode
  $publicSalesClickLocation = $publicSalesClick.Headers["Location"]
  if ($publicSalesClickStatus -ne 302 -or -not $publicSalesClickLocation -or $publicSalesClickLocation -notmatch "utm_campaign=$($salesCampaign.slug)") {
    throw "Public sales link click did not return the expected tracked redirect."
  }
  Write-Host "sales public link and hub ok: $($publicSalesLink.slug)"

  $salesCampaigns = Invoke-SnapsRequest -Method "GET" -Path "/snaps/sales/campaigns"
  $salesCampaignList = Convert-ToArray $salesCampaigns
  if (-not ($salesCampaignList | Where-Object { $_.id -eq $salesCampaign.id })) {
    throw "Sales campaign list did not include the created campaign."
  }

  $salesClick = Invoke-SnapsRequest -Method "POST" -Path "/snaps/sales/events" -Body @{
    campaignId = $salesCampaign.id
    eventType = "click"
    platform = "instagram"
  }
  $salesPurchase = Invoke-SnapsRequest -Method "POST" -Path "/snaps/sales/events" -Body @{
    campaignId = $salesCampaign.id
    eventType = "purchase"
    platform = "instagram"
    amount = 49000
    currency = "KRW"
  }
  if ($salesClick.eventType -ne "click" -or $salesPurchase.eventType -ne "purchase") {
    throw "Sales events did not echo click and purchase event types."
  }

  $salesSummary = Invoke-SnapsRequest -Method "GET" -Path "/snaps/sales/summary"
  if ($salesSummary.clicks -lt 2 -or $salesSummary.purchases -lt 1 -or $salesSummary.revenue -lt 49000) {
    throw "Sales summary did not include recorded clicks, purchases, and revenue."
  }
  Write-Host "sales attribution summary ok: revenue=$($salesSummary.revenue)$($salesSummary.currency)"

  $salesReport = Invoke-SnapsRequest -Method "POST" -Path "/snaps/sales/report"
  $salesReportId = $salesReport.reportId
  if (-not $salesReport.reportId -or -not $salesReport.metrics.sales.revenue) {
    throw "Sales report did not include reportId and sales revenue metrics."
  }
  Write-Host "sales attribution report ok: reportId=$salesReportId"

  $salesProposal = Invoke-SnapsRequest -Method "POST" -Path "/snaps/sales/proposal" -Body @{
    leadName = "Runtime pilot $RuntimeSmokeId"
    segment = "B2B content team"
    sourceAsset = $salesCampaign.title
    pilotDays = 14
    targetRevenue = 299000
    channels = @("instagram", "threads", "linkedin")
  }
  $salesProposalMessages = Convert-ToArray $salesProposal.followUpMessages
  if ($salesProposal.source -ne "snaps-sales-proposal" -or -not $salesProposal.pricing.pilotFee -or $salesProposalMessages.Count -lt 2) {
    throw "Sales pilot proposal did not include source, pricing, and follow-up messages."
  }
  Write-Host "sales pilot proposal ok: pilotFee=$($salesProposal.pricing.pilotFee)$($salesProposal.pricing.currency)"
} finally {
  $salesCleanupErrors = @()
  $cleanupError = Invoke-CleanupDelete -Label "sales report" -Path $(if ($salesReportId) { "/snaps/report/$salesReportId" } else { $null })
  if ($cleanupError) { $salesCleanupErrors += $cleanupError }
  $cleanupError = Invoke-CleanupDelete -Label "sales campaign" -Path $(if ($salesCampaignId) { "/snaps/sales/campaigns/$salesCampaignId" } else { $null })
  if ($cleanupError) { $salesCleanupErrors += $cleanupError }
  if ($salesCleanupErrors.Count -gt 0) {
    $salesCleanupErrors | ForEach-Object { Write-Host "cleanup warning: $_" }
  } elseif ($salesCampaignId -or $salesReportId) {
    Write-Host "sales attribution cleanup ok"
  }
}

$competitorId = $null
$competitorReportId = $null
$importedCompetitorIds = @()
try {
  $competitor = Invoke-SnapsRequest -Method "POST" -Path "/snaps/competitors" -Body @{
    name = "Runtime rival $RuntimeSmokeId"
    handle = "@runtime-rival"
    profileUrl = "https://instagram.com/runtime-rival"
    platform = "instagram"
    niche = "AI content ops"
    tags = @("runtime", "competitor")
  }
  $competitorId = $competitor.id
  if (-not $competitor.id -or $competitor.platform -ne "instagram") {
    throw "Competitor profile did not include id and platform."
  }
  Write-Host "competitor profile ok: $($competitor.name)"

  $competitors = Invoke-SnapsRequest -Method "GET" -Path "/snaps/competitors"
  $competitorList = Convert-ToArray $competitors
  if (-not ($competitorList | Where-Object { $_.id -eq $competitor.id })) {
    throw "Competitor list did not include the created profile."
  }

  $snapshot = Invoke-SnapsRequest -Method "POST" -Path "/snaps/competitors/snapshots" -Body @{
    competitorId = $competitor.id
    followers = 12000
    followersGrowth = 320
    postsCount = 8
    videosCount = 4
    photosCount = 4
    engagement = 560
    engagementRate = 4.7
    topPosts = @(
      @{
        title = "Runtime rival reel $RuntimeSmokeId"
        format = "video"
        engagement = 560
        hook = "3초 안에 문제를 보여준다"
      }
    )
  }
  if (-not $snapshot.id -or $snapshot.competitorId -ne $competitor.id -or $snapshot.engagement -lt 560) {
    throw "Competitor snapshot did not include expected metrics."
  }

  $competitorImportText = "name,handle,profileUrl,platform,niche,followers,followersGrowth,postsCount,videosCount,photosCount,engagement,engagementRate,topPostTitle,topPostFormat,topPostEngagement,topPostHook`nRuntime import rival $RuntimeSmokeId,@runtime-import-rival,https://instagram.com/runtime-import-rival,instagram,AI content ops,14000,210,7,3,4,430,3.1,Imported rival reel,video,430,Show one pain fast"
  $competitorImportPreview = Invoke-SnapsRequest -Method "POST" -Path "/snaps/competitors/import-preview" -Body @{
    importText = $competitorImportText
    defaultPlatform = "instagram"
    defaultNiche = "AI content ops"
  }
  if ($competitorImportPreview.acceptedRows -ne 1 -or $competitorImportPreview.snapshotRows -ne 1) {
    throw "Competitor import preview did not parse one accepted snapshot row."
  }
  Write-Host "competitor import preview ok: rows=$($competitorImportPreview.acceptedRows)"

  $competitorImport = Invoke-SnapsRequest -Method "POST" -Path "/snaps/competitors/import" -Body @{
    importText = $competitorImportText
    defaultPlatform = "instagram"
    defaultNiche = "AI content ops"
  }
  if ($competitorImport.imported.profiles -lt 1 -or $competitorImport.imported.snapshots -lt 1) {
    throw "Competitor import did not persist profiles and snapshots."
  }
  $competitorsAfterImport = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/competitors")
  $importedCompetitorIds = $competitorsAfterImport |
    Where-Object { $_.name -eq "Runtime import rival $RuntimeSmokeId" } |
    ForEach-Object { $_.id } |
    Where-Object { $_ }
  Write-Host "competitor import ok: profiles=$($competitorImport.imported.profiles) snapshots=$($competitorImport.imported.snapshots)"

  $competitorSummary = Invoke-SnapsRequest -Method "GET" -Path "/snaps/competitors/summary"
  if ($competitorSummary.competitors -lt 1 -or $competitorSummary.totalEngagement -lt 560 -or $competitorSummary.videoShare -le 0) {
    throw "Competitor summary did not include recorded engagement and video share."
  }
  Write-Host "competitor analysis summary ok: engagement=$($competitorSummary.totalEngagement)"

  $competitorReport = Invoke-SnapsRequest -Method "POST" -Path "/snaps/competitors/report"
  $competitorReportId = $competitorReport.reportId
  if (-not $competitorReport.reportId -or -not $competitorReport.metrics.competitors.engagement) {
    throw "Competitor report did not include reportId and competitor metrics."
  }
  Write-Host "competitor analysis report ok: reportId=$competitorReportId"
} finally {
  $competitorCleanupErrors = @()
  $cleanupError = Invoke-CleanupDelete -Label "competitor report" -Path $(if ($competitorReportId) { "/snaps/report/$competitorReportId" } else { $null })
  if ($cleanupError) { $competitorCleanupErrors += $cleanupError }
  foreach ($importedCompetitorId in $importedCompetitorIds) {
    $cleanupError = Invoke-CleanupDelete -Label "imported competitor profile" -Path "/snaps/competitors/$importedCompetitorId"
    if ($cleanupError) { $competitorCleanupErrors += $cleanupError }
  }
  $cleanupError = Invoke-CleanupDelete -Label "competitor profile" -Path $(if ($competitorId) { "/snaps/competitors/$competitorId" } else { $null })
  if ($cleanupError) { $competitorCleanupErrors += $cleanupError }
  if ($competitorCleanupErrors.Count -gt 0) {
    $competitorCleanupErrors | ForEach-Object { Write-Host "cleanup warning: $_" }
  } elseif ($competitorId -or $competitorReportId) {
    Write-Host "competitor analysis cleanup ok"
  }
}

$shorts = Invoke-SnapsRequest -Method "POST" -Path "/snaps/video/script" -Body @{
  sourceText = "고객 반응이 좋은 기능을 45초 쇼츠로 설명합니다."
  durationSeconds = 45
  platform = "youtube"
}
if (-not $shorts.coreSummary -or -not $shorts.uploadMetadata -or -not $shorts.storyboard) {
  throw "Shorts script did not include coreSummary, uploadMetadata, and storyboard."
}
Write-Host "shorts script ok: scenes=$($shorts.storyboard.Count)"

$apiShorts = Invoke-SnapsRequest -Method "POST" -Path "/api/snaps/video/script" -Body @{
  sourceText = "API alias로 쇼츠 대본 경로를 확인합니다."
  durationSeconds = 30
  platform = "instagram"
}
if (-not $apiShorts.coreSummary -or -not $apiShorts.uploadMetadata -or -not $apiShorts.storyboard) {
  throw "Shorts script API alias did not include coreSummary, uploadMetadata, and storyboard."
}
Write-Host "shorts script api alias ok: scenes=$($apiShorts.storyboard.Count)"

$voiceoverCaptions = Invoke-SnapsRequest -Method "POST" -Path "/snaps/video/voiceover-captions/preview" -Body @{
  sourceText = "AI 보이스오버와 자막 큐를 쇼츠 대본에 맞춰 검수합니다."
  durationSeconds = 35
  platform = "instagram"
  voice = "Korean energetic creator"
  voiceStyle = "energetic"
  captionStyle = "karaoke"
  script = $shorts
}
if ($voiceoverCaptions.source -ne "snaps-video-voiceover-captions" -or -not $voiceoverCaptions.captions -or -not $voiceoverCaptions.exports.srt -or $voiceoverCaptions.summary.alignmentScore -le 0) {
  throw "Voiceover caption preview did not return captions, SRT export, and alignment score."
}
Write-Host "voiceover captions ok: cues=$($voiceoverCaptions.captions.Count) score=$($voiceoverCaptions.summary.alignmentScore)"

$videoPublishGuard = Invoke-SnapsRequest -Method "POST" -Path "/snaps/video/publish-guard/preview" -Body @{
  durationSeconds = 35
  targetPlatforms = @("instagram", "youtube", "tiktok")
  sceneCount = 4
  generatedImageCount = 4
  generatedVideoCount = 0
  customAssetCount = 1
  textToImageModel = "flux-schnell"
  imageToVideoModel = "none"
  aiVoice = $true
  aiGeneratedVisuals = $true
  realisticPeople = $true
  realisticPlacesEvents = $true
  sourceLanguage = "Korean"
  captionLanguage = "Korean"
  targetLanguages = @("Korean", "English", "Japanese")
}
if ($videoPublishGuard.source -ne "snaps-video-publish-guard" -or $videoPublishGuard.creditBudget.totalCredits -le 0 -or -not $videoPublishGuard.disclosureChecklist -or -not $videoPublishGuard.localizationPlan.rows) {
  throw "Video publish guard did not return credit budget, disclosure checklist, and localization plan."
}
Write-Host "video publish guard ok: credits=$($videoPublishGuard.creditBudget.totalCredits) score=$($videoPublishGuard.publishReadinessScore)"

Invoke-SnapsRequestExpectStatus -Method "POST" -Path "/api/snaps/video/script" -StatusCode 400 -Body @{}
Write-Host "shorts script missing sourceText validation ok"

if (-not $health.pixelle.configured) {
  $generatedShort = Invoke-SnapsRequest -Method "POST" -Path "/api/snaps/video/generate-short" -Body @{
    sourceText = "Pixelle 미설정 상태에서는 스크립트 준비 상태로 반환되어야 합니다."
    durationSeconds = 30
    platform = "tiktok"
  }
  if ($generatedShort.status -ne "script-ready" -or -not $generatedShort.script) {
    throw "Generate-short API alias should return script-ready output when Pixelle is not configured."
  }
  Write-Host "generate-short api alias fallback ok"

  $videoStatus = Invoke-SnapsRequest -Method "GET" -Path "/api/snaps/video/status/runtime-smoke-job"
  if ($videoStatus.status -ne "not-configured") {
    throw "Video status API alias should return not-configured when Pixelle is not configured."
  }
  Write-Host "video status api alias fallback ok"
} else {
  Write-Host "Pixelle configured; skipping fake generate-short/status fallback checks."
}

Invoke-PixelleJobSmoke

Invoke-SnapsRequestExpectStatus -Method "POST" -Path "/snaps/video/attach-to-draft" -StatusCode 400 -Body @{}
Invoke-SnapsRequestExpectStatus -Method "POST" -Path "/api/snaps/video/attach-to-draft" -StatusCode 400 -Body @{}
Write-Host "video attach validation ok"

$replyCapabilities = Invoke-SnapsRequest -Method "GET" -Path "/snaps/inbox/reply-capabilities"
if ($null -eq $replyCapabilities) {
  $replyCapabilities = @()
}
if ($replyCapabilities -isnot [System.Array]) {
  $replyCapabilities = @($replyCapabilities)
}
foreach ($capability in $replyCapabilities) {
  if ($null -eq $capability.id -or $null -eq $capability.commentable) {
    throw "Reply capability entry did not include id and commentable fields."
  }
}
Write-Host "reply capabilities ok: integrations=$($replyCapabilities.Count)"

$replyTemplate = Invoke-SnapsRequest -Method "POST" -Path "/snaps/inbox/reply-templates" -Body @{
  title = "snaps runtime saved answer"
  platform = "instagram"
  sentiment = "question"
  body = "snaps runtime saved answer reply body [$RuntimeSmokeId]"
  cta = "DM으로 상황을 보내주시면 예시를 이어서 드리겠습니다."
  tags = @("runtime", "saved-answer")
}
$replyTemplateId = $replyTemplate.template.id
if (-not $replyTemplateId -or $replyTemplate.template.body -notmatch [regex]::Escape($RuntimeSmokeId)) {
  throw "Reply template save did not return the created template."
}
$replyTemplates = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/inbox/reply-templates?platform=instagram&sentiment=question")
if (-not ($replyTemplates | Where-Object { $_.id -eq $replyTemplateId })) {
  throw "Reply template list did not include the saved template."
}
$replyTemplateDelete = Invoke-SnapsRequest -Method "DELETE" -Path "/snaps/inbox/reply-templates/$replyTemplateId"
if (-not $replyTemplateDelete.deleted) {
  throw "Reply template delete did not remove the saved template."
}
Write-Host "reply templates ok: saved and deleted"

$inboxNote = Invoke-SnapsRequest -Method "POST" -Path "/snaps/inbox/notes" -Body @{
  platform = "instagram"
  author = "runtime-lead-$RuntimeSmokeId"
  postId = "runtime-post-$RuntimeSmokeId"
  note = "snaps runtime customer note [$RuntimeSmokeId]"
  tags = @("runtime", "lead-note")
}
$inboxNoteId = $inboxNote.note.id
if (-not $inboxNoteId -or $inboxNote.note.note -notmatch [regex]::Escape($RuntimeSmokeId)) {
  throw "Inbox note save did not return the created note."
}
$inboxNotes = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/inbox/notes?platform=instagram&author=runtime-lead-$RuntimeSmokeId")
if (-not ($inboxNotes | Where-Object { $_.id -eq $inboxNoteId })) {
  throw "Inbox note list did not include the saved note."
}
$inboxNoteDelete = Invoke-SnapsRequest -Method "DELETE" -Path "/snaps/inbox/notes/$inboxNoteId"
if (-not $inboxNoteDelete.deleted) {
  throw "Inbox note delete did not remove the saved note."
}
Write-Host "inbox notes ok: saved and deleted"

Invoke-SnapsRequestExpectStatus -Method "POST" -Path "/snaps/inbox/publish-reply" -StatusCode 400 -Body @{}
Write-Host "publish reply missing body validation ok"
Invoke-SnapsRequestExpectStatus -Method "POST" -Path "/snaps/inbox/publish-reply" -StatusCode 400 -Body @{
  integrationId = "missing-$RuntimeSmokeId"
  reply = "snaps runtime missing-platform-post reply smoke [$RuntimeSmokeId]"
}
Write-Host "publish reply missing platform post validation ok"
Invoke-SnapsRequestExpectStatus -Method "POST" -Path "/snaps/inbox/publish-reply" -StatusCode 404 -Body @{
  integrationId = "missing-$RuntimeSmokeId"
  platformPostId = "post-$RuntimeSmokeId"
  reply = "snaps runtime missing-integration reply smoke [$RuntimeSmokeId]"
}
Write-Host "publish reply missing integration validation ok"
Invoke-SnapsRequestExpectStatus -Method "POST" -Path "/snaps/inbox/reply-draft" -StatusCode 400 -Body @{}
Write-Host "reply draft missing body validation ok"
Invoke-InboxClearSmoke

Invoke-ConnectedChannelSmoke
Invoke-SandboxConnectedChannelSmoke

if ($RequireOllama) {
  $embeddingSmokeExampleId = $null
  try {
    $embeddingSmoke = Invoke-SnapsRequest -Method "POST" -Path "/snaps/rag/examples" -Body @{
      platform = "instagram"
      content = "snaps runtime Ollama embedding smoke content [$RuntimeSmokeId]"
      authorType = "runtime-ollama-smoke"
      topic = "runtime ollama embedding"
      tone = "테스트"
    }
    $embeddingSmokeExampleId = $embeddingSmoke.id
    if (-not $embeddingSmokeExampleId) {
      throw "RAG example creation did not return an id during Ollama embedding smoke."
    }

    $embeddingQuery = Convert-ToQueryValue "runtime Ollama embedding smoke $RuntimeSmokeId"
    $embeddingSearch = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/rag/search?query=$embeddingQuery&platform=instagram&topK=3")
    if (-not ($embeddingSearch | Where-Object { $_.id -eq $embeddingSmokeExampleId })) {
      throw "RAG search did not return the server-mediated Ollama embedding smoke example."
    }
    Write-Host "ollama embedding smoke ok: example=$embeddingSmokeExampleId"
  } finally {
    $embeddingCleanupError = Invoke-CleanupDelete -Label "Ollama embedding smoke RAG example" -Path $(if ($embeddingSmokeExampleId) { "/snaps/rag/examples/$embeddingSmokeExampleId" } else { $null })
    if ($embeddingCleanupError) {
      throw $embeddingCleanupError
    }
  }
}

if ($IncludeMutating) {
  $cleanupSourceId = $null
  $cleanupSourceExampleId = $null
  $cleanupReportId = $null
  $cleanupAnalyticsReportId = $null
  $cleanupAnalyticsWarningReportId = $null
  $cleanupReportExampleId = $null
  $cleanupFeedbackItemIds = @()
  $mutatingSmokeCompleted = $false

  try {
  $source = Invoke-SnapsRequest -Method "POST" -Path "/snaps/source-library" -Body @{
    title = "runtime smoke source $RuntimeSmokeId"
    sourceText = "snaps runtime smoke source content [$RuntimeSmokeId]"
    sourcePlatform = "smoke"
    topic = "runtime smoke campaign $RuntimeSmokeId"
    tone = "테스트"
    tags = @("smoke")
  }
  $cleanupSourceId = $source.id
  Write-Host "source saved: $($source.id)"

  $sourceList = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/source-library")
  if (-not ($sourceList | Where-Object { $_.id -eq $source.id })) {
    throw "Source library list did not include the saved source."
  }
  Write-Host "source list ok: sources=$($sourceList.Count)"

  Invoke-SnapsRequestExpectStatus -Method "POST" -Path "/snaps/rag/examples" -StatusCode 400 -Body @{}
  Write-Host "rag example missing body validation ok"
  Invoke-SnapsRequestExpectStatus -Method "POST" -Path "/snaps/rag/examples" -StatusCode 400 -Body @{
    platform = "unknown-platform"
    content = "잘못된 플랫폼은 RAG 예시로 저장되면 안 됩니다."
  }
  Write-Host "rag example invalid platform validation ok"

  Invoke-SnapsRequestExpectStatus -Method "POST" -Path "/snaps/source-library/$($source.id)/promote-to-rag" -StatusCode 400 -Body @{}
  Write-Host "source promote missing platform validation ok"

  $ragExample = Invoke-SnapsRequest -Method "POST" -Path "/snaps/source-library/$($source.id)/promote-to-rag" -Body @{
    platform = "instagram"
    authorType = "runtime-smoke"
    topic = "runtime smoke campaign $RuntimeSmokeId"
    tone = "테스트"
  }
  if (-not $ragExample.id -or $ragExample.platform -ne "instagram") {
    throw "Source promotion to RAG did not return an instagram example."
  }
  $cleanupSourceExampleId = $ragExample.id
  Write-Host "source promoted to RAG: $($ragExample.id)"

  $ragExamples = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/rag/examples")
  if (-not ($ragExamples | Where-Object { $_.id -eq $ragExample.id })) {
    throw "RAG examples list did not include the promoted source example."
  }
  Write-Host "rag examples list ok: examples=$($ragExamples.Count)"

  $ragQuery = Convert-ToQueryValue "runtime smoke source $RuntimeSmokeId"
  $ragSearch = Invoke-SnapsRequest -Method "GET" -Path "/snaps/rag/search?query=$ragQuery&platform=instagram&topK=3"
  if (-not $ragSearch -or $ragSearch.Count -lt 1) {
    throw "RAG search did not return the promoted source example."
  }

  $ragRebuild = Invoke-SnapsRequest -Method "POST" -Path "/snaps/rag/rebuild" -Body @{}
  if ($null -eq $ragRebuild.total -or $ragRebuild.total -lt 1) {
    throw "RAG rebuild did not report rebuilt totals."
  }
  Write-Host "rag rebuild ok: rebuilt=$($ragRebuild.rebuilt), total=$($ragRebuild.total)"

  $draftPreview = Invoke-SnapsRequest -Method "POST" -Path "/snaps/schedule-variants" -Body @{
    variants = @(
      @{
        platform = "instagram"
        content = "Runtime smoke draft variant [$RuntimeSmokeId]"
        hashtags = @("#snaps")
        settings = @{
          "__type" = "instagram"
          post_type = "post"
        }
        publishMode = "schedule"
      }
    )
    integrations = @()
    scheduleType = "draft"
  }
  if (-not $draftPreview.warnings -or $draftPreview.warnings.Count -lt 1 -or $draftPreview.scheduled.Count -ne 0) {
    throw "Schedule variants without integrations should return warnings and no scheduled posts."
  }
  Write-Host "schedule warning ok"

  $report = Invoke-SnapsRequest -Method "POST" -Path "/snaps/report/generate" -Body @{
    title = "runtime smoke report $RuntimeSmokeId"
    metrics = @(
      @{
        platform = "instagram"
        metricKey = "impressions"
        metricValue = 100
        collectedAt = (Get-Date).AddDays(-1).ToString("o")
      },
      @{
        platform = "instagram"
        metricKey = "impressions"
        metricValue = 140
        collectedAt = (Get-Date).ToString("o")
      },
      @{
        platform = "instagram"
        metricKey = "likes"
        metricValue = 8
        collectedAt = (Get-Date).ToString("o")
      }
    )
  }
  if (-not $report.insights -or -not $report.actionItems -or -not $report.trends) {
    throw "Report did not include insights, actionItems, and trends."
  }
  $cleanupReportId = $report.reportId
  Write-Host "report saved: $($report.reportId)"

  Invoke-SnapsRequestExpectStatus -Method "POST" -Path "/snaps/report/$($report.reportId)/promote-to-rag" -StatusCode 400 -Body @{}
  Write-Host "report promote missing platform validation ok"

  $reportHistory = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/report/history")
  if (-not ($reportHistory | Where-Object { $_.id -eq $report.reportId })) {
    throw "Report history did not include the saved report."
  }
  Write-Host "report history ok: reports=$($reportHistory.Count)"

  $reportRag = Invoke-SnapsRequest -Method "POST" -Path "/snaps/report/$($report.reportId)/promote-to-rag" -Body @{
    platform = "threads"
    authorType = "runtime-report"
    topic = "runtime smoke report $RuntimeSmokeId"
    tone = "분석 요약"
  }
  if (-not $reportRag.id -or $reportRag.platform -ne "threads") {
    throw "Report promotion to RAG did not return a threads example."
  }
  $cleanupReportExampleId = $reportRag.id
  Write-Host "report promoted to RAG: $($reportRag.id)"

  $export = Invoke-SnapsRequest -Method "GET" -Path "/snaps/report/$($report.reportId)/export?format=markdown"
  if (-not $export.content -or $export.content -notmatch "Action Items") {
    throw "Report markdown export did not include action items."
  }
  $printExport = Invoke-SnapsRequest -Method "GET" -Path "/snaps/report/$($report.reportId)/export?format=print-html"
  if (-not $printExport.content -or $printExport.content -notmatch "snaps Analytics Report") {
    throw "Report print HTML export did not include print report markup."
  }
  Write-Host "report export ok"

  $analyticsReport = Invoke-SnapsRequest -Method "POST" -Path "/snaps/report/from-platform-analytics" -Body @{
    title = "runtime analytics empty-source report $RuntimeSmokeId"
    date = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    integrationIds = @()
    postIds = @()
  }
  if (-not $analyticsReport.reportId -or -not $analyticsReport.insights -or -not $analyticsReport.actionItems) {
    throw "Platform analytics report smoke did not return reportId, insights, and actionItems."
  }
  $cleanupAnalyticsReportId = $analyticsReport.reportId
  Write-Host "platform analytics empty-source report ok: report=$($analyticsReport.reportId)"

  $analyticsWarningReport = Invoke-SnapsRequest -Method "POST" -Path "/snaps/report/from-platform-analytics" -Body @{
    title = "runtime analytics partial failure report $RuntimeSmokeId"
    date = "not-a-valid-date"
    integrationIds = @("missing-integration-$RuntimeSmokeId")
    postIds = @("missing-post-$RuntimeSmokeId")
  }
  if (
    -not $analyticsWarningReport.reportId -or
    -not $analyticsWarningReport.warnings -or
    $analyticsWarningReport.warnings.Count -lt 1 -or
    -not $analyticsWarningReport.insights
  ) {
    throw "Platform analytics partial-failure report did not return reportId, warnings, and insights."
  }
  $cleanupAnalyticsWarningReportId = $analyticsWarningReport.reportId
  Write-Host "platform analytics partial-failure report ok: warnings=$($analyticsWarningReport.warnings.Count)"

  $feedback = Invoke-SnapsRequest -Method "POST" -Path "/snaps/inbox/import" -Body @{
    items = @(
      @{
        platform = "instagram"
        author = "smoke-user"
        content = "이 기능은 어떻게 쓰나요?"
      },
      @{
        platform = "threads"
        author = "partner"
        content = "협업 문의 드립니다."
      }
    )
  }
  $cleanupFeedbackItemIds = Convert-ToArray $feedback.items | ForEach-Object { $_.id } | Where-Object { $_ }
  $summary = Invoke-SnapsRequest -Method "POST" -Path "/snaps/inbox/summary" -Body @{}
  if (-not $summary.bySentiment -or $summary.bySentiment.question -lt 1 -or $summary.bySentiment.collaboration -lt 1) {
    throw "Feedback summary did not classify question and collaboration."
  }
  Write-Host "feedback inbox ok: imported=$($feedback.imported)"

  $assignmentPreview = Invoke-SnapsRequest -Method "POST" -Path "/snaps/inbox/assignments/preview" -Body @{
    status = "unread"
    defaultSlaMinutes = 90
  }
  $assignmentCases = Convert-ToArray $assignmentPreview.cases
  if (
    $assignmentPreview.source -ne "snaps-inbox-assignments" -or
    $assignmentCases.Count -lt 2 -or
    -not ($assignmentCases | Where-Object { $_.assigneeRole -eq "support" }) -or
    -not ($assignmentCases | Where-Object { $_.assigneeRole -eq "partnership" })
  ) {
    throw "Inbox assignment preview did not route imported feedback cases."
  }
  Write-Host "inbox assignment router ok: cases=$($assignmentCases.Count)"

  $questionItems = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/inbox/items?sentiment=question")
  if ($questionItems.Count -lt 1) {
    throw "Feedback inbox question filter did not return imported questions."
  }
  Write-Host "feedback list filter ok: questions=$($questionItems.Count)"

  $triageItemId = $cleanupFeedbackItemIds | Select-Object -First 1
  $statusUpdate = Invoke-SnapsRequest -Method "POST" -Path "/snaps/inbox/items/$triageItemId/status" -Body @{
    status = "resolved"
  }
  if (-not $statusUpdate.updated -or $statusUpdate.item.status -ne "resolved") {
    throw "Feedback inbox status update did not mark the item resolved."
  }
  $resolvedSearch = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/inbox/items?status=resolved&search=%EA%B8%B0%EB%8A%A5")
  if ($resolvedSearch.Count -lt 1) {
    throw "Feedback inbox resolved/search filter did not return the triaged item."
  }
  Write-Host "feedback triage status ok: resolved=$($resolvedSearch.Count)"

  $postCommentImport = Invoke-SnapsRequest -Method "POST" -Path "/snaps/inbox/import-post-comments" -Body @{
    sources = @()
    defaultPlatform = "threads"
  }
  if ($postCommentImport.sourcePosts -ne 0 -or $postCommentImport.imported -ne 0) {
    throw "Empty connected comment import should report zero source posts and zero imports."
  }
  Write-Host "post comment empty import ok"

  $videoDraft = Invoke-SnapsRequest -Method "POST" -Path "/snaps/video/attach-to-draft" -Body @{
    videoUrl = "https://cdn.example.com/snaps-runtime-smoke.mp4"
    title = "Runtime smoke short $RuntimeSmokeId"
    caption = "Runtime smoke caption [$RuntimeSmokeId]"
    targetPlatforms = @("instagram", "youtube", "naver-blog")
    integrations = @()
    saveToMediaLibrary = $false
  }
  if (-not $videoDraft.warnings -or $videoDraft.warnings.Count -lt 1 -or $videoDraft.scheduled.Count -ne 0) {
    throw "Video draft without integrations should return warnings and no scheduled posts."
  }
  if ($null -ne $videoDraft.mediaLibraryItem) {
    throw "Video draft with saveToMediaLibrary=false should not return a media library item."
  }
  Write-Host "video draft warning ok"

  $workspaceExport = Invoke-SnapsRequest -Method "GET" -Path "/snaps/export"
  if ($workspaceExport.product -ne "snaps" -or -not $workspaceExport.sources -or -not $workspaceExport.styleExamples -or -not $workspaceExport.reports -or -not $workspaceExport.inboxItems -or $null -eq $workspaceExport.hashtagSets -or $null -eq $workspaceExport.listeningMonitors -or $null -eq $workspaceExport.replyTemplates -or $null -eq $workspaceExport.inboxNotes) {
    throw "Workspace export did not include snaps sources, style examples, reports, hashtag sets, listening monitors, inbox items, reply templates, and inbox notes."
  }
  Write-Host "workspace export ok: sources=$($workspaceExport.sources.Count), styleExamples=$($workspaceExport.styleExamples.Count)"

  $workspaceImport = Invoke-SnapsRequest -Method "POST" -Path "/snaps/import" -Body $workspaceExport
  if (
    $workspaceImport.product -ne "snaps" -or
    $null -eq $workspaceImport.sources.imported -or
    $null -eq $workspaceImport.styleExamples.imported -or
    $null -eq $workspaceImport.reports.imported -or
    $null -eq $workspaceImport.hashtagSets.imported -or
    $null -eq $workspaceImport.listeningMonitors.imported -or
    $null -eq $workspaceImport.inboxItems.imported -or
    $null -eq $workspaceImport.replyTemplates.imported -or
    $null -eq $workspaceImport.inboxNotes.imported -or
    $null -eq $workspaceImport.activity.imported
  ) {
    throw "Workspace import did not return import summaries for sources, style examples, reports, hashtag sets, listening monitors, inbox items, reply templates, inbox notes, and activity."
  }
  Write-Host "workspace import ok: sources=$($workspaceImport.sources.imported), styleExamples=$($workspaceImport.styleExamples.imported), reports=$($workspaceImport.reports.imported), hashtagSets=$($workspaceImport.hashtagSets.imported), listeningMonitors=$($workspaceImport.listeningMonitors.imported), inboxItems=$($workspaceImport.inboxItems.imported), replyTemplates=$($workspaceImport.replyTemplates.imported), inboxNotes=$($workspaceImport.inboxNotes.imported), activity=$($workspaceImport.activity.imported)"

  $activityLog = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/activity")
  if ($activityLog.Count -lt 1) {
    throw "Activity log did not include runtime smoke events."
  }
  Write-Host "activity log ok: entries=$($activityLog.Count)"

  $mutatingSmokeCompleted = $true
  } finally {
    $cleanupErrors = @()

    foreach ($itemId in $cleanupFeedbackItemIds) {
      $cleanupError = Invoke-CleanupDelete -Label "feedback item" -Path "/snaps/inbox/items/$itemId"
      if ($cleanupError) {
        $cleanupErrors += $cleanupError
      }
    }
    if ($cleanupFeedbackItemIds.Count -gt 0) {
      Write-Host "feedback smoke items cleanup ok: deleted=$($cleanupFeedbackItemIds.Count)"
    }

    $cleanupError = Invoke-CleanupDelete -Label "report RAG example" -Path $(if ($cleanupReportExampleId) { "/snaps/rag/examples/$cleanupReportExampleId" } else { $null })
    if ($cleanupError) { $cleanupErrors += $cleanupError }
    $cleanupError = Invoke-CleanupDelete -Label "source RAG example" -Path $(if ($cleanupSourceExampleId) { "/snaps/rag/examples/$cleanupSourceExampleId" } else { $null })
    if ($cleanupError) { $cleanupErrors += $cleanupError }
    $cleanupError = Invoke-CleanupDelete -Label "platform analytics report" -Path $(if ($cleanupAnalyticsReportId) { "/snaps/report/$cleanupAnalyticsReportId" } else { $null })
    if ($cleanupError) { $cleanupErrors += $cleanupError }
    $cleanupError = Invoke-CleanupDelete -Label "platform analytics warning report" -Path $(if ($cleanupAnalyticsWarningReportId) { "/snaps/report/$cleanupAnalyticsWarningReportId" } else { $null })
    if ($cleanupError) { $cleanupErrors += $cleanupError }
    $cleanupError = Invoke-CleanupDelete -Label "report" -Path $(if ($cleanupReportId) { "/snaps/report/$cleanupReportId" } else { $null })
    if ($cleanupError) { $cleanupErrors += $cleanupError }
    $cleanupError = Invoke-CleanupDelete -Label "source" -Path $(if ($cleanupSourceId) { "/snaps/source-library/$cleanupSourceId" } else { $null })
    if ($cleanupError) { $cleanupErrors += $cleanupError }

    if ($cleanupErrors.Count -gt 0) {
      $cleanupErrors | ForEach-Object { Write-Host "cleanup warning: $_" }
      if ($mutatingSmokeCompleted) {
        throw "Runtime smoke cleanup failed."
      }
    } else {
      Write-Host "runtime smoke cleanup ok"
    }
  }
}

Write-Host "verify-snaps-runtime-ok"
