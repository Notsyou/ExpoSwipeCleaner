FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY package*.json ./
RUN npm install
RUN npx expo install @expo/ngrok@^4.0.1

COPY . .

ENV REACT_NATIVE_PACKAGER_HOSTNAME=10.156.88.161

EXPOSE 8081
EXPOSE 19000
EXPOSE 19001

CMD ["npx", "expo", "start", "--tunnel"]