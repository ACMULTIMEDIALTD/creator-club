import { useEffect, useState } from 'react';
import { api } from './api.js';

let cached;
/** Public lookups (niches, regions, terms version, whether email is set up). Fetched once per page load. */
export function loadMeta() {
  cached ??= api.get('/public/meta').catch((e) => { cached = undefined; throw e; });
  return cached;
}

export function useMeta() {
  const [meta, setMeta] = useState(null);
  useEffect(() => { loadMeta().then(setMeta).catch(() => {}); }, []);
  return meta;
}
