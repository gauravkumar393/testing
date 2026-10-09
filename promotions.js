// A hotel-side, backend-editable promotions engine.
//
// Stayflexi's Channel Manager API (the one we integrated for rooms/rates/
// availability) has NO promotions/offers endpoint — nothing about
// promotions showed up in any raw response we've captured from it. So this
// can't be pulled live from Stayflexi the way rates and availability are;
// instead, promotions live entirely in OUR backend, editable any time via
// the admin-only CRUD routes in server.js, and applied on top of the live
// Stayflexi price when quoting or charging a guest.
//
// The condition fields below intentionally match the "Promotion" condition
// table from the Stayflexi PMS screenshot the user shared (Promotion Name,
// Stay Dates, Book Dates, Stay & Book Date Difference, Length of Stay,
// Member, Adult) — same shape, just enforced by us instead of Stayflexi,
// since Stayflexi doesn't expose these via API for us to read.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STORE_FILE = path.join(__dirname, "promotions-store.json");

function loadPromotionsStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return {};
  }
}
function savePromotionsStore(store) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

function listPromotions(slug) {
  const store = loadPromotionsStore();
  return store[slug] || [];
}

function createPromotion(slug, fields) {
  const store = loadPromotionsStore();
  const list = store[slug] || [];
  const promo = sanitizePromotion({ ...fields, id: crypto.randomUUID() });
  list.push(promo);
  store[slug] = list;
  savePromotionsStore(store);
  return promo;
}

function updatePromotion(slug, id, fields) {
  const store = loadPromotionsStore();
  const list = store[slug] || [];
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  list[idx] = sanitizePromotion({ ...list[idx], ...fields, id });
  store[slug] = list;
  savePromotionsStore(store);
  return list[idx];
}

function deletePromotion(slug, id) {
  const store = loadPromotionsStore();
  const list = store[slug] || [];
  const next = list.filter((p) => p.id !== id);
  const deleted = next.length !== list.length;
  store[slug] = next;
  if (deleted) savePromotionsStore(store);
  return deleted;
}

// Coerces/validates a promotion's fields into a known-safe shape. Unknown
// or malformed values are dropped rather than stored — keeps
// promotions-store.json predictable no matter what the admin form sends.
function sanitizePromotion(p) {
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
  const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    id: p.id,
    name: str(p.name) || "Untitled promotion",
    active: p.active !== false, // defaults to true unless explicitly false

    // Discount is two-tier, not a single value: everyone who matches the
    // conditions below gets a discount — logged-out guests get
    // discountPercentGuest, logged-in/member guests get
    // discountPercentMember (usually higher). Both are percent-off.
    discountPercentGuest: Math.max(0, num(p.discountPercentGuest) ?? 0),
    discountPercentMember: Math.max(0, num(p.discountPercentMember) ?? 0),

    // Stay Dates — the guest's stay must fall within this range
    stayFrom: str(p.stayFrom),
    stayTo: str(p.stayTo),
    // Book Dates — the booking must be MADE within this range ("today" at search/booking time)
    bookFrom: str(p.bookFrom),
    bookTo: str(p.bookTo),
    // Stay & Book Date Difference — days between booking and check-in must
    // lie within [minAdvanceDays, maxAdvanceDays]
    minAdvanceDays: num(p.minAdvanceDays),
    maxAdvanceDays: num(p.maxAdvanceDays),
    // Length of Stay — nights must lie within [minNights, maxNights]
    minNights: num(p.minNights),
    maxNights: num(p.maxNights),
    // No. of Adults (minimum) — kept from the original condition table
    minAdults: num(p.minAdults),
    // Not in the original condition table, but a natural extra: restrict to
    // specific room types. null/empty = applies to every room.
    roomTypeIds: Array.isArray(p.roomTypeIds) && p.roomTypeIds.length ? p.roomTypeIds.map(String) : null,
  };
}

// Does `promo` apply to this search/booking context? All of a promotion's
// set conditions must hold (conditions left blank/null are treated as "no
// restriction" for that field). Being a member/guest is NOT a gate here —
// it only decides which of the two discount percentages gets used, in
// discountPercentFor() below.
function promotionApplies(promo, ctx) {
  if (!promo.active) return false;

  const { checkinISO, checkoutISO, nights, adults, roomTypeId, todayISO } = ctx;

  if (promo.roomTypeIds && !promo.roomTypeIds.includes(String(roomTypeId))) return false;

  if (promo.stayFrom && checkinISO < promo.stayFrom) return false;
  if (promo.stayTo && checkoutISO > addOneDay(promo.stayTo)) return false;

  if (promo.bookFrom && todayISO < promo.bookFrom) return false;
  if (promo.bookTo && todayISO > promo.bookTo) return false;

  if (promo.minAdvanceDays !== null || promo.maxAdvanceDays !== null) {
    const advance = daysBetween(todayISO, checkinISO);
    if (promo.minAdvanceDays !== null && advance < promo.minAdvanceDays) return false;
    if (promo.maxAdvanceDays !== null && advance > promo.maxAdvanceDays) return false;
  }

  if (promo.minNights !== null && nights < promo.minNights) return false;
  if (promo.maxNights !== null && nights > promo.maxNights) return false;

  if (promo.minAdults !== null && adults < promo.minAdults) return false;

  return true;
}

// The percent to use for this promotion, given whether the guest is a
// member/logged in right now.
function discountPercentFor(promo, isMember) {
  return isMember ? promo.discountPercentMember : promo.discountPercentGuest;
}

function addOneDay(iso) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function daysBetween(fromISO, toISO) {
  const a = new Date(fromISO + "T00:00:00Z");
  const b = new Date(toISO + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}

// Picks the single best-value applicable promotion for this context (not
// stacked — applying multiple discounts at once gets confusing fast, so we
// take whichever one saves the guest the most, using whichever percent tier
// (member/guest) applies to them). Returns null if none apply or the
// applicable ones are all 0% for this guest.
function bestApplicablePromotion(slug, ctx, baseTotal) {
  const candidates = listPromotions(slug).filter((p) => promotionApplies(p, ctx));
  if (!candidates.length) return null;

  let best = null;
  let bestAmount = -1;
  let bestPercent = 0;
  for (const promo of candidates) {
    const percent = discountPercentFor(promo, ctx.isMember);
    const amount = Math.round((baseTotal * percent) / 100);
    if (amount > bestAmount) {
      bestAmount = amount;
      bestPercent = percent;
      best = promo;
    }
  }
  if (!best || bestAmount <= 0) return null;
  return { promotion: best, discountAmount: bestAmount, discountPercent: bestPercent };
}

module.exports = {
  listPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
  bestApplicablePromotion,
};
