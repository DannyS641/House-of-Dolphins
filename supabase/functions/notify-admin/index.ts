/// <reference lib="deno.ns" />
/// <reference lib="dom" />

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "";
const FROM_EMAIL =
  Deno.env.get("FROM_EMAIL") ?? "Dolphins Rentals <bookings@dolphins.app>";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

type BookingPayload = {
  court_id?: string;
  plan?: string;
  start_date?: string;
  end_date?: string;
  start_time?: string | null;
  total_amount?: number | string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  event_type?: string | null;
  notes?: string | null;
};

const getRecord = (payload: Record<string, unknown>) => {
  if ("record" in payload && payload.record) return payload.record as BookingPayload;
  if ("new" in payload && payload.new) return payload.new as BookingPayload;
  if ("data" in payload && payload.data) return payload.data as BookingPayload;
  return payload as BookingPayload;
};

const formatAmount = (value?: number | string) => {
  if (value === undefined || value === null) return "N/A";
  if (typeof value === "number") return `NGN ${value.toLocaleString("en-NG")}`;
  return value;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!RESEND_API_KEY || !ADMIN_EMAIL) {
    return new Response("Missing RESEND_API_KEY or ADMIN_EMAIL", { status: 500 });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const record = getRecord(payload);
  const dateLabel =
    record.plan === "Hourly"
      ? `${record.start_date ?? ""}${record.start_time ? ` at ${record.start_time}` : ""}`
      : `${record.start_date ?? ""}${record.end_date ? ` to ${record.end_date}` : ""}`;

  const subject = `New booking: ${record.customer_name ?? "New customer"}`;
  const text = [
    `Court: ${record.court_id ?? "N/A"}`,
    `Plan: ${record.plan ?? "N/A"}`,
    `Date: ${dateLabel || "N/A"}`,
    `Total: ${formatAmount(record.total_amount)}`,
    `Customer: ${record.customer_name ?? "N/A"}`,
    `Email: ${record.customer_email ?? "N/A"}`,
    `Phone: ${record.customer_phone ?? "N/A"}`,
    `Event: ${record.event_type ?? "N/A"}`,
    record.notes ? `Notes: ${record.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject,
      text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return new Response(errorText, { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
