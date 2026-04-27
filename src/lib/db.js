const { Pool } = require("pg");

const globalPools = globalThis;

function getRequiredEnv(key, label) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing ${key} for ${label} database connection`);
  }
  return value;
}

function getPort(value, fallback = 5432) {
  const port = Number.parseInt(value ?? "", 10);
  return Number.isNaN(port) ? fallback : port;
}

function getSslConfig(value) {
  if (!value || value === "false") return undefined;
  return { rejectUnauthorized: false };
}

function buildPoolConfig(prefix, label) {
  return {
    host: getRequiredEnv(`PG_HOST${prefix}`, label),
    port: getPort(process.env[`PG_PORT${prefix}`], 5432),
    database: getRequiredEnv(`PG_DATABASE${prefix}`, label),
    user: getRequiredEnv(`PG_USER${prefix}`, label),
    password: process.env[`PG_PASSWORD${prefix}`] ?? "",
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: getSslConfig(process.env[`PG_SSL${prefix}`]),
  };
}

function getOrCreatePool(key, prefix) {
  if (!globalPools.__tmsPgPools) globalPools.__tmsPgPools = {};
  if (!globalPools.__tmsPgPools[key]) {
    globalPools.__tmsPgPools[key] = new Pool(buildPoolConfig(prefix, key));
  }
  return globalPools.__tmsPgPools[key];
}

function sanitizeRows(rows) {
  return JSON.parse(JSON.stringify(rows));
}

const pool = getOrCreatePool("primary", "");
const poolB = getOrCreatePool("secondary", "_B");

async function query(text, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, [...params]);
    return sanitizeRows(result.rows);
  } finally {
    client.release();
  }
}

async function queryOne(text, params = []) {
  const rows = await query(text, params);
  return rows[0] ?? null;
}

async function queryB(text, params = []) {
  const client = await poolB.connect();
  try {
    const result = await client.query(text, [...params]);
    return sanitizeRows(result.rows);
  } finally {
    client.release();
  }
}

async function queryOneB(text, params = []) {
  const rows = await queryB(text, params);
  return rows[0] ?? null;
}

module.exports = { pool, poolB, query, queryOne, queryB, queryOneB };
