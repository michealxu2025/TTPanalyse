
import { SalesRecord, PlasticInventoryDataset, AggregatedInventoryItem, InventoryColorRecord } from '../types';

// 默认塑料模块内置谷歌表格配置
const DEFAULT_SHEET_ID = '190CYOeWCVB68eCOszi7VwADf3N3jHwN7msmI1jmgzlg';
const DEFAULT_GID = '1447308255';

// 塑料模块每日库存谷歌表格 ID
export const PLASTIC_INVENTORY_SHEET_ID = '1S1XQdjhhCx5oc2mErUW50Q0xGzRxCshNAXyokxf7DG8';

export const normalizeItemName = (name: string): string => {
  return (name || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .toLowerCase();
};

export const fetchSalesData = async (sheetId?: string, gid?: string): Promise<SalesRecord[]> => {
  const targetSheetId = sheetId || DEFAULT_SHEET_ID;
  const targetGid = gid || DEFAULT_GID;
  const csvUrl = `https://docs.google.com/spreadsheets/d/${targetSheetId}/gviz/tq?tqx=out:csv&gid=${targetGid}`;

  try {
    const response = await fetch(csvUrl);
    if (!response.ok) {
        throw new Error('表格连接受阻。请检查：1. 表格 ID 是否正确；2. 是否已设为“知道链接的任何人可查看”；3. 网络是否可访问 Google 域。');
    }
    const csvText = await response.text();
    if (csvText.includes('<!DOCTYPE html>')) {
        throw new Error('权限验证失败。Google 返回了登录页面，请确保表格已公开共享。');
    }
    return processCsvText(csvText);
  } catch (error) {
    console.error('Fetch Error:', error);
    throw error;
  }
};

/**
 * 标准化日期字符串为 YYYY-MM-DD
 * 处理 Google Sheets 可能导出的 2024/1/1, 2024/01/01 等多种格式
 */
const formatDateString = (dateStr: string): string => {
  if (!dateStr) return '';
  try {
    // 尝试处理斜杠替换为横杠
    const normalized = dateStr.trim().replace(/\//g, '-');
    // 优先匹配 YYYY-M-D 或 YYYY-MM-DD，避免时区偏移导致日期差一天
    const ymdMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (ymdMatch) {
      const y = ymdMatch[1];
      const m = ymdMatch[2].padStart(2, '0');
      const d = ymdMatch[3].padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    const date = new Date(normalized);
    
    // 检查日期是否有效
    if (isNaN(date.getTime())) {
      // 如果 Date 无法解析，尝试手动补零 (针对 YYYY-M-D)
      const parts = normalized.split('-');
      if (parts.length === 3) {
        const y = parts[0];
        const m = parts[1].padStart(2, '0');
        const d = parts[2].padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      return dateStr;
    }
    
    // 返回标准 YYYY-MM-DD
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  } catch (e) {
    return dateStr;
  }
};

/**
 * 健壮的数值解析器：
 * 彻底防止千分位符号 (如 1,500 或 1 500 或 1.500.000) 被误识别为小数点
 * 兼容标准英美格式 (1,500.00)、法式/欧式格式 (1.500,00 或 12,5) 以及包含空格与货币符号的情形
 */
export const parseNumeric = (val: any): number => {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  let str = String(val).trim().replace(/\s+/g, '').replace(/[$¥€£CFA]/gi, '');
  if (!str) return 0;

  // 1. 同时包含逗号和点：按最后出现的符号决定哪个是小数点
  if (str.includes(',') && str.includes('.')) {
    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');
    if (lastComma > lastDot) {
      // 如 "1.234.567,89" 或 "1.500,50" -> 点是千分符，逗号是小数
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // 如 "1,234,567.89" 或 "1,500.50" -> 逗号是千分符，点是小数
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    // 2. 只有逗号：
    const parts = str.split(',');
    if (parts.length > 2) {
      // 多个逗号：必为千分符，如 "1,000,000"
      str = str.replace(/,/g, '');
    } else if (parts.length === 2) {
      // 只有一个逗号：若逗号后恰好是3位数字（且前缀1-3位），通常是千分位 "1,500" -> 1500
      if (parts[1].length === 3 && parts[0].length >= 1 && parts[0].length <= 3) {
        str = parts[0] + parts[1];
      } else {
        // 否则视作法式/欧式小数，如 "12,5" -> 12.5
        str = str.replace(',', '.');
      }
    }
  } else if (str.includes('.')) {
    // 3. 只有点：
    const parts = str.split('.');
    if (parts.length > 2) {
      // 多个点：必为德式/西非德法式千分符，如 "1.000.000"
      str = str.replace(/\./g, '');
    }
    // 单个点默认保留标准浮点数如 12.50
  }

  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
};

/**
 * 通用 CSV 行解析器，支持引号内的换行符和逗号
 */
const parseCsvRows = (csvText: string): string[][] => {
  const result: string[][] = [];
  let currentField = '';
  let inQuotes = false;
  let currentRow: string[] = [];

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++; // 跳过双引号转义
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentField.trim());
        if (currentRow.length > 0) result.push(currentRow);
        currentRow = [];
        currentField = '';
        if (char === '\r') i++; // 处理 \r\n
      } else {
        currentField += char;
      }
    }
  }
  
  // 处理最后一行
  if (currentRow.length > 0 || currentField !== '') {
    currentRow.push(currentField.trim());
    result.push(currentRow);
  }

  return result;
};

/**
 * 解析 CSV 文本 - 增强版，支持引号内的换行符和逗号，防止列偏移
 */
export const processCsvText = (csvText: string): SalesRecord[] => {
  const result = parseCsvRows(csvText);
  const dataRows = result.slice(1); // 跳过表头
  return dataRows.map((cols, index) => {
    const rawDate = cols[2] || '';
    const standardizedDate = formatDateString(rawDate);
    const totalAmount = parseNumeric(cols[9]);
    
    // 解析新增的财务字段
    const settledAmount = cols[10] ? parseNumeric(cols[10]) : totalAmount;
    const unsettledAmount = cols[11] ? parseNumeric(cols[11]) : (totalAmount - settledAmount);
    const dueDateRaw = cols[12] || standardizedDate;
    const dueDate = formatDateString(dueDateRaw);

    return {
      id: cols[0] || `ID-${index}`,
      month: cols[1] || '',
      date: standardizedDate,
      customer: cols[3] || '',
      salesperson: cols[4] || '',
      category: cols[5] || '',
      itemName: cols[6] || '',
      quantity: parseNumeric(cols[7]),
      unitPrice: parseNumeric(cols[8]),
      totalAmount: totalAmount,
      settledAmount,
      unsettledAmount,
      dueDate,
      region: cols[13] || '',
      customerCode: cols[14] || '',
      remark: cols[15] || '',
      salesOrderNo: cols[16] ? cols[16].trim() : '',
      pricingUnit: cols[17] ? cols[17].trim() : '',
      warehouse: cols[18] ? cols[18].trim() : ''
    };
  });
};

/**
 * 拉取并解析塑料模块每日库存表格
 * 结构: A列=物料名称, B列=颜色, C列=可用量(当前库存), D列往后=对应日期的库存
 * 规则: 计算某物料数量时将所有颜色的数量相加
 */
export const fetchPlasticInventoryData = async (sheetId?: string): Promise<PlasticInventoryDataset> => {
  const targetSheetId = sheetId || PLASTIC_INVENTORY_SHEET_ID;
  const csvUrl = `https://docs.google.com/spreadsheets/d/${targetSheetId}/gviz/tq?tqx=out:csv`;

  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error('库存表连接失败，请确认库存表格已设为“知道链接的任何人可查看”。');
  }
  const csvText = await response.text();
  if (csvText.includes('<!DOCTYPE html>')) {
    throw new Error('库存表权限验证失败，请确保该 Google 表格已公开共享。');
  }

  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    return { dates: [], items: [] };
  }

  const headerRow = rows[0];
  // 解析 D 列 (index 3) 及之后的日期表头
  const dateColumns: { colIndex: number; date: string }[] = [];
  for (let colIdx = 3; colIdx < headerRow.length; colIdx++) {
    const rawHeader = (headerRow[colIdx] || '').trim();
    if (!rawHeader) continue;
    const formatted = formatDateString(rawHeader);
    if (/^\d{4}-\d{2}-\d{2}$/.test(formatted)) {
      dateColumns.push({ colIndex: colIdx, date: formatted });
    }
  }

  const uniqueDates = Array.from(new Set(dateColumns.map(d => d.date))).sort();

  // 按物料名称汇总所有颜色的数量
  const itemMap = new Map<string, {
    itemName: string;
    normalizedName: string;
    availableQty: number;
    dailyTotals: Record<string, number>;
    dailyHasValue: Record<string, boolean>;
    colors: InventoryColorRecord[];
  }>();

  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    const itemName = (cols[0] || '').trim();
    if (!itemName) continue;

    const color = (cols[1] || '').trim() || '默认';
    const availableQty = parseNumeric(cols[2]);
    const normalizedName = normalizeItemName(itemName);

    let entry = itemMap.get(normalizedName);
    if (!entry) {
      entry = {
        itemName,
        normalizedName,
        availableQty: 0,
        dailyTotals: {},
        dailyHasValue: {},
        colors: []
      };
      itemMap.set(normalizedName, entry);
    }

    entry.availableQty += availableQty;

    const colorDailyStock: Record<string, number | null> = {};
    for (const { colIndex, date } of dateColumns) {
      const rawCell = (cols[colIndex] ?? '').trim();
      if (rawCell !== '') {
        const val = parseNumeric(rawCell);
        colorDailyStock[date] = (colorDailyStock[date] ?? 0) + val;
        entry.dailyTotals[date] = (entry.dailyTotals[date] || 0) + val;
        entry.dailyHasValue[date] = true;
      } else if (!(date in colorDailyStock)) {
        colorDailyStock[date] = null;
      }
    }

    entry.colors.push({
      color,
      availableQty,
      dailyStock: colorDailyStock
    });
  }

  const items: AggregatedInventoryItem[] = Array.from(itemMap.values()).map(entry => {
    const dailyStock: Record<string, number | null> = {};
    for (const date of uniqueDates) {
      dailyStock[date] = entry.dailyHasValue[date] ? (entry.dailyTotals[date] || 0) : null;
    }
    return {
      itemName: entry.itemName,
      normalizedName: entry.normalizedName,
      availableQty: entry.availableQty,
      dailyStock,
      colors: entry.colors
    };
  });

  return {
    dates: uniqueDates,
    items
  };
};

/**
 * 处理 Excel 文件二进制数据
 */
export const processExcelBuffer = (buffer: ArrayBuffer): SalesRecord[] => {
  console.warn('Excel processing logic is a placeholder.');
  throw new Error('当前环境尚未启用 Excel 解析引擎，请将文件保存为 CSV 后再试。');
};

/**
 * 将本地数据同步到云端 (模拟实现)
 */
export const syncToCloud = async (data: SalesRecord[]): Promise<void> => {
  console.log('正在同步数据到 Google Sheets...', data.length, '条记录');
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log('同步模拟完成');
      resolve();
    }, 1500);
  });
};
