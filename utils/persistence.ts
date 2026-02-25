
import { DailyQueueItem, DailyQueueState } from '../types';

// --- Types ---

export interface PersistedQueueItem {
  id: string;
  filename: string;
  source: "upload" | "dragdrop";
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
  currentExtraction?: {
    data: any; // We'll store ProductionOrder here
    fileName: string;
    source: 'PDF' | 'TEXT' | null;
  };
  ui: {
    activeTab: "extraction" | "tinting";
    intakeMode: "pdf" | "text";
    isQueueExported: boolean;
  };
}

const DB_NAME = "br_po_extractor";
const STORE_NAME = "session";
const KEY = "current";
const DB_VERSION = 1;
const LS_FALLBACK_KEY = "br_po_extractor_session_v1";

// --- IndexedDB Helpers ---

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    try {
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
        console.warn("IndexedDB error:", (event.target as IDBOpenDBRequest).error);
        reject((event.target as IDBOpenDBRequest).error);
      };
    } catch (e) {
      console.warn("IndexedDB initialization failed:", e);
      reject(e);
    }
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

// --- LocalStorage Fallback Helpers ---

const saveToLocalStorage = (session: PersistedSession) => {
  try {
    const serialized = JSON.stringify(session);
    localStorage.setItem(LS_FALLBACK_KEY, serialized);
  } catch (e) {
    if (e instanceof Error && e.name === 'QuotaExceededError') {
      console.error("LocalStorage quota exceeded. Cannot save session fallback.");
    } else {
      console.error("Failed to save to LocalStorage:", e);
    }
  }
};

const loadFromLocalStorage = (): PersistedSession | null => {
  try {
    const data = localStorage.getItem(LS_FALLBACK_KEY);
    if (!data) return null;
    return JSON.parse(data);
  } catch (e) {
    console.error("Failed to load from LocalStorage:", e);
    return null;
  }
};

const clearLocalStorage = () => {
  try {
    localStorage.removeItem(LS_FALLBACK_KEY);
  } catch (e) {
    console.error("Failed to clear LocalStorage:", e);
  }
};

// --- Public API ---

export const saveSession = async (
  dailyQueue: DailyQueueState,
  activeView: "extraction" | "tinting",
  intakeMode: "pdf" | "text",
  isQueueExported: boolean,
  extractedData: any | null,
  fileName: string,
  extractionSource: 'PDF' | 'TEXT' | null,
  processingItem?: { filename: string; text: string; source: "pdf" | "text" }
): Promise<void> => {
  const queue: PersistedQueueItem[] = dailyQueue.items.map(item => ({
    id: item.order_id,
    filename: item.source_filename,
    source: "upload",
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

  if (processingItem) {
    queue.push({
      id: `pending-${Date.now()}`,
      filename: processingItem.filename,
      source: processingItem.source === 'pdf' ? 'upload' : 'dragdrop',
      addedAtISO: new Date().toISOString(),
      status: "processing",
      rawText: processingItem.text
    });
  }

  const session: PersistedSession = {
    schemaVersion: 1,
    savedAtISO: new Date().toISOString(),
    queue,
    currentExtraction: extractedData ? {
      data: extractedData,
      fileName,
      source: extractionSource
    } : undefined,
    ui: {
      activeTab: activeView,
      intakeMode,
      isQueueExported
    }
  };

  // Always try to save to BOTH for maximum reliability, 
  // or use LS as a reliable quick fallback.
  try {
    await dbOp('readwrite', store => store.put(session, KEY));
  } catch (error) {
    console.warn("IndexedDB save failed, relying solely on LocalStorage:", error);
  }

  // LocalStorage is generally more reliable in restrictive Chrome settings (like Incognito)
  saveToLocalStorage(session);
};

export const loadSession = async (): Promise<{
  dailyQueue: DailyQueueState | null;
  ui: PersistedSession['ui'] | null;
  currentExtraction: PersistedSession['currentExtraction'] | null;
  restoredProcessingItem: { filename: string; text: string } | null;
} | null> => {
  let session: PersistedSession | null = null;

  try {
    session = await dbOp<PersistedSession>('readonly', store => store.get(KEY));
  } catch (error) {
    console.warn("IndexedDB load failed, trying LocalStorage fallback:", error);
  }

  // Fallback to LocalStorage if IDB failed or returned nothing
  if (!session) {
    session = loadFromLocalStorage();
  }

  if (!session) return null;

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
      if (pItem.rawText) {
        restoredProcessingItem = {
          filename: pItem.filename,
          text: pItem.rawText
        };
      }
    }
  }

  const savedDate = new Date(session.savedAtISO);
  const day_key = savedDate.toISOString().slice(0, 10);

  return {
    dailyQueue: {
      day_key,
      items
    },
    ui: session.ui,
    currentExtraction: session.currentExtraction || null,
    restoredProcessingItem
  };
};

export const clearSession = async (): Promise<void> => {
  // Clear both
  try {
    await dbOp('readwrite', store => store.delete(KEY));
  } catch (error) {
    console.warn("IndexedDB clear failed:", error);
  }
  clearLocalStorage();
};
