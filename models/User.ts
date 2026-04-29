import mongoose, { Document, Schema } from "mongoose";
/** HR module classification - does not replace CRM `role` (counsellor, super_admin, etc.). */
export type HrRoleType = "admin" | "employee";

export interface IUserDocument extends Document {
  name: string;
  email: string;
  password: string;
  role: string;
  roles: string[];
  activeRole: string;
  permissions: string[];
  branch: mongoose.Types.ObjectId;
  dateOfBirth?: string;
  phone?: string;
  target?: number;
  currentCount?: number;
  isActive: boolean;
  /** HR: access to /api/hr/admin/* when "admin" (also super_admin always). */
  hrRole: HrRoleType;
  monthlySalary: number;
  workingDays: number;
  /** Hours per workday (HR reference; default 8). */
  workingHoursPerDay: number;
  /** Optional registered / expected office IP for this employee (HR reference). */
  officeNetworkIp: string;
  /** Optional per-user dashboard section visibility (merged over org AppSettings). */
  dashboardWidgets?: Record<string, boolean>;
  /** Optional per-user dashboard section order per audience (merged over org AppSettings). */
  dashboardWidgetOrder?: Record<string, string[]>;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUserDocument>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    role: {
      type: String,
      required: true,
      trim: true,
    },
    roles: { type: [String], default: [] },
    activeRole: { type: String, trim: true, default: "" },
    permissions: { type: [String], default: [] },
    branch: { type: Schema.Types.ObjectId, ref: "Branch" },
    dateOfBirth: { type: String },
    phone: { type: String },
    target: { type: Number, default: 0 },
    currentCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    hrRole: {
      type: String,
      enum: ["admin", "employee"],
      default: "employee",
    },
    monthlySalary: { type: Number, default: 0, min: 0 },
    workingDays: { type: Number, default: 26, min: 1 },
    workingHoursPerDay: { type: Number, default: 8, min: 0, max: 24 },
    officeNetworkIp: { type: String, default: "", trim: true, maxlength: 128 },
    dashboardWidgets: { type: Schema.Types.Mixed, default: () => ({}) },
    dashboardWidgetOrder: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true }
);

// Indexes for frequent query patterns
UserSchema.index({ role: 1 });
UserSchema.index({ roles: 1 });
UserSchema.index({ branch: 1 });
UserSchema.index({ isActive: 1, role: 1 });

export default mongoose.models.User || mongoose.model<IUserDocument>("User", UserSchema);
