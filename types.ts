
export interface SalesRecord {
  id: string; // 出库单号
  month: string; // 月份
  date: string; // 业务日期
  customer: string; // 客户
  salesperson: string; // 销售员
  category: string; // 品类 (建材快消中对应物料名称)
  itemName: string; // 物料名称 (建材快消中对应物料代码)
  quantity: number; // 数量
  unitPrice: number; // 单价
  totalAmount: number; // 价税合计
  // 新增财务字段
  settledAmount?: number; // 已结金额
  unsettledAmount?: number; // 未结金额
  dueDate?: string; // 到期日
  region?: string; // 地区
  customerCode?: string; // 客户编码
  remark?: string; // 备注
  // 建材快消模块 QRS 列新增字段
  salesOrderNo?: string; // 销售订单号 (Q列)
  pricingUnit?: string; // 计价单位 (R列)
  warehouse?: string; // 仓库 (S列)
}

export interface SalesSummary {
  totalSales: number;
  totalQuantity: number;
  orderCount: number;
  orderIds: string[]; // 具体的出库单号列表
  salesOrderCount?: number; // 销售订单总数
  salesOrderIds?: string[]; // 具体的销售订单号列表
  categoryDistribution: { name: string; value: number }[];
  categoryQuantityDistribution: { name: string; value: number }[];
  monthlyTrend: { name: string; sales: number; quantity: number }[];
}

export interface FilterState {
  months: string[];
  dateRange: [string, string];
  customers: string[];
  salespeople: string[];
  categories: string[];
  itemNames: string[];
  regions: string[];
  warehouses: string[]; // 仓库筛选
}

export interface InventoryColorRecord {
  color: string;
  availableQty: number;
  dailyStock: Record<string, number | null>;
}

export interface AggregatedInventoryItem {
  itemName: string;
  normalizedName: string;
  availableQty: number; // 所有颜色可用量合计
  dailyStock: Record<string, number | null>; // 日期(YYYY-MM-DD) -> 所有颜色当日库存合计
  colors: InventoryColorRecord[];
}

export interface PlasticInventoryDataset {
  dates: string[]; // D列往后的有效日期列(升序 YYYY-MM-DD)
  items: AggregatedInventoryItem[];
}

