export interface Env {
  DB: D1Database;
  JEV_API_KEY: string;
}

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`eval-worker tick cron="${controller.cron}"`);
  },
};
