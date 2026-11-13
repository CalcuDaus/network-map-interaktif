/**
 * NetMap — Map Navigation & Interactions
 * Implements 60fps smooth panning, rAF-coalesced cursor-centered zooming,
 * hit-graph suspension during pan/zoom, and throttled pointer/UI tracking
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { coordinateSystem } from './coordinate-system.js';
import { clamp } from '../utils/helpers.js';

export class MapInteractions {
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
    this.hitSuspendReasons = new Set();
    this.scaleBy = 1.15; // Zoom scale factor per discrete wheel step / button click

    // rAF coalescing state for wheel zoom & UI updates
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
      if (this.layers && typeof this.layers.setInteractiveHitTesting === 'function') {
        this.layers.setInteractiveHitTesting(false);
      } else {
        const interactiveIds = ['device-layer', 'connection-layer', 'interaction-layer'];
        this.stage.getLayers().forEach((layer) => {
          if (interactiveIds.includes(layer.id())) {
            layer.listening(false);
            if (typeof layer.hitGraphEnabled === 'function') {
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
      if (this.layers && typeof this.layers.setInteractiveHitTesting === 'function') {
        this.layers.setInteractiveHitTesting(true);
      } else {
        const interactiveIds = ['device-layer', 'connection-layer', 'interaction-layer'];
        this.stage.getLayers().forEach((layer) => {
          if (interactiveIds.includes(layer.id())) {
            layer.listening(true);
            if (typeof layer.hitGraphEnabled === 'function') {
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
    // --- 1. rAF-Coalesced Mouse Wheel & Trackpad Zoom (Centered on Cursor) ---
    this.stage.on('wheel', (e) => {
      e.evt.preventDefault();

      // Normalize deltaY across wheel modes (pixel vs line vs page)
      let deltaY = e.evt.deltaY;
      if (e.evt.deltaMode === 1) deltaY *= 16;
      else if (e.evt.deltaMode === 2) deltaY *= 100;

      this._wheelAccumDelta += deltaY;

      const pointer = this.stage.getPointerPosition();
      if (pointer) {
        this._wheelLastPointer = pointer;
      }

      // Temporarily suspend hit-graph checks during active wheel zoom
      this.suspendHitTesting('wheel');
      clearTimeout(this._wheelResumeTimer);
      this._wheelResumeTimer = setTimeout(() => {
        this.resumeHitTesting('wheel');
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

        // Exponential smooth zoom works cleanly for both notched wheels and smooth trackpads
        const zoomFactor = clamp(Math.pow(1.0016, -accumDelta), 0.72, 1.38);
        const { minScale, maxScale } = stateManager.getState().viewport;
        const newScale = clamp(oldScale * zoomFactor, minScale, maxScale);

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

    // --- 2. Panning / Dragging ---
    this.stage.on('dragstart', (e) => {
      if (e.target === this.stage) {
        this.isDragging = true;
        this.suspendHitTesting('drag');
        this.container.classList.add('panning');
        this.container.style.cursor = 'grabbing';
      }
    });

    this.stage.on('dragmove', (e) => {
      if (e.target === this.stage) {
        // Coalesce DOM state updates to 1x per animation frame during pan
        this.scheduleUiSync(true, false);
      }
    });

    this.stage.on('dragend', (e) => {
      if (e.target === this.stage) {
        this.isDragging = false;
        this.resumeHitTesting('drag');
        this.container.classList.remove('panning');
        if (this.isSpacePressed || stateManager.getMode() === 'navigate') {
          this.container.style.cursor = 'grab';
        } else {
          const mode = stateManager.getMode();
          this.container.style.cursor = (mode === 'add-device' || mode === 'draw-cable') ? 'crosshair' : 'default';
        }
        const pos = this.stage.position();
        stateManager.setViewport(this.stage.scaleX(), pos.x, pos.y);
        this.updatePointerTracking();
      }
    });

    // --- 3. Pointer Move & Normalized Coordinate Tracking (rAF-throttled) ---
    this.stage.on('mousemove', () => {
      if (!this.isDragging) {
        this.scheduleUiSync(false, true);
      }
    });

    // --- 4. Stage Click / Tap (Empty canvas click or placement) ---
    this.stage.on('click tap', (e) => {
      // If Spacebar is currently pressed or was just dragging, ignore click selection
      if (this.isSpacePressed) {
        return;
      }

      // Check if click was on stage background directly (not a marker)
      const isBg = e.target === this.stage || e.target.hasName('bg-layer') || e.target.hasName('background');
      if (isBg) {
        const pointer = this.stage.getPointerPosition();
        if (!pointer) return;

        const norm = coordinateSystem.screenToNormalized(pointer, this.stage);
        const mode = stateManager.getMode();

        if (mode === 'add-device') {
          eventBus.emit('canvas:place-device', {
            normalizedX: norm.x,
            normalizedY: norm.y,
            isInside: norm.isInside
          });
        } else {
          eventBus.emit('canvas:clicked-empty');
        }
      }
    });

    // --- 5. Stage Context Menu (Right Click on Empty Canvas) ---
    this.stage.on('contextmenu', (e) => {
      e.evt.preventDefault();
      const isBg = e.target === this.stage || e.target.hasName('bg-layer') || e.target.hasName('background');
      if (isBg) {
        const pointer = this.stage.getPointerPosition();
        const norm = pointer ? coordinateSystem.screenToNormalized(pointer, this.stage) : { x: 0.5, y: 0.5 };
        eventBus.emit('contextmenu:canvas', {
          screenX: e.evt.clientX,
          screenY: e.evt.clientY,
          normX: norm.x,
          normY: norm.y
        });
      }
    });

    // When pointer leaves the canvas container
    this.container.addEventListener('mouseleave', () => {
      stateManager.setPointerCoordinates({
        isInsideMap: false
      });
    });

    // Prevent default browser context menu on canvas container
    this.container.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }

  /**
   * Listen to external events like centering camera on a position
   */
  initCustomEventListeners() {
    eventBus.on('viewport:center-on', (position) => {
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
    eventBus.on('mode:changed', ({ mode }) => {
      if (this.isSpacePressed) return;
      if (mode === 'navigate') {
        this.stage.draggable(true);
        this.container.style.cursor = 'grab';
      } else {
        this.stage.draggable(false);
        this.container.style.cursor = mode === 'add-device' || mode === 'draw-cable' ? 'crosshair' : 'default';
      }
    });

    // Set initial mode
    const currentMode = stateManager.getMode();
    this.stage.draggable(currentMode === 'navigate');
  }

  /**
   * Spacebar Panning (Photoshop Hand Tool shortcut)
   * Holding Spacebar temporarily enables canvas panning regardless of active mode
   */
  initSpacebarPanning() {
    this.isSpacePressed = false;

    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' && e.key !== ' ') return;

      // Do not intercept if typing in an input, textarea, select, or contenteditable
      const activeEl = document.activeElement;
      const tag = activeEl ? activeEl.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || activeEl?.isContentEditable) {
        return;
      }

      // Prevent window scrolling on spacebar
      e.preventDefault();

      if (this.isSpacePressed) return; // Ignore key repeat while held

      this.isSpacePressed = true;
      this.stage.draggable(true);
      this.container.classList.add('space-panning-active');
      this.container.style.cursor = 'grab';

      // Suspend interactive layer hit-testing so dragging over markers/cables pans smoothly
      this.suspendHitTesting('space');
    });

    window.addEventListener('keyup', (e) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (!this.isSpacePressed) return;

      this.isSpacePressed = false;
      this.container.classList.remove('space-panning-active');
      this.container.classList.remove('panning');

      this.resumeHitTesting('space');

      // Restore stage draggable and cursor based on current mode
      const currentMode = stateManager.getMode();
      if (currentMode === 'navigate') {
        this.stage.draggable(true);
        this.container.style.cursor = 'grab';
      } else {
        this.stage.draggable(false);
        this.container.style.cursor = (currentMode === 'add-device' || currentMode === 'draw-cable') ? 'crosshair' : 'default';
      }
    });

    // Handle window blur (e.g. Alt+Tab while space was down)
    window.addEventListener('blur', () => {
      if (this.isSpacePressed || this.isDragging) {
        this.isSpacePressed = false;
        this.isDragging = false;
        this.container.classList.remove('space-panning-active');
        this.container.classList.remove('panning');
        this.resumeHitTesting('space');
        this.resumeHitTesting('drag');
        const currentMode = stateManager.getMode();
        this.stage.draggable(currentMode === 'navigate');
        this.container.style.cursor = currentMode === 'navigate' ? 'grab' : (currentMode === 'add-device' || currentMode === 'draw-cable' ? 'crosshair' : 'default');
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

    const targetScale = clamp(
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
    const targetScale = 1.0;

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
    const newScale = clamp(oldScale * factor, minScale, maxScale);

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
      this.suspendHitTesting('anim');
      new Konva.Tween({
        node: this.stage,
        duration: duration / 1000,
        easing: Konva.Easings.EaseInOut,
        scaleX: scale,
        scaleY: scale,
        x: x,
        y: y,
        onFinish: () => {
          this.resumeHitTesting('anim');
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
}
