'use client'

import { useState, useEffect, useRef } from 'react'

interface SerialPort {
  device: string
  name: string
  description: string
  manufacturer: string
}

interface SerialMessage {
  type: 'tx' | 'rx'
  port: string
  data: string
  hex_data?: string
  hex_mode?: boolean
  timestamp: number
}

export default function SerialAssistant() {
  const [ports, setPorts] = useState<SerialPort[]>([])
  const [selectedPort, setSelectedPort] = useState<string>('')
  const [baudrate, setBaudrate] = useState<string>('115200')
  const [databits, setDatabits] = useState<string>('8')
  const [parity, setParity] = useState<string>('N')
  const [stopbits, setStopbits] = useState<string>('1')
  const [isConnected, setIsConnected] = useState<boolean>(false)
  const [messages, setMessages] = useState<SerialMessage[]>([])
  const [sendText, setSendText] = useState<string>('')
  const [hexMode, setHexMode] = useState<boolean>(false)
  const [showTime, setShowTime] = useState<boolean>(false)
  const [showHex, setShowHex] = useState<boolean>(false)
  const [showColors, setShowColors] = useState<boolean>(true)
  const [addNewline, setAddNewline] = useState<boolean>(true)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false)
  const [saveToFile, setSaveToFile] = useState<boolean>(false)
  const [logFilePath, setLogFilePath] = useState<string>('monitor.log')
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    // 初始化WebSocket连接
    const ws = new WebSocket('ws://localhost:8000/ws')
    wsRef.current = ws

    ws.onopen = () => {
      console.log('WebSocket connected')
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'rx' || message.type === 'tx') {
          setMessages(prev => [...prev, message])
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
  }, [])

  const fetchPorts = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/ports')
      const data = await response.json()
      if (data.success) {
        setPorts(data.ports)
        // 如果当前没有选择端口且有可用端口，自动选择第一个
        if (!selectedPort && data.ports.length > 0) {
          setSelectedPort(data.ports[0].device)
        }
      }
    } catch (error) {
      console.error('Failed to fetch ports:', error)
    }
  }

  const connectSerial = async () => {
    if (!selectedPort) return
    
    try {
      const response = await fetch('http://localhost:8000/api/serial/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          port: selectedPort,
          baudrate: parseInt(baudrate),
          databits: parseInt(databits),
          parity,
          stopbits: parseFloat(stopbits),
          save_to_file: saveToFile,
          log_file_path: logFilePath
        }),
      })
      
      const data = await response.json()
      if (data.success) {
        setIsConnected(true)
      } else {
        alert(`连接失败: ${data.error}`)
      }
    } catch (error) {
      console.error('Failed to connect:', error)
      alert(`连接失败: ${error}`)
    }
  }

  const disconnectSerial = async () => {
    if (!selectedPort) return
    
    try {
      const response = await fetch('http://localhost:8000/api/serial/disconnect', {
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
        setIsConnected(false)
      }
    } catch (error) {
      console.error('Failed to disconnect:', error)
    }
  }

  const sendData = async () => {
    if (!selectedPort || !isConnected || !sendText.trim()) return
    
    try {
      const response = await fetch('http://localhost:8000/api/serial/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          port: selectedPort,
          text: sendText,
          hex_mode: hexMode,
          add_newline: addNewline
        }),
      })
      
      const data = await response.json()
      if (data.success) {
        setSendText('')
      } else {
        alert(`发送失败: ${data.error}`)
      }
    } catch (error) {
      console.error('Failed to send data:', error)
      alert(`发送失败: ${error}`)
    }
  }

  const clearMessages = () => {
    setMessages([])
  }

  const handleBrowseFile = async () => {
    try {
      // 尝试使用现代文件系统API
      if ('showSaveFilePicker' in window) {
        const fileHandle = await (window as unknown as { showSaveFilePicker: (options?: unknown) => Promise<{ name: string }> }).showSaveFilePicker({
          suggestedName: 'monitor.log',
          types: [{
            description: 'Log files',
            accept: {
              'text/plain': ['.log', '.txt'],
              'text/csv': ['.csv'],
              'application/json': ['.json']
            }
          }],
          excludeAcceptAllOption: false
        })
        
        // 尝试获取文件的完整路径信息
        // 虽然浏览器不会直接给出完整路径，但我们可以使用文件名和一些启发式方法
        const fileName = fileHandle.name
        
        // 如果用户选择了一个包含路径信息的文件名，我们尝试使用它
        if (fileName.includes('/') || fileName.includes('\\')) {
          setLogFilePath(fileName)
        } else {
          // 如果只是文件名，我们让用户选择保存位置
          const locationChoice = confirm(
            `已选择文件: ${fileName}\n\n` +
            '点击"确定"保存到用户目录下，\n' +
            '点击"取消"手动输入完整路径'
          )
          
          if (locationChoice) {
            // 保存到用户主目录
            setLogFilePath(`~/Desktop/${fileName}`)
          } else {
            // 手动输入路径
            const customPath = prompt(
              '请输入完整的文件路径:\n' +
              '例如: /home/用户名/Desktop/' + fileName + '\n' +
              '或: ~/Desktop/' + fileName,
              `~/Desktop/${fileName}`
            )
            if (customPath) {
              setLogFilePath(customPath)
            } else {
              setLogFilePath(fileName) // 使用默认
            }
          }
        }
      } else {
        // 降级方案：传统文件输入或手动输入
        const useFileInput = confirm(
          '您的浏览器不支持现代文件选择器。\n\n' +
          '点击"确定"使用文件输入框选择文件（仅获取文件名），\n' +
          '点击"取消"手动输入完整路径'
        )
        
        if (useFileInput) {
          fileInputRef.current?.click()
        } else {
          const fullPath = prompt(
            '请输入完整的日志文件路径:\n' +
            '例如: /home/用户名/Desktop/monitor.log\n' + 
            '或: ~/Desktop/monitor.log\n' +
            '或相对路径: logs/monitor.log',
            logFilePath
          )
          
          if (fullPath !== null && fullPath.trim() !== '') {
            setLogFilePath(fullPath)
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('File picker error:', error)
        // 如果API调用失败，回退到手动输入
        const fullPath = prompt(
          '文件选择器出错，请手动输入文件路径:\n' +
          '例如: /home/用户名/Desktop/monitor.log\n' + 
          '或: ~/Desktop/monitor.log',
          logFilePath
        )
        
        if (fullPath !== null && fullPath.trim() !== '') {
          setLogFilePath(fullPath)
        }
      }
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    // 这个函数现在主要作为备用方案
    const file = event.target.files?.[0]
    if (file) {
      setLogFilePath(file.name)
    }
  }

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleTimeString()
  }

  // ANSI 颜色代码映射
  const ansiColorMap: Record<string, string> = {
    '30': '#808080', // 黑色 (调整为灰色，在黑背景下可见)
    '31': '#ff5555', // 红色
    '32': '#55ff55', // 绿色
    '33': '#ffff55', // 黄色
    '34': '#5555ff', // 蓝色 (调整为亮蓝色，在黑背景下更易识别)
    '35': '#ff55ff', // 洋红
    '36': '#55ffff', // 青色
    '37': '#ffffff', // 白色
    '90': '#808080', // 亮黑色
    '91': '#ff8080', // 亮红色
    '92': '#80ff80', // 亮绿色
    '93': '#ffff80', // 亮黄色
    '94': '#8080ff', // 亮蓝色
    '95': '#ff80ff', // 亮洋红
    '96': '#80ffff', // 亮青色
    '97': '#ffffff', // 亮白色
  }

  // 解析ANSI转义序列并转换为HTML
  const parseAnsiColors = (text: string) => {
    const parts = []
    const ansiRegex = /\x1b\[([0-9;]*)m/g
    let lastIndex = 0
    let match
    let currentColor = ''

    while ((match = ansiRegex.exec(text)) !== null) {
      // 添加转义序列之前的文本
      if (match.index > lastIndex) {
        const textPart = text.substring(lastIndex, match.index)
        parts.push({
          text: textPart,
          color: currentColor
        })
      }

      // 处理ANSI代码
      const codes = match[1].split(';')
      for (const code of codes) {
        if (code === '0' || code === '') {
          // 重置
          currentColor = ''
        } else if (ansiColorMap[code]) {
          currentColor = ansiColorMap[code]
        }
      }

      lastIndex = ansiRegex.lastIndex
    }

    // 添加剩余文本
    if (lastIndex < text.length) {
      parts.push({
        text: text.substring(lastIndex),
        color: currentColor
      })
    }

    return parts
  }

  const formatMessage = (msg: SerialMessage) => {
    const time = showTime ? `[${formatTimestamp(msg.timestamp)}] ` : ''
    const direction = msg.type === 'tx' ? 'TX: ' : ''
    const data = showHex && msg.hex_data ? msg.hex_data : msg.data
    return { time, direction, data }
  }

  useEffect(() => {
    fetchPorts()
  }, [])

  // 全屏模式渲染
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col">
        <div className="flex justify-between items-center p-4 bg-gray-800 text-white">
          <h2 className="text-xl font-semibold">串口数据接收</h2>
          <div className="flex gap-4 items-center">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={showTime}
                onChange={(e) => setShowTime(e.target.checked)}
                className="mr-2"
              />
              显示时间
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={showHex}
                onChange={(e) => setShowHex(e.target.checked)}
                className="mr-2"
              />
              十六进制显示
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={showColors}
                onChange={(e) => setShowColors(e.target.checked)}
                className="mr-2"
              />
              彩色显示
            </label>
            <button
              onClick={clearMessages}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
              清空
            </button>
            <button
              onClick={() => setIsFullscreen(false)}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              退出全屏
            </button>
          </div>
        </div>
        <div className="flex-1 p-4 bg-black text-green-400 font-mono text-sm overflow-y-auto">
          {messages.map((msg, index) => {
            const formattedMsg = formatMessage(msg)
            
            return (
              <div key={index} className={msg.type === 'tx' ? 'text-yellow-400' : 'text-green-400'}>
                <span>{formattedMsg.time}</span>
                <span>{formattedMsg.direction}</span>
                {showColors ? (
                  // 显示彩色：解析ANSI颜色代码
                  parseAnsiColors(formattedMsg.data).map((part, partIndex) => (
                    <span 
                      key={partIndex}
                      style={{ color: part.color || 'inherit' }}
                    >
                      {part.text}
                    </span>
                  ))
                ) : (
                  // 不显示彩色：显示原始文本
                  <span>{formattedMsg.data}</span>
                )}
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto bg-white rounded-lg shadow-lg p-6">
      {/* 串口连接配置 */}
      <div className="mb-6 p-4 border rounded-lg bg-gray-50">
        <h2 className="text-lg font-semibold mb-4">串口配置</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <div className="col-span-1 md:col-span-2 lg:col-span-1 xl:col-span-2">
            <label className="block text-sm font-medium mb-1">端口</label>
            <div className="flex gap-2">
              <select 
                value={selectedPort} 
                onChange={(e) => setSelectedPort(e.target.value)}
                className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isConnected}
              >
                {ports.map(port => (
                  <option key={port.device} value={port.device}>
                    {port.device} - {port.description}
                  </option>
                ))}
              </select>
              <button 
                onClick={fetchPorts}
                className="flex-shrink-0 px-3 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 text-sm"
                disabled={isConnected}
              >
                刷新
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">波特率</label>
            <select 
              value={baudrate} 
              onChange={(e) => setBaudrate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isConnected}
            >
              <option value="9600">9600</option>
              <option value="19200">19200</option>
              <option value="38400">38400</option>
              <option value="57600">57600</option>
              <option value="115200">115200</option>
              <option value="230400">230400</option>
              <option value="460800">460800</option>
              <option value="921600">921600</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">数据位</label>
            <select 
              value={databits} 
              onChange={(e) => setDatabits(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isConnected}
            >
              <option value="5">5</option>
              <option value="6">6</option>
              <option value="7">7</option>
              <option value="8">8</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">校验位</label>
            <select 
              value={parity} 
              onChange={(e) => setParity(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isConnected}
            >
              <option value="N">None</option>
              <option value="E">Even</option>
              <option value="O">Odd</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">停止位</label>
            <select 
              value={stopbits} 
              onChange={(e) => setStopbits(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isConnected}
            >
              <option value="1">1</option>
              <option value="1.5">1.5</option>
              <option value="2">2</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">操作</label>
            <button
              onClick={isConnected ? disconnectSerial : connectSerial}
              className={`w-full px-4 py-2 rounded-md text-white font-medium ${
                isConnected 
                  ? 'bg-red-500 hover:bg-red-600' 
                  : 'bg-green-500 hover:bg-green-600'
              }`}
              disabled={!selectedPort}
            >
              {isConnected ? '断开' : '连接'}
            </button>
          </div>
        </div>
      </div>

      {/* 接收区域 */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold">接收数据</h2>
          <div className="flex gap-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={showTime}
                onChange={(e) => setShowTime(e.target.checked)}
                className="mr-2"
              />
              显示时间
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={showHex}
                onChange={(e) => setShowHex(e.target.checked)}
                className="mr-2"
              />
              十六进制显示
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={showColors}
                onChange={(e) => setShowColors(e.target.checked)}
                className="mr-2"
              />
              彩色显示
            </label>
            <button
              onClick={clearMessages}
              className="px-4 py-1 bg-gray-500 text-white rounded-md hover:bg-gray-600 text-sm"
            >
              清空
            </button>
            <button
              onClick={() => setIsFullscreen(true)}
              className="px-4 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm"
            >
              全屏显示
            </button>
          </div>
        </div>
        <div className="h-80 border border-gray-300 rounded-md p-3 bg-black text-green-400 font-mono text-sm overflow-y-auto">
          {messages.map((msg, index) => {
            const formattedMsg = formatMessage(msg)
            
            return (
              <div key={index} className={msg.type === 'tx' ? 'text-yellow-400' : 'text-green-400'}>
                <span>{formattedMsg.time}</span>
                <span>{formattedMsg.direction}</span>
                {showColors ? (
                  // 显示彩色：解析ANSI颜色代码
                  parseAnsiColors(formattedMsg.data).map((part, partIndex) => (
                    <span 
                      key={partIndex}
                      style={{ color: part.color || 'inherit' }}
                    >
                      {part.text}
                    </span>
                  ))
                ) : (
                  // 不显示彩色：显示原始文本
                  <span>{formattedMsg.data}</span>
                )}
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 日志保存配置 */}
      <div className="mb-6 p-4 border rounded-lg bg-gray-50">
        <h2 className="text-lg font-semibold mb-4">日志保存</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={saveToFile}
              onChange={(e) => setSaveToFile(e.target.checked)}
              className="mr-2"
            />
            启用日志保存
          </label>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium min-w-fit">文件路径:</label>
            <input
              type="text"
              value={logFilePath}
              onChange={(e) => setLogFilePath(e.target.value)}
              disabled={!saveToFile}
              placeholder="monitor.log"
              className="flex-1 px-3 py-1 border border-gray-300 rounded-md text-sm disabled:bg-gray-100 disabled:text-gray-500"
            />
            <input
              type="file"
              accept=".log,.txt"
              style={{ display: 'none' }}
              ref={fileInputRef}
              onChange={handleFileSelect}
            />
            <button
              type="button"
              onClick={handleBrowseFile}
              disabled={!saveToFile}
              className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm disabled:bg-gray-300 disabled:text-gray-500"
            >
              浏览
            </button>
          </div>
        </div>
      </div>

      {/* 发送区域 */}
      <div className="p-4 border rounded-lg bg-gray-50">
        <h2 className="text-lg font-semibold mb-4">发送数据</h2>
        <div className="flex gap-4 mb-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={hexMode}
              onChange={(e) => setHexMode(e.target.checked)}
              className="mr-2"
            />
            十六进制模式
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={addNewline}
              onChange={(e) => setAddNewline(e.target.checked)}
              className="mr-2"
            />
            自动添加换行符
          </label>
        </div>
        <div className="flex gap-2">
          <textarea
            value={sendText}
            onChange={(e) => setSendText(e.target.value)}
            placeholder={hexMode ? "输入十六进制数据 (如: 01 02 03 FF)" : "输入要发送的文本"}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 h-20 resize-none"
            disabled={!isConnected}
          />
          <button
            onClick={sendData}
            className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
            disabled={!isConnected || !sendText.trim()}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  )
}
