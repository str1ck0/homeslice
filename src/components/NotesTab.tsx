'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

type Note = {
  id: string
  title: string
  content: string
  category: string
  created_by: string
  created_at: string
  profiles: {
    username: string
  }
}

export default function NotesTab({ houseId }: { houseId: string }) {
  const { user } = useAuth()
  const [notes, setNotes] = useState<Note[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [showAddNote, setShowAddNote] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadNotes()
  }, [houseId])

  const loadNotes = async () => {
    try {
      const { data, error } = await supabase
        .from('notes')
        .select(`
          *,
          profiles:created_by (username)
        `)
        .eq('house_id', houseId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setNotes((data as any) || [])
    } catch (error) {
      console.error('Error loading notes:', error)
    } finally {
      setLoading(false)
    }
  }

  const deleteNote = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return

    try {
      const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', noteId)
        .eq('created_by', user!.id)

      if (error) throw error
      loadNotes()
    } catch (error) {
      console.error('Error deleting note:', error)
      alert('Failed to delete note')
    }
  }

  const filteredNotes = filter === 'all'
    ? notes
    : notes.filter(note => note.category === filter)

  const categories = ['all', 'shopping', 'reminder', 'info', 'maintenance', 'general']

  if (loading) {
    return <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading notes...</div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Notes & Knowledge Base</h2>
        <button
          onClick={() => setShowAddNote(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
        >
          Add Note
        </button>
      </div>

      <div className="mb-6 flex gap-2 flex-wrap">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setFilter(category)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === category
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            {category.charAt(0).toUpperCase() + category.slice(1)}
          </button>
        ))}
      </div>

      {filteredNotes.length === 0 ? (
        <div className="text-center py-12 text-gray-600 dark:text-gray-400">
          <p className="text-lg mb-2">No notes yet</p>
          <p className="text-sm">Add shopping lists, reminders, or important house information</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredNotes.map((note) => (
            <div
              key={note.id}
              className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                      {note.title}
                    </h3>
                    <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                      {note.category}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    By {note.profiles.username} • {new Date(note.created_at).toLocaleDateString()}
                  </p>
                </div>
                {note.created_by === user?.id && (
                  <button
                    onClick={() => deleteNote(note.id)}
                    className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm"
                  >
                    Delete
                  </button>
                )}
              </div>
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {note.content}
              </p>
            </div>
          ))}
        </div>
      )}

      {showAddNote && (
        <AddNoteModal
          houseId={houseId}
          userId={user!.id}
          onClose={() => setShowAddNote(false)}
          onSuccess={() => {
            loadNotes()
            setShowAddNote(false)
          }}
        />
      )}
    </div>
  )
}

function AddNoteModal({
  houseId,
  userId,
  onClose,
  onSuccess,
}: {
  houseId: string
  userId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('general')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error: noteError } = await supabase
        .from('notes')
        .insert({
          house_id: houseId,
          created_by: userId,
          title,
          content,
          category,
        } as never)

      if (noteError) throw noteError
      onSuccess()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create note'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full">
        <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-100">Add Note</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="e.g., Shopping List, Alarm Code"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="general">General</option>
              <option value="shopping">Shopping</option>
              <option value="reminder">Reminder</option>
              <option value="info">Info</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Content
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={6}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="Write your note here..."
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
              {loading ? 'Adding...' : 'Add Note'}
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
