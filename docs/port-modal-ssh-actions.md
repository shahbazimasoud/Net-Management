# Port Modal SSH Actions Audit & Backend Routing

This document inventories every SSH action performed by the Port Modal (`PortInspectorModal` and related interface inspection/configuration workflows).

In **Phase 5.2.1** and **Phase 5.2.2**, all actions have been fully migrated to route strictly through the authoritative Node.js SSH backend resolver (`server/sshBackendResolver.ts`), reading the saved `ssh_version` from the persistent device record (by device id) and executing via the dedicated virtual environment (`venv_legacy` with Paramiko 2.12.x or `venv_modern` with modern Paramiko). No Port modal action falls back to `/usr/bin/python3`, system Paramiko, or simulated outputs.

---

## Action Inventory

| # | Action Name | Frontend Caller | API Route & Method | Node Handler | Backend Execution / Script | Status |
|---|---|---|---|---|---|---|
| 1 | `ports-sync` | `syncDevicePorts(deviceId)` | `POST /api/devices/:id/ports/sync` | `apiRouter.post('/devices/:id/ports/sync')` | `executeSshBridgeAction('ports-sync')` via `backend/ssh_bridge.py` | **migrated** |
| 2 | `ports-list` | `fetchDevicePorts(deviceId)` | `GET /api/devices/:id/ports` | `apiRouter.get('/devices/:id/ports')` | `executeSshBridgeAction('ports-sync')` fallback via `backend/ssh_bridge.py` | **migrated** |
| 3 | `port-power` | `executeDeviceOperation(deviceId, 'shutdown' \| 'no_shutdown', iface)` | `POST /api/devices/:id/operations` | `apiRouter.post('/devices/:id/operations')` | `executeSshBridgeAction('port-action')` via `backend/ssh_bridge.py` | **migrated** |
| 4 | `port-mode` | `executeDeviceOperation(deviceId, 'mode_trunk' \| 'mode_access', iface)` | `POST /api/devices/:id/operations` | `apiRouter.post('/devices/:id/operations')` | `executeSshBridgeAction('port-action')` via `backend/ssh_bridge.py` | **migrated** |
| 5 | `port-vlan` | `executeDeviceOperation(deviceId, 'set_vlan', iface, { vlan })` | `POST /api/devices/:id/operations` | `apiRouter.post('/devices/:id/operations')` | `executeSshBridgeAction('port-action')` via `backend/ssh_bridge.py` | **migrated** |
| 6 | `port-description` | `executeDeviceOperation(deviceId, 'set_description', iface, { description })` | `POST /api/devices/:id/operations` | `apiRouter.post('/devices/:id/operations')` | `executeSshBridgeAction('port-action')` via `backend/ssh_bridge.py` | **migrated** |
| 7 | `port-security` | `executeDeviceOperation(deviceId, 'port_sec_disable' \| 'port_sec_enable', iface)` | `POST /api/devices/:id/operations` | `apiRouter.post('/devices/:id/operations')` | `executeSshBridgeAction('port-action')` via `backend/ssh_bridge.py` | **migrated** |
| 8 | `port-edit-direct` | `updateSwitchPort(deviceId, portId, updates)` | `PUT /api/devices/:id/ports/:portId` | `apiRouter.put('/devices/:id/ports/:portId')` | `executeSshBridgeAction('port-action')` via `backend/ssh_bridge.py` | **migrated** |
| 9 | `batch-ports-update` | `batchUpdateSwitchPorts(deviceId, portIds, updates)` | `PUT /api/devices/:id/ports/batch` | `apiRouter.put('/devices/:id/ports/batch')` | `executeSshBridgeAction('port-action')` via `backend/ssh_bridge.py` | **migrated** |
| 10 | `write-memory` | `writeMemory(deviceId)` | `POST /api/devices/:id/write-memory` | `apiRouter.post('/devices/:id/write-memory')` | `executeSshBridgeAction('port-action')` via `backend/ssh_bridge.py` | **migrated** |

---

## Architectural Rules Enforced
1. **Device Record Authoritative**: The Node handler retrieves the device by `:id` from the PostgreSQL/authoritative database and inspects `device.ssh_version`. No fallback to request body parameters or hardcoded defaults.
2. **Dedicated Virtual Environment**: The resolver maps `ssh_version` to either `venv_legacy` (Paramiko 2.12.x) or `venv_modern` (Paramiko >=3.4.0). Under no circumstances is `/usr/bin/python3` or system Paramiko invoked.
3. **Authentic Device Output**: Real command responses, stdout chunks, and connection errors are transmitted verbatim to the client without synthetic simulation.
