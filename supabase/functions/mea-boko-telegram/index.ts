import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const TELEGRAM_API = "https://api.telegram.org";
const SITE_URL = "https://meaboko92.github.io/COFDEE-MARKET-ETHIOPIA-/";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";

function databaseKey(): { key: string; legacy: boolean } | null {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return { key: legacy, legacy: true };
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (typeof keys.default === "string") return { key: keys.default, legacy: false };
  } catch { /* no configured key */ }
  return null;
}

function dbHeaders(key: { key: string; legacy: boolean }) {
  const headers: Record<string, string> = {
    apikey: key.key,
    "Content-Type": "application/json",
  };
  if (key.legacy) headers.Authorization = `Bearer ${key.key}`;
  return headers;
}

async function dbRequest(path: string, init: RequestInit = {}) {
  const key = databaseKey();
  if (!SUPABASE_URL || !key) throw new Error("Supabase database credentials are unavailable");
  const headers = { ...dbHeaders(key), ...(init.headers as Record<string, string> ?? {}) };
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
  const body = await response.text();
  if (!response.ok) {
    console.error("Supabase REST request failed", response.status, body.slice(0, 500));
    throw new Error("Database request failed");
  }
  return body ? JSON.parse(body) : null;
}

async function telegram(method: string, payload: Record<string, unknown>) {
  const response = await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) console.error("Telegram API error", method, response.status, (await response.text()).slice(0, 300));
  return response.ok;
}

async function send(chatId: number, text: string, menu = false) {
  const reply_markup = menu ? {
    inline_keyboard: [
      [{ text: "🌱 Register as Supplier", callback_data: "supplier_register" }],
      [{ text: "🛒 Browse Marketplace", url: SITE_URL + "#marketplace" }],
      [{ text: "📦 Export & Import", url: SITE_URL + "#marketplace" }],
      [{ text: "🌐 Choose Language", callback_data: "language_menu" }],
    ],
  } : undefined;
  await telegram("sendMessage", { chat_id: chatId, text, reply_markup, disable_web_page_preview: true });
}

const steps = [
  { key: "contact_person", prompt: "1/7. What is your full name?" },
  { key: "business_name", prompt: "2/7. What is your business or cooperative name?" },
  { key: "email", prompt: "3/7. What is your email address?" },
  { key: "phone", prompt: "4/7. What is your phone number, including country code?" },
  { key: "business_role", prompt: "5/7. What best describes you? (Farmer, cooperative, supplier, exporter, processor, or trader)" },
  { key: "market_interest", prompt: "6/7. Which market interests you? Reply domestic, export, or both." },
  { key: "coffee_details", prompt: "7/7. Describe your coffee, origin and approximate available quantity. You may type Skip." },
];

async function beginRegistration(chatId: number) {
  await dbRequest("telegram_registration_sessions?on_conflict=chat_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ chat_id: String(chatId), step: steps[0].key, form_data: {} }),
  });
  await send(chatId, "MEA BOKO supplier registration started. Your application will be marked pending for review.\n\n" + steps[0].prompt);
}

async function currentSession(chatId: number) {
  const rows = await dbRequest(`telegram_registration_sessions?chat_id=eq.${encodeURIComponent(String(chatId))}&select=chat_id,step,form_data`);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function saveSession(chatId: number, step: string, formData: Record<string, string>) {
  await dbRequest("telegram_registration_sessions?on_conflict=chat_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ chat_id: String(chatId), step, form_data: formData, updated_at: new Date().toISOString() }),
  });
}

async function removeSession(chatId: number) {
  await dbRequest(`telegram_registration_sessions?chat_id=eq.${encodeURIComponent(String(chatId))}`, { method: "DELETE" });
}

async function handleRegistration(chatId: number, incoming: string) {
  const session = await currentSession(chatId);
  if (!session) return false;
  const stepIndex = steps.findIndex((step) => step.key === session.step);
  if (stepIndex < 0) {
    await removeSession(chatId);
    await send(chatId, "Your registration session was reset. Send /register to start again.");
    return true;
  }
  const value = incoming.trim();
  if (!value) {
    await send(chatId, steps[stepIndex].prompt);
    return true;
  }
  const key = steps[stepIndex].key;
  if (key === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    await send(chatId, "That email does not look valid. Please enter it again.");
    return true;
  }
  if (key === "market_interest" && !["domestic", "export", "both"].includes(value.toLowerCase())) {
    await send(chatId, "Please reply with domestic, export, or both.");
    return true;
  }
  const formData = { ...(session.form_data ?? {}), [key]: key === "coffee_details" && value.toLowerCase() === "skip" ? "" : value };
  if (stepIndex < steps.length - 1) {
    const next = steps[stepIndex + 1];
    await saveSession(chatId, next.key, formData);
    await send(chatId, next.prompt);
    return true;
  }
  const application = {
    contact_person: formData.contact_person,
    business_name: formData.business_name,
    email: formData.email,
    phone: formData.phone,
    business_role: formData.business_role,
    market_interest: formData.market_interest.toLowerCase(),
    coffee_details: formData.coffee_details || null,
    telegram_chat_id: String(chatId),
    status: "pending",
  };
  await dbRequest("supplier_applications", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(application),
  });
  await removeSession(chatId);
  await send(chatId, "✅ Thank you. Your MEA BOKO supplier application has been submitted and is pending review. We will contact you using the details you provided.\n\nSend /start to return to the main menu.");
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") return new Response("MEA BOKO Telegram webhook is ready.");
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!BOT_TOKEN || !WEBHOOK_SECRET) return new Response("Webhook configuration incomplete", { status: 503 });
  if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });

  try {
    const update = await req.json();
    if (update?.callback_query) {
      const callback = update.callback_query;
      const chatId = callback.message?.chat?.id;
      await telegram("answerCallbackQuery", { callback_query_id: callback.id });
      if (typeof chatId === "number" && callback.data === "supplier_register") await beginRegistration(chatId);
      if (typeof chatId === "number" && callback.data === "language_menu") {
        await send(chatId, "Choose a language by sending one command:\n/start en — English\n/start am — Amharic\n/start om — Afaan Oromo");
      }
      return new Response("ok");
    }

    const message = update?.message;
    const chatId = message?.chat?.id;
    if (typeof chatId !== "number") return new Response("ok");
    const incoming = typeof message?.text === "string" ? message.text.trim() : "";
    if (incoming === "/cancel") {
      await removeSession(chatId);
      await send(chatId, "Registration cancelled. Send /start to open the menu.");
      return new Response("ok");
    }
    if (incoming === "/start" || incoming.startsWith("/start ") || incoming === "/help") {
      const lang = incoming.endsWith("am") ? "am" : incoming.endsWith("om") ? "om" : "en";
      const welcome = lang === "am"
        ? "ወደ MEA BOKO የቡና ገበያ እንኳን በደህና መጡ ☕"
        : lang === "om"
        ? "Gara gabaa buna MEA BOKO baga nagaan dhuftan ☕"
        : "Welcome to MEA BOKO Coffee Marketplace ☕\nConnect with Ethiopian coffee suppliers, buyers and exporters.";
      await send(chatId, welcome + "\n\nChoose an option:", true);
      return new Response("ok");
    }
    if (incoming === "/register" || incoming.toLowerCase() === "register as supplier") {
      await beginRegistration(chatId);
      return new Response("ok");
    }
    if (await handleRegistration(chatId, incoming)) return new Response("ok");
    await send(chatId, "Thanks for contacting MEA BOKO. Send /start for the menu or /register to apply as a supplier.");
    return new Response("ok");
  } catch (error) {
    console.error("MEA BOKO Telegram webhook error", error instanceof Error ? error.message : "unknown");
    return new Response(JSON.stringify({ error: "Webhook processing failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
