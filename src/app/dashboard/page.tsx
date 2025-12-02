'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type House = {
  id: string
  name: string
  address: string
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth()
  const [houses, setHouses] = useState<House[]>([])
  const [loading, setLoading] = useState(true)
  const [showJoinHouse, setShowJoinHouse] = useState(false)
  const [showCreateHouse, setShowCreateHouse] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth')
      return
    }

    if (user) {
      loadHouses()
    }
  }, [user, authLoading, router])

  const loadHouses = async () => {
    try {
      const { data, error } = await supabase
        .from('house_members')
        .select(`
          houses (
            id,
            name,
            address
          )
        `)
        .eq('user_id', user!.id)

      if (error) throw error

      const housesData = (data as any)
        .map((item: any) => item.houses)
        .filter(Boolean) as House[]

      setHouses(housesData)
    } catch (error) {
      console.error('Error loading houses:', error)
    } finally {
      setLoading(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-xl text-gray-700 dark:text-gray-300">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Your Houses
            </h1>
            <button
              onClick={() => router.push('/profile')}
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              Profile
            </button>
          </div>

          {houses.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
              <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-gray-100">
                Welcome to Homeslice!
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-8">
                You&apos;re not part of any house yet. Join an existing house or create a new one.
              </p>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => setShowJoinHouse(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition duration-200"
                >
                  Join House
                </button>
                <button
                  onClick={() => setShowCreateHouse(true)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition duration-200"
                >
                  Create House
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-4 mb-6">
                {houses.map((house) => (
                  <button
                    key={house.id}
                    onClick={() => router.push(`/house/${house.id}`)}
                    className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg hover:shadow-xl transition duration-200 text-left"
                  >
                    <h3 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-100">
                      {house.name}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">{house.address}</p>
                  </button>
                ))}
              </div>
              <div className="flex gap-4">
                <button
                  onClick={() => setShowJoinHouse(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition duration-200"
                >
                  Join Another House
                </button>
                <button
                  onClick={() => setShowCreateHouse(true)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 rounded-lg transition duration-200"
                >
                  Create New House
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showJoinHouse && (
        <JoinHouseModal
          onClose={() => setShowJoinHouse(false)}
          onSuccess={loadHouses}
        />
      )}

      {showCreateHouse && (
        <CreateHouseModal
          onClose={() => setShowCreateHouse(false)}
          onSuccess={loadHouses}
        />
      )}
    </div>
  )
}

function JoinHouseModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { user } = useAuth()
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data: house, error: houseError } = await supabase
        .from('houses')
        .select('id')
        .eq('invite_code', inviteCode.trim().toUpperCase())
        .single()

      if (houseError || !house) throw new Error('Invalid invite code')

      const { error: memberError } = await supabase
        .from('house_members')
        .insert({
          house_id: (house as any).id,
          user_id: user!.id,
        } as never)

      if (memberError) throw memberError

      onSuccess()
      onClose()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to join house'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full">
        <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-100">Join a House</h2>
        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Invite Code
            </label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white uppercase"
              placeholder="Enter invite code"
            />
          </div>
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
            >
              {loading ? 'Joining...' : 'Join'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold py-2 px-4 rounded-lg transition duration-200"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CreateHouseModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateInviteCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase()
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      console.log('User ID:', user?.id)
      console.log('User authenticated:', !!user)
      const inviteCode = generateInviteCode()
      console.log('Generated invite code:', inviteCode)

      const { data: house, error: houseError } = await supabase
        .from('houses')
        .insert({
          name,
          address,
          invite_code: inviteCode,
          created_by: user!.id,
        } as never)
        .select()
        .single()

      if (houseError) {
        console.error('Full house error:', JSON.stringify(houseError, null, 2))
        throw houseError
      }

      console.log('House created successfully:', house)

      const { error: memberError } = await supabase
        .from('house_members')
        .insert({
          house_id: (house as any).id,
          user_id: user!.id,
          is_admin: true,
        } as never)

      if (memberError) throw memberError

      onSuccess()
      onClose()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create house'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full">
        <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-100">Create a House</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              House Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="e.g., Van Breda House"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Address
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="20 Van Breda Street"
            />
          </div>
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold py-2 px-4 rounded-lg transition duration-200"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
