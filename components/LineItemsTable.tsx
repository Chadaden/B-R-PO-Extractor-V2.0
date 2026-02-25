import React from 'react';
import type { ExportRow } from '../types';

interface ProductionRowsTableProps {
  items: ExportRow[];
}

const ProductionRowsTable: React.FC<ProductionRowsTableProps> = ({ items }) => {
  const headers = [
    'BATCH NUMBER', 'DATE CREATED', 'ORDER_DATE', 'CUSTOMER_NAME', 'ORDER_NUMBER', 'PRODUCT_DESCRIPTION', 'QUANTITY', 'INVOICE_QUANTITY', 'TINTING', 'COMMENTS', 'PICKER_NAME'
  ];

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-xs">
        <thead className="bg-slate-50">
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col" className="px-3 py-3 text-left font-semibold text-slate-600 uppercase tracking-wider">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-slate-200">
          {items.map((item, idx) => (
            <tr key={idx} className="hover:bg-slate-50 transition-colors">
              <td className="px-3 py-3 whitespace-nowrap text-slate-600">{item.batch_number || '-'}</td>
              <td className="px-3 py-3 whitespace-nowrap text-slate-500">{item.date_created || '-'}</td>
              <td className="px-3 py-3 whitespace-nowrap text-slate-600">{item.order_date || '-'}</td>
              <td className="px-3 py-3 whitespace-nowrap text-slate-800 font-medium">{item.customer_name || '-'}</td>
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
  );
};

export default ProductionRowsTable;
