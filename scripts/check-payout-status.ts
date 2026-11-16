import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPayoutStatus() {
  try {
    console.log('💰 Payout Status Check\n');
    console.log('=' .repeat(70));

    // Get all goals
    const { data: allGoals, error: goalsError } = await supabase
      .from('goals')
      .select('*')
      .order('created_at', { ascending: false });

    if (goalsError || !allGoals) {
      console.error('❌ Error fetching goals:', goalsError?.message);
      process.exit(1);
    }

    // Get all payouts
    const { data: allPayouts, error: payoutsError } = await supabase
      .from('payouts')
      .select('*')
      .order('created_at', { ascending: false });

    if (payoutsError) {
      console.error('❌ Error fetching payouts:', payoutsError?.message);
      process.exit(1);
    }

    const payouts = allPayouts || [];

    // Summary
    const completedGoals = allGoals.filter(g => g.status === 'completed');
    const failedGoals = allGoals.filter(g => g.status === 'failed');
    const activeGoals = allGoals.filter(g => g.status === 'active');

    console.log('📊 Overall Statistics:\n');
    console.log(`   Total Goals: ${allGoals.length}`);
    console.log(`   ✅ Completed: ${completedGoals.length}`);
    console.log(`   ❌ Failed: ${failedGoals.length}`);
    console.log(`   ⏳ Active: ${activeGoals.length}`);
    console.log(`   💸 Total Payouts: ${payouts.length}\n`);

    // Check which completed goals have payouts
    const goalsWithPayouts = new Set(payouts.map(p => p.goal_id));
    const completedWithoutPayouts = completedGoals.filter(g => !goalsWithPayouts.has(g.id));

    console.log('=' .repeat(70));
    console.log('💸 Payout Details:\n');

    if (payouts.length > 0) {
      const totalPaidOut = payouts.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0);

      console.log(`Total Amount Paid: ${totalPaidOut.toFixed(4)} SOL\n`);

      console.log('Recent Payouts:');
      payouts.slice(0, 10).forEach((payout, index) => {
        const goal = allGoals.find(g => g.id === payout.goal_id);
        console.log(`\n${index + 1}. ${payout.wallet_address.slice(0, 8)}...${payout.wallet_address.slice(-6)}`);
        console.log(`   Goal: ${goal?.title || 'Unknown'}`);
        console.log(`   Amount: ${parseFloat(payout.amount.toString()).toFixed(4)} SOL`);
        console.log(`   Type: ${payout.payout_type}`);
        console.log(`   Signature: ${payout.tx_signature}`);
        console.log(`   Explorer: https://explorer.solana.com/tx/${payout.tx_signature}?cluster=devnet`);
        console.log(`   Date: ${new Date(payout.created_at).toLocaleString()}`);
      });
    } else {
      console.log('ℹ️  No payouts recorded yet.\n');
    }

    // Show completed goals without payouts
    console.log('\n' + '=' .repeat(70));
    if (completedWithoutPayouts.length > 0) {
      console.log(`⚠️  Completed Goals WITHOUT Payouts: ${completedWithoutPayouts.length}\n`);

      completedWithoutPayouts.forEach((goal, index) => {
        console.log(`${index + 1}. "${goal.title}"`);
        console.log(`   Wallet: ${goal.wallet_address.slice(0, 8)}...${goal.wallet_address.slice(-6)}`);
        console.log(`   Stake: ${goal.stake_amount} SOL`);
        console.log(`   Deadline: ${new Date(goal.deadline).toLocaleDateString()}`);
        console.log(`   Completed: ${new Date(goal.updated_at).toLocaleString()}\n`);
      });

      console.log('💡 Tip: Use the admin page (/admin) or POST /api/admin/trigger-rewards to process rewards; use POST /api/admin/payouts/reconcile for unconfirmed payouts\n');
    } else {
      console.log('✅ All completed goals have been paid out!\n');
    }

    // Group by deadline
    console.log('=' .repeat(70));
    console.log('📅 Goals by Deadline:\n');

    const deadlineGroups = new Map<string, any[]>();
    allGoals.forEach(goal => {
      const deadlineDate = new Date(goal.deadline).toISOString().split('T')[0];
      if (!deadlineGroups.has(deadlineDate)) {
        deadlineGroups.set(deadlineDate, []);
      }
      deadlineGroups.get(deadlineDate)!.push(goal);
    });

    const sortedDeadlines = Array.from(deadlineGroups.keys()).sort();
    sortedDeadlines.forEach(deadline => {
      const goals = deadlineGroups.get(deadline)!;
      const completed = goals.filter(g => g.status === 'completed').length;
      const failed = goals.filter(g => g.status === 'failed').length;
      const active = goals.filter(g => g.status === 'active').length;

      console.log(`📆 ${deadline}`);
      console.log(`   Total: ${goals.length} | ✅ ${completed} | ❌ ${failed} | ⏳ ${active}\n`);
    });

  } catch (error: any) {
    console.error('❌ Error:', error?.message || error);
  }
}

checkPayoutStatus();
