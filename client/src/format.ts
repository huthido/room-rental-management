export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('vi-VN');
}

export function monthYear(month: number, year: number): string {
  return `${String(month).padStart(2, '0')}/${year}`;
}

export function currentPeriod(): { month: number; year: number } {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export function nextPeriod(p: { month: number; year: number }): { month: number; year: number } {
  return p.month === 12 ? { month: 1, year: p.year + 1 } : { month: p.month + 1, year: p.year };
}

export function prevPeriod(p: { month: number; year: number }): { month: number; year: number } {
  return p.month === 1 ? { month: 12, year: p.year - 1 } : { month: p.month - 1, year: p.year };
}

export function shiftMonth(month: number, year: number, offset: number): { month: number; year: number } {
  const idx = month - 1 + offset;
  return { month: ((idx % 12) + 12) % 12 + 1, year: year + Math.floor(idx / 12) };
}
