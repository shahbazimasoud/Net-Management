#!/usr/bin/env bash
# ==============================================================================
#  NetTopology - Automated Dual SSH Virtual Environments Setup Script
#  Idempotently provisions:
#    1. Legacy venv: Paramiko 2.12.x (Old Cisco gear, legacy ciphers)
#    2. Modern venv: Modern Paramiko >=3.4.0 (Modern ciphers, IOS-XE, Linux)
# ==============================================================================

set -e

# Detect Script Directory and Project Root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Allow target override via argument or environment
TARGET_DIR="${1:-${APP_DIR:-${INSTALL_DIR:-$PROJECT_ROOT}}}"
TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"

BACKEND_DIR="$TARGET_DIR/backend"
VENV_LEGACY="$BACKEND_DIR/venv_legacy"
VENV_MODERN="$BACKEND_DIR/venv_modern"
REQ_LEGACY="$TARGET_DIR/requirements-legacy.txt"
REQ_MODERN="$TARGET_DIR/requirements-modern.txt"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN} NetTopology SSH Backend Provisioner${NC}"
echo -e "${CYAN} Target Directory: ${TARGET_DIR}${NC}"
echo -e "${CYAN}================================================================${NC}"

# Check for Python 3
if ! command -v python3 &>/dev/null; then
  echo -e "${RED}[ERROR] Python 3 is not installed on this system.${NC}"
  echo -e "${YELLOW}Please install Python 3 (e.g. apt-get install -y python3 python3-venv python3-pip)${NC}"
  exit 1
fi

# Ensure requirements files exist
if [ ! -f "$REQ_LEGACY" ]; then
  cat << 'EOF' > "$REQ_LEGACY"
paramiko==2.12.*
cryptography>=2.8
websockets>=10.0
EOF
fi

if [ ! -f "$REQ_MODERN" ]; then
  cat << 'EOF' > "$REQ_MODERN"
paramiko>=3.4.0
cryptography>=42.0.0
websockets>=12.0
EOF
fi

# Function to verify if a venv is healthy and imports paramiko
is_venv_healthy() {
  local venv_path="$1"
  local mode="$2"
  local py_bin="$venv_path/bin/python"

  if [ ! -f "$py_bin" ] && [ -f "$venv_path/bin/python3" ]; then
    py_bin="$venv_path/bin/python3"
  fi

  if [ ! -x "$py_bin" ]; then
    return 1
  fi

  if [ "$mode" = "legacy" ]; then
    "$py_bin" -c "import paramiko; assert paramiko.__version__.startswith('2.12'), f'Invalid legacy version {paramiko.__version__}'" 2>/dev/null
    return $?
  else
    "$py_bin" -c "import paramiko; v = int(paramiko.__version__.split('.')[0]); assert v >= 3, f'Invalid modern version {paramiko.__version__}'" 2>/dev/null
    return $?
  fi
}

mkdir -p "$BACKEND_DIR"

# ------------------------------------------------------------------------------
# 1. Setup Legacy Venv (Paramiko 2.12.x)
# ------------------------------------------------------------------------------
echo -e "${CYAN}[1/2] Checking Legacy SSH Virtual Environment (Paramiko 2.12.x)...${NC}"
if is_venv_healthy "$VENV_LEGACY" "legacy"; then
  LEGACY_VER=$("$VENV_LEGACY/bin/python" -c "import paramiko; print(paramiko.__version__)" 2>/dev/null || echo "2.12.x")
  echo -e "${GREEN}✓ Legacy SSH venv is healthy and verified (Paramiko ${LEGACY_VER}) at: ${VENV_LEGACY}${NC}"
else
  echo -e "${YELLOW}Provisioning Legacy SSH venv at ${VENV_LEGACY}...${NC}"
  rm -rf "$VENV_LEGACY"
  python3 -m venv "$VENV_LEGACY"
  
  # Ensure pip exists inside venv
  if [ ! -x "$VENV_LEGACY/bin/pip" ]; then
    if python3 -m ensurepip --help &>/dev/null; then
      "$VENV_LEGACY/bin/python" -m ensurepip --upgrade || true
    fi
  fi

  echo -e "${CYAN}Installing Legacy requirements (paramiko==2.12.*)...${NC}"
  "$VENV_LEGACY/bin/pip" install --no-cache-dir -r "$REQ_LEGACY" || \
    "$VENV_LEGACY/bin/pip" install "paramiko>=2.12.0,<2.13.0" cryptography websockets

  if is_venv_healthy "$VENV_LEGACY" "legacy"; then
    LEGACY_VER=$("$VENV_LEGACY/bin/python" -c "import paramiko; print(paramiko.__version__)" 2>/dev/null || echo "2.12.x")
    echo -e "${GREEN}✓ Legacy SSH venv successfully built and verified (Paramiko ${LEGACY_VER})${NC}"
  else
    echo -e "${RED}[ERROR] Failed to build a functional legacy venv with Paramiko 2.12.x${NC}"
    exit 1
  fi
fi

# ------------------------------------------------------------------------------
# 2. Setup Modern Venv (Paramiko >=3.4.0)
# ------------------------------------------------------------------------------
echo -e "${CYAN}[2/2] Checking Modern SSH Virtual Environment (Paramiko >=3.4.0)...${NC}"
if is_venv_healthy "$VENV_MODERN" "modern"; then
  MODERN_VER=$("$VENV_MODERN/bin/python" -c "import paramiko; print(paramiko.__version__)" 2>/dev/null || echo ">=3.4")
  echo -e "${GREEN}✓ Modern SSH venv is healthy and verified (Paramiko ${MODERN_VER}) at: ${VENV_MODERN}${NC}"
else
  echo -e "${YELLOW}Provisioning Modern SSH venv at ${VENV_MODERN}...${NC}"
  rm -rf "$VENV_MODERN"
  python3 -m venv "$VENV_MODERN"

  # Ensure pip exists inside venv
  if [ ! -x "$VENV_MODERN/bin/pip" ]; then
    if python3 -m ensurepip --help &>/dev/null; then
      "$VENV_MODERN/bin/python" -m ensurepip --upgrade || true
    fi
  fi

  echo -e "${CYAN}Installing Modern requirements (paramiko>=3.4.0)...${NC}"
  "$VENV_MODERN/bin/pip" install --no-cache-dir -r "$REQ_MODERN" || \
    "$VENV_MODERN/bin/pip" install "paramiko>=3.4.0" cryptography websockets

  if is_venv_healthy "$VENV_MODERN" "modern"; then
    MODERN_VER=$("$VENV_MODERN/bin/python" -c "import paramiko; print(paramiko.__version__)" 2>/dev/null || echo ">=3.4")
    echo -e "${GREEN}✓ Modern SSH venv successfully built and verified (Paramiko ${MODERN_VER})${NC}"
  else
    echo -e "${RED}[ERROR] Failed to build a functional modern venv with Paramiko >=3.4.0${NC}"
    exit 1
  fi
fi

# ------------------------------------------------------------------------------
# 3. Permissions Adjustment
# ------------------------------------------------------------------------------
chmod -R u+rwX,go+rX "$VENV_LEGACY" "$VENV_MODERN" 2>/dev/null || true
if [ -n "$SUDO_USER" ] && [ "$SUDO_USER" != "root" ]; then
  chown -R "$SUDO_USER:$SUDO_USER" "$VENV_LEGACY" "$VENV_MODERN" 2>/dev/null || true
fi

echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN} ✓ Both SSH Virtual Environments are ready and verified!${NC}"
echo -e "${GREEN}   - Legacy: $($VENV_LEGACY/bin/python -c "import paramiko; print(paramiko.__version__)") (${VENV_LEGACY}/bin/python)${NC}"
echo -e "${GREEN}   - Modern: $($VENV_MODERN/bin/python -c "import paramiko; print(paramiko.__version__)") (${VENV_MODERN}/bin/python)${NC}"
echo -e "${GREEN}================================================================${NC}"
exit 0
