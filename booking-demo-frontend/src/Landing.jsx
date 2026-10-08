import { useState, useEffect, useMemo, useRef } from "react";
import { fetchPropertiesList, fetchCurrentMember, signUp, login, logout } from "./api.js";

// The backend's `location` field is the full "City, State, Country" string
// (e.g. "Rishikesh, Uttarakhand, India"). For the filter we only want the
// city — the first comma-separated part.
function cityOf(location) {
  if (!location) return null;
  return location.split(",")[0].trim();
}

export default function Landing() {
  const [properties, setProperties] = useState(null);
  const [loadError, setLoadError] = useState("");

  // Name search (matches property name only — city filtering has its own
  // control below) plus a multi-select "Location" dropdown, checkbox-style,
  // with its own search box, built from whatever cities are actually
  // present in the data — no hardcoded city list to keep in sync.
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCities, setSelectedCities] = useState([]);
  const [locationOpen, setLocationOpen] = useState(false);
  const [citySearch, setCitySearch] = useState("");
  const locationRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (locationRef.current && !locationRef.current.contains(e.target)) {
        setLocationOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const cityOptions = useMemo(() => {
    if (!properties) return [];
    const set = new Set();
    properties.forEach((p) => {
      const city = cityOf(p.location);
      if (city) set.add(city);
    });
    return Array.from(set).sort();
  }, [properties]);

  const filteredCityOptions = useMemo(() => {
    const q = citySearch.trim().toLowerCase();
    if (!q) return cityOptions;
    return cityOptions.filter((c) => c.toLowerCase().includes(q));
  }, [cityOptions, citySearch]);

  const allFilteredSelected =
    filteredCityOptions.length > 0 && filteredCityOptions.every((c) => selectedCities.includes(c));

  function toggleCity(city) {
    setSelectedCities((prev) => (prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city]));
  }

  function toggleSelectAllFiltered() {
    setSelectedCities((prev) =>
      allFilteredSelected
        ? prev.filter((c) => !filteredCityOptions.includes(c))
        : Array.from(new Set([...prev, ...filteredCityOptions]))
    );
  }

  const locationLabel =
    selectedCities.length === 0
      ? "All"
      : selectedCities.length === 1
      ? selectedCities[0]
      : `${selectedCities.length} selected`;

  const filteredProperties = useMemo(() => {
    if (!properties) return null;
    const q = searchQuery.trim().toLowerCase();
    return properties.filter((p) => {
      const matchesQuery = !q || p.name.toLowerCase().includes(q);
      const matchesCity = selectedCities.length === 0 || selectedCities.includes(cityOf(p.location));
      return matchesQuery && matchesCity;
    });
  }, [properties, searchQuery, selectedCities]);

  const [member, setMember] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Sign-in popup: shown automatically once, dismissible with an X — never
  // forced. Once a guest closes it (or signs in), it stays closed for the
  // rest of the session.
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authFullName, setAuthFullName] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);

  useEffect(() => {
    fetchPropertiesList()
      .then(setProperties)
      .catch((e) => setLoadError(e.message));

    fetchCurrentMember()
      .then((m) => {
        setMember(m);
        // Only pop up the sign-in prompt for guests who aren't already
        // signed in — no point nagging someone who's already logged in.
        if (!m) setAuthPromptOpen(true);
      })
      .finally(() => setAuthChecked(true));
  }, []);

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError("");
    setAuthSubmitting(true);
    try {
      const m =
        authMode === "signup" ? await signUp(authEmail, authPassword, authFullName) : await login(authEmail, authPassword);
      setMember(m);
      setAuthPromptOpen(false);
    } catch (e2) {
      setAuthError(e2.message);
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleLogout() {
    await logout();
    setMember(null);
  }

  return (
    <div className="min-h-screen bg-stone-100">
      <header className="bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between">
        <div className="font-bold text-lg text-slate-900">RevX Hospitality</div>
        {authChecked && (
          <div className="text-sm">
            {member ? (
              <span className="flex items-center gap-3">
                <span className="text-gray-600">
                  Signed in as <span className="font-medium text-slate-900">{member.fullName || member.email}</span>
                </span>
                <button onClick={handleLogout} className="text-blue-700 underline underline-offset-2">
                  Log out
                </button>
              </span>
            ) : (
              <button onClick={() => setAuthPromptOpen(true)} className="text-blue-700 underline underline-offset-2">
                Sign in for member rates
              </button>
            )}
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Welcome to RevX Hospitality</h1>
        <p className="text-sm text-gray-500 mb-6">
          Pick a property to see live rooms, rates and availability from Stayflexi.
        </p>

        {loadError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4 mb-6">
            Couldn't load properties: {loadError}
          </div>
        )}

        {!properties && !loadError && <p className="text-sm text-gray-500">Loading properties…</p>}

        {properties && properties.length === 0 && (
          <p className="text-sm text-gray-500">No properties are connected yet.</p>
        )}

        {properties && properties.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-6">
            <div className="flex-1">
              <label className="block text-[11px] font-semibold tracking-wide text-slate-500 uppercase mb-1">
                Search
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by property name…"
                className="w-full border border-stone-300 rounded-md text-sm px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>

            <div className="relative sm:w-56" ref={locationRef}>
              <label className="block text-[11px] font-semibold tracking-wide text-slate-500 uppercase mb-1">
                Location
              </label>
              <button
                type="button"
                onClick={() => setLocationOpen((o) => !o)}
                className="w-full flex items-center justify-between border border-stone-300 rounded-md text-sm px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                <span className="truncate text-left">{locationLabel}</span>
                <span className="text-gray-400 ml-2 text-xs">▾</span>
              </button>

              {locationOpen && (
                <div className="absolute z-20 mt-2 w-72 right-0 sm:right-auto bg-white border border-stone-200 rounded-lg shadow-lg p-3">
                  <div className="relative mb-2">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                    <input
                      type="text"
                      value={citySearch}
                      onChange={(e) => setCitySearch(e.target.value)}
                      placeholder="Search location"
                      autoFocus
                      className="w-full border border-stone-300 rounded-md text-sm pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-200"
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto pr-1">
                    <label className="flex items-center gap-2 py-1.5 text-sm text-slate-700 cursor-pointer border-b border-stone-100 mb-1">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAllFiltered}
                        className="rounded border-stone-300"
                      />
                      Select All
                    </label>
                    {filteredCityOptions.length === 0 && (
                      <p className="text-xs text-gray-400 py-2">No matching locations</p>
                    )}
                    {filteredCityOptions.map((city) => (
                      <label key={city} className="flex items-center gap-2 py-1.5 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedCities.includes(city)}
                          onChange={() => toggleCity(city)}
                          className="rounded border-stone-300"
                        />
                        {city}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {properties && properties.length > 0 && filteredProperties.length === 0 && (
          <p className="text-sm text-gray-500 mb-6">No properties match your search.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProperties?.map((p) => (
            <a
              key={p.slug}
              href={`/property/${p.slug}`}
              className="block bg-white border border-stone-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="aspect-[4/3] bg-stone-200">
                {p.image ? (
                  <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                    No photo yet
                  </div>
                )}
              </div>
              <div className="p-4">
                <h2 className="font-semibold text-slate-900 mb-1">{p.name}</h2>
                {p.tagline && <p className="text-xs text-gray-500 mb-2 line-clamp-2">{p.tagline}</p>}
                {p.location && (
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    <span>📍</span> {p.location}
                  </p>
                )}
              </div>
            </a>
          ))}
        </div>
      </main>

      {authPromptOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-5 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm relative">
            <button
              onClick={() => setAuthPromptOpen(false)}
              aria-label="Close"
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-lg leading-none"
            >
              ✕
            </button>
            <h2 className="text-lg font-semibold text-slate-900 mb-1">Sign in for member rates</h2>
            <p className="text-sm text-gray-500 mb-4">
              Members get better rates on select promotions. Not required to browse or book.
            </p>
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
            <form onSubmit={handleAuthSubmit} className="flex flex-col gap-2.5">
              {authMode === "signup" && (
                <input
                  type="text"
                  placeholder="Full name"
                  value={authFullName}
                  onChange={(e) => setAuthFullName(e.target.value)}
                  className="border border-stone-300 rounded-md text-sm px-3 py-2"
                />
              )}
              <input
                type="email"
                placeholder="Email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="border border-stone-300 rounded-md text-sm px-3 py-2"
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="border border-stone-300 rounded-md text-sm px-3 py-2"
                required
                minLength={6}
              />
              {authError && <p className="text-xs text-red-600">{authError}</p>}
              <button
                type="submit"
                disabled={authSubmitting}
                className="bg-slate-800 hover:bg-slate-900 text-white text-sm py-2 rounded-md mt-1 disabled:opacity-60"
              >
                {authSubmitting ? "Please wait…" : authMode === "signup" ? "Create account" : "Log in"}
              </button>
            </form>
            <button
              onClick={() => setAuthPromptOpen(false)}
              className="text-xs text-gray-400 underline underline-offset-2 mt-3 block mx-auto"
            >
              Continue without signing in
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
