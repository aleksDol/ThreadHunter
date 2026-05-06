FROM node:20-alpine
WORKDIR /app

COPY package.json ./
COPY tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/package.json

RUN npm install

COPY . .

WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npm", "run", "dev"]
