import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://meaboko92.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Content-Type": "application/json",
};

// Deliberately fixed to Ethio telecom's documented test-bed gateway.
// There is no production switch in this function.
const TELEBIRR_UAT_BASE =
  "https://developerportal.ethiotelebirr.et:38443/apiaccess/payment/gateway";

type JsonObject = Record<string, unknown>;

const reply = (body: JsonObject, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

function getAdminKey(): string {
  const secretMap = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretMap) {
    try {
      const parsed = JSON.parse(secretMap);
      if (typeof parsed?.default === "string") return parsed.default;
    } catch {
      // Fall through to the legacy server-only key.
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

function getTelebirrConfig() {
  return {
    fabricAppId: Deno.env.get("TELEBIRR_FABRIC_APP_ID") ?? "",
    appSecret: Deno.env.get("TELEBIRR_APP_SECRET") ?? "",
    merchantAppId: Deno.env.get("TELEBIRR_MERCHANT_APP_ID") ?? "",
    merchantCode: Deno.env.get("TELEBIRR_MERCHANT_CODE") ?? "",
    privateKey: Deno.env.get("TELEBIRR_PRIVATE_KEY") ?? "",
    publicKey: Deno.env.get("TELEBIRR_PUBLIC_KEY") ?? "",
  };
}

function configuredForCheckout() {
  const c = getTelebirrConfig();
  return Boolean(c.fabricAppId && c.appSecret && c.merchantAppId &&
    c.merchantCode && c.privateKey && c.publicKey);
}

function randomHex(bytes = 16) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(data, (b) => b.toString(16).padStart(2, "0")).join("");
}

function pemBytes(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  if (!pem.includes("BEGIN PRIVATE KEY")) {
    throw new Error("TELEBIRR_PRIVATE_KEY must be PKCS#8 PEM (BEGIN PRIVATE KEY).");
  }
  return await crypto.subtle.importKey(
    "pkcs8",
    pemBytes(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function importPublicKey(pem: string): Promise<CryptoKey> {
  if (!pem.includes("BEGIN PUBLIC KEY")) {
    throw new Error("TELEBIRR_PUBLIC_KEY must be SPKI PEM (BEGIN PUBLIC KEY).");
  }
  return await crypto.subtle.importKey(
    "spki",
    pemBytes(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

const SIGN_EXCLUDES = new Set([
  "sign", "sign_type", "header", "refund_info", "openType",
  "raw_request", "wallet_reference_data", "biz_content",
]);

function canonicalString(input: JsonObject): string {
  const flattened: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SIGN_EXCLUDES.has(key) || value === null || value === undefined) continue;
    if (typeof value !== "object") flattened[key] = String(value);
  }
  const biz = input.biz_content;
  if (biz && typeof biz === "object" && !Array.isArray(biz)) {
    for (const [key, value] of Object.entries(biz as JsonObject)) {
      if (SIGN_EXCLUDES.has(key) || value === null || value === undefined) continue;
      if (typeof value !== "object") flattened[key] = String(value);
    }
  }
  return Object.keys(flattened).sort().map((key) => key + "=" + flattened[key]).join("&");
}

async function signRequest(input: JsonObject, privatePem: string): Promise<string> {
  const key = await importPrivateKey(privatePem);
  const bytes = new TextEncoder().encode(canonicalString(input));
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, bytes);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function verifyProviderSignature(input: JsonObject, publicPem: string): Promise<boolean> {
  const signature = typeof input.sign === "string" ? input.sign : "";
  const signType = String(input.sign_type ?? "");
  if (!signature || signType !== "SHA256WithRSA") return false;
  const key = await importPublicKey(publicPem);
  const signatureBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
  return await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signatureBytes,
    new TextEncoder().encode(canonicalString(input)),
  );
}

function minorUnits(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round((n + Number.EPSILON) * 100);
}

function newMerchantReference() {
  return "MB" + randomHex(12);
}

async function getFabricToken(): Promise<string> {
  const c = getTelebirrConfig();
  const response = await fetch(TELEBIRR_UAT_BASE + "/payment/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-APP-Key": c.fabricAppId },
    body: JSON.stringify({ appSecret: c.appSecret }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  const token = typeof data?.token === "string" ? data.token.replace(/^Bearer\s+/i, "") : "";
  if (!response.ok || !token) {
    console.error("Telebirr UAT fabric-token request failed", {
      http_status: response.status,
      code: String(data?.errorCode ?? data?.code ?? "TOKEN_ERROR"),
    });
    throw new Error("Telebirr UAT could not issue a fabric token. Check the sandbox credentials and merchant permissions.");
  }
  return token;
}

async function telebirrPost(path: string, body: JsonObject, token: string) {
  const c = getTelebirrConfig();
  const response = await fetch(TELEBIRR_UAT_BASE + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-APP-Key": c.fabricAppId,
      "Authorization": "Bearer " + token,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Telebirr UAT API request failed", {
      path, http_status: response.status,
      code: String(data?.errorCode ?? data?.code ?? "API_ERROR"),
    });
    throw new Error("Telebirr UAT rejected the request. Check the sandbox app permissions and request configuration.");
  }
  return data as JsonObject;
}

async function makeSignedRequest(method: string, bizContent: JsonObject): Promise<JsonObject> {
  const c = getTelebirrConfig();
  const request: JsonObject = {
    timestamp: String(Math.floor(Date.now() / 1000)),
    nonce_str: randomHex(16).toUpperCase(),
    method,
    version: "1.0",
    biz_content: bizContent,
  };
  request.sign = await signRequest(request, c.privateKey);
  request.sign_type = "SHA256WithRSA";
  return request;
}

function requireSuccessResponse(data: JsonObject) {
  const result = String(data.result ?? "").toUpperCase();
  const code = String(data.code ?? "");
  if (result !== "SUCCESS" || code !== "0") {
    const errorCode = String(data.errorCode ?? code ?? "UNKNOWN");
    console.error("Telebirr UAT returned a non-success response", { error_code: errorCode });
    throw new Error("Telebirr UAT could not create or verify this payment. Check merchant sandbox permissions.");
  }
}

async function completePayment(
  admin: ReturnType<typeof createClient>,
  payload: JsonObject,
  verificationSource: string,
) {
  const merchantReference = String(payload.merch_order_id ?? "");
  const transactionId = String(payload.trans_id ?? "");
  const paymentOrderId = String(payload.payment_order_id ?? "");
  const amount = minorUnits(payload.total_amount);
  const currency = String(payload.trans_currency ?? "").toUpperCase();
  if (!/^MB[a-f0-9]{24}$/i.test(merchantReference) || !amount ||
      currency !== "ETB" || (!transactionId && !paymentOrderId)) {
    return reply({ error: "Payment notification details are incomplete or invalid." }, 400);
  }

  const { data: tx, error: txError } = await admin.from("payment_transactions")
    .select("id,order_id,buyer_id,merchant_reference,amount_minor,currency,payment_stage,status,payment_record_id")
    .eq("provider", "telebirr")
    .eq("merchant_reference", merchantReference)
    .maybeSingle();
  if (txError || !tx) return reply({ error: "MEA BOKO payment transaction was not found." }, 404);

  if (Number(tx.amount_minor) !== amount || String(tx.currency).toUpperCase() !== currency) {
    console.error("Telebirr payment amount/currency mismatch", {
      merchant_reference: merchantReference,
      amount_matches: Number(tx.amount_minor) === amount,
      currency_matches: String(tx.currency).toUpperCase() === currency,
    });
    return reply({ error: "Telebirr payment details do not match the MEA BOKO order." }, 409);
  }

  if (tx.status === "success" && tx.payment_record_id) {
    return reply({ status: "success", message: "Payment was already recorded.", merchant_reference: merchantReference });
  }

  const paymentReference = paymentOrderId || transactionId;
  const { data: existing } = await admin.from("order_payment_records")
    .select("id")
    .eq("payment_method", "telebirr")
    .eq("payment_reference", paymentReference)
    .maybeSingle();

  let recordId = existing?.id ?? null;
  if (!recordId) {
    const { data: record, error: insertError } = await admin.from("order_payment_records")
      .insert({
        order_id: tx.order_id,
        submitted_by: tx.buyer_id,
        amount: (amount / 100).toFixed(2),
        currency: "ETB",
        payment_stage: tx.payment_stage,
        payment_method: "telebirr",
        payment_reference: paymentReference,
        payment_date: new Date().toISOString().slice(0, 10),
        notes: "Telebirr UAT payment; server-side signature and order verification succeeded.",
        status: "confirmed",
        review_note: "Verified by Telebirr UAT " + verificationSource + ".",
      })
      .select("id")
      .single();
    if (insertError || !record) {
      console.error("Telebirr payment record insert failed", insertError?.message);
      return reply({ error: "Payment verification succeeded, but the payment record could not be saved. Contact MEA BOKO support." }, 500);
    }
    recordId = record.id;
  }

  const { error: updateError } = await admin.from("payment_transactions")
    .update({
      status: "success",
      provider_reference: paymentOrderId || null,
      provider_transaction_id: transactionId || null,
      payment_record_id: recordId,
      provider_response: {
        source: verificationSource,
        trade_status: String(payload.trade_status ?? payload.order_status ?? "PAY_SUCCESS"),
        currency: "ETB",
        amount_minor: amount,
      },
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", tx.id);
  if (updateError) {
    console.error("Telebirr transaction update failed", updateError.message);
    return reply({ error: "Verified payment record saved, but transaction status update failed. Contact support." }, 500);
  }
  return reply({ status: "success", message: "Telebirr UAT payment verified and recorded.", merchant_reference: merchantReference });
}

async function createCheckout(admin: ReturnType<typeof createClient>, user: { id: string }, body: JsonObject) {
  if (!configuredForCheckout()) {
    return reply({
      error: "Telebirr UAT credentials are not configured.",
      required_secrets: [
        "TELEBIRR_FABRIC_APP_ID", "TELEBIRR_APP_SECRET",
        "TELEBIRR_MERCHANT_APP_ID", "TELEBIRR_MERCHANT_CODE",
        "TELEBIRR_PRIVATE_KEY", "TELEBIRR_PUBLIC_KEY",
      ],
      mode: "sandbox_only",
    }, 503);
  }

  const orderId = typeof body.order_id === "string" ? body.order_id : "";
  const amountMinor = minorUnits(body.amount);
  const stage = ["deposit", "balance", "full_payment"].includes(String(body.payment_stage))
    ? String(body.payment_stage)
    : "full_payment";
  if (!orderId || !amountMinor) return reply({ error: "A valid order and payment amount are required." }, 400);

  const { data: order, error: orderError } = await admin.from("orders")
    .select("id,buyer_id,quantity_kg,agreed_price,currency,status")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError || !order) return reply({ error: "Order not found." }, 404);
  if (order.buyer_id !== user.id) return reply({ error: "Only the buyer who created this order can pay it." }, 403);
  if (!["confirmed", "fulfilled"].includes(String(order.status)) || !order.agreed_price) {
    return reply({ error: "The order must be confirmed with an agreed price before payment." }, 409);
  }
  if (String(order.currency ?? "ETB").toUpperCase() !== "ETB") {
    return reply({ error: "Telebirr UAT checkout is configured for ETB only." }, 400);
  }
  const totalMinor = minorUnits(Number(order.quantity_kg) * Number(order.agreed_price));
  if (!totalMinor || amountMinor > totalMinor || (stage === "full_payment" && amountMinor !== totalMinor)) {
    return reply({ error: "Payment amount must match the full order total or be a valid partial installment." }, 400);
  }

  const merchantReference = newMerchantReference();
  const { data: tx, error: txError } = await admin.from("payment_transactions")
    .insert({
      order_id: order.id,
      buyer_id: user.id,
      provider: "telebirr",
      merchant_reference: merchantReference,
      amount: (amountMinor / 100).toFixed(2),
      amount_minor: amountMinor,
      currency: "ETB",
      payment_stage: stage,
      status: "pending",
    })
    .select("id")
    .single();
  if (txError || !tx) {
    console.error("Telebirr transaction insert failed", txError?.message);
    return reply({ error: "Could not create the secure Telebirr payment record." }, 500);
  }

  try {
    const c = getTelebirrConfig();
    const fabricToken = await getFabricToken();
    const notifyUrl = PROJECT_URL + "/functions/v1/mea-boko-telebirr";
    const bizContent: JsonObject = {
      notify_url: notifyUrl,
      appid: c.merchantAppId,
      merch_code: c.merchantCode,
      merch_order_id: merchantReference,
      trade_type: "InApp",
      title: "MEA BOKO coffee order",
      total_amount: (amountMinor / 100).toFixed(2),
      trans_currency: "ETB",
      timeout_express: "30m",
      business_type: "BuyGoods",
    };
    const signed = await makeSignedRequest("payment.preorder", bizContent);
    const result = await telebirrPost("/payment/v1/merchant/preOrder", signed, fabricToken);
    requireSuccessResponse(result);

    const responseBiz = result.biz_content as JsonObject | undefined;
    const prepayId = String(responseBiz?.prepay_id ?? "");
    if (!prepayId) throw new Error("Telebirr UAT did not return a prepay_id.");

    // This is the documented Telebirr receiveCode format consumed by startPay.
    const rawRequest = [
      "TELEBIRR", "BUYGOODS", c.merchantCode,
      (amountMinor / 100).toFixed(2), prepayId, "30m",
    ].join("$");

    const { error: updateError } = await admin.from("payment_transactions")
      .update({
        provider_reference: prepayId,
        provider_response: { mode: "UAT", result: "SUCCESS", prepay_id_received: true },
        updated_at: new Date().toISOString(),
      })
      .eq("id", tx.id);
    if (updateError) throw new Error("Could not save the Telebirr UAT prepay reference.");

    return reply({
      mode: "sandbox_only",
      raw_request: rawRequest,
      merchant_reference: merchantReference,
      amount: (amountMinor / 100).toFixed(2),
      currency: "ETB",
    });
  } catch (error) {
    await admin.from("payment_transactions")
      .update({
        status: "failed",
        provider_response: { mode: "UAT", error: error instanceof Error ? error.message.slice(0, 240) : "Checkout failed" },
        updated_at: new Date().toISOString(),
      })
      .eq("id", tx.id);
    return reply({ error: error instanceof Error ? error.message : "Telebirr UAT checkout failed." }, 502);
  }
}

async function verifyPayment(admin: ReturnType<typeof createClient>, user: { id: string }, body: JsonObject) {
  if (!configuredForCheckout()) return reply({ error: "Telebirr UAT credentials are not configured.", mode: "sandbox_only" }, 503);
  const merchantReference = typeof body.merchant_reference === "string" ? body.merchant_reference : "";
  if (!merchantReference) return reply({ error: "Payment reference is required." }, 400);

  const { data: tx, error } = await admin.from("payment_transactions")
    .select("id,order_id,buyer_id,merchant_reference,provider_reference,amount_minor,currency,status,payment_record_id")
    .eq("provider", "telebirr")
    .eq("merchant_reference", merchantReference)
    .eq("buyer_id", user.id)
    .maybeSingle();
  if (error || !tx) return reply({ error: "Telebirr payment record not found for this account." }, 404);
  if (tx.status === "success") return reply({ status: "success", message: "Payment was already verified.", merchant_reference: merchantReference });

  try {
    const c = getTelebirrConfig();
    const token = await getFabricToken();
    const request = await makeSignedRequest("payment.queryorder", {
      appid: c.merchantAppId,
      merch_order_id: merchantReference,
    });
    const result = await telebirrPost("/payment/v1/merchant/queryOrder", request, token);
    requireSuccessResponse(result);
    if (!await verifyProviderSignature(result, c.publicKey)) {
      console.error("Telebirr queryOrder response signature verification failed");
      return reply({ error: "Telebirr verification response signature was invalid." }, 502);
    }
    const biz = result.biz_content as JsonObject | undefined;
    if (!biz || String(biz.merch_order_id ?? "") !== merchantReference) {
      return reply({ error: "Telebirr verification response did not match the merchant order." }, 409);
    }
    const status = String(biz.trade_status ?? biz.order_status ?? "").toUpperCase();
    if (status !== "PAY_SUCCESS") {
      return reply({
        status: status === "PAY_FAILED" || status === "ORDER_CLOSED" ? "failed" : "pending",
        message: "Telebirr has not confirmed a successful payment. Do not mark this order paid.",
      }, 409);
    }
    return await completePayment(admin, {
      merch_order_id: biz.merch_order_id,
      total_amount: biz.total_amount,
      trans_currency: biz.trans_currency,
      payment_order_id: biz.payment_order_id,
      trans_id: biz.trans_id,
      trade_status: status,
    }, "signed queryOrder");
  } catch (error) {
    console.error("Telebirr verify request failed", error instanceof Error ? error.message : "Unknown error");
    return reply({ error: "Telebirr UAT could not verify the payment. Please retry later." }, 502);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") {
    return reply({
      service: "MEA BOKO Telebirr",
      mode: "sandbox_only",
      status: "ready_for_sandbox_credentials",
      credentials_configured: configuredForCheckout(),
    });
  }
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);

  const adminKey = getAdminKey();
  if (!PROJECT_URL || !adminKey) return reply({ error: "Supabase server configuration is incomplete." }, 503);
  const admin = createClient(PROJECT_URL, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json() as JsonObject;
    const c = getTelebirrConfig();

    // Public callback: authenticate the provider with its registered public key.
    if (body.action === "telebirr_notify" || body.trade_status !== undefined) {
      if (!c.publicKey) return reply({ error: "Telebirr callback verification key is not configured." }, 503);
      const valid = await verifyProviderSignature(body, c.publicKey);
      if (!valid) return reply({ error: "Invalid Telebirr callback signature." }, 401);
      if (String(body.appid ?? "") !== c.merchantAppId ||
          String(body.merch_code ?? "") !== c.merchantCode) {
        return reply({ error: "Telebirr callback merchant identity mismatch." }, 409);
      }
      const status = String(body.trade_status ?? "").toUpperCase();
      if (status !== "COMPLETED") {
        return reply({ received: true, status: "not_paid", message: "Callback received; payment is not completed." });
      }
      return await completePayment(admin, body, "signed notification");
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) return reply({ error: "Sign in to your MEA BOKO account first." }, 401);
    const { data, error } = await admin.auth.getUser(jwt);
    if (error || !data?.user) return reply({ error: "Your sign-in session is invalid. Please sign in again." }, 401);

    if (body.action === "create_checkout") return await createCheckout(admin, data.user, body);
    if (body.action === "verify_payment") return await verifyPayment(admin, data.user, body);
    return reply({ error: "Unknown Telebirr action." }, 400);
  } catch (error) {
    console.error("MEA BOKO Telebirr handler error", error instanceof Error ? error.message : "Unknown error");
    return reply({ error: "Telebirr request could not be processed." }, 500);
  }
});
