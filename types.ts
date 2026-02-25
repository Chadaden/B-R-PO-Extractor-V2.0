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
  batch_number: number;
  date_created: string;
  order_date: string;
  customer_name: string;
  order_number: string;
  product_description: string;
  quantity: string;
  invoice_quantity: string;
  tinting: "Y" | "N";
  comments: string;
  picker_name: string;
}

// Type for items displayed in the new Tinting tab
export interface TintingListItem {
  order_id: string;
  line_id: string;
  batch_number: number;
  date_created: string;
  order_date: string;
  customer_name: string;
  order_number: string;
  product_description: string;
  quantity: string;
  invoice_quantity: string;
  tinting: "Y" | "N";
  comments: string;
  picker_name: string;
}

// Type for exporting tinting data (same as ExportRow now)
export type TintingExportRow = ExportRow;

// Type for toast notifications
export interface ToastInfo {
  message: string;
  type: 'success' | 'error';
}
