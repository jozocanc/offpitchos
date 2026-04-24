'use client'

import { useState, useEffect } from 'react'
import { setCampDetails, getCampRegistrations, togglePayment, sendCampPaymentReminders } from './actions'
import { useToast } from '@/components/toast'

interface Camp {
  eventId: string
  title: string
  detailId: string | null
  feeCents: number
  capacity: number | null
}

interface Registration {
  id: string
  payment_status: string
  created_at: string
  players: {
    first_name: string
    last_name: string
    teams: { name: string } | { name: string }[] | null
  } | null
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

export default function CampDetailModal({ camp, onClose }: { camp: Camp; onClose: () => void }) {
  const [fee, setFee] = useState(String(camp.feeCents / 100))
  const [capacity, setCapacity] = useState(camp.capacity ? String(camp.capacity) : '')
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [nudging, setNudging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    getCampRegistrations(camp.eventId)
      .then(data => setRegistrations(data.registrations as unknown as Registration[]))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [camp.eventId])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const feeCents = Math.round(parseFloat(fee || '0') * 100)
      const cap = capacity ? parseInt(capacity) : null
      if (feeCents < 0) throw new Error('Fee cannot be negative')
      if (cap !== null && cap < 1) throw new Error('Capacity must be at least 1')

      await setCampDetails({ eventId: camp.eventId, feeCents, capacity: cap })
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleTogglePayment(regId: string) {
    try {
      await togglePayment(regId)
      setRegistrations(prev =>
        prev.map(r => r.id === regId
          ? { ...r, payment_status: r.payment_status === 'paid' ? 'unpaid' : 'paid' }
          : r
        )
      )
    } catch {}
  }

  async function handleNudgeUnpaid() {
    if (nudging) return
    setNudging(true)
    try {
      const result = await sendCampPaymentReminders(camp.eventId)
      if (result.nudged === 0 && result.skipped === 0) {
        toast('No unpaid registrations', 'success')
      } else if (result.nudged === 0) {
        toast(`Couldn't nudge anyone — ${result.skipped} unlinked player(s)`, 'error')
      } else if (result.emailFailed >= result.nudged) {
        // Every email bounced. Push still went out, so the data action
        // completed, but the parents who check email first won't see it.
        toast(
          `Reminders sent to ${result.nudged} parent${result.nudged === 1 ? '' : 's'}, but emails didn't deliver. Push notifications went out — nudge again in a few minutes to retry emails.`,
          'error',
        )
      } else {
        const parts = [`Nudged ${result.nudged} parent${result.nudged === 1 ? '' : 's'}`]
        if (result.skipped > 0) parts.push(`skipped ${result.skipped} unlinked`)
        if (result.emailFailed > 0) parts.push(`${result.emailFailed} email${result.emailFailed === 1 ? '' : 's'} failed`)
        toast(parts.join(' · '), result.emailFailed > 0 ? 'error' : 'success')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send reminders'
      toast(msg, 'error')
    } finally {
      setNudging(false)
    }
  }

  const paidCount = registrations.filter(r => r.payment_status === 'paid').length
  const unpaidCount = registrations.length - paidCount
  const feeCents = Math.round(parseFloat(fee || '0') * 100)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-dark-secondary rounded-2xl p-8 w-full max-w-lg border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-6">{camp.title}</h2>

        {/* Fee & Capacity */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray mb-2">Fee ($)</label>
            <input
              type="number"
              value={fee}
              onChange={e => setFee(e.target.value)}
              min="0"
              step="0.01"
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray mb-2">Capacity</label>
            <input
              type="number"
              value={capacity}
              onChange={e => setCapacity(e.target.value)}
              min="1"
              placeholder="Unlimited"
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 mb-6"
        >
          {saving ? 'Saving...' : 'Save Details'}
        </button>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {/* Registrations */}
        <div className="border-t border-white/5 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-white">Registrations ({registrations.length})</h3>
            {feeCents > 0 && (
              <span className="text-xs text-green">
                {formatCurrency(paidCount * feeCents)} / {formatCurrency(registrations.length * feeCents)}
              </span>
            )}
          </div>

          {/* Nudge unpaid parents — one-click push + email reminder. Skips
              registrations whose player.parent_id is still the DOC (unlinked),
              and reports the count so the DOC knows who couldn't be reached. */}
          {camp.feeCents > 0 && unpaidCount > 0 && (
            <div className="mb-3 bg-yellow-400/5 border border-yellow-400/20 rounded-lg p-3 flex items-center justify-between gap-3">
              <p className="text-xs text-yellow-400">
                {unpaidCount} unpaid · {formatCurrency(unpaidCount * feeCents)} outstanding
              </p>
              <button
                onClick={handleNudgeUnpaid}
                disabled={nudging}
                className="text-xs font-bold bg-yellow-400/20 text-yellow-400 px-3 py-1.5 rounded-lg hover:bg-yellow-400/30 transition-colors disabled:opacity-50"
              >
                {nudging ? 'Sending…' : 'Nudge unpaid parents'}
              </button>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-gray">Loading...</p>
          ) : registrations.length === 0 ? (
            <p className="text-sm text-gray">No registrations yet.</p>
          ) : (
            <div className="space-y-2">
              {registrations.map(reg => (
                <div key={reg.id} className="flex items-center justify-between bg-dark rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm text-white">
                      {(reg as any).guest_kid_name
                        ? (reg as any).guest_kid_name
                        : `${reg.players?.first_name} ${reg.players?.last_name}`}
                    </p>
                    <p className="text-xs text-gray">
                      {(reg as any).guest_parent_name
                        ? `Guest — ${(reg as any).guest_parent_name}`
                        : (() => {
                            const t = reg.players?.teams
                            if (!t) return ''
                            return Array.isArray(t) ? (t[0]?.name ?? '') : t.name
                          })()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleTogglePayment(reg.id)}
                    className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                      reg.payment_status === 'paid'
                        ? 'bg-green/10 text-green'
                        : 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
                    }`}
                  >
                    {reg.payment_status === 'paid' ? 'Paid' : 'Unpaid'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 bg-dark border border-white/10 text-gray font-medium py-3 rounded-xl hover:text-white transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  )
}
