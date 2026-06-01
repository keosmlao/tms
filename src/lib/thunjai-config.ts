export const THUNJAI_KEYS = [
  "thunjai.enabled",
  "thunjai.environment",
  "thunjai.base_url",
  "thunjai.user",
  "thunjai.pwd",
  "thunjai.secret_key",
  "thunjai.locale",
] as const;

export interface ThunJaiSettings {
  "thunjai.enabled": string;
  "thunjai.environment": string;
  "thunjai.base_url": string;
  "thunjai.user": string;
  "thunjai.pwd": string;
  "thunjai.secret_key": string;
  "thunjai.locale": string;
}

export const THUNJAI_DEFAULTS: ThunJaiSettings = {
  "thunjai.enabled": "0",
  "thunjai.environment": "staging",
  "thunjai.base_url": "https://stg-apis.thunjaiexpress.com",
  "thunjai.user": "",
  "thunjai.pwd": "",
  "thunjai.secret_key": "",
  "thunjai.locale": "la",
};
