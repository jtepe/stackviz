FROM docker.io/library/node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY test ./test
RUN npm run build

FROM docker.io/library/nginx:1.29-alpine-slim
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
