import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function formatSize(bytes: number) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

export function formatTime(ts: number) {
    if (!ts) return '';
    // 自动识别秒还是毫秒
    const date = new Date(ts < 10000000000 ? ts * 1000 : ts);
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const hh = date.getHours();
    const mm = date.getMinutes();
    return `${date.getFullYear()}/${m < 10 ? '0' : ''}${m}/${d < 10 ? '0' : ''}${d} ${hh < 10 ? '0' : ''}${hh}:${mm < 10 ? '0' : ''}${mm}`;
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const HTTP_STATUS_MESSAGE: Record<number, string> = {
    400: '请求参数错误，请检查输入内容',
    401: '登录状态已失效，请重新登录',
    403: '没有访问权限，请检查账号状态',
    404: '链接无效或资源不存在，请检查分享链接是否正确或已失效',
    408: '请求超时，请稍后重试',
    429: '请求过于频繁，请稍后再试',
    500: '服务器内部错误，请稍后重试',
    502: '服务暂时不可用，请稍后重试',
    503: '服务维护中，请稍后重试',
    504: '网关超时，请稍后重试',
};

const resolveStatusMessage = (status: number) => {
    return HTTP_STATUS_MESSAGE[status] || `请求失败（HTTP ${status}）`;
};

const pickMessageFromResponseData = (data: unknown) => {
    if (!data) return '';

    if (typeof data === 'string') {
        const text = data.trim();
        if (!text || text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
            return '';
        }
        return text;
    }

    if (typeof data === 'object') {
        const obj = data as Record<string, unknown>;
        const maybeMessage = [obj.message, obj.error, obj.msg, obj.detail]
            .find((item) => typeof item === 'string' && item.trim());
        return typeof maybeMessage === 'string' ? maybeMessage.trim() : '';
    }

    return '';
};

export function getErrorMessage(error: unknown) {
    if (error && typeof error === 'object') {
        const maybeError = error as {
            message?: string;
            response?: {
                status?: number;
                data?: unknown;
            };
        };

        const status = maybeError.response?.status;
        if (typeof status === 'number') {
            const statusMessage = resolveStatusMessage(status);

            if (status === 404) {
                return statusMessage;
            }
            const detail = pickMessageFromResponseData(maybeError.response?.data);
            return detail ? `${statusMessage}（${detail}）` : statusMessage;
        }

        const rawMessage = maybeError.message?.trim() || '';
        if (rawMessage) {
            const statusMatch = rawMessage.match(/status code\s*(\d{3})/i);
            if (statusMatch) {
                return resolveStatusMessage(Number(statusMatch[1]));
            }

            if (/network error/i.test(rawMessage)) {
                return '网络连接失败，请检查网络或确认后端服务已启动';
            }

            if (/timeout/i.test(rawMessage)) {
                return '请求超时，请稍后重试';
            }
        }
    }

    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}
