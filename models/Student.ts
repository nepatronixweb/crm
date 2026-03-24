import mongoose, { Document, Schema } from "mongoose";
import { LeadSource, INote } from "@/types";

const NoteSchema = new Schema<INote>(
  {
    content: { type: String, required: true },
    addedBy: { type: String, required: true },
    addedByName: { type: String, required: true },
    addedByRole: { type: String, required: true },
  },
  { timestamps: true }
);

const CourseSchema = new Schema(
  {
    name: { type: String, required: true },
    level: { type: String, default: "" },
    intakeQuarter: { type: String, enum: ["Q1", "Q2", "Q3", "Q4", ""], default: "" },
    intakeYear: { type: String, default: "" },
    commencementDate: { type: String, default: "" },
  },
  { timestamps: false, _id: false }
);

const AdmissionDetailSchema = new Schema(
  {
    country: { type: String, required: true },
    universityName: { type: String, default: "" },
    location: { type: String, default: "" },
    annualTuitionFee: { type: String, default: "" },
    stage: { type: String, default: "" },
    pipeline: { type: String, default: "" },
    standing: { type: String, enum: ["hot", "warm", "heated", "cold", "missed", ""], default: "" },
    remarks: { type: String, default: "" },
    statusDate: { type: String, default: "" },
    closed: { type: Boolean, default: false },
    b2bAgentType: { type: String, enum: ["Agent", "Sub-Agent", ""], default: "" },
    b2bName: { type: String, default: "" },
    courses: [CourseSchema],
  },
  { timestamps: true }
);

const CountrySchema = new Schema({
  country: { type: String, required: true },
  status: {
    type: String,
    enum: ["counsellor", "application", "admission", "visa", "completed", "rejected"],
    default: "counsellor",
  },
  universityName: { type: String },
  applicationStatus: { type: String },
  admissionStatus: { type: String },
  visaStatus: { type: String },
  visaApprovedAt: { type: Date },
  rejectedAt: { type: Date },
  rejectionReason: { type: String },
});

const AdmissionProgressSchema = new Schema(
  {
    country: { type: String, required: true },
    stage: { type: String, default: "" },
    remarks: { type: String, default: "" },
    standing: { type: String, default: "" },
    statusDate: { type: Date, default: () => new Date() },
    changedBy: { type: String },
    changedByName: { type: String },
  },
  { timestamps: true }
);

const VisaProgressSchema = new Schema(
  {
    country: { type: String, required: true },
    stage: { type: String, default: "" },
    remarks: { type: String, default: "" },
    standing: { type: String, default: "" },
    statusDate: { type: Date, default: () => new Date() },
    changedBy: { type: String },
    changedByName: { type: String },
  },
  { timestamps: true }
);

const ApplicationProgressSchema = new Schema(
  {
    stage: { type: String, default: "" },
    remarks: { type: String, default: "" },
    standing: { type: String, default: "" },
    statusDate: { type: Date, default: () => new Date() },
    changedBy: { type: String },
    changedByName: { type: String },
  },
  { timestamps: true }
);

export interface ICourse {
  name: string;
  intakeQuarter: string;
  intakeYear: string;
  commencementDate: string;
}

interface IStudentDocument extends Document {
  lead: mongoose.Types.ObjectId;
  name: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  source: LeadSource;
  branch: mongoose.Types.ObjectId;
  counsellor: mongoose.Types.ObjectId;
  currentStage: string;
  stage?: string;
  standing?: string;
  remarks?: string;
  enrolled?: boolean;
  enrolledAt?: Date;
  countries: mongoose.Types.DocumentArray<mongoose.Document>;
  admissionDetails: mongoose.Types.DocumentArray<mongoose.Document>;
  admissionProgressHistory?: Array<{
    country: string;
    stage: string;
    remarks: string;
    standing: string;
    statusDate: Date;
    changedBy?: string;
    changedByName?: string;
  }>;
  visaProgressHistory?: Array<{
    country: string;
    stage: string;
    remarks: string;
    standing: string;
    statusDate: Date;
    changedBy?: string;
    changedByName?: string;
  }>;
  applicationProgressHistory?: Array<{
    stage: string;
    remarks: string;
    standing: string;
    statusDate: Date;
    changedBy?: string;
    changedByName?: string;
  }>;
  notes: INote[];
  createdAt: Date;
  updatedAt: Date;
}

const StudentSchema = new Schema<IStudentDocument>(
  {
    lead: { type: Schema.Types.ObjectId, ref: "Lead", required: true },
    name: { type: String, required: true },
    phone: { type: String, default: "" },
    email: { type: String, default: "", lowercase: true },
    dateOfBirth: { type: String },
    source: { type: String, enum: ["walk_in", "facebook", "whatsapp", "instagram", "website", "referral", "other"] },
    branch: { type: Schema.Types.ObjectId, ref: "Branch", required: true },
    counsellor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    currentStage: {
      type: String,
      enum: ["counsellor", "application", "admission", "visa", "completed", "rejected"],
      default: "counsellor",
    },
    stage: { type: String, default: "" },
    standing: { type: String, enum: ["warm", "heated", "cold", "missed", ""], default: "" },
    remarks: { type: String, default: "" },
    enrolled: { type: Boolean, default: false },
    enrolledAt: { type: Date },
    countries: [CountrySchema],
    admissionDetails: [AdmissionDetailSchema],
    admissionProgressHistory: [AdmissionProgressSchema],
    visaProgressHistory: [VisaProgressSchema],
    applicationProgressHistory: [ApplicationProgressSchema],
    notes: [NoteSchema],
  },
  { timestamps: true }
);

// Indexes for fast queries
StudentSchema.index({ branch: 1, currentStage: 1 });
StudentSchema.index({ counsellor: 1 });
StudentSchema.index({ lead: 1 }, { unique: true });
StudentSchema.index({ createdAt: -1 });

export default mongoose.models.Student || mongoose.model<IStudentDocument>("Student", StudentSchema);
