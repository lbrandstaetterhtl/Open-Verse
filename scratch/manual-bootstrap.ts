import { analyticsService } from "../server/services/analytics-service";
import { subDays } from "date-fns";

async function run() {
  console.log("Starting manual bootstrap...");
  for (let i = 7; i >= 0; i--) {
    const targetDate = subDays(new Date(), i);
    console.log(`Computing for ${targetDate.toISOString()}...`);
    try {
      await analyticsService.computeDailySnapshot(targetDate);
    } catch (e) {
      console.error(`Failed at day -${i}:`, e);
    }
  }
  process.exit(0);
}

run();
