/**
 * Cron: Weekly Follow-up Reminders
 * GET /api/cron/reminders
 *
 * Invoke this route via a scheduled job (node-cron, Vercel Cron, etc.)
 * or manually to process leads that haven't had activity in 7 days.
 *
 * Logic:
 * - Find active leads not updated in 7 days with remindersCount < 2
 * - Increment remindersCount + set lastReminderAt
 * - If remindersCount reaches 2 → mark status as out_of_contact
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Lead from "@/models/Lead";
import ActivityLog from "@/models/ActivityLog";

export async function GET(req: NextRequest) {
  // Validate secret via Authorization header (never expose secrets in URLs)
  const authHeader = req.headers.get("authorization");
  const secret = authHeader?.replace("Bearer ", "").trim();
  if (secret !== process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Find leads that:
  // 1. Are still active (not out_of_contact)
  // 2. Have NOT been updated in 7 days
  // 3. Have fewer than 2 reminders
  const staleLeads = await Lead.find({
    status: { $in: ["heated", "warm", "hot"] },
    updatedAt: { $lt: sevenDaysAgo },
    remindersCount: { $lt: 2 },
    convertedToStudent: false,
  }).populate("assignedTo", "name email");

  let processed = 0;
  let markedOOC = 0;

  for (const lead of staleLeads) {
    const newCount = (lead.remindersCount || 0) + 1;

    if (newCount >= 2) {
      // 2nd reminder → mark out of contact
      lead.status = "out_of_contact";
      lead.remindersCount = newCount;
      lead.lastReminderAt = new Date();
      markedOOC++;

      await ActivityLog.create({
        userName: "System",
        userRole: "system",
        action: "auto_ooc",
        module: "leads",
        targetId: lead._id,
        targetName: lead.name,
        details: "Automatically marked as out of contact after 2 follow-up reminders",
      });
    } else {
      // 1st reminder
      lead.remindersCount = newCount;
      lead.lastReminderAt = new Date();

      await ActivityLog.create({
        userName: "System",
        userRole: "system",
        action: "reminder_sent",
        module: "leads",
        targetId: lead._id,
        targetName: lead.name,
        details: `Follow-up reminder #${newCount} triggered — no activity for 7+ days`,
      });
    }

    await lead.save();
    processed++;
  }

  return NextResponse.json({
    success: true,
    processed,
    markedOutOfContact: markedOOC,
    timestamp: new Date().toISOString(),
  });
}
