'use client'

import SerialAssistant from '@/components/SerialAssistant'

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">
          TyuTool Web - 串口助手
        </h1>
        <SerialAssistant />
      </div>
    </div>
  )
}
