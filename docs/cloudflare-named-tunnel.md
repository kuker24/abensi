# Cloudflare Named Tunnel — SchoolHub

Quick Tunnel `trycloudflare.com` hanya untuk trial. Untuk URL tetap:

1. Login cloudflared di VPS:
   ```bash
   cloudflared tunnel login
   ```
2. Buat tunnel:
   ```bash
   cloudflared tunnel create schoolhub-ehadir
   ```
3. Buat `/etc/cloudflared/config.yml`:
   ```yaml
   tunnel: <TUNNEL_ID>
   credentials-file: /root/.cloudflared/<TUNNEL_ID>.json
   ingress:
     - hostname: hadir.domain-sekolah.sch.id
       service: http://127.0.0.1:80
     - service: http_status:404
   ```
4. Route DNS:
   ```bash
   cloudflared tunnel route dns schoolhub-ehadir hadir.domain-sekolah.sch.id
   ```
5. Install service:
   ```bash
   cloudflared service install
   systemctl enable --now cloudflared
   ```

Butuh akses akun/domain Cloudflare sekolah, jadi langkah ini tidak dieksekusi otomatis dalam trial.
