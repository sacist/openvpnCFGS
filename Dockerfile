FROM node:20-slim

# Установим OpenVPN и нужные утилиты
RUN apt-get update && apt-get install -y openvpn iproute2 && apt-get clean

# Рабочая директория
WORKDIR /app

# Скопируем проект
COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
COPY cfg ./cfg
COPY .env ./

# Сборка TypeScript
RUN npx tsc

# Стартовый скрипт запуска VPN и Node.js
CMD ["node", "dist/index.js"]
