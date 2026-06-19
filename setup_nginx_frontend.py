"""Set up nginx for the frontend (port 3000 -> 3001)."""
import io
import sys
import time
import paramiko

HOST = "159.194.225.55"
PORT = 22
USER = "deploy"
PASS = "Deploy2024!#"

def log(msg):
    sys.stdout.buffer.write((msg + "\n").encode("utf-8"))
    sys.stdout.buffer.flush()

def ssh_exec(client, cmd, timeout=60, sudo_pass=None):
    log(f"$ {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout, get_pty=bool(sudo_pass))
    if sudo_pass:
        stdin.write(sudo_pass + "\n")
        stdin.flush()
    out = stdout.read().decode("utf-8", errors="replace").strip()
    err = stderr.read().decode("utf-8", errors="replace").strip()
    if out: log(out)
    if err: log(f"[stderr] {err}")
    return out, err

def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, PORT, USER, PASS, timeout=30)
    log("SSH connected")

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
    sftp.putfo(io.BytesIO(nginx_conf.encode("utf-8")), "/tmp/nginx-frontend")
    sftp.close()
    log("Wrote nginx config to /tmp/nginx-frontend")

    sp = PASS
    ssh_exec(client, "echo '"+sp+"' | sudo -S mv /tmp/nginx-frontend /etc/nginx/sites-available/integration-1c-frontend")
    ssh_exec(client, "echo '"+sp+"' | sudo -S ln -sf /etc/nginx/sites-available/integration-1c-frontend /etc/nginx/sites-enabled/integration-1c-frontend")
    ssh_exec(client, "echo '"+sp+"' | sudo -S nginx -t")
    ssh_exec(client, "echo '"+sp+"' | sudo -S systemctl reload nginx")

    log("\n--- Checking services ---")
    time.sleep(2)
    ssh_exec(client, "pm2 list")
    out, _ = ssh_exec(client, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/")
    log(f"Health check 3001: {out}")
    out2, _ = ssh_exec(client, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/")
    log(f"Health check 3000 (nginx): {out2}")

    client.close()
    log("\nFrontend: http://159.194.225.55:3000")

if __name__ == "__main__":
    main()
