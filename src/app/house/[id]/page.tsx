'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import ExpensesTab from '@/components/ExpensesTab'
import NotesTab from '@/components/NotesTab'
import MembersTab from '@/components/MembersTab'
import { compressImage } from '@/lib/image-utils'

type House = {
  id: string
  name: string
  address: string
  invite_code: string
  avatar_url: string | null
}

type Tab = 'expenses' | 'notes' | 'members'

export default function HousePage() {
  const { user, loading: authLoading, signOut } = useAuth()
  const [house, setHouse] = useState<House | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
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

  const uploadHouseAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true)

      if (!event.target.files || event.target.files.length === 0) {
        return
      }

      const file = event.target.files[0]
      const compressedFile = await compressImage(file)

      const fileExt = 'jpg'
      const filePath = `house-${houseId}-${Math.random()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, compressedFile, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      const { error: updateError } = await supabase
        .from('houses')
        .update({ avatar_url: publicUrl } as never)
        .eq('id', houseId)

      if (updateError) throw updateError

      loadHouse()
    } catch (err: unknown) {
      console.error('Error uploading house avatar:', err)
      alert('Failed to upload house avatar')
    } finally {
      setUploading(false)
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
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 text-sm"
              >
                ← Back to Houses
              </button>
              <label className="cursor-pointer group">
                {house.avatar_url ? (
                  <img
                    src={house.avatar_url}
                    alt={`${house.name} avatar`}
                    className="w-12 h-12 rounded-full object-cover ring-2 ring-gray-200 dark:ring-gray-700 group-hover:ring-blue-500 transition"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg ring-2 ring-gray-200 dark:ring-gray-700 group-hover:ring-blue-500 transition">
                    {house.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={uploadHouseAvatar}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
              <div>
                <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                  {house.name}
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">Click avatar to change</p>
              </div>
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
