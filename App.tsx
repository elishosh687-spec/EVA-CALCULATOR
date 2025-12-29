import React, { useState, useMemo, useRef, useEffect } from 'react';
import { CONTAINER_CAPACITIES } from './constants';
import { UserInputs, CalculationResult, SummaryData, Product } from './types';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { saveOrder, getAllOrders, deleteOrder, saveProducts, getSavedProducts, SavedOrder } from './firestoreService';

type ViewMode = 'seller' | 'customer';
type TabMode = 'calculator' | 'orders';

// Generate unique ID for products
const generateProductId = (): string => {
  return `product-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Default products (migrated from BOX_SIZES)
const getDefaultProducts = (): Product[] => {
  return [
    {
      id: generateProductId(),
      name: 'Small',
      dimensions: '33 x 30 x 11',
      description: '',
      masterCartonCBM: 0.059,
      unitsPerCarton: 4,
      factoryPriceUSD: 4.48,
      profitMargin: 40,
      mixPercent: 0,
      active: true,
    },
    {
      id: generateProductId(),
      name: 'Medium',
      dimensions: '37 x 34 x 12',
      description: '',
      masterCartonCBM: 0.11,
      unitsPerCarton: 6,
      factoryPriceUSD: 5.51,
      profitMargin: 40,
      mixPercent: 0,
      active: true,
    },
    {
      id: generateProductId(),
      name: 'Large',
      dimensions: '42 x 37 x 18',
      description: '',
      masterCartonCBM: 0.128,
      unitsPerCarton: 6,
      factoryPriceUSD: 5.79,
      profitMargin: 40,
      mixPercent: 0,
      active: true,
    },
  ];
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabMode>('calculator');
  const [viewMode, setViewMode] = useState<ViewMode>('seller');
  const tableRef = useRef<HTMLDivElement>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [inputs, setInputs] = useState<UserInputs>({
    containerType: '40',
    products: getDefaultProducts(),
    exchangeRate: 3.2,
    shippingCostUSD: 0,
    unknownExpensesType: 'percent',
    unknownExpensesValue: 5, // Default 5%
  });
  
  // Firestore state
  const [savedOrders, setSavedOrders] = useState<SavedOrder[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [orderName, setOrderName] = useState('');
  const [loading, setLoading] = useState(false);
  const [productsChanged, setProductsChanged] = useState(false);

  const toggleRowExpansion = (productId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  // Column visibility configuration
  const defaultColumnConfig = {
    // Fixed columns (always visible)
    size: { visible: true, internal: false, label: 'שם' },
    masterCBM: { visible: true, internal: false, label: 'CBM מאסטר' },
    unitsPerCarton: { visible: true, internal: false, label: "יח' בקרטון" },
    // Dynamic columns
    totalUnits: { visible: true, internal: false, label: 'כמות יחידות' },
    totalCBM: { visible: true, internal: false, label: 'CBM כולל' }, // Total CBM by quantity
    factoryPrice: { visible: true, internal: true, label: 'מחיר יחידה - מפעל' }, // Only seller - base factory price
    totalExpenses: { visible: true, internal: true, label: 'תוספת' }, // Only seller - surcharge on factory price (dynamic label)
    totalFactoryPrice: { visible: true, internal: true, label: 'מחיר מפעל לכמות' }, // Only seller - factory price + 5% surcharge
    price: { visible: true, internal: false, label: 'מחיר יחידה - לקוח' }, // Unit price for customer
    totalCustomerPrice: { visible: true, internal: false, label: 'מחיר לקוח לכמות' }, // Total customer price for quantity
    totalProfit: { visible: true, internal: true, label: 'רווח סה"כ' }, // Only seller
    marginPercent: { visible: true, internal: true, label: '% רווחיות' }, // Only seller
    shippingPerUnit: { visible: true, internal: false, label: 'שילוח ליחידה' }, // Shipping cost per unit
    priceWithShipping: { visible: true, internal: false, label: 'מחיר לקוח כולל שילוח' }, // Customer price per unit including shipping
  };

  // User-controlled column visibility state
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    Object.keys(defaultColumnConfig).forEach(key => {
      initial[key] = defaultColumnConfig[key as keyof typeof defaultColumnConfig].visible;
    });
    return initial;
  });

  const columnConfig = useMemo(() => {
    const config: Record<string, { visible: boolean; internal: boolean; label: string }> = {};
    Object.keys(defaultColumnConfig).forEach(key => {
      const defaultConfig = defaultColumnConfig[key as keyof typeof defaultColumnConfig];
      config[key] = {
        ...defaultConfig,
        visible: columnVisibility[key] ?? defaultConfig.visible
      };
    });
    return config;
  }, [columnVisibility]);

  // Helper function to check if column should be visible
  const isColumnVisible = (key: string): boolean => {
    if (viewMode === 'customer') {
      const config = columnConfig[key];
      return config && !config.internal && (columnVisibility[key] ?? config.visible);
    }
    return columnVisibility[key] ?? columnConfig[key]?.visible ?? true;
  };

  // Product management handlers
  const handleAddProduct = () => {
    setInputs(prev => ({
      ...prev,
      products: [
        ...prev.products,
        {
          id: generateProductId(),
          name: '',
          dimensions: '',
          description: '',
          masterCartonCBM: 0,
          unitsPerCarton: 1,
          factoryPriceUSD: 0,
          profitMargin: 40,
          mixPercent: 0,
          active: true,
        }
      ]
    }));
  };

  const handleRemoveProduct = (productId: string) => {
    setInputs(prev => ({
      ...prev,
      products: prev.products.filter(p => p.id !== productId)
    }));
  };


  const handleProductChange = (productId: string, field: keyof Product, value: string | number | boolean) => {
    setInputs(prev => ({
      ...prev,
      products: prev.products.map(p =>
        p.id === productId ? { ...p, [field]: value } : p
      )
    }));
  };

  const handleMixPercentChange = (productId: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setInputs(prev => ({
      ...prev,
      products: prev.products.map(p =>
        p.id === productId ? { ...p, mixPercent: numValue, quantity: undefined } : p
      )
    }));
  };

  const handleQuantityChange = (productId: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setInputs(prev => {
      const updatedProducts = prev.products.map(p =>
        p.id === productId ? { ...p, quantity: numValue } : p
      );

      // Calculate percentages from quantities based on CBM
      const totalCBM = CONTAINER_CAPACITIES[prev.containerType];
      const totalCBMUsed = updatedProducts.reduce((sum, product) => {
        const qty = product.quantity || 0;
        const cartons = Math.ceil(qty / product.unitsPerCarton);
        return sum + (cartons * product.masterCartonCBM);
      }, 0);

      const productsWithPercents = updatedProducts.map(product => {
        const qty = product.quantity || 0;
        const cartons = Math.ceil(qty / product.unitsPerCarton);
        const cbmUsed = cartons * product.masterCartonCBM;
        const mixPercent = totalCBM > 0 ? (cbmUsed / totalCBM) * 100 : 0;
        return { ...product, mixPercent };
      });

      return {
        ...prev,
        products: productsWithPercents
      };
    });
  };

  const results = useMemo(() => {
    const totalCBM = CONTAINER_CAPACITIES[inputs.containerType];
    
    // Filter only active products for calculations
    const activeProducts = inputs.products.filter(p => p.active !== false);
    
    // Step 1: Preliminary calculations for each product to get total units
    const preliminaryCalculations = activeProducts.map(product => {
      const masterCBM = product.masterCartonCBM;
      let totalUnits = 0;
      let allocatedCBM = 0;
      let cartons = 0;
      
      // If quantities are provided, use them directly
      if (product.quantity && product.quantity > 0) {
        totalUnits = product.quantity;
        cartons = Math.ceil(totalUnits / product.unitsPerCarton);
        allocatedCBM = cartons * masterCBM;
      } else {
        // Otherwise, use percentages
        const mixPercent = product.mixPercent || 0;
        allocatedCBM = totalCBM * (mixPercent / 100);
        cartons = Math.floor(allocatedCBM / masterCBM);
        totalUnits = cartons * product.unitsPerCarton;
        allocatedCBM = cartons * masterCBM;
      }
      
      return { product, allocatedCBM, cartons, totalUnits, actualCBM: allocatedCBM, masterCBM };
    });

    // Step 2: Calculate all prices first to get total customer transaction
    const resultsWithPrices = preliminaryCalculations.map(pre => {
      const { product, totalUnits, actualCBM, masterCBM } = pre;
      
      // Calculate customer price: (factoryPrice * (1 + unknownExpenses%)) / (1 - margin%)
      // Margin applies to factory price + surcharge, using individual profit margin
      const surchargeMultiplier = 1 + (inputs.unknownExpensesValue / 100);
      const factoryPriceWithSurchargeUSD = product.factoryPriceUSD * surchargeMultiplier;
      const marginFactor = 1 - (product.profitMargin / 100);
      const priceUSD = marginFactor > 0 ? factoryPriceWithSurchargeUSD / marginFactor : 0;
      const priceILS = priceUSD * inputs.exchangeRate;
      
      // Landing cost for profit calculation (factory price + 5% surcharge as an expense)
      const landingCostUSD = factoryPriceWithSurchargeUSD;
      const landingCostILS = landingCostUSD * inputs.exchangeRate;
      
      // Total factory price with 5% surcharge
      const totalFactoryPriceUSD = factoryPriceWithSurchargeUSD * totalUnits;
      const customerTotalTransaction = priceILS * totalUnits;
      
      return {
        ...pre,
        priceUSD,
        priceILS,
        landingCostILS,
        totalFactoryPriceUSD,
        customerTotalTransaction
      };
    });

    // Calculate total customer transaction and unknown expenses
    const totalCustomerTransaction = resultsWithPrices.reduce((sum, r) => sum + r.customerTotalTransaction, 0);
    const totalUnknownExpensesILS = inputs.unknownExpensesType === 'percent'
      ? totalCustomerTransaction * (inputs.unknownExpensesValue / 100)
      : inputs.unknownExpensesValue;
    const totalUnknownExpensesUSD = totalUnknownExpensesILS / inputs.exchangeRate;
    
    // Calculate total factory price for distribution
    const totalFactoryPriceAll = resultsWithPrices.reduce((sum, r) => sum + r.totalFactoryPriceUSD, 0);
    
    // Calculate total units for shipping distribution (equal division)
    const totalUnitsAll = resultsWithPrices.reduce((sum, r) => sum + r.totalUnits, 0);

    // Step 3: Final calculations with total expenses
    return resultsWithPrices.map(pre => {
      const { product, totalUnits, actualCBM, masterCBM, priceUSD, priceILS, landingCostILS, totalFactoryPriceUSD } = pre;
      
      // Profit = (customer price - (factory price + 5% surcharge)) × quantity
      const profitPerUnitILS = priceILS - landingCostILS;
      const totalProfitILS = profitPerUnitILS * totalUnits;
      const totalProfitUSD = totalProfitILS / inputs.exchangeRate;
      const totalCBM = actualCBM;
      
      // Calculate proportional unknown expenses for this row
      const proportionalUnknownExpensesUSD = totalFactoryPriceAll > 0 
        ? (totalFactoryPriceUSD / totalFactoryPriceAll) * totalUnknownExpensesUSD
        : 0;
      
      // Total expenses = factory price + proportional unknown expenses
      const totalExpensesUSD = totalFactoryPriceUSD + proportionalUnknownExpensesUSD;
      
      // Calculate shipping cost per unit (equal division: total shipping / total units)
      const shippingPerUnitUSD = totalUnitsAll > 0
        ? inputs.shippingCostUSD / totalUnitsAll
        : 0;
      const shippingPerUnitILS = shippingPerUnitUSD * inputs.exchangeRate;
      
      // Calculate customer price with shipping
      const priceWithShippingUSD = priceUSD + shippingPerUnitUSD;
      const priceWithShippingILS = priceILS + shippingPerUnitILS;
      
      // Get cartons from preliminaryCalculations
      const cartons = preliminaryCalculations.find(p => p.product.id === product.id)?.cartons || 0;

      // Create BoxSizeData-like object for compatibility with existing table rendering
      const sizeData = {
        id: product.id,
        name: product.name,
        dimensions: product.dimensions, // Use dimensions description for customer
        internalDimensions: '', // Not used in new system
        masterCBM: masterCBM,
        unitsPerCarton: product.unitsPerCarton,
        factoryPriceUSD: product.factoryPriceUSD,
      };

      return {
        size: sizeData,
        allocatedCBM: actualCBM,
        cartons,
        totalUnits,
        totalCBM,
        totalFactoryPriceUSD,
        totalExpensesUSD,
        priceUSD,
        priceILS,
        landingCostILS,
        totalProfitILS,
        totalProfitUSD,
        shippingPerUnitUSD,
        shippingPerUnitILS,
        priceWithShippingUSD,
        priceWithShippingILS,
        productProfitMargin: product.profitMargin, // Store individual margin for display
      } as CalculationResult & { productProfitMargin: number };
    });
  }, [inputs]);

  const summary = useMemo((): SummaryData => {
    // Calculate base summary without unknown expenses
    const baseSummary = results.reduce<Omit<SummaryData, 'totalUnknownExpensesILS'>>((acc, curr) => ({
      totalUnits: acc.totalUnits + curr.totalUnits,
      totalCBMUtilized: acc.totalCBMUtilized + curr.allocatedCBM,
      totalCBM: acc.totalCBM + curr.totalCBM,
      totalFactoryPriceUSD: acc.totalFactoryPriceUSD + curr.totalFactoryPriceUSD,
      totalExpensesUSD: acc.totalExpensesUSD + curr.totalExpensesUSD,
      totalInvestmentUSD: acc.totalInvestmentUSD + (curr.totalUnits * curr.size.factoryPriceUSD),
      totalProfitILS: acc.totalProfitILS + curr.totalProfitILS
    }), {
      totalUnits: 0,
      totalCBMUtilized: 0,
      totalCBM: 0,
      totalFactoryPriceUSD: 0,
      totalExpensesUSD: 0,
      totalInvestmentUSD: 0, // Start with 0, will add factory prices
      totalProfitILS: 0
    });

    // Calculate total customer transaction amount (priceILS * totalUnits for all rows)
    const totalCustomerTransaction = results.reduce((sum, curr) => sum + (curr.priceILS * curr.totalUnits), 0);
    
    // Calculate unknown expenses as total (not per row) - for display only, not used in profit calculation
    const totalUnknownExpensesILS = inputs.unknownExpensesType === 'percent'
      ? totalCustomerTransaction * (inputs.unknownExpensesValue / 100)
      : inputs.unknownExpensesValue;

    // Return summary without subtracting unknown expenses (5% surcharge on factory price already included)
    return {
      ...baseSummary,
      totalInvestmentUSD: baseSummary.totalInvestmentUSD, // No need to add unknown expenses - 5% surcharge already included
      totalProfitILS: baseSummary.totalProfitILS, // No need to subtract unknown expenses - 5% surcharge already included
      totalUnknownExpensesILS
    };
  }, [results, inputs.unknownExpensesType, inputs.unknownExpensesValue, inputs.exchangeRate]);

  const totalPercents = inputs.products
    .filter(p => p.active !== false)
    .reduce((sum, p) => sum + (p.mixPercent || 0), 0);

  // Load saved products on mount
  useEffect(() => {
    const loadProducts = async () => {
      try {
        setLoading(true);
        const savedProducts = await getSavedProducts();
        if (savedProducts && savedProducts.length > 0) {
          setInputs(prev => ({
            ...prev,
            products: savedProducts
          }));
          setProductsChanged(false); // Reset after loading
        }
      } catch (error) {
        console.error('Error loading products:', error);
      } finally {
        setLoading(false);
      }
    };
    loadProducts();
  }, []);

  // Load saved orders
  useEffect(() => {
    const loadOrders = async () => {
      try {
        const orders = await getAllOrders();
        setSavedOrders(orders);
      } catch (error) {
        console.error('Error loading orders:', error);
      }
    };
    if (activeTab === 'orders') {
      loadOrders();
    }
  }, [activeTab]);

  // Track products changes (but not on initial load)
  const isInitialLoad = useRef(true);
  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    setProductsChanged(true);
  }, [inputs.products]);

  // Handle save order
  const handleSaveOrder = async () => {
    if (!orderName.trim()) {
      alert('אנא הזן שם להזמנה');
      return;
    }
    try {
      setLoading(true);
      await saveOrder(orderName.trim(), inputs);
      setShowSaveDialog(false);
      setOrderName('');
      alert('ההזמנה נשמרה בהצלחה!');
      if (activeTab === 'orders') {
        const orders = await getAllOrders();
        setSavedOrders(orders);
      }
    } catch (error: any) {
      console.error('Error saving order:', error);
      alert(`שגיאה בשמירה: ${error.message || 'שגיאה לא ידועה'}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle load order
  const handleLoadOrder = (order: SavedOrder) => {
    if (!order.id) return;
    // Ensure all products have active field (default to true if not set)
    const inputsWithActive = {
      ...order.inputs,
      products: order.inputs.products.map((product: Product) => ({
        ...product,
        active: product.active !== undefined ? product.active : true
      }))
    };
    setInputs(inputsWithActive);
    setProductsChanged(false); // Don't mark as changed when loading an order
    setActiveTab('calculator');
    alert('ההזמנה נטענה בהצלחה!');
  };

  // Handle delete order
  const handleDeleteOrder = async (orderId: string) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את ההזמנה?')) {
      return;
    }
    try {
      setLoading(true);
      await deleteOrder(orderId);
      const orders = await getAllOrders();
      setSavedOrders(orders);
      alert('ההזמנה נמחקה בהצלחה!');
    } catch (error: any) {
      console.error('Error deleting order:', error);
      alert(`שגיאה במחיקה: ${error.message || 'שגיאה לא ידועה'}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle save products
  const handleSaveProducts = async () => {
    try {
      setLoading(true);
      await saveProducts(inputs.products);
      setProductsChanged(false);
      alert('המוצרים נשמרו בהצלחה!');
    } catch (error: any) {
      console.error('Error saving products:', error);
      alert(`שגיאה בשמירת המוצרים: ${error.message || 'שגיאה לא ידועה'}`);
    } finally {
      setLoading(false);
    }
  };


  const exportToPDF = async () => {
    if (!tableRef.current) return;

    try {
      const canvas = await html2canvas(tableRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
      });

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

        {/* Tabs Navigation */}
        <div className="bg-white shadow-md rounded-lg p-2 mb-6 flex gap-2">
          <button
            onClick={() => setActiveTab('calculator')}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'calculator'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-transparent text-gray-700 hover:bg-gray-100'
            }`}
          >
            מחשבון
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'orders'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-transparent text-gray-700 hover:bg-gray-100'
            }`}
          >
            הזמנות קודמות
          </button>
        </div>

        {/* Orders Tab */}
        {activeTab === 'orders' && (
          <div className="bg-white shadow-lg rounded-xl p-6 mb-8 border border-gray-200">
            <h2 className="text-xl font-bold mb-6 text-slate-800 border-b-2 border-blue-200 pb-3">
              הזמנות שמורות
            </h2>
            {loading ? (
              <div className="text-center py-8">
                <p className="text-gray-500">טוען...</p>
              </div>
            ) : savedOrders.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">אין הזמנות שמורות</p>
              </div>
            ) : (
              <div className="space-y-4">
                {savedOrders.map((order) => (
                  <div
                    key={order.id}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-800 mb-1">
                          {order.name}
                        </h3>
                        <p className="text-sm text-gray-500">
                          עודכן לאחרונה: {order.updatedAt?.toDate?.().toLocaleDateString('he-IL') || 'לא זמין'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleLoadOrder(order)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
                        >
                          טען
                        </button>
                        <button
                          onClick={() => order.id && handleDeleteOrder(order.id)}
                          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm font-medium"
                        >
                          מחק
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Calculator Tab */}
        {activeTab === 'calculator' && (
          <>

        {/* User Input Section */}
        <div className="bg-white shadow-lg rounded-xl p-6 mb-8 border border-gray-200">
          <h2 className="text-xl font-bold mb-6 text-slate-800 border-b-2 border-blue-200 pb-3 flex items-center gap-2">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            נתוני הזמנה
          </h2>
          
          {/* First Row: 4 Input Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-4 md:mb-6">
            {/* Container Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">סוג מכולה</label>
              <select
                value={inputs.containerType}
                onChange={(e) => setInputs(prev => ({ ...prev, containerType: e.target.value as '20' | '40' }))}
                className="w-full border-gray-300 border rounded-md p-2.5 md:p-2 focus:ring-blue-500 focus:border-blue-500 text-base md:text-sm"
              >
                <option value="20">מכולה 20 ({CONTAINER_CAPACITIES['20']} CBM)</option>
                <option value="40">מכולה 40 ({CONTAINER_CAPACITIES['40']} CBM)</option>
              </select>
            </div>

            {/* Exchange Rate */}
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

            {/* Shipping Cost */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">מחיר המשלוח (USD)</label>
              <div className="relative">
                <input 
                  type="number"
                  step="0.01"
                  value={inputs.shippingCostUSD}
                  onChange={(e) => setInputs(prev => ({ ...prev, shippingCostUSD: parseFloat(e.target.value) || 0 }))}
                  className="w-full border-gray-300 border rounded-md p-2.5 md:p-2 text-base md:text-sm pr-8"
                  placeholder="0"
                />
                <span className="absolute left-2 top-2 text-gray-400 text-sm">$</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                מחיר השילוח יחולק יחסית לפי ה-CBM של כל מידה
              </p>
            </div>

            {/* Unknown Expenses */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">הוצאות לא ידועות</label>
              <div className="mb-2">
                <div className="flex gap-3 bg-gray-50 p-1 rounded-md">
                  <button
                    type="button"
                    onClick={() => setInputs(prev => ({ ...prev, unknownExpensesType: 'percent' }))}
                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                      inputs.unknownExpensesType === 'percent'
                        ? 'bg-blue-600 text-white'
                        : 'bg-transparent text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    אחוזים
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputs(prev => ({ ...prev, unknownExpensesType: 'fixed' }))}
                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                      inputs.unknownExpensesType === 'fixed'
                        ? 'bg-blue-600 text-white'
                        : 'bg-transparent text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    סכום קבוע
                  </button>
                </div>
              </div>
              <div className="relative">
                <input 
                  type="number"
                  step={inputs.unknownExpensesType === 'percent' ? '0.01' : '1'}
                  value={inputs.unknownExpensesValue}
                  onChange={(e) => setInputs(prev => ({ ...prev, unknownExpensesValue: parseFloat(e.target.value) || 0 }))}
                  className="w-full border-gray-300 border rounded-md p-2.5 md:p-2 text-base md:text-sm"
                  placeholder={inputs.unknownExpensesType === 'percent' ? '5' : '0'}
                />
                <span className="absolute left-2 top-2 text-gray-400 text-sm">
                  {inputs.unknownExpensesType === 'percent' ? '%' : '₪'}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {inputs.unknownExpensesType === 'percent' 
                  ? 'מסכום כולל של העסקה (מחיר לקוח)'
                  : 'סכום קבוע בשקלים'}
              </p>
            </div>
          </div>

          {/* Second Row: Products Table - Full Width */}
          <div className="bg-slate-50 p-3 md:p-4 rounded-md">
              <div className="flex justify-between items-center mb-3 md:mb-4">
                <label className="block text-sm font-medium text-gray-700">מוצרים</label>
                <div className="flex gap-2">
                  {productsChanged && (
                    <button
                      onClick={handleSaveProducts}
                      disabled={loading}
                      className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      שמור מוצרים
                    </button>
                  )}
                  <button
                    onClick={handleAddProduct}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    הוסף מוצר
                  </button>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-3 text-right text-sm font-medium text-gray-700 w-10 whitespace-nowrap"></th>
                      <th className="px-3 py-3 text-right text-sm font-medium text-gray-700 whitespace-nowrap w-16">פעיל</th>
                      <th className="px-3 py-3 text-right text-sm font-medium text-gray-700 whitespace-nowrap">שם</th>
                      <th className="px-3 py-3 text-right text-sm font-medium text-gray-700 whitespace-nowrap">קרטון CBM מאסטר</th>
                      <th className="px-3 py-3 text-right text-sm font-medium text-gray-700 whitespace-nowrap">יח' בקרטון</th>
                      <th className="px-3 py-3 text-right text-sm font-medium text-gray-700 whitespace-nowrap">מחיר מפעל ($)</th>
                      <th className="px-3 py-3 text-right text-sm font-medium text-gray-700 whitespace-nowrap">רווחיות (%)</th>
                      <th className="px-3 py-3 text-right text-sm font-medium text-gray-700 whitespace-nowrap">% נפח</th>
                      <th className="px-3 py-3 text-right text-sm font-medium text-gray-700 whitespace-nowrap">כמות</th>
                      <th className="px-3 py-3 text-right text-sm font-medium text-gray-700 whitespace-nowrap"></th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {inputs.products.map((product) => {
                      const hasQuantity = product.quantity && product.quantity > 0;
                      const isExpanded = expandedRows.has(product.id);
                      return (
                        <React.Fragment key={product.id}>
                          <tr className={`hover:bg-gray-50 ${product.active === false ? 'opacity-50 bg-gray-100' : ''}`}>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <button
                                onClick={() => toggleRowExpansion(product.id)}
                                className="text-gray-500 hover:text-gray-700 transition-transform"
                                title={isExpanded ? "סגור" : "הרחב"}
                              >
                                <svg 
                                  className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
                                  fill="none" 
                                  stroke="currentColor" 
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={product.active !== false}
                                onChange={(e) => handleProductChange(product.id, 'active', e.target.checked)}
                                className="w-5 h-5 cursor-pointer"
                                style={{ accentColor: '#2563eb' }}
                                title={product.active === false ? "מוצר לא פעיל - לא יוצג בחישובים" : "מוצר פעיל"}
                              />
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <input
                                type="text"
                                value={product.name}
                                onChange={(e) => handleProductChange(product.id, 'name', e.target.value)}
                                className="w-full border-gray-300 border rounded-md px-3 py-2 text-sm min-w-[120px]"
                                placeholder="שם מוצר"
                              />
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <input
                                type="number"
                                value={product.masterCartonCBM || ''}
                                onChange={(e) => handleProductChange(product.id, 'masterCartonCBM', parseFloat(e.target.value) || 0)}
                                className="w-full border-gray-300 border rounded-md px-3 py-2 text-sm min-w-[100px]"
                                placeholder="0.059"
                                step="0.001"
                              />
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <input
                                type="number"
                                value={product.unitsPerCarton || ''}
                                onChange={(e) => handleProductChange(product.id, 'unitsPerCarton', parseInt(e.target.value) || 1)}
                                className="w-full border-gray-300 border rounded-md px-3 py-2 text-sm min-w-[100px]"
                                placeholder="1"
                                min="1"
                              />
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <input
                                type="number"
                                value={product.factoryPriceUSD || ''}
                                onChange={(e) => handleProductChange(product.id, 'factoryPriceUSD', parseFloat(e.target.value) || 0)}
                                className="w-full border-gray-300 border rounded-md px-3 py-2 text-sm min-w-[100px]"
                                placeholder="0"
                                step="0.01"
                              />
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <input
                                type="number"
                                value={product.profitMargin || ''}
                                onChange={(e) => handleProductChange(product.id, 'profitMargin', parseFloat(e.target.value) || 0)}
                                className="w-full border-gray-300 border rounded-md px-3 py-2 text-sm min-w-[100px]"
                                placeholder="40"
                                step="0.1"
                              />
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <input
                                type="number"
                                value={hasQuantity ? product.mixPercent?.toFixed(2) || '' : product.mixPercent || ''}
                                onChange={(e) => handleMixPercentChange(product.id, e.target.value)}
                                className={`w-full border-gray-300 border rounded-md px-3 py-2 text-sm min-w-[100px] ${hasQuantity ? 'bg-gray-100 text-gray-600' : ''}`}
                                disabled={hasQuantity}
                                readOnly={hasQuantity}
                                placeholder="0"
                                step="0.01"
                              />
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <input
                                type="number"
                                value={product.quantity || ''}
                                onChange={(e) => handleQuantityChange(product.id, e.target.value)}
                                className="w-full border-gray-300 border rounded-md px-3 py-2 text-sm min-w-[100px]"
                                placeholder="0"
                                min="0"
                                step="1"
                              />
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              {inputs.products.length > 1 && (
                                <button
                                  onClick={() => handleRemoveProduct(product.id)}
                                  className="text-red-600 hover:text-red-800"
                                  title="מחק מוצר"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              )}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-gray-50">
                              <td colSpan={10} className="px-4 py-4">
                                <div className="max-w-3xl mx-auto">
                                  <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
                                    <div className="font-semibold text-gray-800 mb-4 text-base border-b border-gray-200 pb-2">פרטים נוספים</div>
                                    
                                    {/* Product Details Grid */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                      <div className="bg-gray-50 rounded-md p-3">
                                        <div className="text-xs text-gray-500 mb-1">CBM מאסטר</div>
                                        <div className="text-sm font-semibold text-gray-800">{product.masterCartonCBM.toFixed(3)}</div>
                                      </div>
                                      <div className="bg-gray-50 rounded-md p-3">
                                        <div className="text-xs text-gray-500 mb-1">יחידות בקרטון</div>
                                        <div className="text-sm font-semibold text-gray-800">{product.unitsPerCarton}</div>
                                      </div>
                                      <div className="bg-gray-50 rounded-md p-3">
                                        <div className="text-xs text-gray-500 mb-1">מחיר מפעל</div>
                                        <div className="text-sm font-semibold text-gray-800">${product.factoryPriceUSD.toFixed(2)}</div>
                                      </div>
                                      <div className="bg-gray-50 rounded-md p-3">
                                        <div className="text-xs text-gray-500 mb-1">רווחיות</div>
                                        <div className="text-sm font-semibold text-gray-800">{product.profitMargin}%</div>
                                      </div>
                                    </div>
                                    
                                    {/* Product Description */}
                                    <div>
                                      <label className="block font-medium text-sm text-gray-700 mb-2">תיאור/הסבר על המוצר:</label>
                                      <textarea
                                        value={product.description}
                                        onChange={(e) => handleProductChange(product.id, 'description', e.target.value)}
                                        className="w-full border-gray-300 border rounded-md px-3 py-2 text-sm resize-y min-h-[100px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="הכנס תיאור/הסבר על המוצר (כולל מידות אם רלוונטי)..."
                                        rows={4}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className={`mt-2 text-sm ${totalPercents !== 100 ? 'text-red-500' : 'text-green-600'}`}>
                סך הכל: {totalPercents.toFixed(2)}% {totalPercents !== 100 && '(חייב להיות 100%)'}
              </p>
          </div>
        </div>

        {/* View Mode Toggle, Save Order and Export Button */}
        <div className="bg-white shadow-md rounded-lg p-4 md:p-6 mb-4 md:mb-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 md:gap-4">
              <label className="text-sm font-semibold text-gray-700 whitespace-nowrap">מצב הצגה:</label>
              <div className="flex gap-2 bg-gray-100 p-1 rounded-lg w-full sm:w-auto">
                <button
                  onClick={() => setViewMode('seller')}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'seller'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-transparent text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  מוכר
                </button>
                <button
                  onClick={() => setViewMode('customer')}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'customer'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-transparent text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  לקוח
                </button>
              </div>
              <button
                onClick={() => setShowSaveDialog(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm font-medium flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                שמור הזמנה
              </button>
              <button
                onClick={exportToPDF}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                ייצא ל-PDF
              </button>
            </div>
          </div>
        </div>

        {/* Hidden Columns Panel */}
        {(() => {
          const hiddenColumns = Object.keys(columnConfig).filter(key => {
            const config = columnConfig[key];
            return config && !(columnVisibility[key] ?? config.visible);
          });

          if (hiddenColumns.length === 0) return null;

          return (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4 md:mb-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-yellow-800">עמודות מוסתרות</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {hiddenColumns.map(key => {
                  const label = columnConfig[key]?.label || key;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setColumnVisibility(prev => ({
                          ...prev,
                          [key]: true
                        }));
                      }}
                      className="text-xs px-2 py-1 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 rounded-md transition-colors flex items-center gap-1"
                      title={`הצג ${label}`}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Results Table */}
        <div className="bg-white shadow-lg rounded-lg overflow-hidden mb-6 md:mb-8 border border-gray-200" ref={tableRef}>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <div className="inline-block min-w-full align-middle px-4 sm:px-0">
              <table className="min-w-full divide-y divide-gray-200 text-right">
              <thead className="bg-slate-800 text-white">
                <tr className="bg-slate-700 text-xs">
                  {/* Fixed Columns */}
                  {(() => {
                    const fixedColumns = [
                      { key: 'size', label: 'שם', border: false },
                      { key: 'masterCBM', label: 'CBM מאסטר', border: false },
                      { key: 'unitsPerCarton', label: "יח' בקרטון", border: false },
                    ];
                    return fixedColumns.map(col => {
                      if (!isColumnVisible(col.key)) return null;
                      const isVisible = columnVisibility[col.key] ?? columnConfig[col.key].visible;
                      return (
                        <th key={col.key} className={`px-4 py-3 font-semibold ${col.border ? 'border-l border-slate-600' : ''}`}>
                          <div className="flex items-center justify-end gap-2">
                            <span>{col.label}</span>
                            <input
                              type="checkbox"
                              checked={isVisible}
                              onChange={(e) => {
                                e.stopPropagation();
                                setColumnVisibility(prev => ({
                                  ...prev,
                                  [col.key]: e.target.checked
                                }));
                              }}
                              className="w-3 h-3 cursor-pointer"
                              style={{ accentColor: '#60a5fa' }}
                            />
                          </div>
                        </th>
                      );
                    });
                  })()}
                  
                  {/* Dynamic Columns */}
                  {(() => {
                    const dynamicColumns = [
                      { key: 'totalCBM', label: 'CBM כולל' },
                      { key: 'totalUnits', label: 'כמות יחידות' },
                      { key: 'factoryPrice', label: 'מחיר יחידה - מפעל' },
                      { key: 'totalExpenses', label: `${inputs.unknownExpensesValue}% תוספת` },
                      { key: 'totalFactoryPrice', label: 'מחיר מפעל לכמות' },
                      { key: 'price', label: 'מחיר יחידה - לקוח' },
                      { key: 'totalCustomerPrice', label: 'מחיר לקוח לכמות' },
                      { key: 'totalProfit', label: 'רווח סה"כ' },
                      { key: 'marginPercent', label: '% רווחיות' },
                      { key: 'shippingPerUnit', label: 'שילוח ליחידה' },
                      { key: 'priceWithShipping', label: 'מחיר לקוח כולל שילוח' },
                    ];
                    return dynamicColumns.map(col => {
                      if (!isColumnVisible(col.key)) return null;
                      const isVisible = columnVisibility[col.key] ?? columnConfig[col.key].visible;
                      return (
                        <th key={col.key} className="px-4 py-3 font-semibold">
                          <div className="flex items-center justify-end gap-2">
                            <span>{col.label}</span>
                            <input
                              type="checkbox"
                              checked={isVisible}
                              onChange={(e) => {
                                e.stopPropagation();
                                setColumnVisibility(prev => ({
                                  ...prev,
                                  [col.key]: e.target.checked
                                }));
                              }}
                              className="w-3 h-3 cursor-pointer"
                              style={{ accentColor: '#60a5fa' }}
                            />
                          </div>
                        </th>
                      );
                    });
                  })()}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {results.map((res, idx) => (
                  <tr key={res.size.id || idx} className="hover:bg-gray-50">
                    {isColumnVisible('size') && <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{res.size.name}</td>}
                    {isColumnVisible('masterCBM') && <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">{res.size.masterCBM.toFixed(3)}</td>}
                    {isColumnVisible('unitsPerCarton') && <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">{res.size.unitsPerCarton}</td>}
                    {isColumnVisible('totalCBM') && <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700 font-semibold">{res.totalCBM.toFixed(3)}</td>}
                    {isColumnVisible('totalUnits') && <td className="px-4 py-4 whitespace-nowrap text-sm text-indigo-700 font-bold">{res.totalUnits.toLocaleString()}</td>}
                    {isColumnVisible('factoryPrice') && (
                      <td className="px-4 py-4 whitespace-nowrap text-sm border-l border-gray-100">
                        <div className="text-gray-900 font-bold">${res.size.factoryPriceUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div className="text-gray-600 text-xs">₪{(res.size.factoryPriceUSD * inputs.exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </td>
                    )}
                    {isColumnVisible('totalExpenses') && (() => {
                      const surchargeMultiplier = 1 + (inputs.unknownExpensesValue / 100);
                      return (
                        <td className="px-4 py-4 whitespace-nowrap text-sm border-l border-gray-100">
                          <div className="text-orange-900 font-bold">${(res.size.factoryPriceUSD * surchargeMultiplier).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          <div className="text-orange-700 text-xs">₪{(res.size.factoryPriceUSD * inputs.exchangeRate * surchargeMultiplier).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        </td>
                      );
                    })()}
                    {isColumnVisible('totalFactoryPrice') && (
                      <td className="px-4 py-4 whitespace-nowrap text-sm border-l border-gray-100">
                        <div className="text-gray-900 font-bold">${res.totalFactoryPriceUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div className="text-gray-600 text-xs">₪{(res.totalFactoryPriceUSD * inputs.exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </td>
                    )}
                    {isColumnVisible('price') && (
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        <div className="text-blue-800 font-semibold">${res.priceUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div className="text-green-700 font-bold text-xs">₪{res.priceILS.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </td>
                    )}
                    {isColumnVisible('totalCustomerPrice') && (
                      <td className="px-4 py-4 whitespace-nowrap text-sm border-l border-gray-100">
                        <div className="text-blue-900 font-bold">${(res.priceUSD * res.totalUnits).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div className="text-blue-700 text-xs">₪{(res.priceILS * res.totalUnits).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </td>
                    )}
                    {isColumnVisible('totalProfit') && (
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        <div className="text-emerald-800 font-semibold">${res.totalProfitUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div className="text-emerald-600 font-bold text-xs">₪{res.totalProfitILS.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </td>
                    )}
                    {isColumnVisible('marginPercent') && (
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {(res as any).productProfitMargin || inputs.products.find(p => p.id === res.size.id)?.profitMargin || 0}%
                      </td>
                    )}
                    {isColumnVisible('shippingPerUnit') && (
                      <td className="px-4 py-4 whitespace-nowrap text-sm border-l border-gray-100">
                        <div className="text-purple-800 font-semibold">${res.shippingPerUnitUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div className="text-purple-600 text-xs">₪{res.shippingPerUnitILS.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </td>
                    )}
                    {isColumnVisible('priceWithShipping') && (
                      <td className="px-4 py-4 whitespace-nowrap text-sm border-l border-gray-100">
                        <div className="text-indigo-800 font-semibold">${res.priceWithShippingUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div className="text-indigo-600 font-bold text-xs">₪{res.priceWithShippingILS.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100 font-bold text-slate-800 border-t-2 border-slate-300">
                <tr>
                  {(() => {
                    const fixedCols = [
                      isColumnVisible('size'),
                      isColumnVisible('masterCBM'),
                      isColumnVisible('unitsPerCarton'),
                    ].filter(Boolean).length;
                    const visibleDynamicCols = [
                      isColumnVisible('totalCBM'),
                      isColumnVisible('totalUnits'),
                      isColumnVisible('factoryPrice'),
                      isColumnVisible('totalExpenses'),
                      isColumnVisible('totalFactoryPrice'),
                      isColumnVisible('price'),
                      isColumnVisible('totalCustomerPrice'),
                      isColumnVisible('totalProfit'),
                      isColumnVisible('marginPercent'),
                      isColumnVisible('shippingPerUnit'),
                      isColumnVisible('priceWithShipping'),
                    ];
                    const totalDynamicCols = visibleDynamicCols.filter(Boolean).length;
                    const cbmCol = visibleDynamicCols[0] ? 1 : 0;
                    const unitsCol = visibleDynamicCols[1] ? 1 : 0;
                    const factoryPriceCol = visibleDynamicCols[2] ? 1 : 0;
                    const expensesCol = visibleDynamicCols[3] ? 1 : 0;
                    const totalFactoryPriceCol = visibleDynamicCols[4] ? 1 : 0;
                    const priceCol = visibleDynamicCols[5] ? 1 : 0;
                    const totalCustomerPriceCol = visibleDynamicCols[6] ? 1 : 0;
                    const profitCols = (visibleDynamicCols[7] ? 1 : 0) + (visibleDynamicCols[8] ? 1 : 0);
                    const shippingCol = visibleDynamicCols[9] ? 1 : 0;
                    const priceWithShippingCol = visibleDynamicCols[10] ? 1 : 0;
                    return (
                      <>
                        <td colSpan={fixedCols} className="px-4 py-4 text-left border-l border-gray-200">סה"כ כללי:</td>
                        {isColumnVisible('totalCBM') && <td className="px-4 py-4 text-gray-700 font-semibold">{summary.totalCBM.toFixed(3)}</td>}
                        {isColumnVisible('totalUnits') && <td className="px-4 py-4 text-indigo-700">{summary.totalUnits.toLocaleString()}</td>}
                        {factoryPriceCol > 0 && (
                          <td className="px-4 py-4 border-l border-gray-100">
                            <div className="text-gray-900 font-bold">-</div>
                            <div className="text-gray-600 text-xs">-</div>
                          </td>
                        )}
                        {expensesCol > 0 && (() => {
                          // Calculate average factory price per unit for the summary
                          const totalFactoryPriceBase = results.reduce((sum, curr) => sum + (curr.size.factoryPriceUSD * curr.totalUnits), 0);
                          const totalUnits = results.reduce((sum, curr) => sum + curr.totalUnits, 0);
                          const avgFactoryPrice = totalUnits > 0 ? totalFactoryPriceBase / totalUnits : 0;
                          const surchargePercent = inputs.unknownExpensesValue / 100;
                          return (
                            <td className="px-4 py-4 border-l border-gray-100">
                              <div className="text-orange-900 font-bold">${(avgFactoryPrice * surchargePercent).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                              <div className="text-orange-700 text-xs">₪{(avgFactoryPrice * inputs.exchangeRate * surchargePercent).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            </td>
                          );
                        })()}
                        {totalFactoryPriceCol > 0 && (
                          <td className="px-4 py-4 border-l border-gray-100">
                            <div className="text-gray-900 font-bold">${summary.totalFactoryPriceUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            <div className="text-gray-600 text-xs">₪{(summary.totalFactoryPriceUSD * inputs.exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          </td>
                        )}
                        {priceCol > 0 && (
                          <td className="px-4 py-4">
                            <div className="text-blue-800 font-semibold">-</div>
                            <div className="text-green-700 font-bold text-xs">-</div>
                          </td>
                        )}
                        {totalCustomerPriceCol > 0 && (() => {
                          const totalCustomerPriceILS = results.reduce((sum, curr) => sum + (curr.priceILS * curr.totalUnits), 0);
                          const totalCustomerPriceUSD = totalCustomerPriceILS / inputs.exchangeRate;
                          return (
                            <td className="px-4 py-4 border-l border-gray-100">
                              <div className="text-blue-900 font-bold">${totalCustomerPriceUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                              <div className="text-blue-700 text-xs">₪{totalCustomerPriceILS.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            </td>
                          );
                        })()}
                        {profitCols > 0 && isColumnVisible('totalProfit') && (
                          <td colSpan={profitCols} className="px-4 py-4">
                            <div className="text-emerald-800 text-lg font-semibold">רווח צפוי: ${(summary.totalProfitILS / inputs.exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            <div className="text-emerald-700 text-sm">₪{summary.totalProfitILS.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          </td>
                        )}
                        {shippingCol > 0 && (() => {
                          return (
                            <td className="px-4 py-4 border-l border-gray-100">
                              <div className="text-purple-800 font-semibold">-</div>
                              <div className="text-purple-600 text-xs">-</div>
                            </td>
                          );
                        })()}
                        {priceWithShippingCol > 0 && (() => {
                          const totalPriceWithShippingILS = results.reduce((sum, curr) => sum + (curr.priceWithShippingILS * curr.totalUnits), 0);
                          const totalPriceWithShippingUSD = totalPriceWithShippingILS / inputs.exchangeRate;
                          return (
                            <td className="px-4 py-4 border-l border-gray-100">
                              <div className="text-indigo-800 font-semibold">${totalPriceWithShippingUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                              <div className="text-indigo-600 text-xs">₪{totalPriceWithShippingILS.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            </td>
                          );
                        })()}
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
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${viewMode === 'seller' && summary.totalUnknownExpensesILS > 0 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-4 md:gap-6 mb-6 md:mb-8`}>
          <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 border-r-4 border-indigo-500 p-4 md:p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs md:text-sm font-semibold text-indigo-700">סך יחידות במכולה</h3>
              <div className="w-8 h-8 md:w-10 md:h-10 bg-indigo-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 md:w-6 md:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-bold text-indigo-900">{summary.totalUnits.toLocaleString()}</p>
              <p className="text-sm md:text-base font-semibold text-indigo-700">יחידות</p>
            </div>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-r-4 border-blue-500 p-4 md:p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs md:text-sm font-semibold text-blue-700">נפח מנוצל</h3>
              <div className="w-8 h-8 md:w-10 md:h-10 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 md:w-6 md:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4 4 0 003 15z" />
                </svg>
              </div>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-bold text-blue-900">{summary.totalCBMUtilized.toFixed(2)}</p>
              <p className="text-sm md:text-base font-semibold text-blue-700">/ {CONTAINER_CAPACITIES[inputs.containerType]} CBM</p>
            </div>
          </div>
          {viewMode === 'seller' && (
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 border-r-4 border-purple-500 p-4 md:p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs md:text-sm font-semibold text-purple-700">סך השקעה</h3>
                <div className="w-8 h-8 md:w-10 md:h-10 bg-purple-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 md:w-6 md:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div>
                <p className="text-2xl md:text-3xl font-bold text-purple-900">${summary.totalInvestmentUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                <p className="text-sm md:text-base font-semibold text-purple-700">₪{(summary.totalInvestmentUSD * inputs.exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
          )}
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-r-4 border-emerald-500 p-4 md:p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs md:text-sm font-semibold text-emerald-700">סך רווח צפוי</h3>
              <div className="w-8 h-8 md:w-10 md:h-10 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 md:w-6 md:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-bold text-emerald-900">${(summary.totalProfitILS / inputs.exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-sm md:text-base font-semibold text-emerald-700">₪{summary.totalProfitILS.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </div>
          {viewMode === 'seller' && summary.totalUnknownExpensesILS > 0 && (
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 border-r-4 border-orange-500 p-4 md:p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs md:text-sm font-semibold text-orange-700">
                  הוצאות לא ידועות {inputs.unknownExpensesType === 'percent' ? `(${inputs.unknownExpensesValue}%)` : '(סכום קבוע)'}
                </h3>
                <div className="w-8 h-8 md:w-10 md:h-10 bg-orange-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 md:w-6 md:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div>
                <p className="text-2xl md:text-3xl font-bold text-orange-900">${(summary.totalUnknownExpensesILS / inputs.exchangeRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                <p className="text-sm md:text-base font-semibold text-orange-700">₪{summary.totalUnknownExpensesILS.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
            </div>
          )}
        </div>
          </>
        )}

        {/* Save Order Dialog */}
        {showSaveDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" dir="rtl">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-xl font-bold mb-4 text-gray-800">שמור הזמנה</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  שם ההזמנה:
                </label>
                <input
                  type="text"
                  value={orderName}
                  onChange={(e) => setOrderName(e.target.value)}
                  className="w-full border-gray-300 border rounded-md px-3 py-2 text-base"
                  placeholder="הזן שם להזמנה"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveOrder();
                    }
                  }}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowSaveDialog(false);
                    setOrderName('');
                  }}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
                >
                  ביטול
                </button>
                <button
                  onClick={handleSaveOrder}
                  disabled={loading || !orderName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {loading ? 'שומר...' : 'שמור'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
