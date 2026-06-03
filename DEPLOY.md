# Инструкция по деплою Olimp Bot

## 1. Подготовка сервера (Ubuntu)
Обновите систему и установите Docker:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose git
sudo systemctl enable --now docker
```

## 2. Клонирование и настройка
Склонируйте репозиторий и создайте файл окружения:

```bash
git clone <URL_ВАШЕГО_РЕПОЗИТОРИЯ>
cd olimp_bot/height-olimp-ts
cp .env.example .env
nano .env
```

**Важно:** Убедитесь, что в `.env` заполнены:
- `TELEGRAM_TOKEN` (от BotFather)
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `AI_API_KEY` (Mistral API)
- `PAYMENT_TOKEN_...` (хотя бы один провайдер для платежей)

## 3. Запуск приложения
Запустите Docker-контейнеры в фоновом режиме:

```bash
docker-compose up -d --build
```

---

# Основные Docker команды

### Управление контейнерами
- `docker-compose up -d` — запуск всех сервисов в фоне.
- `docker-compose down` — остановка и удаление контейнеров.
- `docker-compose restart bot` — перезапуск только бота.
- `docker-compose logs -f bot` — просмотр логов бота в реальном времени.
- `docker-compose ps` — проверка статуса контейнеров.

### Работа с базой данных (Prisma)
Команды выполняются внутри контейнера бота:

- **Применить миграции (deploy):** 
  *Обычно выполняется автоматически при старте через `start.sh`.*
  ```bash
  docker-compose exec bot npx prisma migrate deploy
  ```

- **Создать новую миграцию (после изменения `schema.prisma`):**
  ```bash
  docker-compose exec bot npx prisma migrate dev --name descriptive_name
  ```

- **Принудительная генерация клиента:**
  ```bash
  docker-compose exec bot npx prisma generate
  ```

- **Просмотр базы через Prisma Studio:**
  (На сервере потребуется проброс портов или VPN, так как Studio запускается на localhost:5555)
  ```bash
  docker-compose exec bot npx prisma studio
  ```

### Очистка ресурсов
Если место на диске заканчивается:
```bash
docker system prune -a  # Удалит неиспользуемые образы и контейнеры
```
