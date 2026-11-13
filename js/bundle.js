(() => {
  // js/core/event-bus.js
  var EventBus = class {
    constructor() {
      this.events = /* @__PURE__ */ new Map();
    }
    /**
     * Subscribe to an event
     * @param {string} eventName 
     * @param {Function} callback 
     * @returns {Function} Unsubscribe function
     */
    on(eventName, callback) {
      if (!this.events.has(eventName)) {
        this.events.set(eventName, /* @__PURE__ */ new Set());
      }
      this.events.get(eventName).add(callback);
      return () => this.off(eventName, callback);
    }
    /**
     * Subscribe to an event once
     * @param {string} eventName 
     * @param {Function} callback 
     */
    once(eventName, callback) {
      const wrapper = (...args) => {
        this.off(eventName, wrapper);
        callback(...args);
      };
      this.on(eventName, wrapper);
    }
    /**
     * Unsubscribe from an event
     * @param {string} eventName 
     * @param {Function} callback 
     */
    off(eventName, callback) {
      if (!this.events.has(eventName)) return;
      const callbacks = this.events.get(eventName);
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.events.delete(eventName);
      }
    }
    /**
     * Emit an event with data
     * @param {string} eventName 
     * @param {any} data 
     */
    emit(eventName, data) {
      if (!this.events.has(eventName)) return;
      for (const callback of this.events.get(eventName)) {
        try {
          callback(data);
        } catch (err) {
          console.error(`[EventBus] Error in handler for event "${eventName}":`, err);
        }
      }
    }
    /**
     * Clear all event listeners
     */
    clear() {
      this.events.clear();
    }
  };
  var eventBus = new EventBus();

  // js/core/state-manager.js
  var StateManager = class {
    constructor() {
      this.state = {
        project: {
          id: "proj-default",
          name: "Campus Network Infrastructure",
          version: "1.0",
          map: {
            image: "assets/maps/campus-map.jpg",
            // Bump this whenever the base map image changes so stale saved layouts are re-seeded
            version: "campus-v2-1024",
            naturalWidth: 1024,
            naturalHeight: 1024,
            isLoaded: false
          },
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        },
        // Current interaction mode: 'navigate' | 'select' | 'add-device' | 'draw-cable' | 'edit' | 'delete'
        mode: "navigate",
        // Viewport transform
        viewport: {
          x: 0,
          y: 0,
          scale: 1,
          minScale: 0.1,
          maxScale: 6
        },
        // Selected entity (device or connection)
        selectedEntity: null,
        // Layer visibility states (PRD Section 2.2 & 3.7)
        layers: {
          background: true,
          buildings: true,
          infrastructure: true,
          devices: true,
          connections: true,
          annotations: true,
          interaction: true
        },
        // Pointer position and normalized coordinate tracking
        pointer: {
          screenX: 0,
          screenY: 0,
          imageX: 0,
          imageY: 0,
          normalizedX: 0,
          normalizedY: 0,
          isInsideMap: false
        },
        // UI panel states
        ui: {
          leftSidebarOpen: true,
          rightSidebarOpen: false
        }
      };
    }
    /**
     * Get current state (shallow copy or specific key)
     */
    getState() {
      return this.state;
    }
    /**
     * Set application interaction mode
     * @param {string} mode 
     */
    setMode(mode) {
      if (this.state.mode === mode) return;
      const prevMode = this.state.mode;
      this.state.mode = mode;
      eventBus.emit("mode:changed", { mode, prevMode });
    }
    getMode() {
      return this.state.mode;
    }
    /**
     * Update viewport scale and position
     * @param {number} scale 
     * @param {number} x 
     * @param {number} y 
     */
    setViewport(scale, x, y) {
      this.state.viewport.scale = scale;
      this.state.viewport.x = x;
      this.state.viewport.y = y;
      eventBus.emit("viewport:changed", { scale, x, y });
    }
    /**
     * Update pointer tracking coordinates
     * @param {Object} coords 
     */
    setPointerCoordinates(coords) {
      Object.assign(this.state.pointer, coords);
      eventBus.emit("pointer:moved", this.state.pointer);
    }
    /**
     * Toggle visibility of a specific map layer
     * @param {string} layerKey 
     * @param {boolean} [isVisible] 
     */
    toggleLayer(layerKey, isVisible) {
      if (this.state.layers[layerKey] === void 0) return;
      const newVisibility = isVisible !== void 0 ? isVisible : !this.state.layers[layerKey];
      this.state.layers[layerKey] = newVisibility;
      eventBus.emit("layer:visibility-changed", { layer: layerKey, visible: newVisibility });
    }
    /**
     * Toggle sidebar collapse state
     * @param {'left'|'right'} side 
     */
    toggleSidebar(side) {
      if (side === "left") {
        this.state.ui.leftSidebarOpen = !this.state.ui.leftSidebarOpen;
        eventBus.emit("ui:sidebar-toggled", { side: "left", open: this.state.ui.leftSidebarOpen });
      } else if (side === "right") {
        this.state.ui.rightSidebarOpen = !this.state.ui.rightSidebarOpen;
        eventBus.emit("ui:sidebar-toggled", { side: "right", open: this.state.ui.rightSidebarOpen });
      }
    }
    /**
     * Set map image loaded status and dimensions
     * @param {number} width 
     * @param {number} height 
     */
    setMapLoaded(width, height) {
      this.state.project.map.naturalWidth = width;
      this.state.project.map.naturalHeight = height;
      this.state.project.map.isLoaded = true;
      eventBus.emit("map:loaded", { width, height });
    }
  };
  var stateManager = new StateManager();

  // js/utils/helpers.js
  function clamp2(val, min, max) {
    return Math.min(Math.max(val, min), max);
  }
  function debounce(func, wait = 150) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  function formatDecimals(num, decimals = 4) {
    if (typeof num !== "number" || isNaN(num)) return "0";
    return num.toFixed(decimals);
  }
  function formatZoomPercentage(scale) {
    return `${Math.round(scale * 100)}%`;
  }
  function generateId(prefix = "id") {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  }

  // js/map/coordinate-system.js
  var CoordinateSystem = class {
    constructor(imageWidth = 1024, imageHeight = 1024) {
      this.imageWidth = imageWidth;
      this.imageHeight = imageHeight;
    }
    /**
     * Update natural dimensions of the map image
     * @param {number} width 
     * @param {number} height 
     */
    setImageDimensions(width, height) {
      this.imageWidth = width;
      this.imageHeight = height;
    }
    /**
     * Convert Screen / Pointer coordinates to Stage relative coordinates (accounting for stage pan & scale)
     * @param {{x: number, y: number}} screenPoint 
     * @param {Konva.Stage} stage 
     * @returns {{x: number, y: number}}
     */
    screenToStage(screenPoint, stage) {
      const scale = stage.scaleX();
      return {
        x: (screenPoint.x - stage.x()) / scale,
        y: (screenPoint.y - stage.y()) / scale
      };
    }
    /**
     * Convert Stage relative coordinates to Screen coordinates
     * @param {{x: number, y: number}} stagePoint 
     * @param {Konva.Stage} stage 
     * @returns {{x: number, y: number}}
     */
    stageToScreen(stagePoint, stage) {
      const scale = stage.scaleX();
      return {
        x: stagePoint.x * scale + stage.x(),
        y: stagePoint.y * scale + stage.y()
      };
    }
    /**
     * Convert Stage coordinates to Normalized coordinates (0.0000 - 1.0000)
     * Note: The background map image is placed at (0, 0) on the stage.
     * @param {{x: number, y: number}} stagePoint 
     * @param {boolean} [shouldClamp=false]
     * @returns {{x: number, y: number, isInside: boolean}}
     */
    stageToNormalized(stagePoint, shouldClamp = false) {
      const rawX = stagePoint.x / this.imageWidth;
      const rawY = stagePoint.y / this.imageHeight;
      const isInside = rawX >= 0 && rawX <= 1 && rawY >= 0 && rawY <= 1;
      return {
        x: shouldClamp ? clamp2(rawX, 0, 1) : rawX,
        y: shouldClamp ? clamp2(rawY, 0, 1) : rawY,
        isInside
      };
    }
    /**
     * Convert Normalized coordinates (0 - 1) to Stage / Image pixel coordinates
     * @param {{x: number, y: number}} normalizedPoint 
     * @returns {{x: number, y: number}}
     */
    normalizedToStage(normalizedPoint) {
      return {
        x: normalizedPoint.x * this.imageWidth,
        y: normalizedPoint.y * this.imageHeight
      };
    }
    /**
     * Convert Screen pointer directly to Normalized Coordinates
     * @param {{x: number, y: number}} screenPoint 
     * @param {Konva.Stage} stage 
     * @param {boolean} [shouldClamp=false]
     * @returns {{x: number, y: number, imageX: number, imageY: number, isInside: boolean}}
     */
    screenToNormalized(screenPoint, stage, shouldClamp = false) {
      const stagePoint = this.screenToStage(screenPoint, stage);
      const norm = this.stageToNormalized(stagePoint, shouldClamp);
      return {
        x: norm.x,
        y: norm.y,
        imageX: Math.round(stagePoint.x),
        imageY: Math.round(stagePoint.y),
        isInside: norm.isInside
      };
    }
    /**
     * Convert Normalized coordinates to Screen Coordinates
     * @param {{x: number, y: number}} normalizedPoint 
     * @param {Konva.Stage} stage 
     * @returns {{x: number, y: number}}
     */
    normalizedToScreen(normalizedPoint, stage) {
      const stagePoint = this.normalizedToStage(normalizedPoint);
      return this.stageToScreen(stagePoint, stage);
    }
    /**
     * Check if a normalized coordinate is within map bounds (0 - 1)
     * @param {{x: number, y: number}} point 
     * @returns {boolean}
     */
    isWithinBounds(point) {
      return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
    }
  };
  var coordinateSystem = new CoordinateSystem(1024, 1024);

  // js/map/map-layers.js
  var MapLayers = class {
    /**
     * Initialize all 7 Konva Layers on the Stage
     * @param {Konva.Stage} stage 
     */
    constructor(stage) {
      this.stage = stage;
      this.bgLayer = new Konva.Layer({
        id: "bg-layer",
        listening: false,
        hitGraphEnabled: false
      });
      this.buildingLayer = new Konva.Layer({
        id: "building-layer",
        visible: false,
        listening: false,
        hitGraphEnabled: false
      });
      this.infrastructureLayer = new Konva.Layer({
        id: "infrastructure-layer",
        visible: false,
        listening: false,
        hitGraphEnabled: false
      });
      this.deviceLayer = new Konva.Layer({
        id: "device-layer"
      });
      this.connectionLayer = new Konva.Layer({
        id: "connection-layer"
      });
      this.annotationLayer = new Konva.Layer({
        id: "annotation-layer",
        visible: false,
        listening: false,
        hitGraphEnabled: false
      });
      this.interactionLayer = new Konva.Layer({
        id: "interaction-layer"
      });
      this.stage.add(this.bgLayer);
      this.stage.add(this.buildingLayer);
      this.stage.add(this.infrastructureLayer);
      this.stage.add(this.connectionLayer);
      this.stage.add(this.deviceLayer);
      this.stage.add(this.annotationLayer);
      this.stage.add(this.interactionLayer);
      this.layers = {
        background: this.bgLayer,
        buildings: this.buildingLayer,
        infrastructure: this.infrastructureLayer,
        connections: this.connectionLayer,
        devices: this.deviceLayer,
        annotations: this.annotationLayer,
        interaction: this.interactionLayer
      };
      eventBus.on("layer:visibility-changed", ({ layer, visible }) => {
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
      const isOptionalOverlay = layerName === "buildings" || layerName === "infrastructure" || layerName === "annotations";
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
        if (typeof layer.hitGraphEnabled === "function") {
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
  };

  // js/map/map-interactions.js
  var MapInteractions = class {
    /**
     * @param {Konva.Stage} stage 
     * @param {HTMLElement} container 
     * @param {{width: number, height: number}} mapDimensions 
     * @param {import('./map-layers.js').MapLayers} [layers=null]
     */
    constructor(stage, container, mapDimensions, layers = null) {
      this.stage = stage;
      this.container = container;
      this.mapDimensions = mapDimensions;
      this.layers = layers;
      this.isDragging = false;
      this.isSpacePressed = false;
      this.hitSuspendReasons = /* @__PURE__ */ new Set();
      this.scaleBy = 1.15;
      this._uiSyncRafId = null;
      this._pendingViewportSync = false;
      this._pendingPointerSync = false;
      this._wheelRafId = null;
      this._wheelAccumDelta = 0;
      this._wheelLastPointer = null;
      this._wheelResumeTimer = null;
      this.initEventListeners();
      this.initModeListener();
      this.initCustomEventListeners();
      this.initSpacebarPanning();
    }
    /**
     * Suspend interactive hit-testing on device/cable/interaction layers for a given reason
     * ('drag' | 'wheel' | 'space' | 'anim')
     * @param {string} reason 
     */
    suspendHitTesting(reason) {
      const wasActive = this.hitSuspendReasons.size === 0;
      this.hitSuspendReasons.add(reason);
      if (wasActive) {
        if (this.layers && typeof this.layers.setInteractiveHitTesting === "function") {
          this.layers.setInteractiveHitTesting(false);
        } else {
          const interactiveIds = ["device-layer", "connection-layer", "interaction-layer"];
          this.stage.getLayers().forEach((layer) => {
            if (interactiveIds.includes(layer.id())) {
              layer.listening(false);
              if (typeof layer.hitGraphEnabled === "function") {
                layer.hitGraphEnabled(false);
              }
            }
          });
        }
      }
    }
    /**
     * Resume interactive hit-testing once all suspend reasons are cleared
     * @param {string} reason 
     */
    resumeHitTesting(reason) {
      this.hitSuspendReasons.delete(reason);
      if (this.hitSuspendReasons.size === 0) {
        if (this.layers && typeof this.layers.setInteractiveHitTesting === "function") {
          this.layers.setInteractiveHitTesting(true);
        } else {
          const interactiveIds = ["device-layer", "connection-layer", "interaction-layer"];
          this.stage.getLayers().forEach((layer) => {
            if (interactiveIds.includes(layer.id())) {
              layer.listening(true);
              if (typeof layer.hitGraphEnabled === "function") {
                layer.hitGraphEnabled(true);
              }
            }
          });
        }
      }
    }
    /**
     * Schedule rAF-coalesced DOM UI updates (zoom readouts & coordinate display)
     * Avoids synchronous layout thrashing during high-frequency dragmove/wheel/mousemove
     * @param {boolean} syncViewport 
     * @param {boolean} syncPointer 
     */
    scheduleUiSync(syncViewport = false, syncPointer = false) {
      if (syncViewport) this._pendingViewportSync = true;
      if (syncPointer) this._pendingPointerSync = true;
      if (this._uiSyncRafId !== null) return;
      this._uiSyncRafId = requestAnimationFrame(() => {
        this._uiSyncRafId = null;
        if (this._pendingViewportSync) {
          this._pendingViewportSync = false;
          const pos = this.stage.position();
          stateManager.setViewport(this.stage.scaleX(), pos.x, pos.y);
        }
        if (this._pendingPointerSync) {
          this._pendingPointerSync = false;
          this.updatePointerTracking();
        }
      });
    }
    /**
     * Attach interaction event listeners to Konva Stage and DOM container
     */
    initEventListeners() {
      this.stage.on("wheel", (e) => {
        e.evt.preventDefault();
        let deltaY = e.evt.deltaY;
        if (e.evt.deltaMode === 1) deltaY *= 16;
        else if (e.evt.deltaMode === 2) deltaY *= 100;
        this._wheelAccumDelta += deltaY;
        const pointer = this.stage.getPointerPosition();
        if (pointer) {
          this._wheelLastPointer = pointer;
        }
        this.suspendHitTesting("wheel");
        clearTimeout(this._wheelResumeTimer);
        this._wheelResumeTimer = setTimeout(() => {
          this.resumeHitTesting("wheel");
        }, 150);
        if (this._wheelRafId !== null) return;
        this._wheelRafId = requestAnimationFrame(() => {
          this._wheelRafId = null;
          const accumDelta = this._wheelAccumDelta;
          this._wheelAccumDelta = 0;
          if (accumDelta === 0) return;
          const targetPointer = this._wheelLastPointer || this.stage.getPointerPosition();
          if (!targetPointer) return;
          const oldScale = this.stage.scaleX();
          const mousePointTo = {
            x: (targetPointer.x - this.stage.x()) / oldScale,
            y: (targetPointer.y - this.stage.y()) / oldScale
          };
          const zoomFactor = clamp2(Math.pow(1.0016, -accumDelta), 0.72, 1.38);
          const { minScale, maxScale } = stateManager.getState().viewport;
          const newScale = clamp2(oldScale * zoomFactor, minScale, maxScale);
          if (newScale === oldScale) return;
          this.stage.scale({ x: newScale, y: newScale });
          const newPos = {
            x: targetPointer.x - mousePointTo.x * newScale,
            y: targetPointer.y - mousePointTo.y * newScale
          };
          this.stage.position(newPos);
          this.stage.batchDraw();
          this.scheduleUiSync(true, true);
        });
      });
      this.stage.on("dragstart", (e) => {
        if (e.target === this.stage) {
          this.isDragging = true;
          this.suspendHitTesting("drag");
          this.container.classList.add("panning");
          this.container.style.cursor = "grabbing";
        }
      });
      this.stage.on("dragmove", (e) => {
        if (e.target === this.stage) {
          this.scheduleUiSync(true, false);
        }
      });
      this.stage.on("dragend", (e) => {
        if (e.target === this.stage) {
          this.isDragging = false;
          this.resumeHitTesting("drag");
          this.container.classList.remove("panning");
          if (this.isSpacePressed || stateManager.getMode() === "navigate") {
            this.container.style.cursor = "grab";
          } else {
            const mode = stateManager.getMode();
            this.container.style.cursor = mode === "add-device" || mode === "draw-cable" ? "crosshair" : "default";
          }
          const pos = this.stage.position();
          stateManager.setViewport(this.stage.scaleX(), pos.x, pos.y);
          this.updatePointerTracking();
        }
      });
      this.stage.on("mousemove", () => {
        if (!this.isDragging) {
          this.scheduleUiSync(false, true);
        }
      });
      this.stage.on("click tap", (e) => {
        if (this.isSpacePressed) {
          return;
        }
        const isBg = e.target === this.stage || e.target.hasName("bg-layer") || e.target.hasName("background");
        if (isBg) {
          const pointer = this.stage.getPointerPosition();
          if (!pointer) return;
          const norm = coordinateSystem.screenToNormalized(pointer, this.stage);
          const mode = stateManager.getMode();
          if (mode === "add-device") {
            eventBus.emit("canvas:place-device", {
              normalizedX: norm.x,
              normalizedY: norm.y,
              isInside: norm.isInside
            });
          } else {
            eventBus.emit("canvas:clicked-empty");
          }
        }
      });
      this.stage.on("contextmenu", (e) => {
        e.evt.preventDefault();
        const isBg = e.target === this.stage || e.target.hasName("bg-layer") || e.target.hasName("background");
        if (isBg) {
          const pointer = this.stage.getPointerPosition();
          const norm = pointer ? coordinateSystem.screenToNormalized(pointer, this.stage) : { x: 0.5, y: 0.5 };
          eventBus.emit("contextmenu:canvas", {
            screenX: e.evt.clientX,
            screenY: e.evt.clientY,
            normX: norm.x,
            normY: norm.y
          });
        }
      });
      this.container.addEventListener("mouseleave", () => {
        stateManager.setPointerCoordinates({
          isInsideMap: false
        });
      });
      this.container.addEventListener("contextmenu", (e) => {
        e.preventDefault();
      });
    }
    /**
     * Listen to external events like centering camera on a position
     */
    initCustomEventListeners() {
      eventBus.on("viewport:center-on", (position) => {
        this.centerOnPosition(position);
      });
    }
    /**
     * Smoothly center camera on normalized coordinate
     * @param {{x: number, y: number}} normalizedPos 
     */
    centerOnPosition(normalizedPos) {
      if (!normalizedPos) return;
      const targetX = normalizedPos.x * this.mapDimensions.width;
      const targetY = normalizedPos.y * this.mapDimensions.height;
      const currentScale = Math.max(this.stage.scaleX(), 1.25);
      const newX = this.stage.width() / 2 - targetX * currentScale;
      const newY = this.stage.height() / 2 - targetY * currentScale;
      this.animateToTransform(currentScale, newX, newY, 300);
    }
    /**
     * Calculate and dispatch current pointer normalized coordinates
     */
    updatePointerTracking() {
      const pointer = this.stage.getPointerPosition();
      if (!pointer) return;
      const norm = coordinateSystem.screenToNormalized(pointer, this.stage);
      stateManager.setPointerCoordinates({
        screenX: Math.round(pointer.x),
        screenY: Math.round(pointer.y),
        imageX: norm.imageX,
        imageY: norm.imageY,
        normalizedX: norm.x,
        normalizedY: norm.y,
        isInsideMap: norm.isInside
      });
    }
    /**
     * Listen to interaction mode changes to configure stage draggable state
     */
    initModeListener() {
      eventBus.on("mode:changed", ({ mode }) => {
        if (this.isSpacePressed) return;
        if (mode === "navigate") {
          this.stage.draggable(true);
          this.container.style.cursor = "grab";
        } else {
          this.stage.draggable(false);
          this.container.style.cursor = mode === "add-device" || mode === "draw-cable" ? "crosshair" : "default";
        }
      });
      const currentMode = stateManager.getMode();
      this.stage.draggable(currentMode === "navigate");
    }
    /**
     * Spacebar Panning (Photoshop Hand Tool shortcut)
     * Holding Spacebar temporarily enables canvas panning regardless of active mode
     */
    initSpacebarPanning() {
      this.isSpacePressed = false;
      window.addEventListener("keydown", (e) => {
        if (e.code !== "Space" && e.key !== " ") return;
        const activeEl = document.activeElement;
        const tag = activeEl ? activeEl.tagName.toLowerCase() : "";
        if (tag === "input" || tag === "textarea" || tag === "select" || activeEl?.isContentEditable) {
          return;
        }
        e.preventDefault();
        if (this.isSpacePressed) return;
        this.isSpacePressed = true;
        this.stage.draggable(true);
        this.container.classList.add("space-panning-active");
        this.container.style.cursor = "grab";
        this.suspendHitTesting("space");
      });
      window.addEventListener("keyup", (e) => {
        if (e.code !== "Space" && e.key !== " ") return;
        if (!this.isSpacePressed) return;
        this.isSpacePressed = false;
        this.container.classList.remove("space-panning-active");
        this.container.classList.remove("panning");
        this.resumeHitTesting("space");
        const currentMode = stateManager.getMode();
        if (currentMode === "navigate") {
          this.stage.draggable(true);
          this.container.style.cursor = "grab";
        } else {
          this.stage.draggable(false);
          this.container.style.cursor = currentMode === "add-device" || currentMode === "draw-cable" ? "crosshair" : "default";
        }
      });
      window.addEventListener("blur", () => {
        if (this.isSpacePressed || this.isDragging) {
          this.isSpacePressed = false;
          this.isDragging = false;
          this.container.classList.remove("space-panning-active");
          this.container.classList.remove("panning");
          this.resumeHitTesting("space");
          this.resumeHitTesting("drag");
          const currentMode = stateManager.getMode();
          this.stage.draggable(currentMode === "navigate");
          this.container.style.cursor = currentMode === "navigate" ? "grab" : currentMode === "add-device" || currentMode === "draw-cable" ? "crosshair" : "default";
        }
      });
    }
    /**
     * Fit the entire map image into the visible container viewport with padding
     * @param {number} [padding=24] 
     */
    fitToScreen(padding = 24) {
      const containerWidth = this.stage.width();
      const containerHeight = this.stage.height();
      const scaleX = (containerWidth - padding * 2) / this.mapDimensions.width;
      const scaleY = (containerHeight - padding * 2) / this.mapDimensions.height;
      const fitScale = Math.min(scaleX, scaleY);
      const targetScale = clamp2(
        fitScale,
        stateManager.getState().viewport.minScale,
        stateManager.getState().viewport.maxScale
      );
      const targetX = (containerWidth - this.mapDimensions.width * targetScale) / 2;
      const targetY = (containerHeight - this.mapDimensions.height * targetScale) / 2;
      this.animateToTransform(targetScale, targetX, targetY);
    }
    /**
     * Reset zoom scale to 1.0 (100%) and center map
     */
    resetView() {
      const containerWidth = this.stage.width();
      const containerHeight = this.stage.height();
      const targetScale = 1;
      const targetX = (containerWidth - this.mapDimensions.width * targetScale) / 2;
      const targetY = (containerHeight - this.mapDimensions.height * targetScale) / 2;
      this.animateToTransform(targetScale, targetX, targetY);
    }
    /**
     * Step Zoom In centered on viewport center
     */
    zoomIn() {
      this.zoomByStep(this.scaleBy);
    }
    /**
     * Step Zoom Out centered on viewport center
     */
    zoomOut() {
      this.zoomByStep(1 / this.scaleBy);
    }
    /**
     * Helper to perform step zoom centered on container
     * @param {number} factor 
     */
    zoomByStep(factor) {
      const oldScale = this.stage.scaleX();
      const { minScale, maxScale } = stateManager.getState().viewport;
      const newScale = clamp2(oldScale * factor, minScale, maxScale);
      if (newScale === oldScale) return;
      const center = {
        x: this.stage.width() / 2,
        y: this.stage.height() / 2
      };
      const mousePointTo = {
        x: (center.x - this.stage.x()) / oldScale,
        y: (center.y - this.stage.y()) / oldScale
      };
      const newPos = {
        x: center.x - mousePointTo.x * newScale,
        y: center.y - mousePointTo.y * newScale
      };
      this.animateToTransform(newScale, newPos.x, newPos.y, 180);
    }
    /**
     * Smoothly animate stage to target scale and position
     * @param {number} scale 
     * @param {number} x 
     * @param {number} y 
     * @param {number} [duration=220] 
     */
    animateToTransform(scale, x, y, duration = 220) {
      if (window.Konva && window.Konva.Tween) {
        this.suspendHitTesting("anim");
        new Konva.Tween({
          node: this.stage,
          duration: duration / 1e3,
          easing: Konva.Easings.EaseInOut,
          scaleX: scale,
          scaleY: scale,
          x,
          y,
          onFinish: () => {
            this.resumeHitTesting("anim");
            stateManager.setViewport(scale, x, y);
            this.updatePointerTracking();
          }
        }).play();
      } else {
        this.stage.scale({ x: scale, y: scale });
        this.stage.position({ x, y });
        this.stage.batchDraw();
        stateManager.setViewport(scale, x, y);
        this.updatePointerTracking();
      }
    }
  };

  // js/map/map-engine.js
  var MapEngine = class {
    /**
     * @param {string} containerId 
     */
    constructor(containerId = "konva-stage-container") {
      this.containerId = containerId;
      this.container = document.getElementById(containerId);
      this.viewportElement = document.getElementById("map-viewport");
      this.mapDimensions = {
        width: 1024,
        height: 1024
      };
      this.stage = null;
      this.layers = null;
      this.interactions = null;
      this.bgImageNode = null;
      this.resizeObserver = null;
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
      if (window.Konva) {
        Konva.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      }
      this.stage = new Konva.Stage({
        container: this.containerId,
        width: initialWidth,
        height: initialHeight
      });
      this.layers = new MapLayers(this.stage);
      if (this.layers.bgLayer?.getCanvas) {
        this.layers.bgLayer.getCanvas().setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
      }
      this.interactions = new MapInteractions(this.stage, this.viewportElement, this.mapDimensions, this.layers);
      this.setupResizeObserver();
      await this.loadMapImage("assets/maps/campus-map.jpg");
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
          if (typeof img.decode === "function") {
            try {
              await img.decode();
            } catch (e) {
            }
          }
          this.mapDimensions.width = img.naturalWidth || 1024;
          this.mapDimensions.height = img.naturalHeight || 1024;
          coordinateSystem.setImageDimensions(this.mapDimensions.width, this.mapDimensions.height);
          stateManager.setMapLoaded(this.mapDimensions.width, this.mapDimensions.height);
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
          const loadingOverlay = document.getElementById("map-loading-overlay");
          if (loadingOverlay) {
            loadingOverlay.classList.add("hidden");
          }
          resolve(this.bgImageNode);
        };
        img.onerror = (err) => {
          console.error("[MapEngine] Failed to load map background image:", imageSrc, err);
          const loadingText = document.querySelector(".loading-text");
          if (loadingText) {
            loadingText.textContent = "Gagal memuat denah peta. Periksa lokasi file gambar.";
            loadingText.style.color = "var(--status-offline)";
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
        opacity: 1,
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
      eventBus.on("device:selected", () => {
        if (this.dimOnSelection) this.dimBackground(this.focusOpacity);
      });
      eventBus.on("connection:selected", () => {
        if (this.dimOnSelection) this.dimBackground(this.focusOpacity);
      });
      eventBus.on("device:deselected", () => {
        setTimeout(checkSelection, 30);
      });
      eventBus.on("connection:deselected", () => {
        setTimeout(checkSelection, 30);
      });
      eventBus.on("canvas:clicked-empty", () => {
        this.restoreBackground();
      });
      eventBus.on("device:deleted", () => {
        setTimeout(checkSelection, 30);
      });
      eventBus.on("connection:deleted", () => {
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
  };

  // js/ui/toolbar.js
  var Toolbar = class {
    /**
     * @param {import('../map/map-engine.js').MapEngine} mapEngine 
     */
    constructor(mapEngine) {
      this.mapEngine = mapEngine;
      this.initElements();
      this.bindEvents();
      this.bindStateListeners();
    }
    initElements() {
      this.btnZoomIn = document.getElementById("btn-zoom-in");
      this.btnZoomOut = document.getElementById("btn-zoom-out");
      this.btnFitScreen = document.getElementById("btn-fit-screen");
      this.btnResetView = document.getElementById("btn-reset-view");
      this.zoomPercentageDisplay = document.getElementById("zoom-percentage");
      this.btnToggleLeft = document.getElementById("btn-toggle-left-sidebar");
      this.btnToggleRight = document.getElementById("btn-toggle-right-sidebar");
      this.btnToggleTheme = document.getElementById("btn-toggle-theme");
      this.initTheme();
      this.modeButtons = document.querySelectorAll("[data-mode]");
      this.hudZoomIn = document.getElementById("hud-zoom-in");
      this.hudZoomOut = document.getElementById("hud-zoom-out");
      this.hudFitScreen = document.getElementById("hud-fit-screen");
      this.hudResetView = document.getElementById("hud-reset-view");
      this.hudCompass = document.getElementById("hud-compass");
      this.hudZoomBadge = document.getElementById("hud-zoom-badge");
    }
    bindEvents() {
      const interactions = this.mapEngine.interactions;
      const handleZoomIn = () => interactions.zoomIn();
      this.btnZoomIn?.addEventListener("click", handleZoomIn);
      this.hudZoomIn?.addEventListener("click", handleZoomIn);
      const handleZoomOut = () => interactions.zoomOut();
      this.btnZoomOut?.addEventListener("click", handleZoomOut);
      this.hudZoomOut?.addEventListener("click", handleZoomOut);
      const handleFit = () => interactions.fitToScreen(30);
      this.btnFitScreen?.addEventListener("click", handleFit);
      this.hudFitScreen?.addEventListener("click", handleFit);
      const handleReset = () => interactions.resetView();
      this.btnResetView?.addEventListener("click", handleReset);
      this.hudResetView?.addEventListener("click", handleReset);
      this.hudCompass?.addEventListener("click", handleReset);
      this.modeButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const targetMode = btn.getAttribute("data-mode");
          stateManager.setMode(targetMode);
        });
      });
      this.btnToggleLeft?.addEventListener("click", () => {
        stateManager.toggleSidebar("left");
      });
      this.btnToggleRight?.addEventListener("click", () => {
        stateManager.toggleSidebar("right");
      });
      this.btnToggleTheme?.addEventListener("click", () => {
        this.toggleTheme();
      });
    }
    initTheme() {
      const savedTheme = localStorage.getItem("netmap-theme") || "light";
      this.applyTheme(savedTheme);
    }
    applyTheme(theme) {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("netmap-theme", theme);
      if (this.btnToggleTheme) {
        const isDark = theme === "dark";
        this.btnToggleTheme.innerHTML = `<i data-lucide="${isDark ? "sun" : "moon"}" id="theme-toggle-icon" style="width: 15px; height: 15px;"></i>`;
        this.btnToggleTheme.title = isDark ? "Beralih ke Tema Botanical Cream (Terang)" : "Beralih ke Tema Forest Pine (Gelap)";
        if (window.lucide && typeof window.lucide.createIcons === "function") {
          window.lucide.createIcons();
        }
      }
    }
    toggleTheme() {
      const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      this.applyTheme(nextTheme);
    }
    bindStateListeners() {
      eventBus.on("viewport:changed", ({ scale }) => {
        const formatted = formatZoomPercentage(scale);
        if (this.zoomPercentageDisplay && this.zoomPercentageDisplay.textContent !== formatted) {
          this.zoomPercentageDisplay.textContent = formatted;
        }
        if (this.hudZoomBadge && this.hudZoomBadge.textContent !== formatted) {
          this.hudZoomBadge.textContent = formatted;
        }
      });
      eventBus.on("mode:changed", ({ mode }) => {
        this.modeButtons.forEach((btn) => {
          if (btn.getAttribute("data-mode") === mode) {
            btn.classList.add("active");
          } else {
            btn.classList.remove("active");
          }
        });
      });
      eventBus.on("ui:sidebar-toggled", ({ side, open }) => {
        const sidebarEl = document.querySelector(`.sidebar-${side}`);
        if (sidebarEl) {
          if (open) {
            sidebarEl.classList.remove("collapsed");
          } else {
            sidebarEl.classList.add("collapsed");
          }
        }
      });
    }
  };

  // js/ui/status-bar.js
  var StatusBar = class {
    constructor() {
      this.initElements();
      this.bindEvents();
      this.renderInitial();
    }
    initElements() {
      this.coordNormDisplay = document.getElementById("status-coord-normalized");
      this.coordPixelDisplay = document.getElementById("status-coord-pixel");
      this.modeDisplay = document.getElementById("status-active-mode");
      this.zoomDisplay = document.getElementById("status-zoom-level");
      this.mapSizeDisplay = document.getElementById("status-map-size");
      this.scaleBtn = document.getElementById("status-map-scale-btn");
      this.scaleText = document.getElementById("status-map-scale-text");
    }
    renderInitial() {
      const state = stateManager.getState();
      if (this.modeDisplay) {
        this.modeDisplay.textContent = state.mode.toUpperCase();
      }
      if (this.zoomDisplay) {
        this.zoomDisplay.textContent = formatZoomPercentage(state.viewport.scale);
      }
      if (this.mapSizeDisplay) {
        this.mapSizeDisplay.textContent = `${state.project.map.naturalWidth} \xD7 ${state.project.map.naturalHeight} px`;
      }
      let savedScale = 400;
      try {
        const stored = localStorage.getItem("netmap_scale_width_meters");
        if (stored && !isNaN(parseFloat(stored))) {
          savedScale = parseFloat(stored);
        }
      } catch (e) {
      }
      const natW = state.project.map.naturalWidth || 1024;
      const mPerPx = savedScale / natW;
      if (this.scaleText) {
        this.scaleText.textContent = `\u{1F4D0} Skala: ${savedScale}m (1px = ${mPerPx.toFixed(2)}m)`;
      }
    }
    bindEvents() {
      this.scaleBtn?.addEventListener("click", () => {
        eventBus.emit("modal:open-map-scale");
      });
      eventBus.on("pointer:moved", (pointer) => {
        if (pointer.isInsideMap) {
          if (this.coordNormDisplay) {
            this.coordNormDisplay.textContent = `X: ${formatDecimals(pointer.normalizedX, 4)}  Y: ${formatDecimals(pointer.normalizedY, 4)}`;
          }
          if (this.coordPixelDisplay) {
            this.coordPixelDisplay.textContent = `(${pointer.imageX}px, ${pointer.imageY}px)`;
          }
        } else {
          if (this.coordNormDisplay) {
            this.coordNormDisplay.textContent = "X: --  Y: --";
          }
          if (this.coordPixelDisplay) {
            this.coordPixelDisplay.textContent = "(di luar denah)";
          }
        }
      });
      eventBus.on("map:scale-calibrated", ({ mapWidthMeters, metersPerPixel }) => {
        if (this.scaleText) {
          this.scaleText.textContent = `\u{1F4D0} Skala: ${mapWidthMeters}m (1px = ${metersPerPixel.toFixed(2)}m)`;
        }
      });
      eventBus.on("viewport:changed", ({ scale }) => {
        const formatted = formatZoomPercentage(scale);
        if (this.zoomDisplay && this.zoomDisplay.textContent !== formatted) {
          this.zoomDisplay.textContent = formatted;
        }
      });
      eventBus.on("mode:changed", ({ mode }) => {
        if (this.modeDisplay) {
          this.modeDisplay.textContent = mode.toUpperCase();
        }
      });
      eventBus.on("map:loaded", ({ width, height }) => {
        if (this.mapSizeDisplay) {
          this.mapSizeDisplay.textContent = `${width} \xD7 ${height} px`;
        }
        let savedScale = 400;
        try {
          const stored = localStorage.getItem("netmap_scale_width_meters");
          if (stored && !isNaN(parseFloat(stored))) {
            savedScale = parseFloat(stored);
          }
        } catch (e) {
        }
        if (this.scaleText && width > 0) {
          const mPerPx = savedScale / width;
          this.scaleText.textContent = `\u{1F4D0} Skala: ${savedScale}m (1px = ${mPerPx.toFixed(2)}m)`;
        }
      });
    }
  };

  // js/devices/device-schema.js
  var IPv4_REGEX = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  var MAC_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  function validateIp(ip) {
    if (!ip || ip.trim() === "") return true;
    return IPv4_REGEX.test(ip.trim());
  }
  function validateMac(mac) {
    if (!mac || mac.trim() === "") return true;
    return MAC_REGEX.test(mac.trim());
  }
  function validateVlan(vlan) {
    if (vlan === "" || vlan === null || vlan === void 0) return true;
    const num = parseInt(vlan, 10);
    return !isNaN(num) && num >= 1 && num <= 4094;
  }
  var DeviceSchema = {
    /**
     * Factory function to create a validated device object with default values
     * @param {Object} params 
     * @returns {Object}
     */
    create(params = {}) {
      const id = params.id || generateId("dev");
      return {
        id,
        name: params.name || "New Device",
        type: params.type || "router",
        // router, switch, ap, server, cctv, etc.
        category: params.category || "core",
        // core, distribution, infrastructure, end-device
        brand: params.brand || "",
        model: params.model || "",
        customIcon: params.customIcon || "",
        customImage: params.customImage || "",
        markerStyle: params.markerStyle || "rounded",
        wirelessCoverage: params.wirelessCoverage ? {
          enabled: Boolean(params.wirelessCoverage.enabled),
          radiusMeters: typeof params.wirelessCoverage.radiusMeters === "number" ? params.wirelessCoverage.radiusMeters : 25,
          color: params.wirelessCoverage.color || "#76c457",
          opacity: typeof params.wirelessCoverage.opacity === "number" ? params.wirelessCoverage.opacity : 0.18,
          hatch: params.wirelessCoverage.hatch !== void 0 ? Boolean(params.wirelessCoverage.hatch) : true,
          band: params.wirelessCoverage.band || "dual-band",
          showLabel: params.wirelessCoverage.showLabel !== void 0 ? Boolean(params.wirelessCoverage.showLabel) : true
        } : params.type === "access-point" || params.type === "wireless-bridge" || params.type === "network-pole" ? {
          enabled: true,
          radiusMeters: params.type === "wireless-bridge" ? 80 : params.type === "access-point" ? 25 : 30,
          color: params.type === "wireless-bridge" ? "#06b6d4" : "#76c457",
          opacity: 0.18,
          hatch: true,
          band: params.type === "wireless-bridge" ? "ptp" : "dual-band",
          showLabel: true
        } : null,
        position: {
          x: typeof params.position?.x === "number" ? params.position.x : 0.5,
          y: typeof params.position?.y === "number" ? params.position.y : 0.5
        },
        network: {
          ip: params.network?.ip || params.ip || "",
          mac: params.network?.mac || params.mac || "",
          subnet: params.network?.subnet || params.subnet || "255.255.255.0",
          vlan: params.network?.vlan !== void 0 ? Number(params.network.vlan) : params.vlan !== void 0 ? Number(params.vlan) : 1,
          hostname: params.network?.hostname || params.hostname || ""
        },
        status: params.status || "unknown",
        // online, offline, warning, unknown
        location: params.location || "",
        firmware: params.firmware || "",
        installedAt: params.installedAt || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        notes: params.notes || "",
        createdAt: params.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    },
    /**
     * Validate a device object
     * @param {Object} device 
     * @returns {{isValid: boolean, errors: string[]}}
     */
    validate(device) {
      const errors = [];
      if (!device.id) errors.push("Device ID is required");
      if (!device.name || device.name.trim() === "") errors.push("Device name is required");
      if (!device.position || typeof device.position.x !== "number" || typeof device.position.y !== "number") {
        errors.push("Valid normalized coordinates (position.x and position.y) are required");
      }
      if (device.position && (device.position.x < 0 || device.position.x > 1 || device.position.y < 0 || device.position.y > 1)) {
        errors.push("Normalized coordinates must be within [0, 1]");
      }
      if (device.network?.ip && !validateIp(device.network.ip)) {
        errors.push("Invalid IPv4 address format");
      }
      if (device.network?.mac && !validateMac(device.network.mac)) {
        errors.push("Invalid MAC address format (e.g., 00:1A:2B:3C:4D:5E)");
      }
      if (device.network?.vlan && !validateVlan(device.network.vlan)) {
        errors.push("VLAN ID must be an integer between 1 and 4094");
      }
      return {
        isValid: errors.length === 0,
        errors
      };
    }
  };

  // js/devices/device-library.js
  var DEVICE_CATEGORIES = {
    core: {
      id: "core",
      name: "Core Network",
      color: "#2a7c13",
      // Deep Forest Green (Palette #2a7c13)
      badgeBg: "rgba(42, 124, 19, 0.15)",
      icon: "cpu"
    },
    distribution: {
      id: "distribution",
      name: "Network Distribution",
      color: "#76c457",
      // Leaf Meadow Green (Palette #76c457)
      badgeBg: "rgba(118, 196, 87, 0.18)",
      icon: "network"
    },
    infrastructure: {
      id: "infrastructure",
      name: "Infrastructure & Cabling",
      color: "#d97706",
      // Warm Amber (Complements Sand #fbe6c2)
      badgeBg: "rgba(217, 119, 6, 0.15)",
      icon: "box"
    },
    endDevice: {
      id: "endDevice",
      name: "End Devices",
      color: "#059669",
      // Emerald Green
      badgeBg: "rgba(5, 150, 105, 0.15)",
      icon: "monitor"
    }
  };
  var DEVICE_STATUSES = {
    online: {
      id: "online",
      name: "Online",
      color: "#22c55e",
      // Bright Green
      bg: "rgba(34, 197, 94, 0.15)"
    },
    offline: {
      id: "offline",
      name: "Offline",
      color: "#ef4444",
      // Red
      bg: "rgba(239, 68, 68, 0.15)"
    },
    warning: {
      id: "warning",
      name: "Warning",
      color: "#f59e0b",
      // Amber / Yellow
      bg: "rgba(245, 158, 11, 0.15)"
    },
    unknown: {
      id: "unknown",
      name: "Unknown",
      color: "#64748b",
      // Slate Gray
      bg: "rgba(100, 116, 139, 0.15)"
    }
  };
  var STANDARD_DEVICE_CATALOG = [
    // --- Core Network ---
    {
      type: "router",
      category: "core",
      name: "Router",
      lucideIcon: "router",
      defaultBrand: "MikroTik",
      defaultModel: "RB4011",
      description: "Routing antar segmen jaringan dan NAT gateway"
    },
    {
      type: "main-router",
      category: "core",
      name: "Main Router / CCR",
      lucideIcon: "cpu",
      defaultBrand: "MikroTik",
      defaultModel: "CCR2004",
      description: "Core router gateway utama kampus/gedung"
    },
    {
      type: "core-switch",
      category: "core",
      name: "Core Switch",
      lucideIcon: "server",
      defaultBrand: "Cisco",
      defaultModel: "Catalyst 3850",
      description: "Switch tulang punggung (backbone) berkecepatan tinggi"
    },
    {
      type: "dist-switch",
      category: "core",
      name: "Distribution Switch",
      lucideIcon: "network",
      defaultBrand: "Cisco",
      defaultModel: "Catalyst 2960",
      description: "Switch agregasi distribusi antargedung"
    },
    {
      type: "firewall",
      category: "core",
      name: "Firewall",
      lucideIcon: "shield",
      defaultBrand: "Fortinet",
      defaultModel: "FortiGate 60F",
      description: "Perangkat keamanan jaringan & inspeksi paket"
    },
    {
      type: "gateway",
      category: "core",
      name: "Internet Gateway",
      lucideIcon: "globe",
      defaultBrand: "MikroTik",
      defaultModel: "RB750Gr3",
      description: "Perangkat gateway koneksi ISP"
    },
    // --- Network Distribution ---
    {
      type: "managed-switch",
      category: "distribution",
      name: "Managed Switch",
      lucideIcon: "network",
      defaultBrand: "Ruijie",
      defaultModel: "RG-NBS3100",
      description: "Switch layer-2/3 dengan konfigurasi VLAN"
    },
    {
      type: "poe-switch",
      category: "distribution",
      name: "PoE Switch",
      lucideIcon: "zap",
      defaultBrand: "Ruijie",
      defaultModel: "RG-ES218GC-P",
      description: "Switch penyuplai daya ke AP dan IP Camera"
    },
    {
      type: "access-point",
      category: "distribution",
      name: "Access Point (Wi-Fi)",
      lucideIcon: "wifi",
      defaultBrand: "Ubiquiti UniFi",
      defaultModel: "U6-Pro",
      description: "Pemancar sinyal nirkabel pengguna"
    },
    {
      type: "wireless-bridge",
      category: "distribution",
      name: "Wireless Bridge (PtP)",
      lucideIcon: "radio",
      defaultBrand: "Ubiquiti",
      defaultModel: "AirMax NanoBeam",
      description: "Link nirkabel antar gedung tanpa kabel"
    },
    {
      type: "unmanaged-switch",
      category: "distribution",
      name: "Unmanaged Switch",
      lucideIcon: "server",
      defaultBrand: "TP-Link",
      defaultModel: "TL-SG1016",
      description: "Switch distribusi sederhana tanpa VLAN"
    },
    // --- Infrastructure & Cabling ---
    {
      type: "network-rack",
      category: "infrastructure",
      name: "Network Rack",
      lucideIcon: "layers",
      defaultBrand: "Indorack",
      defaultModel: 'Rack 19" 15U',
      description: "Lemari kabinet perangkat jaringan"
    },
    {
      type: "patch-panel",
      category: "infrastructure",
      name: "Patch Panel",
      lucideIcon: "align-justify",
      defaultBrand: "AMP/CommScope",
      defaultModel: "24-Port Cat6",
      description: "Panel terminasi kabel tembaga RJ45"
    },
    {
      type: "odp",
      category: "infrastructure",
      name: "ODP (Optic Dist. Point)",
      lucideIcon: "box",
      defaultBrand: "Huawei",
      defaultModel: "ODP 16 Port",
      description: "Titik terminasi distribusi fiber optik luar"
    },
    {
      type: "fo-terminal",
      category: "infrastructure",
      name: "OTB (Fiber Terminal)",
      lucideIcon: "git-commit",
      defaultBrand: "Panduit",
      defaultModel: "Rack Mount OTB 24C",
      description: "Kotak terminasi kabel fiber optik gedung"
    },
    {
      type: "network-pole",
      category: "infrastructure",
      name: "Network Pole / Tiang",
      lucideIcon: "radio-tower",
      defaultBrand: "Custom",
      defaultModel: "Tiang Besi 7m",
      description: "Tiang jalur kabel udara atau radio link"
    },
    // --- End Devices ---
    {
      type: "cctv",
      category: "endDevice",
      name: "IP Camera (CCTV)",
      lucideIcon: "camera",
      defaultBrand: "Hikvision",
      defaultModel: "DS-2CD1023G0E",
      description: "Kamera pengawas keamanan jaringan"
    },
    {
      type: "nvr",
      category: "endDevice",
      name: "NVR Server",
      lucideIcon: "hard-drive",
      defaultBrand: "Hikvision",
      defaultModel: "DS-7616NI-Q2",
      description: "Perekam rekaman CCTV berbasis jaringan"
    },
    {
      type: "server",
      category: "endDevice",
      name: "Physical Server",
      lucideIcon: "server",
      defaultBrand: "Dell",
      defaultModel: "PowerEdge R440",
      description: "Server aplikasi lokal atau basis data"
    },
    {
      type: "computer",
      category: "endDevice",
      name: "Computer / PC",
      lucideIcon: "monitor",
      defaultBrand: "Lenovo",
      defaultModel: "ThinkCentre M70q",
      description: "Komputer pengguna / workstation teknisi"
    },
    {
      type: "printer",
      category: "endDevice",
      name: "Network Printer",
      lucideIcon: "printer",
      defaultBrand: "Epson",
      defaultModel: "WorkForce Pro",
      description: "Printer jaringan terpusat"
    },
    {
      type: "ip-phone",
      category: "endDevice",
      name: "VoIP / IP Phone",
      lucideIcon: "phone-call",
      defaultBrand: "Grandstream",
      defaultModel: "GRP2601P",
      description: "Telepon jaringan berbasis protokol SIP"
    }
  ];
  var MIKROTIK_CATALOG = [
    {
      type: "mikrotik-ccr2116",
      brandGroup: "MikroTik",
      badgeCode: "CCR",
      category: "core",
      name: "MikroTik CCR2116",
      lucideIcon: "cpu",
      defaultBrand: "MikroTik",
      defaultModel: "CCR2116-12G-4S+",
      description: "Core Router 16-Core ARM, 12x GbE + 4x 10G SFP+"
    },
    {
      type: "mikrotik-ccr2004",
      brandGroup: "MikroTik",
      badgeCode: "CCR",
      category: "core",
      name: "MikroTik CCR2004",
      lucideIcon: "cpu",
      defaultBrand: "MikroTik",
      defaultModel: "CCR2004-16G-2S+",
      description: "Core / Edge Router 16x GbE + 2x 10G SFP+"
    },
    {
      type: "mikrotik-rb5009",
      brandGroup: "MikroTik",
      badgeCode: "RB",
      category: "core",
      name: "MikroTik RB5009",
      lucideIcon: "router",
      defaultBrand: "MikroTik",
      defaultModel: "RB5009UG+S+IN",
      description: "Heavy Duty Router 7x GbE + 2.5G + 10G SFP+"
    },
    {
      type: "mikrotik-rb4011",
      brandGroup: "MikroTik",
      badgeCode: "RB",
      category: "core",
      name: "MikroTik RB4011",
      lucideIcon: "router",
      defaultBrand: "MikroTik",
      defaultModel: "RB4011iGS+RM",
      description: "Rackmount Router 10x GbE + 10G SFP+"
    },
    {
      type: "mikrotik-l009",
      brandGroup: "MikroTik",
      badgeCode: "L009",
      category: "core",
      name: "MikroTik L009",
      lucideIcon: "router",
      defaultBrand: "MikroTik",
      defaultModel: "L009UiGS-RM",
      description: "Router 8x GbE + 2.5G SFP Port (PoE Out Port 8)"
    },
    {
      type: "mikrotik-hex",
      brandGroup: "MikroTik",
      badgeCode: "hEX",
      category: "core",
      name: "MikroTik hEX",
      lucideIcon: "router",
      defaultBrand: "MikroTik",
      defaultModel: "RB750Gr3",
      description: "Router Gigabit 5-Port kompak untuk cabang / gedung"
    },
    {
      type: "mikrotik-crs317",
      brandGroup: "MikroTik",
      badgeCode: "CRS",
      category: "core",
      name: "MikroTik CRS317",
      lucideIcon: "server",
      defaultBrand: "MikroTik",
      defaultModel: "CRS317-1G-16S+RM",
      description: "Core Fiber Switch 16x 10G SFP+ & 1x GbE Mgmt"
    },
    {
      type: "mikrotik-crs326",
      brandGroup: "MikroTik",
      badgeCode: "CRS",
      category: "distribution",
      name: "MikroTik CRS326",
      lucideIcon: "network",
      defaultBrand: "MikroTik",
      defaultModel: "CRS326-24G-2S+RM",
      description: "Managed Switch 24x GbE + 2x 10G SFP+ Uplink"
    },
    {
      type: "mikrotik-crs328",
      brandGroup: "MikroTik",
      badgeCode: "PoE",
      category: "distribution",
      name: "MikroTik CRS328 PoE",
      lucideIcon: "zap",
      defaultBrand: "MikroTik",
      defaultModel: "CRS328-24P-4S+RM",
      description: "PoE+ Switch 24x GbE PoE Out + 4x 10G SFP+"
    },
    {
      type: "mikrotik-crs310",
      brandGroup: "MikroTik",
      badgeCode: "CRS",
      category: "distribution",
      name: "MikroTik CRS310",
      lucideIcon: "network",
      defaultBrand: "MikroTik",
      defaultModel: "CRS310-8G+2S+IN",
      description: "Switch 8x 2.5G RJ45 + 2x 10G SFP+"
    },
    {
      type: "mikrotik-cap-ax",
      brandGroup: "MikroTik",
      badgeCode: "cAP",
      category: "distribution",
      name: "MikroTik cAP ax",
      lucideIcon: "wifi",
      defaultBrand: "MikroTik",
      defaultModel: "cAPGi-5HaxD2HaxD",
      description: "Ceiling Access Point Wi-Fi 6 Dual-Band",
      defaultWirelessCoverage: {
        enabled: true,
        radiusMeters: 30,
        color: "#76c457",
        opacity: 0.18,
        hatch: true,
        band: "dual-band",
        showLabel: true
      }
    },
    {
      type: "mikrotik-hap-ax2",
      brandGroup: "MikroTik",
      badgeCode: "hAP",
      category: "distribution",
      name: "MikroTik hAP ax\xB2",
      lucideIcon: "wifi",
      defaultBrand: "MikroTik",
      defaultModel: "C52iG-5HaxD2HaxD-TC",
      description: "Indoor Wi-Fi 6 Router / Access Point 5x GbE",
      defaultWirelessCoverage: {
        enabled: true,
        radiusMeters: 25,
        color: "#76c457",
        opacity: 0.18,
        hatch: true,
        band: "dual-band",
        showLabel: true
      }
    },
    {
      type: "mikrotik-lhg5",
      brandGroup: "MikroTik",
      badgeCode: "LHG",
      category: "distribution",
      name: "MikroTik LHG 5 ac",
      lucideIcon: "radio",
      defaultBrand: "MikroTik",
      defaultModel: "RBLHGG-5acD",
      description: "Radio Dish Grid PtP Jarak Jauh 5GHz 24.5dBi",
      defaultWirelessCoverage: {
        enabled: true,
        radiusMeters: 120,
        color: "#06b6d4",
        opacity: 0.16,
        hatch: true,
        band: "ptp",
        showLabel: true
      }
    },
    {
      type: "mikrotik-sxtsq",
      brandGroup: "MikroTik",
      badgeCode: "SXT",
      category: "distribution",
      name: "MikroTik SXTsq 5 ac",
      lucideIcon: "radio",
      defaultBrand: "MikroTik",
      defaultModel: "RBSXTsqG-5acD",
      description: "Outdoor CPE / Wireless PtP Bridge 5GHz 16dBi",
      defaultWirelessCoverage: {
        enabled: true,
        radiusMeters: 80,
        color: "#06b6d4",
        opacity: 0.16,
        hatch: true,
        band: "ptp",
        showLabel: true
      }
    },
    {
      type: "mikrotik-mantbox",
      brandGroup: "MikroTik",
      badgeCode: "mANT",
      category: "distribution",
      name: "MikroTik mANTBox",
      lucideIcon: "radio-tower",
      defaultBrand: "MikroTik",
      defaultModel: "RB921GS-5HPacD-15S",
      description: "Base Station Sector AP Outdoor 120\xB0 5GHz",
      defaultWirelessCoverage: {
        enabled: true,
        radiusMeters: 100,
        color: "#0ea5e9",
        opacity: 0.16,
        hatch: true,
        band: "ptp",
        showLabel: true
      }
    }
  ];
  var RUIJIE_CATALOG = [
    {
      type: "ruijie-eg210g",
      brandGroup: "Ruijie",
      badgeCode: "EG",
      category: "core",
      name: "Ruijie RG-EG210G-P",
      lucideIcon: "router",
      defaultBrand: "Ruijie Reyee",
      defaultModel: "RG-EG210G-P",
      description: "Cloud Managed PoE Router 10x GbE (8x PoE+) Dual-WAN"
    },
    {
      type: "ruijie-eg310gh",
      brandGroup: "Ruijie",
      badgeCode: "EG",
      category: "core",
      name: "Ruijie RG-EG310GH",
      lucideIcon: "cpu",
      defaultBrand: "Ruijie Reyee",
      defaultModel: "RG-EG310GH-P-E",
      description: "High-Perf Cloud Gateway 10x GbE + 2x SFP Multi-WAN"
    },
    {
      type: "ruijie-nbr6210",
      brandGroup: "Ruijie",
      badgeCode: "NBR",
      category: "core",
      name: "Ruijie RG-NBR6210",
      lucideIcon: "shield",
      defaultBrand: "Ruijie",
      defaultModel: "RG-NBR6210-E",
      description: "Enterprise Gateway Router & Firewall Multi-WAN"
    },
    {
      type: "ruijie-s5750",
      brandGroup: "Ruijie",
      badgeCode: "L3",
      category: "core",
      name: "Ruijie RG-S5750V2",
      lucideIcon: "server",
      defaultBrand: "Ruijie",
      defaultModel: "RG-S5750V2-28GT4XS",
      description: "Core L3 Switch 24x GbE + 4x 10G SFP+ Backbone"
    },
    {
      type: "ruijie-nbs5200",
      brandGroup: "Ruijie",
      badgeCode: "NBS",
      category: "distribution",
      name: "Ruijie NBS5200-24GT",
      lucideIcon: "network",
      defaultBrand: "Ruijie Reyee",
      defaultModel: "RG-NBS5200-24GT4XS",
      description: "L2+ Managed Switch 24x GbE + 4x 10G SFP+ Uplink"
    },
    {
      type: "ruijie-nbs3100",
      brandGroup: "Ruijie",
      badgeCode: "NBS",
      category: "distribution",
      name: "Ruijie NBS3100-24GT",
      lucideIcon: "network",
      defaultBrand: "Ruijie Reyee",
      defaultModel: "RG-NBS3100-24GT4SFP",
      description: "Cloud Managed Switch 24x GbE + 4x SFP"
    },
    {
      type: "ruijie-nbs3100-poe",
      brandGroup: "Ruijie",
      badgeCode: "PoE",
      category: "distribution",
      name: "Ruijie NBS3100 PoE+",
      lucideIcon: "zap",
      defaultBrand: "Ruijie Reyee",
      defaultModel: "RG-NBS3100-24GT4SFP-P",
      description: "Cloud PoE+ Switch 24x PoE+ + 4x SFP (370W)"
    },
    {
      type: "ruijie-es218gc",
      brandGroup: "Ruijie",
      badgeCode: "ES",
      category: "distribution",
      name: "Ruijie ES218GC-P",
      lucideIcon: "zap",
      defaultBrand: "Ruijie Reyee",
      defaultModel: "RG-ES218GC-P",
      description: "Smart Cloud PoE+ Switch 16x PoE+ + 2x SFP"
    },
    {
      type: "ruijie-es209gc",
      brandGroup: "Ruijie",
      badgeCode: "ES",
      category: "distribution",
      name: "Ruijie ES209GC-P",
      lucideIcon: "zap",
      defaultBrand: "Ruijie Reyee",
      defaultModel: "RG-ES209GC-P",
      description: "Smart Cloud PoE+ Switch 8x PoE+ + 1x GbE Uplink"
    },
    {
      type: "ruijie-rap2260",
      brandGroup: "Ruijie",
      badgeCode: "RAP",
      category: "distribution",
      name: "Ruijie RAP2260(G)",
      lucideIcon: "wifi",
      defaultBrand: "Ruijie Reyee",
      defaultModel: "RG-RAP2260(G)",
      description: "Ceiling Access Point Wi-Fi 6 AX1800 Dual-Band",
      defaultWirelessCoverage: {
        enabled: true,
        radiusMeters: 30,
        color: "#76c457",
        opacity: 0.18,
        hatch: true,
        band: "dual-band",
        showLabel: true
      }
    },
    {
      type: "ruijie-rap2200",
      brandGroup: "Ruijie",
      badgeCode: "RAP",
      category: "distribution",
      name: "Ruijie RAP2200(F)",
      lucideIcon: "wifi",
      defaultBrand: "Ruijie Reyee",
      defaultModel: "RG-RAP2200(F)",
      description: "Ceiling Access Point AC1300 Dual-Band Wi-Fi 5",
      defaultWirelessCoverage: {
        enabled: true,
        radiusMeters: 25,
        color: "#76c457",
        opacity: 0.18,
        hatch: true,
        band: "dual-band",
        showLabel: true
      }
    },
    {
      type: "ruijie-rap1200",
      brandGroup: "Ruijie",
      badgeCode: "Wall",
      category: "distribution",
      name: "Ruijie RAP1200(F)",
      lucideIcon: "wifi",
      defaultBrand: "Ruijie Reyee",
      defaultModel: "RG-RAP1200(F)",
      description: "In-Wall Access Point AC1300 untuk Ruangan / Hotel",
      defaultWirelessCoverage: {
        enabled: true,
        radiusMeters: 15,
        color: "#76c457",
        opacity: 0.18,
        hatch: true,
        band: "dual-band",
        showLabel: true
      }
    },
    {
      type: "ruijie-rap6260",
      brandGroup: "Ruijie",
      badgeCode: "Out",
      category: "distribution",
      name: "Ruijie RAP6260(G)",
      lucideIcon: "wifi",
      defaultBrand: "Ruijie Reyee",
      defaultModel: "RG-RAP6260(G)",
      description: "Outdoor Omni Access Point Wi-Fi 6 IP68",
      defaultWirelessCoverage: {
        enabled: true,
        radiusMeters: 60,
        color: "#76c457",
        opacity: 0.16,
        hatch: true,
        band: "outdoor",
        showLabel: true
      }
    },
    {
      type: "ruijie-est350",
      brandGroup: "Ruijie",
      badgeCode: "EST",
      category: "distribution",
      name: "Ruijie RG-EST350 V2",
      lucideIcon: "radio",
      defaultBrand: "Ruijie Reyee",
      defaultModel: "RG-EST350 V2",
      description: "Wireless Bridge PtP 5GHz Jarak Jauh hingga 5KM",
      defaultWirelessCoverage: {
        enabled: true,
        radiusMeters: 120,
        color: "#06b6d4",
        opacity: 0.16,
        hatch: true,
        band: "ptp",
        showLabel: true
      }
    }
  ];
  var TPLINK_CATALOG = [
    {
      type: "tplink-ls1005g",
      brandGroup: "TP-Link",
      badgeCode: "5P",
      category: "distribution",
      name: "TP-Link LS1005G Hub",
      lucideIcon: "server",
      defaultBrand: "TP-Link",
      defaultModel: "LS1005G (5-Port GbE)",
      description: "Desktop Switch / Hub Gigabit 5-Port Plug & Play"
    },
    {
      type: "tplink-sg1008d",
      brandGroup: "TP-Link",
      badgeCode: "8P",
      category: "distribution",
      name: "TP-Link TL-SG1008D",
      lucideIcon: "server",
      defaultBrand: "TP-Link",
      defaultModel: "TL-SG1008D (8-Port GbE)",
      description: "Desktop Switch / Hub Gigabit 8-Port Unmanaged"
    },
    {
      type: "tplink-sg108e",
      brandGroup: "TP-Link",
      badgeCode: "8E",
      category: "distribution",
      name: "TP-Link TL-SG108E",
      lucideIcon: "network",
      defaultBrand: "TP-Link",
      defaultModel: "TL-SG108E Easy Smart",
      description: "Easy Smart Switch 8-Port Gigabit (VLAN & QoS)"
    },
    {
      type: "tplink-sg108pe",
      brandGroup: "TP-Link",
      badgeCode: "PoE",
      category: "distribution",
      name: "TP-Link TL-SG108PE",
      lucideIcon: "zap",
      defaultBrand: "TP-Link",
      defaultModel: "TL-SG108PE (4x PoE+)",
      description: "Easy Smart 8-Port Gigabit Switch dengan 4 Port PoE+"
    },
    {
      type: "tplink-sg1016d",
      brandGroup: "TP-Link",
      badgeCode: "16P",
      category: "distribution",
      name: "TP-Link TL-SG1016D",
      lucideIcon: "server",
      defaultBrand: "TP-Link",
      defaultModel: "TL-SG1016D (16-Port)",
      description: "Unmanaged 16-Port Gigabit Rack/Desktop Switch"
    },
    {
      type: "tplink-sg1024d",
      brandGroup: "TP-Link",
      badgeCode: "24P",
      category: "distribution",
      name: "TP-Link TL-SG1024D",
      lucideIcon: "server",
      defaultBrand: "TP-Link",
      defaultModel: "TL-SG1024D (24-Port)",
      description: "Unmanaged 24-Port Gigabit Rackmount Switch"
    },
    {
      type: "tplink-sg1218mp",
      brandGroup: "TP-Link",
      badgeCode: "PoE",
      category: "distribution",
      name: "TP-Link TL-SG1218MP",
      lucideIcon: "zap",
      defaultBrand: "TP-Link",
      defaultModel: "TL-SG1218MP (16 PoE+ 2SFP)",
      description: "Switch PoE+ 16-Port + 2 Combo SFP (250W Budget)"
    },
    {
      type: "tplink-sg2210mp",
      brandGroup: "TP-Link",
      badgeCode: "Omada",
      category: "distribution",
      name: "TP-Link SG2210MP",
      lucideIcon: "zap",
      defaultBrand: "TP-Link Omada",
      defaultModel: "TL-SG2210MP (8 PoE+ 2SFP)",
      description: "Omada Smart PoE+ Switch 8x GbE + 2x SFP (150W)"
    },
    {
      type: "tplink-sg2428p",
      brandGroup: "TP-Link",
      badgeCode: "Omada",
      category: "distribution",
      name: "TP-Link SG2428P",
      lucideIcon: "zap",
      defaultBrand: "TP-Link Omada",
      defaultModel: "TL-SG2428P (24 PoE+ 4SFP)",
      description: "Omada JetStream 24x GbE PoE+ + 4x SFP Managed Switch"
    },
    {
      type: "tplink-sg3428x",
      brandGroup: "TP-Link",
      badgeCode: "10G",
      category: "core",
      name: "TP-Link SG3428X",
      lucideIcon: "network",
      defaultBrand: "TP-Link Omada",
      defaultModel: "TL-SG3428X (24G + 4x10G)",
      description: "JetStream L2+ Switch 24x GbE + 4x 10G SFP+ Uplink"
    },
    {
      type: "tplink-sx3016f",
      brandGroup: "TP-Link",
      badgeCode: "SFP+",
      category: "core",
      name: "TP-Link SX3016F",
      lucideIcon: "server",
      defaultBrand: "TP-Link Omada",
      defaultModel: "TL-SX3016F (16x 10G SFP+)",
      description: "Core Fiber L2+ Switch 16-Port Full 10G SFP+"
    }
  ];
  var DEVICE_CATALOG = [
    ...STANDARD_DEVICE_CATALOG,
    ...MIKROTIK_CATALOG,
    ...RUIJIE_CATALOG,
    ...TPLINK_CATALOG
  ];
  function getDeviceDefByType(type) {
    return DEVICE_CATALOG.find((d) => d.type === type) || null;
  }

  // js/devices/device-icon-factory.js
  var iconImageCache = /* @__PURE__ */ new Map();
  var customImageCache = /* @__PURE__ */ new Map();
  var NETWORK_ICON_DEFS = {
    "router": {
      id: "router",
      name: "Router",
      category: "core",
      svg: (color = "#76c457", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <circle cx="16" cy="16" r="13" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M16 6v7m0 0l-2.5-2.5m2.5 2.5l2.5-2.5" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M16 26v-7m0 0l-2.5 2.5m2.5-2.5l2.5 2.5" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M6 16h7m0 0l-2.5-2.5m2.5 2.5l-2.5 2.5" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M26 16h-7m0 0l2.5-2.5m-2.5 2.5l2.5 2.5" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `
    },
    "main-router": {
      id: "main-router",
      name: "Core Router / CCR",
      category: "core",
      svg: (color = "#2a7c13", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="3" y="3" width="26" height="26" rx="6" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <circle cx="16" cy="16" r="7.5" stroke="${color}" stroke-width="1.8"/>
        <path d="M16 5v4M16 23v4M5 16h4M23 16h4" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M13 16l3-3 3 3M19 16l-3 3-3-3" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `
    },
    "switch": {
      id: "switch",
      name: "Switch",
      category: "distribution",
      svg: (color = "#76c457", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="3" y="6" width="26" height="20" rx="4" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M8 12h16m0 0l-3.5-3m3.5 3l-3.5 3" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M24 20H8m0 0l3.5-3m-3.5 3l3.5 3" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `
    },
    "core-switch": {
      id: "core-switch",
      name: "Core / L3 Switch",
      category: "core",
      svg: (color = "#2a7c13", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="3" y="5" width="26" height="22" rx="4" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M7 11h7m0 0l-2.5-2.5m2.5 2.5l-2.5 2.5" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M25 11h-7m0 0l2.5-2.5m-2.5 2.5l2.5 2.5" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M7 21h7m0 0l-2.5-2.5m2.5 2.5l-2.5 2.5" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M25 21h-7m0 0l2.5-2.5m-2.5 2.5l2.5 2.5" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>
      </svg>
    `
    },
    "poe-switch": {
      id: "poe-switch",
      name: "PoE Switch",
      category: "distribution",
      svg: (color = "#76c457", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="3" y="6" width="26" height="20" rx="4" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M6 12h9M6 20h9" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M22 8l-5 8h4.5l-4 8" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="${color}"/>
      </svg>
    `
    },
    "access-point": {
      id: "access-point",
      name: "Wi-Fi Access Point",
      category: "distribution",
      svg: (color = "#76c457", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <circle cx="16" cy="24" r="2.5" fill="${color}"/>
        <path d="M10.5 18.5a7.8 7.8 0 0 1 11 0" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M6.5 14a13.5 13.5 0 0 1 19 0" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M2.5 9.5a19 19 0 0 1 27 0" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>
      </svg>
    `
    },
    "wireless-bridge": {
      id: "wireless-bridge",
      name: "Wireless PtP Bridge",
      category: "distribution",
      svg: (color = "#76c457", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <path d="M16 4v11m-6 13l6-13 6 13m-9-6h6" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="16" cy="4" r="2" fill="${color}"/>
        <path d="M10 7a8 8 0 0 1 12 0" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    `
    },
    "firewall": {
      id: "firewall",
      name: "Firewall",
      category: "core",
      svg: (color = "#d97706", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="4" y="6" width="24" height="20" rx="3" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M4 12h24M4 18h24M12 6v6M20 6v6M8 12v6M16 12v6M24 12v6M12 18v8M20 18v8" stroke="${color}" stroke-width="1.6"/>
      </svg>
    `
    },
    "gateway": {
      id: "gateway",
      name: "Internet Gateway",
      category: "core",
      svg: (color = "#2a7c13", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <circle cx="16" cy="16" r="12" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M4 16h24M16 4a15 15 0 0 1 0 24M16 4a15 15 0 0 0 0 24" stroke="${color}" stroke-width="1.8"/>
      </svg>
    `
    },
    "server": {
      id: "server",
      name: "Physical Server",
      category: "endDevice",
      svg: (color = "#059669", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="4" y="5" width="24" height="9" rx="2" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <rect x="4" y="18" width="24" height="9" rx="2" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <circle cx="8" cy="9.5" r="1.5" fill="${color}"/>
        <circle cx="13" cy="9.5" r="1.5" fill="${color}"/>
        <path d="M20 9.5h4" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <circle cx="8" cy="22.5" r="1.5" fill="${color}"/>
        <circle cx="13" cy="22.5" r="1.5" fill="${color}"/>
        <path d="M20 22.5h4" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `
    },
    "cctv": {
      id: "cctv",
      name: "IP Camera (CCTV)",
      category: "endDevice",
      svg: (color = "#059669", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <path d="M5 8h9l12 6-4 8-12-6z" stroke="${color}" stroke-width="2" stroke-linejoin="round" fill="${bg}"/>
        <circle cx="21" cy="17" r="2.5" fill="${color}"/>
        <path d="M9 10v10m-3 0h6m-3 0v4m-3 0h6" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `
    },
    "computer": {
      id: "computer",
      name: "PC / Komputer",
      category: "endDevice",
      svg: (color = "#059669", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="3" y="5" width="26" height="17" rx="3" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M16 22v5M10 27h12" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <circle cx="16" cy="19.5" r="1" fill="${color}"/>
      </svg>
    `
    },
    "printer": {
      id: "printer",
      name: "Network Printer",
      category: "endDevice",
      svg: (color = "#059669", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <path d="M8 9V4h16v5" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <rect x="4" y="9" width="24" height="13" rx="3" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M8 18h16v10H8z" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <circle cx="22" cy="13.5" r="1.5" fill="${color}"/>
      </svg>
    `
    },
    "ip-phone": {
      id: "ip-phone",
      name: "VoIP Phone",
      category: "endDevice",
      svg: (color = "#059669", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="6" y="6" width="21" height="21" rx="3" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M8 4a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v25a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <rect x="16" y="9" width="8" height="6" rx="1" stroke="${color}" stroke-width="1.5"/>
        <circle cx="17.5" cy="18" r="1" fill="${color}"/>
        <circle cx="20.5" cy="18" r="1" fill="${color}"/>
        <circle cx="17.5" cy="22" r="1" fill="${color}"/>
        <circle cx="20.5" cy="22" r="1" fill="${color}"/>
      </svg>
    `
    },
    "network-rack": {
      id: "network-rack",
      name: 'Network Rack 19"',
      category: "infrastructure",
      svg: (color = "#d97706", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="6" y="3" width="20" height="26" rx="2" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M6 9h20M6 15h20M6 21h20M10 3v26M22 3v26" stroke="${color}" stroke-width="1.6"/>
      </svg>
    `
    },
    "odp": {
      id: "odp",
      name: "ODP / OTB Fiber",
      category: "infrastructure",
      svg: (color = "#d97706", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="5" y="5" width="22" height="22" rx="4" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <circle cx="11" cy="11" r="2" fill="${color}"/>
        <circle cx="16" cy="11" r="2" fill="${color}"/>
        <circle cx="21" cy="11" r="2" fill="${color}"/>
        <circle cx="11" cy="16" r="2" fill="${color}"/>
        <circle cx="16" cy="16" r="2" fill="${color}"/>
        <circle cx="21" cy="16" r="2" fill="${color}"/>
        <path d="M11 22h10" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `
    },
    "cloud": {
      id: "cloud",
      name: "Cloud / Internet WAN",
      category: "core",
      svg: (color = "#2a7c13", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <path d="M8 23h16a5.5 5.5 0 0 0 2-10.7 7.5 7.5 0 0 0-14.6-1.5A5.5 5.5 0 0 0 8 23z" stroke="${color}" stroke-width="2" fill="${bg}" stroke-linejoin="round"/>
      </svg>
    `
    },
    "database": {
      id: "database",
      name: "Database Storage",
      category: "endDevice",
      svg: (color = "#059669", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <ellipse cx="16" cy="8" rx="10" ry="4" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M6 8v8c0 2.2 4.5 4 10 4s10-1.8 10-4V8" stroke="${color}" stroke-width="2"/>
        <path d="M6 16v8c0 2.2 4.5 4 10 4s10-1.8 10-4v-8" stroke="${color}" stroke-width="2"/>
      </svg>
    `
    },
    "storage": {
      id: "storage",
      name: "NAS / Storage",
      category: "endDevice",
      svg: (color = "#059669", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="5" y="4" width="22" height="24" rx="3" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M5 11h22M5 18h22M10 8h4M10 15h4M10 22h4" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <circle cx="22" cy="7.5" r="1.2" fill="${color}"/>
        <circle cx="22" cy="14.5" r="1.2" fill="${color}"/>
        <circle cx="22" cy="21.5" r="1.2" fill="${color}"/>
      </svg>
    `
    },
    "laptop": {
      id: "laptop",
      name: "Laptop / Notebook",
      category: "endDevice",
      svg: (color = "#059669", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="5" y="6" width="22" height="15" rx="2" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M2 24h28a1 1 0 0 1-1 2H3a1 1 0 0 1-1-2z" stroke="${color}" stroke-width="2" fill="${bg}"/>
      </svg>
    `
    },
    "iot": {
      id: "iot",
      name: "IoT / Smart Device",
      category: "endDevice",
      svg: (color = "#059669", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <circle cx="16" cy="16" r="6" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M16 3v4M16 25v4M3 16h4M25 16h4M6.8 6.8l2.8 2.8M22.4 22.4l2.8 2.8M6.8 25.2l2.8-2.8M22.4 9.6l2.8-2.8" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `
    },
    "custom": {
      id: "custom",
      name: "Perangkat Kustom",
      category: "core",
      svg: (color = "#2a7c13", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <polygon points="16,3 28,10 28,22 16,29 4,22 4,10" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <circle cx="16" cy="16" r="4" fill="${color}"/>
      </svg>
    `
    },
    "mikrotik-ccr": {
      id: "mikrotik-ccr",
      name: "MikroTik CCR Rack",
      category: "core",
      svg: (color = "#2a7c13", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="2" y="9" width="28" height="14" rx="2.5" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M5.5 20V12l2.5 4.2L10.5 12v8" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="13" y="13" width="2.8" height="2.6" rx="0.5" fill="${color}"/>
        <rect x="17" y="13" width="2.8" height="2.6" rx="0.5" fill="${color}"/>
        <rect x="21" y="13" width="2.8" height="2.6" rx="0.5" fill="${color}"/>
        <rect x="25" y="13" width="2.8" height="2.6" rx="0.5" stroke="${color}" stroke-width="1.4"/>
        <rect x="13" y="17.5" width="2.8" height="2.6" rx="0.5" fill="${color}"/>
        <rect x="17" y="17.5" width="2.8" height="2.6" rx="0.5" fill="${color}"/>
        <rect x="21" y="17.5" width="2.8" height="2.6" rx="0.5" stroke="${color}" stroke-width="1.4"/>
        <rect x="25" y="17.5" width="2.8" height="2.6" rx="0.5" stroke="${color}" stroke-width="1.4"/>
      </svg>
    `
    },
    "mikrotik-rb": {
      id: "mikrotik-rb",
      name: "MikroTik RouterBOARD",
      category: "core",
      svg: (color = "#2a7c13", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="3" y="8" width="26" height="16" rx="3" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M6 12h6M6 15.5h4" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
        <circle cx="24" cy="12" r="1.4" fill="${color}"/>
        <rect x="6" y="18.5" width="3.2" height="3" rx="0.5" fill="${color}"/>
        <rect x="10.8" y="18.5" width="3.2" height="3" rx="0.5" fill="${color}"/>
        <rect x="15.6" y="18.5" width="3.2" height="3" rx="0.5" fill="${color}"/>
        <rect x="20.4" y="18.5" width="3.2" height="3" rx="0.5" fill="${color}"/>
        <rect x="24.8" y="18.5" width="2.2" height="3" rx="0.5" stroke="${color}" stroke-width="1.3"/>
      </svg>
    `
    },
    "mikrotik-crs": {
      id: "mikrotik-crs",
      name: "MikroTik CRS Switch",
      category: "distribution",
      svg: (color = "#76c457", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="2" y="8" width="28" height="16" rx="2.5" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M5 12h2.2v2.2H5zm3.4 0h2.2v2.2H8.4zm3.4 0H14v2.2h-2.2zm3.4 0h2.2v2.2h-2.2z" fill="${color}"/>
        <path d="M5 16.5h2.2v2.2H5zm3.4 0h2.2v2.2H8.4zm3.4 0H14v2.2h-2.2zm3.4 0h2.2v2.2h-2.2z" fill="${color}"/>
        <rect x="20" y="12" width="3" height="2.6" rx="0.5" stroke="${color}" stroke-width="1.4"/>
        <rect x="24.2" y="12" width="3" height="2.6" rx="0.5" stroke="${color}" stroke-width="1.4"/>
        <rect x="20" y="16.4" width="3" height="2.6" rx="0.5" stroke="${color}" stroke-width="1.4"/>
        <rect x="24.2" y="16.4" width="3" height="2.6" rx="0.5" stroke="${color}" stroke-width="1.4"/>
        <path d="M6 21.5h12" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    `
    },
    "mikrotik-cap": {
      id: "mikrotik-cap",
      name: "MikroTik cAP / hAP Wi-Fi",
      category: "distribution",
      svg: (color = "#76c457", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <ellipse cx="16" cy="21" rx="11" ry="5" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <circle cx="16" cy="21" r="2" fill="${color}"/>
        <path d="M11 14a7.5 7.5 0 0 1 10 0" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M7.5 10a12.5 12.5 0 0 1 17 0" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M4 6a17.5 17.5 0 0 1 24 0" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    `
    },
    "mikrotik-lhg": {
      id: "mikrotik-lhg",
      name: "MikroTik LHG PtP Dish",
      category: "distribution",
      svg: (color = "#76c457", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <path d="M6 22C6 13.5 12.5 7 21 7" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M8.5 23.5L22.5 9.5" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M14 18l5-5m0 0h3.5m-3.5 0V9.5" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="23" cy="9" r="2" fill="${color}"/>
        <path d="M9 26h10M14 23v3" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M25.5 4.5a6 6 0 0 1 2 4.5" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    `
    },
    "mikrotik-sxt": {
      id: "mikrotik-sxt",
      name: "MikroTik SXT / mANTBox",
      category: "distribution",
      svg: (color = "#76c457", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="4" y="7" width="12" height="18" rx="2.5" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M8 11v10M12 11v10" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M10 25v4M6 29h8" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M20 12a6.5 6.5 0 0 1 0 8" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M23.5 9a11 11 0 0 1 0 14" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M27 6a15.5 15.5 0 0 1 0 20" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    `
    },
    "ruijie-gateway": {
      id: "ruijie-gateway",
      name: "Ruijie EG / NBR Gateway",
      category: "core",
      svg: (color = "#2a7c13", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="2" y="8" width="28" height="16" rx="3" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M5.5 20V12h3a2.5 2.5 0 0 1 0 5h-3m2.2 0L10 20" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="14.5" cy="13.5" r="1.4" fill="${color}"/>
        <circle cx="18.5" cy="13.5" r="1.4" fill="${color}"/>
        <rect x="13" y="17.5" width="3" height="2.6" rx="0.5" fill="${color}"/>
        <rect x="17.2" y="17.5" width="3" height="2.6" rx="0.5" fill="${color}"/>
        <rect x="21.4" y="17.5" width="3" height="2.6" rx="0.5" fill="${color}"/>
        <rect x="25.2" y="13" width="2.4" height="7" rx="0.5" stroke="${color}" stroke-width="1.3"/>
      </svg>
    `
    },
    "ruijie-switch": {
      id: "ruijie-switch",
      name: "Ruijie NBS / ES Switch",
      category: "distribution",
      svg: (color = "#76c457", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="2" y="8" width="28" height="16" rx="2.5" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M5 12h2v2H5zm3 0h2v2H8zm3 0h2v2h-2zm3 0h2v2h-2zm3 0h2v2h-2z" fill="${color}"/>
        <path d="M5 16h2v2H5zm3 0h2v2H8zm3 0h2v2h-2zm3 0h2v2h-2zm3 0h2v2h-2z" fill="${color}"/>
        <rect x="21.5" y="11.8" width="2.6" height="2.6" rx="0.4" stroke="${color}" stroke-width="1.3"/>
        <rect x="25" y="11.8" width="2.6" height="2.6" rx="0.4" stroke="${color}" stroke-width="1.3"/>
        <rect x="21.5" y="15.8" width="2.6" height="2.6" rx="0.4" stroke="${color}" stroke-width="1.3"/>
        <rect x="25" y="15.8" width="2.6" height="2.6" rx="0.4" stroke="${color}" stroke-width="1.3"/>
        <path d="M5.5 21h21" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
    `
    },
    "ruijie-rap": {
      id: "ruijie-rap",
      name: "Ruijie Reyee RAP AP",
      category: "distribution",
      svg: (color = "#76c457", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="5" y="12" width="22" height="15" rx="5" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <circle cx="16" cy="19.5" r="2.2" fill="${color}"/>
        <path d="M11.5 9.5a6.8 6.8 0 0 1 9 0" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M8 6a11.5 11.5 0 0 1 16 0" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `
    },
    "ruijie-est": {
      id: "ruijie-est",
      name: "Ruijie EST Wireless Bridge",
      category: "distribution",
      svg: (color = "#76c457", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="4" y="6" width="12" height="19" rx="3" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <circle cx="10" cy="12" r="2" stroke="${color}" stroke-width="1.6"/>
        <path d="M7.5 18h5M10 25v4M6 29h8" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M20 11a7 7 0 0 1 0 9" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M24 8a11.5 11.5 0 0 1 0 15" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `
    },
    "tplink-hub": {
      id: "tplink-hub",
      name: "TP-Link Desktop Switch / Hub",
      category: "distribution",
      svg: (color = "#76c457", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <path d="M5 12h22l2 5v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7l2-5z" stroke="${color}" stroke-width="2" stroke-linejoin="round" fill="${bg}"/>
        <path d="M3 17h26" stroke="${color}" stroke-width="1.6"/>
        <circle cx="7" cy="14.5" r="1.1" fill="${color}"/>
        <rect x="6" y="19.5" width="3.2" height="3.2" rx="0.5" fill="${color}"/>
        <rect x="10.8" y="19.5" width="3.2" height="3.2" rx="0.5" fill="${color}"/>
        <rect x="15.6" y="19.5" width="3.2" height="3.2" rx="0.5" fill="${color}"/>
        <rect x="20.4" y="19.5" width="3.2" height="3.2" rx="0.5" fill="${color}"/>
        <rect x="24.8" y="19.5" width="2.2" height="3.2" rx="0.5" stroke="${color}" stroke-width="1.2"/>
      </svg>
    `
    },
    "tplink-switch": {
      id: "tplink-switch",
      name: "TP-Link JetStream Switch",
      category: "distribution",
      svg: (color = "#76c457", bg = "none") => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="2" y="8" width="28" height="16" rx="2.5" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <circle cx="5.5" cy="12" r="1.2" fill="${color}"/>
        <circle cx="5.5" cy="16" r="1.2" fill="${color}"/>
        <path d="M8.5 11.5h2.2v2.2H8.5zm3.3 0H14v2.2h-2.2zm3.3 0h2.2v2.2h-2.2zm3.3 0h2.2v2.2h-2.2z" fill="${color}"/>
        <path d="M8.5 15.5h2.2v2.2H8.5zm3.3 0H14v2.2h-2.2zm3.3 0h2.2v2.2h-2.2zm3.3 0h2.2v2.2h-2.2z" fill="${color}"/>
        <rect x="22.5" y="11.5" width="2.5" height="2.5" rx="0.4" stroke="${color}" stroke-width="1.3"/>
        <rect x="26" y="11.5" width="2.5" height="2.5" rx="0.4" stroke="${color}" stroke-width="1.3"/>
        <rect x="22.5" y="15.5" width="2.5" height="2.5" rx="0.4" stroke="${color}" stroke-width="1.3"/>
        <rect x="26" y="15.5" width="2.5" height="2.5" rx="0.4" stroke="${color}" stroke-width="1.3"/>
        <path d="M5.5 21h21" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
    `
    }
  };
  function getDefaultIconForType(type) {
    const map = {
      "router": "router",
      "main-router": "main-router",
      "core-switch": "core-switch",
      "dist-switch": "switch",
      "firewall": "firewall",
      "gateway": "gateway",
      "managed-switch": "switch",
      "poe-switch": "poe-switch",
      "access-point": "access-point",
      "wireless-bridge": "wireless-bridge",
      "unmanaged-switch": "switch",
      "network-rack": "network-rack",
      "patch-panel": "switch",
      "odp": "odp",
      "fo-terminal": "odp",
      "network-pole": "wireless-bridge",
      "cctv": "cctv",
      "nvr": "server",
      "server": "server",
      "computer": "computer",
      "printer": "printer",
      "ip-phone": "ip-phone",
      "storage": "storage",
      "nas": "storage",
      "laptop": "laptop",
      "iot": "iot",
      "custom": "custom",
      // MikroTik Hardware Presets
      "mikrotik-ccr2116": "mikrotik-ccr",
      "mikrotik-ccr2004": "mikrotik-ccr",
      "mikrotik-rb5009": "mikrotik-rb",
      "mikrotik-rb4011": "mikrotik-rb",
      "mikrotik-l009": "mikrotik-rb",
      "mikrotik-hex": "mikrotik-rb",
      "mikrotik-crs317": "mikrotik-crs",
      "mikrotik-crs326": "mikrotik-crs",
      "mikrotik-crs328": "mikrotik-crs",
      "mikrotik-crs310": "mikrotik-crs",
      "mikrotik-cap-ax": "mikrotik-cap",
      "mikrotik-hap-ax2": "mikrotik-cap",
      "mikrotik-lhg5": "mikrotik-lhg",
      "mikrotik-sxtsq": "mikrotik-sxt",
      "mikrotik-mantbox": "mikrotik-sxt",
      // Ruijie & Reyee Hardware Presets
      "ruijie-eg210g": "ruijie-gateway",
      "ruijie-eg310gh": "ruijie-gateway",
      "ruijie-nbr6210": "ruijie-gateway",
      "ruijie-s5750": "ruijie-switch",
      "ruijie-nbs5200": "ruijie-switch",
      "ruijie-nbs3100": "ruijie-switch",
      "ruijie-nbs3100-poe": "ruijie-switch",
      "ruijie-es218gc": "ruijie-switch",
      "ruijie-es209gc": "ruijie-switch",
      "ruijie-rap2260": "ruijie-rap",
      "ruijie-rap2200": "ruijie-rap",
      "ruijie-rap1200": "ruijie-rap",
      "ruijie-rap6260": "ruijie-rap",
      "ruijie-est350": "ruijie-est",
      // TP-Link Switch & Hub Presets
      "tplink-ls1005g": "tplink-hub",
      "tplink-sg1008d": "tplink-hub",
      "tplink-sg108e": "tplink-hub",
      "tplink-sg108pe": "tplink-hub",
      "tplink-sg1016d": "tplink-switch",
      "tplink-sg1024d": "tplink-switch",
      "tplink-sg1218mp": "tplink-switch",
      "tplink-sg2210mp": "tplink-switch",
      "tplink-sg2428p": "tplink-switch",
      "tplink-sg3428x": "tplink-switch",
      "tplink-sx3016f": "tplink-switch"
    };
    return map[type] || "router";
  }
  function getDeviceIconSvg(iconKey, { color = "#76c457", bg = "none", size } = {}) {
    const def = NETWORK_ICON_DEFS[iconKey] || NETWORK_ICON_DEFS.router;
    let svg = def.svg(color, bg);
    if (size) {
      svg = svg.replace('width="32" height="32"', `width="${size}" height="${size}"`);
    }
    return svg;
  }
  function getDeviceIconImage(iconKey, color = "#76c457", callback) {
    const cacheKey = `${iconKey}:${color}`;
    if (iconImageCache.has(cacheKey)) {
      callback(iconImageCache.get(cacheKey));
      return;
    }
    const svgStr = getDeviceIconSvg(iconKey, { color, bg: "none" });
    const dataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
    const img = new Image();
    img.onload = () => {
      iconImageCache.set(cacheKey, img);
      callback(img);
    };
    img.onerror = (err) => {
      console.warn(`[IconFactory] Failed to rasterize icon "${iconKey}":`, err);
    };
    img.src = dataUrl;
  }
  function loadDeviceCustomImage(src, callback) {
    if (!src) return;
    if (customImageCache.has(src)) {
      callback(customImageCache.get(src));
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      customImageCache.set(src, img);
      callback(img);
    };
    img.onerror = (err) => {
      console.warn("[IconFactory] Failed to load custom device image:", err);
    };
    img.src = src;
  }

  // js/devices/wireless-coverage.js
  var CAMPUS_PHYSICAL_WIDTH_METERS = 400;
  function metersToPixels(meters, mapWidth = 1024) {
    const pixelsPerMeter = mapWidth / CAMPUS_PHYSICAL_WIDTH_METERS;
    return meters * pixelsPerMeter;
  }
  function pixelsToMeters(pixels, mapWidth = 1024) {
    const metersPerPixel = CAMPUS_PHYSICAL_WIDTH_METERS / mapWidth;
    return pixels * metersPerPixel;
  }
  function calculateCoverageArea(radiusMeters) {
    return Math.PI * radiusMeters * radiusMeters;
  }
  function formatCoverageArea(areaM2) {
    return Math.round(areaM2).toLocaleString("id-ID") + " m\xB2";
  }
  var WirelessCoverageRenderer = class {
    /**
     * @param {Object} options
     * @param {number} [options.naturalWidth=1024]
     * @param {Function} [options.onRadiusChange]
     */
    constructor({ naturalWidth = 1024, onRadiusChange = null } = {}) {
      this.naturalWidth = naturalWidth;
      this.onRadiusChange = onRadiusChange;
      this.globalVisible = true;
    }
    /**
     * Set global visibility of all coverage zones
     * @param {boolean} visible 
     */
    setGlobalVisibility(visible) {
      this.globalVisible = visible;
    }
    /**
     * Cache coverage shape bitmap so pan/zoom doesn't re-run clip & hatch paths every frame
     * @param {Konva.Shape} shape
     * @param {number} radiusPixels
     */
    cacheShape(shape, radiusPixels) {
      if (!shape || typeof document === "undefined" || typeof shape.cache !== "function" || radiusPixels <= 0) return;
      try {
        const pad = 4;
        const size = (radiusPixels + pad) * 2;
        shape.clearCache();
        shape.cache({
          x: -(radiusPixels + pad),
          y: -(radiusPixels + pad),
          width: size,
          height: size,
          pixelRatio: 1.5
        });
      } catch (e) {
      }
    }
    /**
     * Create a Konva.Group containing the coverage shape, perimeter, measurement label, and resize handle
     * @param {Object} device 
     * @param {boolean} isSelected 
     * @returns {Konva.Group}
     */
    createCoverageGroup(device, isSelected) {
      const cov = device.wirelessCoverage;
      const group = new Konva.Group({
        name: "wireless-coverage-group",
        x: 0,
        y: 0,
        visible: Boolean(this.globalVisible && cov && cov.enabled)
      });
      if (!cov || !cov.enabled) {
        return group;
      }
      const radiusMeters = cov.radiusMeters || 25;
      const radiusPixels = metersToPixels(radiusMeters, this.naturalWidth);
      const color = cov.color || "#76c457";
      const opacity = typeof cov.opacity === "number" ? cov.opacity : 0.18;
      const hatch = cov.hatch !== void 0 ? Boolean(cov.hatch) : true;
      const band = cov.band || "dual-band";
      const coverageShape = new Konva.Shape({
        name: "coverage-shape",
        perfectDrawEnabled: false,
        shadowForStrokeEnabled: false,
        sceneFunc: (context, shape) => {
          const r = shape.getAttr("radiusPixels") || radiusPixels;
          const curColor = shape.getAttr("color") || color;
          const curOpacity = shape.getAttr("opacity") || opacity;
          const curHatch = shape.getAttr("hatch") !== void 0 ? shape.getAttr("hatch") : hatch;
          const curBand = shape.getAttr("band") || band;
          context.save();
          context.beginPath();
          context.arc(0, 0, r, 0, Math.PI * 2, false);
          context.closePath();
          context.fillStyle = curColor;
          context.globalAlpha = curOpacity;
          context.fill();
          if (curHatch) {
            context.save();
            context.clip();
            context.strokeStyle = curColor;
            context.lineWidth = 1;
            context.globalAlpha = curOpacity * 1.6;
            const step = 14;
            context.beginPath();
            for (let x = -r * 2; x <= r * 2; x += step) {
              context.moveTo(x - r, -r);
              context.lineTo(x + r, r);
            }
            context.stroke();
            context.restore();
          }
          if (curBand === "dual-band") {
            context.save();
            context.beginPath();
            context.arc(0, 0, r * 0.55, 0, Math.PI * 2, false);
            context.strokeStyle = curColor;
            context.lineWidth = 1;
            context.globalAlpha = 0.45;
            context.setLineDash([4, 4]);
            context.stroke();
            context.restore();
          }
          context.save();
          context.beginPath();
          context.arc(0, 0, r, 0, Math.PI * 2, false);
          context.strokeStyle = curColor;
          context.lineWidth = 1.6;
          context.globalAlpha = 0.85;
          context.setLineDash([6, 4]);
          context.stroke();
          context.restore();
          context.restore();
        },
        listening: false
      });
      coverageShape.setAttr("radiusPixels", radiusPixels);
      coverageShape.setAttr("color", color);
      coverageShape.setAttr("opacity", opacity);
      coverageShape.setAttr("hatch", hatch);
      coverageShape.setAttr("band", band);
      this.cacheShape(coverageShape, radiusPixels);
      group.add(coverageShape);
      const labelGroup = new Konva.Group({
        name: "coverage-label-group",
        y: -radiusPixels - 14,
        visible: Boolean(cov.showLabel !== false),
        listening: false
      });
      const areaM2 = calculateCoverageArea(radiusMeters);
      const bandLabel = band === "dual-band" ? "Dual-Band" : band === "5ghz" ? "5 GHz" : band === "ptp" ? "PtP" : "2.4 GHz";
      const labelTextContent = `\u{1F4F6} ${radiusMeters}m \u2022 ${formatCoverageArea(areaM2)} (${bandLabel})`;
      const labelBg = new Konva.Tag({
        fill: "rgba(24, 53, 13, 0.92)",
        stroke: color,
        strokeWidth: 1.1,
        cornerRadius: 4,
        perfectDrawEnabled: false,
        shadowForStrokeEnabled: false
      });
      const labelText = new Konva.Text({
        name: "coverage-label-text",
        text: labelTextContent,
        fontSize: 10,
        fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
        fontStyle: "600",
        fill: "#fff8cf",
        padding: 4,
        align: "center",
        perfectDrawEnabled: false
      });
      const labelLabel = new Konva.Label({
        name: "coverage-label-bubble"
      });
      labelLabel.add(labelBg);
      labelLabel.add(labelText);
      labelLabel.offsetX(labelText.width() / 2);
      labelGroup.add(labelLabel);
      group.add(labelGroup);
      const handle = new Konva.Circle({
        name: "coverage-resize-handle",
        x: radiusPixels,
        y: 0,
        radius: 6,
        fill: "#ffffff",
        stroke: color,
        strokeWidth: 2,
        perfectDrawEnabled: false,
        shadowForStrokeEnabled: false,
        draggable: true,
        visible: isSelected,
        cursor: "ew-resize"
      });
      handle.on("mouseenter", () => {
        document.body.style.cursor = "ew-resize";
        handle.scale({ x: 1.25, y: 1.25 });
        handle.getLayer()?.batchDraw();
      });
      handle.on("mouseleave", () => {
        document.body.style.cursor = "default";
        handle.scale({ x: 1, y: 1 });
        handle.getLayer()?.batchDraw();
      });
      handle.on("dragmove", (e) => {
        e.cancelBubble = true;
        const dx = handle.x();
        const dy = handle.y();
        let curRadiusPx = Math.sqrt(dx * dx + dy * dy);
        curRadiusPx = clamp2(curRadiusPx, 15, 384);
        handle.position({ x: curRadiusPx, y: 0 });
        if (typeof coverageShape.clearCache === "function") {
          coverageShape.clearCache();
        }
        coverageShape.setAttr("radiusPixels", curRadiusPx);
        const curMeters = Math.round(pixelsToMeters(curRadiusPx, this.naturalWidth));
        const curArea = calculateCoverageArea(curMeters);
        labelText.text(`\u{1F4F6} ${curMeters}m \u2022 ${formatCoverageArea(curArea)} (${bandLabel})`);
        labelLabel.offsetX(labelText.width() / 2);
        labelGroup.y(-curRadiusPx - 14);
        group.getLayer()?.batchDraw();
      });
      handle.on("dragend", (e) => {
        e.cancelBubble = true;
        const finalRadiusPx = handle.x();
        const finalMeters = Math.round(pixelsToMeters(finalRadiusPx, this.naturalWidth));
        this.cacheShape(coverageShape, finalRadiusPx);
        if (this.onRadiusChange) {
          this.onRadiusChange(device.id, finalMeters);
        }
      });
      group.add(handle);
      return group;
    }
    /**
     * Update visuals of an existing coverage group
     * @param {Konva.Group} deviceGroup 
     * @param {Object} device 
     * @param {boolean} isSelected 
     */
    updateCoverageGroup(deviceGroup, device, isSelected) {
      const cov = device.wirelessCoverage;
      let group = deviceGroup.findOne(".wireless-coverage-group");
      if (!cov || !cov.enabled) {
        if (group) group.visible(false);
        return;
      }
      if (!group) {
        group = this.createCoverageGroup(device, isSelected);
        deviceGroup.add(group);
        group.moveToBottom();
        return;
      }
      group.visible(Boolean(this.globalVisible && cov.enabled));
      const radiusMeters = cov.radiusMeters || 25;
      const radiusPixels = metersToPixels(radiusMeters, this.naturalWidth);
      const color = cov.color || "#76c457";
      const opacity = typeof cov.opacity === "number" ? cov.opacity : 0.18;
      const hatch = cov.hatch !== void 0 ? Boolean(cov.hatch) : true;
      const band = cov.band || "dual-band";
      const shape = group.findOne(".coverage-shape");
      if (shape) {
        if (typeof shape.clearCache === "function") shape.clearCache();
        shape.setAttr("radiusPixels", radiusPixels);
        shape.setAttr("color", color);
        shape.setAttr("opacity", opacity);
        shape.setAttr("hatch", hatch);
        shape.setAttr("band", band);
        this.cacheShape(shape, radiusPixels);
      }
      const labelGroup = group.findOne(".coverage-label-group");
      if (labelGroup) {
        labelGroup.visible(Boolean(cov.showLabel !== false));
        labelGroup.y(-radiusPixels - 14);
        const labelText = labelGroup.findOne(".coverage-label-text");
        const labelBubble = labelGroup.findOne(".coverage-label-bubble");
        if (labelText) {
          const areaM2 = calculateCoverageArea(radiusMeters);
          const bandLabel = band === "dual-band" ? "Dual-Band" : band === "5ghz" ? "5 GHz" : band === "ptp" ? "PtP" : "2.4 GHz";
          labelText.text(`\u{1F4F6} ${radiusMeters}m \u2022 ${formatCoverageArea(areaM2)} (${bandLabel})`);
          if (labelBubble) {
            labelBubble.offsetX(labelText.width() / 2);
          }
        }
      }
      const handle = group.findOne(".coverage-resize-handle");
      if (handle) {
        handle.position({ x: radiusPixels, y: 0 });
        handle.stroke(color);
        handle.visible(isSelected);
      }
    }
    /**
     * Set selection state on coverage group
     * @param {Konva.Group} deviceGroup 
     * @param {boolean} isSelected 
     */
    setSelection(deviceGroup, isSelected) {
      const handle = deviceGroup.findOne(".coverage-resize-handle");
      if (handle) {
        handle.visible(isSelected);
      }
    }
  };

  // js/devices/device-renderer.js
  var DeviceRenderer = class {
    /**
     * @param {Object} options
     * @param {number} options.naturalWidth
     * @param {number} options.naturalHeight
     * @param {Konva.Layer} [options.deviceLayer]
     * @param {Function} options.onSelect
     * @param {Function} options.onMove
     * @param {Function} [options.onRadiusChange]
     * @param {Function} [options.onContextMenu]
     */
    constructor({ naturalWidth = 1024, naturalHeight = 1024, deviceLayer = null, onSelect, onMove, onRadiusChange = null, onContextMenu = null }) {
      this.naturalWidth = naturalWidth;
      this.naturalHeight = naturalHeight;
      this.deviceLayer = deviceLayer;
      this.onSelect = onSelect;
      this.onMove = onMove;
      this.onRadiusChange = onRadiusChange;
      this.onContextMenu = onContextMenu;
      this.selectedDeviceId = null;
      this.markerMap = /* @__PURE__ */ new Map();
      this.coverageRenderer = new WirelessCoverageRenderer({
        naturalWidth: this.naturalWidth,
        onRadiusChange: (devId, meters) => {
          if (this.onRadiusChange) {
            this.onRadiusChange(devId, meters);
          }
        }
      });
    }
    /**
     * Create or update a Konva.Group for a device
     * @param {Object} device 
     * @returns {Konva.Group}
     */
    renderDevice(device) {
      let group = this.markerMap.get(device.id);
      const posX = device.position.x * this.naturalWidth;
      const posY = device.position.y * this.naturalHeight;
      if (!group) {
        group = this.createDeviceGroup(device, posX, posY);
        this.markerMap.set(device.id, group);
      } else {
        group.position({ x: posX, y: posY });
        this.updateDeviceVisuals(group, device);
      }
      group.setAttr("deviceData", device);
      return group;
    }
    /**
     * Safely cache a static Konva node (like baseCard or selectionRing with shadowBlur)
     * so shadow blurs are rasterized once instead of every pan/zoom frame
     * @param {Konva.Node} node
     * @param {number} [offset=14]
     */
    cacheNodeSafe(node, offset = 14) {
      if (!node || typeof document === "undefined" || typeof node.cache !== "function") return;
      try {
        node.clearCache();
        node.cache({ offset, pixelRatio: 2 });
      } catch (e) {
      }
    }
    /**
     * Instantiate a new Konva.Group marker
     * @param {Object} device 
     * @param {number} x 
     * @param {number} y 
     * @returns {Konva.Group}
     */
    createDeviceGroup(device, x, y) {
      const isSelected = this.selectedDeviceId === device.id;
      const cat = DEVICE_CATEGORIES[device.category] || DEVICE_CATEGORIES.core;
      const statusDef = DEVICE_STATUSES[device.status] || DEVICE_STATUSES.unknown;
      const def = getDeviceDefByType(device.type);
      const group = new Konva.Group({
        id: `marker-${device.id}`,
        name: "device-marker",
        x,
        y,
        draggable: true
      });
      group.setAttr("deviceId", device.id);
      const coverageGroup = this.coverageRenderer.createCoverageGroup(device, isSelected);
      group.add(coverageGroup);
      coverageGroup.moveToBottom();
      const selectionRing = new Konva.Rect({
        name: "selection-ring",
        x: -24,
        y: -24,
        width: 48,
        height: 48,
        cornerRadius: 12,
        stroke: "#2a7c13",
        strokeWidth: 2,
        dash: [6, 4],
        visible: isSelected,
        shadowColor: "#76c457",
        shadowBlur: 10,
        perfectDrawEnabled: false,
        shadowForStrokeEnabled: false,
        listening: false
      });
      this.cacheNodeSafe(selectionRing, 14);
      group.add(selectionRing);
      const baseCard = new Konva.Rect({
        name: "base-card",
        x: -18,
        y: -18,
        width: 36,
        height: 36,
        cornerRadius: 8,
        fill: "#18350d",
        stroke: cat.color,
        strokeWidth: 2,
        shadowColor: "rgba(0, 0, 0, 0.4)",
        shadowBlur: 8,
        shadowOffset: { x: 0, y: 3 },
        shadowOpacity: 0.5,
        perfectDrawEnabled: false,
        shadowForStrokeEnabled: false
      });
      group.add(baseCard);
      const iconImage = new Konva.Image({
        name: "device-icon-image",
        x: -12,
        y: -12,
        width: 24,
        height: 24,
        perfectDrawEnabled: false,
        listening: false
      });
      group.add(iconImage);
      const iconCode = this.getDeviceShortCode(device.type);
      const iconText = new Konva.Text({
        name: "icon-text",
        x: -18,
        y: -10,
        width: 36,
        text: iconCode,
        fontSize: 11,
        fontFamily: "ui-monospace, monospace",
        fontStyle: "bold",
        fill: cat.color,
        align: "center",
        visible: false,
        perfectDrawEnabled: false,
        listening: false
      });
      group.add(iconText);
      this.updateMarkerGraphic(group, device, cat);
      const statusDot = new Konva.Circle({
        name: "status-dot",
        x: 16,
        y: -16,
        radius: 5,
        fill: statusDef.color,
        stroke: "#18350d",
        strokeWidth: 1.5,
        perfectDrawEnabled: false,
        shadowForStrokeEnabled: false,
        listening: false
      });
      group.add(statusDot);
      const labelGroup = new Konva.Group({
        name: "label-group",
        y: 24,
        listening: false
      });
      const labelText = new Konva.Text({
        name: "label-text",
        text: this.formatLabel(device),
        fontSize: 10,
        fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        fill: "#fff8cf",
        padding: 3,
        align: "center",
        perfectDrawEnabled: false,
        listening: false
      });
      labelText.offsetX(labelText.width() / 2);
      labelGroup.add(labelText);
      group.add(labelGroup);
      group.on("click tap", (e) => {
        e.cancelBubble = true;
        if (this.onSelect) {
          this.onSelect(device.id);
        }
      });
      group.on("contextmenu", (e) => {
        e.evt.preventDefault();
        e.cancelBubble = true;
        const currentDev = group.getAttr("deviceData") || device;
        if (this.onContextMenu) {
          this.onContextMenu(currentDev, e.evt.clientX, e.evt.clientY);
        }
      });
      group.on("mouseenter", () => {
        if (group.getStage()?.isDragging()) return;
        document.body.style.cursor = "pointer";
        group.scale({ x: 1.08, y: 1.08 });
        this.deviceLayer?.batchDraw();
      });
      group.on("mouseleave", () => {
        if (group.getStage()?.isDragging()) return;
        document.body.style.cursor = "default";
        group.scale({ x: 1, y: 1 });
        this.deviceLayer?.batchDraw();
      });
      group.on("dragstart", (e) => {
        e.cancelBubble = true;
        group.moveToTop();
        if (this.onSelect) {
          this.onSelect(device.id);
        }
      });
      group.on("dragmove", (e) => {
        e.cancelBubble = true;
        const curX = clamp2(group.x(), 0, this.naturalWidth);
        const curY = clamp2(group.y(), 0, this.naturalHeight);
        group.position({ x: curX, y: curY });
      });
      group.on("dragend", (e) => {
        e.cancelBubble = true;
        const finalX = clamp2(group.x(), 0, this.naturalWidth);
        const finalY = clamp2(group.y(), 0, this.naturalHeight);
        group.position({ x: finalX, y: finalY });
        const normalizedX = finalX / this.naturalWidth;
        const normalizedY = finalY / this.naturalHeight;
        if (this.onMove) {
          this.onMove(device.id, { x: normalizedX, y: normalizedY });
        }
      });
      return group;
    }
    /**
     * Update visual properties of an existing group
     * @param {Konva.Group} group 
     * @param {Object} device 
     */
    updateDeviceVisuals(group, device) {
      const isSelected = this.selectedDeviceId === device.id;
      const cat = DEVICE_CATEGORIES[device.category] || DEVICE_CATEGORIES.core;
      const statusDef = DEVICE_STATUSES[device.status] || DEVICE_STATUSES.unknown;
      const ring = group.findOne(".selection-ring");
      if (ring) ring.visible(isSelected);
      const card = group.findOne(".base-card");
      if (card) card.stroke(cat.color);
      this.updateMarkerGraphic(group, device, cat);
      this.coverageRenderer.updateCoverageGroup(group, device, isSelected);
      const statusDot = group.findOne(".status-dot");
      if (statusDot) statusDot.fill(statusDef.color);
      const labelText = group.findOne(".label-text");
      if (labelText) {
        labelText.text(this.formatLabel(device));
        labelText.offsetX(labelText.width() / 2);
      }
    }
    /**
     * Render either the vector network icon or the user's custom uploaded image
     * @param {Konva.Group} group 
     * @param {Object} device 
     * @param {Object} cat 
     */
    updateMarkerGraphic(group, device, cat) {
      const iconImage = group.findOne(".device-icon-image");
      const iconText = group.findOne(".icon-text");
      const baseCard = group.findOne(".base-card");
      const style = device.markerStyle || "rounded";
      if (baseCard) {
        if (typeof baseCard.clearCache === "function") baseCard.clearCache();
        if (style === "circle") {
          baseCard.cornerRadius(18);
          baseCard.fill("#18350d");
          baseCard.stroke(cat.color);
          baseCard.shadowOpacity(0.5);
        } else if (style === "icon-only") {
          baseCard.fill("rgba(24, 53, 13, 0.45)");
          baseCard.stroke("transparent");
          baseCard.shadowOpacity(0.2);
        } else {
          baseCard.cornerRadius(8);
          baseCard.fill("#18350d");
          baseCard.stroke(cat.color);
          baseCard.shadowOpacity(0.5);
        }
        this.cacheNodeSafe(baseCard, 14);
      }
      if (device.customImage) {
        loadDeviceCustomImage(device.customImage, (img) => {
          if (!iconImage) return;
          iconImage.image(img);
          iconImage.visible(true);
          if (iconText) iconText.visible(false);
          this.deviceLayer?.batchDraw();
        });
      } else {
        const iconKey = device.customIcon || getDefaultIconForType(device.type);
        getDeviceIconImage(iconKey, cat.color, (img) => {
          if (!iconImage) return;
          iconImage.image(img);
          iconImage.visible(true);
          if (iconText) iconText.visible(false);
          this.deviceLayer?.batchDraw();
        });
      }
    }
    /**
     * Set currently selected device ID and update selection rings
     * @param {string|null} deviceId 
     */
    setSelectedDevice(deviceId) {
      this.selectedDeviceId = deviceId;
      this.markerMap.forEach((group, id) => {
        const isSelected = id === deviceId;
        const ring = group.findOne(".selection-ring");
        if (ring) {
          ring.visible(isSelected);
        }
        this.coverageRenderer.setSelection(group, isSelected);
      });
      this.deviceLayer?.batchDraw();
    }
    /**
     * Set global visibility of all wireless coverage zones
     * @param {boolean} visible 
     */
    setCoverageVisibility(visible) {
      this.coverageRenderer.setGlobalVisibility(visible);
      this.markerMap.forEach((group) => {
        const covGroup = group.findOne(".wireless-coverage-group");
        const device = group.getAttr("deviceData");
        if (covGroup) {
          covGroup.visible(Boolean(visible && device?.wirelessCoverage?.enabled));
        }
      });
      this.deviceLayer?.batchDraw();
    }
    /**
     * Remove a device marker from canvas
     * @param {string} deviceId 
     */
    removeDevice(deviceId) {
      const group = this.markerMap.get(deviceId);
      if (group) {
        group.destroy();
        this.markerMap.delete(deviceId);
      }
    }
    /**
     * Format label string: Device Name + IP (if present)
     * @param {Object} device 
     * @returns {string}
     */
    formatLabel(device) {
      if (device.network?.ip) {
        return `${device.name}
${device.network.ip}`;
      }
      return device.name;
    }
    /**
     * Get 2-3 letter short code for device marker badge
     * @param {string} type 
     * @returns {string}
     */
    getDeviceShortCode(type) {
      const map = {
        "router": "RTR",
        "main-router": "CCR",
        "core-switch": "CSW",
        "dist-switch": "DSW",
        "managed-switch": "SW",
        "unmanaged-switch": "SW",
        "poe-switch": "PoE",
        "access-point": "AP",
        "wireless-bridge": "PtP",
        "firewall": "FW",
        "gateway": "GW",
        "network-rack": "RCK",
        "patch-panel": "PP",
        "odp": "ODP",
        "fo-terminal": "OTB",
        "network-pole": "POL",
        "cctv": "CAM",
        "nvr": "NVR",
        "server": "SRV",
        "computer": "PC",
        "printer": "PRN",
        "ip-phone": "VOIP"
      };
      return map[type] || "DEV";
    }
  };

  // js/devices/device-manager.js
  var DeviceManager = class {
    /**
     * @param {Object} options
     * @param {Konva.Layer} options.deviceLayer
     * @param {number} options.naturalWidth
     * @param {number} options.naturalHeight
     */
    constructor({ deviceLayer, naturalWidth = 1024, naturalHeight = 1024 }) {
      this.deviceLayer = deviceLayer;
      this.naturalWidth = naturalWidth;
      this.naturalHeight = naturalHeight;
      this.devices = /* @__PURE__ */ new Map();
      this.selectedDeviceId = null;
      this.renderer = new DeviceRenderer({
        naturalWidth: this.naturalWidth,
        naturalHeight: this.naturalHeight,
        deviceLayer: this.deviceLayer,
        onSelect: (id) => this.selectDevice(id),
        onMove: (id, position) => this.updateDevicePosition(id, position),
        onRadiusChange: (id, meters) => {
          const dev = this.devices.get(id);
          if (dev) {
            const currentCov = dev.wirelessCoverage || {};
            this.updateDevice(id, {
              wirelessCoverage: {
                ...currentCov,
                enabled: true,
                radiusMeters: meters
              }
            });
          }
        },
        onContextMenu: (device, clientX, clientY) => {
          eventBus.emit("contextmenu:device", { device, screenX: clientX, screenY: clientY });
        }
      });
    }
    /**
     * Add a new device to the manager and render it
     * @param {Object} deviceData 
     * @returns {Object} Created device
     */
    addDevice(deviceData) {
      const def = getDeviceDefByType(deviceData.type);
      const resolvedCoverage = deviceData.wirelessCoverage !== void 0 ? deviceData.wirelessCoverage : def?.defaultWirelessCoverage ? { ...def.defaultWirelessCoverage } : void 0;
      const enrichedData = {
        name: deviceData.name || (def ? def.name : "New Device"),
        category: deviceData.category || (def ? def.category : "core"),
        brand: deviceData.brand || (def ? def.defaultBrand : ""),
        model: deviceData.model || (def ? def.defaultModel : ""),
        ...deviceData,
        ...resolvedCoverage !== void 0 ? { wirelessCoverage: resolvedCoverage } : {}
      };
      const device = DeviceSchema.create(enrichedData);
      const validation = DeviceSchema.validate(device);
      if (!validation.isValid) {
        console.warn("[DeviceManager] Device validation failed:", validation.errors);
      }
      this.devices.set(device.id, device);
      const group = this.renderer.renderDevice(device);
      if (!group.getParent()) {
        this.deviceLayer.add(group);
      }
      this.deviceLayer.batchDraw();
      eventBus.emit("device:added", device);
      return device;
    }
    /**
     * Update properties of an existing device
     * @param {string} id 
     * @param {Object} updates 
     * @returns {Object|null}
     */
    updateDevice(id, updates) {
      const existing = this.devices.get(id);
      if (!existing) return null;
      const updatedNetwork = updates.network ? { ...existing.network, ...updates.network } : existing.network;
      const updatedDevice = {
        ...existing,
        ...updates,
        network: updatedNetwork,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      this.devices.set(id, updatedDevice);
      this.renderer.renderDevice(updatedDevice);
      this.deviceLayer.batchDraw();
      eventBus.emit("device:updated", updatedDevice);
      return updatedDevice;
    }
    /**
     * Update position coordinates of a device
     * @param {string} id 
     * @param {{x: number, y: number}} position (Normalized 0 - 1)
     */
    updateDevicePosition(id, position) {
      const device = this.devices.get(id);
      if (!device) return;
      device.position.x = clamp2(position.x, 0, 1);
      device.position.y = clamp2(position.y, 0, 1);
      device.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      eventBus.emit("device:moved", { deviceId: id, position: device.position });
    }
    /**
     * Duplicate a device near its current position
     * @param {string} id 
     * @returns {Object|null}
     */
    duplicateDevice(id) {
      const source = this.devices.get(id);
      if (!source) return null;
      const cloneData = JSON.parse(JSON.stringify(source));
      delete cloneData.id;
      cloneData.name = `${source.name} (Copy)`;
      cloneData.position = {
        x: clamp2(source.position.x + 0.02, 0, 1),
        y: clamp2(source.position.y + 0.02, 0, 1)
      };
      const newDevice = this.addDevice(cloneData);
      this.selectDevice(newDevice.id);
      return newDevice;
    }
    /**
     * Delete a device from the manager and canvas
     * @param {string} id 
     * @returns {boolean}
     */
    deleteDevice(id) {
      const device = this.devices.get(id);
      if (!device) return false;
      if (this.selectedDeviceId === id) {
        this.deselectDevice();
      }
      this.renderer.removeDevice(id);
      this.devices.delete(id);
      this.deviceLayer.batchDraw();
      eventBus.emit("device:deleted", { deviceId: id });
      return true;
    }
    /**
     * Select a device by ID
     * @param {string} id 
     */
    selectDevice(id) {
      const device = this.devices.get(id);
      if (!device) return;
      this.selectedDeviceId = id;
      this.renderer.setSelectedDevice(id);
      this.deviceLayer.batchDraw();
      eventBus.emit("device:selected", device);
    }
    /**
     * Deselect active device
     */
    deselectDevice() {
      if (!this.selectedDeviceId) return;
      const prevId = this.selectedDeviceId;
      this.selectedDeviceId = null;
      this.renderer.setSelectedDevice(null);
      this.deviceLayer.batchDraw();
      eventBus.emit("device:deselected", { deviceId: prevId });
    }
    /**
     * Get device by ID
     * @param {string} id 
     * @returns {Object|null}
     */
    getDeviceById(id) {
      return this.devices.get(id) || null;
    }
    /**
     * Get all devices as an array
     * @returns {Object[]}
     */
    getAllDevices() {
      return Array.from(this.devices.values());
    }
    /**
     * Re-render all devices in current collection
     */
    renderAll() {
      this.devices.forEach((device) => {
        const group = this.renderer.renderDevice(device);
        if (!group.getParent()) {
          this.deviceLayer.add(group);
        }
      });
      this.deviceLayer.batchDraw();
    }
  };

  // js/ui/device-palette.js
  var DevicePalette = class {
    /**
     * @param {HTMLElement} container 
     */
    constructor(container) {
      this.container = container;
      this.activeTypeToPlace = null;
      this.activeCustomTemplateToPlace = null;
      this.multiPlaceMode = false;
      this.searchQuery = "";
      this.activeFilter = "all";
      this.customTemplates = this.loadCustomTemplates();
      this.render();
      this.bindStaticEvents();
      this.bindCatalogItemEvents();
    }
    /**
     * Load saved custom device templates from localStorage
     * @returns {Object[]}
     */
    loadCustomTemplates() {
      try {
        const raw = localStorage.getItem("netmap_custom_templates");
        return raw ? JSON.parse(raw) : [];
      } catch (err) {
        console.warn("[DevicePalette] Failed to load custom templates from localStorage:", err);
        return [];
      }
    }
    /**
     * Persist custom templates to localStorage
     */
    saveCustomTemplates() {
      try {
        localStorage.setItem("netmap_custom_templates", JSON.stringify(this.customTemplates));
      } catch (err) {
        console.warn("[DevicePalette] Failed to save custom templates to localStorage:", err);
      }
    }
    /**
     * Add a new user-defined custom device template to the library palette
     * @param {Object} data 
     * @returns {Object} Created template
     */
    addCustomTemplate(data) {
      const template = {
        id: `custom-tmpl-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        isCustom: true,
        name: data.name || "Perangkat Kustom",
        category: data.category || "core",
        type: data.type || "custom",
        brand: data.brand || "",
        model: data.model || "",
        status: data.status || "online",
        markerStyle: data.markerStyle || "rounded",
        customIcon: data.customIcon || "",
        customImage: data.customImage || "",
        network: data.network || {},
        wirelessCoverage: data.wirelessCoverage || null,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      this.customTemplates.unshift(template);
      this.saveCustomTemplates();
      this.renderCatalogLists();
      return template;
    }
    /**
     * Remove a custom template from the library palette
     * @param {string} templateId 
     */
    removeCustomTemplate(templateId) {
      this.customTemplates = this.customTemplates.filter((t) => t.id !== templateId);
      if (this.activeCustomTemplateToPlace?.id === templateId) {
        this.activeCustomTemplateToPlace = null;
      }
      this.saveCustomTemplates();
      this.renderCatalogLists();
    }
    /**
     * Get all custom device templates
     * @returns {Object[]}
     */
    getCustomTemplates() {
      return this.customTemplates;
    }
    render() {
      if (!this.container) return;
      this.container.innerHTML = `
      <div class="device-palette-wrapper" style="display: flex; flex-direction: column; gap: 10px;">
        <!-- Quick Actions Row: Custom Device & MikroTik Batch Insert -->
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <button id="btn-add-custom-device" class="btn btn-secondary btn-sm" 
                  title="Buka dialog untuk membuat perangkat jaringan kustom dengan ikon atau gambar sendiri"
                  style="width: 100%; justify-content: center; gap: 6px; font-weight: 700; padding: 8px 10px; height: auto; border: 1.5px dashed var(--accent-blue, #2a7c13); background: var(--bg-tertiary, #f2dac8); color: var(--accent-blue, #2a7c13); cursor: pointer; border-radius: 8px; box-shadow: var(--shadow-sm);">
            <i data-lucide="plus-circle" style="width: 15px; height: 15px; flex-shrink: 0;"></i>
            <span>+ Tambah Perangkat Kustom</span>
          </button>

          <button id="btn-open-mikrotik-insert" class="btn btn-primary btn-sm"
                  title="Sisipkan 1 atau banyak perangkat MikroTik, Ruijie, atau TP-Link sekaligus lengkap dengan auto IP"
                  style="width: 100%; justify-content: center; gap: 6px; font-weight: 700; padding: 8px 10px; height: auto; border-radius: 8px;">
            <i data-lucide="zap" style="width: 14px; height: 14px; flex-shrink: 0;"></i>
            <span>Insert Cepat Vendor (Batch)</span>
          </button>
        </div>

        <!-- Search & Brand Filter Bar -->
        <div style="display: flex; flex-direction: column; gap: 6px; padding-bottom: 2px;">
          <div style="position: relative; display: flex; align-items: center;">
            <i data-lucide="search" style="width: 13px; height: 13px; color: var(--text-muted); position: absolute; left: 8px; pointer-events: none;"></i>
            <input type="text" id="palette-search-input" placeholder="Cari MikroTik, Ruijie, TP-Link, Hub..."
                   value="${escapeHtml(this.searchQuery)}"
                   style="width: 100%; padding: 5px 26px 5px 26px; font-size: 11.5px; border-radius: 6px; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);">
            <button type="button" id="btn-clear-palette-search" title="Hapus pencarian"
                    style="position: absolute; right: 6px; background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 13px; line-height: 1; display: ${this.searchQuery ? "block" : "none"};">
              &times;
            </button>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px; flex-wrap: wrap;">
            <div style="display: flex; gap: 3px; flex: 1; flex-wrap: wrap; min-width: 0;">
              ${this.renderFilterPill("all", "Semua")}
              ${this.renderFilterPill("mikrotik", "MikroTik")}
              ${this.renderFilterPill("ruijie", "Ruijie")}
              ${this.renderFilterPill("tplink", "TP-Link")}
              ${this.renderFilterPill("standard", "Umum")}
            </div>
            <label title="Tetap aktif di mode tambah perangkat setelah klik di peta agar bisa insert banyak unit berturut-turut"
                   style="display: flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 600; color: var(--text-secondary); cursor: pointer; white-space: nowrap; flex-shrink: 0;">
              <input type="checkbox" id="toggle-multi-place" ${this.multiPlaceMode ? "checked" : ""} style="accent-color: var(--accent-blue); margin: 0;">
              <span>Multi</span>
            </label>
          </div>
        </div>

        <!-- Dynamic Catalog Lists -->
        <div id="palette-catalog-lists" style="display: flex; flex-direction: column; gap: 14px;">
          ${this.buildCatalogListsHtml()}
        </div>
      </div>
    `;
      if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons({ root: this.container });
      }
    }
    renderFilterPill(filterId, label) {
      const isActive = this.activeFilter === filterId;
      return `
      <button type="button" class="btn-palette-filter" data-filter="${filterId}"
              style="flex: 1 1 auto; min-width: 46px; padding: 3px 6px; font-size: 10px; font-weight: 600; border-radius: 5px; cursor: pointer; white-space: nowrap; border: 1px solid ${isActive ? "var(--accent-blue)" : "var(--border-color)"}; background: ${isActive ? "var(--accent-blue)" : "var(--bg-primary)"}; color: ${isActive ? "var(--text-inverse)" : "var(--text-secondary)"}; transition: all 0.15s ease;">
        ${label}
      </button>
    `;
    }
    matchesSearch(item) {
      if (!this.searchQuery) return true;
      const q = this.searchQuery.toLowerCase();
      const haystack = [
        item.name,
        item.type,
        item.brand,
        item.model,
        item.defaultBrand,
        item.defaultModel,
        item.badgeCode,
        item.description
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    }
    buildCatalogListsHtml() {
      let html = "";
      const hasFilterMatches = { count: 0 };
      if (this.activeFilter === "all" && this.customTemplates.length > 0) {
        const matchedCustom = this.customTemplates.filter((t) => this.matchesSearch(t));
        if (matchedCustom.length > 0) {
          hasFilterMatches.count += matchedCustom.length;
          html += `
          <div class="palette-category-group" style="display: flex; flex-direction: column; gap: 6px;">
            <div class="category-header" style="display: flex; align-items: center; justify-content: space-between; padding: 2px 4px;">
              <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: var(--accent-blue, #2a7c13); display: flex; align-items: center; gap: 5px;">
                <i data-lucide="sparkles" style="width: 13px; height: 13px; color: var(--status-warning, #d97706);"></i>
                <span>Perangkat Kustom</span>
              </span>
              <span style="font-size: 10px; color: var(--accent-blue, #2a7c13); background: rgba(42, 124, 19, 0.12); padding: 1px 6px; border-radius: 4px; font-weight: 700;">
                ${matchedCustom.length}
              </span>
            </div>
            <div class="palette-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;">
        `;
          matchedCustom.forEach((tmpl) => {
            const cat = DEVICE_CATEGORIES[tmpl.category] || DEVICE_CATEGORIES.core;
            const catColor = cat.color || "#2a7c13";
            let thumbHtml = "";
            if (tmpl.customImage) {
              thumbHtml = `<img src="${tmpl.customImage}" style="width: 18px; height: 18px; object-fit: contain; border-radius: 2px;" alt="${escapeHtml(tmpl.name)}" />`;
            } else {
              const iconKey = tmpl.customIcon || getDefaultIconForType(tmpl.type || "router");
              thumbHtml = getDeviceIconSvg(iconKey, { color: catColor, size: 16 });
            }
            html += `
            <div class="palette-item palette-item-custom" 
                 draggable="true" 
                 data-custom-template-id="${tmpl.id}"
                 data-device-type="${tmpl.type || "custom"}"
                 data-category="${tmpl.category || "core"}"
                 style="background-color: var(--bg-primary); border: 1.5px solid var(--accent-cyan, #76c457); border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 4px; cursor: grab; transition: all 150ms ease; position: relative;">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                  <div style="width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.06); border-radius: 4px; flex-shrink: 0; overflow: hidden;">
                    ${thumbHtml}
                  </div>
                  <span style="font-size: 9px; font-weight: 700; color: ${catColor}; font-family: var(--font-mono); text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${(tmpl.brand || tmpl.type || "CUST").substring(0, 4)}
                  </span>
                </div>
                <button class="btn-delete-template" data-template-id="${tmpl.id}" title="Hapus template kustom ini dari library" 
                        style="background: transparent; border: none; padding: 0 2px; cursor: pointer; color: var(--text-muted); font-size: 15px; line-height: 1; border-radius: 3px; transition: color 0.1s ease;">
                  &times;
                </button>
              </div>
              <div class="palette-item-name" title="${escapeHtml(tmpl.name)}">
                ${escapeHtml(tmpl.name)}
              </div>
              <div class="palette-item-sub" title="${escapeHtml(tmpl.brand || "")} ${escapeHtml(tmpl.model || "")}">
                ${tmpl.brand ? `${escapeHtml(tmpl.brand)} ${escapeHtml(tmpl.model || "")}` : escapeHtml(tmpl.model) || "Custom"}
              </div>
            </div>
          `;
          });
          html += `</div></div>`;
        }
      }
      const vendorSections = [
        { id: "mikrotik", title: "MikroTik Series", icon: "router", catalog: MIKROTIK_CATALOG, fallbackBadge: "MT" },
        { id: "ruijie", title: "Ruijie / Reyee Series", icon: "cpu", catalog: RUIJIE_CATALOG, fallbackBadge: "RG" },
        { id: "tplink", title: "TP-Link Switch & Hub", icon: "network", catalog: TPLINK_CATALOG, fallbackBadge: "TPL" }
      ];
      vendorSections.forEach((sec) => {
        if (this.activeFilter !== "all" && this.activeFilter !== sec.id) return;
        const matched = sec.catalog.filter((item) => this.matchesSearch(item));
        if (matched.length === 0) return;
        hasFilterMatches.count += matched.length;
        html += `
        <div class="palette-category-group" style="display: flex; flex-direction: column; gap: 6px;">
          <div class="category-header" style="display: flex; align-items: center; justify-content: space-between; padding: 2px 4px;">
            <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: var(--accent-blue, #2a7c13); display: flex; align-items: center; gap: 5px;">
              <i data-lucide="${sec.icon}" style="width: 13px; height: 13px;"></i>
              <span>${sec.title}</span>
            </span>
            <span style="font-size: 10px; color: var(--accent-blue, #2a7c13); background: rgba(42, 124, 19, 0.12); padding: 1px 6px; border-radius: 4px; font-weight: 700;">
              ${matched.length}
            </span>
          </div>
          <div class="palette-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;">
      `;
        matched.forEach((item) => {
          const cat = DEVICE_CATEGORIES[item.category] || DEVICE_CATEGORIES.core;
          const isSelected = this.activeTypeToPlace === item.type && !this.activeCustomTemplateToPlace;
          html += this.renderBuiltInItemCard(item, cat, item.badgeCode || sec.fallbackBadge, isSelected);
        });
        html += `</div></div>`;
      });
      if (this.activeFilter === "all" || this.activeFilter === "standard") {
        const grouped = {
          core: [],
          distribution: [],
          infrastructure: [],
          endDevice: []
        };
        STANDARD_DEVICE_CATALOG.forEach((item) => {
          if (grouped[item.category] && this.matchesSearch(item)) {
            grouped[item.category].push(item);
          }
        });
        Object.keys(DEVICE_CATEGORIES).forEach((catKey) => {
          const cat = DEVICE_CATEGORIES[catKey];
          const items = grouped[catKey] || [];
          if (items.length === 0) return;
          hasFilterMatches.count += items.length;
          html += `
          <div class="palette-category-group" style="display: flex; flex-direction: column; gap: 6px;">
            <div class="category-header" style="display: flex; align-items: center; justify-content: space-between; padding: 2px 4px;">
              <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: ${cat.color};">
                ${cat.name}
              </span>
              <span style="font-size: 10px; color: var(--text-muted); background: var(--bg-primary); padding: 1px 6px; border-radius: 4px;">
                ${items.length}
              </span>
            </div>
            <div class="palette-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;">
        `;
          items.forEach((item) => {
            const isSelected = this.activeTypeToPlace === item.type && !this.activeCustomTemplateToPlace;
            html += this.renderBuiltInItemCard(item, cat, item.type.substring(0, 4), isSelected);
          });
          html += `</div></div>`;
        });
      }
      if (hasFilterMatches.count === 0) {
        html = `
        <div style="padding: 20px 10px; text-align: center; color: var(--text-muted); font-size: 11.5px; background: var(--bg-primary); border-radius: 8px; border: 1px dashed var(--border-color);">
          Tidak ada perangkat yang cocok dengan pencarian "<strong>${escapeHtml(this.searchQuery)}</strong>".
        </div>
      `;
      }
      return html;
    }
    renderBuiltInItemCard(item, cat, badgeText, isSelected = false) {
      return `
      <div class="palette-item ${isSelected ? "active-placement" : ""}" 
           draggable="true" 
           data-device-type="${item.type}"
           data-category="${item.category}"
           title="${escapeHtml(item.description || item.name)} \u2014 Drag ke peta atau klik lalu klik di peta"
           style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 4px; cursor: grab; transition: all 150ms ease;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
            <div style="width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.06); border-radius: 4px; flex-shrink: 0;">
              ${getDeviceIconSvg(getDefaultIconForType(item.type), { color: cat.color, size: 16 })}
            </div>
            <span style="font-size: 9px; font-weight: 700; color: ${cat.color}; font-family: var(--font-mono); text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${escapeHtml(badgeText)}
            </span>
          </div>
          <span style="width: 6px; height: 6px; border-radius: 50%; background-color: ${cat.color}; opacity: 0.8; flex-shrink: 0;"></span>
        </div>
        <div class="palette-item-name" title="${escapeHtml(item.name)}">
          ${escapeHtml(item.name)}
        </div>
        <div class="palette-item-sub" title="${escapeHtml(item.defaultBrand)} ${escapeHtml(item.defaultModel)}">
          ${item.brandGroup ? escapeHtml(item.defaultModel) : `${escapeHtml(item.defaultBrand)} ${escapeHtml(item.defaultModel)}`}
        </div>
      </div>
    `;
    }
    renderCatalogLists() {
      const listContainer = this.container.querySelector("#palette-catalog-lists");
      if (!listContainer) return;
      listContainer.innerHTML = this.buildCatalogListsHtml();
      this.bindCatalogItemEvents();
      if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons({ root: listContainer });
      }
    }
    bindStaticEvents() {
      this.container.querySelector("#btn-add-custom-device")?.addEventListener("click", () => {
        eventBus.emit("modal:open-custom-device");
      });
      this.container.querySelector("#btn-open-mikrotik-insert")?.addEventListener("click", () => {
        const targetVendor = this.activeFilter === "ruijie" || this.activeFilter === "tplink" ? this.activeFilter : "mikrotik";
        eventBus.emit("modal:open-vendor-insert", { vendor: targetVendor });
      });
      const searchInput = this.container.querySelector("#palette-search-input");
      const clearBtn = this.container.querySelector("#btn-clear-palette-search");
      searchInput?.addEventListener("input", (e) => {
        this.searchQuery = e.target.value || "";
        if (clearBtn) clearBtn.style.display = this.searchQuery ? "block" : "none";
        this.renderCatalogLists();
      });
      clearBtn?.addEventListener("click", () => {
        this.searchQuery = "";
        if (searchInput) {
          searchInput.value = "";
          searchInput.focus();
        }
        clearBtn.style.display = "none";
        this.renderCatalogLists();
      });
      const filterButtons = this.container.querySelectorAll(".btn-palette-filter");
      filterButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          this.activeFilter = btn.getAttribute("data-filter") || "all";
          filterButtons.forEach((b) => {
            const active = b.getAttribute("data-filter") === this.activeFilter;
            b.style.borderColor = active ? "var(--accent-blue)" : "var(--border-color)";
            b.style.background = active ? "var(--accent-blue)" : "var(--bg-primary)";
            b.style.color = active ? "var(--text-inverse)" : "var(--text-secondary)";
          });
          this.renderCatalogLists();
        });
      });
      this.container.querySelector("#toggle-multi-place")?.addEventListener("change", (e) => {
        this.multiPlaceMode = Boolean(e.target.checked);
      });
      eventBus.on("mode:changed", ({ mode }) => {
        if (mode !== "add-device") {
          this.activeTypeToPlace = null;
          this.activeCustomTemplateToPlace = null;
          this.container.querySelectorAll(".palette-item").forEach((el) => el.classList.remove("active-placement"));
        }
      });
    }
    bindCatalogItemEvents() {
      const deleteBtns = this.container.querySelectorAll(".btn-delete-template");
      deleteBtns.forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const tmplId = btn.getAttribute("data-template-id");
          const tmpl = this.customTemplates.find((t) => t.id === tmplId);
          const name = tmpl?.name || "ini";
          if (confirm(`Hapus template perangkat kustom "${name}" dari Library?`)) {
            this.removeCustomTemplate(tmplId);
          }
        });
        btn.addEventListener("mouseenter", () => {
          btn.style.color = "#dc2626";
        });
        btn.addEventListener("mouseleave", () => {
          btn.style.color = "var(--text-muted)";
        });
      });
      const items = this.container.querySelectorAll(".palette-item");
      items.forEach((itemEl) => {
        itemEl.addEventListener("dragstart", (e) => {
          itemEl.classList.add("dragging");
          const customTmplId = itemEl.getAttribute("data-custom-template-id");
          let payload;
          if (customTmplId) {
            const tmpl = this.customTemplates.find((t) => t.id === customTmplId);
            payload = JSON.stringify({ isCustom: true, ...tmpl });
          } else {
            const type = itemEl.getAttribute("data-device-type");
            const category = itemEl.getAttribute("data-category");
            payload = JSON.stringify({ type, category });
          }
          e.dataTransfer.setData("text/plain", payload);
          e.dataTransfer.setData("application/json", payload);
          e.dataTransfer.effectAllowed = "copy";
        });
        itemEl.addEventListener("dragend", () => {
          itemEl.classList.remove("dragging");
        });
        itemEl.addEventListener("click", () => {
          const customTmplId = itemEl.getAttribute("data-custom-template-id");
          if (customTmplId) {
            const tmpl = this.customTemplates.find((t) => t.id === customTmplId);
            this.activeCustomTemplateToPlace = tmpl;
            this.activeTypeToPlace = tmpl.type || "custom";
            stateManager.setMode("add-device");
            this.container.querySelectorAll(".palette-item").forEach((el) => el.classList.remove("active-placement"));
            itemEl.classList.add("active-placement");
            eventBus.emit("palette:selected-to-place", {
              type: this.activeTypeToPlace,
              customDeviceData: tmpl
            });
          } else {
            const type = itemEl.getAttribute("data-device-type");
            this.activeCustomTemplateToPlace = null;
            this.activeTypeToPlace = type;
            stateManager.setMode("add-device");
            this.container.querySelectorAll(".palette-item").forEach((el) => el.classList.remove("active-placement"));
            itemEl.classList.add("active-placement");
            eventBus.emit("palette:selected-to-place", { type });
          }
        });
      });
    }
  };
  function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  // js/ui/properties-panel.js
  var PropertiesPanel = class {
    /**
     * @param {HTMLElement} container 
     * @param {import('../devices/device-manager.js').DeviceManager} deviceManager 
     */
    constructor(container, deviceManager) {
      this.container = container;
      this.deviceManager = deviceManager;
      this.currentDevice = null;
      this.renderEmpty();
      this.bindEvents();
    }
    renderEmpty() {
      this.container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <i data-lucide="mouse-pointer-click" style="width: 22px; height: 22px;"></i>
        </div>
        <div class="empty-state-text">Belum ada perangkat terpilih</div>
        <div class="empty-state-hint">
          Klik salah satu marker perangkat pada denah atau drag perangkat dari panel kiri untuk membuka konfigurasi teknis.
        </div>
      </div>
    `;
      if (window.lucide) window.lucide.createIcons();
    }
    /**
     * Render the form for the selected device
     * @param {Object} device 
     */
    renderDeviceForm(device) {
      this.currentDevice = device;
      const cat = DEVICE_CATEGORIES[device.category] || DEVICE_CATEGORIES.core;
      const statusDef = DEVICE_STATUSES[device.status] || DEVICE_STATUSES.unknown;
      const cov = device.wirelessCoverage || null;
      const radiusMeters = cov?.radiusMeters || 25;
      const radiusPixels = metersToPixels(radiusMeters);
      const areaM2 = calculateCoverageArea(radiusMeters);
      if (!stateManager.getState().ui.rightSidebarOpen) {
        stateManager.toggleSidebar("right");
      }
      this.container.innerHTML = `
      <div class="properties-form-wrapper" style="display: flex; flex-direction: column; gap: 14px;">
        
        <!-- Header Info Card -->
        <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
            <div style="flex: 1;">
              <div style="font-size: 10px; font-weight: 700; color: ${cat.color}; text-transform: uppercase; font-family: var(--font-mono);">
                ${cat.name}
              </div>
              <input type="text" id="prop-device-name" value="${this.escapeHtml(device.name)}" 
                     style="background: transparent; border: 1px solid transparent; border-radius: 4px; color: var(--text-primary); font-size: 15px; font-weight: 700; width: 100%; padding: 2px 4px; margin-top: 2px;"
                     onfocus="this.style.borderColor='var(--border-focus)'; this.style.backgroundColor='var(--bg-tertiary)';"
                     onblur="this.style.borderColor='transparent'; this.style.backgroundColor='transparent';">
            </div>
            <button id="btn-prop-close" class="btn btn-icon btn-sm" title="Tutup / Batalkan Seleksi">
              <i data-lucide="x" style="width: 14px; height: 14px;"></i>
            </button>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px;">
            <span style="font-family: var(--font-mono); color: var(--text-muted); cursor: pointer;" id="btn-copy-id" title="Klik untuk salin ID">
              ID: ${device.id} \u{1F4CB}
            </span>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${statusDef.color};"></span>
              <select id="prop-status" style="background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 2px 6px;">
                <option value="online" ${device.status === "online" ? "selected" : ""}>Online</option>
                <option value="offline" ${device.status === "offline" ? "selected" : ""}>Offline</option>
                <option value="warning" ${device.status === "warning" ? "selected" : ""}>Warning</option>
                <option value="unknown" ${device.status === "unknown" ? "selected" : ""}>Unknown</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Section: Ikon & Tampilan Marker -->
        <div class="panel-section">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <span class="section-label" style="margin-bottom: 0;">Ikon & Gambar Perangkat</span>
            <span style="font-size: 10px; color: var(--text-muted); font-weight: 600;">Kustomisasi Marker</span>
          </div>

          <div class="info-card" style="display: flex; flex-direction: column; gap: 12px;">
            <!-- Live Marker Preview & Style Selector -->
            <div style="display: flex; align-items: center; gap: 12px; background: var(--bg-tertiary); padding: 10px; border-radius: 6px; border: 1px solid var(--border-color);">
              <div id="prop-marker-preview" style="width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; background: #18350d; border: 2px solid ${cat.color}; border-radius: ${device.markerStyle === "circle" ? "50%" : device.markerStyle === "icon-only" ? "4px" : "10px"}; position: relative; flex-shrink: 0; box-shadow: 0 4px 10px rgba(0,0,0,0.35);">
                ${device.customImage ? `<img src="${device.customImage}" style="width: 32px; height: 32px; object-fit: contain; border-radius: 4px;" alt="Custom">` : `<div style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">${getDeviceIconSvg(device.customIcon || getDefaultIconForType(device.type), { color: cat.color, size: 28 })}</div>`}
                <span style="position: absolute; top: -3px; right: -3px; width: 10px; height: 10px; border-radius: 50%; background-color: ${statusDef.color}; border: 2px solid #18350d;"></span>
              </div>

              <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">Bentuk / Desain Marker</label>
                <select id="prop-marker-style" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 12px; padding: 5px 8px; width: 100%;">
                  <option value="rounded" ${(device.markerStyle || "rounded") === "rounded" ? "selected" : ""}>Kotak Melengkung (Default)</option>
                  <option value="circle" ${device.markerStyle === "circle" ? "selected" : ""}>Lingkaran / Badge Bulat</option>
                  <option value="icon-only" ${device.markerStyle === "icon-only" ? "selected" : ""}>Ikon Melayang (Tanpa Bingkai)</option>
                </select>
                <span style="font-size: 10px; color: var(--text-muted);">Ubah bentuk card perangkat pada denah</span>
              </div>
            </div>

            <!-- Icon Picker Gallery -->
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">Pilih Ikon Vektor Jaringan</label>
                <span style="font-size: 10px; color: var(--text-muted);">18+ Ikon Tersedia</span>
              </div>
              <div id="prop-icon-gallery" style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; max-height: 140px; overflow-y: auto; padding: 6px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px;">
                ${Object.keys(NETWORK_ICON_DEFS).map((key) => {
        const def = NETWORK_ICON_DEFS[key];
        const isCurrent = !device.customImage && (device.customIcon || getDefaultIconForType(device.type)) === key;
        return `
                    <button type="button" class="btn-icon-choice ${isCurrent ? "active" : ""}" 
                            data-icon-key="${key}" title="${def.name}"
                            style="display: flex; align-items: center; justify-content: center; width: 100%; aspect-ratio: 1; border-radius: 5px; border: 1px solid ${isCurrent ? "var(--accent-sky)" : "transparent"}; background: ${isCurrent ? "rgba(118, 196, 87, 0.25)" : "var(--bg-primary)"}; cursor: pointer; padding: 4px; transition: all 120ms ease;">
                      <div style="width: 22px; height: 22px; pointer-events: none; display: flex; align-items: center; justify-content: center;">
                        ${getDeviceIconSvg(key, { color: isCurrent ? "var(--accent-moss)" : "var(--text-primary)", size: 20 })}
                      </div>
                    </button>
                  `;
      }).join("")}
              </div>
            </div>

            <!-- Insert Custom Image / File Upload -->
            <div style="display: flex; flex-direction: column; gap: 6px; border-top: 1px dashed var(--border-color); padding-top: 10px;">
              <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">
                Atau Masukkan Gambar / Foto Sendiri
              </label>

              <div style="display: flex; gap: 6px;">
                <input type="file" id="prop-file-input" accept="image/png,image/jpeg,image/svg+xml,image/webp" style="display: none;">
                <button type="button" id="btn-trigger-upload" class="btn btn-secondary btn-sm" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;">
                  <i data-lucide="upload" style="width: 13px; height: 13px;"></i>
                  <span>Unggah File Gambar...</span>
                </button>
                ${device.customImage ? `
                  <button type="button" id="btn-remove-custom-img" class="btn btn-sm" style="background: rgba(239, 68, 68, 0.15); color: var(--status-offline); border: 1px solid rgba(239, 68, 68, 0.3); padding: 4px 8px;" title="Hapus Gambar Kustom & Kembali ke Ikon">
                    <i data-lucide="trash" style="width: 13px; height: 13px;"></i>
                  </button>
                ` : ""}
              </div>

              <!-- Custom URL -->
              <div style="display: flex; gap: 6px; margin-top: 2px;">
                <input type="text" id="prop-image-url" placeholder="Atau URL gambar (https://...)" 
                       value="${device.customImage && !device.customImage.startsWith("data:") ? this.escapeHtml(device.customImage) : ""}"
                       style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 11px; padding: 4px 8px; flex: 1;">
                <button type="button" id="btn-apply-img-url" class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 4px 8px;">
                  Terapkan
                </button>
              </div>
              <span style="font-size: 10px; color: var(--text-muted);">Mendukung file PNG, JPG, SVG, WebP. Tersimpan otomatis di IndexedDB.</span>
            </div>

          </div>
        </div>

        <!-- Section: Area Cakupan Nirkabel (Wi-Fi) -->
        <div class="panel-section">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <span class="section-label" style="margin-bottom: 0;">Area Cakupan Nirkabel</span>
            <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; cursor: pointer; color: var(--accent-moss); font-weight: 600;">
              <input type="checkbox" id="prop-coverage-enable" ${cov?.enabled ? "checked" : ""} style="accent-color: var(--accent-blue);">
              <span>Aktif</span>
            </label>
          </div>

          <div id="prop-coverage-controls" class="info-card" style="display: ${cov?.enabled ? "flex" : "none"}; flex-direction: column; gap: 10px;">
            
            <!-- Real-Time Metrics Highlight Box -->
            <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div style="display: flex; flex-direction: column;">
                <span style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Jarak / Radius</span>
                <span id="metric-radius-val" style="font-size: 16px; font-weight: 700; color: ${cov?.color || "#76c457"}; font-family: var(--font-mono);">
                  ${radiusMeters} m
                </span>
                <span id="metric-pixels-val" style="font-size: 10px; color: var(--text-muted);">
                  \u2248 ${Math.round(radiusPixels)} px di denah
                </span>
              </div>
              <div style="display: flex; flex-direction: column;">
                <span style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Luas Area Cakupan</span>
                <span id="metric-area-val" style="font-size: 16px; font-weight: 700; color: var(--text-primary); font-family: var(--font-mono);">
                  ${formatCoverageArea(areaM2)}
                </span>
                <span id="metric-diameter-val" style="font-size: 10px; color: var(--text-muted);">
                  Diameter: ${radiusMeters * 2} m
                </span>
              </div>
            </div>

            <!-- Radius Slider & Input -->
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">Atur Jarak Jangkauan (Radius)</label>
                <div style="display: flex; align-items: center; gap: 4px;">
                  <input type="number" id="prop-coverage-meters-input" min="5" max="150" value="${radiusMeters}"
                         style="width: 55px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 11px; padding: 2px 4px; text-align: right; font-family: var(--font-mono);">
                  <span style="font-size: 11px; color: var(--text-muted);">Meter</span>
                </div>
              </div>
              <input type="range" id="prop-coverage-radius-slider" min="5" max="150" step="1" value="${radiusMeters}" 
                     style="width: 100%; accent-color: var(--accent-blue); cursor: pointer;">
              <div style="display: flex; justify-content: space-between; font-size: 9px; color: var(--text-muted);">
                <span>5m</span>
                <span>25m (AP)</span>
                <span>50m (Outdoor)</span>
                <span>150m (PtP)</span>
              </div>
            </div>

            <!-- Quick Presets -->
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">Preset Cepat Jangkauan</label>
              <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px;">
                <button type="button" class="btn btn-secondary btn-sm btn-preset-cov" data-meters="15" data-band="5ghz" title="Indoor 15m (Luas: 707 m\xB2)" style="font-size: 10px; padding: 4px 6px; justify-content: flex-start;">
                  \u{1F3E2} Indoor 15m
                </button>
                <button type="button" class="btn btn-secondary btn-sm btn-preset-cov" data-meters="25" data-band="dual-band" title="Standar AP 25m (Luas: 1.964 m\xB2)" style="font-size: 10px; padding: 4px 6px; justify-content: flex-start;">
                  \u{1F4F6} Standar AP 25m
                </button>
                <button type="button" class="btn btn-secondary btn-sm btn-preset-cov" data-meters="40" data-band="dual-band" title="Gedung 40m (Luas: 5.027 m\xB2)" style="font-size: 10px; padding: 4px 6px; justify-content: flex-start;">
                  \u{1F3DB} Gedung 40m
                </button>
                <button type="button" class="btn btn-secondary btn-sm btn-preset-cov" data-meters="60" data-band="2.4ghz" title="Outdoor 60m (Luas: 11.310 m\xB2)" style="font-size: 10px; padding: 4px 6px; justify-content: flex-start;">
                  \u{1F333} Outdoor 60m
                </button>
                <button type="button" class="btn btn-secondary btn-sm btn-preset-cov" data-meters="100" data-band="ptp" title="PtP Wireless Bridge 100m (Luas: 31.416 m\xB2)" style="grid-column: span 2; font-size: 10px; padding: 4px 6px; justify-content: center;">
                  \u{1F4E1} PtP Wireless Bridge 100m
                </button>
              </div>
            </div>

            <!-- Band & Visual Options -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 11px; color: var(--text-muted);">Frekuensi / Band</label>
                <select id="prop-coverage-band" style="background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 4px 6px;">
                  <option value="dual-band" ${(cov?.band || "dual-band") === "dual-band" ? "selected" : ""}>Dual-Band (2.4 + 5G)</option>
                  <option value="5ghz" ${cov?.band === "5ghz" ? "selected" : ""}>5 GHz High-Speed</option>
                  <option value="2.4ghz" ${cov?.band === "2.4ghz" ? "selected" : ""}>2.4 GHz Wide Range</option>
                  <option value="ptp" ${cov?.band === "ptp" ? "selected" : ""}>PtP Wireless Link</option>
                </select>
              </div>

              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 11px; color: var(--text-muted);">Warna Sinyal</label>
                <div style="display: flex; gap: 4px; align-items: center; margin-top: 2px;">
                  ${["#76c457", "#06b6d4", "#f59e0b", "#2a7c13", "#a855f7"].map((c) => `
                    <button type="button" class="btn-cov-color ${(cov?.color || "#76c457") === c ? "active" : ""}" data-color="${c}"
                            style="width: 20px; height: 20px; border-radius: 50%; background: ${c}; border: 2px solid ${(cov?.color || "#76c457") === c ? "var(--text-primary)" : "transparent"}; cursor: pointer; padding: 0;"></button>
                  `).join("")}
                </div>
              </div>
            </div>

            <!-- Toggles: Hatching & Label -->
            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed var(--border-color); padding-top: 8px;">
              <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; cursor: pointer;">
                <input type="checkbox" id="prop-coverage-hatch" ${cov?.hatch !== false ? "checked" : ""} style="accent-color: var(--accent-blue);">
                <span>Arsiran Diagonal</span>
              </label>
              <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; cursor: pointer;">
                <input type="checkbox" id="prop-coverage-label" ${cov?.showLabel !== false ? "checked" : ""} style="accent-color: var(--accent-blue);">
                <span>Label di Denah</span>
              </label>
            </div>

          </div>
        </div>

        <!-- Section: Identitas & Hardware -->
        <div class="panel-section">
          <span class="section-label">Identitas Perangkat</span>
          <div class="info-card" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);">Merek / Brand</label>
              <input type="text" id="prop-brand" value="${this.escapeHtml(device.brand || "")}" placeholder="Cisco, MikroTik..."
                     style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 12px; padding: 5px 8px;">
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);">Model</label>
              <input type="text" id="prop-model" value="${this.escapeHtml(device.model || "")}" placeholder="RB4011, SG300..."
                     style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 12px; padding: 5px 8px;">
            </div>
            <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);">Lokasi Fisik / Ruangan</label>
              <input type="text" id="prop-location" value="${this.escapeHtml(device.location || "")}" placeholder="Gedung Utama Lt. 2 Ruang Server..."
                     style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 12px; padding: 5px 8px;">
            </div>
          </div>
        </div>

        <!-- Section: Konfigurasi Jaringan -->
        <div class="panel-section">
          <span class="section-label">Konfigurasi Jaringan</span>
          <div class="info-card" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);">IP Address</label>
              <input type="text" id="prop-ip" value="${this.escapeHtml(device.network?.ip || "")}" placeholder="192.168.1.1"
                     style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 12px; padding: 5px 8px; font-family: var(--font-mono);">
              <span id="ip-error" style="color: var(--status-offline); font-size: 10px; display: none;">Format IPv4 tidak valid</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);">Subnet</label>
              <input type="text" id="prop-subnet" value="${this.escapeHtml(device.network?.subnet || "255.255.255.0")}" placeholder="255.255.255.0"
                     style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 12px; padding: 5px 8px; font-family: var(--font-mono);">
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);">VLAN ID</label>
              <input type="number" id="prop-vlan" min="1" max="4094" value="${device.network?.vlan || 1}"
                     style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 12px; padding: 5px 8px; font-family: var(--font-mono);">
            </div>
            <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);">MAC Address</label>
              <input type="text" id="prop-mac" value="${this.escapeHtml(device.network?.mac || "")}" placeholder="00:1A:2B:3C:4D:5E"
                     style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 12px; padding: 5px 8px; font-family: var(--font-mono);">
              <span id="mac-error" style="color: var(--status-offline); font-size: 10px; display: none;">Format MAC tidak valid</span>
            </div>
            <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);">Hostname</label>
              <input type="text" id="prop-hostname" value="${this.escapeHtml(device.network?.hostname || "")}" placeholder="router-core.campus.net"
                     style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 12px; padding: 5px 8px;">
            </div>
          </div>
        </div>

        <!-- Section: Operasional & Koordinat -->
        <div class="panel-section">
          <span class="section-label">Operasional & Lokasi Peta</span>
          <div class="info-card" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);">Firmware</label>
              <input type="text" id="prop-firmware" value="${this.escapeHtml(device.firmware || "")}" placeholder="v7.12..."
                     style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 12px; padding: 5px 8px;">
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);">Tgl Instalasi</label>
              <input type="date" id="prop-installed" value="${device.installedAt || ""}"
                     style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 12px; padding: 5px 8px;">
            </div>
            <div style="grid-column: span 2; font-size: 11px; color: var(--text-muted); background: var(--bg-secondary); padding: 6px; border-radius: 4px; font-family: var(--font-mono);">
              Koordinat: X=${formatDecimals(device.position.x, 4)}, Y=${formatDecimals(device.position.y, 4)}
            </div>
            <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);">Catatan Teknis</label>
              <textarea id="prop-notes" rows="2" placeholder="Catatan maintenance, konfigurasi port, atau riwayat..."
                        style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 12px; padding: 5px 8px; resize: vertical;">${this.escapeHtml(device.notes || "")}</textarea>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 4px;">
          <button id="btn-save-device" class="btn btn-primary" style="width: 100%;">
            <i data-lucide="check" style="width: 15px; height: 15px;"></i>
            <span>Simpan Perubahan</span>
          </button>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <button id="btn-center-device" class="btn btn-secondary btn-sm" title="Pusatkan Kamera ke Perangkat Ini">
              <i data-lucide="crosshair" style="width: 13px; height: 13px;"></i>
              <span>Pusatkan</span>
            </button>
            <button id="btn-duplicate-device" class="btn btn-secondary btn-sm" title="Duplikasi Perangkat">
              <i data-lucide="copy" style="width: 13px; height: 13px;"></i>
              <span>Duplikasi</span>
            </button>
          </div>

          <button id="btn-delete-device" class="btn btn-sm" style="background-color: rgba(239, 68, 68, 0.15); color: var(--status-offline); border: 1px solid rgba(239, 68, 68, 0.3); width: 100%;">
            <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
            <span>Hapus Perangkat</span>
          </button>
        </div>

      </div>
    `;
      if (window.lucide) window.lucide.createIcons();
      this.bindFormHandlers();
    }
    bindFormHandlers() {
      if (!this.currentDevice) return;
      const devId = this.currentDevice.id;
      document.getElementById("btn-prop-close")?.addEventListener("click", () => {
        this.deviceManager.deselectDevice();
      });
      document.getElementById("btn-copy-id")?.addEventListener("click", () => {
        navigator.clipboard.writeText(devId).then(() => {
          alert(`ID "${devId}" berhasil disalin ke clipboard`);
        });
      });
      document.getElementById("btn-center-device")?.addEventListener("click", () => {
        eventBus.emit("viewport:center-on", this.currentDevice.position);
      });
      document.getElementById("prop-marker-style")?.addEventListener("change", (e) => {
        const style = e.target.value;
        this.currentDevice.markerStyle = style;
        const updated = this.deviceManager.updateDevice(devId, { markerStyle: style });
        if (updated) this.renderDeviceForm(updated);
      });
      const iconButtons = this.container.querySelectorAll(".btn-icon-choice");
      iconButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const iconKey = btn.dataset.iconKey;
          this.currentDevice.customIcon = iconKey;
          this.currentDevice.customImage = "";
          const updated = this.deviceManager.updateDevice(devId, { customIcon: iconKey, customImage: "" });
          if (updated) this.renderDeviceForm(updated);
        });
      });
      const fileInput = document.getElementById("prop-file-input");
      const uploadBtn = document.getElementById("btn-trigger-upload");
      if (uploadBtn && fileInput) {
        uploadBtn.addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > 3 * 1024 * 1024) {
            alert("Ukuran berkas terlalu besar. Silakan pilih gambar di bawah 3MB.");
            return;
          }
          const reader = new FileReader();
          reader.onload = (loadEvt) => {
            const dataUrl = loadEvt.target.result;
            this.currentDevice.customImage = dataUrl;
            const updated = this.deviceManager.updateDevice(devId, { customImage: dataUrl });
            if (updated) this.renderDeviceForm(updated);
          };
          reader.readAsDataURL(file);
        });
      }
      document.getElementById("btn-remove-custom-img")?.addEventListener("click", () => {
        this.currentDevice.customImage = "";
        const updated = this.deviceManager.updateDevice(devId, { customImage: "" });
        if (updated) this.renderDeviceForm(updated);
      });
      document.getElementById("btn-apply-img-url")?.addEventListener("click", () => {
        const urlInput = document.getElementById("prop-image-url");
        const url = urlInput?.value.trim();
        if (!url) return;
        this.currentDevice.customImage = url;
        const updated = this.deviceManager.updateDevice(devId, { customImage: url });
        if (updated) this.renderDeviceForm(updated);
      });
      const covEnable = document.getElementById("prop-coverage-enable");
      const covControls = document.getElementById("prop-coverage-controls");
      covEnable?.addEventListener("change", (e) => {
        const isEnabled = e.target.checked;
        if (covControls) covControls.style.display = isEnabled ? "flex" : "none";
        const currentCov = this.currentDevice.wirelessCoverage || {
          radiusMeters: 25,
          color: "#76c457",
          opacity: 0.18,
          hatch: true,
          band: "dual-band",
          showLabel: true
        };
        this.currentDevice.wirelessCoverage = {
          ...currentCov,
          enabled: isEnabled
        };
        this.deviceManager.updateDevice(devId, { wirelessCoverage: this.currentDevice.wirelessCoverage });
      });
      const covSlider = document.getElementById("prop-coverage-radius-slider");
      const covMetersInput = document.getElementById("prop-coverage-meters-input");
      const updateMetricsDisplay = (meters) => {
        const radiusPx = metersToPixels(meters);
        const area = calculateCoverageArea(meters);
        const metricRadius = document.getElementById("metric-radius-val");
        const metricPixels = document.getElementById("metric-pixels-val");
        const metricArea = document.getElementById("metric-area-val");
        const metricDiameter = document.getElementById("metric-diameter-val");
        if (metricRadius) metricRadius.textContent = `${meters} m`;
        if (metricPixels) metricPixels.textContent = `\u2248 ${Math.round(radiusPx)} px di denah`;
        if (metricArea) metricArea.textContent = formatCoverageArea(area);
        if (metricDiameter) metricDiameter.textContent = `Diameter: ${meters * 2} m`;
      };
      const handleRadiusChange = (meters) => {
        const validMeters = clamp(parseInt(meters, 10) || 25, 5, 150);
        if (covSlider) covSlider.value = validMeters;
        if (covMetersInput) covMetersInput.value = validMeters;
        updateMetricsDisplay(validMeters);
        if (!this.currentDevice.wirelessCoverage) {
          this.currentDevice.wirelessCoverage = { enabled: true, color: "#76c457", opacity: 0.18, hatch: true, band: "dual-band", showLabel: true };
        }
        this.currentDevice.wirelessCoverage.radiusMeters = validMeters;
        this.deviceManager.updateDevice(devId, { wirelessCoverage: this.currentDevice.wirelessCoverage });
      };
      covSlider?.addEventListener("input", (e) => handleRadiusChange(e.target.value));
      covMetersInput?.addEventListener("change", (e) => handleRadiusChange(e.target.value));
      this.container.querySelectorAll(".btn-preset-cov").forEach((btn) => {
        btn.addEventListener("click", () => {
          const meters = parseInt(btn.dataset.meters, 10);
          const band = btn.dataset.band;
          if (!this.currentDevice.wirelessCoverage) {
            this.currentDevice.wirelessCoverage = { enabled: true, color: "#76c457", opacity: 0.18, hatch: true, band: "dual-band", showLabel: true };
          }
          this.currentDevice.wirelessCoverage.enabled = true;
          this.currentDevice.wirelessCoverage.radiusMeters = meters;
          if (band) this.currentDevice.wirelessCoverage.band = band;
          const updated = this.deviceManager.updateDevice(devId, { wirelessCoverage: this.currentDevice.wirelessCoverage });
          if (updated) this.renderDeviceForm(updated);
        });
      });
      document.getElementById("prop-coverage-band")?.addEventListener("change", (e) => {
        if (!this.currentDevice.wirelessCoverage) return;
        this.currentDevice.wirelessCoverage.band = e.target.value;
        this.deviceManager.updateDevice(devId, { wirelessCoverage: this.currentDevice.wirelessCoverage });
      });
      this.container.querySelectorAll(".btn-cov-color").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (!this.currentDevice.wirelessCoverage) return;
          const color = btn.dataset.color;
          this.currentDevice.wirelessCoverage.color = color;
          const updated = this.deviceManager.updateDevice(devId, { wirelessCoverage: this.currentDevice.wirelessCoverage });
          if (updated) this.renderDeviceForm(updated);
        });
      });
      document.getElementById("prop-coverage-hatch")?.addEventListener("change", (e) => {
        if (!this.currentDevice.wirelessCoverage) return;
        this.currentDevice.wirelessCoverage.hatch = e.target.checked;
        this.deviceManager.updateDevice(devId, { wirelessCoverage: this.currentDevice.wirelessCoverage });
      });
      document.getElementById("prop-coverage-label")?.addEventListener("change", (e) => {
        if (!this.currentDevice.wirelessCoverage) return;
        this.currentDevice.wirelessCoverage.showLabel = e.target.checked;
        this.deviceManager.updateDevice(devId, { wirelessCoverage: this.currentDevice.wirelessCoverage });
      });
      document.getElementById("btn-duplicate-device")?.addEventListener("click", () => {
        this.deviceManager.duplicateDevice(devId);
      });
      document.getElementById("btn-delete-device")?.addEventListener("click", () => {
        if (confirm(`Yakin ingin menghapus perangkat "${this.currentDevice.name}"?`)) {
          this.deviceManager.deleteDevice(devId);
        }
      });
      document.getElementById("btn-save-device")?.addEventListener("click", () => {
        this.saveForm(devId);
      });
    }
    saveForm(devId) {
      const nameInput = document.getElementById("prop-device-name");
      const brandInput = document.getElementById("prop-brand");
      const modelInput = document.getElementById("prop-model");
      const locInput = document.getElementById("prop-location");
      const statusSelect = document.getElementById("prop-status");
      const ipInput = document.getElementById("prop-ip");
      const subnetInput = document.getElementById("prop-subnet");
      const vlanInput = document.getElementById("prop-vlan");
      const macInput = document.getElementById("prop-mac");
      const hostnameInput = document.getElementById("prop-hostname");
      const fwInput = document.getElementById("prop-firmware");
      const installedInput = document.getElementById("prop-installed");
      const notesInput = document.getElementById("prop-notes");
      const ip = ipInput?.value.trim() || "";
      const mac = macInput?.value.trim() || "";
      const vlan = vlanInput?.value ? parseInt(vlanInput.value, 10) : 1;
      let hasError = false;
      const ipError = document.getElementById("ip-error");
      if (!validateIp(ip)) {
        if (ipError) ipError.style.display = "block";
        hasError = true;
      } else {
        if (ipError) ipError.style.display = "none";
      }
      const macError = document.getElementById("mac-error");
      if (!validateMac(mac)) {
        if (macError) macError.style.display = "block";
        hasError = true;
      } else {
        if (macError) macError.style.display = "none";
      }
      if (hasError) return;
      const styleSelect = document.getElementById("prop-marker-style");
      const markerStyle = styleSelect ? styleSelect.value : this.currentDevice.markerStyle || "rounded";
      const updates = {
        name: nameInput?.value.trim() || "Unnamed Device",
        brand: brandInput?.value.trim() || "",
        model: modelInput?.value.trim() || "",
        location: locInput?.value.trim() || "",
        status: statusSelect?.value || "unknown",
        customIcon: this.currentDevice.customIcon,
        customImage: this.currentDevice.customImage,
        markerStyle,
        wirelessCoverage: this.currentDevice.wirelessCoverage,
        network: {
          ip,
          subnet: subnetInput?.value.trim() || "255.255.255.0",
          vlan,
          mac,
          hostname: hostnameInput?.value.trim() || ""
        },
        firmware: fwInput?.value.trim() || "",
        installedAt: installedInput?.value || "",
        notes: notesInput?.value.trim() || ""
      };
      const updated = this.deviceManager.updateDevice(devId, updates);
      if (updated) {
        this.renderDeviceForm(updated);
      }
    }
    bindEvents() {
      eventBus.on("device:selected", (device) => {
        this.renderDeviceForm(device);
      });
      eventBus.on("device:deselected", () => {
        this.currentDevice = null;
        this.renderEmpty();
      });
      eventBus.on("device:deleted", ({ deviceId }) => {
        if (this.currentDevice?.id === deviceId) {
          this.currentDevice = null;
          this.renderEmpty();
        }
      });
      eventBus.on("device:moved", ({ deviceId, position }) => {
        if (this.currentDevice?.id === deviceId) {
          this.currentDevice.position = position;
          const coordEl = this.container.querySelector('[style*="Koordinat:"]');
          if (coordEl) {
            coordEl.textContent = `Koordinat: X=${formatDecimals(position.x, 4)}, Y=${formatDecimals(position.y, 4)}`;
          }
        }
      });
    }
    escapeHtml(str) {
      if (!str) return "";
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
  };

  // js/connections/cable-schema.js
  var CableSchema = {
    /**
     * Factory function to create a validated cable connection object
     * @param {Object} params 
     * @returns {Object}
     */
    create(params = {}) {
      const id = params.id || generateId("cab");
      return {
        id,
        name: params.name || "New Cable Link",
        source: params.source,
        // Device ID sumber (wajib)
        destination: params.destination,
        // Device ID tujuan (wajib)
        type: params.type || "ethernet",
        // ethernet, fiber, wireless, coaxial
        cableCategory: params.cableCategory || "cat6",
        // cat5e, cat6, cat6a, fiber-sm, fiber-mm, wireless-link, coaxial
        customColor: params.customColor || "",
        // Hex warna custom (opsional, jika kosong gunakan warna standar tipe kabel)
        status: params.status || "active",
        // active, damaged, inactive, maintenance
        route: Array.isArray(params.route) ? params.route : [],
        // Array [{x, y}] (0.0000 - 1.0000)
        length: typeof params.length === "number" ? params.length : 0,
        // Dalam meter
        lengthMode: params.lengthMode || "auto",
        // auto | manual
        details: {
          // Universal port endpoints
          portSource: params.details?.portSource || "",
          portDestination: params.details?.portDestination || "",
          jacketType: params.details?.jacketType || "indoor-pvc",
          // Accurate physical measurement fields (real-world network installation)
          horizontalLength: typeof params.details?.horizontalLength === "number" ? params.details.horizontalLength : typeof params.length === "number" ? params.length : 0,
          verticalDropSource: typeof params.details?.verticalDropSource === "number" ? params.details.verticalDropSource : 1.5,
          verticalDropDest: typeof params.details?.verticalDropDest === "number" ? params.details.verticalDropDest : 1.5,
          serviceLoopMeters: typeof params.details?.serviceLoopMeters === "number" ? params.details.serviceLoopMeters : 2,
          slackMarginPercent: typeof params.details?.slackMarginPercent === "number" ? params.details.slackMarginPercent : 5,
          segmentLengths: Array.isArray(params.details?.segmentLengths) ? params.details.segmentLengths : [],
          calculatedMetrics: params.details?.calculatedMetrics || null,
          // Fiber optic details
          fiberCoreCount: params.details?.fiberCoreCount ? Number(params.details.fiberCoreCount) : params.type === "fiber" || params.cableCategory?.startsWith("fiber") ? 12 : 2,
          fiberActiveCores: params.details?.fiberActiveCores || "Core 1-2 (Rx/Tx)",
          connectorSource: params.details?.connectorSource || "LC/UPC",
          connectorDest: params.details?.connectorDest || "LC/UPC",
          wavelength: params.details?.wavelength || (params.cableCategory === "fiber-mm" ? "850/1300nm (OM3)" : "1310/1550nm (OS2)"),
          attenuationDb: typeof params.details?.attenuationDb === "number" ? params.details.attenuationDb : null,
          tubeColor: params.details?.tubeColor || "Biru (Tube 1)",
          // LAN / Twisted Pair details
          shielding: params.details?.shielding || (params.cableCategory === "cat6a" ? "S/FTP" : "U/UTP"),
          wiringStandard: params.details?.wiringStandard || "T568B",
          maxBandwidth: params.details?.maxBandwidth || (params.cableCategory === "cat5e" ? "1 Gbps" : "10 Gbps"),
          poeSupport: params.details?.poeSupport || "poe+",
          // Coaxial details
          coaxType: params.details?.coaxType || "RG-6",
          impedance: params.details?.impedance || "75 Ohm",
          coaxConnector: params.details?.coaxConnector || "BNC Compression",
          isSiamese: Boolean(params.details?.isSiamese),
          // Wireless details
          frequency: params.details?.frequency || "5 GHz",
          channelWidth: params.details?.channelWidth || "40 MHz",
          signalRssi: params.details?.signalRssi || "-58 dBm"
        },
        notes: params.notes || "",
        createdAt: params.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    },
    /**
     * Validate a cable connection object
     * @param {Object} cable 
     * @returns {{isValid: boolean, errors: string[]}}
     */
    validate(cable) {
      const errors = [];
      if (!cable.id) errors.push("Cable ID is required");
      if (!cable.source) errors.push("Source device ID is required");
      if (!cable.destination) errors.push("Destination device ID is required");
      if (cable.source && cable.destination && cable.source === cable.destination) {
        errors.push("Source and destination devices cannot be the same");
      }
      if (cable.route && !Array.isArray(cable.route)) {
        errors.push("Route must be an array of waypoint coordinates");
      }
      if (Array.isArray(cable.route)) {
        for (let i = 0; i < cable.route.length; i++) {
          const pt = cable.route[i];
          if (typeof pt.x !== "number" || typeof pt.y !== "number" || pt.x < 0 || pt.x > 1 || pt.y < 0 || pt.y > 1) {
            errors.push(`Waypoint at index ${i} has invalid normalized coordinates`);
            break;
          }
        }
      }
      return {
        isValid: errors.length === 0,
        errors
      };
    }
  };

  // js/connections/cable-library.js
  var CABLE_CATEGORIES = {
    "cat5e": {
      id: "cat5e",
      name: "UTP Cat5e (1 Gbps)",
      type: "ethernet",
      color: "#3b82f6",
      // Electric Blue
      strokeWidth: 3,
      dash: [],
      description: "Kabel tembaga twisted pair 1 Gbps max 100m"
    },
    "cat6": {
      id: "cat6",
      name: "UTP Cat6 (10 Gbps)",
      type: "ethernet",
      color: "#2563eb",
      // Royal Blue
      strokeWidth: 3.5,
      dash: [],
      description: "Kabel tembaga standar gigabit & 10G jarak pendek"
    },
    "cat6a": {
      id: "cat6a",
      name: "UTP Cat6A (10 Gbps 100m)",
      type: "ethernet",
      color: "#8b5cf6",
      // Violet / Purple
      strokeWidth: 4,
      dash: [],
      description: "Kabel shielded 10 Gbps full 100 meter"
    },
    "fiber-sm": {
      id: "fiber-sm",
      name: "Fiber Optic Single Mode",
      type: "fiber",
      color: "#eab308",
      // Yellow (Standard Singlemode Jacket)
      strokeWidth: 3,
      dash: [],
      description: "Kabel optik jarak jauh antargedung (core 9/125 um)"
    },
    "fiber-mm": {
      id: "fiber-mm",
      name: "Fiber Optic Multi Mode",
      type: "fiber",
      color: "#f97316",
      // Orange (Standard Multimode Jacket)
      strokeWidth: 3,
      dash: [],
      description: "Kabel optik jarak menengah dalam gedung (core 50/125 um)"
    },
    "wireless-link": {
      id: "wireless-link",
      name: "Wireless Link (PtP / PtMP)",
      type: "wireless",
      color: "#06b6d4",
      // Cyan
      strokeWidth: 2.5,
      dash: [8, 6],
      description: "Koneksi nirkabel jarak jauh antar tiang/gedung"
    },
    "coaxial": {
      id: "coaxial",
      name: "Coaxial Cable (RG6/RG11)",
      type: "coaxial",
      color: "#64748b",
      // Slate Gray
      strokeWidth: 3,
      dash: [],
      description: "Kabel tembaga coaxial CCTV analog atau RF"
    }
  };
  var CABLE_STATUSES = {
    active: {
      id: "active",
      name: "Active / Normal",
      color: "#22c55e",
      dash: []
    },
    damaged: {
      id: "damaged",
      name: "Damaged / Cut",
      color: "#ef4444",
      dash: [8, 6]
    },
    maintenance: {
      id: "maintenance",
      name: "Under Maintenance",
      color: "#f59e0b",
      dash: [6, 4]
    },
    inactive: {
      id: "inactive",
      name: "Inactive / Reserved",
      color: "#64748b",
      dash: [4, 4]
    }
  };
  function getCableDefByCategory(category) {
    return CABLE_CATEGORIES[category] || CABLE_CATEGORIES["cat6"];
  }
  function getMediaTypeByCableCategory(category) {
    if (category === "fiber-sm" || category === "fiber-mm") return "fiber";
    if (category === "coaxial") return "coaxial";
    if (category === "wireless-link") return "wireless";
    return "twisted-pair";
  }
  function estimateFiberAttenuation(lengthMeters, fiberType = "sm", connectors = 2, splices = 2) {
    const km = Math.max(0, lengthMeters) / 1e3;
    const alpha = fiberType === "sm" ? 0.35 : 2.5;
    const loss = km * alpha + connectors * 0.5 + splices * 0.1;
    return Math.round(loss * 100) / 100;
  }
  function calculateAccurateCableLength({
    horizontalMeters = 0,
    verticalDropSource = 1.5,
    verticalDropDest = 1.5,
    serviceLoopMeters = 2,
    slackMarginPercent = 5
  } = {}) {
    const horizontal = Math.max(0, Number(horizontalMeters) || 0);
    const vSrc = Math.max(0, Number(verticalDropSource) || 0);
    const vDest = Math.max(0, Number(verticalDropDest) || 0);
    const vTotal = vSrc + vDest;
    const loop = Math.max(0, Number(serviceLoopMeters) || 0);
    const slackPct = Math.max(0, Math.min(30, Number(slackMarginPercent) || 0));
    const subtotal = horizontal + vTotal + loop;
    const slackAmount = subtotal * (slackPct / 100);
    const totalPhysical = Math.round((subtotal + slackAmount) * 10) / 10;
    return {
      horizontalMeters: Math.round(horizontal * 10) / 10,
      verticalTotal: Math.round(vTotal * 10) / 10,
      verticalDropSource: Math.round(vSrc * 10) / 10,
      verticalDropDest: Math.round(vDest * 10) / 10,
      serviceLoopMeters: Math.round(loop * 10) / 10,
      slackMarginPercent: slackPct,
      slackAmount: Math.round(slackAmount * 10) / 10,
      totalPhysical
    };
  }
  function calculateNetworkPerformanceMetrics({
    totalLength = 0,
    horizontalLength: horizontalLength2 = 0,
    category = "cat6",
    poeSupport = "poe+"
  } = {}) {
    const len = Math.max(0, Number(totalLength) || 0);
    const mediaType = getMediaTypeByCableCategory(category);
    let ethernetCompliance = {
      isEthernet: mediaType === "twisted-pair",
      status: "pass",
      // 'pass' | 'warning' | 'exceeded'
      permanentLinkMax: 90,
      channelLinkMax: 100,
      marginMeters: Math.round((100 - len) * 10) / 10,
      badgeText: "Lolos Standar IEEE (Optimal)",
      badgeColor: "var(--status-online, #22c55e)",
      message: `Normal (${len.toFixed(1)}m / maks 100m standar IEEE 802.3).`
    };
    if (mediaType === "twisted-pair") {
      if (len > 100) {
        ethernetCompliance.status = "exceeded";
        ethernetCompliance.badgeText = "Melebihi Batas 100m!";
        ethernetCompliance.badgeColor = "var(--status-offline, #ef4444)";
        ethernetCompliance.message = `Panjang fisik (${len.toFixed(1)}m) melebihi batas 100m IEEE 802.3! Sinyal berisiko degradasi, packet loss tinggi, atau negosiasi link drop ke 100 Mbps.`;
      } else if (len >= 90) {
        ethernetCompliance.status = "warning";
        ethernetCompliance.badgeText = "Mendekati Batas (90-100m)";
        ethernetCompliance.badgeColor = "var(--status-warning, #f59e0b)";
        ethernetCompliance.message = `Panjang fisik (${len.toFixed(1)}m) mendekati batas channel 100m. Melebihi batas Permanent Link (90m). Hindari penambahan patch cord panjang.`;
      }
    }
    let nvp = 0.68;
    if (category === "cat5e") nvp = 0.65;
    if (category === "fiber-sm" || category === "fiber-mm") nvp = 0.67;
    if (category === "coaxial") nvp = 0.82;
    if (category === "wireless-link") nvp = 1;
    const speedMetersPerNs = 0.299792458 * nvp;
    const delayNs = len > 0 ? len / speedMetersPerNs : 0;
    const delayUs = delayNs / 1e3;
    let attenuationDb = 0;
    if (mediaType === "fiber") {
      const fiberType = category === "fiber-mm" ? "mm" : "sm";
      attenuationDb = estimateFiberAttenuation(len, fiberType);
    } else if (mediaType === "twisted-pair") {
      let lossPer100m = 2.1;
      if (category === "cat6") lossPer100m = 1.9;
      if (category === "cat6a") lossPer100m = 1.7;
      attenuationDb = Math.round((len / 100 * lossPer100m + 0.4) * 100) / 100;
    } else if (mediaType === "coaxial") {
      attenuationDb = Math.round((len / 100 * 6.5 + 0.3) * 100) / 100;
    }
    let poeAnalysis = null;
    if (mediaType === "twisted-pair" && poeSupport !== "none") {
      const rPer100m = category === "cat6a" ? 13.5 : category === "cat6" ? 14.5 : 18;
      const totalResistance = Math.round(len / 100 * rPer100m * 10) / 10;
      let psePowerWatts = 15.4;
      let pseVoltage = 48;
      let currentAmps = 0.35;
      if (poeSupport === "poe+") {
        psePowerWatts = 30;
        pseVoltage = 54;
        currentAmps = 0.6;
      } else if (poeSupport === "poe++") {
        psePowerWatts = 60;
        pseVoltage = 54;
        currentAmps = 1.2;
      }
      const voltageDrop = Math.round(currentAmps * totalResistance * 10) / 10;
      const powerLossWatts = Math.round(currentAmps * currentAmps * totalResistance * 10) / 10;
      const deliveredVoltage = Math.max(0, Math.round((pseVoltage - voltageDrop) * 10) / 10);
      const deliveredPowerWatts = Math.max(0, Math.round((psePowerWatts - powerLossWatts) * 10) / 10);
      poeAnalysis = {
        standard: poeSupport,
        totalResistanceOhm: totalResistance,
        voltageDropVolts: voltageDrop,
        deliveredVoltageVolts: deliveredVoltage,
        powerLossWatts,
        deliveredPowerWatts,
        efficiencyPercent: Math.round((psePowerWatts - powerLossWatts) / psePowerWatts * 100)
      };
    }
    return {
      mediaType,
      totalLength: len,
      horizontalLength: Math.round(horizontalLength2 * 10) / 10,
      ethernetCompliance,
      latency: {
        delayNanoseconds: Math.round(delayNs * 10) / 10,
        delayMicroseconds: Math.round(delayUs * 100) / 100,
        nvpPercent: Math.round(nvp * 100)
      },
      attenuationDb,
      poeAnalysis
    };
  }

  // js/connections/cable-renderer.js
  var CableRenderer = class {
    /**
     * @param {Object} options
     * @param {Konva.Layer} options.connectionLayer
     * @param {Konva.Layer} options.interactionLayer
     * @param {number} options.naturalWidth
     * @param {number} options.naturalHeight
     * @param {Function} options.onSelect
     * @param {Function} [options.onContextMenu]
     * @param {Function} options.onWaypointMoved
     * @param {Function} options.onWaypointDeleted
     */
    constructor({
      connectionLayer,
      interactionLayer,
      naturalWidth = 1024,
      naturalHeight = 1024,
      onSelect,
      onContextMenu = null,
      onWaypointMoved,
      onWaypointDeleted
    }) {
      this.connectionLayer = connectionLayer;
      this.interactionLayer = interactionLayer;
      this.naturalWidth = naturalWidth;
      this.naturalHeight = naturalHeight;
      this.onSelect = onSelect;
      this.onContextMenu = onContextMenu;
      this.onWaypointMoved = onWaypointMoved;
      this.onWaypointDeleted = onWaypointDeleted;
      this.selectedCableId = null;
      this.lineMap = /* @__PURE__ */ new Map();
      this.labelMap = /* @__PURE__ */ new Map();
      this.waypointHandles = [];
      this.showDistanceLabels = true;
    }
    /**
     * Calculate exact coordinate (x, y) along polyline midpoint
     * @param {number[]} flatPoints [x0, y0, x1, y1, ...]
     * @returns {{x: number, y: number}}
     */
    calculatePathMidpoint(flatPoints) {
      if (!flatPoints || flatPoints.length < 4) {
        return { x: flatPoints?.[0] || 0, y: flatPoints?.[1] || 0 };
      }
      let totalLength = 0;
      const segLengths = [];
      for (let i = 0; i < flatPoints.length - 2; i += 2) {
        const x1 = flatPoints[i];
        const y1 = flatPoints[i + 1];
        const x2 = flatPoints[i + 2];
        const y2 = flatPoints[i + 3];
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        segLengths.push(len);
        totalLength += len;
      }
      if (totalLength === 0) {
        return { x: flatPoints[0], y: flatPoints[1] };
      }
      const halfDist = totalLength / 2;
      let accumulated = 0;
      for (let i = 0; i < segLengths.length; i++) {
        const segLen = segLengths[i];
        if (accumulated + segLen >= halfDist) {
          const remaining = halfDist - accumulated;
          const ratio = segLen > 0 ? remaining / segLen : 0;
          const pIndex = i * 2;
          const x1 = flatPoints[pIndex];
          const y1 = flatPoints[pIndex + 1];
          const x2 = flatPoints[pIndex + 2];
          const y2 = flatPoints[pIndex + 3];
          return {
            x: x1 + (x2 - x1) * ratio,
            y: y1 + (y2 - y1) * ratio
          };
        }
        accumulated += segLen;
      }
      return {
        x: flatPoints[flatPoints.length - 2],
        y: flatPoints[flatPoints.length - 1]
      };
    }
    /**
     * Render or update a cable polyline on connectionLayer
     * @param {Object} cable 
     * @param {Object} sourceDev 
     * @param {Object} destDev 
     * @returns {Konva.Line|null}
     */
    renderCable(cable, sourceDev, destDev) {
      if (!sourceDev || !destDev) return null;
      const isSelected = this.selectedCableId === cable.id;
      const catDef = getCableDefByCategory(cable.cableCategory);
      const statusDef = CABLE_STATUSES[cable.status] || CABLE_STATUSES.active;
      const flatPoints = this.calculateFlatPixelPoints(cable, sourceDev, destDev);
      let line = this.lineMap.get(cable.id);
      let strokeColor = cable.customColor && cable.customColor.trim() ? cable.customColor.trim() : catDef.color;
      let dashPattern = catDef.dash;
      if (cable.status === "damaged") {
        strokeColor = statusDef.color;
        dashPattern = statusDef.dash;
      } else if (cable.status === "maintenance") {
        strokeColor = statusDef.color;
        dashPattern = statusDef.dash;
      } else if (cable.status === "inactive") {
        dashPattern = statusDef.dash;
      }
      const strokeWidth = isSelected ? catDef.strokeWidth + 2 : catDef.strokeWidth;
      if (!line) {
        line = new Konva.Line({
          id: `cable-${cable.id}`,
          name: "cable-line",
          points: flatPoints,
          stroke: strokeColor,
          strokeWidth,
          dash: dashPattern,
          lineCap: "round",
          lineJoin: "round",
          hitStrokeWidth: 16,
          // Generous hit area for clicking
          shadowColor: isSelected ? "#76c457" : null,
          shadowBlur: isSelected ? 6 : 0,
          perfectDrawEnabled: false,
          opacity: cable.status === "inactive" ? 0.45 : 1
        });
        line.setAttr("baseStrokeWidth", strokeWidth);
        line.setAttr("cableData", cable);
        line.on("click tap", (e) => {
          e.cancelBubble = true;
          if (this.onSelect) {
            this.onSelect(cable.id);
          }
        });
        line.on("contextmenu", (e) => {
          e.evt.preventDefault();
          e.cancelBubble = true;
          const cur = line.getAttr("cableData") || cable;
          if (this.onContextMenu) {
            this.onContextMenu(cur, e.evt.clientX, e.evt.clientY);
          }
        });
        line.on("mouseenter", () => {
          if (line.getStage()?.isDragging()) return;
          document.body.style.cursor = "pointer";
          const currentBase = line.getAttr("baseStrokeWidth") || catDef.strokeWidth;
          line.strokeWidth(currentBase + 1.5);
          this.connectionLayer.batchDraw();
        });
        line.on("mouseleave", () => {
          if (line.getStage()?.isDragging()) return;
          document.body.style.cursor = "default";
          const currentBase = line.getAttr("baseStrokeWidth") || catDef.strokeWidth;
          line.strokeWidth(currentBase);
          this.connectionLayer.batchDraw();
        });
        this.connectionLayer.add(line);
        this.lineMap.set(cable.id, line);
      } else {
        line.setAttr("cableData", cable);
        line.points(flatPoints);
        line.stroke(strokeColor);
        line.strokeWidth(strokeWidth);
        line.setAttr("baseStrokeWidth", strokeWidth);
        line.dash(dashPattern);
        line.shadowColor(isSelected ? "#76c457" : null);
        line.shadowBlur(isSelected ? 6 : 0);
        line.opacity(cable.status === "inactive" ? 0.45 : 1);
      }
      this.renderDistanceBadge(cable, flatPoints, strokeColor, isSelected);
      if (isSelected) {
        this.renderWaypointHandles(cable, sourceDev, destDev);
      }
      return line;
    }
    /**
     * Render or update distance badge on canvas at midpoint of cable
     * @param {Object} cable 
     * @param {number[]} flatPoints 
     * @param {string} strokeColor 
     * @param {boolean} isSelected 
     */
    renderDistanceBadge(cable, flatPoints, strokeColor, isSelected) {
      const mid = this.calculatePathMidpoint(flatPoints);
      const mediaType = getMediaTypeByCableCategory(cable.cableCategory);
      const cableLen = Number(cable.length) || 0;
      const isOverLimit = mediaType === "twisted-pair" && cableLen > 100;
      const labelText = isOverLimit ? `\u26A0\uFE0F ${cableLen.toFixed(1)}m` : `${cableLen.toFixed(1)}m`;
      let badge = this.labelMap.get(cable.id);
      if (!badge) {
        badge = new Konva.Label({
          name: "cable-distance-label",
          listening: false,
          visible: this.showDistanceLabels !== false
        });
        const tag = new Konva.Tag({
          name: "cable-distance-tag",
          fill: isOverLimit ? "rgba(80, 10, 10, 0.94)" : "rgba(20, 36, 14, 0.94)",
          stroke: isOverLimit ? "#ef4444" : strokeColor,
          strokeWidth: isSelected ? 1.5 : 1.1,
          cornerRadius: 4,
          perfectDrawEnabled: false,
          shadowForStrokeEnabled: false
        });
        const text = new Konva.Text({
          name: "cable-distance-text",
          text: labelText,
          fontSize: 10,
          fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
          fontStyle: "600",
          fill: isOverLimit ? "#fca5a5" : "#fff8cf",
          padding: 3,
          align: "center",
          perfectDrawEnabled: false
        });
        badge.add(tag);
        badge.add(text);
        this.connectionLayer.add(badge);
        this.labelMap.set(cable.id, badge);
      } else {
        const tag = badge.findOne(".cable-distance-tag");
        const text = badge.findOne(".cable-distance-text");
        if (text) {
          text.text(labelText);
          text.fill(isOverLimit ? "#fca5a5" : "#fff8cf");
        }
        if (tag) {
          tag.fill(isOverLimit ? "rgba(80, 10, 10, 0.92)" : "rgba(20, 36, 14, 0.92)");
          tag.stroke(isOverLimit ? "#ef4444" : strokeColor);
          tag.strokeWidth(isSelected ? 1.5 : 1);
        }
        badge.visible(this.showDistanceLabels !== false);
      }
      const textNode = badge.findOne(".cable-distance-text");
      const badgeW = textNode ? textNode.width() : 40;
      const badgeH = textNode ? textNode.height() : 16;
      badge.position({
        x: mid.x - badgeW / 2,
        y: mid.y - badgeH / 2
      });
    }
    /**
     * Set visibility of all on-canvas distance labels
     * @param {boolean} visible 
     */
    setDistanceLabelsVisible(visible) {
      this.showDistanceLabels = Boolean(visible);
      this.labelMap.forEach((badge) => {
        badge.visible(this.showDistanceLabels);
      });
      this.connectionLayer.batchDraw();
    }
    /**
     * Convert source, waypoints, and destination to flat pixel points array
     * @param {Object} cable 
     * @param {Object} sourceDev 
     * @param {Object} destDev 
     * @returns {number[]}
     */
    calculateFlatPixelPoints(cable, sourceDev, destDev) {
      const points = [];
      points.push(
        sourceDev.position.x * this.naturalWidth,
        sourceDev.position.y * this.naturalHeight
      );
      if (Array.isArray(cable.route)) {
        cable.route.forEach((wp) => {
          points.push(
            wp.x * this.naturalWidth,
            wp.y * this.naturalHeight
          );
        });
      }
      points.push(
        destDev.position.x * this.naturalWidth,
        destDev.position.y * this.naturalHeight
      );
      return points;
    }
    /**
     * Render interactive draggable waypoint handles on interactionLayer
     * @param {Object} cable 
     * @param {Object} sourceDev 
     * @param {Object} destDev 
     */
    renderWaypointHandles(cable, sourceDev, destDev) {
      this.clearWaypointHandles();
      if (!Array.isArray(cable.route) || cable.route.length === 0) {
        this.interactionLayer.batchDraw();
        return;
      }
      cable.route.forEach((wp, index) => {
        const px = wp.x * this.naturalWidth;
        const py = wp.y * this.naturalHeight;
        const handle = new Konva.Circle({
          name: "waypoint-handle",
          x: px,
          y: py,
          radius: 6,
          fill: "#76c457",
          stroke: "#18350d",
          strokeWidth: 2,
          draggable: true,
          perfectDrawEnabled: false,
          shadowForStrokeEnabled: false
        });
        handle.on("dragmove", () => {
          const clampedX = clamp2(handle.x(), 0, this.naturalWidth);
          const clampedY = clamp2(handle.y(), 0, this.naturalHeight);
          handle.position({ x: clampedX, y: clampedY });
          cable.route[index].x = clampedX / this.naturalWidth;
          cable.route[index].y = clampedY / this.naturalHeight;
          const updatedPoints = this.calculateFlatPixelPoints(cable, sourceDev, destDev);
          const line = this.lineMap.get(cable.id);
          if (line) {
            line.points(updatedPoints);
            this.connectionLayer.batchDraw();
          }
          const badge = this.labelMap.get(cable.id);
          if (badge) {
            const mid = this.calculatePathMidpoint(updatedPoints);
            const textNode = badge.findOne(".cable-distance-text");
            const badgeW = textNode ? textNode.width() : 40;
            const badgeH = textNode ? textNode.height() : 16;
            badge.position({
              x: mid.x - badgeW / 2,
              y: mid.y - badgeH / 2
            });
          }
        });
        handle.on("dragend", () => {
          const norm = {
            x: handle.x() / this.naturalWidth,
            y: handle.y() / this.naturalHeight
          };
          if (this.onWaypointMoved) {
            this.onWaypointMoved(cable.id, index, norm);
          }
        });
        handle.on("dblclick dbltap contextmenu", (e) => {
          e.evt.preventDefault();
          e.cancelBubble = true;
          if (this.onWaypointDeleted) {
            this.onWaypointDeleted(cable.id, index);
          }
        });
        this.interactionLayer.add(handle);
        this.waypointHandles.push(handle);
      });
      this.interactionLayer.batchDraw();
    }
    /**
     * Clear waypoint handles from interactionLayer
     */
    clearWaypointHandles() {
      this.waypointHandles.forEach((handle) => handle.destroy());
      this.waypointHandles = [];
      this.interactionLayer.batchDraw();
    }
    /**
     * Set currently selected cable ID
     * @param {string} cableId 
     */
    setSelectedCable(cableId) {
      this.selectedCableId = cableId;
      if (!cableId) {
        this.clearWaypointHandles();
      }
    }
    /**
     * Remove a cable line and its distance badge from canvas
     * @param {string} cableId 
     */
    removeCable(cableId) {
      const line = this.lineMap.get(cableId);
      if (line) {
        line.destroy();
        this.lineMap.delete(cableId);
      }
      const badge = this.labelMap.get(cableId);
      if (badge) {
        badge.destroy();
        this.labelMap.delete(cableId);
      }
      this.connectionLayer.batchDraw();
      if (this.selectedCableId === cableId) {
        this.clearWaypointHandles();
      }
    }
  };

  // js/connections/cable-manager.js
  var CableManager = class {
    /**
     * @param {Object} options
     * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
     * @param {Konva.Layer} options.connectionLayer
     * @param {Konva.Layer} options.interactionLayer
     * @param {number} options.naturalWidth
     * @param {number} options.naturalHeight
     */
    constructor({
      deviceManager,
      connectionLayer,
      interactionLayer,
      naturalWidth = 1024,
      naturalHeight = 1024
    }) {
      this.deviceManager = deviceManager;
      this.connectionLayer = connectionLayer;
      this.interactionLayer = interactionLayer;
      this.naturalWidth = naturalWidth;
      this.naturalHeight = naturalHeight;
      this.connections = /* @__PURE__ */ new Map();
      this.selectedCableId = null;
      let savedScale = 400;
      try {
        const stored = localStorage.getItem("netmap_scale_width_meters");
        if (stored && !isNaN(parseFloat(stored))) {
          savedScale = parseFloat(stored);
        }
      } catch (e) {
      }
      this.mapWidthMeters = savedScale;
      this.metersPerPixel = this.mapWidthMeters / this.naturalWidth;
      this.renderer = new CableRenderer({
        connectionLayer: this.connectionLayer,
        interactionLayer: this.interactionLayer,
        naturalWidth: this.naturalWidth,
        naturalHeight: this.naturalHeight,
        onSelect: (id) => this.selectConnection(id),
        onContextMenu: (cable, clientX, clientY) => {
          eventBus.emit("contextmenu:cable", { cable, screenX: clientX, screenY: clientY });
        },
        onWaypointMoved: (id, idx, norm) => this.updateWaypoint(id, idx, norm),
        onWaypointDeleted: (id, idx) => this.deleteWaypoint(id, idx)
      });
      this.initDeviceSyncListeners();
    }
    /**
     * Listen to device events for dynamic endpoint binding and cascade deletion
     */
    initDeviceSyncListeners() {
      eventBus.on("device:moved", ({ deviceId }) => {
        this.refreshCablesForDevice(deviceId);
      });
      eventBus.on("device:deleted", ({ deviceId }) => {
        const affected = this.getConnectionsByDeviceId(deviceId);
        affected.forEach((cable) => {
          this.deleteConnection(cable.id);
        });
      });
      eventBus.on("canvas:clicked-empty", () => {
        this.deselectConnection();
      });
      eventBus.on("device:selected", () => {
        this.deselectConnection();
      });
    }
    /**
     * Add a new connection and render it
     * @param {Object} connectionData 
     * @returns {Object|null}
     */
    addConnection(connectionData) {
      const cable = CableSchema.create(connectionData);
      const sourceDev = this.deviceManager.getDeviceById(cable.source);
      const destDev = this.deviceManager.getDeviceById(cable.destination);
      if (!sourceDev || !destDev) {
        console.warn("[CableManager] Cannot create connection: Source or Destination device not found");
        return null;
      }
      if (cable.lengthMode === "auto" || cable.length === 0) {
        cable.length = this.calculateEstimatedLength(cable, sourceDev, destDev);
      }
      this.connections.set(cable.id, cable);
      this.renderer.renderCable(cable, sourceDev, destDev);
      this.connectionLayer.batchDraw();
      eventBus.emit("connection:added", cable);
      return cable;
    }
    /**
     * Update properties of an existing connection
     * @param {string} id 
     * @param {Object} updates 
     * @returns {Object|null}
     */
    updateConnection(id, updates) {
      const existing = this.connections.get(id);
      if (!existing) return null;
      const updatedDetails = updates.details ? { ...existing.details, ...updates.details } : existing.details;
      const updatedCable = {
        ...existing,
        ...updates,
        details: updatedDetails,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      const sourceDev = this.deviceManager.getDeviceById(updatedCable.source);
      const destDev = this.deviceManager.getDeviceById(updatedCable.destination);
      if (updatedCable.lengthMode === "auto") {
        updatedCable.length = this.calculateEstimatedLength(updatedCable, sourceDev, destDev);
      } else {
        if (!updatedCable.details) updatedCable.details = {};
        updatedCable.details.calculatedMetrics = calculateNetworkPerformanceMetrics({
          totalLength: updatedCable.length || 0,
          horizontalLength: updatedCable.details.horizontalLength || updatedCable.length || 0,
          category: updatedCable.cableCategory,
          poeSupport: updatedCable.details.poeSupport || "poe+"
        });
      }
      this.connections.set(id, updatedCable);
      this.renderer.renderCable(updatedCable, sourceDev, destDev);
      this.connectionLayer.batchDraw();
      eventBus.emit("connection:updated", updatedCable);
      return updatedCable;
    }
    /**
     * Update an intermediate waypoint position
     * @param {string} cableId 
     * @param {number} waypointIndex 
     * @param {{x: number, y: number}} newNormalized 
     */
    updateWaypoint(cableId, waypointIndex, newNormalized) {
      const cable = this.connections.get(cableId);
      if (!cable || !Array.isArray(cable.route) || !cable.route[waypointIndex]) return;
      cable.route[waypointIndex] = newNormalized;
      cable.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      const sourceDev = this.deviceManager.getDeviceById(cable.source);
      const destDev = this.deviceManager.getDeviceById(cable.destination);
      if (cable.lengthMode === "auto") {
        cable.length = this.calculateEstimatedLength(cable, sourceDev, destDev);
      }
      this.renderer.renderCable(cable, sourceDev, destDev);
      this.connectionLayer.batchDraw();
      eventBus.emit("connection:updated", cable);
    }
    /**
     * Delete an intermediate waypoint
     * @param {string} cableId 
     * @param {number} waypointIndex 
     */
    deleteWaypoint(cableId, waypointIndex) {
      const cable = this.connections.get(cableId);
      if (!cable || !Array.isArray(cable.route)) return;
      cable.route.splice(waypointIndex, 1);
      cable.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      const sourceDev = this.deviceManager.getDeviceById(cable.source);
      const destDev = this.deviceManager.getDeviceById(cable.destination);
      if (cable.lengthMode === "auto") {
        cable.length = this.calculateEstimatedLength(cable, sourceDev, destDev);
      }
      this.renderer.renderCable(cable, sourceDev, destDev);
      this.connectionLayer.batchDraw();
      eventBus.emit("connection:updated", cable);
    }
    /**
     * Delete a connection
     * @param {string} id 
     * @returns {boolean}
     */
    deleteConnection(id) {
      const cable = this.connections.get(id);
      if (!cable) return false;
      if (this.selectedCableId === id) {
        this.deselectConnection();
      }
      this.renderer.removeCable(id);
      this.connections.delete(id);
      this.connectionLayer.batchDraw();
      eventBus.emit("connection:deleted", { connectionId: id });
      return true;
    }
    /**
     * Select a connection by ID
     * @param {string} id 
     */
    selectConnection(id) {
      const cable = this.connections.get(id);
      if (!cable) return;
      this.deviceManager.deselectDevice();
      this.selectedCableId = id;
      this.renderer.setSelectedCable(id);
      const sourceDev = this.deviceManager.getDeviceById(cable.source);
      const destDev = this.deviceManager.getDeviceById(cable.destination);
      this.renderer.renderCable(cable, sourceDev, destDev);
      this.connectionLayer.batchDraw();
      eventBus.emit("connection:selected", cable);
    }
    /**
     * Deselect active connection
     */
    deselectConnection() {
      if (!this.selectedCableId) return;
      const prevId = this.selectedCableId;
      const cable = this.connections.get(prevId);
      this.selectedCableId = null;
      this.renderer.setSelectedCable(null);
      if (cable) {
        const sourceDev = this.deviceManager.getDeviceById(cable.source);
        const destDev = this.deviceManager.getDeviceById(cable.destination);
        this.renderer.renderCable(cable, sourceDev, destDev);
      }
      this.connectionLayer.batchDraw();
      eventBus.emit("connection:deselected", { connectionId: prevId });
    }
    /**
     * Re-render all cables connected to a specific device
     * @param {string} deviceId 
     */
    refreshCablesForDevice(deviceId) {
      const affected = this.getConnectionsByDeviceId(deviceId);
      affected.forEach((cable) => {
        const sourceDev = this.deviceManager.getDeviceById(cable.source);
        const destDev = this.deviceManager.getDeviceById(cable.destination);
        if (sourceDev && destDev) {
          if (cable.lengthMode === "auto") {
            cable.length = this.calculateEstimatedLength(cable, sourceDev, destDev);
          }
          this.renderer.renderCable(cable, sourceDev, destDev);
        }
      });
      this.connectionLayer.batchDraw();
    }
    /**
     * Find all cables connected to a device ID
     * @param {string} deviceId 
     * @returns {Object[]}
     */
    getConnectionsByDeviceId(deviceId) {
      return Array.from(this.connections.values()).filter(
        (c) => c.source === deviceId || c.destination === deviceId
      );
    }
    /**
     * Calculate accurate physical cable length in meters along polyline,
     * factoring in 2D horizontal route, vertical drops, service loop, and slack margin.
     * @param {Object} cable 
     * @param {Object} sourceDev 
     * @param {Object} destDev 
     * @returns {number} Accurate physical length in meters rounded to 1 decimal
     */
    calculateEstimatedLength(cable, sourceDev, destDev) {
      if (!sourceDev || !destDev) return cable.length || 0;
      const pts = [
        sourceDev.position,
        ...cable.route || [],
        destDev.position
      ];
      let totalPixels = 0;
      const segments = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const dx = (p2.x - p1.x) * this.naturalWidth;
        const dy = (p2.y - p1.y) * this.naturalHeight;
        const segPix = Math.sqrt(dx * dx + dy * dy);
        totalPixels += segPix;
        segments.push(Math.round(segPix * this.metersPerPixel * 10) / 10);
      }
      const horizontalMeters = Math.round(totalPixels * this.metersPerPixel * 10) / 10;
      if (!cable.details) cable.details = {};
      cable.details.segmentLengths = segments;
      cable.details.horizontalLength = horizontalMeters;
      const vSrc = typeof cable.details.verticalDropSource === "number" ? cable.details.verticalDropSource : 1.5;
      const vDest = typeof cable.details.verticalDropDest === "number" ? cable.details.verticalDropDest : 1.5;
      const sLoop = typeof cable.details.serviceLoopMeters === "number" ? cable.details.serviceLoopMeters : 2;
      const sMargin = typeof cable.details.slackMarginPercent === "number" ? cable.details.slackMarginPercent : 5;
      const accurate = calculateAccurateCableLength({
        horizontalMeters,
        verticalDropSource: vSrc,
        verticalDropDest: vDest,
        serviceLoopMeters: sLoop,
        slackMarginPercent: sMargin
      });
      cable.details.verticalTotal = accurate.verticalTotal;
      cable.details.serviceLoopMeters = accurate.serviceLoopMeters;
      cable.details.slackAmount = accurate.slackAmount;
      cable.details.slackMarginPercent = accurate.slackMarginPercent;
      cable.details.totalPhysicalLength = accurate.totalPhysical;
      cable.details.calculatedMetrics = calculateNetworkPerformanceMetrics({
        totalLength: accurate.totalPhysical,
        horizontalLength,
        category: cable.cableCategory,
        poeSupport: cable.details.poeSupport || "poe+"
      });
      return accurate.totalPhysical;
    }
    /**
     * Calibrate map scale (meters represented by natural map width)
     * @param {number} realWorldWidthMeters 
     */
    setMapScale(realWorldWidthMeters) {
      const widthVal = parseFloat(realWorldWidthMeters);
      if (isNaN(widthVal) || widthVal <= 0) return;
      this.mapWidthMeters = widthVal;
      this.metersPerPixel = this.mapWidthMeters / this.naturalWidth;
      try {
        localStorage.setItem("netmap_scale_width_meters", String(widthVal));
      } catch (e) {
      }
      this.connections.forEach((cable) => {
        if (cable.lengthMode === "auto") {
          const sourceDev = this.deviceManager.getDeviceById(cable.source);
          const destDev = this.deviceManager.getDeviceById(cable.destination);
          if (sourceDev && destDev) {
            cable.length = this.calculateEstimatedLength(cable, sourceDev, destDev);
            this.renderer.renderCable(cable, sourceDev, destDev);
          }
        }
      });
      this.connectionLayer.batchDraw();
      eventBus.emit("map:scale-calibrated", {
        mapWidthMeters: this.mapWidthMeters,
        metersPerPixel: this.metersPerPixel
      });
    }
    /**
     * Get connection by ID
     * @param {string} id 
     * @returns {Object|null}
     */
    getConnectionById(id) {
      return this.connections.get(id) || null;
    }
    /**
     * Get all connections
     * @returns {Object[]}
     */
    getAllConnections() {
      return Array.from(this.connections.values());
    }
    /**
     * Render all connections
     */
    renderAll() {
      this.connections.forEach((cable) => {
        const sourceDev = this.deviceManager.getDeviceById(cable.source);
        const destDev = this.deviceManager.getDeviceById(cable.destination);
        if (sourceDev && destDev) {
          this.renderer.renderCable(cable, sourceDev, destDev);
        }
      });
      this.connectionLayer.batchDraw();
    }
  };

  // js/connections/cable-drawing-tool.js
  var CableDrawingTool = class {
    /**
     * @param {Object} options
     * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
     * @param {import('./cable-manager.js').CableManager} options.cableManager
     * @param {Konva.Stage} options.stage
     * @param {Konva.Layer} options.interactionLayer
     * @param {number} options.naturalWidth
     * @param {number} options.naturalHeight
     */
    constructor({
      deviceManager,
      cableManager,
      stage,
      interactionLayer,
      naturalWidth = 1024,
      naturalHeight = 1024
    }) {
      this.deviceManager = deviceManager;
      this.cableManager = cableManager;
      this.stage = stage;
      this.interactionLayer = interactionLayer;
      this.naturalWidth = naturalWidth;
      this.naturalHeight = naturalHeight;
      this.state = "IDLE";
      this.sourceDeviceId = null;
      this.waypoints = [];
      this.selectedCategory = "cat6";
      this.previewLine = null;
      this.guideDots = [];
      this.initEventListeners();
    }
    initEventListeners() {
      eventBus.on("mode:changed", ({ mode }) => {
        if (mode === "draw-cable") {
          this.startDrawing();
        } else {
          this.cancelDrawing();
        }
      });
      eventBus.on("device:selected", (device) => {
        if (stateManager.getMode() !== "draw-cable") return;
        if (this.state === "AWAITING_SOURCE") {
          this.handleSourceSelected(device.id);
        } else if (this.state === "DRAWING_WAYPOINTS") {
          this.handleDestinationSelected(device.id);
        }
      });
      eventBus.on("canvas:place-device", (coords) => {
        if (stateManager.getMode() === "draw-cable" && this.state === "DRAWING_WAYPOINTS") {
          this.addWaypoint({ x: coords.normalizedX, y: coords.normalizedY });
        }
      });
      this.stage.on("mousemove", () => {
        if (stateManager.getMode() === "draw-cable" && this.state === "DRAWING_WAYPOINTS") {
          this.updateRubberBand();
        }
      });
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && stateManager.getMode() === "draw-cable") {
          this.cancelDrawing();
          stateManager.setMode("navigate");
        }
      });
    }
    startDrawing() {
      this.cancelDrawing();
      this.state = "AWAITING_SOURCE";
      this.sourceDeviceId = null;
      this.waypoints = [];
      this.showToast("Langkah 1: Klik perangkat SUMBER (titik awal kabel)");
    }
    handleSourceSelected(deviceId) {
      this.sourceDeviceId = deviceId;
      this.state = "DRAWING_WAYPOINTS";
      this.waypoints = [];
      const srcDev = this.deviceManager.getDeviceById(deviceId);
      this.showToast(`Sumber: "${srcDev.name}". Klik denah untuk tambah belokan, atau klik perangkat TUJUAN.`);
      this.previewLine = new Konva.Line({
        name: "cable-preview-line",
        points: [],
        stroke: "#2a7c13",
        strokeWidth: 3,
        dash: [6, 4],
        lineCap: "round",
        lineJoin: "round",
        listening: false
      });
      this.interactionLayer.add(this.previewLine);
      this.updateRubberBand();
    }
    addWaypoint(normalizedPoint) {
      this.waypoints.push(normalizedPoint);
      const dot = new Konva.Circle({
        name: "guide-dot",
        x: normalizedPoint.x * this.naturalWidth,
        y: normalizedPoint.y * this.naturalHeight,
        radius: 4,
        fill: "#76c457",
        stroke: "#18350d",
        strokeWidth: 1.5,
        listening: false
      });
      this.interactionLayer.add(dot);
      this.guideDots.push(dot);
      this.updateRubberBand();
    }
    updateRubberBand() {
      if (!this.previewLine || !this.sourceDeviceId) return;
      const pointer = this.stage.getPointerPosition();
      if (!pointer) return;
      const srcDev = this.deviceManager.getDeviceById(this.sourceDeviceId);
      if (!srcDev) return;
      const stagePointer = coordinateSystem.screenToStage(pointer, this.stage);
      const points = [
        srcDev.position.x * this.naturalWidth,
        srcDev.position.y * this.naturalHeight
      ];
      this.waypoints.forEach((wp) => {
        points.push(wp.x * this.naturalWidth, wp.y * this.naturalHeight);
      });
      points.push(stagePointer.x, stagePointer.y);
      this.previewLine.points(points);
      this.interactionLayer.batchDraw();
    }
    handleDestinationSelected(destDeviceId) {
      if (destDeviceId === this.sourceDeviceId) {
        alert("Perangkat tujuan tidak boleh sama dengan perangkat sumber!");
        return;
      }
      const srcDev = this.deviceManager.getDeviceById(this.sourceDeviceId);
      const destDev = this.deviceManager.getDeviceById(destDeviceId);
      const newCable = this.cableManager.addConnection({
        name: `Link ${srcDev.name} \u2794 ${destDev.name}`,
        source: this.sourceDeviceId,
        destination: destDeviceId,
        cableCategory: this.selectedCategory,
        route: [...this.waypoints],
        status: "active"
      });
      this.showToast(`Koneksi berhasil dibuat: "${newCable.name}"`);
      this.cancelDrawing();
      stateManager.setMode("select");
      if (newCable) {
        this.cableManager.selectConnection(newCable.id);
      }
    }
    cancelDrawing() {
      this.state = "IDLE";
      this.sourceDeviceId = null;
      this.waypoints = [];
      if (this.previewLine) {
        this.previewLine.destroy();
        this.previewLine = null;
      }
      this.guideDots.forEach((d) => d.destroy());
      this.guideDots = [];
      this.interactionLayer.batchDraw();
    }
    showToast(message) {
      console.info(`[CableDrawingTool] ${message}`);
      const statusHint = document.querySelector("#app-status-bar .status-item:last-child");
      if (statusHint) {
        statusHint.innerHTML = `<span style="color: var(--accent-blue); font-weight: 600;">${message}</span>`;
      }
    }
  };

  // js/ui/connection-panel.js
  var ConnectionPanel = class {
    /**
     * @param {HTMLElement} container 
     * @param {import('../connections/cable-manager.js').CableManager} cableManager 
     * @param {import('../devices/device-manager.js').DeviceManager} deviceManager 
     */
    constructor(container, cableManager, deviceManager) {
      this.container = container;
      this.cableManager = cableManager;
      this.deviceManager = deviceManager;
      this.currentCable = null;
      this.bindEvents();
    }
    /**
     * Render the form for the selected cable
     * @param {Object} cable 
     */
    renderCableForm(cable) {
      this.currentCable = cable;
      const catDef = CABLE_CATEGORIES[cable.cableCategory] || CABLE_CATEGORIES["cat6"];
      const statusDef = CABLE_STATUSES[cable.status] || CABLE_STATUSES.active;
      const isCustomColor = Boolean(cable.customColor && cable.customColor.trim());
      const activeColor = isCustomColor ? cable.customColor.trim() : catDef.color;
      const sourceDev = this.deviceManager.getDeviceById(cable.source);
      const destDev = this.deviceManager.getDeviceById(cable.destination);
      if (!stateManager.getState().ui.rightSidebarOpen) {
        stateManager.toggleSidebar("right");
      }
      const details = cable.details || {};
      const vSrc = typeof details.verticalDropSource === "number" ? details.verticalDropSource : 1.5;
      const vDest = typeof details.verticalDropDest === "number" ? details.verticalDropDest : 1.5;
      const vTotal = typeof details.verticalTotal === "number" ? details.verticalTotal : vSrc + vDest;
      const sLoop = typeof details.serviceLoopMeters === "number" ? details.serviceLoopMeters : 2;
      const sMargin = typeof details.slackMarginPercent === "number" ? details.slackMarginPercent : 5;
      const horizontalLen = typeof details.horizontalLength === "number" ? details.horizontalLength : cable.length || 0;
      const sAmount = typeof details.slackAmount === "number" ? details.slackAmount : (horizontalLen + vTotal + sLoop) * (sMargin / 100);
      const totalPhysical = typeof details.totalPhysicalLength === "number" && details.totalPhysicalLength > 0 ? details.totalPhysicalLength : cable.length || 0;
      const segments = Array.isArray(details.segmentLengths) ? details.segmentLengths : [];
      const waypointsCount = Array.isArray(cable.route) ? cable.route.length : 0;
      this.container.innerHTML = `
      <div class="connection-form-wrapper" style="display: flex; flex-direction: column; gap: 14px;">
        
        <!-- Header Info Card -->
        <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
            <div style="flex: 1;">
              <div style="font-size: 10px; font-weight: 700; color: ${activeColor}; text-transform: uppercase; font-family: var(--font-mono); display: flex; align-items: center; gap: 5px;">
                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${activeColor};"></span>
                <span>${catDef.name}</span>
                ${isCustomColor ? '<span style="font-size: 9px; opacity: 0.85;">(Custom)</span>' : ""}
              </div>
              <input type="text" id="prop-cable-name" value="${this.escapeHtml(cable.name)}" 
                     style="background: transparent; border: 1px solid transparent; border-radius: 4px; color: var(--text-primary); font-size: 14px; font-weight: 700; width: 100%; padding: 2px 4px; margin-top: 2px;"
                     onfocus="this.style.borderColor='var(--border-focus)'; this.style.backgroundColor='var(--bg-tertiary)';"
                     onblur="this.style.borderColor='transparent'; this.style.backgroundColor='transparent';">
            </div>
            <button id="btn-cable-close" class="btn btn-icon btn-sm" title="Tutup / Batalkan Seleksi">
              <i data-lucide="x" style="width: 14px; height: 14px;"></i>
            </button>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px;">
            <span style="font-family: var(--font-mono); color: var(--text-muted); cursor: pointer;" id="btn-copy-cable-id" title="Klik untuk salin ID">
              ID: ${cable.id} \u{1F4CB}
            </span>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${statusDef.color};"></span>
              <select id="prop-cable-status" style="background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 2px 6px;">
                <option value="active" ${cable.status === "active" ? "selected" : ""}>Active</option>
                <option value="damaged" ${cable.status === "damaged" ? "selected" : ""}>Damaged / Cut</option>
                <option value="maintenance" ${cable.status === "maintenance" ? "selected" : ""}>Maintenance</option>
                <option value="inactive" ${cable.status === "inactive" ? "selected" : ""}>Inactive</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Section: Endpoint Koneksi -->
        <div class="panel-section">
          <span class="section-label">Endpoint Koneksi</span>
          <div class="info-card" style="display: flex; flex-direction: column; gap: 8px;">
            <!-- Source Device -->
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; background: var(--bg-tertiary); border-radius: 6px;">
              <div style="display: flex; flex-direction: column;">
                <span style="font-size: 10px; color: var(--accent-sky); font-weight: 600;">SUMBER (SOURCE)</span>
                <span style="font-size: 12px; font-weight: 600; color: var(--text-primary);">${sourceDev ? this.escapeHtml(sourceDev.name) : "Unknown"}</span>
                <span style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">${sourceDev?.network?.ip || ""}</span>
              </div>
              <button id="btn-goto-source" class="btn btn-icon btn-sm" title="Lompat ke Perangkat Sumber">
                <i data-lucide="crosshair" style="width: 14px; height: 14px;"></i>
              </button>
            </div>

            <!-- Arrow Indicator -->
            <div style="display: flex; justify-content: center; color: var(--text-muted); font-size: 12px;">
              <i data-lucide="arrow-down" style="width: 14px; height: 14px;"></i>
            </div>

            <!-- Destination Device -->
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; background: var(--bg-tertiary); border-radius: 6px;">
              <div style="display: flex; flex-direction: column;">
                <span style="font-size: 10px; color: var(--accent-blue); font-weight: 600;">TUJUAN (DESTINATION)</span>
                <span style="font-size: 12px; font-weight: 600; color: var(--text-primary);">${destDev ? this.escapeHtml(destDev.name) : "Unknown"}</span>
                <span style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">${destDev?.network?.ip || ""}</span>
              </div>
              <button id="btn-goto-dest" class="btn btn-icon btn-sm" title="Lompat ke Perangkat Tujuan">
                <i data-lucide="crosshair" style="width: 14px; height: 14px;"></i>
              </button>
            </div>
          </div>
        </div>

        <!-- Section: Spesifikasi Jalur & Fisik -->
        <div class="panel-section">
          <span class="section-label">Spesifikasi Jalur</span>
          <div class="info-card" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted); font-weight: 600;">Kategori / Tipe Media</label>
              <select id="prop-cable-category" style="background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 12px; padding: 6px 8px; font-weight: 500;">
                <option value="cat5e" ${cable.cableCategory === "cat5e" ? "selected" : ""}>UTP Cat5e (Biru - 1 Gbps)</option>
                <option value="cat6" ${cable.cableCategory === "cat6" ? "selected" : ""}>UTP Cat6 (Biru Tua - 10 Gbps)</option>
                <option value="cat6a" ${cable.cableCategory === "cat6a" ? "selected" : ""}>UTP Cat6A Shielded (Ungu - 10 Gbps)</option>
                <option value="fiber-sm" ${cable.cableCategory === "fiber-sm" ? "selected" : ""}>Fiber Optic Single Mode (Kuning OS2)</option>
                <option value="fiber-mm" ${cable.cableCategory === "fiber-mm" ? "selected" : ""}>Fiber Optic Multi Mode (Oranye OM3)</option>
                <option value="wireless-link" ${cable.cableCategory === "wireless-link" ? "selected" : ""}>Wireless Link PtP (Cyan Nirkabel)</option>
                <option value="coaxial" ${cable.cableCategory === "coaxial" ? "selected" : ""}>Coaxial (Abu-abu RG6/RG11)</option>
              </select>
            </div>

            <!-- Box Pengaturan Warna Kabel -->
            <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 8px; padding: 10px; background: var(--bg-secondary); border-radius: 6px; border: 1px solid var(--border-color);">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <label style="font-size: 11px; font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
                  <span id="cable-color-preview-dot" style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background-color: ${activeColor}; border: 1px solid rgba(0,0,0,0.25); box-shadow: 0 0 6px ${activeColor}88;"></span>
                  Warna Garis Kabel
                </label>
                <span id="prop-cable-color-mode-badge" style="font-size: 10px; padding: 2px 7px; border-radius: 10px; font-weight: 600; ${isCustomColor ? "background: rgba(245, 158, 11, 0.15); color: #b45309; border: 1px solid rgba(245, 158, 11, 0.3);" : "background: rgba(42, 124, 19, 0.15); color: var(--accent-green); border: 1px solid rgba(42, 124, 19, 0.3);"}">
                  ${isCustomColor ? "\u{1F3A8} Custom" : "\u26A1 Otomatis (Standar Tipe)"}
                </span>
              </div>

              <!-- Color picker input + Hex + Reset Button -->
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <div id="cable-color-picker-box" style="position: relative; width: 34px; height: 28px; border-radius: 4px; overflow: hidden; border: 1px solid var(--border-color); cursor: pointer; flex-shrink: 0; background: ${activeColor};" title="Klik untuk pilih warna custom">
                  <input type="color" id="prop-cable-custom-color" value="${activeColor}" 
                         style="position: absolute; top: -10px; left: -10px; width: 60px; height: 50px; border: none; cursor: pointer; opacity: 0;">
                </div>
                
                <input type="text" id="prop-cable-custom-hex" value="${activeColor}" maxlength="7" placeholder="#HEX"
                       style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 11px; font-family: var(--font-mono); width: 70px; padding: 4px 6px; text-transform: uppercase;">

                <button type="button" id="btn-reset-cable-color" class="btn btn-secondary btn-sm" 
                        title="Kembalikan warna kabel ke standar tipe (${catDef.name})"
                        style="flex: 1; min-width: 100px; font-size: 10px; height: 28px; display: flex; align-items: center; justify-content: center; gap: 4px; white-space: nowrap; ${isCustomColor ? "font-weight: 600;" : "opacity: 0.6;"}">
                  <i data-lucide="rotate-ccw" style="width: 12px; height: 12px;"></i>
                  <span>Reset Standar</span>
                </button>
              </div>

              <!-- Quick Swatches Palette -->
              <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 2px;">
                <span style="font-size: 10px; color: var(--text-muted); font-weight: 500;">Palet Cepat:</span>
                <div style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
                  <button type="button" class="cable-swatch-btn" data-color="#3b82f6" title="Cat5e Blue (#3b82f6)" style="width: 20px; height: 20px; border-radius: 4px; background: #3b82f6; border: 2px solid ${activeColor.toLowerCase() === "#3b82f6" ? "var(--text-primary)" : "transparent"}; cursor: pointer;"></button>
                  <button type="button" class="cable-swatch-btn" data-color="#2563eb" title="Cat6 Royal Blue (#2563eb)" style="width: 20px; height: 20px; border-radius: 4px; background: #2563eb; border: 2px solid ${activeColor.toLowerCase() === "#2563eb" ? "var(--text-primary)" : "transparent"}; cursor: pointer;"></button>
                  <button type="button" class="cable-swatch-btn" data-color="#8b5cf6" title="Cat6A Purple (#8b5cf6)" style="width: 20px; height: 20px; border-radius: 4px; background: #8b5cf6; border: 2px solid ${activeColor.toLowerCase() === "#8b5cf6" ? "var(--text-primary)" : "transparent"}; cursor: pointer;"></button>
                  <button type="button" class="cable-swatch-btn" data-color="#eab308" title="FO Single Mode Yellow (#eab308)" style="width: 20px; height: 20px; border-radius: 4px; background: #eab308; border: 2px solid ${activeColor.toLowerCase() === "#eab308" ? "var(--text-primary)" : "transparent"}; cursor: pointer;"></button>
                  <button type="button" class="cable-swatch-btn" data-color="#f97316" title="FO Multi Mode Orange (#f97316)" style="width: 20px; height: 20px; border-radius: 4px; background: #f97316; border: 2px solid ${activeColor.toLowerCase() === "#f97316" ? "var(--text-primary)" : "transparent"}; cursor: pointer;"></button>
                  <button type="button" class="cable-swatch-btn" data-color="#06b6d4" title="Wireless Cyan (#06b6d4)" style="width: 20px; height: 20px; border-radius: 4px; background: #06b6d4; border: 2px solid ${activeColor.toLowerCase() === "#06b6d4" ? "var(--text-primary)" : "transparent"}; cursor: pointer;"></button>
                  <button type="button" class="cable-swatch-btn" data-color="#64748b" title="Coaxial Slate (#64748b)" style="width: 20px; height: 20px; border-radius: 4px; background: #64748b; border: 2px solid ${activeColor.toLowerCase() === "#64748b" ? "var(--text-primary)" : "transparent"}; cursor: pointer;"></button>
                  <span style="display: inline-block; width: 1px; height: 16px; background: var(--border-color); margin: 0 1px;"></span>
                  <button type="button" class="cable-swatch-btn" data-color="#2a7c13" title="Tema Forest Green (#2a7c13)" style="width: 20px; height: 20px; border-radius: 4px; background: #2a7c13; border: 2px solid ${activeColor.toLowerCase() === "#2a7c13" ? "var(--text-primary)" : "transparent"}; cursor: pointer;"></button>
                  <button type="button" class="cable-swatch-btn" data-color="#22c55e" title="Success Green (#22c55e)" style="width: 20px; height: 20px; border-radius: 4px; background: #22c55e; border: 2px solid ${activeColor.toLowerCase() === "#22c55e" ? "var(--text-primary)" : "transparent"}; cursor: pointer;"></button>
                  <button type="button" class="cable-swatch-btn" data-color="#ef4444" title="Critical Red (#ef4444)" style="width: 20px; height: 20px; border-radius: 4px; background: #ef4444; border: 2px solid ${activeColor.toLowerCase() === "#ef4444" ? "var(--text-primary)" : "transparent"}; cursor: pointer;"></button>
                  <button type="button" class="cable-swatch-btn" data-color="#ec4899" title="Neon Pink (#ec4899)" style="width: 20px; height: 20px; border-radius: 4px; background: #ec4899; border: 2px solid ${activeColor.toLowerCase() === "#ec4899" ? "var(--text-primary)" : "transparent"}; cursor: pointer;"></button>
                  <button type="button" class="cable-swatch-btn" data-color="#1e293b" title="Dark Slate (#1e293b)" style="width: 20px; height: 20px; border-radius: 4px; background: #1e293b; border: 2px solid ${activeColor.toLowerCase() === "#1e293b" ? "var(--text-primary)" : "transparent"}; cursor: pointer;"></button>
                </div>
              </div>
            </div>

            <!-- Sub-section: Parameter Drop Teknis & Real-World BOM -->
            <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 8px; padding: 10px; background: var(--bg-secondary); border-radius: 6px; border: 1px solid var(--border-color);">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 11px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 5px;">
                  <i data-lucide="ruler" style="width: 14px; height: 14px; color: var(--accent-green);"></i>
                  Kalkulasi Fisik Rute & Drop Teknis
                </span>
                <span style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">
                  Standar TIA/EIA-568
                </span>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <div style="display: flex; flex-direction: column; gap: 2px;">
                  <label style="font-size: 10px; color: var(--text-muted); font-weight: 600;" title="Jarak vertikal dari tray/plafon ke port perangkat sumber">
                    Drop Vertikal Sumber (A)
                  </label>
                  <div style="display: flex; align-items: center; gap: 4px;">
                    <input type="number" id="prop-cable-v-src" min="0" max="50" step="0.5" value="${vSrc}"
                           style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 11px; padding: 4px 6px; font-family: var(--font-mono); width: 100%;">
                    <span style="font-size: 10px; color: var(--text-muted);">m</span>
                  </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 2px;">
                  <label style="font-size: 10px; color: var(--text-muted); font-weight: 600;" title="Jarak vertikal dari tray/plafon ke port perangkat tujuan">
                    Drop Vertikal Tujuan (B)
                  </label>
                  <div style="display: flex; align-items: center; gap: 4px;">
                    <input type="number" id="prop-cable-v-dest" min="0" max="50" step="0.5" value="${vDest}"
                           style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 11px; padding: 4px 6px; font-family: var(--font-mono); width: 100%;">
                    <span style="font-size: 10px; color: var(--text-muted);">m</span>
                  </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 2px;">
                  <label style="font-size: 10px; color: var(--text-muted); font-weight: 600;" title="Cadangan gulungan kabel di termination box / rack untuk maintenance">
                    Service Loop Cadangan
                  </label>
                  <div style="display: flex; align-items: center; gap: 4px;">
                    <input type="number" id="prop-cable-loop" min="0" max="30" step="0.5" value="${sLoop}"
                           style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 11px; padding: 4px 6px; font-family: var(--font-mono); width: 100%;">
                    <span style="font-size: 10px; color: var(--text-muted);">m</span>
                  </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 2px;">
                  <label style="font-size: 10px; color: var(--text-muted); font-weight: 600;" title="Margin kelonggaran tarikan kabel akibat belokan conduit / tray">
                    Slack Margin Tarikan
                  </label>
                  <select id="prop-cable-slack" style="background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 4px 6px;">
                    <option value="0" ${sMargin == 0 ? "selected" : ""}>0% (Jalur Kaku)</option>
                    <option value="5" ${sMargin == 5 ? "selected" : ""}>5% (Standar Tray)</option>
                    <option value="10" ${sMargin == 10 ? "selected" : ""}>10% (Pipa Conduit)</option>
                    <option value="15" ${sMargin == 15 ? "selected" : ""}>15% (Rute Berkelok)</option>
                  </select>
                </div>
              </div>

              <!-- Real-Time BOM Breakdown Card -->
              <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; display: flex; flex-direction: column; gap: 5px;">
                <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">
                  Rincian Panjang Fisik (BOM Penarikan):
                </div>
                
                <div style="display: flex; justify-content: space-between; font-size: 11px;">
                  <span style="color: var(--text-secondary);">\u2022 Rute Horizontal 2D (Denah):</span>
                  <span id="bom-horizontal-val" style="font-family: var(--font-mono); font-weight: 600; color: var(--text-primary);">${horizontalLen.toFixed(1)} m</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 11px;">
                  <span style="color: var(--text-secondary);">\u2022 Drop Vertikal (Src + Dest):</span>
                  <span id="bom-vertical-val" style="font-family: var(--font-mono); font-weight: 600; color: var(--accent-blue);">+${vTotal.toFixed(1)} m</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 11px;">
                  <span style="color: var(--text-secondary);">\u2022 Cadangan Service Loop:</span>
                  <span id="bom-loop-val" style="font-family: var(--font-mono); font-weight: 600; color: var(--accent-sky);">+${sLoop.toFixed(1)} m</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 11px;">
                  <span style="color: var(--text-secondary);">\u2022 Slack Margin Tarikan (${sMargin}%):</span>
                  <span id="bom-slack-val" style="font-family: var(--font-mono); font-weight: 600; color: var(--text-muted);">+${sAmount.toFixed(1)} m</span>
                </div>

                <div style="margin-top: 4px; padding-top: 6px; border-top: 1px dashed var(--border-color); display: flex; align-items: center; justify-content: space-between;">
                  <span style="font-size: 11px; font-weight: 700; color: var(--text-primary);">Total Panjang Fisik:</span>
                  <span id="bom-total-badge" style="font-size: 12px; font-weight: 700; font-family: var(--font-mono); padding: 3px 8px; border-radius: 4px; background: rgba(42, 124, 19, 0.15); color: var(--accent-green); border: 1px solid rgba(42, 124, 19, 0.35);">
                    ${totalPhysical.toFixed(1)} Meter
                  </span>
                </div>
              </div>
            </div>

            <!-- Panjang Akhir & Mode -->
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted); font-weight: 600;">Total Panjang (Meter)</label>
              <input type="number" id="prop-cable-length" step="0.1" value="${cable.length || 0}"
                     style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 12px; padding: 5px 8px; font-family: var(--font-mono); font-weight: 600;">
            </div>

            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted); font-weight: 600;">Mode Panjang</label>
              <select id="prop-cable-len-mode" style="background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 12px; padding: 5px 8px;">
                <option value="auto" ${cable.lengthMode === "auto" ? "selected" : ""}>Auto (Kalkulasi Fisik)</option>
                <option value="manual" ${cable.lengthMode === "manual" ? "selected" : ""}>Manual (Override Bebas)</option>
              </select>
            </div>

            <!-- Per-Segment Breakdown Table / Waypoint Info -->
            ${segments.length > 1 ? `
              <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                  <span style="font-size: 11px; font-weight: 600; color: var(--text-primary);">
                    \u{1F4CF} Jarak Antar Segmen Belokan (${segments.length} segmen)
                  </span>
                  <button id="btn-straighten-cable" class="btn btn-secondary btn-sm" style="font-size: 10px; height: 22px; padding: 2px 6px;">
                    Luruskan Jalur
                  </button>
                </div>
                <div style="display: flex; flex-direction: column; gap: 3px; max-height: 110px; overflow-y: auto; margin-top: 2px; padding-right: 2px;">
                  ${segments.map((seg, idx) => `
                    <div style="display: flex; align-items: center; justify-content: space-between; font-size: 10.5px; padding: 2px 6px; background: var(--bg-secondary); border-radius: 4px;">
                      <span style="color: var(--text-secondary);">${idx === 0 ? "Sumber \u2794 Belokan 1" : idx === segments.length - 1 ? `Belokan ${idx} \u2794 Tujuan` : `Belokan ${idx} \u2794 Belokan ${idx + 1}`}:</span>
                      <span style="font-family: var(--font-mono); font-weight: 600; color: var(--text-primary);">${seg.toFixed(1)} m</span>
                    </div>
                  `).join("")}
                </div>
              </div>
            ` : `
              <div style="grid-column: span 2; display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: var(--text-muted); background: var(--bg-secondary); padding: 6px 10px; border-radius: 4px;">
                <span>Titik Belok (Waypoints): <strong>0 titik (Jalur Lurus)</strong></span>
                <span style="font-size: 10px; color: var(--text-muted);">Klik jalur untuk buat belokan</span>
              </div>
            `}

            <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);">Catatan Rute / Ducting</label>
              <textarea id="prop-cable-notes" rows="2" placeholder="Jalur tray kabel, pipa bawah tanah, atau core FO ke..."
                        style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 12px; padding: 5px 8px; resize: vertical;">${this.escapeHtml(cable.notes || "")}</textarea>
            </div>
          </div>
        </div>

        <!-- Section: Detail Spesifikasi & Analisis Rekayasa Jaringan -->
        <div class="panel-section">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <span class="section-label" style="margin-bottom: 0;">Detail Spesifikasi & Analisis</span>
            <span style="font-size: 10px; color: var(--text-muted); font-weight: 600;">Metrik Jaringan</span>
          </div>
          <div id="prop-media-details-container">
            ${this.renderMediaDetailsHtml(cable.cableCategory, cable.length || 0, cable.details || {})}
          </div>
        </div>

        <!-- Action Buttons -->
        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 4px;">
          <button id="btn-save-cable" class="btn btn-primary" style="width: 100%;">
            <i data-lucide="check" style="width: 15px; height: 15px;"></i>
            <span>Simpan Perubahan Jalur</span>
          </button>

          <button id="btn-delete-cable" class="btn btn-sm" style="background-color: rgba(239, 68, 68, 0.15); color: var(--status-offline); border: 1px solid rgba(239, 68, 68, 0.3); width: 100%;">
            <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
            <span>Hapus Jalur Kabel</span>
          </button>
        </div>

      </div>
    `;
      if (window.lucide) window.lucide.createIcons();
      this.bindFormHandlers();
    }
    bindFormHandlers() {
      if (!this.currentCable) return;
      const cableId = this.currentCable.id;
      document.getElementById("btn-cable-close")?.addEventListener("click", () => {
        this.cableManager.deselectConnection();
      });
      document.getElementById("btn-copy-cable-id")?.addEventListener("click", () => {
        navigator.clipboard.writeText(cableId).then(() => {
          alert(`ID Kabel "${cableId}" berhasil disalin`);
        });
      });
      document.getElementById("btn-goto-source")?.addEventListener("click", () => {
        const srcDev = this.deviceManager.getDeviceById(this.currentCable.source);
        if (srcDev) {
          eventBus.emit("viewport:center-on", srcDev.position);
        }
      });
      document.getElementById("btn-goto-dest")?.addEventListener("click", () => {
        const destDev = this.deviceManager.getDeviceById(this.currentCable.destination);
        if (destDev) {
          eventBus.emit("viewport:center-on", destDev.position);
        }
      });
      document.getElementById("btn-straighten-cable")?.addEventListener("click", () => {
        this.cableManager.updateConnection(cableId, { route: [] });
        this.renderCableForm(this.cableManager.getConnectionById(cableId));
      });
      document.getElementById("btn-delete-cable")?.addEventListener("click", () => {
        if (confirm(`Yakin ingin menghapus jalur kabel "${this.currentCable.name}"?`)) {
          this.cableManager.deleteConnection(cableId);
        }
      });
      document.getElementById("prop-cable-status")?.addEventListener("change", (e) => {
        const newStatus = e.target.value;
        this.cableManager.updateConnection(cableId, { status: newStatus });
        const updatedCable = this.cableManager.getConnectionById(cableId);
        this.renderCableForm(updatedCable);
      });
      document.getElementById("prop-cable-category")?.addEventListener("change", (e) => {
        const newCat = e.target.value;
        const catDef = CABLE_CATEGORIES[newCat] || CABLE_CATEGORIES["cat6"];
        const mediaType = getMediaTypeByCableCategory(newCat);
        this.cableManager.updateConnection(cableId, {
          cableCategory: newCat,
          type: catDef.type || mediaType,
          customColor: ""
          // Reset custom color to follow standard category color
        });
        const updatedCable = this.cableManager.getConnectionById(cableId);
        this.renderCableForm(updatedCable);
      });
      const colorPicker = document.getElementById("prop-cable-custom-color");
      const hexInput = document.getElementById("prop-cable-custom-hex");
      const previewDot = document.getElementById("cable-color-preview-dot");
      const colorBadge = document.getElementById("prop-cable-color-mode-badge");
      const pickerBox = document.getElementById("cable-color-picker-box");
      const applyCustomColor = (hexVal) => {
        if (!/^#[0-9A-Fa-f]{6}$/.test(hexVal)) return;
        this.cableManager.updateConnection(cableId, { customColor: hexVal });
        this.currentCable.customColor = hexVal;
        if (colorPicker) colorPicker.value = hexVal;
        if (hexInput) hexInput.value = hexVal.toUpperCase();
        if (pickerBox) pickerBox.style.backgroundColor = hexVal;
        if (previewDot) {
          previewDot.style.backgroundColor = hexVal;
          previewDot.style.boxShadow = `0 0 6px ${hexVal}88`;
        }
        if (colorBadge) {
          colorBadge.innerText = "\u{1F3A8} Custom";
          colorBadge.style.background = "rgba(245, 158, 11, 0.15)";
          colorBadge.style.color = "#b45309";
          colorBadge.style.borderColor = "rgba(245, 158, 11, 0.3)";
        }
        const resetBtn = document.getElementById("btn-reset-cable-color");
        if (resetBtn) resetBtn.style.opacity = "1";
        document.querySelectorAll(".cable-swatch-btn").forEach((btn) => {
          const swatchCol = btn.getAttribute("data-color");
          btn.style.borderColor = swatchCol && swatchCol.toLowerCase() === hexVal.toLowerCase() ? "var(--text-primary)" : "transparent";
        });
      };
      colorPicker?.addEventListener("input", (e) => applyCustomColor(e.target.value));
      colorPicker?.addEventListener("change", (e) => applyCustomColor(e.target.value));
      hexInput?.addEventListener("input", (e) => {
        let val = e.target.value.trim();
        if (!val.startsWith("#") && val.length > 0) val = "#" + val;
        if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
          applyCustomColor(val);
        }
      });
      document.querySelectorAll(".cable-swatch-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const col = btn.getAttribute("data-color");
          if (col) applyCustomColor(col);
        });
      });
      document.getElementById("btn-reset-cable-color")?.addEventListener("click", () => {
        this.cableManager.updateConnection(cableId, { customColor: "" });
        this.currentCable.customColor = "";
        const updatedCable = this.cableManager.getConnectionById(cableId);
        this.renderCableForm(updatedCable);
      });
      const vSrcInput = document.getElementById("prop-cable-v-src");
      const vDestInput = document.getElementById("prop-cable-v-dest");
      const loopInput = document.getElementById("prop-cable-loop");
      const slackSelect = document.getElementById("prop-cable-slack");
      const recalculatePhysicalValues = () => {
        const vSrc = Math.max(0, parseFloat(vSrcInput?.value || "0"));
        const vDest = Math.max(0, parseFloat(vDestInput?.value || "0"));
        const sLoop = Math.max(0, parseFloat(loopInput?.value || "0"));
        const sMargin = Math.max(0, parseFloat(slackSelect?.value || "5"));
        const updated = this.cableManager.updateConnection(cableId, {
          details: {
            verticalDropSource: vSrc,
            verticalDropDest: vDest,
            serviceLoopMeters: sLoop,
            slackMarginPercent: sMargin
          }
        });
        if (updated) {
          this.currentCable = updated;
          const details = updated.details || {};
          const vTotal = typeof details.verticalTotal === "number" ? details.verticalTotal : vSrc + vDest;
          const sAmount = typeof details.slackAmount === "number" ? details.slackAmount : 0;
          const total = updated.length || 0;
          const vEl = document.getElementById("bom-vertical-val");
          if (vEl) vEl.textContent = `+${vTotal.toFixed(1)} m`;
          const loopEl = document.getElementById("bom-loop-val");
          if (loopEl) loopEl.textContent = `+${sLoop.toFixed(1)} m`;
          const slackEl = document.getElementById("bom-slack-val");
          if (slackEl) slackEl.textContent = `+${sAmount.toFixed(1)} m`;
          const badgeEl = document.getElementById("bom-total-badge");
          if (badgeEl) badgeEl.textContent = `${total.toFixed(1)} Meter`;
          const lenInput = document.getElementById("prop-cable-length");
          if (lenInput && updated.lengthMode === "auto") {
            lenInput.value = total.toFixed(1);
          }
          const cat = document.getElementById("prop-cable-category")?.value || "cat6";
          const mediaContainer = document.getElementById("prop-media-details-container");
          if (mediaContainer) {
            mediaContainer.innerHTML = this.renderMediaDetailsHtml(cat, total, updated.details || {});
            if (window.lucide) window.lucide.createIcons();
          }
        }
      };
      vSrcInput?.addEventListener("input", recalculatePhysicalValues);
      vDestInput?.addEventListener("input", recalculatePhysicalValues);
      loopInput?.addEventListener("input", recalculatePhysicalValues);
      slackSelect?.addEventListener("change", recalculatePhysicalValues);
      document.getElementById("prop-cable-length")?.addEventListener("input", (e) => {
        const newLen = parseFloat(e.target.value || "0");
        const cat = document.getElementById("prop-cable-category")?.value || "cat6";
        const container = document.getElementById("prop-media-details-container");
        if (container) {
          container.innerHTML = this.renderMediaDetailsHtml(cat, newLen, this.currentCable.details || {});
          if (window.lucide) window.lucide.createIcons();
        }
      });
      document.getElementById("prop-cable-len-mode")?.addEventListener("change", (e) => {
        const mode = e.target.value;
        if (mode === "auto") {
          const sourceDev = this.deviceManager.getDeviceById(this.currentCable.source);
          const destDev = this.deviceManager.getDeviceById(this.currentCable.destination);
          const autoLen = this.cableManager.calculateEstimatedLength(this.currentCable, sourceDev, destDev);
          this.cableManager.updateConnection(cableId, { lengthMode: "auto", length: autoLen });
          const updatedCable = this.cableManager.getConnectionById(cableId);
          this.renderCableForm(updatedCable);
        } else {
          this.cableManager.updateConnection(cableId, { lengthMode: "manual" });
        }
      });
      document.getElementById("btn-save-cable")?.addEventListener("click", () => {
        const nameInput = document.getElementById("prop-cable-name");
        const statusSelect = document.getElementById("prop-cable-status");
        const catSelect = document.getElementById("prop-cable-category");
        const lengthInput = document.getElementById("prop-cable-length");
        const lenModeSelect = document.getElementById("prop-cable-len-mode");
        const notesInput = document.getElementById("prop-cable-notes");
        const currentCategory = catSelect?.value || "cat6";
        const mediaType = getMediaTypeByCableCategory(currentCategory);
        const details = { ...this.currentCable.details || {} };
        if (mediaType === "fiber") {
          const coreCountEl = document.getElementById("detail-fiber-cores");
          const tubeEl = document.getElementById("detail-fiber-tube");
          const connSrcEl = document.getElementById("detail-fiber-conn-src");
          const connDestEl = document.getElementById("detail-fiber-conn-dest");
          const activeCoresEl = document.getElementById("detail-fiber-active-cores");
          const waveEl = document.getElementById("detail-fiber-wave");
          if (coreCountEl) details.fiberCoreCount = parseInt(coreCountEl.value, 10);
          if (tubeEl) details.tubeColor = tubeEl.value;
          if (connSrcEl) details.connectorSource = connSrcEl.value;
          if (connDestEl) details.connectorDest = connDestEl.value;
          if (activeCoresEl) details.fiberActiveCores = activeCoresEl.value.trim();
          if (waveEl) details.wavelength = waveEl.value;
        } else if (mediaType === "twisted-pair") {
          const shieldEl = document.getElementById("detail-lan-shield");
          const standardEl = document.getElementById("detail-lan-standard");
          const poeEl = document.getElementById("detail-lan-poe");
          const jacketEl = document.getElementById("detail-lan-jacket");
          const portSrcEl = document.getElementById("detail-lan-port-src");
          const portDestEl = document.getElementById("detail-lan-port-dest");
          if (shieldEl) details.shielding = shieldEl.value;
          if (standardEl) details.wiringStandard = standardEl.value;
          if (poeEl) details.poeSupport = poeEl.value;
          if (jacketEl) details.jacketType = jacketEl.value;
          if (portSrcEl) details.portSource = portSrcEl.value.trim();
          if (portDestEl) details.portDestination = portDestEl.value.trim();
        } else if (mediaType === "coaxial") {
          const coaxTypeEl = document.getElementById("detail-coax-type");
          const impedanceEl = document.getElementById("detail-coax-impedance");
          const coaxConnEl = document.getElementById("detail-coax-conn");
          const siameseEl = document.getElementById("detail-coax-siamese");
          if (coaxTypeEl) details.coaxType = coaxTypeEl.value;
          if (impedanceEl) details.impedance = impedanceEl.value;
          if (coaxConnEl) details.coaxConnector = coaxConnEl.value;
          if (siameseEl) details.isSiamese = siameseEl.checked;
        } else if (mediaType === "wireless") {
          const freqEl = document.getElementById("detail-wireless-freq");
          const widthEl = document.getElementById("detail-wireless-width");
          const rssiEl = document.getElementById("detail-wireless-rssi");
          if (freqEl) details.frequency = freqEl.value;
          if (widthEl) details.channelWidth = widthEl.value;
          if (rssiEl) details.signalRssi = rssiEl.value.trim();
        }
        const updates = {
          name: nameInput?.value.trim() || "Cable Link",
          status: statusSelect?.value || "active",
          cableCategory: currentCategory,
          customColor: this.currentCable.customColor || "",
          length: parseFloat(lengthInput?.value || "0"),
          lengthMode: lenModeSelect?.value || "auto",
          details,
          notes: notesInput?.value.trim() || ""
        };
        const updated = this.cableManager.updateConnection(cableId, updates);
        if (updated) {
          this.renderCableForm(updated);
        }
      });
    }
    bindEvents() {
      eventBus.on("connection:selected", (cable) => {
        this.renderCableForm(cable);
      });
      eventBus.on("connection:deselected", () => {
        if (!this.deviceManager.selectedDeviceId) {
          this.renderEmpty();
        }
      });
      eventBus.on("connection:deleted", ({ connectionId }) => {
        if (this.currentCable?.id === connectionId) {
          this.currentCable = null;
          this.renderEmpty();
        }
      });
      eventBus.on("map:scale-calibrated", () => {
        if (this.currentCable) {
          const updated = this.cableManager.getConnectionById(this.currentCable.id);
          if (updated) this.renderCableForm(updated);
        }
      });
    }
    renderEmpty() {
      this.container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <i data-lucide="mouse-pointer-click" style="width: 22px; height: 22px;"></i>
        </div>
        <div class="empty-state-text">Belum ada perangkat terpilih</div>
        <div class="empty-state-hint">
          Klik salah satu marker perangkat pada denah atau garis koneksi kabel untuk membuka konfigurasi teknis.
        </div>
      </div>
    `;
      if (window.lucide) window.lucide.createIcons();
    }
    /**
     * Render dynamic technical detail form & network performance analysis
     * @param {string} category 
     * @param {number} length 
     * @param {Object} details 
     * @returns {string}
     */
    renderMediaDetailsHtml(category, length, details = {}) {
      const mediaType = getMediaTypeByCableCategory(category);
      const catDef = CABLE_CATEGORIES[category] || CABLE_CATEGORIES.cat6;
      const len = Number(length) || 0;
      const metrics = calculateNetworkPerformanceMetrics({
        totalLength: len,
        horizontalLength: details.horizontalLength || len,
        category,
        poeSupport: details.poeSupport || "poe+"
      });
      if (mediaType === "fiber") {
        const fiberType = category === "fiber-mm" ? "mm" : "sm";
        const estLoss = metrics.attenuationDb;
        const coreCount = details.fiberCoreCount || (category === "fiber-mm" ? 4 : 12);
        const activeCores = details.fiberActiveCores || "Core 1-2 (Uplink Tx/Rx)";
        const connSrc = details.connectorSource || "LC/UPC";
        const connDest = details.connectorDest || "LC/UPC";
        const wave = details.wavelength || (fiberType === "sm" ? "1310/1550nm (OS2)" : "850/1300nm (OM3)");
        const tube = details.tubeColor || "Biru (Tube 1)";
        return `
        <!-- Fiber Optic Details Card -->
        <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="width: 10px; height: 10px; border-radius: 50%; background: ${catDef.color};"></span>
              <span style="font-size: 11px; font-weight: 700; color: var(--text-primary); text-transform: uppercase;">
                ${fiberType === "sm" ? "Fiber Optik Single Mode (OS2)" : "Fiber Optik Multi Mode (OM3/OM4)"}
              </span>
            </div>
            <span style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">
              ${fiberType === "sm" ? "9/125 \xB5m" : "50/125 \xB5m"}
            </span>
          </div>

          <!-- Real-Time Optical Budget & Latency Box -->
          <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 6px 8px; display: flex; flex-direction: column; gap: 4px; font-size: 11px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="color: var(--text-muted);">Estimasi Redaman (Optical Loss):</span>
              <span style="font-weight: 700; color: ${estLoss > 3 ? "var(--status-warning)" : "var(--status-online)"}; font-family: var(--font-mono);">
                ${estLoss.toFixed(2)} dB (${len.toFixed(1)}m)
              </span>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="color: var(--text-muted);">Latensi Propagasi Fisik:</span>
              <span style="font-weight: 600; color: var(--text-primary); font-family: var(--font-mono);">
                ${metrics.latency.delayNanoseconds} ns (${metrics.latency.delayMicroseconds} \xB5s)
              </span>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Jumlah Core</label>
              <select id="detail-fiber-cores" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 4px 6px;">
                <option value="2" ${coreCount == 2 ? "selected" : ""}>2 Core (Duplex)</option>
                <option value="4" ${coreCount == 4 ? "selected" : ""}>4 Core</option>
                <option value="6" ${coreCount == 6 ? "selected" : ""}>6 Core</option>
                <option value="8" ${coreCount == 8 ? "selected" : ""}>8 Core</option>
                <option value="12" ${coreCount == 12 ? "selected" : ""}>12 Core (Standar)</option>
                <option value="24" ${coreCount == 24 ? "selected" : ""}>24 Core (Backbone)</option>
                <option value="48" ${coreCount == 48 ? "selected" : ""}>48 Core (Trunk)</option>
                <option value="96" ${coreCount == 96 ? "selected" : ""}>96 Core (High Dens)</option>
              </select>
            </div>

            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Warna Tube (TIA-598)</label>
              <select id="detail-fiber-tube" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 4px 6px;">
                <option value="Biru (Tube 1)" ${tube.includes("Biru") ? "selected" : ""}>\u{1F535} Biru (Tube 1)</option>
                <option value="Oranye (Tube 2)" ${tube.includes("Oranye") ? "selected" : ""}>\u{1F7E0} Oranye (Tube 2)</option>
                <option value="Hijau (Tube 3)" ${tube.includes("Hijau") ? "selected" : ""}>\u{1F7E2} Hijau (Tube 3)</option>
                <option value="Cokelat (Tube 4)" ${tube.includes("Cokelat") ? "selected" : ""}>\u{1F7E4} Cokelat (Tube 4)</option>
                <option value="Abu-abu (Tube 5)" ${tube.includes("Abu-abu") ? "selected" : ""}>\u26AA Abu-abu (Tube 5)</option>
                <option value="Putih (Tube 6)" ${tube.includes("Putih") ? "selected" : ""}>\u26AA Putih (Tube 6)</option>
              </select>
            </div>

            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Konektor Sumber (A)</label>
              <select id="detail-fiber-conn-src" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 4px 6px;">
                <option value="LC/UPC" ${connSrc === "LC/UPC" ? "selected" : ""}>LC/UPC (Biru)</option>
                <option value="LC/APC" ${connSrc === "LC/APC" ? "selected" : ""}>LC/APC (Hijau)</option>
                <option value="SC/UPC" ${connSrc === "SC/UPC" ? "selected" : ""}>SC/UPC (Biru)</option>
                <option value="SC/APC" ${connSrc === "SC/APC" ? "selected" : ""}>SC/APC (Hijau)</option>
                <option value="FC/UPC" ${connSrc === "FC/UPC" ? "selected" : ""}>FC/UPC (Ulir)</option>
                <option value="ST" ${connSrc === "ST" ? "selected" : ""}>ST (Bayonet)</option>
                <option value="MPO/MTP" ${connSrc === "MPO/MTP" ? "selected" : ""}>MPO/MTP (Multi)</option>
              </select>
            </div>

            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Konektor Tujuan (B)</label>
              <select id="detail-fiber-conn-dest" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 4px 6px;">
                <option value="LC/UPC" ${connDest === "LC/UPC" ? "selected" : ""}>LC/UPC (Biru)</option>
                <option value="LC/APC" ${connDest === "LC/APC" ? "selected" : ""}>LC/APC (Hijau)</option>
                <option value="SC/UPC" ${connDest === "SC/UPC" ? "selected" : ""}>SC/UPC (Biru)</option>
                <option value="SC/APC" ${connDest === "SC/APC" ? "selected" : ""}>SC/APC (Hijau)</option>
                <option value="FC/UPC" ${connDest === "FC/UPC" ? "selected" : ""}>FC/UPC (Ulir)</option>
                <option value="ST" ${connDest === "ST" ? "selected" : ""}>ST (Bayonet)</option>
                <option value="MPO/MTP" ${connDest === "MPO/MTP" ? "selected" : ""}>MPO/MTP (Multi)</option>
              </select>
            </div>

            <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Alokasi / Label Core Aktif</label>
              <input type="text" id="detail-fiber-active-cores" value="${this.escapeHtml(activeCores)}" placeholder="Core 1-2: Uplink SW-Core..."
                     style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 11px; padding: 4px 6px;">
            </div>

            <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Panjang Gelombang (Wavelength)</label>
              <select id="detail-fiber-wave" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 4px 6px;">
                <option value="1310/1550nm (OS2)" ${wave.includes("1310") ? "selected" : ""}>1310 / 1550 nm (Single Mode OS2)</option>
                <option value="850/1300nm (OM3)" ${wave.includes("850") ? "selected" : ""}>850 / 1300 nm (Multi Mode OM3)</option>
                <option value="1270-1610nm (CWDM)" ${wave.includes("CWDM") ? "selected" : ""}>CWDM (1270-1610 nm)</option>
                <option value="DWDM C-Band" ${wave.includes("DWDM") ? "selected" : ""}>DWDM C-Band Dense</option>
              </select>
            </div>
          </div>
        </div>
      `;
      }
      if (mediaType === "twisted-pair") {
        const ethComp = metrics.ethernetCompliance;
        const poeData = metrics.poeAnalysis;
        const shield = details.shielding || (category === "cat6a" ? "S/FTP" : "U/UTP");
        const standard = details.wiringStandard || "T568B";
        const poe = details.poeSupport || "poe+";
        const portSrc = details.portSource || "";
        const portDest = details.portDestination || "";
        const jacket = details.jacketType || "indoor-pvc";
        return `
        <!-- LAN / Twisted Pair Details Card -->
        <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="width: 10px; height: 10px; border-radius: 50%; background: ${catDef.color};"></span>
              <span style="font-size: 11px; font-weight: 700; color: var(--text-primary); text-transform: uppercase;">
                ${catDef.name}
              </span>
            </div>
            <span style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">
              4 Pair 100\u03A9
            </span>
          </div>

          <!-- IEEE 802.3 100-Meter Compliance Box -->
          <div style="background: ${ethComp.status === "exceeded" ? "rgba(239, 68, 68, 0.12)" : ethComp.status === "warning" ? "rgba(245, 158, 11, 0.12)" : "var(--bg-primary)"}; 
                      border: 1px solid ${ethComp.status === "exceeded" ? "rgba(239, 68, 68, 0.4)" : ethComp.status === "warning" ? "rgba(245, 158, 11, 0.4)" : "var(--border-color)"}; 
                      border-radius: 6px; padding: 8px 10px; font-size: 11px; display: flex; flex-direction: column; gap: 5px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="font-weight: 700; color: ${ethComp.badgeColor}; display: flex; align-items: center; gap: 5px;">
                ${ethComp.status === "exceeded" ? "\u26A0\uFE0F" : ethComp.status === "warning" ? "\u26A0\uFE0F" : "\u2713"}
                ${ethComp.badgeText}
              </span>
              <span style="font-family: var(--font-mono); font-size: 10px; color: var(--text-muted);">
                ${ethComp.marginMeters >= 0 ? `Sisa Margin: ${ethComp.marginMeters}m` : `Kelebihan: ${Math.abs(ethComp.marginMeters)}m`}
              </span>
            </div>
            <div style="color: ${ethComp.status === "exceeded" ? "var(--status-offline)" : ethComp.status === "warning" ? "var(--status-warning)" : "var(--text-secondary)"}; font-size: 10.5px; line-height: 1.4;">
              ${ethComp.message}
            </div>
            ${ethComp.status === "exceeded" ? `
              <div style="margin-top: 2px; padding: 4px 6px; background: rgba(239, 68, 68, 0.15); border-radius: 4px; font-size: 10px; color: var(--text-primary);">
                \u{1F4A1} <strong>Solusi Rekayasa:</strong> Tambahkan PoE Extender, Switch Distribusi perantara di titik &lt;90m, atau ganti link ini ke Fiber Optic Single Mode.
              </div>
            ` : ""}
          </div>

          <!-- Network Performance Metrics (Latency & Attenuation) -->
          <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="color: var(--text-muted); font-size: 10px;">Latensi Propagasi Fisik</span>
              <span style="font-family: var(--font-mono); font-weight: 700; color: var(--text-primary);">
                ${metrics.latency.delayNanoseconds} ns <span style="font-size: 9px; font-weight: normal; color: var(--text-muted);">(${metrics.latency.delayMicroseconds} \xB5s)</span>
              </span>
              <span style="font-size: 9.5px; color: var(--text-muted);">NVP: ${metrics.latency.nvpPercent}% kecepatan cahaya</span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="color: var(--text-muted); font-size: 10px;">Redaman Sinyal (Loss)</span>
              <span style="font-family: var(--font-mono); font-weight: 700; color: ${metrics.attenuationDb > 20 ? "var(--status-warning)" : "var(--status-online)"};">
                ${metrics.attenuationDb.toFixed(2)} dB
              </span>
              <span style="font-size: 9.5px; color: var(--text-muted);">Termasuk 2x RJ45 Term</span>
            </div>
          </div>

          <!-- PoE Analysis Card (if PoE enabled) -->
          ${poeData ? `
            <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; display: flex; flex-direction: column; gap: 5px;">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 10.5px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 4px;">
                  <i data-lucide="zap" style="width: 12px; height: 12px; color: var(--accent-orange);"></i>
                  Analisis Drop Daya PoE (${poeData.standard.toUpperCase()})
                </span>
                <span style="font-size: 10px; font-weight: 700; color: ${poeData.efficiencyPercent < 80 ? "var(--status-warning)" : "var(--status-online)"}; font-family: var(--font-mono);">
                  Efisiensi: ${poeData.efficiencyPercent}%
                </span>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 10.5px; margin-top: 2px;">
                <div style="display: flex; justify-content: space-between; padding: 2px 4px; background: var(--bg-secondary); border-radius: 3px;">
                  <span style="color: var(--text-muted);">Hambatan Loop:</span>
                  <span style="font-family: var(--font-mono); font-weight: 600;">${poeData.totalResistanceOhm} \u03A9</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 2px 4px; background: var(--bg-secondary); border-radius: 3px;">
                  <span style="color: var(--text-muted);">Drop Voltase:</span>
                  <span style="font-family: var(--font-mono); font-weight: 600; color: ${poeData.voltageDropVolts > 5 ? "var(--status-warning)" : "var(--text-primary)"};">-${poeData.voltageDropVolts} V</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 2px 4px; background: var(--bg-secondary); border-radius: 3px;">
                  <span style="color: var(--text-muted);">Voltase Tiba:</span>
                  <span style="font-family: var(--font-mono); font-weight: 600;">${poeData.deliveredVoltageVolts} V</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 2px 4px; background: var(--bg-secondary); border-radius: 3px;">
                  <span style="color: var(--text-muted);">Daya Diterima:</span>
                  <span style="font-family: var(--font-mono); font-weight: 600; color: var(--accent-green);">${poeData.deliveredPowerWatts} W</span>
                </div>
              </div>
            </div>
          ` : ""}

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Shielding (Pelindung)</label>
              <select id="detail-lan-shield" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 4px 6px;">
                <option value="U/UTP" ${shield === "U/UTP" ? "selected" : ""}>U/UTP (Unshielded)</option>
                <option value="F/UTP" ${shield === "F/UTP" ? "selected" : ""}>F/UTP (Foiled Luar)</option>
                <option value="S/FTP" ${shield === "S/FTP" ? "selected" : ""}>S/FTP (Shielded)</option>
                <option value="SF/UTP" ${shield === "SF/UTP" ? "selected" : ""}>SF/UTP (Screened)</option>
              </select>
            </div>

            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Standar Crimping</label>
              <select id="detail-lan-standard" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 4px 6px;">
                <option value="T568B" ${standard === "T568B" ? "selected" : ""}>T568B (Straight)</option>
                <option value="T568A" ${standard === "T568A" ? "selected" : ""}>T568A (Straight)</option>
                <option value="Crossover" ${standard === "Crossover" ? "selected" : ""}>Crossover (D2D)</option>
              </select>
            </div>

            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Dukungan PoE (Daya)</label>
              <select id="detail-lan-poe" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 4px 6px;">
                <option value="none" ${poe === "none" ? "selected" : ""}>Non-PoE (Data)</option>
                <option value="poe" ${poe === "poe" ? "selected" : ""}>PoE 802.3af (15.4W)</option>
                <option value="poe+" ${poe === "poe+" ? "selected" : ""}>PoE+ 802.3at (30W)</option>
                <option value="poe++" ${poe === "poe++" ? "selected" : ""}>PoE++ 802.3bt (60-90W)</option>
              </select>
            </div>

            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Material Jaket</label>
              <select id="detail-lan-jacket" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 4px 6px;">
                <option value="indoor-pvc" ${jacket === "indoor-pvc" ? "selected" : ""}>PVC (Indoor)</option>
                <option value="lszh" ${jacket === "lszh" ? "selected" : ""}>LSZH (Low Smoke)</option>
                <option value="outdoor-pe" ${jacket === "outdoor-pe" ? "selected" : ""}>Outdoor UV PE</option>
                <option value="armored" ${jacket === "armored" ? "selected" : ""}>Steel Armored</option>
              </select>
            </div>

            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Port Sumber (A)</label>
              <input type="text" id="detail-lan-port-src" value="${this.escapeHtml(portSrc)}" placeholder="Gi0/1, Eth1..."
                     style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 11px; padding: 4px 6px; font-family: var(--font-mono);">
            </div>

            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Port Tujuan (B)</label>
              <input type="text" id="detail-lan-port-dest" value="${this.escapeHtml(portDest)}" placeholder="Eth0, LAN1..."
                     style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 11px; padding: 4px 6px; font-family: var(--font-mono);">
            </div>
          </div>
        </div>
      `;
      }
      if (mediaType === "coaxial") {
        const coaxType = details.coaxType || "RG-6";
        const impedance = details.impedance || "75 Ohm";
        const coaxConn = details.coaxConnector || "BNC Compression";
        const isSiamese = details.isSiamese !== void 0 ? details.isSiamese : true;
        return `
        <!-- Coaxial Details Card -->
        <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="width: 10px; height: 10px; border-radius: 50%; background: ${catDef.color};"></span>
              <span style="font-size: 11px; font-weight: 700; color: var(--text-primary); text-transform: uppercase;">
                Coaxial RF & CCTV Video
              </span>
            </div>
            <span style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">
              ${impedance}
            </span>
          </div>

          <!-- Coaxial Metrics -->
          <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 6px 8px; display: flex; align-items: center; justify-content: space-between; font-size: 11px;">
            <span style="color: var(--text-muted);">Redaman RF (${len.toFixed(1)}m):</span>
            <span style="font-weight: 700; color: ${metrics.attenuationDb > 15 ? "var(--status-warning)" : "var(--status-online)"}; font-family: var(--font-mono);">
              ${metrics.attenuationDb.toFixed(2)} dB
            </span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Tipe Coaxial</label>
              <select id="detail-coax-type" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 4px 6px;">
                <option value="RG-59" ${coaxType === "RG-59" ? "selected" : ""}>RG-59 (&lt;150m)</option>
                <option value="RG-6" ${coaxType === "RG-6" ? "selected" : ""}>RG-6 (Std &lt;300m)</option>
                <option value="RG-11" ${coaxType === "RG-11" ? "selected" : ""}>RG-11 (Trunk &lt;600m)</option>
              </select>
            </div>

            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Impedansi</label>
              <select id="detail-coax-impedance" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 3px 6px;">
                <option value="75 Ohm" ${impedance === "75 Ohm" ? "selected" : ""}>75 Ohm (CCTV / TV)</option>
                <option value="50 Ohm" ${impedance === "50 Ohm" ? "selected" : ""}>50 Ohm (RF / Radio)</option>
              </select>
            </div>

            <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Tipe Konektor Ujung</label>
              <select id="detail-coax-conn" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 3px 6px;">
                <option value="BNC Compression" ${coaxConn.includes("Compression") ? "selected" : ""}>BNC Male Compression (Pro)</option>
                <option value="BNC Crimp-On" ${coaxConn.includes("Crimp") ? "selected" : ""}>BNC Crimp-On</option>
                <option value="BNC Twist-On" ${coaxConn.includes("Twist") ? "selected" : ""}>BNC Twist-On</option>
                <option value="F-Connector" ${coaxConn.includes("F-") ? "selected" : ""}>F-Connector Drat</option>
                <option value="SMA Male" ${coaxConn.includes("SMA") ? "selected" : ""}>SMA / RP-SMA (RF)</option>
              </select>
            </div>

            <div style="grid-column: span 2; display: flex; align-items: center; gap: 6px; padding: 4px 0;">
              <input type="checkbox" id="detail-coax-siamese" ${isSiamese ? "checked" : ""} style="accent-color: var(--accent-blue);">
              <label for="detail-coax-siamese" style="font-size: 11px; color: var(--text-primary); cursor: pointer;">
                Kabel Siamese (Kombinasi Coax + 2-Core Kabel Power DC 12V)
              </label>
            </div>
          </div>
        </div>
      `;
      }
      const freq = details.frequency || "5 GHz";
      const chWidth = details.channelWidth || "40 MHz";
      const rssi = details.signalRssi || "-58 dBm";
      return `
      <!-- Wireless Link Details Card -->
      <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="width: 10px; height: 10px; border-radius: 50%; background: ${catDef.color};"></span>
            <span style="font-size: 11px; font-weight: 700; color: var(--text-primary); text-transform: uppercase;">
              Wireless Point-to-Point Link
            </span>
          </div>
          <span style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">
            AirMax / PtP
          </span>
        </div>

        <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 6px 8px; display: flex; align-items: center; justify-content: space-between; font-size: 11px;">
          <span style="color: var(--text-muted);">Jarak Udara LoS:</span>
          <span style="font-weight: 700; color: var(--accent-sky); font-family: var(--font-mono);">
            ${len.toFixed(1)} Meter
          </span>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <label style="font-size: 10px; color: var(--text-muted);">Frekuensi Radio</label>
            <select id="detail-wireless-freq" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 3px 6px;">
              <option value="5 GHz" ${freq.includes("5") ? "selected" : ""}>5 GHz AC/AX (Standar PtP)</option>
              <option value="2.4 GHz" ${freq.includes("2.4") ? "selected" : ""}>2.4 GHz (Jarak Jauh/Halangan)</option>
              <option value="60 GHz" ${freq.includes("60") ? "selected" : ""}>60 GHz Terragraph (Multi-Gigabit)</option>
              <option value="24 GHz" ${freq.includes("24") ? "selected" : ""}>24 GHz License-Free Backhaul</option>
            </select>
          </div>

          <div style="display: flex; flex-direction: column; gap: 2px;">
            <label style="font-size: 10px; color: var(--text-muted);">Lebar Kanal</label>
            <select id="detail-wireless-width" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 3px 6px;">
              <option value="20 MHz" ${chWidth === "20 MHz" ? "selected" : ""}>20 MHz (Tahan Interferensi)</option>
              <option value="40 MHz" ${chWidth === "40 MHz" ? "selected" : ""}>40 MHz (Standar Seimbang)</option>
              <option value="80 MHz" ${chWidth === "80 MHz" ? "selected" : ""}>80 MHz (High Throughput)</option>
              <option value="160 MHz" ${chWidth === "160 MHz" ? "selected" : ""}>160 MHz (Ultra Speed)</option>
            </select>
          </div>

          <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 2px;">
            <label style="font-size: 10px; color: var(--text-muted);">Kualitas Sinyal Target (RSSI)</label>
            <input type="text" id="detail-wireless-rssi" value="${this.escapeHtml(rssi)}" placeholder="-55 dBm..."
                   style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 11px; padding: 3px 6px; font-family: var(--font-mono);">
          </div>
        </div>
      </div>
    `;
    }
    escapeHtml(str) {
      if (!str) return "";
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
  };

  // js/ui/viewport-navigator.js
  var ViewportNavigator = class {
    /**
     * @param {Konva.Stage} stage 
     * @param {{width: number, height: number}} mapDimensions 
     */
    constructor(stage, mapDimensions = { width: 1024, height: 1024 }) {
      this.stage = stage;
      this.mapDimensions = mapDimensions;
    }
    /**
     * Smoothly focus camera on a specific device and trigger selection
     * @param {Object} device 
     * @param {number} [targetScale=1.4] 
     * @param {number} [duration=400] 
     */
    focusOnDevice(device, targetScale = 1.4, duration = 400) {
      if (!device || !device.position) return;
      const targetX = device.position.x * this.mapDimensions.width;
      const targetY = device.position.y * this.mapDimensions.height;
      const containerWidth = this.stage.width();
      const containerHeight = this.stage.height();
      const scale = clamp2(targetScale, 0.5, 4);
      const newX = containerWidth / 2 - targetX * scale;
      const newY = containerHeight / 2 - targetY * scale;
      if (window.Konva && window.Konva.Tween) {
        new Konva.Tween({
          node: this.stage,
          duration: duration / 1e3,
          easing: Konva.Easings.EaseInOut,
          scaleX: scale,
          scaleY: scale,
          x: newX,
          y: newY,
          onFinish: () => {
            this.stage.batchDraw();
            eventBus.emit("device:selected", device);
          }
        }).play();
      } else {
        this.stage.scale({ x: scale, y: scale });
        this.stage.position({ x: newX, y: newY });
        this.stage.batchDraw();
        eventBus.emit("device:selected", device);
      }
    }
    /**
     * Smoothly focus on arbitrary normalized coordinate
     * @param {{x: number, y: number}} normalizedPos 
     * @param {number} [targetScale=1.2] 
     */
    focusOnCoordinates(normalizedPos, targetScale = 1.2) {
      const targetX = normalizedPos.x * this.mapDimensions.width;
      const targetY = normalizedPos.y * this.mapDimensions.height;
      const containerWidth = this.stage.width();
      const containerHeight = this.stage.height();
      const scale = clamp2(targetScale, 0.5, 4);
      const newX = containerWidth / 2 - targetX * scale;
      const newY = containerHeight / 2 - targetY * scale;
      if (window.Konva && window.Konva.Tween) {
        new Konva.Tween({
          node: this.stage,
          duration: 0.35,
          easing: Konva.Easings.EaseInOut,
          scaleX: scale,
          scaleY: scale,
          x: newX,
          y: newY,
          onFinish: () => {
            this.stage.batchDraw();
          }
        }).play();
      } else {
        this.stage.scale({ x: scale, y: scale });
        this.stage.position({ x: newX, y: newY });
        this.stage.batchDraw();
      }
    }
  };

  // js/search/search-engine.js
  var SearchEngine = class {
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
      if (!query || query.trim() === "") return [];
      const tokens = query.trim().toLowerCase().split(/\s+/);
      const devices = this.deviceManager.getAllDevices();
      return devices.filter((device) => {
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
          device.network?.vlan ? `vlan ${device.network.vlan}` : "",
          device.network?.vlan ? `vlan${device.network.vlan}` : "",
          device.notes
        ].filter(Boolean).map((f) => String(f).toLowerCase());
        const fullText = fields.join(" ");
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
  };

  // js/search/search-ui.js
  var SearchUI = class {
    /**
     * @param {Object} options
     * @param {HTMLInputElement} options.inputElement
     * @param {SearchEngine} options.searchEngine
     * @param {import('../ui/viewport-navigator.js').ViewportNavigator} options.viewportNavigator
     */
    constructor({ inputElement, searchEngine, viewportNavigator }) {
      this.input = inputElement;
      this.searchEngine = searchEngine;
      this.viewportNavigator = viewportNavigator;
      this.dropdown = null;
      this.results = [];
      this.selectedIndex = -1;
      this.createDropdown();
      this.bindEvents();
    }
    createDropdown() {
      this.dropdown = document.createElement("div");
      this.dropdown.id = "search-suggestions-dropdown";
      this.dropdown.style.cssText = `
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      width: 320px;
      max-height: 380px;
      overflow-y: auto;
      background-color: var(--bg-secondary);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      z-index: 100;
      display: none;
      flex-direction: column;
      gap: 2px;
      padding: 6px;
    `;
      const searchBox = this.input.closest(".search-box") || this.input.parentElement;
      searchBox.style.position = "relative";
      searchBox.appendChild(this.dropdown);
    }
    bindEvents() {
      this.input.addEventListener("input", () => {
        const query = this.input.value;
        if (!query || query.trim().length === 0) {
          this.hideDropdown();
          return;
        }
        this.results = this.searchEngine.searchDevices(query);
        this.selectedIndex = -1;
        this.renderDropdown(this.results);
      });
      this.input.addEventListener("keydown", (e) => {
        if (this.dropdown.style.display === "none") return;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          this.selectedIndex = Math.min(this.selectedIndex + 1, this.results.length - 1);
          this.updateActiveItem();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
          this.updateActiveItem();
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (this.selectedIndex >= 0 && this.results[this.selectedIndex]) {
            this.selectDevice(this.results[this.selectedIndex]);
          } else if (this.results.length > 0) {
            this.selectDevice(this.results[0]);
          }
        } else if (e.key === "Escape") {
          this.hideDropdown();
        }
      });
      document.addEventListener("click", (e) => {
        if (!this.input.contains(e.target) && !this.dropdown.contains(e.target)) {
          this.hideDropdown();
        }
      });
    }
    renderDropdown(results) {
      if (results.length === 0) {
        this.dropdown.innerHTML = `
        <div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 12px;">
          Tidak ada perangkat yang cocok dengan pencarian
        </div>
      `;
        this.dropdown.style.display = "flex";
        return;
      }
      let html = "";
      results.slice(0, 10).forEach((dev, idx) => {
        const cat = DEVICE_CATEGORIES[dev.category] || DEVICE_CATEGORIES.core;
        const statusDef = DEVICE_STATUSES[dev.status] || DEVICE_STATUSES.unknown;
        html += `
        <div class="search-item" data-index="${idx}" style="padding: 8px 10px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 8px; transition: background 120ms ease;">
          <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
            <span style="font-size: 9px; font-weight: 700; color: ${cat.color}; background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px; font-family: var(--font-mono); text-transform: uppercase;">
              ${dev.type.substring(0, 3)}
            </span>
            <div style="display: flex; flex-direction: column; min-width: 0;">
              <span style="font-size: 12px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${this.escapeHtml(dev.name)}
              </span>
              <span style="font-size: 10px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${dev.location || dev.brand || ""}
              </span>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0;">
            <span style="font-size: 11px; font-family: var(--font-mono); color: var(--accent-sky);">
              ${dev.network?.ip || "No IP"}
            </span>
            <span style="font-size: 9px; color: ${statusDef.color}; font-weight: 600; text-transform: uppercase;">
              \u25CF ${statusDef.name}
            </span>
          </div>
        </div>
      `;
      });
      this.dropdown.innerHTML = html;
      this.dropdown.style.display = "flex";
      this.dropdown.querySelectorAll(".search-item").forEach((itemEl) => {
        itemEl.addEventListener("click", () => {
          const idx = parseInt(itemEl.getAttribute("data-index"), 10);
          if (results[idx]) {
            this.selectDevice(results[idx]);
          }
        });
        itemEl.addEventListener("mouseenter", () => {
          itemEl.style.backgroundColor = "var(--bg-tertiary)";
        });
        itemEl.addEventListener("mouseleave", () => {
          if (parseInt(itemEl.getAttribute("data-index"), 10) !== this.selectedIndex) {
            itemEl.style.backgroundColor = "transparent";
          }
        });
      });
    }
    updateActiveItem() {
      const items = this.dropdown.querySelectorAll(".search-item");
      items.forEach((item, idx) => {
        if (idx === this.selectedIndex) {
          item.style.backgroundColor = "var(--bg-tertiary)";
          item.scrollIntoView({ block: "nearest" });
        } else {
          item.style.backgroundColor = "transparent";
        }
      });
    }
    selectDevice(device) {
      this.hideDropdown();
      this.input.value = "";
      this.viewportNavigator.focusOnDevice(device, 1.4);
    }
    hideDropdown() {
      this.dropdown.style.display = "none";
      this.selectedIndex = -1;
    }
    escapeHtml(str) {
      if (!str) return "";
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
  };

  // js/topology/topology-generator.js
  var TopologyGenerator = class {
    /**
     * @param {import('../devices/device-manager.js').DeviceManager} deviceManager 
     * @param {import('../connections/cable-manager.js').CableManager} cableManager 
     */
    constructor(deviceManager, cableManager) {
      this.deviceManager = deviceManager;
      this.cableManager = cableManager;
    }
    /**
     * Generate Cytoscape elements for Physical Topology
     * @returns {Object[]}
     */
    generatePhysicalElements() {
      const devices = this.deviceManager.getAllDevices();
      const cables = this.cableManager.getAllConnections();
      const elements = [];
      devices.forEach((dev) => {
        const cat = DEVICE_CATEGORIES[dev.category] || DEVICE_CATEGORIES.core;
        const statusDef = DEVICE_STATUSES[dev.status] || DEVICE_STATUSES.unknown;
        elements.push({
          group: "nodes",
          data: {
            id: dev.id,
            name: dev.name,
            label: `${dev.name}
${dev.network?.ip || ""}`,
            category: dev.category,
            type: dev.type,
            status: dev.status,
            statusColor: statusDef.color,
            catColor: cat.color,
            location: dev.location,
            ip: dev.network?.ip || ""
          }
        });
      });
      cables.forEach((cable) => {
        const catDef = getCableDefByCategory(cable.cableCategory);
        const edgeColor = cable.customColor && cable.customColor.trim() ? cable.customColor.trim() : catDef.color;
        elements.push({
          group: "edges",
          data: {
            id: cable.id,
            source: cable.source,
            target: cable.destination,
            label: catDef.name,
            cableCategory: cable.cableCategory,
            status: cable.status,
            lineColor: edgeColor,
            length: cable.length
          }
        });
      });
      return elements;
    }
    /**
     * Generate Cytoscape elements for Logical Topology (Grouped by VLAN)
     * @returns {Object[]}
     */
    generateLogicalElements() {
      const devices = this.deviceManager.getAllDevices();
      const cables = this.cableManager.getAllConnections();
      const elements = [];
      const vlanMap = /* @__PURE__ */ new Map();
      devices.forEach((dev) => {
        const vlanId = dev.network?.vlan || 1;
        if (!vlanMap.has(vlanId)) {
          vlanMap.set(vlanId, []);
        }
        vlanMap.get(vlanId).push(dev);
      });
      vlanMap.forEach((devs, vlanId) => {
        const groupNodeId = `vlan-group-${vlanId}`;
        const vlanName = this.getVlanFriendlyName(vlanId);
        elements.push({
          group: "nodes",
          data: {
            id: groupNodeId,
            label: `VLAN ${vlanId} \u2014 ${vlanName} (${devs.length} Perangkat)`,
            isGroup: true
          }
        });
        devs.forEach((dev) => {
          const cat = DEVICE_CATEGORIES[dev.category] || DEVICE_CATEGORIES.core;
          const statusDef = DEVICE_STATUSES[dev.status] || DEVICE_STATUSES.unknown;
          elements.push({
            group: "nodes",
            data: {
              id: dev.id,
              parent: groupNodeId,
              name: dev.name,
              label: `${dev.name}
${dev.network?.ip || ""}`,
              category: dev.category,
              type: dev.type,
              status: dev.status,
              statusColor: statusDef.color,
              catColor: cat.color,
              location: dev.location,
              ip: dev.network?.ip || ""
            }
          });
        });
      });
      cables.forEach((cable) => {
        const catDef = getCableDefByCategory(cable.cableCategory);
        const edgeColor = cable.customColor && cable.customColor.trim() ? cable.customColor.trim() : catDef.color;
        elements.push({
          group: "edges",
          data: {
            id: cable.id,
            source: cable.source,
            target: cable.destination,
            label: catDef.name,
            cableCategory: cable.cableCategory,
            status: cable.status,
            lineColor: edgeColor,
            length: cable.length
          }
        });
      });
      return elements;
    }
    getVlanFriendlyName(vlanId) {
      const names = {
        1: "Default / Management",
        10: "Servers & Core Infrastructure",
        20: "Staff & Ruang Dosen",
        30: "Mahasiswa & Wi-Fi Public",
        100: "CCTV Surveillance & Security"
      };
      return names[vlanId] || `Network Segment ${vlanId}`;
    }
  };

  // js/topology/topology-layout.js
  var TOPOLOGY_STYLESHEET = [
    // Regular Nodes
    {
      selector: "node[!isGroup]",
      style: {
        "shape": "round-rectangle",
        "width": 130,
        "height": 60,
        "background-color": "#18350d",
        "border-width": 2,
        "border-color": "data(catColor)",
        "label": "data(label)",
        "color": "#fff8cf",
        "font-size": 11,
        "font-family": "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        "text-valign": "center",
        "text-halign": "center",
        "text-wrap": "wrap",
        "text-max-width": 120,
        "text-margin-y": 0,
        "shadow-blur": 10,
        "shadow-color": "rgba(0, 0, 0, 0.3)",
        "shadow-opacity": 0.8
      }
    },
    // Compound / Group Nodes (VLAN Containers)
    {
      selector: "node[isGroup]",
      style: {
        "shape": "round-rectangle",
        "background-color": "rgba(118, 196, 87, 0.15)",
        "border-width": 1.5,
        "border-color": "#76c457",
        "border-style": "dashed",
        "label": "data(label)",
        "color": "#2a7c13",
        "font-size": 12,
        "font-weight": "bold",
        "font-family": "'Poppins', -apple-system, sans-serif",
        "text-valign": "top",
        "text-halign": "center",
        "text-margin-y": -8,
        "padding": 20
      }
    },
    // Selected Node
    {
      selector: "node:selected",
      style: {
        "border-color": "#76c457",
        "border-width": 3,
        "shadow-color": "#76c457",
        "shadow-blur": 15,
        "shadow-opacity": 1
      }
    },
    // Edges
    {
      selector: "edge",
      style: {
        "width": 3,
        "line-color": "data(lineColor)",
        "curve-style": "bezier",
        "target-arrow-shape": "triangle",
        "target-arrow-color": "data(lineColor)",
        "arrow-scale": 1.2,
        "label": "data(label)",
        "color": "#678458",
        "font-size": 9,
        "font-family": "ui-monospace, monospace",
        "text-background-color": "#18350d",
        "text-background-opacity": 0.85,
        "text-background-padding": 3,
        "text-background-shape": "roundrectangle"
      }
    },
    // Selected Edge
    {
      selector: "edge:selected",
      style: {
        "width": 5,
        "line-color": "#76c457",
        "target-arrow-color": "#76c457",
        "color": "#fff8cf"
      }
    }
  ];
  function getDagreLayoutOptions(rankDir = "TB") {
    return {
      name: window.cytoscape && window.cytoscape("dagre") ? "dagre" : "cose",
      rankDir,
      // 'TB' = Top to Bottom, 'LR' = Left to Right
      nodeSep: 60,
      rankSep: 90,
      animate: true,
      animationDuration: 400,
      padding: 40
    };
  }

  // js/topology/topology-modal.js
  var TopologyModal = class {
    /**
     * @param {Object} options
     * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
     * @param {import('../connections/cable-manager.js').CableManager} options.cableManager
     * @param {import('../ui/viewport-navigator.js').ViewportNavigator} options.viewportNavigator
     */
    constructor({ deviceManager, cableManager, viewportNavigator }) {
      this.deviceManager = deviceManager;
      this.cableManager = cableManager;
      this.viewportNavigator = viewportNavigator;
      this.generator = new TopologyGenerator(this.deviceManager, this.cableManager);
      this.cy = null;
      this.activeMode = "physical";
      this.modalEl = null;
      this.createModalDOM();
      this.bindEvents();
    }
    createModalDOM() {
      this.modalEl = document.createElement("div");
      this.modalEl.id = "network-topology-modal";
      this.modalEl.style.cssText = `
      position: fixed;
      inset: 0;
      background-color: var(--modal-backdrop);
      backdrop-filter: blur(8px);
      z-index: 1000;
      display: none;
      flex-direction: column;
    `;
      this.modalEl.innerHTML = `
      <!-- Modal Header -->
      <div style="height: 54px; border-bottom: 1px solid var(--border-light); background: var(--bg-secondary); display: flex; align-items: center; justify-content: space-between; padding: 0 20px;">
        <div style="display: flex; align-items: center; gap: 16px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <i data-lucide="git-fork" style="width: 20px; height: 20px; color: var(--accent-sky);"></i>
            <span style="font-size: 15px; font-weight: 700; color: var(--text-primary);">Topologi Jaringan</span>
          </div>

          <!-- Mode Switcher -->
          <div class="segmented-control">
            <button id="topo-tab-physical" class="segmented-item active">
              <i data-lucide="network" style="width: 13px; height: 13px;"></i>
              <span>Topologi Fisik</span>
            </button>
            <button id="topo-tab-logical" class="segmented-item">
              <i data-lucide="layers" style="width: 13px; height: 13px;"></i>
              <span>Topologi Logis (VLAN)</span>
            </button>
          </div>
        </div>

        <!-- Controls -->
        <div style="display: flex; align-items: center; gap: 8px;">
          <button id="topo-btn-fit" class="btn btn-secondary btn-sm" title="Sesuaikan Tampilan">
            <i data-lucide="maximize" style="width: 13px; height: 13px;"></i>
            <span>Fit</span>
          </button>
          <button id="topo-btn-zoom-in" class="btn btn-icon btn-sm" title="Zoom In">
            <i data-lucide="plus" style="width: 14px; height: 14px;"></i>
          </button>
          <button id="topo-btn-zoom-out" class="btn btn-icon btn-sm" title="Zoom Out">
            <i data-lucide="minus" style="width: 14px; height: 14px;"></i>
          </button>
          <div class="divider-vertical"></div>
          <button id="topo-btn-export-png" class="btn btn-secondary btn-sm" title="Ekspor Gambar PNG">
            <i data-lucide="download" style="width: 13px; height: 13px;"></i>
            <span>Ekspor PNG</span>
          </button>
          <button id="topo-btn-close" class="btn btn-icon" title="Tutup Modal">
            <i data-lucide="x" style="width: 18px; height: 18px;"></i>
          </button>
        </div>
      </div>

      <!-- Main Cytoscape Viewport -->
      <div id="cy-topology-container" style="flex: 1; width: 100%; height: 100%; position: relative; background: var(--bg-primary);"></div>

      <!-- Bottom Inspector Bar inside Modal -->
      <div id="topo-inspector-bar" style="height: 48px; border-top: 1px solid var(--border-light); background: var(--bg-secondary); display: flex; align-items: center; justify-content: space-between; padding: 0 20px; font-size: 12px; color: var(--text-muted);">
        <div id="topo-selected-info" style="display: flex; align-items: center; gap: 12px;">
          <span>Klik node perangkat atau kabel pada diagram untuk melihat relasi.</span>
        </div>
        <div id="topo-focus-btn-container" style="display: none;">
          <button id="topo-btn-focus-map" class="btn btn-primary btn-sm">
            <i data-lucide="map-pin" style="width: 13px; height: 13px;"></i>
            <span>Fokus pada Denah Peta</span>
          </button>
        </div>
      </div>
    `;
      document.body.appendChild(this.modalEl);
    }
    bindEvents() {
      document.getElementById("topo-btn-close")?.addEventListener("click", () => this.hide());
      const tabPhys = document.getElementById("topo-tab-physical");
      const tabLog = document.getElementById("topo-tab-logical");
      tabPhys?.addEventListener("click", () => {
        this.activeMode = "physical";
        tabPhys.classList.add("active");
        tabLog?.classList.remove("active");
        this.renderGraph();
      });
      tabLog?.addEventListener("click", () => {
        this.activeMode = "logical";
        tabLog.classList.add("active");
        tabPhys?.classList.remove("active");
        this.renderGraph();
      });
      document.getElementById("topo-btn-fit")?.addEventListener("click", () => {
        if (this.cy) this.cy.fit(void 0, 40);
      });
      document.getElementById("topo-btn-zoom-in")?.addEventListener("click", () => {
        if (this.cy) this.cy.zoom(this.cy.zoom() * 1.25);
      });
      document.getElementById("topo-btn-zoom-out")?.addEventListener("click", () => {
        if (this.cy) this.cy.zoom(this.cy.zoom() / 1.25);
      });
      document.getElementById("topo-btn-export-png")?.addEventListener("click", () => {
        if (!this.cy) return;
        const png64 = this.cy.png({ full: true, scale: 2, bg: "#0a0e17" });
        const a = document.createElement("a");
        a.href = png64;
        a.download = `netmap-topologi-${this.activeMode}-${Date.now()}.png`;
        a.click();
      });
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.modalEl.style.display === "flex") {
          this.hide();
        }
      });
    }
    /**
     * Open and initialize topology modal
     */
    show() {
      this.modalEl.style.display = "flex";
      if (window.lucide) window.lucide.createIcons();
      this.initCytoscape();
    }
    /**
     * Hide topology modal
     */
    hide() {
      this.modalEl.style.display = "none";
    }
    /**
     * Initialize or update Cytoscape graph
     */
    initCytoscape() {
      const container = document.getElementById("cy-topology-container");
      if (!container || !window.cytoscape) {
        console.warn("[TopologyModal] Cytoscape library not found on window");
        return;
      }
      if (!this.cy) {
        this.cy = window.cytoscape({
          container,
          style: TOPOLOGY_STYLESHEET,
          boxSelectionEnabled: false,
          wheelSensitivity: 0.25
        });
        this.cy.on("tap", "node[!isGroup]", (e) => {
          const node = e.target;
          const devId = node.id();
          const dev = this.deviceManager.getDeviceById(devId);
          this.handleNodeSelected(dev);
        });
        this.cy.on("tap", (e) => {
          if (e.target === this.cy) {
            this.resetSelectedInfo();
          }
        });
      }
      this.renderGraph();
    }
    renderGraph() {
      if (!this.cy) return;
      this.cy.elements().remove();
      const elements = this.activeMode === "logical" ? this.generator.generateLogicalElements() : this.generator.generatePhysicalElements();
      this.cy.add(elements);
      const layout = this.cy.layout(getDagreLayoutOptions("TB"));
      layout.run();
      this.cy.fit(void 0, 40);
    }
    handleNodeSelected(device) {
      if (!device) return;
      const infoEl = document.getElementById("topo-selected-info");
      const focusBtnContainer = document.getElementById("topo-focus-btn-container");
      if (infoEl) {
        infoEl.innerHTML = `
        <span style="font-weight: 700; color: #f8fafc;">${device.name}</span>
        <span style="color: var(--accent-sky); font-family: var(--font-mono);">${device.network?.ip || "No IP"}</span>
        <span style="color: var(--text-muted);">${device.brand} ${device.model}</span>
        <span style="color: var(--text-muted);">Lokasi: ${device.location || "-"}</span>
      `;
      }
      if (focusBtnContainer) {
        focusBtnContainer.style.display = "block";
        const focusBtn = document.getElementById("topo-btn-focus-map");
        if (focusBtn) {
          focusBtn.onclick = () => {
            this.hide();
            this.viewportNavigator.focusOnDevice(device, 1.4);
          };
        }
      }
    }
    resetSelectedInfo() {
      const infoEl = document.getElementById("topo-selected-info");
      const focusBtnContainer = document.getElementById("topo-focus-btn-container");
      if (infoEl) {
        infoEl.innerHTML = `<span>Klik node perangkat atau kabel pada diagram untuk melihat relasi.</span>`;
      }
      if (focusBtnContainer) {
        focusBtnContainer.style.display = "none";
      }
    }
  };

  // js/ui/ip-vlan-modal.js
  var IpVlanModal = class {
    /**
     * @param {Object} options
     * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
     * @param {import('./viewport-navigator.js').ViewportNavigator} options.viewportNavigator
     */
    constructor({ deviceManager, viewportNavigator }) {
      this.deviceManager = deviceManager;
      this.viewportNavigator = viewportNavigator;
      this.activeTab = "ipam";
      this.modalEl = null;
      this.createModalDOM();
      this.bindEvents();
    }
    createModalDOM() {
      this.modalEl = document.createElement("div");
      this.modalEl.id = "ip-vlan-documentation-modal";
      this.modalEl.style.cssText = `
      position: fixed;
      inset: 0;
      background-color: var(--modal-backdrop);
      backdrop-filter: blur(8px);
      z-index: 1000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
    `;
      this.modalEl.innerHTML = `
      <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-light); border-radius: var(--radius-lg); width: 100%; max-width: 900px; height: 85vh; display: flex; flex-direction: column; box-shadow: var(--shadow-lg); overflow: hidden;">
        
        <!-- Header -->
        <div style="height: 52px; border-bottom: 1px solid var(--border-color); background: var(--bg-tertiary); display: flex; align-items: center; justify-content: space-between; padding: 0 20px;">
          <div style="display: flex; align-items: center; gap: 16px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <i data-lucide="file-spreadsheet" style="width: 18px; height: 18px; color: var(--accent-sky);"></i>
              <span style="font-size: 15px; font-weight: 700; color: var(--text-primary);">Dokumentasi IP & VLAN</span>
            </div>

            <!-- Tab Switcher -->
            <div class="segmented-control">
              <button id="ipam-tab-btn" class="segmented-item active">
                <i data-lucide="hash" style="width: 13px; height: 13px;"></i>
                <span>Tabel IP Address (IPAM)</span>
              </button>
              <button id="vlan-tab-btn" class="segmented-item">
                <i data-lucide="layers" style="width: 13px; height: 13px;"></i>
                <span>Segmentasi VLAN</span>
              </button>
            </div>
          </div>

          <button id="ip-modal-btn-close" class="btn btn-icon btn-sm" title="Tutup">
            <i data-lucide="x" style="width: 18px; height: 18px;"></i>
          </button>
        </div>

        <!-- Filter / Search Subheader -->
        <div style="padding: 10px 20px; border-bottom: 1px solid var(--border-color); background: var(--bg-primary); display: flex; align-items: center; justify-content: space-between; gap: 12px;">
          <div class="search-box" style="width: 280px;">
            <i data-lucide="search" style="width: 14px; height: 14px; color: var(--text-muted);"></i>
            <input type="text" id="ip-table-search-input" placeholder="Filter IP, perangkat, atau VLAN...">
          </div>
          <span id="ip-table-count-label" style="font-size: 12px; color: var(--text-muted);">
            Menampilkan 0 data
          </span>
        </div>

        <!-- Content Area -->
        <div id="ip-modal-content" style="flex: 1; overflow-y: auto; padding: 16px;"></div>

      </div>
    `;
      document.body.appendChild(this.modalEl);
    }
    bindEvents() {
      document.getElementById("ip-modal-btn-close")?.addEventListener("click", () => this.hide());
      const ipamTab = document.getElementById("ipam-tab-btn");
      const vlanTab = document.getElementById("vlan-tab-btn");
      ipamTab?.addEventListener("click", () => {
        this.activeTab = "ipam";
        ipamTab.classList.add("active");
        vlanTab?.classList.remove("active");
        this.render();
      });
      vlanTab?.addEventListener("click", () => {
        this.activeTab = "vlan";
        vlanTab.classList.add("active");
        ipamTab?.classList.remove("active");
        this.render();
      });
      document.getElementById("ip-table-search-input")?.addEventListener("input", (e) => {
        this.render(e.target.value);
      });
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.modalEl.style.display === "flex") {
          this.hide();
        }
      });
    }
    show() {
      this.modalEl.style.display = "flex";
      if (window.lucide) window.lucide.createIcons();
      this.render();
    }
    hide() {
      this.modalEl.style.display = "none";
    }
    render(filterQuery = "") {
      const content = document.getElementById("ip-modal-content");
      const countLabel = document.getElementById("ip-table-count-label");
      if (!content) return;
      const devices = this.deviceManager.getAllDevices();
      if (this.activeTab === "ipam") {
        this.renderIpamTable(content, devices, filterQuery, countLabel);
      } else {
        this.renderVlanCards(content, devices, filterQuery, countLabel);
      }
      if (window.lucide) window.lucide.createIcons();
    }
    renderIpamTable(container, devices, filterQuery, countLabel) {
      let ipDevices = devices.filter((d) => d.network?.ip);
      if (filterQuery && filterQuery.trim() !== "") {
        const q = filterQuery.toLowerCase();
        ipDevices = ipDevices.filter(
          (d) => d.name.toLowerCase().includes(q) || d.network.ip.toLowerCase().includes(q) || String(d.network.vlan).includes(q) || d.location && d.location.toLowerCase().includes(q)
        );
      }
      ipDevices.sort((a, b) => {
        const numA = a.network.ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
        const numB = b.network.ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
        return numA - numB;
      });
      if (countLabel) {
        countLabel.textContent = `Menampilkan ${ipDevices.length} dari ${devices.length} perangkat`;
      }
      let html = `
      <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
        <thead>
          <tr style="border-bottom: 1px solid var(--border-light); color: var(--text-muted); font-size: 11px; text-transform: uppercase;">
            <th style="padding: 10px 12px;">IP Address</th>
            <th style="padding: 10px 12px;">Subnet</th>
            <th style="padding: 10px 12px;">Nama Perangkat</th>
            <th style="padding: 10px 12px;">Kategori</th>
            <th style="padding: 10px 12px;">VLAN</th>
            <th style="padding: 10px 12px;">Status</th>
            <th style="padding: 10px 12px;">Lokasi</th>
            <th style="padding: 10px 12px; text-align: right;">Aksi</th>
          </tr>
        </thead>
        <tbody>
    `;
      ipDevices.forEach((dev) => {
        const cat = DEVICE_CATEGORIES[dev.category] || DEVICE_CATEGORIES.core;
        const statusDef = DEVICE_STATUSES[dev.status] || DEVICE_STATUSES.unknown;
        html += `
        <tr style="border-bottom: 1px solid var(--border-color); transition: background 120ms ease;">
          <td style="padding: 10px 12px; font-family: var(--font-mono); color: #38bdf8; font-weight: 600;">
            ${dev.network.ip}
          </td>
          <td style="padding: 10px 12px; font-family: var(--font-mono); color: var(--text-muted);">
            ${dev.network.subnet || "255.255.255.0"}
          </td>
          <td style="padding: 10px 12px; font-weight: 600; color: var(--text-primary);">
            ${this.escapeHtml(dev.name)}
          </td>
          <td style="padding: 10px 12px;">
            <span style="font-size: 10px; font-weight: 700; color: ${cat.color}; background: var(--bg-primary); padding: 2px 6px; border-radius: 4px;">
              ${cat.name}
            </span>
          </td>
          <td style="padding: 10px 12px; font-family: var(--font-mono); color: var(--text-secondary);">
            VLAN ${dev.network.vlan || 1}
          </td>
          <td style="padding: 10px 12px;">
            <span style="font-size: 10px; color: ${statusDef.color}; font-weight: 600;">
              \u25CF ${statusDef.name}
            </span>
          </td>
          <td style="padding: 10px 12px; color: var(--text-muted);">
            ${this.escapeHtml(dev.location || "-")}
          </td>
          <td style="padding: 10px 12px; text-align: right;">
            <button class="btn btn-secondary btn-sm" data-goto-id="${dev.id}" style="font-size: 11px;">
              Fokus
            </button>
          </td>
        </tr>
      `;
      });
      html += `</tbody></table>`;
      container.innerHTML = html;
      container.querySelectorAll("[data-goto-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-goto-id");
          const dev = this.deviceManager.getDeviceById(id);
          if (dev) {
            this.hide();
            this.viewportNavigator.focusOnDevice(dev, 1.4);
          }
        });
      });
    }
    renderVlanCards(container, devices, filterQuery, countLabel) {
      const vlanMap = /* @__PURE__ */ new Map();
      devices.forEach((dev) => {
        const vlanId = dev.network?.vlan || 1;
        if (!vlanMap.has(vlanId)) {
          vlanMap.set(vlanId, []);
        }
        vlanMap.get(vlanId).push(dev);
      });
      const vlanNames = {
        1: { name: "Default Management VLAN", subnet: "192.168.1.0/24" },
        10: { name: "Servers & IT Infrastructure", subnet: "192.168.1.0/24" },
        20: { name: "Dosen & Staff Kantor", subnet: "192.168.20.0/24" },
        30: { name: "Mahasiswa & Guest Wi-Fi", subnet: "192.168.30.0/24" },
        100: { name: "CCTV Surveillance & Security", subnet: "192.168.100.0/24" }
      };
      if (countLabel) {
        countLabel.textContent = `Menampilkan ${vlanMap.size} segmen VLAN aktif`;
      }
      let html = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 14px;">`;
      Array.from(vlanMap.keys()).sort((a, b) => a - b).forEach((vlanId) => {
        const devs = vlanMap.get(vlanId);
        const meta = vlanNames[vlanId] || { name: `VLAN ${vlanId}`, subnet: "Custom Subnet" };
        html += `
        <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 11px; font-weight: 700; color: #38bdf8; background: var(--bg-tertiary); padding: 3px 8px; border-radius: 4px; font-family: var(--font-mono);">
                VLAN ${vlanId}
              </span>
              <span style="font-size: 13px; font-weight: 700; color: var(--text-primary);">
                ${meta.name}
              </span>
            </div>
            <span style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">
              ${meta.subnet}
            </span>
          </div>

          <div style="font-size: 11px; color: var(--text-secondary); border-top: 1px solid var(--border-color); padding-top: 8px; display: flex; flex-direction: column; gap: 6px;">
            <div style="font-weight: 600; color: var(--text-muted);">
              Perangkat Terhubung (${devs.length}):
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
      `;
        devs.forEach((dev) => {
          html += `
          <span style="background: var(--bg-tertiary); padding: 3px 8px; border-radius: 4px; font-size: 11px; color: #f8fafc; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" data-goto-id="${dev.id}" title="Klik untuk fokus di denah">
            <span>${this.escapeHtml(dev.name)}</span>
            <span style="color: var(--accent-sky); font-family: var(--font-mono); font-size: 10px;">(${dev.network?.ip || ""})</span>
          </span>
        `;
        });
        html += `
            </div>
          </div>
        </div>
      `;
      });
      html += `</div>`;
      container.innerHTML = html;
      container.querySelectorAll("[data-goto-id]").forEach((tag) => {
        tag.addEventListener("click", () => {
          const id = tag.getAttribute("data-goto-id");
          const dev = this.deviceManager.getDeviceById(id);
          if (dev) {
            this.hide();
            this.viewportNavigator.focusOnDevice(dev, 1.4);
          }
        });
      });
    }
    escapeHtml(str) {
      if (!str) return "";
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
  };

  // js/ui/layer-controls.js
  var LayerControls = class {
    /**
     * @param {Object} options
     * @param {import('../map/map-layers.js').MapLayers} options.mapLayers
     * @param {import('../map/map-engine.js').MapEngine} [options.mapEngine]
     * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
     * @param {import('../connections/cable-manager.js').CableManager} options.cableManager
     */
    constructor({ mapLayers, mapEngine, deviceManager, cableManager }) {
      this.mapLayers = mapLayers;
      this.mapEngine = mapEngine;
      this.deviceManager = deviceManager;
      this.cableManager = cableManager;
      this.filters = {
        showCctv: true,
        showFiber: true,
        showWireless: true,
        showCoverage: true
      };
      this.bindEvents();
    }
    bindEvents() {
      const layerCheckboxes = document.querySelectorAll("input[data-layer]");
      layerCheckboxes.forEach((cb) => {
        const layerName = cb.getAttribute("data-layer");
        cb.addEventListener("change", (e) => {
          stateManager.toggleLayer(layerName, e.target.checked);
        });
      });
      const toggleDim = document.getElementById("toggle-dim-bg-on-select");
      toggleDim?.addEventListener("change", (e) => {
        if (this.mapEngine) {
          this.mapEngine.dimOnSelection = e.target.checked;
          if (!e.target.checked) {
            this.mapEngine.restoreBackground();
          } else {
            const hasSelectedDevice = Boolean(this.deviceManager?.selectedDeviceId);
            const hasSelectedCable = Boolean(this.cableManager?.selectedCableId);
            if (hasSelectedDevice || hasSelectedCable) {
              this.mapEngine.dimBackground();
            }
          }
        }
      });
      const filterCctv = document.getElementById("filter-toggle-cctv");
      filterCctv?.addEventListener("change", (e) => {
        this.filters.showCctv = e.target.checked;
        this.applyDeviceFilter();
      });
      const filterFiber = document.getElementById("filter-toggle-fiber");
      filterFiber?.addEventListener("change", (e) => {
        this.filters.showFiber = e.target.checked;
        this.applyCableFilter();
      });
      const filterWireless = document.getElementById("filter-toggle-wireless");
      filterWireless?.addEventListener("change", (e) => {
        this.filters.showWireless = e.target.checked;
        this.applyCableFilter();
      });
      const filterCoverage = document.getElementById("filter-toggle-coverage");
      filterCoverage?.addEventListener("change", (e) => {
        this.filters.showCoverage = e.target.checked;
        this.deviceManager.renderer.setCoverageVisibility(e.target.checked);
      });
    }
    applyDeviceFilter() {
      this.deviceManager.renderer.markerMap.forEach((group, deviceId) => {
        const dev = this.deviceManager.getDeviceById(deviceId);
        if (dev && dev.type === "cctv") {
          group.visible(this.filters.showCctv);
        }
      });
      this.mapLayers.deviceLayer.batchDraw();
    }
    applyCableFilter() {
      this.cableManager.renderer.lineMap.forEach((line, cableId) => {
        const cable = this.cableManager.getConnectionById(cableId);
        if (cable) {
          let isVis = true;
          if (cable.type === "fiber") {
            isVis = this.filters.showFiber;
            line.visible(isVis);
          } else if (cable.type === "wireless") {
            isVis = this.filters.showWireless;
            line.visible(isVis);
          }
          const badge = this.cableManager.renderer.labelMap?.get(cableId);
          if (badge) {
            badge.visible(isVis && this.cableManager.renderer.showDistanceLabels !== false);
          }
        }
      });
      this.mapLayers.connectionLayer.batchDraw();
    }
  };

  // js/storage/database.js
  var DB_NAME = "NetMapDB";
  var DB_VERSION = 1;
  var Database = class {
    constructor() {
      this.db = null;
    }
    /**
     * Open or upgrade the database
     * @returns {Promise<IDBDatabase>}
     */
    async open() {
      if (this.db) return this.db;
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains("projects")) {
            const projectStore = db.createObjectStore("projects", { keyPath: "id" });
            projectStore.createIndex("name", "name", { unique: false });
            projectStore.createIndex("updatedAt", "updatedAt", { unique: false });
          }
          if (!db.objectStoreNames.contains("settings")) {
            db.createObjectStore("settings", { keyPath: "key" });
          }
        };
        request.onsuccess = (e) => {
          this.db = e.target.result;
          resolve(this.db);
        };
        request.onerror = (e) => {
          console.error("[Database] Failed to open IndexedDB:", e.target.error);
          reject(e.target.error);
        };
      });
    }
    /**
     * Save a project to IndexedDB
     * @param {Object} projectData 
     * @returns {Promise<void>}
     */
    async saveProject(projectData) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("projects", "readwrite");
        const store = tx.objectStore("projects");
        const request = store.put({
          ...projectData,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    /**
     * Get a project by its ID
     * @param {string} id 
     * @returns {Promise<Object|null>}
     */
    async getProject(id) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("projects", "readonly");
        const store = tx.objectStore("projects");
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    }
    /**
     * Get all projects metadata
     * @returns {Promise<Object[]>}
     */
    async getAllProjects() {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("projects", "readonly");
        const store = tx.objectStore("projects");
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    }
    /**
     * Delete a project by ID
     * @param {string} id 
     * @returns {Promise<void>}
     */
    async deleteProject(id) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("projects", "readwrite");
        const store = tx.objectStore("projects");
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  };
  var database = new Database();

  // js/storage/project-storage.js
  var ProjectStorage = class {
    /**
     * @param {Object} options
     * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
     * @param {import('../connections/cable-manager.js').CableManager} options.cableManager
     */
    constructor({ deviceManager, cableManager }) {
      this.deviceManager = deviceManager;
      this.cableManager = cableManager;
      this.isAutoSaveEnabled = true;
      this.debouncedSave = debounce(() => {
        this.saveCurrentProject();
      }, 1500);
      this.initMutationListeners();
    }
    initMutationListeners() {
      const handleMutation = () => {
        if (!this.isAutoSaveEnabled) return;
        this.updateStatusIndicator("saving");
        this.debouncedSave();
      };
      eventBus.on("device:added", handleMutation);
      eventBus.on("device:updated", handleMutation);
      eventBus.on("device:deleted", handleMutation);
      eventBus.on("device:moved", handleMutation);
      eventBus.on("connection:added", handleMutation);
      eventBus.on("connection:updated", handleMutation);
      eventBus.on("connection:deleted", handleMutation);
    }
    /**
     * Serialize current project to a plain JSON object
     * @returns {Object}
     */
    serializeProject() {
      const state = stateManager.getState();
      const devices = this.deviceManager.getAllDevices();
      const connections = this.cableManager.getAllConnections();
      return {
        version: "1.0",
        id: state.project.id || "proj-default",
        name: state.project.name || "Campus Network Infrastructure",
        map: {
          image: "assets/maps/campus-map.jpg",
          version: state.project.map.version,
          naturalWidth: state.project.map.naturalWidth || 1024,
          naturalHeight: state.project.map.naturalHeight || 1024
        },
        layers: { ...state.layers },
        scaleWidthMeters: this.cableManager.mapWidthMeters || 400,
        devices,
        connections,
        customTemplates: typeof localStorage !== "undefined" ? JSON.parse(localStorage.getItem("netmap_custom_templates") || "[]") : [],
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    /**
     * Save current project to IndexedDB
     * @returns {Promise<boolean>}
     */
    async saveCurrentProject() {
      try {
        this.updateStatusIndicator("saving");
        const projectData = this.serializeProject();
        await database.saveProject(projectData);
        this.updateStatusIndicator("saved");
        eventBus.emit("project:saved", { id: projectData.id });
        return true;
      } catch (err) {
        console.error("[ProjectStorage] Failed to save project to IndexedDB:", err);
        this.updateStatusIndicator("error");
        return false;
      }
    }
    /**
     * Load project from IndexedDB and populate manager collections
     * @param {string} id 
     * @returns {Promise<boolean>}
     */
    async loadProject(id) {
      try {
        const projectData = await database.getProject(id);
        if (!projectData) return false;
        const currentMapVersion = stateManager.getState().project.map.version;
        if (projectData.map?.version !== currentMapVersion) {
          console.info(`[ProjectStorage] Saved project uses map "${projectData.map?.version || "legacy"}", current is "${currentMapVersion}". Ignoring stale layout.`);
          return false;
        }
        this.deserializeProject(projectData);
        return true;
      } catch (err) {
        console.error("[ProjectStorage] Failed to load project:", err);
        return false;
      }
    }
    /**
     * Deserialize project data into application managers
     * @param {Object} projectData 
     */
    deserializeProject(projectData) {
      const currentDevs = this.deviceManager.getAllDevices();
      currentDevs.forEach((d) => this.deviceManager.deleteDevice(d.id));
      stateManager.getState().project.id = projectData.id;
      stateManager.getState().project.name = projectData.name;
      if (projectData.scaleWidthMeters && typeof projectData.scaleWidthMeters === "number") {
        this.cableManager.setMapScale(projectData.scaleWidthMeters);
      }
      if (Array.isArray(projectData.devices)) {
        projectData.devices.forEach((dev) => {
          this.deviceManager.addDevice(dev);
        });
      }
      if (Array.isArray(projectData.connections)) {
        projectData.connections.forEach((cable) => {
          this.cableManager.addConnection(cable);
        });
      }
      if (Array.isArray(projectData.customTemplates) && typeof localStorage !== "undefined") {
        localStorage.setItem("netmap_custom_templates", JSON.stringify(projectData.customTemplates));
      }
      this.updateStatusIndicator("saved");
      eventBus.emit("project:loaded", projectData);
    }
    updateStatusIndicator(status) {
      const statusPill = document.querySelector("#app-status-bar .status-pill");
      if (!statusPill) return;
      if (status === "saving") {
        statusPill.innerHTML = "\u27F3 MENYIMPAN...";
        statusPill.style.color = "var(--accent-sky)";
        statusPill.style.background = "rgba(56, 189, 248, 0.15)";
      } else if (status === "saved") {
        statusPill.innerHTML = "\u25CF TERSIMPAN (OFFLINE)";
        statusPill.style.color = "var(--status-online)";
        statusPill.style.background = "rgba(34, 197, 94, 0.15)";
      } else if (status === "error") {
        statusPill.innerHTML = "\u26A0 GAGAL SIMPAN";
        statusPill.style.color = "var(--status-offline)";
        statusPill.style.background = "rgba(239, 68, 68, 0.15)";
      }
    }
  };

  // js/storage/json-importer-exporter.js
  var JsonImporterExporter = class _JsonImporterExporter {
    /**
     * Export project data as downloadable JSON file
     * @param {Object} projectData 
     * @param {string} [filename] 
     */
    static exportJson(projectData, filename) {
      const defaultName = `netmap-${projectData.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.json`;
      const jsonStr = JSON.stringify(projectData, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
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
            const validation = _JsonImporterExporter.validateAndSanitize(rawObj);
            resolve(validation);
          } catch (err) {
            resolve({
              isValid: false,
              project: null,
              errors: ["File bukan format JSON yang valid: " + err.message]
            });
          }
        };
        reader.onerror = () => {
          resolve({
            isValid: false,
            project: null,
            errors: ["Gagal membaca file dari disk"]
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
      if (!data || typeof data !== "object") {
        return { isValid: false, project: null, errors: ["Format data proyek tidak valid"] };
      }
      if (!data.id) errors.push('Field "id" proyek wajib ada');
      if (!data.name) errors.push('Field "name" proyek wajib ada');
      if (!Array.isArray(data.devices)) errors.push('Field "devices" wajib berupa array');
      if (!Array.isArray(data.connections)) errors.push('Field "connections" wajib berupa array');
      if (errors.length > 0) {
        return { isValid: false, project: null, errors };
      }
      const sanitize = (str) => {
        if (typeof str !== "string") return str;
        return str.replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();
      };
      const sanitizedDevices = [];
      const deviceIdSet = /* @__PURE__ */ new Set();
      data.devices.forEach((dev, idx) => {
        if (!dev.id || !dev.name || !dev.position) {
          errors.push(`Perangkat index ${idx} kehilangan id, name, atau position`);
          return;
        }
        if (typeof dev.position.x !== "number" || typeof dev.position.y !== "number" || dev.position.x < 0 || dev.position.x > 1 || dev.position.y < 0 || dev.position.y > 1) {
          errors.push(`Perangkat "${dev.name}" memiliki koordinat posisi di luar rentang [0, 1]`);
        }
        deviceIdSet.add(dev.id);
        sanitizedDevices.push({
          ...dev,
          name: sanitize(dev.name),
          brand: sanitize(dev.brand || ""),
          model: sanitize(dev.model || ""),
          location: sanitize(dev.location || ""),
          notes: sanitize(dev.notes || ""),
          network: {
            ip: sanitize(dev.network?.ip || ""),
            mac: sanitize(dev.network?.mac || ""),
            subnet: sanitize(dev.network?.subnet || "255.255.255.0"),
            vlan: dev.network?.vlan ? Number(dev.network.vlan) : 1,
            hostname: sanitize(dev.network?.hostname || "")
          }
        });
      });
      const sanitizedConnections = [];
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
          name: sanitize(cable.name || "Cable Link"),
          notes: sanitize(cable.notes || "")
        });
      });
      if (errors.length > 0) {
        return { isValid: false, project: null, errors };
      }
      const cleanProject = {
        version: data.version || "1.0",
        id: sanitize(data.id),
        name: sanitize(data.name),
        map: data.map || { image: "assets/maps/campus-map.jpg", naturalWidth: 1024, naturalHeight: 1024 },
        layers: data.layers || {},
        devices: sanitizedDevices,
        connections: sanitizedConnections,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      return {
        isValid: true,
        project: cleanProject,
        errors: []
      };
    }
  };

  // js/export/lazy-loader.js
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.onload = () => resolve();
      script.onerror = (err) => reject(new Error(`Gagal memuat pustaka ekspor: ${src}`));
      document.head.appendChild(script);
    });
  }
  async function loadSheetJs() {
    if (window.XLSX) return window.XLSX;
    try {
      await loadScript("assets/vendor/xlsx.full.min.js");
    } catch {
      await loadScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js");
    }
    return window.XLSX;
  }
  async function loadJsPdf() {
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf;
    try {
      await loadScript("assets/vendor/jspdf.umd.min.js");
      await loadScript("assets/vendor/jspdf.plugin.autotable.min.js");
    } catch {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
    }
    return window.jspdf;
  }

  // js/export/csv-exporter.js
  var CsvExporter = class {
    /**
     * Export device inventory to CSV
     * @param {Object[]} devices 
     * @param {string} [filename] 
     */
    static async exportDevicesCsv(devices, filename = "devices-inventory.csv") {
      const XLSX = await loadSheetJs();
      const rows = devices.map((d) => ({
        "Device ID": d.id,
        "Device Name": d.name,
        "Category": d.category,
        "Type": d.type,
        "Brand": d.brand || "",
        "Model": d.model || "",
        "IP Address": d.network?.ip || "",
        "Subnet": d.network?.subnet || "",
        "VLAN ID": d.network?.vlan || "",
        "MAC Address": d.network?.mac || "",
        "Hostname": d.network?.hostname || "",
        "Status": d.status || "",
        "Location": d.location || "",
        "Firmware": d.firmware || "",
        "Installed Date": d.installedAt || "",
        "Notes": d.notes || ""
      }));
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Devices");
      XLSX.writeFile(workbook, filename, { bookType: "csv" });
    }
    /**
     * Export cable inventory to CSV
     * @param {Object[]} cables 
     * @param {import('../devices/device-manager.js').DeviceManager} deviceManager 
     * @param {string} [filename] 
     */
    static async exportCablesCsv(cables, deviceManager, filename = "cables-inventory.csv") {
      const XLSX = await loadSheetJs();
      const rows = cables.map((c) => {
        const src = deviceManager.getDeviceById(c.source);
        const dest = deviceManager.getDeviceById(c.destination);
        return {
          "Cable ID": c.id,
          "Cable Name": c.name,
          "Type": c.type,
          "Category": c.cableCategory,
          "Source ID": c.source,
          "Source Device": src ? src.name : "",
          "Destination ID": c.destination,
          "Destination Device": dest ? dest.name : "",
          "Length (m)": c.length || 0,
          "Color": c.customColor || "Auto (Standar Kategori)",
          "Color Mode": c.customColor ? "Custom" : "Auto",
          "Status": c.status,
          "Waypoints Count": Array.isArray(c.route) ? c.route.length : 0,
          "Notes": c.notes || ""
        };
      });
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Cables");
      XLSX.writeFile(workbook, filename, { bookType: "csv" });
    }
  };

  // js/export/snapshot-exporter.js
  var SnapshotExporter = class {
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
      const wasVisible = interactionLayer ? interactionLayer.visible() : false;
      if (interactionLayer) {
        interactionLayer.visible(false);
      }
      try {
        const dataUrl = stage.toDataURL({
          pixelRatio,
          mimeType: "image/png",
          quality: 1
        });
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = filename || defaultFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } finally {
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
          mimeType: "image/jpeg",
          quality: 0.85
        });
      } finally {
        if (interactionLayer) {
          interactionLayer.visible(wasVisible);
          interactionLayer.batchDraw();
        }
      }
    }
  };

  // js/export/pdf-report-generator.js
  var PdfReportGenerator = class {
    /**
     * Generate and download comprehensive PDF report
     * @param {Object} options
     * @param {Object} options.project
     * @param {Object[]} options.devices
     * @param {Object[]} options.connections
     * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
     * @param {Konva.Stage} options.stage
     * @param {Konva.Layer} options.interactionLayer
     */
    static async generateReport({
      project,
      devices,
      connections,
      deviceManager,
      stage,
      interactionLayer
    }) {
      const jspdfModule = await loadJsPdf();
      const jsPDF = jspdfModule.jsPDF;
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4"
      });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 28, "F");
      doc.setTextColor(248, 250, 252);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("NetMap \u2014 Laporan Dokumentasi Infrastruktur Jaringan", 14, 13);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.text(`Proyek: ${project.name || "Campus Network"}   |   Tanggal: ${(/* @__PURE__ */ new Date()).toLocaleDateString("id-ID")}   |   Status: Production Ready`, 14, 21);
      const totalDevices = devices.length;
      const onlineDevices = devices.filter((d) => d.status === "online").length;
      const warningDevices = devices.filter((d) => d.status === "warning").length;
      const totalCables = connections.length;
      const totalLength = connections.reduce((acc, c) => acc + (c.length || 0), 0);
      const cardY = 34;
      const cardWidth = 50;
      const cardHeight = 18;
      const cardGap = 8;
      let cardX = 14;
      const stats = [
        { label: "Total Perangkat", val: `${totalDevices} Unit`, color: [59, 130, 246] },
        { label: "Perangkat Online", val: `${onlineDevices} Unit`, color: [34, 197, 94] },
        { label: "Perlu Perhatian", val: `${warningDevices} Unit`, color: [245, 158, 11] },
        { label: "Total Link Kabel", val: `${totalCables} Jalur`, color: [6, 182, 212] },
        { label: "Estimasi Panjang", val: `${Math.round(totalLength)} Meter`, color: [139, 92, 246] }
      ];
      stats.forEach((st) => {
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 2, 2, "F");
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text(st.label, cardX + 4, cardY + 6);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(st.color[0], st.color[1], st.color[2]);
        doc.text(st.val, cardX + 4, cardY + 13);
        cardX += cardWidth + cardGap;
      });
      try {
        const snapshotUrl = SnapshotExporter.getSnapshotDataUrl(stage, interactionLayer);
        if (snapshotUrl) {
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(15, 23, 42);
          doc.text("Visualisasi Denah Peta Jaringan Kampus:", 14, 59);
          doc.addImage(snapshotUrl, "JPEG", 14, 62, 269, 138);
        }
      } catch (err) {
        console.warn("[PdfReport] Failed to capture canvas snapshot:", err);
      }
      doc.addPage("a4", "landscape");
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 18, "F");
      doc.setTextColor(248, 250, 252);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("1. Tabel Inventaris Perangkat Jaringan (Device Inventory)", 14, 12);
      const deviceRows = devices.map((d) => [
        d.id,
        d.name,
        d.category.toUpperCase(),
        `${d.brand || ""} ${d.model || ""}`,
        d.network?.ip || "-",
        d.network?.vlan ? `VLAN ${d.network.vlan}` : "-",
        d.network?.mac || "-",
        d.status.toUpperCase(),
        d.location || "-"
      ]);
      doc.autoTable({
        startY: 24,
        head: [["ID", "Nama Perangkat", "Kategori", "Merek / Model", "IP Address", "VLAN", "MAC Address", "Status", "Lokasi"]],
        body: deviceRows,
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
        bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 14, right: 14 }
      });
      doc.addPage("a4", "landscape");
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 18, "F");
      doc.setTextColor(248, 250, 252);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("2. Tabel Dokumentasi Jalur Kabel & Konektivitas Fisik", 14, 12);
      const cableRows = connections.map((c) => {
        const src = deviceManager.getDeviceById(c.source);
        const dest = deviceManager.getDeviceById(c.destination);
        return [
          c.id,
          c.name,
          c.cableCategory.toUpperCase(),
          src ? `${src.name} (${src.network?.ip || ""})` : c.source,
          dest ? `${dest.name} (${dest.network?.ip || ""})` : c.destination,
          `${c.length || 0} m`,
          c.status.toUpperCase(),
          c.notes || "-"
        ];
      });
      doc.autoTable({
        startY: 24,
        head: [["ID Kabel", "Nama Jalur", "Tipe / Kategori", "Perangkat Sumber", "Perangkat Tujuan", "Panjang", "Status", "Catatan Rute"]],
        body: cableRows,
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
        bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 14, right: 14 }
      });
      const filename = `netmap-laporan-dokumentasi-${Date.now()}.pdf`;
      doc.save(filename);
    }
  };

  // js/ui/export-modal.js
  var ExportModal = class {
    /**
     * @param {Object} options
     * @param {import('../storage/project-storage.js').ProjectStorage} options.projectStorage
     * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
     * @param {import('../connections/cable-manager.js').CableManager} options.cableManager
     * @param {Konva.Stage} options.stage
     * @param {Konva.Layer} options.interactionLayer
     */
    constructor({ projectStorage, deviceManager, cableManager, stage, interactionLayer }) {
      this.projectStorage = projectStorage;
      this.deviceManager = deviceManager;
      this.cableManager = cableManager;
      this.stage = stage;
      this.interactionLayer = interactionLayer;
      this.modalEl = null;
      this.createModalDOM();
      this.bindEvents();
    }
    createModalDOM() {
      this.modalEl = document.createElement("div");
      this.modalEl.id = "export-manager-modal";
      this.modalEl.style.cssText = `
      position: fixed;
      inset: 0;
      background-color: var(--modal-backdrop);
      backdrop-filter: blur(8px);
      z-index: 1000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
    `;
      this.modalEl.innerHTML = `
      <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-light); border-radius: var(--radius-lg); width: 100%; max-width: 650px; display: flex; flex-direction: column; box-shadow: var(--shadow-lg); overflow: hidden;">
        
        <!-- Header -->
        <div style="height: 52px; border-bottom: 1px solid var(--border-color); background: var(--bg-tertiary); display: flex; align-items: center; justify-content: space-between; padding: 0 20px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <i data-lucide="download" style="width: 18px; height: 18px; color: var(--accent-sky);"></i>
            <span style="font-size: 15px; font-weight: 700; color: var(--text-primary);">Ekspor & Pencadangan Data</span>
          </div>
          <button id="export-modal-btn-close" class="btn btn-icon btn-sm" title="Tutup">
            <i data-lucide="x" style="width: 18px; height: 18px;"></i>
          </button>
        </div>

        <!-- Body -->
        <div style="padding: 20px; display: flex; flex-direction: column; gap: 16px; max-height: 80vh; overflow-y: auto;">
          
          <!-- Section 1: JSON Backup / Restore -->
          <div class="panel-section">
            <span class="section-label">1. Cadangan Proyek (JSON Backup & Restore)</span>
            <div class="info-card" style="display: flex; flex-direction: column; gap: 10px;">
              <div style="font-size: 12px; color: var(--text-secondary);">
                Simpan seluruh konfigurasi peta, perangkat, dan rute kabel ke file JSON untuk dipindahkan ke komputer lain atau dipulihkan.
              </div>
              <div style="display: flex; gap: 10px;">
                <button id="btn-export-json" class="btn btn-primary btn-sm" style="flex: 1;">
                  <i data-lucide="download" style="width: 14px; height: 14px;"></i>
                  <span>Unduh File JSON</span>
                </button>
                <label class="btn btn-secondary btn-sm" style="flex: 1; cursor: pointer; margin: 0;">
                  <i data-lucide="upload" style="width: 14px; height: 14px;"></i>
                  <span>Pulihkan / Impor JSON</span>
                  <input type="file" id="input-import-json" accept=".json" style="display: none;">
                </label>
              </div>
            </div>
          </div>

          <!-- Section 2: CSV Inventaris -->
          <div class="panel-section">
            <span class="section-label">2. Lembar Kerja Inventaris (CSV / Excel)</span>
            <div class="info-card" style="display: flex; flex-direction: column; gap: 10px;">
              <div style="font-size: 12px; color: var(--text-secondary);">
                Ekspor data inventaris tabular perangkat dan koneksi kabel yang kompatibel dengan Microsoft Excel atau Google Sheets.
              </div>
              <div style="display: flex; gap: 10px;">
                <button id="btn-export-csv-devices" class="btn btn-secondary btn-sm" style="flex: 1;">
                  <i data-lucide="table" style="width: 14px; height: 14px;"></i>
                  <span>CSV Perangkat</span>
                </button>
                <button id="btn-export-csv-cables" class="btn btn-secondary btn-sm" style="flex: 1;">
                  <i data-lucide="table" style="width: 14px; height: 14px;"></i>
                  <span>CSV Jalur Kabel</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Section 3: High-Res PNG Snapshot -->
          <div class="panel-section">
            <span class="section-label">3. Tangkapan Layar Denah (PNG Image)</span>
            <div class="info-card" style="display: flex; flex-direction: column; gap: 10px;">
              <div style="font-size: 12px; color: var(--text-secondary);">
                Hasilkan gambar denah beserta seluruh perangkat dan kabel yang terlihat dalam format PNG.
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                <div style="display: flex; align-items: center; gap: 8px; font-size: 12px;">
                  <label style="color: var(--text-muted);">Kualitas:</label>
                  <select id="export-png-scale" style="background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 3px 8px; font-size: 12px;">
                    <option value="1">1x (Standar Web)</option>
                    <option value="2" selected>2x (Ultra Tajam / Cetak)</option>
                  </select>
                </div>
                <button id="btn-export-png" class="btn btn-secondary btn-sm">
                  <i data-lucide="image" style="width: 14px; height: 14px;"></i>
                  <span>Unduh Gambar PNG</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Section 4: PDF Report -->
          <div class="panel-section">
            <span class="section-label">4. Dokumen Laporan Resmi (PDF Multi-Halaman)</span>
            <div class="info-card" style="display: flex; flex-direction: column; gap: 10px; background: rgba(59, 130, 246, 0.08); border-color: rgba(59, 130, 246, 0.3);">
              <div style="font-size: 12px; color: var(--text-primary); font-weight: 500;">
                Dokumen komprehensif A4 Landscape berisi: Ringkasan Eksekutif, Visual Denah Kampus Resolusi Tinggi, Tabel Inventaris Perangkat, dan Tabel Jalur Kabel.
              </div>
              <button id="btn-export-pdf" class="btn btn-primary" style="width: 100%;">
                <i data-lucide="file-text" style="width: 15px; height: 15px;"></i>
                <span>Hasilkan Dokumen Laporan PDF</span>
              </button>
            </div>
          </div>

        </div>

      </div>
    `;
      document.body.appendChild(this.modalEl);
    }
    bindEvents() {
      document.getElementById("export-modal-btn-close")?.addEventListener("click", () => this.hide());
      document.getElementById("btn-export-json")?.addEventListener("click", () => {
        const projectData = this.projectStorage.serializeProject();
        JsonImporterExporter.exportJson(projectData);
      });
      const fileInput = document.getElementById("input-import-json");
      fileInput?.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const result = await JsonImporterExporter.importJson(file);
        if (!result.isValid) {
          alert("Gagal memulihkan proyek:\n" + result.errors.join("\n"));
        } else {
          if (confirm(`Pulihkan proyek "${result.project.name}" (${result.project.devices.length} perangkat, ${result.project.connections.length} kabel)? Perubahan lokal yang belum disimpan akan digantikan.`)) {
            this.projectStorage.deserializeProject(result.project);
            await this.projectStorage.saveCurrentProject();
            alert("Proyek berhasil dipulihkan!");
            this.hide();
          }
        }
        fileInput.value = "";
      });
      document.getElementById("btn-export-csv-devices")?.addEventListener("click", async () => {
        const devices = this.deviceManager.getAllDevices();
        await CsvExporter.exportDevicesCsv(devices);
      });
      document.getElementById("btn-export-csv-cables")?.addEventListener("click", async () => {
        const cables = this.cableManager.getAllConnections();
        await CsvExporter.exportCablesCsv(cables, this.deviceManager);
      });
      document.getElementById("btn-export-png")?.addEventListener("click", () => {
        const scaleSelect = document.getElementById("export-png-scale");
        const ratio = parseInt(scaleSelect?.value || "2", 10);
        SnapshotExporter.exportMapPng({
          stage: this.stage,
          interactionLayer: this.interactionLayer,
          pixelRatio: ratio
        });
      });
      document.getElementById("btn-export-pdf")?.addEventListener("click", async () => {
        const btn = document.getElementById("btn-export-pdf");
        const prevHtml = btn.innerHTML;
        btn.innerHTML = "<span>Membuat Laporan PDF...</span>";
        btn.disabled = true;
        try {
          const projectData = this.projectStorage.serializeProject();
          await PdfReportGenerator.generateReport({
            project: projectData,
            devices: projectData.devices,
            connections: projectData.connections,
            deviceManager: this.deviceManager,
            stage: this.stage,
            interactionLayer: this.interactionLayer
          });
        } catch (err) {
          console.error("[ExportModal] PDF generation failed:", err);
          alert("Gagal membuat laporan PDF: " + err.message);
        } finally {
          btn.innerHTML = prevHtml;
          btn.disabled = false;
          if (window.lucide) window.lucide.createIcons();
        }
      });
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.modalEl.style.display === "flex") {
          this.hide();
        }
      });
    }
    show() {
      this.modalEl.style.display = "flex";
      if (window.lucide) window.lucide.createIcons();
    }
    hide() {
      this.modalEl.style.display = "none";
    }
  };

  // js/ui/project-modal.js
  var ProjectModal = class {
    /**
     * @param {Object} options
     * @param {import('../storage/project-storage.js').ProjectStorage} options.projectStorage
     * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
     * @param {import('../connections/cable-manager.js').CableManager} options.cableManager
     */
    constructor({ projectStorage, deviceManager, cableManager }) {
      this.projectStorage = projectStorage;
      this.deviceManager = deviceManager;
      this.cableManager = cableManager;
      this.modalEl = null;
      this.createModalDOM();
      this.bindEvents();
    }
    createModalDOM() {
      this.modalEl = document.createElement("div");
      this.modalEl.id = "project-manager-modal";
      this.modalEl.style.cssText = `
      position: fixed;
      inset: 0;
      background-color: var(--modal-backdrop);
      backdrop-filter: blur(8px);
      z-index: 1000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
    `;
      this.modalEl.innerHTML = `
      <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-light); border-radius: var(--radius-lg); width: 100%; max-width: 520px; display: flex; flex-direction: column; box-shadow: var(--shadow-lg); overflow: hidden;">
        
        <!-- Header -->
        <div style="height: 52px; border-bottom: 1px solid var(--border-color); background: var(--bg-tertiary); display: flex; align-items: center; justify-content: space-between; padding: 0 20px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <i data-lucide="folder" style="width: 18px; height: 18px; color: var(--accent-sky);"></i>
            <span style="font-size: 15px; font-weight: 700; color: var(--text-primary);">Kelola Proyek Jaringan</span>
          </div>
          <button id="project-modal-btn-close" class="btn btn-icon btn-sm" title="Tutup">
            <i data-lucide="x" style="width: 18px; height: 18px;"></i>
          </button>
        </div>

        <!-- Body -->
        <div style="padding: 20px; display: flex; flex-direction: column; gap: 16px;">
          
          <div class="panel-section">
            <span class="section-label">Informasi Proyek Aktif</span>
            <div class="info-card" style="display: flex; flex-direction: column; gap: 10px;">
              <div style="display: flex; flex-direction: column; gap: 4px;">
                <label style="font-size: 11px; color: var(--text-muted);">Nama Proyek / Wilayah</label>
                <input type="text" id="project-name-input" value="" 
                       style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 13px; font-weight: 600; padding: 6px 10px;">
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; color: var(--text-secondary); background: var(--bg-secondary); padding: 8px 10px; border-radius: 4px;">
                <div>ID: <span id="project-id-display" style="font-family: var(--font-mono); color: var(--accent-sky);">-</span></div>
                <div>Format: <span style="color: var(--text-primary);">Offline IndexedDB</span></div>
                <div>Perangkat: <span id="project-dev-count" style="font-weight: 600; color: var(--status-online);">-</span></div>
                <div>Kabel: <span id="project-cab-count" style="font-weight: 600; color: var(--accent-sky);">-</span></div>
              </div>

              <button id="btn-save-project-name" class="btn btn-primary btn-sm" style="width: 100%;">
                <i data-lucide="check" style="width: 14px; height: 14px;"></i>
                <span>Perbarui Nama Proyek</span>
              </button>
            </div>
          </div>

          <div class="panel-section">
            <span class="section-label">Tindakan Cepat</span>
            <div class="info-card" style="display: flex; flex-direction: column; gap: 8px;">
              <button id="btn-force-save" class="btn btn-secondary btn-sm" style="justify-content: flex-start;">
                <i data-lucide="save" style="width: 14px; height: 14px;"></i>
                <span>Simpan Sekarang (Paksa Tulis ke IndexedDB)</span>
              </button>
              
              <button id="btn-reset-demo" class="btn btn-secondary btn-sm" style="justify-content: flex-start; color: var(--status-warning);">
                <i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i>
                <span>Muat Ulang Data Sampel Default Kampus</span>
              </button>

              <button id="btn-clear-all" class="btn btn-sm" style="justify-content: flex-start; background: rgba(239, 68, 68, 0.15); color: var(--status-offline); border: 1px solid rgba(239, 68, 68, 0.3);">
                <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                <span>Kosongkan Seluruh Perangkat & Kabel (Proyek Baru Kosong)</span>
              </button>
            </div>
          </div>

        </div>

      </div>
    `;
      document.body.appendChild(this.modalEl);
    }
    bindEvents() {
      document.getElementById("project-modal-btn-close")?.addEventListener("click", () => this.hide());
      document.getElementById("btn-save-project-name")?.addEventListener("click", async () => {
        const nameInput = document.getElementById("project-name-input");
        const newName = nameInput?.value.trim();
        if (newName) {
          stateManager.getState().project.name = newName;
          const brandBadge = document.querySelector(".brand-badge");
          if (brandBadge) brandBadge.textContent = newName;
          await this.projectStorage.saveCurrentProject();
          alert("Nama proyek berhasil diperbarui!");
          this.hide();
        }
      });
      document.getElementById("btn-force-save")?.addEventListener("click", async () => {
        await this.projectStorage.saveCurrentProject();
        alert("Proyek berhasil disimpan ke IndexedDB!");
      });
      document.getElementById("btn-reset-demo")?.addEventListener("click", async () => {
        if (confirm("Muat ulang 8 perangkat & 7 kabel sampel kampus default? Perubahan yang belum diekspor akan hilang.")) {
          window.__netmap?.seedSampleTopology();
          await this.projectStorage.saveCurrentProject();
          alert("Data sampel berhasil dimuat ulang!");
          this.hide();
        }
      });
      document.getElementById("btn-clear-all")?.addEventListener("click", async () => {
        if (confirm("PERINGATAN: Yakin ingin menghapus SELURUH perangkat dan kabel untuk membuat proyek kosong baru?")) {
          const devs = this.deviceManager.getAllDevices();
          devs.forEach((d) => this.deviceManager.deleteDevice(d.id));
          await this.projectStorage.saveCurrentProject();
          alert("Semua perangkat dan kabel telah dikosongkan.");
          this.hide();
        }
      });
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.modalEl.style.display === "flex") {
          this.hide();
        }
      });
    }
    show() {
      const state = stateManager.getState();
      const nameInput = document.getElementById("project-name-input");
      const idDisplay = document.getElementById("project-id-display");
      const devCount = document.getElementById("project-dev-count");
      const cabCount = document.getElementById("project-cab-count");
      if (nameInput) nameInput.value = state.project.name || "Campus Network Infrastructure";
      if (idDisplay) idDisplay.textContent = state.project.id || "proj-default";
      if (devCount) devCount.textContent = `${this.deviceManager.getAllDevices().length} unit`;
      if (cabCount) cabCount.textContent = `${this.cableManager.getAllConnections().length} jalur`;
      this.modalEl.style.display = "flex";
      if (window.lucide) window.lucide.createIcons();
    }
    hide() {
      this.modalEl.style.display = "none";
    }
  };

  // js/core/history-manager.js
  var HistoryManager = class {
    /**
     * @param {Object} options
     * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
     * @param {import('../connections/cable-manager.js').CableManager} options.cableManager
     * @param {number} [options.maxHistory=50]
     */
    constructor({ deviceManager, cableManager, maxHistory = 50 }) {
      this.deviceManager = deviceManager;
      this.cableManager = cableManager;
      this.maxHistory = maxHistory;
      this.undoStack = [];
      this.redoStack = [];
      this.isRestoring = false;
      this.debouncedRecord = debounce((actionName) => {
        if (this.isRestoring) return;
        this.pushSnapshot(actionName || "Perubahan Peta");
      }, 60);
      this.initMutationListeners();
    }
    /**
     * Capture a deep clone snapshot of devices and connections
     * @returns {Object}
     */
    captureSnapshot() {
      return {
        devices: JSON.parse(JSON.stringify(this.deviceManager.getAllDevices())),
        connections: JSON.parse(JSON.stringify(this.cableManager.getAllConnections()))
      };
    }
    /**
     * Initialize initial baseline state
     */
    initBaseline() {
      this.undoStack = [];
      this.redoStack = [];
      const initial = this.captureSnapshot();
      initial.actionName = "Kondisi Awal";
      this.undoStack.push(initial);
      this.updateUI();
    }
    /**
     * Push a new snapshot to undo stack
     * @param {string} actionName 
     */
    pushSnapshot(actionName = "Perubahan") {
      if (this.isRestoring) return;
      const current = this.captureSnapshot();
      current.actionName = actionName;
      if (this.undoStack.length > 0) {
        const top = this.undoStack[this.undoStack.length - 1];
        if (JSON.stringify(top.devices) === JSON.stringify(current.devices) && JSON.stringify(top.connections) === JSON.stringify(current.connections)) {
          return;
        }
      }
      this.undoStack.push(current);
      if (this.undoStack.length > this.maxHistory) {
        this.undoStack.shift();
      }
      this.redoStack = [];
      this.updateUI();
    }
    /**
     * Listen to mutation events from device and cable managers
     */
    initMutationListeners() {
      const handleMutation = (actionName) => {
        if (this.isRestoring) return;
        this.debouncedRecord(actionName);
      };
      eventBus.on("device:added", (dev) => {
        handleMutation(`Tambah Perangkat "${dev?.name || "Baru"}"`);
      });
      eventBus.on("device:updated", (dev) => {
        handleMutation(`Edit Perangkat "${dev?.name || ""}"`);
      });
      eventBus.on("device:deleted", () => {
        handleMutation("Hapus Perangkat");
      });
      eventBus.on("device:moved", () => {
        handleMutation("Geser Perangkat");
      });
      eventBus.on("connection:added", (cable) => {
        handleMutation(`Tambah Kabel "${cable?.name || ""}"`);
      });
      eventBus.on("connection:updated", (cable) => {
        handleMutation(`Ubah Jalur Kabel "${cable?.name || ""}"`);
      });
      eventBus.on("connection:deleted", () => {
        handleMutation("Hapus Kabel");
      });
    }
    /**
     * Perform Undo (Ctrl + Z)
     * @returns {boolean}
     */
    undo() {
      if (this.undoStack.length <= 1) {
        this.showToast("Tidak ada tindakan untuk di-undo");
        return false;
      }
      this.isRestoring = true;
      const currentState = this.undoStack.pop();
      this.redoStack.push(currentState);
      const targetState = this.undoStack[this.undoStack.length - 1];
      this.restoreSnapshot(targetState);
      this.updateUI();
      this.showToast(`\u21B6 Undo: ${currentState.actionName || "Tindakan Sebelumnya"}`);
      eventBus.emit("history:undo", { action: currentState.actionName });
      setTimeout(() => {
        this.isRestoring = false;
      }, 120);
      return true;
    }
    /**
     * Perform Redo (Ctrl + Y or Ctrl + Shift + Z)
     * @returns {boolean}
     */
    redo() {
      if (this.redoStack.length === 0) {
        this.showToast("Tidak ada tindakan untuk di-redo");
        return false;
      }
      this.isRestoring = true;
      const targetState = this.redoStack.pop();
      this.undoStack.push(targetState);
      this.restoreSnapshot(targetState);
      this.updateUI();
      this.showToast(`\u21B7 Redo: ${targetState.actionName || "Tindakan Diterapkan Kembali"}`);
      eventBus.emit("history:redo", { action: targetState.actionName });
      setTimeout(() => {
        this.isRestoring = false;
      }, 120);
      return true;
    }
    /**
     * Restore application state to a given snapshot
     * @param {Object} snapshot 
     */
    restoreSnapshot(snapshot) {
      if (!snapshot) return;
      this.deviceManager.deselectDevice();
      this.cableManager.deselectConnection();
      const targetDevMap = new Map(snapshot.devices.map((d) => [d.id, d]));
      const currentDevs = this.deviceManager.getAllDevices();
      currentDevs.forEach((dev) => {
        if (!targetDevMap.has(dev.id)) {
          this.deviceManager.deleteDevice(dev.id);
        }
      });
      snapshot.devices.forEach((dev) => {
        const existing = this.deviceManager.getDeviceById(dev.id);
        if (existing) {
          this.deviceManager.updateDevice(dev.id, dev);
          this.deviceManager.updateDevicePosition(dev.id, dev.position);
        } else {
          this.deviceManager.addDevice(dev);
        }
      });
      const targetCableMap = new Map(snapshot.connections.map((c) => [c.id, c]));
      const currentCables = this.cableManager.getAllConnections();
      currentCables.forEach((c) => {
        if (!targetCableMap.has(c.id)) {
          this.cableManager.deleteConnection(c.id);
        }
      });
      snapshot.connections.forEach((cable) => {
        const existing = this.cableManager.getConnectionById(cable.id);
        if (existing) {
          this.cableManager.updateConnection(cable.id, cable);
        } else {
          this.cableManager.addConnection(cable);
        }
      });
      this.deviceManager.renderAll();
      this.cableManager.renderAll();
    }
    canUndo() {
      return this.undoStack.length > 1;
    }
    canRedo() {
      return this.redoStack.length > 0;
    }
    updateUI() {
      if (typeof document === "undefined") return;
      const btnUndo = document.getElementById("btn-undo");
      const btnRedo = document.getElementById("btn-redo");
      if (btnUndo) {
        btnUndo.disabled = !this.canUndo();
        btnUndo.style.opacity = this.canUndo() ? "1" : "0.4";
        btnUndo.style.pointerEvents = this.canUndo() ? "auto" : "none";
        const prevAction = this.undoStack.length > 1 ? this.undoStack[this.undoStack.length - 1].actionName : "";
        btnUndo.title = this.canUndo() ? `Undo: ${prevAction} (Ctrl+Z)` : "Undo (Ctrl+Z)";
      }
      if (btnRedo) {
        btnRedo.disabled = !this.canRedo();
        btnRedo.style.opacity = this.canRedo() ? "1" : "0.4";
        btnRedo.style.pointerEvents = this.canRedo() ? "auto" : "none";
        const nextAction = this.redoStack.length > 0 ? this.redoStack[this.redoStack.length - 1].actionName : "";
        btnRedo.title = this.canRedo() ? `Redo: ${nextAction} (Ctrl+Y)` : "Redo (Ctrl+Y)";
      }
    }
    showToast(message) {
      if (typeof document === "undefined") return;
      let toast = document.getElementById("netmap-action-toast");
      if (!toast) {
        toast = document.createElement("div");
        toast.id = "netmap-action-toast";
        toast.style.cssText = `
        position: fixed;
        bottom: 45px;
        left: 50%;
        transform: translateX(-50%);
        background-color: var(--bg-secondary);
        color: var(--text-primary);
        border: 1px solid var(--border-focus);
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        pointer-events: none;
        transition: opacity 200ms ease, transform 200ms ease;
      `;
        document.body.appendChild(toast);
      }
      toast.textContent = message;
      toast.style.opacity = "1";
      toast.style.transform = "translateX(-50%) translateY(0)";
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(-50%) translateY(8px)";
      }, 1800);
    }
  };

  // js/ui/context-menu.js
  var ContextMenu = class {
    /**
     * @param {Object} options
     * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
     * @param {import('../connections/cable-manager.js').CableManager} options.cableManager
     * @param {import('./viewport-navigator.js').ViewportNavigator} [options.viewportNavigator]
     * @param {import('../map/map-engine.js').MapEngine} [options.mapEngine]
     * @param {Konva.Stage} [options.stage]
     */
    constructor({ deviceManager, cableManager, viewportNavigator = null, mapEngine = null, stage = null }) {
      this.deviceManager = deviceManager;
      this.cableManager = cableManager;
      this.viewportNavigator = viewportNavigator;
      this.mapEngine = mapEngine;
      this.stage = stage;
      this.isOpen = false;
      this.activeTarget = null;
      this._toastTimer = null;
      this.createDomElement();
      this.initEventListeners();
    }
    /**
     * Create singleton context menu DOM container attached to <body>
     */
    createDomElement() {
      let menu = document.getElementById("map-context-menu");
      if (!menu) {
        menu = document.createElement("div");
        menu.id = "map-context-menu";
        menu.className = "netmap-context-menu";
        menu.setAttribute("role", "menu");
        menu.setAttribute("aria-hidden", "true");
        document.body.appendChild(menu);
      }
      this.element = menu;
    }
    /**
     * Bind event listeners from eventBus and window interactions
     */
    initEventListeners() {
      eventBus.on("contextmenu:device", ({ device, screenX, screenY }) => {
        this.showDeviceMenu(device, screenX, screenY);
      });
      eventBus.on("contextmenu:cable", ({ cable, screenX, screenY }) => {
        this.showCableMenu(cable, screenX, screenY);
      });
      eventBus.on("contextmenu:canvas", ({ normX, normY, screenX, screenY }) => {
        this.showCanvasMenu({ normX, normY }, screenX, screenY);
      });
      document.addEventListener("pointerdown", (e) => {
        if (this.isOpen && !this.element.contains(e.target)) {
          this.hide();
        }
      }, true);
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.isOpen) {
          this.hide();
        }
      });
      if (this.stage) {
        this.stage.on("dragstart wheel", () => {
          if (this.isOpen) {
            this.hide();
          }
        });
      }
      window.addEventListener("resize", () => {
        if (this.isOpen) this.hide();
      });
      window.addEventListener("scroll", () => {
        if (this.isOpen) this.hide();
      }, true);
      eventBus.on("mode:changed", () => this.hide());
      eventBus.on("device:deleted", () => this.hide());
      eventBus.on("connection:deleted", () => this.hide());
    }
    /**
     * Display Context Menu for a Device
     * @param {Object} device 
     * @param {number} screenX 
     * @param {number} screenY 
     */
    showDeviceMenu(device, screenX, screenY) {
      if (!device) return;
      this.activeTarget = { type: "device", data: device };
      this.deviceManager.selectDevice(device.id);
      const devDef = getDeviceDefByType(device.type) || { name: "Perangkat Jaringan", category: "core" };
      const catDef = DEVICE_CATEGORIES[device.category] || DEVICE_CATEGORIES.core;
      const statusDef = DEVICE_STATUSES[device.status] || DEVICE_STATUSES.online;
      let iconHtml = "";
      if (device.customImage) {
        iconHtml = `<img src="${device.customImage}" alt="${device.name}" />`;
      } else {
        const iconKey = device.icon || getDefaultIconForType(device.type);
        iconHtml = getDeviceIconSvg(iconKey, { color: "#2a7c13", size: 20 });
      }
      const ipText = device.network?.ip || device.ip || "Tanpa Alamat IP";
      const statusColor = statusDef.color || "#2a7c13";
      const items = [
        {
          id: "delete-device",
          icon: "trash-2",
          label: "Hapus Perangkat",
          shortcut: "Del",
          danger: true,
          action: () => this.confirmAndDeleteDevice(device)
        },
        { isDivider: true },
        {
          id: "inspect-device",
          icon: "sliders",
          label: "Properti & Konfigurasi",
          shortcut: "Enter",
          action: () => {
            this.deviceManager.selectDevice(device.id);
            this.hide();
          }
        },
        {
          id: "connect-cable",
          icon: "network",
          label: "Tarik Kabel dari Sini",
          action: () => this.startCableFromDevice(device)
        },
        {
          id: "focus-device",
          icon: "crosshair",
          label: "Pusatkan di Layar",
          action: () => {
            if (this.viewportNavigator) {
              this.viewportNavigator.focusOnDevice(device);
            }
            this.hide();
          }
        },
        {
          id: "duplicate-device",
          icon: "copy",
          label: "Duplikat Perangkat",
          shortcut: "Ctrl+D",
          action: () => {
            this.hide();
            const clone = this.deviceManager.duplicateDevice(device.id);
            if (clone) {
              this.showToast(`\u{1F4CB} Perangkat diduplikat: "${clone.name}"`);
            }
          }
        },
        {
          id: "copy-info",
          icon: "clipboard-copy",
          label: device.network?.ip || device.ip ? `Salin IP (${device.network?.ip || device.ip})` : "Salin Nama & ID",
          action: () => {
            this.hide();
            const devIp = device.network?.ip || device.ip;
            const copyVal = devIp ? devIp : `${device.name} [${device.id}]`;
            this.copyToClipboard(copyVal, devIp ? "Alamat IP" : "Info Perangkat");
          }
        }
      ];
      this.renderMenu({
        iconHtml,
        title: device.name,
        subtitle: `<span class="context-menu-status-dot" style="background-color: ${statusColor};"></span> ${statusDef.label} \u2022 ${ipText} \u2022 ${devDef.name}`,
        items
      });
      this.positionAt(screenX, screenY);
    }
    /**
     * Display Context Menu for a Cable / Connection
     * @param {Object} cable 
     * @param {number} screenX 
     * @param {number} screenY 
     */
    showCableMenu(cable, screenX, screenY) {
      if (!cable) return;
      this.activeTarget = { type: "cable", data: cable };
      this.cableManager.selectConnection(cable.id);
      const catDef = CABLE_CATEGORIES[cable.category] || CABLE_CATEGORIES.cat6;
      const cableColor = cable.customColor || catDef.color;
      const lengthStr = cable.length ? `${cable.length.toFixed(1)} meter` : "0 m";
      const waypointsCount = Array.isArray(cable.route) ? cable.route.length : 0;
      const iconHtml = `<span style="width: 14px; height: 14px; border-radius: 50%; background: ${cableColor}; border: 2px solid #fff; box-shadow: 0 0 0 1px ${cableColor}; display: inline-block;"></span>`;
      const items = [
        {
          id: "delete-cable",
          icon: "trash-2",
          label: "Hapus Jalur Kabel",
          shortcut: "Del",
          danger: true,
          action: () => this.confirmAndDeleteCable(cable)
        },
        { isDivider: true },
        {
          id: "inspect-cable",
          icon: "sliders",
          label: "Properti & Detail Kabel",
          shortcut: "Enter",
          action: () => {
            this.cableManager.selectConnection(cable.id);
            this.hide();
          }
        }
      ];
      if (waypointsCount > 0) {
        items.push({
          id: "straighten-cable",
          icon: "minimize-2",
          label: `Luruskan Jalur (${waypointsCount} belokan)`,
          action: () => {
            this.hide();
            this.cableManager.updateConnection(cable.id, { route: [] });
            this.showToast(`\u{1F4CF} Belokan jalur kabel "${cable.name}" direset ke garis lurus`);
          }
        });
      }
      items.push({
        id: "copy-cable-info",
        icon: "clipboard-copy",
        label: "Salin Info Kabel",
        action: () => {
          this.hide();
          const copyVal = `${cable.name} (${catDef.name}, ${lengthStr})`;
          this.copyToClipboard(copyVal, "Spesifikasi Kabel");
        }
      });
      this.renderMenu({
        iconHtml,
        title: cable.name,
        subtitle: `${catDef.name} \u2022 ${lengthStr}`,
        items
      });
      this.positionAt(screenX, screenY);
    }
    /**
     * Display Context Menu for Canvas Background
     * @param {{normX: number, normY: number}} coords 
     * @param {number} screenX 
     * @param {number} screenY 
     */
    showCanvasMenu({ normX, normY }, screenX, screenY) {
      this.activeTarget = { type: "canvas", data: { normX, normY } };
      const posXStr = (normX * 100).toFixed(1);
      const posYStr = (normY * 100).toFixed(1);
      const hasSelection = Boolean(this.deviceManager?.selectedDeviceId || this.cableManager?.selectedCableId);
      const items = [
        {
          id: "add-custom-device-here",
          icon: "sparkles",
          label: "Tambah Perangkat Kustom Disini...",
          action: () => {
            this.hide();
            eventBus.emit("modal:open-custom-device", { normX, normY });
          }
        },
        {
          id: "add-device-here",
          icon: "plus-circle",
          label: "Tambah Perangkat Standar Disini...",
          action: () => {
            this.hide();
            stateManager.setMode("add-device");
            eventBus.emit("canvas:place-device", {
              normalizedX: normX,
              normalizedY: normY,
              isInside: true
            });
          }
        },
        {
          id: "draw-cable-mode",
          icon: "network",
          label: "Mode Tarik Kabel",
          action: () => {
            this.hide();
            stateManager.setMode("draw-cable");
          }
        },
        { isDivider: true },
        {
          id: "fit-screen",
          icon: "maximize-2",
          label: "Reset Tampilan (Fit Layar)",
          action: () => {
            this.hide();
            if (this.mapEngine?.interactions) {
              this.mapEngine.interactions.fitToScreen(30);
            }
          }
        },
        {
          id: "calibrate-scale",
          icon: "ruler",
          label: "Kalibrasi Skala Peta...",
          action: () => {
            this.hide();
            eventBus.emit("modal:open-map-scale");
          }
        }
      ];
      if (hasSelection) {
        items.push({
          id: "clear-selection",
          icon: "x-circle",
          label: "Batalkan Seleksi",
          action: () => {
            this.hide();
            this.deviceManager.deselectDevice();
            this.cableManager.deselectConnection();
          }
        });
      }
      this.renderMenu({
        iconHtml: `<i data-lucide="map-pin" style="width: 16px; height: 16px; color: var(--accent-blue);"></i>`,
        title: "Denah Jaringan NetMap",
        subtitle: `Koordinat: X: ${posXStr}%, Y: ${posYStr}%`,
        items
      });
      this.positionAt(screenX, screenY);
    }
    /**
     * Render HTML content for the context menu
     * @param {Object} options 
     */
    renderMenu({ iconHtml, title, subtitle, items }) {
      let html = `
      <div class="context-menu-header">
        <div class="context-menu-header-icon">${iconHtml}</div>
        <div class="context-menu-header-info">
          <div class="context-menu-header-title" title="${escapeHtml2(title)}">${escapeHtml2(title)}</div>
          <div class="context-menu-header-sub">${subtitle}</div>
        </div>
      </div>
      <div class="context-menu-body">
    `;
      items.forEach((item, index) => {
        if (item.isDivider) {
          html += `<div class="context-menu-divider"></div>`;
          return;
        }
        const dangerClass = item.danger ? " danger" : "";
        const shortcutBadge = item.shortcut ? `<span class="context-menu-shortcut">${item.shortcut}</span>` : "";
        html += `
        <div class="context-menu-item${dangerClass}" data-index="${index}" role="menuitem" tabindex="0">
          <i data-lucide="${item.icon}"></i>
          <span class="context-menu-item-label">${escapeHtml2(item.label)}</span>
          ${shortcutBadge}
        </div>
      `;
      });
      html += `</div>`;
      this.element.innerHTML = html;
      const itemEls = this.element.querySelectorAll(".context-menu-item");
      itemEls.forEach((el) => {
        const idx = parseInt(el.getAttribute("data-index"), 10);
        const itemConfig = items[idx];
        if (itemConfig && itemConfig.action) {
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            itemConfig.action();
          });
          el.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              itemConfig.action();
            }
          });
        }
      });
      if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons({
          root: this.element
        });
      }
    }
    /**
     * Calculate position clamped to window viewport boundaries
     * @param {number} screenX 
     * @param {number} screenY 
     */
    positionAt(screenX, screenY) {
      this.element.style.display = "block";
      this.element.style.visibility = "hidden";
      this.element.style.top = "0px";
      this.element.style.left = "0px";
      const menuRect = this.element.getBoundingClientRect();
      const padding = 12;
      let posX = screenX;
      let posY = screenY;
      if (posX + menuRect.width > window.innerWidth - padding) {
        posX = Math.max(padding, screenX - menuRect.width);
      }
      if (posY + menuRect.height > window.innerHeight - padding) {
        posY = Math.max(padding, window.innerHeight - menuRect.height - padding);
      }
      this.element.style.left = `${Math.round(posX)}px`;
      this.element.style.top = `${Math.round(posY)}px`;
      this.element.style.visibility = "visible";
      this.element.classList.add("visible");
      this.element.setAttribute("aria-hidden", "false");
      this.isOpen = true;
    }
    /**
     * Hide and dismiss the context menu
     */
    hide() {
      if (!this.isOpen) return;
      this.element.classList.remove("visible");
      this.element.style.display = "none";
      this.element.setAttribute("aria-hidden", "true");
      this.isOpen = false;
      this.activeTarget = null;
    }
    /**
     * Direct shortcut action: Confirm & Delete Device
     * @param {Object} device 
     */
    confirmAndDeleteDevice(device) {
      this.hide();
      if (!device) return;
      const connectedCables = this.cableManager ? this.cableManager.getConnectionsByDeviceId(device.id) : [];
      const cableCount = connectedCables.length;
      const cableWarning = cableCount > 0 ? `
(termasuk ${cableCount} jalur kabel yang terhubung)` : "";
      const confirmFn = typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm : typeof confirm === "function" ? confirm : () => true;
      const confirmed = confirmFn(
        `Hapus perangkat "${device.name}"${cableWarning}?

Tip: Tindakan ini dapat dibatalkan sewaktu-waktu dengan menekan Ctrl + Z (Undo).`
      );
      if (confirmed) {
        const devName = device.name;
        this.deviceManager.deleteDevice(device.id);
        this.showToast(`\u{1F5D1}\uFE0F Perangkat "${devName}" berhasil dihapus. Tekan Ctrl+Z untuk membatalkan.`);
      }
    }
    /**
     * Direct shortcut action: Confirm & Delete Cable
     * @param {Object} cable 
     */
    confirmAndDeleteCable(cable) {
      this.hide();
      if (!cable) return;
      const confirmFn = typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm : typeof confirm === "function" ? confirm : () => true;
      const confirmed = confirmFn(
        `Hapus jalur kabel "${cable.name}"?

Tip: Tindakan ini dapat dibatalkan sewaktu-waktu dengan menekan Ctrl + Z (Undo).`
      );
      if (confirmed) {
        const cabName = cable.name;
        this.cableManager.deleteConnection(cable.id);
        this.showToast(`\u{1F5D1}\uFE0F Jalur kabel "${cabName}" berhasil dihapus. Tekan Ctrl+Z untuk membatalkan.`);
      }
    }
    /**
     * Shortcut action: Start Cable Drawing with this device as source
     * @param {Object} device 
     */
    startCableFromDevice(device) {
      this.hide();
      if (!device) return;
      stateManager.setMode("draw-cable");
      this.deviceManager.selectDevice(device.id);
      this.showToast(`\u{1F50C} Sumber kabel: "${device.name}". Klik perangkat tujuan untuk menghubungkan.`);
    }
    /**
     * Copy arbitrary text to clipboard with feedback toast
     * @param {string} text 
     * @param {string} label 
     */
    async copyToClipboard(text, label = "Teks") {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const textarea = document.createElement("textarea");
          textarea.value = text;
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
        }
        this.showToast(`\u{1F4CB} ${label} disalin ke clipboard: "${text}"`);
      } catch (err) {
        console.warn("[ContextMenu] Clipboard copy failed:", err);
        this.showToast(`Gagal menyalin ${label}`);
      }
    }
    /**
     * Display floating notification toast
     * @param {string} message 
     */
    showToast(message) {
      let toast = document.getElementById("netmap-action-toast");
      if (!toast) {
        toast = document.createElement("div");
        toast.id = "netmap-action-toast";
        toast.style.cssText = `
        position: fixed;
        bottom: 45px;
        left: 50%;
        transform: translateX(-50%) translateY(8px);
        background: rgba(30, 41, 59, 0.94);
        color: #fff;
        padding: 8px 18px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 500;
        z-index: 10000;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease, transform 0.2s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        backdrop-filter: blur(4px);
        font-family: 'Poppins', sans-serif;
      `;
        document.body.appendChild(toast);
      }
      toast.textContent = message;
      toast.style.opacity = "1";
      toast.style.transform = "translateX(-50%) translateY(0)";
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(-50%) translateY(8px)";
      }, 2400);
    }
  };
  function escapeHtml2(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  // js/ui/custom-device-modal.js
  var CustomDeviceModal = class {
    /**
     * @param {Object} options
     * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
     * @param {import('./device-palette.js').DevicePalette} options.devicePalette
     * @param {import('../map/map-engine.js').MapEngine} [options.mapEngine]
     */
    constructor({ deviceManager, devicePalette, mapEngine = null }) {
      this.deviceManager = deviceManager;
      this.devicePalette = devicePalette;
      this.mapEngine = mapEngine;
      this.modalEl = null;
      this.targetCoords = null;
      this.activeVisualTab = "icon";
      this.selectedIcon = "router";
      this.uploadedImageDataUrl = "";
      this.markerStyle = "rounded";
      this.markerColor = "#2a7c13";
      this.createModalDOM();
      this.bindEvents();
    }
    createModalDOM() {
      this.modalEl = document.createElement("div");
      this.modalEl.id = "custom-device-modal";
      this.modalEl.style.cssText = `
      position: fixed;
      inset: 0;
      background-color: var(--modal-backdrop, rgba(24, 45, 18, 0.75));
      backdrop-filter: blur(8px);
      z-index: 1000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
      font-family: 'Poppins', sans-serif;
    `;
      this.modalEl.innerHTML = `
      <div style="background-color: var(--bg-secondary, #fbe6c2); border: 1px solid var(--border-color, #e5cca0); border-radius: 12px; width: 100%; max-width: 780px; max-height: 92vh; display: flex; flex-direction: column; box-shadow: 0 20px 40px rgba(0,0,0,0.3); overflow: hidden;">
        
        <!-- Header -->
        <div style="height: 54px; border-bottom: 1px solid var(--border-color, #e5cca0); background: var(--bg-tertiary, #f2dac8); display: flex; align-items: center; justify-content: space-between; padding: 0 20px; flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 28px; height: 28px; border-radius: 6px; background: rgba(42, 124, 19, 0.15); display: flex; align-items: center; justify-content: center; color: var(--accent-blue, #2a7c13);">
              <i data-lucide="sparkles" style="width: 17px; height: 17px;"></i>
            </div>
            <div>
              <span style="font-size: 15px; font-weight: 700; color: var(--text-primary, #18350d); display: block; line-height: 1.2;">Tambah Perangkat Kustom</span>
              <span style="font-size: 11px; color: var(--text-muted, #678458);">Buat perangkat baru dengan ikon vektor atau gambar kustom Anda sendiri</span>
            </div>
          </div>
          <button id="btn-custom-dev-close" class="btn btn-icon btn-sm" title="Tutup">
            <i data-lucide="x" style="width: 18px; height: 18px;"></i>
          </button>
        </div>

        <!-- Scrollable Body with 2-Column Grid -->
        <div style="padding: 18px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; flex: 1;">
          
          <div style="display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 16px;">
            
            <!-- Column 1: Device Metadata & Network Config -->
            <div style="display: flex; flex-direction: column; gap: 12px;">
              
              <!-- Basic Info Card -->
              <div class="info-card" style="display: flex; flex-direction: column; gap: 10px; background: var(--bg-primary, #fff8cf); border: 1px solid var(--border-color, #e5cca0); border-radius: 8px; padding: 12px;">
                <span class="section-label" style="font-size: 11px; font-weight: 700; color: var(--accent-blue, #2a7c13); text-transform: uppercase; margin-bottom: 2px;">
                  1. Identitas Perangkat
                </span>

                <div style="display: flex; flex-direction: column; gap: 3px;">
                  <label style="font-size: 11.5px; font-weight: 600; color: var(--text-primary);">Nama Perangkat *</label>
                  <input type="text" id="cd-name" placeholder="contoh: OLT GPON Gedung A / Smart TV" 
                         style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 7px 10px; font-size: 12.5px; color: var(--text-primary); font-family: inherit;">
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                  <div style="display: flex; flex-direction: column; gap: 3px;">
                    <label style="font-size: 11.5px; font-weight: 600; color: var(--text-primary);">Kategori Jaringan</label>
                    <select id="cd-category" style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 6px 8px; font-size: 12px; color: var(--text-primary); font-family: inherit;">
                      <option value="core">Core Network</option>
                      <option value="distribution" selected>Distribution</option>
                      <option value="infrastructure">Infrastructure</option>
                      <option value="endDevice">End Device</option>
                    </select>
                  </div>

                  <div style="display: flex; flex-direction: column; gap: 3px;">
                    <label style="font-size: 11.5px; font-weight: 600; color: var(--text-primary);">Tipe / Basis</label>
                    <select id="cd-type" style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 6px 8px; font-size: 12px; color: var(--text-primary); font-family: inherit;">
                      <option value="router">Router</option>
                      <option value="main-router">Core Router / CCR</option>
                      <option value="switch">Switch</option>
                      <option value="core-switch">Core / L3 Switch</option>
                      <option value="poe-switch">PoE Switch</option>
                      <option value="access-point">Access Point (Wi-Fi)</option>
                      <option value="wireless-bridge">Wireless Bridge PtP</option>
                      <option value="server">Physical Server</option>
                      <option value="cctv">IP Camera / CCTV</option>
                      <option value="computer">Computer / PC</option>
                      <option value="storage">NAS / SAN Storage</option>
                      <option value="firewall">Firewall</option>
                      <option value="gateway">Internet Gateway</option>
                      <option value="network-pole">Tiang / Tower</option>
                      <option value="odp">ODP / OTB Fiber</option>
                      <option value="network-rack">Network Rack</option>
                      <option value="printer">Printer</option>
                      <option value="ip-phone">VoIP Phone</option>
                      <option value="iot">IoT Device</option>
                      <option value="laptop">Laptop</option>
                      <option value="custom">Perangkat Kustom Lainnya</option>
                      <optgroup label="MikroTik Hardware">
                        <option value="mikrotik-ccr2004">MikroTik CCR (Rack Router)</option>
                        <option value="mikrotik-rb5009">MikroTik RB5009 / RB4011</option>
                        <option value="mikrotik-hex">MikroTik hEX / L009</option>
                        <option value="mikrotik-crs326">MikroTik CRS Switch</option>
                        <option value="mikrotik-crs328">MikroTik CRS PoE Switch</option>
                        <option value="mikrotik-cap-ax">MikroTik cAP / hAP Wi-Fi</option>
                        <option value="mikrotik-lhg5">MikroTik LHG PtP Dish</option>
                        <option value="mikrotik-sxtsq">MikroTik SXTsq / mANTBox</option>
                      </optgroup>
                      <optgroup label="Ruijie / Reyee Hardware">
                        <option value="ruijie-eg210g">Ruijie EG210G-P / EG310GH Gateway</option>
                        <option value="ruijie-nbr6210">Ruijie NBR6210 Enterprise Gateway</option>
                        <option value="ruijie-s5750">Ruijie RG-S5750 Core L3 Switch</option>
                        <option value="ruijie-nbs5200">Ruijie NBS5200 / NBS3100 Switch</option>
                        <option value="ruijie-es218gc">Ruijie ES218GC-P / ES209GC-P PoE</option>
                        <option value="ruijie-rap2260">Ruijie RAP2260 / RAP2200 Ceiling AP</option>
                        <option value="ruijie-rap1200">Ruijie RAP1200 In-Wall AP</option>
                        <option value="ruijie-rap6260">Ruijie RAP6260 Outdoor Wi-Fi 6</option>
                        <option value="ruijie-est350">Ruijie RG-EST350 Wireless Bridge</option>
                      </optgroup>
                      <optgroup label="TP-Link Switch & Hub">
                        <option value="tplink-ls1005g">TP-Link LS1005G / SG1008D Hub</option>
                        <option value="tplink-sg108pe">TP-Link TL-SG108E / SG108PE PoE+</option>
                        <option value="tplink-sg1016d">TP-Link TL-SG1016D / SG1024D Switch</option>
                        <option value="tplink-sg2428p">TP-Link Omada SG2210MP / SG2428P</option>
                        <option value="tplink-sg3428x">TP-Link JetStream SG3428X / SX3016F</option>
                      </optgroup>
                    </select>
                  </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                  <div style="display: flex; flex-direction: column; gap: 3px;">
                    <label style="font-size: 11.5px; font-weight: 600; color: var(--text-primary);">Merk / Brand</label>
                    <input type="text" id="cd-brand" placeholder="contoh: MikroTik, Cisco, Ruijie" 
                           style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 6px 8px; font-size: 12px; color: var(--text-primary); font-family: inherit;">
                  </div>
                  <div style="display: flex; flex-direction: column; gap: 3px;">
                    <label style="font-size: 11.5px; font-weight: 600; color: var(--text-primary);">Model / Seri</label>
                    <input type="text" id="cd-model" placeholder="contoh: CCR2004, RG-ES205" 
                           style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 6px 8px; font-size: 12px; color: var(--text-primary); font-family: inherit;">
                  </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 3px;">
                  <label style="font-size: 11.5px; font-weight: 600; color: var(--text-primary);">Status Operasional Awal</label>
                  <select id="cd-status" style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 6px 8px; font-size: 12px; color: var(--text-primary); font-family: inherit;">
                    <option value="online">Online (Aktif / Normal)</option>
                    <option value="warning">Warning (Dalam Perawatan / Waspada)</option>
                    <option value="offline">Offline (Tidak Aktif)</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
              </div>

              <!-- Network Config Card -->
              <div class="info-card" style="display: flex; flex-direction: column; gap: 8px; background: var(--bg-primary, #fff8cf); border: 1px solid var(--border-color, #e5cca0); border-radius: 8px; padding: 12px;">
                <span class="section-label" style="font-size: 11px; font-weight: 700; color: var(--accent-blue, #2a7c13); text-transform: uppercase; margin-bottom: 2px;">
                  2. Konfigurasi Jaringan (Opsional)
                </span>
                
                <div style="display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 10px;">
                  <div style="display: flex; flex-direction: column; gap: 3px;">
                    <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">Alamat IP (IPv4)</label>
                    <input type="text" id="cd-ip" placeholder="192.168.1.100" 
                           style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 5px 8px; font-size: 11.5px; font-family: var(--font-mono); color: var(--text-primary);">
                  </div>
                  <div style="display: flex; flex-direction: column; gap: 3px;">
                    <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">VLAN ID</label>
                    <input type="number" id="cd-vlan" min="1" max="4094" placeholder="1" value="1" 
                           style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 5px 8px; font-size: 11.5px; font-family: var(--font-mono); color: var(--text-primary);">
                  </div>
                </div>
              </div>

              <!-- Wireless Coverage Card -->
              <div class="info-card" style="display: flex; flex-direction: column; gap: 10px; background: var(--bg-primary, #fff8cf); border: 1px solid var(--border-color, #e5cca0); border-radius: 8px; padding: 12px;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;">
                  <input type="checkbox" id="cd-wireless-enable" style="accent-color: var(--accent-blue, #2a7c13); width: 15px; height: 15px;">
                  <span style="font-size: 11.5px; font-weight: 700; color: var(--text-primary);">Aktifkan Area Cakupan Sinyal Nirkabel</span>
                </label>

                <div id="cd-wireless-controls" style="display: none; flex-direction: column; gap: 8px; padding-top: 4px; border-top: 1px dashed var(--border-light, #edd8b5);">
                  <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px;">
                    <span style="font-weight: 600; color: var(--text-primary);">Radius Jangkauan:</span>
                    <span id="cd-radius-display" style="font-weight: 700; color: var(--accent-blue, #2a7c13); font-family: var(--font-mono);">30 meter</span>
                  </div>
                  <input type="range" id="cd-wireless-radius" min="10" max="250" step="5" value="30" style="accent-color: var(--accent-blue, #2a7c13); width: 100%;">
                  
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <select id="cd-wireless-band" style="background: var(--bg-elevated); border: 1px solid var(--border-color); border-radius: 4px; padding: 4px 6px; font-size: 11px;">
                      <option value="dual-band">Dual-Band (2.4 & 5 GHz)</option>
                      <option value="5ghz">5 GHz High-Speed</option>
                      <option value="2.4ghz">2.4 GHz Long-Range</option>
                      <option value="ptp">PtP Bridge Directive</option>
                    </select>
                    <input type="color" id="cd-wireless-color" value="#76c457" title="Warna Lingkaran Sinyal" style="width: 100%; height: 26px; border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer; padding: 1px;">
                  </div>
                </div>
              </div>

            </div>

            <!-- Column 2: Visual Marker, Icon & Custom Image Selection -->
            <div style="display: flex; flex-direction: column; gap: 12px;">
              
              <!-- Live Preview Card -->
              <div class="info-card" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; background: var(--bg-primary, #fff8cf); border: 1px solid var(--border-color, #e5cca0); border-radius: 8px; padding: 14px; text-align: center;">
                <span style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">
                  Live Marker Preview (Tampilan Peta)
                </span>

                <div id="cd-marker-preview-box" style="width: 68px; height: 68px; display: flex; align-items: center; justify-content: center; background: #18350d; border: 2.5px solid var(--accent-cyan, #76c457); border-radius: 12px; position: relative; box-shadow: 0 6px 14px rgba(0,0,0,0.3); transition: all 0.2s ease;">
                  <div id="cd-preview-graphic" style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;">
                    <!-- Injected via updatePreview -->
                  </div>
                  <span id="cd-preview-status-dot" style="position: absolute; top: -4px; right: -4px; width: 11px; height: 11px; border-radius: 50%; background-color: #22c55e; border: 2px solid #18350d;"></span>
                </div>

                <div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
                  <span id="cd-preview-name" style="font-size: 12px; font-weight: 700; color: var(--text-primary); line-height: 1.2;">
                    Perangkat Kustom
                  </span>
                  <span id="cd-preview-sub" style="font-size: 10.5px; color: var(--text-muted);">
                    Brand Model
                  </span>
                </div>

                <div style="width: 100%; display: flex; flex-direction: column; gap: 4px; border-top: 1px solid var(--border-light, #edd8b5); padding-top: 8px;">
                  <label style="font-size: 11px; font-weight: 600; color: var(--text-primary); text-align: left;">Bentuk Marker</label>
                  <select id="cd-marker-style" style="background: var(--bg-elevated); border: 1px solid var(--border-color); border-radius: 6px; padding: 5px 8px; font-size: 11.5px; color: var(--text-primary);">
                    <option value="rounded">Kotak Melengkung (Default)</option>
                    <option value="circle">Lingkaran (Circular Badge)</option>
                    <option value="icon-only">Hanya Ikon Transparan</option>
                  </select>
                </div>
              </div>

              <!-- Visual Selector: Tabs for Icon vs Image -->
              <div class="info-card" style="display: flex; flex-direction: column; gap: 10px; background: var(--bg-primary, #fff8cf); border: 1px solid var(--border-color, #e5cca0); border-radius: 8px; padding: 12px;">
                
                <div style="display: flex; align-items: center; justify-content: space-between;">
                  <span class="section-label" style="font-size: 11px; font-weight: 700; color: var(--accent-blue); text-transform: uppercase; margin: 0;">
                    3. Desain Visual
                  </span>

                  <!-- Visual Mode Switcher -->
                  <div class="segmented-control" style="font-size: 11px;">
                    <button type="button" id="tab-btn-icon" class="segmented-item active" style="padding: 2px 8px; font-size: 11px;">
                      <i data-lucide="shapes" style="width: 12px; height: 12px;"></i>
                      <span>Ikon</span>
                    </button>
                    <button type="button" id="tab-btn-image" class="segmented-item" style="padding: 2px 8px; font-size: 11px;">
                      <i data-lucide="image" style="width: 12px; height: 12px;"></i>
                      <span>Upload Foto</span>
                    </button>
                  </div>
                </div>

                <!-- Tab 1: Vector Icons Grid -->
                <div id="tab-content-icon" style="display: flex; flex-direction: column; gap: 6px;">
                  <span style="font-size: 10.5px; color: var(--text-muted);">Pilih salah satu ikon jaringan di bawah:</span>
                  <div id="cd-icon-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; max-height: 140px; overflow-y: auto; padding: 4px; border: 1px solid var(--border-light); border-radius: 6px; background: var(--bg-elevated);">
                    <!-- Injected dynamically -->
                  </div>
                </div>

                <!-- Tab 2: Custom Image Upload -->
                <div id="tab-content-image" style="display: none; flex-direction: column; gap: 8px;">
                  <div id="cd-dropzone" style="border: 2px dashed var(--accent-blue); border-radius: 8px; padding: 14px; text-align: center; background: rgba(42, 124, 19, 0.05); cursor: pointer; transition: all 0.2s ease;">
                    <i data-lucide="upload-cloud" style="width: 26px; height: 26px; color: var(--accent-blue); margin: 0 auto 6px auto; display: block;"></i>
                    <span style="font-size: 11.5px; font-weight: 600; color: var(--text-primary); display: block;">Pilih File Gambar Komputer</span>
                    <span style="font-size: 10px; color: var(--text-muted); display: block;">PNG, JPG, SVG, WebP (maks 2MB)</span>
                    <input type="file" id="cd-file-input" accept="image/*" style="display: none;">
                  </div>

                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: 10px; color: var(--text-muted);">atau URL:</span>
                    <input type="text" id="cd-url-input" placeholder="https://.../icon.png" style="flex: 1; font-size: 11px; padding: 4px 6px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-elevated);">
                    <button type="button" id="btn-apply-url" class="btn btn-secondary btn-sm" style="font-size: 10.5px; padding: 4px 8px;">Gunakan</button>
                  </div>

                  <div id="cd-image-preview-row" style="display: none; align-items: center; justify-content: space-between; background: var(--bg-tertiary); padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-color);">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <img id="cd-image-thumb" src="" style="width: 24px; height: 24px; object-fit: contain; border-radius: 3px;" alt="Custom">
                      <span style="font-size: 11px; font-weight: 600; color: var(--text-primary);">Gambar Kustom Terpasang</span>
                    </div>
                    <button type="button" id="btn-remove-image" class="btn btn-danger btn-sm" style="font-size: 10.5px; padding: 2px 6px;" title="Hapus gambar & gunakan ikon">
                      Hapus
                    </button>
                  </div>
                </div>

              </div>

            </div>

          </div>

          <!-- Bottom Option: Save to Palette Template -->
          <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;">
              <input type="checkbox" id="cd-save-template-check" checked style="accent-color: var(--accent-blue); width: 16px; height: 16px;">
              <span style="font-size: 12px; font-weight: 600; color: var(--text-primary);">
                \u2B50 Simpan ke Library Perangkat Kustom (Sidebar) agar bisa digunakan berulang kali
              </span>
            </label>
            <span style="font-size: 10.5px; color: var(--text-muted);">
              Tersimpan permanen di Library
            </span>
          </div>

        </div>

        <!-- Footer Actions -->
        <div style="height: 58px; border-top: 1px solid var(--border-color, #e5cca0); background: var(--bg-tertiary, #f2dac8); display: flex; align-items: center; justify-content: space-between; padding: 0 20px; flex-shrink: 0;">
          <button id="btn-custom-dev-cancel" class="btn btn-secondary btn-sm" style="font-size: 12px; padding: 6px 14px;">
            Batal
          </button>
          
          <div style="display: flex; align-items: center; gap: 8px;">
            <button id="btn-custom-dev-save-only" class="btn btn-secondary btn-sm" style="font-size: 12px; padding: 6px 14px;" title="Hanya simpan template ke sidebar tanpa menaruh ke peta sekarang">
              <i data-lucide="bookmark" style="width: 14px; height: 14px;"></i>
              <span>Simpan ke Library Saja</span>
            </button>
            <button id="btn-custom-dev-place-now" class="btn btn-primary btn-sm" style="font-size: 12px; padding: 6px 16px; background-color: var(--accent-blue, #2a7c13); color: #fff8cf; font-weight: 600;">
              <i data-lucide="check" style="width: 14px; height: 14px;"></i>
              <span>Pasang ke Peta Sekarang</span>
            </button>
          </div>
        </div>

      </div>
    `;
      document.body.appendChild(this.modalEl);
      this.populateIconGrid();
    }
    /**
     * Populate the selectable vector network icons in the grid
     */
    populateIconGrid() {
      const grid = this.modalEl.querySelector("#cd-icon-grid");
      if (!grid) return;
      let html = "";
      const availableKeys = Object.keys(NETWORK_ICON_DEFS);
      availableKeys.forEach((key) => {
        const def = NETWORK_ICON_DEFS[key];
        const isSelected = key === this.selectedIcon;
        const activeBorder = isSelected ? "border: 2px solid var(--accent-blue, #2a7c13); background: rgba(42,124,19,0.12);" : "border: 1px solid var(--border-light, #edd8b5); background: var(--bg-primary, #fff8cf);";
        html += `
        <div class="custom-icon-choice" data-icon-key="${key}" title="${def.name}"
             style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 6px 4px; border-radius: 6px; cursor: pointer; transition: all 0.12s ease; ${activeBorder}">
          <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
            ${getDeviceIconSvg(key, { color: "#2a7c13", size: 22 })}
          </div>
          <span style="font-size: 9px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">
            ${def.name.split(" ")[0]}
          </span>
        </div>
      `;
      });
      grid.innerHTML = html;
      grid.querySelectorAll(".custom-icon-choice").forEach((el) => {
        el.addEventListener("click", () => {
          const iconKey = el.getAttribute("data-icon-key");
          this.selectedIcon = iconKey;
          this.uploadedImageDataUrl = "";
          this.activeVisualTab = "icon";
          this.updateIconSelectionUI();
          this.updateLivePreview();
        });
      });
    }
    updateIconSelectionUI() {
      const grid = this.modalEl.querySelector("#cd-icon-grid");
      if (!grid) return;
      grid.querySelectorAll(".custom-icon-choice").forEach((el) => {
        const key = el.getAttribute("data-icon-key");
        const isSelected = key === this.selectedIcon && !this.uploadedImageDataUrl;
        if (isSelected) {
          el.style.border = "2px solid var(--accent-blue, #2a7c13)";
          el.style.background = "rgba(42,124,19,0.12)";
        } else {
          el.style.border = "1px solid var(--border-light, #edd8b5)";
          el.style.background = "var(--bg-primary, #fff8cf)";
        }
      });
    }
    bindEvents() {
      this.modalEl.querySelector("#btn-custom-dev-close")?.addEventListener("click", () => this.hide());
      this.modalEl.querySelector("#btn-custom-dev-cancel")?.addEventListener("click", () => this.hide());
      this.modalEl.addEventListener("click", (e) => {
        if (e.target === this.modalEl) this.hide();
      });
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.modalEl.style.display === "flex") {
          this.hide();
        }
      });
      const inputs = ["#cd-name", "#cd-brand", "#cd-model", "#cd-category", "#cd-type", "#cd-status", "#cd-marker-style"];
      inputs.forEach((sel) => {
        const el = this.modalEl.querySelector(sel);
        if (el) {
          el.addEventListener("input", () => this.updateLivePreview());
          el.addEventListener("change", () => this.updateLivePreview());
        }
      });
      this.modalEl.querySelector("#cd-type")?.addEventListener("change", (e) => {
        const baseType = e.target.value;
        const defaultIcon = getDefaultIconForType(baseType);
        if (defaultIcon && !this.uploadedImageDataUrl) {
          this.selectedIcon = defaultIcon;
          this.updateIconSelectionUI();
          this.updateLivePreview();
        }
      });
      const tabIcon = this.modalEl.querySelector("#tab-btn-icon");
      const tabImage = this.modalEl.querySelector("#tab-btn-image");
      const contentIcon = this.modalEl.querySelector("#tab-content-icon");
      const contentImage = this.modalEl.querySelector("#tab-content-image");
      tabIcon?.addEventListener("click", () => {
        this.activeVisualTab = "icon";
        tabIcon.classList.add("active");
        tabImage.classList.remove("active");
        contentIcon.style.display = "flex";
        contentImage.style.display = "none";
        this.updateLivePreview();
      });
      tabImage?.addEventListener("click", () => {
        this.activeVisualTab = "image";
        tabImage.classList.add("active");
        tabIcon.classList.remove("active");
        contentImage.style.display = "flex";
        contentIcon.style.display = "none";
        this.updateLivePreview();
      });
      const dropzone = this.modalEl.querySelector("#cd-dropzone");
      const fileInput = this.modalEl.querySelector("#cd-file-input");
      dropzone?.addEventListener("click", () => fileInput?.click());
      dropzone?.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.style.borderColor = "var(--accent-cyan)";
        dropzone.style.background = "rgba(118, 196, 87, 0.15)";
      });
      dropzone?.addEventListener("dragleave", () => {
        dropzone.style.borderColor = "var(--accent-blue)";
        dropzone.style.background = "rgba(42, 124, 19, 0.05)";
      });
      dropzone?.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.style.borderColor = "var(--accent-blue)";
        dropzone.style.background = "rgba(42, 124, 19, 0.05)";
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith("image/")) {
          this.processImageFile(file);
        }
      });
      fileInput?.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (file) {
          this.processImageFile(file);
        }
      });
      this.modalEl.querySelector("#btn-apply-url")?.addEventListener("click", () => {
        const urlInput = this.modalEl.querySelector("#cd-url-input");
        const url = urlInput?.value?.trim();
        if (url) {
          this.setImageSource(url);
        }
      });
      this.modalEl.querySelector("#btn-remove-image")?.addEventListener("click", () => {
        this.uploadedImageDataUrl = "";
        const previewRow = this.modalEl.querySelector("#cd-image-preview-row");
        if (previewRow) previewRow.style.display = "none";
        this.updateLivePreview();
      });
      const wirelessToggle = this.modalEl.querySelector("#cd-wireless-enable");
      const wirelessControls = this.modalEl.querySelector("#cd-wireless-controls");
      const wirelessRadius = this.modalEl.querySelector("#cd-wireless-radius");
      const radiusDisplay = this.modalEl.querySelector("#cd-radius-display");
      wirelessToggle?.addEventListener("change", () => {
        wirelessControls.style.display = wirelessToggle.checked ? "flex" : "none";
      });
      wirelessRadius?.addEventListener("input", () => {
        if (radiusDisplay) radiusDisplay.textContent = `${wirelessRadius.value} meter`;
      });
      this.modalEl.querySelector("#btn-custom-dev-save-only")?.addEventListener("click", () => {
        this.saveCustomDevice(false);
      });
      this.modalEl.querySelector("#btn-custom-dev-place-now")?.addEventListener("click", () => {
        this.saveCustomDevice(true);
      });
      eventBus.on("modal:open-custom-device", (coords) => {
        this.show(coords);
      });
    }
    processImageFile(file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("Ukuran file gambar melebihi batas 2MB. Pilih file gambar yang lebih kecil.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        this.setImageSource(dataUrl);
      };
      reader.readAsDataURL(file);
    }
    setImageSource(src) {
      this.uploadedImageDataUrl = src;
      const previewRow = this.modalEl.querySelector("#cd-image-preview-row");
      const thumb = this.modalEl.querySelector("#cd-image-thumb");
      if (previewRow && thumb) {
        thumb.src = src;
        previewRow.style.display = "flex";
      }
      this.updateLivePreview();
    }
    updateLivePreview() {
      const nameInput = this.modalEl.querySelector("#cd-name");
      const brandInput = this.modalEl.querySelector("#cd-brand");
      const modelInput = this.modalEl.querySelector("#cd-model");
      const catSelect = this.modalEl.querySelector("#cd-category");
      const statusSelect = this.modalEl.querySelector("#cd-status");
      const styleSelect = this.modalEl.querySelector("#cd-marker-style");
      const name = nameInput?.value?.trim() || "Perangkat Kustom";
      const brand = brandInput?.value?.trim() || "";
      const model = modelInput?.value?.trim() || "";
      const category = catSelect?.value || "core";
      const status = statusSelect?.value || "online";
      const shape = styleSelect?.value || "rounded";
      const catDef = DEVICE_CATEGORIES[category] || DEVICE_CATEGORIES.core;
      const statusDef = DEVICE_STATUSES[status] || DEVICE_STATUSES.online;
      const prevName = this.modalEl.querySelector("#cd-preview-name");
      const prevSub = this.modalEl.querySelector("#cd-preview-sub");
      if (prevName) prevName.textContent = name;
      if (prevSub) prevSub.textContent = brand ? `${brand} ${model}` : model || catDef.name;
      const box = this.modalEl.querySelector("#cd-marker-preview-box");
      const dot = this.modalEl.querySelector("#cd-preview-status-dot");
      const graphicContainer = this.modalEl.querySelector("#cd-preview-graphic");
      if (box) {
        box.style.borderColor = catDef.color;
        if (shape === "circle") {
          box.style.borderRadius = "50%";
        } else if (shape === "icon-only") {
          box.style.borderRadius = "6px";
          box.style.background = "transparent";
          box.style.borderColor = "transparent";
          box.style.boxShadow = "none";
        } else {
          box.style.borderRadius = "12px";
          box.style.background = "#18350d";
          box.style.boxShadow = "0 6px 14px rgba(0,0,0,0.3)";
        }
      }
      if (dot) {
        dot.style.backgroundColor = statusDef.color;
        dot.style.display = shape === "icon-only" ? "none" : "block";
      }
      if (graphicContainer) {
        if (this.uploadedImageDataUrl) {
          graphicContainer.innerHTML = `<img src="${this.uploadedImageDataUrl}" style="width: 32px; height: 32px; object-fit: contain; border-radius: 4px;" alt="Custom">`;
        } else {
          const svg = getDeviceIconSvg(this.selectedIcon, { color: catDef.color, size: 28 });
          graphicContainer.innerHTML = svg;
        }
      }
    }
    /**
     * Save and process the custom device creation
     * @param {boolean} placeNow 
     */
    saveCustomDevice(placeNow = true) {
      const nameInput = this.modalEl.querySelector("#cd-name");
      const name = nameInput?.value?.trim();
      if (!name) {
        alert("Silakan masukkan Nama Perangkat terlebih dahulu.");
        nameInput?.focus();
        return;
      }
      const category = this.modalEl.querySelector("#cd-category")?.value || "core";
      const type = this.modalEl.querySelector("#cd-type")?.value || "custom";
      const brand = this.modalEl.querySelector("#cd-brand")?.value?.trim() || "";
      const model = this.modalEl.querySelector("#cd-model")?.value?.trim() || "";
      const status = this.modalEl.querySelector("#cd-status")?.value || "online";
      const markerStyle = this.modalEl.querySelector("#cd-marker-style")?.value || "rounded";
      const ip = this.modalEl.querySelector("#cd-ip")?.value?.trim() || "";
      const vlan = parseInt(this.modalEl.querySelector("#cd-vlan")?.value || "1", 10);
      const wirelessEnabled = Boolean(this.modalEl.querySelector("#cd-wireless-enable")?.checked);
      let wirelessCoverage = null;
      if (wirelessEnabled) {
        const radius = parseFloat(this.modalEl.querySelector("#cd-wireless-radius")?.value || "30");
        const band = this.modalEl.querySelector("#cd-wireless-band")?.value || "dual-band";
        const color = this.modalEl.querySelector("#cd-wireless-color")?.value || "#76c457";
        wirelessCoverage = {
          enabled: true,
          radiusMeters: radius,
          band,
          color,
          opacity: 0.18,
          hatch: true,
          showLabel: true
        };
      }
      const customDeviceData = {
        name,
        category,
        type,
        brand,
        model,
        status,
        markerStyle,
        customIcon: this.selectedIcon,
        customImage: this.uploadedImageDataUrl || "",
        network: {
          ip,
          vlan: isNaN(vlan) ? 1 : vlan,
          subnet: "255.255.255.0"
        },
        wirelessCoverage
      };
      const saveToTemplate = Boolean(this.modalEl.querySelector("#cd-save-template-check")?.checked);
      if (saveToTemplate && this.devicePalette) {
        this.devicePalette.addCustomTemplate(customDeviceData);
      }
      if (placeNow) {
        let position = { x: 0.5, y: 0.5 };
        if (this.targetCoords && typeof this.targetCoords.normX === "number") {
          position = {
            x: clamp2(this.targetCoords.normX, 0.05, 0.95),
            y: clamp2(this.targetCoords.normY, 0.05, 0.95)
          };
        } else if (this.mapEngine?.stage) {
          const stage = this.mapEngine.stage;
          const scale = stage.scaleX() || 1;
          const naturalW = this.mapEngine.mapDimensions?.width || 1024;
          const naturalH = this.mapEngine.mapDimensions?.height || 1024;
          position = {
            x: clamp2((-stage.x() + stage.width() / 2) / (scale * naturalW), 0.05, 0.95),
            y: clamp2((-stage.y() + stage.height() / 2) / (scale * naturalH), 0.05, 0.95)
          };
        }
        const placedDevice = this.deviceManager.addDevice({
          ...customDeviceData,
          position
        });
        this.deviceManager.selectDevice(placedDevice.id);
        stateManager.setMode("select");
        this.showToast(`\u2728 Perangkat kustom "${name}" berhasil ditambahkan ke peta!`);
      } else {
        this.showToast(`\u2B50 Perangkat kustom "${name}" berhasil disimpan ke Library Sidebar!`);
      }
      this.hide();
    }
    /**
     * Open and display the modal dialog
     * @param {Object} [options]
     * @param {number} [options.normX]
     * @param {number} [options.normY]
     */
    show(options = null) {
      this.targetCoords = options && typeof options.normX === "number" ? options : null;
      const nameInput = this.modalEl.querySelector("#cd-name");
      if (nameInput) {
        nameInput.value = "";
      }
      this.uploadedImageDataUrl = "";
      const previewRow = this.modalEl.querySelector("#cd-image-preview-row");
      if (previewRow) previewRow.style.display = "none";
      this.selectedIcon = "router";
      this.updateIconSelectionUI();
      const tabIcon = this.modalEl.querySelector("#tab-btn-icon");
      const tabImage = this.modalEl.querySelector("#tab-btn-image");
      const contentIcon = this.modalEl.querySelector("#tab-content-icon");
      const contentImage = this.modalEl.querySelector("#tab-content-image");
      if (tabIcon && tabImage && contentIcon && contentImage) {
        tabIcon.classList.add("active");
        tabImage.classList.remove("active");
        contentIcon.style.display = "flex";
        contentImage.style.display = "none";
      }
      this.updateLivePreview();
      this.modalEl.style.display = "flex";
      if (window.lucide) {
        window.lucide.createIcons({ root: this.modalEl });
      }
      setTimeout(() => {
        nameInput?.focus();
      }, 50);
    }
    hide() {
      this.modalEl.style.display = "none";
      this.targetCoords = null;
    }
    showToast(message) {
      let toast = document.getElementById("netmap-action-toast");
      if (!toast) {
        toast = document.createElement("div");
        toast.id = "netmap-action-toast";
        document.body.appendChild(toast);
      }
      toast.textContent = message;
      toast.style.opacity = "1";
      toast.style.transform = "translateX(-50%) translateY(0)";
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(-50%) translateY(8px)";
      }, 2400);
    }
  };

  // js/ui/mikrotik-quick-insert-modal.js
  var VENDOR_PROFILES = {
    mikrotik: {
      id: "mikrotik",
      label: "MikroTik",
      title: "Insert Cepat Perangkat MikroTik",
      subtitle: "Pilih paket atau jumlah unit MikroTik (CCR, RB, CRS, cAP, LHG) untuk langsung disisipkan ke peta",
      catalog: MIKROTIK_CATALOG,
      defaultIp: "192.168.88.1",
      defaultCounts: { "mikrotik-rb5009": 1, "mikrotik-crs326": 1 },
      stripBrandRegex: /^MikroTik\s+/i,
      presets: [
        {
          id: "mt-kantor",
          label: "Kantor / Lab",
          hint: "1x RB5009, 1x CRS326, 2x cAP ax",
          counts: { "mikrotik-rb5009": 1, "mikrotik-crs326": 1, "mikrotik-cap-ax": 2 }
        },
        {
          id: "mt-kampus",
          label: "Gedung / Kampus",
          hint: "1x CCR2004, 2x CRS328 PoE, 4x cAP ax",
          counts: { "mikrotik-ccr2004": 1, "mikrotik-crs328": 2, "mikrotik-cap-ax": 4 }
        },
        {
          id: "mt-ptp",
          label: "Link PtP Antargedung",
          hint: "1x CCR2004, 2x LHG 5 ac, 1x CRS326",
          counts: { "mikrotik-ccr2004": 1, "mikrotik-lhg5": 2, "mikrotik-crs326": 1 }
        },
        {
          id: "mt-wisp",
          label: "Hotspot / Base Station",
          hint: "1x RB4011, 1x mANTBox, 3x SXTsq",
          counts: { "mikrotik-rb4011": 1, "mikrotik-mantbox": 1, "mikrotik-sxtsq": 3 }
        }
      ]
    },
    ruijie: {
      id: "ruijie",
      label: "Ruijie / Reyee",
      title: "Insert Cepat Perangkat Ruijie / Reyee",
      subtitle: "Pilih paket atau jumlah unit Ruijie (EG, NBR, NBS, ES, RAP, EST) untuk langsung disisipkan ke peta",
      catalog: RUIJIE_CATALOG,
      defaultIp: "192.168.110.1",
      defaultCounts: { "ruijie-eg210g": 1, "ruijie-nbs3100-poe": 1 },
      stripBrandRegex: /^Ruijie\s+/i,
      presets: [
        {
          id: "rj-kantor",
          label: "Kantor / Ruko",
          hint: "1x EG210G-P, 1x ES218GC-P, 3x RAP2200",
          counts: { "ruijie-eg210g": 1, "ruijie-es218gc": 1, "ruijie-rap2200": 3 }
        },
        {
          id: "rj-gedung",
          label: "Gedung / Sekolah",
          hint: "1x EG310GH, 2x NBS3100 PoE+, 6x RAP2260",
          counts: { "ruijie-eg310gh": 1, "ruijie-nbs3100-poe": 2, "ruijie-rap2260": 6 }
        },
        {
          id: "rj-hotel",
          label: "Hotel / Asrama",
          hint: "1x NBR6210, 1x NBS5200, 8x RAP1200 In-Wall",
          counts: { "ruijie-nbr6210": 1, "ruijie-nbs5200": 1, "ruijie-rap1200": 8 }
        },
        {
          id: "rj-outdoor",
          label: "Outdoor & PtP Bridge",
          hint: "1x EG210G-P, 2x EST350 V2, 2x RAP6260 Out",
          counts: { "ruijie-eg210g": 1, "ruijie-est350": 2, "ruijie-rap6260": 2 }
        }
      ]
    },
    tplink: {
      id: "tplink",
      label: "TP-Link Switch & Hub",
      title: "Insert Cepat Switch & Hub TP-Link",
      subtitle: "Pilih paket atau jumlah unit Switch / Hub TP-Link (LS, TL-SG, Easy Smart, Omada JetStream)",
      catalog: TPLINK_CATALOG,
      defaultIp: "192.168.0.10",
      defaultCounts: { "tplink-sg1008d": 1, "tplink-sg2210mp": 1 },
      stripBrandRegex: /^TP-Link\s+/i,
      presets: [
        {
          id: "tp-soho",
          label: "Ruang Kerja / Hub",
          hint: "2x LS1005G (5P), 2x TL-SG1008D (8P)",
          counts: { "tplink-ls1005g": 2, "tplink-sg1008d": 2 }
        },
        {
          id: "tp-poe",
          label: "Distribusi PoE & CCTV",
          hint: "1x TL-SG1218MP, 2x TL-SG108PE PoE+",
          counts: { "tplink-sg1218mp": 1, "tplink-sg108pe": 2 }
        },
        {
          id: "tp-omada",
          label: "Omada Gedung / Kampus",
          hint: "1x SG3428X 10G, 2x SG2428P PoE+",
          counts: { "tplink-sg3428x": 1, "tplink-sg2428p": 2 }
        },
        {
          id: "tp-fiber",
          label: "Core Fiber & Rack",
          hint: "1x SX3016F 10G, 2x TL-SG1024D",
          counts: { "tplink-sx3016f": 1, "tplink-sg1024d": 2 }
        }
      ]
    }
  };
  var VendorQuickInsertModal = class {
    /**
     * @param {Object} options
     * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
     * @param {import('../map/map-engine.js').MapEngine} [options.mapEngine]
     */
    constructor({ deviceManager, mapEngine = null }) {
      this.deviceManager = deviceManager;
      this.mapEngine = mapEngine;
      this.modalEl = null;
      this.activeVendor = "mikrotik";
      this.quantities = /* @__PURE__ */ new Map();
      this.resetQuantitiesForVendor(this.activeVendor);
      this.createModalDOM();
      this.bindStaticEvents();
      this.renderVendorContent();
    }
    getProfile() {
      return VENDOR_PROFILES[this.activeVendor] || VENDOR_PROFILES.mikrotik;
    }
    resetQuantitiesForVendor(vendorId) {
      const profile = VENDOR_PROFILES[vendorId] || VENDOR_PROFILES.mikrotik;
      this.quantities.clear();
      profile.catalog.forEach((item) => {
        this.quantities.set(item.type, profile.defaultCounts[item.type] || 0);
      });
    }
    createModalDOM() {
      this.modalEl = document.createElement("div");
      this.modalEl.id = "vendor-quick-insert-modal";
      this.modalEl.style.cssText = `
      position: fixed;
      inset: 0;
      background-color: var(--modal-backdrop, rgba(24, 45, 18, 0.75));
      backdrop-filter: blur(8px);
      z-index: 1000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
      font-family: 'Poppins', sans-serif;
    `;
      this.modalEl.innerHTML = `
      <div style="background-color: var(--bg-secondary, #fbe6c2); border: 1px solid var(--border-color, #e5cca0); border-radius: 12px; width: 100%; max-width: 800px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 20px 40px rgba(0,0,0,0.3); overflow: hidden;">
        <!-- Header -->
        <div style="min-height: 54px; border-bottom: 1px solid var(--border-color, #e5cca0); background: var(--bg-tertiary, #f2dac8); display: flex; align-items: center; justify-content: space-between; padding: 8px 20px; gap: 12px; flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
            <div style="width: 30px; height: 30px; border-radius: 7px; background: rgba(42, 124, 19, 0.16); display: flex; align-items: center; justify-content: center; color: var(--accent-blue, #2a7c13); flex-shrink: 0;">
              <i data-lucide="zap" style="width: 17px; height: 17px;"></i>
            </div>
            <div style="min-width: 0;">
              <span id="vi-modal-title" style="font-size: 15px; font-weight: 700; color: var(--text-primary, #18350d); display: block; line-height: 1.2;">Insert Cepat Perangkat</span>
              <span id="vi-modal-subtitle" style="font-size: 11px; color: var(--text-muted, #678458);">Pilih paket atau jumlah unit perangkat</span>
            </div>
          </div>

          <!-- Vendor Switcher Tabs -->
          <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
            <div class="segmented-control" style="padding: 2px;">
              <button type="button" class="segmented-item btn-vi-vendor active" data-vendor="mikrotik" style="font-size: 11px; padding: 4px 10px;">MikroTik</button>
              <button type="button" class="segmented-item btn-vi-vendor" data-vendor="ruijie" style="font-size: 11px; padding: 4px 10px;">Ruijie / Reyee</button>
              <button type="button" class="segmented-item btn-vi-vendor" data-vendor="tplink" style="font-size: 11px; padding: 4px 10px;">TP-Link</button>
            </div>
            <button id="btn-vi-modal-close" class="btn btn-icon btn-sm" title="Tutup">
              <i data-lucide="x" style="width: 18px; height: 18px;"></i>
            </button>
          </div>
        </div>

        <!-- Body -->
        <div style="padding: 16px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; flex: 1;">
          <!-- Preset Bundles -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--accent-blue, #2a7c13);">1. Paket Topologi Cepat (Opsional)</span>
              <button type="button" id="btn-vi-clear-all" class="btn btn-secondary btn-sm" style="font-size: 10.5px; padding: 2px 8px;">Reset 0</button>
            </div>
            <div id="vi-presets-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(165px, 1fr)); gap: 8px;"></div>
          </div>

          <!-- Hardware List -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <span id="vi-catalog-heading" style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--accent-blue, #2a7c13);">2. Pilih Model & Jumlah Unit</span>
            <div id="vi-catalog-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px;"></div>
          </div>

          <!-- Auto Configuration -->
          <div style="background: var(--bg-primary, #fff8cf); border: 1px solid var(--border-color, #e5cca0); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 10px;">
            <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--accent-blue, #2a7c13);">3. Pengaturan Otomatis (IP, Prefix & Status)</span>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">Prefix Nama (Opsional)</label>
                <input type="text" id="vi-prefix-name" placeholder="misal: Gedung-A"
                       style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 6px 8px; font-size: 12px; color: var(--text-primary);">
              </div>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">IP Awal (Auto Increment)</label>
                <input type="text" id="vi-start-ip" value="192.168.88.1" placeholder="contoh: 192.168.88.1"
                       style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 6px 8px; font-size: 12px; color: var(--text-primary); font-family: var(--font-mono);">
              </div>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">VLAN Default</label>
                <input type="number" id="vi-vlan" value="1" min="1" max="4094"
                       style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 6px 8px; font-size: 12px; color: var(--text-primary); font-family: var(--font-mono);">
              </div>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">Status Awal</label>
                <select id="vi-status" style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 6px 8px; font-size: 12px; color: var(--text-primary);">
                  <option value="online" selected>Online</option>
                  <option value="warning">Warning</option>
                  <option value="offline">Offline</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div style="height: 58px; border-top: 1px solid var(--border-color, #e5cca0); background: var(--bg-tertiary, #f2dac8); display: flex; align-items: center; justify-content: space-between; padding: 0 20px; flex-shrink: 0;">
          <span id="vi-total-summary" style="font-size: 12px; font-weight: 600; color: var(--text-primary);">Total dipilih: 2 perangkat</span>
          <div style="display: flex; gap: 8px;">
            <button type="button" id="btn-vi-cancel" class="btn btn-secondary btn-sm">Batal</button>
            <button type="button" id="btn-vi-insert" class="btn btn-primary btn-sm" style="padding: 6px 14px; font-weight: 700;">
              <i data-lucide="plus-circle" style="width: 14px; height: 14px;"></i>
              <span id="btn-vi-insert-label">Sisipkan 2 Perangkat ke Peta</span>
            </button>
          </div>
        </div>
      </div>
    `;
      document.body.appendChild(this.modalEl);
    }
    renderVendorContent() {
      const profile = this.getProfile();
      const titleEl = this.modalEl.querySelector("#vi-modal-title");
      const subEl = this.modalEl.querySelector("#vi-modal-subtitle");
      const headingEl = this.modalEl.querySelector("#vi-catalog-heading");
      const ipInput = this.modalEl.querySelector("#vi-start-ip");
      if (titleEl) titleEl.textContent = profile.title;
      if (subEl) subEl.textContent = profile.subtitle;
      if (headingEl) headingEl.textContent = `2. Pilih Model & Jumlah Unit ${profile.label}`;
      if (ipInput) ipInput.value = profile.defaultIp;
      this.modalEl.querySelectorAll(".btn-vi-vendor").forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute("data-vendor") === this.activeVendor);
      });
      const presetsGrid = this.modalEl.querySelector("#vi-presets-grid");
      if (presetsGrid) {
        presetsGrid.innerHTML = profile.presets.map((preset) => `
        <button type="button" class="btn-vi-preset" data-preset-id="${preset.id}"
                style="text-align: left; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border-color, #e5cca0); background: var(--bg-primary, #fff8cf); cursor: pointer; display: flex; flex-direction: column; gap: 2px; transition: all 0.15s ease;">
          <span style="font-size: 12px; font-weight: 700; color: var(--text-primary);">${preset.label}</span>
          <span style="font-size: 10px; color: var(--text-muted); line-height: 1.25;">${preset.hint}</span>
        </button>
      `).join("");
      }
      const catalogGrid = this.modalEl.querySelector("#vi-catalog-grid");
      if (catalogGrid) {
        catalogGrid.innerHTML = profile.catalog.map((item) => {
          const cat = DEVICE_CATEGORIES[item.category] || DEVICE_CATEGORIES.core;
          const qty = this.quantities.get(item.type) || 0;
          const iconSvg = getDeviceIconSvg(getDefaultIconForType(item.type), { color: cat.color, size: 18 });
          return `
          <div class="vi-qty-card" data-type="${item.type}"
               style="background: var(--bg-primary, #fff8cf); border: 1.5px solid ${qty > 0 ? cat.color : "var(--border-color, #e5cca0)"}; border-radius: 8px; padding: 8px 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px; transition: border-color 0.15s ease;">
            <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
              <div style="width: 28px; height: 28px; border-radius: 6px; background: rgba(0,0,0,0.06); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                ${iconSvg}
              </div>
              <div style="min-width: 0; flex: 1;">
                <div style="font-size: 11.5px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.name}">
                  ${item.name}
                </div>
                <div style="font-size: 10px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.defaultModel} \u2014 ${item.description}">
                  ${item.defaultModel}
                </div>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
              <button type="button" class="btn btn-secondary btn-sm btn-vi-dec" data-type="${item.type}" style="width: 22px; height: 22px; padding: 0; font-weight: 700;">-</button>
              <input type="number" class="input-vi-qty" data-type="${item.type}" min="0" max="50" value="${qty}"
                     style="width: 36px; height: 22px; text-align: center; font-size: 11px; font-weight: 700; padding: 0 2px; font-family: var(--font-mono);">
              <button type="button" class="btn btn-secondary btn-sm btn-vi-inc" data-type="${item.type}" style="width: 22px; height: 22px; padding: 0; font-weight: 700;">+</button>
            </div>
          </div>
        `;
        }).join("");
      }
      this.bindDynamicEvents();
      this.updateSummary();
    }
    bindStaticEvents() {
      this.modalEl.querySelector("#btn-vi-modal-close")?.addEventListener("click", () => this.hide());
      this.modalEl.querySelector("#btn-vi-cancel")?.addEventListener("click", () => this.hide());
      this.modalEl.addEventListener("click", (e) => {
        if (e.target === this.modalEl) this.hide();
      });
      this.modalEl.querySelectorAll(".btn-vi-vendor").forEach((btn) => {
        btn.addEventListener("click", () => {
          const nextVendor = btn.getAttribute("data-vendor");
          if (nextVendor && nextVendor !== this.activeVendor) {
            this.switchVendor(nextVendor);
          }
        });
      });
      this.modalEl.querySelector("#btn-vi-clear-all")?.addEventListener("click", () => {
        this.getProfile().catalog.forEach((item) => this.setQty(item.type, 0));
      });
      this.modalEl.querySelector("#btn-vi-insert")?.addEventListener("click", () => {
        this.handleInsert();
      });
      eventBus.on("modal:open-mikrotik-insert", () => {
        this.show("mikrotik");
      });
      eventBus.on("modal:open-vendor-insert", (payload) => {
        this.show(payload?.vendor || "mikrotik");
      });
    }
    bindDynamicEvents() {
      const profile = this.getProfile();
      this.modalEl.querySelectorAll(".btn-vi-preset").forEach((btn) => {
        btn.addEventListener("click", () => {
          const preset = profile.presets.find((p) => p.id === btn.getAttribute("data-preset-id"));
          if (!preset) return;
          profile.catalog.forEach((item) => {
            this.setQty(item.type, preset.counts[item.type] || 0);
          });
        });
      });
      this.modalEl.querySelectorAll(".btn-vi-inc").forEach((btn) => {
        btn.addEventListener("click", () => {
          const type = btn.getAttribute("data-type");
          this.setQty(type, (this.quantities.get(type) || 0) + 1);
        });
      });
      this.modalEl.querySelectorAll(".btn-vi-dec").forEach((btn) => {
        btn.addEventListener("click", () => {
          const type = btn.getAttribute("data-type");
          this.setQty(type, Math.max(0, (this.quantities.get(type) || 0) - 1));
        });
      });
      this.modalEl.querySelectorAll(".input-vi-qty").forEach((input) => {
        input.addEventListener("change", () => {
          const type = input.getAttribute("data-type");
          const parsed = Math.max(0, Math.min(50, parseInt(input.value, 10) || 0));
          this.setQty(type, parsed);
        });
      });
    }
    switchVendor(vendorId) {
      if (!VENDOR_PROFILES[vendorId]) return;
      this.activeVendor = vendorId;
      this.resetQuantitiesForVendor(vendorId);
      this.renderVendorContent();
    }
    setQty(type, qty) {
      const safeQty = Math.max(0, Math.min(50, Number(qty) || 0));
      this.quantities.set(type, safeQty);
      const input = this.modalEl.querySelector(`.input-vi-qty[data-type="${type}"]`);
      if (input) input.value = String(safeQty);
      const card = this.modalEl.querySelector(`.vi-qty-card[data-type="${type}"]`);
      if (card) {
        const def = this.getProfile().catalog.find((i) => i.type === type);
        const cat = DEVICE_CATEGORIES[def?.category] || DEVICE_CATEGORIES.core;
        card.style.borderColor = safeQty > 0 ? cat.color : "var(--border-color, #e5cca0)";
      }
      this.updateSummary();
    }
    updateSummary() {
      let total = 0;
      this.quantities.forEach((v) => {
        total += v;
      });
      const summaryEl = this.modalEl.querySelector("#vi-total-summary");
      const btnLabelEl = this.modalEl.querySelector("#btn-vi-insert-label");
      const insertBtn = this.modalEl.querySelector("#btn-vi-insert");
      if (summaryEl) {
        summaryEl.textContent = `Total dipilih: ${total} perangkat`;
      }
      if (btnLabelEl) {
        btnLabelEl.textContent = total > 0 ? `Sisipkan ${total} Perangkat ke Peta` : "Pilih Minimal 1 Perangkat";
      }
      if (insertBtn) {
        insertBtn.disabled = total === 0;
        insertBtn.style.opacity = total === 0 ? "0.6" : "1";
      }
    }
    getViewportCenterNormalized() {
      const stage = this.mapEngine?.stage;
      if (!stage) return { x: 0.5, y: 0.5 };
      const screenCenter = { x: stage.width() / 2, y: stage.height() / 2 };
      return coordinateSystem.screenToNormalized(screenCenter, stage, true);
    }
    handleInsert() {
      const profile = this.getProfile();
      const selectedEntries = [];
      profile.catalog.forEach((def) => {
        const qty = this.quantities.get(def.type) || 0;
        if (qty > 0) {
          selectedEntries.push({ def, qty });
        }
      });
      if (selectedEntries.length === 0) return;
      const total = selectedEntries.reduce((acc, e) => acc + e.qty, 0);
      const prefixName = (this.modalEl.querySelector("#vi-prefix-name")?.value || "").trim();
      const startIpRaw = (this.modalEl.querySelector("#vi-start-ip")?.value || "").trim();
      const vlanRaw = parseInt(this.modalEl.querySelector("#vi-vlan")?.value || "1", 10);
      const vlan = !isNaN(vlanRaw) && vlanRaw >= 1 && vlanRaw <= 4094 ? vlanRaw : 1;
      const status = this.modalEl.querySelector("#vi-status")?.value || "online";
      let ipParts = null;
      if (startIpRaw && IPv4_REGEX.test(startIpRaw)) {
        ipParts = startIpRaw.split(".").map((n) => parseInt(n, 10));
      }
      const center = this.getViewportCenterNormalized();
      const cols = Math.min(5, Math.ceil(Math.sqrt(total)));
      const rows = Math.ceil(total / cols);
      const stepX = 0.065;
      const stepY = 0.075;
      let idx = 0;
      let lastCreated = null;
      selectedEntries.forEach(({ def, qty }) => {
        for (let i = 1; i <= qty; i++) {
          const col = idx % cols;
          const row = Math.floor(idx / cols);
          const offsetX = (col - (cols - 1) / 2) * stepX;
          const offsetY = (row - (rows - 1) / 2) * stepY;
          const normX = clamp2(center.x + offsetX, 0.05, 0.95);
          const normY = clamp2(center.y + offsetY, 0.05, 0.95);
          const shortModel = def.name.replace(profile.stripBrandRegex, "");
          const label = prefixName ? `${prefixName}-${shortModel}${qty > 1 ? `-${i}` : ""}` : `${def.name}${qty > 1 ? ` #${i}` : ""}`;
          let ip = "";
          if (ipParts) {
            const baseNum = (ipParts[0] << 24) + (ipParts[1] << 16) + (ipParts[2] << 8) + ipParts[3] + idx;
            const o1 = baseNum >>> 24 & 255;
            const o2 = baseNum >>> 16 & 255;
            const o3 = baseNum >>> 8 & 255;
            const o4 = baseNum & 255;
            ip = `${o1}.${o2}.${o3}.${o4}`;
          }
          lastCreated = this.deviceManager.addDevice({
            type: def.type,
            name: label,
            category: def.category,
            brand: def.defaultBrand,
            model: def.defaultModel,
            status,
            position: { x: normX, y: normY },
            network: {
              ip,
              vlan
            }
          });
          idx++;
        }
      });
      if (lastCreated) {
        this.deviceManager.selectDevice(lastCreated.id);
      }
      this.hide();
    }
    show(vendorId) {
      if (vendorId && VENDOR_PROFILES[vendorId] && vendorId !== this.activeVendor) {
        this.switchVendor(vendorId);
      }
      this.modalEl.style.display = "flex";
      if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons({ root: this.modalEl });
      }
    }
    hide() {
      this.modalEl.style.display = "none";
    }
  };

  // js/ui/map-scale-modal.js
  var MapScaleModal = class {
    /**
     * @param {Object} options
     * @param {import('../connections/cable-manager.js').CableManager} options.cableManager
     * @param {number} [options.naturalWidth=1024]
     * @param {number} [options.naturalHeight=1024]
     */
    constructor({ cableManager, naturalWidth = 1024, naturalHeight = 1024 }) {
      this.cableManager = cableManager;
      this.naturalWidth = naturalWidth;
      this.naturalHeight = naturalHeight;
      this.modalEl = null;
      this.createModalDOM();
      this.bindEvents();
    }
    createModalDOM() {
      this.modalEl = document.createElement("div");
      this.modalEl.id = "map-scale-modal";
      this.modalEl.style.cssText = `
      position: fixed;
      inset: 0;
      background-color: var(--modal-backdrop, rgba(0, 0, 0, 0.75));
      backdrop-filter: blur(8px);
      z-index: 1000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
    `;
      this.modalEl.innerHTML = `
      <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-light); border-radius: var(--radius-lg); width: 100%; max-width: 580px; display: flex; flex-direction: column; box-shadow: var(--shadow-lg); overflow: hidden; animation: modalFadeIn 0.2s ease-out;">
        
        <!-- Header -->
        <div style="height: 52px; border-bottom: 1px solid var(--border-color); background: var(--bg-tertiary); display: flex; align-items: center; justify-content: space-between; padding: 0 20px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <i data-lucide="ruler" style="width: 20px; height: 20px; color: var(--accent-green);"></i>
            <span style="font-size: 15px; font-weight: 700; color: var(--text-primary);">Kalibrasi Skala Ukuran Peta</span>
          </div>
          <button id="scale-modal-btn-close" class="btn btn-icon btn-sm" title="Tutup">
            <i data-lucide="x" style="width: 18px; height: 18px;"></i>
          </button>
        </div>

        <!-- Body -->
        <div style="padding: 20px; display: flex; flex-direction: column; gap: 16px; max-height: calc(85vh - 110px); overflow-y: auto;">
          
          <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
            Sesuaikan lebar denah dunia nyata (dalam meter) agar seluruh kalkulasi <strong>panjang fisik kabel</strong>, <strong>redaman sinyal</strong>, <strong>drop PoE</strong>, dan <strong>cakupan nirkabel</strong> berakurasi tinggi sesuai lingkungan sebenarnya.
          </div>

          <!-- Live Ratio Information Box -->
          <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Status Kalibrasi Aktif</span>
              <span id="scale-info-pixel-size" style="font-size: 11px; font-family: var(--font-mono); color: var(--text-muted);">${this.naturalWidth} \xD7 ${this.naturalHeight} px</span>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 2px;">
              <div style="background: var(--bg-secondary); padding: 8px 10px; border-radius: 6px; border: 1px solid var(--border-color);">
                <div style="font-size: 10px; color: var(--text-muted);">Lebar Dunia Nyata:</div>
                <div id="scale-preview-meters" style="font-size: 16px; font-weight: 700; color: var(--accent-green); font-family: var(--font-mono);">
                  ${this.cableManager.mapWidthMeters || 400} Meter
                </div>
              </div>

              <div style="background: var(--bg-secondary); padding: 8px 10px; border-radius: 6px; border: 1px solid var(--border-color);">
                <div style="font-size: 10px; color: var(--text-muted);">Rasio Skala Piksel:</div>
                <div id="scale-preview-ratio" style="font-size: 13px; font-weight: 700; color: var(--accent-blue); font-family: var(--font-mono); margin-top: 2px;">
                  1 px = ${(this.cableManager.metersPerPixel || 0.39).toFixed(3)} m
                </div>
              </div>
            </div>
          </div>

          <!-- Presets Grid -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-size: 11px; font-weight: 700; color: var(--text-primary);">Pilihan Skala Standar (Presets):</label>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;" id="scale-presets-container">
              
              <button type="button" class="scale-preset-btn" data-meters="25" style="display: flex; flex-direction: column; align-items: flex-start; text-align: left; padding: 10px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; transition: all 0.15s ease;">
                <span style="font-size: 12px; font-weight: 700; color: var(--text-primary);">Ruang Server / Data Center</span>
                <span style="font-size: 11px; font-family: var(--font-mono); color: var(--accent-green); font-weight: 600; margin-top: 2px;">25 Meter</span>
                <span style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">1 px \u2248 0.024 m (Detail Rak & Tray)</span>
              </button>

              <button type="button" class="scale-preset-btn" data-meters="60" style="display: flex; flex-direction: column; align-items: flex-start; text-align: left; padding: 10px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; transition: all 0.15s ease;">
                <span style="font-size: 12px; font-weight: 700; color: var(--text-primary);">Satu Lantai Kantor</span>
                <span style="font-size: 11px; font-family: var(--font-mono); color: var(--accent-green); font-weight: 600; margin-top: 2px;">60 Meter</span>
                <span style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">1 px \u2248 0.059 m (Kabel AP & PC)</span>
              </button>

              <button type="button" class="scale-preset-btn" data-meters="150" style="display: flex; flex-direction: column; align-items: flex-start; text-align: left; padding: 10px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; transition: all 0.15s ease;">
                <span style="font-size: 12px; font-weight: 700; color: var(--text-primary);">Satu Gedung Bertingkat</span>
                <span style="font-size: 11px; font-family: var(--font-mono); color: var(--accent-green); font-weight: 600; margin-top: 2px;">150 Meter</span>
                <span style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">1 px \u2248 0.146 m (Riser & Shaft)</span>
              </button>

              <button type="button" class="scale-preset-btn" data-meters="400" style="display: flex; flex-direction: column; align-items: flex-start; text-align: left; padding: 10px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; transition: all 0.15s ease;">
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                  <span style="font-size: 12px; font-weight: 700; color: var(--text-primary);">Kampus / Kantor Wilayah</span>
                  <span style="font-size: 9px; padding: 1px 4px; border-radius: 3px; background: rgba(42, 124, 19, 0.2); color: var(--accent-green); font-weight: 700;">DEFAULT</span>
                </div>
                <span style="font-size: 11px; font-family: var(--font-mono); color: var(--accent-green); font-weight: 600; margin-top: 2px;">400 Meter</span>
                <span style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">1 px \u2248 0.39 m (Antargedung)</span>
              </button>

              <button type="button" class="scale-preset-btn" data-meters="800" style="display: flex; flex-direction: column; align-items: flex-start; text-align: left; padding: 10px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; transition: all 0.15s ease; grid-column: span 2;">
                <span style="font-size: 12px; font-weight: 700; color: var(--text-primary);">Kawasan Industri / Area Luas</span>
                <span style="font-size: 11px; font-family: var(--font-mono); color: var(--accent-green); font-weight: 600; margin-top: 2px;">800 Meter</span>
                <span style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">1 px \u2248 0.78 m (Jalur Backbone FO Panjang)</span>
              </button>

            </div>
          </div>

          <!-- Custom Meter Input -->
          <div style="display: flex; flex-direction: column; gap: 4px; padding: 12px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">
            <label for="scale-input-custom-meters" style="font-size: 11px; font-weight: 700; color: var(--text-primary);">
              Atur Lebar Peta Kustom (Meter):
            </label>
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="number" id="scale-input-custom-meters" min="5" max="10000" step="1" 
                     value="${this.cableManager.mapWidthMeters || 400}" 
                     style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 14px; font-weight: 700; font-family: var(--font-mono); padding: 6px 10px; width: 140px;">
              <span style="font-size: 12px; font-weight: 600; color: var(--text-muted);">Meter</span>
              <span style="font-size: 11px; color: var(--text-muted); margin-left: auto;">(Rentang 5 - 10,000m)</span>
            </div>
          </div>

        </div>

        <!-- Footer -->
        <div style="height: 56px; border-top: 1px solid var(--border-color); background: var(--bg-tertiary); display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 0 20px;">
          <button id="scale-modal-btn-cancel" class="btn btn-secondary">Batal</button>
          <button id="scale-modal-btn-apply" class="btn btn-primary" style="display: flex; align-items: center; gap: 6px;">
            <i data-lucide="check" style="width: 14px; height: 14px;"></i>
            <span>Terapkan Skala Peta</span>
          </button>
        </div>

      </div>
    `;
      document.body.appendChild(this.modalEl);
    }
    bindEvents() {
      const closeBtn = document.getElementById("scale-modal-btn-close");
      const cancelBtn = document.getElementById("scale-modal-btn-cancel");
      const applyBtn = document.getElementById("scale-modal-btn-apply");
      const customInput = document.getElementById("scale-input-custom-meters");
      const presetsContainer = document.getElementById("scale-presets-container");
      const closeModal = () => this.hide();
      closeBtn?.addEventListener("click", closeModal);
      cancelBtn?.addEventListener("click", closeModal);
      this.modalEl.addEventListener("click", (e) => {
        if (e.target === this.modalEl) closeModal();
      });
      customInput?.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val > 0) {
          this.updateLivePreview(val);
        }
      });
      presetsContainer?.querySelectorAll(".scale-preset-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const meters = parseFloat(btn.getAttribute("data-meters"));
          if (customInput) customInput.value = meters;
          this.updateLivePreview(meters);
        });
      });
      applyBtn?.addEventListener("click", () => {
        const val = parseFloat(customInput?.value || "400");
        if (isNaN(val) || val <= 0) {
          alert("Harap masukkan angka meter yang valid (> 0)");
          return;
        }
        this.cableManager.setMapScale(val);
        this.hide();
        const toast = document.createElement("div");
        toast.style.cssText = `
        position: fixed;
        bottom: 45px;
        right: 24px;
        background: var(--bg-secondary);
        color: var(--accent-green);
        border: 1px solid var(--accent-green);
        border-radius: 6px;
        padding: 10px 16px;
        font-size: 12px;
        font-weight: 600;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 8px;
        animation: fadeIn 0.2s ease-out;
      `;
        toast.innerHTML = `<span>\u{1F4D0} Skala denah berhasil dikalibrasi ke <strong>${val} Meter</strong>!</span>`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
      });
      eventBus.on("modal:open-map-scale", () => {
        this.show();
      });
    }
    updateLivePreview(meters) {
      const previewMeters = document.getElementById("scale-preview-meters");
      const previewRatio = document.getElementById("scale-preview-ratio");
      if (previewMeters) previewMeters.textContent = `${meters} Meter`;
      if (previewRatio) {
        const ratio = meters / this.naturalWidth;
        previewRatio.textContent = `1 px = ${ratio.toFixed(3)} m`;
      }
      document.querySelectorAll(".scale-preset-btn").forEach((btn) => {
        const btnMeters = parseFloat(btn.getAttribute("data-meters"));
        if (btnMeters === meters) {
          btn.style.borderColor = "var(--accent-green)";
          btn.style.backgroundColor = "var(--bg-secondary)";
        } else {
          btn.style.borderColor = "var(--border-color)";
          btn.style.backgroundColor = "var(--bg-tertiary)";
        }
      });
    }
    show() {
      if (!this.modalEl) return;
      const currentMeters = this.cableManager.mapWidthMeters || 400;
      const customInput = document.getElementById("scale-input-custom-meters");
      if (customInput) customInput.value = currentMeters;
      this.updateLivePreview(currentMeters);
      this.modalEl.style.display = "flex";
      if (window.lucide) window.lucide.createIcons();
    }
    hide() {
      if (this.modalEl) {
        this.modalEl.style.display = "none";
      }
    }
  };

  // js/app.js
  var NetMapApp = class {
    constructor() {
      this.mapEngine = null;
      this.toolbar = null;
      this.statusBar = null;
      this.deviceManager = null;
      this.cableManager = null;
      this.cableDrawingTool = null;
      this.devicePalette = null;
      this.propertiesPanel = null;
      this.connectionPanel = null;
      this.viewportNavigator = null;
      this.searchEngine = null;
      this.searchUI = null;
      this.topologyModal = null;
      this.ipVlanModal = null;
      this.layerControls = null;
      this.contextMenu = null;
      this.customDeviceModal = null;
      this.mikrotikQuickInsertModal = null;
      this.mapScaleModal = null;
      this.projectStorage = null;
      this.exportModal = null;
      this.projectModal = null;
      this.historyManager = null;
    }
    async init() {
      console.info("[NetMap] Initializing Application (Phase 5 \u2014 Storage & Export Engine)...");
      this.renderIcons();
      this.statusBar = new StatusBar();
      try {
        this.mapEngine = new MapEngine("konva-stage-container");
        await this.mapEngine.init();
        console.info("[NetMap] Map Engine initialized successfully.");
      } catch (err) {
        console.error("[NetMap] Failed to initialize Map Engine:", err);
        return;
      }
      this.toolbar = new Toolbar(this.mapEngine);
      this.viewportNavigator = new ViewportNavigator(
        this.mapEngine.stage,
        this.mapEngine.mapDimensions
      );
      this.deviceManager = new DeviceManager({
        deviceLayer: this.mapEngine.layers.deviceLayer,
        naturalWidth: this.mapEngine.mapDimensions.width,
        naturalHeight: this.mapEngine.mapDimensions.height
      });
      this.cableManager = new CableManager({
        deviceManager: this.deviceManager,
        connectionLayer: this.mapEngine.layers.connectionLayer,
        interactionLayer: this.mapEngine.layers.interactionLayer,
        naturalWidth: this.mapEngine.mapDimensions.width,
        naturalHeight: this.mapEngine.mapDimensions.height
      });
      this.projectStorage = new ProjectStorage({
        deviceManager: this.deviceManager,
        cableManager: this.cableManager
      });
      this.cableDrawingTool = new CableDrawingTool({
        deviceManager: this.deviceManager,
        cableManager: this.cableManager,
        stage: this.mapEngine.stage,
        interactionLayer: this.mapEngine.layers.interactionLayer,
        naturalWidth: this.mapEngine.mapDimensions.width,
        naturalHeight: this.mapEngine.mapDimensions.height
      });
      const paletteContainer = document.getElementById("device-palette-container");
      if (paletteContainer) {
        this.devicePalette = new DevicePalette(paletteContainer);
      }
      const propertiesContainer = document.getElementById("properties-panel-container");
      if (propertiesContainer) {
        this.propertiesPanel = new PropertiesPanel(propertiesContainer, this.deviceManager);
        this.connectionPanel = new ConnectionPanel(propertiesContainer, this.cableManager, this.deviceManager);
      }
      this.searchEngine = new SearchEngine(this.deviceManager, this.cableManager);
      const searchInput = document.getElementById("global-search-input");
      if (searchInput) {
        this.searchUI = new SearchUI({
          inputElement: searchInput,
          searchEngine: this.searchEngine,
          viewportNavigator: this.viewportNavigator
        });
      }
      this.topologyModal = new TopologyModal({
        deviceManager: this.deviceManager,
        cableManager: this.cableManager,
        viewportNavigator: this.viewportNavigator
      });
      this.ipVlanModal = new IpVlanModal({
        deviceManager: this.deviceManager,
        viewportNavigator: this.viewportNavigator
      });
      this.exportModal = new ExportModal({
        projectStorage: this.projectStorage,
        deviceManager: this.deviceManager,
        cableManager: this.cableManager,
        stage: this.mapEngine.stage,
        interactionLayer: this.mapEngine.layers.interactionLayer
      });
      this.projectModal = new ProjectModal({
        projectStorage: this.projectStorage,
        deviceManager: this.deviceManager,
        cableManager: this.cableManager
      });
      this.layerControls = new LayerControls({
        mapLayers: this.mapEngine.layers,
        mapEngine: this.mapEngine,
        deviceManager: this.deviceManager,
        cableManager: this.cableManager
      });
      this.mapEngine.setupSelectionFocusListeners(this.deviceManager, this.cableManager);
      this.historyManager = new HistoryManager({
        deviceManager: this.deviceManager,
        cableManager: this.cableManager
      });
      this.contextMenu = new ContextMenu({
        deviceManager: this.deviceManager,
        cableManager: this.cableManager,
        viewportNavigator: this.viewportNavigator,
        mapEngine: this.mapEngine,
        stage: this.mapEngine.stage
      });
      this.customDeviceModal = new CustomDeviceModal({
        deviceManager: this.deviceManager,
        devicePalette: this.devicePalette,
        mapEngine: this.mapEngine
      });
      this.mikrotikQuickInsertModal = new VendorQuickInsertModal({
        deviceManager: this.deviceManager,
        mapEngine: this.mapEngine
      });
      this.mapScaleModal = new MapScaleModal({
        cableManager: this.cableManager,
        naturalWidth: this.mapEngine.naturalWidth,
        naturalHeight: this.mapEngine.naturalHeight
      });
      window.__netmapApp = this;
      document.getElementById("btn-open-topology")?.addEventListener("click", () => {
        this.topologyModal.show();
      });
      document.getElementById("btn-open-ip-vlan")?.addEventListener("click", () => {
        this.ipVlanModal.show();
      });
      document.getElementById("btn-open-export")?.addEventListener("click", () => {
        this.exportModal.show();
      });
      document.getElementById("btn-open-project")?.addEventListener("click", () => {
        this.projectModal.show();
      });
      document.getElementById("btn-undo")?.addEventListener("click", () => {
        this.historyManager.undo();
      });
      document.getElementById("btn-redo")?.addEventListener("click", () => {
        this.historyManager.redo();
      });
      this.setupCanvasPlacementHandlers();
      this.setupDataCounters();
      this.setupKeyboardShortcuts();
      await this.loadOrSeedProject();
      this.renderIcons();
      console.info("[NetMap] Phase 5 Application ready. Complete NetMap MVP operational.");
    }
    renderIcons() {
      if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
      }
    }
    /**
     * Check IndexedDB for existing project data; if none exists, seed default campus data
     */
    async loadOrSeedProject() {
      try {
        const loaded = await this.projectStorage.loadProject("proj-default");
        if (loaded) {
          console.info("[NetMap] Project successfully restored from IndexedDB.");
        } else {
          console.info("[NetMap] No saved project in IndexedDB. Seeding initial campus topology...");
          this.seedSampleTopology();
          await this.projectStorage.saveCurrentProject();
        }
      } catch (err) {
        console.warn("[NetMap] Error reading IndexedDB, using fallback seed:", err);
        this.seedSampleTopology();
      }
      this.historyManager?.initBaseline();
    }
    /**
     * Setup HTML5 Drag-and-Drop and Click-to-Place on Canvas Viewport
     */
    setupCanvasPlacementHandlers() {
      const viewport = document.getElementById("map-viewport");
      if (!viewport) return;
      viewport.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      });
      viewport.addEventListener("drop", (e) => {
        e.preventDefault();
        const rawData = e.dataTransfer.getData("application/json") || e.dataTransfer.getData("text/plain");
        if (!rawData) return;
        try {
          const itemData = JSON.parse(rawData);
          const rect = viewport.getBoundingClientRect();
          const screenPointer = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
          };
          const stage = this.mapEngine.stage;
          const norm = coordinateSystem.screenToNormalized(screenPointer, stage, true);
          const deviceData = { ...itemData, position: { x: norm.x, y: norm.y } };
          delete deviceData.templateId;
          delete deviceData.isCustom;
          delete deviceData.id;
          const newDevice = this.deviceManager.addDevice(deviceData);
          this.deviceManager.selectDevice(newDevice.id);
        } catch (err) {
          console.error("[NetMap] Failed to handle drop on canvas:", err);
        }
      });
      eventBus.on("canvas:place-device", ({ normalizedX, normalizedY, customDeviceData }) => {
        const currentMode = stateManager.getMode();
        if (currentMode === "add-device") {
          const customTmpl = customDeviceData || this.devicePalette?.activeCustomTemplateToPlace;
          let deviceData;
          if (customTmpl) {
            deviceData = {
              ...customTmpl,
              position: { x: normalizedX, y: normalizedY }
            };
            delete deviceData.templateId;
            delete deviceData.isCustom;
            delete deviceData.id;
          } else {
            const typeToPlace = this.devicePalette?.activeTypeToPlace || "router";
            deviceData = {
              type: typeToPlace,
              position: { x: normalizedX, y: normalizedY }
            };
          }
          const newDevice = this.deviceManager.addDevice(deviceData);
          this.deviceManager.selectDevice(newDevice.id);
          if (!this.devicePalette?.multiPlaceMode) {
            stateManager.setMode("select");
          }
        }
      });
      eventBus.on("canvas:clicked-empty", () => {
        this.deviceManager.deselectDevice();
        this.cableManager.deselectConnection();
      });
    }
    setupDataCounters() {
      const updateCounters = () => {
        const devCount = this.deviceManager.getAllDevices().length;
        const cabCount = this.cableManager.getAllConnections().length;
        const countBadge = document.getElementById("hud-device-count-badge");
        const countStatus = document.getElementById("status-device-count");
        if (countBadge) countBadge.textContent = `${devCount} Perangkat \u2022 ${cabCount} Link Kabel`;
        if (countStatus) countStatus.textContent = `${devCount} dev / ${cabCount} links`;
      };
      eventBus.on("device:added", updateCounters);
      eventBus.on("device:deleted", updateCounters);
      eventBus.on("connection:added", updateCounters);
      eventBus.on("connection:deleted", updateCounters);
    }
    setupKeyboardShortcuts() {
      window.addEventListener("keydown", (e) => {
        if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
          return;
        }
        if (e.ctrlKey || e.metaKey) {
          if (e.key === "z" || e.key === "Z") {
            e.preventDefault();
            if (e.shiftKey) {
              this.historyManager?.redo();
            } else {
              this.historyManager?.undo();
            }
            return;
          }
          if (e.key === "y" || e.key === "Y") {
            e.preventDefault();
            this.historyManager?.redo();
            return;
          }
        }
        const interactions = this.mapEngine?.interactions;
        if (!interactions) return;
        switch (e.key) {
          case "+":
          case "=":
            e.preventDefault();
            interactions.zoomIn();
            break;
          case "-":
          case "_":
            e.preventDefault();
            interactions.zoomOut();
            break;
          case "0":
            e.preventDefault();
            interactions.fitToScreen(30);
            break;
          case "1":
            e.preventDefault();
            interactions.resetView();
            break;
          case "v":
          case "V":
            stateManager.setMode("navigate");
            break;
          case "s":
          case "S":
            stateManager.setMode("select");
            break;
          case "a":
          case "A":
            stateManager.setMode("add-device");
            break;
          case "c":
          case "C":
            stateManager.setMode("draw-cable");
            break;
          case "t":
          case "T":
            e.preventDefault();
            this.topologyModal.show();
            break;
          case "i":
          case "I":
            e.preventDefault();
            this.ipVlanModal.show();
            break;
          case "e":
          case "E":
            e.preventDefault();
            this.exportModal.show();
            break;
          case "p":
          case "P":
            e.preventDefault();
            this.projectModal.show();
            break;
          case "k":
          case "K":
            e.preventDefault();
            this.mapScaleModal.show();
            break;
          case "Delete":
          case "Backspace":
            if (this.deviceManager?.selectedDeviceId) {
              e.preventDefault();
              const curDev = this.deviceManager.getDeviceById(this.deviceManager.selectedDeviceId);
              if (curDev && confirm(`Hapus perangkat "${curDev.name}" beserta seluruh kabelnya?`)) {
                this.deviceManager.deleteDevice(curDev.id);
              }
            } else if (this.cableManager?.selectedCableId) {
              e.preventDefault();
              const curCab = this.cableManager.getConnectionById(this.cableManager.selectedCableId);
              if (curCab && confirm(`Hapus jalur kabel "${curCab.name}"?`)) {
                this.cableManager.deleteConnection(curCab.id);
              }
            }
            break;
          case "Escape":
            this.deviceManager.deselectDevice();
            this.cableManager.deselectConnection();
            stateManager.setMode("navigate");
            break;
        }
      });
    }
    /**
     * Pre-populate realistic sample network topology with devices & cable routes
     */
    seedSampleTopology() {
      const sampleDevices = [
        {
          id: "dev-core-router",
          name: "Main Core Router",
          type: "main-router",
          category: "core",
          brand: "MikroTik",
          model: "CCR2004-16G-2S+",
          position: { x: 0.58, y: 0.185 },
          network: { ip: "192.168.1.1", mac: "48:8F:5A:11:22:33", subnet: "255.255.255.0", vlan: 1, hostname: "rtr-core.campus.net" },
          status: "online",
          location: "Gedung Rektorat (NOC) Lt. 1",
          firmware: "RouterOS v7.14",
          installedAt: "2026-01-15",
          notes: "Main BGP & OSPF gateway kampus"
        },
        {
          id: "dev-core-switch",
          name: "Core Switch Backbone",
          type: "core-switch",
          category: "core",
          brand: "Cisco",
          model: "Catalyst 3850 48P",
          position: { x: 0.64, y: 0.225 },
          network: { ip: "192.168.1.2", mac: "00:26:0B:44:55:66", subnet: "255.255.255.0", vlan: 1, hostname: "csw-noc-01" },
          status: "online",
          location: "Ruang Server NOC Rack 01",
          firmware: "IOS-XE 16.12",
          installedAt: "2026-01-16",
          notes: "Aggregation fiber link antar gedung"
        },
        {
          id: "dev-server-db",
          name: "Main Database Server",
          type: "server",
          category: "endDevice",
          brand: "Dell",
          model: "PowerEdge R450",
          position: { x: 0.69, y: 0.17 },
          network: { ip: "192.168.1.50", mac: "D4:BE:D9:88:99:AA", subnet: "255.255.255.0", vlan: 10, hostname: "db-master.campus.net" },
          status: "online",
          location: "Ruang Server NOC Rack 02",
          firmware: "Ubuntu Server 24.04",
          installedAt: "2026-02-01",
          notes: "Basis data akademik & sistem informasi"
        },
        {
          id: "dev-dist-gda",
          name: "Dist Switch Gedung A",
          type: "dist-switch",
          category: "core",
          brand: "Cisco",
          model: "Catalyst 2960X",
          position: { x: 0.44, y: 0.195 },
          network: { ip: "192.168.10.1", mac: "CC:D5:39:10:20:30", subnet: "255.255.255.0", vlan: 10, hostname: "dsw-gda-lt1" },
          status: "online",
          location: "Gedung A (Barat Laut) Ruang Panel",
          firmware: "15.2(7)E",
          installedAt: "2026-02-10",
          notes: "Uplink FO 10G ke Core Switch"
        },
        {
          id: "dev-ap-gda",
          name: "AP WiFi Gedung A",
          type: "access-point",
          category: "distribution",
          brand: "Ubiquiti UniFi",
          model: "U6-Pro",
          position: { x: 0.44, y: 0.345 },
          network: { ip: "192.168.10.15", mac: "74:83:C2:55:66:77", subnet: "255.255.255.0", vlan: 30, hostname: "ap-gda-lobby" },
          status: "online",
          location: "Gedung Kelas A Sayap Selatan",
          firmware: "UniFi 6.6.65",
          installedAt: "2026-02-12",
          wirelessCoverage: {
            enabled: true,
            radiusMeters: 28,
            color: "#76c457",
            opacity: 0.18,
            hatch: true,
            band: "dual-band",
            showLabel: true
          },
          notes: "SSID: Campus-Staff & Campus-Student"
        },
        {
          id: "dev-dist-gdb",
          name: "Dist Switch Gedung B",
          type: "dist-switch",
          category: "core",
          brand: "Ruijie",
          model: "RG-NBS3100-24GT4SFP",
          position: { x: 0.915, y: 0.27 },
          network: { ip: "192.168.20.1", mac: "58:69:6C:AA:BB:CC", subnet: "255.255.255.0", vlan: 20, hostname: "dsw-gdb-lt1" },
          status: "online",
          location: "Gedung B (Timur) R. Server Mini",
          firmware: "RGOS 11.4",
          installedAt: "2026-02-15",
          notes: "Distribusi lab komputer dan ruang dosen"
        },
        {
          id: "dev-ap-outdoor",
          name: "Outdoor AP Lapangan",
          type: "access-point",
          category: "distribution",
          brand: "Ubiquiti UniFi",
          model: "U6-Mesh Outdoor",
          position: { x: 0.23, y: 0.375 },
          network: { ip: "192.168.30.5", mac: "74:83:C2:11:44:88", subnet: "255.255.255.0", vlan: 30, hostname: "ap-outdoor-field" },
          status: "warning",
          location: "Tiang Lampu Lapangan Basket Utama",
          firmware: "UniFi 6.5.54",
          installedAt: "2026-03-01",
          wirelessCoverage: {
            enabled: true,
            radiusMeters: 45,
            color: "#06b6d4",
            opacity: 0.2,
            hatch: true,
            band: "2.4ghz",
            showLabel: true
          },
          notes: "Peringatan: Redaman link nirkabel meningkat saat hujan"
        },
        {
          id: "dev-cctv-gate",
          name: "IP Camera Gerbang Utara",
          type: "cctv",
          category: "endDevice",
          brand: "Hikvision",
          model: "DS-2CD2043G2-I",
          position: { x: 0.64, y: 0.065 },
          network: { ip: "192.168.100.11", mac: "C8:02:8F:99:88:77", subnet: "255.255.255.0", vlan: 100, hostname: "cam-main-gate" },
          status: "online",
          location: "Pos Satpam Gerbang Utara",
          firmware: "V5.7.13",
          installedAt: "2026-03-05",
          notes: "Resolusi 4MP, H.265+, IR 30m"
        }
      ];
      sampleDevices.forEach((dev) => {
        this.deviceManager.addDevice(dev);
      });
      const sampleCables = [
        {
          id: "cab-uplink-rtr-csw",
          name: "Uplink Router \u2794 Core Switch",
          source: "dev-core-router",
          destination: "dev-core-switch",
          type: "fiber",
          cableCategory: "fiber-sm",
          status: "active",
          route: [],
          details: {
            fiberCoreCount: 2,
            fiberActiveCores: "Core 1-2 (Rx/Tx 10G SFP+)",
            connectorSource: "LC/UPC",
            connectorDest: "LC/UPC",
            wavelength: "1310/1550nm (OS2)",
            tubeColor: "Biru (Tube 1)"
          },
          notes: "Direct 10G SFP+ DAC / FO patchcord NOC"
        },
        {
          id: "cab-bb-csw-gda",
          name: "Backbone FO NOC \u2794 Gedung A",
          source: "dev-core-switch",
          destination: "dev-dist-gda",
          type: "fiber",
          cableCategory: "fiber-sm",
          status: "active",
          route: [
            { x: 0.62, y: 0.125 },
            { x: 0.535, y: 0.125 }
          ],
          details: {
            fiberCoreCount: 12,
            fiberActiveCores: "Core 1-2: Uplink 10G, Core 3-4: Spare",
            connectorSource: "LC/UPC",
            connectorDest: "LC/UPC",
            wavelength: "1310/1550nm (OS2)",
            tubeColor: "Biru (Tube 1)"
          },
          notes: "Jalur ducting bawah tanah via Manhole 2"
        },
        {
          id: "cab-bb-csw-gdb",
          name: "Backbone FO NOC \u2794 Gedung B",
          source: "dev-core-switch",
          destination: "dev-dist-gdb",
          type: "fiber",
          cableCategory: "fiber-sm",
          status: "active",
          route: [
            { x: 0.72, y: 0.12 },
            { x: 0.79, y: 0.2 },
            { x: 0.81, y: 0.27 }
          ],
          details: {
            fiberCoreCount: 24,
            fiberActiveCores: "Core 1-2: Uplink 10G, Core 3-6: VLAN Lab, Core 7-12: Spare",
            connectorSource: "SC/UPC",
            connectorDest: "SC/UPC",
            wavelength: "1310/1550nm (OS2)",
            tubeColor: "Oranye (Tube 2)"
          },
          notes: "Jalur kabel tray luar ruangan via Gedung B"
        },
        {
          id: "cab-srv-db",
          name: "Link Server Database",
          source: "dev-core-switch",
          destination: "dev-server-db",
          type: "ethernet",
          cableCategory: "cat6a",
          status: "active",
          route: [],
          details: {
            shielding: "S/FTP",
            wiringStandard: "T568B",
            maxBandwidth: "10 Gbps",
            poeSupport: "none",
            portSource: "Te1/0/48 (Core)",
            portDestination: "eno1 (Dell R450)",
            jacketType: "lszh"
          },
          notes: "Kabel Cat6A Shielded dalam Rack NOC"
        },
        {
          id: "cab-ap-gda",
          name: "PoE AP Lobby Gedung A",
          source: "dev-dist-gda",
          destination: "dev-ap-gda",
          type: "ethernet",
          cableCategory: "cat6",
          status: "active",
          route: [
            { x: 0.405, y: 0.255 }
          ],
          details: {
            shielding: "U/UTP",
            wiringStandard: "T568B",
            maxBandwidth: "1 Gbps",
            poeSupport: "poe+",
            portSource: "Gi1/0/12 (PoE+ 30W)",
            portDestination: "eth0 (U6-Pro)",
            jacketType: "indoor-pvc"
          },
          notes: "Plafon lantai 1 Gedung A"
        },
        {
          id: "cab-wireless-field",
          name: "Wireless PtP Link Lapangan",
          source: "dev-dist-gdb",
          destination: "dev-ap-outdoor",
          type: "wireless",
          cableCategory: "wireless-link",
          status: "maintenance",
          route: [],
          details: {
            frequency: "5 GHz",
            channelWidth: "40 MHz",
            signalRssi: "-55 dBm"
          },
          notes: "Link nirkabel frekuensi 5 GHz antartiang"
        },
        {
          id: "cab-cctv-gate",
          name: "Jalur Kabel CCTV Gerbang",
          source: "dev-core-switch",
          destination: "dev-cctv-gate",
          type: "coaxial",
          cableCategory: "coaxial",
          status: "active",
          route: [
            { x: 0.66, y: 0.115 }
          ],
          details: {
            coaxType: "RG-6",
            impedance: "75 Ohm",
            coaxConnector: "BNC Compression",
            isSiamese: true
          },
          notes: "Jalur tepi jalan utama menuju gerbang utara"
        }
      ];
      sampleCables.forEach((cab) => {
        this.cableManager.addConnection(cab);
      });
    }
  };
  window.addEventListener("DOMContentLoaded", () => {
    const app = new NetMapApp();
    app.init().catch(console.error);
    window.__netmap = app;
  });
})();
