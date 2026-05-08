$ErrorActionPreference = "Stop"

function Set-ProcessEnv {
  param(
    [string]$Name,
    [AllowNull()][string]$Value
  )

  if ($null -eq $Value) {
    Remove-Item -Path "Env:$Name" -ErrorAction SilentlyContinue
    return
  }

  Set-Item -Path "Env:$Name" -Value $Value
}

function Invoke-ExpectedFinalFailure {
  param(
    [string]$Name,
    [string[]]$Arguments,
    [string]$ExpectedText,
    [string[]]$ClearEnv = @(),
    [hashtable]$SetEnv = @{}
  )

  Write-Host "==> $Name"
  $envNames = @($ClearEnv + @($SetEnv.Keys)) | Select-Object -Unique
  $previousEnv = @{}
  foreach ($envName in $envNames) {
    $previousEnv[$envName] = [Environment]::GetEnvironmentVariable($envName)
  }

  try {
    foreach ($envName in $ClearEnv) {
      Set-ProcessEnv -Name $envName -Value $null
    }
    foreach ($envName in $SetEnv.Keys) {
      Set-ProcessEnv -Name $envName -Value $SetEnv[$envName]
    }

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      $output = & "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" `
        -ExecutionPolicy Bypass `
        -File "scripts/verify-snaps-final.ps1" `
        @Arguments 2>&1
      $exitCode = $LASTEXITCODE
      $text = $output | Out-String
    } finally {
      $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($exitCode -eq 0) {
      throw "$Name was expected to fail, but verify-snaps-final.ps1 succeeded."
    }
    if (-not $text.Contains($ExpectedText)) {
      Write-Host $text
      throw "$Name failed with an unexpected message. Expected text: $ExpectedText"
    }

    Write-Host "$Name ok"
  } finally {
    foreach ($envName in $envNames) {
      Set-ProcessEnv -Name $envName -Value $previousEnv[$envName]
    }
  }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Push-Location $repoRoot
try {
  Invoke-ExpectedFinalFailure `
    -Name "runtime smoke requires confirmation env" `
    -Arguments @("-Auth", "dummy", "-SkipPreflight", "-SkipBuild") `
    -ExpectedText "SNAPS_RUNTIME_CONFIRM is required" `
    -ClearEnv @(
      "SNAPS_RUNTIME_CONFIRM"
    )

  Invoke-ExpectedFinalFailure `
    -Name "runtime smoke requires exact confirmation" `
    -Arguments @("-Auth", "dummy", "-SkipPreflight", "-SkipBuild") `
    -ExpectedText "SNAPS_RUNTIME_CONFIRM must be set to 'smoke'" `
    -SetEnv @{
      SNAPS_RUNTIME_CONFIRM = "wrong"
    }

  Invoke-ExpectedFinalFailure `
    -Name "Ollama RAG smoke requires confirmation env" `
    -Arguments @("-Auth", "dummy", "-SkipPreflight", "-SkipBuild", "-IncludeOllama") `
    -ExpectedText "SNAPS_OLLAMA_RAG_CONFIRM is required" `
    -ClearEnv @(
      "SNAPS_OLLAMA_RAG_CONFIRM"
    )

  Invoke-ExpectedFinalFailure `
    -Name "Ollama RAG smoke requires exact confirmation" `
    -Arguments @("-Auth", "dummy", "-SkipPreflight", "-SkipBuild", "-IncludeOllama") `
    -ExpectedText "SNAPS_OLLAMA_RAG_CONFIRM must be set to 'embed'" `
    -SetEnv @{
      SNAPS_OLLAMA_RAG_CONFIRM = "wrong"
    }

  Invoke-ExpectedFinalFailure `
    -Name "connected draft requires confirmation env" `
    -Arguments @("-Auth", "dummy", "-SkipPreflight", "-SkipBuild", "-ConnectedIntegrationId", "guard-integration") `
    -ExpectedText "SNAPS_CONNECTED_DRAFT_CONFIRM is required" `
    -ClearEnv @(
      "SNAPS_CONNECTED_DRAFT_CONFIRM"
    )

  Invoke-ExpectedFinalFailure `
    -Name "connected draft requires exact confirmation" `
    -Arguments @("-Auth", "dummy", "-SkipPreflight", "-SkipBuild", "-ConnectedIntegrationId", "guard-integration") `
    -ExpectedText "SNAPS_CONNECTED_DRAFT_CONFIRM must be set to 'draft'" `
    -SetEnv @{
      SNAPS_CONNECTED_DRAFT_CONFIRM = "wrong"
    }

  Invoke-ExpectedFinalFailure `
    -Name "connected schedule requires integration id" `
    -Arguments @("-Auth", "dummy", "-SkipPreflight", "-SkipBuild", "-IncludeConnectedSchedule") `
    -ExpectedText "-IncludeConnectedSchedule requires -ConnectedIntegrationId"

  Invoke-ExpectedFinalFailure `
    -Name "connected schedule requires confirmation env" `
    -Arguments @("-Auth", "dummy", "-SkipPreflight", "-SkipBuild", "-IncludeConnectedSchedule", "-ConnectedIntegrationId", "guard-integration") `
    -ExpectedText "SNAPS_CONNECTED_SCHEDULE_CONFIRM is required" `
    -ClearEnv @(
      "SNAPS_CONNECTED_SCHEDULE_CONFIRM"
    ) `
    -SetEnv @{
      SNAPS_CONNECTED_DRAFT_CONFIRM = "draft"
    }

  Invoke-ExpectedFinalFailure `
    -Name "connected schedule requires exact confirmation" `
    -Arguments @("-Auth", "dummy", "-SkipPreflight", "-SkipBuild", "-IncludeConnectedSchedule", "-ConnectedIntegrationId", "guard-integration") `
    -ExpectedText "SNAPS_CONNECTED_SCHEDULE_CONFIRM must be set to 'schedule'" `
    -SetEnv @{
      SNAPS_CONNECTED_DRAFT_CONFIRM = "draft"
      SNAPS_CONNECTED_SCHEDULE_CONFIRM = "wrong"
    }

  Invoke-ExpectedFinalFailure `
    -Name "Naver Cafe live requires env" `
    -Arguments @("-Auth", "dummy", "-SkipPreflight", "-SkipBuild", "-IncludeNaverCafeLive") `
    -ExpectedText "NAVER_CAFE_ACCESS_TOKEN is required" `
    -ClearEnv @(
      "NAVER_CAFE_ACCESS_TOKEN",
      "NAVER_CAFE_CLUB_ID",
      "NAVER_CAFE_MENU_ID",
      "SNAPS_NAVER_CAFE_CONFIRM"
    )

  Invoke-ExpectedFinalFailure `
    -Name "Naver Cafe live requires post confirmation" `
    -Arguments @("-Auth", "dummy", "-SkipPreflight", "-SkipBuild", "-IncludeNaverCafeLive") `
    -ExpectedText "SNAPS_NAVER_CAFE_CONFIRM must be set to 'post'" `
    -SetEnv @{
      NAVER_CAFE_ACCESS_TOKEN = "guard-token"
      NAVER_CAFE_CLUB_ID = "guard-club"
      NAVER_CAFE_MENU_ID = "guard-menu"
      SNAPS_NAVER_CAFE_CONFIRM = "wrong"
    }

  Invoke-ExpectedFinalFailure `
    -Name "Pixelle direct live requires env" `
    -Arguments @("-Auth", "dummy", "-SkipPreflight", "-SkipBuild", "-IncludePixelleDirect") `
    -ExpectedText "PIXELLE_VIDEO_URL is required" `
    -ClearEnv @(
      "PIXELLE_VIDEO_URL",
      "SNAPS_PIXELLE_CONFIRM"
    )

  Invoke-ExpectedFinalFailure `
    -Name "Pixelle direct live requires generate confirmation" `
    -Arguments @("-Auth", "dummy", "-SkipPreflight", "-SkipBuild", "-IncludePixelleDirect") `
    -ExpectedText "SNAPS_PIXELLE_CONFIRM must be set to 'generate'" `
    -SetEnv @{
      PIXELLE_VIDEO_URL = "https://pixelle.example.test"
      SNAPS_PIXELLE_CONFIRM = "wrong"
    }

  Invoke-ExpectedFinalFailure `
    -Name "Pixelle server job requires env" `
    -Arguments @("-Auth", "dummy", "-SkipPreflight", "-SkipBuild", "-IncludePixelleJob") `
    -ExpectedText "PIXELLE_VIDEO_URL is required" `
    -ClearEnv @(
      "PIXELLE_VIDEO_URL",
      "SNAPS_PIXELLE_CONFIRM"
    )

  Invoke-ExpectedFinalFailure `
    -Name "Pixelle server job requires generate confirmation" `
    -Arguments @("-Auth", "dummy", "-SkipPreflight", "-SkipBuild", "-IncludePixelleJob") `
    -ExpectedText "SNAPS_PIXELLE_CONFIRM must be set to 'generate'" `
    -SetEnv @{
      PIXELLE_VIDEO_URL = "https://pixelle.example.test"
      SNAPS_PIXELLE_CONFIRM = "wrong"
    }

  Invoke-ExpectedFinalFailure `
    -Name "inbox clear requires confirmation env" `
    -Arguments @("-Auth", "dummy", "-SkipPreflight", "-SkipBuild", "-IncludeInboxClear") `
    -ExpectedText "SNAPS_INBOX_CLEAR_CONFIRM is required" `
    -ClearEnv @(
      "SNAPS_INBOX_CLEAR_CONFIRM"
    )

  Invoke-ExpectedFinalFailure `
    -Name "inbox clear requires exact confirmation" `
    -Arguments @("-Auth", "dummy", "-SkipPreflight", "-SkipBuild", "-IncludeInboxClear") `
    -ExpectedText "SNAPS_INBOX_CLEAR_CONFIRM must be set to 'clear'" `
    -SetEnv @{
      SNAPS_INBOX_CLEAR_CONFIRM = "wrong"
    }

  Invoke-ExpectedFinalFailure `
    -Name "db push requires confirmation env" `
    -Arguments @("-Auth", "dummy", "-SkipPreflight", "-SkipBuild", "-ApplyDbPush") `
    -ExpectedText "SNAPS_DB_PUSH_CONFIRM is required" `
    -ClearEnv @(
      "SNAPS_DB_PUSH_CONFIRM"
    )

  Invoke-ExpectedFinalFailure `
    -Name "db push requires exact confirmation" `
    -Arguments @("-Auth", "dummy", "-SkipPreflight", "-SkipBuild", "-ApplyDbPush") `
    -ExpectedText "SNAPS_DB_PUSH_CONFIRM must be set to 'push'" `
    -SetEnv @{
      SNAPS_DB_PUSH_CONFIRM = "wrong"
    }

  Invoke-ExpectedFinalFailure `
    -Name "mutating runtime smoke requires confirmation env" `
    -Arguments @("-Auth", "dummy", "-SkipPreflight", "-SkipBuild", "-IncludeMutating") `
    -ExpectedText "SNAPS_MUTATING_CONFIRM is required" `
    -ClearEnv @(
      "SNAPS_MUTATING_CONFIRM"
    )

  Invoke-ExpectedFinalFailure `
    -Name "mutating runtime smoke requires exact confirmation" `
    -Arguments @("-Auth", "dummy", "-SkipPreflight", "-SkipBuild", "-IncludeMutating") `
    -ExpectedText "SNAPS_MUTATING_CONFIRM must be set to 'mutate'" `
    -SetEnv @{
      SNAPS_MUTATING_CONFIRM = "wrong"
    }

  Write-Host "verify-snaps-final-guards-ok"
} finally {
  Pop-Location
}
