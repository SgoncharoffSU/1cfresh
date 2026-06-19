"""Add Telegram bot token to server .env and deploy updated backend."""
import io, os, sys, time, paramiko

HOST = "159.194.225.55"; PORT = 22; USER = "deploy"; PASS = "Deploy2024!#"
BOT_TOKEN = "8849421505:AAE_xMPkHScpj6_SnvtUTohKNjZ-pk9ek5I"
REMOTE_APP  = "/var/www/integration-1c/app"
REMOTE_ROOT = "/var/www/integration-1c"

def log(m): sys.stdout.buffer.write((m+"\n").encode("utf-8")); sys.stdout.buffer.flush()

def sx(cmd, timeout=120):
    log(f"$ {cmd}")
    _, o, e = client.exec_command(cmd, timeout=timeout)
    out = o.read().decode("utf-8","replace").strip()
    err = e.read().decode("utf-8","replace").strip()
    if out: log(out)
    if err: log(f"[err] {err}")
    return out

def upload(sftp, lp, rp):
    try: sftp.mkdir(rp)
    except: pass
    for item in os.listdir(lp):
        if item in {"__pycache__",".venv"}: continue
        l=os.path.join(lp,item); r=rp+"/"+item
        if os.path.isdir(l): upload(sftp,l,r)
        else: log(f"  {r}"); sftp.put(l,r)

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, PORT, USER, PASS, timeout=30)
log("SSH connected")

# ── 1. Read existing .env and append/replace TELEGRAM_BOT_TOKEN ──
log("\n--- Updating .env ---")
sftp = client.open_sftp()
try:
    with sftp.open(f"{REMOTE_ROOT}/.env", "r") as f:
        env_content = f.read().decode("utf-8")
except FileNotFoundError:
    env_content = ""

lines = [l for l in env_content.splitlines() if not l.startswith("TELEGRAM_BOT_TOKEN")]
lines.append(f"TELEGRAM_BOT_TOKEN={BOT_TOKEN}")
new_env = "\n".join(lines) + "\n"
sftp.putfo(io.BytesIO(new_env.encode("utf-8")), f"{REMOTE_ROOT}/.env")
log(".env updated with TELEGRAM_BOT_TOKEN")

# ── 2. Upload updated backend files ──
log("\n--- Uploading backend ---")
local_app = os.path.join(os.path.dirname(__file__), "app")
upload(sftp, local_app, REMOTE_APP)
sftp.close()

# ── 3. Restart API + Celery beat + worker ──
log("\n--- Restarting services ---")
sx("pm2 restart integration-1c-api")
sx("pm2 restart integration-1c-beat")
sx("pm2 restart integration-1c-worker")
sx("pm2 save")

# ── 4. Verify bot status ──
log("\n--- Checking bot ---")
time.sleep(4)
sx("pm2 list")
out = sx(f"curl -s http://127.0.0.1:8019/api/v1/telegram/status")
log(f"Bot status: {out}")

client.close()
log("\nBot is live. Write to it in Telegram — messages will appear in http://159.194.225.55:3000/chat")
