// Ten desks: seat 0 is the lead (총괄) desk, seats 1-9 the other employees. No built-in character.
export const OFFICE_CAPACITY = 10;
export const MANAGER_ID = 'manager';
export const MANAGER_APPEARANCE_SEED = 0x42524e44;
export const DEFAULT_ENVIRONMENT = Object.freeze({ lighting: 'bright', weather: 'clear', rainSound: true });
const lightingValues = new Set(['bright', 'normal', 'night']);
const weatherValues = new Set(['clear', 'rain', 'snow']);
const copy = value => JSON.parse(JSON.stringify(value));
const controls = /[\u0000-\u001f\u007f]/u;
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\s\u0000-\u001f\u007f]/u.test(value);
const validSeed = value => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;

function fail(message) { throw new Error(message); }

/** Normalize a public Telegram username/link, without asserting its ownership or type. */
export function normalizeTelegramBot(input) {
  if (typeof input !== 'string' || input.length > 200) {
    fail('텔레그램 봇 아이디 또는 링크를 확인해 주세요.');
  }
  let username = input.trim();
  if (controls.test(username)) fail('텔레그램 봇 아이디 또는 링크를 확인해 주세요.');
  if (username.startsWith('@')) username = username.slice(1);
  else if (/^(?:https:\/\/)?t\.me\//i.test(username)) {
    if (!/^(?:https:\/\/)?t\.me\/[A-Za-z][A-Za-z0-9_]{4,31}$/i.test(username)) {
      fail('텔레그램 봇 아이디 또는 링크를 확인해 주세요.');
    }
    let url;
    try { url = new URL(/^https:\/\//i.test(username) ? username : `https://${username}`); }
    catch { fail('텔레그램 봇 아이디 또는 링크를 확인해 주세요.'); }
    // Reject even empty ?/# suffixes, explicit ports and URL normalization tricks.
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 't.me' || url.username || url.password ||
        url.port || /[?#%\\]/u.test(username) || !/^https:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]{4,31}$/i.test(url.href)) {
      fail('텔레그램 봇 아이디 또는 링크를 확인해 주세요.');
    }
    username = url.pathname.slice(1);
  }
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)) {
    fail('@로 시작하는 영문 아이디나 t.me 링크를 붙여넣어 주세요.');
  }
  return `https://t.me/${username.toLowerCase()}`;
}

function nameValue(value) {
  if (typeof value !== 'string' || controls.test(value) || !value.trim() || value.trim().length > 200) {
    fail('직원 이름을 200자 이내로 입력해 주세요.');
  }
  return value.trim();
}

function dutiesValue(value) {
  if (typeof value !== 'string' || value.trim().length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    fail('주요 업무는 500자 이내로 입력해 주세요.');
  }
  return value.trim();
}

function environmentValue(value, current = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => key !== 'lighting' && key !== 'weather' && key !== 'rainSound')) {
    fail('사무실 조명과 날씨를 확인해 주세요.');
  }
  const lighting = Object.hasOwn(value, 'lighting') ? value.lighting : current?.lighting;
  const weather = Object.hasOwn(value, 'weather') ? value.weather : current?.weather;
  const rainSound = Object.hasOwn(value, 'rainSound') ? value.rainSound : current?.rainSound ?? DEFAULT_ENVIRONMENT.rainSound;
  if (!lightingValues.has(lighting) || !weatherValues.has(weather)) {
    fail('사무실 조명과 날씨를 확인해 주세요.');
  }
  if (typeof rainSound !== 'boolean') fail('비 소리 설정을 확인해 주세요.');
  return { lighting, weather, rainSound };
}

function makeDefaultId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `employee-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function makeDefaultSeed() {
  if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  return Math.floor(Math.random() * 0x100000000);
}

export class BotOfficeModel {
  constructor({ makeId = makeDefaultId, makeSeed = makeDefaultSeed } = {}) {
    this._makeId = makeId;
    this._makeSeed = makeSeed;
    this._document = { schemaVersion: 1, environment: { ...DEFAULT_ENVIRONMENT }, profiles: [] };
  }

  getDocument() { return copy(this._document); }

  restore(document) {
    if (document?.schemaVersion !== 1 || !Array.isArray(document.profiles)) fail('저장된 직원 정보를 읽을 수 없습니다.');
    // Documents saved before the lead desk opened carry a fixed placeholder at seat 0; it is dropped on read.
    const stored = document.profiles.filter(profile => !(profile && profile.employeeId === MANAGER_ID &&
      profile.seatIndex === 0 && profile.appearanceSeed === MANAGER_APPEARANCE_SEED && profile.telegramUrl === null));
    if (stored.length > OFFICE_CAPACITY) fail('저장된 직원 정보를 읽을 수 없습니다.');
    const environment = Object.hasOwn(document, 'environment')
      ? environmentValue(document.environment) : { ...DEFAULT_ENVIRONMENT };
    const ids = new Set(), seats = new Set(), urls = new Set();
    const profiles = stored.map(profile => {
      if (!profile || !validId(profile.employeeId) || !validSeed(profile.appearanceSeed) ||
          !Number.isInteger(profile.seatIndex) || profile.seatIndex < 0 || profile.seatIndex >= OFFICE_CAPACITY ||
          ids.has(profile.employeeId) || seats.has(profile.seatIndex)) fail('저장된 직원 정보를 읽을 수 없습니다.');
      if (profile.employeeId === MANAGER_ID || profile.telegramUrl === null) fail('저장된 텔레그램 주소를 확인해 주세요.');
      const telegramUrl = normalizeTelegramBot(profile.telegramUrl);
      if (telegramUrl !== profile.telegramUrl) fail('저장된 텔레그램 주소를 확인해 주세요.');
      if (urls.has(telegramUrl)) fail('같은 텔레그램 봇이 중복 등록되어 있습니다.');
      urls.add(telegramUrl);
      const name = nameValue(profile.name), duties = dutiesValue(profile.duties);
      if (name !== profile.name || duties !== profile.duties) fail('저장된 직원 정보를 읽을 수 없습니다.');
      ids.add(profile.employeeId); seats.add(profile.seatIndex);
      return { employeeId: profile.employeeId, name, telegramUrl, duties,
        appearanceSeed: profile.appearanceSeed, seatIndex: profile.seatIndex };
    });
    profiles.sort((a, b) => a.seatIndex - b.seatIndex);
    this._document = { schemaVersion: 1, environment, profiles };
    return this.getDocument();
  }

  saveEmployee(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('직원 정보를 확인해 주세요.');
    const profiles = this.getDocument().profiles;
    let existing;
    if (Object.hasOwn(input, 'employeeId')) {
      if (!validId(input.employeeId)) fail('수정할 직원을 확인해 주세요.');
      existing = profiles.find(profile => profile.employeeId === input.employeeId);
      if (!existing) fail('수정할 직원을 찾지 못했습니다.');
    }
    const name = nameValue(Object.hasOwn(input, 'name') ? input.name : existing?.name);
    const duties = dutiesValue(Object.hasOwn(input, 'duties') ? input.duties : existing?.duties ?? '');
    const telegramInput = Object.hasOwn(input, 'telegramInput') ? input.telegramInput : existing?.telegramUrl;
    const telegramUrl = normalizeTelegramBot(telegramInput);
    if (telegramUrl && profiles.some(profile => profile.employeeId !== existing?.employeeId && profile.telegramUrl === telegramUrl)) {
      fail('이미 사무실에 등록된 텔레그램 봇입니다.');
    }
    if (existing) {
      Object.assign(existing, { name, telegramUrl, duties });
    } else {
      if (profiles.length >= OFFICE_CAPACITY) fail('사무실 10자리가 모두 채워졌습니다.');
      const employeeId = this._makeId(), appearanceSeed = this._makeSeed();
      if (!validId(employeeId) || profiles.some(profile => profile.employeeId === employeeId) || !validSeed(appearanceSeed)) {
        fail('직원을 준비하지 못했습니다. 다시 시도해 주세요.');
      }
      const used = new Set(profiles.map(profile => profile.seatIndex));
      const seatIndex = [...Array.from({ length: OFFICE_CAPACITY - 1 }, (_, i) => i + 1), 0].find(index => !used.has(index));
      profiles.push({ employeeId, name, telegramUrl, duties, appearanceSeed, seatIndex });
    }
    profiles.sort((a, b) => a.seatIndex - b.seatIndex);
    this._document = { schemaVersion: 1, environment: { ...this._document.environment }, profiles };
    return this.getDocument();
  }

  saveEnvironment(input) {
    const environment = environmentValue(input, this._document.environment);
    this._document = { ...this._document, environment };
    return this.getDocument();
  }
}
