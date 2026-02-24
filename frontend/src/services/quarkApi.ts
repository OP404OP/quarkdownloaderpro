import type {
    CapacityData,
    DownloadUrlData,
    QrCookieData,
    QrQueryData,
    QrTokenData,
    QuarkResponse,
    RawFileItem,
    ShareFileNode,
    ShareTokenData,
    TaskResponse,
} from '../types/quark';
import http from './http';

interface ShareDetailData {
    list: RawFileItem[];
}

interface SaveFilesData {
    task_id: string;
}

interface LogoutData {
    ok: boolean;
    logged_out: boolean;
    message: string;
    logout_request_error?: string;
    verify_error?: string;
    verify?: { endpoint?: string; status_code?: number; code?: string | number; message?: string; nickname?: string };
}

export const quarkApi = {
    // 扫码登录
    getQrToken: async () => {
        const { data } = await http.get<QuarkResponse<QrTokenData>>('/qrlogin/token');
        return data;
    },

    queryQrStatus: async (token: string) => {
        const { data } = await http.get<QuarkResponse<QrQueryData>>(`/qrlogin/query?token=${encodeURIComponent(token)}`);
        return data;
    },

    getQrCookie: async (st: string) => {
        const { data } = await http.get<QrCookieData>(`/qrlogin/cookie?service_ticket=${encodeURIComponent(st)}`);
        return data;
    },

    // 分享链接
    getShareToken: async (pwdId: string, passcode: string) => {
        const { data } = await http.post<QuarkResponse<ShareTokenData>>('/share/token', { pwd_id: pwdId, passcode });
        return data;
    },

    getShareDetail: async (pid: string, st: string, fid: string = '0', page: number = 1) => {
        const { data } = await http.get<QuarkResponse<ShareDetailData>>('/share/detail', {
            params: {
                pwd_id: pid,
                stoken: st,
                pdir_fid: fid,
                force: 0,
                _page: page,
                _size: 50,
                _fetch_total: 1,
                _fetch_sub_dirs: 0,
                _sort: 'file_type:asc,file_name:asc',
            },
        });
        return data;
    },

    // 文件操作
    saveFiles: async (pid: string, st: string, fids: string[], tokens: string[]) => {
        const { data } = await http.post<QuarkResponse<SaveFilesData>>('/share/save', {
            fid_list: fids,
            fid_token_list: tokens,
            to_pdir_fid: '0',
            pwd_id: pid,
            stoken: st,
            pdir_fid: '0',
            scene: 'link',
        });
        return data;
    },

    queryTask: async (taskId: string, retryIndex: number) => {
        const { data } = await http.get<QuarkResponse<TaskResponse>>('/task', {
            params: { task_id: taskId, retry_index: retryIndex },
        });
        return data;
    },

    getDownloadUrl: async (fids: string[]) => {
        const { data } = await http.post<QuarkResponse<DownloadUrlData[]>>('/file/download', { fids });
        return data;
    },

    deleteFiles: async (fids: string[]) => {
        const { data } = await http.post<QuarkResponse>('/file/delete', {
            action_type: 2,
            filelist: fids,
            exclude_fids: [],
        });
        return data;
    },

    getMemberInfo: async () => {
        const { data } = await http.get<QuarkResponse<CapacityData>>('/member', {
            params: { fetch_subscribe: true, _ch: 'home', fetch_identity: true },
        });
        return data;
    },

    logout: async () => {
        const { data } = await http.post<LogoutData>('/logout');
        return data;
    },
};

// 辅助函数
export const collectFiles = (nodes: ShareFileNode[], allFiles: ShareFileNode[] = []) => {
    for (const node of nodes) {
        if (!node.isDir) {
            allFiles.push(node);
        }
        if (node.children.length > 0) {
            collectFiles(node.children, allFiles);
        }
    }
    return allFiles;
};

export const parseShareUrl = (url: string) => {
    const cleanUrl = url.replace(/\[.*?\]/g, '').trim();
    let pwdId = '';
    let passcode = '';
    let pdirFid = '0';

    const m1 = cleanUrl.match(/\/s\/([a-zA-Z0-9]+)/);
    if (m1) pwdId = m1[1];

    const m2 = cleanUrl.match(/[?&](pwd|passcode|password|pw)=([a-zA-Z0-9]{4})/i);
    if (m2) passcode = m2[2];

    const m3 = cleanUrl.match(/#\/list\/share\/([a-zA-Z0-9]+)/);
    if (m3) pdirFid = m3[1];

    return { pwdId, passcode, pdirFid };
};
