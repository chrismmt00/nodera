const path = require("node:path");
const { loadEnv } = require("@nodera/shared");

loadEnv(path.join(__dirname, ".."));

const { prisma, buildCustomerOnboardingReport } = require("@nodera/db");

async function main() {
  try {
    const report = await buildCustomerOnboardingReport(prisma);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch {
    console.error("Could not build the onboarding report. Check database configuration and availability.");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
