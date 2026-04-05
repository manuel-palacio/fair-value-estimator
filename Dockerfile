# Stage 1: install Python dependencies (Alpine so musl-linked wheels are used)
FROM python:3.12-alpine AS py-builder
COPY api/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --target=/py-pkgs -r /tmp/requirements.txt

# Stage 2: final image
FROM nginx:alpine

# Python runtime + supervisord
RUN apk add --no-cache python3 supervisor

# Copy installed packages from builder and expose to Python
COPY --from=py-builder /py-pkgs /usr/lib/python3/site-packages
ENV PYTHONPATH=/usr/lib/python3/site-packages

# API source
COPY api/ /api/

# nginx config + static files
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY supervisord.conf /etc/supervisord.conf
COPY index.html valuation.js favicon.svg /usr/share/nginx/html/

EXPOSE 80
CMD ["supervisord", "-c", "/etc/supervisord.conf"]
