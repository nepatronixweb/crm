import mongoose, { Schema, Document, Model } from "mongoose";
import { DEFAULT_APPLICATION_ROLES } from "@/lib/applicationRoles";
import { DEFAULT_TELECALLER_TRANSFER_OUTCOMES } from "@/lib/telecallerTransferConfig";

export interface IAppSettings extends Document {
  // Branding
  companyName: string;
  shortCode: string;
  tagline: string;
  logoPath: string;
  faviconPath: string;
  brandColor: string;
  // Contact
  address: string;
  phone: string;
  email: string;
  website: string;
  // Lead Configuration
  leadStatuses: string[];
  leadSources: string[];
  leadStandings: string[];
  fdStatuses: string[];
  leadStageGroups: string[];
  leadStages: { value: string; label: string; group: string }[];
  stageToPipelineMapping: { [stageValue: string]: string };
  // Per-country stage overrides — if set, these replace the global leadStages for that country
  countryStages: { [country: string]: { value: string; label: string; pipeline: string }[] };
  b2bNames: string[];
  remarkOptions: string[];
  // Lists
  countries: { name: string; universities: string[] }[];
  services: string[];
  courses: string[];
  educationLevels: string[];
  // Module toggles (list of enabled module keys)
  enabledModules: string[];
  /** Optional override: country name → default commission % (Commission module). */
  commissionPercentByCountry: Record<string, number>;
  // Email / SMTP
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  emailFromName: string;
  // Payment QR
  paymentQrPath: string;
  // Meta
  updatedAt: Date;
  /** Editable in Settings — drives user role dropdown & default permissions. */
  applicationRoles: { slug: string; label: string; defaultPermissions: string[] }[];
  /** Telecaller leads table Transfer dropdown + PATCH behaviour. */
  telecallerTransferOutcomes: {
    id: string;
    label: string;
    effect: string;
    fdStatus?: string;
    standing?: string;
    requiresCounsellor?: boolean;
    requiresAppointmentDate?: boolean;
  }[];
}

const AppSettingsSchema = new Schema<IAppSettings>(
  {
    // Branding
    companyName: { type: String, default: "Education Tree Global" },
    shortCode:   { type: String, default: "ETG" },
    tagline:     { type: String, default: "Your global education partner" },
    logoPath:    { type: String, default: "" },
    faviconPath: { type: String, default: "" },
    brandColor:  { type: String, default: "#2563eb" },
    // Contact
    address:  { type: String, default: "" },
    phone:    { type: String, default: "" },
    email:    { type: String, default: "" },
    website:  { type: String, default: "" },
    // Lead configuration
    leadStatuses: {
      type: [String],
      default: ["new", "contacted", "qualified", "application", "admission", "visa", "completed", "rejected"],
    },
    leadSources: {
      type: [String],
      default: ["Walk-in", "Referral", "Social Media", "Website", "Partner", "Phone Call", "Email", "Exhibition", "Other"],
    },
    leadStandings: {
      type: [String],
      default: ["heated", "hot", "warm", "out_of_contact"],
    },
    fdStatuses: {
      type: [String],
      default: [
        "FD-Junk", "AP-Call Not Received", "AP-Call Back Later", "AP-Not Interested",
        "Wrong Number", "Not Qualified", "Not Interested", "AP-Pending",
        "Interested 2027", "FD-Future Prospective", "On Hold", "Plan Dropped",
        "Counselling", "Counselled", "AP-Interested", "Negotiation",
        "Open/Unassigned", "Future Prospect", "FD-Interested", "Dead/Junk Lead",
        "Not Answering", "Assigned", "In-Progress", "Not Genuine",
        "Phone Counselling", "Qualified Lead", "Registered/Completed",
        "Interested", "Closed Lost",
      ],
    },
    leadStageGroups: {
      type: [String],
      default: ["Application", "Offer", "GS", "COE", "Visa"],
    },
    leadStages: {
      type: [{ value: { type: String }, label: { type: String }, group: { type: String } }],
      default: [
        { value: "document_pending", label: "Document Pending", group: "Application" },
        { value: "document_submitted", label: "Document Submitted", group: "Application" },
        { value: "offer_applied", label: "Offer Applied", group: "Offer" },
        { value: "acknowledge", label: "Acknowledge", group: "Offer" },
        { value: "document_requested", label: "Document Requested", group: "Offer" },
        { value: "document_sent", label: "Document Sent", group: "Offer" },
        { value: "conditional_offer_received", label: "Conditional Offer Received", group: "Offer" },
        { value: "unconditional_offer_received", label: "Unconditional Offer Received", group: "Offer" },
        { value: "offer_rejected", label: "Offer Rejected", group: "Offer" },
        { value: "gs_applied", label: "GS Applied", group: "GS" },
        { value: "gs_additional_doc_requested", label: "GS Additional Doc Requested", group: "GS" },
        { value: "gs_additional_doc_sent", label: "GS Additional Doc Sent", group: "GS" },
        { value: "gs_approved", label: "GS Approved", group: "GS" },
        { value: "gs_rejected", label: "GS Rejected", group: "GS" },
        { value: "coe_applied", label: "COE Applied", group: "COE" },
        { value: "coe_additional_doc_requested", label: "COE Additional Doc Requested", group: "COE" },
        { value: "coe_additional_doc_sent", label: "COE Additional Doc Sent", group: "COE" },
        { value: "coe_received", label: "COE Received", group: "COE" },
        { value: "coe_rejected", label: "COE Rejected", group: "COE" },
        { value: "coe_withdrawn", label: "COE Withdrawn", group: "COE" },
        { value: "visa_applied", label: "Visa Applied", group: "Visa" },
        { value: "visa_grant", label: "Visa Grant", group: "Visa" },
        { value: "visa_reject", label: "Visa Reject", group: "Visa" },
        { value: "visa_invalid", label: "Visa Invalid", group: "Visa" },
        { value: "visa_withdrawn", label: "Visa Withdrawn", group: "Visa" },
      ],
    },
    countryStages: {
      type: Schema.Types.Mixed,
      default: {
        "United Kingdom": [
          { value: "offer_applied",         label: "Offer Applied",         pipeline: "Offer" },
          { value: "conditional_offer",      label: "Conditional Offer",     pipeline: "Offer" },
          { value: "unconditional_offer",    label: "Unconditional Offer",   pipeline: "Offer" },
          { value: "offer_reject",           label: "Offer Reject",          pipeline: "Offer" },
          { value: "coe_applied",            label: "CoE Applied",           pipeline: "COE"   },
          { value: "coe_received",           label: "CoE Received",          pipeline: "COE"   },
          { value: "coe_withdrawn_reject",   label: "CoE Withdrawn/Reject",  pipeline: "COE"   },
          { value: "visa_applied",           label: "Visa Applied",          pipeline: "Visa"  },
          { value: "visa_grant",             label: "Visa Grant",            pipeline: "Visa"  },
          { value: "visa_reject",            label: "Visa Reject",           pipeline: "Visa"  },
          { value: "visa_withdrawn",         label: "Visa Withdrawn",        pipeline: "Visa"  },
          { value: "visa_reapply",           label: "Visa Reapply",          pipeline: "Visa"  },
        ],
        "New Zealand": [
          { value: "offer_applied",         label: "Offer Applied",         pipeline: "Offer" },
          { value: "conditional_offer",      label: "Conditional Offer",     pipeline: "Offer" },
          { value: "unconditional_offer",    label: "Unconditional Offer",   pipeline: "Offer" },
          { value: "offer_reject",           label: "Offer Reject",          pipeline: "Offer" },
          { value: "visa_applied",           label: "Visa Applied",          pipeline: "Visa"  },
          { value: "aip",                    label: "AIP",                   pipeline: "Visa"  },
          { value: "visa_grant",             label: "Visa Grant",            pipeline: "Visa"  },
          { value: "visa_reject",            label: "Visa Reject",           pipeline: "Visa"  },
          { value: "visa_withdrawn",         label: "Visa Withdrawn",        pipeline: "Visa"  },
          { value: "visa_reapply",           label: "Visa Reapply",          pipeline: "Visa"  },
        ],
        "United States": [
          { value: "offer_applied",         label: "Offer Applied",         pipeline: "Offer" },
          { value: "conditional_offer",      label: "Conditional Offer",     pipeline: "Offer" },
          { value: "unconditional_offer",    label: "Unconditional Offer",   pipeline: "Offer" },
          { value: "offer_reject",           label: "Offer Reject",          pipeline: "Offer" },
          { value: "coe_applied",            label: "CoE Applied",           pipeline: "COE"   },
          { value: "coe_received",           label: "CoE Received",          pipeline: "COE"   },
          { value: "visa_applied",           label: "Visa Applied",          pipeline: "Visa"  },
          { value: "visa_grant",             label: "Visa Grant",            pipeline: "Visa"  },
          { value: "visa_reject",            label: "Visa Reject",           pipeline: "Visa"  },
          { value: "visa_withdrawn",         label: "Visa Withdrawn",        pipeline: "Visa"  },
          { value: "visa_reapply",           label: "Visa Reapply",          pipeline: "Visa"  },
        ],
        "Canada": [
          { value: "offer_applied",         label: "Offer Applied",         pipeline: "Offer" },
          { value: "conditional_offer",      label: "Conditional Offer",     pipeline: "Offer" },
          { value: "unconditional_offer",    label: "Unconditional Offer",   pipeline: "Offer" },
          { value: "offer_reject",           label: "Offer Reject",          pipeline: "Offer" },
          { value: "coe_applied",            label: "CoE Applied",           pipeline: "COE"   },
          { value: "coe_received",           label: "CoE Received",          pipeline: "COE"   },
          { value: "pal_applied",            label: "PAL Applied",           pipeline: "COE"   },
          { value: "pal_received",           label: "PAL Received",          pipeline: "COE"   },
          { value: "visa_applied",           label: "Visa Applied",          pipeline: "Visa"  },
          { value: "ppr",                    label: "PPR",                   pipeline: "Visa"  },
          { value: "visa_grant",             label: "Visa Grant",            pipeline: "Visa"  },
          { value: "visa_reject",            label: "Visa Reject",           pipeline: "Visa"  },
          { value: "visa_withdrawn",         label: "Visa Withdrawn",        pipeline: "Visa"  },
          { value: "visa_reapply",           label: "Visa Reapply",          pipeline: "Visa"  },
        ],
        "Germany": [
          { value: "offer_applied",         label: "Offer Applied",         pipeline: "Offer" },
          { value: "conditional_offer",      label: "Conditional Offer",     pipeline: "Offer" },
          { value: "unconditional_offer",    label: "Unconditional Offer",   pipeline: "Offer" },
          { value: "offer_reject",           label: "Offer Reject",          pipeline: "Offer" },
          { value: "coe_applied",            label: "CoE Applied",           pipeline: "COE"   },
          { value: "coe_received",           label: "CoE Received",          pipeline: "COE"   },
          { value: "visa_applied",           label: "Visa Applied",          pipeline: "Visa"  },
          { value: "visa_grant",             label: "Visa Grant",            pipeline: "Visa"  },
          { value: "visa_reject",            label: "Visa Reject",           pipeline: "Visa"  },
          { value: "visa_withdrawn",         label: "Visa Withdrawn",        pipeline: "Visa"  },
          { value: "visa_reapply",           label: "Visa Reapply",          pipeline: "Visa"  },
        ],
        "Finland": [
          { value: "offer_applied",         label: "Offer Applied",         pipeline: "Offer" },
          { value: "conditional_offer",      label: "Conditional Offer",     pipeline: "Offer" },
          { value: "unconditional_offer",    label: "Unconditional Offer",   pipeline: "Offer" },
          { value: "offer_reject",           label: "Offer Reject",          pipeline: "Offer" },
          { value: "coe_applied",            label: "CoE Applied",           pipeline: "COE"   },
          { value: "coe_received",           label: "CoE Received",          pipeline: "COE"   },
          { value: "visa_applied",           label: "Visa Applied",          pipeline: "Visa"  },
          { value: "visa_grant",             label: "Visa Grant",            pipeline: "Visa"  },
          { value: "visa_reject",            label: "Visa Reject",           pipeline: "Visa"  },
          { value: "visa_withdrawn",         label: "Visa Withdrawn",        pipeline: "Visa"  },
          { value: "visa_reapply",           label: "Visa Reapply",          pipeline: "Visa"  },
        ],
      },
    },
    stageToPipelineMapping: {
      type: Schema.Types.Mixed,
      default: {
        "document_pending": "Application",
        "document_submitted": "Application",
        "offer_applied": "Offer",
        "acknowledge": "Offer",
        "document_requested": "Offer",
        "document_sent": "Offer",
        "conditional_offer_received": "Offer",
        "unconditional_offer_received": "Offer",
        "offer_rejected": "Offer",
        "gs_applied": "GS",
        "gs_additional_doc_requested": "GS",
        "gs_additional_doc_sent": "GS",
        "gs_approved": "GS",
        "gs_rejected": "GS",
        "coe_applied": "COE",
        "coe_additional_doc_requested": "COE",
        "coe_additional_doc_sent": "COE",
        "coe_received": "COE",
        "coe_rejected": "COE",
        "coe_withdrawn": "COE",
        "visa_applied": "Visa",
        "visa_grant": "Visa",
        "visa_reject": "Visa",
        "visa_invalid": "Visa",
        "visa_withdrawn": "Visa",
      },
    },
    // B2B Names
    b2bNames: {
      type: [String],
      default: [],
    },
    // Remark Options
    remarkOptions: {
      type: [String],
      default: [
        "Additional Documents Requested", "Additional Documents Sent",
        "Interview \u2013 GS/Cr./Visa", "Interview Cleared", "Payment Made",
        "Medical Requested/Booked", "Passport Submitted",
        "DS-160/VFS/Embassy Appointment", "Pink Slip", "NOC",
        "Defer Offer Requested", "Defer CoE Requested",
        "Refund Requested", "Offer Withdrawn", "Done",
      ],
    },
    // Lists
    countries: {
      type: [{ name: { type: String, required: true }, universities: { type: [String], default: [] } }],
      default: [
        { name: "Australia", universities: ["University of Melbourne","Australian National University","University of Sydney","University of Queensland","Monash University","University of New South Wales","University of Adelaide","University of Western Australia","University of Technology Sydney","RMIT University","Deakin University","La Trobe University","Macquarie University","Griffith University","Queensland University of Technology","Curtin University","Bond University","Charles Darwin University","Federation University"] },
        { name: "Canada", universities: ["University of Toronto","University of British Columbia","McGill University","University of Alberta","McMaster University","University of Ottawa","University of Waterloo","Western University","Queen's University","Dalhousie University","University of Calgary","Simon Fraser University","York University","Concordia University","University of Manitoba","University of Saskatchewan","Carleton University","Ryerson University","Brock University","University of Victoria"] },
        { name: "United Kingdom", universities: ["University of Oxford","University of Cambridge","Imperial College London","University College London","London School of Economics","University of Edinburgh","University of Manchester","King's College London","University of Bristol","University of Warwick","University of Glasgow","University of Birmingham","University of Leeds","University of Sheffield","University of Nottingham","University of Liverpool","University of Southampton","Newcastle University","Durham University","University of Bath","Cardiff University","Heriot-Watt University","University of Exeter"] },
        { name: "United States", universities: ["Massachusetts Institute of Technology","Stanford University","Harvard University","California Institute of Technology","University of Chicago","Princeton University","Columbia University","Yale University","University of Pennsylvania","Cornell University","Johns Hopkins University","Duke University","Northwestern University","University of California Berkeley","University of California Los Angeles","Carnegie Mellon University","New York University","University of Michigan","University of Texas at Austin","University of Washington","Purdue University","Boston University"] },
        { name: "New Zealand", universities: ["University of Auckland","University of Otago","Victoria University of Wellington","University of Canterbury","Massey University","Lincoln University","Auckland University of Technology","Waikato University"] },
        { name: "Germany", universities: ["Technical University of Munich","Ludwig Maximilian University of Munich","Heidelberg University","Humboldt University of Berlin","Free University of Berlin","RWTH Aachen University","University of Hamburg","Goethe University Frankfurt","University of Stuttgart","University of Göttingen","University of Cologne","University of Bonn","Karlsruhe Institute of Technology"] },
        { name: "France", universities: ["Sorbonne University","École Polytechnique","Sciences Po","HEC Paris","INSEAD","University of Paris","École Normale Supérieure","Grenoble INP","University of Bordeaux","University of Lyon","University of Strasbourg","University of Montpellier"] },
        { name: "Japan", universities: ["University of Tokyo","Kyoto University","Osaka University","Tohoku University","Nagoya University","Tokyo Institute of Technology","Waseda University","Keio University","Hokkaido University","Kyushu University","Kobe University","Hiroshima University"] },
        { name: "South Korea", universities: ["Seoul National University","Korea Advanced Institute of Science & Technology","Yonsei University","Korea University","Sungkyunkwan University","Hanyang University","Sogang University","Ewha Womans University","Pohang University of Science and Technology","Ulsan National Institute of Science and Technology"] },
        { name: "Netherlands", universities: ["University of Amsterdam","Delft University of Technology","Leiden University","Utrecht University","Erasmus University Rotterdam","University of Groningen","Eindhoven University of Technology","Maastricht University","Tilburg University","Wageningen University"] },
        { name: "Sweden", universities: ["Karolinska Institute","Royal Institute of Technology","Lund University","Uppsala University","Stockholm University","Chalmers University of Technology","University of Gothenburg","Linköping University","Umeå University"] },
        { name: "Denmark", universities: ["University of Copenhagen","Technical University of Denmark","Aarhus University","Copenhagen Business School","Aalborg University","University of Southern Denmark"] },
        { name: "Finland", universities: ["University of Helsinki","Aalto University","University of Turku","University of Tampere","University of Oulu","University of Jyväskylä"] },
        { name: "Norway", universities: ["University of Oslo","Norwegian University of Science and Technology","University of Bergen","University of Tromsø","Norwegian School of Economics"] },
        { name: "Switzerland", universities: ["ETH Zurich","EPFL","University of Zurich","University of Geneva","University of Basel","University of Bern","University of Lausanne","University of St. Gallen"] },
        { name: "Austria", universities: ["University of Vienna","Vienna University of Technology","Graz University of Technology","University of Graz","Johannes Kepler University Linz","University of Innsbruck","Vienna University of Economics and Business"] },
        { name: "Ireland", universities: ["Trinity College Dublin","University College Dublin","University College Cork","National University of Ireland Galway","Dublin City University","University of Limerick","Maynooth University"] },
        { name: "Singapore", universities: ["National University of Singapore","Nanyang Technological University","Singapore Management University","Singapore University of Technology and Design","Singapore Institute of Technology"] },
        { name: "Malaysia", universities: ["University of Malaya","Universiti Putra Malaysia","Universiti Kebangsaan Malaysia","Universiti Teknologi Malaysia","Universiti Sains Malaysia","Taylor's University","Monash University Malaysia","Sunway University","INTI International University"] },
        { name: "Dubai (UAE)", universities: ["American University in Dubai","University of Dubai","Heriot-Watt University Dubai","Middlesex University Dubai","University of Birmingham Dubai","Rochester Institute of Technology Dubai","Murdoch University Dubai","Canadian University Dubai"] },
        { name: "Cyprus", universities: ["University of Cyprus","Cyprus International University","European University Cyprus","Frederick University","University of Nicosia"] },
        { name: "Malta", universities: ["University of Malta","Malta College of Arts, Science and Technology"] },
        { name: "Hungary", universities: ["Budapest University of Technology and Economics","Eötvös Loránd University","University of Debrecen","University of Pécs","Corvinus University of Budapest","Semmelweis University"] },
        { name: "Poland", universities: ["University of Warsaw","Jagiellonian University","Warsaw University of Technology","AGH University of Science and Technology","Adam Mickiewicz University","Wrocław University of Technology"] },
        { name: "Czech Republic", universities: ["Charles University","Czech Technical University in Prague","Brno University of Technology","Masaryk University","University of Economics Prague","Palacký University Olomouc"] },
      ],
    },
    services: {
      type: [String],
      default: [
        "Study Abroad", "Language Courses", "University Application",
        "Visa Assistance", "Test Preparation (IELTS/TOEFL)", "Scholarship Guidance",
        "Career Counselling", "Document Verification",
      ],
    },
    courses: {
      type: [String],
      default: [
        "Bachelor of IT",
        "Bachelor of Nursing",
        "Bachelor of Business",
        "Master of IT",
        "Bachelor of Community Services",
        "Master of Business Analyst",
        "Master of Business Administration",
      ],
    },
    educationLevels: {
      type: [String],
      default: ["Diploma", "Bachelor", "Master"],
    },
    // All modules enabled by default
    enabledModules: {
      type: [String],
      default: [
        "leads", "students", "documents", "applications", "admissions", "visa", "analytics",
        "branches", "users", "activity_logs", "settings", "commission",
      ],
    },
    commissionPercentByCountry: { type: Schema.Types.Mixed, default: () => ({}) },
    // SMTP
    smtpHost:      { type: String, default: "" },
    smtpPort:      { type: Number, default: 587 },
    smtpUser:      { type: String, default: "" },
    smtpPass:      { type: String, default: "" },
    emailFromName: { type: String, default: "" },
    // Payment QR
    paymentQrPath: { type: String, default: "" },
    applicationRoles: {
      type: [
        {
          slug: { type: String, required: true },
          label: { type: String, required: true },
          defaultPermissions: { type: [String], default: [] },
        },
      ],
      default: () => DEFAULT_APPLICATION_ROLES.map((r) => ({ ...r, defaultPermissions: [...r.defaultPermissions] })),
    },
    telecallerTransferOutcomes: {
      type: [
        {
          id: { type: String, required: true },
          label: { type: String, required: true },
          effect: { type: String, required: true },
          fdStatus: { type: String },
          standing: { type: String },
          requiresCounsellor: { type: Boolean, default: false },
          requiresAppointmentDate: { type: Boolean, default: false },
        },
      ],
      default: () => DEFAULT_TELECALLER_TRANSFER_OUTCOMES.map((o) => ({ ...o })),
    },
  },
  { timestamps: true }
);

const AppSettings: Model<IAppSettings> =
  mongoose.models.AppSettings ||
  mongoose.model<IAppSettings>("AppSettings", AppSettingsSchema);

export default AppSettings;
