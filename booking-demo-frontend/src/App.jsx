import Landing from "./Landing.jsx";
import BookingEngine from "./BookingEngine.jsx";
import AdminBookings from "./AdminBookings.jsx";
import AdminPromotions from "./AdminPromotions.jsx";

// Simple path-based routing, no router library:
//   /                    -> the properties grid (Landing.jsx)
//   /embed/:slug         -> the exact same booking flow, meant to be put in
//                           an <iframe> on the property's own WordPress site
//   /admin, /admin/promotions -> password-gated hotel-side pages
export default function App() {
  const path = window.location.pathname;

  if (path.startsWith("/admin/promotions")) return <AdminPromotions />;
  if (path.startsWith("/admin")) return <AdminBookings />;

  const embedMatch = path.match(/^\/embed\/([^/]+)/);
  if (embedMatch) return <BookingEngine slug={embedMatch[1]} />;

  return <Landing />;
}
