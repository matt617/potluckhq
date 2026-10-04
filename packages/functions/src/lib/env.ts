/** Environment accessors. Read lazily so tests can set process.env before use. */
const e = (k: string, d = '') => process.env[k] ?? d;

export const env = {
  get stage() { return e('STAGE', 'dev'); },
  get table() { return e('TABLE_NAME'); },
  get mediaBucket() { return e('MEDIA_BUCKET'); },
  get ingestQueueUrl() { return e('INGEST_QUEUE_URL'); },
  get paramPrefix() { return e('PARAM_PREFIX', '/potluck/dev/'); },
  get appUrl() { return e('APP_URL', 'http://localhost:5173').replace(/\/$/, ''); },
  get geminiModel() { return e('GEMINI_MODEL', 'gemini-flash-lite-latest'); },
  get smsEnabled() { return e('SMS_ENABLED') === 'true'; },
  get smsOriginationNumber() { return e('SMS_ORIGINATION_NUMBER'); },
  get ffmpegDir() { return e('FFMPEG_DIR', '/opt/bin'); },
  get ytdlpPath() { return e('YTDLP_PATH', '/opt/bin/yt-dlp'); },
  get sesFromEmail() { return e('SES_FROM_EMAIL'); },
};
