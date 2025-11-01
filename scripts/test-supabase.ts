/**
 * Test script to verify Supabase integration
 * Run with: npx tsx scripts/test-supabase.ts
 */

import { supabase } from '../lib/supabase/client';
import {
  createGoal,
  getGoalById,
  getGoalsByWallet,
  getPlatformStats,
} from '../lib/supabase';

async function testSupabaseConnection() {
  console.log('🔍 Testing Supabase Integration...\n');

  try {
    // Test 1: Check connection
    console.log('1️⃣ Testing database connection...');
    const { error: connectionError } = await supabase.from('goals').select('count').single();

    if (connectionError && connectionError.code !== 'PGRST116') {
      throw new Error(`Connection failed: ${connectionError.message}`);
    }
    console.log('✅ Database connection successful!\n');

    // Test 2: Create a test goal
    console.log('2️⃣ Creating a test goal...');
    const testGoalData = {
      wallet_address: 'test_wallet_' + Date.now(),
      title: 'Test Goal - Learn TypeScript',
      description: 'Complete TypeScript tutorial by end of week',
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      stake_amount: 0.1,
      stake_tx_signature: 'test_tx_' + Date.now(),
      category: 'learning' as const,
      status: 'active' as const,
    };

    const { data: createdGoal, error: createError } = await createGoal(testGoalData);

    if (createError || !createdGoal) {
      throw new Error(`Failed to create goal: ${createError?.message}`);
    }
    console.log('✅ Test goal created!');
    console.log('   Goal ID:', createdGoal.id);
    console.log('   Title:', createdGoal.title);
    console.log('   Stake:', createdGoal.stake_amount, 'SOL\n');

    // Test 3: Read the goal back
    console.log('3️⃣ Reading goal by ID...');
    const { data: fetchedGoal, error: fetchError } = await getGoalById(createdGoal.id);

    if (fetchError || !fetchedGoal) {
      throw new Error(`Failed to fetch goal: ${fetchError?.message}`);
    }
    console.log('✅ Goal fetched successfully!');
    console.log('   Status:', fetchedGoal.status);
    console.log('   Category:', fetchedGoal.category, '\n');

    // Test 4: Get goals by wallet
    console.log('4️⃣ Fetching goals by wallet...');
    const { data: walletGoals, error: walletError } = await getGoalsByWallet(
      testGoalData.wallet_address
    );

    if (walletError) {
      throw new Error(`Failed to fetch wallet goals: ${walletError.message}`);
    }
    console.log('✅ Wallet goals fetched!');
    console.log('   Found', walletGoals?.length || 0, 'goal(s)\n');

    // Test 5: Get platform stats
    console.log('5️⃣ Fetching platform statistics...');
    const { data: stats, error: statsError } = await getPlatformStats();

    if (statsError) {
      throw new Error(`Failed to fetch stats: ${statsError.message}`);
    }
    console.log('✅ Platform stats fetched!');
    console.log('   Total Goals:', stats?.totalGoals || 0);
    console.log('   Active Goals:', stats?.activeGoals || 0);
    console.log('   Total Staked:', stats?.totalStaked || 0, 'SOL');
    console.log('   Completion Rate:', stats?.avgCompletionRate || 0, '%\n');

    // Test 6: Clean up - delete test goal
    console.log('6️⃣ Cleaning up test data...');
    const { error: deleteError } = await supabase
      .from('goals')
      .delete()
      .eq('id', createdGoal.id);

    if (deleteError) {
      console.log('⚠️  Warning: Could not delete test goal:', deleteError.message);
    } else {
      console.log('✅ Test goal deleted\n');
    }

    console.log('🎉 All tests passed! Supabase integration is working correctly.\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error('\nTroubleshooting:');
    console.error('1. Make sure you have created a Supabase project');
    console.error('2. Run the SQL schema from supabase-schema.sql in your Supabase SQL Editor');
    console.error('3. Copy .env.local.example to .env.local and fill in your credentials:');
    console.error('   - SUPABASE_URL');
    console.error('   - SUPABASE_SERVICE_ROLE_KEY');
    console.error('4. Restart your dev server after updating .env.local\n');
    process.exit(1);
  }
}

testSupabaseConnection();
