const {
  listNotificationsForActor,
  markNotificationReadForActor,
} = require("../services/notification.service");

const toPositiveInt = (value) => {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    return null;
  }

  return normalized;
};

const toLimit = (value) => {
  if (value === undefined || value === null || value === "") {
    return 50;
  }

  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    return null;
  }

  return Math.min(normalized, 200);
};

exports.listMyNotifications = async (req, res) => {
  const limit = toLimit(req.query.limit);
  if (!limit) {
    return res.status(400).json({ message: "Invalid limit" });
  }

  const notifications = await listNotificationsForActor({
    actor: req.user,
    userId: Number(req.user.id),
    limit,
  });

  res.json({
    count: notifications.length,
    notifications,
  });
};

exports.markMyNotificationRead = async (req, res) => {
  const notificationId = toPositiveInt(req.params.notificationId);
  if (!notificationId) {
    return res.status(400).json({ message: "Invalid notificationId" });
  }

  const notification = await markNotificationReadForActor({
    notificationId,
    actor: req.user,
  });

  res.json(notification);
};

exports.listNotificationsByUserId = async (req, res) => {
  const userId = toPositiveInt(req.params.userId);
  if (!userId) {
    return res.status(400).json({ message: "Invalid userId" });
  }

  const limit = toLimit(req.query.limit);
  if (!limit) {
    return res.status(400).json({ message: "Invalid limit" });
  }

  const notifications = await listNotificationsForActor({
    actor: req.user,
    userId,
    limit,
  });

  res.json({
    count: notifications.length,
    notifications,
  });
};
