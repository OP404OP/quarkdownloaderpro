import axios from 'axios';
import { useQuarkStore } from '../store/useQuarkStore';

const http = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000/api',
});

// 请求拦截：自动注入 x-cookie
http.interceptors.request.use((config) => {
    const cookie = localStorage.getItem('quark_cookie');
    if (cookie) {
        config.headers['x-cookie'] = cookie;
    }
    return config;
});

// 响应拦截：处理 x-append-cookie
http.interceptors.response.use((response) => {
    const appendCookie = response.headers['x-append-cookie'];
    if (appendCookie) {
        const currentCookie = localStorage.getItem('quark_cookie') || '';
        if (!currentCookie.includes('__puus=')) {
            const newCookie = currentCookie ? `${currentCookie}; ${appendCookie}` : appendCookie;
            localStorage.setItem('quark_cookie', newCookie);
            // 同步更新 Zustand store，确保下载等功能能拿到完整 Cookie
            useQuarkStore.getState().setCookie(newCookie);
            console.log('[HTTP] Automatically appended __puus cookie');
        }
    }
    return response;
});

export default http;
