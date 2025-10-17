/**
 * Format a number with thousand separators
 * @param value - The number to format
 * @returns Formatted string (e.g., 1,234,567)
 */
export const formatNumber = (value: number): string => {
  if (typeof value !== 'number' || isNaN(value)) return '0';

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
};

/**
 * Format a number with suffix (K, M, B)
 * @param value - The number to format
 * @returns Formatted string with suffix (e.g., 1.23M)
 */
export const formatNumberWithSuffix = (value: number): string => {
  if (typeof value !== 'number' || isNaN(value)) return '0';

  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 1e9) {
    return `${sign}${(absValue / 1e9).toFixed(2)}B`;
  } else if (absValue >= 1e6) {
    return `${sign}${(absValue / 1e6).toFixed(2)}M`;
  } else if (absValue >= 1e3) {
    return `${sign}${(absValue / 1e3).toFixed(2)}K`;
  }

  return formatNumber(value);
};

/**
 * Format a number as percentage
 * @param value - The number to format (0-1 or 0-100)
 * @param isDecimal - Whether the value is in decimal form (0-1)
 * @returns Formatted percentage string (e.g., 45.67%)
 */
export const formatPercentage = (value: number, isDecimal: boolean = true): string => {
  if (typeof value !== 'number' || isNaN(value)) return '0%';

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    style: 'percent',
  }).format(isDecimal ? value : value / 100);
};

/**
 * Format a number as currency
 * @param value - The number to format
 * @param currency - Currency code (default: USD)
 * @returns Formatted currency string (e.g., $1,234.56)
 */
export const formatCurrency = (value: number, currency: string = 'USD'): string => {
  if (typeof value !== 'number' || isNaN(value)) return '$0.00';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

/**
 * Shorten X-axis labels for better display
 * @param value - The label value
 * @param maxLength - Maximum length before truncation
 * @returns Shortened label
 */
export const shortenLabel = (value: string, maxLength: number = 15): string => {
  if (typeof value !== 'string') return String(value);

  if (value.length <= maxLength) return value;

  return `${value.substring(0, maxLength)}...`;
};

/**
 * Calculate optimal tick count based on data size
 * @param dataLength - Number of data points
 * @returns Optimal number of ticks
 */
export const calculateTickCount = (dataLength: number): number => {
  if (dataLength <= 5) return dataLength;
  if (dataLength <= 10) return 5;
  if (dataLength <= 20) return 7;
  return 10;
};

/**
 * Generate gradient definitions for charts
 * @param id - Unique gradient ID
 * @param color - Base color
 * @returns Gradient definition object
 */
export const createGradient = (id: string, color: string) => ({
  id,
  x1: '0',
  y1: '0',
  x2: '0',
  y2: '1',
  stops: [
    { offset: '5%', stopColor: color, stopOpacity: 0.8 },
    { offset: '95%', stopColor: color, stopOpacity: 0.1 },
  ],
});
