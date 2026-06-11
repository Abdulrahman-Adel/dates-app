// Vercel serverless function: the daily reminder brain. 🧠💕
//
// Called automatically by Vercel Cron every morning (see vercel.json).
// It works out — in Dubai time — whether today is special, and if so sends a
// real push notification to every subscribed device.
//
// What it knows how to celebrate / nag about:
//   • monthly mini-anniversary (same day-of-month as the first date)
//   • the big yearly anniversary
//   • Valentine's Day, New Year's Eve, her birthday, custom occasions
//   • a 7-day heads-up before the big ones (so there's time to plan!)
//   • 1st of each month → "log her flights for this month" reminder
//
// Required env vars (Vercel → Settings → Environment Variables):
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY  (already set for the app)
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY        (push keys — see UPDATE-SETUP.md)
//   CRON_SECRET                                (optional; protects this endpoint)

import webpush from 'web-push'

const DUBAI_OFFSET_MIN = 4 * 60 // UTC+4, no DST

function dubaiToday() {
  const now = new Date(Date.now() + DUBAI_OFFSET_MIN * 60 * 1000)
  return { y: now.getUTCFullYear(), m: now.getUTCMonth(), d: now.getUTCDate() }
}

const sameMD = (date, m, d) => date.getUTCMonth() === m && date.getUTCDate() === d

// days from today (Dubai) until the next occurrence of month/day
function daysUntil(md, today) {
  const t = Date.UTC(today.y, today.m, today.d)
  let target = Date.UTC(today.y, md.m, md.d)
  if (target < t) target = Date.UTC(today.y + 1, md.m, md.d)
  return Math.round((target - t) / 86400000)
}

export default async function handler(req, res) {
  // Optional protection — Vercel Cron sends "Authorization: Bearer <CRON_SECRET>"
  if (process.env.CRON_SECRET) {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
  }

  const SUPA_URL = process.env.VITE_SUPABASE_URL
  const SUPA_KEY = process.env.VITE_SUPABASE_ANON_KEY
  const VAPID_PUB = process.env.VAPID_PUBLIC_KEY
  const VAPID_PRIV = process.env.VAPID_PRIVATE_KEY
  if (!SUPA_URL || !SUPA_KEY || !VAPID_PUB || !VAPID_PRIV) {
    res.status(500).json({ error: 'missing env vars (supabase/vapid)' })
    return
  }

  webpush.setVapidDetails('mailto:abdulrahman.adel098@gmail.com', VAPID_PUB, VAPID_PRIV)

  const supa = async path => {
    const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    })
    return r.ok ? r.json() : null
  }

  // ── Load key dates + first date ─────────────────────────────────────────
  const occRows = await supa(`app_prefs?id=eq.occasions&select=data`)
  const occ = occRows?.[0]?.data || {}
  const firstDate = occ.firstDate ? new Date(occ.firstDate + 'T00:00:00Z') : null

  const today = dubaiToday()
  const messages = []

  // 1st of the month → flight-logging nudge (she knows her roster 1 month out)
  if (today.d === 1) {
    messages.push({
      title: 'New month, new roster ✈️',
      body: 'Time to log her flights for this month so your free date windows stay right.',
      tag: 'flights-monthly',
      url: '/?tab=flights',
    })
  }

  // First-date anniversaries
  if (firstDate && !isNaN(firstDate)) {
    const fm = firstDate.getUTCMonth(), fd = firstDate.getUTCDate()
    const isAnnDay = today.m === fm && today.d === fd
    const yearsNow = today.y - firstDate.getUTCFullYear()

    if (isAnnDay && yearsNow >= 1) {
      messages.push({
        title: `${yearsNow} year${yearsNow > 1 ? 's' : ''} together! 💍`,
        body: 'Happy anniversary — today deserves something unforgettable.',
        tag: 'anniversary',
        url: '/',
      })
    } else if (today.d === fd) {
      const monthsNow = (today.y - firstDate.getUTCFullYear()) * 12 + (today.m - fm)
      if (monthsNow >= 1) {
        messages.push({
          title: `${monthsNow} month${monthsNow > 1 ? 's' : ''} together 💕`,
          body: `A little reminder of ${occ.firstDate} — maybe a small gesture today?`,
          tag: 'monthiversary',
          url: '/',
        })
      }
    }

    // 7-day heads-up for the big anniversary
    if (yearsNow >= 0 && daysUntil({ m: fm, d: fd }, today) === 7) {
      messages.push({
        title: 'Anniversary in 1 week 👀',
        body: 'Seven days to plan something special. Start scheming.',
        tag: 'anniversary-heads-up',
        url: '/',
      })
    }
  }

  // Built-in yearly occasions (+ 7-day heads-up each)
  const yearly = [
    { m: 1, d: 14, name: "Valentine's Day", emoji: '🌹' },
    { m: 11, d: 31, name: "New Year's Eve", emoji: '🎆' },
  ]
  if (occ.herBirthday) {
    const b = new Date(occ.herBirthday + 'T00:00:00Z')
    if (!isNaN(b)) yearly.push({ m: b.getUTCMonth(), d: b.getUTCDate(), name: 'Her birthday', emoji: '🎂' })
  }
  for (const c of occ.custom || []) {
    const d = new Date(c.date + 'T00:00:00Z')
    if (!isNaN(d)) yearly.push({ m: d.getUTCMonth(), d: d.getUTCDate(), name: c.name, emoji: '🎉' })
  }

  for (const o of yearly) {
    if (today.m === o.m && today.d === o.d) {
      messages.push({
        title: `${o.emoji} It's ${o.name}!`,
        body: 'Today is the day — make it count.',
        tag: `occasion-${o.name}`,
        url: '/',
      })
    } else if (daysUntil({ m: o.m, d: o.d }, today) === 7) {
      messages.push({
        title: `${o.emoji} ${o.name} in 1 week`,
        body: 'A week to plan. The app has ideas if you need them.',
        tag: `occasion-soon-${o.name}`,
        url: '/',
      })
    }
  }

  if (messages.length === 0) {
    res.status(200).json({ sent: 0, note: 'nothing special today' })
    return
  }

  // ── Send to every subscribed device, pruning dead subscriptions ─────────
  const subs = (await supa('push_subscriptions?select=endpoint,subscription')) || []
  let sent = 0
  const dead = []
  for (const row of subs) {
    for (const msg of messages) {
      try {
        await webpush.sendNotification(row.subscription, JSON.stringify(msg))
        sent++
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) { dead.push(row.endpoint); break }
      }
    }
  }
  if (dead.length) {
    for (const ep of dead) {
      await fetch(`${SUPA_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(ep)}`, {
        method: 'DELETE',
        headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
      }).catch(() => {})
    }
  }

  res.status(200).json({ sent, devices: subs.length, messages: messages.map(m => m.title), pruned: dead.length })
}
