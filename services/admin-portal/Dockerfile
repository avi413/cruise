# Build static assets
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.json vite.config.ts index.html ./
RUN npm ci --no-audit --no-fund

COPY src ./src

RUN npm run build

# Serve via nginx
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
