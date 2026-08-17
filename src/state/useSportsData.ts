import { useEffect, useState } from 'react';
import {
  loadCatalog,
  loadFixtures,
  type Catalog,
  type FixtureFile,
} from '@/core/sportsData';

export interface SportsData {
  catalog: Catalog;
  fixtures: FixtureFile;
  loading: boolean;
}

const EMPTY: SportsData = {
  catalog: { generatedAt: '', leagues: [] },
  fixtures: { generatedAt: '', leagues: {} },
  loading: true,
};

/**
 * Loads the bundled league catalogue once per session.
 *
 * Both files resolve to an empty shape rather than throwing when they are
 * missing, so the bet form degrades to free-text entry instead of breaking.
 */
export function useSportsData(): SportsData {
  const [state, setState] = useState<SportsData>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    Promise.all([loadCatalog(), loadFixtures()]).then(([catalog, fixtures]) => {
      if (!cancelled) setState({ catalog, fixtures, loading: false });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
