#!/bin/bash

echo "启动TyuTool Web应用..."

# 检查依赖
check_dependency() {
    if ! command -v $1 &> /dev/null; then
        echo "错误: $1 未安装"
        exit 1
    fi
}

check_dependency "python3"
check_dependency "node"
check_dependency "npm"

# 启动后端服务
echo "启动后端服务..."
cd backend
if [ ! -d "venv" ]; then
    echo "创建Python虚拟环境..."
    python3 -m venv venv
fi

source venv/bin/activate
pip install -r requirements.txt

# 后台启动FastAPI
nohup python main.py > ../backend.log 2>&1 &
BACKEND_PID=$!
echo "后端服务已启动 (PID: $BACKEND_PID)"

cd ../frontend

# 安装前端依赖
if [ ! -d "node_modules" ]; then
    echo "安装前端依赖..."
    npm install
fi

# 启动前端服务
echo "启动前端服务..."
npm run dev