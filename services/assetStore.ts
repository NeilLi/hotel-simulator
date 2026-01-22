
/**
 * SeedCore Asset Manager
 * Acts as a persistent local "folder" for generated assets using IndexedDB.
 * Prevents re-generation of expensive assets (images, audio) across sessions.
 */
class AssetStore {
  private dbName = 'SeedCoreAssets';
  private storeName = 'generated_images';
  private db: IDBDatabase | null = null;

  /**
   * Opens (or creates) the IndexedDB database.
   */
  private async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          // Create a store for images
          db.createObjectStore(this.storeName);
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error("AssetStore: DB Open Failed", (event.target as IDBOpenDBRequest).error);
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  /**
   * Saves a base64 asset to the store.
   */
  async save(key: string, data: string): Promise<void> {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const req = store.put(data, key);
        
        req.onsuccess = () => {
            console.log(`[AssetStore] Saved asset: ${key}`);
            resolve();
        };
        req.onerror = () => {
            console.warn(`[AssetStore] Failed to save asset: ${key}`, req.error);
            reject(req.error);
        };
      });
    } catch (e) {
      console.warn("[AssetStore] Storage unavailable", e);
    }
  }

  /**
   * Retrieves a base64 asset from the store.
   */
  async get(key: string): Promise<string | null> {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const req = store.get(key);
        
        req.onsuccess = () => {
            if (req.result) console.log(`[AssetStore] Loaded asset from cache: ${key}`);
            resolve(req.result || null);
        };
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return null;
    }
  }
  
  /**
   * Clears the asset cache.
   */
  async clear(): Promise<void> {
      try {
        const db = await this.open();
        const tx = db.transaction(this.storeName, 'readwrite');
        tx.objectStore(this.storeName).clear();
        console.log("[AssetStore] Cache cleared.");
      } catch (e) { console.error(e); }
  }
}

export const assetStore = new AssetStore();
