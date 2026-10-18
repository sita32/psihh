# Образ сервера «Рядом»: Node.js LTS на Alpine
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

# Сначала только зависимости – слой кэшируется, пока не меняется package-lock.json
COPY package.json package-lock.json ./
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
