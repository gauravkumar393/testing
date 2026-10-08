# booking-demo-backend

A small Express server that holds property data and booking submissions
server-side, so credentials (and full booking data) never reach the browser.

## Run it

```
npm install
npm start
```

Runs on http://localhost:4000 by default (see `.env`, `PORT`).

## What's server-only vs public

`properties.js` has two parts per property:
- Public fields (name, branding, room list/rates) — these get sent to the
  frontend via `GET /api/properties/:slug`.
- A `stayflexi` block (pmsId, hotelId, apiKey) — stripped out before any
  response is sent. It's only used server-side (e.g. when this backend later
  makes real Stayflexi API calls).

`.env` holds the one real credential set (for `riverline-gold`). It's
git-ignored — never commit it, never send its contents to the frontend.

## Endpoints

- `GET /api/properties` — list of all properties (public fields only)
- `GET /api/properties/:slug` — one property's public details
- `GET /api/properties/:slug/bookings` — all bookings submitted for that property
- `POST /api/properties/:slug/bookings` — submit a booking
  - body: `{ fullName, email, phone, roomId, checkin, checkout, nights }`
  - price is computed server-side from the room's real rate, never trusted from the client
- `DELETE /api/properties/:slug/bookings` — clear a property's bookings (demo only, no auth)

Bookings are stored in `bookings-store.json` (created automatically, git-ignored).
This is a placeholder for a real database (Postgres/SQLite/etc.) later.
