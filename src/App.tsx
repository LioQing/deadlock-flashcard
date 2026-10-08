import { useEffect, useMemo, useRef, useState } from 'react';
import { DlProvider } from '@deadlock-api/ui-react';
import { Language } from '@deadlock-api/ui-core';
import { ArrowUpRight, CircleHelp, LockKeyhole, RefreshCw, X, LayoutDashboard, Layers, History as HistoryIcon, Moon, Sun } from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import type { ActiveGame, Item } from './types';
import { loadCachedItems } from './lib/itemLoader';
import { createGame } from './lib/game';
import { dailyStats, gameScore } from './lib/stats';
import { useStudy } from './hooks/useStudy';
import { useTheme } from './hooks/useTheme';
import Dashboard from './components/Dashboard';
import PracticeLobby from './components/PracticeLobby';
import StudyGame from './components/StudyGame';
import History, { type HistoryPreferences } from './components/History';
import GameSummary from './components/GameSummary';
import ConfirmDialog from './components/ConfirmDialog';
import { readRoute, routeHash, type AppRoute, type View } from './lib/navigation';

gsap.registerPlugin(useGSAP);

export default function App() {
  const mainRef = useRef<HTMLElement>(null);
  const { theme, toggleTheme } = useTheme();
  const { state, dispatch, error: storageError, reload } = useStudy();
  const [route, setRoute] = useState<AppRoute>(() => readRoute(window.location.hash, !!state.active));
  const { view } = route;
  const [historyPreferences, setHistoryPreferences] = useState<HistoryPreferences>({ tab: route.day ? 'daily' : 'games', filter: 'all' });
  const reviewReturn = useRef<AppRoute>({ view: 'history' });
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [itemWarning, setItemWarning] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [confirmation, setConfirmation] = useState<{ game: ActiveGame | null; activeId: string } | null>(null);
  const [now, setNow] = useState(new Date());
  const [showHelp, setShowHelp] = useState(false);
  const days = useMemo(() => dailyStats(state.games), [state.games]);
  const ready = items.length > 0 && !storageError;
  const activeRecord = state.active ? state.games.find(game => game.id === state.active!.id) : undefined;
  const summary = state.games.find(game => game.id === route.gameId);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const targets = mainRef.current?.querySelectorAll('.page-heading, .study-topline, .summary-hero, .history-toolbar');
      if (targets?.length) gsap.from(targets, {
        y: 12, opacity: .65, duration: .55, stagger: .06, ease: 'power2.out',
      });
    });
    return () => media.revert();
  }, { scope: mainRef, dependencies: [view, route.gameId], revertOnUpdate: true });

  useEffect(() => {
    const syncRoute = () => {
      const next = readRoute(window.location.hash, !!state.active);
      setRoute(next);
      if (next.day) setHistoryPreferences(previous => ({ ...previous, tab: 'daily' }));
    };
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, [!!state.active]);

  useEffect(() => {
    if (view === 'study' && state.active) return;
    const heading = mainRef.current?.querySelector<HTMLElement>('h1');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus({ preventScroll: true });
  }, [view, route.gameId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setApiError('');
    setItemWarning('');
    loadCachedItems(AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]), next => {
      if (controller.signal.aborted) return;
      setItems(next);
      setLoading(false);
    }, {
      forceRefresh: attempt > 0,
      onRefreshError: () => {
        if (!controller.signal.aborted) setItemWarning('The item API could not be reached. You can keep playing with cached items, but their stats may be out of date.');
      },
    })
      .catch(error => {
        if (!controller.signal.aborted) setApiError(error.name === 'TimeoutError' ? 'The item API took too long to respond. Please try again.' : error.message || 'Unable to load item data.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    const refreshDate = () => setNow(new Date());
    window.addEventListener('focus', refreshDate);
    return () => { clearInterval(timer); window.removeEventListener('focus', refreshDate); };
  }, []);

  const go = (next: AppRoute) => {
    if (routeHash(next) !== window.location.hash) {
      if (!window.location.hash) window.history.replaceState(null, '', routeHash(route));
      window.history.pushState(null, '', routeHash(next));
    }
    setRoute(next);
    setShowHelp(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const navigate = (next: View) => go({ view: next });
  const review = (id: string) => {
    reviewReturn.current = route.view === 'history' ? route : { view: 'history' };
    go({ view: 'summary', gameId: id });
  };
  const openDay = (day: string | undefined) => {
    if (day) setHistoryPreferences(previous => ({ ...previous, tab: 'daily' }));
    go({ view: 'history', day });
  };
  const start = () => {
    if (!ready) return;
    try {
      const game = createGame(items);
      if (state.active && activeRecord?.status === 'active') setConfirmation({ game, activeId: state.active.id });
      else if (dispatch({ type: 'start', game, at: new Date() })) navigate('study');
    } catch (error) { setApiError(error instanceof Error ? error.message : 'Unable to create a game.'); }
  };
  const confirm = () => {
    if (!confirmation) return;
    const oldId = state.active?.id;
    const success = confirmation.game
      ? dispatch({ type: 'start', game: confirmation.game, at: new Date(), replaceId: confirmation.activeId })
      : dispatch({ type: 'abandon', at: new Date(), gameId: confirmation.activeId });
    setConfirmation(null);
    if (success) {
      if (confirmation.game) navigate('study');
      else if (oldId) review(oldId);
    }
  };
  const next = () => {
    const id = state.active?.id;
    const last = state.active?.index === 14;
    if (dispatch({ type: 'next' }) && last && id) review(id);
  };

  return <DlProvider language={Language.EN} tooltipTrigger="none"><div className="app-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header">
      <button className="brand" onClick={() => navigate('overview')} aria-label="Deadlock Flashcard Overview"><span className="brand-symbol"><i /><i /></span><span><strong>Deadlock <span>Flashcard</span></strong></span></button>
      <nav className="site-nav" aria-label="Main navigation">
        <button className={view === 'overview' ? 'nav-active' : ''} aria-current={view === 'overview' ? 'page' : undefined} onClick={() => navigate('overview')}><LayoutDashboard size={16} />Overview</button>
        <button className={view === 'study' ? 'nav-active' : ''} aria-current={view === 'study' ? 'page' : undefined} onClick={() => navigate('study')}><Layers size={16} />Practice{state.active && <span className="nav-dot" />}</button>
        <button className={view === 'history' || view === 'summary' ? 'nav-active' : ''} aria-current={view === 'history' || view === 'summary' ? 'page' : undefined} onClick={() => navigate('history')}><HistoryIcon size={16} />History</button>
      </nav>
      <div className="header-actions"><span className="local-badge"><LockKeyhole size={13} />Local & private</span><button className="icon-button theme-toggle" aria-label="Dark theme" aria-pressed={theme === 'dark'} title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleTheme}>{theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}</button><button className="icon-button help-link" aria-label="How it works" aria-expanded={showHelp} onClick={() => setShowHelp(!showHelp)}><CircleHelp size={19} /></button></div>
    </header>
    <main ref={mainRef} id="main" className="main-content overflow-x-hidden w-full max-w-full">
      {storageError && <div className="error-banner" role="alert"><div><strong>Progress could not be saved</strong><p>{storageError}</p></div><button className="button secondary" onClick={reload}><RefreshCw size={14} />Reload progress</button></div>}
      {apiError && <div className="error-banner" role="alert"><div><strong>Item data is unavailable</strong><p>{apiError}{state.active ? ' Your saved game can still be resumed.' : ''}</p></div><button className="button secondary" disabled={loading} onClick={() => setAttempt(attempt + 1)}><RefreshCw size={14} />Retry</button></div>}
      {itemWarning && <div className="error-banner" role="status"><div><strong>Using saved item data</strong><p>{itemWarning}</p></div><button className="button secondary" disabled={loading} onClick={() => setAttempt(attempt + 1)}><RefreshCw size={14} />Retry update</button></div>}
      {showHelp && <section className="panel help-panel"><button className="icon-button help-close" aria-label="Close instructions" onClick={() => setShowHelp(false)}><X size={18} /></button><h2>One item. One missing property.</h2><p>Each game has 15 distinct items: 5 Weapon, 5 Vitality, and 5 Spirit. The full tooltip is shown with one property replaced by [?]. Pick the missing property from four choices, or choose “Not sure”.</p><p><strong className="positive">+1 correct</strong> · <strong className="negative">−1 incorrect</strong> · <strong>0 not sure</strong>. The answer is revealed after each guess. Accuracy includes all guesses, including “Not sure”. Games use random sampling, not spaced-repetition scheduling.</p><p>Start as many games as you want. Explicitly abandoning or replacing an unfinished game sets its final score to −10, or keeps its current score if it is already lower. Closing the tab, refreshing, or visiting Overview saves your place, with no penalty.</p><p>History uses your local calendar date. Scores can be negative. Data is stored only in this browser and can be exported from History.</p></section>}
      {view === 'overview' && <Dashboard state={state} days={days} now={now} loading={loading} ready={ready} onStart={start} onResume={() => navigate('study')} onHistory={() => navigate('history')} onReview={review} onDay={openDay} />}
      {view === 'study' && (state.active && activeRecord ?
        <StudyGame active={state.active} record={activeRecord} blocked={!!storageError}
          onAnswer={selection => dispatch({ type: 'answer', selection, at: new Date() })}
          onNext={next} onAbandon={() => { if (state.active) setConfirmation({ game: null, activeId: state.active.id }); }}
          onOverview={() => navigate('overview')} /> : <PracticeLobby loading={loading} ready={ready} onStart={start} />)}
      {view === 'history' && <History state={state} days={days} preferences={historyPreferences} onPreferences={setHistoryPreferences} selectedDay={route.day} onDay={openDay} onReview={review} onResume={() => navigate('study')} onPractice={() => navigate('study')} />}
      {view === 'summary' && (summary ? <GameSummary key={summary.id} game={summary} ready={!!state.active || (ready && !loading)} hasActive={!!state.active} onStart={state.active ? () => navigate('study') : start} onBack={() => go(reviewReturn.current)} onHome={() => navigate('overview')} /> : <div className="empty-state"><h1>This game is no longer available.</h1><button className="button primary" onClick={() => navigate('history')}>Back to history</button></div>)}
      <footer className="main-footer"><span>Small sessions. Lasting knowledge.</span><a href="https://ui.deadlock-api.com/" target="_blank" rel="noreferrer">Deadlock API <ArrowUpRight size={12} /></a><span>Unofficial · Not affiliated with Valve</span></footer>
    </main>
    {confirmation && <ConfirmDialog replacing={!!confirmation.game} score={activeRecord ? gameScore(activeRecord) : 0} onConfirm={confirm} onCancel={() => setConfirmation(null)} />}
  </div></DlProvider>;
}
