# Образ сервера «Рядом»: Node.js LTS на Alpine
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

# Сначала только зависимости – слой кэшируется, пока не меняется package-lock.json
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# Не от root
USER node
EXPOSE 3000

# node – первый процесс в контейнере и сам получает SIGTERM (см. shutdown в server.js)
CMD ["node", "src/server.js"]
