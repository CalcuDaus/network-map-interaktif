/**
 * NetMap — JSON Backup & Restore Module
 * Handles file downloads, uploads, strict schema validation, and XSS sanitization
 */

export class JsonImporterExporter {
  /**
   * Export project data as downloadable JSON file
   * @param {Object} projectData 
   * @param {string} [filename] 
   */
  static exportJson(projectData, filename) {
    const defaultName = `netmap-${projectData.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.json`;
    const jsonStr = JSON.stringify(projectData, null, 2);

    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename || defaultName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Read and validate an uploaded JSON file
   * @param {File} file 
   * @returns {Promise<{isValid: boolean, project: Object|null, errors: string[]}>}
   */
  static async importJson(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const rawObj = JSON.parse(e.target.result);
          const validation = JsonImporterExporter.validateAndSanitize(rawObj);
          resolve(validation);
        } catch (err) {
          resolve({
            isValid: false,
            project: null,
            errors: ['File bukan format JSON yang valid: ' + err.message]
          });
        }
      };

      reader.onerror = () => {
        resolve({
          isValid: false,
          project: null,
          errors: ['Gagal membaca file dari disk']
        });
      };

      reader.readAsText(file);
    });
  }

  /**
   * Validate project structure and sanitize strings against XSS
   * @param {Object} data 
   * @returns {{isValid: boolean, project: Object|null, errors: string[]}}
   */
  static validateAndSanitize(data) {
    const errors = [];

    if (!data || typeof data !== 'object') {
      return { isValid: false, project: null, errors: ['Format data proyek tidak valid'] };
    }

    if (!data.id) errors.push('Field "id" proyek wajib ada');
    if (!data.name) errors.push('Field "name" proyek wajib ada');
    if (!Array.isArray(data.devices)) errors.push('Field "devices" wajib berupa array');
    if (!Array.isArray(data.connections)) errors.push('Field "connections" wajib berupa array');

    if (errors.length > 0) {
      return { isValid: false, project: null, errors };
    }

    // Sanitize string helper
    const sanitize = (str) => {
      if (typeof str !== 'string') return str;
      return str.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
    };

    const sanitizedDevices = [];
    const deviceIdSet = new Set();

    // Validate devices
    data.devices.forEach((dev, idx) => {
      if (!dev.id || !dev.name || !dev.position) {
        errors.push(`Perangkat index ${idx} kehilangan id, name, atau position`);
        return;
      }

      if (typeof dev.position.x !== 'number' || typeof dev.position.y !== 'number' ||
          dev.position.x < 0 || dev.position.x > 1 || dev.position.y < 0 || dev.position.y > 1) {
        errors.push(`Perangkat "${dev.name}" memiliki koordinat posisi di luar rentang [0, 1]`);
      }

      deviceIdSet.add(dev.id);

      sanitizedDevices.push({
        ...dev,
        name: sanitize(dev.name),
        brand: sanitize(dev.brand || ''),
        model: sanitize(dev.model || ''),
        location: sanitize(dev.location || ''),
        notes: sanitize(dev.notes || ''),
        network: {
          ip: sanitize(dev.network?.ip || ''),
          mac: sanitize(dev.network?.mac || ''),
          subnet: sanitize(dev.network?.subnet || '255.255.255.0'),
          vlan: dev.network?.vlan ? Number(dev.network.vlan) : 1,
          hostname: sanitize(dev.network?.hostname || '')
        }
      });
    });

    const sanitizedConnections = [];

    // Validate connections
    data.connections.forEach((cable, idx) => {
      if (!cable.id || !cable.source || !cable.destination) {
        errors.push(`Kabel index ${idx} kehilangan id, source, atau destination`);
        return;
      }

      if (!deviceIdSet.has(cable.source)) {
        errors.push(`Kabel "${cable.name || cable.id}" merujuk ke source device ID yang tidak ada: ${cable.source}`);
      }

      if (!deviceIdSet.has(cable.destination)) {
        errors.push(`Kabel "${cable.name || cable.id}" merujuk ke destination device ID yang tidak ada: ${cable.destination}`);
      }

      sanitizedConnections.push({
        ...cable,
        name: sanitize(cable.name || 'Cable Link'),
        notes: sanitize(cable.notes || '')
      });
    });

    if (errors.length > 0) {
      return { isValid: false, project: null, errors };
    }

    const cleanProject = {
      version: data.version || '1.0',
      id: sanitize(data.id),
      name: sanitize(data.name),
      map: data.map || { image: 'assets/maps/campus-map.jpg', naturalWidth: 1024, naturalHeight: 1024 },
      layers: data.layers || {},
      devices: sanitizedDevices,
      connections: sanitizedConnections,
      rooms3d: Array.isArray(data.rooms3d) ? data.rooms3d : [],
      updatedAt: new Date().toISOString()
    };

    return {
      isValid: true,
      project: cleanProject,
      errors: []
    };
  }
}

