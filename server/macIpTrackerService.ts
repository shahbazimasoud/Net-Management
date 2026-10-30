import net from 'net';
import fs from 'fs';
import path from 'path';
import { Client, ConnectConfig } from 'ssh2';
import { getAllDevices, addAuditLog, addDeviceCommandLog, getAuditLogs } from './db';
import { resolveDecryptedDeviceCredentials } from './ciscoConfigEngine';

// ============================================================================
// Types and Interfaces
// ============================================================================

export type QueryType = 'mac' | 'ipv4' | 'ipv6' | 'invalid';

export interface NormalizedMac {
  clean: string;           // e.g. 005056a12234
  standard: string;        // e.g. 00:50:56:a1:22:34
  standardUpper: string;   // e.g. 00:50:56:A1:22:34
  cisco: string;           // e.g. 0050.56a1.2234
  ciscoUpper: string;      // e.g. 0050.56A1.2234
  hyphen: string;          // e.g. 00-50-56-a1-22-34
  hyphenUpper: string;     // e.g. 00-50-56-A1-22-34
  oui: string;             // e.g. 00:50:56
}

export interface OuiVendorInfo {
  vendor: string;
  prefix: string;
  isKnown: boolean;
}

export interface ArpTableEntry {
  switchId: string;
  switchName: string;
  switchIp: string;
  ip: string;
  mac: string;
  interface: string;
  vlan?: string;
  age?: string;
  type?: string;
  timestamp?: string;
}

export interface CamTableEntry {
  switchId: string;
  switchName: string;
  switchIp: string;
  switchVendor: string;
  switchRole?: string;
  switchModel?: string;
  vlan: string;
  mac: string;
  type: string; // DYNAMIC, STATIC, etc.
  port: string;
  isUplink?: boolean;
  uplinkReason?: 'cdp_lldp_neighbor' | 'topology_link' | 'port_channel' | 'uplink_naming' | 'none';
  isFinalEdgePort?: boolean;
  peerDeviceName?: string;
  peerDeviceId?: string;
  peerDeviceIp?: string;
  peerPort?: string;
  confidence?: 'high' | 'medium' | 'low';
}

export interface PathHop {
  hopNumber: number;
  switchId: string;
  switchName: string;
  switchIp: string;
  switchRole?: string;
  switchVendor: string;
  port: string;
  vlan: string;
  isEdge: boolean;
  isUplink: boolean;
  peerDeviceName?: string;
  peerPort?: string;
  nextHopName?: string;
}

export interface PathGraphNode {
  id: string;
  label: string;
  sublabel?: string;
  type: 'core' | 'distribution' | 'access' | 'router' | 'endpoint';
  ip?: string;
  mac?: string;
  port?: string;
  vlan?: string;
  isEdge: boolean;
}

export interface PathGraphEdge {
  id: string;
  source: string;
  target: string;
  sourcePort: string;
  targetPort?: string;
  vlan?: string;
  isTrunk: boolean;
}

export interface EdgeCorrelationSummary {
  finalEdgeFound: boolean;
  finalSwitchName?: string;
  finalPort?: string;
  vlan?: string;
  uplinksFilteredCount: number;
  totalSwitchesWithMac: number;
  confidence: 'high' | 'medium' | 'low';
  explanationFa: string;
  explanationEn: string;
}

export interface MacIpTrackerResult {
  query: string;
  queryType: QueryType;
  normalizedMac: NormalizedMac | null;
  resolvedIp: string | null;
  resolvedMac: string | null;
  vendor: OuiVendorInfo;
  camEntries: CamTableEntry[];
  arpEntries: ArpTableEntry[];
  finalEdgePort: CamTableEntry | null;
  edgeSummary: EdgeCorrelationSummary;
  pathHops: PathHop[];
  pathDiagram: string;
  graphNodes: PathGraphNode[];
  graphEdges: PathGraphEdge[];
  switchesScannedCount: number;
  switchesActiveCount: number;
  durationMs: number;
  cached: boolean;
  timestamp: string;
}

export interface TrackerHistoryItem {
  id: string;
  timestamp: string;
  userName: string;
  target: string;
  queryType: string;
  resolvedMac?: string;
  resolvedIp?: string;
  vendor?: string;
  finalPort?: string;
  finalSwitch?: string;
  status: 'success' | 'not_found' | 'error';
  durationMs?: number;
}

// ============================================================================
// Comprehensive Offline OUI Database (IEEE 24-bit Vendor Prefixes)
// ============================================================================

const OUI_DATABASE: Record<string, string> = {
  // Cisco Systems
  '00:00:0C': 'Cisco Systems',
  '00:01:42': 'Cisco Systems',
  '00:01:43': 'Cisco Systems',
  '00:01:63': 'Cisco Systems',
  '00:01:64': 'Cisco Systems',
  '00:01:96': 'Cisco Systems',
  '00:01:97': 'Cisco Systems',
  '00:01:C7': 'Cisco Systems',
  '00:01:C9': 'Cisco Systems',
  '00:02:16': 'Cisco Systems',
  '00:02:17': 'Cisco Systems',
  '00:02:4A': 'Cisco Systems',
  '00:02:4B': 'Cisco Systems',
  '00:02:7D': 'Cisco Systems',
  '00:02:7E': 'Cisco Systems',
  '00:02:B9': 'Cisco Systems',
  '00:02:BA': 'Cisco Systems',
  '00:02:FC': 'Cisco Systems',
  '00:02:FD': 'Cisco Systems',
  '00:03:31': 'Cisco Systems',
  '00:03:32': 'Cisco Systems',
  '00:03:6B': 'Cisco Systems',
  '00:03:6C': 'Cisco Systems',
  '00:04:4D': 'Cisco Systems',
  '00:04:4E': 'Cisco Systems',
  '00:04:9A': 'Cisco Systems',
  '00:04:9B': 'Cisco Systems',
  '00:05:31': 'Cisco Systems',
  '00:05:32': 'Cisco Systems',
  '00:05:5E': 'Cisco Systems',
  '00:05:73': 'Cisco Systems',
  '00:06:52': 'Cisco Systems',
  '00:06:53': 'Cisco Systems',
  '00:07:0D': 'Cisco Systems',
  '00:07:0E': 'Cisco Systems',
  '00:07:4F': 'Cisco Systems',
  '00:07:50': 'Cisco Systems',
  '00:07:7D': 'Cisco Systems',
  '00:07:84': 'Cisco Systems',
  '00:07:B3': 'Cisco Systems',
  '00:08:20': 'Cisco Systems',
  '00:08:21': 'Cisco Systems',
  '00:08:7C': 'Cisco Systems',
  '00:08:A3': 'Cisco Systems',
  '00:08:E2': 'Cisco Systems',
  '00:08:E3': 'Cisco Systems',
  '00:09:43': 'Cisco Systems',
  '00:09:7B': 'Cisco Systems',
  '00:09:B7': 'Cisco Systems',
  '00:09:E8': 'Cisco Systems',
  '00:0A:41': 'Cisco Systems',
  '00:0A:8A': 'Cisco Systems',
  '00:0A:B7': 'Cisco Systems',
  '00:0A:F4': 'Cisco Systems',
  '00:0B:45': 'Cisco Systems',
  '00:0B:5F': 'Cisco Systems',
  '00:0B:BE': 'Cisco Systems',
  '00:0C:30': 'Cisco Systems',
  '00:0C:85': 'Cisco Systems',
  '00:0C:CE': 'Cisco Systems',
  '00:0D:28': 'Cisco Systems',
  '00:0D:65': 'Cisco Systems',
  '00:0D:BC': 'Cisco Systems',
  '00:0D:ED': 'Cisco Systems',
  '00:0E:38': 'Cisco Systems',
  '00:0E:83': 'Cisco Systems',
  '00:0E:D6': 'Cisco Systems',
  '00:0F:23': 'Cisco Systems',
  '00:0F:34': 'Cisco Systems',
  '00:0F:8F': 'Cisco Systems',
  '00:0F:F7': 'Cisco Systems',
  '00:11:20': 'Cisco Systems',
  '00:11:5C': 'Cisco Systems',
  '00:11:92': 'Cisco Systems',
  '00:11:BB': 'Cisco Systems',
  '00:12:00': 'Cisco Systems',
  '00:12:43': 'Cisco Systems',
  '00:12:7F': 'Cisco Systems',
  '00:12:D9': 'Cisco Systems',
  '00:13:19': 'Cisco Systems',
  '00:13:5F': 'Cisco Systems',
  '00:13:7F': 'Cisco Systems',
  '00:13:C3': 'Cisco Systems',
  '00:14:1B': 'Cisco Systems',
  '00:14:69': 'Cisco Systems',
  '00:14:A8': 'Cisco Systems',
  '00:14:F1': 'Cisco Systems',
  '00:15:2B': 'Cisco Systems',
  '00:15:62': 'Cisco Systems',
  '00:15:C6': 'Cisco Systems',
  '00:15:F9': 'Cisco Systems',
  '00:16:46': 'Cisco Systems',
  '00:16:9C': 'Cisco Systems',
  '00:16:C7': 'Cisco Systems',
  '00:17:0E': 'Cisco Systems',
  '00:17:59': 'Cisco Systems',
  '00:17:94': 'Cisco Systems',
  '00:17:DF': 'Cisco Systems',
  '00:18:18': 'Cisco Systems',
  '00:18:73': 'Cisco Systems',
  '00:18:B9': 'Cisco Systems',
  '00:19:06': 'Cisco Systems',
  '00:19:2F': 'Cisco Systems',
  '00:19:55': 'Cisco Systems',
  '00:19:A9': 'Cisco Systems',
  '00:19:E7': 'Cisco Systems',
  '00:1A:2F': 'Cisco Systems',
  '00:1A:6C': 'Cisco Systems',
  '00:1A:A1': 'Cisco Systems',
  '00:1B:0C': 'Cisco Systems',
  '00:1B:2A': 'Cisco Systems',
  '00:1B:53': 'Cisco Systems',
  '00:1B:8F': 'Cisco Systems',
  '00:1B:D4': 'Cisco Systems',
  '00:1C:0E': 'Cisco Systems',
  '00:1C:57': 'Cisco Systems',
  '00:1C:B0': 'Cisco Systems',
  '00:1C:F6': 'Cisco Systems',
  '00:1D:45': 'Cisco Systems',
  '00:1D:70': 'Cisco Systems',
  '00:1D:A1': 'Cisco Systems',
  '00:1D:E5': 'Cisco Systems',
  '00:1E:13': 'Cisco Systems',
  '00:1E:49': 'Cisco Systems',
  '00:1E:79': 'Cisco Systems',
  '00:1E:BD': 'Cisco Systems',
  '00:1E:F6': 'Cisco Systems',
  '00:1F:26': 'Cisco Systems',
  '00:1F:6C': 'Cisco Systems',
  '00:1F:9D': 'Cisco Systems',
  '00:1F:CA': 'Cisco Systems',
  '00:21:1B': 'Cisco Systems',
  '00:21:55': 'Cisco Systems',
  '00:21:A0': 'Cisco Systems',
  '00:21:D7': 'Cisco Systems',
  '00:22:0D': 'Cisco Systems',
  '00:22:55': 'Cisco Systems',
  '00:22:90': 'Cisco Systems',
  '00:22:BD': 'Cisco Systems',
  '00:23:04': 'Cisco Systems',
  '00:23:33': 'Cisco Systems',
  '00:23:5D': 'Cisco Systems',
  '00:23:AC': 'Cisco Systems',
  '00:23:EB': 'Cisco Systems',
  '00:24:13': 'Cisco Systems',
  '00:24:50': 'Cisco Systems',
  '00:24:97': 'Cisco Systems',
  '00:24:C4': 'Cisco Systems',
  '00:24:F7': 'Cisco Systems',
  '00:25:45': 'Cisco Systems',
  '00:25:83': 'Cisco Systems',
  '00:25:B4': 'Cisco Systems',
  '00:26:0B': 'Cisco Systems',
  '00:26:44': 'Cisco Systems',
  '00:26:98': 'Cisco Systems',
  '00:26:CB': 'Cisco Systems',
  '00:27:0C': 'Cisco Systems',

  // MikroTik
  '00:0C:42': 'MikroTik',
  '2C:C8:1B': 'MikroTik',
  '48:8F:5A': 'MikroTik',
  '64:D1:54': 'MikroTik',
  '6C:3B:6B': 'MikroTik',
  '74:4D:28': 'MikroTik',
  'B8:69:F4': 'MikroTik',
  'C4:AD:34': 'MikroTik',
  'CC:2D:E0': 'MikroTik',
  'D4:CA:6D': 'MikroTik',
  'E4:8D:8C': 'MikroTik',
  'F4:1E:26': 'MikroTik',
  'DC:2C:6E': 'MikroTik',
  '08:55:31': 'MikroTik',
  '18:FD:74': 'MikroTik',

  // VMware
  '00:05:69': 'VMware Virtual NIC',
  '00:0C:29': 'VMware Virtual NIC',
  '00:1C:14': 'VMware Virtual NIC',
  '00:50:56': 'VMware Virtual NIC',

  // Intel Corporation
  '00:02:B3': 'Intel Corporation',
  '00:03:47': 'Intel Corporation',
  '00:04:23': 'Intel Corporation',
  '00:07:E9': 'Intel Corporation',
  '00:0E:0C': 'Intel Corporation',
  '00:11:11': 'Intel Corporation',
  '00:13:02': 'Intel Corporation',
  '00:13:20': 'Intel Corporation',
  '00:13:E8': 'Intel Corporation',
  '00:15:00': 'Intel Corporation',
  '00:15:17': 'Intel Corporation',
  '00:16:76': 'Intel Corporation',
  '00:19:D1': 'Intel Corporation',
  '00:1B:21': 'Intel Corporation',
  '00:1C:C0': 'Intel Corporation',
  '00:1D:E0': 'Intel Corporation',
  '00:1E:67': 'Intel Corporation',
  '00:1F:3B': 'Intel Corporation',
  '00:21:5C': 'Intel Corporation',
  '00:21:6A': 'Intel Corporation',
  '00:22:FB': 'Intel Corporation',
  '00:23:14': 'Intel Corporation',
  '00:24:D7': 'Intel Corporation',
  '00:26:C6': 'Intel Corporation',
  '00:27:0E': 'Intel Corporation',
  '34:13:E8': 'Intel Corporation',
  '3C:F8:62': 'Intel Corporation',
  '40:A8:F0': 'Intel Corporation',
  '48:51:B7': 'Intel Corporation',
  '4C:79:BA': 'Intel Corporation',
  '68:05:CA': 'Intel Corporation',
  '70:1A:04': 'Intel Corporation',
  '80:86:F2': 'Intel Corporation',
  '84:A9:3E': 'Intel Corporation',
  '88:AE:DD': 'Intel Corporation',
  '8C:EC:4B': 'Intel Corporation',
  'A0:36:BC': 'Intel Corporation',
  'A4:4C:C8': 'Intel Corporation',
  'B4:96:91': 'Intel Corporation',
  'C8:5B:76': 'Intel Corporation',
  'D4:3B:04': 'Intel Corporation',
  'E8:6A:64': 'Intel Corporation',
  'F8:75:A4': 'Intel Corporation',

  // Apple
  '00:03:93': 'Apple Inc.',
  '00:05:02': 'Apple Inc.',
  '00:0A:27': 'Apple Inc.',
  '00:0A:95': 'Apple Inc.',
  '00:0D:93': 'Apple Inc.',
  '00:10:FA': 'Apple Inc.',
  '00:11:24': 'Apple Inc.',
  '00:14:51': 'Apple Inc.',
  '00:16:CB': 'Apple Inc.',
  '00:17:F2': 'Apple Inc.',
  '00:19:E3': 'Apple Inc.',
  '00:1B:63': 'Apple Inc.',
  '00:1C:B3': 'Apple Inc.',
  '00:1E:52': 'Apple Inc.',
  '00:1E:C2': 'Apple Inc.',
  '00:21:E9': 'Apple Inc.',
  '00:22:41': 'Apple Inc.',
  '00:23:12': 'Apple Inc.',
  '00:23:32': 'Apple Inc.',
  '00:23:69': 'Apple Inc.',
  '00:23:DF': 'Apple Inc.',
  '00:24:36': 'Apple Inc.',
  '00:25:00': 'Apple Inc.',
  '00:25:4B': 'Apple Inc.',
  '00:25:BC': 'Apple Inc.',
  '00:26:08': 'Apple Inc.',
  '00:26:4A': 'Apple Inc.',
  '00:26:B0': 'Apple Inc.',
  '14:10:9F': 'Apple Inc.',
  '14:99:E2': 'Apple Inc.',
  '18:E7:F4': 'Apple Inc.',
  '20:C9:D0': 'Apple Inc.',
  '28:CF:E9': 'Apple Inc.',
  '34:36:3B': 'Apple Inc.',
  '38:CA:84': 'Apple Inc.',
  '40:6C:8F': 'Apple Inc.',
  '44:2A:60': 'Apple Inc.',
  '48:D7:05': 'Apple Inc.',
  '50:EA:D6': 'Apple Inc.',
  '54:26:96': 'Apple Inc.',
  '60:03:08': 'Apple Inc.',
  '68:96:7B': 'Apple Inc.',
  '70:70:8B': 'Apple Inc.',
  '78:7B:8A': 'Apple Inc.',
  '7C:D1:C3': 'Apple Inc.',
  '88:66:5A': 'Apple Inc.',
  '8C:85:90': 'Apple Inc.',
  '90:B0:ED': 'Apple Inc.',
  '94:94:26': 'Apple Inc.',
  '98:01:A7': 'Apple Inc.',
  'A4:83:E7': 'Apple Inc.',
  'A8:66:7F': 'Apple Inc.',
  'AC:BC:32': 'Apple Inc.',
  'B0:34:95': 'Apple Inc.',
  'B8:17:C2': 'Apple Inc.',
  'BC:52:B7': 'Apple Inc.',
  'C0:84:7D': 'Apple Inc.',
  'C8:2A:14': 'Apple Inc.',
  'D0:81:7A': 'Apple Inc.',
  'D8:96:95': 'Apple Inc.',
  'DC:2B:61': 'Apple Inc.',
  'E0:66:78': 'Apple Inc.',
  'E8:06:88': 'Apple Inc.',
  'F0:18:98': 'Apple Inc.',
  'F4:5C:89': 'Apple Inc.',
  'F8:27:93': 'Apple Inc.',

  // Dell
  '00:06:5B': 'Dell Inc.',
  '00:08:74': 'Dell Inc.',
  '00:0B:DB': 'Dell Inc.',
  '00:0D:56': 'Dell Inc.',
  '00:0F:1F': 'Dell Inc.',
  '00:11:43': 'Dell Inc.',
  '00:12:3F': 'Dell Inc.',
  '00:13:72': 'Dell Inc.',
  '00:14:22': 'Dell Inc.',
  '00:15:C5': 'Dell Inc.',
  '00:16:F0': 'Dell Inc.',
  '00:18:8B': 'Dell Inc.',
  '00:19:B9': 'Dell Inc.',
  '00:1A:A0': 'Dell Inc.',
  '00:1C:23': 'Dell Inc.',
  '00:1D:09': 'Dell Inc.',
  '00:1E:4F': 'Dell Inc.',
  '00:1E:C9': 'Dell Inc.',
  '00:21:70': 'Dell Inc.',
  '00:22:19': 'Dell Inc.',
  '00:23:AE': 'Dell Inc.',
  '00:24:E8': 'Dell Inc.',
  '00:26:B9': 'Dell Inc.',
  '18:66:DA': 'Dell Inc.',
  '24:B6:FD': 'Dell Inc.',
  '34:17:EB': 'Dell Inc.',
  '44:A8:42': 'Dell Inc.',
  '5C:F9:DD': 'Dell Inc.',
  '70:5A:0F': 'Dell Inc.',
  '74:86:7A': 'Dell Inc.',
  '84:7B:EB': 'Dell Inc.',
  '90:B1:1C': 'Dell Inc.',
  'A4:BA:DB': 'Dell Inc.',
  'B8:2A:72': 'Dell Inc.',
  'BC:30:5B': 'Dell Inc.',
  'D4:BE:D9': 'Dell Inc.',
  'E4:54:E8': 'Dell Inc.',
  'F0:4D:A2': 'Dell Inc.',
  'F8:DB:88': 'Dell Inc.',

  // HP / HPE / Aruba
  '00:01:E6': 'Hewlett Packard Enterprise',
  '00:08:02': 'Hewlett Packard Enterprise',
  '00:0B:CD': 'Hewlett Packard Enterprise',
  '00:0E:7F': 'Hewlett Packard Enterprise',
  '00:11:0A': 'Hewlett Packard Enterprise',
  '00:13:21': 'Hewlett Packard Enterprise',
  '00:14:C2': 'Hewlett Packard Enterprise',
  '00:16:35': 'Hewlett Packard Enterprise',
  '00:17:A4': 'Hewlett Packard Enterprise',
  '00:18:71': 'Hewlett Packard Enterprise',
  '00:19:BB': 'Hewlett Packard Enterprise',
  '00:1A:4B': 'Hewlett Packard Enterprise',
  '00:1B:78': 'Hewlett Packard Enterprise',
  '00:1C:C4': 'Hewlett Packard Enterprise',
  '00:1E:0B': 'Hewlett Packard Enterprise',
  '00:1F:FE': 'Hewlett Packard Enterprise',
  '00:21:5A': 'Hewlett Packard Enterprise',
  '00:22:64': 'Hewlett Packard Enterprise',
  '00:23:7D': 'Hewlett Packard Enterprise',
  '00:24:81': 'Hewlett Packard Enterprise',
  '00:25:B3': 'Hewlett Packard Enterprise',
  '00:26:55': 'Hewlett Packard Enterprise',
  '00:80:C8': 'Hewlett Packard Enterprise',
  '08:2E:5F': 'Aruba Networks',
  '10:60:4B': 'Hewlett Packard Enterprise',
  '2C:27:D7': 'Hewlett Packard Enterprise',
  '3C:D9:2B': 'Hewlett Packard Enterprise',
  '58:20:B1': 'Hewlett Packard Enterprise',
  '70:10:6F': 'Hewlett Packard Enterprise',
  '9C:8E:99': 'Hewlett Packard Enterprise',
  'AC:16:2D': 'Aruba Networks',
  'D8:9D:67': 'Hewlett Packard Enterprise',

  // Huawei Technologies
  '00:0B:46': 'Huawei Technologies',
  '00:0F:E2': 'Huawei Technologies',
  '00:18:82': 'Huawei Technologies',
  '00:1E:10': 'Huawei Technologies',
  '00:22:A1': 'Huawei Technologies',
  '00:25:9E': 'Huawei Technologies',
  '00:46:4B': 'Huawei Technologies',
  '04:25:C5': 'Huawei Technologies',
  '08:19:A6': 'Huawei Technologies',
  '10:1B:54': 'Huawei Technologies',
  '14:9D:99': 'Huawei Technologies',
  '20:0B:C7': 'Huawei Technologies',
  '28:6E:D4': 'Huawei Technologies',
  '34:00:A3': 'Huawei Technologies',
  '40:4D:8E': 'Huawei Technologies',
  '48:46:FB': 'Huawei Technologies',
  '54:89:98': 'Huawei Technologies',
  '60:DE:44': 'Huawei Technologies',
  '70:79:90': 'Huawei Technologies',
  '80:B6:86': 'Huawei Technologies',
  '90:17:AC': 'Huawei Technologies',
  'A4:71:74': 'Huawei Technologies',
  'AC:E8:7B': 'Huawei Technologies',
  'B8:BC:1B': 'Huawei Technologies',
  'CC:53:B5': 'Huawei Technologies',
  'E4:68:A3': 'Huawei Technologies',

  // Juniper Networks
  '00:05:85': 'Juniper Networks',
  '00:10:DB': 'Juniper Networks',
  '00:12:1E': 'Juniper Networks',
  '00:19:E2': 'Juniper Networks',
  '00:21:59': 'Juniper Networks',
  '00:26:88': 'Juniper Networks',
  '28:C0:DA': 'Juniper Networks',
  '5C:5E:AB': 'Juniper Networks',
  '84:18:88': 'Juniper Networks',

  // Arista Networks
  '00:1C:73': 'Arista Networks',

  // Ubiquiti Networks
  '00:15:6D': 'Ubiquiti Networks',
  '00:27:22': 'Ubiquiti Networks',
  '24:A4:3C': 'Ubiquiti Networks',
  '68:72:51': 'Ubiquiti Networks',
  '78:8A:20': 'Ubiquiti Networks',
  '80:2A:A8': 'Ubiquiti Networks',
  'B4:FB:E4': 'Ubiquiti Networks',
  'DC:9F:DB': 'Ubiquiti Networks',
  'F0:9F:C2': 'Ubiquiti Networks',

  // Fortinet
  '00:09:0F': 'Fortinet Technologies',
  '70:4C:A5': 'Fortinet Technologies',
  '90:6C:AC': 'Fortinet Technologies',
  '00:60:5C': 'Fortinet Technologies',

  // TP-Link
  '00:0A:EB': 'TP-Link Corporation',
  '00:14:78': 'TP-Link Corporation',
  '00:1D:0F': 'TP-Link Corporation',
  '00:21:27': 'TP-Link Corporation',
  '00:23:CD': 'TP-Link Corporation',
  '00:25:86': 'TP-Link Corporation',
  '00:27:19': 'TP-Link Corporation',
  '14:CF:92': 'TP-Link Corporation',
  '14:CC:20': 'TP-Link Corporation',
  '30:B5:C2': 'TP-Link Corporation',
  '50:C7:BF': 'TP-Link Corporation',
  '54:AF:97': 'TP-Link Corporation',
  '70:4F:57': 'TP-Link Corporation',
  '74:05:A5': 'TP-Link Corporation',
  '84:16:F9': 'TP-Link Corporation',
  '90:F6:52': 'TP-Link Corporation',
  'AC:84:C6': 'TP-Link Corporation',
  'C0:25:E9': 'TP-Link Corporation',

  // D-Link
  '00:05:5D': 'D-Link Corporation',
  '00:0D:88': 'D-Link Corporation',
  '00:15:E9': 'D-Link Corporation',
  '00:17:9A': 'D-Link Corporation',
  '00:19:5B': 'D-Link Corporation',
  '00:1B:11': 'D-Link Corporation',
  '00:1C:F0': 'D-Link Corporation',
  '00:1E:58': 'D-Link Corporation',
  '00:21:91': 'D-Link Corporation',
  '00:22:B0': 'D-Link Corporation',
  '00:24:01': 'D-Link Corporation',
  '00:26:5A': 'D-Link Corporation',

  // Microsoft
  '00:03:FF': 'Microsoft Corporation',
  '00:0D:3A': 'Microsoft Hyper-V Virtual NIC',
  '00:12:5A': 'Microsoft Corporation',
  '00:15:5D': 'Microsoft Hyper-V Virtual NIC',
  '00:17:FA': 'Microsoft Corporation',
  '00:1D:D8': 'Microsoft Corporation',
  '00:22:48': 'Microsoft Corporation',
  '00:25:AE': 'Microsoft Corporation',
  '00:50:F2': 'Microsoft Corporation',
  '28:18:78': 'Microsoft Corporation',
  '7C:ED:8D': 'Microsoft Corporation',
  'DC:B4:C4': 'Microsoft Corporation',

  // Raspberry Pi
  'B8:27:EB': 'Raspberry Pi Foundation',
  'DC:A6:32': 'Raspberry Pi Foundation',
  'E4:5F:01': 'Raspberry Pi Foundation',
  '28:CD:C1': 'Raspberry Pi Foundation',

  // Realtek & QEMU
  '00:02:44': 'Realtek Semiconductor',
  '00:07:32': 'Realtek Semiconductor',
  '00:0A:CD': 'Realtek Semiconductor',
  '00:0E:2E': 'Realtek Semiconductor',
  '00:18:E7': 'Realtek Semiconductor',
  '00:26:18': 'Realtek Semiconductor',
  '44:33:4C': 'Realtek Semiconductor',
  '52:54:00': 'QEMU / KVM Virtual NIC',
  '70:85:C2': 'Realtek Semiconductor',

  // Supermicro
  '00:25:90': 'Super Micro Computer',
  '00:30:48': 'Super Micro Computer',
  '0C:C4:7A': 'Super Micro Computer',

  // Samsung Electronics
  '00:00:F0': 'Samsung Electronics',
  '00:02:78': 'Samsung Electronics',
  '00:07:AB': 'Samsung Electronics',
  '00:09:18': 'Samsung Electronics',
  '00:0D:AE': 'Samsung Electronics',
  '00:12:47': 'Samsung Electronics',
  '00:12:FB': 'Samsung Electronics',
  '00:13:77': 'Samsung Electronics',
  '00:15:99': 'Samsung Electronics',
  '00:16:32': 'Samsung Electronics',
  '00:17:C9': 'Samsung Electronics',
  '00:18:AF': 'Samsung Electronics',
  '00:1A:8A': 'Samsung Electronics',
  '00:1B:98': 'Samsung Electronics',
  '00:1C:43': 'Samsung Electronics',
  '00:1D:25': 'Samsung Electronics',
  '00:1E:7D': 'Samsung Electronics',
  '00:1F:CC': 'Samsung Electronics',
  '00:21:19': 'Samsung Electronics',
  '00:21:D1': 'Samsung Electronics',
  '00:23:39': 'Samsung Electronics',
  '00:24:54': 'Samsung Electronics',
  '00:24:91': 'Samsung Electronics',
  '00:26:37': 'Samsung Electronics',
  '00:26:5D': 'Samsung Electronics',
  '08:08:C2': 'Samsung Electronics',
  '14:89:FD': 'Samsung Electronics',
  '34:23:87': 'Samsung Electronics',
  '48:44:F7': 'Samsung Electronics',
  '50:01:D9': 'Samsung Electronics',
  '54:92:BE': 'Samsung Electronics',
  '60:AF:6D': 'Samsung Electronics',
  '84:25:DB': 'Samsung Electronics',
  '94:63:72': 'Samsung Electronics',
  'A0:82:1F': 'Samsung Electronics',
  'BC:44:86': 'Samsung Electronics',
  'C4:73:1E': 'Samsung Electronics',
  'E8:50:8B': 'Samsung Electronics',

  // LG Electronics
  '00:05:C9': 'LG Electronics',
  '00:0E:C7': 'LG Electronics',
  '00:19:A1': 'LG Electronics',
  '00:1C:62': 'LG Electronics',
  '00:1E:75': 'LG Electronics',
  '00:21:FB': 'LG Electronics',
  '00:22:A9': 'LG Electronics',
  '00:24:83': 'LG Electronics',
  '00:26:E2': 'LG Electronics',
  '10:F9:6F': 'LG Electronics',
  '20:3D:66': 'LG Electronics',
  '34:4D:F7': 'LG Electronics',
  '40:B0:FA': 'LG Electronics',
  '58:A2:B5': 'LG Electronics',
  '74:40:BE': 'LG Electronics',
  '88:36:5F': 'LG Electronics',
  'A8:23:FE': 'LG Electronics',
  'B4:E6:2A': 'LG Electronics',
  'CC:2D:83': 'LG Electronics',

  // Google
  '00:1A:11': 'Google Inc.',
  '3C:5A:B4': 'Google Inc.',
  '54:60:09': 'Google Inc.',
  '70:3E:AC': 'Google Inc.',
  '94:EB:CD': 'Google Inc.',
  'A4:77:33': 'Google Inc.',
  'D8:6C:63': 'Google Inc.',
  'E4:F0:42': 'Google Inc.',
  'F8:8F:C2': 'Google Inc.',

  // Sony
  '00:01:4A': 'Sony Corporation',
  '00:04:1F': 'Sony Corporation',
  '00:0A:D9': 'Sony Corporation',
  '00:0E:07': 'Sony Corporation',
  '00:13:15': 'Sony Corporation',
  '00:15:C1': 'Sony Corporation',
  '00:19:C5': 'Sony Corporation',
  '00:1A:80': 'Sony Corporation',
  '00:1D:BA': 'Sony Corporation',
  '00:1F:A7': 'Sony Corporation',
  '00:21:4F': 'Sony Corporation',
  '00:22:A6': 'Sony Corporation',
  '00:24:8D': 'Sony Corporation',
  '00:26:43': 'Sony Corporation',
  '28:0D:FC': 'Sony Corporation',
  '70:9E:29': 'Sony Corporation',
  'F0:BF:97': 'Sony Corporation',
};

// ============================================================================
// Normalization and Validation Helpers
// ============================================================================

/**
 * Accurately detects whether a given input is IPv4, IPv6, MAC address, or invalid.
 */
export function detectQueryType(rawInput: string): QueryType {
  if (!rawInput || typeof rawInput !== 'string') return 'invalid';
  const trimmed = rawInput.trim();
  if (trimmed.length === 0) return 'invalid';

  // Check IPv4 (strict 4 octets separated by 3 dots)
  const dotsCount = (trimmed.match(/\./g) || []).length;
  if (dotsCount === 3) {
    const ipv4Regex = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/;
    const ipMatch = trimmed.match(ipv4Regex);
    if (ipMatch) {
      const octets = [parseInt(ipMatch[1], 10), parseInt(ipMatch[2], 10), parseInt(ipMatch[3], 10), parseInt(ipMatch[4], 10)];
      if (octets.every((o) => o >= 0 && o <= 255)) {
        return 'ipv4';
      }
    }
    return 'invalid';
  }

  // Check Cisco MAC format with exactly 2 dots (e.g. 0050.56a1.2234)
  if (dotsCount === 2) {
    if (/^[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}$/.test(trimmed)) {
      return 'mac';
    }
    return 'invalid';
  }

  // Check Standard Colon MAC format (e.g. 00:50:56:A1:22:34)
  const colonsCount = (trimmed.match(/:/g) || []).length;
  if (colonsCount === 5 && /^([0-9a-fA-F]{1,2}:){5}[0-9a-fA-F]{1,2}$/.test(trimmed)) {
    return 'mac';
  }

  // Check Hyphen MAC format (e.g. 00-50-56-A1-22-34)
  const hyphensCount = (trimmed.match(/-/g) || []).length;
  if (hyphensCount === 5 && /^([0-9a-fA-F]{1,2}-){5}[0-9a-fA-F]{1,2}$/.test(trimmed)) {
    return 'mac';
  }

  // Check Space separated MAC format (e.g. 00 50 56 A1 22 34)
  if (/^([0-9a-fA-F]{1,2}\s+){5}[0-9a-fA-F]{1,2}$/.test(trimmed)) {
    return 'mac';
  }

  // Check Pure Hexadecimal MAC (12 hex chars with no delimiters)
  if (/^[0-9a-fA-F]{12}$/.test(trimmed)) {
    return 'mac';
  }

  // Check IPv6 (contains colons and hexadecimal numbers, at least 2 colons)
  if (colonsCount >= 2 && !trimmed.includes('.')) {
    const ipv6Candidate = trimmed.replace(/^\[|\]$/g, '');
    if (/^[0-9a-fA-F:]+$/.test(ipv6Candidate) && colonsCount <= 7) {
      return 'ipv6';
    }
  }

  return 'invalid';
}

/**
 * Normalizes any valid MAC address representation into standardized formats:
 * - clean: 005056a12234
 * - standard: 00:50:56:a1:22:34
 * - cisco: 0050.56a1.2234
 * - hyphen: 00-50-56-a1-22-34
 * - oui: 00:50:56
 */
export function normalizeMac(rawMac: string): NormalizedMac | null {
  if (!rawMac || typeof rawMac !== 'string') return null;
  const hex = rawMac.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  if (hex.length !== 12) return null;

  const hexUpper = hex.toUpperCase();

  const standard = `${hex.slice(0, 2)}:${hex.slice(2, 4)}:${hex.slice(4, 6)}:${hex.slice(6, 8)}:${hex.slice(8, 10)}:${hex.slice(10, 12)}`;
  const standardUpper = `${hexUpper.slice(0, 2)}:${hexUpper.slice(2, 4)}:${hexUpper.slice(4, 6)}:${hexUpper.slice(6, 8)}:${hexUpper.slice(8, 10)}:${hexUpper.slice(10, 12)}`;

  const cisco = `${hex.slice(0, 4)}.${hex.slice(4, 8)}.${hex.slice(8, 12)}`;
  const ciscoUpper = `${hexUpper.slice(0, 4)}.${hexUpper.slice(4, 8)}.${hexUpper.slice(8, 12)}`;

  const hyphen = `${hex.slice(0, 2)}-${hex.slice(2, 4)}-${hex.slice(4, 6)}-${hex.slice(6, 8)}-${hex.slice(8, 10)}-${hex.slice(10, 12)}`;
  const hyphenUpper = `${hexUpper.slice(0, 2)}-${hexUpper.slice(2, 4)}-${hexUpper.slice(4, 6)}-${hexUpper.slice(6, 8)}-${hexUpper.slice(8, 10)}-${hexUpper.slice(10, 12)}`;

  const oui = `${hexUpper.slice(0, 2)}:${hexUpper.slice(2, 4)}:${hexUpper.slice(4, 6)}`;

  return {
    clean: hex,
    standard,
    standardUpper,
    cisco,
    ciscoUpper,
    hyphen,
    hyphenUpper,
    oui,
  };
}

/**
 * Looks up the NIC manufacturer via the 24-bit OUI database.
 */
export function lookupOuiVendor(normalizedMac: NormalizedMac | string | null): OuiVendorInfo {
  if (!normalizedMac) {
    return { vendor: 'Unknown / Unspecified', prefix: '', isKnown: false };
  }

  const ouiPrefix = typeof normalizedMac === 'string'
    ? (normalizeMac(normalizedMac)?.oui || normalizedMac.slice(0, 8).toUpperCase())
    : normalizedMac.oui;

  const match = OUI_DATABASE[ouiPrefix];
  if (match) {
    return {
      vendor: match,
      prefix: ouiPrefix,
      isKnown: true,
    };
  }

  return {
    vendor: 'Unknown Vendor / Unregistered OUI',
    prefix: ouiPrefix,
    isKnown: false,
  };
}

// ============================================================================
// In-Memory Query Cache (with 60-second TTL)
// ============================================================================

interface CacheEntry {
  data: MacIpTrackerResult;
  expiresAt: number;
}

const trackerCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

function getCachedResult(key: string): MacIpTrackerResult | null {
  const entry = trackerCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    trackerCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedResult(key: string, data: MacIpTrackerResult): void {
  trackerCache.set(key, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  // Keep cache small
  if (trackerCache.size > 200) {
    const oldestKey = trackerCache.keys().next().value;
    if (oldestKey) trackerCache.delete(oldestKey);
  }
}

// ============================================================================
// Network Socket and Device Command Execution Engine
// ============================================================================

/**
 * Fast TCP probe to check if SSH port is reachable before attempting handshake.
 */
function probeTcpSocket(host: string, port: number = 22, timeoutMs: number = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let finished = false;

    const finalize = (ok: boolean) => {
      if (!finished) {
        finished = true;
        try { socket.destroy(); } catch {}
        resolve(ok);
      }
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finalize(true));
    socket.once('timeout', () => finalize(false));
    socket.once('error', () => finalize(false));

    try {
      socket.connect(port, host);
    } catch {
      finalize(false);
    }
  });
}

/**
 * Executes a direct read-only CLI command on a live Cisco or MikroTik device via ssh2.
 * Adheres strictly to Rule 12 adaptive ciphers, in-flight credential security, and low-risk command logging.
 */
async function executeDeviceCliQuery(
  device: any,
  commands: string[],
  operatorUsername: string = 'admin',
  timeoutMs: number = 12000
): Promise<{ success: boolean; output: string; durationMs: number; error?: string }> {
  const startTime = Date.now();
  const creds = await resolveDecryptedDeviceCredentials(device);
  const host = creds.host || device.ip;
  const port = creds.port || device.ssh_port || 22;
  const isMikrotik = (device.platform || '').toLowerCase().includes('mikrotik');

  const fullCommandStr = commands.join('; ');

  // Rule 8: Failure transparency if host is not configured
  if (!host) {
    return {
      success: false,
      output: '',
      durationMs: 0,
      error: 'Target host address is missing.',
    };
  }

  // Pre-probe port 22
  const isPortUp = await probeTcpSocket(host, port, 1200);
  if (!isPortUp) {
    const durationMs = Date.now() - startTime;
    return {
      success: false,
      output: '',
      durationMs,
      error: `TCP port ${port} on ${host} is unreachable or timed out.`,
    };
  }

  return new Promise((resolve) => {
    const conn = new Client();
    let accumulatedOutput = '';
    let isFinished = false;

    const timer = setTimeout(() => {
      finish(false, accumulatedOutput, `SSH query timed out after ${timeoutMs}ms.`);
    }, timeoutMs);

    const finish = async (success: boolean, output: string, error?: string) => {
      if (isFinished) return;
      isFinished = true;
      clearTimeout(timer);
      try { conn.end(); } catch {}

      const durationMs = Date.now() - startTime;

      // Rule 8 & Log Requirement: Log device command audit log in PostgreSQL
      try {
        await addDeviceCommandLog({
          deviceId: device.id,
          deviceName: device.name,
          deviceIp: host,
          deviceVendor: isMikrotik ? 'mikrotik' : 'cisco',
          deviceModel: device.model || '',
          deviceLocation: device.location || '',
          operatorUsername,
          operatorRole: 'Operator',
          channel: 'ssh_mac_ip_tracker',
          command: fullCommandStr,
          riskLevel: 'low',
          status: success ? 'success' : 'failed',
          outputSummary: output.substring(0, 500) || error,
          durationMs,
        });
      } catch (logErr) {
        console.error('[MacIpTracker] Failed to write device command audit log:', logErr);
      }

      resolve({
        success,
        output,
        durationMs,
        error,
      });
    };

    conn.on('keyboard-interactive', (_name, _instructions, _lang, _prompts, finishInteractive) => {
      finishInteractive([creds.password || 'admin']);
    });

    conn.on('error', (err) => {
      finish(false, '', `SSH connection failed: ${err.message}`);
    });

    conn.on('ready', () => {
      conn.shell({ term: 'vt100', cols: 300, rows: 120 }, (err, stream) => {
        if (err) {
          return finish(false, '', `Failed to allocate pseudo-terminal: ${err.message}`);
        }

        stream.on('data', (chunk: Buffer) => {
          accumulatedOutput += chunk.toString('utf-8');
        });

        stream.on('close', () => {
          finish(true, accumulatedOutput);
        });

        try {
          if (isMikrotik) {
            // Send MikroTik commands
            for (const cmd of commands) {
              stream.write(`${cmd}\r\n`);
            }
            setTimeout(() => {
              stream.write('/quit\r\n');
            }, 1200);
          } else {
            // Cisco IOS command sequence
            stream.write('terminal length 0\n');
            stream.write('terminal width 512\n');

            if (creds.enablePassword) {
              stream.write('enable\n');
              setTimeout(() => {
                stream.write(`${creds.enablePassword}\n`);
                stream.write('terminal length 0\n');
              }, 300);
            }

            setTimeout(() => {
              for (const cmd of commands) {
                stream.write(`${cmd}\n`);
              }
              setTimeout(() => {
                stream.write('exit\n');
              }, 600);
            }, 500);
          }
        } catch (writeErr: any) {
          finish(false, accumulatedOutput, writeErr.message);
        }
      });
    });

    // Rule 12: Comprehensive multi-generation adaptive ciphers
    const connectConfig: ConnectConfig = {
      host,
      port,
      username: creds.username || 'admin',
      password: creds.password || 'admin',
      readyTimeout: 10000,
      tryKeyboard: true,
      algorithms: {
        kex: [
          'curve25519-sha256',
          'curve25519-sha256@libssh.org',
          'ecdh-sha2-nistp256',
          'ecdh-sha2-nistp384',
          'ecdh-sha2-nistp521',
          'diffie-hellman-group16-sha512',
          'diffie-hellman-group18-sha512',
          'diffie-hellman-group-exchange-sha256',
          'diffie-hellman-group14-sha256',
          'diffie-hellman-group14-sha1',
          'diffie-hellman-group-exchange-sha1',
          'diffie-hellman-group1-sha1',
        ],
        cipher: [
          'chacha20-poly1305@openssh.com',
          'aes256-gcm@openssh.com',
          'aes128-gcm@openssh.com',
          'aes256-gcm',
          'aes128-gcm',
          'aes256-ctr',
          'aes192-ctr',
          'aes128-ctr',
          'aes256-cbc',
          'aes192-cbc',
          'aes128-cbc',
          '3des-cbc',
        ],
        serverHostKey: [
          'ssh-ed25519',
          'ecdsa-sha2-nistp256',
          'ecdsa-sha2-nistp384',
          'ecdsa-sha2-nistp521',
          'rsa-sha2-512',
          'rsa-sha2-256',
          'ssh-rsa',
          'ssh-dss',
        ],
        hmac: [
          'hmac-sha2-256-etm@openssh.com',
          'hmac-sha2-512-etm@openssh.com',
          'hmac-sha2-256',
          'hmac-sha2-512',
          'hmac-sha1',
          'hmac-sha1-96',
          'hmac-md5',
        ],
      },
    };

    try {
      conn.connect(connectConfig);
    } catch (connErr: any) {
      finish(false, '', connErr.message);
    }
  });
}

// ============================================================================
// CAM & ARP Output Parsers
// ============================================================================

/**
 * Parses Cisco IOS & IOS-XE CAM table outputs (e.g. show mac address-table)
 */
function parseCiscoCamOutput(rawOutput: string, targetMacNormalized: NormalizedMac, device: any): CamTableEntry[] {
  const entries: CamTableEntry[] = [];
  const lines = rawOutput.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('Vlan') || trimmed.startsWith('----') || trimmed.includes('Mac Address Table')) {
      continue;
    }

    // Cisco formats:
    // 10    0050.56a1.2234    DYNAMIC     Gi1/0/5
    // 10    0050.56a1.2234    STATIC      CPU
    // *  10  0050.56a1.2234   dynamic     GigabitEthernet1/0/24
    const match = trimmed.match(/^\*?\s*(\d+|All)\s+([0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4})\s+(\S+)\s+(.+)$/i);
    if (match) {
      const vlan = match[1];
      const macStr = match[2];
      const type = match[3].toUpperCase();
      const port = match[4].trim();

      const parsedNormalized = normalizeMac(macStr);
      if (parsedNormalized && parsedNormalized.clean === targetMacNormalized.clean) {
        entries.push({
          switchId: device.id,
          switchName: device.name || device.ip,
          switchIp: device.ip,
          switchVendor: 'Cisco',
          vlan,
          mac: parsedNormalized.standardUpper,
          type,
          port,
        });
      }
    }
  }

  return entries;
}

/**
 * Parses MikroTik RouterOS Bridge Host table outputs (e.g. /interface bridge host print)
 */
function parseMikrotikCamOutput(rawOutput: string, targetMacNormalized: NormalizedMac, device: any): CamTableEntry[] {
  const entries: CamTableEntry[] = [];
  const lines = rawOutput.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('Flags:') || trimmed.startsWith('Columns:')) {
      continue;
    }

    // MikroTik RouterOS bridge host format:
    // 0   bridge1   00:50:56:A1:22:34   ether5   dynamic
    // or key-value detail: bridge=bridge1 mac-address=00:50:56:A1:22:34 on-interface=ether5 dynamic=yes
    if (trimmed.includes('mac-address=')) {
      const macMatch = trimmed.match(/mac-address=([0-9a-fA-F:]{17})/i);
      const bridgeMatch = trimmed.match(/bridge=([^\s]+)/i);
      const ifaceMatch = trimmed.match(/on-interface=([^\s]+)/i);
      const isDynamic = trimmed.includes('dynamic=yes');

      if (macMatch) {
        const parsedNormalized = normalizeMac(macMatch[1]);
        if (parsedNormalized && parsedNormalized.clean === targetMacNormalized.clean) {
          entries.push({
            switchId: device.id,
            switchName: device.name || device.ip,
            switchIp: device.ip,
            switchVendor: 'MikroTik',
            vlan: bridgeMatch ? bridgeMatch[1] : 'Bridge',
            mac: parsedNormalized.standardUpper,
            type: isDynamic ? 'DYNAMIC' : 'STATIC',
            port: ifaceMatch ? ifaceMatch[1] : 'Unknown',
          });
        }
      }
    } else {
      // Table row format
      const parts = trimmed.split(/\s+/);
      // look for MAC in parts
      for (let i = 0; i < parts.length; i++) {
        const item = parts[i];
        const parsed = normalizeMac(item);
        if (parsed && parsed.clean === targetMacNormalized.clean) {
          const vlan = parts[1] || 'Bridge';
          const port = parts[i + 1] || 'Unknown';
          const type = trimmed.toLowerCase().includes('dynamic') ? 'DYNAMIC' : 'STATIC';
          entries.push({
            switchId: device.id,
            switchName: device.name || device.ip,
            switchIp: device.ip,
            switchVendor: 'MikroTik',
            vlan,
            mac: parsed.standardUpper,
            type,
            port,
          });
          break;
        }
      }
    }
  }

  return entries;
}

/**
 * Parses Cisco IOS ARP table output (show ip arp ...)
 */
function parseCiscoArpOutput(rawOutput: string, device: any): ArpTableEntry[] {
  const entries: ArpTableEntry[] = [];
  const lines = rawOutput.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('Protocol') || trimmed.startsWith('----')) {
      continue;
    }

    // Cisco ARP format:
    // Internet  192.168.10.45          0   0050.56a1.2234  ARPA   Vlan10
    // Internet  10.0.0.1               -   001b.2a34.5678  ARPA   GigabitEthernet0/0
    const match = trimmed.match(/^\s*(Internet|\w+)\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+(\S+)\s+([0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4})\s+(\w+)\s+(\S+)/i);
    if (match) {
      const ip = match[2];
      const age = match[3];
      const macRaw = match[4];
      const type = match[5];
      const iface = match[6];

      const norm = normalizeMac(macRaw);
      if (norm) {
        entries.push({
          switchId: device.id,
          switchName: device.name || device.ip,
          switchIp: device.ip,
          ip,
          mac: norm.standardUpper,
          interface: iface,
          age,
          type,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  return entries;
}

/**
 * Parses MikroTik RouterOS ARP table output (/ip arp print detail)
 */
function parseMikrotikArpOutput(rawOutput: string, device: any): ArpTableEntry[] {
  const entries: ArpTableEntry[] = [];
  const lines = rawOutput.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('Flags:')) {
      continue;
    }

    // Format: address=192.168.10.45 mac-address=00:50:56:A1:22:34 interface=bridge1
    const ipMatch = trimmed.match(/address=(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/i);
    const macMatch = trimmed.match(/mac-address=([0-9a-fA-F:]{17})/i);
    const ifaceMatch = trimmed.match(/interface=([^\s]+)/i);

    if (ipMatch && macMatch) {
      const ip = ipMatch[1];
      const norm = normalizeMac(macMatch[1]);
      if (norm) {
        entries.push({
          switchId: device.id,
          switchName: device.name || device.ip,
          switchIp: device.ip,
          ip,
          mac: norm.standardUpper,
          interface: ifaceMatch ? ifaceMatch[1] : 'Unknown',
          type: trimmed.includes('dynamic=yes') ? 'DYNAMIC' : 'STATIC',
          timestamp: new Date().toISOString(),
        });
      }
    } else {
      // Table output: 0 D 192.168.10.45 00:50:56:A1:22:34 bridge1
      const parts = trimmed.split(/\s+/);
      const ipPart = parts.find((p) => /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(p));
      const macPart = parts.find((p) => /^[0-9a-fA-F:]{17}$/.test(p));
      if (ipPart && macPart) {
        const norm = normalizeMac(macPart);
        if (norm) {
          entries.push({
            switchId: device.id,
            switchName: device.name || device.ip,
            switchIp: device.ip,
            ip: ipPart,
            mac: norm.standardUpper,
            interface: parts[parts.length - 1] || 'Unknown',
            type: trimmed.includes('D') ? 'DYNAMIC' : 'STATIC',
            timestamp: new Date().toISOString(),
          });
        }
      }
    }
  }

  return entries;
}

// ============================================================================
// Topology Uplink & Edge Port Correlation
// ============================================================================

interface TopologyConnection {
  sourceId?: string;
  sourceIp?: string;
  sourceName?: string;
  sourcePort: string;
  targetId?: string;
  targetIp?: string;
  targetName?: string;
  targetPort?: string;
  protocol?: string;
  type?: string;
}

/**
 * Loads all known physical & logical topology links from network_data.json,
 * custom_maps, and cdp_lldp_neighbors.
 */
function loadAllTopologyConnections(): TopologyConnection[] {
  const connections: TopologyConnection[] = [];

  // 1. From network_data.json (links, topology_links, cdp_lldp_neighbors)
  try {
    const netPath = path.join(process.cwd(), 'backend', 'network_data.json');
    if (fs.existsSync(netPath)) {
      const raw = JSON.parse(fs.readFileSync(netPath, 'utf-8'));
      if (Array.isArray(raw.links)) {
        for (const l of raw.links) {
          connections.push({
            sourceId: l.source || l.sourceDeviceId,
            sourceIp: l.sourceDeviceIp,
            sourceName: l.sourceDeviceName,
            sourcePort: l.source_port || l.sourcePort,
            targetId: l.target || l.targetDeviceId,
            targetIp: l.targetDeviceIp,
            targetName: l.targetDeviceName,
            targetPort: l.target_port || l.targetPort,
            type: l.type,
            protocol: l.protocol,
          });
        }
      }
      if (Array.isArray(raw.topology_links)) {
        for (const l of raw.topology_links) {
          connections.push({
            sourceId: l.source || l.sourceDeviceId,
            sourceIp: l.sourceDeviceIp,
            sourceName: l.sourceDeviceName,
            sourcePort: l.source_port || l.sourcePort,
            targetId: l.target || l.targetDeviceId,
            targetIp: l.targetDeviceIp,
            targetName: l.targetDeviceName,
            targetPort: l.target_port || l.targetPort,
            type: l.type,
            protocol: l.protocol,
          });
        }
      }
      if (Array.isArray(raw.cdp_lldp_neighbors)) {
        for (const n of raw.cdp_lldp_neighbors) {
          connections.push({
            sourceId: n.sourceDeviceId,
            sourceIp: n.sourceDeviceIp,
            sourceName: n.sourceDeviceName,
            sourcePort: n.localPort,
            targetId: n.neighborDeviceId,
            targetIp: n.neighborIp,
            targetName: n.neighborName,
            targetPort: n.remotePort,
            protocol: n.protocol,
            type: 'cdp_lldp',
          });
        }
      }
    }
  } catch {}

  // 2. From database_store.json (custom_maps, topology_links)
  try {
    const dbPath = path.join(process.cwd(), 'backend', 'database_store.json');
    if (fs.existsSync(dbPath)) {
      const raw = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      if (Array.isArray(raw.topology_links)) {
        for (const l of raw.topology_links) {
          connections.push({
            sourceId: l.source || l.sourceDeviceId,
            sourceIp: l.sourceDeviceIp,
            sourceName: l.sourceDeviceName,
            sourcePort: l.source_port || l.sourcePort,
            targetId: l.target || l.targetDeviceId,
            targetIp: l.targetDeviceIp,
            targetName: l.targetDeviceName,
            targetPort: l.target_port || l.targetPort,
            type: l.type,
            protocol: l.protocol,
          });
        }
      }
      if (Array.isArray(raw.custom_maps)) {
        for (const m of raw.custom_maps) {
          if (Array.isArray(m.links)) {
            for (const l of m.links) {
              connections.push({
                sourceId: l.source,
                sourcePort: l.source_port || l.sourcePort,
                targetId: l.target,
                targetPort: l.target_port || l.targetPort,
                type: l.type,
                protocol: l.protocol,
              });
            }
          }
        }
      }
    }
  } catch {}

  return connections;
}

/**
 * Calculates hierarchical tier rank for network switches and routers.
 * Rank 1: Router / Gateway / Firewall
 * Rank 2: Core Switch (Spine)
 * Rank 3: Distribution / Aggregation Switch
 * Rank 4: Access Switch (Edge / Floor / Workgroup)
 */
function getSwitchHierarchyRank(device: any): number {
  if (!device) return 4;
  const role = (device.role || '').toLowerCase();
  const type = (device.type || '').toLowerCase();
  const name = (device.name || '').toLowerCase();
  const model = (device.model || '').toLowerCase();

  if (type === 'router' || type === 'firewall' || role.includes('router') || role.includes('firewall') || role.includes('gateway')) {
    return 1;
  }
  if (role.includes('core') || name.includes('core') || name.includes('spine') || model.includes('9500') || model.includes('9600') || model.includes('6500') || model.includes('6800')) {
    return 2;
  }
  if (role.includes('distribution') || role.includes('distro') || role.includes('aggregation') || role.includes('agg') || role.includes('leaf') || name.includes('dist') || model.includes('3850') || model.includes('9300') || model.includes('3750')) {
    return 3;
  }
  if (role.includes('access') || role.includes('edge') || role.includes('floor') || role.includes('workgroup') || name.includes('access') || name.includes('acc') || model.includes('2960') || model.includes('9200')) {
    return 4;
  }
  return 3.5;
}

function isSamePort(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const cleanA = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanB = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleanA === cleanB || cleanA.endsWith(cleanB) || cleanB.endsWith(cleanA);
}

/**
 * Advanced Edge Port Correlator Engine (Phase 2):
 * Correlates CAM table observations across multiple switches with CDP/LLDP topology links
 * to eliminate intermediate uplink/trunk ports and isolate the authentic client edge port.
 */
export function correlateEdgeAndUplinkPorts(
  camEntries: CamTableEntry[],
  allDevices: any[],
  targetMacStr?: string
): {
  correlatedEntries: CamTableEntry[];
  finalEdgePort: CamTableEntry | null;
  edgeSummary: EdgeCorrelationSummary;
  pathHops: PathHop[];
  pathDiagram: string;
  graphNodes: PathGraphNode[];
  graphEdges: PathGraphEdge[];
} {
  if (camEntries.length === 0) {
    return {
      correlatedEntries: [],
      finalEdgePort: null,
      edgeSummary: {
        finalEdgeFound: false,
        uplinksFilteredCount: 0,
        totalSwitchesWithMac: 0,
        confidence: 'low',
        explanationFa: 'هیچ رکوردی در جدول CAM سوئیچ‌ها یافت نشد.',
        explanationEn: 'No records found in switch CAM tables.',
      },
      pathHops: [],
      pathDiagram: 'No path discovered',
      graphNodes: [],
      graphEdges: [],
    };
  }

  const allConnections = loadAllTopologyConnections();
  const deviceMapById = new Map<string, any>();
  const deviceMapByIp = new Map<string, any>();

  for (const d of allDevices) {
    if (d.id) deviceMapById.set(d.id, d);
    if (d.ip) deviceMapByIp.set(d.ip, d);
  }

  // 1. Enrich CAM entries and detect uplinks
  const correlated: CamTableEntry[] = camEntries.map((entry) => {
    const dev = deviceMapById.get(entry.switchId) || deviceMapByIp.get(entry.switchIp);
    const switchRole = dev?.role || 'Access Switch';
    const switchModel = dev?.model || '';

    // A. Check against topology links & CDP/LLDP connections
    let isConnectedToOtherSwitch = false;
    let peerName: string | undefined;
    let peerId: string | undefined;
    let peerIp: string | undefined;
    let peerPort: string | undefined;
    let uplinkReason: CamTableEntry['uplinkReason'] = 'none';

    for (const conn of allConnections) {
      const matchSource =
        (conn.sourceId && conn.sourceId === entry.switchId) ||
        (conn.sourceIp && conn.sourceIp === entry.switchIp) ||
        (conn.sourceName && conn.sourceName.toLowerCase() === entry.switchName.toLowerCase());

      const matchTarget =
        (conn.targetId && conn.targetId === entry.switchId) ||
        (conn.targetIp && conn.targetIp === entry.switchIp) ||
        (conn.targetName && conn.targetName.toLowerCase() === entry.switchName.toLowerCase());

      if (matchSource && isSamePort(conn.sourcePort, entry.port)) {
        isConnectedToOtherSwitch = true;
        peerId = conn.targetId;
        peerIp = conn.targetIp;
        peerName = conn.targetName || (conn.targetId ? deviceMapById.get(conn.targetId)?.name : conn.targetIp);
        peerPort = conn.targetPort;
        uplinkReason = conn.protocol === 'cdp_lldp' ? 'cdp_lldp_neighbor' : 'topology_link';
        break;
      } else if (matchTarget && isSamePort(conn.targetPort, entry.port)) {
        isConnectedToOtherSwitch = true;
        peerId = conn.sourceId;
        peerIp = conn.sourceIp;
        peerName = conn.sourceName || (conn.sourceId ? deviceMapById.get(conn.sourceId)?.name : conn.sourceIp);
        peerPort = conn.sourcePort;
        uplinkReason = conn.protocol === 'cdp_lldp' ? 'cdp_lldp_neighbor' : 'topology_link';
        break;
      }
    }

    // B. Check Port-Channel / LAG / Bonding
    const isPortChannel = /^(po\d+|port-channel\d*|bundle-ether\d*|bonding\d*)/i.test(entry.port);
    if (!isConnectedToOtherSwitch && isPortChannel) {
      isConnectedToOtherSwitch = true;
      uplinkReason = 'port_channel';
    }

    // C. Check modular uplink port naming if other switches exist
    const isModularUplinkNaming =
      /^(te|tengig|tengigabitethernet|fo|fortygig|fortygigabitethernet|hu|hundredgige|twentyfivegige|sfp|uplink|trunk)/i.test(entry.port) ||
      /(port-channel|bundle-ether|bonding)/i.test(entry.port) ||
      /gi1\/0\/2[34]|gi1\/0\/4[78]|te1\/0\/[1-4]|ether-combo/i.test(entry.port) ||
      (camEntries.length > 1 && (switchRole.toLowerCase().includes('core') || switchRole.toLowerCase().includes('spine') || switchRole.toLowerCase().includes('dist')));

    if (!isConnectedToOtherSwitch && isModularUplinkNaming && camEntries.length > 1) {
      isConnectedToOtherSwitch = true;
      uplinkReason = 'uplink_naming';
    }

    return {
      ...entry,
      switchRole,
      switchModel,
      isUplink: isConnectedToOtherSwitch,
      uplinkReason,
      peerDeviceName: peerName,
      peerDeviceId: peerId,
      peerDeviceIp: peerIp,
      peerPort,
    };
  });

  // 2. Classify and isolate the authentic final edge port
  const accessCandidates = correlated.filter((e) => !e.isUplink);
  let finalEdge: CamTableEntry | null = null;
  let confidence: 'high' | 'medium' | 'low' = 'high';

  if (accessCandidates.length === 1) {
    finalEdge = accessCandidates[0];
    finalEdge.isFinalEdgePort = true;
    finalEdge.confidence = 'high';
  } else if (accessCandidates.length > 1) {
    // Multiple access ports: prioritize lowest tier (e.g. Access Switch > Distro > Core)
    accessCandidates.sort((a, b) => {
      const devA = deviceMapById.get(a.switchId) || deviceMapByIp.get(a.switchIp);
      const devB = deviceMapById.get(b.switchId) || deviceMapByIp.get(b.switchIp);
      return getSwitchHierarchyRank(devB) - getSwitchHierarchyRank(devA);
    });
    finalEdge = accessCandidates[0];
    finalEdge.isFinalEdgePort = true;
    finalEdge.confidence = 'high';
  } else if (correlated.length > 0) {
    // All seen ports were flagged as uplinks (e.g. connected via unmanaged daisy-chain or unknown downstream hub)
    // Select the switch with the lowest hierarchy rank
    const sorted = [...correlated].sort((a, b) => {
      const devA = deviceMapById.get(a.switchId) || deviceMapByIp.get(a.switchIp);
      const devB = deviceMapById.get(b.switchId) || deviceMapByIp.get(b.switchIp);
      return getSwitchHierarchyRank(devB) - getSwitchHierarchyRank(devA);
    });
    finalEdge = sorted[0];
    finalEdge.isFinalEdgePort = true;
    finalEdge.confidence = 'medium';
    confidence = 'medium';
  }

  // 3. Build Hop-by-Hop Sequential Packet Path
  // Sort distinct switches from Core / Router (Tier 1/2) down to Access Switch (Tier 4)
  const distinctSwitches = Array.from(new Set(correlated.map((e) => e.switchId)));
  const switchEntriesMap = new Map<string, CamTableEntry>();
  for (const e of correlated) {
    if (!switchEntriesMap.has(e.switchId) || e.isFinalEdgePort) {
      switchEntriesMap.set(e.switchId, e);
    }
  }

  const sortedSwitches = distinctSwitches.map((id) => switchEntriesMap.get(id)!).sort((a, b) => {
    const devA = deviceMapById.get(a.switchId) || deviceMapByIp.get(a.switchIp);
    const devB = deviceMapById.get(b.switchId) || deviceMapByIp.get(b.switchIp);
    return getSwitchHierarchyRank(devA) - getSwitchHierarchyRank(devB);
  });

  const pathHops: PathHop[] = sortedSwitches.map((entry, index) => {
    const nextEntry = sortedSwitches[index + 1];
    return {
      hopNumber: index + 1,
      switchId: entry.switchId,
      switchName: entry.switchName,
      switchIp: entry.switchIp,
      switchRole: entry.switchRole,
      switchVendor: entry.switchVendor,
      port: entry.port,
      vlan: entry.vlan,
      isEdge: Boolean(entry.isFinalEdgePort),
      isUplink: Boolean(entry.isUplink),
      peerDeviceName: entry.peerDeviceName,
      peerPort: entry.peerPort,
      nextHopName: nextEntry ? nextEntry.switchName : 'Endpoint Device',
    };
  });

  // 4. Generate Visual Linear Path Diagram
  const hopDiagramParts = pathHops.map((h) => `[${h.switchName} (${h.port})]`);
  const endpointLabel = targetMacStr ? `[Endpoint Device (${targetMacStr})]` : '[Endpoint Device]';
  hopDiagramParts.push(endpointLabel);
  const pathDiagram = hopDiagramParts.join(' ──► ');

  // 5. Generate Topology Graph Nodes and Edges for Visual Rendering
  const graphNodes: PathGraphNode[] = pathHops.map((h) => {
    const dev = deviceMapById.get(h.switchId) || deviceMapByIp.get(h.switchIp);
    const rank = getSwitchHierarchyRank(dev);
    let type: PathGraphNode['type'] = 'access';
    if (rank <= 1) type = 'router';
    else if (rank <= 2) type = 'core';
    else if (rank <= 3) type = 'distribution';

    return {
      id: h.switchId,
      label: h.switchName,
      sublabel: `${h.switchRole || 'Switch'} • ${h.switchIp}`,
      type,
      ip: h.switchIp,
      port: h.port,
      vlan: h.vlan,
      isEdge: h.isEdge,
    };
  });

  // Add the Endpoint Node
  graphNodes.push({
    id: 'endpoint-client',
    label: targetMacStr || 'Client Device',
    sublabel: 'Connected Endpoint',
    type: 'endpoint',
    mac: targetMacStr,
    isEdge: true,
  });

  const graphEdges: PathGraphEdge[] = [];
  for (let i = 0; i < pathHops.length; i++) {
    const current = pathHops[i];
    const next = pathHops[i + 1];
    if (next) {
      graphEdges.push({
        id: `edge-${current.switchId}-${next.switchId}`,
        source: current.switchId,
        target: next.switchId,
        sourcePort: current.port,
        targetPort: next.port,
        vlan: current.vlan,
        isTrunk: true,
      });
    } else {
      // Connect final hop to endpoint
      graphEdges.push({
        id: `edge-${current.switchId}-endpoint`,
        source: current.switchId,
        target: 'endpoint-client',
        sourcePort: current.port,
        vlan: current.vlan,
        isTrunk: false,
      });
    }
  }

  // 6. Build Edge Summary Breakdown
  const uplinksFilteredCount = correlated.filter((e) => e.isUplink).length;
  const edgeSummary: EdgeCorrelationSummary = {
    finalEdgeFound: Boolean(finalEdge),
    finalSwitchName: finalEdge?.switchName,
    finalPort: finalEdge?.port,
    vlan: finalEdge?.vlan,
    uplinksFilteredCount,
    totalSwitchesWithMac: distinctSwitches.length,
    confidence,
    explanationFa: finalEdge
      ? `پورت ${finalEdge.port} روی سوئیچ ${finalEdge.switchName} به عنوان پورت نهایی اکسس کلاینت شناسایی گردید (${uplinksFilteredCount} پورت ترانک و آپلینک میانی فیلتر شدند).`
      : 'پورت نهایی معتبر کشف نشد.',
    explanationEn: finalEdge
      ? `Port ${finalEdge.port} on switch ${finalEdge.switchName} identified as final client edge port (${uplinksFilteredCount} upstream trunk/uplink ports filtered).`
      : 'No client edge port discovered.',
  };

  return {
    correlatedEntries: correlated,
    finalEdgePort: finalEdge,
    edgeSummary,
    pathHops,
    pathDiagram,
    graphNodes,
    graphEdges,
  };
}

// ============================================================================
// Core Tracker Service Engine (Phase 1)
// ============================================================================

export interface SearchOptions {
  query: string;
  forceRefresh?: boolean;
  operatorUsername?: string;
  clientIp?: string;
}

/**
 * Searches across all switches and routers in the network for a given IP or MAC address.
 */
export async function searchMacOrIp(options: SearchOptions): Promise<MacIpTrackerResult> {
  const startTime = Date.now();
  const rawQuery = (options.query || '').trim();
  const forceRefresh = Boolean(options.forceRefresh);
  const operatorUsername = options.operatorUsername || 'admin';
  const clientIp = options.clientIp || '127.0.0.1';

  const queryType = detectQueryType(rawQuery);

  if (queryType === 'invalid') {
    throw new Error('فرمت ورودی نامعتبر است. لطفاً یک آدرس IP یا MAC معتبر وارد کنید.');
  }

  let normalizedMac: NormalizedMac | null = null;
  let targetIp: string | null = null;

  if (queryType === 'mac') {
    normalizedMac = normalizeMac(rawQuery);
  } else if (queryType === 'ipv4') {
    targetIp = rawQuery;
  }

  const cacheKey = normalizedMac ? `mac:${normalizedMac.clean}` : `ip:${targetIp}`;

  // Check cache first if not force refresh
  if (!forceRefresh) {
    const cached = getCachedResult(cacheKey);
    if (cached) {
      return {
        ...cached,
        cached: true,
        durationMs: Date.now() - startTime,
      };
    }
  }

  // Load all registered devices
  const allDevices = await getAllDevices();
  const switchesAndRouters = allDevices.filter((d: any) => {
    const t = (d.type || '').toLowerCase();
    const r = (d.role || '').toLowerCase();
    return t === 'switch' || t === 'router' || r.includes('switch') || r.includes('router') || t.includes('switch');
  });

  const arpEntries: ArpTableEntry[] = [];
  const camEntries: CamTableEntry[] = [];
  let switchesActiveCount = 0;

  // --------------------------------------------------------------------------
  // Step 1: If input is IP, first resolve MAC address via ARP tables of L3 switches
  // --------------------------------------------------------------------------
  if (targetIp && !normalizedMac) {
    const arpQueries = switchesAndRouters.map(async (device: any) => {
      const isMikrotik = (device.platform || '').toLowerCase().includes('mikrotik');
      const cmds = isMikrotik
        ? [`/ip arp print detail where address="${targetIp}"`]
        : [`show ip arp ${targetIp}`];

      const res = await executeDeviceCliQuery(device, cmds, operatorUsername, 8000);
      if (res.success && res.output) {
        switchesActiveCount++;
        const parsedArp = isMikrotik
          ? parseMikrotikArpOutput(res.output, device)
          : parseCiscoArpOutput(res.output, device);

        for (const entry of parsedArp) {
          if (entry.ip === targetIp) {
            arpEntries.push(entry);
            if (!normalizedMac) {
              normalizedMac = normalizeMac(entry.mac);
            }
          }
        }
      }
    });

    await Promise.allSettled(arpQueries);
  }

  // --------------------------------------------------------------------------
  // Step 2: If we now have a MAC address (either direct or resolved via ARP),
  // query CAM tables across all switches to locate physical ports
  // --------------------------------------------------------------------------
  if (normalizedMac) {
    const camQueries = switchesAndRouters.map(async (device: any) => {
      const isMikrotik = (device.platform || '').toLowerCase().includes('mikrotik');
      const cmds = isMikrotik
        ? [`/interface bridge host print detail where mac-address="${normalizedMac!.standardUpper}"`]
        : [
            `show mac address-table address ${normalizedMac!.cisco}`,
            `show mac-address-table address ${normalizedMac!.cisco}`,
          ];

      const res = await executeDeviceCliQuery(device, cmds, operatorUsername, 9000);
      if (res.success && res.output) {
        switchesActiveCount++;
        const parsedCam = isMikrotik
          ? parseMikrotikCamOutput(res.output, normalizedMac!, device)
          : parseCiscoCamOutput(res.output, normalizedMac!, device);

        camEntries.push(...parsedCam);
      }
    });

    // Also if query was MAC directly, query ARP tables to discover associated IP
    const arpResolveQueries = switchesAndRouters.map(async (device: any) => {
      const isMikrotik = (device.platform || '').toLowerCase().includes('mikrotik');
      const cmds = isMikrotik
        ? [`/ip arp print detail where mac-address="${normalizedMac!.standardUpper}"`]
        : [`show ip arp | include ${normalizedMac!.cisco}`];

      const res = await executeDeviceCliQuery(device, cmds, operatorUsername, 8000);
      if (res.success && res.output) {
        const parsedArp = isMikrotik
          ? parseMikrotikArpOutput(res.output, device)
          : parseCiscoArpOutput(res.output, device);

        for (const entry of parsedArp) {
          const normEntryMac = normalizeMac(entry.mac);
          if (normEntryMac && normEntryMac.clean === normalizedMac!.clean) {
            arpEntries.push(entry);
            if (!targetIp) {
              targetIp = entry.ip;
            }
          }
        }
      }
    });

    await Promise.allSettled([...camQueries, ...arpResolveQueries]);
  }

  // Step 3: OUI Vendor Identification
  const vendorInfo = lookupOuiVendor(normalizedMac);

  // Step 4: Edge port and uplink correlation (Phase 2 Correlator Engine)
  const {
    correlatedEntries,
    finalEdgePort,
    edgeSummary,
    pathHops,
    pathDiagram,
    graphNodes,
    graphEdges,
  } = correlateEdgeAndUplinkPorts(camEntries, allDevices, normalizedMac ? normalizedMac.standardUpper : undefined);

  const durationMs = Date.now() - startTime;
  const isFound = correlatedEntries.length > 0 || arpEntries.length > 0;

  const result: MacIpTrackerResult = {
    query: rawQuery,
    queryType,
    normalizedMac,
    resolvedIp: targetIp,
    resolvedMac: normalizedMac ? normalizedMac.standardUpper : null,
    vendor: vendorInfo,
    camEntries: correlatedEntries,
    arpEntries,
    finalEdgePort,
    edgeSummary,
    pathHops,
    pathDiagram,
    graphNodes,
    graphEdges,
    switchesScannedCount: switchesAndRouters.length,
    switchesActiveCount,
    durationMs,
    cached: false,
    timestamp: new Date().toISOString(),
  };

  // Cache results
  setCachedResult(cacheKey, result);

  // --------------------------------------------------------------------------
  // Step 5: Audit Logging in PostgreSQL (topology_network / MAC_IP_TRACKER_LOOKUP)
  // --------------------------------------------------------------------------
  try {
    await addAuditLog({
      category: 'topology_network',
      action: 'MAC_IP_TRACKER_LOOKUP',
      target: rawQuery,
      status: isFound ? 'success' : 'not_found',
      user_name: operatorUsername,
      ip_address: clientIp,
      details: {
        query: rawQuery,
        queryType,
        normalizedMac: normalizedMac ? normalizedMac.standardUpper : null,
        resolvedIp: targetIp,
        vendor: vendorInfo.vendor,
        switchesScanned: switchesAndRouters.length,
        finalPort: finalEdgePort ? `${finalEdgePort.switchName} [${finalEdgePort.port}]` : null,
        durationMs,
        cached: false,
      },
    });
  } catch (auditErr) {
    console.error('[MacIpTracker] Failed to record portal audit log in PostgreSQL:', auditErr);
  }

  return result;
}

/**
 * Retrieves the recent search history from the PostgreSQL audit_logs table.
 */
export async function getMacIpTrackerHistory(limit: number = 30): Promise<TrackerHistoryItem[]> {
  try {
    const rawLogs = await getAuditLogs(200);
    const filtered = rawLogs.filter(
      (l: any) => l.category === 'topology_network' && l.action === 'MAC_IP_TRACKER_LOOKUP'
    );

    return filtered.slice(0, limit).map((log: any) => {
      let details: any = {};
      try {
        details = typeof log.details === 'string' ? JSON.parse(log.details) : (log.details || {});
      } catch {}

      return {
        id: log.id || `hist-${Date.now()}`,
        timestamp: log.timestamp || new Date().toISOString(),
        userName: log.user_name || log.userName || 'admin',
        target: log.target || details.query || 'Unknown',
        queryType: details.queryType || 'mac',
        resolvedMac: details.normalizedMac || null,
        resolvedIp: details.resolvedIp || null,
        vendor: details.vendor || null,
        finalPort: details.finalPort || null,
        finalSwitch: details.finalPort ? details.finalPort.split('[')[0].trim() : null,
        status: log.status === 'success' ? 'success' : (log.status === 'error' ? 'error' : 'not_found'),
        durationMs: details.durationMs || 0,
      };
    });
  } catch (err: any) {
    console.error('[MacIpTracker] Failed to fetch search history from audit logs:', err);
    return [];
  }
}
