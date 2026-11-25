# ntfy 推送服务（由 scripts/render-deploy.mjs 生成，请勿手改）
# ntfy 不支持子路径，必须独占主机名；WebSocket 需要 Upgrade 透传。

server {
    listen 80;
    server_name {{NTFY_DOMAIN}};

    location /.well-known/acme-challenge/ {
        root {{NTFY_STATIC_ROOT}};
        default_type text/plain;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    http2 on;
    server_name {{NTFY_DOMAIN}};

    ssl_certificate     {{CERT_DIR}}/{{NTFY_DOMAIN}}/fullchain.pem;
    ssl_certificate_key {{CERT_DIR}}/{{NTFY_DOMAIN}}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL_ntfy:10m;

    client_max_body_size 4m;

    location / {
        proxy_pass http://127.0.0.1:{{NTFY_PORT}};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
