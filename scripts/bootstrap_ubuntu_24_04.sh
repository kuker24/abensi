#!/usr/bin/env bash
# shellcheck disable=SC1091
set -Eeuo pipefail

DEPLOY_USER="${DEPLOY_USER:-schoolhub}"
SCHOOLHUB_ROOT="${SCHOOLHUB_ROOT:-/opt/schoolhub}"
TIMEZONE="Asia/Jakarta"
ENABLE_UFW="${ENABLE_UFW:-YES}"
CREATE_SWAP="${CREATE_SWAP:-YES}"
SWAP_SIZE="${SWAP_SIZE:-2G}"
PUBLIC_IFACE="${PUBLIC_IFACE:-}"

require_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "Run as root (sudo) on Ubuntu Server 24.04 LTS." >&2
    exit 1
  fi
}

ensure_ubuntu_2404() {
  . /etc/os-release
  if [[ "${ID:-}" != "ubuntu" || "${VERSION_ID:-}" != "24.04" ]]; then
    echo "Unsupported OS: ${PRETTY_NAME:-unknown}. Ubuntu Server 24.04 LTS is required." >&2
    exit 1
  fi
}

apt_install() {
  DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
}

ensure_deploy_user() {
  if id "$DEPLOY_USER" >/dev/null 2>&1; then
    echo "Deployment user exists: $DEPLOY_USER"
  else
    adduser --disabled-password --gecos "SchoolHub deploy user" "$DEPLOY_USER"
    echo "Created deployment user: $DEPLOY_USER"
  fi
  usermod -aG docker "$DEPLOY_USER" || true
  echo "WARNING: membership in the docker group is equivalent to root privileges." >&2
  install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
  if [[ -s "/home/$DEPLOY_USER/.ssh/authorized_keys" ]]; then
    chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
    chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
    echo "SSH public key detected for $DEPLOY_USER. Password login can be disabled manually after testing key login."
  else
    echo "No authorized SSH key found for $DEPLOY_USER; password login will NOT be disabled by this script." >&2
  fi
}

install_docker_official() {
  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
  fi
  . /etc/os-release
  cat > /etc/apt/sources.list.d/docker.list <<EOF
# Official Docker repository for Ubuntu ${VERSION_CODENAME}
deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable
EOF
  apt-get update
  apt_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
}

configure_timezone_ntp() {
  timedatectl set-timezone "$TIMEZONE"
  timedatectl set-ntp true
  systemctl restart systemd-timesyncd || true
  if timedatectl show -p NTPSynchronized --value | grep -qx yes; then
    echo "NTP synchronized."
  else
    echo "WARNING: NTP is not synchronized yet; verify network/time source before production deployment." >&2
  fi
}

configure_firewall() {
  ufw --force reset
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  if [[ "$ENABLE_UFW" == "YES" ]]; then
    ufw --force enable
  else
    echo "UFW rules configured but not enabled because ENABLE_UFW=$ENABLE_UFW"
  fi
}

configure_docker_user_firewall() {
  if [[ -z "$PUBLIC_IFACE" ]]; then
    PUBLIC_IFACE="$(ip route show default 2>/dev/null | awk '/default/ {print $5; exit}')"
  fi
  [[ -n "$PUBLIC_IFACE" ]] || { echo "Could not determine public network interface for DOCKER-USER firewall." >&2; return 1; }
  cat > /usr/local/sbin/schoolhub-docker-user-firewall <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
iface="${PUBLIC_IFACE:?PUBLIC_IFACE is required}"
iptables -N DOCKER-USER 2>/dev/null || true
iptables -C DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN 2>/dev/null || iptables -I DOCKER-USER 1 -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
iptables -C DOCKER-USER -i lo -j RETURN 2>/dev/null || iptables -I DOCKER-USER 2 -i lo -j RETURN
iptables -C DOCKER-USER -i "$iface" -o docker0 -j DROP 2>/dev/null || iptables -A DOCKER-USER -i "$iface" -o docker0 -j DROP
iptables -C DOCKER-USER -i "$iface" -o br+ -j DROP 2>/dev/null || iptables -A DOCKER-USER -i "$iface" -o br+ -j DROP
iptables -C DOCKER-USER -j RETURN 2>/dev/null || iptables -A DOCKER-USER -j RETURN
EOF
  chmod 750 /usr/local/sbin/schoolhub-docker-user-firewall
  cat > /etc/systemd/system/schoolhub-docker-user-firewall.service <<EOF
[Unit]
Description=SchoolHub DOCKER-USER firewall guard
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
Environment=PUBLIC_IFACE=$PUBLIC_IFACE
ExecStart=/usr/local/sbin/schoolhub-docker-user-firewall
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now schoolhub-docker-user-firewall.service
}

ensure_swap() {
  local current_swap_mb
  current_swap_mb="$(free -m | awk '/Swap:/ {print $2}')"
  if (( current_swap_mb >= 1900 )); then
    echo "Swap already sufficient: ${current_swap_mb}MB"
  elif [[ "$CREATE_SWAP" == "YES" ]]; then
    if [[ ! -f /swapfile ]]; then
      fallocate -l "$SWAP_SIZE" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
      chmod 600 /swapfile
      mkswap /swapfile
    fi
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    swapon /swapfile || true
  else
    echo "WARNING: swap below 2GB and CREATE_SWAP=$CREATE_SWAP" >&2
  fi
  cat > /etc/sysctl.d/99-schoolhub-swap.conf <<'EOF'
vm.swappiness=10
vm.vfs_cache_pressure=50
EOF
  sysctl --system >/dev/null
}

create_directories() {
  install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$SCHOOLHUB_ROOT"
  install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$SCHOOLHUB_ROOT/backups"
  install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$SCHOOLHUB_ROOT/deployments"
  install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$SCHOOLHUB_ROOT/logs"
}

configure_logs_and_monitoring() {
  cat > /etc/logrotate.d/schoolhub <<EOF
$SCHOOLHUB_ROOT/logs/*.log {
  daily
  rotate 14
  compress
  missingok
  notifempty
  copytruncate
}
EOF
  mkdir -p /etc/docker
  if [[ -f /etc/docker/daemon.json ]]; then
    tmp="$(mktemp)"
    jq '. + {"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"5"}}' /etc/docker/daemon.json > "$tmp"
    mv "$tmp" /etc/docker/daemon.json
  else
    cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "5"
  }
}
EOF
  fi
  systemctl restart docker
  cat > /usr/local/sbin/schoolhub-disk-check <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
root="__SCHOOLHUB_ROOT__"
used=$(df -P "$root" | awk 'NR==2 {gsub(/%/, "", $5); print $5}')
if (( used >= 85 )); then
  logger -p auth.warning "SchoolHub disk usage high: ${used}% on ${root}"
fi
EOF
  sed -i "s#__SCHOOLHUB_ROOT__#$SCHOOLHUB_ROOT#g" /usr/local/sbin/schoolhub-disk-check
  chmod 750 /usr/local/sbin/schoolhub-disk-check
  cat > /etc/cron.d/schoolhub-disk-check <<'EOF'
*/15 * * * * root /usr/local/sbin/schoolhub-disk-check
EOF
}

configure_unattended_upgrades() {
  dpkg-reconfigure -f noninteractive unattended-upgrades || true
  systemctl enable --now fail2ban
}

print_report() {
  local reboot_required="no"
  [[ -f /var/run/reboot-required ]] && reboot_required="yes"
  cat <<EOF

SchoolHub VPS host-readiness report
  OS:            $(. /etc/os-release && printf '%s' "$PRETTY_NAME")
  Timezone:      $(timedatectl show -p Timezone --value)
  NTP synced:    $(timedatectl show -p NTPSynchronized --value)
  Docker:        $(docker version --format '{{.Server.Version}}' 2>/dev/null || printf unavailable)
  Compose:       $(docker compose version --short 2>/dev/null || printf unavailable)
  Deploy user:   $DEPLOY_USER
  App root:      $SCHOOLHUB_ROOT
  UFW status:    $(ufw status | head -n 1)
  Public iface:  ${PUBLIC_IFACE:-unknown}
  Swap:          $(free -h | awk '/Swap:/ {print $2 " total, " $3 " used"}')
  Reboot needed: $reboot_required

Next steps: verify SSH key login for $DEPLOY_USER, then clone the repository into $SCHOOLHUB_ROOT and create a chmod 600 production env file.
EOF
}

main() {
  require_root
  ensure_ubuntu_2404
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get -y upgrade
  apt_install ca-certificates curl git jq openssl ufw fail2ban unattended-upgrades logrotate gnupg lsb-release iptables
  configure_timezone_ntp
  install_docker_official
  ensure_deploy_user
  configure_firewall
  configure_docker_user_firewall
  ensure_swap
  create_directories
  configure_logs_and_monitoring
  configure_unattended_upgrades
  print_report
}

main "$@"
