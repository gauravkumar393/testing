import { useState, useEffect, useRef } from "react";
import {
  fetchProperty,
  fetchRoomsWithPlans,
  createCartBooking,
  fetchCurrentMember,
  signUp,
  login,
  logout,
} from "./api.js";

function fmtISOKey(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
}
function nightsBetween(a, b) {
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}
function tomorrowISO(offset) {
  const t = new Date();
  t.setDate(t.getDate() + offset);
  return fmtISOKey(t);
}
function addDaysISO(isoDate, days) {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  return fmtISOKey(d);
}
function inr(n) {
  return Math.round(n).toLocaleString("en-IN");
}

// This component is the whole booking flow for one property — Search
// (dates + occupancy + sign-in), Room rates (cart), Your details, and
// Declaration + confirmation. It's deliberately self-contained (no outer
// site header/nav) so the exact same page works both linked-to directly
// (/property/:slug) and embedded via iframe on a property's own WordPress
// site (/embed/:slug) — see App.jsx.
export default function BookingEngine({ slug }) {
  const [property, setProperty] = useState(null);
  const [loadError, setLoadError] = useState("");

  // 1 = search, 2 = room rates (cart), 3 = your details, 4 = declaration/confirm
  const [step, setStep] = useState(1);

  const [checkin, setCheckin] = useState(tomorrowISO(1));
  const [checkout, setCheckout] = useState(tomorrowISO(3));
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [childrenAges, setChildrenAges] = useState([]); // one entry per child, kept in sync with `children`
  const [occupancyOpen, setOccupancyOpen] = useState(false);
  const occupancyRef = useRef(null);
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(false);
  const [nights, setNights] = useState(2);

  // Real member auth. `member` is {email, fullName} when signed in with a
  // verified session, else null — the server (not this component) is the
  // source of truth for this, via fetchCurrentMember / the session token.
  const [member, setMember] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authOpen, setAuthOpen] = useState(false); // manual "Sign in" link toggle
  const [authPromptShown, setAuthPromptShown] = useState(false); // auto popup, once
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authFullName, setAuthFullName] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const authRef = useRef(null);

  // Step 2: live rooms with every rate plan, and the cart built from them.
  const [roomsWithPlans, setRoomsWithPlans] = useState(null);
  const [liveData, setLiveData] = useState(false);
  const [roomsError, setRoomsError] = useState("");
  const [cart, setCart] = useState([]); // array of priced line items, duplicates allowed (= quantity)

  // Step 3
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [detailsError, setDetailsError] = useState("");

  // Step 4
  const [agreed, setAgreed] = useState(false);
  const [declarationError, setDeclarationError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setProperty(null);
    setLoadError("");
    setStep(1);
    setRoomsWithPlans(null);
    setLiveData(false);
    setCart([]);
    setFullName("");
    setEmail("");
    setPhone("");
    setDetailsError("");
    setAgreed(false);
    setConfirmation(null);

    fetchProperty(slug)
      .then((p) => {
        if (!cancelled) setProperty(p);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e.message);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    fetchCurrentMember()
      .then((m) => {
        setMember(m);
        if (!m && !authPromptShown) {
          setAuthPromptShown(true);
          setAuthOpen(true); // auto-show once on step 1, per the manager's spec — dismissible below
        }
      })
      .finally(() => setAuthChecked(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onClickOutside(e) {
      if (authRef.current && !authRef.current.contains(e.target)) setAuthOpen(false);
      if (occupancyRef.current && !occupancyRef.current.contains(e.target)) setOccupancyOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function adjustAdults(delta) {
    setAdults((a) => Math.min(4, Math.max(1, a + delta)));
  }
  function adjustChildren(delta) {
    setChildren((c) => {
      const next = Math.min(4, Math.max(0, c + delta));
      setChildrenAges((ages) => {
        const copy = ages.slice(0, next);
        while (copy.length < next) copy.push(8);
        return copy;
      });
      return next;
    });
  }
  function setChildAge(index, age) {
    setChildrenAges((ages) => {
      const copy = [...ages];
      copy[index] = age;
      return copy;
    });
  }
  function occupancySummary() {
    const parts = [`${adults} adult${adults > 1 ? "s" : ""}`];
    if (children > 0) parts.push(`${children} child${children > 1 ? "ren" : ""}`);
    return parts.join(" · ");
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError("");
    setAuthSubmitting(true);
    try {
      const m =
        authMode === "signup" ? await signUp(authEmail, authPassword, authFullName) : await login(authEmail, authPassword);
      setMember(m);
      setAuthOpen(false);
      setAuthEmail("");
      setAuthPassword("");
      setAuthFullName("");
      // Membership can change pricing — refresh Step 2's data if we've
      // already loaded it, so displayed prices reflect the new rate.
      if (roomsWithPlans) loadRoomsWithPlans();
    } catch (e2) {
      setAuthError(e2.message);
    } finally {
      setAuthSubmitting(false);
    }
  }
  async function handleLogout() {
    await logout();
    setMember(null);
    if (roomsWithPlans) loadRoomsWithPlans();
  }

  async function loadRoomsWithPlans() {
    setSearching(true);
    setRoomsError("");
    try {
      const { rooms, liveData: isLive } = await fetchRoomsWithPlans(slug, checkin, checkout, adults, childrenAges);
      setRoomsWithPlans(rooms);
      setLiveData(isLive);
    } catch (e) {
      setRoomsError(e.message);
      setRoomsWithPlans([]);
    } finally {
      setSearching(false);
    }
  }

  // Step 1 -> Step 2
  async function handleGoToRoomRates() {
    if (!checkin || !checkout) {
      setSearchError("Pick both check-in and check-out dates.");
      return;
    }
    const n = nightsBetween(new Date(checkin + "T00:00:00"), new Date(checkout + "T00:00:00"));
    if (n < 1) {
      setSearchError("Check-out must be after check-in.");
      return;
    }
    setSearchError("");
    setNights(n);
    setCart([]);
    await loadRoomsWithPlans();
    setStep(2);
  }

  function addToCart(room, plan) {
    setCart((c) => [
      ...c,
      {
        roomId: room.id,
        roomName: room.name,
        ratePlanId: plan.ratePlanId,
        ratePlanName: plan.ratePlanName,
        totalBeforeDiscount: plan.totalBeforeDiscount,
        totalAfterDiscount: plan.totalAfterDiscount,
        appliedPromotion: plan.appliedPromotion,
      },
    ]);
  }
  function removeFromCart(index) {
    setCart((c) => c.filter((_, i) => i !== index));
  }
  const cartSubtotalBefore = cart.reduce((sum, c) => sum + c.totalBeforeDiscount, 0);
  const cartSubtotalAfter = cart.reduce((sum, c) => sum + c.totalAfterDiscount, 0);

  // Step 2 -> Step 3
  function handleGoToDetails() {
    if (cart.length === 0) {
      setRoomsError("Add at least one room to continue.");
      return;
    }
    setRoomsError("");
    setStep(3);
  }

  // Step 3 -> Step 4
  function handleGoToDeclaration() {
    if (!fullName.trim() || !email.trim() || !phone.trim()) {
      setDetailsError("Please fill in your name, email, and phone.");
      return;
    }
    setDetailsError("");
    setStep(4);
  }

  async function handleConfirmBooking() {
    if (!agreed) {
      setDeclarationError("Please confirm you agree to the terms and cancellation policy to continue.");
      return;
    }
    setDeclarationError("");
    setSubmitting(true);
    try {
      const record = await createCartBooking(slug, {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        checkin,
        checkout,
        adults,
        childrenAges,
        items: cart.map((c) => ({ roomId: c.roomId, ratePlanId: c.ratePlanId })),
      });
      setConfirmation(record);
    } catch (e) {
      setDeclarationError("Couldn't submit booking: " + e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center px-5">
        <div className="max-w-md bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-5">
          Couldn't load this property from the backend: {loadError}
        </div>
      </div>
    );
  }
  if (!property) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  const primary = property.colors?.primary || "#1e3a5f";
  const primaryDark = property.colors?.primaryDark || "#16293f";
  const accentBg = property.colors?.accentBg || "#eef2f8";

  const STEPS = ["Search", "Room rates", "Your details", "Confirm"];

  return (
    <div className="min-h-screen bg-stone-100 flex justify-center px-5 py-8">
      <div className="w-full max-w-xl">
        {/* Sign-in — a manual link plus an auto popup shown once per session */}
        <div className="flex justify-end mb-2 relative" ref={authRef}>
          {authChecked && member ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-600">
                Signed in as <span className="font-medium text-slate-900">{member.fullName || member.email}</span>
              </span>
              <button onClick={handleLogout} className="text-blue-700 underline underline-offset-2">
                Log out
              </button>
            </div>
          ) : authChecked ? (
            <>
              <button
                onClick={() => {
                  setAuthMode("login");
                  setAuthError("");
                  setAuthOpen((o) => !o);
                }}
                className="text-sm text-blue-700 underline underline-offset-2"
              >
                Sign in for member rates
              </button>
              {authOpen && (
                <div className="absolute right-0 top-6 z-20 w-72 bg-white border border-stone-300 rounded-md shadow-lg p-4">
                  <button
                    onClick={() => setAuthOpen(false)}
                    aria-label="Close"
                    className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-sm leading-none"
                  >
                    ✕
                  </button>
                  <div className="flex gap-3 mb-3 text-sm">
                    <button
                      type="button"
                      onClick={() => setAuthMode("login")}
                      className={authMode === "login" ? "font-semibold text-slate-900" : "text-gray-400"}
                    >
                      Log in
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode("signup")}
                      className={authMode === "signup" ? "font-semibold text-slate-900" : "text-gray-400"}
                    >
                      Sign up
                    </button>
                  </div>
                  <form onSubmit={handleAuthSubmit} className="flex flex-col gap-2">
                    {authMode === "signup" && (
                      <input
                        type="text"
                        placeholder="Full name"
                        value={authFullName}
                        onChange={(e) => setAuthFullName(e.target.value)}
                        className="border border-stone-300 rounded-md text-sm px-2.5 py-1.5"
                      />
                    )}
                    <input
                      type="email"
                      placeholder="Email"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      className="border border-stone-300 rounded-md text-sm px-2.5 py-1.5"
                      required
                    />
                    <input
                      type="password"
                      placeholder="Password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      className="border border-stone-300 rounded-md text-sm px-2.5 py-1.5"
                      required
                      minLength={6}
                    />
                    {authError && <p className="text-xs text-red-600">{authError}</p>}
                    <button
                      type="submit"
                      disabled={authSubmitting}
                      style={{ backgroundColor: primary }}
                      className="text-white text-sm py-1.5 rounded-md mt-1 disabled:opacity-60"
                    >
                      {authSubmitting ? "Please wait…" : authMode === "signup" ? "Create account" : "Log in"}
                    </button>
                  </form>
                  <button
                    onClick={() => setAuthOpen(false)}
                    className="text-xs text-gray-400 underline underline-offset-2 mt-2 block mx-auto"
                  >
                    Continue without signing in
                  </button>
                </div>
              )}
            </>
          ) : null}
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-1">Book your stay at {property.name}</h1>
        <p className="text-sm text-gray-500 mb-4">{property.description || property.subtitle}</p>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-5 text-xs">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const active = step === n;
            const done = step > n;
            return (
              <div key={label} className="flex items-center gap-2">
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                  style={active ? { backgroundColor: accentBg, color: primary, fontWeight: 600 } : { color: done ? primary : "#9ca3af" }}
                >
                  <span
                    className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white"
                    style={{ backgroundColor: active || done ? primary : "#d1d5db" }}
                  >
                    {done ? "✓" : n}
                  </span>
                  {label}
                </div>
                {n < STEPS.length && <span className="text-gray-300">—</span>}
              </div>
            );
          })}
        </div>

        {/* Step 1: Search */}
        {step === 1 && (
          <div className="bg-white border border-stone-300 rounded-lg p-5 mb-5">
            <h2 className="text-base font-semibold mb-4" style={{ color: primary }}>
              1. Check-in / Check-out
            </h2>
            <div className="flex gap-4 flex-wrap items-end">
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs text-gray-700 mb-1.5">Check-in</label>
                <input
                  type="date"
                  value={checkin}
                  onChange={(e) => {
                    setCheckin(e.target.value);
                    if (checkout <= e.target.value) setCheckout(addDaysISO(e.target.value, 1));
                  }}
                  className="w-full px-2.5 py-2 border border-stone-300 rounded-md text-sm text-slate-900"
                />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs text-gray-700 mb-1.5">Check-out</label>
                <input
                  type="date"
                  value={checkout}
                  min={checkin ? addDaysISO(checkin, 1) : undefined}
                  onChange={(e) => setCheckout(e.target.value)}
                  className="w-full px-2.5 py-2 border border-stone-300 rounded-md text-sm text-slate-900"
                />
              </div>
              <div className="relative w-[220px]" ref={occupancyRef}>
                <label className="block text-xs text-gray-700 mb-1.5">Select occupancy</label>
                <button
                  type="button"
                  onClick={() => setOccupancyOpen((o) => !o)}
                  className="w-full px-2.5 py-2 border border-stone-300 rounded-md text-sm text-slate-900 bg-white text-left flex items-center justify-between"
                >
                  <span>{occupancySummary()}</span>
                  <span className="text-gray-400 ml-1">{occupancyOpen ? "▲" : "▼"}</span>
                </button>
                {occupancyOpen && (
                  <div className="absolute z-10 mt-1 w-72 bg-white border border-stone-300 rounded-md shadow-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-slate-900">Adults</span>
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => adjustAdults(-1)} disabled={adults <= 1} className="w-7 h-7 rounded-full border border-stone-300 text-slate-700 disabled:opacity-30">−</button>
                        <span className="w-4 text-center text-sm">{adults}</span>
                        <button type="button" onClick={() => adjustAdults(1)} disabled={adults >= 4} className="w-7 h-7 rounded-full border border-stone-300 text-slate-700 disabled:opacity-30">+</button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-900">Children</span>
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => adjustChildren(-1)} disabled={children <= 0} className="w-7 h-7 rounded-full border border-stone-300 text-slate-700 disabled:opacity-30">−</button>
                        <span className="w-4 text-center text-sm">{children}</span>
                        <button type="button" onClick={() => adjustChildren(1)} disabled={children >= 4} className="w-7 h-7 rounded-full border border-stone-300 text-slate-700 disabled:opacity-30">+</button>
                      </div>
                    </div>
                    {children > 0 && (
                      <div className="mt-3 pt-3 border-t border-stone-200 flex flex-col gap-2">
                        {childrenAges.map((age, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <span className="text-xs text-gray-600">Age of child {i + 1}</span>
                            <select value={age} onChange={(e) => setChildAge(i, Number(e.target.value))} className="border border-stone-300 rounded-md text-sm px-2 py-1 bg-white">
                              {Array.from({ length: 18 }, (_, a) => a).map((a) => (
                                <option key={a} value={a}>{a === 0 ? "Under 1" : `${a} year${a > 1 ? "s" : ""} old`}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    )}
                    <button type="button" onClick={() => setOccupancyOpen(false)} style={{ backgroundColor: primary }} className="mt-4 w-full text-white text-sm py-2 rounded-md">
                      Done
                    </button>
                  </div>
                )}
              </div>
            </div>
            {searchError && <p className="text-sm text-red-600 mt-3">{searchError}</p>}
            <button
              onClick={handleGoToRoomRates}
              disabled={searching}
              style={{ backgroundColor: primary }}
              onMouseEnter={(e) => !searching && (e.currentTarget.style.backgroundColor = primaryDark)}
              onMouseLeave={(e) => !searching && (e.currentTarget.style.backgroundColor = primary)}
              className="mt-4 w-full text-white text-sm py-2.5 rounded-md disabled:opacity-60"
            >
              {searching ? "Loading room rates…" : "See room rates →"}
            </button>
          </div>
        )}

        {/* Step 2: Room rates (cart) */}
        {step === 2 && (
          <div className="mb-5">
            <div className="bg-white border border-stone-300 rounded-lg p-5 mb-4">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-semibold" style={{ color: primary }}>
                  2. Room rates
                </h2>
                {liveData && (
                  <span className="text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-1">
                    Live rates from Stayflexi
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mb-4">
                {checkin} → {checkout} · {nights} night(s) · {occupancySummary()}
              </p>

              {roomsError && <p className="text-sm text-red-600 mb-3">{roomsError}</p>}
              {searching && <p className="text-sm text-gray-500">Loading rooms and rates…</p>}

              {!searching && roomsWithPlans && roomsWithPlans.length === 0 && (
                <p className="text-sm text-gray-500">No rooms could be loaded for these dates.</p>
              )}

              <div className="flex flex-col gap-4">
                {roomsWithPlans?.map((room) => {
                  const soldOut = room.roomsLeft <= 0;
                  const tooSmall = adults > room.maxGuests;
                  const tooManyChildren = children > (room.maxChildren ?? 0);
                  const blocked = soldOut || tooSmall || tooManyChildren;
                  return (
                    <div key={room.id} className="border border-stone-200 rounded-md overflow-hidden">
                      <div className="flex gap-3 p-3 bg-stone-50">
                        {room.images?.[0] && (
                          <img src={room.images[0]} alt={room.name} className="w-24 h-20 object-cover rounded-md flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-slate-900 flex items-center gap-2">
                            {room.name}
                            {soldOut && <span className="text-[10px] bg-red-600 text-white rounded-full px-2 py-0.5">SOLD OUT</span>}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {blocked
                              ? soldOut
                                ? "Sold out for these dates"
                                : tooSmall
                                ? `Fits up to ${room.maxGuests} guests`
                                : `Takes up to ${room.maxChildren ?? 0} children`
                              : `${room.roomsLeft} room(s) left · up to ${room.maxGuests} guests`}
                          </div>
                        </div>
                      </div>
                      <div className="divide-y divide-stone-100">
                        {room.ratePlans?.map((plan) => {
                          const hasDiscount = plan.appliedPromotion && plan.discountAmount > 0;
                          return (
                            <div key={plan.ratePlanId} className="flex items-center justify-between px-3 py-2.5">
                              <div>
                                <div className="text-sm text-slate-900">{plan.ratePlanName}</div>
                                {hasDiscount && (
                                  <div className="text-[11px] text-green-700">{plan.appliedPromotion.name} applied</div>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-right">
                                  {hasDiscount && (
                                    <div className="text-[11px] text-gray-400 line-through">₹{inr(plan.totalBeforeDiscount)}</div>
                                  )}
                                  <div className="text-sm font-semibold text-slate-900">₹{inr(plan.totalAfterDiscount)}</div>
                                </div>
                                <button
                                  disabled={blocked}
                                  onClick={() => addToCart(room, plan)}
                                  style={!blocked ? { backgroundColor: primary } : undefined}
                                  className="text-white text-xs px-3 py-1.5 rounded-md disabled:opacity-30 disabled:bg-gray-400"
                                >
                                  Add
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cart summary */}
            <div className="bg-white border border-stone-300 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Your selection ({cart.length})</h3>
              {cart.length === 0 ? (
                <p className="text-sm text-gray-500">Add a room above to continue.</p>
              ) : (
                <div className="flex flex-col gap-2 mb-3">
                  {cart.map((item, i) => (
                    <div key={i} className="flex justify-between items-center text-sm">
                      <span className="text-slate-800">
                        {item.roomName} — {item.ratePlanName}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">₹{inr(item.totalAfterDiscount)}</span>
                        <button onClick={() => removeFromCart(i)} className="text-red-600 text-xs underline underline-offset-2">
                          Remove
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {cart.length > 0 && (
                <div className="flex justify-between items-center pt-3 border-t border-stone-200 mb-4">
                  <span className="text-sm font-semibold text-slate-900">Subtotal</span>
                  <span className="text-base font-bold text-slate-900">₹{inr(cartSubtotalAfter)}</span>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="text-sm text-gray-600 px-4 py-2">
                  ← Back
                </button>
                <button
                  onClick={handleGoToDetails}
                  style={{ backgroundColor: primary }}
                  className="flex-1 text-white text-sm py-2.5 rounded-md"
                >
                  Continue to your details →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Your details */}
        {step === 3 && (
          <div className="bg-white border border-stone-300 rounded-lg p-5 mb-5">
            <h2 className="text-base font-semibold mb-4" style={{ color: primary }}>
              3. Your details
            </h2>
            <div className="mb-3.5">
              <label className="block text-xs text-gray-700 mb-1.5">Full name</label>
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Priya Sharma" className="w-full px-2.5 py-2 border border-stone-300 rounded-md text-sm text-slate-900" />
            </div>
            <div className="mb-3.5">
              <label className="block text-xs text-gray-700 mb-1.5">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. priya@example.com" className="w-full px-2.5 py-2 border border-stone-300 rounded-md text-sm text-slate-900" />
            </div>
            <div className="mb-4">
              <label className="block text-xs text-gray-700 mb-1.5">Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="e.g. 9876543210" inputMode="numeric" className="w-full px-2.5 py-2 border border-stone-300 rounded-md text-sm text-slate-900" />
            </div>
            {detailsError && <p className="text-sm text-red-600 mb-3">{detailsError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="text-sm text-gray-600 px-4 py-2">
                ← Back
              </button>
              <button onClick={handleGoToDeclaration} style={{ backgroundColor: primary }} className="flex-1 text-white text-sm py-2.5 rounded-md">
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Declaration + confirmation */}
        {step === 4 && !confirmation && (
          <div className="bg-white border border-stone-300 rounded-lg p-5 mb-5">
            <h2 className="text-base font-semibold mb-4" style={{ color: primary }}>
              4. Review & confirm
            </h2>
            <div className="text-sm text-slate-700 mb-4 flex flex-col gap-1">
              <div>
                <span className="text-gray-500">Dates:</span> {checkin} → {checkout} ({nights} night{nights > 1 ? "s" : ""})
              </div>
              <div>
                <span className="text-gray-500">Guests:</span> {occupancySummary()}
              </div>
              <div>
                <span className="text-gray-500">Guest:</span> {fullName} · {email} · {phone}
              </div>
            </div>
            <div className="border border-stone-200 rounded-md p-3 mb-4">
              {cart.map((item, i) => (
                <div key={i} className="flex justify-between text-sm py-1">
                  <span>{item.roomName} — {item.ratePlanName}</span>
                  <span>₹{inr(item.totalAfterDiscount)}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm font-semibold pt-2 mt-2 border-t border-stone-200">
                <span>Total (estimate)</span>
                <span>₹{inr(cartSubtotalAfter)}</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Final price is confirmed by the hotel's live rates at the moment you submit.
              </p>
            </div>

            <label className="flex items-start gap-2 text-sm text-slate-800 mb-4">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
              <span>
                I agree to {property.name}'s terms of stay and cancellation policy, and confirm the details above
                are correct.
              </span>
            </label>

            {declarationError && <p className="text-sm text-red-600 mb-3">{declarationError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setStep(3)} className="text-sm text-gray-600 px-4 py-2">
                ← Back
              </button>
              <button
                onClick={handleConfirmBooking}
                disabled={submitting}
                style={{ backgroundColor: primary }}
                className="flex-1 text-white text-sm py-2.5 rounded-md disabled:opacity-60"
              >
                {submitting ? "Submitting…" : "Confirm booking"}
              </button>
            </div>
          </div>
        )}

        {confirmation && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-5">
            <h2 className="text-base font-semibold text-green-800 mb-3">Booking confirmed</h2>
            <p className="text-sm text-slate-800 mb-2">
              {confirmation.items?.length} room(s) booked for {confirmation.nights} night(s), total ₹{inr(confirmation.total)}.
              {confirmation.appliedPromotion ? ` (${confirmation.appliedPromotion.name} discount applied.)` : ""}
            </p>
            <p className="text-xs font-mono text-gray-600">Booking reference: {confirmation.ref}</p>
          </div>
        )}
      </div>
    </div>
  );
}
