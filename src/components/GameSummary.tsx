import { useState } from 'react';
import { ArrowLeft, ArrowRight, Target, Check, X, HelpCircle } from 'lucide-react';
import type { GameRecord } from '../types';
import { accuracy, gameScore, signed } from '../lib/stats';
import { GuessTable } from './History';

export default function GameSummary({ game, ready, onStart, onBack, onHome, hasActive }: { game: GameRecord; ready: boolean; onStart: () => void; onBack: () => void; onHome: () => void; hasActive: boolean }) {
  const [filter, setFilter] = useState<'all' | 'learn'>('all');
  const correct = game.guesses.filter(guess => guess.points === 1).length;
  const incorrect = game.guesses.filter(guess => guess.points === -1).length;
  const unsure = game.guesses.length - correct - incorrect;
  const reviewGame = filter === 'learn' ? { ...game, guesses: game.guesses.filter(guess => guess.points !== 1), penalty: null } : game;
  return <>
    <button className="text-button back-link" onClick={onBack}><ArrowLeft size={16} />Back to history</button>
    <section className="summary-hero review-hero grid-flow-dense"><div><span className={`status-badge ${game.status}`}>{game.status === 'abandoned' ? 'Abandoned game' : 'Completed game'}</span><h1 className="max-w-5xl">{game.status === 'abandoned' ? 'A fresh start is always an option.' : 'Practice, in the bank.'}</h1><p>{game.status === 'abandoned' ? 'Your answers are saved. The score includes any abandonment penalty.' : 'A little more knowledge to take into your next match.'}</p><div className="review-actions"><button className="button primary" disabled={!ready} onClick={onStart}>{hasActive ? 'Resume game' : 'Play another game'}<ArrowRight size={18} /></button><button className="text-button" onClick={onHome}>Back to Overview <ArrowRight size={15} /></button></div></div><div className={`summary-score ${gameScore(game) < 0 ? 'negative' : ''}`}>{signed(gameScore(game))}<span>Game score</span></div></section>
    <div className="summary-stats"><span><Check className="positive" size={18} /><strong>{correct}</strong> correct</span><span><X className="negative" size={18} /><strong>{incorrect}</strong> incorrect</span><span><HelpCircle size={18} /><strong>{unsure}</strong> not sure</span><span><Target size={18} /><strong>{accuracy(correct, game.guesses.length)}</strong> accuracy</span></div>
    <section className="panel review-answers"><div className="panel-heading"><h2>Your answers</h2><span className="muted">{new Date(game.startedAt).toLocaleDateString('en', { dateStyle: 'medium' })}</span></div><div className="filter-bar" role="group" aria-label="Filter answers"><button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All answers <span>{game.guesses.length}</span></button><button aria-pressed={filter === 'learn'} onClick={() => setFilter('learn')}>Missed & uncertain <span>{incorrect + unsure}</span></button></div>{reviewGame.guesses.length || reviewGame.penalty ? <GuessTable game={reviewGame} /> : <p className="panel-footnote">{filter === 'learn' ? 'Nothing to revisit. You remembered every answered property.' : 'No guesses recorded.'}</p>}</section>
  </>;
}
