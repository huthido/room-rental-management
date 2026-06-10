export function getCurrentMonth(): { month: number; year: number } {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export function shiftMonth(month: number, year: number, offset: number): { month: number; year: number } {
  const idx = month - 1 + offset;
  return { month: ((idx % 12) + 12) % 12 + 1, year: year + Math.floor(idx / 12) };
}

export function getPreviousMonth(month: number, year: number): { month: number; year: number } {
  if (month === 1) {
    return { month: 12, year: year - 1 };
  }
  return { month: month - 1, year };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

export function generateMonthYearString(month: number, year: number): string {
  return `${String(month).padStart(2, '0')}/${year}`;
}
