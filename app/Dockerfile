FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY app/ ./app/
COPY client/ ./client/

EXPOSE 3000

CMD ["node", "app/server.js"]