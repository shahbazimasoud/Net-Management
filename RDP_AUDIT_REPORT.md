# In-Browser RDP Architecture & Technical Audit Report (Stage 1)

## 1. System Environment & Component Versions
- **Guacamole Proxy Daemon (`guacd`)**: Version `1.3.0` (Debian GNU/Linux 12 bookworm).
- **Installed RDP Client Plugin**: `libguac-client-rdp0` version `1.3.0-1.1`, backed by `libfreerdp2-2` & `libfreerdp-client2-2` (`2.11.7+dfsg1-6~deb12u1`).
- **Installed VNC Client Plugin**: `libguac-client-vnc0` version `1.3.0-1.1`.
- **Frontend Client**: `guacamole-common-js` `^1.5.0` (with full protocol backwards compatibility to Guacamole 1.3.0 / 0.9.x).
- **Backend Runtime**: Node.js v22 + Express 4.21 + ws 8.21 WebSocket server.

## 2. Server Data Model & Credential Source of Truth
- Storage location: `backend/database_store.json` (`remote_servers` collection).
- Windows Server Fields:
  - `ip`: Server IP / hostname (e.g. `192.168.10.10`).
  - `win_port`: Configured RDP port (defaults to `3389` if unspecified).
  - `win_username`: Windows account username (e.g. `Administrator`).
  - `win_password`: Encrypted/stored Windows password or zero-storage ephemeral prompt.
  - `win_domain`: Active Directory NetBIOS / DNS domain name (e.g. `CORP.INTERNAL` or `CORP`).
  - `os_type`: `'windows'`.

## 3. End-to-End Protocol Flow Analysis
1. User clicks 3-dot menu -> "In-browser RDP".
2. `InBrowserRemoteDesktopModal` opens with configured server context.
3. Frontend calls `POST /api/remote-desktop/token` with `serverId`.
4. Backend verifies authorization and retrieves credentials server-side from `database_store.json`.
5. Frontend connects via `new Guacamole.WebSocketTunnel('/ws/guacamole?token=...')`.
6. Node.js gateway validates single-use token and connects to local `guacd` TCP port 4822.
7. Gateway exchanges Guacamole handshake (`select rdp` -> receives `args` -> sends `size`, `audio`, `connect` with exact mapped arguments).
8. `guacd` initiates FreeRDP session with Windows Server on configured `win_port`.
9. `guacd` sends `ready` with session UUID.
10. Gateway sends tunnel initialization instruction `0.,<uuid>;` and forwards graphics/audio/mouse/key stream bidirectionally.

## 4. Root Causes of Prior Failures & Deficiencies
1. **Daemon State Vulnerability**: `guacd` binary or its RDP plugin was uninstalled or inactive in base container instances.
2. **Generic 10-Second Client Timeout**: Frontend aborted connection after 10s and displayed hardcoded assumption tips ("Ensure target Windows Server has Remote Desktop enabled...") instead of structured error codes from `guacd`.
3. **Missing Pre-flight TCP Validation**: Connection attempts went directly to `guacd` without pre-checking target IP:port reachability, leading to silent connection drops.
4. **Active Directory Credential Discrepancies**: If a user enters `CORP\administrator` in username and `CORP` in domain, the domain could be duplicated or misaligned. A normalization helper (`normalizeRdpCredentials`) is required.
5. **Security Negotiation Specifics**: Guacamole 1.3.0 RDP plugin accepts `security: any | nla | tls | rdp`. With AD servers requiring NLA, structured error parsing must clearly distinguish between network timeouts, unreachable ports, and NLA authentication rejections.

