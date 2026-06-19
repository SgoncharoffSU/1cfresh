"""Upload changed frontend + backend files and restart services."""
import os, sys, io, paramiko

HOST = "159.194.225.55"; PORT = 22; USER = "deploy"; PASS = "Deploy2024!#"
FRONT_LOCAL  = os.path.join(os.path.dirname(__file__), "frontend")
FRONT_REMOTE = "/var/www/integration-1c/frontend"
BACK_LOCAL   = os.path.join(os.path.dirname(__file__), "app")
BACK_REMOTE  = "/var/www/integration-1c/app"

def log(m): sys.stdout.buffer.write((m+"\n").encode("utf-8")); sys.stdout.buffer.flush()
def sx(c, t=120):
    log(f"$ {c}")
    _, o, e = client.exec_command(c, timeout=t)
    out=o.read().decode("utf-8","replace").strip()
    err=e.read().decode("utf-8","replace").strip()
    if out: log(out)
    if err: log(f"[err] {err}")
    return out

def upload(sftp, lp, rp):
    try: sftp.mkdir(rp)
    except: pass
    SKIP={'.next','node_modules','__pycache__','.git','prisma','.venv'}
    for item in os.listdir(lp):
        if item in SKIP: continue
        l=os.path.join(lp,item); r=rp+"/"+item
        if os.path.isdir(l): upload(sftp,l,r)
        else:
            log(f"  {r}")
            sftp.put(l,r)

client=paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST,PORT,USER,PASS,timeout=30)
log("Connected")

# 1. Upload frontend changes
log("\n--- Frontend files ---")
sftp=client.open_sftp()
# Only changed dirs
for sub in ["app","components","constants","store"]:
    lp=os.path.join(FRONT_LOCAL,sub); rp=FRONT_REMOTE+"/"+sub
    if os.path.isdir(lp): upload(sftp,lp,rp)
sftp.close()

# 2. Upload backend changes
log("\n--- Backend files ---")
sftp=client.open_sftp()
for sub in ["routers","config.py","main.py"]:
    lp=os.path.join(BACK_LOCAL,sub) if sub!="config.py" and sub!="main.py" else os.path.join(os.path.dirname(__file__),sub if sub=="main.py" else f"app/{sub}")
    # fix paths
    if sub=="config.py": lp=os.path.join(BACK_LOCAL,"config.py"); rp=BACK_REMOTE+"/config.py"
    elif sub=="main.py": lp=os.path.join(os.path.dirname(__file__),"app","main.py"); rp=BACK_REMOTE+"/main.py"
    else: lp=os.path.join(BACK_LOCAL,sub); rp=BACK_REMOTE+"/"+sub
    if os.path.isdir(lp): upload(sftp,lp,rp)
    elif os.path.isfile(lp):
        log(f"  {rp}"); sftp.put(lp,rp)
sftp.close()

# 3. Rebuild frontend
log("\n--- npm run build ---")
sx(f"cd {FRONT_REMOTE} && npm run build", t=600)

# 4. Restart services
log("\n--- PM2 restart ---")
sx("pm2 restart buhgsaas-frontend")
sx("pm2 restart integration-1c-api")
sx("pm2 save")

# 5. Verify
log("\n--- Health check ---")
import time; time.sleep(3)
sx("pm2 list")
sx("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/")
sx("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8019/health")

client.close()
log("\nDone. http://159.194.225.55:3000")
