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

$packages = @(
  "shared-types",
  "config",
  "logger",
  "db"
)

New-Item -ItemType Directory -Force -Path "apps"
New-Item -ItemType Directory -Force -Path "packages"

foreach ($pkg in $packages) {
  $dir = "packages/$pkg"
  New-Item -ItemType Directory -Force -Path $dir
  $pkgJson = @"
{
  `"name`": `"@benchmark/$pkg`",
  `"version`": `"0.0.0`",
  `"main`": `"src/index.ts`",
  `"types`": `"src/index.ts`",
  `"dependencies`": {},
  `"devDependencies`": {
    `"typescript`": `"^5.0.0`"
  }
}
"@
  Set-Content -Path "$dir/package.json" -Value $pkgJson
  New-Item -ItemType Directory -Force -Path "$dir/src"
  Set-Content -Path "$dir/src/index.ts" -Value "// @benchmark/$pkg"
}

foreach ($app in $apps) {
  $dir = "apps/$app"
  New-Item -ItemType Directory -Force -Path $dir
  $pkgJson = @"
{
  `"name`": `"@benchmark/$app`",
  `"version`": `"0.0.0`",
  `"private`": true,
  `"scripts`": {
    `"dev`": `"ts-node src/index.ts`",
    `"build`": `"tsc`",
    `"start`": `"node dist/index.js`"
  },
  `"dependencies`": {
    `"fastify`": `"^4.0.0`",
    `"@benchmark/shared-types`": `"workspace:*`",
    `"@benchmark/config`": `"workspace:*`",
    `"@benchmark/logger`": `"workspace:*`"
  },
  `"devDependencies`": {
    `"typescript`": `"^5.0.0`",
    `"ts-node`": `"^10.9.1`",
    `"@types/node`": `"^18.0.0`"
  }
}
"@
  Set-Content -Path "$dir/package.json" -Value $pkgJson
  New-Item -ItemType Directory -Force -Path "$dir/src"
  Set-Content -Path "$dir/tsconfig.json" -Value @"
{
  `"compilerOptions`": {
    `"target`": `"ES2022`",
    `"module`": `"CommonJS`",
    `"outDir`": `"./dist`",
    `"rootDir`": `"./src`",
    `"strict`": true,
    `"esModuleInterop`": true,
    `"skipLibCheck`": true,
    `"forceConsistentCasingInFileNames`": true
  }
}
"@
}
