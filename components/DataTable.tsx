
import React from 'react';
import { SalesRecord } from '../types';

interface DataTableProps {
  data: SalesRecord[];
  onSelectOrderId: (id: string) => void;
  selectedModule?: 'plastic' | 'material' | null;
}

const DataTable: React.FC<DataTableProps> = ({ data, onSelectOrderId, selectedModule }) => {
  const isMaterial = selectedModule === 'material';

  const headers = isMaterial
    ? ['出库单号', '销售订单号', '月份', '日期', '客户', '地区', '销售员', '仓库', '物料名称', '物料代码', '数量', '单位', '单价', '价税合计']
    : ['出库单号', '月份', '日期', '客户', '地区', '销售员', '品类', '物料名称', '数量', '单价', '价税合计'];

  return (
    <div className="overflow-x-auto bg-white rounded-xl shadow-sm border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-slate-200">
          {data.slice(0, 100).map((record, idx) => (
            <tr key={`${record.id}-${idx}`} className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">
                <button 
                  onClick={() => onSelectOrderId(record.id)}
                  className="text-blue-600 font-semibold hover:underline decoration-blue-300 transition-all"
                >
                  {record.id}
                </button>
              </td>
              {isMaterial && (
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-mono">
                  {record.salesOrderNo || '-'}
                </td>
              )}
              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{record.month}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{record.date}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900">
                {record.customer}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{record.region || '-'}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{record.salesperson}</td>
              {isMaterial && (
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                  <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md text-xs font-bold">
                    {record.warehouse || '-'}
                  </span>
                </td>
              )}
              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                <span className="px-2 py-1 bg-slate-100 rounded-md text-slate-700 text-xs">{record.category}</span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 truncate max-w-[200px]">{record.itemName}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-slate-600 font-mono">{record.quantity}</td>
              {isMaterial && (
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-medium">
                  {record.pricingUnit || '-'}
                </td>
              )}
              <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-slate-600 font-mono">{record.unitPrice.toLocaleString()} CFA</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-slate-900 font-mono">{record.totalAmount.toLocaleString()} CFA</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > 100 && (
        <div className="px-6 py-4 text-center text-sm text-slate-500 italic bg-slate-50 border-t border-slate-100">
          显示前 100 条记录（共 {data.length} 条）
        </div>
      )}
    </div>
  );
};

export default DataTable;
