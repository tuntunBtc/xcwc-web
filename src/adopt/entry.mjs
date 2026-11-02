// Transport validation only; server-side dictionaries and existence checks remain authoritative.
export function parseAdoptionEntry(search) {
  const params = new URLSearchParams(search);
  const values = [...params.getAll('birdCode'), ...params.getAll('bird')];
  if (!values.length) return {code: null, error: 'MISSING_BIRD_CODE', lookupSupported: false};
  if (values.length !== 1 || !/^[A-Za-z0-9_-]{1,160}$/.test(values[0])) {
    return {code: null, error: 'INVALID_BIRD_CODE', lookupSupported: false};
  }
  return {code: values[0], error: null, lookupSupported: /^[a-f0-9]{32}$/.test(values[0]) || isManufacturingCode(values[0])};
}

export function isManufacturingCode(code) {
  if (typeof code !== 'string' || code.length > 32 || !/^[A-Z]{2}-[A-Z][A-Z0-9]{1,7}-[1-9][0-9]{0,18}$/.test(code)) return false;
  const id = code.slice(code.lastIndexOf('-') + 1);
  return id.length < 19 || id <= '9223372036854775807';
}

export function adoptionLookupPath(code) {
  if (/^[a-f0-9]{32}$/.test(code || '')) return '/birds/' + code;
  if (isManufacturingCode(code)) return '/birds/by-code/' + encodeURIComponent(code);
  throw Object.assign(Error('小鸟编码格式不正确'), {code:'INVALID_BIRD_CODE'});
}

export function matchesAdoptionBird(code, bird) {
 if (!bird || !/^[a-f0-9]{32}$/.test(bird.id || '') || bird.active === false) return false;
 return /^[a-f0-9]{32}$/.test(code || '') ? bird.id === code : isManufacturingCode(code) && bird.birdCode === code;
}
