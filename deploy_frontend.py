"""Deploy Next.js frontend to Beget VPS."""
import os
import sys
import io
import time
import paramiko

HOST = "159.194.225.55"
PORT = 22
USER = "deploy"
PASS = "Deploy2024!#"
REMOTE_DIR = "/var/www/integration-1c/frontend"
LOCAL_DIR  = os.path.join(os.path.dirname(__file__), "frontend")

def log(msg):
    sys.stdout.buffer.write((msg + "\n").encode("utf-8"))
    sys.stdout.buffer.flush()

def ssh_exec(client, cmd, timeout=300):
    log(f"$ {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace").strip()
    err = stderr.read().decode("utf-8", errors="replace").strip()
    if out:
        log(out)
    if err:
        log(f"[stderr] {err}")
    return out, err

def upload_dir(sftp, local_path, remote_path):
    """Recursively upload directory via SFTP, skipping node_modules and .next."""
    SKIP = {'.next', 'node_modules', '__pycache__', '.git', 'prisma'}
    try:
        sftp.mkdir(remote_path)
    except OSError:
        pass

    for item in os.listdir(local_path):
        if item in SKIP:
            continue
        lp = os.path.join(local_path, item)
        rp = remote_path + "/" + item
        if os.path.isdir(lp):
            upload_dir(sftp, lp, rp)
        else:
            log(f"  upload: {rp}")
            sftp.put(lp, rp)

def main():
    log("=== Frontend Deployment ===")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, PORT, USER, PASS, timeout=30)
    log("SSH connected")

    # 1. Ensure remote dir exists
    ssh_exec(client, f"mkdir -p {REMOTE_DIR}")

    # 2. Upload frontend files
    log("\n--- Uploading frontend files ---")
    sftp = client.open_sftp()
    upload_dir(sftp, LOCAL_DIR, REMOTE_DIR)
    sftp.close()
    log("Upload complete")

    # 3. Upload PM2 ecosystem config for frontend
    log("\n--- Uploading PM2 frontend config ---")
    sftp = client.open_sftp()
    local_pm2 = os.path.join(os.path.dirname(__file__), "frontend", "ecosystem.frontend.config.js")
    sftp.put(local_pm2, "/var/www/integration-1c/ecosystem.frontend.config.js")
    sftp.close()

    # 4. npm install
    log("\n--- npm install ---")
    ssh_exec(client, f"cd {REMOTE_DIR} && npm install --legacy-peer-deps", timeout=300)

    # 5. Install shadcn components
    log("\n--- Installing shadcn/ui components ---")
    shadcn_components = "badge button card dialog dropdown-menu input label select switch table textarea toggle-group"
    ssh_exec(client,
        f"cd {REMOTE_DIR} && npx shadcn@latest add {shadcn_components} --yes --overwrite",
        timeout=300
    )

    # 6. Build
    log("\n--- npm run build ---")
    ssh_exec(client, f"cd {REMOTE_DIR} && npm run build", timeout=600)

    # 7. PM2 start
    log("\n--- Starting with PM2 ---")
    ssh_exec(client, "pm2 delete buhgsaas-frontend 2>/dev/null || true")
    ssh_exec(client,
        "cd /var/www/integration-1c && pm2 start ecosystem.frontend.config.js",
        timeout=60
    )
    ssh_exec(client, "pm2 save")

    # 8. nginx config for port 3000 -> 3001
    log("\n--- Configuring Nginx (port 3000) ---")
    nginx_conf = """server {
    listen 3000;
    server_name 159.194.225.55;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
    }
}
"""
    sftp = client.open_sftp()
    sftp.putfo(io.BytesIO(nginx_conf.encode("utf-8")),
               "/tmp/nginx-integration-1c-frontend")
    sftp.close()

    ssh_exec(client,
        "sudo mv /tmp/nginx-integration-1c-frontend "
        "/etc/nginx/sites-available/integration-1c-frontend"
    )
    ssh_exec(client,
        "sudo ln -sf /etc/nginx/sites-available/integration-1c-frontend "
        "/etc/nginx/sites-enabled/integration-1c-frontend"
    )
    ssh_exec(client, "sudo nginx -t")
    ssh_exec(client, "sudo systemctl reload nginx")

    # 9. Verify
    log("\n--- Verifying ---")
    time.sleep(3)
    ssh_exec(client, "pm2 list")
    out, _ = ssh_exec(client, f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:3001/")
    log(f"Health check internal 3001: {out}")
    out2, _ = ssh_exec(client, f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:3000/")
    log(f"Health check nginx 3000: {out2}")

    client.close()
    log("\n=== Deployment complete ===")
    log("Frontend: http://159.194.225.55:3000")

if __name__ == "__main__":
    main()
