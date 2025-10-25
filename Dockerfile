FROM node:20-slim

# Установим OpenVPN, cron и утилиты
RUN apt-get update && apt-get install -y openvpn iproute2 cron && apt-get clean

# Рабочая директория
WORKDIR /app

# Скопируем проект
COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
COPY .env ./

# === Крон-задача ===
# - каждые 4 часа
# - сначала npm run parse
# - после успешного завершения — npm run linux
RUN echo "0 */4 * * * cd /app && npm run parse && npm run linux >> /var/log/cron.log 2>&1" > /etc/cron.d/vpn-cron \
    && chmod 0644 /etc/cron.d/vpn-cron \
    && crontab /etc/cron.d/vpn-cron

# Создаём лог-файл, чтобы cron мог писать в него
RUN touch /var/log/cron.log

# === Первый запуск при старте контейнера ===
# cron запустится в фоне, но перед этим мы сразу выполним первый цикл вручную
CMD bash -c "npm run parse && npm run linux && cron && tail -f /var/log/cron.log"
