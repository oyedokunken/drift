const REDACTED = '[REDACTED]';

/**
 * Remove the TfL key from any text. TfL takes the key as an `app_key` query string
 * parameter, so it can appear in URLs inside error messages and logs. Both the
 * parameter value and any literal occurrence of the key are replaced.
 */
export function redact(text: string, key: string): string {
  const withoutParam = text.replace(/(app_key=)[^&\s"'<>]*/gi, `$1${REDACTED}`);
  return key === '' ? withoutParam : withoutParam.split(key).join(REDACTED);
}

/** The request URL with the key replaced, safe to log. */
export function safeUrl(url: URL, key: string): string {
  return redact(url.toString(), key);
}
