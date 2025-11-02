# Reward Distribution Admin Endpoint

## Overview
The admin endpoint allows you to manually trigger Phase 2 reward distribution for a specific deadline. This demonstrates the two-phase payout system where:

- **Phase 1 (Immediate)**: Users get their stake back when proof is approved
- **Phase 2 (At Deadline)**: Rewards from failed stakes are distributed to successful completers

## Endpoint

### Production
```
https://deadlinedao.vercel.app/api/admin/trigger-rewards
```

### Local Development
```
http://localhost:3000/api/admin/trigger-rewards
```

---

## Usage

### 1. Preview Distribution (GET)
**See what would be distributed without executing**

```bash
curl "https://deadlinedao.vercel.app/api/admin/trigger-rewards?deadline=2025-11-02"
```

**Response:**
```json
{
  "preview": true,
  "deadline": "2025-11-02",
  "stats": {
    "totalGoals": 8,
    "completed": 3,
    "failed": 2,
    "active": 3,
    "totalCompletedStake": 1.5,
    "totalFailedStake": 1.0
  },
  "distribution": [
    {
      "goalId": "abc123",
      "wallet": "Gw7x...",
      "description": "Run 5km",
      "originalStake": 0.5,
      "rewardAmount": 0.333,
      "proportion": "33.33%"
    }
  ],
  "canDistribute": true,
  "note": "Ready to distribute rewards"
}
```

---

### 2. Execute Distribution (POST)
**Actually distribute rewards from failed stakes**

#### Using cURL:
```bash
curl -X POST https://deadlinedao.vercel.app/api/admin/trigger-rewards \
  -H "Content-Type: application/json" \
  -d '{"deadline": "2025-11-02"}'
```

#### Using Postman:
1. Method: `POST`
2. URL: `https://deadlinedao.vercel.app/api/admin/trigger-rewards`
3. Headers: `Content-Type: application/json`
4. Body (raw JSON):
```json
{
  "deadline": "2025-11-02"
}
```

#### Using JavaScript (fetch):
```javascript
fetch('https://deadlinedao.vercel.app/api/admin/trigger-rewards', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ deadline: '2025-11-02' })
})
  .then(res => res.json())
  .then(data => console.log(data));
```

**Success Response:**
```json
{
  "success": true,
  "message": "Successfully distributed 1.0 SOL in rewards to 3 winners",
  "stats": {
    "deadline": "2025-11-02",
    "totalGoals": 8,
    "completed": 3,
    "failed": 2,
    "active": 3,
    "totalCompletedStake": 1.5,
    "totalFailedStake": 1.0,
    "rewardsDistributed": 1.0
  },
  "distribution": {
    "successfulPayouts": 3,
    "failedPayouts": 0,
    "totalWinnersStake": 1.5,
    "totalLosersStake": 1.0
  },
  "rewards": [
    {
      "goalId": "abc123",
      "goalDescription": "Run 5km every day",
      "wallet": "Gw7x...",
      "originalStake": 0.5,
      "rewardAmount": 0.333,
      "totalPayout": 0.333,
      "proportion": "33.33%",
      "status": "success",
      "signature": "5j7K...",
      "error": null
    }
  ],
  "errors": null,
  "solanaExplorer": [
    "https://explorer.solana.com/tx/5j7K...?cluster=devnet"
  ]
}
```

---

## Testing the Two-Phase System

### Complete Flow Demo:

#### Step 1: Create Test Goals
1. Go to https://deadlinedao.vercel.app
2. Create 3-4 goals with deadline = today or tomorrow
3. Use different wallet addresses
4. Stake amounts: 0.5 SOL, 0.3 SOL, 0.2 SOL

#### Step 2: Complete Some Goals (Phase 1)
1. Submit proofs for 2 of the goals
2. AI validates and approves
3. ✅ **Observe Phase 1**: Stakes immediately returned to wallets
4. Check Solana Explorer to see transactions

#### Step 3: Let Others Fail
1. Wait for deadline to pass (or manually mark as 'failed' in database)
2. Now you have:
   - 2 completed goals (stakes already returned)
   - 2 failed goals (stakes still in escrow)

#### Step 4: Distribute Rewards (Phase 2)
1. **Preview first**:
```bash
curl "https://deadlinedao.vercel.app/api/admin/trigger-rewards?deadline=2025-11-02"
```

2. **Execute distribution**:
```bash
curl -X POST https://deadlinedao.vercel.app/api/admin/trigger-rewards \
  -H "Content-Type: application/json" \
  -d '{"deadline": "2025-11-02"}'
```

3. ✅ **Observe Phase 2**: Rewards from failed stakes distributed to winners
4. Check response for Solana Explorer links
5. Verify transactions on blockchain

---

## Example Calculation

### Scenario:
- **Winner 1**: 0.5 SOL stake (completed)
- **Winner 2**: 0.3 SOL stake (completed)
- **Loser 1**: 0.4 SOL stake (failed)
- **Loser 2**: 0.6 SOL stake (failed)

### Phase 1 (Already Executed):
- Winner 1 received: 0.5 SOL (their stake)
- Winner 2 received: 0.3 SOL (their stake)

### Phase 2 (Triggered by Endpoint):
- Total failed stakes: 0.4 + 0.6 = **1.0 SOL**
- Total winner stakes: 0.5 + 0.3 = **0.8 SOL**

**Winner 1 reward:**
- Proportion: 0.5 / 0.8 = 62.5%
- Reward: 62.5% × 1.0 = **0.625 SOL**

**Winner 2 reward:**
- Proportion: 0.3 / 0.8 = 37.5%
- Reward: 37.5% × 1.0 = **0.375 SOL**

### Total Earnings:
- **Winner 1**: 0.5 (stake) + 0.625 (reward) = **1.125 SOL total**
- **Winner 2**: 0.3 (stake) + 0.375 (reward) = **0.675 SOL total**

---

## Error Responses

### No completed goals:
```json
{
  "success": false,
  "message": "No completed goals found for this deadline",
  "stats": {
    "deadline": "2025-11-02",
    "totalGoals": 5,
    "completed": 0,
    "failed": 3,
    "active": 2
  }
}
```

### No failed goals (no rewards to distribute):
```json
{
  "success": false,
  "message": "No failed goals found - no rewards to distribute",
  "stats": {
    "deadline": "2025-11-02",
    "totalGoals": 3,
    "completed": 3,
    "failed": 0,
    "active": 0
  }
}
```

### Invalid date format:
```json
{
  "error": "Invalid date format. Use YYYY-MM-DD"
}
```

---

## Database Records

After successful distribution, payouts are automatically recorded in the `payouts` table:

```sql
SELECT * FROM payouts WHERE payout_type = 'completion_reward';
```

Each record includes:
- `goal_id`: The completed goal
- `wallet_address`: Recipient
- `amount`: Reward amount (in SOL)
- `tx_signature`: Solana transaction signature
- `payout_type`: 'completion_reward' (Phase 2) or 'original_stake' (Phase 1)
- `created_at`: Timestamp

---

## Quick Test Commands

### Today's deadline:
```bash
# Get today's date
TODAY=$(date +%Y-%m-%d)

# Preview
curl "https://deadlinedao.vercel.app/api/admin/trigger-rewards?deadline=$TODAY"

# Execute
curl -X POST https://deadlinedao.vercel.app/api/admin/trigger-rewards \
  -H "Content-Type: application/json" \
  -d "{\"deadline\": \"$TODAY\"}"
```

### Specific date:
```bash
curl -X POST https://deadlinedao.vercel.app/api/admin/trigger-rewards \
  -H "Content-Type: application/json" \
  -d '{"deadline": "2025-11-15"}'
```

---

## Future Enhancement: Automated Cron Job

This endpoint can be integrated with Vercel Cron Jobs to run automatically:

```json
// vercel.json
{
  "crons": [{
    "path": "/api/cron/distribute-rewards",
    "schedule": "0 0 * * *"
  }]
}
```

For now, use this endpoint manually to demonstrate the reward distribution feature.

---

## Support

For issues or questions:
- Check Vercel logs: `vercel logs https://deadlinedao.vercel.app`
- Check Solana transactions on devnet explorer
- Review database records in Supabase dashboard
