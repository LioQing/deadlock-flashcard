import { useMemo, useState } from 'react';
import type { DailyStats } from '../types';
import { localDay } from '../lib/game';
import { signed } from '../lib/stats';

export default function ActivityCalendar({ days, now, onDay }: { days: DailyStats[]; now: Date; onDay: (day: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const { weeks, labels } = useMemo(() => {
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(end);
    start.setDate(start.getDate() - 364 - start.getDay());
    const weeks: Date[][] = [];
    const labels: { name: string; index: number }[] = [];
    let previousMonth = -1;
    const cursor = new Date(start);
    while (cursor <= end) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      const middle = week[3];
      if (middle.getMonth() !== previousMonth) {
        labels.push({ name: middle.toLocaleDateString('en', { month: 'short' }), index: weeks.length });
        previousMonth = middle.getMonth();
      }
      weeks.push(week);
    }
    return { weeks, labels };
  }, [now.getFullYear(), now.getMonth(), now.getDate()]);
  const byDay = new Map(days.map(day => [day.day, day]));
  const selectedDay = selected ? byDay.get(selected) : null;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 364);
  const guesses = days.filter(day => day.day >= localDay(cutoff) && day.day <= localDay(now))
    .reduce((sum, day) => sum + day.guesses, 0);
  const today = localDay(now);

  return (
    <section className="panel activity-panel" aria-labelledby="activity-title">
      <div className="panel-heading">
        <h2 id="activity-title">Your study rhythm</h2>
        <span className="quiet-badge">Past year</span>
      </div>
      <div className="calendar-scroll" tabIndex={0} aria-label="Scrollable study activity calendar">
        <div className="calendar" style={{ '--weeks': weeks.length } as React.CSSProperties}>
          <div className="calendar-months">{labels.map((label, i) => <span key={i} style={{ gridColumn: label.index + 1 }}>{label.name}</span>)}</div>
          <div className="weekday-labels"><span>Mon</span><span>Wed</span><span>Fri</span></div>
          <div className="calendar-weeks">
            {weeks.map((week, wi) => <div className="calendar-week" key={wi}>
              {week.map(date => {
                const day = localDay(date);
                const stats = byDay.get(day);
                const count = stats?.guesses ?? 0;
                const level = count === 0 ? 0 : count <= 5 ? 1 : count <= 15 ? 2 : count <= 30 ? 3 : 4;
                const label = `${date.toLocaleDateString('en', { dateStyle: 'medium' })}: ${count} guesses, ${signed(stats?.score ?? 0)} points`;
                return <button key={day} type="button" className={`calendar-cell level-${level} ${selected === day ? 'selected' : ''}`}
                  disabled={day > today} aria-label={label} title={label} onClick={() => setSelected(day)} />;
              })}
            </div>)}
          </div>
        </div>
      </div>
      <div className="calendar-footer">
        <div className="calendar-selection" aria-live="polite"><span>{selected ? `${selected}: ${selectedDay?.guesses ?? 0} guesses · ${signed(selectedDay?.score ?? 0)} points` : `${guesses.toLocaleString()} guesses, one step at a time.`}</span>{selected && <button className="text-button" onClick={() => onDay(selected)}>View day →</button>}</div>
        <div className="calendar-legend"><span>Less</span>{[0, 1, 2, 3, 4].map(level => <i key={level} className={`level-${level}`} />)}<span>More</span></div>
      </div>
    </section>
  );
}
