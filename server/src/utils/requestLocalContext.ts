import type { Request } from 'express';
import type { UserLocalContext } from '../types.js';

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  IN: 'INR',
  US: 'USD',
  GB: 'GBP',
  CA: 'CAD',
  AU: 'AUD',
  NZ: 'NZD',
  SG: 'SGD',
  AE: 'AED',
  SA: 'SAR',
  QA: 'QAR',
  KW: 'KWD',
  OM: 'OMR',
  BH: 'BHD',
  CH: 'CHF',
  SE: 'SEK',
  NO: 'NOK',
  DK: 'DKK',
  JP: 'JPY',
  CN: 'CNY',
  KR: 'KRW',
  BR: 'BRL',
  MX: 'MXN',
  ID: 'IDR',
  TH: 'THB',
  PH: 'PHP',
  MY: 'MYR',
  VN: 'VND',
  PK: 'PKR',
  BD: 'BDT',
  LK: 'LKR',
  ZA: 'ZAR',
  NG: 'NGN',
  KE: 'KES',
  EG: 'EGP',
  TR: 'TRY',
  RU: 'RUB',
  IL: 'ILS',
  DE: 'EUR',
  FR: 'EUR',
  ES: 'EUR',
  IT: 'EUR',
  NL: 'EUR',
  IE: 'EUR',
  PT: 'EUR',
};

const TIMEZONE_BY_COUNTRY: Record<string, string> = {
  IN: 'Asia/Kolkata',
  US: 'America/New_York',
  GB: 'Europe/London',
  DE: 'Europe/Berlin',
  FR: 'Europe/Paris',
  ES: 'Europe/Madrid',
  IT: 'Europe/Rome',
  NL: 'Europe/Amsterdam',
  IE: 'Europe/Dublin',
  PT: 'Europe/Lisbon',
  JP: 'Asia/Tokyo',
  CN: 'Asia/Shanghai',
  KR: 'Asia/Seoul',
  SG: 'Asia/Singapore',
  AE: 'Asia/Dubai',
  AU: 'Australia/Sydney',
  CA: 'America/Toronto',
};

function readHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  if (typeof value === 'string') return value;
  return undefined;
}

function parseCountryCode(req: Request): string | undefined {
  const candidates = [
    readHeader(req, 'cf-ipcountry'),
    readHeader(req, 'x-vercel-ip-country'),
    readHeader(req, 'x-country-code'),
    readHeader(req, 'cloudfront-viewer-country'),
  ]
    .map((v) => v?.trim().toUpperCase())
    .filter(Boolean) as string[];

  for (const c of candidates) {
    if (/^[A-Z]{2}$/.test(c)) return c;
  }

  const lang = readHeader(req, 'accept-language');
  if (lang) {
    const first = lang.split(',')[0]?.trim();
    const region = first?.split('-')[1]?.toUpperCase();
    if (region && /^[A-Z]{2}$/.test(region)) return region;
  }
  return undefined;
}

function parseLocale(req: Request): string | undefined {
  const lang = readHeader(req, 'accept-language');
  return lang?.split(',')[0]?.trim();
}

function getNowString(locale: string, timeZone: string): string {
  try {
    return new Date().toLocaleString(locale, {
      dateStyle: 'full',
      timeStyle: 'long',
      timeZone,
    });
  } catch {
    return new Date().toString();
  }
}

export function buildUserLocalContext(req: Request, clientContext?: UserLocalContext): UserLocalContext {
  const serverCountry = parseCountryCode(req);
  const serverLocale = parseLocale(req);
  const serverCity =
    readHeader(req, 'x-vercel-ip-city') ||
    readHeader(req, 'cf-ipcity') ||
    readHeader(req, 'x-appengine-city');
  const serverRegion =
    readHeader(req, 'x-vercel-ip-country-region') ||
    readHeader(req, 'cf-region') ||
    readHeader(req, 'x-appengine-region');

  const countryCode = clientContext?.countryCode || serverCountry;
  const locale = clientContext?.locale || serverLocale || 'en-US';
  const timeZone =
    clientContext?.timeZone ||
    (countryCode ? TIMEZONE_BY_COUNTRY[countryCode] : undefined) ||
    'Asia/Kolkata';
  const currencyCode =
    clientContext?.currencyCode ||
    (countryCode ? CURRENCY_BY_COUNTRY[countryCode] : undefined) ||
    'INR';

  const utcOffsetMinutes =
    typeof clientContext?.utcOffsetMinutes === 'number'
      ? clientContext.utcOffsetMinutes
      : undefined;

  return {
    locale,
    timeZone,
    localDateTime: clientContext?.localDateTime || getNowString(locale, timeZone),
    countryCode,
    currencyCode,
    utcOffsetMinutes,
    city: clientContext?.city || serverCity,
    region: clientContext?.region || serverRegion,
    source: clientContext ? 'merged' : 'server-headers',
  };
}
