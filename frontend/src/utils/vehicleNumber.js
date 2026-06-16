/** Standard: TN 74 AE 2003 — 2 letters, 2 digits, 2 letters, 4 digits */
const STANDARD_REGEX = /^[A-Z]{2}\d{2}[A-Z]{2}\d{4}$/;
/** New: TN 74 A 2003 — 2 letters, 2 digits, 1 letter, 4 digits */
const NEW_REGEX = /^[A-Z]{2}\d{2}[A-Z]{1}\d{4}$/;
/** Short: TMR 7177 — 3 letters, 4 digits */
const SHORT_REGEX = /^[A-Z]{3}\d{4}$/;
/** No Series: TN 74 2003 — 2 letters, 6 digits */
const NO_SERIES_REGEX = /^[A-Z]{2}\d{6}$/;

const compact = (value) => String(value || '').toUpperCase().replace(/\s/g, '');

export const isValidVehicleNumber = (value) => {
  if (!value || !String(value).trim()) return true;
  const c = compact(value);
  return STANDARD_REGEX.test(c) || NEW_REGEX.test(c) || SHORT_REGEX.test(c) || NO_SERIES_REGEX.test(c);
};

export const formatVehicleInput = (value) => {
  const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!raw) return '';

  const useStandardFormat = raw.length >= 3 && /\d/.test(raw[2]);

  if (!useStandardFormat) {
    const letters = raw.slice(0, 3).replace(/[^A-Z]/g, '');
    const digits = raw.slice(3).replace(/[^0-9]/g, '').slice(0, 4);

    if (/^[A-Z]{3}$/.test(letters)) {
      return digits ? `${letters} ${digits}` : letters;
    }

    return letters.slice(0, 3);
  }

  const state = raw.slice(0, 2).replace(/[^A-Z]/g, '');
  const district = raw.slice(2, 4).replace(/[^0-9]/g, '');
  const rest = raw.slice(4);
  const series = rest.replace(/[^A-Z]/g, '').slice(0, 2);
  const number = rest.replace(/[^0-9]/g, '').slice(0, 4);

  let formatted = state;
  if (district.length) formatted += ` ${district}`;
  if (series.length) formatted += ` ${series}`;
  if (number.length) formatted += ` ${number}`;
  return formatted.trim();
};

export const normalizeVehicleNumber = (value) => formatVehicleInput(value || '');

export const validateVehicleNumber = (value) => {
  if (!value || !String(value).trim()) return null;
  if (!isValidVehicleNumber(value)) {
    return 'Vehicle number must be in a format like TN 74 2003, TN 74 A 2003, TN 74 AE 2003, or TMR 7177';
  }
  return null;
};
