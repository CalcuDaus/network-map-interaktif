/**
 * NetMap — Utility Helpers
 */

/**
 * Escape HTML special characters for safe DOM interpolation
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Clamp a number between a minimum and maximum value
 * @param {number} val 
 * @param {number} min 
 * @param {number} max 
 * @returns {number}
 */
export function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * @param {Function} func 
 * @param {number} wait 
 * @returns {Function}
 */
export function debounce(func, wait = 150) {
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

/**
 * Creates a throttled function that only invokes func at most once per every wait milliseconds
 * @param {Function} func 
 * @param {number} limit 
 * @returns {Function}
 */
export function throttle(func, limit = 50) {
  let inThrottle;
  return function (...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Format a number with fixed decimal places
 * @param {number} num 
 * @param {number} decimals 
 * @returns {string}
 */
export function formatDecimals(num, decimals = 4) {
  if (typeof num !== 'number' || isNaN(num)) return '0';
  return num.toFixed(decimals);
}

/**
 * Format zoom ratio to percentage string (e.g., 1.25 -> "125%")
 * @param {number} scale 
 * @returns {string}
 */
export function formatZoomPercentage(scale) {
  return `${Math.round(scale * 100)}%`;
}

/**
 * Generate a unique ID with optional prefix
 * @param {string} prefix 
 * @returns {string}
 */
export function generateId(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
}

/**
 * Detect mobile / tablet touch environment without false-positiving desktop touch laptops.
 * @returns {boolean}
 */
export function isMobileTouchDevice() {
  if (typeof window === 'undefined') return false;
  const coarse = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
  const hasTouch = 'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
  const minSide = Math.min(window.innerWidth || 0, window.innerHeight || 0);
  return coarse || (hasTouch && minSide > 0 && minSide <= 950);
}

/**
 * Attach stationary long-press detection for touch context menu parity on DOM or Konva nodes.
 * @param {Object} target - DOM element or Konva node supporting on/off or addEventListener
 * @param {Function} onLongPress - ({ clientX, clientY, target, evt }) => void
 * @param {{ durationMs?: number, moveThreshold?: number }} [options]
 * @returns {Function} cleanup function
 */
export function bindTouchLongPress(target, onLongPress, { durationMs = 520, moveThreshold = 10 } = {}) {
  if (!target || typeof onLongPress !== 'function') return () => {};
  let timer = null;
  let startX = 0;
  let startY = 0;
  let lastEvt = null;

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    lastEvt = null;
  };

  const getCoords = (evt) => {
    const touch = evt?.touches?.[0] || evt?.changedTouches?.[0];
    if (touch) return { x: touch.clientX, y: touch.clientY };
    return { x: Number(evt?.clientX) || 0, y: Number(evt?.clientY) || 0 };
  };

  const onStart = (e) => {
    const domEvt = e?.evt || e;
    if (domEvt?.touches && domEvt.touches.length > 1) {
      cancel();
      return;
    }
    const pt = getCoords(domEvt);
    startX = pt.x;
    startY = pt.y;
    lastEvt = domEvt;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (e && typeof e === 'object' && 'cancelBubble' in e) {
        e.cancelBubble = true;
      }
      onLongPress({
        clientX: startX,
        clientY: startY,
        konvaEvent: e?.evt ? e : null,
        evt: lastEvt
      });
    }, durationMs);
  };

  const onMove = (e) => {
    if (!timer) return;
    const domEvt = e?.evt || e;
    if (domEvt?.touches && domEvt.touches.length > 1) {
      cancel();
      return;
    }
    const pt = getCoords(domEvt);
    if (Math.hypot(pt.x - startX, pt.y - startY) > moveThreshold) {
      cancel();
    }
  };

  if (typeof target.on === 'function' && typeof target.off === 'function') {
    target.on('touchstart.netmaplp', onStart);
    target.on('touchmove.netmaplp', onMove);
    target.on('touchend.netmaplp touchcancel.netmaplp dragstart.netmaplp', cancel);
    return () => {
      cancel();
      target.off('.netmaplp');
    };
  }

  if (typeof target.addEventListener === 'function') {
    target.addEventListener('touchstart', onStart, { passive: true });
    target.addEventListener('touchmove', onMove, { passive: true });
    target.addEventListener('touchend', cancel, { passive: true });
    target.addEventListener('touchcancel', cancel, { passive: true });
    return () => {
      cancel();
      target.removeEventListener('touchstart', onStart);
      target.removeEventListener('touchmove', onMove);
      target.removeEventListener('touchend', cancel);
      target.removeEventListener('touchcancel', cancel);
    };
  }

  return cancel;
}
