import React from 'react';
import type { TintingListItem } from '../types';
import { InformationCircleIcon } from './Icons';

interface TintingListProps {
  items: TintingListItem[];
  onExportCsv: () => void;
  onExportXlsx: () => void;
}

const TintingList: React.FC<TintingListProps> = ({ items, onExportCsv, onExportXlsx }) => {
  const headers = [
    'BATCH NUMBER', 'DATE CREATED', 'ORDER_DATE', 'CUSTOMER_NAME', 'ORDER_NUMBER', 'PRODUCT_DESCRIPTION', 'QUANTITY', 'INVOICE_QUANTITY', 'TINTING', 'COMMENTS', 'PICKER_NAME'
  ];

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8 border border-slate-200 text-center">
        <div className="flex flex-col items-center">
          <InformationCircleIcon className="h-10 w-10 text-slate-400 mb-3" />
          <h3 className="text-lg font-semibold text-slate-800">No Tinting Items</h3>
          <p className="text-slate-600 mt-1">There are no items in the daily queue that require tinting based on the current rules.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 border border-slate-200">
      <div className="flex justify-between items-center mb-4 pb-4 border-b border-amber-300">
        <h2 className="text-xl font-bold text-slate-800">
          Tinting Required
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onExportCsv}
            disabled={items.length === 0}
            className="px-3 py-1 text-xs font-semibold text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export Tinting CSV
          </button>
          <button
            onClick={onExportXlsx}
            disabled={items.length === 0}
            className="px-3 py-1 text-xs font-semibold text-green-800 bg-green-100 rounded-md hover:bg-green-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export Tinting Excel
          </button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-xs">
          <thead className="bg-slate-50">
            <tr>
              {headers.map((header, index) => (
                <th key={header} scope="col" className="px-3 py-3 text-left font-semibold text-slate-600 uppercase tracking-wider">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {items.map(item => (
              <tr key={item.line_id} className="hover:bg-slate-50 transition-colors">
                <td className="px-3 py-3 whitespace-nowrap text-slate-600">{item.batch_number || '-'}</td>
                <td className="px-3 py-3 whitespace-nowrap text-slate-500">{item.date_created || '-'}</td>
                <td className="px-3 py-3 whitespace-nowrap text-slate-600">{item.order_date || '-'}</td>
                <td className="px-3 py-3 whitespace-nowrap text-slate-800 font-medium" title={item.customer_name}>{item.customer_name || '-'}</td>
                <td className="px-3 py-3 whitespace-nowrap text-slate-600">{item.order_number || '-'}</td>
                <td className="px-3 py-3 whitespace-normal text-slate-800 max-w-xs break-words">
                  <p className="font-medium">{item.product_description || '-'}</p>
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-slate-700 font-semibold">{item.quantity || '-'}</td>
                <td className="px-3 py-3 whitespace-nowrap text-slate-700">{item.invoice_quantity || ''}</td>
                <td className="px-3 py-3 whitespace-nowrap text-slate-700 font-mono">{item.tinting || 'N'}</td>
                <td className="px-3 py-3 whitespace-nowrap text-slate-500">{item.comments || ''}</td>
                <td className="px-3 py-3 whitespace-nowrap text-slate-500">{item.picker_name || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TintingList;