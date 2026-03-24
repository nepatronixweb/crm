import mongoose, { Document, Schema } from "mongoose";

export type NotificationType = "lead_assigned" | "lead_updated" | "general";

export interface INotificationDocument extends Document {
  recipient: mongoose.Types.ObjectId;   // who sees this notification
  type: NotificationType;
  title: string;
  message: string;
  link?: string;                         // e.g. /leads/:id
  read: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotificationDocument>(
  {
    recipient: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["lead_assigned", "lead_updated", "general"],
      default: "general",
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    link: { type: String },
    read: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Compound index for per-recipient queries (read status + sorted)
NotificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
// Partial index for SSE new-notification polling (no read filter)
NotificationSchema.index({ recipient: 1, createdAt: -1 });

export default mongoose.models.Notification ||
  mongoose.model<INotificationDocument>("Notification", NotificationSchema);
