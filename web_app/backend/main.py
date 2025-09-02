#!/usr/bin/env python
# -*- coding: utf-8 -*-

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn
import logging
import json
import asyncio
from typing import List, Dict
import serial
from serial.tools import list_ports
import threading
import time
import os
import sys

# 添加tyutool到Python路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from tyutool.flash import FlashInterface
from flash_handler import FlashManager

# 设置日志配置
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

app = FastAPI(title="TyuTool Web App", description="Web version of TyuTool", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables
active_connections: List[WebSocket] = []
serial_connections: Dict[str, serial.Serial] = {}
serial_threads: Dict[str, threading.Thread] = {}
flash_manager = FlashManager()
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
log_config: Dict[str, Dict] = {}  # 存储每个端口的日志配置

def resolve_log_file_path(user_path: str) -> str:
    """解析日志文件路径，支持相对路径、绝对路径和用户主目录路径"""
    # 处理用户主目录路径（~）
    if user_path.startswith('~'):
        return os.path.expanduser(user_path)
    
    # 绝对路径，直接使用
    if os.path.isabs(user_path):
        return user_path
    
    # 相对路径，相对于项目根目录
    project_root = '/home/huatuo/work/open/tyutool'
    return os.path.join(project_root, user_path)

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except:
                pass

manager = ConnectionManager()

@app.get("/api/ports")
async def get_serial_ports():
    """获取可用串口列表"""
    try:
        ports = list_ports.comports()
        port_list = []
        for port in ports:
            # 过滤掉 /dev/ttyS 开头的设备
            if port.device.startswith("/dev/ttyS"):
                continue
                
            port_info = {
                "device": port.device,
                "name": port.name,
                "description": port.description,
                "manufacturer": port.manufacturer or "Unknown"
            }
            port_list.append(port_info)
        return {"success": True, "ports": port_list}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/serial/connect")
async def connect_serial(data: dict):
    """连接串口"""
    try:
        port = data["port"]
        baudrate = int(data["baudrate"])
        databits = int(data.get("databits", 8))
        parity = data.get("parity", "N")
        stopbits = float(data.get("stopbits", 1))
        save_to_file = data.get("save_to_file", False)
        log_file_path = data.get("log_file_path", "monitor.log")
        
        # 解析并存储日志配置
        resolved_path = resolve_log_file_path(log_file_path) if save_to_file else log_file_path
        log_config[port] = {
            "save_to_file": save_to_file,
            "log_file_path": resolved_path
        }
        
        # 如果启用日志保存，确保目录存在
        if save_to_file:
            logging.info(f"Log file will be saved to: {resolved_path}")
            log_dir = os.path.dirname(resolved_path)
            if log_dir and not os.path.exists(log_dir):
                try:
                    os.makedirs(log_dir, exist_ok=True)
                    logging.info(f"Created log directory: {log_dir}")
                except Exception as e:
                    logging.error(f"Failed to create log directory {log_dir}: {e}")
        
        # 关闭已存在的连接
        if port in serial_connections:
            await disconnect_serial({"port": port})
        
        # 创建新连接
        ser = serial.Serial(
            port=port,
            baudrate=baudrate,
            bytesize=databits,
            parity=parity,
            stopbits=stopbits,
            timeout=0.1
        )
        
        serial_connections[port] = ser
        
        # 启动接收线程
        thread = threading.Thread(target=serial_read_thread, args=(port,))
        thread.daemon = True
        thread.start()
        serial_threads[port] = thread
        
        return {"success": True, "message": f"Connected to {port}"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/serial/disconnect")
async def disconnect_serial(data: dict):
    """断开串口连接"""
    try:
        port = data["port"]
        
        if port in serial_connections:
            serial_connections[port].close()
            del serial_connections[port]
        
        if port in serial_threads:
            del serial_threads[port]
        
        # 清理日志配置
        if port in log_config:
            del log_config[port]
        
        return {"success": True, "message": f"Disconnected from {port}"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/serial/send")
async def send_serial_data(data: dict):
    """发送串口数据"""
    try:
        port = data["port"]
        text = data["text"]
        hex_mode = data.get("hex_mode", False)
        add_newline = data.get("add_newline", True)
        
        if port not in serial_connections:
            return {"success": False, "error": "Port not connected"}
        
        ser = serial_connections[port]
        
        if hex_mode:
            # 十六进制模式
            text = text.replace(" ", "").replace(",", "")
            try:
                send_data = bytes.fromhex(text)
            except ValueError:
                return {"success": False, "error": "Invalid hex format"}
        else:
            # 文本模式
            if add_newline:
                text += "\n"
            send_data = text.encode('utf-8')
        
        ser.write(send_data)
        
        # 保存发送数据到日志文件
        if port in log_config and log_config[port]["save_to_file"]:
            try:
                timestamp = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
                log_line = f"[{timestamp}] TX: {text}"
                log_file_path = log_config[port]["log_file_path"]
                with open(log_file_path, "a", encoding="utf-8") as log_file:
                    log_file.write(log_line)
                    if not text.endswith('\n'):
                        log_file.write('\n')
                    log_file.flush()
            except Exception as e:
                logging.error(f"Error writing to log file: {e}")
        
        # 广播发送的数据
        await manager.broadcast(json.dumps({
            "type": "tx",
            "port": port,
            "data": text,
            "hex_mode": hex_mode,
            "timestamp": time.time()
        }))
        
        return {"success": True, "message": "Data sent"}
    except Exception as e:
        return {"success": False, "error": str(e)}

def serial_read_thread(port: str):
    """串口接收线程"""
    while port in serial_connections:
        try:
            ser = serial_connections[port]
            if ser.in_waiting > 0:
                data = ser.read(ser.in_waiting)
                
                # 只有当接收到非空数据时才广播
                if len(data) > 0:
                    decoded_data = data.decode('utf-8', errors='ignore')
                    
                    # 保存到日志文件（记录所有数据，包括空白字符）
                    if port in log_config and log_config[port]["save_to_file"]:
                        try:
                            timestamp = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
                            log_line = f"[{timestamp}] RX: {decoded_data}"
                            log_file_path = log_config[port]["log_file_path"]
                            with open(log_file_path, "a", encoding="utf-8") as log_file:
                                log_file.write(log_line)
                                if not decoded_data.endswith('\n'):
                                    log_file.write('\n')
                                log_file.flush()
                        except Exception as e:
                            logging.error(f"Error writing to log file: {e}")
                    
                    # 过滤掉空白字符串用于广播显示
                    if decoded_data.strip():
                        asyncio.run(manager.broadcast(json.dumps({
                            "type": "rx",
                            "port": port,
                            "data": decoded_data,
                            "hex_data": data.hex(),
                            "timestamp": time.time()
                        })))
            
            time.sleep(0.01)  # 避免CPU占用过高
        except Exception as e:
            logging.error(f"Serial read error: {e}")
            break

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket连接处理"""
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # 处理客户端发送的消息
            message = json.loads(data)
            await manager.broadcast(f"Echo: {message}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/api/chips")
async def get_chip_list():
    """获取支持的芯片列表"""
    try:
        chip_list = {}
        for chip_name in FlashInterface.get_soc_names():
            chip_info = {
                "name": chip_name,
                "baudrate": FlashInterface.get_baudrate(chip_name),
                "monitor_baudrate": FlashInterface.get_monitor_baudrate(chip_name),
                "start_addr": FlashInterface.get_start_addr(chip_name),
                "modules": FlashInterface.get_modules(chip_name)
            }
            chip_list[chip_name] = chip_info
        return {"success": True, "chips": chip_list}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/flash/upload")
async def upload_firmware(file: UploadFile = File(...)):
    """上传固件文件"""
    try:
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
        return {"success": True, "file_path": file_path, "filename": file.filename}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/flash/start")
async def start_flash(data: dict):
    """开始烧录"""
    try:
        # 如果是写入操作，需要文件路径
        file_path = None
        if data["operation"].lower() == "write":
            file_path = data.get("file_path")
            if not file_path or not os.path.exists(file_path):
                return {"success": False, "error": "File not found"}
        
        result = flash_manager.start_flash(data, manager, file_path)
        return result
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/flash/stop")
async def stop_flash(data: dict):
    """停止烧录"""
    try:
        port = data["port"]
        result = flash_manager.stop_flash(port)
        return result
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/api/flash/download/{filename}")
async def download_file(filename: str):
    """下载读取的固件文件"""
    file_path = os.path.join(UPLOAD_DIR, filename)
    if os.path.exists(file_path):
        return FileResponse(file_path, filename=filename)
    return {"error": "File not found"}

@app.get("/")
async def root():
    return {"message": "TyuTool Web API"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")