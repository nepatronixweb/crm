import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import AppSettings from "@/models/AppSettings";
import { DEFAULT_APPLICATION_ROLES, normalizeApplicationRoles } from "@/lib/applicationRoles";
import { DEFAULT_TELECALLER_TRANSFER_OUTCOMES, normalizeTelecallerTransferOutcomes } from "@/lib/telecallerTransferConfig";

// GET — public (used by layout for branding)
export async function GET() {
  try {
    await connectDB();
    let settings = await AppSettings.findOne();
    if (!settings) {
      settings = await AppSettings.create({});
    }

    const DEFAULT_REMARK_OPTIONS = [
      "Additional Documents Requested", "Additional Documents Sent",
      "Interview – GS/Cr./Visa", "Interview Cleared", "Payment Made",
      "Medical Requested/Booked", "Passport Submitted",
      "DS-160/VFS/Embassy Appointment", "Pink Slip", "NOC",
      "Defer Offer Requested", "Defer CoE Requested",
      "Refund Requested", "Offer Withdrawn", "Done",
    ];

    const DEFAULT_COURSES = [
      "Bachelor of IT",
      "Bachelor of Nursing",
      "Bachelor of Business",
      "Master of IT",
      "Bachelor of Community Services",
      "Master of Business Analyst",
      "Master of Business Administration",
    ];

    // Backfill remarkOptions for documents created before the field existed
    if (!settings.remarkOptions?.length) {
      settings.remarkOptions = DEFAULT_REMARK_OPTIONS;
      await settings.save();
    }

    // Backfill courses if missing
    if (!settings.courses?.length) {
      settings.courses = DEFAULT_COURSES;
      await settings.save();
    }

    // Backfill educationLevels if missing
    if (!settings.educationLevels?.length) {
      settings.educationLevels = ["Diploma", "Bachelor", "Master"];
      await settings.save();
    }

    // Backfill countryStages if missing — the schema default only applies on document creation
    if (!settings.countryStages || Object.keys(settings.countryStages).length === 0) {
      settings.countryStages = {
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
      };
      settings.markModified("countryStages");
      await settings.save();
    }

    // Use lean() for the JSON response to bypass Mongoose schema projection.
    // This ensures fields added after the model was first compiled (e.g. after a
    // hot-reload) are always included — toObject() only returns schema-known fields.
    const json = (await AppSettings.findOne({}).lean()) ?? settings.toObject();

    // Safety fallbacks in case the DB document is somehow missing a field
    if (!Array.isArray(json.remarkOptions) || json.remarkOptions.length === 0) {
      json.remarkOptions = DEFAULT_REMARK_OPTIONS;
    }
    if (!Array.isArray(json.courses) || json.courses.length === 0) {
      json.courses = DEFAULT_COURSES;
    }
    if (!Array.isArray(json.educationLevels) || json.educationLevels.length === 0) {
      json.educationLevels = ["Diploma", "Bachelor", "Master"];
    }
    if (!json.countryStages || typeof json.countryStages !== "object") {
      json.countryStages = {};
    }

    if (!Array.isArray(json.applicationRoles) || json.applicationRoles.length === 0) {
      settings.applicationRoles = DEFAULT_APPLICATION_ROLES.map((r) => ({
        slug: r.slug,
        label: r.label,
        defaultPermissions: [...r.defaultPermissions],
      }));
      await settings.save();
      json.applicationRoles = settings.applicationRoles;
    }
    if (!Array.isArray(json.telecallerTransferOutcomes) || json.telecallerTransferOutcomes.length === 0) {
      settings.telecallerTransferOutcomes = DEFAULT_TELECALLER_TRANSFER_OUTCOMES.map((o) => ({ ...o }));
      await settings.save();
      json.telecallerTransferOutcomes = settings.telecallerTransferOutcomes;
    }
    json.applicationRoles = normalizeApplicationRoles(json.applicationRoles);
    json.telecallerTransferOutcomes = normalizeTelecallerTransferOutcomes(json.telecallerTransferOutcomes);

    if (!json.commissionPercentByCountry || typeof json.commissionPercentByCountry !== "object") {
      settings.commissionPercentByCountry = {};
      await settings.save();
      json.commissionPercentByCountry = settings.commissionPercentByCountry ?? {};
    }
    const mods = Array.isArray(json.enabledModules) ? [...json.enabledModules] : [];
    if (!mods.includes("commission")) {
      mods.push("commission");
      settings.enabledModules = mods;
      await settings.save();
      json.enabledModules = mods;
    }

    return NextResponse.json(json);
  } catch (err) {
    console.error("GET /api/settings/app error:", err);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const canEdit = session.user.role === "super_admin" || (session.user.permissions ?? []).includes("settings");
    if (!canEdit) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();

    // Build a $set payload only from defined fields to avoid overwriting anything unintentionally
    // Using findOneAndUpdate with $set bypasses Mongoose array-mutation tracking issues
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const $set: Record<string, any> = {};
    const fields = [
      "companyName", "shortCode", "tagline", "logoPath", "faviconPath", "brandColor",
      "address", "phone", "email", "website",
      "leadStatuses", "leadSources", "leadStandings", "fdStatuses",
      "leadStageGroups", "leadStages",
      "b2bNames", "remarkOptions",
      "countries", "services", "courses", "educationLevels",
      "enabledModules",
      "commissionPercentByCountry",
      "smtpHost", "smtpPort", "smtpUser", "smtpPass", "emailFromName",
      "paymentQrPath",
      "countryStages",
      "applicationRoles",
      "telecallerTransferOutcomes",
    ];
    for (const field of fields) {
      if (body[field] !== undefined) {
        $set[field] = body[field];
      }
    }

    await connectDB();

    const updated = await AppSettings.findOneAndUpdate(
      {},
      { $set },
      { new: true, upsert: true, runValidators: false }
    ).lean();

    return NextResponse.json(updated);
  } catch (err) {
    console.error("PUT /api/settings/app error:", err);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
