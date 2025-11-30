# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --production=false
COPY tsconfig.json ./
COPY src ./src
COPY config ./config
RUN npm run build

# Runtime stage
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
COPY --from=build /app/config ./config
RUN npm install --omit=dev
# Allow users to mount their own config/state
VOLUME ["/app/config", "/app/data"]
CMD ["node", "dist/index.js"]
