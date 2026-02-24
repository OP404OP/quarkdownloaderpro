# Quark Downloader Pro Frontend

基于 React 19 + TypeScript + TailwindCSS 构建的现代化夸克网盘链接解析工具。

## 配置

复制示例环境文件：

```bash
cp .env.example .env.local
```

主要变量：

- `VITE_API_BASE_URL`: 前端请求前缀，留空时走相对路径 `/api`
- `VITE_DEV_API_TARGET`: Vite 代理后端地址
- `VITE_DEV_HOST`: 开发服务器 host
- `VITE_DEV_PORT`: 开发服务器 port

示例：

```env
VITE_API_BASE_URL=http://localhost:3000/api
VITE_DEV_API_TARGET=http://localhost:3000
VITE_DEV_HOST=127.0.0.1
VITE_DEV_PORT=1420
```