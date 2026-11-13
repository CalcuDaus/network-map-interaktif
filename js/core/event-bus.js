/**
 * NetMap — Central Event Bus (Pub/Sub)
 * Facilitates loosely coupled communication across application modules
 */

class EventBus {
  constructor() {
    this.events = new Map();
  }

  /**
   * Subscribe to an event
   * @param {string} eventName 
   * @param {Function} callback 
   * @returns {Function} Unsubscribe function
   */
  on(eventName, callback) {
    if (!this.events.has(eventName)) {
      this.events.set(eventName, new Set());
    }
    this.events.get(eventName).add(callback);

    // Return cleanup function
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
}

export const eventBus = new EventBus();
