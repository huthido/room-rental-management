import { useEffect, useState } from 'react';
import { Modal } from '../Modal';
import { api } from '../api';
import { Msg, type Notice } from '../components/Msg';
import { MoneyInput } from '../components/MoneyInput';
import { formatCurrency, formatDate } from '../format';
import type { Room, Tenant } from '../types';

interface Props {
  /** Truyền tenant để sửa thông tin; bỏ trống để thêm mới */
  tenant?: Tenant | null;
  preselectedRoom?: Room | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function TenantModal({ tenant, preselectedRoom, onClose, onSuccess }: Props) {
  const editing = !!tenant;
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);
  const [formerTenants, setFormerTenants] = useState<Tenant[]>([]);
  const [existingId, setExistingId] = useState('');
  const [form, setForm] = useState({
    name: tenant?.name ?? '',
    phoneNumber: tenant?.phoneNumber ?? '',
    idCardNumber: tenant?.idCardNumber ?? '',
    roomId: tenant?.roomId ?? preselectedRoom?.id ?? '',
    moveInDate: (tenant?.moveInDate ?? new Date().toISOString()).slice(0, 10),
    deposit: tenant ? String(tenant.deposit) : '',
  });
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (editing) return;
    Promise.all([api.rooms.list('available'), api.tenants.list()])
      .then(([rooms, tenants]) => {
        setAvailableRooms(rooms);
        setFormerTenants(tenants.filter(t => !t.active));
        if (!form.roomId && rooms.length > 0) setForm(p => ({ ...p, roomId: rooms[0].id }));
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm(p => ({ ...p, [k]: v }));
  }

  function selectExisting(id: string) {
    setExistingId(id);
    const t = formerTenants.find(x => x.id === id);
    if (t) setForm(p => ({ ...p, deposit: String(t.deposit) }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    try {
      if (editing) {
        if (!form.name.trim()) {
          setNotice({ kind: 'error', text: 'Vui lòng nhập họ tên' });
          return;
        }
        await api.tenants.update(tenant.id, {
          name: form.name.trim(),
          phoneNumber: form.phoneNumber.trim(),
          idCardNumber: form.idCardNumber.trim(),
          moveInDate: form.moveInDate,
          deposit: +form.deposit || 0,
        });
      } else if (mode === 'existing') {
        if (!existingId) {
          setNotice({ kind: 'error', text: 'Vui lòng chọn người thuê' });
          return;
        }
        if (!form.roomId) {
          setNotice({ kind: 'error', text: 'Vui lòng chọn phòng' });
          return;
        }
        await api.tenants.assignRoom(existingId, {
          roomId: form.roomId,
          moveInDate: form.moveInDate,
          deposit: +form.deposit || 0,
        });
      } else {
        if (!form.name.trim()) {
          setNotice({ kind: 'error', text: 'Vui lòng nhập họ tên' });
          return;
        }
        if (!form.roomId) {
          setNotice({ kind: 'error', text: 'Vui lòng chọn phòng' });
          return;
        }
        await api.tenants.create({
          name: form.name.trim(),
          phoneNumber: form.phoneNumber.trim(),
          idCardNumber: form.idCardNumber.trim(),
          roomId: form.roomId,
          moveInDate: form.moveInDate,
          deposit: +form.deposit || 0,
        });
      }
      onSuccess();
      onClose();
    } catch (err) {
      setNotice({ kind: 'error', text: (err as Error).message });
    }
  }

  const rooms = preselectedRoom ? [preselectedRoom] : availableRooms;

  return (
    <Modal title={editing ? `Sửa thông tin — ${tenant.name}` : 'Thêm người thuê'} onClose={onClose}>
      <Msg notice={notice} />

      {!editing && (
        <div className="filter-row" style={{ marginBottom: 14 }}>
          <button
            type="button"
            className={`btn btn-small${mode === 'new' ? ' btn-primary' : ''}`}
            onClick={() => setMode('new')}
          >
            Người thuê mới
          </button>
          <button
            type="button"
            className={`btn btn-small${mode === 'existing' ? ' btn-primary' : ''}`}
            onClick={() => setMode('existing')}
            disabled={formerTenants.length === 0}
            title={formerTenants.length === 0 ? 'Chưa có người thuê cũ nào trong danh sách' : undefined}
          >
            Chọn từ danh sách cũ ({formerTenants.length})
          </button>
        </div>
      )}

      {!editing && rooms.length === 0 && (
        <div className="msg msg-error" style={{ marginBottom: 12 }}>Không có phòng trống</div>
      )}

      <form onSubmit={submit}>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {!editing && mode === 'existing' ? (
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label>Người thuê cũ *</label>
              <select value={existingId} onChange={e => selectExisting(e.target.value)} autoFocus>
                <option value="">— Chọn người thuê —</option>
                {formerTenants.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.phoneNumber || 'không SĐT'} (trả phòng {formatDate(t.moveOutDate)})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div className="field" style={{ gridColumn: '1/-1' }}>
                <label>Họ tên *</label>
                <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nguyễn Văn A" autoFocus={!editing} />
              </div>
              <div className="field">
                <label>Số điện thoại</label>
                <input value={form.phoneNumber} onChange={e => set('phoneNumber', e.target.value)} />
              </div>
              <div className="field">
                <label>Số CCCD</label>
                <input value={form.idCardNumber} onChange={e => set('idCardNumber', e.target.value)} />
              </div>
            </>
          )}
          {!editing && (
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label>Phòng *</label>
              <select value={form.roomId} onChange={e => set('roomId', e.target.value)} disabled={!!preselectedRoom}>
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>
                    Phòng {r.roomNumber} — {formatCurrency(r.monthlyRent)}/tháng
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label>Ngày vào</label>
            <input type="date" value={form.moveInDate} onChange={e => set('moveInDate', e.target.value)} />
          </div>
          <div className="field">
            <label>Tiền cọc (VND)</label>
            <MoneyInput value={form.deposit} onChange={v => set('deposit', v)} placeholder="3.000.000" />
          </div>
        </div>
        <div className="actions-row" style={{ marginTop: 16 }}>
          <button type="submit" className="btn btn-primary" disabled={!editing && rooms.length === 0}>
            {editing ? 'Lưu thay đổi' : mode === 'existing' ? 'Nhận phòng' : 'Thêm người thuê'}
          </button>
          <button type="button" className="btn" onClick={onClose}>Hủy</button>
        </div>
      </form>
    </Modal>
  );
}
