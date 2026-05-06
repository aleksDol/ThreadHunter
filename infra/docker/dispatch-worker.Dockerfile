FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json ./
COPY tsconfig.base.json ./
COPY apps/dispatch-worker/package.json ./apps/dispatch-worker/package.json
COPY packages/db/package.json ./packages/db/package.json

RUN npm install

COPY . .

RUN npm run db:generate

WORKDIR /app/apps/dispatch-worker
CMD ["npm", "run", "dev"]
