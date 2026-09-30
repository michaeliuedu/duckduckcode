#!/bin/sh
# Renders the nginx config and the browser's runtime configuration from the
# environment, so one built image serves local Docker and every AWS environment
# without a rebuild.
set -eu

: "${PORT:=3000}"
: "${BACKEND_PUBLIC_URL:=}"
export PORT

# Only $PORT is substituted; every other $variable in the template is nginx's own.
envsubst '$PORT' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# BACKEND_PUBLIC_URL ends up inside a JavaScript string literal, so it is
# validated rather than escaped: a value that is not plainly an absolute http(s)
# URL is refused and the app falls back to same-origin, which is the correct
# production setting anyway. The accepted character set excludes quotes and
# backslashes, so the literal below is safe by construction.
backend_url=""
if [ -n "$BACKEND_PUBLIC_URL" ]; then
  if printf '%s' "$BACKEND_PUBLIC_URL" | grep -Eq '^https?://[A-Za-z0-9._~:/?#@!$&+,;=%-]+$'; then
    backend_url="$BACKEND_PUBLIC_URL"
  else
    echo "frontend: BACKEND_PUBLIC_URL is not a plain absolute http(s) URL; using same origin" >&2
  fi
fi

cat > /usr/share/nginx/html/runtime-config.js <<EOF
// Written by docker-entrypoint.sh from BACKEND_PUBLIC_URL. Empty = same origin.
window.__DUCKDUCKCODE__ = { backendUrl: "${backend_url}" };
EOF

echo "frontend: listening on ${PORT}, backend \"${backend_url:-<same origin>}\"" >&2
exec nginx -g 'daemon off;'
