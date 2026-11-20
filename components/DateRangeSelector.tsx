
import React from 'react';

interface DateRangeSelectorProps {
  dateRange: [string, string];
  onChange: (range: [string, string]) => void;
}

const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({ dateRange, onChange }) => {
  const [start, end] = dateRange;

  const setPreset = (type: string) => {
    const now = new Date();
    let s = '';
    let e = '';

    const formatDate = (date: Date) => date.toISOString().split('T')[0];

    switch (type) {
      case 'thisMonth':
        s = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
        e = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
        break;
      case 'lastMonth':
        s = formatDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        e = formatDate(new Date(now.getFullYear(), now.getMonth(), 0));
        break;
      case 'thisYear':
        s = formatDate(new Date(now.getFullYear(), 0, 1));
        e = formatDate(new Date(now.getFullYear(), 11, 31));
        break;
      case 'last6Months':
        s = formatDate(new Date(now.getFullYear(), now.getMonth() - 6, 1));
        e = formatDate(new Date());
        break;
      default:
        s = '';
        e = '';
    }
    onChange([s, e]);
  };

  const isPresetActive = (type: string) => {
    const now = new Date();
    const formatDate = (date: Date) => date.toISOString().split('T')[0];
    let expectedS = '';
    let expectedE = '';

    if (type === 'thisMonth') {
      expectedS = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
      expectedE = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    } else if (type === 'thisYear') {
      expectedS = formatDate(new Date(now.getFullYear(), 0, 1));
      expectedE = formatDate(new Date(now.getFullYear(), 11, 31));
    }
    return start === expectedS && end === expectedE;
  };

  return (
    <div className="space-y-3">
      <label className="block text-xs font-black text-slate-500 uppercase tracking-wider">业务日期范围</label>
      
      {/* 快捷按钮组 */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'thisMonth', label: '本月' },
          { id: 'lastMonth', label: '上月' },
          { id: 'last6Months', label: '半年内' },
          { id: 'thisYear', label: '今年' },
        ].map((btn) => (
          <button
            key={btn.id}
            onClick={() => setPreset(btn.id)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all border ${
              isPresetActive(btn.id) 
              ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' 
              : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600'
            }`}
          >
            {btn.label}
          </button>
        ))}
        { (start || end) && (
          <button 
            onClick={() => setPreset('reset')}
            className="px-3 py-1.5 rounded-lg text-[10px] font-black border border-red-100 text-red-500 hover:bg-red-50"
          >
            重置
          </button>
        )}
      </div>

      {/* 增强型输入区域 */}
      <div className="flex items-center gap-2 bg-white border-2 border-slate-200 rounded-xl p-1.5 focus-within:border-indigo-500 transition-all shadow-sm">
        <div className="flex-1 flex items-center px-2 py-1 bg-slate-50 rounded-lg group">
          <span className="text-slate-400 mr-2 text-xs">📅</span>
          <input 
            type="date" 
            value={start} 
            onChange={(e) => onChange([e.target.value, end])}
            className="bg-transparent text-xs font-bold text-slate-700 outline-none w-full cursor-pointer"
          />
        </div>
        <span className="text-slate-300 font-bold text-xs">至</span>
        <div className="flex-1 flex items-center px-2 py-1 bg-slate-50 rounded-lg group">
          <span className="text-slate-400 mr-2 text-xs">📅</span>
          <input 
            type="date" 
            value={end} 
            onChange={(e) => onChange([start, e.target.value])}
            className="bg-transparent text-xs font-bold text-slate-700 outline-none w-full cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};

export default DateRangeSelector;
