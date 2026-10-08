import { useRef, useState } from 'react';
import { ArrowRight, Check, ChevronRight, Crosshair, Heart, Sparkles } from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const steps = [
  { title: 'Read the item.', copy: 'The original tooltip stays intact. Just one property is hidden.' },
  { title: 'Trust your recall.', copy: 'Four possible properties. Choose one, or say “Not sure”.' },
  { title: 'Take it with you.', copy: 'The answer appears immediately. Learn it, then move on.' },
];

export default function PracticeLobby({ loading, ready, onStart }: { loading: boolean; ready: boolean; onStart: () => void }) {
  const [step, setStep] = useState(0);
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('.practice-illustration', { scale: .94, opacity: .65, scrollTrigger: { trigger: '.practice-launch', start: 'top 85%', end: 'center 45%', scrub: .6 } });
      gsap.from('.practice-manifesto span', { opacity: .35, stagger: .12, scrollTrigger: { trigger: '.practice-manifesto', start: 'top 95%', end: 'top 65%', scrub: .5 } });
    });
    return () => media.revert();
  }, { scope });

  return <div ref={scope} className="practice-lobby">
    <div className="page-heading"><div><h1 className="max-w-5xl">A little practice. A better recall.</h1><p>One focused game, whenever you have a moment.</p></div></div>
    <section className="practice-launch grid-flow-dense" aria-labelledby="practice-launch-title">
      <div className="practice-launch-copy"><h2 id="practice-launch-title">Know your next purchase.</h2><p>15 items, one missing property each. No timer, no daily limit. Just room to learn.</p>
        <div className="practice-deck" aria-label="Five items from each category"><span><Crosshair size={15} />5 Weapon</span><span><Heart size={15} />5 Vitality</span><span><Sparkles size={15} />5 Spirit</span></div>
        <button className="button primary" disabled={!ready || loading} onClick={onStart}>{loading ? 'Loading items…' : 'Start a game'}<ArrowRight size={17} /></button>
        <small>Your place is saved after every answer.</small>
      </div>
      <div className="practice-illustration" aria-hidden="true"><div className="illustration-line" /><div className="paper-back" /><div className="paper-preview"><span>Extended Magazine</span><div><span>Weapon damage</span><strong>+8%</strong></div><div><span>Max ammo</span><strong className="paper-blank">[?]</strong></div><small>What belongs in the blank?</small></div></div>
    </section>
    <section className="practice-guide" aria-labelledby="practice-guide-title">
      <div className="guide-heading"><h2 id="practice-guide-title">A small loop. A lasting memory.</h2><p>Explore the flow before you begin.</p></div>
      <div className="flow-accordion grid-flow-dense">{steps.map((item, index) => <div key={item.title} className={`flow-panel ${step === index ? 'expanded' : ''}`}>
        <button className="flow-toggle" aria-expanded={step === index} aria-controls={`flow-preview-${index}`} onClick={() => setStep(index)}><span>{item.title}</span><ChevronRight size={18} /></button>
        <div id={`flow-preview-${index}`} className="flow-content" aria-hidden={step !== index} inert={step !== index}><div className="flow-content-inner"><p>{item.copy}</p>
          <div className="flow-example" aria-hidden="true">{index === 0 ? <><span>Extended Magazine</span><div>Max ammo <strong>[?]</strong></div></> : index === 1 ? <><div>Weapon damage <span>1</span></div><div className="example-selected">Max ammo <span>2</span></div><div>Not sure <span>5</span></div></> : <><div className="example-answer"><Check size={18} />You remembered it. <strong>+1</strong></div><span>The missing property is Max ammo.</span></>}</div>
        </div></div>
      </div>)}</div>
      <div className="practice-scoring"><span className="positive">+1 correct</span><span className="negative">−1 incorrect</span><span>0 not sure</span></div>
      <p className="practice-manifesto">{'Leave whenever you need to. Return right where you left off.'.split(' ').map((word, index) => <span key={index}>{word} </span>)}</p>
      <p className="practice-fineprint">Only explicitly abandoning or replacing an unfinished game applies a penalty: a final score of −10, or your current score if it is lower.</p>
    </section>
  </div>;
}
