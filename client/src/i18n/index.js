import { useState, useEffect } from 'react';
import enGB from './en-GB.json';
import jaJP from './ja-JP.json';

const locales = {
    'en-GB': enGB,
    'ja-JP': jaJP,
};

const SUPPORTED_LOCALES = Object.keys(locales);
const DEFAULT_LOCALE = 'en-GB';
const STORAGE_KEY = 'glimpse-pchat-locale';

function detectLocale() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LOCALES.includes(stored)) return stored;

    const browserLang = navigator.language || '';
    if (SUPPORTED_LOCALES.includes(browserLang)) return browserLang;
    const prefix = browserLang.split('-')[0];
    const match = SUPPORTED_LOCALES.find((l) => l.startsWith(prefix));
    return match || DEFAULT_LOCALE;
}

let currentLocale = detectLocale();
let currentStrings = locales[currentLocale] || locales[DEFAULT_LOCALE];

export function getLocale() {
    return currentLocale;
}

export function getSupportedLocales() {
    return [...SUPPORTED_LOCALES];
}

export function setLocale(locale) {
    if (!SUPPORTED_LOCALES.includes(locale)) return;
    currentLocale = locale;
    currentStrings = locales[locale];
    localStorage.setItem(STORAGE_KEY, locale);
    window.dispatchEvent(new CustomEvent('locale-change', { detail: locale }));
}

export function t(key, params) {
    let str = currentStrings[key] || locales[DEFAULT_LOCALE][key] || key;
    if (params) {
        Object.entries(params).forEach(([k, v]) => {
            str = str.replace(`{${k}}`, v);
        });
    }
    return str;
}

export function formatDate(date, options) {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat(currentLocale, options).format(d);
}

export function formatRelativeTime(date) {
    const d = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);

    if (diffMin < 1) return t('time.justNow');
    if (diffMin < 60) return t('time.minutesAgo', { count: diffMin });
    if (diffHr < 24) return t('time.hoursAgo', { count: diffHr });

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return t('time.yesterday');

    return formatDate(d, { month: 'short', day: 'numeric' });
}

export function useI18n() {
    const [, setTick] = useState(0);

    useEffect(() => {
        const handler = () => setTick((prev) => prev + 1);
        window.addEventListener('locale-change', handler);
        return () => window.removeEventListener('locale-change', handler);
    }, []);

    return { t, formatDate, formatRelativeTime, locale: currentLocale, setLocale, getSupportedLocales };
}
