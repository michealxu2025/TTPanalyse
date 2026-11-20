
import React, { useState, useEffect, useMemo } from 'react';
import { SalesRecord } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileDown, Loader2, Eye, Share2 } from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

interface OrderDetailModalProps {
  orderId: string;
  records: SalesRecord[];
  allRecords?: SalesRecord[];
  onSelectOrderId?: (id: string) => void;
  onClose: () => void;
}

const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1sL-g0IiPox4FymR4Qt8Ru1ErqXZXuZLRxfM-_1wOE9A/export?format=csv&gid=432782581';

// 动态加载并缓存中文字体模块
let fontLoadedPromise: Promise<string> | null = null;
const ensureChineseFont = async (docClass: any): Promise<string> => {
  if (!fontLoadedPromise) {
    fontLoadedPromise = (async () => {
      try {
        const res = await fetch('/jspdf-font.js');
        if (!res.ok) throw new Error('Failed to load /jspdf-font.js');
        const code = await res.text();
        const moduleObj: any = { exports: {} };
        const runner = new Function('module', 'exports', code);
        runner(moduleObj, moduleObj.exports);
        const initFont = moduleObj.exports.default || moduleObj.exports;
        if (typeof initFont === 'function') {
          return initFont(docClass.API, 'SongtiSCBlack') || 'SongtiSCBlack';
        }
        return 'SongtiSCBlack';
      } catch (err) {
        console.error('Error loading Chinese font for PDF:', err);
        return 'helvetica';
      }
    })();
  }
  return fontLoadedPromise;
};

const OrderDetailModal: React.FC<OrderDetailModalProps> = ({ orderId, records, allRecords, onSelectOrderId, onClose }) => {
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showQtyInPDF, setShowQtyInPDF] = useState(false);

  const totalAmount = records.reduce((sum, r) => sum + r.totalAmount, 0);
  const totalQuantity = records.reduce((sum, r) => sum + r.quantity, 0);

  const currentSalesOrderNo = records[0]?.salesOrderNo?.trim();
  const siblingOrderIds = useMemo(() => {
    if (!currentSalesOrderNo || !allRecords) return [];
    return Array.from(new Set(
      allRecords
        .filter(r => r.salesOrderNo && r.salesOrderNo.trim() === currentSalesOrderNo && r.id !== orderId)
        .map(r => r.id)
    )).sort();
  }, [currentSalesOrderNo, allRecords, orderId]);

  useEffect(() => {
    const fetchTranslations = async () => {
      try {
        const response = await fetch(SHEET_CSV_URL);
        const csvText = await response.text();
        const lines = csvText.split(/\r?\n/);
        const mapping: Record<string, string> = {};
        
        // Skip header, parse A (index 0) and B (index 1)
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line) continue;
          
          // Simple CSV parsing (handling quotes if necessary, though the sheet looks simple)
          const parts = line.split(',');
          if (parts.length >= 2) {
            const chineseName = parts[0].trim();
            const frenchName = parts[1].trim();
            mapping[chineseName] = frenchName;
          }
        }
        setTranslations(mapping);
      } catch (error) {
        console.error('Failed to fetch translations:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTranslations();
  }, []);

  const translateItem = (name: string) => {
    // Exact match first
    if (translations[name]) return translations[name];
    
    // Fallback: Try normalized match to be safe
    const normalize = (s: string) => s.trim().replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')');
    const normalizedInput = normalize(name);
    
    for (const key in translations) {
      if (normalize(key) === normalizedInput) {
        return translations[key];
      }
    }
    
    // Fallback: If Chinese font is loaded, keep the name even with Chinese characters
    return name || 'Unknown Item';
  };

  const generatePDF = async (mode: 'preview' | 'share') => {
    setIsGenerating(true);
    
    let newTab: Window | null = null;
    
    // 预览时预先打开新窗口 (所有设备都尝试新窗口，避免覆盖当前应用)
    if (mode === 'preview') {
      try {
        newTab = window.open('', '_blank');
        if (newTab) {
          newTab.document.write('<html><head><title>Loading Invoice...</title></head><body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; color: #666;">Loading invoice...</body></html>');
        }
      } catch (e) {
        console.warn('Could not write to new tab', e);
      }
    }

    try {
      // 预先确保中文字体已注册至 jsPDF.API
      const chineseFontName = await ensureChineseFont(jsPDF);

      const doc = new jsPDF();

      // 如果成功加载了中文字体，确保映射 normal 和 bold
      if (chineseFontName && chineseFontName !== 'helvetica') {
        try {
          doc.addFont(`${chineseFontName}-normal.ttf`, chineseFontName, 'bold');
          doc.setFont(chineseFontName, 'normal');
        } catch (fontErr) {
          console.warn('Could not set custom font weights:', fontErr);
        }
      }

      const activeFont = (chineseFontName && chineseFontName !== 'helvetica') ? chineseFontName : 'helvetica';

      const firstRecord = records[0];
      const displayCustomer = firstRecord.customer === '零售客户' ? 'Client du detail' : firstRecord.customer;

      // Title
      doc.setFont(activeFont, 'bold');
      doc.setFontSize(18);
      doc.setTextColor(0, 0, 0);
      doc.text('DEVIS', 105, 20, { align: 'center' });

      // Header Info Table Style
      const headerData: [string, string][] = [
        ['NOM DU CLIENT', displayCustomer],
        ['DATE COMMANDE', firstRecord.date]
      ];
      if (firstRecord.salesOrderNo) {
        headerData.push(['Numero de commande', firstRecord.salesOrderNo]);
      }
      headerData.push(['Bon de livraison', orderId]);
      if (firstRecord.remark) {
        headerData.push(['Note', firstRecord.remark]);
      }
      if (firstRecord.warehouse) {
        headerData.push(['ENTREPOT', firstRecord.warehouse]);
      }

      autoTable(doc, {
        startY: 30,
        body: headerData,
        theme: 'grid',
        styles: { font: activeFont, fontSize: 10, cellPadding: 2, textColor: 0, lineColor: 0 },
        columnStyles: {
          0: { cellWidth: 50, fontStyle: 'bold' },
          1: { cellWidth: 'auto' }
        }
      });

      // Main Table
      const tableData = records.map((r, index) => [
        (index + 1).toString(),
        translateItem(r.itemName),
        r.quantity.toLocaleString('en-US', { minimumFractionDigits: 2 }),
        r.pricingUnit || 'PCS',
        r.unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 }),
        r.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })
      ]);

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 0,
        head: [['NUMERO', 'SPECIFICATION', 'QUANTITE', 'UNITE', 'PRIX', 'TOTAL']],
        body: tableData,
        theme: 'grid',
        headStyles: { font: activeFont, fillColor: [255, 255, 255], textColor: 0, lineColor: 0, lineWidth: 0.1, halign: 'center' },
        styles: { font: activeFont, fontSize: 9, cellPadding: 3, textColor: 0, lineColor: 0, lineWidth: 0.1 },
        columnStyles: {
          0: { halign: 'center', cellWidth: 20 },
          1: { halign: 'left' },
          2: { halign: 'right' },
          3: { halign: 'center' },
          4: { halign: 'right' },
          5: { halign: 'right' }
        },
        foot: [
          [
            { content: 'GRAND TOTAL', colSpan: 2, styles: { halign: 'center', fontStyle: 'bold' } },
            { 
              content: showQtyInPDF ? totalQuantity.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '', 
              styles: { halign: 'right', fontStyle: 'bold' } 
            },
            { content: '', colSpan: 2 },
            { content: totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 }), styles: { halign: 'right', fontStyle: 'bold' } }
          ]
        ],
        footStyles: { font: activeFont, fillColor: [255, 255, 255], textColor: 0, lineColor: 0, lineWidth: 0.1 }
      });

      // Signatures
      const finalY = (doc as any).lastAutoTable.finalY + 0;
      autoTable(doc, {
        startY: finalY,
        head: [['Signature (vendeur)', 'Signature (client)']],
        body: [['\n\n\n', '\n\n\n']],
        theme: 'grid',
        headStyles: { font: activeFont, fillColor: [255, 255, 255], textColor: 0, lineColor: 0, lineWidth: 0.1, halign: 'center' },
        styles: { font: activeFont, cellPadding: 2, lineColor: 0, lineWidth: 0.1 },
        columnStyles: {
          0: { cellWidth: 91 },
          1: { cellWidth: 91 }
        }
      });

      // Page Number
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont(activeFont, 'normal');
        doc.setFontSize(10);
        doc.text(`${i}/${pageCount}`, 105, 285, { align: 'center' });
      }

      // Filename: Grand Total-CustomerName.pdf
      const safeCustomerName = displayCustomer.replace(/[/\\?%*:|"<>]/g, '-');
      const fileName = `${totalAmount.toFixed(2)}-${safeCustomerName}.pdf`;
      
      const pdfBlob = new Blob([doc.output('blob')], { type: 'application/pdf' });
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
      const storageRef = ref(storage, `invoices/${fileName}`);
      
      // Start upload in background
      const uploadTask = uploadBytes(storageRef, pdfBlob).then(() => getDownloadURL(storageRef));

      let sharedNatively = false;
      if (mode === 'share') {
        // Try native share first (bypasses browser PDF viewer and URL sharing)
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: fileName,
              text: ' '
            });
            sharedNatively = true;
          } catch (shareError) {
            console.log('Native share failed or cancelled:', shareError);
            // If cancelled or failed, fallback to preview
            if (!newTab || newTab.closed) {
               newTab = window.open('', '_blank');
               if (newTab) {
                 newTab.document.write('<html><head><title>Loading Invoice...</title></head><body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; color: #666;">Loading invoice...</body></html>');
               }
            }
          }
        } else {
          alert('当前浏览器不支持直接分享文件，将为您打开预览。');
          if (!newTab || newTab.closed) {
             newTab = window.open('', '_blank');
             if (newTab) {
               newTab.document.write('<html><head><title>Loading Invoice...</title></head><body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; color: #666;">Loading invoice...</body></html>');
             }
          }
        }
      }

      if (mode === 'preview' || !sharedNatively) {
        const downloadURL = await uploadTask;
        if (newTab && !newTab.closed) {
          newTab.location.href = downloadURL;
        } else {
          // Always try to open in a new tab first, regardless of device
          const opened = window.open(downloadURL, '_blank');
          if (!opened) {
            // If popup blocker prevented it, fallback to current window
            window.location.href = downloadURL;
          }
        }
      } else {
        // Ensure upload finishes even if shared natively
        await uploadTask;
      }
      
    } catch (error) {
      if (newTab) newTab.close();
      console.error('Error generating or uploading PDF:', error);
      alert('Failed to generate or upload PDF. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/80 backdrop-blur-md transition-opacity" 
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative bg-white w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] rounded-2xl sm:rounded-3xl shadow-[0_35px_60px_-15px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden animate-in zoom-in duration-250">
        {/* Header */}
        <div className="px-4 sm:px-8 py-4 sm:py-6 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white relative z-10 gap-4 sm:gap-0">
          <div className="flex-1 min-w-0 w-full">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="bg-indigo-600 text-white p-2 sm:p-3 rounded-xl sm:rounded-2xl shadow-xl shadow-indigo-100 flex-shrink-0">
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-1">
                  <h3 className="text-lg sm:text-2xl font-black text-slate-900 truncate tracking-tight">{orderId}</h3>
                  <span className="px-2 sm:px-3 py-0.5 sm:py-1 bg-indigo-100 text-indigo-800 text-[10px] sm:text-xs font-black rounded-full uppercase tracking-widest shadow-sm whitespace-nowrap">
                    {records.length} ITEMS
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1 sm:gap-2 text-xs sm:text-sm font-bold text-slate-600">
                  <span className="text-slate-400">日期:</span> <span className="text-slate-900">{records[0]?.date}</span>
                  <span className="mx-1 sm:mx-2 text-slate-300">|</span>
                  <span className="text-slate-400">客户:</span> <span className="text-slate-900 truncate max-w-[120px] sm:max-w-[150px]">{records[0]?.customer}</span>
                  <span className="mx-1 sm:mx-2 text-slate-300">|</span>
                  <span className="text-slate-400">销售:</span> <span className="text-slate-900 truncate max-w-[100px]">{records[0]?.salesperson}</span>
                  {currentSalesOrderNo && (
                    <>
                      <span className="mx-1 sm:mx-2 text-slate-300">|</span>
                      <span className="text-slate-400">销售订单号:</span> <span className="text-indigo-600 font-mono font-black">{currentSalesOrderNo}</span>
                    </>
                  )}
                  {records[0]?.warehouse && (
                    <>
                      <span className="mx-1 sm:mx-2 text-slate-300">|</span>
                      <span className="text-slate-400">发货仓库:</span> <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-bold text-xs">{records[0].warehouse}</span>
                    </>
                  )}
                </div>
                {siblingOrderIds.length > 0 && (
                  <div className="mt-2.5 p-2.5 bg-blue-50/90 rounded-xl border border-blue-200 flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-black text-blue-900 flex items-center gap-1">
                      <span>🔗</span> 同一销售单其他关联出库单 ({siblingOrderIds.length}):
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {siblingOrderIds.map(sid => (
                        <button
                          key={sid}
                          onClick={() => onSelectOrderId?.(sid)}
                          className="px-2.5 py-1 bg-white hover:bg-blue-600 hover:text-white border border-blue-300 text-blue-800 rounded-lg font-mono font-bold text-xs transition-colors cursor-pointer shadow-xs flex items-center gap-1"
                          title={`切换至关联出库单 ${sid}`}
                        >
                          <span>📑</span>
                          <span>{sid}</span>
                          <span className="text-[10px] opacity-70">↗</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {records[0]?.remark && (
                  <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">备注信息</div>
                    <p className="text-xs sm:text-sm font-bold text-slate-700 leading-relaxed whitespace-pre-wrap">{records[0].remark}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-end">
            <div className="flex items-center gap-2 mr-2">
              <input 
                type="checkbox" 
                id="showQtyCheckbox"
                checked={showQtyInPDF}
                onChange={(e) => setShowQtyInPDF(e.target.checked)}
                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
              />
              <label htmlFor="showQtyCheckbox" className="text-xs font-black text-slate-600 cursor-pointer whitespace-nowrap">
                PDF显示总数
              </label>
            </div>
            <button
              onClick={() => generatePDF('preview')}
              disabled={isGenerating || loading}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 bg-white border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm transition-all active:scale-95"
            >
              {loading ? (
                <Loader2 size={16} className="sm:w-[18px] sm:h-[18px] animate-spin" />
              ) : (
                <Eye size={16} className="sm:w-[18px] sm:h-[18px]" />
              )}
              {loading ? '加载中...' : '对账单预览'}
            </button>
            <button
              onClick={() => generatePDF('share')}
              disabled={isGenerating || loading}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm transition-all shadow-lg shadow-indigo-200 active:scale-95"
            >
              {isGenerating || loading ? (
                <Loader2 size={16} className="sm:w-[18px] sm:h-[18px] animate-spin" />
              ) : (
                <Share2 size={16} className="sm:w-[18px] sm:h-[18px]" />
              )}
              {isGenerating ? '处理中...' : loading ? '加载中...' : '分享'}
            </button>
            <button 
              onClick={onClose}
              className="p-2 sm:p-2.5 bg-slate-100 hover:bg-red-50 rounded-full sm:rounded-xl transition-all text-slate-500 hover:text-red-600 border border-transparent hover:border-red-100 group flex-shrink-0"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6 group-hover:rotate-90 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content Table */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-50/40 custom-scrollbar">
          <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 sm:px-6 py-3 sm:py-4 text-left text-[10px] sm:text-[11px] font-black text-slate-600 uppercase tracking-[0.2em] whitespace-nowrap">物料明细名称</th>
                  <th className="px-4 sm:px-6 py-3 sm:py-4 text-right text-[10px] sm:text-[11px] font-black text-slate-600 uppercase tracking-[0.2em] whitespace-nowrap">标准单价</th>
                  <th className="px-4 sm:px-6 py-3 sm:py-4 text-right text-[10px] sm:text-[11px] font-black text-slate-600 uppercase tracking-[0.2em] whitespace-nowrap">出库数量</th>
                  <th className="px-4 sm:px-6 py-3 sm:py-4 text-right text-[10px] sm:text-[11px] font-black text-slate-600 uppercase tracking-[0.2em] whitespace-nowrap">价税小计</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r, i) => (
                  <tr key={i} className="hover:bg-indigo-50/40 transition-colors group">
                    <td className="px-4 sm:px-6 py-3 sm:py-5 text-xs sm:text-sm font-black text-slate-900 min-w-[150px]">{r.itemName}</td>
                    <td className="px-4 sm:px-6 py-3 sm:py-5 text-xs sm:text-sm text-right font-mono font-bold text-slate-500 whitespace-nowrap">{r.unitPrice.toLocaleString()}</td>
                    <td className="px-4 sm:px-6 py-3 sm:py-5 text-xs sm:text-sm text-right font-mono font-black text-indigo-700 whitespace-nowrap">{r.quantity}</td>
                    <td className="px-4 sm:px-6 py-3 sm:py-5 text-xs sm:text-sm text-right font-mono font-black text-slate-900 group-hover:text-indigo-800 transition-colors whitespace-nowrap">{r.totalAmount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Summary */}
        <div className="px-4 sm:px-10 py-4 sm:py-8 border-t border-slate-200 bg-white flex flex-col sm:flex-row items-end sm:items-center justify-end gap-4 sm:gap-16 relative z-10">
          <div className="text-right w-full sm:w-auto flex sm:block justify-between items-center sm:items-end border-b sm:border-0 border-slate-100 pb-3 sm:pb-0">
            <p className="text-[10px] sm:text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] sm:tracking-[0.3em] sm:mb-2">Total Quantity</p>
            <p className="text-xl sm:text-3xl font-black text-slate-900 tracking-tighter">{totalQuantity.toLocaleString()} <span className="text-xs sm:text-sm font-bold text-slate-400">UNIT</span></p>
          </div>
          <div className="text-right w-full sm:w-auto flex sm:block justify-between items-center sm:items-end">
            <p className="text-[10px] sm:text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] sm:tracking-[0.3em] sm:mb-2">Grand Total (CFA)</p>
            <p className="text-2xl sm:text-4xl font-black text-indigo-600 tabular-nums tracking-tighter shadow-indigo-50">{totalAmount.toLocaleString()} <span className="text-sm sm:text-base font-bold text-indigo-400">CFA</span></p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderDetailModal;
