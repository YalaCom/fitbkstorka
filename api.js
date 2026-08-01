import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

export async function rpc(functionName, args = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      cache: "no-store",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify(args),
      signal: controller.signal
    });

    const raw = await response.text();
    let data = null;

    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = raw;
      }
    }

    if (!response.ok) {
      const message =
        data?.message ||
        data?.hint ||
        data?.details ||
        (typeof data === "string" ? data : null) ||
        `Ошибка сервера ${response.status}`;

      throw new Error(message);
    }

    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Сервер не ответил вовремя. Проверьте интернет и повторите.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
