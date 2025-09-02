#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import json
import time
import asyncio
import threading
import queue
from typing import Optional
from tyutool.flash import FlashArgv, ProgressHandler, FlashInterface
from tyutool.flash import flash_params_check
import logging

class WebProgressHandler(ProgressHandler):
    """Web进度处理器，通过WebSocket发送进度"""
    
    def __init__(self, websocket_manager, port):
        super().__init__()
        self.websocket_manager = websocket_manager
        self.port = port
        self.total = 0
        self.current = 0
        self.header = ""
        
    def setup(self, header: str, total: int) -> None:
        self.header = header
        self.total = total
        self.current = 0
        asyncio.run(self.websocket_manager.broadcast(json.dumps({
            "type": "flash_progress",
            "port": self.port,
            "header": header,
            "progress": 0,
            "total": total,
            "current": 0
        })))
        
    def start(self) -> None:
        self.current = 0
        
    def update(self, size: int = 1) -> None:
        self.current += size
        progress = int((self.current / self.total * 100)) if self.total > 0 else 0
        asyncio.run(self.websocket_manager.broadcast(json.dumps({
            "type": "flash_progress",
            "port": self.port,
            "header": self.header,
            "progress": progress,
            "total": self.total,
            "current": self.current
        })))
        
    def close(self) -> None:
        self.current = 0


class FlashManager:
    """烧录管理器"""
    
    def __init__(self):
        self.active_tasks = {}
        self.logger = logging.getLogger(__name__)
        
    def start_flash(self, params: dict, websocket_manager, file_path: str = None):
        """开始烧录任务"""
        port = params["port"]
        debug_mode = params.get("debug_mode", False)
        
        # 检查是否已有任务在运行
        if port in self.active_tasks and self.active_tasks[port]["thread"].is_alive():
            return {"success": False, "error": "Flash task already running on this port"}
            
        # 创建独立的logger用于此次烧录任务
        task_logger = logging.getLogger(f"flash_{port}_{time.time()}")
        task_logger.setLevel(logging.DEBUG if debug_mode else logging.INFO)
        task_logger.propagate = False  # 防止日志重复输出
        
        # 清除已有的处理器，避免重复输出
        task_logger.handlers.clear()
        
        # 同时设置根logger的级别，以便tyutool库内部的日志也能输出
        root_logger = logging.getLogger()
        original_root_level = root_logger.level
        if debug_mode:
            root_logger.setLevel(logging.DEBUG)
        
        # 创建日志队列用于线程间通信
        log_queue = queue.Queue()
        
        # 创建自定义处理器，将日志放入队列
        class QueueLogHandler(logging.Handler):
            def emit(self, record):
                log_message = self.format(record)
                log_queue.put({
                    "type": "flash_log",
                    "port": port,
                    "message": log_message,
                    "level": record.levelname,
                    "timestamp": time.time()
                })
        
        queue_handler = QueueLogHandler()
        queue_handler.setFormatter(logging.Formatter('%(message)s'))
        task_logger.addHandler(queue_handler)
        
        # 为根logger也添加队列处理器，以捕获tyutool内部的日志
        if debug_mode:
            root_logger.addHandler(queue_handler)
        
        # 创建烧录参数
        try:
            argv = FlashArgv(
                mode=params["operation"],
                device=params["chip"],
                port=port,
                baudrate=int(params["baudrate"]),
                start_addr=int(params["start_address"], 16),
                binfile=file_path or params.get("file_name", ""),
                length=int(params.get("data_length", "0x1000"), 16) if params["operation"] == "read" else None
            )
            
            # 参数检查
            if not flash_params_check(argv, logger=task_logger):
                return {"success": False, "error": "Parameter check failed"}
                
            # 获取芯片处理器
            handler_class = FlashInterface.get_flash_handler(params["chip"])
            if not handler_class:
                return {"success": False, "error": f"Unsupported chip: {params['chip']}"}
                
            # 创建进度处理器
            progress = WebProgressHandler(websocket_manager, port)
            
            # 创建烧录处理器
            handler = handler_class(argv, logger=task_logger, progress=progress)
            
            # 创建并启动烧录线程
            thread = threading.Thread(
                target=self._flash_task,
                args=(handler, params["operation"], argv.length, websocket_manager, port, task_logger, log_queue)
            )
            thread.daemon = True
            thread.start()
            
            # 保存任务信息
            self.active_tasks[port] = {
                "thread": thread,
                "handler": handler,
                "start_time": time.time(),
                "queue_handler": queue_handler,
                "debug_mode": debug_mode,
                "original_root_level": original_root_level,
                "log_queue": log_queue
            }
            
            return {"success": True, "message": f"Flash task started on {port}"}
            
        except Exception as e:
            self.logger.error(f"Failed to start flash task: {e}")
            return {"success": False, "error": str(e)}
            
    def stop_flash(self, port: str):
        """停止烧录任务"""
        if port not in self.active_tasks:
            return {"success": False, "error": "No active task on this port"}
            
        task = self.active_tasks[port]
        if task["thread"].is_alive():
            task["handler"].stop()
            task["thread"].join(timeout=5)
            
        del self.active_tasks[port]
        return {"success": True, "message": "Flash task stopped"}
        
    def _flash_task(self, handler, operation, read_length, websocket_manager, port, logger, log_queue):
        """烧录任务线程"""
        
        # 启动一个子线程来处理日志队列
        def process_logs():
            while True:
                try:
                    log_item = log_queue.get(timeout=0.1)
                    if log_item is None:  # 遇到None则退出
                        break
                    # 使用asyncio.run在子线程中发送消息
                    asyncio.run(websocket_manager.broadcast(json.dumps(log_item)))
                except queue.Empty:
                    continue
                except Exception as e:
                    print(f"Error processing log: {e}")
        
        log_thread = threading.Thread(target=process_logs)
        log_thread.daemon = True
        log_thread.start()
        
        try:
            handler.start()
            
            # 发送开始消息
            logger.info(f"Starting {operation} operation...")
            
            success = False
            if operation.lower() == "write":
                logger.debug("Starting write operation sequence")
                if handler.shake():
                    logger.info("Handshake successful")
                    
                    if handler.erase():
                        logger.info("Erase successful")
                        
                        if handler.write():
                            logger.info("Write successful")
                            
                            handler.crc_check()
                            success = True
                        else:
                            logger.error("Write failed")
                    else:
                        logger.error("Erase failed")
                else:
                    logger.error("Handshake failed")
                            
            elif operation.lower() == "read":
                logger.debug("Starting read operation sequence")
                if handler.shake():
                    logger.info("Handshake successful")
                    
                    if handler.read(read_length):
                        logger.info("Read successful")
                        
                        handler.crc_check()
                        success = True
                    else:
                        logger.error("Read failed")
                else:
                    logger.error("Handshake failed")
                        
            # 重启设备
            logger.debug("Rebooting device")
            handler.reboot()
            handler.serial_close()
            
            # 发送完成消息
            final_message = "Operation completed successfully" if success else "Operation failed"
            logger.info(final_message)
            asyncio.run(websocket_manager.broadcast(json.dumps({
                "type": "flash_complete",
                "port": port,
                "success": success,
                "message": final_message,
                "timestamp": time.time()
            })))
            
        except Exception as e:
            logger.error(f"Flash task error: {e}")
            asyncio.run(websocket_manager.broadcast(json.dumps({
                "type": "flash_error",
                "port": port,
                "error": str(e),
                "timestamp": time.time()
            })))
        finally:
            # 停止日志处理线程
            log_queue.put(None)
            log_thread.join(timeout=1)
            
            # 清理任务
            if port in self.active_tasks:
                task_info = self.active_tasks[port]
                # 恢复根logger的设置
                if task_info.get('debug_mode'):
                    root_logger = logging.getLogger()
                    root_logger.removeHandler(task_info['queue_handler'])
                    root_logger.setLevel(task_info.get('original_root_level', logging.INFO))
                del self.active_tasks[port]