export type UserRole =
  | "super_admin"
  | "counsellor"
  | "telecaller"
  | "application_team"
  | "admission_team"
  | "visa_team"
  | "front_desk";

export type Permission =
  | "leads"
  | "students"
  | "documents"
  | "applications"
  | "admissions"
  | "visa"
  | "analytics"
  | "branches"
  | "users"
  | "settings"
  | "activity_logs"
  | "chat";

export type LeadStanding = "warm" | "heated" | "cold" | "missed";

export type LeadStatus =
  | "FD-Junk"
  | "AP-Call Not Received"
  | "AP-Call Back Later"
  | "AP-Not Interested"
  | "Wrong Number"
  | "Not Qualified"
  | "Not Interested"
  | "AP-Pending"
  | "Interested 2027"
  | "FD-Future Prospective"
  | "On Hold"
  | "Plan Dropped"
  | "Counselling"
  | "Counselled"
  | "AP-Interested"
  | "Negotiation"
  | "Open/Unassigned"
  | "Future Prospect"
  | "FD-Interested"
  | "Dead/Junk Lead"
  | "Not Answering"
  | "Assigned"
  | "In-Progress"
  | "Not Genuine"
  | "Phone Counselling"
  | "Qualified Lead"
  | "Registered/Completed"
  | "Interested"
  | "Closed Lost";

export type StudentStage = string;

export type LeadSource =
  | "walk_in"
  | "facebook"
  | "whatsapp"
  | "instagram"
  | "website"
  | "referral"
  | "other";

export type AssignmentMethod = "round_robin" | "manual";

export interface IUser {
  _id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  permissions: Permission[];
  branch: string;
  dateOfBirth?: string;
  phone?: string;
  target?: number;
  currentCount?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBranch {
  _id: string;
  name: string;
  location: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  createdAt: Date;
}

export interface ILead {
  _id: string;
  name: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  source: LeadSource;
  interestedService: string;
  interestedCountry: string;
  branch: string;
  standing: LeadStanding;
  assignedTo?: string;
  assignedBy?: string;
  notes: INote[];
  remindersCount: number;
  lastReminderAt?: Date;
  convertedToStudent: boolean;
  stage?: string;
  status?: LeadStatus;
  stageDates?: Record<string, string>;
  statusDates?: Record<string, string>;
  // Multiple interested countries & universities
  interestedCountries?: { country: string; universityName?: string }[];
  // Parent information
  parentName?: string;
  parentPhone1?: string;
  parentPhone2?: string;
  // Student academic information
  academicScore?: string;
  academicInstitution?: string;
  temporaryAddress?: string;
  permanentAddress?: string;
  // IELTS / PTE information
  examType?: string;
  examScore?: string;
  examJoinDate?: string;
  examStartDate?: string;
  examEndDate?: string;
  examPaymentMethod?: string;
  examEstimatedDate?: string;
  // Personal details
  gender?: string;
  maritalStatus?: string;
  nationality?: string;
  passportNumber?: string;
  visaExpiryDate?: string;
  senderName?: string;
  // Application details
  academicYear?: string;
  applyLevel?: string;
  course?: string;
  intakeYear?: string;
  intakeQuarter?: string;
  // General comments / notes at creation
  comments?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface INote {
  _id: string;
  content: string;
  addedBy: string;
  addedByName: string;
  addedByRole: UserRole;
  createdAt: Date;
}

export interface ICourse {
  name: string;
  intakeQuarter?: string;
  intakeYear?: string;
  commencementDate?: string;
}

export interface IAdmissionDetail {
  _id?: string;
  country: string;
  universityName?: string;
  location?: string;
  annualTuitionFee?: string;
  stage?: string;
  standing?: LeadStanding;
  remarks?: string;
  statusDate?: string;
  closed?: boolean;
  courses?: ICourse[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IStudent {
  _id: string;
  lead: string;
  name: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  source: LeadSource;
  branch: string;
  counsellor: string;
  currentStage: StudentStage;
  stage?: string;
  standing?: LeadStanding;
  remarks?: string;
  enrolled?: boolean;
  enrolledAt?: Date;
  countries: IStudentCountry[];
  admissionDetails?: IAdmissionDetail[];
  notes: INote[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IStudentCountry {
  country: string;
  status: StudentStage;
  universityName?: string;
  applicationStatus?: string;
  admissionStatus?: string;
  visaStatus?: string;
  visaApprovedAt?: Date;
  rejectedAt?: Date;
  rejectionReason?: string;
}

export interface IDocument {
  _id: string;
  student: string;
  country: string;
  name: string;
  originalName: string;
  filePath: string;
  fileSize: number;
  fileType: string;
  uploadedBy: string;
  isVerified: boolean;
  verifiedBy?: string;
  createdAt: Date;
}

export interface IChecklist {
  _id: string;
  country: string;
  documents: IChecklistItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IChecklistItem {
  name: string;
  description?: string;
  isRequired: boolean;
}

export interface IApplication {
  _id: string;
  student: string;
  country: string;
  universityName: string;
  course: string;
  status: "pending" | "submitted" | "accepted" | "rejected" | "deferred";
  submittedBy?: string;
  submittedAt?: Date;
  notes: INote[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IActivityLog {
  _id: string;
  user: string;
  userName: string;
  userRole: UserRole;
  action: string;
  module: string;
  targetId?: string;
  targetName?: string;
  details?: string;
  createdAt: Date;
}

export interface DashboardStats {
  totalLeads: number;
  totalStudents: number;
  totalVisaApproved: number;
  totalApplications: number;
  recentLeads: ILead[];
  conversionRate: number;
}
