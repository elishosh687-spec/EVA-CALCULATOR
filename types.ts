
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
}

export interface CalculationResult {
  size: BoxSizeData;
  allocatedCBM: number;
  cartons: number;
  totalUnits: number;
  shippingPerUnit: number;
  relativeShippingTotal: number;
  priceUSD: number;
  priceILS: number;
  landingCostILS: number;
  totalProfitILS: number;
}

export interface SummaryData {
  totalUnits: number;
  totalCBMUtilized: number;
  totalInvestmentUSD: number;
  totalProfitILS: number;
}
