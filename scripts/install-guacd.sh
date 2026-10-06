#!/usr/bin/env bash
# ==============================================================================
#  NetTopology - Distro-Independent Apache Guacamole Daemon (guacd) Source Installer
#  Builds and installs guacd >= 1.5.5 from official Apache source with RDP support.
#  Supports Debian/Ubuntu and RHEL/Rocky/Alma/CentOS/Fedora families without
#  hardcoding distro release versions (never branches on VERSION_ID).
# ==============================================================================

set -eo pipefail

GUACD_VERSION="${GUACD_VERSION:-1.5.5}"
MIN_GUACD_VERSION="${MIN_GUACD_VERSION:-1.5.5}"
GUACD_HOST="127.0.0.1"
GUACD_PORT="4822"
GUACD_USER="guacd"
GUACD_HOME="/var/lib/guacd"
LOG_FILE="/var/log/nettopology-guacd-install.log"
BUILD_ROOT="/tmp/guacamole-server-build-$$"

FORCE_INSTALL=false
for arg in "$@"; do
  case "$arg" in
    --force|-f)
      FORCE_INSTALL=true
      ;;
  esac
done

# Ensure log directory and file exist, and tee all output to LOG_FILE
mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
touch "$LOG_FILE" 2>/dev/null || true
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=============================================================================="
echo "[guacd-installer] Starting guacd source installation check ($(date -u '+%Y-%m-%dT%H:%M:%SZ'))"
echo "[guacd-installer] Target GUACD_VERSION=${GUACD_VERSION} (minimum required: ${MIN_GUACD_VERSION})"
echo "[guacd-installer] Log file: ${LOG_FILE}"
echo "=============================================================================="

cleanup() {
  if [ -d "$BUILD_ROOT" ]; then
    rm -rf "$BUILD_ROOT" 2>/dev/null || true
  fi
}
trap cleanup EXIT

log_info() {
  echo "[guacd-installer] [INFO] $*"
}

log_warn() {
  echo "[guacd-installer] [WARN] $*" >&2
}

log_error() {
  echo "[guacd-installer] [ERROR] $*" >&2
}

# Check root privileges
if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  log_error "This script must be run as root (or via sudo)."
  exit 1
fi

# ------------------------------------------------------------------------------
# Helper: Numeric semantic version comparison (returns 0 if $1 >= $2)
# ------------------------------------------------------------------------------
version_ge() {
  local v1="$1"
  local v2="$2"
  if [ -z "$v1" ] || [ -z "$v2" ]; then
    return 1
  fi

  local IFS=.
  local i
  local -a ver1=($v1)
  local -a ver2=($v2)

  for ((i=${#ver1[@]}; i<${#ver2[@]}; i++)); do
    ver1[i]=0
  done
  for ((i=0; i<${#ver1[@]}; i++)); do
    if [ -z "${ver2[i]:-}" ]; then
      ver2[i]=0
    fi
    local n1="${ver1[i]//[^0-9]/}"
    local n2="${ver2[i]//[^0-9]/}"
    n1="${n1:-0}"
    n2="${n2:-0}"
    if ((10#$n1 > 10#$n2)); then
      return 0
    fi
    if ((10#$n1 < 10#$n2)); then
      return 1
    fi
  done
  return 0
}

# ------------------------------------------------------------------------------
# Helper: Extract guacd version string from a binary
# ------------------------------------------------------------------------------
get_guacd_version() {
  local bin="${1:-}"
  if [ -z "$bin" ]; then
    bin="$(command -v guacd 2>/dev/null || true)"
  fi
  if [ -z "$bin" ] || [ ! -x "$bin" ]; then
    return 1
  fi
  local out
  out="$("$bin" -v 2>&1 || true)"
  local ver
  ver="$(echo "$out" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1 || true)"
  if [ -n "$ver" ]; then
    echo "$ver"
    return 0
  fi
  return 1
}

# ------------------------------------------------------------------------------
# Helper: Check if 127.0.0.1:4822 is listening and accepting TCP connections
# ------------------------------------------------------------------------------
is_port_listening() {
  local host="${1:-127.0.0.1}"
  local port="${2:-4822}"

  if command -v ss >/dev/null 2>&1; then
    if ss -tln 2>/dev/null | awk '{print $4}' | grep -E -q "(^|${host}:)${port}$"; then
      return 0
    fi
  elif command -v netstat >/dev/null 2>&1; then
    if netstat -tln 2>/dev/null | awk '{print $4}' | grep -E -q "(^|${host}:)${port}$"; then
      return 0
    fi
  fi

  if (exec 3<>"/dev/tcp/${host}/${port}") 2>/dev/null; then
    exec 3<&-
    exec 3>&-
    return 0
  fi

  return 1
}

# ------------------------------------------------------------------------------
# Helper: Find and verify libguac-client-rdp.so loadability (no missing ldd deps
#         and live Guacamole "select,3.rdp;" protocol check when daemon is up)
# ------------------------------------------------------------------------------
find_rdp_plugin_so() {
  local rdp_so=""
  if command -v ldconfig >/dev/null 2>&1; then
    rdp_so="$(ldconfig -p 2>/dev/null | awk '/libguac-client-rdp\.so/ {print $NF; exit}' || true)"
  fi
  if [ -z "$rdp_so" ] || [ ! -e "$rdp_so" ]; then
    rdp_so="$(find /usr/local/lib /usr/local/lib64 /usr/lib /usr/lib64 /lib -name 'libguac-client-rdp.so*' 2>/dev/null | head -n 1 || true)"
  fi
  if [ -n "$rdp_so" ] && [ -e "$rdp_so" ]; then
    echo "$rdp_so"
    return 0
  fi
  return 1
}

is_rdp_plugin_loadable() {
  local rdp_so
  rdp_so="$(find_rdp_plugin_so || true)"
  if [ -z "$rdp_so" ] || [ ! -e "$rdp_so" ]; then
    return 1
  fi

  if command -v ldd >/dev/null 2>&1; then
    local missing
    missing="$(ldd -r "$rdp_so" 2>&1 | grep -E 'not found|undefined symbol' || true)"
    if [ -n "$missing" ]; then
      log_warn "libguac-client-rdp ($rdp_so) has unresolved symbols/libraries: $missing"
      return 1
    fi
  fi

  # If python3 is present and guacd is listening, perform a live Guacamole protocol probe
  if is_port_listening "$GUACD_HOST" "$GUACD_PORT" && command -v python3 >/dev/null 2>&1; then
    if ! python3 - "$GUACD_HOST" "$GUACD_PORT" << 'PYEOF' >/dev/null 2>&1
import socket, sys
host = sys.argv[1]
port = int(sys.argv[2])
s = socket.create_connection((host, port), timeout=2.5)
s.sendall(b"6.select,3.rdp;")
data = s.recv(4096).decode("utf-8", errors="ignore")
s.close()
if not data.startswith("4.args,"):
    sys.exit(1)
PYEOF
    then
      return 1
    fi
  fi

  return 0
}

# ------------------------------------------------------------------------------
# Requirement 10: Skip with exit 0 if guacd >= minimum with RDP is already running
# ------------------------------------------------------------------------------
if [ "$FORCE_INSTALL" = false ]; then
  CURRENT_BIN="$(command -v guacd 2>/dev/null || true)"
  CURRENT_VER="$(get_guacd_version "$CURRENT_BIN" || true)"
  if [ -n "$CURRENT_VER" ] && version_ge "$CURRENT_VER" "$MIN_GUACD_VERSION"; then
    if is_port_listening "$GUACD_HOST" "$GUACD_PORT" && is_rdp_plugin_loadable; then
      RDP_SO_PATH="$(find_rdp_plugin_so || true)"
      log_info "guacd ${CURRENT_VER} (>= ${MIN_GUACD_VERSION}) is already installed at ${CURRENT_BIN}, listening on ${GUACD_HOST}:${GUACD_PORT}, and RDP plugin (${RDP_SO_PATH}) is loadable. Skipping build."
      exit 0
    fi
  fi
fi

# ------------------------------------------------------------------------------
# Requirement 1: Detect package manager via available commands and /etc/os-release
#                ID / ID_LIKE. Never branch on VERSION_ID.
# ------------------------------------------------------------------------------
OS_ID=""
OS_ID_LIKE=""
if [ -r /etc/os-release ]; then
  OS_ID="$(. /etc/os-release && echo "${ID:-}" | tr '[:upper:]' '[:lower:]')"
  OS_ID_LIKE="$(. /etc/os-release && echo "${ID_LIKE:-}" | tr '[:upper:]' '[:lower:]')"
fi

PKG_MGR=""
OS_FAMILY=""

if command -v apt-get >/dev/null 2>&1 && [[ " $OS_ID $OS_ID_LIKE " =~ (debian|ubuntu) || -f /etc/debian_version ]]; then
  PKG_MGR="apt-get"
  OS_FAMILY="debian"
elif command -v dnf >/dev/null 2>&1 && [[ " $OS_ID $OS_ID_LIKE " =~ (rhel|fedora|centos|rocky|almalinux|ol|amzn) || -f /etc/redhat-release ]]; then
  PKG_MGR="dnf"
  OS_FAMILY="rhel"
elif command -v yum >/dev/null 2>&1 && [[ " $OS_ID $OS_ID_LIKE " =~ (rhel|fedora|centos|rocky|almalinux|ol|amzn) || -f /etc/redhat-release ]]; then
  PKG_MGR="yum"
  OS_FAMILY="rhel"
elif command -v apt-get >/dev/null 2>&1; then
  PKG_MGR="apt-get"
  OS_FAMILY="debian"
elif command -v dnf >/dev/null 2>&1; then
  PKG_MGR="dnf"
  OS_FAMILY="rhel"
elif command -v yum >/dev/null 2>&1; then
  PKG_MGR="yum"
  OS_FAMILY="rhel"
else
  log_error "Unsupported system: no supported package manager (apt-get, dnf, yum) found (ID=${OS_ID}, ID_LIKE=${OS_ID_LIKE})."
  exit 1
fi

log_info "Detected OS family='${OS_FAMILY}' (ID='${OS_ID}', ID_LIKE='${OS_ID_LIKE}'), package manager='${PKG_MGR}'"

wait_for_apt_lock() {
  if [ "$PKG_MGR" != "apt-get" ]; then
    return 0
  fi
  local waited=0
  local max_wait=120
  while fuser /var/lib/dpkg/lock /var/lib/dpkg/lock-frontend /var/lib/apt/lists/lock >/dev/null 2>&1; do
    if [ "$waited" -ge "$max_wait" ]; then
      break
    fi
    sleep 2
    waited=$((waited + 2))
  done
}

# Refresh repositories and enable EPEL/CRB/PowerTools on RHEL-family if needed
if [ "$PKG_MGR" = "apt-get" ]; then
  export DEBIAN_FRONTEND=noninteractive
  wait_for_apt_lock
  log_info "Updating apt package index..."
  apt-get update -y
elif [ "$OS_FAMILY" = "rhel" ]; then
  log_info "Configuring RHEL-family repositories (EPEL / CRB / PowerTools where available)..."
  "$PKG_MGR" install -y epel-release dnf-plugins-core yum-utils 2>/dev/null || "$PKG_MGR" install -y epel-release 2>/dev/null || true
  if command -v crb >/dev/null 2>&1; then
    crb enable 2>/dev/null || true
  fi
  if [ "$PKG_MGR" = "dnf" ]; then
    for repo_cand in crb powertools PowerTools codeready-builder-for-rhel-9-x86_64-rpms codeready-builder-for-rhel-8-x86_64-rpms; do
      dnf config-manager --set-enabled "$repo_cand" 2>/dev/null || true
    done
    dnf makecache -y 2>/dev/null || true
  elif [ "$PKG_MGR" = "yum" ]; then
    for repo_cand in crb powertools PowerTools; do
      yum-config-manager --enable "$repo_cand" 2>/dev/null || true
    done
    yum makecache -y 2>/dev/null || true
  fi
fi

# ------------------------------------------------------------------------------
# Requirement 2: "First available candidate" helper (apt-cache show / dnf info)
# ------------------------------------------------------------------------------
pkg_is_available() {
  local pkg="$1"
  if [ -z "$pkg" ]; then
    return 1
  fi
  if [ "$PKG_MGR" = "apt-get" ]; then
    if ! apt-cache show "$pkg" 2>/dev/null | grep -q '^Package:'; then
      return 1
    fi
    local cand
    cand="$(apt-cache policy "$pkg" 2>/dev/null | awk '/Candidate:/ {print $2; exit}' || true)"
    if [ -z "$cand" ] || [ "$cand" = "(none)" ]; then
      return 1
    fi
    return 0
  elif [ "$PKG_MGR" = "dnf" ]; then
    dnf info "$pkg" >/dev/null 2>&1
    return $?
  elif [ "$PKG_MGR" = "yum" ]; then
    yum info "$pkg" >/dev/null 2>&1
    return $?
  fi
  return 1
}

pkg_install_one() {
  local pkg="$1"
  if [ "$PKG_MGR" = "apt-get" ]; then
    wait_for_apt_lock
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      -o Dpkg::Options::="--force-confdef" \
      -o Dpkg::Options::="--force-confold" "$pkg"
  elif [ "$PKG_MGR" = "dnf" ]; then
    dnf install -y "$pkg"
  elif [ "$PKG_MGR" = "yum" ]; then
    yum install -y "$pkg"
  fi
}

install_first_available() {
  local logical_name="$1"
  local req_mode="$2" # "required" | "optional"
  shift 2
  local candidates=("$@")
  local chosen=""

  for cand in "${candidates[@]}"; do
    if pkg_is_available "$cand"; then
      log_info "Installing ${req_mode} dependency '${logical_name}' using candidate package '${cand}'..."
      if pkg_install_one "$cand"; then
        chosen="$cand"
        log_info "Successfully installed '${cand}' for '${logical_name}'."
        break
      else
        log_warn "Candidate '${cand}' for '${logical_name}' failed to install; trying next candidate..."
      fi
    fi
  done

  if [ -z "$chosen" ]; then
    if [ "$req_mode" = "required" ]; then
      log_error "Required build dependency '${logical_name}' could not be installed. No candidate package was available in ${PKG_MGR} repositories (tried: ${candidates[*]})."
      exit 1
    else
      log_warn "Optional build dependency '${logical_name}' is not available (tried: ${candidates[*]}); skipping."
      return 0
    fi
  fi
  return 0
}

log_info "Installing core build toolchain and utilities..."
if [ "$OS_FAMILY" = "debian" ]; then
  install_first_available "build-essential" required build-essential gcc
  install_first_available "libtool-bin" optional libtool-bin
fi
install_first_available "gcc" required gcc
install_first_available "make" required make
install_first_available "autoconf" required autoconf
install_first_available "automake" required automake
install_first_available "libtool" required libtool
install_first_available "pkg-config" required pkg-config pkgconf pkgconfig
install_first_available "curl" required curl
install_first_available "tar" required tar
install_first_available "ca-certificates" required ca-certificates

# Required library dependencies: cairo, png, jpeg, uuid, ssl, FreeRDP
log_info "Installing required library development packages..."
install_first_available "cairo" required libcairo2-dev libcairo-dev cairo-devel
install_first_available "png" required libpng-dev libpng16-dev libpng12-dev libpng-devel
install_first_available "jpeg" required libjpeg-turbo8-dev libjpeg-turbo-dev libjpeg-dev libjpeg62-turbo-dev libjpeg-turbo-devel libjpeg-devel
install_first_available "uuid" required libossp-uuid-dev uuid-dev libuuid-devel ossp-uuid-devel
install_first_available "ssl" required libssl-dev openssl-devel
install_first_available "FreeRDP" required freerdp3-dev freerdp2-dev libfreerdp-dev freerdp-devel freerdp2-devel freerdp3-devel

# Optional library dependencies: vnc, ssh, pulse, vorbis, webp, pango
log_info "Installing optional library development packages..."
install_first_available "vnc" optional libvncserver-dev libvncserver-devel
install_first_available "ssh" optional libssh2-1-dev libssh2-dev libssh2-devel
install_first_available "pulse" optional libpulse-dev pulseaudio-libs-devel
install_first_available "vorbis" optional libvorbis-dev libvorbis-devel
install_first_available "ogg" optional libogg-dev libogg-devel
install_first_available "webp" optional libwebp-dev libwebp-devel
install_first_available "pango" optional libpango1.0-dev pango-devel
install_first_available "websockets" optional libwebsockets-dev libwebsockets-devel

# ------------------------------------------------------------------------------
# Requirement 3: Download Apache guacamole-server tarball & verify SHA-256
# ------------------------------------------------------------------------------
mkdir -p "$BUILD_ROOT"
TARBALL_NAME="guacamole-server-${GUACD_VERSION}.tar.gz"
TARBALL_PATH="${BUILD_ROOT}/${TARBALL_NAME}"
SHA256_PATH="${BUILD_ROOT}/${TARBALL_NAME}.sha256"

MIRRORS=(
  "https://downloads.apache.org/guacamole/${GUACD_VERSION}/source/${TARBALL_NAME}"
  "https://dlcdn.apache.org/guacamole/${GUACD_VERSION}/source/${TARBALL_NAME}"
  "https://archive.apache.org/dist/guacamole/${GUACD_VERSION}/source/${TARBALL_NAME}"
)

SHA_MIRRORS=(
  "https://downloads.apache.org/guacamole/${GUACD_VERSION}/source/${TARBALL_NAME}.sha256"
  "https://dlcdn.apache.org/guacamole/${GUACD_VERSION}/source/${TARBALL_NAME}.sha256"
  "https://archive.apache.org/dist/guacamole/${GUACD_VERSION}/source/${TARBALL_NAME}.sha256"
)

DOWNLOADED=false
for url in "${MIRRORS[@]}"; do
  log_info "Downloading ${TARBALL_NAME} from ${url} ..."
  if curl -fL --retry 2 --connect-timeout 15 --max-time 300 -o "$TARBALL_PATH" "$url"; then
    if [ -s "$TARBALL_PATH" ] && tar -tzf "$TARBALL_PATH" >/dev/null 2>&1; then
      log_info "Successfully downloaded valid tarball from ${url}"
      DOWNLOADED=true
      break
    else
      log_warn "Downloaded file from ${url} was empty or corrupt; trying next mirror..."
      rm -f "$TARBALL_PATH"
    fi
  else
    log_warn "Failed to download from ${url}; trying next mirror..."
  fi
done

if [ "$DOWNLOADED" = false ]; then
  log_error "Failed to download ${TARBALL_NAME} from all Apache mirrors."
  exit 1
fi

# Verify SHA-256 if available from Apache mirrors
SHA_DOWNLOADED=false
for sha_url in "${SHA_MIRRORS[@]}"; do
  if curl -fsSL --connect-timeout 10 --max-time 30 -o "$SHA256_PATH" "$sha_url" 2>/dev/null && [ -s "$SHA256_PATH" ]; then
    SHA_DOWNLOADED=true
    log_info "Downloaded SHA-256 checksum from ${sha_url}"
    break
  fi
done

if [ "$SHA_DOWNLOADED" = true ] && command -v sha256sum >/dev/null 2>&1; then
  ACTUAL_SHA256="$(sha256sum "$TARBALL_PATH" | awk '{print tolower($1)}')"
  # Handle standard "<hex>  filename" or GPG-formatted hex blocks
  EXPECTED_SHA256="$(tr -d '\r\n ' < "$SHA256_PATH" | grep -oE '[0-9A-Fa-f]{64}' | head -n 1 | tr '[:upper:]' '[:lower:]' || true)"
  if [ -n "$EXPECTED_SHA256" ]; then
    if [ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]; then
      log_error "SHA-256 checksum mismatch for ${TARBALL_NAME}! Expected: ${EXPECTED_SHA256}, Actual: ${ACTUAL_SHA256}"
      exit 1
    fi
    log_info "SHA-256 checksum verified: ${ACTUAL_SHA256}"
  else
    log_warn "Could not parse a 64-char hex digest from ${SHA256_PATH}; proceeding with tar archive integrity verification."
  fi
else
  log_warn "SHA-256 checksum file not retrieved; verified gzip/tar archive structure."
fi

# Extract source tarball
log_info "Extracting ${TARBALL_NAME}..."
tar -xzf "$TARBALL_PATH" -C "$BUILD_ROOT"
SRC_DIR="${BUILD_ROOT}/guacamole-server-${GUACD_VERSION}"
if [ ! -d "$SRC_DIR" ]; then
  SRC_DIR="$(find "$BUILD_ROOT" -maxdepth 1 -type d -name 'guacamole-server-*' | head -n 1 || true)"
fi
if [ -z "$SRC_DIR" ] || [ ! -d "$SRC_DIR" ]; then
  log_error "Source directory not found after extracting ${TARBALL_NAME}."
  exit 1
fi

cd "$SRC_DIR"

# ------------------------------------------------------------------------------
# Requirement 4: ./configure (with --with-systemd-dir only if dir exists)
#                Verify summary shows RDP support enabled; handle FreeRDP
#                version compatibility automatically; never build without RDP.
# ------------------------------------------------------------------------------
SYSTEMD_DIR=""
for sdir in /etc/systemd/system /lib/systemd/system /usr/lib/systemd/system; do
  if [ -d "$sdir" ]; then
    SYSTEMD_DIR="$sdir"
    break
  fi
done

CONFIGURE_ARGS=("--disable-Werror")
if [ -n "$SYSTEMD_DIR" ]; then
  CONFIGURE_ARGS+=("--with-systemd-dir=${SYSTEMD_DIR}")
fi

export CFLAGS="${CFLAGS:-} -O2 -Wno-error -Wno-deprecated-declarations"
export CPPFLAGS="${CPPFLAGS:-} -Wno-error -Wno-deprecated-declarations"

CONFIGURE_SUMMARY="${BUILD_ROOT}/configure-summary.txt"

run_guac_configure() {
  rm -f "$CONFIGURE_SUMMARY"
  log_info "Running ./configure ${CONFIGURE_ARGS[*]} ..."
  if ./configure "${CONFIGURE_ARGS[@]}" 2>&1 | tee "$CONFIGURE_SUMMARY"; then
    return 0
  fi
  return 1
}

check_rdp_enabled_in_summary() {
  if [ ! -f "$CONFIGURE_SUMMARY" ]; then
    return 1
  fi
  # guacamole-server configure summary prints: "   rdp ....... yes" and "   freerdp ............. yes"
  if grep -E -i '^[[:space:]]*rdp[[:space:].]+yes' "$CONFIGURE_SUMMARY" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

if ! run_guac_configure || ! check_rdp_enabled_in_summary; then
  log_warn "Initial ./configure did not enable RDP support (guacamole-server ${GUACD_VERSION} may require FreeRDP 2.x pkg-config files if freerdp3-dev was installed first)."
  if [ -f "$CONFIGURE_SUMMARY" ]; then
    log_warn "Configure output excerpt:"
    tail -n 35 "$CONFIGURE_SUMMARY" >&2 || true
  fi

  # Try alternate compatible FreeRDP dev packages (e.g. freerdp2-dev / libfreerdp-dev / freerdp2-devel / freerdp-devel)
  ALT_FREERDP_INSTALLED=false
  for alt_pkg in freerdp2-dev libfreerdp-dev freerdp2-devel freerdp-devel; do
    if pkg_is_available "$alt_pkg"; then
      log_info "Attempting compatible FreeRDP development package '${alt_pkg}'..."
      if pkg_install_one "$alt_pkg"; then
        ALT_FREERDP_INSTALLED=true
        if run_guac_configure && check_rdp_enabled_in_summary; then
          log_info "RDP support successfully enabled using '${alt_pkg}'."
          break
        fi
      fi
    fi
  done
fi

if ! check_rdp_enabled_in_summary; then
  log_error "guacamole-server ./configure summary does NOT show RDP support (libguac-client-rdp) enabled!"
  log_error "Missing or incompatible FreeRDP development package (expected one of: freerdp2-dev, freerdp3-dev, libfreerdp-dev, freerdp-devel) or its dependencies (libcairo2-dev, libssl-dev, libossp-uuid-dev/uuid-dev)."
  if [ -f "$CONFIGURE_SUMMARY" ]; then
    tail -n 40 "$CONFIGURE_SUMMARY" >&2 || true
  fi
  exit 1
fi

log_info "Verified ./configure summary shows RDP (libguac-client-rdp) support enabled: YES"

# ------------------------------------------------------------------------------
# Requirement 5: make -j$(nproc), make install, ldconfig
# ------------------------------------------------------------------------------
BUILD_JOBS="$(nproc 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || echo 2)"
log_info "Compiling guacamole-server-${GUACD_VERSION} with ${BUILD_JOBS} parallel jobs..."
make -j"${BUILD_JOBS}"

log_info "Installing guacamole-server-${GUACD_VERSION}..."
make install

# Ensure /usr/local/lib and /usr/local/lib64 are in dynamic linker paths across all distros
mkdir -p /etc/ld.so.conf.d 2>/dev/null || true
cat << 'EOF' > /etc/ld.so.conf.d/guacd-local.conf
/usr/local/lib
/usr/local/lib64
EOF
ldconfig

# Locate newly built guacd binary
NEW_GUACD_BIN=""
for candidate_bin in /usr/local/sbin/guacd /usr/local/bin/guacd /usr/sbin/guacd /usr/bin/guacd; do
  if [ -x "$candidate_bin" ]; then
    cand_ver="$(get_guacd_version "$candidate_bin" || true)"
    if [ -n "$cand_ver" ] && version_ge "$cand_ver" "$MIN_GUACD_VERSION"; then
      NEW_GUACD_BIN="$candidate_bin"
      break
    fi
  fi
done

if [ -z "$NEW_GUACD_BIN" ]; then
  log_error "Build completed, but could not find a newly installed guacd binary >= ${MIN_GUACD_VERSION}."
  exit 1
fi

log_info "New guacd binary verified at ${NEW_GUACD_BIN} (version $(get_guacd_version "$NEW_GUACD_BIN"))"

# ------------------------------------------------------------------------------
# Requirement 6: Remove old distro guacd & libguac-client-* ONLY AFTER new build
#                succeeded, and ensure "which guacd" resolves to the new binary
# ------------------------------------------------------------------------------
log_info "Stopping any existing guacd service/processes before removing old distro packages..."
systemctl stop guacd.service 2>/dev/null || service guacd stop 2>/dev/null || true
systemctl disable guacd.service 2>/dev/null || true
pkill -9 guacd 2>/dev/null || true

if [ "$PKG_MGR" = "apt-get" ]; then
  OLD_PKGS="$(dpkg-query -W -f='${Package}\n' 2>/dev/null | grep -E '^(guacd|libguac-client-.*|libguac[0-9]+.*)$' || true)"
  if [ -n "$OLD_PKGS" ]; then
    log_info "Removing old distro Guacamole packages: $(echo "$OLD_PKGS" | tr '\n' ' ')"
    wait_for_apt_lock
    # shellcheck disable=SC2086
    DEBIAN_FRONTEND=noninteractive apt-get remove -y $OLD_PKGS || true
  fi
elif [ "$PKG_MGR" = "dnf" ] || [ "$PKG_MGR" = "yum" ]; then
  OLD_PKGS="$(rpm -qa 2>/dev/null | grep -E '^(guacd|libguac.*)' || true)"
  if [ -n "$OLD_PKGS" ]; then
    log_info "Removing old distro Guacamole RPM packages: $(echo "$OLD_PKGS" | tr '\n' ' ')"
    # shellcheck disable=SC2086
    "$PKG_MGR" remove -y $OLD_PKGS || true
  fi
fi

# Re-run make install & ldconfig in case distro package removal deleted shared paths
cd "$SRC_DIR"
make install >/dev/null 2>&1 || true
ldconfig

# Ensure /usr/sbin/guacd and /usr/bin/guacd point to NEW_GUACD_BIN so "which guacd" always resolves to the new binary
if [ "$NEW_GUACD_BIN" != "/usr/sbin/guacd" ]; then
  ln -sf "$NEW_GUACD_BIN" /usr/sbin/guacd
fi
if [ "$NEW_GUACD_BIN" != "/usr/bin/guacd" ]; then
  ln -sf "$NEW_GUACD_BIN" /usr/bin/guacd
fi
hash -r 2>/dev/null || true

WHICH_GUACD="$(command -v guacd 2>/dev/null || which guacd 2>/dev/null || true)"
log_info "'which guacd' now resolves to: ${WHICH_GUACD} (-> $(readlink -f "$WHICH_GUACD" 2>/dev/null || echo "$WHICH_GUACD"))"

# ------------------------------------------------------------------------------
# Requirement 7: Dedicated user "guacd" with real HOME & writable
#                $HOME/.config/freerdp, validated OPENSSL_CONF if needed,
#                and authoritative /etc/systemd/system/guacd.service
# ------------------------------------------------------------------------------
NOLOGIN_SHELL="/usr/sbin/nologin"
if [ ! -x "$NOLOGIN_SHELL" ] && [ -x /sbin/nologin ]; then
  NOLOGIN_SHELL="/sbin/nologin"
elif [ ! -x "$NOLOGIN_SHELL" ]; then
  NOLOGIN_SHELL="/bin/false"
fi

if ! getent group "$GUACD_USER" >/dev/null 2>&1; then
  groupadd --system "$GUACD_USER"
fi

if ! id -u "$GUACD_USER" >/dev/null 2>&1; then
  useradd --system --gid "$GUACD_USER" --home-dir "$GUACD_HOME" --create-home --shell "$NOLOGIN_SHELL" "$GUACD_USER"
else
  usermod -d "$GUACD_HOME" -g "$GUACD_USER" -s "$NOLOGIN_SHELL" "$GUACD_USER" 2>/dev/null || true
fi

mkdir -p "${GUACD_HOME}/.config/freerdp/certs" "${GUACD_HOME}/.config/freerdp/server"
chown -R "${GUACD_USER}:${GUACD_USER}" "$GUACD_HOME"
chmod 750 "$GUACD_HOME"
chmod -R 770 "${GUACD_HOME}/.config"

# Prepare and validate optional OpenSSL config for legacy TLS/CredSSP peer interoperability
mkdir -p /etc/guacamole
OPENSSL_CNF_PATH="/etc/guacamole/guacd-openssl.cnf"
USE_OPENSSL_CONF=false

if command -v openssl >/dev/null 2>&1; then
  INCLUDE_LINE=""
  if [ -r /etc/ssl/openssl.cnf ]; then
    INCLUDE_LINE=".include /etc/ssl/openssl.cnf"
  elif [ -r /etc/pki/tls/openssl.cnf ]; then
    INCLUDE_LINE=".include /etc/pki/tls/openssl.cnf"
  fi

  cat << EOF > "$OPENSSL_CNF_PATH"
openssl_conf = openssl_init
${INCLUDE_LINE}

[openssl_init]
ssl_conf = ssl_sect

[ssl_sect]
system_default = system_default_sect

[system_default_sect]
CipherString = DEFAULT:@SECLEVEL=0
Options = UnsafeLegacyRenegotiation,ServerPreference
EOF
  chmod 644 "$OPENSSL_CNF_PATH"

  if [ -s "$OPENSSL_CNF_PATH" ] && OPENSSL_CONF="$OPENSSL_CNF_PATH" openssl version >/dev/null 2>&1; then
    USE_OPENSSL_CONF=true
    log_info "Validated OpenSSL configuration at ${OPENSSL_CNF_PATH}"
  else
    log_warn "Custom OpenSSL configuration at ${OPENSSL_CNF_PATH} was rejected by system openssl; omitting OPENSSL_CONF."
    rm -f "$OPENSSL_CNF_PATH"
  fi
fi

# Remove any stale systemd drop-in overrides so our unit file is authoritative
rm -rf /etc/systemd/system/guacd.service.d 2>/dev/null || true

OPENSSL_ENV_LINE=""
if [ "$USE_OPENSSL_CONF" = true ] && [ -f "$OPENSSL_CNF_PATH" ]; then
  OPENSSL_ENV_LINE="Environment=\"OPENSSL_CONF=${OPENSSL_CNF_PATH}\""
fi

log_info "Writing /etc/systemd/system/guacd.service ..."
cat << EOF > /etc/systemd/system/guacd.service
[Unit]
Description=Apache Guacamole Proxy Daemon (guacd)
Documentation=https://guacamole.apache.org/
After=network.target

[Service]
Type=simple
User=${GUACD_USER}
Group=${GUACD_USER}
WorkingDirectory=${GUACD_HOME}
Environment="HOME=${GUACD_HOME}"
Environment="LD_LIBRARY_PATH=/usr/local/lib:/usr/local/lib64"
${OPENSSL_ENV_LINE}
ExecStart=${NEW_GUACD_BIN} -f -b ${GUACD_HOST} -l ${GUACD_PORT} -L info
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

chmod 644 /etc/systemd/system/guacd.service

# ------------------------------------------------------------------------------
# Requirement 8: daemon-reload, enable, restart, wait up to 10s for 127.0.0.1:4822
# ------------------------------------------------------------------------------
log_info "Reloading systemd, enabling and restarting guacd.service..."
systemctl daemon-reload
systemctl enable guacd.service
systemctl restart guacd.service

log_info "Waiting up to 10 seconds for guacd to listen on ${GUACD_HOST}:${GUACD_PORT}..."
LISTENING=false
for _ in $(seq 1 20); do
  if is_port_listening "$GUACD_HOST" "$GUACD_PORT"; then
    LISTENING=true
    break
  fi
  sleep 0.5
done

# ------------------------------------------------------------------------------
# Requirement 9: Final checks, fail loudly:
#   - version >= minimum (numeric compare)
#   - listening on 127.0.0.1:4822
#   - libguac-client-rdp loadable
#   - print systemctl show guacd -p Environment
# ------------------------------------------------------------------------------
FINAL_BIN="$(command -v guacd 2>/dev/null || echo "$NEW_GUACD_BIN")"
FINAL_VER="$(get_guacd_version "$FINAL_BIN" || true)"

if [ -z "$FINAL_VER" ] || ! version_ge "$FINAL_VER" "$MIN_GUACD_VERSION"; then
  log_error "Final check failed: guacd version is '${FINAL_VER:-unknown}' (binary: ${FINAL_BIN}), which is less than minimum required ${MIN_GUACD_VERSION}."
  exit 1
fi
log_info "Final check 1/4 PASSED: guacd version ${FINAL_VER} >= ${MIN_GUACD_VERSION} (${FINAL_BIN})"

if [ "$LISTENING" != true ] || ! is_port_listening "$GUACD_HOST" "$GUACD_PORT"; then
  log_error "Final check failed: guacd is NOT listening on ${GUACD_HOST}:${GUACD_PORT} after 10 seconds."
  systemctl status guacd.service --no-pager >&2 || true
  journalctl -u guacd.service -n 40 --no-pager >&2 || true
  exit 1
fi
log_info "Final check 2/4 PASSED: guacd is active and listening on ${GUACD_HOST}:${GUACD_PORT}"

FINAL_RDP_SO="$(find_rdp_plugin_so || true)"
if [ -z "$FINAL_RDP_SO" ] || ! is_rdp_plugin_loadable; then
  log_error "Final check failed: libguac-client-rdp is missing or not loadable (path: '${FINAL_RDP_SO:-none}')."
  if [ -n "$FINAL_RDP_SO" ] && command -v ldd >/dev/null 2>&1; then
    ldd -r "$FINAL_RDP_SO" >&2 || true
  fi
  exit 1
fi
log_info "Final check 3/4 PASSED: libguac-client-rdp is present and loadable (${FINAL_RDP_SO})"

log_info "Final check 4/4: systemd service Environment:"
systemctl show guacd -p Environment

# Clean up source tree (also handled by EXIT trap)
rm -rf "$BUILD_ROOT" 2>/dev/null || true

echo "=============================================================================="
echo "[guacd-installer] SUCCESS: guacd ${FINAL_VER} with RDP support is active on ${GUACD_HOST}:${GUACD_PORT}"
echo "[guacd-installer] Install log saved at: ${LOG_FILE}"
echo "=============================================================================="
exit 0
