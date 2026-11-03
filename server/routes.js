const crypto = require("node:crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const {
  Announcement,
  Attendance,
  BootstrapState,
  Employee,
  LeaveRequest,
  Notification,
  Payroll,
  Training,
  User,
} = require("./models");
const {
  authenticate,
  clearSession,
  HttpError,
  requireRole,
  setSession,
} = require("./auth");

const router = express.Router();
const api = express.Router();
const authRoutes = express.Router();
const MAX_PASSWORD_LENGTH = 128;
const loginAttempts = new Map();

function requireText(value, label, maxLength = 500) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new HttpError(400, `${label} is required and must be at most ${maxLength} characters.`);
  }
  return value.trim();
}

function optionalText(value, label, maxLength = 500) {
  if (value === undefined || value === null || value === "") return "";
  return requireText(value, label, maxLength);
}

function validateEmail(value) {
  const email = requireText(value, "Email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "Enter a valid email address.");
  }
  return email;
}

function validatePassword(value) {
  if (typeof value !== "string" || value.length < 12 || value.length > MAX_PASSWORD_LENGTH) {
    throw new HttpError(400, "Password must be between 12 and 128 characters.");
  }
  return value;
}

function validateDate(value, label) {
  const parsedDate = typeof value === "string" ? new Date(`${value}T00:00:00.000Z`) : null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(parsedDate?.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== value
  ) {
    throw new HttpError(400, `${label} must be a valid date in YYYY-MM-DD format.`);
  }
  return value;
}

function getId(value, label = "ID") {
  if (!mongoose.isValidObjectId(value)) {
    throw new HttpError(400, `${label} is invalid.`);
  }
  return String(value);
}

function publicRecord(record) {
  if (!record) return record;
  const value = typeof record.toObject === "function" ? record.toObject() : record;
  return { ...value, id: String(value._id), _id: String(value._id) };
}

function publicUser(user) {
  return {
    id: String(user._id),
    email: user.email,
    role: user.role,
    employeeId: user.employeeId ? String(user.employeeId) : null,
  };
}

async function findActorEmployee(user) {
  if (!user.employeeId) return null;
  return Employee.findOne({ _id: user.employeeId, active: true });
}

async function scopedEmployeeIds(user) {
  if (user.role === "HR") return null;
  if (user.role === "Employee") return user.employeeId ? [user.employeeId] : [];

  const actor = await findActorEmployee(user);
  if (!actor) return [];
  return Employee.find({ department: actor.department, active: true }).distinct("_id");
}

async function ensureCanAccessEmployee(user, employeeId) {
  const employee = await Employee.findOne({ _id: employeeId, active: true });
  if (!employee) throw new HttpError(404, "Employee not found.");
  if (user.role === "HR") return employee;
  if (user.role === "Employee" && String(user.employeeId) === String(employee._id)) {
    return employee;
  }
  if (user.role === "Manager") {
    const actor = await findActorEmployee(user);
    if (actor && actor.department === employee.department) return employee;
  }
  throw new HttpError(403, "You do not have permission to access this employee.");
}

async function addNotifications(users, details, session) {
  const uniqueIds = [...new Set(users.map((user) => String(user._id || user)))];
  if (!uniqueIds.length) return;
  await Notification.insertMany(
    uniqueIds.map((userId) => ({ userId, ...details })),
    { ordered: false, ...(session ? { session } : {}) }
  );
}

async function notifyEmployee(employeeId, details, session) {
  const employeeQuery = Employee.findById(employeeId).select("userId");
  if (session) employeeQuery.session(session);
  const employee = await employeeQuery;
  if (employee?.userId) await addNotifications([employee.userId], details, session);
}

function employeePayload(body) {
  const role = body.role || "Employee";
  if (!["HR", "Manager", "Employee"].includes(role)) {
    throw new HttpError(400, "Account role must be HR, Manager, or Employee.");
  }
  return {
    name: requireText(body.name, "Name", 120),
    department: requireText(body.department, "Department", 100),
    designation: requireText(body.designation, "Designation", 120),
    email: validateEmail(body.email),
    role,
  };
}

async function createEmployeeAccount(payload, password) {
  const employee = await Employee.create(payload);
  let user;
  try {
    user = await User.create({
      email: payload.email,
      passwordHash: await bcrypt.hash(password, 12),
      role: payload.role,
      employeeId: employee._id,
    });
    employee.userId = user._id;
    await employee.save();
    return employee;
  } catch (error) {
    if (user) await User.deleteOne({ _id: user._id });
    await Employee.deleteOne({ _id: employee._id });
    throw error;
  }
}

function isDuplicateKey(error) {
  return error?.code === 11000;
}

function safeUserError(error) {
  if (error instanceof HttpError) return error;
  if (error?.name === "ValidationError" || error?.name === "CastError") {
    return new HttpError(400, "The submitted data is invalid.");
  }
  if (isDuplicateKey(error)) {
    return new HttpError(409, "An account or record with that value already exists.");
  }
  return error;
}

function enforceLoginRateLimit(req, res, next) {
  const key = req.ip || "unknown";
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (current && current.expiresAt > now && current.count >= 10) {
    return next(new HttpError(429, "Too many sign-in attempts. Please try again later."));
  }

  loginAttempts.set(key, {
    count: current && current.expiresAt > now ? current.count + 1 : 1,
    expiresAt: current && current.expiresAt > now ? current.expiresAt : now + 15 * 60 * 1000,
  });
  return next();
}

authRoutes.get("/status", async (req, res) => {
  const hasUsers = await User.exists({});
  res.json({ bootstrapRequired: !hasUsers });
});

authRoutes.post("/bootstrap", async (req, res) => {
  const configuredKey = process.env.HR_BOOTSTRAP_KEY;
  const providedKey = req.get("x-bootstrap-key");
  if (!configuredKey || !providedKey) {
    throw new HttpError(403, "HR account setup is not authorized.");
  }
  const expected = Buffer.from(configuredKey);
  const provided = Buffer.from(providedKey);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    throw new HttpError(403, "HR account setup is not authorized.");
  }

  const email = validateEmail(req.body.email);
  const password = validatePassword(req.body.password);
  const existingUser = await User.exists({});
  if (existingUser) throw new HttpError(409, "The initial HR account has already been created.");

  let claimed;
  try {
    claimed = await BootstrapState.findOneAndUpdate(
      { _id: "initial-hr", claimed: false },
      { $set: { claimed: true } },
      { new: true }
    );
    if (!claimed) {
      await BootstrapState.create({ _id: "initial-hr", claimed: true });
      claimed = true;
    }

    const user = await User.create({
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: "HR",
    });
    setSession(res, user._id);
    return res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new HttpError(409, "Initial HR setup is already in progress or complete.");
    }
    if (claimed) await BootstrapState.deleteOne({ _id: "initial-hr" });
    throw error;
  }
});

authRoutes.post("/login", enforceLoginRateLimit, async (req, res) => {
  const email = validateEmail(req.body.email);
  if (
    typeof req.body.password !== "string" ||
    !req.body.password ||
    req.body.password.length > MAX_PASSWORD_LENGTH
  ) {
    throw new HttpError(400, "Password is required and must be at most 128 characters.");
  }

  const user = await User.findOne({ email }).select("+passwordHash");
  const valid = user && user.active && (await bcrypt.compare(req.body.password, user.passwordHash));
  if (!valid) throw new HttpError(401, "Email or password is incorrect.");

  loginAttempts.delete(req.ip || "unknown");
  setSession(res, user._id);
  return res.json({ user: publicUser(user) });
});

authRoutes.post("/logout", (req, res) => {
  clearSession(res);
  res.status(204).end();
});

authRoutes.get("/me", authenticate, async (req, res) => {
  const employee = await findActorEmployee(req.user);
  res.json({
    user: publicUser(req.user),
    employee: employee ? publicRecord(employee) : null,
  });
});

authRoutes.patch("/password", authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const password = validatePassword(newPassword);
  const user = await User.findById(req.user._id).select("+passwordHash");
  if (!user || !(await bcrypt.compare(String(currentPassword || ""), user.passwordHash))) {
    throw new HttpError(400, "Current password is incorrect.");
  }
  user.passwordHash = await bcrypt.hash(password, 12);
  await user.save();
  clearSession(res);
  return res.status(204).end();
});

api.use("/auth", authRoutes);
api.use(authenticate);

api.get("/dashboard/summary", async (req, res) => {
  const employeeIds = await scopedEmployeeIds(req.user);
  const employeeFilter = employeeIds === null
    ? { active: true }
    : { _id: { $in: employeeIds }, active: true };
  const ids = employeeIds === null ? null : employeeIds;
  const today = new Date().toISOString().slice(0, 10);
  const [totalEmployees, attendanceRows, leaveRows, payrollRows] = await Promise.all([
    Employee.countDocuments(employeeFilter),
    Attendance.find({ date: today, ...(ids ? { employeeId: { $in: ids } } : {}) }).select("employeeId status"),
    LeaveRequest.find({
      status: "Approved",
      startDate: { $lte: today },
      endDate: { $gte: today },
      ...(ids ? { employeeId: { $in: ids } } : {}),
    }).select("employeeId"),
    req.user.role === "HR" ? Payroll.find({}).select("salary bonus deductions") : [],
  ]);
  res.json({
    totalEmployees,
    presentToday: attendanceRows.filter((item) => item.status === "Present").length,
    lateToday: attendanceRows.filter((item) => item.status === "Late").length,
    employeesOnLeave: new Set(leaveRows.map((item) => String(item.employeeId))).size,
    monthlyNetPayroll: payrollRows.reduce((total, item) => total + item.salary + item.bonus - item.deductions, 0),
  });
});

api.get("/employees", async (req, res) => {
  let filter = { active: true };
  if (req.user.role === "Employee") {
    filter._id = req.user.employeeId || null;
  } else if (req.user.role === "Manager") {
    const actor = await findActorEmployee(req.user);
    filter.department = actor?.department || "__no-team__";
  } else if (req.query.department) {
    filter.department = requireText(req.query.department, "Department", 100);
  }

  if (req.query.search) {
    const search = requireText(req.query.search, "Search", 100);
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { name: { $regex: escaped, $options: "i" } },
      { department: { $regex: escaped, $options: "i" } },
      { designation: { $regex: escaped, $options: "i" } },
      { email: { $regex: escaped, $options: "i" } },
    ];
  }

  const employees = await Employee.find(filter).sort({ name: 1 }).limit(500);
  res.json({ employees: employees.map(publicRecord) });
});

api.get("/employees/:id", async (req, res) => {
  const employeeId = getId(req.params.id, "Employee ID");
  const employee = await ensureCanAccessEmployee(req.user, employeeId);
  res.json({ employee: publicRecord(employee) });
});

api.post("/employees", requireRole("HR"), async (req, res) => {
  const payload = employeePayload(req.body);
  const password = validatePassword(req.body.password);
  const employee = await createEmployeeAccount(payload, password);
  res.status(201).json({ employee: publicRecord(employee), message: "Employee account created." });
});

api.put("/employees/:id", requireRole("HR"), async (req, res) => {
  const employeeId = getId(req.params.id, "Employee ID");
  const employee = await Employee.findOne({ _id: employeeId, active: true });
  if (!employee) throw new HttpError(404, "Employee not found.");

  const payload = employeePayload(req.body);
  const user = employee.userId ? await User.findById(employee.userId) : null;
  if (await Employee.exists({ _id: { $ne: employee._id }, email: payload.email })) {
    throw new HttpError(409, "An employee with that email address already exists.");
  }
  if (user && await User.exists({ _id: { $ne: user._id }, email: payload.email })) {
    throw new HttpError(409, "An account with that email address already exists.");
  }
  if (user?.role === "HR" && payload.role !== "HR") {
    const activeHrAccounts = await User.countDocuments({ role: "HR", active: true });
    if (activeHrAccounts <= 1) throw new HttpError(409, "Promote another HR user before changing the last HR account.");
  }
  if (user && payload.email !== user.email) user.email = payload.email;
  if (user) {
    user.role = payload.role;
    if (req.body.password) user.passwordHash = await bcrypt.hash(validatePassword(req.body.password), 12);
    await user.save();
  }
  Object.assign(employee, payload);
  await employee.save();
  res.json({ employee: publicRecord(employee), message: "Employee details updated." });
});

api.delete("/employees/:id", requireRole("HR"), async (req, res) => {
  const employeeId = getId(req.params.id, "Employee ID");
  const existing = await Employee.findOne({ _id: employeeId, active: true });
  if (!existing) throw new HttpError(404, "Employee not found.");
  if (String(existing.userId) === String(req.user._id)) {
    throw new HttpError(409, "You cannot deactivate your own account.");
  }
  const account = existing.userId ? await User.findById(existing.userId) : null;
  if (account?.role === "HR" && await User.countDocuments({ role: "HR", active: true }) <= 1) {
    throw new HttpError(409, "Promote another HR user before deactivating the last HR account.");
  }
  const employee = await Employee.findOneAndUpdate(
    { _id: employeeId, active: true },
    { $set: { active: false } },
    { new: true }
  );
  if (!employee) throw new HttpError(404, "Employee not found.");
  if (employee.userId) await User.updateOne({ _id: employee.userId }, { $set: { active: false } });
  res.json({ message: "Employee account deactivated." });
});

api.get("/attendance", async (req, res) => {
  const filter = {};
  if (req.query.date) filter.date = validateDate(req.query.date, "Date");
  if (req.query.employeeId) {
    const employee = await ensureCanAccessEmployee(req.user, getId(req.query.employeeId, "Employee ID"));
    filter.employeeId = employee._id;
  } else {
    const ids = await scopedEmployeeIds(req.user);
    if (ids !== null) filter.employeeId = { $in: ids };
  }
  const records = await Attendance.find(filter)
    .populate("employeeId", "name department designation")
    .sort({ date: -1 })
    .limit(1000);
  res.json({
    attendance: records.map((record) => ({
      ...publicRecord(record),
      employee: record.employeeId ? publicRecord(record.employeeId) : null,
      employeeId: record.employeeId?._id ? String(record.employeeId._id) : String(record.employeeId),
    })),
  });
});

api.post("/attendance", async (req, res) => {
  const employeeId = getId(req.body.employeeId, "Employee ID");
  const employee = await ensureCanAccessEmployee(req.user, employeeId);
  const date = validateDate(req.body.date, "Date");
  const status = requireText(req.body.status, "Status", 20);
  if (!["Present", "Absent", "Late", "Half Day", "On Leave"].includes(status)) {
    throw new HttpError(400, "Attendance status is not supported.");
  }

  const record = await Attendance.findOneAndUpdate(
    { employeeId: employee._id, date },
    { $set: { status, markedBy: req.user._id } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  res.json({ attendance: publicRecord(record) });
});

api.get("/leaves", async (req, res) => {
  const filter = {};
  const ids = await scopedEmployeeIds(req.user);
  if (ids !== null) filter.employeeId = { $in: ids };
  if (req.query.status) {
    const status = requireText(req.query.status, "Status", 20);
    if (!["Pending", "Approved", "Rejected"].includes(status)) {
      throw new HttpError(400, "Leave status is not supported.");
    }
    filter.status = status;
  }
  const requests = await LeaveRequest.find(filter).sort({ createdAt: -1 }).limit(1000);
  res.json({ leaveRequests: requests.map(publicRecord) });
});

api.post("/leaves", async (req, res) => {
  const targetId = req.user.role === "Employee"
    ? getId(req.user.employeeId, "Employee profile")
    : getId(req.body.employeeId, "Employee ID");
  const employee = await ensureCanAccessEmployee(req.user, targetId);
  const startDate = validateDate(req.body.startDate, "Start date");
  const endDate = validateDate(req.body.endDate, "End date");
  if (endDate < startDate) throw new HttpError(400, "End date must be on or after the start date.");

  const request = await LeaveRequest.create({
    employeeId: employee._id,
    employeeName: employee.name,
    department: employee.department,
    startDate,
    endDate,
    reason: requireText(req.body.reason, "Reason", 1000),
    status: "Pending",
  });
  res.status(201).json({ leaveRequest: publicRecord(request), message: "Leave request submitted." });
});

api.put("/leaves/:id", async (req, res) => {
  const requestId = getId(req.params.id, "Leave request ID");
  const request = await LeaveRequest.findById(requestId);
  if (!request) throw new HttpError(404, "Leave request not found.");
  await ensureCanAccessEmployee(req.user, request.employeeId);
  if (request.status !== "Pending") throw new HttpError(409, "Only pending leave requests can be edited.");
  if (req.user.role !== "HR" && String(request.employeeId) !== String(req.user.employeeId)) {
    throw new HttpError(403, "You cannot edit this leave request.");
  }

  const startDate = validateDate(req.body.startDate, "Start date");
  const endDate = validateDate(req.body.endDate, "End date");
  if (endDate < startDate) throw new HttpError(400, "End date must be on or after the start date.");
  request.startDate = startDate;
  request.endDate = endDate;
  request.reason = requireText(req.body.reason, "Reason", 1000);
  await request.save();
  res.json({ leaveRequest: publicRecord(request), message: "Leave request updated." });
});

api.patch("/leaves/:id/status", requireRole("HR", "Manager"), async (req, res) => {
  const requestId = getId(req.params.id, "Leave request ID");
  const status = requireText(req.body.status, "Status", 20);
  if (!["Approved", "Rejected"].includes(status)) {
    throw new HttpError(400, "A leave request can only be approved or rejected.");
  }

  const session = await mongoose.startSession();
  let request;
  try {
    await session.withTransaction(async () => {
      request = await LeaveRequest.findById(requestId).session(session);
      if (!request) throw new HttpError(404, "Leave request not found.");
      await ensureCanAccessEmployee(req.user, request.employeeId);
      if (String(request.employeeId) === String(req.user.employeeId)) {
        throw new HttpError(403, "You cannot approve or reject your own leave request.");
      }
      if (request.status !== "Pending") {
        throw new HttpError(409, "This leave request has already been reviewed.");
      }
      request.status = status;
      request.reviewedBy = req.user._id;
      await request.save({ session });
      await notifyEmployee(request.employeeId, {
        type: "leave",
        title: `Leave request ${status.toLowerCase()}`,
        message: `Your leave request for ${request.startDate} to ${request.endDate} was ${status.toLowerCase()}.`,
      }, session);
    });
  } finally {
    await session.endSession();
  }
  res.json({ leaveRequest: publicRecord(request), message: `Leave request ${status.toLowerCase()}.` });
});

api.get("/payroll", requireRole("HR"), async (req, res) => {
  const records = await Payroll.find({}).sort({ employeeName: 1 }).limit(1000);
  res.json({ payroll: records.map(publicRecord) });
});

api.put("/payroll/:employeeId", requireRole("HR"), async (req, res) => {
  const employeeId = getId(req.params.employeeId, "Employee ID");
  const employee = await Employee.findOne({ _id: employeeId, active: true });
  if (!employee) throw new HttpError(404, "Employee not found.");
  if (req.body.salary === undefined || req.body.salary === null || req.body.salary === "") {
    throw new HttpError(400, "Salary is required.");
  }
  const salary = Number(req.body.salary);
  const bonus = Number(req.body.bonus ?? 0);
  const deductions = Number(req.body.deductions ?? 0);
  const paymentStatus = req.body.paymentStatus || "Pending";
  if (![salary, bonus, deductions].every((amount) => Number.isFinite(amount) && amount >= 0)) {
    throw new HttpError(400, "Salary, bonus, and deductions must be non-negative numbers.");
  }
  if (!["Pending", "Paid", "On Hold"].includes(paymentStatus)) {
    throw new HttpError(400, "Payment status is not supported.");
  }
  const record = await Payroll.findOneAndUpdate(
    { employeeId },
    { $set: { employeeName: employee.name, salary, bonus, deductions, paymentStatus } },
    { new: true, upsert: true, runValidators: true }
  );
  res.json({ payroll: publicRecord(record) });
});

api.delete("/payroll/:employeeId", requireRole("HR"), async (req, res) => {
  const employeeId = getId(req.params.employeeId, "Employee ID");
  await Payroll.deleteOne({ employeeId });
  res.status(204).end();
});

api.get("/announcements", async (req, res) => {
  const actor = req.user.role === "HR" ? null : await findActorEmployee(req.user);
  const filter = req.user.role === "HR"
    ? {}
    : { $or: [{ department: "" }, { department: actor?.department || "__no-team__" }] };
  const announcements = await Announcement.find(filter).sort({ createdAt: -1 }).limit(200);
  res.json({ announcements: announcements.map(publicRecord) });
});

api.post("/announcements", requireRole("HR"), async (req, res) => {
  const title = requireText(req.body.title, "Title", 180);
  const description = requireText(req.body.description, "Description", 5000);
  const department = optionalText(req.body.department, "Department", 100);
  const session = await mongoose.startSession();
  let announcement;
  try {
    await session.withTransaction(async () => {
      [announcement] = await Announcement.create([{
        title,
        description,
        department,
        createdBy: req.user._id,
      }], { session });
      const employeeFilter = { active: true, ...(department ? { department } : {}) };
      const employeeIds = await Employee.find(employeeFilter).distinct("_id").session(session);
      const recipients = await User.find({ active: true, employeeId: { $in: employeeIds } })
        .select("_id")
        .session(session);
      await addNotifications(recipients, {
        type: "announcement",
        title: "New company announcement",
        message: title,
      }, session);
    });
  } finally {
    await session.endSession();
  }
  res.status(201).json({ announcement: publicRecord(announcement) });
});

api.put("/announcements/:id", requireRole("HR"), async (req, res) => {
  const announcementId = getId(req.params.id, "Announcement ID");
  const announcement = await Announcement.findByIdAndUpdate(
    announcementId,
    {
      $set: {
        title: requireText(req.body.title, "Title", 180),
        description: requireText(req.body.description, "Description", 5000),
        department: optionalText(req.body.department, "Department", 100),
      },
    },
    { new: true, runValidators: true }
  );
  if (!announcement) throw new HttpError(404, "Announcement not found.");
  res.json({ announcement: publicRecord(announcement) });
});

api.delete("/announcements/:id", requireRole("HR"), async (req, res) => {
  const result = await Announcement.deleteOne({ _id: getId(req.params.id, "Announcement ID") });
  if (!result.deletedCount) throw new HttpError(404, "Announcement not found.");
  res.status(204).end();
});

api.get("/trainings", async (req, res) => {
  let filter = {};
  if (req.user.role !== "HR") {
    const employeeId = getId(req.user.employeeId, "Employee profile");
    filter = { $or: [{ assignedEmployeeIds: { $size: 0 } }, { assignedEmployeeIds: employeeId }] };
  }
  const trainings = await Training.find(filter).sort({ createdAt: -1 }).limit(500);
  res.json({
    trainings: trainings.map((training) => ({
      ...publicRecord(training),
      completed: req.user.employeeId
        ? training.completedEmployeeIds.some((id) => String(id) === String(req.user.employeeId))
        : false,
    })),
  });
});

api.post("/trainings", requireRole("HR"), async (req, res) => {
  const title = requireText(req.body.title, "Title", 180);
  const description = requireText(req.body.description, "Description", 5000);
  const dueDate = req.body.dueDate ? validateDate(req.body.dueDate, "Due date") : "";
  if (req.body.employeeIds !== undefined && !Array.isArray(req.body.employeeIds)) {
    throw new HttpError(400, "Employee assignments must be a list of employee IDs.");
  }
  let employeeIds = [];
  if (Array.isArray(req.body.employeeIds) && req.body.employeeIds.length) {
    employeeIds = req.body.employeeIds.map((id) => getId(id, "Employee ID"));
    const found = await Employee.countDocuments({ _id: { $in: employeeIds }, active: true });
    if (found !== new Set(employeeIds).size) throw new HttpError(400, "One or more selected employees are unavailable.");
  } else {
    employeeIds = await Employee.find({ active: true }).distinct("_id");
  }

  const session = await mongoose.startSession();
  let training;
  try {
    await session.withTransaction(async () => {
      [training] = await Training.create([{
        title,
        description,
        dueDate,
        assignedEmployeeIds: employeeIds,
        createdBy: req.user._id,
      }], { session });
      const recipients = await User.find({ active: true, employeeId: { $in: employeeIds } })
        .select("_id")
        .session(session);
      await addNotifications(recipients, {
        type: "training",
        title: "Training assigned",
        message: title,
      }, session);
    });
  } finally {
    await session.endSession();
  }
  res.status(201).json({ training: publicRecord(training) });
});

api.patch("/trainings/:id/complete", async (req, res) => {
  if (!["Employee", "Manager"].includes(req.user.role)) {
    throw new HttpError(403, "Only employees can update their training completion.");
  }
  if (typeof req.body.completed !== "boolean") {
    throw new HttpError(400, "Training completion must be true or false.");
  }
  const employeeId = getId(req.user.employeeId, "Employee profile");
  const training = await Training.findById(getId(req.params.id, "Training ID"));
  if (!training) throw new HttpError(404, "Training program not found.");
  const isAssigned = training.assignedEmployeeIds.length === 0 ||
    training.assignedEmployeeIds.some((id) => String(id) === employeeId);
  if (!isAssigned) throw new HttpError(403, "This training is not assigned to you.");

  const completed = Boolean(req.body.completed);
  training.completedEmployeeIds = training.completedEmployeeIds.filter((id) => String(id) !== employeeId);
  if (completed) training.completedEmployeeIds.push(employeeId);
  await training.save();
  res.json({ training: publicRecord(training), completed });
});

api.delete("/trainings/:id", requireRole("HR"), async (req, res) => {
  const result = await Training.deleteOne({ _id: getId(req.params.id, "Training ID") });
  if (!result.deletedCount) throw new HttpError(404, "Training program not found.");
  res.status(204).end();
});

api.get("/notifications", async (req, res) => {
  const notifications = await Notification.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(100);
  res.json({ notifications: notifications.map(publicRecord) });
});

api.patch("/notifications/read-all", async (req, res) => {
  await Notification.updateMany(
    { userId: req.user._id, readAt: null },
    { $set: { readAt: new Date() } }
  );
  res.status(204).end();
});

api.patch("/notifications/:id/read", async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: getId(req.params.id, "Notification ID"), userId: req.user._id },
    { $set: { readAt: new Date() } },
    { new: true }
  );
  if (!notification) throw new HttpError(404, "Notification not found.");
  res.json({ notification: publicRecord(notification) });
});

router.use("/api", api);
router.use("/api", (req, res) => {
  res.status(404).json({ error: "API endpoint not found." });
});

router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const error = safeUserError(err);
  if (error.status) return res.status(error.status).json({ error: error.message });
  console.error("API request failed:", error.name || "Error");
  return res.status(500).json({ error: "The request could not be completed. Please try again." });
});

module.exports = router;
