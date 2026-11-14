/**
 * NetMap — Multi-Criteria Search Engine
 * Indexes devices and connections for fast real-time search & filtering
 */

export class SearchEngine {
  /**
   * @param {import('../devices/device-manager.js').DeviceManager} deviceManager 
   * @param {import('../connections/cable-manager.js').CableManager} cableManager 
   */
  constructor(deviceManager, cableManager) {
    this.deviceManager = deviceManager;
    this.cableManager = cableManager;
  }

  /**
   * Compare two IPv4 strings naturally by octets.
   * @param {string} ipA
   * @param {string} ipB
   * @returns {number}
   */
  compareIp(ipA, ipB) {
    const aParts = String(ipA || '').split('.').map((n) => parseInt(n, 10) || 0);
    const bParts = String(ipB || '').split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < 4; i++) {
      const diff = (aParts[i] || 0) - (bParts[i] || 0);
      if (diff !== 0) return diff;
    }
    return String(ipA || '').localeCompare(String(ipB || ''));
  }

  /**
   * Build searchable field values for a device under the given filter mode.
   * @param {Object} device
   * @param {'all'|'ip'|'device'|'vlan'} filterMode
   * @returns {string[]}
   */
  getSearchFields(device, filterMode = 'all') {
    const ip = device.network?.ip || device.ip || '';
    const vlan = device.network?.vlan;
    const vlanFields = vlan ? [`vlan ${vlan}`, `vlan${vlan}`, String(vlan)] : [];

    if (filterMode === 'ip') {
      return [
        ip,
        device.network?.gateway,
        device.network?.subnet,
        device.network?.mac,
        ...vlanFields,
        device.name,
        device.location
      ].filter(Boolean).map((f) => String(f).toLowerCase());
    }

    if (filterMode === 'device') {
      return [
        device.name,
        device.id,
        device.brand,
        device.model,
        device.type,
        device.category,
        device.location,
        device.inventory?.purchaseYear,
        device.inventory?.fundingSource,
        device.inventory?.inventoryCode,
        device.inventory?.serialNumber,
        device.specs?.summary,
        device.specs?.processor,
        device.notes
      ].filter(Boolean).map((f) => String(f).toLowerCase());
    }

    if (filterMode === 'vlan') {
      return [
        ...vlanFields,
        device.network?.vlanList,
        device.network?.ssid,
        device.network?.ssidSecondary,
        device.network?.wifiBand,
        ip,
        device.name
      ].filter(Boolean).map((f) => String(f).toLowerCase());
    }

    return [
      device.name,
      device.id,
      device.brand,
      device.model,
      device.type,
      device.category,
      device.location,
      device.status,
      device.inventory?.purchaseYear,
      device.inventory?.fundingSource,
      device.inventory?.inventoryCode,
      device.inventory?.serialNumber,
      device.specs?.summary,
      device.specs?.processor,
      ip,
      device.network?.gateway,
      device.network?.subnet,
      device.network?.vlanList,
      device.network?.ssid,
      device.network?.ssidSecondary,
      device.network?.wifiBand,
      device.network?.mac,
      device.network?.hostname,
      ...vlanFields,
      device.notes
    ].filter(Boolean).map((f) => String(f).toLowerCase());
  }

  /**
   * Compute relevance score for sorting matched devices.
   * @param {Object} device
   * @param {string} rawQuery
   * @param {'all'|'ip'|'device'|'vlan'} filterMode
   * @returns {number}
   */
  scoreDeviceMatch(device, rawQuery, filterMode = 'all') {
    const q = String(rawQuery || '').trim().toLowerCase();
    const ip = String(device.network?.ip || device.ip || '').trim().toLowerCase();
    const name = String(device.name || '').trim().toLowerCase();
    const brandModel = `${device.brand || ''} ${device.model || ''}`.trim().toLowerCase();
    const ssid = `${device.network?.ssid || ''} ${device.network?.ssidSecondary || ''}`.trim().toLowerCase();
    const vlanStr = device.network?.vlan ? `vlan ${device.network.vlan}` : '';

    let score = 0;

    if (ip && ip === q) score += 1000;
    if (name && name === q) score += 1000;

    if (ip && ip.startsWith(q)) score += 600;
    if (name && name.startsWith(q)) score += 500;

    if (ip && ip.includes(q)) score += 350;
    if (name && name.includes(q)) score += 300;

    if ((ssid && ssid.includes(q)) || (brandModel && brandModel.includes(q)) || (vlanStr && vlanStr.includes(q))) {
      score += 150;
    }

    if (filterMode === 'ip' && ip) score += 80;
    if (filterMode === 'vlan' && (device.network?.vlan || ssid)) score += 80;
    if (ip) score += 20;

    return score;
  }

  /**
   * Search devices matching the query string and optional filter/browse options
   * @param {string} query 
   * @param {Object} [options={}]
   * @param {'all'|'ip'|'device'|'vlan'} [options.filterMode='all']
   * @param {boolean} [options.browseWhenEmpty=false]
   * @param {number} [options.limit=25]
   * @returns {Object[]} Matching devices
   */
  searchDevices(query, options = {}) {
    const filterMode = options.filterMode || 'all';
    const browseWhenEmpty = Boolean(options.browseWhenEmpty);
    const limit = Number.isFinite(options.limit) ? options.limit : 25;
    const devices = this.deviceManager.getAllDevices();

    if (!query || query.trim() === '') {
      if (!browseWhenEmpty) return [];

      const sorted = [...devices].sort((a, b) => {
        const ipA = a.network?.ip || a.ip || '';
        const ipB = b.network?.ip || b.ip || '';

        if (filterMode === 'ip') {
          if (Boolean(ipA) !== Boolean(ipB)) return ipA ? -1 : 1;
          if (ipA && ipB) return this.compareIp(ipA, ipB);
        }

        if (filterMode === 'vlan') {
          const hasVlanA = Boolean(a.network?.vlan || a.network?.ssid);
          const hasVlanB = Boolean(b.network?.vlan || b.network?.ssid);
          if (hasVlanA !== hasVlanB) return hasVlanA ? -1 : 1;
          const vlanDiff = (Number(a.network?.vlan) || 99999) - (Number(b.network?.vlan) || 99999);
          if (vlanDiff !== 0) return vlanDiff;
        }

        return String(a.name || '').localeCompare(String(b.name || ''));
      });

      return sorted.slice(0, limit);
    }

    const cleanQuery = query.trim().toLowerCase();
    const tokens = cleanQuery.split(/\s+/);

    const matched = devices.filter((device) => {
      const fields = this.getSearchFields(device, filterMode);
      const fullText = fields.join(' ');
      return tokens.every((token) => fullText.includes(token));
    });

    matched.sort((a, b) => {
      const scoreDiff = this.scoreDeviceMatch(b, cleanQuery, filterMode) - this.scoreDeviceMatch(a, cleanQuery, filterMode);
      if (scoreDiff !== 0) return scoreDiff;

      const ipA = a.network?.ip || a.ip || '';
      const ipB = b.network?.ip || b.ip || '';
      if (ipA && ipB) {
        const ipCmp = this.compareIp(ipA, ipB);
        if (ipCmp !== 0) return ipCmp;
      }
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    return options.limit ? matched.slice(0, limit) : matched;
  }

  /**
   * Filter devices by specific criteria
   * @param {Object} filterOptions 
   * @returns {Object[]}
   */
  filterDevices(filterOptions = {}) {
    const devices = this.deviceManager.getAllDevices();

    return devices.filter((dev) => {
      if (filterOptions.category && dev.category !== filterOptions.category) return false;
      if (filterOptions.status && dev.status !== filterOptions.status) return false;
      if (filterOptions.vlan && dev.network?.vlan !== filterOptions.vlan) return false;
      if (filterOptions.type && dev.type !== filterOptions.type) return false;
      return true;
    });
  }
}

