const VERSION_REGEX = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/;

export const parseVersion = (value) => {
  const clean = String(value || '').trim();
  const match = clean.match(VERSION_REGEX);
  if (!match) return null;
  return {
    major: Number(match[1] || 0),
    minor: Number(match[2] || 0),
    patch: Number(match[3] || 0),
    prerelease: match[4] ? match[4].split('.') : []
  };
};

const comparePrerelease = (left = [], right = []) => {
  if (!left.length && !right.length) return 0;
  if (!left.length) return 1;
  if (!right.length) return -1;

  const max = Math.max(left.length, right.length);
  for (let index = 0; index < max; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;

    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) return Number(a) > Number(b) ? 1 : -1;
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a.localeCompare(b) > 0 ? 1 : -1;
  }
  return 0;
};

export const compareVersions = (left, right) => {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return null;

  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1;
  }
  return comparePrerelease(a.prerelease, b.prerelease);
};

export const isVersionGreater = (candidate, installed) => compareVersions(candidate, installed) === 1;
export const isVersionLower = (candidate, reference) => compareVersions(candidate, reference) === -1;
export const isValidVersion = (value) => Boolean(parseVersion(value));
