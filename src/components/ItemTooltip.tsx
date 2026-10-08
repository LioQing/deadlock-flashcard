import { useEffect, useRef } from 'react';
import { DlItemTooltip } from '@deadlock-api/ui-react';
import type { Question } from '../types';
import { maskItem } from '../lib/game';

const backers = new Map<string, Promise<boolean>>();

function loadBacker(category: string): Promise<boolean> {
  const url = `https://assets-bucket.deadlock-api.com/assets-api-res/images/tooltips/items/tooltip_backer_${category}.png`;
  const cached = backers.get(url);
  if (cached) return cached;
  const promise = new Promise<boolean>(resolve => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });
  backers.set(url, promise);
  return promise;
}

export default function ItemTooltip({ question, revealed }: { question: Question; revealed: boolean }) {
  const ref = useRef<HTMLDlItemTooltipElement>(null);
  const item = revealed ? question.item : maskItem(question.item, question.propertyKey);

  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    // The package uses a 450px fixed-width Shadow DOM tooltip. Adapt only its
    // width, keeping the actual library's complete rendering and styling.
    const fit = () => {
      if (cancelled) return;
      const root = ref.current?.shadowRoot;
      if (!root) { frame = requestAnimationFrame(fit); return; }
      const style = document.createElement('style');
      const responsive = ':host{width:100%!important;max-width:450px}.tooltip{width:100%!important;max-width:450px}';
      // A CSS image mask makes the entire tooltip transparent while loading,
      // or forever if the remote art fails. Never let that hide the actual data.
      style.textContent = `${responsive}.tooltip-shadow{-webkit-mask-image:none!important;mask-image:none!important;border-radius:3px}`;
      style.dataset.recallResponsive = 'true';
      root.appendChild(style);
      void loadBacker(question.item.item_slot_type).then(loaded => {
        if (!cancelled && loaded) style.textContent = responsive;
      });
    };
    frame = requestAnimationFrame(fit);
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [question.item.item_slot_type]);

  return <DlItemTooltip ref={ref} itemData={item} componentItemsData={question.components} parentItemsData={question.parents} />;
}
