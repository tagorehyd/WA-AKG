type SentMessageResult = {
    key?: {
        remoteJid?: string | null;
        fromMe?: boolean | null;
        id?: string | null;
        [key: string]: unknown;
    };
    message?: Record<string, unknown>;
    messageTimestamp?: string | number | null;
};

type MessagePayload = Record<string, unknown>;

/**
 * Keep the public send API stable even when Baileys internally uses an
 * extendedTextMessage to carry optional context information.
 */
export function formatSentMessageResponse(result: SentMessageResult, payload: MessagePayload) {
    const isPlainText = typeof payload.text === "string"
        && !payload.image
        && !payload.video
        && !payload.document
        && !payload.audio
        && !payload.sticker
        && !payload.mentions
        && !payload.quotedMessageId;

    return {
        key: result.key || {},
        message: isPlainText
            ? { conversation: payload.text }
            : (result.message || {}),
        messageTimestamp: result.messageTimestamp == null
            ? undefined
            : String(result.messageTimestamp),
    };
}
