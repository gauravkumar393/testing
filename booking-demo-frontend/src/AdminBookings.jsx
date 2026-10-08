import { useState, useEffect } from "react";
import { fetchPropertiesList, fetchBookings, clearBookings } from "./api.js";

function inr(n) {
  return n.toLocaleString("en-IN");
}

export default function AdminBookings() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState("");

  const [properties, setProperties] = useState([]);
  const [slug, setSlug] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchPropertiesList()
      .then((list) => {
        setProperties(list);
        if (list.length > 0) setSlug(list[0].slug);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!authed || !slug) return;
    setLoading(true);
    setLoadError("");
    fetchBookings(slug, password)
      .then((list) => setBookings(list))
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [authed, slug]);

  function handleLogin(e) {
    e.preventDefault();
    if (!slug) return;
    setAuthError("");
    fetchBookings(slug, password)
      .then((list) => {
        setAuthed(true);
        setBookings(list);
      })
      .catch((e) => setAuthError(e.message));
  }

  async function handleClear() {
    if (!window.confirm(`Clear all saved bookings for ${slug}?`)) return;
    try {
      await clearBookings(slug, password);
      setBookings([]);
    } catch (e) {
      setLoadError(e.message);
    }
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center px-5">
        <form
          onSubmit={handleLogin}
          className="bg-white border border-stone-300 rounded-lg p-6 w-full max-w-sm"
        >
          <h1 className="text-lg font-semibold text-slate-900 mb-1">Admin — bookings</h1>
          <p className="text-sm text-gray-500 mb-4">
            Not a public page. Password required to view guest data.
          </p>
          <label className="block text-xs text-gray-700 mb-1.5">Admin password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-2.5 py-2 border border-stone-300 rounded-md text-sm text-slate-900 mb-3"
            autoFocus
          />
          {authError && <p className="text-sm text-red-600 mb-3">{authError}</p>}
          <button
            type="submit"
            className="bg-slate-800 hover:bg-slate-900 text-white text-sm px-4 py-2 rounded-md w-full"
          >
            View bookings
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 px-5 py-8 flex justify-center">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-slate-900">Admin — bookings</h1>
          <a href="/admin/promotions" className="text-xs text-blue-700 underline underline-offset-2">
            Promotions →
          </a>
        </div>

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <label className="text-sm text-gray-700">Property:</label>
          <select
            value={slug || ""}
            onChange={(e) => setSlug(e.target.value)}
            className="border border-stone-300 rounded px-2 py-1.5 text-sm"
          >
            {properties.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
          {bookings.length > 0 && (
            <button
              onClick={handleClear}
              className="text-xs text-red-600 underline underline-offset-2 ml-auto"
            >
              Clear saved data for this property
            </button>
          )}
        </div>

        {loadError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4 mb-4">
            {loadError}
          </div>
        )}

        <div className="bg-white border border-stone-300 rounded-lg p-4 overflow-x-auto">
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : bookings.length === 0 ? (
            <p className="text-sm text-gray-500">No bookings saved yet for this property.</p>
          ) : (
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-300 text-gray-500">
                  <th className="py-2 pr-3">Submitted</th>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Phone</th>
                  <th className="py-2 pr-3">Room</th>
                  <th className="py-2 pr-3">Dates</th>
                  <th className="py-2 pr-3">Nights</th>
                  <th className="py-2 pr-3">Adults</th>
                  <th className="py-2 pr-3">Promotion</th>
                  <th className="py-2 pr-3">Total</th>
                  <th className="py-2 pr-3">Reference</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.ref} className="border-b border-stone-100 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {new Date(b.submittedAt).toLocaleString("en-IN")}
                    </td>
                    <td className="py-2 pr-3">{b.fullName}</td>
                    <td className="py-2 pr-3">{b.email}</td>
                    <td className="py-2 pr-3">{b.phone}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {b.items
                        ? b.items.map((it, i) => (
                            <div key={i}>
                              {it.roomName} — {it.ratePlanName}
                            </div>
                          ))
                        : b.room}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {b.checkin} → {b.checkout}
                    </td>
                    <td className="py-2 pr-3">{b.nights}</td>
                    <td className="py-2 pr-3">{b.adults ?? "—"}</td>
                    <td className="py-2 pr-3">
                      {b.appliedPromotion ? (
                        <span className="text-green-700">
                          {b.appliedPromotion.name} (−₹{inr(b.discountAmount || 0)})
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">₹{inr(b.total)}</td>
                    <td className="py-2 pr-3 font-mono">{b.ref.slice(0, 8)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          This page is not linked from the public site. The password is only checked
          against the backend's ADMIN_PASSWORD — replace with real authentication
          before this is a real product.
        </p>
      </div>
    </div>
  );
}
