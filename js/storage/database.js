/**
 * NetMap — IndexedDB Storage Engine
 * Native Promise-based persistent offline storage for projects and preferences
 */

const DB_NAME = 'NetMapDB';
const DB_VERSION = 1;

class Database {
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

        // Store for projects
        if (!db.objectStoreNames.contains('projects')) {
          const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
          projectStore.createIndex('name', 'name', { unique: false });
          projectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // Store for user preferences & settings
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };

      request.onerror = (e) => {
        console.error('[Database] Failed to open IndexedDB:', e.target.error);
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
      const tx = db.transaction('projects', 'readwrite');
      const store = tx.objectStore('projects');
      const request = store.put({
        ...projectData,
        updatedAt: new Date().toISOString()
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
      const tx = db.transaction('projects', 'readonly');
      const store = tx.objectStore('projects');
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
      const tx = db.transaction('projects', 'readonly');
      const store = tx.objectStore('projects');
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
      const tx = db.transaction('projects', 'readwrite');
      const store = tx.objectStore('projects');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const database = new Database();

