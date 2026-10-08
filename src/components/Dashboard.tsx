import { ArrowUpRight, ArrowRight, Check } from 'lucide-react';
import type { StudyState, DailyStats } from '../types';
import { gameScore, signed } from '../lib/stats';
import ActivityCalendar from './ActivityCalendar';

interface Props {
  state: StudyState;
  days: DailyStats[];
  now: Date;
  loading: boolean;
  ready: boolean;
  onStart: () => void;
  onResume: () => void;
  onHistory: () => void;
  onReview: (id: string) => void;
  onDay: (day: string) => void;
}

export default function Dashboard({ state, days, now, loading, ready, onStart, onResume, onHistory, onReview, onDay }: Props) {
  const guesses = state.games.flatMap(game => game.guesses);
  const correct = guesses.filter(guess => guess.points === 1).length;
  const incorrect = guesses.filter(guess => guess.points === -1).length;
  const unsure = guesses.length - correct - incorrect;
  const recent = [...state.games].reverse().slice(0, 4);
  const cumulativeScore = state.games.reduce((sum, game) => sum + gameScore(game), 0);

  return <div className="dashboard">
    <div className="page-heading overview-heading"><div><h1 className="overview-title max-w-5xl">Small sessions. Steady progress.</h1><p>Your practice, day by day. A little more remembered each time.</p></div></div>
    <ActivityCalendar days={days} now={now} onDay={onDay} />
    <section className="panel overview-score" aria-labelledby="cumulative-score-title">
      <div><h2 id="cumulative-score-title">Cumulative score</h2><p>All games, including abandonment penalties.</p></div>
      <strong className={`cumulative-score ${cumulativeScore < 0 ? 'negative' : ''}`}>{signed(cumulativeScore)} <small>pts</small></strong>
    </section>
    <div className="dashboard-actions" aria-label="Game controls">
      {state.active && <div className="resume-context"><strong>Your game is waiting.</strong><span>{state.games.find(game => game.id === state.active?.id)?.guesses.length ?? 0} of 15 answered · No progress lost</span></div>}
      {state.active ? <>
        <button className="button primary" onClick={onResume}>Resume game <ArrowRight size={17} /></button>
        <button className="button secondary" disabled={!ready || loading} onClick={onStart}>New game <ArrowUpRight size={15} /></button>
      </> : <button className="button primary" disabled={!ready || loading} onClick={onStart}>{loading ? 'Loading items…' : 'Start a game'}<ArrowRight size={17} /></button>}
    </div>
    <div className="dashboard-details grid-flow-dense">
      <section className="panel recall-panel" aria-labelledby="recall-title">
        <div className="panel-heading"><h2 id="recall-title">The recall breakdown</h2><span className="muted">All time</span></div>
        <div className="recall-bar" aria-label={`${correct} correct, ${incorrect} incorrect, ${unsure} not sure`}>
          {guesses.length ? <><i className="correct" style={{ flex: correct }} /><i className="incorrect" style={{ flex: incorrect }} /><i className="unsure" style={{ flex: unsure }} /></> : <i className="empty" />}
        </div>
        <div className="breakdown-rows">
          <div className="breakdown-row"><span><i className="dot correct" />Correct <small>+1</small></span><strong>{correct}</strong></div>
          <div className="breakdown-row"><span><i className="dot incorrect" />Incorrect <small>−1</small></span><strong>{incorrect}</strong></div>
          <div className="breakdown-row"><span><i className="dot unsure" />Not sure <small>0</small></span><strong>{unsure}</strong></div>
        </div>
        <p className="panel-footnote">An honest “not sure” is a good place to learn.</p>
      </section>
      <section className="panel recent-panel">
        <div className="panel-heading"><h2>Recent games</h2><button className="text-button" onClick={onHistory}>View history <ArrowUpRight size={16} /></button></div>
        {recent.length ? <div className="game-list">{recent.map(game => <button className="game-row" key={game.id} onClick={() => game.status === 'active' ? onResume() : onReview(game.id)}>
          <span className={`session-icon ${game.status}`}><Check size={17} /></span>
          <span className="session-name"><strong>{game.status === 'active' ? 'Game in progress' : game.status === 'completed' ? 'Completed game' : 'Abandoned game'}</strong><small>{new Date(game.startedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })} · {new Date(game.startedAt).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}</small></span>
          <span className="session-answers">{game.guesses.length}/15</span><strong className={`session-score ${gameScore(game) < 0 ? 'negative' : ''}`}>{signed(gameScore(game))} <small>pts</small></strong><ArrowUpRight size={16} className="muted" />
        </button>)}</div> : <div className="empty-history"><span className="empty-history-line" /><div><strong>Your story starts with one game.</strong><p>Ready whenever you are.</p></div></div>}
      </section>
    </div>
  </div>;
}
