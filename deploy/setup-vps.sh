#!/bin/bash
# Super Monitor VPS Setup Script
# Run on Ubuntu 22.04+ VPS

set -e

INSTALL_DIR="/opt/super-monitor"
echo "=== Super Monitor VPS Setup ==="

# Install Node.js 22
if ! command -v node &>/dev/null; then
  echo "Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# Install PM2
if ! command -v pm2 &>/dev/null; then
  echo "Installing PM2..."
  sudo npm install -g pm2
fi

# Create directories
sudo mkdir -p $INSTALL_DIR
sudo mkdir -p $INSTALL_DIR/data
sudo mkdir -p $INSTALL_DIR/output
sudo mkdir -p $INSTALL_DIR/logs

# Fix ownership
sudo chown -R $USER:$USER $INSTALL_DIR

# Copy files (run from repository root)
echo "Copying application files..."
cp -r src/ $INSTALL_DIR/
cp package.json $INSTALL_DIR/
cp ecosystem.config.js $INSTALL_DIR/

# Install dependencies
cd $INSTALL_DIR
npm install

# Setup firewall
echo "Configuring firewall..."
sudo ufw allow 3099/tcp 2>/dev/null || true
sudo iptables -A INPUT -p tcp --dport 3099 -j ACCEPT 2>/dev/null || true

# Start with PM2
pm2 delete super-monitor 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u $USER --hp /home/$USER

echo "=== Setup Complete ==="
echo "Dashboard: http://YOUR_VPS_IP:3099"
echo "PM2 status: pm2 status"
echo "Logs: pm2 logs super-monitor"
