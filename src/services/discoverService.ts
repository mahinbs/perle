import type { DiscoverItem } from '../types';
 

export const DISCOVER_CATEGORIES = [
  'For You',
  'Politics',
  'Technology',
  'Science',
  'Psychology',
  'Health',
  'Environment',
  'Finance',
  'Sports',
] as const;

export type DiscoverCategory = (typeof DISCOVER_CATEGORIES)[number];

export function mapDiscoverCategory(item: DiscoverItem): string {
  if (item.category === 'Health Care') return 'Health';
  return item.category || 'Other';
}

// "For You" is curated to ~12 items mixed across categories — NOT the full firehose.
// Picks the freshest story from each category in round-robin order so the user
// sees variety (1 Tech, 1 Sports, 1 Finance, 1 Health, …) instead of a long
// monotonous list of one topic.
const FOR_YOU_MAX = 12;
function buildForYouMix(newsOnly: DiscoverItem[]): DiscoverItem[] {
  const byCat = new Map<string, DiscoverItem[]>();
  for (const it of newsOnly) {
    const cat = mapDiscoverCategory(it);
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(it);
  }
  // Round-robin: take one from each non-empty bucket, in turn, until we hit FOR_YOU_MAX.
  const result: DiscoverItem[] = [];
  let added = true;
  while (added && result.length < FOR_YOU_MAX) {
    added = false;
    for (const list of byCat.values()) {
      if (result.length >= FOR_YOU_MAX) break;
      const next = list.shift();
      if (next) {
        result.push(next);
        added = true;
      }
    }
  }
  return result;
}

export function filterByDiscoverCategory(
  items: DiscoverItem[],
  category: DiscoverCategory
): DiscoverItem[] {
  // Only real news items (those carry `nation`).
  const newsOnly = items.filter((i) => !!i.nation);
  if (category === 'For You') {
    // "For You" = user's own region headlines only, mixed across topics.
    const userCode = getUserNationCode();
    const mine = newsOnly.filter((i) => i.nationCode === userCode);
    const pool = mine.length > 0 ? mine : newsOnly;
    return buildForYouMix(pool);
  }
  return newsOnly.filter((i) => mapDiscoverCategory(i) === category);
}

// Map an IANA timezone to an ISO 3166-1 alpha-2 country code.
// This is how Perplexity / NYT / most web apps detect physical location without
// asking for permission — `Intl.DateTimeFormat().resolvedOptions().timeZone`
// reflects the OS's configured zone, which is set to wherever the device
// physically is. Coverage spans every populated IANA zone we can mention.
const TZ_TO_COUNTRY: Record<string, string> = {
  // South Asia
  'asia/kolkata': 'IN', 'asia/calcutta': 'IN',
  'asia/karachi': 'PK', 'asia/dhaka': 'BD', 'asia/colombo': 'LK',
  'asia/kathmandu': 'NP', 'asia/thimphu': 'BT', 'asia/kabul': 'AF',
  // East/Southeast Asia
  'asia/tokyo': 'JP', 'asia/seoul': 'KR',
  'asia/shanghai': 'CN', 'asia/chongqing': 'CN', 'asia/urumqi': 'CN', 'asia/harbin': 'CN', 'asia/kashgar': 'CN',
  'asia/hong_kong': 'HK', 'asia/macau': 'MO', 'asia/taipei': 'TW',
  'asia/singapore': 'SG', 'asia/kuala_lumpur': 'MY', 'asia/jakarta': 'ID', 'asia/makassar': 'ID', 'asia/jayapura': 'ID',
  'asia/manila': 'PH', 'asia/bangkok': 'TH', 'asia/ho_chi_minh': 'VN', 'asia/saigon': 'VN', 'asia/phnom_penh': 'KH', 'asia/vientiane': 'LA', 'asia/yangon': 'MM', 'asia/rangoon': 'MM',
  'asia/ulaanbaatar': 'MN',
  // Middle East
  'asia/dubai': 'AE', 'asia/abu_dhabi': 'AE',
  'asia/riyadh': 'SA', 'asia/qatar': 'QA', 'asia/kuwait': 'KW', 'asia/bahrain': 'BH', 'asia/muscat': 'OM',
  'asia/tehran': 'IR', 'asia/baghdad': 'IQ', 'asia/beirut': 'LB', 'asia/damascus': 'SY', 'asia/amman': 'JO',
  'asia/jerusalem': 'IL', 'asia/tel_aviv': 'IL', 'asia/gaza': 'PS', 'asia/hebron': 'PS',
  'asia/istanbul': 'TR', 'europe/istanbul': 'TR',
  // Central Asia
  'asia/almaty': 'KZ', 'asia/aqtau': 'KZ', 'asia/aqtobe': 'KZ', 'asia/atyrau': 'KZ', 'asia/oral': 'KZ', 'asia/qostanay': 'KZ', 'asia/qyzylorda': 'KZ',
  'asia/tashkent': 'UZ', 'asia/samarkand': 'UZ',
  'asia/bishkek': 'KG', 'asia/dushanbe': 'TJ', 'asia/ashgabat': 'TM', 'asia/baku': 'AZ', 'asia/yerevan': 'AM', 'asia/tbilisi': 'GE',
  // Europe
  'europe/london': 'GB',
  'europe/dublin': 'IE',
  'europe/paris': 'FR', 'europe/madrid': 'ES', 'europe/lisbon': 'PT', 'atlantic/madeira': 'PT', 'atlantic/azores': 'PT',
  'europe/berlin': 'DE', 'europe/busingen': 'DE',
  'europe/rome': 'IT', 'europe/vatican': 'VA',
  'europe/amsterdam': 'NL', 'europe/brussels': 'BE', 'europe/luxembourg': 'LU',
  'europe/zurich': 'CH', 'europe/vienna': 'AT',
  'europe/stockholm': 'SE', 'europe/oslo': 'NO', 'europe/copenhagen': 'DK', 'europe/helsinki': 'FI', 'europe/reykjavik': 'IS',
  'europe/warsaw': 'PL', 'europe/prague': 'CZ', 'europe/bratislava': 'SK', 'europe/budapest': 'HU',
  'europe/athens': 'GR', 'europe/bucharest': 'RO', 'europe/sofia': 'BG', 'europe/belgrade': 'RS', 'europe/zagreb': 'HR', 'europe/sarajevo': 'BA', 'europe/ljubljana': 'SI', 'europe/skopje': 'MK', 'europe/podgorica': 'ME', 'europe/tirane': 'AL', 'europe/chisinau': 'MD',
  'europe/kyiv': 'UA', 'europe/kiev': 'UA', 'europe/simferopol': 'UA', 'europe/zaporozhye': 'UA', 'europe/uzhgorod': 'UA',
  'europe/minsk': 'BY', 'europe/vilnius': 'LT', 'europe/riga': 'LV', 'europe/tallinn': 'EE',
  'europe/moscow': 'RU', 'europe/samara': 'RU', 'europe/kaliningrad': 'RU', 'europe/saratov': 'RU', 'europe/volgograd': 'RU', 'europe/astrakhan': 'RU', 'europe/ulyanovsk': 'RU', 'europe/kirov': 'RU',
  'asia/yekaterinburg': 'RU', 'asia/omsk': 'RU', 'asia/novosibirsk': 'RU', 'asia/krasnoyarsk': 'RU', 'asia/irkutsk': 'RU', 'asia/yakutsk': 'RU', 'asia/vladivostok': 'RU', 'asia/magadan': 'RU', 'asia/kamchatka': 'RU', 'asia/sakhalin': 'RU', 'asia/anadyr': 'RU', 'asia/chita': 'RU', 'asia/khandyga': 'RU', 'asia/srednekolymsk': 'RU', 'asia/ust-nera': 'RU', 'asia/barnaul': 'RU', 'asia/novokuznetsk': 'RU', 'asia/tomsk': 'RU',
  'europe/valletta': 'MT', 'europe/nicosia': 'CY', 'europe/monaco': 'MC', 'europe/andorra': 'AD', 'europe/gibraltar': 'GI',
  // Africa
  'africa/lagos': 'NG', 'africa/cairo': 'EG', 'africa/johannesburg': 'ZA', 'africa/nairobi': 'KE',
  'africa/casablanca': 'MA', 'africa/algiers': 'DZ', 'africa/tunis': 'TN', 'africa/tripoli': 'LY',
  'africa/accra': 'GH', 'africa/addis_ababa': 'ET', 'africa/dar_es_salaam': 'TZ', 'africa/kampala': 'UG', 'africa/kigali': 'RW',
  'africa/khartoum': 'SD', 'africa/juba': 'SS', 'africa/mogadishu': 'SO',
  'africa/abidjan': 'CI', 'africa/dakar': 'SN', 'africa/bamako': 'ML', 'africa/ouagadougou': 'BF', 'africa/niamey': 'NE', 'africa/conakry': 'GN', 'africa/freetown': 'SL', 'africa/monrovia': 'LR', 'africa/lome': 'TG', 'africa/porto-novo': 'BJ', 'africa/sao_tome': 'ST', 'africa/malabo': 'GQ', 'africa/libreville': 'GA', 'africa/brazzaville': 'CG', 'africa/kinshasa': 'CD', 'africa/lubumbashi': 'CD', 'africa/luanda': 'AO', 'africa/windhoek': 'NA', 'africa/gaborone': 'BW', 'africa/maputo': 'MZ', 'africa/harare': 'ZW', 'africa/lusaka': 'ZM', 'africa/blantyre': 'MW', 'africa/maseru': 'LS', 'africa/mbabane': 'SZ', 'africa/djibouti': 'DJ', 'africa/asmara': 'ER', 'africa/bissau': 'GW', 'africa/banjul': 'GM', 'africa/nouakchott': 'MR', 'africa/bujumbura': 'BI',
  // North America
  'america/new_york': 'US', 'america/detroit': 'US', 'america/chicago': 'US', 'america/denver': 'US', 'america/los_angeles': 'US', 'america/phoenix': 'US', 'america/anchorage': 'US', 'america/juneau': 'US', 'america/sitka': 'US', 'america/metlakatla': 'US', 'america/yakutat': 'US', 'america/nome': 'US', 'america/adak': 'US', 'pacific/honolulu': 'US', 'america/boise': 'US', 'america/indianapolis': 'US', 'america/indiana/indianapolis': 'US', 'america/kentucky/louisville': 'US', 'america/menominee': 'US', 'america/north_dakota/center': 'US',
  'america/toronto': 'CA', 'america/vancouver': 'CA', 'america/edmonton': 'CA', 'america/winnipeg': 'CA', 'america/halifax': 'CA', 'america/st_johns': 'CA', 'america/regina': 'CA', 'america/moncton': 'CA', 'america/whitehorse': 'CA', 'america/yellowknife': 'CA', 'america/dawson': 'CA', 'america/dawson_creek': 'CA', 'america/iqaluit': 'CA', 'america/rankin_inlet': 'CA', 'america/resolute': 'CA', 'america/cambridge_bay': 'CA',
  'america/mexico_city': 'MX', 'america/cancun': 'MX', 'america/merida': 'MX', 'america/monterrey': 'MX', 'america/matamoros': 'MX', 'america/chihuahua': 'MX', 'america/hermosillo': 'MX', 'america/tijuana': 'MX', 'america/mazatlan': 'MX', 'america/bahia_banderas': 'MX', 'america/ojinaga': 'MX',
  'america/havana': 'CU', 'america/jamaica': 'JM', 'america/port-au-prince': 'HT', 'america/santo_domingo': 'DO', 'america/puerto_rico': 'PR', 'america/nassau': 'BS', 'america/barbados': 'BB', 'america/curacao': 'CW', 'america/aruba': 'AW', 'america/martinique': 'MQ', 'america/guadeloupe': 'GP', 'america/grenada': 'GD', 'america/dominica': 'DM', 'america/st_lucia': 'LC', 'america/st_vincent': 'VC', 'america/st_kitts': 'KN', 'america/antigua': 'AG', 'america/montserrat': 'MS', 'america/st_thomas': 'VI', 'america/cayman': 'KY', 'america/tortola': 'VG', 'america/anguilla': 'AI',
  // Central / South America
  'america/guatemala': 'GT', 'america/belize': 'BZ', 'america/el_salvador': 'SV', 'america/tegucigalpa': 'HN', 'america/managua': 'NI', 'america/costa_rica': 'CR', 'america/panama': 'PA',
  'america/bogota': 'CO', 'america/caracas': 'VE', 'america/lima': 'PE', 'america/la_paz': 'BO', 'america/asuncion': 'PY', 'america/montevideo': 'UY',
  'america/sao_paulo': 'BR', 'america/manaus': 'BR', 'america/recife': 'BR', 'america/fortaleza': 'BR', 'america/bahia': 'BR', 'america/belem': 'BR', 'america/boa_vista': 'BR', 'america/campo_grande': 'BR', 'america/cuiaba': 'BR', 'america/maceio': 'BR', 'america/porto_velho': 'BR', 'america/rio_branco': 'BR', 'america/araguaina': 'BR', 'america/eirunepe': 'BR', 'america/noronha': 'BR', 'america/santarem': 'BR',
  'america/argentina/buenos_aires': 'AR', 'america/argentina/cordoba': 'AR', 'america/argentina/mendoza': 'AR', 'america/argentina/jujuy': 'AR', 'america/argentina/tucuman': 'AR', 'america/argentina/catamarca': 'AR', 'america/argentina/la_rioja': 'AR', 'america/argentina/rio_gallegos': 'AR', 'america/argentina/salta': 'AR', 'america/argentina/san_juan': 'AR', 'america/argentina/san_luis': 'AR', 'america/argentina/ushuaia': 'AR',
  'america/santiago': 'CL', 'america/punta_arenas': 'CL', 'pacific/easter': 'CL',
  'america/guayaquil': 'EC', 'pacific/galapagos': 'EC',
  'america/cayenne': 'GF', 'america/paramaribo': 'SR', 'america/guyana': 'GY',
  // Oceania
  'australia/sydney': 'AU', 'australia/melbourne': 'AU', 'australia/brisbane': 'AU', 'australia/perth': 'AU', 'australia/adelaide': 'AU', 'australia/darwin': 'AU', 'australia/hobart': 'AU', 'australia/canberra': 'AU', 'australia/broken_hill': 'AU', 'australia/lord_howe': 'AU', 'australia/lindeman': 'AU', 'australia/eucla': 'AU', 'australia/currie': 'AU',
  'pacific/auckland': 'NZ', 'pacific/chatham': 'NZ',
  'pacific/fiji': 'FJ', 'pacific/guam': 'GU', 'pacific/saipan': 'MP', 'pacific/port_moresby': 'PG', 'pacific/bougainville': 'PG', 'pacific/noumea': 'NC', 'pacific/tahiti': 'PF', 'pacific/marquesas': 'PF', 'pacific/gambier': 'PF', 'pacific/samoa': 'WS', 'pacific/pago_pago': 'AS', 'pacific/apia': 'WS', 'pacific/tongatapu': 'TO', 'pacific/kiritimati': 'KI', 'pacific/tarawa': 'KI', 'pacific/enderbury': 'KI', 'pacific/majuro': 'MH', 'pacific/kwajalein': 'MH', 'pacific/ponape': 'FM', 'pacific/truk': 'FM', 'pacific/kosrae': 'FM', 'pacific/palau': 'PW', 'pacific/nauru': 'NR', 'pacific/funafuti': 'TV', 'pacific/wallis': 'WF', 'pacific/efate': 'VU', 'pacific/guadalcanal': 'SB', 'pacific/niue': 'NU', 'pacific/rarotonga': 'CK', 'pacific/pitcairn': 'PN', 'pacific/norfolk': 'NF', 'pacific/fakaofo': 'TK',
};

function nationCodeFromTimeZone(tz: string): string | null {
  if (!tz) return null;
  const lower = tz.toLowerCase();
  // 1) Exact IANA match (covers the comprehensive table above).
  const exact = TZ_TO_COUNTRY[lower];
  if (exact) return exact;
  // 2) Defensive prefix fallbacks for any rare IANA zone we missed.
  if (lower.startsWith('australia/')) return 'AU';
  if (lower.startsWith('europe/')) return 'GB'; // best effort
  if (lower.startsWith('america/argentina/')) return 'AR';
  if (lower.startsWith('america/indiana/')) return 'US';
  if (lower.startsWith('america/kentucky/')) return 'US';
  if (lower.startsWith('america/north_dakota/')) return 'US';
  if (lower.startsWith('america/')) return 'US';
  if (lower.startsWith('africa/')) return null; // too varied — let locale decide
  if (lower.startsWith('asia/')) return null;   // too varied — let locale decide
  return null;
}

// Detect the user's region — ANY country, not a fixed list.
// Priority: TIMEZONE → explicit locale region → US. Timezone reflects PHYSICAL
// location (e.g. Asia/Kolkata in India), which is more reliable than
// navigator.language — macOS Chrome often defaults to en-US/en-GB regardless of
// where the user actually is.
export function getUserNationCode(): string {
  // 1) Timezone (most reliable — set by the OS to physical location)
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const tzCode = nationCodeFromTimeZone(tz);
    if (tzCode) return tzCode;
  } catch { /* ignore */ }

  // 2) Locale region as a secondary signal
  try {
    const langs: string[] = [
      ...(Array.isArray(navigator.languages) ? navigator.languages : []),
      navigator.language || 'en-US',
    ];
    for (const locale of langs) {
      const code = locale.split('-')[1]?.toUpperCase();
      if (code && /^[A-Z]{2}$/.test(code)) return code;
    }
  } catch { /* ignore */ }

  return 'US';
}

// Region request order (client hint): the user's region only — no auto-add of
// US/IN. The backend serves real news from whichever region we ask for.
export function getUserRegionOrder(): string[] {
  const primary = getUserNationCode();
  return /^[A-Z]{2}$/.test(primary) ? [primary] : ['US'];
}

export function getForYouNews(items: DiscoverItem[]): DiscoverItem[] {
  const userCode = getUserNationCode();
  const newsOnly = items.filter(
    (i) => (i.nation || i.category === 'For You') && i.nationCode
  );

  // "For You" = user's region headlines only. Fall back to all regions
  // only if nothing matches (so the tab is never empty).
  const mine = newsOnly.filter((i) => i.nationCode === userCode);
  return mine.length > 0 ? mine : newsOnly;
}

// -------------------------------------------------------------------
// Live news ("For You" + region-localized category tabs) — real only.
// -------------------------------------------------------------------
// Frontend cache — matches the backend's 6h L2 TTL. Since the backend's
// data is shared across all users and only rotates every 6 hours, there's
// no point making the same user hit /api/discover/news on every navigation.
// We persist the last-fetched payload + its timestamp in localStorage and
// serve it instantly on repeat visits within the TTL window.
//
// Why bother when the backend cache is also fast? Two reasons:
//   1. Network roundtrip ≈ 100-500ms on mobile / cold cellular. localStorage
//      read is < 1ms. Visible difference on tab switch / back-navigation.
//   2. Lets the page render BEFORE the network call returns, so Discover
//      is never a blank "loading…" screen for returning users.
const FRONTEND_NEWS_CACHE_KEY = 'syntraiq-live-news-cache-v5';
const FRONTEND_NEWS_TTL_MS = 6 * 60 * 60 * 1000; // 6h — matches NEWS_L2_TTL_SEC

if (typeof localStorage !== 'undefined') {
  // Drop older cache keys from past deploys so users never see stale data
  // after a shape change. v5 = post-og-image-enrichment + category gradient
  // fallbacks + per-cat dedup top-up.
  for (const oldKey of [
    'syntraiq-live-news-cache-v1',
    'syntraiq-live-news-cache-v2',
    'syntraiq-live-news-cache-v3',
    'syntraiq-live-news-cache-v4',
  ]) {
    try { localStorage.removeItem(oldKey); } catch { /* ignore */ }
  }
}

interface FrontendNewsCache {
  ts: number;
  items: DiscoverItem[];
  regions: string;
}

function readFrontendCache(regions: string): DiscoverItem[] | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(FRONTEND_NEWS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FrontendNewsCache;
    if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) return null;
    // Region must match — a user travelling to a different country sees
    // a region-mismatched cache and forces a re-fetch instead of seeing
    // someone else's geography.
    if (parsed.regions !== regions) return null;
    if (Date.now() - parsed.ts > FRONTEND_NEWS_TTL_MS) return null;
    return parsed.items;
  } catch {
    return null;
  }
}

function writeFrontendCache(regions: string, items: DiscoverItem[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const payload: FrontendNewsCache = { ts: Date.now(), regions, items };
    localStorage.setItem(FRONTEND_NEWS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Quota exceeded or storage disabled — silent fallback to network-only.
  }
}

export async function fetchLiveNewsItems(forceRefresh = false): Promise<DiscoverItem[]> {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (!baseUrl) {
    console.error('[discover/news] VITE_API_URL not set — no news available.');
    return [];
  }
  const order = getUserRegionOrder().join(',');

  // Serve from the frontend cache if present and within TTL — repeat visits
  // / tab switches feel instant. forceRefresh bypasses it (kept for future
  // pull-to-refresh, even though the visible button was removed).
  if (!forceRefresh) {
    const cached = readFrontendCache(order);
    if (cached) {
      console.log(`[discover/news] ⚡ served ${cached.length} items from localStorage (TTL 6h)`);
      return cached;
    }
  }

  try {
    const refreshParam = forceRefresh ? '&refresh=1' : '';
    const url = `${baseUrl.replace(/\/+$/, '')}/api/discover/news?country=${encodeURIComponent(order)}${refreshParam}`;
    const res = await fetch(url, forceRefresh ? { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } } : undefined);
    if (!res.ok) {
      console.error(`[discover/news] backend ${res.status}. URL=${url}`);
      return [];
    }
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) {
      console.error('[discover/news] backend returned empty.');
      return [];
    }
    console.log(`[discover/news] ✅ loaded ${items.length} real items from backend (regions=${order}, refresh=${forceRefresh})`);
    writeFrontendCache(order, items);
    return items;
  } catch (err) {
    console.error('[discover/news] fetch failed:', err);
    return [];
  }
}


export const getAllDiscoverItems = async (forceRefresh = false): Promise<DiscoverItem[]> => {
  // Real region-localized news only — backend categorizes them so they appear
  // in their respective category tabs (Tech, Finance, Health, Science, etc.).
  return await fetchLiveNewsItems(forceRefresh);
};

export const getDiscoverItemById = async (id: string): Promise<DiscoverItem | null> => {
  const all = await getAllDiscoverItems();
  return all.find(item => item.id === id) || null;
};
