
import React, { useState, useMemo, useRef } from 'react';
import { BOX_SIZES, CONTAINER_CAPACITIES } from './constants';
import { UserInputs, CalculationResult, SummaryData } from './types';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

type ViewMode = 'seller' | 'customer';

const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('seller');
  const tableRef = useRef<HTMLDivElement>(null);
  const [inputs, setInputs] = useState<UserInputs>({
    containerType: '40',
    mixPercents: {
      small: 20,
      medium: 40,
      large: 40,
    },
    shippingCostUSD: 7500,
    targetMargin: 40,
    exchangeRate: 3.2,
  });

  // Column visibility configuration
  const columnConfig = {
    // Fixed columns (always visible)
    size: { visible: true, internal: false },
    dimensions: { visible: true, internal: false },
    internalDimensions: { visible: true, internal: false },
    masterCBM: { visible: true, internal: false },
    unitsPerCarton: { visible: true, internal: false },
    factoryPrice: { visible: true, internal: true }, // Only seller
    // Dynamic columns
    totalUnits: { visible: true, internal: false },
    shippingPerUnit: { visible: true, internal: true }, // Only seller
    relativeShippingTotal: { visible: true, internal: true }, // Only seller
    priceUSD: { visible: true, internal: false },
    priceILS: { visible: true, internal: false },
    totalProfit: { visible: true, internal: true }, // Only seller
    marginPercent: { visible: true, internal: true }, // Only seller
  };

  const handleMixChange = (key: keyof UserInputs['mixPercents'], value: string) => {
    const numValue = parseFloat(value) || 0;
    setInputs(prev => ({
      ...prev,
      mixPercents: {
        ...prev.mixPercents,
        [key]: numValue,
      },
      quantities: undefined, // Clear quantities when using percentages
    }));
  };

  const handleQuantityChange = (key: keyof NonNullable<UserInputs['quantities']>, value: string) => {
    const numValue = parseFloat(value) || 0;
    setInputs(prev => {
      const newQuantities = {
        ...prev.quantities || { small: 0, medium: 0, large: 0 },
        [key]: numValue,
      };
      
      // Calculate percentages from quantities based on CBM
      const totalCBM = CONTAINER_CAPACITIES[prev.containerType];
      const totalCBMUsed = BOX_SIZES.reduce((sum, size) => {
        const qty = newQuantities[size.id as keyof typeof newQuantities] || 0;
        const cartons = Math.ceil(qty / size.unitsPerCarton);
        return sum + (cartons * size.masterCBM);
      }, 0);
      
      const newMixPercents = BOX_SIZES.reduce((acc, size) => {
        const qty = newQuantities[size.id as keyof typeof newQuantities] || 0;
        const cartons = Math.ceil(qty / size.unitsPerCarton);
        const cbmUsed = cartons * size.masterCBM;
        // Calculate percentage based on total container CBM
        acc[size.id as keyof typeof acc] = totalCBM > 0 ? (cbmUsed / totalCBM) * 100 : 0;
        return acc;
      }, { small: 0, medium: 0, large: 0 } as UserInputs['mixPercents']);
      
      return {
        ...prev,
        quantities: newQuantities,
        mixPercents: newMixPercents,
      };
    });
  };

  const results = useMemo(() => {
    const totalCBM = CONTAINER_CAPACITIES[inputs.containerType];
    
    // Step 1: Preliminary calculations for each size to get total units
    const preliminaryCalculations = BOX_SIZES.map(size => {
      let totalUnits = 0;
      let allocatedCBM = 0;
      let cartons = 0;
      
      // If quantities are provided, use them directly
      if (inputs.quantities && Object.values(inputs.quantities).some(q => q > 0)) {
        totalUnits = inputs.quantities[size.id as keyof NonNullable<UserInputs['quantities']>] || 0;
        cartons = Math.ceil(totalUnits / size.unitsPerCarton);
        allocatedCBM = cartons * size.masterCBM;
      } else {
        // Otherwise, use percentages
        const mixPercent = inputs.mixPercents[size.id as keyof UserInputs['mixPercents']];
        allocatedCBM = totalCBM * (mixPercent / 100);
        cartons = Math.floor(allocatedCBM / size.masterCBM);
        totalUnits = cartons * size.unitsPerCarton;
        allocatedCBM = cartons * size.masterCBM;
      }
      
      return { size, allocatedCBM, cartons, totalUnits, actualCBM: allocatedCBM };
    });

    const sumAllUnits = preliminaryCalculations.reduce((acc, curr) => acc + curr.totalUnits, 0);
    const shippingPerUnit = sumAllUnits > 0 ? inputs.shippingCostUSD / sumAllUnits : 0;

    // Step 2: Final calculations
    return preliminaryCalculations.map(pre => {
      const { size, totalUnits, actualCBM } = pre;
      
      const landingCostUSD = size.factoryPriceUSD + shippingPerUnit;
      const landingCostILS = landingCostUSD * inputs.exchangeRate;
      
      const marginFactor = 1 - (inputs.targetMargin / 100);
      const priceUSD = marginFactor > 0 ? landingCostUSD / marginFactor : 0;
      const priceILS = priceUSD * inputs.exchangeRate;
      
      const totalProfitILS = (priceILS - landingCostILS) * totalUnits;
      const relativeShippingTotal = totalUnits * shippingPerUnit;

      return {
        size,
        allocatedCBM: actualCBM,
        cartons: pre.cartons,
        totalUnits,
        shippingPerUnit,
        relativeShippingTotal,
        priceUSD,
        priceILS,
        landingCostILS,
        totalProfitILS
      } as CalculationResult;
    });
  }, [inputs]);

  const summary = useMemo((): SummaryData => {
    // Fixed: Added explicit generic type to results.reduce to ensure 'acc' and 'curr' have correct types.
    return results.reduce<SummaryData>((acc, curr) => ({
      totalUnits: acc.totalUnits + curr.totalUnits,
      totalCBMUtilized: acc.totalCBMUtilized + curr.allocatedCBM,
      totalInvestmentUSD: acc.totalInvestmentUSD + (curr.totalUnits * curr.size.factoryPriceUSD),
      totalProfitILS: acc.totalProfitILS + curr.totalProfitILS
    }), {
      totalUnits: 0,
      totalCBMUtilized: 0,
      totalInvestmentUSD: inputs.shippingCostUSD, // Start with shipping cost
      totalProfitILS: 0
    });
  }, [results, inputs.shippingCostUSD]);

  const totalPercents = Object.values(inputs.mixPercents).reduce((a, b) => a + b, 0);

  // Check if column should be visible
  const isColumnVisible = (columnKey: keyof typeof columnConfig) => {
    const config = columnConfig[columnKey];
    if (!config.visible) return false;
    if (viewMode === 'seller') return true;
    return !config.internal; // Hide internal columns in customer view
  };

  // Export to PDF
  const exportToPDF = async () => {
    if (!tableRef.current) return;

    try {
      // Create a temporary container for PDF content
      const pdfContainer = document.createElement('div');
      pdfContainer.style.position = 'absolute';
      pdfContainer.style.left = '-9999px';
      pdfContainer.style.width = '1200px';
      pdfContainer.style.backgroundColor = 'white';
      pdfContainer.style.padding = '20px';
      pdfContainer.style.fontFamily = 'Heebo, Arial, sans-serif';
      pdfContainer.dir = 'rtl';
      document.body.appendChild(pdfContainer);

      // Add header
      const header = document.createElement('div');
      header.style.textAlign = 'center';
      header.style.marginBottom = '20px';
      header.innerHTML = `
        <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 10px;">הצעת מחיר - קופסאות כובעים</h1>
        <div style="font-size: 14px; color: #666;">
          <span>סוג מכולה: ${inputs.containerType === '20' ? '20 (24 CBM)' : '40 (64 CBM)'}</span>
          <span style="margin: 0 20px;">|</span>
          <span>תאריך: ${new Date().toLocaleDateString('he-IL')}</span>
          ${viewMode === 'customer' ? '<div style="margin-top: 10px; color: #888;">(מצג לקוח)</div>' : ''}
        </div>
      `;
      pdfContainer.appendChild(header);

      // Clone the table
      const tableClone = tableRef.current.cloneNode(true) as HTMLElement;
      tableClone.style.width = '100%';
      pdfContainer.appendChild(tableClone);

      // Add summary
      const summaryDiv = document.createElement('div');
      summaryDiv.style.marginTop = '30px';
      summaryDiv.style.padding = '15px';
      summaryDiv.style.backgroundColor = '#f8f9fa';
      summaryDiv.style.borderRadius = '5px';
      summaryDiv.innerHTML = `
        <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">סיכום:</h3>
        <div style="font-size: 14px; line-height: 1.8;">
          <div>סך יחידות: ${summary.totalUnits.toLocaleString()}</div>
          <div>נפח מנוצל: ${summary.totalCBMUtilized.toFixed(2)} / ${CONTAINER_CAPACITIES[inputs.containerType]} CBM</div>
          ${viewMode === 'seller' ? `
            <div>סך השקעה: $${summary.totalInvestmentUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            <div>רווח צפוי: ₪${summary.totalProfitILS.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          ` : ''}
        </div>
      `;
      pdfContainer.appendChild(summaryDiv);

      // Convert to canvas
      const canvas = await html2canvas(pdfContainer, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      // Remove temporary container
      document.body.removeChild(pdfContainer);

      // Create PDF
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('l', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      const imgY = 0;

      pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio);

      const modeSuffix = viewMode === 'customer' ? '_לקוח' : '_מוכר';
      pdf.save(`הצעת_מחיר_${new Date().toISOString().split('T')[0]}${modeSuffix}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('שגיאה ביצירת PDF. נסה שוב.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6 md:mb-10 text-center px-2">
          <div className="inline-block bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl shadow-lg mb-4 w-full sm:w-auto">
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-1 md:mb-2">
              מחשבון לוגיסטיקה ותמחור
            </h1>
            <p className="text-sm md:text-base lg:text-lg opacity-90">קופסאות כובעים - ניהול מלאי ורווחיות</p>
          </div>
        </header>

        {/* User Input Section */}
        <div className="bg-white shadow-lg rounded-xl p-6 mb-8 border border-gray-200">
          <h2 className="text-xl font-bold mb-6 text-slate-800 border-b-2 border-blue-200 pb-3 flex items-center gap-2">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            נתוני הזמנה
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            
            {/* Container Selection */}
            <div className="md:col-span-1 lg:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">סוג מכולה</label>
              <select 
                value={inputs.containerType}
                onChange={(e) => setInputs(prev => ({ ...prev, containerType: e.target.value as '20' | '40' }))}
                className="w-full border-gray-300 border rounded-md p-2.5 md:p-2 focus:ring-blue-500 focus:border-blue-500 text-base md:text-sm"
              >
                <option value="20">מכולה 20 (24 CBM)</option>
                <option value="40">מכולה 40 (64 CBM)</option>
              </select>
            </div>

            {/* Volume Mix */}
            <div className="md:col-span-2 lg:col-span-2 bg-slate-50 p-3 md:p-4 rounded-md">
              <label className="block text-sm font-medium text-gray-700 mb-3 md:mb-4">תמהיל נפח מבוקש (%)</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                {BOX_SIZES.map(size => {
                  const hasQuantities = inputs.quantities && Object.values(inputs.quantities).some(q => q > 0);
                  return (
                    <div key={size.id}>
                      <label className="block text-xs text-gray-500 mb-1">{size.name}</label>
                      <div className="relative">
                        <input 
                          type="number"
                          value={hasQuantities ? inputs.mixPercents[size.id as keyof UserInputs['mixPercents']].toFixed(2) : inputs.mixPercents[size.id as keyof UserInputs['mixPercents']]}
                          onChange={(e) => handleMixChange(size.id as keyof UserInputs['mixPercents'], e.target.value)}
                          className={`w-full border-gray-300 border rounded-md p-2 pr-2 ${hasQuantities ? 'bg-gray-100 text-gray-600' : ''}`}
                          min="0"
                          max="100"
                          disabled={hasQuantities}
                          readOnly={hasQuantities}
                          step="0.01"
                        />
                        <span className="absolute left-2 top-2 text-gray-400">%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className={`mt-2 text-sm ${totalPercents !== 100 ? 'text-red-500' : 'text-green-600'}`}>
                סך הכל: {totalPercents.toFixed(2)}% {totalPercents !== 100 && '(חייב להיות 100%)'}
                {inputs.quantities && Object.values(inputs.quantities).some(q => q > 0) && (
                  <span className="text-xs text-gray-500 block mt-1">(מחושב אוטומטית מהכמויות)</span>
                )}
              </p>
              
              {/* Quantities Input */}
              <div className="mt-4 md:mt-6 pt-3 md:pt-4 border-t border-gray-300">
                <label className="block text-sm font-medium text-gray-700 mb-3 md:mb-4">הזנת כמויות לפי מידות (יחידות)</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                  {BOX_SIZES.map(size => (
                    <div key={size.id}>
                      <label className="block text-xs text-gray-500 mb-1">{size.name}</label>
                      <input 
                        type="number"
                        value={inputs.quantities?.[size.id as keyof NonNullable<UserInputs['quantities']>] || ''}
                        onChange={(e) => handleQuantityChange(size.id as keyof NonNullable<UserInputs['quantities']>, e.target.value)}
                        className="w-full border-gray-300 border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                        min="0"
                        step="1"
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-gray-500 italic">
                  הזן כמויות ישירות (יחידות) - האחוזים יתעדכנו אוטומטית לפי הנפח
                </p>
              </div>
            </div>

            {/* Other Costs */}
            <div className="md:col-span-1 lg:col-span-1 space-y-3 md:space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">עלות שילוח מכולה ($)</label>
                <input 
                  type="number"
                  value={inputs.shippingCostUSD}
                  onChange={(e) => setInputs(prev => ({ ...prev, shippingCostUSD: parseFloat(e.target.value) || 0 }))}
                  className="w-full border-gray-300 border rounded-md p-2.5 md:p-2 text-base md:text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">רווחיות (%)</label>
                  <input 
                    type="number"
                    value={inputs.targetMargin}
                    onChange={(e) => setInputs(prev => ({ ...prev, targetMargin: parseFloat(e.target.value) || 0 }))}
                    className="w-full border-gray-300 border rounded-md p-2.5 md:p-2 text-base md:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">שער דולר (ILS)</label>
                  <input 
                    type="number"
                    step="0.01"
                    value={inputs.exchangeRate}
                    onChange={(e) => setInputs(prev => ({ ...prev, exchangeRate: parseFloat(e.target.value) || 0 }))}
                    className="w-full border-gray-300 border rounded-md p-2.5 md:p-2 text-base md:text-sm"
                  />
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* View Mode Toggle and Export Button */}
        <div className="bg-white shadow-md rounded-lg p-4 md:p-6 mb-4 md:mb-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 md:gap-4">
              <label className="text-sm font-semibold text-gray-700 whitespace-nowrap">מצב הצגה:</label>
              <div className="flex gap-2 bg-gray-100 p-1 rounded-lg w-full sm:w-auto">
                <button
                  onClick={() => setViewMode('seller')}
                  className={`flex-1 sm:flex-none px-3 md:px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                    viewMode === 'seller'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-transparent text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  מוכר (מלא)
                </button>
                <button
                  onClick={() => setViewMode('customer')}
                  className={`flex-1 sm:flex-none px-3 md:px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                    viewMode === 'customer'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-transparent text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  לקוח (מוגבל)
                </button>
              </div>
              {viewMode === 'customer' && (
                <span className="text-xs text-gray-500 bg-blue-50 px-3 py-1 rounded-full border border-blue-200 w-full sm:w-auto text-center sm:text-right">
                  מצג לקוח - עמודות פנימיות מוסתרות
                </span>
              )}
            </div>
            <button
              onClick={exportToPDF}
              className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 font-medium flex items-center justify-center gap-2 shadow-md hover:shadow-lg transform hover:scale-105"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              ייצוא ל-PDF
            </button>
          </div>
        </div>

        {/* Results Table */}
        <div className="bg-white shadow-lg rounded-lg overflow-hidden mb-6 md:mb-8 border border-gray-200" ref={tableRef}>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <div className="inline-block min-w-full align-middle px-4 sm:px-0">
              <table className="min-w-full divide-y divide-gray-200 text-right">
              <thead className="bg-slate-800 text-white">
                <tr>
                  {(() => {
                    const fixedCols = [
                      isColumnVisible('size'),
                      isColumnVisible('dimensions'),
                      isColumnVisible('internalDimensions'),
                      isColumnVisible('masterCBM'),
                      isColumnVisible('unitsPerCarton'),
                      isColumnVisible('factoryPrice'),
                    ].filter(Boolean).length;
                    const dynamicCols = [
                      isColumnVisible('totalUnits'),
                      isColumnVisible('shippingPerUnit'),
                      isColumnVisible('relativeShippingTotal'),
                      isColumnVisible('priceUSD'),
                      isColumnVisible('priceILS'),
                      isColumnVisible('totalProfit'),
                      isColumnVisible('marginPercent'),
                    ].filter(Boolean).length;
                    return (
                      <>
                        {fixedCols > 0 && <th colSpan={fixedCols} className="px-6 py-3 text-center border-l border-slate-700 font-bold uppercase tracking-wider bg-slate-900">נתונים קבועים</th>}
                        {dynamicCols > 0 && <th colSpan={dynamicCols} className="px-6 py-3 text-center font-bold uppercase tracking-wider bg-indigo-900">נתונים משתנים</th>}
                      </>
                    );
                  })()}
                </tr>
                <tr className="bg-slate-700 text-xs">
                  {/* Fixed Columns */}
                  {isColumnVisible('size') && <th className="px-4 py-3 font-semibold">מידה</th>}
                  {isColumnVisible('dimensions') && <th className="px-4 py-3 font-semibold">מידות (cm)</th>}
                  {isColumnVisible('internalDimensions') && <th className="px-4 py-3 font-semibold">פנימי (cm)</th>}
                  {isColumnVisible('masterCBM') && <th className="px-4 py-3 font-semibold">CBM מאסטר</th>}
                  {isColumnVisible('unitsPerCarton') && <th className="px-4 py-3 font-semibold">יח' בקרטון</th>}
                  {isColumnVisible('factoryPrice') && <th className="px-4 py-3 font-semibold border-l border-slate-600">מחיר מפעל ($)</th>}
                  
                  {/* Dynamic Columns */}
                  {isColumnVisible('totalUnits') && <th className="px-4 py-3 font-semibold">כמות יחידות</th>}
                  {isColumnVisible('shippingPerUnit') && <th className="px-4 py-3 font-semibold">משלוח ליח'</th>}
                  {isColumnVisible('relativeShippingTotal') && <th className="px-4 py-3 font-semibold">משלוח יחסי</th>}
                  {isColumnVisible('priceUSD') && <th className="px-4 py-3 font-semibold">מחיר ($)</th>}
                  {isColumnVisible('priceILS') && <th className="px-4 py-3 font-semibold">מחיר (₪)</th>}
                  {isColumnVisible('totalProfit') && <th className="px-4 py-3 font-semibold">רווח סה"כ (₪)</th>}
                  {isColumnVisible('marginPercent') && <th className="px-4 py-3 font-semibold">% רווחיות</th>}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {results.map((res) => (
                  <tr key={res.size.id} className="hover:bg-slate-50 transition-colors">
                    {isColumnVisible('size') && <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{res.size.name}</td>}
                    {isColumnVisible('dimensions') && <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{res.size.dimensions}</td>}
                    {isColumnVisible('internalDimensions') && <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{res.size.internalDimensions}</td>}
                    {isColumnVisible('masterCBM') && <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{res.size.masterCBM}</td>}
                    {isColumnVisible('unitsPerCarton') && <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{res.size.unitsPerCarton}</td>}
                    {isColumnVisible('factoryPrice') && <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 font-bold border-l border-gray-100">${res.size.factoryPriceUSD.toFixed(2)}</td>}
                    
                    {isColumnVisible('totalUnits') && <td className="px-4 py-4 whitespace-nowrap text-sm text-indigo-700 font-bold">{res.totalUnits.toLocaleString()}</td>}
                    {isColumnVisible('shippingPerUnit') && <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">${res.shippingPerUnit.toFixed(2)}</td>}
                    {isColumnVisible('relativeShippingTotal') && <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">${res.relativeShippingTotal.toFixed(0)}</td>}
                    {isColumnVisible('priceUSD') && <td className="px-4 py-4 whitespace-nowrap text-sm text-blue-800 font-semibold">${res.priceUSD.toFixed(2)}</td>}
                    {isColumnVisible('priceILS') && <td className="px-4 py-4 whitespace-nowrap text-sm text-green-700 font-bold">₪{res.priceILS.toFixed(2)}</td>}
                    {isColumnVisible('totalProfit') && <td className="px-4 py-4 whitespace-nowrap text-sm text-emerald-600 font-bold">₪{res.totalProfitILS.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>}
                    {isColumnVisible('marginPercent') && <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{inputs.targetMargin}%</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100 font-bold text-slate-800 border-t-2 border-slate-300">
                <tr>
                  {(() => {
                    const fixedCols = [
                      isColumnVisible('size'),
                      isColumnVisible('dimensions'),
                      isColumnVisible('internalDimensions'),
                      isColumnVisible('masterCBM'),
                      isColumnVisible('unitsPerCarton'),
                      isColumnVisible('factoryPrice'),
                    ].filter(Boolean).length;
                    const visibleDynamicCols = [
                      isColumnVisible('totalUnits'),
                      isColumnVisible('shippingPerUnit'),
                      isColumnVisible('relativeShippingTotal'),
                      isColumnVisible('priceUSD'),
                      isColumnVisible('priceILS'),
                      isColumnVisible('totalProfit'),
                      isColumnVisible('marginPercent'),
                    ];
                    const totalDynamicCols = visibleDynamicCols.filter(Boolean).length;
                    const unitsCol = visibleDynamicCols[0] ? 1 : 0;
                    const shippingCols = (visibleDynamicCols[1] ? 1 : 0) + (visibleDynamicCols[2] ? 1 : 0);
                    const priceCols = (visibleDynamicCols[3] ? 1 : 0) + (visibleDynamicCols[4] ? 1 : 0);
                    const profitCols = (visibleDynamicCols[5] ? 1 : 0) + (visibleDynamicCols[6] ? 1 : 0);
                    return (
                      <>
                        <td colSpan={fixedCols} className="px-4 py-4 text-left border-l border-gray-200">סה"כ כללי:</td>
                        {isColumnVisible('totalUnits') && <td className="px-4 py-4 text-indigo-700">{summary.totalUnits.toLocaleString()}</td>}
                        {shippingCols > 0 && <td colSpan={shippingCols} className="px-4 py-4 text-sm text-gray-500 italic">נפח מנוצל: {summary.totalCBMUtilized.toFixed(2)} CBM</td>}
                        {priceCols > 0 && <td colSpan={priceCols} className="px-4 py-4 text-blue-900">השקעה: ${summary.totalInvestmentUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>}
                        {profitCols > 0 && isColumnVisible('totalProfit') && <td colSpan={profitCols} className="px-4 py-4 text-emerald-700 text-lg">רווח צפוי: ₪{summary.totalProfitILS.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>}
                      </>
                    );
                  })()}
                </tr>
              </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
          <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 border-r-4 border-indigo-500 p-4 md:p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs md:text-sm font-semibold text-indigo-700">סך יחידות במכולה</h3>
              <div className="w-8 h-8 md:w-10 md:h-10 bg-indigo-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 md:w-6 md:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-indigo-900">{summary.totalUnits.toLocaleString()}</p>
          </div>
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 border-r-4 border-slate-500 p-4 md:p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs md:text-sm font-semibold text-slate-700">תפוסת נפח (CBM)</h3>
              <div className="w-8 h-8 md:w-10 md:h-10 bg-slate-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 md:w-6 md:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-slate-900">
              {summary.totalCBMUtilized.toFixed(2)} <span className="text-base md:text-lg text-slate-600">/ {CONTAINER_CAPACITIES[inputs.containerType]}</span>
            </p>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-r-4 border-blue-500 p-4 md:p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs md:text-sm font-semibold text-blue-700">סך השקעה (דולר)</h3>
              <div className="w-8 h-8 md:w-10 md:h-10 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 md:w-6 md:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-blue-900">${summary.totalInvestmentUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-r-4 border-emerald-500 p-4 md:p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs md:text-sm font-semibold text-emerald-700">סך רווח צפוי (שקלים)</h3>
              <div className="w-8 h-8 md:w-10 md:h-10 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 md:w-6 md:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-emerald-900">₪{summary.totalProfitILS.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
        </div>
        
        <footer className="mt-12 text-center text-gray-500 text-sm">
          <p>© {new Date().getFullYear()} מערכת חישוב לוגיסטית לקופסאות כובעים</p>
        </footer>
      </div>
    </div>
  );
};

export default App;
