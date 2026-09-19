"use server";

import { prisma } from "@/lib/prisma";
import { canAccessSession } from "@/lib/api-auth";
import { getAuthenticatedUserForAction } from "@/lib/server-action-auth";
import { Prisma } from "@prisma/client";
import { validateAutoReplyAction } from "@/modules/whatsapp/store/autoreply-actions";

// Fetch rules directly from DB without API call
export async function getAutoReplies(sessionId: string) {
    const nextAuthSession = await getAuthenticatedUserForAction();
    if (!nextAuthSession) {
        throw new Error("Unauthorized");
    }

    const canAccess = await canAccessSession(nextAuthSession.id, nextAuthSession.role, sessionId);
    if (!canAccess) {
        throw new Error("Forbidden");
    }

    const session = await prisma.session.findUnique({
        where: { sessionId: sessionId },
        select: { id: true }
    });

    if (!session) {
        throw new Error("Session not found");
    }

    const rules = await prisma.autoReply.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: 'desc' }
    });

    return rules;
}

// Create a new auto reply directly to DB
export async function createAutoReply(sessionId: string, data: { keyword: string; response?: string; matchType: string; isMedia: boolean; mediaUrl?: string | null; mediaType?: string | null; triggerType: string; actionType?: string; actionConfig?: Record<string, unknown> | null; actionTimeoutMs?: number }) {
    const nextAuthSession = await getAuthenticatedUserForAction();
    if (!nextAuthSession) {
        throw new Error("Unauthorized");
    }

    const action = validateAutoReplyAction(data.actionType, data.actionConfig);
    if (!data.keyword || (!data.response && !data.mediaUrl && action.actionType === "REPLY")) {
        throw new Error("Keyword and a reply, media, or action are required");
    }

    const canAccess = await canAccessSession(nextAuthSession.id, nextAuthSession.role, sessionId);
    if (!canAccess) {
        throw new Error("Forbidden");
    }

    const session = await prisma.session.findUnique({
        where: { sessionId: sessionId },
        select: { id: true }
    });

    if (!session) {
        throw new Error("Session not found");
    }

    const createData: Prisma.AutoReplyUncheckedCreateInput = {
        sessionId: session.id,
        keyword: data.keyword,
        response: data.response || null,
        matchType: data.matchType || "EXACT",
        isMedia: !!data.mediaUrl,
        mediaUrl: data.mediaUrl || null,
        mediaType: data.mediaType || null,
        // @ts-ignore
        triggerType: data.triggerType || "ALL",
        actionType: action.actionType,
        actionConfig: action.actionConfig === null ? Prisma.JsonNull : action.actionConfig as Prisma.InputJsonValue,
        actionTimeoutMs: Math.min(Math.max(Number(data.actionTimeoutMs) || 10000, 1000), 30000)
    };

    const newRule = await prisma.autoReply.create({
        data: createData
    });

    return newRule;
}

export async function deleteAutoReply(sessionId: string, ruleId: string) {
    const nextAuthSession = await getAuthenticatedUserForAction();
    if (!nextAuthSession) {
        throw new Error("Unauthorized");
    }

    const rule = await prisma.autoReply.findUnique({
        where: { id: ruleId },
        include: { session: true }
    });

    if (!rule) {
        throw new Error("Rule not found");
    }

    const canAccess = await canAccessSession(nextAuthSession.id, nextAuthSession.role, rule.session.sessionId);
    if (!canAccess || rule.session.sessionId !== sessionId) {
        throw new Error("Forbidden");
    }

    await prisma.autoReply.delete({ where: { id: ruleId } });
    return { success: true };
}

export async function updateAutoReply(sessionId: string, ruleId: string, data: { keyword: string; response?: string; matchType: string; isMedia: boolean; mediaUrl?: string | null; mediaType?: string | null; triggerType: string; actionType?: string; actionConfig?: Record<string, unknown> | null; actionTimeoutMs?: number }) {
    const nextAuthSession = await getAuthenticatedUserForAction();
    if (!nextAuthSession) {
        throw new Error("Unauthorized");
    }

    const action = validateAutoReplyAction(data.actionType, data.actionConfig);
    if (!data.keyword || (!data.response && !data.mediaUrl && action.actionType === "REPLY")) {
        throw new Error("Keyword and a reply, media, or action are required");
    }

    const rule = await prisma.autoReply.findUnique({
        where: { id: ruleId },
        include: { session: true }
    });

    if (!rule) {
        throw new Error("Rule not found");
    }

    const canAccess = await canAccessSession(nextAuthSession.id, nextAuthSession.role, rule.session.sessionId);
    if (!canAccess || rule.session.sessionId !== sessionId) {
        throw new Error("Forbidden");
    }

    const updateData: Prisma.AutoReplyUncheckedUpdateInput = {
        keyword: data.keyword,
        response: data.response || null,
        matchType: data.matchType || "EXACT",
        isMedia: !!data.mediaUrl,
        mediaUrl: data.mediaUrl || null,
        mediaType: data.mediaType || null,
        // @ts-ignore
        triggerType: data.triggerType || "ALL",
        actionType: action.actionType,
        actionConfig: action.actionConfig === null ? Prisma.JsonNull : action.actionConfig as Prisma.InputJsonValue,
        actionTimeoutMs: Math.min(Math.max(Number(data.actionTimeoutMs) || 10000, 1000), 30000)
    };

    const updatedRule = await prisma.autoReply.update({
        where: { id: ruleId },
        data: updateData
    });

    return updatedRule;
}
