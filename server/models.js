const mongoose = require("mongoose");

const { Schema } = mongoose;

const employeeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    department: { type: String, required: true, trim: true, maxlength: 100 },
    designation: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    role: { type: String, enum: ["HR", "Manager", "Employee"], default: "Employee" },
    userId: { type: Schema.Types.ObjectId, ref: "User", unique: true, sparse: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

employeeSchema.index({ email: 1 }, { unique: true });

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["HR", "Manager", "Employee"], required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const attendanceSchema = new Schema(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    status: {
      type: String,
      enum: ["Present", "Absent", "Late", "Half Day", "On Leave"],
      required: true,
    },
    markedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });

const leaveRequestSchema = new Schema(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    employeeName: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    endDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

const payrollSchema = new Schema(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true, unique: true },
    employeeName: { type: String, required: true, trim: true },
    salary: { type: Number, required: true, min: 0 },
    bonus: { type: Number, default: 0, min: 0 },
    deductions: { type: Number, default: 0, min: 0 },
    paymentStatus: { type: String, enum: ["Pending", "Paid", "On Hold"], default: "Pending" },
  },
  { timestamps: true }
);

const announcementSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    department: { type: String, trim: true, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

const trainingSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    dueDate: { type: String, default: "" },
    assignedEmployeeIds: [{ type: Schema.Types.ObjectId, ref: "Employee" }],
    completedEmployeeIds: [{ type: Schema.Types.ObjectId, ref: "Employee" }],
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["leave", "announcement", "training"], required: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });

const bootstrapStateSchema = new Schema({
  _id: String,
  claimed: { type: Boolean, default: true },
});

module.exports = {
  Employee: mongoose.models.Employee || mongoose.model("Employee", employeeSchema),
  User: mongoose.models.User || mongoose.model("User", userSchema),
  Attendance: mongoose.models.Attendance || mongoose.model("Attendance", attendanceSchema),
  LeaveRequest: mongoose.models.LeaveRequest || mongoose.model("LeaveRequest", leaveRequestSchema),
  Payroll: mongoose.models.Payroll || mongoose.model("Payroll", payrollSchema),
  Announcement: mongoose.models.Announcement || mongoose.model("Announcement", announcementSchema),
  Training: mongoose.models.Training || mongoose.model("Training", trainingSchema),
  Notification: mongoose.models.Notification || mongoose.model("Notification", notificationSchema),
  BootstrapState:
    mongoose.models.BootstrapState || mongoose.model("BootstrapState", bootstrapStateSchema),
};
