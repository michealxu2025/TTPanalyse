
import { GoogleGenAI } from "@google/genai";
import { SalesSummary } from "../types";

export const getAIInsights = async (summary: SalesSummary) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    作为一名资深业务分析师，请根据以下销售数据摘要进行深入分析并提供3-5条行动建议。
    注意：所有金额单位均为 CFA (西非法郎)。
    
    数据摘要：
    - 总销售额: ${summary.totalSales.toLocaleString()} CFA
    - 总出库数量: ${summary.totalQuantity}
    - 出库单号总数: ${summary.orderCount}
    
    主要品类分布:
    ${summary.categoryDistribution.map(c => `${c.name}: ${c.value.toLocaleString()} CFA`).join(', ')}
    
    请使用中文回答，重点关注业绩瓶颈、增长机会和运营建议。
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini AI Error:", error);
    return "抱歉，AI 洞察生成失败，请检查网络连接或稍后再试。";
  }
};
