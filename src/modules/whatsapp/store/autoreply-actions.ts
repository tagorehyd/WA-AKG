import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_LENGTH = 4_000;
const DEFAULT_TIMEOUT_MS = 10_000;

export type AutoReplyActionType = "REPLY" | "HTTP" | "COMMAND" | "PYTHON";
export type AutoReplyActionConfig = {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    command?: string;
    args?: string[];
    code?: string;
};

export type AutoReplyActionContext = {
    sessionId: string;
    message: string;
    senderJid: string;
    chatJid: string;
    matchedKeyword: string;
};

const executionEnabled = () => process.env.AUTOREPLY_EXECUTION_ENABLED === "true";
const allowList = (name: string) => new Set((process.env[name] || "").split(",").map(value => value.trim()).filter(Boolean));

function truncate(value: string): string {
    return value.trim().slice(0, MAX_OUTPUT_LENGTH);
}

function renderTemplate(template: string, context: Record<string, string>): string {
    return template.replace(/{{\s*(\w+)\s*}}/g, (_, key) => context[key] ?? "");
}

export function validateAutoReplyAction(actionType: unknown, actionConfig: unknown): { actionType: AutoReplyActionType; actionConfig: AutoReplyActionConfig | null } {
    const type = actionType || "REPLY";
    if (type !== "REPLY" && type !== "HTTP" && type !== "COMMAND" && type !== "PYTHON") {
        throw new Error("actionType must be REPLY, HTTP, COMMAND, or PYTHON");
    }
    if (type === "REPLY") return { actionType: type, actionConfig: null };
    if (!actionConfig || typeof actionConfig !== "object" || Array.isArray(actionConfig)) {
        throw new Error("actionConfig is required for dynamic auto-reply actions");
    }

    const config = actionConfig as AutoReplyActionConfig;
    if (type === "HTTP") {
        if (!config.url || !/^https?:\/\//i.test(config.url)) throw new Error("HTTP actions require an http(s) URL");
    } else if (type === "COMMAND") {
        if (!config.command || /[\s/\\]/.test(config.command) || (config.args && (!Array.isArray(config.args) || config.args.some(arg => typeof arg !== "string")))) {
            throw new Error("COMMAND actions require a command name and optional string args");
        }
    } else if (!config.code || typeof config.code !== "string") {
        throw new Error("PYTHON actions require code");
    }
    return { actionType: type, actionConfig: config };
}

export async function executeAutoReplyAction(
    actionType: string | null | undefined,
    actionConfig: unknown,
    context: AutoReplyActionContext,
    timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<string | null> {
    const { actionType: type, actionConfig: config } = validateAutoReplyAction(actionType, actionConfig);
    if (type === "REPLY") return null;
    if (!executionEnabled()) throw new Error("Dynamic auto-reply execution is disabled by the server administrator");

    const safeTimeout = Math.min(Math.max(Number(timeoutMs) || DEFAULT_TIMEOUT_MS, 1_000), 30_000);
    const templates = { ...context, matchedKeyword: context.matchedKeyword };

    if (type === "HTTP") {
        const url = new URL(renderTemplate(config!.url!, templates));
        const allowedHosts = allowList("AUTOREPLY_HTTP_ALLOWLIST");
        if (!allowedHosts.has(url.hostname)) throw new Error("HTTP action host is not in AUTOREPLY_HTTP_ALLOWLIST");
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), safeTimeout);
        try {
            const response = await fetch(url, {
                method: (config!.method || "GET").toUpperCase(),
                headers: { "content-type": "application/json", ...config!.headers },
                body: config!.body ? renderTemplate(config!.body, templates) : undefined,
                signal: controller.signal,
            });
            const body = await response.text();
            if (!response.ok) throw new Error(`HTTP action failed with ${response.status}: ${truncate(body)}`);
            return truncate(body);
        } finally {
            clearTimeout(timer);
        }
    }

    if (type === "COMMAND") {
        const allowedCommands = allowList("AUTOREPLY_COMMAND_ALLOWLIST");
        if (!allowedCommands.has(config!.command!)) throw new Error("Command is not in AUTOREPLY_COMMAND_ALLOWLIST");
        const { stdout } = await execFileAsync(config!.command!, (config!.args || []).map(arg => renderTemplate(arg, templates)), {
            timeout: safeTimeout,
            maxBuffer: MAX_OUTPUT_LENGTH,
            env: { PATH: process.env.PATH, WA_AKG_AUTOREPLY_CONTEXT: JSON.stringify(context) },
        });
        return truncate(stdout);
    }

    const { stdout } = await execFileAsync("python3", ["-I", "-c", config!.code!], {
        timeout: safeTimeout,
        maxBuffer: MAX_OUTPUT_LENGTH,
        env: { PATH: process.env.PATH, WA_AKG_AUTOREPLY_CONTEXT: JSON.stringify(context) },
    });
    return truncate(stdout);
}

export function renderAutoReplyResponse(response: string | null, result: string | null): string {
    const template = response || "{{result}}";
    return renderTemplate(template, { result: result || "" });
}
