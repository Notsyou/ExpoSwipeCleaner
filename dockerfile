FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY package*.json ./
COPY patches ./patches
RUN npm install

COPY . .

ENV REACT_NATIVE_PACKAGER_HOSTNAME=10.156.88.161

EXPOSE 8081
EXPOSE 19000
EXPOSE 19001

CMD ["npx", "expo", "start", "--host", "lan"]