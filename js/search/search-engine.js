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
   * Search devices matching the query string
   * @param {string} query 
   * @returns {Object[]} Matching devices
   */
  searchDevices(query) {
    if (!query || query.trim() === '') return [];

    const tokens = query.trim().toLowerCase().split(/\s+/);
    const devices = this.deviceManager.getAllDevices();

    return devices.filter((device) => {
      // Build searchable text composite
      const fields = [
        device.name,
        device.id,
        device.brand,
        device.model,
        device.type,
        device.category,
        device.location,
        device.status,
        device.network?.ip,
        device.network?.mac,
        device.network?.hostname,
        device.network?.vlan ? `vlan ${device.network.vlan}` : '',
        device.network?.vlan ? `vlan${device.network.vlan}` : '',
        device.notes
      ].filter(Boolean).map((f) => String(f).toLowerCase());

      const fullText = fields.join(' ');

      // All tokens must match somewhere in the fullText
      return tokens.every((token) => fullText.includes(token));
    });
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

