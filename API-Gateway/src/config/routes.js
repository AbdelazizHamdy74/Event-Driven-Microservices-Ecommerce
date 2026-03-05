const ROUTE_TARGETS = [
  { prefix: "/auth", service: "user" },
  { prefix: "/users", service: "user" },
  { prefix: "/carts", service: "cart" },
  { prefix: "/orders", service: "order" },
  { prefix: "/categories", service: "product" },
  { prefix: "/products", service: "product" },
  { prefix: "/inventory", service: "inventory" },
  { prefix: "/search", service: "search" },
  { prefix: "/payments", service: "payment" },
  { prefix: "/notifications", service: "notification" },
  { prefix: "/audit", service: "audit" },
];

const PUBLIC_RULES = [
  { method: "POST", pattern: /^\/auth\/signup\/?$/ },
  { method: "POST", pattern: /^\/auth\/login\/?$/ },
  { method: "POST", pattern: /^\/auth\/forgot-password\/?$/ },
  { method: "POST", pattern: /^\/auth\/reset-password\/otp\/?$/ },
  { method: "GET", pattern: /^\/categories\/?$/ },
  { method: "GET", pattern: /^\/products(?:\/[^/]+)?\/?$/ },
  { method: "GET", pattern: /^\/inventory\/[^/]+\/?$/ },
  { method: "GET", pattern: /^\/search\/products\/?$/ },
];

const PROTECTED_RULES = [
  { method: "POST", pattern: /^\/auth\/reset-password\/?$/ },
  { method: "GET", pattern: /^\/auth\/session\/?$/ },
  { method: "GET", pattern: /^\/auth\/users\/?$/, roles: ["admin"] },
  { method: "POST", pattern: /^\/users\/?$/, roles: ["admin"] },
  { method: "GET", pattern: /^\/users\/[^/]+\/?$/ },
  { method: "PUT", pattern: /^\/users\/[^/]+\/?$/ },
  { method: "DELETE", pattern: /^\/users\/[^/]+\/?$/ },
  { method: "*", pattern: /^\/carts(?:\/.*)?$/ },
  { method: "*", pattern: /^\/orders(?:\/.*)?$/ },
  { method: "POST", pattern: /^\/categories\/?$/, roles: ["admin"] },
  { method: "POST", pattern: /^\/products\/?$/, roles: ["admin", "supplier"] },
  {
    method: "PUT",
    pattern: /^\/inventory\/[^/]+\/stock\/?$/,
    roles: ["admin", "supplier"],
  },
  { method: "*", pattern: /^\/payments(?:\/.*)?$/ },
  { method: "*", pattern: /^\/notifications(?:\/.*)?$/ },
  { method: "GET", pattern: /^\/audit\/logs\/?$/, roles: ["admin"] },
  { method: "GET", pattern: /^\/audit\/logs\/me\/?$/ },
];

const normalizePathname = (value) => {
  if (typeof value !== "string" || !value.trim()) return "/";
  const pathOnly = value.split("?")[0].trim();
  if (!pathOnly) return "/";
  if (pathOnly === "/") return "/";
  return pathOnly.endsWith("/") ? pathOnly.slice(0, -1) : pathOnly;
};

const isInternalPath = (pathname) => /(^|\/)internal(?:\/|$)/i.test(pathname);

const isRuleMatch = (rule, method, pathname) => {
  if (rule.method !== "*" && rule.method !== method) return false;
  return rule.pattern.test(pathname);
};

const resolveAuthPolicy = ({ method, pathname }) => {
  const normalizedMethod = String(method || "GET").toUpperCase();
  const normalizedPath = normalizePathname(pathname);

  if (
    PUBLIC_RULES.some((rule) =>
      isRuleMatch(rule, normalizedMethod, normalizedPath),
    )
  ) {
    return {
      requiresAuth: false,
      roles: [],
    };
  }

  const protectedRule = PROTECTED_RULES.find((rule) =>
    isRuleMatch(rule, normalizedMethod, normalizedPath),
  );

  if (!protectedRule) {
    return {
      requiresAuth: false,
      roles: [],
    };
  }

  return {
    requiresAuth: true,
    roles: Array.isArray(protectedRule.roles) ? protectedRule.roles : [],
  };
};

const resolveRouteTarget = (pathname, serviceUrls) => {
  const normalizedPath = normalizePathname(pathname);
  const route = ROUTE_TARGETS.find(
    (item) =>
      normalizedPath === item.prefix ||
      normalizedPath.startsWith(`${item.prefix}/`),
  );

  if (!route) return null;
  const baseUrl = serviceUrls?.[route.service];
  if (!baseUrl) return null;

  return {
    service: route.service,
    baseUrl,
  };
};

module.exports = {
  normalizePathname,
  isInternalPath,
  resolveAuthPolicy,
  resolveRouteTarget,
};
