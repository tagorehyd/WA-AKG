import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import { validateAutoReplyAction } from "@/modules/whatsapp/store/autoreply-actions";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ sessionId: string; replyId: string }> }) {
    try {
        const { sessionId, replyId } = await params;
        const user = await getAuthenticatedUser(request);
        if (!user) return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        if (!await canAccessSession(user.id, user.role, sessionId)) return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session", error: "Forbidden" }, { status: 403 });

        const rule = await prisma.autoReply.findUnique({ where: { id: replyId }, include: { session: true } });
        if (!rule || rule.session.sessionId !== sessionId) return NextResponse.json({ status: false, message: "Rule not found in this session", error: "Not found" }, { status: 404 });

        const body = await request.json();
        const { keyword, response, matchType, triggerType, isMedia, mediaUrl, mediaType, actionType, actionConfig, actionTimeoutMs } = body;
        const action = validateAutoReplyAction(actionType, actionConfig);
        if (!keyword || (!response && !mediaUrl && action.actionType === "REPLY")) return NextResponse.json({ status: false, message: "Keyword and a reply, media, or action are required", error: "Missing required fields" }, { status: 400 });

        const updated = await prisma.autoReply.update({
            where: { id: replyId },
            data: { keyword, response: response || null, matchType: matchType || "EXACT", triggerType: triggerType || "ALL", isMedia: Boolean(isMedia || mediaUrl), mediaUrl: mediaUrl || null, mediaType: mediaType || null, actionType: action.actionType, actionConfig: action.actionConfig === null ? Prisma.JsonNull : action.actionConfig as Prisma.InputJsonValue, actionTimeoutMs: Math.min(Math.max(Number(actionTimeoutMs) || 10000, 1000), 30000) }
        });
        return NextResponse.json({ status: true, message: "Auto-reply updated successfully", data: updated });
    } catch (error: any) {
        console.error("Update auto reply error:", error);
        return NextResponse.json({ status: false, message: error.message || "Internal Server Error", error: error.message || "Internal Server Error" }, { status: 400 });
    }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ sessionId: string; replyId: string }> }) {
    try {
        const { sessionId, replyId } = await params;
        const user = await getAuthenticatedUser(request);
        if (!user) return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        if (!await canAccessSession(user.id, user.role, sessionId)) return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session", error: "Forbidden" }, { status: 403 });
        const rule = await prisma.autoReply.findUnique({ where: { id: replyId }, include: { session: true } });
        if (!rule || rule.session.sessionId !== sessionId) return NextResponse.json({ status: false, message: "Rule not found in this session", error: "Not found" }, { status: 404 });
        await prisma.autoReply.delete({ where: { id: replyId } });
        return NextResponse.json({ status: true, message: "Operation successful" });
    } catch (error) {
        console.error("Delete auto reply error:", error);
        return NextResponse.json({ status: false, message: "Internal Server Error", error: "Internal Server Error" }, { status: 500 });
    }
}
