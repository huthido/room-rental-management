import { useState } from 'react';
import { Modal } from '../Modal';
import { api } from '../api';
import { Msg, type Notice } from '../components/Msg';
import { MoneyInput } from '../components/MoneyInput';
import type { Room, RoomStatus } from '../types';

interface Props {
  room?: Room | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function RoomModal({ room, onClose, onSuccess }: Props) {
  const [form, setForm] = useState({
    roomNumber: room?.roomNumber ?? '',
    floor: String(room?.floor ?? 1),
    area: room ? String(room.area) : '',
    monthlyRent: room ? String(room.monthlyRent) : '',
    electricRate: room?.electricRate != null ? String(room.electricRate) : '',
    waterRate: room?.waterRate != null ? String(room.waterRate) : '',
    rentMonthOffset: String(room?.rentMonthOffset ?? 0),
    status: room?.status ?? ('available' as RoomStatus),
  });
  const [notice, setNotice] = useState<Notice | null>(null);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm(p => ({ ...p, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    if (!form.roomNumber.trim() || !form.area || !form.monthlyRent) {
      setNotice({ kind: 'error', text: 'Vui lòng điền số phòng, diện tích và giá thuê' });
      return;
    }
    const data = {
      roomNumber: form.roomNumber.trim(),
      floor: +form.floor,
      area: +form.area,
      monthlyRent: +form.monthlyRent,
      // Bỏ trống = dùng giá mặc định (null để xóa giá riêng khi sửa)
      electricRate: form.electricRate === '' ? null : +form.electricRate,
      waterRate: form.waterRate === '' ? null : +form.waterRate,
      rentMonthOffset: +form.rentMonthOffset,
      status: form.status,
    };
    try {
      if (room) {
        await api.rooms.update(room.id, data);
      } else {
        await api.rooms.create({ ...data, electricRate: data.electricRate ?? undefined, waterRate: data.waterRate ?? undefined });
      }
      onSuccess();
      onClose();
    } catch (err) {
      setNotice({ kind: 'error', text: (err as Error).message });
    }
  }

  return (
    <Modal title={room ? `Sửa phòng ${room.roomNumber}` : 'Thêm phòng mới'} onClose={onClose}>
      <Msg notice={notice} />
      <form onSubmit={submit}>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="field">
            <label>Số phòng</label>
            <input value={form.roomNumber} onChange={e => set('roomNumber', e.target.value)} placeholder="101" autoFocus={!room} />
          </div>
          <div className="field">
            <label>Tầng</label>
            <input type="number" value={form.floor} onChange={e => set('floor', e.target.value)} />
          </div>
          <div className="field">
            <label>Diện tích (m²)</label>
            <input type="number" value={form.area} onChange={e => set('area', e.target.value)} placeholder="25" />
          </div>
          <div className="field">
            <label>Giá thuê (VND/tháng)</label>
            <MoneyInput value={form.monthlyRent} onChange={v => set('monthlyRent', v)} placeholder="3.000.000" />
          </div>
          <div className="field">
            <label>Giá điện riêng (VND/kWh)</label>
            <MoneyInput value={form.electricRate} onChange={v => set('electricRate', v)} placeholder="Mặc định" />
          </div>
          <div className="field">
            <label>Giá nước riêng (VND/m³)</label>
            <MoneyInput value={form.waterRate} onChange={v => set('waterRate', v)} placeholder="Mặc định" />
          </div>
          <div className="field" style={{ gridColumn: '1/-1' }}>
            <label>Tiền phòng trong hóa đơn là của tháng nào?</label>
            <select value={form.rentMonthOffset} onChange={e => set('rentMonthOffset', e.target.value)}>
              <option value="0">Chính tháng thu (thu tháng 6 → tiền phòng tháng 6)</option>
              <option value="1">Tháng sau — thu trước (thu tháng 6 → tiền phòng tháng 7)</option>
              <option value="-1">Tháng trước — thu sau (thu tháng 6 → tiền phòng tháng 5)</option>
            </select>
          </div>
          {!room && (
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label>Trạng thái</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="available">Còn trống</option>
                <option value="maintenance">Bảo trì</option>
              </select>
            </div>
          )}
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
          Bỏ trống giá điện/nước riêng để dùng giá mặc định (⚙). Giá riêng chỉ áp dụng cho hóa đơn tạo sau khi lưu.
        </p>
        <div className="actions-row" style={{ marginTop: 14 }}>
          <button type="submit" className="btn btn-primary">{room ? 'Lưu thay đổi' : 'Thêm phòng'}</button>
          <button type="button" className="btn" onClick={onClose}>Hủy</button>
        </div>
      </form>
    </Modal>
  );
}
