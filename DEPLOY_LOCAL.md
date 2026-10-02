# Deploy Retro Dubai on a local server (agent runbook)

Instructions for an autonomous agent (e.g. Nous Hermes Agent) with shell access on a Linux server (Ubuntu/Debian assumed). Follow the steps in order, run every **Check**, and stop and report if a check fails.

Retro Dubai is a static site: no build step, no database, no API keys. The server only has to serve files over HTTPS and refresh one data file nightly. The browser loads map tiles, fonts, MapLibre and routing from public internet services, so the phones using it need internet access.

## Rules for the agent

- Do not use `sudo rm -rf`, do not change the firewall beyond opening the port named here, and do not touch other sites already served on this machine. If port 80/443 or 8443 is taken, pick the next free port and report it.
- Live GPS only works on **HTTPS** or on `http://localhost`. Plain `http://<LAN-IP>` loads the map but phones will refuse location. Step 4 sets up HTTPS; do not skip it.
- Report at the end: the URL(s), the port, where the files live, how HTTPS is provided, and the output of every check.

## 1. Install prerequisites

```sh
sudo apt-get update
sudo apt-get install -y git curl debian-keyring debian-archive-keyring apt-transport-https
# Node.js 22 (only needed for the nightly data refresh)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
# Caddy web server (automatic HTTPS)
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```

**Check:** `node -v` prints v22 or newer; `caddy version` prints a version; `systemctl is-active caddy` prints `active`.

## 2. Get the code

```sh
sudo mkdir -p /srv/retro-dubai
sudo chown "$USER" /srv/retro-dubai
git clone https://github.com/ikhanai777/RetroMaps.git /srv/retro-dubai
```

**Check:** `ls /srv/retro-dubai` shows `index.html`, `js/`, `css/`, `data/restaurants.json`.

## 3. Refresh the restaurant data once

```sh
cd /srv/retro-dubai && node scripts/fetch-restaurants.mjs
```

**Check:** prints `Wrote N places` with N above 3000. If Overpass rate-limits (429), wait 2 minutes and retry once; the committed `data/restaurants.json` still works if it keeps failing.

## 4. Serve it over HTTPS with Caddy

Pick **one** option, matching how people will reach the server.

### Option A: the server has a public domain name (best)

Point a DNS A record (e.g. `retrodubai.example.com`) at the server, open ports 80 and 443, then write `/etc/caddy/Caddyfile`:

```
retrodubai.example.com {
	root * /srv/retro-dubai
	file_server
	encode gzip
	@data path /data/*
	header @data Cache-Control "no-cache"
	header Permissions-Policy "geolocation=(self)"
}
```

Caddy gets a real Let's Encrypt certificate automatically.

### Option B: only inside the local network (no domain)

Use Caddy's internal certificate authority on port 8443. Replace `192.168.1.50` with the server's LAN IP (`hostname -I | awk '{print $1}'`):

```
https://192.168.1.50:8443, https://localhost:8443 {
	tls internal
	root * /srv/retro-dubai
	file_server
	encode gzip
	@data path /data/*
	header @data Cache-Control "no-cache"
	header Permissions-Policy "geolocation=(self)"
}
```

Phones will warn about the certificate until they trust Caddy's root CA. Export it with `sudo cat /var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt` and tell the user to install it on each phone (iOS: Settings > General > VPN & Device Management, then Certificate Trust Settings; Android: Settings > Security > Install certificate). If that is too much friction, use Option C.

### Option C: private access from anywhere via Tailscale

If Tailscale is installed and the user's phone is on the same tailnet:

```sh
sudo tailscale serve --bg --https=443 /srv/retro-dubai
tailscale serve status
```

This gives a trusted `https://<machine>.<tailnet>.ts.net` URL with no certificate setup. Skip the Caddyfile in this case.

### Apply (options A and B)

```sh
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
# open the port if ufw is active
sudo ufw status | grep -q active && sudo ufw allow 443/tcp && sudo ufw allow 80/tcp   # option A
sudo ufw status | grep -q active && sudo ufw allow 8443/tcp                            # option B
```

**Check:**

```sh
curl -skI https://localhost:8443/ | head -1           # option B: HTTP/2 200
curl -sI https://retrodubai.example.com/ | head -1     # option A: HTTP/2 200
curl -sk https://localhost:8443/data/restaurants.json | head -c 80   # starts with {"updated":
```

## 5. Nightly data refresh and code updates

Add a cron job for the user that owns `/srv/retro-dubai` (`crontab -e`). It pulls code changes and rebuilds the restaurant list at 02:30 Dubai time (adjust if the server clock is not in Asia/Dubai: `timedatectl` shows it):

```
CRON_TZ=Asia/Dubai
30 2 * * * cd /srv/retro-dubai && git pull -q --ff-only && node scripts/fetch-restaurants.mjs >> /var/tmp/retro-dubai-refresh.log 2>&1
```

The GitHub repo also refreshes `data/restaurants.json` nightly, so a `git pull` alone keeps data current; the local fetch is a fallback. If `git pull` reports a conflict on `data/restaurants.json`, run `git checkout -- data/restaurants.json && git pull --ff-only`.

**Check:** `crontab -l` shows the line. Run the command once by hand and confirm the log ends with `Wrote N places`.

## 6. Final verification

1. Open the URL from step 4 in a desktop browser. The loading screen should end with "READY PLAYER ONE", then show 3D buildings and pins.
2. Open the browser console: there should be a line `Retro Dubai: N places from snapshot`.
3. Search "shawarma", tap a result, tap **GO**, then **DEMO DRIVE**. The green route and turn banner should appear.
4. On a phone, tap the ◎ button and allow location. The cyan dot should appear at the phone's position.

Report the results of all four.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Black map, pins visible | Phone or server blocks `tiles.openfreemap.org` | Allow outbound HTTPS to tiles.openfreemap.org, unpkg.com, fonts.googleapis.com, routing.openstreetmap.de |
| "Location permission denied" on phone with a valid page | Page served over plain HTTP or untrusted cert | Use option A or C, or trust the Caddy root CA (option B) |
| "Routing failed" | Public FOSSGIS router busy or unreachable | Retry; for heavy use self-host OSRM and change `PROFILES` in `js/nav.js` |
| Restaurant count low | OpenStreetMap coverage of Dubai is incomplete | Expected; see the product spec for paid data sources |
