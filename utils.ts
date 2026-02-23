
import * as XLSX from 'xlsx';
import type { DailyQueueItem, ExportRow, ProductionOrder, TintingListItem, TintingExportRow } from './types';
import { GOOGLE_SHEET_ID } from './constants';

export interface ExcelSheet {
    sheetName: string;
    rows: Record<string, any>[];
}

/**
 * Fetches headers and max batch number from the Google Sheet template.
 */
export const fetchSheetHeadersAndMaxBatch = async (): Promise<{
  extractionHeaders: string[];
  tintingHeaders: string[];
  nextBatchNumber: number;
}> => {
  if (!GOOGLE_SHEET_ID || GOOGLE_SHEET_ID.includes("<PASTE")) {
    throw new Error("Google Sheet ID is not configured. Please set VITE_GOOGLE_SHEET_ID in your environment or update constants.ts.");
  }

  const fetchCsv = async (sheetName: string): Promise<string[][]> => {
    const url = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch sheet "${sheetName}": ${response.statusText}`);
    }
    const csvText = await response.text();
    const workbook = XLSX.read(csvText, { type: 'string' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
  };

  console.log("Export started: Fetching template headers...");

  // Fetch Extraction
  const extractionData = await fetchCsv("Extraction");
  if (extractionData.length === 0) throw new Error("Extraction sheet is empty.");
  const extractionHeaders = extractionData[0];
  console.log("Template headers loaded for Extraction:", extractionHeaders);

  // Find Batch Number column index
  const batchColIndex = extractionHeaders.findIndex(h => h.trim() === "Batch Number");
  let maxBatch = 0;
  if (batchColIndex !== -1) {
    for (let i = 1; i < extractionData.length; i++) {
      const row = extractionData[i];
      const val = parseInt(row[batchColIndex] as string, 10);
      if (!isNaN(val) && val > maxBatch) {
        maxBatch = val;
      }
    }
  }
  console.log(`Computed next batch number: ${maxBatch + 1}`);

  // Fetch Tinting
  const tintingData = await fetchCsv("Tinting");
  if (tintingData.length === 0) throw new Error("Tinting sheet is empty.");
  const tintingHeaders = tintingData[0];
  console.log("Template headers loaded for Tinting:", tintingHeaders);

  return {
    extractionHeaders,
    tintingHeaders,
    nextBatchNumber: maxBatch + 1
  };
};

/**
 * Aligns data objects to the template headers.
 */
export const alignDataToHeaders = (
  data: Record<string, any>[],
  headers: string[],
  defaults: Record<string, any> = {},
  keyMap: Record<string, string> = {}
): any[][] => {
  return data.map(row => {
    return headers.map(header => {
      const key = header.trim();
      
      // Check defaults first (exact match)
      if (defaults[key] !== undefined) return defaults[key];

      // Check row (fuzzy match)
      const lowerHeader = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      // Special mappings
      if (lowerHeader === 'datecreated') return defaults['Date Created'];
      if (lowerHeader === 'batchnumber') return defaults['Batch Number'];
      
      // Check keyMap (exact match on header)
      if (keyMap[key]) return row[keyMap[key]];

      // Check keyMap (fuzzy match on header)
      for (const mapKey in keyMap) {
          if (mapKey.toLowerCase().replace(/[^a-z0-9]/g, '') === lowerHeader) {
              return row[keyMap[mapKey]];
          }
      }
      
      // Try to find matching key in row
      for (const k in row) {
          if (k.toLowerCase().replace(/[^a-z0-9]/g, '') === lowerHeader) return row[k];
      }
      
      return "";
    });
  });
};

/**
 * Generates a unique order ID with the format: "PO-YYYYMMDD-HHMMSS-RAND"
 * Where RAND is 4 uppercase base36 characters.
 */
export const generateOrderId = (): string => {
  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const hhmmss = now.toTimeString().slice(0, 8).replace(/:/g, '');
  // Get 4 random base-36 characters
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PO-${yyyymmdd}-${hhmmss}-${rand}`;
};

/**
 * Generates a unique export ID with the format: "EXP-YYYYMMDD-HHMMSS-RAND"
 * Where RAND is 6 uppercase base36 characters.
 */
export const generateExportId = (): string => {
  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const hhmmss = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `EXP-${yyyymmdd}-${hhmmss}-${rand}`;
};

/**
 * Returns the current date as a "YYYY-MM-DD" string.
 */
export const getTodayKey = (): string => new Date().toISOString().slice(0, 10);

/**
 * Normalizes a string for deduplication: lowercase, trim, collapse whitespace.
 */
export const normalize = (str: string): string => {
  return (str || '').toLowerCase().trim().replace(/\s+/g, ' ');
};

/**
 * Creates a consistent key for an order for deduplication purposes.
 */
export const createDedupeKey = (order: { customer_name: string; order_number: string; order_date: string }): string => {
  const customer = normalize(order.customer_name);
  const number = normalize(order.order_number);
  const date = normalize(order.order_date);
  return `${customer}|${number}|${date}`;
};

/**
 * Converts a string to Title Case.
 * e.g., "ENAMEL SIGNAL RED" -> "Enamel Signal Red"
 */
export const toTitleCase = (input: string): string => {
  if (!input) return '';
  const cleaned = input.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  // Use a regex to capitalize the first letter of each word.
  return cleaned.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
};

/**
 * Parses various date string formats and returns a consistent dd/MM/yyyy string.
 * @param dateString The raw date string from the model.
 * @returns An object with the formatted date and an optional warning.
 */
export function normalizeOrderDate(dateString: string): { date: string; warning: string | null } {
  if (!dateString || typeof dateString !== 'string') {
    return { date: '', warning: null };
  }

  const trimmedDate = dateString.trim();

  // Regex to check if it's already in dd/MM/yyyy format
  const targetFormatRegex = /^\d{2}\/\d{2}\/\d{4}$/;
  if (targetFormatRegex.test(trimmedDate)) {
    return { date: trimmedDate, warning: null };
  }

  // Attempt to parse with new Date(). This handles ISO, RFC2822 ("Thu, 22 Jan..."), "22 Jan 2026", etc.
  const dateObj = new Date(trimmedDate);

  // Check if standard parsing was successful
  if (!isNaN(dateObj.getTime())) {
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
    const year = dateObj.getFullYear();
    return { date: `${day}/${month}/${year}`, warning: null };
  }

  // If standard parsing fails, try manual parsing for d-m-y or d/m/y
  const parts = trimmedDate.split(/[-/]/);
  if (parts.length === 3) {
    let day: number, month: number, year: number;

    // Check for yyyy-mm-dd
    if (parts[0].length === 4) {
      [year, month, day] = parts.map(p => parseInt(p, 10));
    } else { // Assume dd-mm-yyyy
      [day, month, year] = parts.map(p => parseInt(p, 10));
    }
    
    // Basic sanity check on parts
    if (day > 0 && day <= 31 && month > 0 && month <= 12 && year > 1900 && year < 2100) {
      const formattedDay = String(day).padStart(2, '0');
      const formattedMonth = String(month).padStart(2, '0');
      return { date: `${formattedDay}/${formattedMonth}/${year}`, warning: null };
    }
  }
    
  // If all parsing fails, return original and flag a warning
  return { date: trimmedDate, warning: `Unrecognized date format: ${trimmedDate}` };
}


/**
 * Flattens the daily queue data into an array of rows suitable for export.
 */
export const queueToExportRows = (queueItems: DailyQueueItem[]): ExportRow[] => {
  const exportRows: ExportRow[] = [];
  for (const order of queueItems) {
    for (const item of order.items) {
      exportRows.push({
        order_id: order.order_id,
        order_date: order.order_date,
        customer_name: toTitleCase(order.customer_name),
        order_number: order.order_number,
        product_description: toTitleCase(item.product_description_production),
        quantity: item.quantity,
        tinting: item.tinting,
        comments: "",
        invoice_number: "",
        no_stock: "",
      });
    }
  }
  return exportRows;
};

/**
 * Converts a single ProductionOrder into an array of rows suitable for export.
 */
export const productionOrderToExportRows = (
  orderData: ProductionOrder,
  sourceFilename: string
): ExportRow[] => {
    const order_id = generateOrderId(); // Generate a transient ID for this export
    return orderData.rows.map(row => ({
        order_id: order_id,
        order_date: orderData.order.order_date,
        customer_name: toTitleCase(orderData.order.customer_name),
        order_number: orderData.order.order_number,
        product_description: toTitleCase(row.product_description_production),
        quantity: row.quantity,
        tinting: row.tinting,
        comments: "",
        invoice_number: "",
        no_stock: "",
    }));
};

/**
 * Creates and triggers a download for a CSV file.
 */
export const exportToCsv = (exportRows: Record<string, any>[], filename: string): void => {
  if (exportRows.length === 0) {
    alert("Nothing to export.");
    return;
  }
  const headers = Object.keys(exportRows[0]);
  const upperCaseHeaders = headers.map(h => h.toUpperCase());

  const csvContent = [
    upperCaseHeaders.join(','),
    ...exportRows.map(row => 
      headers.map(header => {
        const cell = row[header];
        // Quote the cell to handle commas within the text
        return `"${String(cell ?? '').replace(/"/g, '""')}"`;
      }).join(',')
    )
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Creates and triggers a download for an XLSX file with one or more sheets.
 */
export const exportToXlsx = (sheets: ExcelSheet[], filename: string): void => {
  if (sheets.length === 0 || sheets.every(s => s.rows.length === 0)) {
    alert("Nothing to export.");
    return;
  }
  
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
      if (sheet.rows.length > 0) {
          const headerKeys = Object.keys(sheet.rows[0]);
          const displayHeaders = headerKeys.map(key => key.toUpperCase());

          const data = sheet.rows.map(row => 
              headerKeys.map(key => row[key] ?? "")
          );

          const worksheet = XLSX.utils.aoa_to_sheet([displayHeaders, ...data]);
          XLSX.utils.book_append_sheet(workbook, worksheet, sheet.sheetName);
      }
  }

  if (workbook.SheetNames.length > 0) {
    XLSX.writeFile(workbook, filename);
  } else {
    alert("No data available to export.");
  }
};


// --- Tinting Logic ---
const TINTING_EXCLUDE_KEYWORDS = [
  'thinners', 'solvents', 'lacquer', 'turps', 'acetone', 'meths', 'epoxy', 
  'varnish', '2k', 'sanding sealer', 'aluminium', 'aluminum', 'silver', 
  'primer', 'primers', 'black', 'white', 'stoep', 'chrome'
];

const TINTING_INCLUDE_KEYWORDS = [
  'red', 'blue', 'green', 'grey', 'gray', 'brown', 'cream', 'yellow', 'orange',
  'metallic', 'hammertone', 'ral'
];

const isTintable = (description: string, tintingFlag: 'Y' | 'N'): boolean => {
    if (tintingFlag.toUpperCase() !== 'Y') {
        return false;
    }
    const lowerDesc = description.toLowerCase();
    const isExcluded = TINTING_EXCLUDE_KEYWORDS.some(keyword => lowerDesc.includes(keyword));
    if (isExcluded) {
        return false;
    }
    return TINTING_INCLUDE_KEYWORDS.some(keyword => lowerDesc.includes(keyword));
}

/**
 * Filters the daily queue to find items that require tinting based on deterministic rules.
 */
export const filterTintingItems = (queueItems: DailyQueueItem[]): TintingListItem[] => {
  const tintingList: TintingListItem[] = [];

  for (const order of queueItems) {
    for (const item of order.items) {
      if (isTintable(item.product_description_raw, item.tinting)) {
        tintingList.push({
          order_id: order.order_id,
          line_id: item.line_id,
          customer_name: order.customer_name,
          order_number: order.order_number,
          order_date: order.order_date,
          product_description: item.product_description_production, // Use production for display
          quantity: item.quantity,
        });
      }
    }
  }

  return tintingList;
};

/**
 * Filters a single production order to find items that require tinting.
 */
export const filterTintingItemsFromOrder = (orderData: ProductionOrder): TintingListItem[] => {
    const tintingList: TintingListItem[] = [];

    for (const row of orderData.rows) {
        if (isTintable(row.product_description_raw, row.tinting)) {
            tintingList.push({
                order_id: `transient-${orderData.order.order_number}`,
                line_id: row.id,
                customer_name: orderData.order.customer_name,
                order_number: orderData.order.order_number,
                order_date: orderData.order.order_date,
                product_description: row.product_description_production,
                quantity: row.quantity,
            });
        }
    }
    return tintingList;
}

/**
 * Converts a list of tinting items into a flat structure suitable for CSV/XLSX export.
 */
export const tintingListToExportRows = (items: TintingListItem[]): TintingExportRow[] => {
    return items.map(item => ({
        customer_name: toTitleCase(item.customer_name),
        order_number: item.order_number,
        order_date: item.order_date,
        product_description: toTitleCase(item.product_description),
        quantity: item.quantity,
    }));
};


/**
 * Creates and triggers a download for a styled XLSX file for the daily master export.
 */
export const exportStyledDailyXlsx = (
    extractionHeaders: string[],
    extractionRows: any[][],
    tintingHeaders: string[],
    tintingRows: any[][],
    filename: string
): void => {
    if (extractionRows.length === 0) {
        alert("Nothing to export.");
        return;
    }

    const workbook = XLSX.utils.book_new();

    const borderStyle = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    const headerStyle = {
        font: { bold: true },
        fill: { fgColor: { rgb: "E0E0E0" } }, // Light grey
        border: borderStyle,
    };
    const cellStyle = { border: borderStyle };

    const applyStyling = (ws: XLSX.WorkSheet, data: any[][]) => {
        if (!ws['!ref']) return;
        const range = XLSX.utils.decode_range(ws['!ref']);
        
        // Header style
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: C });
            if (ws[cellAddress]) ws[cellAddress].s = headerStyle;
        }

        // Cell borders, skipping blank rows
        for (let R = range.s.r + 1; R <= range.e.r; ++R) {
            const isBlankRow = !data[R] || data[R].every(cell => cell === null || cell === '');
            if (!isBlankRow) {
                for (let C = range.s.c; C <= range.e.c; ++C) {
                    const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
                    if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' }; // Create cell if it doesn't exist
                    ws[cellAddress].s = cellStyle;
                }
            }
        }
    };
    
    // --- Sheet 1: Daily Extraction ---
    const extractionData: any[][] = [extractionHeaders, ...extractionRows];
    const wsExtraction = XLSX.utils.aoa_to_sheet(extractionData);
    // Auto-width columns roughly (20 chars default)
    wsExtraction['!cols'] = extractionHeaders.map(() => ({ wch: 20 }));
    applyStyling(wsExtraction, extractionData);
    XLSX.utils.book_append_sheet(workbook, wsExtraction, "Daily Extraction");

    // --- Sheet 2: Daily Tinting ---
    if (tintingRows.length > 0) {
        const tintingData: any[][] = [tintingHeaders, ...tintingRows];
        const wsTinting = XLSX.utils.aoa_to_sheet(tintingData);
        wsTinting['!cols'] = tintingHeaders.map(() => ({ wch: 20 }));
        applyStyling(wsTinting, tintingData);
        XLSX.utils.book_append_sheet(workbook, wsTinting, "Daily Tinting");
    }

    XLSX.writeFile(workbook, filename);
};


/**
 * Prepares the payload for the Google Sheets sync.
 */
export const prepareGoogleSheetsPayload = (
    exportId: string,
    extractionHeaders: string[],
    extractionRows: any[][],
    tintingHeaders: string[],
    tintingRows: any[][]
) => {
    return {
        export_id: exportId,
        exported_at: new Date().toISOString(),
        extraction_headers: extractionHeaders,
        extraction_rows: extractionRows,
        tinting_headers: tintingHeaders,
        tinting_rows: tintingRows
    };
};