FROM node:20-trixie-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends imagemagick \
  && rm -rf /var/lib/apt/lists/* \
  && chown node:node /app

USER node

EXPOSE 2121
EXPOSE 10022-10024

COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node . .

CMD ["node", "index.js"]
