"""Upload updated frontend chat files and rebuild."""
import os, sys, paramiko

HOST = "159.194.225.55"; PORT = 22; USER = "deploy"; PASS = "Deploy2024!#"
FRONT_REMOTE = "/var/www/integration-1c/frontend"
FRONT_LOCAL  = os.path.join(os.path.dirname(__file__), "frontend")

def log(m): sys.stdout.buffer.write((m+"\n").encode("utf-8")); sys.stdout.buffer.flush()
def sx(cmd, timeout=120):
    log(f"$ {cmd}")
    _, o, e = client.exec_command(cmd, timeout=timeout)
    out=o.read().decode("utf-8","replace").strip()
    err=e.read().decode("utf-8","replace").strip()
    if out: log(out)
    if err: log(f"[err] {err}")
    return out

client=paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST,PORT,USER,PASS,timeout=30)
log("Connected")

sftp=client.open_sftp()

CHANGED = [
    ("components/chat/AccountantChat.tsx",  f"{FRONT_REMOTE}/components/chat/AccountantChat.tsx"),
    ("types/index.ts",                      f"{FRONT_REMOTE}/types/index.ts"),
    ("lib/api.ts",                          f"{FRONT_REMOTE}/lib/api.ts"),
]

log("\n--- Uploading changed files ---")
for local_rel, rp in CHANGED:
    lp = os.path.join(FRONT_LOCAL, local_rel.replace("/", os.sep))
    log(f"  {rp}")
    sftp.put(lp, rp)

sftp.close()

log("\n--- npm run build ---")
sx(f"cd {FRONT_REMOTE} && npm run build", timeout=600)

log("\n--- Restart frontend ---")
sx("pm2 restart buhgsaas-frontend")

import time; time.sleep(3)
out=sx("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/")
log(f"Health: {out}")

client.close()
log("\nDone. http://159.194.225.55:3000/chat")
