# Distributed Benchmark Platform - Phase 1

This repository contains the architecture skeleton and local dev foundation for the distributed benchmark platform.

## Prerequisites
- Docker & Docker Compose
- Node.js 18+
- pnpm 9+

## Initial Setup

1. Install dependencies:
```bash
pnpm install
```

2. Setup environment variables:
```bash
cp .env.example .env
```

3. Generate the Prisma Client locally:
```bash
pnpm --filter=@benchmark/db run db:generate
```

4. Initialize the Database and Prisma Schema (Requires running Postgres via Docker):
```bash
pnpm --filter=@benchmark/db run db:push
```

## Running Locally

1. Ensure Docker Desktop (or your Docker daemon) is running, then start Postgres and Redis:
```bash
docker-compose up -d postgres redis
```
*(Note: You can also run all backend services via `docker-compose up --build`, but for active development, running them locally with Turborepo is recommended.)*

2. Start all backend APIs and the frontend in development mode:
```bash
pnpm dev
```

3. View the system status dashboard:
Open `http://localhost:5173` in your browser.

## Monorepo Commands
- `pnpm build`: Compile all packages and apps via Turborepo
- `pnpm dev`: Start all apps in watch mode
- `pnpm lint`: Run linting across the monorepo
- `pnpm format`: Format all files with Prettier

## System Architecture

The workspace is divided into `apps` and `packages`.
- **Frontend**: `apps/web` (Vite + React)
- **Backend**: Fastify services in `apps/*`
- **Shared Packages**: `packages/*` including types, config, logger, and database schema.

*Note: This is Phase 1. Features like container builds, sandbox isolation, and load generation are intentionally deferred for future phases.*
