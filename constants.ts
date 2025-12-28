
import { BoxSizeData } from './types';

export const BOX_SIZES: BoxSizeData[] = [
  {
    id: 'small',
    name: 'Small',
    dimensions: '33 x 30 x 11',
    internalDimensions: '21.5 x 18.5',
    masterCBM: 0.059,
    unitsPerCarton: 4,
    factoryPriceUSD: 4.48,
  },
  {
    id: 'medium',
    name: 'Medium',
    dimensions: '37 x 34 x 12',
    internalDimensions: '21.5 x 18.5',
    masterCBM: 0.11,
    unitsPerCarton: 6,
    factoryPriceUSD: 5.51,
  },
  {
    id: 'large',
    name: 'Large',
    dimensions: '42 x 37 x 18',
    internalDimensions: '22 x 18',
    masterCBM: 0.128,
    unitsPerCarton: 6,
    factoryPriceUSD: 5.79,
  }
];

export const CONTAINER_CAPACITIES = {
  '20': 28.2,
  '40': 67.2
};
