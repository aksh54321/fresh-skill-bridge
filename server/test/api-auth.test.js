const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const jwt = require("jsonwebtoken");
const routes = require("../routes");
const { authenticate, requireRole } = require("../auth");
const { Attendance, User } = require("../models");

let server;
let baseUrl;

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use(routes);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("protected API resources reject requests without a session", async () => {
  const paths = [
    "/api/employees",
    "/api/attendance",
    "/api/leaves",
    "/api/payroll",
    "/api/announcements",
    "/api/trainings",
    "/api/notifications",
  ];

  for (const path of paths) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 401, `${path} should require authentication`);
    assert.match((await response.json()).error, /sign in/i);
  }
});

test("protected write endpoints reject requests without a session", async () => {
  for (const [path, body] of [
    ["/api/employees", { name: "Unauthorized" }],
    ["/api/attendance", { status: "Present" }],
  ]) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 401, `${path} should reject unauthenticated writes`);
  }
});

test("login endpoint returns validation errors for invalid or missing input", async () => {
  for (const [body, message] of [
    [{ email: "not-an-email", password: "invalid-password" }, /valid email/i],
    [{ email: "employee@example.com" }, /password is required/i],
  ]) {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, message);
  }
});

test("unknown API endpoints return a JSON 404 after authentication", async () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalFindById = User.findById;
  const userId = "0123456789abcdef01234567";
  process.env.JWT_SECRET = "test-only-jwt-secret-with-at-least-32-characters";
  User.findById = () => ({
    select: async () => ({
      _id: userId,
      email: "hr@example.com",
      role: "HR",
      employeeId: null,
      active: true,
    }),
  });

  try {
    const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET, { algorithm: "HS256" });
    const response = await fetch(`${baseUrl}/api/not-a-real-endpoint`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "API endpoint not found." });
  } finally {
    User.findById = originalFindById;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});

test("role middleware denies an employee access to HR-only routes", async () => {
  const guard = requireRole("HR");
  const error = await new Promise((resolve) => {
    guard({ user: { role: "Employee" } }, {}, resolve);
  });
  assert.equal(error.status, 403);
});

test("authentication middleware rejects a missing session before database access", async () => {
  const error = await new Promise((resolve) => {
    authenticate({ get: () => undefined, headers: {} }, {}, resolve);
  });
  assert.equal(error.status, 401);
});

test("password hashes are excluded and attendance uniqueness is per employee and date", () => {
  assert.equal(User.schema.path("passwordHash").options.select, false);
  assert.ok(
    Attendance.schema.indexes().some(([fields, options]) =>
      fields.employeeId === 1 && fields.date === 1 && options.unique === true
    )
  );
});
