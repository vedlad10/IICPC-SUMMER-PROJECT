# IICPC Distributed Benchmark Arena
A high-performance distributed benchmarking and hosting platform designed to provide a fair, deterministic, and high-credibility proving ground for trading infrastructure and matching engines.

## Why it exists
Benchmarking low-latency systems is notoriously difficult. Noisy neighbors, non-deterministic environments, and inconsistent traffic patterns often distort results. The Arena provides a strictly isolated sandbox and a high-fidelity bot fleet to measure the true performance of systems code where every nanosecond counts.

- **Determinism**: Isolated environments ensure that performance delta is code-driven, not infra-driven.
- **Fairness**: Strict resource pinning (CPU/RAM) prevents hardware-level interference.
- **Transparency**: Every run generates a full forensic dossier with p99 telemetry and correctness audits.

## Core Capabilities
- **Submission Pipeline**: Ingests compressed engine artifacts (zip/tar) with manifest-driven configuration.
- **Telemetry Stack**: Real-time event streaming via **Redpanda** (Kafka API) with long-term storage in **QuestDB** (ILP).
- **Performance Scoring**: Composite scoring based on throughput/latency ratios and deterministic correctness multipliers.
- **Competitive Leaderboard**: Global rankings powered by **Redis Sorted Sets** for sub-millisecond ranking updates.
- **Premium Arena UI**: A high-density "Bloomberg Terminal" style dashboard for live monitoring and engine inspection.

## Architecture
The system follows a reactive microservices architecture orchestrated by a central pipeline state machine.

`Submission → Build → Sandbox → Benchmark → Telemetry → Scoring → Leaderboard → UI`

### Service Catalog
- **submission-api**: Entry point for artifacts; orchestrates the 15s simulated pipeline lifecycle.
- **telemetry-ingestor**: Consumes raw latency events from Redpanda and writes to QuestDB using Influx Line Protocol.
- **scoring-engine**: Aggregates QuestDB metrics (p99, throughput) and computes the final Arena Score.
- **leaderboard-api**: Manages the Redis ZSET rankings and provides aggregate system overview metrics.
- **load-generator-controller**: Manages the bot fleet and traffic scenarios (Stress, Smoke, Burst).
- **reference-engine**: A baseline C++ matching engine used to validate the platform’s measurement accuracy.
- **web**: The React + Vite frontend dashboard.

## Monorepo Structure
```text
/
├── apps/
│   ├── web/                    # Premium React Arena Dashboard
│   ├── submission-api/         # Ingestion & Pipeline Orchestration
│   ├── leaderboard-api/        # Redis Ranking & Metrics
│   ├── scoring-engine/         # Percentile-based scoring logic
│   ├── telemetry-ingestor/     # Redpanda -> QuestDB bridge
│   ├── load-generator/         # High-concurrency bot fleet
│   └── reference-engine/       # C++ baseline engine
├── packages/
│   ├── db/                     # Prisma schema & Postgres client
│   ├── shared-types/           # Common Order/Fill/Run protocols
│   ├── config/                 # Service-level environment presets
│   └── logger/                 # Structured JSON logging
├── docker-compose.yml          # Postgres, Redis, Redpanda, QuestDB
└── sample-engine.zip           # Reference submission template
```

## Tech Stack
- **Backend**: Node.js 18+ (TS), Fastify, Prisma.
- **Performance**: C++ (Reference Engine), Redpanda (Messaging), QuestDB (Time-series).
- **Caching**: Redis (ZSET Rankings).
- **Frontend**: React, Vite, Framer Motion, Lucide.
- **Infra**: Docker Compose, PostgreSQL.

## How Scoring Works
The Arena uses a composite formula to rank engines based on efficiency under pressure:

`Score = (Throughput_RPS / p99_Latency_MS) * Correctness_Multiplier`

- **Correctness Multiplier**: 
  - `1.0x` (Platinum): 100% compliance.
  - `0.7x` (Gold): Pass with minor warnings.
  - `0.0x` (Disqualified): Protocol or determinism violation.

## Dashboard Experience
The UI is built for "nanosecond warfare" visibility:
- **/overview**: High-level cluster KPIs (Total TPS, Node Health).
- **/leaderboard**: Asymmetrical podium with sparkline trends and live activity feed.
- **/submissions**: Full list of historical deployments and rankings.
- **/runs/:id**: The **Performance Dossier**—detailed p95/p99 histograms and audit logs.
- **/pipeline/:id**: Real-time visualization of the build/sandbox/benchmark lifecycle.
- **/upload**: Submit new engines with manifest validation.

## Getting Started

### 1. Bootstrap Infrastructure
Ensure Docker is running, then start the data plane:
```bash
docker-compose up -d postgres redis redpanda questdb
```

### 2. Install & Generate
```bash
pnpm install
pnpm --filter=@benchmark/db run db:generate
pnpm --filter=@benchmark/db run db:push
```

### 3. Run the Arena
Start all services in development mode:
```bash
pnpm dev
```

### 4. Trigger a Benchmark
1. Navigate to `http://localhost:5173/upload`.
2. Upload `sample-engine.zip`.
3. Wait 15 seconds for the simulated pipeline to complete.
4. View your rank in the Arena Standings.

## Current Status
- **Production-Ready**: Telemetry ingestion, Leaderboard (Redis), and Frontend UI.
- **Functional MVP**: Scoring logic, metadata retrieval, and orchestrator simulation.
- **Simulated (Phase 6)**: The Docker Build and Sandbox Isolation steps are currently handled via a stateful simulator in `submission-api`. 
- **Next**: Integration of real Firecracker MicroVMs for Phase 7 resource isolation.

## What makes this interesting
The platform doesn't just measure speed; it measures **consistency**. By combining time-series telemetry (QuestDB) with a competitive ranking system (Redis), it transforms dry systems engineering into a high-stakes arena.

---
© 2026 IICPC Summer Hackathon. Built for performance.
