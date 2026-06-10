import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { formatCurrency } from '../format';
import { MoneyInput } from './MoneyInput';
import { confirmDialog } from './ConfirmHost';
import type { ExtraFee, MonthlyBill, Room } from '../types';

interface Props {
  room: Room;
  period: { month: number; year: number };
  fees: ExtraFee[];
  bill: MonthlyBill | null;
  onSaved: () => void;
  onError: (msg: string) => void;
  onInfo: (msg: string) => void;
}

export function FeesCell({ room, period, fees, bill, onSaved, onError, onInfo }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [form, setForm] = useState({ name: '', amount: '' });
  const [saving, setSaving] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const occupied = room.status === 'occupied';
  const editable = occupied && !bill;
  const lateFee = bill?.lateFee ?? 0;
  // Phí trễ hạn (nếu có) gộp chung vào ô Phí khác
  const total = (bill ? bill.extraFees : fees.reduce((s, f) => s + f.amount, 0)) + lateFee;
  const canApplyLateFee = !!bill && !bill.paid && lateFee === 0;
  const canOpen = editable || fees.length > 0 || lateFee > 0 || canApplyLateFee;

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
    // Ô khóa: giải thích lý do thay vì im lặng
    if (!canOpen) {
      if (bill) {
        onInfo(`Kỳ ${period.month}/${period.year} của phòng ${room.roomNumber} đã có hóa đơn nên phí bị khóa — bấm "Hủy HĐ" ở cột Thao tác nếu cần sửa.`);
      } else if (room.status === 'maintenance') {
        onInfo(`Phòng ${room.roomNumber} đang bảo trì.`);
      } else {
        onInfo(`Phòng ${room.roomNumber} chưa có người thuê — thêm người thuê trước khi thêm phí.`);
      }
      return;
    }
    setForm({ name: '', amount: '' });
    const rect = cellRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({
        top: Math.min(rect.bottom + 6, window.innerHeight - 320),
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 300)),
      });
    }
    setOpen(true);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const amount = +form.amount;
    if (!form.name.trim()) return onError('Vui lòng nhập tên khoản phí');
    if (!(amount > 0)) return onError('Vui lòng nhập số tiền');
    setSaving(true);
    try {
      await api.fees.create({
        roomId: room.id,
        month: period.month,
        year: period.year,
        name: form.name.trim(),
        amount,
      });
      setForm({ name: '', amount: '' });
      onSaved();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function applyLateFee() {
    if (!bill) return;
    const ok = await confirmDialog(
      `Áp phí trễ hạn cho hóa đơn phòng ${room.roomNumber} (${formatCurrency(bill.totalAmount)})?`,
      { title: 'Phí trễ hạn', confirmLabel: 'Áp phí' }
    );
    if (!ok) return;
    setSaving(true);
    try {
      const updated = await api.bills.applyLateFee(bill.id);
      onSaved();
      onInfo(`Đã áp phí trễ hạn ${formatCurrency(updated.lateFee)} — tổng mới: ${formatCurrency(updated.totalAmount)}`);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(fee: ExtraFee) {
    setSaving(true);
    try {
      await api.fees.remove(fee.id);
      onSaved();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function renderDisplay() {
    if (!occupied && !bill) return <span className="text-empty">—</span>;
    if (total > 0) {
      const items: { key: string; name: string; amount: number }[] = fees.map(f => ({
        key: f.id,
        name: f.name,
        amount: f.amount,
      }));
      if (lateFee > 0) items.push({ key: 'late-fee', name: 'Phí trễ hạn', amount: lateFee });
      // Hóa đơn cũ mà danh sách khoản không còn — chỉ hiện tổng snapshot
      if (items.length === 0) {
        return <strong>{formatCurrency(total)}</strong>;
      }
      if (items.length === 1) {
        return (
          <>
            <span className="sub fee-line-name" title={items[0].name}>{items[0].name}</span>
            <strong>{formatCurrency(total)}</strong>
          </>
        );
      }
      return (
        <>
          {items.map(item => (
            <span key={item.key} className="sub fee-line" title={`${item.name}: ${formatCurrency(item.amount)}`}>
              <span className="fee-line-name">{item.name}</span> {item.amount.toLocaleString('vi-VN')}
            </span>
          ))}
          <strong>{formatCurrency(total)}</strong>
        </>
      );
    }
    if (editable) return <span className="cell-link">+ Phí</span>;
    if (canApplyLateFee) return <span className="text-empty" title="Nhấn để áp phí trễ hạn">—</span>;
    return <span className="text-empty">—</span>;
  }

  return (
    <div
      ref={cellRef}
      className={`utility-cell${canOpen ? ' clickable' : ' locked'}`}
      onClick={openPopover}
      title={
        bill
          ? canApplyLateFee
            ? 'Nhấn để xem phí và áp phí trễ hạn'
            : 'Đã có hóa đơn — phí đã chốt. Bấm "Hủy HĐ" ở cột Thao tác nếu cần sửa.' + (fees.length || lateFee ? ' (nhấn để xem)' : '')
          : editable
            ? 'Nhấn để thêm khoản phí (tiền rác, internet, gửi xe...)'
            : undefined
      }
    >
      {renderDisplay()}

      {open && pos && (
        <div className="popover" ref={popRef} style={{ top: pos.top, left: pos.left }} onClick={e => e.stopPropagation()}>
          <div className="popover-title">
            Phí khác — Phòng {room.roomNumber} ({period.month}/{period.year})
          </div>

          {fees.length > 0 || lateFee > 0 ? (
            <div className="fee-list">
              {fees.map(fee => (
                <div key={fee.id} className="fee-item">
                  <span className="fee-name">{fee.name}</span>
                  <span className="fee-amount">{formatCurrency(fee.amount)}</span>
                  {editable && (
                    <button className="btn-icon" title="Xóa khoản phí" disabled={saving} onClick={() => void remove(fee)}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {lateFee > 0 && (
                <div className="fee-item">
                  <span className="fee-name">Phí trễ hạn</span>
                  <span className="fee-amount">{formatCurrency(lateFee)}</span>
                </div>
              )}
              <div className="fee-item fee-total">
                <span className="fee-name">Tổng</span>
                <span className="fee-amount">{formatCurrency(fees.reduce((s, f) => s + f.amount, 0) + lateFee)}</span>
                {editable && <span style={{ width: 22 }} />}
              </div>
            </div>
          ) : (
            <div className="popover-preview">Chưa có khoản phí nào</div>
          )}

          {editable && (
            <form onSubmit={add}>
              <div className="field">
                <label>Tên khoản phí</label>
                <input
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Tiền rác, internet, gửi xe..."
                  autoFocus
                />
              </div>
              <div className="field">
                <label>Số tiền (VND)</label>
                <MoneyInput value={form.amount} onChange={v => setForm(p => ({ ...p, amount: v }))} placeholder="30.000" />
              </div>
              <div className="actions-row">
                <button type="submit" className="btn btn-small btn-primary" disabled={saving}>
                  {saving ? 'Đang lưu...' : '+ Thêm phí'}
                </button>
                <button type="button" className="btn btn-small" onClick={() => setOpen(false)}>Đóng</button>
              </div>
            </form>
          )}
          {!editable && (
            <div className="actions-row">
              {canApplyLateFee && (
                <button type="button" className="btn btn-small btn-primary" disabled={saving} onClick={() => void applyLateFee()}>
                  {saving ? 'Đang áp...' : '+ Áp phí trễ hạn'}
                </button>
              )}
              <button type="button" className="btn btn-small" onClick={() => setOpen(false)}>Đóng</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
