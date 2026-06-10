export type RoomStatus = 'available' | 'occupied' | 'maintenance';

export interface Room {
  id: string;
  roomNumber: string;
  floor: number;
  area: number;
  monthlyRent: number;
  /** Giá điện riêng của phòng — không có thì dùng giá mặc định */
  electricRate?: number;
  /** Giá nước riêng của phòng — không có thì dùng giá mặc định */
  waterRate?: number;
  /** Tiền phòng kỳ M là của tháng nào: 0 = chính tháng M, 1 = tháng sau, -1 = tháng trước */
  rentMonthOffset?: number;
  status: RoomStatus;
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Tenant {
  id: string;
  name: string;
  phoneNumber: string;
  idCardNumber: string;
  roomId: string;
  moveInDate: string;
  moveOutDate?: string;
  deposit: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
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
  readingDate: string;
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
  rentMonth: number;
  rentYear: number;
  extraFees: number;
  lateFee: number;
  totalAmount: number;
  paid: boolean;
  paidDate?: string;
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
}

export interface NewMonthResult {
  month: number;
  year: number;
  carried: number;
  skippedNoPrev: number;
  skippedExisting: number;
}
