require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const { getPropertyRaw, toPublicProperty, listPublicProperties } = require("./properties");
const { getHotelDetail, getRoomRates, getRoomCount, nightsInRange, toStayflexiDate } = require("./stayflexi");
const { listPromotions, createPromotion, updatePromotion, deletePromotion, bestApplicablePromotion } = require("./promotions");
const { signUp, login, createSession, memberForToken, destroySession } = require("./auth");

const app = express();
app.use(cors()); // dev-only: in production, restrict this to your real frontend domain(s)
app.use(express.json());

const PORT = process.env.PORT || 4000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme123";
const STORE_FILE = path.join(__dirname, "bookings-store.json");

// Simple password gate for anything guest-data related. Not real
// authentication (no sessions/tokens/expiry) — just enough to stop the
// public booking page from exposing other guests' data. Replace with real
// auth (e.g. a login + session/JWT) before this is a real product.
function requireAdmin(req, res, next) {
  const provided = req.headers["x-admin-password"];
  if (provided !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid admin password" });
  }
  next();
}

// Real guest auth (see auth.js) — resolves the caller's member status from
// a verified session token, never from anything the client claims. Used to
// decide member-vs-guest promotion pricing; the "I'm a member" checkbox
// this replaced could be ticked by anyone, this can't.
function getRequestMember(req) {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  return memberForToken(token);
}

// --- tiny file-based "database" for bookings (per property) -----------
function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return {};
  }
}
function saveStore(store) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

// --- live Stayflexi data --------------------------------------------------
// Request pacing (the min gap between calls that avoids Stayflexi's rate
// limit) and short-term response caching now live centrally in stayflexi.js
// — see the comments there. That's what lets the routes below fire a whole
// room's/rate-plan's worth of calls together instead of one-at-a-time.

// gethoteldetail is mostly static reference data (room types, rate plans,
// default pricing/inventory) — cache it briefly instead of hitting the API
// on every page load.
const HOTEL_DETAIL_TTL_MS = 10 * 60 * 1000;
const hotelDetailCache = new Map(); // slug -> { data, expiresAt }

async function getLiveHotelDetail(prop) {
  const cached = hotelDetailCache.get(prop.slug);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const data = await getHotelDetail(prop.stayflexi);
  hotelDetailCache.set(prop.slug, { data, expiresAt: Date.now() + HOTEL_DETAIL_TTL_MS });
  return data;
}

// Which rate plan to price a room type against — resolved from the LIVE
// gethoteldetail response every time, never a fixed ID. Prefers whichever
// live plan is named like "Standard" if the room type is on one; otherwise
// the first live plan that actually includes this room type. This means if
// Stayflexi's plan IDs or names change, or differ from any past sample data,
// this still finds a plan that's currently live and real.
function resolveRatePlanId(detail, roomTypeId) {
  const candidates = (detail.ratePlanList || []).filter((rp) =>
    (rp.roomTypes || []).some((rt) => rt.roomTypeId === roomTypeId)
  );
  if (!candidates.length) return null;
  const standard = candidates.find((rp) => /standard/i.test(rp.ratePlanName || ""));
  return (standard || candidates[0]).ratePlanId;
}

// Turn a raw Stayflexi hotel-detail response into the room shape the
// frontend expects. Uses the top-level roomTypeList (each room type's own
// live defaultPrice/roomCountPerRoomType), not any one rate plan's copy of
// it — the rate plan is only chosen later, per room, when we actually
// fetch live nightly rates. The "Dummy" room type is a Stayflexi
// placeholder, not a real bookable room.
function roomsFromHotelDetail(detail) {
  return (detail.roomTypeList || [])
    .filter((rt) => rt.roomTypeName !== "Dummy")
    .map((rt) => ({
      id: rt.roomTypeId,
      name: rt.roomTypeName,
      images: Array.isArray(rt.roomTypeImages) ? rt.roomTypeImages : [],
      ratePerNight: asFiniteNumber(rt.defaultPrice) ?? 0,
      roomsLeft: asFiniteNumber(rt.roomCountPerRoomType) ?? 0,
      maxGuests: asFiniteNumber(rt.maxOccupancy) ?? rt.maxOccupancy,
      maxChildren: asFiniteNumber(rt.maxChildren) ?? 0,
    }));
}

// ALL rate plans (not just one "best" pick) that include this room type —
// used by the multi-rate-plan room listing, where every plan is shown as
// its own priced line, like Stayflexi's own booking engine does. Stayflexi
// names the plans meant for direct booking engines "Booking Engine ..."
// (as opposed to "Standard Plan"/"CP"/"MAP"/"AP", which are the same rates
// but meant for OTA channels) — prefer those if any exist for this room,
// matching what Stayflexi's own booking-engine page actually shows.
function allRatePlansForRoom(detail, roomTypeId) {
  const all = (detail.ratePlanList || [])
    .filter((rp) => (rp.roomTypes || []).some((rt) => rt.roomTypeId === roomTypeId))
    .map((rp) => ({ ratePlanId: rp.ratePlanId, ratePlanName: rp.ratePlanName }));
  const bookingEngineOnly = all.filter((p) => /^booking engine/i.test(p.ratePlanName || ""));
  return bookingEngineOnly.length ? bookingEngineOnly : all;
}

// Stayflexi's JSON sometimes sends numeric fields as strings (e.g. "3000"
// instead of 3000) — treat anything that parses cleanly as a finite number
// as valid, rather than requiring the JSON type to already be a number.
function asFiniteNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

// Stayflexi's getroomrates returns occupancy-based pricing under keys "1"
// through "4" (single/double/triple/quad). Clamp the requested adult count
// into that range, and never above what the room type actually allows.
function occupancyKeyForAdults(adults, maxGuests) {
  const a = Math.round(asFiniteNumber(adults) ?? 2);
  const cap = Math.min(4, maxGuests || 4);
  return String(Math.min(Math.max(a, 1), cap));
}

// Confirmed from Stayflexi's actual (undocumented) response shape: rates
// carry TWO child price keys, not one — "c1" for younger children and "c"
// for older ones. Cross-checked against the PMS dashboard, which labels
// these "Child Prices (0-6)" and "Child Price (7-12)" respectively (that
// 0-6 / 7-12 split is Stayflexi's own fixed convention, shown in their UI —
// the API itself doesn't return the age boundaries, only the two prices).
// There's no third tier for older children, so 7+ falls under "c".
function childBandKeyForAge(age) {
  const a = asFiniteNumber(age);
  if (a === null) return "c"; // unknown age — default to the paid band, not the free one
  return a <= 6 ? "c1" : "c";
}

// Clamp a list of child ages to the room's own maxChildren (never charge/
// count more children than the room allows).
function clampChildrenAges(childrenAges, maxChildren) {
  const ages = Array.isArray(childrenAges) ? childrenAges : [];
  const cap = Math.max(0, maxChildren || 0);
  return ages.slice(0, cap);
}

// Live rate + availability for one room type over [checkinISO, checkoutISO).
// `detail` is the live gethoteldetail response — used to resolve which rate
// plan to price this room against (see resolveRatePlanId), rather than
// assuming a fixed plan ID. The rate and count calls are fired together
// (Promise.allSettled, not sequential) — pacing/rate-limiting against
// Stayflexi is handled centrally in stayflexi.js, so there's no need to
// await one before starting the other. Each field still reports whether it
// actually got live data or fell back, independent of the other's outcome.
async function withLiveRateAndAvailability(prop, detail, room, checkinISO, checkoutISO, adults, childrenAges, isMember) {
  const nights = nightsInRange(checkinISO, checkoutISO);
  const occupancyKey = occupancyKeyForAdults(adults, room.maxGuests);
  const clampedAges = clampChildrenAges(childrenAges, room.maxChildren);
  const result = {
    ...room,
    rateSource: "fallback",
    availabilitySource: "fallback",
    pricedForAdults: Number(occupancyKey),
    pricedForChildren: clampedAges.length,
    childrenAgesPriced: clampedAges,
    childrenTotal: 0, // total extra charge for all children, for the whole stay (nights already included)
  };

  const ratePlanId = resolveRatePlanId(detail, room.id);
  result.ratePlanId = ratePlanId; // which live rate plan this price came from (for debugging)
  if (!ratePlanId) {
    console.warn(`No live rate plan found for room ${room.id} — using gethoteldetail's default price.`);
  }

  const [ratesOutcome, countOutcome] = await Promise.allSettled([
    ratePlanId
      ? getRoomRates({ ...prop.stayflexi, roomTypeId: room.id, ratePlanId, fromDateISO: checkinISO, toDateISO: checkoutISO })
      : Promise.resolve(null),
    getRoomCount({ ...prop.stayflexi, roomTypeId: room.id, fromDateISO: checkinISO, toDateISO: checkoutISO }),
  ]);

  if (ratePlanId) {
    if (ratesOutcome.status === "fulfilled" && ratesOutcome.value) {
      const ratesRes = ratesOutcome.value;
      // getroomrates keys are dd-MM-yyyy. Only the actual stay nights count —
      // the API includes the checkout day too, but that's not a paid night.
      const nightlyRates = nights
        .map((iso) => asFiniteNumber(ratesRes.rates?.[toStayflexiDate(iso)]?.[occupancyKey]))
        .filter((v) => v !== null);
      if (nightlyRates.length) {
        result.ratePerNight = Math.round(nightlyRates.reduce((a, b) => a + b, 0) / nightlyRates.length);
        result.rateSource = "live";
      } else {
        const sampleKey = toStayflexiDate(nights[0]);
        console.warn(
          `Stayflexi getroomrates for room ${room.id} (${checkinISO}..${checkoutISO}, ratePlan ${ratePlanId}) ` +
            `returned no usable "${occupancyKey}"-occupancy price — falling back to default price. ` +
            `Raw rates keys: ${Object.keys(ratesRes.rates || {}).join(", ") || "(none)"}. ` +
            `Raw value at ${sampleKey}: ${JSON.stringify(ratesRes.rates?.[sampleKey])}`
        );
      }

      // Real Stayflexi child pricing: "c1" for ages 0-6, "c" for 7+ (see
      // childBandKeyForAge above) — each averaged the same way as the room
      // rate, then multiplied per child.
      if (clampedAges.length) {
        const bandNightlyAvg = (bandKey) => {
          const vals = nights
            .map((iso) => asFiniteNumber(ratesRes.rates?.[toStayflexiDate(iso)]?.[bandKey]))
            .filter((v) => v !== null);
          return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        };
        const nightlyByBand = { c: bandNightlyAvg("c"), c1: bandNightlyAvg("c1") };
        result.childRateBandsPerNight = nightlyByBand; // for transparency/debugging
        result.childrenTotal = Math.round(
          clampedAges.reduce((sum, age) => sum + nightlyByBand[childBandKeyForAge(age)] * nights.length, 0)
        );
      }
    } else if (ratesOutcome.status === "rejected") {
      console.error(`Stayflexi getroomrates failed for room ${room.id} (ratePlan ${ratePlanId}):`, ratesOutcome.reason?.message);
    }
  }

  if (countOutcome.status === "fulfilled") {
    const countRes = countOutcome.value;
    // getroomcount keys are yyyy-MM-dd.
    const nightlyAvail = nights
      .map((iso) => asFiniteNumber(countRes.availability?.[iso]))
      .filter((v) => v !== null);
    if (nightlyAvail.length) {
      result.roomsLeft = Math.min(...nightlyAvail);
      result.availabilitySource = "live";
    } else {
      console.warn(
        `Stayflexi getroomcount for room ${room.id} (${checkinISO}..${checkoutISO}) ` +
          `returned no matching dates — falling back to default count. Raw availability keys: ${Object.keys(countRes.availability || {}).join(", ") || "(none)"}`
      );
    }
  } else {
    console.error(`Stayflexi getroomcount failed for room ${room.id}:`, countOutcome.reason?.message);
  }

  // Apply our own promotions engine on top of the live Stayflexi price (see
  // promotions.js — Stayflexi's API has no promotions data for us to read,
  // so this discount logic and its rules live entirely in our backend).
  const roomTotalBeforeDiscount = result.ratePerNight * nights.length + result.childrenTotal;
  const promoMatch = bestApplicablePromotion(
    prop.slug,
    {
      checkinISO,
      checkoutISO,
      nights: nights.length,
      adults: Number(occupancyKey),
      roomTypeId: room.id,
      isMember: isMember === true || isMember === "true",
      todayISO: new Date().toISOString().slice(0, 10),
    },
    roomTotalBeforeDiscount
  );
  result.totalBeforeDiscount = roomTotalBeforeDiscount;
  result.appliedPromotion = promoMatch ? { id: promoMatch.promotion.id, name: promoMatch.promotion.name } : null;
  result.discountAmount = promoMatch ? promoMatch.discountAmount : 0;
  result.totalAfterDiscount = roomTotalBeforeDiscount - result.discountAmount;

  return result;
}

// Total price for a booking, computed server-side from live Stayflexi rates
// (or the static fallback rate for mock properties) — never trust a total
// sent from the browser.
async function resolveRoomAndTotal(prop, roomId, checkinISO, checkoutISO, nights, adults, childrenAges, isMember) {
  if (!prop.live) {
    const room = prop.fallbackRooms.find((r) => r.id === roomId);
    if (!room) return null;
    return { roomName: room.name, total: room.ratePerNight * Number(nights) };
  }

  const detail = await getLiveHotelDetail(prop);
  const baseRoom = roomsFromHotelDetail(detail).find((r) => r.id === roomId);
  if (!baseRoom) return null;

  const occupancyKey = occupancyKeyForAdults(adults, baseRoom.maxGuests);
  const clampedAges = clampChildrenAges(childrenAges, baseRoom.maxChildren);

  const ratePlanId = resolveRatePlanId(detail, roomId);
  if (!ratePlanId) {
    return { roomName: baseRoom.name, total: baseRoom.ratePerNight * Number(nights) };
  }

  try {
    const ratesRes = await getRoomRates({
      ...prop.stayflexi,
      roomTypeId: roomId,
      ratePlanId,
      fromDateISO: checkinISO,
      toDateISO: checkoutISO,
    });
    const nightsList = nightsInRange(checkinISO, checkoutISO);
    const nightlyRates = nightsList
      .map((iso) => asFiniteNumber(ratesRes.rates?.[toStayflexiDate(iso)]?.[occupancyKey]))
      .filter((v) => v !== null);
    const roomTotal = nightlyRates.length
      ? nightlyRates.reduce((a, b) => a + b, 0)
      : baseRoom.ratePerNight * Number(nights);

    let childrenTotal = 0;
    if (clampedAges.length) {
      const bandNightlyAvg = (bandKey) => {
        const vals = nightsList
          .map((iso) => asFiniteNumber(ratesRes.rates?.[toStayflexiDate(iso)]?.[bandKey]))
          .filter((v) => v !== null);
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      };
      const nightlyByBand = { c: bandNightlyAvg("c"), c1: bandNightlyAvg("c1") };
      childrenTotal = Math.round(
        clampedAges.reduce((sum, age) => sum + nightlyByBand[childBandKeyForAge(age)] * nightsList.length, 0)
      );
    }

    const roomAndChildrenTotal = roomTotal + childrenTotal;
    const promoMatch = bestApplicablePromotion(
      prop.slug,
      {
        checkinISO,
        checkoutISO,
        nights: nightsList.length,
        adults: Number(occupancyKey),
        roomTypeId: roomId,
        isMember: isMember === true || isMember === "true",
        todayISO: new Date().toISOString().slice(0, 10),
      },
      roomAndChildrenTotal
    );
    const discountAmount = promoMatch ? promoMatch.discountAmount : 0;

    return {
      roomName: baseRoom.name,
      total: roomAndChildrenTotal - discountAmount,
      appliedPromotion: promoMatch ? { id: promoMatch.promotion.id, name: promoMatch.promotion.name } : null,
      discountAmount,
    };
  } catch (e) {
    console.error("Stayflexi live rate fetch failed during booking, using base rate:", e.message);
    return { roomName: baseRoom.name, total: baseRoom.ratePerNight * Number(nights) };
  }
}

// Prices ONE (room, rate plan) combination for a stay. Unlike
// resolveRatePlanId (which auto-picks a single "best" plan for the old
// single-plan flow), this takes an explicit ratePlanId — the point here is
// to price EVERY plan a room has, matching Stayflexi's own booking engine,
// which lists each meal plan (EP/CP/MAP/AP) as its own line with its own
// price. Used by both the room-listing route (for display/estimate) and
// cart checkout (for the authoritative price at the moment of booking).
async function priceRoomForPlan(prop, roomId, ratePlanId, checkinISO, checkoutISO, adults, childrenAges, maxGuests, maxChildren, isMember) {
  const nights = nightsInRange(checkinISO, checkoutISO);
  const occupancyKey = occupancyKeyForAdults(adults, maxGuests);
  const clampedAges = clampChildrenAges(childrenAges, maxChildren);
  const result = {
    ratePlanId,
    rateSource: "fallback",
    ratePerNight: 0,
    pricedForAdults: Number(occupancyKey),
    pricedForChildren: clampedAges.length,
    childrenTotal: 0,
  };

  try {
    const ratesRes = await getRoomRates({
      ...prop.stayflexi,
      roomTypeId: roomId,
      ratePlanId,
      fromDateISO: checkinISO,
      toDateISO: checkoutISO,
    });
    const nightlyRates = nights
      .map((iso) => asFiniteNumber(ratesRes.rates?.[toStayflexiDate(iso)]?.[occupancyKey]))
      .filter((v) => v !== null);
    if (nightlyRates.length) {
      result.ratePerNight = Math.round(nightlyRates.reduce((a, b) => a + b, 0) / nightlyRates.length);
      result.rateSource = "live";
    }
    if (clampedAges.length) {
      const bandAvg = (band) => {
        const vals = nights
          .map((iso) => asFiniteNumber(ratesRes.rates?.[toStayflexiDate(iso)]?.[band]))
          .filter((v) => v !== null);
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      };
      const byBand = { c: bandAvg("c"), c1: bandAvg("c1") };
      result.childrenTotal = Math.round(
        clampedAges.reduce((sum, age) => sum + byBand[childBandKeyForAge(age)] * nights.length, 0)
      );
    }
  } catch (e) {
    console.error(`Stayflexi getroomrates failed for room ${roomId} plan ${ratePlanId}:`, e.message);
  }

  const totalBeforeDiscount = result.ratePerNight * nights.length + result.childrenTotal;
  result.totalBeforeDiscount = totalBeforeDiscount;

  // Discount preview for this single line — see the cart checkout route for
  // why the actual charged discount is recomputed once on the whole cart
  // rather than trusting this per-line figure directly (percent discounts
  // are distributive, so as long as only one promo applies, the sum of
  // per-line discounted prices matches the cart-level discounted total).
  const promoMatch = bestApplicablePromotion(
    prop.slug,
    {
      checkinISO,
      checkoutISO,
      nights: nights.length,
      adults: Number(occupancyKey),
      roomTypeId: roomId,
      isMember: isMember === true || isMember === "true",
      todayISO: new Date().toISOString().slice(0, 10),
    },
    totalBeforeDiscount
  );
  result.appliedPromotion = promoMatch ? { id: promoMatch.promotion.id, name: promoMatch.promotion.name } : null;
  result.discountAmount = promoMatch ? promoMatch.discountAmount : 0;
  result.totalAfterDiscount = totalBeforeDiscount - result.discountAmount;

  return result;
}

// --- routes -------------------------------------------------------------

// --- guest auth (member accounts) ----------------------------------------
//
// Real sign-up/sign-in, not a checkbox. A valid session here is what lets
// the member-tier promotion pricing apply (see getRequestMember above and
// its use in the /rooms and /bookings routes below).

app.post("/api/auth/signup", (req, res) => {
  const { email, password, fullName } = req.body || {};
  const result = signUp(email, password, fullName);
  if (result.error) return res.status(400).json({ error: result.error });
  const token = createSession(result.member.email);
  res.status(201).json({ token, member: result.member });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const result = login(email, password);
  if (result.error) return res.status(401).json({ error: result.error });
  const token = createSession(result.member.email);
  res.json({ token, member: result.member });
});

app.post("/api/auth/logout", (req, res) => {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  destroySession(token);
  res.status(204).end();
});

app.get("/api/auth/me", (req, res) => {
  const member = getRequestMember(req);
  if (!member) return res.status(401).json({ error: "Not signed in" });
  res.json({ member });
});

// List all properties (public fields only) — used to populate the property
// switcher. Shows every property (real + demo placeholders) by default so
// there's more than one option to browse; pass ?includeMock=0 to show only
// properties actually connected to Stayflexi (currently just Riverline Gold).
// List all properties (public fields only) — used to populate the property
// switcher. Only real Stayflexi-connected properties are shown by default;
// pass ?includeMock=1 to also see the old demo placeholders.
// List all properties for the landing page grid — enriched with a live
// teaser image, location, and tagline (pulled from cached gethoteldetail)
// for properties that are actually connected to Stayflexi.
app.get("/api/properties", async (req, res) => {
  const includeMock = req.query.includeMock === "1";
  const props = listPublicProperties(includeMock);

  const enriched = await Promise.all(
    props.map(async (p) => {
      const raw = getPropertyRaw(p.slug);
      if (!raw || !raw.live) return p;
      try {
        const detail = await getLiveHotelDetail(raw);
        const location = [detail.city, detail.state, detail.country].filter(Boolean).join(", ");
        return {
          ...p,
          image: Array.isArray(detail.hotelImages) && detail.hotelImages.length ? detail.hotelImages[0] : null,
          location: location || null,
          tagline: detail.description || p.subtitle,
        };
      } catch (e) {
        console.error(`Couldn't enrich property list for ${p.slug}:`, e.message);
        return p; // fall back to the plain entry — still shows in the grid, just without live image/location
      }
    })
  );

  res.json(enriched);
});

// Get one property's public details for the property page header — name,
// branding, description, address, amenities, photo gallery, and a baseline
// room list. For live properties this comes straight from gethoteldetail
// (cached ~10 min); phone/email aren't in that API response at all, so
// those come from our own static config in properties.js instead. Falls
// back to static data if the live call fails for any reason.
app.get("/api/properties/:slug", async (req, res) => {
  const prop = getPropertyRaw(req.params.slug);
  if (!prop) return res.status(404).json({ error: "Property not found" });

  if (prop.live) {
    try {
      const detail = await getLiveHotelDetail(prop);
      const address = [detail.address, detail.city, detail.state, detail.country, detail.zipcode]
        .filter(Boolean)
        .join(", ");
      return res.json({
        ...toPublicProperty(prop),
        rooms: roomsFromHotelDetail(detail),
        images: Array.isArray(detail.hotelImages) ? detail.hotelImages : [],
        description: detail.description || prop.subtitle,
        address: address || null,
        amenities: Array.isArray(detail.amenities) ? detail.amenities : [],
        liveData: true,
      });
    } catch (e) {
      console.error(`Stayflexi live fetch failed for ${prop.slug}:`, e.message);
      // fall through to the static fallback below
    }
  }

  res.json({ ...toPublicProperty(prop), rooms: prop.fallbackRooms, images: [], amenities: [], liveData: false });
});

// TEMPORARY DEBUGGING ROUTE — returns Stayflexi's raw, unfiltered responses
// for a property, so we can check for fields our normal parsing might be
// dropping (e.g. any age-based child pricing that isn't in the public API
// docs). Not meant to stay in the app long-term; remove once we've
// confirmed what Stayflexi actually sends. Pass ?checkin=&checkout= to also
// see the raw getroomrates response for one room (defaults to the first
// room type).
app.get("/api/properties/:slug/debug/raw-stayflexi", async (req, res) => {
  const prop = getPropertyRaw(req.params.slug);
  if (!prop) return res.status(404).json({ error: "Property not found" });
  if (!prop.live) return res.status(400).json({ error: "This property isn't live-connected." });

  try {
    const detail = await getHotelDetail(prop.stayflexi);
    const out = { rawGetHotelDetail: detail };

    const { checkin, checkout, roomTypeId } = req.query;
    if (checkin && checkout) {
      const targetRoomId = roomTypeId || detail.roomTypeList?.[0]?.roomTypeId;
      const ratePlanId = resolveRatePlanId(detail, targetRoomId);
      if (targetRoomId && ratePlanId) {
        const rawRates = await getRoomRates({
          ...prop.stayflexi,
          roomTypeId: targetRoomId,
          ratePlanId,
          fromDateISO: checkin,
          toDateISO: checkout,
        });
        out.rawGetRoomRates = { roomTypeId: targetRoomId, ratePlanId, response: rawRates };
      }
    }

    res.json(out);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Live rates + availability for a specific date range — called when the
// guest searches. For riverline-gold this hits Stayflexi's getroomrates and
// getroomcount for every room type; for mock properties it just returns the
// static rooms unchanged.
app.get("/api/properties/:slug/rooms", async (req, res) => {
  const prop = getPropertyRaw(req.params.slug);
  if (!prop) return res.status(404).json({ error: "Property not found" });

  const { checkin, checkout, adults, childrenAges: childrenAgesRaw } = req.query;
  if (!checkin || !checkout) {
    return res.status(400).json({ error: "checkin and checkout query params are required (YYYY-MM-DD)" });
  }
  // Membership is resolved from a verified session token (Authorization
  // header), never from a client-supplied flag — see getRequestMember.
  const member = getRequestMember(req);
  const isMember = !!member;
  // Ages come in as a comma-separated string, e.g. "5,9" for two children.
  const childrenAges = childrenAgesRaw
    ? String(childrenAgesRaw)
        .split(",")
        .map((a) => asFiniteNumber(a))
        .filter((a) => a !== null)
    : [];

  if (!prop.live) {
    return res.json({ rooms: prop.fallbackRooms, liveData: false });
  }

  try {
    const detail = await getLiveHotelDetail(prop);
    const baseRooms = roomsFromHotelDetail(detail);
    if (nightsInRange(checkin, checkout).length === 0) {
      return res.status(400).json({ error: "checkout must be after checkin" });
    }
    // All rooms fetched together — Stayflexi's rate limit is paced centrally
    // in stayflexi.js, so this no longer needs to go one room at a time.
    const rooms = await Promise.all(
      baseRooms.map((room) => withLiveRateAndAvailability(prop, detail, room, checkin, checkout, adults, childrenAges, isMember))
    );
    res.json({ rooms, liveData: true });
  } catch (e) {
    console.error(`Stayflexi live rooms fetch failed for ${prop.slug}:`, e.message);
    res.json({ rooms: prop.fallbackRooms, liveData: false });
  }
});

// Live rooms with EVERY applicable rate plan priced separately (EP/CP/MAP/
// AP etc.), matching Stayflexi's own booking-engine page — the single-plan
// /rooms route above picks one "best" plan per room; this shows them all,
// for the cart-based checkout flow. This does a lot more Stayflexi calls
// per search (one per room, plus one per rate plan per room) — all
// sequential with the same throttle, so it's slower than the single-plan
// route but avoids the HTTP 429s we hit before with concurrent calls.
app.get("/api/properties/:slug/rooms-with-plans", async (req, res) => {
  const prop = getPropertyRaw(req.params.slug);
  if (!prop) return res.status(404).json({ error: "Property not found" });

  const { checkin, checkout, adults, childrenAges: childrenAgesRaw } = req.query;
  if (!checkin || !checkout) {
    return res.status(400).json({ error: "checkin and checkout query params are required (YYYY-MM-DD)" });
  }
  const member = getRequestMember(req);
  const isMember = !!member;
  const childrenAges = childrenAgesRaw
    ? String(childrenAgesRaw)
        .split(",")
        .map((a) => asFiniteNumber(a))
        .filter((a) => a !== null)
    : [];

  if (!prop.live) {
    return res.json({ rooms: [], liveData: false }); // the cart flow only supports live-connected properties right now
  }

  try {
    const detail = await getLiveHotelDetail(prop);
    const baseRooms = roomsFromHotelDetail(detail);
    if (nightsInRange(checkin, checkout).length === 0) {
      return res.status(400).json({ error: "checkout must be after checkin" });
    }

    // Every room's availability call, and every (room, rate plan) pricing
    // call, fired together — Stayflexi's rate limit is paced centrally in
    // stayflexi.js (calls are dispatched no closer than ~350ms apart, but
    // without blocking on each one's response first), so this is no longer
    // one call at a time. This is what made this route slow before: a hotel
    // with 6 room types x 3 rate plans meant 24 fully sequential calls.
    const countResults = await Promise.all(
      baseRooms.map(async (room) => {
        try {
          const countRes = await getRoomCount({ ...prop.stayflexi, roomTypeId: room.id, fromDateISO: checkin, toDateISO: checkout });
          const nights = nightsInRange(checkin, checkout);
          const nightlyAvail = nights.map((iso) => asFiniteNumber(countRes.availability?.[iso])).filter((v) => v !== null);
          if (nightlyAvail.length) {
            return { roomsLeft: Math.min(...nightlyAvail), availabilitySource: "live" };
          }
        } catch (e) {
          console.error(`Stayflexi getroomcount failed for room ${room.id}:`, e.message);
        }
        return { roomsLeft: room.roomsLeft, availabilitySource: "fallback" };
      })
    );

    const ratePlansPerRoom = await Promise.all(
      baseRooms.map((room) => {
        const planStubs = allRatePlansForRoom(detail, room.id);
        return Promise.all(
          planStubs.map((plan) =>
            priceRoomForPlan(prop, room.id, plan.ratePlanId, checkin, checkout, adults, childrenAges, room.maxGuests, room.maxChildren, isMember).then(
              (priced) => ({ ...plan, ...priced })
            )
          )
        );
      })
    );

    const rooms = baseRooms.map((room, i) => ({
      ...room,
      roomsLeft: countResults[i].roomsLeft,
      availabilitySource: countResults[i].availabilitySource,
      ratePlans: ratePlansPerRoom[i],
    }));

    res.json({ rooms, liveData: true });
  } catch (e) {
    console.error(`Stayflexi rooms-with-plans fetch failed for ${prop.slug}:`, e.message);
    res.status(502).json({ error: "Couldn't reach Stayflexi right now — please try again." });
  }
});

// Submit a cart of one or more (room, rate plan) selections as a single
// booking. Every item is re-priced live, server-side, at submit time —
// nothing from the browser's earlier search is trusted — then the best
// applicable promotion is applied once to the cart's subtotal.
app.post("/api/properties/:slug/cart-bookings", async (req, res) => {
  const prop = getPropertyRaw(req.params.slug);
  if (!prop) return res.status(404).json({ error: "Property not found" });
  if (!prop.live) {
    return res.status(400).json({ error: "Cart checkout is only available for live-connected properties right now." });
  }

  const { fullName, email, phone, checkin, checkout, adults, childrenAges, items } = req.body || {};
  if (!fullName || !email || !phone || !checkin || !checkout || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Missing required booking fields, or the cart is empty." });
  }
  const nights = nightsInRange(checkin, checkout);
  if (nights.length === 0) return res.status(400).json({ error: "checkout must be after checkin" });

  const member = getRequestMember(req);
  const isMember = !!member;
  const ages = Array.isArray(childrenAges)
    ? childrenAges.map((a) => asFiniteNumber(a)).filter((a) => a !== null && a >= 0 && a <= 17)
    : [];

  let detail;
  try {
    detail = await getLiveHotelDetail(prop);
  } catch (e) {
    return res.status(502).json({ error: "Couldn't reach Stayflexi to confirm pricing — please try again." });
  }
  const baseRooms = roomsFromHotelDetail(detail);

  const pricedItems = [];
  let subtotal = 0;
  for (const item of items) {
    const baseRoom = baseRooms.find((r) => r.id === String(item.roomId));
    if (!baseRoom) return res.status(400).json({ error: `Unknown room in cart: ${item.roomId}` });
    const planStub = allRatePlansForRoom(detail, baseRoom.id).find((p) => p.ratePlanId === String(item.ratePlanId));
    if (!planStub) return res.status(400).json({ error: `Unknown rate plan in cart for ${baseRoom.name}` });

    const priced = await priceRoomForPlan(
      prop,
      baseRoom.id,
      planStub.ratePlanId,
      checkin,
      checkout,
      adults,
      ages,
      baseRoom.maxGuests,
      baseRoom.maxChildren,
      isMember
    );

    pricedItems.push({
      roomId: baseRoom.id,
      roomName: baseRoom.name,
      ratePlanId: planStub.ratePlanId,
      ratePlanName: planStub.ratePlanName,
      itemTotal: priced.totalBeforeDiscount,
    });
    subtotal += priced.totalBeforeDiscount;
  }

  // Applied once on the cart's subtotal — see priceRoomForPlan's comment on
  // why this stays consistent with the per-line discounted previews shown
  // during search (percent discounts are distributive over a sum), as long
  // as a single promotion covers the whole cart (a room-restricted promo
  // that only some cart items qualify for is a known simplification here).
  const promoMatch = bestApplicablePromotion(
    prop.slug,
    {
      checkinISO: checkin,
      checkoutISO: checkout,
      nights: nights.length,
      adults: Math.round(asFiniteNumber(adults) ?? 2),
      roomTypeId: null,
      isMember,
      todayISO: new Date().toISOString().slice(0, 10),
    },
    subtotal
  );
  const discountAmount = promoMatch ? promoMatch.discountAmount : 0;

  const record = {
    ref: crypto.randomUUID(),
    submittedAt: new Date().toISOString(),
    fullName: String(fullName).trim(),
    email: String(email).trim(),
    phone: String(phone).trim(),
    checkin,
    checkout,
    nights: nights.length,
    adults: Math.round(asFiniteNumber(adults) ?? 2),
    children: ages.length,
    childrenAges: ages,
    memberEmail: member ? member.email : null,
    items: pricedItems,
    subtotal,
    appliedPromotion: promoMatch ? { id: promoMatch.promotion.id, name: promoMatch.promotion.name } : null,
    discountAmount,
    total: subtotal - discountAmount,
  };

  const store = loadStore();
  const list = store[req.params.slug] || [];
  list.unshift(record);
  store[req.params.slug] = list;
  saveStore(store);

  res.status(201).json(record);
});

// Get all booking submissions for a property. Admin-only — this is other
// guests' personal data (name, email, phone), not something the public
// booking page should ever show.
app.get("/api/properties/:slug/bookings", requireAdmin, (req, res) => {
  const prop = getPropertyRaw(req.params.slug);
  if (!prop) return res.status(404).json({ error: "Property not found" });
  const store = loadStore();
  res.json(store[req.params.slug] || []);
});

// Submit a new booking for a property.
app.post("/api/properties/:slug/bookings", async (req, res) => {
  const prop = getPropertyRaw(req.params.slug);
  if (!prop) return res.status(404).json({ error: "Property not found" });

  const { fullName, email, phone, roomId, checkin, checkout, nights, adults, childrenAges } = req.body || {};

  if (!fullName || !email || !phone || !roomId || !checkin || !checkout || !nights) {
    return res.status(400).json({ error: "Missing required booking fields" });
  }

  // Membership (and therefore which promotion tier applies) is resolved
  // from a verified session token — never from anything the client sends.
  const member = getRequestMember(req);
  const isMember = !!member;

  // Sanitize ages once, up front — used both for pricing (real per-age band
  // rates, see childBandKeyForAge) and for what gets stored on the record.
  const ages = Array.isArray(childrenAges)
    ? childrenAges.map((a) => asFiniteNumber(a)).filter((a) => a !== null && a >= 0 && a <= 17)
    : [];

  // Total (and, for the live property, the room's real name) is resolved
  // server-side from Stayflexi's live rates — never trust a price sent from
  // the browser.
  let resolved;
  try {
    resolved = await resolveRoomAndTotal(prop, roomId, checkin, checkout, nights, adults, ages, isMember);
  } catch (e) {
    console.error("Failed to resolve room/total for booking:", e.message);
    return res.status(502).json({ error: "Couldn't reach Stayflexi to confirm pricing — please try again." });
  }
  if (!resolved) return res.status(400).json({ error: "Unknown room for this property" });

  const record = {
    ref: crypto.randomUUID(),
    submittedAt: new Date().toISOString(),
    fullName: String(fullName).trim(),
    email: String(email).trim(),
    phone: String(phone).trim(),
    room: resolved.roomName,
    checkin,
    checkout,
    nights: Number(nights),
    adults: Math.round(asFiniteNumber(adults) ?? 2),
    children: ages.length,
    childrenAges: ages,
    memberEmail: member ? member.email : null,
    total: resolved.total,
    appliedPromotion: resolved.appliedPromotion || null,
    discountAmount: resolved.discountAmount || 0,
  };

  const store = loadStore();
  const list = store[req.params.slug] || [];
  list.unshift(record);
  store[req.params.slug] = list;
  saveStore(store);

  res.status(201).json(record);
});

// Clear all bookings for a property. Admin-only, same reasoning as above.
app.delete("/api/properties/:slug/bookings", requireAdmin, (req, res) => {
  const store = loadStore();
  store[req.params.slug] = [];
  saveStore(store);
  res.status(204).end();
});

// --- promotions (admin-editable discount rules) --------------------------
//
// See promotions.js for why these live in our own backend rather than
// Stayflexi: their Channel Manager API has no promotions endpoint. These
// routes are the "edit it anytime" part of that — full CRUD, gated behind
// the same admin password as the bookings routes.

app.get("/api/properties/:slug/promotions", requireAdmin, (req, res) => {
  const prop = getPropertyRaw(req.params.slug);
  if (!prop) return res.status(404).json({ error: "Property not found" });
  res.json(listPromotions(req.params.slug));
});

app.post("/api/properties/:slug/promotions", requireAdmin, (req, res) => {
  const prop = getPropertyRaw(req.params.slug);
  if (!prop) return res.status(404).json({ error: "Property not found" });
  const promo = createPromotion(req.params.slug, req.body || {});
  res.status(201).json(promo);
});

app.put("/api/properties/:slug/promotions/:id", requireAdmin, (req, res) => {
  const prop = getPropertyRaw(req.params.slug);
  if (!prop) return res.status(404).json({ error: "Property not found" });
  const updated = updatePromotion(req.params.slug, req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: "Promotion not found" });
  res.json(updated);
});

app.delete("/api/properties/:slug/promotions/:id", requireAdmin, (req, res) => {
  const prop = getPropertyRaw(req.params.slug);
  if (!prop) return res.status(404).json({ error: "Property not found" });
  const deleted = deletePromotion(req.params.slug, req.params.id);
  if (!deleted) return res.status(404).json({ error: "Promotion not found" });
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`Booking backend running at http://localhost:${PORT}`);
});
