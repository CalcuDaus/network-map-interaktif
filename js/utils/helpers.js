/**
 * NetMap — Utility Helpers
 */

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
