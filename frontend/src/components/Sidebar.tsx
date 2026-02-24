import React from 'react';
import { motion } from 'framer-motion';
import {
    Zap,
    Settings,
    HelpCircle,
    LogOut,
    User,
    HardDrive,
    RefreshCw,
    ChevronRight
} from 'lucide-react';
import { cn } from '../utils';
import { useQuarkStore } from '../store/useQuarkStore';
import { Button } from './ui/button';
import { CapacityStats } from '../features/capacity/CapacityStats';

interface SidebarProps {
    onLogout: () => void;
    onRefreshCapacity: () => void;
    onLogin: () => void;
    activeTab: string;
    setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
    onLogout,
    onRefreshCapacity,
    onLogin,
    activeTab,
    setActiveTab
}) => {
    const { isLoggedIn, toast } = useQuarkStore();

    const menuItems = [
        { id: 'parser', icon: Zap, label: '解析提取' },
        { id: 'history', icon: RefreshCw, label: '解析历史' },
        { id: 'settings', icon: Settings, label: '软件设置' },
        { id: 'help', icon: HelpCircle, label: '使用说明' },
    ];

    return (
        <div className="relative m-6 w-52 glass-effect rounded-[2.5rem] z-50 flex flex-col p-5 overflow-hidden shrink-0 h-[calc(100%-3rem)]">
            <div className="flex items-center gap-2 mb-10 px-1">
                <div className="w-10 h-10 gradient-bg rounded-2xl flex items-center justify-center text-white shadow-lg shadow-purple-200/50">
                    <HardDrive size={22} strokeWidth={2.5} />
                </div>
                <div className="flex flex-col">
                    <span className="font-display text-base font-medium tracking-tight text-slate-800 leading-none">
                        Quark
                    </span>
                    <span className="font-display text-xs font-medium tracking-wide text-slate-500">
                        Downloader Pro
                    </span>
                </div>
            </div>

            <nav className="flex-1 space-y-2">
                {menuItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={cn(
                            "w-full flex items-center gap-2 px-3 py-3 rounded-2xl transition-all duration-200 group relative",
                            activeTab === item.id
                                ? "bg-slate-900 text-white shadow-xl shadow-slate-200/50"
                                : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        )}
                    >
                        <item.icon size={20} strokeWidth={activeTab === item.id ? 2.5 : 2} />
                        <span className="font-semibold text-sm">{item.label}</span>
                        {activeTab === item.id && (
                            <motion.div
                                layoutId="active-pill"
                                className="absolute right-3"
                            >
                                <ChevronRight size={14} className="opacity-50" />
                            </motion.div>
                        )}
                    </button>
                ))}
            </nav>

            <div className="mt-auto space-y-4">
                {/* 转移过来的并发设置 */}
                {activeTab === 'parser' && (
                    <div className="space-y-2">
                        <div className="p-4 bg-white/10 rounded-2xl border border-white/10">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">下载线程</span>
                                <input
                                    type="number"
                                    min="1" max="999"
                                    value={useQuarkStore.getState().downloadThreads}
                                    onChange={(e) => useQuarkStore.getState().setDownloadThreads(Number(e.target.value))}
                                    className="w-14 text-right text-xs font-black text-indigo-500 bg-transparent outline-none border-b border-indigo-200 focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                            </div>
                            <input
                                type="range"
                                min="1" max="128"
                                value={Math.min(useQuarkStore.getState().downloadThreads, 128)}
                                onChange={(e) => useQuarkStore.getState().setDownloadThreads(Number(e.target.value))}
                                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />
                        </div>
                        <div className="p-4 bg-white/10 rounded-2xl border border-white/10">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">同时下载</span>
                                <span className="text-xs font-black text-indigo-500">{useQuarkStore.getState().downloadConcurrency}</span>
                            </div>
                            <input
                                type="range"
                                min="1" max="10"
                                value={useQuarkStore.getState().downloadConcurrency}
                                onChange={(e) => useQuarkStore.getState().setDownloadConcurrency(Number(e.target.value))}
                                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />
                        </div>
                    </div>
                )}

                {isLoggedIn ? (
                    <div className="space-y-4">
                        <CapacityStats onRefresh={onRefreshCapacity} />
                        <motion.button
                            disabled={toast.isLoggingOut}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={onLogout}
                            className={cn(
                                "w-full flex items-center justify-center gap-2 py-2.5 text-[10px] font-bold rounded-xl transition-all duration-300 border shadow-sm",
                                toast.isLoggingOut
                                    ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                    : "text-rose-500 border-rose-100/50 hover:bg-rose-500 hover:text-white hover:border-rose-500 hover:shadow-md hover:shadow-rose-200"
                            )}
                        >
                            {toast.isLoggingOut ? <RefreshCw size={14} className="animate-spin" /> : <LogOut size={14} strokeWidth={2.5} />}
                            {toast.isLoggingOut ? '正在提出...' : '退出登录'}
                        </motion.button>
                    </div>
                ) : (
                    <Button
                        onClick={onLogin}
                        variant="gradient"
                        className="w-full rounded-2xl py-6 font-bold flex items-center gap-2 group"
                    >
                        <User size={18} className="group-hover:animate-pulse" />
                        立即登录
                    </Button>
                )}
            </div>
        </div>
    );
};