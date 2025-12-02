'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import ExpensesTab from '@/components/ExpensesTab'
import NotesTab from '@/components/NotesTab'
import MembersTab from '@/components/MembersTab'

type House = {
  id: string
  name: string
  address: string
  invite_code: string
}

type Tab = 'expenses' | 'notes' | 'members'

export default function HousePage() {
  const { user, loading: authLoading, signOut } = useAuth()
  const [house, setHouse] = useState<House | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('expenses')
  const router = useRouter()
  const params = useParams()
  const houseId = params.id as string

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth')
      return
    }

    if (user && houseId) {
      loadHouse()
    }
  }, [user, authLoading, houseId, router])

  const loadHouse = async () => {
    try {
      const { data, error } = await supabase
        .from('houses')
        .select('*')
        .eq('id', houseId)
        .single()

      if (error) throw error
      setHouse(data)
    } catch (error) {
      console.error('Error loading house:', error)
      router.push('/dashboard')
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    router.push('/')
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-xl text-gray-700 dark:text-gray-300">Loading...</div>
      </div>
    )
  }

  if (!house) return null

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <nav className="bg-white dark:bg-gray-800 shadow-md">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <button
                onClick={() => router.push('/dashboard')}
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 text-sm mr-4"
              >
                ← Back to Houses
              </button>
              <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 inline-block">
                {house.name}
              </h1>
            </div>
            <div className="flex gap-4 items-center">
              <button
                onClick={() => router.push('/profile')}
                className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Profile
              </button>
              <button
                onClick={handleSignOut}
                className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex">
              <button
                onClick={() => setActiveTab('expenses')}
                className={`px-6 py-4 font-medium transition-colors ${
                  activeTab === 'expenses'
                    ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                Expenses
              </button>
              <button
                onClick={() => setActiveTab('notes')}
                className={`px-6 py-4 font-medium transition-colors ${
                  activeTab === 'notes'
                    ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                Notes
              </button>
              <button
                onClick={() => setActiveTab('members')}
                className={`px-6 py-4 font-medium transition-colors ${
                  activeTab === 'members'
                    ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                Members
              </button>
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'expenses' && <ExpensesTab houseId={houseId} />}
            {activeTab === 'notes' && <NotesTab houseId={houseId} />}
            {activeTab === 'members' && <MembersTab houseId={houseId} inviteCode={house.invite_code} />}
          </div>
        </div>
      </div>
    </div>
  )
}
