// Migration verification harness. NOT part of the app build.
// Needs `@electric-sql/pglite` installed separately (it is NOT in package.json):
//   mkdir /tmp/pgverify && cd /tmp/pgverify && npm init -y && npm i @electric-sql/pglite
//   PGLITE_DIR=/tmp/pgverify node <repo>/scripts/migration-verify/verify.mjs
// Stand-ins for hosted Supabase (PGlite has none of these): roles anon,
// authenticated, service_role (created NOLOGIN). Nothing else is altered.
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const req = createRequire(path.join(process.env.PGLITE_DIR ?? process.cwd(), 'x.js'));
const { PGlite } = req('@electric-sql/pglite');

const read = (p) => readFileSync(path.join(root, p), 'utf8');
const migDir = path.join(root, 'supabase-migrations');
const mig = Object.fromEntries(
  readdirSync(migDir)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort()
    .map((f) => [f.slice(0, 3), read('supabase-migrations/' + f)]),
);
const STANDINS = `CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;`;

let failures = 0;
const ok = (c, m) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m);
  if (!c) failures++;
};

async function applyOrder(order) {
  const db = new PGlite();
  await db.exec(STANDINS);
  await db.exec(read('supabase-schema.sql'));
  for (const n of order) if (mig[n]) await db.exec(mig[n]);
  return db;
}
async function throws(db, sql, code) {
  try {
    await db.exec(sql);
    return false;
  } catch (e) {
    return code ? e.code === code : true;
  }
}

const numbers = Object.keys(mig);
const ordered = numbers;
const alt = (a) => a.filter((n) => numbers.includes(n));
const orders = {
  numeric: ordered,
  'numeric x2 (idempotency)': [...ordered, ...ordered],
  '001,002,005,003,004,006,(rest)': alt(['001', '002', '005', '003', '004', '006', '007', '008', '009']),
  '001,002,006,004,003,005,(rest)': alt(['001', '002', '006', '004', '003', '005', '007', '008', '009']),
  'alt order then numeric (mixed re-apply)': [...alt(['001', '002', '005', '003', '004', '006']), ...ordered],
};

const snapshot = async (db) => {
  const r = await db.query(`
    SELECT 'col' k, table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'') v FROM information_schema.columns WHERE table_schema='public'
    UNION ALL SELECT 'con', conrelid::regclass||'.'||conname||':'||pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace='public'::regnamespace
    UNION ALL SELECT 'idx', indexdef FROM pg_indexes WHERE schemaname='public'
    UNION ALL SELECT 'trg', tgrelid::regclass||'.'||tgname FROM pg_trigger WHERE NOT tgisinternal
    UNION ALL SELECT 'fn', proname FROM pg_proc WHERE pronamespace='public'::regnamespace
    UNION ALL SELECT 'pol', tablename||'.'||policyname||':'||roles::text FROM pg_policies
    UNION ALL SELECT 'rls', relname||':'||relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r'
    ORDER BY 1,2`);
  return r.rows.map((x) => x.k + ' ' + x.v).join('\n');
};

const snaps = {};
for (const [name, order] of Object.entries(orders)) {
  try {
    const db = await applyOrder(order);
    snaps[name] = await snapshot(db);
    ok(true, `apply order [${name}] ran without error`);
    await db.close();
  } catch (e) {
    ok(false, `apply order [${name}]: ${e.message}`);
  }
}
for (const [n, s] of Object.entries(snaps)) ok(s === snaps.numeric, `final schema identical to numeric apply: [${n}]`);

const G = `(wallet_address,title,description,deadline,stake_amount,stake_tx_signature,category`;

async function behaviour(label, order) {
  const db = await applyOrder(order);
  const q = (s, p) => db.query(s, p);
  const t = (m) => `[${label}] ${m}`;
  const goal = async (sig) =>
    (await q(`INSERT INTO goals${G}) VALUES ('W1','t','d',now()+interval '1 day',1,$1,'work') RETURNING id`, [sig])).rows[0].id;
  const ins = (sig, extra = '') => `INSERT INTO goals${G}) VALUES ('W','t','d',now(),1,'${sig}','work')${extra}`;

  const g1 = await goal('sigA');
  for (const ty of ['original_stake', 'completion_reward', 'bond_refund', 'team_reward', 'sponsor_match'])
    ok(
      !(await throws(db, `INSERT INTO payouts(goal_id,wallet_address,amount,tx_signature,payout_type) VALUES ('${g1}','W1',1,'p_${ty}','${ty}')`)),
      t(`payout_type ${ty} accepted`),
    );
  ok(await throws(db, `INSERT INTO payouts(goal_id,wallet_address,amount,tx_signature,payout_type) VALUES ('${g1}','W1',1,'x','bogus')`, '23514'), t('unknown payout_type rejected (23514)'));
  ok(await throws(db, `INSERT INTO payouts(goal_id,wallet_address,amount,tx_signature,payout_type) VALUES ('${g1}','W1',1,'dup','original_stake')`, '23505'), t('payouts unique (goal_id,payout_type)'));
  ok(await throws(db, ins('sigA'), '23505'), t('duplicate goal stake signature rejected'));
  ok(
    !(await throws(db, `INSERT INTO goals${G}) VALUES ('W','t','d',now(),1,'pending','work'),('W','t','d',now(),1,'pending','work'),('W','t','d',now(),1,'demo_tx_1','work'),('W','t','d',now(),1,'demo_tx_1','work')`)),
    t("'pending' and demo_tx_% exempt from unique stake sig"),
  );
  ok(await throws(db, `INSERT INTO goals${G}) VALUES ('W','t','d',now(),0,'z0','work')`, '23514'), t('stake_amount > 0 enforced for new rows'));
  for (const s of ['rejected_appealable', 'disputed'])
    ok(!(await throws(db, `UPDATE goals SET status='${s}' WHERE id='${g1}'`)), t(`goals.status ${s} accepted`));
  ok(await throws(db, `UPDATE goals SET status='nope' WHERE id='${g1}'`, '23514'), t('goals.status unknown rejected'));
  ok((await q(`SELECT share_public FROM goals WHERE id=$1`, [g1])).rows[0].share_public === false, t('share_public defaults false'));

  // disputes
  await db.exec(`INSERT INTO disputes(goal_id,reason,bond_amount,bond_tx_signature) VALUES ('${g1}','r',0.1,'bondA')`);
  ok(await throws(db, `INSERT INTO disputes(goal_id,reason,bond_amount,bond_tx_signature) VALUES ('${g1}','r',0.1,'bondB')`, '23505'), t('one dispute per goal'));
  const g2 = await goal('sigB');
  ok(await throws(db, `INSERT INTO disputes(goal_id,reason,bond_amount,bond_tx_signature) VALUES ('${g2}','r',0.1,'bondA')`, '23505'), t('duplicate bond signature rejected'));
  ok(await throws(db, `INSERT INTO disputes(goal_id,reason,bond_amount,bond_tx_signature) VALUES ('${g2}','r',0.1,'sigA')`, '23505'), t('goal stake sig reused as dispute bond -> 23505'));
  ok(await throws(db, ins('bondA'), '23505'), t('dispute bond sig reused as goal stake -> 23505'));
  ok(!(await throws(db, `INSERT INTO disputes(goal_id,reason,bond_amount,bond_tx_signature) VALUES ('${g2}','r',0.1,'demo_tx_9')`)), t('demo_tx_% bond exempt'));

  // teams
  const tm = (await q(`INSERT INTO teams(name,owner_wallet,invite_code) VALUES ('T','W1','inv') RETURNING id`)).rows[0].id;
  const tg = (await q(`INSERT INTO team_goals(team_id,title,description,category,deadline,stake_per_member,created_by) VALUES ($1,'t','d','work',now(),1,'W1') RETURNING id`, [tm])).rows[0].id;
  await db.exec(`INSERT INTO goals${G},team_goal_id) VALUES ('WT','t','d',now(),1,'tsig1','work','${tg}')`);
  ok(await throws(db, `INSERT INTO goals${G},team_goal_id) VALUES ('WT','t','d',now(),1,'tsig2','work','${tg}')`, '23505'), t('teams unique (team_goal_id, wallet)'));

  // orgs
  const org = (await q(`INSERT INTO organizations(name,admin_wallets,invite_code) VALUES ('O',ARRAY['ADM'],'oi') RETURNING id`)).rows[0].id;
  await db.exec(`INSERT INTO org_pools(org_id,match_rate_bps,per_member_cap_lamports,window_start,window_end) VALUES ('${org}',5000,1000000000,now()-interval '10 days',now()+interval '10 days')`);
  await db.exec(`INSERT INTO org_members(org_id,wallet,joined_at) VALUES ('${org}','W1',now()-interval '9 days')`);
  const rem = (await q(`SELECT org_fund_pool($1,'ADM','fundA',5000000000) r`, [org])).rows[0].r;
  ok(String(rem) === '5000000000', t('org_fund_pool credits pool'));
  ok(await throws(db, `SELECT org_fund_pool('${org}','ADM','fundA',1)`, '23505'), t('org_fund_pool replay signature -> 23505'));
  const fund = (sig) => `INSERT INTO org_fundings(org_id,funder_wallet,amount_lamports,tx_signature) VALUES ('${org}','A',1,'${sig}')`;
  ok(await throws(db, fund('sigA'), '23505'), t('goal stake sig reused as org funding -> 23505'));
  ok(await throws(db, fund('bondA'), '23505'), t('dispute bond sig reused as org funding -> 23505'));
  ok(await throws(db, ins('fundA'), '23505'), t('org funding sig reused as goal stake -> 23505'));
  ok(await throws(db, `INSERT INTO disputes(goal_id,reason,bond_amount,bond_tx_signature) VALUES ('${g2}','r',0.1,'fundA')`, '23505'), t('org funding sig reused as dispute bond -> 23505'));
  await db.exec(`UPDATE goals SET status='completed' WHERE id='${g1}'`);
  const m = (await q(`SELECT org_reserve_match($1,'W1',$2,1000) r`, [org, g1])).rows[0].r;
  ok(!!m, t('org_reserve_match reserves for completed goal'));
  ok((await q(`SELECT org_reserve_match($1,'W1',$2,1000) r`, [org, g1])).rows[0].r === null, t('org_reserve_match second call on same goal -> NULL'));
  ok((await q(`SELECT org_release_match($1) r`, [m])).rows[0].r === true, t('org_release_match returns reservation'));
  ok((await q(`SELECT org_claim_withdrawal($1,'ADM') r`, [org])).rows[0].r.reason === 'window_open', t('org_claim_withdrawal refused while window open'));
  ok((await q(`SELECT org_claim_withdrawal($1,'NOPE') r`, [org])).rows[0].r.reason === 'not_admin', t('org_claim_withdrawal non-admin refused'));
  await db.exec(`UPDATE org_pools SET window_start = now()-interval '20 days', window_end = now()-interval '1 second' WHERE org_id='${org}'`);
  await db.exec(`UPDATE goals SET status='completed' WHERE status IN ('active','disputed','rejected_appealable')`);
  const c = (await q(`SELECT org_claim_withdrawal($1,'ADM') r`, [org])).rows[0].r;
  ok(c.ok === true, t('org_claim_withdrawal succeeds after window: ' + JSON.stringify(c)));
  ok(c.ok && (await q(`SELECT org_release_withdrawal($1) r`, [c.id])).rows[0].r === true, t('org_release_withdrawal restores'));

  // push / reminders
  await db.exec(`INSERT INTO push_tokens(wallet_address,expo_token,platform) VALUES ('W','tok','ios')`);
  ok(await throws(db, `INSERT INTO push_tokens(wallet_address,expo_token,platform) VALUES ('W2','tok','ios')`, '23505'), t('push_tokens expo_token unique'));
  ok(await throws(db, `INSERT INTO push_tokens(wallet_address,expo_token,platform) VALUES ('W2','tok2','web')`, '23514'), t('push_tokens platform check'));
  await db.exec(`INSERT INTO deadline_reminders_sent(goal_id,window_key) VALUES ('${g1}','24h')`);
  ok(await throws(db, `INSERT INTO deadline_reminders_sent(goal_id,window_key) VALUES ('${g1}','24h')`, '23505'), t('deadline_reminders_sent unique (goal_id,window_key)'));

  // RLS / policies
  const rls = (await q(`SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r'`)).rows;
  ok(rls.every((r) => r.relrowsecurity), t('RLS enabled on every public table'));
  const pol = (await q(`SELECT tablename, policyname, roles::text roles, cmd FROM pg_policies WHERE schemaname='public'`)).rows;
  const open = pol.filter((p) => /public|anon|authenticated/.test(p.roles));
  ok(open.length === 0, t('no policy grants public/anon/authenticated access: ' + open.map((p) => p.tablename).join(',')));
  const fnAcl = (await q(`SELECT proname, has_function_privilege('anon', oid, 'EXECUTE') a, has_function_privilege('authenticated', oid, 'EXECUTE') b, has_function_privilege('service_role', oid, 'EXECUTE') s FROM pg_proc WHERE proname IN ('org_fund_pool','org_reserve_match','org_release_match','org_claim_withdrawal','org_release_withdrawal') AND pronamespace='public'::regnamespace`)).rows;
  ok(fnAcl.length === 5 && fnAcl.every((f) => !f.a && !f.b && f.s), t('org_* RPCs executable only by service_role'));
  await db.close();
}
for (const [n, o] of Object.entries(orders)) await behaviour(n, o);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
