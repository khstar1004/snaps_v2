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
    return @()
  }
  if ($Value -is [System.Array]) {
    return $Value
  }
  return @($Value)
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
    publishDate = (Get-Date).AddHours(2).ToString("o")
  }
  if (-not $scheduled.scheduled -or $scheduled.scheduled.Count -lt 1) {
    throw "Connected-channel schedule smoke did not create a connected scheduled post."
  }
  Write-Host "connected-channel schedule ok: platform=$ConnectedPlatform scheduled=$($scheduled.scheduled.Count)"
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

  $questionItems = Convert-ToArray (Invoke-SnapsRequest -Method "GET" -Path "/snaps/inbox/items?sentiment=question")
  if ($questionItems.Count -lt 1) {
    throw "Feedback inbox question filter did not return imported questions."
  }
  Write-Host "feedback list filter ok: questions=$($questionItems.Count)"

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
  if ($workspaceExport.product -ne "snaps" -or -not $workspaceExport.sources -or -not $workspaceExport.styleExamples -or -not $workspaceExport.reports -or -not $workspaceExport.inboxItems) {
    throw "Workspace export did not include snaps sources, style examples, reports, and inbox items."
  }
  Write-Host "workspace export ok: sources=$($workspaceExport.sources.Count), styleExamples=$($workspaceExport.styleExamples.Count)"

  $workspaceImport = Invoke-SnapsRequest -Method "POST" -Path "/snaps/import" -Body $workspaceExport
  if (
    $workspaceImport.product -ne "snaps" -or
    $null -eq $workspaceImport.sources.imported -or
    $null -eq $workspaceImport.styleExamples.imported -or
    $null -eq $workspaceImport.reports.imported -or
    $null -eq $workspaceImport.inboxItems.imported -or
    $null -eq $workspaceImport.activity.imported
  ) {
    throw "Workspace import did not return import summaries for sources, style examples, reports, inbox items, and activity."
  }
  Write-Host "workspace import ok: sources=$($workspaceImport.sources.imported), styleExamples=$($workspaceImport.styleExamples.imported), reports=$($workspaceImport.reports.imported), inboxItems=$($workspaceImport.inboxItems.imported), activity=$($workspaceImport.activity.imported)"

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
