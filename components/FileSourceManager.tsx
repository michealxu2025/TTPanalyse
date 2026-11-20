
import React, { useRef, useState } from 'react';
import { processCsvText, processExcelBuffer, syncToCloud } from '../services/dataService';
import { SalesRecord } from '../types';

interface FileSourceManagerProps {
  sourceType: 'cloud' | 'local';
  localFileName: string | null;
  localData: SalesRecord[];
  onSourceChange: (type: 'cloud' | 'local') => void;
  onFileUpload: (data: SalesRecord[], fileName: string) => void;
  onRefreshCloud: () => void;
}

const FileSourceManager: React.FC<FileSourceManagerProps> = ({ 
  sourceType, 
  localFileName, 
  localData,
  onSourceChange, 
  onFileUpload,
  onRefreshCloud 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const name = file.name.toLowerCase();
    const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        let data: SalesRecord[] = [];
        if (isExcel) {
          data = processExcelBuffer(event.target?.result as ArrayBuffer);
        } else {
          data = processCsvText(event.target?.result as string);
        }
        
        if (data.length === 0) throw new Error('文件中未检测到有效记录');
        onFileUpload(data, file.name);
        setSyncDone(false);
      } catch (err) {
        alert(`解析失败: ${err instanceof Error ? err.message : '未知错误'}`);
      }
    };

    if (isExcel) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncToCloud(localData);
      setSyncDone(true);
      setTimeout(() => setIsSyncing(false), 2000);
    } catch (err) {
      alert('同步失败，请检查网络');
      setIsSyncing(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-8 relative overflow-hidden">
      {isSyncing && (
        <div className="absolute inset-0 z-50 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-300">
           {!syncDone ? (
             <>
               <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
               <p className="text-sm font-bold text-slate-700">正在同步至 Google 表格并进行数据清洗...</p>
             </>
           ) : (
             <>
               <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-3 animate-bounce">
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
               </div>
               <p className="text-sm font-bold text-green-700">同步成功！请切换回云端模式查看</p>
             </>
           )}
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
            <span className="w-1.5 h-4 bg-indigo-600 rounded-full"></span>
            数据源管理器
          </h2>
          <div className="flex p-1 bg-slate-100 rounded-xl">
            <button 
              onClick={() => onSourceChange('cloud')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${sourceType === 'cloud' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-indigo-400'}`}
            >
              🌐 实时云端
            </button>
            <button 
              onClick={() => onSourceChange('local')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${sourceType === 'local' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500 hover:text-emerald-400'}`}
            >
              📁 本地文件
            </button>
          </div>
        </div>

        <div className="flex-1 w-full md:w-auto">
          {sourceType === 'cloud' ? (
            <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-100 text-lg">G</div>
                <div>
                  <p className="text-xs font-bold text-indigo-900">Google Sheets 连接中</p>
                  <p className="text-[10px] text-indigo-400">实时拉取并同步最新记录</p>
                </div>
              </div>
              <button onClick={onRefreshCloud} className="text-xs font-bold text-indigo-600 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">强制刷新</button>
            </div>
          ) : (
            <div className="flex gap-4 items-center">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 group cursor-pointer border-2 border-dashed border-emerald-200 bg-emerald-50/20 hover:bg-emerald-50 hover:border-emerald-400 p-4 rounded-xl transition-all flex items-center justify-between"
              >
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".csv, .xlsx, .xls" className="hidden" />
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-emerald-900 truncate max-w-[150px]">{localFileName || '选择 Excel/CSV 文件'}</p>
                    <p className="text-[10px] text-emerald-400">点击浏览本地文件并分析</p>
                  </div>
                </div>
              </div>
              {localData.length > 0 && (
                <button 
                  onClick={handleSync}
                  className="bg-indigo-600 text-white p-4 rounded-xl font-bold flex flex-col items-center gap-1 hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                  <span className="text-[10px]">同步云端</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FileSourceManager;
