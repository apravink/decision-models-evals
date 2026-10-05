import type { Env } from "./env";
import { runTick } from "./tick";

export default {
  async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log(`eval-worker tick cron="${controller.cron}"`);
    await runTick(env);
  },
};
