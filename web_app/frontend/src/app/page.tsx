'use client'

import { useState } from 'react'
import SerialAssistant from '@/components/SerialAssistant'
import FlashTool from '@/components/FlashTool'

export default function Home() {
  const [activeTab, setActiveTab] = useState<'flash' | 'serial'>('flash')

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">
          TyuTool Web
        </h1>
        
        {/* Tab导航 */}
        <div className="flex justify-center mb-6">
          <div className="bg-white rounded-lg shadow-md p-1 inline-flex">
            <button
              onClick={() => setActiveTab('flash')}
              className={`px-6 py-2 rounded-md font-medium transition-colors ${
                activeTab === 'flash'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Flash
            </button>
            <button
              onClick={() => setActiveTab('serial')}
              className={`px-6 py-2 rounded-md font-medium transition-colors ${
                activeTab === 'serial'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Serial
            </button>
          </div>
        </div>

        {/* Tab内容 */}
        <div>
          {activeTab === 'flash' && <FlashTool />}
          {activeTab === 'serial' && <SerialAssistant />}
        </div>
      </div>
    </div>
  )
}
