const createError = (message, status) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

module.exports = { createError };
