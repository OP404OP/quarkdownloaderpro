import React from 'react';
import { motion } from 'framer-motion';
import {
    Github,
    Heart,
    Cpu,
    Code2,
    Sparkles,
    ExternalLink,
    Terminal,
    ShieldCheck
} from 'lucide-react';
import { Badge } from '../../components/ui/badge';

export const HelpView: React.FC = () => {
    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const item = {
        hidden: { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0 }
    };

    return (
        <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
            <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                className="flex flex-col h-full gap-3 max-w-4xl mx-auto w-full pb-2"
            >
                {/* Header Section - 紧凑布局 */}
                <motion.section variants={item} className="shrink-0 pt-1">
                    <Badge variant="indigo" className="mb-1 py-1 px-3 rounded-full">
                        <Sparkles size={14} className="mr-2" />
                        关于软件与使用说明
                    </Badge>
                    <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 leading-tight">
                        Quark <span className="gradient-text">Downloader Pro</span>
                    </h1>
                </motion.section>

                {/* Main Content Area - 自动分配剩余高度 */}
                <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Software Info - 还原完整文字 */}
                    <motion.div variants={item} className="glass-effect rounded-[1.8rem] p-5 border-white/40 flex flex-col justify-between">
                        <div className="space-y-2">
                            <div className="flex items-center gap-3 text-indigo-600">
                                <div className="w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center">
                                    <Cpu size={20} />
                                </div>
                                <h3 className="font-bold text-slate-800">软件基因</h3>
                            </div>
                            <p className="text-slate-600 text-[15px] leading-relaxed">
                                本软件是在开源项目的基础上进行的 <span className="font-bold text-indigo-600">二次深度开发与视觉重构</span>。保留了核心的（ <span className="gradient-text"> 特殊头绕过大文件下载限制 </span>）解析能力，并引入了全新的图形界面、交互逻辑。
                            </p>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                            <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 py-1 transition-all duration-300 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 cursor-default">
                                <Terminal size={14} className="mr-1" /> AI 驱动开发
                            </Badge>
                            <Badge className="bg-blue-50 text-blue-600 border-blue-100 py-1 transition-all duration-300 hover:bg-blue-500 hover:text-white hover:border-blue-500 cursor-default">
                                <Code2 size={14} className="mr-1" /> React + Tailwind
                            </Badge>
                        </div>
                    </motion.div>

                    {/* AI & Features - 还原完整文字 */}
                    <motion.div variants={item} className="glass-effect rounded-[1.8rem] p-5 border-white/40 flex flex-col justify-between">
                        <div className="space-y-2">
                            <div className="flex items-center gap-3 text-purple-600">
                                <div className="w-10 h-10 bg-purple-50 rounded-2xl flex items-center justify-center">
                                    <Sparkles size={20} />
                                </div>
                                <h3 className="font-bold text-slate-800">AI 赋能</h3>
                            </div>
                            <p className="text-slate-600 text-[15px] leading-relaxed">
                                当前版本的所有 <span className="font-bold text-purple-600">前端重构、视觉动效及交互逻辑</span> 基于AI
                                <span className="font-bold text-slate-900"> 作者全程 Vibe Coding </span> 协同修改并驱动。
                            </p>
                        </div>
                        <div className="p-3 bg-slate-50/50 rounded-xl border border-slate-100">
                            <p className="text-[11px] text-slate-500 italic">
                                "AI 不仅在编写代码，更在定义审美与体验的边界。" - 来自 哈基米
                            </p>
                        </div>
                    </motion.div>

                    {/* Developer Info - 横跨两列，压缩纵向高度 */}
                    <motion.div variants={item} className="md:col-span-2 glass-effect rounded-[2rem] p-5 border-white/40 flex items-center justify-between gap-6 relative overflow-hidden group">
                        <div className="relative z-10 flex flex-1 items-center justify-between">
                            <div className="space-y-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white">
                                        <Github size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 text-lg leading-tight">获取支持</h3>
                                        <p className="text-slate-500 text-xs">关注项目主页获取最新版本</p>
                                    </div>
                                </div>
                                <a
                                    href="https://github.com/OP404OP/quarkdownloaderpro"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200"
                                >
                                    <Github size={16} />
                                    GitHub @OP404OP/quarkdownloaderpro
                                    <ExternalLink size={14} className="opacity-50" />
                                </a>
                            </div>

                            <div className="bg-white/50 backdrop-blur-sm rounded-2xl p-5 border border-white/60 min-w-[280px]">
                                <div className="flex items-center gap-2 mb-3 text-rose-500 font-bold text-sm">
                                    <Heart size={16} fill="currentColor" />
                                    鸣谢 (Credits)
                                </div>
                                <div className="space-y-2">
                                    <a href="https://github.com/muyan556/gopeed-extension-quark" target="_blank" rel="noreferrer"
                                        className="flex items-center justify-between text-xs font-bold text-slate-600 hover:text-indigo-600 transition-colors group/item">
                                        <span className="flex items-center gap-2">
                                            <Github size={12} className="text-slate-400 group-hover/item:text-indigo-500 transition-colors" />
                                            GitHub @muyan556
                                        </span>
                                        <ExternalLink size={12} className="text-slate-400" />
                                    </a>
                                    <div className="h-px bg-slate-100 w-full" />
                                </div>
                            </div>
                        </div>
                        <Github size={100} className="absolute -bottom-8 -left-8 text-slate-50 opacity-[0.03] group-hover:rotate-12 transition-transform duration-700 pointer-events-none" />
                    </motion.div>
                </div>

                {/* Disclaimer - 还原完整文字，使用紧凑排版 */}
                <motion.section variants={item} className="shrink-0 p-4 rounded-[1.5rem] bg-amber-50/40 border border-amber-100/40">
                    <div className="flex gap-4 items-center">
                        <ShieldCheck size={24} className="text-amber-600 shrink-0" />
                        <div className="space-y-0.5">
                            <h4 className="text-sm font-bold text-amber-900 leading-none">使用声明 (Disclaimer)</h4>
                            <p className="text-[11px] text-amber-700 leading-normal">
                                本软件仅用于技术学习与交流，严禁用于任何非法用途。用户在使用过程中的一切行为需自行承担法律责任。开发者不保证软件的绝对稳定性与持续性，请根据需要合理使用。
                            </p>
                        </div>
                    </div>
                </motion.section>
            </motion.div>
        </div>
    );
};