export interface Room {
  id: string;
  roomNumber: string;
  floor: number;
  area: number;
  monthlyRent: number;
  /** Giá điện riêng của phòng (VND/kWh) — bỏ trống thì dùng giá mặc định */
  electricRate?: number;
  /** Giá nước riêng của phòng (VND/m³) — bỏ trống thì dùng giá mặc định */
  waterRate?: number;
  /**
   * Tiền phòng trong hóa đơn kỳ M là của tháng nào:
   * 0 = chính tháng M, 1 = tháng M+1 (thu trước), -1 = tháng M-1 (thu sau).
   */
  rentMonthOffset?: number;
  status: 'available' | 'occupied' | 'maintenance';
  tenantId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Tenant {
  id: string;
  name: string;
  phoneNumber: string;
  idCardNumber: string;
  roomId: string;
  moveInDate: Date;
  moveOutDate?: Date;
  deposit: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeterReading {
  id: string;
  roomId: string;
  month: number;
  year: number;
  electricOld: number;
  electricNew: number;
  waterOld: number;
  waterNew: number;
  readingDate: Date;
}

export interface MonthlyBill {
  id: string;
  roomId: string;
  tenantId: string;
  month: number;
  year: number;
  electricUsage: number;
  waterUsage: number;
  electricRate: number;
  waterRate: number;
  electricCost: number;
  waterCost: number;
  roomRent: number;
  /** Tiền phòng trong hóa đơn này là của tháng/năm nào */
  rentMonth: number;
  rentYear: number;
  extraFees: number;
  lateFee: number;
  totalAmount: number;
  paid: boolean;
  paidDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillingConfig {
  electricRate: number;
  waterRate: number;
  lateFeeRate: number;
}

export interface TenantSummary {
  tenant: Tenant;
  roomNumber: string | null;
  billCount: number;
  totalBilled: number;
  totalPaid: number;
  totalUnpaid: number;
}

export interface ExtraFee {
  id: string;
  roomId: string;
  month: number;
  year: number;
  name: string;
  amount: number;
  createdAt: Date;
}

export interface NewMonthResult {
  month: number;
  year: number;
  carried: number;
  skippedNoPrev: number;
  skippedExisting: number;
}
