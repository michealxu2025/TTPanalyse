import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, AreaChart, Area, Cell as RechartsCell, Legend, LabelList,
  ReferenceLine, ComposedChart, Line
} from 'recharts';
import { SalesSummary, SalesRecord, FilterState, PlasticInventoryDataset } from '../types';
import { fetchPlasticInventoryData, normalizeItemName } from '../services/dataService';

interface DashboardProps {
  summary: SalesSummary;
  filteredData: SalesRecord[];
  onSelectOrderId: (id: string) => void;
  selectedModule?: 'plastic' | 'material' | null;
  filters?: FilterState;
}

const COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f43f5e', '#84cc16', '#a855f7', '#fb7185', '#fbbf24'
];

export const getSubRegion = (region: string | undefined | null) => {
  if (!region || region === '未知地区') return 'DAKAR';
  return region;
};

export const getMajorRegion = (region: string | undefined | null) => {
  const subRegion = getSubRegion(region);
  const upper = subRegion.toUpperCase();
  if (upper.includes('DAKAR')) return 'DAKAR';
  if (upper.includes('国外') || upper.includes('海外') || upper.includes('FOREIGN')) return '国外';
  return '外区';
};

const Dashboard: React.FC<DashboardProps> = ({ summary, filteredData, onSelectOrderId, selectedModule, filters }) => {
  const isMaterial = selectedModule === 'material';
  // 版块折叠状态
  const [sections, setSections] = useState({
    trend: false,
    composition: false,
    ranking: false,
    region: false,
    receivables: false,
    demandTrend: false
  });

  // 全局展示状态
  const [pieMetric, setPieMetric] = useState<'sales' | 'quantity'>('sales'); 
  const [itemPieMetric, setItemPieMetric] = useState<'sales' | 'quantity'>('sales');
  const [customerMetric, setCustomerMetric] = useState<'sales' | 'quantity'>('sales');
  const [regionMetric, setRegionMetric] = useState<'sales' | 'quantity'>('sales');
  const [activeRegionTab, setActiveRegionTab] = useState<string>('DAKAR');
  const [trendMode, setTrendMode] = useState<'total' | 'customer' | 'salesperson'>('total');
  const [timeGranularity, setTimeGranularity] = useState<'month' | 'day'>('month');
  
  // 深度分析联动状态 (前三个模块使用)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedSubRegion, setSelectedSubRegion] = useState<string | null>(null);
  const [drillMetric, setDrillMetric] = useState<'sales' | 'quantity'>('sales'); 
  const [localTableFilters, setLocalTableFilters] = useState({
    customer: '', 
    category: '',
    month: '' 
  });

  // 新增独立状态：财务核查专用
  // selectedDebtCustomer: 按客户穿透
  // selectedAgingCategory: 按账期状态穿透 (新增)
  const [selectedDebtCustomer, setSelectedDebtCustomer] = useState<string | null>(null);
  const [selectedAgingCategory, setSelectedAgingCategory] = useState<string | null>(null);

  // 明细表内部表头多选筛选状态
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({
    id: [],
    customer: [],
    salesperson: [],
    itemName: []
  });

  const [activeFilterMenu, setActiveFilterMenu] = useState<string | null>(null);
  const [activeMetrics, setActiveMetrics] = useState({ amount: true, quantity: true });
  const [isOrdersExpanded, setIsOrdersExpanded] = useState(false);
  const [orderSearchTerm, setOrderSearchTerm] = useState('');
  const [isSalesOrdersExpanded, setIsSalesOrdersExpanded] = useState(false);
  const [salesOrderSearchTerm, setSalesOrderSearchTerm] = useState('');
  const [selectedSalesOrderId, setSelectedSalesOrderId] = useState<string | null>(null);
  const [consumptionMultiplier, setConsumptionMultiplier] = useState<number>(1.0);

  // 塑料模块每日库存联动状态（仅在“业绩增长趋势”点击“按日”+“数量”时触发）
  const [inventoryData, setInventoryData] = useState<PlasticInventoryDataset | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [showInventoryDetail, setShowInventoryDetail] = useState(false);
  const [inventorySearchTerm, setInventorySearchTerm] = useState('');

  const isDailyInventoryTriggered =
    selectedModule === 'plastic' &&
    sections.trend &&
    timeGranularity === 'day' &&
    !activeMetrics.amount &&
    activeMetrics.quantity;

  // 业绩增长趋势：按月视图下，单独查看「金额」或「数量」时在折线节点显示数值标签
  const showMonthlyValueLabels =
    timeGranularity === 'month' &&
    ((activeMetrics.amount && !activeMetrics.quantity) ||
      (!activeMetrics.amount && activeMetrics.quantity));

  const formatMonthlyTrendLabel = (value: any, type: 'amount' | 'quantity'): string => {
    if (value === null || value === undefined || value === '') return '';
    const num = Number(value);
    if (!Number.isFinite(num)) return '';
    if (trendMode !== 'total' && num === 0) return '';
    if (type === 'amount') {
      if (Math.abs(num) >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
      if (Math.abs(num) >= 1000) return `${Number((num / 1000).toFixed(1))}K`;
      return Math.round(num).toLocaleString();
    }
    return Number.isInteger(num) ? num.toLocaleString() : Number(num.toFixed(1)).toLocaleString();
  };

  const loadPlasticInventory = async () => {
    setInventoryLoading(true);
    setInventoryError(null);
    try {
      const data = await fetchPlasticInventoryData();
      setInventoryData(data);
    } catch (err: any) {
      console.error('Failed to load plastic inventory:', err);
      setInventoryError(err?.message || '每日库存表加载失败，请稍后重试');
    } finally {
      setInventoryLoading(false);
    }
  };

  useEffect(() => {
    if (isDailyInventoryTriggered && !inventoryData && !inventoryLoading && !inventoryError) {
      loadPlasticInventory();
    }
  }, [isDailyInventoryTriggered, inventoryData, inventoryLoading, inventoryError]);

  // 销售订单映射与关联出库单结构（建材快消模块专用）
  const { salesOrderMap, allSalesOrderIds, outboundToSOMap } = useMemo(() => {
    const soMap: Record<string, { customer: string; date: string; outboundIds: string[]; totalAmount: number; totalQuantity: number }> = {};
    const outToSO: Record<string, string> = {};

    filteredData.forEach(r => {
      const so = r.salesOrderNo?.trim();
      const outId = r.id?.trim();
      if (so) {
        if (!soMap[so]) {
          soMap[so] = { 
            customer: r.customer, 
            date: r.date, 
            outboundIds: [], 
            totalAmount: 0, 
            totalQuantity: 0 
          };
        }
        if (outId && !soMap[so].outboundIds.includes(outId)) {
          soMap[so].outboundIds.push(outId);
        }
        soMap[so].totalAmount += r.totalAmount;
        soMap[so].totalQuantity += r.quantity;
      }
      if (outId && so) {
        outToSO[outId] = so;
      }
    });

    const ids = Object.keys(soMap).sort();
    return {
      salesOrderMap: soMap,
      allSalesOrderIds: ids,
      outboundToSOMap: outToSO
    };
  }, [filteredData]);

  // 根据选中的销售订单，联动过滤出库单号
  const displayedOrderIds = useMemo(() => {
    if (selectedSalesOrderId && salesOrderMap[selectedSalesOrderId]) {
      return salesOrderMap[selectedSalesOrderId].outboundIds;
    }
    return summary.orderIds;
  }, [selectedSalesOrderId, salesOrderMap, summary.orderIds]);

  const displayedOrderCount = useMemo(() => {
    if (selectedSalesOrderId && salesOrderMap[selectedSalesOrderId]) {
      return salesOrderMap[selectedSalesOrderId].outboundIds.length;
    }
    return summary.orderCount;
  }, [selectedSalesOrderId, salesOrderMap, summary.orderCount]);

  const handleSelectSalesOrder = (soId: string) => {
    if (selectedSalesOrderId === soId) {
      setSelectedSalesOrderId(null);
    } else {
      setSelectedSalesOrderId(soId);
      // 联动自动展开“单据总数”
      setIsOrdersExpanded(true);
    }
  };

  // 切换折叠
  const toggleSection = (key: keyof typeof sections) => {
    setSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // --- 响应式计算链 (双向联动逻辑) ---
  const drillDownAnalysis = useMemo(() => {
    const dimension = selectedCategory ? 'category' : (selectedItem ? 'itemName' : (selectedCustomer ? 'customer' : (selectedSubRegion ? 'subRegion' : (selectedRegion ? 'region' : null))));
    const value = selectedCategory || selectedItem || selectedCustomer || selectedSubRegion || selectedRegion;
    
    if (!dimension || !value) return {
      baseRecords: [], totalSales: 0, totalQty: 0, secondaryDistribution: [], monthlyTrend: [], filterOptions: { id: [], customer: [], salesperson: [], itemName: [] }, tableRecords: [], contextTitle: '', tableTotalSales: 0, tableTotalQty: 0
    };

    const baseRecords = filteredData.filter(r => {
      if (dimension === 'region') {
        return getMajorRegion(r.region) === value;
      }
      if (dimension === 'subRegion') {
        return getSubRegion(r.region) === value;
      }
      return (r[dimension as keyof SalesRecord] || '未知') === value;
    });
    const totalSales = baseRecords.reduce((s, r) => s + r.totalAmount, 0);
    const totalQty = baseRecords.reduce((s, r) => s + r.quantity, 0);

    const recordsForDist = localTableFilters.month 
      ? baseRecords.filter(r => r.month === localTableFilters.month) 
      : baseRecords;

    const secondaryDim = (selectedRegion || selectedSubRegion) ? 'customer' : (selectedCustomer ? 'category' : 'customer');
    const distMap = new Map<string, { sales: number; qty: number }>();
    recordsForDist.forEach(r => {
      const key = r[secondaryDim] as string;
      const e = distMap.get(key) || { sales: 0, qty: 0 };
      distMap.set(key, { sales: e.sales + r.totalAmount, qty: e.qty + r.quantity });
    });
    const secondaryDistribution = Array.from(distMap.entries())
      .map(([name, v]) => ({ name, sales: v.sales, qty: v.qty }))
      .sort((a, b) => drillMetric === 'sales' ? b.sales - a.sales : b.qty - a.qty);

    let recordsForTrend = baseRecords;
    if (localTableFilters.customer && !selectedCustomer) recordsForTrend = recordsForTrend.filter(r => r.customer === localTableFilters.customer);
    if (localTableFilters.category && selectedCustomer) recordsForTrend = recordsForTrend.filter(r => r.category === localTableFilters.category);

    const monthlyMap = new Map<string, { sales: number; qty: number }>();
    recordsForTrend.forEach(r => {
      const e = monthlyMap.get(r.month) || { sales: 0, qty: 0 };
      monthlyMap.set(r.month, { sales: e.sales + r.totalAmount, qty: e.qty + r.quantity });
    });
    const allMonths = Array.from(new Set<string>(baseRecords.map(r => r.month))).sort();
    const monthlyTrend = allMonths.map(m => {
      const v = monthlyMap.get(m) || { sales: 0, qty: 0 };
      return { name: m, sales: v.sales, qty: v.qty };
    });

    const getOptionsForField = (field: string) => {
      let subset = baseRecords;
      if (localTableFilters.month) subset = subset.filter(r => r.month === localTableFilters.month);
      if (localTableFilters.customer && !selectedCustomer) subset = subset.filter(r => r.customer === localTableFilters.customer);
      if (localTableFilters.category && selectedCustomer) subset = subset.filter(r => r.category === localTableFilters.category);

      Object.entries(columnFilters).forEach(([f, vals]) => {
        const castedVals = vals as string[];
        if (f !== field && castedVals.length > 0) {
          subset = subset.filter(r => castedVals.includes(String(r[f as keyof SalesRecord])));
        }
      });
      return Array.from(new Set<string>(subset.map(r => String(r[field as keyof SalesRecord])))).sort();
    };

    const filterOptions = {
      id: getOptionsForField('id'),
      customer: getOptionsForField('customer'),
      salesperson: getOptionsForField('salesperson'),
      itemName: getOptionsForField('itemName')
    };

    let finalRecords = baseRecords;
    if (localTableFilters.month) finalRecords = finalRecords.filter(r => r.month === localTableFilters.month);
    if (localTableFilters.customer && !selectedCustomer) finalRecords = finalRecords.filter(r => r.customer === localTableFilters.customer);
    if (localTableFilters.category && selectedCustomer) finalRecords = finalRecords.filter(r => r.category === localTableFilters.category);
    
    Object.entries(columnFilters).forEach(([field, selectedValues]) => {
      const castedValues = selectedValues as string[];
      if (castedValues.length > 0) {
        finalRecords = finalRecords.filter(r => castedValues.includes(String(r[field as keyof SalesRecord])));
      }
    });

    const tableTotalSales = finalRecords.reduce((acc, cur) => acc + cur.totalAmount, 0);
    const tableTotalQty = finalRecords.reduce((acc, cur) => acc + cur.quantity, 0);

    return {
      baseRecords,
      totalSales,
      totalQty,
      secondaryDistribution,
      monthlyTrend,
      filterOptions,
      tableRecords: finalRecords.sort((a, b) => b.date.localeCompare(a.date)),
      contextTitle: selectedRegion ? '大区客户贡献排行' : (selectedSubRegion ? '小区客户贡献排行' : (selectedCustomer ? (selectedModule === 'material' ? '物料名称贡献偏好' : '品类贡献偏好') : '关联客户贡献排行')),
      tableTotalSales,
      tableTotalQty
    };
  }, [selectedCategory, selectedItem, selectedCustomer, selectedRegion, selectedSubRegion, filteredData, localTableFilters, columnFilters, drillMetric]);

  // --- 新增独立逻辑：财务核查分析 (全量列表，不做Top限制) ---
  const receivablesAnalysis = useMemo(() => {
    const today = new Date(); 
    today.setHours(0, 0, 0, 0);

    let totalSettled = 0;
    let totalUnsettled = 0;
    
    // 账期分布：未到期，临期7天以内，逾期
    const agingBuckets = [
      { name: '未到期', value: 0, color: '#10b981' }, // Green
      { name: '临期7天以内', value: 0, color: '#f59e0b' }, // Amber
      { name: '逾期', value: 0, color: '#ef4444' } // Red
    ];

    const debtorMap = new Map<string, { settled: number; unsettled: number }>();

    filteredData.forEach(r => {
      const settled = r.settledAmount ?? r.totalAmount; // 默认已结
      const unsettled = r.unsettledAmount ?? 0;
      
      totalSettled += settled;
      totalUnsettled += unsettled;

      // 统计客户欠款
      const cur = debtorMap.get(r.customer) || { settled: 0, unsettled: 0 };
      debtorMap.set(r.customer, { 
        settled: cur.settled + settled, 
        unsettled: cur.unsettled + unsettled 
      });

      // 账期分析
      if (unsettled > 0 && r.dueDate) {
        const dueDate = new Date(r.dueDate);
        const diffDays = Math.ceil((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays > 0) {
          agingBuckets[2].value += unsettled; // 逾期
        } else if (diffDays >= -7) {
          agingBuckets[1].value += unsettled; // 临期
        } else {
          agingBuckets[0].value += unsettled; // 未到期
        }
      }
    });

    // 移除 Top 限制，仅保留有欠款的客户
    const debtorsList = Array.from(debtorMap.entries())
      .map(([name, val]) => ({ name, ...val, total: val.settled + val.unsettled }))
      .filter(d => d.unsettled > 0)
      .sort((a, b) => b.unsettled - a.unsettled);

    return { totalSettled, totalUnsettled, agingBuckets, debtorsList };
  }, [filteredData]);

  // --- 财务穿透数据逻辑 (聚合单据 + 预警计算 + 双模式支持) ---
  const debtAuditDetails = useMemo(() => {
    // 1. 定义单据聚合接口
    interface AggregatedBill {
      id: string;
      dueDate: string;
      customer: string;
      unsettledAmount: number;
    }

    // 2. 聚合函数：将明细行按 id 聚合
    const aggregateBills = (items: SalesRecord[]): AggregatedBill[] => {
      const billMap = new Map<string, AggregatedBill>();
      items.forEach(r => {
        if (!billMap.has(r.id)) {
          billMap.set(r.id, {
            id: r.id,
            dueDate: r.dueDate || '',
            customer: r.customer,
            unsettledAmount: 0
          });
        }
        const bill = billMap.get(r.id)!;
        bill.unsettledAmount += (r.unsettledAmount || 0);
      });
      return Array.from(billMap.values());
    };

    // 3. 排序函数：优先级 逾期 > 临期 > 未到期 > 已结清
    const sortBillsByRisk = (items: AggregatedBill[]) => {
      const today = new Date();
      today.setHours(0,0,0,0);
      
      return items.sort((a, b) => {
        const getScore = (r: AggregatedBill) => {
           const unsettled = r.unsettledAmount;
           if (unsettled <= 0) return 3; // 优先级最低：已结清
           
           const dDate = r.dueDate ? new Date(r.dueDate) : today;
           const diff = Math.ceil((today.getTime() - dDate.getTime()) / (1000 * 60 * 60 * 24));
           
           if (diff > 0) return 0; // 优先级最高：逾期
           if (diff >= -7) return 1; // 优先级次之：临期
           return 2; // 优先级第三：安全期(未到期)
        };

        const scoreA = getScore(a);
        const scoreB = getScore(b);
        
        // 先按风险等级排序
        if (scoreA !== scoreB) return scoreA - scoreB;
        
        // 同等级按到期日升序 (越早到期越急)
        return a.dueDate.localeCompare(b.dueDate);
      });
    };

    let rawRecords: SalesRecord[] = [];
    let title = '';
    let themeColor = 'amber';
    let themeIcon = '🚨';

    // 模式 1: 按客户穿透
    if (selectedDebtCustomer) {
      rawRecords = filteredData.filter(r => r.customer === selectedDebtCustomer);
      title = selectedDebtCustomer;
      themeColor = 'amber';
      themeIcon = '🚨';
    }
    // 模式 2: 按账期状态穿透 (未到期/临期/逾期)
    else if (selectedAgingCategory) {
      const today = new Date(); today.setHours(0,0,0,0);
      rawRecords = filteredData.filter(r => {
        const unsettled = r.unsettledAmount ?? 0;
        if (unsettled <= 0 || !r.dueDate) return false;
        
        const dueDate = new Date(r.dueDate);
        const diffDays = Math.ceil((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (selectedAgingCategory === '逾期') return diffDays > 0;
        if (selectedAgingCategory === '临期7天以内') return diffDays >= -7 && diffDays <= 0;
        if (selectedAgingCategory === '未到期') return diffDays < -7;
        return false;
      });
      title = `${selectedAgingCategory}账款清单`;
      if (selectedAgingCategory === '逾期') { themeColor = 'rose'; themeIcon = '🔥'; }
      if (selectedAgingCategory === '未到期') { themeColor = 'emerald'; themeIcon = '🛡️'; }
    } else {
      return null;
    }

    // 执行聚合与排序
    const aggregatedBills = aggregateBills(rawRecords);
    const sortedBills = sortBillsByRisk(aggregatedBills);
    const totalUnsettled = aggregatedBills.reduce((s, r) => s + r.unsettledAmount, 0);

    return {
      title,
      themeColor,
      themeIcon,
      records: sortedBills,
      totalUnsettled
    };
  }, [selectedDebtCustomer, selectedAgingCategory, filteredData]);

  // --- 客户需求趋势分析数据逻辑 (物料消耗与库存预测) ---
  const demandTrendAnalysis = useMemo(() => {
    // 1. 查找当前筛选数据中唯一存在的客户名称
    const uniqueCustomersInFilteredData = Array.from(
      new Set(filteredData.map(r => r.customer).filter(Boolean))
    );

    // 只有在正好选中一个客户时才触发分析
    if (uniqueCustomersInFilteredData.length !== 1) {
      return {
        isActive: false,
        customerName: null,
        results: [],
        message: uniqueCustomersInFilteredData.length === 0 
          ? '筛选后未找到客户，请在上方筛选中心选择一个客户'
          : `当前包含 ${uniqueCustomersInFilteredData.length} 个客户。请在上方筛选框中“只保留一个客户”来激活趋势分析。`
      };
    }

    const activeCustomerName = uniqueCustomersInFilteredData[0];
    const customerRecords = filteredData.filter(r => {
      if (r.customer !== activeCustomerName) return false;
      const orderId = (r.id || '').trim().toUpperCase();
      if (orderId.startsWith('YP') || orderId.startsWith('XSTHD')) return false;
      return true;
    });

    // 按物料分类
    const itemGroups: Record<string, SalesRecord[]> = {};
    customerRecords.forEach(r => {
      const key = (r.itemName || r.category || '').trim();
      if (!key) return;
      if (!itemGroups[key]) {
        itemGroups[key] = [];
      }
      itemGroups[key].push(r);
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const results = Object.entries(itemGroups).map(([itemName, records]) => {
      // 提取物料单位 (建材快消中有 pricingUnit，如 PCS/包/箱 等) 与物料名称分类
      const unit = records[0]?.pricingUnit?.trim() || 'UNIT';
      const category = records[0]?.category?.trim() || '';

      // 下单总数量和总金额
      const totalQty = records.reduce((sum, r) => sum + r.quantity, 0);
      const totalAmount = records.reduce((sum, r) => sum + r.totalAmount, 0);

      // 按日期升序排序
      const sortedRecords = [...records].sort((a, b) => {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });

      // 合并同天的下单数量
      const dailyOrders: { date: string; quantity: number }[] = [];
      const dateMap: Record<string, number> = {};
      sortedRecords.forEach(r => {
        const dateStr = r.date || '';
        if (!dateStr) return;
        dateMap[dateStr] = (dateMap[dateStr] || 0) + r.quantity;
      });

      Object.entries(dateMap).forEach(([date, quantity]) => {
        dailyOrders.push({ date, quantity });
      });

      // 保证按日期升序
      dailyOrders.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const n = dailyOrders.length;
      let lastOrderQty = 0;
      let lastOrderDateStr = '';
      let firstOrderDateStr = '';
      let secondLastOrderDateStr = '';
      let daysBetween = 0;
      let dailyConsumption = 0;
      let daysSinceLastOrder = 0;
      let estimatedStock = 0;
      let estimatedUsageDays = 0;
      let outOfStockDays = 0;
      let statusText = '数据不足';
      let statusColor = 'gray';

      if (n > 0) {
        const lastOrder = dailyOrders[n - 1];
        lastOrderQty = lastOrder.quantity;
        lastOrderDateStr = lastOrder.date;

        // 最后一单时间到今天天数
        const lastDate = new Date(lastOrder.date);
        lastDate.setHours(0, 0, 0, 0);
        const diffMs = today.getTime() - lastDate.getTime();
        daysSinceLastOrder = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));

        if (n >= 2) {
          firstOrderDateStr = dailyOrders[0].date;
          secondLastOrderDateStr = dailyOrders[n - 2].date;

          // 第一次下单时间到最后一次下单时间的天数
          const dFirst = new Date(firstOrderDateStr);
          dFirst.setHours(0, 0, 0, 0);
          const dLast = new Date(lastOrderDateStr);
          dLast.setHours(0, 0, 0, 0);

          const diffBetweenMs = dLast.getTime() - dFirst.getTime();
          daysBetween = Math.round(diffBetweenMs / (1000 * 60 * 60 * 24));

          if (daysBetween > 0) {
            // 每天的消耗量 =（总数量 - 最后一次下单数量）/ 天数 * 调整系数
            const baseConsumption = (totalQty - lastOrderQty) / daysBetween;
            dailyConsumption = baseConsumption * consumptionMultiplier;
            if (dailyConsumption < 0) dailyConsumption = 0;
          } else {
            // 同一天下单的不同单，无法算出日消耗
            dailyConsumption = 0;
          }

          // 预估在库数量 = 最后一单下单数量 - 每天消耗量 * 最后一单到今天天数
          estimatedStock = lastOrderQty - dailyConsumption * daysSinceLastOrder;

          // 最后一单采购量/预估日均用量算出预估能使用天数，采购日到今天的天数在减去预估能使用的天数
          estimatedUsageDays = dailyConsumption > 0 ? (lastOrderQty / dailyConsumption) : 0;
          outOfStockDays = daysSinceLastOrder - estimatedUsageDays;

          // 确保所有数值都是有限数且非NaN
          if (isNaN(dailyConsumption) || !isFinite(dailyConsumption)) dailyConsumption = 0;
          if (isNaN(estimatedStock) || !isFinite(estimatedStock)) estimatedStock = 0;
          if (isNaN(estimatedUsageDays) || !isFinite(estimatedUsageDays)) estimatedUsageDays = 0;
          if (isNaN(outOfStockDays) || !isFinite(outOfStockDays)) outOfStockDays = 0;

          if (estimatedStock <= 0) {
            statusText = '可能已断货';
            statusColor = 'red';
          } else if (estimatedStock < dailyConsumption * 5) {
            statusText = '库存偏低';
            statusColor = 'orange';
          } else {
            statusText = '库存充足';
            statusColor = 'green';
          }
        } else {
          // 只有一笔订单数据，无法推断消耗率
          statusText = '单次采购历史';
          statusColor = 'blue';
          estimatedStock = lastOrderQty; // 预估现有即最后一单的量
        }
      }

      return {
        itemName,
        category,
        unit,
        totalQty,
        totalAmount,
        orderDaysCount: n,
        firstOrderDateStr,
        secondLastOrderDateStr,
        lastOrderDateStr,
        lastOrderQty,
        lastOrderId: sortedRecords[sortedRecords.length - 1]?.id || '',
        daysBetween,
        dailyConsumption,
        daysSinceLastOrder,
        estimatedStock,
        estimatedUsageDays,
        outOfStockDays,
        statusText,
        statusColor
      };
    })
    .filter(item => item.orderDaysCount >= 2) // 忽略只有一次采购的数据
    .sort((a, b) => {
      // 优先排列可能已断货的产品 (red) -> 库存偏低 (orange) -> 库存充足 (green)
      const statusWeight: Record<string, number> = { red: 1, orange: 2, green: 3, gray: 4 };
      const weightA = statusWeight[a.statusColor] || 5;
      const weightB = statusWeight[b.statusColor] || 5;
      
      if (weightA !== weightB) {
        return weightA - weightB;
      }
      // 同等状态下，在库偏低/断货量更多的优先
      return a.estimatedStock - b.estimatedStock;
    });

    return {
      isActive: true,
      customerName: activeCustomerName,
      results
    };
  }, [filteredData, consumptionMultiplier]);

  // 柱状图点击处理
  const handleReceivablesBarClick = (data: any) => {
    if (data && data.activeLabel) {
      setSelectedDebtCustomer(null); // 互斥
      setSelectedAgingCategory(data.activeLabel);
    }
  };

  const handleBarChartClick = (state: any) => {
    if (state && state.activeLabel) {
      const label = state.activeLabel;
      if (selectedCustomer) {
        setLocalTableFilters(prev => ({ ...prev, category: prev.category === label ? '' : label }));
      } else {
        setLocalTableFilters(prev => ({ ...prev, customer: prev.customer === label ? '' : label }));
      }
    }
  };

  const handleTrendClick = (state: any) => {
    if (state && state.activeLabel) {
      const clickedMonth = state.activeLabel;
      setLocalTableFilters(prev => ({ ...prev, month: prev.month === clickedMonth ? '' : clickedMonth }));
    }
  };

  const openCategoryDrillDown = (name: string) => {
    setDrillMetric(pieMetric); 
    setSelectedCategory(name);
    setSelectedItem(null);
    setSelectedCustomer(null);
    setSelectedRegion(null);
    setSelectedSubRegion(null);
    setColumnFilters({ id: [], customer: [], salesperson: [], itemName: [] });
    setLocalTableFilters({ customer: '', category: '', month: '' });
  };

  const openItemDrillDown = (name: string) => {
    setDrillMetric(itemPieMetric); 
    setSelectedItem(name);
    setSelectedCategory(null);
    setSelectedCustomer(null);
    setSelectedRegion(null);
    setSelectedSubRegion(null);
    setColumnFilters({ id: [], customer: [], salesperson: [], itemName: [] });
    setLocalTableFilters({ customer: '', category: '', month: '' });
  };

  const openCustomerDrillDown = (name: string) => {
    setDrillMetric(customerMetric);
    setSelectedCustomer(name);
    setSelectedCategory(null);
    setSelectedItem(null);
    setSelectedRegion(null);
    setSelectedSubRegion(null);
    setColumnFilters({ id: [], customer: [], salesperson: [], itemName: [] });
    setLocalTableFilters({ customer: '', category: '', month: '' });
  };

  const openRegionDrillDown = (name: string) => {
    setDrillMetric(regionMetric);
    setSelectedRegion(name);
    setSelectedSubRegion(null);
    setSelectedCustomer(null);
    setSelectedCategory(null);
    setSelectedItem(null);
    setColumnFilters({ id: [], customer: [], salesperson: [], itemName: [] });
    setLocalTableFilters({ customer: '', category: '', month: '' });
  };

  const openSubRegionDrillDown = (name: string) => {
    setDrillMetric(regionMetric);
    setSelectedSubRegion(name);
    setSelectedRegion(null);
    setSelectedCustomer(null);
    setSelectedCategory(null);
    setSelectedItem(null);
    setColumnFilters({ id: [], customer: [], salesperson: [], itemName: [] });
    setLocalTableFilters({ customer: '', category: '', month: '' });
  };

  // 塑料模块每日库存汇总计算（自动将同一物料的所有颜色数量相加）
  const matchedInventorySummary = useMemo(() => {
    if (!isDailyInventoryTriggered || !inventoryData) return null;

    const selectedItemNames = filters?.itemNames || [];
    const hasEntityOrCategoryFilter = Boolean(
      (filters?.categories && filters.categories.length > 0) ||
      (filters?.customers && filters.customers.length > 0) ||
      (filters?.salespeople && filters.salespeople.length > 0) ||
      (filters?.regions && filters.regions.length > 0)
    );

    let matchedItems = inventoryData.items;
    let scopeLabel = `全部库存物料 (${inventoryData.items.length}项)`;

    if (selectedItemNames.length > 0) {
      const targetSet = new Set(selectedItemNames.map(normalizeItemName));
      matchedItems = inventoryData.items.filter(item => targetSet.has(item.normalizedName));
      scopeLabel = selectedItemNames.length === 1
        ? `物料：${selectedItemNames[0]}`
        : `已选物料 (${selectedItemNames.length}项，匹配 ${matchedItems.length} 项)`;
    } else if (hasEntityOrCategoryFilter) {
      const filteredItemSet = new Set(
        filteredData.map(r => normalizeItemName(r.itemName)).filter(Boolean)
      );
      matchedItems = inventoryData.items.filter(item => filteredItemSet.has(item.normalizedName));
      scopeLabel = `当前筛选关联物料 (${matchedItems.length}项)`;
    }

    const totalAvailableQty = matchedItems.reduce((sum, item) => sum + item.availableQty, 0);
    const totalColorsCount = matchedItems.reduce((sum, item) => sum + item.colors.length, 0);

    const dailyStockByDate: Record<string, number | null> = {};
    let latestDate: string | null = null;
    let latestDateQty: number | null = null;

    for (const date of inventoryData.dates) {
      let sum = 0;
      let hasAny = false;
      for (const item of matchedItems) {
        const val = item.dailyStock[date];
        if (val !== null && val !== undefined) {
          sum += val;
          hasAny = true;
        }
      }
      dailyStockByDate[date] = hasAny ? sum : null;
      if (hasAny) {
        latestDate = date;
        latestDateQty = sum;
      }
    }

    // 过滤出符合当前月份/日期筛选范围的库存日期，使其可自然展示在按日X轴上
    const selectedMonths = filters?.months || [];
    const dateRange = filters?.dateRange || ['', ''];
    const matchingDates = inventoryData.dates.filter(date => {
      if (dateRange[0] && date < dateRange[0]) return false;
      if (dateRange[1] && date > dateRange[1]) return false;
      if (selectedMonths.length > 0) {
        const [y, m] = date.split('-');
        const mNum = Number(m);
        const candidates = [
          `${y}年${m}月`,
          `${y}年${mNum}月`,
          `${y}-${m}`
        ];
        if (!candidates.some(c => selectedMonths.includes(c))) {
          return false;
        }
      }
      return dailyStockByDate[date] !== null;
    });

    return {
      matchedItems,
      scopeLabel,
      totalAvailableQty,
      totalColorsCount,
      dailyStockByDate,
      dates: inventoryData.dates,
      matchingDates,
      latestDate,
      latestDateQty
    };
  }, [isDailyInventoryTriggered, inventoryData, filters, filteredData]);

  const trendAnalysis = useMemo(() => {
    const isMonth = timeGranularity === 'month';
    const timeKey = isMonth ? 'month' : 'date';
    
    // Extract all dates to find the true min and max
    const salesDates = filteredData.map(d => d.date).filter(Boolean);
    const extraInvDates = (!isMonth && matchedInventorySummary) ? matchedInventorySummary.matchingDates : [];
    const allDates = [...salesDates, ...extraInvDates].sort();
    let timeNodes: string[] = [];
    let useFallback = false;
    
    if (allDates.length > 0) {
      const minDate = allDates[0];
      const maxDate = allDates[allDates.length - 1];
      
      const [minY, minM, minD] = minDate.split('-').map(Number);
      const [maxY, maxM, maxD] = maxDate.split('-').map(Number);
      
      if (!isNaN(minY) && !isNaN(maxY)) {
        if (isMonth) {
          let currY = minY;
          let currM = minM;
          while (currY < maxY || (currY === maxY && currM <= maxM)) {
            timeNodes.push(`${currY}-${String(currM).padStart(2, '0')}`);
            currM++;
            if (currM > 12) {
              currM = 1;
              currY++;
            }
          }
        } else {
          let curr = new Date(minY, minM - 1, minD);
          const end = new Date(maxY, maxM - 1, maxD);
          // Prevent infinite loops in case of weird dates
          let safety = 0;
          while (curr <= end && safety < 5000) {
            const y = curr.getFullYear();
            const m = String(curr.getMonth() + 1).padStart(2, '0');
            const d = String(curr.getDate()).padStart(2, '0');
            timeNodes.push(`${y}-${m}-${d}`);
            curr.setDate(curr.getDate() + 1);
            safety++;
          }
        }
      } else {
        useFallback = true;
      }
    } else {
      useFallback = true;
    }

    if (useFallback || timeNodes.length === 0) {
      timeNodes = Array.from(new Set<string>(filteredData.map(d => d[timeKey]))).sort();
    }

    const getNodeKey = (d: SalesRecord) => {
      if (useFallback) return d[timeKey];
      return isMonth ? d.date.substring(0, 7) : d.date;
    };

    const metrics = !activeMetrics.amount && !activeMetrics.quantity ? { amount: true, quantity: true } : activeMetrics;

    const totalAmt = filteredData.reduce((s, r) => s + r.totalAmount, 0);
    const totalQty = filteredData.reduce((s, r) => s + r.quantity, 0);
    const avgAmount = timeNodes.length > 0 ? totalAmt / timeNodes.length : 0;
    const avgQuantity = timeNodes.length > 0 ? totalQty / timeNodes.length : 0;

    if (trendMode === 'total') {
      const data = timeNodes.map(tNode => {
        const nodeRecords = filteredData.filter(d => getNodeKey(d) === tNode);
        const row: any = {
          name: tNode,
          amount: nodeRecords.reduce((s, r) => s + r.totalAmount, 0),
          quantity: nodeRecords.reduce((s, r) => s + r.quantity, 0)
        };
        if (matchedInventorySummary) {
          row.inventory = matchedInventorySummary.dailyStockByDate[tNode] ?? null;
        }
        return row;
      });
      const series: any[] = [];
      if (metrics.amount) series.push({ key: 'amount', name: '总金额', type: 'amount', color: '#6366f1' });
      if (metrics.quantity) series.push({ key: 'quantity', name: '总数量', type: 'quantity', color: '#10b981' });
      return { data, series, avgAmount, avgQuantity };
    }

    const dimKey = (trendMode === 'customer' ? 'customer' : 'salesperson') as 'customer' | 'salesperson';
    
    // 优化：按总金额排序，取真正的 Top 8
    const entityTotals = new Map<string, number>();
    filteredData.forEach(d => {
      const key = String(d[dimKey]);
      entityTotals.set(key, (entityTotals.get(key) || 0) + d.totalAmount);
    });
    const topEntities = Array.from(entityTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(e => e[0]);

    const series: any[] = [];
    topEntities.forEach((entity, idx) => {
      const baseColor = COLORS[idx % COLORS.length];
      if (metrics.amount) series.push({ key: `${entity}_amt`, name: `${entity} (金额)`, type: 'amount', color: baseColor });
      if (metrics.quantity) series.push({ key: `${entity}_qty`, name: `${entity} (数量)`, type: 'quantity', color: baseColor, dashed: true });
    });

    const data = timeNodes.map(tNode => {
      const row: any = { name: tNode };
      topEntities.forEach(entity => {
        const records = filteredData.filter(d => getNodeKey(d) === tNode && d[dimKey] === entity);
        row[`${entity}_amt`] = records.reduce((s, r) => s + r.totalAmount, 0);
        row[`${entity}_qty`] = records.reduce((s, r) => s + r.quantity, 0);
      });
      if (matchedInventorySummary) {
        row.inventory = matchedInventorySummary.dailyStockByDate[tNode] ?? null;
      }
      return row;
    });
    return { data, series, avgAmount, avgQuantity };
  }, [filteredData, trendMode, activeMetrics, timeGranularity, matchedInventorySummary]);

  const regionAnalysisData = useMemo(() => {
    const regions = ['DAKAR', '外区', '国外'];
    const result = regions.map(regionName => {
      const records = filteredData.filter(d => getMajorRegion(d.region) === regionName);
      
      const totalSales = records.reduce((sum, r) => sum + r.totalAmount, 0);
      const totalQty = records.reduce((sum, r) => sum + r.quantity, 0);
      
      const subRegionMap = new Map<string, { sales: number; quantity: number; customers: Set<string> }>();
      
      records.forEach(d => {
        const subRegionName = getSubRegion(d.region);
        const subEntry = subRegionMap.get(subRegionName) || { sales: 0, quantity: 0, customers: new Set() };
        subEntry.sales += d.totalAmount;
        subEntry.quantity += d.quantity;
        if (d.customer) subEntry.customers.add(d.customer);
        subRegionMap.set(subRegionName, subEntry);
      });
      
      const subRegionRanking = Array.from(subRegionMap.entries())
        .map(([name, val]) => ({ 
          name, 
          sales: val.sales, 
          quantity: val.quantity,
          customerCount: val.customers.size
        }))
        .sort((a, b) => regionMetric === 'sales' ? b.sales - a.sales : b.quantity - a.quantity);
        
      return {
        name: regionName,
        totalSales,
        totalQty,
        subRegionRanking
      };
    });
    return result;
  }, [filteredData, regionMetric]);

  const customerAnalysisData = useMemo(() => {
    const map = new Map<string, { sales: number; quantity: number }>();
    filteredData.forEach(d => {
      const entry = map.get(d.customer) || { sales: 0, quantity: 0 };
      entry.sales += d.totalAmount;
      entry.quantity += d.quantity;
      map.set(d.customer, entry);
    });
    return Array.from(map.entries())
      .map(([name, val]) => ({ name, sales: val.sales, quantity: val.quantity }))
      .sort((a, b) => customerMetric === 'sales' ? b.sales - a.sales : b.quantity - a.quantity);
  }, [filteredData, customerMetric]);

  const totalCustomerSales = useMemo(() => customerAnalysisData.reduce((acc, curr) => acc + curr.sales, 0), [customerAnalysisData]);
  const totalCustomerQty = useMemo(() => customerAnalysisData.reduce((acc, curr) => acc + curr.quantity, 0), [customerAnalysisData]);

  const sortedCategorySummary = useMemo(() => {
    const merged = summary.categoryDistribution.map(cat => {
      const qtyItem = summary.categoryQuantityDistribution.find(q => q.name === cat.name);
      return { name: cat.name, sales: cat.value, quantity: qtyItem ? qtyItem.value : 0 };
    });
    return merged.sort((a, b) => pieMetric === 'sales' ? b.sales - a.sales : b.quantity - a.quantity);
  }, [summary, pieMetric]);

  const sortedItemSummary = useMemo(() => {
    const map = new Map<string, { sales: number; quantity: number }>();
    filteredData.forEach(d => {
      const entry = map.get(d.itemName) || { sales: 0, quantity: 0 };
      entry.sales += d.totalAmount;
      entry.quantity += d.quantity;
      map.set(d.itemName, entry);
    });
    return Array.from(map.entries())
      .map(([name, val]) => ({ name, sales: val.sales, quantity: val.quantity }))
      .sort((a, b) => itemPieMetric === 'sales' ? b.sales - a.sales : b.quantity - a.quantity);
  }, [filteredData, itemPieMetric]);

  const formatMetricDisplay = (value: number, metric: 'sales' | 'quantity') => {
    if (metric === 'sales') return `${(value / 1000000).toFixed(2)}M CFA`;
    return `${value.toLocaleString()} UNIT`;
  };

  // 优化后的标签渲染函数：缩短引导线长度，防止遮挡
  const renderCustomizedLabel = (props: any) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, percent, name, fill } = props;
    const RADIAN = Math.PI / 180;
    const sin = Math.sin(-RADIAN * midAngle);
    const cos = Math.cos(-RADIAN * midAngle);
    const sx = cx + (outerRadius + 10) * cos;
    const sy = cy + (outerRadius + 10) * sin;
    // 缩短第一段引导线 (45 -> 30)
    const mx = cx + (outerRadius + 30) * cos;
    const my = cy + (outerRadius + 30) * sin;
    // 缩短第二段水平线 (22 -> 20)
    const ex = mx + (cos >= 0 ? 1 : -1) * 20;
    const ey = my;
    const textAnchor = cos >= 0 ? 'start' : 'end';
    
    // 稍微缩小字体以适应更紧凑的布局
    return (
      <g>
        <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" strokeWidth={2.5} opacity={0.7} />
        <circle cx={ex} cy={ey} r={4} fill={fill} />
        <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} textAnchor={textAnchor} fill="#0f172a" style={{ fontSize: '12px', fontWeight: 900 }}>{name}</text>
        <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} dy={16} textAnchor={textAnchor} fill="#64748b" style={{ fontSize: '10px', fontWeight: 600 }}>{(percent * 100).toFixed(1)}%</text>
      </g>
    );
  };

  const TableDropdownFilter = ({ field, label }: { field: string, label: string }) => {
    const options = (drillDownAnalysis.filterOptions as Record<string, string[]>)?.[field] || [];
    const selected = columnFilters[field] || [];
    const isActive = selected.length > 0;
    const menuRef = useRef<HTMLDivElement>(null);
    const [localSearch, setLocalSearch] = useState('');

    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          setActiveFilterMenu(null);
        }
      };
      if (activeFilterMenu === field) {
        document.addEventListener('mousedown', handleClickOutside);
      }
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeFilterMenu, field]);

    const toggleValue = (val: string) => {
      const next = selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val];
      setColumnFilters(prev => ({ ...prev, [field]: next }));
    };

    const filteredOptions = options.filter(opt => opt.toLowerCase().includes(localSearch.toLowerCase()));

    return (
      <div className="relative inline-block text-left" ref={menuRef}>
        <button 
          onClick={() => {
            setActiveFilterMenu(activeFilterMenu === field ? null : field);
            setLocalSearch('');
          }}
          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all group ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
        >
          <span className={`text-[10px] font-black uppercase tracking-widest`}>{label}</span>
          <svg className={`w-3 h-3 transition-transform ${activeFilterMenu === field ? 'rotate-180 text-indigo-500' : 'text-slate-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {activeFilterMenu === field && (
          <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-slate-200 shadow-2xl rounded-2xl z-[6000] overflow-hidden animate-in fade-in zoom-in-95 duration-150 origin-top-left">
             <div className="p-3 bg-slate-50 border-b border-slate-100">
                <input 
                  type="text" autoFocus placeholder={`搜索...`} value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-100 font-bold"
                />
             </div>
             <div className="max-h-64 overflow-y-auto p-1.5 custom-scrollbar bg-white">
                <button onClick={() => { setColumnFilters(prev => ({ ...prev, [field]: [] })); setActiveFilterMenu(null); }} className="w-full text-left px-3 py-2.5 text-[10px] font-black text-red-500 hover:bg-red-50 rounded-xl mb-1">重置该列筛选</button>
                {filteredOptions.map(opt => {
                  const isSelected = selected.includes(opt);
                  return (
                    <button key={opt} onClick={() => toggleValue(opt)} className={`w-full text-left px-3 py-2.5 rounded-xl mb-0.5 flex items-center justify-between group ${isSelected ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-indigo-50 text-slate-700'}`}>
                      <span className="text-[12px] font-bold truncate pr-2">{opt}</span>
                      {isSelected && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>}
                    </button>
                  );
                })}
             </div>
          </div>
        )}
      </div>
    );
  };

  const renderSalesOrderCard = () => (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
      <div className="p-6 flex items-center justify-between bg-white border-b border-slate-100 min-h-[100px]">
        <div className="flex items-center gap-6">
          <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-3xl text-blue-600">📋</div>
          <div>
            <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">订单总数</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-black text-slate-900">{allSalesOrderIds.length}</p>
              <span className="text-[10px] font-bold text-slate-400">销售订单</span>
            </div>
          </div>
        </div>
        <button 
          onClick={() => setIsSalesOrdersExpanded(!isSalesOrdersExpanded)} 
          className="p-2 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all cursor-pointer"
          title="展开/收起销售订单明细"
        >
          <svg className={`w-5 h-5 transition-transform ${isSalesOrdersExpanded ? 'rotate-180 text-blue-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
        </button>
      </div>
      {isSalesOrdersExpanded && (
        <div className="px-5 py-5 bg-slate-50/50 border-t border-slate-100 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2">
            <input 
              type="text" 
              placeholder="检索销售订单号..." 
              value={salesOrderSearchTerm} 
              onChange={(e) => setSalesOrderSearchTerm(e.target.value)} 
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-500 font-bold" 
            />
            {selectedSalesOrderId && (
              <button 
                onClick={() => setSelectedSalesOrderId(null)} 
                className="whitespace-nowrap px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer"
                title="重置选中的销售订单"
              >
                重置
              </button>
            )}
          </div>

          {/* 点击对应销售单号后，对应出现的出库单号 */}
          {selectedSalesOrderId && salesOrderMap[selectedSalesOrderId] && (
            <div className="p-3.5 bg-blue-50/90 rounded-2xl border border-blue-200 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black text-blue-950 flex items-center gap-1">
                    <span>🛒</span> 销售单: <span className="font-mono text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200">{selectedSalesOrderId}</span>
                  </span>
                  <span className="text-[10px] font-black px-2 py-0.5 bg-blue-200/80 text-blue-900 rounded-full">
                    对应 {salesOrderMap[selectedSalesOrderId].outboundIds.length} 个出库单
                  </span>
                </div>
                <button 
                  onClick={() => setSelectedSalesOrderId(null)}
                  className="text-[11px] text-blue-600 hover:text-blue-800 font-black underline cursor-pointer"
                >
                  收起明细
                </button>
              </div>

              <p className="text-[11px] font-bold text-blue-800/90">
                对应出库单号（点击可直接查看单据发票与明细）：
              </p>

              <div className="flex flex-wrap gap-2">
                {salesOrderMap[selectedSalesOrderId].outboundIds.map(outboundId => (
                  <button
                    key={outboundId}
                    onClick={() => onSelectOrderId(outboundId)}
                    className="px-3 py-1.5 bg-white hover:bg-blue-600 hover:text-white border border-blue-300 rounded-xl text-xs font-mono font-bold text-slate-800 transition-all shadow-xs flex items-center gap-1.5 group cursor-pointer"
                    title={`查看出库单 ${outboundId}`}
                  >
                    <span>📑</span>
                    <span className="group-hover:underline">{outboundId}</span>
                    <span className="text-[10px] text-blue-500 group-hover:text-blue-100 font-sans">↗</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 销售单号列表 */}
          <div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>销售单列表（点击查看对应出库单）</span>
              <span>共 {allSalesOrderIds.length} 个</span>
            </div>
            <div className="max-h-48 overflow-y-auto flex flex-wrap gap-2 custom-scrollbar pr-1">
              {allSalesOrderIds
                .filter(id => id.toLowerCase().includes(salesOrderSearchTerm.toLowerCase()))
                .map(id => {
                  const isSelected = selectedSalesOrderId === id;
                  const outboundCount = salesOrderMap[id]?.outboundIds.length || 0;
                  return (
                    <button 
                      key={id} 
                      onClick={() => handleSelectSalesOrder(id)} 
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        isSelected 
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-200 border border-blue-600 scale-105' 
                          : 'bg-white border border-slate-200 text-slate-700 hover:border-blue-400 hover:bg-blue-50/50'
                      }`}
                    >
                      <span>{id}</span>
                      <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-sans ${
                        isSelected ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {outboundCount}出库单
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderOutboundCard = () => (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
      <div className="p-6 flex items-center justify-between bg-white border-b border-slate-100 min-h-[100px]">
        <div className="flex items-center gap-6">
          <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center text-3xl text-amber-600">📑</div>
          <div>
            <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">单据总数</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-black text-slate-900">{displayedOrderCount}</p>
              {selectedSalesOrderId ? (
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md border border-blue-100">
                  已选销售单
                </span>
              ) : (
                <span className="text-[10px] font-bold text-slate-400">出库单</span>
              )}
            </div>
          </div>
        </div>
        <button 
          onClick={() => setIsOrdersExpanded(!isOrdersExpanded)} 
          className="p-2 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all cursor-pointer"
          title="展开/收起出库单明细"
        >
          <svg className={`w-5 h-5 transition-transform ${isOrdersExpanded ? 'rotate-180 text-indigo-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
        </button>
      </div>
      {isOrdersExpanded && (
        <div className="px-5 py-5 bg-slate-50/50 border-t border-slate-100 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
          {selectedSalesOrderId && (
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
              <div className="text-xs text-blue-900 font-bold flex items-center gap-1.5 truncate">
                <span className="text-sm">🔗</span>
                <span>关联销售单：</span>
                <span className="font-mono bg-white px-2 py-0.5 rounded border border-blue-200 text-blue-700">{selectedSalesOrderId}</span>
                <span className="text-blue-600">({displayedOrderIds.length} 个出库单)</span>
              </div>
              <button 
                onClick={() => setSelectedSalesOrderId(null)}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-800 underline ml-2 whitespace-nowrap cursor-pointer"
              >
                显示全部
              </button>
            </div>
          )}
          <input 
            type="text" 
            placeholder={selectedSalesOrderId ? `在销售单 ${selectedSalesOrderId} 关联的出库单中检索...` : "检索单号..."} 
            value={orderSearchTerm} 
            onChange={(e) => setOrderSearchTerm(e.target.value)} 
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-indigo-500 font-bold" 
          />
          <div className="max-h-48 overflow-y-auto flex flex-wrap gap-2 custom-scrollbar pr-1">
            {displayedOrderIds
              .filter(id => id.toLowerCase().includes(orderSearchTerm.toLowerCase()))
              .map(id => {
                const parentSO = outboundToSOMap[id];
                return (
                  <button 
                    key={id} 
                    onClick={() => onSelectOrderId(id)} 
                    className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-mono font-bold hover:border-indigo-500 hover:bg-indigo-50/30 transition-colors cursor-pointer flex items-center gap-1"
                    title={parentSO ? `出库单: ${id} (对应销售单: ${parentSO})` : `出库单: ${id}`}
                  >
                    <span>{id}</span>
                    {isMaterial && parentSO && !selectedSalesOrderId && (
                      <span className="text-[9px] text-slate-400 font-sans">({parentSO})</span>
                    )}
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-10 pb-16 relative">
      {/* 顶部指标卡区 */}
      {isMaterial ? (
        <div className="space-y-6">
          {/* 第一行：总计金额 与 出库数量 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
            {/* 1. 总计金额 */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-6 h-[100px]">
               <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-3xl text-indigo-600">💰</div>
               <div><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">总计金额 (CFA)</p><p className="text-2xl font-black text-slate-900">{summary.totalSales.toLocaleString()}</p></div>
            </div>

            {/* 2. 出库数量 */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-6 h-[100px]">
               <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-3xl text-emerald-600">📦</div>
               <div><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">出库数量</p><p className="text-2xl font-black text-slate-900">{summary.totalQuantity.toLocaleString()}</p></div>
            </div>
          </div>

          {/* 第二行（单独一行，在总计金额和出库数量下面）：订单总数 与 单据总数 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* 3. 订单总数 (对应的是“销售订单号”) */}
            {renderSalesOrderCard()}

            {/* 4. 单据总数 (对应的是“出库单号”) */}
            {renderOutboundCard()}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {/* 1. 总计金额 */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-6 h-[100px]">
             <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-3xl text-indigo-600">💰</div>
             <div><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">总计金额 (CFA)</p><p className="text-2xl font-black text-slate-900">{summary.totalSales.toLocaleString()}</p></div>
          </div>

          {/* 2. 出库总量 */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-6 h-[100px]">
             <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-3xl text-emerald-600">📦</div>
             <div><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">出库总量</p><p className="text-2xl font-black text-slate-900">{summary.totalQuantity.toLocaleString()}</p></div>
          </div>

          {/* 3. 单据总数 */}
          {renderOutboundCard()}
        </div>
      )}

      {/* 业绩趋势版块 */}
      <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div 
          onClick={() => toggleSection('trend')}
          className="p-4 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors gap-4 sm:gap-0"
        >
          <div className="flex items-center justify-between w-full sm:w-auto">
            <h3 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2 sm:gap-3 shrink-0">
              <span className="p-1.5 sm:p-2 bg-indigo-50 text-indigo-600 rounded-lg sm:rounded-xl text-base sm:text-lg">📈</span> 业绩增长趋势
            </h3>
            <button className="p-1.5 sm:p-2 bg-slate-100 rounded-lg sm:rounded-xl sm:hidden">
              <svg className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-300 ${sections.trend ? 'rotate-180 text-indigo-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
            </button>
          </div>
          <div className="flex items-center gap-4 sm:gap-6 w-full sm:w-auto" onClick={(e) => e.stopPropagation()}>
            {sections.trend && (
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full sm:w-auto">
                <div className="flex bg-slate-100 p-1 rounded-xl sm:rounded-2xl border border-slate-200 shadow-inner flex-1 sm:flex-none justify-center">
                  <button onClick={() => setTimeGranularity('month')} className={`flex-1 sm:flex-none px-2 sm:px-4 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black transition-all ${timeGranularity === 'month' ? 'bg-white shadow-md text-slate-900' : 'text-slate-500'}`}>按月</button>
                  <button onClick={() => setTimeGranularity('day')} className={`flex-1 sm:flex-none px-2 sm:px-4 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black transition-all ${timeGranularity === 'day' ? 'bg-white shadow-md text-indigo-700' : 'text-slate-500'}`}>按日</button>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-xl sm:rounded-2xl border border-slate-200 shadow-inner flex-1 sm:flex-none justify-center">
                   <button onClick={() => setActiveMetrics({ amount: true, quantity: false })} className={`flex-1 sm:flex-none px-2 sm:px-4 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black transition-all ${activeMetrics.amount && !activeMetrics.quantity ? 'bg-white shadow-md text-indigo-700' : 'text-slate-500'}`}>金额</button>
                   <button onClick={() => setActiveMetrics({ amount: false, quantity: true })} className={`flex-1 sm:flex-none px-2 sm:px-4 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black transition-all ${!activeMetrics.amount && activeMetrics.quantity ? 'bg-white shadow-md text-emerald-700' : 'text-slate-500'}`}>数量</button>
                   <button onClick={() => setActiveMetrics({ amount: true, quantity: true })} className={`flex-1 sm:flex-none px-2 sm:px-4 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black transition-all ${activeMetrics.amount && activeMetrics.quantity ? 'bg-white shadow-md text-slate-900' : 'text-slate-500'}`}>双轴</button>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-xl sm:rounded-2xl border border-slate-200 shadow-inner flex-1 sm:flex-none justify-center">
                  <button onClick={() => setTrendMode('total')} className={`flex-1 sm:flex-none px-2 sm:px-4 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black transition-all ${trendMode === 'total' ? 'bg-white shadow-md text-slate-900' : 'text-slate-500'}`}>汇总</button>
                  <button onClick={() => setTrendMode('customer')} className={`flex-1 sm:flex-none px-2 sm:px-4 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black transition-all ${trendMode === 'customer' ? 'bg-white shadow-md text-indigo-700' : 'text-slate-500'}`}>客户</button>
                  <button onClick={() => setTrendMode('salesperson')} className={`flex-1 sm:flex-none px-2 sm:px-4 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black transition-all ${trendMode === 'salesperson' ? 'bg-white shadow-md text-emerald-700' : 'text-slate-500'}`}>销售</button>
                </div>
              </div>
            )}
            <button className="hidden sm:block p-2 bg-slate-100 rounded-xl">
              <svg className={`w-5 h-5 transition-transform duration-300 ${sections.trend ? 'rotate-180 text-indigo-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
            </button>
          </div>
        </div>
        {sections.trend && (
          <div className="px-4 sm:px-8 pb-8 animate-in fade-in duration-500 space-y-5">
            {/* 塑料模块：按日 + 数量 触发每日库存联动栏 */}
            {isDailyInventoryTriggered && (
              <div className="mt-2 bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 sm:p-5 flex flex-col gap-4">
                {inventoryLoading ? (
                  <div className="flex items-center gap-3 text-amber-800 text-xs sm:text-sm font-bold">
                    <div className="w-4 h-4 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin"></div>
                    <span>正在同步塑料每日库存数据（自动合并各颜色库存）...</span>
                  </div>
                ) : inventoryError ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs sm:text-sm font-bold text-rose-600">⚠️ {inventoryError}</span>
                    <button
                      type="button"
                      onClick={loadPlasticInventory}
                      className="px-3 py-1.5 bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-black transition-all"
                    >
                      重试加载
                    </button>
                  </div>
                ) : matchedInventorySummary ? (
                  <>
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="flex flex-wrap items-center gap-3 sm:gap-6">
                        <div className="flex items-center gap-2.5">
                          <span className="w-9 h-9 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center text-lg shadow-xs">🏭</span>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-black text-amber-900">每日库存联动已开启</span>
                              <span className="px-2 py-0.5 bg-white/90 border border-amber-200 text-amber-800 rounded-md text-[10px] font-bold">
                                {matchedInventorySummary.scopeLabel}
                              </span>
                            </div>
                            <p className="text-[11px] font-semibold text-amber-700/80 mt-0.5">
                              已自动汇总各物料全部颜色数量（共 {matchedInventorySummary.totalColorsCount} 条颜色记录）
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 sm:gap-6 pl-0 sm:pl-4 sm:border-l border-amber-200/80">
                          <div>
                            <p className="text-[10px] font-black text-amber-700/70 uppercase tracking-wider">当前可用量 (C列合计)</p>
                            <p className="text-lg sm:text-xl font-black text-amber-700 font-mono tabular-nums">
                              {matchedInventorySummary.matchedItems.length > 0
                                ? matchedInventorySummary.totalAvailableQty.toLocaleString()
                                : '无匹配库存'}
                            </p>
                          </div>
                          {matchedInventorySummary.latestDate && matchedInventorySummary.latestDateQty !== null && (
                            <div>
                              <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                                最新日库存 ({matchedInventorySummary.latestDate})
                              </p>
                              <p className="text-lg sm:text-xl font-black text-slate-800 font-mono tabular-nums">
                                {matchedInventorySummary.latestDateQty.toLocaleString()}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {matchedInventorySummary.matchedItems.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowInventoryDetail(prev => !prev)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all ${
                              showInventoryDetail
                                ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                                : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-100/60'
                            }`}
                          >
                            {showInventoryDetail ? '收起库存明细' : `查看颜色及每日明细 (${matchedInventorySummary.matchedItems.length})`}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={loadPlasticInventory}
                          className="px-3 py-1.5 bg-white hover:bg-amber-100/60 border border-amber-200 text-amber-800 rounded-xl text-xs font-black transition-all"
                          title="重新从库存表同步最新数据"
                        >
                          刷新库存
                        </button>
                      </div>
                    </div>

                    {matchedInventorySummary.matchedItems.length > 0 && matchedInventorySummary.matchingDates.length === 0 && (
                      <div className="text-[11px] font-bold text-amber-800/80 bg-white/70 px-3 py-2 rounded-xl border border-amber-200/60">
                        提示：当前筛选日期范围内暂无对应日期的历史库存列（库存表当前记录日期：{matchedInventorySummary.dates.join('、') || '暂无'}），上方仍展示当前可用量合计。
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            )}

            <div className={`${showMonthlyValueLabels && trendMode === 'total' ? 'h-[480px]' : 'h-[450px]'} w-full mt-4`}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={trendAnalysis.data}
                  margin={{
                    top: showMonthlyValueLabels ? (trendMode === 'total' ? 68 : 34) : 10,
                    right: showMonthlyValueLabels ? 28 : 12,
                    left: 10,
                    bottom: 5
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{fill: '#64748b', fontSize: 11}}
                    minTickGap={showMonthlyValueLabels ? 6 : 20}
                    padding={showMonthlyValueLabels ? { left: 26, right: 26 } : { left: 0, right: 0 }}
                  />
                  {activeMetrics.amount && <YAxis yAxisId="amount" axisLine={false} tickLine={false} tick={{fill: '#6366f1', fontSize: 10, fontWeight: 700}} tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : `${(v / 1000).toFixed(0)}K`} />}
                  {isDailyInventoryTriggered && matchedInventorySummary && matchedInventorySummary.matchedItems.length > 0 && (
                    <YAxis
                      yAxisId="inventory"
                      orientation="left"
                      axisLine={false}
                      tickLine={false}
                      tick={{fill: '#d97706', fontSize: 10, fontWeight: 700}}
                      tickFormatter={(v) => v.toLocaleString()}
                    />
                  )}
                  {activeMetrics.quantity && <YAxis yAxisId="quantity" orientation="right" axisLine={false} tickLine={false} tick={{fill: '#10b981', fontSize: 10, fontWeight: 700}} tickFormatter={(v) => v.toLocaleString()} />}

                  {/* 按月单指标模式：将数值置于图表上方避开曲线，并以虚线贯通连接数据点与X轴对应月份 */}
                  {showMonthlyValueLabels && trendAnalysis.data.map((row: any, idx: number) => {
                    const metricType: 'amount' | 'quantity' = activeMetrics.amount ? 'amount' : 'quantity';
                    const color = activeMetrics.amount ? '#6366f1' : '#10b981';

                    if (trendMode !== 'total') {
                      return (
                        <ReferenceLine
                          key={`month-guide-${row.name}`}
                          x={row.name}
                          yAxisId={metricType}
                          zIndex={50}
                          stroke="#cbd5e1"
                          strokeDasharray="3 3"
                          strokeOpacity={0.75}
                        />
                      );
                    }

                    const labelText = formatMonthlyTrendLabel(row[metricType], metricType);
                    const isStaggered = trendAnalysis.data.length > 9;
                    const labelY = isStaggered ? (idx % 2 === 0 ? 16 : 36) : 24;

                    return (
                      <ReferenceLine
                        key={`month-guide-${row.name}`}
                        x={row.name}
                        yAxisId={metricType}
                        zIndex={50}
                        shape={(props: any) => {
                          const lineX = Number(props.x1);
                          const bottomY = Math.max(Number(props.y1), Number(props.y2));
                          if (!Number.isFinite(lineX) || !Number.isFinite(bottomY)) return <g />;
                          return (
                            <g>
                              <line
                                x1={lineX}
                                y1={labelY + 7}
                                x2={lineX}
                                y2={bottomY}
                                stroke={color}
                                strokeOpacity={0.38}
                                strokeWidth={1.25}
                                strokeDasharray="3 3"
                              />
                              {labelText && (
                                <>
                                  <circle
                                    cx={lineX}
                                    cy={labelY + 7}
                                    r={2}
                                    fill={color}
                                    fillOpacity={0.75}
                                  />
                                  <text
                                    x={lineX}
                                    y={labelY}
                                    textAnchor="middle"
                                    fill={color}
                                    fontSize={11}
                                    fontWeight={800}
                                  >
                                    {labelText}
                                  </text>
                                </>
                              )}
                            </g>
                          );
                        }}
                      />
                    );
                  })}
                  
                  {activeMetrics.amount && trendMode === 'total' && (
                    <ReferenceLine y={trendAnalysis.avgAmount} yAxisId="amount" stroke="#6366f1" strokeDasharray="4 4" strokeOpacity={0.6} label={{ position: 'insideBottomLeft', value: `平均: ${trendAnalysis.avgAmount >= 1000000 ? (trendAnalysis.avgAmount / 1000000).toFixed(2) + 'M' : (trendAnalysis.avgAmount / 1000).toFixed(0) + 'K'}`, fill: '#6366f1', fontSize: 11, fontWeight: 'bold' }} />
                  )}
                  {activeMetrics.quantity && trendMode === 'total' && (
                    <ReferenceLine y={trendAnalysis.avgQuantity} yAxisId="quantity" stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.6} label={{ position: 'insideBottomRight', value: `平均: ${Math.round(trendAnalysis.avgQuantity).toLocaleString()}`, fill: '#10b981', fontSize: 11, fontWeight: 'bold' }} />
                  )}

                  <Tooltip
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: any, name: string) => [
                      value !== null && value !== undefined ? Number(value).toLocaleString() : '-',
                      name
                    ]}
                  />
                  <Legend iconType="circle" />
                  {trendAnalysis.series.map((s) => (
                    <Area
                      key={s.key}
                      yAxisId={s.type}
                      type="monotone"
                      dataKey={s.key}
                      name={s.name}
                      stroke={s.color}
                      strokeWidth={s.dashed ? 2 : 3}
                      strokeDasharray={s.dashed ? "5 5" : "0"}
                      fill={s.color}
                      fillOpacity={s.dashed ? 0 : 0.08}
                      dot={showMonthlyValueLabels ? { r: 4, fill: s.color, stroke: '#ffffff', strokeWidth: 2 } : false}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    >
                      {showMonthlyValueLabels && trendMode !== 'total' && (
                        <LabelList
                          dataKey={s.key}
                          content={(props: any) => {
                            const px = Number(props.x);
                            const py = Number(props.y);
                            const labelText = formatMonthlyTrendLabel(props.value, s.type as 'amount' | 'quantity');
                            if (!labelText || !Number.isFinite(px) || !Number.isFinite(py)) return null;
                            const textY = Math.max(12, py - 18);
                            return (
                              <g>
                                <line
                                  x1={px}
                                  y1={textY + 4}
                                  x2={px}
                                  y2={py - 5}
                                  stroke={s.color}
                                  strokeOpacity={0.5}
                                  strokeWidth={1}
                                  strokeDasharray="2 2"
                                />
                                <text
                                  x={px}
                                  y={textY}
                                  textAnchor="middle"
                                  fill={s.color}
                                  fontSize={10}
                                  fontWeight={800}
                                  paintOrder="stroke"
                                  stroke="#ffffff"
                                  strokeWidth={3}
                                  strokeLinejoin="round"
                                >
                                  {labelText}
                                </text>
                              </g>
                            );
                          }}
                        />
                      )}
                    </Area>
                  ))}
                  {isDailyInventoryTriggered && matchedInventorySummary && matchedInventorySummary.matchedItems.length > 0 && (
                    <Line
                      yAxisId="inventory"
                      type="monotone"
                      dataKey="inventory"
                      name="每日库存 (全颜色合计)"
                      stroke="#f59e0b"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#f59e0b', stroke: '#ffffff', strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: '#d97706', strokeWidth: 0 }}
                      connectNulls={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* 可展开的物料全颜色合计与每日库存明细表 */}
            {isDailyInventoryTriggered && showInventoryDetail && matchedInventorySummary && matchedInventorySummary.matchedItems.length > 0 && (
              <div className="bg-slate-50/70 rounded-2xl border border-slate-200 overflow-hidden animate-in fade-in duration-300">
                <div className="px-4 sm:px-6 py-3 bg-white border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="text-xs font-black text-slate-700">
                    物料每日库存明细（同一物料已将所有颜色数量相加）
                  </div>
                  {matchedInventorySummary.matchedItems.length > 5 && (
                    <input
                      type="text"
                      value={inventorySearchTerm}
                      onChange={(e) => setInventorySearchTerm(e.target.value)}
                      placeholder="搜索物料名称..."
                      className="px-3 py-1.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-amber-400 focus:bg-white w-full sm:w-56"
                    />
                  )}
                </div>
                <div className="overflow-x-auto max-h-[360px] custom-scrollbar">
                  <table className="min-w-full divide-y divide-slate-200 text-left">
                    <thead className="bg-slate-100/80 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 sm:px-6 py-3 text-[11px] font-black text-slate-600 uppercase whitespace-nowrap">物料名称及颜色构成</th>
                        <th className="px-4 py-3 text-right text-[11px] font-black text-amber-700 uppercase whitespace-nowrap">当前可用量 (C列)</th>
                        {matchedInventorySummary.dates.map(date => (
                          <th key={date} className="px-4 py-3 text-right text-[11px] font-black text-slate-600 uppercase whitespace-nowrap font-mono">
                            {date}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {matchedInventorySummary.matchedItems
                        .filter(item =>
                          !inventorySearchTerm.trim() ||
                          item.itemName.toLowerCase().includes(inventorySearchTerm.trim().toLowerCase())
                        )
                        .map(item => (
                          <tr key={item.normalizedName} className="hover:bg-amber-50/30 transition-colors">
                            <td className="px-4 sm:px-6 py-3 min-w-[240px]">
                              <div className="text-xs sm:text-sm font-black text-slate-900">{item.itemName}</div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {item.colors.map((c, idx) => (
                                  <span key={`${c.color}-${idx}`} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold">
                                    {c.color}: {c.availableQty.toLocaleString()}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right text-xs sm:text-sm font-mono font-black text-amber-700 whitespace-nowrap">
                              {item.availableQty.toLocaleString()}
                            </td>
                            {matchedInventorySummary.dates.map(date => {
                              const val = item.dailyStock[date];
                              return (
                                <td key={date} className="px-4 py-3 text-right text-xs sm:text-sm font-mono font-bold text-slate-700 whitespace-nowrap">
                                  {val !== null && val !== undefined ? val.toLocaleString() : '-'}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 构成分析版块 - 深度空间优化与排行模式 */}
      <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div 
          onClick={() => toggleSection('composition')}
          className="p-8 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors"
        >
          <div className="flex flex-col gap-1">
            <h3 className="text-xl font-black text-slate-900 flex items-center gap-3 shrink-0">
              <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl text-lg">🧩</span> 业务构成分析
            </h3>
            {!sections.composition && (
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-12">
                {selectedModule === 'material' ? '纵向对比物料名称核心构成与物料代码贡献排行' : '纵向对比品类核心构成与物料贡献排行'}
              </p>
            )}
          </div>
          <button className="p-2 bg-slate-100 rounded-xl">
            <svg className={`w-5 h-5 transition-transform duration-300 ${sections.composition ? 'rotate-180 text-emerald-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
          </button>
        </div>
        {sections.composition && (
          <div className="px-8 pb-10 animate-in fade-in duration-500">
            <div className="flex flex-col gap-y-32">
              {/* 品类分析 - 空间拉满 */}
              <div className="flex flex-col w-full bg-slate-50/30 p-8 rounded-[40px] border border-slate-100 shadow-inner">
                <div className="flex justify-between items-start mb-8 px-4">
                  <div className="flex flex-col">
                    <h4 className="text-lg font-black text-slate-800 tracking-tight">
                      {selectedModule === 'material' ? '物料名称核心构成' : '品类核心构成'}
                    </h4>
                    <span className={`text-2xl font-black mt-2 ${pieMetric === 'sales' ? 'text-indigo-600' : 'text-emerald-600'}`}>
                      {formatMetricDisplay(sortedCategorySummary.reduce((acc, curr) => acc + (pieMetric === 'sales' ? curr.sales : curr.quantity), 0), pieMetric)}
                    </span>
                  </div>
                  <div className="flex bg-slate-200/50 p-1.5 rounded-2xl shadow-inner">
                    <button onClick={(e) => { e.stopPropagation(); setPieMetric('sales'); }} className={`px-6 py-2 rounded-xl text-xs font-black transition-all ${pieMetric === 'sales' ? 'bg-white shadow-md text-indigo-700' : 'text-slate-500'}`}>金额维度</button>
                    <button onClick={(e) => { e.stopPropagation(); setPieMetric('quantity'); }} className={`px-6 py-2 rounded-xl text-xs font-black transition-all ${pieMetric === 'quantity' ? 'bg-white shadow-md text-emerald-700' : 'text-slate-500'}`}>数量维度</button>
                  </div>
                </div>
                <div className="h-[600px] w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie 
                        data={sortedCategorySummary} 
                        cx="50%" cy="50%" 
                        innerRadius={100} 
                        outerRadius={150} 
                        paddingAngle={5} 
                        dataKey={pieMetric === 'sales' ? 'sales' : 'quantity'} 
                        stroke="#fff" 
                        strokeWidth={6} 
                        label={renderCustomizedLabel} 
                        labelLine={false} 
                        onClick={(d) => openCategoryDrillDown(String(d.name))}
                      >
                        {sortedCategorySummary.map((_, i) => <RechartsCell key={i} fill={COLORS[i % COLORS.length]} className="cursor-pointer hover:opacity-85 transition-opacity" />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => v.toLocaleString()} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.1)' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 物料分析 - TOP 15 排行展示 (由 TOP 20 调整为 TOP 15) */}
              <div className="flex flex-col w-full bg-slate-50/30 p-8 rounded-[40px] border border-slate-100 shadow-inner">
                <div className="flex justify-between items-start mb-8 px-4">
                  <div className="flex flex-col">
                    <h4 className="text-lg font-black text-slate-800 tracking-tight">
                      {selectedModule === 'material' ? '物料代码贡献排行 (TOP 15)' : '物料贡献排行 (TOP 15)'}
                    </h4>
                    <span className={`text-2xl font-black mt-2 ${itemPieMetric === 'sales' ? 'text-indigo-600' : 'text-emerald-600'}`}>
                      {formatMetricDisplay(sortedItemSummary.slice(0, 15).reduce((acc, curr) => acc + (itemPieMetric === 'sales' ? curr.sales : curr.quantity), 0), itemPieMetric)}
                    </span>
                  </div>
                  <div className="flex bg-slate-200/50 p-1.5 rounded-2xl shadow-inner">
                    <button onClick={(e) => { e.stopPropagation(); setItemPieMetric('sales'); }} className={`px-6 py-2 rounded-xl text-xs font-black transition-all ${itemPieMetric === 'sales' ? 'bg-white shadow-md text-indigo-700' : 'text-slate-500'}`}>金额维度</button>
                    <button onClick={(e) => { e.stopPropagation(); setItemPieMetric('quantity'); }} className={`px-6 py-2 rounded-xl text-xs font-black transition-all ${itemPieMetric === 'quantity' ? 'bg-white shadow-md text-emerald-700' : 'text-slate-500'}`}>数量维度</button>
                  </div>
                </div>
                <div className="h-[650px] w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={sortedItemSummary.slice(0, 15)} 
                      layout="horizontal" 
                      margin={{ left: 20, right: 20, top: 20, bottom: 100 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        type="category" 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        interval={0}
                        tick={({ x, y, payload }) => (
                          <g transform={`translate(${x},${y})`}>
                            <text 
                              x={0} 
                              y={0} 
                              dy={16} 
                              textAnchor="end" 
                              fill="#64748b" 
                              className="font-bold text-[10px] cursor-pointer hover:fill-indigo-600 hover:underline transition-colors"
                              transform="rotate(-45)"
                              onClick={() => openItemDrillDown(payload.value)}
                            >
                              {payload.value.length > 15 ? `${payload.value.substring(0, 12)}...` : payload.value}
                            </text>
                          </g>
                        )}
                      />
                      <YAxis 
                        type="number" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                        tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v.toLocaleString()}
                      />
                      <Tooltip 
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.1)' }}
                        formatter={(v: any) => [v.toLocaleString(), itemPieMetric === 'sales' ? '销售额' : '数量']}
                      />
                      <Bar 
                        dataKey={itemPieMetric === 'sales' ? 'sales' : 'quantity'} 
                        radius={[8, 8, 0, 0]}
                        onClick={(d) => openItemDrillDown(d.name)}
                        className="cursor-pointer"
                        barSize={32}
                      >
                        {sortedItemSummary.slice(0, 15).map((_, i) => (
                          <RechartsCell 
                            key={`cell-${i}`} 
                            fill={COLORS[i % COLORS.length]} 
                            fillOpacity={0.9}
                          />
                        ))}
                        <LabelList 
                          dataKey={itemPieMetric === 'sales' ? 'sales' : 'quantity'} 
                          position="top" 
                          formatter={(v: any) => formatMetricDisplay(v, itemPieMetric)}
                          style={{ fill: '#64748b', fontSize: '10px', fontWeight: 800 }} 
                          offset={10}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 客户排行版块 */}
      <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div 
          onClick={() => toggleSection('ranking')}
          className="p-8 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors"
        >
          <div className="flex flex-col gap-1">
            <h3 className="text-xl font-black text-slate-900 flex items-center gap-3 shrink-0">
              <span className="p-2 bg-amber-50 text-amber-600 rounded-xl text-lg">👥</span> 客户采购排行
            </h3>
            {sections.ranking && (
              <span className={`text-2xl font-black mt-2 pl-12 ${customerMetric === 'sales' ? 'text-indigo-600' : 'text-emerald-600'}`}>
                {formatMetricDisplay(customerAnalysisData.reduce((acc, curr) => acc + (customerMetric === 'sales' ? curr.sales : curr.quantity), 0), customerMetric)}
              </span>
            )}
            {!sections.ranking && (
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-12">共分析 {customerAnalysisData.length} 家客户</p>
            )}
          </div>
          <div className="flex items-center gap-6" onClick={(e) => e.stopPropagation()}>
            {sections.ranking && (
              <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                <button onClick={() => setCustomerMetric('sales')} className={`px-6 py-1.5 rounded-xl text-xs font-black transition-all ${customerMetric === 'sales' ? 'bg-white shadow-md text-indigo-700' : 'text-slate-500'}`}>金额</button>
                <button onClick={() => setCustomerMetric('quantity')} className={`px-6 py-1.5 rounded-xl text-xs font-black transition-all ${customerMetric === 'quantity' ? 'bg-white shadow-md text-emerald-700' : 'text-slate-500'}`}>数量</button>
              </div>
            )}
            <button className="p-2 bg-slate-100 rounded-xl">
              <svg className={`w-5 h-5 transition-transform duration-300 ${sections.ranking ? 'rotate-180 text-amber-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
            </button>
          </div>
        </div>
        {sections.ranking && (
          <div className="px-8 pb-10 animate-in fade-in duration-500">
            <div className="w-full" style={{ height: `${Math.max(400, customerAnalysisData.length * 48)}px` }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={customerAnalysisData} layout="vertical" margin={{ left: 20, right: 120 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={150} axisLine={false} tickLine={false} tick={({ x, y, payload, textAnchor }) => (
                      <text x={x} y={y} dy={4} textAnchor={textAnchor} className="fill-slate-600 font-black text-[12px] hover:fill-indigo-600 hover:underline cursor-pointer transition-colors" onClick={() => openCustomerDrillDown(payload.value)}>
                        {payload.value}
                      </text>
                    )} 
                  />
                  <Tooltip cursor={{ fill: '#f1f5f9', opacity: 0.5 }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                  <Bar dataKey={customerMetric === 'sales' ? 'sales' : 'quantity'} radius={[0, 10, 10, 0]} barSize={30} onClick={(d) => openCustomerDrillDown(d.name)} className="cursor-pointer">
                    {customerAnalysisData.map((_, index) => <RechartsCell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    <LabelList 
                      dataKey={customerMetric === 'sales' ? 'sales' : 'quantity'} 
                      position="right" 
                      formatter={(v: any) => {
                        const total = customerMetric === 'sales' ? totalCustomerSales : totalCustomerQty;
                        const percent = total > 0 ? ((v / total) * 100).toFixed(1) + '%' : '0%';
                        const valStr = customerMetric === 'sales' ? `${(v / 1000000).toFixed(2)}M` : v.toLocaleString();
                        return `${valStr} (${percent})`;
                      }} 
                      style={{ fill: '#475569', fontSize: '11px', fontWeight: 900, fontFamily: 'monospace' }} 
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </section>

      {/* 地区销售分析版块 */}
      <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div 
          onClick={() => toggleSection('region')}
          className="p-8 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors"
        >
          <div className="flex flex-col gap-1">
            <h3 className="text-xl font-black text-slate-900 flex items-center gap-3 shrink-0">
              <span className="p-2 bg-blue-50 text-blue-600 rounded-xl text-lg">🌍</span> 地区销售分析
            </h3>
            {sections.region && (
              <span className={`text-2xl font-black mt-2 pl-12 ${regionMetric === 'sales' ? 'text-indigo-600' : 'text-emerald-600'}`}>
                {formatMetricDisplay(regionAnalysisData.reduce((acc, curr) => acc + (regionMetric === 'sales' ? curr.totalSales : curr.totalQty), 0), regionMetric)}
              </span>
            )}
            {!sections.region && (
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-12">共分析 {regionAnalysisData.length} 个大区</p>
            )}
          </div>
          <div className="flex items-center gap-6" onClick={(e) => e.stopPropagation()}>
            {sections.region && (
              <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                <button onClick={() => setRegionMetric('sales')} className={`px-6 py-1.5 rounded-xl text-xs font-black transition-all ${regionMetric === 'sales' ? 'bg-white shadow-md text-indigo-700' : 'text-slate-500'}`}>金额</button>
                <button onClick={() => setRegionMetric('quantity')} className={`px-6 py-1.5 rounded-xl text-xs font-black transition-all ${regionMetric === 'quantity' ? 'bg-white shadow-md text-emerald-700' : 'text-slate-500'}`}>数量</button>
              </div>
            )}
            <button className="p-2 bg-slate-100 rounded-xl">
              <svg className={`w-5 h-5 transition-transform duration-300 ${sections.region ? 'rotate-180 text-blue-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
            </button>
          </div>
        </div>
        {sections.region && (
          <div className="px-8 pb-10 animate-in fade-in duration-500">
            <div className="flex items-center justify-between mb-6 border-b border-slate-200 pb-2">
              <div className="flex gap-2">
                {regionAnalysisData.map(region => (
                  <button
                    key={region.name}
                    onClick={() => setActiveRegionTab(region.name)}
                    className={`px-6 py-2.5 rounded-xl text-sm font-black transition-all ${
                      activeRegionTab === region.name
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {region.name} ({regionMetric === 'sales' ? formatMetricDisplay(region.totalSales, 'sales') : formatMetricDisplay(region.totalQty, 'quantity')})
                  </button>
                ))}
              </div>
              <button
                onClick={() => openRegionDrillDown(activeRegionTab)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold rounded-xl transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                查看 {activeRegionTab} 订单明细
              </button>
            </div>
            
            {regionAnalysisData.map(region => {
              if (region.name !== activeRegionTab) return null;
              return (
                <div key={region.name} className="w-full animate-in fade-in duration-300 flex flex-col gap-10">
                  {/* 小区排行 */}
                  <div>
                    <h4 className="text-sm font-black text-slate-700 mb-4 flex items-center gap-2">
                      <span className="w-2 h-6 bg-blue-500 rounded-full"></span>
                      小区销售排行
                    </h4>
                    <div className="h-[400px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={region.subRegionRanking} layout="horizontal" margin={{ left: 20, right: 20, top: 40, bottom: 60 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                          <XAxis 
                            type="category" 
                            dataKey="name" 
                            axisLine={false} 
                            tickLine={false} 
                            interval={0}
                            tick={({ x, y, payload }) => (
                              <g transform={`translate(${x},${y})`}>
                                <text 
                                  x={0} 
                                  y={0} 
                                  dy={16} 
                                  textAnchor="end" 
                                  fill="#64748b" 
                                  className="font-black text-[11px] cursor-pointer hover:fill-blue-600 hover:underline transition-colors"
                                  transform="rotate(-45)"
                                  onClick={() => openSubRegionDrillDown(payload.value)}
                                >
                                  {payload.value}
                                </text>
                              </g>
                            )} 
                          />
                          <YAxis 
                            yAxisId="left"
                            type="number" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                            tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v.toLocaleString()}
                          />
                          <YAxis 
                            yAxisId="right"
                            orientation="right"
                            type="number" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#ff7300', fontSize: 10, fontWeight: 700 }}
                            tickFormatter={(v) => `${v}库`}
                          />
                          <Tooltip 
                            cursor={{ fill: '#f1f5f9', opacity: 0.5 }} 
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                            formatter={(value: any, name: string) => {
                              if (name === 'customerCount') return [value, '客户数量'];
                              return [value.toLocaleString(), regionMetric === 'sales' ? '销售额' : '数量'];
                            }}
                          />
                          <Bar 
                            yAxisId="left"
                            dataKey={regionMetric === 'sales' ? 'sales' : 'quantity'} 
                            radius={[10, 10, 0, 0]} 
                            barSize={40} 
                            onClick={(d) => openSubRegionDrillDown(d.name)} 
                            className="cursor-pointer"
                          >
                            {region.subRegionRanking.map((_, index) => <RechartsCell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                            <LabelList 
                              dataKey={regionMetric === 'sales' ? 'sales' : 'quantity'} 
                              position="top" 
                              formatter={(v: any) => {
                                const total = regionMetric === 'sales' ? region.totalSales : region.totalQty;
                                const percent = total > 0 ? ((v / total) * 100).toFixed(1) + '%' : '0%';
                                const valStr = regionMetric === 'sales' ? `${(v / 1000000).toFixed(1)}M` : v.toLocaleString();
                                return `${valStr} (${percent})`;
                              }} 
                              style={{ fill: '#475569', fontSize: '10px', fontWeight: 900 }} 
                              offset={10}
                            />
                          </Bar>
                          <Line 
                            yAxisId="right"
                            type="monotone" 
                            dataKey="customerCount" 
                            stroke="#ff7300" 
                            strokeWidth={3}
                            dot={{ r: 4, fill: '#ff7300', strokeWidth: 2, stroke: '#fff' }}
                            activeDot={{ r: 6 }}
                          >
                            <LabelList 
                              dataKey="customerCount" 
                              position="top" 
                              style={{ fill: '#ff7300', fontSize: '10px', fontWeight: 900 }}
                              offset={10}
                              formatter={(v: any) => `${v}库`}
                            />
                          </Line>
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 新增独立模块：应付未付情况核查 (完全隔离，不影响前三个模块) */}
      <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden border-l-[12px] border-l-amber-500">
        <div onClick={() => toggleSection('receivables')} className="p-4 sm:p-8 flex items-center justify-between cursor-pointer hover:bg-slate-50/50">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2 sm:gap-3 shrink-0"><span className="p-1.5 sm:p-2 bg-amber-50 text-amber-600 rounded-lg sm:rounded-xl text-base sm:text-lg">📅</span> 应付未付情况核查</h3>
            <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest pl-8 sm:pl-12">该模块仅依据筛选中心数据进行独立财务穿透</p>
          </div>
          <button className="p-1.5 sm:p-2 bg-slate-100 rounded-lg sm:rounded-xl"><svg className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform ${sections.receivables ? 'rotate-180 text-amber-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg></button>
        </div>
        {sections.receivables && (
          <div className="px-8 pb-12 animate-in fade-in space-y-12">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              {/* 左侧卡片：纯数字展示，移除扇形图 */}
              <div className="bg-slate-50 p-10 rounded-[44px] flex flex-col justify-center border border-slate-100 h-[300px]">
                <div className="space-y-10">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                      <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">已结清回款</p>
                    </div>
                    <p className="text-4xl font-black text-emerald-600 tracking-tighter">{(receivablesAnalysis.totalSettled ?? 0).toLocaleString()} <span className="text-sm text-slate-400 ml-1">CFA</span></p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                       <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
                       <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">待回款</p>
                    </div>
                    <p className="text-4xl font-black text-amber-600 tracking-tighter">{(receivablesAnalysis.totalUnsettled ?? 0).toLocaleString()} <span className="text-sm text-slate-400 ml-1">CFA</span></p>
                  </div>
                </div>
              </div>
              <div className="bg-slate-50 p-10 rounded-[44px] border border-slate-100 h-[300px]">
                <h4 className="text-[10px] font-black text-slate-400 uppercase mb-6 text-center tracking-widest">欠款账期风险分布 (点击柱子穿透)</h4>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={receivablesAnalysis.agingBuckets} onClick={handleReceivablesBarClick}>
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900}} />
                    <Tooltip cursor={{fill: '#f1f5f9'}} />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={40} cursor="pointer">
                      {receivablesAnalysis.agingBuckets.map((e, i) => <RechartsCell key={i} fill={e.color}/>)}
                      <LabelList 
                        dataKey="value" 
                        position="top" 
                        formatter={(v: any) => {
                          const total = receivablesAnalysis.agingBuckets.reduce((sum, b) => sum + b.value, 0);
                          const percent = total > 0 ? ((v / total) * 100).toFixed(1) + '%' : '0%';
                          return `${(v / 1000000).toFixed(2)}M (${percent})`;
                        }} 
                        style={{ fill: '#475569', fontSize: '10px', fontWeight: 900, fontFamily: 'monospace' }} 
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white rounded-[40px] border border-slate-200 shadow-xl overflow-hidden">
              <div className="px-10 py-5 bg-slate-50 border-b border-slate-100 text-[11px] font-black text-slate-500 uppercase">欠款客户核查清单 (点击开启独立核查)</div>
              <div className="overflow-x-auto max-h-[500px] custom-scrollbar text-left relative">
                <table className="min-w-full divide-y divide-slate-100">
                  <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm"><tr><th className="px-10 py-4 text-left text-[11px] font-black text-slate-400 uppercase">客户名称</th><th className="px-10 py-4 text-right text-[11px] font-black text-slate-400 uppercase">待结余额 (CFA)</th><th className="px-10 py-4 text-left text-[11px] font-black text-slate-400 uppercase pl-16">回款率</th></tr></thead>
                  <tbody className="divide-y divide-slate-50">{receivablesAnalysis.debtorsList.map(d => { const ratio = (d.settled / (d.settled + d.unsettled || 1)) * 100; return (<tr key={d.name} className="hover:bg-slate-50 cursor-pointer" onClick={() => { setSelectedAgingCategory(null); setSelectedDebtCustomer(d.name); }}><td className="px-10 py-4 text-sm font-black text-slate-900">{d.name}</td><td className="px-10 py-4 text-sm font-mono font-black text-amber-600 text-right">{(d.unsettled ?? 0).toLocaleString()}</td><td className="px-10 py-4 pl-16"><div className="flex items-center gap-4"><div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full ${ratio > 70 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{width: `${ratio}%`}}></div></div><span className="text-[10px] font-black text-slate-500">{ratio.toFixed(0)}%</span></div></td></tr>)})}</tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 客户需求趋势分析 (塑料与建材快消模块均支持) */}
      {(selectedModule === 'plastic' || selectedModule === 'material') && (
        <section className={`bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden border-l-[12px] ${isMaterial ? 'border-l-emerald-600' : 'border-l-indigo-600'}`}>
          <div onClick={() => toggleSection('demandTrend')} className={`p-4 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/50 transition-colors ${sections.demandTrend ? 'border-b border-slate-100/60' : ''}`}>
            <div className="flex flex-col gap-1 flex-grow">
              <h3 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2 sm:gap-3 shrink-0">
                <span className={`p-1.5 sm:p-2 rounded-lg sm:rounded-xl text-base sm:text-lg ${isMaterial ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>📈</span>
                客户需求趋势分析
              </h3>
              <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest pl-8 sm:pl-12">
                智能消耗模型推演 · 预估备货库存警戒
              </p>
            </div>

            {/* 消耗系数调节区 */}
            {sections.demandTrend && demandTrendAnalysis.isActive && (
              <div className={`flex items-center gap-2 rounded-2xl px-4 py-2 shadow-sm shrink-0 border ${isMaterial ? 'bg-emerald-50/50 border-emerald-100' : 'bg-indigo-50/50 border-indigo-100'}`} onClick={(e) => e.stopPropagation()}>
                <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                  <span>🎚️</span> 消耗倍数:
                </span>
                <input
                  id="consumption_multiplier_range"
                  type="range"
                  min="0.1"
                  max="3.0"
                  step="0.1"
                  value={consumptionMultiplier}
                  onChange={(e) => setConsumptionMultiplier(parseFloat(e.target.value))}
                  className={`w-20 sm:w-28 h-1 rounded-md appearance-none cursor-pointer ${isMaterial ? 'bg-emerald-200 accent-emerald-600' : 'bg-indigo-200 accent-indigo-600'}`}
                />
                <div className="flex items-center gap-1">
                  <input
                    id="consumption_multiplier_number"
                    type="number"
                    min="0.1"
                    max="10.0"
                    step="0.1"
                    value={consumptionMultiplier}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val > 0) {
                        setConsumptionMultiplier(val);
                      }
                    }}
                    className={`w-12 h-6 text-xs font-mono font-black text-center bg-white border rounded-lg focus:outline-none focus:ring-1 ${isMaterial ? 'text-emerald-700 border-emerald-200 focus:ring-emerald-500' : 'text-indigo-700 border-indigo-200 focus:ring-indigo-500'}`}
                  />
                  <span className={`text-xs font-bold ${isMaterial ? 'text-emerald-600' : 'text-indigo-600'}`}>倍</span>
                </div>
                <button
                  id="reset_multiplier_btn"
                  onClick={() => setConsumptionMultiplier(1.0)}
                  className="px-1.5 py-0.5 text-[10px] bg-white hover:bg-slate-100 border border-slate-200 rounded-md font-bold text-slate-600 transition-all shadow-sm active:scale-95 ml-1"
                  title="重置为 1.0 倍"
                >
                  重置
                </button>
              </div>
            )}

            <button type="button" className="p-1.5 sm:p-2 bg-slate-100 hover:bg-slate-200 rounded-lg sm:rounded-xl ml-auto sm:ml-0">
              <svg className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform ${sections.demandTrend ? (isMaterial ? 'rotate-180 text-emerald-600' : 'rotate-180 text-indigo-600') : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {sections.demandTrend && (
            <div className="px-8 pb-12 animate-in fade-in space-y-6">
              {!demandTrendAnalysis.isActive ? (
                /* 情况 1：未选择/选择了多个客户，提示单选 */
                <div className="bg-slate-50 p-10 rounded-[32px] text-center border border-slate-100 flex flex-col items-center justify-center space-y-3">
                  <span className={`text-4xl ${isMaterial ? 'text-emerald-400' : 'text-indigo-400'}`}>👤</span>
                  <p className="text-sm font-bold text-slate-700">{demandTrendAnalysis.message}</p>
                  <p className="text-xs text-slate-400">模型需要依据特定单一客户的完整下单节奏来计算消耗周期。</p>
                </div>
              ) : demandTrendAnalysis.results.length === 0 ? (
                /* 情况 2：空结果 */
                <div className="bg-slate-50 p-10 rounded-[32px] text-center border border-slate-100">
                  <p className="text-sm font-bold text-slate-500">该客户暂无下单物料数据</p>
                </div>
              ) : (
                /* 情况 3：正常展示分析结果 */
                <div className="space-y-6">
                  {/* 标头说明 */}
                  <div className={`p-6 rounded-2xl border text-left text-xs leading-relaxed font-semibold ${isMaterial ? 'bg-emerald-50/50 border-emerald-100 text-emerald-950' : 'bg-indigo-50/50 border-indigo-100 text-indigo-900'}`}>
                    <p className="font-extrabold mb-1">💡 客户库存推演数学逻辑：</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>对该客户在所选账期内下单的每种物料，合并相同采购日的数量，算出在这段周期里的<strong>总下单数量与总金额</strong>。</li>
                      <li><strong>每日均消耗量</strong> = (总下单量 - 最后一单下单量) / (首单日期 至 最后一单日期 的天数)。</li>
                      <li><strong>缺货天数</strong> = [最后一单至今日天数] - (最后一单采购量 / 预估日均用量)。其表示预估产品用尽后的过往天数；若为负数表示库存依旧充裕。</li>
                      <li><strong>预估现有库存量</strong> = 最后一单采购量 - (每日均消耗量 * [最后一单至今日的未采购天数])。</li>
                    </ul>
                  </div>

                  {/* 物料卡片 grid 展示 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                    {demandTrendAnalysis.results.map((item, idx) => (
                      <div key={idx} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between">
                        {/* 状态徽章 */}
                        <div className="absolute top-6 right-6">
                          <span className={`px-3 py-1 rounded-full text-xs font-black border uppercase tracking-wider
                            ${item.statusColor === 'red' ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse animate-duration-1000' : ''}
                            ${item.statusColor === 'orange' ? 'bg-amber-50 text-amber-700 border-amber-200' : ''}
                            ${item.statusColor === 'green' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''}
                            ${item.statusColor === 'blue' ? 'bg-blue-50 text-blue-700 border-blue-200' : ''}
                            ${item.statusColor === 'gray' ? 'bg-slate-50 text-slate-700 border-slate-200' : ''}
                          `}>
                            {item.statusText}
                          </span>
                        </div>

                        {/* 物料标题 & 基础概览 */}
                        <div className="space-y-4">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className={`text-[10px] font-black tracking-widest uppercase px-2.5 py-1 rounded-md ${isMaterial ? 'text-emerald-700 bg-emerald-50' : 'text-indigo-600 bg-indigo-50'}`}>
                                物料 {idx + 1}
                              </span>
                              {isMaterial && item.category && item.category !== item.itemName && (
                                <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md truncate max-w-[220px]" title={item.category}>
                                  {item.category}
                                </span>
                              )}
                            </div>
                            <h4 className="text-lg font-black text-slate-800 mt-1 pr-28 line-clamp-1" title={item.itemName}>{item.itemName}</h4>
                          </div>

                          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <div>
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">周期总采购量</p>
                              <p className="text-sm font-black text-slate-700 mt-0.5">{item.totalQty.toLocaleString()} {item.unit || 'UNIT'}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">周期总金额</p>
                              <p className={`text-sm font-black mt-0.5 ${isMaterial ? 'text-emerald-700' : 'text-indigo-700'}`}>{item.totalAmount.toLocaleString()} CFA</p>
                            </div>
                          </div>
                        </div>

                        {/* 核心推演计算部分 */}
                        <div className="mt-5 space-y-3 pt-4 border-t border-dashed border-slate-100">
                          {item.orderDaysCount >= 2 ? (
                            <div className="space-y-3">
                              {/* 1. 均消耗率 */}
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-400 font-bold flex items-center gap-1.5">
                                  <span>📅</span> 消耗均算区间
                                </span>
                                <span className="font-bold text-slate-700">
                                  {item.firstOrderDateStr} ~ {item.lastOrderDateStr} ({item.daysBetween} 天)
                                </span>
                              </div>

                              <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-400 font-bold flex items-center gap-1.5">
                                  <span>⚡</span> 预估日均用量
                                </span>
                                <span className={`font-extrabold flex items-center gap-1 ${isMaterial ? 'text-emerald-600' : 'text-indigo-600'}`}>
                                  <span>{item.dailyConsumption.toFixed(2)} {item.unit || 'UNIT'} / 天</span>
                                  {consumptionMultiplier !== 1.0 && (
                                    <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded px-1 font-bold">
                                      ({consumptionMultiplier}x)
                                    </span>
                                  )}
                                </span>
                              </div>

                              {/* 2. 最后一单 */}
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-400 font-bold flex items-center gap-1.5">
                                  <span>📦</span> 最后一单详情
                                </span>
                                <span className="font-bold text-slate-700 flex items-center gap-2">
                                  <span>{item.lastOrderDateStr} ({item.lastOrderQty.toLocaleString()} {item.unit || 'UNIT'})</span>
                                  {item.lastOrderId && (
                                    <button
                                      onClick={() => onSelectOrderId(item.lastOrderId)}
                                      className={`px-2 py-0.5 transition-all font-mono font-black text-[10px] rounded-md border shadow-sm active:scale-95 ${isMaterial ? 'bg-emerald-50 hover:bg-emerald-100 hover:text-emerald-700 text-emerald-700 border-emerald-200' : 'bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-700 text-indigo-600 border-indigo-100'}`}
                                      title="点击查看具体订单"
                                    >
                                      #{item.lastOrderId}
                                    </button>
                                  )}
                                </span>
                              </div>

                              <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-400 font-bold flex items-center gap-1.5 cursor-help" title="最后一单采购量/预估日均用量 = 预估能使用天数。最后一单至今的天数 - 预估能使用天数 = 缺货天数">
                                  <span>⏳</span> 缺货天数 <span className="text-[9px] text-slate-300 font-normal">ⓘ</span>
                                </span>
                                <span className="font-bold">
                                  {item.outOfStockDays > 0 ? (
                                    <span className="text-rose-600 font-black bg-rose-50 px-2 py-0.5 rounded border border-rose-100">已缺货 {Math.round(item.outOfStockDays)} 天</span>
                                  ) : (
                                    <span className="text-emerald-600 font-black bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">未缺货 (预估还能用 {Math.max(0, Math.round(Math.abs(item.outOfStockDays)))} 天)</span>
                                  )}
                                </span>
                              </div>

                              {/* 3. 预估在库 */}
                              <div className="flex justify-between items-center text-xs pt-2 mt-2 border-t border-slate-100">
                                <span className="text-slate-500 font-black flex items-center gap-1.5 text-sm">
                                  <span>🏢</span> 预估现有在库
                                </span>
                                <span className={`text-base font-black ${item.estimatedStock <= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                  {item.estimatedStock <= 0 ? '0 (可能已断货)' : `${Math.round(item.estimatedStock).toLocaleString()} ${item.unit || 'UNIT'}`}
                                </span>
                              </div>
                            </div>
                          ) : (
                            /* 只有一次采购历史，算不出消耗区间 */
                            <div className="space-y-2">
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-400 font-bold flex items-center gap-1.5">
                                  <span>📦</span> 首笔采购详情
                                </span>
                                <span className="font-bold text-slate-700">
                                  {item.lastOrderDateStr} ({item.lastOrderQty.toLocaleString()} {item.unit || 'UNIT'})
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-400 font-bold flex items-center gap-1.5">
                                  <span>⏳</span> 首单存续周期
                                </span>
                                <span className="font-bold text-slate-700">
                                  已过 {item.daysSinceLastOrder} 天
                                </span>
                              </div>
                              <p className="text-[10px] text-amber-500 font-bold italic pt-1 text-center bg-amber-50 rounded-lg p-2 mt-2 border border-amber-100">
                                ⚠️ 当前筛选区间仅含一次采购，无法构建均消耗速率。
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* 深度下钻模态面板保持不变 (前三个模块使用) */}
      {(selectedCategory || selectedItem || selectedCustomer || selectedRegion || selectedSubRegion) && (
        <div className="fixed inset-0 bg-white z-[5000] flex flex-col animate-in slide-in-from-bottom-10 duration-500 overflow-hidden">
           <div className="px-10 py-6 border-b border-slate-200 bg-white flex items-center justify-between shadow-sm z-10">
              <div className="flex items-center gap-4 text-left">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-100">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                    {selectedCategory || selectedItem || selectedCustomer || selectedRegion || selectedSubRegion} <span className="text-slate-300 font-normal">|</span> <span className="text-indigo-600">深度穿透分析</span>
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 italic mt-1 uppercase tracking-widest">
                    维度：{selectedRegion ? '大区' : (selectedSubRegion ? '小区' : (selectedCategory ? (selectedModule === 'material' ? '物料名称' : '业务品类') : (selectedItem ? (selectedModule === 'material' ? '物料代码' : '物料明细') : '关联客户')))} · 全周期联动监测
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex bg-slate-100 p-1.5 rounded-xl">
                  <button onClick={() => setDrillMetric('sales')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${drillMetric === 'sales' ? 'bg-white shadow-md text-indigo-700' : 'text-slate-50'}`}>金额</button>
                  <button onClick={() => setDrillMetric('quantity')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${drillMetric === 'quantity' ? 'bg-white shadow-md text-emerald-700' : 'text-slate-50'}`}>数量</button>
                </div>
                <button onClick={() => { setSelectedCategory(null); setSelectedItem(null); setSelectedCustomer(null); setSelectedRegion(null); setSelectedSubRegion(null); setLocalTableFilters({ customer: '', category: '', month: '' }); setColumnFilters({ id: [], customer: [], salesperson: [], itemName: [] }); }} className="px-10 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black hover:bg-slate-800 transition-all">关闭分析面板</button>
              </div>
           </div>

           <div className="flex-1 overflow-y-auto custom-scrollbar p-10 bg-slate-50/30 space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-left">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">累计销售 (CFA)</p>
                  <p className="text-3xl font-black text-indigo-600">{formatMetricDisplay(drillDownAnalysis.totalSales, 'sales')}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-left">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">累计出库 (UNIT)</p>
                  <p className="text-3xl font-black text-emerald-600">{(drillDownAnalysis.totalQty || 0).toLocaleString()}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-left">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">关联交易行数</p>
                  <p className="text-3xl font-black text-slate-900">{drillDownAnalysis.baseRecords.length} <span className="text-sm font-bold text-slate-400 uppercase">Lines</span></p>
                </div>
              </div>

              <div className="flex flex-col gap-10">
                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col h-[400px]">
                   <h5 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center justify-between">
                     <span>{localTableFilters.month ? `${localTableFilters.month} - ` : ''}{drillDownAnalysis.contextTitle}</span>
                     {(localTableFilters.customer || localTableFilters.category) && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded text-[9px]">已锁定维度</span>}
                   </h5>
                   <div className="flex-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={drillDownAnalysis.secondaryDistribution.slice(0, 15)} onClick={handleBarChartClick}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => drillMetric === 'sales' ? `${(v/1000000).toFixed(1)}M` : v.toLocaleString()} />
                          <Tooltip cursor={{ fill: '#f8fafc' }} />
                          <Bar dataKey={drillMetric === 'sales' ? 'sales' : 'qty'} radius={[8, 8, 0, 0]} barSize={40} cursor="pointer">
                            {drillDownAnalysis.secondaryDistribution.slice(0, 15).map((entry, idx) => {
                               const isTarget = selectedCustomer ? localTableFilters.category === entry.name : localTableFilters.customer === entry.name;
                               const hasFilter = selectedCustomer ? !!localTableFilters.category : !!localTableFilters.customer;
                               return <RechartsCell key={`cell-${idx}`} fill={isTarget ? '#6366f1' : COLORS[idx % COLORS.length]} fillOpacity={!hasFilter || isTarget ? 1 : 0.2} />;
                            })}
                            <LabelList 
                              dataKey={drillMetric === 'sales' ? 'sales' : 'qty'} 
                              position="top" 
                              formatter={(v: any) => {
                                const total = drillMetric === 'sales' ? drillDownAnalysis.totalSales : drillDownAnalysis.totalQty;
                                const percent = total > 0 ? ((v / total) * 100).toFixed(1) + '%' : '0%';
                                const valStr = drillMetric === 'sales' ? `${(v / 1000000).toFixed(1)}M` : v.toLocaleString();
                                return `${valStr} (${percent})`;
                              }} 
                              style={{ fill: '#475569', fontSize: '10px', fontWeight: 900, fontFamily: 'monospace' }} 
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                   </div>
                </div>

                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col h-[400px]">
                   <h5 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center justify-between">
                     <span>{localTableFilters.customer || localTableFilters.category ? `${localTableFilters.customer || localTableFilters.category} - ` : ''}月度趋势</span>
                     {localTableFilters.month && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-600 rounded text-[9px]">已锁定月份: {localTableFilters.month}</span>}
                   </h5>
                   <div className="flex-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={drillDownAnalysis.monthlyTrend} onClick={handleTrendClick}>
                          <defs>
                            <linearGradient id="drillGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={drillMetric === 'sales' ? '#6366f1' : '#10b981'} stopOpacity={0.3}/><stop offset="95%" stopColor={drillMetric === 'sales' ? '#6366f1' : '#10b981'} stopOpacity={0}/></linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => drillMetric === 'sales' ? `${(v/1000000).toFixed(1)}M` : v.toLocaleString()} />
                          <Tooltip />
                          <Area type="monotone" dataKey={drillMetric === 'sales' ? 'sales' : 'qty'} stroke={drillMetric === 'sales' ? '#6366f1' : '#10b981'} fill="url(#drillGrad)" strokeWidth={3} cursor="pointer" />
                        </AreaChart>
                      </ResponsiveContainer>
                   </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden mb-12">
                 <div className="px-8 py-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-4 text-left">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">双向联动明细清单</span>
                      {(Object.values(columnFilters) as string[][]).some(v => v.length > 0 || localTableFilters.month !== '' || localTableFilters.customer !== '' || localTableFilters.category !== '') && (
                        <button onClick={() => { setColumnFilters({ id: [], customer: [], salesperson: [], itemName: [] }); setLocalTableFilters({ month: '', customer: '', category: '' }); }} className="text-[10px] font-black text-red-500 bg-red-50 px-3 py-1 rounded border border-red-100 hover:bg-red-100 transition-all">重置所有条件</button>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                       <div className="hidden md:flex items-center gap-2">
                          <span className="text-[10px] font-black bg-indigo-600 text-white px-3 py-1 rounded-lg shadow-sm">合计金额: {drillDownAnalysis.tableTotalSales.toLocaleString()} CFA</span>
                          <span className="text-[10px] font-black bg-emerald-600 text-white px-3 py-1 rounded-lg shadow-sm">出库总量: {drillDownAnalysis.tableTotalQty.toLocaleString()} UNIT</span>
                       </div>
                       <div className="flex items-center gap-3">
                          {localTableFilters.month && <span className="text-[9px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full uppercase">月度: {localTableFilters.month}</span>}
                          {(localTableFilters.customer || localTableFilters.category) && <span className="text-[9px] font-black bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full uppercase">锁定: {localTableFilters.customer || localTableFilters.category}</span>}
                          <span className="text-xs font-black text-slate-400 italic ml-2">已匹配: {drillDownAnalysis.tableRecords.length} / {drillDownAnalysis.baseRecords.length}</span>
                       </div>
                    </div>
                 </div>
                 <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
                    <table className="min-w-full divide-y divide-slate-100">
                       <thead className="bg-white sticky top-0 z-[500] shadow-sm">
                          <tr>
                            <th className="px-8 py-4 text-left"><TableDropdownFilter field="id" label="单号" /></th>
                            <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">日期</th>
                            <th className="px-8 py-4 text-left"><TableDropdownFilter field="customer" label="客户" /></th>
                            <th className="px-8 py-4 text-left"><TableDropdownFilter field="salesperson" label="销售员" /></th>
                            <th className="px-8 py-4 text-left"><TableDropdownFilter field="itemName" label={selectedModule === 'material' ? "物料代码" : "物料名称"} /></th>
                            <th className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">数量</th>
                            <th className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">单价</th>
                            <th className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">合计(CFA)</th>
                          </tr>
                       </thead>
                       <tbody className="bg-white divide-y divide-slate-50 text-[12px]">
                          {drillDownAnalysis.tableRecords.map((r, i) => (
                            <tr key={`${r.id}-${i}`} className="hover:bg-slate-50 transition-colors">
                               <td className="px-8 py-4 whitespace-nowrap font-mono font-bold text-indigo-600"><button onClick={() => onSelectOrderId(r.id)} className="hover:underline">{r.id}</button></td>
                               <td className="px-8 py-4 whitespace-nowrap font-bold text-slate-500">{r.date}</td>
                               <td className="px-8 py-4 whitespace-nowrap font-black text-slate-900">{r.customer}</td>
                               <td className="px-8 py-4 whitespace-nowrap font-bold text-slate-500">{r.salesperson}</td>
                               <td className="px-8 py-4 whitespace-nowrap font-black text-slate-700 truncate max-w-[150px]">{r.itemName}</td>
                               <td className="px-8 py-4 whitespace-nowrap text-right font-mono font-black text-indigo-700">{r.quantity}</td>
                               <td className="px-8 py-4 whitespace-nowrap text-right font-mono font-bold text-slate-400">{r.unitPrice.toLocaleString()}</td>
                               <td className="px-8 py-4 whitespace-nowrap text-right font-mono font-black text-slate-900">{r.totalAmount.toLocaleString()}</td>
                            </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* 财务风险穿透模态面板 (双模式：客户穿透 / 状态穿透) */}
      {debtAuditDetails && (
        <div className={`fixed inset-0 bg-white z-[6000] flex flex-col animate-in slide-in-from-right duration-500 overflow-hidden text-left border-l-[16px] border-${debtAuditDetails.themeColor}-500`}>
           <div className="px-12 py-10 border-b border-slate-200 bg-white flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-6">
                <div className={`w-20 h-20 bg-${debtAuditDetails.themeColor}-600 rounded-[28px] flex items-center justify-center text-white text-3xl shadow-2xl`}>
                  {debtAuditDetails.themeIcon}
                </div>
                <div>
                  <h3 className="text-4xl font-black text-slate-900 tracking-tight">
                    {debtAuditDetails.title} <span className={`text-${debtAuditDetails.themeColor}-600`}>| 风险核查穿透</span>
                  </h3>
                  <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest mt-2">实时三色预警核查系统 · 全量历史单据</p>
                </div>
              </div>
              <button 
                onClick={() => { setSelectedDebtCustomer(null); setSelectedAgingCategory(null); }} 
                className="px-16 py-5 bg-slate-900 text-white rounded-[24px] text-sm font-black hover:bg-slate-800 shadow-2xl transition-all"
              >
                关闭核查
              </button>
           </div>
           <div className="flex-1 overflow-y-auto custom-scrollbar p-12 bg-slate-50/50 space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm"><p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">未结清总敞口</p><p className={`text-3xl font-black text-${debtAuditDetails.themeColor}-600`}>{(debtAuditDetails.totalUnsettled ?? 0).toLocaleString()} CFA</p></div>
                <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm"><p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">核查单据总数</p><p className="text-3xl font-black text-slate-900">{debtAuditDetails.records.length} <span className="text-sm text-slate-400 font-bold">ALL TIME</span></p></div>
              </div>
              <div className="bg-white rounded-[44px] border border-slate-200 shadow-2xl overflow-hidden"><table className="min-w-full divide-y divide-slate-100 text-[13px]"><thead className="bg-slate-50"><tr><th className="px-10 py-5 text-left font-black text-slate-400">单号</th><th className="px-10 py-5 text-left font-black text-slate-400">到期日</th><th className="px-10 py-5 text-left font-black text-slate-400">客户名称</th><th className="px-10 py-5 text-right font-black text-slate-400">待结金额</th><th className="px-10 py-5 text-center font-black text-slate-400">状态分析</th></tr></thead><tbody className="divide-y divide-slate-50">
                {debtAuditDetails.records.map((r, i) => {
                  const unsettled = r.unsettledAmount ?? 0;
                  const today = new Date(); today.setHours(0,0,0,0);
                  const dueDate = r.dueDate ? new Date(r.dueDate) : today;
                  const diff = Math.ceil((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
                  
                  let statusNode;
                  if (unsettled <= 0) {
                     statusNode = <div className="flex items-center justify-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div><span className="text-[11px] font-bold text-slate-400">已结清</span></div>;
                  } else if (diff > 0) {
                     statusNode = <div className="flex items-center justify-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></div><span className="text-[11px] font-black text-rose-600">逾期 {diff} 天</span></div>;
                  } else {
                     const daysLeft = Math.abs(diff);
                     const isClose = daysLeft <= 7;
                     const dotColor = isClose ? 'bg-amber-400' : 'bg-emerald-500';
                     const textColor = isClose ? 'text-amber-600' : 'text-emerald-600';
                     statusNode = <div className="flex items-center justify-center gap-2"><div className={`w-2.5 h-2.5 rounded-full ${dotColor}`}></div><span className={`text-[11px] font-black ${textColor}`}>临期 {daysLeft} 天</span></div>;
                  }

                  return (<tr key={i} className="hover:bg-slate-50"><td className="px-10 py-5 font-mono font-black text-indigo-600"><button onClick={() => onSelectOrderId(r.id)} className="hover:underline">{r.id}</button></td><td className="px-10 py-5 font-bold text-slate-500">{r.dueDate}</td><td className="px-10 py-5 font-black text-slate-900">{r.customer}</td><td className={`px-10 py-5 text-right font-mono font-black ${unsettled > 0 ? 'text-rose-600' : 'text-slate-300'}`}>{(unsettled).toLocaleString()}</td><td className="px-10 py-5">{statusNode}</td></tr>);
                })}
              </tbody></table></div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;