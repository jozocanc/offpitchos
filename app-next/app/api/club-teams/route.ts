import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const clubId = request.nextUrl.searchParams.get('clubId')
  const exclude = request.nextUrl.searchParams.get('exclude')

  if (!clubId) return NextResponse.json({ teams: [] })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ teams: [] })

  let query = supabase
    .from('teams')
    .select('id, name, age_group, invite_code')
    .eq('club_id', clubId)
    .order('age_group')

  if (exclude) {
    query = query.neq('id', exclude)
  }

  const { data: teams } = await query

  return NextResponse.json({ teams: teams ?? [] })
}
