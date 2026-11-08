#!/bin/bash
set -Eeuo pipefail

# ---------------- Settings ----------------
APP_DIR=/opt/unque
APP_USER=ubuntu
APP_PORT=5001
REPO_URL=https://github.com/santanu0529/UnQue-2.0.git
REGION=ap-southeast-2
SSM_PARAM=/unque/production/JWT_SECRET
USERS_TABLE=UnQueUsers
AVAILABILITY_TABLE=UnQueAvailability
APPOINTMENTS_TABLE=UnQueAppointments

# cloud-init may not set these
export HOME=/root
export DEBIAN_FRONTEND=noninteractive
export PATH=/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin

# Log everything (also visible in EC2 "Get system log")
exec > >(tee -a /var/log/user-data.log) 2>&1
trap 'echo "FAILED at line $LINENO: $BASH_COMMAND"' ERR

# ---------------- Helpers ----------------
retry() {
  local n=$1 i
  shift
  for i in $(seq 1 "$n"); do
    if "$@"; then return 0; fi
    echo "Attempt $i/$n failed: $*"
    sleep 10
  done
  return 1
}

apt_get() { apt-get -o DPkg::Lock::Timeout=300 -y "$@"; }

as_app() { runuser -u "$APP_USER" -- env HOME="/home/$APP_USER" "$@"; }

install_node() {
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt_get install nodejs
}

# ---------------- Deployment ----------------
echo "[1/8] Starting UnQue backend deployment..."
id "$APP_USER" >/dev/null 2>&1 || { echo "ERROR: user '$APP_USER' not found. Use an Ubuntu AMI."; exit 1; }

echo "[2/8] Installing base packages..."
retry 5 apt_get update
retry 5 apt_get install git curl unzip ca-certificates

# Keep the SSM agent running so Session Manager works as an SSH alternative
systemctl enable --now snap.amazon-ssm-agent.amazon-ssm-agent.service 2>/dev/null || true

echo "[3/8] Installing AWS CLI v2 and Node.js 22..."
if ! command -v aws >/dev/null 2>&1; then
  retry 3 curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o /tmp/awscliv2.zip
  unzip -q -o /tmp/awscliv2.zip -d /tmp
  /tmp/aws/install
fi
if ! command -v node >/dev/null 2>&1; then
  retry 3 install_node
fi
node -v | grep -q '^v22\.' || { echo "ERROR: expected Node 22, got $(node -v)"; exit 1; }
echo "Node $(node -v), npm $(npm -v)"

echo "[4/8] Reading JWT secret from Parameter Store..."
JWT_SECRET=""
for i in $(seq 1 10); do
  if JWT_SECRET=$(aws ssm get-parameter \
      --name "$SSM_PARAM" \
      --with-decryption \
      --query "Parameter.Value" \
      --output text \
      --region "$REGION" 2>/tmp/ssm.err); then
    break
  fi
  echo "SSM attempt $i/10 failed: $(cat /tmp/ssm.err)"
  sleep 10
done
if [ -z "$JWT_SECRET" ]; then
  echo "ERROR: could not read $SSM_PARAM in $REGION. Check the instance IAM role (ssm:GetParameter, kms:Decrypt) and that the parameter exists."
  exit 1
fi
[[ "$JWT_SECRET" =~ ^[A-Za-z0-9._~+/=-]+$ ]] \
  || echo "WARNING: JWT secret has special characters; systemd/dotenv may parse it differently. Prefer letters, digits and . _ ~ + / = -"

echo "[5/8] Fetching the application code..."
mkdir -p "$APP_DIR"
chown "$APP_USER:$APP_USER" "$APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  as_app git -C "$APP_DIR" pull --ff-only
else
  retry 3 as_app git clone "$REPO_URL" "$APP_DIR"
fi

echo "[6/8] Writing environment file..."
install -m 600 -o "$APP_USER" -g "$APP_USER" /dev/null "$APP_DIR/.env"
cat > "$APP_DIR/.env" <<EOF
AWS_REGION=$REGION
DYNAMODB_USERS_TABLE=$USERS_TABLE
DYNAMODB_AVAILABILITY_TABLE=$AVAILABILITY_TABLE
DYNAMODB_APPOINTMENTS_TABLE=$APPOINTMENTS_TABLE
PORT=$APP_PORT
NODE_ENV=production
JWT_SECRET=${JWT_SECRET}
EOF
unset JWT_SECRET

echo "[7/8] Installing production dependencies..."
cd "$APP_DIR"
[ -f package.json ] || { echo "ERROR: package.json not found in $APP_DIR"; exit 1; }
[ -f index.js ] || { echo "ERROR: index.js not found in $APP_DIR"; exit 1; }
if [ -f package-lock.json ]; then NPM_CMD=ci; else NPM_CMD=install; fi
retry 3 as_app npm "$NPM_CMD" --omit=dev

echo "[8/8] Creating and starting the systemd service..."
NODE_BIN=$(command -v node)
cat > /etc/systemd/system/unque.service <<EOF
[Unit]
Description=UnQue Backend API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
Environment=NODE_ENV=production
ExecStart=$NODE_BIN $APP_DIR/index.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable unque
systemctl restart unque

# Health check: any HTTP response (even a 404) means the API is up
ok=""
for i in $(seq 1 30); do
  if curl -s -o /dev/null "http://127.0.0.1:${APP_PORT}/"; then
    echo "API is responding on port ${APP_PORT}."
    ok=1
    break
  fi
  sleep 2
done
if [ -z "$ok" ]; then
  echo "WARNING: API is not responding on port ${APP_PORT}. Service status and logs:"
  systemctl status unque --no-pager || true
  journalctl -u unque -n 50 --no-pager || true
fi

# Print the public URL to test (IMDSv2)
TOKEN=$(curl -s --max-time 3 -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 60" || true)
PUBLIC_IP=$(curl -s --max-time 3 -H "X-aws-ec2-metadata-token: $TOKEN" \
  "http://169.254.169.254/latest/meta-data/public-ipv4" || true)
echo "Test URL: http://${PUBLIC_IP:-<public-ip>}:${APP_PORT}/  (a JSON 404 means the API is running)"

echo "UnQue deployment script completed."
