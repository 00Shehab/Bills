# نظام المحطة المالي — حاوية تشغيل (تعمل على أي استضافة تدعم Docker/Node)
# لا يوجد أي خطوة بناء (no build step) ولا ملفات TypeScript في الكود — JavaScript خالص.
FROM node:24-alpine

WORKDIR /app

# تثبيت الاعتمادات داخل الحاوية (لا تُرفع node_modules من جهازك)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# نسخ كود المشروع (راجع .dockerignore لمعرفة المستبعَد)
COPY . .

# بيانات SQLite + النسخ الاحتياطية تُحفظ هنا — اربط Volume على هذا المسار للاحتفاظ بها
VOLUME /app/data

ENV NODE_ENV=production
ENV PORT=8765
EXPOSE 8765

CMD ["npm", "start"]
