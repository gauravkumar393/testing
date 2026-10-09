// Thin client for the real Stayflexi Channel Manager API.
// Docs: web service URL is https://stayflexi.com/apiv1/cmservice/<API>/?pmsId=<pmsId>
// but the working endpoints we were given credentials for are under
// https://api.stayflexi.com/core/apiv1/cmservice/... — that's the base used here.

const BASE_URL = "https://api.stayflexi.com/core/apiv1/cmservice";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Stayflexi's GET endpoints want dates as dd-MM-yyyy.
function toStayflexiDate(isoDate) {
  const [y, m, d] = isoDate.split("-");
  return `${d}-${m}-${y}`;
}

// ISO (yyyy-mm-dd) date strings for each *night* of the stay: [checkinISO, checkoutISO).
// Parsed and incremented entirely in UTC — dates are calendar dates, not
// instants, so we never want the server's local timezone involved. Without
// the explicit "Z"/UTC handling, a server running east of UTC (e.g. IST)
// would parse "2026-09-16T00:00:00" as local midnight, which converts to
// the previous day in UTC — silently shifting every lookup by a day, which
// is exactly what was causing every live rate/availability call to miss.
function nightsInRange(checkinISO, checkoutISO) {
  const nights = [];
  const d = new Date(checkinISO + "T00:00:00Z");
  const end = new Date(checkoutISO + "T00:00:00Z");
  while (d < end) {
    nights.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return nights;
}

// --- request pacing --------------------------------------------------------
//
// Stayflexi rate-limits this API (HTTP 429 if requests land too close
// together). The old approach was for the CALLER to `await` each request
// fully, then `sleep(350ms)`, before starting the next — so every single
// call cost (network latency + 350ms), one at a time. For a room search
// that needs 20+ calls (one per room, plus one per rate plan per room),
// that added up to 15-20+ seconds.
//
// Instead, pacing lives here, centrally: we guarantee requests are
// DISPATCHED no less than REQUEST_GAP_MS apart, but we don't wait for a
// request to finish before scheduling the next one's dispatch. That lets
// several requests be in flight at once, overlapping their network time
// with each other instead of paying the gap serially — while still never
// sending two requests to Stayflexi back-to-back. Callers (server.js) can
// now just `Promise.all(...)` a batch of calls and let this handle the
// spacing, instead of manually sequencing + sleeping themselves.
const REQUEST_GAP_MS = 350;
let lastDispatchAt = 0;
let dispatchQueue = Promise.resolve();

function scheduleDispatch() {
  const turn = dispatchQueue.then(async () => {
    const wait = Math.max(0, lastDispatchAt + REQUEST_GAP_MS - Date.now());
    if (wait > 0) await sleep(wait);
    lastDispatchAt = Date.now();
  });
  dispatchQueue = turn;
  return turn;
}

// --- short-lived response cache --------------------------------------------
//
// getroomrates/getroomcount are called per room (and per rate plan) on
// every search. If a guest re-searches the same dates shortly after (going
// back and forth, or the single-plan and multi-plan views both asking for
// the same room's data), this skips hitting Stayflexi again. Short TTL —
// long enough to dedupe near-duplicate calls, short enough to still reflect
// real inventory/rate changes.
const SHORT_CACHE_TTL_MS = 30 * 1000;
const shortCache = new Map(); // key -> { data, expiresAt }

function cacheKey(path, params, apiKey) {
  const sortedParams = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return `${path}?${sortedParams}|key=${apiKey.slice(-6)}`;
}

async function callApi(path, params, apiKey, { cacheTtlMs = 0, retriesOn429 = 2 } = {}) {
  const key = cacheTtlMs ? cacheKey(path, params, apiKey) : null;
  if (key) {
    const cached = shortCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
  }

  const url = new URL(`${BASE_URL}/${path}/`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  let attempt = 0;
  for (;;) {
    await scheduleDispatch();
    const res = await fetch(url, { headers: { "X-SF-API-KEY": apiKey } });
    if (res.status === 429 && attempt < retriesOn429) {
      attempt += 1;
      await sleep(REQUEST_GAP_MS * (attempt + 1)); // back off a bit more each retry
      continue;
    }
    if (!res.ok) {
      throw new Error(`Stayflexi ${path} returned HTTP ${res.status}`);
    }
    const body = await res.json();
    if (body.status === false) {
      throw new Error(body.message || `Stayflexi ${path} returned a failure status`);
    }
    if (key) shortCache.set(key, { data: body, expiresAt: Date.now() + cacheTtlMs });
    return body;
  }
}

// Full hotel detail: name, room types, rate plans (with per-room-type default
// pricing and inventory count). This is mostly static reference data — safe
// to cache for a few minutes (server.js caches this one separately, longer).
function getHotelDetail({ pmsId, hotelId, apiKey }) {
  return callApi("gethoteldetail", { pmsId, hotelId }, apiKey);
}

// Occupancy-based rates for one room type + rate plan over a date range.
// Response: { rates: { "dd-MM-yyyy": { "1": n, "2": n, ... , "c": n } } }
function getRoomRates({ pmsId, hotelId, roomTypeId, ratePlanId, fromDateISO, toDateISO, apiKey }) {
  return callApi(
    "getroomrates",
    {
      pmsId,
      hotelId,
      roomTypeId,
      ratePlanId,
      fromDate: toStayflexiDate(fromDateISO),
      toDate: toStayflexiDate(toDateISO),
    },
    apiKey,
    { cacheTtlMs: SHORT_CACHE_TTL_MS }
  );
}

// Room inventory for one room type over a date range.
// Response: { availability: { "yyyy-MM-dd": n } }
function getRoomCount({ pmsId, hotelId, roomTypeId, fromDateISO, toDateISO, apiKey }) {
  return callApi(
    "getroomcount",
    {
      pmsId,
      hotelId,
      roomTypeId,
      fromDate: toStayflexiDate(fromDateISO),
      toDate: toStayflexiDate(toDateISO),
    },
    apiKey,
    { cacheTtlMs: SHORT_CACHE_TTL_MS }
  );
}

module.exports = {
  toStayflexiDate,
  nightsInRange,
  getHotelDetail,
  getRoomRates,
  getRoomCount,
};
