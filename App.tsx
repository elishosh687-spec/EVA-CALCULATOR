
import React, { useState, useMemo } from 'react';
import { BOX_SIZES, CONTAINER_CAPACITIES } from './constants';
import { UserInputs, CalculationResult, SummaryData } from './types';

const App: React.FC = () => {
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

  const handleMixChange = (key: keyof UserInputs['mixPercents'], value: string) => {
    const numValue = parseFloat(value) || 0;
    setInputs(prev => ({
      ...prev,
      mixPercents: {
        ...prev.mixPercents,
        [key]: numValue,
      }
    }));
  };

  const results = useMemo(() => {
    const totalCBM = CONTAINER_CAPACITIES[inputs.containerType];
    
    // Step 1: Preliminary calculations for each size to get total units
    const preliminaryCalculations = BOX_SIZES.map(size => {
      const mixPercent = inputs.mixPercents[size.id as keyof UserInputs['mixPercents']];
      const allocatedCBM = totalCBM * (mixPercent / 100);
      const cartons = Math.floor(allocatedCBM / size.masterCBM);
      const totalUnits = cartons * size.unitsPerCarton;
      const actualCBM = cartons * size.masterCBM;
      return { size, allocatedCBM, cartons, totalUnits, actualCBM };
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

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">
            מחשבון לוגיסטיקה ותמחור
          </h1>
          <p className="mt-2 text-lg text-slate-600">קופסאות כובעים - ניהול מלאי ורווחיות</p>
        </header>

        {/* User Input Section */}
        <div className="bg-white shadow-md rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-6 text-slate-800 border-b pb-2">נתוני הזמנה</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Container Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">סוג מכולה</label>
              <select 
                value={inputs.containerType}
                onChange={(e) => setInputs(prev => ({ ...prev, containerType: e.target.value as '20' | '40' }))}
                className="w-full border-gray-300 border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="20">מכולה 20 (24 CBM)</option>
                <option value="40">מכולה 40 (64 CBM)</option>
              </select>
            </div>

            {/* Volume Mix */}
            <div className="lg:col-span-2 bg-slate-50 p-4 rounded-md">
              <label className="block text-sm font-medium text-gray-700 mb-4">תמהיל נפח מבוקש (%)</label>
              <div className="grid grid-cols-3 gap-4">
                {BOX_SIZES.map(size => (
                  <div key={size.id}>
                    <label className="block text-xs text-gray-500 mb-1">{size.name}</label>
                    <div className="relative">
                      <input 
                        type="number"
                        value={inputs.mixPercents[size.id as keyof UserInputs['mixPercents']]}
                        onChange={(e) => handleMixChange(size.id as keyof UserInputs['mixPercents'], e.target.value)}
                        className="w-full border-gray-300 border rounded-md p-2 pr-2"
                        min="0"
                        max="100"
                      />
                      <span className="absolute left-2 top-2 text-gray-400">%</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className={`mt-2 text-sm ${totalPercents !== 100 ? 'text-red-500' : 'text-green-600'}`}>
                סך הכל: {totalPercents}% {totalPercents !== 100 && '(חייב להיות 100%)'}
              </p>
            </div>

            {/* Other Costs */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">עלות שילוח מכולה ($)</label>
                <input 
                  type="number"
                  value={inputs.shippingCostUSD}
                  onChange={(e) => setInputs(prev => ({ ...prev, shippingCostUSD: parseFloat(e.target.value) || 0 }))}
                  className="w-full border-gray-300 border rounded-md p-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">רווחיות (%)</label>
                  <input 
                    type="number"
                    value={inputs.targetMargin}
                    onChange={(e) => setInputs(prev => ({ ...prev, targetMargin: parseFloat(e.target.value) || 0 }))}
                    className="w-full border-gray-300 border rounded-md p-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">שער דולר (ILS)</label>
                  <input 
                    type="number"
                    step="0.01"
                    value={inputs.exchangeRate}
                    onChange={(e) => setInputs(prev => ({ ...prev, exchangeRate: parseFloat(e.target.value) || 0 }))}
                    className="w-full border-gray-300 border rounded-md p-2"
                  />
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Results Table */}
        <div className="bg-white shadow-md rounded-lg overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-right">
              <thead className="bg-slate-800 text-white">
                <tr>
                  <th colSpan={6} className="px-6 py-3 text-center border-l border-slate-700 font-bold uppercase tracking-wider bg-slate-900">נתונים קבועים</th>
                  <th colSpan={7} className="px-6 py-3 text-center font-bold uppercase tracking-wider bg-indigo-900">נתונים משתנים</th>
                </tr>
                <tr className="bg-slate-700 text-xs">
                  {/* Fixed Columns */}
                  <th className="px-4 py-3 font-semibold">מידה</th>
                  <th className="px-4 py-3 font-semibold">מידות (cm)</th>
                  <th className="px-4 py-3 font-semibold">פנימי (cm)</th>
                  <th className="px-4 py-3 font-semibold">CBM מאסטר</th>
                  <th className="px-4 py-3 font-semibold">יח' בקרטון</th>
                  <th className="px-4 py-3 font-semibold border-l border-slate-600">מחיר מפעל ($)</th>
                  
                  {/* Dynamic Columns */}
                  <th className="px-4 py-3 font-semibold">כמות יחידות</th>
                  <th className="px-4 py-3 font-semibold">משלוח ליח'</th>
                  <th className="px-4 py-3 font-semibold">משלוח יחסי</th>
                  <th className="px-4 py-3 font-semibold">מחיר ($)</th>
                  <th className="px-4 py-3 font-semibold">מחיר (₪)</th>
                  <th className="px-4 py-3 font-semibold">רווח סה"כ (₪)</th>
                  <th className="px-4 py-3 font-semibold">% רווחיות</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {results.map((res) => (
                  <tr key={res.size.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{res.size.name}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{res.size.dimensions}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{res.size.internalDimensions}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{res.size.masterCBM}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{res.size.unitsPerCarton}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 font-bold border-l border-gray-100">${res.size.factoryPriceUSD.toFixed(2)}</td>
                    
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-indigo-700 font-bold">{res.totalUnits.toLocaleString()}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">${res.shippingPerUnit.toFixed(2)}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">${res.relativeShippingTotal.toFixed(0)}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-blue-800 font-semibold">${res.priceUSD.toFixed(2)}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-green-700 font-bold">₪{res.priceILS.toFixed(2)}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-emerald-600 font-bold">₪{res.totalProfitILS.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{inputs.targetMargin}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100 font-bold text-slate-800 border-t-2 border-slate-300">
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-left border-l border-gray-200">סה"כ כללי:</td>
                  <td className="px-4 py-4 text-indigo-700">{summary.totalUnits.toLocaleString()}</td>
                  <td colSpan={2} className="px-4 py-4 text-sm text-gray-500 italic">נפח מנוצל: {summary.totalCBMUtilized.toFixed(2)} CBM</td>
                  <td colSpan={2} className="px-4 py-4 text-blue-900">השקעה: ${(summary.totalInvestmentUSD + (summary.totalUnits * BOX_SIZES[0].factoryPriceUSD * 0)).toFixed(0)}</td>
                  <td colSpan={2} className="px-4 py-4 text-emerald-700 text-lg">רווח צפוי: ₪{summary.totalProfitILS.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-indigo-50 border-r-4 border-indigo-500 p-4 rounded-lg shadow-sm">
            <h3 className="text-sm font-medium text-indigo-700">סך יחידות במכולה</h3>
            <p className="text-2xl font-bold text-indigo-900">{summary.totalUnits.toLocaleString()}</p>
          </div>
          <div className="bg-slate-50 border-r-4 border-slate-500 p-4 rounded-lg shadow-sm">
            <h3 className="text-sm font-medium text-slate-700">תפוסת נפח (CBM)</h3>
            <p className="text-2xl font-bold text-slate-900">{summary.totalCBMUtilized.toFixed(2)} / {CONTAINER_CAPACITIES[inputs.containerType]}</p>
          </div>
          <div className="bg-blue-50 border-r-4 border-blue-500 p-4 rounded-lg shadow-sm">
            <h3 className="text-sm font-medium text-blue-700">סך השקעה (דולר)</h3>
            <p className="text-2xl font-bold text-blue-900">${summary.totalInvestmentUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="bg-emerald-50 border-r-4 border-emerald-500 p-4 rounded-lg shadow-sm">
            <h3 className="text-sm font-medium text-emerald-700">סך רווח צפוי (שקלים)</h3>
            <p className="text-2xl font-bold text-emerald-900">₪{summary.totalProfitILS.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
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
