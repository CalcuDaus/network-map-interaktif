/**
 * NetMap — Layer Architecture & Manager
 * Implements the 7 layered rendering architecture with performance-first lazy layer compositing
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';

export class MapLayers {
  /**
   * Initialize all 7 Konva Layers on the Stage
   * @param {Konva.Stage} stage 
   */
  constructor(stage) {
    this.stage = stage;

    // 1. Background Layer (Static map floor-plan image, no hit graph needed)
    this.bgLayer = new Konva.Layer({
      id: 'bg-layer',
      listening: false,
      hitGraphEnabled: false
    });

    // 2. Building Layer (Lazy-enabled only when objects are present)
    this.buildingLayer = new Konva.Layer({
      id: 'building-layer',
      visible: false,
      listening: false,
      hitGraphEnabled: false
    });

    // 3. Infrastructure Layer (Lazy-enabled only when objects are present)
    this.infrastructureLayer = new Konva.Layer({
      id: 'infrastructure-layer',
      visible: false,
      listening: false,
      hitGraphEnabled: false
    });

    // 4. Network Device Layer (Routers, Switches, APs, Servers, CCTV)
    this.deviceLayer = new Konva.Layer({
      id: 'device-layer'
    });

    // 5. Connection Layer (Cable routes, fibers, wireless links)
    this.connectionLayer = new Konva.Layer({
      id: 'connection-layer'
    });

    // 6. Annotation Layer (Lazy-enabled only when objects are present)
    this.annotationLayer = new Konva.Layer({
      id: 'annotation-layer',
      visible: false,
      listening: false,
      hitGraphEnabled: false
    });

    // 7. Interaction Layer (Drawing previews, selection bounds, waypoint handles)
    this.interactionLayer = new Konva.Layer({
      id: 'interaction-layer'
    });

    // Add all layers to stage in strict order (bottom to top)
    this.stage.add(this.bgLayer);
    this.stage.add(this.buildingLayer);
    this.stage.add(this.infrastructureLayer);
    this.stage.add(this.connectionLayer);
    this.stage.add(this.deviceLayer);
    this.stage.add(this.annotationLayer);
    this.stage.add(this.interactionLayer);

    // Map dictionary for easy reference
    this.layers = {
      background: this.bgLayer,
      buildings: this.buildingLayer,
      infrastructure: this.infrastructureLayer,
      connections: this.connectionLayer,
      devices: this.deviceLayer,
      annotations: this.annotationLayer,
      interaction: this.interactionLayer
    };

    // Listen to layer visibility toggle events
    eventBus.on('layer:visibility-changed', ({ layer, visible }) => {
      this.setLayerVisibility(layer, visible);
    });
  }

  /**
   * Set visibility of a specific layer
   * @param {string} layerName 
   * @param {boolean} visible 
   */
  setLayerVisibility(layerName, visible) {
    const targetLayer = this.layers[layerName];
    if (!targetLayer) return;

    // Avoid compositing empty placeholder layers
    const isOptionalOverlay = layerName === 'buildings' || layerName === 'infrastructure' || layerName === 'annotations';
    if (isOptionalOverlay && targetLayer.getChildren().length === 0) {
      targetLayer.visible(false);
      return;
    }

    targetLayer.visible(visible);
    targetLayer.batchDraw();
  }

  /**
   * Temporarily suspend or restore hit-testing & listening on interactive layers
   * Eliminates expensive hit-canvas scans and accidental hover tweens during pan/zoom
   * @param {boolean} enabled 
   */
  setInteractiveHitTesting(enabled) {
    const targets = [this.deviceLayer, this.connectionLayer, this.interactionLayer];
    targets.forEach((layer) => {
      if (!layer) return;
      layer.listening(enabled);
      if (typeof layer.hitGraphEnabled === 'function') {
        layer.hitGraphEnabled(enabled);
      }
    });
  }

  /**
   * Redraw all layers
   */
  batchDrawAll() {
    this.stage.batchDraw();
  }

  /**
   * Redraw a specific layer
   * @param {string} layerName 
   */
  batchDraw(layerName) {
    if (this.layers[layerName]) {
      this.layers[layerName].batchDraw();
    }
  }

  /**
   * Clear interaction layer (used after finishing drawing or deselecting)
   */
  clearInteractionLayer() {
    this.interactionLayer.destroyChildren();
    this.interactionLayer.batchDraw();
  }
}
