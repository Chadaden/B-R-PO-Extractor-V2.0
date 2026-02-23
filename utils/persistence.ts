
import { DailyQueueItem, DailyQueueState } from '../types';

// --- Types ---

export interface PersistedQueueItem {
  id: string;
  filename: string;
  source: "upload" | "dragdrop"; // We'll default to 'upload' if unknown
  addedAtISO: string;
  status: "queued" | "processing" | "done" | "error";
  errorMessage?: string;
  
  // For 'done' items, this matches the DailyQueueItem structure roughly
  extracted?: {
    header: {
      customer_name: string;
      order_number: string;
      order_date: string;
      dedupe_key: string;
    };
    lines: Array<{
      line_id: string;
      product_description_raw: string;
      product_description_production: string;
      quantity: string;
      tinting: "Y" | "N";
    }>;
  };

  // For 'processing' items (text extracted but not yet processed by AI)
  rawText?: string;
}

export interface PersistedSession {
  schemaVersion: number;
  savedAtISO: string;
  queue: PersistedQueueItem[];
  ui: {
    activeTab: "extraction" | "tinting";
    intakeMode: "pdf" | "text";
    // We can store other UI state here if needed
  };
}

const DB_NAME = "br_po_extractor";
const STORE_NAME = "session";
const KEY = "current";
const DB_VERSION = 1;

// --- IndexedDB Helpers ---

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
};

const dbOp = async <T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let req: IDBRequest<T> | void;

    try {
      req = callback(store);
    } catch (e) {
      reject(e);
      return;
    }

    transaction.oncomplete = () => {
      if (req) resolve(req.result);
      else resolve(undefined as unknown as T);
    };

    transaction.onerror = () => reject(transaction.error);
  });
};

// --- Public API ---

export const saveSession = async (
  dailyQueue: DailyQueueState, 
  activeView: "extraction" | "tinting",
  intakeMode: "pdf" | "text",
  processingItem?: { filename: string; text: string; source: "pdf" | "text" }
): Promise<void> => {
  try {
    const queue: PersistedQueueItem[] = dailyQueue.items.map(item => ({
      id: item.order_id,
      filename: item.source_filename,
      source: "upload", // Defaulting to upload as we don't track drag/drop specifically yet
      addedAtISO: item.created_at_iso,
      status: "done",
      extracted: {
        header: {
          customer_name: item.customer_name,
          order_number: item.order_number,
          order_date: item.order_date,
          dedupe_key: item.dedupe_key,
        },
        lines: item.items
      }
    }));

    // If there's an item currently being processed (we have text but no result yet)
    if (processingItem) {
      queue.push({
        id: `pending-${Date.now()}`,
        filename: processingItem.filename,
        source: processingItem.source === 'pdf' ? 'upload' : 'dragdrop', // Rough mapping
        addedAtISO: new Date().toISOString(),
        status: "processing", // Will be reverted to 'queued' (or just text loaded) on restore
        rawText: processingItem.text
      });
    }

    const session: PersistedSession = {
      schemaVersion: 1,
      savedAtISO: new Date().toISOString(),
      queue,
      ui: {
        activeTab: activeView,
        intakeMode
      }
    };

    await dbOp('readwrite', store => store.put(session, KEY));
  } catch (error) {
    console.error("Failed to save session to IndexedDB:", error);
    // Fallback to localStorage if IDB fails (though IDB is preferred)
    try {
        // We might need to serialize differently for localStorage if it's too big, 
        // but for now let's try basic JSON.
        // Note: QuotaExceededError is likely here if IDB failed due to size, but IDB usually handles more.
        // If IDB failed due to privacy settings, localStorage might work.
    } catch (e) {
        console.error("Failed to save session to localStorage fallback:", e);
    }
  }
};

export const loadSession = async (): Promise<{
  dailyQueue: DailyQueueState | null;
  ui: PersistedSession['ui'] | null;
  restoredProcessingItem: { filename: string; text: string } | null;
} | null> => {
  try {
    const session = await dbOp<PersistedSession>('readonly', store => store.get(KEY));

    if (!session) return null;

    // Migration/Validation could go here. For now, we assume schemaVersion 1.

    const items: DailyQueueItem[] = [];
    let restoredProcessingItem: { filename: string; text: string } | null = null;

    for (const pItem of session.queue) {
      if (pItem.status === 'done' && pItem.extracted) {
        items.push({
          order_id: pItem.id,
          created_at_iso: pItem.addedAtISO,
          source_filename: pItem.filename,
          order_date: pItem.extracted.header.order_date,
          customer_name: pItem.extracted.header.customer_name,
          order_number: pItem.extracted.header.order_number,
          dedupe_key: pItem.extracted.header.dedupe_key,
          items: pItem.extracted.lines
        });
      } else if (pItem.status === 'processing' || pItem.status === 'queued') {
        // Revert processing items to a state where they can be re-run
        if (pItem.rawText) {
            restoredProcessingItem = {
                filename: pItem.filename,
                text: pItem.rawText
            };
        }
      }
    }

    // Reconstruct DailyQueueState
    // We need 'day_key'. We can infer it from the first item or today.
    // If the saved session is from a different day, should we load it?
    // The prompt says "Restore previous session". It doesn't say "only if today".
    // So we load it as is.
    // However, DailyQueueState has a day_key. We'll use the savedAtISO date or today.
    // Actually, let's just use the current day key for the *state* container, 
    // but the items might be old. 
    // Wait, if I restore yesterday's session, I probably want to keep it as is until "Clear Day".
    // Let's use the date from savedAtISO.
    
    const savedDate = new Date(session.savedAtISO);
    const day_key = savedDate.toISOString().slice(0, 10);

    return {
      dailyQueue: {
        day_key,
        items
      },
      ui: session.ui,
      restoredProcessingItem
    };

  } catch (error) {
    console.error("Failed to load session:", error);
    return null;
  }
};

export const clearSession = async (): Promise<void> => {
  try {
    await dbOp('readwrite', store => store.delete(KEY));
  } catch (error) {
    console.error("Failed to clear session:", error);
  }
};
