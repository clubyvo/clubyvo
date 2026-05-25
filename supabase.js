// ============================================================
// clubyvo — Supabase integration
// Handles: auth (Google/Spotify/Apple) + reviews CRUD + anti-fraud
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// ① Replace these with your real values from supabase.com → Project Settings → API
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co'
const SUPABASE_ANON_KEY = 'YOUR_ANON_PUBLIC_KEY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ============================================================
// AUTH — Social login
// ============================================================

export async function loginWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  })
  if (error) console.error('Google login error:', error.message)
}

export async function loginWithSpotify() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'spotify',
    options: { redirectTo: window.location.origin }
  })
  if (error) console.error('Spotify login error:', error.message)
}

export async function loginWithApple() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo: window.location.origin }
  })
  if (error) console.error('Apple login error:', error.message)
}

export async function logout() {
  await supabase.auth.signOut()
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Listen for auth state changes
export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user ?? null)
  })
}

// ============================================================
// REVIEWS — Submit
// ============================================================

export async function submitReview({ clubId, overall, music, bar, door, sound, visitMonth, visitYear, text }) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')

  // Anti-fraud check 1: has this user already reviewed this club?
  const { data: existing } = await supabase
    .from('reviews')
    .select('id')
    .eq('club_id', clubId)
    .eq('user_id', user.id)
    .single()

  if (existing) throw new Error('You have already reviewed this club.')

  // Anti-fraud check 2: rate limiting — max 5 reviews per day per user
  const today = new Date().toISOString().split('T')[0]
  const { count } = await supabase
    .from('reviews')
    .select('id', { count: 'exact' })
    .eq('user_id', user.id)
    .gte('created_at', today)

  if (count >= 5) throw new Error('Daily review limit reached. Come back tomorrow.')

  // Insert review
  const { data, error } = await supabase
    .from('reviews')
    .insert({
      club_id:      clubId,
      user_id:      user.id,
      overall:      overall,
      music:        music,
      bar:          bar,
      door:         door,
      sound:        sound,
      visit_month:  visitMonth,
      visit_year:   visitYear,
      text:         text,
      provider:     user.app_metadata?.provider ?? 'unknown',
      status:       'published' // no delay — immediate publish
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

// ============================================================
// REVIEWS — Fetch for a club
// ============================================================

export async function getReviews(clubId, limit = 20) {
  const { data, error } = await supabase
    .from('reviews')
    .select(`
      id, overall, music, bar, door, sound,
      visit_month, visit_year, text, created_at,
      profiles ( username, avatar_url, provider )
    `)
    .eq('club_id', clubId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return data
}

// ============================================================
// REVIEWS — Flag as suspicious
// ============================================================

export async function flagReview(reviewId) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Must be logged in to flag a review')

  const { error } = await supabase
    .from('review_flags')
    .insert({ review_id: reviewId, flagged_by: user.id })

  if (error) throw new Error(error.message)
}

// ============================================================
// CLUBS — Fetch list with filters
// ============================================================

export async function getClubs({ country, genre, capSize, vibe, sortBy = 'clubyvo_score', limit = 50 } = {}) {
  let query = supabase
    .from('clubs')
    .select('*')
    .limit(limit)

  if (country)  query = query.eq('country', country)
  if (genre)    query = query.eq('music_genre', genre)
  if (capSize)  query = query.eq('capacity_size', capSize)
  if (vibe)     query = query.eq('vibe', vibe)

  const sortMap = {
    clubyvo_score: 'clubyvo_score',
    user_rating:   'user_rating',
    reviews:       'review_count',
    capacity:      'capacity'
  }
  query = query.order(sortMap[sortBy] ?? 'clubyvo_score', { ascending: false })

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data
}

// ============================================================
// CLUBS — Fetch single club
// ============================================================

export async function getClub(clubId) {
  const { data, error } = await supabase
    .from('clubs')
    .select('*')
    .eq('id', clubId)
    .single()

  if (error) throw new Error(error.message)
  return data
}
