import React, { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { RefreshCw, LogIn, ExternalLink, ShieldCheck, Key } from 'lucide-react';
import { useQuarkStore } from '../../store/useQuarkStore';
import { quarkApi } from '../../services/quarkApi';
import { getErrorMessage } from '../../utils';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { motion, AnimatePresence } from 'framer-motion';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLogout: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLogout }) => {
    const [activeTab, setActiveTab] = useState<'qr' | 'cookie'>('qr');
    const { isLoggedIn, setCookie, addLog, notify } = useQuarkStore();

    // QR Login State
    const [qrToken, setQrToken] = useState('');
    const [qrStatus, setQrStatus] = useState<'idle' | 'loading' | 'active' | 'success' | 'expired' | 'error'>('idle');
    const [timeLeft, setTimeLeft] = useState(0);
    const [qrHint, setQrHint] = useState('请使用夸克 APP 扫描二维码');
    const [cookieInput, setCookieInput] = useState('');

    const handleClose = useCallback(() => {
        setQrStatus('idle');
        onClose();
    }, [onClose]);

    const fetchQrToken = async () => {
        setQrStatus('loading');
        setQrHint('正在获取登录二维码...');
        try {
            const res = await quarkApi.getQrToken();
            if (res.status === 2000000 && res.data?.members?.token) {
                setQrToken(res.data.members.token);
                setQrStatus('active');
                setTimeLeft(120);
                setQrHint('请使用夸克 APP 扫描二维码');
                notify('请使用夸克 APP 扫码登录', 'info');
            } else {
                throw new Error(res.message || '获取 Token 失败');
            }
        } catch (error: unknown) {
            const message = getErrorMessage(error);
            setQrStatus('error');
            setQrHint(`获取失败: ${message}`);
            notify(`获取二维码失败: ${message}`, 'error');
        }
    };

    useEffect(() => {
        let timer: number;
        if (qrStatus === 'active' && timeLeft > 0) {
            timer = window.setInterval(() => {
                setTimeLeft((prev) => prev - 1);
            }, 1000);
        } else if (timeLeft === 0 && qrStatus === 'active') {
            setQrStatus('expired');
            setQrHint('二维码已过期，请重新获取');
            notify('二维码已过期，请重新获取', 'warn');
        }
        return () => clearInterval(timer);
    }, [qrStatus, timeLeft, notify]);

    const completeQrLogin = useCallback(async (st: string) => {
        try {
            const res = await quarkApi.getQrCookie(st);
            if (res.cookie) {
                setCookie(res.cookie);
                addLog('登录成功', 'success');
                notify('扫码登录成功，欢迎回来', 'success');
                setTimeout(handleClose, 1500);
            } else {
                throw new Error('未获取到 Cookie');
            }
        } catch (error: unknown) {
            const message = getErrorMessage(error);
            setQrStatus('error');
            setQrHint(`获取 Cookie 失败: ${message}`);
            notify(`登录失败: ${message}`, 'error');
        }
    }, [addLog, handleClose, setCookie, notify]);

    useEffect(() => {
        let pollTimer: number;
        if (qrStatus === 'active') {
            pollTimer = window.setInterval(async () => {
                try {
                    const res = await quarkApi.queryQrStatus(qrToken);
                    if (res.status === 2000000 && res.data?.members?.service_ticket) {
                        clearInterval(pollTimer);
                        setQrStatus('success');
                        setQrHint('扫码成功，正在获取 Cookie...');
                        void completeQrLogin(res.data.members.service_ticket);
                    }
                } catch (e) {
                    console.error('Polling error', e);
                }
            }, 2000);
        }
        return () => clearInterval(pollTimer);
    }, [qrStatus, qrToken, completeQrLogin]);

    const [isSaving, setIsSaving] = useState(false);

    const saveCookie = async () => {
        const trimmed = cookieInput.trim();
        if (!trimmed) return;
        setIsSaving(true);
        try {
            setCookie(trimmed);
            const res = await quarkApi.getMemberInfo();
            if (res.status === 200 || res.code === 0) {
                addLog('Cookie 已保存并验证通过', 'success');
                notify('登录成功，欢迎回来', 'success');
                handleClose();
            } else {
                setCookie('');
                notify('Cookie 无效，请检查后重新输入', 'error');
            }
        } catch {
            setCookie('');
            notify('Cookie 验证失败，请检查是否正确', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const clearCookie = () => {
        setCookieInput('');
        if (isLoggedIn) {
            onLogout();
            handleClose();
        } else {
            notify('请先填写 Cookie', 'info');
        }
    };

    const qrUrl = `https://su.quark.cn/4_eMHBJ?token=${encodeURIComponent(qrToken)}&client_id=532&ssb=weblogin&uc_param_str=&uc_biz_str=${encodeURIComponent('S:custom|OPT:SAREA@0|OPT:IMMERSIVE@1|OPT:BACK_BTN_STYLE@0')}`;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="max-w-[420px] p-8">
                <DialogHeader className="mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                            <ShieldCheck size={24} />
                        </div>
                        <div>
                            <DialogTitle>身份验证</DialogTitle>
                            <DialogDescription>请选择您偏好的登录方式</DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <Tabs
                    value={activeTab}
                    onValueChange={(v) => setActiveTab(v as 'qr' | 'cookie')}
                    className="mb-8"
                >
                    <TabsList className="w-full">
                        <TabsTrigger value="qr" className="flex-1 gap-2">
                            <RefreshCw size={16} className={activeTab === 'qr' ? "animate-spin" : ""} />
                            扫码登录
                        </TabsTrigger>
                        <TabsTrigger value="cookie" className="flex-1 gap-2">
                            <Key size={16} />
                            手动输入
                        </TabsTrigger>
                    </TabsList>

                    <div className="min-h-[280px] mt-6">
                        <TabsContent value="qr" className="flex flex-col items-center outline-none">
                            <div className="relative group">
                                <div className="absolute -inset-4 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-[2rem] blur opacity-10 group-hover:opacity-20 transition duration-500"></div>
                                <div className="relative w-52 h-52 bg-white rounded-3xl flex items-center justify-center border-2 border-slate-100 shadow-inner overflow-hidden">
                                    {qrStatus === 'active' ? (
                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                            <QRCodeSVG value={qrUrl} size={170} />
                                        </motion.div>
                                    ) : qrStatus === 'loading' ? (
                                        <RefreshCw className="w-10 h-10 text-indigo-500 animate-spin" />
                                    ) : (
                                        <div className="text-center p-6 space-y-2">
                                            <RefreshCw size={32} className="mx-auto text-slate-200" />
                                            <p className="text-xs text-slate-400 font-medium leading-relaxed">
                                                {qrStatus === 'expired' ? '二维码已过期' : '等待获取二维码'}
                                            </p>
                                        </div>
                                    )}

                                    <AnimatePresence>
                                        {qrStatus === 'success' && (
                                            <motion.div
                                                initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                                                animate={{ opacity: 1, backdropFilter: 'blur(4px)' }}
                                                className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center"
                                            >
                                                <div className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center mb-3 shadow-lg shadow-emerald-200">
                                                    <LogIn size={32} />
                                                </div>
                                                <span className="text-sm font-bold text-emerald-600">登录成功</span>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>

                            <div className="mt-8 text-center px-4">
                                <p className={qrStatus === 'error' ? "text-rose-500 text-sm font-bold" : "text-slate-600 text-sm font-bold"}>
                                    {qrHint}
                                </p>
                                {qrStatus === 'active' && timeLeft > 0 && (
                                    <div className="mt-2 flex items-center justify-center gap-2">
                                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                                        <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">
                                            剩余 {timeLeft} 秒
                                        </p>
                                    </div>
                                )}
                            </div>

                            <Button
                                onClick={fetchQrToken}
                                disabled={qrStatus === 'loading' || qrStatus === 'success'}
                                variant={qrStatus === 'active' ? "outline" : "gradient"}
                                size="xl"
                                className="mt-8 w-full rounded-2xl"
                            >
                                {qrStatus === 'idle' ? '获取二维码' : '重新获取'}
                            </Button>
                        </TabsContent>

                        <TabsContent value="cookie" className="space-y-6 outline-none">
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">
                                    夸克网盘 Cookie
                                </label>
                                <textarea
                                    value={cookieInput}
                                    onChange={(e) => setCookieInput(e.target.value)}
                                    placeholder="粘贴完整的 Cookie 字符串..."
                                    className="w-full min-h-[140px] p-4 text-xs font-mono bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 focus:bg-white focus:border-indigo-500 outline-none transition-all resize-none"
                                />
                            </div>
                            <div className="flex gap-3">
                                <Button
                                    onClick={saveCookie}
                                    disabled={isSaving || !cookieInput.trim()}
                                    variant="gradient"
                                    className="flex-1 rounded-xl h-12 font-bold"
                                >
                                    {isSaving ? '验证中...' : '保存配置'}
                                </Button>
                                <Button
                                    onClick={clearCookie}
                                    variant="outline"
                                    className="px-6 rounded-xl h-12 font-bold text-slate-500"
                                >
                                    重置
                                </Button>
                            </div>
                            <div className="flex items-start gap-3 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50">
                                <ExternalLink className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                                <p className="text-[11px] text-indigo-700 font-medium leading-relaxed">
                                    提示：打开 <a href="https://pan.quark.cn" target="_blank" rel="noreferrer" className="underline font-bold">pan.quark.cn</a> 登录后，提取 Cookie。
                                </p>
                            </div>
                        </TabsContent>
                    </div>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
};
