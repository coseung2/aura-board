// Run through Infisical dev. Dry-run by default; --apply enables scoped repair.
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const tables = ['GameResult', 'PlaySession', 'PlayParticipant', 'PlayRequestReceipt', 'PlayOutbox', 'KordleGame', 'KordleWord', 'KordlePuzzle', 'KordleAttempt', 'KordleGuess', 'SpeedGameRun', 'SpeedGameRunGroup', 'SpeedGameRunParticipant', 'SpeedGameRunRound', 'SpeedGameRunAnswer'];
async function main() {
  await db.$transaction(async tx => {
    const [identity] = await tx.$queryRawUnsafe('SELECT current_database() AS database, current_user AS role');
    if (identity.database !== 'aura_dev' || identity.role !== 'aura_dev') throw new Error('Requires aura_dev database and server role');
    const memberships = await tx.$queryRawUnsafe("SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'authenticator') AND pg_has_role(oid, current_user, 'MEMBER')");
    if (memberships.length) throw new Error('Browser roles must not inherit the server role');
    for (const table of tables) {
      const [state] = await tx.$queryRawUnsafe('SELECT tableowner FROM pg_tables WHERE schemaname=$1 AND tablename=$2', 'public', table);
      if (state?.tableowner !== identity.role) throw new Error(`Unexpected owner: ${table}`);
      const policies = await tx.$queryRawUnsafe('SELECT policyname, roles, qual, with_check FROM pg_policies WHERE schemaname=$1 AND tablename=$2 AND policyname=$3', 'public', table, 'aura_dev_game_server');
      if (policies.length) {
        const p = policies[0];
        if (p.roles.length !== 1 || p.roles[0] !== 'aura_dev' || p.qual !== 'true' || p.with_check !== 'true') throw new Error(`Unexpected policy: ${table}`);
      } else if (process.argv.includes('--apply')) {
        await tx.$executeRawUnsafe(`CREATE POLICY aura_dev_game_server ON public."${table}" FOR ALL TO aura_dev USING (true) WITH CHECK (true)`);
      }
      console.log(`${table}: ${policies.length ? 'verified' : process.argv.includes('--apply') ? 'repaired' : 'policy missing'}`);
    }
  }, { timeout: 30000 });
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
