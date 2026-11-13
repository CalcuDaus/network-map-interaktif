/**
 * NetMap — Viewport Navigator & Smooth Auto-Pan Utility
 * Smoothly centers and zooms camera on target coordinates or devices
 */

import { eventBus } from '../core/event-bus.js';
import { clamp } from '../utils/helpers.js';

export class ViewportNavigator {
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

    const scale = clamp(targetScale, 0.5, 4.0);

    const newX = containerWidth / 2 - targetX * scale;
    const newY = containerHeight / 2 - targetY * scale;

    if (window.Konva && window.Konva.Tween) {
      new Konva.Tween({
        node: this.stage,
        duration: duration / 1000,
        easing: Konva.Easings.EaseInOut,
        scaleX: scale,
        scaleY: scale,
        x: newX,
        y: newY,
        onFinish: () => {
          this.stage.batchDraw();
          eventBus.emit('device:selected', device);
        }
      }).play();
    } else {
      this.stage.scale({ x: scale, y: scale });
      this.stage.position({ x: newX, y: newY });
      this.stage.batchDraw();
      eventBus.emit('device:selected', device);
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

    const scale = clamp(targetScale, 0.5, 4.0);

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
}

