type Schema = Record<string, unknown>;
type Operation = Record<string, unknown>;

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const nullable = (schema: Schema): Schema => ({ anyOf: [schema, { type: "null" }] });
const arrayOf = (schema: Schema): Schema => ({ type: "array", items: schema });
const envelope = (schema: Schema, paginated = false): Schema => ({
  type: "object",
  required: paginated ? ["success", "data", "meta"] : ["success", "data"],
  properties: {
    success: { const: true },
    data: schema,
    ...(paginated ? { meta: ref("PaginationMeta") } : {}),
  },
  additionalProperties: false,
});

const jsonResponse = (description: string, schema: Schema, example?: unknown) => ({
  description,
  content: { "application/json": { schema, ...(example === undefined ? {} : { example }) } },
});
const success = (schema: Schema, description = "Successful response", paginated = false) =>
  jsonResponse(description, envelope(schema, paginated));
const errorResponses = (codes: number[] = [400, 401, 403, 404, 422, 429]) => Object.fromEntries(
  codes.map((code) => [String(code), { $ref: `#/components/responses/Error${code}` }]),
);
const body = (schema: Schema, example?: unknown) => ({
  required: true,
  content: { "application/json": { schema, ...(example === undefined ? {} : { example }) } },
});
const cookieSecurity = [{ cookieSession: [] }];
const role = (roles: string) => `Requires an active ${roles} server session.`;
const idParameter = (description: string) => ({
  name: "id", in: "path", required: true, description, schema: { type: "string", minLength: 1 },
});
const query = (name: string, schema: Schema, description?: string) => ({
  name, in: "query", required: false, schema, ...(description ? { description } : {}),
});
const paginationParameters = [
  query("page", { type: "integer", minimum: 1, default: 1 }),
  query("limit", { type: "integer", minimum: 1, maximum: 100, default: 20 }),
];

const authUserResponse = success(ref("AuthPayload"));
const mealResponse = success(ref("Meal"));
const orderResponse = success(ref("OrderDetail"));

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "FoodHub API",
    version: "1.0.0",
    description: "FoodHub MVP REST API. Authentication uses a Better Auth server session in an HttpOnly cookie; session identifiers are never returned in JSON. Suspended accounts cannot use protected operations. Ownership checks for private resources intentionally return 404.",
  },
  servers: [{ url: "/api", description: "Current FoodHub server" }],
  tags: [
    { name: "Authentication", description: "Public session creation plus active-session lifecycle operations." },
    { name: "Profiles", description: "Active CUSTOMER or PROVIDER own-profile operations; business-profile mutation is PROVIDER-only." },
    { name: "Categories", description: "Public active-category discovery." },
    { name: "Meals", description: "Public orderable-meal discovery." },
    { name: "Providers", description: "Public active-provider discovery." },
    { name: "Orders", description: "CUSTOMER-only checkout and owner-scoped order lifecycle." },
    { name: "Reviews", description: "Public review reads; mutation is CUSTOMER-only and owner-scoped." },
    { name: "Provider meals", description: "PROVIDER-only, provider-owner-scoped meal management." },
    { name: "Provider orders", description: "PROVIDER-only, assigned-provider fulfilment." },
    { name: "Admin users", description: "ADMIN-only user oversight." },
    { name: "Admin orders", description: "ADMIN-only platform order oversight." },
    { name: "Admin categories", description: "ADMIN-only category management." },
    { name: "Dashboards", description: "Role-scoped PROVIDER and ADMIN aggregate dashboards." },
    { name: "Operations", description: "Unauthenticated operational endpoints." },
  ],
  paths: {
    "/health": { get: { operationId: "getHealth", tags: ["Operations"], summary: "Readiness health check", responses: { 200: jsonResponse("Application and database are ready", envelope(ref("Health")), { success: true, data: { status: "ok", checks: { database: "up" } } }), 503: { $ref: "#/components/responses/Error503" } } } },
    "/auth/register": { post: { operationId: "register", tags: ["Authentication"], summary: "Register a customer or provider", description: "Creates a server session and sets its HttpOnly cookie. Public registration never accepts ADMIN.", requestBody: body(ref("RegisterRequest"), { fullName: "FoodHub Customer", email: "customer@example.com", phone: "+8801700000000", password: "StrongPass1", role: "CUSTOMER" }), responses: { 201: authUserResponse, ...errorResponses([400, 409, 422, 429]) } } },
    "/auth/login": { post: { operationId: "login", tags: ["Authentication"], summary: "Log in", description: "Creates a server session. Credential failures are deliberately generic.", requestBody: body(ref("LoginRequest"), { email: "customer@example.com", password: "StrongPass1" }), responses: { 200: authUserResponse, ...errorResponses([400, 401, 403, 422, 429]) } } },
    "/auth/me": { get: { operationId: "getCurrentUser", tags: ["Authentication"], summary: "Get the current user", security: cookieSecurity, responses: { 200: authUserResponse, ...errorResponses([401, 403, 429]) } } },
    "/auth/logout": { post: { operationId: "logout", tags: ["Authentication"], summary: "Log out", description: "Idempotently revokes the current session when present and clears the cookie.", responses: { 200: success(ref("LogoutResult")), ...errorResponses([429]) } } },
    "/auth/refresh": { post: { operationId: "refreshSession", tags: ["Authentication"], summary: "Revalidate the current session", description: "Compatibility endpoint. Revalidates the existing server session and returns the current user; it does not rotate a separate refresh token.", security: cookieSecurity, responses: { 200: authUserResponse, ...errorResponses([401, 403, 429]) } } },
    "/auth/password": { patch: { operationId: "changePassword", tags: ["Authentication"], summary: "Change password", description: "Verifies the current password, revokes other sessions, and retains a replacement current session.", security: cookieSecurity, requestBody: body(ref("ChangePasswordRequest")), responses: { 200: success(ref("PasswordChangeResult")), ...errorResponses([400, 401, 403, 422, 429]) } } },
    "/profile": {
      get: { operationId: "getOwnProfile", tags: ["Profiles"], summary: "Get own profile", description: role("customer or provider"), security: cookieSecurity, responses: { 200: authUserResponse, ...errorResponses([401, 403]) } },
      patch: { operationId: "updateOwnProfile", tags: ["Profiles"], summary: "Update own basic profile", description: role("customer or provider"), security: cookieSecurity, requestBody: body(ref("UpdateProfileRequest")), responses: { 200: authUserResponse, ...errorResponses([400, 401, 403, 422]) } },
    },
    "/provider/profile": { patch: { operationId: "updateProviderProfile", tags: ["Profiles"], summary: "Update own business profile", description: role("provider"), security: cookieSecurity, requestBody: body(ref("UpdateProviderProfileRequest")), responses: { 200: authUserResponse, ...errorResponses([400, 401, 403, 404, 422]) } } },
    "/categories": { get: { operationId: "listCategories", tags: ["Categories"], summary: "List active categories", responses: { 200: success(arrayOf(ref("Category"))), ...errorResponses([400]) } } },
    "/categories/{id}": { get: { operationId: "getCategory", tags: ["Categories"], summary: "Get an active category", parameters: [idParameter("Category identifier")], responses: { 200: success(ref("Category")), ...errorResponses([400, 404]) } } },
    "/meals": { get: { operationId: "listMeals", tags: ["Meals"], summary: "List publicly orderable meals", parameters: [query("search", { type: "string", maxLength: 100 }), query("categoryId", { type: "string" }, "Category identifier or slug"), query("categorySlug", { type: "string" }), query("dietary", { type: "string", maxLength: 50 }), query("providerId", { type: "string" }), query("minPrice", ref("Money")), query("maxPrice", ref("Money")), query("sort", { $ref: "#/components/schemas/MealSort" }), ...paginationParameters], responses: { 200: success(arrayOf(ref("Meal")), "Paginated meal list", true), ...errorResponses([400, 422, 429]) } } },
    "/meals/{id}": { get: { operationId: "getMeal", tags: ["Meals"], summary: "Get a publicly orderable meal", parameters: [idParameter("Meal identifier")], responses: { 200: mealResponse, ...errorResponses([400, 404, 429]) } } },
    "/providers": { get: { operationId: "listProviders", tags: ["Providers"], summary: "List active providers", parameters: [query("search", { type: "string", maxLength: 100 }), query("categoryId", { type: "string" }), query("acceptingOrders", { type: "boolean" }), ...paginationParameters], responses: { 200: success(arrayOf(ref("ProviderListItem")), "Paginated provider list", true), ...errorResponses([400, 422, 429]) } } },
    "/providers/{id}": { get: { operationId: "getProvider", tags: ["Providers"], summary: "Get provider and public menu", parameters: [idParameter("Provider identifier")], responses: { 200: success(ref("ProviderDetail")), ...errorResponses([400, 404, 429]) } } },
    "/orders": {
      post: { operationId: "createOrder", tags: ["Orders"], summary: "Create a customer order", description: `${role("customer")} All prices and totals are calculated by the server.`, security: cookieSecurity, parameters: [{ name: "Idempotency-Key", in: "header", required: false, description: "Customer-scoped retry key retained for 24 hours.", schema: { type: "string", maxLength: 255, pattern: "^[A-Za-z0-9._:-]+$" } }], requestBody: body(ref("CreateOrderRequest")), responses: { 201: orderResponse, 200: { ...orderResponse, description: "Idempotent replay", headers: { "Idempotency-Replayed": { schema: { const: "true" } } } }, ...errorResponses([400, 401, 403, 404, 409, 422, 429]) } },
      get: { operationId: "listOwnOrders", tags: ["Orders"], summary: "List own customer orders", description: role("customer"), security: cookieSecurity, parameters: [query("status", ref("OrderStatus")), query("sort", { type: "string", enum: ["newest", "oldest", "total_desc"] }), ...paginationParameters], responses: { 200: success(arrayOf(ref("OrderSummary")), "Paginated own-order list", true), ...errorResponses([400, 401, 403, 422]) } },
    },
    "/orders/{id}": { get: { operationId: "getOwnOrder", tags: ["Orders"], summary: "Get an owned customer order", security: cookieSecurity, parameters: [idParameter("Order identifier")], responses: { 200: orderResponse, ...errorResponses([400, 401, 403, 404]) } } },
    "/orders/{id}/cancel": { patch: { operationId: "cancelOwnOrder", tags: ["Orders"], summary: "Cancel a placed order", security: cookieSecurity, parameters: [idParameter("Order identifier")], requestBody: body(ref("CancelOrderRequest"), { reason: "Plans changed" }), responses: { 200: orderResponse, ...errorResponses([400, 401, 403, 404, 409, 422]) } } },
    "/meals/{id}/reviews": { get: { operationId: "listMealReviews", tags: ["Reviews"], summary: "List active reviews for an orderable meal", parameters: [idParameter("Meal identifier"), query("sort", { type: "string", enum: ["newest", "oldest", "rating_desc", "rating_asc"] }), ...paginationParameters], responses: { 200: success(arrayOf(ref("Review")), "Paginated review list", true), ...errorResponses([400, 404, 422, 429]) } } },
    "/reviews": { post: { operationId: "createReview", tags: ["Reviews"], summary: "Review a delivered order item", description: role("customer"), security: cookieSecurity, requestBody: body(ref("CreateReviewRequest"), { orderId: "order-id", mealId: "meal-id", rating: 5, comment: "Very good" }), responses: { 201: success(ref("Review")), ...errorResponses([400, 401, 403, 404, 409, 422, 429]) } } },
    "/reviews/{id}": {
      patch: { operationId: "updateReview", tags: ["Reviews"], summary: "Update an owned active review", security: cookieSecurity, parameters: [idParameter("Review identifier")], requestBody: body(ref("UpdateReviewRequest")), responses: { 200: success(ref("Review")), ...errorResponses([400, 401, 403, 404, 422]) } },
      delete: { operationId: "deleteReview", tags: ["Reviews"], summary: "Soft-delete an owned review", security: cookieSecurity, parameters: [idParameter("Review identifier")], responses: { 200: success(ref("DeleteResult")), ...errorResponses([400, 401, 403, 404]) } },
    },
    "/provider/meals": {
      get: { operationId: "listProviderMeals", tags: ["Provider meals"], summary: "List own provider meals", security: cookieSecurity, parameters: [query("search", { type: "string", maxLength: 100 }), query("categoryId", { type: "string" }), query("availability", { type: "boolean" }), query("archived", { type: "boolean" }), ...paginationParameters], responses: { 200: success(arrayOf(ref("ProviderMeal")), "Paginated owned-meal list", true), ...errorResponses([400, 401, 403, 422]) } },
      post: { operationId: "createProviderMeal", tags: ["Provider meals"], summary: "Create a meal", security: cookieSecurity, requestBody: body(ref("CreateMealRequest")), responses: { 201: success(ref("ProviderMeal")), ...errorResponses([400, 401, 403, 404, 422]) } },
    },
    "/provider/meals/{id}": {
      patch: { operationId: "updateProviderMeal", tags: ["Provider meals"], summary: "Update an owned meal", security: cookieSecurity, parameters: [idParameter("Meal identifier")], requestBody: body(ref("UpdateMealRequest")), responses: { 200: success(ref("ProviderMeal")), ...errorResponses([400, 401, 403, 404, 409, 422]) } },
      delete: { operationId: "archiveProviderMeal", tags: ["Provider meals"], summary: "Archive an owned meal", security: cookieSecurity, parameters: [idParameter("Meal identifier")], responses: { 200: success(ref("ProviderMeal")), ...errorResponses([400, 401, 403, 404]) } },
    },
    "/provider/meals/{id}/availability": { patch: { operationId: "setProviderMealAvailability", tags: ["Provider meals"], summary: "Set owned-meal availability", security: cookieSecurity, parameters: [idParameter("Meal identifier")], requestBody: body(ref("MealAvailabilityRequest")), responses: { 200: success(ref("ProviderMeal")), ...errorResponses([400, 401, 403, 404, 409, 422]) } } },
    "/provider/meals/{id}/restore": { patch: { operationId: "restoreProviderMeal", tags: ["Provider meals"], summary: "Restore an archived meal as unavailable", security: cookieSecurity, parameters: [idParameter("Meal identifier")], responses: { 200: success(ref("ProviderMeal")), ...errorResponses([400, 401, 403, 404]) } } },
    "/provider/orders": { get: { operationId: "listProviderOrders", tags: ["Provider orders"], summary: "List assigned provider orders", security: cookieSecurity, parameters: [query("status", ref("OrderStatus")), query("search", { type: "string", maxLength: 100 }), query("dateFrom", ref("IsoDateOrDateTime")), query("dateTo", ref("IsoDateOrDateTime")), ...paginationParameters], responses: { 200: success(arrayOf(ref("ProviderOrderSummary")), "Paginated provider-order list", true), ...errorResponses([400, 401, 403, 422]) } } },
    "/provider/orders/{id}": { get: { operationId: "getProviderOrder", tags: ["Provider orders"], summary: "Get an assigned provider order", security: cookieSecurity, parameters: [idParameter("Order identifier")], responses: { 200: orderResponse, ...errorResponses([400, 401, 403, 404]) } } },
    "/provider/orders/{id}/status": { patch: { operationId: "updateProviderOrderStatus", tags: ["Provider orders"], summary: "Advance fulfilment status", description: "Allowed chain: PLACED → PREPARING → READY → DELIVERED. Skips, reversals, cancellation, and stale transitions return 409.", security: cookieSecurity, parameters: [idParameter("Order identifier")], requestBody: body(ref("ProviderOrderStatusRequest")), responses: { 200: orderResponse, ...errorResponses([400, 401, 403, 404, 409, 422]) } } },
    "/admin/users": { get: { operationId: "listAdminUsers", tags: ["Admin users"], summary: "List customer and provider users", security: cookieSecurity, parameters: [query("search", { type: "string", maxLength: 100 }), query("role", { type: "string", enum: ["CUSTOMER", "PROVIDER"] }), query("status", ref("AccountStatus")), query("sort", { type: "string", enum: ["newest", "oldest", "name_asc", "name_desc", "last_login_desc"] }), ...paginationParameters], responses: { 200: success(arrayOf(ref("AdminUser")), "Paginated user list", true), ...errorResponses([400, 401, 403, 422]) } } },
    "/admin/users/{id}": { get: { operationId: "getAdminUser", tags: ["Admin users"], summary: "Get safe user details", security: cookieSecurity, parameters: [idParameter("User identifier")], responses: { 200: success(ref("AdminUser")), ...errorResponses([400, 401, 403, 404]) } } },
    "/admin/users/{id}/status": { patch: { operationId: "updateAdminUserStatus", tags: ["Admin users"], summary: "Suspend or reactivate a non-admin user", security: cookieSecurity, parameters: [idParameter("User identifier")], requestBody: body(ref("UserStatusRequest")), responses: { 200: success(ref("AdminUser")), ...errorResponses([400, 401, 403, 404, 409, 422]) } } },
    "/admin/orders": { get: { operationId: "listAdminOrders", tags: ["Admin orders"], summary: "List all orders", security: cookieSecurity, parameters: [query("status", ref("OrderStatus")), query("providerId", { type: "string" }), query("customerId", { type: "string" }), query("search", { type: "string", maxLength: 100 }), query("dateFrom", ref("IsoDateOrDateTime")), query("dateTo", ref("IsoDateOrDateTime")), ...paginationParameters], responses: { 200: success(arrayOf(ref("AdminOrderSummary")), "Paginated platform order list", true), ...errorResponses([400, 401, 403, 422]) } } },
    "/admin/orders/{id}": { get: { operationId: "getAdminOrder", tags: ["Admin orders"], summary: "Get any order and full history", security: cookieSecurity, parameters: [idParameter("Order identifier")], responses: { 200: orderResponse, ...errorResponses([400, 401, 403, 404]) } } },
    "/admin/categories": {
      get: { operationId: "listAdminCategories", tags: ["Admin categories"], summary: "List active and inactive categories", security: cookieSecurity, responses: { 200: success(arrayOf(ref("AdminCategory"))), ...errorResponses([400, 401, 403, 422]) } },
      post: { operationId: "createAdminCategory", tags: ["Admin categories"], summary: "Create a category", security: cookieSecurity, requestBody: body(ref("CreateCategoryRequest")), responses: { 201: success(ref("AdminCategory")), ...errorResponses([400, 401, 403, 409, 422]) } },
    },
    "/admin/categories/{id}": {
      patch: { operationId: "updateAdminCategory", tags: ["Admin categories"], summary: "Update a category", security: cookieSecurity, parameters: [idParameter("Category identifier")], requestBody: body(ref("UpdateCategoryRequest")), responses: { 200: success(ref("AdminCategory")), ...errorResponses([400, 401, 403, 404, 409, 422]) } },
      delete: { operationId: "deleteAdminCategory", tags: ["Admin categories"], summary: "Delete an unreferenced category", security: cookieSecurity, parameters: [idParameter("Category identifier")], responses: { 200: success(ref("DeleteResult")), ...errorResponses([400, 401, 403, 404, 409]) } },
    },
    "/provider/dashboard": { get: { operationId: "getProviderDashboard", tags: ["Dashboards"], summary: "Get provider-scoped aggregates", security: cookieSecurity, responses: { 200: success(ref("ProviderDashboard")), ...errorResponses([400, 401, 403]) } } },
    "/admin/dashboard": { get: { operationId: "getAdminDashboard", tags: ["Dashboards"], summary: "Get platform aggregates", security: cookieSecurity, responses: { 200: success(ref("AdminDashboard")), ...errorResponses([400, 401, 403]) } } },
  },
  components: {
    securitySchemes: { cookieSession: { type: "apiKey", in: "cookie", name: "better-auth.session_token", description: "HttpOnly Better Auth server-session cookie. The exact cookie prefix can vary with secure deployment settings." } },
    responses: Object.fromEntries([400, 401, 403, 404, 409, 422, 429, 503].map((code) => [
      `Error${code}`,
      jsonResponse(({ 400: "Bad request", 401: "Authentication required", 403: "Forbidden", 404: "Resource not found", 409: "State conflict", 422: "Validation failed", 429: "Rate limit exceeded", 503: "Service unavailable" } as Record<number, string>)[code]!, ref("ErrorEnvelope")),
    ])),
    schemas: {
      Money: { type: "string", pattern: "^\\d+(?:\\.\\d{1,2})?$", example: "12.50", description: "Exact non-negative decimal amount serialized as a string." },
      DateTime: { type: "string", format: "date-time" },
      IsoDateOrDateTime: { oneOf: [{ type: "string", format: "date" }, { type: "string", format: "date-time" }] },
      Role: { type: "string", enum: ["CUSTOMER", "PROVIDER", "ADMIN"] },
      AccountStatus: { type: "string", enum: ["ACTIVE", "SUSPENDED"] },
      OrderStatus: { type: "string", enum: ["PLACED", "PREPARING", "READY", "DELIVERED", "CANCELLED"] },
      MealSort: { type: "string", enum: ["newest", "created_desc", "price_asc", "price_desc", "rating_desc"] },
      PaginationMeta: { type: "object", required: ["page", "limit", "total", "totalPages"], properties: { page: { type: "integer", minimum: 1 }, limit: { type: "integer", minimum: 1, maximum: 100 }, total: { type: "integer", minimum: 0 }, totalPages: { type: "integer", minimum: 0 } }, additionalProperties: false },
      ErrorEnvelope: { type: "object", required: ["success", "error"], properties: { success: { const: false }, error: { type: "object", required: ["code", "message"], properties: { code: { type: "string", example: "VALIDATION_ERROR" }, message: { type: "string" }, details: { type: "object", additionalProperties: true } }, additionalProperties: false } }, additionalProperties: false, example: { success: false, error: { code: "VALIDATION_ERROR", message: "The request could not be validated.", details: { email: "Enter a valid email address." } } } },
      Health: { type: "object", required: ["status", "checks"], properties: { status: { const: "ok" }, checks: { type: "object", required: ["database"], properties: { database: { const: "up" } }, additionalProperties: false } }, additionalProperties: false },
      Message: { type: "object", required: ["message"], properties: { message: { type: "string" } }, additionalProperties: false },
      LogoutResult: { type: "object", required: ["loggedOut"], properties: { loggedOut: { const: true } }, additionalProperties: false },
      PasswordChangeResult: { type: "object", required: ["passwordChanged"], properties: { passwordChanged: { const: true } }, additionalProperties: false },
      DeleteResult: { type: "object", required: ["id", "deleted"], properties: { id: { type: "string" }, deleted: { type: "boolean" } }, additionalProperties: false },
      SafeUser: { type: "object", required: ["id", "fullName", "email", "role", "status", "createdAt", "updatedAt"], properties: { id: { type: "string" }, fullName: { type: "string" }, profileImageUrl: nullable({ type: "string", format: "uri" }), email: { type: "string", format: "email" }, phone: nullable({ type: "string" }), role: ref("Role"), status: ref("AccountStatus"), defaultDeliveryAddress: nullable({ type: "string" }), createdAt: ref("DateTime"), updatedAt: ref("DateTime") }, additionalProperties: false },
      PublicUser: { type: "object", required: ["id", "fullName"], properties: { id: { type: "string" }, fullName: { type: "string" }, profileImageUrl: nullable({ type: "string", format: "uri" }) }, additionalProperties: false },
      Provider: { type: "object", required: ["id", "name", "description", "address", "phone", "logoUrl", "openingHours", "acceptingOrders"], properties: { id: { type: "string" }, name: { type: "string" }, description: { type: "string" }, address: { type: "string" }, phone: { type: "string" }, logoUrl: nullable({ type: "string", format: "uri" }), openingHours: nullable({ type: "string" }), acceptingOrders: { type: "boolean" } } },
      AuthPayload: { type: "object", required: ["user", "providerProfile"], properties: { user: ref("SafeUser"), providerProfile: nullable(ref("Provider")) }, additionalProperties: false, example: { user: { id: "user-id", fullName: "FoodHub Customer", profileImageUrl: null, email: "customer@example.com", phone: "+8801700000000", role: "CUSTOMER", status: "ACTIVE", defaultDeliveryAddress: null, createdAt: "2026-07-19T00:00:00.000Z", updatedAt: "2026-07-19T00:00:00.000Z" }, providerProfile: null } },
      Category: { type: "object", required: ["id", "name", "slug", "description", "displayOrder"], properties: { id: { type: "string" }, name: { type: "string" }, slug: { type: "string" }, description: nullable({ type: "string" }), displayOrder: { type: "integer" } } },
      Rating: { type: "object", required: ["average", "count"], properties: { average: nullable({ type: "number", minimum: 1, maximum: 5 }), count: { type: "integer", minimum: 0 } }, additionalProperties: false },
      Meal: { type: "object", required: ["id", "name", "slug", "description", "price", "imageUrl", "dietaryLabels", "preparationTimeMinutes", "isAvailable", "createdAt", "provider", "category", "rating"], properties: { id: { type: "string" }, name: { type: "string" }, slug: nullable({ type: "string" }), description: { type: "string" }, price: ref("Money"), imageUrl: nullable({ type: "string", format: "uri" }), dietaryLabels: arrayOf({ type: "string" }), preparationTimeMinutes: nullable({ type: "integer", minimum: 1 }), isAvailable: { type: "boolean" }, provider: ref("Provider"), category: ref("Category"), rating: ref("Rating"), reviews: arrayOf(ref("Review")), createdAt: ref("DateTime") }, additionalProperties: false },
      ProviderMeal: { type: "object", required: ["id", "name", "slug", "description", "price", "imageUrl", "dietaryLabels", "preparationTimeMinutes", "isAvailable", "isArchived", "createdAt", "updatedAt", "category"], properties: { id: { type: "string" }, name: { type: "string" }, slug: nullable({ type: "string" }), description: { type: "string" }, price: ref("Money"), imageUrl: nullable({ type: "string", format: "uri" }), dietaryLabels: arrayOf({ type: "string" }), preparationTimeMinutes: nullable({ type: "integer", minimum: 1 }), isAvailable: { type: "boolean" }, isArchived: { type: "boolean" }, createdAt: ref("DateTime"), updatedAt: ref("DateTime"), category: { allOf: [ref("Category"), { type: "object", required: ["isActive"], properties: { isActive: { type: "boolean" } } }] } }, additionalProperties: false },
      ProviderListItem: { allOf: [ref("Provider"), { type: "object", required: ["activeMealCount"], properties: { activeMealCount: { type: "integer", minimum: 0 } } }], unevaluatedProperties: false },
      ProviderDetail: { type: "object", required: ["provider", "menu"], properties: { provider: ref("Provider"), menu: arrayOf(ref("Meal")) }, additionalProperties: false },
      Review: { type: "object", required: ["id", "rating", "comment", "customer", "createdAt", "updatedAt"], properties: { id: { type: "string" }, rating: { type: "integer", minimum: 1, maximum: 5 }, comment: nullable({ type: "string" }), customer: ref("PublicUser"), createdAt: ref("DateTime"), updatedAt: ref("DateTime") }, additionalProperties: false },
      OrderProvider: { type: "object", required: ["id", "name"], properties: { id: { type: "string" }, name: { type: "string" }, phone: { type: "string" }, address: { type: "string" }, logoUrl: nullable({ type: "string", format: "uri" }) }, additionalProperties: false },
      OrderItem: { type: "object", required: ["id", "mealId", "mealName", "unitPrice", "quantity", "itemNote", "lineTotal"], properties: { id: { type: "string" }, mealId: { type: "string" }, mealName: { type: "string" }, unitPrice: ref("Money"), quantity: { type: "integer", minimum: 1 }, lineTotal: ref("Money"), itemNote: nullable({ type: "string" }) }, additionalProperties: false },
      OrderHistory: { type: "object", required: ["id", "fromStatus", "toStatus", "actorRole", "note", "createdAt"], properties: { id: { type: "string" }, fromStatus: nullable(ref("OrderStatus")), toStatus: ref("OrderStatus"), actorRole: ref("Role"), note: nullable({ type: "string" }), actor: ref("PublicUser"), createdAt: ref("DateTime") }, additionalProperties: false },
      OrderSummary: { type: "object", required: ["id", "orderNumber", "status", "paymentMethod", "provider", "subtotal", "deliveryFee", "tax", "serviceFee", "total", "itemCount", "cancelledAt", "deliveredAt", "createdAt", "updatedAt"], properties: { id: { type: "string" }, orderNumber: { type: "string", pattern: "^FH-\\d{8}-[A-F0-9]{12}$" }, status: ref("OrderStatus"), paymentMethod: { const: "CASH_ON_DELIVERY" }, provider: ref("Provider"), subtotal: ref("Money"), deliveryFee: ref("Money"), tax: ref("Money"), serviceFee: ref("Money"), total: ref("Money"), itemCount: { type: "integer", minimum: 1 }, deliveredAt: nullable(ref("DateTime")), cancelledAt: nullable(ref("DateTime")), createdAt: ref("DateTime"), updatedAt: ref("DateTime") } },
      ProviderOrderSummary: { allOf: [ref("OrderSummary"), { type: "object", required: ["customerName"], properties: { customerName: { type: "string" } } }], unevaluatedProperties: false },
      AdminOrderSummary: { allOf: [ref("OrderSummary"), { type: "object", required: ["customer"], properties: { customer: ref("PublicUser") } }], unevaluatedProperties: false },
      OrderDetail: { allOf: [ref("OrderSummary"), { type: "object", required: ["customerName", "customerPhone", "deliveryAddress", "deliveryInstructions", "cancellationReason", "items", "statusHistory"], properties: { customer: ref("PublicUser"), customerName: { type: "string" }, customerPhone: { type: "string" }, deliveryAddress: { type: "string" }, deliveryInstructions: nullable({ type: "string" }), cancellationReason: nullable({ type: "string" }), items: arrayOf(ref("OrderItem")), statusHistory: arrayOf(ref("OrderHistory")) } }], unevaluatedProperties: false },
      AdminUser: { type: "object", required: ["id", "fullName", "email", "phone", "role", "status", "profileImageUrl", "lastLoginAt", "createdAt", "providerProfile"], properties: { id: { type: "string" }, fullName: { type: "string" }, email: { type: "string", format: "email" }, phone: nullable({ type: "string" }), role: ref("Role"), status: ref("AccountStatus"), profileImageUrl: nullable({ type: "string", format: "uri" }), lastLoginAt: nullable(ref("DateTime")), createdAt: ref("DateTime"), emailVerified: { type: "boolean" }, defaultDeliveryAddress: nullable({ type: "string" }), updatedAt: ref("DateTime"), providerProfile: nullable(ref("Provider")) }, additionalProperties: false },
      AdminCategory: { type: "object", required: ["id", "name", "slug", "description", "isActive", "displayOrder", "mealCount", "createdAt", "updatedAt"], properties: { id: { type: "string" }, name: { type: "string" }, slug: { type: "string" }, description: nullable({ type: "string" }), isActive: { type: "boolean" }, displayOrder: { type: "integer" }, mealCount: { type: "integer", minimum: 0 }, createdAt: ref("DateTime"), updatedAt: ref("DateTime") }, additionalProperties: false },
      StatusCounts: { type: "object", required: ["PLACED", "PREPARING", "READY", "DELIVERED", "CANCELLED"], properties: Object.fromEntries(["PLACED", "PREPARING", "READY", "DELIVERED", "CANCELLED"].map((status) => [status, { type: "integer", minimum: 0 }])), additionalProperties: false },
      DashboardRecentOrder: { type: "object", required: ["id", "orderNumber", "status", "total", "itemCount", "createdAt"], properties: { id: { type: "string" }, orderNumber: { type: "string" }, status: ref("OrderStatus"), total: ref("Money"), itemCount: { type: "integer", minimum: 1 }, customerName: { type: "string" }, customer: { type: "object", additionalProperties: true }, provider: { type: "object", additionalProperties: true }, createdAt: ref("DateTime"), updatedAt: ref("DateTime") }, additionalProperties: false },
      DashboardRegistration: { type: "object", required: ["id", "fullName", "role", "status", "profileImageUrl", "createdAt", "provider"], properties: { id: { type: "string" }, fullName: { type: "string" }, role: ref("Role"), status: ref("AccountStatus"), profileImageUrl: nullable({ type: "string", format: "uri" }), createdAt: ref("DateTime"), provider: nullable({ type: "object", additionalProperties: true }) }, additionalProperties: false },
      ProviderDashboard: { type: "object", required: ["activeMealCount", "todayPlacedOrderCount", "orderStatusCounts", "deliveredRevenue", "recentOrders"], properties: { activeMealCount: { type: "integer", minimum: 0 }, todayPlacedOrderCount: { type: "integer", minimum: 0 }, orderStatusCounts: ref("StatusCounts"), deliveredRevenue: ref("Money"), recentOrders: arrayOf(ref("DashboardRecentOrder")) }, additionalProperties: false },
      AdminDashboard: { type: "object", required: ["customerCount", "providerCount", "activeUserCount", "suspendedUserCount", "totalOrderCount", "orderStatusCounts", "activeMealCount", "activeCategoryCount", "recentOrders", "recentRegistrations"], properties: { customerCount: { type: "integer", minimum: 0 }, providerCount: { type: "integer", minimum: 0 }, activeUserCount: { type: "integer", minimum: 0 }, suspendedUserCount: { type: "integer", minimum: 0 }, totalOrderCount: { type: "integer", minimum: 0 }, orderStatusCounts: ref("StatusCounts"), activeMealCount: { type: "integer", minimum: 0 }, activeCategoryCount: { type: "integer", minimum: 0 }, recentOrders: arrayOf(ref("DashboardRecentOrder")), recentRegistrations: arrayOf(ref("DashboardRegistration")) }, additionalProperties: false },
      RegisterRequest: { oneOf: [ref("CustomerRegistration"), ref("ProviderRegistration")], discriminator: { propertyName: "role" } },
      CustomerRegistration: { type: "object", required: ["fullName", "email", "phone", "password", "role"], properties: { fullName: { type: "string", minLength: 1, maxLength: 100 }, email: { type: "string", format: "email" }, phone: { type: "string", maxLength: 30 }, password: { type: "string", minLength: 8, maxLength: 128, format: "password" }, role: { const: "CUSTOMER" } }, additionalProperties: false },
      ProviderRegistration: { type: "object", required: ["fullName", "email", "phone", "password", "role", "providerName", "providerDescription", "providerAddress", "providerPhone"], properties: { fullName: { type: "string", minLength: 1, maxLength: 100 }, email: { type: "string", format: "email" }, phone: { type: "string", maxLength: 30 }, password: { type: "string", minLength: 8, maxLength: 128, format: "password" }, role: { const: "PROVIDER" }, providerName: { type: "string", maxLength: 150 }, providerDescription: { type: "string", maxLength: 3000 }, providerAddress: { type: "string", maxLength: 1000 }, providerPhone: { type: "string", maxLength: 30 } }, additionalProperties: false },
      LoginRequest: { type: "object", required: ["email", "password"], properties: { email: { type: "string", format: "email" }, password: { type: "string", format: "password" } }, additionalProperties: false },
      ChangePasswordRequest: { type: "object", required: ["currentPassword", "newPassword"], properties: { currentPassword: { type: "string", format: "password" }, newPassword: { type: "string", minLength: 8, maxLength: 128, format: "password" } }, additionalProperties: false },
      UpdateProfileRequest: { type: "object", minProperties: 1, properties: { fullName: { type: "string", maxLength: 100 }, phone: nullable({ type: "string", maxLength: 30 }), defaultDeliveryAddress: nullable({ type: "string", maxLength: 1000 }), profileImageUrl: nullable({ type: "string", format: "uri" }) }, additionalProperties: false },
      UpdateProviderProfileRequest: { type: "object", minProperties: 1, properties: { name: { type: "string", maxLength: 150 }, description: { type: "string", maxLength: 3000 }, address: { type: "string", maxLength: 1000 }, phone: { type: "string", maxLength: 30 }, logoUrl: nullable({ type: "string", format: "uri" }), openingHours: nullable({ type: "string", maxLength: 1000 }), acceptingOrders: { type: "boolean" } }, additionalProperties: false },
      CreateOrderRequest: { type: "object", required: ["items", "customerPhone", "deliveryAddress"], properties: { items: { type: "array", minItems: 1, maxItems: 50, items: { type: "object", required: ["mealId", "quantity"], properties: { mealId: { type: "string" }, quantity: { type: "integer", minimum: 1, maximum: 20 }, note: nullable({ type: "string", maxLength: 300 }) }, additionalProperties: false } }, customerPhone: { type: "string", maxLength: 30 }, deliveryAddress: { type: "string", maxLength: 1000 }, deliveryInstructions: nullable({ type: "string", maxLength: 500 }) }, additionalProperties: false },
      CancelOrderRequest: { type: "object", properties: { reason: nullable({ type: "string", maxLength: 500 }) }, additionalProperties: false },
      CreateReviewRequest: { type: "object", required: ["orderId", "mealId", "rating"], properties: { orderId: { type: "string" }, mealId: { type: "string" }, rating: { type: "integer", minimum: 1, maximum: 5 }, comment: nullable({ type: "string", maxLength: 2000 }) }, additionalProperties: false },
      UpdateReviewRequest: { type: "object", minProperties: 1, properties: { rating: { type: "integer", minimum: 1, maximum: 5 }, comment: nullable({ type: "string", maxLength: 2000 }) }, additionalProperties: false },
      MealWritableFields: { type: "object", properties: { name: { type: "string", maxLength: 150 }, description: { type: "string", maxLength: 5000 }, price: ref("Money"), categoryId: { type: "string" }, imageUrl: nullable({ type: "string", format: "uri" }), dietaryLabels: { type: "array", maxItems: 20, items: { type: "string", maxLength: 50 } }, preparationTimeMinutes: nullable({ type: "integer", minimum: 1, maximum: 1440 }) } },
      CreateMealRequest: { allOf: [ref("MealWritableFields"), { type: "object", required: ["name", "description", "price", "categoryId"], properties: { isAvailable: { type: "boolean" } } }], unevaluatedProperties: false },
      UpdateMealRequest: { allOf: [ref("MealWritableFields"), { type: "object", minProperties: 1, properties: { updatedAt: { type: "string", format: "date-time", description: "Optional optimistic-concurrency token." } } }], unevaluatedProperties: false },
      MealAvailabilityRequest: { type: "object", required: ["isAvailable"], properties: { isAvailable: { type: "boolean" } }, additionalProperties: false },
      ProviderOrderStatusRequest: { type: "object", required: ["status"], properties: { status: { type: "string", enum: ["PREPARING", "READY", "DELIVERED"] } }, additionalProperties: false },
      UserStatusRequest: { type: "object", required: ["status"], properties: { status: ref("AccountStatus") }, additionalProperties: false },
      CreateCategoryRequest: { type: "object", required: ["name"], properties: { name: { type: "string", maxLength: 100 }, description: nullable({ type: "string", maxLength: 1000 }), displayOrder: { type: "integer", minimum: 0, maximum: 1000000 }, isActive: { type: "boolean" } }, additionalProperties: false },
      UpdateCategoryRequest: { type: "object", minProperties: 1, properties: { name: { type: "string", maxLength: 100 }, slug: { type: "string", maxLength: 120 }, description: nullable({ type: "string", maxLength: 1000 }), displayOrder: { type: "integer", minimum: 0, maximum: 1000000 }, isActive: { type: "boolean" } }, additionalProperties: false },
    },
  },
} satisfies Record<string, unknown>;

export type OpenApiDocument = typeof openApiDocument;
