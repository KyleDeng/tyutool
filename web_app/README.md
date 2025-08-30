# TyuTool Web Application

基于原有GUI应用开发的Web版本串口助手，支持串口通信、实时数据收发等功能。

## 项目结构

```
web_app/
├── backend/           # FastAPI 后端服务
│   ├── main.py       # 主服务文件
│   └── requirements.txt
└── frontend/         # Next.js React 前端
    ├── src/
    │   ├── app/
    │   │   └── page.tsx
    │   └── components/
    │       └── SerialAssistant.tsx
    └── package.json
```

## 运行方式

### 启动后端服务
```bash
cd backend
pip install -r requirements.txt
python main.py
```
后端服务运行在 http://localhost:8000

### 启动前端服务
```bash
cd frontend
npm install
npm run dev
```
前端服务运行在 http://localhost:3000

## 功能特性

- ✅ 串口设备扫描和连接
- ✅ 实时数据收发
- ✅ 十六进制/文本模式切换
- ✅ 时间戳显示
- ✅ WebSocket实时通信
- ⏳ 固件烧录功能（待开发）

## API接口

- `GET /api/ports` - 获取串口列表
- `POST /api/serial/connect` - 连接串口
- `POST /api/serial/disconnect` - 断开串口
- `POST /api/serial/send` - 发送数据
- `WebSocket /ws` - 实时数据推送