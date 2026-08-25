"use server";

import crypto from "crypto";
import { requireSession } from "./_helpers";
import {
  getSettings as svcGetSettings,
  setSettings as svcSetSettings,
  searchSourceProducts as svcSearchSourceProducts,
} from "@/queries/thunjai.js";
import {
  THUNJAI_DEFAULTS,
  THUNJAI_KEYS,
  type ThunJaiSettings,
} from "@/lib/thunjai-config";
import { userError } from "@/lib/action-error";

function resolveBaseUrl(settings: ThunJaiSettings) {
  const custom = settings["thunjai.base_url"].trim();
  if (custom) return custom.replace(/\/+$/, "");
  return settings["thunjai.environment"] === "production"
    ? "https://apis.thunjaiexpress.com"
    : "https://stg-apis.thunjaiexpress.com";
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function cleanNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function requiredNumber(value: unknown, label: string) {
  const n = cleanNumber(value);
  if (n == null) throw new Error(`${label} is required`);
  return n;
}

function requiredString(value: unknown, label: string) {
  const s = cleanString(value);
  if (!s) throw new Error(`${label} is required`);
  return s;
}

function cleanBoolean(value: unknown) {
  return value === true || value === "true" || value === "1" || value === 1;
}

async function readSettings(): Promise<ThunJaiSettings> {
  const saved = (await svcGetSettings(
    THUNJAI_KEYS as unknown as string[]
  )) as Partial<ThunJaiSettings>;
  return { ...THUNJAI_DEFAULTS, ...saved };
}

export async function getThunJaiSettings(): Promise<ThunJaiSettings> {
  await requireSession();
  return readSettings();
}

export async function saveThunJaiSettings(input: Partial<ThunJaiSettings>) {
  const session = await requireSession();
  const filtered: Record<string, string> = {};
  for (const key of THUNJAI_KEYS) {
    if (key in input) filtered[key] = input[key] ?? "";
  }
  return svcSetSettings(filtered, (session as { code?: string })?.code);
}

async function requestToken(settings: ThunJaiSettings) {
  const user = settings["thunjai.user"].trim();
  const pwd = settings["thunjai.pwd"];
  const secretKey = settings["thunjai.secret_key"];
  if (!user || !pwd) {
    throw new Error("ThunJai API user and password are required");
  }

  const payload: Record<string, string> = { user, pwd };
  if (secretKey.trim()) {
    payload.sign = crypto
      .createHmac("sha256", secretKey)
      .update(`user=${user}&pwd=${pwd}`)
      .digest("hex");
  }

  const url = `${resolveBaseUrl(settings)}/auth/requestToken`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      locale: settings["thunjai.locale"].trim() || "la",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  return { response, text: await response.text(), url };
}

function parseJsonText(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function getAccessToken(settings: ThunJaiSettings) {
  const { response, text } = await requestToken(settings);
  const body = parseJsonText(text);
  const data =
    body && typeof body === "object" && "data" in body
      ? (body as { data?: unknown }).data
      : body;
  const token =
    data && typeof data === "object"
      ? cleanString((data as Record<string, unknown>).access_token)
      : "";
  if (!response.ok || !token) {
    throw new Error(`ThunJai auth failed: HTTP ${response.status}`);
  }
  return token;
}

async function callThunJaiApi(
  method: "GET" | "POST" | "PUT" | "DELETE",
  endpoint: string,
  body?: unknown
) {
  await requireSession();
  const settings = await readSettings();
  if (
    settings["thunjai.enabled"] !== "1" &&
    settings["thunjai.enabled"] !== "true"
  ) {
    throw new Error("ThunJai module is disabled");
  }
  const token = await getAccessToken(settings);
  return sendThunJaiApi(settings, token, method, endpoint, body);
}

async function sendThunJaiApi(
  settings: ThunJaiSettings,
  token: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  endpoint: string,
  body?: unknown
) {
  const response = await fetch(`${resolveBaseUrl(settings)}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
      locale: settings["thunjai.locale"].trim() || "la",
    },
    body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(body ?? {}),
    cache: "no-store",
  });
  const text = await response.text();
  const parsed = parseJsonText(text);
  if (!response.ok) {
    const apiError =
      parsed && typeof parsed === "object"
        ? cleanString((parsed as Record<string, unknown>).error)
        : "";
    const detail = apiError || cleanString(text).slice(0, 200);
    throw new Error(
      `ThunJai API HTTP ${response.status} (${method} ${endpoint})${detail ? `: ${detail}` : ""}`
    );
  }
  return parsed;
}

export async function testThunJaiToken() {
  await requireSession();
  const settings = await readSettings();
  const { response, text, url } = await requestToken(settings);

  const body = parseJsonText(text);

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    url,
    body,
  };
}

export async function listThunJaiOrders(input: unknown) {
  const data = asObject(input);
  const params = new URLSearchParams({
    date_start: cleanString(data.date_start),
    date_end: cleanString(data.date_end),
  });
  const orderNo = cleanString(data.order_no);
  if (orderNo) params.set("order_no", orderNo);
  return callThunJaiApi("GET", `/order/list?${params.toString()}`);
}

export async function listThunJaiSenderAddresses() {
  return callThunJaiApi("GET", "/user/address/list");
}

export async function listThunJaiPackaging() {
  return callThunJaiApi("GET", "/master/packaging");
}

export async function listThunJaiProvinces() {
  return callThunJaiApi("GET", "/master/provinces");
}

export async function listThunJaiDistricts(provinceId: unknown) {
  const id = requiredNumber(provinceId, "Province ID");
  return callThunJaiApi("GET", `/master/districts?province_id=${encodeURIComponent(String(id))}`);
}

export async function listThunJaiVillages(districtId: unknown) {
  const id = requiredNumber(districtId, "District ID");
  return callThunJaiApi("GET", `/master/villages?district_id=${encodeURIComponent(String(id))}`);
}

export async function searchThunJaiSourceProducts(search: unknown) {
  await requireSession();
  return svcSearchSourceProducts(search);
}

export async function checkThunJaiServiceType(input: unknown) {
  const data = asObject(input);
  return callThunJaiApi("POST", "/order/service/checkServiceType", {
    sender_addr_id: requiredNumber(data.sender_addr_id, "Sender address ID"),
    district_sub_id: requiredNumber(data.district_sub_id, "Receiver village ID"),
  });
}

export async function estimateThunJaiPrice(input: unknown) {
  const data = asObject(input);
  return callThunJaiApi("POST", "/order/service/estimatePrice", {
    src_province: requiredNumber(data.src_province, "Source province"),
    src_district: requiredNumber(data.src_district, "Source district"),
    dest_province: requiredNumber(data.dest_province, "Destination province"),
    dest_district: requiredNumber(data.dest_district, "Destination district"),
    service_type: requiredNumber(data.service_type, "Service type"),
    weight: cleanNumber(data.weight) ?? 0,
    width: cleanNumber(data.width) ?? 0,
    long: cleanNumber(data.long) ?? 0,
    height: cleanNumber(data.height) ?? 0,
  });
}

export async function createThunJaiOrder(input: unknown) {
  await requireSession();
  const data = asObject(input);
  const packageType = asObject(data.package_type);
  const rawProducts = Array.isArray(data.product_list) ? data.product_list : [];
  const productInputs =
    rawProducts.length > 0
      ? rawProducts.map((item) => asObject(item))
      : [
          {
            name: data.product_name,
            qty: data.qty,
            weight: data.weight,
            price: data.price,
          },
        ];
  const products = productInputs.map((item, index) => {
    const itemPackageType = asObject(item.package_type);
    const requestedQty = requiredNumber(item.qty, `Product ${index + 1} quantity`);
    if (requestedQty <= 0) throw new Error(`Product ${index + 1} quantity must be greater than 0`);
    return {
      name: requiredString(item.name ?? item.product_name, `Product ${index + 1} name`),
      requestedQty,
      weight: requiredNumber(item.weight ?? data.weight, `Product ${index + 1} weight`),
      package_type: {
        id:
          cleanNumber(itemPackageType.id) ??
          cleanNumber(item.package_type_id) ??
          cleanNumber(packageType.id) ??
          cleanNumber(data.package_type_id) ??
          0,
        width: requiredNumber(
          itemPackageType.width ?? item.width ?? packageType.width ?? data.width,
          `Product ${index + 1} package width`
        ),
        long: requiredNumber(
          itemPackageType.long ?? item.long ?? packageType.long ?? data.long,
          `Product ${index + 1} package length`
        ),
        height: requiredNumber(
          itemPackageType.height ?? item.height ?? packageType.height ?? data.height,
          `Product ${index + 1} package height`
        ),
      },
      is_cod: cleanBoolean(item.is_cod ?? data.is_cod),
      price: cleanNumber(item.price ?? data.price) ?? 0,
    };
  });
  if (products.length === 0) throw new Error("At least one product is required");
  // A COD parcel with price 0 would ship to the courier collecting nothing —
  // reject it instead of silently sending 0.
  products.forEach((p, i) => {
    if (p.is_cod && (p.price == null || p.price <= 0)) {
      throw userError(`Product ${i + 1}: COD ต้องระบุราคาเก็บเงินมากกว่า 0`);
    }
  });

  const settings = await readSettings();
  if (
    settings["thunjai.enabled"] !== "1" &&
    settings["thunjai.enabled"] !== "true"
  ) {
    throw new Error("ThunJai module is disabled");
  }
  const token = await getAccessToken(settings);
  const baseSenderOrderNo = cleanString(data.sender_order_no);
  const commonPayload = {
    sender_addr_id: requiredNumber(data.sender_addr_id, "Sender address ID"),
    receive_id: cleanNumber(data.receive_id) ?? undefined,
    receive_phone_no: requiredString(data.receive_phone_no, "Receiver phone"),
    receive_name: requiredString(data.receive_name, "Receiver name"),
    receive_address: requiredString(data.receive_address, "Receiver address"),
    receive_province: requiredNumber(data.receive_province, "Receiver province"),
    receive_district: requiredNumber(data.receive_district, "Receiver district"),
    receive_district_sub: requiredNumber(data.receive_district_sub, "Receiver village"),
    service_type: requiredNumber(data.service_type, "Service type"),
    note_rider: cleanString(data.note_rider),
    note_hub: cleanString(data.note_hub),
    note_deliverer: cleanString(data.note_deliverer),
  };

  const payload = {
    ...commonPayload,
    sender_order_no: baseSenderOrderNo,
    is_service_at_dest: cleanBoolean(data.is_service_at_dest),
    product_list: products.map((product) => ({
      name: product.name,
      qty: product.requestedQty,
      weight: product.weight,
      package_type: product.package_type,
      is_cod: product.is_cod,
      price: product.price,
    })),
  };
  const response = await sendThunJaiApi(
    settings,
    token,
    "PUT",
    "/order/service/create",
    payload
  );
  const results = [
    {
      ok: true,
      index: 1,
      sender_order_no: baseSenderOrderNo,
      product_count: products.length,
      payload,
      response,
    },
  ];

  return {
    success: true,
    mode: "api_native_product_list",
    requested_product_count: products.length,
    requested_order_count: 1,
    created_order_count: 1,
    payload,
    response,
    results,
  };
}

export async function deleteThunJaiOrder(id: unknown) {
  const n = cleanNumber(id);
  if (!n) throw new Error("Order ID is required");
  return callThunJaiApi("DELETE", `/order/delete?id=${encodeURIComponent(String(n))}`);
}

export async function getThunJaiOrderDetail(id: unknown) {
  const n = cleanNumber(id);
  if (!n) throw new Error("Order ID is required");
  return callThunJaiApi("GET", `/order/detail?id=${encodeURIComponent(String(n))}`);
}

export async function getThunJaiOrderTracking(id: unknown) {
  const n = cleanNumber(id);
  if (!n) throw new Error("Order ID is required");
  return callThunJaiApi("GET", `/order/tracking?id=${encodeURIComponent(String(n))}`);
}

export async function getThunJaiOrderLabel(id: unknown) {
  const n = cleanNumber(id);
  if (!n) throw new Error("Order ID is required");
  return callThunJaiApi("GET", `/order/label?id=${encodeURIComponent(String(n))}`);
}

export async function listThunJaiPickups(input: unknown) {
  const data = asObject(input);
  const params = new URLSearchParams({
    date_start: cleanString(data.date_start),
    date_end: cleanString(data.date_end),
  });
  return callThunJaiApi("GET", `/pickup/list?${params.toString()}`);
}

export async function requestThunJaiPickup(input: unknown) {
  const data = asObject(input);
  const senderAddrId = cleanNumber(data.sender_addr_id);
  const rawOrderIds = Array.isArray(data.order_id_list)
    ? data.order_id_list
    : cleanString(data.order_id_list)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  const orderIds = rawOrderIds
    .map((item) => cleanNumber(item))
    .filter((item): item is number => item != null);
  if (!senderAddrId) throw new Error("Sender address ID is required");
  if (orderIds.length === 0) throw new Error("At least one order ID is required");
  return callThunJaiApi("PUT", "/pickup/request", {
    sender_addr_id: senderAddrId,
    order_id_list: orderIds,
  });
}

export async function getThunJaiPickupDetail(id: unknown) {
  const n = cleanNumber(id);
  if (!n) throw new Error("Pickup ID is required");
  return callThunJaiApi("GET", `/pickup/detail?id=${encodeURIComponent(String(n))}`);
}
