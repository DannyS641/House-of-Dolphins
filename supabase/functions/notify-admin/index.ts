/// <reference lib="deno.ns" />
/// <reference lib="dom" />

declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const EMAILJS_SERVICE_ID = Deno.env.get("EMAILJS_SERVICE_ID") ?? "";
const EMAILJS_ADMIN_TEMPLATE_ID =
  Deno.env.get("EMAILJS_ADMIN_TEMPLATE_ID") ??
  Deno.env.get("EMAILJS_TEMPLATE_ID") ??
  "";
const EMAILJS_CUSTOMER_PENDING_TEMPLATE_ID =
  Deno.env.get("EMAILJS_CUSTOMER_PENDING_TEMPLATE_ID") ??
  Deno.env.get("EMAILJS_CUSTOMER_TEMPLATE_ID") ??
  "";
const EMAILJS_CUSTOMER_STATUS_TEMPLATE_ID =
  Deno.env.get("EMAILJS_CUSTOMER_STATUS_TEMPLATE_ID") ??
  EMAILJS_CUSTOMER_PENDING_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY = Deno.env.get("EMAILJS_PUBLIC_KEY") ?? "";
const EMAILJS_PRIVATE_KEY = Deno.env.get("EMAILJS_PRIVATE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM =
  Deno.env.get("EMAIL_FROM") ?? "House of Dolphins <bookings@updates.example.com>";
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "";
const ADMIN_LINK = Deno.env.get("ADMIN_LINK") ?? "";
const COMPANY_NAME = Deno.env.get("COMPANY_NAME") ?? "House of Dolphins";
const COMPANY_LOCATION = Deno.env.get("COMPANY_LOCATION") ?? "Lagos, Nigeria";

const EMAILJS_ENDPOINT = "https://api.emailjs.com/api/v1.0/email/send";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

type BookingPayload = {
  id?: string;
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
  status?: string | null;
};

const getRecord = (payload: Record<string, unknown>) => {
  if ("record" in payload && payload.record) {
    return payload.record as BookingPayload;
  }
  if ("new" in payload && payload.new) {
    return payload.new as BookingPayload;
  }
  if ("data" in payload && payload.data) {
    return payload.data as BookingPayload;
  }
  return payload as BookingPayload;
};

const getOldRecord = (payload: Record<string, unknown>) => {
  if ("old_record" in payload && payload.old_record) {
    return payload.old_record as BookingPayload;
  }
  if ("old" in payload && payload.old) {
    return payload.old as BookingPayload;
  }
  return null;
};

const formatAmount = (value?: number | string) => {
  if (value === undefined || value === null) return "N/A";
  if (typeof value === "number") return `NGN ${value.toLocaleString("en-NG")}`;
  return value;
};

const formatDateLabel = (record: BookingPayload) => {
  if (record.plan === "Hourly") {
    const startDate = record.start_date ?? "";
    const startTime = record.start_time ? ` at ${record.start_time}` : "";
    return `${startDate}${startTime}`;
  }

  const startDate = record.start_date ?? "";
  const endDate = record.end_date ? ` to ${record.end_date}` : "";
  return `${startDate}${endDate}`;
};

const getBookingDate = (record: BookingPayload) => {
  if (!record.start_date) return "N/A";
  if (record.plan === "Hourly" || !record.end_date) return record.start_date;
  return `${record.start_date} to ${record.end_date}`;
};

const getBookingTime = (record: BookingPayload) => {
  if (record.plan !== "Hourly") return "N/A";
  return record.start_time ?? "N/A";
};

const getStatusMessage = (status: string | null | undefined) => {
  if (status === "confirmed") {
    return "Your booking has been approved.";
  }
  if (status === "rejected") {
    return "Your booking has been rejected.";
  }
  return "Your booking is pending approval.";
};

const stripHtml = (value: string) => value.replace(/<[^>]+>/g, "");

const toTitleCase = (value: string) =>
  value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const getCourtLabel = (record: BookingPayload) => {
  if (!record.court_id) return "N/A";
  return toTitleCase(record.court_id);
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const buildEmailLayout = (title: string, body: string) => `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f6f2eb;color:#11110e;font-family:Arial,sans-serif;">
    <div style="max-width:640px;margin:0 auto;padding:24px;">
      <div style="border-radius:24px;background:#ffffff;overflow:hidden;border:1px solid #eadfce;">
        <div style="padding:24px 28px;background:#11110e;color:#faf9f7;">
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;opacity:0.7;">${escapeHtml(COMPANY_NAME)}</p>
          <h1 style="margin:0;font-size:24px;line-height:1.2;">${escapeHtml(title)}</h1>
        </div>
        <div style="padding:28px;">${body}</div>
      </div>
    </div>
  </body>
</html>`;

const buildAdminEmail = (params: Record<string, string>) => {
  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      A new court booking was submitted and is waiting for review.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6;">
      <tr><td style="padding:6px 0;font-weight:700;">Customer</td><td style="padding:6px 0;">${escapeHtml(params.customer_name)}</td></tr>
      <tr><td style="padding:6px 0;font-weight:700;">Email</td><td style="padding:6px 0;">${escapeHtml(params.customer_email)}</td></tr>
      <tr><td style="padding:6px 0;font-weight:700;">Phone</td><td style="padding:6px 0;">${escapeHtml(params.customer_phone)}</td></tr>
      <tr><td style="padding:6px 0;font-weight:700;">Court</td><td style="padding:6px 0;">${escapeHtml(params.court_id)}</td></tr>
      <tr><td style="padding:6px 0;font-weight:700;">Booking</td><td style="padding:6px 0;">${escapeHtml(params.plan)} on ${escapeHtml(params.date_label)}</td></tr>
      <tr><td style="padding:6px 0;font-weight:700;">Amount</td><td style="padding:6px 0;">${escapeHtml(params.total_amount)}</td></tr>
      <tr><td style="padding:6px 0;font-weight:700;">Use</td><td style="padding:6px 0;">${escapeHtml(params.event_type)}</td></tr>
      <tr><td style="padding:6px 0;font-weight:700;">Notes</td><td style="padding:6px 0;">${escapeHtml(params.notes || "None")}</td></tr>
    </table>
    <p style="margin:24px 0 0;">
      <a href="${escapeHtml(params.admin_link)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#c6752c;color:#11110e;text-decoration:none;font-weight:700;">Open admin dashboard</a>
    </p>
  `;
  return buildEmailLayout("New booking received", body);
};

const buildCustomerEmail = (params: Record<string, string>) => {
  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Hi ${escapeHtml(params.customer_name)}, ${escapeHtml(params.status_message)}
    </p>
    <div style="padding:16px;border-radius:18px;background:#f6f2eb;border:1px solid #eadfce;">
      <p style="margin:0 0 10px;font-size:14px;"><strong>Court:</strong> ${escapeHtml(params.court_id)}</p>
      <p style="margin:0 0 10px;font-size:14px;"><strong>Plan:</strong> ${escapeHtml(params.plan)}</p>
      <p style="margin:0 0 10px;font-size:14px;"><strong>Date:</strong> ${escapeHtml(params.booking_date)}</p>
      <p style="margin:0 0 10px;font-size:14px;"><strong>Time:</strong> ${escapeHtml(params.booking_time)}</p>
      <p style="margin:0;font-size:14px;"><strong>Total:</strong> ${escapeHtml(params.total_amount)}</p>
    </div>
    <p style="margin:16px 0 0;font-size:14px;line-height:1.6;">
      Location: ${escapeHtml(params.location)}
    </p>
  `;
  return buildEmailLayout("Booking update", body);
};

const sendWithResend = async ({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) => {
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [to],
      subject,
      html,
      text: stripHtml(html),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Resend request failed");
  }
};

const sendEmail = async (
  templateId: string,
  templateParams: Record<string, string>,
) => {
  const response = await fetch(EMAILJS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: templateId,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: EMAILJS_PRIVATE_KEY,
      template_params: templateParams,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "EmailJS request failed");
  }
};

const hasResendConfig = () =>
  Boolean(RESEND_API_KEY && EMAIL_FROM && ADMIN_EMAIL && ADMIN_LINK);

const hasEmailJsConfig = () =>
  Boolean(
    EMAILJS_SERVICE_ID &&
      EMAILJS_ADMIN_TEMPLATE_ID &&
      EMAILJS_CUSTOMER_PENDING_TEMPLATE_ID &&
      EMAILJS_CUSTOMER_STATUS_TEMPLATE_ID &&
      EMAILJS_PUBLIC_KEY &&
      EMAILJS_PRIVATE_KEY &&
      ADMIN_EMAIL &&
      ADMIN_LINK,
  );

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!hasResendConfig() && !hasEmailJsConfig()) {
    return new Response(
      "Missing email provider configuration. Set RESEND_API_KEY and EMAIL_FROM for Resend, or keep the existing EmailJS variables. ADMIN_EMAIL and ADMIN_LINK are required for both.",
      { status: 500 },
    );
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const record = getRecord(payload);
  const oldRecord = getOldRecord(payload);
  const dbEvent =
    typeof payload.type === "string"
      ? payload.type.toUpperCase()
      : typeof payload.event_type === "string"
        ? payload.event_type.toUpperCase()
        : oldRecord
          ? "UPDATE"
          : "INSERT";
  const dateLabel = formatDateLabel(record);
  const totalAmount = formatAmount(record.total_amount);
  const customerEmail = record.customer_email ?? "";
  const customerName = record.customer_name ?? "Customer";
  const courtId = getCourtLabel(record);
  const plan = record.plan ?? "N/A";
  const eventType = record.event_type ?? "N/A";
  const notes = record.notes ?? "";
  const customerPhone = record.customer_phone ?? "N/A";
  const bookingDate = getBookingDate(record);
  const bookingTime = getBookingTime(record);
  const serviceName = eventType !== "N/A" ? eventType : plan;
  const bookingStatus = record.status ?? "pending";
  const previousStatus = oldRecord?.status ?? null;
  const bookingId = record.id ?? "N/A";
  const statusMessage = getStatusMessage(bookingStatus);
  const baseTemplateParams = {
    booking_id: bookingId,
    customer_name: customerName,
    customer_email: customerEmail || "N/A",
    customer_phone: customerPhone,
    court_id: courtId,
    plan,
    date_label: dateLabel || "N/A",
    total_amount: totalAmount,
    event_type: eventType,
    service_name: serviceName,
    booking_date: bookingDate,
    booking_time: bookingTime,
    location: COMPANY_LOCATION,
    admin_link: ADMIN_LINK,
    company_name: COMPANY_NAME,
    booking_status: bookingStatus,
    status_message: statusMessage,
    notes,
    admin_email: ADMIN_EMAIL,
  };

  try {
    if (dbEvent === "INSERT") {
      if (hasResendConfig()) {
        await sendWithResend({
          to: ADMIN_EMAIL,
          subject: `New booking from ${customerName}`,
          html: buildAdminEmail(baseTemplateParams),
        });
      } else {
        await sendEmail(EMAILJS_ADMIN_TEMPLATE_ID, {
          ...baseTemplateParams,
          to_email: ADMIN_EMAIL,
        });
      }

      if (customerEmail) {
        if (hasResendConfig()) {
          await sendWithResend({
            to: customerEmail,
            subject: `${COMPANY_NAME} booking received`,
            html: buildCustomerEmail(baseTemplateParams),
          });
        } else {
          await sendEmail(EMAILJS_CUSTOMER_PENDING_TEMPLATE_ID, {
            ...baseTemplateParams,
            to_email: customerEmail,
            customer_email: customerEmail,
          });
        }
      }
    }

    if (
      dbEvent === "UPDATE" &&
      customerEmail &&
      previousStatus !== bookingStatus &&
      (bookingStatus === "confirmed" || bookingStatus === "rejected")
    ) {
      if (hasResendConfig()) {
        await sendWithResend({
          to: customerEmail,
          subject: `${COMPANY_NAME} booking ${bookingStatus}`,
          html: buildCustomerEmail(baseTemplateParams),
        });
      } else {
        await sendEmail(EMAILJS_CUSTOMER_STATUS_TEMPLATE_ID, {
          ...baseTemplateParams,
          to_email: customerEmail,
          customer_email: customerEmail,
        });
      }
    }
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "Email notification failed",
      { status: 500 },
    );
  }

  return new Response("ok", { status: 200 });
});
