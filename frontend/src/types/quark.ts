export interface QuarkResponse<T = Record<string, unknown>> {
    status: number;
    code: number;
    message: string;
    data: T;
    metadata?: {
        _total?: number;
    };
}

export interface QrTokenData {
    members: {
        token: string;
    };
}

export interface QrQueryData {
    members: {
        status: number;
        status_msg: string;
        service_ticket?: string;
    };
}

export interface QrCookieData {
    cookie: string;
    user_info: unknown;
    missing_puus: boolean;
}

export interface ShareTokenData {
    stoken: string;
}

export interface ShareFileNode {
    fid: string;
    file_name: string;
    size: number;
    format_type: string;
    updated_at: number;
    share_fid_token: string;
    isDir: boolean;
    depth: number;
    path: string;
    children: ShareFileNode[];
    expanded: boolean;
}

export interface RawFileItem {
    fid: string;
    file_name: string;
    size?: number;
    dir?: boolean;
    file_type?: number;
    obj_category?: string;
    format_type?: string;
    updated_at?: number;
    l_updated_at?: number;
    share_fid_token?: string;
}

export interface CapacityData {
    use_capacity: number;
    total_capacity: number;
}

export interface TaskResponse {
    status: number;
    save_as?: {
        save_as_top_fids: string[];
    };
}

export interface DownloadUrlData {
    download_url: string;
}
