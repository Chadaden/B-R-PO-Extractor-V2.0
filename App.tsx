
import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { ProductionOrder, DailyQueueState, DailyQueueItem, ToastInfo } from './types';
import { extractDataFromPdfText } from './services/geminiService';
import {
  generateOrderId, getTodayKey, queueToExportRows, exportToCsv, exportToXlsx,
  createDedupeKey, productionOrderToExportRows, filterTintingItems,
  filterTintingItemsFromOrder, tintingListToExportRows, ExcelSheet, exportStyledDailyXlsx, prepareGoogleSheetsPayload,
  generateExportId,
  normalizeOrderDate,
  fetchSheetHeadersAndMaxBatch,
  alignDataToHeaders,
  triggerSheetAction
} from './utils';
import { saveSession, loadSession, clearSession } from './utils/persistence';
import { WEB_APP_URL, GOOGLE_SHEET_ID } from './constants';
import FileUpload from './components/FileUpload';
import LoadingSpinner from './components/LoadingSpinner';
import ResultsDisplay from './components/ResultsDisplay';
import DailyQueuePanel from './components/DailyQueuePanel';
import { DocumentIcon, ExclamationTriangleIcon } from './components/Icons';
import TintingList from './components/TintingList';
import Toast from './components/Toast';
import PasteTextInput from './components/PasteTextInput';

// PDF.js worker setup
// Using `any` as pdfjsLib is loaded from a script tag and not via ES modules
declare const pdfjsLib: any;
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.mjs`;
}

type View = 'extraction' | 'tinting';
type IntakeMode = 'pdf' | 'text';

const App: React.FC = () => {
  const [extractedData, setExtractedData] = useState<ProductionOrder | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [dailyQueue, setDailyQueue] = useState<DailyQueueState>(() => ({
    day_key: getTodayKey(),
    items: [],
  }));
  const [pendingDuplicate, setPendingDuplicate] = useState<DailyQueueItem | null>(null);
  const [activeView, setActiveView] = useState<View>('extraction');
  const [toastInfo, setToastInfo] = useState<ToastInfo | null>(null);
  const [intakeMode, setIntakeMode] = useState<IntakeMode>('pdf');
  const [extractionSource, setExtractionSource] = useState<'PDF' | 'TEXT' | null>(null);
  const [isQueueExported, setIsQueueExported] = useState<boolean>(false);

  // Persistence state
  const [processingItem, setProcessingItem] = useState<{ filename: string; text: string; source: 'pdf' | 'text' } | undefined>(undefined);
  const [isRestored, setIsRestored] = useState(false);

  // Load session on mount
  useEffect(() => {
    const initSession = async () => {
      try {
        const session = await loadSession();
        if (session) {
          if (session.dailyQueue) {
            setDailyQueue(session.dailyQueue);
          }
          if (session.ui) {
            setActiveView(session.ui.activeTab);
            setIntakeMode(session.ui.intakeMode);
            setIsQueueExported(session.ui.isQueueExported);
          }
          if (session.currentExtraction) {
            setExtractedData(session.currentExtraction.data);
            setFileName(session.currentExtraction.fileName);
            setExtractionSource(session.currentExtraction.source);
          }

          const queueCount = session.dailyQueue?.items.length || 0;
          const lineCount = session.dailyQueue?.items.reduce((acc, item) => acc + item.items.length, 0) || 0;

          let msg = `Restored previous session: ${queueCount} orders / ${lineCount} lines in queue.`;

          if (session.restoredProcessingItem) {
            msg += " Also recovered an interrupted extraction.";
          }

          setToastInfo({
            message: msg,
            type: 'success'
          });
        }
      } catch (err) {
        console.error("Failed to load session:", err);
      } finally {
        setIsRestored(true);
      }
    };
    initSession();
  }, []);

  // Save session on change (debounced)
  useEffect(() => {
    if (!isRestored) return; // Don't save until we've attempted to load

    const timer = setTimeout(() => {
      saveSession(
        dailyQueue,
        activeView,
        intakeMode,
        isQueueExported,
        extractedData,
        fileName,
        extractionSource,
        processingItem
      );
    }, 500);

    return () => clearTimeout(timer);
  }, [dailyQueue, activeView, intakeMode, isQueueExported, extractedData, fileName, extractionSource, processingItem, isRestored]);


  const appendItemToQueue = (itemToAdd: DailyQueueItem) => {
    const today = getTodayKey();
    setDailyQueue(currentQueue => {
      // If the day has changed, start a new queue.
      if (currentQueue.day_key !== today) {
        return {
          day_key: today,
          items: [itemToAdd],
        };
      }
      // Otherwise, append to the existing queue.
      return {
        ...currentQueue,
        items: [...currentQueue.items, itemToAdd],
      };
    });
    setIsQueueExported(false); // Data changed, re-enable export
  };

  const processNewOrder = (extractedData: ProductionOrder, source_filename: string) => {
    // Standardize the date format authoritatively on the client-side.
    const { date: normalizedDate, warning: dateWarning } = normalizeOrderDate(extractedData.order.order_date);
    extractedData.order.order_date = normalizedDate;
    if (dateWarning && !extractedData.warnings.includes(dateWarning)) {
      extractedData.warnings.push(dateWarning);
    }

    const order_id = generateOrderId();
    const dedupe_key = createDedupeKey(extractedData.order);

    const newQueueItem: DailyQueueItem = {
      order_id,
      created_at_iso: new Date().toISOString(),
      source_filename,
      order_date: extractedData.order.order_date, // Use the now-normalized date
      customer_name: extractedData.order.customer_name,
      order_number: extractedData.order.order_number,
      dedupe_key,
      items: extractedData.rows.map((row, index) => ({
        line_id: `${order_id}-L${index + 1}`,
        product_description_raw: row.product_description_raw,
        product_description_production: row.product_description_production,
        quantity: row.quantity,
        tinting: row.tinting,
      })),
    };

    const isDuplicate = dailyQueue.items.some(item => item.dedupe_key === dedupe_key);

    if (isDuplicate) {
      setPendingDuplicate(newQueueItem);
    } else {
      appendItemToQueue(newQueueItem);
    }
    // Switch back to extraction view on new upload
    setActiveView('extraction');
  };

  // Shared extraction logic
  const callGeminiAndProcess = async (text: string, sourceName: string) => {
    try {
      const result = await extractDataFromPdfText(text);
      setExtractedData(result);
      processNewOrder(result, sourceName);
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred during processing.';
      setError(`Extraction failed: ${errorMessage}`);
    } finally {
      setIsLoading(false);
      setProcessingItem(undefined);
    }
  };

  const handleFileSelect = useCallback(async (file: File | null) => {
    if (!file) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setExtractedData(null);
    setFileName(file.name);
    setPendingDuplicate(null);
    setExtractionSource('PDF');

    try {
      const fileReader = new FileReader();
      fileReader.onload = async (event) => {
        if (!event.target?.result) {
          setError('Failed to read the PDF file.');
          setIsLoading(false);
          return;
        }

        try {
          const typedArray = new Uint8Array(event.target.result as ArrayBuffer);
          const pdf = await pdfjsLib.getDocument(typedArray).promise;
          let fullText = '';

          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += pageText + '\n\n';
          }

          if (!fullText.trim()) {
            throw new Error('Could not extract any text from the PDF. It might be an image-only PDF.');
          }

          setProcessingItem({ filename: file.name, text: fullText, source: 'pdf' });
          await callGeminiAndProcess(fullText, file.name);

        } catch (err) {
          console.error(err);
          const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred during processing.';
          setError(`Extraction failed: ${errorMessage}`);
          setIsLoading(false);
          setProcessingItem(undefined);
        }
      };

      fileReader.onerror = () => {
        setError('Error reading file.');
        setIsLoading(false);
        setProcessingItem(undefined);
      };

      fileReader.readAsArrayBuffer(file);
    } catch (err) {
      console.error(err);
      setError('An unexpected error occurred.');
      setIsLoading(false);
      setProcessingItem(undefined);
    }
  }, [dailyQueue]);

  const handleTextExtract = useCallback(async (text: string) => {
    const sourceName = `Pasted Text @ ${new Date().toLocaleTimeString()}`;
    setIsLoading(true);
    setError(null);
    setExtractedData(null);
    setFileName(sourceName);
    setPendingDuplicate(null);
    setExtractionSource('TEXT');

    setProcessingItem({ filename: sourceName, text, source: 'text' });
    await callGeminiAndProcess(text, sourceName);
  }, [dailyQueue]);

  const handleAddAnyway = () => {
    if (pendingDuplicate) {
      appendItemToQueue(pendingDuplicate);
      setPendingDuplicate(null);
    }
  };

  const handleCancelDuplicate = () => {
    setPendingDuplicate(null);
  };

  const handleRemoveQueueItem = useCallback((orderId: string) => {
    setDailyQueue(currentQueue => ({
      ...currentQueue,
      items: currentQueue.items.filter(item => item.order_id !== orderId)
    }));
    setIsQueueExported(false); // Data changed, re-enable export
  }, []);

  const handleOpenQueueItem = useCallback((orderId: string) => {
    const itemToOpen = dailyQueue.items.find(item => item.order_id === orderId);
    if (!itemToOpen) return;

    const orderForDisplay: ProductionOrder = {
      order: {
        order_date: itemToOpen.order_date,
        customer_name: itemToOpen.customer_name,
        order_number: itemToOpen.order_number,
      },
      rows: itemToOpen.items.map(line => ({
        id: line.line_id,
        product_description_raw: line.product_description_raw,
        product_description_production: line.product_description_production,
        quantity: line.quantity,
        tinting: line.tinting,
      })),
      warnings: [], // Warnings are not stored in the queue
    };

    setExtractedData(orderForDisplay);
    setFileName(itemToOpen.source_filename);
    setError(null);
    setIsLoading(false);
    setPendingDuplicate(null);
    setActiveView('extraction'); // Switch to extraction view when opening an item
  }, [dailyQueue]);

  const handleExportThisPoCsv = useCallback(() => {
    if (!extractedData) return;
    const exportRows = productionOrderToExportRows(extractedData, fileName);
    exportToCsv(exportRows, `PO-${extractedData.order.order_number || 'export'}.csv`);
  }, [extractedData, fileName]);

  const handleExportThisPoXlsx = useCallback(() => {
    if (!extractedData) return;

    const extractionHeaders = ["BATCH NUMBER", "DATE CREATED", "ORDER_DATE", "CUSTOMER_NAME", "ORDER_NUMBER", "PRODUCT_DESCRIPTION", "QUANTITY", "INVOICE_QUANTITY", "TINTING", "COMMENTS", "PICKER_NAME"];
    const tintingHeaders = [...extractionHeaders];

    const now = new Date();
    const dateCreated = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const defaults = {
      'DATE CREATED': dateCreated,
      'BATCH NUMBER': 0 // Single POs might not have a batch number yet
    };

    const keyMap: Record<string, string> = {
      'BATCH NUMBER': 'batch_number',
      'DATE CREATED': 'date_created',
      'ORDER_DATE': 'order_date',
      'CUSTOMER_NAME': 'customer_name',
      'ORDER_NUMBER': 'order_number',
      'PRODUCT_DESCRIPTION': 'product_description',
      'QUANTITY': 'quantity',
      'INVOICE_QUANTITY': 'invoice_quantity',
      'TINTING': 'tinting',
      'COMMENTS': 'comments',
      'PICKER_NAME': 'picker_name'
    };

    const extractionRowsRaw = productionOrderToExportRows(extractedData, fileName);
    const tintingItemsForOrder = filterTintingItemsFromOrder(extractedData);
    const tintingRowsRaw = tintingListToExportRows(tintingItemsForOrder);

    const alignedExtractionRows = alignDataToHeaders(extractionRowsRaw as unknown as Record<string, any>[], extractionHeaders, defaults, keyMap);
    const alignedTintingRows = alignDataToHeaders(tintingRowsRaw as unknown as Record<string, any>[], tintingHeaders, defaults, keyMap);

    exportStyledDailyXlsx(
      extractionHeaders,
      alignedExtractionRows,
      tintingHeaders,
      alignedTintingRows,
      `PO-${extractedData.order.order_number || 'export'}.xlsx`
    );
  }, [extractedData, fileName]);

  const handleExportCsv = useCallback(() => {
    const exportRows = queueToExportRows(dailyQueue.items);
    exportToCsv(exportRows, `Production-Batch-${dailyQueue.day_key}.csv`);
  }, [dailyQueue]);

  const handleExportXlsx = useCallback(async () => {
    try {
      setToastInfo({ message: 'Starting export... Fetching template headers.', type: 'success' });

      // 1. Fetch template headers and max batch number
      const { extractionHeaders, tintingHeaders, nextBatchNumber } = await fetchSheetHeadersAndMaxBatch();

      console.log(`Export started. Next Batch: ${nextBatchNumber}`);

      // 2. Prepare data
      // Use local date (Africa/Johannesburg) instead of UTC to avoid midnight offset issues
      const now = new Date();
      const dateCreated = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const defaults = {
        'DATE Created': dateCreated, // Fuzzy matching in utils will catch this, but let's be close
        'DATE CREATED': dateCreated,
        'BATCH NUMBER': nextBatchNumber,
        'Batch Number': nextBatchNumber
      };

      // Mapping for fuzzy matching if headers differ slightly
      const keyMap: Record<string, string> = {
        'BATCH NUMBER': 'batch_number',
        'DATE CREATED': 'date_created',
        'ORDER_DATE': 'order_date',
        'CUSTOMER_NAME': 'customer_name',
        'ORDER_NUMBER': 'order_number',
        'PRODUCT_DESCRIPTION': 'product_description',
        'QUANTITY': 'quantity',
        'INVOICE_QUANTITY': 'invoice_quantity',
        'TINTING': 'tinting',
        'COMMENTS': 'comments',
        'PICKER_NAME': 'picker_name'
      };

      const queueRows = queueToExportRows(dailyQueue.items);
      const tintingItemsForDay = filterTintingItems(dailyQueue.items);
      const tintingRowsRaw = tintingListToExportRows(tintingItemsForDay);

      // 3. Align data
      const alignedExtractionRows = alignDataToHeaders(queueRows as unknown as Record<string, any>[], extractionHeaders, defaults, keyMap);
      const alignedTintingRows = alignDataToHeaders(tintingRowsRaw as unknown as Record<string, any>[], tintingHeaders, defaults, keyMap);

      console.log(`Rows appended: Extraction = ${alignedExtractionRows.length}, Tinting = ${alignedTintingRows.length}`);

      // 4. Export to Excel (local download)
      exportStyledDailyXlsx(
        extractionHeaders,
        alignedExtractionRows,
        tintingHeaders,
        alignedTintingRows,
        `Production-Batch-${dailyQueue.day_key}-Batch${nextBatchNumber}.xlsx`
      );

      // 5. Sync to Google Sheets
      const exportId = generateExportId();
      const payload = prepareGoogleSheetsPayload(
        exportId,
        extractionHeaders,
        alignedExtractionRows,
        tintingHeaders,
        alignedTintingRows
      );

      setToastInfo({ message: 'Syncing to Google Sheets...', type: 'success' });
      console.log(`[Export] Sending payload to Apps Script: ${WEB_APP_URL}`);

      const response = await fetch(WEB_APP_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: JSON.stringify(payload),
      });

      console.log(`[Export] Apps Script response status: ${response.status}`);

      if (!response.ok) {
        throw new Error(`Google Apps Script returned ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[Export] Apps Script result:', result);

      if (result.duplicate) {
        setToastInfo({ message: 'Already backed up — duplicate prevented.', type: 'success' });
        setIsQueueExported(true);
      } else if (result.ok) {
        setToastInfo({ message: `Export complete! Batch #${nextBatchNumber}`, type: 'success' });
        setIsQueueExported(true);
        console.log("Export complete");
      } else {
        throw new Error(result.message || 'The backup script reported an error but returned no message.');
      }

    } catch (error) {
      console.error('Export failed:', error);
      let detailedMessage = 'An unknown error occurred.';

      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        detailedMessage = `Network Error (Failed to fetch). This usually means the Google Apps Script URL is incorrect, the script is not deployed as "Web App", or access is restricted. \n\nTarget URL: ${WEB_APP_URL}`;
      } else if (error instanceof Error) {
        detailedMessage = error.message;
      }

      setToastInfo({ message: `Export failed: ${detailedMessage}`, type: 'error' });
    }
  }, [dailyQueue]);

  const handleClearSheetBatch = useCallback(async () => {
    if (!window.confirm("CRITICAL: This will remove the LAST batch from the live Google Sheet. Use only if you made a mistake. Continue?")) {
      return;
    }

    try {
      setIsLoading(true);
      setToastInfo({ message: 'Requesting sheet rollback...', type: 'success' });
      const result = await triggerSheetAction('clear_current_batch');

      if (result.ok) {
        setToastInfo({ message: 'Rollback successful. Last batch removed from Google Sheet.', type: 'success' });
        setIsQueueExported(false); // Enable re-export
      } else {
        throw new Error(result.message || 'Rollback failed.');
      }
    } catch (error) {
      console.error('Rollback failed:', error);
      setToastInfo({ message: `Rollback failed: ${error instanceof Error ? error.message : 'Unknown error'}`, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, []);


  const handleClearQueue = useCallback(async () => {
    setDailyQueue(currentQueue => ({
      ...currentQueue,
      items: [],
    }));
    setIsQueueExported(false); // Data changed, re-enable export
    await clearSession();
    setToastInfo({ message: 'Cleared.', type: 'success' });
  }, []);

  const tintingItems = filterTintingItems(dailyQueue.items);

  const handleExportTintingCsv = useCallback(() => {
    const exportRows = tintingListToExportRows(tintingItems);
    exportToCsv(exportRows, `Tinting-List-${dailyQueue.day_key}.csv`);
  }, [tintingItems, dailyQueue.day_key]);

  const handleExportTintingXlsx = useCallback(() => {
    const exportRows = tintingListToExportRows(tintingItems);
    const sheets: ExcelSheet[] = [{
      sheetName: 'Tinting List',
      rows: exportRows,
    }];
    exportToXlsx(sheets, `Tinting-List-${dailyQueue.day_key}.xlsx`);
  }, [tintingItems, dailyQueue.day_key]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="h-2 bg-amber-400 mb-8"></div>
        <header className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
            Production Order Extractor
          </h1>
          <p className="mt-2 text-lg text-slate-600">
            Upload a PO PDF or paste text to extract production-ready data.
          </p>
        </header>

        <div className="mb-8 border-b border-slate-300">
          <nav className="-mb-px flex space-x-6" aria-label="Tabs">
            <button
              onClick={() => setActiveView('extraction')}
              className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors ${activeView === 'extraction'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-400'
                }`}
            >
              Extraction Results
            </button>
            <button
              onClick={() => setActiveView('tinting')}
              className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors ${activeView === 'tinting'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-400'
                }`}
            >
              Tinting List
              <span className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full ${activeView === 'tinting' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-600'
                }`}>
                {tintingItems.length}
              </span>
            </button>
          </nav>
        </div>

        {toastInfo && (
          <Toast
            message={toastInfo.message}
            type={toastInfo.type}
            onClose={() => setToastInfo(null)}
          />
        )}

        {activeView === 'extraction' && (
          <main className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            <div className="lg:col-span-2 bg-white rounded-xl shadow-lg p-6 sm:p-8 border border-slate-200">

              <div className="flex justify-center mb-6">
                <div className="inline-flex rounded-lg shadow-sm bg-slate-100 p-1 border border-slate-300">
                  <button
                    onClick={() => setIntakeMode('pdf')}
                    className={`px-6 py-2 text-sm font-semibold rounded-md transition-colors ${intakeMode === 'pdf' ? 'bg-amber-600 text-white shadow' : 'text-slate-600 hover:bg-slate-200'}`}
                  >
                    Upload PDF
                  </button>
                  <button
                    onClick={() => setIntakeMode('text')}
                    className={`px-6 py-2 text-sm font-semibold rounded-md transition-colors ${intakeMode === 'text' ? 'bg-amber-600 text-white shadow' : 'text-slate-600 hover:bg-slate-200'}`}
                  >
                    Paste Text
                  </button>
                </div>
              </div>

              {intakeMode === 'pdf' ? (
                <FileUpload onFileSelect={handleFileSelect} isLoading={isLoading} />
              ) : (
                <PasteTextInput onExtract={handleTextExtract} isLoading={isLoading} />
              )}

              {fileName && !isLoading && !error && !extractedData && (
                <div className="mt-6 text-center text-slate-500">
                  <p>Ready to process: <span className="font-semibold">{fileName}</span></p>
                </div>
              )}

              {isLoading && (
                <div className="mt-8 flex flex-col items-center justify-center text-slate-600">
                  <LoadingSpinner />
                  <p className="mt-4 text-lg font-medium">Analyzing document...</p>
                  <p className="text-sm">{fileName}</p>
                </div>
              )}

              {pendingDuplicate && (
                <div className="mt-8 p-4 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg" role="alert">
                  <div className="flex items-start space-x-3">
                    <ExclamationTriangleIcon className="h-6 w-6 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-semibold">Duplicate Detected</h3>
                      <p className="text-sm mb-4">This order appears to already be in today’s queue based on customer, order number, and date.</p>
                      <div className="flex items-center gap-3">
                        <button onClick={handleAddAnyway} className="px-4 py-1.5 text-sm font-semibold text-white bg-amber-600 rounded-md hover:bg-amber-700">Add Anyway</button>
                        <button onClick={handleCancelDuplicate} className="px-4 py-1.5 text-sm font-semibold text-slate-700 bg-slate-200 rounded-md hover:bg-slate-300">Cancel</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-8 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg flex items-start space-x-3">
                  <ExclamationTriangleIcon className="h-6 w-6 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold">Extraction Error</h3>
                    <p className="text-sm">{error}</p>
                  </div>
                </div>
              )}

              {extractedData && !isLoading && !pendingDuplicate && (
                <div className="mt-8 animate-fade-in">
                  <div className="flex items-center justify-between gap-3 mb-4 pb-4 border-b border-amber-300">
                    <div className="flex items-center gap-3">
                      <DocumentIcon className="h-8 w-8 text-indigo-600" />
                      <div>
                        <h2 className="text-xl font-bold text-slate-800">Last Extraction Result</h2>
                        <p className="text-sm text-slate-500">{fileName}</p>
                      </div>
                    </div>
                    {extractionSource && (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${extractionSource === 'PDF' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                        }`}>
                        Source: {extractionSource}
                      </span>
                    )}
                  </div>
                  <ResultsDisplay
                    data={extractedData}
                    onExportThisCsv={handleExportThisPoCsv}
                    onExportThisXlsx={handleExportThisPoXlsx}
                  />
                </div>
              )}
            </div>

            <div className="lg:col-span-1">
              <DailyQueuePanel
                queueItems={dailyQueue.items}
                onExportCsv={handleExportCsv}
                onExportXlsx={handleExportXlsx}
                onClearQueue={handleClearQueue}
                onClearSheetBatch={handleClearSheetBatch}
                onRemoveItem={handleRemoveQueueItem}
                onOpenItem={handleOpenQueueItem}
                isQueueExported={isQueueExported}
              />
            </div>
          </main>
        )}

        {activeView === 'tinting' && (
          <main>
            <TintingList
              items={tintingItems}
              onExportCsv={handleExportTintingCsv}
              onExportXlsx={handleExportTintingXlsx}
            />
          </main>
        )}

      </div>
    </div>
  );
};

export default App;