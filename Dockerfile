# Use Playwright’s official container
FROM mcr.microsoft.com/playwright:latest

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy the rest of the project
COPY . .

# Expose the port your app uses
EXPOSE 10000
ENV PORT=10000

# Start the server
CMD ["node", "server.js"]
