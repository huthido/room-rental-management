import { useEffect, useState, useCallback } from 'react';
import { api } from './api';
import { formatCurrency } from './format';
import { Msg, type Notice } from './components/Msg';
import { confirmDialog } from './components/ConfirmHost';
import { UtilityCell } from './components/UtilityCell';
import { FeesCell } from './components/FeesCell';
import { RentCell } from './components/RentCell';
import type { BillingConfig, ExtraFee, MonthlyBill, MeterReading, Room, Tenant } from './types';

interface RowData {
  room: Room;
  tenant: Tenant | null;
  reading: MeterReading | null;
  bill: MonthlyBill | null;
  fees: ExtraFee[];
}

type RowState = 'available' | 'maintenance' | 'no-reading' | 'carried' | 'no-bill' | 'unpaid' | 'paid';

/**
 * Tạm tính tổng tiền khi chưa tạo hóa đơn:
 * tiền phòng + điện/nước theo chỉ số hiện có (giá riêng của phòng
 * hoặc giá mặc định) + các khoản phí khác đã nhập.
 */
function estimateTotal(d: RowData, config: BillingConfig): number {
  if (d.room.status !== 'occupied') return 0;
  const electricRate = d.room.electricRate ?? config.electricRate;
  const waterRate = d.room.waterRate ?? config.waterRate;
  const r = d.reading;
  const electric = r ? (r.electricNew - r.electricOld) * electricRate : 0;
  const water = r ? (r.waterNew - r.waterOld) * waterRate : 0;
  const fees = d.fees.reduce((sum, f) => sum + f.amount, 0);
  return d.room.monthlyRent + electric + water + fees;
}

function rowState(d: RowData): RowState {
  if (d.room.status === 'maintenance') return 'maintenance';
  if (d.room.status === 'available') return 'available';
  if (!d.bill && !d.reading) return 'no-reading';
  if (!d.bill && d.reading) {
    const r = d.reading;
    // Chỉ số được chuyển từ tháng trước (new === old) — chưa chốt công tơ
    if (r.electricNew === r.electricOld && r.waterNew === r.waterOld) return 'carried';
    return 'no-bill';
  }
  return d.bill!.paid ? 'paid' : 'unpaid';
}

interface Props {
  period: { month: number; year: number };
  refreshKey: number;
  onRefresh: () => void;
  onAddTenant: (room: Room) => void;
  onEditRoom: (room: Room) => void;
  onEditTenant: (tenant: Tenant) => void;
}

export function Dashboard({ period, refreshKey, onRefresh, onAddTenant, onEditRoom, onEditTenant }: Props) {
  const [rows, setRows] = useState<RowData[]>([]);
  const [defaultConfig, setDefaultConfig] = useState<BillingConfig | null>(null);
  // Chỉ hiện "Đang tải" lần đầu — các lần refresh sau giữ nguyên bảng (không giật)
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    try {
      // Toàn bộ dữ liệu kỳ trong 6 request song song (chỉ số lấy cả kỳ 1 lần)
      const [rooms, tenants, bills, allFees, allReadings, config] = await Promise.all([
        api.rooms.list(),
        api.tenants.list(),
        api.bills.list({ month: period.month, year: period.year }),
        api.fees.byPeriod(period.month, period.year),
        api.readings.byPeriod(period.month, period.year),
        api.config.get(),
      ]);
      setDefaultConfig(config);

      const tenantById = new Map(tenants.map(t => [t.id, t]));
      const billByRoom = new Map(bills.map(b => [b.roomId, b]));
      const readingByRoom = new Map(allReadings.map(r => [r.roomId, r]));
      const feesByRoom = new Map<string, ExtraFee[]>();
      for (const fee of allFees) {
        const list = feesByRoom.get(fee.roomId) ?? [];
        list.push(fee);
        feesByRoom.set(fee.roomId, list);
      }

      const sorted = [...rooms].sort((a, b) =>
        a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true })
      );

      setRows(sorted.map(room => ({
        room,
        tenant: room.tenantId ? (tenantById.get(room.tenantId) ?? null) : null,
        reading: readingByRoom.get(room.id) ?? null,
        bill: billByRoom.get(room.id) ?? null,
        fees: feesByRoom.get(room.id) ?? [],
      })));
    } catch (err) {
      setNotice({ kind: 'error', text: (err as Error).message });
    } finally {
      setLoaded(true);
    }
  }, [period.month, period.year, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  async function createBill(d: RowData) {
    if (!d.tenant) return;
    setNotice(null);
    try {
      const bill = await api.bills.calculate({ roomId: d.room.id, tenantId: d.tenant.id, month: period.month, year: period.year });
      setNotice({ kind: 'success', text: `Đã tạo HĐ phòng ${d.room.roomNumber}: ${formatCurrency(bill.totalAmount)}` });
      onRefresh();
    } catch (err) {
      setNotice({ kind: 'error', text: (err as Error).message });
    }
  }

  async function pay(d: RowData) {
    if (!d.bill) return;
    const ok = await confirmDialog(
      `Xác nhận thanh toán ${formatCurrency(d.bill.totalAmount)} — phòng ${d.room.roomNumber}?`,
      { title: 'Thanh toán hóa đơn', confirmLabel: 'Thanh toán' }
    );
    if (!ok) return;
    setNotice(null);
    try {
      await api.bills.pay(d.bill.id);
      setNotice({ kind: 'success', text: `Phòng ${d.room.roomNumber} đã thanh toán` });
      onRefresh();
    } catch (err) {
      setNotice({ kind: 'error', text: (err as Error).message });
    }
  }

  async function cancelBill(d: RowData) {
    if (!d.bill) return;
    const msg = d.bill.paid
      ? `Hóa đơn phòng ${d.room.roomNumber} ĐÃ THANH TOÁN (${formatCurrency(d.bill.totalAmount)}). Hủy sẽ xóa cả thông tin thanh toán. Tiếp tục?`
      : `Hủy hóa đơn phòng ${d.room.roomNumber} (${formatCurrency(d.bill.totalAmount)})? Chỉ số và phí khác của kỳ sẽ mở khóa để sửa.`;
    const ok = await confirmDialog(msg, { title: 'Hủy hóa đơn', confirmLabel: 'Hủy hóa đơn', danger: true });
    if (!ok) return;
    setNotice(null);
    try {
      await api.bills.remove(d.bill.id);
      setNotice({ kind: 'success', text: `Đã hủy hóa đơn phòng ${d.room.roomNumber} — có thể sửa chỉ số/phí và tạo lại` });
      onRefresh();
    } catch (err) {
      setNotice({ kind: 'error', text: (err as Error).message });
    }
  }

  async function endTenancy(d: RowData) {
    if (!d.tenant) return;
    const ok = await confirmDialog(
      `Trả phòng cho ${d.tenant.name} (phòng ${d.room.roomNumber})?\nPhòng sẽ chuyển về "Trống"; thông tin và lịch sử của người thuê vẫn được giữ trong 👥 Thống kê.`,
      { title: 'Trả phòng', confirmLabel: 'Trả phòng', danger: true }
    );
    if (!ok) return;
    setNotice(null);
    try {
      await api.tenants.endTenancy(d.tenant.id);
      setNotice({ kind: 'success', text: `${d.tenant.name} đã trả phòng ${d.room.roomNumber}` });
      onRefresh();
    } catch (err) {
      setNotice({ kind: 'error', text: (err as Error).message });
    }
  }

  const STATE_BADGE: Record<RowState, { label: string; cls: string }> = {
    available:   { label: 'Trống',        cls: 'badge-available' },
    maintenance: { label: 'Bảo trì',      cls: 'badge-maintenance' },
    'no-reading':{ label: 'Chưa ghi CS',  cls: 'badge-maintenance' },
    carried:     { label: 'Chưa ghi CS',  cls: 'badge-maintenance' },
    'no-bill':   { label: 'Chưa có HĐ',  cls: 'badge-maintenance' },
    unpaid:      { label: 'Chưa thanh toán', cls: 'badge-unpaid' },
    paid:        { label: '✓ Đã thanh toán', cls: 'badge-paid' },
  };

  if (!loaded || !defaultConfig) {
    return <div className="dashboard-wrap"><div className="main-card"><div className="empty">Đang tải...</div></div></div>;
  }

  const totals = rows.reduce(
    (acc, d) => {
      if (d.bill) {
        acc.total += d.bill.totalAmount;
        if (d.bill.paid) acc.paid += d.bill.totalAmount;
        else acc.unpaid += d.bill.totalAmount;
        acc.rent += d.bill.roomRent;
        acc.electric += d.bill.electricCost;
        acc.water += d.bill.waterCost;
        acc.fees += d.bill.extraFees + d.bill.lateFee;
      }
      return acc;
    },
    { total: 0, paid: 0, unpaid: 0, rent: 0, electric: 0, water: 0, fees: 0 }
  );

  return (
    <div className="dashboard-wrap">
      <Msg notice={notice} />

      {/* Summary strip */}
      {totals.total > 0 && (
        <div className="summary-strip">
          <div className="summary-item">
            <span>Tổng thu kỳ này</span>
            <strong>{formatCurrency(totals.total)}</strong>
          </div>
          <div className="summary-item paid">
            <span>Đã thanh toán</span>
            <strong>{formatCurrency(totals.paid)}</strong>
          </div>
          <div className="summary-item unpaid">
            <span>Còn lại</span>
            <strong>{formatCurrency(totals.unpaid)}</strong>
          </div>
          <div className="summary-item">
            <span>Số phòng</span>
            <strong>{rows.filter(d => d.room.status === 'occupied').length} / {rows.length}</strong>
          </div>
        </div>
      )}

      {/* Tổng từng mục trong kỳ (theo hóa đơn đã tạo) */}
      {totals.total > 0 && (
        <div className="summary-strip summary-categories">
          <div className="summary-item">
            <span>🏠 Tiền phòng</span>
            <strong>{formatCurrency(totals.rent)}</strong>
          </div>
          <div className="summary-item">
            <span>⚡ Tiền điện</span>
            <strong>{formatCurrency(totals.electric)}</strong>
          </div>
          <div className="summary-item">
            <span>💧 Tiền nước</span>
            <strong>{formatCurrency(totals.water)}</strong>
          </div>
          <div className="summary-item">
            <span>🧾 Phí khác</span>
            <strong>{formatCurrency(totals.fees)}</strong>
          </div>
        </div>
      )}

      {/* Main table */}
      <div className="main-card">
        {rows.length === 0 ? (
          <div className="empty">Chưa có phòng nào. Nhấn "+ Phòng" để thêm.</div>
        ) : (
          <div className="table-wrap">
            <table className="main-table">
              <thead>
                <tr>
                  <th>🚪 Phòng</th>
                  <th>👤 Người thuê</th>
                  <th className="num">⚡ Điện</th>
                  <th className="num">💧 Nước</th>
                  <th className="num">🏠 Tiền phòng</th>
                  <th className="num">🧾 Phí khác</th>
                  <th className="num">💰 Tổng cộng</th>
                  <th>⚙ Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(d => {
                  const state = rowState(d);
                  const b = d.bill;
                  const { label, cls } = STATE_BADGE[state];

                  return (
                    <tr key={d.room.id} className={`row-${state}`}>
                      <td data-label="🚪 Phòng">
                        <div className="room-row-cell">
                          <div className="room-cell">
                            <strong>{d.room.roomNumber}</strong>
                            <span className="sub">T{d.room.floor} · {d.room.area}m²</span>
                          </div>
                          <button className="btn-icon" title="Sửa phòng (giá thuê, giá điện nước riêng...)" onClick={() => onEditRoom(d.room)}>
                            ✎
                          </button>
                        </div>
                      </td>

                      <td data-label="👤 Người thuê">
                        {d.tenant ? (
                          <div className="room-row-cell">
                            <div className="tenant-cell">
                              <span>{d.tenant.name}</span>
                              <span className="sub">{d.tenant.phoneNumber}</span>
                            </div>
                            <button className="btn-icon" title="Sửa thông tin người thuê" onClick={() => onEditTenant(d.tenant!)}>
                              ✎
                            </button>
                          </div>
                        ) : d.room.status === 'available' ? (
                          <span
                            className="cell-link tenant-add-link"
                            onClick={() => onAddTenant(d.room)}
                            title="Nhấn để thêm người thuê mới hoặc chọn từ danh sách người thuê cũ"
                          >
                            + Người thuê
                          </span>
                        ) : (
                          <span className="text-empty">—</span>
                        )}
                      </td>

                      <td className="num utility-td" data-label="⚡ Điện">
                        <UtilityCell
                          kind="electric"
                          room={d.room}
                          period={period}
                          reading={d.reading}
                          bill={b}
                          defaultRate={defaultConfig.electricRate}
                          onSaved={onRefresh}
                          onError={msg => setNotice({ kind: 'error', text: msg })}
                          onInfo={msg => setNotice({ kind: 'info', text: msg })}
                        />
                      </td>

                      <td className="num utility-td" data-label="💧 Nước">
                        <UtilityCell
                          kind="water"
                          room={d.room}
                          period={period}
                          reading={d.reading}
                          bill={b}
                          defaultRate={defaultConfig.waterRate}
                          onSaved={onRefresh}
                          onError={msg => setNotice({ kind: 'error', text: msg })}
                          onInfo={msg => setNotice({ kind: 'info', text: msg })}
                        />
                      </td>

                      <td className="num utility-td" data-label="🏠 Tiền phòng">
                        <RentCell
                          room={d.room}
                          period={period}
                          bill={b}
                          onSaved={onRefresh}
                          onError={msg => setNotice({ kind: 'error', text: msg })}
                          onInfo={msg => setNotice({ kind: 'info', text: msg })}
                        />
                      </td>

                      <td className="num utility-td" data-label="🧾 Phí khác">
                        <FeesCell
                          room={d.room}
                          period={period}
                          fees={d.fees}
                          bill={b}
                          onSaved={onRefresh}
                          onError={msg => setNotice({ kind: 'error', text: msg })}
                          onInfo={msg => setNotice({ kind: 'info', text: msg })}
                        />
                      </td>

                      <td className="num total-cell" data-label="💰 Tổng cộng">
                        <div className="utility-cell">
                          {b ? (
                            <strong>{formatCurrency(b.totalAmount)}</strong>
                          ) : (
                            (() => {
                              const est = estimateTotal(d, defaultConfig);
                              return est > 0 ? (
                                <span
                                  className="sub estimate"
                                  title="Tạm tính: tiền phòng + điện + nước + phí khác (chưa tạo hóa đơn)"
                                >
                                  ≈ {formatCurrency(est)}
                                </span>
                              ) : null;
                            })()
                          )}
                          <span className={`badge ${cls}`}>{label}</span>
                        </div>
                      </td>

                      <td data-label="⚙ Thao tác">
                        <div className="cell-actions">
                          {state === 'available' && (
                            <button className="btn btn-small btn-primary" onClick={() => onAddTenant(d.room)}>
                              + Người thuê
                            </button>
                          )}
                          {state === 'no-bill' && (
                            <button className="btn btn-small btn-primary" onClick={() => void createBill(d)}>
                              Tạo HĐ
                            </button>
                          )}
                          {state === 'unpaid' && (
                            <>
                              <button className="btn btn-small btn-primary" onClick={() => void pay(d)}>Thanh toán</button>
                              <button className="btn btn-small" title="Hủy hóa đơn để sửa chỉ số/phí" onClick={() => void cancelBill(d)}>
                                Hủy HĐ
                              </button>
                            </>
                          )}
                          {state === 'paid' && (
                            <button className="btn btn-small" title="Hủy hóa đơn (xóa cả thông tin thanh toán)" onClick={() => void cancelBill(d)}>
                              Hủy HĐ
                            </button>
                          )}
                          {(state === 'no-reading' || state === 'carried' || state === 'no-bill' || state === 'unpaid' || state === 'paid') && (
                            <button className="btn btn-small btn-danger" title="Trả phòng" onClick={() => void endTenancy(d)}>
                              Trả phòng
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
