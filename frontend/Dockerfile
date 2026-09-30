# syntax=docker/dockerfile:1

# ---- deps ------------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- build -----------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Typecheck then bundle: a type error should fail the image, not ship in it.
RUN npm run build

# ---- runtime ---------------------------------------------------------------
# A static bundle needs a file server, not a Node process: smaller image, no
# server-side surface, and the SPA fallback is one nginx directive.
FROM nginx:1.29-alpine AS runtime
ENV PORT=3000 BACKEND_PUBLIC_URL=""

RUN apk add --no-cache gettext

COPY nginx/nginx.conf.template /etc/nginx/nginx.conf.template
COPY docker-entrypoint.sh /docker-entrypoint-duckduckcode.sh
COPY --from=build /app/dist /usr/share/nginx/html

# nginx must be able to write its rendered config, its pid and its temp dirs as
# an unprivileged user.
RUN chmod +x /docker-entrypoint-duckduckcode.sh \
 && chown -R nginx:nginx /usr/share/nginx/html /etc/nginx /var/cache/nginx

USER nginx
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1

ENTRYPOINT ["/docker-entrypoint-duckduckcode.sh"]
