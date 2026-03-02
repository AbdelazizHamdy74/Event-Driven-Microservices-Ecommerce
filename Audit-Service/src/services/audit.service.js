const db = require("../config/db");
const { createError } = require("../utils/errors");

const ALLOWED_LOG_TYPES = new Set(["activity", "domain_event"]);
const ALLOWED_ROLES = new Set([
  "anonymous",
  "user",
  "admin",
  "supplier",
  "system",
]);
const ALLOWED_SEVERITIES = new Set(["info", "warning", "critical"]);

const parseJsonColumn = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
};

const mapAuditRow = (row) => ({
  id: Number(row.id),
  logType: row.logType,
  serviceName: row.serviceName,
  action: row.action,
  actorUserId:
    row.actorUserId === null || row.actorUserId === undefined
      ? null
      : Number(row.actorUserId),
  actorRole: row.actorRole,
  targetType: row.targetType,
  targetId: row.targetId,
  severity: row.severity,
  httpMethod: row.httpMethod,
  httpPath: row.httpPath,
  httpStatus:
    row.httpStatus === null || row.httpStatus === undefined
      ? null
      : Number(row.httpStatus),
  requestId: row.requestId,
  durationMs:
    row.durationMs === null || row.durationMs === undefined
      ? null
      : Number(row.durationMs),
  sourceTopic: row.sourceTopic,
  sourcePartition:
    row.sourcePartition === null || row.sourcePartition === undefined
      ? null
      : Number(row.sourcePartition),
  sourceOffset: row.sourceOffset,
  sourceEventId: row.sourceEventId,
  sourceEventType: row.sourceEventType,
  sourceEventVersion:
    row.sourceEventVersion === null || row.sourceEventVersion === undefined
      ? null
      : Number(row.sourceEventVersion),
  sourceOccurredAt: row.sourceOccurredAt,
  metadata: parseJsonColumn(row.metadata),
  payload: parseJsonColumn(row.payload),
  createdAt: row.createdAt,
});

const toTrimmedText = (value, maxLength) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
};

const toNullablePositiveInt = (value, fieldName) => {
  if (value === undefined || value === null || value === "") return null;
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw createError(`Invalid ${fieldName}`, 400);
  }
  return normalized;
};

const toNullableIntRange = (value, min, max, fieldName) => {
  if (value === undefined || value === null || value === "") return null;
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < min || normalized > max) {
    throw createError(`Invalid ${fieldName}`, 400);
  }
  return normalized;
};

const toNullableDecimal = (value, fieldName) => {
  if (value === undefined || value === null || value === "") return null;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw createError(`Invalid ${fieldName}`, 400);
  }
  return Number(normalized.toFixed(3));
};

const toNullableDate = (value, fieldName) => {
  if (value === undefined || value === null || value === "") return null;
  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    throw createError(`Invalid ${fieldName}`, 400);
  }
  return dateValue;
};

const toNullableJsonString = (value, fieldName) => {
  if (value === undefined || value === null) return null;

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return null;

    try {
      const parsed = JSON.parse(normalized);
      return JSON.stringify(parsed);
    } catch (_error) {
      throw createError(`${fieldName} must be valid JSON`, 400);
    }
  }

  if (typeof value !== "object") {
    throw createError(`${fieldName} must be an object`, 400);
  }

  try {
    return JSON.stringify(value);
  } catch (_error) {
    throw createError(`${fieldName} must be serializable`, 400);
  }
};

const normalizeLogType = (value, fallback) => {
  const normalized = toTrimmedText(value, 40)?.toLowerCase();
  if (!normalized) return fallback;
  if (!ALLOWED_LOG_TYPES.has(normalized)) {
    throw createError("Invalid logType", 400);
  }
  return normalized;
};

const normalizeRole = (value, fallback = "anonymous") => {
  const normalized = toTrimmedText(value, 20)?.toLowerCase();
  if (!normalized) return fallback;
  if (!ALLOWED_ROLES.has(normalized)) return fallback;
  return normalized;
};

const normalizeSeverity = (value, fallback) => {
  const normalized = toTrimmedText(value, 20)?.toLowerCase();
  if (!normalized) return fallback;
  if (!ALLOWED_SEVERITIES.has(normalized)) {
    throw createError("Invalid severity", 400);
  }
  return normalized;
};

const normalizeHttpMethod = (value) =>
  toTrimmedText(
    typeof value === "string" ? value.toUpperCase() : "",
    10,
  );

const normalizeHttpPath = (value) => {
  const rawPath = toTrimmedText(value, 255);
  if (!rawPath) return null;
  if (rawPath.startsWith("/")) return rawPath;
  return `/${rawPath}`;
};

const deriveSeverityFromHttpStatus = (statusCode) => {
  if (Number.isInteger(statusCode) && statusCode >= 500) return "critical";
  if (Number.isInteger(statusCode) && statusCode >= 400) return "warning";
  return "info";
};

const deriveSeverityFromEventType = (eventType) => {
  const normalized = toTrimmedText(eventType, 120)?.toUpperCase();
  if (!normalized) return "info";
  if (normalized.includes("FAILED") || normalized.includes("ERROR")) {
    return "critical";
  }
  if (
    normalized.includes("CANCEL") ||
    normalized.includes("BLOCK") ||
    normalized.includes("DENIED")
  ) {
    return "warning";
  }
  return "info";
};

const createActivityLog = async (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw createError("Invalid activity payload", 400);
  }

  const serviceName = toTrimmedText(input.serviceName, 80);
  if (!serviceName) {
    throw createError("serviceName is required", 400);
  }

  const actor = input.actor && typeof input.actor === "object" ? input.actor : {};
  const actorUserId = toNullablePositiveInt(
    actor.userId ?? actor.id,
    "actor.userId",
  );
  const actorRole = normalizeRole(actor.role, actorUserId ? "user" : "anonymous");

  const target =
    input.target && typeof input.target === "object" ? input.target : {};
  const targetType = toTrimmedText(target.type ?? input.targetType, 80);
  const targetId = toTrimmedText(target.id ?? input.targetId, 120);

  const http = input.http && typeof input.http === "object" ? input.http : {};
  const httpMethod = normalizeHttpMethod(http.method ?? input.httpMethod ?? input.method);
  const httpPath = normalizeHttpPath(http.path ?? input.httpPath ?? input.path);
  const httpStatus = toNullableIntRange(
    http.statusCode ?? http.status ?? input.httpStatus ?? input.statusCode,
    100,
    599,
    "statusCode",
  );
  const requestId = toTrimmedText(http.requestId ?? input.requestId, 64);
  const durationMs = toNullableDecimal(
    http.durationMs ?? input.durationMs,
    "durationMs",
  );
  const occurredAt = toNullableDate(input.occurredAt, "occurredAt");

  const action =
    toTrimmedText(input.action, 180) ||
    `${httpMethod || "REQUEST"} ${httpPath || "/"}`.slice(0, 180);
  const severity = normalizeSeverity(
    input.severity,
    deriveSeverityFromHttpStatus(httpStatus),
  );

  const metadata = toNullableJsonString(input.metadata, "metadata");
  const payload = toNullableJsonString(input.payload, "payload");

  await db.execute(
    [
      "INSERT INTO audit_logs",
      "(log_type, service_name, action, actor_user_id, actor_role,",
      "target_type, target_id, severity, http_method, http_path, http_status,",
      "request_id, duration_ms, source_occurred_at, metadata, payload)",
      "VALUES",
      "('activity', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      "ON DUPLICATE KEY UPDATE",
      "action = VALUES(action),",
      "actor_user_id = COALESCE(VALUES(actor_user_id), actor_user_id),",
      "actor_role = VALUES(actor_role),",
      "target_type = COALESCE(VALUES(target_type), target_type),",
      "target_id = COALESCE(VALUES(target_id), target_id),",
      "severity = VALUES(severity),",
      "duration_ms = COALESCE(VALUES(duration_ms), duration_ms),",
      "source_occurred_at = COALESCE(VALUES(source_occurred_at), source_occurred_at),",
      "metadata = COALESCE(VALUES(metadata), metadata),",
      "payload = COALESCE(VALUES(payload), payload)",
    ].join(" "),
    [
      serviceName,
      action,
      actorUserId,
      actorRole,
      targetType,
      targetId,
      severity,
      httpMethod,
      httpPath,
      httpStatus,
      requestId,
      durationMs,
      occurredAt,
      metadata,
      payload,
    ],
  );

  return {
    ok: true,
    logType: "activity",
    serviceName,
    action,
    actorUserId,
    actorRole,
    httpMethod,
    httpPath,
    httpStatus,
    requestId,
  };
};

const createDomainEventLog = async (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw createError("Invalid domain event payload", 400);
  }

  const serviceName =
    toTrimmedText(input.serviceName, 80) ||
    toTrimmedText(input.producer, 80) ||
    "unknown-producer";
  const sourceTopic = toTrimmedText(input.sourceTopic ?? input.topic, 120);
  const sourcePartition = toNullableIntRange(
    input.sourcePartition ?? input.partition,
    0,
    1000000,
    "sourcePartition",
  );
  const sourceOffset = toTrimmedText(input.sourceOffset ?? input.offset, 64);
  if (!sourceTopic || sourcePartition === null || !sourceOffset) {
    throw createError(
      "sourceTopic, sourcePartition, and sourceOffset are required",
      400,
    );
  }

  const sourceEventType = toTrimmedText(
    input.sourceEventType ?? input.eventType,
    80,
  );
  const sourceEventId = toTrimmedText(input.sourceEventId ?? input.eventId, 128);
  const sourceEventVersion = toNullableIntRange(
    input.sourceEventVersion ?? input.eventVersion,
    1,
    1000000,
    "sourceEventVersion",
  );
  const sourceOccurredAt = toNullableDate(
    input.occurredAt ?? input.sourceOccurredAt,
    "occurredAt",
  );
  const actorUserId = toNullablePositiveInt(input.actorUserId, "actorUserId");
  const actorRole = normalizeRole(input.actorRole, actorUserId ? "user" : "system");
  const action =
    toTrimmedText(input.action, 180) ||
    toTrimmedText(sourceEventType, 180) ||
    "DOMAIN_EVENT";
  const severity = normalizeSeverity(
    input.severity,
    deriveSeverityFromEventType(sourceEventType),
  );

  const metadata = toNullableJsonString(input.metadata, "metadata");
  const payload = toNullableJsonString(input.payload, "payload");

  await db.execute(
    [
      "INSERT INTO audit_logs",
      "(log_type, service_name, action, actor_user_id, actor_role, severity,",
      "source_topic, source_partition, source_offset,",
      "source_event_id, source_event_type, source_event_version, source_occurred_at,",
      "metadata, payload)",
      "VALUES",
      "('domain_event', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      "ON DUPLICATE KEY UPDATE",
      "service_name = VALUES(service_name),",
      "action = VALUES(action),",
      "actor_user_id = COALESCE(VALUES(actor_user_id), actor_user_id),",
      "actor_role = VALUES(actor_role),",
      "severity = VALUES(severity),",
      "source_event_id = COALESCE(VALUES(source_event_id), source_event_id),",
      "source_event_type = COALESCE(VALUES(source_event_type), source_event_type),",
      "source_event_version = COALESCE(VALUES(source_event_version), source_event_version),",
      "source_occurred_at = COALESCE(VALUES(source_occurred_at), source_occurred_at),",
      "metadata = COALESCE(VALUES(metadata), metadata),",
      "payload = COALESCE(VALUES(payload), payload)",
    ].join(" "),
    [
      serviceName,
      action,
      actorUserId,
      actorRole,
      severity,
      sourceTopic,
      sourcePartition,
      sourceOffset,
      sourceEventId,
      sourceEventType,
      sourceEventVersion,
      sourceOccurredAt,
      metadata,
      payload,
    ],
  );

  return {
    ok: true,
    logType: "domain_event",
    serviceName,
    sourceTopic,
    sourcePartition,
    sourceOffset,
    sourceEventType,
  };
};

const toPage = (value) => {
  if (value === undefined || value === null || value === "") return 1;
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw createError("Invalid page", 400);
  }
  return normalized;
};

const toLimit = (value) => {
  if (value === undefined || value === null || value === "") return 100;
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw createError("Invalid limit", 400);
  }
  return Math.min(normalized, 300);
};

const listAuditLogs = async (filters = {}) => {
  const page = toPage(filters.page);
  const limit = toLimit(filters.limit);
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];

  const logType = normalizeLogType(filters.logType, null);
  if (logType) {
    where.push("log_type = ?");
    params.push(logType);
  }

  const serviceName = toTrimmedText(filters.serviceName, 80);
  if (serviceName) {
    where.push("service_name = ?");
    params.push(serviceName);
  }

  const actorUserId = toNullablePositiveInt(filters.actorUserId, "actorUserId");
  if (actorUserId !== null) {
    where.push("actor_user_id = ?");
    params.push(actorUserId);
  }

  const actorRole = toTrimmedText(filters.actorRole, 20);
  if (actorRole) {
    where.push("actor_role = ?");
    params.push(normalizeRole(actorRole, "anonymous"));
  }

  const severity = toTrimmedText(filters.severity, 20);
  if (severity) {
    where.push("severity = ?");
    params.push(normalizeSeverity(severity, "info"));
  }

  const httpMethod = normalizeHttpMethod(filters.httpMethod);
  if (httpMethod) {
    where.push("http_method = ?");
    params.push(httpMethod);
  }

  const httpStatus = toNullableIntRange(filters.httpStatus, 100, 599, "httpStatus");
  if (httpStatus !== null) {
    where.push("http_status = ?");
    params.push(httpStatus);
  }

  const eventType = toTrimmedText(filters.eventType, 80);
  if (eventType) {
    where.push("source_event_type = ?");
    params.push(eventType);
  }

  const createdFrom = toNullableDate(filters.from, "from");
  if (createdFrom) {
    where.push("created_at >= ?");
    params.push(createdFrom);
  }

  const createdTo = toNullableDate(filters.to, "to");
  if (createdTo) {
    where.push("created_at <= ?");
    params.push(createdTo);
  }

  const query = toTrimmedText(filters.q, 120);
  if (query) {
    where.push("(action LIKE ? OR service_name LIKE ? OR source_event_type LIKE ?)");
    const wildcard = `%${query}%`;
    params.push(wildcard, wildcard, wildcard);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [countRows] = await db.execute(
    [`SELECT COUNT(*) AS count FROM audit_logs`, whereClause].join(" "),
    params,
  );

  const [rows] = await db.execute(
    [
      "SELECT",
      "id,",
      "log_type AS logType,",
      "service_name AS serviceName,",
      "action,",
      "actor_user_id AS actorUserId,",
      "actor_role AS actorRole,",
      "target_type AS targetType,",
      "target_id AS targetId,",
      "severity,",
      "http_method AS httpMethod,",
      "http_path AS httpPath,",
      "http_status AS httpStatus,",
      "request_id AS requestId,",
      "duration_ms AS durationMs,",
      "source_topic AS sourceTopic,",
      "source_partition AS sourcePartition,",
      "source_offset AS sourceOffset,",
      "source_event_id AS sourceEventId,",
      "source_event_type AS sourceEventType,",
      "source_event_version AS sourceEventVersion,",
      "source_occurred_at AS sourceOccurredAt,",
      "metadata,",
      "payload,",
      "created_at AS createdAt",
      "FROM audit_logs",
      whereClause,
      "ORDER BY id DESC",
      "LIMIT ? OFFSET ?",
    ].join(" "),
    [...params, limit, offset],
  );

  return {
    page,
    limit,
    total: Number(countRows[0]?.count || 0),
    count: rows.length,
    logs: rows.map(mapAuditRow),
  };
};

module.exports = {
  createActivityLog,
  createDomainEventLog,
  listAuditLogs,
};
