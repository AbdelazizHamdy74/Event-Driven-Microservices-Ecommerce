const crypto = require("crypto");

const buildProviderPaymentId = (prefix) => {
  const token =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : crypto.randomBytes(16).toString("hex");
  return `${prefix}_${token.slice(0, 24)}`;
};

const wait = async () => {
  const delayMs = Number(process.env.PAYMENT_PROVIDER_DELAY_MS) || 0;
  if (delayMs <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 5000)));
};

const chargeWithPaymob = async ({
  orderId,
  amount,
  currency,
  paymentMethod,
  paymentToken,
}) => {
  await wait();

  const normalizedToken =
    typeof paymentToken === "string" ? paymentToken.trim().toLowerCase() : "";
  if (normalizedToken === "fail" || normalizedToken === "decline") {
    return {
      ok: false,
      status: "failed",
      providerPaymentId: buildProviderPaymentId("paymob_txn"),
      failureReason: "Paymob transaction declined",
      raw: {
        provider: "paymob",
        orderId: Number(orderId),
        amount: Number(amount),
        currency,
        paymentMethod,
      },
    };
  }

  return {
    ok: true,
    status: "succeeded",
    providerPaymentId: buildProviderPaymentId("paymob_txn"),
    raw: {
      provider: "paymob",
      orderId: Number(orderId),
      amount: Number(amount),
      currency,
      paymentMethod,
    },
  };
};

module.exports = { chargeWithPaymob };
