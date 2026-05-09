FROM node:18-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9.0.0

# Copy workspace setup
COPY pnpm-lock.yaml* pnpm-workspace.yaml package.json turbo.json ./
COPY packages ./packages
COPY apps ./apps

ARG APP_NAME
ENV APP_NAME=${APP_NAME}

# Install dependencies for the whole workspace
RUN pnpm install

# Build the specific app and its dependencies
RUN pnpm turbo run build --filter=@benchmark/${APP_NAME}...

# Set working directory to the app
WORKDIR /app/apps/${APP_NAME}

EXPOSE ${PORT:-3000}

# Since we use ts-node in dev, we can just run start or dev.
# In a real production environment we would build to JS and run node dist/index.js
CMD ["pnpm", "start"]
