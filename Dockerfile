# syntax=docker/dockerfile:1
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node index.js ./
COPY --chown=node:node models ./models
COPY --chown=node:node config ./config
COPY --chown=node:node views ./views
COPY --chown=node:node public ./public
USER node
EXPOSE 3000
CMD ["node", "index.js"]
