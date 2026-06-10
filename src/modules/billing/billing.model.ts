import { MonthlyBill, MeterReading, BillingConfig, ExtraFee, NewMonthResult } from '../../types/index.js';
import { getDatabase } from '../../db/database.js';
import { getRoom, getRoomsByStatus } from '../rooms/room.model.js';
import { getTenant } from '../tenants/tenant.model.js';
import { getPreviousMonth, shiftMonth } from '../../utils/date.utils.js';

interface MeterReadingRow {
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

interface ExtraFeeRow {
  id: string;
  roomId: string;
  month: number;
  year: number;
  name: string;
  amount: number;
  createdAt: string;
}

interface BillRow {
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
  paid: number;
  paidDate: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToReading(row: MeterReadingRow): MeterReading {
  return { ...row, readingDate: new Date(row.readingDate) };
}

function rowToBill(row: BillRow): MonthlyBill {
  return {
    ...row,
    paid: row.paid === 1,
    paidDate: row.paidDate ? new Date(row.paidDate) : undefined,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

export function addMeterReading(data: Omit<MeterReading, 'id'>): MeterReading {
  if (data.month < 1 || data.month > 12) {
    throw new Error(`Tháng không hợp lệ: ${data.month}`);
  }
  if (!getRoom(data.roomId)) {
    throw new Error(`Phòng không tồn tại: ${data.roomId}`);
  }
  if (data.electricNew < data.electricOld) {
    throw new Error('Chỉ số điện mới không được nhỏ hơn chỉ số cũ');
  }
  if (data.waterNew < data.waterOld) {
    throw new Error('Chỉ số nước mới không được nhỏ hơn chỉ số cũ');
  }
  if (getMeterReadingByMonth(data.roomId, data.month, data.year)) {
    throw new Error(`Đã có chỉ số điện nước cho phòng này trong tháng ${data.month}/${data.year}`);
  }
  const id = crypto.randomUUID();
  const reading: MeterReading = { ...data, id };
  getDatabase()
    .prepare(
      `INSERT INTO meter_readings (id, roomId, month, year, electricOld, electricNew, waterOld, waterNew, readingDate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      reading.id,
      reading.roomId,
      reading.month,
      reading.year,
      reading.electricOld,
      reading.electricNew,
      reading.waterOld,
      reading.waterNew,
      reading.readingDate.toISOString()
    );
  return reading;
}

export function getMeterReading(id: string): MeterReading | undefined {
  const row = getDatabase().prepare('SELECT * FROM meter_readings WHERE id = ?').get(id) as
    | MeterReadingRow
    | undefined;
  return row ? rowToReading(row) : undefined;
}

export function getMeterReadingByMonth(roomId: string, month: number, year: number): MeterReading | undefined {
  const row = getDatabase()
    .prepare('SELECT * FROM meter_readings WHERE roomId = ? AND month = ? AND year = ?')
    .get(roomId, month, year) as MeterReadingRow | undefined;
  return row ? rowToReading(row) : undefined;
}

export function updateMeterReading(
  id: string,
  data: Partial<Pick<MeterReading, 'electricOld' | 'electricNew' | 'waterOld' | 'waterNew' | 'readingDate'>>
): MeterReading | undefined {
  const reading = getMeterReading(id);
  if (!reading) return undefined;
  const billExists = getDatabase()
    .prepare('SELECT id FROM bills WHERE roomId = ? AND month = ? AND year = ?')
    .get(reading.roomId, reading.month, reading.year);
  if (billExists) {
    throw new Error(`Kỳ ${reading.month}/${reading.year} đã có hóa đơn, không thể sửa chỉ số`);
  }
  const updated: MeterReading = { ...reading, ...data, id };
  if (updated.electricNew < updated.electricOld) {
    throw new Error('Chỉ số điện mới không được nhỏ hơn chỉ số cũ');
  }
  if (updated.waterNew < updated.waterOld) {
    throw new Error('Chỉ số nước mới không được nhỏ hơn chỉ số cũ');
  }
  getDatabase()
    .prepare(
      `UPDATE meter_readings
       SET electricOld = ?, electricNew = ?, waterOld = ?, waterNew = ?, readingDate = ?
       WHERE id = ?`
    )
    .run(
      updated.electricOld,
      updated.electricNew,
      updated.waterOld,
      updated.waterNew,
      updated.readingDate.toISOString(),
      id
    );
  return updated;
}

function rowToFee(row: ExtraFeeRow): ExtraFee {
  return { ...row, createdAt: new Date(row.createdAt) };
}

function assertNoBillForPeriod(roomId: string, month: number, year: number, action: string): void {
  const existing = getDatabase()
    .prepare('SELECT id FROM bills WHERE roomId = ? AND month = ? AND year = ?')
    .get(roomId, month, year);
  if (existing) {
    throw new Error(`Kỳ ${month}/${year} đã có hóa đơn, không thể ${action}`);
  }
}

export function addExtraFee(data: Omit<ExtraFee, 'id' | 'createdAt'>): ExtraFee {
  if (data.month < 1 || data.month > 12) {
    throw new Error(`Tháng không hợp lệ: ${data.month}`);
  }
  if (!getRoom(data.roomId)) {
    throw new Error(`Phòng không tồn tại: ${data.roomId}`);
  }
  const name = data.name.trim();
  if (!name) {
    throw new Error('Tên khoản phí không được để trống');
  }
  if (!Number.isFinite(data.amount) || data.amount === 0) {
    throw new Error('Số tiền khoản phí không hợp lệ');
  }
  assertNoBillForPeriod(data.roomId, data.month, data.year, 'thêm phí khác');
  const id = crypto.randomUUID();
  const now = new Date();
  getDatabase()
    .prepare('INSERT INTO extra_fees (id, roomId, month, year, name, amount, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, data.roomId, data.month, data.year, name, data.amount, now.toISOString());
  return { ...data, name, id, createdAt: now };
}

export function deleteExtraFee(id: string): boolean {
  const row = getDatabase().prepare('SELECT * FROM extra_fees WHERE id = ?').get(id) as ExtraFeeRow | undefined;
  if (!row) return false;
  assertNoBillForPeriod(row.roomId, row.month, row.year, 'xóa phí khác');
  return getDatabase().prepare('DELETE FROM extra_fees WHERE id = ?').run(id).changes > 0;
}

export function getExtraFees(roomId: string, month: number, year: number): ExtraFee[] {
  const rows = getDatabase()
    .prepare('SELECT * FROM extra_fees WHERE roomId = ? AND month = ? AND year = ? ORDER BY createdAt')
    .all(roomId, month, year) as unknown as ExtraFeeRow[];
  return rows.map(rowToFee);
}

export function getExtraFeesByPeriod(month: number, year: number): ExtraFee[] {
  const rows = getDatabase()
    .prepare('SELECT * FROM extra_fees WHERE month = ? AND year = ? ORDER BY createdAt')
    .all(month, year) as unknown as ExtraFeeRow[];
  return rows.map(rowToFee);
}

/**
 * Đơn giá hiệu lực của một phòng: giá riêng của phòng nếu có,
 * không thì dùng giá mặc định toàn cục.
 */
export function getEffectiveRatesForRoom(roomId: string): BillingConfig & { source: 'room' | 'default' } {
  const base = getBillingConfig();
  const room = getRoom(roomId);
  const hasCustom = room?.electricRate !== undefined || room?.waterRate !== undefined;
  return {
    electricRate: room?.electricRate ?? base.electricRate,
    waterRate: room?.waterRate ?? base.waterRate,
    lateFeeRate: base.lateFeeRate,
    source: hasCustom ? 'room' : 'default',
  };
}

export function createNewMonth(month: number, year: number): NewMonthResult {
  if (month < 1 || month > 12) {
    throw new Error(`Tháng không hợp lệ: ${month}`);
  }
  const prev = getPreviousMonth(month, year);
  let carried = 0;
  let skippedNoPrev = 0;
  let skippedExisting = 0;
  for (const room of getRoomsByStatus('occupied')) {
    if (getMeterReadingByMonth(room.id, month, year)) {
      skippedExisting++;
      continue;
    }
    const prevReading = getMeterReadingByMonth(room.id, prev.month, prev.year);
    if (!prevReading) {
      skippedNoPrev++;
      continue;
    }
    addMeterReading({
      roomId: room.id,
      month,
      year,
      electricOld: prevReading.electricNew,
      electricNew: prevReading.electricNew,
      waterOld: prevReading.waterNew,
      waterNew: prevReading.waterNew,
      readingDate: new Date(),
    });
    carried++;
  }
  return { month, year, carried, skippedNoPrev, skippedExisting };
}

export function calculateBill(
  roomId: string,
  tenantId: string,
  month: number,
  year: number,
  config: BillingConfig = getEffectiveRatesForRoom(roomId)
): MonthlyBill | null {
  const room = getRoom(roomId);
  if (!room) {
    throw new Error(`Phòng không tồn tại: ${roomId}`);
  }
  if (!getTenant(tenantId)) {
    throw new Error(`Người thuê không tồn tại: ${tenantId}`);
  }
  const existing = getDatabase()
    .prepare('SELECT id FROM bills WHERE roomId = ? AND month = ? AND year = ?')
    .get(roomId, month, year);
  if (existing) {
    throw new Error(`Đã có hóa đơn cho phòng này trong tháng ${month}/${year}`);
  }

  const reading = getMeterReadingByMonth(roomId, month, year);
  if (!reading) return null;

  const electricUsage = reading.electricNew - reading.electricOld;
  const waterUsage = reading.waterNew - reading.waterOld;
  const electricCost = electricUsage * config.electricRate;
  const waterCost = waterUsage * config.waterRate;
  const roomRent = room.monthlyRent;
  // Tiền phòng của kỳ này là của tháng nào (thu trước/thu sau theo thiết lập phòng)
  const rentPeriod = shiftMonth(month, year, room.rentMonthOffset ?? 0);
  const extraFees = getExtraFees(roomId, month, year).reduce((sum, fee) => sum + fee.amount, 0);

  const id = crypto.randomUUID();
  const now = new Date();
  const bill: MonthlyBill = {
    id,
    roomId,
    tenantId,
    month,
    year,
    electricUsage,
    waterUsage,
    electricRate: config.electricRate,
    waterRate: config.waterRate,
    electricCost,
    waterCost,
    roomRent,
    rentMonth: rentPeriod.month,
    rentYear: rentPeriod.year,
    extraFees,
    lateFee: 0,
    totalAmount: electricCost + waterCost + roomRent + extraFees,
    paid: false,
    createdAt: now,
    updatedAt: now,
  };

  getDatabase()
    .prepare(
      `INSERT INTO bills (id, roomId, tenantId, month, year, electricUsage, waterUsage, electricRate, waterRate,
                          electricCost, waterCost, roomRent, rentMonth, rentYear, extraFees, lateFee, totalAmount, paid, paidDate, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      bill.id,
      bill.roomId,
      bill.tenantId,
      bill.month,
      bill.year,
      bill.electricUsage,
      bill.waterUsage,
      bill.electricRate,
      bill.waterRate,
      bill.electricCost,
      bill.waterCost,
      bill.roomRent,
      bill.rentMonth,
      bill.rentYear,
      bill.extraFees,
      bill.lateFee,
      bill.totalAmount,
      0,
      null,
      now.toISOString(),
      now.toISOString()
    );
  return bill;
}

/**
 * Hủy hóa đơn — mở khóa lại chỉ số và phí khác của kỳ đó.
 */
export function deleteBill(id: string): boolean {
  return getDatabase().prepare('DELETE FROM bills WHERE id = ?').run(id).changes > 0;
}

export function getBill(id: string): MonthlyBill | undefined {
  const row = getDatabase().prepare('SELECT * FROM bills WHERE id = ?').get(id) as BillRow | undefined;
  return row ? rowToBill(row) : undefined;
}

export function getAllBills(): MonthlyBill[] {
  const rows = getDatabase().prepare('SELECT * FROM bills ORDER BY year, month').all() as unknown as BillRow[];
  return rows.map(rowToBill);
}

export function getBillsByRoom(roomId: string): MonthlyBill[] {
  const rows = getDatabase()
    .prepare('SELECT * FROM bills WHERE roomId = ? ORDER BY year, month')
    .all(roomId) as unknown as BillRow[];
  return rows.map(rowToBill);
}

export function getBillsByTenant(tenantId: string): MonthlyBill[] {
  const rows = getDatabase()
    .prepare('SELECT * FROM bills WHERE tenantId = ? ORDER BY year, month')
    .all(tenantId) as unknown as BillRow[];
  return rows.map(rowToBill);
}

export function getBillsByMonth(month: number, year: number): MonthlyBill[] {
  const rows = getDatabase()
    .prepare('SELECT * FROM bills WHERE month = ? AND year = ?')
    .all(month, year) as unknown as BillRow[];
  return rows.map(rowToBill);
}

export function markBillAsPaid(id: string, paidDate: Date = new Date()): MonthlyBill | undefined {
  const bill = getBill(id);
  if (!bill) return undefined;
  const now = new Date();
  getDatabase()
    .prepare('UPDATE bills SET paid = 1, paidDate = ?, updatedAt = ? WHERE id = ?')
    .run(paidDate.toISOString(), now.toISOString(), id);
  return { ...bill, paid: true, paidDate, updatedAt: now };
}

export function applyLateFee(id: string): MonthlyBill | undefined {
  const bill = getBill(id);
  if (!bill) return undefined;
  if (bill.paid) {
    throw new Error('Hóa đơn đã thanh toán, không thể áp phí trễ hạn');
  }
  if (bill.lateFee > 0) {
    throw new Error('Hóa đơn đã được áp phí trễ hạn');
  }
  const { lateFeeRate } = getBillingConfig();
  const lateFee = Math.round(bill.totalAmount * lateFeeRate);
  const totalAmount = bill.totalAmount + lateFee;
  const now = new Date();
  getDatabase()
    .prepare('UPDATE bills SET lateFee = ?, totalAmount = ?, updatedAt = ? WHERE id = ?')
    .run(lateFee, totalAmount, now.toISOString(), id);
  return { ...bill, lateFee, totalAmount, updatedAt: now };
}

export function getBillingConfig(): BillingConfig {
  const row = getDatabase()
    .prepare('SELECT electricRate, waterRate, lateFeeRate FROM billing_config WHERE id = 1')
    .get() as unknown as BillingConfig;
  return { electricRate: row.electricRate, waterRate: row.waterRate, lateFeeRate: row.lateFeeRate };
}

export function updateBillingConfig(newConfig: Partial<BillingConfig>): BillingConfig {
  const config = { ...getBillingConfig(), ...newConfig };
  getDatabase()
    .prepare('UPDATE billing_config SET electricRate = ?, waterRate = ?, lateFeeRate = ? WHERE id = 1')
    .run(config.electricRate, config.waterRate, config.lateFeeRate);
  return config;
}
