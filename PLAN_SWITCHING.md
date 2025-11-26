# Plan Switching Behavior

## Overview

When users want to change their subscription plan, the behavior depends on whether they're **upgrading** or **downgrading**.

---

## 🔼 Upgrading (Lower Plan → Higher Plan)

### Example: IQ Pro (₹399) → IQ Max (₹899)

**Behavior: Immediate Switch**

1. ✅ **User gets higher tier access immediately**
2. ✅ Old subscription is cancelled
3. ✅ New subscription starts right away
4. ✅ User is charged for the new plan immediately
5. ✅ Access to all higher plan features starts immediately

**Why?** Users should get immediate access to better features when they upgrade.

---

## 🔽 Downgrading (Higher Plan → Lower Plan)

### Example: IQ Max (₹899) → IQ Pro (₹399)

**Behavior: Switch at End of Billing Period**

1. ✅ **User keeps higher tier access until current billing period ends**
2. ✅ Old subscription is cancelled (no more renewals)
3. ✅ New subscription is scheduled to start when old one ends
4. ✅ User is NOT charged immediately for the lower plan
5. ✅ User continues to have IQ Max features until their paid period ends
6. ✅ After the period ends, user automatically switches to IQ Pro

**Why?** Users have already paid for the full month of the higher plan, so they should keep access until that period ends.

---

## 📅 Timeline Examples

### Scenario 1: Upgrading (Pro → Max) with Proration
- **Day 1**: User subscribes to IQ Pro (₹399) for 30 days
- **Day 15**: User upgrades to IQ Max (15 days remaining)
  - ✅ Immediately gets IQ Max access
  - ✅ Old Pro subscription cancelled
  - ✅ New Max subscription starts
  - ✅ Charged ₹899 for Max (full subscription amount)
  - ✅ **Refund processed**: ₹199.50 (unused Pro value for 15 days)
  - ✅ **Net charge**: ₹899 - ₹199.50 = ₹699.50 (fair proration)
  - ✅ Next month: Charged ₹899 (full Max amount)

### Scenario 2: Downgrading (Max → Pro)
- **Day 1**: User subscribes to IQ Max (₹899)
- **Day 15**: User downgrades to IQ Pro
  - ✅ Still has IQ Max access until Day 30 (end of paid period)
  - ✅ Old Max subscription cancelled (won't renew)
  - ✅ New Pro subscription scheduled to start on Day 30
  - ✅ On Day 30: Automatically switches to IQ Pro
  - ✅ Charged ₹399 for Pro (new billing cycle starts)

---

## 🔄 Auto-Renewal Impact

### With Auto-Renewal ON:
- **Upgrade**: New subscription auto-renews at higher plan rate
- **Downgrade**: New subscription auto-renews at lower plan rate (after period ends)

### With Auto-Renewal OFF:
- **Upgrade**: One-time payment for higher plan
- **Downgrade**: One-time payment for lower plan (after current period ends)

---

## 💡 Key Points

1. **Upgrades are immediate** - Users get better features right away
2. **Downgrades are deferred** - Users keep what they paid for until period ends
3. **No double charging** - Users aren't charged twice in the same period
4. **Fair billing** - Users get full value for what they've paid

---

## 🛠️ Technical Implementation

- **Upgrade**: Cancels old subscription, creates new one with immediate start
- **Downgrade**: Cancels old subscription, creates new one scheduled to start when old one ends
- **Database**: Tracks effective tier (current access) vs scheduled tier (future plan)
- **Webhooks**: Handle automatic renewals and plan switches

---

## ❓ Common Questions

**Q: If I downgrade, when do I lose access to higher plan features?**  
A: At the end of your current billing period. You keep access until the date you originally paid until.

**Q: If I upgrade mid-cycle, what happens to the money I already paid?**  
A: You get a **prorated refund** for the unused portion of your lower plan. For example:
- If you paid ₹399 for IQ Pro and upgrade to IQ Max after 15 days
- You'll be charged ₹899 for IQ Max (full subscription)
- You'll receive a refund of ₹199.50 (unused Pro value for 15 days)
- **Net charge**: ₹699.50 (fair proration - you only pay the difference)

**Q: Can I switch plans multiple times?**  
A: Yes, but each switch follows the same rules (immediate upgrade, deferred downgrade).

**Q: What happens if I cancel and then subscribe to a different plan?**  
A: If you cancel and still have time left, you can upgrade immediately. Downgrades will wait until your paid period ends.

