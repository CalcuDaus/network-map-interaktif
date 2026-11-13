/**
 * NetMap — Normalized Coordinate System & Math Transforms
 * 
 * Provides bidirection conversion between:
 * 1. Screen (DOM clientX, clientY / pointer)
 * 2. Stage Coordinates (Konva stage local coordinates with offset & scale)
 * 3. Map Image Coordinates (Piksel 0 - 1024 terhadap gambar asli)
 * 4. Normalized Coordinates (0.0000 - 1.0000 terhadap gambar asli)
 */

import { clamp } from '../utils/helpers.js';

export class CoordinateSystem {
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
      x: shouldClamp ? clamp(rawX, 0, 1) : rawX,
      y: shouldClamp ? clamp(rawY, 0, 1) : rawY,
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
}

export const coordinateSystem = new CoordinateSystem(1024, 1024);
