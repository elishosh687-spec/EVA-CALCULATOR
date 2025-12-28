
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
  mixPercents: {
    small: number;
    medium: number;
    large: number;
  };
  quantities?: {
    small: number;
    medium: number;
    large: number;
  };
  shippingCostUSD: number;
  targetMargin: number;
  exchangeRate: number;
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
  shippingPerUnit: number;
  relativeShippingTotal: number;
  priceUSD: number;
  priceILS: number;
  landingCostILS: number;
  totalProfitILS: number;
  totalProfitUSD: number; // Total profit in USD
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
