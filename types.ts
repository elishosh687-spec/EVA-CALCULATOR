
export interface Product {
  id: string;
  name: string;
  dimensions: string; // Product dimensions description for customer (e.g., "33 x 30 x 11 cm")
  description: string; // Product description/explanation text
  masterCartonCBM: number; // Master carton CBM (direct input, not calculated)
  unitsPerCarton: number;
  factoryPriceUSD: number;
  profitMargin: number; // Individual profit margin percentage
  mixPercent?: number; // Percentage of container volume (calculated or user input)
  quantity?: number; // Direct quantity input (optional)
}

export interface BoxSizeData {
  id: string;
  name: string;
  dimensions: string;
  internalDimensions: string;
  masterCBM: number;
  unitsPerCarton: number;
  factoryPriceUSD: number;
}

export interface UserInputs {
  containerType: '20' | '40';
  products: Product[];
  exchangeRate: number;
  shippingCostUSD: number; // Total shipping cost in USD
  unknownExpensesType: 'percent' | 'fixed';
  unknownExpensesValue: number; // Percentage if type is 'percent', fixed amount in ILS if type is 'fixed'
}

export interface CalculationResult {
  size: BoxSizeData;
  allocatedCBM: number;
  cartons: number;
  totalUnits: number;
  totalCBM: number; // Total CBM for this size (allocatedCBM)
  totalFactoryPriceUSD: number; // Total factory price for all units (factoryPriceUSD * totalUnits)
  totalExpensesUSD: number; // Total expenses (factory price + proportional unknown expenses) in USD
  priceUSD: number;
  priceILS: number;
  landingCostILS: number;
  totalProfitILS: number;
  totalProfitUSD: number; // Total profit in USD
  shippingPerUnitUSD: number; // Shipping cost per unit (total shipping / total units) in USD
  shippingPerUnitILS: number; // Shipping cost per unit (total shipping / total units) in ILS
  priceWithShippingUSD: number; // Customer price per unit including shipping in USD
  priceWithShippingILS: number; // Customer price per unit including shipping in ILS
}

export interface SummaryData {
  totalUnits: number;
  totalCBMUtilized: number;
  totalCBM: number; // Sum of all totalCBM from all sizes
  totalFactoryPriceUSD: number; // Sum of all totalFactoryPriceUSD from all sizes
  totalInvestmentUSD: number;
  totalProfitILS: number;
  totalUnknownExpensesILS: number;
}
