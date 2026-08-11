# ---------- Etapa 1: compilar el frontend ----------
FROM node:20-bookworm-slim AS frontend
WORKDIR /app/frontend
ENV NODE_OPTIONS=--max-old-space-size=1536
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund --no-progress
COPY frontend/ ./
RUN npm run build

# ---------- Etapa 2: dependencias + compilacion del backend ----------
FROM node:20-bookworm-slim AS backend
WORKDIR /app/backend
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV NODE_OPTIONS=--max-old-space-size=1536
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --no-audit --no-fund --no-progress
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

# ---------- Etapa 3: imagen final con Chrome para WhatsApp ----------
FROM ghcr.io/puppeteer/puppeteer:23.11.1
USER root
RUN ln -sf /home/pptruser/.cache/puppeteer/chrome/*/chrome-linux64/chrome /usr/bin/google-chrome
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
WORKDIR /app

COPY --from=backend /app/backend/package.json ./
COPY --from=backend /app/backend/node_modules ./node_modules
COPY --from=backend /app/backend/dist ./dist
COPY --from=frontend /app/frontend/dist ./frontend-dist

ENV PORT=4100
ENV FRONTEND_DIST=/app/frontend-dist
ENV WHATSAPP_SESION_DIR=/app/data/whatsapp
ENV CHROME_EXECUTABLE=/usr/bin/google-chrome

EXPOSE 4100

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4100/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" || exit 1

CMD ["node", "dist/src/index.js"]
