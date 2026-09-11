export const operatorScopes = [
  "products",
  "members",
  "orders",
  "content",
  "marketing",
] as const;
export type OperatorScope = (typeof operatorScopes)[number];
export type OperatorPermissions = Record<OperatorScope, boolean>;

export const emptyOperatorPermissions = (): OperatorPermissions => ({
  products: false,
  members: false,
  orders: false,
  content: false,
  marketing: false,
});

export const sectionScopes: Record<string, OperatorScope> = {
  products: "products",
  cohorts: "products",
  learning: "products",
  weeks: "products",
  contents: "products",
  missions: "products",
  members: "members",
  reviews: "members",
  questions: "members",
  customers: "members",
  tags: "members",
  coupons: "members",
  "product-reviews": "members",
  staff: "members",
  orders: "orders",
  banners: "content",
  articles: "content",
  testimonials: "content",
  templates: "marketing",
  campaigns: "marketing",
  automations: "marketing",
  analytics: "marketing",
  metrics: "marketing",
  seo: "marketing",
  settings: "marketing",
};

export function normalizeOperatorPermissions(
  value: unknown,
): OperatorPermissions {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    operatorScopes.map((scope) => [scope, input[scope] === true]),
  ) as OperatorPermissions;
}
