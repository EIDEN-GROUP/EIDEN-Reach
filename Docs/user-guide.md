# EIDEN Reach — Plain English User Guide

Welcome! This guide explains **everything in simple words** — what each button, page, and word means, and how to use them. No coding knowledge needed.

---

## What is EIDEN Reach?

Think of it as your **sales assistant that remembers to follow up** so you don't have to.

- You write an email once
- EIDEN sends it to the right person
- If they don't reply in a few days, it sends a follow-up
- If they reply — it **stops automatically** so you don't keep emailing them
- You can see who replied, who bounced, and how well you're doing

**The goal:** turn strangers into conversations — politely and automatically.

---

## Words you will see (plain English)

| Word | What it means |
|---|---|
| **Contact** | A person you want to email (name + email address) |
| **Company** | The business that person works at |
| **Sequence** | A series of emails sent over time (e.g. Day 1, Day 4, Day 8…) |
| **Enrollment** | One person's journey through a sequence — each person is independent |
| **Template** | A saved email you can reuse (you write it once, EIDEN personalizes it) |
| **Mailbox** | The email address EIDEN sends from (like sales@yourcompany.com) |
| **Reply** | When the person emails you back |
| **Bounced** | The email couldn't be delivered (wrong/invalid address) |
| **Suppressed** | We promise NOT to email this person again (they unsubscribed) |
| **Pipeline / Deal** | A potential sale you're tracking — from first contact to won |
| **Task** | A reminder for YOU to do something (call, email, follow up) |
| **Inbox** | All incoming emails from your connected mailbox |
| **KPIs** | Numbers that show how well outreach is going (reply rate, bounce rate…) |

---

## Step-by-step: Send your first email series

### 1. Add a Contact
1. Go to **Contacts**
2. Click **Add contact**
3. Fill in first name, last name, email — and pick their company if you know it
4. Click **Add contact** ✓

> 💡 **Tip:** You need at least one contact before you can send a sequence.

### 2. Create a Sequence
1. Go to **Sequences**
2. Either:
   - Click **Use 5-email template** (recommended — already written for you), or
   - Type a name like "New prospects — follow-up 1" and click **Create sequence**
3. Click the sequence name to open it

### 3. Add your emails (steps)
Inside the sequence:
1. **Kind** → choose `email` (for sending an email), `wait` (pause), `task` (remind you), or `condition` (branch)
2. **Delay** → how long to wait before this step (in minutes)
3. Check **Business days only** if you only want to skip weekends
4. Pick a **Template** from the list (the email content)
5. Click **Add step**

> For the default 5-email template, steps are already added for you — Days 1, 4, 8, 13, 20.

### 4. Choose who sends it (Sender mailbox)
1. In the sequence settings, there's a **Sender mailbox** dropdown
2. Pick the email address you want to send from
3. If it's empty, EIDEN won't know which address to use!

### 5. Check the Preflight list ✅
Before you activate, EIDEN shows a checklist:

| Check | What it means |
|---|---|
| **SENDER** | A mailbox is selected |
| **MAILBOX** | At least one mailbox is connected |
| **STATUS** | Currently `draft` or `active` |
| **STEPS** | You have emails added |
| **DAILY LIMIT** | How many emails per day (optional cap) |
| **ENROLLMENTS** | How many people are enrolled |
| **STOP RULES** | Auto-stop on reply / bounce / unsubscribe |
| **ADVANCED** | Company-level + timezone settings |

All should show ✓. Anything with ⚠ needs fixing.

### 6. Activate
1. Change **Status** from `draft` → `active`
2. Click **Save changes**

### 7. Enroll contacts
1. Scroll to **Enrollments**
2. Click **Enroll contact**
3. Pick a person from the dropdown
4. Click **Enroll** ✓

EIDEN will start their timeline right away.

---

## How emails get sent (what happens behind the scenes)

1. ⏰ **Day 1** — Email 1 sends
2. ⏳ **Wait 3 days** — nothing happens (intentional)
3. 📧 **Day 4** — Follow-up 1 sends (only if still no reply)
4. ⏳ **Wait 4 days**
5. 💰 **Day 8** — Value email sends
6. ⏳ **Wait 5 days**
7. 🤝 **Day 13** — Objection-handling email
8. ⏳ **Wait 7 days**
9. 👋 **Day 20** — Final polite goodbye
10. ✅ **Done** — marked "Completed"

> **Important:** EIDEN always checks before sending: *"Did they reply? Did they unsubscribe? Did it bounce? Is it within sending hours?"* If yes to any — it stops.

---

## What happens when someone replies

| They do this | EIDEN does this |
|---|---|
| Say "yes, interested" | Stops · marks them **Interested** · notifies you on Slack |
| Say "not interested" | Stops · marks **Not Interested** · won't re-enroll them |
| "I'm on holiday until…" | Pauses · resumes after they return |
| Email bounces | Stops · marks **Invalid** · won't email them again |
| "Unsubscribe me" | Stops · adds to **Suppression list** (forever) |
| Nothing | Keeps sending next follow-up on schedule |

**You can see this in Sequences → Enrollments** — replied contacts show a **`replied`** tag and the reason (e.g. "reply_received").

---

## Your Dashboard — Overview page

When you open EIDEN Reach, the first page shows:

### Today's brief (top)
- How many open deals you have
- How many follow-ups are due

### Metric cards (4)
- **Relationships** — total contacts + companies
- **Open pipeline** — deals still open + their total value
- **Won** — deals you closed 🎉
- **Sequences live** — how many automations are running

### Outreach health (NEW)
8 cards showing exactly how outreach is going:

| Card | What it tells you |
|---|---|
| **Enrolled** | How many people are in sequences |
| **Emails sent** | Total emails EIDEN has sent |
| **Reply rate** | % who replied (higher = better) |
| **Positive reply** | % who said they're interested |
| **Bounce rate** | % that bounced (lower = better; >5% is red) |
| **Unsubscribed** | How many opted out |
| **Completion** | % who finished all steps without replying |
| **Failure rate** | % of emails that failed to send |

🟢 **Green** = good · 🔴 **Red** = needs attention · ⚪ **White** = neutral

---

## Analytics page

Same numbers but more detail:
- Contacts, companies, open deals, won deals
- Open tasks, overdue tasks
- Activity count (things that happened)
- **Sequence KPIs** — all 15 metrics in one table
- **State breakdown** — count of enrollments by status (active, replied, paused, completed…)

Use this to answer: *"Are my emails working?"*

---

## Inbox page

- Connect your mailbox (email account) once
- See all incoming emails, newest first
- Click a message to read it — HTML or plain text view
- The composer is **locked** on purpose until we verify sending works fully (so you don't send broken emails)

> **Reply messages appear here first.** EIDEN watches this inbox to detect replies and stop sequences.

---

## Templates page

- Save email content you reuse a lot
- Use placeholders so each email feels personal:

| You write | EIDEN replaces with |
|---|---|
| `{{first_name}}` | Sarah |
| `{{company}}` | ABC Group |
| `{{sender_name}}` | Your name |
| `{{job_title}}` | Operations Manager |

> 💡 **Tip:** Always keep HTML in the editor — you can make emails look nice with bold, links, and layout. The preview shows exactly what they'll see.

---

## Pipeline page

- See all your deals (potential sales)
- They're grouped by stage (e.g. New → Qualified → Proposal → Won)
- You can move a deal by changing its stage
- Each stage has a probability — EIDEN calculates your weighted forecast automatically

---

## Tasks & Activities

- Reminders for you: "Call Sarah", "Send proposal"
- Overdue ones show in red on the Overview page
- Mark as complete when done

---

## Common questions

**Q: What if I make a mistake in a step?**
A: Pause the sequence, edit it, then re-activate. Already-sent emails stay sent.

**Q: Can I stop a sequence for one person only?**
A: Yes — go to Enrollments, find them, and pause/remove just that enrollment.

**Q: What does "paused" vs "completed" mean?**
- **Paused** = temporarily stopped, can resume later
- **Completed** = finished all steps, done forever
- **Unsubscribed** = they asked to stop, never contact again

**Q: Why won't my sequence send?**
Check the Preflight list — most common reasons:
- No sender mailbox selected
- Status is still `draft`
- No steps added
- Daily limit reached

**Q: I got a reply but the sequence kept going — why?**
It shouldn't! If you see this, tell us — it's a bug. EIDEN is designed to stop within minutes of the reply.

**Q: What's a bounce?**
The address doesn't exist or the mail server rejected it. EIDEN marks it invalid so you don't waste time emailing a dead address.

**Q: I enrolled someone twice by accident**
EIDEN blocks duplicates automatically — you can't enroll the same person twice in the same sequence.

---

## Quick cheat sheet

```
Add contact → Create sequence → Add steps → Pick sender → Check preflight ✓ → Activate → Enroll → EIDEN sends → Auto-stops on reply → Check Analytics
```

**Remember:** The goal isn't to send the most emails. It's to start the right conversations — and stop the moment someone says yes (or no).
