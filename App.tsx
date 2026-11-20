
import React, { useState, useMemo, useEffect } from 'react';
import { FilterState, SalesSummary, SalesRecord } from './types';
import Dashboard from './components/Dashboard';
import DataTable from './components/DataTable';
import MultiSelect from './components/MultiSelect';
import OrderDetailModal from './components/OrderDetailModal';
import { fetchSalesData } from './services/dataService';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Building2, 
  Layers, 
  LayoutDashboard, 
  Database, 
  Settings, 
  X, 
  ArrowRight, 
  HelpCircle, 
  ArrowLeftRight, 
  Compass, 
  FileSpreadsheet, 
  Check, 
  AlertCircle,
  Boxes
} from 'lucide-react';

const parseGoogleSheetUrl = (url: string) => {
  const defaultRes = { sheetId: '', gid: '0' };
  if (!url) return defaultRes;
  const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) return defaultRes;
  const sheetId = idMatch[1];
  const gidMatch = url.match(/gid=([0-9]+)/);
  const gid = gidMatch ? gidMatch[1] : '0';
  return { sheetId, gid };
};

const App: React.FC = () => {
  const [selectedModule, setSelectedModule] = useState<'plastic' | 'material' | null>(() => {
    const saved = localStorage.getItem('ttp_selected_module');
    return (saved === 'plastic' || saved === 'material') ? (saved as 'plastic' | 'material') : null;
  });

  const [plasticConfig, setPlasticConfig] = useState({
    sheetId: localStorage.getItem('ttp_plastic_sheet_id') || '190CYOeWCVB68eCOszi7VwADf3N3jHwN7msmI1jmgzlg',
    gid: localStorage.getItem('ttp_plastic_gid') || '1447308255'
  });

  const [materialConfig, setMaterialConfig] = useState({
    sheetId: localStorage.getItem('ttp_material_sheet_id') || '1ezaGsUiLOlFlQgHA7U8MxUpHJPeYQm046ZfbhqQuCYM',
    gid: localStorage.getItem('ttp_material_gid') || '0'
  });

  const [tempInputUrl, setTempInputUrl] = useState('');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [isConfiguringInitially, setIsConfiguringInitially] = useState(false);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'table'>('dashboard');
  const [cloudData, setCloudData] = useState<SalesRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const isMaterial = selectedModule === 'material';

  const theme = useMemo(() => {
    const isPlastic = selectedModule === 'plastic';
    return {
      primaryColor: isPlastic ? 'indigo' : 'emerald',
      bg: isPlastic ? 'bg-indigo-600' : 'bg-emerald-600',
      hoverBg: isPlastic ? 'hover:bg-indigo-700' : 'hover:bg-emerald-700',
      text: isPlastic ? 'text-indigo-600' : 'text-emerald-600',
      textHover: isPlastic ? 'hover:text-indigo-600' : 'hover:text-emerald-600',
      border: isPlastic ? 'border-indigo-600' : 'border-emerald-600',
      borderLight: isPlastic ? 'border-slate-200' : 'border-slate-200',
      ring: isPlastic ? 'focus-within:ring-indigo-50 focus-within:border-indigo-600' : 'focus-within:ring-emerald-50 focus-within:border-emerald-600',
      shadow: isPlastic ? 'shadow-indigo-100' : 'shadow-emerald-100',
      bgLight: isPlastic ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600',
      loader: isPlastic ? 'border-t-indigo-600' : 'border-t-emerald-600',
      activeTab: isPlastic ? 'bg-white shadow-sm text-indigo-600' : 'bg-white shadow-sm text-emerald-600',
      accentLabel: isPlastic ? 'bg-indigo-600' : 'bg-emerald-600'
    };
  }, [selectedModule]);

  const [filters, setFilters] = useState<FilterState>({
    months: [],
    dateRange: ['', ''],
    customers: [],
    salespeople: [],
    categories: [],
    itemNames: [],
    regions: [],
    warehouses: []
  });

  const loadCloudData = async () => {
    if (!selectedModule) return;
    
    const config = selectedModule === 'plastic' ? plasticConfig : materialConfig;
    
    // 如果是建材快消模块，且尚未配置 Google 表格
    if (selectedModule === 'material' && !config.sheetId) {
      setCloudData([]);
      setIsConfiguringInitially(true);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setIsConfiguringInitially(false);
      const data = await fetchSalesData(config.sheetId, config.gid);
      setCloudData(data);
      initializeFilters();
    } catch (err) {
      const message = err instanceof Error ? err.message : '连接数据源失败';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConfig = (url: string) => {
    const { sheetId, gid } = parseGoogleSheetUrl(url);
    if (!sheetId) {
      alert('您输入的链接似乎不是合法的谷歌表格地址。它应该包含类似于 "/d/..." 的电子表格 ID。');
      return false;
    }

    if (selectedModule === 'plastic') {
      setPlasticConfig({ sheetId, gid });
      localStorage.setItem('ttp_plastic_sheet_id', sheetId);
      localStorage.setItem('ttp_plastic_gid', gid);
    } else {
      setMaterialConfig({ sheetId, gid });
      localStorage.setItem('ttp_material_sheet_id', sheetId);
      localStorage.setItem('ttp_material_gid', gid);
    }
    
    setShowConfigModal(false);
    setIsConfiguringInitially(false);
    setTempInputUrl('');
    return true;
  };

  const handleSelectModule = (mod: 'plastic' | 'material') => {
    setSelectedModule(mod);
    localStorage.setItem('ttp_selected_module', mod);
    
    // 如果是建材模块，且没有配置，直接打开配置框
    if (mod === 'material' && !materialConfig.sheetId) {
      setIsConfiguringInitially(true);
    }
  };

  const handleSwitchModule = () => {
    setSelectedModule(null);
    localStorage.removeItem('ttp_selected_module');
    setCloudData([]);
  };

  const initializeFilters = () => {
    setFilters({
      months: [],
      dateRange: ['', ''],
      customers: [],
      salespeople: [],
      categories: [],
      itemNames: [],
      regions: [],
      warehouses: []
    });
  };

  useEffect(() => {
    if (selectedModule) {
      loadCloudData();
    }
  }, [selectedModule, plasticConfig, materialConfig]);

  const getCascadingDimensionData = (dimension: keyof SalesRecord) => {
    const filteredByOthers = cloudData.filter(item => {
      const matchMonth = dimension === 'month' || filters.months.length === 0 || filters.months.includes(item.month);
      const matchSalesperson = dimension === 'salesperson' || filters.salespeople.length === 0 || filters.salespeople.includes(item.salesperson);
      const matchCategory = dimension === 'category' || filters.categories.length === 0 || filters.categories.includes(item.category);
      const matchCustomer = dimension === 'customer' || filters.customers.length === 0 || filters.customers.includes(item.customer);
      const matchItemName = dimension === 'itemName' || filters.itemNames.length === 0 || filters.itemNames.includes(item.itemName);
      const matchRegion = dimension === 'region' || filters.regions.length === 0 || (item.region && filters.regions.includes(item.region));
      const matchWarehouse = dimension === 'warehouse' || filters.warehouses.length === 0 || (item.warehouse && filters.warehouses.includes(item.warehouse));
      const matchDate = (
        (!filters.dateRange[0] || item.date >= filters.dateRange[0]) &&
        (!filters.dateRange[1] || item.date <= filters.dateRange[1])
      );
      return matchMonth && matchSalesperson && matchCategory && matchCustomer && matchItemName && matchRegion && matchWarehouse && matchDate;
    });

    const counts: Record<string, number> = {};
    filteredByOthers.forEach(item => {
      const val = String(item[dimension] || '').trim();
      if (val) counts[val] = (counts[val] || 0) + 1;
    });

    const options = Array.from(new Set(filteredByOthers.map(d => String(d[dimension] || '')).map(s => s.trim()).filter(Boolean))).sort();
    if (dimension === 'month') options.reverse();
    
    return { options, counts };
  };

  const dynamicFilterData = useMemo(() => ({
    months: getCascadingDimensionData('month'),
    customers: getCascadingDimensionData('customer'),
    salespeople: getCascadingDimensionData('salesperson'),
    categories: getCascadingDimensionData('category'),
    itemNames: getCascadingDimensionData('itemName'),
    regions: getCascadingDimensionData('region'),
    warehouses: getCascadingDimensionData('warehouse')
  }), [cloudData, filters]);

  const filteredData = useMemo(() => {
    return cloudData.filter(item => {
      const matchMonth = filters.months.length === 0 || filters.months.includes(item.month);
      const matchSalesperson = filters.salespeople.length === 0 || filters.salespeople.includes(item.salesperson);
      const matchCategory = filters.categories.length === 0 || filters.categories.includes(item.category);
      const matchCustomer = filters.customers.length === 0 || filters.customers.includes(item.customer);
      const matchItemName = filters.itemNames.length === 0 || filters.itemNames.includes(item.itemName);
      const matchRegion = filters.regions.length === 0 || (item.region && filters.regions.includes(item.region));
      const matchWarehouse = filters.warehouses.length === 0 || (item.warehouse && filters.warehouses.includes(item.warehouse));
      const matchDate = (!filters.dateRange[0] || item.date >= filters.dateRange[0]) &&
                        (!filters.dateRange[1] || item.date <= filters.dateRange[1]);
      return matchMonth && matchSalesperson && matchCategory && matchCustomer && matchItemName && matchRegion && matchWarehouse && matchDate;
    });
  }, [cloudData, filters]);

  const summary: SalesSummary = useMemo(() => {
    const totalSales = filteredData.reduce((acc, cur) => acc + cur.totalAmount, 0);
    const totalQuantity = filteredData.reduce((acc, cur) => acc + cur.quantity, 0);
    const uniqueOrderIds = Array.from(new Set(filteredData.map(d => d.id))).sort();
    
    // 销售订单号列表 (建材快消)
    const uniqueSalesOrderIds = Array.from(
      new Set(
        filteredData
          .map(d => d.salesOrderNo?.trim())
          .filter((v): v is string => Boolean(v))
      )
    ).sort();

    const monthlyMap = new Map<string, { sales: number; quantity: number }>();
    filteredData.forEach(d => {
      const existing = monthlyMap.get(d.month) || { sales: 0, quantity: 0 };
      monthlyMap.set(d.month, {
        sales: existing.sales + d.totalAmount,
        quantity: existing.quantity + d.quantity
      });
    });
    const monthlyTrend = Array.from(monthlyMap.entries()).map(([name, val]) => ({ name, ...val })).sort((a, b) => a.name.localeCompare(b.name));

    const catMap = new Map<string, number>();
    const catQtyMap = new Map<string, number>();
    filteredData.forEach(d => {
      catMap.set(d.category, (catMap.get(d.category) || 0) + d.totalAmount);
      catQtyMap.set(d.category, (catQtyMap.get(d.category) || 0) + d.quantity);
    });
    
    return { 
      totalSales, 
      totalQuantity, 
      orderCount: uniqueOrderIds.length, 
      orderIds: uniqueOrderIds, 
      salesOrderCount: uniqueSalesOrderIds.length,
      salesOrderIds: uniqueSalesOrderIds,
      categoryDistribution: Array.from(catMap.entries()).map(([name, value]) => ({ name, value })),
      categoryQuantityDistribution: Array.from(catQtyMap.entries()).map(([name, value]) => ({ name, value })),
      monthlyTrend 
    };
  }, [filteredData]);

  if (!selectedModule) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-2 mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">销售数据分析系统</h1>
          <p className="text-slate-400 text-xs font-semibold">请选择需要进行分析的独立业务模块</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md w-full">
          {/* Module 1: Plastic */}
          <motion.div 
            whileHover={{ y: -4, scale: 1.01 }}
            transition={{ duration: 0.15 }}
            onClick={() => handleSelectModule('plastic')}
            className="bg-white rounded-2xl border-2 border-slate-100 hover:border-indigo-500 hover:shadow-xl p-6 cursor-pointer group flex flex-col items-center justify-center text-center space-y-4 min-h-[150px] transition-all"
          >
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center transition-colors group-hover:bg-indigo-100">
              <Boxes size={24} className="text-indigo-600" />
            </div>
            <span className="text-base font-black text-slate-800">塑料模块</span>
          </motion.div>

          {/* Module 2: Building Materials FMCG */}
          <motion.div 
            whileHover={{ y: -4, scale: 1.01 }}
            transition={{ duration: 0.15 }}
            onClick={() => handleSelectModule('material')}
            className="bg-white rounded-2xl border-2 border-slate-100 hover:border-emerald-500 hover:shadow-xl p-6 cursor-pointer group flex flex-col items-center justify-center text-center space-y-4 min-h-[150px] transition-all"
          >
            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center transition-colors group-hover:bg-emerald-100">
              <Building2 size={24} className="text-emerald-600" />
            </div>
            <span className="text-base font-black text-slate-800">建材快消模块</span>
          </motion.div>
        </div>
      </div>
    );
  }

  // 建材快消模块初次加载，且无配置时的引导设置界面
  if (isConfiguringInitially) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="max-w-xl w-full bg-white rounded-3xl border-2 border-emerald-100 hover:border-emerald-500 shadow-xl p-8 space-y-6 relative transition-all text-left">
          <button 
            onClick={handleSwitchModule} 
            className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
          >
            <X size={20} />
          </button>
          
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2.5 px-3 py-1 bg-emerald-50 text-emerald-700 font-extrabold rounded-full text-xs">
              <Database size={12} /> 待绑定数据源
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">创建建材快消业务面板</h2>
            <p className="text-slate-500 text-xs sm:text-sm font-semibold leading-relaxed">
              请在此处粘入此模块专属的 Google Sheets 表格链接。系统将会提取并实时挂接该表格内所有维度。
            </p>
          </div>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Google 表格共享链接</label>
              <input 
                type="text"
                placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=..."
                value={tempInputUrl}
                onChange={(e) => setTempInputUrl(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-200 focus:border-emerald-500 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 placeholder-slate-400 outline-none transition-all"
              />
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-[11px] sm:text-xs text-slate-500 font-medium space-y-2">
              <span className="font-extrabold text-slate-700 flex items-center gap-1.5">
                <HelpCircle size={14} className="text-emerald-600" /> 获取谷歌链接三步法：
              </span>
              <ol className="list-decimal pl-4.5 space-y-1">
                <li>打开您的 Google 电子表格。</li>
                <li>点击右上角的<span className="font-extrabold text-slate-700">『分享』</span>，在常规访问权限中确保设为<span className="font-extrabold text-emerald-600">『知道链接的任何人可查看』</span>。</li>
                <li>直接复制您的浏览器地址栏 URL 粘贴到上方即可。</li>
              </ol>
            </div>
          </div>

          <div className="flex gap-4 pt-2">
            <button 
              onClick={handleSwitchModule}
              className="flex-1 px-4 py-3 border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 rounded-xl font-bold text-sm transition-all"
            >
              返回中心
            </button>
            <button 
              onClick={() => handleSaveConfig(tempInputUrl)}
              disabled={!tempInputUrl.trim()}
              className="flex-[1.5] px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2"
            >
              配置并加载 <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className={`bg-white p-8 rounded-3xl shadow-xl max-w-md border border-red-100 text-center`}>
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">服务暂时不可用</h2>
          <p className="text-slate-500 text-sm mb-6">{error}</p>
          <div className="space-y-3">
            <button onClick={loadCloudData} className={`w-full ${theme.bg} text-white px-6 py-3 rounded-xl font-bold ${theme.hoverBg} transition-all`}>尝试重新连接</button>
            <button onClick={handleSwitchModule} className="w-full bg-slate-100 text-slate-600 hover:bg-slate-200 px-6 py-3 rounded-xl font-bold transition-all">切换业务面板</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-[1000]">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className={`w-8 h-8 sm:w-10 sm:h-10 ${theme.bg} rounded-lg sm:rounded-xl flex items-center justify-center text-white text-xl sm:text-2xl font-black shadow-lg ${theme.shadow}`}>T</div>
              <div>
                <h1 className="text-xs sm:text-base font-black text-slate-900">销售数据分析系统</h1>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full border border-slate-200">
              <span className={`w-2 h-2 rounded-full ${theme.bg}`}></span>
              <span className="text-[11px] font-black text-slate-700">
                {selectedModule === 'plastic' ? '塑料模块' : '建材快消'}
              </span>
              <button 
                onClick={handleSwitchModule} 
                title="切换业务模块"
                className="ml-2 hover:bg-slate-200 p-0.5 rounded-md text-slate-400 hover:text-slate-600 transition-colors"
              >
                <ArrowLeftRight size={12} />
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <nav className="flex bg-slate-100 p-1 rounded-lg sm:rounded-xl">
              <button onClick={() => setActiveTab('dashboard')} className={`px-3 sm:px-4 py-1 sm:py-1.5 rounded-md sm:rounded-lg text-xs sm:text-sm font-bold transition-all ${activeTab === 'dashboard' ? theme.activeTab : 'text-slate-500 hover:text-slate-900'}`}>分析中心</button>
              <button onClick={() => setActiveTab('table')} className={`px-3 sm:px-4 py-1 sm:py-1.5 rounded-md sm:rounded-lg text-xs sm:text-sm font-bold transition-all ${activeTab === 'table' ? theme.activeTab : 'text-slate-500 hover:text-slate-900'}`}>数据清单</button>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* 筛选中心：不再折叠，且 overflow-visible 确保下拉内容在外部可选 */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 mb-8 overflow-visible relative">
          <div className="p-6 flex items-center justify-between border-b border-slate-100">
            <div className="flex items-center gap-4">
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-[0.2em] flex items-center gap-2">
                <span className={`w-1.5 h-4 rounded-full ${theme.bg}`}></span> 筛选中心
              </h2>
              <div className={`hidden sm:flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${theme.bgLight} px-3 py-1 rounded-full`}>
                当前匹配: {filteredData.length} 行记录
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold">
               <button onClick={initializeFilters} className="text-slate-400 hover:text-red-500 transition-colors uppercase tracking-widest">重置所有条件</button>
            </div>
          </div>
          
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pt-2">
              <MultiSelect 
                label="月份" 
                options={dynamicFilterData.months.options} 
                counts={dynamicFilterData.months.counts} 
                selectedValues={filters.months} 
                onChange={(v) => setFilters({...filters, months: v})} 
                enableYearGrouping={true}
                primaryColor={theme.primaryColor as 'indigo' | 'emerald'}
              />
              <MultiSelect label="客户" options={dynamicFilterData.customers.options} counts={dynamicFilterData.customers.counts} selectedValues={filters.customers} onChange={(v) => setFilters({...filters, customers: v})} primaryColor={theme.primaryColor as 'indigo' | 'emerald'} />
              <MultiSelect label="销售员" options={dynamicFilterData.salespeople.options} counts={dynamicFilterData.salespeople.counts} selectedValues={filters.salespeople} onChange={(v) => setFilters({...filters, salespeople: v})} primaryColor={theme.primaryColor as 'indigo' | 'emerald'} />
              <MultiSelect 
                label={isMaterial ? "物料名称" : "品类"} 
                options={dynamicFilterData.categories.options} 
                counts={dynamicFilterData.categories.counts} 
                selectedValues={filters.categories} 
                onChange={(v) => setFilters({...filters, categories: v})} 
                primaryColor={theme.primaryColor as 'indigo' | 'emerald'} 
              />
              <MultiSelect 
                label={isMaterial ? "物料代码" : "物料名称"} 
                options={dynamicFilterData.itemNames.options} 
                counts={dynamicFilterData.itemNames.counts} 
                selectedValues={filters.itemNames} 
                onChange={(v) => setFilters({...filters, itemNames: v})} 
                primaryColor={theme.primaryColor as 'indigo' | 'emerald'} 
              />
              {(isMaterial || dynamicFilterData.warehouses.options.length > 0) && (
                <MultiSelect 
                  label="仓库" 
                  options={dynamicFilterData.warehouses.options} 
                  counts={dynamicFilterData.warehouses.counts} 
                  selectedValues={filters.warehouses} 
                  onChange={(v) => setFilters({...filters, warehouses: v})} 
                  primaryColor={theme.primaryColor as 'indigo' | 'emerald'} 
                />
              )}
              <MultiSelect label="地区" options={dynamicFilterData.regions.options} counts={dynamicFilterData.regions.counts} selectedValues={filters.regions} onChange={(v) => setFilters({...filters, regions: v})} primaryColor={theme.primaryColor as 'indigo' | 'emerald'} />
              <div className="space-y-1.5">
                <label className="block text-xs font-black text-slate-500 mb-1.5 uppercase tracking-wider">业务日期范围</label>
                <div className={`flex items-center bg-slate-50 border-2 border-slate-200 rounded-xl hover:bg-white hover:border-${theme.primaryColor}-400 transition-all ${theme.ring} h-[42px] relative`}>
                  <div className="flex-1 h-full min-w-0">
                    <input 
                      type="date" 
                      value={filters.dateRange[0]} 
                      onChange={(e) => setFilters({...filters, dateRange: [e.target.value, filters.dateRange[1]]})} 
                      className="w-full h-full bg-transparent px-2 text-base sm:text-xs font-bold text-slate-600 outline-none cursor-pointer" 
                    />
                  </div>
                  <span className="text-slate-300 font-bold flex-shrink-0 px-0.5">-</span>
                  <div className="flex-1 h-full min-w-0">
                    <input 
                      type="date" 
                      value={filters.dateRange[1]} 
                      onChange={(e) => setFilters({...filters, dateRange: [filters.dateRange[0], e.target.value]})} 
                      className="w-full h-full bg-transparent px-2 text-base sm:text-xs font-bold text-slate-600 outline-none cursor-pointer" 
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <div className={`w-12 h-12 border-4 border-slate-200 ${theme.loader} rounded-full animate-spin`}></div>
            <p className="text-slate-400 font-bold tracking-widest uppercase text-xs animate-pulse">正在从云端装载数据...</p>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            {filteredData.length > 0 ? (
              activeTab === 'dashboard' ? (
                <Dashboard summary={summary} filteredData={filteredData} onSelectOrderId={setSelectedOrderId} selectedModule={selectedModule} filters={filters} />
              ) : (
                <DataTable data={filteredData} onSelectOrderId={setSelectedOrderId} selectedModule={selectedModule} />
              )
            ) : (
              <div className="py-32 bg-white rounded-3xl border border-dashed border-slate-200 text-center">
                <div className="text-5xl mb-4">🔎</div>
                <h3 className="text-xl font-bold text-slate-800">未检索到任何数据</h3>
                <p className="text-slate-500 mt-2">级联筛选已经自动排除无业务结果的组合，请重置筛选条件</p>
                <button onClick={initializeFilters} className={`mt-6 px-6 py-2 ${theme.bg} text-white rounded-xl text-sm font-bold shadow-lg ${theme.shadow} ${theme.hoverBg} transition-all`}>重置所有筛选</button>
              </div>
            )}
          </div>
        )}
      </main>

      {selectedOrderId && (
        <OrderDetailModal 
          orderId={selectedOrderId} 
          records={cloudData.filter(d => d.id === selectedOrderId)} 
          allRecords={cloudData}
          onSelectOrderId={(id) => setSelectedOrderId(id)}
          onClose={() => setSelectedOrderId(null)} 
        />
      )}

      {/* Cloud Excel Config Modal */}
      <AnimatePresence>
        {showConfigModal && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfigModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl border-2 border-slate-100 shadow-2xl relative w-full max-w-lg p-7 text-left overflow-hidden z-10"
            >
              <button 
                onClick={() => setShowConfigModal(false)} 
                className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors font-bold"
              >
                <X size={18} />
              </button>

              <div className="flex items-start gap-4 mb-5">
                <div className={`p-3 bg-${theme.primaryColor}-50 rounded-2xl text-${theme.primaryColor}-600 flex-shrink-0`}>
                  <FileSpreadsheet size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-slate-900">
                    配置 {selectedModule === 'plastic' ? '塑料模块' : '建材快消'} 数据源
                  </h3>
                  <p className="text-slate-500 text-xs font-semibold leading-relaxed">
                    您可以自由提供和替换专属的 Google Sheets 作为当前整个面板的基础数据驱动。
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-wider">共享表格链接 (Share Link)</label>
                  <input 
                    type="text"
                    placeholder="粘贴新的 Google Sheets 表格链接"
                    value={tempInputUrl}
                    onChange={(e) => setTempInputUrl(e.target.value)}
                    className={`w-full bg-slate-50 border-2 border-slate-200 focus:border-${theme.primaryColor}-500 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none placeholder-slate-400 transition-all`}
                  />
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-xs text-slate-500">
                  <span className="font-extrabold text-slate-700 flex items-center gap-1.5">
                    <HelpCircle size={14} className={`text-${theme.primaryColor}-600`} /> 格式示范：
                  </span>
                  <p className="font-mono text-[10px] break-all bg-white p-2 rounded-lg border border-slate-200">
                    https://docs.google.com/spreadsheets/d/<u>电子表格ID</u>/edit#gid=<u>选卡ID</u>
                  </p>
                  <p className="font-semibold text-[11px] leading-relaxed">
                    * 必须确保该表格的共享状态被设置为“任何人可查看”，且具有与“塑料模块”一致的纵向表头列结构（A-O）。
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-5 border-t border-slate-100 mt-6">
                <button 
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 rounded-xl font-bold text-xs transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={() => handleSaveConfig(tempInputUrl)}
                  disabled={!tempInputUrl.trim()}
                  className={`px-5 py-2 ${theme.bg} ${theme.hoverBg} disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl font-black text-xs transition-all`}
                >
                  确定绑定并装载
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
