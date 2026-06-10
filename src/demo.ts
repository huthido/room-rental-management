import { rmSync } from 'node:fs';
import {
  createRoom,
  createTenant,
  addMeterReading,
  calculateBill,
  markBillAsPaid,
  applyLateFee,
  getBillsByRoom,
  getAllRooms,
  getAllTenants,
  formatCurrency,
  initDatabase,
  closeDatabase,
} from './index.js';

const DB_PATH = 'data/demo.db';

function main() {
  console.log('=== HỆ THỐNG QUẢN LÝ PHÒNG TRỌ ===\n');

  rmSync(DB_PATH, { force: true });
  initDatabase(DB_PATH);

  const room = createRoom({
    roomNumber: '101',
    floor: 1,
    area: 25,
    monthlyRent: 3000000,
    status: 'available',
  });
  console.log(`Đã tạo phòng: ${room.roomNumber}, Tầng ${room.floor}`);

  const tenant = createTenant({
    name: 'Nguyễn Văn A',
    phoneNumber: '0901234567',
    idCardNumber: '123456789012',
    roomId: room.id,
    moveInDate: new Date('2026-01-01'),
    deposit: 3000000,
    active: true,
  });
  console.log(`Đã thêm người thuê: ${tenant.name}\n`);

  addMeterReading({
    roomId: room.id,
    month: 5,
    year: 2026,
    electricOld: 1000,
    electricNew: 1180,
    waterOld: 25,
    waterNew: 35,
    readingDate: new Date(),
  });
  console.log('Đã ghi chỉ số điện nước tháng 5/2026\n');

  const bill = calculateBill(room.id, tenant.id, 5, 2026);
  if (bill) {
    console.log('=== HÓA ĐƠN THÁNG 5/2026 ===');
    console.log(`Phòng: ${room.roomNumber}`);
    console.log(`Người thuê: ${tenant.name}`);
    console.log(`Tiền phòng: ${formatCurrency(bill.roomRent)}`);
    console.log(`Tiền điện (${bill.electricUsage} kWh): ${formatCurrency(bill.electricCost)}`);
    console.log(`Tiền nước (${bill.waterUsage} m³): ${formatCurrency(bill.waterCost)}`);
    console.log(`TỔNG CỘNG: ${formatCurrency(bill.totalAmount)}`);
    console.log(`Trạng thái: ${bill.paid ? 'Đã thanh toán' : 'Chưa thanh toán'}\n`);

    const lateBill = applyLateFee(bill.id);
    if (lateBill) {
      console.log(`Áp phí trễ hạn 5%: +${formatCurrency(lateBill.lateFee)}`);
      console.log(`Tổng sau phí trễ hạn: ${formatCurrency(lateBill.totalAmount)}\n`);
    }

    markBillAsPaid(bill.id);
    console.log('Đã đánh dấu hóa đơn là đã thanh toán');
  }

  const bills = getBillsByRoom(room.id);
  console.log(`\nTổng số hóa đơn của phòng ${room.roomNumber}: ${bills.length}`);

  // Chứng minh persistence: đóng DB rồi mở lại, dữ liệu vẫn còn
  closeDatabase();
  initDatabase(DB_PATH);
  console.log('\n=== MỞ LẠI DATABASE (kiểm tra persistence) ===');
  console.log(`Số phòng đã lưu: ${getAllRooms().length}`);
  console.log(`Số người thuê đã lưu: ${getAllTenants().length}`);
  closeDatabase();
}

main();
