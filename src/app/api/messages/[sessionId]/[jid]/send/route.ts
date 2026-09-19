import { NextResponse, NextRequest } from "next/server";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import { ChatService } from "@/modules/whatsapp/chat.service";
import { formatSentMessageResponse } from "@/lib/message-response";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string, jid: string }> }
) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const { sessionId, jid: rawJid } = await params;
        const jid = decodeURIComponent(rawJid);
        
        const body = await request.json();
        const { message, mentions, quotedMessageId } = body;
        const messagePayload = typeof message === "string" ? { text: message } : message;

        if (!messagePayload || typeof messagePayload !== "object" || Array.isArray(messagePayload)) {
            return NextResponse.json({ status: false, message: "message must be text or a WhatsApp message object", error: "Invalid message" }, { status: 400 });
        }

        // Check if user can access this session
        const canAccess = await canAccessSession(user.id, user.role, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session", error: "Forbidden - Cannot access this session" }, { status: 403 });
        }

        // Send Message using ChatService
        const result = await ChatService.sendTextMessage(sessionId, jid, messagePayload, mentions, quotedMessageId);

        return NextResponse.json({ status: true, message: "Message sent successfully", data: formatSentMessageResponse(result, { ...messagePayload, mentions, quotedMessageId }) });
    } catch (error: any) {
        console.error("Send message error:", error);
        const errorMsg = error?.message || "Failed to send message";
        return NextResponse.json({ status: false, message: errorMsg, error: errorMsg }, { status: 500 });
    }
}
