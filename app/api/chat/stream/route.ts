import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import Message from "@/models/Message";
import Conversation from "@/models/Conversation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const userId = session.user.id;
  const encoder = new TextEncoder();
  let lastCheck = new Date();

  const stream = new ReadableStream({
    async start(controller) {
      await connectDB();

      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch { /* client disconnected */ }
      };

      // Cache conversation IDs — refreshed every 60s to pick up new convs
      let convIds: unknown[] = [];
      let lastConvRefresh = 0;

      const refreshConvIds = async () => {
        const convs = await Conversation.find({ participants: userId }).select("_id").lean();
        convIds = convs.map((c) => c._id);
        lastConvRefresh = Date.now();
      };

      // Initial: load convIds + unread count
      try {
        await refreshConvIds();
        const unread = await Message.countDocuments({
          conversation: { $in: convIds },
          sender: { $ne: userId },
          readBy: { $ne: userId },
        });
        send({ type: "chat_init", unreadCount: unread });
      } catch {
        send({ type: "chat_init", unreadCount: 0 });
      }

      // Poll every 8 seconds — reuse cached convIds (refresh every 60s)
      const interval = setInterval(async () => {
        try {
          if (Date.now() - lastConvRefresh > 60_000) await refreshConvIds();

          const since = lastCheck;
          lastCheck = new Date();

          const [newMessages, unread] = await Promise.all([
            Message.find({
              conversation: { $in: convIds },
              sender: { $ne: userId },
              createdAt: { $gt: since },
            })
              .populate("sender", "name email role")
              .sort({ createdAt: -1 })
              .limit(10)
              .lean(),
            Message.countDocuments({
              conversation: { $in: convIds },
              sender: { $ne: userId },
              readBy: { $ne: userId },
            }),
          ]);

          if (newMessages.length > 0) {
            send({ type: "chat_new", messages: newMessages, unreadCount: unread });
          } else {
            send({ type: "chat_heartbeat", unreadCount: unread });
          }
        } catch {
          send({ type: "chat_heartbeat", unreadCount: 0 });
        }
      }, 8000);

      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
