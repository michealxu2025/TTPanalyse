import React, { useState, useRef, useEffect, useMemo } from 'react';

interface MultiSelectProps {
  label: string;
  options: string[];
  counts?: Record<string, number>; 
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  enableYearGrouping?: boolean;
  primaryColor?: 'indigo' | 'emerald';
}

const getYearFromOption = (option: string): string => {
  const match = option.match(/(20\d\d)/) || option.match(/^(\d{4})/);
  return match ? `${match[1]}年` : '其他';
};

const MultiSelect: React.FC<MultiSelectProps> = ({ 
  label, 
  options, 
  counts, 
  selectedValues, 
  onChange, 
  placeholder,
  enableYearGrouping = false,
  primaryColor = 'indigo'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYearTab, setSelectedYearTab] = useState<string>('ALL');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  const colors = useMemo(() => {
    const isEmerald = primaryColor === 'emerald';
    return {
      activeBorder: isEmerald ? 'border-emerald-600' : 'border-indigo-600',
      hoverBorder: isEmerald ? 'hover:border-emerald-400' : 'hover:border-indigo-400',
      focusRing: isEmerald ? 'ring-emerald-50 border-emerald-600' : 'ring-indigo-50 border-indigo-600',
      arrowActive: isEmerald ? 'text-emerald-600' : 'text-indigo-600',
      selectedText: isEmerald ? 'text-emerald-900' : 'text-indigo-900',
      searchFocus: isEmerald ? 'focus:border-emerald-500 focus:ring-emerald-100' : 'focus:border-indigo-500 focus:ring-indigo-100',
      actionLink: isEmerald ? 'text-emerald-600 hover:text-emerald-800' : 'text-indigo-600 hover:text-indigo-800',
      itemSelectedBg: isEmerald ? 'bg-emerald-50/80 shadow-sm' : 'bg-indigo-50/80 shadow-sm',
      itemCheckboxSelected: isEmerald ? 'bg-emerald-600 border-emerald-600' : 'bg-indigo-600 border-indigo-600',
      itemCheckboxHover: isEmerald ? 'group-hover:border-emerald-400' : 'group-hover:border-indigo-400',
      itemTextSelected: isEmerald ? 'text-emerald-950 font-black' : 'text-indigo-950 font-black',
      itemTextHover: isEmerald ? 'group-hover:text-emerald-600' : 'group-hover:text-indigo-600',
      countBadgeSelected: isEmerald ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800',
      tabActive: isEmerald ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-200' : 'bg-indigo-600 text-white shadow-sm shadow-indigo-200',
      tabBadgeActive: isEmerald ? 'bg-emerald-700 text-emerald-100' : 'bg-indigo-700 text-indigo-100',
      tabBadgeInactive: isEmerald ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700',
      onlyBtn: isEmerald ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200' : 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border-indigo-200',
      onlyBtnActive: isEmerald ? 'bg-emerald-700 text-emerald-100 hover:bg-emerald-800 border-emerald-500' : 'bg-indigo-700 text-indigo-100 hover:bg-indigo-800 border-indigo-500',
      groupBadgeFull: isEmerald ? 'bg-emerald-100 text-emerald-800 font-black' : 'bg-indigo-100 text-indigo-800 font-black',
      groupBadgePartial: isEmerald ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold' : 'bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold',
      highlightBadge: isEmerald ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm',
      summaryCount: isEmerald ? 'text-emerald-600' : 'text-indigo-600',
    };
  }, [primaryColor]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
      setSelectedYearTab('ALL');
    }
  }, [isOpen]);

  // Extract all distinct years available in options
  const availableYears = useMemo(() => {
    if (!enableYearGrouping) return [];
    const yearsSet = new Set<string>();
    options.forEach(opt => {
      yearsSet.add(getYearFromOption(opt));
    });
    return Array.from(yearsSet).sort((a, b) => {
      if (a === '其他') return 1;
      if (b === '其他') return -1;
      return b.localeCompare(a, undefined, { numeric: true });
    });
  }, [options, enableYearGrouping]);

  // Filter options based on search term and selected year tab
  const filteredOptions = useMemo(() => {
    return options.filter(opt => {
      const matchesSearch = opt.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;
      if (enableYearGrouping && selectedYearTab !== 'ALL') {
        return getYearFromOption(opt) === selectedYearTab;
      }
      return true;
    });
  }, [options, searchTerm, enableYearGrouping, selectedYearTab]);

  // Group filtered options by Year
  const groupedFilteredOptions = useMemo(() => {
    if (!enableYearGrouping) return null;
    const groups: Record<string, string[]> = {};
    availableYears.forEach(year => {
      groups[year] = [];
    });
    filteredOptions.forEach(opt => {
      const year = getYearFromOption(opt);
      if (!groups[year]) groups[year] = [];
      groups[year].push(opt);
    });
    return groups;
  }, [filteredOptions, enableYearGrouping, availableYears]);

  const toggleOption = (option: string) => {
    const newValues = selectedValues.includes(option)
      ? selectedValues.filter(v => v !== option)
      : [...selectedValues, option];
    onChange(newValues);
  };

  const toggleAllFiltered = () => {
    const filteredAndNotSelected = filteredOptions.filter(opt => !selectedValues.includes(opt));
    if (filteredAndNotSelected.length > 0) {
      onChange(Array.from(new Set([...selectedValues, ...filteredOptions])));
    } else {
      onChange(selectedValues.filter(v => !filteredOptions.includes(v)));
    }
  };

  // Select ONLY a specific year: clear any other selections and select all months in targetYear
  const selectOnlyYear = (targetYear: string) => {
    const yearOptions = options.filter(opt => getYearFromOption(opt) === targetYear);
    onChange(yearOptions);
  };

  // Add all months of a year to selection
  const selectAllInYear = (targetYear: string) => {
    const yearOptions = options.filter(opt => getYearFromOption(opt) === targetYear);
    onChange(Array.from(new Set([...selectedValues, ...yearOptions])));
  };

  // Remove all months of a year from selection
  const deselectAllInYear = (targetYear: string) => {
    const yearOptions = options.filter(opt => getYearFromOption(opt) === targetYear);
    onChange(selectedValues.filter(v => !yearOptions.includes(v)));
  };

  const toggleGroupCollapse = (groupName: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  };

  const displayText = useMemo(() => {
    if (selectedValues.length === 0) return placeholder || `选择${label}`;
    if (selectedValues.length === options.length && options.length > 0) return '全部选项';

    if (enableYearGrouping && availableYears.length > 0) {
      const yearsInSelection = Array.from(new Set(selectedValues.map(v => getYearFromOption(v))));
      if (yearsInSelection.length === 1) {
        const singleYear = yearsInSelection[0];
        const allYearOptions = options.filter(o => getYearFromOption(o) === singleYear);
        if (allYearOptions.length > 0 && selectedValues.length === allYearOptions.length) {
          return `${singleYear} (全年)`;
        }
        if (selectedValues.length <= 2) {
          return selectedValues.join(', ');
        }
        return `${singleYear} (已选 ${selectedValues.length} 个月)`;
      }
    }

    if (selectedValues.length <= 2) return selectedValues.join(', ');
    return `已选 ${selectedValues.length} 项`;
  }, [selectedValues, options, label, placeholder, enableYearGrouping, availableYears]);

  return (
    <div className={`relative ${isOpen ? 'z-[200]' : 'z-10'}`} ref={containerRef}>
      <label className="block text-xs font-black text-slate-500 mb-1.5 uppercase tracking-wider">{label}</label>
      
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between bg-white border-2 rounded-xl px-4 py-2.5 text-sm transition-all ${colors.hoverBorder} ${isOpen ? `ring-4 ${colors.focusRing} shadow-sm` : 'border-slate-200'}`}
      >
        <span className={`truncate mr-2 font-bold ${selectedValues.length > 0 ? colors.selectedText : 'text-slate-500'}`}>
          {displayText}
        </span>
        <svg className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${isOpen ? `rotate-180 ${colors.arrowActive}` : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          {/* Mobile Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[140] sm:hidden animate-in fade-in duration-200"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
          />
          
          {/* Dropdown / Bottom Sheet */}
          <div className="fixed inset-x-0 bottom-0 sm:absolute sm:inset-auto sm:top-full sm:mt-2 z-[150] w-full sm:min-w-[340px] sm:w-[380px] bg-white border-t sm:border border-slate-200 rounded-t-3xl sm:rounded-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] sm:shadow-2xl overflow-hidden animate-in slide-in-from-bottom-full sm:slide-in-from-top-2 sm:fade-in sm:zoom-in duration-250 sm:duration-150 sm:origin-top flex flex-col max-h-[85vh] sm:max-h-[520px]">
            
            {/* Header Area */}
            <div className="p-4 sm:p-3.5 border-b border-slate-100 bg-slate-50/80">
              {/* Mobile Drag Handle */}
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden" />
              
              {/* Search Bar */}
              <div className="relative mb-2.5">
                <input 
                  type="text"
                  autoFocus
                  placeholder={`搜索${label}...`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-base sm:text-xs outline-none ${colors.searchFocus} transition-all font-bold placeholder:text-slate-400`}
                />
                <svg className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchTerm && (
                  <button 
                    type="button" 
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Year Quick-Filter Tabs/Chips (Scheme 1 feature) */}
              {enableYearGrouping && availableYears.length > 1 && (
                <div className="mb-2.5 pb-2 border-b border-slate-200/70">
                  <div className="flex items-center justify-between mb-1.5 px-0.5">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <span>📅</span> 年份快捷筛选
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      支持一键仅选单年
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                    {/* All Years Tab */}
                    <button
                      type="button"
                      onClick={() => setSelectedYearTab('ALL')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black shrink-0 transition-all ${
                        selectedYearTab === 'ALL'
                          ? colors.tabActive
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      全部年份
                    </button>

                    {/* Each Year Tab with Quick '仅选' action */}
                    {availableYears.map(year => {
                      const yearOpts = options.filter(o => getYearFromOption(o) === year);
                      const selCount = yearOpts.filter(o => selectedValues.includes(o)).length;
                      const isCurrentTab = selectedYearTab === year;
                      const isAllYearSelected = yearOpts.length > 0 && selCount === yearOpts.length;

                      return (
                        <div key={year} className="inline-flex rounded-lg shrink-0 shadow-xs border border-slate-200 overflow-hidden">
                          {/* Tab switch button */}
                          <button
                            type="button"
                            onClick={() => setSelectedYearTab(year)}
                            className={`px-2.5 py-1.5 text-xs font-black transition-all flex items-center gap-1.5 ${
                              isCurrentTab
                                ? colors.tabActive
                                : 'bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span>{year}</span>
                            {selCount > 0 && (
                              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-black ${
                                isCurrentTab 
                                  ? colors.tabBadgeActive 
                                  : isAllYearSelected
                                    ? colors.tabBadgeInactive
                                    : 'bg-slate-100 text-slate-700'
                              }`}>
                                {selCount}/{yearOpts.length}
                              </span>
                            )}
                          </button>

                          {/* Quick '仅选' button: 1-click select all months of this year */}
                          <button
                            type="button"
                            title={`一键仅选 ${year}（清除其他年份）`}
                            onClick={(e) => {
                              e.stopPropagation();
                              selectOnlyYear(year);
                            }}
                            className={`px-2 py-1.5 border-l text-[10px] font-black transition-all flex items-center gap-0.5 ${
                              isCurrentTab
                                ? colors.onlyBtnActive
                                : `${colors.onlyBtn} border-slate-200`
                            }`}
                          >
                            <span className="text-[9px]">⚡</span>仅选
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            
              {/* Batch Action Bar */}
              <div className="flex justify-between items-center px-1">
                <div className="flex items-center gap-2">
                  <button 
                    type="button" 
                    onClick={toggleAllFiltered}
                    className={`text-xs font-black ${colors.actionLink}`}
                  >
                    {filteredOptions.length > 0 && filteredOptions.every(opt => selectedValues.includes(opt)) ? '全不选当前结果' : '全选当前结果'}
                  </button>
                  
                  {enableYearGrouping && selectedYearTab !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => selectOnlyYear(selectedYearTab)}
                      className={`text-[11px] font-black px-2 py-0.5 rounded-md ${colors.highlightBadge}`}
                    >
                      ⚡ 一键仅选 {selectedYearTab}
                    </button>
                  )}
                </div>

                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {filteredOptions.length} 个结果
                </span>
              </div>
            </div>

            {/* List Body Area */}
            <div className="flex-1 overflow-y-auto p-2 sm:p-2.5 custom-scrollbar bg-slate-50/30">
              {enableYearGrouping && groupedFilteredOptions ? (
                // Grouped by Year View
                availableYears.map(year => {
                  const itemsInYear = groupedFilteredOptions[year] || [];
                  if (itemsInYear.length === 0) return null;

                  const allYearOptions = options.filter(o => getYearFromOption(o) === year);
                  const selectedInYear = allYearOptions.filter(o => selectedValues.includes(o)).length;
                  const isAllSelected = allYearOptions.length > 0 && selectedInYear === allYearOptions.length;
                  const isPartiallySelected = selectedInYear > 0 && !isAllSelected;
                  const isCollapsed = Boolean(collapsedGroups[year]);

                  return (
                    <div key={year} className="mb-3 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                      {/* Year Group Header */}
                      <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between select-none">
                        <div 
                          className="flex items-center gap-2 cursor-pointer min-w-0"
                          onClick={() => toggleGroupCollapse(year)}
                        >
                          <svg 
                            className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isCollapsed ? '-rotate-90' : 'rotate-0'}`} 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                          </svg>

                          <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                            <span>📅</span> {year}
                          </span>

                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            isAllSelected 
                              ? colors.groupBadgeFull 
                              : isPartiallySelected 
                                ? colors.groupBadgePartial 
                                : 'bg-slate-200/80 text-slate-500 font-bold'
                          }`}>
                            {selectedInYear}/{allYearOptions.length}
                          </span>
                        </div>

                        {/* Quick action buttons on Group Header */}
                        <div className="flex items-center gap-1 text-[11px] font-bold">
                          <button
                            type="button"
                            title={`仅勾选 ${year} 的月份，清除其他所有年份`}
                            onClick={(e) => {
                              e.stopPropagation();
                              selectOnlyYear(year);
                            }}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-black transition-all ${colors.highlightBadge}`}
                          >
                            ⚡ 仅选本年
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isAllSelected) {
                                deselectAllInYear(year);
                              } else {
                                selectAllInYear(year);
                              }
                            }}
                            className="px-1.5 py-0.5 rounded-md text-[10px] font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 transition-all"
                          >
                            {isAllSelected ? '取消' : '全选'}
                          </button>
                        </div>
                      </div>

                      {/* Month rows inside this year */}
                      {!isCollapsed && (
                        <div className="p-1">
                          {itemsInYear.map(option => {
                            const isSelected = selectedValues.includes(option);
                            const count = counts ? (counts[option] || 0) : null;

                            return (
                              <div 
                                key={option} 
                                onClick={() => toggleOption(option)}
                                className={`flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition-all group mb-0.5 ${
                                  isSelected ? colors.itemSelectedBg : 'hover:bg-slate-50'
                                }`}
                              >
                                <div className="flex items-center min-w-0">
                                  <div className={`w-4.5 h-4.5 border-2 rounded-md mr-2.5 flex items-center justify-center transition-all ${
                                    isSelected 
                                      ? colors.itemCheckboxSelected 
                                      : `border-slate-300 bg-white ${colors.itemCheckboxHover}`
                                  }`}>
                                    {isSelected && (
                                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </div>
                                  <span className={`text-xs truncate font-bold ${
                                    isSelected ? colors.itemTextSelected : `text-slate-700 ${colors.itemTextHover}`
                                  }`}>
                                    {option}
                                  </span>
                                </div>
                                {count !== null && (
                                  <span className={`text-[10px] ml-2 px-1.5 py-0.5 rounded-md font-mono font-black ${
                                    isSelected ? colors.countBadgeSelected : 'bg-slate-100 text-slate-500'
                                  }`}>
                                    {count}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                // Flat standard list (when enableYearGrouping is false)
                filteredOptions.map(option => {
                  const isSelected = selectedValues.includes(option);
                  const count = counts ? (counts[option] || 0) : null;
                  
                  return (
                    <div 
                      key={option} 
                      onClick={() => toggleOption(option)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all group mb-0.5 ${
                        isSelected ? colors.itemSelectedBg : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center min-w-0">
                        <div className={`w-5 h-5 border-2 rounded-md mr-3 flex items-center justify-center transition-all ${
                          isSelected ? colors.itemCheckboxSelected : `border-slate-300 bg-white ${colors.itemCheckboxHover}`
                        }`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className={`text-sm truncate font-bold ${
                          isSelected ? colors.itemTextSelected : `text-slate-700 ${colors.itemTextHover}`
                        }`}>
                          {option}
                        </span>
                      </div>
                      {count !== null && (
                        <span className={`text-[11px] ml-2 px-2 py-0.5 rounded-lg font-mono font-black ${
                          isSelected ? colors.countBadgeSelected : 'bg-slate-100 text-slate-500'
                        }`}>
                          {count}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
              
              {filteredOptions.length === 0 && (
                <div className="py-12 text-center text-xs text-slate-400 font-bold italic">
                  未匹配到任何选项
                </div>
              )}
            </div>
            
            {/* Footer Area */}
            <div className="px-4 py-3 sm:py-2.5 pb-8 sm:pb-2.5 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-600 font-bold flex justify-between items-center">
               <span>已选: <span className={`${colors.summaryCount} font-black`}>{selectedValues.length}</span> 项</span>
               {selectedValues.length > 0 && (
                 <button 
                  type="button" 
                  onClick={() => onChange([])}
                  className="text-red-500 hover:text-red-700 font-black uppercase tracking-tighter"
                 >
                  清空全部已选
                 </button>
               )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MultiSelect;
