
import React from 'react';
import type { DailyQueueItem } from '../types';

interface DailyQueuePanelProps {
  queueItems: DailyQueueItem[];
  onExportCsv: () => void;
  onExportXlsx: () => void;
  onClearQueue: () => void;
  onClearSheetBatch: () => void;
  onRemoveItem: (orderId: string) => void;
  onOpenItem: (orderId: string) => void;
  isQueueExported: boolean;
}

const DailyQueuePanel: React.FC<DailyQueuePanelProps> = ({
  queueItems, onExportCsv, onExportXlsx, onClearQueue, onClearSheetBatch, onRemoveItem, onOpenItem, isQueueExported
}) => {
  const totalOrders = queueItems.length;
  const totalLines = queueItems.reduce((acc, item) => acc + item.items.length, 0);

  return (
    <aside className="bg-white rounded-xl shadow-lg p-6 sm:p-8 border border-slate-200 h-fit sticky top-8">
      <h2 className="text-xl font-bold text-slate-800 mb-4 pb-4 border-b border-amber-300">
        Daily Queue
      </h2>

      <div className="grid grid-cols-2 gap-4 mb-6 text-center">
        <div>
          <div className="text-3xl font-bold text-indigo-600">{totalOrders}</div>
          <div className="text-sm text-slate-500">Orders today</div>
        </div>
        <div>
          <div className="text-3xl font-bold text-indigo-600">{totalLines}</div>
          <div className="text-sm text-slate-500">Lines today</div>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        <button
          onClick={onExportCsv}
          disabled={totalOrders === 0}
          className="w-full px-4 py-2 bg-slate-600 text-white font-semibold rounded-lg shadow-md hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all"
        >
          Export Daily CSV
        </button>
        <button
          onClick={onExportXlsx}
          disabled={totalOrders === 0 || isQueueExported}
          className="w-full px-4 py-2 bg-green-700 text-white font-semibold rounded-lg shadow-md hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all"
        >
          {isQueueExported ? 'Exported ✓' : 'Export Daily Excel'}
        </button>

        {isQueueExported && (
          <button
            onClick={onClearSheetBatch}
            className="w-full px-4 py-2 bg-amber-100 text-amber-700 border border-amber-300 font-semibold rounded-lg shadow-sm hover:bg-amber-200 transition-all flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
            </svg>
            Undo Sheet Upload
          </button>
        )}

        <button
          onClick={() => {
            if (window.confirm("This will clear the entire queue for today. Continue?")) {
              onClearQueue();
            }
          }}
          disabled={totalOrders === 0}
          className="w-full px-4 py-2 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all"
        >
          Clear the Day
        </button>
      </div>

      <h3 className="text-md font-semibold text-slate-700 mb-2">Queued Orders</h3>
      <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
        {queueItems.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-4 border border-dashed rounded-lg">
            Queue is empty.
          </div>
        ) : (
          [...queueItems].reverse().map(item => (
            <div key={item.order_id} className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs">
              <div className="flex justify-between items-center">
                <div className="space-y-0.5 flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 truncate" title={item.customer_name}>{item.customer_name}</p>
                  <p className="text-slate-600 truncate">PO: {item.order_number || 'N/A'} &bull; {item.items.length} lines</p>
                  <p className="text-slate-500 text-[10px]">{item.order_date}</p>
                </div>
                <div className="flex items-center space-x-2 ml-2 flex-shrink-0">
                  <button
                    onClick={() => onOpenItem(item.order_id)}
                    className="px-2 py-0.5 text-indigo-600 hover:bg-indigo-100 rounded-md font-semibold text-xs transition-colors"
                    aria-label={`Open order ${item.order_id}`}
                  >
                    Open
                  </button>
                  <button
                    onClick={() => onRemoveItem(item.order_id)}
                    className="px-2 py-0.5 text-red-600 hover:bg-red-100 rounded-md font-semibold text-xs transition-colors"
                    aria-label={`Remove order ${item.order_id}`}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
};

export default DailyQueuePanel;
