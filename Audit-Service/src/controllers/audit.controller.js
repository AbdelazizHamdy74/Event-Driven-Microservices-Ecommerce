const {
  createActivityLog,
  listAuditLogs,
} = require("../services/audit.service");

const ingestActivityLogInternal = async (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({ message: "Invalid activity payload" });
  }

  await createActivityLog(req.body);
  res.status(202).json({ message: "Audit log accepted" });
};

const listLogs = async (req, res) => {
  const result = await listAuditLogs({
    page: req.query.page,
    limit: req.query.limit,
    logType: req.query.logType,
    serviceName: req.query.serviceName,
    actorUserId: req.query.actorUserId,
    actorRole: req.query.actorRole,
    severity: req.query.severity,
    httpMethod: req.query.httpMethod,
    httpStatus: req.query.httpStatus,
    eventType: req.query.eventType,
    from: req.query.from,
    to: req.query.to,
    q: req.query.q,
  });

  res.json(result);
};

const listMyLogs = async (req, res) => {
  const result = await listAuditLogs({
    page: req.query.page,
    limit: req.query.limit,
    logType: req.query.logType,
    serviceName: req.query.serviceName,
    actorUserId: Number(req.user.id),
    severity: req.query.severity,
    httpMethod: req.query.httpMethod,
    httpStatus: req.query.httpStatus,
    eventType: req.query.eventType,
    from: req.query.from,
    to: req.query.to,
    q: req.query.q,
  });

  res.json(result);
};

module.exports = {
  ingestActivityLogInternal,
  listLogs,
  listMyLogs,
};
