# Build static assets
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json tsconfig.json vite.config.ts index.html ./
# Don't copy the lockfile here: when building on arm64/alpine (musl),
# Rollup needs a different optional native package than x64/glibc.
# Using `npm install` lets npm resolve the correct optional dependency
# for the build platform.
RUN npm install --no-audit --no-fund

COPY src ./src

RUN npm run build

# Serve via nginx
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
