# Dockerfile
FROM mcr.microsoft.com/playwright:latest

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy the rest of your project
COPY . .

EXPOSE 10000
ENV PORT=10000

CMD ["node", "server.js"]
