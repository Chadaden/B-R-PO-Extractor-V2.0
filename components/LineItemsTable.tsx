import React from 'react';
import type { Row } from '../types';

interface ProductionRowsTableProps {
  items: Row[];
}

const ProductionRowsTable: React.FC<ProductionRowsTableProps> = ({ items }) => {
  const headers = [
    'Product Description', 'Quantity', 'Tinting'
  ];

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {headers.map((header, index) => (
              <th key={header} scope="col" className={`px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider ${index > 0 ? 'text-right' : ''}`}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-slate-200">
          {items.map(item => (
            <tr key={item.id} className="hover:bg-slate-50 transition-colors">
              <td className="px-4 py-3 whitespace-normal text-slate-800 max-w-md break-words">
                <p className="font-medium">{item.product_description_production || '-'}</p>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-700 text-right">{item.quantity || '-'}</td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-700 text-right font-mono">{item.tinting || 'N'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ProductionRowsTable;
