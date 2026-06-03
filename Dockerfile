FROM node:22-bookworm-slim

WORKDIR /app

# Install system dependencies for node-canvas
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Add environment variables for Prisma generation during build
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

# Install dependencies first
COPY package*.json ./
RUN npm ci

COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build the project
RUN npm run build

# Copy non-TS files (locales, data, and assets) to dist
RUN mkdir -p dist/locales dist/data dist/assets "dist/exercises pictures" && \
    cp src/locales/*.json dist/locales/ && \
    cp src/data/*.json dist/data/ && \
    cp -r assets/* dist/assets/ && \
    cp -r "exercises pictures"/* "dist/exercises pictures/"

# Make start script executable
RUN chmod +x start.sh

# Start using the script to handle migrations
CMD ["./start.sh"]
