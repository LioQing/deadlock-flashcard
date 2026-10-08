import { useState } from 'react';
import { Package } from 'lucide-react';
import type { Item } from '../types';

export default function ItemShopIcon({ item }: { item: Item }) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const sources = [...new Set([item.shop_image_webp, item.shop_image, item.image_webp, item.image])];
  const source = sources.find((url): url is string => !!url && !failedSources.includes(url));

  return <div className="item-shop-icon">
    {source ? <img key={source} src={source} alt={`${item.name} shop icon`} width={72} height={72} onError={() => setFailedSources(previous => [...previous, source])} />
      : <span role="img" aria-label={`${item.name} shop icon unavailable`}><Package size={28} aria-hidden="true" /></span>}
  </div>;
}
