FROM node:18-alpine
WORKDIR /app
COPY package.json ./
COPY bot.js ./
CMD ["node", "bot.js"]
