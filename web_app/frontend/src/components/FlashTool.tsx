'use client'

import { useState, useEffect, useRef } from 'react'

interface ChipInfo {
  name: string
  baudrate: number
  modules: { [key: string]: { url: string; pic: string } }
}

interface FlashLogMessage {
  type: 'flash_log'
  port: string
  message: string
  level?: string
  timestamp: number
}

export default function FlashTool() {
  // 状态定义
  const [operation, setOperation] = useState<'write' | 'read'>('write')
  const [selectedChip, setSelectedChip] = useState<string>('')
  const [selectedModule, setSelectedModule] = useState<string>('')
  const [selectedPort, setSelectedPort] = useState<string>('')
  const [baudrate, setBaudrate] = useState<string>('921600')
  const [startAddress, setStartAddress] = useState<string>('0x00')
  const [dataLength, setDataLength] = useState<string>('0x200000')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [isFlashing, setIsFlashing] = useState<boolean>(false)
  const [progress, setProgress] = useState<number>(0)
  const [progressHeader, setProgressHeader] = useState<string>('')
  const [logs, setLogs] = useState<string[]>([])
  const [ports, setPorts] = useState<any[]>([])
  const [chips, setChips] = useState<{ [key: string]: ChipInfo }>({})
  const [moduleUrl, setModuleUrl] = useState<string>('')
  const [modulePic, setModulePic] = useState<string>('')
  const [uploadedFilePath, setUploadedFilePath] = useState<string>('')
  const [debugMode, setDebugMode] = useState<boolean>(false)
  const [autoScroll, setAutoScroll] = useState<boolean>(true)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const logsContainerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  // 从后端获取芯片列表
  const fetchChips = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/chips')
      const data = await response.json()
      if (data.success) {
        setChips(data.chips)
      }
    } catch (error) {
      console.error('Failed to fetch chips:', error)
    }
  }

  // 获取串口列表
  const fetchPorts = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/ports')
      const data = await response.json()
      if (data.success) {
        setPorts(data.ports)
      }
    } catch (error) {
      console.error('Failed to fetch ports:', error)
    }
  }

  // 选择芯片时更新模块列表和波特率
  useEffect(() => {
    if (selectedChip && chips[selectedChip]) {
      const chip = chips[selectedChip]
      setBaudrate(chip.baudrate.toString())
      
      // 自动选择第一个模块
      const modules = Object.keys(chip.modules)
      if (modules.length > 0) {
        setSelectedModule(modules[0])
        const moduleInfo = chip.modules[modules[0]]
        setModuleUrl(moduleInfo.url)
        setModulePic(moduleInfo.pic)
      }
    }
  }, [selectedChip])

  // 选择模块时更新图片和链接
  useEffect(() => {
    if (selectedChip && selectedModule && chips[selectedChip]?.modules[selectedModule]) {
      const moduleInfo = chips[selectedChip].modules[selectedModule]
      setModuleUrl(moduleInfo.url)
      setModulePic(moduleInfo.pic)
    }
  }, [selectedModule])

  // 文件选择处理
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setFileName(file.name)
      
      // 上传文件到服务器
      const formData = new FormData()
      formData.append('file', file)
      
      try {
        const response = await fetch('http://localhost:8000/api/flash/upload', {
          method: 'POST',
          body: formData
        })
        
        const data = await response.json()
        if (data.success) {
          setUploadedFilePath(data.file_path)
          addLog(`文件已上传: ${data.filename}`)
        } else {
          alert(`文件上传失败: ${data.error}`)
        }
      } catch (error) {
        console.error('Failed to upload file:', error)
        alert('文件上传失败')
      }
    }
  }

  // 开始烧录/读取
  const handleStart = async () => {
    if (!selectedPort || !selectedChip) {
      alert('请选择端口和芯片')
      return
    }
    
    if (operation === 'write' && !uploadedFilePath) {
      alert('请选择要烧录的文件')
      return
    }

    setIsFlashing(true)
    setProgress(0)
    setLogs([])  // 清空日志
    addLog(`开始${operation === 'write' ? '烧录' : '读取'}...`)
    addLog(`芯片: ${selectedChip}`)
    addLog(`端口: ${selectedPort}`)
    addLog(`波特率: ${baudrate}`)
    
    try {
      const response = await fetch('http://localhost:8000/api/flash/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operation,
          chip: selectedChip,
          port: selectedPort,
          baudrate,
          start_address: startAddress,
          data_length: dataLength,
          file_path: uploadedFilePath,
          file_name: fileName,
          debug_mode: debugMode
        }),
      })
      
      const data = await response.json()
      if (!data.success) {
        alert(`启动失败: ${data.error}`)
        setIsFlashing(false)
      }
    } catch (error) {
      console.error('Failed to start flash:', error)
      alert('启动失败')
      setIsFlashing(false)
    }
  }

  // 停止烧录
  const handleStop = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/flash/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          port: selectedPort
        }),
      })
      
      const data = await response.json()
      if (data.success) {
        setIsFlashing(false)
        setProgress(0)
        addLog('操作已停止')
      }
    } catch (error) {
      console.error('Failed to stop flash:', error)
    }
  }

  // 添加日志
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [...prev, `[${timestamp}] ${message}`])
  }

  // 自动滚动到底部（仅当autoScroll为true时）
  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      // 使用requestAnimationFrame确保DOM更新完成后再滚动
      requestAnimationFrame(() => {
        if (logsContainerRef.current) {
          logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight
        }
      })
    }
  }, [logs, autoScroll])

  // 处理日志容器滚动事件
  const handleLogScroll = () => {
    if (!logsContainerRef.current) return
    
    const container = logsContainerRef.current
    const threshold = 50 // 增加阈值，让判断更宽松
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold
    
    // 如果用户滚动到底部，启用自动滚动；否则禁用
    setAutoScroll(isAtBottom)
  }

  // WebSocket连接处理
  useEffect(() => {
    // 初始化WebSocket连接
    const ws = new WebSocket('ws://localhost:8000/ws')
    wsRef.current = ws

    ws.onopen = () => {
      console.log('WebSocket connected for flash')
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        
        // 处理烧录进度
        if (message.type === 'flash_progress' && message.port === selectedPort) {
          setProgress(message.progress)
          setProgressHeader(message.header)
        }
        
        // 处理烧录日志
        if (message.type === 'flash_log' && message.port === selectedPort) {
          const logLevel = message.level || 'INFO'
          addLog(`[${logLevel}] ${message.message}`)
        }
        
        // 处理烧录完成
        if (message.type === 'flash_complete' && message.port === selectedPort) {
          setIsFlashing(false)
          setProgress(100)
          addLog(message.success ? '操作成功完成！' : '操作失败')
          
          // 如果是读取操作且成功，提供下载链接
          if (operation === 'read' && message.success) {
            const downloadUrl = `http://localhost:8000/api/flash/download/${fileName}`
            addLog(`文件已保存，可以下载: ${downloadUrl}`)
          }
        }
        
        // 处理错误
        if (message.type === 'flash_error' && message.port === selectedPort) {
          setIsFlashing(false)
          addLog(`错误: ${message.error}`)
        }
      } catch (e) {
        console.error('Parse message error:', e)
      }
    }

    ws.onclose = () => {
      console.log('WebSocket disconnected')
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }

    return () => {
      ws.close()
    }
  }, [selectedPort, operation, fileName])

  useEffect(() => {
    fetchPorts()
    fetchChips()
  }, [])

  return (
    <div className="max-w-7xl mx-auto bg-white rounded-lg shadow-lg p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左侧: Downloader配置 */}
        <div className="border rounded-lg p-4 bg-gray-50">
          <h2 className="text-lg font-semibold mb-4">Downloader</h2>
          
          {/* 操作选择 */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">操作</label>
            <select 
              value={operation}
              onChange={(e) => setOperation(e.target.value as 'write' | 'read')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isFlashing}
            >
              <option value="write">Write</option>
              <option value="read">Read</option>
            </select>
          </div>

          {/* 文件选择 */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">文件</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={fileName}
                placeholder={operation === 'write' ? '选择要烧录的文件' : '保存文件名'}
                onChange={(e) => setFileName(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isFlashing || operation === 'write'}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept=".bin"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                onClick={() => operation === 'write' && fileInputRef.current?.click()}
                className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
                disabled={isFlashing || operation === 'read'}
              >
                浏览
              </button>
            </div>
          </div>

          {/* 端口选择 */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">端口</label>
            <div className="flex gap-2">
              <select
                value={selectedPort}
                onChange={(e) => setSelectedPort(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isFlashing}
              >
                {ports.map(port => (
                  <option key={port.device} value={port.device}>
                    {port.device} - {port.description}
                  </option>
                ))}
              </select>
              <button
                onClick={fetchPorts}
                className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
                disabled={isFlashing}
              >
                刷新
              </button>
            </div>
          </div>

          {/* 波特率 */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">波特率</label>
            <select
              value={baudrate}
              onChange={(e) => setBaudrate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isFlashing}
            >
              <option value="115200">115200</option>
              <option value="230400">230400</option>
              <option value="460800">460800</option>
              <option value="921600">921600</option>
              <option value="1500000">1500000</option>
              <option value="2000000">2000000</option>
            </select>
          </div>

          {/* 起始地址 */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">起始地址</label>
            <input
              type="text"
              value={startAddress}
              onChange={(e) => setStartAddress(e.target.value)}
              placeholder="0x00"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isFlashing}
            />
          </div>

          {/* 数据长度 (仅读取模式) */}
          {operation === 'read' && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">数据长度</label>
              <input
                type="text"
                value={dataLength}
                onChange={(e) => setDataLength(e.target.value)}
                placeholder="0x200000"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isFlashing}
              />
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-4">
            <button
              onClick={handleStart}
              className="flex-1 px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
              disabled={isFlashing}
            >
              开始
            </button>
            <button
              onClick={handleStop}
              className="flex-1 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
              disabled={!isFlashing}
            >
              停止
            </button>
          </div>
        </div>

        {/* 右侧: ChipView配置 */}
        <div className="border rounded-lg p-4 bg-gray-50">
          <h2 className="text-lg font-semibold mb-4">ChipView</h2>
          
          {/* 芯片选择 */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">芯片</label>
            <select
              value={selectedChip}
              onChange={(e) => setSelectedChip(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isFlashing}
            >
              <option value="">选择芯片</option>
              {Object.keys(chips).map(chip => (
                <option key={chip} value={chip}>{chip}</option>
              ))}
            </select>
          </div>

          {/* 模块选择 */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">模块</label>
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isFlashing || !selectedChip}
            >
              {selectedChip && chips[selectedChip]?.modules && 
                Object.keys(chips[selectedChip].modules).map(module => (
                  <option key={module} value={module}>{module}</option>
                ))
              }
            </select>
          </div>

          {/* 模块链接 */}
          {moduleUrl && (
            <div className="mb-4 text-right">
              <a 
                href={moduleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-700 underline text-sm"
              >
                查看模块文档
              </a>
            </div>
          )}

          {/* 模块图片 */}
          {modulePic && (
            <div className="flex justify-center">
              <img 
                src={modulePic}
                alt={selectedModule}
                className="max-w-[200px] max-h-[200px] object-contain border rounded"
              />
            </div>
          )}
        </div>
      </div>

      {/* 进度条 */}
      <div className="mt-6">
        {progressHeader && (
          <div className="text-sm text-gray-600 mb-1">{progressHeader}</div>
        )}
        <div className="w-full bg-gray-200 rounded-full h-6">
          <div 
            className="bg-blue-500 h-6 rounded-full transition-all duration-300 flex items-center justify-center text-white text-sm"
            style={{ width: `${progress}%` }}
          >
            {progress > 0 && `${progress}%`}
          </div>
        </div>
      </div>

      {/* 日志显示区域 */}
      <div className="mt-6">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-semibold">日志输出</h3>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={debugMode}
              onChange={(e) => setDebugMode(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm">Debug模式</span>
          </label>
        </div>
        <div 
          ref={logsContainerRef}
          onScroll={handleLogScroll}
          className="h-48 border border-gray-300 rounded-md p-3 bg-black font-mono text-sm overflow-y-auto relative"
        >
          {logs.map((log, index) => {
            let textColor = 'text-green-400'
            if (log.includes('[DEBUG]')) {
              textColor = 'text-gray-400'
            } else if (log.includes('[WARNING]')) {
              textColor = 'text-yellow-400'
            } else if (log.includes('[ERROR]')) {
              textColor = 'text-red-400'
            }
            return (
              <div key={index} className={textColor}>{log}</div>
            )
          })}
          <div ref={logsEndRef} />
          {/* 显示自动滚动状态提示 */}
          {!autoScroll && logs.length > 0 && (
            <div className="sticky bottom-0 right-0 flex justify-end p-1">
              <button
                onClick={() => {
                  setAutoScroll(true)
                  // 使用requestAnimationFrame确保滚动生效
                  requestAnimationFrame(() => {
                    if (logsContainerRef.current) {
                      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight
                    }
                  })
                }}
                className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-2 py-1 rounded shadow-lg"
                title="滚动到底部"
              >
                ↓ 滚动到底部
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}