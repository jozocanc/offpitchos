import { redirect } from 'next/navigation'
import { createBlankDrill } from '../actions'

export default async function NewDrillPage({ searchParams }: { searchParams: Promise<{ teamId?: string }> }) {
  const { teamId } = await searchParams
  const id = await createBlankDrill(teamId ?? null)
  redirect(`/dashboard/tactics/${id}`)
}
