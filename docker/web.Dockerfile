FROM node:24-alpine AS base
RUN corepack enable

FROM base AS pruner
WORKDIR /app
COPY . .
RUN npx turbo prune @zelo/web --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm exec turbo run build --filter=@zelo/web

FROM nginx:1.27-alpine AS runner
COPY --from=installer /app/apps/web/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/nginx-security-headers.conf /etc/nginx/security-headers.conf
EXPOSE 80
