$apps = @{
  "submission-api" = 3001
  "build-runner" = 3002
  "sandbox-manager" = 3003
  "load-generator-controller" = 3004
  "telemetry-ingestor" = 3005
  "correctness-engine" = 3006
  "scoring-engine" = 3007
  "leaderboard-api" = 3008
}

foreach ($app in $apps.GetEnumerator()) {
  $name = $app.Name
  $port = $app.Value
  $dir = "apps/$name"
  
  $indexTs = @"
import Fastify from 'fastify';

const fastify = Fastify({
  logger: true
});

fastify.get('/health', async (request, reply) => {
  return {
    service: '$name',
    status: 'ok',
    timestamp: new Date().toISOString()
  };
});

// Placeholder for future logic
fastify.get('/', async (request, reply) => {
  return { hello: '$name' };
});

const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT) : $port;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Server $name listening on port `${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
"@
  Set-Content -Path "$dir/src/index.ts" -Value $indexTs
}

$webPkg = Get-Content -Path "apps/web/package.json" | ConvertFrom-Json
$webPkg.name = "@benchmark/web"
$webPkg | ConvertTo-Json -Depth 10 | Set-Content -Path "apps/web/package.json"
