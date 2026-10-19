# Образ сервера «Рядом»: Node.js LTS на Alpine.
# Две цели: test – с Jest и supertest (docker compose --profile test run --rm tests),
# production (последняя, по умолчанию) – только то, что нужно серверу.
FROM node:24-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./

# ---------- Тесты ----------
FROM base AS test
ENV NODE_ENV=test
RUN npm ci && npm cache clean --force
COPY src ./src
COPY tests ./tests
COPY demo-files ./demo-files
CMD ["npm", "test"]

# ---------- Сервер ----------
FROM base AS production
ENV NODE_ENV=production

# Сначала только зависимости – слой кэшируется, пока не меняется package-lock.json
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY demo-files ./demo-files

# Папка для загруженных файлов (в docker-compose сюда подключается том uploads)
RUN mkdir -p /app/uploads && chown node:node /app/uploads

# Не от root
USER node
EXPOSE 3000

# node – первый процесс в контейнере и сам получает SIGTERM (см. shutdown в server.js)
CMD ["node", "src/server.js"]
