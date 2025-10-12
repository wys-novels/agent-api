# Multi-stage build для NestJS приложения
FROM node:20-alpine AS builder

# Установка рабочей директории
WORKDIR /app

# Копирование package files
COPY package*.json ./

# Установка зависимостей
RUN npm ci --only=production && npm cache clean --force

# Копирование исходного кода
COPY . .

# Сборка приложения
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Установка рабочей директории
WORKDIR /app

# Создание пользователя для безопасности
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nestjs -u 1001

# Копирование package files
COPY package*.json ./

# Установка только production зависимостей
RUN npm ci --only=production && npm cache clean --force

# Копирование собранного приложения из builder stage
COPY --from=builder /app/dist ./dist

# Смена владельца файлов
RUN chown -R nestjs:nodejs /app
USER nestjs

# Открытие порта
EXPOSE 3000

# Переменные окружения
ENV NODE_ENV=production

# Команда запуска
CMD ["node", "dist/main.js"]
