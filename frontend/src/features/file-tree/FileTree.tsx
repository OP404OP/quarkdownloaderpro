import React, { useState } from 'react';
import {
    ChevronRight,
    Folder,
    FileText,
    Video,
    Music,
    Image as ImageIcon,
    Archive,
    Smartphone,
    FileCode,
    File as FileIcon,
} from 'lucide-react';
import { useQuarkStore } from '../../store/useQuarkStore';
import type { ShareFileNode } from '../../types/quark';
import { cn, formatSize, formatTime } from '../../utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Checkbox } from '../../components/ui/checkbox';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Badge } from '../../components/ui/badge';

const getFileIcon = (name: string, isDir: boolean) => {
    if (isDir) return <Folder className="text-amber-400 fill-amber-400" size={18} />;
    const ext = name.split('.').pop()?.toLowerCase() || '';
    switch (ext) {
        case 'mp4': case 'mkv': case 'avi': case 'mov': case 'wmv': return <Video className="text-indigo-500" size={18} />;
        case 'mp3': case 'flac': case 'wav': return <Music className="text-purple-500" size={18} />;
        case 'jpg': case 'jpeg': case 'png': case 'gif': case 'webp': return <ImageIcon className="text-emerald-500" size={18} />;
        case 'zip': case 'rar': case '7z': case 'tar': return <Archive className="text-orange-500" size={18} />;
        case 'exe': case 'apk': return <Smartphone className="text-slate-600" size={18} />;
        case 'pdf': case 'doc': case 'docx': case 'txt': return <FileText className="text-slate-500" size={18} />;
        case 'ts': case 'js': case 'py': case 'html': return <FileCode className="text-yellow-600" size={18} />;
        default: return <FileIcon className="text-slate-400" size={18} />;
    }
};

const SIZE_COL_CLASS = 'file-tree-size-col items-center justify-end overflow-hidden text-right whitespace-nowrap';
const DATE_COL_CLASS = 'file-tree-date-col items-center justify-end overflow-hidden text-right whitespace-nowrap';

interface FileRowProps {
    node: ShareFileNode;
    onToggleExpand: (node: ShareFileNode) => void;
}

const FileRow: React.FC<FileRowProps> = ({ node, onToggleExpand }) => {
    const { selectedFids, toggleFileSelection } = useQuarkStore();
    const isSelected = selectedFids.has(node.fid);
    const sizeText = formatSize(node.size);
    const updatedText = node.updated_at ? formatTime(node.updated_at) : '';
    const updatedDateText = updatedText.split(' ')[0] || '';
    const indentWidth = Math.min(node.depth * 14, 84);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                'group flex w-full min-w-0 items-center gap-2 border-b border-slate-100/30 px-3 py-2.5 transition-all duration-200 sm:gap-3 sm:px-4 sm:py-3 lg:px-6',
                node.isDir ? "cursor-pointer hover:bg-emerald-500/10" : "hover:bg-emerald-500/5",
                isSelected && !node.isDir && 'bg-emerald-500/10 border-l-4 border-l-emerald-500 pl-2 sm:pl-3 lg:pl-5 shadow-sm'
            )}
            onClick={() => node.isDir && onToggleExpand(node)}
        >
            <div className="flex w-4 shrink-0 items-center justify-center sm:w-5">
                {node.isDir && (
                    <motion.div
                        animate={{ rotate: node.expanded ? 90 : 0 }}
                        className="text-slate-400"
                    >
                        <ChevronRight size={14} strokeWidth={3} className="sm:w-4 sm:h-4" />
                    </motion.div>
                )}
            </div>

            {!node.isDir && (
                <div className="w-4 shrink-0 sm:w-5">
                    <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleFileSelection(node.fid)}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
            {node.isDir && <div className="w-4 shrink-0 sm:w-5" />}

            <div className="shrink-0 transition-transform duration-200 group-hover:scale-110">
                {getFileIcon(node.file_name, node.isDir)}
            </div>

            <div className="min-w-0 flex-1">
                <div className="min-w-0" style={{ paddingLeft: indentWidth }}>
                    <p className={cn('truncate font-normal text-[clamp(11px,0.9vw,14px)]', node.isDir ? 'text-slate-900' : 'text-slate-700')}>
                        {node.file_name}
                    </p>
                </div>
            </div>

            <div className={SIZE_COL_CLASS}>
                {!node.isDir && (
                    <span title={sizeText} className="block w-full overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(10px,0.8vw,12px)] font-normal text-slate-700 tabular-nums">
                        {sizeText}
                    </span>
                )}
            </div>

            <div className={DATE_COL_CLASS}>
                {updatedDateText ? (
                    <span title={updatedText} className="block w-full overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(10px,0.8vw,12px)] font-normal text-slate-500 tabular-nums">
                        {updatedDateText}
                    </span>
                ) : null}
            </div>
        </motion.div>
    );
};

export const FileTree: React.FC = () => {
    const { shareInfo } = useQuarkStore();
    const [, setUpdate] = useState({}); // Force update

    const toggleExpand = (node: ShareFileNode): void => {
        node.expanded = !node.expanded;
        setUpdate({});
    };

    const renderNodes = (nodes: ShareFileNode[]) => {
        return nodes.map(node => (
            <React.Fragment key={node.fid}>
                <FileRow node={node} onToggleExpand={toggleExpand} />
                <AnimatePresence>
                    {node.isDir && node.expanded && node.children.length > 0 && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            {renderNodes(node.children)}
                        </motion.div>
                    )}
                </AnimatePresence>
            </React.Fragment>
        ));
    };

    if (shareInfo.files.length === 0) return null;

    return (
        <div className="file-tree-panel glass-effect flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[1.5rem] border-white/40">
            <ScrollArea className="min-h-0 flex-1" type="auto">
                <div className="sticky top-0 z-10 flex w-full min-w-0 items-center gap-2 border-b border-white/20 bg-white/70 px-3 py-3 text-[11px] font-semibold tracking-[0.08em] text-slate-500 backdrop-blur-xl sm:gap-3 sm:px-4 sm:py-4 lg:px-6">
                    <div className="w-4 shrink-0 sm:w-5" />
                    <div className="w-4 shrink-0 sm:w-5" />
                    <div className="w-[18px] shrink-0" />
                    <div className="min-w-0 flex-1">文件列表</div>
                    <div className={SIZE_COL_CLASS}>大小</div>
                    <div className={DATE_COL_CLASS}>日期</div>
                </div>
                <div className="flex flex-col">
                    {renderNodes(shareInfo.files)}
                </div>
            </ScrollArea>

            <div className="shrink-0 border-t border-white/20 bg-white/40 p-3 text-center">
                <Badge variant="secondary" className="bg-transparent border-0 text-slate-400 font-bold">
                    显示范围：当前根目录及所有子目录
                </Badge>
            </div>
        </div>
    );
};
