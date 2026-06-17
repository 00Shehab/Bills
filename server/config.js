// إعدادات النظام — تُقرأ من متغيرات البيئة (.env محليًا أو من المنصة عند النشر)
// ⚠️  المصادقة أصبحت مسؤولية بوابة Python — لا كلمات مرور هنا.
export const CONFIG = {
  PORT: parseInt(process.env.PORT || '8765', 10),
  // رابط قاعدة بيانات PostgreSQL المحلي
  DATABASE_URL: process.env.DATABASE_URL || '',
  // SESSION_SECRET لم يعد ضروريًا للمصادقة (البوابة تتولى ذلك)،
  // لكنه قد يُستخدم لتوقيع كوكيز الواجهة الداخلية إن أُعيد تفعيلها.
  SESSION_SECRET: process.env.SESSION_SECRET || 'dev-insecure-secret-change-me',
  SETTLE_MS: parseInt(process.env.SETTLE_MS || '2500', 10),
};