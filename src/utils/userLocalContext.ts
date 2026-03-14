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

export function getUserLocalContext(): UserLocalContextPayload {
  const locale = navigator.language || "en-US";
  const resolved = Intl.DateTimeFormat().resolvedOptions();
  const timeZone = resolved.timeZone || "UTC";
  const countryCode = extractCountryCode(locale);
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
