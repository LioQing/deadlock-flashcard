import { ArrowRight, ArrowUpRight, Download, History as HistoryIcon, LockKeyhole, CalendarDays, Check, Flag, Play, X } from 'lucide-react';
import type { StudyState, DailyStats, GameRecord } from '../types';
import { CATEGORY_NAMES } from '../types';
import { accuracy, gameScore, signed } from '../lib/stats';

export interface HistoryPreferences {
  tab: 'games' | 'daily';
  filter: 'all' | GameRecord['status'];
}

export function GuessTable({ game }: { game: GameRecord }) {
  return <div className="table-scroll"><table className="data-table guess-table"><thead><tr><th>Item</th><th>Your answer</th><th>Correct property</th><th className="align-right">Score</th></tr></thead><tbody>
    {game.guesses.map(guess => <tr key={guess.index}><td><strong>{guess.itemName}</strong><small>{CATEGORY_NAMES[guess.category]}</small></td><td data-label="Your answer" className={guess.points === -1 ? 'negative' : ''}>{guess.selection ?? 'Not sure'}</td><td data-label="Correct property">{guess.correctLabel}</td><td className={`align-right ${guess.points < 0 ? 'negative' : guess.points > 0 ? 'positive' : 'muted'}`}>{signed(guess.points)}</td></tr>)}
    {game.penalty && <tr><td><strong>Abandonment penalty</strong><small>{new Date(game.penalty.at).toLocaleString()}</small></td><td colSpan={2}>Unfinished game abandoned</td><td className={`align-right ${game.penalty.points < 0 ? 'negative' : 'muted'}`}>{signed(game.penalty.points)}</td></tr>}
  </tbody></table></div>;
}

export function formatDay(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString('en', { dateStyle: 'medium' });
}

interface Props {
  state: StudyState;
  days: DailyStats[];
  preferences: HistoryPreferences;
  onPreferences: (preferences: HistoryPreferences) => void;
  selectedDay?: string;
  onDay: (day: string | undefined) => void;
  onReview: (id: string) => void;
  onResume: () => void;
  onPractice: () => void;
}

export default function History({ state, days, preferences, onPreferences, selectedDay, onDay, onReview, onResume, onPractice }: Props) {
  const { tab, filter } = preferences;
  const dayKey = selectedDay ?? days[0]?.day;
  const day = days.find(entry => entry.day === dayKey);
  const games = [...state.games].reverse().filter(game => filter === 'all' || game.status === filter);
  const dayGames = state.games.filter(game => game.guesses.some(guess => guess.day === dayKey) || game.penalty?.day === dayKey);

  const selectTab = (next: HistoryPreferences['tab']) => {
    onPreferences({ ...preferences, tab: next });
    if (next === 'games' && selectedDay) onDay(undefined);
  };
  const exportHistory = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...state }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `deadlock-flashcard-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <div className="history-page">
    <div className="page-heading"><div><h1 className="max-w-5xl">Your practice, on the record.</h1><p>Find a game. Revisit a day. See what you learned.</p></div><button className="button secondary" onClick={exportHistory}><Download size={16} />Export data</button></div>
    <div className="history-toolbar">
      <div className="history-tabs" role="tablist" aria-label="History view" onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 'games' : event.key === 'End' ? 'daily' : tab === 'games' ? 'daily' : 'games';
        selectTab(next);
        event.currentTarget.querySelector<HTMLButtonElement>(`#history-tab-${next}`)?.focus();
      }}>
        <button id="history-tab-games" role="tab" aria-selected={tab === 'games'} aria-controls="history-content" tabIndex={tab === 'games' ? 0 : -1} onClick={() => selectTab('games')}><HistoryIcon size={15} />Games <span>{state.games.length}</span></button>
        <button id="history-tab-daily" role="tab" aria-selected={tab === 'daily'} aria-controls="history-content" tabIndex={tab === 'daily' ? 0 : -1} onClick={() => selectTab('daily')}><CalendarDays size={15} />Daily activity <span>{days.length}</span></button>
      </div>
      <span className="history-local"><LockKeyhole size={13} />Saved in this browser</span>
    </div>
    <div id="history-content" role="tabpanel" aria-labelledby={`history-tab-${tab}`} tabIndex={0}>
      {tab === 'games' ? <>
        <div className="filter-bar" role="group" aria-label="Filter games">{(['all', 'completed', 'active', 'abandoned'] as const).map(value => <button key={value} aria-pressed={filter === value} onClick={() => onPreferences({ ...preferences, filter: value })}>{value === 'all' ? 'All games' : value === 'active' ? 'In progress' : value === 'completed' ? 'Completed' : 'Abandoned'}</button>)}</div>
        {games.length ? <div className="history-games grid-flow-dense">{games.map(game => {
          const Icon = game.status === 'completed' ? Check : game.status === 'active' ? Play : Flag;
          return <button className="history-game-card" key={game.id} onClick={() => game.status === 'active' ? onResume() : onReview(game.id)}>
            <div className="history-card-top"><span className={`status-badge ${game.status}`}><Icon size={13} />{game.status === 'active' ? 'In progress' : game.status === 'completed' ? 'Completed' : 'Abandoned'}</span><ArrowUpRight size={17} /></div>
            <h2>{new Date(game.startedAt).toLocaleDateString('en', { dateStyle: 'medium' })}</h2><small>{new Date(game.startedAt).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}</small>
            <div className="history-card-metrics"><span><strong>{game.guesses.length}<small>/15</small></strong>answered</span><span><strong>{accuracy(game.guesses.filter(g => g.points === 1).length, game.guesses.length)}</strong>accuracy</span><span><strong className={gameScore(game) < 0 ? 'negative' : 'positive'}>{signed(gameScore(game))}</strong>points</span></div>
            <div className="history-card-footer"><span>{game.status === 'active' ? 'Continue where you left off' : 'Review your answers'}</span><ArrowRight size={15} /></div>
          </button>;
        })}</div> : <Empty filtered={state.games.length > 0} onPractice={onPractice} />}
      </> : <div className="daily-workspace grid-flow-dense">
        <aside className="day-rail" aria-label="Activity dates"><div className="day-rail-heading"><h2>Your days</h2><span>{days.length} active</span></div>
          {selectedDay && !day && <button className="day-option selected" aria-pressed="true"><span>{formatDay(selectedDay)}<small>No activity</small></span><strong>0</strong></button>}
          {days.map(entry => <button key={entry.day} className={`day-option ${entry.day === dayKey ? 'selected' : ''}`} aria-pressed={entry.day === dayKey} onClick={() => onDay(entry.day)}><span>{formatDay(entry.day)}<small>{entry.guesses} guesses</small></span><strong className={entry.score < 0 ? 'negative' : ''}>{signed(entry.score)}</strong></button>)}
          {!days.length && !selectedDay && <p className="day-rail-empty">Your practice days will appear here.</p>}
        </aside>
        <section className="panel day-detail" aria-label="Selected day activity" key={dayKey}>
          <div className="panel-heading"><div><h2>{dayKey ? formatDay(dayKey) : 'A fresh page.'}</h2><p>{day ? `${day.completed} completed · ${day.abandoned} abandoned` : 'No guesses recorded for this day.'}</p></div>{selectedDay && <button className="icon-button" aria-label="Show latest activity" onClick={() => onDay(undefined)}><X size={16} /></button>}</div>
          {day && <div className="table-scroll"><table className="data-table daily-totals"><thead><tr><th>Guesses</th><th>Correct</th><th>Incorrect</th><th>Not sure</th><th>Accuracy</th><th className="align-right">Score</th></tr></thead><tbody><tr><td data-label="Guesses">{day.guesses}</td><td data-label="Correct" className="positive">{day.correct}</td><td data-label="Incorrect" className="negative">{day.incorrect}</td><td data-label="Not sure">{day.unsure}</td><td data-label="Accuracy">{accuracy(day.correct, day.guesses)}</td><td data-label="Score" className={`align-right ${day.score < 0 ? 'negative' : 'positive'}`}>{signed(day.score)}</td></tr></tbody></table></div>}
          {dayGames.length ? dayGames.map(game => <div className="day-game" key={game.id}><div className="day-game-heading"><span>{new Date(game.startedAt).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })} game</span><button className="text-button" onClick={() => game.status === 'active' ? onResume() : onReview(game.id)}>{game.status === 'active' ? 'Resume game' : 'Review game'}<ArrowUpRight size={14} /></button></div><GuessTable game={{ ...game, guesses: game.guesses.filter(guess => guess.day === dayKey), penalty: game.penalty?.day === dayKey ? game.penalty : null }} /></div>) : <div className="day-empty"><CalendarDays size={28} /><h2>Room for a little practice.</h2><p>A game is all it takes to make a mark.</p><button className="button secondary" onClick={onPractice}>Go to Practice <ArrowRight size={16} /></button></div>}
        </section>
      </div>}
    </div>
    <p className="privacy-note"><LockKeyhole size={14} />Your history stays in this browser. Export a backup before clearing browser data.</p>
  </div>;
}

function Empty({ filtered, onPractice }: { filtered: boolean; onPractice: () => void }) {
  return <div className="panel empty-state"><HistoryIcon size={32} /><h2>{filtered ? 'No games in this view.' : 'No history. Yet.'}</h2><p>{filtered ? 'Try another filter to find your games.' : 'Your first game is the start of your record.'}</p>{!filtered && <button className="button primary" onClick={onPractice}>Go to Practice <ArrowRight size={16} /></button>}</div>;
}
