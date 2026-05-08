param(
  [string]$BaseUrl = "http://localhost:11434",
  [string]$ChatModel = "qwen3.5:9b",
  [string]$EmbedModel = "nomic-embed-text:latest"
)

$ErrorActionPreference = "Stop"

function Invoke-OllamaJson {
  param(
    [string]$Method,
    [string]$Path,
    [object]$Body = $null,
    [int]$TimeoutSec = 60
  )

  $params = @{
    Method = $Method
    Uri = "$BaseUrl$Path"
    TimeoutSec = $TimeoutSec
  }

  if ($null -ne $Body) {
    $params.ContentType = "application/json"
    $params.Body = ($Body | ConvertTo-Json -Depth 20)
  }

  Invoke-RestMethod @params
}

Write-Host "snaps Ollama smoke: $BaseUrl"

$tags = Invoke-OllamaJson -Method "GET" -Path "/api/tags" -TimeoutSec 10
$modelNames = @($tags.models | ForEach-Object { $_.name })
if ($modelNames -notcontains $ChatModel) {
  throw "Missing chat model: $ChatModel"
}
if ($modelNames -notcontains $EmbedModel) {
  throw "Missing embed model: $EmbedModel"
}
Write-Host "models ok: $($modelNames -join ', ')"

$chat = Invoke-OllamaJson -Method "POST" -Path "/api/chat" -TimeoutSec 120 -Body @{
  model = $ChatModel
  stream = $false
  think = $false
  format = "json"
  messages = @(
    @{
      role = "system"
      content = "Return JSON only."
    },
    @{
      role = "user"
      content = '{"ok":true,"service":"snaps"}'
    }
  )
  options = @{
    temperature = 0
    num_predict = 128
  }
}

if (-not $chat.message.content) {
  throw "Ollama chat returned no final content. Thinking may not be disabled."
}

$parsed = $chat.message.content | ConvertFrom-Json
if ($parsed.ok -ne $true -or $parsed.service -ne "snaps") {
  throw "Unexpected chat JSON: $($chat.message.content)"
}
Write-Host "chat ok: think=false produced final JSON"

$transform = Invoke-OllamaJson -Method "POST" -Path "/api/chat" -TimeoutSec 120 -Body @{
  model = $ChatModel
  stream = $false
  think = $false
  format = "json"
  messages = @(
    @{
      role = "system"
      content = "Return JSON only with a variants array. Each variant must include platform and content."
    },
    @{
      role = "user"
      content = (@{
        sourceText = "이번 주 신제품 업데이트와 고객 반응을 짧게 정리합니다."
        targetPlatforms = @("threads", "instagram")
        outputShape = @{
          variants = @(
            @{
              platform = "threads"
              content = "text"
            }
          )
        }
      } | ConvertTo-Json -Depth 10)
    }
  )
  options = @{
    temperature = 0
    num_predict = 512
  }
}

if (-not $transform.message.content) {
  throw "Ollama transform-shape smoke returned no final content."
}

$transformJson = $transform.message.content | ConvertFrom-Json
if (-not $transformJson.variants -or $transformJson.variants.Count -lt 2) {
  throw "Ollama transform-shape smoke returned fewer than two variants: $($transform.message.content)"
}
Write-Host "transform shape ok: variants=$($transformJson.variants.Count)"

$embed = Invoke-OllamaJson -Method "POST" -Path "/api/embed" -TimeoutSec 60 -Body @{
  model = $EmbedModel
  input = "snaps embedding smoke test"
}

if (-not $embed.embeddings -or $embed.embeddings.Count -lt 1 -or $embed.embeddings[0].Count -lt 1) {
  throw "Ollama embed returned no vectors."
}
Write-Host "embed ok: embeddings=$($embed.embeddings.Count), dims=$($embed.embeddings[0].Count)"

Write-Host "verify-snaps-ollama-ok"
