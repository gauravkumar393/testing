require("dotenv").config();

// This is the server's "properties table". Each property has:
//  - public fields: safe to send to any visitor (name, branding, rooms)
//  - a `stayflexi` block: pmsId/hotelId/apiKey — NEVER sent to the frontend.
//
// riverline-gold and arogyadham-wellness have real credentials (from .env).
// The other entries below are old demo/mock hotels — not real Stayflexi
// properties, kept only for reference and excluded from the switcher by
// default (see listPublicProperties).

const PROPERTIES = {
  "riverline-gold": {
    slug: "riverline-gold",
    name: "Riverline Gold Resort",
    // Seen directly on Stayflexi's own booking-engine page for this hotel —
    // not available via the Channel Manager API itself.
    phone: "8279944325",
    email: "riverlinegoldresort@gmail.com",
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#1e3a5f", primaryDark: "#16293f", accentBg: "#eef2f8" },
    // Rooms/rates for this property are now fetched live from Stayflexi (see
    // stayflexi.js + server.js). fallbackRooms below is only used if that
    // live call fails (API down, bad credentials, network issue) — never
    // shown to guests unless the real API is unreachable.
    live: true,
    fallbackRooms: [
      { id: "12353", name: "A-Deluxe Room", ratePerNight: 5000, roomsLeft: 4, maxGuests: 3, maxChildren: 1 },
      { id: "12354", name: "B-Premium Room", ratePerNight: 3000, roomsLeft: 12, maxGuests: 3, maxChildren: 1 },
      { id: "12355", name: "C-Family Room", ratePerNight: 3500, roomsLeft: 4, maxGuests: 5, maxChildren: 1 },
      { id: "12356", name: "D-Suite Room", ratePerNight: 4500, roomsLeft: 0, maxGuests: 6, maxChildren: 1 },
    ],
    stayflexi: {
      pmsId: process.env.RIVERLINE_PMS_ID,
      hotelId: process.env.RIVERLINE_HOTEL_ID,
      apiKey: process.env.RIVERLINE_STAYFLEXI_API_KEY,
    },
  },

  "arogyadham-wellness": {
    slug: "arogyadham-wellness",
    name: "Arogyadham Wellness",
    // Not available via the Channel Manager API — fill in manually if you have it.
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#3a5f1e", primaryDark: "#293f16", accentBg: "#f2f8ee" },
    live: true,
    // No known-good room data for this hotel yet (haven't seen a successful
    // gethoteldetail response for it), so there's nothing real to fall back
    // to — empty on purpose rather than showing invented numbers. If the
    // live call fails, the room list will just be empty until this hotel's
    // credentials/data are confirmed working.
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.AROGYADHAM_PMS_ID,
      hotelId: process.env.AROGYADHAM_HOTEL_ID,
      apiKey: process.env.AROGYADHAM_STAYFLEXI_API_KEY,
    },
  },

  "oak-leaf": {
    slug: "oak-leaf",
    name: "Oak Leaf",
    // Not available via the Channel Manager API — fill in manually if you have it.
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#5f3a1e", primaryDark: "#3f2916", accentBg: "#f8f2ee" },
    live: true,
    fallbackRooms: [], // no known-good sample data for this hotel yet — see arogyadham-wellness note above
    stayflexi: {
      pmsId: process.env.OAKLEAF_PMS_ID,
      hotelId: process.env.OAKLEAF_HOTEL_ID,
      apiKey: process.env.OAKLEAF_STAYFLEXI_API_KEY,
    },
  },

  "shiv-shakti": {
    slug: "shiv-shakti",
    name: "Shiv Shakti",
    // Not available via the Channel Manager API — fill in manually if you have it.
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#8a4a1e", primaryDark: "#6b3a16", accentBg: "#fbf1e8" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.SHIVSHAKTI_PMS_ID,
      hotelId: process.env.SHIVSHAKTI_HOTEL_ID,
      apiKey: process.env.SHIVSHAKTI_STAYFLEXI_API_KEY,
    },
  },

  "rishikesh-grand": {
    slug: "rishikesh-grand",
    name: "Rishikesh Grand",
    // Not available via the Channel Manager API — fill in manually if you have it.
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#1e4a5f", primaryDark: "#16333f", accentBg: "#eef6f8" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.RISHIKESHGRAND_PMS_ID,
      hotelId: process.env.RISHIKESHGRAND_HOTEL_ID,
      apiKey: process.env.RISHIKESHGRAND_STAYFLEXI_API_KEY,
    },
  },

  "sunset-bay": {
    slug: "sunset-bay",
    name: "Sunset Bay Villas",
    subtitle: "Boutique beachfront villas — direct booking prototype.",
    colors: { primary: "#0f6e5c", primaryDark: "#0b4f42", accentBg: "#eaf6f2" },
    live: false,
    fallbackRooms: [
      { id: "sb-01", name: "Garden View Villa", ratePerNight: 6200, roomsLeft: 3, maxGuests: 2, maxChildren: 2 },
      { id: "sb-02", name: "Sea View Villa", ratePerNight: 9800, roomsLeft: 2, maxGuests: 3, maxChildren: 2 },
      { id: "sb-03", name: "Private Pool Villa", ratePerNight: 15500, roomsLeft: 1, maxGuests: 4, maxChildren: 2 },
      { id: "sb-04", name: "Family Beach House", ratePerNight: 21000, roomsLeft: 0, maxGuests: 6, maxChildren: 2 },
    ],
    stayflexi: { pmsId: "MOCK-0001", hotelId: "MOCK-H01", apiKey: "mock-key-not-real" },
  },

  "mountain-pines": {
    slug: "mountain-pines",
    name: "Mountain Pines Lodge",
    subtitle: "Hillside lodge rooms — direct booking prototype.",
    colors: { primary: "#7a2e2e", primaryDark: "#5c1f1f", accentBg: "#f8eeee" },
    live: false,
    fallbackRooms: [
      { id: "mp-01", name: "Standard Cabin", ratePerNight: 2800, roomsLeft: 6, maxGuests: 2, maxChildren: 2 },
      { id: "mp-02", name: "Fireplace Cabin", ratePerNight: 4200, roomsLeft: 3, maxGuests: 3, maxChildren: 2 },
      { id: "mp-03", name: "Loft Suite", ratePerNight: 5600, roomsLeft: 2, maxGuests: 4, maxChildren: 2 },
      { id: "mp-04", name: "Presidential Lodge", ratePerNight: 12000, roomsLeft: 0, maxGuests: 8, maxChildren: 2 },
    ],
    stayflexi: { pmsId: "MOCK-0002", hotelId: "MOCK-H02", apiKey: "mock-key-not-real" },
  },

  "palm-grove": {
    slug: "palm-grove",
    name: "Palm Grove Suites",
    subtitle: "Business-friendly city suites — direct booking prototype.",
    colors: { primary: "#2b4c7e", primaryDark: "#1c3459", accentBg: "#eaf0f8" },
    live: false,
    fallbackRooms: [
      { id: "pg-01", name: "Executive Room", ratePerNight: 3800, roomsLeft: 8, maxGuests: 2, maxChildren: 2 },
      { id: "pg-02", name: "Business Suite", ratePerNight: 5400, roomsLeft: 5, maxGuests: 2, maxChildren: 2 },
      { id: "pg-03", name: "Corner Suite", ratePerNight: 7200, roomsLeft: 2, maxGuests: 3, maxChildren: 2 },
      { id: "pg-04", name: "Penthouse Suite", ratePerNight: 13500, roomsLeft: 1, maxGuests: 4, maxChildren: 2 },
    ],
    stayflexi: { pmsId: "MOCK-0003", hotelId: "MOCK-H03", apiKey: "mock-key-not-real" },
  },

  "coral-reef": {
    slug: "coral-reef",
    name: "Coral Reef Resort",
    subtitle: "Island resort escape — direct booking prototype.",
    colors: { primary: "#0d7a7a", primaryDark: "#095656", accentBg: "#e6f5f5" },
    live: false,
    fallbackRooms: [
      { id: "cr-01", name: "Lagoon View Room", ratePerNight: 4600, roomsLeft: 7, maxGuests: 2, maxChildren: 2 },
      { id: "cr-02", name: "Overwater Bungalow", ratePerNight: 11800, roomsLeft: 3, maxGuests: 2, maxChildren: 2 },
      { id: "cr-03", name: "Beachfront Cottage", ratePerNight: 8900, roomsLeft: 4, maxGuests: 4, maxChildren: 2 },
      { id: "cr-04", name: "Reef Villa", ratePerNight: 17500, roomsLeft: 0, maxGuests: 5, maxChildren: 2 },
    ],
    stayflexi: { pmsId: "MOCK-0004", hotelId: "MOCK-H04", apiKey: "mock-key-not-real" },
  },

  "heritage-manor": {
    slug: "heritage-manor",
    name: "The Heritage Manor",
    subtitle: "Restored colonial-era manor — direct booking prototype.",
    colors: { primary: "#5c4a1e", primaryDark: "#3f3213", accentBg: "#f6f1e6" },
    live: false,
    fallbackRooms: [
      { id: "hm-01", name: "Classic Room", ratePerNight: 3200, roomsLeft: 9, maxGuests: 2, maxChildren: 2 },
      { id: "hm-02", name: "Heritage Room", ratePerNight: 4700, roomsLeft: 6, maxGuests: 3, maxChildren: 2 },
      { id: "hm-03", name: "Manor Suite", ratePerNight: 7600, roomsLeft: 2, maxGuests: 4, maxChildren: 2 },
      { id: "hm-04", name: "Royal Chamber", ratePerNight: 14200, roomsLeft: 1, maxGuests: 4, maxChildren: 2 },
    ],
    stayflexi: { pmsId: "MOCK-0005", hotelId: "MOCK-H05", apiKey: "mock-key-not-real" },
  },

  // --- 55 additional properties, added in bulk from the hotel list export ---

  "onyxx-nature-resort": {
    slug: "onyxx-nature-resort",
    name: "Onyxx Nature Resort",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#6e2a2a", primaryDark: "#421919", accentBg: "#f6e8e8" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.ONYXXNATURERESORT_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "pine-valley-gold-resort": {
    slug: "pine-valley-gold-resort",
    name: "Pine Valley Gold Resort",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#6e5f2a", primaryDark: "#423919", accentBg: "#f6f3e8" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.PINEVALLEYGOLDRESORT_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "mahamaya-resort": {
    slug: "mahamaya-resort",
    name: "Mahamaya Resort",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#486e2a", primaryDark: "#2b4219", accentBg: "#eef6e8" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.MAHAMAYARESORT_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "hotel-shiv-vilas-a-unit-of-ram-associates": {
    slug: "hotel-shiv-vilas-a-unit-of-ram-associates",
    name: "Hotel Shiv Vilas A unit of Ram Associates",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#2a6e41", primaryDark: "#194227", accentBg: "#e8f6ed" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.HOTELSHIVVILASAUNITOFRAMASSOCIATES_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "the-palm-aryan-gangtok": {
    slug: "the-palm-aryan-gangtok",
    name: "The Palm Aryan Gangtok",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#2a666e", primaryDark: "#193d42", accentBg: "#e8f4f6" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.THEPALMARYANGANGTOK_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "blue-jay-hostel": {
    slug: "blue-jay-hostel",
    name: "Blue Jay Hostel",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#2a306e", primaryDark: "#191d42", accentBg: "#e8eaf6" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.BLUEJAYHOSTEL_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "wanna-stay-rishikesh": {
    slug: "wanna-stay-rishikesh",
    name: "Wanna Stay Rishikesh",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#582a6e", primaryDark: "#351942", accentBg: "#f2e8f6" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.WANNASTAYRISHIKESH_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "wanna-stay-ayodhya": {
    slug: "wanna-stay-ayodhya",
    name: "Wanna Stay Ayodhya",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#6e2a4f", primaryDark: "#42192f", accentBg: "#f6e8f0" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.WANNASTAYAYODHYA_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "the-palm-aryan-pause-by-the-stream": {
    slug: "the-palm-aryan-pause-by-the-stream",
    name: "The Palm Aryan Pause by the Stream",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#6e3a2a", primaryDark: "#422319", accentBg: "#f6ece8" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.THEPALMARYANPAUSEBYTHESTREAM_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "hotel-js-inn-mussoorie": {
    slug: "hotel-js-inn-mussoorie",
    name: "Hotel JS Inn Mussoorie",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#6d6e2a", primaryDark: "#414219", accentBg: "#f6f6e8" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.HOTELJSINNMUSSOORIE_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "virat-shree-palace": {
    slug: "virat-shree-palace",
    name: "Virat Shree Palace",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#376e2a", primaryDark: "#214219", accentBg: "#ebf6e8" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.VIRATSHREEPALACE_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "vastu-homestay": {
    slug: "vastu-homestay",
    name: "Vastu Homestay",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#2a6e52", primaryDark: "#194231", accentBg: "#e8f6f0" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.VASTUHOMESTAY_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "raghuveer-sadan": {
    slug: "raghuveer-sadan",
    name: "Raghuveer Sadan",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#2a566e", primaryDark: "#193342", accentBg: "#e8f1f6" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.RAGHUVEERSADAN_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "afei-hostel": {
    slug: "afei-hostel",
    name: "AFEI HOSTEL",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#332a6e", primaryDark: "#1f1942", accentBg: "#eae8f6" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.AFEIHOSTEL_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "vrinda-tapovan-farmstay": {
    slug: "vrinda-tapovan-farmstay",
    name: "Vrinda Tapovan Farmstay",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#692a6e", primaryDark: "#3f1942", accentBg: "#f5e8f6" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.VRINDATAPOVANFARMSTAY_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "anandvan-jungle-resort-by-leela-resort": {
    slug: "anandvan-jungle-resort-by-leela-resort",
    name: "Anandvan Jungle Resort By Leela resort",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#6e2a3e", primaryDark: "#421925", accentBg: "#f6e8ec" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.ANANDVANJUNGLERESORTBYLEELARESORT_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "sg-royal-portico": {
    slug: "sg-royal-portico",
    name: "SG Royal Portico",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#6e4b2a", primaryDark: "#422d19", accentBg: "#f6efe8" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.SGROYALPORTICO_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "hotel-amadeus": {
    slug: "hotel-amadeus",
    name: "Hotel Amadeus",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#5d6e2a", primaryDark: "#374219", accentBg: "#f3f6e8" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.HOTELAMADEUS_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "atithya": {
    slug: "atithya",
    name: "Atithya",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#2a6e2c", primaryDark: "#19421a", accentBg: "#e8f6e9" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.ATITHYA_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "shri-govindam-banaras": {
    slug: "shri-govindam-banaras",
    name: "Shri Govindam Banaras",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#2a6e62", primaryDark: "#19423b", accentBg: "#e8f6f4" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.SHRIGOVINDAMBANARAS_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "wildline-gold-resort": {
    slug: "wildline-gold-resort",
    name: "Wildline Gold Resort",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#2a456e", primaryDark: "#192942", accentBg: "#e8eef6" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.WILDLINEGOLDRESORT_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "hyfa-continental": {
    slug: "hyfa-continental",
    name: "Hyfa Continental",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#442a6e", primaryDark: "#281942", accentBg: "#eee8f6" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.HYFACONTINENTAL_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "hotel-sun-village-by-palm-aryan": {
    slug: "hotel-sun-village-by-palm-aryan",
    name: "Hotel Sun Village By Palm Aryan",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#6e2a63", primaryDark: "#42193b", accentBg: "#f6e8f4" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.HOTELSUNVILLAGEBYPALMARYAN_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "snapstayz": {
    slug: "snapstayz",
    name: "SnapStayz",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#6e2a2e", primaryDark: "#42191b", accentBg: "#f6e8e9" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.SNAPSTAYZ_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "hotel-luxeevista-by-navodayans-by-dalhousie": {
    slug: "hotel-luxeevista-by-navodayans-by-dalhousie",
    name: "Hotel Luxeevista By Navodayans By Dalhousie",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#6e5b2a", primaryDark: "#423619", accentBg: "#f6f2e8" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.HOTELLUXEEVISTABYNAVODAYANSBYDALHOUSIE_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "the-montara": {
    slug: "the-montara",
    name: "The Montara",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#4c6e2a", primaryDark: "#2d4219", accentBg: "#eff6e8" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.THEMONTARA_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "rs-resort": {
    slug: "rs-resort",
    name: "RS Resort",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#2a6e3d", primaryDark: "#194224", accentBg: "#e8f6ec" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.RSRESORT_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "murli-manohar-palace": {
    slug: "murli-manohar-palace",
    name: "Murli Manohar Palace",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#2a6a6e", primaryDark: "#194042", accentBg: "#e8f5f6" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.MURLIMANOHARPALACE_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "the-neeraj-ganga-rani-mahal": {
    slug: "the-neeraj-ganga-rani-mahal",
    name: "The Neeraj Ganga Rani Mahal",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#2a356e", primaryDark: "#191f42", accentBg: "#e8ebf6" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.THENEERAJGANGARANIMAHAL_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "shree-sita-sadan": {
    slug: "shree-sita-sadan",
    name: "Shree Sita Sadan",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#542a6e", primaryDark: "#321942", accentBg: "#f1e8f6" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.SHREESITASADAN_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "the-neeraj-marine-ganga": {
    slug: "the-neeraj-marine-ganga",
    name: "The Neeraj Marine Ganga",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#6e2a53", primaryDark: "#421932", accentBg: "#f6e8f1" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.THENEERAJMARINEGANGA_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "the-neeraj-ganga-divine-stay-luxury-2-bhk": {
    slug: "the-neeraj-ganga-divine-stay-luxury-2-bhk",
    name: "The Neeraj Ganga Divine Stay Luxury 2 BHK",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#6e362a", primaryDark: "#422019", accentBg: "#f6ebe8" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.THENEERAJGANGADIVINESTAYLUXURY2BHK_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "mussoorie-residency": {
    slug: "mussoorie-residency",
    name: "Mussoorie Residency",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#6e6c2a", primaryDark: "#424019", accentBg: "#f6f6e8" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.MUSSOORIERESIDENCY_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "hotel-winter-line-inn-near-st-francis-monastery": {
    slug: "hotel-winter-line-inn-near-st-francis-monastery",
    name: "Hotel Winter Line Inn Near St Francis Monastery",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#3b6e2a", primaryDark: "#234219", accentBg: "#ecf6e8" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.HOTELWINTERLINEINNNEARSTFRANCISMONASTERY_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "the-cedar-castle-satkhol-mukteshwar": {
    slug: "the-cedar-castle-satkhol-mukteshwar",
    name: "The Cedar Castle Satkhol Mukteshwar",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#2a6e4d", primaryDark: "#19422e", accentBg: "#e8f6ef" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.THECEDARCASTLESATKHOLMUKTESHWAR_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "the-neeraj-ganga-rajmahal-wellness-dream": {
    slug: "the-neeraj-ganga-rajmahal-wellness-dream",
    name: "The Neeraj Ganga Rajmahal Wellness Dream",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#2a5a6e", primaryDark: "#193642", accentBg: "#e8f2f6" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.THENEERAJGANGARAJMAHALWELLNESSDREAM_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "manglam-inn": {
    slug: "manglam-inn",
    name: "MANGLAM INN",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#2f2a6e", primaryDark: "#1c1942", accentBg: "#e9e8f6" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.MANGLAMINN_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "hotel-samrat-on-mall-road": {
    slug: "hotel-samrat-on-mall-road",
    name: "Hotel Samrat On Mall Road",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#652a6e", primaryDark: "#3c1942", accentBg: "#f4e8f6" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.HOTELSAMRATONMALLROAD_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "rockland-residency": {
    slug: "rockland-residency",
    name: "Rockland Residency",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#6e2a42", primaryDark: "#421928", accentBg: "#f6e8ed" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.ROCKLANDRESIDENCY_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "wraveller-inn-rishikesh": {
    slug: "wraveller-inn-rishikesh",
    name: "Wraveller Inn Rishikesh",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#6e462a", primaryDark: "#422a19", accentBg: "#f6eee8" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.WRAVELLERINNRISHIKESH_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "wraveller-mussoorie": {
    slug: "wraveller-mussoorie",
    name: "Wraveller Mussoorie",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#616e2a", primaryDark: "#3a4219", accentBg: "#f3f6e8" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.WRAVELLERMUSSOORIE_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "pushkar-fort-ghanghas-hotels-pvt-ltd": {
    slug: "pushkar-fort-ghanghas-hotels-pvt-ltd",
    name: "PUSHKAR FORT GHANGHAS HOTELS PVT LTD",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#2b6e2a", primaryDark: "#1a4219", accentBg: "#e9f6e8" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.PUSHKARFORTGHANGHASHOTELSPVTLTD_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "comfort-stay-near-airport": {
    slug: "comfort-stay-near-airport",
    name: "Comfort Stay Near Airport",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#2a6e5e", primaryDark: "#194238", accentBg: "#e8f6f3" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.COMFORTSTAYNEARAIRPORT_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "the-neeraj-ganga-cottages": {
    slug: "the-neeraj-ganga-cottages",
    name: "The Neeraj Ganga Cottages",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#2a496e", primaryDark: "#192c42", accentBg: "#e8eff6" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.THENEERAJGANGACOTTAGES_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "euphoric-river-resort": {
    slug: "euphoric-river-resort",
    name: "Euphoric River Resort",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#402a6e", primaryDark: "#261942", accentBg: "#ede8f6" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.EUPHORICRIVERRESORT_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "hotel-woods-view": {
    slug: "hotel-woods-view",
    name: "Hotel woods view",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#6e2a68", primaryDark: "#42193e", accentBg: "#f6e8f5" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.HOTELWOODSVIEW_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "hotel-shiva-lake-near-mussoorie-lake": {
    slug: "hotel-shiva-lake-near-mussoorie-lake",
    name: "Hotel Shiva Lake Near Mussoorie Lake",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#6e2a32", primaryDark: "#42191e", accentBg: "#f6e8ea" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.HOTELSHIVALAKENEARMUSSOORIELAKE_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "the-maheshwar-hotel": {
    slug: "the-maheshwar-hotel",
    name: "The Maheshwar Hotel",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#6e572a", primaryDark: "#423419", accentBg: "#f6f1e8" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.THEMAHESHWARHOTEL_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "hotel-park-wood": {
    slug: "hotel-park-wood",
    name: "HOTEL PARK WOOD",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#506e2a", primaryDark: "#304219", accentBg: "#f0f6e8" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.HOTELPARKWOOD_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "the-sona-heli-resort": {
    slug: "the-sona-heli-resort",
    name: "The sona heli resort",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#2a6e39", primaryDark: "#194222", accentBg: "#e8f6eb" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.THESONAHELIRESORT_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "vasu-palace-a-unit-of-apmt-hospitality-pvt-ltd": {
    slug: "vasu-palace-a-unit-of-apmt-hospitality-pvt-ltd",
    name: "Vasu Palace A Unit Of Apmt Hospitality Pvt Ltd",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#2a6e6e", primaryDark: "#194242", accentBg: "#e8f6f6" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.VASUPALACEAUNITOFAPMTHOSPITALITYPVTLTD_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "euphoric-tiger-resort": {
    slug: "euphoric-tiger-resort",
    name: "Euphoric Tiger Resort",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#2a396e", primaryDark: "#192242", accentBg: "#e8ebf6" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.EUPHORICTIGERRESORT_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "winterline-gold-resort": {
    slug: "winterline-gold-resort",
    name: "Winterline Gold Resort",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#502a6e", primaryDark: "#301942", accentBg: "#f0e8f6" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.WINTERLINEGOLDRESORT_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "hotel-manas-inn": {
    slug: "hotel-manas-inn",
    name: "Hotel Manas Inn",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#6e2a57", primaryDark: "#421934", accentBg: "#f6e8f1" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.HOTELMANASINN_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },

  "the-maple-woods-resort": {
    slug: "the-maple-woods-resort",
    name: "The Maple Woods Resort",
    phone: null,
    email: null,
    subtitle: "Live rooms, rates and availability from the real Stayflexi Channel Manager API.",
    colors: { primary: "#6e322a", primaryDark: "#421e19", accentBg: "#f6eae8" },
    live: true,
    fallbackRooms: [],
    stayflexi: {
      pmsId: process.env.STAYFLEXI_PMS_ID,
      hotelId: process.env.THEMAPLEWOODSRESORT_HOTEL_ID,
      apiKey: process.env.STAYFLEXI_API_KEY,
    },
  },
};

const DEFAULT_SLUG = "riverline-gold";

function getPropertyRaw(slug) {
  return PROPERTIES[slug] || null;
}

// Strips the `stayflexi` credentials block and the internal `fallbackRooms`/
// `live` bookkeeping fields — this is the ONLY version of a property that
// should ever be sent in an HTTP response to the browser. `rooms` is always
// attached separately by the route handler (live-fetched or fallback).
// Strips the `stayflexi` credentials block and the internal `fallbackRooms`
// bookkeeping field — this is the ONLY version of a property that should
// ever be sent in an HTTP response to the browser. `rooms` is always
// attached separately by the route handler (live-fetched or fallback).
// `live` IS kept (not sensitive) so the frontend can honestly label demo
// properties as demo rather than implying they're all real listings.
function toPublicProperty(prop) {
  if (!prop) return null;
  const { stayflexi, fallbackRooms, ...publicFields } = prop;
  return publicFields;
}

// includeMock=false shows only properties actually connected to Stayflexi
// (live: true). Defaults to true (show everyone) — flip the default to
// false once there's more than one real connected property and the demo
// ones should stop appearing as options.
// includeMock=true also returns the fictional demo properties. Defaults to
// false — only properties actually connected to Stayflexi (live: true) are
// listed, since those are the only real hotels.
function listPublicProperties(includeMock = false) {
  return Object.values(PROPERTIES)
    .filter((prop) => includeMock || prop.live)
    .map(toPublicProperty);
}

module.exports = {
  DEFAULT_SLUG,
  getPropertyRaw,
  toPublicProperty,
  listPublicProperties,
};
