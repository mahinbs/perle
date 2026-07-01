## Nginx setup for `api.syntraiq.ai`

This repo’s backend listens on `http://localhost:3333`. The config in `nginx/api.syntraiq.ai.conf` makes it available publicly at **`https://api.syntraiq.ai`** via Nginx.

### Prereqs

- DNS: `api.syntraiq.ai` A/AAAA record points to your server.
- Backend running on the same machine: `npm --prefix server run start` (or your process manager).
- Nginx installed.

### Install the site config (Ubuntu/Debian)

```bash
sudo mkdir -p /var/www/_letsencrypt
sudo cp nginx/api.syntraiq.ai.conf /etc/nginx/sites-available/api.syntraiq.ai
sudo ln -s /etc/nginx/sites-available/api.syntraiq.ai /etc/nginx/sites-enabled/api.syntraiq.ai
sudo nginx -t && sudo systemctl reload nginx
```

### Add HTTPS (Certbot)

If you use Certbot:

```bash
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.syntraiq.ai
```

Then verify:

```bash
curl -sS https://api.syntraiq.ai/api/health
```

