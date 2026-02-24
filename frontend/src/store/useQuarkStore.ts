import { create } from 'zustand';
import type { ShareFileNode } from '../types/quark';

export interface LogEntry {
    message: string;
    type: 'info' | 'success' | 'error' | 'warn';
    timestamp: number;
}

interface ShareParseState {
    pwdId: string;
    stoken: string;
    files: ShareFileNode[];
    allFiles: ShareFileNode[];
    status: string;
    statusType: 'info' | 'success' | 'error' | 'warn';
    shareUrl: string;
}

export interface DownloadInfo {
    filename: string;
    downloaded: number;
    total: number;
    speed: number;
    status: 'downloading' | 'merging' | 'done';
}

interface QuarkState {
    cookie: string;
    toast: {
        isLoggingOut?: boolean;
        id: number;
        message: string;
        type: 'info' | 'success' | 'error' | 'warn' | '';
    };
    isLoggedIn: boolean;
    capacity: {
        used: number;
        total: number;
        loading: boolean;
    };
    shareInfo: ShareParseState;
    logs: LogEntry[];
    downloading: boolean;
    progress: {
        done: number;
        total: number;
        text: string;
    };
    selectedFids: Set<string>;
    downloadConcurrency: number;
    downloadThreads: number;
    activeDownloads: Map<string, DownloadInfo>;

    setCookie: (cookie: string) => void;
    setCapacity: (used: number, total: number) => void;
    setCapacityLoading: (loading: boolean) => void;
    setShareInfo: (info: Partial<ShareParseState>) => void;
    addLog: (message: string, type?: LogEntry['type']) => void;
    clearLogs: () => void;
    setDownloadConcurrency: (value: number) => void;
    setDownloadThreads: (value: number) => void;
    setLoggingOut: (isLoggingOut: boolean) => void;
    notify: (message: string, type: 'info' | 'success' | 'error' | 'warn', durationMs?: number) => void;
    toggleFileSelection: (fid: string) => void;
    selectAllFiles: (fids: string[]) => void;
    clearSelection: () => void;
    setDownloading: (downloading: boolean) => void;
    setProgress: (done: number, total: number, text: string) => void;
    updateDownload: (id: string, info: Partial<DownloadInfo> & { filename: string }) => void;
    removeDownload: (id: string) => void;
    clearAllDownloads: () => void;
    resetShareInfo: () => void;
    setShareUrl: (url: string) => void;
}

export const useQuarkStore = create<QuarkState>((set) => ({
    toast: {
        id: 0,
        message: '',
        type: '',
    },
    cookie: localStorage.getItem('quark_cookie') || '',
    isLoggedIn: !!localStorage.getItem('quark_cookie'),
    capacity: {
        used: 0,
        total: 0,
        loading: false,
    },
    shareInfo: {
        pwdId: '',
        stoken: '',
        files: [],
        allFiles: [],
        status: '',
        statusType: 'info',
        shareUrl: '',
    },
    logs: [],
    downloading: false,
    progress: {
        done: 0,
        total: 0,
        text: '',
    },
    selectedFids: new Set<string>(),
    downloadConcurrency: Number(localStorage.getItem('download_concurrency')) || 5,
    downloadThreads: Number(localStorage.getItem('download_threads')) || 999,
    activeDownloads: new Map<string, DownloadInfo>(),

    setCookie: (cookie: string) => {
        localStorage.setItem('quark_cookie', cookie);
        set({ cookie, isLoggedIn: !!cookie });
    },
    setCapacity: (used: number, total: number) => set({ capacity: { used, total, loading: false } }),
    setCapacityLoading: (loading: boolean) => set((state: QuarkState) => ({ capacity: { ...state.capacity, loading } })),
    setShareInfo: (info: Partial<ShareParseState>) => {
        if (info.files) {
            const flatten = (nodes: ShareFileNode[]): ShareFileNode[] => {
                const res: ShareFileNode[] = [];
                for (const n of nodes) {
                    if (!n.isDir) res.push(n);
                    if (n.children) res.push(...flatten(n.children));
                }
                return res;
            };
            info.allFiles = flatten(info.files);
        }

        set((state: QuarkState) => ({ shareInfo: { ...state.shareInfo, ...info } }));
    },
    addLog: (message: string, type: LogEntry['type'] = 'info') => {
        const newLog: LogEntry = {
            message,
            type,
            timestamp: Date.now(),
        };
        set((state: QuarkState) => ({ logs: [newLog, ...state.logs] }));
    },
    clearLogs: () => set({ logs: [] }),
    setDownloadConcurrency: (value: number) => {
        const normalized = Math.max(1, Math.min(10, value));
        localStorage.setItem('download_concurrency', normalized.toString());

        set({ downloadConcurrency: normalized });
    },
    setDownloadThreads: (value: number) => {
        const normalized = Math.max(1, Math.min(999, value));
        localStorage.setItem('download_threads', normalized.toString());

        set({ downloadThreads: normalized });
    },
    notify: (message: string, type: 'info' | 'success' | 'error' | 'warn', durationMs?: number) => {
        const toastId = Date.now() + Math.random();
        const timeout = durationMs ?? 3000;
        set((state: QuarkState) => ({ toast: { ...state.toast, id: toastId, message, type } }));

        set({ toast: { id: toastId, message, type } });

        setTimeout(() => {
            set((state: QuarkState) => (
                state.toast.id === toastId ? { toast: { id: 0, message: '', type: '' } } : {}
            ));
        }, timeout);
    },
    setLoggingOut: (isLoggingOut: boolean) => set((state: QuarkState) => ({ toast: { ...state.toast, isLoggingOut } })),
    toggleFileSelection: (fid: string) => set((state: QuarkState) => {
        const newSet = new Set(state.selectedFids);
        if (newSet.has(fid)) newSet.delete(fid);
        else newSet.add(fid);
        return { selectedFids: newSet };
    }),
    selectAllFiles: (fids: string[]) => set({ selectedFids: new Set(fids) }),
    clearSelection: () => set({ selectedFids: new Set<string>() }),
    setDownloading: (downloading: boolean) => set({ downloading }),
    setProgress: (done: number, total: number, text: string) => set({ progress: { done, total, text } }),
    updateDownload: (id: string, info: Partial<DownloadInfo> & { filename: string }) => set((state: QuarkState) => {
        const next = new Map(state.activeDownloads);
        const existing = next.get(id);
        next.set(id, {
            filename: info.filename,
            downloaded: info.downloaded ?? existing?.downloaded ?? 0,
            total: info.total ?? existing?.total ?? 0,
            speed: info.speed ?? existing?.speed ?? 0,
            status: (info.status as DownloadInfo['status']) ?? existing?.status ?? 'downloading',
        });
        return { activeDownloads: next };
    }),
    removeDownload: (id: string) => set((state: QuarkState) => {
        const next = new Map(state.activeDownloads);
        next.delete(id);
        return { activeDownloads: next };
    }),
    clearAllDownloads: () => set({ activeDownloads: new Map<string, DownloadInfo>() }),
    resetShareInfo: () => set((state: QuarkState) => ({
        shareInfo: {
            pwdId: '',
            stoken: '',
            files: [],
            allFiles: [],
            status: '',
            statusType: 'info',
            shareUrl: state.shareInfo.shareUrl,
        },
        selectedFids: new Set<string>(),
        logs: [],
    })),
    setShareUrl: (url: string) => set((state: QuarkState) => ({
        shareInfo: { ...state.shareInfo, shareUrl: url }
    })),
}));