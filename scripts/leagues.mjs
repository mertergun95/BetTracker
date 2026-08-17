/**
 * The leagues BetTracker ships fixtures for.
 *
 * `espn` is the path segment pair used by ESPN's public site API:
 *   https://site.api.espn.com/apis/site/v2/sports/<sport>/<league>/...
 *
 * Football is limited to the biggest European leagues plus Denmark; the US
 * sports are the ones this app is actually used for.
 */

export const LEAGUES = [
  /* ---------------- American sports ---------------- */
  { id: 'nfl', sport: 'americanFootball', espn: ['football', 'nfl'], name: 'NFL', country: 'US', season: 'aug-feb' },
  { id: 'ncaaf', sport: 'americanFootball', espn: ['football', 'college-football'], name: 'NCAA Football', country: 'US', season: 'aug-jan', teamLimit: 400 },
  { id: 'nba', sport: 'basketball', espn: ['basketball', 'nba'], name: 'NBA', country: 'US', season: 'oct-jun' },
  { id: 'ncaab', sport: 'basketball', espn: ['basketball', 'mens-college-basketball'], name: 'NCAA Basketball', country: 'US', season: 'nov-apr', teamLimit: 400 },

  /* ---------------- European football ---------------- */
  { id: 'eng.1', sport: 'football', espn: ['soccer', 'eng.1'], name: 'Premier League', country: 'GB', season: 'aug-may' },
  { id: 'esp.1', sport: 'football', espn: ['soccer', 'esp.1'], name: 'La Liga', country: 'ES', season: 'aug-may' },
  { id: 'ita.1', sport: 'football', espn: ['soccer', 'ita.1'], name: 'Serie A', country: 'IT', season: 'aug-may' },
  { id: 'ger.1', sport: 'football', espn: ['soccer', 'ger.1'], name: 'Bundesliga', country: 'DE', season: 'aug-may' },
  { id: 'fra.1', sport: 'football', espn: ['soccer', 'fra.1'], name: 'Ligue 1', country: 'FR', season: 'aug-may' },
  { id: 'ned.1', sport: 'football', espn: ['soccer', 'ned.1'], name: 'Eredivisie', country: 'NL', season: 'aug-may' },
  { id: 'por.1', sport: 'football', espn: ['soccer', 'por.1'], name: 'Primeira Liga', country: 'PT', season: 'aug-may' },
  { id: 'bel.1', sport: 'football', espn: ['soccer', 'bel.1'], name: 'Pro League', country: 'BE', season: 'jul-may' },
  { id: 'tur.1', sport: 'football', espn: ['soccer', 'tur.1'], name: 'Süper Lig', country: 'TR', season: 'aug-may' },
  { id: 'sco.1', sport: 'football', espn: ['soccer', 'sco.1'], name: 'Premiership', country: 'GB-SCT', season: 'aug-may' },
  { id: 'aut.1', sport: 'football', espn: ['soccer', 'aut.1'], name: 'Bundesliga', country: 'AT', season: 'jul-may' },
  { id: 'sui.1', sport: 'football', espn: ['soccer', 'sui.1'], name: 'Super League', country: 'CH', season: 'jul-may' },
  { id: 'gre.1', sport: 'football', espn: ['soccer', 'gre.1'], name: 'Super League', country: 'GR', season: 'aug-may' },
  { id: 'rus.1', sport: 'football', espn: ['soccer', 'rus.1'], name: 'Premier League', country: 'RU', season: 'jul-may' },
  { id: 'rou.1', sport: 'football', espn: ['soccer', 'rou.1'], name: 'Liga I', country: 'RO', season: 'jul-may' },
  { id: 'isr.1', sport: 'football', espn: ['soccer', 'isr.1'], name: 'Ligat ha\'Al', country: 'IL', season: 'aug-may' },
  { id: 'den.1', sport: 'football', espn: ['soccer', 'den.1'], name: 'Superliga', country: 'DK', season: 'jul-may' },
  { id: 'nor.1', sport: 'football', espn: ['soccer', 'nor.1'], name: 'Eliteserien', country: 'NO', season: 'apr-nov' },
  { id: 'swe.1', sport: 'football', espn: ['soccer', 'swe.1'], name: 'Allsvenskan', country: 'SE', season: 'apr-nov' },
  { id: 'uefa.champions', sport: 'football', espn: ['soccer', 'uefa.champions'], name: 'Champions League', country: 'EU', season: 'sep-may' },
  { id: 'uefa.europa', sport: 'football', espn: ['soccer', 'uefa.europa'], name: 'Europa League', country: 'EU', season: 'sep-may' },
];

/** Flags shown next to a league in the picker. */
export const COUNTRY_FLAGS = {
  US: '🇺🇸',
  GB: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'GB-SCT': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  ES: '🇪🇸',
  IT: '🇮🇹',
  DE: '🇩🇪',
  FR: '🇫🇷',
  NL: '🇳🇱',
  PT: '🇵🇹',
  BE: '🇧🇪',
  TR: '🇹🇷',
  AT: '🇦🇹',
  CH: '🇨🇭',
  GR: '🇬🇷',
  RU: '🇷🇺',
  UA: '🇺🇦',
  RO: '🇷🇴',
  IL: '🇮🇱',
  DK: '🇩🇰',
  NO: '🇳🇴',
  SE: '🇸🇪',
  EU: '🇪🇺',
};
