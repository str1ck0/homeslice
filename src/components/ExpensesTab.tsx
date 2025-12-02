'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

type Member = {
  id: string
  username: string
}

type Expense = {
  id: string
  title: string
  amount: number
  is_recurring: boolean
  recurrence_period: string | null
  created_at: string
  created_by: string
  split_with: string[]
  profiles: {
    username: string
  }
}

export default function ExpensesTab({ houseId }: { houseId: string }) {
  const { user } = useAuth()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadExpenses()
    loadMembers()
  }, [houseId])

  const loadExpenses = async () => {
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select(`
          *,
          profiles:created_by (username)
        `)
        .eq('house_id', houseId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setExpenses((data as any) || [])
    } catch (error) {
      console.error('Error loading expenses:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('house_members')
        .select(`
          user_id,
          profiles:user_id (
            id,
            username
          )
        `)
        .eq('house_id', houseId)

      if (error) throw error

      const membersList = (data as any)
        .map((item: any) => item.profiles)
        .filter(Boolean)
        .map((profile: any) => ({
          id: profile.id,
          username: profile.username,
        }))

      setMembers(membersList)
    } catch (error) {
      console.error('Error loading members:', error)
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading expenses...</div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Expenses</h2>
        <button
          onClick={() => setShowAddExpense(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
        >
          Add Expense
        </button>
      </div>

      {expenses.length === 0 ? (
        <div className="text-center py-12 text-gray-600 dark:text-gray-400">
          <p className="text-lg mb-2">No expenses yet</p>
          <p className="text-sm">Add your first expense to get started</p>
        </div>
      ) : (
        <div className="space-y-4">
          {expenses.map((expense) => (
            <div
              key={expense.id}
              className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                    {expense.title}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Added by {expense.profiles.username}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-gray-800 dark:text-gray-100">
                    ${expense.amount.toFixed(2)}
                  </p>
                  {expense.is_recurring && (
                    <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                      {expense.recurrence_period}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                <p>
                  Split between {expense.split_with.length} member{expense.split_with.length !== 1 ? 's' : ''}
                  {' - '}${(expense.amount / expense.split_with.length).toFixed(2)} each
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddExpense && (
        <AddExpenseModal
          houseId={houseId}
          members={members}
          userId={user!.id}
          onClose={() => setShowAddExpense(false)}
          onSuccess={() => {
            loadExpenses()
            setShowAddExpense(false)
          }}
        />
      )}
    </div>
  )
}

function AddExpenseModal({
  houseId,
  members,
  userId,
  onClose,
  onSuccess,
}: {
  houseId: string
  members: Member[]
  userId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrencePeriod, setRecurrencePeriod] = useState('monthly')
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (selectedMembers.length === 0) {
      setError('Please select at least one member')
      setLoading(false)
      return
    }

    try {
      const { data: expense, error: expenseError } = await supabase
        .from('expenses')
        .insert({
          house_id: houseId,
          created_by: userId,
          title,
          amount: parseFloat(amount),
          is_recurring: isRecurring,
          recurrence_period: isRecurring ? recurrencePeriod : null,
          split_with: selectedMembers,
        } as never)
        .select()
        .single()

      if (expenseError) throw expenseError

      const shareAmount = parseFloat(amount) / selectedMembers.length

      const payments = selectedMembers.map(memberId => ({
        expense_id: (expense as any).id,
        user_id: memberId,
        amount: shareAmount,
        paid: false,
      }))

      const { error: paymentsError } = await supabase
        .from('expense_payments')
        .insert(payments as never)

      if (paymentsError) throw paymentsError

      onSuccess()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create expense'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const toggleMember = (memberId: string) => {
    setSelectedMembers(prev =>
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-100">Add Expense</h2>
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
              placeholder="e.g., Wifi bill, Groceries"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Amount ($)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="0.00"
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="recurring"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="recurring" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
              Recurring expense
            </label>
          </div>

          {isRecurring && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Frequency
              </label>
              <select
                value={recurrencePeriod}
                onChange={(e) => setRecurrencePeriod(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Split with ({selectedMembers.length} selected)
            </label>
            <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2">
              {members.map((member) => (
                <div key={member.id} className="flex items-center">
                  <input
                    type="checkbox"
                    id={`member-${member.id}`}
                    checked={selectedMembers.includes(member.id)}
                    onChange={() => toggleMember(member.id)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <label
                    htmlFor={`member-${member.id}`}
                    className="ml-2 text-sm text-gray-700 dark:text-gray-300"
                  >
                    {member.username}
                  </label>
                </div>
              ))}
            </div>
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
              {loading ? 'Adding...' : 'Add Expense'}
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
