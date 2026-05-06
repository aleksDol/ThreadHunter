FROM node:20-alpine
WORKDIR /app

COPY package.json ./
COPY tsconfig.base.json ./
COPY apps/verify-bot/package.json ./apps/verify-bot/package.json

RUN npm install

COPY . .

WORKDIR /app/apps/verify-bot
CMD ["npm", "run", "dev"]
