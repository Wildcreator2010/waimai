/**
 * e2e 环境变量。必须在 AppModule 加载前生效，因此放在 jest setupFiles 里。
 * 数据库需先启动：docker compose -f deploy/docker-compose.dev.yml up -d
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://meal:meal@127.0.0.1:5433/meal_test';
process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-characters-long';
process.env.JWT_ACCESS_TTL_SECONDS = '900';
process.env.REFRESH_TTL_DAYS = '30';
process.env.MEMBER_TOKEN_ENC_KEY = Buffer.alloc(32, 3).toString('base64');
process.env.APP_BASE_URL = 'http://127.0.0.1:5173';
process.env.MAIL_DRY_RUN = 'true';
process.env.ALIYUN_DRY_RUN = 'true';
process.env.LOCKER_MOCK = 'true';
process.env.MOCK_ARRIVAL_AFTER = '2';
process.env.BOOTSTRAP_SETUP_CODE = 'TEST-CODE';
// e2e 里关掉人机验证（CaptchaService 另有单测覆盖）；线上默认 builtin
process.env.CAPTCHA_PROVIDER = 'off';
process.env.TZ = 'Asia/Shanghai';
