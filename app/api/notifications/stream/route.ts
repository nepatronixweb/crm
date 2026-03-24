import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import Notification from "@/models/Notification";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const userId = session.user.id;
  const encoder = new TextEncoder();

  // Track the timestamp of the last check so we only send genuinely new items
  let lastCheck = new Date();

  const stream = new ReadableStream({
    async start(controller) {
      await connectDB();

      const send = (payload: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
          );
        } catch {
          // client disconnected
        }
      };

      // Send initial state with a single aggregation (recent + unread count)
      try {
        const [result] = await Notification.aggregate([
          { $match: { recipient: new (await import("mongoose")).default.Types.ObjectId(userId) } },
          {
            $facet: {
              recent: [{ $sort: { createdAt: -1 } }, { $limit: 15 }],
              unreadCount: [{ $match: { read: false } }, { $count: "n" }],
            },
          },
        ]);
        const unreadCount: number = result?.unreadCount?.[0]?.n ?? 0;
        const notifications = result?.recent ?? [];
        send({ type: "init", unreadCount, notifications });
      } catch {
        send({ type: "init", unreadCount: 0, notifications: [] });
      }

      // Poll every 10 seconds — single aggregation per tick
      const interval = setInterval(async () => {
        try {
          const since = lastCheck;
          lastCheck = new Date();

          const [result] = await Notification.aggregate([
            { $match: { recipient: new (await import("mongoose")).default.Types.ObjectId(userId) } },
            {
              $facet: {
                newNotifs: [
                  { $match: { createdAt: { $gt: since } } },
                  { $sort: { createdAt: -1 } },
                ],
                unreadCount: [{ $match: { read: false } }, { $count: "n" }],
              },
            },
          ]);

          const newNotifs = result?.newNotifs ?? [];
          const unreadCount: number = result?.unreadCount?.[0]?.n ?? 0;

          if (newNotifs.length > 0) {
            send({ type: "new", notifications: newNotifs, unreadCount });
          } else {
            send({ type: "heartbeat", unreadCount });
          }
        } catch {
          send({ type: "heartbeat", unreadCount: 0 });
        }
      }, 10000);

      // Cleanup when client disconnects
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
      "X-Accel-Buffering": "no", // disable nginx buffering
    },
  });
}
