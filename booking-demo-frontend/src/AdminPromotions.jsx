import { useState, useEffect } from "react";
import {
  fetchPropertiesList,
  fetchPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
} from "./api.js";

// Blank form matching the condition schema: Promotion Name, Stay Dates,
// Book Dates, Stay & Book Date Difference (as a min/max range), Length of
// Stay (as a min/max range), and No. of Adults — plus two discount
// percentages (one for logged-out guests, one for members/logged-in) and
// an active toggle.
const BLANK_FORM = {
  name: "",
  active: true,
  discountPercentGuest: "",
  discountPercentMember: "",
  stayFrom: "",
  stayTo: "",
  bookFrom: "",
  bookTo: "",
  minAdvanceDays: "",
  maxAdvanceDays: "",
  minNights: "",
  maxNights: "",
  minAdults: "",
};

function toFormFromPromo(p) {
  return {
    name: p.name ?? "",
    active: p.active ?? true,
    discountPercentGuest: p.discountPercentGuest ?? "",
    discountPercentMember: p.discountPercentMember ?? "",
    stayFrom: p.stayFrom ?? "",
    stayTo: p.stayTo ?? "",
    bookFrom: p.bookFrom ?? "",
    bookTo: p.bookTo ?? "",
    minAdvanceDays: p.minAdvanceDays ?? "",
    maxAdvanceDays: p.maxAdvanceDays ?? "",
    minNights: p.minNights ?? "",
    maxNights: p.maxNights ?? "",
    minAdults: p.minAdults ?? "",
  };
}

// Turns "" back into null for optional numeric/date fields before sending
// to the backend, so an empty field really means "no restriction" rather
// than the string "".
function formToPayload(form) {
  const blankToNull = (v) => (v === "" ? null : v);
  const blankToNullNum = (v) => (v === "" ? null : Number(v));
  return {
    name: form.name,
    active: form.active,
    discountPercentGuest: Number(form.discountPercentGuest) || 0,
    discountPercentMember: Number(form.discountPercentMember) || 0,
    stayFrom: blankToNull(form.stayFrom),
    stayTo: blankToNull(form.stayTo),
    bookFrom: blankToNull(form.bookFrom),
    bookTo: blankToNull(form.bookTo),
    minAdvanceDays: blankToNullNum(form.minAdvanceDays),
    maxAdvanceDays: blankToNullNum(form.maxAdvanceDays),
    minNights: blankToNullNum(form.minNights),
    maxNights: blankToNullNum(form.maxNights),
    minAdults: blankToNullNum(form.minAdults),
  };
}

export default function AdminPromotions() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState("");

  const [properties, setProperties] = useState([]);
  const [slug, setSlug] = useState(null);
  const [promotions, setPromotions] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);

  const [editingId, setEditingId] = useState(null); // null = not editing; "new" = creating
  const [form, setForm] = useState(BLANK_FORM);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    fetchPropertiesList()
      .then((list) => {
        setProperties(list);
        if (list.length > 0) setSlug(list[0].slug);
      })
      .catch(() => {});
  }, []);

  function loadPromotions() {
    if (!authed || !slug) return;
    setLoading(true);
    setLoadError("");
    fetchPromotions(slug, password)
      .then((list) => setPromotions(list))
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(loadPromotions, [authed, slug]);

  function handleLogin(e) {
    e.preventDefault();
    if (!slug) return;
    setAuthError("");
    fetchPromotions(slug, password)
      .then((list) => {
        setAuthed(true);
        setPromotions(list);
      })
      .catch((e) => setAuthError(e.message));
  }

  function startCreate() {
    setForm(BLANK_FORM);
    setEditingId("new");
    setSaveError("");
  }
  function startEdit(promo) {
    setForm(toFormFromPromo(promo));
    setEditingId(promo.id);
    setSaveError("");
  }
  function cancelEdit() {
    setEditingId(null);
    setSaveError("");
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaveError("");
    try {
      const payload = formToPayload(form);
      if (editingId === "new") {
        await createPromotion(slug, password, payload);
      } else {
        await updatePromotion(slug, password, editingId, payload);
      }
      setEditingId(null);
      loadPromotions();
    } catch (e2) {
      setSaveError(e2.message);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this promotion?")) return;
    try {
      await deletePromotion(slug, password, id);
      loadPromotions();
    } catch (e) {
      setLoadError(e.message);
    }
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center px-5">
        <form onSubmit={handleLogin} className="bg-white border border-stone-300 rounded-lg p-6 w-full max-w-sm">
          <h1 className="text-lg font-semibold text-slate-900 mb-1">Admin — promotions</h1>
          <p className="text-sm text-gray-500 mb-4">Not a public page. Password required to manage discounts.</p>
          <label className="block text-xs text-gray-700 mb-1.5">Admin password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-2.5 py-2 border border-stone-300 rounded-md text-sm text-slate-900 mb-3"
            autoFocus
          />
          {authError && <p className="text-sm text-red-600 mb-3">{authError}</p>}
          <button type="submit" className="bg-slate-800 hover:bg-slate-900 text-white text-sm px-4 py-2 rounded-md w-full">
            View promotions
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 px-5 py-8 flex justify-center">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold text-slate-900">Admin — promotions</h1>
          <a href="/admin" className="text-xs text-blue-700 underline underline-offset-2">
            ← Bookings
          </a>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          These discounts are ours to define — Stayflexi's API doesn't expose promotions, so these rules
          live entirely here and apply on top of Stayflexi's live rates.
        </p>

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <label className="text-sm text-gray-700">Property:</label>
          <select
            value={slug || ""}
            onChange={(e) => {
              setSlug(e.target.value);
              setEditingId(null);
            }}
            className="border border-stone-300 rounded px-2 py-1.5 text-sm"
          >
            {properties.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            onClick={startCreate}
            className="ml-auto bg-slate-800 hover:bg-slate-900 text-white text-xs px-3 py-1.5 rounded-md"
          >
            + New promotion
          </button>
        </div>

        {loadError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4 mb-4">{loadError}</div>
        )}

        {editingId && (
          <form onSubmit={handleSave} className="bg-white border border-stone-300 rounded-lg p-4 mb-4">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">
              {editingId === "new" ? "New promotion" : "Edit promotion"}
            </h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Field label="Promotion Name" span2>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input"
                  placeholder="Diwali Sale"
                  required
                />
              </Field>

              <Field label="Discount for guests (not logged in) — %">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.discountPercentGuest}
                  onChange={(e) => setForm({ ...form, discountPercentGuest: e.target.value })}
                  className="input"
                  placeholder="e.g. 30"
                  required
                />
              </Field>
              <Field label="Discount for members (logged in) — %">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.discountPercentMember}
                  onChange={(e) => setForm({ ...form, discountPercentMember: e.target.value })}
                  className="input"
                  placeholder="e.g. 40"
                  required
                />
              </Field>

              <Field label="Stay Dates — from">
                <input type="date" value={form.stayFrom} onChange={(e) => setForm({ ...form, stayFrom: e.target.value })} className="input" />
              </Field>
              <Field label="Stay Dates — to">
                <input type="date" value={form.stayTo} onChange={(e) => setForm({ ...form, stayTo: e.target.value })} className="input" />
              </Field>

              <Field label="Book Dates — from">
                <input type="date" value={form.bookFrom} onChange={(e) => setForm({ ...form, bookFrom: e.target.value })} className="input" />
              </Field>
              <Field label="Book Dates — to">
                <input type="date" value={form.bookTo} onChange={(e) => setForm({ ...form, bookTo: e.target.value })} className="input" />
              </Field>

              <Field label="Stay & Book Date Difference — min days advance">
                <input
                  type="number"
                  min="0"
                  value={form.minAdvanceDays}
                  onChange={(e) => setForm({ ...form, minAdvanceDays: e.target.value })}
                  className="input"
                  placeholder="e.g. 10"
                />
              </Field>
              <Field label="Stay & Book Date Difference — max days advance">
                <input
                  type="number"
                  min="0"
                  value={form.maxAdvanceDays}
                  onChange={(e) => setForm({ ...form, maxAdvanceDays: e.target.value })}
                  className="input"
                  placeholder="e.g. 60"
                />
              </Field>

              <Field label="Length of Stay — min nights">
                <input
                  type="number"
                  min="0"
                  value={form.minNights}
                  onChange={(e) => setForm({ ...form, minNights: e.target.value })}
                  className="input"
                  placeholder="e.g. 2"
                />
              </Field>
              <Field label="Length of Stay — max nights">
                <input
                  type="number"
                  min="0"
                  value={form.maxNights}
                  onChange={(e) => setForm({ ...form, maxNights: e.target.value })}
                  className="input"
                  placeholder="e.g. 7"
                />
              </Field>

              <Field label="No. of Adults (min)">
                <input
                  type="number"
                  min="0"
                  value={form.minAdults}
                  onChange={(e) => setForm({ ...form, minAdults: e.target.value })}
                  className="input"
                  placeholder="e.g. 3"
                />
              </Field>
              <Field label="Active">
                <label className="flex items-center gap-2 text-sm text-slate-900 h-[34px]">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                  Promotion is live
                </label>
              </Field>
            </div>

            {saveError && <p className="text-sm text-red-600 mt-3">{saveError}</p>}

            <div className="flex gap-2 mt-4">
              <button type="submit" className="bg-slate-800 hover:bg-slate-900 text-white text-xs px-4 py-2 rounded-md">
                Save
              </button>
              <button type="button" onClick={cancelEdit} className="text-xs text-gray-600 px-4 py-2">
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="bg-white border border-stone-300 rounded-lg p-4 overflow-x-auto">
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : promotions.length === 0 ? (
            <p className="text-sm text-gray-500">No promotions set up yet for this property.</p>
          ) : (
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-300 text-gray-500">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Guest %</th>
                  <th className="py-2 pr-3">Member %</th>
                  <th className="py-2 pr-3">Stay dates</th>
                  <th className="py-2 pr-3">Book dates</th>
                  <th className="py-2 pr-3">Advance days</th>
                  <th className="py-2 pr-3">Nights</th>
                  <th className="py-2 pr-3">Min adults</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {promotions.map((p) => (
                  <tr key={p.id} className="border-b border-stone-100 align-top">
                    <td className="py-2 pr-3 font-medium text-slate-900">{p.name}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{p.discountPercentGuest ?? 0}%</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{p.discountPercentMember ?? 0}%</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {p.stayFrom || "—"} → {p.stayTo || "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {p.bookFrom || "—"} → {p.bookTo || "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {p.minAdvanceDays ?? "—"}–{p.maxAdvanceDays ?? "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {p.minNights ?? "—"}–{p.maxNights ?? "—"}
                    </td>
                    <td className="py-2 pr-3">{p.minAdults ?? "—"}</td>
                    <td className="py-2 pr-3">
                      {p.active ? (
                        <span className="text-green-700">Active</span>
                      ) : (
                        <span className="text-gray-400">Paused</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <button onClick={() => startEdit(p)} className="text-blue-700 underline underline-offset-2 mr-3">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(p.id)} className="text-red-600 underline underline-offset-2">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          A blank date/number field means that condition isn't restricted — e.g. leaving "Stay Dates" blank
          applies the promotion to bookings for any stay date.
        </p>
      </div>

      <style>{`.input { border: 1px solid #d6d3d1; border-radius: 6px; padding: 6px 8px; width: 100%; font-size: 13px; }`}</style>
    </div>
  );
}

function Field({ label, span2, children }) {
  return (
    <div className={span2 ? "col-span-2" : ""}>
      <label className="block text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
