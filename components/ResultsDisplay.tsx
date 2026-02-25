import React from 'react';
import type { ProductionOrder } from '../types';
import OrderInfo from './HeaderInfo';
import ProductionRowsTable from './LineItemsTable';
import { productionOrderToExportRows } from '../utils';

interface ResultsDisplayProps {
  data: ProductionOrder;
  onExportThisCsv: () => void;
  onExportThisXlsx: () => void;
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ data, onExportThisCsv, onExportThisXlsx }) => {
  const rowsAsExportFormat = productionOrderToExportRows(data, "Current Extraction");

  return (
    <div className="space-y-8">
      <div>
        <div className="flex justify-between items-center border-b border-amber-300 pb-2 mb-4">
          <h3 className="text-lg font-semibold text-slate-800">
            Order Information
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={onExportThisCsv}
              className="px-3 py-1 text-xs font-semibold text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors"
            >
              Export CSV
            </button>
            <button
              onClick={onExportThisXlsx}
              className="px-3 py-1 text-xs font-semibold text-green-800 bg-green-100 rounded-md hover:bg-green-200 transition-colors"
            >
              Export Excel
            </button>
          </div>
        </div>
        <OrderInfo order={data.order} />
      </div>

      <div>
        <h3 className="text-lg font-semibold text-slate-800 border-b border-amber-300 pb-2 mb-4">
          Production Order Rows
        </h3>
        {data.rows.length > 0 ? (
          <ProductionRowsTable items={rowsAsExportFormat} />
        ) : (
          <p className="text-slate-500 text-center py-4">No production rows were extracted.</p>
        )}
      </div>
    </div>
  );
};

export default ResultsDisplay;