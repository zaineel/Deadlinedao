# DeadlineDAO API Documentation

Complete REST API for the AI-powered accountability platform.

## Base URL
```
http://localhost:3000/api
```

## Overview

The API is organized into the following sections:
- **Goals**: Create and manage accountability goals
- **Proofs**: Submit and validate proof of completion (Snowflake AI)
- **Upload**: Get presigned URLs for image uploads (Cloudflare R2)
- **Analytics**: Platform and user statistics
- **Health**: Service health checks

---

## Endpoints

### API Index

#### `GET /api`
Get list of all available endpoints

**Response:**
```json
{
  "name": "DeadlineDAO API",
  "version": "1.0.0",
  "endpoints": { ... }
}
```

---

## Goals

### Create Goal

#### `POST /api/goals`
Create a new goal with SOL stake

**Request Body:**
```json
{
  "wallet_address": "7xX...abc",
  "title": "Complete TypeScript Course",
  "description": "Finish all 50 modules and pass final exam",
  "deadline": "2025-12-31T23:59:59Z",
  "stake_amount": 0.5,
  "stake_tx_signature": "5Kd...xyz",
  "category": "learning"
}
```

**Response (201):**
```json
{
  "success": true,
  "goal": {
    "id": "uuid",
    "wallet_address": "7xX...abc",
    "title": "Complete TypeScript Course",
    "status": "active",
    ...
  }
}
```

### List Goals

#### `GET /api/goals?wallet=xxx&status=xxx&category=xxx&limit=10`
List goals with optional filters

**Query Parameters:**
- `wallet` (optional): Filter by wallet address
- `status` (optional): Filter by status (active, pending_validation, completed, failed)
- `category` (optional): Filter by category (learning, work, health)
- `limit` (optional): Number of results (default: 10)

**Response:**
```json
{
  "success": true,
  "goals": [...],
  "count": 5
}
```

### Get Goal

#### `GET /api/goals/[id]`
Get goal by ID

**Response:**
```json
{
  "success": true,
  "goal": { ... }
}
```

### Update Goal

#### `PUT /api/goals/[id]`
Update goal status

**Request Body:**
```json
{
  "status": "completed"
}
```

---

## Proofs (⭐ PRIMARY FEATURE)

### Submit Proof for Validation

#### `POST /api/proofs`
Submit proof for AI validation using Snowflake Cortex

**Request Body:**
```json
{
  "goal_id": "uuid",
  "text_description": "I completed all 50 modules with 95% average score. Built 3 projects: todo app, weather app, and e-commerce site. Deployed all to production.",
  "image_url": "https://pub-xxx.r2.dev/proofs/..."
}
```

**Response (200):**
```json
{
  "success": true,
  "proof": {
    "id": "uuid",
    "goal_id": "uuid",
    "ai_verdict": "approved",
    "ai_confidence": 87,
    "quality_score": 82,
    "ai_reasoning": "The proof demonstrates clear completion..."
  },
  "validation": {
    "verdict": "approved",
    "confidence": 87,
    "quality_score": 82,
    "text_match_score": 90,
    "specificity_score": 85,
    "red_flags": [],
    "reasoning": "..."
  },
  "goal_status": "completed",
  "payout": {
    "signature": "5Kd...xyz",
    "amount": 0.5
  }
}
```

**AI Validation Process:**
1. **Text Analysis** - Does proof match goal? (Claude 3.5 Sonnet)
2. **Sentiment Analysis** - Detect emotional manipulation
3. **Fraud Detection** - Check for generic/fake content (Mistral Large)
4. **Specificity Check** - Verify concrete details
5. **Quality Scoring** - Calculate overall score (weighted)

**Possible Verdicts:**
- `approved` - Auto-approved (quality ≥75, confidence ≥70)
- `rejected` - Auto-rejected (fraud detected, no match, quality <40)
- `needs_review` - Manual review required

### List Proofs

#### `GET /api/proofs?goal_id=xxx`
Get proofs for a specific goal

**Response:**
```json
{
  "success": true,
  "proofs": [...],
  "count": 1
}
```

---

## Upload

### Get Presigned Upload URL

#### `POST /api/upload/presigned`
Generate presigned URL for direct browser-to-R2 upload

**Request Body:**
```json
{
  "filename": "proof.jpg",
  "goal_id": "uuid",
  "user_id": "wallet_address"
}
```

**Response:**
```json
{
  "success": true,
  "upload_url": "https://xxx.r2.cloudflarestorage.com/...",
  "public_url": "https://pub-xxx.r2.dev/proofs/...",
  "key": "proofs/user_id/timestamp-random-proof.jpg",
  "expires_in": 300,
  "instructions": {
    "method": "PUT",
    "headers": { "Content-Type": "image/*" },
    "notes": [...]
  }
}
```

**Upload Process:**
1. Call this endpoint to get presigned URL
2. Frontend: `PUT` request to `upload_url` with file
3. Use `public_url` in proof submission

---

## Analytics

### Platform Statistics

#### `GET /api/analytics/platform`
Get platform-wide statistics and AI metrics

**Response:**
```json
{
  "success": true,
  "platform": {
    "totalGoals": 1523,
    "activeGoals": 456,
    "completedGoals": 892,
    "failedGoals": 175,
    "totalStaked": 234.5,
    "totalPayouts": 198.3,
    "totalUsers": 456,
    "avgCompletionRate": 83.6
  },
  "categories": {
    "learning": { "total": 678, "completed": 589, "completionRate": 86.8 },
    "work": { "total": 512, "completed": 420, "completionRate": 82.0 },
    "health": { "total": 333, "completed": 283, "completionRate": 85.0 }
  },
  "ai_validation": {
    "totalProofs": 1067,
    "approvedProofs": 892,
    "rejectedProofs": 123,
    "needsReview": 52,
    "avgConfidence": 84,
    "avgQualityScore": 79,
    "approvalRate": 87.9
  },
  "ai_performance": {
    "last_hour": {
      "totalValidations": 23,
      "approved": 19,
      "rejected": 3,
      "needsReview": 1,
      "avgConfidence": 85,
      "avgProcessingTime": 2347
    }
  },
  "leaderboard": [...]
}
```

### User Statistics

#### `GET /api/analytics/user/[wallet]`
Get user-specific statistics

**Response:**
```json
{
  "success": true,
  "wallet": "7xX...abc",
  "stats": {
    "totalGoals": 15,
    "activeGoals": 3,
    "completedGoals": 10,
    "failedGoals": 2,
    "totalStaked": 7.5,
    "totalEarned": 2.3,
    "totalReturned": 5.0,
    "netProfit": -0.2,
    "successRate": 83.3
  },
  "recent_goals": [...],
  "recent_payouts": [...]
}
```

---

## Health

### Service Health Check

#### `GET /api/health`
Check health of all services

**Response (200):**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-01T20:00:00.000Z",
  "response_time_ms": 234,
  "services": {
    "supabase": { "status": "up" },
    "solana": { "status": "up" },
    "snowflake": { "status": "up" },
    "cloudflare_r2": { "status": "up" }
  },
  "version": "1.0.0"
}
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message description"
}
```

**Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `404` - Not Found
- `500` - Internal Server Error
- `503` - Service Unavailable (degraded health)

---

## Tech Stack

- **Backend**: Next.js 14 API Routes
- **Database**: Supabase (PostgreSQL)
- **AI**: Snowflake Cortex (Claude 3.5 Sonnet, Mistral Large)
- **Blockchain**: Solana (devnet)
- **Storage**: Cloudflare R2

---

## Rate Limiting

Currently no rate limiting is implemented. In production, recommended limits:
- Goals: 10 per hour per wallet
- Proofs: 5 per hour per goal
- Analytics: 100 per hour per IP
- Upload: 20 per hour per user

---

## Notes

1. **Proof Validation** is the primary feature using Snowflake Cortex AI
2. **Direct uploads** to R2 reduce backend load
3. **Escrow wallet** holds all stakes until validation
4. **Automatic payouts** trigger on proof approval
5. All timestamps are in ISO 8601 format with UTC timezone
