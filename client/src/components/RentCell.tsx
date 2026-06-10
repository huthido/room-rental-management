import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { formatCurrency, monthYear, shiftMonth } from '../format';
import { MoneyInput } from './MoneyInput';
import type { MonthlyBill, Room } from '../types';

interface Props {
  room: Room;
  period: { month: number; year: number };
  bill: MonthlyBill | null;
  onSaved: () => void;
  onError: (msg: string) => void;
  onInfo: (msg: string) => void;
}

export function RentCell({ room, period, bill, onSaved, onError, onInfo }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [form, setForm] = useState({ monthlyRent: '', rentMonthOffset: '0' });
  const [saving, setSaving] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const offset = room.rentMonthOffset ?? 0;
  const editable = !bill;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function openPopover() {
    if (open) return;
    if (!editable) {
      onInfo(
        `Kỳ ${period.month}/${period.year} của phòng ${room.roomNumber} đã có hóa đơn nên tiền phòng bị khóa — bấm "Hủy HĐ" ở cột Thao tác nếu cần sửa.`
      );
      return;
    }
    setForm({ monthlyRent: String(room.monthlyRent || ''), rentMonthOffset: String(offset) });
    const rect = cellRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({
        top: Math.min(rect.bottom + 6, window.innerHeight - 300),
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 300)),
      });
    }
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const monthlyRent = +form.monthlyRent;
    if (!(monthlyRent > 0)) return onError('Vui lòng nhập tiền phòng');
    setSaving(true);
    try {
      await api.rooms.update(room.id, { monthlyRent, rentMonthOffset: +form.rentMonthOffset });
      setOpen(false);
      onSaved();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function renderDisplay() {
    if (bill) {
      return (
        <>
          <span className="sub">của T{monthYear(bill.rentMonth, bill.rentYear)}</span>
          <span>{formatCurrency(bill.roomRent)}</span>
        </>
      );
    }
    if (room.monthlyRent <= 0) return <span className="cell-link">+ Tiền phòng</span>;
    const proj = shiftMonth(period.month, period.year, offset);
    const vacantish = room.status !== 'occupied';
    return (
      <>
        <span className="sub">của T{monthYear(proj.month, proj.year)}</span>
        <span className={vacantish ? 'text-muted' : undefined}>{formatCurrency(room.monthlyRent)}</span>
      </>
    );
  }

  const previewPeriod = shiftMonth(period.month, period.year, +form.rentMonthOffset);

  return (
    <div
      ref={cellRef}
      className={`utility-cell${editable ? ' clickable' : ' locked'}`}
      onClick={openPopover}
      title={
        bill
          ? `Tiền phòng tháng ${monthYear(bill.rentMonth, bill.rentYear)} — đã chốt theo hóa đơn. Bấm "Hủy HĐ" nếu cần sửa.`
          : 'Nhấn để sửa tiền phòng và tháng thu'
      }
    >
      {renderDisplay()}

      {open && pos && (
        <div className="popover" ref={popRef} style={{ top: pos.top, left: pos.left }} onClick={e => e.stopPropagation()}>
          <div className="popover-title">🏠 Tiền phòng — Phòng {room.roomNumber}</div>
          <form onSubmit={save}>
            <div className="field">
              <label>Tiền phòng (VND/tháng)</label>
              <MoneyInput
                value={form.monthlyRent}
                onChange={v => setForm(p => ({ ...p, monthlyRent: v }))}
                autoFocus
                placeholder="3.000.000"
              />
            </div>
            <div className="field">
              <label>Tiền phòng trong hóa đơn là của tháng nào?</label>
              <select
                value={form.rentMonthOffset}
                onChange={e => setForm(p => ({ ...p, rentMonthOffset: e.target.value }))}
              >
                <option value="0">Chính tháng thu</option>
                <option value="1">Tháng sau (thu trước)</option>
                <option value="-1">Tháng trước (thu sau)</option>
              </select>
            </div>
            <div className="popover-preview">
              Kỳ {monthYear(period.month, period.year)} sẽ thu tiền phòng của tháng{' '}
              <strong>{monthYear(previewPeriod.month, previewPeriod.year)}</strong>
              {form.monthlyRent !== '' && +form.monthlyRent > 0 && (
                <>: <strong>{formatCurrency(+form.monthlyRent)}</strong></>
              )}
              <br />
              <span style={{ fontSize: 12 }}>Áp dụng cho hóa đơn tạo sau khi lưu.</span>
            </div>
            <div className="actions-row">
              <button type="submit" className="btn btn-small btn-primary" disabled={saving}>
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
              <button type="button" className="btn btn-small" onClick={() => setOpen(false)}>Hủy</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
