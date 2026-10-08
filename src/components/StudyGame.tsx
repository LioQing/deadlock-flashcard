import { useEffect, useRef } from 'react';
import { ArrowRight, ArrowLeft, Check, X, HelpCircle, Crosshair, Heart, Sparkles, Flag } from 'lucide-react';
import type { ActiveGame, GameRecord } from '../types';
import { CATEGORY_NAMES } from '../types';
import { gameScore, signed } from '../lib/stats';
import ItemTooltip from './ItemTooltip';
import ItemShopIcon from './ItemShopIcon';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

interface Props {
  active: ActiveGame;
  record: GameRecord;
  blocked: boolean;
  onAnswer: (selection: string | null) => void;
  onNext: () => void;
  onAbandon: () => void;
  onOverview: () => void;
}

export default function StudyGame({ active, record, blocked, onAnswer, onNext, onAbandon, onOverview }: Props) {
  const question = active.questions[active.index];
  const guess = record.guesses[active.index];
  const nextRef = useRef<HTMLButtonElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const scope = useRef<HTMLDivElement>(null);
  const previousIndex = useRef(active.index);
  const category = question.item.item_slot_type;
  const Icon = category === 'weapon' ? Crosshair : category === 'vitality' ? Heart : Sparkles;

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from(guess ? '.feedback-card' : '.item-stage, .answer-choices', { y: guess ? 6 : 10, opacity: .6, duration: .35, stagger: .04, ease: 'power2.out' });
    });
    return () => media.revert();
  }, { scope, dependencies: [active.index, !!guess], revertOnUpdate: true });

  useEffect(() => {
    if (guess) nextRef.current?.focus({ preventScroll: true });
    else firstRef.current?.focus({ preventScroll: true });
    if (window.matchMedia('(max-width: 850px)').matches) {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (guess) nextRef.current?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'nearest' });
      else if (previousIndex.current !== active.index) scope.current?.querySelector('.game-progress')?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' });
    }
    previousIndex.current = active.index;
  }, [active.index, !!guess]);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (blocked || event.altKey || event.ctrlKey || event.metaKey || document.querySelector('dialog[open]')) return;
      if ((event.target as HTMLElement)?.closest('input, textarea, select')) return;
      const index = Number(event.key) - 1;
      if (!guess && index >= 0 && index < 4) { event.preventDefault(); onAnswer(question.choices[index]); }
      if (!guess && event.key === '5') { event.preventDefault(); onAnswer(null); }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [guess, question, blocked, onAnswer]);

  return <div ref={scope} className="practice-session">
    <div className="study-topline"><button className="text-button" onClick={onOverview}><ArrowLeft size={16} />Back to Overview</button><span className="quiet-badge">Progress saved automatically</span></div>
    <div className="page-heading study-heading"><div><h1 className="max-w-5xl">What’s the missing property?</h1><p>Read the item. Make your call. Learn the answer.</p></div><div className="game-score"><span>Game score</span><strong>{signed(gameScore(record))}</strong></div></div>
    <div className="game-progress"><div className="progress-label"><span>Question <strong>{active.index + 1}</strong> <span className="muted">/ 15</span></span><span className="muted">{record.guesses.length} answered</span></div><div className="progress-segments">{active.questions.map((q, index) => <span key={q.item.id} className={`${record.guesses[index] ? `result-${record.guesses[index].points}` : ''} ${index === active.index ? 'current' : ''}`} title={`Question ${index + 1}: ${CATEGORY_NAMES[q.item.item_slot_type]}`} />)}</div></div>
    <div className="study-grid">
      <section className={`item-stage ${category}`} aria-label="Item tooltip">
        <div className="item-stage-label"><span className={`category-badge ${category}`}><Icon size={14} />{CATEGORY_NAMES[category]}</span><span className="muted">Tier {question.item.item_tier}</span></div>
        <ItemShopIcon key={`${active.id}-${active.index}`} item={question.item} />
        <div className="tooltip-wrap"><ItemTooltip key={`${active.id}-${active.index}-${!!guess}`} question={question} revealed={!!guess} /></div>
        <div className="item-stage-caption">{guess ? 'Answer revealed. One more thing remembered.' : 'One property is missing. Everything else is here.'}</div>
      </section>
      <section className={`answer-panel ${guess ? 'answer-revealed' : ''}`} aria-labelledby="answer-heading">
        <h2 id="answer-heading">Fill in the blank.</h2><p>Which property belongs to <strong>{question.item.name}</strong>?</p>
        {!guess && <p id="answer-instruction" className="answer-instruction">Choose an answer to reveal the property immediately.</p>}
        <div className="answer-choices">{question.choices.map((choice, index) => {
          const correct = !!guess && choice === question.correctLabel;
          const wrong = !!guess && choice === guess.selection && !correct;
          return <button type="button" ref={index === 0 ? firstRef : undefined} key={choice} className={`answer-choice ${correct ? 'choice-correct' : ''} ${wrong ? 'choice-wrong' : ''}`} aria-describedby={!guess ? 'answer-instruction' : undefined} disabled={!!guess || blocked} onClick={() => onAnswer(choice)}>
            <kbd>{index + 1}</kbd><span>{choice}</span>{correct ? <Check size={18} /> : wrong ? <X size={18} /> : !guess ? <span className="answer-action">Choose <ArrowRight size={16} aria-hidden="true" /></span> : null}
          </button>;
        })}</div>
        <button className={`unsure-button ${guess?.selection === null ? 'chosen' : ''}`} disabled={!!guess || blocked} onClick={() => onAnswer(null)}><kbd>5</kbd><span>Not sure</span><span className="unsure-note">No points gained or lost</span>{!guess && <span className="answer-action">Choose <ArrowRight size={16} aria-hidden="true" /></span>}</button>
        <div className="answer-feedback" aria-live="polite" aria-atomic="true">
          {guess && <div className={`feedback-card feedback-${guess.points}`}><div className="feedback-title">{guess.points === 1 ? <Check size={19} /> : guess.points === -1 ? <X size={19} /> : <HelpCircle size={19} />}<strong>{guess.points === 1 ? 'You remembered it.' : guess.points === -1 ? 'One to remember next time.' : 'Now you know.'}</strong><span>{signed(guess.points)} pt{Math.abs(guess.points) === 1 ? '' : 's'}</span></div><p>The missing property is <strong>{question.correctLabel}</strong>.</p></div>}
        </div>
        {guess ? <button ref={nextRef} className="button primary next-button" disabled={blocked} onClick={onNext}>{active.index === 14 ? 'See game summary' : 'Next question'}<ArrowRight size={18} /></button> : <p className="keyboard-note">Click an answer or use keys <kbd>1</kbd>–<kbd>5</kbd>.</p>}
      </section>
    </div>
    <div className="study-footer"><span>You can leave this screen and resume later. Nothing is lost.</span>{record.status === 'active' && <details className="session-options"><summary>Game options</summary><div><p>Ending an unfinished game applies a penalty. Leaving this screen does not.</p><button className="text-button danger-text" onClick={onAbandon}><Flag size={14} />Abandon game <span className="penalty-tag">{signed(Math.min(gameScore(record), -10))} final score</span></button></div></details>}</div>
  </div>;
}
