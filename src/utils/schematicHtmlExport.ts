import {
  CustomTopologyLink,
  CustomTopologyMap,
  CustomTopologyRack,
  CustomTopologyStickyNote,
  CustomTopologyTower,
  Device,
  TopologyLink,
} from '../types';

export type SchematicExportMode = 'card' | 'physical' | 'both';

export interface SchematicExportDeviceItem {
  id: string;
  name: string;
  ip: string;
  type: string;
  model: string;
  platform: string;
  role: string;
  is_online: boolean;
  latency_ms: number | null;
  mac_address: string;
  building: string;
  floor: string;
  unit: string;
  rack: string;
  total_ports: number;
  active_ports: number;
  cardPos: { x: number; y: number };
  physicalPos: { x: number; y: number };
  vlans: number[];
  ports: Array<{
    name: string;
    status: string;
    mode: string;
    vlan: number | null;
    trunk_vlans: string;
    speed: string;
    description: string;
  }>;
}

export interface SchematicExportLinkRow {
  id: string;
  sourceDeviceId: string;
  sourceDeviceName: string;
  sourceIp: string;
  sourcePort: string;
  sourceMode: 'trunk' | 'access';
  sourceVlan: number | null;
  targetDeviceId: string;
  targetDeviceName: string;
  targetIp: string;
  targetPort: string;
  targetMode: 'trunk' | 'access';
  targetVlan: number | null;
  vlans: number[];
  cableType: string;
  speed: string;
  status: string;
  protocol: string;
  notes: string;
}

export interface SchematicVlanSummaryRow {
  vlanId: number;
  linkCount: number;
  trunkLinks: number;
  accessLinks: number;
  activeLinks: number;
  downLinks: number;
  deviceNames: string[];
  portCount: number;
}

export interface SchematicVlanExtraction {
  uniqueVlans: number[];
  vlanSummaries: SchematicVlanSummaryRow[];
  linkRows: SchematicExportLinkRow[];
  portVlanRows: Array<{
    deviceId: string;
    deviceName: string;
    deviceIp: string;
    portName: string;
    mode: string;
    vlan: number | null;
    trunkVlans: string;
    status: string;
    speed: string;
    description: string;
  }>;
}

export interface BuildSchematicHtmlOptions {
  map: CustomTopologyMap | null;
  mapName: string;
  mapDescription?: string;
  devices: Device[];
  customLinks: CustomTopologyLink[];
  topologyLinks?: TopologyLink[];
  racks: CustomTopologyRack[];
  towers: CustomTopologyTower[];
  stickyNotes: CustomTopologyStickyNote[];
  cardPositions: Map<string, { x: number; y: number }>;
  physicalPositions: Map<string, { x: number; y: number }>;
  exportMode: SchematicExportMode;
  includeVlanTable: boolean;
  includePortVlanDirectory: boolean;
  includeStickyNotes: boolean;
  isLightMode: boolean;
  isEn: boolean;
  exportedBy?: string;
  exportedAt?: string;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonForScript(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function parseVlanListString(raw?: string | number | number[] | null): number[] {
  if (raw === null || raw === undefined) return [];
  if (typeof raw === 'number') {
    return Number.isInteger(raw) && raw >= 1 && raw <= 4094 ? [raw] : [];
  }
  if (Array.isArray(raw)) {
    return raw
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 4094);
  }
  const str = String(raw).trim();
  if (!str || /^all$/i.test(str) || /^none$/i.test(str)) return [];
  const out = new Set<number>();
  for (const token of str.split(/[,\s;]+/)) {
    const clean = token.trim();
    if (!clean) continue;
    if (/^\d+$/.test(clean)) {
      const v = parseInt(clean, 10);
      if (v >= 1 && v <= 4094) out.add(v);
    } else if (/^(\d+)-(\d+)$/.test(clean)) {
      const [, aStr, bStr] = clean.match(/^(\d+)-(\d+)$/) || [];
      const a = parseInt(aStr, 10);
      const b = parseInt(bStr, 10);
      if (a >= 1 && b <= 4094 && a <= b && b - a <= 64) {
        for (let v = a; v <= b; v++) out.add(v);
      }
    }
  }
  return Array.from(out).sort((a, b) => a - b);
}

function extractDevicePortVlans(dev: Device): number[] {
  const set = new Set<number>();
  const ports = Array.isArray(dev.ports) ? dev.ports : [];
  for (const p of ports as any[]) {
    if (p?.vlan !== null && p?.vlan !== undefined) {
      const v = Number(p.vlan);
      if (Number.isInteger(v) && v >= 1 && v <= 4094) set.add(v);
    }
    if (p?.native_vlan !== null && p?.native_vlan !== undefined) {
      const v = Number(p.native_vlan);
      if (Number.isInteger(v) && v >= 1 && v <= 4094) set.add(v);
    }
    for (const tv of parseVlanListString(p?.trunk_vlans || p?.allowed_vlans)) {
      set.add(tv);
    }
  }
  return Array.from(set).sort((a, b) => a - b);
}

function findPortVlanOnDevice(dev: Device | undefined, portName: string): number | null {
  if (!dev || !portName || !Array.isArray(dev.ports)) return null;
  const target = portName.trim().toLowerCase();
  const match = (dev.ports as any[]).find(
    (p) => String(p?.name || p?.id || '').trim().toLowerCase() === target
  );
  if (!match) return null;
  const v = Number(match.vlan ?? match.native_vlan);
  return Number.isInteger(v) && v >= 1 && v <= 4094 ? v : null;
}

export function extractSchematicVlanSummary(
  devices: Device[],
  customLinks: CustomTopologyLink[],
  topologyLinks: TopologyLink[] = []
): SchematicVlanExtraction {
  const deviceMap = new Map<string, Device>();
  for (const d of devices) {
    if (d?.id) deviceMap.set(String(d.id).trim(), d);
  }

  const linkRows: SchematicExportLinkRow[] = [];
  const seenKeys = new Set<string>();

  for (const l of customLinks || []) {
    const srcDev = deviceMap.get(String(l.sourceDeviceId).trim());
    const tgtDev = deviceMap.get(String(l.targetDeviceId).trim());
    const srcVlan =
      typeof l.sourceVlan === 'number' && Number.isInteger(l.sourceVlan) && l.sourceVlan >= 1
        ? l.sourceVlan
        : findPortVlanOnDevice(srcDev, l.sourcePort);
    const tgtVlan =
      typeof l.targetVlan === 'number' && Number.isInteger(l.targetVlan) && l.targetVlan >= 1
        ? l.targetVlan
        : findPortVlanOnDevice(tgtDev, l.targetPort);

    const vlansSet = new Set<number>();
    if (srcVlan) vlansSet.add(srcVlan);
    if (tgtVlan) vlansSet.add(tgtVlan);

    // Also pull trunk allowed VLANs from matching device ports if trunk mode
    if (l.sourceMode === 'trunk' && srcDev && Array.isArray(srcDev.ports)) {
      const sp = (srcDev.ports as any[]).find(
        (p) => String(p?.name || '').trim().toLowerCase() === String(l.sourcePort || '').trim().toLowerCase()
      );
      for (const tv of parseVlanListString(sp?.trunk_vlans || sp?.allowed_vlans)) vlansSet.add(tv);
    }
    if (l.targetMode === 'trunk' && tgtDev && Array.isArray(tgtDev.ports)) {
      const tp = (tgtDev.ports as any[]).find(
        (p) => String(p?.name || '').trim().toLowerCase() === String(l.targetPort || '').trim().toLowerCase()
      );
      for (const tv of parseVlanListString(tp?.trunk_vlans || tp?.allowed_vlans)) vlansSet.add(tv);
    }

    const row: SchematicExportLinkRow = {
      id: l.id,
      sourceDeviceId: l.sourceDeviceId,
      sourceDeviceName: srcDev?.name || l.sourceDeviceId,
      sourceIp: l.sourceIp || srcDev?.ip || '',
      sourcePort: l.sourcePort || '-',
      sourceMode: l.sourceMode || 'access',
      sourceVlan: srcVlan,
      targetDeviceId: l.targetDeviceId,
      targetDeviceName: tgtDev?.name || l.targetDeviceId,
      targetIp: l.targetIp || tgtDev?.ip || '',
      targetPort: l.targetPort || '-',
      targetMode: l.targetMode || 'access',
      targetVlan: tgtVlan,
      vlans: Array.from(vlansSet).sort((a, b) => a - b),
      cableType: l.cableType || 'copper',
      speed: l.speed || '1G',
      status: l.status || 'active',
      protocol: 'Manual / Cabling',
      notes: l.notes || '',
    };
    linkRows.push(row);
    seenKeys.add(`${l.sourceDeviceId}|${l.sourcePort}|${l.targetDeviceId}|${l.targetPort}`.toLowerCase());
  }

  // Merge discovered CDP/LLDP topology links for devices present in this map (if not duplicated)
  for (const tl of topologyLinks || []) {
    if (!deviceMap.has(String(tl.source).trim()) || !deviceMap.has(String(tl.target).trim())) continue;
    const keyFwd = `${tl.source}|${tl.source_port}|${tl.target}|${tl.target_port}`.toLowerCase();
    const keyRev = `${tl.target}|${tl.target_port}|${tl.source}|${tl.source_port}`.toLowerCase();
    if (seenKeys.has(keyFwd) || seenKeys.has(keyRev)) continue;

    const srcDev = deviceMap.get(String(tl.source).trim());
    const tgtDev = deviceMap.get(String(tl.target).trim());
    const vlanNum =
      typeof tl.vlan === 'number' && Number.isInteger(tl.vlan) && tl.vlan >= 1 && tl.vlan <= 4094
        ? tl.vlan
        : null;

    linkRows.push({
      id: tl.id,
      sourceDeviceId: tl.source,
      sourceDeviceName: srcDev?.name || tl.source,
      sourceIp: srcDev?.ip || '',
      sourcePort: tl.source_port || '-',
      sourceMode: tl.type === 'trunk' ? 'trunk' : 'access',
      sourceVlan: vlanNum,
      targetDeviceId: tl.target,
      targetDeviceName: tgtDev?.name || tl.target,
      targetIp: tgtDev?.ip || '',
      targetPort: tl.target_port || '-',
      targetMode: tl.type === 'trunk' ? 'trunk' : 'access',
      targetVlan: vlanNum,
      vlans: vlanNum ? [vlanNum] : [],
      cableType: tl.type === 'trunk' ? 'fiber' : 'copper',
      speed: tl.speed || '1G',
      status: tl.status || 'active',
      protocol: tl.protocol || 'Discovery',
      notes: '',
    });
    seenKeys.add(keyFwd);
  }

  // Port-level VLAN directory across every device on the map
  const portVlanRows: SchematicVlanExtraction['portVlanRows'] = [];
  for (const dev of devices) {
    const ports = Array.isArray(dev.ports) ? dev.ports : [];
    for (const p of ports as any[]) {
      const vlanNum =
        p?.vlan !== null && p?.vlan !== undefined && Number.isInteger(Number(p.vlan)) && Number(p.vlan) >= 1
          ? Number(p.vlan)
          : null;
      const trunkRaw = String(p?.trunk_vlans || p?.allowed_vlans || '').trim();
      if (vlanNum !== null || trunkRaw.length > 0 || String(p?.mode || '').toLowerCase() === 'trunk') {
        portVlanRows.push({
          deviceId: dev.id,
          deviceName: dev.name,
          deviceIp: dev.ip || '',
          portName: String(p?.name || p?.id || '-'),
          mode: String(p?.mode || 'access').toLowerCase(),
          vlan: vlanNum,
          trunkVlans: trunkRaw,
          status: String(p?.status || 'down').toLowerCase(),
          speed: String(p?.speed || '-'),
          description: String(p?.description || ''),
        });
      }
    }
  }

  // Aggregate unique VLAN summaries
  const summaryMap = new Map<
    number,
    {
      linkCount: number;
      trunkLinks: number;
      accessLinks: number;
      activeLinks: number;
      downLinks: number;
      deviceNames: Set<string>;
      portCount: number;
    }
  >();

  const ensureVlan = (v: number) => {
    if (!summaryMap.has(v)) {
      summaryMap.set(v, {
        linkCount: 0,
        trunkLinks: 0,
        accessLinks: 0,
        activeLinks: 0,
        downLinks: 0,
        deviceNames: new Set<string>(),
        portCount: 0,
      });
    }
    return summaryMap.get(v)!;
  };

  for (const lr of linkRows) {
    const isTrunk = lr.sourceMode === 'trunk' || lr.targetMode === 'trunk';
    const isDown = lr.status === 'down';
    for (const v of lr.vlans) {
      const entry = ensureVlan(v);
      entry.linkCount++;
      if (isTrunk) entry.trunkLinks++;
      else entry.accessLinks++;
      if (isDown) entry.downLinks++;
      else entry.activeLinks++;
      if (lr.sourceDeviceName) entry.deviceNames.add(lr.sourceDeviceName);
      if (lr.targetDeviceName) entry.deviceNames.add(lr.targetDeviceName);
    }
  }

  for (const pr of portVlanRows) {
    const vlansOnPort = new Set<number>();
    if (pr.vlan) vlansOnPort.add(pr.vlan);
    for (const tv of parseVlanListString(pr.trunkVlans)) vlansOnPort.add(tv);
    for (const v of vlansOnPort) {
      const entry = ensureVlan(v);
      entry.portCount++;
      if (pr.deviceName) entry.deviceNames.add(pr.deviceName);
    }
  }

  const uniqueVlans = Array.from(summaryMap.keys()).sort((a, b) => a - b);
  const vlanSummaries: SchematicVlanSummaryRow[] = uniqueVlans.map((vlanId) => {
    const e = summaryMap.get(vlanId)!;
    return {
      vlanId,
      linkCount: e.linkCount,
      trunkLinks: e.trunkLinks,
      accessLinks: e.accessLinks,
      activeLinks: e.activeLinks,
      downLinks: e.downLinks,
      deviceNames: Array.from(e.deviceNames).sort(),
      portCount: e.portCount,
    };
  });

  return { uniqueVlans, vlanSummaries, linkRows, portVlanRows };
}

function getLinkCurveSvgPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  indexInGroup: number,
  totalInGroup: number,
  isReversed: boolean
): { pathD: string; midX: number; midY: number; sLabelX: number; sLabelY: number; tLabelX: number; tLabelY: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1;
  let nx = -dy / dist;
  let ny = dx / dist;
  if (isReversed) {
    nx = -nx;
    ny = -ny;
  }

  const offsetIndex = indexInGroup - (totalInGroup - 1) / 2;
  const endpointSpread = offsetIndex * 18;
  const sx = x1 + nx * endpointSpread;
  const sy = y1 + ny * endpointSpread;
  const tx = x2 + nx * endpointSpread;
  const ty = y2 + ny * endpointSpread;

  const curveMag = totalInGroup === 1 ? 0 : offsetIndex * 42;
  const cx = (sx + tx) / 2 + nx * curveMag;
  const cy = (sy + ty) / 2 + ny * curveMag;

  const evalQ = (t: number) => {
    const mt = 1 - t;
    return {
      x: mt * mt * sx + 2 * mt * t * cx + t * t * tx,
      y: mt * mt * sy + 2 * mt * t * cy + t * t * ty,
    };
  };

  const mid = evalQ(0.5);
  const sLab = evalQ(0.22);
  const tLab = evalQ(0.78);

  return {
    pathD: `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`,
    midX: mid.x,
    midY: mid.y,
    sLabelX: sLab.x,
    sLabelY: sLab.y,
    tLabelX: tLab.x,
    tLabelY: tLab.y,
  };
}

function sanitizeDevicesForExport(
  devices: Device[],
  cardPositions: Map<string, { x: number; y: number }>,
  physicalPositions: Map<string, { x: number; y: number }>
): SchematicExportDeviceItem[] {
  return devices.map((d, idx) => {
    const fallbackPos = { x: 80 + (idx % 4) * 300, y: 80 + Math.floor(idx / 4) * 200 };
    const cardPos = cardPositions.get(d.id) || fallbackPos;
    const physicalPos = physicalPositions.get(d.id) || cardPos;
    const rawPorts = Array.isArray(d.ports) ? d.ports : [];
    const activePorts = rawPorts.filter((p: any) => String(p?.status || '').toLowerCase() === 'up').length;
    return {
      id: String(d.id),
      name: String(d.name || d.id),
      ip: String(d.ip || ''),
      type: String(d.type || 'switch'),
      model: String(d.model || ''),
      platform: String(d.platform || ''),
      role: String(d.role || ''),
      is_online: Boolean(d.is_online),
      latency_ms:
        d.is_online && d.latency_ms !== null && d.latency_ms !== undefined && Number.isFinite(Number(d.latency_ms))
          ? Number(d.latency_ms)
          : null,
      mac_address: String(d.mac || (d as any).mac_address || ''),
      building: String(d.building || ''),
      floor: String(d.floor || ''),
      unit: String(d.unit || ''),
      rack: String(d.rack || ''),
      total_ports: rawPorts.length || Number((d as any).total_ports) || 0,
      active_ports: activePorts,
      cardPos: { x: Number(cardPos.x) || 0, y: Number(cardPos.y) || 0 },
      physicalPos: { x: Number(physicalPos.x) || 0, y: Number(physicalPos.y) || 0 },
      vlans: extractDevicePortVlans(d),
      ports: rawPorts.slice(0, 64).map((p: any) => ({
        name: String(p?.name || p?.id || ''),
        status: String(p?.status || 'down').toLowerCase(),
        mode: String(p?.mode || 'access').toLowerCase(),
        vlan:
          p?.vlan !== null && p?.vlan !== undefined && Number.isInteger(Number(p.vlan))
            ? Number(p.vlan)
            : null,
        trunk_vlans: String(p?.trunk_vlans || p?.allowed_vlans || ''),
        speed: String(p?.speed || ''),
        description: String(p?.description || ''),
      })),
    };
  });
}

function renderCardCanvasMarkup(
  devices: SchematicExportDeviceItem[],
  linkRows: SchematicExportLinkRow[],
  stickyNotes: CustomTopologyStickyNote[],
  includeStickyNotes: boolean,
  isEn: boolean
): { markup: string; width: number; height: number } {
  const cardNotes = includeStickyNotes
    ? stickyNotes.filter((n) => !n.viewMode || n.viewMode === 'card')
    : [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const d of devices) {
    minX = Math.min(minX, d.cardPos.x);
    minY = Math.min(minY, d.cardPos.y);
    maxX = Math.max(maxX, d.cardPos.x + 250);
    maxY = Math.max(maxY, d.cardPos.y + 150);
  }
  for (const n of cardNotes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + (n.width || 220));
    maxY = Math.max(maxY, n.y + 140);
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 960;
    maxY = 520;
  }

  const pad = 70;
  const shiftX = pad - minX;
  const shiftY = pad - minY;
  const width = Math.max(960, Math.ceil(maxX - minX + pad * 2));
  const height = Math.max(540, Math.ceil(maxY - minY + pad * 2));

  const devPosMap = new Map<string, { x: number; y: number }>();
  for (const d of devices) {
    devPosMap.set(d.id, { x: d.cardPos.x + shiftX, y: d.cardPos.y + shiftY });
  }

  // Group parallel links between same device pairs
  const linkGroups = new Map<string, SchematicExportLinkRow[]>();
  for (const l of linkRows) {
    const key = [l.sourceDeviceId, l.targetDeviceId].sort().join('___');
    if (!linkGroups.has(key)) linkGroups.set(key, []);
    linkGroups.get(key)!.push(l);
  }

  const svgLinks: string[] = [];
  for (const l of linkRows) {
    const sp = devPosMap.get(l.sourceDeviceId);
    const tp = devPosMap.get(l.targetDeviceId);
    if (!sp || !tp) continue;

    const pairKey = [l.sourceDeviceId, l.targetDeviceId].sort().join('___');
    const grp = linkGroups.get(pairKey) || [l];
    const idx = Math.max(0, grp.findIndex((item) => item.id === l.id));
    const isRev = l.sourceDeviceId > l.targetDeviceId;
    const curve = getLinkCurveSvgPath(sp.x + 120, sp.y + 62, tp.x + 120, tp.y + 62, idx, grp.length, isRev);

    const isTrunk = l.sourceMode === 'trunk' || l.targetMode === 'trunk';
    const isDown = l.status === 'down';
    const isFiber = l.cableType === 'fiber';
    const isSerial = l.cableType === 'serial';
    const color = isDown
      ? '#ef4444'
      : isFiber
      ? '#f59e0b'
      : isSerial
      ? '#06b6d4'
      : isTrunk
      ? '#9333ea'
      : '#2563eb';

    const vlanBadge =
      l.vlans.length > 0
        ? `VLAN ${l.vlans.slice(0, 4).join(',')}${l.vlans.length > 4 ? '+' : ''}`
        : isTrunk
        ? 'TRUNK'
        : 'ACCESS';
    const midLabel = `${l.speed || '1G'} · ${vlanBadge}`;
    const vlansAttr = l.vlans.join(',');

    svgLinks.push(`
      <g class="topo-link" data-link-id="${escapeHtml(l.id)}" data-src="${escapeHtml(l.sourceDeviceId)}" data-tgt="${escapeHtml(l.targetDeviceId)}" data-vlans="${escapeHtml(vlansAttr)}">
        <path d="${curve.pathD}" fill="none" stroke="${color}" stroke-width="${isTrunk || isFiber ? 3.2 : 2.3}" ${isDown ? 'stroke-dasharray="6 4"' : ''} opacity="0.92" />
        <rect x="${(curve.midX - 52).toFixed(1)}" y="${(curve.midY - 10).toFixed(1)}" width="104" height="20" rx="6" class="link-pill-bg" stroke="${color}" stroke-width="1" />
        <text x="${curve.midX.toFixed(1)}" y="${(curve.midY + 4).toFixed(1)}" text-anchor="middle" class="link-pill-text">${escapeHtml(midLabel)}</text>
        <text x="${curve.sLabelX.toFixed(1)}" y="${(curve.sLabelY - 4).toFixed(1)}" text-anchor="middle" class="port-tag-text">${escapeHtml(l.sourcePort)}</text>
        <text x="${curve.tLabelX.toFixed(1)}" y="${(curve.tLabelY - 4).toFixed(1)}" text-anchor="middle" class="port-tag-text">${escapeHtml(l.targetPort)}</text>
      </g>
    `);
  }

  const cardNodesHtml = devices
    .map((d) => {
      const p = devPosMap.get(d.id)!;
      const locParts = [d.building, d.floor, d.rack].filter(Boolean);
      const vlanChips = d.vlans
        .slice(0, 6)
        .map(
          (v) =>
            `<button type="button" class="vlan-chip" data-filter-vlan="${v}">V${v}</button>`
        )
        .join('');
      const extraVlans =
        d.vlans.length > 6 ? `<span class="vlan-chip vlan-chip-more">+${d.vlans.length - 6}</span>` : '';
      const statusText = d.is_online
        ? d.latency_ms !== null
          ? `${isEn ? 'Online' : 'آنلاین'} · ${d.latency_ms}ms`
          : isEn
          ? 'Online'
          : 'آنلاین'
        : isEn
        ? 'Offline'
        : 'آفلاین';

      return `
        <div class="device-card ${d.is_online ? 'is-online' : 'is-offline'}" data-device-id="${escapeHtml(d.id)}" data-vlans="${escapeHtml(d.vlans.join(','))}" style="left:${p.x.toFixed(0)}px;top:${p.y.toFixed(0)}px;">
          <div class="card-head">
            <div class="card-title-wrap">
              <span class="status-dot ${d.is_online ? 'dot-on' : 'dot-off'}"></span>
              <span class="card-name" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</span>
            </div>
            <span class="type-badge">${escapeHtml(d.type.toUpperCase())}</span>
          </div>
          <div class="card-meta">
            <span class="mono-ip">${escapeHtml(d.ip || 'N/A')}</span>
            <span class="status-label ${d.is_online ? 'txt-on' : 'txt-off'}">${escapeHtml(statusText)}</span>
          </div>
          <div class="card-sub">${escapeHtml(d.model || d.platform || '-')}</div>
          ${locParts.length > 0 ? `<div class="card-loc">📍 ${escapeHtml(locParts.join(' / '))}</div>` : ''}
          <div class="card-footer">
            <span class="port-stat">${isEn ? 'Ports' : 'پورت'}: ${d.active_ports}/${d.total_ports}</span>
            <div class="vlan-chip-row">${vlanChips}${extraVlans}</div>
          </div>
        </div>
      `;
    })
    .join('\n');

  const notesHtml = cardNotes
    .map((n) => {
      const nx = n.x + shiftX;
      const ny = n.y + shiftY;
      return `
        <div class="sticky-note note-${escapeHtml(n.color || 'yellow')}" style="left:${nx.toFixed(0)}px;top:${ny.toFixed(0)}px;width:${Math.max(170, Math.min(340, n.width || 220))}px;">
          ${n.title ? `<div class="note-title">${escapeHtml(n.title)}</div>` : ''}
          <div class="note-body">${escapeHtml(n.content)}</div>
        </div>
      `;
    })
    .join('\n');

  const markup = `
    <div class="canvas-stage" style="width:${width}px;height:${height}px;">
      <svg class="links-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        ${svgLinks.join('\n')}
      </svg>
      ${cardNodesHtml}
      ${notesHtml}
    </div>
  `;

  return { markup, width, height };
}

function getHardwareCategoryColor(cat: string): string {
  const c = String(cat || '').toLowerCase();
  if (c.includes('firewall')) return '#ef4444';
  if (c.includes('mikrotik') || c.includes('router')) return '#f59e0b';
  if (c.includes('switch')) return '#06b6d4';
  if (c.includes('server')) return '#6366f1';
  if (c.includes('storage')) return '#10b981';
  if (c.includes('ups') || c.includes('pdu')) return '#ec4899';
  if (c.includes('patch') || c.includes('odf')) return '#8b5cf6';
  return '#64748b';
}

function renderPhysicalCanvasMarkup(
  devices: SchematicExportDeviceItem[],
  racks: CustomTopologyRack[],
  towers: CustomTopologyTower[],
  stickyNotes: CustomTopologyStickyNote[],
  includeStickyNotes: boolean,
  isEn: boolean
): { markup: string; width: number; height: number } {
  const physNotes = includeStickyNotes
    ? stickyNotes.filter((n) => n.viewMode === 'physical')
    : [];

  // Identify devices already mounted inside racks (avoid duplicating standalone chassis)
  const mountedNamesOrIps = new Set<string>();
  for (const r of racks) {
    for (const md of r.devices || []) {
      if (md.id) mountedNamesOrIps.add(String(md.id).trim().toLowerCase());
      if (md.name) mountedNamesOrIps.add(String(md.name).trim().toLowerCase());
      if (md.ip) mountedNamesOrIps.add(String(md.ip).trim().toLowerCase());
    }
  }
  const standaloneDevices = devices.filter(
    (d) =>
      !mountedNamesOrIps.has(d.id.toLowerCase()) &&
      !mountedNamesOrIps.has(d.name.toLowerCase()) &&
      !(d.ip && mountedNamesOrIps.has(d.ip.toLowerCase()))
  );

  // Clean visual layout: Racks + Towers + Standalone Physical Chassis
  const rackCards = racks
    .map((rack) => {
      const totalU = Math.max(6, Math.min(54, Number(rack.units) || 42));
      const sortedDevs = [...(rack.devices || [])].sort((a, b) => (b.startU || 0) - (a.startU || 0));
      const usedU = sortedDevs.reduce((acc, item) => acc + Math.max(1, Number(item.heightU) || 1), 0);
      const totalWatts = sortedDevs.reduce((acc, item) => acc + (Number(item.powerWatts) || 0), 0);

      const uRows = sortedDevs
        .map((md) => {
          const hU = Math.max(1, Number(md.heightU) || 1);
          const accent = getHardwareCategoryColor(md.category);
          const cardsSummary = (md.networkCards || [])
            .map((nc) => `${nc.portCount}x ${nc.portType}`)
            .join(' · ');
          const portLeds = Array.from({
            length: Math.min(24, Math.max(4, (md.networkCards || []).reduce((s, c) => s + (c.portCount || 0), 0) || 8)),
          })
            .map((_, i) => `<span class="chassis-led ${i % 3 === 0 ? 'led-active' : 'led-idle'}"></span>`)
            .join('');

          return `
            <div class="rack-unit-device" style="border-inline-start:4px solid ${accent};min-height:${Math.min(72, 26 + hU * 14)}px;">
              <div class="ru-badge">U${md.startU}${hU > 1 ? `–U${md.startU + hU - 1}` : ''} (${hU}U)</div>
              <div class="ru-main">
                <div class="ru-top">
                  <span class="ru-name">${escapeHtml(md.name)}</span>
                  <span class="ru-model">${escapeHtml([md.brand, md.model].filter(Boolean).join(' '))}</span>
                </div>
                <div class="ru-meta">
                  ${md.ip ? `<span class="mono-ip">${escapeHtml(md.ip)}</span>` : ''}
                  ${cardsSummary ? `<span>${escapeHtml(cardsSummary)}</span>` : ''}
                  ${md.powerWatts ? `<span>⚡ ${md.powerWatts}W</span>` : ''}
                  ${md.serialNumber ? `<span>S/N: ${escapeHtml(md.serialNumber)}</span>` : ''}
                </div>
                <div class="chassis-leds">${portLeds}</div>
              </div>
            </div>
          `;
        })
        .join('\n');

      return `
        <div class="rack-cabinet">
          <div class="rack-header">
            <div>
              <div class="rack-title">🗄️ ${escapeHtml(rack.name)}</div>
              <div class="rack-sub">${totalU}U · ${rack.depth || 100}cm · ${escapeHtml((rack.viewMode || 'front').toUpperCase())}</div>
            </div>
            <div class="rack-stats">
              <span>${usedU}/${totalU}U</span>
              ${totalWatts > 0 ? `<span>⚡ ${totalWatts}W</span>` : ''}
            </div>
          </div>
          <div class="rack-body">
            ${
              sortedDevs.length > 0
                ? uRows
                : `<div class="empty-slot">${isEn ? 'Empty Rack Cabinet' : 'رک بدون تجهیز نصب‌شده'}</div>`
            }
          </div>
        </div>
      `;
    })
    .join('\n');

  const towerCards = towers
    .map((tower) => {
      const sortedAntennas = [...(tower.devices || [])].sort((a, b) => (b.heightMeters || 0) - (a.heightMeters || 0));
      const rows = sortedAntennas
        .map(
          (td) => `
          <div class="tower-item">
            <span class="tower-height">${td.heightMeters}m</span>
            <div class="tower-item-body">
              <div class="ru-top">
                <span class="ru-name">${escapeHtml(td.name)}</span>
                <span class="ru-model">${escapeHtml([td.brand, td.model].filter(Boolean).join(' '))}</span>
              </div>
              <div class="ru-meta">
                ${td.frequency ? `<span>📡 ${escapeHtml(td.frequency)}</span>` : ''}
                ${td.azimuthDegrees !== undefined ? `<span>🧭 ${td.azimuthDegrees}° ${escapeHtml(td.azimuthLabel || '')}</span>` : ''}
                ${td.ip ? `<span class="mono-ip">${escapeHtml(td.ip)}</span>` : ''}
                ${td.targetLink ? `<span>→ ${escapeHtml(td.targetLink)}</span>` : ''}
              </div>
            </div>
          </div>
        `
        )
        .join('\n');

      return `
        <div class="rack-cabinet tower-cabinet">
          <div class="rack-header">
            <div>
              <div class="rack-title">🗼 ${escapeHtml(tower.name)}</div>
              <div class="rack-sub">${tower.heightMeters}m · ${escapeHtml(tower.type)}${tower.location ? ` · ${escapeHtml(tower.location)}` : ''}</div>
            </div>
            <div class="rack-stats">
              <span>${sortedAntennas.length} ${isEn ? 'Units' : 'رادیو/دیش'}</span>
            </div>
          </div>
          <div class="rack-body">
            ${
              sortedAntennas.length > 0
                ? rows
                : `<div class="empty-slot">${isEn ? 'No Antennas Mounted' : 'بدون رادیو یا دیش نصب‌شده'}</div>`
            }
          </div>
        </div>
      `;
    })
    .join('\n');

  const standaloneChassisHtml = standaloneDevices
    .map((d) => {
      const accent = getHardwareCategoryColor(d.type);
      const portSquares = (d.ports.length > 0 ? d.ports : Array.from({ length: Math.min(24, Math.max(8, d.total_ports || 12)) }).map((_, i) => ({
        name: `P${i + 1}`,
        status: 'down',
        mode: 'access',
        vlan: null,
        trunk_vlans: '',
        speed: '',
        description: '',
      })))
        .slice(0, 48)
        .map((p) => {
          const isUp = p.status === 'up';
          const isTrunk = p.mode === 'trunk';
          const cls = isUp ? (isTrunk ? 'port-trunk' : 'port-up') : 'port-down';
          const title = `${p.name} | ${p.mode.toUpperCase()} | ${p.vlan ? `VLAN ${p.vlan}` : '-'}${p.trunk_vlans ? ` (Allowed: ${p.trunk_vlans})` : ''} | ${p.status.toUpperCase()}${p.description ? ` - ${p.description}` : ''}`;
          return `<span class="hw-port ${cls}" title="${escapeHtml(title)}">${escapeHtml(p.vlan ? String(p.vlan) : '')}</span>`;
        })
        .join('');

      return `
        <div class="hardware-chassis" style="border-inline-start:4px solid ${accent};">
          <div class="chassis-head">
            <div class="card-title-wrap">
              <span class="status-dot ${d.is_online ? 'dot-on' : 'dot-off'}"></span>
              <span class="card-name">${escapeHtml(d.name)}</span>
              <span class="type-badge">${escapeHtml(d.type.toUpperCase())}</span>
            </div>
            <div class="chassis-meta">
              <span class="mono-ip">${escapeHtml(d.ip || 'N/A')}</span>
              <span>${escapeHtml(d.model || d.platform || '')}</span>
              ${d.rack ? `<span>🗄️ ${escapeHtml(d.rack)}</span>` : ''}
            </div>
          </div>
          <div class="hw-ports-grid">${portSquares}</div>
        </div>
      `;
    })
    .join('\n');

  const notesBlock =
    physNotes.length > 0
      ? `
      <div class="phys-section-title">${isEn ? 'Physical Layer Notes' : 'یادداشت‌های نمای فیزیکی'}</div>
      <div class="phys-notes-grid">
        ${physNotes
          .map(
            (n) => `
          <div class="sticky-note-inline note-${escapeHtml(n.color || 'yellow')}">
            ${n.title ? `<div class="note-title">${escapeHtml(n.title)}</div>` : ''}
            <div class="note-body">${escapeHtml(n.content)}</div>
          </div>
        `
          )
          .join('\n')}
      </div>
    `
      : '';

  const markup = `
    <div class="physical-board">
      ${
        racks.length > 0 || towers.length > 0
          ? `<div class="phys-section-title">${isEn ? 'Racks & Telecom Towers' : 'رک‌های سرور و دکل‌های مخابراتی'}</div>
             <div class="racks-grid">${rackCards}${towerCards}</div>`
          : ''
      }
      ${
        standaloneDevices.length > 0
          ? `<div class="phys-section-title">${isEn ? 'Network Hardware Front-Panel Chassis (Hover ports for VLAN & Mode)' : 'نمای سخت‌افزاری شاسی تجهیزات شبکه (جهت مشاهده VLAN هر پورت، نشانگر را روی پورت ببرید)'}</div>
             <div class="chassis-list">${standaloneChassisHtml}</div>`
          : ''
      }
      ${notesBlock}
      ${
        racks.length === 0 && towers.length === 0 && standaloneDevices.length === 0
          ? `<div class="empty-slot">${isEn ? 'No physical hardware items found on this map.' : 'هیچ رک، دکل یا تجهیز فیزیکی روی این نقشه ثبت نشده است.'}</div>`
          : ''
      }
    </div>
  `;

  return { markup, width: 1200, height: 700 };
}

export function buildSchematicHtmlExport(options: BuildSchematicHtmlOptions): {
  html: string;
  filename: string;
  stats: {
    deviceCount: number;
    onlineCount: number;
    offlineCount: number;
    linkCount: number;
    vlanCount: number;
    rackCount: number;
    towerCount: number;
  };
} {
  const {
    mapName,
    mapDescription,
    devices,
    customLinks,
    topologyLinks = [],
    racks,
    towers,
    stickyNotes,
    cardPositions,
    physicalPositions,
    exportMode,
    includeVlanTable,
    includePortVlanDirectory,
    includeStickyNotes,
    isLightMode,
    isEn,
    exportedBy,
    exportedAt,
  } = options;

  const cleanDevices = sanitizeDevicesForExport(devices, cardPositions, physicalPositions);
  const vlanData = extractSchematicVlanSummary(devices, customLinks, topologyLinks);

  const onlineCount = cleanDevices.filter((d) => d.is_online).length;
  const offlineCount = cleanDevices.length - onlineCount;
  const exportTimestamp = exportedAt || new Date().toISOString();
  const formattedDate = (() => {
    try {
      return new Date(exportTimestamp).toLocaleString(isEn ? 'en-US' : 'fa-IR');
    } catch {
      return exportTimestamp;
    }
  })();

  const showCard = exportMode === 'card' || exportMode === 'both';
  const showPhysical = exportMode === 'physical' || exportMode === 'both';

  const cardCanvas = showCard
    ? renderCardCanvasMarkup(cleanDevices, vlanData.linkRows, stickyNotes, includeStickyNotes, isEn)
    : null;
  const physicalCanvas = showPhysical
    ? renderPhysicalCanvasMarkup(cleanDevices, racks, towers, stickyNotes, includeStickyNotes, isEn)
    : null;

  const modeBadgeLabel =
    exportMode === 'both'
      ? isEn
        ? 'Cards + Physical (Complete)'
        : 'نمای کارت + فیزیکی (جامع)'
      : exportMode === 'physical'
      ? isEn
        ? 'Physical View'
        : 'نمای فیزیکی'
      : isEn
      ? 'Cards View'
      : 'نمای کارت‌ها';

  const vlanSummaryRowsHtml = vlanData.vlanSummaries
    .map(
      (vs) => `
      <tr>
        <td><button type="button" class="vlan-pill-btn" data-select-vlan="${vs.vlanId}">VLAN ${vs.vlanId}</button></td>
        <td class="num">${vs.linkCount}</td>
        <td class="num"><span class="badge badge-trunk">${vs.trunkLinks}</span> / <span class="badge badge-access">${vs.accessLinks}</span></td>
        <td class="num"><span class="badge badge-up">${vs.activeLinks}</span> / <span class="badge badge-down">${vs.downLinks}</span></td>
        <td class="num">${vs.portCount}</td>
        <td>${escapeHtml(vs.deviceNames.join(', ') || '-')}</td>
      </tr>
    `
    )
    .join('\n');

  const linkRowsHtml = vlanData.linkRows
    .map((lr, idx) => {
      const isTrunk = lr.sourceMode === 'trunk' || lr.targetMode === 'trunk';
      const vlanBadges =
        lr.vlans.length > 0
          ? lr.vlans.map((v) => `<span class="badge badge-vlan">VLAN ${v}</span>`).join(' ')
          : `<span class="muted">${isEn ? 'Untagged / None' : 'بدون VLAN'}</span>`;
      const srcVlanTxt = lr.sourceVlan ? ` (V${lr.sourceVlan})` : '';
      const tgtVlanTxt = lr.targetVlan ? ` (V${lr.targetVlan})` : '';
      const statusCls = lr.status === 'down' ? 'badge-down' : 'badge-up';
      const searchBlob = `${lr.sourceDeviceName} ${lr.sourceIp} ${lr.sourcePort} ${lr.targetDeviceName} ${lr.targetIp} ${lr.targetPort} ${lr.vlans.join(' ')} ${lr.cableType} ${lr.notes}`.toLowerCase();

      return `
        <tr class="vlan-link-row" data-vlans="${escapeHtml(lr.vlans.join(','))}" data-mode="${isTrunk ? 'trunk' : 'access'}" data-status="${escapeHtml(lr.status)}" data-search="${escapeHtml(searchBlob)}">
          <td class="num">${idx + 1}</td>
          <td>${vlanBadges}</td>
          <td><strong>${escapeHtml(lr.sourceDeviceName)}</strong><div class="sub-mono">${escapeHtml(lr.sourceIp || '-')}</div></td>
          <td><span class="mono-tag">${escapeHtml(lr.sourcePort)}</span> <span class="badge ${lr.sourceMode === 'trunk' ? 'badge-trunk' : 'badge-access'}">${escapeHtml(lr.sourceMode.toUpperCase())}${escapeHtml(srcVlanTxt)}</span></td>
          <td><strong>${escapeHtml(lr.targetDeviceName)}</strong><div class="sub-mono">${escapeHtml(lr.targetIp || '-')}</div></td>
          <td><span class="mono-tag">${escapeHtml(lr.targetPort)}</span> <span class="badge ${lr.targetMode === 'trunk' ? 'badge-trunk' : 'badge-access'}">${escapeHtml(lr.targetMode.toUpperCase())}${escapeHtml(tgtVlanTxt)}</span></td>
          <td><span class="badge badge-neutral">${escapeHtml(lr.cableType.toUpperCase())}</span> <span class="sub-mono">${escapeHtml(lr.speed)}</span></td>
          <td><span class="badge ${statusCls}">${escapeHtml(lr.status.toUpperCase())}</span></td>
          <td>${escapeHtml(lr.notes || '-')}</td>
        </tr>
      `;
    })
    .join('\n');

  const portDirectoryRowsHtml = vlanData.portVlanRows
    .map((pr, idx) => {
      const vlansAll = new Set<number>();
      if (pr.vlan) vlansAll.add(pr.vlan);
      for (const tv of parseVlanListString(pr.trunkVlans)) vlansAll.add(tv);
      const searchBlob = `${pr.deviceName} ${pr.deviceIp} ${pr.portName} ${pr.mode} ${pr.vlan ?? ''} ${pr.trunkVlans} ${pr.description}`.toLowerCase();
      return `
        <tr class="port-vlan-row" data-vlans="${escapeHtml(Array.from(vlansAll).join(','))}" data-search="${escapeHtml(searchBlob)}">
          <td class="num">${idx + 1}</td>
          <td><strong>${escapeHtml(pr.deviceName)}</strong> <span class="sub-mono">${escapeHtml(pr.deviceIp)}</span></td>
          <td><span class="mono-tag">${escapeHtml(pr.portName)}</span></td>
          <td><span class="badge ${pr.mode === 'trunk' ? 'badge-trunk' : 'badge-access'}">${escapeHtml(pr.mode.toUpperCase())}</span></td>
          <td>${pr.vlan ? `<span class="badge badge-vlan">VLAN ${pr.vlan}</span>` : '-'} ${pr.trunkVlans ? `<span class="sub-mono">${escapeHtml(pr.trunkVlans)}</span>` : ''}</td>
          <td><span class="badge ${pr.status === 'up' ? 'badge-up' : 'badge-down'}">${escapeHtml(pr.status.toUpperCase())}</span></td>
          <td class="sub-mono">${escapeHtml(pr.speed)}</td>
          <td>${escapeHtml(pr.description || '-')}</td>
        </tr>
      `;
    })
    .join('\n');

  const vlanFilterOptions = vlanData.uniqueVlans
    .map((v) => `<option value="${v}">VLAN ${v}</option>`)
    .join('');

  const initialTab = showCard ? 'card' : 'physical';

  const metaJson = safeJsonForScript({
    mapName,
    exportMode,
    uniqueVlans: vlanData.uniqueVlans,
  });

  const html = `<!doctype html>
<html lang="${isEn ? 'en' : 'fa'}" dir="${isEn ? 'ltr' : 'rtl'}" data-theme="${isLightMode ? 'light' : 'dark'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(mapName)} — ${isEn ? 'Visual Network Schematic Export' : 'خروجی ویژوال نقشه شماتیک شبکه'}</title>
  <style>
    :root {
      --bg: #0b1120;
      --bg-elev: #111827;
      --bg-card: #162033;
      --bg-canvas: #070c17;
      --grid-dot: rgba(148, 163, 184, 0.16);
      --border: rgba(148, 163, 184, 0.2);
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --accent-2: #818cf8;
      --pill-bg: #0f172a;
      --row-hover: rgba(56, 189, 248, 0.08);
    }
    html[data-theme="light"] {
      --bg: #f1f5f9;
      --bg-elev: #ffffff;
      --bg-card: #ffffff;
      --bg-canvas: #f8fafc;
      --grid-dot: rgba(100, 116, 139, 0.22);
      --border: #cbd5e1;
      --text: #0f172a;
      --text-muted: #475569;
      --accent: #0284c7;
      --accent-2: #4f46e5;
      --pill-bg: #ffffff;
      --row-hover: rgba(2, 132, 199, 0.06);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: ${isEn ? "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif" : "'Vazirmatn', 'Tahoma', 'Segoe UI', system-ui, sans-serif"};
      line-height: 1.5;
    }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 40;
      background: var(--bg-elev);
      border-bottom: 1px solid var(--border);
      padding: 14px 20px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.18);
    }
    .title-group h1 {
      margin: 0;
      font-size: 18px;
      font-weight: 800;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .title-meta {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 2px;
    }
    .mode-pill {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 10px;
      border-radius: 999px;
      background: rgba(56, 189, 248, 0.16);
      color: var(--accent);
      border: 1px solid rgba(56, 189, 248, 0.35);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .btn {
      background: var(--bg-card);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn:hover { border-color: var(--accent); color: var(--accent); }
    .btn.active {
      background: linear-gradient(135deg, #0284c7, #4f46e5);
      color: #fff;
      border-color: transparent;
    }
    .container {
      max-width: 1600px;
      margin: 0 auto;
      padding: 18px 20px 48px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 12px;
    }
    .kpi-card {
      background: var(--bg-elev);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 12px 14px;
    }
    .kpi-label { font-size: 11px; color: var(--text-muted); font-weight: 600; }
    .kpi-val { font-size: 22px; font-weight: 800; margin-top: 2px; }
    .kpi-sub { font-size: 11px; color: var(--text-muted); }
    .panel {
      background: var(--bg-elev);
      border: 1px solid var(--border);
      border-radius: 16px;
      overflow: hidden;
    }
    .panel-head {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .panel-title { font-size: 14px; font-weight: 800; }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      font-size: 11px;
      color: var(--text-muted);
      align-items: center;
    }
    .legend-dot { display: inline-block; width: 10px; height: 4px; border-radius: 2px; margin-inline-end: 4px; vertical-align: middle; }
    .canvas-viewport {
      position: relative;
      width: 100%;
      height: 640px;
      overflow: auto;
      background-color: var(--bg-canvas);
      background-image: radial-gradient(var(--grid-dot) 1px, transparent 1px);
      background-size: 22px 22px;
      cursor: grab;
    }
    .canvas-viewport:active { cursor: grabbing; }
    .canvas-zoom-layer {
      transform-origin: 0 0;
      transition: transform 0.1s ease-out;
    }
    .canvas-stage {
      position: relative;
      direction: ltr;
    }
    .links-svg {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .topo-link { transition: opacity 0.15s ease; }
    .topo-link.dimmed { opacity: 0.14; }
    .topo-link.highlighted path { stroke-width: 4.5 !important; filter: drop-shadow(0 0 6px rgba(56,189,248,0.8)); }
    .link-pill-bg { fill: var(--pill-bg); }
    .link-pill-text { fill: var(--text); font-size: 10px; font-weight: 700; font-family: ui-monospace, monospace; }
    .port-tag-text { fill: var(--text-muted); font-size: 9.5px; font-weight: 700; font-family: ui-monospace, monospace; }
    .device-card {
      position: absolute;
      width: 240px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 10px 12px;
      box-shadow: 0 10px 24px rgba(0,0,0,0.22);
      transition: transform 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
      cursor: pointer;
    }
    .device-card:hover, .device-card.highlighted {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.35), 0 12px 28px rgba(0,0,0,0.3);
      z-index: 15;
    }
    .device-card.dimmed { opacity: 0.25; }
    .card-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
    .card-title-wrap { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .card-name { font-size: 12.5px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .dot-on { background: #10b981; box-shadow: 0 0 8px rgba(16, 185, 129, 0.8); }
    .dot-off { background: #ef4444; }
    .type-badge {
      font-size: 9px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 6px;
      background: rgba(99, 102, 241, 0.16);
      color: var(--accent-2);
      border: 1px solid rgba(99, 102, 241, 0.3);
      flex-shrink: 0;
    }
    .card-meta { display: flex; justify-content: space-between; align-items: center; margin-top: 5px; font-size: 11px; }
    .mono-ip { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 11px; color: var(--accent); font-weight: 600; }
    .txt-on { color: #10b981; font-weight: 700; font-size: 10.5px; }
    .txt-off { color: #ef4444; font-weight: 700; font-size: 10.5px; }
    .card-sub { font-size: 10.5px; color: var(--text-muted); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .card-loc { font-size: 10px; color: var(--text-muted); margin-top: 3px; }
    .card-footer { margin-top: 7px; padding-top: 6px; border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap; }
    .port-stat { font-size: 10px; font-family: ui-monospace, monospace; color: var(--text-muted); }
    .vlan-chip-row { display: flex; flex-wrap: wrap; gap: 3px; }
    .vlan-chip {
      font-size: 9.5px;
      font-family: ui-monospace, monospace;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 5px;
      background: rgba(147, 51, 234, 0.18);
      color: #c084fc;
      border: 1px solid rgba(147, 51, 234, 0.35);
      cursor: pointer;
    }
    html[data-theme="light"] .vlan-chip { color: #7e22ce; background: rgba(147, 51, 234, 0.1); }
    .sticky-note, .sticky-note-inline {
      background: rgba(250, 204, 21, 0.16);
      border: 1px solid rgba(250, 204, 21, 0.45);
      border-radius: 12px;
      padding: 10px 12px;
      font-size: 11.5px;
      white-space: pre-wrap;
    }
    .sticky-note { position: absolute; z-index: 8; backdrop-filter: blur(4px); }
    .note-cyan { background: rgba(6, 182, 212, 0.14); border-color: rgba(6, 182, 212, 0.45); }
    .note-emerald { background: rgba(16, 185, 129, 0.14); border-color: rgba(16, 185, 129, 0.45); }
    .note-rose { background: rgba(244, 63, 94, 0.14); border-color: rgba(244, 63, 94, 0.45); }
    .note-purple { background: rgba(168, 85, 247, 0.14); border-color: rgba(168, 85, 247, 0.45); }
    .note-title { font-weight: 800; margin-bottom: 4px; font-size: 12px; }
    .physical-board { padding: 18px; display: flex; flex-direction: column; gap: 18px; }
    .phys-section-title { font-size: 13px; font-weight: 800; color: var(--accent); border-bottom: 1px solid var(--border); padding-bottom: 6px; }
    .racks-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px; align-items: start; }
    .rack-cabinet {
      background: var(--bg-canvas);
      border: 2px solid var(--border);
      border-radius: 14px;
      overflow: hidden;
    }
    .rack-header {
      padding: 10px 14px;
      background: var(--bg-card);
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .rack-title { font-weight: 800; font-size: 13.5px; }
    .rack-sub { font-size: 11px; color: var(--text-muted); }
    .rack-stats { display: flex; gap: 8px; font-size: 11px; font-weight: 700; font-family: ui-monospace, monospace; color: var(--accent); }
    .rack-body { padding: 10px; display: flex; flex-direction: column; gap: 6px; }
    .rack-unit-device, .tower-item {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 7px 10px;
      display: flex;
      gap: 10px;
      align-items: flex-start;
    }
    .ru-badge, .tower-height {
      font-family: ui-monospace, monospace;
      font-size: 10px;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 6px;
      background: rgba(148, 163, 184, 0.14);
      color: var(--text);
      white-space: nowrap;
    }
    .ru-main, .tower-item-body { flex: 1; min-width: 0; }
    .ru-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
    .ru-name { font-weight: 700; font-size: 12px; }
    .ru-model { font-size: 11px; color: var(--text-muted); }
    .ru-meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 10.5px; color: var(--text-muted); margin-top: 3px; }
    .chassis-leds { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 5px; }
    .chassis-led { width: 8px; height: 6px; border-radius: 2px; background: rgba(148, 163, 184, 0.25); }
    .chassis-led.led-active { background: #10b981; }
    .chassis-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 12px; }
    .hardware-chassis {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 10px 12px;
    }
    .chassis-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
    .chassis-meta { display: flex; gap: 8px; align-items: center; font-size: 11px; color: var(--text-muted); flex-wrap: wrap; }
    .hw-ports-grid { display: flex; flex-wrap: wrap; gap: 4px; direction: ltr; }
    .hw-port {
      width: 24px;
      height: 18px;
      border-radius: 4px;
      font-size: 8.5px;
      font-family: ui-monospace, monospace;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--border);
    }
    .port-up { background: rgba(16, 185, 129, 0.22); color: #34d399; border-color: rgba(16, 185, 129, 0.5); }
    .port-trunk { background: rgba(147, 51, 234, 0.25); color: #d8b4fe; border-color: rgba(147, 51, 234, 0.55); }
    .port-down { background: rgba(100, 116, 139, 0.14); color: var(--text-muted); }
    html[data-theme="light"] .port-up { color: #047857; }
    html[data-theme="light"] .port-trunk { color: #6b21a8; }
    .phys-notes-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
    .empty-slot { padding: 18px; text-align: center; color: var(--text-muted); font-size: 12px; }
    .filters-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .filter-input, .filter-select {
      background: var(--bg-canvas);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 9px;
      padding: 6px 10px;
      font-size: 12px;
      outline: none;
    }
    .filter-input:focus, .filter-select:focus { border-color: var(--accent); }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { padding: 9px 12px; border-bottom: 1px solid var(--border); text-align: start; vertical-align: middle; }
    th { background: var(--bg-card); font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-muted); font-weight: 700; white-space: nowrap; }
    tbody tr:hover { background: var(--row-hover); }
    td.num { font-family: ui-monospace, monospace; font-weight: 700; text-align: center; }
    .sub-mono { font-family: ui-monospace, monospace; font-size: 10.5px; color: var(--text-muted); }
    .mono-tag { font-family: ui-monospace, monospace; font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 6px; background: rgba(148, 163, 184, 0.15); }
    .badge { display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 999px; font-family: ui-monospace, monospace; white-space: nowrap; }
    .badge-vlan, .vlan-pill-btn { background: rgba(147, 51, 234, 0.18); color: #c084fc; border: 1px solid rgba(147, 51, 234, 0.4); }
    .vlan-pill-btn { font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 999px; cursor: pointer; font-family: ui-monospace, monospace; }
    .badge-trunk { background: rgba(147, 51, 234, 0.18); color: #c084fc; }
    .badge-access { background: rgba(37, 99, 235, 0.18); color: #60a5fa; }
    .badge-up { background: rgba(16, 185, 129, 0.18); color: #34d399; }
    .badge-down { background: rgba(239, 68, 68, 0.18); color: #f87171; }
    .badge-neutral { background: rgba(148, 163, 184, 0.16); color: var(--text); }
    html[data-theme="light"] .badge-vlan, html[data-theme="light"] .vlan-pill-btn, html[data-theme="light"] .badge-trunk { color: #6b21a8; }
    html[data-theme="light"] .badge-access { color: #1d4ed8; }
    html[data-theme="light"] .badge-up { color: #047857; }
    html[data-theme="light"] .badge-down { color: #b91c1c; }
    .muted { color: var(--text-muted); font-size: 11px; }
    .hidden { display: none !important; }
    @media print {
      .topbar .actions, .filters-bar { display: none !important; }
      .canvas-viewport { height: auto !important; overflow: visible !important; }
      .panel { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="title-group">
      <h1>
        <span>${escapeHtml(mapName)}</span>
        <span class="mode-pill">${escapeHtml(modeBadgeLabel)}</span>
      </h1>
      <div class="title-meta">
        ${mapDescription ? `${escapeHtml(mapDescription)} · ` : ''}${isEn ? 'Exported' : 'زمان خروجی'}: ${escapeHtml(formattedDate)}${exportedBy ? ` · ${isEn ? 'By' : 'توسط'}: ${escapeHtml(exportedBy)}` : ''}
      </div>
    </div>
    <div class="actions">
      ${
        showCard && showPhysical
          ? `<button type="button" class="btn ${initialTab === 'card' ? 'active' : ''}" id="tabBtnCard">${isEn ? 'Cards Visual' : 'نمای کارت‌ها'}</button>
             <button type="button" class="btn ${initialTab === 'physical' ? 'active' : ''}" id="tabBtnPhysical">${isEn ? 'Physical Visual' : 'نمای فیزیکی'}</button>`
          : ''
      }
      ${
        showCard
          ? `<button type="button" class="btn" id="btnZoomOut">−</button>
             <button type="button" class="btn" id="btnZoomReset">100%</button>
             <button type="button" class="btn" id="btnZoomIn">+</button>`
          : ''
      }
      <button type="button" class="btn" id="btnResetHighlight">${isEn ? 'Clear Highlight' : 'پاک کردن فیلتر نقشه'}</button>
      <button type="button" class="btn" id="btnTheme">${isEn ? 'Toggle Theme' : 'تغییر تم'}</button>
      <button type="button" class="btn" id="btnPrint">${isEn ? 'Print / PDF' : 'چاپ / PDF'}</button>
    </div>
  </header>

  <main class="container">
    <section class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">${isEn ? 'Map Equipment' : 'تجهیزات نقشه'}</div>
        <div class="kpi-val">${cleanDevices.length}</div>
        <div class="kpi-sub">${onlineCount} ${isEn ? 'Online' : 'آنلاین'} · ${offlineCount} ${isEn ? 'Offline' : 'آفلاین'}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">${isEn ? 'Interconnection Links' : 'لینک‌های ارتباطی'}</div>
        <div class="kpi-val">${vlanData.linkRows.length}</div>
        <div class="kpi-sub">${vlanData.linkRows.filter((l) => l.sourceMode === 'trunk' || l.targetMode === 'trunk').length} Trunk · ${vlanData.linkRows.filter((l) => l.sourceMode !== 'trunk' && l.targetMode !== 'trunk').length} Access</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">${isEn ? 'Unique VLANs on Map' : 'تعداد VLANهای نقشه'}</div>
        <div class="kpi-val">${vlanData.uniqueVlans.length}</div>
        <div class="kpi-sub">${vlanData.uniqueVlans.length > 0 ? vlanData.uniqueVlans.slice(0, 8).map((v) => `V${v}`).join(', ') : (isEn ? 'None assigned' : 'ثبت نشده')}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">${isEn ? 'Racks & Telecom Towers' : 'رک‌ها و دکل‌ها'}</div>
        <div class="kpi-val">${racks.length + towers.length}</div>
        <div class="kpi-sub">${racks.length} ${isEn ? 'Racks' : 'رک'} · ${towers.length} ${isEn ? 'Towers' : 'دکل'}</div>
      </div>
    </section>

    ${
      showCard && cardCanvas
        ? `<section class="panel" id="panelCardView">
            <div class="panel-head">
              <div class="panel-title">${isEn ? 'Interactive Cards Topology Canvas (Click any Device or VLAN chip to highlight links)' : 'بوم ویژوال نمای کارت‌های شبکه (برای برجسته‌سازی لینک‌ها روی هر تجهیز یا تگ VLAN کلیک کنید)'}</div>
              <div class="legend">
                <span><i class="legend-dot" style="background:#9333ea"></i>Trunk</span>
                <span><i class="legend-dot" style="background:#2563eb"></i>Access / Copper</span>
                <span><i class="legend-dot" style="background:#f59e0b"></i>Fiber</span>
                <span><i class="legend-dot" style="background:#06b6d4"></i>Serial</span>
                <span><i class="legend-dot" style="background:#ef4444"></i>Down</span>
              </div>
            </div>
            <div class="canvas-viewport" id="cardViewport">
              <div class="canvas-zoom-layer" id="cardZoomLayer">
                ${cardCanvas.markup}
              </div>
            </div>
          </section>`
        : ''
    }

    ${
      showPhysical && physicalCanvas
        ? `<section class="panel ${showCard && showPhysical && initialTab !== 'physical' ? 'hidden' : ''}" id="panelPhysicalView">
            <div class="panel-head">
              <div class="panel-title">${isEn ? 'Physical Racks, Telecom Towers & Hardware Chassis Elevation' : 'نمای فیزیکی رک‌ها، دکل‌ها و شاسی سخت‌افزاری تجهیزات'}</div>
              <div class="legend">
                <span><i class="legend-dot" style="background:#10b981"></i>${isEn ? 'Port UP (Access)' : 'پورت متصل (Access)'}</span>
                <span><i class="legend-dot" style="background:#9333ea"></i>${isEn ? 'Port UP (Trunk)' : 'پورت متصل (Trunk)'}</span>
                <span><i class="legend-dot" style="background:#64748b"></i>${isEn ? 'Port Down' : 'پورت غیرفعال'}</span>
              </div>
            </div>
            ${physicalCanvas.markup}
          </section>`
        : ''
    }

    ${
      includeVlanTable
        ? `<section class="panel">
            <div class="panel-head">
              <div class="panel-title">${isEn ? 'VLAN Summary Matrix on This Map' : 'جدول خلاصه VLANهای موجود در این نقشه'} (${vlanData.vlanSummaries.length})</div>
              <div class="muted">${isEn ? 'Click any VLAN pill to filter connections and highlight on map' : 'برای فیلتر ارتباطات و نمایش روی نقشه روی شماره هر VLAN کلیک کنید'}</div>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>VLAN ID</th>
                    <th>${isEn ? 'Total Links' : 'تعداد لینک'}</th>
                    <th>${isEn ? 'Trunk / Access' : 'Trunk / Access'}</th>
                    <th>${isEn ? 'Active / Down' : 'فعال / قطع'}</th>
                    <th>${isEn ? 'Configured Ports' : 'پورت‌های عضو'}</th>
                    <th>${isEn ? 'Connected Devices' : 'تجهیزات متصل به این VLAN'}</th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    vlanSummaryRowsHtml ||
                    `<tr><td colspan="6" class="empty-slot">${isEn ? 'No VLAN tags are currently assigned to links or ports on this map.' : 'هیچ تگ VLAN روی لینک‌ها یا پورت‌های این نقشه ثبت نشده است.'}</td></tr>`
                  }
                </tbody>
              </table>
            </div>
          </section>

          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">${isEn ? 'Complete VLAN & Port-to-Port Interconnections Table' : 'جدول کامل ارتباطات VLAN و اتصالات پورت‌به‌پورت نقشه'} (<span id="visibleLinksCount">${vlanData.linkRows.length}</span> / ${vlanData.linkRows.length})</div>
              <div class="filters-bar">
                <input type="search" id="linkSearchInput" class="filter-input" placeholder="${isEn ? 'Search device, IP, port, VLAN...' : 'جستجو در نام تجهیز، IP، پورت، VLAN...'}" />
                <select id="linkVlanFilter" class="filter-select">
                  <option value="">${isEn ? 'All VLANs' : 'همه VLANها'}</option>
                  ${vlanFilterOptions}
                </select>
                <select id="linkModeFilter" class="filter-select">
                  <option value="">${isEn ? 'All Modes' : 'همه حالت‌ها'}</option>
                  <option value="trunk">Trunk</option>
                  <option value="access">Access</option>
                </select>
                <select id="linkStatusFilter" class="filter-select">
                  <option value="">${isEn ? 'All Status' : 'همه وضعیت‌ها'}</option>
                  <option value="active">Active</option>
                  <option value="down">Down</option>
                </select>
              </div>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>VLAN(s)</th>
                    <th>${isEn ? 'Source Device' : 'تجهیز مبدا'}</th>
                    <th>${isEn ? 'Source Port & Mode' : 'پورت و حالت مبدا'}</th>
                    <th>${isEn ? 'Target Device' : 'تجهیز مقصد'}</th>
                    <th>${isEn ? 'Target Port & Mode' : 'پورت و حالت مقصد'}</th>
                    <th>${isEn ? 'Cable / Speed' : 'کابل / سرعت'}</th>
                    <th>${isEn ? 'Status' : 'وضعیت'}</th>
                    <th>${isEn ? 'Notes' : 'توضیحات'}</th>
                  </tr>
                </thead>
                <tbody id="vlanLinksTbody">
                  ${
                    linkRowsHtml ||
                    `<tr><td colspan="9" class="empty-slot">${isEn ? 'No cable links recorded on this map.' : 'هیچ لینک ارتباطی روی این نقشه ثبت نشده است.'}</td></tr>`
                  }
                </tbody>
              </table>
            </div>
          </section>`
        : ''
    }

    ${
      includePortVlanDirectory && vlanData.portVlanRows.length > 0
        ? `<section class="panel">
            <div class="panel-head">
              <div class="panel-title">${isEn ? 'Device Switch-Port VLAN Allocation Directory' : 'جدول تفصیلی تخصیص VLAN پورت‌های تجهیزات نقشه'} (${vlanData.portVlanRows.length})</div>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>${isEn ? 'Device' : 'تجهیز'}</th>
                    <th>${isEn ? 'Port' : 'پورت'}</th>
                    <th>${isEn ? 'Mode' : 'حالت'}</th>
                    <th>${isEn ? 'VLAN / Allowed VLANs' : 'VLAN / VLANهای مجاز'}</th>
                    <th>${isEn ? 'Status' : 'وضعیت'}</th>
                    <th>${isEn ? 'Speed' : 'سرعت'}</th>
                    <th>${isEn ? 'Description' : 'توضیحات'}</th>
                  </tr>
                </thead>
                <tbody id="portVlanTbody">
                  ${portDirectoryRowsHtml}
                </tbody>
              </table>
            </div>
          </section>`
        : ''
    }
  </main>

  <script id="schematic-export-meta" type="application/json">${metaJson}</script>
  <script>
    (function () {
      var zoom = 1;
      var zoomLayer = document.getElementById('cardZoomLayer');
      var viewport = document.getElementById('cardViewport');
      var zoomResetBtn = document.getElementById('btnZoomReset');

      function applyZoom(next) {
        zoom = Math.max(0.4, Math.min(2.2, Math.round(next * 100) / 100));
        if (zoomLayer) zoomLayer.style.transform = 'scale(' + zoom + ')';
        if (zoomResetBtn) zoomResetBtn.textContent = Math.round(zoom * 100) + '%';
      }

      var zIn = document.getElementById('btnZoomIn');
      var zOut = document.getElementById('btnZoomOut');
      if (zIn) zIn.addEventListener('click', function () { applyZoom(zoom + 0.15); });
      if (zOut) zOut.addEventListener('click', function () { applyZoom(zoom - 0.15); });
      if (zoomResetBtn) zoomResetBtn.addEventListener('click', function () { applyZoom(1); });

      // Drag-to-pan on visual canvas
      if (viewport) {
        var dragging = false, startX = 0, startY = 0, scrollL = 0, scrollT = 0;
        viewport.addEventListener('mousedown', function (e) {
          if (e.target && e.target.closest && e.target.closest('button')) return;
          dragging = true;
          startX = e.pageX - viewport.offsetLeft;
          startY = e.pageY - viewport.offsetTop;
          scrollL = viewport.scrollLeft;
          scrollT = viewport.scrollTop;
        });
        window.addEventListener('mouseup', function () { dragging = false; });
        viewport.addEventListener('mousemove', function (e) {
          if (!dragging) return;
          e.preventDefault();
          var x = e.pageX - viewport.offsetLeft;
          var y = e.pageY - viewport.offsetTop;
          viewport.scrollLeft = scrollL - (x - startX);
          viewport.scrollTop = scrollT - (y - startY);
        });
      }

      // View switcher for combined export
      var tabCard = document.getElementById('tabBtnCard');
      var tabPhys = document.getElementById('tabBtnPhysical');
      var panelCard = document.getElementById('panelCardView');
      var panelPhys = document.getElementById('panelPhysicalView');
      if (tabCard && tabPhys && panelCard && panelPhys) {
        tabCard.addEventListener('click', function () {
          panelCard.classList.remove('hidden');
          panelPhys.classList.add('hidden');
          tabCard.classList.add('active');
          tabPhys.classList.remove('active');
        });
        tabPhys.addEventListener('click', function () {
          panelPhys.classList.remove('hidden');
          panelCard.classList.add('hidden');
          tabPhys.classList.add('active');
          tabCard.classList.remove('active');
        });
      }

      // Theme & Print
      var themeBtn = document.getElementById('btnTheme');
      if (themeBtn) {
        themeBtn.addEventListener('click', function () {
          var cur = document.documentElement.getAttribute('data-theme');
          document.documentElement.setAttribute('data-theme', cur === 'light' ? 'dark' : 'light');
        });
      }
      var printBtn = document.getElementById('btnPrint');
      if (printBtn) {
        printBtn.addEventListener('click', function () { window.print(); });
      }

      // Interactive Highlight & VLAN Table Filtering
      var searchInput = document.getElementById('linkSearchInput');
      var vlanSelect = document.getElementById('linkVlanFilter');
      var modeSelect = document.getElementById('linkModeFilter');
      var statusSelect = document.getElementById('linkStatusFilter');
      var visibleCountEl = document.getElementById('visibleLinksCount');

      function clearCanvasHighlight() {
        document.querySelectorAll('.device-card, .topo-link').forEach(function (el) {
          el.classList.remove('highlighted', 'dimmed');
        });
      }

      function highlightByVlan(vlanStr) {
        clearCanvasHighlight();
        if (!vlanStr) return;
        var activeDevices = {};
        document.querySelectorAll('.topo-link').forEach(function (el) {
          var list = (el.getAttribute('data-vlans') || '').split(',');
          if (list.indexOf(vlanStr) !== -1) {
            el.classList.add('highlighted');
            activeDevices[el.getAttribute('data-src')] = true;
            activeDevices[el.getAttribute('data-tgt')] = true;
          } else {
            el.classList.add('dimmed');
          }
        });
        document.querySelectorAll('.device-card').forEach(function (el) {
          var id = el.getAttribute('data-device-id');
          var list = (el.getAttribute('data-vlans') || '').split(',');
          if (activeDevices[id] || list.indexOf(vlanStr) !== -1) {
            el.classList.add('highlighted');
          } else {
            el.classList.add('dimmed');
          }
        });
      }

      function highlightByDevice(devId) {
        clearCanvasHighlight();
        if (!devId) return;
        var peers = {};
        peers[devId] = true;
        document.querySelectorAll('.topo-link').forEach(function (el) {
          var s = el.getAttribute('data-src');
          var t = el.getAttribute('data-tgt');
          if (s === devId || t === devId) {
            el.classList.add('highlighted');
            peers[s] = true;
            peers[t] = true;
          } else {
            el.classList.add('dimmed');
          }
        });
        document.querySelectorAll('.device-card').forEach(function (el) {
          if (peers[el.getAttribute('data-device-id')]) el.classList.add('highlighted');
          else el.classList.add('dimmed');
        });
      }

      function applyTableFilters() {
        var q = searchInput ? searchInput.value.trim().toLowerCase() : '';
        var v = vlanSelect ? vlanSelect.value.trim() : '';
        var m = modeSelect ? modeSelect.value.trim() : '';
        var s = statusSelect ? statusSelect.value.trim() : '';
        var shown = 0;
        document.querySelectorAll('.vlan-link-row').forEach(function (row) {
          var vlans = (row.getAttribute('data-vlans') || '').split(',');
          var mode = row.getAttribute('data-mode') || '';
          var status = row.getAttribute('data-status') || '';
          var blob = row.getAttribute('data-search') || '';
          var ok = (!q || blob.indexOf(q) !== -1) && (!v || vlans.indexOf(v) !== -1) && (!m || mode === m) && (!s || status === s);
          row.classList.toggle('hidden', !ok);
          if (ok) shown++;
        });
        if (visibleCountEl) visibleCountEl.textContent = String(shown);

        document.querySelectorAll('.port-vlan-row').forEach(function (row) {
          var vlans = (row.getAttribute('data-vlans') || '').split(',');
          var blob = row.getAttribute('data-search') || '';
          var ok = (!q || blob.indexOf(q) !== -1) && (!v || vlans.indexOf(v) !== -1);
          row.classList.toggle('hidden', !ok);
        });
      }

      if (searchInput) searchInput.addEventListener('input', applyTableFilters);
      if (vlanSelect) vlanSelect.addEventListener('change', function () {
        applyTableFilters();
        highlightByVlan(vlanSelect.value.trim());
      });
      if (modeSelect) modeSelect.addEventListener('change', applyTableFilters);
      if (statusSelect) statusSelect.addEventListener('change', applyTableFilters);

      document.querySelectorAll('[data-select-vlan], [data-filter-vlan]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var v = btn.getAttribute('data-select-vlan') || btn.getAttribute('data-filter-vlan') || '';
          if (vlanSelect) vlanSelect.value = v;
          applyTableFilters();
          highlightByVlan(v);
        });
      });

      document.querySelectorAll('.device-card').forEach(function (card) {
        card.addEventListener('click', function () {
          var id = card.getAttribute('data-device-id');
          if (card.classList.contains('highlighted')) clearCanvasHighlight();
          else highlightByDevice(id);
        });
      });

      var clearBtn = document.getElementById('btnResetHighlight');
      if (clearBtn) {
        clearBtn.addEventListener('click', function () {
          clearCanvasHighlight();
          if (searchInput) searchInput.value = '';
          if (vlanSelect) vlanSelect.value = '';
          if (modeSelect) modeSelect.value = '';
          if (statusSelect) statusSelect.value = '';
          applyTableFilters();
        });
      }
    })();
  </script>
</body>
</html>`;

  const safeSlug =
    String(mapName || 'schematic')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'schematic';
  const datePart = new Date().toISOString().slice(0, 10);
  const filename = `schematic-${safeSlug}-${exportMode}-${datePart}.html`;

  return {
    html,
    filename,
    stats: {
      deviceCount: cleanDevices.length,
      onlineCount,
      offlineCount,
      linkCount: vlanData.linkRows.length,
      vlanCount: vlanData.uniqueVlans.length,
      rackCount: racks.length,
      towerCount: towers.length,
    },
  };
}

export function downloadSchematicHtmlFile(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
