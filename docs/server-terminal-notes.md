# Server SSH Terminal Architecture & Integration Notes

## 1. Overview
This document outlines the architecture, flow, library dependencies, and WebSocket message protocols of the **Linux Server SSH Terminal** launched from the 3-dot contextual menu ("SSH Terminal") on the **Remote Servers & Automation Fleet** page.

---

## 2. Component & Connection Flow

```
[User clicks 3-dot menu -> "SSH Terminal" in RemoteServersView.tsx]
                                 │
                                 ▼
                     [LinuxTerminalModal.tsx]
                                 │
                     (getRemoteServerWebSocketUrl)
                                 │
                                 ▼
       WebSocket: ws://<host>/ws/ssh/<serverId>?deviceId=...
                                 │
                                 ▼
                   [Node.js Server: server.ts]
                                 │
                               (upgrade)
                                 │
                                 ▼
            [Terminal Gateway: server/terminalWs.ts]
                                 │
         1. Parse URL params (host, port, user, pass, shell)
         2. Lookup server in backend store (database_store.json)
         3. Decrypt Fernet credentials (AES-128-CBC)
         4. Verify PostgreSQL RBAC policy (isServerActionPermitted)
         5. Allocate Client from `ssh2`
                                 │
                                 ▼
              [Target Linux Host (SSH Port 22/custom)]
               - Request interactive PTY: term 'xterm-256color'
               - Launch shell: /bin/bash or /bin/zsh
               - Stream unbuffered raw stdout & stderr to WebSocket
```

### Key Frontend Components:
- **`src/components/servers/RemoteServersView.tsx`**: Fleet listing; triggers `handleOpenLinuxTerminal(server, 'bash')`.
- **`src/components/servers/LinuxTerminalModal.tsx`**: Modal window managing terminal panes, command history, and the contextual autocomplete popup (`LinuxIntelliSenseDropdown`).
- **`src/services/api.ts`**: Provides `getRemoteServerWebSocketUrl(serverId, shell, serverInfo)`.

### Key Backend Handlers:
- **`server.ts`**: Express HTTP server handling HTTP upgrade for `/ws/ssh/*` and `/ws/terminal/*`.
- **`server/terminalWs.ts`**: The WebSocket gateway managing SSH connections, PTY creation, streaming, and window resizing.

---

## 3. SSH Library & PTY Execution

- **Library**: `ssh2` (v1.16.0) - Native Node.js SSH client implementation.
- **PTY Allocation**:
  - `sshConn.shell({ term: 'xterm-256color', cols: initialCols, rows: initialRows }, callback)`
  - Automatically sends `pty-req` requesting terminal type `xterm-256color` and geometry (`cols`, `rows`), followed by `shell` request.
- **Window Resizing**:
  - `activeStream.setWindow(rows, cols, 0, 0)` invokes SSH window-change protocol (`window-change` message) to notify remote PTY when dimensions change.
- **Output Streaming**:
  - `stream.on('data')` (stdout) and `stream.stderr.on('data')` (stderr) are piped without buffering, line splitting, or ANSI escape sequence alteration.
  - Multi-byte UTF-8 boundaries are preserved using `StringDecoder('utf-8')`.

---

## 4. WebSocket Message Formats

### Client -> Server:
1. **Raw Keystrokes**:
   - Plain string or binary `Buffer` sent directly to the remote shell stream (`activeStream.write`).
2. **JSON Control Messages**:
   - `{ "type": "input", "data": "command\r" }`: Key/command payload.
   - `{ "type": "resize", "cols": 120, "rows": 36 }`: Terminal window resize notification.
   - `{ "type": "ping" }`: Client keepalive ping.
   - `{ "type": "close" }`: Clean terminal session termination.

### Server -> Client:
1. **Data Stream**:
   - `{ "type": "data", "data": "<raw-pty-output-including-ansi>" }`: Raw stream from stdout and stderr.
2. **Status Updates**:
   - `{ "type": "status", "status": "connecting", "host": "...", "port": 22 }`
   - `{ "type": "status", "status": "connected", "is_real": true, "host": "...", "port": 22, "username": "..." }`
   - `{ "type": "status", "status": "failed", "error": "...", "message": "..." }`
   - `{ "type": "status", "status": "disconnected", "message": "..." }`
3. **Control Responses**:
   - `{ "type": "pong" }`: Response to ping.
   - `{ "type": "error", "error": "..." }`: Direct error notification with authentic failure details.
