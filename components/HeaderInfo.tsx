
import React from 'react';
import type { Order } from '../types';

interface OrderInfoProps {
  order: Order;
}

const DataField: React.FC<{ label: string; value: string; }> = ({ label, value }) => {
  if (!value) return null;

  return (
    <div className="col-span-1">
      <dt className="text-sm font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900 break-words">{value}</dd>
    </div>
  );
};


const OrderInfo: React.FC<OrderInfoProps> = ({ order }) => {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-6">
      <DataField label="Order Date" value={order.order_date} />
      <DataField label="Customer Name" value={order.customer_name} />
      <DataField label="Order Number" value={order.order_number} />
    </dl>
  );
};

export default OrderInfo;
