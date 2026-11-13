/**
 * NetMap — Canvas High-Resolution Snapshot Exporter
 * Generates PNG images of the current campus map with options for 1x and 2x pixel ratio
 */

export class SnapshotExporter {
  /**
   * Export high-resolution PNG of the map canvas
   * @param {Object} options
   * @param {Konva.Stage} options.stage
   * @param {Konva.Layer} options.interactionLayer
   * @param {number} [options.pixelRatio=2]
   * @param {string} [options.filename]
   */
  static exportMapPng({ stage, interactionLayer, pixelRatio = 2, filename }) {
    if (!stage) return;

    const defaultFilename = `netmap-snapshot-${pixelRatio}x-${Date.now()}.png`;

    // Temporarily hide interaction handles/previews
    const wasVisible = interactionLayer ? interactionLayer.visible() : false;
    if (interactionLayer) {
      interactionLayer.visible(false);
    }

    try {
      const dataUrl = stage.toDataURL({
        pixelRatio: pixelRatio,
        mimeType: 'image/png',
        quality: 1.0
      });

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename || defaultFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      // Restore interaction layer
      if (interactionLayer) {
        interactionLayer.visible(wasVisible);
        interactionLayer.batchDraw();
      }
    }
  }

  /**
   * Get raw dataURL of the stage for embedding in PDF
   * @param {Konva.Stage} stage 
   * @param {Konva.Layer} interactionLayer 
   * @returns {string} Data URL
   */
  static getSnapshotDataUrl(stage, interactionLayer) {
    const wasVisible = interactionLayer ? interactionLayer.visible() : false;
    if (interactionLayer) {
      interactionLayer.visible(false);
    }

    try {
      return stage.toDataURL({
        pixelRatio: 1.5,
        mimeType: 'image/jpeg',
        quality: 0.85
      });
    } finally {
      if (interactionLayer) {
        interactionLayer.visible(wasVisible);
        interactionLayer.batchDraw();
      }
    }
  }
}

