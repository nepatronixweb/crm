import mongoose, { Document, Model, Schema } from "mongoose";

export interface ICommission extends Document {
  destinationCountry: string;
  applicantName: string;
  studentId: string;
  universityName: string;
  courseStartDate: string;
  courseEndDate: string;
  courseAnnualFee: string;
  tuitionFeePaid: string;
  commissionPercent: number;
  currencySymbol: string;
  amountFromPercent: string;
  intakeQuarter: "Q1" | "Q2" | "Q3" | "Q4" | "";
  intakeYear: string;
  commission: string;
  claim: string;
  claimableIntake: "1st_sem" | "2nd_sem" | "1_year" | "";
  b2bName: string;
  b2bChannel: "direct" | "sub_agent" | "";
  commissionAmount: string;
  remarksStatus: "yes" | "received" | "";
  createdBy: mongoose.Types.ObjectId;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
}

const CommissionSchema = new Schema<ICommission>(
  {
    destinationCountry: { type: String, required: true, trim: true },
    applicantName: { type: String, required: true, trim: true },
    studentId: { type: String, default: "", trim: true },
    universityName: { type: String, required: true, trim: true },
    courseStartDate: { type: String, default: "" },
    courseEndDate: { type: String, default: "" },
    courseAnnualFee: { type: String, default: "" },
    tuitionFeePaid: { type: String, default: "" },
    commissionPercent: { type: Number, default: 0 },
    currencySymbol: { type: String, default: "" },
    amountFromPercent: { type: String, default: "" },
    intakeQuarter: { type: String, enum: ["Q1", "Q2", "Q3", "Q4", ""], default: "" },
    intakeYear: { type: String, default: "" },
    commission: { type: String, default: "" },
    claim: { type: String, default: "" },
    claimableIntake: { type: String, enum: ["1st_sem", "2nd_sem", "1_year", ""], default: "" },
    b2bName: { type: String, default: "" },
    b2bChannel: { type: String, enum: ["direct", "sub_agent", ""], default: "" },
    commissionAmount: { type: String, default: "" },
    remarksStatus: { type: String, enum: ["yes", "received", ""], default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdByName: { type: String, default: "" },
  },
  { timestamps: true }
);

CommissionSchema.index({ destinationCountry: 1, createdAt: -1 });
CommissionSchema.index({ createdBy: 1, createdAt: -1 });

const Commission: Model<ICommission> =
  mongoose.models.Commission || mongoose.model<ICommission>("Commission", CommissionSchema);

export default Commission;
