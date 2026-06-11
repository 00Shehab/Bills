// إعدادات النظام — تُقرأ من متغيرات البيئة (.env محليًا أو من المنصة عند النشر)
export const CONFIG = {
  PORT: parseInt(process.env.PORT || '8765', 10),
  // رابط قاعدة بيانات PostgreSQL السحابية (يُقرأ من البيئة فقط — لا يُكتب في الكود)
  DATABASE_URL: process.env.DATABASE_URL || '',
  USER_PASSWORD: process.env.USER_PASSWORD || 'station2026',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin-2026-secret',
  SESSION_SECRET: process.env.SESSION_SECRET || 'dev-insecure-secret-change-me',
  SETTLE_MS: parseInt(process.env.SETTLE_MS || '2500', 10),
  // المستخدمون المعتمدون (هوية تشغيل لا مصادقة)
  USERS: ['المحاسب', 'إبراهيم عامر', 'هادي عامر'],
};
