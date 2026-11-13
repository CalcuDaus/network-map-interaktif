/**
 * NetMap — Primary Canvas & Map Engine
 * Manages Konva.Stage lifecycle, background image rendering, layers, and resize observer
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { coordinateSystem } from './coordinate-system.js';
import { MapLayers } from './map-layers.js';
import { MapInteractions } from './map-interactions.js';

export class MapEngine {
  /**
   * @param {string} containerId 
   */
  constructor(containerId = 'konva-stage-container') {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.viewportElement = document.getElementById('map-viewport');
    
    this.mapDimensions = {
      width: 1024,
      height: 1024
    };

    this.stage = null;
    this.layers = null;
    this.interactions = null;
    this.bgImageNode = null;
    this.resizeObserver = null;

    // Focus mode: automatically dim background map when an object is selected
    this.dimOnSelection = true;
    this.focusOpacity = 0.38;
    this.bgTween = null;
    this.isDimmed = false;
    this.deviceManager = null;
    this.cableManager = null;
  }

  /**
   * Initialize Stage, Layers, Background Image, and Interactions
   */
  async init() {
    if (!this.container) {
      throw new Error(`Container element #${this.containerId} not found`);
    }

    const initialWidth = this.container.offsetWidth || 800;
    const initialHeight = this.container.offsetHeight || 600;

    // Cap high-DPI pixelRatio for smooth 60fps canvas panning/zooming (exports still use explicit 2x)
    if (window.Konva) {
      Konva.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    }

    // 1. Create Konva Stage
    this.stage = new Konva.Stage({
      container: this.containerId,
      width: initialWidth,
      height: initialHeight
    });

    // 2. Initialize 7-Layer Architecture
    this.layers = new MapLayers(this.stage);

    // Optimize raster background layer pixelRatio separately for faster drawImage blitting
    if (this.layers.bgLayer?.getCanvas) {
      this.layers.bgLayer.getCanvas().setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    }

    // 3. Initialize Interactions (Pan, Zoom, Tracking)
    this.interactions = new MapInteractions(this.stage, this.viewportElement, this.mapDimensions, this.layers);

    // 4. Setup Dynamic Resize Observer
    this.setupResizeObserver();

    // 5. Load Background Map Image
    await this.loadMapImage('assets/maps/campus-map.jpg');

    // 6. Automatically Fit Map to Viewport on initial load
    this.interactions.fitToScreen(30);

    return this;
  }

  /**
   * Asynchronously load map image and render it to bgLayer
   * @param {string} imageSrc 
   */
  loadMapImage(imageSrc) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = imageSrc;

      img.onload = async () => {
        if (typeof img.decode === 'function') {
          try {
            await img.decode();
          } catch (e) {}
        }

        this.mapDimensions.width = img.naturalWidth || 1024;
        this.mapDimensions.height = img.naturalHeight || 1024;

        // Update coordinate system natural dimension
        coordinateSystem.setImageDimensions(this.mapDimensions.width, this.mapDimensions.height);
        stateManager.setMapLoaded(this.mapDimensions.width, this.mapDimensions.height);

        // Render to Konva.Image on bgLayer
        this.bgImageNode = new Konva.Image({
          x: 0,
          y: 0,
          image: img,
          width: this.mapDimensions.width,
          height: this.mapDimensions.height,
          listening: false,
          perfectDrawEnabled: false,
          shadowForStrokeEnabled: false
        });

        this.layers.bgLayer.destroyChildren();
        this.layers.bgLayer.add(this.bgImageNode);
        this.layers.bgLayer.batchDraw();

        // Hide loading overlay
        const loadingOverlay = document.getElementById('map-loading-overlay');
        if (loadingOverlay) {
          loadingOverlay.classList.add('hidden');
        }

        resolve(this.bgImageNode);
      };

      img.onerror = (err) => {
        console.error('[MapEngine] Failed to load map background image:', imageSrc, err);
        const loadingText = document.querySelector('.loading-text');
        if (loadingText) {
          loadingText.textContent = 'Gagal memuat denah peta. Periksa lokasi file gambar.';
          loadingText.style.color = 'var(--status-offline)';
        }
        reject(err);
      };
    });
  }

  /**
   * Smoothly dim background layer when an object is selected
   * @param {number} [targetOpacity=0.38]
   */
  dimBackground(targetOpacity = this.focusOpacity) {
    if (!this.dimOnSelection || !this.layers?.bgLayer) return;

    if (this.bgTween) {
      this.bgTween.destroy();
    }

    this.isDimmed = true;
    this.bgTween = new Konva.Tween({
      node: this.layers.bgLayer,
      duration: 0.22,
      opacity: targetOpacity,
      easing: Konva.Easings.EaseInOut
    });
    this.bgTween.play();
  }

  /**
   * Smoothly restore background layer to full opacity when selection is cleared
   */
  restoreBackground() {
    if (!this.layers?.bgLayer) return;

    if (this.bgTween) {
      this.bgTween.destroy();
    }

    this.isDimmed = false;
    this.bgTween = new Konva.Tween({
      node: this.layers.bgLayer,
      duration: 0.22,
      opacity: 1.0,
      easing: Konva.Easings.EaseInOut
    });
    this.bgTween.play();
  }

  /**
   * Setup reactive selection listeners to automatically dim/restore map background
   * @param {import('../devices/device-manager.js').DeviceManager} deviceManager
   * @param {import('../connections/cable-manager.js').CableManager} cableManager
   */
  setupSelectionFocusListeners(deviceManager, cableManager) {
    this.deviceManager = deviceManager;
    this.cableManager = cableManager;

    const checkSelection = () => {
      const hasSelectedDevice = Boolean(this.deviceManager?.selectedDeviceId);
      const hasSelectedCable = Boolean(this.cableManager?.selectedCableId);

      if (hasSelectedDevice || hasSelectedCable) {
        if (this.dimOnSelection) this.dimBackground(this.focusOpacity);
      } else {
        this.restoreBackground();
      }
    };

    eventBus.on('device:selected', () => {
      if (this.dimOnSelection) this.dimBackground(this.focusOpacity);
    });

    eventBus.on('connection:selected', () => {
      if (this.dimOnSelection) this.dimBackground(this.focusOpacity);
    });

    eventBus.on('device:deselected', () => {
      setTimeout(checkSelection, 30);
    });

    eventBus.on('connection:deselected', () => {
      setTimeout(checkSelection, 30);
    });

    eventBus.on('canvas:clicked-empty', () => {
      this.restoreBackground();
    });

    eventBus.on('device:deleted', () => {
      setTimeout(checkSelection, 30);
    });

    eventBus.on('connection:deleted', () => {
      setTimeout(checkSelection, 30);
    });
  }

  /**
   * Observe container size changes and update Konva Stage dimensions
   */
  setupResizeObserver() {
    let resizeRaf = null;
    let latestW = 0;
    let latestH = 0;

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          latestW = width;
          latestH = height;
        }
      }
      if (resizeRaf === null && latestW > 0 && latestH > 0 && this.stage) {
        resizeRaf = requestAnimationFrame(() => {
          resizeRaf = null;
          if (this.stage) {
            this.stage.width(latestW);
            this.stage.height(latestH);
            this.stage.batchDraw();
          }
        });
      }
    });

    this.resizeObserver.observe(this.container);
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.stage) {
      this.stage.destroy();
    }
  }
}
