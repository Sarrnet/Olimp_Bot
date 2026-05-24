#!/bin/sh

# Перехватываем ошибки
set -e

# Применяем миграции Prisma к базе данных
echo "Applying database migrations..."
npx prisma migrate deploy

# Запускаем приложение через exec, чтобы оно получило PID 1
# Это необходимо для правильной обработки сигналов (SIGTERM, SIGINT)
echo "Starting the application..."
exec npm start
