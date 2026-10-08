const API_BASE = "http://localhost:4000/api";

// --- auth (real member accounts, not a checkbox) --------------------------
//
// Token lives in localStorage so it survives a page refresh. Every request
// that should reflect membership (search pricing, booking submission)
// attaches it via authHeaders() — the backend is what actually verifies it
// and decides real membership; nothing here is trusted on its own.
const AUTH_TOKEN_KEY = "stayflexi_demo_auth_token";

export function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}
function setAuthToken(token) {
  if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
  else localStorage.removeItem(AUTH_TOKEN_KEY);
}
function authHeaders() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function signUp(email, password, fullName) {
  const res = await fetch(`${API_BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, fullName }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Sign up failed");
  setAuthToken(data.token);
  return data.member;
}

export async function login(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Login failed");
  setAuthToken(data.token);
  return data.member;
}

export async function logout() {
  try {
    await fetch(`${API_BASE}/auth/logout`, { method: "POST", headers: authHeaders() });
  } finally {
    setAuthToken(null);
  }
}

// Checks whether the stored token is still a valid session, and who it
// belongs to. Returns null (and clears a dead token) if not signed in.
export async function fetchCurrentMember() {
  if (!getAuthToken()) return null;
  const res = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
  if (!res.ok) {
    setAuthToken(null); // stale/expired token — clear it
    return null;
  }
  const data = await res.json();
  return data.member;
}

export async function fetchPropertiesList() {
  const res = await fetch(`${API_BASE}/properties`);
  if (!res.ok) throw new Error("Failed to load properties list");
  return res.json();
}

export async function fetchProperty(slug) {
  const res = await fetch(`${API_BASE}/properties/${slug}`);
  if (!res.ok) throw new Error("Failed to load property");
  return res.json();
}

// Live rates + availability for a specific date range and party size (used
// once the guest searches). `childrenAges` is an array (e.g. [5, 9]) — the
// backend prices each child individually by Stayflexi's real age-band
// rates, not a flat per-child charge. Membership (for promotion pricing) is
// read server-side from the auth token, not passed in here. Returns
// { rooms, liveData }.
export async function fetchRoomAvailability(slug, checkin, checkout, adults, childrenAges) {
  const params = new URLSearchParams({
    checkin,
    checkout,
    adults: String(adults),
    childrenAges: (childrenAges || []).join(","),
  });
  const res = await fetch(`${API_BASE}/properties/${slug}/rooms?${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to load live availability");
  return res.json();
}

// Live rooms with EVERY rate plan priced separately (for the cart-based
// property page) — matches Stayflexi's own booking-engine page, which
// shows each plan (EP/CP/MAP/AP etc.) as its own line, not one "best" price
// per room. Returns { rooms, liveData }.
export async function fetchRoomsWithPlans(slug, checkin, checkout, adults, childrenAges) {
  const params = new URLSearchParams({
    checkin,
    checkout,
    adults: String(adults),
    childrenAges: (childrenAges || []).join(","),
  });
  const res = await fetch(`${API_BASE}/properties/${slug}/rooms-with-plans?${params}`, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to load live rooms");
  }
  return res.json();
}

// Submits a cart of one or more (room, rate plan) selections as a single
// booking. `items` is [{ roomId, ratePlanId }, ...].
export async function createCartBooking(slug, payload) {
  const res = await fetch(`${API_BASE}/properties/${slug}/cart-bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to submit booking");
  }
  return res.json();
}

export async function fetchBookings(slug, adminPassword) {
  const res = await fetch(`${API_BASE}/properties/${slug}/bookings`, {
    headers: { "x-admin-password": adminPassword },
  });
  if (res.status === 401) throw new Error("Wrong password");
  if (!res.ok) throw new Error("Failed to load bookings");
  return res.json();
}

export async function createBooking(slug, payload) {
  const res = await fetch(`${API_BASE}/properties/${slug}/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to submit booking");
  }
  return res.json();
}

export async function clearBookings(slug, adminPassword) {
  const res = await fetch(`${API_BASE}/properties/${slug}/bookings`, {
    method: "DELETE",
    headers: { "x-admin-password": adminPassword },
  });
  if (res.status === 401) throw new Error("Wrong password");
  if (!res.ok) throw new Error("Failed to clear bookings");
}

export async function fetchPromotions(slug, adminPassword) {
  const res = await fetch(`${API_BASE}/properties/${slug}/promotions`, {
    headers: { "x-admin-password": adminPassword },
  });
  if (res.status === 401) throw new Error("Wrong password");
  if (!res.ok) throw new Error("Failed to load promotions");
  return res.json();
}

export async function createPromotion(slug, adminPassword, fields) {
  const res = await fetch(`${API_BASE}/properties/${slug}/promotions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
    body: JSON.stringify(fields),
  });
  if (res.status === 401) throw new Error("Wrong password");
  if (!res.ok) throw new Error("Failed to create promotion");
  return res.json();
}

export async function updatePromotion(slug, adminPassword, id, fields) {
  const res = await fetch(`${API_BASE}/properties/${slug}/promotions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
    body: JSON.stringify(fields),
  });
  if (res.status === 401) throw new Error("Wrong password");
  if (!res.ok) throw new Error("Failed to update promotion");
  return res.json();
}

export async function deletePromotion(slug, adminPassword, id) {
  const res = await fetch(`${API_BASE}/properties/${slug}/promotions/${id}`, {
    method: "DELETE",
    headers: { "x-admin-password": adminPassword },
  });
  if (res.status === 401) throw new Error("Wrong password");
  if (!res.ok) throw new Error("Failed to delete promotion");
}
