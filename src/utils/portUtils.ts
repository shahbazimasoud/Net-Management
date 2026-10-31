/**
 * Utility functions for switch and router interface matching and normalization.
 */

export function normalizeInterfaceName(raw: string): string {
  if (!raw) return '';
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/^gigabitethernet/i, 'gi')
    .replace(/^tengigabitethernet/i, 'te')
    .replace(/^twentyfivegigabitethernet/i, 'twe')
    .replace(/^fortygigabitethernet/i, 'fo')
    .replace(/^hundredgigabitethernet/i, 'hu')
    .replace(/^fastethernet/i, 'fa')
    .replace(/^ethernet/i, 'eth')
    .replace(/^port-channel/i, 'po')
    .replace(/^serial/i, 'se')
    .replace(/^loopback/i, 'lo')
    .replace(/^vlan/i, 'vl');
}

export function matchPortFlexible(p: any, targetId: string): boolean {
  if (!p || !targetId) return false;
  const tRaw = String(targetId).trim();
  if (!tRaw) return false;

  const tNorm = normalizeInterfaceName(tRaw);
  const pNormId = normalizeInterfaceName(p.port_id || p.port || p.id || '');
  const pNormName = normalizeInterfaceName(p.name || '');

  // 1. Direct canonical normalized match (e.g. gi0/20 === gi0/20)
  if (tNorm && (pNormId === tNorm || pNormName === tNorm)) {
    return true;
  }

  // 2. Direct lowercase match without whitespace
  const tLow = tRaw.toLowerCase().replace(/\s+/g, '');
  const pIdLow = String(p.port_id || p.port || p.id || '').toLowerCase().replace(/\s+/g, '');
  const pNameLow = String(p.name || '').toLowerCase().replace(/\s+/g, '');
  if (tLow && (pIdLow === tLow || pNameLow === tLow)) {
    return true;
  }

  // 3. Trailing interface numeric segment match (e.g., '20' or '0/20' matching 'Gi0/20' or 'GigabitEthernet0/20')
  const extractSuffix = (str: string) => str.replace(/^[a-z\-]+/i, '');
  const sfxT = extractSuffix(tNorm);
  const sfxP = extractSuffix(pNormId);
  const sfxName = extractSuffix(pNormName);

  if (sfxT && (sfxT === sfxP || sfxT === sfxName)) {
    const preT = tNorm.substring(0, tNorm.length - sfxT.length);
    const preP = pNormId.substring(0, pNormId.length - sfxP.length);
    if (!preT || !preP || preT === preP || preT.startsWith(preP) || preP.startsWith(preT)) {
      return true;
    }
  }

  // 4. Pure port index / digit matching if targetId is a single number (e.g. '20')
  if (/^\d+$/.test(tRaw)) {
    const targetNum = parseInt(tRaw, 10);
    const mP = (pNormId || pNormName).match(/\/(\d+)$/) || (pNormId || pNormName).match(/(\d+)$/);
    if (mP && parseInt(mP[1], 10) === targetNum) {
      return true;
    }
  }

  return false;
}
