
import { SalesRecord } from './types';

// 生成模拟数据
const customers = ['阿里巴巴', '腾讯', '百度', '京东', '美团', '字节跳动', '华为', '小米'];
const salespeople = ['张三', '李四', '王五', '赵六', '钱七', '孙八'];
const categories = ['办公用品', '电子产品', '软件服务', '咨询费', '硬件设备'];
const items: Record<string, string[]> = {
  '办公用品': ['笔记本', '打印纸', '签字笔', '文件夹'],
  '电子产品': ['显示器', '键盘', '鼠标', '移动硬盘'],
  '软件服务': ['云服务器', 'SaaS订阅', '数据库授权'],
  '咨询费': ['战略咨询', '技术支持', 'IT架构设计'],
  '硬件设备': ['服务器集群', '网络交换机', '防火墙']
};

export const MOCK_SALES_DATA: SalesRecord[] = Array.from({ length: 150 }).map((_, i) => {
  const category = categories[Math.floor(Math.random() * categories.length)];
  const itemName = items[category][Math.floor(Math.random() * items[category].length)];
  const quantity = Math.floor(Math.random() * 50) + 1;
  const unitPrice = Math.floor(Math.random() * 2000) + 100;
  const totalAmount = quantity * unitPrice;
  const date = new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1);
  
  // 模拟财务数据：30% 概率有欠款
  const hasDebt = Math.random() < 0.3;
  const settledAmount = hasDebt ? Math.floor(totalAmount * (Math.random() * 0.8)) : totalAmount;
  const unsettledAmount = totalAmount - settledAmount;
  
  // 模拟到期日：业务日期后 30-60 天
  const dueDate = new Date(date);
  dueDate.setDate(dueDate.getDate() + 30 + Math.floor(Math.random() * 30));

  return {
    id: `CK-${2024000 + i}`,
    month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
    date: date.toISOString().split('T')[0],
    customer: customers[Math.floor(Math.random() * customers.length)],
    salesperson: salespeople[Math.floor(Math.random() * salespeople.length)],
    category,
    itemName,
    quantity,
    unitPrice,
    totalAmount,
    settledAmount,
    unsettledAmount,
    dueDate: dueDate.toISOString().split('T')[0]
  };
}).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
