# Stage 1: Build Frontend and Backend
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root and workspace definitions
COPY package.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

# Install all dependencies across workspaces
RUN npm install

# Copy source trees
COPY server ./server
COPY client ./client
COPY tsconfig.json ./

# Build client (outputs static files directly to server/dist/public)
RUN npm --prefix client run build

# Build server TypeScript (outputs to server/dist)
RUN npm --prefix server run build

# Stage 2: Production Runtime
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json ./
COPY server/package.json ./server/

# Install production dependencies only
RUN npm --prefix server install --omit=dev

# Copy compiled artifacts from builder
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./server/dist/public
COPY --from=builder /app/server/src/db/schema.sql ./server/dist/db/schema.sql
COPY scripts ./scripts
COPY tsconfig.json ./

EXPOSE 3000

CMD ["node", "server/dist/index.js"]
