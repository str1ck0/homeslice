'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

type Member = {
  id: string
  username: string
  avatar_url: string | null
  joined_at: string
  is_home: boolean
}

export default function MembersTab({ houseId, inviteCode }: { houseId: string; inviteCode: string }) {
  const { user } = useAuth()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [showInviteCode, setShowInviteCode] = useState(false)

  useEffect(() => {
    loadMembers()

    const interval = setInterval(() => {
      loadMembers()
    }, 30000)

    return () => clearInterval(interval)
  }, [houseId])

  const loadMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('house_members')
        .select(`
          user_id,
          joined_at,
          profiles:user_id (
            id,
            username,
            avatar_url
          )
        `)
        .eq('house_id', houseId)
        .order('joined_at', { ascending: true })

      if (error) throw error

      const memberIds = (data as any).map((item: any) => item.profiles.id)

      const { data: presenceData } = await supabase
        .from('member_presence')
        .select('user_id, is_home')
        .eq('house_id', houseId)
        .in('user_id', memberIds)

      const presenceMap = new Map(
        (presenceData as any)?.map((p: any) => [p.user_id, p.is_home]) || []
      )

      const membersList = (data as any).map((item: any) => {
        const profile = item.profiles
        return {
          id: profile.id,
          username: profile.username,
          avatar_url: profile.avatar_url,
          joined_at: item.joined_at,
          is_home: presenceMap.get(profile.id) || false,
        }
      })

      setMembers(membersList)
    } catch (error) {
      console.error('Error loading members:', error)
    } finally {
      setLoading(false)
    }
  }

  const togglePresence = async () => {
    try {
      const currentMember = members.find(m => m.id === user!.id)
      const newStatus = !currentMember?.is_home

      const { error } = await supabase
        .from('member_presence')
        .upsert({
          user_id: user!.id,
          house_id: houseId,
          is_home: newStatus,
          last_updated: new Date().toISOString(),
        } as never)

      if (error) throw error
      loadMembers()
    } catch (error) {
      console.error('Error updating presence:', error)
      alert('Failed to update presence')
    }
  }

  const copyInviteCode = () => {
    navigator.clipboard.writeText(inviteCode)
    alert('Invite code copied to clipboard!')
  }

  if (loading) {
    return <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading members...</div>
  }

  const currentMember = members.find(m => m.id === user?.id)
  const homeCount = members.filter(m => m.is_home).length

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">House Members</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {homeCount} of {members.length} member{members.length !== 1 ? 's' : ''} home
          </p>
        </div>
        <button
          onClick={() => setShowInviteCode(!showInviteCode)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
        >
          Invite Code
        </button>
      </div>

      {showInviteCode && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg mb-6">
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
            Share this code with new housemates:
          </p>
          <div className="flex gap-2">
            <code className="flex-1 bg-white dark:bg-gray-800 px-4 py-2 rounded text-xl font-mono text-center">
              {inviteCode}
            </code>
            <button
              onClick={copyInviteCode}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition duration-200"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-100">Your Status</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Currently: {currentMember?.is_home ? '🏠 At home' : '🚶 Away'}
            </p>
          </div>
          <button
            onClick={togglePresence}
            className={`font-semibold py-2 px-6 rounded-lg transition duration-200 ${
              currentMember?.is_home
                ? 'bg-orange-600 hover:bg-orange-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {currentMember?.is_home ? 'Check Out' : 'Check In'}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {members.map((member) => (
          <div
            key={member.id}
            className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-lg">
                {member.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 dark:text-gray-100">
                  {member.username}
                  {member.id === user?.id && (
                    <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">(You)</span>
                  )}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Joined {new Date(member.joined_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="text-right">
              {member.is_home ? (
                <span className="text-green-600 dark:text-green-400 font-medium">🏠 Home</span>
              ) : (
                <span className="text-gray-400 dark:text-gray-500">Away</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
