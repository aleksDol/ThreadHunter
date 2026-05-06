FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json ./
COPY tsconfig.base.json ./
COPY apps/ai-worker/package.json ./apps/ai-worker/package.json
COPY packages/db/package.json ./packages/db/package.json

RUN npm install

COPY . .

RUN npm run db:generate

WORKDIR /app/apps/ai-worker
CMD ["npm", "run", "dev"]
