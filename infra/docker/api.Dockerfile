FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json ./
COPY tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/db/package.json ./packages/db/package.json

RUN npm install

COPY . .

RUN npm run db:generate

WORKDIR /app/apps/api
EXPOSE 4000
CMD ["npm", "run", "dev"]
