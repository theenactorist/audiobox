# Build stage — compile the Vite client
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Production stage — run the Express server
FROM node:20-alpine
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Install server dependencies
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# Copy server code
COPY server/ ./server/

# Copy built client from build stage
COPY --from=client-build /app/client/dist ./client/dist

# Set working directory to server
WORKDIR /app/server

ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "server.js"]
