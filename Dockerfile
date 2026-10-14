FROM node:22-bookworm-slim AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV STUDIO_DATA_DIR=/data

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=frontend-build /app/frontend/dist/frontend/browser /app/frontend/dist/frontend/browser

RUN mkdir -p /data/uploads
VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "index.js"]