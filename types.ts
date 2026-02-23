export interface Order {
  order_date: string;
  customer_name: string;
  order_number: string;
}

export interface Row {
  id: string;
  product_description_raw: string;
  product_description_production: string;
  quantity: string;
  tinting: 'Y' | 'N';
}

export interface ProductionOrder {
  order: Order;
  rows: Row[];
  warnings: string[];
}

// Types for the Daily Queue feature
export interface DailyQueueItem {
  order_id: string;
  created_at_iso: string;
  source_filename: string;
  order_date: string;
  customer_name: string;
  order_number: string;
  dedupe_key: string;
  items: Array<{
    line_id: string;
    product_description_raw: string;
    product_description_production: string;
    quantity: string;
    tinting: "Y" | "N";
  }>;
}

export interface DailyQueueState {
  day_key: string; // "YYYY-MM-DD"
  items: DailyQueueItem[];
}

export interface ExportRow {
  order_id: string;
  order_date: string;
  customer_name: string;
  order_number: string;
  product_description: string;
  quantity: string;
  tinting: "Y" | "N";
  comments: string;
  invoice_number: string;
  no_stock: string;
}

// Type for items displayed in the new Tinting tab
export interface TintingListItem {
  order_id: string;
  line_id: string;
  customer_name: string;
  order_number: string;
  order_date: string;
  product_description: string;
  quantity: string;
}

// Type for exporting tinting data
export interface TintingExportRow {
    customer_name: string;
    order_number: string;
    order_date: string;
    product_description: string;
    quantity: string;
}

// Type for toast notifications
export interface ToastInfo {
  message: string;
  type: 'success' | 'error';
}
