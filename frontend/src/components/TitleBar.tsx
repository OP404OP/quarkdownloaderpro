import { useEffect, useState, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { platform } from '@tauri-apps/plugin-os';
import { Minus, Square, X, Copy } from 'lucide-react';

const appWindow = getCurrentWindow();

type Platform = 'windows' | 'macos' | 'linux';

function detectPlatform(): Platform {
    const p = platform();
    if (p === 'macos') return 'macos';
    if (p === 'linux') return 'linux';
    return 'windows';
}

/** Windows / Linux 风格控制按钮（右侧） */
const WindowsControls: React.FC<{
    isMaximized: boolean;
    onMinimize: () => void;
    onToggleMaximize: () => void;
    onClose: () => void;
}> = ({ isMaximized, onMinimize, onToggleMaximize, onClose }) => (
    <div className="flex items-center h-full">
        <button
            onClick={onMinimize}
            className="inline-flex items-center justify-center w-[46px] h-full text-black/90 hover:bg-black/[.05] active:bg-black/[.03] transition-colors"
        >
            <Minus size={15} strokeWidth={1.5} />
        </button>
        <button
            onClick={onToggleMaximize}
            className="inline-flex items-center justify-center w-[46px] h-full text-black/90 hover:bg-black/[.05] active:bg-black/[.03] transition-colors"
        >
            {isMaximized ? <Copy size={13} strokeWidth={1.5} /> : <Square size={13} strokeWidth={1.5} />}
        </button>
        <button
            onClick={onClose}
            className="inline-flex items-center justify-center w-[46px] h-full text-black/90 hover:bg-[#c42b1c] hover:text-white active:bg-[#c42b1c]/90 transition-colors"
        >
            <X size={15} strokeWidth={1.5} />
        </button>
    </div>
);

/** macOS 风格交通灯按钮（左侧） */
const MacOSControls: React.FC<{
    onMinimize: () => void;
    onToggleMaximize: () => void;
    onClose: () => void;
}> = ({ onMinimize, onToggleMaximize, onClose }) => {
    const [hovered, setHovered] = useState(false);

    return (
        <div
            className="flex items-center gap-2 px-3"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <button
                onClick={onClose}
                className="w-3 h-3 rounded-full bg-[#ff544d] border border-black/[.12] flex items-center justify-center hover:bg-[#ff544d] active:bg-[#bf403a]"
            >
                {hovered && <X size={8} strokeWidth={2.5} className="text-black/60" />}
            </button>
            <button
                onClick={onMinimize}
                className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-black/[.12] flex items-center justify-center hover:bg-[#ffbd2e] active:bg-[#bf9122]"
            >
                {hovered && <Minus size={8} strokeWidth={2.5} className="text-black/60" />}
            </button>
            <button
                onClick={onToggleMaximize}
                className="w-3 h-3 rounded-full bg-[#28c93f] border border-black/[.12] flex items-center justify-center hover:bg-[#28c93f] active:bg-[#1e9930]"
            >
                {hovered && (
                    <svg width="6" height="6" viewBox="0 0 15 15" fill="none" className="text-black/60">
                        <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M3.53 0.43L15.09 12.04C15.09 12.04 15.07 5.35 15.07 4.02C15.07 1.32 14.18 0.43 11.54 0.43C10.65 0.43 3.53 0.43 3.53 0.43ZM12.44 15.54L0.88 3.93C0.88 3.93 0.91 10.62 0.91 11.95C0.91 14.65 1.79 15.54 4.43 15.54C5.33 15.54 12.44 15.54 12.44 15.54Z"
                            fill="currentColor"
                        />
                    </svg>
                )}
            </button>
        </div>
    );
};

export const TitleBar: React.FC = () => {
    const [isMaximized, setIsMaximized] = useState(false);
    const [os, setOs] = useState<Platform>('windows');

    useEffect(() => {
        setOs(detectPlatform());
        appWindow.isMaximized().then(setIsMaximized);

        let unlisten: (() => void) | undefined;
        const setup = async () => {
            unlisten = await appWindow.onResized(async () => {
                const maximized = await appWindow.isMaximized();
                setIsMaximized(maximized);
            });
        };
        setup();
        return () => { unlisten?.(); };
    }, []);

    const handleMinimize = useCallback(() => { appWindow.minimize(); }, []);
    const handleToggleMaximize = useCallback(() => { appWindow.toggleMaximize(); }, []);
    const handleClose = useCallback(() => { appWindow.close(); }, []);

    const isMac = os === 'macos';

    const controls = isMac ? (
        <MacOSControls
            onMinimize={handleMinimize}
            onToggleMaximize={handleToggleMaximize}
            onClose={handleClose}
        />
    ) : (
        <WindowsControls
            isMaximized={isMaximized}
            onMinimize={handleMinimize}
            onToggleMaximize={handleToggleMaximize}
            onClose={handleClose}
        />
    );

    return (
        <div className="h-9 flex items-center shrink-0 select-none" data-tauri-drag-region>
            {/* macOS: 左侧控制按钮 → 标题 → 空白 */}
            {/* Windows/Linux: 标题 → 空白 → 右侧控制按钮 */}
            {isMac && controls}

            <div className="flex items-center pl-4" data-tauri-drag-region>
                <span className="text-xs font-medium text-slate-400 tracking-tight">
                    Quark Downloader Pro
                </span>
            </div>

            <div data-tauri-drag-region className="flex-1 h-full" />

            {!isMac && controls}
        </div>
    );
};