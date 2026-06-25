export interface UserLocalContextPayload {
  locale: string;
  timeZone: string;
  localDateTime: string;
  countryCode?: string;
  currencyCode?: string;
  utcOffsetMinutes: number;
}

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  IN: "INR",
  US: "USD",
  GB: "GBP",
  EU: "EUR",
  DE: "EUR",
  FR: "EUR",
  ES: "EUR",
  IT: "EUR",
  NL: "EUR",
  IE: "EUR",
  PT: "EUR",
  JP: "JPY",
  CN: "CNY",
  KR: "KRW",
  CA: "CAD",
  AU: "AUD",
  NZ: "NZD",
  SG: "SGD",
  AE: "AED",
  SA: "SAR",
  QA: "QAR",
  KW: "KWD",
  OM: "OMR",
  BH: "BHD",
  CH: "CHF",
  SE: "SEK",
  NO: "NOK",
  DK: "DKK",
  BR: "BRL",
  MX: "MXN",
  ID: "IDR",
  TH: "THB",
  PH: "PHP",
  MY: "MYR",
  VN: "VND",
  PK: "PKR",
  BD: "BDT",
  LK: "LKR",
  ZA: "ZAR",
  NG: "NGN",
  KE: "KES",
  EG: "EGP",
  TR: "TRY",
  RU: "RUB",
  IL: "ILS",
};

function extractCountryCode(locale: string): string | undefined {
  const regionPart = locale.split("-")[1]?.toUpperCase();
  if (!regionPart) return undefined;
  return regionPart.length === 2 ? regionPart : undefined;
}

// Timezone → country map. The browser's `navigator.language` is unreliable
// for actual location (macOS Chrome often reports "en-US" regardless of
// where the device physically is). The timezone resolved by Intl reflects
// the OS-configured time zone, which almost always matches the user's
// real country. We use this as the PRIMARY signal and fall back to the
// locale-derived code only if no mapping is found.
const COUNTRY_BY_TIMEZONE: Record<string, string> = {
  "Asia/Kolkata": "IN",
  "Asia/Calcutta": "IN",
  "Asia/Delhi": "IN",
  "Asia/Karachi": "PK",
  "Asia/Dhaka": "BD",
  "Asia/Colombo": "LK",
  "Asia/Kathmandu": "NP",
  "Asia/Dubai": "AE",
  "Asia/Riyadh": "SA",
  "Asia/Qatar": "QA",
  "Asia/Kuwait": "KW",
  "Asia/Bahrain": "BH",
  "Asia/Muscat": "OM",
  "Asia/Tehran": "IR",
  "Asia/Jerusalem": "IL",
  "Asia/Istanbul": "TR",
  "Asia/Singapore": "SG",
  "Asia/Hong_Kong": "HK",
  "Asia/Shanghai": "CN",
  "Asia/Tokyo": "JP",
  "Asia/Seoul": "KR",
  "Asia/Bangkok": "TH",
  "Asia/Manila": "PH",
  "Asia/Jakarta": "ID",
  "Asia/Kuala_Lumpur": "MY",
  "Asia/Ho_Chi_Minh": "VN",
  "Asia/Saigon": "VN",
  "Europe/London": "GB",
  "Europe/Dublin": "IE",
  "Europe/Berlin": "DE",
  "Europe/Paris": "FR",
  "Europe/Madrid": "ES",
  "Europe/Rome": "IT",
  "Europe/Amsterdam": "NL",
  "Europe/Lisbon": "PT",
  "Europe/Stockholm": "SE",
  "Europe/Oslo": "NO",
  "Europe/Copenhagen": "DK",
  "Europe/Zurich": "CH",
  "Europe/Moscow": "RU",
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Los_Angeles": "US",
  "America/Phoenix": "US",
  "America/Anchorage": "US",
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
  "America/Mexico_City": "MX",
  "America/Sao_Paulo": "BR",
  "Africa/Cairo": "EG",
  "Africa/Lagos": "NG",
  "Africa/Nairobi": "KE",
  "Africa/Johannesburg": "ZA",
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Pacific/Auckland": "NZ",
};

function countryFromTimezone(tz: string): string | undefined {
  if (COUNTRY_BY_TIMEZONE[tz]) return COUNTRY_BY_TIMEZONE[tz];
  // Heuristic fallback for unmapped Asia/* zones — many Indian users hit
  // less-common aliases; if the zone starts with "Asia/Kolkata"-class
  // prefixes, assume IN.
  if (/^Asia\/(Calcutta|Kolkata)/i.test(tz)) return "IN";
  return undefined;
}

export function getUserLocalContext(): UserLocalContextPayload {
  const locale = navigator.language || "en-US";
  const resolved = Intl.DateTimeFormat().resolvedOptions();
  const timeZone = resolved.timeZone || "UTC";
  // Prefer timezone-derived country (reflects real device location) over
  // locale-derived (which is just the UI language and is wrong for many
  // users — e.g. Indian users with English-US UI).
  const countryCode =
    countryFromTimezone(timeZone) || extractCountryCode(locale);
  const now = new Date();

  let localDateTime = now.toString();
  try {
    localDateTime = now.toLocaleString(locale, {
      dateStyle: "full",
      timeStyle: "long",
      timeZone,
    });
  } catch {
    // Fallback keeps app stable on older engines.
    localDateTime = now.toString();
  }

  return {
    locale,
    timeZone,
    localDateTime,
    countryCode,
    currencyCode: countryCode ? CURRENCY_BY_COUNTRY[countryCode] : undefined,
    utcOffsetMinutes: -now.getTimezoneOffset(),
  };
}
