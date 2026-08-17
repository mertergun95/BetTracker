import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { en, type TranslationKey, type Translations } from './en';
import { tr } from './tr';
import type { Language } from '@/core/types';

const DICTIONARIES: Record<Language, Translations> = { en, tr };

/** BCP-47 tags used for Intl formatting. */
const LOCALES: Record<Language, string> = { en: 'en-GB', tr: 'tr-TR' };

export type TranslateParams = Record<string, string | number>;

export interface I18n {
  language: Language;
  locale: string;
  t: (key: TranslationKey, params?: TranslateParams) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatMoney: (value: number, currency: string, options?: { sign?: boolean; compact?: boolean }) => string;
  formatPercent: (value: number, digits?: number) => string;
  formatDate: (value: number, style?: 'short' | 'long' | 'dateTime') => string;
}

const I18nContext = createContext<I18n | null>(null);

/** Replaces {name} placeholders in a translated string. */
function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

export function I18nProvider({
  language,
  children,
}: {
  language: Language;
  children: ReactNode;
}) {
  const locale = LOCALES[language] ?? 'en-GB';

  const t = useCallback(
    (key: TranslationKey, params?: TranslateParams): string => {
      // Fall back to English, then to the key itself, so a missing string is
      // visible in development rather than rendering as a blank.
      const template = DICTIONARIES[language]?.[key] ?? en[key] ?? key;
      return interpolate(template, params);
    },
    [language],
  );

  const value = useMemo<I18n>(() => {
    const formatNumber = (v: number, options?: Intl.NumberFormatOptions) =>
      Number.isFinite(v) ? new Intl.NumberFormat(locale, options).format(v) : '—';

    return {
      language,
      locale,
      t,
      formatNumber,

      formatMoney: (v, currency, options) => {
        if (!Number.isFinite(v)) return '—';
        const sign = options?.sign && v > 0 ? '+' : '';
        // Crypto codes are not ISO-4217, so Intl rejects them as a currency;
        // fall back to a plain number with the code appended.
        const isIso = /^[A-Z]{3}$/.test(currency) && !['USDT', 'BTC'].includes(currency);
        const formatted = isIso
          ? formatNumber(v, {
              style: 'currency',
              currency,
              maximumFractionDigits: options?.compact ? 0 : 2,
              notation: options?.compact ? 'compact' : 'standard',
            })
          : `${formatNumber(v, {
              maximumFractionDigits: options?.compact ? 0 : 2,
              notation: options?.compact ? 'compact' : 'standard',
            })} ${currency}`;
        return sign + formatted;
      },

      formatPercent: (v, digits = 1) =>
        Number.isFinite(v)
          ? new Intl.NumberFormat(locale, {
              style: 'percent',
              minimumFractionDigits: digits,
              maximumFractionDigits: digits,
            }).format(v)
          : '—',

      formatDate: (v, style = 'short') => {
        if (!Number.isFinite(v)) return '—';
        const date = new Date(v);
        if (style === 'long') {
          return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(date);
        }
        if (style === 'dateTime') {
          return new Intl.DateTimeFormat(locale, {
            dateStyle: 'short',
            timeStyle: 'short',
          }).format(date);
        }
        return new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(date);
      },
    };
  }, [language, locale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

export type { TranslationKey };
