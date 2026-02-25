const { chargeWithStripe } = require("./stripe.provider");
const { chargeWithPaymob } = require("./paymob.provider");

const normalizeProvider = (value) => {
  const normalized =
    typeof value === "string" && value.trim()
      ? value.trim().toLowerCase()
      : "stripe";

  if (normalized !== "stripe" && normalized !== "paymob") {
    throw new Error("Unsupported payment provider");
  }

  return normalized;
};

const chargeWithProvider = async ({ provider, ...payload }) => {
  const normalizedProvider = normalizeProvider(provider);

  if (normalizedProvider === "paymob") {
    return chargeWithPaymob(payload);
  }

  return chargeWithStripe(payload);
};

module.exports = {
  normalizeProvider,
  chargeWithProvider,
};
