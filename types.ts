
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
  targetMargin: number;
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
