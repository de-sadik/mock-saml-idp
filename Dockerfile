FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime stage ----
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Bind to all interfaces so the container port is reachable
ENV HOST=0.0.0.0
ENV PORT=7000

EXPOSE 7000

CMD ["node", "dist/bin.js"]
