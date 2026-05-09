$apps = @(
  "submission-api",
  "build-runner",
  "sandbox-manager",
  "load-generator-controller",
  "telemetry-ingestor",
  "correctness-engine",
  "scoring-engine",
  "leaderboard-api"
)

foreach ($app in $apps) {
  $dir = "apps/$app"
  
  # Install cors
  Set-Location -Path "c:\IICPC SUMMER PROJECT\$dir"
  pnpm add @fastify/cors
  
  # Update index.ts
  $indexTsPath = "src/index.ts"
  $content = Get-Content -Path $indexTsPath -Raw
  
  if ($content -notmatch "@fastify/cors") {
    $newContent = $content -replace "const fastify = Fastify\(\{", "import cors from '@fastify/cors';`n`nconst fastify = Fastify({"
    $newContent = $newContent -replace "fastify\.get\('/health'", "fastify.register(cors, { origin: true });`n`nfastify.get('/health'"
    Set-Content -Path $indexTsPath -Value $newContent
  }
}

Set-Location -Path "c:\IICPC SUMMER PROJECT"
