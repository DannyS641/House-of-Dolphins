import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import QRCode from "react-qr-code";
import { createClient, type User } from "@supabase/supabase-js";

type Plan = "Hourly" | "Daily" | "Weekly";

type Court = {
  id: string;
  name: string;
  slug?: string | null;
  hero_image?: string | null;
  card_image?: string | null;
  hourly_rate: number;
  daily_rate: number;
  weekly_rate: number;
  is_active?: boolean | null;
  image?: string;
};

type Promo = {
  id: string;
  code: string;
  type: "percent" | "fixed";
  value: number;
  is_active?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  max_redemptions?: number | null;
  redeemed_count?: number | null;
  min_amount?: number | null;
};

type Booking = {
  id: string;
  court_id: string;
  plan: Plan;
  start_date: string;
  end_date: string;
  start_time: string | null;
  hours: number | null;
  base_amount: number;
  discount_amount: number;
  total_amount: number;
  promo_code_id: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  event_type: string | null;
  notes: string | null;
  status: string;
  created_at?: string | null;
};

type AdminNotice = {
  id: string;
  message: string;
  meta?: string;
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const NGN = new Intl.NumberFormat("en-NG");

const formatNaira = (amount: number) => `NGN ${NGN.format(amount)}`;

const todayISO = () => new Date().toISOString().slice(0, 10);

const toMinutes = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const daysBetweenInclusive = (startISO: string, endISO: string) => {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const ms = end.getTime() - start.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, days);
};

const COURTS_BUCKET = "courts";
const COURT_IMAGE_OVERRIDES: Record<string, string> = {
  "indoor-arena": "/indoor%20arena.jpg",
  "airport-view": "/airport.jpg",
};
const COURT_PRICE_OVERRIDES: Record<
  string,
  Partial<Pick<Court, "hourly_rate" | "daily_rate" | "weekly_rate">>
> = {
  "indoor-arena": { hourly_rate: 30000 },
};

const normalizeCourtImagePath = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http")) return trimmed;
  const cleaned = trimmed.replace(/^\/+/, "");
  const bucketPrefix = `${COURTS_BUCKET}/`;
  return cleaned.startsWith(bucketPrefix)
    ? cleaned.slice(bucketPrefix.length)
    : cleaned;
};

const resolveCourtImage = (court: Court) => {
  const override = COURT_IMAGE_OVERRIDES[court.id];
  if (override) return override;
  const raw = court.card_image || court.hero_image || court.image || "";
  const normalized = normalizeCourtImagePath(raw);
  if (!normalized) return "";
  if (normalized.startsWith("http")) return normalized;
  if (!supabase) return normalized;
  const { data } = supabase.storage
    .from(COURTS_BUCKET)
    .getPublicUrl(normalized);
  return data.publicUrl.replace(/ /g, "%20");
};

const fallbackCourts: Court[] = [
  {
    id: "indoor-arena",
    name: "Indoor Arena",
    hourly_rate: 30000,
    daily_rate: 140000,
    weekly_rate: 850000,
    image: "/indoor%20arena.jpg",
  },
  {
    id: "lounge",
    name: "Lounge",
    hourly_rate: 12000,
    daily_rate: 90000,
    weekly_rate: 520000,
    image:
      "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "gym",
    name: "Gym (Group Workouts)",
    hourly_rate: 10000,
    daily_rate: 75000,
    weekly_rate: 450000,
    image:
      "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "airport-view",
    name: "Airport View",
    hourly_rate: 15000,
    daily_rate: 120000,
    weekly_rate: 700000,
    image: "/airport.jpg",
  },
  {
    id: "barbershop",
    name: "Barbershop",
    hourly_rate: 12000,
    daily_rate: 82000,
    weekly_rate: 480000,
    image:
      "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "upskill",
    name: "Upskill Center",
    hourly_rate: 14000,
    daily_rate: 98000,
    weekly_rate: 560000,
    image:
      "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=800&q=80",
  },
];

const getFallbackCourtImage = (court: Court) => {
  const direct = court.image?.trim();
  if (direct) return direct;
  const byId = fallbackCourts.find((item) => item.id === court.id);
  if (byId?.image) return byId.image;
  const byName = fallbackCourts.find((item) =>
    court.name.toLowerCase().includes(item.name.toLowerCase()),
  );
  return (
    byName?.image ??
    "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=800&q=80"
  );
};

const usageItems = [
  {
    title: "Tournaments",
    copy: "League games, finals, and showcases.",
    icon: "trophy",
  },
  {
    title: "School events",
    copy: "Sports days, inter-house, assemblies.",
    icon: "school",
  },
  {
    title: "Weddings",
    copy: "Reception layouts, vendor staging.",
    icon: "rings",
  },
  {
    title: "Funerals",
    copy: "Overflow seating, organized gathering.",
    icon: "candle",
  },
  {
    title: "Corporate events",
    copy: "Team bonding, product showcases.",
    icon: "briefcase",
  },
];

const usageIcon = (name: string) => {
  switch (name) {
    case "trophy":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
          <path
            d="M7 4h10v2h3a1 1 0 0 1 1 1c0 3.866-2.239 6-6 6a4.99 4.99 0 0 1-2 1.58V17h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3v-2.42A4.99 4.99 0 0 1 9 13C5.239 13 3 10.866 3 7a1 1 0 0 1 1-1h3V4Zm-2 4c.337 1.967 1.704 3 4 3V8H5Zm10 3c2.296 0 3.663-1.033 4-3h-4v3Z"
            fill="currentColor"
          />
        </svg>
      );
    case "school":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
          <path
            d="M12 3 1 8l11 5 9-4.09V17h2V8L12 3Zm-6.5 9.5V16c0 1.933 3.134 3.5 6.5 3.5s6.5-1.567 6.5-3.5v-3.5l-6.5 3-6.5-3Z"
            fill="currentColor"
          />
        </svg>
      );
    case "rings":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
          <path
            d="M7 7a5 5 0 1 0 4.9 6h2.2A5 5 0 1 0 17 7a5 5 0 0 0-4.9 4H9.9A5 5 0 0 0 7 7Zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm10 0a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"
            fill="currentColor"
          />
        </svg>
      );
    case "candle":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
          <path
            d="M12 3c1.657 0 3 1.343 3 3 0 1.19-.7 2.216-1.7 2.702V10h1.7a1 1 0 1 1 0 2h-1.7v7H10.7v-7H9a1 1 0 1 1 0-2h1.7V8.702A2.99 2.99 0 0 1 9 6c0-1.657 1.343-3 3-3Zm0 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"
            fill="currentColor"
          />
        </svg>
      );
    case "briefcase":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
          <path
            d="M9 4a1 1 0 0 0-1 1v1H5a2 2 0 0 0-2 2v4.5A2.5 2.5 0 0 0 5.5 15H9v1h6v-1h3.5A2.5 2.5 0 0 0 21 12.5V8a2 2 0 0 0-2-2h-3V5a1 1 0 0 0-1-1H9Zm1 2h4v1h-4V6Zm-4 4h12v3.5a.5.5 0 0 1-.5.5H15v-1H9v1H6.5a.5.5 0 0 1-.5-.5V10Z"
            fill="currentColor"
          />
        </svg>
      );
    default:
      return null;
  }
};

const faqItems = [
  {
    question: "Do you require a deposit?",
    answer:
      "Deposits depend on the court and booking type. If required, you'll see it in your booking confirmation.",
  },
  {
    question: "Can I extend my booking?",
    answer:
      "Yes. Extensions are allowed if the court has no conflicting bookings. Book extensions before end time.",
  },
  {
    question: "How do promo codes work?",
    answer:
      "Enter a code and click Apply. Valid codes reduce your subtotal automatically based on rules and expiry.",
  },
];

const eventTypes = [
  "Tournament",
  "School event",
  "Wedding",
  "Funeral",
  "Corporate event",
  "Other",
];
function App() {
  const initialQr = useMemo(() => {
    if (typeof window === "undefined") {
      return { open: false, courtParam: null as string | null };
    }
    const params = new URLSearchParams(window.location.search);
    return {
      open: params.get("reserve") === "1",
      courtParam: params.get("court"),
    };
  }, []);

  const [isModalOpen, setIsModalOpen] = useState(initialQr.open);
  const [plan, setPlan] = useState<Plan>("Hourly");
  const [courts, setCourts] = useState<Court[]>(fallbackCourts);
  const [selectedCourtId, setSelectedCourtId] = useState(
    fallbackCourts[0]?.id ?? "",
  );
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [startTime, setStartTime] = useState("10:00");
  const [hours, setHours] = useState(2);
  const [promoCode, setPromoCode] = useState("");
  const [promo, setPromo] = useState<Promo | null>(null);
  const [promoNote, setPromoNote] = useState({ tone: "", message: "" });
  const [bookingNote, setBookingNote] = useState({ tone: "", message: "" });
  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [adminNotifications, setAdminNotifications] = useState<AdminNotice[]>(
    [],
  );
  const adminUserRef = useRef<User | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [eventType, setEventType] = useState(eventTypes[0]);
  const [notes, setNotes] = useState("");
  const nameRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);
  const qrCourtParamRef = useRef<string | null>(initialQr.courtParam);
  const location = useLocation();

  const selectedCourt = useMemo(
    () => courts.find((court) => court.id === selectedCourtId),
    [courts, selectedCourtId],
  );

  const featuredCourt = useMemo(() => {
    const byName = courts.find((court) =>
      court.name.toLowerCase().includes("indoor"),
    );
    return byName ?? courts[0];
  }, [courts]);

  const bookingQrUrl = useMemo(() => {
    const base =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://example.com";
    if (!featuredCourt) return `${base}/?reserve=1`;
    const idOrSlug = featuredCourt.slug ?? featuredCourt.id;
    return `${base}/?reserve=1&court=${encodeURIComponent(idOrSlug)}`;
  }, [featuredCourt]);

  useEffect(() => {
    let isMounted = true;

    const loadCourts = async () => {
      if (!supabase) return;
      const { data, error } = await supabase
        .from("courts")
        .select(
          "id,name,slug,hero_image,card_image,hourly_rate,daily_rate,weekly_rate,is_active",
        )
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (!isMounted) return;
      if (error) return;
      if (data && data.length) {
        const merged = fallbackCourts.map((fallback) => {
          const match = data.find(
            (court) => court.id === fallback.id || court.slug === fallback.id,
          );
          if (!match) return fallback;
          const override = COURT_PRICE_OVERRIDES[fallback.id] ?? {};
          return {
            ...match,
            image: fallback.image,
            ...override,
          };
        });
        setCourts(merged);
        const qrParam = qrCourtParamRef.current;
        const matchedCourt = qrParam
          ? data.find((court) => court.id === qrParam || court.slug === qrParam)
          : undefined;
        const fallbackId = merged[0]?.id ?? data[0].id;
        const nextId =
          matchedCourt?.id ??
          (selectedCourtId &&
          merged.some((court) => court.id === selectedCourtId)
            ? selectedCourtId
            : fallbackId);
        if (nextId && nextId !== selectedCourtId) {
          setSelectedCourtId(nextId);
        }
      }
    };

    loadCourts();
    return () => {
      isMounted = false;
    };
  }, [selectedCourtId]);

  const baseAmount = useMemo(() => {
    if (!selectedCourt) return 0;
    if (plan === "Hourly") {
      return selectedCourt.hourly_rate * clamp(hours, 1, 12);
    }
    if (plan === "Daily") {
      const days = daysBetweenInclusive(startDate, endDate);
      return selectedCourt.daily_rate * days;
    }
    const days = daysBetweenInclusive(startDate, endDate);
    const weeks = Math.max(1, Math.ceil(days / 7));
    return selectedCourt.weekly_rate * weeks;
  }, [selectedCourt, plan, hours, startDate, endDate]);

  const pricing = useMemo(() => {
    const discount = promo
      ? (() => {
          if (promo.min_amount && baseAmount < promo.min_amount) return 0;
          if (promo.type === "percent") {
            return Math.round((promo.value / 100) * baseAmount);
          }
          if (promo.type === "fixed") {
            return Math.round(promo.value);
          }
          return 0;
        })()
      : 0;
    const total = Math.max(0, baseAmount - discount);
    return { base: baseAmount, discount, total };
  }, [promo, baseAmount]);

  const bookingSummary = useMemo(() => {
    if (!selectedCourt) return "";
    const dateLabel =
      plan === "Hourly"
        ? `${startDate} at ${startTime}`
        : `${startDate} to ${endDate}`;
    return `${selectedCourt.name} | ${plan} | ${dateLabel} | Total ${formatNaira(
      pricing.total,
    )}`;
  }, [selectedCourt, plan, startDate, endDate, startTime, pricing.total]);

  const handlePlanChange = (nextPlan: Plan) => {
    setPlan(nextPlan);
    if (nextPlan === "Hourly") {
      setEndDate(startDate);
      return;
    }
    if (endDate < startDate) {
      setEndDate(startDate);
    }
  };

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
    if (plan === "Hourly" || endDate < value) {
      setEndDate(value);
    }
  };

  useEffect(() => {
    if (!isModalOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isModalOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>("[data-animate]"),
    );
    if (!elements.length) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) {
      elements.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const revealIfInView = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const viewTop = window.innerHeight * 0.1;
      const viewBottom = window.innerHeight * 0.9;
      if (rect.top < viewBottom && rect.bottom > viewTop) {
        el.classList.add("is-visible");
      }
    };
    elements.forEach(revealIfInView);
    document.documentElement.classList.add("motion-ready");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          (entry.target as HTMLElement).classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -10% 0px" },
    );
    elements.forEach((el) => {
      observer.observe(el);
    });
    return () => observer.disconnect();
  }, [courts.length]);

  const closeModal = () => {
    setIsModalOpen(false);
    setBookingNote({ tone: "", message: "" });
  };

  const focusForm = () => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    nameRef.current?.focus();
  };

  const getCourtName = (courtId: string) =>
    courts.find((court) => court.id === courtId)?.name ?? courtId;

  const handleApplyPromo = async () => {
    const code = promoCode.trim().toUpperCase();
    setPromoNote({ tone: "", message: "" });

    if (!code) {
      setPromo(null);
      return;
    }

    if (!supabase) {
      setPromoNote({
        tone: "bad",
        message: "Supabase is not configured for promo codes.",
      });
      return;
    }

    const { data, error } = await supabase
      .from("promo_codes")
      .select(
        "id,code,type,value,is_active,starts_at,ends_at,max_redemptions,redeemed_count,min_amount",
      )
      .eq("code", code)
      .maybeSingle();

    if (error) {
      setPromoNote({ tone: "bad", message: "Promo lookup failed." });
      return;
    }

    if (!data || !data.is_active) {
      setPromo(null);
      setPromoNote({ tone: "bad", message: "Invalid promo code." });
      return;
    }

    const now = new Date();
    if (data.starts_at && now < new Date(data.starts_at)) {
      setPromoNote({ tone: "bad", message: "Promo is not active yet." });
      return;
    }
    if (data.ends_at && now > new Date(data.ends_at)) {
      setPromoNote({ tone: "bad", message: "Promo has expired." });
      return;
    }
    if (
      data.max_redemptions != null &&
      data.redeemed_count >= data.max_redemptions
    ) {
      setPromoNote({ tone: "bad", message: "Promo limit reached." });
      return;
    }
    if (data.min_amount && baseAmount < data.min_amount) {
      setPromo(null);
      setPromoNote({
        tone: "bad",
        message: `Minimum booking amount is ${formatNaira(data.min_amount)}.`,
      });
      return;
    }

    setPromo({
      id: data.id,
      code: data.code,
      type: data.type,
      value: data.value,
      min_amount: data.min_amount,
      starts_at: data.starts_at,
      ends_at: data.ends_at,
      max_redemptions: data.max_redemptions,
      redeemed_count: data.redeemed_count,
      is_active: data.is_active,
    });
    setPromoNote({ tone: "good", message: `Promo applied: ${data.code}` });
  };

  const handleReserve = async () => {
    setBookingNote({ tone: "", message: "" });

    if (!customerName || !customerPhone || !customerEmail) {
      setBookingNote({
        tone: "bad",
        message: "Please fill in your name, phone, and email.",
      });
      return;
    }

    if (!selectedCourt) {
      setBookingNote({ tone: "bad", message: "Select a court first." });
      return;
    }

    const today = todayISO();
    if (startDate < today) {
      setBookingNote({
        tone: "bad",
        message: "Start date cannot be in the past.",
      });
      return;
    }
    if (plan !== "Hourly" && endDate < today) {
      setBookingNote({
        tone: "bad",
        message: "End date cannot be in the past.",
      });
      return;
    }
    if (plan === "Hourly" && startDate === today) {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const startMinutes = startTime ? toMinutes(startTime) : null;
      if (startMinutes === null || startMinutes <= nowMinutes) {
        setBookingNote({
          tone: "bad",
          message: "Start time must be later than the current time.",
        });
        return;
      }
    }

    if (!supabase) {
      setBookingNote({
        tone: "bad",
        message: "Supabase is not configured for bookings.",
      });
      return;
    }

    const payload = {
      court_id: selectedCourt.id,
      plan,
      start_date: startDate,
      end_date: plan === "Hourly" ? startDate : endDate,
      start_time: startTime,
      hours: plan === "Hourly" ? clamp(hours, 1, 12) : null,
      base_amount: pricing.base,
      discount_amount: pricing.discount,
      total_amount: pricing.total,
      promo_code_id: pricing.discount > 0 ? promo?.id : null,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_email: customerEmail,
      event_type: eventType,
      notes,
      status: "pending",
    };

    const { error } = await supabase.from("bookings").insert(payload);

    if (error) {
      setBookingNote({ tone: "bad", message: "Booking failed. Try again." });
      return;
    }

    setBookingNote({
      tone: "good",
      message: "Reservation submitted. We will contact you shortly.",
    });
  };

  const fetchBookings = useCallback(async (userOverride?: User | null) => {
    const activeUser = userOverride ?? adminUserRef.current;
    if (!supabase || !activeUser) return;
    setBookingsLoading(true);
    const { data, error } = await supabase
      .from("bookings")
      .select(
        "id,court_id,plan,start_date,end_date,start_time,hours,base_amount,discount_amount,total_amount,promo_code_id,customer_name,customer_phone,customer_email,event_type,notes,status,created_at",
      )
      .order("created_at", { ascending: false });
    if (!error && data) {
      setBookings(data as Booking[]);
    }
    setBookingsLoading(false);
  }, []);

  useEffect(() => {
    adminUserRef.current = adminUser;
  }, [adminUser]);

  useEffect(() => {
    if (!supabase) return;
    let isMounted = true;

    const bootstrapAuth = async () => {
      const { data } = await supabase.auth.getUser();
      if (!isMounted) return;
      if (data.user) {
        setAdminUser(data.user);
        void fetchBookings(data.user);
      } else {
        setAdminUser(null);
        setBookings([]);
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!isMounted) return;
        const user = session?.user ?? null;
        setAdminUser(user);
        if (user) {
          void fetchBookings(user);
        } else {
          setBookings([]);
        }
      },
    );

    bootstrapAuth();
    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [fetchBookings]);

  useEffect(() => {
    const isAdmin = location.pathname === "/admin";
    document.body.style.overflow = isAdmin ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [location.pathname]);

  useEffect(() => {
    if (!supabase) return;
    if (location.pathname !== "/admin") return;
    if (!adminUser) return;

    const channel = supabase
      .channel("admin-bookings")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bookings" },
        (payload) => {
          const booking = payload.new as Booking;
          setBookings((prev) =>
            prev.some((item) => item.id === booking.id)
              ? prev
              : [booking, ...prev],
          );
          const id = `${Date.now()}-${Math.random()}`;
          setAdminNotifications((prev) => [
            {
              id,
              message: `New booking from ${booking.customer_name}`,
              meta: `${booking.plan} • ${formatNaira(booking.total_amount)}`,
            },
            ...prev,
          ]);
          window.setTimeout(() => {
            setAdminNotifications((prev) =>
              prev.filter((note) => note.id !== id),
            );
          }, 6000);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [location.pathname, adminUser]);

  const handleAdminLogin = async () => {
    setAdminError("");
    if (!supabase) {
      setAdminError("Supabase is not configured.");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword,
    });
    if (error) {
      setAdminError("Login failed. Check your email and password.");
      return;
    }
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      fetchBookings(data.user);
    }
  };

  const handleAdminLogout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setAdminUser(null);
    setBookings([]);
    setAdminNotifications([]);
  };

  const updateBookingStatus = async (
    bookingId: string,
    status: "confirmed" | "rejected",
  ) => {
    if (!supabase) return;
    const { error } = await supabase
      .from("bookings")
      .update({ status })
      .eq("id", bookingId);
    if (error) return;
    setBookings((prev) =>
      prev.map((booking) =>
        booking.id === bookingId ? { ...booking, status } : booking,
      ),
    );
    setEditingBookingId(null);
  };

  const inputClass =
    "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none";

  const labelClass = "text-[11px] uppercase tracking-[0.3em] text-white/60";

  const homePage = (
    <div className="min-h-screen bg-[#faf9f7] text-[var(--ink)]">
      <header className="sticky top-0 z-30 bg-[#faf9f7]/90 backdrop-blur border-b border-[#e6e2db]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 overflow-hidden rounded-full bg-white">
              <img
                src="/adrenale.png"
                alt="Adrenale Dolphins Rentals logo"
                className="h-full w-full object-cover"
              />
            </div>
            <div>
              <p className="font-display text-lg leading-none">
                Adrenale-Dolphins
              </p>
              <p className="text-xs text-[#6f6b66] uppercase tracking-[0.2em]">
                Rentals
              </p>
            </div>
          </div>
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-[#2b2b2b]">
            <a className="hover:text-black" href="#courts">
              Courts
            </a>
            <a className="hover:text-black" href="#usage">
              Usage
            </a>
            <a className="hover:text-black" href="#faq">
              FAQ
            </a>
            <a className="hover:text-black" href="#contact">
              Contact
            </a>
            <Link className="hover:text-black" to="/admin">
              Admin
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 rounded-full border border-[#d9d4cc] bg-white px-4 py-2 text-xs">
              <span className="h-2 w-2 rounded-full bg-[var(--court)]" />
              Search courts...
            </div>
            <button
              className="rounded-full bg-[#11110e] text-white px-4 py-2 text-sm font-medium"
              onClick={() => setIsModalOpen(true)}
              type="button"
            >
              Book now
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-[#11110e] text-white">
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src="/hero-court.mp4"
            autoPlay
            loop
            muted
            playsInline
          />
          <div className="absolute inset-0 bg-black/65" />
          <div className="relative mx-auto grid min-h-[620px] max-w-6xl gap-10 px-6 py-20 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div data-animate="slide-left">
              <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-xs uppercase tracking-[0.3em]">
                Dolphins Courts
              </p>
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl leading-tight">
                Adrenale-Dolphins Rental
              </h1>
              <p className="mt-4 max-w-xl text-base sm:text-lg text-[#f1efe9]">
                Book premium basketball courts by the hour, day, or week.
                Transparent pricing, calendar availability, and instant
                reservations.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#11110e]"
                  onClick={() => setIsModalOpen(true)}
                  type="button"
                >
                  Reserve now
                </button>
                <button
                  className="rounded-full border border-white/40 px-6 py-3 text-sm font-semibold text-white/90"
                  onClick={() => setIsModalOpen(true)}
                  type="button"
                >
                  Check availability
                </button>
              </div>

              <p className="mt-4 text-xs text-white/70">
                Courts can be rented for tournaments, school events, weddings,
                funerals, and corporate events.
              </p>
            </div>

            <div className="hidden lg:block">
              <div
                className="rounded-[40px] border border-white/10 bg-white/5 p-10 text-white/80"
                data-animate="slide-right"
                style={{ transitionDelay: "120ms" }}
              >
                <p className="text-xs uppercase tracking-[0.3em]">
                  Promo spotlight
                </p>
                <h3 className="mt-4 font-display text-2xl text-white">
                  Book Indoor Arena with a discount
                </h3>
                <p className="mt-3 text-sm">
                  Use promo codes at checkout to reduce your total instantly.
                </p>
                <div className="mt-6 inline-flex items-center gap-3 rounded-full bg-white/10 px-4 py-2">
                  <span className="text-xl font-display text-white">10%</span>
                  <span className="text-xs uppercase tracking-[0.2em] text-white/80">
                    Promo codes available
                  </span>
                </div>
                <button
                  className="mt-6 inline-flex w-fit items-center justify-center rounded-full bg-white px-5 py-2 text-xs font-semibold text-[#11110e]"
                  onClick={() => setIsModalOpen(true)}
                  type="button"
                >
                  Book now
                </button>
              </div>
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-6xl px-6 py-12">
          <div
            className="grid items-center gap-8 rounded-[32px] border border-[#e6e2db] bg-white px-8 py-10 shadow-[0_14px_40px_rgba(0,0,0,0.08)] md:grid-cols-[1.2fr_0.8fr]"
            data-animate="slide-up"
          >
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#8d877f]">
                Scan to reserve
              </p>
              <h2 className="mt-3 font-display text-3xl">
                Book {featuredCourt?.name ?? "your court"} instantly
              </h2>
              <p className="mt-3 text-sm text-[#6f6b66]">
                Open your phone camera, scan the QR code, and the booking form
                will open with the court pre-selected.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  className="rounded-full bg-[#11110e] px-5 py-2 text-sm font-semibold text-white"
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                >
                  Open booking
                </button>
                <p className="text-xs text-[#8d877f] break-all">
                  Link: {bookingQrUrl}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-center">
              <div className="rounded-3xl border border-[#e6e2db] bg-[#faf9f7] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
                <div className="rounded-2xl bg-white p-4">
                  <QRCode value={bookingQrUrl} size={180} />
                </div>
              </div>
            </div>
          </div>
        </section>
        <section id="courts" className="mx-auto max-w-6xl px-6 py-16">
          <div className="text-center">
            <h2 className="font-display text-3xl sm:text-4xl">Court views</h2>
            <p className="mt-2 text-sm text-[#6f6b66]">
              Choose the environment that matches your event.
            </p>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {courts.map((court) => {
              const fallbackSrc = getFallbackCourtImage(court);
              const primarySrc = resolveCourtImage(court) || fallbackSrc;
              return (
                <article
                  key={court.id}
                  className="rounded-3xl bg-white shadow-[0_10px_40px_rgba(0,0,0,0.06)]"
                >
                  <div className="overflow-hidden rounded-3xl">
                    <img
                      src={primarySrc}
                      data-fallback={fallbackSrc}
                      onError={(event) => {
                        const target = event.currentTarget;
                        const nextSrc = target.dataset.fallback;
                        if (nextSrc && target.src !== nextSrc) {
                          target.src = nextSrc;
                        }
                      }}
                      alt={court.name}
                      className={`h-48 w-full object-cover ${
                        court.id === "indoor-arena"
                          ? "object-top"
                          : "object-center"
                      }`}
                    />
                  </div>
                  <div className="p-5">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">{court.name}</h3>
                      <span className="text-xs rounded-full border border-[#e0dad2] px-2 py-1 text-[#6f6b66]">
                        View
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="font-semibold">
                        {formatNaira(court.hourly_rate)}/hr
                      </span>
                      <button
                        className="rounded-full border border-[#11110e] px-3 py-1 text-xs font-semibold"
                        onClick={() => {
                          setSelectedCourtId(court.id);
                          setIsModalOpen(true);
                        }}
                        type="button"
                      >
                        Reserve
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section id="usage" className="mx-auto max-w-6xl px-6 pb-16">
          <div
            className="rounded-3xl bg-white p-8 shadow-[0_10px_40px_rgba(0,0,0,0.06)]"
            data-animate="slide-up"
          >
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
              {usageItems.map((item, index) => (
                <div
                  key={item.title}
                  className="rounded-2xl bg-[#faf9f7] p-4"
                  data-animate="slide-up"
                  style={{ transitionDelay: `${index * 80}ms` }}
                >
                  <div className="h-10 w-10 rounded-full bg-[var(--court)]/10 flex items-center justify-center text-[var(--court)]">
                    {usageIcon(item.icon)}
                  </div>
                  <p className="mt-3 text-sm font-semibold">{item.title}</p>
                  <p className="mt-2 text-xs text-[#6f6b66]">{item.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-16">
          <div
            className="rounded-3xl bg-[#11110e] text-white shadow-[0_10px_40px_rgba(0,0,0,0.12)]"
            data-animate="slide-up"
          >
            <div className="grid gap-8 px-8 py-10 lg:grid-cols-[1.3fr_0.7fr]">
              <div data-animate="slide-left">
                <h3 className="font-display text-3xl">
                  Book Indoor Arena with a discount
                </h3>
                <p className="mt-3 text-sm text-white/70">
                  Use promo codes at checkout to reduce your total instantly.
                </p>
                <button
                  className="mt-6 rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#11110e]"
                  onClick={() => setIsModalOpen(true)}
                  type="button"
                >
                  Book now
                </button>
              </div>
              <div className="flex items-center justify-end">
                <div
                  className="rounded-3xl bg-white/10 px-8 py-6 text-center"
                  data-animate="slide-right"
                  style={{ transitionDelay: "120ms" }}
                >
                  <p className="text-4xl font-display">10%</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.3em] text-white/70">
                    Promo codes available
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-6xl px-6 pb-16">
          <div
            className="rounded-3xl bg-white p-8 shadow-[0_10px_40px_rgba(0,0,0,0.06)]"
            data-animate="slide-up"
          >
            <div className="text-center">
              <h2 className="font-display text-3xl sm:text-4xl">FAQs</h2>
              <p className="mt-2 text-sm text-[#6f6b66]">
                Quick answers to common rental questions.
              </p>
            </div>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {faqItems.map((item, index) => (
                <div
                  key={item.question}
                  className="rounded-2xl bg-[#faf9f7] p-5"
                  data-animate="slide-up"
                  style={{ transitionDelay: `${index * 90}ms` }}
                >
                  <p className="font-semibold">{item.question}</p>
                  <p className="mt-2 text-sm text-[#6f6b66]">{item.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="mx-auto max-w-6xl px-6 pb-20">
          <div className="text-center">
            <h2 className="font-display text-3xl sm:text-4xl">Contact</h2>
            <p className="mt-2 text-sm text-[#6f6b66]">
              Need a quote for a tournament, school, or event? Contact us on:
            </p>
          </div>
          <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.15fr]">
            <div className="grid gap-6">
              <div
                className="rounded-[28px] border border-[#e3e0da] bg-white px-10 py-8 shadow-[0_10px_28px_rgba(0,0,0,0.06)]"
                data-animate="slide-left"
              >
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.35em] text-[#7b756f]">
                  <span>WhatsApp</span>
                  <span>Fast response</span>
                </div>
                <p className="mt-5 text-xl font-semibold">+234 906 783 1477</p>
                <p className="mt-2 text-sm text-[#7b756f]">
                  Available 8:00am - 8:00pm
                </p>
                <a
                  className="mt-5 inline-flex items-center justify-center rounded-full border border-[#11110e] px-5 py-2 text-xs font-semibold transition hover:bg-[#11110e] hover:text-white"
                  href="https://wa.me/2349067831477"
                  target="_blank"
                  rel="noreferrer"
                >
                  Message us
                </a>
              </div>
              <div
                className="rounded-[28px] border border-[#e3e0da] bg-white px-10 py-8 shadow-[0_10px_28px_rgba(0,0,0,0.06)]"
                data-animate="slide-left"
                style={{ transitionDelay: "90ms" }}
              >
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.35em] text-[#7b756f]">
                  <span>Email</span>
                  <span>24h reply</span>
                </div>
                <p className="mt-5 text-xl font-semibold">
                  ballarkafrica@gmail.com
                </p>
                <p className="mt-2 text-sm text-[#7b756f]">
                  We reply within 24 hours
                </p>
                <a
                  className="mt-5 inline-flex items-center justify-center rounded-full border border-[#11110e] px-5 py-2 text-xs font-semibold transition hover:bg-[#11110e] hover:text-white"
                  href="mailto:ballarkafrica@gmail.com"
                >
                  Send email
                </a>
              </div>
            </div>
            <div
              className="overflow-hidden rounded-[28px] border border-[#e3e0da] bg-white shadow-[0_10px_28px_rgba(0,0,0,0.06)]"
              data-animate="slide-right"
            >
              <div className="h-64 w-full">
                <iframe
                  title="Dolphins Indoor Basketball Court"
                  src="https://www.google.com/maps?q=Dolphins%20Indoor%20Basketball%20Court%20Lagos&output=embed"
                  className="h-full w-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <div className="px-10 py-8">
                <div className="text-[11px] uppercase tracking-[0.35em] text-[#7b756f]">
                  Venue
                </div>
                <p className="mt-3 text-lg font-semibold">
                  Dolphins Indoor Court
                </p>
                <p className="text-sm text-[#7b756f]">
                  1, Olu Aboderin St, Lagos, Nigeria
                </p>
                <a
                  className="mt-5 inline-flex items-center justify-center rounded-full bg-[#11110e] px-5 py-2 text-xs font-semibold text-white transition hover:bg-black"
                  href="https://www.google.com/maps?q=Dolphins%20Indoor%20Basketball%20Court%20Lagos"
                  target="_blank"
                  rel="noreferrer"
                >
                  Get Directions
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#e6e2db] bg-[#11110e] text-[#e7e1d8]">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div>
            <p className="font-display text-2xl">Dolphins Court Rentals</p>
            <p className="mt-3 text-sm text-[#bdb6ad]">
              Premium basketball spaces for teams, trainers, and community
              programs. Built for speed, safety, and unforgettable games.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em]">
              Explore
            </p>
            <ul className="mt-3 space-y-2 text-sm text-[#bdb6ad]">
              <li>Court catalog</li>
              <li>Pricing</li>
              <li>Membership</li>
              <li>Partnerships</li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em]">
              Support
            </p>
            <ul className="mt-3 space-y-2 text-sm text-[#bdb6ad]">
              <li>FAQ</li>
              <li>Policies</li>
              <li>Contact</li>
              <li>Request a tour</li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em]">
              Contact
            </p>
            <ul className="mt-3 space-y-2 text-sm text-[#bdb6ad]">
              <li>ballarkafrica@gmail.com</li>
              <li>(+234) 9067831477</li>
              <li>Lagos, Nigeria</li>
              <li>Open 6am - 11pm daily</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 py-6 text-center text-xs text-[#bdb6ad]">
          © 2026 Dolphins Court Rentals. All rights reserved.
        </div>
      </footer>
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-8">
          <button
            className="absolute inset-0 cursor-default"
            onClick={closeModal}
            type="button"
            aria-label="Close booking modal"
          />
          <div className="booking-modal relative w-full max-w-5xl overflow-visible rounded-[32px] border border-white/10 bg-[#1b1b1d]/95 shadow-[0_30px_80px_rgba(0,0,0,0.6)] backdrop-blur">
            <div className="flex items-center justify-between px-8 pt-8 text-white/70">
              <p className="text-[11px] uppercase tracking-[0.35em]">
                Reserve your booking
              </p>
              <button
                className="rounded-full border border-white/20 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/70"
                onClick={closeModal}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="grid gap-8 overflow-visible px-8 pb-10 pt-6 lg:grid-cols-2">
              <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-3">
                  {(["Hourly", "Daily", "Weekly"] as Plan[]).map((option) => (
                    <button
                      key={option}
                      className={`rounded-full px-4 py-2 text-xs font-semibold ${
                        plan === option
                          ? "bg-white text-[#11110e]"
                          : "border border-white/20 text-white/80"
                      }`}
                      onClick={() => handlePlanChange(option)}
                      type="button"
                    >
                      {option}
                    </button>
                  ))}
                </div>

                <div className="grid gap-4 rounded-3xl bg-white/5 p-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>Court</label>
                      <select
                        className={`${inputClass} mt-2`}
                        value={selectedCourtId}
                        onChange={(event) =>
                          setSelectedCourtId(event.target.value)
                        }
                      >
                        {courts.map((court) => (
                          <option key={court.id} value={court.id}>
                            {court.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Start date</label>
                      <input
                        type="date"
                        className={`${inputClass} mt-2`}
                        value={startDate}
                        onChange={(event) =>
                          handleStartDateChange(event.target.value)
                        }
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Start time</label>
                      <input
                        type="time"
                        className={`${inputClass} mt-2`}
                        value={startTime}
                        onChange={(event) => setStartTime(event.target.value)}
                      />
                    </div>
                    {plan === "Hourly" ? (
                      <div>
                        <label className={labelClass}>Duration</label>
                        <select
                          className={`${inputClass} mt-2`}
                          value={hours}
                          onChange={(event) =>
                            setHours(
                              clamp(Number(event.target.value || 1), 1, 12),
                            )
                          }
                        >
                          {[1, 2, 3, 4, 6, 8, 10, 12].map((hour) => (
                            <option key={hour} value={hour}>
                              {hour} hour{hour > 1 ? "s" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className={labelClass}>End date</label>
                        <input
                          type="date"
                          className={`${inputClass} mt-2`}
                          value={endDate}
                          onChange={(event) => setEndDate(event.target.value)}
                        />
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Promo code</label>
                      <div className="mt-2 flex items-center gap-3">
                        <input
                          className={`${inputClass} flex-1 min-w-0`}
                          placeholder="e.g. DOLPHINS10"
                          value={promoCode}
                          onChange={(event) => setPromoCode(event.target.value)}
                        />
                        <button
                          className="shrink-0 rounded-full bg-white px-4 py-2 text-xs font-semibold text-[#11110e]"
                          type="button"
                          onClick={handleApplyPromo}
                        >
                          Apply
                        </button>
                      </div>
                      {promoNote.message ? (
                        <p
                          className={`mt-2 text-xs ${
                            promoNote.tone === "good"
                              ? "text-[#b4f0c9]"
                              : "text-[#f7b7b7]"
                          }`}
                        >
                          {promoNote.message}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid items-stretch gap-4 sm:grid-cols-2">
                    <div className="h-full rounded-2xl bg-white/10 p-4">
                      <div className="flex items-center justify-between text-[11px] text-white/60">
                        <span className="uppercase tracking-[0.25em]">
                          Subtotal
                        </span>
                        <span className="text-xs font-semibold text-white/80">
                          {formatNaira(pricing.base)}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-white/60">
                        <span className="uppercase tracking-[0.25em]">
                          Discount
                        </span>
                        <span className="text-xs font-semibold text-white/80">
                          {formatNaira(pricing.discount)}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-sm font-semibold text-white">
                        <span className="uppercase tracking-[0.2em]">
                          Total
                        </span>
                        <span>{formatNaira(pricing.total)}</span>
                      </div>
                    </div>
                    <div className="flex h-full flex-col justify-between rounded-2xl bg-white/10 p-4">
                      <p className="text-sm text-[#b4f0c9]">
                        Dates available. Continue to reserve.
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-white/60">
                        <button
                          className="whitespace-nowrap uppercase tracking-[0.2em]"
                          type="button"
                        >
                          Check & Price
                        </button>
                        <button
                          className="whitespace-nowrap rounded-full bg-white px-4 py-2 text-[11px] font-semibold text-[#11110e] tracking-normal"
                          type="button"
                          onClick={focusForm}
                        >
                          Reserve now
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                ref={formRef}
                className="rounded-3xl border border-white/10 bg-[#101012] p-6"
              >
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
                  {bookingSummary}
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Full name</label>
                    <input
                      ref={nameRef}
                      className={`${inputClass} mt-2`}
                      placeholder="Your name"
                      value={customerName}
                      onChange={(event) => setCustomerName(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Phone</label>
                    <input
                      className={`${inputClass} mt-2`}
                      placeholder="+234..."
                      value={customerPhone}
                      onChange={(event) => setCustomerPhone(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Email</label>
                    <input
                      className={`${inputClass} mt-2`}
                      placeholder="you@example.com"
                      value={customerEmail}
                      onChange={(event) => setCustomerEmail(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Event type</label>
                    <select
                      className={`${inputClass} mt-2`}
                      value={eventType}
                      onChange={(event) => setEventType(event.target.value)}
                    >
                      {eventTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Notes</label>
                    <textarea
                      className={`${inputClass} mt-2 min-h-[120px]`}
                      placeholder="Add any detail (layout, vendors, timing, etc.)"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </div>
                </div>
                {bookingNote.message ? (
                  <p
                    className={`mt-4 text-xs ${
                      bookingNote.tone === "good"
                        ? "text-[#b4f0c9]"
                        : "text-[#f7b7b7]"
                    }`}
                  >
                    {bookingNote.message}
                  </p>
                ) : null}
                <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                  <button
                    className="rounded-full border border-white/15 px-5 py-2 text-xs font-semibold text-white/70"
                    type="button"
                    onClick={closeModal}
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded-full bg-white px-5 py-2 text-xs font-semibold text-[#11110e]"
                    type="button"
                    onClick={handleReserve}
                  >
                    Confirm reservation
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const adminPage = (
    <div className="h-screen overflow-hidden overscroll-none bg-[#0f0f11] text-white">
      {adminNotifications.length > 0 && (
        <div className="fixed right-6 top-6 z-50 grid gap-3">
          {adminNotifications.map((notice) => (
            <div
              key={notice.id}
              className="rounded-2xl border border-white/15 bg-[#1b1b1d]/90 px-4 py-3 text-xs text-white/80 shadow-[0_20px_40px_rgba(0,0,0,0.35)]"
            >
              <p className="text-sm font-semibold text-white">
                {notice.message}
              </p>
              {notice.meta ? (
                <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-white/60">
                  {notice.meta}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
      <div className="mx-auto flex h-screen w-full max-w-5xl flex-col px-6 py-10">
        <div className="flex items-center justify-between pb-6">
          <div className="text-xs uppercase tracking-[0.35em] text-white/50">
            Admin access
          </div>
          <Link
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/80"
            to="/"
          >
            Back to site
          </Link>
        </div>
        <div className="relative flex-1 overflow-hidden rounded-[28px] border border-white/10 bg-[#141416]/95 shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
          <div className="flex items-center px-6 py-5 text-white/70">
            <p className="text-[11px] uppercase tracking-[0.35em]">
              Admin dashboard
            </p>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-6 pb-8">
            {!supabase && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
                Supabase is not configured. Please add your credentials in
                `.env` and restart the dev server.
              </div>
            )}

            {supabase && !adminUser && (
              <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6">
                <div>
                  <label className={labelClass}>Admin email</label>
                  <input
                    className={`${inputClass} mt-2`}
                    placeholder="admin@email.com"
                    value={adminEmail}
                    onChange={(event) => setAdminEmail(event.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Password</label>
                  <input
                    type="password"
                    className={`${inputClass} mt-2`}
                    placeholder="••••••••"
                    value={adminPassword}
                    onChange={(event) => setAdminPassword(event.target.value)}
                  />
                </div>
                {adminError ? (
                  <p className="text-xs text-[#f7b7b7]">{adminError}</p>
                ) : null}
                <div className="flex items-center justify-end">
                  <button
                    className="rounded-full bg-white px-5 py-2 text-xs font-semibold text-[#11110e]"
                    type="button"
                    onClick={handleAdminLogin}
                  >
                    Sign in
                  </button>
                </div>
              </div>
            )}

            {supabase && adminUser && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 text-white/70">
                  <div className="text-xs uppercase tracking-[0.3em]">
                    Signed in as {adminUser.email}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/70"
                      type="button"
                      onClick={() => void fetchBookings()}
                    >
                      Refresh
                    </button>
                    <button
                      className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-[#11110e]"
                      type="button"
                      onClick={handleAdminLogout}
                    >
                      Sign out
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5">
                  <div className="flex items-center justify-between px-5 py-4 text-xs uppercase tracking-[0.3em] text-white/50">
                    <span>Reservations</span>
                    <span>{bookings.length} total</span>
                  </div>
                  <div className="divide-y divide-white/10">
                    {bookingsLoading && (
                      <div className="px-5 py-6 text-sm text-white/70">
                        Loading reservations...
                      </div>
                    )}
                    {!bookingsLoading && bookings.length === 0 && (
                      <div className="px-5 py-6 text-sm text-white/60">
                        No reservations yet.
                      </div>
                    )}
                    {bookings.map((booking) => (
                      <div
                        key={booking.id}
                        className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 text-white"
                      >
                        <div>
                          <p className="text-sm font-semibold">
                            {getCourtName(booking.court_id)} • {booking.plan}
                          </p>
                          <p className="mt-1 text-xs text-white/60">
                            {booking.customer_name} · {booking.customer_email}
                          </p>
                          <p className="mt-1 text-xs text-white/60">
                            {booking.start_date}
                            {booking.plan === "Hourly"
                              ? ` at ${booking.start_time ?? ""}`
                              : ` to ${booking.end_date}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-white/60">
                            {formatNaira(booking.total_amount)}
                          </span>
                          <span
                            className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${
                              booking.status === "confirmed"
                                ? "bg-green-500/20 text-[#b4f0c9]"
                                : booking.status === "rejected"
                                  ? "bg-red-500/20 text-[#f7b7b7]"
                                  : "bg-white/10 text-white/70"
                            }`}
                          >
                            {booking.status}
                          </span>
                          {booking.status === "pending" ||
                          editingBookingId === booking.id ? (
                            <>
                              <button
                                className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/80"
                                type="button"
                                onClick={() =>
                                  updateBookingStatus(booking.id, "confirmed")
                                }
                              >
                                Accept
                              </button>
                              <button
                                className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/80"
                                type="button"
                                onClick={() =>
                                  updateBookingStatus(booking.id, "rejected")
                                }
                              >
                                Reject
                              </button>
                              {editingBookingId === booking.id ? (
                                <button
                                  className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-white/60"
                                  type="button"
                                  onClick={() => setEditingBookingId(null)}
                                >
                                  Cancel
                                </button>
                              ) : null}
                            </>
                          ) : (
                            <button
                              className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/80"
                              type="button"
                              onClick={() => setEditingBookingId(booking.id)}
                            >
                              Change status
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Routes>
      <Route path="/" element={homePage} />
      <Route path="/admin" element={adminPage} />
      <Route path="*" element={homePage} />
    </Routes>
  );
}

export default App;
