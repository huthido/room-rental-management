import { useEffect, useState } from 'react';
import { Modal } from '../Modal';
import { api } from '../api';
import { Msg, type Notice } from '../components/Msg';
import { MoneyInput } from '../components/MoneyInput';
import { formatCurrency } from '../format';

interface Props { onClose: () => void; }

export function ConfigModal({ onClose }: Props) {
  const [form, setForm] = useState({ electricRate: '', waterRate: '', lateFeePercent: '' });
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    api.config.get().then(cfg => setForm({
      electricRate: String(cfg.electricRate),
      waterRate: String(cfg.waterRate),
      lateFeePercent: String(cfg.lateFeeRate * 100),
    })).catch(err => setNotice({ kind: 'error', text: (err as Error).message }));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    try {
      await api.config.update({
        electricRate: +form.electricRate,
        waterRate: +form.waterRate,
        lateFeeRate: +form.lateFeePercent / 100,
      });
      setNotice({ kind: 'success', text: `Đã lưu: điện ${formatCurrency(+form.electricRate)}/kWh, nước ${formatCurrency(+form.waterRate)}/m³` });
    } catch (err) {
      setNotice({ kind: 'error', text: (err as Error).message });
    }
  }

  return (
    <Modal title="Cấu hình đơn giá" onClose={onClose}>
      <Msg notice={notice} />
      <form onSubmit={submit}>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="field" style={{ gridColumn: '1/-1' }}>
            <label>Giá điện (VND/kWh)</label>
            <MoneyInput value={form.electricRate} onChange={v => setForm(p => ({ ...p, electricRate: v }))} />
          </div>
          <div className="field" style={{ gridColumn: '1/-1' }}>
            <label>Giá nước (VND/m³)</label>
            <MoneyInput value={form.waterRate} onChange={v => setForm(p => ({ ...p, waterRate: v }))} />
          </div>
          <div className="field" style={{ gridColumn: '1/-1' }}>
            <label>Phí trễ hạn (%)</label>
            <input type="number" step="0.1" value={form.lateFeePercent} onChange={e => setForm(p => ({ ...p, lateFeePercent: e.target.value }))} />
          </div>
        </div>
        <div className="actions-row" style={{ marginTop: 16 }}>
          <button type="submit" className="btn btn-primary">Lưu</button>
          <button type="button" className="btn" onClick={onClose}>Đóng</button>
        </div>
      </form>
    </Modal>
  );
}
