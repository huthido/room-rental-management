import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { formatCurrency, prevPeriod } from '../format';
import { MoneyInput } from './MoneyInput';
import type { MeterReading, MonthlyBill, Room } from '../types';

type Kind = 'electric' | 'water';

const UNIT: Record<Kind, string> = { electric: 'kWh', water: 'm³' };
const ICON: Record<Kind, string> = { electric: '⚡', water: '💧' };

function indexesOf(r: MeterReading, kind: Kind): { old: number; new: number } {
  return kind === 'electric' ? { old: r.electricOld, new: r.electricNew } : { old: r.waterOld, new: r.waterNew };
}

interface Props {
  kind: Kind;
  room: Room;
  period: { month: number; year: number };
  reading: MeterReading | null;
  bill: MonthlyBill | null;
  defaultRate: number;
  onSaved: () => void;
  onError: (msg: string) => void;
  onInfo: (msg: string) => void;
}

export function UtilityCell({ kind, room, period, reading, bill, defaultRate, onSaved, onError, onInfo }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [form, setForm] = useState({ old: '', new: '', rate: '' });
  const [oldLocked, setOldLocked] = useState(false);
  const [prevReading, setPrevReading] = useState<MeterReading | null>(null);
  const [saving, setSaving] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const occupied = room.status === 'occupied';
  const roomRate = kind === 'electric' ? room.electricRate : room.waterRate;
  const effRate = roomRate ?? defaultRate;
  const idx = reading ? indexesOf(reading, kind) : null;
  const carried = idx !== null && idx.new === idx.old;
  const editable = occupied && !bill;

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

  async function openPopover() {
    if (open) return;
    // Ô khóa: giải thích lý do thay vì im lặng
    if (!editable) {
      if (bill) {
        onInfo(`Kỳ ${period.month}/${period.year} của phòng ${room.roomNumber} đã có hóa đơn nên số liệu bị khóa — bấm "Hủy HĐ" ở cột Thao tác nếu cần sửa.`);
      } else if (room.status === 'maintenance') {
        onInfo(`Phòng ${room.roomNumber} đang bảo trì.`);
      } else {
        onInfo(`Phòng ${room.roomNumber} chưa có người thuê — thêm người thuê trước khi ghi chỉ số.`);
      }
      return;
    }
    // Số cũ lấy từ tháng trước: chỉ khóa khi tháng trước thực sự có chỉ số.
    // Phòng mới (chưa có lịch sử) được nhập số cũ tay lần đầu.
    let prev: MeterReading | null = null;
    const pp = prevPeriod(period);
    try {
      prev = await api.readings.byMonth(room.id, pp.year, pp.month);
    } catch {
      // Tháng trước chưa có chỉ số
    }
    const locked = prev !== null;
    let oldVal = '';
    if (idx) {
      oldVal = String(idx.old);
    } else if (prev) {
      oldVal = String(kind === 'electric' ? prev.electricNew : prev.waterNew);
    }
    setPrevReading(prev);
    setOldLocked(locked);
    setForm({
      old: oldVal,
      new: idx && !carried ? String(idx.new) : '',
      rate: String(effRate),
    });
    const rect = cellRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({
        top: Math.min(rect.bottom + 6, window.innerHeight - 320),
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 300)),
      });
    }
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const oldN = +form.old;
    const newN = +form.new;
    const rateN = +form.rate;
    if (form.old === '' || Number.isNaN(oldN)) return onError('Vui lòng nhập chỉ số cũ');
    if (form.new === '' || Number.isNaN(newN)) return onError('Vui lòng nhập chỉ số mới');
    if (newN < oldN) return onError('Chỉ số mới không được nhỏ hơn chỉ số cũ');
    if (!(rateN > 0)) return onError('Đơn giá phải lớn hơn 0');
    setSaving(true);
    try {
      if (reading) {
        await api.readings.update(
          reading.id,
          kind === 'electric' ? { electricOld: oldN, electricNew: newN } : { waterOld: oldN, waterNew: newN }
        );
      } else {
        // Tạo bản ghi mới — phía còn lại (điện/nước) carry từ tháng trước, chờ nhập sau
        const otherCarry = kind === 'electric' ? (prevReading?.waterNew ?? 0) : (prevReading?.electricNew ?? 0);
        await api.readings.create({
          roomId: room.id,
          month: period.month,
          year: period.year,
          electricOld: kind === 'electric' ? oldN : otherCarry,
          electricNew: kind === 'electric' ? newN : otherCarry,
          waterOld: kind === 'water' ? oldN : otherCarry,
          waterNew: kind === 'water' ? newN : otherCarry,
        });
      }
      if (rateN !== effRate) {
        await api.rooms.update(room.id, kind === 'electric' ? { electricRate: rateN } : { waterRate: rateN });
      }
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
      const usage = kind === 'electric' ? bill.electricUsage : bill.waterUsage;
      const rate = kind === 'electric' ? bill.electricRate : bill.waterRate;
      const cost = kind === 'electric' ? bill.electricCost : bill.waterCost;
      return (
        <>
          {idx && <span className="sub">{idx.old} → {idx.new}</span>}
          <span className="sub">{usage} {UNIT[kind]} × {rate.toLocaleString('vi-VN')}</span>
          <strong>{formatCurrency(cost)}</strong>
        </>
      );
    }
    if (!occupied) return <span className="text-empty">—</span>;
    if (!idx) {
      return (
        <>
          <span className="text-muted">chưa ghi</span>
          <span className="cell-link">Nhập chỉ số</span>
        </>
      );
    }
    if (carried) {
      return (
        <>
          <span className="sub">{idx.old} → ?</span>
          <span className="cell-link">Nhập chỉ số</span>
        </>
      );
    }
    const usage = idx.new - idx.old;
    return (
      <>
        <span className="sub">{idx.old} → {idx.new}</span>
        <span className="sub">{usage} {UNIT[kind]} × {effRate.toLocaleString('vi-VN')}</span>
        <strong>{formatCurrency(usage * effRate)}</strong>
      </>
    );
  }

  const pUsage = form.new !== '' && form.old !== '' ? +form.new - +form.old : null;
  const pCost = pUsage !== null && +form.rate > 0 ? pUsage * +form.rate : null;

  return (
    <div
      ref={cellRef}
      className={`utility-cell${editable ? ' clickable' : ' locked'}`}
      onClick={() => void openPopover()}
      title={
        bill
          ? 'Đã có hóa đơn — số liệu đã chốt. Bấm "Hủy HĐ" ở cột Thao tác nếu cần sửa.'
          : editable
            ? 'Nhấn để nhập chỉ số mới và đơn giá'
            : undefined
      }
    >
      {renderDisplay()}

      {open && pos && (
        <div className="popover" ref={popRef} style={{ top: pos.top, left: pos.left }} onClick={e => e.stopPropagation()}>
          <div className="popover-title">
            {ICON[kind]} {kind === 'electric' ? 'Điện' : 'Nước'} — Phòng {room.roomNumber} ({period.month}/{period.year})
          </div>
          <form onSubmit={save}>
            <div className="field">
              <label>
                Chỉ số cũ ({UNIT[kind]}){oldLocked && <em className="label-note"> · từ tháng trước</em>}
              </label>
              <input
                type="number"
                value={form.old}
                readOnly={oldLocked}
                className={oldLocked ? 'input-locked' : undefined}
                onChange={e => setForm(p => ({ ...p, old: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Chỉ số mới ({UNIT[kind]})</label>
              <input
                type="number"
                value={form.new}
                autoFocus
                onChange={e => setForm(p => ({ ...p, new: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Đơn giá (VND/{UNIT[kind]})</label>
              <MoneyInput value={form.rate} onChange={v => setForm(p => ({ ...p, rate: v }))} />
            </div>
            {pUsage !== null && (
              <div className={`popover-preview${pUsage < 0 ? ' invalid' : ''}`}>
                {pUsage < 0
                  ? '⚠ Chỉ số mới nhỏ hơn chỉ số cũ'
                  : <>Tiêu thụ <strong>{pUsage} {UNIT[kind]}</strong>{pCost !== null && <> = <strong>{formatCurrency(pCost)}</strong></>}</>}
              </div>
            )}
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
