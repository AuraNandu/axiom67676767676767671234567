# Axiom Chat — Live Chat + Peer-to-Peer Calls
# Deployed on Fly.io (always awake)

## Deploy to Fly.io (stays running 24/7)

1. Install the Fly CLI: https://fly.io/docs/hands-on/install-flyctl/
2. Sign up / log in: `fly auth signup` or `fly auth login`
3. In this folder run:
   ```bash
   fly launch --no-deploy
   ```
   (It will use the fly.toml already included. You can change the app name if you want.)
4. Then deploy:
   ```bash
   fly deploy
   ```
5. Open the URL Fly gives you (something like `https://axiom-chat.fly.dev`).

The server stays awake (`auto_stop_machines = false` and `min_machines_running = 1`).

## Local testing
```bash
npm install
node server.js
```
Then open http://localhost:3000

## Features
- Unique usernames + password login
- Live messaging
- Peer-to-peer voice & video calls
- Always-on when deployed to Fly.io

Data is stored in memory (resets on restart). For permanent data you can later add a database.
