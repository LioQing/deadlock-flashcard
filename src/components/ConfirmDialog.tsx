import { useEffect, useRef } from 'react';
import { Flag, X } from 'lucide-react';
import { signed } from '../lib/stats';

export default function ConfirmDialog({ replacing, score, onConfirm, onCancel }: { replacing: boolean; score: number; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="confirm-dialog" aria-labelledby="confirm-title" aria-describedby="confirm-description" onCancel={onCancel}>
    <button className="icon-button dialog-close" aria-label="Cancel abandonment" onClick={onCancel}><X size={20} /></button>
    <div className="dialog-icon"><Flag size={24} /></div><h2 id="confirm-title">{replacing ? 'Start over with a new game?' : 'Abandon this game?'}</h2><p id="confirm-description">Your unfinished game will be marked as abandoned with a <strong>final score of {signed(Math.min(score, -10))}</strong>. Abandoned games score −10, or keep their current score if it is already lower. Your answered questions stay on your record.</p><p className="muted">Just need a break? Go to Overview instead. Your game will be waiting.</p><div className="dialog-actions"><button className="button secondary" autoFocus onClick={onCancel}>Keep my game</button><button className="button danger" onClick={onConfirm}>{replacing ? 'Start new game' : 'Abandon game'} · {signed(Math.min(score, -10))}</button></div>
  </dialog>;
}
